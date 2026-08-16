/** Rasterise an already-loaded image at its natural size. Kept in UIKit because
 * ImageViewport owns the mounted image element that calls it. */
export async function imageElementToPngBlob(image: HTMLImageElement): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to obtain a 2D canvas context");
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Failed to encode PNG");
    return blob;
}
