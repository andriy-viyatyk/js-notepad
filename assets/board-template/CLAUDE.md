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
  extension (`"drawio"` / `".drawio"`) is accepted and treated as `*.drawio`. A wildcard-free
  mask with a dot **inside** it is an exact **file name**, not an extension — `["DASHBOARD.md"]`
  claims files named exactly that (pair it with `folderMasks` to scope where). When set, the
  board appears in the editor **switch** for matching files.
- `folderMasks` (optional) — narrows `fileMasks` to files sitting in matching **folders**, e.g.
  `"fileMasks": ["DASHBOARD.md"], "folderMasks": ["*/tasks"]` claims `…/dev/tasks/DASHBOARD.md`
  but leaves every other `DASHBOARD.md` to its built-in editor. Omit for "any folder" (the default). Matched
  against the file's **parent folder**, case-insensitively, with either separator, and anchored
  at the **end** of the path — a mask is a folder-path *suffix*, so it need not spell out the
  drive. `*` and `?` stop at a separator, `**` crosses them: `*/tasks` = exactly one segment
  above `tasks`, `tasks` = a folder of that name at any depth, `**/dev/tasks` = `dev/tasks`
  anywhere, `c:/projects/acme/**` = anything *under* that tree (the tree root itself is not
  matched — add it as a second mask if you need it). Narrowing only: `folderMasks` with no
  `fileMasks` registers nothing. One exception, by design — the **file icon** ignores
  `folderMasks` (icon lookups have only a file name, no path), so every name-matching file
  shows this board's icon even outside the folder scope; only the editor that actually *opens*
  the file respects the scope.
- `editorPriority` (optional) — number; makes the board the **default** editor for its masks
  when it **strictly outranks** the built-in editor that also claims the file. Omit or `0` → the
  board is a switch option only and the built-in editor stays the default. The built-in ladder:
  Monaco `0` (the catch-all floor), Markdown Preview `10` (`.md` & friends), compound-name
  editors `20` (`*.grid.json`, `*.note.json`, `*.rest.json`, …), Drawing `50`, image /
  archive / video viewers `100`. So `1` is enough to beat Monaco on a plain text file, but a
  board claiming `DASHBOARD.md` needs **more than 10** to win over Markdown Preview — ties go
  to the built-in. When in doubt, `100` beats everything except the media viewers, and `200`
  beats those too.
- `editorName` (optional) — label shown on the editor-switch widget (falls back to `name`).
- `editorKind` (optional) — how Persephone backs this editor. Omit or `"simple"` (default) → the
  board gets the file path via `persephone.getFilePath()` and reads/writes it directly with
  `persephone.readFile()` / `writeFile()`. `"content-host"` → Persephone owns the file (pipe,
  encoding, encryption, auto-save, dirty tracking) and the board works through
  `persephone.host.getContent()` / `setContent()` instead. Content-host boards also edit non-local
  files (`https://`, inside archives, encrypted).
- `editorSources` (optional) — `"local"` (default) or `"any"`. Persephone opens more than plain
  local files: a file inside an archive (`archive.zip!doc.pdf`), an `http(s)` URL, an encrypted
  file. By default a **simple** board is offered only for a real local file, because the common
  shape — `readFile(await getFilePath())` — would break on a source with no readable path. Set
  `"any"` when your board can handle every source; `getFilePath()` then still hands you a readable
  **local** path (Persephone materializes the source into a cache file first), so you need **no
  source-specific code** — see *Opened as a custom editor* below for the two consequences you must
  handle. Ignored for `"content-host"` boards, which always get every source.

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

## Guaranteed Node runtime: `persephone.executeNode()`

`persephone.execute("node script.js")` only works if the **user** has Node installed —
a published board can't rely on that. `executeNode` runs a script on **Persephone's own
bundled Node runtime**, so it works on any machine with zero dependencies:

```js
const handle = persephone.executeNode(script, args?, { cwd, env, name });
```

- `script` — a path relative to the board folder (or absolute). Prefer **`.mjs`** for
  explicit ESM (boards ship no `package.json`).
- `args` — a `string[]` passed argv-style: **no shell**, so no quoting hazards (a value
  like `"a b"` arrives as one argument). The `shell` option is ignored.
