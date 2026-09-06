import type { IHighlightResult } from "./ui";

/**
 * IHtmlEditor — script interface for the HTML preview.
 *
 * Obtained via `page.editor`. Only for text pages with HTML content.
 *
 * @example
 * const htmlEditor = page.editor;
 * console.log(htmlEditor.html); // the HTML source
 */
export interface IHtmlEditor {
    readonly id: "html-view";
    readonly name: string;
    /** Curated host-chrome controls, with live visibility. Selectors do not cross the preview iframe. */
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    /** Highlight one curated host-chrome control by name. */
    highlight(name: string, message?: string): Promise<IHighlightResult>;
    /** True if the HTML preview content host is attached. */
    readonly viewMounted: boolean;
    /** The HTML source content, or undefined when the rendered view is not mounted. */
    readonly html?: string;
    readonly capturing: boolean;

    savePngToFile(filePath: string): Promise<string>;
    copyImageToClipboard(): Promise<void>;
    openInImageView(): Promise<void>;
    editImage(): Promise<void>;
}
