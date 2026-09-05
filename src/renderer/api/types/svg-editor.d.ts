import type { IHighlightResult } from "./ui";

/**
 * ISvgEditor — script interface for the SVG preview.
 *
 * Obtained via `page.editor`. Only for text pages with SVG content.
 *
 * @example
 * const svg = page.editor;
 * console.log(svg.svg); // the SVG source
 */
export interface ISvgEditor {
    readonly id: "svg-view";
    readonly name: string;
    /** Curated persistent controls owned by this preview, with live visibility. */
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    /** Highlight one curated preview control by name. */
    highlight(name: string, message?: string): Promise<IHighlightResult>;
    /** The SVG source content. */
    readonly svg: string;

    /**
     * Rasterise the SVG to PNG (1× scale) and write it to `filePath`. Parent
     * directories are created as needed. Returns the written path.
     *
     * @example
     * const svg = page.editor;
     * await svg.savePngToFile("D:/tmp/image.png");
     */
    savePngToFile(filePath: string): Promise<string>;

    openInDrawingEditor(): Promise<void>;
    copyImageToClipboard(): Promise<void>;
}