- Returns the **same handle** as `execute()` — buffered getters, streaming,
  `write`/`endStdin`/`kill`, and `name`-based `getJobs()` re-association all work
  identically.
- The runtime is **Node 24** with **`node:sqlite` built in** (incl. FTS5) — no npm
  install needed for SQLite. A missing script fires the handle's `error` event.

### Resident backend server (the key pattern)

Because the handle keeps stdin streaming, spawn **one** long-lived script per session and
feed it jobs as JSON lines instead of paying a spawn per operation:

```js
const srv = persephone.executeNode("scripts/db-server.js", [dbPath], { name: "db" });
srv.on("stdout", chunk => handleJsonLine(chunk));   // {id, columns, rows} | {id, error}
srv.write(JSON.stringify({ id: 1, sql }) + "\n");   // per query — no spawn, db stays open
```

One ~150 ms spawn when the board opens; afterwards each operation costs only its own work
(e.g. the SQLite query against a warm page cache). Pair with `setBoardBusy(true)` so the
server survives a board reload, and re-attach by `name` via `getJobs()` (see below). Board
close reaps the child.

## Integration tier (in-app effects `execute()` can't express)

### `persephone.call(path, options?)`

Trusted Boards can read and update the AiVision tree through the page that hosts the Board. The
hosting page is stable even if the user activates another tab. Calls always use `hints: "never"`,
return a JSON-safe shaped value, and reject `Error` on resolver, transport, timeout, serialization,
or trust failures. Existing descriptor restrictions still apply, including private browser pages.
The bridge exposes the renderer-side page/app tree only; process-wide `main.*` and `windows[i].*`
are MCP call-tool paths and are not available through `persephone.call()`. The `boards` namespace
provides local board inventory and lifecycle operations; `tools` provides registered Agent Tools.
Tool execution runs with the user's privileges and exposes environment-variable names only. Trust,
board registration, and toolset registration remain user-mediated, so a call can request those flows
but never silently grants them.

```js
const source = await persephone.call("page.grouped.content");
const matches = [...source.matchAll(new RegExp(pattern, flags))]
    .map((match) => ({ match: match[0], index: match.index }));
await persephone.call("page.grouped.content", {
    value: JSON.stringify(matches, null, 2),
});
```

Pass `args` to invoke the final method, `value` to assign a writable property, or `maxLength` to
bound string shaping. `args` and `value` cannot be combined. See the bundled regex verification
Board under `assets/board-call-regex/` for a complete Run/Write example.

- `persephone.openRawLink(href, options?)` — open a file/URL in a new Persephone page. Pass
  `{ editor }` (e.g. `{ editor: "md-view" }`) to request a specific editor — useful to open a
  Markdown doc rendered rather than as source; falls back to the default editor when omitted/unmatched.
  An **image `data:` URL** with `{ editor: "draw-view" }` opens the image as a **new editable
  Excalidraw drawing** (rasterize your view to a PNG data URL first).
  - **External links are auto-routed for you.** A plain `<a href="https://…">` click inside a
    board would otherwise navigate the board frame itself to a URL its `board://` origin can't
    load, blanking the board. Persephone intercepts anchor clicks (and middle-clicks) and routes
    any link that leaves the board's own origin through `openRawLink` automatically — no board
    code needed. Relative and `#fragment` links resolve against the board and navigate in-frame
    as normal. To handle a link yourself instead, call `e.preventDefault()` in your own click
    handler first (the auto-router stands down when the event is already handled).
  - **A default right-click menu is provided for you.** Persephone renders a themed context menu
    inside your board — no code needed: _Open Link_ / _Copy Link_ on links, _Open Image in New
    Tab_ / _Copy Image_ / _Save Image As…_ on images, _Cut_ / _Copy_ / _Paste_ in text fields, and
    _Copy_ on a text selection. To show your own menu instead, call `e.preventDefault()` on the
    `contextmenu` event in your handler (same opt-out as the link router and Ctrl+S).
- `persephone.notify(message, type)` — toast (`"info" | "success" | "warning" | "error"`).
- `persephone.openFileDialog(params)` / `saveFileDialog(params)` / `openFolderDialog(params)`
  — native dialogs; each returns a path you hand to `execute()`.
