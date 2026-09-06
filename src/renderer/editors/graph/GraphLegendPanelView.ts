import { createComponentModelDriver, type ComponentModelDriver, TComponentModel } from "../../core/state/model";
import type { Delayer } from "../../core/utils/scheduling";
import type { ButtonProps } from "../../uikit/Button/ButtonView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { InputProps } from "../../uikit/Input/InputView";
import { InputView } from "../../uikit/Input/InputView";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { GraphEditor } from "./GraphEditor";
import { createLevelIconElement, createShapeIconElement } from "./GraphIcons";
import type { NodeShape } from "./types";
import "../../uikit/Button/Button.css";
import "../../uikit/Input/Input.css";
import "./GraphLegendPanel.css";

const ALL_SHAPES: NodeShape[] = ["circle", "square", "diamond", "triangle", "star", "hexagon"];
const ALL_LEVELS = [1, 2, 3, 4, 5];
type LegendTab = "level" | "shape" | "selection";
const LEGEND_TAB_NAMES: Record<"selection" | "level" | "shape", string> = {
    selection: "graph-legend-tab-selection",
    level: "graph-legend-tab-level",
    shape: "graph-legend-tab-shape",
};
type SelectionFilter = "" | "selected" | "not-selected" | "selected-with-children";

export interface GraphLegendPanelProps {
    editor: GraphEditor;
}

interface GraphLegendState {
    expanded: boolean;
    activeTab: LegendTab;
    checkedLevels: string[];
    checkedShapes: string[];
    selectionFilter: SelectionFilter;
    descriptions: Record<string, Record<string, string>>;
}

interface LegendHighlightSignature {
    selectedKey: string;
    expanded: boolean;
    activeTab: LegendTab;
    selectionFilter: SelectionFilter;
    checkedLevels: string[];
    checkedShapes: string[];
}

const defaultGraphLegendState: GraphLegendState = {
    expanded: false,
    activeTab: "selection",
    checkedLevels: [],
    checkedShapes: [],
    selectionFilter: "selected-with-children",
    descriptions: { levels: {}, shapes: {} },
};

class GraphLegendModel extends TComponentModel<GraphLegendState, GraphLegendPanelProps> {
    private readonly descriptionDelayers = new Map<string, Delayer<void>>();

    setExpanded = (expanded: boolean): void => this.state.update((s) => { s.expanded = expanded; });
    setActiveTab = (activeTab: LegendTab): void => this.state.update((s) => { s.activeTab = activeTab; });
    setSelectionFilter = (selectionFilter: SelectionFilter): void => this.state.update((s) => { s.selectionFilter = selectionFilter; });
    toggleCheck = (tab: LegendTab, key: string): void => this.state.update((s) => {
        if (tab !== "level" && tab !== "shape") return;
        const values = tab === "level" ? s.checkedLevels : s.checkedShapes;
        const next = values.includes(key) ? values.filter((value) => value !== key) : [...values, key];
        if (tab === "level") s.checkedLevels = next;
        else s.checkedShapes = next;
    });
    setDescriptions = (descriptions: Record<string, Record<string, string>>): void => this.state.update((s) => { s.descriptions = descriptions; });
    updateDescription = (tab: "levels" | "shapes", key: string, value: string): void => this.state.update((s) => {
        const other = tab === "levels" ? "shapes" : "levels";
        s.descriptions = {
            ...s.descriptions,
            [tab]: { ...s.descriptions[tab], [key]: value },
            ...(key === "root" ? { [other]: { ...s.descriptions[other], root: value } } : {}),
        };
    });

    scheduleDescription = (tab: "levels" | "shapes", key: string, value: string): void => {
        this.updateDescription(tab, key, value);
        const timerKey = `${tab}:${key}`;
        let delayer = this.descriptionDelayers.get(timerKey);
        if (!delayer) {
            delayer = this.schedule.delayer<void>(300);
            this.descriptionDelayers.set(timerKey, delayer);
        }
        void delayer.trigger(() => {
            if (this.isLive) this.props.editor.setLegendDescription(tab, key, value);
        }).catch(() => { /* disposal/cancellation is intentional */ });
    };

    dispose = (): void => {
        this.descriptionDelayers.clear();
    };

