# Scripting API — script.execute

The `script.execute` path runs JavaScript or TypeScript in Persephone's renderer context. Inspect
`script.$help` for the live execution contract; this resource keeps longer API examples and
format/reference material.

## Execution model & security

The live execution, privilege, timeout, result, and dialog contract is owned by `script.$help`.
Use this resource for longer API examples and reference material; do not infer a second execution
protocol from the examples below.

## Main-process scripts via `call`

The `call` tree also exposes `main.script.execute(code)`, guarded by Settings → MCP Server →
`Allow main-process scripts`. This runs in Electron's main process and can freeze or terminate the
whole app, so use it only for deliberate diagnostics. The evaluator supplies these scope names:
`electron`, `openWindows`, `torService`, `downloadService`, `boardDownloadService`,
`publishedBoardsService`, `boardProtocol`, and `networkLogger`. Expressions and `await` work, and
the result is shaped as `{ result, isError, timedOut?, consoleLogs }`; console logs use
`{ level, args, timestamp }` entries like renderer script capture.

Main evaluation has a 10-second timeout. A timed-out async promise cannot be cancelled by
`Promise.race`, so it may continue and can still perform side effects. Side effects before an
exception or timeout remain performed. A synchronous `while (true) {}` blocks the main event loop,
defeats the timer, and freezes every window until the code returns or the process is killed; it is
not safely timeout-able.

## The `app` Object

Root application object with all services. The `call` tool addresses the same objects by path with
the same names — `call("pages[0].content")` is `app.pages.all[0].content` here, `call("page")` is
`page`. Use `call` to look around and for one-step reads and actions; write a script when you need
logic, loops, or Node.js.

| Property | Description |
|----------|-------------|
| `app.version` | Application version string |
| `app.pages` | Open tabs — create, open, close, navigate, group |
| `app.fs` | File system — read, write, dialogs, paths |
| `app.settings` | Application configuration — get/set settings; `call` also exposes the section/key catalog and highlighting |
| `app.ui` | Dialogs — confirm, input, password, notifications |
| `app.shell` | OS integration — open URLs, encryption |
| `app.window` | Window management — minimize, maximize, zoom |
| `app.editors` | Editor registry — list and resolve editors |
| `app.recent` | Recently opened files |
| `app.downloads` | Download tracking |
| `app.boards` | Boards — `createBoard(name, dir)` / `createDemoBoard(name, dir)` / `openBoard(root)`. See `persephone://guides/boards`. |
| `app.boardVars` | Env vars/secrets store for boards — get/set/list per namespace, resolve a board's namespace, open the editor. See `persephone://guides/boards`. |
| `app.openRawLink(href, options?)` | Open any link (file path, URL, or in-app scheme) in a new/reused tab and make it active. `options.editor` requests a specific editor (e.g. `{ editor: "md-view" }` for rendered Markdown); falls back to the default when omitted/unmatched |
| `app.call(path, options?)` | Resolve the live AiVision tree from the script's own page context; returns a plain bounded value and rejects `Error` on resolver failure |

### `app.call(path, options?)`

For the script-side call seam, inspect `script.$help` and use `app.call(path)` inside
`script.execute`. The examples below show the renderer facade's format; the full live contract is
owned by the `script` node.

```javascript
const source = await app.call("page.grouped.content");
const rows = await app.call("page.editor.rows");
await app.call("page.grouped.content", {
    value: JSON.stringify({ checked: true }, null, 2),
});
const result = await app.call("page.editor.getCell", { args: [0, "name"] });
```

The shell nodes are available through the MCP `call` path as well. Use `window.menuBar.folders`
to discover the live built-in and user-folder IDs, then `window.menuBar.open(id)` to open one;
the legacy `window.openMenuBar()` remains available. `page.panels.items` is a live projection of
the current sidebar panels; `page.panels.expand(id)` takes a bare panel ID and
`page.panels.toggleSidebar()` changes only an existing sidebar's open state, throwing when there
are no panels or a non-Explorer panel keeps it open. There is no uniform `page.panels.close(id)`
because individual panel owners have different hide/dispose lifecycles.

