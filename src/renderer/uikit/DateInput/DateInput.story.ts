import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { DateInputView } from "./DateInputView";
import type { DateInputProps } from "./DateInput";
import type { Story } from "../../editors/storybook/storyTypes";

interface DateInputDemoViewProps {
    initialValue?: string;
    size?: "sm" | "md";
    disabled?: boolean;
    readOnly?: boolean;
}

function createDescription(): HTMLSpanElement {
    const description = createTextElement("", { size: "sm", color: "light" });
    description.append(
        document.createTextNode("Native date picker wrapped as a UIKit primitive — value is an ISO"),
        Object.assign(document.createElement("code"), { textContent: " YYYY-MM-DD" }),
        document.createTextNode(" string API."),
    );
    return description;
}

class DateInputDemoView extends VanillaView<DateInputDemoViewProps> {
    private value: string;
    private dateInputView: DateInputView | undefined;
    private valueText: HTMLSpanElement | undefined;
    private lastInitialValue: string | undefined;

    public constructor(props: DateInputDemoViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "md" }));
        this.value = props.initialValue ?? "";
        this.lastInitialValue = props.initialValue;
    }

    protected onMount(): void {
        const dateInputView = this.child(new DateInputView(this.dateInputProps(this.props)));
        this.dateInputView = dateInputView;
        this.valueText = createTextElement(`Value: ${JSON.stringify(this.value)}`);
        this.root.append(dateInputView.root, this.valueText, createDescription());
        dateInputView.mount();
    }

    protected onUpdate(props: DateInputDemoViewProps): void {
        if (props.initialValue !== this.lastInitialValue) {
            this.value = props.initialValue ?? "";
        }
        this.lastInitialValue = props.initialValue;
        this.valueText && (this.valueText.textContent = `Value: ${JSON.stringify(this.value)}`);
        this.dateInputView?.update(this.dateInputProps(props));
    }

    protected onDispose(): void {
        this.dateInputView = undefined;
        this.valueText = undefined;
    }

    private dateInputProps(props: DateInputDemoViewProps): DateInputProps {
        return {
            value: this.value,
            onChange: this.setValue,
            size: props.size,
            disabled: props.disabled,
            readOnly: props.readOnly,
            width: 180,
            "aria-label": "Demo date",
        };
    }

    private readonly setValue = (value: string): void => {
        this.value = value;
        this.valueText && (this.valueText.textContent = `Value: ${JSON.stringify(value)}`);
        this.dateInputView?.update(this.dateInputProps(this.props));
    };
}

export const dateInputStory: Story<DateInputDemoViewProps> = {
    id: "date-input",
    name: "DateInput",
    section: "Bootstrap",
    view: DateInputDemoView,
    props: [
        { name: "initialValue", type: "string", default: "", label: "Initial value (YYYY-MM-DD)" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "disabled", type: "boolean", default: false },
        { name: "readOnly", type: "boolean", default: false },
    ],
};
