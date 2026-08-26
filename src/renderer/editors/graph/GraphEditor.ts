import { TComponentState, TOneState } from "../../core/state/state";
import { type EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
import { ForceGraphRenderer, ForceParams } from "./ForceGraphRenderer";
import { GraphVisibilityModel } from "./GraphVisibilityModel";
import { GraphDataModel } from "./GraphDataModel";
import { GraphGroupModel } from "./GraphGroupModel";
import { GraphConnectivityModel } from "./GraphConnectivityModel";
import { GraphSearchModel, SearchInfo, SearchResult } from "./GraphSearchModel";
import { GraphGroupActionsModel } from "./GraphGroupActionsModel";
import { GraphMutationModel } from "./GraphMutationModel";
import { GraphTooltipInfo, GraphTooltipModel } from "./GraphTooltipModel";
import {
    GraphData,
    GraphNode,
    GraphOptions,
    linkIds,
    getNodeLinks,
    openNodeLink,
} from "./types";
import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import {
    buildNodeContextMenu,
    buildEmptyAreaContextMenu,
    buildGroupNodeContextMenu,
    ContextMenuActions,
} from "./GraphContextMenu";
import type { MenuItem } from "../../uikit";

export type GraphQueueEvent = { type: "focus" };
export type GraphQueueRequest = never;

/**
 * HS1 host-slot shape — `groupingEnabled` rides `host.editorSettings["graph-view"]`
 * so it survives Graph↔Monaco switches AND app restarts. Identical
 * mechanism to Markdown's `compactMode` / Mermaid's `lightMode`.
 */
interface GraphViewSettings {
    groupingEnabled?: boolean;
}

export type TooltipInfo = GraphTooltipInfo;

export interface GraphEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["graph-view"]. Bounded boolean.
    // Default `true`.
    groupingEnabled: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV7. Recomputed by parse / hover / select.
    error: string;
    loading: boolean;
    searchQuery: string;
    searchInfo: SearchInfo | null;
    searchResults: SearchResult[] | null;
    tooltip: TooltipInfo | null;
    /** All currently selected nodes (snapshots). Empty array = no selection. */
    selectedNodes: GraphNode[];
    /** Linked nodes for the single selected node (empty when multi-selected). */
    linkedNodes: GraphNode[];
    statusHint: string;
}

export const defaultGraphEditorState: GraphEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    groupingEnabled: true,
    error: "",
    loading: true,
    searchQuery: "",
    searchInfo: null,
    searchResults: null,
    tooltip: null,
    selectedNodes: [],
    linkedNodes: [],
    statusHint: "",
};

// Re-export search types for consumers (GraphBody.tsx imports from here).
export type { SearchInfo, SearchPropertyMatch, SearchResult } from "./GraphSearchModel";

export class GraphEditor extends TextHostEditorModel<GraphEditorState, void, GraphQueueEvent> {
    readonly editorId = "graph-view";
    protected readonly displayName = "Graph";

    // ── Owned submodels ───────────────────────────────────────────
    readonly renderer = new ForceGraphRenderer();
    readonly visibilityModel = new GraphVisibilityModel();
    readonly dataModel = new GraphDataModel();
    readonly groupModel = new GraphGroupModel();
    readonly connectivityModel = new GraphConnectivityModel();
    readonly searchModel: GraphSearchModel;
    readonly tooltipModel: GraphTooltipModel<GraphEditorState>;
    readonly groupActions: GraphGroupActionsModel;
    readonly mutationModel: GraphMutationModel;
    /** Explicit channel for the native footer's getter-backed records label. */
    readonly recordsCountState = new TOneState("0 nodes");

    // ── View-attached callbacks (GR3 — set by body on mount) ───────────
    /** Set by GraphBody to handle double-click on a node (expand detail panel). */
    onDoubleClickNode: ((nodeId: string) => void) | null = null;
    /** True while a popup menu (context menu or selection menu) is open. */
    isPopupOpen = false;
    /** Set by GraphLegendPanel to handle "Highlight" action from selection menu. */
    onHighlightSelection: (() => void) | null = null;

    // ── Timers + parse-loop guard ───────────────────────────────────────
    private _parseTimer: ReturnType<typeof setTimeout> | undefined;

