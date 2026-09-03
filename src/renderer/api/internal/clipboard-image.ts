import { pagesModel } from "../pages";

/**
 * Shared helpers for the "paste clipboard content → open it in a viewer" feature.
 *
 * `GlobalEventService` inspects the clipboard from two `paste` listeners on
 * `document`:
 *
 *  1. **Capture phase** — a real image **file** / bitmap
 *     (`getClipboardImageFile`) → Image viewer. This always wins, even when an
 *     editor is focused: a bitmap has no meaningful text representation, so
 *     there is nothing for the focused editor to paste anyway.
 *  2. **Bubble phase** — any rich HTML (`getClipboardRichHtml`) → HTML viewer,
 *     as a genuine fallback. Running last gives every component that handles
 *     paste itself first refusal; `shouldStandDownFromPaste` covers the ones
 *     that handle it without stopping propagation. This mirrors the drop
 *     handling in the same file (capture tags, bubble opens as a fallback).
 *
 * A plain-text-only clipboard carries no `text/html` at all, so it falls
 * through untouched everywhere and text editors paste as usual.
 */

/** av-grid's root element class — see `shouldStandDownFromPaste`. */
const GRID_ROOT_SELECTOR = ".avg-grid";

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
 * Return clipboard HTML worth opening in the HTML viewer, or `null`.
 *
 * Any `text/html` fragment carrying markup qualifies: a picture copied from
 * PowerPoint (an `<img>` with no bitmap beside it), a Teams conversation, a
 * table from Excel, a selection from a web page. US-729 originally gated this
 * on the fragment containing an `<img src=`, which silently dropped every
 * text-only rich copy — a Teams chat selection produces ~7 KB of `<p>`/`<span>`
 * markup and not one image tag, so nothing opened (US-1281).
 *
 * A `text/html` entry with no tag at all is not rich content and still returns
 * `null`, leaving it to normal paste handling.
 */
export function getClipboardRichHtml(e: ClipboardEvent): string | null {
    const html = e.clipboardData?.getData("text/html");
    if (!html) return null;
    return /<[a-z][a-z0-9-]*(\s|\/?>)/i.test(html) ? html : null;
}

/**
 * True when the "open pasted HTML in a new tab" fallback must not fire.
 *
 * Three stand-downs, each a component that owns the paste itself:
 *
 *  - **`defaultPrevented`** — something downstream already handled it. av-grid
 *    calls `preventDefault()` on a successful Excel paste into a selection.
 *  - **an editable target** (input, textarea, select, or a contentEditable
 *    host — which includes Monaco's hidden textarea). A native paste into an
 *    input performs the insertion as the event's *default action*, so
 *    `defaultPrevented` stays false and this check is what covers it.
 *  - **inside a grid.** av-grid only calls `preventDefault()` when the paste
 *    actually landed, so a paste it rejected (nothing selected, copy-paste
 *    disabled) would otherwise spawn a viewer tab while the user is working in
 *    the grid.
 */
export function shouldStandDownFromPaste(e: ClipboardEvent): boolean {
    if (e.defaultPrevented) return true;
    const el = (e.target as Element | null) ?? document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return !!el.closest(GRID_ROOT_SELECTOR);
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
