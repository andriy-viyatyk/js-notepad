import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { LogEntry } from "./logTypes";
import type { LogViewEditor } from "./LogViewEditor";
import { LogEntryContentView } from "./LogEntryContent";

export interface LogEntryWrapperProps {
    vm: LogViewEditor;
    entry: LogEntry;
    index: number;
    showTimestamp: boolean;
}

function accentForEntryType(type: string): "info" | "warn" | "error" | "success" | undefined {
    switch (type) {
        case "log.info": return "info";
        case "log.warn": return "warn";
        case "log.error": return "error";
        case "log.success": return "success";
        default: return undefined;
    }
}

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
}

export class LogEntryWrapperView extends VanillaView<LogEntryWrapperProps> {
    private readonly timestamp = createTextElement("", { size: "md", color: "light", nowrap: true });
    private readonly contentPanel = createPanelElement({ name: "entry-content", flex: 1, minWidth: 0, direction: "column" });
    private readonly content = this.child(new LogEntryContentView({
        model: this.props?.vm as LogViewEditor,
        entry: this.props?.entry as LogEntry,
        updateEntry: () => undefined,
    }));

    public constructor(props: LogEntryWrapperProps) {
        super(props, createPanelElement({
            name: "log-entry-wrapper",
            direction: "row",
            align: "start",
            paddingX: "lg",
            gap: "md",
            width: "100%",
            height: "fit-content",
        }));
        // The child is created after the base constructor in normal use; this assignment is only
        // here to satisfy the stable field shape without creating a second child.
    }

    protected onMount(): void {
        this.root.append(this.timestamp, this.contentPanel);
        this.contentPanel.append(this.content.root);
        this.content.update({
            model: this.props.vm,
            entry: this.props.entry,
            updateEntry: (updater) => this.props.vm.updateEntryAt(this.props.index, updater),
        });
        this.content.mount();
        this.applyProps(this.props);
    }

    protected onUpdate(props: LogEntryWrapperProps): void {
        this.applyProps(props);
        this.content.update({
            model: props.vm,
            entry: props.entry,
            updateEntry: (updater) => props.vm.updateEntryAt(props.index, updater),
        });
    }

    private applyProps(props: LogEntryWrapperProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes({
            name: "log-entry-wrapper",
            direction: "row",
            align: "start",
            paddingX: "lg",
            gap: "md",
            accent: accentForEntryType(props.entry.type),
            width: "100%",
            height: "fit-content",
        }));
        const hasTimestamp = props.showTimestamp && props.entry.timestamp != null;
        this.timestamp.style.display = hasTimestamp ? "" : "none";
        if (hasTimestamp) this.timestamp.textContent = formatTimestamp(props.entry.timestamp as number);
    }
}

export function LogEntryWrapper(props: LogEntryWrapperProps): LogEntryWrapperView {
    return new LogEntryWrapperView(props);
}
