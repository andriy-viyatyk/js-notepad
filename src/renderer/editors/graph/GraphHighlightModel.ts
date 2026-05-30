import { GraphNode, GraphLink, linkIds } from "./types";

/**
 * Resolved (computed) color values for canvas rendering.
 * Passed in from ForceGraphRenderer which resolves CSS variables.
 */
export interface ResolvedColors {
    nodeDefault: string;
    nodeHighlight: string;
    nodeSelected: string;
    borderDefault: string;
    borderHighlight: string;
    borderSelected: string;
    linkDefault: string;
    linkSelected: string;
    labelBg: string;
    labelText: string;
    groupBorder: string;
    nodeSpecial: string;
    borderSpecial: string;
}

/**
 * Manages highlight layers and selection/hover state for the graph renderer.
 *
 * Highlight layers are named sets of node IDs (e.g., "search", "linksTab", "legend").
 * When multiple layers are active, only the intersection is highlighted (AND logic).
 *
 * Also manages active/hovered node state with neighbor computation.
 */
export class GraphHighlightModel {
    private layers = new Map<string, Set<string>>();

    // Selection/hover state
    activeId = "";
    activeChild = new Set<string>();
    /** All currently selected node IDs (superset — includes activeId). */
    selectedIds = new Set<string>();
    /** Union of neighbors of all selected nodes. */
    selectedChildren = new Set<string>();
    hoveredId = "";
    hoveredChild = new Set<string>();
    externalHoverId = "";
    hoveredBadgeNodeId = "";
    /** Canonical link keys on visual paths from selected nodes to their real neighbors. */
    selectedLinkKeys = new Set<string>();
    /** Canonical link keys on visual path from selected node(s) to the hovered node. */
    hoveredLinkKeys = new Set<string>();

    // =========================================================================
    // Layer management
    // =========================================================================

    /** Set a named highlight layer. Null or undefined clears the layer. */
    setLayer(name: string, ids: Set<string> | null): void {
        if (ids && ids.size > 0) {
            this.layers.set(name, ids);
        } else {
            this.layers.delete(name);
        }
    }

    /** Clear a named highlight layer. */
    clearLayer(name: string): void {
        this.layers.delete(name);
    }

    /**
     * Compute the intersection of all active highlight layers.
     * Returns null if no layers are active (no dimming).
     * Returns a Set of node IDs that should be fully visible (rest are dimmed).
     */
    computeDimSet(): Set<string> | null {
        const activeLayers = [...this.layers.values()];
        if (activeLayers.length === 0) return null;
        if (activeLayers.length === 1) return activeLayers[0];

        // Intersection of all layers
        return new Set(
            [...activeLayers[0]].filter((id) => activeLayers.every((s) => s.has(id))),
        );
    }

    // =========================================================================
    // Selection/hover
    // =========================================================================

    /** Set single selection (replaces any multi-selection). */
    selectSingle(id: string, neighbors: ReadonlySet<string>): void {
        this.activeId = id;
        this.activeChild = id ? new Set(neighbors) : new Set();
        this.selectedIds = id ? new Set([id]) : new Set();
        this.selectedChildren = this.activeChild;
    }

    /** Toggle a node in/out of multi-selection. */
    toggleSelected(id: string, getNeighbors: (nodeId: string) => ReadonlySet<string>): void {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        // Update activeId to the last toggled-in node (or first remaining, or empty)
        if (this.selectedIds.has(id)) {
            this.activeId = id;
            this.activeChild = new Set(getNeighbors(id));
        } else if (this.selectedIds.size > 0) {
            const last = [...this.selectedIds].pop();
            this.activeId = last;
            this.activeChild = new Set(getNeighbors(last));
        } else {
            this.activeId = "";
            this.activeChild = new Set();
        }
        // Recompute union of neighbors for all selected nodes
        const children = new Set<string>();
        for (const nodeId of this.selectedIds) {
            for (const neighborId of getNeighbors(nodeId)) {
                if (!this.selectedIds.has(neighborId)) {
                    children.add(neighborId);
                }
            }
        }
        this.selectedChildren = children;
    }