Use `settings.sections` to find the fixed-order Settings catalog (13 sections, 25 rows), then
`settings.highlight(key)` to open or activate Settings and point at the containing section.
`settings.set` remains the mutation operation. Through the AiVision `call` seam only,
`mcp.enabled` and `mcp.port` are refused because changing them disconnects the caller;
`app.settings.set` is unchanged.

### app.pages

```javascript
app.pages.activePage              // Current active page (IPage)
app.pages.all                     // All open pages (IPage[]) — e.g. all.find(p => p.title === "x")
app.pages.findPage(pageId)        // Find page by ID
await app.pages.closePage(pageId) // Close a page — true if closed, false if cancelled
await app.pages.openFile(path)    // Open a file in a tab
app.pages.addEmptyPage()          // Add empty text page
app.pages.addEditorPage(editor, language, title)  // Add page with specific editor
app.pages.showPage(pageId)        // Activate a tab
app.pages.showNext()              // Next tab
app.pages.showPrevious()          // Previous tab
app.pages.group(leftId, rightId)  // Group two pages side-by-side
app.pages.ungroup(pageId)         // Remove from group
app.pages.pinTab(pageId)          // Pin a tab
app.pages.unpinTab(pageId)        // Unpin a tab
app.pages.moveTab(fromId, toId)   // Reorder tabs
await app.pages.openDiff({ firstPath, secondPath })  // Diff view
app.pages.compare.pairs           // Active compare pairs with left/right page ids and paths
app.pages.compare.enter(pageId)   // Enter compare mode for either member of a grouped pair
app.pages.compare.exit(pageId)    // Leave compare mode for either member
await app.pages.showBrowserPage({ url })              // Open browser tab
await app.pages.openUrlInBrowserTab(url)              // Open URL in browser — returns the page id
await app.pages.navigatePageTo(pageId, filePath, { revealLine, highlightText })
```

### app.fs

```javascript
const text = await app.fs.read(filePath)              // Read text file
const { content, encoding } = await app.fs.readFile(filePath)  // Read with encoding info
const buffer = await app.fs.readBinary(filePath)      // Read binary
await app.fs.write(filePath, content, encoding?)      // Write text (default UTF-8)
await app.fs.writeBinary(filePath, data)              // Write binary
await app.fs.exists(filePath)                         // Check if exists
await app.fs.delete(filePath)                         // Delete file

// Directories
const files = await app.fs.listDir(dirPath, pattern?) // List files (names only, not full paths)
await app.fs.mkdir(dirPath)                           // Create directory (recursive)

// Dialogs
const files = await app.fs.showOpenDialog({ title, filters, multiSelect })
const path = await app.fs.showSaveDialog({ defaultPath, filters })
const folders = await app.fs.showFolderDialog({ title })

// Paths
app.fs.resolveDataPath(relativePath)                  // App data folder
const dir = await app.fs.commonFolder("downloads")    // OS folders: documents, downloads, desktop, home, temp, etc.

// Explorer
app.fs.showInExplorer(filePath)                       // Show file in explorer
app.fs.showFolder(folderPath)                         // Open folder
```

### app.settings

```javascript
const theme = app.settings.theme                      // Current theme name
const value = app.settings.get("editor.fontSize")     // Get any setting
app.settings.set("theme", "monokai")                  // Set a setting
app.settings.set("editor.wordWrap", "on")

app.settings.settingsFilePath                         // Path of the settings file on disk

// Subscribe to changes
const sub = app.settings.onChanged.subscribe(({ key, value }) => { ... });
sub.dispose();  // Unsubscribe
```

