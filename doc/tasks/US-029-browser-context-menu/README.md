# US-029: Browser Web Page Context Menu

## Status

**Status:** Completed
**Priority:** Medium

## Summary

Add a custom context menu for the browser editor's web page content. Right-clicking within the webview should show relevant options like "Open Link in New Tab", "Copy Link Address", "Inspect Element", etc., similar to what standard browsers provide.

## Why

- Right-clicking in the webview currently shows either no menu or the app's default context menu, which is not useful for browsing
- Users expect standard browser context menu actions when browsing web pages
- "Open Link in New Tab" is essential for multi-tab browsing (complements the `target="_blank"` handling from US-026)
- "Inspect Element" provides quick access to DevTools at a specific element

## Acceptance Criteria

- [x] Right-click on a link shows: "Open Link in New Tab", "Copy Link Address"
- [x] Right-click on selected text shows: "Copy"
- [x] Right-click on an image shows: "Copy Image Address"
- [x] Right-click anywhere shows: "Back", "Forward", "Reload", "Inspect Element"
- [x] "Open Link in New Tab" opens the link as a new internal browser tab
- [x] "Inspect Element" opens DevTools focused on the clicked element
- [x] Context menu items are contextual (link items only show when right-clicking a link, etc.)
- [x] Documentation updated
- [x] No regressions in existing functionality

## Technical Approach

### Chosen Approach: Main Process webContents Event Relay

The webview's context menu is intercepted at the webContents level in the main process using the `context-menu` event. This event provides rich context (link URL, image URL, selected text, edit flags, etc.) via `params`.

**Flow:**
1. Main process (`browser-service.ts`): Listens for `context-menu` event on registered webContents, calls `event.preventDefault()` to suppress the default menu
2. Main process sends a `"context-menu"` BrowserEvent to the renderer with the context params
3. Renderer (`BrowserPageView.tsx`): Receives the event, builds MenuItem[] based on context
4. Renderer calls `showAppPopupMenu()` to display the menu
5. Menu actions either operate on the webview directly (copy, cut, paste, back, forward) or call model methods (open in new tab)

**Key `params` fields from Electron's `context-menu` event:**
- `linkURL` — URL if right-clicked on a link
- `srcURL` — URL if right-clicked on an image/media
- `selectionText` — currently selected text
- `isEditable` — whether the element is an input field
- `editFlags` — which edit operations are available (canCopy, canPaste, canCut)
- `x`, `y` — coordinates (in host window coordinate space)

## Files Modified

- `src/main/browser-service.ts` — Added `context-menu` event listener on webContents
- `src/ipc/browser-ipc.ts` — Added `"context-menu"` to BrowserEventType, extended BrowserEventData with context menu fields
- `src/renderer/editors/browser/BrowserPageView.tsx` — Handle `"context-menu"` event, build and show contextual menu
- `src/renderer/features/dialogs/poppers/showPopupMenu.tsx` — Added `closePopper()` call before showing new menu to prevent stacking

## Implementation Progress

### Phase 1: Context Menu Event Relay — Done
- [x] Add `context-menu` listener in `browser-service.ts` that sends params to renderer
- [x] Extend `BrowserEventType` and `BrowserEventData` with context menu fields

### Phase 2: Renderer Menu Builder — Done
- [x] Handle `"context-menu"` event in BrowserPageView
- [x] Build contextual MenuItem[] based on params (link, image, text, editable, general)
- [x] Show menu via `showAppPopupMenu()`

### Phase 3: Menu Actions — Done
- [x] "Open Link in New Tab" — `model.addTab(linkURL)`
- [x] "Copy Link Address" — clipboard write
- [x] "Copy" — `webview.copy()`
- [x] "Copy Image Address" — clipboard write
- [x] "Cut" / "Paste" — `webview.cut()` / `webview.paste()` (for editable fields)
- [x] "Back" / "Forward" / "Reload" — webview navigation (with disabled state)
- [x] "Inspect Element" — `webview.inspectElement(x, y)` with webview-relative coordinates

### Bug Fixes During Implementation
- **Popup position offset**: `params.x/y` are already in host window coordinate space, not webview-relative. Used `data.x/y` directly for popup position; subtract webview rect only for `inspectElement`.
- **Stacking popup menus**: Webview right-clicks go through IPC (not DOM), so Popper's click-outside handler doesn't fire. Fixed by calling `closePopper()` at the start of `showAppPopupMenu()`.
- **Left-click in webview doesn't dismiss popup**: Webview clicks don't bubble to renderer DOM. Fixed with a transparent overlay that covers the webview area while a popup is open, so clicks reach the renderer's `document` and trigger Popper's dismiss handler.

## Notes

- The `context-menu` event on webContents provides all needed context without requiring any guest-side JavaScript
- Must prevent the default context menu from showing (`event.preventDefault()` in main process)
- Coordinates from `params.x/y` are in host window space, NOT webview-relative. For `inspectElement()`, subtract the webview's bounding rect.
- Webview clicks (both left and right) don't fire on the renderer's `document`, requiring workarounds for popup dismissal

## Related

- Depends on: US-025 (Basic Browser Editor), US-026 (Browser Internal Tabs)
- Related: US-027 (Browser Profiles & Downloads)
