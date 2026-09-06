# Boards — build a custom board/editor for the user

A **Board** is a small, self-contained web app you (the agent) build for the user:
a dashboard, tool, viewer, or custom editor. Persephone hosts it in a locked-down,
cross-origin `<iframe>` and gives it a single bridge object, `window.persephone`. You can
create one, open it, and develop it end-to-end through **`script.execute`** calling
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

Inspect `boards.$help` for the concise live lifecycle. A board you create is **auto-trusted at
creation**, so it opens with no prompt; the details below are the authoring and format reference.

1. **`boards.createBoard(name, dir)` / `boards.createDemoBoard(name, dir)`** — scaffold a board
   (blank or the bundled Demo template). `name` is the board folder name; `dir` is the **container folder** it's
   created inside (created if missing). Returns **`{ boardRoot }`** — the new board's absolute
   root path. A name collision errors.
2. **`boards.openBoard(boardRoot)`** — open the board (`boardRoot` from step 1). Opens a
   **new tab** (or reuses the board's existing tab) and makes it the active page.

Then confirm with `call` at `pages` and read the board page's `pageId` for
`pages[pageId].editor` testing (see below). Opening a board you did **not** create (a foreign folder) shows
the **user** a trust prompt; a board you created never does.

> The same lifecycle is on the script API too:
> `app.boards.createBoard(name, dir)` / `createDemoBoard(name, dir)` → returns the board root,
> and `app.boards.openBoard(root)`. (`app.openRawLink(href)` is a generic opener — files, URLs,
> in-app links.)

### Trust, forget & rename a board (script API)

Three `app.boards` calls manage an **existing** board's lifecycle — for boards you did not
create (a folder the user points you at, or one you downloaded for review):

- **`app.boards.registerBoard(boardRoot)`** → `Promise<boolean>` — trust a board so it renders
  and runs. Shows the **user** a trust dialog; you can never trust a board on their behalf
  without that click. Returns `true` if trusted (or already trusted), `false` if the user
  declines. Typical review flow: read the board's scripts/HTML, report to the user, then call
  this and let them decide at the dialog.
- **`app.boards.unregisterBoard(boardRoot)`** → `Promise<void>` — untrust the board and remove
  its pin. No dialog (it only reduces privilege). The board stops running.
- **`app.boards.renameBoard(boardRoot, newName)`** → `Promise<string>` — rename the board's
  folder within its parent, carrying trust, pin, and any catalog-install registration to the
  new path with **no dialog** (same trusted content, new path), and re-pointing any open board
  page. Returns the new root. Throws if the board is running (busy), is not a board, or the new
  name already exists. This solves "rename my board" as a single action with zero user clicks.

## Published boards — discover, install, update (script API)

Persephone ships against a curated **published-boards catalog** (a GitHub repo). Six `app.boards`
calls drive the whole lifecycle so you can do "find me a drawio viewer and install it" end-to-end
with **at most one user click per privilege-granting step**. Boards install into
`<userData>/data/boards/<id>` by default. Downloading a board **trusts nothing** — the code sits
inert on disk; only `registerBoard` (a user trust-dialog click) activates it.

- **`app.boards.searchPublished(query?)`** → `Promise<PublishedBoardResult[]>` — the catalog,
  filtered by a case-insensitive `query` over name/description/file-masks (omit for all), each
  result annotated with `installed`, `installedVersion`, `updateAvailable`, `compatible`, `size`.
  **Read-only, no dialog.**
- **`app.boards.getPublishedVersions(id)`** → `Promise<PublishedVersionResult[]>` — a board's
  version history, newest first, each flagged `compatible` (vs this app) and `installed`.
  **Read-only, no dialog.**
- **`app.boards.downloadPublished(id, { dir?, version? })`** → `Promise<string>` — download +
  sha256-verify + extract to disk and record it, **no dialog** and **without trusting**. Returns
  the local root. This is your **"can I trust this board?" entry point** — download, read the
  files, report, then let the user decide at `registerBoard`. Throws on an unknown id/version or
  an incompatible version.
- **`app.boards.installPublished(id, { dir?, version? })`** → `Promise<string | undefined>` — the
  interactive combo. For a not-yet-installed board it opens the **Board Info page** prefilled and
  the user walks Download → Register (the trust dialog is the consent); resolves the root once
  registered, or `undefined` if they close the page first. For an **already-installed** board with
  a `version`, it performs an update/rollback swap **with no dialog** (subject only to a
  close-pages prompt if the board is open); resolves the root, or `undefined` if the user vetoes
  that prompt. (A *fresh* install always installs the latest; for a specific fresh version use
  `downloadPublished(id, { version })` + `registerBoard(root)`.)
- **`app.boards.uninstallBoard(id)`** → `Promise<boolean>` — shows the **delete confirmation**,
  then removes the board folder + trust + pin + registry entry. Returns `true` if removed, `false`
  if cancelled. Throws if the id is not installed.
- **`app.boards.checkPublishedUpdates(force?)`** → `Promise<BoardUpdateInfo[]>` — refresh the
  catalog (`force: true` bypasses the periodic-check gate) and list installed boards with a
  compatible newer version. **No dialog.**

### Reviewing a board before trusting it

When the user asks *"can I trust this board?"* (or you're about to register one they didn't
author), **review it before `registerBoard`**:

1. `const root = await app.boards.downloadPublished(id)` (or use a folder the user points you at).
2. Read **every** file in the folder — `index.html`, `app.js`, all of `scripts/`, any bundled JS.
   The board's iframe CSP blocks remote network at runtime, **but backend `scripts/` run as full
   OS processes with the user's privileges and are NOT sandboxed** — that is where risk lives.
3. Flag: data exfiltration (unexpected network hosts / uploads), credential or filesystem access
   beyond the board's stated purpose, destructive `persephone.execute` usage (deletes, overwrites,
   shelling out to dangerous commands), and obfuscated/minified logic that hides intent.
