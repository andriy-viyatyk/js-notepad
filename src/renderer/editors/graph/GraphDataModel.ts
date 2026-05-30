import { GraphLegend, GraphLink, GraphNode, GraphOptions, NodeShape, SYS_PREFIX, linkIds, nodeLabel } from "./types";

// =============================================================================
// Source data (Layer 1 — clean, editable, serializable)
// =============================================================================

export interface SourceData {
    nodes: GraphNode[];
    links: GraphLink[];
    options?: GraphOptions;
}

// =============================================================================
// GraphDataModel — owns graph source data and CRUD operations
// =============================================================================

/** Keys added by D3 simulation — not part of user data. */
const SIM_KEYS = new Set(["x", "y", "vx", "vy", "fx", "fy", "index"]);

/**
 * Passive data store for graph node/link data and legend metadata.
 * All mutation methods modify sourceData in place but do NOT fire events.
 * The ViewModel calls methods then explicitly orchestrates rebuild/serialize.
 */
export class GraphDataModel {
    sourceData: SourceData | null = null;

    // =========================================================================
    // Node CRUD
    // =========================================================================

    /** Add a new node with the given ID. Returns the ID. */
    addNode(id?: string): string {
        if (!this.sourceData) {
            this.sourceData = { nodes: [], links: [] };
        }
        const nodeId = id ?? this.generateNodeId();
        this.sourceData.nodes.push({ id: nodeId });
        return nodeId;
    }

    deleteNode(nodeId: string): void {
        if (!this.sourceData) return;

        this.sourceData.nodes = this.sourceData.nodes.filter((n) => n.id !== nodeId);
        this.sourceData.links = this.sourceData.links.filter((link) => {
            const { source, target } = linkIds(link);
            return source !== nodeId && target !== nodeId;
        });
    }

    /**
     * Rename a node ID in sourceData (nodes, links, options.rootNode).
     * Returns false if newId is taken or node not found.
     * Does NOT handle visibility/renderer — ViewModel does that.
     */
    renameNode(oldId: string, newId: string): boolean {
        if (!this.sourceData) return false;
        newId = newId.trim();
        if (!newId || newId === oldId) return false;
        if (this.sourceData.nodes.some((n) => n.id === newId)) return false;

        const node = this.sourceData.nodes.find((n) => n.id === oldId);
        if (!node) return false;
        node.id = newId;

        // Update all links referencing old ID
        for (const link of this.sourceData.links) {
            if (typeof link.source === "string" && link.source === oldId) link.source = newId;
            if (typeof link.target === "string" && link.target === oldId) link.target = newId;
        }

        // Update options.rootNode if it matches
        if (this.sourceData.options?.rootNode === oldId) {
            this.sourceData.options.rootNode = newId;
        }

        return true;
    }

    updateNodeProps(nodeId: string, props: Partial<GraphNode>): void {
        if (!this.sourceData) return;
        const node = this.sourceData.nodes.find((n) => n.id === nodeId);
        if (!node) return;

        for (const [key, value] of Object.entries(props)) {
            if (key === "id") continue; // Use renameNode for ID changes
            if (value === undefined || value === "" || value === null) {
                delete (node as any)[key];
            } else {
                (node as any)[key] = value;
            }
        }
    }

    addChild(parentId: string): string {
        if (!this.sourceData) return "";
        const id = this.generateNodeId();
        this.sourceData.nodes.push({ id });
        this.sourceData.links.push({ source: parentId, target: id });
        return id;
    }

    // =========================================================================
    // Link operations
    // =========================================================================

    addLink(sourceId: string, targetId: string): void {
        if (!this.sourceData) return;
        if (sourceId === targetId) return;
        if (this.linkExists(sourceId, targetId)) return;

        this.sourceData.links.push({ source: sourceId, target: targetId });
    }

    deleteLink(sourceId: string, targetId: string): void {
        if (!this.sourceData) return;

        this.sourceData.links = this.sourceData.links.filter((link) => {
            const { source, target } = linkIds(link);
            return !(
                (source === sourceId && target === targetId) ||
                (source === targetId && target === sourceId)
            );
        });
    }

    // =========================================================================
    // Batch apply (Links tab)
    // =========================================================================

