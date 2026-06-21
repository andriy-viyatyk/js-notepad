# MCP Server Setup

persephone includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI agents to control the application — execute scripts, create and read pages, and more.

> **Two separate servers:** this page covers the **app-control** server (drive Persephone itself). The optional [Mneme knowledge base](./mneme.md) exposes its *own* MCP server on a different port for reading and maintaining a document store. They are configured independently and can both run at once.

## Quick Start

1. Open persephone Settings (`Ctrl+,` or Settings tab)
2. Find the **MCP Server** section and check **Enable MCP server**
3. The server starts automatically — a green status dot and the server URL appear below the toggle, and a small **MCP indicator** appears in the title bar showing the connection count. Click the indicator to open the **MCP Server Log** — a live log of all incoming requests with method names, durations, and expandable request/response JSON.
4. Click **Copy URL** to grab the server address, or **Copy Config** to get a ready-to-paste JSON snippet for your AI client
5. Paste the configuration into your AI client (see below)

> **Tip:** You can also change the port number in the Settings UI (disable MCP first, change the port, then re-enable). The default port is `7865`.

## AI Client Configuration

### Claude Code

Add to your `.mcp.json` (in project root or `~/.claude/.mcp.json`):

```json
{
  "mcpServers": {
    "persephone": {
      "type": "http",
      "url": "http://localhost:7865/mcp"
    }
  }
}
```

### Claude Desktop

In Claude Desktop settings, add an MCP server:
- **Name:** persephone
- **URL:** `http://localhost:7865/mcp`

### ChatGPT Desktop

In ChatGPT settings → MCP Servers → Add:
- **URL:** `http://localhost:7865/mcp`

### Gemini CLI

```bash
gemini --mcp-server http://localhost:7865/mcp
```

## Available Tools

