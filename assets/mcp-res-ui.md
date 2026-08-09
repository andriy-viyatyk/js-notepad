# Persephone UI Guide — explaining the app to its user

Use this guide when the user asks about **Persephone itself** rather than about their content:
"what is this button?", "where do I change the language of this tab?", "how do I open a
folder?", "what can this app do?". It describes the always-visible chrome by **purpose**, gives
you a stable selector for each element, and shows you how to draw a highlight on screen so the
user can see what you are talking about.

For the editors that fill the page area, read `read_guide("ui-editors")`.
For creating/reading pages as an agent, `read_guide("pages")`.
For driving the UI (clicking, typing, snapshots), `read_guide("browser")`.

## What Persephone is

A Windows notepad replacement built for developers. It keeps the fast, tabbed, open-anything
feel of Notepad and adds the things a developer reaches for next: the VS Code editor engine
(syntax highlighting, IntelliSense, multi-cursor, compare mode), specialized editors for
structured data (JSON/CSV grids, notebooks, diagrams, link collections, HTTP request
collections), a built-in browser, and a JavaScript/TypeScript runtime with **full Node.js**
access that can transform whatever is in the current tab. Boards — small sandboxed web apps an
agent builds for the user — turn it into a container for custom tools. It is deliberately a
container: the app stays light, and the user (or their agent) brings the integrations.

That paragraph is for you to paraphrase. Match it to what the user actually asked.

## Anatomy of the window

Persephone has no native title bar or menu bar. Everything lives in one **header strip** across
the top, and everything below it is the **page area**.

```
+-------------------------------------------------------------------------+
| [P] [tab] [tab] [tab] [+]                        [-] [box] [x]          |  header strip
|                                                    ... Mneme  * MCP     |  status indicators
+-------------------------------------------------------------------------+
|                      |                                                  |
|  sidebar panels      |   the active page, rendered by its editor         |  page area
|  (when the page      |                                                  |
|   has any open)      |                                                  |
+-------------------------------------------------------------------------+
```

### Header strip

| Element | What it is for | Selector |
|---|---|---|
| Persephone glyph (far left) | Opens the **Menu Bar** — the app's only menu. Everything not on a tab lives behind it. | `[data-name="persephone-menu"]` |
| Tab strip | One tab per open page. Drag to reorder, drag out to move to another window, right-click for the tab menu. | `[data-name="page-tabs"]` |
| Add-page button `+` | Click adds an empty page (`Ctrl+N`). Its **arrow** opens a menu of every editor and browser profile the user can start from. | `[data-name="page-tabs-add"]` |
| Scroll arrows | Appear only when tabs overflow the strip. | `[data-name="page-tabs-scroll-left"]`, `[data-name="page-tabs-scroll-right"]` |
| Reload-scripts button | Appears only when the user's autoload scripts changed on disk and need re-running. | `[data-name="autoload-reload"]` |
| Zoom indicator | Appears only when the window is zoomed; shows the percentage and resets zoom on click. | `[data-name="zoom-indicator"]` |
| Window buttons | Minimize / maximize-restore / close. | `[data-name="window-minimize"]`, `[data-name="window-toggle"]`, `[data-name="window-close"]` |

### Status indicators (bottom-right corner of the header strip)

Small, muted, and easy for a first-time user to miss — a common thing to be asked about.

| Element | What it is for | Selector |
|---|---|---|
| Indicator cluster | Container for the three below. | `[data-name="status-indicators"]` |
| Green "..." | The **snip menu**: *Snip Screen* (hides Persephone first) and *Snip Persephone*. The capture opens in a new Image View page. | `[data-name="header-snip-button"]` |
| Mneme | Shown only when Mneme (the markdown knowledge base) is enabled. Dot colour: green = running with an embedding model, yellow = running without one (semantic search unavailable), grey = enabled but not running. Click opens its config page. | `[data-name="mneme-indicator"]` |
| MCP | Shown only while the MCP server is running — this is how *you* are connected. It shows a green dot when idle, or the number of connected clients. Click opens the MCP request log. | `[data-name="mcp-indicator"]` |

### A page tab

