import type { PagesModel } from "./PagesModel";
import { IEditorState } from "../../../shared/types";
import type {
    EditorDescriptor,
    PageDescriptor,
    WindowState,
} from "../../../shared/persistence-v4";
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
import { fs as appFs } from "../fs";
import { app } from "../app";
import { createLinkData } from "../../../shared/link-data";
import { PageModel } from "./PageModel";

/**
 * EPIC-028 / US-559 — v4-only persistence. The legacy `restoreV3` +
 * `restoreSidebarLegacy` + LegacyEditorAdapter fallback paths were deleted
 * with the strangler retirement. Pre-v4 session data is silently discarded
 * on first launch (C2 / C559-6).
 */

/**
 * EditorIds of v4-native NO-HOST editors that restore via
 * `editorRegistry.createEditor` + `Object.assign(state, d.state)` (no host
 * descriptor). v4-with-host editors take the `if (d.host)` branch; Explorer
 * is constructed directly (not in `editorRegistry`).
 */
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view",   // US-558
    "pdf-view",       // US-568
    "image-view",     // US-569
    "archive-view",   // US-570
    "video-view",     // US-571
    "settings-view",  // US-572
    "about-view",     // US-573
    "mcp-view",       // US-574
    "storybook-view", // US-575
    "category-view",  // US-576
]);

/**
 * PagesPersistenceModel — Load/save window state to storage.
 *
 * Writes v4 only (`schemaVersion: 4` + unified `editors[]` + folded sidebar
 * metadata). Reads v4 only — non-v4 data silently skipped at startup per
 * EPIC-028 C2 / US-559 C559-6.
 */
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
        );
        if (!data || !Array.isArray(data.pages)) return;
        // EPIC-028 / US-559 / C2 / C559-6 — silent detect-and-skip of
        // pre-v4 session data. Users with a v3 session see a fresh empty
        // window on first launch; orphan per-page cache files
        // (`<pageId>-nav-panel.txt`) are harmless leftovers.
        if (data.schemaVersion !== 4) return;
        await this.restoreV4(data as WindowState);
    };

    /**
     * Restore a single page from a v4 PageDescriptor. Shared between bootstrap
     * restore (`restoreV4`), IPC `movePageIn`, and `duplicatePage`.
     *
     * Three dispatch branches, in order:
     *   1. `d.host` present  → v4 host-bearing editor (`createEditor` +
     *      `applyRestoreData` + `restore`); host descriptor reconstitutes
     *      the `TextFileModel` content host.
     *   2. Explorer special-case (Explorer is v4-native but NOT in
     *      `editorRegistry`).
     *   3. No-host v4 editor (in `V4_NO_HOST_EDITOR_IDS`) — construct via
     *      v4 registry + seed state from descriptor.
     *
     * Anything else skipped with a warning — descriptors not matching any
     * branch are unrecognized post-strangler data.
     */
    restorePage = async (desc: PageDescriptor): Promise<PageModel | null> => {
        const page = new PageModel(desc.id);
        page.pinned = desc.pinned;

        const editors = await Promise.all(
            desc.editors.map(async (d) => {
                try {
                    if (d.host) {
                        const { editorRegistry: v4Registry } = await import(
                            "../../editors/base/v4"
                        );
                        const editor = await v4Registry.createEditor(d.editorId, d.id);
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
                    if (V4_NO_HOST_EDITOR_IDS.has(d.editorId)) {
                        const { editorRegistry: v4Registry } = await import(
                            "../../editors/base/v4"
                        );
                        const editor = await v4Registry.createEditor(d.editorId, d.id);
                        editor.state.update((s) => {
                            Object.assign(s as object, d.state);
                            (s as { id: string }).id = d.id;
                        });
                        editor.applyRestoreData(
                            d.state as unknown as Parameters<typeof editor.applyRestoreData>[0],
                        );
                        await editor.restore();
                        return editor;
                    }
                    console.warn(
                        `[restore] unrecognized editor descriptor for "${d.editorId}" in page ${desc.id}: ` +
                        `no host field, not in V4_NO_HOST_EDITOR_IDS, not Explorer.`,
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
            const nav = page.ensurePageNavigatorModel();
            nav.setStateQuiet({
                open: desc.sidebar.open,
                width: desc.sidebar.width,
            });
            const panel = desc.sidebar.activePanel;
            const valid =
                panel === "explorer" ||
                panel === "search" ||
                page.editors.some((e) => e.secondaryEditor?.includes(panel));
            page.activePanel = valid ? panel : "explorer";
        }

        if (page.editors.length === 0 && !desc.sidebar) return null;
        return page;
    };

    private restoreV4 = async (data: WindowState): Promise<void> => {
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
        api.setCanQuit(true);
    };
}

/**
 * Build a fresh `EditorDescriptor` with a new instance id. Used by
 * `duplicatePage` (walkthrough 05 / M2's rewrite) — each duplicated editor
 * needs its own cache-file keyspace.
 */
export function withFreshEditorId(desc: EditorDescriptor): EditorDescriptor {
    return { ...desc, id: crypto.randomUUID() };
}

// Re-export IEditorState so existing barrel-importers stay green.
export type { IEditorState };
