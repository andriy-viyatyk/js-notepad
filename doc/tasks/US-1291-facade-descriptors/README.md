# US-1291: AiVision descriptors for editor facades

**Epic:** [EPIC-083](../../epics/EPIC-083.md)  
**Status:** Implemented - live MCP verification unavailable; review deferred  
**Depends on:** [US-1289: AiVision core](../US-1289-ai-vision-core/README.md)

## Goal

Add self-describing AiVision metadata to every editor facade reachable from `PageWrapper`, using
the committed `PageCollectionWrapper.aiVision` and `PageWrapper.aiVision` implementation as the
pattern. Each facade will expose a kind-level member list and help text, an instance summary, and
the existing script API will remain the source of truth for path names and behavior.

The completed tree must let `helpSearch("add rows")` discover a live grid path such as
`pages[0].asGrid().addRows()` through `PageWrapper.children()` without probing side-effecting
getters. This document records the verified implementation plan only; no implementation is part
of this task-document pass.

## Background

### Binding design decisions

The relevant decisions in [EPIC-083](../../epics/EPIC-083.md) are:

- **Decision 1 - interface, not base class:** wrappers keep their existing inheritance and opt in
  with `IAiVisible` from `src/shared/ai-vision/types.ts`; descriptors are not trait wrappers.
- **Decision 4 - cooperative discovery:** `members` is a static, kind-level list; `children()` is
  an instance-level list of safe, live children. Facade descriptors should omit `children()`
  because their returned values are data snapshots, not AiVision sub-objects. `PageWrapper` owns
  the live facade child and already lists only the facade matching the current editor.
- **Decision 5 - result shaping:** visible instances are summarized rather than dumped. Every
  facade descriptor therefore needs a small JSON-able `summarize()` result and must not return
  editor internals or large rendered content as its summary.
- **Decision 7 - privacy:** private browser-page access is enforced by `PageWrapper.restricted()`
  using `src/renderer/editors/browser/agent-access.ts`. `BrowserEditorFacade` must not add a
  second privacy guard; the resolver refuses the page before any browser facade member is read.

Decision 8 also fixes the approach: descriptors are hand-written beside the wrapper class, while
`.d.ts` generation is a later optional task (US-1294).

### Existing pattern to copy

`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` and
`src/renderer/scripting/api-wrapper/PageWrapper.ts` already:

1. import `IAiChild`, `IAiMember`, `IAiVisible`, and `IAiVisionDescriptor` from
   `src/shared/ai-vision/types.ts`;
2. declare a readonly kind-level `const ..._MEMBERS: readonly IAiMember[]` in the same file;
3. declare a same-file `..._HELP` string;
4. implement `IAiVisible` and return a fresh descriptor from `get aiVision()`;
5. use `summarize()` for compact instance output; and
6. use `children()` only for dynamic, live objects.

The exact kind names are already fixed in `FACADE_FOR_EDITOR` in `PageWrapper.ts`: `TextEditor`,
`GridEditor`, `NotebookEditor`, `LinkEditor`, `MarkdownEditor`, `SvgEditor`, `HtmlEditor`,
`MermaidEditor`, `GraphEditor`, `DrawEditor`, `BrowserEditor`, `McpInspector`, and `ImageEditor`.

`src/shared/ai-vision/types.ts` defines `IAiMember` fields `name`, `kind`, `summary`, optional
`signature`, `caution`, and `writable`; `IAiVisionDescriptor` additionally supports `kind`,
`summary`, `members`, optional `help`, `children`, `restricted`, `index`, and `summarize`.

### Verified object graph and helper classes

`PageWrapper.asText()` through `PageWrapper.asMcpInspector()` and `PageWrapper.asImage()` return
the thirteen facade classes in `src/renderer/scripting/api-wrapper/`. The helper classes
`Grid.ts`, `Markdown.ts`, `Mermaid.ts`, and `Text.ts` are instead constructed only by
`UiFacade.ts` for `ui.show.grid()`, `ui.show.markdown()`, `ui.show.mermaid()`, and
`ui.show.text()`. No in-scope editor facade returns any of those helpers, and their properties
are not a child object graph under `PageWrapper`; they require no US-1291 changes.

`BrowserEditorFacade.cdp()` is a source-public helper used only by methods inside that class. It
is absent from `IBrowserEditor` in `src/renderer/api/types/browser-editor.d.ts` and returns the
internal `CdpSession`, which has no AiVision descriptor. The implementation plan keeps it out of
the agent-facing descriptor and makes its source visibility private, so the script-facing surface
and descriptor remain aligned.

### Full verified member inventory

The summaries below reuse the JSDoc from the matching `.d.ts` files in
`src/renderer/api/types/`; signatures reflect the actual facade source. `property` means a
getter; `writable` means the facade has a setter or the descriptor must allow AiVision `value`
assignment.

#### `TextEditorFacade` -> kind `TextEditor`

