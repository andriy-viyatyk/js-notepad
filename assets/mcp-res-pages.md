# Pages & Windows

Persephone uses tabbed pages (like browser tabs). Each page has an editor and, where the editor
supports one, a **`language`** — which throughout Persephone means the **Monaco
syntax-highlighting mode** (`javascript`, `json`, `python`, …), never a UI locale or a spoken
language. Editors that are not text editors (grids, notebooks, browser, boards, app pages) have
none, and `list_pages` reports theirs as empty or absent.

## Reading Page Content

`get_page_content` (and `get_active_page`) adapt to the page type:

- **Text-based pages** (monaco, markdown, grid, notebook, mermaid, svg, …) return `{ id, title, content }` — the source text.
- **Image pages** (`image-view`, e.g. screen snips or opened image files) return the rendered PNG **as an image block in the tool result** — you see the picture directly. Works for background (non-active) pages too. Very large images degrade to a hint pointing at `page.asImage().savePngToFile(path)`.
- **Other non-text pages** (browser, board, video, PDF, …) return `{ id, title, hint }` — a one-line pointer to the right tool (`browser_*`, `execute_script` facades, or the file path from `list_pages`).

## Automating Persephone's Own UI

The `browser_*` tools can drive Persephone's own window — not just web pages and boards. Pass `pageId: "app"` to any `browser_*` tool to see and interact with the app UI itself: the tab strip, sidebar panels, toolbars, dialogs, and the active editor. This lets you help the user with Persephone's interface directly (find a setting, click through a flow, reproduce a UI issue).

```
browser_snapshot({ pageId: "app" })                       // accessibility tree of the app window
browser_click({ pageId: "app", ref: "e42" })              // click a tab, button, tree item…
browser_type({ pageId: "app", ref: "e88", text: "…" })    // type into a dialog / search field
browser_press_key({ pageId: "app", key: "Escape" })       // e.g. dismiss a menu
browser_take_screenshot({ pageId: "app" })                // pixels of the app window
```

- **What you see:** the snapshot contains the app chrome plus the **active** page only — inactive pages are hidden, regardless of how many tabs are open. To reach another page, click its tab in the snapshot to activate it.
- **What's not supported:** navigation (`browser_navigate`/`browser_navigate_back`) and tab management (`browser_tabs`) throw — the app window is not a browser. To open or switch Persephone pages, use `list_pages` + `execute_script` (`app.pages`).
- **Editing content:** prefer `set_page_content` / `execute_script` over typing into the editor — synthetic typing into Monaco is unreliable. `browser_type` is for simple inputs (dialogs, search boxes, settings fields).
- Combine with `windowIndex` to target a specific window's UI.

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

The exact resolution algorithm (including how board pages participate and why an untargeted call can land on a board) is in `read_guide("browser")` → "Page targeting resolution". Rule of thumb: **always pass `pageId` when you care which page you hit** — the active page can change between your calls (the user, or another agent on the same Persephone, can switch tabs).

### Opening a URL in a profile

`open_url` reuse is profile-matched: with `profileName` it adds the tab to (and focuses) an existing page of that profile, or creates a new page with that profile — it never attaches to a different-profile page.

```
open_url({ url: "https://outlook.com", profileName: "work" })
→ { "opened": "https://outlook.com", "pageId": "abc-123", "title": "Outlook" }
```

`open_url` focuses the target page and returns its `pageId` — capture it and pass it to
subsequent `browser_*` calls instead of relying on the active-page default.

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

**Creatable with `create_page`** (content-hosting editors — see the table below for the
required `language` and title suffix):

`"monaco"` · `"grid-json"` · `"grid-csv"` · `"grid-jsonl"` · `"md-view"` · `"notebook-view"` · `"link-view"` · `"graph-view"` · `"draw-view"` · `"svg-view"` · `"html-view"` · `"mermaid-view"` · `"log-view"` · `"rest-client"`

**Standalone editors** — `create_page` rejects these with a hint; open them the way listed:

