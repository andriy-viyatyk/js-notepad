# US-729: Paste image-bearing HTML into a new HTML viewer tab

**Status:** Implemented — pending review.

## Goal

Make Persephone catch pictures copied from apps (notably PowerPoint / Office) that place the image on the clipboard **only as an HTML fragment** — with no bitmap/file — so Ctrl+V opens the content in a new HTML viewer tab instead of doing nothing.

## Background

The existing "paste image → Image viewer" feature lives in:

- `src/renderer/api/internal/clipboard-image.ts` — clipboard helpers.
- `src/renderer/api/internal/GlobalEventService.ts` — a single **capture-phase** `paste` listener on `document` (`handlePaste`, registered at `document.addEventListener("paste", this.handlePaste, true)`).

The old handler only acted when `getClipboardImageFile` found a clipboard **file** of type `image/*`; everything else fell through to the focused editor.

### The gap

A picture copied from PowerPoint puts **no bitmap** on the clipboard (`clipboard.readImage()` is empty). The clipboard carries only:
- `text/plain` — whitespace,
- `text/html` — an Office fragment (`data-slideid`, `data-shapeids`, VML) containing a single `<img src="data:image/jpg;base64,…">`.

Teams pastes it because it reads the HTML; Persephone missed it because it only looked for bitmap files.

### Why HTML viewer (not image extraction)

`html-view` renders content in a sandboxed `srcDoc` iframe and its `HtmlEditor` already exposes toolbar actions to export the rendered page as PNG, copy it, or open it in the Image viewer (`openInImageView` / `copyImageToClipboard`). So routing to the HTML viewer renders the picture **and** still lets the user get the image out — strictly more than extracting the bare `<img>`, and it degrades gracefully when the fragment is richer than a single image.

### Key constraint (from user)

The paste listener is global. It must be a **fallback**: a paste landing in an editable target (Monaco, input, textarea, contentEditable) must paste as text — no new page. Only pastes that no editor consumes open a new HTML viewer tab. (Genuine rich-text pastes always carry real text and land in an editor, so they are unaffected.)

## Implementation (done)

### `src/renderer/api/internal/clipboard-image.ts`
- **`getClipboardImageHtml(e)`** — returns `clipboardData.getData("text/html")` only when it contains an `<img src=…>` (regex `/(<img\b[^>]*\bsrc\s*=)/i`); otherwise `null`, so plain rich text without an image is left for normal paste handling.
- **`isEditablePasteTarget(e)`** — `true` when the paste target (or `document.activeElement`) is `INPUT` / `TEXTAREA` / `SELECT` or `isContentEditable` (this covers Monaco's hidden textarea).
- **`openPastedHtml(html)`** — `pagesModel.addEditorPage("html-view", "html", "Pasted HTML", html)` then `showPage(page.id)`.
- Module doc comment updated to describe both branches and the fallback rule.

### `src/renderer/api/internal/GlobalEventService.ts`
- `handlePaste` now:
  1. image **file**/bitmap → Image viewer, `preventDefault` + `stopPropagation`, always (unchanged);
  2. else **`if (isEditablePasteTarget(e)) return;`** — stand down for editors;
  3. else `getClipboardImageHtml(e)` → if present, `preventDefault` + `stopPropagation` + `openPastedHtml`.
- Import + handler doc comment updated.

## Acceptance criteria

- [x] Picture copied from PowerPoint, pasted with **no editor focused** → opens a "Pasted HTML" tab rendering the image.
- [x] Same clipboard, pasted **into Monaco** → pastes as text, **no** new page.
- [x] Pasting a real bitmap (e.g. Snipping Tool) → still opens the Image viewer (unchanged).
- [x] Plain rich text without an image (e.g. web/Word text) is not intercepted (no `<img>` → `null`).
- [x] Typecheck + ESLint clean on both files.

## Notes / possible follow-up

- If the raw Office fragment shows visible junk around the image, `openPastedHtml` could be narrowed to extract just the `<img>` or wrap it in a minimal `<html><body>`. Deferred pending visual confirmation.