4. Report your findings to the user, then call `app.boards.registerBoard(root)` — they make the
   final call at the trust dialog. You can never trust a board on their behalf.

All six calls are reached through **`script.execute`** — there are no separate board call paths for them.

## Develop it

`boards.createBoard` scaffolds a **working starter** — build on it, don't blindly overwrite it. A
blank board contains:

- `index.html` — the page shell (a starter button + output area), linked to `board-base.css`.
- `app.js` — frontend logic with a `boardScript()` helper that calls `persephone.execute()`.
- `scripts/hello.js` — an example backend script demonstrating the `@@RESULT@@` convention.
- `board-base.css` — shared theme defaults (page bg/text, monospace font, themed scrollbars,
  themed focus ring, Persephone-style native checkboxes) plus the opt-in `.p-*` chrome
  layer (`.p-toolbar`, `.p-btn`, `.p-input`, …).
  **Already linked in `index.html`; don't fetch or recreate it.**
- `board-manifest.json` — the board-identity file (already valid).
- `CLAUDE.md` — the generic board authoring guide. **When the board is built, rewrite this file
  to document _this_ board** (purpose, how it works, key files, run/test steps, gotchas) so a
  future agent has instant context — see the "rewrite this file" note at its top. The generic
  reference is always available in this resource, so it's safe to trim.

Edit these with your own file tools (or `app.fs` inside another `script.execute`). The key
surfaces:

### Give the board its secrets — env vars

A board should never store secrets (connection strings, API keys, passwords) in its own folder —
they'd leak the moment the board is copied, shared, or committed. Persephone keeps a single,
optionally-encrypted `.env.json` file **outside every board folder**, namespaced per board.

**Provision values before the board needs them (you, via `script.execute`):**

```js
const namespace = await app.boardVars.namespaceFor(boardRoot); // author/name, or the root path
await app.boardVars.set(namespace, "SNOWFLAKE_SERVER", "abc123.snowflakecomputing.com");
await app.boardVars.list(namespace);        // key names in the namespace
await app.boardVars.listNamespaces();       // every namespace in the file
await app.boardVars.show(namespace);        // open the built-in editor, focused there
```

**This call can block on a dialog.** The first-ever `app.boardVars.*` call on a machine with no
`.env.json` configured shows the user a "Create environment variables storage" dialog (default
path, editable) — your `script.execute` call does not resolve until the user responds; declining
rejects it. The same applies if the file is encrypted and locked this session (a decrypt-password
prompt). Don't treat a slow-to-resolve call as a hang — it is waiting on the user. Always resolve
the namespace via `namespaceFor` rather than guessing the `author/name` string yourself.

**Read them back at runtime (the board itself, from `app.js`):**

