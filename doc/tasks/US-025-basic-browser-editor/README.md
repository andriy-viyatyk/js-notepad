# US-025: Basic Browser Editor

## Status

**Status:** Completed
**Priority:** Medium
**Started:** 2026-02-19
**Completed:** 2026-02-21

## Summary

Add a built-in browser as a page-editor using Electron's `<webview>` tag, enabling web browsing directly within js-notepad tabs. This is the foundation for multi-tab browsing, profiles, and bookmarks in subsequent tasks.

## Why

- Developers frequently need to check documentation, APIs, and web resources while coding
- Switching between a notepad and an external browser breaks workflow
- A built-in browser with tab support fits naturally into js-notepad's multi-editor architecture
- Can be used alongside the script executor (e.g., run fetch scripts and view results in browser)

## Acceptance Criteria

- [x] Browser editor opens as a new tab via Quick Add menu ("Browser" option)
- [x] URL bar with Enter to navigate
- [x] Back, Forward, Reload, Stop buttons in toolbar
- [x] Page title shown in js-notepad tab
- [x] Loading indicator in toolbar
- [x] Favicon shown in tab icon
- [x] Separate partition (`persist:browser-default`) for cookie/storage isolation
- [x] Navigation to `file://`, `app-asset://`, `safe-file://` protocols blocked
- [x] Session restore works (URL persisted and restored on app restart)
- [x] Find in page (Ctrl+F within browser tab uses `webview.findInPage()`)
- [ ] `new-window` events open in external browser (deferred to US-026)
- [x] Documentation updated
- [x] No regressions in existing functionality

## Architecture

The browser editor is **significantly more complex** than originally planned. Unlike other editors that live entirely in the renderer process, it spans **three process boundaries** with IPC bridges between each.

See [Browser Editor Architecture](../../architecture/browser-editor.md) for the full architecture document.

### Process Diagram

```
┌────────────────────────────┐  ┌──────────────────────┐  ┌──────────────┐
│  Guest Page (webview)      │  │  Renderer Process     │  │  Main Process │
│  preload-webview.ts        │  │  BrowserPageView.tsx  │  │  browser-     │
│  - MutationObserver        │  │  BrowserPageModel.ts  │  │  service.ts   │
│  - Detects title/favicon   │  │  - UI, toolbar, state │  │  - webContents│
│  - sendToHost() messages   │  │  - Webview element    │  │  - Relays     │
│                            │  │                       │  │    events     │
└────────────────────────────┘  └───────────────────────┘  └──────────────┘
      ipc-message ──────────────▶       IPC ──────────────▶
                                ◀────── browser:event ─────
```

### Key Architectural Decisions

1. **Main process IPC bridge** — The `<webview>` DOM element's event API is unreliable (e.g., `page-favicon-updated` doesn't fire on back/forward). The main process uses `webContents.fromId()` to attach to the real webContents, where events fire reliably. Events are relayed back to the renderer via `BrowserChannel.event`.

2. **Webview preload script** — A separate preload script (`preload-webview.ts`) runs in the guest page's isolated context. It uses `MutationObserver` on `<head>` to detect `<title>` and `<link rel="icon">` changes, then sends messages via `ipcRenderer.sendToHost()`. This complements the main process events and catches JS-driven metadata changes.

3. **Dual URL tracking** — `state.url` is the "navigation target" (set only by user action via `model.navigate()`). `model.currentUrl` tracks the actual URL in the webview (updated by navigation events). This separation prevents React from re-rendering `<webview src>` on every redirect/navigation, which would cause ERR_ABORTED double-navigation.

4. **Favicon caching by origin** — Favicons are cached per origin (`new URL(url).origin`). On `did-navigate`, the cached favicon is applied immediately so the tab icon doesn't flash back to the globe icon during same-origin navigation.

5. **PageTab subscription** — `PageTab.tsx` includes `_iconHint: (s as any).favicon ?? ""` in its state selector to trigger re-renders when favicon changes. Without this, favicon state changes wouldn't propagate to the tab UI.

## Files Created

| File | Process | Purpose |
|------|---------|---------|
| `src/renderer/editors/browser/BrowserPageView.tsx` | Renderer | UI: toolbar (back/forward/reload/stop), URL bar, webview element, event handling |
| `src/renderer/editors/browser/BrowserPageModel.ts` | Renderer | State (url, pageTitle, loading, canGoBack, canGoForward, favicon), navigation logic, favicon caching, `getIcon()` |
| `src/main/browser-service.ts` | Main | Registers webview webContents, attaches event listeners, relays events via IPC, blocks dangerous protocols |
| `src/preload-webview.ts` | Guest | MutationObserver for title/favicon detection, `sendToHost()` messages |
| `src/ipc/browser-ipc.ts` | Shared | IPC channel names (`browser:register`, `browser:unregister`, `browser:event`) and type definitions |
| `vite.preload-webview.config.ts` | Build | Vite config for the webview preload build entry |
| `doc/architecture/browser-editor.md` | Docs | Architecture documentation for the multi-process browser editor |

