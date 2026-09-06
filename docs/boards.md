[← Home](./index.md)

# Boards

Boards let you build fully custom HTML-page applications that can live anywhere on disk and run local scripts on demand. The UI is yours to author as plain HTML — Persephone hosts the page and wires one bridge object, `window.persephone`, so your page can call scripts and show native dialogs.

> **Target audience:** This guide is for users who want to create and use boards. For AI-agent builders, the per-board `CLAUDE.md` inside each board folder is the primary authoring reference.

---

## Concepts

### What is a board?

A board is a small web app stored in any folder on your machine — it is identified by a `board-manifest.json` file in the board's root folder. When you open a board in Persephone, the page renders in a sandboxed context — isolated from the host application — and receives a single injected `persephone` bridge object.

The three parts:

| Part | What it is |
|------|-----------|
| **Frontend** | `index.html` + your CSS/JS. Owns all UI and state. |
| **Backend** | Scripts in `scripts/` (any language — `.js`, `.py`, `.ps1`, `.sh`, …). They run as real OS processes with your privileges. |
| **Channel** | `persephone.execute(commandLine)` — or `persephone.executeNode(script, args?)` to guarantee a Node backend with nothing installed on your machine (see below). The page calls a script, the script prints JSON to stdout, the page parses it and renders. |

### Where do boards live?

Boards can live **anywhere on disk** — any folder containing a `board-manifest.json` file is a board. Persephone creates this file automatically when scaffolding a board.

### Board trust gate

Because `persephone.execute()` runs programs with your full user privileges, **each board must be explicitly trusted** before it renders or any script runs. Persephone shows a warning dialog that states this plainly — exactly like VS Code workspace trust.

- **Boards you create** (via **"New board"**, `app.boards.createBoard()`, or the `boards.createBoard` call path) are **auto-trusted immediately** — no prompt appears.
- **Foreign boards** (any board Persephone did not create for you) show a **Trust board** dialog on first open:

  > *"Trusting this board lets it run programs on your computer with your full user privileges — including reading and changing your files and using any signed-in command-line tools (cloud CLIs, git, etc.). Only trust boards you created or fully understand. If you're not sure about a board, ask your AI agent to review its scripts before trusting it."*

- **Trust is per board** (per board root folder), remembered across app restarts. Once trusted you are not prompted again. Trust is stored in `%AppData%\persephone\data\trustedBoards.txt`.
- **Inherited trust** — when a folder is trusted, every board nested inside it is trusted automatically. You are never prompted for a board that lives within an already-trusted folder.

> Only trust boards you created or fully understand — trusting lets the board's scripts run programs and access files with your Windows user account's privileges.

---

## Getting started

### 1. Create a board

**From the Boards panel (recommended):** open any folder in the **File Explorer** sidebar, then click the **Boards** button in the Explorer header to open the Boards panel. Click **New board** — a dialog opens asking for a folder and a name. The folder defaults to the current Explorer root (you can change it or browse to another location). A live label previews the final path. Click **Create** and the board is scaffolded, trusted, and opened in a single step.

To install a full working demo board instead, click the caret on the **New board** split-button and choose **Create Demo board**.

**From scripting or an AI agent:**
```javascript
// Create a blank board in any folder — auto-trusted at creation
const root = await app.boards.createBoard("My Board", "C:/work/boards");
await app.boards.openBoard(root);

// Or scaffold from the Demo template
const root = await app.boards.createDemoBoard("Demo", "C:/work/boards");
await app.boards.openBoard(root);
```

The board opens immediately after creation.

### 2. Open an existing board