Source: `src/renderer/scripting/api-wrapper/TextEditorFacade.ts`  
Types: `src/renderer/api/types/text-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `editorMounted` | property | True when the Monaco editor is visible and mounted. The queue layer defers commands until mount, so this is informational - consumers no longer need to gate calls on it. | |
| `getSelectedText` | `getSelectedText(): Promise<string>` | Get currently selected text, or empty string if no selection. | |
| `revealLine` | `revealLine(lineNumber: number): void` | Scroll to reveal a specific line in the center of the editor. | |
| `setHighlightText` | `setHighlightText(text?: string): void` | Highlight all occurrences of text with find-match decorations. | Source optional; `.d.ts` required. |
| `getCursorPosition` | `getCursorPosition(): Promise<{ lineNumber: number; column: number }>` | Get current cursor position. Returns `{lineNumber: 1, column: 1}` if editor is not mounted. | |
| `insertText` | `insertText(text: string): Promise<void>` | Insert text at current cursor position. | |
| `replaceSelection` | `replaceSelection(text: string): Promise<void>` | Replace current selection with text. | |

Planned summary: `{ kind: "TextEditor", editorMounted }`.

#### `GridEditorFacade` -> kind `GridEditor`

Source: `src/renderer/scripting/api-wrapper/GridEditorFacade.ts`  
Types: `src/renderer/api/types/grid-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `rows` | property | All rows as plain objects. | |
| `columns` | property | Column definitions (key and display name). | |
| `rowCount` | property | Number of rows. | |
| `editCell` | `editCell(columnKey: string, rowKey: string, value: unknown): void` | Edit a single cell value. | |
| `addRows` | `addRows(count = 1, insertIndex?: number): unknown[]` | Add new empty rows. Returns the new rows. | |
| `deleteRows` | `deleteRows(rowKeys: string[]): void` | Delete rows by their keys. | `caution`: deletes grid data. |
| `addColumns` | `addColumns(count = 1, insertBeforeKey?: string): Array<{ readonly key: string; readonly name: string }>` | Add new columns. Returns the new column definitions. | |
| `deleteColumns` | `deleteColumns(columnKeys: string[]): void` | Delete columns by their keys. | `caution`: deletes grid data. |
| `setSearch` | `setSearch(text: string): void` | Set search filter text. | |
| `clearSearch` | `clearSearch(): void` | Clear search filter. | |

Planned summary: `{ kind: "GridEditor", rowCount, columns: columns.map(({ key, name }) => ({ key, name })) }`.

#### `NotebookEditorFacade` -> kind `NotebookEditor`

Source: `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts`  
Types: `src/renderer/api/types/notebook-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `notes` | property | All notes (complete data, not filtered by UI). | |
| `categories` | property | All category names. | |
| `tags` | property | All tag names. | |
| `notesCount` | property | Total number of notes. | |
| `addNote` | `addNote(): INote` | Add a new note. Returns the created note. | |
| `deleteNote` | `deleteNote(id: string): void` | Delete a note by ID. | `caution`: deletes notebook data. |
| `updateNoteTitle` | `updateNoteTitle(id: string, title: string): void` | Update a note's title. | |
| `updateNoteContent` | `updateNoteContent(id: string, content: string): void` | Update a note's text content. | |
| `updateNoteCategory` | `updateNoteCategory(id: string, category: string): void` | Update a note's category. | |
| `addNoteTag` | `addNoteTag(id: string, tag: string): void` | Add a tag to a note. | |
| `removeNoteTag` | `removeNoteTag(id: string, tagIndex: number): void` | Remove a tag from a note by index. | |

Planned summary: `{ kind: "NotebookEditor", notesCount, categories, tags }`.

#### `LinkEditorFacade` -> kind `LinkEditor`

Source: `src/renderer/scripting/api-wrapper/LinkEditorFacade.ts`  
Types: `src/renderer/api/types/link-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `links` | property | All links (complete data, not filtered by UI). | |
| `categories` | property | All category names. | |
| `tags` | property | All tag names. | |
| `linksCount` | property | Total number of links. | |
| `addLink` | `addLink(url: string, title?: string, category?: string): void` | Add a new link. | |
| `deleteLink` | `deleteLink(id: string): void` | Delete a link by ID. | `caution`: deletes link data. |
| `updateLink` | `updateLink(id: string, data: { title?: string; category?: string; url?: string }): void` | Update link properties. Map `url` to the link's href. | |

Planned summary: `{ kind: "LinkEditor", linksCount, categories, tags }`.

#### `MarkdownEditorFacade` -> kind `MarkdownEditor`

