import type { PagesModel } from "../../api/pages/PagesModel";
import type { PageModel } from "../../api/pages/PageModel";
import { PageWrapper } from "./PageWrapper";
import { EditorView } from "../../../shared/types";
import type { ILink } from "../../api/types/io.tree";
import type { IAiChild, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { CompareModeNode } from "../ai-vision/page-compare";
import { LogViewEditorFacade } from "./LogViewEditorFacade";
import { getMcpLogViewEditor, getOrCreateMcpLogViewEditor } from "../../api/mcp/log-view-access";
import type { HubTab } from "../../api/types/tools-hub-editor";
import {
    validateBrowserOpenInput,
    validatePipelineOpenInput,
} from "../../api/pages/open-url-validation";

// AiVision (EPIC-083): the kind-level description of this wrapper. Kept next to the members it
// describes so a new method and its descriptor entry land in the same diff.
const PAGES_MEMBERS: readonly IAiMember[] = [
    { name: "all", kind: "property", summary: "Every open page as an array (index by position)." },
    { name: "activePage", kind: "property", summary: "The active page, or nothing when no page is open." },
    { name: "groupedPage", kind: "property", summary: "The page grouped beside the active one, if any." },
    { name: "findPage", kind: "method", signature: "findPage(pageId: string)", summary: "A page by id." },
    { name: "getGroupedPage", kind: "method", signature: "getGroupedPage(withPageId: string)", summary: "The page grouped with the given page, if any." },
    { name: "isGrouped", kind: "method", signature: "isGrouped(pageId: string)", summary: "Whether the page is part of a side-by-side group." },
    { name: "isLastPage", kind: "method", signature: "isLastPage(pageId?: string)", summary: "Whether the page is the only one open." },
    { name: "openFile", kind: "method", signature: "openFile(filePath: string)", summary: "Open a file from disk in a new page (or focus it if already open); returns the page." },
    { name: "closePage", kind: "method", signature: "closePage(pageId: string)", summary: "Close a page.", caution: "unsaved changes prompt the user; a discarded page is gone" },
    { name: "openFileWithDialog", kind: "method", signature: "openFileWithDialog()", summary: "Show the OS open-file dialog to the user." },
    { name: "navigatePageTo", kind: "method", signature: "navigatePageTo(pageId, newFilePath, options?: { revealLine?, highlightText?, forceTextEditor? })", summary: "Point an existing page at another file." },
    { name: "addEmptyPage", kind: "method", signature: "addEmptyPage()", summary: "New empty text page; returns it." },
    { name: "addEditorPage", kind: "method", signature: "addEditorPage(editor, language, title)", summary: "New page with a given editor id (monaco, grid-json, md-view, …) and language; returns it." },
    { name: "addDrawPage", kind: "method", signature: "addDrawPage(dataUrl: string, title?)", summary: "New drawing page from an image data URL." },
    { name: "openLinks", kind: "method", signature: "openLinks(links: (string | ILink)[], title?)", summary: "New links page listing the given URLs/paths." },
    { name: "openDiff", kind: "method", signature: "openDiff({ firstPath, secondPath })", summary: "Open a file compare page." },
    { name: "compare", kind: "property", node: true, summary: "Inspect active compare pairs and enter or exit compare mode for a grouped pair." },
    { name: "logView", kind: "property", node: true, summary: "SHOW THE USER SOMETHING, or ASK THEM A QUESTION: the agent's output channel. push() renders log lines, markdown, mermaid diagrams, grids, code and progress bars into a Log View page, and raises the six interactive dialog types. Use it instead of building a page by hand." },
    { name: "showAboutPage", kind: "method", signature: "showAboutPage()", summary: "Show the About page." },
    { name: "showSettingsPage", kind: "method", signature: "showSettingsPage()", summary: "Show Settings." },
    { name: "showMcpInspectorPage", kind: "method", signature: "showMcpInspectorPage(options?: { url? })", summary: "Show the MCP inspector page." },
    { name: "showMnemeConfigPage", kind: "method", signature: "showMnemeConfigPage()", summary: "Open the Mneme configuration page." },
    { name: "showToolsHubPage", kind: "method", signature: "showToolsHubPage(options?: { tab?: HubTab })", summary: "Show the Tools & Editors hub, optionally selecting a tab." },
    { name: "showBrowserPage", kind: "method", signature: "showBrowserPage(options?: { profileName?, incognito?, tor?, url? })", summary: "Show (or open) a browser page. Choose profileName from settings.browserProfiles; an empty profileName selects the built-in default. Incognito/Tor pages you open this way are yours to read and drive; the user's own private pages stay blocked." },
    { name: "openUrlInBrowserTab", kind: "method", signature: "openUrlInBrowserTab(url, options?: { incognito?, profileName?, external? })", summary: "Open a plain web page or search query in/reusing a browser tab; pages.openUrl(...) is for file-like URLs. Requires a non-empty string and does not reject search text. Returns the page id BEFORE the document loads; act too early and the action lands on a document about to be replaced and still reports success. Await pages[pageId].editor.waitFor({ selector }) (or { text }) for content you expect — waitForNavigation() can return at once because the old document is already complete. Read pages[pageId].title after the wait.", caution: "opens or navigates a browser page" },
    { name: "openUrl", kind: "method", signature: "openUrl(url, options?: { editor? })", summary: "Route a supported URL naming a file through the content pipeline; pages.openUrlInBrowserTab(...) is for a plain web page or search query. Empty, malformed, unsupported, and non-string hrefs are rejected. Cannot name the opened page; inspect pages afterward.", caution: "opens or navigates a page using the content pipeline" },
    { name: "showPage", kind: "method", signature: "showPage(pageId: string)", summary: "Activate (focus) a page." },
    { name: "showNext", kind: "method", signature: "showNext()", summary: "Activate the next tab." },
    { name: "showPrevious", kind: "method", signature: "showPrevious()", summary: "Activate the previous tab." },
    { name: "moveTab", kind: "method", signature: "moveTab(fromId, toId)", summary: "Reorder tabs." },
    { name: "pinTab", kind: "method", signature: "pinTab(pageId)", summary: "Pin a tab." },
    { name: "unpinTab", kind: "method", signature: "unpinTab(pageId)", summary: "Unpin a tab." },
    { name: "group", kind: "method", signature: "group(leftPageId, rightPageId)", summary: "Show two pages side by side." },
    { name: "ungroup", kind: "method", signature: "ungroup(pageId)", summary: "Dissolve a page's side-by-side group." },
];

const PAGES_HELP = `
The open pages (tabs) of this window. Index by position — pages[0] — or by id — pages["<id>"].
Ids are stable while the page is open; positions change when tabs move.
Read a page's text with pages[i].content, replace it by assigning "value" to the same path, switch
editors with pages[i].editor; narrow its id for editor-specific operations, then use
pages[i].editorSwitches.switchTo(id) to switch. Create pages with addEmptyPage(), addEditorPage(...)
or openFile(path). For a non-monaco editor, pass the editor's required language; structured pages
also need the documented title suffix when the editor-switch button depends on it. The editor
registry and the pages resource provide the complete editor/language/suffix table.

pages.logView belongs to this window. With multiple windows, address the intended window before
using its Log View; otherwise output is written to the first/current window selected by the call
context.

openDiff({ firstPath, secondPath }) remains the path-based entry point that
opens/groups pages and enters compare mode. Inspect pages.compare.pairs for explicit left/right
page identity, use pages.compare.enter(pageId) or exit(pageId) for compare mode, and highlight
compare-root or compare-exit through pages.compare.elements. Compare elements live in the active
pair's left page slot.
To SHOW the user something or ASK them a question, use pages.logView — not a hand-built page. One
pages.logView.push([...]) call renders log lines, markdown, mermaid diagrams, grids (JSON or CSV),
code blocks and progress bars, and raises the six input.* dialog types. push() returns immediately
with the ids of any dialogs it created; the user answers them in the page and you read the answer
with pages.logView.dialogResult(id). Reading pages.logView never opens a page: its state
reads as undefined until one exists, and push() creates and focuses it. Scripts also have the
global ui facade for the same channel.
For opening a plain web page or search query, use pages.openUrlInBrowserTab(url, options); it accepts
any non-empty string and returns a browser page id before the document necessarily loads. Await
pages[pageId].editor.waitFor({ selector }) (waitForNavigation() may return at once) before
page-content actions, then read pages[pageId].title for the loaded title. For a URL naming a file or
other content source, use pages.openUrl(url, { editor? }); it validates a supported pipeline href,
returns void, cannot name the opened page, and requires inspecting pages after the await. These two
openers are distinct: pages.openUrlInBrowserTab always opens a browser tab, while pages.openUrl
routes a file-like URL through the content pipeline and lets it choose the editor. The ordinary page-object guidance above remains the
place for opening files by path with openFile(path).
`;

/**
 * Safe wrapper around PagesModel for script access.
 * Implements the IPageCollection interface from api/types/pages.d.ts.
 *
 * All query methods return PageWrapper instances (not raw EditorModel).
 */
export class PageCollectionWrapper implements IAiVisible {
    constructor(
        private readonly pages: PagesModel,
        private readonly releaseList: Array<() => void>,
        /** MCP-originated context: browser pages opened here are marked as the agent's own. */
        private readonly openedByAgent = false,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Pages",
            summary: "The open pages (tabs) of this window.",
            members: PAGES_MEMBERS,
            help: PAGES_HELP,
            children: () => this.aiChildren(),
            index: (key) => (typeof key === "number" ? this.all[key] : this.findPage(key)),
            summarize: () => ({ kind: "Pages", count: this.all.length, activePageId: this.pages.activePage?.id ?? null }),
        };
    }

    private aiChildren(): IAiChild[] {
        const activeId = this.pages.activePage?.id;
        const children: IAiChild[] = [
            { segment: ".compare", kind: this.compare.aiVision.kind, summary: "active compare pairs and compare-mode controls" },
            { segment: ".logView", kind: "LogViewEditor", summary: "show the user output or ask them a question — the agent's output channel" },
        ];
        children.push(...this.all.map((page, i) => {
            const restricted = page.aiVision.restricted?.();
            const active = page.id === activeId ? " ← active" : "";
            return {
                segment: `[${i}]`,
                kind: "Page",
                summary: `"${page.title}" id=${page.id} (${page.editor.id}${page.modified ? ", modified" : ""})${active}`,
                ...(restricted ? { restricted } : {}),
            };
        }));
        return children;
    }

    get compare(): CompareModeNode {
        return new CompareModeNode(this.pages);
    }

    get logView(): LogViewEditorFacade {
        // Reading resolves; only a write creates the page. See LogViewEditorFacade's constructor.
        return new LogViewEditorFacade(getMcpLogViewEditor, "log-view", "Log View", getOrCreateMcpLogViewEditor);
    }

    private wrap(page: PageModel | null | undefined): PageWrapper | undefined {
        const editor = page?.mainEditor;
        return editor ? new PageWrapper(editor, this.releaseList) : undefined;
    }

    // ── Queries ───────────────────────────────────────────────────────

    get all(): PageWrapper[] {
        return this.pages.pages
            .filter((p) => p.mainEditor)
            .map((p) => new PageWrapper(p.mainEditor, this.releaseList));
    }

    get activePage(): PageWrapper | undefined {
        return this.wrap(this.pages.activePage);
    }

    get groupedPage(): PageWrapper | undefined {
        return this.wrap(this.pages.groupedPage);
    }

    findPage(pageId: string): PageWrapper | undefined {
        return this.wrap(this.pages.findPage(pageId));
    }

    getGroupedPage(withPageId: string): PageWrapper | undefined {
        return this.wrap(this.pages.getGroupedPage(withPageId));
    }

    isLastPage(pageId?: string): boolean {
        return this.pages.isLastPage(pageId);
    }

    isGrouped(pageId: string): boolean {
        return this.pages.isGrouped(pageId);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    async openFile(filePath: string): Promise<PageWrapper | undefined> {
        const page = await this.pages.openFile(filePath);
        return this.wrap(page);
    }

    closePage(pageId: string): Promise<boolean> {
        return this.pages.closePage(pageId);
    }

    openFileWithDialog(): Promise<void> {
        return this.pages.openFileWithDialog();
    }

    navigatePageTo(
        pageId: string,
        newFilePath: string,
        options?: {
            revealLine?: number;
            highlightText?: string;
            forceTextEditor?: boolean;
        },
    ): Promise<boolean> {
        return this.pages.navigatePageTo(pageId, newFilePath, options);
    }

    addEmptyPage(): PageWrapper {
        const page = this.pages.addEmptyPage();
        return this.wrap(page);
    }

    addEditorPage(
        editor: EditorView,
        language: string,
        title: string,
    ): PageWrapper {
        const page = this.pages.addEditorPage(editor, language, title);
        return this.wrap(page);
    }

    async addDrawPage(dataUrl: string, title?: string): Promise<PageWrapper> {
        const page = await this.pages.addDrawPage(dataUrl, title);
        return this.wrap(page);
    }

    openLinks(
        links: (ILink | string)[],
        title?: string,
    ): PageWrapper {
        const page = this.pages.openLinks(links, title);
        return this.wrap(page);
    }

    openDiff(params: {
        firstPath: string;
        secondPath: string;
    }): Promise<void> {
        return this.pages.openDiff(params);
    }

    showAboutPage(): Promise<void> {
        return this.pages.showAboutPage();
    }

    showSettingsPage(): Promise<void> {
        return this.pages.showSettingsPage();
    }

    showMcpInspectorPage(options?: { url?: string }): Promise<void> {
        return this.pages.showMcpInspectorPage(options);
    }

    showMnemeConfigPage(): Promise<void> {
        return this.pages.showMnemeConfigPage();
    }

    showToolsHubPage(options?: { tab?: HubTab }): Promise<void> {
        return this.pages.showToolsHubPage(options);
    }

    showBrowserPage(options?: {
        profileName?: string;
        incognito?: boolean;
        tor?: boolean;
        url?: string;
    }): Promise<void> {
        // Internal showBrowserPage returns the PageModel; the script-facing API
        // stays void — scripts must not receive internal model instances.
        return this.pages.showBrowserPage({ ...options, openedByAgent: this.openedByAgent }).then((): void => undefined);
    }

    openUrlInBrowserTab(
        url: string,
        options?: {
            incognito?: boolean;
            profileName?: string;
            external?: boolean;
        },
    ): Promise<string | undefined> {
        const href = validateBrowserOpenInput(url);
        const internalOptions = {
            ...(options?.incognito !== undefined ? { incognito: options.incognito } : {}),
            ...(options?.profileName !== undefined ? { profileName: options.profileName } : {}),
            ...(options?.external !== undefined ? { external: options.external } : {}),
            ...(this.openedByAgent ? { openedByAgent: true } : {}),
        };
        return this.pages.openUrlInBrowserTab(href, internalOptions);
    }

    async openUrl(url: string, options?: { editor?: string }): Promise<void> {
        const href = validatePipelineOpenInput(url);
        if (options !== undefined && (typeof options !== "object" || options === null || Array.isArray(options))) {
            throw new TypeError("pages.openUrl options must be an object with an optional string editor.");
        }
        if (options?.editor !== undefined && typeof options.editor !== "string") {
            throw new TypeError("pages.openUrl options.editor must be a string when provided.");
        }

        const { app } = await import("../../api/app");
        await app.openRawLink(
            href,
            options?.editor !== undefined ? { editor: options.editor } : undefined,
        );
    }

    // ── Navigation ────────────────────────────────────────────────────

    showPage(pageId: string): void {
        // `pagesModel.showPage` ignores an id it does not know, so a mistyped or stale page id
        // used to return quietly and leave a different page active — the caller then acted on
        // the wrong page believing it had switched. Refuse instead, and name the ids that exist:
        // a guessed value must never be accepted silently.
        if (!this.pages.findPage(pageId)) {
            const known = this.all.map(page => page.id).join(", ");
            throw new Error(
                `No page with id ${JSON.stringify(pageId)}. Open page ids are: ${known || "(none)"}.`,
            );
        }
        this.pages.showPage(pageId);
    }

    showNext(): void {
        this.pages.showNext();
    }

    showPrevious(): void {
        this.pages.showPrevious();
    }

    // ── Layout ────────────────────────────────────────────────────────

    moveTab(fromId: string, toId: string): void {
        this.pages.moveTab(fromId, toId);
    }

    pinTab(pageId: string): void {
        this.pages.pinTab(pageId);
    }

    unpinTab(pageId: string): void {
        this.pages.unpinTab(pageId);
    }

    group(leftPageId: string, rightPageId: string): void {
        this.pages.group(leftPageId, rightPageId);
    }

    ungroup(pageId: string): void {
        this.pages.ungroup(pageId);
    }
}