- **Boards panel** — click the **Boards** button in the Explorer header. All trusted boards under the current root are listed as a tree. Click any board name to open it in the current tab. Right-click a board for **Open in New Tab** — opens it in its own dedicated tab instead of replacing the current tab's content, so its iframe (and any dev-server process it spawned) keeps running while you work in other tabs. A board whose spawned processes are still running (via `persephone.setBoardBusy(true)` — see [Long-running processes](#long-running-processes-setboardbusy--getboardbusy--getjobs)) shows a green **running** dot next to its name, even after its tab has moved on to something else.
- **File Explorer panel** — rows for `board-manifest.json` files show an **Open Board** button (board icon) directly in the row. Click it to open that board. (Clicking the row itself opens the JSON in Monaco.)
- **Tools & Editors panel → Boards tab** — lists all trusted boards, grouped by folder, across all locations. Click a board to open it in a new tab. Pin a board to make it appear in the top pinned section and in the **+** (add page) dropdown. Click **Open in new tab** in the panel header for a full-page version of the same hub, with an additional **Search boards** tab for discovering and installing boards published by the project — see [Published boards catalog](#published-boards-catalog--discover-install-update) below.
- **In-board toolbar** — when a board is open, click the board path label in the toolbar to open the boards-switcher popover and jump to another board under the same Explorer root.
- **Scripting / agent** — call `app.boards.openBoard(boardRoot)` with the absolute path to the board's root folder.

### 3. Edit and reload

Boards do **not** reload automatically when files change. To apply edits to `index.html`, `app.js`, or any `.js`/`.css`, click the **Reload** button in the in-board toolbar. AI agents editing board files should call `pages[pageId].editor.reload()` and then re-run `pages[pageId].editor.snapshot()` to see the updated board.

---

## In-board toolbar

Every open board displays a thin toolbar above the board's content area. The toolbar provides quick access to board operations without leaving the board view.

| Control | Description |
|---------|-------------|
| **File Explorer** (folder icon) | Open the File Explorer panel rooted at the board's parent folder. |
| **Board path label** | Shows the full path to the board's folder. When the board was opened from a Boards panel, clicking the path opens a **boards-switcher popover** listing all trusted boards under the same Explorer root — click any board to switch to it in the current tab without spawning a new one. When the board was opened standalone (e.g. from the Tools & Editors tab or via a script), the path label is non-interactive. |
| **Reload** (refresh icon) | Remount the board to pick up edited files (`index.html`, `app.js`, CSS, etc.). |
| **Show log** (log icon) | Open the board's `ui.log` file in a new tab so you can inspect errors and the board load line. |

The boards-switcher popover shows the same tree as the **Boards** Explorer-sibling panel — trusted boards under the current Explorer root, organized as a folder tree with VSCode-style single-child folder compaction.

---

## Default right-click menu

Right-clicking inside a board's content works exactly like right-clicking anywhere else in Persephone, with no setup needed from the board author:

| Right-click target | Menu items |
|---------------------|------------|
| A link | **Open Link**, **Copy Link** |
| An image | **Open Image in New Tab**, **Copy Image**, **Save Image As…** |
| A text field, text area, or editable region | **Cut** / **Copy** / **Paste**, depending on whether there's a selection and whether the field is read-only |
| Selected text (not in an editable field) | **Copy** |

**Open Image in New Tab** opens the image in Persephone's Image Viewer as its own tab, the same way opening an image file normally does. **Save Image As…** shows the native Save dialog and writes the file to disk.

If a right-click doesn't match any of the above (for example, empty space with nothing selected), no menu appears — the board's own page just gets a normal right-click with nothing added.

A board that wants to draw its own custom right-click menu instead can call `event.preventDefault()` in its own `contextmenu` handler; Persephone's default menu only appears when the event reaches it unhandled.

---

## The board bridge — `window.persephone`

The only Persephone-specific API a board sees is `window.persephone`. Everything else is plain web development.

### `persephone.execute(commandLine, options?)`

Runs a command on your machine and returns a process handle:

```js
// Options: cwd (default = board folder), env, shell, name
const handle = persephone.execute("node scripts/load.js");
```

**Buffered — collect all output at once:**

```js
const data = await handle.getJson();           // parse stdout as JSON; reject on non-zero exit
const text = await handle.getText();           // stdout as string
const bytes = await handle.getBytes();         // stdout as Uint8Array
```

`getJson()` rejects if the process exits with a non-zero code or if the output cannot be parsed. The rejection error is a `RunnerError` (`err.name === "RunnerError"`) with `exitCode` and `stderr` properties, so you can tell a process failure apart from any other error your own code might throw.

**Pattern extraction** — useful when a script's stdout mixes your result with other output:

```js
// Script emits: @@RESULT@@{"items":[...]}
const data = await handle.getJson(/@@RESULT@@(.*)/);
```

**Streaming — receive output as it arrives:**

```js
handle.on("stdout", chunk => console.log(chunk));
handle.on("stderr", chunk => console.error(chunk));
handle.on("exit", info => console.log("exit code:", info.exitCode));
handle.on("error", err => console.error(err));
```

**Sending input and stopping:**

```js
handle.write("hello\n");    // write to stdin
handle.endStdin();          // close stdin (signals EOF to the script)
handle.kill();              // terminate the process
```

> **Buffered vs streaming:** choose one per handle — mixing them throws an error. For a simple request-response pattern, use `getJson()` / `getText()`; for long-running or progress-reporting scripts, use `on(...)`.

### `persephone.executeNode(script, args?, options?)` — a guaranteed Node backend

`persephone.execute("node script.js")` only works if the **user's machine** happens to have Node installed — a board you build (or one someone else installs from the [published catalog](#published-boards-catalog--discover-install-update)) can't rely on that. `executeNode` instead runs the script on **Persephone's own bundled Node runtime** — the same Node build the app itself ships with — so it works on any machine with **zero setup**, no Node or Python install required:

```js
const handle = persephone.executeNode("scripts/query.mjs", ["arg1", "arg2"], { cwd, env, name });
```

- **`script`** — a path relative to the board folder (or absolute). Prefer a `.mjs` extension for explicit ES modules — boards ship no `package.json`, so Node's automatic module-type detection is the only other signal.
- **`args`** — an array of strings passed **argv-style, with no shell involved**. A value containing spaces (e.g. `"a b"`) always arrives as a single argument — no quoting rules to get right, and no shell-injection risk. The `options.shell` setting exists only for symmetry with `execute()`; `executeNode` always ignores it and never runs through a shell.
- **`options`** — same shape as `execute()`: `cwd` (defaults to the board folder), `env`, and `name` (the re-association key for `getJobs()`, same as below).
- **Returns the same handle** as `execute()` — buffered (`getText()` / `getJson()` / `getBytes()`), streaming (`on("stdout"|"stderr")`), and `write()` / `endStdin()` / `kill()` all behave identically.
- The runtime is **Node 24**, with **`node:sqlite` built in** (including FTS5 full-text search) — a board can query a SQLite database with zero `npm install`.
- If the script file doesn't exist, the handle fires an `error` event with a clear message (`Node script not found: <path>`) instead of a cryptic process failure.

**Resident backend server** — since the handle keeps stdin open for writing, a board can spawn **one long-lived script for the whole session** and send it requests as JSON lines, instead of paying a fresh process spawn for every operation:

```js
const srv = persephone.executeNode("scripts/db-server.js", [dbPath], { name: "db" });
srv.on("stdout", chunk => handleJsonLine(chunk));               // e.g. {id, columns, rows} or {id, error}
srv.write(JSON.stringify({ id: 1, sql: "SELECT ..." }) + "\n");  // per request — no re-spawn, db stays open
```

One spawn when the board opens; after that, each request costs only its own work (e.g. a SQLite query against an already-open, warm database). Pair this with `setBoardBusy(true)` (see below) so the server survives a board reload, and re-attach to it by `name` via `getJobs()`.

### Long-running processes: `setBoardBusy()` / `getBoardBusy()` / `getJobs()`

By default, a board's spawned processes are **killed whenever the board unloads** — the user navigates the page to something else, or clicks **Reload**. A board that starts a dev server, watcher, or any process meant to keep running opts out with the busy flag:

```js
// Start a long-running process and name it
persephone.execute("npm run dev", { name: "backend" });
persephone.setBoardBusy(true);

// On every board startup — re-enter "running" mode if a previous lifetime left work running
if (await persephone.getBoardBusy()) {
    const jobs = await persephone.getJobs();
    const backend = jobs.find(j => j.name === "backend");
    if (backend) showRunningUi(backend);              // backend.kill() stops it
    if (jobs.length === 0) persephone.setBoardBusy(false); // nothing survived — reset the flag
}

// Stop it
backend.kill();
persephone.setBoardBusy(false);
```

- **`persephone.setBoardBusy(true)`** — declares "my processes must outlive me". While busy, unloading the board (navigating its page elsewhere, or **Reload**) leaves its processes running. They are still killed when the page/tab is closed, when Persephone quits, or after you call `setBoardBusy(false)` and the board next unloads.
- **`persephone.getBoardBusy()`** → `Promise<boolean>` — the flag itself survives a reload (it lives in the app, not the board's JS). Read it on startup to know whether you should re-enter "running" mode.
- **`persephone.getJobs()`** → `Promise<PersephoneJobInfo[]>` — this board's currently live jobs, including ones spawned by a previous lifetime of the board (the board's own JS state, including any `execute()` handles, does not survive a reload). Each entry has `jobId`, `command`, the optional `name` you gave it, and `kill()` / `write()` / `endStdin()`. Surviving jobs are **control-only** — there is no `stdout`/`stderr`/`exit` streaming for them (their output went to the previous lifetime; anything a process prints while the board is unloaded is dropped). Poll `getJobs()` if you need to notice a job has exited.
- **Name your long-running jobs** — pass `{ name: "backend" }` to `execute()`. The name is the re-association key `getJobs()` uses after a reload, since a board cannot rely on `localStorage` to remember an old `jobId` (board storage does not persist across app restarts).

A busy board still shows a green **running** dot next to its name in the **Boards** panel, so a process left running in the background stays discoverable.

**Related but different:** opening a board with **Open in New Tab** (see [below](#2-open-an-existing-board)) keeps the whole board — iframe and all — alive in its own tab. `setBoardBusy()` is for the opposite situation: you replaced the board's tab with something else (or reloaded it) and only need its *processes*, not the board UI, to survive.

### Integration methods

These handle in-app effects that `execute()` cannot express:

| Method | Description |
|--------|-------------|
| `persephone.notify(message, type)` | Show a toast. `type`: `"info"`, `"success"`, `"warning"`, or `"error"`. Errors are also appended to `ui.log`. |
| `persephone.openRawLink(href, options?)` | Open a file or URL in a new Persephone tab. Pass `{ editor }` (e.g. `{ editor: "md-view" }`) to request a specific editor — for example, render a Markdown doc instead of opening its source; falls back to the default editor when omitted. |
| `persephone.openFileDialog(params?)` | Show a native Open File dialog; returns the selected path. |
| `persephone.saveFileDialog(params?)` | Show a native Save File dialog; returns the chosen path. |
| `persephone.openFolderDialog(params?)` | Show a native Open Folder dialog; returns the selected path. |
| `persephone.readFile(path, options?)` | Read a file and return its contents (Promise). A relative `path` resolves against the board folder; absolute reads anywhere. Text by default; `{ encoding: "binary" }` returns a `Uint8Array` (the right choice for binary files — app 4.0.21+), `{ encoding: "base64" }` a base64 string. |
| `persephone.writeFile(path, data, options?)` | Write a file (Promise); creates parent folders. A relative `path` resolves against the board folder. Text by default; `{ encoding: "binary" }` takes a `Uint8Array`, `{ encoding: "base64" }` a base64 string. |

### `persephone.call(path, options?)`

Trusted Boards can resolve the bounded AiVision object model from the page hosting the Board:

```js
const source = await persephone.call("page.grouped.content");
const matches = [...source.matchAll(/TODO\w*/g)].map((m) => ({ match: m[0], index: m.index }));
await persephone.call("page.grouped.content", { value: JSON.stringify(matches, null, 2) });
```

The method always suppresses hints and returns only a JSON-safe shaped value. `args` calls the final
method, `value` assigns a writable property, and `maxLength` bounds strings; `args` and `value` are
mutually exclusive. Calls reject as `Error` on resolver, transport, timeout, or trust failures.
Trust is checked at resolution time, and existing descriptor restrictions still apply. Calls remain
anchored to the Board's hosting page even when another tab becomes active.

Use `readFile`/`writeFile` to persist small board state (last filter, column layout, selected item) or load a board-local config — no backend script needed:

```js
// Persist UI state
await persephone.writeFile("state.json", JSON.stringify(state));
// Restore on next launch (handle first-run "file not found")
let state = {};
try { state = JSON.parse(await persephone.readFile("state.json")); } catch {}
```

Pair the dialog methods with `execute()`: the dialog returns a path, your script does the work:

```js
const path = await persephone.openFileDialog({ title: "Open CSV" });
if (path) {
    const data = await persephone.execute(`node scripts/load.js "${path}"`).getJson();
    renderTable(data);
}
```

### Theme

Persephone injects the app's current theme as CSS variables on `<html>` and keeps them live as the user switches themes:

```css
body { background: var(--p-bg); color: var(--p-text); }
button { background: var(--p-accent); color: var(--p-accent-text); }
```

The board template ships with a `board-base.css` (linked first in `index.html`, copied into every **new** board at creation) that applies sensible defaults — page background, text color, monospace font, themed scrollbars, a themed focus ring, and styled checkboxes — all from `--p-*`. Build your own styles on top.

`board-base.css` also ships an **opt-in "Persephone chrome" layer**: ready-made classes for toolbars and controls, sized and colored to match the app exactly, so a board built from them looks built-in rather than embedded. They fire only when you put the class on an element — a bare `<button>` or `<input>` is untouched, which keeps a vendored library's own controls (av-grid, Flatpickr, Tom Select) styled by their own skin instead.

| Class | What it is |
|-------|------------|
| `.p-toolbar` | 30px chrome bar on `--p-bg-dark` with a bottom rule. Add `data-orientation="vertical"` for a side rail (right border instead, no min-height). |
| `.p-btn` | Button — 26px on a page, 24px inside a `.p-toolbar` automatically. Modifiers: `primary` (the one filled/accent button in a bar), `ghost` (transparent), `danger`, `link`, `selected` (toggled/active state), `icon` (square, for a lone glyph), `sm` (24px anywhere), `md` (keep 26px inside a bar), `on-dark` (toolbar-style fill outside a toolbar). |
| `.p-input`, `.p-select` | Text field / dropdown, sized to line up with `.p-btn` — same 26px / 24px pair and the same `sm` / `md` modifiers. |
| `.p-sep` | Vertical hairline separating toolbar groups. |
| `.p-spacer` | Pushes everything after it to the right edge of the toolbar. |
| `.p-toolbar-title` | Label/caption text inside a toolbar (a board title or breadcrumb, not a control). |

The numbers are ported from the app's own UIKit, so controls come out the same size Persephone uses everywhere else — a fixed height with horizontal padding only; adding vertical padding is the most common way to end up with an oversized bar. The size split matters: Persephone's own editor toolbars are built from *small* (24px) buttons, and the 26px medium size belongs on a page or in a dialog, so a bar of medium buttons looks plausible in isolation and oversized next to the app's chrome. Putting `.p-btn` in a `.p-toolbar` applies the small tier for you. See the **Theming** tab of the Demo board (`assets/demo-board/`) for a live, working example of the whole set.

**Existing boards are unaffected** — this only changes what a **newly created** board's `board-base.css` contains. A board created before this layer was added keeps the copy of `board-base.css` it was created with; copy the file (or its rules) in from a fresh board's template if you want the chrome classes in an older board.

The app's theme shortcuts — **Ctrl+Alt+]** (next theme) and **Ctrl+Alt+[** (previous) — work with focus inside a board, so you can cycle themes to check a board's styling without clicking back into the app first. A board that binds either combination itself takes precedence.

**Full token list:**

| Group | Variables |
|-------|-----------|
| Colors | `--p-bg`, `--p-panel`, `--p-bg-dark`, `--p-overlay`, `--p-hover`, `--p-tree-selection`, `--p-border`, `--p-border-light`, `--p-text`, `--p-text-muted`, `--p-text-strong`, `--p-accent`, `--p-accent-text`, `--p-accent-hover`, `--p-selection-bg`, `--p-selection-text`, `--p-link`, `--p-error`, `--p-success`, `--p-warning`, `--p-scrollbar`, `--p-scrollbar-thumb`, `--p-shadow` |
| Spacing | `--p-space-xs`, `--p-space-sm`, `--p-space-md`, `--p-space-lg`, `--p-space-xl`, `--p-space-xxl` |
| Gap | `--p-gap-xs`, `--p-gap-sm`, `--p-gap-md`, `--p-gap-lg` |
| Radius | `--p-radius-sm`, `--p-radius-md`, `--p-radius-lg` |
| Font | `--p-font-base`, `--p-font-sm`, `--p-font-lg`, `--p-size-icon` |

To render **Persephone-style chrome** (title bars, sidebar panels, grid headers), use `--p-bg-dark` — the app's actual chrome surface, darker than `--p-panel` (which is an input/lighter-surface color) — together with `--p-hover` (hover background for list items/buttons) and `--p-tree-selection` (selected-row background).

**Theme in JavaScript** — for libraries that color themselves from JS (charts, diagrams):

```js
// At init — load-time snapshot (goes stale after a theme switch):
const palette = persephone.theme.vars;    // { "--p-bg": "#...", ... }
const isDark = persephone.theme.isDark;

// Live — always the current theme:
const live = persephone.getTheme().vars;

// React to theme switches:
persephone.onThemeChange(newPalette => {
    chart.update({ backgroundColor: newPalette["--p-accent"] });
});
```

> **Important:** `persephone.theme` is a snapshot taken at page load. After an in-session theme switch it goes stale. Always re-read from the `onThemeChange` callback argument or call `persephone.getTheme()`.

---

## Board folder layout

A board can live anywhere on disk — the layout is the same regardless of location:

```
My Board/                  ← board root folder (display name = folder name)
  board-manifest.json      ← board identity file (created automatically)
  CLAUDE.md                ← authoring guide (for you or an AI agent)
  ui.log                   ← error log — review when something breaks
  index.html               ← entry point (required at the board root)
  app.js                   ← your frontend JS
  style.css                ← your styles
  board-base.css           ← theme defaults (copy from the template)
  scripts/
    hello.js               ← a backend script
```

- `board-manifest.json` is the identity file that tells Persephone this folder is a board. Never delete it.
- The folder name is the board's display name. Rename the folder to rename the board.
- `index.html` at the board root is the only other structural requirement — everything else is your choice.

---

## Custom editors — associate a board with a file type

A board can register itself as an **editor for a file type**. When you open a matching file, the board appears in the toolbar's editor-switch control right next to the file's normal editor(s) (Text Editor, Grid, Preview, …) — click it to flip between them, exactly like switching between any other pair of editors. Depending on the board's settings, it can also become the **default** editor that opens automatically for that file type.

Declare the association with fields in `board-manifest.json`:

```json
{
  "fileMasks": ["*.drawio"],
  "editorPriority": 100,
  "editorName": "DrawIO",
  "editorKind": "content-host"
}
```

| Field | Purpose |
|-------|---------|
| `fileMasks` | One or more glob masks matched against the file's name — `*` matches any run of characters, `?` matches a single character. A bare extension (e.g. `drawio` or `.drawio`) is treated the same as `*.drawio`. A mask with no wildcard but a dot inside it is an **exact file name** — `"DASHBOARD.md"` claims files named exactly that, not every `.md` file. Masks also support compound extensions, e.g. `*.grid.json`. |
| `folderMasks` | Optional — one or more glob masks matched against the file's *parent folder*, narrowing where `fileMasks` applies. See [Scoping to a folder](#scoping-to-a-folder--foldermasks) below. |
| `editorPriority` | A number that decides whether the board also becomes the **default** editor for matching files (not just a switch option). Persephone's built-in editors each sit at their own priority level; set a value higher than the built-in editor for that file type to make the board the one that opens automatically. Ties go to the built-in editor. Omit it (or leave it `0`) and the board is offered only as a switch option — the built-in editor keeps opening by default. Built-in priority levels: Text Editor `0`, Markdown Preview `10`, compound-name editors such as `*.grid.json`/`*.note.json` `20`, Drawing `50`, PDF/image/archive/video viewers `100`. For example, a board claiming `.md` files (like the `folderMasks` example below, which uses `fileMasks: ["DASHBOARD.md"]`) needs `editorPriority` **above 10** to open by default — Markdown Preview now claims that slot, not the Text Editor's floor of `0`. |
| `editorName` | The label shown for the board in the editor-switch control. Falls back to the board's folder name if omitted. |
| `editorKind` | Optional — `"simple"` (default, if omitted) or `"content-host"`. Decides *how* the board gets the file's content. See [Simple editors](#simple-editors--reading-the-file-directly) and [Content-host editors](#content-host-editors--sharing-persephones-file-with-the-board) below. |
| `editorSources` | Optional — `"local"` (default, if omitted) or `"any"`. A **simple** board only handles a plain local file by default; set `"any"` to also have it offered for a file inside an archive (e.g. `archive.zip!doc.pdf`) or at an `http(s)` URL. Persephone materializes those non-local sources to a local cache file first, so the board's own code is unchanged — it still just calls `persephone.getFilePath()` and reads the returned path. Ignored by content-host boards, which already support non-local sources through `persephone.host.*`. The published **PDF Viewer** board uses this to open archive-embedded and remote PDFs the same way it opens local ones. |

**Requirements and behavior:**

- **The board must be trusted.** An untrusted board's file association is completely ignored — no switch option, no default-editor behavior — until you trust it. Un-trusting a board removes the association immediately.
- **The tab and icon follow the file, not the board.** When a board is opened as a file's editor, the page tab shows the **file's name** (not the board's folder name). Wherever that board wins as the file's *default* editor, its icon also replaces the generic file icon — in the File Explorer tree, other file lists, and page tabs (see [Board icon](#board-icon)).
- **Unsaved changes are protected.** Switching away from a modified built-in editor to a **simple** board runs the usual "Save changes?" prompt (Save / Don't Save / Cancel) before the switch happens, the same prompt used when navigating away from unsaved changes anywhere else in Persephone. A **content-host** board doesn't need this — its content transfers directly with nothing to lose (see below).
- A change to `fileMasks` / `folderMasks` / `editorPriority` / `editorName` / `editorKind` in the manifest takes effect the next time the board or trust list is refreshed, not while a page is already showing the board.
- **The full set of switch buttons stays visible while the board is active.** Whichever editor is currently showing — the board or one of the file's built-in editors — the same switch buttons appear in the same order, so you can jump directly from the board to any other available editor (e.g. Preview) without detouring through the Text Editor first.

### Scoping to a folder — `folderMasks`

By default, a board's `fileMasks` claim every matching file name, anywhere on disk. `folderMasks` narrows that to files that also sit in a matching folder:

```json
{
  "fileMasks": ["DASHBOARD.md"],
  "folderMasks": ["*/tasks"]
}
```

This claims only a `DASHBOARD.md` that lives directly inside a folder named `tasks` (for example `…/dev/tasks/DASHBOARD.md`) — any other `DASHBOARD.md` elsewhere on disk is left to Monaco (or whichever editor would normally open it).

**Matching rules:**

- Matched against the file's **parent folder**, case-insensitive, and either slash style (`/` or `\`) is accepted.
- A mask is anchored at the **end** of the path — it's a folder-path *suffix*, so it doesn't need to spell out the drive letter or every ancestor folder.
- `*` and `?` stop at a folder separator; `**` crosses them:
  - `*/tasks` — exactly one folder segment above `tasks` (matches `…/dev/tasks`, not `…/dev/sub/tasks`).
  - `tasks` — a folder named `tasks` at **any** depth.
  - `**/dev/tasks` — `dev/tasks` anywhere in the path, with any number of segments in between.
  - `c:/projects/acme/**` — anything under that tree (the tree root itself, `c:/projects/acme`, is not matched — only what's inside it).
- **Narrowing only.** `folderMasks` with no `fileMasks` registers nothing — there's nothing to narrow.
- **The board icon is the one exception.** A file-icon lookup (File Explorer tree, other file lists, page tabs) often has only a file *name*, no path, so it can't evaluate a folder scope — a folder-scoped board's icon still shows for every name-matching file, even outside the folder. Only the editor that actually **opens** the file (the default-editor choice and the editor-switch control) honors `folderMasks`; the icon is cosmetic.
- The Board Info page's **"Editor for"** row shows both `fileMasks` and, when present, `folderMasks`, and folder masks are carried through the [published-boards catalog](#published-boards-catalog--discover-install-update) alongside `fileMasks`.

### Simple editors — reading the file directly

This is the default (`editorKind` omitted or `"simple"`): the board reads and writes the associated file itself, directly on disk.

```js
const filePath = await persephone.getFilePath();   // undefined if the board was opened with no associated file
if (filePath) {
    const text = await persephone.readFile(filePath);
    // ... parse and render it ...
}
```

**Local files only.** Because the board handles the file itself, this only works for a real local file — a simple board is never offered as an editor for a file opened over `https://` or from inside an archive.

### Content-host editors — sharing Persephone's file with the board

Set `"editorKind": "content-host"` and Persephone builds the board **with the same file-handling machinery every built-in editor uses** — the content pipe, encoding detection, encryption, the auto-save cache, and dirty/unsaved-changes tracking (the tab's unsaved dot, the "Save changes?" prompt). The board never touches the disk directly; it works through a bridge instead:

```js
// Render the current content, and re-render whenever it changes externally
render(await persephone.host.getContent());
persephone.host.onContentChange((content) => render(content));

// Write a change back — marks the file modified and schedules the auto-save cache
persephone.host.setContent(newContent);

// Optional: the Monaco language id of the current content (e.g. "xml", "json")
const language = await persephone.host.getLanguage();
```

`persephone.host` is only meaningful on a content-host board — on a **simple** board, `getContent()`/`getLanguage()` reject (instead of hanging forever) and `onContentChange()` simply never fires, so feature-detect if your board needs to support either kind.

Three things a content-host board can do that a simple board cannot:

- **Works beyond local files.** It can open a file served over `https://`, an entry inside an archive, or an **encrypted** file — none of which a simple board supports.
- **Shares content live with other editors.** Switching from a content-host board to the Text Editor (or Grid) and back hands over the same live content, with no reload and no data loss. Edit the raw text in Monaco, switch back and the board re-renders from the edit; edit in the board and switch to Monaco to see it reflected there.
- **Works on an untitled page.** Create a new page and rename its tab to a name matching the board's `fileMasks` (e.g. `diagram.drawio`) — the board appears in the switch control right away, even though the page has never been saved to disk. Switch to the board and back without losing anything. A simple board can't do this: it reads and writes the file path directly, so it needs a file that already exists on disk.

**Same chrome as the built-in editor it replaces.** A content-host board's editor-switch control offers the exact same options its file's built-in editor would — including **Text Editor** (Monaco) even when the file's natural built-in viewer is something else (for example, a board for `*.drawio` files shows `Text Editor | Drawio`, matching what a built-in viewer for that file type would show). The board also gets the same footer row a built-in text editor shows: a **script** toggle that opens the [Script Panel](./scripting.md#script-panel) to run a script against the file's content, and the file's encoding with a provider icon (local file, HTTP, or Mneme).

**Footer status text:** a content-host board can put its own text in that same footer bar — call `persephone.setStatusText(text)` with any string, e.g. a **Todo board** (a published board that replaces Persephone's former built-in Todo editor — see [What's New](./whats-new.md)) showing its `"12 items"` count. Call it from the board's main view; pass `""` to clear it. It's a no-op on a **simple** board, which has no footer at all, so guard the call with `persephone.setStatusText?.(…)` if the same board also targets older Persephone builds.

**Saving:** press **Ctrl+S** (or **Cmd+S**) anywhere in the board and Persephone saves the file through the pipe automatically — no board code required. A board that wants to handle the keystroke itself can call `event.preventDefault()` in its own key handler to opt out, in which case the automatic save stands down. `persephone.host.save()` is also available if you want to trigger a save from your own UI (e.g. a Save button).

**Example:** the DrawIO diagram viewer board renders a `.drawio` file's XML read via `persephone.host.getContent()`, and re-renders whenever `onContentChange()` fires. Switch to the Text Editor to hand-edit the raw XML — switching back to the board re-renders the diagram from your edits immediately — and Ctrl+S saves through the pipe with no board code at all.

---

## Published boards catalog — discover, install, update

Persephone maintains a small **catalog of boards published by the project** — ready-made custom editors and tools you can install without building them yourself. The flagship example is the **PDF Viewer** board — it replaced Persephone's former built-in PDF viewer (see [Editors — PDF Viewer](./editors.md#pdf-viewer)), so PDF viewing is now a ~3.5 MB opt-in download instead of ~21 MB of pdf.js shipped to every installation. Other examples include a `.drawio` diagram viewer. The catalog is refreshed automatically in the background (roughly once a day) and can also be refreshed on demand.

### Discovering a board

- **From a file** — open a file whose type has no editor installed yet, but that matches a published board's file type. The editor-switch control at the top of the page shows an extra **+** entry next to **Text** (`Text | +`). Click it to open the **Board Info** screen for that board (or, if more than one published board matches the file type, a screen listing all of them).
- **From the hub** — open the **Tools & Editors** panel (App menu) and click **Open in new tab**, or open its **Search boards** tab directly. This full-page **Search boards** tab browses the whole catalog — filter by name, description, or file type — and works without any matching file open. A **Refresh catalog** button forces an immediate check instead of waiting for the next automatic cycle.

Each board's card in the **Search boards** tab shows a **screenshot** of the board alongside its name, version, size, description, and file types, so browsing the catalog looks like a gallery rather than a text list. The **Board Info** screen shows the same screenshot, in both its install and its properties view. A board with no screenshot — or a screenshot that can't be loaded (for example while offline) — shows a neutral placeholder in its place, so cards stay the same size either way. The catalog listing itself is cached and browsable offline, but screenshots are loaded from the internet on demand, so they fall back to the placeholder until you're back online.

### Installing a board — Download, then Register

Installing a published board is always two separate, explicit steps — nothing is ever trusted or executed on your behalf:

1. **Download** — the Board Info screen shows the board's name, version, description, file types, and download size, plus an install-location field (defaults to a Persephone data folder; **Browse…** to choose another). Clicking **Download** fetches the ZIP with a byte-progress bar, verifies its checksum, and extracts it to disk. **Nothing is trusted yet** — the downloaded board sits inert on disk, exactly like any other folder of files. This is the point at which you (or your AI agent) can open the folder and read its scripts before deciding to trust it.
2. **Register board** — once downloaded, the screen shows **"Downloaded — not registered"** with the folder's path and a reminder that you can ask your AI agent to review the board's files first. Clicking **Register board** shows the same **Trust board** dialog every board shows on first use (see [Board trust gate](#board-trust-gate) above). Only after you accept does the board become active — the file you opened switches to the new editor automatically, and the switch control now shows it (`Text | <Board Name>`) instead of `+`.

You can delete a downloaded-but-not-yet-registered board directly from this screen — nothing was ever trusted, so there's nothing to untrust.

### Board properties, updates, and rollback

Once a board is installed, the same **Board Info** screen switches to a **properties** view — reached from the **Boards** tab, the in-board toolbar's **Properties** button (info icon), the hub, or an update notification. It shows the board's description, author, install location, file-type association, trust state, and installed version, plus:

- **Versions** — the board's full published version history, newest first, fetched on demand. The version you have installed is marked **Current**; a newer compatible version is highlighted. Click **Update** (or **Install** on an older entry) to switch to that version — the swap is safe: your existing folder is only replaced once the new version has downloaded and verified successfully, so a failed download or a cancelled update never leaves you with a broken board. A version that needs a newer Persephone than the one you're running is shown disabled with a **"Requires Persephone ≥ X"** hint.
- **Uninstall** — removes the board's folder from disk and forgets it (untrust + unpin). This only appears for boards installed from the catalog; a board you (or an agent) created locally shows **Unregister** instead, which only forgets it — the folder is kept.
- **Open board** — switches back to the board itself.

**Update notifications:** when a compatible newer version is published, installed boards get a silent **"Update available"** badge in the **Boards** tab (with an **Update** action in its context menu) and a small dot on the board's in-board **Properties** button — no pop-up interruptions, just a quiet indicator you can act on when convenient.

If a board you're updating is currently open (or has background processes still running via `setBoardBusy`), Persephone asks you to close its pages first, with a **Close pages & continue** shortcut that does it for you (respecting any unsaved changes) and proceeds with the update.

> Updating or rolling back a board replaces its files, including any local edits you made by hand — there's no separate warning for that beyond the click itself.

### Checking for new boards

Persephone checks the catalog automatically, but you can force an immediate check from two places:

- The **Search boards** tab's **Refresh catalog** button.
- The **About** page's **Check for Updates** button — it now refreshes both the app-update check and the boards catalog in one click, and the About page shows an **Available boards** count reflecting the current catalog. See [Checking for Updates](./getting-started.md#checking-for-updates).

### Security model

The same trust rule that governs every board applies here without exception: **a board never runs anything until you explicitly click Register/Trust.** Downloading a board only copies verified, inert files to disk — no script runs, and it isn't offered as an editor until registered. This means you (or your AI agent, on your behalf) always have a window to inspect a downloaded board's files before deciding whether to trust it. See [Board trust gate](#board-trust-gate) for the trust dialog itself.

### Driving it from a script or AI agent

An AI agent can perform the whole discover → download → review → install → update lifecycle through the scripting API, with the same one-click trust rule holding throughout — the agent can never trust a board on your behalf.

| Method | Description |
|--------|-------------|
| `app.boards.list()` | List local trusted, installed, and open board roots. Read-only; does not query the remote catalog. |
| `app.boards.searchPublished(query?)` | Search the catalog by name/description/file type; each result is annotated with its install state. Read-only, no dialog. |
| `app.boards.getPublishedVersions(id)` | A board's full version history. Read-only, no dialog. |
| `app.boards.downloadPublished(id, opts?)` | Download + verify + extract a board **without trusting it** — the "can I trust this board?" entry point: download it, read its files, then decide. No dialog. |
| `app.boards.installPublished(id, opts?)` | Opens the Board Info screen for an interactive install (or drives an update/rollback if already installed and `opts.version` is given). |
| `app.boards.uninstallBoard(id)` | Removes an installed catalog board, after the usual delete confirmation. |
| `app.boards.checkPublishedUpdates(force?)` | Refresh the catalog and report which installed boards have an update available. No dialog. |
| `app.boards.registerBoard(boardRoot)` | Show the trust dialog for a board already on disk (e.g. one downloaded with `downloadPublished`); resolves to whether it ended up trusted. |
| `app.boards.unregisterBoard(boardRoot)` | Untrust a board (no dialog — untrusting only removes privilege). |
| `app.boards.renameBoard(boardRoot, newName)` | Rename a trusted board's folder, carrying its trust, pin, and catalog registration to the new path. |

See the [Scripting API Reference](./api/app.md#boards) for full method signatures, and ask your AI agent to `persephone://guides/boards` for the complete authoring/automation reference, including a checklist for reviewing a downloaded board's files before registering it.

> **Publishing a board to the catalog?** A `board-manifest.json` can declare `"screenshot": "screenshot.png"` (a file name, not a path) to give the board a screenshot on its catalog card and Board Info page. This only applies to boards published through the `persephone-boards` project — see that repository's own documentation for the full publishing contract.

---

## Secondary views — a board's own sidebar panel

A board isn't limited to the single main view in its tab. It can declare one or more **secondary views** — extra pages that show up as sidebar panels next to the board, kept in sync with the main view automatically. This is how an editor-style board offers a companion panel such as "Lists", "Outline", or "Details" alongside its main content, the same way built-in editors like the Notebook editor pair a main list with a sidebar panel.

- Secondary views are declared by the board itself (in its `board-manifest.json`, or added/removed while it runs) — there's nothing to configure as a user.
- Each declared view opens as its own sidebar panel while the board's tab is active, with the title the board gave it (its icon always matches the board's own icon).
- The main view and every secondary panel share state, so selecting something in a sidebar panel (e.g. picking a list) can instantly filter or update what the main view shows, and vice versa.
- Some of what a board puts in that shared state is remembered across app restarts and board reloads (a per-board author choice), so a selection you made can still be there next time you open the board.
- Closing the board's tab, or navigating it to something else, closes its secondary panels along with it — they aren't a way to keep the board running in the background (see [Long-running processes](#long-running-processes-setboardbusy--getboardbusy--getjobs) for that).

> **Building a board with secondary views?** See the board's own `CLAUDE.md` (or `persephone://guides/boards` for an AI agent) for the full `persephone.state.*` and `persephone.setSecondaryViews` reference. The bundled **Demo board** includes a working example.

---

## Environment variables — secrets outside the board folder

A board should never store secrets — connection strings, API keys, passwords — inside its own folder, because that folder is exactly what gets copied, shared, or committed to a repo. Persephone instead keeps a single, optional password-encrypted `.env.json` file **outside every board's folder**, with each board reading and writing only its own slice of it.

### What this does and doesn't protect

This is **not** a sandbox against a malicious board — a trusted board can already run arbitrary code (via `persephone.executeNode`) and could read any file on disk directly if it wanted to. What it actually solves:

1. **Secrets no longer live in the shareable board folder.** Copying, zipping, or committing a board no longer leaks its connection strings.
2. **Optional password encryption protects the file at rest** if the machine or the file itself is stolen.

Per-board isolation (a board can only read/write its own slice) is a convenience boundary that prevents accidental cross-board reads — not a security wall against a board that decided to misbehave. The [board trust dialog](#board-trust-gate) remains the actual gate: once a board is trusted, this feature is about tidy, out-of-folder secret storage, not about restricting a hostile board.

### Configuring the storage location

Open **Settings** and find the **Board Environment Variables** section:

| Control | Description |
|---------|-------------|
| Path display | Shows the configured `.env.json` path, or "Not configured yet". |
| **Browse...** | Point the setting at an already-existing `.env.json` file — a plain native Open File dialog. Nothing is created or overwritten. |
| **Create...** | Choose a path (defaults to Persephone's data folder) and create a new, empty file there. |
| **Unlink** | Clear the setting. The file itself is left untouched on disk. |
| **Open Environment Variables** | Opens the configured file in its built-in editor (disabled until a path is configured). |

If no path is configured yet, the first time any board calls `persephone.var.*` you'll instead see a one-time **"Create environment variables storage"** dialog with an editable default path — declining it makes that call fail (a well-behaved board handles this gracefully).

Encryption is entirely optional and reuses Persephone's existing file-encryption feature — encrypt or decrypt the `.env.json` file the same way you would any other text file, from its tab's right-click menu. The first time a board (or the editor) needs to read an encrypted, not-yet-unlocked file, Persephone prompts once per session for the password.

### The `.env.json` editor

Opening a `.env.json` file (from Settings, the File Explorer, or File → Open) shows a dedicated editor instead of raw JSON:

- **Left pane** — every namespace (board) currently stored in the file. Click one to select it; add a new namespace or delete an existing one from here.
- **Right pane** — profile tabs for the selected namespace (`default`, plus any custom profiles a board has written, e.g. `dev`/`qa`), and below them a grid of that profile's variable names and values. Values are shown in plain text — there's nothing to mask on your own local machine.
- Add, edit, or delete variables directly in the grid — range-select, copy/paste, and add-row all work the same as any other Persephone grid.
- Press **Ctrl+S** (or navigate away) to save; the file re-encrypts automatically on save if it was encrypted.
- A locked (encrypted, not-yet-unlocked) file shows an **Unlock** button instead of its contents.

### How a board reads and writes its own variables

From inside a board's own script (`app.js`):

```js
// Read one value (the "default" profile, unless env is given)
const server = await persephone.var.get("SNOWFLAKE_SERVER");

// Write a value into this board's OWN namespace
await persephone.var.set("SNOWFLAKE_USER", "my-user");

// List this board's variable names (not values) in a profile
const keys = await persephone.var.list();

// A named profile other than the default, e.g. "dev"
const devServer = await persephone.var.get("SNOWFLAKE_SERVER", "dev");

// Open the environment variables editor, scoped to this board
await persephone.var.show();
```

- `persephone.var.get(name, env?)` / `.set(name, value, env?)` / `.list(env?)` are always scoped to the **calling board's own namespace** — a board never passes a namespace, so it has no way to name and reach another board's variables.
- **Every call is async and can reject**: storage not configured and you declined to create it, the file is locked and you cancelled or entered the wrong password, or a store error. A board should handle rejection gracefully (e.g. show its own "please configure your connection" message) instead of assuming the call always succeeds.
- A board's namespace is its manifest's `author`/`name` (e.g. `"Persephone/Excel Viewer"`) when **both** fields are explicitly set in `board-manifest.json`; otherwise it falls back to the board's own root folder path. Changing `author`/`name` later re-namespaces the board and orphans its previously-stored variables — keep them stable once secrets are stored under them.

### Namespace collisions at registration

Two different boards can end up with the same `author`/`name` — for example, a developer's working copy of a board and its installed copy from the catalog. Registering (trusting) a board whose namespace already matches an already-registered board shows an advisory dialog naming the other board, with:

- **Register Anyway** — proceed; both boards will share the same stored variables.
- **Cancel** — stop, so you can give the new board a distinct `author`/`name` in its manifest before registering it again.

This only happens for `author`/`name` namespaces — a board using its root-path fallback can never collide with another board.

### Letting an AI agent configure a board's secrets for you

An agent can provision a board's environment variables ahead of time — for example, right after scaffolding a board that needs a database connection — using the `app.boardVars` scripting namespace, which (unlike `persephone.var.*`) can target **any** namespace:

```js
const root = await app.boards.createBoard("Snowflake Viewer", "C:/boards");
const namespace = await app.boardVars.namespaceFor(root);
await app.boardVars.set(namespace, "SNOWFLAKE_SERVER", "abc123.snowflakecomputing.com");
await app.boards.openBoard(root);
```

This means you can ask an agent to "build me a board that connects to Snowflake" and have it scaffold the board **and** configure its connection secrets in one go, without opening the `.env.json` editor by hand yourself. See [app.boardVars](./api/app.md#boardvars) for the full method reference.

---

## Board icon

Place an `icon.svg`, `icon.png`, or `icon.ico` in the board folder to set a custom icon. The icon appears in the page tab (when the board is open), the **Boards** Explorer panel, and the **Boards** tab of the Tools & Editors panel/hub. SVG is preferred; first match wins. Without an icon file, a default board glyph is shown.

If the board is also a [custom editor](#custom-editors--associate-a-board-with-a-file-type) and wins as a file type's **default** editor, its icon replaces the generic file-type icon everywhere that file type is listed — the File Explorer tree, other file lists, and page tabs — not just when the board itself is open.

---

## Error log (`ui.log`)

All board errors — script failures, bridge errors, and board load failures — are shown as a toast notification **and** appended to a `ui.log` file in the board folder. `console.error`/`console.warn` calls made by the board's own code are also mirrored there (as `[error]`/`[warn]` lines), so a misbehaving board's log gives a fuller picture even without a toast. Click **Show log** (log icon) in the in-board toolbar at any time to open `ui.log`. The log is reset to a single `board loaded` line on every board open or Reload, so it reflects only the current board lifetime — it never accumulates across sessions. Keep `catch` blocks in your board JS calling `persephone.notify(message, "error")` so failures are captured there.

---

## Offline-first and the CSP

A board's sandbox forbids remote network requests — the Content Security Policy (`connect-src 'self'`) blocks CDN scripts, stylesheets, fonts, and any `fetch` to an external host. **Download all component libraries into the board folder** and reference them with relative paths:

```html
<!-- Correct: relative path to a local copy -->
<script src="./lib/av-grid.umd.js"></script>

<!-- Wrong: blocked by CSP -->
<script src="https://cdn.jsdelivr.net/..."></script>
```

This keeps the board self-contained and offline-ready — it works with no network connection and is unaffected by CDN changes.

---

## Recommended components

Persephone publishes a catalog of components recommended for boards, with a pre-built **skin** (CSS or JS adapter) that restyles each component to match the app's `--p-*` theme. The catalog lives in the [`boards-assets/`](../boards-assets/) folder in the repository.

| Component | Use | Skin type |
|-----------|-----|-----------|
| [av-grid](https://github.com/andriy-viyatyk/av-grid) | **Data grid — the default.** Sort, filter, search + highlight, range select, clipboard, editing | none needed |
| [Tabulator](https://tabulator.info/) | Data grid — fallback, for grouping, tree data, pagination, export, variable row heights, … | CSS |
| [Chart.js](https://www.chartjs.org/) | Line, bar, pie, radar, scatter charts | JS adapter |
| [Flatpickr](https://flatpickr.js.org/) | Date / time / range picker | CSS |
| [Tom Select](https://tom-select.js.org/) | Rich select, tags, autocomplete | CSS |
| [marked](https://marked.js.org/) + [highlight.js](https://highlightjs.org/) | Markdown render with syntax highlighting | CSS |
| [Mermaid](https://mermaid.js.org/) | Diagrams from text (flowchart, sequence, Gantt, …) | JS adapter |
| [Split.js](https://split.js.org/) | Resizable layout panes | CSS |
| [SortableJS](https://sortablejs.github.io/Sortable/) | Drag-to-reorder lists and kanban boards | CSS |
| [Tippy.js](https://atomiks.github.io/tippyjs/) | Tooltips, popovers, dropdown menus | CSS |
| [Native `<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) | Modal dialogs — no library needed | CSS |

**To use a skin:**
1. Download the component's JS (and CSS if needed) into the board folder under `lib/`.
2. Copy the matching skin file from `boards-assets/` into the board folder as your own local copy.
3. Link the component's CSS first, then the skin CSS (the skin overrides the defaults). For JS adapters, load the adapter after the library and before your `app.js`.

The `boards-assets/manifest.json` file has machine-readable details — vendor URLs, tested versions, and skin type notes — that an AI agent can use to automate the setup.

**For tabular data, av-grid is the default.** It is a port of Persephone's own internal grid, so it matches the app's built-in grid editors, needs **no skin** (it reads the `--p-*` variables directly, so a theme switch re-tints it with no code), and renders more smoothly than Tabulator — noticeably so even on small tables. Tabulator remains in the catalog for the features av-grid does not have: variable row heights, row grouping, tree data, nested column headers, pagination, footer calculations, built-in export, remote data loading, row drag-reorder, undo/redo, and its library of ready-made cell formatters.

> **Skins are not guaranteed.** Each skin is stamped with the component version it was tuned for (e.g. `tabulator-tables@6.5.1`). If you vendor a newer version, test the board and patch your local copy where needed.

---

## AI-assisted board authoring

Boards are designed to be authored by an AI agent. The key workflow:

1. **Create or open a board.** Use the `boards.createBoard` or `boards.openBoard` call paths. Boards
   created this way are auto-trusted — no trust prompt blocks the agent.
2. **Discover the board** through `pages`; boards report `editor: "board-view"`, a
   `selectedBoard`, and (for standalone boards) a `boardRoot`.
3. **Read `CLAUDE.md`** inside the board folder — it documents the bridge API, theme contract,
   recommended-components catalog, and authoring conventions. The
   `persephone://guides/boards` resource contains the board authoring reference.
4. **Edit files** and call `pages[pageId].editor.reload()` to pick up changes. Boards do not reload
   automatically; after reloading, call `pages[pageId].editor.snapshot()` to inspect the result.
5. **Test the board** using `pages[pageId].editor`:

```
pages["abc"].editor.snapshot()
pages["abc"].editor.click({ ref: "e12" })
pages["abc"].editor.evaluate("document.querySelector('#result').textContent")
```

`pages["abc"].editor.evaluate(...)` is useful for testing `persephone.execute()` from the agent
side without modifying source files.

### Board call paths

| Call path | Parameters | Description |
|-----------|------------|-------------|
| `boards.createBoard` | `name`, `dir`, `demo?` | Create a board in `<dir>/<name>`; returns `boardRoot` and auto-trusts the result. |
| `boards.openBoard` | `path` | Open an existing board and return its page id and title. |
| `pages[pageId].editor.reload` | none | Reload a board after editing its files; returns the refreshed frame state. |
| `persephone://guides/boards` | — | Board authoring and review reference. |

---

## Managing boards

| Action | How |
|--------|-----|
| Create a board | **Boards** panel → **New board** (or caret → **Create Demo board**) |
| Create a board (script) | `await app.boards.createBoard("Name", "C:/path/to/dir")` |
| Open a board from Explorer | Click the **Open Board** button on a `board-manifest.json` row |
| Open a board from the Boards panel | Click the board in the **Boards** Explorer-sibling panel |
| Open a board in a new tab (keep it running) | Right-click the board in the **Boards** panel → **Open in New Tab** |
| Keep a board's spawned processes running after navigating away or reloading | Board calls `persephone.setBoardBusy(true)` — see [Long-running processes](#long-running-processes-setboardbusy--getboardbusy--getjobs) |
| See which boards have processes still running in the background | Look for the green **running** dot next to the board name in the **Boards** panel |
| Open a board from the sidebar | **Tools & Editors** panel → **Boards** tab → click the board |
| Open a board (script) | `await app.boards.openBoard("C:/path/to/board/root")` |
| Switch boards from inside a board | Click the board path label in the in-board toolbar → pick a board from the popover |
| Open File Explorer from inside a board | Click the **File Explorer** button (folder icon) in the in-board toolbar |
| Reload the board | Click the **Reload** button in the in-board toolbar |
| View the error log | Click **Show log** (log icon) in the in-board toolbar |
| Pin a board | In the **Boards** tab, hover the board row and click the pin button |
| Copy a board's folder path | Right-click the board in the **Boards** Explorer panel or the **Boards** tab → **Copy board path** |
| Remove / untrust a locally-created board | Right-click the board in the **Boards** tab → **Remove** |
| Delete a locally-created board | Right-click in the **Boards** Explorer panel → **Delete Board** |
| Rename a locally-created board | Rename the board's folder in the file system (Explorer, terminal, or the File Explorer sidebar), or ask an AI agent to rename it (`app.boards.renameBoard`) |
| Discover & install a board published by the project | Open a matching file and click **+** in the editor switch, or open the **Search boards** tab of the Tools & Editors hub — see [Published boards catalog](#published-boards-catalog--discover-install-update) |
| Update an installed catalog board | **Boards** tab → **Update available** badge / context menu, or the dot on the board's **Properties** button |
| Roll back an installed catalog board to an older version | Board's **Properties** screen → **Versions** list → **Install** on the older version |
| Remove an installed catalog board (deletes its folder) | Board's **Properties** screen → **Uninstall** |

---

## Demo board

The Demo board (`"Create Demo board"`) is a full working example that demonstrates:

- Buffered `execute()` — fetching JSON from a backend script
- Streaming `execute()` — a long-running script with live output
- Stdin / kill — sending input and stopping a process
- The integration tier — `notify`, `openFileDialog`, `openRawLink`
- The `--p-*` theme contract and JS token access
- A multi-tab layout with a pinned output console

Read its `index.html`, `app.js`, and `style.css` for a rich authoring reference — they are extensively commented.

The Demo board is created in the folder and with the name you specify in the **Create Demo board** dialog. The source template lives at `resources/assets/demo-board/` inside the Persephone installation folder (or at `assets/demo-board/` in the repository).


