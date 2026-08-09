# Scripting API — execute_script

The `execute_script` tool runs JavaScript or TypeScript in Persephone's context. Scripts have access to `page` (current tab), `app` (application services), and full Node.js APIs.

## Execution model & security

- **No sandbox.** Scripts run inside Persephone's renderer with **full Node.js and the user's
  OS privileges** — they can read/write any file the user can, spawn processes, and reach the
  network. Treat a script like code you'd run in the user's terminal: be deliberate with
  deletes, overwrites, and anything that leaves the machine.
- **30-second tool timeout.** The MCP call returns `Error: Request timeout` after ~30 s — but
  the script itself **keeps running** in Persephone; only your view of the result is lost.
  For long work: report progress out-of-band (`ui_push` entries or `app.ui.notify`) so results
  aren't tied to the tool response, or split the work into shorter script calls. For recurring
  long-running integrations, prefer a registered tool (`read_guide("tools")`) — `execute_tool`
  has no fixed MCP timeout (the tool's own `timeoutMs` governs).
- **Dialogs block the call.** APIs like `app.ui.confirm` / `app.ui.input` (and the first
  `app.boardVars.*` call) wait for the user — a slow response is a waiting user, not a hang,
  but the 30 s tool timeout still applies to your view of it.
- **Result = last expression** (or `return …`), serialized to text in the tool result.
  `console.log` output is captured separately into `consoleLogs`.

## The `app` Object

Root application object with all services.

| Property | Description |
|----------|-------------|
| `app.version` | Application version string |
| `app.pages` | Open tabs — create, open, close, navigate, group |
| `app.fs` | File system — read, write, dialogs, paths |
| `app.settings` | Application configuration — get/set settings |
| `app.ui` | Dialogs — confirm, input, password, notifications |
| `app.shell` | OS integration — open URLs, encryption |
| `app.window` | Window management — minimize, maximize, zoom |
| `app.editors` | Editor registry — list and resolve editors |
| `app.recent` | Recently opened files |
| `app.downloads` | Download tracking |
| `app.boards` | Boards — `createBoard(name, dir)` / `createDemoBoard(name, dir)` / `openBoard(root)`. See `read_guide("boards")`. |
| `app.boardVars` | Env vars/secrets store for boards — get/set/list per namespace, resolve a board's namespace, open the editor. See `read_guide("boards")`. |
| `app.openRawLink(href, options?)` | Open any link (file path, URL, or in-app scheme) in a new/reused tab and make it active. `options.editor` requests a specific editor (e.g. `{ editor: "md-view" }` for rendered Markdown); falls back to the default when omitted/unmatched |

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

// Subscribe to changes
const sub = app.settings.onChanged.subscribe(({ key, value }) => { ... });
sub.dispose();  // Unsubscribe
```

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

Specialized access to page content through typed editors. Call `page.asX()` — all are async. Facades auto-release when the script finishes.

### asText() — Monaco text editor

```javascript
const text = await page.asText();
text.editorMounted          // boolean — true when Monaco is visible
text.getSelectedText()      // Current selection
text.insertText("hello")    // Insert at cursor
text.replaceSelection("x")  // Replace selection
text.revealLine(42)         // Scroll to line
text.setHighlightText("q")  // Highlight occurrences
text.getCursorPosition()    // { lineNumber, column }
```

### asGrid() — Grid data editor (JSON/CSV)

```javascript
const grid = await page.asGrid();
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

### asNotebook() — Notebook editor (.note.json)

```javascript
const nb = await page.asNotebook();
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

### asLink() — Link collection (.link.json)

```javascript
const le = await page.asLink();
le.links                             // [{ id, url, title, category, tags, pinned }]
le.addLink(url, title?, category?)
le.deleteLink(id)
le.updateLink(id, { title?, category?, url? })
```

### asBrowser() — Browser page

```javascript
const browser = await page.asBrowser();
browser.url                          // Current URL (read-only)
browser.title                        // Page title (read-only)
browser.navigate(url)                // Navigate or search
browser.back() / browser.forward() / browser.reload()
```

### asMarkdown(), asSvg(), asHtml(), asMermaid()

Preview facades for rendered content. Check `viewMounted` / `loading` before accessing.

The **Mermaid** and **SVG** preview facades (and the **Image viewer** facade `asImage()`) can save
their rendered image to a file as PNG. This rasterises the diagram exactly as Persephone renders it
(fonts and text included), then writes the PNG. Use it to obtain a viewable image of a diagram:

```
// Render a mermaid page, save the PNG to a temp file, then read it back as an image.
const m = await page.asMermaid();
const file = await m.savePngToFile("D:/tmp/diagram.png");   // returns the written path

// Also available on SVG and Image pages:
await (await page.asSvg()).savePngToFile("D:/tmp/image.png");
await (await page.asImage()).savePngToFile("D:/tmp/photo.png");
```

To simply *look at* an image page, you usually don't need a script at all: `get_page_content`
returns the rendered PNG directly as an image block in the tool result. `savePngToFile` remains
the way to put the image on disk (or to read one that is too large to inline).

### asDraw()

Drawing editor facade for Excalidraw pages (`.excalidraw`).

```
const draw = await page.asDraw();
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

The `execute_script` tool accepts an optional `language` parameter. Set it to `"typescript"` to write scripts with type annotations — types are stripped via sucrase before execution.

```
execute_script({ script: "const x: number = 42; x", language: "typescript" })
```

TypeScript scripts have the same access to `page`, `app`, and Node.js APIs as JavaScript scripts. All type annotations are removed at runtime — no type checking is performed.

## Practical Examples

### Transform JSON data

```javascript
const data = JSON.parse(page.content);
const filtered = data.filter(item => item.status === "active");
page.grouped.language = "json";
page.grouped.editor = "grid-json";
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
const grid = await page.asGrid();
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

## Errors & verification

What failures actually look like in the `execute_script` result (verified against the app):

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
  after creating/modifying a page, `get_page_content` (content) or
  `browser_snapshot({ pageId: "app" })` (rendering). A `true`/content response from those is
  ground truth; your script returning without error is not.
