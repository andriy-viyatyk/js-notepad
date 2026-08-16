import { fs as appFs } from "../../api/fs";
import { ui } from "../../api/ui";
import type { IImageExport } from "../base/IImageExport";
import { errMessage } from "../../../shared/utils";
import { imageElementToPngBlob } from "../../uikit/ImageViewport/image-raster";

/**
 * Shared, view-independent image-export helpers.
 *
 * `rasterToPngBlob` loads any image source (an `image/svg+xml` data URL, a blob
 * URL, or an http(s) URL) into an offscreen `<img>`, draws it to a canvas at
 * natural size, and encodes a PNG. Because the browser performs the SVG
 * rasterisation, fonts and text render correctly — the reason this produces
 * usable output where external "mermaid → PNG" converters render empty boxes.
 *
 * These helpers are host-independent and require no mounted view, so an editor
 * can export even when its page is not the active tab.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image for export"));
        img.src = src;
    });
}

/** Rasterise an already-loaded `<img>` element to a PNG blob (natural size). */
export { imageElementToPngBlob };

/** Load `src` and rasterise it to a PNG blob (natural size, 1× scale). */
export async function rasterToPngBlob(src: string): Promise<Blob> {
    return imageElementToPngBlob(await loadImage(src));
}

export async function blobToBuffer(blob: Blob): Promise<Buffer> {
    return Buffer.from(await blob.arrayBuffer());
}

/** Read a Blob as a `data:` URL (e.g. to hand a PNG blob to `addDrawPage`). */
export function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") {
                reject(new Error("Unexpected FileReader result type"));
                return;
            }
            resolve(result);
        };
        reader.onerror = () => reject(new Error("Failed to read image blob"));
        reader.readAsDataURL(blob);
    });
}

/** Write `source`'s rendered PNG directly to `filePath` (no dialog). Backs the
 *  `savePngToFile(filePath)` script-facade method on image-capable editors. */
export async function writePngToFile(source: IImageExport, filePath: string): Promise<string> {
    const blob = await source.exportPng();
    await appFs.writeBinary(filePath, await blobToBuffer(blob));
    return filePath;
}

/** Prompt for a `.png` path and write `source`'s rendered PNG there. Backs the
 *  "Save as PNG" toolbar action shared by the Mermaid / SVG / Image editors.
 *  Failures are surfaced as a toast (the toolbar callers fire-and-forget). */
export async function savePngViaDialog(source: IImageExport): Promise<void> {
    const path = await appFs.showSaveDialog({
        title: "Save Image",
        defaultPath: `${source.suggestedImageName()}.png`,
        filters: [
            { name: "PNG", extensions: ["png"] },
            { name: "All Files", extensions: ["*"] },
        ],
    });
    if (!path) return;
    try {
        await appFs.writeBinary(path, await blobToBuffer(await source.exportPng()));
    } catch (err) {
        ui.notify(`Failed to save image: ${errMessage(err)}`, "error");
    }
}
