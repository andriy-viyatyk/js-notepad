[← Home](./index.md)

# Boards

Boards let you build fully custom HTML-page applications that can live anywhere on disk and run local scripts on demand. The UI is yours to author as plain HTML — Persephone hosts it in a sandboxed webview and wires one bridge object, `window.persephone`, so your page can call scripts and show native dialogs.

> **Target audience:** This guide is for users who want to create and use boards. For AI-agent builders, the per-board `CLAUDE.md` inside each board folder is the primary authoring reference.

---

## Concepts

### What is a board?

A board is a small web app stored in any folder on your machine — it is identified by a `board-manifest.json` file in the board's root folder. When you open a board in Persephone, the page renders in a sandboxed webview — isolated from the host application — and receives a single injected `persephone` bridge object.

The three parts:

| Part | What it is |
|------|-----------|
| **Frontend** | `index.html` + your CSS/JS. Owns all UI and state. |
| **Backend** | Scripts in `scripts/` (any language — `.js`, `.py`, `.ps1`, `.sh`, …). They run as real OS processes with your privileges. |
| **Channel** | `persephone.execute(commandLine)`. The page calls a script, the script prints JSON to stdout, the page parses it and renders. |

### Where do boards live?

Boards can live **anywhere on disk** — there is no requirement to place them inside a `.persephone` project folder. The only structural requirement is a `board-manifest.json` file in the board's root folder (Persephone creates this automatically when scaffolding a board).

Boards you create inside a `.persephone` project folder continue to work exactly as before — they are just boards stored in a convenient default location. Boards outside a project are equally supported.

### Board trust gate

Because `persephone.execute()` runs programs with your full user privileges, **each board must be explicitly trusted** before it renders or any script runs. Persephone shows a warning dialog that states this plainly — exactly like VS Code workspace trust.

- **Boards you create** (via **"+ New board"**, `app.boards.createBoard()`, or the MCP `create_board` tool) are **auto-trusted immediately** — no prompt appears.
- **Foreign boards** (any board Persephone did not create for you) show a **Trust board** dialog on first open:

  > *"Trusting this board lets it run programs on your computer with your full user privileges — including reading and changing your files and using any signed-in command-line tools (cloud CLIs, git, etc.). Only trust boards you created or fully understand. If you're not sure about a board, ask your AI agent to review its scripts before trusting it."*

- **Trust is per board** (per board root folder), remembered across app restarts. Once trusted you are not prompted again. Trust is stored in `%AppData%\persephone\data\trustedBoards.txt`.
- **Bulk trust** — in the File Explorer, right-click the `.persephone` project node and choose **"Trust all boards in this project"** to trust all boards currently in that project at once. A confirmation dialog appears. Boards added to the project later remain untrusted until individually opened.

> Only trust boards you created or fully understand — trusting lets the board's scripts run programs and access files with your Windows user account's privileges.

---

## Getting started

### 1. Create a project (optional)

A `.persephone` project is a convenient way to group related boards, but it is not required. If you want one:

**From the File Explorer sidebar:**
1. Right-click any folder and choose **"Create .persephone project"**.
2. Persephone creates the `.persephone` folder and opens the **Board editor**.

**Manually:** create a `.persephone` folder yourself inside any project folder. When you next click it in the Explorer, Persephone opens the Board editor.

### 2. Create a board

**Inside a project:** in the Board editor's main view:
- Click **"+ New board"** — type a name, and Persephone scaffolds the board from the built-in template. The board folder is created at `.persephone/boards/<Name>/`.
- Or click **"Create Demo board"** (or the dropdown on **"+ New board"**) — Persephone installs a full working demo board that exercises every part of the bridge API, the theme contract, and a multi-tab layout.

**Anywhere on disk (scripting/agent):**
```javascript
// Create a blank board in any folder — auto-trusted at creation
const root = await app.boards.createBoard("My Board", "C:/work/boards");
await app.boards.openBoard(root);

// Or scaffold from the Demo template
const root = await app.boards.createDemoBoard("Demo", "C:/work/boards");
await app.boards.openBoard(root);
```

The board opens immediately after creation.

### 3. Open an existing board

