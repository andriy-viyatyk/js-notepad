import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase, type RestoreData } from "../base/EditorModel";
import { MemoryIcon } from "../../theme/icons";
import { MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import type { IPageHost } from "../../api/pages/IPageHost";
import type { ISubscriptionObject } from "../../api/types/events";
import type { EditorDescriptor } from "../../../shared/persistence";
import type { TreeProviderViewSavedState } from "../../components/tree-provider";
import { mnemeConnection } from "../../api/mneme-connection";
import { decodeMnemeFolderLink } from "../../content/mneme-folder-link";
import { parseToolResult } from "../mneme-config/mnemeTypes";
import { MnemeTreeProvider } from "../../content/tree-providers/MnemeTreeProvider";

/** Search mode passed to `search`. Hybrid (FTS + vector) is the default; it
 *  degrades to text until the embedding model is provisioned. */
export type MnemeSearchMode = "text" | "vector" | "hybrid";

/** One ranked `search` result. `uri` is a scheme-less `{root}/{path}` (e.g.
 *  "TestWiki/work/docker.md"); the markdown renderer prepends `mneme://` to build the
 *  document link. Results arrive already ranked — render in order. */
export interface WikiSearchHit {
    uri: string;
    title: string;
    tags: string[];
    snippet: string;
    score: number;
}

/** `search` structured result. `note` is set when vector/hybrid degraded to text. */
export interface WikiSearchResult {
    results: WikiSearchHit[];
    note?: string;
}

export interface MnemeRootEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "mnemeRootPage";
    /** Absolute folder of the Mneme root (the parent of the clicked `.mneme`). */
    rootFolder: string;
    /** Resolved Mneme root name (e.g. "TestWiki"). Empty until resolved. */
    rootName: string;
    /** True while resolving the root name from the sidecar. */
    resolving: boolean;
    /** Set when the root can't be resolved (not registered / not connected). */
    error?: string;

    // --- Sidebar tree (persisted across restart / cross-window) ---
    /** Tree expansion snapshot for the `mneme-tree` panel — re-applied after the
     *  root re-resolves on restore. @see TreeProviderViewSavedState */
    treeState?: TreeProviderViewSavedState;
    /** Selected file href in the tree — highlighted on restore. */
    selectedHref?: string;

    // --- Search (US-676) — all transient (skipSave); reset on restore. ---
    /** Current query text. */
    searchQuery: string;
    /** Selected search mode (default "hybrid"). */
    searchMode: MnemeSearchMode;
    /** True while a `search` call is in flight. */
    searching: boolean;
    /** Last result set (already ranked; render in order). */
    results: WikiSearchHit[];
    /** Degraded-mode note from the tool (e.g. "semantic search unavailable"). */
    searchNote?: string;
    /** Set when a search call fails / the connection is down. */
    searchError?: string;
    /** False until the first search runs — distinguishes the initial hint from "no results". */
    hasSearched: boolean;

    // --- Filters (US-678) — all transient; folded into search on the next run. ---
    /** Include tags — a result must carry all of these. */
    filterTags: string[];
    /** Exclude tags — a result must carry none of these. */
    filterExcludeTags: string[];
    /** Inclusive `created` lower bound, ISO `YYYY-MM-DD` or "" (unset). */
    dateFrom: string;
    /** Inclusive `created` upper bound, ISO `YYYY-MM-DD` or "" (unset). */
    dateTo: string;
    /** Tag vocabulary for this root (from `tags`) — feeds the tag pickers' autocomplete. */
    tagVocab: string[];
    /** Guards the one-shot lazy `tags` load (on first filter expand). */
    tagVocabLoaded: boolean;
}

/** Folder name (basename) of a root folder path, or "Mneme" when empty. */
function rootFolderName(rootFolder: string): string {
    return rootFolder.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Mneme";
}

/** Normalize a filesystem path for case-insensitive, separator-agnostic compare. */
function normPath(p: string): string {
    return p.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
}

export const getDefaultMnemeRootEditorState = (): MnemeRootEditorState => ({
    // Per-instance UUID — keys this editor in `page.editors[]`. Two roots open at
    // once are two distinct instances, each contributing its own `mneme-tree` panel.
    id: crypto.randomUUID(),
    title: "Mneme",
    modified: false,
    type: "mnemeRootPage",
    editor: "mneme-root",
    rootFolder: "",
    rootName: "",
    resolving: false,
    searchQuery: "",
    searchMode: "hybrid",
    searching: false,
    results: [],
    hasSearched: false,
    filterTags: [],
    filterExcludeTags: [],
    dateFrom: "",
    dateTo: "",
    tagVocab: [],
    tagVocabLoaded: false,
});

/**
 * Mneme root editor (EPIC-032 / US-663).
 *
 * Opened by clicking a `.mneme` folder in any file tree (mirrors `.git` → Git
 * Tree). The main view is a "Mneme" placeholder for now; the editor's value is
 * its **read-only file-tree secondary panel** (`mneme-tree`), driven by a
 * {@link MnemeTreeProvider} for the resolved root. Follows the Git Tree
 * "survive navigation, close only via the panel `x`" lifecycle, and is a
 * per-root navigation singleton so re-clicking the same `.mneme` reuses this
 * instance instead of stacking duplicate panels.
 */
