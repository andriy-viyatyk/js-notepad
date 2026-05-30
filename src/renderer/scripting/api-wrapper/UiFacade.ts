import type { LogViewEditor } from "../../editors/log-view";
import type { StyledText, LogEntry, CheckboxItem, GridColumn } from "../../editors/log-view/logTypes";
import { StyledLogBuilder } from "./StyledTextBuilder";
import { Progress } from "./Progress";
import { Grid } from "./Grid";
import { Text } from "./Text";
import { Markdown } from "./Markdown";
import { Mermaid } from "./Mermaid";

/** Check if value is a plain options object (not a string, not an array). */
function isOptionsObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Script facade for the `ui` global variable.
 * Wraps a LogViewEditor to provide logging and dialog methods.
 */
export class UiFacade {
    constructor(private readonly editor: LogViewEditor) {}

    // =========================================================================
    // Console forwarding control
    // =========================================================================

    consoleLogPrevented = false;
    consoleWarnPrevented = false;
    consoleErrorPrevented = false;

    preventConsoleLog() { this.consoleLogPrevented = true; }
    preventConsoleWarn() { this.consoleWarnPrevented = true; }
    preventConsoleError() { this.consoleErrorPrevented = true; }

    // =========================================================================
    // Logging — returns StyledLogBuilder for optional chaining
    // =========================================================================

    private addLog(type: string, message: StyledText): StyledLogBuilder {
        const entry = this.editor.addEntry(type, message);
        return new StyledLogBuilder(message, (text) => this.editor.updateEntryText(entry.id, text));
    }

    /** Add a console-forwarded entry (used by installConsoleForwarding, not part of public API). */
    addConsoleEntry(type: string, text: string) { this.editor.addEntry(type, text); }

    log(message: StyledText) { return this.addLog("log.log", message); }
    info(message: StyledText) { return this.addLog("log.info", message); }
    warn(message: StyledText) { return this.addLog("log.warn", message); }
    error(message: StyledText) { return this.addLog("log.error", message); }
    success(message: StyledText) { return this.addLog("log.success", message); }
    text(message: StyledText) { return this.addLog("log.text", message); }
    clear() { this.editor.clear(); }

    // =========================================================================
    // Dialogs (async, returns Promise)
    //
    // Two-overload pattern:
    //   Simple form:  method(positionalArgs...)
    //   Full form:    method({ ...allParams })
    //
    // Disambiguation: StyledText is string | StyledSegment[] (always string or
    // array). A plain non-array object is always the full form.
    // =========================================================================

