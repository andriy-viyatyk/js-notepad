# Pages & Windows

Persephone uses tabbed pages (like browser tabs). Each page has an editor and, where the editor
supports one, a **`language`** — which throughout Persephone means the **Monaco
syntax-highlighting mode** (`javascript`, `json`, `python`, …), never a UI locale or a spoken
language. Editors that are not text editors (grids, notebooks, browser, boards, app pages) have
none, and `call` at `pages` reports theirs as empty or absent.

## Reading Page Content

`pages[i].content` and the page's editor facade adapt to the page type:

- **Text-based pages** (monaco, markdown, grid, notebook, mermaid, svg, …) return `{ id, title, content }` — the source text.
- **Image pages** (`image-view`, e.g. screen snips or opened image files) return the rendered PNG **as an image block in the tool result** — you see the picture directly. Works for background (non-active) pages too. Very large images degrade to a hint pointing at `page.editor.savePngToFile(path)`.
- **Other non-text pages** (browser, board, video, PDF, …) expose their live behavior through
  `pages[i].editor`, `window.screen`, or the relevant `script.execute` facade.

## Automating Persephone's Own UI

`window.screen` drives Persephone's own window — not just web pages and boards. Use it to see and
interact with the app UI itself: the tab strip, sidebar panels, toolbars, dialogs, and the active
editor. This lets you help the user with Persephone's interface directly (find a setting, click
through a flow, reproduce a UI issue).

```
window.screen.snapshot()                                    // accessibility tree of the app window
window.screen.click({ ref: "e42" })                         // click a tab, button, tree item…
window.screen.type({ ref: "e88" }, "…")                    // type into a dialog / search field
window.screen.pressKey("Escape")                            // e.g. dismiss a menu
window.screen.screenshot()                                  // pixels of the app window
```

- **What you see:** the snapshot contains the app chrome plus the **active** page only — inactive pages are hidden, regardless of how many tabs are open. To reach another page, click its tab in the snapshot to activate it.
- **What's not supported:** browser navigation and browser inner-tab management — the app window is
  not a browser. To open or switch Persephone pages, use `pages.openUrl`, `pages.showPage`, or
  the page methods.
- **Editing content:** prefer assigning `value` to `pages[i].content` or using `script.execute` over typing into the editor —
  synthetic typing into Monaco is unreliable. `window.screen.type` is for simple inputs (dialogs,
  search boxes, settings fields).
- Combine with `windows[i].window.screen` to target a specific window's UI.

## Multi-Window Support

Persephone supports multiple windows. Each window has a stable `windowIndex` (starting from 0) and its own set of pages.

### Discovering Windows

Use `call` at `windows` to see all windows and their status:

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
call({ path: "windows[1].pages[0].content" })
call({ path: "windows[0].pages" })
call({ path: "windows[1].pages.addEditorPage", args: [{ title: "Notes" }] })
```

If `windowIndex` is omitted, the first open window is used (backward compatible).

### Reopening Closed Windows

Closed windows cannot be targeted directly by other calls. Use the window's `open` member to reopen them first:

```
call({ path: "windows[1].open" })  // Reopens window 1 with its persisted pages
```

After reopening, you can target the window with any tool using `windowIndex`.

## Browser Profiles

Persephone's built-in browser groups pages by **profile** — each profile is an isolated cookie/login session (separate cookies, storage, and cache). Only the profile that holds a site's authenticated session can act on that site; using the wrong-profile page silently fails (not logged in).

### Profile fields on browser pages

`pages`, `windows`, and the browser page descriptors expose profile identity for `browser-view` pages:

| Field | Description |
|-------|-------------|
| `profileName` | Profile name. `""` = the built-in default profile. |
| `isIncognito` | `true` for incognito sessions (no cookies/history). |
| `isTor` | `true` for Tor browsing sessions. |
| `url` | The **active tab's** URL. A browser page hosts multiple internal tabs — use `pages[i].editor.tabs` to enumerate them all. Omitted for incognito/Tor pages (privacy). `windows` does not include `url`. |

### Discovering configured profiles

`settings.browserProfiles` returns the configured profile names and `settings.defaultBrowserProfile`
returns the default:

```json
{ "version": "4.0.3", "pageCount": 2, "activePageId": "abc",
  "browserProfiles": ["work", "personal"], "defaultBrowserProfile": "work" }
```

### Targeting a profile

Browser pages expose profile identity in `pages`; target the exact page with its returned id:

- **`profileName`** — is an opening option for `pages.openUrlInBrowserTab` (`""` = default profile).
- **`pageId`** — targets an exact browser page from `pages`; use it to disambiguate when
  several pages share a profile.

```
await pages.openUrlInBrowserTab("https://outlook.com", { profileName: "work" })
await pages["abc"].editor.click({ ref: "e12" })
```

Targeting through `pages[pageId].editor` focuses the resolved page — the page content must be
visible for input. Keep the returned page id instead of relying on mutable active-page state.

The exact resolution algorithm (including how board pages participate and why an untargeted call can land on a board) is in `persephone://guides/browser` → "Page targeting resolution". Rule of thumb: **always pass `pageId` when you care which page you hit** — the active page can change between your calls (the user, or another agent on the same Persephone, can switch tabs).

