import type { EditorView } from "./common";
import type { IPage } from "./page";
import type { ILink } from "./io.tree";
import type { ICompareMode } from "./compare";
import type { ILogViewEditor } from "./log-view-editor";
import type { HubTab } from "./tools-hub-editor";

/**
 * IPageCollection — `app.pages`
 *
 * Manage open pages (tabs) in the current window.
 *
 * @example
 * // List all open pages
 * app.pages.activePage
 *
 * // Open a file
 * await app.pages.openFile("C:/data.json");
 *
 * // Add an empty page
 * app.pages.addEmptyPage();
 */
export interface IPageCollection {
    // ── Queries ──────────────────────────────────────────────────────

    /** All open pages (tabs) in the current window. */
    readonly all: IPage[];

    /** Currently active (visible) page, or undefined. */
    readonly activePage: IPage | undefined;

    /** The grouped (side-by-side) partner of the active page, if any. */
    readonly groupedPage: IPage | undefined;
    /** Active compare-mode pairs and compare-mode controls. */
    readonly compare: ICompareMode;
    /** The fixed MCP Log View writer and inline-dialog read-back surface. */
    readonly logView: ILogViewEditor;

    /** Find a page by its ID. */
    findPage(pageId: string): IPage | undefined;

    /** Get the grouped (side-by-side) partner of a page, if any. */
    getGroupedPage(withPageId: string): IPage | undefined;

    /** True if the page is the last tab in the tab bar. */
    isLastPage(pageId?: string): boolean;

    /** True if the page is currently grouped (side-by-side). */
    isGrouped(pageId: string): boolean;

    // ── Lifecycle ────────────────────────────────────────────────────

    /** Open a file in a new or existing tab. Returns the page. */
    openFile(filePath: string): Promise<IPage | undefined>;

    /** Close a page by ID. Returns true if closed, false if cancelled (e.g. unsaved changes). */
    closePage(pageId: string): Promise<boolean>;

    /** Show the Open File dialog and open the selected file. */
    openFileWithDialog(): Promise<void>;

    /** Navigate an existing page to a different file. */
    navigatePageTo(pageId: string, newFilePath: string, options?: {
        revealLine?: number;
        highlightText?: string;
        forceTextEditor?: boolean;
    }): Promise<boolean>;

    /** Add an empty text page. */
    addEmptyPage(): IPage;

    /** Add a page with a specific editor, language, and title. Optionally set initial content. */
    addEditorPage(editor: EditorView, language: string, title: string, content?: string): IPage;

    /** Create a new drawing page with an embedded image.
     * @param dataUrl Image as data URL (e.g., `"data:image/png;base64,..."`)
     * @param title Optional page title (default: `"untitled.excalidraw"`)
     */
    addDrawPage(dataUrl: string, title?: string): Promise<IPage>;

    /**
     * Create a link collection page from an array of links or URLs.
     * The Categories panel appears in the sidebar; clicking a link navigates
     * the page's main area to show that file/URL.
     *
     * @param links Array of ILink objects or URL/path strings.
     * @param title Optional page title. Auto-suffixed with ".link.json" if missing.
     *
     * @example
     * // From file paths
     * app.pages.openLinks(["C:/data/report.csv", "C:/data/summary.txt"], "Reports");
     *
     * // From ILink objects with categories
     * app.pages.openLinks([
     *     { title: "API Docs", href: "https://docs.example.com", category: "Reference", tags: ["api"], isDirectory: false },
     *     { title: "Tutorial", href: "https://tutorial.example.com", category: "Learning", tags: ["tutorial"], isDirectory: false },
     * ], "Bookmarks");
     */
    openLinks(links: (ILink | string)[], title?: string): IPage;

    /** Open a diff view for two files side by side. */
    openDiff(params: { firstPath: string; secondPath: string }): Promise<void>;

    /** Show the About page. */
    showAboutPage(): Promise<void>;

    /** Show the Settings page. */
    showSettingsPage(): Promise<void>;

    /** Show an MCP Inspector page, optionally with a pre-filled URL. */
    showMcpInspectorPage(options?: { url?: string }): Promise<void>;

    /** Show the Tools & Editors hub, optionally selecting a tab. */
    showToolsHubPage(options?: { tab?: HubTab }): Promise<void>;

    /** Show a browser page, optionally with a profile, Tor mode, or URL. */
    showBrowserPage(options?: {
        profileName?: string;
        incognito?: boolean;
        tor?: boolean;
        url?: string;
    }): Promise<void>;

    /**
     * Open a URL in a browser tab (internal or existing).
     * Resolves to the id of the browser page the URL was opened in
     * (undefined only if no page could be opened, e.g. Tor misconfiguration).
     */
    openUrlInBrowserTab(url: string, options?: {
        incognito?: boolean;
        profileName?: string;
        external?: boolean;
    }): Promise<string | undefined>;

    // ── Navigation ───────────────────────────────────────────────────

    /** Activate (show) a page by ID. */
    showPage(pageId: string): void;

    /** Activate the next tab (wraps around). */
    showNext(): void;

    /** Activate the previous tab (wraps around). */
    showPrevious(): void;

    // ── Layout ───────────────────────────────────────────────────────

    /** Move a tab to a new position. */
    moveTab(fromId: string, toId: string): void;

    /** Pin a tab. */
    pinTab(pageId: string): void;

    /** Unpin a tab. */
    unpinTab(pageId: string): void;

    /** Group two pages side by side. */
    group(leftPageId: string, rightPageId: string): void;

    /** Remove a page from its group. */
    ungroup(pageId: string): void;
}
