import { GraphNode, GraphLink, GraphOptions, GraphData, linkIds } from "./types";

// =============================================================================
// Internal types
// =============================================================================

interface ProcessedNode {
    node: GraphNode;
    showIndex: number;
    /** BFS depth from component root (0 = root itself). */
    depth: number;
    neighbors: Set<string>;
}

// =============================================================================
// GraphVisibilityModel
// =============================================================================

/**
 * Manages BFS-based visibility for large graphs.
 *
 * Preprocesses the full graph into an adjacency structure, computes BFS discovery
 * order from a focus node, and provides expand/collapse operations.
 *
 * When the graph is small (nodes ≤ maxVisible), the model stays inactive and
 * the full graph renders without filtering.
 */
export class GraphVisibilityModel {
    private fullNodes = new Map<string, ProcessedNode>();
    private fullLinkPairs: Array<{ source: string; target: string }> = [];
    private visibleIds = new Set<string>();
    private options: GraphOptions = {};
    private _focusId = "";
    private _active = false;

    /** True when visibility filtering is active (graph exceeds maxVisible). */
    get active(): boolean {
        return this._active;
    }

    /** The root node ID used for BFS expansion (computed from options or heuristic). */
    get focusId(): string {
        return this._focusId;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /** Process raw graph data (full reset). Returns true if filtering is active. */
    setFullGraph(nodes: GraphNode[], links: GraphLink[], options?: GraphOptions): boolean {
        this.options = options ?? {};
        const maxVisible = this.options.maxVisible ?? 500;

        // Small graph optimization: no filtering needed
        if (nodes.length <= maxVisible) {
            this._active = false;
            this.fullNodes.clear();
            this.fullLinkPairs = [];
            this.visibleIds.clear();
            return false;
        }

        this._active = true;
        this.rebuildInternal(nodes, links);

        // Initial visible set: nodes within expandDepth, capped at maxVisible
        this.computeInitialVisibility(maxVisible);

        return true;
    }

    /**
     * Incrementally update graph data while preserving expand/collapse state.
     * - Existing visible nodes stay visible
     * - Deleted nodes are removed from visibleIds
     * - New nodes listed in `ensureVisible` are made visible
     * Returns true if filtering is active.
     */
    updateGraph(nodes: GraphNode[], links: GraphLink[], ensureVisible?: string[]): boolean {
        this.options = this.options ?? {};
        const maxVisible = this.options.maxVisible ?? 500;

        if (nodes.length <= maxVisible) {
            this._active = false;
            this.fullNodes.clear();
            this.fullLinkPairs = [];
            this.visibleIds.clear();
            return false;
        }

        this._active = true;

        // Save current visible set
        const prevVisible = new Set(this.visibleIds);

        this.rebuildInternal(nodes, links);

        // Restore: keep previously visible nodes that still exist
        const newNodeIds = new Set(nodes.map((n) => n.id));
        this.visibleIds = new Set<string>();
        for (const id of prevVisible) {
            if (newNodeIds.has(id)) {
                this.visibleIds.add(id);
            }
        }

        // Ensure requested nodes are visible
        if (ensureVisible) {
            for (const id of ensureVisible) {
                this.visibleIds.add(id);
            }
        }

        return true;
    }

    /** Build a visible graph with _$showIndex and _$hiddenCount set on nodes. */
    getVisibleGraph(): GraphData {
        const nodes: GraphNode[] = [];
        for (const id of this.visibleIds) {
            const pn = this.fullNodes.get(id);
            if (!pn) continue;
            // Shallow copy — original nodes may be frozen by immer (state management),
            // and D3 needs to add mutable properties (x, y, vx, vy, index).
            const node: GraphNode = {
                ...pn.node,
                _$showIndex: pn.showIndex,
                _$hiddenCount: this.countHiddenNeighbors(id),
            };
            nodes.push(node);
        }

        const links: GraphLink[] = this.fullLinkPairs
            .filter(({ source, target }) => this.visibleIds.has(source) && this.visibleIds.has(target))
            .map(({ source, target }) => ({ source, target }));

        return { nodes, links, options: this.options };
    }

    /** Expand or collapse a node. Returns true if visibility changed. */
    toggle(nodeId: string): boolean {
        const pn = this.fullNodes.get(nodeId);
        if (!pn) return false;

        const hiddenCount = this.countHiddenNeighbors(nodeId);
        if (hiddenCount > 0) {
            return this.expand(nodeId);
        } else {
            return this.collapse(nodeId);
        }
    }

    /** Update visibility state when a node ID is renamed. */
    renameId(oldId: string, newId: string): void {
        if (this.visibleIds.has(oldId)) {
            this.visibleIds.delete(oldId);
            this.visibleIds.add(newId);
        }
    }

    /** Reset to initial visibility state. */
    reset(): void {
        const maxVisible = this.options.maxVisible ?? 500;
        this.computeInitialVisibility(maxVisible);
    }

    // =========================================================================
    // Internal rebuild
    // =========================================================================

    /** Rebuild adjacency, BFS, and fullNodes from raw data (does NOT touch visibleIds). */
    private rebuildInternal(nodes: GraphNode[], links: GraphLink[]): void {
        // Extract link ID pairs (D3-mutation-safe)
        this.fullLinkPairs = links.map((link) => linkIds(link));

        // Build adjacency
        const adjacency = new Map<string, Set<string>>();
        for (const node of nodes) adjacency.set(node.id, new Set());
        for (const { source, target } of this.fullLinkPairs) {
            adjacency.get(source)?.add(target);
            adjacency.get(target)?.add(source);
        }

        // Determine focus node
        this._focusId = this.determineFocusNode(nodes);

        // BFS from focus — assigns showIndex and depth to all nodes
        const { showIndexMap, depthMap } = this.computeBFS(nodes, adjacency);

        // Store processed nodes
        this.fullNodes.clear();
        for (const node of nodes) {
            this.fullNodes.set(node.id, {
                node,
                showIndex: showIndexMap.get(node.id) ?? Infinity,
                depth: depthMap.get(node.id) ?? Infinity,
                neighbors: adjacency.get(node.id) ?? new Set(),
            });
        }
    }

    // =========================================================================
    // Search helpers
    // =========================================================================

    /** Get all hidden nodes (for search matching in ViewModel). */
    getHiddenNodes(): GraphNode[] {
        const result: GraphNode[] = [];
        for (const [id, pn] of this.fullNodes) {
            if (!this.visibleIds.has(id)) result.push(pn.node);
        }
        return result;
    }

    /** Check if a node is currently visible. */
    isNodeVisible(nodeId: string): boolean {
        return this.visibleIds.has(nodeId);
    }

    /** Reveal hidden target nodes by making all nodes on the shortest path from focus visible.
     *  Returns true if any new nodes became visible. */
    revealPaths(targetIds: string[]): boolean {
        if (!this._focusId || targetIds.length === 0) return false;

        // BFS from focus on full graph to build parent map
        const parent = new Map<string, string>();
        const visited = new Set<string>([this._focusId]);
        const queue: string[] = [this._focusId];
        const targetSet = new Set(targetIds.filter((id) => !this.visibleIds.has(id)));
        if (targetSet.size === 0) return false;

        let found = 0;
        while (queue.length > 0 && found < targetSet.size) {
            const current = queue.shift();
            const pn = this.fullNodes.get(current);
            if (!pn) continue;

            for (const neighborId of pn.neighbors) {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    parent.set(neighborId, current);
                    queue.push(neighborId);
                    if (targetSet.has(neighborId)) found++;
                }
            }
        }

        // Trace paths back from each target to focus, making all path nodes visible
        let changed = false;
        for (const targetId of targetSet) {
            let current = targetId;
            while (current && current !== this._focusId) {
                if (!this.visibleIds.has(current)) {
                    this.visibleIds.add(current);
                    changed = true;
                }
                current = parent.get(current) ?? "";
            }
        }

        return changed;
    }

