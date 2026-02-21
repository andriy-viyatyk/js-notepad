# Browser Editor Architecture

> Read this before modifying or extending the browser editor.

## Overview

The browser editor embeds Chromium `<webview>` elements inside a tab, providing an in-app web browser with **multi-tab support**. Each browser page (js-notepad tab) contains its own set of internal browser tabs, displayed in a left-side panel. Unlike other editors that live entirely in the renderer process, the browser editor spans **three process boundaries** with IPC bridges between each.

## Tab Architecture

The browser editor uses three levels of tab nesting:

1. **Internal browser tabs** — Multiple tabs within a single browser editor page, shown on the left panel
2. **js-notepad tabs** — Multiple browser editor pages as separate js-notepad tabs
3. **js-notepad windows** — Browser editor pages across separate application windows

### New Window Handling

| Source | Behavior |
|--------|----------|
| `target="_blank"` link click | Opens as new internal tab in same browser page |
| `window.open()` from JavaScript | Opens as new internal tab in same browser page |

The main process intercepts these via `setWindowOpenHandler()` on the webContents, denies the popup, and relays the URL to the renderer as a `"new-window"` event. The renderer then calls `model.addTab(url)`.

**Important:** The `<webview>` element requires `allowpopups="true"` for `setWindowOpenHandler` to fire on `target="_blank"` link clicks.

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Guest Page (webview)          │  Renderer Process    │  Main Process│
│  (isolated Chromium context)   │  (React UI)          │  (Node.js)   │
├────────────────────────────────┼──────────────────────┼──────────────┤
│  preload-webview.ts            │  BrowserPageView.tsx │  browser-    │
│  - MutationObserver on <head>  │  BrowserPageModel.ts │  service.ts  │
│  - Detects title/favicon       │  BrowserTabsPanel.tsx│  - Attaches  │
│  - sendToHost() messages       │  - Toolbar, URL bar  │    to real   │
│                                │  - Multi-webview     │    webContents│
│                                │  - Tabs panel        │  - Relays    │
│                                │  - State management  │    events    │
└────────────────────────────────┴──────────────────────┴──────────────┘
```

## Multi-Webview Rendering

Each internal tab has its own `<webview>` element. All webviews are rendered in the DOM simultaneously, but only the active tab's webview is visible (`display: flex` vs `display: none`). This preserves each tab's state (scroll position, form data, session) without re-navigation on tab switch.

### dom-ready Gating

A `webviewReady` ref (a `Set<string>` of internal tab IDs) tracks which webviews have fired `dom-ready`. The navigation effect checks this before calling `webview.loadURL()`. Without this, calling `loadURL()` on a newly created webview before it's attached to the DOM crashes the app.

### IPC Registration

Each webview registers with the main process using a composite key: `${tabId}/${internalTabId}`. This supports multiple internal tabs per js-notepad page tab. Registration happens on `dom-ready`, and cleanup happens on component unmount.

**Important:** The IPC registration effect must NOT include `tab.url` in its dependency array. If it does, the effect cleanup runs on every URL change, which clears the `webviewReady` state and breaks navigation.

## Data Flow

### 1. User navigates (types URL + Enter)

```
BrowserPageView → model.navigate(url) → state.url + active tab.url updated
    → Navigation effect detects URL change
    → Checks webviewReady before calling loadURL()
    → webview loads the page
```

### 2. Navigation events (page loaded, redirected)

```
webContents events (main)          IPC                    Renderer
─────────────────────────    ───────────────    ─────────────────────
did-navigate (url)       →  BrowserChannel  →  onBrowserEvent handler
                             .event              → model.currentUrl = url
                                                 → setUrlInput(url)
                                                 → model.updateFromWebview(...)
```

**CRITICAL:** Navigation events update `model.currentUrl` and `setUrlInput()` directly. They do **NOT** update `state.url`. If you update `state.url` from a navigation event, React will re-render `<webview src>` with the new URL, causing the webview's `attributeChangedCallback` to trigger a redundant navigation → ERR_ABORTED.

The rule: `state.url` = navigation target (set by user action only). `model.currentUrl` = actual current URL in webview.

### 3. Title and favicon detection (preload script)

```
Guest Page DOM                  Preload                  Renderer
───────────────         ────────────────────     ─────────────────────
<title> changes     →   MutationObserver     →   ipc-message event
<link rel="icon">   →   reportTitle/Favicon  →   onIpcMessage handler
changes                 sendToHost(channel)       → model.updateFromWebview(...)
                                                  → model.cacheFavicon(...)
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