    /**
     * Apply batch changes from the Links tab grid.
     * @param selectedNodeId — the currently selected node (parent)
     * @param rows — grid rows after user edits (each has at least `id`)
     * @param originalIds — set of IDs that were in the grid when it was loaded
     */
    applyLinkedNodesUpdate(
        selectedNodeId: string,
        rows: Record<string, unknown>[],
        originalIds: Set<string>,
    ): void {
        if (!this.sourceData) return;

        const currentIds = new Set(rows.map((r) => r.id as string).filter(Boolean));

        // 1. Removed rows: in original but not in current
        for (const oldId of originalIds) {
            if (!currentIds.has(oldId)) {
                this.removeLinkSmart(selectedNodeId, oldId);
            }
        }

        // 2. New + modified rows
        for (const row of rows) {
            const id = (row.id as string)?.trim();
            if (!id) continue;

            if (!originalIds.has(id)) {
                // New row — create node if needed, add link
                if (!this.sourceData.nodes.some((n) => n.id === id)) {
                    this.sourceData.nodes.push({ id });
                }
                if (!this.linkExists(selectedNodeId, id) && selectedNodeId !== id) {
                    this.sourceData.links.push({ source: selectedNodeId, target: id });
                }
            }

            // Update properties (for both new and existing)
            const node = this.sourceData.nodes.find((n) => n.id === id);
            if (node) {
                this.applyRowPropsToNode(node, row);
            }
        }
    }

    // =========================================================================
    // Batch apply (Properties tab)
    // =========================================================================

    /**
     * Apply batch property changes from the Properties tab grid.
     * @param nodeId — the selected node
     * @param propsToSet — key-value pairs to set (overwrites existing)
     * @param keysToRemove — property keys to delete from the node
     */
    applyPropertiesUpdate(
        nodeId: string,
        propsToSet: Record<string, string>,
        keysToRemove: string[],
    ): void {
        if (!this.sourceData) return;
        const node = this.sourceData.nodes.find((n) => n.id === nodeId);
        if (!node) return;

        for (const key of keysToRemove) {
            delete (node as any)[key];
        }

        for (const [key, value] of Object.entries(propsToSet)) {
            (node as any)[key] = value;
        }
    }

    // =========================================================================
    // Legend
    // =========================================================================

    /** Get legend descriptions from options. */
    getLegendDescriptions(): GraphLegend {
        return this.sourceData?.options?.legend ?? {};
    }

    /** Set a single legend description. */
    setLegendDescription(tab: "levels" | "shapes", key: string, value: string): void {
        if (!this.sourceData) return;
        if (!this.sourceData.options) this.sourceData.options = {};
        if (!this.sourceData.options.legend) this.sourceData.options.legend = {};
        const legend = this.sourceData.options.legend;

        // Root description is canonical in levels.root — sync to both
        if (key === "root") {
            if (!legend.levels) legend.levels = {};
            if (!legend.shapes) legend.shapes = {};
            if (value) {
                legend.levels.root = value;
                legend.shapes.root = value;
            } else {
                delete legend.levels.root;
                delete legend.shapes.root;
            }
        } else {
            if (!legend[tab]) legend[tab] = {};
            if (value) {
                legend[tab][key] = value;
            } else {
                delete legend[tab][key];
            }
        }

        // Cleanup empty objects
        if (legend.levels && Object.keys(legend.levels).length === 0) delete legend.levels;
        if (legend.shapes && Object.keys(legend.shapes).length === 0) delete legend.shapes;
        if (!legend.levels && !legend.shapes) delete this.sourceData.options.legend;
    }

    /** Get node IDs matching a filter (for legend highlighting). Operates on visible nodes. */
    getNodeIdsByLegendFilter(
        filter: { levels?: Set<number>; shapes?: Set<string>; includeRoot?: boolean; includeGroup?: boolean },
        visibleNodes: GraphNode[],
    ): Set<string> {
        const result = new Set<string>();
        const rootId = this.sourceData?.options?.rootNode ?? "";

        for (const node of visibleNodes) {
            const isRoot = rootId !== "" && node.id === rootId;

            if (filter.includeRoot && isRoot) {
                result.add(node.id);
                continue;
            }

            if (filter.includeGroup && node.isGroup) {
                result.add(node.id);
                continue;
            }

            if (filter.levels) {
                const level = typeof node.level === "number" && node.level >= 1 && node.level <= 5 ? node.level : 5;
                if (filter.levels.has(level)) {
                    result.add(node.id);
                    continue;
                }
            }

            if (filter.shapes) {
                const shape = isRoot ? "compass" : (node.shape || "circle");
                if (filter.shapes.has(shape)) {
                    result.add(node.id);
                }
            }
        }

        return result;
    }

