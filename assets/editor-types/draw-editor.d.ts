/**
 * Drawing editor facade — provides scripting access to the Excalidraw canvas.
 *
 * Obtain via `page.editor` on a text page with `.excalidraw` content.
 * To create a new drawing page with an image, use `app.pages.addDrawPage(dataUrl)`.
 */
export interface IDrawEditor {
    readonly id: "draw-view";
    readonly name: string;
    /**
     * Insert an image onto the live canvas.
     * Requires the drawing editor to be mounted (`editorIsMounted === true`).
     * @param dataUrl Image as data URL (e.g., `"data:image/png;base64,..."`)
     * @param options Optional placement and sizing
     */
    addImage(dataUrl: string, options?: {
        /** X position on canvas (default: 0) */
        x?: number;
        /** Y position on canvas (default: 0) */
        y?: number;
        /** Max dimension in pixels — longer side capped to this (default: 1200) */
        maxDimension?: number;
    }): Promise<void>;

    /** Export the drawing as SVG markup string. */
    exportAsSvg(): Promise<string>;

    /**
     * Export the drawing as PNG data URL.
     * @param options Optional export settings
     */
    exportAsPng(options?: {
        /** Scale factor (default: 2 for retina) */
        scale?: number;
    }): Promise<string>;

    /** Number of elements on the canvas. */
    readonly elementCount: number;

    /**
     * Whether the Excalidraw editor is currently mounted.
     * When `true`, `addImage()` works. When `false`, `addImage()` throws.
     * Use `app.pages.addDrawPage()` to create a new page with an image instead.
     */
    readonly editorIsMounted: boolean;
}
