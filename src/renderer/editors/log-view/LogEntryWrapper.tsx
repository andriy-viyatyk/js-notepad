import { RefObject, useCallback } from "react";
import { LogEntry } from "./logTypes";
import { LogEntryContent } from "./LogEntryContent";
import type { LogViewEditor } from "./LogViewEditor";
import { Panel, Text } from "../../uikit";

// =============================================================================
// Helpers
// =============================================================================

function accentForEntryType(type: string): "info" | "warn" | "error" | "success" | undefined {
    switch (type) {
        case "log.info":    return "info";
        case "log.warn":    return "warn";
        case "log.error":   return "error";
        case "log.success": return "success";
        default: return undefined;
    }
}

function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
}

// =============================================================================
// Component
// =============================================================================

interface LogEntryWrapperProps {
    vm: LogViewEditor;
    index: number;
    cellRef?: RefObject<HTMLDivElement>;
    showTimestamp?: boolean;
}

export function LogEntryWrapper({ vm, index, cellRef, showTimestamp }: LogEntryWrapperProps) {
    const entry = vm.state.use((s) => s.entries[index]);

    const updateEntry = useCallback(
        (updater: (draft: LogEntry) => void) => {
            vm.updateEntryAt(index, updater);
        },
        [vm, index],
    );

    if (!entry) return null;

    return (
        <Panel
            name="log-entry-wrapper"
            ref={cellRef}
            direction="row"
            align="start"
            paddingX="lg"
            gap="md"
            accent={accentForEntryType(entry.type)}
            width="100%"
            height="fit-content"
        >
            {showTimestamp && entry.timestamp != null && (
                <Text
                    name="entry-timestamp"
                    size="md"
                    color="light"
                    nowrap
                >
                    {formatTimestamp(entry.timestamp)}
                </Text>
            )}
            <Panel name="entry-content" flex={1} minWidth={0} direction="column">
                <LogEntryContent model={vm} entry={entry} updateEntry={updateEntry} />
            </Panel>
        </Panel>
    );
}
