[← API Reference](./index.md)

# page

Represents the current page (tab). Available as the global `page` variable in scripts.

```javascript
// Read/write content
page.content = page.content.toUpperCase();

// Access grouped output page (auto-creates if none)
page.grouped.content = JSON.stringify(result);

// Store data across script runs
page.data.counter = (page.data.counter || 0) + 1;
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique page identifier. Read-only. |
| `title` | `string` | Display title. Read-only. |
| `modified` | `boolean` | True if page has unsaved changes. Read-only. |
| `pinned` | `boolean` | True if tab is pinned. Read-only. |
| `filePath` | `string?` | Absolute file path, if backed by a file. Read-only. |
| `content` | `string` | Text content. **Read/write.** Only meaningful for text-based pages. |
| `language` | `string` | Language ID (e.g., `"json"`, `"typescript"`). **Read/write.** |
| `editor` | `string` | Active editor ID (e.g., `"monaco"`, `"grid-json"`). **Read/write.** See [Editor IDs](#editor-ids) for the full list. |
| `data` | `Record<string, any>` | In-memory data storage. Persists across script runs but not app restarts. |
| `panels` | `IPagePanels` | Live sidebar panels and whole-sidebar controls for this page. |
| `grouped` | `IPage` | Grouped (side-by-side) partner page. Auto-creates if none exists. |

### Sidebar panels

`page.panels` reports the panels currently contributed by the page and controls the whole page
sidebar. The `items` list is live and follows the sidebar order.

| Member | Type | Description |
|--------|------|-------------|
| `items` | `IPagePanel[]` | Panel records with `id`, `label`, `editorId`, `editorKind`, and `expanded`. |
| `isOpen` | `boolean` | Whether the page sidebar is open. |
| `width` | `number \| null` | Current sidebar width, or `null` before the sidebar model exists. |
| `expand(panelId)` | `void` | Expand a panel using its bare registered ID. If several editors use the same ID, the first rendered one is selected. |
| `toggleSidebar()` | `void` | Show or hide the whole sidebar. Throws when the page has no panels or its panels require the sidebar to remain open. |

Panel IDs passed to `expand()` are the bare IDs shown in `items`; do not construct the rendered
`editorId::panelId` form. There is no general `close(panelId)` method: close an individual panel with
its own header control, because the panel's editor determines what closing means.

### Editor IDs

`"monaco"` · `"grid-json"` · `"grid-csv"` · `"grid-jsonl"` · `"md-view"` · `"notebook-view"` · `"link-view"` · `"svg-view"` · `"html-view"` · `"mermaid-view"` · `"image-view"` · `"browser-view"` · `"graph-view"` · `"draw-view"` · `"log-view"` · `"mcp-view"` · `"archive-view"` · `"category-view"` · `"about-view"` · `"settings-view"`

> `"pdf-view"` was removed in 4.0.18 along with the built-in PDF viewer — see [What's New](../whats-new.md#version-4018-upcoming). PDF viewing is now provided by the published **PDF Viewer** board, which has its own board-specific editor id and isn't addressable through this list. See [Editors — PDF Viewer](../editors.md#pdf-viewer).

## Methods

### runScript() → `Promise<string>`

Run this page's content as a script, equivalent to pressing `F5`. Only works for JavaScript/TypeScript pages. Returns the script result as text.

```javascript
// Find a script page and run it
const scriptPage = app.pages.all.find(p => p.title === "my-script.js");
const result = await scriptPage.runScript();
console.log(result); // script output
```

## Editor Facades

Editor facades provide specialized access to a page's content through the appropriate editor. Call `page.asX()` to get a facade.

All facades are async and must be awaited:

```javascript
const grid = await page.asGrid();
grid.addRows(5);
```

> **`force` parameter** — Every text-bearing facade (`asText`, `asGrid`, `asNotebook`, `asLink`, `asMarkdown`, `asSvg`, `asHtml`, `asMermaid`, `asGraph`, `asDraw`) accepts an optional `force?: boolean` argument. By default the call throws if the page isn't already running the target editor. Pass `true` to attempt a switch from any compatible editor — the same compatibility source the UI's editor-switch widget uses. Throws if no compatible switch is possible.

> **Lifecycle:** Editor facades are stateless wrappers — there is nothing to release. They expose operations on the editor model directly. Event subscriptions made via `app.events` are still auto-unsubscribed when the script completes.

---

### asText() → `Promise<ITextEditor>`

Monaco text editor features. Only for text pages.

Methods that interact with the Monaco instance are queued internally and deferred until mount — call them whenever you need; you don't need to gate on `editorMounted`. The flag is informational only (e.g., for the script to decide whether selection/cursor reads will reflect on-screen state).

| Member | Type | Description |
|--------|------|-------------|
| `editorMounted` | `boolean` | True when Monaco editor is visible and mounted. Informational. |
| `getSelectedText()` | `Promise<string>` | Currently selected text, or `""`. |
| `revealLine(lineNumber)` | `void` | Scroll to reveal a line in the center. |
| `setHighlightText(text)` | `void` | Highlight all occurrences with find-match decorations. |
| `getCursorPosition()` | `Promise<{lineNumber, column}>` | Current cursor position. Returns `{lineNumber: 1, column: 1}` if the editor is not mounted. |
| `insertText(text)` | `Promise<void>` | Insert text at cursor position. |
| `replaceSelection(text)` | `Promise<void>` | Replace current selection with text. |

```javascript
const text = await page.asText();
const selected = await text.getSelectedText();
await text.replaceSelection(selected.toUpperCase());
```

---

### asGrid() → `Promise<IGridEditor>`

Grid data manipulation. Only for text pages with JSON or CSV content.

| Member | Type | Description |
|--------|------|-------------|
| `rows` | `any[]` | All rows as plain objects. |
| `columns` | `IColumnInfo[]` | Column definitions (`key`, `name`). |
| `rowCount` | `number` | Number of rows. |
| `editCell(columnKey, rowKey, value)` | `void` | Edit a single cell value. |
| `addRows(count?, insertIndex?)` | `any[]` | Add empty rows. Returns new rows. |
| `deleteRows(rowKeys)` | `void` | Delete rows by keys. |
| `addColumns(count?, insertBeforeKey?)` | `IColumnInfo[]` | Add columns. Returns new column definitions. |
| `deleteColumns(columnKeys)` | `void` | Delete columns by keys. |
| `setSearch(text)` | `void` | Set search filter text. |
| `clearSearch()` | `void` | Clear search filter. |

```javascript
const grid = await page.asGrid();

