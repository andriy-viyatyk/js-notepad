# US-029: Browser Web Page Context Menu

## Status

**Status:** Planned
**Priority:** Medium

## Summary

Add a custom context menu for the browser editor's web page content. Right-clicking within the webview should show relevant options like "Open Link in New Tab", "Copy Link Address", "Inspect Element", etc., similar to what standard browsers provide.

## Why

- Right-clicking in the webview currently shows either no menu or the app's default context menu, which is not useful for browsing
- Users expect standard browser context menu actions when browsing web pages
- "Open Link in New Tab" is essential for multi-tab browsing (complements the `target="_blank"` handling from US-026)
- "Inspect Element" provides quick access to DevTools at a specific element

## Acceptance Criteria

- [ ] Right-click on a link shows: "Open Link in New Tab", "Copy Link Address"
- [ ] Right-click on selected text shows: "Copy"
- [ ] Right-click on an image shows: "Copy Image", "Copy Image Address"
- [ ] Right-click anywhere shows: "Back", "Forward", "Reload", "Inspect Element"
- [ ] "Open Link in New Tab" opens the link as a new internal browser tab
- [ ] "Inspect Element" opens DevTools focused on the clicked element
- [ ] Context menu items are contextual (link items only show when right-clicking a link, etc.)
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Technical Approach

### Chosen Approach: Preload Script + Main Process Relay

The webview's context menu must be intercepted at the webContents level in the main process using the `context-menu` event on the webContents. This event provides rich context (link URL, image URL, selected text, edit flags, etc.) via `params`.

**Flow:**
1. Main process (`browser-service.ts`): Listen for `context-menu` event on registered webContents
2. Main process sends a `"context-menu"` BrowserEvent to the renderer with the context params
3. Renderer (`BrowserPageView.tsx`): Receives the event, builds MenuItem[] based on context
4. Renderer calls `showAppPopupMenu()` to display the menu (same pattern as BrowserTabsPanel context menu)
5. Menu actions either operate on the webview directly (copy, back, forward) or call model methods (open in new tab)

**Key `params` fields from Electron's `context-menu` event:**
- `linkURL` — URL if right-clicked on a link
- `srcURL` — URL if right-clicked on an image/media
- `selectionText` — currently selected text
- `isEditable` — whether the element is an input field
- `editFlags` — which edit operations are available (canCopy, canPaste, etc.)
- `x`, `y` — coordinates for "Inspect Element"

## Files to Modify

- `src/main/browser-service.ts` — Add `context-menu` event listener on webContents
- `src/ipc/browser-ipc.ts` — Add `"context-menu"` to BrowserEventType, extend BrowserEventData
- `src/renderer/editors/browser/BrowserPageView.tsx` — Handle `"context-menu"` event, build and show menu

## Implementation Progress

### Phase 1: Context Menu Event Relay
- [ ] Add `context-menu` listener in `browser-service.ts` that sends params to renderer
- [ ] Extend `BrowserEventType` and `BrowserEventData` with context menu fields

### Phase 2: Renderer Menu Builder
- [ ] Handle `"context-menu"` event in BrowserPageView
- [ ] Build contextual MenuItem[] based on params (link, image, text, general)
- [ ] Show menu via `showAppPopupMenu()`

### Phase 3: Menu Actions
- [ ] "Open Link in New Tab" — `model.addTab(linkURL)`
- [ ] "Copy Link Address" — clipboard write
- [ ] "Copy" — `webview.copy()`
- [ ] "Copy Image" / "Copy Image Address" — clipboard operations
- [ ] "Back" / "Forward" / "Reload" — webview navigation
- [ ] "Inspect Element" — `webview.inspectElement(x, y)`

## Notes

- The `context-menu` event on webContents provides all needed context without requiring any guest-side JavaScript
- Must prevent the default context menu from showing (`event.preventDefault()` in main process)
- Coordinates from `params` are relative to the webview, which is what `inspectElement()` expects

## Related

- Depends on: US-025 (Basic Browser Editor), US-026 (Browser Internal Tabs)
- Related: US-027 (Browser Profiles & Downloads)