| Element | What it is for | Selector |
|---|---|---|
| Any tab | One per open page. | `[data-name="page-tab"]` |
| The active tab | | `[data-name="page-tab"][data-active]` |
| Syntax-highlighting language button (left icon) | **The answer to "where do I change the language of this tab?"** Click it on the active tab to pick the **Monaco syntax-highlighting language** — JavaScript, JSON, Python and so on. Recently used ones sort to the top. | `[data-name="tab-language"]` |
| Close button (right) | Closes the page — or **ungroups** it when the tab is grouped. Turns into a dot when the page has unsaved changes. | `[data-name="tab-close"]` |
| Mute button | Appears only when the page plays audio. | `[data-name="tab-sound"]` |
| Title text | | `[data-part="title-label"]` |

**"Language" always means the Monaco syntax-highlighting mode** — never the app's UI locale (there
is no locale setting) and never a spoken language. When a user says "change the language of this
tab", they mean syntax highlighting, and the whole feature is the one button above plus the
`language` field on `create_page` / `list_pages`. There is nothing else to look for.

State attributes on a tab: `data-active`, `data-modified`, `data-pinned`, `data-temp`,
`data-deleted`, `data-grouped`, `data-has-encryption`.

Two shapes break the pattern, and both occur in ordinary use:

- **Editors with no syntax-highlighting language** (most non-text editors: grids, notebooks, the
  browser, boards, and app pages such as Tools & Editors)
  render **no** `[data-name="tab-language"]` button — an editor icon sits in its place
  (`[data-part="empty-language"]`). If the user asks to change the language of such a tab, the
  honest answer is that the editor does not have one. **Check this in `list_pages` before doing
  anything else** — a page whose `language` is empty or absent has no language to change. That
  one call settles it; searching a snapshot for the button, or probing the scripting API, does
  not, and leaves the user's app in a different state than you found it.
- **A pinned tab shows no title** — only icons, with the file path in a hover tooltip. Read page
  titles from `list_pages`, never from the tab's DOM.

**Grouping.** `Ctrl+click` a second tab to show two pages side by side; the grouped tab's close
button ungroups instead of closing. Scripts write their output into the grouped page.

**Tab right-click menu:** Close Tab, Close Other Tabs, Close Tabs to the Right, Open in New
Window, Duplicate Tab, Pin/Unpin Tab, plus items the current editor contributes.

### The Menu Bar

Opens from the Persephone glyph and slides in over the page area. It is the app's file browser,
tab switcher, and settings entry point in one panel: a category list on the left, the selected
category's content on the right.

| Element | What it is for | Selector |
|---|---|---|
| Backdrop | Always in the DOM; `display: none` when closed — its presence tells you nothing about whether the Menu Bar is open. | `[data-name="menu-bar"]` |
| Sliding panel | The visible panel. | `[data-name="menu-bar-content"]` |
| Open File / New Window | `Ctrl+O` / `Ctrl+Shift+N`. | `[data-name="menubar-open-file"]`, `[data-name="menubar-new-window"]` |
| About / **Settings** | **Where Settings lives.** Both open as ordinary pages in a tab. | `[data-name="menubar-about"]`, `[data-name="menubar-settings"]` |
| Category list | Four built-in categories plus the user's own folders. | `[data-name="menubar-folders"]` |
| Content pane | Shows the selected category. | `[data-name="menubar-content"]` |
| Add Folder | Pins any folder to the category list, so a project is one click away. Right-click a pinned folder for Open in New Tab / Show in File Explorer / Open Terminal here / Remove. | `[data-name="menubar-add-folder-button"]` |
| Width splitter | Drag to resize the panel. | `[data-name="menubar-splitter"]` |

The four built-in categories:

- **Open Tabs** — every open page, for switching when the tab strip is crowded.
- **Recent Files** — recently opened files (right-click the category to clear).
- **Tools & Editors** — start a new page from any editor, and reach the registered Agent Tools.
- **Script Library** — the user's folder of reusable scripts. Right-click to point it somewhere
  else, open it in Explorer, or unlink it.

`Esc` closes the Menu Bar. `Ctrl+F` searches inside a folder category.

### Page area and sidebar

