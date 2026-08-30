import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../Panel/panel-style";
import { DividerView } from "./DividerView";
import type { DividerProps } from "./DividerView";
import { VanillaView } from "../shared/vanilla-view";
import type { Story } from "../../editors/storybook/storyTypes";

interface DividerDemoViewProps {
    orientation?: DividerProps["orientation"];
}

function getPanelProps(orientation: DividerDemoViewProps["orientation"]): {
    direction: "row" | "column";
    gap: "lg" | "xl";
    align?: "center";
    height?: number;
    width?: number;
    padding: "xl";
} {
    return orientation === "vertical"
        ? { direction: "row", gap: "xl", align: "center", height: 80, padding: "xl" }
        : { direction: "column", gap: "lg", width: 200, padding: "xl" };
}

function createText(text: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.textContent = text;
    return element;
}

class DividerDemoView extends VanillaView<DividerDemoViewProps> {
    private dividerView: DividerView | undefined;
    private currentOrientation: DividerDemoViewProps["orientation"];

    public constructor(props: DividerDemoViewProps) {
        super(props, createPanelElement(getPanelProps(props.orientation)));
        this.currentOrientation = props.orientation;
    }

    protected onMount(): void {
        this.rebuildLayout(this.props.orientation);
    }

    protected onUpdate(props: DividerDemoViewProps): void {
        if (props.orientation !== this.currentOrientation) {
            this.rebuildLayout(props.orientation);
            return;
        }
        this.dividerView?.update({ orientation: props.orientation });
    }

    private rebuildLayout(orientation: DividerDemoViewProps["orientation"]): void {
        this.dividerView && this.releaseChild(this.dividerView);
        this.root.replaceChildren();
        applyPanelAttributes(this.root, resolvePanelAttributes(getPanelProps(orientation)));

        const dividerView = this.child(new DividerView({ orientation }));
        const firstText = orientation === "vertical" ? "Left" : "Above";
        const lastText = orientation === "vertical" ? "Right" : "Below";
        this.root.append(createText(firstText), dividerView.root, createText(lastText));
        dividerView.mount();
        this.dividerView = dividerView;
        this.currentOrientation = orientation;
    }
}

export const dividerStory: Story<DividerDemoViewProps> = {
    id: "divider",
    name: "Divider",
    section: "Bootstrap",
    view: DividerDemoView,
    props: [
        { name: "orientation", type: "enum", options: ["horizontal", "vertical"], default: "horizontal" },
    ],
};
