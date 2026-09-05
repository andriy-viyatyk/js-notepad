import "./namespaces";
import { DialogsNode } from "./dialogs";

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
    { name: "settings", kind: "property", node: true, summary: "Application settings (read/write)." },
    { name: "fs", kind: "property", node: true, summary: "File system access (read/write files, list folders).", caution: "writes touch the user's disk" },
    { name: "ui", kind: "property", node: true, summary: "Dialogs, notifications, progress overlays, screen locks, and app-window highlights." },
    { name: "dialogs", kind: "property", node: true, summary: "Open renderer dialogs in live display order; use dialogs[i] to inspect and answer one." },
    { name: "shell", kind: "property", node: true, summary: "Open URLs, capture screen snippets, encrypt/decrypt text, and inspect runtime/update versions.", caution: "runs processes with the user's privileges" },
    { name: "window", kind: "property", node: true, summary: "This window: state, sidebar, zoom, and multi-window actions." },
    { name: "proc", kind: "property", node: true, summary: "Spawn and manage child processes.", caution: "runs processes with the user's privileges" },
    { name: "boards", kind: "property", node: true, summary: "Boards — sandboxed mini web-apps: create, open, trust, install, update, and remove." },
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

const ROOT_HELP = `
This is Persephone's live object model. Every path here has the same name in scripts
(execute_script): "pages[0].content" is "app.pages.all[0].content" there.

Common paths:
  pages                       list open pages
  page.content                text of the active page (assign with "value")
  pages["<id>"].content       text of a specific page
  pages[0].asGrid().rowCount  rows in a grid page (facades: asText, asGrid, asNotebook, …)
  dialogs[0].click("OK")   answer the first open renderer dialog (or use dialogs[0].cancel())
  pages.showPage("<id>")      activate a page
  helpSearch("add rows")      find where something lives
  main                        main-process diagnostics and gated scripting
  <path>.$help                long-form help for any node

Rules: arguments for the last segment go in "args" (a JSON array); assignments go in "value";
the path itself takes only short JSON literals. Unknown members return the valid member list.
`;

export class AiRoot implements IAiVisible {
    constructor(
        private readonly app: AppWrapper,
        private readonly options: AiRootOptions = {},
    ) {}

    private readonly dialogsNode = new DialogsNode();

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
            children.push({ segment: ".page", kind: "Page", summary: `active: "${active.title}" (${active.editor})`, ...(restricted ? { restricted } : {}) });
        }
        return children;
    }
}