- **File Explorer panel** — rows for `board-manifest.json` files show an **"Open Board"** button (board icon) directly in the row. Click it to open that board as a standalone tab. (Clicking the row itself still opens the JSON in Monaco.)
- **File Explorer panel** — click the `.persephone` node under any project folder to open the project Board editor with a board list.
- **Tools & Editors panel → Custom Boards & Editors tab** — lists all trusted boards grouped by folder. Click a board to open it. Pin a board to make it appear in the top pinned section and in the **+** (add page) dropdown.
- **Scripting / agent** — call `app.boards.openBoard(boardRoot)` with the absolute path to the board's root folder.
- **Boards sidebar panel** (when a project Board editor is open) — click any board name to switch to it.

### 4. Edit and reload

Edit `index.html` and the board reloads automatically (the app watches the file for changes). After editing `app.js` or other scripts, click the **Refresh** button in the Boards sidebar panel header to remount the page.

---

## The board bridge — `window.persephone`

The only Persephone-specific API a board sees is `window.persephone`. Everything else is plain web development.

### `persephone.execute(commandLine, options?)`

Runs a command on your machine and returns a process handle:

```js
// Options: cwd (default = board folder), env, shell
const handle = persephone.execute("node scripts/load.js");
```

**Buffered — collect all output at once:**

```js
const data = await handle.getJson();           // parse stdout as JSON; reject on non-zero exit
const text = await handle.getText();           // stdout as string
const bytes = await handle.getBytes();         // stdout as Uint8Array
```

`getJson()` rejects if the process exits with a non-zero code or if the output cannot be parsed. The rejection error includes `exitCode` and `stderr`.

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

### Integration methods

These handle in-app effects that `execute()` cannot express:

| Method | Description |
|--------|-------------|
| `persephone.notify(message, type)` | Show a toast. `type`: `"info"`, `"success"`, `"warning"`, or `"error"`. Errors are also appended to `ui.log`. |
| `persephone.openRawLink(href)` | Open a file or URL in a new Persephone tab. |
| `persephone.openFileDialog(params?)` | Show a native Open File dialog; returns the selected path. |
| `persephone.saveFileDialog(params?)` | Show a native Save File dialog; returns the chosen path. |
| `persephone.openFolderDialog(params?)` | Show a native Open Folder dialog; returns the selected path. |

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

The board template ships with a `board-base.css` (linked first in `index.html`) that applies sensible defaults — page background, text color, monospace font, and themed scrollbars — all from `--p-*`. Build your own styles on top.

**Full token list:**

| Group | Variables |
|-------|-----------|
| Colors | `--p-bg`, `--p-panel`, `--p-overlay`, `--p-border`, `--p-border-light`, `--p-text`, `--p-text-muted`, `--p-text-strong`, `--p-accent`, `--p-accent-text`, `--p-accent-hover`, `--p-selection-bg`, `--p-selection-text`, `--p-link`, `--p-error`, `--p-success`, `--p-warning`, `--p-scrollbar`, `--p-scrollbar-thumb`, `--p-shadow` |
| Spacing | `--p-space-xs`, `--p-space-sm`, `--p-space-md`, `--p-space-lg`, `--p-space-xl`, `--p-space-xxl` |
| Gap | `--p-gap-xs`, `--p-gap-sm`, `--p-gap-md`, `--p-gap-lg` |
| Radius | `--p-radius-sm`, `--p-radius-md`, `--p-radius-lg` |
| Font | `--p-font-base`, `--p-font-sm`, `--p-font-lg`, `--p-size-icon` |

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

A board can live anywhere — the layout is the same regardless of location:

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

When a board lives inside a project, the path is `.persephone/boards/My Board/` — the layout inside is identical.

- `board-manifest.json` is the identity file that tells Persephone this folder is a board. Never delete it.
- The folder name is the board's display name. Rename the folder to rename the board.
- `index.html` at the board root is the only other structural requirement — everything else is your choice.

---

## Board icon

Place an `icon.svg`, `icon.png`, or `icon.ico` in the board folder to set a custom icon. The icon appears in the page tab (when the board is open), the board list in the main Board editor, and the Boards sidebar panel. SVG is preferred; first match wins. Without an icon file, a default board glyph is shown.

---

## Error log (`ui.log`)

All board errors — script failures, bridge errors, and board load failures — are shown as a toast notification **and** appended to a `ui.log` file in the board folder. An on-board indicator opens `ui.log` when errors are present. Keep `catch` blocks in your board JS calling `persephone.notify(message, "error")` so failures are captured there.

---

## Offline-first and the CSP

A board's sandbox forbids remote network requests — the Content Security Policy (`connect-src 'self'`) blocks CDN scripts, stylesheets, fonts, and any `fetch` to an external host. **Download all component libraries into the board folder** and reference them with relative paths:

