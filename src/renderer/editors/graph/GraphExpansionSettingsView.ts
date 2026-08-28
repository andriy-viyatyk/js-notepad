import { createComponentModelDriver, type ComponentModelDriver, TComponentModel } from "../../core/state/model";
import color from "../../theme/color";
import type { InputProps } from "../../uikit/Input/InputView";
import { InputView } from "../../uikit/Input/InputView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import type { SelectProps } from "../../uikit/Select/SelectModel";
import { SelectView } from "../../uikit/Select/SelectView";
import type { IListBoxItem } from "../../uikit/ListBox/types";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { nodeLabel, type GraphNode, type GraphOptions } from "./types";
import "../../uikit/Input/Input.css";
import "../../uikit/Select/Select.css";
import "./GraphExpansionSettings.css";

export interface GraphExpansionHost {
    getExpansionOptions(): { rootNode?: string; expandDepth?: number; maxVisible?: number };
    getAllNodes(): GraphNode[];
    setRootNode(nodeId: string | undefined): void;
    updateExpansionOptions(patch: Partial<Pick<GraphOptions, "expandDepth" | "maxVisible">>): void;
}

export interface GraphExpansionSettingsProps {
    editor: GraphExpansionHost;
}

const AUTO_ROOT = "__auto__";

interface GraphExpansionState {
    rootNode: string;
    expandDepthStr: string;
    maxVisibleStr: string;
}

class GraphExpansionModel extends TComponentModel<GraphExpansionState, GraphExpansionSettingsProps> {
    setRootNode = (rootNode: string): void => {
        this.state.update((state) => { state.rootNode = rootNode; });
    };

    setExpandDepthStr = (expandDepthStr: string): void => {
        this.state.update((state) => { state.expandDepthStr = expandDepthStr; });
    };

    setMaxVisibleStr = (maxVisibleStr: string): void => {
        this.state.update((state) => { state.maxVisibleStr = maxVisibleStr; });
    };
}

function initialState(editor: GraphExpansionHost): GraphExpansionState {
    const opts = editor.getExpansionOptions();
    return {
        rootNode: opts.rootNode ?? "",
        expandDepthStr: opts.expandDepth !== undefined ? String(opts.expandDepth) : "",
        maxVisibleStr: opts.maxVisible !== undefined ? String(opts.maxVisible) : "",
    };
}

export class GraphExpansionSettingsView extends VanillaView<GraphExpansionSettingsProps> {
    private readonly driver: ComponentModelDriver<GraphExpansionState, GraphExpansionSettingsProps, GraphExpansionModel>;
    private readonly editor: GraphExpansionHost;
    private readonly items: IListBoxItem[];
    private select: SelectView<IListBoxItem> | undefined;
    private depthInput: InputView | undefined;
    private maxInput: InputView | undefined;

    public constructor(props: GraphExpansionSettingsProps) {
        super(props, createPanelElement({
            name: "graph-expansion-settings",
            direction: "column",
            gap: "md",
            paddingX: "md",
            paddingY: "sm",
        }));
        this.root.classList.add("graph-expansion-settings");
        this.editor = props.editor;
        this.driver = createComponentModelDriver(props, GraphExpansionModel, initialState(this.editor));
        this.items = this.createItems(this.editor);
    }

    private get model(): GraphExpansionModel {
        return this.driver.model;
    }

