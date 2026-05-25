import { TComponentState, TOneState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence-v4";
import type { ITreeProvider } from "../../api/types/io.tree";
import type { TreeProviderViewSavedState } from "../../components/tree-provider";
import type { FileSearchState } from "../../components/file-search";
import type { NavigationState, PageModel } from "../../api/pages/PageModel";
import { fpDirname } from "../../core/utils/file-path";

/**
 * EPIC-028 / US-567 — native v4 Explorer editor. **First secondary-only
 * EditorModel migrated to v4 native** — not in `editorRegistry`. Second
 * consumer of `onMainEditorChanged` (LK8) but NOT `beforeNavigateAway` (LK7);
 * Explorer is sidebar-ONLY, not sidebar-OWNING-mainEditor.
 *
 * Design rationale: doc/tasks/US-567-explorer-editor-migration/README.md
 * (walkthrough 30 §3, EX1–EX10 RESOLVED; EX-IMPL1 amended EX5).
 */

export interface ExplorerEditorState extends EditorStateBase {
    type: "fileExplorer";
    /** Root path for the file tree. */
    rootPath: string;
    /** EX3 (c) — typed persistence extras replacing legacy `_treeState` /
     *  `_selectedHref` / `_searchState` underscore-prefixed keys. The
     *  underscore form is still read for backward compat in `applyRestoreData`
     *  (EX-IMPL9). */
    treeState?: TreeProviderViewSavedState;
    selectedHref?: string | null;
    searchState?: FileSearchState;
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

export class ExplorerEditor extends V4EditorModel<ExplorerEditorState> {
    /** v4 editor identity. Deliberately equal to the secondary-editor
     *  registration id so persistence (`EditorDescriptor.editorId`) reads the
     *  same string as the panel-component lookup. Explorer is NOT in
     *  `editorRegistry`. */
    readonly editorId = "explorer";

    /** File tree data source. Created lazily by the view layer
     *  (`ExplorerSecondaryEditor.tsx`); reads see whatever the view set.
     *  EX-IMPL5 — public field, NOT a getter (Link uses a getter because its
     *  tree provider is constructible without view-supplied configuration;
     *  Explorer's `FileTreeProvider` needs the reactive rootPath). */
    treeProvider: ITreeProvider | null = null;

    /** Tree expansion state — persisted via `ExplorerEditorState.treeState`. */
    treeState: TreeProviderViewSavedState | undefined = undefined;

    /** Selection state — reactive. The Explorer view subscribes for highlight. */
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });

    /** Reveal request — reactive counter. View calls `revealItem(selectedHref)`
     *  when this bumps. */
    readonly revealVersion = new TOneState({ version: 0 });

    /** Search panel state. When defined, the search panel is visible. */
    searchState: FileSearchState | undefined = undefined;

    constructor(state: TComponentState<ExplorerEditorState>) {
        super(state);
        this.noLanguage = true;
        this.skipSave = true;
    }

    get rootPath(): string {
        return this.state.get().rootPath;
    }

    // ── Selection ────────────────────────────────────────────────────

    setSelectedHref(href: string | null): void {
        this.selectionState.update((s) => { s.selectedHref = href; });
    }

    // ── Tree state ───────────────────────────────────────────────────

    setTreeState(state: TreeProviderViewSavedState): void {
        this.treeState = state;
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
        if (!this.secondaryEditor?.includes("search")) {
            this.secondaryEditor = ["explorer", "search"];
        }
        setTimeout(() => this.page?.expandPanel("search"), 0);
    }

    closeSearch(): void {
        this.searchState = undefined;
        if (this.secondaryEditor?.includes("search")) {
            this.secondaryEditor = ["explorer"];
        }
        setTimeout(() => this.page?.expandPanel("explorer"), 0);
    }

    setSearchState = (state: FileSearchState): void => {
        this.searchState = state;
    };

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
        if (href && this.page?.activePanel === "explorer") {
            this.revealVersion.update((s) => { s.version++; });
        }
    }

    // ── Lifecycle hooks ───────────────────────────────────────────────

    /** Explorer ALWAYS survives navigation — it's a sidebar-only EditorModel.
     *  The v4 base default clears `secondaryEditor` (which would trigger
     *  detach + dispose via the slice subscription); override to a no-op so
     *  Explorer stays attached when the main editor changes. **EX-IMPL1**
     *  amends walkthrough 30 §3 EX5 (a)'s "drop the override" claim — base
     *  default does NOT suffice. */
    beforeNavigateAway(_newModel: V4EditorModel): void {
        // No-op: Explorer always stays.
    }

    /** React to main editor changes — highlight and reveal file if within root. */
    onMainEditorChanged(newMainEditor: V4EditorModel | null): void {
        if (!newMainEditor) {
            this._selectAndReveal(null);
            return;
        }
        const filePath = (newMainEditor.state.get() as { filePath?: string }).filePath;
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
                setTimeout(() => this.revealVersion.update((s) => { s.version++; }), 0);
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
            this.state.update((s) => { s.rootPath = data.rootPath!; });
        }
        // EX3 (c) — typed extras (new format).
        if (data.treeState) this.treeState = data.treeState;
        if (data.selectedHref) this.selectionState.set({ selectedHref: data.selectedHref });
        if (data.searchState) this.searchState = data.searchState;
        // EX-IMPL9 — pre-EPIC-028 underscore-prefixed extras. Read for
        // backward compat; first save after upgrade writes the new shape.
        // Retire under US-559.
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
            this.secondaryEditor = this.searchState
                ? ["explorer", "search"]
                : ["explorer"];
        }
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        if (page && this.rootPath && !this.secondaryEditor?.length) {
            this.secondaryEditor = this.searchState
                ? ["explorer", "search"]
                : ["explorer"];
        }
    }

    async dispose(): Promise<void> {
        this.treeProvider?.dispose?.();
        this.treeProvider = null;
        await super.dispose();
    }
}
