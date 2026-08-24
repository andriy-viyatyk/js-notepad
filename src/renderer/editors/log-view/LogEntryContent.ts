import { errMessage } from "../../../shared/utils";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type {
    ButtonsEntry, CheckboxesEntry, ConfirmEntry, GridOutputEntry, LogEntry,
    McpRequestEntry, MarkdownOutputEntry, MermaidOutputEntry, ProgressOutputEntry,
    RadioboxesEntry, SelectEntry, TextInputEntry, TextOutputEntry,
} from "./logTypes";
import { isDialogEntry, isLogEntry, isOutputEntry } from "./logTypes";
import { LogMessageView } from "./LogMessageView";
import type { LogViewEditor } from "./LogViewEditor";
import { ButtonsDialogView } from "./items/ButtonsDialogView";
import { CheckboxesDialogView } from "./items/CheckboxesDialogView";
import { ConfirmDialogView } from "./items/ConfirmDialogView";
import { RadioboxesDialogView } from "./items/RadioboxesDialogView";
import { SelectDialogView } from "./items/SelectDialogView";
import { TextInputDialogView } from "./items/TextInputDialogView";
import { GridOutputView } from "./items/GridOutputView";
import { MarkdownOutputView } from "./items/MarkdownOutputView";
import { McpRequestView } from "./items/McpRequestView";
import { MermaidOutputView } from "./items/MermaidOutputView";
import { ProgressOutputView } from "./items/ProgressOutputView";
import { TextOutputView } from "./items/TextOutputView";
import { createPanelElement } from "../../uikit/Panel/panel-style";

export type EntryUpdater<T extends LogEntry> = (updater: (draft: T) => void) => void;

export interface LogEntryContentProps {
    model: LogViewEditor;
    entry: LogEntry;
    updateEntry: EntryUpdater<LogEntry>;
}

type EntryChild = VanillaView<unknown>;

function asEntryChild<T>(view: VanillaView<T>): EntryChild {
    return view as unknown as EntryChild;
}

function makeChild(props: LogEntryContentProps): EntryChild {
    const { entry, model, updateEntry } = props;
    if (isLogEntry(entry)) return asEntryChild(new LogMessageView({ entry }));
    switch (entry.type) {
        case "input.confirm": return asEntryChild(new ConfirmDialogView({ model, entry: entry as ConfirmEntry }));
        case "input.text": return asEntryChild(new TextInputDialogView({
            model, entry: entry as TextInputEntry,
            updateEntry: updateEntry as EntryUpdater<TextInputEntry>,
        }));
        case "input.buttons": return asEntryChild(new ButtonsDialogView({ model, entry: entry as ButtonsEntry }));
        case "input.checkboxes": return asEntryChild(new CheckboxesDialogView({
            model, entry: entry as CheckboxesEntry,
            updateEntry: updateEntry as EntryUpdater<CheckboxesEntry>,
        }));
        case "input.radioboxes": return asEntryChild(new RadioboxesDialogView({
            model, entry: entry as RadioboxesEntry,
            updateEntry: updateEntry as EntryUpdater<RadioboxesEntry>,
        }));
        case "input.select": return asEntryChild(new SelectDialogView({
            model, entry: entry as SelectEntry,
            updateEntry: updateEntry as EntryUpdater<SelectEntry>,
        }));
        case "output.progress": return asEntryChild(new ProgressOutputView({ entry: entry as ProgressOutputEntry }));
        case "output.grid": return asEntryChild(new GridOutputView({ model, entry: entry as GridOutputEntry }));
        case "output.text": return asEntryChild(new TextOutputView({ entry: entry as TextOutputEntry }));
        case "output.markdown": return asEntryChild(new MarkdownOutputView({ entry: entry as MarkdownOutputEntry }));
        case "output.mermaid": return asEntryChild(new MermaidOutputView({ entry: entry as MermaidOutputEntry }));
        case "output.mcp-request": return asEntryChild(new McpRequestView({ entry: entry as McpRequestEntry }));
    }

    if (entry.type.startsWith("input.")) return asEntryChild(new DialogEntryStubView({ entry }));
    if (isOutputEntry(entry)) return asEntryChild(new OutputEntryStubView({ entry }));
    return asEntryChild(new UnknownEntryView({ entry }));
}

function isStubEntry(entry: LogEntry): boolean {
    return !isLogEntry(entry) && !isDialogEntry(entry) && !isOutputEntry(entry);
}