| Editor | What it is | How to open |
|--------|------------|-------------|
| `browser-view` | Built-in web browser | `open_url` tool |
| `board-view` | A Board (your mini web-app) | `open_board` tool |
| `image-view` / `archive-view` / `video-view` | File viewers | `execute_script`: `await app.pages.openFile(path)` |
| `mcp-view` | MCP Inspector | `execute_script`: `await app.pages.showMcpInspectorPage()` |
| `about-view` / `settings-view` | App pages | `execute_script`: `showAboutPage()` / `showSettingsPage()` |
| `category-view`, `tools-hub-view`, `toolset-view`, `board-info`, `file-diff`, `env-vars-view`, and other ids you may see in `list_pages` | Internal app views | Opened by the app itself — read them, don't create them |

### Creating Pages with Specialized Editors

**CRITICAL: Each non-monaco editor REQUIRES a specific `language` parameter. Using the wrong language (e.g., `language: "plaintext"` with `editor: "md-view"`) will result in broken rendering — the page will appear empty or display raw text instead of rendered content.**

| Editor | Required `language` | Title suffix | Example |
|--------|-------------------|------------------------|---------|
| `monaco` (default) | any (`plaintext`, `javascript`, `json`, etc.) | — | `"script.js"` |
| `md-view` | **`markdown`** | — | `"README.md"` |
| `grid-json` | **`json`** | `.grid.json` (optional) | `"Data.grid.json"` or `"Data"` |
| `grid-csv` | **`csv`** | — | `"Data"` |
| `notebook-view` | **`json`** | `.note.json` (**required**) | `"My Notes.note.json"` |
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
- **Notebook:** Read `persephone://guides/notebook` for NoteItem format. Empty: `{"notes":[],"state":{}}`
- **Links:** Read `persephone://guides/links` for LinkItem format. Empty: `{"links":[],"state":{}}`
- **Graph:** Read `persephone://guides/graph` for node/link format. Empty: `{"nodes":[],"links":[],"options":{}}`
- **Rest Client:** Empty: `{"type":"rest-client","requests":[]}`

### Graph Editor Format (`graph-view`)

The graph editor renders an interactive force-directed graph. The full data format (node/link
properties, options and their defaults, group nodes, legend) and the `page.asGraph()` scripting
API live in **`read_guide("graph")`** — read it before creating or editing graph pages. The
minimum you need here: content is JSON with `"type": "force-graph"`, `nodes`, `links`, and
`options`; the empty page is `{"type":"force-graph","nodes":[],"links":[],"options":{}}`; the
`.fg.json` title suffix enables the JSON/Graph editor switch.

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

## Errors & verification

What failures actually look like, and how to check your work (verified against the app):

- **`create_page` does NOT validate content.** Creating a structured-editor page (notebook,
  links, graph, rest-client) with broken content returns a normal `{ id, title }` success — the
  failure happens at render time, in the editor:
  - **Unparseable JSON** → the editor shows a parse error in place of content (e.g.
    `Unexpected token 'h', "this is not"… is not valid JSON`).
  - **Valid JSON with a missing required field** → the editor **crashes** into an error
    boundary: the page shows `Editor crashed` with the exception (e.g.
    `TypeError: note.tags is not iterable`) and a stack trace.
- **`get_page_content` is not a validity check** — it returns the raw content you sent,
  byte-for-byte, whether or not the editor can render it. Use it to verify *what* the page
  holds, not *whether* it renders.
- **To verify rendering**, snapshot the app window: `browser_snapshot({ pageId: "app" })` shows
  the active page's UI — a healthy editor shows its content tree; a broken one shows the parse
  error text or `Editor crashed`. (Activate the page first if it isn't active.)
- **Cheapest prevention**: `JSON.parse` your content yourself before `create_page` /
  `set_page_content`, and read the format guide (`notebook` / `links` / `graph`) — the required
  fields are exactly the ones that crash when missing.
- **Wrong `editor` id** → `create_page` errors with `Unknown editor '…'. Valid editors: …`.
  A standalone editor id (e.g. `browser-view`) errors with a hint telling you the right tool.
- **`Page not found: <id>`** — the page was closed since you got the id; call `list_pages`.
- **Every tool result is authoritative** — if `create_page` returned an error, no page was
  created; there is nothing to clean up.