    init(): void {
        // Model initialization is synchronous; Persephone has no render/commit phase between
        // this seed and the view bindings that consume it.
        const legend = this.props.editor.getLegendDescriptions();
        this.setDescriptions({ levels: { ...legend.levels }, shapes: { ...legend.shapes } });
    }
}

interface LegendRowProps {
    key: string;
    label: string;
    createIcon: () => SVGSVGElement;
    checked: boolean;
    description: string;
    onToggle: () => void;
    onDescriptionChange: (value: string) => void;
}

class LegendRowView extends VanillaView<LegendRowProps> {
    private readonly checkbox = document.createElement("input");
    private readonly iconHost = document.createElement("span");
    private readonly label = document.createElement("span");
    private readonly input: InputView;

    public constructor(props: LegendRowProps) {
        super(props, document.createElement("div"));
        this.root.className = "graph-legend-row";
        this.checkbox.className = "graph-legend-checkbox";
        this.checkbox.type = "checkbox";
        this.iconHost.className = "graph-legend-icon";
        this.iconHost.append(props.createIcon());
        this.label.className = "graph-legend-label";
        this.input = new InputView(this.inputProps());
        const description = document.createElement("div");
        description.className = "graph-legend-description";
        description.append(this.input.root);
        this.root.append(this.checkbox, this.iconHost, this.label, description);
    }

    protected onMount(): void {
        this.child(this.input);
        this.listen(this.checkbox, "change", this.handleToggle);
        this.applyProps(this.props);
        this.input.mount();
    }

    protected onUpdate(props: LegendRowProps): void {
        this.applyProps(props);
        this.input.update(this.inputProps());
    }

    private applyProps(props: LegendRowProps): void {
        this.checkbox.checked = props.checked;
        this.label.textContent = props.label;
    }

    private inputProps(): InputProps {
        return {
            size: "sm",
            variant: "ghost",
            placeholder: "Description...",
            value: this.props.description,
            onChange: this.props.onDescriptionChange,
        };
    }

    private readonly handleToggle = (): void => {
        this.props.onToggle();
    };
}

interface SelectionRadioRowProps {
    key: string;
    label: string;
    checked: boolean;
    onToggle: () => void;
}

class SelectionRadioRowView extends VanillaView<SelectionRadioRowProps> {
    private readonly radio = document.createElement("input");
    private readonly label = document.createElement("span");

    public constructor(props: SelectionRadioRowProps) {
        super(props, document.createElement("div"));
        this.root.className = "graph-legend-row";
        this.radio.className = "graph-legend-checkbox";
        this.radio.type = "radio";
        this.label.className = "graph-legend-label";
        this.root.append(this.radio, this.label);
    }

    protected onMount(): void {
        this.listen(this.radio, "change", this.handleToggle);
        this.applyProps(this.props);
    }

    protected onUpdate(props: SelectionRadioRowProps): void {
        this.applyProps(props);
    }

    private applyProps(props: SelectionRadioRowProps): void {
        this.radio.checked = props.checked;
        this.label.textContent = props.label;
    }

    private readonly handleToggle = (): void => {
        this.props.onToggle();
    };
}

type LegendItem = LegendRowProps | SelectionRadioRowProps;

class LegendTabView extends VanillaView<{ tab: LegendTab; items: readonly LegendItem[] }> {
    private readonly rows = new Map<HTMLElement, {
        update(item: LegendItem): void;
        dispose(): void;
    }>();
    private readonly list: KeyedList<LegendItem, string, HTMLElement>;

    public constructor(props: { tab: LegendTab; items: readonly LegendItem[] }) {
        super(props, document.createElement("div"));
        this.root.className = "graph-legend-content";
        this.list = new KeyedList(this.root, {
            keyOf: (item) => item.key,
            create: (item) => {
                const row = this.props.tab === "selection"
                    ? new SelectionRadioRowView(item as SelectionRadioRowProps)
                    : new LegendRowView(item as LegendRowProps);
                this.rows.set(row.root, row as unknown as {
                    update(item: LegendItem): void;
                    dispose(): void;
                });
                row.mount();
                return row.root;
            },
            update: (element, item) => this.rows.get(element)?.update(item),
            remove: (element) => {
                this.rows.get(element)?.dispose();
                this.rows.delete(element);
            },
        });
    }

