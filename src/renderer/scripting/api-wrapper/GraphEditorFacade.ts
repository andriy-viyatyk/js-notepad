import type { GraphEditor } from "../../editors/graph";
import type { GraphNode } from "../../editors/graph/types";
import { linkIds } from "../../editors/graph/types";
import { matchNodeSearch } from "../../editors/graph/GraphSearchModel";

/**
 * Safe facade around GraphEditor for script access.
 * Implements the IGraphEditor interface from api/types/graph-editor.d.ts.
 *
 * Primarily designed for AI agent usage via MCP (execute_script).
 * Focuses on read/query operations — editing is done via page.content JSON.
 */
export class GraphEditorFacade {
    constructor(private readonly editor: GraphEditor) {}

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
            const { id, depth } = queue.shift()!;
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
                const id = queue.shift()!;
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