### Opening a URL in a profile

`pages.openUrlInBrowserTab` reuse is profile-matched: with `profileName` it adds the tab to (and
focuses) an existing page of that profile, or creates a new page with that profile — it never
attaches to a different-profile page.

```
pages.openUrlInBrowserTab("https://outlook.com", { profileName: "work" })
→ { "opened": "https://outlook.com", "pageId": "abc-123", "title": "Outlook" }
```

`pages.openUrlInBrowserTab` focuses the target page and returns its `pageId` — capture it and use
`pages[pageId].editor` instead of relying on mutable active-page state. The id can arrive before
the document is ready, so wait before the first action.

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

**Creatable with `pages.addEditorPage`** (content-hosting editors — see the table below for the
required `language` and title suffix):

`"monaco"` · `"grid-json"` · `"grid-csv"` · `"grid-jsonl"` · `"md-view"` · `"notebook-view"` · `"link-view"` · `"graph-view"` · `"draw-view"` · `"svg-view"` · `"html-view"` · `"mermaid-view"` · `"log-view"` · `"rest-client"`

**Standalone editors** — `pages.addEditorPage` rejects these with a hint; open them the way listed:

| Editor | What it is | How to open |
|--------|------------|-------------|
| `browser-view` | Built-in web browser | `pages.openUrlInBrowserTab(url, options)` |
| `board-view` | A Board (your mini web-app) | `boards.openBoard(root)` |
| `image-view` / `archive-view` / `video-view` | File viewers | `script.execute`: `await app.pages.openFile(path)` |
| `mcp-view` | MCP Inspector | `script.execute`: `await app.pages.showMcpInspectorPage()` |
| `about-view` / `settings-view` | App pages | `script.execute`: `showAboutPage()` / `showSettingsPage()` |
| `category-view`, `tools-hub-view`, `toolset-view`, `board-info`, `file-diff`, `env-vars-view`, and other ids you may see in `pages` | Internal app views | Opened by the app itself — read them, don't create them |

### Creating Pages with Specialized Editors

For the live creation language and title-suffix constraints, inspect `pages.$help`; the table below
is the complete editor reference.

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

**Initial content:** Structured editors expect valid JSON content on creation. **Read the dedicated resource guide BEFORE creating pages with these editors** — incorrect JSON will crash the editor:
- **Notebook:** Read `persephone://guides/notebook` for NoteItem format. Empty: `{"notes":[],"state":{}}`
- **Links:** Read `persephone://guides/links` for LinkItem format. Empty: `{"links":[],"state":{}}`
- **Graph:** Read `persephone://guides/graph` for node/link format. Empty: `{"nodes":[],"links":[],"options":{}}`
- **Rest Client:** Empty: `{"type":"rest-client","requests":[]}`

### Graph Editor Format (`graph-view`)

The graph editor renders an interactive force-directed graph. The full data format (node/link
properties, options and their defaults, group nodes, legend) and the `page.editor` scripting
API live in **`persephone://guides/graph`** — read it before creating or editing graph pages. The
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

**Live REST creation and send behavior:** inspect `pages[i].editor.$help` after narrowing the
editor id to `rest-client`. The full request field table and example remain in this resource.

## Grouped Pages (Script Output)

When a script runs, the **return value** is written to a grouped (side-by-side) output page. You can configure the output page:

```javascript
// Return value becomes the output content
const data = JSON.parse(page.content);
page.grouped.language = "json";
page.grouped.editorSwitches.switchTo("grid-json");
return data.filter(item => item.active);
```

Access `page.grouped` to auto-create a grouped page. Set `page.grouped.language` and call `page.grouped.editorSwitches.switchTo(id)` before returning.

## Errors & verification

What failures actually look like, and how to check your work (verified against the app):

- **`pages.addEditorPage` does NOT validate content.** Creating a structured-editor page (notebook,
  links, graph, rest-client) with broken content returns a normal `{ id, title }` success — the
  failure happens at render time, in the editor:
  - **Unparseable JSON** → the editor shows a parse error in place of content (e.g.
    `Unexpected token 'h', "this is not"… is not valid JSON`).
  - **Valid JSON with a missing required field** → the editor **crashes** into an error
    boundary: the page shows `Editor crashed` with the exception (e.g.
    `TypeError: note.tags is not iterable`) and a stack trace.
 - For the live raw-content versus rendered-editor boundary, inspect `pages[i].$help`; the
   longer failure examples above remain the reference for diagnosing the editor.
- **Wrong `editor` id** → `pages.addEditorPage` errors with `Unknown editor '…'. Valid editors: …`.
  A standalone editor id (e.g. `browser-view`) errors with a hint telling you the right call path.
- **`Page not found: <id>`** — the page was closed since you got the id; call at `pages`.
- **Every call result is authoritative** — if `pages.addEditorPage` returned an error, no page was
  created; there is nothing to clean up.