    protected onMount(): void {
        this.list.update(this.props.items);
    }

    protected onUpdate(props: { tab: LegendTab; items: readonly LegendItem[] }): void {
        this.list.update(props.items);
    }

    protected onDispose(): void {
        this.list.dispose();
        this.rows.clear();
    }
}

interface LegendNormalProps {
    activeTab: LegendTab;
    items: readonly LegendItem[];
    onTabChange: (tab: LegendTab) => void;
}

class LegendNormalView extends VanillaView<LegendNormalProps> {
    private readonly contentHost = document.createElement("div");
    private readonly contentSwap = new SubtreeSwap<LegendTab>(this.contentHost);
    private readonly tabButtons = new Map<LegendTab, HTMLButtonElement>();
    private activeContent: LegendTabView | undefined;

    public constructor(props: LegendNormalProps) {
        super(props, document.createElement("div"));
        this.root.className = "graph-legend-normal";
        const tabs = document.createElement("div");
        tabs.className = "graph-legend-tabs";
        for (const tab of ["selection", "level", "shape"] as const) {
            const button = document.createElement("button");
            button.className = "graph-legend-tab";
            button.type = "button";
            button.dataset.name = LEGEND_TAB_NAMES[tab];
            button.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
            this.tabButtons.set(tab, button);
            tabs.append(button);
        }
        this.contentHost.className = "graph-legend-content-host";
        this.root.append(tabs, this.contentHost);
    }

    protected onMount(): void {
        for (const [tab, button] of this.tabButtons) {
            this.listen(button, "click", () => this.props.onTabChange(tab));
        }
        this.sync(this.props);
    }

    protected onUpdate(props: LegendNormalProps): void {
        this.sync(props);
    }

    protected onDispose(): void {
        this.contentSwap.dispose();
        this.activeContent = undefined;
    }

    private sync(props: LegendNormalProps): void {
        for (const [tab, button] of this.tabButtons) {
            if (tab === props.activeTab) button.dataset.active = "";
            else delete button.dataset.active;
        }
        let created: LegendTabView | undefined;
        this.contentSwap.set(props.activeTab, (tab) => {
            const view = new LegendTabView({ tab, items: props.items });
            this.activeContent = view;
            created = view;
            return view;
        });
        if (created) {
            try {
                created.mount();
            } catch (mountError) {
                try {
                    this.contentSwap.clear();
                } catch {
                    // Preserve the original mount failure after cleanup.
                }
                this.activeContent = undefined;
                throw mountError;
            }
        } else {
            this.activeContent?.update({ tab: props.activeTab, items: props.items });
        }
    }
}

class LegendSearchNoticeView extends VanillaView<{ editor: GraphEditor }> {
    private readonly clearButton: ButtonView;

    public constructor(props: { editor: GraphEditor }) {
        super(props, document.createElement("div"));
        this.root.className = "graph-legend-search-notice";
        const message = document.createElement("span");
        message.textContent = "Search highlighting is active";
        this.clearButton = new ButtonView(this.buttonProps());
        this.root.append(message, this.clearButton.root);
    }

    protected onMount(): void {
        this.child(this.clearButton);
        this.clearButton.mount();
    }

    protected onUpdate(props: { editor: GraphEditor }): void {
        this.clearButton.update(this.buttonProps(props));
    }

    private buttonProps(props = this.props): ButtonProps {
        return {
            size: "sm",
            variant: "ghost",
            onClick: () => props.editor.setSearchQuery(""),
            children: "Clear search",
        };
    }
}

interface LegendExpandedProps {
    editor: GraphEditor;
    searchQuery: string;
    activeTab: LegendTab;
    items: readonly LegendItem[];
    onTabChange: (tab: LegendTab) => void;
}

class LegendExpandedView extends VanillaView<LegendExpandedProps> {
    private readonly branchHost = document.createElement("div");
    private readonly branchSwap = new SubtreeSwap<"search" | "normal">(this.branchHost);
    private activeBranch: LegendSearchNoticeView | LegendNormalView | undefined;

