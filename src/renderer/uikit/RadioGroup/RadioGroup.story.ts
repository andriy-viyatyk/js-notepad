import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { RadioGroupView } from "./RadioGroupView";
import type { IRadio, RadioGroupProps } from "./RadioGroup";
import "./RadioGroup.css";
import type { Story } from "../../editors/storybook/storyTypes";

interface RadioGroupDemoViewProps {
    initialValue?: string;
    orientation?: "horizontal" | "vertical";
    wrap?: boolean;
    gap?: "xs" | "sm" | "md" | "lg" | "xl";
    disabled?: boolean;
    count?: number;
    withIcons?: boolean;
    disableSecond?: boolean;
}

class RadioGroupDemoView extends VanillaView<RadioGroupDemoViewProps> {
    private value: string;
    private items: IRadio[];
    private radioView: RadioGroupView | undefined;
    private selectedText: HTMLSpanElement | undefined;
    private lastInitialValue: string | undefined;

    public constructor(props: RadioGroupDemoViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "md" }));
        this.value = props.initialValue ?? "opt-1";
        this.items = this.makeItems(props);
        this.repairSelection();
        this.lastInitialValue = props.initialValue;
    }

    protected onMount(): void {
        const radioView = this.child(new RadioGroupView(this.childProps(this.props)));
        this.radioView = radioView;
        this.selectedText = createTextElement(`Selected: ${this.value}`);
        this.root.append(radioView.root, this.selectedText);
        radioView.mount();
    }

    protected onUpdate(props: RadioGroupDemoViewProps): void {
        if (props.initialValue && props.initialValue !== this.lastInitialValue) {
            this.value = props.initialValue;
        }
        this.lastInitialValue = props.initialValue;
        this.items = this.makeItems(props);
        this.repairSelection();
        this.selectedText && (this.selectedText.textContent = `Selected: ${this.value}`);
        this.radioView?.update(this.childProps(props));
    }

    protected onDispose(): void {
        this.radioView = undefined;
        this.selectedText = undefined;
    }

    private makeItems(props: RadioGroupDemoViewProps): IRadio[] {
        return Array.from({ length: Math.max(1, props.count ?? 4) }, (_, index) => ({
            value: `opt-${index + 1}`,
            label: `Option ${index + 1}`,
            icon: props.withIcons ? "check" : undefined,
            disabled: props.disableSecond && index === 1,
        }));
    }

    private childProps(props: RadioGroupDemoViewProps): RadioGroupProps {
        return {
            items: this.items,
            value: this.value,
            onChange: this.setValue,
            orientation: props.orientation,
            wrap: props.wrap,
            gap: props.gap,
            disabled: props.disabled,
            "aria-label": "Demo radio group",
        };
    }

    private repairSelection(): void {
        const valid = this.items.find((item) => item.value === this.value && !item.disabled);
        if (!valid) {
            const first = this.items.find((item) => !item.disabled);
            if (first) this.value = first.value;
        }
    }

    private readonly setValue = (value: string): void => {
        this.value = value;
        this.selectedText && (this.selectedText.textContent = `Selected: ${value}`);
        this.radioView?.update(this.childProps(this.props));
    };
}

export const radioGroupStory: Story<RadioGroupDemoViewProps> = {
    id: "radio-group",
    name: "RadioGroup",
    section: "Bootstrap",
    view: RadioGroupDemoView,
    props: [
        { name: "initialValue",  type: "string",  default: "opt-1",   label: "Initial value" },
        { name: "orientation",   type: "enum",    options: ["vertical", "horizontal"], default: "vertical" },
        { name: "wrap",          type: "boolean", default: false },
        { name: "gap",           type: "enum",    options: ["xs", "sm", "md", "lg", "xl"], default: "sm" },
        { name: "disabled",      type: "boolean", default: false, label: "Group disabled" },
        { name: "count",         type: "number",  default: 4, min: 1, max: 8, step: 1 },
        { name: "withIcons",     type: "boolean", default: false, label: "Show item icons" },
        { name: "disableSecond", type: "boolean", default: false, label: "Disable item #2" },
    ],
};
