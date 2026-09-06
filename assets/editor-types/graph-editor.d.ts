/**
 * IGraphEditor — graph query and analysis interface.
 *
 * Obtained via `page.editor`. Only available for text pages
 * with force-graph JSON content.
 *
 * Primarily designed for AI agent usage via MCP (execute_script).
 * Focuses on read/query operations — editing is done via `page.content` JSON.
 *
 * @example
 * const graph = page.editor;
 * const neighbors = graph.getNeighborIds("my-node");
 * const results = graph.search("auth");
 * graph.select(results.map(r => r.nodeId));
 */
export interface IGraphEditor {
    readonly id: "graph-view";
    readonly name: string;
    // ── Data Access ──────────────────────────────────────────────────

    /** All nodes (cleaned, no D3 runtime fields). */
    readonly nodes: IGraphNode[];

    /** All links as {source, target} ID pairs. */
    readonly links: Array<{ source: string; target: string }>;

    /** Total node count. */
    readonly nodeCount: number;

    /** Total link count. */
    readonly linkCount: number;

    /** Get a single node by ID, or undefined if not found. */
    getNode(id: string): IGraphNode | undefined;

    // ── Selection ────────────────────────────────────────────────────

    /** Currently selected node IDs. */
    readonly selectedIds: string[];

    /** Currently selected nodes (cleaned). */
    readonly selectedNodes: IGraphNode[];

    /** Select nodes by IDs (replaces current selection). Updates the UI. */
    select(ids: string[]): void;

    /** Add nodes to current selection. Updates the UI. */
    addToSelection(ids: string[]): void;

    /** Clear selection. Updates the UI. */
    clearSelection(): void;

    // ── Relationships ────────────────────────────────────────────────

    /**
     * Get direct neighbor IDs from real data links (excludes group membership).
     * Shows the "logical" graph structure regardless of grouping state.
     */
    getNeighborIds(nodeId: string): string[];

    /**
     * Get visual neighbor IDs (what user sees in the rendered graph).
     * When grouping is enabled, links may route through group nodes.
     * When grouping is disabled, same as getNeighborIds().
     */
    getVisualNeighborIds(nodeId: string): string[];

    /** Get group ID that a node belongs to, or undefined. */
    getGroupOf(nodeId: string): string | undefined;

    /** Get direct member IDs of a group node. */
    getGroupMembers(groupId: string): string[];

    /** Get all member IDs recursively (includes sub-group members). */
    getGroupMembersDeep(groupId: string): string[];

    /** Get the group chain from a node to the top-level group: [immediateGroup, parentGroup, ...]. */
    getGroupChain(nodeId: string): string[];

    /** Whether a node is a group node. */
    isGroup(nodeId: string): boolean;

    // ── Search ───────────────────────────────────────────────────────

    /**
     * Search nodes by query string (same multi-word AND logic as UI search).
     * Does NOT affect the UI — purely returns results.
     * Searches node labels and all custom properties.
     * @param query - Search query (multi-word AND)
     * @param includeHidden - Include nodes hidden by visibility filter (default: true)
     */
    search(query: string, includeHidden?: boolean): IGraphSearchResult[];

    // ── Traversal ────────────────────────────────────────────────────

    /**
     * BFS traversal from a starting node. Returns nodes in BFS order
     * with their depth from the start.
     * @param startId - Starting node ID
     * @param maxDepth - Optional max traversal depth
     * @param visual - If true, follow visual links (processed); if false (default), follow real data links
     */
    bfs(startId: string, maxDepth?: number, visual?: boolean): Array<{ id: string; depth: number }>;

    // ── Analysis ─────────────────────────────────────────────────────

    /**
     * Find connected components (disconnected subgraphs).
     * Returns components sorted by size (largest first).
     * Each component includes `rootId` if the graph's root node belongs to it.
     */
    getComponents(): IGraphComponent[];

    // ── Options ──────────────────────────────────────────────────────

    /** Current root node ID, or empty string. */
    readonly rootNodeId: string;

    /** Whether grouping is currently enabled. */
    readonly groupingEnabled: boolean;

