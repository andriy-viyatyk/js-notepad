# Board — authoring guide

This folder is a **Persephone Board**: a small web app whose UI you own as a
plain HTML page, backed by scripts you write in any language. Persephone hosts the
page in a locked-down, cross-origin `<iframe>` and injects a single bridge object,
`window.persephone`.

> ## 📌 Agent: rewrite this file once the board is built
>
> **This is the generic authoring guide, copied into every new board. When you finish
> implementing (or substantially changing) the board, REPLACE this file with documentation
> of _this_ board** — so a future agent asked to fix or extend it has instant context
> instead of re-reading all the code. The full generic reference below stays available any
> time via the **`read_guide("boards")`** MCP tool and the bundled Demo board, so it's safe
> to trim it out of this per-board file.
>
> Keep the rewritten file **short and board-specific**:
> - **Purpose** — what the board does, and (if it's a custom editor) which files it opens.
> - **How it works** — the frontend (`index.html` / `app.js` + the main UI pieces), the
>   backend scripts under `scripts/` (one line each), and any vendored libraries in `lib/`
>   (name + version + why).
> - **Key files** — a one-line map of the files that matter.
> - **Run & test** — how to open it, how to reload after edits (`board_refresh`), and any
>   manual test steps or sample inputs.
> - **Gotchas** — non-obvious decisions and constraints (CSP/offline workarounds, library
>   quirks, why something is done a certain way) — the things that would trip up the next agent.
> - **Reference** — keep a short pointer to the canonical Persephone board docs (below /
>   `read_guide("boards")`) for the `persephone.*` bridge API; don't re-document it here.

## Board identity: `board-manifest.json`

This folder is recognized as a board because it contains **`board-manifest.json`** —
that file's presence is what makes Persephone treat the folder as a board. It holds the
schema version plus optional **descriptive metadata** and, optionally, the **Custom Editor**
fields that let the board act as a file editor:

```json
{
  "schemaVersion": 1,
  "name": "My Board",
  "description": "What this board does.",
  "author": "you",
  "repository": "https://github.com/you/your-board",

  "fileMasks": ["*.drawio"],
  "editorPriority": 100,
  "editorName": "DrawIO"
}
```

- `name` (optional) — display name; defaults to the **folder name** when omitted or empty.
- `description` / `author` / `repository` (optional) — metadata only, for humans/agents.

**Custom Editor fields (optional)** — only honored when the board is **trusted**:

- `fileMasks` (optional) — glob masks (matched against the file **name**) this board edits,
  e.g. `["*.drawio"]` or `["*.grid.json"]`. `*` = any run of chars, `?` = one char; a bare
  extension (`".drawio"`) is accepted and treated as `*.drawio`. When set, the board appears
  in the editor **switch** for matching files.
- `editorPriority` (optional) — number; makes the board the **default** editor for its masks
  when it outranks the built-in editor. Omit or `0` → the board is a switch option only and
  the built-in editor stays the default.
- `editorName` (optional) — label shown on the editor-switch widget (falls back to `name`).

Don't put secrets or trust flags here — a board is trusted by the user inside Persephone,
never by the manifest. (The board icon is **not** set here; see *Board icon* below.)

## Mental model: frontend + backend + the `execute()` channel

- **Frontend** — `index.html` + `app.js` (+ any CSS/assets you add). Owns *all* UI
  and *all* state. This is what renders in the iframe.
- **Backend** — the scripts under `scripts/` (`.js`, `.py`, `.ps1`, `.sh`, …). They
  run as real OS processes with your privileges, and talk to the page over stdout.
- **Channel** — `persephone.execute(commandLine)`. The page calls a script, the
  script prints JSON to stdout, the page parses it and renders. That's the whole loop.

Persephone owns no board state and no board UI — it just wires the channel and shows
the page. Persistence (if you want any) is your choice: write a script that reads/
writes a file via `execute()`.

## The one method: `persephone.execute()`

```js
const handle = persephone.execute(commandLine, { cwd, env, shell });
```

`cwd` defaults to **this board folder**, so relative paths like `scripts/hello.js`
just work (and a script behaves the same if you run it standalone from here).

Consume the handle **one of two ways** (mixing them on one handle throws):

- **Buffered** — `await handle.getText()` / `getJson()` / `getBytes()`.
  `getJson()` rejects on a non-zero exit or a JSON parse error (the error carries
  `exitCode` and captured `stderr`).
- **Streaming** — `handle.on("stdout" | "stderr", chunk => …)`, `handle.on("exit", info => …)`,
  `handle.on("error", err => …)`. Plus `handle.write(...)`, `handle.endStdin()`, `handle.kill()`.

**Convention:** a backend script prints a single JSON document to stdout; the page
reads it with `getJson()`. See `app.js`'s `boardScript()` helper and `scripts/hello.js`.

### Returning data reliably when a script calls other tools

A bare `getJson()` assumes stdout contains **only** your JSON. That breaks as soon as
your script shells out to another tool that prints its own output (progress, banners,
its own JSON) — the mixed stream won't parse. Two complementary habits fix this:

1. **Logs → stderr, result → stdout.** Send any diagnostics to stderr (a separate
   stream, surfaced via `handle.on("stderr", …)`), and where you can, *capture* a
   sub-tool's output instead of letting it flow through (`out=$(tool)` in shell,
   `subprocess.run(..., capture_output=True)` in Python, `execSync(cmd)` in node).

