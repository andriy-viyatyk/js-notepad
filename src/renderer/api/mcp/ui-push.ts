import { LogViewEditor } from "../../editors/log-view";
import type { LogEntry } from "../../editors/log-view/logTypes";
import { csvToRecords } from "../../core/utils/csv-utils";
import { pagesModel } from "../pages";
import type { McpParams, McpResponse } from "./types";

interface DialogSpec {
    props: Set<string>;
    required?: string;
    usage: string;
}

const DIALOG_SPECS: Record<string, DialogSpec> = {
    "input.confirm": {
        props: new Set(["id", "message", "buttons"]),
        required: "message",
        usage: '{ type: "input.confirm", message: "Continue?", buttons: ["No", "Yes"] }',
    },
    "input.text": {
        props: new Set(["id", "title", "placeholder", "defaultValue", "buttons"]),
        usage: '{ type: "input.text", title: "Enter name", placeholder: "Name...", buttons: ["Cancel", "OK"] }',
    },
    "input.buttons": {
        props: new Set(["id", "title", "buttons"]),
        required: "buttons",
        usage: '{ type: "input.buttons", title: "Choose action", buttons: ["Save", "Discard", "Cancel"] }',
    },
    "input.checkboxes": {
        props: new Set(["id", "title", "items", "layout", "buttons"]),
        required: "items",
        usage: '{ type: "input.checkboxes", title: "Select", items: [{ label: "A", checked: true }, { label: "B" }], buttons: ["Cancel", "OK"] }',
    },
    "input.radioboxes": {
        props: new Set(["id", "title", "items", "checked", "layout", "buttons"]),
        required: "items",
        usage: '{ type: "input.radioboxes", title: "Pick one", items: ["Small", "Medium", "Large"], buttons: ["Cancel", "OK"] }',
    },
    "input.select": {
        props: new Set(["id", "title", "items", "selected", "placeholder", "buttons"]),
        required: "items",
        usage: '{ type: "input.select", title: "Format", items: ["JSON", "CSV", "XML"], placeholder: "Choose...", buttons: ["Cancel", "OK"] }',
    },
};

async function getOrCreateMcpLogViewEditor(): Promise<LogViewEditor> {
    const page = await pagesModel.requireWellKnownPage("mcp-ui-log");
    const editor = page.mainEditorInstance;
    if (!(editor instanceof LogViewEditor)) {
        throw new Error("MCP log page is not a LogViewEditor");
    }
    return editor;
}

export async function handleUiPush(params: McpParams): Promise<McpResponse> {
    const entries = params?.entries;
    if (!Array.isArray(entries)) {
        return { error: { code: -32602, message: "Missing or invalid 'entries' parameter" } };
    }

    const editor = await getOrCreateMcpLogViewEditor();
    const dialogPromises: Promise<LogEntry>[] = [];

    for (const raw of entries) {
        const entry = typeof raw === "string" ? { type: "log.info", text: raw } : raw;
        if (!entry || typeof entry !== "object" || !entry.type) continue;

        const { type, ...fields } = entry;
        if (typeof type === "string" && type.startsWith("input.")) {
            const spec = DIALOG_SPECS[type];
            if (!spec) {
                const validTypes = Object.keys(DIALOG_SPECS).join(", ");
                return { error: { code: -32602, message: `Unknown dialog type '${type}'. Valid types: ${validTypes}. Read persephone://guides/ui-push for details.` } };
            }
            const unknownProps = Object.keys(fields).filter((key) => !spec.props.has(key));
            if (unknownProps.length > 0) {
                return { error: { code: -32602, message: `Unknown properties for ${type}: ${unknownProps.join(", ")}. Correct usage: ${spec.usage}` } };
            }
            if (spec.required && !fields[spec.required]) {
                const requiredType = spec.required === "items" ? "array" : "string";
                return { error: { code: -32602, message: `${type} requires '${spec.required}' (${requiredType}). Correct usage: ${spec.usage}` } };
            }
            if (spec.required === "items" && !Array.isArray(fields.items)) {
                return { error: { code: -32602, message: `${type} 'items' must be an array. Correct usage: ${spec.usage}` } };
            }
            dialogPromises.push(editor.addDialogEntry(type, fields));
        } else if (type === "output.grid") {
            if (!fields.content) {
                return { error: { code: -32602, message: `output.grid requires 'content' field (JSON string or CSV string). Example: { type: "output.grid", content: "[{\\"name\\":\\"A\\",\\"value\\":1}]", title: "My Table" }` } };
            }
            if (typeof fields.content !== "string") {
                return { error: { code: -32602, message: `output.grid 'content' must be a string (JSON array or CSV text), not ${typeof fields.content}. Stringify your data: content: JSON.stringify(data). Example: { type: "output.grid", content: "[{\\"name\\":\\"A\\",\\"value\\":1}]", contentType: "json", title: "My Table" }` } };
            }
            const contentType = fields.contentType ?? "json";
            let data: unknown[];
            if (contentType === "csv") {
                data = csvToRecords(fields.content, true, ",");
            } else {
                try {
                    data = JSON.parse(fields.content);
                } catch {
                    return { error: { code: -32602, message: `output.grid 'content' is not valid JSON. Content must be a JSON array string, e.g.: "[{\\"name\\":\\"A\\",\\"value\\":1}]"` } };
                }
                if (!Array.isArray(data)) {
                    return { error: { code: -32602, message: `output.grid 'content' must be a JSON array, got ${typeof data}. Example: "[{\\"name\\":\\"A\\",\\"value\\":1}]"` } };
                }
            }
            const { content: _, contentType: _contentType, ...rest } = fields;
            editor.addEntry(type, { ...rest, data });
        } else if (typeof type === "string" && type.startsWith("output.")) {
            if (!fields.text && fields.content && (type === "output.text" || type === "output.markdown" || type === "output.mermaid")) {
                fields.text = fields.content;
                delete fields.content;
            }
            editor.addEntry(type, fields);
        } else {
            editor.addEntry(type, fields.text ?? "");
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