    /** Whether graph content is currently being parsed; undefined while detached. */
    readonly loading: boolean | undefined;

    /** Parse error, or an empty string when attached and error-free; undefined while detached. */
    readonly error: string | undefined;

    /** Whether the attached, settled graph has no nodes; undefined before content settles. */
    readonly isEmpty: boolean | undefined;

    /** Whether source data contains group nodes; undefined before source data is available. */
    readonly hasGroups: boolean | undefined;

    /** Whether the loaded graph has an active visibility filter; undefined before source data is available. */
    readonly hasVisibilityFilter: boolean | undefined;

    /** The graph footer's visible/total node count; undefined before parsing settles. */
    readonly recordsCount: string | undefined;

    /** Total source node count; undefined before source data is available. */
    readonly totalNodeCount: number | undefined;

    /** Current UI search query, or undefined while detached. */
    readonly searchQuery: string | undefined;

    /** Current UI search counts, or null when no search is active. */
    readonly searchInfo: IGraphSearchInfo | null | undefined;

    /** Current UI search result rows, or null when no results are available. */
    readonly searchResults: IGraphSearchResult[] | null | undefined;

    /** Current force-tuning values; undefined before source data is available. */
    readonly forceParams: IGraphForceParams | undefined;

    /** Current persisted expansion options; undefined before source data is available. */
    readonly expansionOptions: IGraphExpansionOptions | undefined;

    /** Rebuild the graph view from its current root and visibility state. */
    resetView(): void;

    /** Reset the graph's visibility filter. */
    resetVisibility(): void;

    /** Reveal all graph nodes. */
    expandAll(): void;

    /** Toggle group-node rendering. */
    toggleGrouping(): void;

    /** Set the visible graph search query and update its results. */
    setSearchQuery(query: string): void;

    /** Reveal nodes hidden by the current search visibility filter. */
    revealHiddenMatches(): void;

    /** Reveal a hidden node and select it. */
    revealAndSelectNode(nodeId: string): void;

    /** Reveal and add current search results to the selection. */
    selectSearchResults(): void;

    /** Update and persist force-tuning values. */
    updateForceParams(params: Partial<IGraphForceParams>): void;

    /** Restore and persist default force-tuning values. */
    resetForceParams(): void;

    /** Update and persist expansion settings; changes apply when the file is reopened. */
    updateExpansionOptions(patch: Partial<Pick<IGraphExpansionOptions, "expandDepth" | "maxVisible">>): void;

    /** Open the rendered graph image in a new Drawing Editor page. */
    openInDrawingEditor(): Promise<void>;

    /** Copy the rendered graph image as a PNG to the clipboard. */
    copyImageToClipboard(): Promise<void>;
}

/** A graph node with core properties and optional custom properties. */
export interface IGraphNode {
    readonly id: string;
    readonly title?: string;
    readonly level?: number;
    readonly shape?: string;
    readonly isGroup?: boolean;
    /** Custom properties (non-core, non-system). */
    readonly [key: string]: unknown;
}

/** A connected component (disconnected subgraph). */
export interface IGraphComponent {
    /** Number of nodes in this component. */
    readonly nodeCount: number;
    /** Root node ID — the graph's root node if it belongs to this component, otherwise the most connected node. */
    readonly rootId: string;
    /** All node IDs in this component. */
    readonly nodeIds: string[];
}

/** A search result entry. */
export interface IGraphSearchResult {
    readonly nodeId: string;
    readonly label: string;
    /** Whether the node is currently visible in the UI. */
    readonly visible: boolean;
    /** Which properties matched (key + value). */
    readonly matchedProps: Array<{ key: string; value: string }>;
}

/** Counts for the current UI search. */
export interface IGraphSearchInfo {
    readonly visible: number;
    readonly hidden: number;
    readonly total: number;
}

/** Current force-tuning values. */
export interface IGraphForceParams {
    readonly charge: number;
    readonly linkDistance: number;
    readonly collide: number;
}

/** Current persisted graph expansion settings. */
export interface IGraphExpansionOptions {
    readonly rootNode?: string;
    readonly expandDepth?: number;
    readonly maxVisible?: number;
}
