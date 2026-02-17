# US-021: Browser Editor

## Status

**Status:** Planned
**Priority:** Medium
**Started:** —
**Completed:** —

## Summary

Add a built-in browser as a page-editor using Electron's `<webview>` tag with an isolated partition, enabling web browsing directly within js-notepad tabs.

## Why

- Developers frequently need to check documentation, APIs, and web resources while coding
- Switching between a notepad and an external browser breaks workflow
- A built-in browser with tab support fits naturally into js-notepad's multi-editor architecture
- Can be used alongside the script executor (e.g., run fetch scripts and view results in browser)

## Complexity Assessment

### Overall: Moderate

The editor registration system is well-designed for adding new editors. The `<webview>` tag is already enabled in the Electron configuration (`webviewTag: true` in `open-window.ts`). The main effort is building the browser UI and handling webview events properly.

### Architecture Fit

A browser editor follows the exact same "page-editor" pattern as the PDF Viewer and Image Viewer:
- Own `PageType` (`browserPage`)
- Own `PageModel` with browser-specific state (URL, title, loading, navigation history)
- Registered in `register-editors.ts` with `acceptFile: () => -1` (no file association)
- Opened explicitly via menu, command, or URL trigger

### Security: Low Risk

The `<webview>` tag provides good isolation by default:
- `nodeIntegration` is **OFF** by default in webview (unlike the parent BrowserWindow)
- Using `partition="persist:browser"` isolates cookies, storage, and cache from the app
- No preload script needed for the webview content
- Navigation policy can block `file://` and `app-asset://` protocols

### Estimated Size by Layer

| Layer | Scope | Lines (est.) | Effort |
|-------|-------|-------------|--------|
| **1. Basic shell** | Webview + URL bar + back/forward/reload | ~250 | Easy |
| **2. Full navigation UX** | Title sync, loading indicator, favicon, new-window handling, find-in-page, zoom, DevTools | ~200 | Moderate |
| **3. Advanced features** | Bookmarks, history persistence, downloads, certificate handling | ~200+ | Harder |

**Total estimate for Layers 1+2:** ~400-500 lines across 3-4 new files, plus minor edits to existing files.

## Acceptance Criteria

- [ ] Browser editor opens as a new tab with `<webview>` element
- [ ] URL bar with Enter to navigate
- [ ] Back, Forward, Reload, Stop buttons
- [ ] Page title shown in tab
- [ ] Loading indicator
- [ ] Favicon shown in tab icon
- [ ] Separate partition (`persist:browser`) for cookie/storage isolation
- [ ] `new-window` events handled (open in new browser tab or external browser)
- [ ] Navigation to `file://` and custom protocols blocked
- [ ] Session restore works (URL persisted and restored)
- [ ] Menu item or shortcut to open a new browser tab
- [ ] Find in page (Ctrl+F within browser tab)
- [ ] Zoom controls (Ctrl+Plus/Minus/0)
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Technical Approach

### Webview with Isolated Partition (Chosen)

Use Electron's `<webview>` tag with a dedicated partition for security isolation.

**Pros:**
- `<webview>` runs in a separate process — doesn't affect app stability
- Built-in security: no Node.js access by default
- Partition isolates all web storage from the application
- Rich event API for navigation, title, favicon, loading state
- `webviewTag: true` already enabled in the app

**Cons:**
- `<webview>` is considered "semi-deprecated" by Electron team in favor of `BrowserView`/`WebContentsView`, but still fully functional and widely used
- Some features (like downloads) require main-process session handling

### Alternative Considered: BrowserView / WebContentsView

Electron's newer `WebContentsView` API manages web content at the main process level.

**Pros:**
- Officially recommended by Electron for new development
- Better performance characteristics

**Cons:**
- Requires complex main-process coordination for positioning, sizing, and z-ordering
- Doesn't integrate naturally as a React component in the renderer
- Much harder to implement in the existing editor architecture (which is renderer-side React)
- Would require significant IPC scaffolding

**Decision:** Use `<webview>` — it integrates naturally as a React element within the existing editor component system.

## Files to Modify

### New Files

- `src/renderer/editors/browser/BrowserPageModel.ts` — Page model with URL, title, loading, canGoBack, canGoForward, favicon state
- `src/renderer/editors/browser/BrowserView.tsx` — React component with webview element, navigation toolbar, URL bar
- `src/renderer/editors/browser/index.ts` — EditorModule export

### Modified Files

- `src/shared/types.ts` — Add `"browserPage"` to `PageType`, `"browser-view"` to `PageEditor`
- `src/renderer/editors/register-editors.ts` — Register browser editor
- `src/renderer/store/pages-store.ts` — Add action to open browser tab (with optional URL)
- Menu/toolbar files — Add "Open Browser" menu item

## Implementation Progress

### Phase 1: Basic Browser Shell
- [ ] Add types (`browserPage`, `browser-view`) to `shared/types.ts`
- [ ] Create `BrowserPageModel` with state: url, title, loading, canGoBack, canGoForward, favicon
- [ ] Implement `restore()` — set initial URL (default or from saved state)
- [ ] Implement `getRestoreData()` — persist current URL for session restore
- [ ] Create `BrowserView` component with `<webview>` element
- [ ] Add navigation toolbar: URL bar, Back, Forward, Reload/Stop
- [ ] Wire up webview events: `did-navigate`, `page-title-updated`, `did-start-loading`, `did-stop-loading`
- [ ] Export EditorModule in `index.ts`
- [ ] Register in `register-editors.ts`

### Phase 2: Navigation UX
- [ ] Sync page title to tab via model state
- [ ] Show favicon in tab (listen to `page-favicon-updated`, override `getIcon()`)
- [ ] Handle `new-window` events (open in new browser tab or block)
- [ ] Add loading spinner/progress indicator
- [ ] Implement find-in-page (`webview.findInPage()`) with Ctrl+F
- [ ] Implement zoom controls (Ctrl+Plus/Minus/0)
- [ ] Add context menu with DevTools option
- [ ] Block navigation to `file://`, `app-asset://`, `safe-file://` protocols
- [ ] Add permission request handling (deny camera, geolocation, etc. by default)

### Phase 3: Integration
- [ ] Add "Open Browser" to application menu
- [ ] Add pages-store action to open a browser tab with optional URL
- [ ] Consider: make URLs in other editors clickable to open in browser tab
- [ ] Update user documentation

### Phase 4: Advanced (Optional/Future)
- [ ] Download handling via session `will-download`
- [ ] Bookmarks (persist in app settings or file)
- [ ] Browsing history panel
- [ ] User agent switching
- [ ] Certificate error handling UI

## Notes

### 2026-02-17
- Initial assessment: complexity is moderate, architecture is well-suited
- `webviewTag: true` already enabled in `open-window.ts` webPreferences
- `<webview>` has `nodeIntegration: false` by default — external sites cannot access Node.js
- Current CSP allows http/https in script-src, so webview should work without CSP changes
- Partition `persist:browser` prefix means data persists across app restarts (vs `browser` which is in-memory only)
- Electron docs note `<webview>` may be restructured in future, but it remains functional and is the most practical approach for renderer-side integration

## Related

- Pattern reference: PDF Viewer (`src/renderer/editors/pdf/`) — simplest page-editor example
- Pattern reference: Image Viewer (`src/renderer/editors/image/`) — page-editor with toolbar
- Related doc: [Editor Guide](../../standards/editor-guide.md)
- Related doc: [Architecture Overview](../../architecture/overview.md)