Settings live in `%APPDATA%\persephone\data\appSettings.json` — JSON5, watched, and reloaded on
save, so an external edit applies immediately and fires `onChanged` just like `set()` does. Use
`set()` when you are connected; edit the file only when you are not (that is how the MCP server
gets turned on in the first place). Persephone regenerates the file's comments on every save, so
comments added by hand are lost. Keys, defaults, and accepted values are documented in the file
itself and summarised in `persephone://guides/ui`.

### app.ui

```javascript
// Confirmation dialog — returns button label or null
const answer = await app.ui.confirm("Delete?", {
    title: "Confirm",
    buttons: ["Yes", "No", "Cancel"]
});

// Input dialog — returns { value, button } or null
const result = await app.ui.input("Enter name:", { value: "default", selectAll: true });

// Password dialog — returns string or null
const pw = await app.ui.password({ mode: "encrypt" });  // "encrypt" shows confirm field

// Toast notification — "info", "success", "warning", "error"
app.ui.notify("Done!", "success");
const clicked = await app.ui.notify("Click me", "info");  // Returns "clicked" or undefined
```

### app.shell

```javascript
await app.shell.openExternal("https://github.com")   // Open URL in OS browser

// Encryption (AES-GCM)
const encrypted = await app.shell.encryption.encrypt(text, password)
const decrypted = await app.shell.encryption.decrypt(encrypted, password)
app.shell.encryption.isEncrypted(text)                // Check if encrypted

// Version info
const v = await app.shell.version.runtimeVersions()   // { electron, node, chrome }
const u = await app.shell.version.checkForUpdates()    // { updateAvailable, latestVersion, ... }
```

### app.window

```javascript
app.window.minimize()
app.window.maximize()
app.window.restore()
app.window.close()
app.window.toggleWindow()             // Toggle maximize/restore
app.window.isMaximized                // boolean (read-only)
app.window.zoom(1)                    // Zoom in (positive) or out (negative)
app.window.resetZoom()
app.window.zoomLevel                  // Current zoom level
app.window.toggleMenuBar()            // Toggle sidebar
app.window.menuBar.folders             // Live built-in and configured user folders
app.window.menuBar.selected            // Current folder
app.window.menuBar.open(folderId?)     // Open; a supplied ID must be valid
app.window.menuBar.close()
await app.window.openNew(filePath?)   // Open new window
```

### app.editors

```javascript
app.editors.getAll()                  // All registered editors: [{ id, name, category }]
app.editors.getById("grid-json")      // Get editor info by ID
app.editors.resolve("data.json")      // Best editor for a file path
app.editors.resolveId("readme.md")    // Just the editor ID
```

### app.recent

```javascript
await app.recent.load()               // Load recent files list (lazy)
app.recent.files                      // string[] — most recent first
await app.recent.add(filePath)        // Add to recent
await app.recent.remove(filePath)     // Remove from recent
await app.recent.clear()              // Clear all
```

## Editor Facades

Specialized access to page content through typed editor facades. Read `page.editor` synchronously, inspect its `id`, and use the narrowed facade. Use `page.editorSwitches.switchTo(id)` to change editors; facades are stateless and need no release.

### `page.editor` when `id === "monaco"` — Monaco text editor

```javascript
const text = page.editor;
text.editorMounted          // boolean — true when Monaco is visible
text.getSelectedText()      // Current selection
text.insertText("hello")    // Insert at cursor
text.replaceSelection("x")  // Replace selection
text.revealLine(42)         // Scroll to line
text.setHighlightText("q")  // Highlight occurrences
text.getCursorPosition()    // { lineNumber, column }
```

### `page.editor` when `id` is `"grid-json"`, `"grid-csv"`, or `"grid-jsonl"` — Grid data editor

```javascript
const grid = page.editor;
grid.rows                            // All rows as objects
grid.columns                         // Column definitions [{ key, name }]
grid.rowCount                        // Number of rows
grid.editCell(columnKey, rowKey, value)
grid.addRows(count?, insertIndex?)   // Returns new rows
grid.deleteRows(rowKeys)
grid.addColumns(count?, insertBeforeKey?)
grid.deleteColumns(columnKeys)
grid.setSearch(text)                 // Filter rows
grid.clearSearch()
```