Source: `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts`  
Types: `src/renderer/api/types/markdown-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `viewMounted` | property | True if the markdown preview container is mounted in the DOM. | |
| `html` | property | The rendered HTML content from the preview container. Empty if view is not mounted. | |

Planned summary: `{ kind: "MarkdownEditor", viewMounted }`.

#### `SvgEditorFacade` -> kind `SvgEditor`

Source: `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts`  
Types: `src/renderer/api/types/svg-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `svg` | property | The SVG source content. | |
| `savePngToFile` | `savePngToFile(filePath: string): Promise<string>` | Rasterise the SVG to PNG (1x scale) and write it to `filePath`. Parent directories are created as needed. Returns the written path. | `caution`: writes a PNG and may overwrite the target. |

Planned summary: `{ kind: "SvgEditor", svgLength: svg.length }`.

#### `HtmlEditorFacade` -> kind `HtmlEditor`

Source: `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts`  
Types: `src/renderer/api/types/html-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `html` | property | The HTML source content. | |

Planned summary: `{ kind: "HtmlEditor", htmlLength: html.length }`.

#### `MermaidEditorFacade` -> kind `MermaidEditor`

Source: `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts`  
Types: `src/renderer/api/types/mermaid-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `svgUrl` | property | Data URL of the rendered SVG diagram. Empty while loading or on error. | |
| `loading` | property | True while the diagram is being rendered. | |
| `error` | property | Error message if rendering failed. Empty on success. | |
| `savePngToFile` | `savePngToFile(filePath: string): Promise<string>` | Render the diagram to PNG (1x scale) and write it to `filePath`. Parent directories are created as needed. Returns the written path. Renders the diagram on demand if it has not been rendered yet. | `caution`: writes a PNG and may overwrite the target. |

Planned summary: `{ kind: "MermaidEditor", loading, error, hasSvg: svgUrl.length > 0 }`.

#### `GraphEditorFacade` -> kind `GraphEditor`

Source: `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts`  
Types: `src/renderer/api/types/graph-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `nodes` | property | All nodes (cleaned, no D3 runtime fields). | |
| `links` | property | All links as `{source, target}` ID pairs. | |
| `nodeCount` | property | Total node count. | |
| `linkCount` | property | Total link count. | |
| `getNode` | `getNode(id: string): GraphNode \| undefined` | Get a single node by ID, or undefined if not found. | |
| `selectedIds` | property | Currently selected node IDs. | |
| `selectedNodes` | property | Currently selected nodes (cleaned). | |
| `select` | `select(ids: string[]): void` | Select nodes by IDs (replaces current selection). Updates the UI. | |
| `addToSelection` | `addToSelection(ids: string[]): void` | Add nodes to current selection. Updates the UI. | |
| `clearSelection` | `clearSelection(): void` | Clear selection. Updates the UI. | |
| `getNeighborIds` | `getNeighborIds(nodeId: string): string[]` | Get direct neighbor IDs from real data links (excludes group membership). Shows the "logical" graph structure regardless of grouping state. | |
| `getVisualNeighborIds` | `getVisualNeighborIds(nodeId: string): string[]` | Get visual neighbor IDs (what user sees in the rendered graph). When grouping is enabled, links may route through group nodes. When grouping is disabled, same as `getNeighborIds()`. | |
| `getGroupOf` | `getGroupOf(nodeId: string): string \| undefined` | Get group ID that a node belongs to, or undefined. | |
| `getGroupMembers` | `getGroupMembers(groupId: string): string[]` | Get direct member IDs of a group node. | |
| `getGroupMembersDeep` | `getGroupMembersDeep(groupId: string): string[]` | Get all member IDs recursively (includes sub-group members). | |
| `getGroupChain` | `getGroupChain(nodeId: string): string[]` | Get the group chain from a node to the top-level group: `[immediateGroup, parentGroup, ...]`. | |
| `isGroup` | `isGroup(nodeId: string): boolean` | Whether a node is a group node. | |
| `search` | `search(query: string, includeHidden = true): IGraphSearchResult[]` | Search nodes by query string (same multi-word AND logic as UI search). Does NOT affect the UI - purely returns results. Searches node labels and all custom properties. | |
| `bfs` | `bfs(startId: string, maxDepth?: number, visual = false): Array<{ id: string; depth: number }>` | BFS traversal from a starting node. Returns nodes in BFS order with their depth from the start. | |
| `getComponents` | `getComponents(): IGraphComponent[]` | Find connected components (disconnected subgraphs). Returns components sorted by size (largest first). Each component includes `rootId` if the graph's root node belongs to it. | |
| `rootNodeId` | property | Current root node ID, or empty string. | |
| `groupingEnabled` | property | Whether grouping is currently enabled. | |

Planned summary: `{ kind: "GraphEditor", nodeCount, linkCount, selectedCount: selectedIds.length, rootNodeId, groupingEnabled }`.

#### `DrawEditorFacade` -> kind `DrawEditor`

Source: `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts`  
Types: `src/renderer/api/types/draw-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `addImage` | `addImage(dataUrl: string, options?: { x?: number; y?: number; maxDimension?: number }): Promise<void>` | Insert an image onto the live canvas. Requires the drawing editor to be mounted (`editorIsMounted === true`). | |
| `exportAsSvg` | `exportAsSvg(): Promise<string>` | Export the drawing as SVG markup string. | |
| `exportAsPng` | `exportAsPng(options?: { scale?: number }): Promise<string>` | Export the drawing as PNG data URL. | |
| `elementCount` | property | Number of elements on the canvas. | |
| `editorIsMounted` | property | Whether the Excalidraw editor is currently mounted. When `true`, `addImage()` works. When `false`, `addImage()` throws. Use `app.pages.addDrawPage()` to create a new page with an image instead. | |