    // =========================================================================
    // BFS
    // =========================================================================

    /** IDs of component root nodes (first node visited in each truly disconnected component). */
    private componentRoots: string[] = [];

    private computeBFS(
        nodes: GraphNode[],
        adjacency: Map<string, Set<string>>,
    ): { showIndexMap: Map<string, number>; depthMap: Map<string, number> } {
        const showIndexMap = new Map<string, number>();
        const depthMap = new Map<string, number>();
        this.componentRoots = [];
        if (!this._focusId) return { showIndexMap, depthMap };

        // Step 1: Find truly disconnected components via unlimited BFS
        // Start from focus node so it becomes its component's root
        const componentOf = new Map<string, string>(); // nodeId → componentRootId
        const nodeOrder = [{ id: this._focusId }, ...nodes.filter((n) => n.id !== this._focusId)];
        for (const node of nodeOrder) {
            if (componentOf.has(node.id)) continue;
            const rootId = node.id;
            this.componentRoots.push(rootId);
            const queue: string[] = [rootId];
            componentOf.set(rootId, rootId);
            while (queue.length > 0) {
                const cur = queue.shift();
                for (const neighborId of adjacency.get(cur) || []) {
                    if (!componentOf.has(neighborId)) {
                        componentOf.set(neighborId, rootId);
                        queue.push(neighborId);
                    }
                }
            }
        }

        // Step 2: Unlimited BFS from focus node — assigns showIndex and depth
        let index = this.bfsFrom(this._focusId, 0, adjacency, showIndexMap, depthMap);

        // Step 3: Unlimited BFS from each remaining component root
        for (const rootId of this.componentRoots) {
            if (!showIndexMap.has(rootId)) {
                index = this.bfsFrom(rootId, index, adjacency, showIndexMap, depthMap);
            }
        }

        return { showIndexMap, depthMap };
    }

