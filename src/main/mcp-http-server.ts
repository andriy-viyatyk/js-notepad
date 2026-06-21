import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { app as electronApp, ipcMain } from "electron";
import { openWindows } from "./open-windows";
import { windowStates } from "./window-states";
import { MCP_EXECUTE, MCP_RESULT } from "../shared/constants";
import { EventEndpoint } from "../ipc/api-types";
import { getAssetPath } from "./utils";

// Lazy-loaded SDK modules (loaded on first startMcpHttpServer call)
let McpServer: typeof import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
let StreamableHTTPServerTransport: typeof import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport;
let isInitializeRequest: typeof import("@modelcontextprotocol/sdk/types.js").isInitializeRequest;
let z: typeof import("zod").z;

async function loadSdk(): Promise<void> {
    if (McpServer) return;
    const [mcpMod, transportMod, typesMod, zodMod] = await Promise.all([
        import("@modelcontextprotocol/sdk/server/mcp.js"),
        import("@modelcontextprotocol/sdk/server/streamableHttp.js"),
        import("@modelcontextprotocol/sdk/types.js"),
        import("zod"),
    ]);
    McpServer = mcpMod.McpServer;
    StreamableHTTPServerTransport = transportMod.StreamableHTTPServerTransport;
    isInitializeRequest = typesMod.isInitializeRequest;
    z = zodMod.z;
}

const DEFAULT_PORT = 7865;
const REQUEST_TIMEOUT_MS = 30_000;

// ── State ───────────────────────────────────────────────────────────

let httpServer: http.Server | undefined;
let ipcInitialized = false;
let requestIdGen = 0;
let currentPort = DEFAULT_PORT;
let browserToolsEnabled = false;
// Renderer→main IPC response shape. `result` / `error` are JSON-RPC-style
// payloads whose shape is method-specific, so they ride as `unknown`.
interface McpResponse { result?: unknown; error?: { code?: number; message: string } }
const pendingRequests = new Map<string, (response: McpResponse) => void>();
const sessions = new Map<string, { server: InstanceType<typeof McpServer>; transport: InstanceType<typeof StreamableHTTPServerTransport> }>();

// ── IPC Bridge (main ↔ renderer) ───────────────────────────────────
// Reuses the same MCP_EXECUTE/MCP_RESULT channels as the old pipe server.

function initMcpIpc(): void {
    if (ipcInitialized) return;
    ipcInitialized = true;

    ipcMain.on(MCP_RESULT, (_event, requestId: string, response: McpResponse) => {
        const resolve = pendingRequests.get(requestId);
        if (resolve) {
            pendingRequests.delete(requestId);
            resolve(response);
        }
    });
}

async function sendToRenderer(method: string, params: unknown, windowIndex?: number, timeoutMs?: number): Promise<McpResponse> {
    const windowData = windowIndex !== undefined
        ? openWindows.windows.find(w => w.index === windowIndex)
        : openWindows.windows.find(w => w.window);

    if (!windowData) {
        return { error: { code: -32603, message: windowIndex !== undefined
            ? `Window ${windowIndex} does not exist`
            : "No renderer window available",
        } };
    }

    // Closed windows must be opened first via open_window tool
    if (!windowData.window) {
        return { error: { code: -32603, message: `Window ${windowIndex} is closed. Use the open_window tool to reopen it first.` } };
    }

    // Wait for renderer to be fully initialized
    if (windowData.whenReady) {
        await windowData.whenReady;
    }

    const requestId = `mcp_${++requestIdGen}_${Date.now()}`;
    const effectiveTimeout = timeoutMs ?? REQUEST_TIMEOUT_MS;

    return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        if (effectiveTimeout > 0) {
            timer = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve({ error: { code: -32603, message: "Request timeout" } });
            }, effectiveTimeout);
        }

        pendingRequests.set(requestId, (response) => {
            if (timer) clearTimeout(timer);
            resolve(response);
        });

        windowData.window.window.webContents.send(MCP_EXECUTE, requestId, method, params);
    });
}

// ── MCP Tool Result Helper ─────────────────────────────────────────

function toToolResult(response: McpResponse) {
    if (response.error) {
        return {
            content: [{ type: "text" as const, text: `Error: ${response.error.message}` }],
            isError: true,
        };
    }
    const text = response.result != null ? JSON.stringify(response.result, null, 2) : "OK";
    return { content: [{ type: "text" as const, text }] };
}

// ── Status Broadcast ────────────────────────────────────────────────