    readonly dialog = {
        confirm: (messageOrOpts: StyledText | { message: StyledText; buttons?: string[] }, buttons?: string[]): Promise<LogEntry> => {
            if (isOptionsObject(messageOrOpts)) {
                return this.editor.addDialogEntry("input.confirm", messageOrOpts);
            }
            return this.editor.addDialogEntry("input.confirm", { message: messageOrOpts, buttons });
        },

        buttons: (buttonsOrOpts: string[] | { buttons: string[]; title?: StyledText }, title?: StyledText): Promise<LogEntry> => {
            if (isOptionsObject(buttonsOrOpts)) {
                return this.editor.addDialogEntry("input.buttons", buttonsOrOpts);
            }
            return this.editor.addDialogEntry("input.buttons", { buttons: buttonsOrOpts, title });
        },

        textInput: (titleOrOpts?: StyledText | { title?: StyledText; placeholder?: string; defaultValue?: string; buttons?: string[] }, options?: { placeholder?: string; defaultValue?: string; buttons?: string[] }): Promise<LogEntry> => {
            if (isOptionsObject(titleOrOpts)) {
                return this.editor.addDialogEntry("input.text", titleOrOpts);
            }
            return this.editor.addDialogEntry("input.text", { title: titleOrOpts, ...options });
        },

        checkboxes: (itemsOrOpts: (string | CheckboxItem)[] | { items: (string | CheckboxItem)[]; title?: StyledText; layout?: "vertical" | "flex"; buttons?: string[] }, title?: StyledText, buttons?: string[]): Promise<LogEntry> => {
            const normalizeItems = (items: (string | CheckboxItem)[]): CheckboxItem[] =>
                items.map((item) => typeof item === "string" ? { label: item } : item);

            if (Array.isArray(itemsOrOpts)) {
                return this.editor.addDialogEntry("input.checkboxes", { items: normalizeItems(itemsOrOpts), title, buttons });
            }
            return this.editor.addDialogEntry("input.checkboxes", { ...itemsOrOpts, items: normalizeItems(itemsOrOpts.items) });
        },

        radioboxes: (itemsOrOpts: string[] | { items: string[]; title?: StyledText; checked?: string; layout?: "vertical" | "flex"; buttons?: string[] }, title?: StyledText, buttons?: string[]): Promise<LogEntry> => {
            if (Array.isArray(itemsOrOpts)) {
                return this.editor.addDialogEntry("input.radioboxes", { items: itemsOrOpts, title, buttons });
            }
            return this.editor.addDialogEntry("input.radioboxes", itemsOrOpts);
        },

        select: (itemsOrOpts: string[] | { items: string[]; title?: StyledText; selected?: string; placeholder?: string; buttons?: string[] }, title?: StyledText, buttons?: string[]): Promise<LogEntry> => {
            if (Array.isArray(itemsOrOpts)) {
                return this.editor.addDialogEntry("input.select", { items: itemsOrOpts, title, buttons });
            }
            return this.editor.addDialogEntry("input.select", itemsOrOpts);
        },
    };

    // =========================================================================
    // Output (rich display)
    // =========================================================================

    readonly show = {
        progress: (labelOrOpts?: StyledText | { label?: StyledText; value?: number; max?: number }): Progress => {
            let fields: Record<string, unknown>;
            if (isOptionsObject(labelOrOpts)) {
                fields = labelOrOpts;
            } else {
                fields = { label: labelOrOpts };
            }
            const entry = this.editor.addEntry("output.progress", fields);
            return new Progress(entry.id, this.editor, fields);
        },

        grid: (dataOrOpts: any[] | { data: any[]; columns?: (string | GridColumn)[]; title?: StyledText }): Grid => {
            let fields: Record<string, unknown>;
            if (Array.isArray(dataOrOpts)) {
                fields = { data: dataOrOpts };
            } else {
                fields = dataOrOpts;
            }
            const entry = this.editor.addEntry("output.grid", fields);
            return new Grid(entry.id, this.editor, fields as any);
        },

        text: (textOrOpts: string | { text: string; language?: string; title?: StyledText; wordWrap?: boolean; lineNumbers?: boolean; minimap?: boolean }, language?: string): Text => {
            let fields: Record<string, unknown>;
            if (isOptionsObject(textOrOpts)) {
                fields = textOrOpts;
            } else {
                fields = { text: textOrOpts, language };
            }
            const entry = this.editor.addEntry("output.text", fields);
            return new Text(entry.id, this.editor, fields as any);
        },

        markdown: (textOrOpts: string | { text: string; title?: StyledText }): Markdown => {
            let fields: Record<string, unknown>;
            if (isOptionsObject(textOrOpts)) {
                fields = textOrOpts;
            } else {
                fields = { text: textOrOpts };
            }
            const entry = this.editor.addEntry("output.markdown", fields);
            return new Markdown(entry.id, this.editor, fields as any);
        },

        mermaid: (textOrOpts: string | { text: string; title?: StyledText }): Mermaid => {
            let fields: Record<string, unknown>;
            if (isOptionsObject(textOrOpts)) {
                fields = textOrOpts;
            } else {
                fields = { text: textOrOpts };
            }
            const entry = this.editor.addEntry("output.mermaid", fields);
            return new Mermaid(entry.id, this.editor, fields as any);
        },
    };
}
