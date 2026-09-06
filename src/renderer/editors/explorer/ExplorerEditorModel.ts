import { TComponentState, TOneState } from "../../core/state/state";
import { app } from "../../api/app";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence";
import type { ILink, ITreeProvider, ITreeProviderItem } from "../../api/types/io.tree";
import type { TreeProviderViewSavedState } from "../../components/tree-provider";
import type { FileSearchState } from "../../components/file-search";
import type { NavigationState } from "../base/navigation-state";
import type { IPageHost } from "../../api/pages/IPageHost";
import { fpBasename, fpDirname } from "../../core/utils/file-path";
import { createFolderIconElement } from "../../components/icons/icon-elements";
import { createLinkData } from "../../../shared/link-data";
import { encodeCategoryLink } from "../../content/tree-providers/tree-provider-link";
import { encodeGitTreeLink } from "../../content/git-tree-link";
import { encodeMnemeFolderLink } from "../../content/mneme-folder-link";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { openToolset as openToolsetLink } from "../../content/persephone-toolset-link";
import { boardTrust } from "../../api/board-trust";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { readToolsManifest } from "../../api/tools/tools-manifest";
import { showRegisterToolsetDialog } from "../../ui/dialogs/RegisterToolsetDialog";

export type ExplorerBoardsTab = "boards" | "tools";

export interface ExplorerEditorState extends EditorStateBase {
    type: "fileExplorer";
    /** Root path for the file tree. */
    rootPath: string;
    /** EX3 (c) — typed persistence extras replacing legacy `_treeState` /
     *  `_selectedHref` / `_searchState` underscore-prefixed keys. The
     *  underscore form is still read for backward compat in `applyRestoreData`
     *. */
    treeState?: TreeProviderViewSavedState;
    selectedHref?: string | null;
    searchState?: FileSearchState;
    /** Whether the Boards sibling panel is open (EPIC-036 / US-761). Persisted so the panel
     *  survives restart and page-move-between-windows; Search has no analogue because its
     *  visibility is derived from `searchState`. */
    boardsOpen?: boolean;
}

export function getDefaultExplorerEditorState(): ExplorerEditorState {
    return {
        id: crypto.randomUUID(),
        title: "Explorer",
        modified: false,
        type: "fileExplorer",
        rootPath: "",
    };
}

export class ExplorerEditor extends EditorModel<ExplorerEditorState> {
    /** Editor identity. Deliberately equal to the secondary-view
     *  registration id so persistence (`EditorDescriptor.editorId`) reads the
     *  same string as the panel-component lookup. Explorer is NOT in
     *  `editorRegistry`. */
    readonly editorId = "explorer";

    /** File tree data source. Created lazily by the view layer
     *  (`ExplorerSecondaryView.ts`); reads see whatever the view set.
     *  EX-IMPL5 — public field, NOT a getter (Link uses a getter because its
     *  tree provider is constructible without view-supplied configuration;
     *  Explorer's `FileTreeProvider` needs the reactive rootPath). */
    treeProvider: ITreeProvider | null = null;

    /** Tree expansion state — persisted via `ExplorerEditorState.treeState`. */
    treeState: TreeProviderViewSavedState | undefined = undefined;

