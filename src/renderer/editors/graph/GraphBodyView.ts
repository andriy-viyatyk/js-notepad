import { createComponentModelDriver, type ComponentModelDriver, TComponentModel } from "../../core/state/model";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { InputProps } from "../../uikit/Input/InputView";
import { InputView } from "../../uikit/Input/InputView";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import { openMenu, type MenuHandle } from "../../uikit/Menu/attach-menu";
import { createDepsGate, type DepsGate } from "../../uikit/shared/deps-gate";
import { highlightInto } from "../../uikit/shared/highlight";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { themeState } from "../../theme/theme-state";
import type { GraphEditor, GraphEditorState, TooltipInfo } from "./GraphEditor";
import type { SearchInfo, SearchResult } from "./GraphSearchModel";
import { buildSelectionMenu, type SelectionMenuActions, type SelectionMenuInfo } from "./GraphContextMenu";
import { GraphDetailPanelView, type GraphDetailPanelProps } from "./GraphDetailPanelView";
import { GraphExpansionSettingsView } from "./GraphExpansionSettingsView";
import { GraphLegendPanelView } from "./GraphLegendPanelView";
import { GraphTooltipView } from "./GraphTooltipView";
import { GraphTuningSlidersView } from "./GraphTuningSlidersView";
import "../../uikit/Button/Button.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Input/Input.css";
import "../../uikit/Spinner/Spinner.css";
import "./GraphBody.css";

type ToolbarPanel = "closed" | "settings" | "expansion" | "results";
const MAX_DISPLAYED_RESULTS = 100;

interface GraphBodyProps {
    model: GraphEditor;
    canvasRefSetter?: (canvas: HTMLCanvasElement | null) => void;
}

interface GraphBodyState {
    toolbarPanel: ToolbarPanel;
    expandRequest: number;
    collapseRequest: number;
    selectedResultIndex: number;
}

const defaultGraphBodyState: GraphBodyState = {
    toolbarPanel: "closed",
    expandRequest: 0,
    collapseRequest: 0,
    selectedResultIndex: -1,
};

class GraphBodyModel extends TComponentModel<GraphBodyState, GraphBodyProps> {
    setToolbarPanel = (toolbarPanel: ToolbarPanel): void => this.state.update((state) => { state.toolbarPanel = toolbarPanel; });
    toggleSettings = (): void => this.state.update((state) => {
        state.toolbarPanel = state.toolbarPanel === "settings" ? "closed" : "settings";
    });
    incrementExpandRequest = (): void => this.state.update((state) => { state.expandRequest += 1; });
    incrementCollapseRequest = (): void => this.state.update((state) => { state.collapseRequest += 1; });
    setSelectedResultIndex = (selectedResultIndex: number): void => this.state.update((state) => { state.selectedResultIndex = selectedResultIndex; });

    init(): void {}
}

interface GraphEditorProjection {
    error: string;
    loading: boolean;
    searchQuery: string;
    searchInfo: SearchInfo | null;
    searchResults: SearchResult[] | null;
    tooltip: TooltipInfo | null;
    selectedNodes: GraphEditorState["selectedNodes"];
    linkedNodes: GraphEditorState["linkedNodes"];
    groupingEnabled: boolean;
}

function selectEditorProjection(state: GraphEditorState): GraphEditorProjection {
    return {
        error: state.error,
        loading: state.loading,
        searchQuery: state.searchQuery,
        searchInfo: state.searchInfo,
        searchResults: state.searchResults,
        tooltip: state.tooltip,
        selectedNodes: state.selectedNodes,
        linkedNodes: state.linkedNodes,
        groupingEnabled: state.groupingEnabled,
    };
}

class LoadingView extends VanillaView<unknown> {
    private readonly spinner: SpinnerView;

    public constructor() {
        super({}, createPanelElement({ direction: "row", flex: true, width: "100%", height: "100%", minWidth: 0, minHeight: 0, align: "center", justify: "center" }));
        this.root.classList.add("graph-body-loading");
        this.spinner = this.child(new SpinnerView({}));
    }

    protected onMount(): void {
        this.root.append(this.spinner.root);
        this.spinner.mount();
    }
}

interface SearchResultRowProps {
    result: SearchResult;
    searchQuery: string;
    selected: boolean;
    onSelect: (nodeId: string) => void;
}

class SearchResultRowView extends VanillaView<SearchResultRowProps> {
    private readonly labelHost = document.createElement("div");
    private readonly propertiesHost = document.createElement("div");
    private readonly propertyRows = new KeyedList<SearchResult["matchedProps"][number], string, HTMLDivElement>(this.propertiesHost, {
        keyOf: (property) => property.key,
        create: (property) => this.createPropertyRow(property),
        update: (element, property) => this.updatePropertyRow(element, property),
        remove: (element) => element.remove(),
    });