    /** Clear all selection state. */
    clearSelection(): void {
        this.selectSingle("", new Set());
    }

    /** Set the hovered node with pre-computed neighbors. */
    setHoveredId(id: string, neighbors: ReadonlySet<string>): void {
        this.hoveredId = id;
        this.hoveredChild = id ? new Set(neighbors) : new Set();
    }

    /** Set hover from external source (e.g. grid row focus). */
    setExternalHover(id: string, neighbors: ReadonlySet<string>): void {
        this.externalHoverId = id;
        if (this.hoveredId === id) return;
        this.hoveredId = id;
        this.hoveredChild = id ? new Set(neighbors) : new Set();
    }

    /** Clear active/hovered state if the node is not in the given set. */
    clearSelectionIf(nodeIds: Set<string>): void {
        if (this.activeId && !nodeIds.has(this.activeId)) {
            this.activeId = "";
            this.activeChild = new Set();
        }
        // Remove any selected nodes that no longer exist
        let selectionChanged = false;
        for (const id of this.selectedIds) {
            if (!nodeIds.has(id)) {
                this.selectedIds.delete(id);
                selectionChanged = true;
            }
        }
        if (selectionChanged) {
            this.selectedChildren = new Set(); // Will be recomputed on next render if needed
        }
        if (this.hoveredId && !nodeIds.has(this.hoveredId) && !this.externalHoverId) {
            this.hoveredId = "";
            this.hoveredChild = new Set();
        }
    }

    /** Reset all selection/hover state. */
    clearAll(): void {
        this.activeId = "";
        this.activeChild = new Set();
        this.selectedIds = new Set();
        this.selectedChildren = new Set();
        this.hoveredId = "";
        this.hoveredChild = new Set();
    }

    // =========================================================================
    // Color helpers
    // =========================================================================

    nodeColor(node: GraphNode, colors: ResolvedColors, isSpecial?: boolean): string {
        if (this.selectedIds.has(node.id)) return colors.nodeSelected;
        if (node.id === this.hoveredId) return colors.nodeHighlight;
        return isSpecial ? colors.nodeSpecial : colors.nodeDefault;
    }

    nodeBorderColor(node: GraphNode, colors: ResolvedColors, isSpecial?: boolean): string {
        if (this.selectedIds.has(node.id)) return colors.borderSelected;
        if (node.id === this.hoveredId) return colors.borderHighlight;
        if (this.hoveredChild.has(node.id)) return colors.borderHighlight;
        return isSpecial ? colors.borderSpecial : colors.borderDefault;
    }

    labelTextColor(node: GraphNode, colors: ResolvedColors, isSpecial?: boolean): string {
        if (this.selectedIds.has(node.id)) return colors.nodeSelected;
        if (node.id === this.hoveredId || this.hoveredChild.has(node.id)) return colors.nodeHighlight;
        return isSpecial ? colors.nodeSpecial : colors.labelText;
    }

    linkColor(link: GraphLink, colors: ResolvedColors): string {
        const { source, target } = linkIds(link);
        const key = (this.selectedLinkKeys.size > 0 || this.hoveredLinkKeys.size > 0)
            ? (source < target ? `${source}→${target}` : `${target}→${source}`)
            : "";
        // Green highlight for the full visual path between selected node(s) and hovered node
        if (key && this.hoveredLinkKeys.has(key)) return colors.borderHighlight;
        // Orange for links on visual paths to real neighbors of selected nodes
        if (key && this.selectedLinkKeys.has(key)) return colors.linkSelected;
        return this.selectedIds.has(source) || this.selectedIds.has(target)
            ? colors.linkSelected
            : colors.linkDefault;
    }

}