// Add 3 rows at the end
grid.addRows(3);

// Edit a cell
grid.editCell("name", "0", "Alice");

// Read all data
grid.rows.forEach(row => console.log(row.name, row.age));
```

---

### asNotebook() → `Promise<INotebookEditor>`

Notebook editor. Only for `.note.json` pages.

| Member | Type | Description |
|--------|------|-------------|
| `notes` | `INote[]` | All notes (not filtered by UI). Each has `id`, `title`, `content`, `category`, `tags`. |
| `categories` | `string[]` | All category names. |
| `tags` | `string[]` | All tag names. |
| `notesCount` | `number` | Total number of notes. |
| `addNote()` | `INote` | Add a new note. Returns it. |
| `deleteNote(id)` | `void` | Delete a note. |
| `updateNoteTitle(id, title)` | `void` | Update title. |
| `updateNoteContent(id, content)` | `void` | Update text content. |
| `updateNoteCategory(id, category)` | `void` | Update category. |
| `addNoteTag(id, tag)` | `void` | Add a tag to a note. |
| `removeNoteTag(id, tagIndex)` | `void` | Remove a tag by index. |

```javascript
const nb = await page.asNotebook();
const note = nb.addNote();
nb.updateNoteTitle(note.id, "Meeting Notes");
nb.updateNoteContent(note.id, "Discussed project timeline...");
nb.updateNoteCategory(note.id, "Work");
```

---

### asLink() → `Promise<ILinkEditor>`

Link collection editor. Only for `.link.json` pages.

| Member | Type | Description |
|--------|------|-------------|
| `links` | `ILink[]` | All links. Each has `id`, `url`, `title`, `category`, `tags`, `pinned`, `isDirectory`. |
| `categories` | `string[]` | All category names. |
| `tags` | `string[]` | All tag names. |
| `linksCount` | `number` | Total number of links. |
| `addLink(url, title?, category?)` | `void` | Add a link. |
| `deleteLink(id)` | `void` | Delete a link. |
| `updateLink(id, { title?, category?, url? })` | `void` | Update link properties. |

```javascript
const le = await page.asLink();
le.addLink("https://github.com", "GitHub", "Development");
le.addLink("https://stackoverflow.com", "Stack Overflow", "Development");
```

---

### asBrowser() → `Promise<IBrowserEditor>`

Browser control. Only for browser pages.

All automation methods accept an optional `{ tabId }` option to target a specific tab. When omitted, the active tab is used.

**Navigation:**

| Member | Type | Description |
|--------|------|-------------|
| `url` | `string` | Current URL of the active tab. Read-only. |
| `title` | `string` | Current page title of the active tab. Read-only. |
| `navigate(url)` | `void` | Navigate to a URL or search query. |
| `back()` | `void` | Go back in history. |
| `forward()` | `void` | Go forward in history. |
| `reload()` | `void` | Reload (or stop loading). |

**Tab management:**

| Member | Type | Description |
|--------|------|-------------|
| `tabs` | `IBrowserTab[]` | All open internal tabs. |
| `activeTab` | `IBrowserTab` | The currently active (visible) tab. |
| `addTab(url?)` | `string` | Open a new tab. Returns the new tab's ID. |
| `closeTab(tabId?)` | `void` | Close a tab. Defaults to the active tab. |
| `switchTab(tabId)` | `void` | Switch to a tab (make it active). |

Each `IBrowserTab` has: `id`, `url`, `title`, `loading`, `active`.

**Evaluate & Snapshot:**

| Member | Type | Description |
|--------|------|-------------|
| `evaluate(expression, options?)` | `Promise<unknown>` | Run JavaScript in the page and return the result. Async expressions are awaited automatically. Pass `{ tabId }` to target a specific tab. |
| `snapshot(options?)` | `Promise<string>` | Get an accessibility snapshot of the page as a YAML-like tree. Format matches Playwright MCP's `browser_snapshot` output. Each interactive element has a `[ref=eN]` annotation usable for future targeting. Pass `{ tabId }` to snapshot a background tab. |

**Query methods** (use CSS selectors; return `null` / `false` if not found):

| Member | Type | Description |
|--------|------|-------------|
| `getText(selector, options?)` | `Promise<string \| null>` | Get `textContent` of an element. |
| `getValue(selector, options?)` | `Promise<string \| null>` | Get the value of an input, textarea, or select. |
| `getAttribute(selector, attribute, options?)` | `Promise<string \| null>` | Get an attribute value. |
| `getHtml(selector, options?)` | `Promise<string \| null>` | Get `innerHTML` of an element. |
| `exists(selector, options?)` | `Promise<boolean>` | Check if an element exists on the page. |

**Interaction methods** (use CSS selectors; throw if element not found):

| Member | Type | Description |
|--------|------|-------------|
| `click(selector, options?)` | `Promise<void>` | Click an element. |
| `type(selector, text, options?)` | `Promise<void>` | Type text into an input or textarea. Clears existing value first. Dispatches `input` and `change` events for framework compatibility. |
| `select(selector, value, options?)` | `Promise<void>` | Select an option in a `<select>` element by value. |
| `check(selector, options?)` | `Promise<void>` | Check a checkbox or radio button. |
| `uncheck(selector, options?)` | `Promise<void>` | Uncheck a checkbox. |
| `clear(selector, options?)` | `Promise<void>` | Clear the value of an input or textarea. |
| `pressKey(key, options?)` | `Promise<void>` | Press a key or key combination via CDP (e.g. `"Enter"`, `"Tab"`, `"Escape"`, `"ArrowDown"`). Supports compound keys: `"Control+a"`, `"Shift+Enter"`. |

**Wait methods:**

| Member | Type | Description |
|--------|------|-------------|
| `waitForSelector(selector, options?)` | `Promise<void>` | Wait for an element to appear in the DOM. Resolves immediately if already present. Rejects on timeout. Options: `{ timeout?, tabId? }` (default timeout: 30 seconds). |
| `waitForNavigation(options?)` | `Promise<void>` | Wait for the page to finish loading (`document.readyState === "complete"`). For SPA navigations, use `waitForSelector` instead. Options: `{ timeout?, tabId? }`. |
| `wait(ms)` | `Promise<void>` | Wait for the specified number of milliseconds. |

```javascript
const browser = await page.asBrowser();

