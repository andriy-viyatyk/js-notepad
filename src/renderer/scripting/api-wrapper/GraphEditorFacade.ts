import type { GraphEditor } from "../../editors/graph";
import type { GraphNode } from "../../editors/graph/types";
import { linkIds } from "../../editors/graph/types";
import { matchNodeSearch } from "../../editors/graph/GraphSearchModel";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

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
    { name: "select", kind: "method", signature: "select(ids: string[]): void", summary: "Select nodes by IDs (replaces current selection). Updates the UI." },
    { name: "addToSelection", kind: "method", signature: "addToSelection(ids: string[]): void", summary: "Add nodes to current selection. Updates the UI." },
    { name: "clearSelection", kind: "method", signature: "clearSelection(): void", summary: "Clear selection. Updates the UI." },
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
];

const GRAPH_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "graph-view".
Graph query and analysis facade for nodes, links, groups, selection, search, and traversal.`;

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
        return {
            kind: "GraphEditor",
            summary: "Graph query and analysis facade.",
            members: GRAPH_EDITOR_MEMBERS,
            help: GRAPH_EDITOR_HELP,
            summarize: () => ({
                kind: "GraphEditor", id: this.id, name: this.name,
                nodeCount: this.nodeCount,
                linkCount: this.linkCount,
                selectedCount: this.selectedIds.length,
                rootNodeId: this.rootNodeId,
                groupingEnabled: this.groupingEnabled,
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
        this.editor.renderer.selectNode("");
        if (ids.length > 0) {
            this.editor.renderer.addToSelection(ids);
        }
    }

    addToSelection(ids: string[]): void {
        this.editor.renderer.addToSelection(ids);
    }

    clearSelection(): void {
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
}