Planned summary: `{ kind: "DrawEditor", elementCount, editorIsMounted }`.

#### `BrowserEditorFacade` -> kind `BrowserEditor`

Source: `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts`  
Types: `src/renderer/api/types/browser-editor.d.ts`

All browser automation methods accept the `.d.ts` `{ tabId?: string }` option unless a different
option shape is shown below. The facade source currently also accepts `slowly?: boolean` and
`submit?: boolean` in `type`; this source capability is recorded in the signature, while the
authoritative JSDoc remains the `.d.ts` wording.

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `url` | property | Current URL of the active tab. | |
| `title` | property | Current page title of the active tab. | |
| `navigate` | `navigate(url: string): void` | Navigate the active tab to a URL. Supports URLs and search queries. | |
| `back` | `back(): void` | Go back in history. | |
| `forward` | `forward(): void` | Go forward in history. | |
| `reload` | `reload(): void` | Reload the current page (or stop loading if in progress). | |
| `tabs` | property | List of all open tabs in this browser page. | |
| `activeTab` | property | The active (visible) tab. | |
| `addTab` | `addTab(url?: string): string` | Open a new tab. Returns the new tab's ID. | |
| `closeTab` | `closeTab(tabId?: string): void` | Close a tab. Defaults to active tab. | `caution`: closes a browser tab. |
| `switchTab` | `switchTab(tabId: string): void` | Switch to a tab (make it active/visible). | |
| `evaluate` | `evaluate(expression: string, options?: { tabId?: string }): Promise<unknown>` | Run JavaScript in the page and return the result. Supports async expressions (awaited automatically). | `caution`: arbitrary page JavaScript can mutate the page. |
| `snapshot` | `snapshot(options?: { tabId?: string }): Promise<string>` | Get an accessibility snapshot of the page as a YAML-like tree. Format matches Playwright MCP's browser_snapshot output. Each interactive element has a ref (e.g., `ref=e52`) usable for targeting. | |
| `getText` | `getText(selector: string, options?: { tabId?: string }): Promise<string \| null>` | Get textContent of an element. Returns null if not found. | |
| `getValue` | `getValue(selector: string, options?: { tabId?: string }): Promise<string \| null>` | Get the value of an input/textarea/select. Returns null if not found. | |
| `getAttribute` | `getAttribute(selector: string, attribute: string, options?: { tabId?: string }): Promise<string \| null>` | Get an attribute value. Returns null if element or attribute not found. | |
| `getHtml` | `getHtml(selector: string, options?: { tabId?: string }): Promise<string \| null>` | Get innerHTML of an element. Returns null if not found. | |
| `exists` | `exists(selector: string, options?: { tabId?: string }): Promise<boolean>` | Check if an element exists on the page. | |
| `click` | `click(selector: string, options?: { tabId?: string }): Promise<void>` | Click an element. Throws if not found. | |
| `type` | `type(selector: string, text: string, options?: { tabId?: string; slowly?: boolean; submit?: boolean }): Promise<void>` | Type text into an input/textarea. Clears existing value first. Dispatches input and change events for framework compatibility. Throws if not found. | `caution`: clears/replaces the target value. |
| `select` | `select(selector: string, value: string, options?: { tabId?: string }): Promise<void>` | Select an option in a `<select>` element by value. Throws if not found. | |
| `check` | `check(selector: string, options?: { tabId?: string }): Promise<void>` | Check a checkbox or radio button. Throws if not found. | |
| `uncheck` | `uncheck(selector: string, options?: { tabId?: string }): Promise<void>` | Uncheck a checkbox. Throws if not found. | |
| `clear` | `clear(selector: string, options?: { tabId?: string }): Promise<void>` | Clear the value of an input/textarea. Throws if not found. | `caution`: clears page input. |
| `waitForSelector` | `waitForSelector(selector: string, options?: { timeout?: number; tabId?: string }): Promise<void>` | Wait for an element matching the selector to appear in the DOM. `options.timeout` is the max wait time in ms (default 30000); `options.tabId` targets a tab (default active tab). | |
| `waitForNavigation` | `waitForNavigation(options?: { timeout?: number; tabId?: string }): Promise<void>` | Wait for the page to finish loading (`document.readyState === "complete"`). For SPA navigations, use `waitForSelector()` instead. `options.timeout` is the max wait time in ms (default 30000); `options.tabId` targets a tab (default active tab). | |
| `wait` | `wait(ms: number): Promise<void>` | Wait for a specified number of milliseconds. | |
| `pressKey` | `pressKey(key: string, options?: { tabId?: string }): Promise<void>` | Press a key or key combination via CDP. Supports compound keys: `"Control+a"`, `"Shift+Enter"`, `"Control+Shift+Delete"`. | |

