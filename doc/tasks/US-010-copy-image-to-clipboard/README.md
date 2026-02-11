# US-010: Copy Image to Clipboard

## Status

**Status:** Planned
**Priority:** Low
**Started:** -
**Completed:** -

## Summary

Add a "Copy" button to `BaseImageView` so users can copy the displayed image to the clipboard as PNG. This enables pasting into external applications (Teams, Word, Outlook, etc.).

## Why

- Users viewing images or SVG previews may want to quickly share them
- Copy-paste into chat/email/documents is a common workflow
- Currently there is no way to copy the rendered image from within the app
- Both ImageViewer and SvgView share `BaseImageView`, so one implementation covers both

## Acceptance Criteria

- [ ] Copy button visible in BaseImageView (next to zoom indicator)
- [ ] Clicking copy button copies rendered image as PNG to system clipboard
- [ ] Ctrl+C keyboard shortcut copies image when BaseImageView is focused
- [ ] Works for binary images (PNG, JPG, GIF, BMP, WebP)
- [ ] Works for SVG preview (rasterizes SVG to PNG before copying)
- [ ] Pasted image is accepted by external apps (Teams, Word, Outlook, browser)
- [ ] Visual feedback on copy (brief button state change or similar)
- [ ] No regressions in existing zoom/pan functionality

## Technical Approach

### How It Works

Use the **Clipboard API** with canvas-based rasterization:

1. Draw the `<img>` element onto an offscreen `<canvas>` at natural resolution
2. Export canvas as PNG blob via `canvas.toBlob("image/png")`
3. Write to clipboard via `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`

This produces a standard PNG image that all major applications accept via paste.

### SVG Considerations

SVG content is rendered as an `<img>` via data URL (`data:image/svg+xml,...`). Drawing this onto a canvas works the same as any other image format. The output is a rasterized PNG at the SVG's natural dimensions (defined by `width`/`height` or `viewBox`).

## Files to Modify

- `src/renderer/editors/image/BaseImageView.tsx` - All changes go here:
  - Add `copyToClipboard` method to `ImageViewModel`
  - Add copy button to the view (near zoom indicator)
  - Add Ctrl+C handler to `handleKeyDown`
  - Add CSS for copy button styling

## Implementation Steps

### Step 1: Add `copyToClipboard` method to `ImageViewModel`

```typescript
copyToClipboard = async () => {
    const image = this.imageRef;
    if (!image) return;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;

    await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
    ]);
};
```

### Step 2: Add Ctrl+C to `handleKeyDown`

In the existing keyboard handler, add a case for Ctrl+C:

```typescript
case "c":
    if (e.ctrlKey) {
        e.preventDefault();
        this.copyToClipboard();
    }
    break;
```

### Step 3: Add copy button to the view

Place a copy button next to the zoom indicator. Use existing `Button` component or a simple styled element matching the zoom indicator style.

### Step 4: Visual feedback

Options:
- Brief text change on the button ("Copied!") with timeout
- Add a `copied` state field to `ImageViewState` with auto-reset

## Notes

- `canvas.toBlob` is async but fast for typical image sizes
- Cross-origin images would fail on canvas (tainted canvas), but our images are local files served via `safe-file://` protocol, so this should not be an issue
- `navigator.clipboard.write` requires the window to be focused (Electron windows are focused when interacting with them, so this is fine)
- The copy always uses the image's natural resolution, not the current zoom level

## Related

- Built on: US-006 (Create Image View Editor)
- Component: `src/renderer/editors/image/BaseImageView.tsx`
