# Browser Editor Architecture

> Read this before modifying or extending the browser editor.

## Overview

The browser editor embeds Chromium `<webview>` elements inside a tab, providing an in-app web browser with **multi-tab support**. Each browser page (persephone tab) contains its own set of internal browser tabs, displayed in a left-side panel. Unlike other editors that live entirely in the renderer process, the browser editor spans **three process boundaries** with IPC bridges between each.

## Tab Architecture

The browser editor uses three levels of tab nesting:

1. **Internal browser tabs** — Multiple tabs within a single browser editor page, shown on the left panel
2. **persephone tabs** — Multiple browser editor pages as separate persephone tabs
3. **persephone windows** — Browser editor pages across separate application windows

### Model Composition

`BrowserEditor` is the coordinator for the browser page. It owns editor-level
restore/persistence, profile presentation, navigation normalization, keyboard
shortcuts, and popup policy, while composing focused sub-models:

- `BrowserTabsModel` owns internal-tab lifecycle and tab-scoped resources:
  current URL and favicon caches, active-tab history, mute/panel operations, and
  the `BrowserBookmarks` resource.
- `BrowserTorModel` owns the per-instance partition identifiers, fail-closed
  proxy arming, Tor listeners/reconnect lifecycle, and window-close cleanup.
- `BrowserWebviewModel`, `BrowserUrlBarModel`, `BrowserBookmarksUIModel`, and
  `BrowserTargetModel` own webview events, URL-bar state, bookmark UI, and
  automation respectively.

The host keeps thin tab and Tor delegates for existing callers, but the
implementation and resource cleanup live in the relevant sub-model. Views read
tab-scoped data through `model.tabs` and the browser page still exposes the same
facade and IPC contracts.

### Tab Reordering

Internal browser tabs support drag-and-drop reordering through native HTML5 drag events and the shared trait system. Each tab in `BrowserTabsPanelView` carries the `BrowserTab` trait; on drop, `BrowserTabsModel.moveTab(fromId, toId)` splices the tab from its source position and inserts it at the target position. Since webviews are rendered through `PageManagerView` with stable native DOM placeholders, reordering the `state.tabs` array doesn't cause webview reloads. If a tab is dragged into a different group (see Tab Grouping below), it receives a new group ID.

### Tab Grouping

Each `BrowserTabData` has a `groupId` field (e.g. `bg-1`, `bg-2`). Tabs opened from the same parent share a group:

- **Manual actions** (plus button, bookmark click, typed URL) create a new group.
- **Link-opened tabs** (`target="_blank"`, "Open Link in New Tab" context menu) inherit the parent tab's `groupId` and are inserted after the active tab.