Planned summary: `{ kind: "BrowserEditor", url, title, tabCount: tabs.length, activeTabId: activeTab.id }`.
The descriptor will not implement `restricted()`; `PageWrapper.restricted()` already applies the
privacy rule before this facade is reached. The summary is only exposed after that page-level
check, so no additional `agent-access.ts` import belongs in this facade.

#### `ImageEditorFacade` -> kind `ImageEditor`

Source: `src/renderer/scripting/api-wrapper/ImageEditorFacade.ts`  
Types: `src/renderer/api/types/image-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `savePngToFile` | `savePngToFile(filePath: string): Promise<string>` | Re-encode the displayed image to PNG (1x scale) and write it to `filePath`. Parent directories are created as needed. Returns the written path. | `caution`: writes a PNG and may overwrite the target. |

Planned summary: `{ kind: "ImageEditor" }`.

#### `McpInspectorFacade` -> kind `McpInspector`

Source: `src/renderer/scripting/api-wrapper/McpInspectorFacade.ts`  
Types: `src/renderer/api/types/mcp-inspector-editor.d.ts`

| Member | Kind / signature | Summary from `.d.ts` | Flags |
|---|---|---|---|
| `connectionStatus` | property | Connection state: `"disconnected"`, `"connecting"`, `"connected"`, `"error"`. | |
| `serverName` | property | Connected server name (empty when disconnected). | |
| `serverTitle` | property | Display-friendly server title (empty if not provided). | |
| `serverVersion` | property | Connected server version (empty when disconnected). | |
| `serverDescription` | property | Short server description (empty if not provided). | |
| `serverWebsiteUrl` | property | Server website URL (empty if not provided). | |
| `instructions` | property | Server instructions received during initialization (empty when disconnected). | |
| `errorMessage` | property | Last error message (empty when no error). | |
| `transportType` | property | Transport type: `"http"` or `"stdio"`. | writable |
| `url` | property | Server URL (for HTTP transport). | writable |
| `command` | property | Command to spawn (for stdio transport). | writable |
| `args` | property | Space-separated arguments (for stdio transport). | writable |
| `connectionName` | property | Display name for the connection. | writable |
| `connect` | `connect(): Promise<void>` | Connect using current parameters. | |
| `disconnect` | `disconnect(): Promise<void>` | Disconnect from the current server. | `caution`: ends the active server connection. |
| `historyCount` | property | Number of recorded request entries. | |
| `history` | property | Array of recorded MCP request/response entries. Each entry has: direction, method, params, result, error, durationMs, timestamp. | |
| `clearHistory` | `clearHistory(): void` | Clear all recorded history. | `caution`: deletes recorded troubleshooting history. |
| `showHistory` | `showHistory(): Promise<void>` | Open history in a new Log View page. | |

Planned summary: `{ kind: "McpInspector", connectionStatus, serverName, historyCount }`.

## Implementation Plan

### 1. Add descriptors beside the facade classes

For each of the thirteen facade files below:

- import the AiVision types directly from `../../../shared/ai-vision/types`;
- add a readonly `const XXX_MEMBERS: readonly IAiMember[]` next to the class, with one entry for
  every member in the verified inventory above;
- add an `XXX_HELP` string whose first sentence tells the agent exactly how to reach the facade,
  including the editor id(s) and whether the `force` argument can switch a compatible page. The
  `<path>.$help` hint is the only place the agent learns this `force` argument, so every help string
  must begin with the corresponding sentence in the table below, before any other guidance;
- change the class declaration to `implements IAiVisible`;
- add `get aiVision(): IAiVisionDescriptor` returning the exact kind from `FACADE_FOR_EDITOR`,
  the one-sentence facade summary, the static members, help, and `summarize()`; and
- omit `children()` because no facade exposes a live AiVision object. Returned arrays and records
  (`rows`, `notes`, `links`, browser `tabs`, graph nodes, MCP history, and export results) are
  plain data, not descriptor-bearing sub-objects.

| File | Class | Kind |
|---|---|---|
| `src/renderer/scripting/api-wrapper/TextEditorFacade.ts` | `TextEditorFacade` | `TextEditor` |
| `src/renderer/scripting/api-wrapper/GridEditorFacade.ts` | `GridEditorFacade` | `GridEditor` |
| `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts` | `NotebookEditorFacade` | `NotebookEditor` |
| `src/renderer/scripting/api-wrapper/LinkEditorFacade.ts` | `LinkEditorFacade` | `LinkEditor` |
| `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts` | `MarkdownEditorFacade` | `MarkdownEditor` |
| `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts` | `SvgEditorFacade` | `SvgEditor` |
| `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` | `HtmlEditorFacade` | `HtmlEditor` |
| `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts` | `MermaidEditorFacade` | `MermaidEditor` |
| `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts` | `GraphEditorFacade` | `GraphEditor` |
| `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts` | `DrawEditorFacade` | `DrawEditor` |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` | `BrowserEditorFacade` | `BrowserEditor` |
| `src/renderer/scripting/api-wrapper/ImageEditorFacade.ts` | `ImageEditorFacade` | `ImageEditor` |
| `src/renderer/scripting/api-wrapper/McpInspectorFacade.ts` | `McpInspectorFacade` | `McpInspector` |