    public constructor(props: SearchResultRowProps) {
        super(props, document.createElement("div"));
        this.root.className = "graph-body-search-row";
        this.labelHost.className = "graph-body-search-title";
        this.propertiesHost.className = "graph-body-search-properties";
        this.root.append(this.labelHost, this.propertiesHost);
    }

    protected onMount(): void {
        this.listen(this.root, "click", () => this.props.onSelect(this.props.result.nodeId));
        this.sync(this.props);
    }

    protected onUpdate(props: SearchResultRowProps): void {
        this.sync(props);
    }

    protected onDispose(): void {
        this.propertyRows.dispose();
    }

    private sync(props: SearchResultRowProps): void {
        if (props.selected) this.root.dataset.selected = "";
        else delete this.root.dataset.selected;
        if (!props.result.visible) this.root.dataset.hidden = "";
        else delete this.root.dataset.hidden;
        highlightInto(this.labelHost, props.result.label, props.searchQuery);
        this.propertyRows.update(props.result.matchedProps);
    }

    private createPropertyRow(property: SearchResult["matchedProps"][number]): HTMLDivElement {
        const row = document.createElement("div");
        row.className = "graph-body-search-property";
        const key = document.createElement("span");
        key.className = "graph-body-search-key";
        const value = document.createElement("span");
        value.className = "graph-body-search-value";
        row.append(key, document.createTextNode(": "), value);
        this.updatePropertyRow(row, property);
        return row;
    }

    private updatePropertyRow(row: HTMLDivElement, property: SearchResult["matchedProps"][number]): void {
        const key = row.children[0] as HTMLElement;
        const value = row.children[2] as HTMLElement;
        highlightInto(key, property.key, this.props.searchQuery);
        highlightInto(value, property.value, this.props.searchQuery);
    }
}

class SearchResultsView extends VanillaView<{
    results: SearchResult[];
    searchQuery: string;
    selectedIndex: number;
    onSelect: (nodeId: string) => void;
}> {
    private readonly rowsHost = document.createElement("div");
    private readonly rows = new KeyedList<SearchResult, string, HTMLDivElement>(this.rowsHost, {
        keyOf: (result) => result.nodeId,
        create: (result, index) => {
            const row = this.child(new SearchResultRowView(this.rowProps(result, index)));
            this.rowViews.set(row.root as HTMLDivElement, row);
            row.mount();
            return row.root as HTMLDivElement;
        },
        update: (element, result, index) => {
            this.rowViews.get(element)?.update(this.rowProps(result, index));
        },
        remove: (element) => {
            this.rowViews.get(element)?.dispose();
            this.rowViews.delete(element);
        },
    });
    private readonly rowViews = new WeakMap<HTMLDivElement, SearchResultRowView>();
    private readonly more = document.createElement("div");

    public constructor(props: { results: SearchResult[]; searchQuery: string; selectedIndex: number; onSelect: (nodeId: string) => void }) {
        super(props, document.createElement("div"));
        this.root.className = "graph-body-search-results";
        this.rowsHost.className = "graph-body-search-rows";
        this.more.className = "graph-body-search-empty";
        this.root.append(this.rowsHost, this.more);
    }

    protected onMount(): void {
        this.sync(this.props);
    }

    protected onUpdate(props: { results: SearchResult[]; searchQuery: string; selectedIndex: number; onSelect: (nodeId: string) => void }): void {
        this.sync(props);
    }

    protected onDispose(): void {
        this.rows.dispose();
    }

    private sync(props: { results: SearchResult[]; searchQuery: string; selectedIndex: number; onSelect: (nodeId: string) => void }): void {
        const displayed = props.results.slice(0, MAX_DISPLAYED_RESULTS);
        this.rows.update(displayed);
        const extra = props.results.length - MAX_DISPLAYED_RESULTS;
        this.more.hidden = extra <= 0;
        this.more.textContent = extra > 0 ? `and ${extra} more...` : "";
        if (props.selectedIndex >= 0) {
            const result = displayed[props.selectedIndex];
            if (result) this.rows.get(result.nodeId)?.scrollIntoView({ block: "nearest" });
        }
    }

    private rowProps(result: SearchResult, index: number): SearchResultRowProps {
        return {
            result,
            searchQuery: this.props.searchQuery,
            selected: index === this.props.selectedIndex,
            onSelect: this.props.onSelect,
        };
    }
}

class SearchEmptyView extends VanillaView<{ message: string }> {
    private readonly message = document.createElement("div");

    public constructor(props: { message: string }) {
        super(props, document.createElement("div"));
        this.root.className = "graph-body-search-empty";
        this.root.append(this.message);
    }

    protected onMount(): void { this.message.textContent = this.props.message; }
    protected onUpdate(props: { message: string }): void { this.message.textContent = props.message; }
}

interface SearchPanelProps {
    results: SearchResult[] | null;
    searchQuery: string;
    selectedIndex: number;
    searchInfo: SearchInfo | null;
    selectedCount: number;
    onSelect: (nodeId: string) => void;
    onRevealHidden: () => void;
    onSelectAll: () => void;
}

