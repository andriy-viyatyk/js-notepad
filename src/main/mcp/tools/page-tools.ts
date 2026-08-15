import { toPageContentResult } from "../tool-results";
import { IMcpToolDef, ToolArgs } from "../types";
import { IToolContext } from "./params";

// Pages, scripting, app info and the log-view channel — all forwarded to the renderer.

export function pageTools(ctx: IToolContext): IMcpToolDef[] {
    const { z, windowIndex } = ctx;
    return [
        {
            name: "execute_script",
            description: "Execute JavaScript or TypeScript in Persephone. Returns { text, language, isError, consoleLogs }. IMPORTANT: use read_guide(\"scripting\") (or read resource persephone://guides/scripting) BEFORE using this tool — it documents the full API for `page` (active page), `app` (pages, fs, settings, ui, shell, window), and editor facades (asGrid, asNotebook, etc.). Do NOT guess API method names or signatures — the scripting API has specific conventions that differ from typical Node.js patterns.",
            schema: {
                script: z.string().describe("JavaScript or TypeScript code to execute. Supports async/await. Last expression is returned as result. Use read_guide(\"scripting\") for the API reference before writing scripts."),
                pageId: z.string().optional().describe("Target page ID. If omitted, uses the active page."),
                language: z.enum(["javascript", "typescript"]).optional().describe("Script language. Defaults to 'javascript'. Use 'typescript' to write scripts with type annotations."),
                windowIndex,
            },
        },
        {
            name: "list_pages",
            method: "get_pages",
            description: "List all open pages (tabs) in a window. Returns array of { id, title, type, editor, language, filePath, modified, pinned, active }. Browser pages also include { profileName, isIncognito, isTor, url } (url = the active tab's URL; omitted for incognito/Tor pages).",
            schema: {
                windowIndex,
            },
        },
        {
            name: "get_page_content",
            description: "Get the content of a page by ID. Text-based pages (monaco, markdown, JSON, CSV, etc.) return { id, title, content }. Image pages (image-view) return the rendered PNG as an image block. Other non-text pages return { id, title, hint } describing how to read them.",
            schema: {
                pageId: z.string().describe("The page ID (from list_pages)."),
                windowIndex,
            },
            toResult: toPageContentResult,
        },
        {
            name: "get_active_page",
            description: "Get the currently active (focused) page with its content and metadata. Returns { id, title, type, editor, language, filePath, modified, content }. Image pages (image-view) return the rendered PNG as an image block instead of content; other non-text pages return a hint describing how to read them. Browser pages also include { profileName, isIncognito, isTor, url } (url = the active tab's URL; omitted for incognito/Tor pages).",
            schema: {
                windowIndex,
            },
            toResult: toPageContentResult,
        },
        {
            name: "create_page",
            description: "Create a new page (tab) with optional content. For showing results/analysis, prefer ui_push instead. Returns { id, title, editor, language }. The default editor is \"monaco\" — works with any language, no guide needed. Other editors: md-view, mermaid-view, grid-json, grid-csv, grid-jsonl, svg-view, html-view, notebook-view, link-view, graph-view, draw-view. Non-monaco editors require a matching language and sometimes a title suffix — use read_guide(\"pages\") (or read resource persephone://guides/pages) BEFORE using any non-monaco editor. Structured editors (notebook, link, graph, draw) have strict JSON formats — use read_guide with the specific guide BEFORE creating these pages. Page-editors (browser-view, image-view) are NOT supported — use open_url or execute_script.",
            schema: {
                title: z.string().optional().describe("Page title. Defaults to 'Untitled'."),
                content: z.string().optional().describe("Initial text content. For structured editors (notebook, link, graph, draw) you MUST use read_guide with the specific guide first — do NOT guess the JSON format."),
                language: z.string().optional().describe("Monaco language ID (e.g. 'javascript', 'json', 'markdown'). Defaults to 'plaintext'."),
                editor: z.string().optional().describe("Editor type. Default: 'monaco'. Other editors require reading a guide first — use read_guide('pages') for the full editor+language table."),
                windowIndex,
            },
        },
        {
            name: "set_page_content",
            description: "Update the text content of a page by ID. Works for text-based pages only. IMPORTANT: For structured editors, use read_guide (or read the MCP resource) BEFORE updating content: read_guide(\"notebook\"), read_guide(\"links\"), read_guide(\"graph\"). Incorrect JSON WILL crash the editor.",
            schema: {
                pageId: z.string().describe("The page ID (from list_pages)."),
                content: z.string().describe("The new text content to set."),
                windowIndex,
            },
        },
        {
            name: "ui_push",
            description: "Push entries to the Log View page — the AI agent's default output channel. Entries can be log messages (display-only), dialogs (interactive, blocks until user responds), or output items (rich display). String entries are treated as log.info. The tool manages an active Log View page automatically (creates on first call, reuses on subsequent calls). If entries contain dialogs, the tool blocks until ALL dialogs are resolved.",
            schema: {
                entries: z.array(z.union([
                    z.string(),
                    z.object({
                        type: z.string(),
                    }).passthrough(),
                ])).describe("Array of flat entries. Strings are shorthand for log.info. Objects: { type, ...fields } — type-specific fields at top level.\n\nLog types: log.text/info/warn/error/success — fields: text.\nDialog types: supports confirm, text input, buttons, checkboxes, radio buttons, and dropdown select. IMPORTANT: dialogs BLOCK until the user responds. Incorrect fields will crash the dialog and cause a permanent hang. You MUST use read_guide('ui-push') (or read resource persephone://guides/ui-push) BEFORE using any dialog type. Do NOT guess dialog fields.\nOutput types:\n  output.text — fields: text, language?, title?, wordWrap?, lineNumbers?, minimap?\n  output.markdown — fields: text, title?\n  output.mermaid — fields: text, title?\n  output.grid — fields: content (JSON array or CSV string), contentType? ('json'|'csv'), title?\n  output.progress — fields: label?, value?, max?, completed?"),

                windowIndex,
            },
            // Dialogs block on the user, so a batch containing one waits forever (0).
            timeoutMs: (args: ToolArgs) => {
                const entries = args.entries as Array<string | { type?: unknown }>;
                const hasDialogs = entries.some(
                    (e) => typeof e === "object" && typeof e.type === "string" && e.type.startsWith("input."),
                );
                return hasDialogs ? 0 : undefined;
            },
        },
        {
            name: "get_app_info",
            description: "Get application info: { version, pageCount, activePageId, browserProfiles, defaultBrowserProfile, resourcesDir, demoBoardDir, boardsAssetsBaseUrl, boardsManifestUrl } (browserProfiles = configured browser profile names; defaultBrowserProfile = '' for the built-in default; resourcesDir = install resources root; demoBoardDir = bundled demo board to reference; boardsAssetsBaseUrl/boardsManifestUrl = raw GitHub location of the recommended-components catalog + skins, which are NOT bundled in the installer — fetch a skin as boardsAssetsBaseUrl + skin.file).",
            schema: {
                windowIndex,
            },
        },
        {
            name: "open_url",
            description: "Open a URL in the built-in browser. Persephone has a full browser with tabs, profiles, and incognito mode. Reuse is profile-matched: with profileName it adds the tab to (and focuses) an existing page of that profile, or creates a new page with that profile; never attaches to a different-profile page. The target page is focused. Returns { opened, pageId, title } — pass that pageId to browser_* tools to target this page explicitly (recommended: the active page can change between calls, e.g. when the user or another agent switches tabs).",
            schema: {
                url: z.string().describe("The URL to open."),
                profileName: z.string().optional().describe("Browser profile name. Uses the default profile if omitted."),
                incognito: z.boolean().optional().describe("Open in incognito mode (no cookies, no history)."),
                windowIndex,
            },
        },
    ];
}
