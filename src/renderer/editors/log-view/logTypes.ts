import type { GridColumn } from "../grid/utils/grid-utils";
export type { GridColumn };

// =============================================================================
// Styled Text
// =============================================================================

export interface StyledSegment {
    text: string;
    styles?: Record<string, string | number>;
}

/** Text that can be either a plain string or an array of styled segments. */
export type StyledText = string | StyledSegment[];

// =============================================================================
// Base Entry
// =============================================================================

export interface LogEntryBase {
    type: string;
    id: string;
    timestamp?: number;
    /** Variant-specific fields ride here — narrow by `type` to access. */
    [key: string]: unknown;
}

/** Flat log entry — system fields + any type-specific fields. */
export type LogEntry = LogEntryBase;

// =============================================================================
// Log Entries (display-only)
// =============================================================================

// log.text, log.info, log.warn, log.error, log.success
// text: StyledText

export type LogLevel = "log.log" | "log.text" | "log.info" | "log.warn" | "log.error" | "log.success";

export interface LogMessageEntry extends LogEntryBase {
    type: LogLevel;
    text: StyledText;
}

// =============================================================================
// Dialog Entries (interactive)
// =============================================================================

export interface ConfirmEntry extends LogEntryBase {
    type: "input.confirm";
    message: StyledText;
    buttons?: string[];
    button?: string;
}

export interface TextInputEntry extends LogEntryBase {
    type: "input.text";
    title?: StyledText;
    placeholder?: string;
    defaultValue?: string;
    text?: string;
    buttons?: string[];
    button?: string;
}

export interface ButtonsEntry extends LogEntryBase {
    type: "input.buttons";
    title?: StyledText;
    buttons: string[];
    button?: string;
}

export interface CheckboxItem {
    label: string;
    checked?: boolean;
}

export interface CheckboxesEntry extends LogEntryBase {
    type: "input.checkboxes";
    title?: StyledText;
    items: CheckboxItem[];
    layout?: "vertical" | "flex";
    buttons?: string[];
    button?: string;
}

export interface RadioboxesEntry extends LogEntryBase {
    type: "input.radioboxes";
    title?: StyledText;
    items: string[];
    checked?: string;
    layout?: "vertical" | "flex";
    buttons?: string[];
    button?: string;
}

export interface SelectEntry extends LogEntryBase {
    type: "input.select";
    title?: StyledText;
    items: string[];
    selected?: string;
    placeholder?: string;
    buttons?: string[];
    button?: string;
}

export type DialogEntryType =
    | "input.confirm"
    | "input.text"
    | "input.buttons"
    | "input.checkboxes"
    | "input.radioboxes"
    | "input.select";

// =============================================================================
// Output Entries (rich display)
// =============================================================================

export interface ProgressOutputEntry extends LogEntryBase {
    type: "output.progress";
    label?: StyledText;
    value?: number;
    max?: number;
    completed?: boolean;
}

export interface GridOutputEntry extends LogEntryBase {
    type: "output.grid";
    title?: StyledText;
    data: unknown[];
    columns?: (string | GridColumn)[];
}

export interface TextOutputEntry extends LogEntryBase {
    type: "output.text";
    title?: StyledText;
    text: string;
    language?: string;
    wordWrap?: boolean;
    lineNumbers?: boolean;
    minimap?: boolean;
}

export interface MarkdownOutputEntry extends LogEntryBase {
    type: "output.markdown";
    title?: StyledText;
    text: string;
}

export interface MermaidOutputEntry extends LogEntryBase {
    type: "output.mermaid";
    title?: StyledText;
    text: string;
}

export interface McpRequestEntry extends LogEntryBase {
    type: "output.mcp-request";
    title?: StyledText;
    direction: "outgoing" | "incoming";
    method: string;
    params: unknown;
    result: unknown;
    error: string | null;
    durationMs: number;
}

export type OutputEntryType =
    | "output.progress"
    | "output.grid"
    | "output.text"
    | "output.markdown"
    | "output.mermaid"
    | "output.mcp-request";

// =============================================================================
// Type Guards
// =============================================================================

const LOG_LEVELS = new Set<string>(["log.log", "log.text", "log.info", "log.warn", "log.error", "log.success"]);
const DIALOG_TYPES = new Set<string>(["input.confirm", "input.text", "input.buttons", "input.checkboxes", "input.radioboxes", "input.select"]);
const OUTPUT_TYPES = new Set<string>(["output.progress", "output.grid", "output.text", "output.markdown", "output.mermaid", "output.mcp-request"]);

export function isLogEntry(entry: LogEntry): entry is LogMessageEntry {
    return LOG_LEVELS.has(entry.type);
}

export function isDialogEntry(entry: LogEntry): boolean {
    return DIALOG_TYPES.has(entry.type);
}

export function isOutputEntry(entry: LogEntry): boolean {
    return OUTPUT_TYPES.has(entry.type);
}

export function isDialogResolved(entry: LogEntry): boolean {
    return isDialogEntry(entry) && entry.button !== undefined;
}