class SearchPanelView extends VanillaView<SearchPanelProps> {
    private readonly branchHost = document.createElement("div");
    private readonly branchSwap = new SubtreeSwap<"results" | "empty">(this.branchHost);
    private readonly status = document.createElement("div");
    private readonly visible = document.createElement("span");
    private readonly hiddenButton: ButtonView;
    private readonly selectButton: ButtonView;
    private active: SearchResultsView | SearchEmptyView | undefined;

    public constructor(props: SearchPanelProps) {
        super(props, createPanelElement({ direction: "column", width: "100%", minWidth: 0 }));
        this.hiddenButton = new ButtonView({ size: "sm", variant: "link", onClick: () => this.props.onRevealHidden(), children: "" });
        this.selectButton = new ButtonView({ size: "sm", variant: "link", onClick: () => this.props.onSelectAll(), children: "" });
        this.root.classList.add("graph-body-panel");
        this.branchHost.className = "graph-body-search-branch";
        this.status.className = "graph-body-search-status";
        this.status.hidden = true;
        this.status.append(this.visible, this.hiddenButton.root, this.selectButton.root);
        this.root.append(this.branchHost, this.status);
    }

    protected onMount(): void {
        this.child(this.hiddenButton);
        this.child(this.selectButton);
        this.hiddenButton.mount();
        this.selectButton.mount();
        this.sync(this.props);
    }

    protected onUpdate(props: SearchPanelProps): void { this.sync(props); }

    protected onDispose(): void { this.branchSwap.dispose(); this.active = undefined; }

    private sync(props: SearchPanelProps): void {
        const hasResults = Boolean(props.results && props.results.length > 0);
        let created: SearchResultsView | SearchEmptyView | undefined;
        this.branchSwap.set(hasResults ? "results" : "empty", (key) => {
            const view = key === "results"
                ? new SearchResultsView({ results: props.results ?? [], searchQuery: props.searchQuery, selectedIndex: props.selectedIndex, onSelect: props.onSelect })
                : new SearchEmptyView({ message: props.searchQuery ? "No results" : "Type to search" });
            this.active = view;
            created = view;
            return view;
        });
        if (created) created.mount();
        else if (this.active instanceof SearchResultsView) this.active.update({ results: props.results ?? [], searchQuery: props.searchQuery, selectedIndex: props.selectedIndex, onSelect: props.onSelect });
        else this.active?.update({ message: props.searchQuery ? "No results" : "Type to search" });

        const info = props.searchInfo;
        this.status.hidden = !info;
        if (info) {
            this.visible.textContent = `${info.visible} visible`;
            this.hiddenButton.update({ size: "sm", variant: "link", disabled: info.hidden === 0, onClick: props.onRevealHidden, children: info.hidden > 0 ? `[+${info.hidden} hidden]` : "" });
            this.selectButton.update({ size: "sm", variant: "link", onClick: props.onSelectAll, children: `[${props.selectedCount > 0 ? "add to selection" : "select all"}]` });
        }
    }
}

interface GraphContentProps {
    editor: GraphEditor;
    canvasRefSetter?: (canvas: HTMLCanvasElement | null) => void;
    bodyState: GraphBodyState;
    setToolbarPanel: (panel: ToolbarPanel) => void;
    setSelectedResultIndex: (index: number) => void;
    incrementCollapseRequest: () => void;
    projection: GraphEditorProjection;
}

class GraphContentView extends VanillaView<GraphContentProps> {
    private readonly editor: GraphEditor;
    private readonly canvas = document.createElement("canvas");
    private readonly emptyHint = document.createElement("div");
    private readonly toolbar = document.createElement("div");
    private readonly toolbarRow = document.createElement("div");
    private readonly tabs = document.createElement("div");
    private readonly panelHost = document.createElement("div");
    private readonly panelSwap = new SubtreeSwap<ToolbarPanel>(this.panelHost);
    private readonly tooltipHost = document.createElement("span");
    private readonly tooltipSwap = new SubtreeSwap<"tooltip">(this.tooltipHost);
    private readonly selectionInfo = document.createElement("button");
    private readonly searchInfo = document.createElement("span");
    private readonly tabButtons = new Map<Exclude<ToolbarPanel, "closed">, HTMLButtonElement>();
    private readonly settingsButton: IconButtonView;
    private readonly groupingButton: IconButtonView;
    private readonly resetButton: IconButtonView;
    private readonly expandAllButton: IconButtonView;
    private readonly clearButton: IconButtonView;
    private readonly searchInput: InputView;
    private readonly detail: GraphDetailPanelView;
    private readonly legend: GraphLegendPanelView;
    private readonly containerRef: { current: HTMLElement | null } = { current: null };
    private activePanel: VanillaView<unknown> | undefined;
    private activeTooltip: GraphTooltipView | undefined;
    private selectionMenu: MenuHandle | undefined;
    private panelDirty = false;
    private panelExpanded = false;
    private popupClosedAt = 0;
    private live = true;

