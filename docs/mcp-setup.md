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
      "url": "http://127.0.0.1:7865/mcp"
    }
  }
}
```

### Claude Desktop

In Claude Desktop settings, add an MCP server:
- **Name:** persephone
- **URL:** `http://127.0.0.1:7865/mcp`

### ChatGPT Desktop

In ChatGPT settings → MCP Servers → Add:
- **URL:** `http://127.0.0.1:7865/mcp`

### Gemini CLI

```bash
gemini --mcp-server http://127.0.0.1:7865/mcp
```

## Call-only tool manifest

For migration or QA work, set `PERSEPHONE_MCP_CALL_ONLY` before launching Persephone to register
only the `call` tool. The enabled values are `1`, `true`, and `yes` (case-insensitive); unset,
empty, `0`, `false`, `no`, and any other value leave the normal tool manifest enabled. Focused
guide resources and `persephone://guides/full` remain available in either mode.

In PowerShell, launch the development app with:

```powershell
$env:PERSEPHONE_MCP_CALL_ONLY = "1"
npm start
```

For an installed build, launch it from a shell or shortcut that carries the same environment
variable. Changing the variable requires restarting the Persephone process. After the restart,
initialize a new MCP session to see only `call`; reconnecting alone does not change a running
process, and the guide resources remain available.

## Available Tools

The default manifest advertises two tools:

| Tool | Description |
|------|-------------|
| **call** | Read or act on the live object model with a path. Start with no path for the overview; use `args` for method arguments, `value` for assignments, and `maxLength` to bound long strings. |
| **execute_tool** | Run a registered Agent Tool by id discovered through `tools.search`; pass `args` matching its input schema. |

With `PERSEPHONE_MCP_CALL_ONLY` enabled, only `call` is advertised. All guide resources remain available by URI.
### Discovering the application shell with `call`

The `call` tool is the discoverable route for the live application shell. Start with an empty path
or `windows` to inspect the top-level object model. A window's persisted page summaries are
available even while it is closed; call `windows[i].open()` before asking for its live pages.

Useful paths include:

- `windows.count` and `windows[i].pages` for multi-window state. Persisted page summaries include
  `id`, `title`, `type`, `editor`, `language`, `filePath`, `modified`, and `pinned`; browser page
  summaries also include profile and private-session identity fields, but never the URL.
- `window.menuBar.folders`, `window.menuBar.selected`, and `window.menuBar.isOpen` for the current
  Menu Bar. Pass a folder's current `id` to `window.menuBar.open`.
- `page.panels.items`, `page.panels.isOpen`, and `page.panels.width` for the active page's live
  sidebar panels. Pass the bare `id` from an item to `page.panels.expand`; individual panels are
  closed with their own header controls.
- `settings.sections` to find a Settings row and `settings.highlight` to open Settings and point
  at it. Use `settings.set` to change a value, not `highlight`.
- `main.runtime.resourcesDir` and `main.runtime.demoBoardDir` for application and Demo-board
  resource paths, and `boards.assetsBaseUrl` / `boards.manifestUrl` for the published-board catalog.

For example:

```json
{"path":"settings.highlight","args":["mcp.enabled"]}
```

The `call` route refuses attempts to disable the MCP server or change its port through
`settings.set`, because either action would disconnect the current caller. The Settings page (or
the direct script API `app.settings.set()`) remains available for an intentional change.

### Browser automation through call

Use the live object-model paths for browser automation: open a page with
`pages.openUrlInBrowserTab(url, options)`, then drive it through
`pages[pageId].editor`. Use `pages[pageId].editor` for a trusted board and
`window.screen` for Persephone's own window. The browser resource
`persephone://guides/browser` documents targeting, snapshots, refs, waits, and privacy behavior.

> **Privacy guard:** User-opened incognito and Tor pages are refused by the browser host and by
> `window.screen` while that page is active. A private page opened by the agent remains available
> to that agent. Use a normal page when the guard refuses a user-opened private page.

### Automating Persephone's own UI

Use `window.screen` to drive **Persephone's own main window** instead of a web page — its tab strip,
sidebar, toolbars, dialogs, and the currently active editor. This lets an AI agent see and interact
with the live app: useful during development to reproduce or inspect a UI issue, and for end users
who want the agent to answer "where is that setting?" or click through a workflow with them.

```
window.screen.snapshot()
```

