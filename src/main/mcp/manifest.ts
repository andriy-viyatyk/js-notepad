import fs from "node:fs";
import { app as electronApp } from "electron";
import { getAssetPath } from "../utils";

// ── Server identity ─────────────────────────────────────────────────

export function getServerInfo() {
    return {
        name: "persephone",
        version: electronApp.getVersion(),
        title: "Persephone",
        description: "Developer notepad with tabbed pages, specialized editors, JavaScript/TypeScript scripting, and full Node.js access.",
        websiteUrl: "https://github.com/andriy-viyatyk/persephone",
    };
}

// ── Instructions ────────────────────────────────────────────────────
// Sent to the client on initialize — the agent's first (and often only) read of what
// Persephone is for. Route to a guide rather than growing this: it costs every session.

export const SERVER_INSTRUCTIONS = [
    "Persephone is a developer notepad with tabbed pages, specialized editors, and JavaScript/TypeScript scripting. GitHub: https://github.com/andriy-viyatyk/persephone",
    "Use Persephone to display rich content to the user: code with syntax highlighting, diagrams, tables/grids, images, and web pages.",
    "",
    "## IMPORTANT: Read guides before using tools",
    "",
    "New to Persephone? `read_guide(\"overview\")` gives the mental model and a task → tool → guide routing table in one short page.",
    "Some tools require reading a documentation guide before use. Tool descriptions will tell you which guide to read.",
    "Use the `read_guide` tool or read the MCP resource directly (e.g. persephone://guides/pages). Example: read_guide(\"pages\"), read_guide(\"ui-push\").",
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
    "**Help the user with Persephone itself:**",
    "When the request is about the app rather than about their content, read read_guide(\"ui\") — it describes every always-visible element by purpose, gives a stable selector for each, and shows how to draw a highlight with your own explanation on screen via `app.ui.highlightElement`. This covers instructions as much as questions: \"change the language of this tab\", \"open the sidebar\" and \"highlight the save button\" all mean read the guide FIRST. (\"Language\" in Persephone always means the Monaco syntax-highlighting mode — there is no UI locale setting.) Do not go exploring the API or clicking through a snapshot to work out where a control is — that is slow, it changes the user's app while you guess, and the answer is already written down. In particular the guide tells you which elements are conditional, so you can say \"this editor has no language\" instead of hunting for a button that was never rendered. For questions about the editors themselves (\"what can Persephone open?\", \"is there a diagram editor?\"), read read_guide(\"ui-editors\"). Read it too when the user NAMES an editor or feature as though it exists (\"open this in the built-in PDF editor\") — do not take the premise on trust and do not ask which file before checking, because some editors named in older material are gone: the built-in Todo and PDF editors are now boards. Confirm the editor exists, and say so plainly if it does not.",
    "",
    "**Reuse tools for recurring external-system tasks (Agent Tools registry):**",
    "Before writing ad-hoc scripts for recurring external-system work (Azure DevOps, SQL, email, CLIs), call `search_tools` to check for a ready-made tool, then run it with `execute_tool`. If a tool fails it returns its folder path + stderr — FIX the tool rather than working around it. After a repeatable ad-hoc success, offer to register it as a reusable tool. IMPORTANT: read read_guide(\"tools\") first.",
    "",
    "## Browser automation (browser_* tools)",
    "",
    "If `browser_*` tools are listed, they follow the Playwright MCP convention.",
    "Apply your Playwright knowledge — selectors, accessibility refs (ref=eN), navigation, evaluation, and snapshots all work as in Playwright MCP.",
    "Use `browser_snapshot` to inspect the page structure before interacting.",
    "Browser pages belong to profiles (separate cookie/login sessions). Use get_app_info → browserProfiles to discover them, and the profileName/pageId params on browser_* tools to target a specific page.",
    "Note: browser_* tools only work on normal browser pages — incognito and Tor pages are blocked for privacy.",
    "You can also drive Persephone's OWN UI: pass pageId: \"app\" to any browser_* tool to snapshot/click/type/press_key/screenshot/evaluate the app window itself (tab strip, sidebar, toolbars, dialogs, active editor). The snapshot shows only the app chrome + the active page (inactive pages are hidden) — click a page tab to activate a different one. Navigation and tabs are not supported on \"app\" (use list_pages / execute_script instead), and editor content is best changed via set_page_content / execute_script rather than typing into Monaco. Useful for assisting the user with Persephone's UI.",
].join("\n");

// ── Guides ──────────────────────────────────────────────────────────
// Each guide is both an MCP resource and a `read_guide` choice; the guide name in
// `read_guide`'s enum is the last segment of the URI.