```js
const server = await persephone.var.get("SNOWFLAKE_SERVER"); // this board's own namespace only
await persephone.var.set("SNOWFLAKE_USER", value);            // a board may write its own settings
```

`persephone.var.*` is always scoped to the calling board — it can never read or write another
board's namespace. All calls are async and can reject (not configured / locked / user declined);
handle rejection gracefully (e.g. show a "configure your connection" prompt in the board's UI).

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

### `persephone.executeNode()` — guaranteed Node runtime

`execute("node script.js")` only works if the **user** has Node installed — a published
board can't assume that. `executeNode` runs a script on **Persephone's own bundled Node
runtime**, so it works on any machine with zero dependencies:

```js
const handle = persephone.executeNode(script, args?, { cwd, env, name }); // script relative to the board folder
```

- `script` — relative to the board folder (or absolute); prefer **`.mjs`** for explicit ESM
  (boards ship no `package.json`). `args` is a `string[]` passed **argv-style, no shell** (no
  quoting hazards); the `shell` option is ignored. A missing script fires the handle's `error`.
- Returns the **same handle** as `execute()` (buffered / streaming / `write`/`endStdin`/`kill`
  / `name`-based `getJobs()`). Runtime is **Node 24** with **`node:sqlite` built in** (incl.
  FTS5) — SQLite with no npm install.
- **Resident-server pattern:** spawn one long-lived script and feed it JSON lines over stdin
  instead of a spawn per operation — one ~150 ms spawn on open, then each op costs only its own
  work. Pair with `setBoardBusy(true)` to survive a reload and re-attach by `name` via
  `getJobs()`.

```js
const srv = persephone.executeNode("scripts/db-server.js", [dbPath], { name: "db" });
srv.on("stdout", chunk => handleJsonLine(chunk));   // {id, columns, rows} | {id, error}
srv.write(JSON.stringify({ id: 1, sql }) + "\n");   // per query — db stays open, no re-spawn
```

### Integration tier (in-app effects `execute()` can't express)

- `persephone.openRawLink(href, options?)` — open a file/URL in a new Persephone page. Pass
  `{ editor }` to request a specific editor (e.g. `openRawLink(path, { editor: "md-view" })` to render
  a Markdown doc instead of its source); falls back to the default editor when omitted/unmatched.
  An **image `data:` URL** with `{ editor: "draw-view" }` opens the image as a **new editable
  Excalidraw drawing** (rasterize your view to a PNG data URL first) — see the how-to recipe
  linked below.
  - **External links are auto-routed.** A plain `<a href="https://…">` click inside a board is
    intercepted (any link leaving the board's `board://` origin) and routed through `openRawLink`
    automatically — so a stray link never navigates the board frame into a blank screen. Relative
    and `#fragment` links navigate in-frame as normal; call `e.preventDefault()` first to handle a
    link yourself.
  - **Default context menu is built in.** Right-click gives Open/Copy Link (links), Open Image in
    New Tab / Copy Image / Save Image As… (images), Cut/Copy/Paste (text fields), and Copy
    (selection) with no board code. Call `e.preventDefault()` on `contextmenu` to render your own.
- `persephone.notify(message, type)` — toast (`"info"|"success"|"warning"|"error"`); errors are
  also appended to **`ui.log`** in the board folder (an on-board indicator opens it). `ui.log` also
  receives, automatically: load failures, CSP violations, uncaught errors / unhandled rejections,
  and every **`console.error`/`console.warn`** from the board's frames — read it when debugging.
- `persephone.openFileDialog(params)` / `saveFileDialog(params)` / `openFolderDialog(params)` —
  native dialogs returning a path you hand to `execute()`.
- `persephone.readFile(path, options?)` / `writeFile(path, data, options?)` — read/write a file with
  no backend script. Relative `path` resolves against the board folder; absolute reads/writes anywhere.
  `writeFile` creates parent dirs. Both return Promises (reject on error). Encodings: `"utf8"`
  (default) → string; **`"binary"` → a `Uint8Array`, the right choice for ANY binary file** (image,
  PDF, zip, spreadsheet) — it feeds a parser directly and is the only way to read a file over
  ~400 MB, since base64 of one exceeds V8's max string length; `"base64"` → a base64 string, for
  when you actually want base64 (a `data:` URI). `"binary"` needs app 4.0.21+, so declare
  `"minAppVersion": "4.0.21"` in `board-manifest.json` — Persephone then refuses to run the board on
  older apps and no runtime check is needed. Use it to persist small board state and load config.
  ```js
  const bytes = await persephone.readFile(path, { encoding: "binary" });  // Uint8Array
  ```
- `persephone.getFilePath()` → `Promise<string | undefined>` — when the board is opened as a **custom
  editor** for a file (associated via `fileMasks` in `board-manifest.json`), resolves to that file's
  absolute path (read/write it with `readFile`/`writeFile`); `undefined` for a board opened plainly.
  Safe to `await` at any time (waits for the host handshake). The path is **always local**: with
  `"editorSources": "any"` the board also opens archive entries and `http(s)` URLs, and Persephone
  materializes those into a read-only cache file first — so one code path serves every source. Such a
  board must handle two edges: the call can be **slow** (a URL completes only after the whole
  download — build your UI in parallel rather than awaiting first) and it can **reject** (missing
  archive entry, HTTP failure), which is different from `undefined`. Report a rejection; never leave a
  blank frame.
- `persephone.call(path, options?)` — resolve the same bounded AiVision descriptor tree as the MCP
  `call` tool, rooted at the page hosting this Board. The Board must be trusted; trust is checked
  again when each call resolves, so revoking trust also blocks an already-mounted Board. The call
  always uses `hints: "never"` and returns only a JSON-safe plain value; it rejects an `Error` for
  resolver, transport, timeout, or serialization failures. `args` invokes the final method,
  `value` assigns a writable property, and `maxLength` bounds shaped strings. `args` and `value`
  cannot be combined.
  ```js
  const source = await persephone.call("page.grouped.content");
  const matches = [...source.matchAll(/TODO\w*/g)].map((m) => ({ match: m[0], index: m.index }));
  await persephone.call("page.grouped.content", {
      value: JSON.stringify(matches, null, 2),
  });
  ```
  The hosting page is identified from the Board editor's owner id, not from the active tab, so
  switching tabs does not retarget the call. The resolver's existing descriptor restrictions still
  apply, including the private incognito/Tor browser-page guard. No renderer object or method crosses
  the Board port.
  This is the renderer-side, page-scoped tree: `main.*` and `windows[i].*` are MCP-only routing
  paths and cannot be resolved through the Board bridge. The `boards` namespace exposes local board
  inventory and lifecycle operations, while `tools` exposes registered Agent Tools; tool execution
  runs with the user's privileges and returns environment-variable names only. Trust, board
  registration, and toolset registration remain user-mediated actions, so a call can request them
  but never silently grants them.
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
- `persephone.setStatusText(text)` — set the text shown in a **content-host** board's footer bar
  (the same footer that shows the provider/encoding), e.g. a Todo board's `"12 items"` count.
  Call it from the board's **main** view; `""` clears it. It's a visual no-op for plain
  (non-content-host) boards, which have no footer — so guard with `persephone.setStatusText?.(…)`
  if the board must also run on older app builds.

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

- **Inspect a secondary view** with `pages[pageId].editor.switchTab("board-secondary:<viewId>")` — see
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
defaults (page bg/text, monospace font, themed scrollbars, themed focus ring, and
Persephone-style native checkboxes). Colors (`--p-bg`, `--p-panel`,
`--p-border`, `--p-text`, `--p-accent`, `--p-error`, `--p-success`, `--p-warning`, …) update
live; metrics (`--p-space-*`, `--p-gap-*`, `--p-radius-*`, `--p-size-*`, `--p-font-*`) are
constants. To match **Persephone's own chrome** (title bar / sidebar / grid header) use
`--p-bg-dark` (darker than `--p-panel`), plus `--p-hover` (list/button hover) and
`--p-tree-selection` (selected row). For JS-colored components (charts/diagrams) read the live palette via
`persephone.getTheme()` / `persephone.onThemeChange(cb)` and re-apply on each fire — never cache
`persephone.theme.vars` across a switch. The app theme shortcuts (`Ctrl+Alt+]` / `Ctrl+Alt+[`) work
with focus inside the board frame — Persephone forwards them out — so a theme pass over a board needs
no clicking back into the app; a board binding either combo opts out with `preventDefault()`.

### Toolbars and buttons — use the `.p-*` classes

`board-base.css` also carries an **opt-in chrome layer** with the app's exact control metrics.
Use it instead of hand-styling a toolbar:

```html
<div class="p-toolbar">
    <span class="p-toolbar-title">Dashboard</span>
    <span class="p-sep"></span>
    <button class="p-btn selected">Active</button>
    <button class="p-btn">All</button>
    <input class="p-input" placeholder="Search…" />
    <span class="p-spacer"></span>
    <button class="p-btn primary">Refresh</button>
</div>
```

`.p-toolbar` (30px, `--p-bg-dark`; `data-orientation="vertical"` for a rail) · `.p-btn` (26px, and
**24px automatically inside a toolbar**; `primary` / `ghost` / `danger` / `link` / `selected` /
`icon` / `sm` / `md` / `on-dark`) · `.p-input` / `.p-select` (same two sizes) · `.p-sep` ·
`.p-spacer` · `.p-toolbar-title`. Bare `<button>`/`<input>` are untouched, so vendored library
controls keep their own styling.

**Writing your own chrome instead? Keep these numbers** — they are the difference between a
compact board and a bloated one:

- **Toolbar 30px**, holding 24px controls (31px with the bottom rule). `padding: 8px 12px`
  gives **45px**.
- **A toolbar button is the small tier: `height: 24px; padding: 0 4px; font-size: 12px`.**
  Persephone's own editor toolbars use small buttons; a bar of 26px medium buttons looks fine
  alone and oversized under the app's chrome. 26px/`0 8px`/14px is the page-and-dialog size.
- **Toolbar on `--p-bg-dark`** — chrome is *darker* than the page. `--p-panel` is a content
  surface; using it is what makes a board's bar look pale next to the app.
- **Controls: fixed `height`, horizontal padding only.** Vertical padding on a button is the
  usual cause of an oversized bar.
- Radius 4px (the same radius on every button in a bar), 4px between controls, 6px inside one,
  icons 16px.

### Libraries & assets — vendor them locally

A board is **offline-first** and its CSP **forbids remote network** (`connect-src
'self'` blocks CDN scripts, stylesheets, fonts, and cross-host `fetch`). Download each library
into the board folder and reference it with a **relative** path:

```html
<script src="./lib/av-grid.umd.js"></script>
<link rel="stylesheet" href="./lib/av-grid.css" />
```

Never use `https://…cdn…` URLs in `<script>`/`<link>`/`@import`/`fetch()` — they are blocked and
the board fails silently. Bundle fonts/images locally too (or inline images as `data:` URIs).

**Recommended components:** the `boards-assets/manifest.json` catalog lists pre-tested,
theme-skinned libraries (grids, charts, markdown, …) with their vendor download URLs and load
order. The skins are **not bundled in the installer** — they live on GitHub. Fetch the manifest and
each skin from the raw base URL (also returned by `main.boardsManifestUrl` /
`boardsAssetsBaseUrl`):

- Manifest: `https://raw.githubusercontent.com/andriy-viyatyk/persephone/main/boards-assets/manifest.json`
- Each component's `skin.file` (e.g. `tabulator.css`) is fetchable as **`baseUrl + skin.file`**, where
  `baseUrl` is the manifest's top-level `baseUrl` field. A component with `skin.file: null`
  (`"type": "none"`) has **no skin to fetch** — it reads `--p-*` itself.

**Tabular data → use `av-grid`.** It is the catalog's default grid and a port of Persephone's own
internal grid (VAGrid), so it is native to the app: it matches the built-in grid editors, needs **no
skin and no theme code** (its `--avg-*` tokens fall back to `--p-*`, so a theme switch re-tints it
with zero JS), and it renders more smoothly than Tabulator — noticeably so even on small datasets.
It covers sorting, checklist filters + a chip bar, search with in-cell highlighting, range select +
clipboard, virtualization, editing, and add/delete rows and columns. Vendor `av-grid.css` +
`av-grid.umd.cjs` (rename the `.cjs` to `.js`; it exposes `window.AVGrid`, class `AVGrid.AVGrid`),
link its CSS **before** your own `<style>` and pass `injectStyles: false`, and give the host a
definite height. Read its API doc first — one complete file written for an agent, including a
  *"Driving the grid from an agent"* section on the `pages[pageId].editor` path:
`https://raw.githubusercontent.com/andriy-viyatyk/av-grid/main/docs/api.md`.
Choose **Tabulator** instead only for a feature av-grid lacks: variable row heights, row grouping,
tree/nested rows, nested column headers, pagination, footer calculations, built-in export, remote-ajax
data, drag-to-reorder rows, responsive collapse, undo/redo, frozen data columns, or its ready-made
formatters (progress bar, star rating, traffic light).

Vendor flow on any machine: **GET the manifest → read the component's `vendor` URLs (the third-party
library, from a CDN) and its `skin.file` → GET `baseUrl + skin.file` → write both into the board folder**
(relative paths). Download from inside `script.execute` (full Node.js — e.g. `https.get` then
`app.fs.writeBinary(destPath, data)`), then reference the files with relative paths in `index.html` per
the manifest's `loadOrder`.

### Manifest, icon, reload

- `board-manifest.json` — keep `schemaVersion: 1`; add optional `name`/`description`/`author`/
  `repository` (metadata only). No secrets, no trust flags. To make the board a **custom editor**
  for a file type, add `fileMasks` (glob masks matched against the file name, e.g. `["*.drawio"]`;
  a wildcard-free mask with a dot inside it is an exact file **name**, e.g. `["DASHBOARD.md"]`),
  optional `folderMasks` to scope those masks to certain folders (e.g. `"fileMasks": ["DASHBOARD.md"]`
  + `"folderMasks": ["*/tasks"]` claims only `…/dev/tasks/DASHBOARD.md`; matched against the parent
  folder as a case-insensitive path *suffix* — `*`/`?` stop at a separator, `**` crosses them; omit
  for any folder; the file **icon** deliberately ignores it, since icon lookups have no path),
  optional `editorPriority` (a number; makes the board the *default* editor for those masks when it
  strictly outranks the built-in that also claims the file — omit/`0` = switch option only. Built-in
  ladder: Monaco `0`, Markdown Preview `10`, compound-name editors like `*.grid.json` `20`, Drawing
  `50`, image/archive/video `100`; ties go to the built-in, so a `DASHBOARD.md` board needs more
  than `10`, and `100` beats everything but the media viewers), and optional `editorName`
  (switch-widget label). Honored only when the board is trusted. Optional `editorKind`: `"simple"` (default) → the
  file arrives via `persephone.getFilePath()` (read/write it yourself); `"content-host"` → Persephone
  owns the file and the board works through `persephone.host.*` (shares the host with Monaco, edits
  non-local files, auto-saves). Optional `editorSources`: `"local"` (default) → a simple board is
  offered only for real local files; `"any"` → also for an archive entry or an `http(s)` URL, where
  `getFilePath()` still returns a readable local path (see the bridge section). Ignored for
  content-host boards, which always get every source.
- Optional `icon.svg` / `icon.png` / `icon.ico` in the board folder sets the board's icon (SVG
  preferred). Without one, a default glyph is used.