    public constructor(props: LegendExpandedProps) {
        super(props, document.createElement("div"));
        this.root.className = "graph-legend-expanded";
        this.branchHost.className = "graph-legend-branch";
        this.root.append(this.branchHost);
    }

    protected onMount(): void {
        this.sync(this.props);
    }

    protected onUpdate(props: LegendExpandedProps): void {
        this.sync(props);
    }

    protected onDispose(): void {
        this.branchSwap.dispose();
        this.activeBranch = undefined;
    }

    private sync(props: LegendExpandedProps): void {
        const key = props.searchQuery ? "search" : "normal";
        let created: LegendSearchNoticeView | LegendNormalView | undefined;
        this.branchSwap.set(key, (branch) => {
            const view = branch === "search"
                ? new LegendSearchNoticeView({ editor: props.editor })
                : new LegendNormalView({
                    activeTab: props.activeTab,
                    items: props.items,
                    onTabChange: props.onTabChange,
                });
            this.activeBranch = view;
            created = view;
            return view;
        });
        if (created) {
            try {
                created.mount();
            } catch (mountError) {
                try {
                    this.branchSwap.clear();
                } catch {
                    // Preserve the original mount failure after cleanup.
                }
                this.activeBranch = undefined;
                throw mountError;
            }
        } else if (key === "search") {
            (this.activeBranch as LegendSearchNoticeView | undefined)?.update({ editor: props.editor });
        } else {
            (this.activeBranch as LegendNormalView | undefined)?.update({
                activeTab: props.activeTab,
                items: props.items,
                onTabChange: props.onTabChange,
            });
        }
    }
}

export class GraphLegendPanelView extends VanillaView<GraphLegendPanelProps> {
    private readonly driver: ComponentModelDriver<GraphLegendState, GraphLegendPanelProps, GraphLegendModel>;
    private readonly editor: GraphEditor;
    private readonly header = document.createElement("div");
    private readonly chevron = document.createElement("span");
    private readonly bodyHost = document.createElement("div");
    private readonly expandedSwap = new SubtreeSwap<"expanded">(this.bodyHost);
    private appliedHighlight: LegendHighlightSignature | undefined;
    private expandedView: LegendExpandedView | undefined;

    public constructor(props: GraphLegendPanelProps) {
        super(props, document.createElement("div"));
        this.editor = props.editor;
        this.root.className = "graph-legend";
        this.header.className = "graph-legend-header";
        this.root.dataset.name = "graph-legend-panel";
        this.header.dataset.name = "graph-legend-toggle";
        const title = document.createElement("span");
        title.className = "graph-legend-title";
        title.textContent = "Legend";
        this.chevron.className = "graph-legend-chevron";
        this.header.append(title, this.chevron);
        this.bodyHost.className = "graph-legend-body";
        this.root.append(this.header, this.bodyHost);
        this.driver = createComponentModelDriver(props, GraphLegendModel, defaultGraphLegendState);
    }

    private get model(): GraphLegendModel {
        return this.driver.model;
    }

    protected onMount(): void {
        this.own(() => this.driver.dispose());
        this.driver.mount();
        this.listen(this.header, "click", this.toggleExpanded);
        this.listen(this.root, "mouseenter", () => {
            this.root.dataset.hovered = "";
        });
        this.listen(this.root, "mouseleave", () => {
            delete this.root.dataset.hovered;
        });
        this.listen(this.root, "focusin", () => {
            this.root.dataset.focusWithin = "";
        });
        this.listen(this.root, "focusout", this.handleFocusOut);
        this.editor.onHighlightSelection = this.handleHighlightSelection;
        this.own(() => {
            if (this.editor.onHighlightSelection === this.handleHighlightSelection) {
                this.editor.onHighlightSelection = null;
            }
        });

        this.bind(this.model.state, (state) => state, this.syncModelState);
        this.bind(this.editor.state, (state) => ({
            selectedKey: state.selectedNodes.map((node) => node.id).join(","),
            searchQuery: state.searchQuery,
        }), this.syncEditorState);
    }

    protected onUpdate(props: GraphLegendPanelProps): void {
        if (props.editor !== this.editor) {
            throw new Error("Graph legend received a different editor instance.");
        }
        this.driver.update(props);
    }