## Context Menu

The webview's right-click context menu is intercepted in the main process and relayed to the renderer for display as the app's popup menu.

### Flow

```
Main Process                          IPC                       Renderer
─────────────                    ──────────────          ────────────────────────
webContents                      BrowserChannel          BrowserPageView
  context-menu event         →     .event            →     onBrowserEvent handler
  event.preventDefault()           type: "context-menu"     → SVG probe (elementFromPoint)
  params: linkURL, srcURL,         data: x, y, linkURL,    → Build MenuItem[] based on context
    selectionText, isEditable,       srcURL, selectionText, → showAppPopupMenu(x, y, items)
    editFlags, x, y                  isEditable, editFlags
```

### Context-Sensitive Items

The renderer builds the menu dynamically based on `params` fields from the `context-menu` event:

| Condition | Menu Items |
|-----------|------------|
| `linkURL` present | Open Link in New Tab, Copy Link Address |
| `srcURL` + `mediaType === "image"` | Open Image in New Tab, Copy Image Address |
| `selectionText` present | Copy (uses `navigator.clipboard.writeText`) |
| `isEditable` | Cut, Copy, Paste (uses `webview.cut/copy/paste()` with `webview.focus()`) |
| SVG probe finds `<svg>` ancestor | Open SVG in Editor |
| Always | Back, Forward, Reload, View Source, View Actual DOM, Inspect Element |

### Key Implementation Details

- **Coordinates:** `params.x/y` are in host window coordinate space (used for popup position). For `webview.inspectElement()` and `elementFromPoint()`, subtract the webview's bounding rect to get webview-relative coordinates.
- **SVG extraction:** Uses `webview.executeJavaScript()` to probe the click target with `elementFromPoint()` + `closest('svg')`. The SVG is cloned and auto-fixed (xmlns, viewBox from `getBBox()`, width/height, HTML comment stripping).
- **Copy for selections:** Uses `navigator.clipboard.writeText(selectionText)` instead of `webview.copy()` because the webview loses focus when the popup menu opens.
- **Popup dismissal:** Webview clicks don't bubble to the renderer DOM. A transparent overlay (`webview-click-overlay`) is rendered over the webview area while a popup menu is open, allowing clicks to reach the renderer's `document` and trigger the popup's dismiss handler.
- **skipInspect:** The browser context menu provides its own "Inspect Element" item, so `showAppPopupMenu` is called with `{ skipInspect: true }` to suppress the app's default "Inspect" item.

## Key Files

| File | Process | Purpose |
|------|---------|---------|
| `src/renderer/editors/browser/BrowserPageView.tsx` | Renderer | UI component: toolbar, URL bar, multi-webview management |
| `src/renderer/editors/browser/BrowserPageModel.ts` | Renderer | Multi-tab state management, navigation logic, favicon caching |
| `src/renderer/editors/browser/BrowserTabsPanel.tsx` | Renderer | Left-side internal tabs panel with context menu |
| `src/renderer/editors/browser/BrowserToolbar.tsx` | Renderer | URL bar, navigation buttons, loading indicator |
| `src/main/browser-service.ts` | Main | Attaches to webContents, relays events via IPC |
| `src/preload-webview.ts` | Guest | MutationObserver for title/favicon in guest DOM |
| `src/ipc/browser-ipc.ts` | Shared | IPC channel names and type definitions |

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

## Favicon Handling

Favicons use a caching strategy to avoid showing the globe icon during same-origin navigations:

1. When a favicon is received (from preload), it's cached by origin: `model.cacheFavicon(url, favicon)`
2. On `did-navigate`, the cached favicon for the new URL's origin is applied immediately
3. The preload script then fires with the actual favicon, updating if different

The `getIcon()` method on `BrowserPageModel` reads `this.state.get().favicon` synchronously. `PageTab` subscribes to favicon changes via `_iconHint` in its state selector to trigger re-renders.

## Build Configuration

The webview preload script is a separate Vite build entry in `forge.config.ts`:

```typescript
{
    entry: "src/preload-webview.ts",
    config: "vite.preload-webview.config.ts",
    target: "preload",
}
```

The main preload (`src/preload.ts`) exposes the path to the webview preload:

```typescript
(window as any).webviewPreloadUrl = pathToFileURL(
    path.join(__dirname, "preload-webview.js"),
).toString();
```

