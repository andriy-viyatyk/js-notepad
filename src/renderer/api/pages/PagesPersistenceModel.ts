import type { PagesModel } from "./PagesModel";
import { IEditorState } from "../../../shared/types";
import type {
    PageDescriptor,
    WindowState,
} from "../../../shared/persistence";
import { openFilesNameTemplate } from "../../../shared/constants";
import { parseObject } from "../../core/utils/parse-utils";
import { debounce } from "../../../shared/utils";
import {
    ExplorerEditor,
    getDefaultExplorerEditorState,
    type ExplorerEditorState,
} from "../../editors/explorer";
import { TComponentState } from "../../core/state/state";
import { api } from "../../../ipc/renderer/api";
import { signalReadyToQuit } from "../window";
import { fs as appFs } from "../fs";
import { app } from "../app";
import { createLinkData } from "../../../shared/link-data";
import { parsePanelKey } from "../../ui/secondary-views/panel-key";
import type { BoardEditorState } from "../../editors/board";
import { PageModel } from "./PageModel";

/**
 * EditorIds of NO-HOST editors that restore via
 * `editorRegistry.createEditor` + `Object.assign(state, d.state)` (no host
 * descriptor). Editors with a host take the `if (d.host)` branch; Explorer
 * is constructed directly (not in `editorRegistry`).
 */
const NO_HOST_EDITOR_IDS = new Set([
    "browser-view",       "image-view",       "archive-view",       "video-view",         "settings-view",      "about-view",         "mcp-view",           "mneme-config",       "mneme-root",         "storybook-view",     "category-view",      "git-tree",           "board-view",         "toolset-view",       "tools-hub-view",  ]);

export class PagesPersistenceModel {
    constructor(private model: PagesModel) {}

    saveState = async (): Promise<void> => {
        const { pages, leftRight } = this.model.state.get();
        const pageDescriptors: PageDescriptor[] = pages.map((p) => p.getDescriptor());
        const storedState: WindowState = {
            schemaVersion: 4,
            pages: pageDescriptors,
            groupings: Array.from(leftRight.entries()),
            activePageId: this.model.query.activePage?.id,
        };

        await appFs.saveDataFile(
            openFilesNameTemplate,
            JSON.stringify(storedState, null, 4),
        );
    };

    saveStateDebounced = debounce(this.saveState, 500);

    restoreState = async () => {
        const data = parseObject(
            await appFs.getDataFile(openFilesNameTemplate),
        ) as Partial<WindowState> | undefined;
        if (!data || !Array.isArray(data.pages)) return;
        if (data.schemaVersion !== 4) return;
        await this.applyState(data as WindowState);
    };

