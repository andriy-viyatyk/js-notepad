import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { TextareaView } from "./TextareaView";
import type { TextareaProps } from "./Textarea";
import "./Textarea.css";
import type { Story } from "../../editors/storybook/storyTypes";

interface TextareaDemoViewProps {
    initialValue?: string;
    placeholder?: string;
    singleLine?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    minHeight?: number;
    maxHeight?: number;
    size?: "sm" | "md";
    variant?: "default" | "ghost";
    autoFocus?: boolean;
}

function createTip(): HTMLSpanElement {
    const tip = createTextElement("", { size: "sm", color: "light" });
    tip.append(
        document.createTextNode("Tip: switch "),
        Object.assign(document.createElement("code"), { textContent: "variant" }),
        document.createTextNode(" to "),
        Object.assign(document.createElement("code"), { textContent: "ghost" }),
        document.createTextNode(" for the inline-edit chrome (transparent at rest, hover/focus borders only) used by todo titles and notebook cell descriptions."),
    );
    return tip;
}

class TextareaDemoView extends VanillaView<TextareaDemoViewProps> {
    private value: string;
    private textareaView: TextareaView | undefined;
    private valueText: HTMLSpanElement | undefined;
    private lastInitialValue: string | undefined;

    public constructor(props: TextareaDemoViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "md" }));
        this.value = props.initialValue ?? "";
        this.lastInitialValue = props.initialValue;
    }

    protected onMount(): void {
        const textareaView = this.child(new TextareaView(this.textareaProps(this.props)));
        this.textareaView = textareaView;
        this.valueText = createTextElement(`Value: ${JSON.stringify(this.value)}`);
        this.root.append(textareaView.root, this.valueText, createTip());
        textareaView.mount();
    }

    protected onUpdate(props: TextareaDemoViewProps): void {
        if (props.initialValue !== this.lastInitialValue) {
            this.value = props.initialValue ?? "";
        }
        this.lastInitialValue = props.initialValue;
        this.valueText && (this.valueText.textContent = `Value: ${JSON.stringify(this.value)}`);
        this.textareaView?.update(this.textareaProps(props));
    }

    protected onDispose(): void {
        this.textareaView = undefined;
        this.valueText = undefined;
    }

    private textareaProps(props: TextareaDemoViewProps): TextareaProps {
        return {
            value: this.value,
            onChange: this.setValue,
            placeholder: props.placeholder,
            singleLine: props.singleLine,
            disabled: props.disabled,
            readOnly: props.readOnly,
            minHeight: props.minHeight || undefined,
            maxHeight: props.maxHeight || undefined,
            size: props.size,
            variant: props.variant,
            autoFocus: props.autoFocus,
            "aria-label": "Demo textarea",
        };
    }

    private readonly setValue = (value: string): void => {
        this.value = value;
        this.valueText && (this.valueText.textContent = `Value: ${JSON.stringify(value)}`);
        this.textareaView?.update(this.textareaProps(this.props));
    };
}

export const textareaStory: Story<TextareaDemoViewProps> = {
    id: "textarea",
    name: "Textarea",
    section: "Bootstrap",
    view: TextareaDemoView,
    props: [
        { name: "initialValue", type: "string", default: "",                       label: "Initial value" },
        { name: "placeholder",  type: "string", default: "Type something..." },
        { name: "singleLine",   type: "boolean", default: false },
        { name: "disabled",     type: "boolean", default: false },
        { name: "readOnly",     type: "boolean", default: false },
        { name: "minHeight",    type: "number", default: 0, min: 0, max: 200, step: 10, label: "Min height (0 = unset)" },
        { name: "maxHeight",    type: "number", default: 0, min: 0, max: 500, step: 50, label: "Max height (0 = unset)" },
        { name: "size",         type: "enum", options: ["sm", "md"], default: "md" },
        { name: "variant",      type: "enum", options: ["default", "ghost"], default: "default" },
        { name: "autoFocus",    type: "boolean", default: false, label: "Auto-focus on mount" },
    ],
};