    /** Run unlimited BFS from a start node, assigning showIndex and depth.
     *  Returns the next available showIndex. */
    private bfsFrom(
        startId: string,
        startIndex: number,
        adjacency: Map<string, Set<string>>,
        showIndexMap: Map<string, number>,
        depthMap: Map<string, number>,
    ): number {
        const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
        showIndexMap.set(startId, startIndex);
        depthMap.set(startId, 0);
        let index = startIndex + 1;

        while (queue.length > 0) {
            const { id: nodeId, depth } = queue.shift();

            for (const neighborId of adjacency.get(nodeId) || []) {
                if (!showIndexMap.has(neighborId)) {
                    showIndexMap.set(neighborId, index++);
                    depthMap.set(neighborId, depth + 1);
                    queue.push({ id: neighborId, depth: depth + 1 });
                }
            }
        }

        return index;
    }

    private determineFocusNode(nodes: GraphNode[]): string {
        // 1. Explicit rootNode from options
        if (this.options.rootNode && nodes.some((n) => n.id === this.options.rootNode)) {
            return this.options.rootNode;
        }

        // 2. Node with lowest level (most important)
        let best = "";
        let bestLevel = Infinity;
        for (const node of nodes) {
            const level = typeof node.level === "number" ? node.level : Infinity;
            if (level < bestLevel) {
                bestLevel = level;
                best = node.id;
            }
        }
        if (best) return best;

        // 3. First node
        return nodes[0]?.id ?? "";
    }

    // =========================================================================
    // Initial visibility
    // =========================================================================

    /** Compute initial visible set: nodes within expandDepth of each component root, capped at maxVisible. */
    private computeInitialVisibility(maxVisible: number): void {
        const expandDepth = this.options.expandDepth;

        if (expandDepth !== undefined) {
            // Depth-based: show all nodes within expandDepth (across all components)
            this.visibleIds = new Set<string>();
            for (const [id, pn] of this.fullNodes) {
                if (pn.depth <= expandDepth) {
                    this.visibleIds.add(id);
                }
            }
            // Cap at maxVisible: keep nodes with lowest showIndex (closest to their component root)
            if (this.visibleIds.size > maxVisible) {
                const sorted = [...this.visibleIds]
                    .map((id) => ({ id, showIndex: this.fullNodes.get(id).showIndex }))
                    .sort((a, b) => a.showIndex - b.showIndex);
                this.visibleIds = new Set(sorted.slice(0, maxVisible).map((e) => e.id));
            }
        } else {
            // No depth limit: first maxVisible nodes by BFS order
            const sorted = [...this.fullNodes.entries()].sort((a, b) => a[1].showIndex - b[1].showIndex);
            this.visibleIds = new Set(sorted.slice(0, maxVisible).map(([id]) => id));
        }

        // Ensure at least one node per disconnected component is visible
        this.ensureComponentRootsVisible();
    }