2. **Wrap the result in a marker** and let `getJson(pattern)` extract it. Emit the
   final JSON with a unique tag from the backend script:

   ```js
   console.log("@@RESULT@@" + JSON.stringify(result));          // node
   ```
   ```python
   print("@@RESULT@@" + json.dumps(result))                    # python
   ```
   ```sh
   echo "@@RESULT@@$json"                                       # shell
   ```

   Then pass that marker to `getJson()` on the page — it extracts the match (the
   **last** one, capture group 1) before parsing, and **still rejects on a non-zero
   exit with the captured stderr**:

   ```js
   const result = await persephone.execute(cmd).getJson(/@@RESULT@@(.*)/);
   ```

   For pretty-printed (multi-line) JSON, use an open/close pair with a dot-all regex:
   `getJson(/@@RESULT@@([\s\S]*?)@@END@@/)`. Pick your own tag and keep it identical on
   both sides. `getJson()` with no argument still parses the whole stdout (fine for
   scripts that print only JSON).

## Integration tier (in-app effects `execute()` can't express)

- `persephone.openRawLink(href, options?)` — open a file/URL in a new Persephone page. Pass
  `{ editor }` (e.g. `{ editor: "md-view" }`) to request a specific editor — useful to open a
  Markdown doc rendered rather than as source; falls back to the default editor when omitted/unmatched.
- `persephone.notify(message, type)` — toast (`"info" | "success" | "warning" | "error"`).
- `persephone.openFileDialog(params)` / `saveFileDialog(params)` / `openFolderDialog(params)`
  — native dialogs; each returns a path you hand to `execute()`.