- `persephone.readFile(path, options?)` / `writeFile(path, data, options?)` — read/write a file
  directly, no backend script needed. A **relative** `path` resolves against the board folder (the
  same default as `execute()`'s cwd); an absolute path reads/writes anywhere. `writeFile` creates
  parent folders. Both return Promises and reject on error. Three encodings:
  - **`"utf8"`** (default) — a plain string.
  - **`"binary"`** — a **`Uint8Array`** of the raw bytes. **Use this for any binary file** (an
    image, a PDF, a zip, a spreadsheet). It hands the bytes straight to your parser with no
    conversion, and it is the only way to read a file over ~400 MB, because base64 of one exceeds
    V8's maximum string length. Requires app **4.0.21+** — declare `"minAppVersion": "4.0.21"` in
    `board-manifest.json` and Persephone will refuse to run the board on anything older, so no
    runtime check is needed.
  - **`"base64"`** — a base64 string. Correct when you genuinely want base64 (building a `data:`
    URI); a poor way to move bytes. Measured on a 20 MB file: ~65 ms of pure conversion (`atob`
    plus a per-byte decode) and roughly 3x the transient memory of the binary path.
  ```js
  const bytes = await persephone.readFile(await persephone.getFilePath(), { encoding: "binary" });
  const workbook = XLSX.read(bytes, { type: "array" });   // no atob, no copy loop
  ```
  Ideal for persisting small board state (column layout, last filter, selected item) and loading a
  board-local config:
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
  The path is **always local and always readable**, whatever the file really was. For an archive
  entry or an `http(s)` URL (which reach you only with `"editorSources": "any"`) Persephone reads
  the source through its content pipe and hands you a cache file named after it, so one code path
  serves every source. Two consequences, and a board declaring `"any"` must handle both:
  ```js
  // 1. It can be SLOW — a URL completes only after the whole download. Don't make your UI
  //    wait on it if there is anything else to do first.
  const pending = persephone.getFilePath();
  buildUi();                       // runs while the source is still being fetched
  // 2. It can REJECT — missing archive entry, HTTP failure. Distinct from `undefined`,
  //    which just means "not opened for a file".
  let filePath;
  try { filePath = await pending; }
  catch (err) { showError(err.message); return; }   // never leave a blank frame
  ```
  Materialized files are **read-only**: writing to the cache path does not write back to the
  original source.

### Content-host boards — `persephone.host.*`

When your board sets `"editorKind": "content-host"` in the manifest, **Persephone owns the file**,
not you. It handles the pipe, encoding, encryption, the auto-save cache, and dirty tracking; your
board never touches a path or calls `readFile`/`writeFile` for the edited file. Instead you work
with the content through `persephone.host.*`:

- `persephone.host.getContent()` → `Promise<string>` — the current content. Safe to `await` at any
  time — it waits for the host handshake and the first content snapshot internally, so calling it
  first thing in your script (before anything else has run) is fine; you never race a missing value.
- `persephone.host.setContent(content)` — replace the content and mark the file **modified**
  (schedules the auto-save cache), exactly like a user edit in Monaco. A `getContent()` right after
  returns what you just wrote (read-your-own-write).
- `persephone.host.onContentChange(cb)` → unsubscribe fn — `cb(content, language?)` fires whenever
  the content changes **elsewhere** (e.g. the user switched to Monaco, edited, and switched back).
  Your own `setContent` does **not** re-fire it. Registers at any time, boot ordering included.
- `persephone.host.getLanguage()` → `Promise<string | undefined>` — the host's Monaco language id.
- `persephone.host.save()` — save through the pipe now (optional; see Ctrl+S below).

```js
// content-host board: render current content, re-render on external change
render(await persephone.host.getContent());
persephone.host.onContentChange((content) => render(content));   // keep the render() resilient to
                                                                 // transient/invalid input
```

**Saving is automatic.** Persephone injects a `Ctrl+S` (⌘S) handler that saves the host for you —
you write no save code. If your board wants custom save behavior, add your own key handler and call
`e.preventDefault()`; Persephone's fallback then stands down. `persephone.host.save()` is available
for an in-board Save button.

Because the host is shared, a content-host board and Monaco (or Grid) **switch back and forth on the
same file with no reload and no data loss** — the classic source-edit / live-preview pairing. On a
plain (non-content-host) board `persephone.host.getContent()` / `getLanguage()` reject (after the
handshake answers the question) and a registered `onContentChange` callback never fires, so
feature-detect with a `try`/`catch` around `getContent()` if a board can open either way.

**Browser APIs (clipboard, etc.):** the board frame is a secure context and Persephone grants it
clipboard permission, so standard web APIs like `navigator.clipboard.write([...])` work directly —
no bridge method needed (they still require a user gesture + a focused window, per the browser).
Only remote *network* is blocked (by the CSP — see *Libraries & assets* below).

## Secondary views & shared state

A board isn't limited to its main page — it can contribute one or more **secondary views**:
extra sidebar panels, each its own `board://` iframe over the **same board**. Every frame
(main + secondaries) shares one state object that Persephone owns and mirrors into all of
them, so they stay synchronized. This is how you build editor-style boards: a main view plus
a coordinated "lists / details / outline" sidebar.

### Declare views — manifest or at runtime

Statically, in `board-manifest.json`:

```json
{
  "schemaVersion": 1,
  "secondaryViews": [
    { "id": "lists",  "title": "Lists" },
    { "id": "detail", "html": "detail.html", "title": "Detail" }
  ]
}
```

- `id` — stable key for the view (must not contain `::`).
- `html` — the view's entry file. **Defaults to `index.html`**, so one file can serve every
  view (branch on `persephone.view`, below); or point it at a dedicated file.
- `title` — the sidebar panel's label. (The panel icon is always the board's own icon — there
  is no per-view icon.)

