import { createComponentModelDriver, type ComponentModelDriver, TComponentModel } from "../../core/state/model";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { InputProps } from "../../uikit/Input/InputView";
import { InputView } from "../../uikit/Input/InputView";
import {
    DataGridView,
    detectColumnWidth,
    type AddRowsEvent,
    type CellContext,
    type CellEditEvent,
    type CellFocus,
    type Column,
    type DataGridInstance,
    type DataGridProps,
    type DeleteRowsEvent,
} from "../../uikit/DataGrid";
import { createDepsGate, type DepsGate } from "../../uikit/shared/deps-gate";
import { createIconElement } from "../../uikit/shared/slots";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import color from "../../theme/color";
import { createLevelIconElement, createShapeIconElement } from "./GraphIcons";
import { isReservedPropertyKey, nodeLabel, type GraphNode, type NodeShape } from "./types";
import "../../uikit/Button/Button.css";
import "../../uikit/Input/Input.css";
import "./GraphDetailPanel.css";

const SHAPES: NodeShape[] = ["circle", "square", "diamond", "triangle", "star", "hexagon"];
const LEVELS = [1, 2, 3, 4, 5];
const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 300;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const MAX_PERCENT = 0.9;

export interface GraphDetailPanelProps {
    nodes: GraphNode[];
    linkedNodes: GraphNode[];
    onUpdateProps: (nodeId: string, props: Partial<GraphNode>) => void;
    onBatchUpdateProps: (nodeIds: string[], props: Partial<GraphNode>) => void;
    onRenameNode: (oldId: string, newId: string) => boolean;
    onApplyLinks: (selectedNodeId: string, rows: Record<string, unknown>[], originalIds: Set<string>) => void;
    onApplyProperties: (nodeId: string, propsToSet: Record<string, string>, keysToRemove: string[]) => void;
    onBatchApplyProperties: (nodeIds: string[], propsToSet: Record<string, string>, keysToRemove: string[]) => void;
    onPanelDirtyChange?: (dirty: boolean) => void;
    onPanelExpandedChange?: (expanded: boolean) => void;
    onHighlightSet?: (ids: Set<string> | null) => void;
    onExternalHover?: (id: string) => void;
    onExpandNode?: (nodeId: string) => void;
    containerRef?: { current: HTMLElement | null };
    expandRequest?: number;
    collapseRequest?: number;
}

interface GraphDetailState {
    expanded: boolean;
    activeTab: string;
    linksDirty: boolean;
    propertiesDirty: boolean;
    size: { width: number; height: number };
    editId: string;
    editTitle: string;
    idError: string;
}

const defaultGraphDetailState: GraphDetailState = {
    expanded: false, activeTab: "info", linksDirty: false, propertiesDirty: false,
    size: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, editId: "", editTitle: "", idError: "",
};

class GraphDetailModel extends TComponentModel<GraphDetailState, GraphDetailPanelProps> {
    private hadSelection = false;
    private wasExpanded = true;

    setExpanded = (expanded: boolean): void => this.state.update((state) => { state.expanded = expanded; });
    setActiveTab = (activeTab: string): void => this.state.update((state) => { state.activeTab = activeTab; });
    setLinksDirty = (dirty: boolean): void => this.state.update((state) => { state.linksDirty = dirty; });
    setPropertiesDirty = (dirty: boolean): void => this.state.update((state) => { state.propertiesDirty = dirty; });
    setSize = (size: { width: number; height: number }): void => this.state.update((state) => { state.size = size; });
    setEditId = (editId: string): void => this.state.update((state) => { state.editId = editId; });
    setEditTitle = (editTitle: string): void => this.state.update((state) => { state.editTitle = editTitle; });
    setIdError = (idError: string): void => this.state.update((state) => { state.idError = idError; });

    toggleExpanded = (hasSelection: boolean, dirty: boolean): void => {
        if (!hasSelection || dirty) return;
        const next = !this.state.get().expanded;
        this.wasExpanded = next;
        this.setExpanded(next);
    };

    markExpandedByRequest(): void { this.wasExpanded = true; }
    markCollapsedByRequest(): void { this.wasExpanded = false; }

    applySelectionDependencies(hasSelection: boolean, selectionKey: string, live: () => boolean): void {
        if (hasSelection) {
            const restore = !this.hadSelection ? this.wasExpanded : undefined;
            this.hadSelection = true;
            if (restore !== undefined) queueMicrotask(() => {
                if (!live() || this.props.nodes.map((node) => node.id).sort().join(",") !== selectionKey) return;
                this.setExpanded(restore);
            });
        } else {
            this.wasExpanded = false;
            this.hadSelection = false;
            queueMicrotask(() => {
                if (!live() || this.props.nodes.length > 0) return;
                this.setExpanded(false);
            });
        }
    }

    dispose = (): void => {
        this.props.onHighlightSet?.(null);
        this.props.onExternalHover?.("");
    };
}

interface DetailBodyProps extends Pick<GraphDetailPanelProps,
    "nodes" | "linkedNodes" | "containerRef" | "onUpdateProps" | "onBatchUpdateProps" | "onRenameNode"
    | "onApplyLinks" | "onApplyProperties" | "onBatchApplyProperties" | "onPanelDirtyChange" | "onExternalHover"> {
    expanded: boolean;
    activeTab: string;
    linksDirty: boolean;
    propertiesDirty: boolean;
    size: { width: number; height: number };
    editId: string;
    editTitle: string;
    idError: string;
    setActiveTab: (tab: string) => void;
    setLinksDirty: (dirty: boolean) => void;
    setPropertiesDirty: (dirty: boolean) => void;
    setSize: (size: { width: number; height: number }) => void;
    setEditId: (value: string) => void;
    setEditTitle: (value: string) => void;
    setIdError: (value: string) => void;
    commitId: () => void;
    commitTitle: () => void;
}

type DetailContentKey = "info-single" | "info-multi" | "properties" | "links";

