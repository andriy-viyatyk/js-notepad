import fs from "node:fs";
import { app as electronApp } from "electron";
import { getAssetPath } from "../utils";

// ——— Server identity ————————————————————————————————————————————————————————

export function getServerInfo() {
    return {
        name: "persephone",
        version: electronApp.getVersion(),
        title: "Persephone",
        description: "Developer notepad with tabbed pages, specialized editors, JavaScript/TypeScript scripting, and full Node.js access.",
        websiteUrl: "https://github.com/andriy-viyatyk/persephone",
    };
}

// Sent to the client on initialize — keep this short because it is read every session.
export const SERVER_INSTRUCTIONS = [
    "Persephone is a developer notepad with tabbed pages, specialized editors, and JavaScript/TypeScript scripting. GitHub: https://github.com/andriy-viyatyk/persephone",
    "Use Persephone to display rich content to the user: code, diagrams, tables/grids, images, and web pages.",
    "Start with `call` and no path to see the overview; follow its hints and node `$help`.",
    "Use `pages.logView.push(...)` for output, rich results, and questions.",
    "Create pages with `pages.addEditorPage(...)`; assign `pages[i].content` to update text.",
    "Open a web URL with `pages.openUrlInBrowserTab(...)`, then use `pages[i].editor.*`.",
    "Use `window.screen.*` for Persephone's own window and `pages[i].editor.*` for browser or board pages.",
    "Run renderer code with `script.execute(code)`; use `main.script.execute(code)` only when enabled.",
    "For editor choices use `persephone://guides/pages` and `persephone://guides/ui-editors`; for notebook, links, or graph JSON use their format resources.",
    "For boards use `boards.*` and read `persephone://guides/boards` when authoring or reviewing one.",
    "For Agent Tools, find registered tools with `tools.search()` and run one with `tools.execute(id, args)`.",
    "Use `persephone://guides/ui` for reference about the app's controls and `persephone://guides/browser` for browser automation details.",
].join("\n");

// ——— Guides ————————————————————————————————————————————————————————————————

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
        description: "Persephone's mental model: windows, pages, editors, boards, and the call-based object model. Start here when the application is unfamiliar.",
    },
    {
        name: "ui-push-guide",
        uri: "persephone://guides/ui-push",
        file: "mcp-res-ui-push.md",
        description: "Log View reference: messages, dialogs, entry types, and examples for pages.logView.push and the script ui object.",
    },
    {
        name: "pages-guide",
        uri: "persephone://guides/pages",
        file: "mcp-res-pages.md",
        description: "Pages and windows reference: page properties, editor types, creating pages, and multi-window object-model paths.",
    },
    {
        name: "scripting-guide",
        uri: "persephone://guides/scripting",
        file: "mcp-res-scripting.md",
        description: "Scripting API reference: app objects, editor facades, TypeScript, and Node.js access for script.execute.",
    },
    {
        name: "graph-guide",
        uri: "persephone://guides/graph",
        file: "mcp-res-graph.md",
        description: "Force-graph editor reference: JSON data format, editor paths, editing graph data, and grouping nodes.",
    },
    {
        name: "notebook-guide",
        uri: "persephone://guides/notebook",
        file: "mcp-res-notebook.md",
        description: "Notebook editor reference: NoteItem JSON format and text, markdown, code, mermaid, and grid content types.",
    },
    {
        name: "links-guide",
        uri: "persephone://guides/links",
        file: "mcp-res-links.md",
        description: "Links editor reference: LinkItem JSON format, categories, and tags.",
    },
    {
        name: "boards-guide",
        uri: "persephone://guides/boards",
        file: "mcp-res-boards.md",
        description: "Boards authoring reference: board lifecycle, the execute channel, theme contract, local vendoring, and automation.",
    },
    {
        name: "tools-guide",
        uri: "persephone://guides/tools",
        file: "mcp-res-tools.md",
        description: "Agent Tools registry reference: discovery and execution paths, the stdin JSON/result-marker contract, environment secrets, and self-repair.",
    },
    {
        name: "ui-guide",
        uri: "persephone://guides/ui",
        file: "mcp-res-ui.md",
        description: "Persephone UI reference: the application chrome, stable selectors, and highlighting an element for the user.",
    },
    {
        name: "ui-editors-guide",
        uri: "persephone://guides/ui-editors",
        file: "mcp-res-ui-editors.md",
        description: "Editor catalog: what each Persephone editor is for, how to open it, and what it can do.",
    },
    {
        name: "browser-guide",
        uri: "persephone://guides/browser",
        file: "mcp-res-browser.md",
        description: "Browser automation reference: page targeting, snapshots, ref lifecycle, waiting, profiles, boards, and the app window.",
    },
];

// Cache resource text by file mtime so editable assets are refreshed while the app remains open.
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
