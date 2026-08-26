import { IconButtonView } from "../IconButton/IconButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { createIconElement } from "../shared/slots";
import type { SlotContent } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import { InputView } from "./InputView";
import type { InputProps } from "./Input";
import { height } from "../tokens";
import type { Story } from "../../editors/storybook/storyTypes";

interface InputDemoViewProps {
    initialValue?: string;
    placeholder?: string;
    size?: "sm" | "md";
    variant?: "default" | "ghost";
    tone?: "default" | "accent";
    disabled?: boolean;
    readOnly?: boolean;
    slotPreset?: "none" | "chevron" | "search" | "unit";
}

function createTip(): HTMLSpanElement {
    const tip = createTextElement("", { size: "sm", color: "light" });
    tip.append(
        document.createTextNode("Tip: switch "),
        Object.assign(document.createElement("code"), { textContent: "variant" }),
        document.createTextNode(" to "),
        Object.assign(document.createElement("code"), { textContent: "ghost" }),
        document.createTextNode(" to see the inline-edit chrome (transparent at rest, hover/focus borders only)."),
    );
    return tip;
}

class InputDemoView extends VanillaView<InputDemoViewProps> {
    private value: string;
    private inputView: InputView | undefined;
    private valueText: HTMLSpanElement | undefined;
    private slotButton: IconButtonView | undefined;
    private slotSignature = "";
    private lastInitialValue: string | undefined;

    public constructor(props: InputDemoViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "md" }));
        this.value = props.initialValue ?? "Hello";
        this.lastInitialValue = props.initialValue;
    }

    protected onMount(): void {
        this.valueText = createTextElement(`Value: ${JSON.stringify(this.value)}`);
        this.rebuildSlots(this.props);
        const inputView = this.child(new InputView(this.inputProps(this.props)));
        this.inputView = inputView;
        this.root.append(inputView.root, this.valueText, createTip());
        inputView.mount();
    }

    protected onUpdate(props: InputDemoViewProps): void {
        if (props.initialValue !== this.lastInitialValue) {
            this.value = props.initialValue ?? "Hello";
        }
        this.lastInitialValue = props.initialValue;
        this.rebuildSlots(props);
        this.valueText && (this.valueText.textContent = `Value: ${JSON.stringify(this.value)}`);
        this.inputView?.update(this.inputProps(props));
    }

    protected onDispose(): void {
        this.inputView = undefined;
        this.valueText = undefined;
        this.slotButton = undefined;
        this.startSlot = undefined;
        this.endSlot = undefined;
    }

    private inputProps(props: InputDemoViewProps): InputProps {
        return {
            value: this.value,
            onChange: this.setValue,
            placeholder: props.placeholder,
            size: props.size,
            variant: props.variant,
            tone: props.tone,
            disabled: props.disabled,
            readOnly: props.readOnly,
            startSlot: this.startSlot,
            endSlot: this.endSlot,
            "aria-label": "Demo input",
        };
    }

    private startSlot: SlotContent | undefined;
    private endSlot: SlotContent | undefined;

    private rebuildSlots(props: InputDemoViewProps): void {
        const preset = props.slotPreset ?? "none";
        const signature = `${preset}:${this.value !== ""}`;
        if (signature === this.slotSignature) {
            if (this.slotButton) {
                this.slotButton.update(preset === "chevron"
                    ? { icon: "chevron-down", size: "sm", tabIndex: -1, disabled: props.disabled }
                    : { icon: "close", size: "sm", tabIndex: -1, disabled: props.disabled, onClick: this.clearValue });
            }
            return;
        }
        if (this.slotButton) {
            this.releaseChild(this.slotButton);
            this.slotButton = undefined;
        }
        this.startSlot = undefined;
        this.endSlot = undefined;
        if (preset === "chevron") {
            const button = this.child(new IconButtonView({
                icon: "chevron-down", size: "sm", tabIndex: -1, disabled: props.disabled,
            }));
            button.mount();
            this.slotButton = button;
            this.endSlot = button.root;
        } else if (preset === "search") {
            this.startSlot = createIconElement("search", { width: height.iconMd, height: height.iconMd });
            if (this.value !== "") {
                const button = this.child(new IconButtonView({
                    icon: "close", size: "sm", tabIndex: -1, disabled: props.disabled,
                    onClick: this.clearValue,
                }));
                button.mount();
                this.slotButton = button;
                this.endSlot = button.root;
            }
        } else if (preset === "unit") {
            this.endSlot = createTextElement("kg", { color: "light" });
        }
        this.slotSignature = signature;
    }

    private readonly setValue = (value: string): void => {
        this.value = value;
        this.valueText && (this.valueText.textContent = `Value: ${JSON.stringify(value)}`);
        this.rebuildSlots(this.props);
        this.inputView?.update(this.inputProps(this.props));
    };

    private readonly clearValue = (): void => {
        this.setValue("");
    };
}

export const inputStory: Story<InputDemoViewProps> = {
    id: "input",
    name: "Input",
    section: "Bootstrap",
    view: InputDemoView,
    props: [
        { name: "initialValue", type: "string", default: "Hello",                label: "Initial value" },
        { name: "placeholder",  type: "string", default: "Placeholder text" },
        { name: "size",         type: "enum",   options: ["sm", "md"], default: "md" },
        { name: "variant",      type: "enum",   options: ["default", "ghost"], default: "default" },
        { name: "tone",         type: "enum",   options: ["default", "accent"], default: "default", label: "Text tone" },
        { name: "disabled",     type: "boolean", default: false },
        { name: "readOnly",     type: "boolean", default: false },
        {
            name: "slotPreset",
            type: "enum",
            options: ["none", "chevron", "search", "unit"],
            default: "none",
            label: "Slot preset",
        },
    ],
};