    /** Selection state — reactive. The Explorer view subscribes for highlight. */
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });

    /** Monotonic reveal command token consumed by the secondary view. The view calls
     *  `revealItem(selectedHref)` after the panel is available. */
    readonly revealVersion = new TOneState({ version: 0 });

    /** Model-owned Boards/Tools segment, shared by the panel and panel facade. */
    readonly boardsTabState = new TOneState<{ value: ExplorerBoardsTab }>({ value: "boards" });

    /** Search panel state. When defined, the search panel is visible. */
    searchState: FileSearchState | undefined = undefined;

    constructor(state: TComponentState<ExplorerEditorState>) {
        super(state);
        this.noLanguage = true;
        this.skipSave = true;
        // Folder glyph for the "Explorer" sidebar panel — the same icon the
        // explorer tree shows for folders. Explorer is sidebar-only, so this
        // essentially only ever appears on the panel header, not a page tab.
        this.getIconElement = () => createFolderIconElement();
    }

    get rootPath(): string {
        return this.state.get().rootPath;
    }

    async listItems(): Promise<ILink[] | undefined> {
        if (!this.page || !this.treeProvider || !this.rootPath) return undefined;
        const items = await this.treeProvider.list(this.rootPath);
        return items.slice(0, 200).map(item => ({ ...item, tags: [...item.tags] }));
    }

    // ── Selection ────────────────────────────────────────────────────

    setSelectedHref(href: string | null): void {
        this.selectionState.update((s) => { s.selectedHref = href; });
    }

    async openItem(item: ITreeProviderItem): Promise<void> {
        if (!this.page || !this.treeProvider) throw new Error("Explorer action unavailable: no provider is attached.");
        const current = this.selectionState.get().selectedHref;
        if (current?.toLowerCase() === item.href.toLowerCase()) return;
        this.setSelectedHref(item.href);
        const url = item.target === "git-tree" || item.target === "mneme-root"
            ? encodeCategoryLink({ type: "file", url: this.rootPath, category: item.href })
            : this.treeProvider.getNavigationUrl(item);
        await app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId: this.page.id,
            sourceId: "explorer",
        }));
    }

    revealItem(href: string): void {
        if (!this.page) throw new Error("Explorer reveal unavailable: no page host attached.");
        if (!this.secondaryView?.includes("explorer")) throw new Error("Explorer reveal unavailable: the Explorer panel is not present.");
        if (this.page.activePanelId !== "explorer") throw new Error("Explorer reveal unavailable: the Explorer panel is not active.");
        if (!this.treeProvider) throw new Error("Explorer reveal unavailable: no provider is attached.");
        this.setSelectedHref(href);
        this.revealVersion.update((s) => { s.version++; });
    }

    // ── Tree state ───────────────────────────────────────────────────

    setTreeState(state: TreeProviderViewSavedState): void {
        this.treeState = state;
    }

    // ── Secondary-view composition ─────────────────────────────────────

    /** Canonical sidebar panel set for the Explorer-backed panels, always in display order:
     *  Explorer → Search (iff `searchState`) → Boards (iff `boardsOpen`). Drives every
     *  `secondaryView` assignment so Search and Boards compose instead of clobbering each other. */
    private composeSecondaryView(): string[] {
        const ids = ["explorer"];
        if (this.searchState) ids.push("search");
        if (this.state.get().boardsOpen) ids.push("boards");
        return ids;
    }

    // ── Search ───────────────────────────────────────────────────────

    openSearch(folder?: string): void {
        const rootPath = this.rootPath;
        const searchFolder = folder || rootPath;
        if (!this.searchState || (folder && this.searchState.searchFolder !== folder)) {
            this.searchState = {
                query: this.searchState?.query ?? "",
                includePattern: this.searchState?.includePattern ?? "",
                excludePattern: this.searchState?.excludePattern ?? "",
                showFilters: this.searchState?.showFilters ?? false,
                searchFolder,
                results: [],
                totalMatches: 0,
                totalFiles: 0,
            };
        }
        this.secondaryView = this.composeSecondaryView();
        this.page?.expandPanel("search");
    }

    closeSearch(): void {
        this.searchState = undefined;
        this.secondaryView = this.composeSecondaryView();
        this.page?.expandPanel("explorer");
    }

    setSearchState = (state: FileSearchState): void => {
        this.searchState = state;
    };

    async openSearchResult(path: string, lineNumber?: number): Promise<void> {
        if (!this.page) throw new Error("Search action unavailable: no page host attached.");
        this.setSelectedHref(path);
        await app.events.openRawLink.sendAsync(createLinkData(path, {
            pageId: this.page.id,
            ...(lineNumber ? {
                revealLine: lineNumber,
                highlightText: this.searchState?.query,
            } : undefined),
        }));
    }

    // ── Boards ─────────────────────────────────────────────────────────

    openBoards(): void {
        this.state.update((s) => { s.boardsOpen = true; });
        this.secondaryView = this.composeSecondaryView();
        this.page?.expandPanel("boards");
    }

    closeBoards(): void {
        this.state.update((s) => { s.boardsOpen = false; });
        this.secondaryView = this.composeSecondaryView();
        this.page?.expandPanel("explorer");
    }

    get boardsTab(): ExplorerBoardsTab { return this.boardsTabState.get().value; }

    setBoardsTab(value: ExplorerBoardsTab): void {
        this.boardsTabState.update((state) => { state.value = value; });
    }

    listBoards(): string[] {
        if (!this.rootPath) return [];
        const rootKey = this.rootPath.replace(/\\/g, "/").toLowerCase();
        return boardTrust.listPaths()
            .filter(path => {
                const key = path.replace(/\\/g, "/").toLowerCase();
                return key === rootKey || key.startsWith(rootKey + "/");
            })
            .slice();
    }

    listToolsets(): Array<{ root: string; name: string }> {
        if (!this.rootPath) return [];
        const rootKey = this.rootPath.replace(/\\/g, "/").toLowerCase();
        return registeredTools.toolsets
            .filter(toolset => {
                const key = toolset.root.replace(/\\/g, "/").toLowerCase();
                return key === rootKey || key.startsWith(rootKey + "/");
            })
            .map(toolset => ({ root: toolset.root, name: toolset.name }));
    }

    openBoard(root: string): void {
        const page = this.page;
        if (!page) throw new Error("Explorer action unavailable: no page host attached.");
        void app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root), {
            pageId: page.id,
            sourceId: "explorer",
            explorerRoot: this.rootPath,
        }));
    }

    async openToolset(root: string): Promise<void> {
        const page = this.page;
        if (!page) throw new Error("Explorer action unavailable: no page host attached.");
        await toolsTrust.load();
        if (!toolsTrust.isTrusted(root)) {
            const manifest = await readToolsManifest(root);
            const ok = await showRegisterToolsetDialog({
                toolsetName: manifest?.name ?? fpBasename(root),
                toolsetRoot: root,
                tools: (manifest?.tools ?? []).map(tool => ({ name: tool.name, description: tool.description })),
            });
            if (!ok) return;
            await toolsTrust.trust(root);
            await registeredTools.refresh();
        }
        openToolsetLink(root, { pageId: page.id, sourceId: "explorer" });
    }

    openGitTree(root: string): void {
        const page = this.page;
        if (!page) throw new Error("Explorer action unavailable: no page host attached.");
        void app.events.openRawLink.sendAsync(createLinkData(encodeGitTreeLink(root), {
            pageId: page.id,
            sourceId: "explorer",
        }));
    }

    openMneme(root: string): void {
        const page = this.page;
        if (!page) throw new Error("Explorer action unavailable: no page host attached.");
        void app.events.openRawLink.sendAsync(createLinkData(encodeMnemeFolderLink(root), {
            pageId: page.id,
            sourceId: "explorer",
        }));
    }

    // ── Root navigation ──────────────────────────────────────────────

    navigateUp(): void {
        const rootPath = this.rootPath;
        const parent = fpDirname(rootPath);
        if (parent === rootPath) return;
        this.treeState = undefined;
        this.state.update((s) => { s.rootPath = parent; });
    }

    makeRoot(newRoot: string): void {
        if (newRoot.toLowerCase() === this.rootPath.toLowerCase()) return;
        this.treeState = undefined;
        this.state.update((s) => { s.rootPath = newRoot; });
    }

    // ── Highlight + reveal ─────────────────────────────────────────

    /** Update selection and request reveal if the "explorer" panel is active. */
    private _selectAndReveal(href: string | null): void {
        this.selectionState.update((s) => { s.selectedHref = href; });
        if (href && this.page?.activePanelId === "explorer") {
            this.revealVersion.update((s) => { s.version++; });
        }
    }

    // ── Lifecycle hooks ───────────────────────────────────────────────

    /** Explorer ALWAYS survives navigation — it's a sidebar-only EditorModel.
     *  The base default clears `secondaryView` (which would trigger
     *  detach + dispose via the slice subscription); override to a no-op so
     *  Explorer stays attached when the main editor changes. */
    beforeNavigateAway(_newModel: EditorModel): void {
        // No-op: Explorer always stays.
    }

    /** React to main editor changes — highlight and reveal file if within root. */
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (!newMainEditor) {
            this._selectAndReveal(null);
            return;
        }
        // The navigated file's path. For wrapped editors (Monaco, Grid, …) the
        // path lives on the content host's state, not the editor's own state
        // (which is a fresh editor-shaped state) — fall back to the host, same
        // as EditorModel.getNavigationSourceId. Without the fallback `filePath`
        // is always undefined for file editors, so the tree never highlights or
        // reveals the navigated file.
        const filePath =
            (newMainEditor.state.get() as { filePath?: string }).filePath ??
            (newMainEditor.contentHost?.state.get() as { filePath?: string } | undefined)?.filePath;
        if (filePath && filePath.toLowerCase().startsWith(this.rootPath.toLowerCase())) {
            this._selectAndReveal(filePath);
        } else {
            this._selectAndReveal(null);
        }
    }

    /** React to panel expansion — reveal current file when "explorer" panel becomes active. */
    onPanelExpanded(panelId: string): void {
        if (panelId === "explorer") {
            const href = this.selectionState.get().selectedHref;
            if (href) {
                // The monotonic token is a reveal command consumed by the secondary view, whose
                // binding schedules the cancellable animation-frame reveal after the panel exists.
                this.revealVersion.update((s) => { s.version++; });
            }
        }
    }

    // ── Persistence ──────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                rootPath: this.rootPath,
                treeState: this.treeState,
                selectedHref: this.selectionState.get().selectedHref ?? undefined,
                searchState: this.searchState,
            } as unknown as Record<string, unknown>,
        };
    }

    applyRestoreData(data: RestoreData<ExplorerEditorState>): void {
        super.applyRestoreData(data);
        if (data.rootPath) {
            this.state.update((s) => { s.rootPath = data.rootPath; });
        }
        // EX3 (c) — typed extras (new format).
        if (data.treeState) this.treeState = data.treeState;
        if (data.selectedHref) this.selectionState.set({ selectedHref: data.selectedHref });
        if (data.searchState) this.searchState = data.searchState;
        const extra = data as Partial<ExplorerEditorState> & {
            _treeState?: TreeProviderViewSavedState;
            _selectedHref?: string;
            _searchState?: FileSearchState;
        };
        if (extra._treeState && !data.treeState) this.treeState = extra._treeState;
        if (extra._selectedHref && !data.selectedHref) {
            this.selectionState.set({ selectedHref: extra._selectedHref });
        }
        if (extra._searchState && !data.searchState) this.searchState = extra._searchState;
    }

    async restore(): Promise<void> {
        await super.restore();
        if (this.rootPath && this.page) {
            this.secondaryView = this.composeSecondaryView();
        }
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && this.rootPath && !this.secondaryView?.length) {
            this.secondaryView = this.composeSecondaryView();
        }
    }

    async dispose(): Promise<void> {
        this.treeProvider?.dispose?.();
        this.treeProvider = null;
        await super.dispose();
    }
}
