import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel } from "../../api/pages/PageModel";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry } from "../base/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { ForceGraphRenderer, ForceParams } from "./ForceGraphRenderer";
import { GraphVisibilityModel } from "./GraphVisibilityModel";
import { GraphDataModel } from "./GraphDataModel";
import { GraphGroupModel } from "./GraphGroupModel";
import { GraphConnectivityModel } from "./GraphConnectivityModel";
import { GraphSearchModel, SearchInfo, SearchResult } from "./GraphSearchModel";
import {
    GraphData,
    GraphLink,
    GraphNode,
    GraphOptions,
    SYS_PREFIX,
    linkIds,
    nodeLabel,
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
import { showInputDialog } from "../../ui/dialogs/InputDialog";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { alertsBarModel } from "../../uikit";
import { buildMarkdown } from "./GraphTooltip";
import { pagesModel } from "../../api/pages";

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

export interface TooltipInfo {
    node: GraphNode;
    x: number;
    y: number;
    /** Whether this node is the root node. */
    isRoot?: boolean;
}

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
    secondaryEditor: undefined,
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

/** D3 simulation fields to strip when extracting nodes. */
const SIM_FIELDS = new Set(["x", "y", "vx", "vy", "fx", "fy", "index"]);

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class GraphEditor extends EditorModel<GraphEditorState, void, GraphQueueEvent> {
    readonly editorId = "graph-view";

    // ── Owned submodels ───────────────────────────────────────────
    readonly renderer = new ForceGraphRenderer();
    readonly visibilityModel = new GraphVisibilityModel();
    readonly dataModel = new GraphDataModel();
    readonly groupModel = new GraphGroupModel();
    readonly connectivityModel = new GraphConnectivityModel();
    readonly searchModel: GraphSearchModel;

    // ── View-attached callbacks (GR3 — set by body on mount) ───────────
    /** Set by GraphBody to handle double-click on a node (expand detail panel). */
    onDoubleClickNode: ((nodeId: string) => void) | null = null;
    /** True while a popup menu (context menu or selection menu) is open. */
    isPopupOpen = false;
    /** Set by GraphLegendPanel to handle "Highlight" action from selection menu. */
    onHighlightSelection: (() => void) | null = null;

    // ── Host adoption state ─────────────────────────────────────────────
    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // ── Timers + parse-loop guard ───────────────────────────────────────
    private _parseTimer: ReturnType<typeof setTimeout> | undefined;
    private _tooltipTimer: ReturnType<typeof setTimeout> | undefined;
    private _tooltipHideTimer: ReturnType<typeof setTimeout> | undefined;
    private _tooltipHovered = false;

    /** Full parsed JSON — preserved for serialization (keeps `type` and any
     *  extra user properties). */
    private originalJson: Record<string, unknown> = {};
    /** GR7 — Skip flag to prevent re-parsing our own serialized changes. */
    private skipNextContentUpdate = false;
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

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from GraphEditor");
                this._tearDownHostSubscriptions();
                this._clearTimers();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    private _tearDownHostSubscriptions(): void {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
    }

    private _clearTimers(): void {
        clearTimeout(this._parseTimer);
        clearTimeout(this._tooltipTimer);
        clearTimeout(this._tooltipHideTimer);
        this._parseTimer = undefined;
        this._tooltipTimer = undefined;
        this._tooltipHideTimer = undefined;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + facade + sub-panels (MK4 pattern from
     *  mirrors Svg/Html/Markdown/Mermaid). */
    get host(): TextFileModel | null {
        return this._host;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor. groupingEnabled rides host.editorSettings["graph-view"]
        //. All other view-derived state stripped per PV7 / MO5.
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<GraphEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        // groupingEnabled is NOT carried via descriptor — read from host.editorSettings
        // in adoptHost. View-derived state re-derived by initial parse.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `GraphEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("GraphEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (C9).
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        // Tag the host with the target editor id so submodels keep their assumptions.
        host.state.update((s) => {
            s.editor = this.editorId;
        });
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel("");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Graph editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh GraphEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // HS1 — seed `groupingEnabled` from host slot (sync, no flicker). If
        // the slot is absent, retain the default `true`.
        const saved = host.getEditorState<GraphViewSettings>(this.editorId);
        if (saved?.groupingEnabled !== undefined) {
            this.state.update((s) => {
                s.groupingEnabled = saved.groupingEnabled;
            });
        }

        // HS1 — mirror `groupingEnabled` changes back to host slot. Slice-
        // subscribe keeps the mirror from firing on transient field
        // mutations (the dominant write source) — only the bounded boolean
        // triggers a host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (groupingEnabled) => {
                if (!this._host) return;
                this._host.setEditorState<GraphViewSettings>(this.editorId, {
                    groupingEnabled: groupingEnabled as boolean,
                });
            },
            (s) => s.groupingEnabled,
        );

        // GR7 — content changes retrigger parse. The skipNextContentUpdate
        // guard prevents the loop from our own serializeToHost writes.
        this._hostContentUnsub = host.state.subscribe(
            () => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.parseDebounced();
            },
            (s) => s.content,
        );

        // Wire renderer callbacks (relocated verbatim from legacy onInit).
        this.renderer.onBadgeExpand = (nodeId, deep) => this.handleBadgeExpand(nodeId, deep);
        this.renderer.onHoverChanged = (nodeId, cx, cy) => this.handleHoverChanged(nodeId, cx, cy);
        this.renderer.onContextMenuAction = (nodeId, cx, cy) => this.handleContextMenu(nodeId, cx, cy);
        this.renderer.onAltClick = (nodeId) => this.handleAltClick(nodeId);
        this.renderer.onSelectionChanged = (selectedIds) => this.handleSelectionChanged(selectedIds);
        this.renderer.onDoubleClick = (nodeId) => this.onDoubleClickNode?.(nodeId);

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);

        // GR6 — initial parse against the freshly-adopted host (mirrors
        // today's GraphViewModel.onInit's final parseContent call). Sync,
        // not debounced — avoids a 400 ms spinner on every open.
        this.parseContent();
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this._clearTimers();
        this._tearDownHostSubscriptions();
        this.renderer.dispose();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
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

    private handleHoverChanged(nodeId: string, clientX: number, clientY: number): void {
        clearTimeout(this._tooltipTimer);

        if (!nodeId || this.renderer.isDragging || this.isPopupOpen) {
            // Don't clear immediately — give time for mouse to enter the tooltip
            this.clearTooltipDelayed();
            this.updateStatusHint("");
            return;
        }
        // Mouse moved to a node — cancel any pending hide and reset hover state
        clearTimeout(this._tooltipHideTimer);
        this._tooltipHovered = false;

        // If hovering a different node than the current tooltip, clear immediately
        const currentTooltip = this.state.get().tooltip;
        if (currentTooltip && currentTooltip.node.id !== nodeId) {
            this.state.update((s) => { s.tooltip = null; });
        }

        // Status hint: Alt+Click to link/unlink (only for single selection)
        const selectedId = this.renderer.selectedId;
        if (selectedId && this.renderer.selectedIds.size === 1 && nodeId !== selectedId && this.dataModel.sourceData) {
            const selectedNode = this.dataModel.sourceData.nodes.find((n) => n.id === selectedId);
            const hoveredNode = this.dataModel.sourceData.nodes.find((n) => n.id === nodeId);

            if (selectedNode?.isGroup && hoveredNode?.isGroup) {
                const hoveredLabel = nodeLabel(hoveredNode);
                const selectedLabel = nodeLabel(selectedNode);
                const isMember = this.groupModel.getGroupOf(nodeId) === selectedId;
                const isReverseMember = this.groupModel.getGroupOf(selectedId) === nodeId;
                if (isMember) {
                    this.updateStatusHint(`Alt+Click to remove "${hoveredLabel}" from "${selectedLabel}"`);
                } else if (isReverseMember) {
                    this.updateStatusHint(`Alt+Click to remove "${selectedLabel}" from "${hoveredLabel}"`);
                } else {
                    this.updateStatusHint(`Alt+Click to add "${hoveredLabel}" into "${selectedLabel}"`);
                }
            } else if (selectedNode?.isGroup && !hoveredNode?.isGroup) {
                const isMember = this.groupModel.getGroupOf(nodeId) === selectedId;
                const label = nodeLabel(selectedNode);
                this.updateStatusHint(isMember
                    ? `Alt+Click to remove from "${label}"`
                    : `Alt+Click to add to "${label}"`);
            } else if (!selectedNode?.isGroup && hoveredNode?.isGroup) {
                const isMember = this.groupModel.getGroupOf(selectedId) === nodeId;
                const groupLabel = nodeLabel(hoveredNode);
                this.updateStatusHint(isMember
                    ? `Alt+Click to remove from "${groupLabel}"`
                    : `Alt+Click to add to "${groupLabel}"`);
            } else {
                const linked = this.dataModel.linkExists(selectedId, nodeId);
                const label = nodeLabel(selectedNode ?? { id: selectedId });
                this.updateStatusHint(linked
                    ? `Alt+Click to unlink from "${label}"`
                    : `Alt+Click to link with "${label}"`);
            }
        } else {
            this.updateStatusHint("");
        }

        this._tooltipTimer = setTimeout(() => {
            const node = this.renderer.getNodes().find((n) => n.id === nodeId);
            if (node) {
                const isRoot = !!(this.dataModel.sourceData?.options?.rootNode && node.id === this.dataModel.sourceData.options.rootNode);
                this.state.update((s) => {
                    s.tooltip = { node: { ...node }, x: clientX, y: clientY, isRoot: isRoot || undefined };
                });
            }
        }, 500);
    }

    private clearTooltip(): void {
        clearTimeout(this._tooltipTimer);
        clearTimeout(this._tooltipHideTimer);
        this._tooltipHovered = false;
        if (this.state.get().tooltip) {
            this.state.update((s) => { s.tooltip = null; });
        }
    }

    /** Clear tooltip after a short grace period (allows mouse to travel to the tooltip). */
    private clearTooltipDelayed(): void {
        clearTimeout(this._tooltipHideTimer);
        this._tooltipHideTimer = setTimeout(() => {
            if (!this._tooltipHovered) {
                this.clearTooltip();
            }
        }, 150);
    }

    /** Called by the tooltip component when mouse enters/leaves it. */
    setTooltipHovered(hovered: boolean): void {
        this._tooltipHovered = hovered;
        if (!hovered) {
            this.clearTooltipDelayed();
        } else {
            clearTimeout(this._tooltipHideTimer);
        }
    }

    private updateStatusHint(hint: string): void {
        if (this.state.get().statusHint !== hint) {
            this.state.update((s) => { s.statusHint = hint; });
        }
    }

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
        this.recomputeSearch();
        this.clearTooltip();
    }

    /** Expand a node's hidden neighbors (used by badge click and links tab auto-expand). */
    expandNode(nodeId: string): void {
        if (!this.visibilityModel.active) return;

        const changed = this.visibilityModel.expand(nodeId);
        if (!changed) return;

        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph, nodeId);
        this.recomputeSearch();
        this.clearTooltip();
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
        this.recomputeSearch();
        this.clearTooltip();
    }

    /** Collapse: hide descendants with higher showIndex (BFS subtree below this node). */
    collapseNode(nodeId: string): void {
        if (!this.visibilityModel.active) return;
        const changed = this.visibilityModel.collapse(nodeId);
        if (!changed) return;
        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph);
        this.recomputeSearch();
        this.clearTooltip();
    }

    /** Expand all nodes (make entire graph visible). */
    expandAll(): void {
        if (!this.visibilityModel.active) return;
        const changed = this.visibilityModel.expandAll();
        if (!changed) return;
        const visibleGraph = this.visibilityModel.getVisibleGraph();
        this.renderer.updateVisibleData(visibleGraph);
        this.recomputeSearch();
        this.clearTooltip();
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
            addNode: (wx, wy) => this.addNode(wx, wy),
            addChild: (id) => this.addChild(id),
            deleteNode: (id) => this.deleteNode(id),
            deleteSelected: () => this.deleteSelectedNodes(),
            deleteLink: (s, t) => this.deleteLink(s, t),
            setRootNode: (id) => this.setRootNode(id),
            collapseNode: (id) => this.collapseNode(id),
            selectChildren: () => this.selectChildren(),
            selectMembers: () => this.selectMembers(),
            selectMembersDeep: () => this.selectMembersDeep(),
            editGroupTitle: (id) => this.editGroupTitle(id),
            ungroupNode: (id) => this.ungroupNode(id),
            deleteGroup: (id) => this.deleteGroupNode(id),
            groupSelected: () => this.groupSelectedNodes(),
            removeFromGroup: (id) => this.removeFromGroup(id),
        };
    }

    private async handleContextMenu(nodeId: string, clientX: number, clientY: number): Promise<void> {
        this.clearTooltip();

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
        this.clearTooltip();
        await showAppPopupMenu(clientX, clientY, items);
        setTimeout(() => { this.isPopupOpen = false; }, 0);
    }

    // =========================================================================
    // Alt+Click link toggle
    // =========================================================================

    private handleAltClick(nodeId: string): void {
        if (this.renderer.selectedIds.size !== 1) return;
        const selectedId = this.renderer.selectedId;
        if (!selectedId || selectedId === nodeId) return;
        if (!this.dataModel.sourceData) return;

        const selectedNode = this.dataModel.sourceData.nodes.find((n) => n.id === selectedId);
        const clickedNode = this.dataModel.sourceData.nodes.find((n) => n.id === nodeId);
        if (!selectedNode || !clickedNode) return;

        const selectedIsGroup = !!selectedNode.isGroup;
        const clickedIsGroup = !!clickedNode.isGroup;

        // Both groups → toggle group membership (selected becomes parent of clicked)
        if (selectedIsGroup && clickedIsGroup) {
            const clickedParent = this.groupModel.getGroupOf(nodeId);

            if (clickedParent === selectedId) {
                // Clicked is already a member of selected → remove
                this.dataModel.deleteLink(selectedId, nodeId);
            } else if (this.groupModel.getGroupOf(selectedId) === nodeId) {
                // Selected is a member of clicked → remove (reverse)
                this.dataModel.deleteLink(nodeId, selectedId);
            } else {
                // Add clicked as member of selected (with cycle check)
                if (this.groupModel.wouldCreateCycle(selectedId, nodeId)) {
                    alertsBarModel.addAlert("Cannot add: would create circular group hierarchy.", "warning");
                    return;
                }
                if (clickedParent) {
                    this.dataModel.deleteLink(clickedParent, nodeId);
                }
                this.dataModel.addLink(selectedId, nodeId);
            }
            this.rebuildAndRender();
            this.serializeToHost();
            return;
        }

        // One is group, other is regular → toggle membership
        if (selectedIsGroup || clickedIsGroup) {
            const groupId = selectedIsGroup ? selectedId : nodeId;
            const memberId = selectedIsGroup ? nodeId : selectedId;
            const isMember = this.groupModel.getGroupOf(memberId) === groupId;

            if (isMember) {
                this.dataModel.deleteLink(groupId, memberId);
            } else {
                const oldGroup = this.groupModel.getGroupOf(memberId);
                if (oldGroup) {
                    this.dataModel.deleteLink(oldGroup, memberId);
                }
                this.dataModel.addLink(groupId, memberId);
            }
            this.rebuildAndRender();
            this.serializeToHost();
            return;
        }

        // Neither is group → existing link toggle
        const exists = this.dataModel.linkExists(selectedId, nodeId);
        if (exists) {
            this.deleteLink(selectedId, nodeId);
        } else {
            this.addLink(selectedId, nodeId);
        }
    }

    // =========================================================================
    // Selection
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

    // =========================================================================
    // Group operations
    // =========================================================================

    async groupSelectedNodes(): Promise<void> {
        if (!this.dataModel.sourceData) return;

        const selectedIds = [...this.renderer.selectedIds];
        const nodes = this.dataModel.sourceData.nodes;

        const groupIds: string[] = [];
        const regularIds: string[] = [];
        for (const id of selectedIds) {
            const node = nodes.find((n) => n.id === id);
            if (node?.isGroup) groupIds.push(id);
            else if (node) regularIds.push(id);
        }

        // Determine parent groups of regular nodes
        const uniqueRegularParents = new Set<string | undefined>();
        for (const id of regularIds) {
            uniqueRegularParents.add(this.groupModel.getGroupOf(id));
        }

        // CASE 1: Only regular nodes (no groups selected)
        if (groupIds.length === 0) {
            if (regularIds.length < 2) return;

            if (uniqueRegularParents.size > 1) {
                alertsBarModel.addAlert("Cannot group: selected nodes belong to different groups.", "warning");
                return;
            }

            const parentGroup = [...uniqueRegularParents][0]; // undefined if top-level

            const result = await showInputDialog({ title: "Group Title", message: "Enter a title for the group:", value: "" });
            if (result?.button !== "OK") return;

            for (const id of regularIds) {
                const oldGroup = this.groupModel.getGroupOf(id);
                if (oldGroup) this.dataModel.deleteLink(oldGroup, id);
            }

            const newGroupId = this.dataModel.generateGroupId();
            this.dataModel.sourceData.nodes.push({ id: newGroupId, isGroup: true });
            for (const id of regularIds) {
                this.dataModel.sourceData.links.push({ source: newGroupId, target: id });
            }
            // Nest inside parent group if nodes were in one
            if (parentGroup) {
                this.dataModel.sourceData.links.push({ source: parentGroup, target: newGroupId });
            }

            if (result.value) this.dataModel.updateNodeProps(newGroupId, { title: result.value });

            // Position at centroid of selected members
            const renderedNodes = this.renderer.getNodes();
            let cx = 0, cy = 0, count = 0;
            for (const id of regularIds) {
                const rn = renderedNodes.find((n) => n.id === id);
                if (rn?.x != null && rn?.y != null) { cx += rn.x; cy += rn.y; count++; }
            }
            const posHint = count > 0 ? new Map([[newGroupId, { x: cx / count, y: cy / count }]]) : undefined;

            this.rebuildAndRender(undefined, posHint, [newGroupId]);
            this.serializeToHost();
            this.renderer.selectNode(newGroupId);
            return;
        }

        // CASE 2: Exactly 1 group + regular nodes
        if (groupIds.length === 1 && regularIds.length > 0) {
            const groupId = groupIds[0];
            const groupNode = nodes.find((n) => n.id === groupId);
            const groupTitle = nodeLabel(groupNode ?? { id: groupId });

            const choice = await showConfirmationDialog({
                title: "Group Options",
                message: `Add ${regularIds.length} node(s) to group "${groupTitle}", or create a new group containing all selected?`,
                buttons: ["Add to Group", "Create New Group", "Cancel"],
            });

            if (choice === "Add to Group") {
                for (const id of regularIds) {
                    const oldGroup = this.groupModel.getGroupOf(id);
                    if (oldGroup) this.dataModel.deleteLink(oldGroup, id);
                    this.dataModel.addLink(groupId, id);
                }
                this.rebuildAndRender();
                this.serializeToHost();
            } else if (choice === "Create New Group") {
                const result = await showInputDialog({ title: "Group Title", message: "Enter a title for the group:", value: "" });
                if (result?.button !== "OK") return;

                const oldParent = this.groupModel.getGroupOf(groupId);

                const newGroupId = this.dataModel.generateGroupId();
                this.dataModel.sourceData.nodes.push({ id: newGroupId, isGroup: true });

                // Move existing group into new group
                if (oldParent) this.dataModel.deleteLink(oldParent, groupId);
                this.dataModel.sourceData.links.push({ source: newGroupId, target: groupId });

                // Move regular nodes into new group
                for (const id of regularIds) {
                    const oldGroup = this.groupModel.getGroupOf(id);
                    if (oldGroup) this.dataModel.deleteLink(oldGroup, id);
                    this.dataModel.sourceData.links.push({ source: newGroupId, target: id });
                }

                // Nest under old parent if existed
                if (oldParent) {
                    this.dataModel.sourceData.links.push({ source: oldParent, target: newGroupId });
                }

                if (result.value) this.dataModel.updateNodeProps(newGroupId, { title: result.value });

                const renderedNodes = this.renderer.getNodes();
                let cx = 0, cy = 0, count = 0;
                for (const id of [...regularIds, groupId]) {
                    const rn = renderedNodes.find((n) => n.id === id);
                    if (rn?.x != null && rn?.y != null) { cx += rn.x; cy += rn.y; count++; }
                }
                const posHint = count > 0 ? new Map([[newGroupId, { x: cx / count, y: cy / count }]]) : undefined;

                this.rebuildAndRender(undefined, posHint, [newGroupId]);
                this.serializeToHost();
                this.renderer.selectNode(newGroupId);
            }
            return;
        }

        // CASE 3: Multiple groups selected (with or without regular nodes)
        if (groupIds.length >= 2) {
            const groupParents = new Set(groupIds.map((id) => this.groupModel.getGroupOf(id)));
            if (groupParents.size > 1) {
                alertsBarModel.addAlert("Cannot group: selected groups belong to different parent groups.", "warning");
                return;
            }

            // Validate regular nodes are from same level
            const selectedGroupSet = new Set(groupIds);
            for (const id of regularIds) {
                const nodeParent = this.groupModel.getGroupOf(id);
                if (nodeParent && !selectedGroupSet.has(nodeParent) && nodeParent !== [...groupParents][0]) {
                    alertsBarModel.addAlert("Cannot group: selected nodes belong to different groups.", "warning");
                    return;
                }
            }

            const result = await showInputDialog({ title: "Group Title", message: "Enter a title for the group:", value: "" });
            if (result?.button !== "OK") return;

            const newGroupId = this.dataModel.generateGroupId();
            this.dataModel.sourceData.nodes.push({ id: newGroupId, isGroup: true });

            for (const gId of groupIds) {
                const oldParent = this.groupModel.getGroupOf(gId);
                if (oldParent) this.dataModel.deleteLink(oldParent, gId);
                this.dataModel.sourceData.links.push({ source: newGroupId, target: gId });
            }
            for (const id of regularIds) {
                const oldGroup = this.groupModel.getGroupOf(id);
                if (oldGroup) this.dataModel.deleteLink(oldGroup, id);
                this.dataModel.sourceData.links.push({ source: newGroupId, target: id });
            }

            const commonParent = [...groupParents][0]; // undefined if top-level
            if (commonParent) {
                this.dataModel.sourceData.links.push({ source: commonParent, target: newGroupId });
            }

            if (result.value) this.dataModel.updateNodeProps(newGroupId, { title: result.value });

            const renderedNodes = this.renderer.getNodes();
            let cx = 0, cy = 0, count = 0;
            for (const id of selectedIds) {
                const rn = renderedNodes.find((n) => n.id === id);
                if (rn?.x != null && rn?.y != null) { cx += rn.x; cy += rn.y; count++; }
            }
            const posHint = count > 0 ? new Map([[newGroupId, { x: cx / count, y: cy / count }]]) : undefined;

            this.rebuildAndRender(undefined, posHint, [newGroupId]);
            this.serializeToHost();
            this.renderer.selectNode(newGroupId);
            return;
        }

        // CASE 4: Only 1 group, no regular nodes → nothing to do
    }

    async editGroupTitle(groupId: string): Promise<void> {
        if (!this.dataModel.sourceData) return;
        const currentTitle = this.dataModel.sourceData.nodes.find((n) => n.id === groupId)?.title ?? "";
        const result = await showInputDialog({ title: "Group Title", message: "Enter a title for the group:", value: currentTitle });
        if (result?.button === "OK") {
            this.updateNodeProps(groupId, { title: result.value });
        }
    }

    async ungroupNode(groupId: string): Promise<void> {
        if (!this.dataModel.sourceData) return;
        const node = this.dataModel.sourceData.nodes.find((n) => n.id === groupId);
        if (!node?.isGroup) return;

        const members = [...this.groupModel.getMembers(groupId)];
        const parentGroup = this.groupModel.getGroupOf(groupId);
        const label = nodeLabel(node);

        let message = `Ungroup "${label}"?`;
        if (parentGroup) {
            message += ` ${members.length} member(s) will be moved to the parent group.`;
        } else {
            message += ` ${members.length} member(s) will become top-level nodes.`;
        }

        const result = await showConfirmationDialog({ title: "Ungroup", message });
        if (result !== "Yes") return;

        // Remove all links from this group node (membership to members + link from parent)
        this.dataModel.removeAllNodeLinks(groupId);

        // Promote members to parent group
        if (parentGroup) {
            for (const memberId of members) {
                this.dataModel.addLink(parentGroup, memberId);
            }
        }

        // Delete the group node
        this.dataModel.sourceData.nodes = this.dataModel.sourceData.nodes.filter((n) => n.id !== groupId);

        this.renderer.selectNode("");
        this.rebuildAndRender();
        this.serializeToHost();
    }

    async deleteGroupNode(groupId: string): Promise<void> {
        if (!this.dataModel.sourceData) return;
        const node = this.dataModel.sourceData.nodes.find((n) => n.id === groupId);
        if (!node?.isGroup) return;

        // Determine which members are visually connected (have processed links on canvas)
        const visualNeighbors = this.connectivityModel.getProcessedNeighborIds(groupId);
        const directMembers = this.groupModel.getMembers(groupId);
        const parentGroup = this.groupModel.getGroupOf(groupId);
        const label = nodeLabel(node);

        // Collect members to delete: only those with visual links through this group
        // Recursively include their sub-trees
        const toDelete = new Set<string>();
        const toPromote = new Set<string>();

        for (const memberId of directMembers) {
            if (visualNeighbors.has(memberId)) {
                // Visually connected → mark for deletion (with sub-tree)
                toDelete.add(memberId);
                if (this.groupModel.isGroup(memberId)) {
                    for (const sub of this.collectAllSubGroups(memberId)) toDelete.add(sub);
                    for (const sub of this.connectivityModel.getAllRealMembers(memberId)) toDelete.add(sub);
                }
            } else {
                // Not visually connected → promote to parent group
                toPromote.add(memberId);
            }
        }

        // Also count real members being deleted
        const realDeleteCount = [...toDelete].filter((id) => !this.groupModel.isGroup(id)).length;
        const subGroupDeleteCount = [...toDelete].filter((id) => this.groupModel.isGroup(id)).length;

        let message: string;
        if (toDelete.size === 0) {
            message = `Delete group "${label}"? ${toPromote.size} member(s) will be ${parentGroup ? "moved to parent group" : "promoted to top level"}.`;
        } else if (toPromote.size === 0) {
            if (subGroupDeleteCount > 0) {
                message = `Delete group "${label}" and all ${realDeleteCount + subGroupDeleteCount} descendants (${realDeleteCount} nodes, ${subGroupDeleteCount} sub-groups)?`;
            } else {
                message = `Delete group "${label}" and its ${realDeleteCount} member node(s)?`;
            }
        } else {
            message = `Delete group "${label}" with ${toDelete.size} visually connected descendant(s)? ${toPromote.size} unconnected member(s) will be ${parentGroup ? "moved to parent group" : "promoted to top level"}.`;
        }

        const result = await showConfirmationDialog({ title: "Delete Group", message });
        if (result !== "Yes") return;

        // Promote unconnected members to parent group
        for (const id of toPromote) {
            this.dataModel.deleteLink(groupId, id);
            if (parentGroup) {
                this.dataModel.addLink(parentGroup, id);
            }
        }

        // Delete visually connected members
        for (const id of toDelete) {
            this.dataModel.deleteNode(id);
            this.clearRootIfDeleted(id);
        }

        // Delete the group node itself
        this.dataModel.deleteNode(groupId);
        this.clearRootIfDeleted(groupId);

        this.renderer.selectNode("");
        this.rebuildAndRender();
        this.serializeToHost();
    }

    /** Collect all sub-group IDs recursively (depth-first). */
    private collectAllSubGroups(groupId: string): string[] {
        const result: string[] = [];
        const members = this.groupModel.getMembers(groupId);
        for (const memberId of members) {
            if (this.groupModel.isGroup(memberId)) {
                result.push(memberId);
                result.push(...this.collectAllSubGroups(memberId));
            }
        }
        return result;
    }

    /**
     * Remove empty groups iteratively (handles cascading: group → subgroup → node).
     * Must only be called during user-initiated edit operations — never on passive load.
     */
    private cleanupEmptyGroups(): boolean {
        if (!this.dataModel.sourceData) return false;
        let anyRemoved = false;
        for (;;) {
            const { nodes, links } = this.dataModel.sourceData;
            this.groupModel.rebuild(nodes, links);
            const emptyIds = this.groupModel.getEmptyGroupIds();
            if (emptyIds.length === 0) break;
            anyRemoved = true;
            for (const id of emptyIds) {
                this.dataModel.deleteNode(id);
                this.clearRootIfDeleted(id);
            }
        }
        return anyRemoved;
    }

    removeFromGroup(nodeId: string): void {
        const groupId = this.groupModel.getGroupOf(nodeId);
        if (!groupId) return;
        this.dataModel.deleteLink(groupId, nodeId);
        this.cleanupEmptyGroups();
        this.rebuildAndRender();
        this.serializeToHost();
    }

    // =========================================================================
    // Editing operations (delegate to dataModel → rebuild → serialize)
    // =========================================================================

    updateNodeProps(nodeId: string, props: Partial<GraphNode>): void {
        this.dataModel.updateNodeProps(nodeId, props);
        this.rebuildAndRender();
        this.serializeToHost();
        this.refreshSelectedNodes();
    }

    renameNode(oldId: string, newId: string): boolean {
        const ok = this.dataModel.renameNode(oldId, newId);
        if (!ok) return false;

        // Update visibility state so renamed node stays visible
        this.visibilityModel.renameId(oldId, newId);

        // Capture old node's position so it doesn't jump after rebuild
        const oldRendered = this.renderer.getNodes().find((n) => n.id === oldId);
        const posHint = oldRendered?.x != null && oldRendered?.y != null
            ? new Map([[newId, { x: oldRendered.x, y: oldRendered.y }]])
            : undefined;

        this.renderer.selectNode(newId);
        this.rebuildAndRender(undefined, posHint);
        this.serializeToHost();
        this.refreshSelectedNodes();
        return true;
    }

    addNode(worldX: number, worldY: number): string {
        if (!this.dataModel.sourceData) {
            // Initialize empty graph (first node on blank page)
            this.dataModel.sourceData = { nodes: [], links: [] };
            this.originalJson = { type: "force-graph" };
        }

        const id = this.dataModel.addNode();
        this.rebuildAndRender(undefined, new Map([[id, { x: worldX, y: worldY }]]), [id]);
        this.serializeToHost();
        return id;
    }

    deleteNode(nodeId: string): void {
        this.dataModel.deleteNode(nodeId);
        this.clearRootIfDeleted(nodeId);

        // Clear selection if deleted node was selected (handles both single and multi)
        if (this.renderer.selectedIds.has(nodeId)) {
            if (this.renderer.selectedIds.size <= 1) {
                this.renderer.selectNode("");
            }
            // For multi-selection, clearSelectionIf in updateVisibleData will handle cleanup
        }

        this.cleanupEmptyGroups();
        this.rebuildAndRender();
        this.serializeToHost();
    }

    async deleteSelectedNodes(): Promise<void> {
        const ids = [...this.renderer.selectedIds];
        if (ids.length === 0) return;

        if (ids.length > 1) {
            const result = await showConfirmationDialog({
                title: "Delete Nodes",
                message: `Delete ${ids.length} selected nodes?`,
            });
            if (result !== "Yes") return;
        }

        for (const id of ids) {
            this.dataModel.deleteNode(id);
            this.clearRootIfDeleted(id);
        }
        this.cleanupEmptyGroups();
        this.renderer.selectNode("");
        this.rebuildAndRender();
        this.serializeToHost();
    }

    private buildSelectedMarkdown(): string | null {
        const nodes = this.state.get().selectedNodes;
        if (nodes.length === 0) return null;
        const rootId = this.dataModel.sourceData?.options?.rootNode;
        const parts = nodes.map(node => buildMarkdown(node, node.id === rootId));

        // For multiple nodes, prepend a summary table
        if (nodes.length > 1) {
            const table = ["| Title | ID |", "|-------|-----|"];
            for (const node of nodes) {
                const title = (node.title || "").replace(/\|/g, "\\|");
                table.push(`| ${title} | ${node.id} |`);
            }
            return table.join("\n") + "\n\n---\n\n" + parts.join("\n\n---\n\n");
        }

        return parts[0];
    }

    copySelectedMarkdown(): void {
        const md = this.buildSelectedMarkdown();
        if (md) navigator.clipboard.writeText(md);
    }

    openSelectedMarkdown(): void {
        const md = this.buildSelectedMarkdown();
        if (!md) return;
        const count = this.renderer.selectedIds.size;
        const title = count === 1 ? (this.state.get().selectedNodes[0]?.title || "Node") : `${count} nodes`;
        pagesModel.addEditorPage("md-view", "markdown", title, md);
    }

    openSelectedGrid(): void {
        const selectedIds = this.renderer.selectedIds;
        if (selectedIds.size === 0) return;
        const nodes = (this.dataModel.sourceData?.nodes ?? [])
            .filter(n => selectedIds.has(n.id))
            .map(n => this.dataModel.cleanNode(n));
        const count = nodes.length;
        const title = count === 1 ? (nodes[0].title || nodes[0].id) : `${count} nodes`;
        pagesModel.addEditorPage("grid-json", "json", `${title}.grid.json`, JSON.stringify(nodes, null, 2));
    }

    /** Add direct children (real neighbors) of selected non-group nodes to the selection. */
    selectChildren(): void {
        const toAdd: string[] = [];
        for (const id of this.renderer.selectedIds) {
            if (this.groupModel.isGroup(id)) continue;
            for (const neighborId of this.connectivityModel.getRealNeighborIds(id)) {
                if (!this.renderer.selectedIds.has(neighborId)) {
                    toAdd.push(neighborId);
                }
            }
        }
        if (toAdd.length > 0) {
            this.renderer.addToSelection(toAdd);
        }
    }

    /** Add direct members of selected group nodes to the selection. */
    selectMembers(): void {
        const toAdd: string[] = [];
        for (const id of this.renderer.selectedIds) {
            if (!this.groupModel.isGroup(id)) continue;
            for (const memberId of this.groupModel.getMembers(id)) {
                if (!this.renderer.selectedIds.has(memberId)) {
                    toAdd.push(memberId);
                }
            }
        }
        if (toAdd.length > 0) {
            this.renderer.addToSelection(toAdd);
        }
    }

    /** Recursively add all members (including sub-group members) of selected groups to the selection. */
    selectMembersDeep(): void {
        const toAdd: string[] = [];
        const visited = new Set<string>();
        const queue: string[] = [];
        for (const id of this.renderer.selectedIds) {
            if (this.groupModel.isGroup(id)) queue.push(id);
        }
        while (queue.length > 0) {
            const groupId = queue.pop();
            if (visited.has(groupId)) continue;
            visited.add(groupId);
            for (const memberId of this.groupModel.getMembers(groupId)) {
                if (!this.renderer.selectedIds.has(memberId)) {
                    toAdd.push(memberId);
                }
                if (this.groupModel.isGroup(memberId)) {
                    queue.push(memberId);
                }
            }
        }
        if (toAdd.length > 0) {
            this.renderer.addToSelection(toAdd);
        }
    }

    /** Signal the legend panel to open with Selection tab and "selected" filter active. */
    highlightSelection(): void {
        this.onHighlightSelection?.();
    }

    /** Extract selected nodes (and optionally their direct children) into a new graph page. */
    extractSelected(withChildren: boolean): void {
        if (!this.dataModel.sourceData) return;
        const selectedIds = new Set(this.renderer.selectedIds);
        if (selectedIds.size === 0) return;

        // Optionally expand with direct children (real neighbors / group members, 1 hop)
        if (withChildren) {
            const toAdd: string[] = [];
            for (const id of selectedIds) {
                for (const neighborId of this.connectivityModel.getRealNeighborIds(id)) {
                    toAdd.push(neighborId);
                }
            }
            for (const id of toAdd) selectedIds.add(id);
        }

        const allNodes = this.dataModel.sourceData.nodes;
        const allLinks = this.dataModel.sourceData.links;
        const nodeMap = new Map(allNodes.map(n => [n.id, n]));

        // Filter out standalone groups (groups with no members in the extracted set)
        for (const id of [...selectedIds]) {
            const node = nodeMap.get(id);
            if (!node?.isGroup) continue;
            const members = this.groupModel.getMembers(id);
            if (!members) continue;
            const hasExtractedMember = [...members].some(m => selectedIds.has(m));
            if (!hasExtractedMember) {
                selectedIds.delete(id);
            }
        }

        // If nothing left after filtering, show warning
        if (selectedIds.size === 0) {
            alertsBarModel.addAlert(
                "Cannot extract group(s) only — select regular nodes or use 'Extract with children'",
                "warning",
            );
            return;
        }

        // Clean nodes: strip D3 simulation fields and internal system properties
        const extractedNodes: GraphNode[] = [];
        for (const id of selectedIds) {
            const node = nodeMap.get(id);
            if (!node) continue;
            const clean: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(node)) {
                if (!k.startsWith(SYS_PREFIX) && !SIM_FIELDS.has(k)) {
                    clean[k] = v;
                }
            }
            extractedNodes.push(clean as unknown as GraphNode);
        }

        // Filter links — only those where both endpoints are in selectedIds
        const extractedLinks: GraphLink[] = [];
        for (const link of allLinks) {
            const { source: sId, target: tId } = linkIds(link);
            if (selectedIds.has(sId) && selectedIds.has(tId)) {
                extractedLinks.push({ source: sId, target: tId });
            }
        }

        const graphData: GraphData = {
            nodes: extractedNodes,
            links: extractedLinks,
        };

        const title = withChildren ? "Extract with children.fg.json" : "Extract.fg.json";
        pagesModel.addEditorPage("graph-view", "json", title, JSON.stringify(graphData, null, 2));
    }

    addLink(sourceId: string, targetId: string): void {
        this.dataModel.addLink(sourceId, targetId);
        this.rebuildAndRender();
        this.serializeToHost();
    }

    deleteLink(sourceId: string, targetId: string): void {
        this.dataModel.deleteLink(sourceId, targetId);
        this.rebuildAndRender();
        this.serializeToHost();
    }

    addChild(parentId: string): string {
        const id = this.dataModel.addChild(parentId);
        if (!id) return "";

        // Inherit group membership from parent — so the new child stays visually
        // connected instead of having its link routed through the group node.
        const parentGroup = this.groupModel.getGroupOf(parentId);
        if (parentGroup) {
            this.dataModel.addLink(parentGroup, id);
        }

        // Anchor near parent so new node appears close to it; ensure both parent and child are visible
        this.rebuildAndRender(parentId, undefined, [id, parentId]);
        this.serializeToHost();
        return id;
    }

    applyPropertiesUpdate(
        nodeId: string,
        propsToSet: Record<string, string>,
        keysToRemove: string[],
    ): void {
        this.dataModel.applyPropertiesUpdate(nodeId, propsToSet, keysToRemove);
        this.rebuildAndRender();
        this.serializeToHost();
        this.refreshSelectedNodes();
    }

    applyLinkedNodesUpdate(
        selectedNodeId: string,
        rows: Record<string, unknown>[],
        originalIds: Set<string>,
    ): void {
        this.dataModel.applyLinkedNodesUpdate(selectedNodeId, rows, originalIds);
        this.rebuildAndRender();
        this.serializeToHost();
        this.refreshSelectedNodes();
    }

    /** Batch update properties on multiple nodes at once. */
    batchUpdateNodeProps(nodeIds: string[], props: Partial<GraphNode>): void {
        for (const id of nodeIds) {
            this.dataModel.updateNodeProps(id, props);
        }
        this.rebuildAndRender();
        this.serializeToHost();
        this.refreshSelectedNodes();
    }

    /** Batch apply custom properties update to multiple nodes. */
    batchApplyPropertiesUpdate(
        nodeIds: string[],
        propsToSet: Record<string, string>,
        keysToRemove: string[],
    ): void {
        for (const id of nodeIds) {
            this.dataModel.applyPropertiesUpdate(id, propsToSet, keysToRemove);
        }
        this.rebuildAndRender();
        this.serializeToHost();
        this.refreshSelectedNodes();
    }

    // =========================================================================
    // Rebuild pipeline (sourceData → visibility → renderer)
    // =========================================================================

    /**
     * Rebuild the rendering pipeline from sourceData.
     * @param anchorNodeId — existing node near which to place new nodes (for expand/addChild)
     * @param newNodePositions — explicit world positions for brand-new nodes (for addNode on empty area)
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

        this.recomputeSearch();
        this.clearTooltip();
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

        this.skipNextContentUpdate = true;
        this._host.changeContent(JSON.stringify(json, null, 4), true);
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
