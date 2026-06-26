# Pages & Windows

Persephone uses tabbed pages (like browser tabs). Each page has an editor and (when file-backed) a language.

## Multi-Window Support

Persephone supports multiple windows. Each window has a stable `windowIndex` (starting from 0) and its own set of pages.

### Discovering Windows

Use `list_windows` to see all windows and their status:

```json
[
  { "windowIndex": 0, "status": "open", "pageCount": 3, "activePageId": "abc", "pages": [...] },
  { "windowIndex": 1, "status": "closed", "pageCount": 2, "activePageId": "def", "pages": [...] }
]
```

- **open** — window is visible and running
- **closed** — window was closed but its pages are persisted (e.g. had unsaved changes)

### Targeting a Window

All tools accept an optional `windowIndex` parameter:

```
execute_script({ script: "page.content", windowIndex: 1 })
list_pages({ windowIndex: 0 })
create_page({ title: "Notes", windowIndex: 1 })
```

If `windowIndex` is omitted, the first open window is used (backward compatible).

### Reopening Closed Windows

Closed windows cannot be targeted directly by other tools. Use `open_window` to reopen them first:

```
open_window({ windowIndex: 1 })  // Reopens window 1 with its persisted pages
```

After reopening, you can target the window with any tool using `windowIndex`.

## Browser Profiles

Persephone's built-in browser groups pages by **profile** — each profile is an isolated cookie/login session (separate cookies, storage, and cache). Only the profile that holds a site's authenticated session can act on that site; using the wrong-profile page silently fails (not logged in).

### Profile fields on browser pages

`list_pages`, `get_active_page`, and `list_windows` expose profile identity for `browser-view` pages:

| Field | Description |
|-------|-------------|
| `profileName` | Profile name. `""` = the built-in default profile. |
| `isIncognito` | `true` for incognito sessions (no cookies/history). |
| `isTor` | `true` for Tor browsing sessions. |
| `url` | The **active tab's** URL. A browser page hosts multiple internal tabs — use `browser_tabs` with `action: "list"` to enumerate them all. Omitted for incognito/Tor pages (privacy). `list_windows` does not include `url`. |

### Discovering configured profiles

`get_app_info` returns the configured profile names and the default:

```json
{ "version": "4.0.3", "pageCount": 2, "activePageId": "abc",
  "browserProfiles": ["work", "personal"], "defaultBrowserProfile": "work" }
```

### Targeting a profile

Every `browser_*` tool accepts optional `profileName` and `pageId` parameters:

- **`profileName`** — acts on the browser page of that profile (`""` = default profile). Prefers the active page if it matches, otherwise the first such page. Never matches incognito/Tor pages.
- **`pageId`** — targets an exact browser page (from `list_pages`). Takes precedence over `profileName`. Use it to disambiguate when several pages share a profile.
- Omit both to act on the active browser page (or the first one).

```
browser_snapshot({ profileName: "work" })
browser_click({ pageId: "abc", ref: "e12" })
```

Targeting **focuses** (activates) the resolved page — the page content must be visible for input. A useful side effect: subsequent untargeted calls stick to the now-active page.

### Opening a URL in a profile

`open_url` reuse is profile-matched: with `profileName` it adds the tab to (and focuses) an existing page of that profile, or creates a new page with that profile — it never attaches to a different-profile page.

```
open_url({ url: "https://outlook.com", profileName: "work" })
```

### Privacy

Incognito and Tor pages are **never automatable**: they are never matched by `profileName`, a direct `pageId` at one still gets a privacy-refusal error, and their `url` is never exposed.

## The `page` Object

The current page (tab). Available as a global in scripts.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique page identifier (read-only) |
| `title` | `string` | Display title (read-only) |
| `content` | `string` | Text content (**read/write**) |
| `language` | `string` | Language ID, e.g. `"json"`, `"typescript"` (**read/write**) |
| `editor` | `string` | Editor type, e.g. `"monaco"`, `"grid-json"` (**read/write**) |
| `filePath` | `string?` | File path if backed by a file (read-only) |
| `modified` | `boolean` | Has unsaved changes (read-only) |
| `data` | `object` | In-memory storage, persists across script runs |
| `grouped` | `IPage` | Grouped (side-by-side) partner page — auto-creates if none exists |

### Editor Types