    public constructor(props: GraphContentProps) {
        super(props, createPanelElement({ name: "graph-body-content", direction: "column", flex: true, width: "100%", height: 0, minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }));
        this.editor = props.editor;
        this.root.classList.add("graph-body-content");
        this.containerRef.current = this.root;
        this.canvas.className = "graph-body-canvas";
        this.emptyHint.className = "graph-body-empty-hint";
        this.emptyHint.textContent = "Right-click → Add Node to start building the graph";
        this.toolbar.className = "graph-body-toolbar";
        this.toolbarRow.className = "graph-body-toolbar-row";
        this.tabs.className = "graph-body-tabs";
        this.panelHost.className = "graph-body-panel";
        this.tooltipHost.style.display = "contents";
        this.selectionInfo.className = "graph-body-selection-info";
        this.selectionInfo.type = "button";
        this.searchInfo.className = "graph-body-search-info";

        this.settingsButton = new IconButtonView({ name: "graph-settings", size: "sm", icon: "settings", onClick: () => props.setToolbarPanel(props.bodyState.toolbarPanel === "settings" ? "closed" : "settings"), title: "Force tuning" });
        this.groupingButton = new IconButtonView({ name: "graph-toggle-grouping", size: "sm", icon: "graph-group", title: "Enable grouping", onClick: () => props.editor.toggleGrouping() });
        this.resetButton = new IconButtonView({ name: "graph-reset-view", size: "sm", icon: "refresh", title: "Reset view", onClick: () => props.editor.resetView() });
        this.expandAllButton = new IconButtonView({ name: "graph-expand-all", size: "sm", icon: "expand-all", title: "Expand all nodes", onClick: this.handleExpandAll });
        this.clearButton = new IconButtonView({ name: "graph-search-clear", size: "sm", icon: "close", title: "Clear search", onClick: this.clearSearch });
        this.searchInput = new InputView(this.searchProps());
        this.detail = new GraphDetailPanelView(this.detailProps());
        this.legend = new GraphLegendPanelView({ editor: props.editor });

        for (const tab of ["settings", "expansion", "results"] as const) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "graph-body-tab";
            button.textContent = tab === "settings" ? "Physics" : tab === "expansion" ? "Expansion" : "Results";
            this.tabButtons.set(tab, button);
            this.tabs.append(button);
        }
        this.toolbarRow.append(this.settingsButton.root, this.groupingButton.root, this.resetButton.root, this.expandAllButton.root, this.searchInput.root, this.searchInfo, this.selectionInfo);
        this.toolbar.append(this.toolbarRow, this.tabs, this.panelHost);
        this.root.append(this.canvas, this.emptyHint, this.toolbar, this.tooltipHost, this.detail.root, this.legend.root);
    }

    protected onMount(): void {
        // Hand the canvas to the renderer. The previous view did this in its canvas-ref callback
        // (`editor.renderer.setCanvas(el); canvasRefSetter?.(el);`) — the conversion
        // kept only the unmount half (`setCanvas(null)` in onDispose), so the renderer never
        // received a canvas: no simulation, no drag/zoom, no `handleResize()` — which left the
        // backing store at the HTML default 300x150 while the element measured 1557x949 — no
        // ResizeObserver, and the already-loaded graph data never applied. `setCanvas` calls
        // `handleResize()` and then observes the canvas, and a ResizeObserver fires once on
        // first observation, so the size settles even if this runs before attachment.
        this.props.editor.renderer.setCanvas(this.canvas);
        this.props.canvasRefSetter?.(this.canvas);
        this.own(() => { this.live = false; this.selectionMenu?.dispose(); this.selectionMenu = undefined; });
        this.own(() => this.tooltipSwap.dispose());
        this.own(() => this.panelSwap.dispose());
        this.listen(this.canvas, "click", this.handleCanvasClick);
        this.listen(this.canvas, "dblclick", (event) => { if (!this.panelDirty) this.props.editor.renderer.onDblClick(event); });
        this.listen(this.canvas, "contextmenu", (event) => { if (!this.panelDirty) { this.props.setToolbarPanel("closed"); this.props.editor.renderer.onContextMenu(event); } });
        this.listen(this.canvas, "mousemove", this.props.editor.renderer.onMouseMove);
        this.listen(this.root, "mousedown", this.handleMouseDownCapture, { capture: true });
        this.listen(this.toolbar, "mouseenter", () => { this.toolbar.dataset.hovered = ""; });
        this.listen(this.toolbar, "mouseleave", () => { delete this.toolbar.dataset.hovered; });
        this.listen(this.toolbar, "focusin", () => { this.toolbar.dataset.focusWithin = ""; });
        this.listen(this.toolbar, "focusout", this.handleToolbarFocusOut);
        for (const [tab, button] of this.tabButtons) this.listen(button, "click", () => this.props.setToolbarPanel(tab));
        this.listen(this.selectionInfo, "click", this.openSelectionMenu);
        this.child(this.settingsButton);
        this.child(this.groupingButton);
        this.child(this.resetButton);
        this.child(this.expandAllButton);
        this.child(this.clearButton);
        this.child(this.searchInput);
        this.child(this.detail);
        this.child(this.legend);
        this.settingsButton.mount();
        this.groupingButton.mount();
        this.resetButton.mount();
        this.expandAllButton.mount();
        this.clearButton.mount();
        this.searchInput.mount();
        this.searchElement = this.searchInput.inputElement;
        this.detail.mount();
        this.legend.mount();
        this.sync(this.props);
    }

    protected onUpdate(props: GraphContentProps): void {
        if (props.editor !== this.editor) throw new Error("Graph body received a different editor instance.");
        this.sync(props);
    }

    protected onDispose(): void {
        this.live = false;
        this.selectionMenu?.dispose();
        this.selectionMenu = undefined;
        this.props.editor.isPopupOpen = false;
        this.tooltipSwap.dispose();
        this.panelSwap.dispose();
        this.props.editor.renderer.setCanvas(null);
        this.props.canvasRefSetter?.(null);
    }

    focusSearch(): void {
        this.searchElement?.focus();
        this.searchElement?.select();
    }

    private sync(props: GraphContentProps): void {
        this.emptyHint.hidden = !props.editor.isEmpty;
        this.searchInfo.hidden = Boolean(props.bodyState.toolbarPanel !== "closed" || !props.projection.searchInfo);
        this.searchInfo.textContent = props.projection.searchInfo ? `${props.projection.searchInfo.visible} matched` : "";
        this.selectionInfo.hidden = props.projection.selectedNodes.length === 0;
        this.selectionInfo.textContent = `${props.projection.selectedNodes.length} selected ▾`;
        if (props.bodyState.toolbarPanel !== "closed" || props.projection.searchQuery) this.toolbar.dataset.active = "";
        else delete this.toolbar.dataset.active;
        this.settingsButton.update({ ...this.settingsProps(), onClick: () => props.setToolbarPanel(props.bodyState.toolbarPanel === "settings" ? "closed" : "settings") });
        this.groupingButton.update({ ...this.groupingProps(), onClick: () => props.editor.toggleGrouping() });
        this.resetButton.update({ name: "graph-reset-view", size: "sm", icon: "refresh", title: "Reset view", onClick: () => props.editor.resetView() });
        this.expandAllButton.update({ name: "graph-expand-all", size: "sm", icon: "expand-all", title: "Expand all nodes", disabled: !props.editor.hasVisibilityFilter, onClick: this.handleExpandAll });
        this.clearButton.update({ name: "graph-search-clear", size: "sm", icon: "close", title: "Clear search", onClick: this.clearSearch });
        this.searchInput.update(this.searchProps());
        this.detail.update(this.detailProps());
        this.legend.update({ editor: props.editor });
        this.syncPanel(props);
        this.syncTooltip(props);
        this.containerRef.current = this.root;
    }

    private syncPanel(props: GraphContentProps): void {
        const panel = props.bodyState.toolbarPanel;
        const key = panel === "closed" ? null : panel;
        for (const [tab, button] of this.tabButtons) {
            if (key === tab) button.dataset.active = "";
            else delete button.dataset.active;
        }
        this.tabs.hidden = key === null;
        let created: VanillaView<unknown> | undefined;
        this.panelSwap.set(key, (panelKey) => {
            const view: VanillaView<unknown> = panelKey === "settings"
                ? new GraphTuningSlidersView({ editor: props.editor })
                : panelKey === "expansion"
                    ? new GraphExpansionSettingsView({ editor: props.editor })
                : new SearchPanelView({ results: props.projection.searchResults, searchQuery: props.projection.searchQuery, selectedIndex: props.bodyState.selectedResultIndex, searchInfo: props.projection.searchInfo, selectedCount: props.projection.selectedNodes.length, onSelect: this.selectResult, onRevealHidden: () => props.editor.revealHiddenMatches(), onSelectAll: () => props.editor.selectSearchResults() });
            this.activePanel = view;
            created = view;
            return view;
        });
        if (created) created.mount();
        else if (this.activePanel) this.activePanel.update(this.panelProps(props));
    }

    private panelProps(props: GraphContentProps): unknown {
        if (props.bodyState.toolbarPanel === "settings") return { editor: props.editor };
        if (props.bodyState.toolbarPanel === "expansion") return { editor: props.editor };
        return { results: props.projection.searchResults, searchQuery: props.projection.searchQuery, selectedIndex: props.bodyState.selectedResultIndex, searchInfo: props.projection.searchInfo, selectedCount: props.projection.selectedNodes.length, onSelect: this.selectResult, onRevealHidden: () => props.editor.revealHiddenMatches(), onSelectAll: () => props.editor.selectSearchResults() };
    }

    private syncTooltip(props: GraphContentProps): void {
        const tooltip = props.projection.tooltip;
        let created: GraphTooltipView | undefined;
        this.tooltipSwap.set(tooltip ? "tooltip" : null, () => {
            if (!tooltip) throw new Error("Graph tooltip data is missing.");
            const { node, x, y, isRoot } = tooltip;
            const view = new GraphTooltipView({ node, x, y, isRoot, onMouseEnter: () => props.editor.tooltipModel.setHovered(true), onMouseLeave: () => props.editor.tooltipModel.setHovered(false) });
            this.activeTooltip = view;
            created = view;
            return view;
        });
        if (created) created.mount();
        else if (tooltip) this.activeTooltip?.update({ node: tooltip.node, x: tooltip.x, y: tooltip.y, isRoot: tooltip.isRoot, onMouseEnter: () => props.editor.tooltipModel.setHovered(true), onMouseLeave: () => props.editor.tooltipModel.setHovered(false) });
        else this.activeTooltip = undefined;
    }

    private settingsProps(): IconButtonProps { return { name: "graph-settings", size: "sm", icon: "settings", active: this.props.bodyState.toolbarPanel === "settings", title: "Force tuning", onClick: () => undefined }; }
    private groupingProps(): IconButtonProps { return { name: "graph-toggle-grouping", size: "sm", icon: "graph-group", strikethrough: this.props.projection.groupingEnabled, disabled: !this.props.editor.hasGroups, title: this.props.projection.groupingEnabled ? "Disable grouping" : "Enable grouping", onClick: () => undefined }; }
    private searchProps(): InputProps { return { name: "graph-search", size: "sm", width: 130, placeholder: "Search nodes...", value: this.props.projection.searchQuery, onChange: (value) => this.props.editor.setSearchQuery(value), onKeyDown: this.handleSearchKeyDown, onFocus: () => { if ((this.props.editor.state.get().searchResults?.length ?? 0) > 0) this.props.setToolbarPanel("results"); }, endSlot: this.props.projection.searchQuery ? this.clearButton.root : undefined }; }
    private searchElement: HTMLInputElement | null = null;

    private detailProps(): GraphDetailPanelProps { return { nodes: this.props.projection.selectedNodes.filter((node) => !node.isGroup), linkedNodes: this.props.projection.linkedNodes, onUpdateProps: (id, patch) => this.props.editor.mutationModel.updateNodeProps(id, patch), onBatchUpdateProps: (ids, patch) => this.props.editor.mutationModel.batchUpdateNodeProps(ids, patch), onRenameNode: (oldId, newId) => this.props.editor.mutationModel.renameNode(oldId, newId), onApplyLinks: (id, rows, original) => this.props.editor.mutationModel.applyLinkedNodesUpdate(id, rows, original), onApplyProperties: (id, set, remove) => this.props.editor.mutationModel.applyPropertiesUpdate(id, set, remove), onBatchApplyProperties: (ids, set, remove) => this.props.editor.mutationModel.batchApplyPropertiesUpdate(ids, set, remove), onPanelDirtyChange: (dirty) => { this.panelDirty = dirty; }, onPanelExpandedChange: (expanded) => { this.panelExpanded = expanded; }, onHighlightSet: (ids) => this.props.editor.setHighlightSet(ids), onExternalHover: (id) => this.props.editor.setExternalHover(id), onExpandNode: (id) => this.props.editor.expandNode(id), containerRef: this.containerRef, expandRequest: this.props.bodyState.expandRequest, collapseRequest: this.props.bodyState.collapseRequest }; }

    private readonly handleCanvasClick = (event: MouseEvent): void => {
        if (this.panelDirty) return;
        if (Date.now() - this.popupClosedAt < 300) return;
        const expanded = this.props.bodyState.toolbarPanel !== "closed";
        if (expanded || this.panelExpanded) {
            if (!expanded && this.panelExpanded && this.props.editor.renderer.hasNodeAt(event)) {
                this.props.editor.renderer.onClick(event);
                return;
            }
            this.props.setToolbarPanel("closed");
            this.props.incrementCollapseRequest();
            return;
        }
        this.props.editor.renderer.onClick(event);
    };

    private readonly handleMouseDownCapture = (event: MouseEvent): void => {
        if (event.target === event.currentTarget) return;
        if (this.props.editor.isPopupOpen) this.popupClosedAt = Date.now();
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    };

    private readonly handleToolbarFocusOut = (event: FocusEvent): void => {
        if (!(event.relatedTarget instanceof Node) || !this.toolbar.contains(event.relatedTarget)) delete this.toolbar.dataset.focusWithin;
    };

    private readonly handleSearchKeyDown = (event: KeyboardEvent): void => {
        const results = this.props.editor.state.get().searchResults;
        const count = results?.length ?? 0;
        if (event.key === "ArrowDown" && count > 0) { event.preventDefault(); this.props.setSelectedResultIndex((this.props.bodyState.selectedResultIndex + 1) % Math.min(count, MAX_DISPLAYED_RESULTS)); }
        else if (event.key === "ArrowUp" && count > 0) { event.preventDefault(); const max = Math.min(count, MAX_DISPLAYED_RESULTS); this.props.setSelectedResultIndex((this.props.bodyState.selectedResultIndex - 1 + max) % max); }
        else if (event.key === "Enter" && results && count > 0) { event.preventDefault(); const index = this.props.bodyState.selectedResultIndex >= 0 ? this.props.bodyState.selectedResultIndex : 0; if (index < count) this.selectResult(results[index].nodeId); }
        else if (event.key === "Escape") { if (this.props.bodyState.toolbarPanel !== "closed") this.props.setToolbarPanel("closed"); else this.clearSearch(); }
    };

    private readonly clearSearch = (): void => { this.props.editor.setSearchQuery(""); this.searchElement?.focus(); };
    private readonly selectResult = (nodeId: string): void => this.props.editor.revealAndSelectNode(nodeId);

    private readonly handleExpandAll = async (): Promise<void> => {
        if (this.props.editor.totalNodeCount > 1000) {
            const result = await showConfirmationDialog({ title: "Expand All Nodes", message: `This graph has ${this.props.editor.totalNodeCount} nodes. Expanding all may cause performance issues. Continue?` });
            if (result !== "Yes" || !this.live) return;
        }
        this.props.editor.expandAll();
    };

    private readonly openSelectionMenu = (): void => {
        const selectedNodes = this.props.projection.selectedNodes;
        if (selectedNodes.length === 0) return;
        this.selectionMenu?.dispose();
        const info: SelectionMenuInfo = { count: selectedNodes.length, hasGroups: selectedNodes.some((node) => node.isGroup), hasNonGroups: selectedNodes.some((node) => !node.isGroup) };
        const actions: SelectionMenuActions = { selectChildren: () => this.props.editor.groupActions.selectChildren(), selectMembers: () => this.props.editor.groupActions.selectMembers(), selectMembersDeep: () => this.props.editor.groupActions.selectMembersDeep(), highlight: () => this.props.editor.onHighlightSelection?.(), copyMarkdown: () => this.props.editor.mutationModel.copySelectedMarkdown(), openMarkdown: () => this.props.editor.mutationModel.openSelectedMarkdown(), openGrid: () => this.props.editor.mutationModel.openSelectedGrid(), extract: () => this.props.editor.mutationModel.extractSelected(false), extractWithChildren: () => this.props.editor.mutationModel.extractSelected(true), deleteNodes: () => this.props.editor.mutationModel.deleteSelectedNodes(), groupSelected: () => this.props.editor.groupActions.groupSelectedNodes() };
        this.props.editor.isPopupOpen = true;
        this.selectionMenu = openMenu(this.selectionInfo, { items: buildSelectionMenu(info, actions, this.props.projection.groupingEnabled), placement: "bottom-start", onClose: () => { this.selectionMenu = undefined; this.props.editor.isPopupOpen = false; } });
    };
}