`BrowserTabsPanelView` visualizes groups with a 2px left border (via `::before`, separated from the
tab's own selection border). Groups alternate between two brightness levels based on the sequential
order of first appearance in the tab list (`groupColors`).

Group IDs are persisted in `getRestoreData()`. `applyRestoreData()` assigns fresh group IDs to restored tabs that lack one (backward compatibility).

The compact tab hover preview uses the native `PopoverView` and `@floating-ui/dom`. The former
React-only `@floating-ui/react` dependency is not part of the browser editor; `@floating-ui/dom`
remains the shared positioning dependency for eight UIKit consumers.

### Tab Activation History

`BrowserTabsModel` maintains a private `activeTabHistory` stack (array of tab IDs, most recent last). When `switchTab()` or `addTab()` changes the active tab, the previous active tab ID is pushed onto the stack. When `closeTab()` closes the active tab, it pops from the stack to find the most recent still-existing tab to activate, falling back to an adjacent tab if history is empty. The stack is cleaned up when tabs are closed (`closeTab`, `closeOtherTabs`, `closeTabsBelow`).

### New Window Handling

| Source | Disposition | Behavior |
|--------|------------|----------|
| `target="_blank"` link click | `foreground-tab` / `background-tab` | Opens as new internal tab in same browser page |
| `window.open()` from JavaScript | `default` / `new-window` | Opens as real popup BrowserWindow |

The main process intercepts these via `setWindowOpenHandler()` on the webContents. **Link clicks** (`target="_blank"`) are denied and relayed to the renderer as a `"new-window"` event, which calls `model.addTab(url, parentGroupId)` (inheriting the parent tab's group). **JavaScript `window.open()` calls** (OAuth popups, login dialogs, etc.) are allowed as real Electron BrowserWindows — this preserves the `window.opener` reference that auth flows need to communicate back to the parent page. The popup inherits the webview's session partition, so cookies and auth state are shared.

**Important:** The `<webview>` element requires `allowpopups="true"` for `setWindowOpenHandler` to fire on `target="_blank"` link clicks.

### Popup/Tab Rate Limiting

Both code paths (internal tabs and real popup windows) are protected by a **global app-wide rate limiter** (`globalPopupRateLimiter` from `src/ipc/popup-rate-limiter.ts`) — max 3 requests within 2 seconds across the entire application. This prevents cascade attacks where each new tab opens more tabs. When exceeded:

- **Internal tabs** (renderer): blocked in `BrowserWebviewModel.handleBrowserEvent("new-window")`; increments `blockedPopupCount` in state
- **Popup windows** (main process): blocked in `setWindowOpenHandler`; sends `"popups-blocked"` IPC event to renderer

Each process (main, renderer) imports the same `globalPopupRateLimiter` singleton but gets its own instance — this is fine because they guard different things (renderer: internal tabs via `"tabs"` key, main: popup BrowserWindows via `"popups"` key).

A notification bar appears below the loading indicator showing the blocked count. The user can click "Allow" to permanently whitelist popups for the session (allows both renderer and main process rate limiters via `BrowserChannel.allowPopups` IPC), or dismiss the bar.

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Guest Page (webview)          │  Renderer Process    │  Main Process│
│  (isolated Chromium context)   │  (native UI)         │  (Node.js)   │
├────────────────────────────────┼──────────────────────┼──────────────┤
│  preload-webview.ts            │  BrowserEditorView.ts   │  browser-    │
│  - MutationObserver on <head>  │  BrowserEditor.ts      │  service.ts  │
│  - Detects title/favicon       │  BrowserTabsPanel.ts │  - Attaches  │
│  - sendToHost() messages       │  - Toolbar, URL bar  │    to real   │
│                                │  - Multi-webview     │    webContents│
│                                │  - Tabs panel        │  - Relays    │
│                                │  - State management  │    events    │
└────────────────────────────────┴──────────────────────┴──────────────┘
```

## Multi-Webview Rendering

Each internal tab has its own `<webview>` element. All webviews are rendered in the DOM simultaneously, but only the active tab's webview is visible (`display` vs `display: none`). This preserves each tab's state (scroll position, form data, session) without re-navigation on tab switch.

### PageManagerView (Native Placeholder DOM Stability)

Webview elements are hosted by `PageManagerView` (`src/renderer/components/page-manager/`). The view owns imperatively-created placeholder divs, appends new placeholders with `appendChild`, and mounts one native `BrowserTabPageView` per tab. Each page view owns its `BrowserWebviewItemView` and its blank-page overlay, so no React island is needed for internal tabs. This prevents `<webview>` elements from being destroyed and recreated when the tab array changes (tabs closed, reordered).

Without PageManager, React's list reconciliation would detach and reinsert DOM nodes when array positions shift — even with stable keys. Reinserted `<webview>` elements are treated as new by the browser and reload, losing user data.

**How it works:**
1. For each tab ID, a stable placeholder `<div>` is created via `document.createElement()` and newly-created placeholders are appended to the manager root
2. A native `BrowserTabPageView` is mounted into each placeholder and owns the connected `BrowserWebviewItemView`
3. When a tab is closed, only its placeholder is removed with `removeChild()` — siblings are untouched
4. Visibility is controlled via `display: none` on inactive placeholders

The `BlankPageLinksView` overlay (bookmarks on empty tabs) is also owned by the per-tab native view, so its lifecycle is tied to that tab. Existing placeholders are never re-appended during tab reordering, so the `<webview>` element identity remains stable.

### Webview View Identity

`BrowserWebviewItemView` is a retained native child of `BrowserTabPageView`. The page view updates its tab projection imperatively while the `<webview>` element remains stable; navigation and per-event updates flow through `BrowserWebviewModel`. The blank-page overlay is an owned conditional child, released when the tab is no longer blank. This native identity boundary prevents browser state updates and tab-array reorderings from recreating guest renderer processes.

If you add a `tab` field that `BrowserWebviewItem` renders from, extend the memo comparator accordingly — otherwise the view goes stale.

`BrowserWebviewItem`'s mount effect also warns (`[browser] duplicate webview mount…`) when a webview mounts for a tab whose previous element is still connected to the DOM — a duplicate live mount leaks a whole guest renderer process. The warning exists to make that (rare, trigger unknown) condition self-identifying.

### dom-ready Gating

A `webviewReady` ref (a `Set<string>` of internal tab IDs) tracks which webviews have fired `dom-ready`. The navigation effect checks this before calling `webview.loadURL()`. Without this, calling `loadURL()` on a newly created webview before it's attached to the DOM crashes the app.

### IPC Registration

Each webview registers with the main process using a composite key: `${tabId}/${internalTabId}`. This supports multiple internal tabs per persephone page tab. Registration happens on `dom-ready`, and cleanup happens on component unmount.

**Important:** The IPC registration effect must NOT include `tab.url` in its dependency array. If it does, the effect cleanup runs on every URL change, which clears the `webviewReady` state and breaks navigation.

## Data Flow

### 1. User navigates (types URL + Enter)

```
BrowserEditorView → model.navigate(url) → state.url + active tab.url updated
    → Navigation effect detects URL change
    → Checks webviewReady before calling loadURL()
    → webview loads the page
```

### 2. Navigation events (page loaded, redirected)

```
webContents events (main)          IPC                    Renderer
─────────────────────────    ───────────────    ─────────────────────
did-navigate (url)       →  BrowserChannel  →  onBrowserEvent handler
                             .event              → model.tabs.currentUrls = url
                                                 → setUrlInput(url)
                                                 → model.updateFromWebview(...)
```

**CRITICAL:** Navigation events update `model.tabs.currentUrls` and `setUrlInput()` directly. They do **NOT** update `state.url`. If you update `state.url` from a navigation event, React will re-render `<webview src>` with the new URL, causing the webview's `attributeChangedCallback` to trigger a redundant navigation → ERR_ABORTED.

The rule: `state.url` = navigation target (set by user action only). `model.tabs.currentUrls` = actual current URL in each webview.

### 3. Title and favicon detection (preload script)

```
Guest Page DOM                  Preload                  Renderer
───────────────         ────────────────────     ─────────────────────
<title> changes     →   MutationObserver     →   ipc-message event
<link rel="icon">   →   reportTitle/Favicon  →   onIpcMessage handler
changes                 sendToHost(channel)       → model.updateFromWebview(...)
                                                   → model.tabs.cacheFavicon(...)
```

### 4. Loading state

```
Main process                    IPC                    Renderer
─────────────               ──────────         ─────────────────────
did-start-loading       →   browser:event  →   model.updateFromWebview({ loading: true })
did-stop-loading        →   browser:event  →   model.updateFromWebview({ loading: false })
```

### 5. Protocol blocking

```
Main process                    IPC                    Renderer
─────────────               ──────────         ─────────────────────
did-start-navigation    →   Check protocol →   If blocked: wc.stop()
(file:, app-asset:)         BLOCKED_PROTOCOLS   → send blocked event
                                                → webview.goBack()
```

**`BLOCKED_PROTOCOLS` is a navigation guard only.** It is checked on `did-start-navigation`, so
it stops a page from *navigating* to `file:` or `app-asset:` — it does not and cannot stop a
`fetch`, an `XMLHttpRequest`, a `<script src>`, or an `<iframe src>`.

What actually keeps `app-asset:` out of reach of web content is that **the protocol handler is
never registered on a browser page's session.** `registerAssetProtocol` (`src/main/main-setup.ts`)
installs it on the app partition and the file-access partition only, while browser pages run in
`persist:browser-*`, incognito, or Tor partitions — where the scheme simply has no handler and
every request fails. Boards are the deliberate exception: their frames live in the app session,
so board content *can* read `app-asset:`.

Keep both mechanisms in mind when changing either. Removing `app-asset:` from
`BLOCKED_PROTOCOLS` as "redundant" would re-open top-level navigation to it, and adding a
protocol to that list does **not** make it unreadable from page script.

## Context Menu

The webview's right-click context menu is intercepted in the main process and relayed to the renderer for display as the app's popup menu.

### Flow

```
Main Process                          IPC                       Renderer
─────────────                    ──────────────          ────────────────────────
webContents                      BrowserChannel          BrowserEditorView
  context-menu event         →     .event            →     onBrowserEvent handler
  event.preventDefault()           type: "context-menu"     → SVG probe (elementFromPoint)
  params: linkURL, srcURL,         data: x, y, linkURL,    → Build MenuItem[] based on context
    selectionText, isEditable,       srcURL, selectionText, → showAppPopupMenu(x, y, items)
    editFlags, x, y                  isEditable, editFlags
```

### Context-Sensitive Items

`webview-context-menu.ts` builds the menu dynamically based on `params` fields from the `context-menu` event; `BrowserWebviewModel` supplies the webview and editor callbacks.

| Condition | Menu Items |
|-----------|------------|
| `linkURL` present | Open Link in New Tab, Copy Link Address |
| `srcURL` + `mediaType === "image"` | Open Image in New Tab, Copy Image Address |
| `selectionText` present | Copy (uses `navigator.clipboard.writeText`) |
| `isEditable` | Cut, Copy, Paste (uses `webview.cut/copy/paste()` with `webview.focus()`) |
| SVG probe finds `<svg>` ancestor | Open SVG in Editor |
| Always | Back, Forward, Reload, View Source, View Actual DOM, Show Resources, Inspect Element |

### Key Implementation Details

- **Coordinates:** `params.x/y` are in host window coordinate space (used for popup position). For `webview.inspectElement()` and `elementFromPoint()`, subtract the webview's bounding rect to get webview-relative coordinates.
- **SVG extraction:** Uses `webview.executeJavaScript()` to probe the click target with `elementFromPoint()` + `closest('svg')`. The SVG is cloned and auto-fixed (xmlns, viewBox from `getBBox()`, width/height, HTML comment stripping). The probe is bounded by `withTimeout(..., SVG_PROBE_TIMEOUT, null)` — see [Bounding page probes](#bounding-page-probes). On timeout the "Open SVG in Editor" item is dropped and the menu opens immediately; on idle pages the probe resolves near-instantly and the item is included.
- **"Add to Bookmarks" link info:** Probes the right-clicked `<a>` for a title and an `<img>` src, bounded the same way (`LINK_PROBE_TIMEOUT`, 1 s). The URL comes from the context-menu params rather than the page, so a timed-out probe costs only the suggested title and image.

### Bounding page probes

`webview.executeJavaScript()` queues on the **page's** renderer main thread, not ours. A page that is mid-load or busy can leave the call pending for as long as the load takes, and anything awaiting it stalls with it — a menu that never opens, a dialog that appears a minute later. Every probe whose result is a *suggestion* rather than a requirement is therefore bounded by `withTimeout(promise, ms, fallback)` (`core/utils/utils.ts`) and the UI proceeds with what the app already knows from its own state. `withTimeout` also maps a rejection to the fallback whether it arrives before or after the deadline, so an abandoned probe cannot resurface as an unhandled rejection.

The budget is per call site: a context-menu item that merely appears or disappears can afford 250 ms, while a dialog gathering image suggestions is given 1 s.
- **View Actual DOM / Show Resources:** Uses `ipcRenderer.invoke(BrowserChannel.collectDom, key)` to collect the full DOM from the main process. The main process iterates `webContents.mainFrame.framesInSubtree` to collect DOM from all frames (including cross-origin iframes), then uses cheerio to inject each iframe's DOM inside the corresponding `<iframe>` element in the parent HTML.
- **Copy for selections:** Uses `navigator.clipboard.writeText(selectionText)` instead of `webview.copy()` because the webview loses focus when the popup menu opens.
- **Popup dismissal:** Webview clicks don't bubble to the renderer DOM. A transparent overlay (`webview-click-overlay`) is rendered over the webview area while a popup menu is open, allowing clicks to reach the renderer's `document` and trigger the popup's dismiss handler.
- **skipInspect:** The browser context menu provides its own "Inspect Element" item, so `showAppPopupMenu` is called with `{ skipInspect: true }` to suppress the app's default "Inspect" item.

## Browser Panel Host

The browser editor mounts a native `SecondaryViewsView` inside both `BlankPageLinksView`
(empty-page bookmarks overlay) and `BookmarksDrawerView`. To do this without a `PageModel`,
`BrowserPanelHost` implements the `IPageHost` interface that `SecondaryViewsView` requires.

**Key design points:**
- `BrowserPanelHost` is **not** a `PageModel` — it has no tab identity or page lifecycle. It lives only for the lifetime of the browser editor that created it.
- `sidebarMandatory` is permanently `true`. The bookmarks panel can never be closed via the ✕ button or toggle.
- `mainEditorInstance` returns the bookmarks `LinkEditor`, so `linkEditor.isMain === true` — this satisfies `isMain`-gated features (e.g., showing save affordances).
- The optional main-editor-navigation members of `IPageHost` (`switchMainEditor`, `promoteSecondaryToMain`) are **omitted** — there is no main-editor navigation in the browser panel context.
- Sidebar width is persisted in the browser's own state by subscribing to `onWidthChange` — not in `openFiles0.json`.
- The host lives in `editors/browser/` (not `api/pages/`) to avoid an import cycle via `LinkEditor`.

`BrowserSecondaryViewsView` wires the native `SecondaryViewsView` to a `BrowserPanelHost`, passing
`views`, `state`, and `setState`. It is mounted in both `BlankPageLinksView` and
`BookmarksDrawerView`.

## Key Files

| File | Process | Purpose |
|------|---------|---------|
| `src/renderer/editors/browser/BrowserView.ts` | Renderer | Native browser view composition: toolbar, URL bar, multi-webview hosting, and overlays |
| `src/renderer/editors/browser/BrowserEditor.ts` | Renderer | Editor coordinator: restore/persistence, navigation normalization, profile presentation, keyboard shortcuts, and composed sub-model lifecycle |
| `src/renderer/editors/browser/BrowserTabsModel.ts` | Renderer | Internal-tab lifecycle, current URL and favicon caches, mute/panel operations, and bookmark resource ownership |
| `src/renderer/editors/browser/BrowserTorModel.ts` | Renderer | Per-page Tor partition IDs, proxy arming, daemon listeners/reconnect, and cleanup |
| `src/renderer/editors/browser/BrowserWebviewModel.ts` | Renderer | Webview refs, `browser:event` IPC handling, navigation updates, find-in-page, keyboard shortcuts |
| `src/renderer/editors/browser/webview-context-menu.ts` | Renderer | Browser webview context-menu construction and bounded DOM/SVG/resource probes |
| `src/renderer/editors/browser/BrowserTargetModel.ts` | Renderer | Automation adapter sub-model — implements `IBrowserTarget` for MCP tools |
| `src/renderer/editors/browser/BrowserTabsPanel.ts` | Renderer | Native left-side internal tabs panel with compact floating preview and drag-to-reorder |
| `src/renderer/editors/browser/BrowserBookmarks.ts` | Renderer | Wraps TextFileModel + LinkEditor for bookmark file I/O |
| `src/renderer/editors/browser/BookmarksDrawer.ts` | Renderer | Native sliding overlay drawer rendering the Link Editor for bookmarks |
| `src/renderer/editors/browser/BrowserPanelHost.ts` | Renderer | `IPageHost` implementation for the browser's bookmarks sidebar (non-page host) |
| `src/renderer/editors/browser/BrowserSecondaryViews.ts` | Renderer | Native `SecondaryViewsView` wiring for blank page and BookmarksDrawer |
| `src/renderer/editors/browser/UrlSuggestionsDropdown.ts` | Renderer | Native URL bar dropdown with search history and navigation history |
| `src/renderer/editors/browser/browser-search-history.ts` | Renderer | Per-profile persistent search history storage (file-based) |
| `src/renderer/editors/browser/TorStatusOverlay.ts` | Renderer | Native Tor connection overlay with spinner, log, reconnect button |
| `src/renderer/editors/browser/network-log-links.ts` | Renderer | Network log → ILink[] conversion for Show Resources |
| `src/renderer/automation/commands.ts` | Renderer | Playwright-compatible browser_* MCP command handlers |
| `src/renderer/automation/snapshot.ts` | Renderer | Accessibility tree → YAML formatter for browser_snapshot |
| `src/renderer/automation/CdpSession.ts` | Renderer | CDP session wrapper (IPC to main process debugger) |
| `src/renderer/automation/AppTargetModel.ts` | Renderer | `IBrowserTarget` adapter for the app's own UI (`pageId: "app"`) |
| `src/renderer/automation/types.ts` | Renderer | `IBrowserTarget` interface — what automation needs from browser editor |
| `src/main/browser-service.ts` | Main | Attaches to webContents, relays events via IPC, audio state, hotkeys, cache cleanup, DOM collection (incl. iframes) |
| `src/main/cdp-service.ts` | Main | CDP session management — debugger attach/detach/send via IPC |
| `src/main/network-logger.ts` | Main | Per-page HTTP request/response logging via `session.webRequest`, circular buffer, IPC access |
| `src/main/tor-service.ts` | Main | Tor process lifecycle: spawn/kill tor.exe, restart, per-partition SOCKS5 proxy (armed before the daemon starts so the partition fails closed), torrc generation, exit-IP lookup |
| `src/main/tor-src-protocol.ts` | Main | `tor-src://` handler — fetches an `http(s)` URL through a Tor partition's session |
| `src/renderer/editors/link-editor/tor-src.ts` | Renderer | Rewrites remote image `src` values to `tor-src://` for a Tor page's Link editor |
| `src/renderer/ui/dialogs/TorInfoDialog.ts` | Renderer | Tor connection info: exit IP, location, Reconnect |
| `src/preload-webview.ts` | Guest | MutationObserver for title/favicon, image tracking on link clicks, cinema mode (expand `<video>` to full page), `window.chrome` compatibility shim |
| `src/ipc/browser-ipc.ts` | Shared | IPC channel names and type definitions |
| `src/ipc/tor-ipc.ts` | Shared | Tor IPC channels + `TorStatus`/`TorIpInfo` types: arm, start, stop, log, check-ip, restart, status |
| `src/ipc/popup-rate-limiter.ts` | Shared | Time-window rate limiter for popup/tab spam blocking |
| `src/renderer/editors/shared/link-open-menu.ts` | Renderer | Shared helper for "Open in..." browser menu items |
| `src/renderer/core/state/events.ts` | Renderer | `globalKeyDown` Subscription for keyboard event broadcasting, `browserUrlChanged` for cross-editor URL event broadcasting, `windowClosing` for resource cleanup on window close, `secondaryViewsToggled` for sidebar open/close, `panelExpanded` for secondary panel expansion |

## Why the Main Process Bridge?

The `<webview>` DOM element's event API is unreliable — events like `page-favicon-updated` don't fire consistently on back/forward navigation. The main process has direct access to the real `webContents` object, where these events fire reliably. The bridge:

1. Renderer registers webview via `BrowserChannel.register` (sends `webContentsId`, `tabId`, `internalTabId`)
2. Main process calls `webContents.fromId(id)` to get the real object
3. Main process attaches native event listeners
4. Events are relayed back via `BrowserChannel.event` with `internalTabId` for routing
5. Main process also sets `windowOpenHandler` to intercept new-window requests

## Why the Preload Script?

The main process `page-favicon-updated` event works for most cases, but the preload script provides a complementary detection mechanism using DOM observation. It:

- Uses `MutationObserver` on `<head>` to detect `<link rel="icon">` and `<title>` changes
- Runs in an isolated JavaScript context (context isolation) — page scripts cannot interfere
- Sends messages via `ipcRenderer.sendToHost()` → received as `ipc-message` events on the `<webview>` element
- Retries after page `load` event (200ms + 1000ms) for JS-heavy sites that set metadata late

## Browser Compatibility Shim (`window.chrome`)

Some sites (notably Google sign-in) reject an embedded Chromium browser with *"This browser or app may not be secure"* when `window.chrome` is an empty object — genuine Chrome populates it with `loadTimes`, `csi`, and `app`, and the site evaluates it during initial page load. The preload defines a minimal, realistic `window.chrome` so the browser presents like the Chrome it actually is.

Because the site's own scripts read `window.chrome`, the shim must exist in the page's **main world at document-start**:

- The preload runs in an **isolated world** (context isolation stays on), so a plain `window.chrome = …` there is invisible to page scripts.
- A DOM `<script>` injection would reach the main world but is blocked by strict site CSPs (e.g. Google accounts).

The preload therefore uses `contextBridge.executeInMainWorld({ func })`, which runs the definition in the main world before the page's first script while keeping context isolation intact — no debugger and no CSP dependency. The shim is guarded so it never overrides a real Chrome `window.chrome`, and wrapped in `try/catch` to degrade to a no-op on Electron builds without the API.

## Cinema Mode (Preload)

The preload script injects a cinema mode feature — an expand/collapse button that appears on `<video>` elements when hovered, allowing the user to expand a video to fill the entire webview page.

**How it works:**

1. `initCinemaMode()` scans the page for `<video>` elements and sets up a `MutationObserver` to catch dynamically added elements.
2. `attachCinemaListeners()` registers `mouseenter`/`mouseleave` on each element's **parent container** (not the element itself — overlay divs often intercept events on the element).
3. On hover, `showCinemaBtn()` creates a `position: fixed` button (using DOM API, not `innerHTML` — pages with Trusted Types CSP block `innerHTML`) and appends it to `document.body`. The button repositions on `scroll` events.
4. On click, `enterCinema()`:
   - Saves each ancestor's `style.cssText`, then sets all ancestors to `position: fixed; 100vw × 100vh` — expanding the container chain without touching the target element itself (sites like YouTube continuously overwrite the video's inline styles)
   - Hides siblings of every ancestor via `visibility: hidden` (keeps the ancestor chain visible so the GPU compositor continues rendering video frames)
   - Appends a black backdrop div to `document.body`
   - Dispatches `window.resize` to trigger the site's resize handlers (e.g. YouTube recalculates video size from the new container dimensions)
   - For `<video>` elements: enables `video.controls = true` and watches with `MutationObserver` to restore it if the site removes the attribute
5. On collapse (button click or Escape), `exitCinema()` restores all saved styles and dispatches `window.resize` again.

**Key implementation constraints:**
- Button uses `document.createElementNS()` for SVG icons (not `innerHTML`) — required for pages with Trusted Types CSP (e.g. YouTube)
- Button is created on `mouseenter` and destroyed on `mouseleave` — sites like YouTube clean up unexpected persistent DOM children
- Never touches `<video>` inline styles directly — YouTube's JS overwrites them continuously; containers are resized instead
- `visibility: hidden` on siblings (not `display: none`) — keeps layout intact, preventing reflow that would confuse the site's JS

## Favicon Handling

Favicons use a caching strategy to avoid showing the globe icon during same-origin navigations:

1. When a favicon is received (from preload), it's cached by origin: `model.tabs.cacheFavicon(url, favicon)`
2. On `did-navigate`, the cached favicon for the new URL's origin is applied immediately
3. The preload script then fires with the actual favicon, updating if different

The `getIconElement()` method on `BrowserEditor` builds the current DOM glyph synchronously from the
browser mode and profile color. `PageTab` subscribes to favicon changes via `_iconHint` in its state
selector to trigger re-renders; the browser editor's own icon state is refreshed through its normal
model update path.

## Build Configuration

The webview preload script (`src/preload-webview.ts`) is built as its own bundle entry —
watch-built by `scripts/dev.mjs` in development and bundled by `scripts/build-prod.mjs` for
production (each declares it with an inline Vite config; there is no standalone
`vite.*.config.ts` file). It is emitted next to the main preload as `preload-webview.js`.

The main preload (`src/preload.ts`) exposes the path to the webview preload:

```typescript
(window as any).webviewPreloadUrl = pathToFileURL(
    path.join(__dirname, "preload-webview.js"),
).toString();
```

## Session Restore

`getRestoreData()` saves all internal tabs with their actual current URLs (from the `BrowserTabsModel.currentUrls` map, which tracks post-redirect URLs). `applyRestoreData()` restores them with fresh internal tab IDs and ensures each tab has a `groupId` (assigning a new one if missing for backward compatibility). The active tab is identified by index position during restore. Profile name, incognito flag, and Tor flag are also saved/restored.

Navigation history (`navHistory` on each `BrowserTabData`) is persisted as part of the tab state via `getRestoreData()`. Search history is stored separately per profile in the app data folder using `SearchHistoryStorage` (file-based, max 2000 entries). Incognito and Tor profiles skip search history persistence.

Tor pages are restored with a fresh empty tab (no URLs from previous session) and `torStatus: "disconnected"`. The Tor overlay is shown with a "Reconnect" button — the user must explicitly reconnect.

## Profiles & Incognito

Each browser page is bound to a **profile** that determines its Electron session partition. All internal tabs within the same browser page share the same profile.

### Partition Mapping

| Mode | Partition String | Persistence |
|------|-----------------|-------------|
| Default profile | `persist:browser-default` | Persists across restarts |
| Named profile "work" | `persist:browser-work` | Persists across restarts |
| Incognito | `browser-incognito-<uuid>` | Cleared when page closes |
| Tor | `browser-tor-<uuid>` | Cleared when page closes |

`getPartitionString()` in `BrowserEditorModel.ts` computes the partition. `BrowserTorModel.partition` is a **getter** (not a stored field) because the profile state may be set after model construction in `showBrowserPage()`. Each incognito/Tor model has stable IDs (random UUIDs generated once per instance) to keep the partition consistent across getter calls.

### Profile Settings

Profiles are stored in app settings as `BrowserProfile[]` (`{ name, color }`). A separate `browser-default-profile` setting tracks which profile the "Browser" quick-add menu item uses. Colors come from the `TAG_COLORS` palette in `palette-colors.ts`, and the built-in default uses `DEFAULT_BROWSER_COLOR` (cyan `#4DD0E1`).

### Page Tab Icons

| Mode | Icon |
|------|------|
| Default profile (no name) | GlobeIcon tinted with `DEFAULT_BROWSER_COLOR` or default profile's color |
| Named profile | GlobeIcon tinted with the profile's color |
| Incognito | IncognitoIcon |
| Tor | TorIcon (purple onion, branded colors) |

The `resolvedColor` getter on `BrowserEditor` resolves the color chain: explicit profile → default profile setting → `DEFAULT_BROWSER_COLOR`.

### Incognito Indicator

Incognito pages show an `IncognitoIcon` inside the URL bar's left edge, using the `startButtons` prop on `TextField`.

### Tor Mode

Tor mode routes all webview traffic through the Tor network via a SOCKS5 proxy. Like incognito, Tor partitions are ephemeral (no `persist:` prefix). The Tor process is managed lazily — started on first Tor page open, stopped when the last Tor page closes.

**Architecture:**
- `src/main/tor-service.ts` — manages `tor.exe` child process lifecycle, generates minimal torrc, sets `socks5://` proxy per partition via `session.fromPartition().setProxy()`
- `src/ipc/tor-ipc.ts` — IPC channels: `tor:arm`, `tor:start`, `tor:stop`, `tor:log`, `tor:check-ip`, `tor:restart`, `tor:status`
- `src/renderer/editors/browser/TorStatusOverlay.ts` — native overlay shown during connection with live log, spinner, and reconnect button
- `src/renderer/ui/dialogs/TorInfoDialog.ts` — connection info dialog (exit IP, location, Reconnect)
- `activePartitions: Set<string>` acts as consumer counter — Tor stops only when all partitions are released

**Tor indicator in URL bar:** A clickable TorIcon with a small status dot (green=connected, red=error, yellow=disconnected). Clicking toggles the `TorStatusOverlay`.

**Session restore:** Tor pages are restored with `torStatus: "disconnected"`, `torOverlayVisible: true`, and an empty tab. User must click "Reconnect" — no auto-connect on restore.

**Window close cleanup:** `BrowserTorModel` subscribes to the `windowClosing` event (from `GlobalEventService.beforeunload`) to release Tor partitions when the window closes without explicit tab disposal.

#### The partition fails closed

An Electron session with no proxy is **DIRECT**, so the absence of a proxy is not a neutral
state — it is an unproxied one. The proxy is therefore applied to the partition *before* the
daemon exists, not once it bootstraps:

1. `BrowserTorModel.armProxy()` invokes `tor:arm`, and it is awaited from
   `BrowserEditor.restore()` — which runs on **every** path that produces a Tor page, session
   restore included, and always before the page is added to the window. That ordering is
   load-bearing: `addPage` mounts the first `<webview>` with its `src` already set, so the guest
   starts fetching immediately, whereas a cold daemon bootstrap takes seconds.
2. `TorService.armPartition()` points the session at the SOCKS port while nothing is listening
   on it yet. Anything that loads during the bootstrap window therefore fails with
   `ERR_SOCKS_CONNECTION_FAILED` instead of reaching the network.
3. `settleStart()` applies the proxy on **both** start outcomes. On success that is what puts
   traffic on Tor; on failure it is what keeps the partition failing closed, so a daemon that
   never bootstraps does not leave a page browsing normally.

`armTorProxy` is idempotent — the flag is set only on success — because three callers each have
to guarantee arming without being able to see whether another already did:

- **`restore()`** is the one that always runs, and it records a failure into `torStatus` rather
  than throwing, so a failed arm never drops a page from a session restore.
- **`showBrowserPage`** re-asserts it and, if arming fails, notifies and **does not open the
  page** — a Tor page whose partition could not be proxied would browse over the normal network,
  so no page is the correct outcome.
- **`reconnectTor`** covers a partition whose earlier arming failed. It matters because
  `initTorProxy` reaches `setProxyForPartition` only *after* the daemon settles: on a cold daemon
  that is another 5–30 s window, and it is reachable, since a restored Tor page resets its tabs
  to `about:blank` but leaves the URL bar live.

Arming deliberately does not add the partition to `activePartitions`. That set, via
`isActiveTorPartition()`, answers a different question — "is this a live, *bootstrapped* Tor
session?" — for the `tor-src://` handler and `checkIp`, and an armed partition is not one yet.

Consequently no navigation site consults `torStatus`: the armed proxy is the single enforcement
point, rather than a check duplicated across `navigateWebview`, `addTab`, and the URL bar.

One gap remains by design. A daemon that dies is caught — `child.on("close")` broadcasts
`tor:status` `"error"` when `isCurrent(child)` still holds, which distinguishes an unexpected
exit from a deliberate `stopTorProcess()` or `restart()` (both null out `torProcess`
synchronously, before their own close event arrives). But a daemon that stays alive while its
circuits fail keeps a green dot: detecting that needs active probing. It is a status-honesty
gap, not a leak — such requests already fail closed.

#### The proxy covers the webview, not the renderer

The SOCKS proxy is attached to the **page's session partition**, so it covers only what the
`<webview>` loads. Renderer-side React code runs in the app window's own session (`nopersist`),
which is unproxied. Any feature that fetches a remote URL from the renderer on behalf of a Tor page
therefore bypasses Tor unless it is routed deliberately.

Two consequences are handled explicitly:

- **Link-editor images.** A Tor page's blank tab renders the bookmarks `LinkEditor`, whose tile and
  tooltip images are plain `<img>` tags in the app renderer. `LinkEditor.imageProxySource` (wired by
  `BrowserTabsModel.configureBookmarks`) hands it the page's partition, and
  `resolveTorSrc()` (`src/renderer/editors/link-editor/tor-src.ts`) rewrites remote `src` values to
  `tor-src://<partition>/?u=<encoded url>`. Local schemes (`data:`, `blob:`, `file:`,
  `app-asset:`) pass through untouched, and when the circuit is not connected the image is not
  rendered at all rather than fetched direct.
- **Favicon persistence.** Favicons are normally written to the app data folder. `LinkEditor.isTorPage`
  gates the `requestFaviconSave` call sites, and `BrowserBookmarksUIModel` skips the save for Tor as
  it already did for incognito. The marker set behind `requestFaviconSave` is module-level and shared
  by every browser page, so a marker armed from a Tor page would otherwise be honoured later by a
  non-Tor one.

The proxy resolver lives in `link-editor/`, not `browser/`, to keep the dependency arrow one-way —
`browser` already imports `link-editor`.

#### `tor-src://` scheme

`src/main/tor-src-protocol.ts` registers a handler on the app window's session that fetches an
arbitrary `http(s)` URL through a Tor partition's session, so the SOCKS proxy applies. Three guards
are load-bearing and required together:

1. The host must match the `browser-tor-<uuid>` partition shape.
2. `TorService.isActiveTorPartition()` must confirm a live, bootstrapped Tor session — the scheme is
   inert whenever no Tor page is running.
3. The target must be `http:` or `https:`.

The target URL travels in a `?u=` query parameter rather than a path segment: Chromium canonicalizes
`standard: true` scheme paths and can rewrite percent-escapes, corrupting a target that carries
escapes of its own. Responses are returned with `Cache-Control: no-store`, and the scheme is
registered **without** `corsEnabled` — enabling CORS would turn it into "any document in the app
session can read arbitrary cross-origin content through Tor".

#### Connection info dialog

A `QuestionIcon` toolbar button, rendered only for Tor pages, opens `TorInfoDialog`. It reports the
exit IP, an approximate location, and whether `check.torproject.org` confirms the request arrived
over Tor. Lookups run in main (`TorService.checkIp`) via `session.fromPartition(partition).fetch()` —
a renderer-side fetch would go out unproxied and hand the checker the user's real IP. The exit-IP call
and the geo providers carry separate timeouts, and a failing geo provider still leaves the IP visible.

**Reconnect** restarts `tor.exe` (`TorService.restart`) rather than signalling `NEWNYM` over a control
port; that keeps `torrc` untouched and adds no loopback control surface. Two invariants make the
restart safe:

- The old process's `close`/`error` handlers only clear shared state when
  `this.torProcess === child`. The old child's `close` event arrives after the replacement is already
  assigned, so an unguarded reset would null out a healthy process and leave `running` false while
  Tor is up.
- `stopTorProcessAndWait()` awaits the old process's exit before respawning. Tor holds a `lock` file
  inside its `DataDirectory`, and a replacement that races the exit fails to start.

Because the daemon is shared, a restart affects every open Tor page. Their `torStatus` lives in
renderer state that main cannot see, so `TorService` broadcasts `tor:status` and each Tor page's
`torStatusListener` follows it — otherwise the other pages would keep showing a green dot while Tor
is down. A new circuit may legitimately reuse the same exit node, so the dialog reports an unchanged
IP as such instead of implying the reconnect failed.

### Clear Profile Data

The renderer can clear all browsing data for a partition via `ipcRenderer.invoke(BrowserChannel.clearProfileData, partition)`. The main process handler calls `session.fromPartition(partition).clearStorageData()` + `clearCache()`. This is used in two places:
- "Clear data" button on each profile row in Settings
- Profile deletion (confirmation dialog, then clear + remove from settings)

### Automatic Cache Cleanup on Page Close

When a browser page is closed (disposed), its HTTP cache, V8 code cache, and service worker caches are automatically cleared via `BrowserChannel.clearCache`. This prevents Chromium's disk caches from growing indefinitely. Cookies, localStorage, IndexedDB, and sessionStorage are preserved — users stay logged in.

The `clearCache` IPC handler runs three operations in parallel:
- `session.clearCache()` — HTTP disk cache (scripts, images, stylesheets)
- `session.clearCodeCaches({})` — V8 compiled bytecode cache
- `session.clearStorageData({ storages: ["serviceworkers", "cachestorage"] })` — service worker scripts and CacheStorage

Skipped for incognito and Tor pages since they use non-persistent partitions (no `persist:` prefix = memory-only).

**Disposal lifecycle:** `page.dispose()` is called from the `onClose` callback in `PagesModel.ts`, which fires when the user closes a tab. The `movePageOut` flow (tab transfer to another window) calls `detachPage()` first, which clears `onClose`, preventing disposal of transferred pages.

## Link Integration

External links clicked in Monaco or Markdown editors are routed through an IPC event (`eOpenUrl`) from the main process to the renderer. The renderer checks the `link-open-behavior` app setting:

- `"default-browser"` (default): Opens the URL via `shell.openExternal()`
- `"internal-browser"`: Opens the URL in the nearest browser tab via `openUrlInBrowserTab()`

### Link Routing Flow

```
Main Process                    IPC                    Renderer
─────────────               ──────────         ─────────────────────
will-navigate (http url)   →  eOpenUrl(url)  →  Check appSettings
setWindowOpenHandler(url)  →  eOpenUrl(url)  →    → "default-browser": shell.openExternal(url)
                                                  → "internal-browser": openUrlInBrowserTab(url)
```

### Smart Browser Tab Search (`openUrlInBrowserTab`)

Located in `src/renderer/editors/browser/browser-pages.ts` (reached through a thin dynamic-import delegate on `PagesLifecycleModel`, so the browser chunk stays out of startup). Resolves to the id of the browser page the URL was opened in (`undefined` only when no page could be opened, e.g. Tor misconfiguration) — the `open_url` MCP tool surfaces it as `{ opened, pageId, title }` so agents can target the page explicitly instead of relying on the active-page default. Two search strategies depending on the source:

**Internal links** (Monaco, Markdown — `link-open-behavior: "internal-browser"`):
1. Search pages to the **right** of the active page for a matching browser tab
2. If not found, search pages to the **left**
3. If still not found: create a new Browser page (using the default profile) as the last tab

**External links** (IPC from main process via `eOpenExternalUrl`, e.g. default browser registration):
1. **Prefer the active page** if it's already a matching browser tab
2. If not, search **all pages** (left to right) for a matching browser tab
3. If still not found: create a new Browser page (using the default profile) as the last tab

For existing browser tabs: if the tab has only one empty (`about:blank`) internal tab, `navigate(url)` reuses it; otherwise `addTab(url)` creates a new internal tab.

**Matching criteria:** A browser page matches only if it is **not** incognito and **not** Tor. Incognito and Tor pages are always skipped — a normal URL is never opened in a private session automatically. When `options.incognito` is explicitly `true`, only incognito pages match (Tor pages are still excluded).

### Markdown Link Context Menu

Right-clicking a link in Markdown Preview (or Notebook embedded Markdown) shows additional items for external URLs (http/https) via the shared `appendLinkOpenMenuItems()` helper:
- "Open in Default Browser" — `shell.openExternal(href)`
- "Open in Internal Browser" — `openUrlInBrowserTab(href)`
- Per-profile items — `openUrlInBrowserTab(href, { profileName })` for each configured browser profile
- "Open in Incognito" — `openUrlInBrowserTab(href, { incognito: true })`

### Exceptions

- **About page links** always open in the OS default browser (direct `shell.openExternal()` call, bypasses IPC routing)
- **HTML Preview** blocks all link navigation (unchanged)
- **Browser Editor** has its own link handling (new internal tabs, context menu) — not affected
- **Local markdown links in Markdown Preview** are intercepted in the renderer and navigate the **current page** in place (with a per-page Back history) — they never reach the main-process `will-navigate` → new-tab path above. Only non-markdown and external links from the Markdown view use the routing described here. See [Pages Architecture → Markdown in-page navigation](pages-architecture.md#markdown-in-page-navigation).

## Bookmarks

Each browser profile can be associated with a `.link.json` bookmarks file. A configured file is preloaded silently after the browser page is created; encrypted files defer initialization until the first user action (star button or "Open Links"). The loaded resource is reused for the lifetime of the browser page.

### Architecture

```
BrowserEditor
    └─ BrowserTabsModel.bookmarks
        ├─ TextFileModel — file I/O, encryption, FileWatcher, auto-save
        └─ LinkEditor   — parsed link data, categories, tags, filters
```

`BrowserBookmarks` wraps both models. `TextFileModel` handles reading/writing the `.link.json` file (including encryption/decryption), while `LinkEditor` provides the structured data layer. Every mutation flows through `LinkEditor.onDataChanged()` → `TextFileModel.changeContent()` → debounced save to disk.

### Initialization Flow

Bookmarks load through two paths:

**Eager preload (silent):** The `BrowserTabsModel` constructor schedules `preloadBookmarks()` after a 300ms delay. It checks for a configured bookmarks file, calls `BrowserBookmarks.init({ silent: true })` which skips the password dialog for encrypted files. If successful, bookmarks appear immediately on blank tabs. If encrypted, bookmarks stay null until the user triggers manually.

**Manual trigger (interactive):** User clicks ☆ (star) or "Open Links" → check `model.tabs.bookmarks !== null` → if null, read the profile's bookmarks file path through `model.tabs.getBookmarksFilePath()` → if no file path, show "Associate Bookmarks File" dialog → create `BrowserBookmarks(filePath)` → `model.tabs.initBookmarks(filePath)` with a password dialog if encrypted → store on `BrowserTabsModel.bookmarks`.

After initialization, `BrowserTabsModel` sets two callbacks on `linkModel`:
- `onLinkOpen` — modifies the link event data before it enters the `openRawLink` pipeline: sets `target: "browser"` and `metadata.browserPageId` pointing to the owning browser page. The HTTP resolver's browser branch then routes the URL to that specific page (navigates current blank tab via `browserTabMode: "navigate"`, or adds a new tab if the current tab has content).
- `onGetLinkMenuItems` — returns an "Open in New Tab" menu item that calls `BrowserTabsModel.addTab(url)`. These items are prepended to the link context menu (before "Edit"), providing mouse-only access to new-tab behavior without requiring `Ctrl+Click`.

### Three Entry Points

- **Blank page overlay** — when a tab shows `about:blank` and bookmarks are loaded (not encrypted), the `BlankPageLinksView` renders the Link Editor over the empty webview. Has its own toolbar (with breadcrumb, view mode, search). Disappears when user navigates to a URL.
- **Star button (☆)** in the URL bar — quick bookmark add/edit. Empty star when URL not bookmarked, filled star when bookmarked. Opens Edit Link Dialog with URL/title prefilled and discovered images. Everything the handler does before the dialog is async (bookmark-file setup, favicon caching, the page image probe), so it is guarded by a `starClickBusy` flag: without it, a user clicking again because nothing has appeared yet gets one dialog per click, all opening together once the awaits settle.
- **"Open Links" button** on the toolbar — opens the `BookmarksDrawerView`, a right-anchored overlay with the full Link Editor. Link clicks navigate to the URL (in current tab if `about:blank`, otherwise new internal tab) and close the drawer.

### Image Discovery

Images for bookmarks are collected from multiple sources:

1. **Meta tags** — `og:image`, `twitter:image`, `meta[name="thumbnail"]` extracted via `executeJavaScript` on the webview, bounded by `IMAGE_DISCOVERY_TIMEOUT` (1 s) — see [Bounding page probes](#bounding-page-probes)
2. **Click tracking** — the preload script captures all `<img>` URLs inside clicked `<a>` elements and sends them via `ipcRenderer.sendToHost("clicked-images", urls)`
3. **Per-tab image tracking** — `trackedImagesRef` stores discovered images per internal tab with navigation levels (level 0 = current page, level 1 = previous page, level 2 = two pages back; levels > 2 are dropped)
4. **Context menu** — "Use Image for Bookmark" pushes an image URL to level 0; "Add to Bookmarks" captures href, imgSrc, and title from the right-clicked element

All discovered images are merged (deduplicated) and passed to the Edit Link Dialog.

Only source 1 reads the live page, and it is the one that can be slow. The URL, title and favicon the dialog needs all come from the browser's own tab state, so a page that cannot answer costs image *suggestions* and nothing else.

### BookmarksDrawer

A right-anchored native overlay that renders the Link Editor with Categories/Tags panel on the right. Key behaviors:

- Initial width = 60% of browser page, max 90%, resizable via Splitter
- Width persisted in component state
- Portal refs passed via `LinkEditorProps` (`toolbarRefFirst`, `toolbarRefLast`, `footerRefLast`) — each consumer provides its own portal targets so multiple LinkEditor instances don't conflict
- Closes on Escape, backdrop click, or link click navigation

### Embedded Link Editor Composition

The browser embeds native Link Editor views for toolbar, body, secondary views, and footer content.
To support multiple simultaneous instances (blank page overlay + BookmarksDrawer), each native
composition owns its own DOM hosts while the shared `TextFileModel` remains the data source.

### Encrypted Bookmarks

If the `.link.json` file is encrypted, `BrowserBookmarks.init()` detects this via `isEncrypted(content)` and calls `showPasswordDialog({ mode: "decrypt" })`. This is the same async password dialog used by the text editor's encryption feature. If the user cancels, `init()` returns `false` and the bookmarks are not loaded. The `silent: true` option skips the dialog entirely (used by eager preload).

## Keyboard Shortcuts

Browser hotkeys (F5, F12, Alt+Left/Right, etc.) must work regardless of where focus is — inside the webview, on the toolbar, or elsewhere. This requires a three-layer approach:

### Layer 1: Main Process (`before-input-event`)

When focus is inside a `<webview>`, keyboard events are consumed by the guest page and never reach the renderer's DOM. The main process intercepts these via `webContents.on("before-input-event")` in `browser-service.ts`, handling F5, Ctrl+R, F12, Escape, and Alt+Left/Right directly on the webContents.

### Layer 2: Global Key Event Bus (`globalKeyDown` Subscription)

When focus is on any renderer element (toolbar, URL bar, tab panel, or no specific focus), the browser editor subscribes to a global keyboard event bus. `MainPageView` broadcasts all `keydown` events via `globalKeyDown.send(e)` (defined in `events.ts`). `BrowserEditor` subscribes in its constructor and handles browser hotkeys only when it's the active page. This keeps browser-specific logic out of the shell composition view.

### Layer 3: Root div `onKeyDown` (`BrowserWebviewModel`)

The root browser `<div>` handles `Ctrl+L` (focus URL bar) and `Ctrl+F` (find in page) — shortcuts specific to the browser UI that don't need global reach.

### Supported Hotkeys

| Shortcut | Action | Layers |
|----------|--------|--------|
| `F5` | Reload | Main process + global |
| `Ctrl+F5` / `Ctrl+Shift+R` | Hard reload | Main process + global |
| `Ctrl+R` | Reload | Main process + global |
| `F12` | Open DevTools | Main process + global |
| `Alt+Left` / `Alt+Right` | Back / Forward | Main process + global |
| `Alt+Home` | Go to home page | Global only |
| `Escape` | Stop loading | Main process + global |
| `Ctrl+L` | Focus URL bar | Root div only |
| `Ctrl+F` | Find in page | Root div only |

### Reload and the `beforeunload` guard

A guest page with a `beforeunload` handler (e.g. an unsaved-changes guard) tries to cancel any reload/navigation. Electron's default for the resulting `will-prevent-unload` event is to **silently cancel the unload** — no prompt, no reload — which makes Reload/F5 appear dead. `browser-service.ts` handles `will-prevent-unload` to fix this:

- **Soft reload** (toolbar button, `F5`, `Ctrl+R`) → a native confirm ("You have unsaved changes. Leave the page and discard them?"); **Leave** allows the unload (reload proceeds), **Cancel** keeps the page.
- **Hard reload** (`Ctrl+F5` / `Ctrl+Shift+R`) → bypasses the prompt and force-reloads.

The bypass uses a one-shot `bypassUnloadGuard` flag on the per-webContents `RegisteredWebview`: armed by a hard reload, consumed (and cleared) by the `will-prevent-unload` handler, and cleared defensively on `did-stop-loading` so it can never leak to a later reload. Because the flag lives in the main process, both keyboard layers must arm it there:

- **Layer 1** (`before-input-event`, focus inside the page) sets `reg.bypassUnloadGuard` and calls `wc.reloadIgnoringCache()` directly.
- **Layer 2** (`globalKeyDown`, focus on browser chrome) calls `BrowserWebviewModel.hardReload()`, which sends the new `BrowserChannel.hardReload` IPC (key `${tabId}/${internalTabId}`); the main handler arms the flag and reloads — mirroring Layer 1 so both paths have identical semantics. (Soft reload stays renderer-side via `reloadOrStop()` → `<webview>.reload()`, which still triggers the confirm.)

## Scripting Facade

Scripts access browser pages via `page.asBrowser()`, which returns a `BrowserEditorFacade`. Like all editor facades, this wraps the underlying `EditorModel` subclass (`BrowserEditor`) directly; the editor then composes focused sub-models — there is no separate view-model layer.

```javascript
const browser = await page.asBrowser();
browser.navigate("https://example.com");
await browser.waitForNavigation();
const snapshot = await browser.snapshot();  // accessibility tree (YAML)
await browser.click("#submit-btn");
await browser.type("#input", "text");
const tabs = browser.tabs;                  // list of internal tabs
```

**Interface:** [`IBrowserEditor`](../../src/renderer/api/types/browser-editor.d.ts) — navigation, query (getText, getValue, exists), interaction (click, type, select, check), wait methods, tab management, CDP access, accessibility snapshot
**Implementation:** [`BrowserEditorFacade`](../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts)

## Browser Automation (MCP)

Browser automation for AI agents lives in `src/renderer/automation/`. This layer is separate from the browser editor — the editor exposes a lightweight `BrowserTargetModel` adapter, and the automation layer builds Playwright-compatible MCP tools on top. The same tools can drive three kinds of `IBrowserTarget`: a **browser page** (`BrowserTargetModel`), a **board** frame (`BoardTargetModel`), and **Persephone's own app window** (`AppTargetModel`, selected with `pageId: "app"`).

```
MCP tool call (browser_click) → mcp-handler.ts → api/mcp/command-registry.ts → automation/commands.ts
    → getTarget(params) → resolved IBrowserTarget (browser page / board / app window)
    → perform action via CDP → return accessibility snapshot
```

**Target resolution:** every `browser_*` tool accepts optional `pageId` and `profileName` params; `getTarget(params)` in `commands.ts` resolves the target by precedence:

0. `pageId === "app"` — Persephone's own UI (the app window). Explicit only; never reachable by the fallback branch, so an agent aiming at a web page can't accidentally act on the app chrome.
1. `pageId` — exact page (must be a browser page or board; error otherwise).
2. `profileName` — first browser page of that profile (`""` = default profile; never matches incognito/Tor; prefers the active page, else first in page order). A descriptive error suggests `open_url` with `profileName` when no page matches.
3. Neither — the active browser page, else the first browser page.

For browser/board targets the resolved page is **activated** (`showPage`) because the webview needs `display != none` for focus/input — so targeting a background page brings it to front, and subsequent untargeted calls naturally stick to it. The app-window target needs no activation.

**Profile visibility & discovery:** `list_pages` / `get_active_page` (renderer `api/mcp/page-commands.ts`) include `profileName` / `isIncognito` / `isTor` / `url` for browser pages — `url` is the **active internal tab's** URL and is omitted for incognito/Tor pages. The fields are read via a structural state cast keyed on `editorId === "browser-view"` — deliberately **no static `BrowserEditor` import** in the page command module (it loads at startup; the browser chunk must stay dynamically imported). `get_app_info` returns `browserProfiles` (configured names) + `defaultBrowserProfile`. `list_windows` (main process) exposes the same three identity fields from the persisted page descriptors (works for closed windows; no `url` — not persisted).

**Privacy guard:** `getTarget()` checks `isIncognito` and `isTor` on the resolved browser page before returning the target. If it is incognito or Tor, all `browser_*` commands return a descriptive error and suggest using `open_url` to open a normal browser page — this holds for direct `pageId` targeting too, and `profileName` matching skips private pages entirely. This prevents AI agents from silently reading or interacting with private sessions.

**Browser tools toggle:** `handleBrowserCommand()` checks the `mcp.browser-tools.enabled` setting (default: `false`) at the top of every call. When disabled, all `browser_*` commands return a "disabled" error regardless of how the call was made — including direct HTTP calls to the MCP endpoint that bypass the tool list. The setting is also read by `createMcpServer()` (`main/mcp/server-factory.ts`), which omits the whole `browser-tools.ts` group — all 14 tools — from the `tools/list` response for new connections. Controlled via **Settings → MCP Server → Enable browser interaction**; requires stopping and restarting the MCP server to apply.

**14 Playwright-compatible tools:** `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_hover`, `browser_type`, `browser_select_option`, `browser_press_key`, `browser_evaluate`, `browser_tabs`, `browser_navigate_back`, `browser_wait_for`, `browser_take_screenshot`, `browser_network_requests`, `browser_close`

Tools support both CSS selectors (`selector` param) and accessibility snapshot refs (`ref` param, e.g. `ref=e52`). Ref resolution (`automation/ref.ts`) uses CDP `DOM.resolveNode` + `Runtime.callFunctionOn`. Stale refs produce helpful "re-take the snapshot" error messages.

**A ref does not always denote an element.** A ref is a `backendDOMNodeId`, and a `StaticText` node's id backs a DOM **text** node — which has none of the `Element` methods the command bodies call (`scrollIntoView`, `click`, `focus`, `value`, …). This is not an edge case: in list-style UI built from roleless `<div>`/`<span>` elements the ancestors resolve to the `generic` role and are dropped by `SKIP_ROLES`, so the `StaticText` ref is frequently the *only* ref on a row. `callOnRef` therefore coerces before invoking — `this.nodeType === 1 ? this : this.parentElement` — so the action lands on the element that displays the text, which is what the snapshot line denotes. Because DOM events bubble, acting on the inner element still reaches a handler bound to the row around it. A ref with no element parent fails with a message naming the ref and the node type instead of a `TypeError`.

Refs are minted from the node's own `backendDOMNodeId` and are deliberately **not** rewritten to the nearest element ancestor in `snapshot.ts`: sibling text nodes under one element (ordinary prose with inline markup — `first text <b>bold</b> second text` — produces two) would collapse onto the same ref, making all but one of those lines unaddressable. Coercing at invocation time keeps every ref unique *and* usable.

Consequently `callOnRef`'s `fn` argument must be a plain `function () {…}` expression: it is invoked with `.call(element)`, so an arrow function would keep its lexical `this` and silently act on the wrong object.

### App-Window Target (`pageId: "app"`)

`AppTargetModel` (`src/renderer/automation/AppTargetModel.ts`) lets the `browser_*` tools drive Persephone's own React UI — the tab strip, sidebar panels, toolbars, dialogs, and the active editor — so an agent can help the user with the application's interface itself. It is a minimal `IBrowserTarget` in the board mold: `cdp()`, `insertText()`, and the page-interaction commands (snapshot / click / type / press_key / evaluate / screenshot) are real; navigation and tab methods throw a clear error pointing at `list_pages` / `execute_script` (`app.pages`).

Two design points make it self-contained:

- **No registration needed.** Unlike browser pages (`getWebContents` resolver) and boards (`registerBoardFrame`), the app target uses a sentinel CDP regKey — `APP_WINDOW_CDP_KEY` (`"__app-window__"`, in `src/ipc/api-types.ts`). MCP commands are already routed to a specific window's renderer (`windowIndex` → `sendToRenderer`), and `CdpSession.send` is an `ipcRenderer.invoke` from that renderer, so in `cdp-service.ts` the calling `event.sender` **is** the window to automate. The three IPC handlers (`cdpAttach`/`cdpDetach`/`cdpSend`) short-circuit the sentinel to `event.sender`, running commands on its top-level session (the app UI). The debugger is shared with boards on the same webContents, so detach is a no-op. Multi-window is automatic.
- **Snapshot shows only the active page.** Inactive pages stay mounted but hidden via `display: none` on their `PageManager` placeholders, and Chromium's accessibility tree excludes hidden subtrees — so the app snapshot naturally contains the app chrome plus the active page's content only, regardless of how many tabs are open. To reach another page, the agent clicks its tab.

`focusWebview()` is a no-op: `automation/input.ts` drives everything through JS events (`el.click()`, `KeyboardEvent` dispatch, native-setter fill), which need no OS focus, and a no-op avoids stealing the user's window focus. This carries the same synthetic-input limitations as the browser/board targets — e.g. a menu that handles Escape via a focus-scoped React `onKeyDown` won't close on a synthetic `browser_press_key`, whereas a component with a document-level Escape listener (like `PopoverModel`) will. Content editing should go through `set_page_content` / `execute_script`, not synthetic typing into Monaco. The app target sits behind the same `mcp.browser-tools.enabled` gate as the other targets; no new setting or privilege tier (`execute_script` already grants full Node access).

### Playwright Parameter Compatibility

Several tools accept Playwright MCP parameter aliases so AI agents trained on Playwright work without translation:

| Tool | Persephone param | Playwright alias | Notes |
|------|-----------------|------------------|-------|
| `browser_evaluate` | `expression` | `function` | Auto-invokes function expressions: `() => ...` → `(() => ...)()`|
| `browser_select_option` | `value` (string) | `values` (string[]) | Array = multi-select; first element used for single `<select>` |
| `browser_wait_for` | `text`, `selector` | `time`, `textGone` | `time` = seconds sleep; `textGone` = wait until text absent |
| `browser_tabs` | *(always listed)* | `action` enum | `list` (default), `new` (+ `url`), `close` (+ `index`), `select` (+ `index`) |

### Text Input Strategy (Electron Webview Limitation)

CDP `Input.dispatchKeyEvent` and `Input.insertText` do **not** work in Electron `<webview>` elements — the events don't cross the guest process isolation boundary. This is a known limitation confirmed by Electron, Playwright, and Puppeteer issue trackers.

The `browser_type` tool (`automation/input.ts`) auto-detects element type and uses the appropriate strategy:

| Element | Default (`slowly: false`) | `slowly: true` |
|---------|--------------------------|-----------------|
| `<input>` | Native prototype `.value` setter + InputEvent (atomic, single evaluate) | `webview.insertText()` char by char |
| `<textarea>` | Native prototype `.value` setter + InputEvent (atomic, single evaluate) | `webview.insertText()` char by char |
| contentEditable | `selectAll` + `webview.insertText(text)` (Electron native API) | `webview.insertText()` char by char |

Key implementation details:
- **Visible element preference:** When multiple elements match a selector (e.g., Gmail has a hidden textarea + visible contentEditable div with the same `aria-label`), the first **visible** match is used
- **Atomic focus+fill:** For `<input>`/`<textarea>`, focus and value assignment happen in a single `Runtime.evaluate` call to prevent sites from intercepting focus between calls
- **`webview.insertText()`:** Electron's native API that types at the Chromium level, bypassing Trusted Types CSP. Accessed via `IBrowserTarget.insertText()` → `BrowserTargetModel` → `webview.insertText()`
- **`pressKey()`:** Uses JS `KeyboardEvent` dispatch via `Runtime.evaluate` (CDP `Input.dispatchKeyEvent` doesn't work in webviews)

### Iframe Snapshots

`browser_snapshot` includes content from iframes (including JS-created and cross-origin ones). The approach:

1. **Main frame:** `Accessibility.getFullAXTree()` — same as before
2. **Discover iframes:** `Target.getTargets()` — finds all iframe targets (including dynamically created ones that `Page.getFrameTree` misses)
3. **Attach per-iframe:** `Target.attachToTarget({ targetId, flatten: true })` → `sessionId`
4. **Get iframe AX tree:** `Accessibility.getFullAXTree({}, sessionId)` — executed in the iframe's session
5. **Merge:** Iframe content is indented under the `Iframe` placeholder node in the main snapshot

**Frame-scoped refs:** Main frame refs are `e123`, iframe refs are `f1-e456` (frame index prefix). `ref.ts` parses the prefix and uses the corresponding `sessionId` for `DOM.resolveNode` and `Runtime.callFunctionOn`, so `browser_click(ref="f1-e456")` works in the correct iframe context.

**Overlay detection:** `detectOverlay()` checks for `dialog[open]`, `[role="dialog"][aria-modal="true"]`, and viewport-covering fixed/absolute elements. If detected, a hint line is prepended to the snapshot.

### Navigation Race Condition (Two-Phase Wait)

`browser_navigate` and `browser_navigate_back` use a **two-phase wait** to avoid a race condition caused by React's async rendering model:

- `target.navigate(url)` / `target.back()` update React state, which schedules a new `<webview src>` value via a React effect (async).
- If the automation code immediately polls `document.readyState`, the old page is still loaded and `readyState === 'complete'` is already true — the poll exits immediately, returning a snapshot of the previous page.

**Phase 1 (bridge the React async gap):** Poll every 50 ms (up to 2 s) for either the URL to change OR `readyState` to go non-`complete`. This detects that navigation has started. The `catch(() => {})` silently ignores errors from the old page context being destroyed mid-poll.

**Phase 2 (wait for load):** Poll every 100 ms (up to 10 s) for `readyState === 'complete'`. Again ignores errors — the new page context may not be ready immediately.

This pattern is **required** for all commands that trigger a full page navigation. Do not simplify it to a single `readyState` check.

## Link Open Menu Helper

`appendLinkOpenMenuItems()` in `src/renderer/editors/shared/link-open-menu.ts` is a reusable function that appends "Open in..." browser menu items to a `MenuItem[]` array. It generates items for: OS default browser, internal browser, all configured user profiles, and incognito. Used by Link Editor (list, tiles, pinned links) and Markdown Preview link context menus.

Additionally, `LinkViewModel.onGetLinkMenuItems` is an optional callback that allows the host (e.g., browser editor) to inject custom menu items at the top of the link context menu. Items returned by this callback are prepended before the "Edit" item with a separator.

## Common Pitfalls

1. **Never update `state.url` from navigation events.** Only update it from user-initiated `model.navigate()`. Use the `model.tabs.currentUrls` map for tracking the actual URL per internal tab.

2. **The webview's `src` attribute is set once at creation.** The initial URL is captured in a ref. Subsequent navigations use `webview.loadURL()` from a React effect, gated by `webviewReady`.

3. **Never include `tab.url` in the IPC registration effect dependencies.** This causes the effect to re-run on every navigation, clearing `webviewReady` and breaking subsequent navigations.

4. **Call `loadURL()` only after dom-ready.** New tabs created via `addTab(url)` must wait for the webview to fire `dom-ready` before `loadURL()` is called. The `webviewReady` Set tracks this.

5. **Favicon requires PageTab subscription.** `PageTab` must include favicon in its state selector (via `_iconHint`) or it won't re-render when the favicon changes.

6. **The preload script runs in an isolated context.** It shares the DOM with the page but not JavaScript objects. Page scripts cannot access or interfere with the preload's `ipcRenderer` or `MutationObserver`.

7. **Registration/unregistration lifecycle.** The webview registers with the main process on `dom-ready` (when `getWebContentsId()` is available) and unregisters on cleanup. The main process also cleans up if the webContents or sender is destroyed. **Every listener attached inside `registerWebview` MUST go through the local tracked `on()` helper** — `dom-ready` fires on every document load, so `registerWebview` re-runs many times per tab, and only tracked listeners are removed by the `unregisterWebview()` call at the top. A listener attached directly with `wc.on(...)` stacks one copy per navigation (this is what used to trip `MaxListenersExceededWarning`).

8. **Webview background color.** Sites that don't set an explicit background rely on the browser default (white). The webview uses dynamic background: `color.background.default` for blank/new tabs (matching the app theme), switching to `#ffffff` once the user navigates to a real page.

9. **Emotion `&` selector in nested rules.** In Emotion's object syntax, `&` always resolves to the root styled component's class. Inside nested selectors like `"& .tab-close"`, a child rule `".tab-item:hover &"` would generate `.tab-item:hover .ROOT` — not `.tab-item:hover .tab-close`. Always define hover-reveal rules at the parent level: `"& .tab-item": { "&:hover .tab-close": { opacity: 1 } }`.

10. **DRM / Widevine CDM.** The app uses [Castlabs Electron (ECS)](https://github.com/castlabs/electron-releases) — a fork with Widevine DRM support. At startup, `components.whenReady()` in `main-setup.ts` ensures the CDM is downloaded. Production builds require VMP signing via Castlabs EVS (`scripts/vmp-sign.mjs`). Without VMP signing, DRM works on test pages but not on Netflix/Disney+.

11. **MCP navigation must use a two-phase wait.** After calling `target.navigate()` / `target.back()`, React schedules the webview URL update asynchronously. A single `readyState === 'complete'` check will see the *old* page still loaded and return immediately. Always use Phase 1 (wait for URL change or `readyState` non-complete) followed by Phase 2 (wait for `readyState === 'complete'`). See the "Navigation Race Condition" note in the Browser Automation section above.