    /** Full parsed JSON — preserved for serialization (keeps `type` and any
     *  extra user properties). */
    private originalJson: Record<string, unknown> = {};
    /** First load uses updateData (full sim init); subsequent loads use
     *  updateVisibleData (position-preserving). New editor instance per
     *  switch starts with `isFirstLoad = true` — correct (renderer is fresh,
     *  needs full sim init). */
    private isFirstLoad = true;

    readonly typedQueue: ComponentQueue<GraphQueueEvent, GraphQueueRequest>;

    constructor(state: TComponentState<GraphEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            GraphQueueEvent,
            GraphQueueRequest
        >;
        this.searchModel = new GraphSearchModel(this.renderer, this.visibilityModel);
        this.tooltipModel = new GraphTooltipModel(
            this.state,
            this.renderer,
            this.dataModel,
            this.groupModel,
            () => this.isPopupOpen,
        );
        this.groupActions = new GraphGroupActionsModel(
            this.dataModel,
            this.groupModel,
            this.connectivityModel,
            this.renderer,
            {
                rebuildAndRender: (anchor, positions, visible) => this.rebuildAndRender(anchor, positions, visible),
                serializeToHost: () => this.serializeToHost(),
                clearRootIfDeleted: (nodeId) => this.clearRootIfDeleted(nodeId),
                updateNodeProps: (nodeId, props) => this.mutationModel.updateNodeProps(nodeId, props),
            },
        );
        this.mutationModel = new GraphMutationModel(
            this.dataModel,
            this.groupModel,
            this.connectivityModel,
            this.visibilityModel,
            this.renderer,
            {
                rebuildAndRender: (anchor, positions, visible) => this.rebuildAndRender(anchor, positions, visible),
                serializeToHost: () => this.serializeToHost(),
                clearRootIfDeleted: (nodeId) => this.clearRootIfDeleted(nodeId),
                refreshSelectedNodes: () => this.refreshSelectedNodes(),
                initializeEmptyGraph: () => {
                    this.dataModel.sourceData = { nodes: [], links: [] };
                    this.originalJson = { type: "force-graph" };
                },
                cleanupEmptyGroups: () => this.groupActions.cleanupEmptyGroups(),
                getSelectedNodes: () => this.state.get().selectedNodes,
            },
        );
    }

    protected onHostExtracted(): void {
        clearTimeout(this._parseTimer);
        this._parseTimer = undefined;
        this.tooltipModel.dispose();
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Host adoption ───────────────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // HS1 — seed `groupingEnabled` from host slot (sync, no flicker). If
        // the slot is absent, retain the default `true`. Mirror changes back
        // to the host slot. Slice-subscribe keeps the mirror from firing on
        // transient field mutations (the dominant write source) — only the
        // bounded boolean triggers a host-slot write.
        this.mirrorHostSettings<GraphViewSettings>(
            (saved) => {
                if (saved.groupingEnabled !== undefined) {
                    this.state.update((s) => {
                        s.groupingEnabled = saved.groupingEnabled;
                    });
                }
            },
            (s) => ({ groupingEnabled: s.groupingEnabled }),
            (s) => s.groupingEnabled,
        );

        // GR7 — content changes retrigger parse (own serializeToHost writes
        // are skipped by the base's echo guard).
        this.subscribeHostContent(() => this.parseDebounced());

        // Wire renderer callbacks (relocated verbatim from legacy onInit).
        this.renderer.onBadgeExpand = (nodeId, deep) => this.handleBadgeExpand(nodeId, deep);
        this.renderer.onHoverChanged = (nodeId, cx, cy) => this.tooltipModel.handleHoverChanged(nodeId, cx, cy);
        this.renderer.onContextMenuAction = (nodeId, cx, cy) => this.handleContextMenu(nodeId, cx, cy);
        this.renderer.onAltClick = (nodeId) => this.groupActions.handleAltClick(nodeId);
        this.renderer.onSelectionChanged = (selectedIds) => this.handleSelectionChanged(selectedIds);
        this.renderer.onDoubleClick = (nodeId) => this.onDoubleClickNode?.(nodeId);

        // GR6 — initial parse against the freshly-adopted host (mirrors
        // today's GraphViewModel.onInit's final parseContent call). Sync,
        // not debounced — avoids a 400 ms spinner on every open.
        this.parseContent();
    }

