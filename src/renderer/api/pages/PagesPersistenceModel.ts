import type { PagesModel } from "./PagesModel";
import { IEditorState, LegacyPageDescriptor, LegacyWindowState } from "../../../shared/types";
import type {
    EditorDescriptor,
    PageDescriptor,
    WindowState,
} from "../../../shared/persistence-v4";
import { openFilesNameTemplate } from "../../../shared/constants";
import { parseObject } from "../../core/utils/parse-utils";
import { debounce } from "../../../shared/utils";
import { LegacyEditorAdapter, deriveEditorId } from "../../editors/base/v4";
import type { EditorModel as LegacyEditorModel } from "../../editors/base/EditorModel";
import { wrapLegacyForPage } from "./PagesLifecycleModel";
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

/** Per-page sidebar cache file shape (pre-EPIC-028, v3.x). */
interface PageSidebarSavedState {
    open: boolean;
    width: number;
    activePanel?: string;
    secondaryModelDescriptors?: { pageState: Partial<IEditorState> }[];
}

/**
 * PagesPersistenceModel — Load/save window state to storage.
 *
 * EPIC-028 / US-548: writes v4 (`schemaVersion: 4` + unified `editors[]` +
 * folded sidebar metadata). Reads v4 directly OR falls back to the v3 dual-read
 * path for one-shot upgrade of existing user data. US-559 deletes the v3 path.
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

        if (data.schemaVersion === 4) {
            await this.restoreV4(data as WindowState);
        } else {
            await this.restoreV3(data);
        }
    };

    /**
     * Restore a single page from a v4 PageDescriptor. Shared between bootstrap
     * restore (`restoreV4`), IPC `movePageIn`, and `duplicatePage` (walkthrough
     * 05 / M2 + walkthrough 04 / C5 / P5).
     *
     * EPIC-028: descriptors with a `host` field restore through the native v4
     * path (`editorRegistry.createEditor` → `applyRestoreData` → `restore`).
     * `host` is the reliable discriminator — every v4-native editor writes
     * `host: this._host?.getDescriptor()`, while `LegacyEditorAdapter`
     * explicitly writes `host: undefined`. Falling through on this means every
     * future per-editor migration is auto-included without touching this file.
     *
     * Legacy-shaped descriptors (no host field) take the LegacyEditorAdapter
     * path. Pre-migration sessions with an unsupported shape restore as legacy
     * adapter and rewrite as v4-native on the next save.
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
                    // EPIC-028 / US-567 — Explorer is v4-native but NOT in
                    // `editorRegistry`; construct directly. Match on both the
                    // new editorId discriminator ("explorer", post-US-567 saves)
                    // and the legacy state.type ("fileExplorer", pre-US-567
                    // saves where deriveEditorId fell back to "monaco" because
                    // Explorer had no legacy registry entry).
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
                    const legacyState = {
                        ...(d.state as Partial<IEditorState>),
                        id: d.id,
                    };
                    const legacy = await this.model.lifecycle.newEditorModelFromState(legacyState);
                    legacy.applyRestoreData(legacyState);
                    await legacy.restore();
                    return new LegacyEditorAdapter(legacy, d.editorId);
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
     * Pre-EPIC-028 (v3.x) restore path. Reads the flat `PageDescriptor.editor:
     * Partial<IEditorState>` shape AND the per-page sidebar cache files
     * (`<pageId>-nav-panel.txt`). Wraps every legacy editor in
     * `LegacyEditorAdapter` before attaching to the v4 PageModel.
     *
     * On first save after upgrade, persistence writes v4; existing sidebar
     * cache files orphan harmlessly (walkthrough 04 / P9 — accepted).
     * Retired in US-559.
     */
    private restoreV3 = async (
        data: { pages: LegacyPageDescriptor[]; groupings?: [string, string][]; activePageId?: string },
    ): Promise<void> => {
        // Detect pre-v3.0.1 flat format and skip.
        const isPreV3 =
            data.pages.length > 0 &&
            (data.pages[0] as unknown as { type?: string })?.type !== undefined &&
            !data.pages[0]?.editor?.type;

        if (isPreV3) return;

        const models: PageModel[] = [];

        for (const desc of data.pages) {
            const editorData = desc.editor;

            const page = new PageModel(desc.id);
            page.pinned = desc.pinned ?? false;

            try {
                if (editorData && Object.keys(editorData).length > 0) {
                    const legacy = await this.restoreLegacyEditor(editorData);
                    if (!legacy) continue;
                    // US-551 — auto-promote Monaco-targeted entries to native
                    // MonacoEditor so the next save writes the v4-native shape.
                    const editor = wrapLegacyForPage(legacy);
                    page.attach(editor);
                    page.setMainEditorId(editor.id);

                    if (desc.hasSidebar) {
                        await this.restoreSidebarLegacy(page, legacy);
                    }
                } else if (desc.hasSidebar) {
                    await this.restoreSidebarLegacy(page, null);
                } else {
                    continue;
                }
            } catch (err) {
                console.warn(`[restore-v3] page ${desc.id}:`, err);
                continue;
            }

            this.model.attachPage(page);
            models.push(page);
        }

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

    /** Build a single legacy editor from a v3 partial-IEditorState blob. */
    private restoreLegacyEditor = async (
        data: Partial<IEditorState>,
    ): Promise<LegacyEditorModel | null> => {
        try {
            const legacy = await this.model.lifecycle.newEditorModelFromState(data);
            legacy.applyRestoreData(data);
            await legacy.restore();
            return legacy;
        } catch (err) {
            console.warn(`[restore-v3] editor ${data.type ?? "?"}:`, err);
            return null;
        }
    };

    /** Restore sidebar state from `<pageId>-nav-panel.txt` cache file. */
    private restoreSidebarLegacy = async (
        page: PageModel,
        ownerLegacy: LegacyEditorModel | null,
    ): Promise<void> => {
        const data = await appFs.getCacheFile(page.id, "nav-panel");
        const saved = parseObject(data) as PageSidebarSavedState | undefined;
        if (!saved) return;

        const navModel = page.ensurePageNavigatorModel();
        navModel.setStateQuiet({
            open: saved.open ?? true,
            width: saved.width ?? 240,
        });

        // Migrate pre-v3 rootPath shape into an ExplorerEditorModel descriptor.
        const rawSaved = saved as PageSidebarSavedState & { rootPath?: string };
        const oldRootPath = rawSaved.rootPath;
        const descriptors: { pageState: Partial<IEditorState> }[] = [];
        if (
            oldRootPath &&
            !saved.secondaryModelDescriptors?.some(
                (d) => d.pageState.type === "fileExplorer",
            )
        ) {
            descriptors.push({
                pageState: {
                    id: crypto.randomUUID(),
                    type: "fileExplorer",
                    title: "Explorer",
                    modified: false,
                    rootPath: oldRootPath,
                } as Partial<IEditorState> & { rootPath?: string },
            });
        }
        if (saved.secondaryModelDescriptors?.length) {
            descriptors.push(...saved.secondaryModelDescriptors);
        }

        // Restore each secondary editor, wrapping in adapter.
        const restored: LegacyEditorAdapter[] = [];
        for (const desc of descriptors) {
            // Dedupe against the owner editor (Pattern B in v3 — same model
            // in both main and secondary).
            if (ownerLegacy && desc.pageState.id === ownerLegacy.state.get().id) {
                // Already attached as main; skip.
                continue;
            }
            try {
                // EPIC-028 / US-567 — Explorer is v4-native but NOT in
                // `editorRegistry`; construct directly without a
                // LegacyEditorAdapter wrap. Covers the pre-v3 rootPath
                // migration path (which synthesizes a `fileExplorer` descriptor
                // at line ~299) AND any v3 session that persisted Explorer in
                // the sidebar cache file.
                if (desc.pageState.type === "fileExplorer") {
                    const explorerState = new TComponentState({
                        ...getDefaultExplorerEditorState(),
                        ...(desc.pageState as Partial<ExplorerEditorState>),
                        id: desc.pageState.id ?? crypto.randomUUID(),
                    });
                    const explorer = new ExplorerEditor(explorerState);
                    explorer.applyRestoreData(desc.pageState as unknown as Parameters<typeof explorer.applyRestoreData>[0]);
                    await explorer.restore();
                    page.attach(explorer);
                    continue;
                }
                const legacy = await this.restoreLegacyEditor(desc.pageState);
                if (!legacy) continue;
                const adapter = new LegacyEditorAdapter(
                    legacy,
                    deriveEditorId(legacy.state.get()),
                );
                page.attach(adapter);
                restored.push(adapter);
            } catch (err) {
                console.warn(`[restore-v3] secondary editor:`, err);
            }
        }

        // Resolve activePanel. Built-ins apply immediately; non-builtin panels
        // are valid only if some adapter contributes them.
        const restoredPanel = saved.activePanel ?? "explorer";
        if (restoredPanel === "explorer" || restoredPanel === "search") {
            page.activePanel = restoredPanel;
        } else {
            const valid = restored.some((a) =>
                a.secondaryEditor?.includes(restoredPanel),
            );
            page.activePanel = valid ? restoredPanel : "explorer";
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