export class GraphDetailPanelView extends VanillaView<GraphDetailPanelProps> {
    private readonly driver: ComponentModelDriver<GraphDetailState, GraphDetailPanelProps, GraphDetailModel>;
    private readonly bodyRegion = createContentsHost();
    private readonly bodySwap = new SubtreeSwap<"body">(this.bodyRegion);
    private readonly nodeGate: DepsGate = createDepsGate();
    private readonly tabGate: DepsGate = createDepsGate();
    private readonly selectionGate: DepsGate = createDepsGate();
    private readonly expandGate: DepsGate = createDepsGate();
    private readonly collapseGate: DepsGate = createDepsGate();
    private readonly expandedCallbackGate: DepsGate = createDepsGate();
    private readonly linksGate: DepsGate = createDepsGate();
    private readonly header = document.createElement("div");
    private readonly headerTitle = document.createElement("span");
    private readonly headerChevron = document.createElement("span");
    private activeBody: DetailBodyView | undefined;
    private live = true;

    public constructor(props: GraphDetailPanelProps) {
        super(props, createPanelElement({ direction: "column", minWidth: 0 }));
        this.root.classList.add("graph-detail-panel");
        this.driver = createComponentModelDriver(props, GraphDetailModel, defaultGraphDetailState);
        this.header.className = "graph-detail-header";
        this.headerTitle.className = "graph-detail-title";
        this.headerChevron.className = "graph-detail-chevron";
        this.header.append(this.headerTitle, this.headerChevron);
        this.root.append(this.header, this.bodyRegion);
    }

    protected onMount(): void {
        this.own(() => { this.live = false; });
        this.own(() => this.bodySwap.dispose());
        this.own(() => this.driver.dispose());
        this.listen(this.header, "click", this.toggleExpanded);
        this.driver.mount();
        this.bind(this.driver.model.state, (state) => state, this.syncState);
    }

    protected onUpdate(props: GraphDetailPanelProps): void {
        this.driver.update(props);
        this.syncState(this.driver.model.state.get());
    }

    private readonly syncState = (state: GraphDetailState): void => {
        const nodes = this.props.nodes;
        const singleNode = nodes.length === 1 ? nodes[0] : undefined;
        const anyDirty = state.linksDirty || state.propertiesDirty;
        const headerText = nodes.length > 1 ? `${nodes.length} nodes selected` : singleNode ? nodeLabel(singleNode) : "select node for edit";
        this.headerTitle.textContent = headerText;
        this.headerTitle.title = headerText;
        this.header.dataset.selection = nodes.length > 0 ? "selected" : "none";
        if (anyDirty) this.header.dataset.locked = ""; else delete this.header.dataset.locked;
        this.headerChevron.hidden = nodes.length === 0;
        this.headerChevron.replaceChildren(createIconElement(state.expanded ? "chevron-up" : "chevron-down", { width: 14, height: 14 }));

        this.runNodeGate();
        this.runTabGate(state);
        this.runSelectionGate(nodes);
        this.runExpandGate(nodes);
        this.runCollapseGate();
        this.runExpandedCallbackGate(state.expanded);
        this.runLinksGate(state, singleNode);

        const bodyProps = this.bodyProps(state);
        if (state.expanded && nodes.length > 0) {
            let created: DetailBodyView | undefined;
            this.bodySwap.set("body", () => {
                created = new DetailBodyView(bodyProps);
                this.activeBody = created;
                return created;
            });
            if (created) {
                try { created.mount(); } catch (mountError) {
                    this.activeBody = undefined;
                    try { this.bodySwap.clear(); } catch { /* preserve original mount error */ }
                    throw mountError;
                }
            } else this.activeBody?.update(bodyProps);
        } else {
            this.bodySwap.clear();
            this.activeBody = undefined;
        }
    };

    private runNodeGate(): void {
        const node = this.props.nodes.length === 1 ? this.props.nodes[0] : undefined;
        const id = node?.id;
        const title = node?.title;
        if (!this.nodeGate.changed([id, title]) || !node) return;
        queueMicrotask(() => {
            if (!this.live || !this.driver.model.isLive) return;
            const current = this.props.nodes.length === 1 ? this.props.nodes[0] : undefined;
            if (current?.id !== id || current?.title !== title) return;
            this.driver.model.setEditId(id);
            this.driver.model.setEditTitle(title || "");
            this.driver.model.setIdError("");
        });
    }

    private runTabGate(state: GraphDetailState): void {
        const isMulti = this.props.nodes.length > 1;
        if (!this.tabGate.changed([isMulti, state.activeTab]) || !isMulti || state.activeTab !== "links") return;
        queueMicrotask(() => {
            if (!this.live || !this.driver.model.isLive || this.props.nodes.length <= 1 || this.driver.model.state.get().activeTab !== "links") return;
            this.driver.model.setActiveTab("info");
        });
    }

    private runSelectionGate(nodes: GraphNode[]): void {
        const selectionKey = nodes.map((node) => node.id).sort().join(",");
        const hasSelection = nodes.length > 0;
        if (this.selectionGate.changed([selectionKey, hasSelection])) this.driver.model.applySelectionDependencies(hasSelection, selectionKey, () => this.live && this.driver.model.isLive);
    }

    private runExpandGate(nodes: GraphNode[]): void {
        const request = this.props.expandRequest;
        if (!this.expandGate.changed([request]) || !request || nodes.length === 0) return;
        queueMicrotask(() => {
            if (!this.live || !this.driver.model.isLive || this.props.expandRequest !== request || this.props.nodes.length === 0) return;
            this.driver.model.setExpanded(true);
            this.driver.model.markExpandedByRequest();
        });
    }

    private runCollapseGate(): void {
        const request = this.props.collapseRequest;
        if (!this.collapseGate.changed([request]) || !request) return;
        queueMicrotask(() => {
            if (!this.live || !this.driver.model.isLive || this.props.collapseRequest !== request) return;
            const state = this.driver.model.state.get();
            if (state.expanded && !state.linksDirty && !state.propertiesDirty) {
                this.driver.model.setExpanded(false);
                this.driver.model.markCollapsedByRequest();
            }
        });
    }