Required opening sentence for each `XXX_HELP` string:

| Kind | Required first sentence |
|---|---|
| `TextEditor` | Obtain via `pages[i].asText()` on a Monaco text page (`monaco`); pass true — `asText(true)` — to switch a compatible page to this editor first. |
| `GridEditor` | Obtain via `pages[i].asGrid()` on a grid page (`grid-json`/`grid-csv`/`grid-jsonl`); pass true — `asGrid(true)` — to switch a compatible page to this editor first. |
| `NotebookEditor` | Obtain via `pages[i].asNotebook()` on a notebook page (`notebook-view`); pass true — `asNotebook(true)` — to switch a compatible page to this editor first. |
| `LinkEditor` | Obtain via `pages[i].asLink()` on a links page (`link-view`); pass true — `asLink(true)` — to switch a compatible page to this editor first. |
| `MarkdownEditor` | Obtain via `pages[i].asMarkdown()` on a markdown preview page (`md-view`); pass true — `asMarkdown(true)` — to switch a compatible page to this editor first. |
| `SvgEditor` | Obtain via `pages[i].asSvg()` on an SVG preview page (`svg-view`); pass true — `asSvg(true)` — to switch a compatible page to this editor first. |
| `HtmlEditor` | Obtain via `pages[i].asHtml()` on an HTML preview page (`html-view`); pass true — `asHtml(true)` — to switch a compatible page to this editor first. |
| `MermaidEditor` | Obtain via `pages[i].asMermaid()` on a Mermaid preview page (`mermaid-view`); pass true — `asMermaid(true)` — to switch a compatible page to this editor first. |
| `GraphEditor` | Obtain via `pages[i].asGraph()` on a graph page (`graph-view`); pass true — `asGraph(true)` — to switch a compatible page to this editor first. |
| `DrawEditor` | Obtain via `pages[i].asDraw()` on a drawing page (`draw-view`); pass true — `asDraw(true)` — to switch a compatible page to this editor first. |
| `BrowserEditor` | Obtain via `pages[i].asBrowser()` on a browser page (`browser-view`); this facade has no force argument and cannot switch a page to this editor. |
| `ImageEditor` | Obtain via `pages[i].asImage()` on an image page (`image-view`); this facade has no force argument and cannot switch a page to this editor. |
| `McpInspector` | Obtain via `pages[i].asMcpInspector()` on an MCP Inspector page (`mcp-view`); this facade has no force argument and cannot switch a page to this editor. |

### 2. Keep the implementation shape co-located and side-effect safe

Representative before/after shape for `GridEditorFacade.ts`:

Before:

```ts
import type { GridEditor } from "../../editors/grid/GridEditor";

export class GridEditorFacade {
    constructor(private readonly editor: GridEditor) {}

    get rows(): unknown[] { return this.editor.getRows(); }
    // ...public grid members...
}
```

After:

```ts
import type { GridEditor } from "../../editors/grid/GridEditor";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const GRID_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "rows", kind: "property", summary: "All rows as plain objects." },
    { name: "addRows", kind: "method", signature: "addRows(count = 1, insertIndex?: number)", summary: "Add new empty rows. Returns the new rows." },
    // ...the remaining verified members, including caution entries...
];

const GRID_EDITOR_HELP = `
Obtain via pages[i].asGrid() on a grid page (grid-json/grid-csv/grid-jsonl); pass true — asGrid(true) — to switch a compatible page to this editor first.
Grid data manipulation for JSON, CSV, and JSONL pages. Use rows/columns for reads and
editCell/addRows/addColumns for changes; delete operations are destructive.
`;

export class GridEditorFacade implements IAiVisible {
    constructor(private readonly editor: GridEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "GridEditor",
            summary: "Grid data manipulation facade.",
            members: GRID_EDITOR_MEMBERS,
            help: GRID_EDITOR_HELP,
            summarize: () => ({
                kind: "GridEditor",
                rowCount: this.rowCount,
                columns: this.columns,
            }),
        };
    }
}
```

The actual implementation must retain all existing facade members and behavior. The snippet is a
shape example, not code to copy verbatim over the existing class bodies.

### 3. Resolve source/typing discrepancies without changing `.d.ts` files

