import { Component, ReactNode } from "react";
import { LogEntry, ConfirmEntry, TextInputEntry, ButtonsEntry, CheckboxesEntry, RadioboxesEntry, SelectEntry, ProgressOutputEntry, GridOutputEntry, TextOutputEntry, MarkdownOutputEntry, MermaidOutputEntry, McpRequestEntry, isLogEntry, isDialogEntry, isOutputEntry } from "./logTypes";
import { LogMessageView } from "./LogMessageView";
import { ConfirmDialogView } from "./items/ConfirmDialogView";
import { TextInputDialogView } from "./items/TextInputDialogView";
import { ButtonsDialogView } from "./items/ButtonsDialogView";
import { CheckboxesDialogView } from "./items/CheckboxesDialogView";
import { RadioboxesDialogView } from "./items/RadioboxesDialogView";
import { SelectDialogView } from "./items/SelectDialogView";
import { ProgressOutputView } from "./items/ProgressOutputView";
import { GridOutputView } from "./items/GridOutputView";
import { TextOutputView } from "./items/TextOutputView";
import { MarkdownOutputView } from "./items/MarkdownOutputView";
import { MermaidOutputView } from "./items/MermaidOutputView";
import { McpRequestView } from "./items/McpRequestView";
import { Panel, Text } from "../../uikit";
import type { LogViewEditor } from "./LogViewEditor";

// =============================================================================
// Entry Error Boundary
// =============================================================================

interface EntryErrorBoundaryState {
    error: Error | null;
}

class EntryErrorBoundary extends Component<{ entry: LogEntry; children: ReactNode }, EntryErrorBoundaryState> {
    state: EntryErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): EntryErrorBoundaryState {
        return { error };
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const { entry } = this.props;
        return (
            <Text size="md" color="error">
                [{entry.type}] render error: {error.message}
            </Text>
        );
    }
}

// =============================================================================
// Stubs for unimplemented entry types
// =============================================================================

function DialogEntryStub({ entry }: { entry: LogEntry }) {
    const label = entry.title || entry.message || "";
    const resolved = entry.button !== undefined;
    return (
        <Text size="base" color="light">
            [{entry.type}] {typeof label === "string" ? label : ""}
            {resolved && <Text size="base" color="dark"> — answered: {String(entry.button)}</Text>}
        </Text>
    );
}

function OutputEntryStub({ entry }: { entry: LogEntry }) {
    const label = entry.label || entry.title || "";
    return (
        <Text size="base" color="light">
            [{entry.type}] {typeof label === "string" ? label : ""}
        </Text>
    );
}

function UnknownEntryView({ entry }: { entry: LogEntry }) {
    const { type: _t, id: _i, timestamp: _ts, ...fields } = entry;
    let preview: string;
    try {
        preview = JSON.stringify(fields).slice(0, 200);
    } catch {
        preview = String(fields);
    }
    return (
        <Text size="base" color="light">
            [{entry.type}] {preview}
        </Text>
    );
}

// =============================================================================
// Dispatcher
// =============================================================================

/**
 * The dispatcher narrows by `entry.type` and forwards the same updater to
 * variant-specific views (whose drafts are the narrowed entry). TypeScript
 * can't follow that contravariant narrowing on a callback param, so we cast
 * the function type per-branch — type-precise, no `any`.
 */
type EntryUpdater<T extends LogEntry> = (updater: (draft: T) => void) => void;

function dispatchedView(entry: LogEntry, updateEntry: EntryUpdater<LogEntry>, model: LogViewEditor) {
    switch (entry.type) {
        case "input.confirm":
            return <ConfirmDialogView model={model} entry={entry as ConfirmEntry} />;
        case "input.text":
            return (
                <TextInputDialogView
                    model={model}
                    entry={entry as TextInputEntry}
                    updateEntry={updateEntry as EntryUpdater<TextInputEntry>}
                />
            );
        case "input.buttons":
            return <ButtonsDialogView model={model} entry={entry as ButtonsEntry} />;
        case "input.checkboxes":
            return (
                <CheckboxesDialogView
                    model={model}
                    entry={entry as CheckboxesEntry}
                    updateEntry={updateEntry as EntryUpdater<CheckboxesEntry>}
                />
            );
        case "input.radioboxes":
            return (
                <RadioboxesDialogView
                    model={model}
                    entry={entry as RadioboxesEntry}
                    updateEntry={updateEntry as EntryUpdater<RadioboxesEntry>}
                />
            );
        case "input.select":
            return (
                <SelectDialogView
                    model={model}
                    entry={entry as SelectEntry}
                    updateEntry={updateEntry as EntryUpdater<SelectEntry>}
                />
            );
        case "output.progress":
            return <ProgressOutputView entry={entry as ProgressOutputEntry} />;
        case "output.grid":
            return <GridOutputView model={model} entry={entry as GridOutputEntry} />;
        case "output.text":
            return <TextOutputView entry={entry as TextOutputEntry} />;
        case "output.markdown":
            return <MarkdownOutputView entry={entry as MarkdownOutputEntry} />;
        case "output.mermaid":
            return <MermaidOutputView entry={entry as MermaidOutputEntry} />;
        case "output.mcp-request":
            return <McpRequestView entry={entry as McpRequestEntry} />;
    }

    if (entry.type.startsWith("input.")) {
        return <DialogEntryStub entry={entry} />;
    }
    if (isOutputEntry(entry)) {
        return <OutputEntryStub entry={entry} />;
    }
    return <UnknownEntryView entry={entry} />;
}

// =============================================================================
// Router
// =============================================================================

interface LogEntryContentProps {
    model: LogViewEditor;
    entry: LogEntry;
    updateEntry: (updater: (draft: LogEntry) => void) => void;
}

export function LogEntryContent({ model, entry, updateEntry }: LogEntryContentProps) {
    return (
        <EntryErrorBoundary entry={entry}>
            <LogEntryContentInner model={model} entry={entry} updateEntry={updateEntry} />
        </EntryErrorBoundary>
    );
}

function LogEntryContentInner({ model, entry, updateEntry }: LogEntryContentProps) {
    if (isLogEntry(entry)) {
        return <LogMessageView entry={entry} />;
    }
    const view = dispatchedView(entry, updateEntry, model);
    if (isDialogEntry(entry) || isOutputEntry(entry)) {
        return <Panel name="log-item-wrapper" paddingY="xs">{view}</Panel>;
    }
    return view;
}