    // ── Dispose ─────────────────────────────────────────────────────────

    async dispose(): Promise<void> {
        clearTimeout(this._parseTimer);
        this.tooltipModel.dispose();
        this.renderer.dispose();
        await super.dispose();
    }

    // =========================================================================
    // BELOW: methods relocated byte-for-byte from legacy GraphViewModel.
    // Substitutions applied: `this.host` → `this._host!`. All other code is
    // identical to the legacy implementation.
    // =========================================================================

    // =========================================================================
    // Theme support
    // =========================================================================

    refreshColors(): void {
        this.renderer.refreshColors();
    }

    // =========================================================================
    // Force tuning
    // =========================================================================

    updateForceParams(params: Partial<ForceParams>): void {
        this.renderer.updateForceParams(params);
        // Persist to data options
        if (this.dataModel.sourceData) {
            if (!this.dataModel.sourceData.options) this.dataModel.sourceData.options = {};
            Object.assign(this.dataModel.sourceData.options, params);
            this.serializeToHost();
        }
    }

    resetForceParams(): void {
        this.renderer.resetForceParams();
        // Clear physics from options (next open uses defaults)
        if (this.dataModel.sourceData?.options) {
            delete this.dataModel.sourceData.options.charge;
            delete this.dataModel.sourceData.options.linkDistance;
            delete this.dataModel.sourceData.options.collide;
            this.serializeToHost();
        }
    }

    // =========================================================================
    // Root node
    // =========================================================================

    /** Current root node ID (from options or auto-selected). Undefined if no explicit root. */
    get rootNodeId(): string | undefined {
        return this.dataModel.sourceData?.options?.rootNode || undefined;
    }

    setRootNode(nodeId: string | undefined): void {
        if (!this.dataModel.sourceData) return;
        if (!this.dataModel.sourceData.options) this.dataModel.sourceData.options = {};
        if (nodeId) {
            this.dataModel.sourceData.options.rootNode = nodeId;
        } else {
            delete this.dataModel.sourceData.options.rootNode;
        }
        // Update renderer visual immediately
        this.renderer.rootNodeId = nodeId ?? "";
        this.serializeToHost();
    }

    /** Clear root node option if the given node was the root. */
    private clearRootIfDeleted(nodeId: string): void {
        if (this.dataModel.sourceData?.options?.rootNode === nodeId) {
            delete this.dataModel.sourceData.options.rootNode;
            this.renderer.rootNodeId = "";
        }
    }

    // =========================================================================
    // Expansion options
    // =========================================================================

    /** Get current expansion options for UI. */
    getExpansionOptions(): { rootNode?: string; expandDepth?: number; maxVisible?: number } {
        const opts = this.dataModel.sourceData?.options ?? {};
        return { rootNode: opts.rootNode, expandDepth: opts.expandDepth, maxVisible: opts.maxVisible };
    }

