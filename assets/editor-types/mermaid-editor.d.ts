/**
 * IMermaidEditor — script interface for the Mermaid diagram preview.
 *
 * Obtained via `page.editor`. Only for text pages with mermaid content.
 *
 * @example
 * const mermaid = page.editor;
 * if (!mermaid.loading && !mermaid.error) {
 *     console.log(mermaid.svgUrl); // data URL of the rendered SVG
 * }
 */
export interface IMermaidEditor {
    readonly id: "mermaid-view";
    readonly name: string;
    /** Data URL of the rendered SVG diagram. Empty while loading or on error. */
    readonly svgUrl: string;

    /** True while the diagram is being rendered. */
    readonly loading: boolean;

    /** Error message if rendering failed. Empty on success. */
    readonly error: string;

    /**
     * Render the diagram to PNG (1× scale) and write it to `filePath`. Parent
     * directories are created as needed. Returns the written path. Renders the
     * diagram on demand if it has not been rendered yet.
     *
     * @example
     * const m = page.editor;
     * await m.savePngToFile("D:/tmp/diagram.png");
     */
    savePngToFile(filePath: string): Promise<string>;
}
