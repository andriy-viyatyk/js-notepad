import { GraphNode, GraphLink, linkIds } from "./types";

const EMPTY_SET: ReadonlySet<string> = new Set();

export interface PreprocessedGraph {
    nodes: GraphNode[];
    links: GraphLink[];
    syntheticLinkCounts: Map<string, number>;
    /** Maps original real-data link key → array of visual link keys it was split into.
     *  For unsplit links (intra-group, external), the array contains the original key itself.
     *  Used for O(1) path highlighting instead of BFS. */
    originalToVisualLinks: Map<string, string[]>;
}

/**
 * Read-only analysis model for group node membership.
 * Tracks which nodes are groups and which nodes belong to which group.
 *
 * Membership is derived from links: any link between a group node and a non-group node
 * (in either direction) means the non-group node is a member. A node can belong to at most one group.
 *
 * This model does NOT transform data — that is the job of the link pre-processing step.
 * It only provides membership lookups for UI purposes (tooltip, detail panel, legend).
 */
export class GraphGroupModel {
    /** Map from group node ID → Set of member node IDs. */
    private groups = new Map<string, Set<string>>();
    /** Map from member node ID → group node ID (reverse lookup). */
    private memberOf = new Map<string, string>();

    /** Rebuild membership from source data. Call after any data change. */
    rebuild(nodes: GraphNode[], links: GraphLink[]): void {
        this.groups.clear();
        this.memberOf.clear();

        // Phase 1: Collect group IDs
        const groupIds = new Set<string>();
        for (const node of nodes) {
            if (node.isGroup) {
                groupIds.add(node.id);
                this.groups.set(node.id, new Set());
            }
        }

        if (groupIds.size === 0) return;

        // Phase 2a: Process links where exactly one endpoint is a group (unambiguous)
        for (const link of links) {
            const { source, target } = linkIds(link);
            if (groupIds.has(source) && !groupIds.has(target)) {
                this.groups.get(source).add(target);
                if (!this.memberOf.has(target)) this.memberOf.set(target, source);
            } else if (groupIds.has(target) && !groupIds.has(source)) {
                this.groups.get(target).add(source);
                if (!this.memberOf.has(source)) this.memberOf.set(source, target);
            }
        }

        // Phase 2b: Process group-to-group links (with cycle detection)
        for (const link of links) {
            const { source, target } = linkIds(link);
            if (!groupIds.has(source) || !groupIds.has(target)) continue;
            // Skip if already resolved
            if (this.memberOf.has(source) && this.memberOf.get(source) === target) continue;
            if (this.memberOf.has(target) && this.memberOf.get(target) === source) continue;
            if (this.memberOf.has(target) && this.memberOf.has(source)) continue;

            // Try source-as-parent first; if cycle, try target-as-parent
            if (!this.memberOf.has(target)) {
                if (!this.wouldCreateCycleInternal(source, target)) {
                    this.groups.get(source).add(target);
                    this.memberOf.set(target, source);
                    continue;
                }
            }
            if (!this.memberOf.has(source)) {
                if (!this.wouldCreateCycleInternal(target, source)) {
                    this.groups.get(target).add(source);
                    this.memberOf.set(source, target);
                }
            }
        }
    }

    /** Check if a node is a group node. */
    isGroup(nodeId: string): boolean {
        return this.groups.has(nodeId);
    }

    /** Get the group a node belongs to (undefined if not in any group). */
    getGroupOf(nodeId: string): string | undefined {
        return this.memberOf.get(nodeId);
    }

    /** Get all member IDs of a group node (empty set if not a group). */
    getMembers(groupId: string): ReadonlySet<string> {
        return this.groups.get(groupId) ?? EMPTY_SET;
    }

    /** Get count of groups. */
    get groupCount(): number {
        return this.groups.size;
    }

    /** Get IDs of group nodes that have zero members. */
    getEmptyGroupIds(): string[] {
        const result: string[] = [];
        for (const [groupId, members] of this.groups) {
            if (members.size === 0) result.push(groupId);
        }
        return result;
    }

    /** Check if adding childId as member of parentGroupId would create a cycle. */
    wouldCreateCycle(parentGroupId: string, childId: string): boolean {
        return this.wouldCreateCycleInternal(parentGroupId, childId);
    }

    private wouldCreateCycleInternal(parentId: string, childId: string): boolean {
        let current: string | undefined = parentId;
        while (current) {
            if (current === childId) return true;
            current = this.memberOf.get(current);
        }
        return false;
    }

