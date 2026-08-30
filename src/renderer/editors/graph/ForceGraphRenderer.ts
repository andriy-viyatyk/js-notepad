import * as d3 from "d3";
import { zoom as d3Zoom, D3ZoomEvent } from "d3-zoom";
import { drag as d3Drag, D3DragEvent } from "d3-drag";
import { GraphData, GraphNode, GraphLink, NodeShape, linkIds, nodeLabel, effectiveNodeRadius } from "./types";
import { getShapePoints } from "./shapeGeometry";
import { forceProperties } from "./constants";
import { GraphHighlightModel, ResolvedColors } from "./GraphHighlightModel";
import type { GraphConnectivityModel } from "./GraphConnectivityModel";
import color from "../../theme/color";
import { resolveColor } from "../../theme/themes";
import { closeAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";

function resolveColors(): ResolvedColors {
    return {
        nodeDefault: resolveColor(color.graph.nodeDefault),
        nodeHighlight: resolveColor(color.graph.nodeHighlight),
        nodeSelected: resolveColor(color.graph.nodeSelected),
        borderDefault: resolveColor(color.graph.nodeBorderDefault),
        borderHighlight: resolveColor(color.graph.nodeBorderHighlight),
        borderSelected: resolveColor(color.graph.nodeBorderSelected),
        linkDefault: resolveColor(color.graph.linkDefault),
        linkSelected: resolveColor(color.graph.linkSelected),
        labelBg: resolveColor(color.graph.labelBackground),
        labelText: resolveColor(color.graph.labelText),
        groupBorder: resolveColor(color.graph.groupBorder),
        nodeSpecial: resolveColor(color.graph.nodeSpecial),
        borderSpecial: resolveColor(color.graph.borderSpecial),
    };
}

/**
 * Manages D3 force simulation and canvas rendering for a force-directed graph.
 *
 * Lifecycle: create → setCanvas() → updateData() → dispose()
 */
export interface ForceParams {
    charge: number;
    linkDistance: number;
    collide: number;
}

const defaultForceParams: ForceParams = {
    charge: forceProperties.charge.strength,
    linkDistance: forceProperties.link.distance,
    collide: forceProperties.collide.strength,
};

export class ForceGraphRenderer {
    private canvas: HTMLCanvasElement | null = null;
    private simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
    private isDraggingNode = false;
    private graphData: GraphData = { nodes: [], links: [] };
    private dimensions = { width: 0, height: 0 };
    private transform = d3.zoomIdentity;
    private _forceParams: ForceParams = { ...defaultForceParams };

    private readonly highlight = new GraphHighlightModel();
    private colors: ResolvedColors = resolveColors();
    private resizeObserver: ResizeObserver | null = null;

    /** Callback for badge click (expand hidden neighbors). `deep` is true when Ctrl is held. */
    onBadgeExpand: ((nodeId: string, deep: boolean) => void) | null = null;
    /** Callback when hovered node changes. Provides node ID and screen coordinates. */
    onHoverChanged: ((nodeId: string, clientX: number, clientY: number) => void) | null = null;
    /** Callback for right-click context menu. Provides node ID (empty = empty area) and screen coordinates. */
    onContextMenuAction: ((nodeId: string, clientX: number, clientY: number) => void) | null = null;
    /** Callback for Alt+Click on a node (link toggle). */
    onAltClick: ((nodeId: string) => void) | null = null;
    /** Callback when selection changes. Provides set of selected node IDs. */
    onSelectionChanged: ((selectedIds: Set<string>) => void) | null = null;
    /** Callback for double-click on a node. */
    onDoubleClick: ((nodeId: string) => void) | null = null;
    /** Synthetic link counts from group pre-processing (for per-link force distance). */
    syntheticLinkCounts: Map<string, number> | null = null;
    /** Connectivity model for neighbor lookups. */
    connectivityModel: GraphConnectivityModel | null = null;
    private _rootNodeId = "";
    private _lastClientX = 0;
    private _lastClientY = 0;

    // =========================================================================
    // Public API
    // =========================================================================

    setCanvas(canvas: HTMLCanvasElement | null): void {
        if (this.canvas === canvas) return;

        this.cleanupCanvas();
        this.canvas = canvas;

        if (canvas) {
            this.simulation = d3.forceSimulation<GraphNode, GraphLink>([]);
            // D3 owns the simulation and behavior callbacks until cleanupCanvas();
            // they are external-object resources, not view/model subscriptions.
            this.simulation.on("tick", this.renderData);
            this.addDrag();
            this.addZoom();
            this.handleResize();

            this.resizeObserver = new ResizeObserver(() => this.handleResize());
            this.resizeObserver.observe(canvas);

            // If data was loaded before canvas was ready, apply it now
            if (this.graphData.nodes.length > 0) {
                this.simulation.nodes(this.graphData.nodes);
                this.initializeForces(this.graphData.links);
            }
        }
    }

    updateData(graphData: GraphData): void {
        this.graphData = graphData;
        this.highlight.clearAll();

        if (this.simulation) {
            this.simulation.nodes(graphData.nodes);
            this.initializeForces(graphData.links);
        }
    }

    /** Update with new visible data, preserving positions of existing nodes.
     *  @param anchorNodeId — optional node ID near which to place newly appearing nodes.
     *  @param newNodePositions — explicit world positions for brand-new nodes (e.g. from context menu "Add Node"). */
    updateVisibleData(graphData: GraphData, anchorNodeId?: string, newNodePositions?: Map<string, { x: number; y: number }>): void {
        // Save positions of current nodes
        const positions = new Map<string, { x: number; y: number; vx?: number; vy?: number }>();
        for (const node of this.graphData.nodes) {
            if (node.x !== undefined && node.y !== undefined) {
                positions.set(node.id, { x: node.x, y: node.y, vx: node.vx, vy: node.vy });
            }
        }

        // Anchor position: where new nodes should appear (near the clicked node)
        const anchor = anchorNodeId ? positions.get(anchorNodeId) : undefined;

        // Restore positions for existing nodes; place new nodes near anchor or at explicit positions
        for (const node of graphData.nodes) {
            const pos = positions.get(node.id);
            if (pos) {
                node.x = pos.x;
                node.y = pos.y;
                node.vx = pos.vx;
                node.vy = pos.vy;
            } else if (newNodePositions?.has(node.id)) {
                const hint = newNodePositions.get(node.id);
                node.x = hint.x;
                node.y = hint.y;
            } else if (anchor) {
                // New node — place near anchor with small random offset so they spread out
                node.x = anchor.x + (Math.random() - 0.5) * 20;
                node.y = anchor.y + (Math.random() - 0.5) * 20;
            }
        }

        this.graphData = graphData;

        // Clear selection if the selected/hovered node is no longer visible
        const nodeIds = new Set(graphData.nodes.map((n) => n.id));
        this.highlight.clearSelectionIf(nodeIds);

        if (this.simulation) {
            this.simulation.nodes(graphData.nodes);
            this.initializeForces(graphData.links);
        }
    }

    /** Re-resolve CSS variable colors (call on theme change). */
    refreshColors(): void {
        const next = resolveColors();
        const keys = Object.keys(next) as Array<keyof ResolvedColors>;
        if (keys.every((key) => next[key] === this.colors[key])) return;
        this.colors = next;
        this.renderData();
    }

    /** Set of node IDs matching search. Null = no search active. */
    setSearchMatches(matchIds: Set<string> | null): void {
        this.highlight.setLayer("search", matchIds);
        this.renderData();
    }

    /** Set of node IDs to highlight (e.g. links tab). Null = no highlight active. */
    setHighlightSet(ids: Set<string> | null): void {
        this.highlight.setLayer("linksTab", ids);
        this.renderData();
    }

    /** Set of node IDs to highlight from the legend panel. Null = no legend highlight active. */
    setLegendHighlight(ids: Set<string> | null): void {
        this.highlight.setLayer("legend", ids);
        this.renderData();
    }

    /** Set Alt-key highlight layer (selected + children). Null to clear. */
    setAltKeyHighlight(ids: Set<string> | null): void {
        this.highlight.setLayer("altKey", ids);
        this.renderData();
    }

    /** Set hover state from external source (e.g. grid row focus). Empty string clears. */
    setExternalHover(id: string, neighbors: ReadonlySet<string>): void {
        if (this.highlight.hoveredId === id && this.highlight.externalHoverId === id) return;
        this.highlight.setExternalHover(id, neighbors);
        this.computeHoveredLinkKeys();
        this.renderData();
        // Don't fire onHoverChanged — tooltip is not meaningful for external hover
    }

    /** Whether a node is currently being dragged. */
    get isDragging(): boolean {
        return this.isDraggingNode;
    }

    /** Currently selected (active) node ID (primary — last clicked). */
    get selectedId(): string {
        return this.highlight.activeId;
    }

    /** All currently selected node IDs. */
    get selectedIds(): Set<string> {
        return this.highlight.selectedIds;
    }

    /** Programmatically select a single node (clears multi-selection). */
    selectNode(nodeId: string): void {
        this.setActiveId(nodeId);
    }

    /** Add multiple nodes to the current selection. */
    addToSelection(nodeIds: string[]): void {
        if (nodeIds.length === 0) return;
        const getNeighbors = (nid: string): ReadonlySet<string> =>
            this.connectivityModel?.getProcessedNeighborIds(nid) ?? new Set();
        for (const id of nodeIds) {
            if (!this.highlight.selectedIds.has(id)) {
                this.highlight.toggleSelected(id, getNeighbors);
            }
        }
        this.computeSelectedLinkKeys();
        this.renderData();
        this.onSelectionChanged?.(new Set(this.highlight.selectedIds));
    }

    /** Convert screen coordinates (clientX/clientY) to world coordinates (D3 simulation space). */
    screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
        if (!this.canvas) return { x: 0, y: 0 };
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: this.transform.invertX(clientX - rect.left),
            y: this.transform.invertY(clientY - rect.top),
        };
    }

    /** Get current visible nodes (for search matching). */
    getNodes(): GraphNode[] {
        return this.graphData.nodes;
    }

    /** Get current force parameters. */
    get forceParams(): Readonly<ForceParams> {
        return this._forceParams;
    }

    /** Get default force parameters. */
    static get defaultForceParams(): Readonly<ForceParams> {
        return defaultForceParams;
    }

    /** Update force parameters and restart simulation. */
    updateForceParams(params: Partial<ForceParams>): void {
        Object.assign(this._forceParams, params);
        this.applyTunedForces();
    }

    /** Reset force parameters to defaults and restart simulation. */
    resetForceParams(): void {
        this._forceParams = { ...defaultForceParams };
        this.applyTunedForces();
    }

    /** Set initial force params from saved options (before first render, no simulation restart). */
    setInitialForceParams(params: Partial<ForceParams>): void {
        Object.assign(this._forceParams, params);
    }

    /** Set the root node ID for visual distinction (compass shape, level-1 radius). */
    set rootNodeId(id: string) {
        if (this._rootNodeId === id) return;
        this._rootNodeId = id;
        this.renderData();
    }

    get rootNodeId(): string {
        return this._rootNodeId;
    }

    /** Apply tuned force params without recreating link force. */
    private applyTunedForces(): void {
        if (!this.simulation) return;
        const { width, height } = this.dimensions;
        if (width === 0 || height === 0) return;

        this.applyPositionForces(width, height);

        // Update existing link force distance (don't recreate)
        const linkForce = this.simulation.force("link") as d3.ForceLink<GraphNode, GraphLink> | null;
        if (linkForce) {
            linkForce.distance((link: GraphLink) => this.computeLinkDistance(link));
        }

        this.simulation.alpha(1).restart();
    }

    /** Compute per-link distance, scaling down synthetic group↔group links linearly by collapsed count. */
    private computeLinkDistance(link: GraphLink): number {
        if (!this.syntheticLinkCounts || this.syntheticLinkCounts.size === 0) {
            return this._forceParams.linkDistance;
        }
        const { source, target } = linkIds(link);
        const key = source < target ? `${source}→${target}` : `${target}→${source}`;
        const count = this.syntheticLinkCounts.get(key);
        if (count && count > 1) {
            // Linear scaling: more collapsed links → proportionally shorter distance,
            // clamped to a minimum of 10% of base distance.
            return this._forceParams.linkDistance * Math.max(0.1, 1 / count);
        }
        return this._forceParams.linkDistance;
    }

    dispose(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.simulation?.stop();
        this.simulation = null;
        this.canvas = null;
    }

    // =========================================================================
    // =========================================================================

    onClick = (event: MouseEvent): void => {
        // Close any open popup menu on left-click
        closeAppPopupMenu();

        // Badge click takes priority — expand hidden neighbors
        const badgeNode = this.findBadgeAt(event);
        if (badgeNode && this.onBadgeExpand) {
            this.onBadgeExpand(badgeNode.id, event.ctrlKey);
            return;
        }

        const node = this.findNodeAt(event);

        // Alt+Click → toggle link with selected node
        if (event.altKey && node && this.onAltClick) {
            this.onAltClick(node.id);
            return;
        }

        // Ctrl+Click on a node → toggle multi-selection
        if (event.ctrlKey && node) {
            const getNeighbors = (nid: string): ReadonlySet<string> =>
                this.connectivityModel?.getProcessedNeighborIds(nid) ?? new Set();
            this.highlight.toggleSelected(node.id, getNeighbors);
            this.computeSelectedLinkKeys();
            this.renderData();
            this.onSelectionChanged?.(new Set(this.highlight.selectedIds));
            return;
        }

        // Plain click → single selection (or deselect if empty area)
        this.setActiveId(node?.id ?? "");
    };

    onContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        const node = this.findNodeAt(event);
        this.onContextMenuAction?.(node?.id ?? "", event.clientX, event.clientY);
    };

    onMouseMove = (event: MouseEvent): void => {
        this._lastClientX = event.clientX;
        this._lastClientY = event.clientY;

        const badgeNode = this.findBadgeAt(event);
        const prevBadgeId = this.highlight.hoveredBadgeNodeId;
        this.highlight.hoveredBadgeNodeId = badgeNode?.id ?? "";

        // Update cursor for badge hover
        if (this.canvas) {
            this.canvas.style.cursor = badgeNode ? "pointer" : "";
        }

        // Re-render if badge hover state changed (for highlight effect)
        if (prevBadgeId !== this.highlight.hoveredBadgeNodeId) {
            this.renderData();
        }

        // Skip mouse hover during drag or when external hover is active
        if (!this.isDraggingNode && !this.highlight.externalHoverId) {
            const node = this.findNodeAt(event);
            this.setHoveredId(node?.id ?? "");
        }
    };

    onDblClick = (event: MouseEvent): void => {
        const node = this.findNodeAt(event);
        if (node) {
            this.onDoubleClick?.(node.id);
        }
    };

    // =========================================================================
    // Internals — dimensions
    // =========================================================================

    private handleResize = (): void => {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        if (width === this.dimensions.width && height === this.dimensions.height) return;
        this.dimensions = { width, height };

        if (width > 0 && height > 0) {
            const dpr = window.devicePixelRatio || 1;
            const ctx = this.canvas.getContext("2d");
            if (ctx) {
                this.canvas.width = width * dpr;
                this.canvas.height = height * dpr;
                ctx.scale(dpr, dpr);
            }
        }

        // Re-apply position forces with new center (don't recreate link force)
        setTimeout(() => this.updatePositionForces(), 0);
    };

    // =========================================================================
    // Internals — simulation forces
    // =========================================================================

    /**
     * Full force setup including link force. Call only when graph data changes
     * (nodes must already be set on simulation before this is called).
     */
    private initializeForces(links: GraphLink[]): void {
        const { width, height } = this.dimensions;
        if (!this.simulation || width === 0 || height === 0) return;

        this.applyPositionForces(width, height);

        this.simulation.force(
            "link",
            forceProperties.link.enabled
                ? d3.forceLink<GraphNode, GraphLink>(links)
                    .id((d) => d.id)
                    .distance((link: GraphLink) => this.computeLinkDistance(link))
                    .iterations(forceProperties.link.iterations)
                : null,
        );

        this.simulation.alpha(1).restart();
    }

    /**
     * Update only position-related forces (center, charge, collide, forceX, forceY).
     * Safe to call on resize — does not recreate the link force.
     */
    private updatePositionForces(): void {
        const { width, height } = this.dimensions;
        if (!this.simulation || width === 0 || height === 0) return;

        this.applyPositionForces(width, height);
        this.simulation.alpha(1).restart();
    }

    private applyPositionForces(width: number, height: number): void {
        if (!this.simulation) return;

        this.simulation
            .force(
                "center",
                forceProperties.center.enabled
                    ? d3.forceCenter(width * forceProperties.center.x, height * forceProperties.center.y)
                    : null,
            )
            .force(
                "charge",
                forceProperties.charge.enabled
                    ? d3.forceManyBody()
                        .strength(this._forceParams.charge)
                        .distanceMin(forceProperties.charge.distanceMin)
                        .distanceMax(forceProperties.charge.distanceMax)
                    : null,
            )
            .force(
                "collide",
                forceProperties.collide.enabled
                    ? d3.forceCollide<GraphNode>()
                        .strength(this._forceParams.collide)
                        .radius((d) => effectiveNodeRadius(d, this._rootNodeId) + 1)
                        .iterations(forceProperties.collide.iterations)
                    : null,
            )
            .force(
                "forceX",
                forceProperties.forceX.enabled
                    ? d3.forceX<GraphNode>()
                        .strength(forceProperties.forceX.strength)
                        .x(width * forceProperties.forceX.x)
                    : null,
            )
            .force(
                "forceY",
                forceProperties.forceY.enabled
                    ? d3.forceY<GraphNode>()
                        .strength(forceProperties.forceY.strength)
                        .y(height * forceProperties.forceY.y)
                    : null,
            );
    }

    // =========================================================================
    // Internals — zoom & drag
    // =========================================================================

    private addZoom(): void {
        if (!this.canvas) return;

        // D3 owns this zoom behavior and its callback until cleanupCanvas().
        const zoomBehavior = d3Zoom<HTMLCanvasElement, unknown>()
            .scaleExtent([0.1, 12])
            .filter((event) => !this.isDraggingNode && !event.button && event.buttons !== 2)
            .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
                this.transform = event.transform;
                this.renderData();
                // Clear tooltip during zoom (but preserve external hover)
                if (this.highlight.hoveredId && !this.highlight.externalHoverId) {
                    this.highlight.hoveredId = "";
                    this.highlight.hoveredChild = new Set();
                    this.onHoverChanged?.("", 0, 0);
                }
            });

        const sel = d3.select(this.canvas);
        sel.call(zoomBehavior);
        // Disable d3-zoom's built-in double-click zoom (mouse wheel is sufficient)
        // This is D3 handler removal, not a registration.
        sel.on("dblclick.zoom", null);
    }

    private addDrag(): void {
        if (!this.canvas) return;

        // D3 owns this drag behavior and its callbacks until cleanupCanvas().
        const dragBehavior = d3Drag<HTMLCanvasElement, unknown>()
            .filter((event) => event.button === 0)
            .subject((event) => {
                const node = this.findNode(event.x, event.y);
                if (node) {
                    node.fx = node.x;
                    node.fy = node.y;
                    return node;
                }
                return null;
            })
            .on("start", (event: D3DragEvent<HTMLCanvasElement, unknown, GraphNode>) => {
                if (!event.subject) return;
                this.isDraggingNode = true;
                // Clear hover/tooltip immediately when drag begins
                this.setHoveredId("");
                this.simulation?.alphaTarget(0.2).restart();
            })
            .on("drag", (event: D3DragEvent<HTMLCanvasElement, unknown, GraphNode>) => {
                if (!event.subject || !this.canvas) return;
                const canvasRect = this.canvas.getBoundingClientRect();
                const mouseX = event.sourceEvent.clientX - canvasRect.left;
                const mouseY = event.sourceEvent.clientY - canvasRect.top;
                event.subject.fx = this.transform.invertX(mouseX);
                event.subject.fy = this.transform.invertY(mouseY);
            })
            .on("end", (event: D3DragEvent<HTMLCanvasElement, unknown, GraphNode>) => {
                if (!event.subject) return;
                event.subject.fx = null;
                event.subject.fy = null;
                this.isDraggingNode = false;
                this.simulation?.alphaTarget(0);
            });

        d3.select(this.canvas).call(dragBehavior);
    }

    // =========================================================================
    // Internals — node lookup
    // =========================================================================

    private findNode(x: number, y: number): GraphNode | undefined {
        const tx = this.transform.invertX(x);
        const ty = this.transform.invertY(y);
        return this.graphData.nodes.find((node) => {
            const dx = tx - (node.x || 0);
            const dy = ty - (node.y || 0);
            const r = effectiveNodeRadius(node, this._rootNodeId);
            return Math.sqrt(dx * dx + dy * dy) <= r;
        });
    }

    /** Check if there is a node at the given mouse event position (for auto-collapse decisions). */
    hasNodeAt(event: MouseEvent): boolean {
        return this.findNodeAt(event) !== undefined;
    }

    private findNodeAt(event: MouseEvent): GraphNode | undefined {
        if (!this.canvas) return undefined;
        const rect = this.canvas.getBoundingClientRect();
        return this.findNode(event.clientX - rect.left, event.clientY - rect.top);
    }

    /** Compute badge radius from hidden neighbor count. */
    private badgeRadius(hiddenCount: number): number {
        return Math.max(3, 2 + String(hiddenCount).length);
    }

    /** Hit-test the "+" badge on a node. Returns the node that owns the badge, or undefined. */
    private findBadgeAt(event: MouseEvent): GraphNode | undefined {
        if (!this.canvas || this.transform.k <= 0.5) return undefined;
        const rect = this.canvas.getBoundingClientRect();
        const tx = this.transform.invertX(event.clientX - rect.left);
        const ty = this.transform.invertY(event.clientY - rect.top);

        for (const d of this.graphData.nodes) {
            const hiddenCount = d._$hiddenCount ?? 0;
            if (hiddenCount <= 0) continue;

            const r = effectiveNodeRadius(d, this._rootNodeId);
            const badgeX = (d.x || 0) + r * 0.7;
            const badgeY = (d.y || 0) - r * 0.7;
            const badgeR = this.badgeRadius(hiddenCount);

            const dx = tx - badgeX;
            const dy = ty - badgeY;
            if (dx * dx + dy * dy <= badgeR * badgeR) return d;
        }
        return undefined;
    }

    // =========================================================================
    // Internals — active/hovered state (delegates to highlight model)
    // =========================================================================

    private setActiveId(id: string): void {
        const prevIds = this.highlight.selectedIds;
        const changed = prevIds.size !== (id ? 1 : 0) || (id && !prevIds.has(id));
        this.highlight.selectSingle(id, this.connectivityModel?.getProcessedNeighborIds(id) ?? new Set());
        this.computeSelectedLinkKeys();
        this.renderData();
        if (changed) this.onSelectionChanged?.(new Set(this.highlight.selectedIds));
    }

    /** Compute canonical link keys on visual paths from selected nodes to their real neighbors. */
    private computeSelectedLinkKeys(): void {
        const cm = this.connectivityModel;
        const keys = new Set<string>();
        if (cm && this.highlight.selectedIds.size > 0) {
            for (const nodeId of this.highlight.selectedIds) {
                for (const realNeighborId of cm.getRealNeighborIds(nodeId)) {
                    for (const key of cm.getVisualLinkKeys(nodeId, realNeighborId)) {
                        keys.add(key);
                    }
                }
            }
        }
        this.highlight.selectedLinkKeys = keys;
    }

    private setHoveredId(id: string): void {
        const changed = this.highlight.hoveredId !== id;
        this.highlight.setHoveredId(id, this.connectivityModel?.getRealNeighborIds(id) ?? new Set());
        this.computeHoveredLinkKeys();
        this.renderData();
        if (changed) this.onHoverChanged?.(id, this._lastClientX, this._lastClientY);
    }

    /** Compute canonical link keys on visual path from selected node(s) to hovered node (only if direct real neighbor). */
    private computeHoveredLinkKeys(): void {
        const cm = this.connectivityModel;
        const hoveredId = this.highlight.hoveredId;
        const keys = new Set<string>();
        if (cm && hoveredId && this.highlight.selectedIds.size > 0) {
            for (const nodeId of this.highlight.selectedIds) {
                // Only highlight path if hovered node is a real (direct) neighbor
                if (!cm.getRealNeighborIds(nodeId).has(hoveredId)) continue;
                for (const key of cm.getVisualLinkKeys(nodeId, hoveredId)) {
                    keys.add(key);
                }
            }
        }
        this.highlight.hoveredLinkKeys = keys;
    }

    // =========================================================================
    // Internals — shape drawing
    // =========================================================================

    private drawShape(ctx: CanvasRenderingContext2D, shape: NodeShape | "compass" | "group" | undefined, x: number, y: number, r: number): void {
        ctx.beginPath();
        const pts = getShapePoints(shape, x, y, r);
        if (pts) {
            // Square uses rect for crispness
            if (shape === "square") {
                ctx.rect(x - r, y - r, r * 2, r * 2);
            } else {
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i][0], pts[i][1]);
                }
                ctx.closePath();
            }
        } else if (shape === "group") {
            // Group: draw inner circle (65% of radius) — outer ring drawn separately
            ctx.arc(x, y, r * 0.65, 0, 2 * Math.PI);
        } else {
            // circle
            ctx.arc(x, y, r, 0, 2 * Math.PI);
        }
    }

    // =========================================================================
    // Internals — canvas rendering
    // =========================================================================

    private renderData = (): void => {
        const ctx = this.canvas?.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const { transform, graphData, highlight, colors } = this;
        const dimSet = highlight.computeDimSet();
        const dimming = dimSet !== null;

        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);

        // Draw links
        graphData.links.forEach((d) => {
            ctx.beginPath();
            ctx.moveTo((d.source as GraphNode).x || 0, (d.source as GraphNode).y || 0);
            ctx.lineTo((d.target as GraphNode).x || 0, (d.target as GraphNode).y || 0);
            const linkCol = highlight.linkColor(d, colors);
            const isHighlighted = linkCol !== colors.linkDefault && linkCol !== colors.linkSelected;
            if (dimming) {
                const { source, target } = linkIds(d);
                ctx.globalAlpha = isHighlighted || dimSet.has(source) || dimSet.has(target) ? 1.0 : 0.15;
            }
            ctx.strokeStyle = linkCol;
            ctx.lineWidth = isHighlighted ? 2 : 0.5;
            ctx.stroke();
        });

        // Draw nodes
        const rootId = this._rootNodeId;
        graphData.nodes.forEach((d) => {
            if (dimming) ctx.globalAlpha = dimSet.has(d.id) ? 1.0 : 0.15;
            const isRoot = rootId !== "" && d.id === rootId;
            const isSpecial = isRoot || !!d.isGroup;
            const r = effectiveNodeRadius(d, rootId);
            const shape = isRoot ? "compass" as const : d.isGroup ? "group" as const : d.shape;
            this.drawShape(ctx, shape, d.x || 0, d.y || 0, r);
            ctx.fillStyle = highlight.nodeColor(d, colors, isSpecial);
            ctx.fill();
            ctx.strokeStyle = highlight.nodeBorderColor(d, colors, isSpecial);
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Group node outer ring
            if (shape === "group") {
                ctx.beginPath();
                ctx.arc(d.x || 0, d.y || 0, r, 0, 2 * Math.PI);
                // Outer ring color reflects selection/hover state, defaults to groupBorder
                const isSelected = highlight.selectedIds.has(d.id);
                const isHovered = d.id === highlight.hoveredId;
                ctx.strokeStyle = isSelected ? colors.borderSelected
                    : isHovered ? colors.borderHighlight
                    : colors.groupBorder;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });

        if (dimming) ctx.globalAlpha = 1.0;

        // Draw "+" badges on nodes with hidden neighbors
        if (transform.k > 0.5) {
            const c = colors;
            ctx.font = "bold 5px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            graphData.nodes.forEach((d) => {
                const hiddenCount = d._$hiddenCount ?? 0;
                if (hiddenCount > 0) {
                    if (dimming) ctx.globalAlpha = dimSet.has(d.id) ? 1.0 : 0.15;
                    const r = effectiveNodeRadius(d, rootId);
                    const badgeX = (d.x || 0) + r * 0.7;
                    const badgeY = (d.y || 0) - r * 0.7;
                    const badgeR = this.badgeRadius(hiddenCount);
                    const isHovered = d.id === highlight.hoveredBadgeNodeId;

                    ctx.beginPath();
                    ctx.arc(badgeX, badgeY, badgeR, 0, 2 * Math.PI);
                    ctx.fillStyle = isHovered ? c.nodeSelected : c.nodeHighlight;
                    ctx.fill();
                    ctx.strokeStyle = isHovered ? c.borderSelected : c.borderHighlight;
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.fillStyle = c.labelText;
                    ctx.fillText(`+${hiddenCount}`, badgeX, badgeY);
                }
            });
        }

        if (dimming) ctx.globalAlpha = 1.0;

        // Draw labels
        const showImportantLabels = transform.k > 0.8;
        const hasHighlight = highlight.selectedIds.size > 0 || !!highlight.hoveredId;

        if (showImportantLabels || hasHighlight) {
            const c = colors;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";

            graphData.nodes.forEach((d) => {
                const isSelected = highlight.selectedIds.has(d.id);
                const isHovered = d.id === highlight.hoveredId;
                const isHoveredChild = highlight.hoveredChild.has(d.id);
                const isHighlighted = isSelected || isHovered || isHoveredChild;
                const isRoot = rootId !== "" && d.id === rootId;

                // Highlighted labels always shown; important labels only when zoomed in
                if (!isHighlighted) {
                    if (!showImportantLabels) return;
                    const isImportant = isRoot || d.isGroup || (typeof d.level === "number" && d.level >= 1 && d.level <= 2);
                    if (!isImportant) return;
                }

                // Highlighted labels are always fully visible, even for dimmed nodes
                if (dimming) ctx.globalAlpha = isHighlighted ? 1.0 : (dimSet.has(d.id) ? 1.0 : 0.15);
                const text = nodeLabel(d);
                const r = effectiveNodeRadius(d, rootId);

                // Font size based on node level (root and group = level 1)
                const level = isRoot || d.isGroup ? 1 : (typeof d.level === "number" ? d.level : 5);
                const fontSize = level <= 1 ? 14 : level === 2 ? 12 : level === 3 ? 11 : 10;
                ctx.font = `${fontSize}px sans-serif`;

                const paddingY = 1;
                const paddingX = 2;
                const textWidth = ctx.measureText(text).width;
                const textHeight = fontSize * 0.75;

                const labelX = (d.x || 0) + r + 4;
                const labelY = d.y || 0;

                // Label background
                ctx.fillStyle = c.labelBg;
                ctx.fillRect(
                    labelX - paddingX,
                    labelY - textHeight / 2 - paddingY,
                    textWidth + 2 * paddingX,
                    textHeight + 2 * paddingY,
                );

                // Label text: colored for highlighted/special nodes, default for important-only
                const isSpecialLabel = isRoot || !!d.isGroup;
                ctx.fillStyle = isHighlighted
                    ? highlight.labelTextColor(d, c, isSpecialLabel)
                    : isSpecialLabel ? c.nodeSpecial : c.labelText;
                ctx.fillText(text, labelX, labelY);
            });
        }

        if (dimming) ctx.globalAlpha = 1.0;
        ctx.restore();
    };

    private cleanupCanvas(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.simulation?.stop();
        this.simulation = null;
    }
}