// Navigate and wait for load
browser.navigate("https://example.com");
await browser.waitForNavigation();
console.log(browser.title);

// Wait for dynamic content, then interact
await browser.waitForSelector("#results");
const heading = await browser.getText("h1");
await browser.type("#search", "persephone");
await browser.click("#submit-btn");

// Work with multiple tabs
const tabId = browser.addTab("https://other.com");
await browser.waitForNavigation({ tabId });
const otherTitle = await browser.getText("h1", { tabId });

// Tab listing
for (const tab of browser.tabs) {
    console.log(tab.id, tab.url, tab.title);
}
browser.switchTab(tabId);
browser.closeTab(tabId);
```

---

### asMarkdown() → `Promise<IMarkdownEditor>`

Markdown preview. Only for text pages with markdown content.

| Member | Type | Description |
|--------|------|-------------|
| `viewMounted` | `boolean` | True if the preview is mounted in the DOM. |
| `html` | `string` | Rendered HTML content. Empty if view is not mounted. |

```javascript
const md = await page.asMarkdown();
if (md.viewMounted) {
    console.log(md.html); // the rendered HTML
}
```

---

### asSvg() → `Promise<ISvgEditor>`

SVG preview. Only for text pages with SVG content.

| Member | Type | Description |
|--------|------|-------------|
| `svg` | `string` | The SVG source content. |
| `savePngToFile(filePath)` | `Promise<string>` | Rasterise the SVG to PNG (1× scale) and write it to `filePath`. Parent directories are created as needed. Returns the written path. |

```javascript
const svg = await page.asSvg();
await svg.savePngToFile("D:/tmp/image.png");
```

---

### asHtml() → `Promise<IHtmlEditor>`

HTML preview. Only for text pages with HTML content.

| Member | Type | Description |
|--------|------|-------------|
| `html` | `string` | The HTML source content. |

---

### asMermaid() → `Promise<IMermaidEditor>`

Mermaid diagram preview. Only for text pages with mermaid content.

| Member | Type | Description |
|--------|------|-------------|
| `svgUrl` | `string` | Data URL of the rendered SVG. Empty while loading or on error. |
| `loading` | `boolean` | True while rendering. |
| `error` | `string` | Error message if rendering failed. Empty on success. |
| `savePngToFile(filePath)` | `Promise<string>` | Render the diagram to PNG (1× scale) and write it to `filePath`. Parent directories are created as needed. Returns the written path. Renders on demand even if the page has never been shown. |

```javascript
const mermaid = await page.asMermaid();
if (!mermaid.loading && !mermaid.error) {
    console.log(mermaid.svgUrl); // data URL of the rendered diagram
}

