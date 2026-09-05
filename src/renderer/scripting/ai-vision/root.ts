import type { AppWrapper } from "../api-wrapper/AppWrapper";
import type { PageCollectionWrapper } from "../api-wrapper/PageCollectionWrapper";
import type { PageWrapper } from "../api-wrapper/PageWrapper";
import { helpSearch, IHelpSearchHit } from "../../../shared/ai-vision/help-search";
import { IAiChild, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

/**
 * The root of the renderer's AiVision tree — what `call` with an empty path lands on.
 *
 * Delegates to the script API's `AppWrapper` member by member (same names, so every hint doubles
 * as a scripting tutorial) and adds two things scripts spell differently: `page` (the active page,
 * the script global of the same name) and `helpSearch`. It is its own class rather than members
 * bolted onto `AppWrapper` so the script-facing `app` object stays exactly the `.d.ts` surface.
 */

/**
 * Names the epic reserves at the root for later tasks — served by the main process (`windows`,
 * `main`) or not yet built (`guides`, `tools`, `script`, `pipe`). Kept here so no renderer member
 * ever takes one of them; the main-side handler routes the first two before forwarding.
 */
export const RESERVED_ROOT_NAMES: readonly string[] = ["windows", "main", "guides", "tools", "script", "pipe"];

const ROOT_MEMBERS: IAiVisionDescriptor["members"] = [
    { name: "pages", kind: "property", summary: "All open pages (tabs) in this window; index by position or page id." },
    { name: "page", kind: "property", summary: "The active page (same as the `page` global in scripts)." },
    { name: "helpSearch", kind: "method", signature: "helpSearch(query: string, limit = 20)", summary: "Search every hint/help text in the tree; returns paths with the matching line. Use when you know what you want but not where it lives." },
    { name: "version", kind: "property", summary: "Persephone version string." },
    { name: "settings", kind: "property", summary: "Application settings (read/write)." },
    { name: "fs", kind: "property", summary: "File system access (read/write files, list folders).", caution: "writes touch the user's disk" },
    { name: "ui", kind: "property", summary: "Notifications, dialogs, the Log View." },
    { name: "shell", kind: "property", summary: "Open paths/URLs with the OS and run shell commands.", caution: "runs processes with the user's privileges" },
    { name: "window", kind: "property", summary: "This window: title, size, focus, sidebar." },
    { name: "proc", kind: "property", summary: "Spawn and manage child processes.", caution: "runs processes with the user's privileges" },
    { name: "boards", kind: "property", summary: "Boards — sandboxed mini web-apps: create, open, refresh." },
    { name: "boardVars", kind: "property", summary: "Variables shared with boards." },
    { name: "editors", kind: "property", summary: "The editor registry: which editors exist and which languages they take." },
    { name: "recent", kind: "property", summary: "Recently opened files." },
    { name: "downloads", kind: "property", summary: "Download manager." },
    { name: "menuFolders", kind: "property", summary: "Folders pinned to the menu bar." },
];

const ROOT_HELP = `
This is Persephone's live object model. Every path here has the same name in scripts
(execute_script): "pages[0].content" is "app.pages.all[0].content" there.

Common paths:
  pages                       list open pages
  page.content                text of the active page (assign with "value")
  pages["<id>"].content       text of a specific page
  pages[0].asGrid().rowCount  rows in a grid page (facades: asText, asGrid, asNotebook, …)
  pages.showPage("<id>")      activate a page
  helpSearch("add rows")      find where something lives
  <path>.$help                long-form help for any node

Rules: arguments for the last segment go in "args" (a JSON array); assignments go in "value";
the path itself takes only short JSON literals. Unknown members return the valid member list.
`;

export class AiRoot implements IAiVisible {
    constructor(private readonly app: AppWrapper) {}

    get pages(): PageCollectionWrapper {
        return this.app.pages;
    }

    get page(): PageWrapper | undefined {
        return this.app.pages.activePage;
    }

    helpSearch(query: string, limit?: number): Promise<IHelpSearchHit[]> {
        return helpSearch(this, String(query ?? ""), limit);
    }

    get version() { return this.app.version; }
    get settings() { return this.app.settings; }
    get fs() { return this.app.fs; }
    get ui() { return this.app.ui; }
    get shell() { return this.app.shell; }
    get window() { return this.app.window; }
    get proc() { return this.app.proc; }
    get boards() { return this.app.boards; }
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
            help: ROOT_HELP,
            children: () => this.children(),
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
            children.push({ segment: ".page", kind: "Page", summary: `active: "${active.title}" (${active.editor})`, ...(restricted ? { restricted } : {}) });
        }
        return children;
    }
}
