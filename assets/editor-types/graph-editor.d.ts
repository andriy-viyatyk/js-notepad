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