// Save the rendered diagram to a file (renders on demand if needed)
await mermaid.savePngToFile("D:/tmp/diagram.png");
```

**Agent usage via `execute_script`:**

```javascript
// An MCP agent can save a Mermaid diagram to a temp file and read it back as an image
const m = await page.asMermaid();
const path = await m.savePngToFile("C:/Users/me/AppData/Local/Temp/diagram.png");
// then use app.pages.openFile(path) or return path to the agent
```

---

### asGraph() → `Promise<IGraphEditor>`

Graph query and analysis. Only for text pages with force-graph JSON content. Primarily designed for AI agent usage via MCP (`execute_script`), but works in any script. Focuses on read/query operations — editing is done via `page.content` JSON.

**Data access:**

| Member | Type | Description |
|--------|------|-------------|
| `nodes` | `IGraphNode[]` | All nodes (cleaned, no D3 runtime fields). |
| `links` | `Array<{source, target}>` | All links as ID pairs. |
| `nodeCount` | `number` | Total node count. |
| `linkCount` | `number` | Total link count. |
| `getNode(id)` | `IGraphNode \| undefined` | Get a single node by ID. |

**Selection:**

| Member | Type | Description |
|--------|------|-------------|
| `selectedIds` | `string[]` | Currently selected node IDs. |
| `selectedNodes` | `IGraphNode[]` | Currently selected nodes (cleaned). |
| `select(ids)` | `void` | Select nodes by IDs (replaces selection). Updates the UI. |
| `addToSelection(ids)` | `void` | Add nodes to current selection. Updates the UI. |
| `clearSelection()` | `void` | Clear selection. Updates the UI. |

**Relationships:**

| Member | Type | Description |
|--------|------|-------------|
| `getNeighborIds(nodeId)` | `string[]` | Direct neighbor IDs from real data links (excludes group membership). |
| `getVisualNeighborIds(nodeId)` | `string[]` | Visual neighbor IDs (links may route through groups when grouping is enabled). |
| `getGroupOf(nodeId)` | `string \| undefined` | Group ID that a node belongs to. |
| `getGroupMembers(groupId)` | `string[]` | Direct member IDs of a group node. |
| `getGroupMembersDeep(groupId)` | `string[]` | All member IDs recursively (includes sub-group members). |
| `getGroupChain(nodeId)` | `string[]` | Group chain from node to top-level group. |
| `isGroup(nodeId)` | `boolean` | Whether a node is a group node. |

**Search & traversal:**

| Member | Type | Description |
|--------|------|-------------|
| `search(query, includeHidden?)` | `IGraphSearchResult[]` | Search nodes (multi-word AND). Does not affect the UI. `includeHidden` defaults to `true`. |
| `bfs(startId, maxDepth?, visual?)` | `Array<{id, depth}>` | BFS traversal. `visual` follows processed links when `true`, real links when `false` (default). |
| `getComponents()` | `IGraphComponent[]` | Connected components sorted by size (largest first). |

**Options:**

| Member | Type | Description |
|--------|------|-------------|
| `rootNodeId` | `string` | Current root node ID, or empty string. |
| `groupingEnabled` | `boolean` | Whether grouping is currently enabled. |

```javascript
const graph = await page.asGraph();