Or dynamically, from any frame:

```js
persephone.setSecondaryViews([{ id: "lists", title: "Lists" }]);
persephone.setSecondaryViews([]);   // remove all
```

Navigating the board's main view away removes its panels and disposes the board — secondary
views don't keep it on the page.

### One HTML, many roles — `persephone.view`

Each frame knows its role synchronously at load via `persephone.view`: `"main"` for the main
view, or the view's `id` for a secondary frame. Branch on it to serve everything from
`index.html`:

```js
if (persephone.view === "main") renderMain();
else renderSidebar(persephone.view);   // e.g. "lists"
```

### Shared state — `persephone.state.*`

The frames coordinate through a shared state object (Persephone-owned, authoritative),
available on **every** board — main and secondary frames alike:

```js
// Declare defaults + which keys persist (opt-in — below). Call once, from the main view.
persephone.state.init({ selected: null, filter: "all" }, { restorableKeys: ["selected"] });

const s   = await persephone.state.get();     // current state (Promise: first snapshot, then cached)
persephone.state.set({ selected: "work" });   // replace
persephone.state.merge({ filter: "open" });    // shallow-merge
const off = persephone.state.onChange((s) => renderFrom(s)); // any frame's change; returns unsubscribe fn
```

- **`onChange` is the source of truth.** A write round-trips through Persephone and comes back
  to every frame (including the writer), so treat `onChange` like React `setState` — render
  from it; don't assume `set`/`merge` applied synchronously.
- **Opt-in persistence.** Only the keys listed in `state.init(defaults, { restorableKeys })`
  are saved to the page and restored on app restart / board reload. Everything else is
  in-memory only — stash large or transient state freely without bloating the open-pages file.

### Example — a list + detail pairing

```js
// index.html / app.js — the main view
persephone.state.init({ selectedId: null }, { restorableKeys: ["selectedId"] });
persephone.state.onChange((s) => highlightSelected(s.selectedId));

// lists.html (or index.html branched on persephone.view === "lists") — a sidebar view
row.onclick = () => persephone.state.merge({ selectedId: row.dataset.id });
```

The bundled Demo board has a live **Secondary Views** showcase demonstrating both the
one-file (`persephone.view`) and dedicated-file styles — see *More examples* below.

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
sensible defaults for you — page background/text, a **monospace default font**,
**themed scrollbars**, a **themed focus ring**, and **Persephone-style checkboxes**
(any native `<input type="checkbox">` renders as the app's rounded-square + check,
driven by the `--p-*` tokens) — all from the `--p-*` contract. It also carries an
**opt-in chrome layer** (`.p-toolbar`, `.p-btn`, `.p-input`, …) covered in the next
section. Build your own styles on top (or edit it). The list below is the full
palette + metric set you can use:

