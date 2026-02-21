# Browser Editor Architecture

> Read this before modifying or extending the browser editor.

## Overview

The browser editor embeds a Chromium `<webview>` inside a tab, providing an in-app web browser. Unlike other editors that live entirely in the renderer process, the browser editor spans **three process boundaries** with IPC bridges between each.

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Guest Page (webview)          │  Renderer Process    │  Main Process│
│  (isolated Chromium context)   │  (React UI)          │  (Node.js)   │
├────────────────────────────────┼──────────────────────┼──────────────┤
│  preload-webview.ts            │  BrowserPageView.tsx │  browser-    │
│  - MutationObserver on <head>  │  BrowserPageModel.ts │  service.ts  │
│  - Detects title/favicon       │  - Toolbar, URL bar  │  - Attaches  │
│  - sendToHost() messages       │  - Webview element   │    to real   │
│                                │  - State management  │    webContents│
│                                │                      │  - Relays    │
│                                │                      │    events    │
└────────────────────────────────┴──────────────────────┴──────────────┘
```

## Data Flow

### 1. User navigates (types URL + Enter)

```
BrowserPageView → model.navigate(url) → state.url updated
    → React re-renders <webview src={url}>
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

## Key Files

| File | Process | Purpose |
|------|---------|---------|
| `src/renderer/editors/browser/BrowserPageView.tsx` | Renderer | UI component: toolbar, URL bar, webview element |
| `src/renderer/editors/browser/BrowserPageModel.ts` | Renderer | State management, navigation logic, favicon caching |
| `src/main/browser-service.ts` | Main | Attaches to webContents, relays events via IPC |
| `src/preload-webview.ts` | Guest | MutationObserver for title/favicon in guest DOM |
| `src/ipc/browser-ipc.ts` | Shared | IPC channel names and type definitions |

## Why the Main Process Bridge?

The `<webview>` DOM element's event API is unreliable — events like `page-favicon-updated` don't fire consistently on back/forward navigation. The main process has direct access to the real `webContents` object, where these events fire reliably. The bridge:

1. Renderer registers webview via `BrowserChannel.register` (sends `webContentsId`)
2. Main process calls `webContents.fromId(id)` to get the real object
3. Main process attaches native event listeners
4. Events are relayed back via `BrowserChannel.event`

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

## Common Pitfalls

1. **Never update `state.url` from navigation events.** Only update it from user-initiated `model.navigate()`. Use `model.currentUrl` for tracking the actual URL.

2. **The webview's `src` attribute is React-controlled.** Changing `state.url` triggers a re-render that sets `src`, which triggers a new navigation. This is intentional for user-initiated navigations but causes ERR_ABORTED if triggered by navigation events.

3. **Favicon requires PageTab subscription.** `PageTab` must include favicon in its state selector (via `_iconHint`) or it won't re-render when the favicon changes.

4. **The preload script runs in an isolated context.** It shares the DOM with the page but not JavaScript objects. Page scripts cannot access or interfere with the preload's `ipcRenderer` or `MutationObserver`.

5. **Registration/unregistration lifecycle.** The webview registers with the main process on `dom-ready` (when `getWebContentsId()` is available) and unregisters on cleanup. The main process also cleans up if the webContents or sender is destroyed.