### `page.editor` when `id === "notebook-view"` — Notebook editor

```javascript
const nb = page.editor;
nb.notes                             // All notes [{ id, title, content, category, tags }]
nb.categories                        // All category names
nb.tags                              // All tag names
const note = nb.addNote();           // Returns new note
nb.updateNoteTitle(id, title)
nb.updateNoteContent(id, content)
nb.updateNoteCategory(id, category)
nb.addNoteTag(id, tag)
nb.removeNoteTag(id, tagIndex)
nb.deleteNote(id)
```

### `page.editor` when `id === "link-view"` — Link collection

```javascript
const le = page.editor;
le.links                             // [{ id, url, title, category, tags, pinned }]
le.addLink(url, title?, category?)
le.deleteLink(id)
le.updateLink(id, { title?, category?, url? })
```

### `page.editor` when `id === "browser-view"` — Browser page

```javascript
const browser = page.editor;
browser.url                          // Current URL (read-only)
browser.title                        // Page title (read-only)
browser.navigate(url)                // Navigate or search
browser.back() / browser.forward() / browser.reload()
```

### Preview facades: `md-view`, `svg-view`, `html-view`, and `mermaid-view`

Preview facades for rendered content. Check `viewMounted` / `loading` before accessing.

The **Mermaid** and **SVG** preview facades (and the **Image viewer** facade `editor`) can save
their rendered image to a file as PNG. This rasterises the diagram exactly as Persephone renders it
(fonts and text included), then writes the PNG. Use it to obtain a viewable image of a diagram:

```
// Render a mermaid page, save the PNG to a temp file, then read it back as an image.
const m = page.editor;
const file = await m.savePngToFile("D:/tmp/diagram.png");   // returns the written path

// Also available on SVG and Image pages:
page.editor.savePngToFile("D:/tmp/image.png");
page.editor.savePngToFile("D:/tmp/photo.png");
```

To simply *look at* an image page, you usually don't need a script at all: `pages[i].content`
returns the rendered PNG directly as an image block in the tool result. `savePngToFile` remains
the way to put the image on disk (or to read one that is too large to inline).

### `page.editor` when `id === "video-view"` — Video/audio facade

```javascript
const media = page.editor;
media.source                 // Submitted source, or undefined before one is loaded
media.format                 // "mp4", "m3u8", or "audio"
media.playerState            // Loading/playback/error state
media.mediaMounted           // Whether a live media element is attached
media.currentTime            // Live position, or undefined before mount
await media.submitUrl(source)
await media.play()
media.pause()
media.seek(seconds)
media.toggleMute()
await media.playNext()
media.toggleShuffle()
media.setVisualizerEffect("bars")
await media.openInVlc()
```

Live media getters are undefined before a media element is mounted. Playback, source, playlist,
and VLC actions can affect an open page that is not currently visible; use them deliberately.

### `page.editor` when `id === "file-diff"` — File Diff facade

```javascript
const diff = page.editor;
diff.from       // Selected original revision, or undefined while loading
diff.to         // Selected modified revision, or undefined while loading
diff.hasStaged  // Whether staged changes were detected, or undefined while loading
diff.readOnly   // Whether the selected modified revision is not the working tree
```

The revision picker controls are exposed through `diff.elements`; the File History sidebar is
available through `page.panels`, not duplicated in the editor facade.

### `page.editor` when `id === "draw-view"`

Drawing editor facade for Excalidraw pages (`.excalidraw`).