    protected onMount(): void {
        this.own(() => this.driver.dispose());
        const select = this.child(new SelectView<IListBoxItem>(this.selectProps()));
        const depthInput = this.child(new InputView(this.depthProps()));
        const maxInput = this.child(new InputView(this.maxProps()));
        this.select = select;
        this.depthInput = depthInput;
        this.maxInput = maxInput;

        const rootLabel = createTextElement("Root Node", { color: color.graph.labelText });
        const depthLabel = createTextElement("Expand Depth", { color: color.graph.labelText });
        const maxLabel = createTextElement("Max Visible", { color: color.graph.labelText });
        rootLabel.classList.add("graph-expansion-label");
        depthLabel.classList.add("graph-expansion-label");
        maxLabel.classList.add("graph-expansion-label");

        this.root.append(
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [rootLabel, select.root]),
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [depthLabel, depthInput.root]),
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [maxLabel, maxInput.root]),
            createTextElement("Depth and max visible apply when file is reopened", {
                color: color.warning.text,
                size: "xs",
                italic: true,
            }),
        );

        this.driver.mount();
        select.mount();
        depthInput.mount();
        maxInput.mount();
        this.bind(this.model.state, (state) => state, this.syncState);
    }

    protected onUpdate(props: GraphExpansionSettingsProps): void {
        if (props.editor !== this.editor) {
            throw new Error("Graph expansion settings received a different editor instance.");
        }
        this.driver.update(props);
    }

    private createItems(editor: GraphExpansionHost): IListBoxItem[] {
        const nodes = editor.getAllNodes();
        const sorted = [...nodes].sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b)));
        return [
            { value: AUTO_ROOT, label: "(auto — lowest level)" },
            ...sorted.map((node) => ({ value: node.id, label: nodeLabel(node) })),
        ];
    }

    private readonly syncState = (_state: GraphExpansionState): void => {
        this.select?.update(this.selectProps());
        this.depthInput?.update(this.depthProps());
        this.maxInput?.update(this.maxProps());
    };

    private selectProps(): SelectProps<IListBoxItem> {
        const selectedValue = this.model.state.get().rootNode || AUTO_ROOT;
        return {
            name: "graph-expansion-root",
            size: "sm",
            items: this.items,
            value: this.items.find((item) => item.value === selectedValue) ?? null,
            onChange: this.onRootChange,
            filterMode: "contains",
        };
    }

    private depthProps(): InputProps {
        return {
            name: "graph-expansion-depth",
            size: "sm",
            placeholder: "∞ (unlimited)",
            value: this.model.state.get().expandDepthStr,
            onChange: this.model.setExpandDepthStr,
            onBlur: this.commitExpandDepth,
            onKeyDown: this.onDepthKeyDown,
        };
    }

    private maxProps(): InputProps {
        return {
            name: "graph-expansion-max",
            size: "sm",
            placeholder: "500 (default)",
            value: this.model.state.get().maxVisibleStr,
            onChange: this.model.setMaxVisibleStr,
            onBlur: this.commitMaxVisible,
            onKeyDown: this.onMaxKeyDown,
        };
    }

    private readonly onRootChange = (item: IListBoxItem): void => {
        const value = String(item.value);
        const nodeId = value === AUTO_ROOT ? undefined : value;
        this.model.setRootNode(nodeId ?? "");
        this.editor.setRootNode(nodeId);
    };

    private readonly commitExpandDepth = (): void => {
        const trimmed = this.model.state.get().expandDepthStr.trim();
        const opts = this.editor.getExpansionOptions();
        if (!trimmed) {
            this.editor.updateExpansionOptions({ expandDepth: undefined });
        } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 1) {
                this.model.setExpandDepthStr(String(num));
                this.editor.updateExpansionOptions({ expandDepth: num });
            } else {
                this.model.setExpandDepthStr(opts.expandDepth !== undefined ? String(opts.expandDepth) : "");
            }
        }
    };

    private readonly commitMaxVisible = (): void => {
        const trimmed = this.model.state.get().maxVisibleStr.trim();
        const opts = this.editor.getExpansionOptions();
        if (!trimmed) {
            this.editor.updateExpansionOptions({ maxVisible: undefined });
        } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 10) {
                this.model.setMaxVisibleStr(String(num));
                this.editor.updateExpansionOptions({ maxVisible: num });
            } else {
                this.model.setMaxVisibleStr(opts.maxVisible !== undefined ? String(opts.maxVisible) : "");
            }
        }
    };

    private readonly onDepthKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Enter") {
            this.commitExpandDepth();
            (event.target as HTMLInputElement).blur();
        }
    };

    private readonly onMaxKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Enter") {
            this.commitMaxVisible();
            (event.target as HTMLInputElement).blur();
        }
    };
}
