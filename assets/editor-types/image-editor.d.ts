import type { IHighlightResult } from "./ui";

/**
 * IImageEditor — script interface for the Image viewer.
 *
 * Obtained via `page.editor`. Only for image pages.
 *
 * @example
 * const img = page.editor;
 * await img.savePngToFile("D:/tmp/out.png");
 */
export interface IImageEditor {
    readonly id: "image-view";
    readonly name: string;
    /** Original image path when available, otherwise the loaded runtime URL. */
    readonly source?: string;
    /** Curated persistent controls owned by this image viewer, with live visibility. */
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    /** Highlight one curated image control by name. */
    highlight(name: string, message?: string): Promise<IHighlightResult>;
    /**
     * Re-encode the displayed image to PNG (1× scale) and write it to `filePath`.
     * Parent directories are created as needed. Returns the written path.
     */
    savePngToFile(filePath: string): Promise<string>;

    /** Open the Save Image dialog and save the displayed image as PNG. */
    saveAsPng(): Promise<void>;
    /** Open the Save Image dialog and save the original source bytes. */
    saveOriginal(): Promise<void>;
    /** Open the current image in a new Drawing Editor page. */
    openInDrawingEditor(): Promise<void>;
    /** Copy the loaded or rasterised image as PNG to the clipboard. */
    copyImageToClipboard(): Promise<void>;
}