- **Colors** (theme-dependent, update live): `--p-bg`, `--p-panel`, `--p-bg-dark`,
  `--p-overlay`, `--p-hover`, `--p-tree-selection`, `--p-border`, `--p-border-light`,
  `--p-text`, `--p-text-muted`, `--p-text-strong`, `--p-accent`, `--p-accent-text`,
  `--p-accent-hover`, `--p-selection-bg`, `--p-selection-text`, `--p-link`,
  `--p-error`, `--p-success`, `--p-warning`, `--p-scrollbar`, `--p-scrollbar-thumb`,
  `--p-shadow`.
  - To render **Persephone-style chrome** (title bars, sidebar panels, grid headers):
    `--p-bg-dark` is the app's chrome surface (darker than `--p-panel`), `--p-hover`
    the list/button hover background, `--p-tree-selection` the selected-row background.
- **Metrics** (constants): `--p-space-*`, `--p-gap-*`, `--p-radius-*`, `--p-size-*`,
  `--p-font-*` (e.g. `--p-space-md`, `--p-radius-sm`, `--p-font-base`).

### Toolbars and buttons — use the `.p-*` classes, don't invent your own

`board-base.css` ships ready-made chrome carrying the app's exact control metrics.
Use it rather than styling a toolbar yourself — the sizes below are what make a board
look built into Persephone instead of embedded in it:

```html
<div class="p-toolbar">
    <span class="p-toolbar-title">Dev Dashboard</span>
    <span class="p-sep"></span>
    <button class="p-btn selected">Active</button>
    <button class="p-btn">All</button>
    <input class="p-input" placeholder="Search…" />
    <span class="p-spacer"></span>
    <button class="p-btn primary">Refresh</button>
</div>
```

| Class | What it is |
|-------|-----------|
| `.p-toolbar` | 30px bar on `--p-bg-dark` (+1px rule). Add `data-orientation="vertical"` for a side rail. |
| `.p-btn` | 26px button — **24px inside a `.p-toolbar`**, automatically. Modifiers: `primary` (accent fill), `ghost`, `danger`, `link`, `selected`, `icon` (square), `sm` (24px anywhere), `md` (keep 26px in a bar), `on-dark`. |
| `.p-input` / `.p-select` | Field aligned with the buttons beside it — 26px, 24px in a toolbar. Same `sm` / `md` modifiers. |
| `.p-sep` | Hairline between toolbar groups. |
| `.p-spacer` | Pushes everything after it to the right edge. |
| `.p-toolbar-title` | Caption text in a bar (board name, breadcrumb) — not a control. |

They are opt-in: a bare `<button>` is untouched, so a vendored library's own controls
keep their styling.

**If you do write your own chrome CSS, keep these numbers.** They are the whole
difference between a compact board and a bloated one:

- **Toolbar: 30px tall, holding 24px controls** (31px with the bottom rule). A
  comfortable-looking `padding: 8px 12px` produces a **45px** bar, half again too tall.
- **A toolbar button is the SMALL tier: `height: 24px; padding: 0 4px;
  font-size: 12px`.** This is the one that looks fine in isolation and wrong in place —
  Persephone's own editor toolbars are built from small buttons, so a bar of 26px
  medium buttons reads as oversized the moment it sits under the app's chrome. 26px is
  the *page and dialog* size.
- **Toolbar surface: `--p-bg-dark`.** App chrome is *darker* than the page, never
  lighter. `--p-panel` is a content surface — using it is what makes a board's toolbar
  look pale and web-like next to the app.
- **Controls: fixed `height`, horizontal padding only.** Vertical padding on a button
  is the single most common cause of an oversized bar.
- **Radius 4px (`--p-radius-md`), gap 4px between controls, 6px inside a button,
  icons 16px** — and use the *same* radius on every button in a bar.

Outside a bar (a form, a dialog, a page action) the medium tier is right: 26px,
`padding: 0 8px`, 14px text.

Also mirrored in JS — for colors you set from JS (e.g. a chart library):

