import { GraphNode, GraphLink, linkIds } from "./types";
import { PreprocessedGraph, GraphGroupModel } from "./GraphGroupModel";

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * Read-only query layer bridging the original source graph and the preprocessed
 * visualization graph. Provides reusable methods for real-data neighbor discovery,
 * visual path finding, and group analysis.
 *
 * Designed to support nested groups (multi-level grouping) from the start.
 */
export class GraphConnectivityModel {
    /** Original links minus membership — real data connections only. */
    private realAdjacency = new Map<string, Set<string>>();
    /** From preprocessed links — visual connections on canvas. */
    private processedAdjacency = new Map<string, Set<string>>();
    /** Maps original real-data link key → visual link keys (from preprocessing). */
    private originalToVisualLinks = new Map<string, string[]>();
    /** Reference to group model for membership queries. */
    private groupModel: GraphGroupModel | null = null;
    /** All group node IDs (for membership link detection). */
    private groupIds = new Set<string>();

    // =========================================================================
    // Rebuild
    // =========================================================================

    rebuild(
        nodes: GraphNode[],
        links: GraphLink[],
        preprocessed: PreprocessedGraph,
        groupModel: GraphGroupModel,
    ): void {
        this.groupModel = groupModel;

        // Collect group IDs
        this.groupIds.clear();
        for (const node of nodes) {
            if (node.isGroup) this.groupIds.add(node.id);
        }

        // Build realAdjacency: original links minus membership (XOR: exactly one endpoint is group)
        this.realAdjacency.clear();
        for (const link of links) {
            const { source, target } = linkIds(link);
            const sourceIsGroup = this.groupIds.has(source);
            const targetIsGroup = this.groupIds.has(target);
            let isMembership = false;
            if (sourceIsGroup !== targetIsGroup) {
                isMembership = true;
            } else if (sourceIsGroup && targetIsGroup) {
                isMembership = this.groupModel.getGroupOf(source) === target
                            || this.groupModel.getGroupOf(target) === source;
            }
            if (isMembership) continue;

            this.addEdge(this.realAdjacency, source, target);
        }

        // Build processedAdjacency from preprocessed links
        this.processedAdjacency.clear();
        for (const link of preprocessed.links) {
            const { source, target } = linkIds(link);
            this.addEdge(this.processedAdjacency, source, target);
        }

        // Store original-to-visual link mapping for O(1) path highlighting
        this.originalToVisualLinks = preprocessed.originalToVisualLinks;
    }

    // =========================================================================
    // Real-data queries (original graph, membership links excluded)
    // =========================================================================

    /** Get real-data neighbor IDs (no membership links, no group routing). */
    getRealNeighborIds(nodeId: string): ReadonlySet<string> {
        return this.realAdjacency.get(nodeId) ?? EMPTY_SET;
    }

    /** Get real-data neighbor nodes with cleaned properties. */
    getRealNeighborNodes(
        nodeId: string,
        sourceNodes: GraphNode[],
        cleanNode: (n: GraphNode) => GraphNode,
    ): GraphNode[] {
        const neighborIds = this.realAdjacency.get(nodeId);
        if (!neighborIds || neighborIds.size === 0) return [];
        return sourceNodes
            .filter((n) => neighborIds.has(n.id))
            .map((n) => cleanNode(n));
    }

    // =========================================================================
    // Processed-graph queries (for selection highlighting)
    // =========================================================================

    /** Get neighbor IDs from the preprocessed (visual) graph. */
    getProcessedNeighborIds(nodeId: string): ReadonlySet<string> {
        return this.processedAdjacency.get(nodeId) ?? EMPTY_SET;
    }

    // =========================================================================
    // Visual link queries (preprocessed graph)
    // =========================================================================

    /** Get visual link keys for a real-data link between two nodes. O(1) lookup. */
    getVisualLinkKeys(fromId: string, toId: string): string[] {
        const key = this.canonicalKey(fromId, toId);
        // When no groups exist, originalToVisualLinks is empty — fall back to direct key
        return this.originalToVisualLinks.get(key) ?? (this.groupIds.size === 0 ? [key] : []);
    }

    // =========================================================================
    // Group analysis
    // =========================================================================

    /** Get member IDs that have at least one real-data link to a node outside the group. */
    getMembersWithExternalLinks(groupId: string): Set<string> {
        const result = new Set<string>();
        const members = this.groupModel?.getMembers(groupId);
        if (!members) return result;

        for (const memberId of members) {
            const neighbors = this.realAdjacency.get(memberId);
            if (!neighbors) continue;
            for (const neighborId of neighbors) {
                if (!members.has(neighborId) && neighborId !== groupId) {
                    result.add(memberId);
                    break;
                }
            }
        }
        return result;
    }

    /** Get all node IDs outside the group that have real-data links to members. */
    getExternalConnections(groupId: string): Set<string> {
        const result = new Set<string>();
        const members = this.groupModel?.getMembers(groupId);
        if (!members) return result;

        for (const memberId of members) {
            const neighbors = this.realAdjacency.get(memberId);
            if (!neighbors) continue;
            for (const neighborId of neighbors) {
                if (!members.has(neighborId) && neighborId !== groupId) {
                    result.add(neighborId);
                }
            }
        }
        return result;
    }

    /** Walk up the group hierarchy. Returns [immediateGroup, parentGroup, ...]. */
    getGroupChain(nodeId: string): string[] {
        if (!this.groupModel) return [];
        const chain: string[] = [];
        let current: string | undefined = this.groupModel.getGroupOf(nodeId);
        // Walk up: for nested groups, a group node itself can be a member of another group
        while (current) {
            chain.push(current);
            current = this.groupModel.getGroupOf(current);
        }
        return chain;
    }

    /** Get all real (non-group) members recursively. For nested groups, descends into sub-groups. */
    getAllRealMembers(groupId: string): Set<string> {
        const result = new Set<string>();
        if (!this.groupModel) return result;
        this.collectRealMembers(groupId, result);
        return result;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private collectRealMembers(groupId: string, result: Set<string>): void {
        const members = this.groupModel?.getMembers(groupId);
        if (!members) return;
        for (const memberId of members) {
            if (this.groupIds.has(memberId)) {
                // Nested group — recurse
                this.collectRealMembers(memberId, result);
            } else {
                result.add(memberId);
            }
        }
    }

    private addEdge(adj: Map<string, Set<string>>, a: string, b: string): void {
        let setA = adj.get(a);
        if (!setA) { setA = new Set(); adj.set(a, setA); }
        setA.add(b);

        let setB = adj.get(b);
        if (!setB) { setB = new Set(); adj.set(b, setB); }
        setB.add(a);
    }

    private canonicalKey(a: string, b: string): string {
        return a < b ? `${a}→${b}` : `${b}→${a}`;
    }
}
