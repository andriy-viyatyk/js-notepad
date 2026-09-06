import type { GraphEditor } from "../../editors/graph";
import type { GraphNode } from "../../editors/graph/types";
import { linkIds } from "../../editors/graph/types";
import { matchNodeSearch } from "../../editors/graph/GraphSearchModel";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const GRAPH_ELEMENTS = [
    { name: "graph-open-in-draw", purpose: "Open the current graph image in a Drawing page." },
    { name: "graph-copy-image", purpose: "Copy the rendered graph image to the clipboard." },
    { name: "graph-settings", purpose: "Open or close the force-tuning panel." },
    { name: "graph-toggle-grouping", purpose: "Toggle group-node rendering." },
    { name: "graph-reset-view", purpose: "Rebuild the graph view from its current root and visibility state." },
    { name: "graph-expand-all", purpose: "Reveal all graph nodes." },
    { name: "graph-search", purpose: "Enter the UI search query for graph nodes." },
    { name: "graph-search-clear", purpose: "Clear the current UI search query." },
    { name: "graph-selection-menu", purpose: "Open actions for the current node selection." },
    { name: "graph-panel-physics", purpose: "Select the force-tuning panel." },
    { name: "graph-panel-expansion", purpose: "Select expansion settings." },
    { name: "graph-panel-results", purpose: "Select search results." },
    { name: "tuning-charge", purpose: "Adjust D3 charge/repulsion." },
    { name: "tuning-link-distance", purpose: "Adjust the desired link distance." },
    { name: "tuning-collide", purpose: "Adjust the collision force." },
    { name: "tuning-reset", purpose: "Restore the default force parameters." },
    { name: "graph-detail-panel", purpose: "Identify the graph's selected-node detail overlay." },
    { name: "graph-detail-toggle", purpose: "Expand or collapse the detail panel." },
    { name: "graph-detail-id", purpose: "Edit the selected node ID." },
    { name: "graph-detail-title", purpose: "Edit the selected node title." },
    { name: "graph-links-grid", purpose: "Inspect or edit links from the selected node." },
    { name: "graph-properties-grid", purpose: "Inspect or edit custom node properties." },
    { name: "graph-detail-tab-info", purpose: "Show node identity, title, level, and shape." },
    { name: "graph-detail-tab-properties", purpose: "Show custom properties." },
    { name: "graph-detail-tab-links", purpose: "Show linked nodes and editable link rows." },
    { name: "graph-legend-panel", purpose: "Identify the graph legend overlay." },
    { name: "graph-legend-toggle", purpose: "Expand or collapse the legend." },
    { name: "graph-legend-tab-selection", purpose: "Show selected and not-selected filters." },
    { name: "graph-legend-tab-level", purpose: "Show level, root, and group legend filters." },
    { name: "graph-legend-tab-shape", purpose: "Show shape, root, and group legend filters." },
    { name: "graph-expansion-root", purpose: "Choose the BFS expansion root or automatic root selection." },
    { name: "graph-expansion-depth", purpose: "Set the persisted maximum expansion depth." },
    { name: "graph-expansion-max", purpose: "Set the persisted maximum visible-node count." },
] as const;

interface GraphForceParams {
    readonly charge: number;
    readonly linkDistance: number;
    readonly collide: number;
}

interface GraphExpansionOptions {
    readonly rootNode?: string;
    readonly expandDepth?: number;
    readonly maxVisible?: number;
}