| Element | What it is for | Selector |
|---|---|---|
| Content region below the header | | `[data-name="app-content"]` |
| Page host — every page lives here | | `[data-name="pages-container"]` |
| The active page's editor container | | `[data-name="page-editor"]` |
| An empty page (nothing opened yet) | | `[data-name="page-empty"]` |
| Sidebar panel container | Docked on the **left** of the page area. Present only when the active page has panels open. Panels belong to the page, not the window — a file tree for a folder page, an entry list for an archive, and so on, so the sidebar changes as the user switches tabs. | `[data-name="secondary-views-container"]` |
| Sidebar panel stack | | `[data-name="secondary-views-stack"]` |
| Sidebar width splitter | | `[data-name="secondary-views-splitter"]` |

## Settings

The user reaches Settings from the Menu Bar's gear icon (`[data-name="menubar-settings"]`); it
opens as an ordinary page in a tab. You have two ways to change a setting, and they are not
interchangeable.

**When you are connected over MCP, use the API.** It is the supported path — it applies the
change, persists it, and triggers whatever the setting actuates:

```js
// execute_script
app.settings.set("theme", "monokai");
return { theme: app.settings.get("theme"), path: app.settings.settingsFilePath };
```

**When you are not connected, edit the file.** This is how you turn the MCP server *on* in the
first place — the chicken-and-egg case, where you need Persephone before you have it:

```
%APPDATA%\persephone\data\appSettings.json
```

JSON5, so comments and trailing commas are allowed. Persephone watches the file and reloads it
on save, so an edit applies immediately with no restart. `app.settings.settingsFilePath` returns
the resolved path when you are connected.

Two things to know before editing it:

- **Persephone rewrites the file** whenever a setting changes in the UI, regenerating its
  comments. Any comment you add is lost. Change values, not commentary.
- **Deleting a key restores its default**, and deleting the whole file is safe — it is recreated.

### Settings worth knowing about

| Key | Why it comes up |
|---|---|
| `mcp.enabled` | The MCP server, **off by default**. Set it true to connect an agent; the server starts immediately. |
| `mcp.port` | Default 7865. Changing it alone does *not* move a running server — set `mcp.enabled` false, save, then true. |
| `mcp.browser-tools.enabled` | **Off by default.** Without it there are no `browser_*` tools, so no board, browser, or app-window automation. A connected agent must reconnect after enabling. |
| `git.enabled` | **Off by default** — the reason a user sees no Git Tree or Git Diff. |
| `mneme.enabled` | **Off by default** — the reason a user sees no Mneme features. Mneme runs its own MCP server on `mneme.port`, separate from `mcp.port`. |
| `theme` | Applies on save. One of nine names; the file's own comment lists them. |

The file's comments carry the accepted values and defaults for every key, so read it before
guessing — it is written to be self-describing.

**Do not enable things the user did not ask for.** `mcp.browser-tools.enabled` in particular
grants automation of the user's browser sessions; explain what it does and let them decide.

## Pointing at an element on screen

Describing a small grey indicator in the corner rarely lands. Draw a highlight instead: an
orange ring around the element and a card with your own text and a **Close** button. The look is
fixed in every theme and every context, so the user always knows the callout came from their
agent and not from the app.

### In the Persephone window

```js
// execute_script
return await app.ui.highlightElement(
    '[data-name="mcp-indicator"]',
    "This is the MCP indicator. It shows that the MCP server is running and how many clients are connected. Click it to open the request log."
);
```

Signature: `app.ui.highlightElement(selector, text?, options?)`, with

| Option | Effect |
|---|---|
| `title` | Bold heading above the text. |
| `all: true` | Ring **every** match instead of the first (capped at 20 rings; `count` still reports the true total). |
| `scroll: false` | Do not scroll the element into view first (it scrolls by default). |
| `id` | Name the highlight. Re-using an id replaces that highlight instead of stacking a second one, and lets you clear it individually. |

Returns `{ id, found, count, highlighted, selector, error? }` — **check `found`.** A selector
that matched nothing returns `found: false` and draws nothing; a malformed selector also
returns `error`.

Omit `text` and `title` to get a bare ring with no card — useful when you would rather explain
in chat.

`app.ui.clearHighlights(id?)` removes one highlight or all of them, and returns how many it
removed. The user can also dismiss with the card's **Close** button or `Esc`. A highlight
removes itself when its target leaves the screen — so a callout on a Menu Bar button disappears
when the user closes the Menu Bar, which is exactly the flow to expect.

### In a board

