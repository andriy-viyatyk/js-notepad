// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = require("electron");
import { scriptRunner } from "../scripting/ScriptRunner";
import { pagesModel } from "./pages";
import { editorRegistry } from "../editors/registry";
import { MCP_EXECUTE, MCP_RESULT } from "../../shared/constants";
import { app } from "./app";
import { LogViewEditor } from "../editors/log-view";
import type { LogEntry, McpRequestEntry } from "../editors/log-view/logTypes";
import { csvToRecords } from "../core/utils/csv-utils";

// ── Types ───────────────────────────────────────────────────────────

interface McpResponse {
    result?: any;
    error?: { code: number; message: string; data?: any };
}

// ── Command Dispatcher ──────────────────────────────────────────────

async function handleCommand(method: string, params: any): Promise<McpResponse> {
    switch (method) {
        case "execute_script":
            return executeScript(params);
        case "get_pages":
            return { result: getPages() };
        case "get_page_content":
            return getPageContent(params);
        case "get_active_page":
            return { result: getActivePage() };
        case "create_page":
            return createPage(params);
        case "set_page_content":
            return setPageContent(params);
        case "get_app_info":
            return { result: getAppInfo() };
        case "open_url":
            return await openUrl(params);
        case "ui_push":
            return handleUiPush(params);
        default:
            // Browser automation (Playwright-compatible) — delegated to automation layer
            if (method.startsWith("browser_")) {
                const { handleBrowserCommand } = await import("../automation/commands");
                return handleBrowserCommand(method, params);
            }
            return { error: { code: -32601, message: `Method not found: ${method}` } };
    }
}

// ── Command Implementations ─────────────────────────────────────────

async function executeScript(params: any): Promise<McpResponse> {
    const script = params?.script;
    if (!script || typeof script !== "string") {
        return { error: { code: -32602, message: "Missing or invalid 'script' parameter" } };
    }

    const pageId = params?.pageId;
    const language = params?.language;
    const pageModel = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;

    // scriptRunner expects a legacy EditorModel; unwrap adapter or pass undefined.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorForScript = pageModel?.mainEditor as any;
    const result = await scriptRunner.runWithCapture(script, editorForScript ?? undefined, language);

    return {
        result: {
            text: result.text,
            language: result.language,
            isError: result.isError,
            consoleLogs: result.consoleLogs,
        },
    };
}

function getPages(): any[] {
    const pages = pagesModel.state.get().pages;
    return pages.map((p) => {
        const editorV4 = p.mainEditorV4;
        const editorState = p.mainEditor?.state.get() as
            | { language?: string; filePath?: string }
            | undefined;
        const textHost = pagesModel.getTextFileHost(p.id);
        return {
            id: p.id,
            title: p.title,
            editor: editorV4?.editorId,
            language: textHost?.state.get().language ?? editorState?.language,
            filePath: textHost?.state.get().filePath ?? editorState?.filePath,
            modified: p.modified,
            pinned: p.pinned,
            active: p === pagesModel.activePage,
        };
    });
}

function getPageContent(params: any): McpResponse {
    const pageId = params?.pageId;
    if (!pageId) {
        return { error: { code: -32602, message: "Missing 'pageId' parameter" } };
    }

    const page = pagesModel.findPage(pageId);
    if (!page) {
        return { error: { code: -32602, message: `Page not found: ${pageId}` } };
    }

    const textHost = pagesModel.getTextFileHost(page.id);
    const content = textHost ? textHost.state.get().content : "";

    return {
        result: {
            id: page.id,
            title: page.title,
            content,
        },
    };
}

function getActivePage(): any {
    const page = pagesModel.activePage;
    if (!page) return null;

    const editorV4 = page.mainEditorV4;
    const editorState = page.mainEditor?.state.get() as
        | { language?: string; filePath?: string }
        | undefined;
    const textHost = pagesModel.getTextFileHost(page.id);
    const content = textHost ? textHost.state.get().content : "";

    return {
        id: page.id,
        title: page.title,
        editor: editorV4?.editorId,
        language: textHost?.state.get().language ?? editorState?.language,
        filePath: textHost?.state.get().filePath ?? editorState?.filePath,
        modified: page.modified,
        content,
    };
}

