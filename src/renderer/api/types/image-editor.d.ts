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
    /**
     * Re-encode the displayed image to PNG (1× scale) and write it to `filePath`.
     * Parent directories are created as needed. Returns the written path.
     */
    savePngToFile(filePath: string): Promise<string>;
}
