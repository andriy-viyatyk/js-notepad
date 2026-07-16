# Boards — build a custom board/editor for the user

A **Board** is a small, self-contained web app you (the agent) build for the user:
a dashboard, tool, viewer, or custom editor. Persephone hosts it in a locked-down,
cross-origin `<iframe>` and gives it a single bridge object, `window.persephone`. You can
create one, open it, and develop it end-to-end through the **`execute_script`** tool calling
the `app` API — no user clicks required.

## What a board is

- **Frontend** — `index.html` + `app.js` (+ any CSS/assets). Owns *all* UI and *all* state;
  this is what renders in the iframe.
- **Backend** — scripts under `scripts/` (`.js`, `.py`, `.ps1`, `.sh`, …). They run as real OS
  processes with the user's privileges and talk to the page over stdout. A `.js` script runs
  under **plain Node.js** — no Electron or renderer globals (e.g. `process.versions.electron` is
  undefined).
- **Channel** — `persephone.execute(commandLine)`: the page runs a script, the script prints
  JSON to stdout, the page parses it and renders. That's the whole loop.

Persephone owns no board state and no board UI — it wires the channel and shows the page.
A folder is recognized as a board because it contains **`board-manifest.json`** (schema
version + optional descriptive metadata; it never controls behavior and is **not** a trust
source — trust is a user decision held outside the board).

## Create & open a board

Two MCP tools cover the lifecycle. A board you create is **auto-trusted at creation**, so it
opens with no prompt — the whole create→open→develop loop runs without user interaction.

1. **`create_board { name, dir, demo? }`** — scaffold a board (blank, or `demo: true` for the
   rich Demo template). `name` is the board folder name; `dir` is the **container folder** it's
   created inside (created if missing). Returns **`{ boardRoot }`** — the new board's absolute
   root path. A name collision errors.