// Find neighbors
const neighbors = graph.getNeighborIds("my-node");

// Search and select results
const results = graph.search("auth");
graph.select(results.map(r => r.nodeId));

// BFS traversal from root
const reachable = graph.bfs(graph.rootNodeId, 3);
console.log(`${reachable.length} nodes within depth 3`);

// Analyze components
const components = graph.getComponents();
components.forEach(c => console.log(`Component: ${c.nodeCount} nodes`));
```

---

### asDraw() → `Promise<IDrawEditor>`

Drawing editor (Excalidraw canvas). Only for `.excalidraw` pages. To create a new drawing page with an embedded image, use [`app.pages.addDrawPage()`](./pages.md#adddrawpagedataurl-title--promiseipage).

| Member | Type | Description |
|--------|------|-------------|
| `elementCount` | `number` | Number of elements on the canvas. |
| `editorIsMounted` | `boolean` | True when the Excalidraw editor is visible and mounted. |
| `addImage(dataUrl, options?)` | `Promise<void>` | Insert an image onto the live canvas. Requires `editorIsMounted`. Options: `x`, `y` (position, default 0), `maxDimension` (cap longer side, default 1200). |
| `exportAsSvg()` | `Promise<string>` | Export the drawing as an SVG markup string. Works even when the editor is not mounted. |
| `exportAsPng(options?)` | `Promise<string>` | Export the drawing as a PNG data URL. Options: `scale` (default 2). Works even when the editor is not mounted. |

```javascript
const draw = await page.asDraw();

