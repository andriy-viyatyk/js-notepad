import { VanillaView } from "../shared/vanilla-view";
import { SegmentedControlView } from "./SegmentedControlView";
import type { ISegment, SegmentedControlProps } from "./SegmentedControl";
import "./SegmentedControl.css";
import type { Story } from "../../editors/storybook/storyTypes";

const DEMO_ITEMS: ISegment[] = [
    { value: "json", label: "JSON" },
    { value: "grid", label: "Grid" },
    { value: "log", label: "Log View" },
];

interface SegmentedControlDemoViewProps {
    initialValue?: string;
    size?: "sm" | "md";
    background?: "default" | "light" | "dark";
    disabled?: boolean;
}

class SegmentedControlDemoView extends VanillaView<SegmentedControlDemoViewProps> {
    private value: string;
    private segmentedView: SegmentedControlView | undefined;
    private lastInitialValue: string | undefined;

    public constructor(props: SegmentedControlDemoViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.value = props.initialValue ?? "grid";
        this.lastInitialValue = props.initialValue;
    }

    protected onMount(): void {
        const segmentedView = this.child(new SegmentedControlView(this.childProps(this.props)));
        this.segmentedView = segmentedView;
        this.root.append(segmentedView.root);
        segmentedView.mount();
    }

    protected onUpdate(props: SegmentedControlDemoViewProps): void {
        if (props.initialValue && props.initialValue !== this.lastInitialValue) {
            this.value = props.initialValue;
        }
        this.lastInitialValue = props.initialValue;
        this.segmentedView?.update(this.childProps(props));
    }

    protected onDispose(): void {
        this.segmentedView = undefined;
    }

    private childProps(props: SegmentedControlDemoViewProps): SegmentedControlProps {
        return {
            items: DEMO_ITEMS,
            value: this.value,
            onChange: this.setValue,
            size: props.size,
            background: props.background,
            disabled: props.disabled,
        };
    }

    private readonly setValue = (value: string): void => {
        this.value = value;
        this.segmentedView?.update(this.childProps(this.props));
    };
}

export const segmentedControlStory: Story<SegmentedControlDemoViewProps> = {
    id: "segmented-control",
    name: "SegmentedControl",
    section: "Bootstrap",
    view: SegmentedControlDemoView,
    props: [
        { name: "initialValue", type: "enum", options: ["json", "grid", "log"], default: "grid", label: "Initial value" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "background", type: "enum", options: ["default", "light", "dark"], default: "default" },
        { name: "disabled", type: "boolean", default: false },
    ],
};