    /**
     * Pre-process links for visualization: hide membership links, split cross-group
     * and inter-group links through group nodes, deduplicate synthetic links.
     *
     * Pure transformation — does not modify source data or internal state.
     * The root node is excluded from group membership so it stays outside all groups.
     */
    preprocess(nodes: GraphNode[], links: GraphLink[], rootNodeId: string): PreprocessedGraph {
        const empty: PreprocessedGraph = {
            nodes, links, syntheticLinkCounts: new Map(), originalToVisualLinks: new Map(),
        };
        if (this.groups.size === 0) return empty;

        // 1. Build effective memberOf map (exclude root from membership)
        const effectiveMemberOf = new Map(this.memberOf);
        if (rootNodeId) effectiveMemberOf.delete(rootNodeId);

        // 2. Build effective groups map (remove root from its group's member set)
        const effectiveGroups = new Map<string, Set<string>>();
        for (const [groupId, members] of this.groups) {
            const copy = new Set(members);
            if (rootNodeId) copy.delete(rootNodeId);
            effectiveGroups.set(groupId, copy);
        }

        // Helper: get ancestor chain [immediateGroup, parentGroup, ...] (excludes node itself)
        const getAncestorChain = (id: string): string[] => {
            const chain: string[] = [];
            let current: string | undefined = effectiveMemberOf.get(id);
            while (current) {
                chain.push(current);
                current = effectiveMemberOf.get(current);
            }
            return chain;
        };

        // 3. Classify links and collect output
        const syntheticMap = new Map<string, GraphLink>();
        const syntheticCounts = new Map<string, number>();
        const outputLinks: GraphLink[] = [];
        const originalToVisualLinks = new Map<string, string[]>();

        const canonicalKey = (a: string, b: string): string =>
            a < b ? `${a}→${b}` : `${b}→${a}`;

        let currentVisualKeys: string[] = [];

        const addSynthetic = (source: string, target: string): void => {
            if (source === target) return;
            const key = canonicalKey(source, target);
            currentVisualKeys.push(key);
            const existing = syntheticCounts.get(key) ?? 0;
            syntheticCounts.set(key, existing + 1);
            if (!syntheticMap.has(key)) {
                syntheticMap.set(key, { source, target });
            }
        };

        for (const link of links) {
            const { source, target } = linkIds(link);

            // Rule 1: Membership link — skip
            if (this.groups.has(source) && effectiveGroups.get(source)?.has(target)) continue;
            if (this.groups.has(target) && effectiveGroups.get(target)?.has(source)) continue;

            const originalKey = canonicalKey(source, target);
            currentVisualKeys = [];

            // Build full paths: [node, immediateGroup, parentGroup, ...]
            const sAncestors = getAncestorChain(source);
            const tAncestors = getAncestorChain(target);
            const sPath = [source, ...sAncestors];
            const tPath = [target, ...tAncestors];

            // Find LCA: first node in tPath that also appears in sPath
            const sSet = new Set(sPath);
            let lca: string | null = null;
            let lcaIndexInT = -1;
            for (let i = 0; i < tPath.length; i++) {
                if (sSet.has(tPath[i])) {
                    lca = tPath[i];
                    lcaIndexInT = i;
                    break;
                }
            }
            let lcaIndexInS = -1;
            if (lca !== null) {
                lcaIndexInS = sPath.indexOf(lca);
            }

            // Determine routing
            if (sAncestors.length === 0 && tAncestors.length === 0) {
                // Neither in any group → keep as-is (External)
                outputLinks.push(link);
                currentVisualKeys.push(originalKey);
            } else if (sAncestors.length > 0 && tAncestors.length > 0 && sAncestors[0] === tAncestors[0]) {
                // Same immediate group → keep as-is (Intra-group)
                outputLinks.push(link);
                currentVisualKeys.push(originalKey);
            } else {
                // Route through group hierarchy via LCA
                const sTrimmed = lca !== null ? sPath.slice(0, lcaIndexInS) : sPath;
                const tTrimmed = lca !== null ? tPath.slice(0, lcaIndexInT) : tPath;

                // Synthetic links along source side (ascending)
                for (let i = 0; i < sTrimmed.length - 1; i++) {
                    addSynthetic(sTrimmed[i], sTrimmed[i + 1]);
                }
                // Synthetic links along target side (ascending)
                for (let i = 0; i < tTrimmed.length - 1; i++) {
                    addSynthetic(tTrimmed[i], tTrimmed[i + 1]);
                }
                // Bridge between tops of both sides
                const sTop = sTrimmed[sTrimmed.length - 1];
                const tTop = tTrimmed[tTrimmed.length - 1];
                if (sTop !== tTop) {
                    addSynthetic(sTop, tTop);
                }
            }

            originalToVisualLinks.set(originalKey, currentVisualKeys);
        }

        // 4. Add deduplicated synthetic links to output
        for (const [, link] of syntheticMap) {
            outputLinks.push(link);
        }

        return { nodes, links: outputLinks, syntheticLinkCounts: syntheticCounts, originalToVisualLinks };
    }
}