- Use `setHighlightText(text?: string)` in the descriptor signature because that is the callable
  facade source signature; retain the authoritative `.d.ts` summary. Do not broaden the task into
  changing `text-editor.d.ts`.
- Use the actual browser `type` source options (`tabId`, `slowly`, and `submit`) in the descriptor
  signature, while retaining the `.d.ts` JSDoc summary. Do not change `browser-editor.d.ts` in
  US-1291.
- Make `BrowserEditorFacade.cdp()` private because it is only an internal implementation helper,
  is not in `IBrowserEditor`, and exposes an undecorated internal `CdpSession`. The only external
  `.cdp(` callers are `src/renderer/automation/commands.ts` (lines 187, 214, 219, and 233), plus
  `src/renderer/automation/AppTargetModel.ts:53`; those calls are on an `IBrowserTarget` or
  `AppTargetModel`, never on `BrowserEditorFacade`, so this visibility change breaks nothing. Do
  not add it to `BROWSER_EDITOR_MEMBERS`.

### 4. Verify the discovery path and summaries

After descriptors exist, exercise the core resolver with a live grid page and verify:

1. `PageWrapper.aiVision.children()` emits `.asGrid()` with kind `GridEditor` when the current
   editor id is `grid-json`, `grid-csv`, or `grid-jsonl`.
2. `joinChildPath()` builds `pages[i].asGrid()` from the page child segment.
3. `help-search.ts` `stepTo()` parses `.asGrid()` by stripping the leading dot, recognizing the
   `asGrid` call, invoking it with no arguments, awaiting the returned facade, and continuing to
   its descriptor.
4. `helpSearch("add rows")` returns a live instance hit whose path is
   `pages[i].asGrid().addRows()` (the current `collectKindHits()` implementation adds `()` to
   method hit paths), with the `addRows` summary/signature. This is the callable equivalent of the
   epic's shorthand `pages[i].asGrid().addRows` example.
5. Through the `call` MCP tool, invoke `pages[i].asGrid().addRows` with `args: [1]` on a grid page
   and confirm it reaches the existing facade method and returns the added row result; invoke the
   root call with `path: "helpSearch"` and `args: ["add rows"]`, and confirm it returns the same
   live callable path.
6. On a page whose editor is not a grid, invoke `call` on `pages[i].asGrid()` and confirm it
   returns the facade's existing error text (not a crash), together with the Page hint.
7. The search walk and all descriptor `summarize()`/`children()` reads do not create a grouped
   page or otherwise invoke arbitrary facade getters.

No `help-search.ts` change is currently planned: `stepTo()` already handles the `.asGrid()` call
segment. If live verification contradicts this static result, the smallest follow-up is to fix
only `src/shared/ai-vision/help-search.ts` and re-verify live via the `call` tool; that is not an
assumed change in this task document.

### 5. Validate implementation completeness

- Compare every `XXX_MEMBERS` entry against both its facade source and matching `.d.ts` interface.
- Confirm all destructive operations have `caution`, all writable MCP inspector properties have
  `writable: true`, and no large content is embedded in `summarize()`.
- Confirm the thirteen kind strings exactly match `FACADE_FOR_EDITOR` in
  `src/renderer/scripting/api-wrapper/PageWrapper.ts`.
- Run the repository's TypeScript/lint checks required by the implementation workflow and test the
  `call`/`helpSearch` path against a live page.

## Concerns

### Resolved during investigation

- **Does `helpSearch` understand `.asGrid()`?** Yes. `src/shared/ai-vision/path-parser.ts` accepts
  `asGrid()` as a call segment; `joinChildPath()` preserves a child segment beginning with `.`;
  `help-search.ts:stepTo()` parses and invokes the call, awaiting its result. No core change is
  needed merely to traverse the segment.
- **Do helper objects need descriptors?** No for this task. `Grid`, `Markdown`, `Mermaid`, and
  `Text` are `UiFacade` output builders, not return values of the editor facades or children of
  `PageWrapper`.
- **Does BrowserEditorFacade need a privacy guard?** No. `PageWrapper.aiVision.restricted()`
  calls the existing `agent-access.ts` rule before the browser child can resolve. Adding another
  guard in the facade would duplicate the policy and could drift from browser MCP commands.
- **Should facade `children()` enumerate data arrays?** No. Rows, notes, links, tabs, graph
  records, and history entries are plain snapshots rather than live AiVision objects, so exposing
  them as children would create paths the resolver cannot describe safely.

### Items the implementation must preserve

- `PageWrapper` must continue to use the exact existing kind names and child segments; do not
  rename them to friendlier editor labels.
- `summarize()` must not return raw SVG/HTML, Mermaid data URLs, browser page contents, graph node
  arrays, or MCP history. Those remain explicit member reads.
- Browser privacy remains page-scoped. An agent-opened private browser page may resolve the facade
  under the existing provenance rule; a user-owned private page remains listed but blocked.
