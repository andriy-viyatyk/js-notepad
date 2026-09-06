[← Home](../index.md) · [Scripting Guide](../scripting.md)

# Scripting API Reference

Scripts have access to five globals — `page`, `app`, `ui`, `io`, and `ai` — plus helpers `preventOutput()` and `styledText()`. No imports needed.

```javascript
const text = page.content;
const theme = app.settings.theme;
ui.log("Hello");
```

---

## API Tree

- **[page](./page.md)** — Current page (tab)
  - `.id` — Unique page identifier
  - `.title` — Display title
  - `.modified` — Has unsaved changes?
  - `.pinned` — Is tab pinned?
  - `.filePath` — File path (if file-backed)
  - `.content` — Text content *(read/write)*
  - `.language` — Language ID *(read/write)*
  - `.editor` — Current editor facade *(read-only; narrow on `.id`)*
  - `.editorSwitches` — Current editor ID, available switch options, and `.switchTo(id)`
  - `.data` — In-memory storage across script runs
  - `.panels` — Live sidebar panels and whole-sidebar controls
  - `.grouped` — Grouped partner page (auto-creates) → `IPage`
  - [`.runScript()`](./page.md#runscript) — Run page content as script (F5)
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "monaco"` — Monaco text editor facade
    - `.editorMounted` — True when editor is visible
    - `.getSelectedText()` — Currently selected text
    - `.getCursorPosition()` — `{lineNumber, column}`
    - `.insertText(text)` — Insert at cursor
    - `.replaceSelection(text)` — Replace selection
    - `.revealLine(lineNumber)` — Scroll to line
    - `.setHighlightText(text)` — Highlight occurrences
  - **[.editor](./page.md#editor-facades)** when `.editor.id` is a grid ID — Grid data facade
    - `.rows` — All rows as objects
    - `.columns` — Column definitions
    - `.rowCount` — Number of rows
    - `.editCell(columnKey, rowKey, value)` — Edit a cell
    - `.addRows(count?, insertIndex?)` — Add empty rows
    - `.deleteRows(rowKeys)` — Delete rows by keys
    - `.addColumns(count?, insertBeforeKey?)` — Add columns
    - `.deleteColumns(columnKeys)` — Delete columns
    - `.setSearch(text)` / `.clearSearch()` — Filter rows
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "notebook-view"` — Notebook facade (`.note.json`)
    - `.notes` — All notes
    - `.categories` / `.tags` — Category and tag lists
    - `.notesCount` — Total count
    - `.addNote()` — Add note
    - `.deleteNote(id)` — Delete note
    - `.updateNoteTitle(id, title)` / `.updateNoteContent(id, content)` / `.updateNoteCategory(id, category)`
    - `.addNoteTag(id, tag)` / `.removeNoteTag(id, tagIndex)`
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "link-view"` — Link collection facade (`.link.json`)
    - `.links` — All links
    - `.categories` / `.tags` — Category and tag lists
    - `.linksCount` — Total count
    - `.addLink(url, title?, category?)` / `.deleteLink(id)` / `.updateLink(id, props)`
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "browser-view"` — Browser facade
    - `.url` / `.title` — Current URL and page title (active tab)
    - `.navigate(url)` / `.back()` / `.forward()` / `.reload()`
    - `.tabs` / `.activeTab` — Internal tab list and active tab info
    - `.addTab(url?)` / `.closeTab(tabId?)` / `.switchTab(tabId)` — Tab management
    - `.evaluate(expression, options?)` — Run JavaScript in the page → `Promise<unknown>`
    - `.snapshot(options?)` — Accessibility snapshot (Playwright MCP format) → `Promise<string>`
    - `.getText(locator, options?)` / `.getValue(locator, options?)` / `.getAttribute(locator, attr, options?)` / `.getHtml(locator, options?)` / `.exists(locator, options?)` — DOM queries
    - `.click(locator, options?)` / `.hover(locator, options?)` / `.type(locator, text, options?)` / `.select(locator, value, options?)` / `.check(selector, options?)` / `.uncheck(selector, options?)` / `.clear(selector, options?)` — DOM interactions
    - `.screenshot(options?)` / `.networkRequests(options?)` — PNG capture and recorded requests
    - `.pressKey(key, options?)` — Press a key or key combination (e.g. `"Enter"`, `"Control+a"`)
    - `.waitFor({ selector | text | textGone | time, ... })` / `.waitForSelector(selector, options?)` / `.waitForNavigation(options?)` / `.wait(ms)` — Wait helpers
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "md-view"` — Markdown preview facade
    - `.viewMounted` — True if preview is mounted
    - `.html` — Rendered HTML content
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "svg-view"` — SVG preview: `.svg`
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "html-view"` — HTML preview: `.html`
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "mermaid-view"` — Mermaid diagram preview
    - `.svgUrl` — Rendered SVG data URL
    - `.loading` / `.error` — Render state
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "graph-view"` — Graph query facade
    - `.nodes` / `.links` / `.nodeCount` / `.linkCount` / `.getNode(id)`
    - `.selectedIds` / `.selectedNodes` / `.select(ids)` / `.addToSelection(ids)` / `.clearSelection()`
    - `.getNeighborIds(id)` / `.getVisualNeighborIds(id)`
    - `.getGroupOf(id)` / `.getGroupMembers(id)` / `.getGroupMembersDeep(id)` / `.getGroupChain(id)` / `.isGroup(id)`
    - `.search(query)` / `.bfs(startId, maxDepth?)` / `.getComponents()`
    - `.rootNodeId` / `.groupingEnabled`
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "draw-view"` — Drawing (Excalidraw) facade
    - `.elementCount` / `.editorIsMounted`
    - `.addImage(dataUrl, options?)` — Insert image onto canvas
    - `.exportAsSvg()` / `.exportAsPng(options?)` — Export drawing
  - **[.editor](./page.md#editor-facades)** when `.editor.id === "mcp-view"` — MCP Inspector facade
    - `.connectionStatus` / `.serverName` / `.serverTitle` / `.serverVersion` / `.errorMessage`
    - `.transportType` / `.url` / `.connectionName` *(read/write; URL rejects embedded credentials)*
    - `.command` / `.args` *(read-only)*
    - `.connect()` / `.disconnect()`
    - `.history` / `.historyCount` / `.clearHistory()` / `.showHistory()`
  - **[.editor](./page.md#editor-facades)** for Boards, toolsets, Tools & Editors, and Mneme pages
    - `board-view` / `board-info` / `toolset-view` / `tools-hub-view` / `mneme-config` / `mneme-root`
    - Read state and use the page-specific safe actions described in the [page reference](./page.md#editor-facades)
  - **Generic editor facade** — Other editor IDs expose `.id` and `.name`; no editor-specific methods yet

---

- **[app](./app.md)** — Application root
  - `.version` — Application version string
  - [`.call(path, options?)`](./app.md#callpath-options) — Read or act on the live object model from a script
  - [`.fetch(url, options?)`](./app.md#fetchurl-options) — Node.js HTTP client (no browser headers)
  - **[.pages](./pages.md)** — Open pages (tabs)
    - `.all` — All open pages in the current window → `IPage[]`
    - `.activePage` — Currently active page → `IPage`
    - `.groupedPage` — Grouped partner of active page → `IPage`
    - `.findPage(pageId)` / `.getGroupedPage(withPageId)` / `.isLastPage(pageId?)` / `.isGrouped(pageId)`
    - `.openFile(filePath)` — Open a file → `Promise<IPage | undefined>`
    - `.openFileWithDialog()` — Open file via native dialog
    - `.navigatePageTo(pageId, filePath, options?)` — Navigate page to different file
    - `.closePage(pageId)` — Close a page by ID → `Promise<boolean>`
    - `.addEmptyPage()` / `.addEditorPage(editor, language, title, content?)` / `.addDrawPage(dataUrl, title?)`
    - `.openLinks(links, title?)` — Create a standalone link collection page → `IPage`
    - `.openDiff(params)` — Diff view for two files
    - `.showAboutPage()` / `.showSettingsPage()` / `.showBrowserPage(options?)` / `.showMcpInspectorPage(options?)`
    - `.showMnemeConfigPage()` / `.showToolsHubPage(options?)`
    - `.openUrlInBrowserTab(url, options?)` / `.openUrl(url, options?)`
    - `.showPage(pageId)` / `.showNext()` / `.showPrevious()`
    - `.moveTab(fromId, toId)` / `.pinTab(pageId)` / `.unpinTab(pageId)`
    - `.group(leftId, rightId)` / `.ungroup(pageId)`
  - **[.fs](./fs.md)** — File system
    - `.read(filePath)` / `.readFile(filePath)` / `.readBinary(filePath)` — Read files
    - `.write(filePath, content)` / `.writeBinary(filePath, data)` — Write files
    - `.exists(filePath)` / `.delete(filePath)` / `.rename(old, new)` / `.copyFile(src, dest)` / `.stat(filePath)`
    - `.listDir(dirPath, pattern?)` / `.listDirWithTypes(dirPath)` — List directory
    - `.mkdir(dirPath)` / `.removeDir(dirPath, recursive?)`
    - `.resolveDataPath(rel)` / `.resolveCachePath(rel)` / `.commonFolder(name)` — Path resolution
    - `.showOpenDialog(options?)` / `.showSaveDialog(options?)` / `.showFolderDialog(options?)` — Native dialogs
    - `.showInExplorer(filePath)` / `.showFolder(folderPath)` — OS integration
  - **[.settings](./settings.md)** — Configuration
    - `.theme` — Current theme name
    - `.get(key)` / `.set(key, value)` — Read/write settings
    - `.onChanged` — Setting change event
    - `settings.sections` / `settings.highlight(key)` — Find and point at Settings rows through `app.call()` (not `app.settings`)
  - **[.ui](./ui.md)** — Dialogs and notifications
    - `.confirm(message, options?)` — Confirmation dialog
    - `.input(message, options?)` — Text input dialog
    - `.password(options?)` — Password dialog
    - `.textDialog(options)` — Monaco editor dialog
    - `.showProgress(promise, label?)` / `.createProgress(label?)` — Progress overlay
    - `.notifyProgress(label, timeout?)` — Progress toast
    - `.addScreenLock()` — Manual screen lock
    - `.notify(message, type?)` — Toast notification
  - **[.shell](./shell.md)** — OS integration
    - `.openExternal(url)` — Open in default browser
    - **[.version](./shell.md#appshellversion)** — Version info
      - `.runtimeVersions()` — Electron/Node/Chrome versions
      - `.checkForUpdates(force?)` — Check for app updates
    - **[.encryption](./shell.md#appshellencryption)** — AES-GCM encryption
      - `.encrypt(text, password)` / `.decrypt(text, password)` / `.isEncrypted(text)`
  - **[.window](./window.md)** — Window management
    - `.minimize()` / `.maximize()` / `.restore()` / `.close()` / `.toggleWindow()`
    - `.isMaximized` / `.windowIndex`
    - `.menuBar` — Menu Bar folders, selection, and controls
    - `.screen` — Automation host for Persephone's own window and active page
    - `.menuBarOpen` / `.toggleMenuBar()` / `.openMenuBar(panelId?)`
    - `.zoom(delta)` / `.resetZoom()` / `.zoomLevel`
    - `.openNew(filePath?)` — Open new window
  - **[.proc](./app.md#proc)** — Spawn external programs
    - `.execute(command, options?)` — Spawn a command → `IExecuteHandle`
      - `.getText()` / `.getJson(pattern?)` / `.getBytes()` — Buffer stdout to completion
      - `.on("stdout" | "stderr", cb)` / `.on("exit", cb)` / `.on("error", cb)` — Stream output
      - `.write(data)` / `.endStdin()` / `.kill(signal?)` — Process control
  - **[.boards](./app.md#boards)** — Create and open [Boards](../boards.md)
    - `.createBoard(name, dir)` — Create a blank board (auto-trusted) → `Promise<string>` (root path)
    - `.createDemoBoard(name, dir)` — Create from the Demo template → `Promise<string>`
    - `.openBoard(boardRoot)` — Open an existing board by root path → `Promise<void>`
    - `.list()` — Local trusted, installed, and open board inventory
  - **[.boardVars](./app.md#boardvars)** — Admin access to the [board environment-variables store](../boards.md#environment-variables--secrets-outside-the-board-folder) (any namespace)
    - `.namespaceFor(boardRoot)` — Resolve a board's vars namespace → `Promise<string>`
    - `.get(namespace, name, env?)` / `.set(namespace, name, value, env?)` / `.list(namespace, env?)`
    - `.listNamespaces()` — Every namespace in the configured `.env.json`
    - `.show(namespace?)` — Open the built-in `.env.json` editor, optionally scoped to a namespace
  - **[.events](./events.md)** — Event channels for scripting integration
    - **[.fileExplorer](./events.md#fileexploreritemcontextmenu)** — File explorer events
      - `.itemContextMenu` — Right-click on file/folder → add custom menu items
    - **[.browser](./events.md#browseronbookmark)** — Browser events
      - `.onBookmark` — Before Add/Edit Bookmark dialog → modify title, URL, images, category, tags
    - **[.openRawLink](./events.md#openrawlink)** — Layer 1: parse a raw string (path, URL, cURL) into a structured link
    - **[.openLink](./events.md#openlink)** — Layer 2: resolve a URL into a content pipe
    - **[.openContent](./events.md#opencontent)** — Layer 3: content pipe + target → open page (subscribe to observe/intercept page opens)
    - All channels support `.subscribe()`, `.send()`, and `.sendAsync()`
  - **[.editors](./editors.md)** — Editor registry
    - `.getAll()` / `.getById(id)` / `.resolve(filePath)` / `.resolveId(filePath)`
    - `.getSwitchOptions(languageId, filePath?)`
  - **[.recent](./recent.md)** — Recent files
    - `.files` — Recent file paths (call `.load()` first)
    - `.load()` / `.add(filePath)` / `.remove(filePath)` / `.clear()`
  - **[.downloads](./downloads.md)** — Download tracking
    - `.downloads` / `.hasActiveDownloads` / `.aggregateProgress`
    - `.cancelDownload(id)` / `.openDownload(id)` / `.showInFolder(id)` / `.clearCompleted()`
  - **[.menuFolders](./app.md#menufolders)** — Sidebar folders
    - `.folders` — Current folder list
    - `.add(options)` / `.remove(id)` / `.find(id)` / `.move(sourceId, targetId)`

---

- **[ui](./ui-log.md)** — Log View (lazy-initialized on first access)
  - `await ui()` — Yield to event loop (UI refresh)
  - `.log(msg)` / `.info(msg)` / `.warn(msg)` / `.error(msg)` / `.success(msg)` / `.text(msg)` — Logging
  - `.clear()` — Clear all entries
  - `.preventConsoleLog()` / `.preventConsoleWarn()` / `.preventConsoleError()` — Suppress forwarding
  - **[.dialog](./ui-log.md#dialogs)** — Inline dialogs
    - `.confirm(message, buttons?)` — Confirmation
    - `.buttons(buttons, title?)` — Custom buttons
    - `.textInput(title?, options?)` — Text input
    - `.checkboxes(items, title?, buttons?)` — Multi-select
    - `.radioboxes(items, title?, buttons?)` — Single-select
    - `.select(items, title?, buttons?)` — Dropdown select
  - **[.show](./ui-log.md#progress-bars)** — Rich output
    - `.progress(label?)` — Progress bar → `{value, max, label, completed}`
    - `.grid(data)` — Inline data grid → `{data, columns, title, openInEditor()}`
    - `.text(text, language?)` — Syntax-highlighted block → `{text, language, title, openInEditor()}`
    - `.markdown(text)` — Rendered markdown → `{text, title, openInEditor()}`
    - `.mermaid(text)` — Rendered diagram → `{text, title, openInEditor()}`

---

- **[preventOutput()](../scripting.md#output-suppression)** — Suppress default script output to grouped page
- **[styledText(text)](./ui-log.md#styledtext-global)** — Create styled text builder for dialogs

---

- **[ai](./ai.md)** — AI model integrations
  - `new ai.ClaudeSession(config)` — Create a Claude conversation session
    - `.modelId` / `.maxTokens` / `.temperature` / `.maxToolRounds` — Session config
    - `.messages` / `.lastResponse` — Conversation state
    - `.systemMessage(text)` — Set system instructions
    - `.userMessage(text)` — Add a user message
    - `.tools` — Tool definitions (get/set)
    - `.on(event, callback)` — Subscribe to events (`"tool-call"`, `"tool-result"`, `"assistant-message"`, etc.)
    - `.send(options?)` — Send and run tool loop → `Promise<string>`
    - `.clear()` — Reset conversation history

---

- **[io](./io.md)** — Content pipe builder (providers, transformers, link pipeline helpers)
  - `new io.FileProvider(filePath)` — local file data source
  - `new io.HttpProvider(url, options?)` — HTTP/HTTPS data source
  - `new io.ArchiveTransformer(archivePath, entryPath)` — extract an archive entry (ZIP, RAR, 7z, TAR, etc.)
  - `new io.DecryptTransformer(password)` — decrypt AES-GCM content
  - `io.createPipe(provider, ...transformers)` — assemble a content pipe
  - `io.createLinkData(href, options?)` — create an `ILinkData` for the link pipeline (`openRawLink`)
  - `io.linkToLinkData(link)` — convert an `ILink` to `ILinkData` preserving all fields

---

## Node.js Access

Scripts have full Node.js access via `require()`:

```javascript
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
```

## Output

Script return values are written to the grouped (side-by-side) output page:

| Return Type | Output |
|-------------|--------|
| String | Written as-is |
| Number/Boolean | Converted to string |
| Object/Array | JSON formatted |
| Error | Error message + stack trace |
| `undefined` | "undefined" |

See [Scripting Guide](../scripting.md) for full details on running scripts.
