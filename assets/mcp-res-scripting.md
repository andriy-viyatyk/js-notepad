# Scripting API — execute_script

The `execute_script` tool runs JavaScript or TypeScript in Persephone's context. Scripts have access to `page` (current tab), `app` (application services), and full Node.js APIs.

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

### app.pages

```javascript
app.pages.activePage              // Current active page (IPage)
app.pages.findPage(pageId)        // Find page by ID
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
await app.pages.openUrlInBrowserTab(url)              // Open URL in browser
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

### asTodo() — Todo list editor (.todo.json)

```javascript
const todo = await page.asTodo();
todo.items                           // [{ id, title, completed, list, tag }]
todo.lists                           // List names
todo.addItem(title)                  // Add to current list
todo.toggleItem(id)
todo.deleteItem(id)
todo.updateItemTitle(id, title)
todo.addList(name)                   // Returns false if exists
todo.renameList(old, new)
todo.deleteList(name)                // Deletes list and items
todo.addTag(name)
todo.selectList(name)                // Select list ("" = All)
todo.selectTag(name)                 // Select tag filter ("" = All)
todo.setSearch(text)                 // Filter items by text
todo.clearSearch()
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