    protected onDispose(): void {
        this.expandedSwap.dispose();
    }

    private readonly toggleExpanded = (): void => {
        this.model.setExpanded(!this.model.state.get().expanded);
    };

    private readonly handleHighlightSelection = (): void => {
        this.model.setExpanded(true);
        this.model.setActiveTab("selection");
        this.model.setSelectionFilter("selected");
    };

    private readonly handleFocusOut = (event: FocusEvent): void => {
        const relatedTarget = event.relatedTarget;
        if (!(relatedTarget instanceof Node) || !this.root.contains(relatedTarget)) {
            delete this.root.dataset.focusWithin;
        }
    };

    private readonly syncModelState = (state: GraphLegendState): void => {
        if (state.expanded) this.root.dataset.expanded = "";
        else delete this.root.dataset.expanded;
        this.chevron.textContent = state.expanded ? "▼" : "▲";

        const editorState = this.editor.state.get();
        const props = this.expandedProps(state, editorState.searchQuery);
        let created: LegendExpandedView | undefined;
        this.expandedSwap.set(state.expanded ? "expanded" : null, () => {
            const view = new LegendExpandedView(props);
            this.expandedView = view;
            created = view;
            return view;
        });
        if (created) {
            try {
                created.mount();
            } catch (mountError) {
                try {
                    this.expandedSwap.clear();
                } catch {
                    // Preserve the original mount failure after cleanup.
                }
                this.expandedView = undefined;
                throw mountError;
            }
        } else {
            this.expandedView?.update(props);
        }
        this.applyLegendHighlightIfChanged(state, editorState.selectedNodes.map((node) => node.id).join(","));
    };

    private readonly syncEditorState = (state: { selectedKey: string; searchQuery: string }): void => {
        const modelState = this.model.state.get();
        const editorState = this.editor.state.get();
        const props = this.expandedProps(modelState, editorState.searchQuery);
        this.expandedView?.update(props);
        this.applyLegendHighlightIfChanged(modelState, state.selectedKey);
    };

    private expandedProps(state: GraphLegendState, searchQuery: string): LegendExpandedProps {
        return {
            editor: this.editor,
            searchQuery,
            activeTab: state.activeTab,
            items: this.itemsForTab(state),
            onTabChange: this.model.setActiveTab,
        };
    }

    private itemsForTab(state: GraphLegendState): readonly LegendItem[] {
        const { hasRoot, hasGroup } = this.editor.getPresentLevelsAndShapes();
        if (state.activeTab === "selection") {
            return [
                { key: "selected", label: "Selected", checked: state.selectionFilter === "selected", onToggle: () => this.toggleSelection("selected") },
                { key: "selected-with-children", label: "Selected with children", checked: state.selectionFilter === "selected-with-children", onToggle: () => this.toggleSelection("selected-with-children") },
                { key: "not-selected", label: "Not selected", checked: state.selectionFilter === "not-selected", onToggle: () => this.toggleSelection("not-selected") },
            ];
        }

        const keys: Array<{ key: string; label: string; createIcon: () => SVGSVGElement }> = [];
        if (hasRoot) keys.push({
            key: "root",
            label: "Root",
            createIcon: state.activeTab === "level" ? () => createLevelIconElement("root", 14) : () => createShapeIconElement("root", 14),
        });
        if (hasGroup) keys.push({
            key: "group",
            label: "Group",
            createIcon: () => createShapeIconElement("group", 14),
        });
        if (state.activeTab === "level") {
            keys.push(...ALL_LEVELS.map((level) => ({
                key: String(level),
                label: `Level ${level}`,
                createIcon: () => createLevelIconElement(level, 14),
            })));
        } else {
            keys.push(...ALL_SHAPES.map((shape) => ({
                key: shape,
                label: shape.charAt(0).toUpperCase() + shape.slice(1),
                createIcon: () => createShapeIconElement(shape, 14),
            })));
        }

        const checked = state.activeTab === "level" ? state.checkedLevels : state.checkedShapes;
        const descriptions = state.activeTab === "level" ? state.descriptions.levels : state.descriptions.shapes;
        return keys.map((item) => ({
            ...item,
            checked: checked.includes(item.key),
            description: descriptions?.[item.key] ?? "",
            onToggle: () => this.model.toggleCheck(state.activeTab, item.key),
            onDescriptionChange: (value: string) => this.model.scheduleDescription(state.activeTab === "level" ? "levels" : "shapes", item.key, value),
        }));
    }