- `persephone.readFile(path, options?)` / `writeFile(path, data, options?)` — read/write a file
  directly, no backend script needed. A **relative** `path` resolves against the board folder (the
  same default as `execute()`'s cwd); an absolute path reads/writes anywhere. Text by default; pass
  `{ encoding: "base64" }` for binary. `writeFile` creates parent folders. Both return Promises and
  reject on error. Ideal for persisting small board state (column layout, last filter, selected
  item) and loading a board-local config:
  ```js
  // persist UI state
  await persephone.writeFile("state.json", JSON.stringify(state));
  // restore it next launch (handle first-run "file not found")
  let state = {};
  try { state = JSON.parse(await persephone.readFile("state.json")); } catch {}
  ```
- `persephone.getFilePath()` → `Promise<string | undefined>` — when this board is opened as a
  **custom editor** for a file (associated via `fileMasks` in `board-manifest.json`), this resolves
  to that file's **absolute path**; read/write it with `persephone.readFile()` / `writeFile()`. It
  resolves to `undefined` for a board opened plainly. Safe to `await` at any time — it waits for the
  host handshake, so you never race a missing value:
  ```js
  const filePath = await persephone.getFilePath();
  if (filePath) {
      const content = await persephone.readFile(filePath);
      // …render / edit, then persephone.writeFile(filePath, updated) to save
  }
  ```

## Long-running processes: `setBoardBusy()` / `getBoardBusy()` / `getJobs()`

By default, everything a board spawned is **killed when the board unloads** — the user
navigating its page to a document, or a board reload. For a board that starts dev
servers (or any process that must keep running), opt out with the **busy** flag:

- `persephone.setBoardBusy(true)` — declare "my processes must outlive me". While busy,
  unloading the board (navigation, reload) keeps its processes running. They are still
  killed when the page/tab closes, when Persephone quits, or after you call
  `setBoardBusy(false)` and the board unloads.
- `persephone.getBoardBusy()` → `Promise<boolean>` — the flag survives the board's own
  reload; read it on startup to know you should re-enter "running" mode.
- `persephone.getJobs()` → `Promise<[{ jobId, command, name, kill(), write(), endStdin() }]>` —
  this board's LIVE jobs, including ones spawned by a previous lifetime of the board.
  Surviving jobs are **control-only**: `kill()`/`write()` work, but there is no
  stdout/stderr/exit streaming (their output went to the previous lifetime; output
  produced while the board was unloaded is dropped). Poll `getJobs()` to notice a job
  exited.

**Name your long-running jobs** — the name is the re-association key after a reload
(the board's own JS state, including old handles, does not survive):

```js
// start
persephone.execute("npm run dev", { name: "backend" });
persephone.setBoardBusy(true);

// on every board startup — the reinit contract
if (await persephone.getBoardBusy()) {
    const jobs = await persephone.getJobs();
    const backend = jobs.find(j => j.name === "backend");
    if (backend) showRunning(backend);            // Stop button → backend.kill()
    if (jobs.length === 0) persephone.setBoardBusy(false); // nothing lives — reset
}

// stop
backend.kill();
persephone.setBoardBusy(false);
```

## Theme: the `--p-*` contract

Persephone injects its palette as CSS variables on `<html>` and keeps them live
across theme switches — style everything with them so the board matches the app.
The variables are defined **before the first paint**, so a board loads already themed
(no flash) — you can rely on `var(--p-bg)` etc. resolving from the very first frame:

```css
body { background: var(--p-bg); color: var(--p-text); }
button { background: var(--p-accent); color: var(--p-accent-text); border-radius: var(--p-radius-md); }
```

Your board ships with **`board-base.css`** (linked first in `index.html`). It applies
sensible defaults for you — page background/text, a **monospace default font**, and
**themed scrollbars** — all from the `--p-*` contract. Build your own styles on top
(or edit it). The list below is the full palette + metric set you can use:

- **Colors** (theme-dependent, update live): `--p-bg`, `--p-panel`, `--p-overlay`,
  `--p-border`, `--p-border-light`, `--p-text`, `--p-text-muted`, `--p-text-strong`,
  `--p-accent`, `--p-accent-text`, `--p-accent-hover`, `--p-selection-bg`,
  `--p-selection-text`, `--p-link`, `--p-error`, `--p-success`, `--p-warning`,
  `--p-scrollbar`, `--p-scrollbar-thumb`, `--p-shadow`.
- **Metrics** (constants): `--p-space-*`, `--p-gap-*`, `--p-radius-*`, `--p-size-*`,
  `--p-font-*` (e.g. `--p-space-md`, `--p-radius-sm`, `--p-font-base`).

Also mirrored in JS — for colors you set from JS (e.g. a chart library):

- `persephone.theme` (`{ id, isDark, vars }`) and `persephone.tokens` — a **snapshot at
  page load**. Correct on every (re)load, but they do **not** update on an in-session
  theme switch (the bridge copies them once into the page).
- `persephone.getTheme()` / `persephone.getTokens()` — the **live** palette/tokens, always
  the current theme (a function call crosses the bridge fresh each time).
- `persephone.onThemeChange(cb)` — fires once immediately, then on every switch; the
  callback **argument** is the live palette.

**Re-theming a JS-colored component (charts, diagrams):** read the palette from the
`onThemeChange` argument (or `getTheme()`) and re-apply on each fire — never cache
`persephone.theme.vars` and reuse it across a switch, or your colors will go stale.

## Libraries & assets — vendor them locally

A board is a **local, offline-first app**, and its CSP **forbids remote network**:
`connect-src 'self'` blocks CDN scripts, stylesheets, fonts, and any `fetch`
to another host. So when you use a component library (grids, charts, markdown, icons,
fonts, …), **download it into the board folder and reference it relatively** — never
link a CDN.

- Put files under the board folder, e.g. `lib/tabulator.min.js`, `lib/tabulator.min.css`,
  and load them with **relative paths**: `<script src="./lib/tabulator.min.js"></script>`,
  `<link rel="stylesheet" href="./lib/tabulator.min.css" />`. A relative path resolves
  under the page's `board://` origin automatically (subfolders included) — just like the
  board's own `./app.js` / `./style.css`. You don't write the scheme yourself (and never
  the two-slash `board://lib/…` form — the URL parser would read `lib` as the host).
- **Do not** use `https://…cdn…` URLs in `<script>` / `<link>` / `@import` / `fetch()` —
  they are blocked and the board will silently fail to load the dependency.
- Bundle fonts and images in the folder too (or inline images as `data:` URIs).

This keeps the board self-contained: it works with no network connection and won't
break if a CDN changes or disappears. (As an agent: download the library files into
the board folder before referencing them.)

## Errors & the log

Report failures with `persephone.notify(message, "error")` — they're toasted **and**
appended to **`ui.log`** in this folder (the **Show-log** button in the in-board toolbar
opens it). Persephone also logs board *load* failures there automatically: navigation
errors, CSP violations, and uncaught script errors / unhandled rejections. The log starts
fresh on every load (it holds only the current board lifetime, beginning with a
`board loaded` line), so opening it after a clean load shows no errors. Keep your `catch`
blocks calling `notify(..., "error")` so problems are reviewable.

## Board icon (optional)

Put an `icon.svg`, `icon.png`, or `icon.ico` in this board folder to set the board's
icon — shown in the Persephone tab (when the board is open), the boards list, and the
sidebar. First match wins (SVG preferred). Without one, a default glyph is used.

## Editing & reload

Boards do **not** auto-reload when you edit their files. After editing `index.html`,
`app.js`, or `.css`, apply the changes with the **Reload** button in the in-board
toolbar. When an AI agent is driving the board, it reloads with the **`board_refresh`**
MCP tool instead.

## Testing & automation (for an AI agent)

Once the user has opened this board in Persephone, an agent can drive it with the
**`browser_*` MCP tools** (Playwright-compatible) to test and debug it:

- `list_pages` → find this board (`editor: "board-view"`, with its `selectedBoard`)
  and read its `pageId`.
- `browser_snapshot { pageId }` → read the page's accessibility tree (element refs).
- `browser_click` / `browser_type` / `browser_press_key` / `browser_evaluate` →
  interact, using the refs from the snapshot.

The board must be **open** (the user opens it; an untrusted project won't render).
Navigation/tab tools don't apply — a board is one fixed page.

## More examples — the bundled Demo board

Persephone ships a full **Demo board** that exercises the whole surface — the
`persephone.execute()` channel (buffered / streaming / stdin / kill / cwd), the
integration tier, the `--p-*` theme + token contract, and a tabbed multi-view layout
with a pinned output console. When you need a richer reference than this starter,
read the Demo board's files (`index.html`, `app.js`, `style.css`, `board-base.css`):

- **Ask the app:** call the `get_app_info` MCP tool — it returns `demoBoardDir` (the exact path to
  the bundled demo board) and `resourcesDir`, so you never have to guess the install location.
- **Installed app:** under the Persephone install's `resources/assets/demo-board/`.
- **From source (dev):** `assets/demo-board/` in the repository.

## Docs

- Persephone on GitHub: https://github.com/andriy-viyatyk/persephone
- Board guide (user docs): https://github.com/andriy-viyatyk/persephone/blob/main/docs/boards.md
- Recommended components + skins catalog:
  https://raw.githubusercontent.com/andriy-viyatyk/persephone/main/boards-assets/manifest.json
  (also returned by `get_app_info` as `boardsManifestUrl`). Fetch a skin as its `baseUrl + skin.file`.