    private runExpandedCallbackGate(expanded: boolean): void {
        const callback = this.props.onPanelExpandedChange;
        if (!this.expandedCallbackGate.changed([expanded, callback])) return;
        queueMicrotask(() => {
            if (!this.live || !this.driver.model.isLive || this.driver.model.state.get().expanded !== expanded || this.props.onPanelExpandedChange !== callback) return;
            callback?.(expanded);
        });
    }

    private runLinksGate(state: GraphDetailState, node: GraphNode | undefined): void {
        const linksTabActive = state.expanded && state.activeTab === "links" && !!node;
        const linkedNodes = this.props.linkedNodes;
        const nodeId = node?.id;
        if (!this.linksGate.changed([linksTabActive, nodeId, linkedNodes])) return;
        queueMicrotask(() => {
            if (!this.live || !this.driver.model.isLive) return;
            const currentNode = this.props.nodes.length === 1 ? this.props.nodes[0] : undefined;
            const currentState = this.driver.model.state.get();
            const currentActive = currentState.expanded && currentState.activeTab === "links" && !!currentNode;
            if (currentActive !== linksTabActive || currentNode?.id !== nodeId || this.props.linkedNodes !== linkedNodes) return;
            if (linksTabActive && node) {
                this.props.onExpandNode?.(node.id);
                this.props.onHighlightSet?.(new Set([node.id, ...linkedNodes.map((linked) => linked.id)]));
            } else {
                this.props.onHighlightSet?.(null);
                this.props.onExternalHover?.("");
            }
        });
    }

    private bodyProps(state: GraphDetailState): DetailBodyProps {
        return {
            ...state, nodes: this.props.nodes, linkedNodes: this.props.linkedNodes, containerRef: this.props.containerRef,
            onUpdateProps: this.props.onUpdateProps, onBatchUpdateProps: this.props.onBatchUpdateProps, onRenameNode: this.props.onRenameNode,
            onApplyLinks: this.props.onApplyLinks, onApplyProperties: this.props.onApplyProperties, onBatchApplyProperties: this.props.onBatchApplyProperties,
            onPanelDirtyChange: this.props.onPanelDirtyChange, onExternalHover: this.props.onExternalHover,
            setActiveTab: this.driver.model.setActiveTab, setLinksDirty: this.driver.model.setLinksDirty, setPropertiesDirty: this.driver.model.setPropertiesDirty,
            setSize: this.driver.model.setSize, setEditId: this.driver.model.setEditId, setEditTitle: this.driver.model.setEditTitle,
            setIdError: this.driver.model.setIdError, commitId: this.commitId, commitTitle: this.commitTitle,
        };
    }

    private readonly commitId = (): void => {
        const node = this.props.nodes.length === 1 ? this.props.nodes[0] : undefined;
        if (!node) return;
        const value = this.driver.model.state.get().editId.trim();
        if (value === node.id) { this.driver.model.setIdError(""); return; }
        if (!value) { this.driver.model.setEditId(node.id); this.driver.model.setIdError(""); return; }
        this.driver.model.setIdError(this.props.onRenameNode(node.id, value) ? "" : "ID already exists");
    };

    private readonly commitTitle = (): void => {
        const node = this.props.nodes.length === 1 ? this.props.nodes[0] : undefined;
        if (!node) return;
        const value = this.driver.model.state.get().editTitle.trim();
        if (value !== (node.title || "")) this.props.onUpdateProps(node.id, { title: value || undefined });
    };

    private readonly toggleExpanded = (): void => {
        const state = this.driver.model.state.get();
        this.driver.model.toggleExpanded(this.props.nodes.length > 0, state.linksDirty || state.propertiesDirty);
    };
}