`"monaco"` · `"grid-json"` · `"grid-csv"` · `"grid-jsonl"` · `"md-view"` · `"notebook-view"` · `"todo-view"` · `"link-view"` · `"graph-view"` · `"draw-view"` · `"svg-view"` · `"html-view"` · `"mermaid-view"` · `"log-view"` · `"rest-client"` · `"pdf-view"` · `"image-view"` · `"browser-view"` · `"archive-view"` · `"category-view"` · `"about-view"` · `"settings-view"` · `"mcp-view"`

### Creating Pages with Specialized Editors

**CRITICAL: Each non-monaco editor REQUIRES a specific `language` parameter. Using the wrong language (e.g., `language: "plaintext"` with `editor: "md-view"`) will result in broken rendering — the page will appear empty or display raw text instead of rendered content.**

| Editor | Required `language` | Title suffix | Example |
|--------|-------------------|------------------------|---------|
| `monaco` (default) | any (`plaintext`, `javascript`, `json`, etc.) | — | `"script.js"` |
| `md-view` | **`markdown`** | — | `"README.md"` |
| `grid-json` | **`json`** | `.grid.json` (optional) | `"Data.grid.json"` or `"Data"` |
| `grid-csv` | **`csv`** | — | `"Data"` |
| `notebook-view` | **`json`** | `.note.json` (**required**) | `"My Notes.note.json"` |
| `todo-view` | **`json`** | `.todo.json` (**required**) | `"Tasks.todo.json"` |
| `link-view` | **`json`** | `.link.json` (**required**) | `"Bookmarks.link.json"` |
| `svg-view` | **`xml`** | `.svg` (**required**) | `"Logo.svg"` |
| `html-view` | **`html`** | — | `"Page.html"` |
| `graph-view` | **`json`** | `.fg.json` (**required**) | `"Network.fg.json"` |
| `draw-view` | **`json`** | `.excalidraw` (**required**) | `"Sketch.excalidraw"` |
| `mermaid-view` | **`mermaid`** | — | `"Diagram"` |
| `grid-jsonl` | **`jsonl`** | — | `"Logs"` |
| `log-view` | **`jsonl`** | `.log.jsonl` (optional) | `"Output.log.jsonl"` |
| `rest-client` | **`json`** | `.rest.json` (**required**) | `"API Collection.rest.json"` |

**Common mistake:** `create_page({ editor: "md-view", language: "plaintext", ... })` — this creates a broken page. Use `language: "markdown"` with `md-view`.

**Title suffix:** Suffixes marked **required** are needed for the editor switch buttons to appear (e.g., XML/Preview toggle for SVG, JSON/Graph toggle for graphs). Without the suffix, the page renders but the user cannot switch between editor modes.

**Initial content:** Structured editors expect valid JSON content on creation. **Read the dedicated resource guide BEFORE creating pages with these editors** — incorrect JSON will crash the editor:
- **Notebook:** Read `notepad://guides/notebook` for NoteItem format. Empty: `{"notes":[],"state":{}}`
- **Todo:** Read `notepad://guides/todo` for TodoItem format. Empty: `{"lists":[],"tags":[],"items":[],"state":{}}`
- **Links:** Read `notepad://guides/links` for LinkItem format. Empty: `{"links":[],"state":{}}`
- **Graph:** Read `notepad://guides/graph` for node/link format. Empty: `{"nodes":[],"links":[],"options":{}}`
- **Rest Client:** Empty: `{"type":"rest-client","requests":[]}`

### Graph Editor Format (`graph-view`)

The graph editor renders an interactive force-directed graph. Content is JSON with this structure:

```json
{
  "type": "force-graph",
  "nodes": [
    { "id": "server", "title": "API Server", "level": 1, "shape": "hexagon" },
    { "id": "db", "title": "Database", "level": 2, "shape": "square" },
    { "id": "cache", "title": "Redis Cache", "level": 3 },
    { "id": "client", "title": "Web Client", "level": 2, "shape": "diamond", "team": "frontend" }
  ],
  "links": [
    { "source": "client", "target": "server" },
    { "source": "server", "target": "db" },
    { "source": "server", "target": "cache" }
  ],
  "options": {
    "rootNode": "server",
    "expandDepth": 3,
    "maxVisible": 500
  }
}
```