`window.screen.snapshot`, `.click`, `.hover`, `.type`, `.select`, `.pressKey`, `.evaluate`, `.screenshot`,
`.networkRequests`, and `.waitFor` operate against the app window using refs or CSS selectors, exactly like a browser page,
provided the active page is not incognito or Tor.

What's different:
- The snapshot only ever shows the app **chrome** (tab strip, sidebar, toolbars) plus the **active page's** content — other open tabs stay hidden until you click their tab to activate them.
- Browser navigation and inner-tab management don't apply to the app window — use `pages` and page
  methods to open or switch Persephone pages instead.
- Editing document content (e.g. typing into a Monaco editor) should go through `pages[i].content`
  or `script.execute`, not synthetic typing. `window.screen.type` is for simple inputs like dialogs
  and search boxes.
- Use `windows[i].window.screen` to target a specific window.

### Browser Profiles

Persephone's built-in browser supports multiple **profiles** — each is an isolated cookie and login session (separate cookies, storage, and cache). Multi-profile users (e.g., a work account in one profile and a personal account in another) can have agents reliably act on the correct session without reverse-engineering which page holds which login.

**Discovering profiles**

Call `settings.browserProfiles` to discover which profiles are configured:

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

`pages` and `page` include these fields for `browser-view` pages:

| Field | Description |
|-------|-------------|
| `profileName` | Profile name. `""` = built-in default profile. |
| `isIncognito` | `true` for incognito sessions. |
| `isTor` | `true` for Tor browsing sessions. |
| `url` | The active tab's URL. Omitted for incognito/Tor pages (privacy). |
| `title` | The Persephone page title. Incognito and Tor pages use the generic `Browser` title so the site name is not exposed outside the private session. |

`windows` also includes `profileName`, `isIncognito`, and `isTor` for browser pages — but not `url`.

**Targeting a specific profile**

Pass `profileName` to `pages.openUrlInBrowserTab` to open or reuse the page belonging to that
profile. Pass its returned `pageId` (or one from `pages`) for precise targeting when several
pages share a profile:

```
// Snapshot the "work" profile's page
pages.openUrlInBrowserTab("https://outlook.com", { profileName: "work" })

// Click an element on a specific page by ID
pages["abc"].editor.click({ ref: "e12" })

// Navigate the default-profile page
pages.openUrlInBrowserTab("https://example.com", { profileName: "" })
```

**Opening a URL in a profile**

`pages.openUrlInBrowserTab` with `profileName` adds the tab to (and focuses) an existing page of
that profile, or creates a new page — it never attaches to a different-profile page:

```
pages.openUrlInBrowserTab("https://outlook.com", { profileName: "work" })
```

Incognito and Tor pages are never automatable: `profileName` never matches them, a direct `pageId` targeting such a page returns a privacy-refusal error, and `pageId: "app"` is refused while one of them is active. `script.execute` remains unrestricted by this browser-automation guard and can still access private-session state.

### Multi-Window Support

All tools (except `windows`) accept an optional `windowIndex` parameter to target a specific window. If omitted, the first open window is used.

- Use `windows` to discover all windows and their status (`open` or `closed`). Browser pages in the list include `profileName`, `isIncognito`, and `isTor` so you can identify which profile's page is in each window.
- Closed windows have persisted pages but cannot be targeted directly — use `windows[i].open()` to reopen them first
- After reopening, target the window with any tool using its `windowIndex`

## Available Resources

MCP resources are read-only documents that AI clients can discover and read to gain context before using tools.

