import "./namespaces";
import { DialogsNode } from "./dialogs";
import { MenusNode } from "./menus";
import { toolsNode } from "./namespaces/tools";

import type { AppWrapper } from "../api-wrapper/AppWrapper";
import type { PageCollectionWrapper } from "../api-wrapper/PageCollectionWrapper";
import type { PageWrapper } from "../api-wrapper/PageWrapper";
import { helpSearch, IHelpSearchHit } from "../../../shared/ai-vision/help-search";
import { IAiChild, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

export interface AiRootOptions {
    /** Page supplied by a live script or by a Board owner lookup. */
    page?: PageWrapper;
    /** Additional root gate evaluated by the shared resolver for each call. */
    restricted?: () => string | undefined;
}

/**
 * The root of the renderer's AiVision tree — what `call` with an empty path lands on.
 *
 * Delegates to the script API's `AppWrapper` member by member (same names, so every hint doubles
 * as a scripting tutorial) and adds two things scripts spell differently: `page` (the active page,
 * the script global of the same name) and `helpSearch`. It is its own class rather than members
 * bolted onto `AppWrapper` so the script-facing `app` object stays exactly the `.d.ts` surface.
 */

/**
 * Names still reserved at the root: served by the main process (`windows`, `main`) or owned by
 * later tasks (`guides`, `script`, `pipe`). Kept here for declaration consumers; the main-side
 * handler routes the first two before forwarding.
 */
export const RESERVED_ROOT_NAMES: readonly string[] = ["windows", "main", "guides", "script", "pipe"];

const ROOT_MEMBERS: IAiVisionDescriptor["members"] = [
    { name: "pages", kind: "property", summary: "All open pages (tabs) in this window; index by position or page id. Also holds pages.logView — the channel for showing the user output or asking them a question." },
    { name: "page", kind: "property", summary: "The active page (same as the `page` global in scripts)." },
    { name: "helpSearch", kind: "method", signature: "helpSearch(query: string, limit = 20)", summary: "Search every hint/help text in the tree; returns paths with the matching line. Use when you know what you want but not where it lives." },
    { name: "version", kind: "property", summary: "Persephone version string." },
    { name: "settings", kind: "property", node: true, summary: "Application settings (read/write)." },
    { name: "fs", kind: "property", node: true, summary: "File system access (read/write files, list folders).", caution: "writes touch the user's disk" },
    { name: "ui", kind: "property", node: true, summary: "Dialogs, notifications, progress overlays, screen locks — and ui.elements, which names the on-screen shell controls and what each is for. Asked WHERE something is, or to SHOW the user something, start there and point at it with ui.highlight; a writable property that changes the same thing is a different question." },
    { name: "dialogs", kind: "property", node: true, summary: "Open renderer dialogs in live display order; use dialogs[i] to inspect and answer one." },
    { name: "menus", kind: "property", node: true, summary: "The open application popup menu; use menus[0] to inspect items, click an action, or close it." },
    { name: "shell", kind: "property", node: true, summary: "Open URLs, capture screen snippets, encrypt/decrypt text, and inspect runtime/update versions.", caution: "runs processes with the user's privileges" },
    { name: "window", kind: "property", node: true, summary: "This window: state, sidebar, zoom, and multi-window actions." },
    { name: "proc", kind: "property", node: true, summary: "Spawn and manage child processes.", caution: "runs processes with the user's privileges" },
    { name: "boards", kind: "property", node: true, summary: "Boards — sandboxed mini web-apps: create, open, trust, install, update, and remove." },
    { name: "tools", kind: "property", node: true, summary: "Agent Tools: search and execute registered tool scripts, inspect or refresh toolsets, and request user registration.", caution: "execution runs registered scripts with the user's privileges and registration requires user consent" },
    { name: "boardVars", kind: "property", node: true, summary: "Administer board environment variables and secrets." },
    { name: "editors", kind: "property", node: true, summary: "The editor registry: which editors exist and which languages they take." },
    { name: "recent", kind: "property", node: true, summary: "Recently opened files." },
    { name: "downloads", kind: "property", node: true, summary: "Download manager." },
    { name: "menuFolders", kind: "property", node: true, summary: "Configured folders shown in the sidebar." },
    // Answered by the main process before the path reaches this window — listed here so the root
    // hint is complete. See RESERVED_ROOT_NAMES.
    { name: "windows", kind: "property", summary: "All Persephone windows (open and closed). windows[i] is one window; prefix any path with windows[i]. to target it — without the prefix you are talking to the main window." },
    { name: "main", kind: "property", summary: "Main-process diagnostics and settings-gated scripting; process-wide, never windows[i].main." },
];

const ROOT_OVERVIEW = `
pages - open pages/tabs and the agent output channel; e.g. pages.logView.push([...])
page - the active page and its editor; e.g. page.content
helpSearch - find matching hint/help lines and paths; e.g. helpSearch("add rows")
settings - read or persist application configuration; e.g. settings.theme
fs - read/write files, directories, and OS file integration; e.g. fs.read("path")
ui - dialogs, notifications, progress, locks, and curated controls; e.g. ui.elements
dialogs - inspect and answer open renderer dialogs; e.g. dialogs[0].buttons
menus - inspect and act on the open popup menu; e.g. menus[0].items
shell - URLs, screen capture, encryption, and runtime/update services; e.g. shell.version
window - this window's state, sidebar, zoom, and multi-window actions; e.g. window.zoomLevel
proc - spawn and manage child processes; no safe example - inspect its cautioned member below
boards - local boards and their lifecycle/catalog operations; e.g. boards.list()
tools - search/execute registered Agent Tools and inspect toolsets; e.g. tools.search()
boardVars - administer board environment variables and secrets; no safe example - inspect its cautioned members below
editors - inspect available editors and file-language matches; e.g. editors.getAll()
recent - access recently opened file paths; e.g. recent.files
downloads - inspect and manage download entries; e.g. downloads.downloads
menuFolders - inspect configured sidebar folders; e.g. menuFolders.folders
windows - inspect open/closed application windows; e.g. windows[0].status
main - process-wide diagnostics and gated scripting; e.g. main.runtime`.trim();

const ROOT_HELP = `
This is Persephone's live object model. Every path here has the same name in scripts
(execute_script): "pages[0].content" is "app.pages.all[0].content" there.

Common paths:
  pages.logView.push([...])   SHOW the user output (markdown, a grid, mermaid, code, progress) or
                              ASK them a question — the agent's output channel; see its $help
  pages["<id>"].content       text of a specific page
  pages[0].editorSwitches.switchTo("grid-json")  switch the page, then use pages[0].editor.addRows(5)
  pages.showPage("<id>")      activate a page
  tools.execute               execute a registered tool (use args for tool id and JSON arguments)
  tools.toolsets              inspect current registered toolsets, including invalid and shadowed entries
  tools.toolsets.refresh()    refresh the whole registered-tool registry
  tools.createToolset         scaffold a toolset and offer the existing user registration prompt
  pages[0].tab.highlight("tab-language")  point the user at one page's tab control ("where is …?", "show me …")
  <path>.$help                long-form help for any node

Rules: arguments for the last segment go in "args" (a JSON array); assignments go in "value";
the path itself takes only short JSON literals. Unknown members return the valid member list.

Agent Tools are a root-only call namespace, not an app/script member. Search exposes environment
variable names only; credentials remain in the toolset's .env and never in a call result. Execution
returns the structured result, including advisory argWarnings when inputSchema is not satisfied;
the schema is descriptive and the tool script remains authoritative. On failure, use toolsetRoot
and stderr to repair the tool, call tools.toolsets.refresh(), and run it again. Tool output uses
the last ##PERSEPHONE_RESULT##<json> marker; unmarked stdout becomes logs or resultText and stderr is
diagnostics. Toolset refresh is whole-registry only, and createToolset never registers without the
existing user confirmation; a declined registration can be offered again with the same call.
`;

export class AiRoot implements IAiVisible {
    constructor(
        private readonly app: AppWrapper,
        private readonly options: AiRootOptions = {},
    ) {}

    private readonly dialogsNode = new DialogsNode();
    private readonly menusNode = new MenusNode();

    get pages(): PageCollectionWrapper {
        return this.app.pages;
    }

    get page(): PageWrapper | undefined {
        return this.options.page ?? this.app.pages.activePage;
    }

    helpSearch(query: string, limit?: number): Promise<IHelpSearchHit[]> {
        return helpSearch(this, String(query ?? ""), limit);
    }

    get version() { return this.app.version; }
    get settings() { return this.app.settings; }
    get fs() { return this.app.fs; }
    get ui() { return this.app.ui; }
    get dialogs(): DialogsNode { return this.dialogsNode; }
    get menus(): MenusNode { return this.menusNode; }
    get shell() { return this.app.shell; }
    get window() { return this.app.window; }
    get proc() { return this.app.proc; }
    get boards() { return this.app.boards; }
    get tools() { return toolsNode; }
    get boardVars() { return this.app.boardVars; }
    get editors() { return this.app.editors; }
    get recent() { return this.app.recent; }
    get downloads() { return this.app.downloads; }
    get menuFolders() { return this.app.menuFolders; }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Persephone",
            summary: "the root of the object model — a developer notepad with tabbed pages, specialized editors and scripting.",
            members: ROOT_MEMBERS,
            overview: ROOT_OVERVIEW,
            help: ROOT_HELP,
            children: () => this.children(),
            ...(this.options.restricted ? { restricted: this.options.restricted } : {}),
            summarize: () => ({ kind: "Persephone", version: this.app.version, pageCount: this.app.pages.all.length, activePageId: this.page?.id ?? null }),
        };
    }

    private children(): IAiChild[] {
        const children: IAiChild[] = [
            { segment: ".pages", kind: "Pages", summary: `${this.app.pages.all.length} open page(s)` },
        ];
        const active = this.page;
        if (active) {
            const restricted = active.aiVision.restricted?.();
            children.push({ segment: ".page", kind: "Page", summary: `active: "${active.title}" (${active.editor.id})`, ...(restricted ? { restricted } : {}) });
        }
        return children;
    }
}
