import { applyPanelAttributes, createPanelElement, resolvePanelAttributes, type PanelStyleProps } from "../Panel/panel-style";
import { VanillaView } from "../shared/vanilla-view";
import { SplitterView } from "./SplitterView";
import type { SplitterProps } from "./SplitterView";
import type { Story } from "../../editors/storybook/storyTypes";

type SplitterBackground = "default" | "light" | "dark" | "overlay";

interface SplitterDemoViewProps {
    orientation?: "vertical" | "horizontal";
    side?: "before" | "after";
    border?: "before" | "after" | "none";
    background?: SplitterBackground;
    hoverBackground?: SplitterBackground;
    min?: number;
    max?: number;
    disabled?: boolean;
}

class SplitterDemoView extends VanillaView<SplitterDemoViewProps> {
    private size = 200;
    private splitterView: SplitterView | undefined;
    private fixedPanel: HTMLDivElement | undefined;
    private fixedLabel: Text | undefined;
    private currentOrientation: SplitterDemoViewProps["orientation"];
    private currentSide: SplitterDemoViewProps["side"];

    public constructor(props: SplitterDemoViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.currentOrientation = props.orientation;
        this.currentSide = props.side;
    }

    protected onMount(): void {
        this.rebuild(this.props);
    }

    protected onUpdate(props: SplitterDemoViewProps): void {
        if (props.orientation !== this.currentOrientation || props.side !== this.currentSide) {
            this.rebuild(props);
            return;
        }
        this.updateFixedPanel(props);
        this.splitterView?.update(this.splitterProps(props));
    }

    protected onDispose(): void {
        this.splitterView = undefined;
        this.fixedPanel = undefined;
        this.fixedLabel = undefined;
    }

    private rebuild(props: SplitterDemoViewProps): void {
        if (this.splitterView) {
            this.releaseChild(this.splitterView);
            this.splitterView = undefined;
        }
        this.root.replaceChildren();

        const orientation = props.orientation ?? "vertical";
        const side = props.side ?? "before";
        const fixedPanel = createPanelElement(this.fixedPanelProps(orientation));
        const fixedLabel = document.createTextNode("");
        fixedPanel.append(fixedLabel);
        const flexPanel = createPanelElement({ flex: true, padding: "md", background: "dark" }, [
            document.createTextNode("other area"),
        ]);
        const splitterView = this.child(new SplitterView(this.splitterProps(props)));
        const outer = createPanelElement({
            direction: orientation === "vertical" ? "row" : "column",
            width: "100%",
            height: 400,
            background: "default",
        }, side === "before"
            ? [fixedPanel, splitterView.root, flexPanel]
            : [flexPanel, splitterView.root, fixedPanel]);

        this.fixedPanel = fixedPanel;
        this.fixedLabel = fixedLabel;
        this.splitterView = splitterView;
        this.currentOrientation = props.orientation;
        this.currentSide = props.side;
        this.root.append(outer);
        this.updateFixedPanel(props);
        splitterView.mount();
    }

    private fixedPanelProps(orientation: "vertical" | "horizontal"): PanelStyleProps {
        return {
            background: "light",
            padding: "md",
            shrink: false,
            width: orientation === "vertical" ? this.size : undefined,
            height: orientation === "vertical" ? undefined : this.size,
        };
    }

    private updateFixedPanel(props: SplitterDemoViewProps): void {
        if (!this.fixedPanel || !this.fixedLabel) return;
        const orientation = props.orientation ?? "vertical";
        applyPanelAttributes(this.fixedPanel, resolvePanelAttributes(this.fixedPanelProps(orientation)));
        this.fixedLabel.nodeValue = `controlled panel (${this.size}px)`;
    }

    private splitterProps(props: SplitterDemoViewProps): SplitterProps {
        return {
            value: this.size,
            onChange: this.setSize,
            orientation: props.orientation,
            side: props.side,
            border: props.border,
            background: props.background,
            hoverBackground: props.hoverBackground,
            min: props.min,
            max: props.max,
            disabled: props.disabled,
        };
    }

    private readonly setSize = (size: number): void => {
        this.size = size;
        this.updateFixedPanel(this.props);
        this.splitterView?.update(this.splitterProps(this.props));
    };
}

export const splitterStory: Story<SplitterDemoViewProps> = {
    id: "splitter",
    name: "Splitter",
    section: "Layout",
    view: SplitterDemoView,
    props: [
        { name: "orientation", type: "enum", options: ["vertical", "horizontal"], default: "vertical" },
        { name: "side", type: "enum", options: ["before", "after"], default: "before" },
        { name: "border", type: "enum", options: ["before", "after", "none"], default: "after" },
        { name: "background", type: "enum", options: ["default", "light", "dark", "overlay"], default: "default" },
        { name: "hoverBackground", type: "enum", options: ["default", "light", "dark", "overlay"], default: "light" },
        { name: "min", type: "number", default: 80, min: 40, max: 200, step: 10 },
        { name: "max", type: "number", default: 400, min: 200, max: 800, step: 20 },
        { name: "disabled", type: "boolean", default: false },
    ],
};