- `persephone.theme` (`{ id, isDark, vars }`) and `persephone.tokens` — a **snapshot at
  page load**. Correct on every (re)load, but they do **not** update on an in-session
  theme switch (the bridge copies them once into the page).
- `persephone.getTheme()` / `persephone.getTokens()` — the **live** palette/tokens, always
  the current theme (a function call crosses the bridge fresh each time).
- `persephone.onThemeChange(cb)` — fires once immediately, then on every switch; the
  callback **argument** is the live palette.

**Switching themes while testing.** The app's theme shortcuts — `Ctrl+Alt+]` (next) and
`Ctrl+Alt+[` (previous) — work while focus is inside the board frame, so you can flip through
themes to check your styling without clicking out to the app first. Persephone forwards them
out of the frame for you; if your board binds either combo itself, call `preventDefault()` in
your own handler and the forwarding stands down (same opt-out as `Ctrl+S` and the context menu).

**Re-theming a JS-colored component (charts, diagrams):** read the palette from the
`onThemeChange` argument (or `getTheme()`) and re-apply on each fire — never cache
`persephone.theme.vars` and reuse it across a switch, or your colors will go stale.

## Libraries & assets — vendor them locally

A board is a **local, offline-first app**, and its CSP **forbids remote network**:
`connect-src 'self'` blocks CDN scripts, stylesheets, fonts, and any `fetch`
to another host. So when you use a component library (grids, charts, markdown, icons,
fonts, …), **download it into the board folder and reference it relatively** — never
link a CDN.

- Put files under the board folder, e.g. `lib/av-grid.umd.js`, `lib/av-grid.css`,
  and load them with **relative paths**: `<script src="./lib/av-grid.umd.js"></script>`,
  `<link rel="stylesheet" href="./lib/av-grid.css" />`. A relative path resolves
  under the page's `board://` origin automatically (subfolders included) — just like the
  board's own `./app.js` / `./style.css`. You don't write the scheme yourself (and never
  the two-slash `board://lib/…` form — the URL parser would read `lib` as the host).
- **Do not** use `https://…cdn…` URLs in `<script>` / `<link>` / `@import` / `fetch()` —
  they are blocked and the board will silently fail to load the dependency.
- Bundle fonts and images in the folder too (or inline images as `data:` URIs).

This keeps the board self-contained: it works with no network connection and won't
break if a CDN changes or disappears. (As an agent: download the library files into
the board folder before referencing them.)

**Which library?** The recommended-components catalog
(`boards-assets/manifest.json`, link at the bottom of this file) lists a pre-tested,
theme-checked library per job — grid, charts, date picker, select, markdown, diagrams,
split panes, drag-reorder, tooltips, modals — with vendor URLs, load order, and the skin
to fetch. Prefer a catalog component over an arbitrary one you pick yourself.

### Tabular data — use av-grid

