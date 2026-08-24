import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { LogMessageEntry } from "./logTypes";
import { StyledTextView } from "./StyledTextView";

export interface LogMessageViewProps {
    entry: LogMessageEntry;
}

function colorForLevel(type: string): "light" | "primary" | "warning" | "error" | "success" | "default" {
    switch (type) {
        case "log.log": return "light";
        case "log.info": return "primary";
        case "log.warn": return "warning";
        case "log.error": return "error";
        case "log.success": return "success";
        default: return "default";
    }
}

export class LogMessageView extends VanillaView<LogMessageViewProps> {
    private readonly message = createTextElement("", { preWrap: true, size: "base" });
    private readonly styledText = this.child(new StyledTextView({ text: "" }));

    public constructor(props: LogMessageViewProps) {
        super(props, createPanelElement({ name: "log-message", wordBreak: "break-word" }));
        this.message.append(this.styledText.root);
    }

    protected onMount(): void {
        this.root.append(this.message);
        this.styledText.mount();
        this.applyProps(this.props);
    }

    protected onUpdate(props: LogMessageViewProps): void {
        this.applyProps(props);
        this.styledText.update({ text: props.entry.text });
    }

    private applyProps(props: LogMessageViewProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes({ name: "log-message", wordBreak: "break-word" }));
        this.message.dataset.color = colorForLevel(props.entry.type);
        this.message.dataset.size = "base";
        this.message.dataset.preWrap = "";
    }
}