function createPage(params: any): McpResponse {
    const content = params?.content ?? "";
    const language = params?.language ?? "plaintext";
    const editor = params?.editor ?? "monaco";
    const title = params?.title ?? "Untitled";

    const editorDef = editorRegistry.getById(editor);
    if (!editorDef) {
        const all = editorRegistry.getAll().map((e) => e.id);
        return { error: { code: -32602, message: `Unknown editor '${editor}'. Valid editors: ${all.join(", ")}` } };
    }

    if (editorDef.category === "standalone") {
        const hints: Record<string, string> = {
            "browser-view": "Use the open_url tool to open a URL in the built-in browser.",
            "pdf-view": 'Use execute_script with: await app.pages.openFile("/path/to/file.pdf")',
            "image-view": 'Use execute_script with: await app.pages.openFile("/path/to/image.png")',
            "archive-view": 'Use execute_script with: await app.pages.openFile("/path/to/archive.zip")',
            "mcp-view": "Use execute_script with: await app.pages.showMcpInspectorPage() "
                + "or await app.pages.showMcpInspectorPage({ url: \"http://host:port/mcp\" })",
            "about-view": "Use execute_script with: await app.pages.showAboutPage()",
            "settings-view": "Use execute_script with: await app.pages.showSettingsPage()",
            "log-view": 'Use ui_push to write entries to the MCP log page, or execute_script with: '
                + 'await app.pages.requireWellKnownPage("mcp-ui-log")',
        };
        const hint = hints[editor]
            ?? `Read resource 'notepad://guides/pages' for details on editor types.`;
        return {
            error: {
                code: -32602,
                message: `Editor '${editor}' is a standalone editor and cannot be created with create_page. `
                    + `Standalone editors require specialized models. ${hint}`,
            },
        };
    }

    const page = pagesModel.addEditorPage(editor, language, title, content || undefined);

    const editorV4 = page.mainEditorV4;
    const editorState = page.mainEditor?.state.get() as { language?: string } | undefined;
    const textHost = pagesModel.getTextFileHost(page.id);
    return {
        result: {
            id: page.id,
            title: page.title,
            editor: editorV4?.editorId,
            language: textHost?.state.get().language ?? editorState?.language,
        },
    };
}

function setPageContent(params: any): McpResponse {
    const pageId = params?.pageId;
    if (!pageId) {
        return { error: { code: -32602, message: "Missing 'pageId' parameter" } };
    }

    const content = params?.content;
    if (content == null || typeof content !== "string") {
        return { error: { code: -32602, message: "Missing or invalid 'content' parameter" } };
    }

    const page = pagesModel.findPage(pageId);
    if (!page) {
        return { error: { code: -32602, message: `Page not found: ${pageId}` } };
    }

    const textHost = pagesModel.getTextFileHost(page.id);
    if (!textHost) {
        return {
            error: {
                code: -32602,
                message: "Page is not a text-based page. Use execute_script with page facades (asGrid, asNotebook, etc.) for structured editors.",
            },
        };
    }

    textHost.changeContent(content);
    return { result: { id: page.id, title: page.title, contentLength: content.length } };
}

// ── Active MCP Log Page ────────────────────────────────────────────

const MCP_UI_LOG_ID = "mcp-ui-log";

async function getOrCreateMcpLogViewEditor(): Promise<LogViewEditor> {
    const page = await pagesModel.requireWellKnownPage(MCP_UI_LOG_ID);
    const editor = page.mainEditorV4;
    if (!(editor instanceof LogViewEditor)) {
        throw new Error("MCP log page is not a LogViewEditor");
    }
    return editor;
}

// ── MCP Request Log ───────────────────────────────────────────────

const MAX_REQUEST_LOG_ENTRIES = 200;
const requestHistory: McpRequestEntry[] = [];

function logIncomingRequest(
    method: string,
    params: any,
    response: McpResponse,
    durationMs: number,
): void {
    requestHistory.push({
        type: "output.mcp-request",
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        direction: "incoming",
        method,
        params,
        result: response.result ?? null,
        error: response.error?.message ?? null,
        durationMs,
    });
    if (requestHistory.length > MAX_REQUEST_LOG_ENTRIES) {
        requestHistory.splice(0, requestHistory.length - MAX_REQUEST_LOG_ENTRIES);
    }

    // If the live request log page is open, push the entry to it
    const logPage = pagesModel.findPage("mcp-server-log");
    const logEditor = logPage?.mainEditorV4;
    if (logEditor instanceof LogViewEditor) {
        logEditor.addEntry("output.mcp-request", requestHistory[requestHistory.length - 1]);
    }
}

/** Show the MCP server request log page (creates if needed, backfills history). */
export async function showMcpRequestLog(): Promise<void> {
    const page = await pagesModel.requireWellKnownPage("mcp-server-log");
    const editor = page.mainEditorV4;
    if (!(editor instanceof LogViewEditor)) return;

    // Backfill history if the page was just created (empty)
    if (editor.entryCount === 0 && requestHistory.length > 0) {
        for (const entry of requestHistory) {
            editor.addEntry("output.mcp-request", entry);
        }
    }
}

// ── ui_push Handler ────────────────────────────────────────────────

