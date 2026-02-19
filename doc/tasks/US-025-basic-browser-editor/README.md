# US-025: Basic Browser Editor

## Status

**Status:** Planned
**Priority:** Medium
**Started:** —
**Completed:** —

## Summary

Add a built-in browser as a page-editor using Electron's `<webview>` tag, enabling web browsing directly within js-notepad tabs. This is the foundation for multi-tab browsing, profiles, and bookmarks in subsequent tasks.

## Why

- Developers frequently need to check documentation, APIs, and web resources while coding
- Switching between a notepad and an external browser breaks workflow
- A built-in browser with tab support fits naturally into js-notepad's multi-editor architecture
- Can be used alongside the script executor (e.g., run fetch scripts and view results in browser)

## Complexity Assessment

### Overall: Moderate

The editor registration system is well-designed for adding new editors. The `<webview>` tag is already enabled in the Electron configuration (`webviewTag: true` in `open-window.ts`). The main effort is building the browser UI and handling webview events properly.

### Architecture Fit

A browser editor follows the "page-editor" pattern used by PDF Viewer, Image Viewer, About, and Settings pages:
- Own `PageType` (`browserPage`)
- Own `PageModel` with browser-specific state (URL, title, loading, navigation history)
- Registered in `register-editors.ts` with `acceptFile: () => -1` (no file association)
- Opened explicitly via Quick Add menu

### Security: Low Risk

The `<webview>` tag provides good isolation by default:
- `nodeIntegration` is **OFF** by default in webview (unlike the parent BrowserWindow)
- Using `partition="persist:browser-default"` isolates cookies, storage, and cache from the app
- No preload script needed for the webview content
- Navigation policy blocks `file://` and `app-asset://` protocols

### Webview vs WebContentsView

**Decision:** Use `<webview>` — it integrates naturally as a React element within the existing editor component system. `WebContentsView` would require complex main-process coordination for positioning, sizing, and z-ordering, and doesn't fit the renderer-side React architecture.

## Acceptance Criteria

- [ ] Browser editor opens as a new tab via Quick Add menu ("Browser" option)
- [ ] URL bar with Enter to navigate
- [ ] Back, Forward, Reload, Stop buttons in toolbar
- [ ] Page title shown in js-notepad tab
- [ ] Loading indicator in toolbar
- [ ] Favicon shown in tab icon
- [ ] Separate partition (`persist:browser-default`) for cookie/storage isolation
- [ ] Navigation to `file://`, `app-asset://`, `safe-file://` protocols blocked
- [ ] Session restore works (URL persisted and restored on app restart)
- [ ] Find in page (Ctrl+F within browser tab uses `webview.findInPage()`)
- [ ] `new-window` events open in external browser (temporary — refined in US-026)
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Files to Modify

### New Files

- `src/renderer/editors/browser/BrowserPageModel.ts` — Page model with URL, title, loading, canGoBack, canGoForward, favicon state
- `src/renderer/editors/browser/BrowserPageView.tsx` — React component with webview element, navigation toolbar, URL bar
- `src/renderer/editors/browser/BrowserToolbar.tsx` — Navigation toolbar: URL bar, Back, Forward, Reload/Stop, loading indicator

### Modified Files

- `src/shared/types.ts` — Add `"browserPage"` to `PageType`, `"browser-view"` to `PageEditor`
- `src/renderer/editors/register-editors.ts` — Register browser editor as page-editor
- `src/renderer/features/tabs/QuickAddMenu.tsx` — Add "Browser" option to Quick Add dropdown
- `src/renderer/theme/icons.tsx` — Add browser-related icons (back, forward, reload, stop, globe/browser)

## Implementation Progress

### Phase 1: Types and Model
- [ ] Add `"browserPage"` to `PageType` and `"browser-view"` to `PageEditor` in `shared/types.ts`
- [ ] Create `BrowserPageModel` with state: url, title, loading, canGoBack, canGoForward, favicon
- [ ] Implement `restore()` — set initial URL (default home page or from saved state)
- [ ] Implement `getRestoreData()` — persist current URL for session restore
- [ ] Implement `getIcon()` — return favicon or default browser icon

### Phase 2: View and Toolbar
- [ ] Create `BrowserPageView` component with `<webview>` element
- [ ] Create `BrowserToolbar` with: Back, Forward, Reload/Stop, URL bar
- [ ] Wire up webview events: `did-navigate`, `did-navigate-in-page`, `page-title-updated`, `did-start-loading`, `did-stop-loading`, `page-favicon-updated`
- [ ] Wire up navigation: `canGoBack`/`canGoForward` state from webview
- [ ] Set webview partition to `persist:browser-default`
- [ ] Block navigation to `file://`, `app-asset://`, `safe-file://` protocols via `will-navigate`
- [ ] Handle `new-window` — open in external browser (temporary)
- [ ] Loading indicator in toolbar

### Phase 3: Integration
- [ ] Register in `register-editors.ts` as page-editor
- [ ] Add "Browser" to Quick Add menu
- [ ] Implement find-in-page (`webview.findInPage()`) with Ctrl+F
- [ ] Add icons (browser, back, forward, reload, stop)
- [ ] Session restore: save/restore URL

### Phase 4: Polish
- [ ] Test with various websites
- [ ] Handle webview crashes gracefully (`crashed` event)
- [ ] Handle certificate errors (show warning or allow proceed)
- [ ] Update user documentation

## Notes

### 2026-02-19
- Initial task created, split from original US-021 into four focused tasks
- `webviewTag: true` already enabled in `open-window.ts` webPreferences
- `<webview>` has `nodeIntegration: false` by default — external sites cannot access Node.js
- Partition `persist:browser-default` prefix means data persists across app restarts
- This task focuses on single-webview-per-tab. Multi-tab browsing is US-026.

## Related

- Next: [US-026 Browser Internal Tabs](../US-026-browser-internal-tabs/README.md)
- Next: [US-027 Browser Profiles & Downloads](../US-027-browser-profiles-downloads/README.md)
- Next: [US-028 Browser Bookmarks](../US-028-browser-bookmarks/README.md)
- Pattern reference: Image Viewer (`src/renderer/editors/image/`) — page-editor with toolbar
- Pattern reference: About Page (`src/renderer/editors/about/`) — page-editor with no file association
- Related doc: [Editor Guide](../../standards/editor-guide.md)
- Related doc: [Architecture Overview](../../architecture/overview.md)