const GRAPH_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "nodes", kind: "property", summary: "All nodes (cleaned, no D3 runtime fields)." },
    { name: "links", kind: "property", summary: "All links as {source, target} ID pairs." },
    { name: "nodeCount", kind: "property", summary: "Total node count." },
    { name: "linkCount", kind: "property", summary: "Total link count." },
    { name: "getNode", kind: "method", signature: "getNode(id: string): GraphNode | undefined", summary: "Get a single node by ID, or undefined if not found." },
    { name: "selectedIds", kind: "property", summary: "Currently selected node IDs." },
    { name: "selectedNodes", kind: "property", summary: "Currently selected nodes (cleaned)." },
    { name: "select", kind: "method", signature: "select(ids: string[]): void", summary: "Select nodes by IDs (replaces current selection). Updates the UI.", caution: "changes the visible selection" },
    { name: "addToSelection", kind: "method", signature: "addToSelection(ids: string[]): void", summary: "Add nodes to current selection. Updates the UI.", caution: "changes the visible selection" },
    { name: "clearSelection", kind: "method", signature: "clearSelection(): void", summary: "Clear selection. Updates the UI.", caution: "changes the visible selection" },
    { name: "getNeighborIds", kind: "method", signature: "getNeighborIds(nodeId: string): string[]", summary: "Get direct neighbor IDs from real data links (excludes group membership). Shows the \"logical\" graph structure regardless of grouping state." },
    { name: "getVisualNeighborIds", kind: "method", signature: "getVisualNeighborIds(nodeId: string): string[]", summary: "Get visual neighbor IDs (what user sees in the rendered graph). When grouping is enabled, links may route through group nodes. When grouping is disabled, same as getNeighborIds()." },
    { name: "getGroupOf", kind: "method", signature: "getGroupOf(nodeId: string): string | undefined", summary: "Get group ID that a node belongs to, or undefined." },
    { name: "getGroupMembers", kind: "method", signature: "getGroupMembers(groupId: string): string[]", summary: "Get direct member IDs of a group node." },
    { name: "getGroupMembersDeep", kind: "method", signature: "getGroupMembersDeep(groupId: string): string[]", summary: "Get all member IDs recursively (includes sub-group members)." },
    { name: "getGroupChain", kind: "method", signature: "getGroupChain(nodeId: string): string[]", summary: "Get the group chain from a node to the top-level group: [immediateGroup, parentGroup, ...]." },
    { name: "isGroup", kind: "method", signature: "isGroup(nodeId: string): boolean", summary: "Whether a node is a group node." },
    { name: "search", kind: "method", signature: "search(query: string, includeHidden = true): IGraphSearchResult[]", summary: "Search nodes by query string (same multi-word AND logic as UI search). Does NOT affect the UI - purely returns results. Searches node labels and all custom properties." },
    { name: "bfs", kind: "method", signature: "bfs(startId: string, maxDepth?: number, visual = false): Array<{ id: string; depth: number }>", summary: "BFS traversal from a starting node. Returns nodes in BFS order with their depth from the start." },
    { name: "getComponents", kind: "method", signature: "getComponents(): IGraphComponent[]", summary: "Find connected components (disconnected subgraphs). Returns components sorted by size (largest first). Each component includes rootId if the graph's root node belongs to it." },
    { name: "rootNodeId", kind: "property", summary: "Current root node ID, or empty string." },
    { name: "groupingEnabled", kind: "property", summary: "Whether grouping is currently enabled." },
    { name: "loading", kind: "property", summary: "Whether graph content is currently being parsed; undefined while the editor model is detached." },
    { name: "error", kind: "property", summary: "The graph parse error, or an empty string when attached and error-free; undefined while detached." },
    { name: "isEmpty", kind: "property", summary: "Whether the attached, settled graph has no nodes; undefined before content settles." },
    { name: "hasGroups", kind: "property", summary: "Whether the attached graph contains group nodes; undefined before source data is available." },
    { name: "hasVisibilityFilter", kind: "property", summary: "Whether the loaded graph has an active visibility filter; undefined before source data is available." },
    { name: "recordsCount", kind: "property", summary: "The visible/total node count shown in the graph footer; undefined before parsing settles." },
    { name: "totalNodeCount", kind: "property", summary: "The total source node count; undefined before source data is available." },
    { name: "searchQuery", kind: "property", summary: "The current UI search query, or undefined while the editor model is detached." },
    { name: "searchInfo", kind: "property", summary: "Current UI search counts, or null when no search is active." },
    { name: "searchResults", kind: "property", summary: "Current UI search result rows, or null when no results are available." },
    { name: "forceParams", kind: "property", summary: "Current force-tuning values; undefined before graph source data is available." },
    { name: "expansionOptions", kind: "property", summary: "Current persisted expansion options; undefined before graph source data is available." },
    { name: "resetView", kind: "method", signature: "resetView(): void", summary: "Rebuild the graph view from its current root and visibility state.", caution: "changes graph visibility and the rendered UI" },
    { name: "resetVisibility", kind: "method", signature: "resetVisibility(): void", summary: "Reset the graph's visibility filter.", caution: "changes graph visibility" },
    { name: "expandAll", kind: "method", signature: "expandAll(): void", summary: "Reveal all graph nodes.", caution: "changes graph visibility" },
    { name: "toggleGrouping", kind: "method", signature: "toggleGrouping(): void", summary: "Toggle group-node rendering.", caution: "changes graph rendering and selection" },
    { name: "setSearchQuery", kind: "method", signature: "setSearchQuery(query: string): void", summary: "Set the visible graph search query and update its results.", caution: "changes the visible UI" },
    { name: "revealHiddenMatches", kind: "method", signature: "revealHiddenMatches(): void", summary: "Reveal nodes hidden by the current search visibility filter.", caution: "changes graph visibility" },
    { name: "revealAndSelectNode", kind: "method", signature: "revealAndSelectNode(nodeId: string): void", summary: "Reveal a hidden node and select it.", caution: "changes graph visibility and selection" },
    { name: "selectSearchResults", kind: "method", signature: "selectSearchResults(): void", summary: "Reveal and add current search results to the selection.", caution: "changes graph visibility and selection" },
    { name: "updateForceParams", kind: "method", signature: "updateForceParams(params: Partial<{ charge: number; linkDistance: number; collide: number }>): void", summary: "Update and persist force-tuning values.", caution: "changes and persists graph rendering settings" },
    { name: "resetForceParams", kind: "method", signature: "resetForceParams(): void", summary: "Restore and persist default force-tuning values.", caution: "changes and persists graph rendering settings" },
    { name: "updateExpansionOptions", kind: "method", signature: "updateExpansionOptions(patch: Partial<{ expandDepth: number; maxVisible: number }>): void", summary: "Update and persist expansion settings; changes apply when the file is reopened.", caution: "changes and persists graph expansion settings" },
    { name: "openInDrawingEditor", kind: "method", signature: "openInDrawingEditor(): Promise<void>", summary: "Open the rendered graph image in a new Drawing Editor page.", caution: "opens a new Drawing Editor page" },
    { name: "copyImageToClipboard", kind: "method", signature: "copyImageToClipboard(): Promise<void>", summary: "Copy the rendered graph image as a PNG to the clipboard.", caution: "writes rendered image data to the clipboard" },
];

