import { pagesModel } from "../pages";

/**
 * Shared helpers for the "paste image → open in a viewer" feature.
 *
 * `GlobalEventService` registers a single capture-phase `paste` listener on
 * `document` that inspects the clipboard:
 *
 *  1. A real image **file** / bitmap (`getClipboardImageFile`) → opened in the
 *     Image viewer. This fires even when an editor is focused — a bitmap has no
 *     meaningful text representation to paste, so we always intercept it.
 *  2. An image delivered **only as an HTML fragment** (`getClipboardImageHtml`)
 *     — e.g. a picture copied from PowerPoint / Office, where the clipboard
 *     carries no bitmap, just `text/html` with an embedded `<img>`. This is
 *     opened in the HTML viewer, but **only as a fallback**: if the paste is
 *     landing in an editable target (`isEditablePasteTarget` — Monaco, an input,
 *     a contentEditable), we stand down so that component pastes it as text and
 *     no new page is created.
 *
 * Everything else flows through untouched, so text editors paste as usual.
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

/**
 * Return clipboard HTML that carries an embedded/linked image, or `null`.
 *
 * Targets the "image copied as an HTML fragment" case (PowerPoint, Office, some
 * web copies) where no bitmap/file is placed on the clipboard — only `text/html`
 * containing an `<img>`. Plain rich text without an image returns `null` so it is
 * left to normal paste handling.
 */
export function getClipboardImageHtml(e: ClipboardEvent): string | null {
    const html = e.clipboardData?.getData("text/html");
    if (!html) return null;
    return /<img\b[^>]*\bsrc\s*=/i.test(html) ? html : null;
}

/**
 * True when the paste is landing in an editable element (input, textarea,
 * select, or a contentEditable host — which includes Monaco's hidden textarea).
 * Such targets consume the paste as text, so the global "open in a new page"
 * fallback must stand down.
 */
export function isEditablePasteTarget(e: ClipboardEvent): boolean {
    const el = (e.target as Element | null) ?? document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.isContentEditable;
}

/** Open a pasted image file in a new Image viewer tab. */
export function openPastedImage(file: File): void {
    pagesModel.openImageInNewTab(URL.createObjectURL(file), "Pasted image");
}

/** Open pasted clipboard HTML in a new HTML viewer tab. */
export function openPastedHtml(html: string): void {
    const page = pagesModel.addEditorPage("html-view", "html", "Pasted HTML", html);
    pagesModel.showPage(page.id);
}