export interface IGuideResource {
    name: string;
    uri: string;
    file: string;
    description: string;
}

export const resourceFiles: IGuideResource[] = [
    {
        name: "overview-guide",
        uri: "persephone://guides/overview",
        file: "mcp-res-overview.md",
        description: "Start here — Persephone's mental model (windows, pages, editors, boards, tools) and a task → tool → guide routing table. Read this first if you are new to Persephone.",
    },
    {
        name: "ui-push-guide",
        uri: "persephone://guides/ui-push",
        file: "mcp-res-ui-push.md",
        description: "ui_push tool guide — log messages, dialogs, entry types, and examples. Read this first when the user asks to show, display, or present something.",
    },
    {
        name: "pages-guide",
        uri: "persephone://guides/pages",
        file: "mcp-res-pages.md",
        description: "Pages & windows guide — page properties, editor types, creating pages, multi-window support. Read when working with tabs, reading content, or creating documents.",
    },
    {
        name: "scripting-guide",
        uri: "persephone://guides/scripting",
        file: "mcp-res-scripting.md",
        description: "Scripting API reference — app object (pages, fs, settings, ui, shell, window), editor facades (grid, notebook, todo, links, browser), TypeScript, Node.js access. Read when using execute_script.",
    },
    {
        name: "graph-guide",
        uri: "persephone://guides/graph",
        file: "mcp-res-graph.md",
        description: "Force-graph editor guide — JSON data format, page.asGraph() API, editing graph data, group nodes. Read BEFORE working with graph pages.",
    },
    {
        name: "notebook-guide",
        uri: "persephone://guides/notebook",
        file: "mcp-res-notebook.md",
        description: "Notebook editor guide — NoteItem JSON format, content types (text, markdown, code, mermaid, grid). Read BEFORE creating or updating notebook pages.",
    },
    {
        name: "links-guide",
        uri: "persephone://guides/links",
        file: "mcp-res-links.md",
        description: "Links editor guide — LinkItem JSON format, categories, tags. Read BEFORE creating or updating links pages.",
    },
    {
        name: "boards-guide",
        uri: "persephone://guides/boards",
        file: "mcp-res-boards.md",
        description: "Boards guide — what a board is, the execute_script + app.boards create/open lifecycle, the execute() channel, --p-* theme contract, local vendoring, and browser_* testing. Read BEFORE building or opening a board.",
    },
    {
        name: "tools-guide",
        uri: "persephone://guides/tools",
        file: "mcp-res-tools.md",
        description: "Agent Tools registry guide — discover/run reusable parameterized tools (any language) via search_tools/execute_tool, the stdin-JSON + ##PERSEPHONE_RESULT## contract, .env secrets, and the self-repair loop. Read BEFORE using search_tools/execute_tool.",
    },
    {
        name: "ui-guide",
        uri: "persephone://guides/ui",
        file: "mcp-res-ui.md",
        description: "Persephone UI guide — what the app is for, the always-visible chrome (header strip, tab strip, status indicators, Menu Bar, sidebar) element by element with stable selectors, and how to highlight an element on screen for the user. Read when the user asks about Persephone itself rather than about their content.",
    },
    {
        name: "ui-editors-guide",
        uri: "persephone://guides/ui-editors",
        file: "mcp-res-ui-editors.md",
        description: "Editor catalog — what each of Persephone's editors is for, how the user opens it, and what it can do (text, grid, notebook, links, rest client, markdown/html/svg/mermaid preview, image, video, archive, drawing, browser, boards, app pages). Read when explaining Persephone's editors or capabilities to the user.",
    },
    {
        name: "browser-guide",
        uri: "persephone://guides/browser",
        file: "mcp-res-browser.md",
        description: "Browser automation guide — page targeting resolution, snapshot format, ref lifecycle (when refs go stale), waiting strategies, profiles, driving boards and the app window. Read when using browser_* tools beyond the basics.",
    },
];

// Guides are read on every read_guide call and every resource read, and the "full"
// resource reads all of them at once. Cache the text but key it on the file's mtime:
// the guides are editable assets, and an app left running must not serve stale text
// after one is rewritten.
interface IGuideCacheEntry { mtimeMs: number; text: string }
const guideCache = new Map<string, IGuideCacheEntry>();

export function readGuideFile(file: string): string {
    const path = getAssetPath(file);
    const mtimeMs = fs.statSync(path).mtimeMs;
    const cached = guideCache.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached.text;
    const text = fs.readFileSync(path, "utf-8");
    guideCache.set(path, { mtimeMs, text });
    return text;
}