const GRAPH_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "graph-view".
Graph query and analysis facade for nodes, links, groups, selection, search, traversal, and the
page-scoped graph chrome. The graph body is one canvas: nodes, labels, and links are not DOM
elements and cannot be highlighted. elements contains stable toolbar, detail-panel, legend-panel,
force-tuning, and expansion controls only; detail and legend are editor-internal overlays, not
page.panels entries. Use page.content for graph data edits, including detail fields, properties,
links, and grouping data.

The graph-search control changes the UI search box; search(query) is the pure data query. The
graph-selection-menu opens the live selection popup. Canvas right-click opens the live context
menu for empty space, a node, a group node, or a selection; inspect menus[0].items for labels and
enabled state, then use menus[0].click(label) and menus[0].close(). Disabled menu actions are
represented by their menu state, not by elements.visible. Expand All may first open the
confirmation titled "Expand All Nodes" for large graphs; inspect dialogs[0].

The expansion depth and maximum-visible settings are persisted and apply when the file is
reopened. The image actions use the mounted graph view and throw when its canvas is unavailable.
Reading elements does not activate a page, while highlight activates its page and waits for its
retained slot layout.`;

/**
 * Safe facade around GraphEditor for script access.
 * Implements the IGraphEditor interface from api/types/graph-editor.d.ts.
 *
 * Primarily designed for AI agent usage via MCP (execute_script).
 * Focuses on read/query operations — editing is done via page.content JSON.
 */
export class GraphEditorFacade implements IAiVisible {
    constructor(private readonly editor: GraphEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(GRAPH_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "GraphEditor",
            summary: "Graph query, analysis, and rendered-surface facade.",
            members: [...GRAPH_EDITOR_MEMBERS, ...elements.members],
            help: GRAPH_EDITOR_HELP,
            elements: GRAPH_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "GraphEditor", id: this.id, name: this.name,
                nodeCount: this.nodeCount,
                linkCount: this.linkCount,
                selectedCount: this.selectedIds.length,
                rootNodeId: this.rootNodeId,
                groupingEnabled: this.groupingEnabled,
                loading: this.loading,
                error: this.error,
                isEmpty: this.isEmpty,
                hasGroups: this.hasGroups,
                hasVisibilityFilter: this.hasVisibilityFilter,
                recordsCount: this.recordsCount,
                totalNodeCount: this.totalNodeCount,
                searchQuery: this.searchQuery,
                searchInfo: this.searchInfo,
                searchResults: this.searchResults,
                forceParams: this.forceParams,
                expansionOptions: this.expansionOptions,
            }),
        };
    }

    // ── Data Access ──────────────────────────────────────────────────

    get nodes(): GraphNode[] {
        return (this.editor.dataModel.sourceData?.nodes ?? []).map(n => this.editor.dataModel.cleanNode(n));
    }

    get links(): Array<{ source: string; target: string }> {
        return (this.editor.dataModel.sourceData?.links ?? []).map(l => {
            const { source, target } = linkIds(l);
            return { source, target };
        });
    }

    get nodeCount(): number {
        return this.editor.dataModel.sourceData?.nodes.length ?? 0;
    }

    get linkCount(): number {
        return this.editor.dataModel.sourceData?.links.length ?? 0;
    }

    getNode(id: string): GraphNode | undefined {
        const node = this.editor.dataModel.sourceData?.nodes.find(n => n.id === id);
        return node ? this.editor.dataModel.cleanNode(node) : undefined;
    }

    // ── Selection ────────────────────────────────────────────────────

    get selectedIds(): string[] {
        return [...this.editor.renderer.selectedIds];
    }

    get selectedNodes(): GraphNode[] {
        const ids = this.editor.renderer.selectedIds;
        return (this.editor.dataModel.sourceData?.nodes ?? [])
            .filter(n => ids.has(n.id))
            .map(n => this.editor.dataModel.cleanNode(n));
    }

    select(ids: string[]): void {
        this.requireLoadedGraph();
        this.editor.renderer.selectNode("");
        if (ids.length > 0) {
            this.editor.renderer.addToSelection(ids);
        }
    }

    addToSelection(ids: string[]): void {
        this.requireLoadedGraph();
        this.editor.renderer.addToSelection(ids);
    }

    clearSelection(): void {
        this.requireLoadedGraph();
        this.editor.renderer.selectNode("");
    }

    // ── Relationships ────────────────────────────────────────────────

    getNeighborIds(nodeId: string): string[] {
        return [...this.editor.connectivityModel.getRealNeighborIds(nodeId)];
    }

    getVisualNeighborIds(nodeId: string): string[] {
        return [...this.editor.connectivityModel.getProcessedNeighborIds(nodeId)];
    }

    getGroupOf(nodeId: string): string | undefined {
        return this.editor.groupModel.getGroupOf(nodeId);
    }

    getGroupMembers(groupId: string): string[] {
        return [...this.editor.groupModel.getMembers(groupId)];
    }

    getGroupMembersDeep(groupId: string): string[] {
        return [...this.editor.connectivityModel.getAllRealMembers(groupId)];
    }

    getGroupChain(nodeId: string): string[] {
        return this.editor.connectivityModel.getGroupChain(nodeId);
    }

    isGroup(nodeId: string): boolean {
        return this.editor.groupModel.isGroup(nodeId);
    }

    // ── Search ───────────────────────────────────────────────────────

    search(query: string, includeHidden = true): Array<{
        nodeId: string; label: string; visible: boolean;
        matchedProps: Array<{ key: string; value: string }>;
    }> {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return [];

        const words = trimmed.split(/\s+/).filter(Boolean);
        const allNodes = this.editor.dataModel.sourceData?.nodes ?? [];
        const visibleIds = new Set(this.editor.renderer.getNodes().map(n => n.id));

        const results: Array<{
            nodeId: string; label: string; visible: boolean;
            matchedProps: Array<{ key: string; value: string }>;
        }> = [];

        for (const node of allNodes) {
            const matched = matchNodeSearch(node, words);
            if (!matched) continue;

            const visible = visibleIds.has(node.id);
            if (!includeHidden && !visible) continue;

            results.push({ ...matched, visible });
        }

        // Sort: visible first (alphabetical), then hidden (alphabetical)
        results.sort((a, b) => {
            if (a.visible !== b.visible) return a.visible ? -1 : 1;
            return a.label.localeCompare(b.label);
        });

        return results;
    }

    get loading(): boolean | undefined {
        return this.editor.host ? this.editor.state.get().loading : undefined;
    }

    get error(): string | undefined {
        return this.editor.host ? this.editor.state.get().error : undefined;
    }

    get isEmpty(): boolean | undefined {
        return this.hasSettledHost ? this.editor.isEmpty : undefined;
    }

    get hasGroups(): boolean | undefined {
        return this.hasLoadedSourceData ? this.editor.hasGroups : undefined;
    }

    get hasVisibilityFilter(): boolean | undefined {
        return this.hasLoadedSourceData ? this.editor.hasVisibilityFilter : undefined;
    }

    get recordsCount(): string | undefined {
        return this.hasSettledHost ? this.editor.recordsCount : undefined;
    }

    get totalNodeCount(): number | undefined {
        return this.hasLoadedSourceData ? this.editor.totalNodeCount : undefined;
    }

    get searchQuery(): string | undefined {
        return this.editor.host ? this.editor.state.get().searchQuery : undefined;
    }

    get searchInfo() {
        return this.editor.host ? this.editor.state.get().searchInfo : undefined;
    }

    get searchResults() {
        return this.editor.host ? this.editor.state.get().searchResults : undefined;
    }

    get forceParams(): GraphForceParams | undefined {
        return this.hasLoadedSourceData ? { ...this.editor.renderer.forceParams } : undefined;
    }

    get expansionOptions(): GraphExpansionOptions | undefined {
        return this.hasLoadedSourceData ? this.editor.getExpansionOptions() : undefined;
    }

    resetView(): void {
        this.requireLoadedGraph();
        this.editor.resetView();
    }

    resetVisibility(): void {
        this.requireLoadedGraph();
        this.editor.resetVisibility();
    }

    expandAll(): void {
        this.requireLoadedGraph();
        this.editor.expandAll();
    }

    toggleGrouping(): void {
        this.requireLoadedGraph();
        this.editor.toggleGrouping();
    }

    setSearchQuery(query: string): void {
        this.requireLoadedGraph();
        this.editor.setSearchQuery(query);
    }

    revealHiddenMatches(): void {
        this.requireLoadedGraph();
        this.editor.revealHiddenMatches();
    }

    revealAndSelectNode(nodeId: string): void {
        this.requireLoadedGraph();
        if (!this.getNode(nodeId)) {
            throw new Error(`Graph editor action unavailable: node not found: ${nodeId}`);
        }
        this.editor.revealAndSelectNode(nodeId);
    }

    selectSearchResults(): void {
        this.requireLoadedGraph();
        this.editor.selectSearchResults();
    }

    updateForceParams(params: Partial<GraphForceParams>): void {
        this.requireLoadedGraph();
        this.editor.updateForceParams(params);
    }

    resetForceParams(): void {
        this.requireLoadedGraph();
        this.editor.resetForceParams();
    }

    updateExpansionOptions(patch: Partial<Pick<GraphExpansionOptions, "expandDepth" | "maxVisible">>): void {
        this.requireLoadedGraph();
        this.editor.updateExpansionOptions(patch);
    }

    openInDrawingEditor(): Promise<void> {
        return this.editor.openInDrawingEditor();
    }

    copyImageToClipboard(): Promise<void> {
        return this.editor.copyImageToClipboard();
    }

    // ── Traversal ────────────────────────────────────────────────────

    bfs(startId: string, maxDepth?: number, visual = false): Array<{ id: string; depth: number }> {
        const getNeighbors = visual
            ? (id: string) => this.editor.connectivityModel.getProcessedNeighborIds(id)
            : (id: string) => this.editor.connectivityModel.getRealNeighborIds(id);

        const visited = new Map<string, number>(); // id → depth
        const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
        visited.set(startId, 0);

        while (queue.length > 0) {
            const { id, depth } = queue.shift();
            if (maxDepth !== undefined && depth >= maxDepth) continue;
            for (const neighborId of getNeighbors(id)) {
                if (!visited.has(neighborId)) {
                    visited.set(neighborId, depth + 1);
                    queue.push({ id: neighborId, depth: depth + 1 });
                }
            }
        }

        const result: Array<{ id: string; depth: number }> = [];
        for (const [id, depth] of visited) {
            result.push({ id, depth });
        }
        return result;
    }

    // ── Analysis ─────────────────────────────────────────────────────

    getComponents(): Array<{ nodeCount: number; rootId: string; nodeIds: string[] }> {
        const allNodes = this.editor.dataModel.sourceData?.nodes ?? [];
        const visited = new Set<string>();
        const components: Array<{ nodeCount: number; rootId: string; nodeIds: string[] }> = [];
        const graphRootId = this.editor.dataModel.sourceData?.options?.rootNode;

        // Skip group nodes — they are structural, not data nodes
        const nonGroupNodes = allNodes.filter(n => !n.isGroup);

        for (const node of nonGroupNodes) {
            if (visited.has(node.id)) continue;

            // BFS via real data links only (no group membership)
            const component: string[] = [];
            const queue = [node.id];
            visited.add(node.id);

            while (queue.length > 0) {
                const id = queue.shift();
                component.push(id);
                for (const neighborId of this.editor.connectivityModel.getRealNeighborIds(id)) {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push(neighborId);
                    }
                }
            }

            // Pick root: graph's rootNode if in this component, else most connected node
            let rootId = component[0];
            if (graphRootId && component.includes(graphRootId)) {
                rootId = graphRootId;
            } else {
                let maxDegree = 0;
                for (const id of component) {
                    const degree = this.editor.connectivityModel.getRealNeighborIds(id).size;
                    if (degree > maxDegree) {
                        maxDegree = degree;
                        rootId = id;
                    }
                }
            }

            components.push({ nodeCount: component.length, rootId, nodeIds: component });
        }

        // Sort by size descending
        components.sort((a, b) => b.nodeCount - a.nodeCount);
        return components;
    }

    // ── Options ──────────────────────────────────────────────────────

    get rootNodeId(): string {
        return this.editor.dataModel.sourceData?.options?.rootNode ?? "";
    }

    get groupingEnabled(): boolean {
        return this.editor.groupingEnabled;
    }

    private get hasSettledHost(): boolean {
        const state = this.editor.state.get();
        return !!this.editor.host && !state.loading && !state.error;
    }

    private get hasLoadedSourceData(): boolean {
        return this.hasSettledHost && this.editor.dataModel.sourceData !== null;
    }

    private requireLoadedGraph(): void {
        if (!this.hasLoadedSourceData) {
            throw new Error("Graph editor action unavailable: graph content is not loaded");
        }
    }
}