// Export as SVG
const svg = await draw.exportAsSvg();
page.grouped.content = svg;
page.grouped.editor = "svg-view";

// Insert an image (editor must be visible)
if (draw.editorIsMounted) {
    await draw.addImage("data:image/png;base64,...", { x: 100, y: 100 });
}
```

---

### asImage() → `Promise<IImageEditor>`

Image viewer. Only for image pages (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`, and images opened from URLs or archives).

| Member | Type | Description |
|--------|------|-------------|
| `savePngToFile(filePath)` | `Promise<string>` | Re-encode the displayed image to PNG (1× scale) and write it to `filePath`. Parent directories are created as needed. Returns the written path. |

```javascript
const img = await page.asImage();
await img.savePngToFile("D:/tmp/out.png");
```

**Agent usage via `execute_script`:**

```javascript
// Open an image file, then save it as PNG to a temp path for the agent to read
await app.pages.openFile("D:/photos/photo.jpg");
const img = await page.asImage();
const outPath = await img.savePngToFile("C:/Users/me/AppData/Local/Temp/photo.png");
// agent reads the temp file back as an image
```

---

### asMcpInspector() → `Promise<IMcpInspectorEditor>`

MCP Inspector connection management and troubleshooting. Only for MCP Inspector pages (created via `app.pages.showMcpInspectorPage()`). Provides access to connection parameters, status, and request history — but not the MCP client API itself (agents use `@modelcontextprotocol/sdk` directly for tool calls, resource reads, etc.).

**Connection status (read-only):**

| Member | Type | Description |
|--------|------|-------------|
| `connectionStatus` | `string` | `"disconnected"`, `"connecting"`, `"connected"`, or `"error"`. |
| `serverName` | `string` | Connected server name (empty when disconnected). |
| `serverTitle` | `string` | Display-friendly server title (empty if not provided by the server). |
| `serverVersion` | `string` | Connected server version (empty when disconnected). |
| `serverDescription` | `string` | Short server description (empty if not provided by the server). |
| `serverWebsiteUrl` | `string` | Server website URL (empty if not provided by the server). |
| `instructions` | `string` | Server instructions received during initialization (empty when disconnected). |
| `errorMessage` | `string` | Last error message (empty when no error). |

**Connection parameters (read/write):**

| Member | Type | Description |
|--------|------|-------------|
| `transportType` | `string` | `"http"` or `"stdio"`. |
| `url` | `string` | Server URL (for HTTP transport). |
| `command` | `string` | Command to spawn (for stdio transport). |
| `args` | `string` | Space-separated arguments (for stdio transport). |
| `connectionName` | `string` | Display name for the connection. |

**Actions:**

| Member | Type | Description |
|--------|------|-------------|
| `connect()` | `Promise<void>` | Connect using current parameters. |
| `disconnect()` | `Promise<void>` | Disconnect from the current server. |

**History (troubleshooting):**

| Member | Type | Description |
|--------|------|-------------|
| `historyCount` | `number` | Number of recorded request entries. |
| `history` | `ReadonlyArray<{...}>` | Array of request/response entries with `direction`, `method`, `params`, `result`, `error`, `durationMs`, `timestamp`. |
| `clearHistory()` | `void` | Clear all recorded history. |
| `showHistory()` | `Promise<void>` | Open history in a new Log View page. |

> **Note:** Writing connection parameters while connected does not auto-reconnect. Call `disconnect()` then `connect()` to apply changes.

```javascript
const mcp = await page.asMcpInspector();

// Connect to a server
mcp.url = "http://127.0.0.1:7865/mcp";
mcp.transportType = "http";
await mcp.connect();
console.log(mcp.connectionStatus); // "connected"
console.log(mcp.serverName);       // "persephone"
console.log(mcp.serverTitle);      // "Persephone"

// Check request history
console.log(`${mcp.historyCount} requests recorded`);
for (const entry of mcp.history) {
    console.log(`${entry.method} — ${entry.durationMs}ms${entry.error ? " ERROR" : ""}`);
}
```