**Node properties:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | string (required) | Unique node identifier, used in links |
| `title` | string | Display label (falls back to `id` if omitted) |
| `level` | number (1-5) | Hierarchy level — controls node size (1=largest, 5=smallest) |
| `shape` | string | `"circle"` (default), `"square"`, `"diamond"`, `"triangle"`, `"star"`, `"hexagon"` |
| *custom* | any | Any additional properties are preserved and displayed in the detail panel |

**Link properties:**

| Property | Type | Description |
|----------|------|-------------|
| `source` | string (required) | Source node `id` |
| `target` | string (required) | Target node `id` |

**Options:**

| Property | Type | Description |
|----------|------|-------------|
| `rootNode` | string | Root node ID — BFS expansion starts here |
| `expandDepth` | number | How many hops from root to show initially (default: show all) |
| `maxVisible` | number | Hard ceiling on visible nodes (default 500) — use for large graphs |
| `charge` | number | Repulsion force between nodes (default -70) |
| `linkDistance` | number | Desired link length in pixels (default 40) |
| `collide` | number | Collision radius multiplier (default 0.7) |

**Tips for generating graphs:**
- Always include `"type": "force-graph"` for content detection
- Use `level` to visually distinguish node importance (1=central/important, 5=leaf/minor)
- Use `shape` to encode node categories (e.g., hexagons for services, squares for databases)
- Add custom properties for metadata (e.g., `"team"`, `"status"`, `"url"`) — they appear in the detail panel
- For large graphs (>200 nodes), set `rootNode` and `expandDepth` to avoid overwhelming the view
- Title suffix `.fg.json` ensures the graph editor opens by default and shows the JSON/Graph switch

### Rest Client Format (`rest-client`)

The Rest Client editor displays a collection of HTTP requests organized in collections. Content is JSON:

```json
{
  "type": "rest-client",
  "requests": [
    {
      "id": "unique-id-1",
      "name": "Get Users",
      "collection": "User API",
      "method": "GET",
      "url": "https://api.example.com/users",
      "headers": [
        { "key": "Authorization", "value": "Bearer token123", "enabled": true },
        { "key": "Accept", "value": "application/json", "enabled": true }
      ],
      "body": "",
      "bodyType": "none",
      "bodyLanguage": "plaintext",
      "formData": []
    },
    {
      "id": "unique-id-2",
      "name": "Create User",
      "collection": "User API",
      "method": "POST",
      "url": "https://api.example.com/users",
      "headers": [
        { "key": "Content-Type", "value": "application/json", "enabled": true }
      ],
      "body": "{ \"name\": \"John\", \"email\": \"john@example.com\" }",
      "bodyType": "raw",
      "bodyLanguage": "json",
      "formData": []
    }
  ]
}
```

**Request properties:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | string (required) | Unique identifier (use `crypto.randomUUID()` or any unique string) |
| `name` | string | Display name (empty string allowed — shows as italic "(empty)") |
| `collection` | string | Collection group name (empty string = ungrouped) |
| `method` | string | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `url` | string | Request URL |
| `headers` | array | Array of `{ key, value, enabled }` objects |
| `body` | string | Request body text (used when `bodyType` is `"raw"`) |
| `bodyType` | string | `"none"`, `"raw"`, or `"form-urlencoded"` |
| `bodyLanguage` | string | Language for raw body: `"plaintext"`, `"json"`, `"javascript"`, `"html"`, `"xml"` |
| `formData` | array | Array of `{ key, value, enabled }` for form-urlencoded body |

**Tips for generating Rest Client pages:**
- Always include `"type": "rest-client"` for content detection
- Generate unique `id` values for each request (e.g., `"req-1"`, `"req-2"`)
- Use `collection` to group related requests (e.g., `"Auth"`, `"Users"`, `"Products"`)
- Set `bodyType: "raw"` + `bodyLanguage: "json"` for JSON request bodies
- Set `bodyType: "form-urlencoded"` and populate `formData` for form submissions
- Title suffix `.rest.json` is **required** for the editor to activate
- Scripts can use `app.fetch(url, options)` to execute HTTP requests directly — no need to go through the editor

## Grouped Pages (Script Output)

When a script runs, the **return value** is written to a grouped (side-by-side) output page. You can configure the output page:

```javascript
// Return value becomes the output content
const data = JSON.parse(page.content);
page.grouped.language = "json";
page.grouped.editor = "grid-json";
return data.filter(item => item.active);
```

Access `page.grouped` to auto-create a grouped page. Set `page.grouped.language` and `page.grouped.editor` before returning.