export class GraphBodyView extends VanillaView<GraphBodyProps> {
    private readonly driver: ComponentModelDriver<GraphBodyState, GraphBodyProps, GraphBodyModel>;
    private readonly editor: GraphEditor;
    private readonly errorPanel: HTMLDivElement;
    private readonly errorText: HTMLSpanElement;
    private readonly branchHost = createPanelElement({ direction: "column", flex: true, width: "100%", height: "100%", minWidth: 0, minHeight: 0 });
    private readonly branchSwap = new SubtreeSwap<"loading" | "content">(this.branchHost);
    private projection: GraphEditorProjection;
    private bodyState: GraphBodyState;
    private readonly searchGate: DepsGate = createDepsGate();
    private activeBranch: LoadingView | GraphContentView | undefined;
    private live = true;

    public constructor(props: GraphBodyProps) {
        super(props, createPanelElement({ name: "graph-body", direction: "column", flex: true, width: "100%", height: 0, minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }));
        this.root.classList.add("graph-body");
        this.editor = props.model;
        this.driver = createComponentModelDriver(props, GraphBodyModel, defaultGraphBodyState);
        this.bodyState = this.driver.model.state.get();
        this.projection = selectEditorProjection(this.editor.state.get());
        this.errorText = createTextElement("", { color: "warning", preWrap: true });
        this.errorPanel = createPanelElement({ name: "editor-error", flex: true, justify: "center", align: "center", padding: "xxl" }, [this.errorText]);
        this.errorPanel.classList.add("graph-body-error");
        this.errorPanel.hidden = true;
    }