## Files Modified

| File | Change |
|------|--------|
| `src/shared/types.ts` | Added `"browserPage"` to `PageType`, `"browser-view"` to `PageEditor` |
| `src/renderer/editors/register-editors.ts` | Registered browser editor as page-editor with `acceptFile: () => -1` |
| `src/renderer/theme/icons.tsx` | Added `ArrowLeftIcon`, `ArrowRightIcon`, `RefreshIcon`, `StopIcon`, `GlobeIcon` |
| `src/renderer/theme/language-icons.tsx` | Added `GlobeIcon` mapping for `browserPage` type |
| `src/renderer/store/page-actions.ts` | Added "Browser" to Quick Add menu |
| `src/renderer/features/tabs/PageTab.tsx` | Added `_iconHint` favicon subscription; icon slot styling for 15x15 favicon images |
| `src/renderer/features/tabs/PageTabs.tsx` | Minor adjustment for browser tab handling |
| `src/main/main-setup.ts` | Added `initBrowserHandlers()` call during app startup |
| `src/main/open-window.ts` | Exposed `webviewPreloadUrl` path via preload |
| `src/preload.ts` | Added `pathToFileURL` to expose webview preload path as `window.webviewPreloadUrl` |
| `forge.config.ts` | Added webview preload as third Vite build entry |

## Deviations from Original Plan

1. **No separate `BrowserToolbar.tsx`** — The toolbar is integrated directly into `BrowserPageView.tsx` using the shared `PageToolbar` component, keeping things simpler.

2. **Main process bridge not anticipated** — Original plan expected webview DOM events to work reliably. In practice, `page-favicon-updated` and other events were inconsistent, requiring the `browser-service.ts` main process bridge.

3. **Preload script not anticipated** — Original plan stated "No preload script needed for the webview content." A preload script was added to complement the main process events with DOM-level observation for title and favicon changes.

4. **`new-window` handling deferred** — Opening links in external browser was not implemented; deferred to US-026 which handles internal tab creation for new windows.

5. **Crash/certificate handling deferred** — `crashed` event handling and certificate error UI were not implemented in this task. Can be added as polish in a future task.

## Notes

### 2026-02-19
- Initial task created, split from original US-021 into four focused tasks
- `webviewTag: true` already enabled in `open-window.ts` webPreferences
- `<webview>` has `nodeIntegration: false` by default — external sites cannot access Node.js
- Partition `persist:browser-default` prefix means data persists across app restarts
- This task focuses on single-webview-per-tab. Multi-tab browsing is US-026.

### 2026-02-20
- Basic webview rendering working, URL bar, navigation buttons, loading indicator implemented
- Discovered webview DOM events unreliable for favicon — `page-favicon-updated` doesn't fire on back/forward
- Built main process IPC bridge (`browser-service.ts`) for reliable event forwarding via `webContents`
- Built webview preload script with MutationObserver as complementary favicon/title detection

### 2026-02-21
- Fixed favicon always "one navigation behind" — caused by `useEffect` timing in `setFaviconIcon()` (runs after render). Switched to synchronous `createElement()` in `getIcon()`
- Fixed PageTab not re-rendering on favicon change — added `_iconHint` to state selector
- Fixed ERR_ABORTED double-navigation — separated `state.url` (navigation target) from `model.currentUrl` (actual URL)
- Removed all debug logging, adjusted favicon icon to 15x15
- Created architecture documentation (`doc/architecture/browser-editor.md`)
- Updated all user docs, architecture docs, CLAUDE.md, and editor guide with browser editor references
- Task completed

## Related

- Next: [US-026 Browser Internal Tabs](../US-026-browser-internal-tabs/README.md)
- Next: [US-027 Browser Profiles & Downloads](../US-027-browser-profiles-downloads/README.md)
- Next: [US-028 Browser Bookmarks](../US-028-browser-bookmarks/README.md)
- Architecture: [Browser Editor Architecture](../../architecture/browser-editor.md)
- Pattern reference: Image Viewer (`src/renderer/editors/image/`) — page-editor with toolbar
- Related doc: [Editor Guide](../../standards/editor-guide.md)