2. **`open_board { path }`** — open the board (`path` = the `boardRoot` from step 1). Opens a
   **new tab** (or reuses the board's existing tab) and makes it the active page.

Then confirm with `get_active_page` (or `list_pages`) and read the board page's `pageId` for
`browser_*` testing (see below). Opening a board you did **not** create (a foreign folder) shows
the **user** a trust prompt; a board you created never does.

> The same lifecycle is on the script API too, if you prefer `execute_script`:
> `app.boards.createBoard(name, dir)` / `createDemoBoard(name, dir)` → returns the board root,
> and `app.boards.openBoard(root)`. (`app.openRawLink(href)` is a generic opener — files, URLs,
> in-app links.)

## Develop it

`create_board` scaffolds a **working starter** — build on it, don't blindly overwrite it. A
blank board contains:

- `index.html` — the page shell (a starter button + output area), linked to `board-base.css`.
- `app.js` — frontend logic with a `boardScript()` helper that calls `persephone.execute()`.
- `scripts/hello.js` — an example backend script demonstrating the `@@RESULT@@` convention.
- `board-base.css` — shared theme defaults (page bg/text, monospace font, themed scrollbars),
  **already linked in `index.html`; don't fetch or recreate it.**
- `board-manifest.json` — the board-identity file (already valid).
- `CLAUDE.md` — the generic board authoring guide. **When the board is built, rewrite this file
  to document _this_ board** (purpose, how it works, key files, run/test steps, gotchas) so a
  future agent has instant context — see the "rewrite this file" note at its top. The generic
  reference is always available here (`read_guide("boards")`), so it's safe to trim.

Edit these with your own file tools (or `app.fs` inside another `execute_script`). The key
surfaces:

### The `persephone.execute()` channel

```js
const handle = persephone.execute(commandLine, { cwd, env, shell }); // cwd defaults to the board folder
```

Options: `cwd` defaults to the board folder; `env` adds environment variables; `shell` (a
boolean or a shell path, like Node's `child_process.spawn`) runs the command through a shell —
set `true` to enable pipes, globbing, and other shell features.

Consume the handle **one** of two ways (mixing them on one handle throws):

- **Buffered** — `await handle.getText()` / `getJson()` / `getBytes()`. `getJson()` rejects on a
  non-zero exit or parse error (the error carries `exitCode` + captured `stderr`).
- **Streaming** — `handle.on("stdout"|"stderr", chunk => …)`, `handle.on("exit", info => …)`,
  `handle.on("error", err => …)`, plus `handle.write(...)`, `handle.endStdin()`, `handle.kill()`.

**Convention:** a backend script prints a single JSON document to stdout; the page reads it
with `getJson()`. When a script shells out to other tools that also print, send diagnostics to
**stderr** and wrap the result in a marker the page extracts:

```js
console.log("@@RESULT@@" + JSON.stringify(result));               // backend (node)
const result = await persephone.execute(cmd).getJson(/@@RESULT@@(.*)/); // page extracts last match
```

### Integration tier (in-app effects `execute()` can't express)

- `persephone.openRawLink(href, options?)` — open a file/URL in a new Persephone page. Pass
  `{ editor }` to request a specific editor (e.g. `openRawLink(path, { editor: "md-view" })` to render
  a Markdown doc instead of its source); falls back to the default editor when omitted/unmatched.
- `persephone.notify(message, type)` — toast (`"info"|"success"|"warning"|"error"`); errors are
  also appended to **`ui.log`** in the board folder (an on-board indicator opens it). `ui.log` also
  receives, automatically: load failures, CSP violations, uncaught errors / unhandled rejections,
  and every **`console.error`/`console.warn`** from the board's frames — read it when debugging.
- `persephone.openFileDialog(params)` / `saveFileDialog(params)` / `openFolderDialog(params)` —
  native dialogs returning a path you hand to `execute()`.
- `persephone.readFile(path, options?)` / `writeFile(path, data, options?)` — read/write a file with
  no backend script. Relative `path` resolves against the board folder; absolute reads/writes anywhere.
  Text by default, `{ encoding: "base64" }` for binary; `writeFile` creates parent dirs. Both return
  Promises (reject on error). Use it to persist small board state and load board-local config.
- `persephone.getFilePath()` → `Promise<string | undefined>` — when the board is opened as a **custom
  editor** for a file (associated via `fileMasks` in `board-manifest.json`), resolves to that file's
  absolute path (read/write it with `readFile`/`writeFile`); `undefined` for a board opened plainly.
  Safe to `await` at any time (waits for the host handshake).
- `persephone.host.*` — for a **content-host** editor board (`"editorKind": "content-host"` in the
  manifest) Persephone owns the file (pipe, encoding, encryption, auto-save, dirty tracking) and the
  board works with the content instead of a path: `host.getContent()` → `Promise<string>`,
  `host.setContent(content)` (marks modified; a `getContent()` right after returns the written value),
  `host.onContentChange(cb)` (fires on external edits — e.g. the user switched to Monaco and back —
  never for your own `setContent`), `host.getLanguage()`, `host.save()`. All of `host.*` is safe to
  call at any time, first thing in your script included (it awaits the handshake internally). `Ctrl+S`
  saves automatically (no board code). The board and Monaco share one host, so they switch back and
  forth on the same file with no reload. On a plain board `getContent`/`getLanguage` reject and a
  registered `onContentChange` never fires.

**Browser APIs (clipboard, etc.):** the board frame is a secure context with clipboard permission
granted, so standard web APIs like `navigator.clipboard.write([...])` work directly (no bridge method;
still need a user gesture + focused window). Only remote *network* is blocked by the CSP.

### Secondary views & shared state

A board can contribute **secondary views** — extra sidebar panels, each its own `board://`
iframe over the *same board*. All frames (main + secondaries) share one Persephone-owned state
object, so they stay synchronized — the plumbing for editor-style boards (a main view + a
coordinated sidebar).

- **Declare** in `board-manifest.json`: `"secondaryViews": [{ "id": "lists", "title": "Lists" },
  { "id": "detail", "html": "detail.html", "title": "Detail" }]`. `id` has no `::`; `html`
  defaults to `index.html` (one file — branch on `persephone.view`) or names a dedicated file;
  `title` labels the panel (the icon is the board's own). Or replace at runtime from any frame
  with `persephone.setSecondaryViews([...])` (`[]` clears). Navigating the main view away
  disposes the board — panels don't keep it alive.
- **`persephone.view`** — `"main"` or the view's `id`, known synchronously at load; branch on
  it to serve every view from one HTML file.
- **`persephone.state.*`** (every frame): `init(defaults, { restorableKeys })`, `get()` (Promise,
  first-snapshot-then-cached), `set(obj)`, `merge(partial)`, `onChange(cb) → off`. A change in
  one frame is seen in all; `onChange` is authoritative (writes round-trip, React-`setState`-
  style). **Opt-in persistence** — only `restorableKeys` survive restart/reload; everything else
  is in-memory.

```js
persephone.state.init({ selectedId: null }, { restorableKeys: ["selectedId"] }); // main view
persephone.state.onChange((s) => highlight(s.selectedId));
// a sidebar view writes: persephone.state.merge({ selectedId: id })
```

- **Inspect a secondary view** with the `browser_*` tools by selecting its frame — see
  [Inspecting secondary views](#inspecting-secondary-views) under "Test it".

### Long-running processes: `setBoardBusy()` / `getBoardBusy()` / `getJobs()`

By default everything a board spawned is **killed when the board unloads** (page navigated
to a document, or a board reload). A board that starts processes that must keep running
(dev servers, watchers) opts out with the busy flag:

- `persephone.setBoardBusy(true)` — while busy, unloading the board keeps its processes
  running. They are still killed on page/tab close, app quit, or after `setBoardBusy(false)`
  + unload.
- `persephone.getBoardBusy()` → `Promise<boolean>` — survives the board's own reload; read on
  startup to re-enter "running" mode.
- `persephone.getJobs()` → `Promise<[{ jobId, command, name, kill(), write(), endStdin() }]>` —
  this board's live jobs, including ones from a previous board lifetime. Surviving jobs are
  control-only (no stdout/stderr/exit streaming; output produced while unloaded is dropped).

**Author pattern** — name long-running jobs and reinitialize on startup (the board's JS state
does not survive a reload, only the flag and the processes do):

```js
persephone.execute("npm run dev", { name: "backend" });   // start
persephone.setBoardBusy(true);

if (await persephone.getBoardBusy()) {                     // every board startup
    const jobs = await persephone.getJobs();
    const backend = jobs.find(j => j.name === "backend");
    if (backend) showRunning(backend);                     // Stop → backend.kill()
    if (jobs.length === 0) persephone.setBoardBusy(false); // nothing lives — reset
}
```

### Theme: the `--p-*` contract

Persephone injects its palette as CSS variables on `<html>` and keeps them live across theme
switches — style everything with them so the board matches the app. The variables are defined
**before the first paint**, so a board loads already themed (no flash):

```css
body { background: var(--p-bg); color: var(--p-text); }
button { background: var(--p-accent); color: var(--p-accent-text); border-radius: var(--p-radius-md); }
```

Every board ships with **`board-base.css`** (linked first in `index.html`) applying sensible
defaults (page bg/text, monospace font, themed scrollbars). Colors (`--p-bg`, `--p-panel`,
`--p-border`, `--p-text`, `--p-accent`, `--p-error`, `--p-success`, `--p-warning`, …) update
live; metrics (`--p-space-*`, `--p-gap-*`, `--p-radius-*`, `--p-size-*`, `--p-font-*`) are
constants. For JS-colored components (charts/diagrams) read the live palette via
`persephone.getTheme()` / `persephone.onThemeChange(cb)` and re-apply on each fire — never cache
`persephone.theme.vars` across a switch.

### Libraries & assets — vendor them locally

A board is **offline-first** and its CSP **forbids remote network** (`connect-src
'self'` blocks CDN scripts, stylesheets, fonts, and cross-host `fetch`). Download each library
into the board folder and reference it with a **relative** path:

```html
<script src="./lib/tabulator.min.js"></script>
<link rel="stylesheet" href="./lib/tabulator.min.css" />
```

Never use `https://…cdn…` URLs in `<script>`/`<link>`/`@import`/`fetch()` — they are blocked and
the board fails silently. Bundle fonts/images locally too (or inline images as `data:` URIs).

**Recommended components:** the `boards-assets/manifest.json` catalog lists pre-tested,
theme-skinned libraries (grids, charts, markdown, …) with their vendor download URLs and load
order. The skins are **not bundled in the installer** — they live on GitHub. Fetch the manifest and
each skin from the raw base URL (also returned by `get_app_info` as `boardsManifestUrl` /
`boardsAssetsBaseUrl`):

- Manifest: `https://raw.githubusercontent.com/andriy-viyatyk/persephone/main/boards-assets/manifest.json`
- Each component's `skin.file` (e.g. `tabulator.css`) is fetchable as **`baseUrl + skin.file`**, where
  `baseUrl` is the manifest's top-level `baseUrl` field.

Vendor flow on any machine: **GET the manifest → read the component's `vendor` URLs (the third-party
library, from a CDN) and its `skin.file` → GET `baseUrl + skin.file` → write both into the board folder**
(relative paths). Download from inside `execute_script` (full Node.js — e.g. `https.get` then
`app.fs.writeBinary(destPath, data)`), then reference the files with relative paths in `index.html` per
the manifest's `loadOrder`.

### Manifest, icon, reload

- `board-manifest.json` — keep `schemaVersion: 1`; add optional `name`/`description`/`author`/
  `repository` (metadata only). No secrets, no trust flags. To make the board a **custom editor**
  for a file type, add `fileMasks` (glob masks matched against the file name, e.g. `["*.drawio"]`),
  optional `editorPriority` (a number; makes the board the *default* editor for those masks when it
  outranks the built-in — omit/`0` = switch option only), and optional `editorName` (switch-widget
  label). Honored only when the board is trusted. Optional `editorKind`: `"simple"` (default) → the
  file arrives via `persephone.getFilePath()` (read/write it yourself); `"content-host"` → Persephone
  owns the file and the board works through `persephone.host.*` (shares the host with Monaco, edits
  non-local files, auto-saves).
- Optional `icon.svg` / `icon.png` / `icon.ico` in the board folder sets the board's icon (SVG
  preferred). Without one, a default glyph is used.
- **Reload model:** boards do **not** auto-reload on file changes. After editing a board's files,
  apply the changes with the **Reload** button in the in-board toolbar — or, when driving the board
  as an agent, the **`board_refresh`** MCP tool (pass the board's `pageId`, or omit it to reload the
  active board). The tool returns after the reloaded main frame has finished loading, so an iterate
  loop is race-free: edit files → `board_refresh` → `browser_snapshot`.

## Test it

Once the board is open, drive it with the **`browser_*`** tools (Playwright-compatible). Always
get the board's `pageId` first, then pass it to every `browser_*` call:

```
list_pages                       → pick the entry with editor: "board-view" → its pageId
browser_snapshot { pageId }      → read the UI
browser_click/type/evaluate { pageId, … }  → interact
```

- `list_pages` → find the board (`editor: "board-view"`) and read its `pageId`. If several
  `board-view` pages exist, match the one you opened by its `boardRoot` / `selectedBoard`.
- `browser_snapshot { pageId }` → read the accessibility tree (element refs). **Always pass
  `pageId`** for a board — board pages are not browser tabs, so the default "active browser page"
  fallback does not reach them.
- `browser_click` / `browser_type` / `browser_press_key` / `browser_evaluate` (each with
  `pageId`) → interact using the refs from the snapshot.
- **Verify UI visually.** The accessibility snapshot includes elements that are invisible on
  screen (zero-height, overridden `display`), so it can look right while the render is broken.
  After UI changes, check a `browser_take_screenshot { pageId }` before declaring the UI correct.

A board never navigates, so the navigation tools (`browser_navigate`, `browser_navigate_back`)
don't apply, and `browser_tabs` cannot open or close tabs. But `browser_tabs` **does** work for
a different purpose — selecting which board **frame** the tools drive (see next).

### Inspecting secondary views

By default every `browser_*` call targets the board's **main** frame. To inspect a
[secondary view](#secondary-views--shared-state) (a sidebar panel — its own `board://` frame),
use `browser_tabs` to select it first; Persephone treats the board's frames as "tabs":

```
browser_tabs { pageId, action: "list" }
  → [ { id: "main", … },
      { id: "board-secondary:<viewId>", title: "<panel title>", … }, … ]
browser_tabs { pageId, action: "select", index: N }   → make frame N the active target
browser_snapshot { pageId }                            → now reads THAT frame's DOM
browser_click / browser_type / browser_take_screenshot { pageId, … }  → drive that frame
```

- `list` returns the main view (`index: 0`, id `"main"`) plus one entry per declared secondary
  view (id `board-secondary:<viewId>`, `title` = the panel title).
- `select` points every subsequent `browser_*` call at that frame until you select another.
  **Persephone auto-opens the view's sidebar panel and waits for its frame to render**, so the
  next command always succeeds — you never get a "frame not mounted" error, even if the panel
  was closed. `select { index: 0 }` returns to the main view.
- A screenshot of a selected secondary view is clipped to its sidebar panel.
- All frames of one board share `persephone.state.*`, so a change you make in one frame is
  visible when you snapshot another.

## Richer reference — the bundled Demo board

Persephone ships a full **Demo board** that exercises the whole surface (buffered/streaming/
stdin/kill/cwd `execute()`, the integration tier, the `--p-*` theme + token contract, secondary
views + shared state via `persephone.state.*`, a tabbed layout with a pinned output console).
For a richer example than the blank template, create one with `app.boards.createDemoBoard(name,
dir)` and read its files, or read the source under the install's `resources/assets/demo-board/`
(`index.html`, `app.js`, `style.css`, `board-base.css`).