    protected onMount(): void {
        this.own(() => { this.live = false; });
        this.own(() => this.branchSwap.dispose());
        this.own(() => this.driver.dispose());
        this.own(() => {
            if (this.editor.onDoubleClickNode === this.handleDoubleClickNode) this.editor.onDoubleClickNode = null;
        });
        this.editor.onDoubleClickNode = this.handleDoubleClickNode;
        this.root.append(this.errorPanel, this.branchHost);
        this.driver.mount();
        this.own(this.editor.typedQueue.subscribe(() => undefined));
        this.bind(this.driver.model.state, (state) => state, this.applyBodyState);
        this.bind(this.editor.state, selectEditorProjection, this.applyProjection);
        this.bind(themeState, (state) => state.id, () => { if (this.live) this.editor.refreshColors(); });
        this.listen(document, "keydown", this.handleDocumentKeyDown);
        this.listen(document, "keyup", this.handleDocumentKeyUp);
        this.listen(window, "blur", this.handleWindowBlur);
    }

    protected onUpdate(props: GraphBodyProps): void {
        if (props.model !== this.editor) throw new Error("Graph body received a different editor instance.");
        this.driver.update(props);
    }

    protected onDispose(): void {
        this.live = false;
        this.clearAltKeyHighlight();
    }

    private readonly handleDoubleClickNode = (): void => { if (this.live) this.driver.model.incrementExpandRequest(); };

