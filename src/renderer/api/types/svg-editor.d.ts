/**
 * ISvgEditor — script interface for the SVG preview.
 *
 * Obtained via `page.asSvg()`. Only for text pages with SVG content.
 *
 * @example
 * const svg = await page.asSvg();
 * console.log(svg.svg); // the SVG source
 */
export interface ISvgEditor {
    /** The SVG source content. */
    readonly svg: string;

    /**
     * Rasterise the SVG to PNG (1× scale) and write it to `filePath`. Parent
     * directories are created as needed. Returns the written path.
     *
     * @example
     * const svg = await page.asSvg();
     * await svg.savePngToFile("D:/tmp/image.png");
     */
    savePngToFile(filePath: string): Promise<string>;
}
