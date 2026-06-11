/**
 * IImageEditor — script interface for the Image viewer.
 *
 * Obtained via `page.asImage()`. Only for image pages.
 *
 * @example
 * const img = await page.asImage();
 * await img.savePngToFile("D:/tmp/out.png");
 */
export interface IImageEditor {
    /**
     * Re-encode the displayed image to PNG (1× scale) and write it to `filePath`.
     * Parent directories are created as needed. Returns the written path.
     */
    savePngToFile(filePath: string): Promise<string>;
}