| Resource | URI | Description |
|----------|-----|-------------|
| **Overview Guide** | `persephone://guides/overview` | Start here — the mental model (windows, pages, editors, boards, tools) and a task → tool → guide routing table. Read this first if you are new to Persephone. |
| **pages.logView.push Guide** | `persephone://guides/ui-push` | Log View output channel — entry types, dialogs, examples. Read when showing output to the user. |
| **Pages Guide** | `persephone://guides/pages` | Pages & windows — page properties, editor types, creating pages, multi-window support. Read when working with tabs or documents. |
| **Scripting Guide** | `persephone://guides/scripting` | Full scripting API — `app` object, editor facades, TypeScript, Node.js access. Read when using `script.execute`. |
| **Graph Guide** | `persephone://guides/graph` | Graph editor data format and scripting API — node/link schema, `page.editor` facade, query and traversal methods. Read when working with force-graph pages. |
| **Notebook Guide** | `persephone://guides/notebook` | Notebook editor JSON format — NoteItem structure, content types (text, markdown, code, mermaid, grid). Read before creating or editing notebook pages. |
| **Links Guide** | `persephone://guides/links` | Links editor JSON format — LinkItem structure, categories, tags. Read before creating or editing links pages. |
| **Boards Guide** | `persephone://guides/boards` | Board authoring/automation reference — bridge API, theme contract, local vendoring, `pages[pageId].editor` testing. Read before building or opening a board. |
| **Tools Guide** | `persephone://guides/tools` | Agent Tools registry — `tools.search`/`execute_tool`, the stdin-JSON + result-marker contract, `.env` secrets. Read before using `tools.search`/`execute_tool`. |
| **Browser Guide** | `persephone://guides/browser` | Browser automation in depth — `call` paths, snapshot format, ref lifecycle, waiting strategies, errors, and older-tool equivalents. |
| **UI Guide** | `persephone://guides/ui` | Persephone's own interface — what each always-visible element is for, its stable selector, where Settings lives, and how to highlight an element on screen. Read when helping the user with the app itself. |
| **UI Editors Guide** | `persephone://guides/ui-editors` | The editor catalog — what each editor is for, how the user opens it, what it can do. Read when explaining Persephone's capabilities to the user. |
| **Full Guide** | `persephone://guides/full` | All guides combined into one document. Only read if you need the complete reference. |

AI agents also receive **server instructions** on connection — a concise overview of persephone and its main workflows, with pointers to which guide to read for each task. This means agents have immediate context without reading any resource.

The `call` tool follows the browser privacy boundary: a user-opened incognito or Tor page is not
readable through its object-model path, while a private page opened by the agent is available to
that agent. The `app.call()` method in ordinary scripts has the same page privacy rule.

## Examples

### Read the active page

Ask your AI agent: *"Read the current page in persephone"*

The agent will use `page` to retrieve the content.

### Create a page with content

Ask: *"Create a new JavaScript page in persephone with a hello world script"*

The agent will use `pages.addEditorPage` with `language: "javascript"` and the content.

### Open a URL in the browser

Ask: *"Open the GitHub API docs in persephone"*

The agent will use `pages.openUrlInBrowserTab(url, options)`. You can also ask for a specific
profile, incognito mode, or Tor mode: *"Open google.com in incognito"*, *"Open this page through
Tor"*.

### Automate the browser in a specific profile

Ask: *"Go to my Outlook inbox in the work profile and tell me the subject of the first unread email"*

The agent will:

1. `settings.browserProfiles` — confirm that the `"work"` profile exists in `browserProfiles`
2. `pages` — find the browser page whose `profileName` is `"work"`; note its `url`
3. `pages.openUrlInBrowserTab("https://outlook.com", { profileName: "work" })` — navigate to Outlook if not already there
4. `pages[pageId].editor.snapshot()` — read the page structure
5. Extract and return the first unread subject from the snapshot

Because `profileName: "work"` is passed, every tool targets the page holding the work login session — regardless of which browser page happens to be active.

### Automate the browser

Ask: *"Search for 'persephone editor' on Google and show me the first result title"*

The agent will use the browser paths:

1. `pages.openUrlInBrowserTab("https://google.com")` — opens a browser page
2. `pages[pageId].editor.waitFor({ selector: "input" })` — waits for the search box
3. `pages[pageId].editor.type({ ref: "<search ref>" }, query)` — types the query
4. `pages[pageId].editor.pressKey("Enter")` — presses `Enter`
5. `pages[pageId].editor.waitFor({ text: "<result text>" })` — waits for results
6. `pages[pageId].editor.snapshot()` — reads the page structure to find the first result title

### Transform data

Ask: *"Parse the JSON in the active page and create a CSV version"*

The agent will use `script.execute` to read the active page content, transform it, and write the result to a grouped page.

### Show progress and ask questions

Ask: *"Analyze the JSON in the active page and ask me before making changes"*

The agent will use the `pages.logView.push` call path to log status messages and show an interactive confirmation dialog in the Log View:

```
pages.logView.push([
    "Analyzing JSON structure...",
    { type: "log.success", text: "Found 42 records" },
    { type: "input.confirm", message: "Apply formatting to all records?" }
])
```

The call returns immediately with dialog IDs; read `pages.logView.dialogResult(id)` to check when
the user has answered. See the [ui API reference](./api/ui-log.md#log-view-output) for all entry
types and dialog options.

### Advanced scripting

The `script.execute` call path gives AI access to the full [Scripting API](scripting.md):

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
- `pages.logView.push` calls with dialog entries return immediately; poll `dialogResult(id)` until the user responds
