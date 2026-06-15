import { pagesModel } from "../pages";

/**
 * Shared helpers for the "paste image → open in Image viewer" feature.
 *
 * `GlobalEventService` registers a single capture-phase `paste` listener on
 * `document` that calls `getClipboardImageFile`. If an image is present it calls
 * `openPastedImage` and stops propagation, so the focused editor (Monaco or any
 * input) never receives the event. Non-image pastes return `null` and flow
 * through untouched.
 */

/** Extract the first image file carried by a paste event, or `null`. */
export function getClipboardImageFile(e: ClipboardEvent): File | null {
    const items = e.clipboardData?.items;
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) return file;
        }
    }
    return null;
}

/** Open a pasted image file in a new Image viewer tab. */
export function openPastedImage(file: File): void {
    pagesModel.openImageInNewTab(URL.createObjectURL(file), "Pasted image");
}