- **Reload model:** boards do **not** auto-reload on file changes. After editing a board's files,
  apply the changes with the **Reload** button in the in-board toolbar — or, when driving the board
  as an agent, `pages[pageId].editor.reload()`. The path returns after the reloaded main frame has
  finished loading, so an iterate loop is race-free: edit files → `reload()` → `snapshot()`.
- **`board-manifest.json` is not covered by a reload.** Persephone caches a board's manifest from the
  moment the board is trusted, so a manifest edit (`fileMasks`, `editorPriority`, `editorSources`)
  applies only after toggling the board's trust off and on, or restarting the app — not after
  `pages[pageId].editor.reload()`.

## Test it

Once the board is open, drive it through `pages[pageId].editor`. Always get the board's `pageId`
first:

```
call at `pages`                  → pick the entry with editor: "board-view" → its pageId
pages[pageId].editor.snapshot()  → read the UI
pages[pageId].editor.click({ ref: "e12" }) / .type(...) / .evaluate(...)  → interact
```

- `pages` → find the board (`editor: "board-view"`) and read its `pageId`. If several
  `board-view` pages exist, match the one you opened by its `boardRoot` / `selectedBoard`.
- `pages[pageId].editor.snapshot()` → read the accessibility tree (element refs). **Always use the
  board's page id** — board pages are not browser tabs.