    // =========================================================================
    // Expand / Collapse
    // =========================================================================

    expand(nodeId: string): boolean {
        const pn = this.fullNodes.get(nodeId);
        if (!pn) return false;

        let changed = false;
        for (const neighborId of pn.neighbors) {
            if (!this.visibleIds.has(neighborId)) {
                this.visibleIds.add(neighborId);
                changed = true;
            }
        }
        return changed;
    }

    /** Deep expand: BFS through hidden nodes from `nodeId`, treating previously-visible nodes as barriers. */
    expandDeep(nodeId: string): boolean {
        const pn = this.fullNodes.get(nodeId);
        if (!pn) return false;

        // Snapshot current visible set — these act as barriers (don't traverse through them)
        const barrier = new Set(this.visibleIds);
        const queue: string[] = [nodeId];
        let changed = false;

        while (queue.length > 0) {
            const current = queue.shift();
            const cpn = this.fullNodes.get(current);
            if (!cpn) continue;

            for (const neighborId of cpn.neighbors) {
                if (barrier.has(neighborId)) continue;          // was already visible — wall
                if (this.visibleIds.has(neighborId)) continue;  // already revealed in this pass
                this.visibleIds.add(neighborId);
                changed = true;
                queue.push(neighborId);
            }
        }
        return changed;
    }

    /** Make all nodes visible. Returns true if any nodes were newly revealed. */
    expandAll(): boolean {
        let changed = false;
        for (const id of this.fullNodes.keys()) {
            if (!this.visibleIds.has(id)) {
                this.visibleIds.add(id);
                changed = true;
            }
        }
        return changed;
    }

    /** Total number of nodes in the full graph. */
    get totalNodeCount(): number {
        return this.fullNodes.size;
    }

    collapse(nodeId: string): boolean {
        const pn = this.fullNodes.get(nodeId);
        if (!pn) return false;

        const clickedIndex = pn.showIndex;

        // BFS from clicked node: only follow visible nodes with showIndex > clickedIndex
        const toHide = new Set<string>();
        const queue: string[] = [];

        for (const neighborId of pn.neighbors) {
            const npn = this.fullNodes.get(neighborId);
            if (npn && npn.showIndex > clickedIndex && this.visibleIds.has(neighborId)) {
                queue.push(neighborId);
            }
        }

        while (queue.length > 0) {
            const current = queue.shift();
            if (toHide.has(current)) continue;
            toHide.add(current);

            const cpn = this.fullNodes.get(current);
            if (!cpn) continue;
            for (const neighborId of cpn.neighbors) {
                const npn = this.fullNodes.get(neighborId);
                if (npn && npn.showIndex > clickedIndex && this.visibleIds.has(neighborId) && !toHide.has(neighborId)) {
                    queue.push(neighborId);
                }
            }
        }

        for (const id of toHide) this.visibleIds.delete(id);
        return toHide.size > 0;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Ensure each disconnected component has its root + immediate neighbors visible. */
    private ensureComponentRootsVisible(): void {
        for (const rootId of this.componentRoots) {
            const pn = this.fullNodes.get(rootId);
            if (!pn) continue;
            if (!this.visibleIds.has(rootId)) {
                this.visibleIds.add(rootId);
                // Also add immediate neighbors so the component shows one expanded node
                for (const neighborId of pn.neighbors) {
                    if (this.fullNodes.has(neighborId)) {
                        this.visibleIds.add(neighborId);
                    }
                }
            }
        }
    }

    private countHiddenNeighbors(nodeId: string): number {
        const pn = this.fullNodes.get(nodeId);
        if (!pn) return 0;
        let count = 0;
        for (const neighborId of pn.neighbors) {
            if (!this.visibleIds.has(neighborId)) count++;
        }
        return count;
    }
}