class DialogEntryStubView extends VanillaView<{ entry: LogEntry }> {
    private readonly text = createTextElement("", { size: "base", color: "light" });
    public constructor(props: { entry: LogEntry }) { super(props, document.createElement("span")); }
    protected onMount(): void { this.root.append(this.text); this.applyProps(this.props); }
    protected onUpdate(props: { entry: LogEntry }): void { this.applyProps(props); }
    private applyProps(props: { entry: LogEntry }): void {
        const label = props.entry.title || props.entry.message || "";
        const answered = props.entry.button !== undefined ? ` — answered: ${String(props.entry.button)}` : "";
        this.text.textContent = `[${props.entry.type}] ${typeof label === "string" ? label : ""}${answered}`;
    }
}

class OutputEntryStubView extends VanillaView<{ entry: LogEntry }> {
    private readonly text = createTextElement("", { size: "base", color: "light" });
    public constructor(props: { entry: LogEntry }) { super(props, document.createElement("span")); }
    protected onMount(): void { this.root.append(this.text); this.applyProps(this.props); }
    protected onUpdate(props: { entry: LogEntry }): void { this.applyProps(props); }
    private applyProps(props: { entry: LogEntry }): void {
        const label = props.entry.label || props.entry.title || "";
        this.text.textContent = `[${props.entry.type}] ${typeof label === "string" ? label : ""}`;
    }
}

class UnknownEntryView extends VanillaView<{ entry: LogEntry }> {
    private readonly text = createTextElement("", { size: "base", color: "light" });
    public constructor(props: { entry: LogEntry }) { super(props, document.createElement("span")); }
    protected onMount(): void { this.root.append(this.text); this.applyProps(this.props); }
    protected onUpdate(props: { entry: LogEntry }): void { this.applyProps(props); }
    private applyProps(props: { entry: LogEntry }): void {
        const { type: _type, id: _id, timestamp: _timestamp, ...fields } = props.entry;
        let preview: string;
        try {
            preview = JSON.stringify(fields).slice(0, 200);
        } catch (error) {
            preview = errMessage(error, "Unable to inspect entry");
        }
        this.text.textContent = `[${props.entry.type}] ${preview}`;
    }
}

export class LogEntryContentView extends VanillaView<LogEntryContentProps> {
    private childView: EntryChild | undefined;
    private childKind: string | undefined;
    private fallback: HTMLSpanElement | undefined;
    private readonly itemWrapper = createPanelElement({ name: "log-item-wrapper", paddingY: "xs" });

    public constructor(props: LogEntryContentProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.renderEntry(this.props);
    }

    protected onUpdate(props: LogEntryContentProps): void {
        if (this.childKind === props.entry.type && this.childView) {
            try {
                this.childView.update(props as unknown);
                return;
            } catch (error) {
                this.showFailure(props.entry, error);
                return;
            }
        }
        this.renderEntry(props);
    }

    protected onDispose(): void {
        this.fallback = undefined;
        this.childKind = undefined;
    }

    private renderEntry(props: LogEntryContentProps): void {
        this.clearChild();
        this.fallback = undefined;
        try {
            const view = makeChild(props);
            this.childView = this.child(view);
            this.childKind = props.entry.type;
            if (isDialogEntry(props.entry) || isOutputEntry(props.entry)) {
                this.itemWrapper.replaceChildren(this.childView.root);
                if (this.root.firstElementChild !== this.itemWrapper) this.root.replaceChildren(this.itemWrapper);
            } else {
                this.root.replaceChildren(this.childView.root);
            }
            this.childView.mount();
        } catch (error) {
            this.showFailure(props.entry, error);
        }
    }

    private showFailure(entry: LogEntry, error: unknown): void {
        this.clearChild();
        this.fallback = createTextElement(`[${entry.type}] render error: ${errMessage(error)}`, {
            size: "md",
            color: "error",
        });
        this.root.replaceChildren(this.fallback);
    }

    private clearChild(): void {
        const child = this.childView;
        this.childView = undefined;
        this.childKind = undefined;
        if (!child) return;
        try {
            this.releaseChild(child);
        } catch (error) {
            console.error("Log entry child disposal failed", errMessage(error));
        }
    }
}

export function isUnknownLogEntry(entry: LogEntry): boolean {
    return isStubEntry(entry);
}