For **anything grid-shaped**, the default is **[av-grid](https://github.com/andriy-viyatyk/av-grid)**
(npm `av-grid`), not Tabulator. It is a port of Persephone's own internal grid (VAGrid), so
it is native to the app: it matches the built-in grid editors' look and keyboard behaviour,
and it renders more smoothly than Tabulator — noticeably so **even on small datasets**.

- **No skin to fetch, no theme code.** Every `--avg-*` token falls back to its `--p-*`
  counterpart, so the grid is themed on arrival and a live theme switch re-tints it with
  **zero JavaScript** — nothing to re-apply in `onThemeChange`.
- **Vendor:** `av-grid.css` + `av-grid.umd.cjs` from jsDelivr into `lib/`, **renaming the
  `.cjs` to `.js`** so it loads as a classic script. It exposes `window.AVGrid`; the class
  is `AVGrid.AVGrid`.
- **Read the API doc first:** https://raw.githubusercontent.com/andriy-viyatyk/av-grid/main/docs/api.md
  — one complete file, written for an agent, with a *"Driving the grid from an agent"*
  section on the MCP browser tools and a DOM contract for selectors.
- **Load order:** `board-base.css` → `lib/av-grid.css` → your own `<style>`, and pass
  `injectStyles: false` to `create()` — otherwise the grid appends its stylesheet *after*
  your page and out-orders your overrides. Give the grid host a **definite height** (a host
  with no height renders blank; `getState().viewport.width === 0` says so), and with
  `filterBar: true` give `.avg-grid-wrap` `height: 100%`.
- **Reach for Tabulator only** when the board genuinely needs something av-grid does not
  have: variable row heights, row grouping, tree/nested rows, nested column headers,
  pagination, footer calculations, built-in export (CSV/XLSX/PDF/print), remote-ajax data,
  drag-to-reorder **rows**, responsive column collapse, undo/redo, freezing arbitrary data
  columns, or Tabulator's ready-made formatters (progress bar, star rating, traffic light).

## Errors & the log

Report failures with `persephone.notify(message, "error")` — they're toasted **and**
appended to **`ui.log`** in this folder (the **Show-log** button in the in-board toolbar
opens it). Persephone also logs board *load* failures there automatically: navigation
errors, CSP violations, and uncaught script errors / unhandled rejections — and it mirrors
every **`console.error`** / **`console.warn`** from the board's frames into the log
(`console.log`/`info` are not mirrored), so runtime problems your code or a library reports
via the console are reviewable without DevTools. The log starts
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
MCP tool instead — the tool returns only after the reloaded main frame has finished
loading, so a `browser_snapshot` right after it sees the new content.

**`board-manifest.json` is the exception — a reload does not pick it up.** Persephone reads a
board's manifest when the board becomes trusted and caches it from then on, so a manifest edit
(new `fileMasks`, a changed `editorPriority`, adding `editorSources`) takes effect only after
toggling the board's trust off and on, or restarting the app. A reload that appears to ignore a
manifest change is this, not a broken manifest.

## Testing & automation (for an AI agent)

Once the user has opened this board in Persephone, an agent can drive it with the
**`browser_*` MCP tools** (Playwright-compatible) to test and debug it:

- `list_pages` → find this board (`editor: "board-view"`, with its `selectedBoard`)
  and read its `pageId`.
- `browser_snapshot { pageId }` → read the page's accessibility tree (element refs).
- `browser_click` / `browser_type` / `browser_press_key` / `browser_evaluate` →
  interact, using the refs from the snapshot.
- **Secondary views** (if this board declares any): every `browser_*` call targets the main
  frame by default. `browser_tabs { pageId, action: "list" }` lists the main view (`index: 0`,
  id `"main"`) + one tab per secondary view (id `board-secondary:<viewId>`);
  `browser_tabs { pageId, action: "select", index: N }` points every subsequent call at that
  frame, so `browser_snapshot` then reads THAT frame's DOM and `browser_click` / `browser_type`
  drive it. Persephone auto-opens the view's sidebar panel and waits for it to render — the call
  always succeeds, even if the panel was closed (no "frame not mounted" error). `index: 0`
  returns to the main view. All frames share `persephone.state.*`, so a change in one is visible
  when you snapshot another.

**Verify visually, not just structurally.** The accessibility snapshot includes elements that
are invisible on screen (zero-height, overridden `display`, below the fold), so a snapshot that
"looks right" does not prove the board renders right. After UI changes, take a
`browser_take_screenshot { pageId }` and inspect the image before declaring the UI correct.
Two classic CSS traps a snapshot won't catch: the `[hidden]` attribute loses to any explicit
`display` rule (add `[hidden] { display: none !important; }` if you style displays), and a
textarea sized by script before layout collapses to zero height (prefer CSS
`field-sizing: content` for auto-growing inputs).

The board must be **open** (the user opens it; an untrusted project won't render).
Navigation tools don't apply — a board is a fixed document; `browser_tabs` selects among its
frames (main + secondary views) rather than creating/closing tabs.

## More examples — the bundled Demo board

Persephone ships a full **Demo board** that exercises the whole surface — the
`persephone.execute()` channel (buffered / streaming / stdin / kill / cwd), the
integration tier, the `--p-*` theme + token contract, secondary views + shared state
(`persephone.state.*`), and a tabbed multi-view layout with a pinned output console. When you
need a richer reference than this starter,
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
- av-grid (the default data grid) API reference:
  https://raw.githubusercontent.com/andriy-viyatyk/av-grid/main/docs/api.md