    /** Update expansion options (rootNode excluded — use setRootNode). Does NOT recalculate graph. */
    updateExpansionOptions(patch: Partial<Pick<GraphOptions, "expandDepth" | "maxVisible">>): void {
        if (!this.dataModel.sourceData) return;
        if (!this.dataModel.sourceData.options) this.dataModel.sourceData.options = {};
        const opts = this.dataModel.sourceData.options as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) {
                delete opts[key];
            } else {
                opts[key] = value;
            }
        }
        this.serializeToHost();
    }

    /** Get all nodes from source data (for ComboSelect in expansion settings). */
    getAllNodes(): GraphNode[] {
        return this.dataModel.sourceData?.nodes ?? [];
    }

    // =========================================================================
    // Highlighting
    // =========================================================================

    /** Highlight a set of node IDs (dims everything else). Null to clear. */
    setHighlightSet(ids: Set<string> | null): void {
        this.renderer.setHighlightSet(ids);
    }

    /** Set hover highlight on a node from external source (e.g. Links tab grid focus). Empty to clear.
     *  Uses selected node's real neighbors (not the hovered child's) so only the selected node's
     *  children get green borders/labels. */
    setExternalHover(id: string): void {
        const selectedId = this.renderer.selectedId;
        const neighbors = selectedId ? this.connectivityModel.getRealNeighborIds(selectedId) : new Set<string>();
        this.renderer.setExternalHover(id, neighbors);
    }

    /** Highlight a set of node IDs from legend panel. Null to clear. */
    setLegendHighlight(ids: Set<string> | null): void {
        this.renderer.setLegendHighlight(ids);
    }

    // =========================================================================
    // Legend (delegates to dataModel)
    // =========================================================================

    /** Get legend descriptions from options. */
    getLegendDescriptions() {
        return this.dataModel.getLegendDescriptions();
    }

    /** Set a single legend description. */
    setLegendDescription(tab: "levels" | "shapes", key: string, value: string): void {
        this.dataModel.setLegendDescription(tab, key, value);
        this.serializeToHost();
    }

    /** Get node IDs matching a filter (for legend highlighting). Operates on visible nodes. */
    getNodeIdsByLegendFilter(filter: { levels?: Set<number>; shapes?: Set<string>; includeRoot?: boolean; includeGroup?: boolean }): Set<string> {
        return this.dataModel.getNodeIdsByLegendFilter(filter, this.renderer.getNodes());
    }

    /** Get set of levels and shapes present in visible nodes. */
    getPresentLevelsAndShapes() {
        return this.dataModel.getPresentLevelsAndShapes(this.renderer.getNodes());
    }

    // =========================================================================
    // Search (delegates to searchModel)
    // =========================================================================

    setSearchQuery(query: string): void {
        this.state.update((s) => { s.searchQuery = query; });
        this.recomputeSearch();
    }

    revealHiddenMatches(): void {
        const results = this.state.get().searchResults;
        const changed = this.searchModel.revealHiddenMatches(results);
        if (changed) this.recomputeSearch();
    }

    revealAndSelectNode(nodeId: string): void {
        const changed = this.searchModel.revealAndSelectNode(nodeId);
        if (changed) this.recomputeSearch();
    }

    /** Reveal hidden matches and add all search result nodes to the current selection. */
    selectSearchResults(): void {
        const results = this.state.get().searchResults;
        if (!results || results.length === 0) return;
        // Reveal hidden nodes first so they become visible
        const changed = this.searchModel.revealHiddenMatches(results);
        if (changed) this.recomputeSearch();
        const nodeIds = results.map((r) => r.nodeId);
        this.renderer.addToSelection(nodeIds);
    }

    private recomputeSearch(): void {
        const query = this.state.get().searchQuery;
        const result = this.searchModel.computeSearch(query);

        if (!result) {
            this.renderer.setSearchMatches(null);
            this.state.update((s) => { s.searchInfo = null; s.searchResults = null; });
            return;
        }

        this.renderer.setSearchMatches(result.matchIds);
        this.state.update((s) => {
            s.searchInfo = result.searchInfo;
            s.searchResults = result.searchResults;
        });
    }

    // =========================================================================
    // Tooltip
    // =========================================================================

    // =========================================================================
    // Visibility
    // =========================================================================

    get hasVisibilityFilter(): boolean {
        return this.visibilityModel.active;
    }

    /** Reset the view: recompute BFS visibility and restart D3 simulation from scratch. */
    resetView(): void {
        this.isFirstLoad = true;
        this.rebuildAndRender();
        this.renderer.rootNodeId = this.dataModel.sourceData?.options?.rootNode ?? "";
        this.refreshSelectedNodes();
    }

    resetVisibility(): void {
        if (!this.visibilityModel.active) return;
        this.visibilityModel.reset();
        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph);
        this.refreshRecordsCount();
        this.recomputeSearch();
        this.tooltipModel.clear();
    }

    /** Expand a node's hidden neighbors (used by badge click and links tab auto-expand). */
    expandNode(nodeId: string): void {
        if (!this.visibilityModel.active) return;

        const changed = this.visibilityModel.expand(nodeId);
        if (!changed) return;

        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph, nodeId);
        this.refreshRecordsCount();
        this.recomputeSearch();
        this.tooltipModel.clear();
    }

    private handleBadgeExpand(nodeId: string, deep: boolean): void {
        if (deep) {
            this.expandNodeDeep(nodeId);
        } else {
            this.expandNode(nodeId);
        }
    }

    /** Deep expand: reveal the entire hidden subtree connected to this node, stopping at previously-visible barriers. */
    expandNodeDeep(nodeId: string): void {
        if (!this.visibilityModel.active) return;
        const changed = this.visibilityModel.expandDeep(nodeId);
        if (!changed) return;
        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph, nodeId);
        this.refreshRecordsCount();
        this.recomputeSearch();
        this.tooltipModel.clear();
    }

    /** Collapse: hide descendants with higher showIndex (BFS subtree below this node). */
    collapseNode(nodeId: string): void {
        if (!this.visibilityModel.active) return;
        const changed = this.visibilityModel.collapse(nodeId);
        if (!changed) return;
        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph);
        this.refreshRecordsCount();
        this.recomputeSearch();
        this.tooltipModel.clear();
    }

    /** Expand all nodes (make entire graph visible). */
    expandAll(): void {
        if (!this.visibilityModel.active) return;
        const changed = this.visibilityModel.expandAll();
        if (!changed) return;
        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph);
        this.refreshRecordsCount();
        this.recomputeSearch();
        this.tooltipModel.clear();
    }

    /** Total number of nodes in the full graph (for confirmation dialog). */
    get totalNodeCount(): number {
        return this.visibilityModel.totalNodeCount;
    }

    /** Status bar text: "N of M nodes" when filtered, "N nodes" when all visible. */
    get recordsCount(): string {
        const total = this.dataModel.sourceData?.nodes.length ?? 0;
        if (!this.visibilityModel.active) return `${total} nodes`;
        const visible = this.renderer.getNodes().length;
        return `${visible} of ${total} nodes`;
    }

    private refreshRecordsCount(): void {
        const next = this.recordsCount;
        if (next !== this.recordsCountState.get()) this.recordsCountState.set(next);
    }

    /** True when the graph has no nodes (empty content or parsed with zero nodes). */
    get isEmpty(): boolean {
        if (this.dataModel.sourceData) return this.dataModel.sourceData.nodes.length === 0;
        // No sourceData — empty if not loading and no error (i.e. blank content)
        const { loading, error } = this.state.get();
        return !loading && !error;
    }

    /** Whether source data contains any group nodes. */
    get hasGroups(): boolean {
        return this.dataModel.sourceData?.nodes.some(n => n.isGroup) ?? false;
    }

    /** Whether grouping is currently enabled for rendering. */
    get groupingEnabled(): boolean {
        return this.state.get().groupingEnabled;
    }

    /** Toggle grouping on/off. Clears selection and fully re-simulates. */
    toggleGrouping(): void {
        this.state.update(s => { s.groupingEnabled = !s.groupingEnabled; });
        this.renderer.selectNode("");
        this.isFirstLoad = true;
        this.rebuildAndRender();
        this.renderer.rootNodeId = this.dataModel.sourceData?.options?.rootNode ?? "";
    }

    // =========================================================================
    // Context menu
    // =========================================================================

    /** Context menu action handlers bound to this editor. */
    private get contextMenuActions(): ContextMenuActions {
        return {
            addNode: (wx, wy) => this.mutationModel.addNode(wx, wy),
            addChild: (id) => this.mutationModel.addChild(id),
            deleteNode: (id) => this.mutationModel.deleteNode(id),
            deleteSelected: () => this.mutationModel.deleteSelectedNodes(),
            deleteLink: (s, t) => this.mutationModel.deleteLink(s, t),
            setRootNode: (id) => this.setRootNode(id),
            collapseNode: (id) => this.collapseNode(id),
            selectChildren: () => this.groupActions.selectChildren(),
            selectMembers: () => this.groupActions.selectMembers(),
            selectMembersDeep: () => this.groupActions.selectMembersDeep(),
            editGroupTitle: (id) => this.groupActions.editGroupTitle(id),
            ungroupNode: (id) => this.groupActions.ungroupNode(id),
            deleteGroup: (id) => this.groupActions.deleteGroupNode(id),
            groupSelected: () => this.groupActions.groupSelectedNodes(),
            removeFromGroup: (id) => this.groupActions.removeFromGroup(id),
        };
    }

    private async handleContextMenu(nodeId: string, clientX: number, clientY: number): Promise<void> {
        this.tooltipModel.clear();

        let items: MenuItem[];

        if (!nodeId) {
            const worldPos = this.renderer.screenToWorld(clientX, clientY);
            items = buildEmptyAreaContextMenu(worldPos.x, worldPos.y, this.contextMenuActions);
        } else {
            // Only replace selection if right-clicked node is not already selected
            if (!this.renderer.selectedIds.has(nodeId)) {
                this.renderer.selectNode(nodeId);
            }

            const clickedNode = this.dataModel.sourceData?.nodes.find((n) => n.id === nodeId);
            const multiSelectedCount = this.renderer.selectedIds.size;

            if (clickedNode?.isGroup) {
                items = buildGroupNodeContextMenu(
                    nodeId,
                    this.visibilityModel.active,
                    this.contextMenuActions,
                    multiSelectedCount,
                    this.groupingEnabled,
                );
            } else {
                const isInGroup = this.groupModel.getGroupOf(nodeId);
                const links = clickedNode ? getNodeLinks(clickedNode) : [];
                items = buildNodeContextMenu(
                    nodeId,
                    [...this.connectivityModel.getRealNeighborIds(nodeId)],
                    (id) => this.dataModel.getNodeLabel(id),
                    nodeId === this.rootNodeId,
                    this.visibilityModel.active,
                    this.contextMenuActions,
                    isInGroup,
                    multiSelectedCount,
                    this.groupingEnabled,
                    links.length > 0 ? { links, onOpen: openNodeLink } : undefined,
                );
            }
        }

        this.isPopupOpen = true;
        this.tooltipModel.clear();
        await showAppPopupMenu(clientX, clientY, items);
        setTimeout(() => { this.isPopupOpen = false; }, 0);
    }

    // =========================================================================
    // Alt+Click link toggle
    // =========================================================================

    // =========================================================================

    private handleSelectionChanged(selectedIds: Set<string>): void {
        this.state.update((s) => {
            s.statusHint = "";
            if (selectedIds.size === 0) {
                s.selectedNodes = [];
                s.linkedNodes = [];
            } else {
                const nodes = this.dataModel.sourceData?.nodes ?? [];
                s.selectedNodes = [...selectedIds]
                    .map((id) => nodes.find((n) => n.id === id))
                    .filter((n): n is GraphNode => !!n)
                    .map((n) => ({ ...n }));
                // Only compute linked nodes for single selection
                if (selectedIds.size === 1) {
                    const id = [...selectedIds][0];
                    s.linkedNodes = this.connectivityModel.getRealNeighborNodes(
                        id, this.dataModel.sourceData?.nodes ?? [], (n) => this.dataModel.cleanNode(n),
                    );
                } else {
                    s.linkedNodes = [];
                }
            }
        });
    }

    /** Refresh selectedNodes snapshots from sourceData (after edits). */
    private refreshSelectedNodes(): void {
        const selectedIds = this.renderer.selectedIds;
        if (selectedIds.size === 0) return;
        this.state.update((s) => {
            const nodes = this.dataModel.sourceData?.nodes ?? [];
            s.selectedNodes = [...selectedIds]
                .map((id) => nodes.find((n) => n.id === id))
                .filter((n): n is GraphNode => !!n)
                .map((n) => ({ ...n }));
            if (selectedIds.size === 1) {
                const id = [...selectedIds][0];
                s.linkedNodes = this.connectivityModel.getRealNeighborNodes(
                    id, nodes, (n) => this.dataModel.cleanNode(n),
                );
            } else {
                s.linkedNodes = [];
            }
        });
    }

    /**
     * Rebuild the rendering pipeline from sourceData.
     * @param anchorNodeId — existing node near which to place new nodes (for expand/addChild)
     * @param newNodePositions — explicit world positions for brand-new nodes
     * @param ensureVisible — node IDs that must be visible (newly added nodes)
     */
    private rebuildAndRender(
        anchorNodeId?: string,
        newNodePositions?: Map<string, { x: number; y: number }>,
        ensureVisible?: string[],
    ): void {
        if (!this.dataModel.sourceData) return;

        let { nodes, links } = this.dataModel.sourceData;
        const { options } = this.dataModel.sourceData;

        // When grouping disabled, filter out group nodes and all their links
        if (!this.state.get().groupingEnabled) {
            const groupIds = new Set(nodes.filter(n => n.isGroup).map(n => n.id));
            nodes = nodes.filter(n => !n.isGroup);
            links = links.filter(l => {
                const { source, target } = linkIds(l);
                return !groupIds.has(source) && !groupIds.has(target);
            });
        }

        // Rebuild group membership from source data
        this.groupModel.rebuild(nodes, links);

        // Pre-process links for visualization (hide membership, split cross-group)
        const rootId = options?.rootNode ?? "";
        const processed = this.groupModel.preprocess(nodes, links, rootId);

        // Build connectivity model (real + processed adjacency)
        this.connectivityModel.rebuild(nodes, links, processed, this.groupModel);

        let filtering: boolean;
        if (this.isFirstLoad) {
            // First load: full reset (computes initial BFS visible set)
            filtering = this.visibilityModel.setFullGraph(processed.nodes, processed.links, options);
        } else {
            // Subsequent: incremental update (preserves expand/collapse state)
            filtering = this.visibilityModel.updateGraph(processed.nodes, processed.links, ensureVisible);
        }

        const copy: GraphData = filtering
            ? this.visibilityModel.getVisibleGraph()
            : { nodes: processed.nodes.map((n) => ({ ...n })), links: processed.links.map((l) => ({ ...l })), options };

        // Pass synthetic link counts and connectivity model to renderer
        this.renderer.syntheticLinkCounts = processed.syntheticLinkCounts;
        this.renderer.connectivityModel = this.connectivityModel;

        if (this.isFirstLoad) {
            this.renderer.updateData(copy);
            this.isFirstLoad = false;
        } else {
            this.renderer.updateVisibleData(copy, anchorNodeId, newNodePositions);
        }

        this.refreshRecordsCount();
        this.recomputeSearch();
        this.tooltipModel.clear();
    }

    // =========================================================================
    // Serialization (sourceData → JSON → host)
    // =========================================================================

    private serializeToHost(): void {
        if (!this.dataModel.sourceData || !this._host) return;

        const json: Record<string, unknown> = { ...this.originalJson };
        json.nodes = this.dataModel.sourceData.nodes;
        json.links = this.dataModel.sourceData.links;
        if (this.dataModel.sourceData.options) {
            json.options = this.dataModel.sourceData.options;
        }

        this.writeToHost(JSON.stringify(json, null, 4), true);
    }

    // =========================================================================
    // Parsing
    // =========================================================================

    private parseDebounced(): void {
        clearTimeout(this._parseTimer);
        this._parseTimer = setTimeout(() => this.parseContent(), 400);
    }

    private parseContent(): void {
        const content = this._host?.state.get().content ?? "";
        if (!content.trim()) {
            this.dataModel.sourceData = null;
            this.originalJson = {};
            this.refreshRecordsCount();
            this.state.update((s) => {
                s.error = "";
                s.loading = false;
            });
            return;
        }

        try {
            const json = JSON.parse(content);
            this.originalJson = json;
            this.dataModel.sourceData = {
                nodes: Array.isArray(json.nodes) ? json.nodes : [],
                links: Array.isArray(json.links) ? json.links : [],
                options: json.options,
            };

            // Restore physics params from options (before first render)
            const opts = this.dataModel.sourceData.options ?? {};
            if (this.isFirstLoad) {
                const initialParams: Partial<ForceParams> = {};
                if (opts.charge !== undefined) initialParams.charge = opts.charge;
                if (opts.linkDistance !== undefined) initialParams.linkDistance = opts.linkDistance;
                if (opts.collide !== undefined) initialParams.collide = opts.collide;
                if (Object.keys(initialParams).length > 0) {
                    this.renderer.setInitialForceParams(initialParams);
                }
            }

            this.state.update((s) => {
                s.error = "";
                s.loading = false;
            });

            this.rebuildAndRender();

            // Set root node visual on renderer (explicit rootNode from options, or empty)
            this.renderer.rootNodeId = opts.rootNode ?? "";

            // Refresh panel snapshot — selected node may have changed or been deleted externally
            this.refreshSelectedNodes();
        } catch (e) {
            this.state.update((s) => {
                s.error = e.message || "Invalid JSON";
                s.loading = false;
            });
        }
    }
}