    restorePage = async (desc: PageDescriptor): Promise<PageModel | null> => {
        const page = new PageModel(desc.id);
        page.pinned = desc.pinned;
        page.seedNavBack(desc.navBack);

        const editors = await Promise.all(
            desc.editors.map(async (d) => {
                try {
                    // A demoted busy Board persisted at shutdown must not resurrect
                    // (US-799): busy is transient (its processes died with the app),
                    // so a non-main board descriptor would restore as an invisible
                    // zombie handle. Boards restore only as the main editor.
                    if (d.editorId === "board-view" && d.id !== desc.mainEditorId) {
                        return null;
                    }
                    // Content-host board (EPIC-043): persisted `board-view` + a host
                    // descriptor. Rebuild the subclass, apply the board state (boardRoot /
                    // filePath live in `d.state`, NOT the host descriptor), reconstruct the
                    // host from `d.host`, then restore. MUST precede the generic `if (d.host)`
                    // branch, which would else build a plain BoardEditorModel that throws
                    // "legacy project-mode board editor" on restore.
                    if (d.editorId === "board-view" && d.host) {
                        const { getDefaultBoardEditorState } = await import(
                            "../../editors/board"
                        );
                        const { BoardContentEditorModel } = await import(
                            "../../editors/board/BoardContentEditorModel"
                        );
                        const model = new BoardContentEditorModel(
                            new TComponentState({
                                ...getDefaultBoardEditorState(),
                                ...(d.state as Partial<BoardEditorState>),
                                id: d.id,
                            }),
                        );
                        model.applyRestoreData(
                            d as unknown as Parameters<typeof model.applyRestoreData>[0],
                        );
                        await model.restore();
                        return model;
                    }
                    if (d.host) {
                        const { editorRegistry } = await import(
                            "../../editors/base"
                        );
                        const editor = await editorRegistry.createEditor(d.editorId, d.id);
                        editor.applyRestoreData(d as unknown as Parameters<typeof editor.applyRestoreData>[0]);
                        await editor.restore();
                        return editor;
                    }
                    if (
                        d.editorId === "explorer"
                        || (d.state as { type?: string }).type === "fileExplorer"
                    ) {
                        const explorerState = new TComponentState({
                            ...getDefaultExplorerEditorState(),
                            ...(d.state as Partial<ExplorerEditorState>),
                            id: d.id,
                        });
                        const explorer = new ExplorerEditor(explorerState);
                        explorer.applyRestoreData(d.state as unknown as Parameters<typeof explorer.applyRestoreData>[0]);
                        await explorer.restore();
                        return explorer;
                    }
                    if (NO_HOST_EDITOR_IDS.has(d.editorId)) {
                        const { editorRegistry } = await import(
                            "../../editors/base"
                        );
                        const editor = await editorRegistry.createEditor(d.editorId, d.id);
                        editor.state.update((s) => {
                            Object.assign(s as object, d.state);
                            // Guarantee a non-empty id. A blank id (from a
                            // previously-corrupted descriptor) breaks id-based
                            // dedup and lets duplicate editors/panels accumulate
                            // (EPIC-031 / US-616 regression fix).
                            (s as { id: string }).id =
                                d.id || (s as { id?: string }).id || crypto.randomUUID();
                        });
                        editor.applyRestoreData(
                            d.state as unknown as Parameters<typeof editor.applyRestoreData>[0],
                        );
                        await editor.restore();
                        return editor;
                    }
                    console.warn(
                        `[restore] unrecognized editor descriptor for "${d.editorId}" in page ${desc.id}: ` +
                        `no host field, not in NO_HOST_EDITOR_IDS, not Explorer.`,
                    );
                    return null;
                } catch (err) {
                    console.warn(
                        `[restore] editor ${d.editorId} in page ${desc.id}:`,
                        err,
                    );
                    return null;
                }
            }),
        );

        for (const editor of editors) {
            if (editor) page.attach(editor);
        }

        if (
            desc.mainEditorId &&
            page.editors.some((e) => e.id === desc.mainEditorId)
        ) {
            page.setMainEditorId(desc.mainEditorId);
        }

        if (desc.sidebar) {
            const nav = page.ensureSecondaryViewsModel();
            nav.setStateQuiet({
                open: desc.sidebar.open,
                width: desc.sidebar.width,
            });
            // `activePanel` may be composite (`${editorId}::${panelId}`, US-619)
            // or a bare seed/legacy id. Validate by the parsed panel id, and —
            // when composite — require the named editor to still exist.
            const panel = desc.sidebar.activePanel;
            const { editorId, panelId } = parsePanelKey(panel);
            const valid =
                panelId === "explorer" ||
                panelId === "search" ||
                (editorId
                    ? page.editors.some((e) => e.id === editorId && e.secondaryView?.includes(panelId))
                    : page.editors.some((e) => e.secondaryView?.includes(panelId)));
            page.activePanel = valid ? panel : "explorer";
        }

        if (page.editors.length === 0 && !desc.sidebar) return null;
        return page;
    };

    private applyState = async (data: WindowState): Promise<void> => {
        const results = await Promise.all(
            data.pages.map(async (d) => {
                try {
                    return await this.restorePage(d);
                } catch (err) {
                    console.warn(`[restore] page ${d.id}:`, err);
                    return null;
                }
            }),
        );

        const models: PageModel[] = results.filter(
            (p): p is PageModel => p !== null,
        );
        for (const p of models) this.model.attachPage(p);

        const activeModel = models.find((m) => m.id === data.activePageId);
        const orderedModels = activeModel
            ? [...models.filter((m) => m !== activeModel), activeModel]
            : models;
        this.model.state.update((s) => {
            s.pages = models;
            s.ordered = orderedModels;
        });

        if (data.groupings && Array.isArray(data.groupings)) {
            data.groupings.forEach((el) => {
                if (Array.isArray(el) && el.length === 2) {
                    this.model.layout.group(el[0], el[1]);
                }
            });
            this.model.layout.fixGrouping();
        }
    };

    /**
     * Initialize pages: restore from storage + handle CLI arguments.
     * Called from app.initPages() during bootstrap.
     */
    init = async () => {
        await this.restoreState();

        const fileToOpen = await api.getFileToOpen();
        if (fileToOpen) {
            await app.events.openRawLink.sendAsync(createLinkData(fileToOpen));
        }

        const urlToOpen = await api.getUrlToOpen();
        if (urlToOpen) {
            await this.model.lifecycle.handleExternalUrl(urlToOpen);
        }

        this.model.checkEmptyPage();
    };

    onAppQuit = async () => {
        await Promise.all(
            this.model.state.get().pages.map((page) => page.saveState()),
        );
        await this.saveState();
        signalReadyToQuit();
    };
}

// Re-export IEditorState so existing barrel-importers stay green.
export type { IEditorState };