## Session Restore

`getRestoreData()` saves all internal tabs with their actual current URLs (from `currentUrls` map, which tracks post-redirect URLs). `applyRestoreData()` restores them with fresh internal tab IDs (since IDs are ephemeral). The active tab is identified by index position during restore. Profile name and incognito flag are also saved/restored.

## Profiles & Incognito

Each browser page is bound to a **profile** that determines its Electron session partition. All internal tabs within the same browser page share the same profile.

### Partition Mapping

| Mode | Partition String | Persistence |
|------|-----------------|-------------|
| Default profile | `persist:browser-default` | Persists across restarts |
| Named profile "work" | `persist:browser-work` | Persists across restarts |
| Incognito | `browser-incognito-<uuid>` | Cleared when page closes |

`getPartitionString()` in `BrowserPageModel.ts` computes the partition. `BrowserPageModel.partition` is a **getter** (not a stored field) because the profile state may be set after model construction in `showBrowserPage()`. Each incognito model has a stable `incognitoId` (random UUID generated once per instance) to keep the partition consistent across getter calls.

### Profile Settings

Profiles are stored in app settings as `BrowserProfile[]` (`{ name, color }`). A separate `browser-default-profile` setting tracks which profile the "Browser" quick-add menu item uses. Colors come from the `TAG_COLORS` palette in `palette-colors.ts`, and the built-in default uses `DEFAULT_BROWSER_COLOR` (cyan `#4DD0E1`).

### Page Tab Icons

| Mode | Icon |
|------|------|
| Default profile (no name) | GlobeIcon tinted with `DEFAULT_BROWSER_COLOR` or default profile's color |
| Named profile | GlobeIcon tinted with the profile's color |
| Incognito | IncognitoIcon |

The `resolvedColor` getter on `BrowserPageModel` resolves the color chain: explicit profile → default profile setting → `DEFAULT_BROWSER_COLOR`.

### Incognito Indicator

Incognito pages show an `IncognitoIcon` inside the URL bar's left edge, using the `startButtons` prop on `TextField`.

### Clear Profile Data

The renderer can clear all browsing data for a partition via `ipcRenderer.invoke(BrowserChannel.clearProfileData, partition)`. The main process handler calls `session.fromPartition(partition).clearStorageData()` + `clearCache()`. This is used in two places:
- "Clear data" button on each profile row in Settings
- Profile deletion (confirmation dialog, then clear + remove from settings)

## Common Pitfalls

1. **Never update `state.url` from navigation events.** Only update it from user-initiated `model.navigate()`. Use `model.currentUrls` map for tracking the actual URL per internal tab.

2. **The webview's `src` attribute is set once at creation.** The initial URL is captured in a ref. Subsequent navigations use `webview.loadURL()` from a React effect, gated by `webviewReady`.

3. **Never include `tab.url` in the IPC registration effect dependencies.** This causes the effect to re-run on every navigation, clearing `webviewReady` and breaking subsequent navigations.

4. **Call `loadURL()` only after dom-ready.** New tabs created via `addTab(url)` must wait for the webview to fire `dom-ready` before `loadURL()` is called. The `webviewReady` Set tracks this.

5. **Favicon requires PageTab subscription.** `PageTab` must include favicon in its state selector (via `_iconHint`) or it won't re-render when the favicon changes.

6. **The preload script runs in an isolated context.** It shares the DOM with the page but not JavaScript objects. Page scripts cannot access or interfere with the preload's `ipcRenderer` or `MutationObserver`.

7. **Registration/unregistration lifecycle.** The webview registers with the main process on `dom-ready` (when `getWebContentsId()` is available) and unregisters on cleanup. The main process also cleans up if the webContents or sender is destroyed.

8. **Webview background color.** Sites that don't set an explicit background rely on the browser default (white). The webview uses dynamic background: `color.background.default` for blank/new tabs (matching the app theme), switching to `#ffffff` once the user navigates to a real page.

9. **Emotion `&` selector in nested rules.** In Emotion's object syntax, `&` always resolves to the root styled component's class. Inside nested selectors like `"& .tab-close"`, a child rule `".tab-item:hover &"` would generate `.tab-item:hover .ROOT` — not `.tab-item:hover .tab-close`. Always define hover-reveal rules at the parent level: `"& .tab-item": { "&:hover .tab-close": { opacity: 1 } }`.
