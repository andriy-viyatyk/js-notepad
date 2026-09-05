import type { EditorView } from "./common";
import type { ITextEditor } from "./text-editor";
import type { IGridEditor } from "./grid-editor";
import type { INotebookEditor } from "./notebook-editor";
import type { ILinkEditor } from "./link-editor";
import type { IBrowserEditor } from "./browser-editor";
import type { IMarkdownEditor } from "./markdown-editor";
import type { ISvgEditor } from "./svg-editor";
import type { IHtmlEditor } from "./html-editor";
import type { IMermaidEditor } from "./mermaid-editor";
import type { IGraphEditor } from "./graph-editor";
import type { IMcpInspectorEditor } from "./mcp-inspector-editor";
import type { IImageEditor } from "./image-editor";
import type { IPagePanels } from "./page-panels";

/**
 * IPage — represents a page (tab) in the current window.
 *
 * Available as the `page` global in scripts, or via `app.pages.activePage`.
 *
 * @example
 * // Read/write content
 * page.content = page.content.toUpperCase();
 *
 * // Access grouped page (auto-creates if none)
 * page.grouped.content = JSON.stringify(result);
 *
 * // Store data across script runs
 * page.data.counter = (page.data.counter || 0) + 1;
 */
export interface IPage {
    /** Unique page identifier. */
    readonly id: string;

    /** Display title. */
    readonly title: string;

    /** True if page has unsaved changes. */
    readonly modified: boolean;

    /** True if tab is pinned. */
    readonly pinned: boolean;

    /** Absolute file path, if the page is backed by a file. */
    readonly filePath?: string;

    /** Text content. Get/set. Only meaningful for text-based pages. */
    content: string;

    /** Language ID (e.g., "json", "typescript"). Get/set. */
    language: string;

    /** Active editor ID (e.g., "monaco", "grid-json"). Get/set. */
    editor: EditorView;

    /**
     * In-memory data storage for scripts.
     * Persists across script runs for this page, but does not survive app restart.
     */
    readonly data: Record<string, any>;

    /** Live sidebar panels, state observations, and whole-sidebar controls. */
    readonly panels: IPagePanels;

    /**
     * Grouped (side-by-side) partner page.
     * Auto-creates and groups a new text page if none exists.
     */
    readonly grouped: IPage;

    // ── Editor Facades ─────────────────────────────────────────────

    /**
     * Get text editor interface (Monaco-specific features). Only for text pages.
     * @param force - If true and the page isn't currently a Monaco editor, attempt to
     *                switch using the same compatibility source as the UI switch widget.
     *                Throws if the page can't switch. Default false (throws if not already Monaco).
     */
    asText(force?: boolean): Promise<ITextEditor>;

    /**
     * Get grid editor interface (data manipulation). Only for text pages with JSON/CSV content.
     * @param force - If true and the page isn't currently a Grid editor, attempt to switch
     *                using the same compatibility source as the UI switch widget. Throws if
     *                the page can't switch. Default false (throws if not already a Grid editor).
     */
    asGrid(force?: boolean): Promise<IGridEditor>;

    /**
     * Get notebook editor interface. Only for text pages with `.note.json` content.
     * @param force - If true and the page isn't currently a Notebook editor, attempt to switch.
     */
    asNotebook(force?: boolean): Promise<INotebookEditor>;

    /**
     * Get link editor interface. Only for text pages with `.link.json` content.
     * @param force - If true and the page isn't currently a Link editor, attempt to switch.
     */
    asLink(force?: boolean): Promise<ILinkEditor>;

    /**
     * Get markdown preview interface. Only for text pages with markdown content.
     * @param force - If true and the page isn't currently a Markdown editor, attempt to switch.
     */
    asMarkdown(force?: boolean): Promise<IMarkdownEditor>;

    /**
     * Get SVG preview interface. Only for text pages with SVG content.
     * @param force - If true and the page isn't currently an SVG editor, attempt to switch.
     */
    asSvg(force?: boolean): Promise<ISvgEditor>;

    /**
     * Get HTML preview interface. Only for text pages with HTML content.
     * @param force - If true and the page isn't currently an HTML editor, attempt to switch.
     */
    asHtml(force?: boolean): Promise<IHtmlEditor>;

    /**
     * Get Mermaid diagram preview interface. Only for text pages with mermaid content.
     * @param force - If true and the page isn't currently a Mermaid editor, attempt to switch.
     */
    asMermaid(force?: boolean): Promise<IMermaidEditor>;

    /**
     * Get graph editor interface. Only for text pages with force-graph JSON content.
     * @param force - If true and the page isn't currently a Graph editor, attempt to switch.
     */
    asGraph(force?: boolean): Promise<IGraphEditor>;

    /**
     * Get drawing editor interface. Only for text pages with `.excalidraw` content.
     * @param force - If true and the page isn't currently a Draw editor, attempt to switch.
     */
    asDraw(force?: boolean): Promise<IDrawEditor>;

    /** Get browser editor interface. Only for browser pages. */
    asBrowser(): Promise<IBrowserEditor>;

    /** Get MCP Inspector interface. Only for MCP Inspector pages. */
    asMcpInspector(): Promise<IMcpInspectorEditor>;

    /**
     * Get the Image viewer interface. Only for image pages. Exposes
     * `savePngToFile(filePath)` to write the image to disk as PNG.
     */
    asImage(): Promise<IImageEditor>;

    /**
     * Run this page's content as a script (same as pressing F5).
     * Only works for javascript/typescript pages.
     * Returns the script result as text.
     *
     * @example
     * const scriptPage = app.pages.all.find(p => p.title === "my-script.js");
     * await scriptPage.runScript();
     */
    runScript(): Promise<string>;
}