    private altKeyHighlightActive = false;

    private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Shift" && !this.altKeyHighlightActive) {
            const selectedIds = this.editor.renderer.selectedIds;
            if (selectedIds.size > 0) {
                this.altKeyHighlightActive = true;
                const ids = new Set(selectedIds);
                for (const nodeId of selectedIds) {
                    for (const id of this.editor.connectivityModel.getProcessedNeighborIds(nodeId)) ids.add(id);
                    for (const id of this.editor.connectivityModel.getRealNeighborIds(nodeId)) ids.add(id);
                }
                this.editor.renderer.setAltKeyHighlight(ids);
            }
        }
        if (event.ctrlKey && event.key === "f") {
            event.preventDefault();
            this.activeBranch instanceof GraphContentView && this.activeBranch.focusSearch();
        }
        if (event.ctrlKey && event.key === "a") {
            event.preventDefault();
            const allIds = this.editor.renderer.getNodes().map((node) => node.id);
            this.editor.renderer.selectNode("");
            this.editor.renderer.addToSelection(allIds);
        }
    };

    private readonly handleDocumentKeyUp = (event: KeyboardEvent): void => {
        if (event.key === "Shift") this.clearAltKeyHighlight();
    };

    private readonly handleWindowBlur = (): void => { this.clearAltKeyHighlight(); };

    private readonly clearAltKeyHighlight = (): void => {
        if (!this.altKeyHighlightActive) return;
        this.altKeyHighlightActive = false;
        this.editor.renderer.setAltKeyHighlight(null);
    };

    private readonly applyBodyState = (state: GraphBodyState): void => {
        this.bodyState = state;
        this.activeBranch?.update(this.contentProps());
    };

    private readonly applyProjection = (projection: GraphEditorProjection): void => {
        const previous = this.projection;
        this.projection = projection;
        const { searchResults, searchQuery } = projection;
        if (this.searchGate.changed([this.editor, searchResults, searchQuery])) {
            queueMicrotask(() => {
                if (!this.live || !this.driver.model.isLive) return;
                const current = this.editor.state.get();
                if (current.searchResults !== searchResults || current.searchQuery !== searchQuery) return;
                if (searchResults && searchResults.length > 0) {
                    this.driver.model.setToolbarPanel("results");
                    this.driver.model.setSelectedResultIndex(-1);
                } else if (!searchQuery && this.driver.model.state.get().toolbarPanel === "results") {
                    this.driver.model.setToolbarPanel("closed");
                }
            });
        }
        this.errorText.textContent = projection.error;
        this.errorPanel.hidden = !projection.error;
        const key = projection.loading ? "loading" : "content";
        let created: LoadingView | GraphContentView | undefined;
        this.branchSwap.set(key, (branch) => {
            const view = branch === "loading" ? new LoadingView() : new GraphContentView(this.contentProps());
            this.activeBranch = view;
            created = view;
            return view;
        });
        if (created) created.mount();
        else if (previous !== projection && this.activeBranch instanceof GraphContentView) this.activeBranch.update(this.contentProps());
    };

    private contentProps(): GraphContentProps {
        return { editor: this.editor, canvasRefSetter: this.props.canvasRefSetter, bodyState: this.bodyState, setToolbarPanel: this.driver.model.setToolbarPanel, setSelectedResultIndex: this.driver.model.setSelectedResultIndex, incrementCollapseRequest: this.driver.model.incrementCollapseRequest, projection: this.projection };
    }
}
