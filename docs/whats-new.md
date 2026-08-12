[← Home](./index.md)

# What's New

Release notes and changelog for Persephone (formerly js-notepad).

---

## Version 4.0.21 (Upcoming)

### Improvements

- **Boards can read and write files as raw bytes** — `persephone.readFile(path, { encoding: "binary" })` now returns a `Uint8Array` instead of forcing binary content through base64, and `writeFile` accepts one. This is what a board hands straight to a PDF, spreadsheet or image parser, so opening a large file gets faster and uses roughly a third of the memory it used to. It also removes a hard limit: a file over about 400 MB could not be opened by a board at all, because its base64 form exceeded the browser's maximum string length. `"utf8"` (the default) and `"base64"` are unchanged — the latter is still the right choice when you actually want base64, such as building a `data:` URI. An unrecognised encoding is now reported as an error instead of quietly falling back to text. Boards that use the new encoding declare `"minAppVersion": "4.0.21"`.

---

## Version 4.0.20

### Improvements

- **AI agents can now explain Persephone itself, and point at things on screen** — Two new MCP guides teach an agent the app rather than just the API: `read_guide("ui")` covers the always-visible interface (the Persephone menu glyph, tab strip, add-page button, window controls, zoom/MCP/Mneme indicators, the Menu Bar and its folders, sidebar panels, page grouping, and where Settings lives), and `read_guide("ui-editors")` is a catalog of every editor — what it is for, how you open it, and what it can do. So questions like "where do I change the language of this tab?" or "what can this app open?" now get a real answer instead of a guess. Alongside them, an agent can **highlight an element in the Persephone window** — an orange ring around the control with a short explanation card you can dismiss (press `Esc` or click Close). The highlight looks the same in every theme on purpose, so you always know the agent put it there and not the app. Highlighting works in the Persephone window and in boards; web pages in the built-in browser are not supported, and the guide tells agents to say so rather than pretend otherwise. See [MCP Server Setup — Available Resources](./mcp-setup.md#available-resources).

- **Settings now apply immediately when the file changes on disk** — Editing `%APPDATA%\persephone\data\appSettings.json` outside the app (for example, by an AI agent helping you set Persephone up) previously updated the value and the Settings toggle but did not actually *do* anything: switching `mcp.enabled`, `mcp.browser-tools.enabled`, or `mneme.enabled` in the file left the server or sidecar in its old state. Those settings now take effect the moment the file is saved, with no restart, exactly as if you had used the Settings page. Persephone also writes a header and a fuller comment for every setting into the file — accepted values, defaults, and the gotchas (a port change needs the feature toggled off and on again to move a running server).

- **`README.txt` now ships in the installation folder** — A short orientation file sits beside `persephone.exe`, describing what Persephone is and linking to the project. It also tells an AI agent the three things it cannot work out on its own: the complete set of MCP guides is already on disk under `resources\assets\` and readable with no MCP connection and no network, how to switch the MCP server on by editing the settings file, and which features (Git, Mneme, MCP) are off until you enable them. This is what makes an agent useful on a fresh install, before anything is connected.

- **MCP guides for AI agents — new overview and browser guides, every guide gets an "Errors & verification" section** — Two new guides: `read_guide("overview")` gives an AI agent the mental model (windows, pages, editors, boards, tools) plus a task → tool → guide routing table, the recommended starting point for any agent new to Persephone; `read_guide("browser")` documents the exact page-targeting resolution used by `browser_*` tools, the accessibility snapshot format, when element refs go stale, and waiting strategies. Every existing guide (`ui-push`, `pages`, `scripting`, `notebook`, `links`, `graph`, `boards`, `tools`) now has an "Errors & verification" section describing failure modes agents actually hit. The force-graph data format is now documented only in the `graph` guide (the `pages` guide points there instead of duplicating it), and its documented option defaults were corrected to match the code (`charge: -70`, `linkDistance: 40`, `collide: 0.7`). See [MCP Server Setup](./mcp-setup.md#available-resources).

- **MCP resource URIs renamed `notepad://` → `persephone://`** — All MCP guide resources now use the `persephone://guides/*` URI scheme (e.g. `persephone://guides/pages`) instead of the old `notepad://guides/*`. This only affects AI clients that hardcoded the old URI scheme directly — the `read_guide` tool and guide names (`"pages"`, `"scripting"`, etc.) are unchanged. See [MCP Server Setup — Available Resources](./mcp-setup.md#available-resources).

- **`open_url` and `open_board` MCP tools now return the opened page's ID** — Both tools now return `{ opened, pageId, title }` instead of just `{ opened }`, so an AI agent can pass `pageId` to `browser_*` tools (or `board_refresh`) to target the exact page it just opened, instead of relying on it staying the active tab. See [MCP Server Setup](./mcp-setup.md#available-tools) and [Boards — MCP tools for boards](./boards.md#mcp-tools-for-boards).

- **`app.pages.openUrlInBrowserTab()` now returns the opened page's ID** — Previously resolved to `void`; it now resolves to the target page's `id` (`Promise<string>`), useful for scripts that need to act on the browser tab right after opening it. See [Scripting API — app.pages](./api/pages.md#openurlinbrowsertaburl-options--promisestring).

- **Persephone can now open folders from outside the app** — Passing a folder path on the command line, or using the new **"Open with persephone" for folders** Explorer context-menu entry, now opens that folder in a new tab with the File Explorer panel rooted at it — the same page you get from the **Open Folder** pinned tool or double-clicking a folder in the sidebar. Previously this silently did nothing. The installer's **Additional Options** page changed to match: the file association option is now explicitly worded **"Open with persephone" for files** and a new, separately-checkable **"Open with persephone" for folders** option sits next to it (both checked by default). See [Getting Started — Installation](./getting-started.md#installation).

- **The installer no longer offers to be the default app for a fixed list of text-file extensions** — The old **"Set as default app for text files"** option (`.txt`, `.log`, `.md`, `.js`, `.ts`, `.jsx`, `.tsx`, `.json`, `.xml`, `.html`, `.css`, `.py`, `.java`, `.c`, `.cpp`) is gone. Persephone opens essentially anything, and what it can't open natively, an installable board or a viewer you build can — so claiming a fixed extension list no longer made sense. **If you upgrade from an older version that had this option checked, those file associations are released** — each extension goes back to whatever app handled it before, nothing is silently kept. See [Getting Started — Installation](./getting-started.md#installation).

- **New setting — turn off "keep running in the tray"** — Persephone has always hidden into the notification tray when you close its last window, keeping background services (MCP server, Mneme) running, and that's still the default. A new **Window Behavior** section on the Settings page (right after Theme) adds a checkbox, **"Keep running in the tray after closing the last window"** (on by default). Turn it off and closing the last window quits Persephone outright, stopping background services with it. Settings file key: `window.close-to-tray` (boolean, default `true`). The tray's **Quit** always exits regardless of this setting. See [Getting Started — Window Behavior](./getting-started.md#window-behavior).

---

## Version 4.0.19

### Improvements

- **Published boards now show a screenshot in the catalog** — Each board's card in the **Search boards** tab (Tools & Editors hub) now shows a screenshot alongside its name, version, size, description, and file types, and the **Board Info** page shows the same screenshot in both its install and properties views. A board with no screenshot, or one that can't be loaded (e.g. while offline), shows a neutral placeholder instead so cards stay evenly sized. All eight boards in the catalog — DrawIO Viewer, Excel Viewer, PDF Viewer, PE Viewer, PowerPoint Viewer, SQLite Viewer, Todo, and Word Viewer — now have screenshots and were bumped to a new version, so if you already have one installed you'll see an "Update available" badge. See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

- **File dialogs now remember the last folder you used** — Every native Open File, Save File, and Open Folder dialog in Persephone now opens where you left off, instead of always starting at a default location. Each dialog kind remembers its own folder: saving a drawing export or a Rest Client response starts the next Save dialog in that same folder (with the suggested file name unaffected), and separately, opening a file or opening a folder each starts where you last opened one. Browser downloads share the save-folder memory — a fresh profile starts in your Downloads folder, then follows wherever you last saved to. The memory is shared across all open windows and survives an app restart. A few dialogs deliberately keep their own placement instead: **Save As** on a file that already has a path still opens next to that file, and the Settings and board-path pickers still open at their configured location.

- **Explorer content search no longer freezes the app on large folders** — Searching file contents now runs in the background instead of on the main thread, so the app stays fully responsive while a big search is in progress. Results stream in progressively in batches instead of one file at a time, keeping the panel smooth as matches accumulate. Closing the search panel or changing the query now cancels the running search immediately, and the search also stops cleanly if you close the window or exit the app mid-search. A search also now stops after 10,000 matched lines, with the status line reading "N matches in M files (first 10000 results — refine your search)" — narrow your query if you hit it. Also new: a **"search-exclude"** setting in Settings → File Search lists folders/globs content search always skips (defaults to `node_modules, .git`) — previously these were hardcoded and invisible. A plain name skips any folder with that name anywhere under the search root; a glob (containing `/`, `*`, or `?`) matches against the path relative to the search root. Excludes are never applied to the search root itself, so searching inside a `node_modules` folder searches it normally, while any `node_modules` nested inside it is still skipped. The search panel's own **Exclude** box adds to this setting rather than replacing it. See [Search in file contents](./tabs-and-navigation.md#file-explorer-panel).

### Bug Fixes

- **Tile views now show real thumbnails for images inside archives** — In the Folder View's tile modes (landscape/portrait), image files located inside an archive (e.g. `document.docx!word/media/image1.png`) previously showed the generic fallback icon instead of a preview. They now render their actual thumbnail, just like images in ordinary folders. This makes it easy to review or copy the images embedded in a Word/PowerPoint/Excel file: open the document in the Archive panel, navigate to its media folder, switch to a tile view, and see every embedded image as a visual contact sheet.

- **Selected tree row — chevron and level guides now follow the selection colors** — In a focused tree (Explorer, Archive, Mneme, script library, link categories), selecting a row painted the background and label with the selection colors as expected, but the expand/collapse chevron stayed its default dark color and the vertical level guides kept their light-gray color — both nearly invisible against the highlight, especially in light themes. Both now switch to selection-matching colors along with the rest of the row.

---

## Version 4.0.18

### Breaking Changes

- **The built-in PDF viewer has been removed** — Persephone no longer ships a built-in PDF viewer: the vendored pdf.js library was ~21 MB of the installer, shipped to every user whether or not they ever opened a PDF. PDF viewing is now an opt-in install from the published boards catalog — the **PDF Viewer** board (~3.5 MB download), hosting the same stock pdf.js viewer the built-in editor used, with the same search, thumbnails sidebar, document outline, page navigation, zoom / fit-width / fit-page, rotate, text selection and copy, print, and Save-as. It's read-only and fully offline, and opens local `.pdf` files, PDFs inside an archive (`archive.zip!doc.pdf`), and PDFs at `http(s)` URLs, just like the built-in viewer did. Install it from the **Tools & Editors** sidebar panel → **Open in new tab** → **Search boards** tab (requires Persephone 4.0.18 or later). Without the board: a local `.pdf` opens in the Text Editor (which warns instead of rendering it), and a `.pdf` at an `http(s)` URL opens in the built-in **Browser**, rendered by Chromium's own PDF viewer — this is new behavior; such URLs previously opened in the built-in PDF editor. The `"pdf-view"` editor id is also gone from the scripting/MCP editor-id list — **a script or MCP call passing it no longer works.** See [Editors — PDF Viewer](./editors.md#pdf-viewer) and [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

- **Board authors — Markdown Preview now has its own `editorPriority` slot** — Because Markdown files now default to Preview (see New Features below), a board that claims a `.md`/`.markdown` file needs `editorPriority` **above `10`** to become that file's default editor — Markdown Preview now sits at priority `10`, no longer sharing the Text Editor's floor of `0`. Built-in priority levels: Text Editor `0`, Markdown Preview `10`, compound-name editors (`*.grid.json`, `*.note.json`, …) `20`, Drawing `50`, image/archive/video viewers `100`. A board previously set to a priority of 1–10 to beat the Text Editor for a Markdown file now loses to Preview and becomes a switch option only — raise its `editorPriority` above `10` to keep it as the default. See [Boards — Custom editors](./boards.md#custom-editors--associate-a-board-with-a-file-type).

### New Features

- **Markdown files now open in Preview by default** — `.md`, `.markdown`, and every other recognized Markdown extension now open directly in the rendered **Preview** instead of the Text Editor, no matter how the file is opened — from the Explorer, a clicked link, drag-and-drop, a script, or an MCP tool. Nothing is lost: click **Text Editor** in the toolbar for the raw source, one click. This reflects how Persephone is actually used — far more as a documentation viewer than a Markdown editor. See [Markdown Preview](./editors.md#markdown-preview).

- **Tor browser — connection info dialog with exit IP and Reconnect** — A new **"?" button** on the toolbar, shown only in Tor mode, opens a dialog reporting the exit IP address a remote server actually sees, its approximate country/city, and whether traffic is confirmed to be exiting through Tor. A **Reconnect** button restarts the Tor daemon to get a fresh circuit (and usually a new exit node); if Tor selects the same exit again, the dialog says so. Reconnecting is app-wide — every open Tor page briefly shows "connecting" and recovers automatically. See [Browser — Connection Info and Reconnecting](./browser.md#connection-info-and-reconnecting).

- **"Copy board path" context-menu item** — Right-clicking a board in the **Boards** Explorer panel or the **Boards** tab of the Tools & Editors sidebar now offers **Copy board path**, copying the board's folder path to the clipboard. See [Boards — Managing boards](./boards.md#managing-boards).

- **Board custom editors can now be scoped to a folder (`folderMasks`)** — A board's `board-manifest.json` can add an optional `folderMasks` field alongside `fileMasks`, narrowing the association to files that also sit in a matching folder. For example, `"fileMasks": ["DASHBOARD.md"], "folderMasks": ["*/tasks"]` claims only a `DASHBOARD.md` directly inside a `tasks` folder, leaving every other `DASHBOARD.md` on disk to open normally. Folder masks are matched against the file's parent folder (case-insensitive, either slash style, anchored at the end of the path), support `*`/`?`/`**` globbing, and are shown on the Board Info page's "Editor for" row. The board's file icon is the one exception — it still shows for every name-matching file regardless of folder, since an icon lookup often has no path to check. See [Boards — Scoping to a folder](./boards.md#scoping-to-a-folder--foldermasks).

### Improvements

- **Board `fileMasks` can now target an exact file name** — A wildcard-free mask containing a dot, such as `"DASHBOARD.md"` or `"package.json"`, is now treated as a complete file **name** rather than an extension. Previously any wildcard-free mask was read as an extension (`"DASHBOARD.md"` became `*.dashboard.md`, which matched nothing), so a board could only claim a file *type*, never one specific file. Bare extensions are unchanged — `"drawio"` and `".drawio"` still mean `*.drawio`. One behavior change to be aware of if you author boards: a compound extension written without a leading `*` (e.g. `"grid.json"`) now means the exact file name `grid.json`; write it as `"*.grid.json"` to match every file ending in `.grid.json`. See [Boards — Custom editors](./boards.md#custom-editors--associate-a-board-with-a-file-type).

- **Markdown Preview — anchor links (`#fragment`) now work** — A link like `[text](../doc.md#heading)` now opens the target document and scrolls to that heading, and a same-document link like `[text](#heading)` scrolls in place without navigating or adding a back-history entry. Previously these links either did nothing or produced a "File not found" error. Rendered headings get stable, GitHub-style anchor ids, and fragment matching is tolerant enough to resolve both GitHub-style and Azure DevOps wiki-style fragments against the same heading. Works for Azure DevOps wiki links and `mneme://` documents too; Ctrl+click still opens the link in a new tab. See [Markdown Preview](./editors.md#markdown-preview).

### Bug Fixes

- **Tor mode no longer falls back to your normal connection (security fix)** — A Tor browser page could load pages over your regular internet connection instead of through Tor, revealing your real IP address. Two situations caused it: opening **Browser (Tor)** with a URL loaded that first page immediately, while the Tor daemon was still connecting (which takes seconds), and if the daemon failed to connect at all, the page kept browsing normally — the status overlay reported the failure, but browsing still worked, over the open internet. The Tor proxy is now applied to the page *before* anything can load, so both cases now **fail with a proxy error instead of loading directly**. Related: if the Tor daemon stops unexpectedly, the status dot now turns red instead of staying green. **Behavior change to expect:** a Tor page opened with a URL will not load that page until Tor connects — wait for the green dot and reload. A visible failure is the point; the previous silent success was the leak. See [Browser — Nothing loads outside Tor](./browser.md#nothing-loads-outside-tor).

- **Board editor-switch buttons no longer change while a board is active** — When a trusted board is registered as a custom editor for a file (a "simple" board — the `editorKind: "simple"` default), the switch buttons used to change while the board was showing — for example, opening a Markdown file's board editor made the **Preview** button disappear, only to reappear after switching to Text Editor first. The full set of switch buttons now stays visible and in a stable order regardless of which editor is active, so you can jump straight from the board to any other editor. Content-host boards were unaffected. See [Boards — Custom editors](./boards.md#custom-editors--associate-a-board-with-a-file-type).

- **Link editor bookmark images no longer leak your IP in Tor mode** — Bookmark thumbnails and preview images shown in a Tor browser page's Link Editor (blank tab, bookmarks drawer, tooltips, Edit Link dialog) are now fetched through the page's Tor connection instead of going out directly. If Tor isn't connected yet, a placeholder is shown instead of fetching anything. Adding a bookmark while browsing in Tor mode also no longer saves a favicon to disk. See [Browser — Bookmark Images in Tor Mode](./browser.md#bookmark-images-in-tor-mode).

- **`app.boardVars` now works from a script** — The scripting namespace an AI agent uses to provision a board's environment variables ahead of time (introduced in 4.0.17) was `undefined` in scripts, so every call failed with *"Cannot read properties of undefined"*. It is now reachable, and the documented flow (`namespaceFor` → `set` / `get` / `list` / `listNamespaces` / `show`) works as described. See [app.boardVars](./api/app.md#boardvars).

- **Link editor view-mode switch (List / Landscape / Portrait) now updates immediately** — Switching view modes in the Link Editor used to leave the previous layout on screen until some unrelated change triggered a re-render. The switch now takes effect right away.

- **Browser automation — clicking/hovering/typing by ref now works on plain `<div>`/`<span>` rows** — `browser_click { ref }` (and `browser_hover` / `browser_type` / `browser_select_option` / focus by ref) used to throw `TypeError: this.scrollIntoView is not a function` whenever the ref came from a `StaticText` line in a `browser_snapshot`. This happened whenever a row had no ARIA role of its own (custom lists, sidebar panels, tag chips built from unstyled `<div>`/`<span>` elements), which is common — and since the StaticText ref was often the only ref on such a row, it made the row unclickable by ref at all. Refs now resolve to the element that displays the text, so the click/hover/type reaches the row as expected.

- **Theme shortcuts now work inside a board** — `Ctrl+Alt+]` (next theme) and `Ctrl+Alt+[` (previous theme) did nothing while the focus was inside a board, so you had to click somewhere else in the app first — awkward when checking how a board looks across themes, which is exactly when you cycle them. Both shortcuts now work with focus anywhere in a board. A board that binds either combination for its own use still takes precedence. See [Keyboard Shortcuts](./shortcuts.md).

- **Collapsing an Explorer folder now also collapses its subfolders** — Previously, collapsing a folder left its subfolders' own expanded/collapsed state untouched. Since the tree also refreshes when files change on disk or when you click a file and the page navigates, a subfolder left expanded this way could end up showing an open chevron with no contents underneath, and collapsing then re-expanding it was the only way to make it load again. Collapsing a folder now closes every subfolder inside it too, so re-expanding it always shows a fully closed subtree. See [File Explorer Panel](./tabs-and-navigation.md#file-explorer-panel).

- **Bookmark star button no longer waits on a busy page** — Clicking the star button to bookmark a page did nothing while the page was still loading, because the dialog waited on a page probe that collects suggested images (`og:image`, `twitter:image`, and similar) — a probe a loading or busy page might not answer for a minute or more. Clicking again while it was still working queued another attempt, so a burst of dialogs could open at once once the page finally responded. The star button now opens the **Add Bookmark** dialog immediately with the URL, title, and favicon it already knows, and gives the image probe at most one second to add suggested images before showing the dialog without them; a repeated click while the dialog is still opening is now ignored. The same one-second limit applies to the right-click **"Add to Bookmarks"** context-menu item. See [Bookmarks](./browser.md#bookmarks).

---

## Version 4.0.17

### New Features

- **Boards — a private, optionally-encrypted secrets store (`persephone.var.*`)** — A board can now read and write its own connection strings, API keys, and passwords through `persephone.var.get(name, env?)` / `.set(name, value, env?)` / `.list(env?)` / `.show()`, backed by a single `.env.json` file kept **outside every board folder** so copying, sharing, or committing a board never leaks its secrets. The file's location is a new Settings entry (**Board Environment Variables** — Browse/Create/Unlink), and it can optionally be password-encrypted using Persephone's existing file-encryption feature. Each board is isolated to its own namespace (its manifest's `author`/`name`, or its folder path when either is unset) — a board can never read another board's variables. The first-ever call on a machine with no store configured shows a one-time "Create environment variables storage" dialog; an encrypted, locked file prompts for its password once per session. All calls are async and reject on decline/cancel/lock, so a board must handle rejection. A new built-in editor for `*.env.json` files lets you review and edit the file directly, grouped by board and profile. Registering a board whose namespace collides with an already-registered board now shows a non-blocking advisory dialog instead of silently sharing storage. See [Boards — Environment variables](./boards.md#environment-variables--secrets-outside-the-board-folder).

- **AI agents can provision a board's secrets ahead of time (`app.boardVars`)** — A new scripting namespace lets an agent set up a board's environment variables before the board ever runs — for example, right after scaffolding a board that needs a database connection — instead of asking you to open the `.env.json` editor by hand: `app.boardVars.namespaceFor(boardRoot)`, `.get()` / `.set()` / `.list()` / `.listNamespaces()`, and `.show(namespace?)`. Unlike a board's own `persephone.var.*` (locked to its own namespace), `app.boardVars` can target any namespace, since scripts already run with the same trust level as `app.fs`/`app.settings`. See [app.boardVars](./api/app.md#boardvars).

- **Boards — a default right-click menu, with no board code required** — Right-clicking inside a board now behaves like right-clicking anywhere else in Persephone: a link offers **Open Link** / **Copy Link**, an image offers **Open Image in New Tab** / **Copy Image** / **Save Image As…**, a text field or text area offers **Cut** / **Copy** / **Paste**, and selected text offers **Copy**. This applies to every board automatically — a board author who wants their own custom menu instead can call `event.preventDefault()` in their own `contextmenu` handler to opt out. See [Boards — Default right-click menu](./boards.md#default-right-click-menu).

- **Content-host boards can set their own footer status text (`persephone.setStatusText()`)** — A content-host board (one that shares Persephone's file-handling machinery — see [Content-host editors](./boards.md#content-host-editors--sharing-persephones-file-with-the-board)) can now show its own status text in the same footer bar the built-in editors use, for example a Todo board showing its `"12 items"` count the way the built-in Todo editor does. Call `persephone.setStatusText(text)` with any string; `""` clears it. See [Boards — Content-host editors](./boards.md#content-host-editors--sharing-persephones-file-with-the-board).

### Breaking Changes

- **The built-in Todo editor has been removed** — Persephone no longer ships a built-in Todo editor: the `ToDo` editor (`todo-view`), the `page.asTodo()` scripting facade, and the `todo` MCP guide are all gone. `.todo.json` files now open like any other JSON file (Text, with a Grid switch if the content is an array of objects) instead of the dedicated task-list interface. The replacement is the published **Todo board** — a content-host board with the same multi-list, tags, drag-to-reorder, and search functionality — install it from the **Search boards** tab of the Tools & Editors hub (or the **+** entry that appears in the editor-switch control when you open a `.todo.json` file). The Todo board requires Persephone 4.0.17 or later. See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

### Bug Fixes

- **Content-host boards now match their built-in editor's chrome** — A content-host board (for example, a published Todo board that reimplements the built-in Todo editor) was missing the **Text Editor** option in the editor-switch control whenever its file's built-in editor offered more than one option — a `*.todo.json` file showed only `ToDo | Todo`, with no way to reach Monaco — and the board showed no footer at all: no `script` toggle and no encoding label. Both are fixed: a content-host board now offers the same switch options as its built-in editor (`Text Editor | ToDo | Todo`) and shows the same footer — the `script` toggle (opens the Script Panel to run a script against the file's content) and the encoding label with its provider icon. See [Boards — Content-host editors](./boards.md#content-host-editors--sharing-persephones-file-with-the-board).

- **Boards — clicking a link no longer blanks the board** — A hyperlink inside a board (for example a link in a document shown by a viewer board) used to navigate the board's own frame to the URL, which its locked-down origin can't load — leaving the board a blank white screen. External links are now intercepted and opened through Persephone's normal open flow (a new page or the browser) instead, so the board stays put. Links within the board itself still work as before. This applies to every board automatically.

---

## Version 4.0.16

### New Features

- **Boards — a guaranteed Node.js backend with `persephone.executeNode()`** — `persephone.execute("node script.js")` only works if the user's machine happens to have Node installed; a board can now call `persephone.executeNode(script, args?, options?)` instead to run the script on **Persephone's own bundled Node runtime**, so it works on any machine with zero setup — no Node or Python install required. Arguments are passed argv-style with no shell involved (no quoting hazards), and it returns the exact same process handle as `execute()` — buffered getters, streaming, stdin, and `kill()` all work the same way. The runtime includes `node:sqlite` (with FTS5), so a board can query a SQLite database with no `npm install` at all. Because the handle keeps stdin open, a board can also spawn one long-lived script for its whole session and feed it requests as JSON lines instead of spawning a process per operation. See [Boards — a guaranteed Node backend](./boards.md#persephoneexecutenodescript-args-options--a-guaranteed-node-backend).

- **Boards can now render Persephone-style chrome** — Three new theme variables join the board `--p-*` palette: `--p-bg-dark` (the app's own title bar / sidebar / grid header color — darker than `--p-panel`), `--p-hover` (hover background for list items and buttons), and `--p-tree-selection` (selected-row background). Previously a board had no real token for these — it either lightened `--p-panel` for chrome (looking noticeably lighter than the app's own toolbars) or faked hover/selection with the modal-scrim `--p-overlay`, which looks wrong on themes that hue-shift their chrome color. All three update live on a theme switch like the rest of the palette. See [Boards — Theme](./boards.md#theme).

---

## Version 4.0.15

### Bug Fixes

- **Custom-editor boards — the switch no longer strands you when a simple board shares a ZIP-based file with the Archive Editor** — For a **simple** custom-editor board (e.g. an Excel viewer board associated with `*.xlsx`), switching from the board to its built-in peer previously made the editor-switch control disappear entirely whenever that peer was the **Archive Editor** (the built-in editor for ZIP-based files like `.xlsx`/`.docx`) — leaving no way back to the board. Opening the board's **Board properties** screen had a similar problem: it lost track of the file the board came from, showing only **Text | +** instead of the file's real editors. Both are fixed: the Archive Editor now participates in the switch like any other built-in editor, and **Board properties** remembers the originating file, so its switch offers the file's real editors and **Open board** returns you to the board with the file loaded. See [Boards — Custom editors](./boards.md#custom-editors--associate-a-board-with-a-file-type).

- **PDF Viewer showed a blank page** — Opening a `.pdf` file could show a blank, empty viewer instead of the document — a regression introduced by the recent platform upgrade to Electron 43 (see [Platform and dependency updates](#version-4014)). PDFs now open and render normally again.

- **The "+" install switch could get stuck on a ZIP-based file already open in the built-in Archive Editor** — For a `.xlsx`/`.docx`/`.pptx` file with a matching published board not yet installed, clicking the editor-switch's **+** entry could show "No installable editor is published" instead of the board, and the tab's file name and the switch's **Archive** label could disappear. Fixed: the install screen (**Board Info**) now correctly lists the matching published board, the tab keeps the file's name, the switch stays **Archive | +**, and switching back to the built-in Archive Editor works as expected. See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

- **The Tools & Editors hub page could vanish after restarting Persephone or dragging its tab to a new window** — Fixed: the hub page is now restored correctly in both cases. See [Tools & Editors](./tabs-and-navigation.md#tools--editors).

### Improvements

- **Tab-bar "+" dropdown — "Show All…" now opens the full Tools & Editors hub page** — Previously it opened the compact sidebar panel; it now opens the same full-page hub you get from the panel's **Open in new tab** button, which also includes the **Search boards** tab for browsing the published boards catalog. See [Tools & Editors](./tabs-and-navigation.md#tools--editors).

---

## Version 4.0.14

### New Features

- **Boards can now be custom editors for a file type** — A trusted [Board](./boards.md) can declare in its `board-manifest.json` that it handles certain files: `fileMasks` (glob patterns matched against the file name, e.g. `*.drawio`), an optional `editorPriority` (whether the board becomes the file type's **default** editor or is offered only as an option), an optional `editorName` (the label shown for it), and an optional `editorKind` (`"simple"`, the default, has the board read/write the file itself; `"content-host"` lets Persephone own the file instead — see below). Open a matching file and the board appears in the toolbar's editor-switch control right next to its normal editor(s) — click to flip between them, and if its priority is high enough the board opens automatically instead of the Text Editor. The page tab shows the file's name (not the board's folder name), and wherever the board wins as the file's default editor, its icon also replaces the generic file icon in the File Explorer tree, other file lists, and page tabs. Switching away from unsaved changes in the built-in editor to a **simple** board runs the normal Save/Don't Save/Cancel prompt first. This makes it practical to offload a niche or heavy file-format viewer to a portable board instead of built-in Persephone code — for example, a viewer board for `.drawio` (diagrams.net) diagrams. See [Boards — Custom editors](./boards.md#custom-editors--associate-a-board-with-a-file-type).

- **Content-host boards — a board can let Persephone own the file it edits** — Setting `"editorKind": "content-host"` on a custom-editor board (instead of the default `"simple"`) makes Persephone build it with the same file-handling machinery as the Text Editor and Grid: the content pipe, encoding detection, encryption, the auto-save cache, and dirty/unsaved-changes tracking (the tab's unsaved dot, the "Save changes?" prompt). Two practical gains over a simple custom-editor board: it can open files beyond your local disk — over `https://`, inside an archive, or encrypted — and it **shares its content live** with the Text Editor/Grid, so switching between the board and Monaco carries your current edits across with no reload and no data loss. It also works on a page that has never been saved to disk — rename a new (untitled) page's tab to a name matching the board's file mask (e.g. `diagram.drawio`) and the board appears in the switch control right away, with no save required first. Inside the board, content is read and written through `persephone.host.getContent()` / `setContent()` / `onContentChange()`, and pressing **Ctrl+S** anywhere in the board saves automatically with no board code required. The `.drawio` diagram viewer board now works this way: it renders the diagram from content read via `persephone.host.getContent()`, and switching to the Text Editor to hand-edit the raw XML round-trips back to an updated diagram the moment you switch back. See [Boards — Content-host editors](./boards.md#content-host-editors--sharing-persephones-file-with-the-board).

- **Boards can now contribute sidebar panels — secondary views with shared state** — A board is no longer limited to its single main view: it can declare one or more **secondary views**, extra pages that open as their own sidebar panels alongside the board (declared in `board-manifest.json`, or added/removed while the board runs). The main view and every secondary panel stay synchronized through a shared-state channel the board author controls — pick something in a sidebar panel (a list, a filter) and the main view updates instantly, and vice versa. A board can choose to have specific pieces of that shared state remembered across app restarts and board reloads, so a selection is still there next time you open the board. This is the same "main view + coordinated sidebar panel" shape as built-in editors like Todo, now available to boards you or an AI agent build. See [Boards — Secondary views](./boards.md#secondary-views--a-boards-own-sidebar-panel).

- **Discover and install boards published by the project — right from the file you're opening** — Persephone now maintains a small catalog of ready-made boards (custom editors and tools) it publishes, refreshed automatically in the background. Open a file whose type has no editor installed yet, but that matches one of these published boards — a `.drawio` diagram, for example — and the editor-switch control shows an extra **+** entry (`Text | +`) next to Text. Click it to open the new **Board Info** screen: it shows the board's name, version, description, and download size, and installs in two explicit steps. **Download** fetches and checksum-verifies the board with a byte-progress bar — this step trusts nothing; the board sits inert on disk, exactly like any other folder, so you (or your AI agent) can review its files first. **Register board** then shows the same trust dialog every board shows on first use — only after you accept does the file switch to its new editor. From then on the board behaves exactly like a board you built yourself. See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

- **Board updates and version rollback** — An installed board gets a quiet **"Update available"** indicator — a badge in the Tools & Editors panel's Boards list (with an **Update** action in its context menu) and a small dot on the board's own in-board **Properties** button — whenever the project publishes a newer compatible version. Updating swaps the board's files safely: the new version is downloaded and verified before anything currently installed is touched, so a failed or cancelled update never leaves you with a broken board. If the board is open or has background processes running, Persephone asks you to close its pages first (with a one-click **Close pages & continue** shortcut) before proceeding. The board's **Properties** screen (reached from the in-board toolbar, the Tools & Editors panel, or an update indicator) also lists the board's full published version history, so you can roll back to an older version the same safe way, and **Uninstall** removes an installed board's files entirely. See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

- **Tools & Editors hub — a full-page view of your editors, boards, and the published-boards catalog** — The sidebar **Tools & Editors** panel gained an **Open in new tab** button that opens the same content as a dedicated page instead of a slide-out panel. The hub adds one thing the panel doesn't have: a **Search boards** tab that browses and filters the whole catalog of published boards and lets you install one directly — no matching file needs to be open. Its **Refresh catalog** button forces an immediate catalog check. See [Tools & Editors](./tabs-and-navigation.md#tools--editors).

- **File Explorer — drag a file out to Windows Explorer or Teams** — Drag a file from the File Explorer tree (sidebar or page panel) onto Windows Explorer to copy it there, or onto a Microsoft Teams chat compose box to attach it — the same native drag Explorer itself uses. No modifier key needed — a plain drag now does it. Dragging the file onto another folder in the tree instead (rather than out to the OS) asks whether to **Move** or **Copy** it there, so the choice is always explicit. Currently works one file at a time. See [File Explorer Panel](./tabs-and-navigation.md#file-explorer-panel).

- **Sidebar — "Open in New Tab" for custom folders** — Right-click a custom folder shortcut in the sidebar's left panel and choose **Open in New Tab**, doing the same thing as double-clicking the folder or clicking its chevron (▶) icon: opens a new tab with the File Explorer panel showing that folder's contents. See [Sidebar — Left Panel](./tabs-and-navigation.md#left-panel--folder-list).

- **"Open Terminal here" — a right-click terminal shortcut on folders** — Right-click any folder — in the File Explorer tree, the sidebar's flat Custom Folder list, or the App bar left panel's pinned Custom Folders — and choose **Open Terminal here** to launch a terminal window rooted at that folder. Windows only. A new **Settings → Terminal** dropdown lets you pick which terminal is launched (PowerShell 7, Windows PowerShell, Command Prompt, or Windows Terminal); leave it on **Auto-detect** (the default) and persephone picks the best available option the first time you use the feature (preferring `pwsh`, then `powershell`, then `cmd`) and remembers your choice. See [Open Terminal here](./tabs-and-navigation.md#open-terminal-here).

### Improvements

- **Boards — open an image as a new Drawing (Excalidraw) tab** — `persephone.openRawLink(imageDataUrl, { editor: "draw-view" })` (and `app.openRawLink` in scripts) now accepts an image `data:` URL and opens it as a new, untitled, editable Excalidraw drawing with the image embedded — the same result as [`app.pages.addDrawPage()`](./api/pages.md#adddrawpagedataurl-title--promiseipage), reachable through the general-purpose link pipeline. Only an image `data:` URL triggers this; a real image file or a `.excalidraw`/JSON file still opens with its normal editor. See [openRawLink](./api/app.md#openrawlinkhref-options).

- **Agent Tools — `search_tools` finds tools by natural multi-word queries** — Previously, a search phrase like `"warehouse databricks sql customer"` returned zero matches even though every word individually appeared in a tool's metadata, because the whole phrase was tested as a single substring. Now the query is split into words and each word is matched independently, so tools matching any of the words are returned, ranked by how many words matched (a `score` field on each result). A toolset's own `name`, `description`, and `keywords` (declared once in its manifest) are now also part of the search, not just each individual tool's — so a shared term like a project or system name only needs to be declared in one place to make every tool in that toolset discoverable. See [Agent Tools](./agent-tools.md#using-tools-from-an-ai-agent-mcp).

- **Consistent selection highlighting across the app's lists** — The File Explorer tree's selection look — a subtle gray highlight when the list doesn't have keyboard focus, a stronger blue highlight with an outline when it does — now applies to every other selectable list in the app: the sidebar's App menu folder list, the Links editor's Tags/Hostnames/pinned panels and main list view, the Rest Client request tree, the Notebook's Categories and Tags panels, the Todo panel, and the MCP Inspector's Tools/Resources panels. These previously used a mix of different, always-on highlight colors with no distinction between a focused and unfocused list; now they all behave and look the same way as the File Explorer. This is a visual consistency change only — clicking, filtering, and keyboard behavior in these lists are unchanged.

- **About page — "Check for Updates" also refreshes the published-boards catalog** — Clicking **Check for Updates** on the About page now checks for a new board catalog alongside the usual app-version check, in one click, instead of only picking up newly published boards on the next automatic cycle (roughly once a day). The About page also now shows an **Available boards** count. See [Checking for Updates](./getting-started.md#checking-for-updates).

### Under the hood

- **Platform and dependency updates** — Persephone's runtime has been upgraded to Electron 43 (Chromium 150, Node.js 24), and the Monaco code-editing engine to 0.55. Widevine DRM playback (Netflix, Disney+, and similar in the built-in browser) continues to work as before. A number of other libraries were also brought current — including the Anthropic SDK powering the `ai` scripting namespace, and the CSV-parsing engine behind the Grid editor — with no intended change in behavior. These are maintenance updates only; check the [About page](./getting-started.md#checking-for-updates) if you want to see the exact Electron/Node/Chromium versions in your build.

### Bug Fixes

- **Built-in browser — Google (and similar) sign-in no longer blocked** — Signing into a Google account in the built-in browser could fail after entering your email with *"This browser or app may not be secure."* Google was rejecting the embedded browser because a Chrome-specific object (`window.chrome`) it inspects during page load was empty. Persephone now presents that object like genuine Chrome does, so sign-in proceeds to the password step normally. This is a compatibility fix only — it changes nothing about how pages are isolated or sandboxed. See [Built-in Browser](./browser.md).

- **Grid Editor — toggling "First row is header" (or changing the CSV delimiter) no longer blanks the grid** — In the CSV Options popup, switching **First row is header** on or off, or changing the delimiter, could leave every cell empty while the column headers stayed stuck on `0`, `1`, `2`, … instead of picking up the real column names. The grid kept its previous columns instead of re-deriving them from the newly reparsed rows, so cells looked up column keys that no longer existed. Columns are now rebuilt correctly whenever the header or delimiter setting changes. See [Grid Editor — CSV Options](./grid-editor.md#csv-options).

- **File Explorer — dropping files onto a folder now works, with a Move/Copy choice** — Dragging a file or folder onto a folder in the File Explorer tree — whether from Windows Explorer (or another app) or from elsewhere in the tree itself — previously either did nothing (no drop-highlight shown) or silently copied. It now always opens a **Move / Copy / Cancel** dialog so you choose the operation (folders are handled recursively), asking for confirmation before overwriting a same-named file. Dropping a file back onto the folder it already lives in does nothing. See [File Explorer Panel](./tabs-and-navigation.md#file-explorer-panel).

---

## Version 4.0.13

### New Features

- **Sidebar — "Add Folder" button** — The sidebar's left panel (folder list) now has a visible **Add Folder** button at the bottom, so adding a custom folder shortcut no longer requires knowing about the right-click context menu. Click it to pick a folder via the native folder dialog; it's added to your **Custom Folders** shortcuts just like before. The right-click **Add Folder** context-menu option is still available. See [Sidebar — Left Panel](./tabs-and-navigation.md#left-panel--folder-list).

- **File Explorer — Cut/Copy/Paste with Windows Explorer** — Right-click a file or folder in any File Explorer panel (the page-level panel or the sidebar's Custom Folder view) and choose **Cut** or **Copy**, then paste into Windows Explorer, or right-click a folder there and choose **Paste**. This works in both directions: files/folders copied or cut in Windows Explorer can be pasted into a Persephone Explorer panel, and files/folders cut or copied in Persephone can be pasted into Windows Explorer. It uses the real Windows clipboard (not just a path string), so cut items are genuinely moved once the paste succeeds, folders are copied recursively, name collisions prompt for overwrite confirmation, and large pastes show a progress indicator. `Ctrl+C`/`Ctrl+X`/`Ctrl+V` keyboard shortcuts for the same actions are described below. See [File Explorer Panel](./tabs-and-navigation.md#file-explorer-panel).

- **File Explorer — real selection, focus visuals, and keyboard navigation** — The Explorer tree (and the other tree-based sidebar panels — Mneme, Link, Archive) now tracks a genuine selection for both files and folders, matching VS Code. Selecting a folder keeps it highlighted even after its folder view opens in the main area (previously the highlight vanished immediately), and right-clicking a row selects it before the context menu opens. When the tree has keyboard focus, the selected row shows an accent highlight with a focus outline; move focus elsewhere and it falls back to a plain highlight instead of disappearing. Clicking a folder's label now only selects it — expanding or collapsing is chevron-only (or `ArrowRight`/`ArrowLeft` on the keyboard). Full keyboard navigation is available once the tree has focus: arrow keys, `Home`/`End`, `Page Up`/`Page Down` move the cursor, and `Enter` opens the highlighted row. New shortcuts on the selected row: `Ctrl+C`/`Ctrl+X`/`Ctrl+V` for the Windows-Explorer clipboard operations above, `Delete` to remove it (always with the existing confirmation dialog), and `F2` to rename it. Clicking a file or folder in the tree also no longer steals keyboard focus into the editor, so the selection stays visibly focused while you keep browsing with the keyboard — focus still moves to the editor normally when you activate a page (switching tabs, opening a new file). See [File Explorer Panel](./tabs-and-navigation.md#file-explorer-panel) and [Keyboard Shortcuts](./shortcuts.md#file-explorer-panel).

- **MCP — `get_page_content` and `get_active_page` can now read image pages** — Previously, asking an AI agent to read a Snip or an opened image page returned empty text with no explanation. Now `get_page_content` and `get_active_page` return the rendered picture directly as an image in the tool result — it works even for a background (non-active) tab. For other non-text pages (browser, board, video, PDF, and similar), the tools now return a short hint explaining how to read that page type instead of silently returning nothing. An oversized rendered image (over roughly 5 MB) falls back to a hint pointing the agent at saving it to disk with `page.asImage().savePngToFile(path)`. Text-based pages are unaffected — they keep returning their content exactly as before. See [MCP Server Setup](./mcp-setup.md#available-tools).

- **MCP — browser automation tools can now drive Persephone's own UI** — Pass `pageId: "app"` to any `browser_*` tool (`browser_snapshot`, `browser_click`, `browser_type`, `browser_press_key`, `browser_evaluate`, `browser_take_screenshot`, `browser_wait_for`, and more) to have an AI agent see and interact with Persephone's own main window — its tab strip, sidebar, toolbars, dialogs, and active editor — instead of a web page. Useful for reproducing UI issues or letting the agent help you navigate the app directly ("where is that setting?", "click through this for me"). The snapshot shows only the app chrome plus the active page's content; navigation and tab-management tools don't apply to the app window (use `list_pages` / `execute_script` instead). `pageId: "app"` must be requested explicitly — it's never used as a fallback, so normal browser and board automation are unaffected. Gated by the same **Enable browser interaction** setting as other `browser_*` tools. See [Automating Persephone's own UI](./mcp-setup.md#automating-persephones-own-ui).

---

## Version 4.0.12

### New Features

- **Agent Tools registry** — turn a working integration script into a reusable, parameterized **tool** that AI agents discover and run over MCP, instead of re-writing the same ad-hoc script every session. A *toolset* is a folder with a `tools-manifest.json` plus scripts in **any language**; once you register it, any MCP-connected agent finds its tools with `search_tools` and runs them with `execute_tool` (args in, JSON result out). Registering a toolset is a **user-only** trust decision — an agent can never silently register a folder: agent-initiated creation (`create_toolset`) shows a **"Register this toolset?"** confirmation dialog, and you can register a `tools-manifest.json` yourself via its **Open Toolset** icon in the File Explorer. Manage registered toolsets from the **Boards panel → Tools** switch or the **Tools & Editors panel → Tools** tab; open one to see its tools, requirements, and execution log. Secrets live in a per-toolset `.env` (never sent over MCP), and a toolset folder is self-contained so you can copy it between machines. See [Agent Tools](./agent-tools.md).

### Bug Fixes

- **Fixed child processes failing with missing environment variables in the installed app** — When Windows itself was running in a temporarily degraded state (for example, after Explorer crashed and restarted outside a normal logon), the installed Persephone app could inherit a stripped environment with only a handful of variables — missing `APPDATA`, `LOCALAPPDATA`, `ProgramData`, `ProgramFiles`, `ProgramFiles (x86)`, and similar standard Windows folders. Any board or script that shelled out to an environment-sensitive tool (`dotnet`, `npm`, `git`, `python`, etc.) via `execute()` could then fail with obscure errors (for example, NuGet's `Value cannot be null. (Parameter 'path1')` during `dotnet restore`). Persephone now backfills these standard folder variables at startup whenever they're missing, so child processes always see a complete environment regardless of how the app was launched.

- **Browser — fixed a slow memory leak from long-lived browser tabs** — Every time a browser tab navigated, a couple of internal event handlers used to track that tab were left behind instead of being replaced, so they quietly piled up over the tab's lifetime — visible in the background as a `MaxListenersExceededWarning` after roughly a dozen navigations on one tab. In long sessions with many navigations (ad-heavy or redirect-heavy sites in particular), this added up to a small but steadily growing amount of leaked memory that only a restart would clear. Navigation cleanup now fully removes the previous handlers before attaching new ones, so the count stays constant no matter how many times a tab navigates. Browser tabs also do less redundant internal work on each state update, which reduces CPU usage during heavy browsing.

---

## Version 4.0.11

### New Features

- **Boards — "Open in New Tab"** — Right-click a board in the **Boards** Explorer-sibling panel and choose **Open in New Tab** to open it in its own dedicated tab instead of replacing the current tab's content. A board opened this way keeps running (its iframe, and any dev-server process it spawned) while you work in other tabs — it's only disposed when you close that tab.
- **Boards — keep spawned processes alive across navigation** — A board can now call `persephone.setBoardBusy(true)` to declare that its spawned processes (e.g. a dev server) must keep running even after the board itself unloads — navigating its tab to a document, or clicking **Reload**. `persephone.getBoardBusy()` and the new `persephone.getJobs()` (plus named jobs via `execute(cmd, { name })`) let the board re-associate with its still-running processes the next time it loads. Processes are still stopped when the tab is closed or Persephone quits. Busy boards show a green "running" dot in the **Boards** panel. See [Boards — Long-running processes](./boards.md#long-running-processes-setboardbusy--getboardbusy--getjobs).

### Bug Fixes

- **MCP server — fixed a session leak / runaway "clients connected" count** — Persephone's MCP server kept a session for every client that connected but never released sessions for clients that disconnected without a clean shutdown (a Claude Code restart, a one-shot client, or a reconnect after sleep). Over a long-running session this accumulated — the Settings "N clients connected" indicator could climb into the hundreds — with each stale session holding memory. Idle sessions are now reaped automatically (after 30 minutes of inactivity), the count stays accurate, and the leaked memory is reclaimed. Reconnecting clients are unaffected.

---

## Version 4.0.10

### Bug Fixes

- **Boards — automation reads the up-to-date board after `board_refresh`** — When an AI agent rebuilt a board and called the `board_refresh` MCP tool, a follow-up `browser_snapshot` / `browser_evaluate` could attach to the wrong board frame — a sibling tab of the same board, or the lingering pre-reload frame — and report the board's pre-edit content, making the refresh appear to have had no effect even though the board itself had already updated. Each board frame is now tagged with a per-mount identifier, so the automation tools always target the exact frame belonging to the current tab.

---

## Version 4.0.9

### Bug Fixes

- **Boards — fixed "bridge did not connect" in the installed app** — In the v4.0.8 installed build, opening a board showed only its first paint and the board's log reported *"board bridge did not connect (the board loaded but its script bridge never initialized)"* — the board's `persephone` API never came alive, so nothing interactive worked. The board's connection handshake validated the host window's origin, but the installed app loads its window from `file://`, whose origin is reported inconsistently across the app's internals — so the check never matched and the connection was dropped. The handshake now only origin-checks development hosts and relies on the frame relationship otherwise, so boards connect correctly in the installed build. (Development builds were unaffected.)

---

## Version 4.0.8

### New Features

- **Screen Snip — capture any region from the window header** — A green **…** (three-dot) button in the Persephone window header (just before the Mneme indicator) opens a snip menu with two options:

  - **Snip Screen** — hides all Persephone windows, shows a dimmed overlay across all monitors, and lets you drag-select any region of the desktop. Press Escape or right-click to cancel.
  - **Snip Persephone** — keeps Persephone visible so you can capture its own content (an image, a web page, a diagram shown inside the app). The same drag-select overlay appears, but the app remains on screen.

  After selecting a region, the captured screenshot opens automatically in a new **Image View** tab. From there you can:
  - **Copy** the image to the clipboard (`Ctrl+C` or the toolbar button) — paste directly into Teams, Slack, Outlook, or any app that accepts images
  - **Save** the image to a file (toolbar save dropdown → **Save as .png** or **Save original**)
  - **Open in Drawing Editor** (toolbar button) — embed the screenshot into a new Excalidraw tab for annotation

  This complements the existing **Screen Snip** button in the Drawing Editor toolbar (scissors icon), which inserts the captured region directly into the drawing canvas instead of opening it as a standalone image.

  Works on multi-monitor setups with mixed DPI scaling.

- **Markdown Preview — in-page navigation and Back history** — Clicking a link to a local Markdown file (`.md` or `.markdown`) in the Preview view now loads the target **in the same tab** instead of opening a new one. The tab stays in Markdown Preview mode throughout.

  After the first such navigation, a **← Back** button appears in the Markdown toolbar. Clicking it returns to the previously-viewed document; repeated clicks walk the full history back to the original document, at which point the button disappears. The back history is **per-tab** and is **persisted** — it survives app restarts and moving the tab to another Persephone window.

  All other links behave exactly as before: `http`/`https` links, images, non-Markdown local files, `#fragment` anchors, and `mailto:` links all open in a new tab or follow current behavior.

  Notebook-embedded Markdown is not affected — links there continue to open in new tabs.

- **Markdown Preview — image hover toolbar** — Hovering over any rendered image in the Markdown Preview now reveals a small toolbar in the top-right corner of the image with two buttons:

  - **Copy** — copies the image to the clipboard as PNG. Paste directly into Teams, Slack, Outlook, or any app that accepts images.
  - **Open in new tab** — opens the image in Persephone's Image Viewer in a new tab. This button is hidden for embedded `data:` or `blob:` images (images that have no file path to open).

  This mirrors the hover toolbar already present on Mermaid diagrams in the Markdown view.

- **Mermaid Diagram Viewer — Convert to Excalidraw** — A new **Convert to Excalidraw** button (orange pencil icon) in the Mermaid viewer toolbar converts a diagram into native, individually-editable Excalidraw shapes — distinct from the existing **Open in Drawing Editor** button, which embeds the rendered diagram as a single flat image.

  - **Supported diagram types:** flowchart, sequence diagram, and class diagram convert to native shapes. Each node, label, and connector becomes a separate element you can move, resize, style, or delete independently. Text uses clean Helvetica (not Excalidraw's hand-drawn default font).
  - **Other diagram types** (state, ER, Gantt, pie, git graph, …) open in the Drawing Editor as a flat image — the same result as **Open in Drawing Editor** — and a notification explains that native conversion is not available for that type.
  - The converted drawing opens in a new tab in the Drawing Editor.

  | | Convert to Excalidraw | Open in Drawing Editor |
  |---|---|---|
  | Result | Native shapes — each element is individually editable | Single flat image — the diagram is embedded as a picture |
  | When to use | Rearrange nodes, change colors, edit individual elements | Add callouts or highlights on top of a diagram without breaking it apart |
  | Supported types | Flowchart, sequence, class | All types |

### Improvements

- **Explorer — dedicated open buttons for `.git` and `.mneme` rows** — In the File Explorer panel, the `.git` and `.mneme` special folder rows now have a small always-visible icon button on the right side of each row:

  - **`.git` row** → **Open Git Tree** button (git icon) — opens the Git Tree commit-history editor.
  - **`.mneme` row** → **Open Mneme Root** button (memory icon) — opens the Mneme root search editor.

  Clicking the row itself now behaves like any other folder — it expands or collapses the node and opens the folder's plain contents in the main area. Previously, clicking the row directly opened the dedicated editor, which made it impossible to browse `.git` or `.mneme` folder contents without immediately switching the active editor. The **Open Board** button on `board-manifest.json` rows is unchanged.

- **Markdown Preview — relative images and Azure DevOps wiki links** — The Markdown Preview now resolves image and link paths correctly:

  - **Relative images** — images referenced with a relative path (e.g. `![](images/diagram.png)`) now render inline in the preview. Previously the Markdown view never resolved image sources at all, so relative images appeared as broken placeholders.
  - **Azure DevOps wiki links** — when the `.md` file lives inside a git repository, root-relative ADO wiki paths are resolved against the wiki root (the folder that contains `.git`). A leading-slash image path such as `![](/.attachments/diagram.png)` resolves to `<wiki-root>/.attachments/diagram.png` and renders inline. A page link such as `[Page](/Area/Some%20Page)` navigates to `<wiki-root>/Area/Some-Page.md` in the same tab (in-page navigation, see above).

  No new settings or UI — both improvements work automatically.

- **Git — unified sidebar panel** — The two separate **Branches & Tags** and **Changes** sidebar panels have been merged into a single **Git** panel. The panel has three tabs: **Changes** (selected by default), **Branches**, and **Tags**, selectable via a segmented control. The Changes tab is unchanged — it still shows the Unstaged and Staged file lists with stage/unstage arrow buttons and the Commit button. The Branches tab shows local branches and remotes (with `/`-folder nesting); the Tags tab shows a flat tag list.

  The panel header now shows a static **"Git (N)"** title where *N* is the total number of changed files (unstaged + staged). This count is visible even when the panel is collapsed, so you can see at a glance which repositories have uncommitted work when multiple repos are open.

  The **AZ** sort toggle (alphabetical vs. most-recent-first ordering of branches and tags) has moved from the panel header to the panel body toolbar, where it appears only on the Branches and Tags tabs. The **Show Git Tree** (›) and **× Close Git Tree** controls remain in the panel header.

- **Boards — faster open** — Boards now open nearly instantly. The previous rendering engine required a cold-start setup step on every open, producing noticeable latency before the board appeared. The new engine eliminates that overhead — the board content is visible on the first paint.

- **Boards — folder no longer locked while open** — Opening a board no longer holds an OS lock on the board's folder. In previous versions, trying to delete or move a board folder while it was open in a tab would fail with "the file is in use by another process." The folder is now freely accessible while the board is open.

- **Boards — manual reload replaces auto-reload; new `board_refresh` MCP tool** — Boards no longer reload automatically when you edit `index.html`, `app.js`, or CSS files. To apply edits, click the **Reload** button in the in-board toolbar. This eliminates the occasional "blink" (multiple rapid remounts) that appeared when opening a board, and avoids unexpected reloads for boards that are simply in use.

  AI agents have a new MCP tool — **`board_refresh`** — to reload a board after editing its files:
  ```
  board_refresh({ pageId: "abc" })   // reload a specific board page
  board_refresh({})                  // reload the active board
  ```
  Returns `{ refreshed: true, pageId }`. Use it after file edits, then re-run `browser_snapshot` to see the updated board.

- **Boards — error indicator removed; log always accessible** — The red error dot that previously appeared on the in-board toolbar when `ui.log` contained errors has been removed. The **Show log** (log icon) button remains and opens `ui.log` at any time. The log file is now reset to a single `board loaded` line on every board open or Reload, so clicking Show log always opens a real, non-empty file — not an empty "deleted file" placeholder. Any errors that occur during a load are appended after that line.

- **Folder View — full context menu and New File / New Folder** — The folder-content page (opened by clicking a folder in the File Explorer or via a `tree-category://` link) now matches the File Explorer's feature set:

  - **Right-click a file or folder** — shows the full link context menu: **Open in New Tab**, **Open in New Window**, **Show in File Explorer** (and **Open in Browser** / **Open in Rest Client** for URL items). Previously only Copy Path, Rename, and Delete were available.
  - **New File and New Folder** — right-click empty space to create in the currently-viewed folder, or right-click a subfolder to create inside it. Only available for writable locations (file-system folders). Archive subfolders and other read-only providers are unaffected.

- **HTML Viewer — "Open in Browser" tab context menu item** — Right-clicking the tab of an `.html`, `.htm`, or `.xhtml` file now shows an **Open in Browser** item. Selecting it opens the local file in Persephone's built-in browser, so you can inspect it with full browser DevTools, follow hyperlinks, and test interactive behavior — without leaving the app.

- **HTML Viewer — clicking inside the preview closes open menus** — Clicking anywhere inside the HTML Preview pane now dismisses any open Persephone context menu or popover (such as a tab right-click menu that was left open). Previously those menus stayed visible after the click landed in the preview.

### UI Polish

- **Folder View — right-aligned footer** — The item count ("N items") in the Folder View footer is now right-aligned and uses the same height and font as the Monaco editor status bar, for a consistent look across editors.

- **Git Tree — commit message scrolls inside the panel** — In the **Commit** tab of the bottom panel, long commit messages now scroll within the tab itself instead of causing the entire bottom panel to grow and scroll. Switching between the **Commit** and **Diff** tabs no longer shifts the panel height.

- **Git Tree — Changes tab file lists have no grid lines** — The **Unstaged** and **Staged** file lists in the **Changes** tab of the **Git** sidebar panel no longer display cell border lines between rows. The lists have a cleaner, borderless appearance that matches the rest of the sidebar.

- **Boards sidebar — "+ New board" hidden when panel is collapsed** — The **New board** split-button in the **Boards** Explorer panel header is now hidden when the panel is collapsed, and visible when expanded. Previously the button remained visible even when the panel was collapsed, taking up space in the header bar.

- **Boards sidebar — colored panel icon** — The **Boards** panel header now shows a colored four-panel icon (blue/green/yellow/red quadrants) instead of the previous monochrome glyph.

### Bug Fixes

- **Markdown Preview — Azure DevOps wiki page links with dashes or parentheses** — ADO wiki page links whose on-disk slug contained dashes or parentheses — such as `[BRE](/Applications/Business-Rule-Engine-(BRE))` — previously failed with a "File not found" error. The link resolver was re-encoding the path, turning `-` into `%2D` and `(` into `%28`, so the resulting filename did not match the file on disk. The resolver now maps the path to the file name directly without double-encoding: literal dashes and parentheses are preserved, and only bare spaces are converted to dashes.

- **MCP / Mneme — connection stability on Windows** — Both the Persephone MCP server and the Mneme knowledge-base service now bind to `127.0.0.1` (IPv4 loopback) instead of the hostname `localhost`. On Windows, `localhost` often resolves to `::1` (IPv6) first; if nothing is listening on the IPv6 side the client stalls and eventually times out, causing the yellow Mneme status indicator and `-32001` connection-refused errors in the MCP Inspector. Using the literal IPv4 address eliminates the ambiguity.

  **If you connect an external agent or AI client** (Claude Code, Claude Desktop, ChatGPT, Gemini CLI, …) to Persephone's MCP server or to Mneme, update the URL in your config from `http://localhost:<port>/mcp` to `http://127.0.0.1:<port>/mcp`. The **Copy URL** and **Copy Config** buttons in Settings already produce the correct `127.0.0.1` address.

---

## Version 4.0.7

### New Features

- **Boards — Explorer-integrated switcher** — A new **Boards** panel sits alongside the File Explorer tree (just like the Search panel). Click the **Boards** button in the Explorer header to open it. The panel lists every trusted board under the current Explorer root as a folder tree — folder nodes collapse single-child chains VSCode-style (`projects\personal\boards`) and are fully expanded by default. Click any board to open it in the current tab.

  The panel header has a **New board** split-button:
  - **New board** — opens a dialog with a **Folder** input (defaults to the current Explorer root), a **Name** input, and a live **"Will be created at: …"** preview label. Both inputs are required; click **Browse…** to navigate to a different location.
  - **Create Demo board** — same dialog, same flow, but scaffolds the full annotated demo board instead.
  
  A **Delete Board** option is available in the board's context menu (right-click in the panel).

- **Boards — in-board toolbar** — Every open board now displays a thin toolbar above its content:

  | Control | Description |
  |---------|-------------|
  | File Explorer (folder icon) | Open the sidebar Explorer panel rooted at the board's parent folder. |
  | Board path label | The full path to the board. Click to open the **boards-switcher popover** (available when the board was opened from an Explorer Boards panel) — pick a sibling board to switch to it in the current tab. |
  | Reload | Remount the board to pick up edited files. |
  | Show log | Open `ui.log` in a new tab. |

  The Reload and Show-log buttons previously appeared on the (now-removed) Boards side-panel header — they are now always visible on the board itself.

- **Boards — inherited trust** — Trusting a folder covers every board nested inside it automatically. A board inside a trusted board opens with no prompt, is never separately stored, and does not appear in the boards tree as its own entry (it is already covered). Trusting a new board removes any descendant entries it supersedes.

### Improvements

- **Boards — read & write files from the page** — Two new bridge methods, `persephone.readFile(path, options?)` and `persephone.writeFile(path, data, options?)`, let a board read and write files directly — ideal for persisting small UI state (last filter, column layout) or loading a board-local config, without writing a backend script. Relative paths resolve against the board folder; text or base64 (binary) are both supported.
- **Boards — open a link in a specific editor** — `persephone.openRawLink(href, { editor })` (and `app.openRawLink` in scripts) can now request a specific editor — for example, open a Markdown document in the rendered Markdown view instead of its source.
- **Boards — easier component vendoring for agents** — The recommended-components catalog now carries a fetchable base URL, and `get_app_info` exposes the bundled resource paths, so an AI agent building a board can locate and download a recommended component's skin on any machine (skins are published on GitHub, not bundled in the installer).

### UI Polish

- **Boards — no white flash on open or switch** — Opening a board or switching between boards no longer shows a brief white flash before the themed content appears. The board's background color is now applied immediately on first paint.
- **Boards — Custom Boards & Editors tab uses the shared boards tree** — The machine-wide **Custom Boards & Editors** tab in the Tools & Editors panel now renders the same compacted folder tree as the Boards Explorer-sibling panel, with pin (hover-revealed, sticky when pinned) and **Remove** per board. Previously it used a flat folder-grouped list.

### Breaking Changes

- **Boards — `.persephone` project mode removed** — The `.persephone` special folder and the project Board editor that it opened are gone. Clicking a `.persephone` folder in the Explorer now opens it as an ordinary folder. Existing boards inside `.persephone/boards/` continue to work as before — they are just boards in a folder. The `persephone-folder://` link scheme is no longer recognized.

  **Migration:** any boards already trusted before this update remain trusted and appear in the **Boards** panel and the **Custom Boards & Editors** tab with no action required.

### Bug Fixes

- **Boards — bridge broken in the installed release** — In the 4.0.6 installed build, every board failed to initialize (`window.persephone` was `undefined`) because the board preload script was not included in the release package. All board operations — `execute()`, dialogs, navigation, theme — appeared to do nothing or threw immediately. Fixed: the board preload is now built and packaged correctly. Boards work in both the development server and the installed release.

- **Explorer — opening a modified file no longer opens a duplicate** — Clicking a file in the **File Explorer** sidebar that is already open in a tab (even with unsaved changes) now brings that existing tab to the front and shows it in the main view. Previously, if the file had been modified, a second editor was opened alongside the first, leaving two tabs for the same file.

- **Browser — bookmarks/links panel resizes live** — The **Collections**, **Tags**, and **Hostnames** sidebar panels on the browser's blank (new-tab) bookmarks page now resize fluidly when you drag the sidebar splitter. Previously the panel content was frozen at the width it had when the page first loaded and did not respond to splitter drags.

---

## Version 4.0.6

### New Features

- **Boards** — A new kind of editor that lets you (or an AI agent) build fully custom HTML-page applications that run locally inside Persephone. A board is a plain HTML page backed by scripts in any language; Persephone hosts the page in a sandboxed webview and injects a single bridge object, `window.persephone`. A board is any folder containing a `board-manifest.json` file, and it can live anywhere on your machine.

  **Getting started:**
  - Right-click any folder in the **File Explorer** sidebar and choose **"Create .persephone project"** — this creates the `.persephone` folder, auto-trusts the project, and opens the **Board editor** immediately.
  - In the Board editor, click **"+ New board"** to scaffold a board from the built-in template, or **"Create Demo board"** to install a full working example.
  - Or open an existing board directly: right-click any `board-manifest.json` row in the **File Explorer** and click the **Open Board** button that appears on the row.

  **The bridge — `persephone.execute(commandLine)`** — calls a backend script (Node.js, Python, PowerShell, shell, or any other language) and returns a process handle. Consume the result buffered (`await handle.getJson()` / `getText()`) or streamed (`handle.on("stdout", cb)`). This single primitive covers everything: load data, run a command-line tool, write a file, start a long-running process, or send/receive over stdin. A small integration tier adds native dialogs (`openFileDialog`, `saveFileDialog`, `openFolderDialog`) and in-app navigation (`openRawLink`) and toasts (`notify`).

  **Theme contract** — Persephone injects the app's active palette as `--p-*` CSS variables into every board and keeps them live when the user switches themes. Style everything with them and the board automatically matches the app's look. A JS mirror (`persephone.theme`, `persephone.getTheme()`, `persephone.onThemeChange(cb)`) is available for libraries that take colors from JavaScript (charts, diagrams).

  **Security — per-board trust** — Because `execute()` runs programs with your full user privileges, you must explicitly trust each board before it renders. A warning dialog states this plainly. Trust is **per board**, remembered across restarts (stored in `%AppData%\persephone\data\trustedBoards.txt`). Boards you create (via **"+ New board"**, the scripting API, or an AI agent) are **auto-trusted immediately**; any board Persephone did not create for you shows a **Trust board** dialog on first open. A **"Trust all boards in this project"** bulk action is available on the `.persephone` project node in the File Explorer.

  **Recommended components** — Persephone publishes a catalog of components with pre-built skins (CSS or JS adapters) that match the `--p-*` theme:

  | Component | Use |
  |-----------|-----|
  | Tabulator | Data grid — sort, filter, range-select, clipboard, editable cells |
  | Chart.js | Line, bar, pie, radar, scatter charts |
  | Flatpickr | Date / time / range picker |
  | Tom Select | Rich select / tags / autocomplete |
  | marked + highlight.js | Markdown render with syntax-highlighted code blocks |
  | Mermaid | Diagrams (flowchart, sequence, class, Gantt, …) |
  | Split.js | Resizable layout panes |
  | SortableJS | Drag-to-reorder lists and kanban boards |
  | Tippy.js | Tooltips, popovers, dropdown menus |
  | Native `<dialog>` | Modal dialogs — no library required |

  Because the board sandbox forbids remote network, download component libraries into the board folder and reference them with relative paths — never CDN `<script>` tags.

  **Per-board custom icon** — place `icon.svg`, `icon.png`, or `icon.ico` in a board folder to set the icon shown on the page tab, the board list, and the Boards sidebar panel.

  **Custom Boards & Editors sidebar tab** — The **Tools & Editors** sidebar panel has a second tab, **Custom Boards & Editors**, listing all trusted boards grouped by their containing folder. Click any board to open it; **pin** a board (the pin button appears on hover) to surface it at the top of the panel and in the **+** (add page) dropdown alongside pinned editors. Right-click a board row → **Remove** to untrust and unpin it.

  **Scripting & AI-agent integration** — Boards can be created and opened from scripts and by AI agents through a new `app.boards` namespace:

  | Method | Description |
  |--------|-------------|
  | `app.boards.createBoard(name, dir)` | Create a blank board in `<dir>/<name>`. Auto-trusted. Returns the board root path. |
  | `app.boards.createDemoBoard(name, dir)` | Same, but uses the Demo board template. |
  | `app.boards.openBoard(boardRoot)` | Open an existing board by its absolute root folder path. |

  Two new MCP tools complement this: `create_board` and `open_board`. The per-board `CLAUDE.md` documents the full bridge API, and once a board is open agents can test and debug it with the `browser_*` MCP tools (the same Playwright-compatible tools used for the built-in browser), targeting the board page by its `pageId` from `list_pages` (`editor: "board-view"`).

  > See **[Boards](./boards.md)** for full documentation.

- **"Open Folder" shortcut in Tools & Editors** — A new **Open Folder** entry appears in the **Tools & Editors** panel and in the **+** (add page) dropdown menu. Clicking it shows a native Select Folder dialog; once you pick a folder, a new tab opens with the **File Explorer** panel rooted at that folder — the same result as right-clicking a folder in the Explorer sidebar and choosing **"Open in New Tab"**. For new installations, **Open Folder** is the first item in the default pinned set, so it shows up immediately in the **+** dropdown without any setup. Existing users can pin it from the **All Editors & Tools** tab of the Tools & Editors panel.

- **Global paste — HTML-only images (PowerPoint / Office)** — Copying a picture from PowerPoint, Word, Excel, or any app that places the image on the clipboard as an HTML fragment (no bitmap) and then pressing `Ctrl+V` in Persephone now opens that picture in a new **HTML viewer** tab titled **"Pasted HTML"**. Previously, nothing happened for such clipboards. The existing behavior is unchanged: pasting a real bitmap image (a screenshot, an image copied from Snipping Tool or Teams) still opens the **Image Viewer** tab as before. Pasting into a focused editor (Monaco, any input, or other text field) is not affected — those targets receive the text content as usual. The new HTML-viewer tab is not persisted across app restarts.

### UI Polish

- **Sidebar panels — always-visible "Show in main view" button** — Every sidebar panel (Branches & Tags, Collections, Boards, Mneme Wiki, and others) now shows a permanent **chevron-right (›)** button at the right edge of the panel header, separated from the other action buttons by a thin divider. Clicking it brings that panel's editor back into the main view. The button turns blue when the editor is already the main view, giving a clear indicator of the current state. Previously this button hid itself when the editor was already active as the main view, making it invisible in that state.

---

## Version 4.0.5

### Improvements

- **Mneme → Link editor drag-and-drop** — You can now drag a document node from the **Mneme tree** (the sidebar panel in the Mneme root or search editor) and drop it onto a **Link editor** — either onto a category in the Collections panel or onto the main links area. A working `mneme://` link is created automatically; clicking it opens the document in Persephone. Previously, dropping a Mneme node onto a Link editor did nothing.

- **Mneme tree — Copy Path yields a `mneme://` URL** — Right-clicking a node in the Mneme tree and choosing **Copy Path** now copies the full `mneme://{root}/{path}` URL, not a bare filesystem path. Paste the URL into any editor, message, or script to get a clickable link that opens the document directly.

- **Link editor — richer drag-and-drop** — The Collections panel and the link list now accept more drag sources and handle them more precisely:

  - **Drop files/folders onto a Collections category** — Drag one or more files (or folders) from Windows Explorer directly onto a category folder in the **Collections** sidebar panel. Each file becomes a new link under that category; a dropped folder imports all of its files (including those in subfolders) into that same category — the folder's internal structure is flattened, not recreated as sub-categories. A confirmation dialog appears when more than 100 files would be imported.
  - **Cross-window link dragging** — Drag links from a Link editor open in one Persephone window and drop them onto a category in another window's Link editor to file them there. If a link with the same target already exists in the destination collection, it is **moved** to that category rather than duplicated.
  - **Drop files onto Mneme** — Drag a file link from the Link editor onto a node in the Mneme tree to copy that file into your Mneme knowledge base. Dropping a non-file link (a web URL) onto Mneme is silently ignored (previously this produced an error).

### UI Polish

- **Sidebar stays put when opening files** — Opening a Link, Todo, Notebook, or Rest Client file from the **File Explorer** sidebar panel no longer switches the sidebar to that editor's own panel (Collections, Todo, Categories, or Rest). The sidebar remains on whichever panel you had open, so you can click through files one by one in the Explorer without losing your place.

### Bug Fixes

- **Tooltips — one at a time** — At most one tooltip is visible at any moment. When two tooltips would previously overlap (for example, a row tooltip and a richer label tooltip inside it), only the innermost, more-specific tooltip now shows. Tooltips are also automatically suppressed while you are dragging, so they no longer cover drop targets mid-drag.

- **Link editor — Collections panel highlights the selected category** — The selected category (folder) is now visually highlighted in the **Collections** sidebar panel even when no individual link is selected.

- **Link editor — panel selection after link navigation** — Clicking a link in the Tags or Collections panel and then navigating to it no longer breaks subsequent panel selection. Previously a workaround was needed to restore normal panel behavior after such a navigation.

- **Link editor — no spurious "save changes?" dialog when clicking links** — Clicking a link inside the Collections, Tags, or Hostnames sidebar panels no longer triggers a "Do you want to save changes?" dialog. The Link editor lives in the sidebar, so navigating from it never discards anything; the dialog now only appears when you genuinely close the Link editor tab.

- **Link editor — unsaved collection edits survive navigation** — A modified Link editor (with unsaved changes to the collection) now persists across any navigation event, including opening an unrelated file from Windows Explorer or switching to a different tab. The editor remains in the sidebar until you explicitly save or close its panel — unsaved edits are no longer silently discarded.

- **Link editor — Save button visible in both main and sidebar modes** — The Collections panel's **Save** button now appears whenever the editor has unsaved changes, regardless of whether the editor is displayed as the main tab content or demoted to a sidebar panel. Previously the Save button was only shown in the demoted (sidebar-only) state.

---

## Version 4.0.4

### New Features

- **Mneme — built-in knowledge base (off by default)** — Persephone now ships with **Mneme**, an optional local knowledge base. Point it at one or more folders of Markdown documents and it indexes them for fast **full-text** and **semantic** (meaning-based) search. Enable it in **Settings → Mneme (vector memory)** with **Enable Mneme** — Persephone launches the `mneme.exe` service in the background and connects over loopback HTTP (default port `7700`; a Running/Stopped status, server URL, and Copy URL appear below the toggle). When disabled (the default), nothing runs.

  - **Config & monitoring editor** — open from the **Tools & Editors** panel → **Mneme**. Add/remove indexed roots, set per-root include/ignore patterns, reindex with live progress, and download the embedding model that powers semantic search. Toolbar buttons restart the service, open it in the MCP Inspector, and open its log. On first run, if Mneme is enabled but no embedding model is present yet, this editor opens automatically (once per session); its model panel shows a yellow **"Model not loaded — semantic search unavailable"** note and a highlighted **Load model** button until you download it.
  - **Search & browse** — any indexed folder shows a **`.mneme`** entry in the **File Explorer** (mirroring `.git`); click it to open the Mneme root editor. Search in **Text**, **Vector**, or **Hybrid** mode (hybrid is the default), narrow results with **tag** and **creation-date** filters, and read ranked results rendered as Markdown. An Explorer-like sidebar tree lets you open, create, rename, delete, and drag-drop documents — including importing files from Windows Explorer and moving/copying between roots.
  - **AI agent integration** — Mneme exposes a single MCP interface, so agents (Claude Desktop, Claude Code, and others) can read, search, and maintain the same knowledge base. The Settings page shows a ready-to-paste server entry. Everything runs locally; enabling semantic search downloads an embedding model once, after which no document data leaves your machine.

  > See the [Mneme Knowledge Base guide](./mneme.md) for full details.

- **Global image paste** — Press `Ctrl+V` anywhere in Persephone when the clipboard contains an image (a screenshot, an image copied from Microsoft Teams, a web browser, or any other app) to open that image in a new **Image Viewer** tab titled **"Pasted image"**. The paste is intercepted globally — it works even when a code editor (Monaco) has focus, so the image opens in the viewer rather than being silently ignored. Pasting text or non-image content behaves exactly as before and continues to paste into the focused editor. The pasted-image tab survives an app restart.

  > **Tip:** Combine with the **HTML Preview image-export** feature (see below): capture an HTML mockup to the clipboard, then immediately `Ctrl+V` to open the PNG in a new Image Viewer tab — from there you can annotate it in the Drawing Editor or share it further.

- **HTML Preview — image-export toolbar** — The HTML Preview (`.html` files, **Preview** toolbar button) now has a toolbar for capturing the rendered page as an image:

  - **Copy** (clipboard icon) — captures the rendered page exactly as shown on screen and copies it as a PNG to the clipboard. Paste directly into Teams, Slack, Outlook, Word, or any app that accepts images.
  - **… (more actions)** — opens a menu with three additional options: **Save as PNG** (opens a save dialog), **Open in Image View** (opens the PNG in a new Image Viewer tab), and **Edit Image** (opens the PNG in Excalidraw for annotation).

  The capture is WYSIWYG — it takes exactly what is shown on screen at the current window size, including any JavaScript-rendered content. Resize the window before capturing to control the output dimensions. This makes the HTML Preview a convenient mockup tool: build a layout in HTML, resize the window to the target size, then copy the result.

### UI Polish

- **Markdown Preview — YAML frontmatter rendered as highlighted code** — When a Markdown file begins with a YAML frontmatter block (`---` … `---` or `---` … `...`), the preview now renders it as a syntax-highlighted `yaml` code block instead of broken text or stray horizontal rules. The source file is never modified — this is a preview-only transform. Documents that do not start with frontmatter are unaffected.

---

## Version 4.0.3

### New Features

- **Git integration (off by default)** — Persephone now ships with optional git support. Enable it in **Settings → Git Integration** with the **Enable Git integration** checkbox. When enabled, the settings page runs a `git --version` probe and reports the result inline ("Git 2.x.x detected" or an error). Requires git installed and on PATH. When disabled (the default), no git activity occurs.

  > Git integration is v1. Staging, unstaging, committing, branch create/switch, fetch, pull (merge), and push are all supported. Merge-conflict resolution is manual (edit conflicted files in a text editor or the Git Diff view, then commit). No in-app credential prompt is shown — authentication uses the OS credential manager (HTTPS) or SSH agent. Merge/rebase operations beyond pull-merge are not available.

- **Git Tree editor** — Browse the full commit history of any git repository. In the **File Explorer** panel, a `.git` entry appears for repos with a detected git root — click it to open the **Git Tree** tab. The editor shows a scrollable commit list with a swimlane graph column, commit message, author, date (`YYYY-MM-DD HH:mm`), and short hash. The list shows commits from **all branches** (`git log --all`), so no commits disappear from the graph after a branch switch. Branch and tag ref labels appear on relevant commits; the HEAD commit's short hash displays in **green** (on a detached HEAD, the green hash is the only active-commit marker). The list loads 200 commits at a time — a **Load more** button appends the next page and a **Load all** option fetches the entire history. Column widths and order are persisted across restarts (the Graph/swimlane column still auto-sizes). The tree and Changes panel refresh automatically within about half a second whenever the repository changes on disk. The toolbar shows the repository name (hover for full path) and the **ahead/behind indicator** (`↑N` / `↓N`) for the current branch's remote tracking branch.

  The bottom of the editor holds a resizable panel (height and active tab persisted) with two tabs:
  - **Commit tab** — author, date, full hash, ref badges, and the complete commit message for the selected commit.
  - **Diff tab** — a two-column view: left shows the changed-file list with status badges; right shows a Monaco inline diff for the selected file. The divider width is persisted. Right-clicking a file row selects it and shows a context menu with **"Open in new Tab"** — which opens a full Git Diff editor for that file preselected to *previous commit ↔ selected commit*, with the File History panel already expanded.

- **Branches & Tags panel** — Appears in the sidebar whenever the Git Tree editor is open. Renders all repository refs as a tree with three sections: **Branches** (local branches with `/`-folder nesting), **Remotes** (one entry per remote, tracking branches nested beneath), and **Tags** (flat list). All sections are always shown, even when empty. The checked-out branch is displayed in **green**. Branches and tags are listed most-recent-first by default; click the **AZ** button in the panel header to switch to alphabetical order (persisted). Clicking a branch or tag scrolls the commit grid to that ref's commit and highlights the row. The tree's expanded/collapsed state is persisted — only Branches is expanded on first open. The panel header holds: **Show Git Tree** (returns the commit graph to the main area), **AZ** sort toggle, **Refresh**, and **× Close Git Tree** (tears down the Git Tree editor and both panels — the only way to close them).

- **Changes panel** — Appears in the sidebar alongside the Branches & Tags panel. Split into **Unstaged** (working-tree edits and untracked files) and **Staged** (git index) sections. Each section is a full grid with icon / path / status columns, click-to-sort headers, and range selection (click, Shift-click, drag, Ctrl+A). Colored status badges — `M` modified, `A` added, `D` deleted, `R` renamed, `?` untracked — appear right-aligned on each row. The panel header shows the repository name as a badge and the total changed-file count, e.g. **[persephone] Changes (3)**. When multiple repositories are open, each gets its own independent Changes panel. Git-ignored files are not shown.

  - **Stage / unstage / reset** — Move files between lists three ways: (1) select rows and click the **↓** / **↑** arrow buttons; (2) double-click a row; (3) right-click and choose **Stage N files** / **Unstage N files**. **Reset** (right-click on Unstaged rows) discards uncommitted changes after a confirmation dialog; untracked files are deleted.
  - **Click to open diff** — Clicking a file in the Unstaged list opens its diff preselected to **Staged ↔ Unstaged**. Clicking a file in the Staged list opens it preselected to **Last commit ↔ Staged** (showing exactly what will go into the next commit).
  - **Commit button** — A **Commit** button above the Staged list (disabled when nothing is staged) opens the Commit dialog.
  - **Refresh** — The panel header has a **Refresh** button; the Git Tree toolbar Refresh reloads both the commit history and the file status.

- **Commit dialog** — Opened from the **Commit** button in the Changes panel. Shows an editable **Author Name** and **Email** (prepopulated from git config; applies only to this commit — your config is never changed), a multi-line message box, and an editable **Branch** field:
  - **Keep the prefilled branch name** to commit to the current branch as before.
  - **Type a different name** to create a new branch and commit onto it in one step (button relabels to **"Create Branch & Commit"**).
  - **Detached HEAD** — the Branch field starts empty and must be filled before committing.
  - An empty or invalid branch name disables the action button (red border); on name conflict a toast describes the error and the dialog stays open so you can fix and retry.
  - **Commit & Push** — a second action button commits all staged files and immediately pushes to the remote in one step. The first push of a new branch sets the upstream automatically. If the push is rejected (non-fast-forward), the commit is kept and a toast describes the push failure.
  - Press **Ctrl+Enter** to commit; **Esc** or **Cancel** to close without committing.

- **Git operations** — The Git Tree toolbar provides remote operations:
  - **Pull (split-button)** — primary click runs **Pull (merge)** (fetch + merge in one step). Click the caret (▾) for **Fetch all** (`git fetch --all --prune`). Pull is disabled when the branch has no upstream tracking branch; Fetch all remains available. On merge conflicts a toast lists the conflicted files (up to 5) and they appear in the Changes panel with status `U`.
  - **Push** — pushes the current branch to its remote tracking branch. Never force-pushes; if the remote has unmerged commits a toast explains to pull first.
  - **Switch** — right-click a commit row in the graph or a branch/tag leaf in the Branches & Tags panel to switch: **Switch to Branch** (local), **Switch to Remote Branch** (creates a local tracking branch), **Switch to Commit** (detaches HEAD — appears only when no local branch points at the commit), or **Switch to Tag Commit** (panel only). A refused switch surfaces an error toast. After a successful switch both the graph and the Branches & Tags panel refresh automatically.
  - **Create branch at commit** — right-click a commit row and choose **"Create branch here…"** to create and check out a new branch at that commit. On name conflict an error toast appears.

- **Git Diff editor** — For any text file inside a git repository, a **Git Diff** button appears in the editor switch toolbar. Opens a Monaco side-by-side diff. **From** / **To** pickers at the left of the toolbar each open a scrollable commit list scoped to the file's history; **Unstaged** and **Staged** (when applicable) appear as inline rows at the top. The default comparison is the file's latest commit on the left versus Unstaged on the right. When **To** is Unstaged, the right pane is editable and writes changes back to the file; all other combinations are read-only. The selected revision pair is persisted across restarts. If the file is not tracked by git the editor shows an explanatory message with a **Switch to Text Editor** button. The **Run Script** toolbar button is hidden in Git Diff view. A **File History** sidebar panel shows the full per-file commit history with **L** / **R** toggle buttons to load revisions into either diff pane; it stays in sync with the From/To pickers and is visible only while Git Diff is active.

- **Image export — save rendered PNG to file** — The Mermaid Diagram Viewer, SVG Preview, and Image Viewer can now save their rendered output to a file:

  - **Mermaid & SVG** — A new **Save as PNG** toolbar button opens a save dialog and writes the rendered diagram or SVG as a PNG. The PNG is rasterised by Persephone's own rendering engine, so diagram text and custom fonts are reproduced faithfully (external mermaid-to-PNG converters often render empty text boxes because they cannot access the browser's font stack).
  - **Image Viewer** — The toolbar save button is now a **dropdown** with two options: **Save as .png** (re-encodes the image to PNG, useful for converting JPG/GIF/etc.) and **Save original** (writes the original bytes in their native format without re-encoding).

  **Scripting & agent API** — `page.asMermaid()`, `page.asSvg()`, and the new `page.asImage()` each expose a `savePngToFile(filePath)` method that writes a PNG to disk without a dialog. The method renders on demand — for Mermaid diagrams it triggers rendering even when the page is not the active tab. MCP agents can call `execute_script` to save a diagram to a temp file and read it back as an image for vision analysis. See [`asMermaid()`](./api/page.md#asmermaid--promiseimermaideditor), [`asSvg()`](./api/page.md#assvg--promiseisvgeditor), and [`asImage()`](./api/page.md#asimage--promiseimageeditor).

- **MCP — browser profile awareness** — AI agents connecting via the MCP server can now discover and target browser profiles reliably. This is the key building block for multi-profile automation (e.g., directing an agent to act on the page holding your work Outlook/SharePoint login, not your personal profile).

  - **`get_app_info`** — now returns `browserProfiles` (array of configured profile names) and `defaultBrowserProfile`. Call this once to discover valid profile names before issuing browser tool calls.
  - **`list_pages` / `get_active_page`** — browser pages now include `profileName` (`""` = built-in default), `isIncognito`, `isTor`, and `url` (the active tab's URL). `url` is omitted for incognito/Tor pages to preserve privacy.
  - **`list_windows`** — browser pages now include `profileName`, `isIncognito`, and `isTor` (no `url`; works even for closed windows).
  - **All 14 `browser_*` tools** — each now accepts optional `pageId` and `profileName` parameters. `pageId` takes precedence; `profileName` selects the browser page of that profile (`""` = default). The resolved page is focused automatically. Neither parameter ever matches incognito or Tor pages. When no matching page is found the error suggests using `open_url` with `profileName` to open one.
  - **`open_url`** — the existing profile-matched reuse behavior is now documented: with `profileName` the tool adds the tab to (or focuses) an existing page of that profile, or creates a new page with that profile — it never attaches to a different-profile page.

  See [MCP Server Setup — Browser Profiles](./mcp-setup.md#browser-profiles) for usage examples.

### UI Polish

- **Context-aware tab menu** — The page-tab right-click menu now shows only the actions that apply to the active editor. Text editor tabs are unchanged. Git Tree tabs add **Open Git Root Folder** and **Copy Remote URL**. PDF, Image, and Archive tabs show Show in File Explorer and Copy File Path. Other editors (e.g. MCP Inspector) show only the universal tab items with no greyed-out entries. See [Tab Context Menu](./tabs-and-navigation.md#tab-context-menu) for the full reference.

- **Sidebar panel header icons** — Each sidebar panel now shows a small icon at the start of its header row, matching the icon the editor uses on its page tab — folder icon for File Explorer, search icon for Search, git icon for Changes and Branches & Tags panels.

- **Git sidebar panels — repository badge** — The **Branches & Tags** and **Changes** panel headers display the repository name as a small bordered badge, matching the style used in the Git Tree toolbar.

- **Storybook — dedicated icon** — The Storybook tool now has its own book-with-bookmark icon on its page tab and in the **Tools & Editors** list, replacing the generic list icon it previously shared with other tools.

- **Sidebar panel headers — title truncation** — When the sidebar is narrowed, panel header titles (and the repository-name badge on git panels) now truncate with an ellipsis instead of pushing action buttons off the right edge. Action buttons — Refresh, AZ sort toggle, Show Git Tree, Close, etc. — remain fully visible at all sidebar widths.

### Bug Fixes

- **Folder links open the Explorer panel** — Clicking a link that resolves to a directory (e.g. a `file://` link in a Markdown preview, a Links list entry, or any other link) now opens the folder in the **File Explorer** sidebar panel — the same view you would get from **"Open Folder"** in the sidebar. Previously such links opened a blank Monaco text editor instead of a folder browser.

- **Browser reload — unsaved-changes confirmation** — A soft reload (Reload button, `F5`, `Ctrl+R`) on a page with an unsaved-changes guard (a `beforeunload` handler) now shows a confirmation dialog: **"You have unsaved changes. Leave the page and discard them?"** — click **Leave** to reload or **Cancel** to stay. Previously the reload appeared to do nothing because the guard silently blocked it. A hard reload (`Ctrl+F5` / `Ctrl+Shift+R`) still reloads immediately without prompting, bypassing the guard.

- **Links editor — "Show links" button in Collections panel** — After clicking a link in the **Collections** sidebar panel (which opens the link's target in the main view), a new **Show links** button in the panel header brings the full links list back as the main view without closing or collapsing the panel.

- **Links editor — audio Next/Random respects active tag filter** — When a tag is selected in the **Tags** panel, the audio player's **Next** and **Random** buttons now advance through tracks within that filtered set. Previously they ignored the tag filter and jumped to unrelated files.

- **Explorer panel — hover highlight and active-file reveal restored** — Two regressions in the Explorer sidebar panel have been fixed: (1) file and folder rows now highlight on hover again; (2) opening a file now scrolls to and highlights that file in the tree, expanding ancestor folders as needed.

---

## Version 4.0.2

### New Features

- **Folder View — breadcrumb navigation** — The toolbar of the Folder View editor (File Explorer folders, archive subfolders, and link categories) now shows a breadcrumb with the root name and one clickable chip per ancestor folder. Click any chip to jump to that ancestor. On long paths the breadcrumb clips the root side so the current folder is always visible.

- **Link Editor — always-open sidebar panels** — The Collections, Tags, and Hostnames panels are now always shown in the page sidebar. The sidebar cannot be closed while a `.link.json` file is open. The toolbar toggle button is hidden on link pages. Previously these panels lived in a resizable left pane inside the editor when the sidebar was closed; that fallback pane is gone. The File Explorer also opens automatically in the sidebar alongside the link panels, rooted at the link file's folder.

  - The Categories panel is now labelled **"Collections"** throughout (the breadcrumb root label and the panel header both say "Collections"). Clicking a category folder filters the link list in the main area; clicking a link item opens the file in the main view.
  - The **Tags** panel now has a resizable bottom pane listing all links under the selected tag. The **Hostnames** panel also gains this bottom pane (previously it only showed the hostname list). Clicking a link in the bottom pane opens the file.

- **Browser bookmarks — sidebar panels** — The Collections, Tags, and Hostnames panels are now available in the browser's blank bookmarks page and in the slide-in bookmarks drawer, exactly as they appear in a standalone link editor. Click a category folder to filter the link list; click a link to navigate the browser to that URL.

- **Notebook — sidebar panels** — The **Categories** (category tree) and **Tags** panels have moved from the resizable left pane inside the Notebook editor to the always-open page sidebar. Behavior is unchanged; filtering by category or tag works the same way.

- **Todo — sidebar panel** — The list selector and tag filter have moved from the resizable left pane inside the Todo editor to a single **Todo** panel in the always-open page sidebar.

- **Rest Client — sidebar panel** — The request collection tree has moved from the resizable left pane inside the Rest Client editor to a **Rest** panel in the always-open page sidebar.

### Bug Fixes

- **Browser blank page — link controls restored** — The **Add Link**, view mode switcher, and search box were missing from the toolbar on the browser's blank bookmarks page. All three controls now appear correctly in the top-right of the blank-page toolbar.

- **Browser context menu — no longer delayed on busy pages** — Right-clicking a web page while it was still loading (or while JavaScript was running) could block the context menu for several seconds due to a synchronous SVG probe. The probe now races against a 250 ms budget — on idle pages the "Open SVG in Editor" item still appears; on busy pages the menu opens immediately without it.

- **Add/Edit Link dialog — Title and Tags inputs no longer stretch** — In the Add/Edit Link dialog, the Title and Tags input fields were expanding horizontally beyond their intended column. The form rows now lay out correctly.

- **Link Editor — category tree expansion no longer breaks after multiple label clicks** — Clicking a category label (rather than the expand/collapse chevron) could cause the tree to stop rendering or hiding children after the first couple of clicks. The chevron worked fine; the label did not. Fixed by scoping the tree rebuild to fire only when the link list actually changes, eliminating the race between the expansion toggle and the tree rebuild.

---

## Version 4.0.1

### Breaking changes

- **Major version bump** — The editor system has been rewritten to a single uniform `EditorModel` hierarchy. All 25 editors are now top-level subclasses; text-bearing editors share a common `IContentHost` abstraction. No script-author-facing behavior change beyond the API adjustment below — but the version jump signals that the internal architecture is no longer compatible with v3.x extensions or persisted session data from earlier builds.

- **Session data reset on first launch** — Pages opened in v3.0.x and earlier are detected and silently skipped during session restore on first launch of v4.0.1. The app opens with a fresh empty page. Pinned tabs, recent files, and settings are preserved — only the *open-tabs* state is reset. This is a one-time cost; subsequent launches restore normally.

- **Script API: `IEditorInfo.category` removed** — The `category` field on editor info objects (returned by `app.editors.getAll()`, `app.editors.getById()`, `app.editors.resolve()`) has been removed. Use `IEditorInfo.hasContentHost: boolean` instead — `true` for text-bearing editors (Monaco, Grid, Markdown, ...), `false` for standalone editors (PDF, Image, Browser, ...). See [`IEditorInfo`](./api/editors.md#ieditorinfo).

### New Features

- **Markdown Preview — Azure DevOps wiki Mermaid syntax** — The Markdown viewer now recognizes the Azure DevOps wiki fenced container block syntax for Mermaid diagrams:

  ```
  ::: mermaid
  graph TD
      A[Start] --> B[End]
  :::
  ```

  These blocks are automatically converted to the standard ` ```mermaid ``` ` form before rendering, so diagrams display as SVG just like regular mermaid code blocks (hover toolbar with copy/open controls included). Files authored on Azure DevOps wikis or with Pandoc fenced divs now render diagrams without any changes to the source.

### TypeScript improvements

- **Editor-ID autocomplete across the public API** — `page.editor`, `app.pages.addEditorPage()`, `app.editors.getById()`, `app.editors.resolveId()`, and `ISwitchOptions.options` all type their editor-ID values as the `EditorView` union. TypeScript-typed scripts get autocomplete and typo detection for the 25 supported editor IDs (`"monaco"`, `"grid-json"`, `"rest-client"`, `"video-view"`, `"storybook-view"`, `"pdf-view"`, etc.). Plain JavaScript scripts are unaffected.

### Under the hood

- The internal `ContentViewModel` subsystem (ref-counted view models) has been retired. Editor facades returned by `page.asX()` now wrap the editor model directly. From a script author's perspective the auto-cleanup behavior is unchanged — event subscriptions made via `app.events` are still automatically released when the script completes. Facades themselves are stateless and need no cleanup.

### Bug Fixes

- **MCP Inspector — relative links in resource content blocked gracefully** — Previously, clicking a relative link (e.g., `[structure](structure.md)`) inside a Markdown resource displayed by the MCP Inspector would open a blank Persephone page with a stuck editor toggle. MCP resource URIs have no filesystem base, so relative links cannot be resolved. They are now intercepted before navigation and a notification is shown explaining that relative links cannot be followed. Absolute links (`http://`, `https://`, `#fragment`, `//host`) continue to open normally.

- **Explorer panel: scroll position preserved on file changes** — Previously, when files in the project folder changed (e.g., while an AI agent was editing them, or during a build), the Explorer file tree jumped back to the top, forcing you to scroll back down to find your place. Scroll position is now retained across automatic tree refreshes — added, removed, and renamed files animate in place without disturbing the viewport.

---

## Version 3.0.9

### New Features

- **Cross-editor drag-and-drop** — You can now drag items from the Links editor into other editors, and vice versa:
  - **Links → Notebook** — Drag one or more links (or a file from the File Explorer) onto a category in the Notebook category tree. A note is created for each dropped item, with the link URL as the note body and the link title as the note title.
  - **Links → Rest Client** — Drag one or more links onto a collection or request in the Rest Client tree. A new request is created for each link, pre-populated with the link URL.
  - **Files/Links → Links editor** — Drag items from the File Explorer or from another editor onto the main area of the Links editor. Files and folders are imported as new links. Folders are scanned recursively; if more than 100 files are found, a confirmation dialog appears before proceeding. Duplicate entries (already in the collection) are skipped automatically.

- **Pinned tabs are now draggable** — Pinned (compact) tabs can be reordered by dragging within the pinned section of the tab bar. Previously, pinned tabs could not be dragged at all.

### Bug Fixes and Improvements

- **Audio visualizer: pauses when tab is in the background** — The visualizer animation loop now stops automatically when you switch to a different tab, eliminating frame-rate drops and crashes that occurred with the Circular effect running in the background.

---

## Version 3.0.8

### Bug Fixes

- **Default browser infinite loop** — When Persephone was registered as the Windows default browser, clicking any link in an external app (Outlook, Teams, VSCode, etc.) triggered an infinite loop: the URL was sent to `shell.openExternal`, which invoked Persephone again, which called `shell.openExternal` again, and so on. This caused system-wide focus stealing and made Persephone unresponsive. External URLs now open directly in an internal browser tab, breaking the cycle.

- **Browser registration: quoted registry values** — The Windows registry entries written when registering Persephone as default browser had their quotes stripped by the shell. This was a latent bug that would cause failures for install paths containing spaces. Registry commands now bypass the shell entirely, preserving quoted values correctly.

---

## Version 3.0.7

### New Features

- **Audio Player — Next Track & Shuffle** — The audio player now auto-plays the next track when the current one ends, and supports a shuffle mode. Works when a file was opened from the **File Explorer** panel (filesystem folder) or the **Links** panel (link category or tag):
  - **Next Track** and **Shuffle** buttons appear in the audio controls bar when a source panel is available.
  - **Shuffle mode** uses a shuffle bag — all tracks in the folder/category/tag play before any track repeats. The setting persists across app restarts.
  - When a track is auto-advanced, the selection highlight in the File Explorer or Links panel updates to follow the current track.
  - If a file was opened by directly typing a URL, no buttons are shown (feature is not available without a source panel).

- **Links panel — Tags sidebar with link list** — When the **Tags** panel is open in the sidebar (the sidebar used by the File Explorer and Links editor), it now shows a resizable bottom pane listing all links in the selected tag. Clicking a link navigates to it and establishes it as the source for Next Track/Shuffle — so the audio player will advance through tracks within that tag's set. The pane scrolls automatically to follow the current track when the player auto-advances.

- **Tag editing in link tooltips** — Hover over any link in the **Links** editor to see its tooltip. The tooltip now includes a tag editing section at the bottom: all available tags appear as badges you can click to toggle on or off for that link. An inline input at the end of the badge list lets you add a new tag (press Enter to confirm).

- **Save button in Links sidebar** — When the Links file has unsaved changes and the Links editor is running as a sidebar panel (not the main content area), a floppy-disk save button now appears in the panel header for quick saving without switching tabs.

### Bug Fixes

- **Links panels always visible in sidebar** — The Categories, Tags, and Hostnames panels now always appear in the sidebar immediately when you open the File Explorer panel for a links file. Previously the panels sometimes required toggling the sidebar twice, and Tags/Hostnames would stay hidden if no tags or hostnames existed yet.

- **Files with `!` in their name open correctly** — Files whose names contain an exclamation mark (e.g., `Roxette - Crash!Boom!Bang!.mp3`) were previously misidentified as archive paths and failed to open. The `!` character is now only treated as an archive path separator when it immediately follows a recognized archive extension (`.zip`, `.rar`, `.7z`, etc.).

### Improvements

- **Script API: `ai.ClaudeSession` — `system` and `stopSequences` config options** — Two new options are available when constructing a `ClaudeSession`:
  - `system` — set the system message directly in the constructor instead of calling `session.systemMessage()` after construction.
  - `stopSequences` — an array of strings that cause Claude to stop generating immediately when encountered in the output.

  ```javascript
  const session = new ai.ClaudeSession({
      apiKey: "sk-ant-...",
      system: "You are a concise assistant.",
      stopSequences: ["---", "END"],
  });
  ```

  The `stopSequences` value is also exposed as a read-only `session.stopSequences` property. See the [`ai` API reference](./api/ai.md) for details.

---

## Version 3.0.6

### Improvements

- **Audio Player: custom controls bar** — Audio playback now has a custom control bar overlaid on the visualizer canvas. The bar shows a play/pause button, current time, a seek bar, total duration, and a mute toggle. The controls fade out when you are not hovering over the player and reappear automatically on hover, keeping the visualizer unobstructed during playback.

- **Audio visualizer: No-effect mode** — A third button ("⊘ No effect") has been added to the effect switcher. When selected, the visualizer canvas is cleared and, if the file name contains artist/title information (e.g., `Artist – Title.mp3`), the track name and artist are displayed centered on screen. ID3 metadata is read first; the filename is used as a fallback.

- **Audio visualizer: Bars effect** — The Bars effect has been significantly improved:
  - Bars are now centered both horizontally and vertically — they grow symmetrically from the center, matching the area used by the Circular effect.
  - Each bar has its own rainbow color (red/orange on the left shifting through green to blue/violet on the right), rendered with a horizontal 3D gradient for depth.
  - Mini-bar particles are emitted from the top and bottom of each bar when the signal is strong. The particles drift away and fade out over time (pre-rendered stamps for performance).

- **File Explorer integration for Video/Audio Player** — Opening a media file from the File Explorer panel now highlights the file in the Explorer tree, matching the behavior of the text editor. A **File Explorer** button has also been added to the Video Player toolbar so you can open the Explorer panel without switching tabs.

- **Audio visualizer: Circular effect** — The Circular effect no longer paints a dark background on the canvas. The trail fade now uses alpha compositing, so the player background color (from the active theme) shows through correctly.

---

## Version 3.0.5

### New Features

- **Audio Player with spectrum visualizer** — The Video Player now supports audio-only files. When you open an audio file, the black video area is replaced by an animated spectrum analyzer that reacts in real time to the playing audio. Two visualizer effects are available: **Bars** (vertical frequency bars) and **Circular** (radial spectrum with spark particles emitted on volume peaks). Hover over the visualizer to reveal the effect switcher buttons in the top-right corner. The selected effect is saved across sessions. Click anywhere on the visualizer to toggle play/pause.

  Audio file associations: `.mp3`, `.wav`, `.aac`, `.flac`, `.m4a`, `.wma`, `.ogg`, `.opus`.
  Additional video file associations: `.avi`, `.mkv`, `.mov`.
  Unsupported formats (e.g. WMA) display a friendly message with the option to open in VLC.

  See **[Video Player](./editors.md#video-player)** for complete documentation.

---

## Version 3.0.4

### New Features

- **Video Player** — A new standalone Video Player editor lets you play video from local files, HTTPS URLs, and HLS/M3U8 adaptive streams. Paste a plain URL or a full cURL/fetch command (with custom headers) into the URL bar and press **Enter** to start playback. The player automatically routes all sources through a local HTTP streaming server for smooth seeking and range request support. A **VLC** button appears when the built-in player cannot play a file — click it to open the current source in VLC. Configure the VLC path and streaming server port in **Settings → Video Player**.

  Supported formats: MP4, WebM, OGG/Ogg, HLS/M3U8 adaptive streams.
  File associations: `.mp4`, `.webm`, `.ogg`, `.m3u8`, `.m3u` files open directly in the Video Player.

  Open a new Video Player tab from the **+** dropdown → **Video Player** (if pinned), or from the **Tools & Editors** panel.

  See **[Video Player](./editors.md#video-player)** for complete documentation.

### Improvements

- **Link Editor: Target field** — The Add/Edit Link dialog now has a **Target** dropdown. Set a target editor for any link item so it always opens in the right viewer — Text Editor, Browser, PDF Viewer, Image Viewer, Markdown Preview, HTML Preview, SVG Preview, JSON Grid, or CSV Grid. Leave it as **(auto-detect)** to use the default behavior (detect by file extension or content type).

- **Link Editor: promote to main editor** — The link category sidebar panel now has a **swap** button in its header. Click it to promote the panel to the main editor (full-page view of the link collection); click it again to demote it back to sidebar-only mode. This makes it easy to manage links from the sidebar without leaving your current main tab.

- **Browser: search engine selector** — The search engine selector in the URL bar is now hidden when the input contains a full URL with a protocol scheme (e.g., `https://`). It still appears for blank pages and search terms, keeping the toolbar uncluttered when navigating directly to URLs.

- **Browser: cinema mode** — Hover over any `<video>` in the built-in browser to reveal an expand button. Click it to fill the entire browser viewport with the video, hiding the surrounding page content. Press **Escape** or click the button again to collapse back to the normal view. Works on YouTube, Twitch, and other sites that use overlay-based players.

### Breaking Changes

- **Link Editor: browser selector removed** — The per-session browser selector toolbar button in the Link Editor has been removed. Links now open using the app-wide **Settings → Link Open Behavior** setting by default. Use the right-click context menu (Open in Default Browser, Open in Internal Browser, browser profiles, Open in Incognito) to control where a specific link opens. Per-link target editors can be set permanently via the **Target** field in the Add/Edit Link dialog.

- **Script API: `io.RawLinkEvent`, `io.OpenLinkEvent`, `io.OpenContentEvent` removed** — These event class constructors have been replaced by `io.createLinkData(href, options?)` and `io.linkToLinkData(link)`. The three link pipeline channels (`openRawLink`, `openLink`, `openContent`) now all use a single flat `ILinkData` object. Update your scripts:
  - `new io.RawLinkEvent("url")` → `io.createLinkData("url")`
  - `new io.RawLinkEvent("url", target, metadata)` → `io.createLinkData("url", { target, ...metadata })`
  - `new io.OpenLinkEvent("url", target, metadata)` → `io.createLinkData("url", { url: "url", target, ...metadata })`
  - See the [io API reference](./api/io.md#link-pipeline-helpers) for the full list of available options.

---

## Version 3.0.3

### New Features

- **Script API: `ai.ClaudeSession`** — Scripts now have access to a global `ai` namespace with a `ClaudeSession` class for building multi-turn conversations with Claude via the Anthropic API. Create a session, set a system message, add user messages, define tools, and call `send()` — the session handles the full tool-call loop internally. Supports event callbacks for `"tool-call"`, `"tool-result"`, `"assistant-message"`, and `"error"`. See the [`ai` API reference](./api/ai.md).

  ```javascript
  const session = new ai.ClaudeSession({ apiKey: "sk-ant-..." });
  session.systemMessage("You are a helpful assistant.");
  session.userMessage("Summarize this data.");
  const reply = await session.send();
  ```

- **MCP Inspector: interactive resource templates** — Resource templates (parameterized URIs like `docs://documents/{document_id}`) in the MCP Inspector are now fully interactive. Click a template in the sidebar to select it, fill in parameter values in the detail panel, and click **Read Resource** to read the resource at the constructed URI. Results are displayed using the same adaptive rendering as static resources (Markdown, JSON/code, images). Selecting a template deselects any previously selected static resource, and vice versa.

### Improvements

- **Paste as Markdown / HTML** — In Markdown and HTML files, press **Ctrl+Shift+V** to paste clipboard content as converted Markdown (or raw HTML). The clipboard's HTML representation is read and converted via [Turndown](https://github.com/mixmark-io/turndown). Regular **Ctrl+V** continues to paste plain text as before.

- **Browser: tab groups** — Internal browser tabs are now automatically organized into visual groups. Tabs opened from a link inherit the parent tab's group; manually created tabs start a new group. Groups are shown as a vertical left border with alternating brightness for easy visual distinction. Drag a tab out of its group to create a new group. Groups are persisted across app restarts.

- **Browser: tab activation history** — Closing a tab now returns focus to the previously active tab instead of the adjacent one. This makes the "open link in new tab → read → close → back to where you were" workflow seamless.

- **Browser: dark favicon visibility** — Dark favicons are now visible on the dark theme thanks to a subtle light glow effect (`drop-shadow`) applied to favicon images in the tabs panel.

- **Browser: new tab position** — The **+** button now always adds new tabs at the end of the list. Tabs opened from links are still inserted after the active tab.

- **MCP: `browser_hover` tool** — New MCP browser automation tool that hovers over an element, firing `mouseenter` and `mouseover` events. Useful for revealing tooltips, dropdown menus, and any UI that reacts to mouse hover. Accepts a CSS `selector` or an accessibility `ref` from a snapshot, and returns an updated accessibility snapshot.

- **MCP Server Log: redesigned log items** — Each log entry in the MCP Server Log now collapses to a compact one-line summary (method, tool/resource name, duration) and expands to show connected **Request** and **Response** blocks with scrollable, syntax-highlighted JSON (up to 10 lines visible before scrolling).

- **Log View: clear confirmation** — The **Clear** button in the Log View now shows a confirmation dialog before clearing all log entries, preventing accidental data loss.

### Bug Fixes

- **HTML Preview: preload script error** — Opening an HTML preview no longer produces a console error (`module not found: node:path`). The cause was Electron injecting the main preload script into the sandboxed preview iframe. Fixed by disabling `nodeIntegrationInSubFrames` — nothing in the app depends on Node.js inside iframes.

---

## Version 3.0.2

### New Features

- **Script API: browser automation via CDP** — `page.asBrowser()` now exposes a full browser automation API powered by the Chrome DevTools Protocol (CDP). Query elements with CSS selectors (`getText`, `getValue`, `getAttribute`, `getHtml`, `exists`), interact with forms (`click`, `type`, `select`, `check`, `uncheck`, `clear`), press keyboard keys (`pressKey`), and run arbitrary JavaScript (`evaluate`). See [`page.asBrowser()`](./api/page.md#asbrowser--promiseibrowsereditor).

- **Script API: browser wait methods** — Three new methods make it straightforward to automate pages that load dynamically. `waitForSelector(selector, options?)` waits for an element to appear in the DOM (uses `requestAnimationFrame` polling inside the page for efficiency). `waitForNavigation(options?)` waits for a full page load (`document.readyState === "complete"`; for SPA navigations use `waitForSelector` instead). `wait(ms)` pauses the script for a fixed duration. Both wait methods accept a `{ timeout?, tabId? }` options object; default timeout is 30 seconds.

- **Script API: browser tab management** — Scripts can now open, close, and switch between internal browser tabs programmatically. `browser.addTab(url?)` opens a new tab and returns its ID. `browser.closeTab(tabId?)` closes a tab (defaults to active). `browser.switchTab(tabId)` makes a tab active. `browser.tabs` returns an array of all open tabs with `id`, `url`, `title`, `loading`, and `active` fields; `browser.activeTab` returns the currently visible tab. All automation methods (`evaluate`, `getText`, `click`, `waitForSelector`, etc.) now accept an optional `{ tabId }` option so background tabs can be queried and manipulated without switching to them.

- **Script API: browser accessibility snapshot** — `browser.snapshot(options?)` returns a YAML-like accessibility tree for the current page, using the same format as Playwright MCP's `browser_snapshot` tool. Each interactive element is annotated with a `[ref=eN]` reference derived from the Chrome DevTools Protocol accessibility tree. Useful for understanding page structure and for AI-assisted automation workflows. Pass `{ tabId }` to snapshot a background tab.

- **MCP: browser automation tools** — AI agents can now control the built-in browser directly via dedicated MCP tools — no script required. New tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_select_option`, `browser_press_key`, `browser_evaluate`, `browser_tabs`, `browser_navigate_back`, `browser_wait_for`, `browser_take_screenshot`, `browser_network_requests`, and `browser_close`. The `browser_snapshot` tool returns a structured accessibility tree for reliable element inspection; interaction tools automatically return an updated snapshot. Tools accept Playwright MCP-compatible parameters so agents trained on Playwright work without adaptation. Tools are disabled by default and must be explicitly enabled via **Settings → MCP Server → Enable browser interaction** — while disabled they are hidden from agents entirely. Browser automation is blocked on incognito and Tor pages for privacy. See [MCP Server Setup](./mcp-setup.md#browser-automation-tools).

### Bug Fixes

- **Scripting: implicit return with block-body callbacks** — Scripts that used callbacks with block bodies (e.g., `.map(item => { return item.name; })`) were incorrectly treated as having a top-level `return` statement, which suppressed implicit return of the final expression. The fix uses scope-aware parsing to detect only genuine top-level `return` statements. Also fixed: scripts where a function declaration is followed by a call expression on the same line (e.g., `function foo() { ... } foo();`) now correctly return the call result.

- **MCP: browser_navigate empty snapshot** — `browser_navigate` and `browser_navigate_back` could return an empty accessibility snapshot when navigation completed before the page's React state had updated the `webview` element. Fixed by using a two-phase wait: first polling for URL change or non-complete `readyState`, then waiting for `readyState === "complete"`.

- **Duplicate About/Settings pages** — Clicking the About or Settings sidebar button repeatedly would open a new tab each time instead of focusing the already-open tab. Both pages now use a fixed well-known page ID so the existing tab is found and focused on subsequent clicks.

---

## Version 3.0.1

### New Features

- **Script API: new editor view values** — `page.editor` and `app.pages.addEditorPage()` now accept `"graph-view"`, `"draw-view"`, `"mcp-view"`, `"archive-view"`, and `"category-view"` as valid editor identifiers.
- **Script API: `app.pages.showMcpInspectorPage()`** — Open an MCP Inspector page programmatically, optionally pre-filling the server URL. See [`app.pages` reference](./api/pages.md#showmcpinspectorpageoptions--promisevoid).
- **Script API: `app.pages.all`** — New property that returns all open pages in the current window as an array. Useful for iterating over all tabs.
- **Script API: `app.pages.closePage(pageId)`** — Close a page by ID from a script. Returns `true` if closed, or `false` if the user cancelled (e.g. declined to save unsaved changes). See [`app.pages` reference](./api/pages.md#closepagepageid--promiseboolean).
- **Script API: `app.pages.addEditorPage()` content parameter** — The `addEditorPage(editor, language, title)` method now accepts an optional fourth argument `content` to set the initial page content.
- **Script API: `app.pages.openFile()` return value** — Now returns `Promise<IPage | undefined>` instead of `Promise<void>`. The returned page can be used immediately after opening.
- **Browser: Tor mode** — `app.pages.showBrowserPage()` now accepts a `tor: boolean` option to open in Tor mode (requires Tor to be configured in Settings).
- **Script API: `app.pages.openLinks()`** — Create a standalone link collection page from an array of links or URL/path strings. The Categories panel appears in the sidebar; clicking a link navigates the page's main area to that file or URL. Accepts plain strings (title derived from filename) or full `ILink` objects with categories and tags. See [`app.pages` reference](./api/pages.md#openlinkslinks-title--ipage).
- **Multi-file drop** — Dropping multiple files (or a folder) onto Persephone now opens a link collection page with all files listed in the "Links" sidebar panel. Click any file to view it in the main area. Dropped folders are recursively expanded, with subdirectories becoming link categories.
- **HTML resource extraction** — Extract images, scripts, stylesheets, media, fonts, iframes, favicons, and links from HTML pages. Click the web-scraper icon in the toolbar on any HTML page, or right-click in the built-in Browser and choose "Show Resources". Results open as a categorized link collection.
- **Archive Editor — multi-format support** — The Archive Editor now supports RAR, 7z, TAR (`.tar.gz`, `.tar.bz2`, `.tar.xz`), CAB, and ISO in addition to ZIP-based formats. Browse and view entries in all supported formats. Writing back is still ZIP-only; non-ZIP formats are read-only.
- **Browser — "..." page menu** — A new page menu button (vertical ellipsis) in the browser toolbar provides **View Source**, **View Actual DOM**, and **Show Resources** actions. These are always accessible even on sites that disable or override the right-click context menu.
- **Browser — Network request capture in "Show Resources"** — "Show Resources" now also includes all HTTP requests captured since the page started loading (fetch, XHR, and other requests), grouped under **Network/GET**, **Network/POST**, etc. GET requests open directly; non-GET requests open in the Rest Client with the full method, headers, and request body pre-filled as a cURL command.

### Improvements

- **Folder View — tile modes** — The Folder View editor now supports tile layouts in addition to list view. Switch between list, landscape tiles, and portrait tiles (normal and large) using the toolbar button. Image files show thumbnail previews in tile mode. Each folder remembers its preferred layout; child folders inherit the parent folder's setting unless overridden.
- **Archive panel — entry highlighting** — The Archive panel now highlights the currently viewed entry in the file tree as you navigate between files inside an archive.
- **Archive panel — auto-reveal** — When the Archive panel is expanded and visible, navigating to a file inside the archive automatically expands its parent folders and scrolls to reveal the entry in the tree.
- **Explorer panel — auto-reveal** — The File Explorer panel now auto-reveals the current file in the tree (expanding parent folders and scrolling to it) when the Explorer panel is the active (expanded) panel.
- **Explorer panel — remote archives** — When opening an archive from a remote URL (e.g., `https://example.com/data.zip`), the File Explorer panel is no longer shown alongside the Archive panel, since there is no local folder to browse.
- **Link Editor — sidebar panels** — The Link Editor's Categories, Tags, and Hostnames panels now adapt to the sidebar. When the page sidebar is open, these panels appear there as separate collapsible panels (the same sidebar used by the File Explorer). When the sidebar is closed, they remain as a left panel inside the editor as before.
- **Link Editor — double-click to open** — Double-clicking a link in list view, tile view, or the pinned links panel now opens the link (navigates to the URL) instead of opening the edit dialog. Use the right-click context menu → **Edit** to edit a link.
- **Links panel — rich tooltips** — Hovering a non-directory link in the Links/Categories sidebar panel now shows a rich tooltip with the link's title, URL, and image preview (if available).
- **Links panel — Edit Link context menu** — Right-clicking a non-directory link in the Links/Categories sidebar panel now shows an **Edit Link** option to open the link's edit dialog.
- **Script API: `ILink.target`** — Links now support a `target` field to specify a preferred editor (e.g., `"image-view"`, `"monaco"`). When set, clicking the link opens it in that editor instead of the auto-detected one.
- **Script API: `ILinkMetadata.title` and `ILinkMetadata.fallbackTarget`** — The `OpenLinkEvent` metadata now supports a `title` field (page title override) and a `fallbackTarget` field (fallback editor for URLs with unrecognized extensions, e.g. `"monaco"` to avoid opening unknown URLs in the browser).
- **Browser — View Actual DOM includes iframes** — "View Actual DOM" now captures the live DOM from all iframes on the page (including cross-origin frames), stitching their content inline into the `<iframe>` elements in the output.

### Breaking Changes

- **`page.sourceLink` removed** — The `sourceLink` property added in v2.0.4 has been removed from the scripting API. It was part of an experimental pipeline feature that was retracted during architectural refactoring.
- **`io.ZipTreeProvider` removed** — The `ZipTreeProvider` class has been removed from the `io` scripting namespace. Archive browsing is handled internally by the Archive Editor. Use `io.ArchiveTransformer` with `io.FileProvider` to read individual entries programmatically.
- **`io.ZipTransformer` renamed to `io.ArchiveTransformer`** — The transformer for reading archive entries has been renamed and its constructor signature changed. The new constructor takes two arguments: `archivePath` (absolute path to the archive) and `entryPath` (path of the entry inside the archive). Update scripts: `new io.ZipTransformer("entry.csv")` → `new io.ArchiveTransformer("C:/archive.zip", "entry.csv")`. The new transformer also supports RAR, 7z, TAR, CAB, and ISO in addition to ZIP.
- **`EditorCategory` value changed** — The editor category value `"page-editor"` has been renamed to `"standalone"` in the `app.editors` API. Update any scripts that check `editorInfo.category === "page-editor"` to use `"standalone"` instead.
- **`ITreeProviderItem.name` renamed to `title`** — The `name` property on tree provider items has been renamed to `title` for consistency with `LinkItem`. The type has also been consolidated as `ILink` (with `ITreeProviderItem` kept as a deprecated alias). Update scripts that access `item.name` to use `item.title`.
- **`LinkItem.isCategory` renamed to `isDirectory`** — The `isCategory` property on link items returned by `page.asLink().links` has been renamed to `isDirectory` for consistency with `ILink`.
- **`EditorView` value `"zip-view"` renamed to `"archive-view"`** — The editor view identifier for the Archive Editor has been renamed from `"zip-view"` to `"archive-view"`. Update any scripts that check or set `page.editor === "zip-view"` to use `"archive-view"` instead.

---

## Version 2.0.4

### New Features

- **Archive Editor** — ZIP, EPUB, DOCX, XLSX, and other ZIP-based archives now open in a dedicated Archive Editor showing a browsable file tree. Click any file to view it inline — The Archive panel persists in the sidebar while you navigate between files inside the archive. The Archive panel auto-expands when navigating within the archive and auto-closes when navigating to unrelated files.
- **`page.sourceLink` property** — Pages opened through the link pipeline (file path, URL, cURL command, archive entry) now expose a `sourceLink` descriptor with the resolved URL, target editor, and accumulated metadata. Available as a read-only property in scripts via `page.sourceLink`. *(Removed in v3.0.1.)*

### Improvements

- **Colored archive icon** — Archive files (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, etc.) now display a colorful WinRAR-style icon in the File Explorer. Document formats like `.docx`, `.xlsx`, `.epub` keep their system icons.
- **Explorer New File** — The "New File..." context menu item in the File Explorer now works correctly.
- **Explorer panel navigation** — Expanding the Explorer panel no longer auto-navigates to its last selection. The selection is cleared when navigating from a different source (e.g., Archive panel).

---

## Version 2.0.3

### New Features

- **Open URL dialog (Ctrl+O)** — The file-open shortcut now shows a text-area dialog instead of the native file picker. Paste a file path, an HTTP/HTTPS URL, or a cURL command (bash, cmd, fetch, or Node.js fetch format) and press **Open**. A separate **Open File** button in the dialog brings up the classic file picker.
- **HTTP and archive content in all editors** — Paste an `https://` URL into the Open dialog and Persephone fetches and opens it directly in the right editor: Monaco for code and text files, Image Viewer for images, PDF Viewer for PDFs. ZIP archive entries also open natively in all editors.
- **File Explorer panel** — The page sidebar now features a full File Explorer with collapsible panels, file content search (click the search icon or right-click a folder → "Search in Folder"), and archive browsing (click a `.zip`/`.docx`/`.xlsx` file to browse its contents inline). The tree auto-refreshes on external changes and search state persists across restarts.
- **Folder View** — Click a folder in the File Explorer to show its contents as a list in the page area. Click files to open them, or click subfolders to navigate deeper. The sidebar tree stays synced with the folder view selection.
- **Script API: `io` namespace** — New global available in scripts for building content pipes, firing link pipeline events, and browsing ZIP archives programmatically. Includes `io.FileProvider`, `io.HttpProvider`, `io.ZipTransformer`, `io.DecryptTransformer`, `io.ZipTreeProvider`, `io.createPipe()`, and event constructors (`io.RawLinkEvent`, `io.OpenLinkEvent`, `io.OpenContentEvent`). See [Scripting — io namespace](./scripting.md#the-io-namespace). *(`io.ZipTreeProvider` removed in v3.0.1. `io.ZipTransformer` renamed to `io.ArchiveTransformer` with an updated constructor in v3.0.1. `io.RawLinkEvent`, `io.OpenLinkEvent`, and `io.OpenContentEvent` constructors removed in v3.0.4 — use `io.createLinkData()` instead.)*
- **Script API: `app.events.send` / `app.events.sendAsync`** — Scripts can now fire events into any event channel, not just subscribe to them. See [Events API](./api/events.md#ieventchannel).

### Improvements

- **Image/PDF from archives** — Image Viewer and PDF Viewer can now open files from inside ZIP archives directly (previously fell back to text editor for archive entries).
- **Browser images persist across restart** — Images opened from the built-in browser's context menu now survive app restart. HTTP images are re-fetched via their original URL; blob images are cached to disk.
- **Save error notification** — When saving fails (read-only file, disk full, etc.), a notification is shown instead of silently failing.
- **Save deleted file** — Saving a file that was deleted externally now shows a "Save As" dialog with the original path as default, instead of silently recreating the file.

### Bug Fixes

- **Rename preserves encryption** — Renaming an encrypted or archive file no longer drops the encryption/ZIP transformers.
- **Save As clears encryption state** — Using "Save As" to save an encrypted file to a new unencrypted path now correctly clears the encryption UI indicators.

---

## Version 2.0.2

### New Features

- **`app.runAsync()` background worker** — New scripting API that runs a function in a background worker thread, keeping the UI responsive during CPU-intensive or blocking I/O operations. The function has full Node.js access (`require`, `fs`, `path`, etc.). Pass plain data via the `data` parameter (cloned into the worker) and renderer callbacks or app API objects via the optional `proxy` parameter (transparently proxied back). See [Scripting — Background Workers](./scripting.md#background-workers-apprunasync) and [app.runAsync() API reference](./api/app.md#runasyncfn-data-proxy).
- **Graph View — Copy to clipboard** — New toolbar button copies the current graph view as a PNG image to the clipboard.
- **Graph View — Open in Drawing editor** — New toolbar button exports the graph as an image and opens it in the Excalidraw drawing editor for annotation.
- **File Explorer — Drag-and-drop file moving** — Drag files between folders in the sidebar to move them on disk. Overwrite confirmation is shown when a file with the same name already exists in the target folder.

### Improvements

- **Draw editor — Image offset** — Images pasted or inserted into the drawing canvas now appear offset from the top-left corner so they are not covered by tool panels.
- **Graph tooltip — Long value wrapping** — Tooltip property values now wrap instead of truncating, and the tooltip is scrollable when taller than the viewport.
- **Graph legend — "Selected with children" preselected** — The Legend panel's Selection tab now defaults to "Selected with children" instead of "Selected".
- **Rest Client — Auto-expand new collection** — When the first request is added to a new collection, the collection tree node auto-expands to show it.
- **Browser — New tab position** — New browser tabs now open immediately after the active tab instead of at the end of the tab list.
- **Window position fix** — The window header is now always kept visible when displays change (resolution, arrangement, disconnect). The tray "Show" action also re-checks the window position before restoring.

---

## Version 2.0.1

### Breaking Changes

- **Rebranded to Persephone** — The application has been renamed from "js-notepad" to "Persephone". This is a clean break — users should uninstall js-notepad before installing Persephone. All runtime identifiers changed: package name, executables (`persephone-launcher.exe`, `persephone-snip.exe`), named pipe, Windows registry keys, MCP server name, MIME types, app data folder (`%APPDATA%\persephone`).
- **New app icon** — Lily flower badge replacing the old curly-braces icon.
- **Version jump to 2.0.1** — Major version bump signals the breaking change.

### Bug Fixes

- **Sidebar folder refresh** — Fixed left panel not updating when adding, removing, or reordering folders via drag-and-drop.

---

## Version 1.0.31

### Bug Fixes

- **Screen Snip** — Fixed screen snip tool not working in production builds (Rust snip-tool binary was missing from the CI build pipeline).

---

## Version 1.0.30

---

## Version 1.0.29

### Improvements

- **Rest Client — Header view switch** — Request and response headers now have a Table/JSON toggle. JSON view displays headers as a JSON object in Monaco Editor — editable for request headers with live sync, read-only for response headers.
- **Rest Client — Tree layout** — Moved add button into tree root item, reduced indentation for leaf request items, right-click selects request before showing context menu.
- **Rest Client — UI polish** — Aligned URL bar items vertically, italic informative messages, consistent input backgrounds.

### Bug Fixes

- **Rest Client** — Fixed file marking dirty on open without edits (empty UI rows caused false dirty state).
- **Rest Client** — Fixed new request missing empty header row.

---

## Version 1.0.28

### New Features

- **`app.fetch()` HTTP client** — New [`app.fetch(url, options?)`](./api/app.md#fetchurl-options) method for making HTTP requests from scripts. Uses Node.js under the hood, so only the headers you specify are sent — no automatic Chromium headers (Origin, User-Agent, Sec-Fetch-*, etc.). Returns a standard `Response` object. Supports `method`, `headers`, `body`, `timeout`, `maxRedirects`, and `rejectUnauthorized` options.

- **Rest Client editor** — A new editor for `.rest.json` files that provides a two-panel layout: a collection tree on the left listing your requests, and a request detail panel on the right. Create one via the **+** menu → **Rest Client**. Requests can be organized into named collections (one level: Collection → Requests) via an inline-editable header bar. Supports adding, deleting, duplicating, and reordering requests, with drag-drop between collections and context menus on both collection and request nodes. Data is stored as JSON with `"type": "rest-client"` marker. The request builder includes body type selection (none, x-www-form-urlencoded, raw, binary, form-data), a Monaco-powered raw body editor with language-specific syntax highlighting (JSON, JavaScript, HTML, XML, plaintext), a form-urlencoded key-value editor, automatic Content-Type header management, and smart body/method syncing. Binary body streams a file from disk (no size limit). Form-data body supports multipart/form-data with text and file fields per row. Binary responses (images, PDFs, octet-stream, etc.) are automatically detected and shown in a dedicated panel with content type, size, and "Save to File" button; image responses also display an inline preview with "Open in Image Viewer". Result integration: open the response body in a new Monaco tab, copy response/request headers as JSON, and export the request as cURL (bash/cmd), fetch, or fetch (Node.js) via the "Copy as..." menu. Collections and requests can also be opened in a new rest-client tab from the tree context menu.

---

## Version 1.0.27

### New Features

- **Browser bookmark event** — New `app.events.browser.onBookmark` EventChannel fires before the Add/Edit Bookmark dialog opens (from both the star button and the context menu). Subscribe in an autoload script to modify bookmark fields before the dialog appears — `title`, `href`, `discoveredImages`, `imgSrc`, `category`, and `tags` are all writable. The event's `isEdit` flag indicates whether a new bookmark is being added or an existing one edited.

- **DRM-protected video playback** — The built-in browser now supports DRM-protected content (Widevine). Streaming services like Netflix, Disney+, and other platforms that require DRM can play directly inside js-notepad's browser. Production builds are signed for full compatibility.

---

## Version 1.0.26

### New Features

- **Browser (Tor) mode** — A new Tor browsing mode routes all traffic through the Tor network via SOCKS5 proxy for anonymous browsing. Ephemeral session like Incognito — no data is persisted. Requires `tor.exe` path configured in Settings → Browser Profiles. Shows a live status overlay during connection, a Tor indicator in the URL bar, and auto-stops `tor.exe` when the last Tor page closes. After session restore, a "Reconnect" button lets you resume.
- **Bookmark context menu in browser** — Right-clicking a bookmark in the bookmarks panel or blank-page bookmarks now shows a full context menu: Open in New Tab, Edit, Open in Default Browser, browser profiles, Open in Incognito, Copy URL, Pin/Unpin, Delete.
- **Pinned links context menu** — Pinned links now have the same full context menu (Edit, Open in..., Copy URL, Unpin, Delete), replacing the previous unpin-only action.
- **Rich link tooltips** — Hovering a link in the bookmarks panel, blank-page bookmarks, or pinned links panel shows a tooltip with the link's title, URL, and thumbnail image.
- **Browser internal tab reordering** — Internal browser tabs can now be reordered by dragging within the tabs panel.
- **Browser page tab sound indicator** — The sound/mute button on a browser page tab is now always visible on hover (previously it only appeared while audio was actually playing).
- **Script autoloading** — Place `.ts` or `.js` scripts in an `autoload/` subfolder of your Script Library and they run automatically when the window opens. Scripts that export a `register()` function have it called — use this to subscribe to application events (like context menus) that persist for the session. Files without a `register` export are skipped. Loading order is alphabetical (prefix with `01-`, `02-` to control order). A yellow reload indicator appears in the header when library files change; click it to reload all autoload scripts.
- **Progress API** — New [`app.ui`](./api/ui.md) methods for showing progress indicators during long-running operations. `showProgress(promise, label)` displays a blocking overlay with spinner (300ms debounce, auto-closes on resolve). `createProgress(label)` returns a handle with an updatable `.label` property and `.show(promise)` method for multi-step workflows. `notifyProgress(label, timeout?)` shows a brief non-blocking notification toast. `addScreenLock()` returns a `{ release() }` handle for manual screen lock without a spinner.

### Fixes and Improvements

- **Log file syntax highlighting** — `.log` files now get dedicated syntax coloring in the text editor: timestamps in muted green, log levels color-coded by severity (error in red, warn in yellow, info in cyan, debug in teal, trace in green), bracketed abbreviations like `[ERR]`/`[INF]`/`[WRN]`, quoted strings, numbers, GUIDs, URLs, hex literals, constants, and exception/stack trace lines.
- **`read_guide` MCP tool** — AI agents can now read documentation guides via a dedicated `read_guide` tool call, as an alternative to fetching `notepad://` resource URIs. This works better with AI clients that don't support MCP resources natively.
- **MCP server instructions and tool descriptions** — Rewritten to be shorter and scenario-focused, with all tool descriptions now referencing `read_guide()` alongside `notepad://` URIs for discovering documentation.
- **Browser duplicate page fix** — Fixed a bug where calling `open_url` a second time via MCP would create a duplicate browser page instead of adding a tab to the existing one.
- **Library module globals** — Library modules loaded via `require("library/...")` now have access to the same globals as the top-level script (`app`, `page`, `React`, `styledText`, `ui`, etc.). Previously, only the main script had these — library code would get a `ReferenceError`.
- **Autoload + F5 coexistence** — Running a script with F5 no longer breaks autoload event handlers. Previously, F5 execution could interfere with autoload subscriptions (e.g., custom context menus would stop working). Each script now runs in its own isolated context.
- **Library module isolation** — Library modules loaded via `require("library/...")` are now reloaded fresh on every call with no cached state between script executions. If you need to persist data across runs, use `page.data` or `app.settings`.
- **Link category normalization** — Categories with trailing slashes no longer create phantom subcategories in the link editor.
- **`Buffer` now works in scripts** — `Buffer.from()`, `Buffer.alloc()`, and other `Buffer` methods are now accessible in scripts. Previously, the script execution sandbox blocked access to `Buffer`; this limitation has been removed.

---

## Version 1.0.25

### Fixes and Improvements

- **MCP resource guides** — Three new resource guides are now available for AI agents: `notepad://guides/notebook` (notebook editor JSON format), `notepad://guides/todo` (todo editor JSON format), and `notepad://guides/links` (links editor JSON format). Agents are now directed to read the relevant guide before creating or editing these structured pages.
- **MCP input validation** — Better error messages when agents pass invalid arguments: dialog entries (`input.*`) are validated for unknown properties and missing required fields; `output.grid` content is validated to be a string and a valid JSON array; `addEditorPage` detects wrong argument types. Each error message includes a corrected usage example.
- **MCP Log page titles** — The MCP Server Log pages now use `.log.jsonl` suffixes in their titles, ensuring the Log View editor activates automatically instead of opening as plain text.
- **Graph editor** — The "Graph" view switch now only appears for `.fg.json` files or files whose content is recognized as force-graph data. It no longer shows up on arbitrary JSON files.
- **Graph legend panel** — The legend panel now always shows all five levels and all six shapes, even when the graph is new or empty, making it easier to set up before adding nodes.
- **Browser sidebar** — The Browser entry in the Tools & Editors sidebar now shows the correct cyan color, matching the browser tab icon.
- **Pinned links favicons** — Fixed favicons not appearing the first time the pinned links panel is opened.
- **Browser URL bar** — When the current page is `about:blank`, the URL bar now treats it as empty and shows recent suggestions instead of filtering by the literal text "about:blank".
- **Browser blank page bookmarks** — When a bookmarks file is configured for the current profile, opening a new browser tab now displays your bookmarks directly on the blank page. Click a link to navigate the current tab; `Ctrl+Click` opens the link in a new tab while keeping your bookmarks visible on the original. Encrypted bookmark files are not unlocked automatically — use the star button or bookmarks drawer to trigger decryption manually.
- **Page stability during grouping** — Grouping, ungrouping, closing, or reordering pages no longer causes remaining pages to reload their content. PDF documents, browser tabs, drawings, and other stateful editors now preserve their full state (scroll position, loaded content, canvas objects) through all tab operations.
- **Browser tab stability** — Closing or reordering internal browser tabs no longer causes the remaining tabs to reload. Blank-page bookmarks also preserve their scroll position when switching between tabs.
- **File Explorer context menu** — The folder context menu option was renamed from "Open in New Panel" to "Open in New Tab" for clarity.
- **MCP page content persistence** — Pages created via MCP or scripting with pre-filled content now correctly persist across app restarts. Previously the content was cached to disk but the page was not marked as modified, so the cache was never read back on restore.

---

## Version 1.0.24

### New Features

- **MCP Inspector** (early preview) — A new editor for connecting to MCP (Model Context Protocol) servers. Supports HTTP and stdio transports, displays server info (name, version, capabilities). Open via scripting: `app.pages.showMcpInspectorPage()`. More features coming in future releases.
  - **Tools panel** — Browse and call MCP tools from a resizable sidebar. View tool details (name, description, annotations), fill in arguments via a dynamic form with type-aware inputs, and see results in a Monaco editor. Use Ctrl+Enter to call quickly.
  - **Resources panel** — Browse resources and resource templates from the server. Read resource content with a single click — renders adaptively by type (Markdown, JSON/code, images).
  - **Prompts panel** — Browse server prompts, fill in arguments, and call `getPrompt` to see returned messages with role badges.
  - **Saved connections** — Connections auto-save on successful connect. A dropdown in the connection bar lists saved servers for quick reconnect, and a connections list appears when disconnected with click-to-fill and delete.
  - **Stdio transport fix** — Fixed stdio transport connectivity that was broken by the Vite build process.
  - **Request history** — A new "History" tab in the MCP Inspector records all outgoing requests with method, duration, and error status. Click "Open in Log View" to inspect details, or "Clear" to reset.
  - **Server Info tab** — When connected, a new "Server Info" tab (shown by default) displays full server metadata: name, title, version, description, website URL (clickable), and instructions (rendered as markdown). Empty optional fields are hidden automatically.
  - **Scripting API** — `page.asMcpInspector()` facade for scripts and MCP agents: read/write connection parameters (URL, transport type, command, args, connection name), check connection status and server info, connect/disconnect programmatically, and access request history for troubleshooting. New read-only properties: `serverTitle`, `serverDescription`, `serverWebsiteUrl`, `instructions`.

- **MCP Request Log** — The MCP indicator in the title bar is now clickable — opens the "MCP Server Log" page showing all incoming MCP requests. Each log entry displays a direction arrow (incoming/outgoing), method name, detail (tool name or resource URI), duration, and error badge. Expand any entry to see full request/response JSON with syntax highlighting.

- **Tools & Editors sidebar panel** — A new panel in the sidebar (between Recent Files and Script Library) that lists all creatable editors and tools in one place. Two sections: **Pinned** (drag-to-reorder, shown in the "+" new-page menu) and **All** (alphabetically sorted). Click any item to create a new page with that editor. Pin/unpin items with a button — pinned editors are saved in settings and persist across restarts. Default pinned: Script (JS), Script (TS), Drawing, Grid (JSON), Grid (CSV), Browser. The **+** new-page dropdown menu now shows only pinned editors plus a "Show All..." option that opens the sidebar to the Tools & Editors panel. Browser profiles (Incognito, named profiles) and MCP Inspector are accessible from the panel.

- **`app.window.openMenuBar(panelId?)`** — New scripting API to open the sidebar programmatically, optionally navigating to a specific panel (e.g., `"tools-and-editors"`).

---

## Version 1.0.23

### New Features

- **Drawing Editor** — New editor for `.excalidraw` files using the Excalidraw canvas. Supports shapes, arrows, text, and freehand drawing. Self-hosted fonts for full offline support. Dark/light theme syncs with the app theme automatically. Available from the quick-add menu ("Drawing") and can switch to Monaco for raw JSON editing.
  - **Theme toggle** — independent dark/light switch for the drawing canvas
  - **Copy to clipboard** — export the drawing as a PNG image (2x scale)
  - **Save as file** — export as SVG or PNG (2x scale) via a dropdown menu
  - **Open in new tab** — open the drawing as an SVG preview or PNG image in a new tab
  - **Screen Snip** — toolbar button (scissors icon) captures a screen region and inserts it as an image into the canvas. Hides all windows, shows a dimmed overlay on each monitor, drag-select a region to capture. Escape or right-click cancels. Supports multi-monitor setups with mixed DPI scaling.
  - **Scripting API** — `page.asDraw()` facade for scripts and MCP agents: `addImage()` inserts images onto the canvas, `exportAsSvg()` and `exportAsPng()` export the drawing. `app.pages.addDrawPage(dataUrl)` creates a new drawing page with an embedded image.
  - **Library persistence** — Excalidraw library items now persist to disk and survive page close and app restart. The "Browse libraries" button opens the Excalidraw libraries site in the internal browser, and installing a library adds it directly to the editor. Library storage location is configurable via the `drawing.library-path` setting (defaults to `<userData>/data/excalidraw-lib/`).
- **Open in Drawing Editor** — SVG Preview, Image Viewer, and Mermaid Diagram editors now have an "Open in Drawing Editor" toolbar button. Embeds the image/SVG as an Excalidraw element in a new drawing tab, where you can annotate it with shapes, arrows, and text. Images are capped to 1200px on the longer side, preserving aspect ratio.

---

## Version 1.0.22

### New Features

- **Graph View Legend Panel** — A collapsible panel at the bottom-left corner of the graph editor for documenting node levels and shapes. Expand to see two tabs (Level and Shape), each listing the levels or shapes present in the graph. Check boxes to highlight matching nodes (others are dimmed); type free-form descriptions that persist to the JSON `options.legend` object. The root node appears in both tabs with a shared description. Legend highlighting integrates with existing search and link highlighting (intersection when multiple are active).

- **Graph View Node Multi-Selection** — `Ctrl+Click` to toggle individual nodes in and out of a multi-selection. The edit panel header shows "N nodes selected" and the Info tab supports batch editing of Level and Shape (mixed values highlighted in yellow). The Properties tab displays a union of all selected nodes' properties with yellow highlights for differing values. The Links tab is hidden during multi-selection. Right-clicking a selected node preserves the multi-selection. Search results status bar adds **[select all]** and **[add to selection]** actions for bulk selection from search matches.
- **Graph View Legend Selection Tab** — The Legend panel gains a new **Selection** tab with radio filters for selected/not-selected nodes, enabling quick visual isolation of multi-selected subsets.
- **Graph View Group Nodes** — Nodes with `isGroup: true` are rendered as double circles (filled inner circle with a dark blue outer ring). Group nodes use level-1 size, always-visible labels, and appear in the Legend panel with their own "Group" row in both Level and Shape tabs. Tooltips show "Group · N members" where membership is derived from links from the group to non-group nodes. Group nodes are excluded from the detail edit panel and from legend level/shape counting.

- **Graph View Group Link Pre-processing** — When groups exist in a force graph, links are automatically pre-processed for cleaner visualization. Membership links (between a group and its members) are hidden. Cross-group links (from an external node to a group member) are routed through the group node. Inter-group links (between members of different groups) are routed through both group nodes. Intra-group links (between members of the same group) are preserved as-is. Synthetic links are deduplicated with count-based distance scaling.
- **Graph View Special Node Coloring** — Root nodes and group nodes now appear in violet, making them visually distinct from regular nodes. Selection (orange) and hover (green) highlights still override the violet color.
- **Graph View Tooltip Badges** — Root nodes show a "ROOT NODE" badge and group nodes show a "GROUP" badge as the first line in their tooltip, above the title.

- **Graph View Group Management** — Full UI for creating, editing, and removing groups. Multi-select 2+ regular nodes → right-click → "Group Selected" to create a new group (prompts for title). Select one group plus regular nodes → "Group Selected" to add nodes to the existing group. Right-click a group for "Ungroup" (dissolve group, keep members), "Delete Group" (remove group and all members), or "Edit Title" (rename). Right-click a member node for "Remove from Group". `Alt+Click` a regular node while a group is selected to toggle membership. Each node can belong to only one group — reassigning silently removes from the old group. Group membership is direction-agnostic (links in either direction count).

- **Graph View Tooltip Enhancements** — Node tooltips are now hoverable — move the mouse into the tooltip to interact with its content. Two new buttons in the tooltip header: **Copy as Markdown** (copies node info as a formatted markdown table) and **Open in new page** (opens the node info as a Markdown preview page). Property values containing markdown links (`[text](url)`) are rendered as clickable links within the tooltip.

- **Graph View Selection Toolbar** — When nodes are selected, an "N selected ▾" button appears in the graph toolbar. Clicking opens a popup menu with actions: "Select children" (expand selection to neighbors), "Select members" / "Select members deep" (expand to group members), "Highlight" (open Legend panel with Selection filter), "Copy (markdown)" / "Open (markdown)" for exporting selected nodes, "Group Selected", "Extract" / "Extract with children" (create new graph from selection), and "Delete N Nodes".

- **Graph View Context Menu Enhancements** — Node context menu gains "Select children". Group node context menu gains "Select members" and "Select members deep". Multi-select delete shows "Delete N Nodes" with confirmation for 2+. "Delete Link" renamed to "Delete Link to..." for clarity.

- **Graph View Disable Grouping** — A new toggle button (violet circle icon) in the toolbar lets you disable/enable group node rendering. When grouping is enabled, the button shows a diagonal strikethrough line (click to disable). When disabled, group nodes and their membership links are stripped from the graph, and all group-related context menu items are hidden. The button is greyed out when the graph has no groups. Deleting the last member of a group now auto-deletes the empty group (including cascading cleanup of nested groups).

- **Graph View Scripting API** — New `page.asGraph()` editor facade for querying and analyzing force-graph data from scripts and MCP agents. Provides read-only access to nodes, links, selection, neighbor/group relationships, search (multi-word AND), BFS traversal, and connected component analysis. A new MCP resource `notepad://guides/graph` documents the graph data format and API.

- **Graph View `Ctrl+A` Select All** — Press `Ctrl+A` in the graph editor to select all visible nodes.

- **Graph View "Open in grid" Selection Action** — The selection toolbar menu gains an "Open in grid" action that exports selected nodes as a JSON array to a new Grid editor page.

- **Graph View Indexed Property Display** — Node properties with `key#N` indexed suffixes (e.g., `tag#1`, `tag#2`) now display with the suffix stripped in tooltips and markdown export, showing the values as a clean list under the base key name.

- **Graph View `Ctrl+F` Search Focus** — Press `Ctrl+F` in the graph editor to focus the search input.

- **Graph View Toolbar Layout** — Toolbar auto-grows to fit content (min 280px) with fixed-width search input (130px).

- **Callable `await ui()` Yield** — Long-running scripts can now call `await ui()` to yield to the event loop, preventing the UI from freezing. Insert `await ui()` inside heavy loops to let the interface remain responsive during processing.

### Improvements

- **Graph View UI polish** — Node labels now scale font size by level (larger nodes get bigger text). Selection highlight reworked: selected node label is orange, hovered node and its children get green labels. Tooltips no longer appear during node drag. Edit panel tabs reordered to Info → Properties → Links. Links tab now shows all columns (ID, Title, Level, Shape + custom properties) with auto-detected widths and sticky ID column.
- **Graph View toolbar and panel UX** — Collapsed search toolbar stays visible with a green border when a search is active. Clicking on empty canvas collapses expanded panels without changing selection. Legend panel chevron turns green when expanded (replaces the previous green border indicator).
- **Graph View group membership detection** — Group membership now works with links in either direction (group→member or member→group), making group setup more flexible.
- **Graph View BFS visibility** — Initial visibility calculation now uses real graph depth instead of discovery order, producing more accurate node visibility for complex graphs. Focus node starts component detection so connected graphs no longer show disconnected clusters.
- **Graph View path highlighting** — Selecting a node now highlights the full visual path (orange) to all its real neighbors, including through group nodes. When hovering a node while another is selected, the green highlight also traces the full visual path through groups. The Links tab hover highlights only the selected node's children (not the hovered child's neighbors).
- **Graph View detail panel persistence** — Clicking a different node while the detail panel is expanded now keeps it open and updates the panel with the new selection, instead of collapsing it. Clicking the empty canvas still collapses.
- **Graph View "Selected with children" highlighting** — The Legend panel's Selection tab gains a new **Selected with children** radio option that highlights selected nodes plus all their visual and real neighbors. Hold **Shift** as a keyboard shortcut to temporarily apply this highlighting without opening the Legend panel.
- **Graph View Reset View button** — Now always enabled (previously disabled when no visibility filter was active). Resets BFS visibility and restarts the D3 simulation, re-compacting drifted nodes.
- **Graph View Expand All button** — Now hidden when no visibility filter is active, instead of showing as disabled.
- **Graph View Legend + Search interaction** — When search highlighting is active and the Legend panel is expanded, the Legend shows a "Search highlighting is active" message with a "Clear search" button instead of the normal tabs/content.
- **Graph View Legend Panel tab order** — The Selection tab is now the first and default tab in the Legend panel (previously the order was Level, Shape, Selection).
- **Graph View "Open link" context menu** — Right-clicking a node whose custom properties contain markdown links (`[text](path)`) now shows "Open {property}" at the top of the context menu. When multiple links exist, a "Open link..." submenu lists each one.
- **Graph View tooltip suppression** — Tooltips no longer appear while a context menu is open.

---

## Version 1.0.21

### New Features

- **Graph View Editor** — A force-directed graph viewer for `.fg.json` files. Also activates for any JSON file containing `"type": "force-graph"` and a `"nodes"` property. Click **Graph** in the toolbar to switch between the text editor and the graph view. Supports zoom (scroll wheel), pan (drag canvas), node dragging, click-to-select with neighbor highlighting, and hover highlighting. Node labels appear for selected/hovered nodes at sufficient zoom levels. Graph colors adapt to all 9 app themes. See [Editors](./editors.md#graph-view) for details.
- **Graph View node properties** — Nodes now support `title` (display label), `level` (size tier 1–5; level 1 is largest), and `shape` (`circle`, `square`, `diamond`, `triangle`, `star`, `hexagon`). Level 1 and 2 nodes always display their label. Labels show `title` if present, otherwise `id`.
- **Graph View collapse/expand** — Large graphs automatically show only the closest nodes (up to `maxVisible`, default 500). Nodes with hidden neighbors display a "+" badge — click to expand. New graph JSON `options` object supports `focus` (initial focus node ID), `expandDepth` (BFS depth limit), and `maxVisible` (node visibility cap). A **Reset View** toolbar button restores the initial visibility state.
- **Graph View search** — Search input in the graph toolbar supports multi-word AND matching across title, ID, and custom property names/values. An expandable results panel below the toolbar lists matching nodes with highlighted matches; hidden nodes appear at reduced opacity and can be clicked to reveal. Keyboard navigation with ArrowUp/Down, Enter to select, Escape to close. Status bar shows visible match count and a clickable "+N hidden" link for bulk reveal. The toolbar now has Settings and Results tabs for switching between force tuning and search results.
- **Graph View node tooltips** — Hovering over a graph node for ~500 ms shows an HTML tooltip with the node's title, id, and any custom user-defined properties. Known properties (`level`, `shape`) and internal D3 properties are excluded.
- **Graph View editing** — Right-click context menu for graph editing: "Add Node" on empty canvas, "Add Child" / "Delete Node" / "Delete Link" submenu on nodes. Alt+Click on a node toggles a link with the selected node. All edits serialize to clean JSON preserving existing node positions. Reset View shows disconnected components as root + one level of children.
- **Graph View detail panel** — A collapsible overlay panel at the top-right corner of the graph editor for editing node properties. Click the header to expand/collapse; double-click a node to expand. The panel auto-collapses when deselecting nodes. The Info tab provides editable fields for ID (with rename validation), Title, Level (1–5 icon selector), and Shape (6 shape icons). Changes immediately update the canvas and JSON. The panel is resizable via a bottom-left drag handle.
- **Graph View force tuning** — A gear icon in the graph toolbar toggles an expandable tuning panel with three sliders: Charge (-200 to 0), Distance (10 to 200), and Collide (0 to 1). Sliders update the force simulation in real time. Reset button restores defaults. Force parameters are transient (not saved to JSON). The toolbar is semi-transparent when idle and becomes fully opaque on hover or interaction.
- **Graph View Links tab** — The detail panel now includes a Links tab showing all nodes linked to the selected node in an editable grid. Three column presets (Default, View, Custom) control which properties are visible. Supports batch editing with Apply/Cancel, adding new linked nodes (including paste from Excel), and deleting rows with smart orphan removal. When the Links tab is active, non-linked nodes are dimmed on the canvas; focusing a grid row highlights the corresponding node in green and draws a green link line to it. Hidden children are auto-expanded when the tab is activated.
- **Graph View Properties tab** — The detail panel now includes a Properties tab showing all custom (non-core) key-value properties of the selected node in an editable grid. Supports inline editing, add/delete rows, copy/paste from spreadsheets, and Apply/Cancel batch workflow. Reserved keys (id, title, level, shape, system keys) are validated and blocked.
- **"Open in New Panel" for folders** — All folders in the File Explorer panel now have an **Open in New Panel** option in the right-click context menu. This opens the folder in a new File Explorer tab alongside the current editor. Previously this was only accessible by double-clicking linked sidebar folders.
- **Graph View settings persistence** — Physics settings (Charge, Distance, Collide) are now saved to the JSON `options` object and restored when the file is reopened. The toolbar's **Settings** tab has been renamed to **Physics**, and a new **Expansion** tab provides controls for Root Node (dropdown), Expand Depth, and Max Visible. The `options.focus` field has been renamed to `options.rootNode` in the JSON format.
- **Graph View root node** — The root node now has a distinct visual appearance: a compass (4-pointed star) shape, level-1 size, and an always-visible label. Right-click any node and choose **Set as Root** to designate it as the root node.
- **Graph View deep expand** — `Ctrl+Click` on a badge (+N) performs a "deep expand", revealing the entire hidden subtree connected to that node. Already-visible nodes act as barriers, so the expansion stops at nodes that are already shown. Regular click still expands one layer at a time.
- **Graph View Expand All** — New **Expand All** button in the graph toolbar (next to Reset View) makes all nodes visible at once. When the graph has more than 1,000 nodes, a confirmation dialog warns about potential performance impact before proceeding.
- **Graph View quick-add** — "Force Graph" added to the **+** dropdown menu on the tab bar, creating a new `.fg.json` page ready for editing.
- **Graph View file icon** — `.fg.json` files now display a custom graph icon (nodes and links) in the tab bar.
- **Graph View status bar** — The footer shows "N of M nodes" when visibility filtering is active, or "N nodes" when all nodes are visible.
- **Graph View empty page helper** — New empty graph pages display a centered hint: "Right-click → Add Node".
- **Graph View collapse** — Right-click a node and choose **Collapse** to hide its descendant nodes. This is the inverse of expand — useful for tidying up a large graph after exploring a subtree. Only available when visibility filtering is active.
- **Graph View canvas focus** — Clicking the graph canvas now properly dismisses open popup menus.

---

## Version 1.0.20

### New Features

- **Browse ZIP archives** — Open ZIP-based archives directly in the File Explorer panel. Right-click an archive in the file tree and choose **Open as Archive**, or double-click it in the sidebar navigation panel, to browse its contents as a folder tree. Supported formats: `.zip`, `.docx`, `.xlsx`, `.pptx`, `.jar`, `.war`, `.epub`, `.odt`, `.ods`, `.odp`. Navigate up from the archive root to return to the parent folder. Text-based files (XML, JSON, etc.) open in Monaco editor for inspection. File operations (create, rename, delete files and folders) work inside archives just like in regular folders.
- **Browse `.asar` archives** — Electron `.asar` archive files can now be browsed in the File Explorer panel, just like ZIP archives. Right-click and choose **Open as Archive**, or double-click in the sidebar. Files inside `.asar` open in Monaco editor for inspection. `.asar` archives are read-only — file operations (create, rename, delete) are disabled inside them.
- **Archive visual indicators** — Archive files now show a small clickable badge icon next to their name in the file tree (File Explorer panel and sidebar). Click the badge to open the archive in a new tab — a shortcut to **Open as Archive**. When browsing inside an archive, a banner appears at the top of the navigation panel: ZIP archives show "Archive content"; `.asar` archives show ".asar is read-only". File operations (rename, delete, new file/folder) and the search button are automatically hidden while inside an archive.
- **MCP `open_url` Tool** — AI agents can now open URLs in the [built-in browser](./browser.md) via the new `open_url` MCP tool. Supports optional `profileName` and `incognito` parameters for browser profile selection and private browsing.

### Improvements

- **Archive path support in `app.fs`** — All file system methods now transparently work with files inside ZIP archives using the `!` path separator (e.g., `"D:/temp/doc.zip!word/document.xml"`). Read, write, stat, list, and delete operations are all supported. See the [fs API reference](./api/fs.md#archive-paths) for details.
- **Extended `app.fs` API** — Five new file system methods for scripting: `rename`, `copyFile`, `stat`, `listDirWithTypes`, and `removeDir`. See the [fs API reference](./api/fs.md) for details.
- **MCP `create_page` error handling** — Calling `create_page` with a page-editor type (browser-view, pdf-view, image-view) now returns a clear error message explaining how to use `open_url` or `execute_script` instead, rather than crashing.
- **Popup rate limiting** — Browser popup/tab blocking now uses a single app-wide limiter (max 3 per 2 seconds) instead of per-tab limits, preventing cascade attacks where each new tab opens more tabs.

---

## Version 1.0.19

### New Features

- **Log View Editor** — A structured log viewer for `.log.jsonl` files that renders typed log entries with virtualized scrolling
  - **Message entries** — five log levels (`info`, `warning`, `error`, `success`, `debug`) with level-appropriate text colors
  - **Styled text** — rich text with per-segment foreground/background colors and bold/italic formatting
  - **Interactive dialogs** — three dialog types render inline within the log stream:
    - `input.confirm` — message with Yes/No buttons
    - `input.text` — title, text input field, and action buttons
    - `input.buttons` — array of clickable buttons
    - `input.checkboxes` — list of checkboxes with optional title and layout modes
    - `input.radioboxes` — single-selection radio button group with optional title and layout modes
    - `input.select` — dropdown select with search/filter and keyboard navigation
  - Dialogs have **pending** (active border, clickable) and **resolved** (dim border, disabled, check icon on chosen button) states
  - `!` prefix on button names marks them as "required" — disabled until the text field has a value
  - Text input values and dialog results persist to the JSONL content immediately (text input debounced at 300ms)
  - Auto-scroll to bottom when new entries appear
  - Toolbar buttons: **Clear log** (removes all entries) and **timestamps toggle** (off by default)

- **MCP `ui_push` Tool** — AI agents can now push log entries and interactive dialogs to a Log View page via the new `ui_push` MCP tool
  - **Log entries** — `log.text`, `log.info`, `log.warn`, `log.error`, `log.success` for styled status messages
  - **Interactive dialogs** — `input.confirm`, `input.text`, `input.buttons`, `input.checkboxes`, `input.radioboxes`, `input.select` render inline in the Log View; the tool blocks until the user responds
  - **String shorthand** — plain strings in the entries array are treated as `log.info`
  - **Automatic page management** — Log View page is created on first call, reused on subsequent calls, and recreated if the user closes it
  - Recommended output channel for AI agents — prefer `ui_push` over `create_page` for showing status, results, and asking questions

- **Checkboxes Dialog** — New `ui.dialog.checkboxes()` method for scripts and `input.checkboxes` entry for MCP `ui_push`
  - Items can be strings or `{ label, checked? }` objects with pre-checked state
  - Two layout modes: `"vertical"` (one per row, default) and `"flex"` (items wrap horizontally)
  - `!` prefix on buttons disables them until at least one item is checked
  - Result includes `items` array with updated `checked` state

- **Radioboxes Dialog** — New `ui.dialog.radioboxes()` method for scripts and `input.radioboxes` entry for MCP `ui_push`
  - Items are plain strings (single-selection radio button group)
  - Two layout modes: `"vertical"` (one per row, default) and `"flex"` (items wrap horizontally)
  - Pre-selected item via `checked` option
  - `!` prefix on buttons disables them until an item is selected
  - Result includes `checked` field with the selected item label

- **Progress Bar** — New `ui.show.progress()` method for scripts and `output.progress` entry for MCP `ui_push`
  - Shows a progress bar inline in the Log View with label, value, max, and completed state
  - Returns a `Progress` helper with live property setters — update `value`, `label`, `max`, or `completed` to animate the bar in real-time
  - `completeWithPromise(promise, label?)` auto-completes the bar when a promise settles
  - MCP agents use `output.progress` entries with upsert-by-id to create and update progress bars

- **Markdown Output** — New `ui.show.markdown()` method for scripts and `output.markdown` entry for MCP `ui_push`
  - Render markdown content inline in the Log View — headings, tables, code blocks, Mermaid diagrams, task lists, and blockquotes
  - Two overloads: `ui.show.markdown(text)` for quick display, `ui.show.markdown({ text, title? })` for adding a title
  - Returns a `Markdown` helper with live `text` and `title` setters for real-time updates
  - `openInEditor(pageTitle?)` opens the markdown in a dedicated Markdown editor tab
  - Hover toolbar with "Open in Markdown editor" button
  - MCP agents use `output.markdown` entries with `text` and optional `title`

- **Mermaid Output** — New `ui.show.mermaid()` method for scripts and `output.mermaid` entry for MCP `ui_push`
  - Render Mermaid diagrams inline in the Log View with theme-aware rendering (light/dark)
  - Two overloads: `ui.show.mermaid(text)` for quick display, `ui.show.mermaid({ text, title? })` for adding a title
  - Returns a `Mermaid` helper with live `text` and `title` setters for real-time updates, plus `openInEditor()` to open in the Mermaid editor
  - Hover toolbar with "Copy image to clipboard" and "Open in Mermaid editor" buttons
  - MCP agents use `output.mermaid` entries with `text` and optional `title`

- **Grid Output** — New `ui.show.grid()` method for scripts and `output.grid` entry for MCP `ui_push`
  - Display tabular data inline in the Log View using a full-featured grid (AVGrid)
  - Two overloads: `ui.show.grid(data)` for quick display, `ui.show.grid({ data, columns?, title? })` for custom columns and title
  - Column definitions can be strings (key names) or objects with `key`, `title`, `width`, and `dataType` properties
  - Returns a `Grid` helper with live `data`, `columns`, and `title` setters for real-time updates
  - `openInEditor(pageTitle?)` opens the data in a dedicated Grid editor tab
  - Grid supports column resizing, column reordering, cell selection, and copy-to-clipboard
  - Hover toolbar with "Open in Grid editor" button
  - MCP agents use `output.grid` entries with `content` (JSON or CSV string), optional `contentType` (`"json"` or `"csv"`), and optional `title`

- **Text Output** — New `ui.show.text()` method for scripts and `output.text` entry for MCP `ui_push`
  - Display syntax-highlighted text inline in the Log View using an embedded Monaco editor (read-only)
  - Two overloads: `ui.show.text("code", "javascript")` for quick display, `ui.show.text({ text, language?, title?, wordWrap?, lineNumbers?, minimap? })` for full control
  - Defaults: language `"plaintext"`, wordWrap `true`, lineNumbers `false`, minimap `false`
  - Returns a `Text` helper with live property setters (`text`, `language`, `title`, `wordWrap`, `lineNumbers`, `minimap`) for real-time updates
  - `openInEditor(pageTitle?)` opens the text in a new Monaco editor tab
  - MCP agents use `output.text` entries with `text`, optional `language`, `title`, `wordWrap`, `lineNumbers`, and `minimap` fields

- **Select Dialog** — New `ui.dialog.select()` method for scripts and `input.select` entry for MCP `ui_push`
  - Dropdown select using a searchable combo box with keyboard navigation
  - Items are plain strings
  - Pre-selected item via `selected` option, customizable placeholder text
  - `!` prefix on buttons disables them until an item is selected
  - Result includes `selected` field with the chosen item label

### Improvements

- **Console Forwarding to Log View** — When a script uses `ui`, `console.log/info/warn/error` are automatically forwarded to the Log View (`console.log` maps to lighter `log.log` text, `console.info` → `log.info`, etc.). The native console is always called. Suppress forwarding per level with `ui.preventConsoleLog()`, `ui.preventConsoleWarn()`, or `ui.preventConsoleError()`. MCP scripts with `ui` send console output to both the MCP response and the Log View.
- **`ui.log()` Lighter Text** — `ui.log()` now renders with lighter text (`log.log` level), visually distinct from `ui.text()` which uses normal text color (`log.text` level)
- **Fluent Styled Text in Log View** — `ui.log()`, `ui.info()`, `ui.warn()`, `ui.error()`, `ui.success()`, and `ui.text()` now return a builder for fluent chaining: `ui.log("Status: ").append("OK").color("lime").bold().print()`. Existing code that ignores the return value is unaffected.
- **`styledText()` Global** — New standalone function for building styled text outside the Log View, for use in dialog labels and anywhere styled text is accepted: `const label = styledText("Warning").color("red").bold().value;`
- **Dialog Two-Overload Pattern** — All `ui.dialog` methods (`confirm`, `buttons`, `textInput`) now support two calling styles: a simple form with positional arguments (e.g., `confirm("message", buttons?)`) and a full form with a single options object (e.g., `confirm({ message, buttons? })`)
- **Log View Dialog UX** — Dialogs now have fit-content width, improved button padding, and auto-scroll to bottom when a new dialog appears
- **Log View Rendering** — Fixed empty lines growing unexpectedly, eliminated height jumping for new rows, and improved auto-scroll reliability
- **JSONL Language Support** — Syntax highlighting for `.jsonl` and `.ndjson` files (JSON Lines format) with dedicated file icon
- **Grid View for JSONL** — Switch to Grid editor for `.jsonl`/`.ndjson` files to view, sort, filter, and edit data as a spreadsheet

### Bug Fixes

- **ScriptRunner Block Closers** — Scripts ending with block-closing syntax like `});` no longer fail with syntax errors

### Internal

- **Flat Log Entry Format** — Log entries in `.log.jsonl` files and MCP `ui_push` now use a flat object structure (e.g., `{ type: "log.info", text: "Hello" }`) instead of the previous `{ type, data }` wrapper. Dialog entries are flat too (e.g., `{ type: "input.confirm", message: "Sure?", buttons: ["Yes", "No"] }`). Dialog results return the full flat entry object.
- **Editor Error Boundary** — Editors that fail to render now show an error message with stack trace in the tab instead of crashing the application
- **Log Entry Error Boundary** — Individual log entries that fail to render show an error stub instead of crashing the entire Log View

---

## Version 1.0.18

### New Features

- **Library Imports in Scripts** — Use `require("library/...")` to import reusable modules from your linked Script Library folder
  - Both `.ts` and `.js` files supported — TypeScript is transpiled automatically
  - Extension auto-resolution: `.ts`, `.js`, `/index.ts`, `/index.js` tried automatically
  - Relative requires within library modules work (e.g., `require('./db-config')`)
  - Cache invalidated between runs when source files change
  - Clear error message when no library folder is linked

- **Script Library** — A dedicated sidebar entry for quick access to your reusable script collection
  - Link any folder as your Script Library via the sidebar or Settings → Script Library
  - Browse and open scripts from the sidebar's right panel (File Explorer view)
  - Context menu: Change Library Folder, Open in Explorer, Unlink Library
  - Settings page section with path display, Browse button, and Unlink button

- **IntelliSense for Library Modules** — When a Script Library folder is linked, Monaco now provides autocomplete and type information for `require("library/...")` calls
  - **Path completion** — typing `require("library/` auto-suggests folders and files; selecting a folder re-triggers suggestions to drill deeper; files shown without extension
  - Exported functions, variables, and types from library `.ts`/`.js` files appear in autocomplete with parameter types, return types, and JSDoc documentation
  - Updates live when library files are modified
  - Built-in `require()` and `preventOutput()` also show in autocomplete with documentation

- **Library Setup Wizard** — Linking a Script Library folder now opens a setup dialog instead of a raw folder picker
  - Folder path input with Browse button
  - "Copy example scripts" checkbox (on by default) populates the folder with bundled starter scripts: general-purpose examples, text utilities, JSON formatters, and a shared helper module
  - Existing files are never overwritten — safe to run on a folder that already has scripts
  - Triggered from the sidebar "Select Folder", Settings "Browse...", and Script Panel save (when no library is linked)

- **Script Panel — Script Selector & Save** — The Script Panel toolbar now includes a dropdown to browse and load saved scripts from your library, plus a Save button to store scripts for reuse
  - Script selector lists scripts from `script-panel/{language}/` and `script-panel/all/` folders in the library
  - Scripts from the "all" folder shown with "all/" prefix to distinguish them
  - Select a script to load it; choose "(unsaved script)" for ad-hoc editing
  - Save button for ad-hoc scripts opens a dialog with filename input and folder selection (language-specific or "all")
  - Save button for library scripts directly overwrites when content is modified
  - `Ctrl+S` shortcut works when the Script Panel editor is focused
  - Folders created automatically as needed; overwrite confirmation for existing files

### Bug Fixes

- **Library `.js` ES Module Support** — `.js` files in the Script Library using `export`/`import` syntax now work correctly. Previously only `.ts` files were transpiled; `.js` files with ES module syntax would fail at runtime

- **Example Script Fixes** — All bundled example scripts now use browser APIs (`btoa`/`atob`) instead of `Buffer.from()`, which is not available in the script sandbox. The `parse-jwt-token` script now strips "Bearer " prefix automatically. The `format-json` script now sets the output language to JSON for proper syntax highlighting.

### Improvements

- **Script Library — Open in New Tab** — Double-click the Script Library sidebar entry (or click its icon when selected) to open it in a new tab with the File Explorer panel, just like custom linked folders

- **Script Panel — Open in New Tab** — New toolbar button opens the currently selected script (or an empty page) in a new tab with the File Explorer panel rooted at the `script-panel/` folder

- **Structured Editor Auto-Detection** — JSON content created via MCP or scripting now embeds a `type` property (`"note-editor"`, `"todo-editor"`, or `"link-editor"`), so the correct editor switch button (Notebook, ToDo, or Links) appears in the toolbar automatically — even without the `.note.json`/`.todo.json`/`.link.json` file extension

---

## Version 1.0.17

### New Features

- **AI Agent Integration (MCP HTTP Server)** — external AI agents (such as Claude Desktop, Claude Code, ChatGPT, or Gemini) can now connect to js-notepad and control it programmatically via HTTP
  - Server listens on `http://localhost:7865/mcp` (port is configurable via the `mcp.port` setting)
  - Connect any MCP-compatible client by pointing it to the server URL
  - Dedicated **MCP Server** section in Settings with enable/disable toggle, port input, live status indicator (green/red dot), **Copy URL** and **Copy Config** buttons
  - Disabled by default — enable with a single checkbox in Settings → MCP Server
  - Port is configurable in Settings (default: `7865`); disable MCP first, change the port, then re-enable
  - Server is bound to localhost only (127.0.0.1) and is not accessible from other machines
  - Available tools: `execute_script`, `list_pages`, `get_page_content`, `get_active_page`, `create_page`, `set_page_content`, `get_app_info`
  - Console output (`console.log`, `console.error`, etc.) from scripts executed via MCP is captured and returned to the agent
  - **API Guide resources** — AI clients can read focused guides (`notepad://guides/ui-push`, `notepad://guides/pages`, `notepad://guides/scripting`) or the full combined reference (`notepad://guides/full`) directly from the MCP server. Server instructions provide immediate context on connection.
  - **Title bar MCP indicator** — when the MCP server is active, a small indicator (green dot + "MCP" label) appears in the title bar with a live connection count; hidden when MCP is disabled
  - **Multi-window support** — all MCP tools accept an optional `windowIndex` parameter to target specific windows. New `list_windows` tool discovers all windows (open and closed) with their pages. New `open_window` tool reopens closed windows with their persisted pages
  - See [MCP Server Setup](./mcp-setup.md) for configuration instructions

- **TypeScript Script Execution** — scripts now support TypeScript in addition to JavaScript
  - Write scripts with type annotations (interfaces, typed variables, etc.) — types are stripped automatically before execution
  - The Script Panel uses TypeScript by default, accepting both plain JavaScript and TypeScript seamlessly
  - Press `F5` on `.ts` files to execute them, just like `.js` files
  - Notebook notes with TypeScript language show a Run button and can be executed
  - **Quick Add: Script (TS)** — new option in the tab bar's "+" dropdown menu to create a TypeScript script page
  - MCP `execute_script` tool accepts an optional `language` parameter (`"javascript"` or `"typescript"`)

- **Text Dialog** — new `app.ui.textDialog()` method that opens a Monaco-based dialog for displaying or editing multi-line text
  - Configurable title, buttons, read-only mode, and dialog dimensions
  - Monaco editor options: language for syntax highlighting, word wrap, minimap, line numbers
  - Useful for showing error details, editing SQL queries, reviewing logs, or getting multi-line input from scripts

- **Output Suppression** — scripts can now prevent the default output to the grouped page
  - Call `preventOutput()` to explicitly suppress output (e.g., when showing results in a dialog)
  - Writing to `page.grouped.content` directly now automatically suppresses default output
  - When output is suppressed and an error occurs, the error is shown in a text dialog instead

- **`page.runScript()`** — new method to programmatically run a JavaScript/TypeScript page as a script (equivalent to pressing F5), returning the result as text

### Improvements

- **Todo Editor Scripting** — 4 new methods on the `asTodo()` facade: `selectList(name)`, `selectTag(name)`, `setSearch(text)`, `clearSearch()` — allowing scripts and MCP agents to navigate and filter the todo UI programmatically

- **MCP `create_page` Editor Validation** — passing an invalid editor ID to `create_page` now returns a descriptive error with the list of valid editor IDs, instead of silently failing

- **MCP Lazy Loading** — the MCP SDK is now loaded on-demand when the server starts, rather than at app startup. Combined with a 1.5s deferred auto-start, this improves application launch time for all users

- **Markdown Preview — Mermaid "Open in Editor"** — hover over an inline mermaid diagram to see a toolbar with two buttons: copy image to clipboard, and open the diagram source in a new Mermaid editor tab

- **External Link Routing** — external links now prefer the active browser page when one is available. Empty browser tabs (`about:blank`) are reused instead of opening a new tab

- **Image Viewer — Save Image to File** — URL-based images now have a "Save Image to File" button in the toolbar that downloads the image and saves it to disk, then switches to file mode

- **Link Editor — Image URL Clear Button** — the Image URL field in the Edit Link dialog now has a clear (X) button for quickly removing the image

- **Monaco Minimap Click** — clicking on the minimap background now scrolls directly to that position in the document

- **Auto-Hiding Scrollbars** — tree views and grids now use VSCode-like auto-hiding scrollbars that appear on hover, reducing visual clutter

- **Sidebar Folder Double-Click** — double-clicking a folder in the sidebar now opens it in a NavigationPanel tab

### Bug Fixes

- **NavigationPanel Folder State** — fixed expanded folder state being lost on first navigation in NavigationPanel

---

## Version 1.0.16

### New Features

- **Browser Editor — Download Manager** — download progress tracking and history in the browser toolbar
  - **Download button** with circular progress ring that animates while downloads are active (icon turns active color)
  - Click the button to open a **Downloads popup** listing all downloads (most recent first)
  - Active downloads show a progress bar with received/total bytes and a **Cancel** button
  - Completed downloads show **Open** (launches file with default app) and **Show in Folder** (opens Explorer with file selected) buttons
  - Failed or cancelled downloads display status text
  - **Clear** button to dismiss completed and failed entries
  - Global download list — shared across all browser pages and windows
  - Last 5 completed downloads are persisted and restored on app restart
  - Uses the native OS save dialog for choosing download location

### Improvements

- **Browser Editor — Find in Page** — `Ctrl+F` now opens a proper inline search bar (replacing the `prompt()` dialog):
  - Match counter showing "3 of 15" or "No results"
  - Next/Previous navigation with `Enter`/`Shift+Enter` or `F3`/`Shift+F3`
  - Close with `Escape` or close button — clears all highlights
  - Works when focus is inside the web page (via main process key interception)
  - Auto-closes on page navigation or tab switch

- **Browser Editor — Keyboard Shortcuts** — standard browser hotkeys now work regardless of focus location:
  - `F5` — Reload page
  - `Ctrl+F5` / `Ctrl+Shift+R` — Hard reload (bypass cache)
  - `Ctrl+R` — Reload (alias)
  - `F12` — Open DevTools
  - `Alt+Left` / `Alt+Right` — Back / Forward
  - `Alt+Home` — Navigate to the tab's home page
  - `Escape` — Stop loading

- **Browser Editor — Automatic Cache Cleanup** — when a browser page is closed, HTTP cache, compiled code cache, and service worker caches are automatically cleared to save disk space. Cookies, localStorage, and other site data are preserved so you stay logged in.

- **Browser Editor — Popup Blocking** — sites that try to spam popup windows or internal tabs are now rate-limited (max 3 within 2 seconds). A notification bar appears when popups are blocked, with an "Allow" button to temporarily permit popups for that page.

- **Link Editor — Browser Selector Button** — toolbar button to choose where links open: OS default browser, internal browser, a specific browser profile, or incognito mode. Initialized from the app setting, adjustable per session.

- **Link Editor — Hostnames Panel** — new collapsible panel in the sidebar showing hostnames extracted from all links, allowing quick filtering by hostname.

- **Link Context Menu — Browser Profiles** — right-click context menu on links in Link Editor, Markdown Preview, and pinned links now includes all configured browser profiles (not just Default/Internal/Incognito).

- **Link Editor — Session State Persistence** — selected category, tag, hostname, and expanded panel are remembered across app restarts (restored when reopening the same file).

- **Todo Editor — Session State Persistence** — selected list and tag are remembered across app restarts.

- **Pinned Tab Tooltip** — hovering over a pinned tab now shows the full file path in a tooltip (with a 1.5s delay), making it easy to identify pinned files without unpinning them.

- **Lightweight Launcher** — new `js-notepad-launcher.exe` (308KB Rust binary) for near-instant file opening via Named Pipe. When js-notepad is already running, files and URLs are delivered in under 50ms instead of ~1 second. Supports file paths, URLs, relative paths, and diff mode for Git Extensions integration.

- **Register as Default Browser** — js-notepad can now register itself as a Windows default browser, so clicking links in other applications (email, chat, documents) opens them in js-notepad's built-in browser editor.
  - **Settings → Default Browser** section with Register / Unregister buttons and status indicator
  - "Open Windows Default Apps" button navigates directly to the JS-Notepad page in Windows Settings
  - Registry keys written to HKCU (no admin required)
  - URLs from the OS always open in the internal browser tab using the default profile
  - Works on cold start and when js-notepad is already running (via the launcher's named pipe)

- **NSIS Installer** — production builds now use electron-builder with a custom NSIS installer featuring an options page: desktop/start menu shortcuts, Explorer context menu ("Open with js-notepad"), file associations, and browser registration.

### Bug Fixes

- **Default Browser — External URL Routing** — fixed an issue where clicking links in external applications (when js-notepad is the default browser) could create duplicate browser pages instead of reusing the existing one. External URLs now correctly find the first browser page with the default profile and add a new internal tab there.

---

## Version 1.0.15

### Improvements

- **Link Editor Enhancements**
  - **Favicons** — cached favicons from the internal browser displayed next to links in list view and as tile fallback; favicons also saved when opening links via "Open in Internal Browser" from standalone `.link.json` files
  - **Drag-and-drop** — drag links onto categories to reassign them; drag categories onto other categories to reparent (with confirmation dialog showing affected link count)
  - **Pinned links panel** — pin important links via right-click → "Pin"; pinned panel on the right edge shows favicon + title, auto-hides when empty, resizable via splitter, with drag-to-reorder support

---

## Version 1.0.14

### New Features

- **Browser Bookmarks** — Per-profile bookmark management integrated into the browser editor
  - **Star button (☆)** in the URL bar for quick bookmarking
    - Empty star when URL is not bookmarked; filled star when already bookmarked
    - Click to open Edit Link Dialog with URL and title prefilled
    - Discovered images from page meta tags and click tracking available for selection
  - **Bookmarks panel** — "Open Links" toolbar button opens a sliding overlay drawer with the full Link Editor
    - Right-anchored overlay with semi-transparent backdrop
    - Browse, search, edit, and manage all bookmarks with categories, tags, and multiple view modes
    - Click a link to navigate (opens in current tab if blank, otherwise new internal tab)
    - Resizable panel (initial width 60%, max 90%), Categories/Tags panel on the right
    - Closes on Escape, backdrop click, or after link click navigation
  - **Context menu bookmarking** — right-click a link or tile on a web page → "Add to Bookmarks" with captured URL, title, and image
  - **Image discovery** — collects candidate images from multiple sources:
    - Page meta tags (`og:image`, `twitter:image`, etc.)
    - Images inside clicked `<a>` elements (captured before navigation)
    - "Use Image for Bookmark" context menu on right-clicked images
    - Per-tab image tracking with navigation levels (remembers images from previous pages)
  - **Per-profile bookmarks files** — each browser profile (Default, named, Incognito) can have its own `.link.json` bookmarks file, configured in **Settings → Browser Profiles**
  - Bookmarks fully functional in incognito mode
  - Supports encrypted `.link.json` files with async password dialog
  - All edits auto-save to the bookmarks file

### Improvements

- **Async Password Dialog** — The file encryption/decryption password prompt is now a standalone async dialog (`showPasswordDialog`) that can be used from any code path, replacing the previous inline panel in the text editor. Same dialog pattern as other app dialogs (confirmation, input).

---

## Version 1.0.13

### New Features

- **Browser Editor** — Browse the web directly in a js-notepad tab
  - Open via the dropdown arrow next to the **+** button → **Browser**
  - URL bar with Enter to navigate; plain text searches Google automatically
  - Back, Forward, Reload/Stop navigation buttons
  - **Home button** — each tab remembers its "home" URL (first URL navigated to); click to return
  - **Internal tabs** — multiple browser tabs within a single js-notepad tab
    - Left-side tabs panel with favicon and title (starts collapsed to icon-only mode)
    - `target="_blank"` links open as new internal tabs; `window.open()` from JavaScript opens real popup windows (preserving OAuth/auth flows)
    - Close Tab button in toolbar; new tab button at the bottom of the tabs panel
    - Tab context menu: Close Tab, Close Other Tabs, Close Tabs Below
    - Resizable tabs panel with splitter (transparent, minimal visual weight)
    - Active tab styled with dark background and blue border
    - **Compact mode** — when tabs panel is narrow, hovering a tab shows a floating extension popup with title and close button
    - **Audio mute** — volume icon on tabs playing audio; click to mute/unmute individual tabs or all tabs at once (page-level mute on the js-notepad tab)
    - Closing the last tab opens a fresh blank page
  - Page title and favicon displayed in the js-notepad tab
  - Loading indicator bar below the toolbar
  - Find in page with `Ctrl+F`
  - Focus URL bar with `Ctrl+L`
  - **Search engine selector** — Firefox-style engine picker in the URL bar on blank pages and search result pages
    - 11 engines: Google (default), Bing, DuckDuckGo, Yahoo, Ecosia, Brave, Startpage, Qwant, Baidu, Perplexity, Gibiru
    - Switch engines on a search results page to re-search the same query
  - **URL suggestions dropdown** — autocomplete in the URL bar
    - On focus: shows navigation history (URLs visited in the current tab)
    - On typing: shows filtered search history with multi-word matching and highlighted matches
    - Keyboard navigation (Arrow keys, Enter, Escape)
    - "Clear" button removes visible filtered entries from search history
    - Search history persisted per profile; skipped for incognito
  - **Context menu** — right-click in the web page for contextual actions
    - On links: Open Link in New Tab, Copy Link Address
    - On images: Open Image in New Tab (opens in Image Viewer), Copy Image Address
    - On selected text: Copy; on editable fields: Cut, Copy, Paste
    - On SVG elements: Open SVG in Editor (with auto-fixed xmlns/viewBox for standalone rendering)
    - Navigation: Back, Forward, Reload
    - Developer: View Source (raw server HTML), View Actual DOM (live rendered DOM), Inspect Element
  - **URL bar** with navigate button and "Paste and Go" in right-click menu
  - **Browser Profiles** — isolated browsing sessions with separate cookies, storage, and cache
    - Create named profiles with custom colors in **Settings → Browser Profiles**
    - Each profile gets its own Electron session partition
    - Open a profiled browser via the **+** dropdown → **Browser profile...** submenu
    - Set a default profile — the **Browser** quick-add item uses it
    - Profile color shown on the page tab icon (tinted globe)
    - Change profile color by clicking the color dot in Settings
    - Clear browsing data per profile ("clear data" button)
    - Delete a profile with confirmation (also clears all data from disk)
  - **Incognito mode** — ephemeral browsing with no persistent data
    - Open via **+** dropdown → **Browser profile...** → **Incognito**
    - Incognito icon on page tab and inside the URL bar
    - Data is automatically discarded when the tab closes
  - **Link integration** — external links from editors can open in the internal browser instead of the OS default
    - New setting in **Settings → Links**: "Open in default OS browser" or "Open in internal Browser tab"
    - Smart routing: links open in the nearest browser tab (searches right, then left from the active page); creates a new one if none exists
    - Markdown Preview link context menu: "Open in Default Browser", "Open in Internal Browser", "Open in Incognito"
    - Monaco Ctrl+Click on links also respects the global setting
  - DevTools access via gear icon in toolbar
  - Session restore — all internal tabs, URLs, navigation history, and profile selection persisted across app restarts
  - Isolated storage — cookies and site data separated from the main application
  - Security: navigation to `file://` and `app-asset://` protocols is blocked

- **Link Editor** — A structured link manager for `.link.json` files
  - Organize links with **categories** (hierarchical tree) and **tags**
  - **5 view modes**: List, Landscape tiles, Landscape (Large) tiles, Portrait tiles, Portrait (Large) tiles
  - View mode remembered per category and per tag independently
  - Custom view mode icons in toolbar and mode selector menu
  - Tile views display preview images with "no image" placeholder
  - **Edit/Create dialog** with auto-growing title field, URL, category with autocomplete, tag chips with autocomplete, image URL with preview
  - Discovered images section in dialog (prepared for future browser bookmark integration)
  - **Context menu**: Edit, Open in Default Browser, Open in Internal Browser, Open in Incognito, Copy URL, Delete
  - Conditional image items: Copy Image URL, Open Image in New Tab (opens in Image Viewer)
  - Search/filter links by title or URL
  - Delete confirmation with Ctrl+click bypass
  - Double-click to edit in both list and tile views
  - Selection overlay using semi-transparent pseudo-elements
  - Distinctive file icon for `.link.json`
  - Can switch to Monaco for raw JSON editing

- **Quick Add: Links** — The dropdown menu next to the "+" tab button now includes a "Links" option to create a new `.link.json` file

---

## Version 1.0.12

### New Features

- **Search in Files** — Press `Ctrl+Shift+F` in the File Explorer panel to search file contents across the entire folder tree
  - Results streamed incrementally as files are scanned (search runs in the main process — no UI freezes)
  - Results panel below the file tree, grouped by file with matched lines and highlighted text
  - Click a result to open the file in Monaco editor at the matched line with search text highlighted
  - File tree filters to show only files with matches during active search
  - Include/exclude glob patterns for targeted searching
  - Default excludes: `node_modules`, `.git`, and other common non-source directories
  - While the search panel is open, file tree clicks activate Monaco editor instead of preview mode
  - Configurable searchable file extensions in Settings → File Search

---

## Version 1.0.11

### New Features

- **Todo Editor** — A structured task list editor for `.todo.json` files
  - Organize tasks into multiple named lists (e.g., "Project A", "Personal")
  - **Tags** — define colored tags and assign one tag per item (e.g., "bug", "feature", "critical")
  - **Tag filtering** — click a tag in the left panel to filter; combines with list filter and search (AND logic)
  - **Tag management** — add, rename, delete tags; assign colors from a predefined palette
  - Each list shows undone/total count badges
  - Quick-add input — type and press Enter to create new items
  - Checkbox toggle to mark items done/undone
  - Undone items first, done items sorted by completion date (newest first)
  - Drag-to-reorder undone items via drag handle (warnings when reorder isn't possible)
  - Optional multiline comments on any item
  - Hover to see created and done dates
  - Toolbar search with live filtering and highlighted matches
  - Inline editing of titles and comments for both done and undone items
  - Add, rename, and delete lists (with confirmation dialogs)
  - Resizable left panel with splitter
  - Virtualized item list for smooth scrolling
  - Can switch to Monaco for raw JSON editing
  - Distinctive file icon for `.todo.json` files

- **Quick Add: Todo** — The dropdown menu next to the "+" tab button now includes a "Todo" option to create a new `.todo.json` file

---

## Version 1.0.10

### New Features

- **Open Folder in New Tab** — Click the chevron icon on a selected sidebar folder to open a new tab with the File Explorer panel showing that folder's contents

- **Markdown Search** — Press `Ctrl+F` in Markdown Preview to search text
  - All matches highlighted with match counter ("3 of 17")
  - Navigate matches with `F3` / `Shift+F3` or arrow buttons
  - Active match highlighted with background color and scrolled into view
  - `Esc` or close button to dismiss

### Improvements

- **Pinned Tab Grouping** — Pinned tabs can now be grouped with other tabs for side-by-side view
  - Script execution works in pinned tabs (output goes to grouped tab as expected)
  - Duplicate Tab works for pinned tabs
  - Grouping is preserved when pinning/unpinning a tab
  - Ctrl+Click grouping between pinned and unpinned tabs works

- **Deleted File Indicator for Pinned Tabs** — The modification dot on pinned tabs now turns red when the file has been deleted from disk, matching the red title shown on normal tabs

### Bug Fixes

- **HTML Preview navigation crash** — Fixed an issue where clicking links in the HTML Preview editor could crash the application in production builds. Links in HTML Preview are now blocked from navigating.

---

## Version 1.0.9

### New Features

- **Pinned Tabs** — Keep important tabs compact and always visible
  - Right-click a tab → "Pin Tab" to pin it; "Unpin Tab" to unpin
  - Pinned tabs display as compact icon-only tabs at the left of the tab bar
  - Stay fixed in place when scrolling through other tabs (sticky positioning)
  - Cannot be closed or dragged to another window
  - Can be reordered among other pinned tabs by dragging
  - Show language icon, encryption icon, and modification dot
  - Navigate to other files via File Explorer panel while staying pinned
  - Pinned state persists across app restarts
  - Windows with pinned tabs are preserved on close (reopenable from sidebar)
  - "Close Other Tabs" and "Close Tabs to the Right" skip pinned tabs

---

## Version 1.0.8

### New Features

- **File Explorer Panel** — Browse files alongside any open document
  - Click the File Explorer button in the toolbar to open a tree-based file browser
  - Available for all file types: text, markdown, images, PDFs
  - Shows all files and folders in the same directory as the current file
  - Click any file to navigate in-place — content replaces in the same tab (no new tabs)
  - Navigated files auto-switch to preview mode (Markdown preview, SVG view, Mermaid diagram, etc.)
  - Full file operations via context menu: create files/folders, rename, delete
  - Open in New Tab, Show in File Explorer, Copy File Path
  - Navigate up to parent folder or make any subfolder the new root (context menu or double-click)
  - Collapse all expanded folders with a single click
  - Search files with Ctrl+F within the panel
  - Lazy-loading folder expansion for large directories
  - Resizable panel with splitter, state persists across app restarts
  - Scroll position preserved when navigating between files

- **Application Theming** — Switch between 9 color themes (6 dark, 3 light) via the new Settings page
  - Dark themes: Default Dark, Solarized Dark, Monokai, Abyss, Red, Tomorrow Night Blue
  - Light themes: Light Modern, Solarized Light, Quiet Light
  - Settings page with visual theme previews, separated by dark/light sections
  - Monaco editor theme updates automatically with app theme
  - Theme preference persists across sessions
  - Flash-free startup — correct theme applied before first paint
  - Cycle themes with `Ctrl+Alt+]` / `Ctrl+Alt+[`
  - "View Settings File" button for raw JSON access

- **HTML Preview** — Switch to "Preview" for HTML files to see rendered output in a sandboxed iframe. Supports JavaScript execution, live updates, and works with unsaved content.

### Improvements

- **Sidebar File Explorer** — Linked folders now display as a tree view instead of a flat file list
  - Expand/collapse folders to browse nested directories
  - Folder expansion state persists when switching between linked folders
  - Same file operations and search as the in-tab File Explorer panel

- **Keyboard Shortcuts** — `Ctrl+Tab`, `Ctrl+W`, `Ctrl+N`, `Ctrl+O` now work reliably regardless of which editor type is active (previously failed when focus was in preview editors like Markdown, PDF, or Image viewers)

### Other New Features

- **Quick Add Page Menu** — The "+" button in the tab bar now has a dropdown arrow for quickly creating pre-configured editor pages:
  - Script (JS) — new JavaScript file ready for scripting
  - Grid (JSON) — new `.grid.json` file with Grid editor active
  - Grid (CSV) — new `.grid.csv` file with Grid editor active
  - Notebook — new `.note.json` file with Notebook editor active
  - Todo — new `.todo.json` file with Todo editor active
  - Links — new `.link.json` file with Link editor active

---

## Version 1.0.7

### New Features

- **Markdown View Enhancements**
  - Syntax highlighting in fenced code blocks using Monaco's `colorize()` API
  - Supports all Monaco languages with alias resolution (e.g., `ts`, `js`, `py`, `bash`)
  - Copy-to-clipboard button on code block hover
  - Inline Mermaid diagram rendering for ` ```mermaid ` code blocks
  - Mermaid diagrams use dark theme with text contrast fix for readable labels
  - Shared rendering pipeline with standalone Mermaid viewer (`.mmd` files)
  - Compact mode font size increase for better readability in notebook notes

### Improvements

- Distinctive file icons for `.note.json` (notebook) and `.grid.json`/`.grid.csv` (grid) files in tabs and sidebar
- Restyled editor switch buttons with modern look and hover effects
- Notebook editor: smoother transitions, improved focus indication
- Expanded note editor now properly fills available space
- Disabled browser spellcheck in editor windows

### Bug Fixes

- Fixed notebook editor overwriting raw content when JSON has parse errors

---

## Version 1.0.6

### New Features

- **Mermaid Diagram Viewer**: Preview `.mmd` and `.mermaid` files as rendered diagrams
  - Supports all Mermaid diagram types (flowchart, sequence, class, state, ER, Gantt, pie, git graph)
  - Switch between text editor and diagram preview using toolbar button
  - Light/dark theme toggle for diagram rendering
  - Copy diagram to clipboard as image
  - Zoom, pan, and keyboard shortcuts (reuses Image Viewer controls)
  - Live preview of unsaved changes with debounced re-rendering
  - Mermaid syntax highlighting in Monaco editor

- **Copy Image to Clipboard**: Copy displayed images to clipboard as PNG
  - Copy button in Image Viewer toolbar and SVG Preview toolbar
  - Ctrl+C keyboard shortcut when image is focused
  - Works with all image formats (PNG, JPG, GIF, BMP, WebP) and SVG preview
  - Paste into external apps (Teams, Word, Outlook, etc.)

- **Notebook Editor**: A structured notes editor for `.note.json` files
  - Create and organize notes with categories and tags
  - Each note contains its own code editor (Monaco, Grid, Markdown, SVG)
  - Hierarchical category tree with drag-and-drop organization
  - Tag system with categorized tags (e.g., "env:dev", "env:prod")
  - Full-text search across note titles, categories, tags, and content
  - Search highlighting in all editor types (Monaco, Grid, Markdown)
  - Expand any note to full editor size for detailed work
  - Run JavaScript scripts directly from notes
  - Comments on individual notes
  - Virtualized list for smooth scrolling with many notes
  - See [Notebook Editor](./notebook.md) for full documentation

---

## Version 1.0.5

### New Features

- **About Page**: View application and system information
  - Access via Info button in the sidebar menu
  - Shows app version, Electron, Node.js, and Chromium versions
  - "Check for Updates" button to manually check for new versions
  - Links to GitHub repository, downloads, and issue tracker

- **Automatic Update Check**: Get notified when new versions are available
  - Checks GitHub Releases automatically on startup (once per 24 hours)
  - Shows notification when a new version is available
  - Click notification to open About page for download link
  - No automatic downloads - you stay in control

- **Image Viewer**: View binary images directly in the application
  - Supported formats: PNG, JPG, GIF, WEBP, BMP, ICO
  - Zoom with mouse wheel or +/- buttons
  - Pan by dragging when zoomed in
  - Click zoom indicator to reset to fit view
  - Automatic fit-to-window on open

- **SVG Preview**: Preview SVG files as rendered graphics
  - Open SVG in Monaco text editor by default
  - Switch to "Preview" mode using toolbar button
  - Same zoom/pan controls as Image Viewer
  - Shows live preview of unsaved changes

### Improvements

- **Application Structure Refactoring**: Major reorganization of codebase for better maintainability
  - New folder structure: `/core`, `/store`, `/editors`, `/components`, `/features`
  - All editors now in unified `/editors` folder
  - Better separation of concerns

- **Editor Registry Pattern**: New declarative system for editor registration
  - Single place to register editors (`register-editors.ts`)
  - Adding new editors now requires only one file change
  - Automatic file type detection by extension or filename patterns
  - Priority-based editor resolution
  - See [Editor Guide](/doc/standards/editor-guide.md) for details

### Documentation

- New developer documentation structure
- Architecture documentation
- Coding standards and guides
- Task tracking system
- User documentation with guides

---

## Version 1.0.4

### Improvements

- File operations improvements

---

## Version 1.0.3

### Features

- Grid improvements for JSON/CSV viewing
- Better file operation handling

---

## Version 1.0.2

### Bug Fixes

- Various stability improvements

---

## Version 1.0.1

### Features

- Initial public release
- Monaco Editor integration
- JavaScript script execution
- JSON/CSV Grid view
- Markdown preview
- PDF viewer
- Tab management
- File encryption

---

## Planned Features

See [GitHub Issues](https://github.com/andriy-viyatyk/persephone/issues) for planned features and known issues.

### Coming Soon

- Testing infrastructure
- Keyboard shortcut customization
