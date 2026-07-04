// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = require("electron");
import type { IpcRendererEvent } from "electron";
import { scriptRunner } from "../scripting/ScriptRunner";
import { pagesModel } from "./pages";
import { editorRegistry } from "../editors/base/editorRegistry";
import type { BoardEditorModel } from "../editors/board/BoardEditorModel";
import { MCP_EXECUTE, MCP_RESULT } from "../../shared/constants";
import { app } from "./app";
import { settings } from "./settings";
import { LogViewEditor } from "../editors/log-view";
import type { LogEntry, McpRequestEntry } from "../editors/log-view/logTypes";
import { csvToRecords } from "../core/utils/csv-utils";
import type { EditorView } from "./types/common";
import { api } from "../../ipc/renderer/api";
import { fpJoin } from "../core/utils/file-path";
import type { RegisteredTool } from "./tools/registered-tools";

// ── Types ───────────────────────────────────────────────────────────

interface McpResponse {
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

/** JSON-RPC params: object-or-null shape per spec. Handlers narrow as needed. */
type McpParams = Record<string, unknown> | null | undefined;

interface McpPageInfo {
    id: string;
    title: string;
    editor?: string;
    language?: string;
    filePath?: string;
    modified: boolean;
    pinned: boolean;
    active: boolean;
    /** Browser pages only (editor === "browser-view") */
    profileName?: string;   // "" = default profile
    isIncognito?: boolean;
    isTor?: boolean;
    url?: string;           // ACTIVE TAB's URL (a browser page hosts multiple internal
                            // tabs; browser_tabs lists them all) — omitted for
                            // incognito/tor pages (privacy)
    /** Board pages only (editor === "board-view") — these are automatable by the
     *  browser_* tools (EPIC-034 / US-730); target by this page's id. */
    boardRoot?: string;
    selectedBoard?: string;
}

interface McpActivePage {
    id: string;
    title: string;
    editor?: string;
    language?: string;
    filePath?: string;
    modified: boolean;
    content: string;
    /** Browser pages only (editor === "browser-view") */
    profileName?: string;   // "" = default profile
    isIncognito?: boolean;
    isTor?: boolean;
    url?: string;           // ACTIVE TAB's URL — omitted for incognito/tor pages (privacy)
}

interface McpAppInfo {
    version: string;
    pageCount: number;
    activePageId: string | null;
    browserProfiles: string[];        // configured profile names
    defaultBrowserProfile: string;    // "" = built-in default
    // Board authoring resources (US-756). The boards-assets skins are NOT bundled
    // in the installer — they live on GitHub, fetchable via the raw base URL below.
    resourcesDir: string;             // install resources root (repo root in dev)
    demoBoardDir: string;             // bundled demo board template (read-only reference)
    boardsAssetsBaseUrl: string;      // raw GitHub base for boards-assets/ (skins + manifest)
    boardsManifestUrl: string;        // boardsAssetsBaseUrl + "manifest.json"
}

/** Raw GitHub base for the boards-assets catalog — must match `baseUrl` in
 *  `boards-assets/manifest.json` (pinned to `main`; see US-756). Skins are not
 *  bundled in the installer, so this is the canonical fetch location. */
const BOARDS_ASSETS_BASE_URL =
    "https://raw.githubusercontent.com/andriy-viyatyk/persephone/main/boards-assets/";

// ── Param narrowing helpers ─────────────────────────────────────────

function asString(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
}

function asBoolean(v: unknown): boolean | undefined {
    return typeof v === "boolean" ? v : undefined;
}

// ── Command Dispatcher ──────────────────────────────────────────────

async function handleCommand(method: string, params: McpParams): Promise<McpResponse> {
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
            return { result: await getAppInfo() };
        case "open_url":
            return await openUrl(params);
        case "create_board":
            return await createBoard(params);
        case "open_board":
            return await openBoard(params);
        case "board_refresh":
            return refreshBoard(params);
        case "search_tools":
            return await searchTools(params);
        case "execute_tool":
            return await executeToolCmd(params);
        case "refresh_toolset":
            return await refreshToolset(params);
        case "create_toolset":
            return await createToolsetCmd(params);
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

async function executeScript(params: McpParams): Promise<McpResponse> {
    const script = asString(params?.script);
    if (!script) {
        return { error: { code: -32602, message: "Missing or invalid 'script' parameter" } };
    }

    const pageId = asString(params?.pageId);
    const language = asString(params?.language);
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

function getPages(): McpPageInfo[] {
    const pages = pagesModel.state.get().pages;
    return pages.map((p) => {
        const editor = p.mainEditorInstance;
        const editorState = p.mainEditor?.state.get() as
            | { language?: string; filePath?: string }
            | undefined;
        const textHost = pagesModel.getTextFileHost(p.id);
        const result: McpPageInfo = {
            id: p.id,
            title: p.title,
            editor: editor?.editorId,
            language: textHost?.state.get().language ?? editorState?.language,
            filePath: textHost?.state.get().filePath ?? editorState?.filePath,
            modified: p.modified,
            pinned: p.pinned,
            active: p === pagesModel.activePage,
        };

        // Browser pages: surface profile identity (structural read — do NOT import
        // BrowserEditor here; mcp-handler loads at startup, the browser chunk must not)
        if (editor?.editorId === "browser-view") {
            const bs = p.mainEditor?.state.get() as
                | { profileName?: string; isIncognito?: boolean; isTor?: boolean; url?: string }
                | undefined;
            const isIncognito = !!bs?.isIncognito;
            const isTor = !!bs?.isTor;
            result.profileName = bs?.profileName ?? "";
            result.isIncognito = isIncognito;
            result.isTor = isTor;
            if (!isIncognito && !isTor) result.url = bs?.url;   // privacy: no incognito/tor URLs
        }

        // Board pages: surface the boards container / single-board root + open board
        // so an agent can pick the right board to drive via the browser_* tools
        // (structural read).
        if (editor?.editorId === "board-view") {
            const bs = p.mainEditor?.state.get() as
                | { boardRoot?: string; selectedBoard?: string }
                | undefined;
            result.boardRoot = bs?.boardRoot;
            result.selectedBoard = bs?.selectedBoard;
        }

        return result;
    });
}

function getPageContent(params: McpParams): McpResponse {
    const pageId = asString(params?.pageId);
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

function getActivePage(): McpActivePage | null {
    const page = pagesModel.activePage;
    if (!page) return null;

    const editor = page.mainEditorInstance;
    const editorState = page.mainEditor?.state.get() as
        | { language?: string; filePath?: string }
        | undefined;
    const textHost = pagesModel.getTextFileHost(page.id);
    const content = textHost ? textHost.state.get().content : "";

    const result: McpActivePage = {
        id: page.id,
        title: page.title,
        editor: editor?.editorId,
        language: textHost?.state.get().language ?? editorState?.language,
        filePath: textHost?.state.get().filePath ?? editorState?.filePath,
        modified: page.modified,
        content,
    };

    // Browser pages: surface profile identity (structural read — do NOT import
    // BrowserEditor here; mcp-handler loads at startup, the browser chunk must not)
    if (editor?.editorId === "browser-view") {
        const bs = page.mainEditor?.state.get() as
            | { profileName?: string; isIncognito?: boolean; isTor?: boolean; url?: string }
            | undefined;
        const isIncognito = !!bs?.isIncognito;
        const isTor = !!bs?.isTor;
        result.profileName = bs?.profileName ?? "";
        result.isIncognito = isIncognito;
        result.isTor = isTor;
        if (!isIncognito && !isTor) result.url = bs?.url;   // privacy: no incognito/tor URLs
    }

    return result;
}

function createPage(params: McpParams): McpResponse {
    const content = asString(params?.content) ?? "";
    const language = asString(params?.language) ?? "plaintext";
    const editorId = asString(params?.editor) ?? "monaco";
    const title = asString(params?.title) ?? "Untitled";

    const editorDef = editorRegistry.getById(editorId);
    if (!editorDef) {
        const all = editorRegistry.getAll().map((e) => e.id);
        return { error: { code: -32602, message: `Unknown editor '${editorId}'. Valid editors: ${all.join(", ")}` } };
    }

    if (!editorDef.hasContentHost) {
        const hints: Record<string, string> = {
            "browser-view": "Use the open_url tool to open a URL in the built-in browser.",
            "pdf-view": 'Use execute_script with: await app.pages.openFile("/path/to/file.pdf")',
            "image-view": 'Use execute_script with: await app.pages.openFile("/path/to/image.png")',
            "archive-view": 'Use execute_script with: await app.pages.openFile("/path/to/archive.zip")',
            "video-view": 'Use execute_script with: await app.pages.openFile("/path/to/video.mp4")',
            "mcp-view": "Use execute_script with: await app.pages.showMcpInspectorPage() "
                + "or await app.pages.showMcpInspectorPage({ url: \"http://host:port/mcp\" })",
            "about-view": "Use execute_script with: await app.pages.showAboutPage()",
            "settings-view": "Use execute_script with: await app.pages.showSettingsPage()",
            "log-view": 'Use ui_push to write entries to the MCP log page, or execute_script with: '
                + 'await app.pages.requireWellKnownPage("mcp-ui-log")',
        };
        const hint = hints[editorId]
            ?? `Read resource 'notepad://guides/pages' for details on editor types.`;
        return {
            error: {
                code: -32602,
                message: `Editor '${editorId}' is a standalone editor and cannot be created with create_page. `
                    + `Standalone editors require specialized models. ${hint}`,
            },
        };
    }

    // Editor string was validated against the registry above, so the cast to
    // the EditorView union is safe at this point.
    const page = pagesModel.addEditorPage(editorId as EditorView, language, title, content || undefined);

    const editor = page.mainEditorInstance;
    const editorState = page.mainEditor?.state.get() as { language?: string } | undefined;
    const textHost = pagesModel.getTextFileHost(page.id);
    return {
        result: {
            id: page.id,
            title: page.title,
            editor: editor?.editorId,
            language: textHost?.state.get().language ?? editorState?.language,
        },
    };
}

function setPageContent(params: McpParams): McpResponse {
    const pageId = asString(params?.pageId);
    if (!pageId) {
        return { error: { code: -32602, message: "Missing 'pageId' parameter" } };
    }

    const content = asString(params?.content);
    if (content == null) {
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
    const editor = page.mainEditorInstance;
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
    params: McpParams,
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
    const logEditor = logPage?.mainEditorInstance;
    if (logEditor instanceof LogViewEditor) {
        logEditor.addEntry("output.mcp-request", requestHistory[requestHistory.length - 1]);
    }
}

/** Show the MCP server request log page (creates if needed, backfills history). */
export async function showMcpRequestLog(): Promise<void> {
    const page = await pagesModel.requireWellKnownPage("mcp-server-log");
    const editor = page.mainEditorInstance;
    if (!(editor instanceof LogViewEditor)) return;

    // Backfill history if the page was just created (empty)
    if (editor.entryCount === 0 && requestHistory.length > 0) {
        for (const entry of requestHistory) {
            editor.addEntry("output.mcp-request", entry);
        }
    }
}

// ── ui_push Handler ────────────────────────────────────────────────

async function handleUiPush(params: McpParams): Promise<McpResponse> {
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
        const obj: Record<string, unknown> = { ...r };
        if (obj.button === undefined) {
            obj.button = null;
        }
        return obj;
    });

    return { result: { results } };
}

// ── App Info ───────────────────────────────────────────────────────

async function getAppInfo(): Promise<McpAppInfo> {
    const pages = pagesModel.state.get().pages;
    // App root: process.resourcesPath when packaged, repo root in dev. The bundled
    // assets (incl. the demo board) live under `<root>/assets/` in both modes.
    const resourcesDir = await api.getAppRootPath();
    return {
        version: app.version,
        pageCount: pages.length,
        activePageId: pagesModel.activePage?.id ?? null,
        browserProfiles: settings.get("browser-profiles").map((p) => p.name),
        defaultBrowserProfile: settings.get("browser-default-profile"),
        resourcesDir,
        demoBoardDir: fpJoin(resourcesDir, "assets", "demo-board"),
        boardsAssetsBaseUrl: BOARDS_ASSETS_BASE_URL,
        boardsManifestUrl: BOARDS_ASSETS_BASE_URL + "manifest.json",
    };
}

// ── Open URL ────────────────────────────────────────────────────────

async function openUrl(params: McpParams): Promise<McpResponse> {
    const url = asString(params?.url);
    if (!url) {
        return { error: { code: -32602, message: "Missing or invalid 'url' parameter" } };
    }
    await pagesModel.openUrlInBrowserTab(url, {
        profileName: asString(params?.profileName),
        incognito: asBoolean(params?.incognito),
    });
    return { result: { opened: url } };
}

async function createBoard(params: McpParams): Promise<McpResponse> {
    const name = asString(params?.name);
    const dir = asString(params?.dir);
    if (!name) {
        return { error: { code: -32602, message: "Missing or invalid 'name' parameter" } };
    }
    if (!dir) {
        return { error: { code: -32602, message: "Missing or invalid 'dir' parameter" } };
    }
    try {
        const boardRoot = asBoolean(params?.demo)
            ? await app.boards.createDemoBoard(name, dir)
            : await app.boards.createBoard(name, dir);
        return { result: { boardRoot } };
    } catch (err) {
        return { error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
    }
}

async function openBoard(params: McpParams): Promise<McpResponse> {
    const path = asString(params?.path);
    if (!path) {
        return { error: { code: -32602, message: "Missing or invalid 'path' parameter" } };
    }
    try {
        await app.boards.openBoard(path);
        return { result: { opened: path } };
    } catch (err) {
        return { error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
    }
}

/** Reload a board (remount its webview) so file edits take effect — boards no
 *  longer auto-reload. `pageId` is optional; omitted → the active page. Validates
 *  the resolved page is a board before reloading. */
function refreshBoard(params: McpParams): McpResponse {
    const pageId = asString(params?.pageId);
    const page = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;
    if (!page) {
        return { error: { code: -32602, message: pageId ? `Page not found: ${pageId}` : "No active page." } };
    }
    const editor = page.mainEditorInstance;
    if (!editor || editor.editorId !== "board-view") {
        return { error: { code: -32602, message: `Page ${page.id} is not a board page.` } };
    }
    (editor as BoardEditorModel).reloadBoard();
    return { result: { refreshed: true, pageId: page.id } };
}

// ── Agent Tools registry (EPIC-038 / US-803) ────────────────────────

/** Full, ready-to-call definition surfaced by search_tools. Mirrors an MCP tool
 *  descriptor; NEVER includes .env values or the raw command (EPIC C4 / T-C4). */
interface McpToolDefinition {
    id: string;               // "<toolset>/<tool>" — pass to execute_tool
    toolset: string;
    description: string;
    inputSchema?: object;     // JSON Schema for args (may be absent)
    requirements?: string;    // runtime prerequisites (EPIC C9)
    env?: string[];           // NAMES of required env vars (values live in .env)
    timeoutMs?: number;
    toolsetRoot: string;      // local folder — where to edit the tool (self-repair)
}

function toDefinition(t: RegisteredTool): McpToolDefinition {
    return {
        id: t.id,
        toolset: t.toolsetName,
        description: t.tool.description,
        inputSchema: t.tool.inputSchema,
        requirements: t.tool.requirements,
        env: t.tool.env,
        timeoutMs: t.tool.timeoutMs,
        toolsetRoot: t.toolsetRoot,
    };
}

/** Discover registered tools. Empty query → cheap id+description listing; `select:<id>` →
 *  exact full definition; otherwise a case-insensitive keyword match capped by maxResults. */
async function searchTools(params: McpParams): Promise<McpResponse> {
    const { registeredTools } = await import("./tools/registered-tools");
    await registeredTools.ensureInitialized();
    const all = registeredTools.tools;

    const query = (asString(params?.query) ?? "").trim();
    const maxResults =
        typeof params?.maxResults === "number" && params.maxResults > 0
            ? Math.floor(params.maxResults)
            : 5;

    // Empty query → cheap names+descriptions listing of everything (a list_tools).
    if (!query) {
        return {
            result: {
                total: all.length,
                tools: all.map((t) => ({ id: t.id, description: t.tool.description })),
            },
        };
    }

    // Exact lookup: "select:<toolset>/<tool>" (ToolSearch parity).
    const SELECT = "select:";
    if (query.toLowerCase().startsWith(SELECT)) {
        const wantedRaw = query.slice(SELECT.length).trim();
        const wanted = wantedRaw.toLowerCase();
        const matches = all.filter((t) => t.id.toLowerCase() === wanted);
        return {
            result: {
                total: matches.length,
                tools: matches.map(toDefinition),
                ...(matches.length === 0
                    ? {
                        note: `No tool with id "${wantedRaw}". Call search_tools with an empty query to list all.`,
                    }
                    : {}),
            },
        };
    }

    // Keyword: case-insensitive substring over id + description + tool/toolset keywords.
    const needle = query.toLowerCase();
    const scored = all.filter((t) => {
        const hay = [t.id, t.tool.description, ...(t.tool.keywords ?? [])].join(" ").toLowerCase();
        return hay.includes(needle);
    });
    return {
        result: {
            total: scored.length,
            returned: Math.min(scored.length, maxResults),
            tools: scored.slice(0, maxResults).map(toDefinition),
        },
    };
}

/** Run a registered tool. Returns the full ToolRunResult as `result` even on failure, so the
 *  agent gets stderr + exitCode + toolsetRoot for self-repair (T-C2). Only a protocol fault
 *  (missing toolId) uses the JSON-RPC `error` channel. */
async function executeToolCmd(params: McpParams): Promise<McpResponse> {
    const toolId = asString(params?.toolId);
    if (!toolId) {
        return { error: { code: -32602, message: "Missing or invalid 'toolId' parameter" } };
    }
    // args is an arbitrary JSON object (validated best-effort by the executor, EPIC C12).
    const args = params?.args;

    const { executeToolById } = await import("./tools/tool-executor");
    const runResult = await executeToolById(toolId, args);
    return { result: runResult };
}

/** Re-read registered manifests (the registry does not watch the filesystem). Never registers.
 *  Returns a per-toolset summary so a just-edited manifest's validity is immediately visible. */
async function refreshToolset(params: McpParams): Promise<McpResponse> {
    const path = asString(params?.path);
    const { registeredTools } = await import("./tools/registered-tools");
    await registeredTools.ensureInitialized();
    await registeredTools.refresh(path);

    const toolsets = registeredTools.toolsets.map((ts) => ({
        name: ts.name,
        root: ts.root,
        valid: ts.valid,
        shadowed: ts.shadowed,
        toolCount: ts.manifest?.tools?.length ?? 0,
        errors: ts.errors,
    }));
    return {
        result: {
            refreshed: true,
            toolsetCount: toolsets.length,
            toolCount: registeredTools.tools.length,
            toolsets,
        },
    };
}

/**
 * Ensure a toolset exists at `<dir>/<name>`, then gate registration on a user confirmation dialog
 * (EPIC C3). Idempotent on the folder so a declined registration is recoverable (T-C2/T-C3):
 *   - folder doesn't exist        → scaffold, then show the dialog;
 *   - exists, toolset, unregistered (a prior deny) → RE-OFFER the dialog, WITHOUT re-scaffolding
 *     (any edits the agent made are preserved);
 *   - exists, already registered  → no-op success (no dialog);
 *   - exists, NOT a toolset       → real collision → error (never clobber unrelated content).
 * On Allow: trust + refresh + return the registered tools. On Deny: leave the folder (unregistered
 * → not runnable) and tell the agent it can just call create_toolset again.
 */
async function createToolsetCmd(params: McpParams): Promise<McpResponse> {
    const name = asString(params?.name);
    const dir = asString(params?.dir);
    if (!name) {
        return { error: { code: -32602, message: "Missing or invalid 'name' parameter" } };
    }
    if (!dir) {
        return { error: { code: -32602, message: "Missing or invalid 'dir' parameter" } };
    }

    const toolsetRoot = fpJoin(dir, name);
    const { registeredTools } = await import("./tools/registered-tools");
    const { toolsTrust } = await import("./tools/tools-trust");
    await registeredTools.ensureInitialized(); // also loads toolsTrust state (for isTrusted)

    const { isToolsetFolder, readToolsManifest } = await import("./tools/tools-manifest");
    let created = false;

    if (await isToolsetFolder(toolsetRoot)) {
        // Existing toolset. Already registered → nothing to do. Otherwise fall through and re-offer
        // registration (covers an accidental prior deny) WITHOUT re-scaffolding, so any edits the
        // agent made to the tools are preserved.
        if (toolsTrust.isTrusted(toolsetRoot)) {
            return {
                result: { created: false, registered: true, toolsetRoot, message: "Toolset is already registered." },
            };
        }
    } else {
        // No toolset here yet. createToolset scaffolds — and throws if a NON-toolset folder already
        // occupies the path (a real collision → surfaced as an error).
        try {
            const { createToolset } = await import("./tools/tool-scaffold");
            await createToolset(name, dir);
            created = true;
        } catch (err) {
            return { error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
        }
    }

    const manifest = await readToolsManifest(toolsetRoot);
    const toolList = (manifest?.tools ?? []).map((t) => ({ name: t.name, description: t.description }));

    const { showRegisterToolsetDialog } = await import("../ui/dialogs/RegisterToolsetDialog");
    const allowed = await showRegisterToolsetDialog({
        toolsetName: manifest?.name ?? name,
        toolsetRoot,
        tools: toolList,
    });

    if (!allowed) {
        return {
            result: {
                created,
                registered: false,
                toolsetRoot,
                message:
                    `Toolset is at "${toolsetRoot}" but the user declined registration — its tools ` +
                    `are not runnable yet. If the user asks to enable it, call create_toolset again ` +
                    `with the same name and dir to re-show the confirmation prompt.`,
            },
        };
    }

    await toolsTrust.trust(toolsetRoot);
    await registeredTools.refresh(); // deterministic fresh list (trust also triggers an async refresh)

    return {
        result: {
            created,
            registered: true,
            toolsetRoot,
            toolsetName: manifest?.name ?? name,
            tools: registeredTools.tools
                .filter((t) => t.toolsetRoot === toolsetRoot)
                .map((t) => ({ id: t.id, description: t.tool.description })),
        },
    };
}

// ── Initialization ──────────────────────────────────────────────────

export function initMcpHandler(): void {
    ipcRenderer.on(MCP_EXECUTE, async (
        _event: IpcRendererEvent,
        requestId: string,
        method: string,
        params: McpParams,
    ) => {
        const startTime = Date.now();
        let response: McpResponse;
        try {
            response = await handleCommand(method, params);
        } catch (err) {
            response = { error: { code: -32603, message: (err as Error).message || "Internal error" } };
        }
        logIncomingRequest(method, params, response, Date.now() - startTime);
        ipcRenderer.send(MCP_RESULT, requestId, response);
    });
}