```
const draw = page.editor;
draw.editorIsMounted  // true if editor is mounted (pages stay mounted)
draw.elementCount     // number of canvas elements

// Insert image into live canvas (editor must be mounted)
await draw.addImage(dataUrl, { x: 0, y: 0, maxDimension: 1200 });

// Export
const svg = await draw.exportAsSvg();    // SVG markup string
const png = await draw.exportAsPng();    // PNG data URL
const png2x = await draw.exportAsPng({ scale: 3 });
```

To create a **new** drawing page with an image (without opening the editor first):

```
await app.pages.addDrawPage(dataUrl, "Screenshot.excalidraw");
```

## TypeScript Support

The `script.execute` path accepts an optional `language` parameter. Set it to `"typescript"` to write scripts with type annotations — types are stripped via sucrase before execution.

```
script.execute("const x: number = 42; x", undefined, "typescript")
```

TypeScript scripts have the same access to `page`, `app`, and Node.js APIs as JavaScript scripts. All type annotations are removed at runtime — no type checking is performed.

## Practical Examples

### Transform JSON data

```javascript
const data = JSON.parse(page.content);
const filtered = data.filter(item => item.status === "active");
page.grouped.language = "json";
page.grouped.editorSwitches.switchTo("grid-json");
return filtered;
```

### Read and write files

```javascript
const input = await app.fs.read("C:/data/input.csv");
const lines = input.split("\n").filter(l => l.includes("important"));
await app.fs.write("C:/data/filtered.csv", lines.join("\n"));
app.ui.notify(`Kept ${lines.length} lines`, "success");
```

### Create a page with content

```javascript
const page = app.pages.addEditorPage("monaco", "json", "API Response");
page.content = JSON.stringify({ users: [] }, null, 2);
```

### Interactive script with dialog

```javascript
const name = await app.ui.input("Enter project name:");
if (name) {
    const folder = await app.fs.commonFolder("documents");
    await app.fs.write(`${folder}/${name.value}/README.md`, `# ${name.value}`);
    app.ui.notify(`Created ${name.value}`, "success");
}
```

### Grid manipulation

```javascript
const grid = page.editor;
grid.addColumns(1);  // Add a column
const newCol = grid.columns[grid.columns.length - 1];
grid.rows.forEach(row => {
    grid.editCell(newCol.key, row.__rowKey, "calculated");
});
```

## Node.js Access

Scripts have full Node.js access via `require()`:

```javascript
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
```

When using `main.script.execute`, a caught error returns `{ result: <error text>, isError: true,
consoleLogs }` and never escapes as an MCP unhandled rejection. The timeout response sets
`timedOut: true`; an async evaluation may still be running. These semantics are separate from the
renderer `script.execute` 30-second request timeout described in `script.$help`.

## Errors & verification

What failures actually look like in the `script.execute` result (verified against the app):

- **A thrown exception** (or syntax error) returns `isError: true` with the error message and
  the **full stack trace** in `text`, plus whatever `consoleLogs` were captured before the
  throw. There is no partial return value — but side effects the script performed before
  throwing (files written, pages created) **have already happened**.
- **Reserved globals.** `page` and `app` are injected into the script scope — declaring
  `const page = …` fails with `Identifier 'page' has already been declared`. Pick another name.
- **Wrong API guesses fail loudly and cheaply** — e.g. `app.pages.list is not a function` with
  a stack trace. The fix is this guide, not trial-and-error: the `app` surface is exactly what
  this document lists.
- **`Error: Request timeout`** after ~30 s — see "Execution model & security" above: the script
  is still running; only the response was abandoned. A common non-obvious cause:
  `app.pages.closePage()` on a **modified** page shows the user an "Unsaved Changes" dialog and
  blocks until they answer — if you truly don't need the content, it is your responsibility to
  have saved or discarded deliberately, not to assume the close is silent.
- **Verify side effects, not intentions**: after writing a file, `await app.fs.exists(path)`;
  after creating/modifying a page, `pages[i].content` (content) or
  `window.screen.snapshot()` (rendering). A `true`/content response from those is
  ground truth; your script returning without error is not.