function broadcastMcpStatus(): void {
    openWindows.send(EventEndpoint.eMcpStatusChanged, {
        running: isMcpHttpServerRunning(),
        url: getMcpUrl(),
        clientCount: getMcpClientCount(),
    });
}

// ── MCP Server Factory ─────────────────────────────────────────────
// Creates a new McpServer per session (SDK requires one transport per server).

function createMcpServer(): InstanceType<typeof McpServer> {
    const server = new McpServer(
        {
            name: "persephone",
            version: electronApp.getVersion(),
            title: "Persephone",
            description: "Developer notepad with tabbed pages, specialized editors, JavaScript/TypeScript scripting, and full Node.js access.",
            websiteUrl: "https://github.com/andriy-viyatyk/persephone",
        },
        {
            instructions: [
                "Persephone is a developer notepad with tabbed pages, specialized editors, and JavaScript/TypeScript scripting. GitHub: https://github.com/andriy-viyatyk/persephone",
                "Use Persephone to display rich content to the user: code with syntax highlighting, diagrams, tables/grids, images, and web pages.",
                "",
                "## IMPORTANT: Read guides before using tools",
                "",
                "Some tools require reading a documentation guide before use. Tool descriptions will tell you which guide to read.",
                "Use the `read_guide` tool or read the MCP resource directly (e.g. notepad://guides/pages). Example: read_guide(\"pages\"), read_guide(\"ui-push\").",
                "",
                "## Common scenarios",
                "",
                "**Show logs, results, or analysis to the user:**",
                "Use `ui_push` — it manages a Log View page automatically. Supports log messages, rich output (markdown, mermaid diagrams, grids, code blocks), and interactive dialogs.",
                "",
                "**Open a text/code page:**",
                "Use `create_page` with editor=\"monaco\" and any language (e.g. \"javascript\", \"json\", \"python\", \"markdown\"). Monaco is the default — no guide needed.",
                "",
                "**Show a Mermaid diagram:**",
                "Use `create_page` with editor=\"mermaid-view\", language=\"mermaid\". Content is the mermaid diagram source.",
                "",
                "**Show tabular data:**",
                "Use `create_page` with editor=\"grid-json\", language=\"json\" (content is a JSON array of objects) or editor=\"grid-csv\", language=\"csv\" (content is CSV text).",
                "",
                "**Open an image:**",
                "Use `execute_script` with `app.pages.openFile(filePath)` for local image files.",
                "",
                "**Open a URL in the built-in browser:**",
                "Use `open_url`.",
                "",
                "**Run scripts with full Node.js access:**",
                "Use `execute_script`. IMPORTANT: use read_guide(\"scripting\") BEFORE using this tool.",
                "",
                "**Build a custom board/editor for the user:**",
                "Persephone has custom **Boards** — sandboxed mini web-apps (HTML + backend scripts) that you, the agent, can build for the user: dashboards, tools, viewers, custom editors. Use `create_board` to scaffold one (auto-trusted), `open_board` to show it, then develop it by editing its files. IMPORTANT: read read_guide(\"boards\") first.",
                "",
                "## Browser automation (browser_* tools)",
                "",
                "If `browser_*` tools are listed, they follow the Playwright MCP convention.",
                "Apply your Playwright knowledge — selectors, accessibility refs (ref=eN), navigation, evaluation, and snapshots all work as in Playwright MCP.",
                "Use `browser_snapshot` to inspect the page structure before interacting.",
                "Browser pages belong to profiles (separate cookie/login sessions). Use get_app_info → browserProfiles to discover them, and the profileName/pageId params on browser_* tools to target a specific page.",
                "Note: browser_* tools only work on normal browser pages — incognito and Tor pages are blocked for privacy.",
            ].join("\n"),
        },
    );

    // ── Window parameter (shared across tools) ────────────────────────
    const windowIndexParam = z.number().int().optional().describe(
        "Target window index (from list_windows). If omitted, uses the first open window. Use open_window to reopen closed windows first.",
    );

    // ── Browser-targeting parameters (shared across browser_* tools) ──
    const browserPageIdParam = z.string().optional().describe(
        "Target a specific browser page by page ID (from list_pages). Takes precedence over profileName.",
    );
    const browserProfileParam = z.string().optional().describe(
        "Target the browser page of this profile (profile names: get_app_info → browserProfiles; '' = default profile). If omitted, uses the active (or first) browser page.",
    );

    // ── Resource file definitions (used by read_guide tool and resource registration) ──
    const resourceFiles = [
        {
            name: "ui-push-guide",
            uri: "notepad://guides/ui-push",
            file: "mcp-res-ui-push.md",
            description: "ui_push tool guide — log messages, dialogs, entry types, and examples. Read this first when the user asks to show, display, or present something.",
        },
        {
            name: "pages-guide",
            uri: "notepad://guides/pages",
            file: "mcp-res-pages.md",
            description: "Pages & windows guide — page properties, editor types, creating pages, multi-window support. Read when working with tabs, reading content, or creating documents.",
        },
        {
            name: "scripting-guide",
            uri: "notepad://guides/scripting",
            file: "mcp-res-scripting.md",
            description: "Scripting API reference — app object (pages, fs, settings, ui, shell, window), editor facades (grid, notebook, todo, links, browser), TypeScript, Node.js access. Read when using execute_script.",
        },
        {
            name: "graph-guide",
            uri: "notepad://guides/graph",
            file: "mcp-res-graph.md",
            description: "Force-graph editor guide — JSON data format, page.asGraph() API, editing graph data, group nodes. Read BEFORE working with graph pages.",
        },
        {
            name: "notebook-guide",
            uri: "notepad://guides/notebook",
            file: "mcp-res-notebook.md",
            description: "Notebook editor guide — NoteItem JSON format, content types (text, markdown, code, mermaid, grid). Read BEFORE creating or updating notebook pages.",
        },
        {
            name: "todo-guide",
            uri: "notepad://guides/todo",
            file: "mcp-res-todo.md",
            description: "Todo editor guide — TodoItem JSON format, lists, tags. Read BEFORE creating or updating todo pages.",
        },
        {
            name: "links-guide",
            uri: "notepad://guides/links",
            file: "mcp-res-links.md",
            description: "Links editor guide — LinkItem JSON format, categories, tags. Read BEFORE creating or updating links pages.",
        },
        {
            name: "boards-guide",
            uri: "notepad://guides/boards",
            file: "mcp-res-boards.md",
            description: "Boards guide — what a board is, the execute_script + app.boards create/open lifecycle, the execute() channel, --p-* theme contract, local vendoring, and browser_* testing. Read BEFORE building or opening a board.",
        },
    ];

    // ── Multi-window tools ───────────────────────────────────────────
    server.tool(
        "list_windows",
        "List all windows (open and closed) with their status and pages. Closed windows have persisted pages and can be reopened with open_window. Returns array of { windowIndex, status, pageCount, activePageId, pages: [{ id, title, type, editor, language, filePath, modified, pinned }] }. Browser pages also include { profileName, isIncognito, isTor }.",
        async () => {
            const result = openWindows.windows.map(w => {
                const wState = windowStates.getState(w.index);
                return {
                    windowIndex: w.index,
                    status: w.window ? "open" : "closed",
                    pageCount: wState?.pages?.length ?? 0,
                    activePageId: wState?.activePageId,
                    pages: (wState?.pages || []).map(p => {
                        // PageDescriptor: read main editor's state from editors[mainEditorId].
                        const main = p.editors.find(e => e.id === p.mainEditorId);
                        const state = (main?.state ?? {}) as { title?: string; type?: string; editor?: string; language?: string; filePath?: string; profileName?: string; isIncognito?: boolean; isTor?: boolean };
                        return {
                            id: p.id,
                            title: state.title ?? "Empty",
                            type: state.type,
                            editor: state.editor,
                            language: state.language,
                            filePath: state.filePath,
                            modified: p.modified,
                            pinned: p.pinned,
                            // Browser pages: surface profile identity (persisted fields)
                            ...(state.editor === "browser-view" ? { profileName: state.profileName ?? "", isIncognito: !!state.isIncognito, isTor: !!state.isTor } : {}),
                        };
                    }),
                };
            });
            const text = JSON.stringify(result, null, 2);
            return { content: [{ type: "text" as const, text }] };
        },
    );

    server.tool(
        "open_window",
        "Open (or reopen) a window by index. If the window is closed, it will be recreated with its persisted pages. If already open, it will be focused. Returns { windowIndex, status }.",
        {
            windowIndex: z.number().int().describe("The window index to open (from list_windows)."),
        },
        async ({ windowIndex }) => {
            const windowData = openWindows.windows.find(w => w.index === windowIndex);
            if (!windowData) {
                return {
                    content: [{ type: "text" as const, text: `Error: Window ${windowIndex} does not exist` }],
                    isError: true,
                };
            }

            if (windowData.window) {
                windowData.window.focus();
                return { content: [{ type: "text" as const, text: JSON.stringify({ windowIndex, status: "open", message: "Window is already open and focused" }) }] };
            }

            try {
                openWindows.createWindow(windowIndex);
                if (windowData.whenReady) {
                    await windowData.whenReady;
                }
                return { content: [{ type: "text" as const, text: JSON.stringify({ windowIndex, status: "open", message: "Window reopened successfully" }) }] };
            } catch (err) {
                return {
                    content: [{ type: "text" as const, text: `Error: Failed to open window ${windowIndex}: ${err}` }],
                    isError: true,
                };
            }
        },
    );

    // ── Page & script tools ──────────────────────────────────────────
    server.tool(
        "execute_script",
        "Execute JavaScript or TypeScript in Persephone. Returns { text, language, isError, consoleLogs }. IMPORTANT: use read_guide(\"scripting\") (or read resource notepad://guides/scripting) BEFORE using this tool — it documents the full API for `page` (active page), `app` (pages, fs, settings, ui, shell, window), and editor facades (asGrid, asNotebook, asTodo, etc.). Do NOT guess API method names or signatures — the scripting API has specific conventions that differ from typical Node.js patterns.",
        {
            script: z.string().describe("JavaScript or TypeScript code to execute. Supports async/await. Last expression is returned as result. Use read_guide(\"scripting\") for the API reference before writing scripts."),
            pageId: z.string().optional().describe("Target page ID. If omitted, uses the active page."),
            language: z.enum(["javascript", "typescript"]).optional().describe("Script language. Defaults to 'javascript'. Use 'typescript' to write scripts with type annotations."),
            windowIndex: windowIndexParam,
        },
        async ({ script, pageId, language, windowIndex }) => toToolResult(await sendToRenderer("execute_script", { script, pageId, language }, windowIndex)),
    );

    server.tool(
        "list_pages",
        "List all open pages (tabs) in a window. Returns array of { id, title, type, editor, language, filePath, modified, pinned, active }. Browser pages also include { profileName, isIncognito, isTor, url } (url = the active tab's URL; omitted for incognito/Tor pages).",
        {
            windowIndex: windowIndexParam,
        },
        async ({ windowIndex }) => toToolResult(await sendToRenderer("get_pages", {}, windowIndex)),
    );

    server.tool(
        "get_page_content",
        "Get the text content of a page by ID. Works for text-based pages (monaco, markdown, JSON, CSV, etc.). Returns { id, title, content }.",
        {
            pageId: z.string().describe("The page ID (from list_pages)."),
            windowIndex: windowIndexParam,
        },
        async ({ pageId, windowIndex }) => toToolResult(await sendToRenderer("get_page_content", { pageId }, windowIndex)),
    );

    server.tool(
        "get_active_page",
        "Get the currently active (focused) page with its content and metadata. Returns { id, title, type, editor, language, filePath, modified, content }. Browser pages also include { profileName, isIncognito, isTor, url } (url = the active tab's URL; omitted for incognito/Tor pages).",
        {
            windowIndex: windowIndexParam,
        },
        async ({ windowIndex }) => toToolResult(await sendToRenderer("get_active_page", {}, windowIndex)),
    );

    server.tool(
        "create_page",
        "Create a new page (tab) with optional content. For showing results/analysis, prefer ui_push instead. Returns { id, title, editor, language }. The default editor is \"monaco\" — works with any language, no guide needed. Other editors: md-view, mermaid-view, grid-json, grid-csv, grid-jsonl, svg-view, html-view, notebook-view, todo-view, link-view, graph-view, draw-view. Non-monaco editors require a matching language and sometimes a title suffix — use read_guide(\"pages\") (or read resource notepad://guides/pages) BEFORE using any non-monaco editor. Structured editors (notebook, todo, link, graph, draw) have strict JSON formats — use read_guide with the specific guide BEFORE creating these pages. Page-editors (browser-view, pdf-view, image-view) are NOT supported — use open_url or execute_script.",
        {
            title: z.string().optional().describe("Page title. Defaults to 'Untitled'."),
            content: z.string().optional().describe("Initial text content. For structured editors (notebook, todo, link, graph, draw) you MUST use read_guide with the specific guide first — do NOT guess the JSON format."),
            language: z.string().optional().describe("Monaco language ID (e.g. 'javascript', 'json', 'markdown'). Defaults to 'plaintext'."),
            editor: z.string().optional().describe("Editor type. Default: 'monaco'. Other editors require reading a guide first — use read_guide('pages') for the full editor+language table."),
            windowIndex: windowIndexParam,
        },
        async ({ title, content, language, editor, windowIndex }) =>
            toToolResult(await sendToRenderer("create_page", { title, content, language, editor }, windowIndex)),
    );

    server.tool(
        "set_page_content",
        "Update the text content of a page by ID. Works for text-based pages only. IMPORTANT: For structured editors, use read_guide (or read the MCP resource) BEFORE updating content: read_guide(\"notebook\"), read_guide(\"todo\"), read_guide(\"links\"), read_guide(\"graph\"). Incorrect JSON WILL crash the editor.",
        {
            pageId: z.string().describe("The page ID (from list_pages)."),
            content: z.string().describe("The new text content to set."),
            windowIndex: windowIndexParam,
        },
        async ({ pageId, content, windowIndex }) => toToolResult(await sendToRenderer("set_page_content", { pageId, content }, windowIndex)),
    );

    server.tool(
        "ui_push",
        "Push entries to the Log View page — the AI agent's default output channel. Entries can be log messages (display-only), dialogs (interactive, blocks until user responds), or output items (rich display). String entries are treated as log.info. The tool manages an active Log View page automatically (creates on first call, reuses on subsequent calls). If entries contain dialogs, the tool blocks until ALL dialogs are resolved.",
        {
            entries: z.array(z.union([
                z.string(),
                z.object({
                    type: z.string(),
                }).passthrough(),
            ])).describe("Array of flat entries. Strings are shorthand for log.info. Objects: { type, ...fields } — type-specific fields at top level.\n\nLog types: log.text/info/warn/error/success — fields: text.\nDialog types: supports confirm, text input, buttons, checkboxes, radio buttons, and dropdown select. IMPORTANT: dialogs BLOCK until the user responds. Incorrect fields will crash the dialog and cause a permanent hang. You MUST use read_guide('ui-push') (or read resource notepad://guides/ui-push) BEFORE using any dialog type. Do NOT guess dialog fields.\nOutput types:\n  output.text — fields: text, language?, title?, wordWrap?, lineNumbers?, minimap?\n  output.markdown — fields: text, title?\n  output.mermaid — fields: text, title?\n  output.grid — fields: content (JSON array or CSV string), contentType? ('json'|'csv'), title?\n  output.progress — fields: label?, value?, max?, completed?"),

            windowIndex: windowIndexParam,
        },
        async ({ entries, windowIndex }) => {
            // Detect if any entries contain dialogs → use no timeout (0) for infinite wait
            const hasDialogs = entries.some(
                (e) => typeof e === "object" && typeof e.type === "string" && e.type.startsWith("input."),
            );
            return toToolResult(
                await sendToRenderer("ui_push", { entries }, windowIndex, hasDialogs ? 0 : undefined),
            );
        },
    );

    server.tool(
        "get_app_info",
        "Get application info: { version, pageCount, activePageId, browserProfiles, defaultBrowserProfile } (browserProfiles = configured browser profile names; defaultBrowserProfile = '' for the built-in default).",
        {
            windowIndex: windowIndexParam,
        },
        async ({ windowIndex }) => toToolResult(await sendToRenderer("get_app_info", {}, windowIndex)),
    );

    server.tool(
        "open_url",
        "Open a URL in the built-in browser. Persephone has a full browser with tabs, profiles, and incognito mode. Reuse is profile-matched: with profileName it adds the tab to (and focuses) an existing page of that profile, or creates a new page with that profile; never attaches to a different-profile page. Returns { opened: url }.",
        {
            url: z.string().describe("The URL to open."),
            profileName: z.string().optional().describe("Browser profile name. Uses the default profile if omitted."),
            incognito: z.boolean().optional().describe("Open in incognito mode (no cookies, no history)."),
            windowIndex: windowIndexParam,
        },
        async ({ url, profileName, incognito, windowIndex }) =>
            toToolResult(await sendToRenderer("open_url", { url, profileName, incognito }, windowIndex)),
    );

    // ── Board lifecycle tools ─────────────────────────────────────────
    server.tool(
        "create_board",
        "Create a Persephone Board — a sandboxed mini web-app (HTML page + backend scripts) you build for the user: a dashboard, tool, viewer, or custom editor. Scaffolds from a template, guarantees its board-manifest.json, auto-trusts it, and returns { boardRoot } (the new board's absolute root path). Then call open_board to show it, and edit its files to develop it. IMPORTANT: read read_guide(\"boards\") first.",
        {
            name: z.string().describe("Board folder name — created inside `dir`; also the default display name."),
            dir: z.string().describe("Absolute path of the container folder the board is created in (created if it doesn't exist)."),
            demo: z.boolean().optional().describe("Scaffold from the bundled Demo board template (a rich, self-documenting example) instead of the blank template."),
            windowIndex: windowIndexParam,
        },
        async ({ name, dir, demo, windowIndex }) =>
            toToolResult(await sendToRenderer("create_board", { name, dir, demo }, windowIndex)),
    );
    server.tool(
        "open_board",
        "Open an existing Persephone Board by its root folder path (the folder containing board-manifest.json). Opens a new tab (or reuses the board's tab) and makes it active. A board created via create_board is auto-trusted and opens immediately; a board Persephone did not create prompts the user for trust before rendering. Returns { opened: path }. IMPORTANT: read read_guide(\"boards\") first.",
        {
            path: z.string().describe("Absolute path of the board's root folder (the folder containing board-manifest.json)."),
            windowIndex: windowIndexParam,
        },
        async ({ path, windowIndex }) =>
            toToolResult(await sendToRenderer("open_board", { path }, windowIndex)),
    );

    // ── Browser automation tools (Playwright-compatible) ─────────────

    if (browserToolsEnabled) {

    server.tool(
        "browser_navigate",
        "Navigate the browser to a URL. Returns the page accessibility snapshot after loading.",
        {
            url: z.string().describe("URL to navigate to."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ url, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_navigate", { url, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_snapshot",
        "Get the accessibility snapshot of the current page. Returns a YAML-like tree of elements with roles, names, and ref IDs for interaction. Preferred over screenshots — structured, fast, deterministic.",
        {
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_snapshot", { pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_click",
        "Click an element on the page. Accepts a CSS selector or a ref from the accessibility snapshot. Returns updated accessibility snapshot.",
        {
            selector: z.string().optional().describe("CSS selector for the target element."),
            ref: z.string().optional().describe("Element ref from accessibility snapshot (e.g., 'e52')."),
            element: z.string().optional().describe("Human-readable element description (used as CSS selector)."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ selector, ref, element, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_click", { selector, ref, element, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_hover",
        "Hover over an element on the page. Triggers mouseenter and mouseover events — useful for revealing tooltips, dropdown menus, and hover-dependent UI. Returns updated accessibility snapshot.",
        {
            selector: z.string().optional().describe("CSS selector for the target element."),
            ref: z.string().optional().describe("Element ref from accessibility snapshot (e.g., 'e52')."),
            element: z.string().optional().describe("Human-readable element description (used as CSS selector)."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ selector, ref, element, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_hover", { selector, ref, element, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_type",
        "Type text into editable element. Clears existing content first. Works on inputs, textareas, and contentEditable elements. By default fills text at once; use slowly for character-by-character typing. Returns updated accessibility snapshot.",
        {
            selector: z.string().optional().describe("CSS selector for the target element."),
            ref: z.string().optional().describe("Element ref from accessibility snapshot (e.g., 'e52')."),
            text: z.string().describe("Text to type into the element."),
            submit: z.boolean().optional().describe("Whether to press Enter after typing (e.g. to submit a form)."),
            slowly: z.boolean().optional().describe("Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ selector, ref, text, submit, slowly, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_type", { selector, ref, text, submit, slowly, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_select_option",
        "Select an option in a <select> element by value. Returns updated accessibility snapshot.",
        {
            selector: z.string().optional().describe("CSS selector for the <select> element."),
            ref: z.string().optional().describe("Element ref from accessibility snapshot."),
            value: z.string().optional().describe("Option value to select."),
            values: z.array(z.string()).optional().describe("Array of option values to select (Playwright-compatible). First value is used for single-select."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ selector, ref, value, values, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_select_option", { selector, ref, value, values, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_press_key",
        "Press a keyboard key. Returns updated accessibility snapshot.",
        {
            key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ key, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_press_key", { key, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_evaluate",
        "Run JavaScript in the browser page and return the result. Supports async expressions.",
        {
            expression: z.string().optional().describe("JavaScript expression to evaluate in the page."),
            function: z.string().optional().describe("JavaScript function to call, e.g. '() => document.title'. Playwright-compatible alias for 'expression'."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ expression, function: fn, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_evaluate", { expression, function: fn, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_tabs",
        "Manage browser tabs: list all tabs, open a new tab, close a tab, or switch to a tab.",
        {
            action: z.enum(["list", "new", "close", "select"]).optional()
                .describe("Operation to perform: 'list' (default), 'new', 'close', 'select'."),
            index: z.number().optional()
                .describe("Tab index (0-based) for 'close' or 'select'. If omitted for 'close', closes the active tab."),
            url: z.string().optional()
                .describe("URL to open in the new tab (for 'new' action)."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ action, index, url, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_tabs", { action, index, url, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_navigate_back",
        "Navigate back in browser history. Returns updated accessibility snapshot.",
        {
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_navigate_back", { pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_wait_for",
        "Wait for an element or text to appear/disappear, or wait a fixed time. Returns accessibility snapshot.",
        {
            selector: z.string().optional().describe("CSS selector to wait for."),
            text: z.string().optional().describe("Text content to wait for on the page."),
            textGone: z.string().optional().describe("Wait until this text is no longer visible on the page (Playwright-compatible)."),
            time: z.number().optional().describe("Time to wait in seconds (Playwright-compatible). E.g. 2 = 2 seconds."),
            timeout: z.number().optional().describe("Max wait time in ms (default 30000). Applies to selector/text/textGone modes."),
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ selector, text, textGone, time, timeout, pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_wait_for", { selector, text, textGone, time, timeout, pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_take_screenshot",
        "Take a screenshot of the current page. Returns a base64-encoded PNG image.",
        {
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ pageId, profileName, windowIndex }) => {
            const resp = await sendToRenderer("browser_take_screenshot", { pageId, profileName }, windowIndex);
            if (resp.error) return toToolResult(resp);
            const r = resp.result as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (r?.type === "image") {
                return { content: [{ type: "image" as const, data: r.data, mimeType: r.mimeType }] };
            }
            return toToolResult(resp);
        },
    );

    server.tool(
        "browser_network_requests",
        "Get the network request log for the current browser tab. Returns array of { url, method, statusCode, resourceType, requestHeaders, responseHeaders }.",
        {
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_network_requests", { pageId, profileName }, windowIndex)),
    );

    server.tool(
        "browser_close",
        "Close the active browser tab.",
        {
            pageId: browserPageIdParam,
            profileName: browserProfileParam,
            windowIndex: windowIndexParam,
        },
        async ({ pageId, profileName, windowIndex }) =>
            toToolResult(await sendToRenderer("browser_close", { pageId, profileName }, windowIndex)),
    );

    } // end browserToolsEnabled

    // ── Guide reader tool ─────────────────────────────────────────────
    server.tool(
        "read_guide",
        [
            "Read a Persephone documentation guide. IMPORTANT: You MUST use this tool to read the relevant guide BEFORE using tools that require it. Tool descriptions will tell you which guide to read.",
            "",
            "Available guides:",
            "- ui-push — log messages, dialogs, output types (markdown, mermaid, grid, code). For ui_push tool.",
            "- pages — page properties, editor types, editor+language table, multi-window. For create_page and set_page_content tools.",
            "- scripting — app API (pages, fs, settings, ui, shell, window), editor facades (grid, notebook, todo, browser), Node.js access. For execute_script tool.",
            "- notebook — NoteItem JSON format, content types. For notebook-view editor.",
            "- todo — TodoItem JSON format, lists, tags. For todo-view editor.",
            "- links — LinkItem JSON format, categories, tags. For link-view editor.",
            "- graph — graph JSON format, node/link data, page.asGraph() API. For graph-view editor.",
            "- boards — what a board is, the app.boards create/open lifecycle (via execute_script), develop & test a board.",
        ].join("\n"),
        {
            guide: z.enum(["ui-push", "pages", "scripting", "notebook", "todo", "links", "graph", "boards"])
                .describe("Guide name to read."),
        },
        async ({ guide }) => {
            const res = resourceFiles.find(r => r.uri === `notepad://guides/${guide}`);
            if (!res) {
                return {
                    content: [{ type: "text" as const, text: `Unknown guide: ${guide}. Available: ui-push, pages, scripting, notebook, todo, links, graph, boards.` }],
                    isError: true,
                };
            }
            try {
                const text = fs.readFileSync(getAssetPath(res.file), "utf-8");
                return { content: [{ type: "text" as const, text }] };
            } catch (err) {
                return {
                    content: [{ type: "text" as const, text: `Error reading guide: ${err}` }],
                    isError: true,
                };
            }
        },
    );

    // ── MCP Resources (focused guides) ─────────────────────────────────

    for (const res of resourceFiles) {
        server.registerResource(
            res.name,
            res.uri,
            { description: res.description, mimeType: "text/markdown" },
            async (uri) => ({
                contents: [{
                    uri: uri.href,
                    mimeType: "text/markdown",
                    text: fs.readFileSync(getAssetPath(res.file), "utf-8"),
                }],
            }),
        );
    }

    // Full API guide — concatenation of all resource files (for agents that want everything)
    server.registerResource(
        "full-api-guide",
        "notepad://guides/full",
        {
            description: "Complete API guide — all resources combined. Only read this if you need the full reference; prefer the focused guides above for specific tasks.",
            mimeType: "text/markdown",
        },
        async (uri) => ({
            contents: [{
                uri: uri.href,
                mimeType: "text/markdown",
                text: resourceFiles
                    .map((r) => fs.readFileSync(getAssetPath(r.file), "utf-8"))
                    .join("\n\n---\n\n"),
            }],
        }),
    );

    return server;
}

// ── HTTP Body Parser ───────────────────────────────────────────────

function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : undefined);
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });
        req.on("error", reject);
    });
}

// ── HTTP Request Handler ───────────────────────────────────────────

async function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${currentPort}`);
    if (url.pathname !== "/mcp") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
        if (req.method === "POST") {
            const body = await parseJsonBody(req);

            if (sessionId && sessions.has(sessionId)) {
                await sessions.get(sessionId).transport.handleRequest(req, res, body);
            } else if (!sessionId && isInitializeRequest(body)) {
                const mcpServer = createMcpServer();
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid: string) => {
                        sessions.set(sid, { server: mcpServer, transport });
                        broadcastMcpStatus();
                    },
                });

                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid) sessions.delete(sid);
                    broadcastMcpStatus();
                };

                await mcpServer.connect(transport);
                await transport.handleRequest(req, res, body);
            } else {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    jsonrpc: "2.0",
                    error: { code: -32000, message: "Bad request: no valid session ID" },
                    id: null,
                }));
            }
        } else if (req.method === "GET") {
            if (!sessionId || !sessions.has(sessionId)) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Invalid or missing session ID");
                return;
            }
            await sessions.get(sessionId).transport.handleRequest(req, res);
        } else if (req.method === "DELETE") {
            if (!sessionId || !sessions.has(sessionId)) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Invalid or missing session ID");
                return;
            }
            await sessions.get(sessionId).transport.handleRequest(req, res);
        } else {
            res.writeHead(405, { "Content-Type": "text/plain" });
            res.end("Method not allowed");
        }
    } catch (error) {
        console.error("MCP HTTP handler error:", error);
        if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
            }));
        }
    }
}

// ── Server Lifecycle ───────────────────────────────────────────────

export function setBrowserToolsEnabled(enabled: boolean): void {
    browserToolsEnabled = enabled;
}

export async function startMcpHttpServer(port?: number): Promise<void> {
    if (httpServer) return;

    await loadSdk();
    currentPort = port ?? DEFAULT_PORT;
    initMcpIpc();

    return new Promise<void>((resolve, reject) => {
        const server = http.createServer(handleHttpRequest);

        server.on("error", (err: NodeJS.ErrnoException) => {
            if (!httpServer) {
                // Startup error
                reject(err);
            }
            console.error(`MCP HTTP server error on port ${currentPort}:`, err.message);
        });

        server.listen(currentPort, "127.0.0.1", () => {
            httpServer = server;
            console.log(`MCP HTTP server started: http://localhost:${currentPort}/mcp`);
            broadcastMcpStatus();
            resolve();
        });
    });
}

export async function stopMcpHttpServer(): Promise<void> {
    if (!httpServer) return;

    // Close all active sessions
    for (const [, session] of sessions) {
        try { await session.transport.close(); } catch { /* ignore cleanup errors */ }
    }
    sessions.clear();

    // Cancel pending IPC requests
    for (const [, resolve] of pendingRequests) {
        resolve({ error: { code: -32603, message: "Server shutting down" } });
    }
    pendingRequests.clear();

    return new Promise<void>((resolve) => {
        httpServer.close(() => {
            httpServer = undefined;
            console.log("MCP HTTP server stopped");
            broadcastMcpStatus();
            resolve();
        });
    });
}

export function isMcpHttpServerRunning(): boolean {
    return !!httpServer;
}

export function getMcpUrl(): string {
    return `http://localhost:${currentPort}/mcp`;
}

export function getMcpClientCount(): number {
    return sessions.size;
}
