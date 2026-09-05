/**
 * IMarkdownEditor — script interface for the markdown preview.
 *
 * Obtained via `page.editor`. Only for text pages with markdown content.
 *
 * @example
 * const md = page.editor;
 * if (md.viewMounted) {
 *     console.log(md.html); // rendered HTML from the preview
 * }
 */
export interface IMarkdownEditor {
    readonly id: "md-view";
    readonly name: string;
    /** True if the markdown preview container is mounted in the DOM. */
    readonly viewMounted: boolean;

    /** The rendered HTML content from the preview container. Empty if view is not mounted. */
    readonly html: string;
}
