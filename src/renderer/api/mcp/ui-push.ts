import type { LogEntry } from "../../editors/log-view/logTypes";
import { getOrCreateMcpLogViewEditor } from "./log-view-access";
import {
    normalizeUiPushEntry,
    UiPushValidationError,
} from "./ui-push-validation";
import type { McpParams, McpResponse } from "./types";

export async function handleUiPush(params: McpParams): Promise<McpResponse> {
    const entries = params?.entries;
    if (!Array.isArray(entries)) {
        return { error: { code: -32602, message: "Missing or invalid 'entries' parameter" } };
    }

    const editor = await getOrCreateMcpLogViewEditor();
    const dialogPromises: Promise<LogEntry>[] = [];

    for (const raw of entries) {
        let normalized;
        try {
            normalized = normalizeUiPushEntry(raw);
        } catch (error) {
            if (!(error instanceof UiPushValidationError)) throw error;
            return { error: { code: -32602, message: error.message } };
        }
        if (!normalized) continue;

        if (normalized.isDialog) {
            dialogPromises.push(editor.addDialogEntry(normalized.type, normalized.fields as Record<string, unknown>));
        } else {
            editor.addEntry(normalized.type, normalized.fields);
        }
    }

    if (dialogPromises.length === 0) return { result: {} };

    const results = (await Promise.all(dialogPromises)).map((result) => {
        const entry: Record<string, unknown> = { ...result };
        if (entry.button === undefined) entry.button = null;
        return entry;
    });
    return { result: { results } };
}
