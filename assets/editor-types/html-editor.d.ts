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
    /** The HTML source content. */
    readonly html: string;
}
