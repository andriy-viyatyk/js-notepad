# US-026: Browser Internal Tabs

## Status

**Status:** Planned
**Priority:** Medium
**Started:** —
**Completed:** —
**Depends on:** US-025 (Basic Browser Editor)

## Summary

Add multi-tab browsing within a single Browser editor page. Each browser page (js-notepad tab) gets its own set of internal browser tabs displayed on a right-side panel. Handle `new-window` events from websites by opening internal tabs, and `window.open()` by opening new js-notepad browser pages.

## Why

- Real browser experience requires multiple tabs per window
- Three-level tab grouping: internal browser tabs → js-notepad tabs → js-notepad windows
- Websites frequently open new windows/tabs that need proper handling
- Popup windows (OAuth, payment forms) need in-app rendering

## Tab Architecture

### Three Levels of Browser Tab Grouping

1. **Internal browser tabs** — Multiple tabs within a single Browser editor page, shown on right panel
2. **js-notepad tabs** — Multiple Browser editor pages as separate js-notepad tabs
3. **js-notepad windows** — Browser editor pages across separate js-notepad windows

### New Window Handling Strategy

| Source | Behavior |
|--------|----------|
| `target="_blank"` link click | Open as new internal tab in same browser page |
| `window.open()` from JavaScript | Open as new internal tab in same browser page |
| Popup with features (`toolbar=no`, explicit dimensions) | Open as internal tab with URL bar hidden |
| User action: "Open in New Tab" (js-notepad level) | Open as new js-notepad tab with new Browser editor |

### Popup Windows

Websites use `window.open()` with features like `width=`, `height=`, `toolbar=no` for popups (OAuth, payment, previews). These will be rendered as internal tabs with a "popup" flag that hides the URL bar. Parent↔child messaging via `window.opener` is limited across webviews — most popup use cases (OAuth, payment forms, preview windows) work without it. Advanced messaging support can be added later if needed.

## Acceptance Criteria

- [ ] Right-side panel showing internal browser tabs (tab title, close button, favicon)
- [ ] New tab button in the tabs panel
- [ ] Close tab, switch between tabs
- [ ] Active tab's webview is visible; inactive tabs' webviews are hidden (not destroyed)
- [ ] `target="_blank"` links open as new internal tab
- [ ] `window.open()` calls open as new internal tab
- [ ] Popup windows (with `toolbar=no` or explicit dimensions) open as internal tab with URL bar hidden
- [ ] Tab panel is collapsible/resizable
- [ ] Session restore preserves all internal tabs and their URLs
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Files to Modify

### New Files

- `src/renderer/editors/browser/BrowserTabsPanel.tsx` — Right-side panel showing internal browser tabs
- `src/renderer/editors/browser/BrowserTab.ts` — State for a single internal browser tab (url, title, favicon, loading, isPopup)

### Modified Files

- `src/renderer/editors/browser/BrowserPageModel.ts` — Add multi-tab state management (tabs array, activeTabId, add/remove/switch tabs)
- `src/renderer/editors/browser/BrowserPageView.tsx` — Add tabs panel, manage multiple webview elements
- `src/renderer/editors/browser/BrowserToolbar.tsx` — Show active tab's navigation state; adapt for popup mode (hidden URL bar)

## Implementation Progress

### Phase 1: Tab State Management
- [ ] Define `BrowserTab` interface (id, url, title, favicon, loading, canGoBack, canGoForward, isPopup)
- [ ] Extend `BrowserPageModel` with tabs array, activeTabId, tab management methods
- [ ] Add/remove/switch tab logic
- [ ] Update `getRestoreData()` / `restore()` for multi-tab session restore

### Phase 2: Multi-Webview Rendering
- [ ] Render multiple `<webview>` elements (one per tab)
- [ ] Show active tab's webview, hide others (CSS visibility or display)
- [ ] Wire each webview's events to its tab state
- [ ] Handle `new-window` events → create new internal tab
- [ ] Detect popup features → set `isPopup` flag, hide URL bar

### Phase 3: Tabs Panel UI
- [ ] Create `BrowserTabsPanel` component on right side
- [ ] Tab items with favicon, title, close button
- [ ] New tab button
- [ ] Active tab highlighting
- [ ] Resizable panel with splitter
- [ ] Tab panel visibility toggle

### Phase 4: Polish
- [ ] Tab reordering (drag and drop)
- [ ] Tab context menu (Close, Close Others, Duplicate)
- [ ] Limit on number of internal tabs (performance consideration)
- [ ] Update user documentation

## Notes

### 2026-02-19
- Split from original US-021. This task adds the multi-tab layer on top of US-025's single-webview foundation.
- Each internal tab has its own webview instance. Hidden webviews stay in DOM but are not visible — this preserves their state and avoids re-navigation on tab switch.
- The `allowpopups` webview attribute may be useful for popup handling, but intercepting via `new-window` event gives more control.

## Related

- Depends on: [US-025 Basic Browser Editor](../US-025-basic-browser-editor/README.md)
- Next: [US-027 Browser Profiles & Downloads](../US-027-browser-profiles-downloads/README.md)
- Next: [US-028 Browser Bookmarks](../US-028-browser-bookmarks/README.md)