async function handleUiPush(params: any): Promise<McpResponse> {
    const entries = params?.entries;
    if (!Array.isArray(entries)) {
        return { error: { code: -32602, message: "Missing or invalid 'entries' parameter" } };
    }

    const editor = await getOrCreateMcpLogViewEditor();
    const dialogPromises: Promise<LogEntry>[] = [];

    for (const raw of entries) {
        // Normalize: string shorthand → log.info
        const entry = typeof raw === "string"
            ? { type: "log.info", text: raw }
            : raw;

        if (!entry || typeof entry !== "object" || !entry.type) continue;

        const { type, ...fields } = entry;
        if (typeof type === "string" && type.startsWith("input.")) {
            // Dialog validation: known properties and usage examples per type
            const dialogSpecs: Record<string, { props: Set<string>; required?: string; usage: string }> = {
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

            // Validate known dialog type
            const spec = dialogSpecs[type];
            if (!spec) {
                const validTypes = Object.keys(dialogSpecs).join(", ");
                return { error: { code: -32602, message: `Unknown dialog type '${type}'. Valid types: ${validTypes}. Read notepad://guides/ui-push for details.` } };
            }

            // Validate no unknown properties
            const unknownProps = Object.keys(fields).filter((k) => !spec.props.has(k));
            if (unknownProps.length > 0) {
                return { error: { code: -32602, message: `Unknown properties for ${type}: ${unknownProps.join(", ")}. Correct usage: ${spec.usage}` } };
            }

            // Validate required fields
            if (spec.required && !fields[spec.required]) {
                const reqType = spec.required === "items" ? "array" : "string";
                return { error: { code: -32602, message: `${type} requires '${spec.required}' (${reqType}). Correct usage: ${spec.usage}` } };
            }
            if (spec.required === "items" && !Array.isArray(fields.items)) {
                return { error: { code: -32602, message: `${type} 'items' must be an array. Correct usage: ${spec.usage}` } };
            }
            dialogPromises.push(editor.addDialogEntry(type, fields));
        } else if (type === "output.grid") {
            // MCP sends: { content: string, contentType?: "csv" | "json", title? }
            // Parse content to data[] before storing in the entry
            if (!fields.content) {
                return { error: { code: -32602, message: `output.grid requires 'content' field (JSON string or CSV string). Example: { type: "output.grid", content: "[{\\"name\\":\\"A\\",\\"value\\":1}]", title: "My Table" }` } };
            }
            if (typeof fields.content !== "string") {
                return { error: { code: -32602, message: `output.grid 'content' must be a string (JSON array or CSV text), not ${typeof fields.content}. Stringify your data: content: JSON.stringify(data). Example: { type: "output.grid", content: "[{\\"name\\":\\"A\\",\\"value\\":1}]", contentType: "json", title: "My Table" }` } };
            }
            const contentType = fields.contentType ?? "json";
            let data: any[];
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
            const { content: _, contentType: _ct, ...rest } = fields;
            editor.addEntry(type, { ...rest, data });
        } else if (typeof type === "string" && type.startsWith("output.")) {
            // Output entry — normalize "content" → "text" for text-based output types
            // (common LLM mistake: sending { content: "..." } instead of { text: "..." })
            if (!fields.text && fields.content && (type === "output.text" || type === "output.markdown" || type === "output.mermaid")) {
                fields.text = fields.content;
                delete fields.content;
            }
            editor.addEntry(type, fields);
        } else {
            // Log entry — pass text only
            editor.addEntry(type, fields.text ?? "");
        }
    }

    if (dialogPromises.length === 0) {
        return { result: {} };
    }

    // Wait for ALL dialogs to be resolved by the user
    const dialogResults = await Promise.all(dialogPromises);

    // Convert undefined → null for JSON serialization
    const results = dialogResults.map((r) => {
        const obj: Record<string, any> = { ...r };
        if (obj.button === undefined) {
            obj.button = null;
        }
        return obj;
    });

    return { result: { results } };
}

// ── App Info ───────────────────────────────────────────────────────

function getAppInfo(): any {
    const pages = pagesModel.state.get().pages;
    return {
        version: app.version,
        pageCount: pages.length,
        activePageId: pagesModel.activePage?.id ?? null,
    };
}

// ── Open URL ────────────────────────────────────────────────────────

async function openUrl(params: any): Promise<McpResponse> {
    const url = params?.url;
    if (!url || typeof url !== "string") {
        return { error: { code: -32602, message: "Missing or invalid 'url' parameter" } };
    }
    await pagesModel.openUrlInBrowserTab(url, {
        profileName: params?.profileName,
        incognito: params?.incognito,
    });
    return { result: { opened: url } };
}

// ── Initialization ──────────────────────────────────────────────────

export function initMcpHandler(): void {
    ipcRenderer.on(MCP_EXECUTE, async (_event: any, requestId: string, method: string, params: any) => {
        const startTime = Date.now();
        let response: McpResponse;
        try {
            response = await handleCommand(method, params);
        } catch (err: any) {
            response = { error: { code: -32603, message: err.message || "Internal error" } };
        }
        logIncomingRequest(method, params, response, Date.now() - startTime);
        ipcRenderer.send(MCP_RESULT, requestId, response);
    });
}