```html
<!-- Correct: relative path to a local copy -->
<script src="./lib/tabulator.min.js"></script>

<!-- Wrong: blocked by CSP -->
<script src="https://cdn.jsdelivr.net/..."></script>
```

This keeps the board self-contained and offline-ready — it works with no network connection and is unaffected by CDN changes.

---

## Recommended components

Persephone publishes a catalog of components recommended for boards, with a pre-built **skin** (CSS or JS adapter) that restyles each component to match the app's `--p-*` theme. The catalog lives in the [`boards-assets/`](../boards-assets/) folder in the repository.

| Component | Use | Skin type |
|-----------|-----|-----------|
| [Tabulator](https://tabulator.info/) | Data grid with sort, filter, range select, clipboard, editing | CSS |
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

> **Skins are not guaranteed.** Each skin is stamped with the component version it was tuned for (e.g. `tabulator-tables@6.5.1`). If you vendor a newer version, test the board and patch your local copy where needed.

---

## AI-assisted board authoring

Boards are designed to be authored by an AI agent. The key workflow:

1. **Agent creates or opens a board.** Use the MCP tools `create_board` / `open_board`, or the scripting API `app.boards.createBoard()` / `app.boards.openBoard()`. Boards created this way are auto-trusted — no trust prompt blocks the agent.
2. **Agent discovers the board** via `list_pages` — boards appear with `editor: "board-view"`, a `selectedBoard` field, and (for standalone boards) a `boardRoot` field.
3. **Agent reads `CLAUDE.md`** inside the board folder — the per-board authoring guide that documents the bridge API, the theme contract, the recommended-components catalog, and conventions. The MCP `read_guide("boards")` tool loads the complete board authoring guide.
4. **Agent edits files** and observes the live reload: `index.html` changes trigger an automatic reload; `app.js` / CSS changes require the **Refresh** button in the Boards sidebar panel.
5. **Agent tests the board** using the `browser_*` MCP tools (require [browser interaction enabled in MCP settings](./mcp-setup.md)):

```
// Find the board page
list_pages → { editor: "board-view", selectedBoard: "My Board", boardRoot: "C:/work/boards/My Board", pageId: "abc" }

// Inspect the DOM
browser_snapshot({ pageId: "abc" })

// Interact
browser_click({ pageId: "abc", ref: "e12" })
browser_evaluate({ pageId: "abc", expression: "document.querySelector('#result').textContent" })
```

`browser_evaluate` is especially useful for testing `persephone.execute()` from the agent side — inject a test call and check the result without modifying source files.

### MCP tools for boards

| Tool | Parameters | Description |
|------|-----------|-------------|
| `create_board` | `name`, `dir`, `demo?` | Create a blank board (or demo board when `demo: true`) in `<dir>/<name>`. Returns `{ boardRoot }`. Auto-trusted. |
| `open_board` | `path` | Open an existing board by its root folder path. Returns `{ opened: path }`. |
| `read_guide("boards")` | — | Load the full board authoring reference guide. |

---

## Managing boards

| Action | How |
|--------|-----|
| Create a board (in project) | Click **"+ New board"** in the Board editor main view |
| Create a demo board | Click **"Create Demo board"** or use the dropdown on **"+ New board"** |
| Create a board anywhere (script) | `await app.boards.createBoard("Name", "C:/path/to/dir")` |
| Open a board from Explorer | Click the **Open Board** button on a `board-manifest.json` row |
| Open a board from the sidebar | **Tools & Editors** panel → **Custom Boards & Editors** tab → click the board |
| Open a board (script) | `await app.boards.openBoard("C:/path/to/board/root")` |
| Pin a board | In the **Custom Boards & Editors** tab, click the pin button on the board row |
| Remove a trusted board | Right-click the board in the **Custom Boards & Editors** tab → **Remove** |
| Delete a board | In the Board editor main view, click the delete action on the board tile |
| Rename a board | Rename the board's folder in the file system (Explorer, terminal, or the File Explorer sidebar) |
| Switch boards (in project) | Click a board name in the **Boards** sidebar panel |
| Refresh the board | Click the **Refresh** button in the **Boards** sidebar panel header |

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

The Demo board is installed at `.persephone/boards/Demo/` in your project. The source template lives at `resources/assets/demo-board/` inside the Persephone installation folder (or at `assets/demo-board/` in the repository).