    /** Get set of levels and shapes present in visible nodes. */
    getPresentLevelsAndShapes(visibleNodes: GraphNode[]): { levels: Set<number>; shapes: Set<NodeShape>; hasRoot: boolean; hasGroup: boolean } {
        const levels = new Set<number>();
        const shapes = new Set<NodeShape>();
        const rootId = this.sourceData?.options?.rootNode ?? "";
        let hasRoot = false;
        let hasGroup = false;

        for (const node of visibleNodes) {
            if (rootId !== "" && node.id === rootId) {
                hasRoot = true;
                continue; // root has its own entry, don't count its level/shape
            }
            if (node.isGroup) {
                hasGroup = true;
                continue; // group has its own entry, don't count its level/shape
            }
            const level = typeof node.level === "number" && node.level >= 1 && node.level <= 5 ? node.level : 5;
            levels.add(level);
            shapes.add(node.shape || "circle");
        }

        return { levels, shapes, hasRoot, hasGroup };
    }

    // =========================================================================
    // Linked nodes helpers
    // =========================================================================

    /** Strip _$ runtime and D3 simulation properties, return clean copy. */
    cleanNode(node: GraphNode): GraphNode {
        const clean: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(node)) {
            if (!key.startsWith(SYS_PREFIX) && !SIM_KEYS.has(key)) {
                clean[key] = value;
            }
        }
        return clean as unknown as GraphNode;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    generateNodeId(): string {
        if (!this.sourceData) return "node-1";
        const existingIds = new Set(this.sourceData.nodes.map((n) => n.id));
        let i = 1;
        while (existingIds.has(`node-${i}`)) i++;
        return `node-${i}`;
    }

    generateGroupId(): string {
        if (!this.sourceData) return "group-1";
        const existingIds = new Set(this.sourceData.nodes.map((n) => n.id));
        let i = 1;
        while (existingIds.has(`group-${i}`)) i++;
        return `group-${i}`;
    }

    removeAllNodeLinks(nodeId: string): void {
        if (!this.sourceData) return;
        this.sourceData.links = this.sourceData.links.filter((link) => {
            const { source, target } = linkIds(link);
            return source !== nodeId && target !== nodeId;
        });
    }

    linkExists(aId: string, bId: string): boolean {
        if (!this.sourceData) return false;
        return this.sourceData.links.some((link) => {
            const { source, target } = linkIds(link);
            return (source === aId && target === bId) || (source === bId && target === aId);
        });
    }

    getNodeLabel(nodeId: string): string {
        const node = this.sourceData?.nodes.find((n) => n.id === nodeId);
        return node ? nodeLabel(node) : nodeId;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Smart link removal:
     * - Always removes the link between aId and bId
     * - If bId has no other links after removal, also deletes the node
     */
    private removeLinkSmart(aId: string, bId: string): void {
        if (!this.sourceData) return;

        // Remove the link
        this.sourceData.links = this.sourceData.links.filter((link) => {
            const { source, target } = linkIds(link);
            return !(
                (source === aId && target === bId) ||
                (source === bId && target === aId)
            );
        });

        // Check if bId has any remaining links
        const hasOtherLinks = this.sourceData.links.some((link) => {
            const { source, target } = linkIds(link);
            return source === bId || target === bId;
        });

        // If orphaned, delete the node too
        if (!hasOtherLinks) {
            this.sourceData.nodes = this.sourceData.nodes.filter((n) => n.id !== bId);
        }
    }

    /** Apply row properties to a node, skipping 'id' and empty values. */
    private applyRowPropsToNode(node: GraphNode, row: Record<string, unknown>): void {
        for (const [key, value] of Object.entries(row)) {
            if (key === "id") continue;
            if (value === undefined || value === null || value === "") {
                delete (node as any)[key];
            } else {
                (node as any)[key] = value;
            }
        }
    }
}