class DetailBodyView extends VanillaView<DetailBodyProps> {
    private readonly tabs = createPanelElement({ direction: "row", shrink: false });
    private readonly contentHost = createPanelElement({ direction: "column", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" });
    private readonly contentSwap = new SubtreeSwap<DetailContentKey>(this.contentHost);
    private readonly resizer = createResizeElement();
    private readonly tabButtons = new Map<string, HTMLButtonElement>();
    private activeContent: VanillaView<unknown> | undefined;
    private resizing = false;
    private resizeStart = { x: 0, y: 0, width: 0, height: 0 };

    public constructor(props: DetailBodyProps) {
        super(props, createPanelElement({ direction: "column", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative", width: props.size.width, height: props.size.height }));
        this.root.classList.add("graph-detail-body");
        this.contentHost.classList.add("graph-detail-content");
        for (const tab of ["info", "properties", "links"]) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "graph-detail-tab";
            button.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
            this.tabButtons.set(tab, button);
            this.tabs.append(button);
        }
        this.resizer.classList.add("graph-detail-resizer");
        this.root.append(this.tabs, this.contentHost, this.resizer);
    }

    protected onMount(): void {
        this.own(() => { this.resizing = false; });
        for (const [tab, button] of this.tabButtons) this.listen(button, "click", () => this.selectTab(tab));
        this.listen(this.resizer, "mousedown", this.handleResizeStart);
        this.listen(document, "mousemove", this.handleMouseMove);
        this.listen(document, "mouseup", this.handleMouseUp);
        this.sync(this.props);
    }

    protected onUpdate(props: DetailBodyProps): void {
        this.root.style.width = `${props.size.width}px`;
        this.root.style.height = `${props.size.height}px`;
        this.sync(props);
    }

    protected onDispose(): void { this.contentSwap.dispose(); this.activeContent = undefined; }

    private sync(props: DetailBodyProps): void {
        const dirty = props.linksDirty || props.propertiesDirty;
        for (const [tab, button] of this.tabButtons) {
            button.hidden = tab === "links" && props.nodes.length !== 1;
            button.disabled = dirty && props.activeTab !== tab;
            if (props.activeTab === tab) button.dataset.active = ""; else delete button.dataset.active;
        }
        this.contentHost.style.overflow = props.activeTab === "info" ? "auto" : "hidden";
        this.contentHost.style.padding = props.activeTab === "info" ? "8px" : "0";
        const key: DetailContentKey = props.activeTab === "info"
            ? props.nodes.length > 1 ? "info-multi" : "info-single"
            : props.activeTab === "properties" ? "properties" : "links";
        let created: VanillaView<unknown> | undefined;
        this.contentSwap.set(key, () => {
            created = this.createContent(key, props);
            this.activeContent = created;
            return created;
        });
        if (created) {
            try { created.mount(); } catch (mountError) {
                this.activeContent = undefined;
                try { this.contentSwap.clear(); } catch { /* preserve original mount error */ }
                throw mountError;
            }
        } else this.activeContent?.update(this.contentProps(props));
    }

    private createContent(key: DetailContentKey, props: DetailBodyProps): VanillaView<unknown> {
        if (key === "info-multi") return new MultiInfoTabView({ nodes: props.nodes, onBatchUpdateProps: props.onBatchUpdateProps });
        if (key === "info-single") return new InfoTabView({
            node: props.nodes[0], editId: props.editId, editTitle: props.editTitle, idError: props.idError,
            setEditId: props.setEditId, setEditTitle: props.setEditTitle, setIdError: props.setIdError,
            commitId: props.commitId, commitTitle: props.commitTitle, onUpdateProps: props.onUpdateProps,
        });
        if (key === "properties") return new PropertiesTabView({ nodes: props.nodes, onApply: props.onApplyProperties, onBatchApply: props.onBatchApplyProperties, onDirtyChange: this.handlePropertiesDirtyChange });
        return new LinksTabView({ linkedNodes: props.linkedNodes, selectedNodeId: props.nodes[0].id, onApply: props.onApplyLinks, onDirtyChange: this.handleLinksDirtyChange, onExternalHover: props.onExternalHover });
    }

    private contentProps(props: DetailBodyProps): unknown {
        if (props.activeTab === "info" && props.nodes.length > 1) return { nodes: props.nodes, onBatchUpdateProps: props.onBatchUpdateProps };
        if (props.activeTab === "info") return { node: props.nodes[0], editId: props.editId, editTitle: props.editTitle, idError: props.idError, setEditId: props.setEditId, setEditTitle: props.setEditTitle, setIdError: props.setIdError, commitId: props.commitId, commitTitle: props.commitTitle, onUpdateProps: props.onUpdateProps };
        if (props.activeTab === "properties") return { nodes: props.nodes, onApply: props.onApplyProperties, onBatchApply: props.onBatchApplyProperties, onDirtyChange: this.handlePropertiesDirtyChange };
        return { linkedNodes: props.linkedNodes, selectedNodeId: props.nodes[0].id, onApply: props.onApplyLinks, onDirtyChange: this.handleLinksDirtyChange, onExternalHover: props.onExternalHover };
    }

    private readonly selectTab = (tab: string): void => { if (!this.props.linksDirty && !this.props.propertiesDirty) this.props.setActiveTab(tab); };
    private readonly handlePropertiesDirtyChange = (dirty: boolean): void => { this.props.setPropertiesDirty(dirty); this.props.onPanelDirtyChange?.(dirty || this.props.linksDirty); };
    private readonly handleLinksDirtyChange = (dirty: boolean): void => { this.props.setLinksDirty(dirty); this.props.onPanelDirtyChange?.(dirty || this.props.propertiesDirty); };

    private readonly handleResizeStart = (event: MouseEvent): void => {
        event.preventDefault(); event.stopPropagation(); this.resizing = true;
        this.resizeStart = { x: event.clientX, y: event.clientY, width: this.props.size.width, height: this.props.size.height };
    };
    private readonly handleMouseMove = (event: MouseEvent): void => {
        if (!this.resizing) return;
        let width = Math.max(MIN_WIDTH, this.resizeStart.width + this.resizeStart.x - event.clientX);
        let height = Math.max(MIN_HEIGHT, this.resizeStart.height + event.clientY - this.resizeStart.y);
        const container = this.props.containerRef?.current;
        if (container) { const rect = container.getBoundingClientRect(); width = Math.min(width, rect.width * MAX_PERCENT); height = Math.min(height, rect.height * MAX_PERCENT); }
        this.props.setSize({ width, height });
    };
    private readonly handleMouseUp = (): void => { this.resizing = false; };
}

interface InfoTabProps {
    node: GraphNode;
    editId: string;
    editTitle: string;
    idError: string;
    setEditId: (value: string) => void;
    setEditTitle: (value: string) => void;
    setIdError: (value: string) => void;
    commitId: () => void;
    commitTitle: () => void;
    onUpdateProps: GraphDetailPanelProps["onUpdateProps"];
}

class InfoTabView extends VanillaView<InfoTabProps> {
    private readonly idError = createTextElement("", { size: "xs", color: color.error.text });
    private readonly levelButtons = new Map<number, HTMLButtonElement>();
    private readonly shapeButtons = new Map<NodeShape, HTMLButtonElement>();
    private readonly idInput: InputView;
    private readonly titleInput: InputView;

    public constructor(props: InfoTabProps) {
        super(props, createPanelElement({ direction: "column", width: "100%", minHeight: 0 }));
        this.root.classList.add("graph-detail-info");
        this.idError.classList.add("graph-detail-error");
        this.idInput = new InputView(this.idProps(props));
        this.titleInput = new InputView(this.titleProps(props));
        this.root.append(createField("ID", [this.idInput.root, this.idError]), createField("Title", [this.titleInput.root]), createField("Level", [this.createIconRow("level")]), createField("Shape", [this.createIconRow("shape")]));
    }

    protected onMount(): void {
        this.child(this.idInput);
        this.child(this.titleInput);
        for (const [level, button] of this.levelButtons) this.listen(button, "click", () => this.props.onUpdateProps(this.props.node.id, { level }));
        for (const [shape, button] of this.shapeButtons) this.listen(button, "click", () => this.props.onUpdateProps(this.props.node.id, { shape: shape === "circle" ? undefined : shape }));
        this.idInput.mount(); this.titleInput.mount(); this.sync(this.props);
    }

    protected onUpdate(props: InfoTabProps): void { this.sync(props); }

    private sync(props: InfoTabProps): void {
        this.idInput.update(this.idProps(props)); this.titleInput.update(this.titleProps(props));
        this.idError.textContent = props.idError; this.idError.hidden = !props.idError;
        for (const [level, button] of this.levelButtons) setIconButtonState(button, (props.node.level ?? 5) === level, false);
        for (const [shape, button] of this.shapeButtons) setIconButtonState(button, (props.node.shape ?? "circle") === shape, false);
    }

    private idProps(props: InfoTabProps): InputProps { return { name: "graph-detail-id", size: "sm", value: props.editId, onChange: props.setEditId, onBlur: props.commitId, onKeyDown: (event) => this.handleKeyDown(event, true) }; }
    private titleProps(props: InfoTabProps): InputProps { return { name: "graph-detail-title", size: "sm", value: props.editTitle, placeholder: props.node.id, onChange: props.setEditTitle, onBlur: props.commitTitle, onKeyDown: (event) => this.handleKeyDown(event, false) }; }
    private handleKeyDown(event: KeyboardEvent, id: boolean): void {
        if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLElement).blur(); }
        else if (event.key === "Escape") { event.preventDefault(); if (id) this.props.setEditId(this.props.node.id); else this.props.setEditTitle(this.props.node.title || ""); this.props.setIdError(""); (event.target as HTMLElement).blur(); }
    }

    private createIconRow(kind: "level" | "shape"): HTMLDivElement {
        const row = document.createElement("div"); row.className = "graph-detail-icon-row";
        if (kind === "level") for (const level of LEVELS) { const button = document.createElement("button"); button.type = "button"; button.title = `Level ${level}`; button.append(createLevelIconElement(level, 16)); this.levelButtons.set(level, button); row.append(button); }
        else for (const shape of SHAPES) { const button = document.createElement("button"); button.type = "button"; button.title = shape; button.append(createShapeIconElement(shape, 16)); this.shapeButtons.set(shape, button); row.append(button); }
        return row;
    }
}

class MultiInfoTabView extends VanillaView<{ nodes: GraphNode[]; onBatchUpdateProps: GraphDetailPanelProps["onBatchUpdateProps"] }> {
    private readonly levelButtons = new Map<number, HTMLButtonElement>();
    private readonly shapeButtons = new Map<NodeShape, HTMLButtonElement>();

    public constructor(props: { nodes: GraphNode[]; onBatchUpdateProps: GraphDetailPanelProps["onBatchUpdateProps"] }) {
        super(props, createPanelElement({ direction: "column", width: "100%", minHeight: 0 })); this.root.classList.add("graph-detail-info");
        this.root.append(createTextElement(`Batch edit level and shape for ${props.nodes.length} selected nodes`, { size: "xs", color: color.warning.text, italic: true }), this.createField("Level", "level"), this.createField("Shape", "shape"));
    }
    protected onMount(): void {
        for (const [level, button] of this.levelButtons) this.listen(button, "click", () => this.props.onBatchUpdateProps(this.props.nodes.map((node) => node.id), { level }));
        for (const [shape, button] of this.shapeButtons) this.listen(button, "click", () => this.props.onBatchUpdateProps(this.props.nodes.map((node) => node.id), { shape: shape === "circle" ? undefined : shape }));
        this.sync(this.props);
    }
    protected onUpdate(props: { nodes: GraphNode[]; onBatchUpdateProps: GraphDetailPanelProps["onBatchUpdateProps"] }): void { this.sync(props); }
    private createField(label: string, kind: "level" | "shape"): HTMLDivElement {
        const field = createPanelElement({ direction: "column", gap: "xs" }); field.append(createTextElement(label, { size: "xs", color: color.text.light }));
        const row = document.createElement("div"); row.className = "graph-detail-icon-row";
        if (kind === "level") for (const level of LEVELS) { const button = document.createElement("button"); button.type = "button"; button.title = `Level ${level}`; button.append(createLevelIconElement(level, 16)); this.levelButtons.set(level, button); row.append(button); }
        else for (const shape of SHAPES) { const button = document.createElement("button"); button.type = "button"; button.title = shape; button.append(createShapeIconElement(shape, 16)); this.shapeButtons.set(shape, button); row.append(button); }
        field.append(row); return field;
    }
    private sync(props: { nodes: GraphNode[] }): void {
        const levels = new Set(props.nodes.map((node) => node.level ?? 5)); const shapes = new Set(props.nodes.map((node) => node.shape ?? "circle"));
        for (const [level, button] of this.levelButtons) setIconButtonState(button, levels.size === 1 && levels.has(level), levels.size > 1 && levels.has(level));
        for (const [shape, button] of this.shapeButtons) setIconButtonState(button, shapes.size === 1 && shapes.has(shape), shapes.size > 1 && shapes.has(shape));
    }
}

type LinkRow = Record<string, unknown> & { id: string; _rowKey: string };
type LinksTabProps = { linkedNodes: GraphNode[]; selectedNodeId: string; onApply: GraphDetailPanelProps["onApplyLinks"]; onDirtyChange: (dirty: boolean) => void; onExternalHover?: GraphDetailPanelProps["onExternalHover"] };
interface LinksTabState { dirty: boolean; }

class LinksTabModel extends TComponentModel<LinksTabState, LinksTabProps> {
    private rowCounter = 0; seedRows: LinkRow[] = []; columns: Column<LinkRow>[] = []; grid: DataGridInstance<LinkRow> | undefined; readonly originalIds = new Set<string>();
    setDirty = (dirty: boolean): void => this.state.update((state) => { state.dirty = dirty; });
    setGrid = (grid: DataGridInstance<LinkRow> | null): void => { this.grid = grid ?? undefined; };
    rowsForGrid = (): readonly LinkRow[] => this.grid?.getRows() ?? this.seedRows;
    nextRowKey = (): string => `link-${++this.rowCounter}`;
    resetRowCounter = (): void => { this.rowCounter = 0; };
}

const KNOWN_KEYS = new Set(["id", "title", "level", "shape"]);
const LINKS_COL_OPTS = { charWidth: 7, padding: 16, minWidth: 50, maxWidth: 200 };
function makeColumns(rows: LinkRow[]): Column<LinkRow>[] {
    const columns: Column<LinkRow>[] = [
        { key: "id", name: "ID", width: detectColumnWidth(rows, "id", "ID", LINKS_COL_OPTS), resizable: true },
        { key: "title", name: "Title", width: detectColumnWidth(rows, "title", "Title", LINKS_COL_OPTS), resizable: true },
        { key: "level", name: "Level", width: 60, resizable: true, options: LEVELS },
        { key: "shape", name: "Shape", width: 70, resizable: true, options: SHAPES },
    ];
    const customKeys = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) if (key !== "_rowKey" && !KNOWN_KEYS.has(key) && !key.startsWith("_$")) customKeys.add(key);
    for (const key of [...customKeys].sort()) columns.push({ key, name: key, width: detectColumnWidth(rows, key, key, LINKS_COL_OPTS), resizable: true });
    return columns;
}

class LinksTabView extends VanillaView<LinksTabProps> {
    private readonly driver: ComponentModelDriver<LinksTabState, LinksTabProps, LinksTabModel>;
    private readonly seedGate: DepsGate = createDepsGate();
    private readonly gridHost = createPanelElement({ direction: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" });
    private readonly actions = createPanelElement({ direction: "row", justify: "end", gap: "xs", shrink: false });
    private readonly cancelButton: ButtonView;
    private readonly applyButton: ButtonView;
    private readonly gridView: DataGridView<LinkRow>;
    private live = true;

    public constructor(props: LinksTabProps) {
        super(props, createPanelElement({ direction: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }));
        this.driver = createComponentModelDriver(props, LinksTabModel, { dirty: false });
        this.cancelButton = new ButtonView({ size: "sm", variant: "ghost", children: "Cancel", onClick: this.handleCancel });
        this.applyButton = new ButtonView({ size: "sm", variant: "primary", children: "Apply", onClick: this.handleApply });
        this.gridView = new DataGridView<LinkRow>(this.gridProps());
        this.actions.append(this.cancelButton.root, this.applyButton.root); this.root.append(this.gridHost, this.actions);
    }
    protected onMount(): void {
        this.own(() => { this.live = false; }); this.own(() => this.driver.dispose());
        this.child(this.cancelButton); this.child(this.applyButton); this.child(this.gridView); this.driver.mount();
        this.bind(this.driver.model.state, (state) => state.dirty, this.applyDirty); this.gridHost.append(this.gridView.root); this.gridView.mount(); this.syncSeed(this.props);
    }
    protected onUpdate(props: LinksTabProps): void { this.driver.update(props); this.syncSeed(props); }
    private readonly applyDirty = (dirty: boolean): void => { this.actions.hidden = !dirty; this.props.onDirtyChange(dirty); };
    private syncSeed(props: LinksTabProps): void {
        const linkedNodes = props.linkedNodes; if (!this.seedGate.changed([linkedNodes])) return;
        queueMicrotask(() => {
            if (!this.live || !this.driver.model.isLive || this.props.linkedNodes !== linkedNodes) return;
            const model = this.driver.model; model.resetRowCounter(); const rows = linkedNodes.map((node) => ({ ...node, _rowKey: model.nextRowKey() }));
            model.seedRows = rows; model.columns = makeColumns(rows); model.originalIds.clear(); linkedNodes.forEach((node) => model.originalIds.add(node.id));
            model.grid?.setRows(rows); model.grid?.setColumns(model.columns); model.setDirty(false); this.props.onDirtyChange(false);
        });
    }
    private gridProps(): DataGridProps<LinkRow> { return { name: "graph-links-grid", columns: this.driver.model.columns, rows: this.driver.model.seedRows, getRowKey: (row) => row._rowKey, onGrid: this.driver.model.setGrid, editable: true, canAddRows: true, canDeleteRows: true, newRow: () => ({ id: "", _rowKey: this.driver.model.nextRowKey() }), onEdit: this.handleEdit, onAddRows: this.handleAddRows, onDeleteRows: this.handleDeleteRows, rowNoun: "link", onFocusChange: this.handleFocusChange, disableFiltering: true, disableSorting: true, rowHeight: 24 }; }
    private readonly markDirty = (): void => this.driver.model.setDirty(true);
    private readonly handleEdit = (_event: CellEditEvent<LinkRow>): void => this.markDirty();
    private readonly handleAddRows = (event: AddRowsEvent<LinkRow>): void => { event.rows.forEach((row) => { row._rowKey = this.driver.model.nextRowKey(); }); this.markDirty(); };
    private readonly handleDeleteRows = (_event: DeleteRowsEvent<LinkRow>): void => this.markDirty();
    private readonly handleFocusChange = (focus: CellFocus<LinkRow> | undefined): void => { const row = focus?.rowKey ? this.driver.model.rowsForGrid().find((item) => item._rowKey === focus.rowKey) : undefined; this.props.onExternalHover?.(row?.id || ""); };
    private readonly handleApply = (): void => { const rows = this.driver.model.rowsForGrid().map(({ _rowKey, ...row }) => row); this.props.onApply(this.props.selectedNodeId, rows, this.driver.model.originalIds); };
    private readonly handleCancel = (): void => { const model = this.driver.model; model.resetRowCounter(); const rows = this.props.linkedNodes.map((node) => ({ ...node, _rowKey: model.nextRowKey() })); model.seedRows = rows; model.columns = makeColumns(rows); model.grid?.setRows(rows); model.grid?.setColumns(model.columns); model.setDirty(false); this.props.onDirtyChange(false); };
}

type PropertyRow = { _rowKey: string; key: string; value: string; _isChanged?: boolean };
type PropertiesTabProps = { nodes: GraphNode[]; onApply: GraphDetailPanelProps["onApplyProperties"]; onBatchApply: GraphDetailPanelProps["onBatchApplyProperties"]; onDirtyChange: (dirty: boolean) => void };
interface PropertiesTabState { dirty: boolean; statusMessage: string; }
function extractCustomProperties(node: GraphNode): { key: string; value: string }[] { return Object.entries(node).filter(([key]) => !isReservedPropertyKey(key)).map(([key, value]) => ({ key, value: value == null ? "" : String(value) })); }
function extractMultiProperties(nodes: GraphNode[]): { key: string; value: string; allSame: boolean; uniqueValues: string[] }[] {
    const keys = new Set<string>(); nodes.forEach((node) => Object.keys(node).forEach((key) => { if (!isReservedPropertyKey(key)) keys.add(key); }));
    return [...keys].sort().map((key) => { const values = nodes.map((node) => (node as unknown as Record<string, unknown>)[key]).filter((value) => value != null).map(String); const uniqueValues = [...new Set(values)]; const allSame = uniqueValues.length === 1 && values.length === nodes.length; return { key, value: allSame ? uniqueValues[0] : "", allSame, uniqueValues }; });
}
const PROPERTY_COLUMNS: Column<PropertyRow>[] = [{ key: "key", name: "Name", width: 120, resizable: true }, { key: "value", name: "Value", width: 200, resizable: true }];
class PropertiesTabModel extends TComponentModel<PropertiesTabState, PropertiesTabProps> {
    private rowCounter = 0; seedRows: PropertyRow[] = []; columns: Column<PropertyRow>[] = PROPERTY_COLUMNS; grid: DataGridInstance<PropertyRow> | undefined; readonly originalKeys = new Set<string>(); readonly multiInfo = new Map<string, { allSame: boolean; uniqueValues: string[] }>();
    setDirty = (dirty: boolean): void => this.state.update((state) => { state.dirty = dirty; }); setStatusMessage = (message: string): void => this.state.update((state) => { state.statusMessage = message; }); setGrid = (grid: DataGridInstance<PropertyRow> | null): void => { this.grid = grid ?? undefined; }; rowsForGrid = (): readonly PropertyRow[] => this.grid?.getRows() ?? this.seedRows; nextRowKey = (): string => `prop-${++this.rowCounter}`; resetRowCounter = (): void => { this.rowCounter = 0; };
}
class PropertiesTabView extends VanillaView<PropertiesTabProps> {
    private readonly driver: ComponentModelDriver<PropertiesTabState, PropertiesTabProps, PropertiesTabModel>;
    private readonly seedGate: DepsGate = createDepsGate(); private readonly gridHost = createPanelElement({ direction: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }); private readonly status = createTextElement("", { size: "xs", color: color.warning.text }); private readonly actions = createPanelElement({ direction: "row", justify: "end", gap: "xs", shrink: false }); private readonly cancelButton: ButtonView; private readonly applyButton: ButtonView; private readonly gridView: DataGridView<PropertyRow>; private live = true;
    public constructor(props: PropertiesTabProps) { super(props, createPanelElement({ direction: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" })); this.driver = createComponentModelDriver(props, PropertiesTabModel, { dirty: false, statusMessage: "" }); this.cancelButton = new ButtonView({ size: "sm", variant: "ghost", children: "Cancel", onClick: this.handleCancel }); this.applyButton = new ButtonView({ size: "sm", variant: "primary", children: "Apply", onClick: this.handleApply }); this.gridView = new DataGridView<PropertyRow>(this.gridProps()); this.status.classList.add("graph-detail-status"); this.actions.append(this.cancelButton.root, this.applyButton.root); this.root.append(this.gridHost, this.status, this.actions); }
    protected onMount(): void { this.own(() => { this.live = false; }); this.own(() => this.driver.dispose()); this.child(this.cancelButton); this.child(this.applyButton); this.child(this.gridView); this.driver.mount(); this.bind(this.driver.model.state, (state) => ({ dirty: state.dirty, statusMessage: state.statusMessage }), this.syncState); this.gridHost.append(this.gridView.root); this.gridView.mount(); this.syncSeed(this.props); }
    protected onUpdate(props: PropertiesTabProps): void { this.driver.update(props); this.syncSeed(props); }
    private readonly syncState = (state: PropertiesTabState): void => { this.actions.hidden = !state.dirty; this.status.textContent = state.statusMessage; this.status.hidden = !state.statusMessage; this.applyButton.update({ size: "sm", variant: "primary", children: "Apply", disabled: this.hasInvalidKeys(), onClick: this.handleApply }); this.props.onDirtyChange(state.dirty); };
    private syncSeed(props: PropertiesTabProps): void { const dependencies = [props.nodes.map((node) => node.id).sort().join(","), props.nodes]; if (!this.seedGate.changed(dependencies)) return; const nodes = props.nodes; queueMicrotask(() => { if (!this.live || !this.driver.model.isLive || this.props.nodes !== nodes) return; const model = this.driver.model; model.resetRowCounter(); model.originalKeys.clear(); model.multiInfo.clear(); const rows: PropertyRow[] = []; if (nodes.length > 1) for (const row of extractMultiProperties(nodes)) { model.multiInfo.set(row.key, { allSame: row.allSame, uniqueValues: row.uniqueValues }); rows.push({ _rowKey: model.nextRowKey(), key: row.key, value: row.value, _isChanged: false }); model.originalKeys.add(row.key); } else if (nodes.length === 1) for (const row of extractCustomProperties(nodes[0])) { rows.push({ _rowKey: model.nextRowKey(), key: row.key, value: row.value, _isChanged: false }); model.originalKeys.add(row.key); } model.seedRows = rows; model.grid?.setRows(rows); model.setDirty(false); model.setStatusMessage(""); this.props.onDirtyChange(false); }); }
    private gridProps(): DataGridProps<PropertyRow> { return { name: "graph-properties-grid", columns: PROPERTY_COLUMNS, rows: this.driver.model.seedRows, getRowKey: (row) => row._rowKey, onGrid: this.driver.model.setGrid, editable: true, canAddRows: true, canDeleteRows: true, newRow: () => ({ _rowKey: this.driver.model.nextRowKey(), key: "", value: "", _isChanged: true }), onEdit: this.handleEdit, onAddRows: this.handleAddRows, onDeleteRows: this.handleDeleteRows, onCellClass: this.cellClass, rowNoun: "property", onFocusChange: this.handleFocusChange, disableFiltering: true, disableSorting: true, rowHeight: 24 }; }
    private readonly markDirty = (): void => this.driver.model.setDirty(true); private readonly handleEdit = (_event: CellEditEvent<PropertyRow>): void => this.markDirty(); private readonly handleAddRows = (event: AddRowsEvent<PropertyRow>): void => { event.rows.forEach((row) => { row._rowKey = this.driver.model.nextRowKey(); row._isChanged = true; }); this.markDirty(); }; private readonly handleDeleteRows = (_event: DeleteRowsEvent<PropertyRow>): void => this.markDirty();
    private readonly handleFocusChange = (focus: CellFocus<PropertyRow> | undefined): void => { if (this.props.nodes.length <= 1 || !focus?.rowKey) { this.driver.model.setStatusMessage(""); return; } const row = this.driver.model.rowsForGrid().find((item) => item._rowKey === focus.rowKey); const info = row?.key ? this.driver.model.multiInfo.get(row.key) : undefined; if (!info) this.driver.model.setStatusMessage(""); else if (info.allSame) this.driver.model.setStatusMessage("All nodes have the same value"); else if (!info.uniqueValues.length) this.driver.model.setStatusMessage("No nodes have this property"); else this.driver.model.setStatusMessage(`Values: ${info.uniqueValues.slice(0, 2).map((value) => `"${value}"`).join(", ")}${info.uniqueValues.length > 2 ? ", ..." : ""}`); };
    private readonly cellClass = (cell: CellContext<PropertyRow>): string => { if (cell.column.key === "key" && cell.row.key && isReservedPropertyKey(cell.row.key)) return "cell-error"; if (cell.column.key === "key" && this.props.nodes.length > 1 && cell.row.key) { const info = this.driver.model.multiInfo.get(cell.row.key); if (info && !info.allSame && !cell.row._isChanged) return "cell-mixed"; } return ""; };
    private hasInvalidKeys(): boolean { return this.driver.model.rowsForGrid().some((row) => Boolean(row.key && isReservedPropertyKey(row.key))); }
    private readonly handleApply = (): void => { const rows = this.driver.model.rowsForGrid() as PropertyRow[]; const propsToSet: Record<string, string> = {}; for (const row of rows) { if (!row._isChanged) continue; const key = row.key.trim(); if (key && !isReservedPropertyKey(key)) propsToSet[key] = row.value; } const currentKeys = new Set(rows.map((row) => row.key.trim()).filter(Boolean)); const keysToRemove = [...this.driver.model.originalKeys].filter((key) => !currentKeys.has(key)); if (this.props.nodes.length > 1) this.props.onBatchApply(this.props.nodes.map((node) => node.id), propsToSet, keysToRemove); else if (this.props.nodes.length === 1) this.props.onApply(this.props.nodes[0].id, propsToSet, keysToRemove); };
    private readonly handleCancel = (): void => { const model = this.driver.model; model.resetRowCounter(); model.originalKeys.clear(); model.multiInfo.clear(); const rows: PropertyRow[] = []; if (this.props.nodes.length > 1) for (const row of extractMultiProperties(this.props.nodes)) { model.multiInfo.set(row.key, { allSame: row.allSame, uniqueValues: row.uniqueValues }); model.originalKeys.add(row.key); rows.push({ _rowKey: model.nextRowKey(), key: row.key, value: row.value, _isChanged: false }); } else if (this.props.nodes.length === 1) for (const row of extractCustomProperties(this.props.nodes[0])) { model.originalKeys.add(row.key); rows.push({ _rowKey: model.nextRowKey(), key: row.key, value: row.value, _isChanged: false }); } model.seedRows = rows; model.grid?.setRows(rows); model.setDirty(false); model.setStatusMessage(""); this.props.onDirtyChange(false); };
}

function createContentsHost(): HTMLSpanElement { const host = document.createElement("span"); host.style.display = "contents"; return host; }
function createResizeElement(): HTMLDivElement { const host = document.createElement("div"); const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("width", "12"); svg.setAttribute("height", "12"); svg.setAttribute("viewBox", "0 0 12 12"); for (const line of [[2, 10, 0, 12], [6, 10, 0, 4], [10, 10, 0, 0]]) { const element = document.createElementNS("http://www.w3.org/2000/svg", "line"); ["x1", "y1", "x2", "y2"].forEach((key, index) => element.setAttribute(key, String(line[index]))); element.setAttribute("stroke", color.text.light); element.setAttribute("stroke-width", "1"); svg.append(element); } host.append(svg); return host; }
function createField(label: string, children: Node[]): HTMLDivElement { const field = createPanelElement({ direction: "column", gap: "xs" }); field.classList.add("graph-detail-field"); field.append(createTextElement(label, { size: "xs", color: color.text.light }), ...children); return field; }
function setIconButtonState(button: HTMLButtonElement, selected: boolean, mixed: boolean): void { button.className = "graph-detail-icon-button"; if (selected) button.dataset.selected = ""; else delete button.dataset.selected; if (mixed) button.dataset.mixed = ""; else delete button.dataset.mixed; }