    private readonly toggleSelection = (filter: Exclude<SelectionFilter, "">): void => {
        const current = this.model.state.get().selectionFilter;
        this.model.setSelectionFilter(current === filter ? "" : filter);
    };

    private applyLegendHighlightIfChanged(state: GraphLegendState, selectedKey: string): void {
        const signature: LegendHighlightSignature = {
            selectedKey,
            expanded: state.expanded,
            activeTab: state.activeTab,
            selectionFilter: state.selectionFilter,
            checkedLevels: state.checkedLevels,
            checkedShapes: state.checkedShapes,
        };
        const previous = this.appliedHighlight;
        if (previous
            && previous.selectedKey === signature.selectedKey
            && previous.expanded === signature.expanded
            && previous.activeTab === signature.activeTab
            && previous.selectionFilter === signature.selectionFilter
            && previous.checkedLevels === signature.checkedLevels
            && previous.checkedShapes === signature.checkedShapes) return;

        // VanillaView prop pumping is synchronous and has no render/commit phase. The expanded
        // subtree is already updated above, and setLegendHighlight/renderData do not write editor
        // state, so this ordered consequence cannot re-enter the legend binding.
        this.appliedHighlight = signature;
        this.applyLegendHighlight(this.editor, signature.expanded, signature.activeTab, signature.selectionFilter, signature.checkedLevels, signature.checkedShapes);
    }

    private applyLegendHighlight(
        editor: GraphEditor,
        expanded: boolean,
        activeTab: LegendTab,
        selectionFilter: SelectionFilter,
        checkedLevels: string[],
        checkedShapes: string[],
    ): void {
        if (!expanded) {
            editor.setLegendHighlight(null);
            return;
        }

        if (activeTab === "selection") {
            if (!selectionFilter) {
                editor.setLegendHighlight(null);
                return;
            }
            const selectedIds = editor.renderer.selectedIds;
            if (selectedIds.size === 0) {
                editor.setLegendHighlight(null);
                return;
            }
            if (selectionFilter === "selected") {
                editor.setLegendHighlight(new Set(selectedIds));
            } else if (selectionFilter === "selected-with-children") {
                const ids = new Set(selectedIds);
                const cm = editor.connectivityModel;
                for (const nodeId of selectedIds) {
                    for (const id of cm.getProcessedNeighborIds(nodeId)) ids.add(id);
                    for (const id of cm.getRealNeighborIds(nodeId)) ids.add(id);
                }
                editor.setLegendHighlight(ids);
            } else {
                const allIds = new Set(editor.renderer.getNodes().map((node) => node.id));
                for (const id of selectedIds) allIds.delete(id);
                editor.setLegendHighlight(allIds.size > 0 ? allIds : new Set());
            }
            return;
        }

        const checked = activeTab === "level" ? checkedLevels : checkedShapes;
        if (checked.length === 0) {
            editor.setLegendHighlight(null);
            return;
        }

        let includeRoot = false;
        let includeGroup = false;
        if (activeTab === "level") {
            const levels = new Set<number>();
            for (const key of checked) {
                if (key === "root") includeRoot = true;
                else if (key === "group") includeGroup = true;
                else levels.add(Number(key));
            }
            const ids = editor.getNodeIdsByLegendFilter({ levels: levels.size > 0 ? levels : undefined, includeRoot, includeGroup });
            editor.setLegendHighlight(ids.size > 0 ? ids : new Set());
        } else {
            const shapes = new Set<string>();
            for (const key of checked) {
                if (key === "root") includeRoot = true;
                else if (key === "group") includeGroup = true;
                else shapes.add(key);
            }
            const ids = editor.getNodeIdsByLegendFilter({ shapes: shapes.size > 0 ? shapes : undefined, includeRoot, includeGroup });
            editor.setLegendHighlight(ids.size > 0 ? ids : new Set());
        }
    }
}
