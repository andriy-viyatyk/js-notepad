# US-026: Browser Internal Tabs

## Status

**Status:** Done
**Priority:** Medium
**Started:** 2026-02-20
**Completed:** 2026-02-21
**Depends on:** US-025 (Basic Browser Editor)

## Summary

Add multi-tab browsing within a single Browser editor page. Each browser page (js-notepad tab) gets its own set of internal browser tabs displayed on a left-side panel. Handle `new-window` events from websites by opening internal tabs.

## Why

- Real browser experience requires multiple tabs per window
- Three-level tab grouping: internal browser tabs → js-notepad tabs → js-notepad windows
- Websites frequently open new windows/tabs that need proper handling
- Popup windows (OAuth, payment forms) need in-app rendering

## Tab Architecture

### Three Levels of Browser Tab Grouping

1. **Internal browser tabs** — Multiple tabs within a single Browser editor page, shown on left panel
2. **js-notepad tabs** — Multiple Browser editor pages as separate js-notepad tabs
3. **js-notepad windows** — Browser editor pages across separate js-notepad windows

### New Window Handling (Implemented)

| Source | Behavior |
|--------|----------|
| `target="_blank"` link click | Opens as new internal tab in same browser page |
| `window.open()` from JavaScript | Opens as new internal tab in same browser page |

Both are intercepted via `setWindowOpenHandler()` in the main process (`browser-service.ts`), which denies the popup and relays the URL as a `"new-window"` event. Requires `allowpopups="true"` on the `<webview>` element.

### Deferred: Popup Windows

Popup handling with `isPopup` flag (hiding URL bar for `toolbar=no` / explicit dimensions) was deferred. May be reimplemented as real popup windows with proper dimensions in the future.

## Acceptance Criteria

- [x] Left-side panel showing internal browser tabs (tab title, close button, favicon)
- [x] New tab button in the tabs panel
- [x] Close tab, switch between tabs
- [x] Active tab's webview is visible; inactive tabs' webviews are hidden (not destroyed)
- [x] `target="_blank"` links open as new internal tab
- [x] `window.open()` calls open as new internal tab
- [ ] ~~Popup windows (with `toolbar=no` or explicit dimensions) open as internal tab with URL bar hidden~~ — deferred, may implement as real popup windows in the future
- [x] Tab panel is collapsible/resizable
- [x] Session restore preserves all internal tabs and their URLs
- [x] Documentation updated
- [x] No regressions in existing functionality

## Files Modified

### New Files

- `src/renderer/editors/browser/BrowserTabsPanel.tsx` — Left-side panel showing internal browser tabs with context menu

### Modified Files

- `src/renderer/editors/browser/BrowserPageModel.ts` — Added `BrowserTabData` interface, multi-tab state (tabs array, activeTabId), tab management methods (addTab, closeTab, closeOtherTabs, closeTabsBelow, switchTab), multi-tab session restore
- `src/renderer/editors/browser/BrowserPageView.tsx` — Added multi-webview rendering (BrowserWebviewItem), tabs panel, dom-ready gating, new-window event handling, `allowpopups` attribute

### Not Created (Changed from Plan)

- `BrowserTab.ts` — `BrowserTabData` interface placed in `BrowserPageModel.ts` instead
- `BrowserToolbar.tsx` — Toolbar remained inline in `BrowserPageView.tsx`

## Implementation Progress

### Phase 1: Tab State Management
- [x] Define `BrowserTabData` interface (id, url, pageTitle, favicon, loading, canGoBack, canGoForward)
- [x] Extend `BrowserPageModel` with tabs array, activeTabId, tab management methods
- [x] Add/remove/switch tab logic (addTab, closeTab, closeOtherTabs, closeTabsBelow, switchTab)
- [x] Update `getRestoreData()` / `applyRestoreData()` for multi-tab session restore

### Phase 2: Multi-Webview Rendering
- [x] Render multiple `<webview>` elements (one per tab)
- [x] Show active tab's webview, hide others (CSS display)
- [x] Wire each webview's events to its tab state via internalTabId routing
- [x] Handle `new-window` events → create new internal tab
- [x] dom-ready gating for loadURL() via webviewReady Set
- [ ] ~~Detect popup features → set `isPopup` flag, hide URL bar~~ — deferred

### Phase 3: Tabs Panel UI
- [x] Create `BrowserTabsPanel` component on left side
- [x] Tab items with favicon, title, close button (width-dependent visibility)
- [x] New tab button
- [x] Active tab highlighting
- [x] Resizable panel with splitter
- [x] Compact mode (icon-only) at narrow widths

### Phase 4: Polish
- [x] Tab context menu (Close Tab, Close Other Tabs, Close Tabs Below)
- [x] Fixed tab height consistency (28px with border-box sizing)
- [x] White webview background for proper website rendering
- [x] Update user documentation

## Notes

### 2026-02-19
- Split from original US-021. This task adds the multi-tab layer on top of US-025's single-webview foundation.
- Each internal tab has its own webview instance. Hidden webviews stay in DOM but are not visible — this preserves their state and avoids re-navigation on tab switch.

### 2026-02-20
- `allowpopups="true"` is required on `<webview>` for `setWindowOpenHandler` to fire on `target="_blank"` links.
- Needed `webviewReady` ref (Set) to prevent calling `loadURL()` before dom-ready — crashes the app otherwise.
- Must NOT include `tab.url` in IPC registration effect dependencies — causes cleanup/re-register on every navigation, clearing webviewReady state.
- Emotion `&` selector always refers to root styled component class, not current nested selector — hover-reveal rules must be at parent level.
- Webview needs explicit `backgroundColor: "#ffffff"` — sites without their own background inherit app's dark theme.
- Tabs panel changed from right-side to left-side during implementation.
- isPopup flag deferred — may implement as real popup windows with proper dimensions in the future.

## Related

- Depends on: [US-025 Basic Browser Editor](../US-025-basic-browser-editor/README.md)
- Next: [US-027 Browser Profiles & Downloads](../US-027-browser-profiles-downloads/README.md)
- Next: [US-028 Browser Bookmarks](../US-028-browser-bookmarks/README.md)