`app.ui` cannot reach other frames, so inject the overlay module into the board instead. Read
its source once from the renderer:

```js
// execute_script
return await (await fetch("app-asset://agent/ui-highlight.js")).text();
```

then, with that text as `CODE`:

```js
// browser_evaluate on the board page
{ "pageId": "<board page id>", "function": "() => { CODE; return window.__persephoneHighlight.show({ selector: '#submit', text: 'This is the button that submits the form.' }); }" }
```

The module installs `window.__persephoneHighlight` with `show(options)`, `showMany([options])`
and `clear(id?)` — the same behaviour and the same look as `app.ui.highlightElement`. Injecting
it twice is free; it re-uses an existing install.

### In a browser page — not supported

**Persephone has no highlight overlay for web pages, by design.** Browser pages run in their own
sessions with no access to the app's assets, so the overlay module cannot be loaded there. This
is a deliberate security boundary — do not look for a way around it, and do not tell the user the
feature exists.

If you need to point at something on a web page, style the element directly and explain in chat:

```js
// browser_evaluate — a plain border, nothing more
{ "pageId": "<page id>", "function": "() => { const el = document.querySelector('#submit'); if (!el) return { found: false }; el.style.outline = '2px solid #F97316'; el.style.outlineOffset = '2px'; el.scrollIntoView({ block: 'nearest' }); return { found: true }; }" }
```

Say in your reply what you outlined and why — that is the explanation the user needs, and the
outline is only there to make "which button" unambiguous. Undo it by clearing the same
properties. Note this mutates the page's own styles, unlike the app-window overlay, so keep it
to one element and put it back when you are done.

## Answering "where is X?" reliably

1. **Prefer purpose over position.** "The Persephone glyph in the top-left corner opens the
   menu" survives a redesign; "the third button from the left" does not.
2. **Check the element exists before you point at it.** Several elements are conditional (zoom
   indicator, scroll arrows, reload button, Mneme and MCP indicators, the language button, the
   sidebar). `found: false` from `highlightElement` is your check — you get it for free.
3. **Look before you describe** when you are unsure of the current state:
   `browser_snapshot({ pageId: "app" })` shows the chrome plus the **active** page only.
4. **Highlight, then explain.** One `highlightElement` call plus a sentence in chat beats a
   paragraph of layout description.

## Errors & verification

| Symptom | Meaning | Fix |
|---|---|---|
| `{ found: false, count: 0 }` | The selector matched nothing — usually a conditional element that is not currently shown | Check the condition (is the Menu Bar open? is the page zoomed?), or snapshot the app window |
| `{ found: false, error: "invalid CSS selector: …" }` | Malformed selector | Fix the selector; it is reported, not thrown |
| `count` larger than `highlighted` | `all: true` matched more than the 20-ring cap | Narrow the selector |
| Highlight vanished on its own | Its target left the screen (page switched, Menu Bar closed, panel collapsed) | Expected; re-highlight after putting the UI back in the right state |
| `highlightElement` throws `ui-highlight.js: HTTP …` | The overlay asset could not be loaded | Report it — the app install is incomplete; explain in chat instead |
| `fetch("app-asset://…")` fails inside a browser page | Expected — browser pages have no access to app assets, by design | Do not work around it; use the plain-border form above |
| Tab shows no language button | The editor declares no language (grids, notebooks, browser, boards) | Say so — it is not a failure |
| Tab shows no title | The tab is pinned | Read the title from `list_pages` |
| `[data-name="menu-bar"]` exists but the user sees no menu | The backdrop is always in the DOM; `display: none` when closed | Click `[data-name="persephone-menu"]` to open it |

**The selectors in this guide are a stable contract.** They will not be renamed without this
guide being updated in the same change. `data-name` values *not* listed here — inside editors,
in dialogs, in popup menus — carry no such promise; reach those through
`browser_snapshot({ pageId: "app" })` instead.

## Where to go next

- `read_guide("ui-editors")` — the editor catalog: what each editor is for, how the user opens
  it, what it can do.
- `read_guide("pages")` — editor ids, required languages and title suffixes, and creating,
  reading and updating pages as an agent.
- `read_guide("browser")` — snapshots, refs, clicking and typing, including `pageId: "app"`.
- `read_guide("boards")` — building a custom mini web-app for the user.
