[← API Reference](./index.md)

# app.window

Window management: minimize, maximize, zoom, and multi-window support.

```javascript
app.window.maximize();
app.window.zoom(1);  // zoom in one step
```

## Window Actions

| Method | Description |
|--------|-------------|
| `minimize()` | Minimize to taskbar. |
| `maximize()` | Maximize the window. |
| `restore()` | Restore from maximized/minimized. |
| `close()` | Close the window. |
| `toggleWindow()` | Toggle between maximized and restored. |

## Window State

| Property | Type | Description |
|----------|------|-------------|
| `isMaximized` | `boolean` | Whether the window is maximized. Read-only, updated reactively. |
| `windowIndex` | `number` | Zero-based index among all app windows. Read-only. |

## Menu Bar

| Member | Type | Description |
|--------|------|-------------|
| `menuBarOpen` | `boolean` | Whether the sidebar is open. Read-only. |
| `menuBar` | `IMenuBar` | Live Menu Bar model with folders, selection, and controls. |
| `toggleMenuBar()` | `void` | Toggle sidebar open/closed. |
| `openMenuBar(panelId?)` | `void` | Legacy sidebar opener. An unknown string still opens the sidebar without changing selection. |

### `menuBar`

The Menu Bar is the sidebar opened from the Persephone icon. Its folder list is live and includes
the built-in folders plus any configured user folders.

| Member | Type | Description |
|--------|------|-------------|
| `isOpen` | `boolean` | Whether the Menu Bar is open. |
| `folders` | `IMenuBarFolder[]` | Folder records with `id`, `label`, `kind`, and an optional `path`. |
| `selected` | `IMenuBarFolder` | Currently selected folder. |
| `open(folderId?)` | `void` | Open the Menu Bar, optionally selecting a folder by its ID. IDs are strict; labels, paths, and stale IDs are rejected. |
| `close()` | `void` | Close the Menu Bar. Repeating the call is safe. |

The built-in folder IDs are `open-tabs`, `recent-files`, `tools-editors`, and `script-library`.
Read `folders` before opening a configured user folder so you use its current ID.

## `window.screen`

`window.screen` automates Persephone's own window and the currently active page. It can inspect the
app chrome, tab strip, sidebar, toolbars, dialogs, and active editor using CSS selectors or refs from
an accessibility snapshot. It does not open or switch pages; use `app.pages` and
`app.pages.showPage()` for that.

```javascript
const snapshot = await app.window.screen.snapshot();
await app.window.screen.click({ ref: "e12" });
await app.window.screen.waitFor({ text: "Settings" });
```

Available methods are `snapshot()`, `click()`, `hover()`, `type()`, `select()`, `pressKey()`,
`evaluate()`, `waitFor()`, `screenshot()`, and `networkRequests()`. Element methods accept either a
CSS selector string or `{ ref: "eN" }` from `snapshot()`. `waitFor()` accepts exactly one of
`selector`, `text`, `textGone`, or `time`, with an optional `timeout` in milliseconds. The
`screenshot()` result is an image object when the capture is available.

The app-window host follows the browser privacy guard: it cannot automate a user-opened incognito or
Tor page while that page is active. Agent-opened private pages remain available to that agent.

## Zoom

| Member | Type | Description |
|--------|------|-------------|
| `zoom(delta)` | `void` | Zoom in (positive) or out (negative). E.g., `1` or `-1`. |
| `resetZoom()` | `void` | Reset zoom to 100%. |
| `zoomLevel` | `number` | Current zoom level (0 = 100%). Read-only, updated reactively. |

```javascript
app.window.zoom(2);    // zoom in 2 steps
app.window.zoom(-1);   // zoom out 1 step
app.window.resetZoom(); // back to 100%
```

## Multi-Window

### openNew(filePath?) → `Promise<number>`

Open a new application window. Returns the new window's index.

```javascript
// Open empty window
await app.window.openNew();

// Open window with a file
await app.window.openNew("C:/data/report.json");
```