export class MnemeRootEditorModel extends EditorModel<MnemeRootEditorState> {
    readonly editorId = "mneme-root";

    noLanguage = true;
    skipSave = true;
    showBackgroundOrnament = true;

    /** Tree provider for the resolved root — null until `resolveRoot` succeeds. */
    treeProvider: MnemeTreeProvider | null = null;

    /** Tree expansion snapshot (sidebar panel) — persisted via `state.treeState`,
     *  set by the panel view's `onStateChange`. Plain field (not reactive) to
     *  avoid re-render churn on every expand toggle. */
    treeState: TreeProviderViewSavedState | undefined = undefined;

    /** Connection-status subscription, so a late connection self-resolves. */
    private _statusSub: ISubscriptionObject | null = null;

    /** Tab/panel icon — the Mneme (Memory) glyph. */
    getIcon = (): ReactNode => createElement(MemoryIcon, { color: MEMORY_ICON_COLOR });

    /** Register the read-only "Wiki" tree panel when attached to a page
     *  (Pattern B — the editor is its own surviving secondary view). */
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && !this.secondaryView?.length) {
            this.secondaryView = ["mneme-tree"];
        }
    }

    /** Survive navigation (Pattern B): the base default would clear the panel,
     *  so override to a no-op. The sole removal path is the panel's "x". */
    beforeNavigateAway(): void {
        // Intentionally empty — survive unconditionally.
    }

    /** Per-page singleton: re-navigating to the SAME root's `.mneme` reuses this
     *  instance (promote back to main) rather than building a duplicate panel. A
     *  DIFFERENT root does not match → a second instance + a second panel. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "mneme-root") return false;
        const link = decodeMnemeFolderLink(filePath);
        return !!link && normPath(link.rootFolder) === normPath(this.state.get().rootFolder);
    }

    /** Manual close (the panel "x"): detach + dispose this editor only. */
    async requestClose(): Promise<void> {
        await this.page?.removeSecondaryView(this);
    }

    /** Seed rootFolder + provisional title from a decoded `mneme-folder://` link,
     *  then resolve the root name from the sidecar. */
    initFromRootFolder(rootFolder: string): void {
        this.state.update((s) => {
            s.rootFolder = rootFolder;
            s.title = rootFolderName(rootFolder);
            s.resolving = true;
        });
        this.ensureStatusSub();
        void this.resolveRoot();
    }

    /** Session-restore entry — rootFolder rides the persisted state. */
    restoreFromState(): void {
        this.ensureStatusSub();
        void this.resolveRoot();
    }

    /** Persistence restore (app restart + cross-window drag). The no-host restore
     *  path assigns the persisted state then calls `restore()`. Re-resolve from the
     *  sidecar: clear any stale persisted `rootName` so `resolveRoot()` runs (it
     *  short-circuits when `rootName` is already set) and rebuilds the tree
     *  provider. `ensureStatusSub` makes it self-heal if Mneme connects late. */
    async restore(): Promise<void> {
        if (!this.state.get().rootFolder) return;
        this.state.update((s) => { s.rootName = ""; });
        this.restoreFromState();
    }

    /** Panel view → model: store the tree expansion snapshot for persistence. */
    setTreeState(state: TreeProviderViewSavedState): void {
        this.treeState = state;
    }

    /** Panel view → model: the selected file href (persisted + drives highlight). */
    setSelectedHref(href: string | undefined): void {
        this.state.update((s) => { s.selectedHref = href; });
    }

    /** Inject the tree expansion snapshot (a plain field) into the persisted
     *  state alongside the reactive state (which already carries `selectedHref`). */
    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: { ...s, treeState: this.treeState } as unknown as Record<string, unknown>,
        };
    }

    applyRestoreData(data: RestoreData<MnemeRootEditorState>): void {
        super.applyRestoreData(data);
        if (data.treeState) this.treeState = data.treeState;
    }

    /** Subscribe once to connection status so a root opened while Mneme is down
     *  resolves automatically when the shared connection comes up. */
    private ensureStatusSub(): void {
        if (this._statusSub) return;
        this._statusSub = mnemeConnection.onStatusChange((status) => {
            if (status === "connected" && !this.state.get().rootName) void this.resolveRoot();
        });
    }

    /** Resolve the root name by matching `rootFolder` against the sidecar's
     *  registered roots (`list_roots`), then build the tree provider. */
    private async resolveRoot(): Promise<void> {
        const rootFolder = this.state.get().rootFolder;
        if (!rootFolder || this.state.get().rootName) return;

        const client = mnemeConnection.getClient();
        if (!client) {
            this.state.update((s) => { s.resolving = false; s.error = "Mneme is not connected."; });
            return;
        }

        this.state.update((s) => { s.resolving = true; s.error = undefined; });
        try {
            const result = await client.callTool(
                { name: "list_roots", arguments: {} },
                undefined,
                { timeout: 10_000 },
            );
            const roots = parseToolResult<{ roots: { name: string; folder: string }[] }>(result)?.roots ?? [];
            const target = normPath(rootFolder);
            const match = roots.find((r) => normPath(r.folder) === target);
            if (!match) {
                this.state.update((s) => { s.resolving = false; s.error = "Not a registered Mneme root."; });
                return;
            }
            this.treeProvider = new MnemeTreeProvider(match.name);
            this.state.update((s) => {
                s.resolving = false;
                s.error = undefined;
                s.rootName = match.name;
                s.title = match.name;
            });
        } catch {
            this.state.update((s) => { s.resolving = false; s.error = "Failed to reach Mneme."; });
        }
    }

    /** Update the query text (no auto-search — submit is explicit). */
    setQuery(query: string): void {
        this.state.update((s) => { s.searchQuery = query; });
    }

    /** Update the search mode; takes effect on the next `runSearch()`. */
    setMode(mode: MnemeSearchMode): void {
        this.state.update((s) => { s.searchMode = mode; });
    }

    /** Set the include-tags filter (applied on the next `runSearch()`). */
    setFilterTags(tags: string[]): void {
        this.state.update((s) => { s.filterTags = tags; });
    }

    /** Set the exclude-tags filter (applied on the next `runSearch()`). */
    setExcludeTags(tags: string[]): void {
        this.state.update((s) => { s.filterExcludeTags = tags; });
    }

    /** Set the inclusive `created` lower bound (ISO `YYYY-MM-DD`, or "" to clear). */
    setDateFrom(date: string): void {
        this.state.update((s) => { s.dateFrom = date; });
    }

    /** Set the inclusive `created` upper bound (ISO `YYYY-MM-DD`, or "" to clear). */
    setDateTo(date: string): void {
        this.state.update((s) => { s.dateTo = date; });
    }

    /** Clear all filters (tags + dates). Does not auto-search. */
    clearFilters(): void {
        this.state.update((s) => {
            s.filterTags = [];
            s.filterExcludeTags = [];
            s.dateFrom = "";
            s.dateTo = "";
        });
    }

    /** Lazily load this root's tag vocabulary (`tags`) for the filter pickers'
     *  autocomplete. One-shot; best-effort (a failed load leaves it retryable). */
    async loadTagVocab(): Promise<void> {
        const { rootName, tagVocabLoaded } = this.state.get();
        if (tagVocabLoaded || !rootName) return;
        const client = mnemeConnection.getClient();
        if (!client) return;
        try {
            const result = await client.callTool(
                { name: "tags", arguments: { subtree: rootName } },
                undefined,
                { timeout: 10_000 },
            );
            const data = parseToolResult<{ tags: { tag: string; count: number }[] }>(result);
            const vocab = (data?.tags ?? []).map((t) => t.tag);
            this.state.update((s) => { s.tagVocab = vocab; s.tagVocabLoaded = true; });
        } catch {
            // Best-effort: leave tagVocabLoaded false so a later expand can retry.
        }
    }

    /** Run a `search` scoped to this root and store the ranked results. */
    async runSearch(): Promise<void> {
        const { searchQuery, searchMode, rootName, filterTags, filterExcludeTags, dateFrom, dateTo } =
            this.state.get();
        const query = searchQuery.trim();
        if (!query || !rootName) return;

        const client = mnemeConnection.getClient();
        if (!client) {
            this.state.update((s) => {
                s.searching = false;
                s.hasSearched = true;
                s.results = [];
                s.searchNote = undefined;
                s.searchError = "Mneme is not connected.";
            });
            return;
        }

        // Build the payload, omitting empty filters so the tool gets a clean request.
        const args: Record<string, unknown> = { query, mode: searchMode, subtree: rootName, topK: 20 };
        if (filterTags.length) args.tags = filterTags;
        if (filterExcludeTags.length) args.excludeTags = filterExcludeTags;
        if (dateFrom || dateTo) args.dateRange = { from: dateFrom || null, to: dateTo || null };

        this.state.update((s) => { s.searching = true; s.searchError = undefined; });
        try {
            const result = await client.callTool(
                { name: "search", arguments: args },
                undefined,
                { timeout: 15_000 },
            );
            const data = parseToolResult<WikiSearchResult>(result);
            this.state.update((s) => {
                s.results = data?.results ?? [];
                s.searchNote = data?.note;
                s.hasSearched = true;
            });
        } catch {
            this.state.update((s) => {
                s.results = [];
                s.searchNote = undefined;
                s.searchError = "Search failed.";
                s.hasSearched = true;
            });
        } finally {
            this.state.update((s) => { s.searching = false; });
        }
    }

    async dispose(): Promise<void> {
        this._statusSub?.unsubscribe();
        this._statusSub = null;
        this.treeProvider?.dispose();
        this.treeProvider = null;
        // Do NOT dispose mnemeConnection — it is shared across the app.
        await super.dispose();
    }
}