| Tool | Description |
|------|-------------|
| **list_windows** | List all windows (open and closed) with their status, page count, and page metadata. Browser pages also include `profileName`, `isIncognito`, and `isTor`. |
| **open_window** | Open or reopen a window by index. Closed windows are recreated with their persisted pages. |
| **execute_script** | Execute JavaScript or TypeScript with access to `page` and `app` objects. Accepts an optional `language` parameter (`"javascript"` or `"typescript"`; defaults to `"javascript"`). The most powerful tool — can do anything the scripting system supports. |
| **list_pages** | List all open pages (tabs) with IDs, titles, editors, metadata. Browser pages include `profileName`, `isIncognito`, `isTor`, and `url`. Board pages include `editor: "board-view"` and `selectedBoard` (the board's display name). |
| **get_page_content** | Get text content of a page by ID. |
| **get_active_page** | Get the active page with content and metadata. Browser pages also include `profileName`, `isIncognito`, `isTor`, and `url` (active tab URL; omitted for incognito/Tor pages). |
| **create_page** | Create a new page with optional content, language, and editor. Returns a clear error with specific hints for standalone editor types (browser, PDF, image, MCP Inspector, etc.) — use `open_url` or `execute_script` instead. |
| **set_page_content** | Update text content of a page by ID. |
| **open_url** | Open a URL in the [built-in browser](./browser.md). Accepts optional `profileName` (browser profile), `incognito` (boolean), and `tor` (boolean) parameters. Reuse is profile-matched: with `profileName` it adds the tab to (or focuses) an existing page of that profile, or creates a new page with that profile — never attaches to a different-profile page. |
| **ui_push** | Push log entries, interactive dialogs, and output widgets to a Log View page — the recommended output channel for AI agents. Strings are shorthand for `log.info`. Dialog entries (`input.confirm`, `input.text`, `input.buttons`, `input.checkboxes`, `input.radioboxes`, `input.select`) block until the user responds. Output entries (`output.progress`, `output.grid`) support rich display — progress bars with upsert-by-id for real-time updates, and inline data grids from JSON or CSV strings. The Log View page is created automatically on first call and reused on subsequent calls. |
| **read_guide** | Read a documentation guide by name (`ui-push`, `pages`, `scripting`, `graph`, `notebook`, `todo`, `links`). Returns the guide content as text. An alternative to fetching `notepad://guides/*` resources — works with AI clients that don't support MCP resources. |
| **get_app_info** | Get app version, page count, active page ID, configured browser profile names (`browserProfiles`), and the default profile name (`defaultBrowserProfile`). Use this to discover valid profile names before calling browser tools. |

### Browser Automation Tools

These tools control the built-in browser and drive **board pages** directly. Use `open_url` first to open a browser page if one is not already open; for boards, the user opens the board in Persephone first (agent cannot open an untrusted board). Find a board in `list_pages` by `editor: "board-view"` and read its `pageId` and `selectedBoard` fields.

> **Note:** Browser automation tools are disabled by default. Enable them in **Settings → MCP Server → Enable browser interaction**. While disabled, the tools are hidden from the agent entirely (not listed in the MCP tool set). This is an opt-in safety gate — enable only when you want AI agents to be able to control the browser.

Every `browser_*` tool accepts two optional parameters for targeting a specific browser page:

- **`pageId`** — target an exact browser page by its ID (from `list_pages`). Takes precedence over `profileName`.
- **`profileName`** — target the browser page belonging to this profile (`""` = built-in default profile). Never matches incognito or Tor pages. If omitted, the active (or first) browser page is used.

Targeting a page also **focuses** it — the resolved page becomes the active tab. This is a useful side-effect: subsequent untargeted calls stay on the now-active page. If no matching page is found a clear error message suggests using `open_url` with the desired `profileName` to open one.

| Tool | Description |
|------|-------------|
| **browser_navigate** | Navigate to a URL. Returns an accessibility snapshot of the loaded page. Accepts optional `pageId` and `profileName`. |
| **browser_snapshot** | Get the accessibility snapshot of the current page — a YAML-like tree of elements with roles, names, and `[ref=eN]` IDs. Preferred over screenshots for structured, deterministic inspection. Accepts optional `pageId` and `profileName`. |
| **browser_click** | Click an element. Accepts a CSS `selector`, an accessibility `ref` from a snapshot (e.g. `"e52"`), or a human-readable `element` description used as a CSS selector. Returns an updated snapshot. Accepts optional `pageId` and `profileName`. |
| **browser_type** | Type text into an input element. Clears existing value first. Returns an updated snapshot. Accepts `selector` or `ref`. Optional `slowly: true` to type character by character (triggers key handlers); optional `submit: true` to press Enter after typing. Accepts optional `pageId` and `profileName`. |
| **browser_select_option** | Select an option in a `<select>` element. Returns an updated snapshot. Accepts `selector` or `ref`. Pass `value` (string) or `values` (array, Playwright-compatible — first value is used). Accepts optional `pageId` and `profileName`. |
| **browser_press_key** | Press a keyboard key (e.g. `"Enter"`, `"Tab"`, `"Escape"`, `"ArrowDown"`). Returns an updated snapshot. Accepts optional `pageId` and `profileName`. |
| **browser_evaluate** | Run JavaScript in the page and return the result. Supports async expressions. Accepts `expression` (JS expression string) or `function` (Playwright-compatible — a function string like `"() => document.title"` that is automatically invoked). Accepts optional `pageId` and `profileName`. |
| **browser_tabs** | Manage browser tabs. Accepts `action`: `"list"` (default) — return all tabs; `"new"` — open a new tab (optional `url`); `"close"` — close a tab by `index` (or the active tab if omitted); `"select"` — switch to a tab by `index`. Returns updated tab list. Accepts optional `pageId` and `profileName`. |
| **browser_hover** | Hover over an element, triggering `mouseenter` and `mouseover` events. Useful for revealing tooltips, dropdown menus, and other hover-dependent UI. Accepts `selector` or `ref`. Returns an updated snapshot. Accepts optional `pageId` and `profileName`. |
| **browser_navigate_back** | Navigate back in browser history. Returns an updated snapshot. Accepts optional `pageId` and `profileName`. |
| **browser_wait_for** | Wait for a condition on the page. Returns a snapshot when done. Options: `selector` — wait for a CSS element to appear; `text` — wait for text to appear; `textGone` — wait until text disappears (Playwright-compatible); `time` — wait a fixed number of seconds, e.g. `2` (Playwright-compatible). Optional `timeout` in ms (default 30000) applies to selector/text/textGone modes. Accepts optional `pageId` and `profileName`. |
| **browser_take_screenshot** | Take a screenshot of the current page. Returns a base64-encoded PNG image. Accepts optional `pageId` and `profileName`. |
| **browser_network_requests** | Get the network request log for the current tab. Returns an array of `{ url, method, statusCode, resourceType, requestHeaders, responseHeaders }`. Accepts optional `pageId` and `profileName`. |
| **browser_close** | Close the active browser tab. Accepts optional `pageId` and `profileName`. |

> **Tip:** `browser_snapshot` is the recommended way to inspect page state — it is faster and more deterministic than screenshots. After any click or type action, the tool automatically returns an updated snapshot so you can verify the result without a separate call.

> **Privacy guard:** Browser automation tools are blocked when the active browser page is in incognito or Tor mode. Any `browser_*` call on an incognito or Tor page returns an error with a clear message. Use `open_url` without `incognito` or `tor` to open a normal browser session first. `open_url` also never reuses an incognito or Tor page for a normal URL — it always creates a fresh normal session.

### Browser Profiles

Persephone's built-in browser supports multiple **profiles** — each is an isolated cookie and login session (separate cookies, storage, and cache). Multi-profile users (e.g., a work account in one profile and a personal account in another) can have agents reliably act on the correct session without reverse-engineering which page holds which login.

**Discovering profiles**

Call `get_app_info` to discover which profiles are configured:

```json
{
  "version": "4.0.3",
  "pageCount": 3,
  "activePageId": "abc",
  "browserProfiles": ["work", "personal"],
  "defaultBrowserProfile": "work"
}
```

`browserProfiles` lists all configured profile names. `""` is always the built-in default profile (even if it is not listed).

**Profile fields on browser pages**

`list_pages` and `get_active_page` include these fields for `browser-view` pages:

| Field | Description |
|-------|-------------|
| `profileName` | Profile name. `""` = built-in default profile. |
| `isIncognito` | `true` for incognito sessions. |
| `isTor` | `true` for Tor browsing sessions. |
| `url` | The active tab's URL. Omitted for incognito/Tor pages (privacy). |

`list_windows` also includes `profileName`, `isIncognito`, and `isTor` for browser pages — but not `url`.

**Targeting a specific profile**

Pass `profileName` to any `browser_*` tool to act on the page belonging to that profile. Pass `pageId` (from `list_pages`) for precise targeting when several pages share a profile:

```
// Snapshot the "work" profile's page
browser_snapshot({ profileName: "work" })

// Click an element on a specific page by ID
browser_click({ pageId: "abc", ref: "e12" })

// Navigate the default-profile page
browser_navigate({ url: "https://example.com", profileName: "" })
```

**Opening a URL in a profile**

`open_url` with `profileName` adds the tab to (and focuses) an existing page of that profile, or creates a new page — it never attaches to a different-profile page:

```
open_url({ url: "https://outlook.com", profileName: "work" })
```

Incognito and Tor pages are never automatable: `profileName` never matches them, and a direct `pageId` targeting such a page returns a privacy-refusal error.

### Multi-Window Support

All tools (except `list_windows`) accept an optional `windowIndex` parameter to target a specific window. If omitted, the first open window is used.

- Use `list_windows` to discover all windows and their status (`open` or `closed`). Browser pages in the list include `profileName`, `isIncognito`, and `isTor` so you can identify which profile's page is in each window.
- Closed windows have persisted pages but cannot be targeted directly — use `open_window` to reopen them first
- After reopening, target the window with any tool using its `windowIndex`

## Available Resources

MCP resources are read-only documents that AI clients can discover and read to gain context before using tools.

| Resource | URI | Description |
|----------|-----|-------------|
| **ui_push Guide** | `notepad://guides/ui-push` | Log View output channel — entry types, dialogs, examples. Read when showing output to the user. |
| **Pages Guide** | `notepad://guides/pages` | Pages & windows — page properties, editor types, creating pages, multi-window support. Read when working with tabs or documents. |
| **Scripting Guide** | `notepad://guides/scripting` | Full scripting API — `app` object, editor facades, TypeScript, Node.js access. Read when using `execute_script`. |
| **Graph Guide** | `notepad://guides/graph` | Graph editor data format and scripting API — node/link schema, `page.asGraph()` facade, query and traversal methods. Read when working with force-graph pages. |
| **Notebook Guide** | `notepad://guides/notebook` | Notebook editor JSON format — NoteItem structure, content types (text, markdown, code, mermaid, grid). Read before creating or editing notebook pages. |
| **Todo Guide** | `notepad://guides/todo` | Todo editor JSON format — TodoItem structure, lists, tags. Read before creating or editing todo pages. |
| **Links Guide** | `notepad://guides/links` | Links editor JSON format — LinkItem structure, categories, tags. Read before creating or editing links pages. |
| **Full Guide** | `notepad://guides/full` | All guides combined into one document. Only read if you need the complete reference. |

AI agents also receive **server instructions** on connection — a concise overview of persephone and its main workflows, with pointers to which guide to read for each task. This means agents have immediate context without reading any resource.

> **Tip:** All guides are also available via the `read_guide` tool — call `read_guide({ guide: "scripting" })` instead of fetching `notepad://guides/scripting`. This is useful for AI clients that don't support MCP resources.

> **Note:** Claude Code users working inside the persephone project already have full documentation context via CLAUDE.md, so they rarely need to fetch resources explicitly. Resources are most useful for standalone AI clients connecting without any project context.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mcp.enabled` | `false` | Enable/disable the MCP HTTP server |
| `mcp.port` | `7865` | Port number for the MCP server |
| `mcp.browser-tools.enabled` | `false` | Expose browser automation tools to connected AI agents. When disabled, all `browser_*` tools are hidden from agents entirely. Reconnect the agent after changing this setting. |

## Examples

### Read the active page

Ask your AI agent: *"Read the current page in persephone"*

The agent will use `get_active_page` to retrieve the content.

### Create a page with content

Ask: *"Create a new JavaScript page in persephone with a hello world script"*

The agent will use `create_page` with `language: "javascript"` and the content.

### Open a URL in the browser

Ask: *"Open the GitHub API docs in persephone"*

The agent will use `open_url` with the URL. You can also ask for a specific profile, incognito mode, or Tor mode: *"Open google.com in incognito"*, *"Open this page through Tor"*.

### Automate the browser in a specific profile

Ask: *"Go to my Outlook inbox in the work profile and tell me the subject of the first unread email"*

The agent will:

1. `get_app_info` — confirm that the `"work"` profile exists in `browserProfiles`
2. `list_pages` — find the browser page whose `profileName` is `"work"`; note its `url`
3. `open_url({ url: "https://outlook.com", profileName: "work" })` — navigate to Outlook if not already there
4. `browser_snapshot({ profileName: "work" })` — read the page structure
5. Extract and return the first unread subject from the snapshot

Because `profileName: "work"` is passed, every tool targets the page holding the work login session — regardless of which browser page happens to be active.

### Automate the browser

Ask: *"Search for 'persephone editor' on Google and show me the first result title"*

The agent will use the browser automation tools:

1. `open_url` — opens a browser page navigated to `https://google.com`
2. `browser_wait_for` — waits for the search box to appear
3. `browser_type` — types the query into the search box
4. `browser_press_key` — presses `Enter`
5. `browser_wait_for` — waits for results to load
6. `browser_snapshot` — reads the page structure to find the first result title

### Transform data

Ask: *"Parse the JSON in the active page and create a CSV version"*

The agent will use `execute_script` to read the active page content, transform it, and write the result to a grouped page.

### Show progress and ask questions

Ask: *"Analyze the JSON in the active page and ask me before making changes"*

The agent will use `ui_push` to log status messages and show an interactive confirmation dialog in the Log View:

```
ui_push({ entries: [
    "Analyzing JSON structure...",
    { type: "log.success", text: "Found 42 records" },
    { type: "input.confirm", message: "Apply formatting to all records?" }
] })
```

The tool blocks until you click a button. See the [ui API reference](./api/ui-log.md#mcp-ui_push-tool) for all entry types and dialog options.

### Advanced scripting

The `execute_script` tool gives AI access to the full [Scripting API](scripting.md):

- **`page`** — Active page: content, language, editor, grouped output
- **`app.pages`** — All pages: create, open, close, navigate
- **`app.fs`** — File system: read, write, dialogs
- **`app.settings`** — Application settings
- **`app.ui`** — User interface: confirm, input, notifications
- **`app.shell`** — External URLs, encryption, version info

## Troubleshooting

**Server not starting?**
- Check that the **Enable MCP server** checkbox is checked in Settings → MCP Server
- Look at the status indicator — a red dot means the server failed to start (usually a port conflict)
- Check that port 7865 is not in use by another application
- Try changing the port: disable MCP, enter a different port number, then re-enable

**AI client can't connect?**
- Make sure persephone is running with MCP enabled (green status dot visible in Settings, or look for the MCP indicator in the title bar)
- Verify the URL matches the one shown in Settings (use the **Copy URL** button to be sure)
- The server only accepts connections from localhost (127.0.0.1)

**Tool calls timing out?**
- The server has a 30-second timeout for script execution
- Long-running scripts may need to be broken into smaller steps
- `ui_push` calls with dialog entries have no timeout — they block until the user responds