- `click`, `type`, `pressKey`, and `evaluate` on that editor → interact using refs from the
  snapshot. Pass `{ ref: "e12" }` explicitly; a plain string is a CSS selector.
- **Verify UI visually.** The accessibility snapshot includes elements that are invisible on
  screen (zero-height, overridden `display`), so it can look right while the render is broken.
  After UI changes, check `pages[pageId].editor.screenshot()` before declaring the UI correct.

A board never navigates, so it has no navigation members and cannot add or close frames. Its
`tabs` and `switchTab("board-secondary:<viewId>")` members select which board frame to drive
(see next).

### Inspecting secondary views

By default every editor call targets the board's **main** frame. To inspect a
[secondary view](#secondary-views--shared-state) (a sidebar panel — its own `board://` frame),
read `pages[pageId].editor.tabs` and select it with
`pages[pageId].editor.switchTab("board-secondary:<viewId>")`; Persephone treats the board's frames
as "tabs":

```
pages[pageId].editor.tabs
  → [ { id: "main", … },
      { id: "board-secondary:<viewId>", title: "<panel title>", … }, … ]
pages[pageId].editor.switchTab("board-secondary:<viewId>") → make that frame the active target
pages[pageId].editor.snapshot()                            → now reads THAT frame's DOM
pages[pageId].editor.click/type/screenshot()               → drive that frame
```

- `list` returns the main view (`index: 0`, id `"main"`) plus one entry per declared secondary
  view (id `board-secondary:<viewId>`, `title` = the panel title).
- `switchTab` points subsequent editor calls at that frame until you select another.
  **Persephone auto-opens the view's sidebar panel and waits for its frame to render**, so the
  next command always succeeds — you never get a "frame not mounted" error, even if the panel
  was closed. `select { index: 0 }` returns to the main view.
- A screenshot of a selected secondary view is clipped to its sidebar panel.
- All frames of one board share `persephone.state.*`, so a change you make in one frame is
  visible when you snapshot another.

## Integration recipes (persephone-boards `how-to/`)

Common **integration cases** — wiring a board into a Persephone feature via the `persephone.*`
bridge — are written up as short, code-first recipes in the boards repo. When you need to open
something in the app, drive a built-in editor, or otherwise integrate, **check there first** —
the plumbing has usually been solved once already:

**<https://github.com/andriy-viyatyk/persephone-boards/tree/main/how-to>**

Example: *Open an image in the Drawing (Excalidraw) editor* documents the
`openRawLink(imageDataUrl, { editor: "draw-view" })` case above (data-URL-only, opens a new
untitled drawing, PNG-over-SVG). Add a new recipe there when you solve a fresh integration case.

## Errors & verification

The debugging surfaces, in the order to check them:

- **`ui.log`** (in the board folder) is the board's black box: load failures, CSP violations,
  uncaught errors, unhandled rejections, and every `console.error`/`console.warn` from the
  board's frames land there automatically. Read it first when a board renders blank or a
  feature silently does nothing.
- **`pages[pageId].editor.reload()` returning `frameReady: false`** means the reloaded frame never signalled
  load — almost always broken board HTML/JS; `ui.log` has the reason.
- **A silently-dead feature after adding a library** is usually the CSP: remote
  `<script>`/`<link>`/`fetch` are blocked without a visible error in the UI — but the violation
  is in `ui.log`. Vendor the file locally (see "Libraries & assets").
- **Snapshot vs screenshot**: `snapshot()` includes invisible elements, so verify visual changes
  with `screenshot()` before declaring the UI correct.
- **`boards.openBoard` / `boards.createBoard` failures** return real errors (`Not a board: …` — missing
  `board-manifest.json`; name collision on create). `boards.openBoard` success returns
  `{ opened, pageId, title }` — use that `pageId` for `pages[pageId].editor`; boards are never
  reached by the untargeted browser-page fallback unless they are the active page.
- **Manifest edits don't apply on refresh** — `fileMasks`/`editorPriority`/`editorSources` are
  cached from trust time; toggle trust or restart the app (see "Manifest, icon, reload").
- **`getJson()` rejections** carry `exitCode` + captured `stderr` from the backend script —
  surface them in the board UI rather than leaving a blank panel.

## Richer reference — the bundled Demo board

Persephone ships a full **Demo board** that exercises the whole surface (buffered/streaming/
stdin/kill/cwd `execute()`, the integration tier, the `--p-*` theme + token contract, secondary
views + shared state via `persephone.state.*`, a tabbed layout with a pinned output console).
For a richer example than the blank template, create one with `app.boards.createDemoBoard(name,
dir)` and read its files, or read the source under the install's `resources/assets/demo-board/`
(`index.html`, `app.js`, `style.css`, `board-base.css`).