- The two typing mismatches are documented above. Descriptor signatures must describe what the
  facade source actually accepts, while one-line prose continues to reuse the matching `.d.ts`
  JSDoc.

## Acceptance Criteria

- [x] All thirteen listed facade classes implement `IAiVisible` and expose `get aiVision()`.
- [x] Every facade file contains its own readonly `XXX_MEMBERS` and `XXX_HELP` declarations.
- [x] Every `XXX_HELP` string opens with the exact reachability guidance for its facade, including
      required editor ids and the `force` argument (`asX(true)`) where supported; this is the only
      `$help` guidance for that argument.
- [x] Descriptor kinds exactly match `FACADE_FOR_EDITOR`: `TextEditor`, `GridEditor`,
      `NotebookEditor`, `LinkEditor`, `MarkdownEditor`, `SvgEditor`, `HtmlEditor`,
      `MermaidEditor`, `GraphEditor`, `DrawEditor`, `BrowserEditor`, `McpInspector`, and
      `ImageEditor`.
- [x] Every public script member listed in the verified inventory appears exactly once with a
      one-line `.d.ts`-based summary and method signature; source-only `cdp()` is private and is
      not exposed.
- [x] Destructive members carry `caution`; writable properties carry `writable: true`.
- [x] Every facade has a compact JSON `summarize()` result; no facade adds `children()` for plain
      data snapshots.
- [x] `BrowserEditorFacade` contains no additional privacy guard; private-page enforcement remains
      in `PageWrapper.restricted()` / `src/renderer/editors/browser/agent-access.ts`.
- [ ] `helpSearch("add rows")` reaches a live grid facade through
      `pages[i].asGrid()` and returns the `addRows` member hit without a `help-search.ts` fix.
- [ ] The live `call` check invokes `pages[i].asGrid().addRows` with `args: [1]`, invokes root
      `helpSearch("add rows")`, and confirms both results.
- [ ] The live `call` check on `pages[i].asGrid()` for a non-grid page returns the facade's existing
      error text with the Page hint and does not crash.
- [ ] Descriptor/help/member discovery is side-effect free, including not creating `grouped` pages.
- [ ] TypeScript and lint checks pass after implementation, and the implementation is reviewed
      before the epic is completed.

## Files Changed Summary

| File | Current status | Planned change |
|---|---|---|
| `doc/tasks/US-1291-facade-descriptors/README.md` | New in this task-document pass | Record the verified implementation plan and acceptance criteria. |
| `src/renderer/scripting/api-wrapper/TextEditorFacade.ts` | No implementation change yet | Add `TextEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/GridEditorFacade.ts` | No implementation change yet | Add `GridEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts` | No implementation change yet | Add `NotebookEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/LinkEditorFacade.ts` | No implementation change yet | Add `LinkEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts` | No implementation change yet | Add `MarkdownEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts` | No implementation change yet | Add `SvgEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` | No implementation change yet | Add `HtmlEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts` | No implementation change yet | Add `MermaidEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts` | No implementation change yet | Add `GraphEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts` | No implementation change yet | Add `DrawEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` | No implementation change yet | Add `BrowserEditor` members/help/descriptor/summary; make `cdp()` private; add no privacy guard. |
| `src/renderer/scripting/api-wrapper/ImageEditorFacade.ts` | No implementation change yet | Add `ImageEditor` members/help/descriptor/summary. |
| `src/renderer/scripting/api-wrapper/McpInspectorFacade.ts` | No implementation change yet | Add `McpInspector` members/help/descriptor/summary. |

### Files verified and intentionally requiring no US-1291 change

| File | Reason |
|---|---|
| `src/shared/ai-vision/types.ts` | US-1289 already defines the required shared interfaces. |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | Existing reviewed descriptor pattern; no facade changes are needed here. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Existing reviewed `FACADE_FOR_EDITOR`, `children()`, and privacy implementation already point to the required kinds. |
| `src/shared/ai-vision/path-parser.ts` | Already parses `.asGrid()` call segments. |
| `src/shared/ai-vision/help-search.ts` | `stepTo()` already invokes and awaits `.asGrid()`; verification is required, but no change is currently indicated. |
| `src/renderer/scripting/api-wrapper/Grid.ts` | Helper is returned by `UiFacade`, not an editor facade. |
| `src/renderer/scripting/api-wrapper/Markdown.ts` | Helper is returned by `UiFacade`, not an editor facade. |
| `src/renderer/scripting/api-wrapper/Mermaid.ts` | Helper is returned by `UiFacade`, not an editor facade. |
| `src/renderer/scripting/api-wrapper/Text.ts` | Helper is returned by `UiFacade`, not an editor facade. |
| `src/renderer/api/types/*.d.ts` matching editor interfaces | Existing JSDoc is authoritative for member summaries; US-1291 does not alter the public type declarations. |
| `src/renderer/editors/browser/agent-access.ts` | Existing browser privacy/provenance policy is reused by `PageWrapper`; no facade guard is needed. |
