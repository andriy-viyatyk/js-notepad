# Web Board — authoring guide

This folder is a **Persephone Web Board**: a small web app whose UI you own as a
plain HTML page, backed by scripts you write in any language. Persephone hosts the
page in a sandboxed webview and injects a single bridge object, `window.persephone`.

## Mental model: frontend + backend + the `execute()` channel

- **Frontend** — `index.html` + `app.js` (+ any CSS/assets you add). Owns *all* UI
  and *all* state. This is what renders in the webview.
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

- `persephone.openRawLink(href)` — open a file/URL in a new Persephone page.
- `persephone.notify(message, type)` — toast (`"info" | "success" | "warning" | "error"`).
- `persephone.openFileDialog(params)` / `saveFileDialog(params)` / `openFolderDialog(params)`
  — native dialogs; each returns a path you hand to `execute()`.

## Theme: the `--p-*` contract

Persephone injects its palette as CSS variables on `<html>` and keeps them live
across theme switches — style everything with them so the board matches the app:

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

A board is a **local, offline-first app**, and the sandbox **forbids remote network**:
the CSP (`connect-src 'self'`) blocks CDN scripts, stylesheets, fonts, and any `fetch`
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
appended to **`ui.log`** in this folder (an on-board indicator opens it). Persephone
also logs board *load* failures there. Keep your `catch` blocks calling `notify(...,
"error")` so problems are reviewable.

## Board icon (optional)

Put an `icon.svg`, `icon.png`, or `icon.ico` in this board folder to set the board's
icon — shown in the Persephone tab (when the board is open), the boards list, and the
sidebar. First match wins (SVG preferred). Without one, a default glyph is used.

## Editing & reload

Edit `index.html` and the board reloads automatically. After editing `app.js` or
styles, click the **Refresh** button in the Boards side panel to remount.

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

- **Installed app:** under the Persephone install's `resources/assets/demo-board/` —
  on Windows typically `C:\Program Files\Persephone\persephone\resources\assets\demo-board`.
- **From source (dev):** `assets/demo-board/` in the repository.

## Docs

Persephone on GitHub: https://github.com/andriy-viyatyk/persephone
*(Web Board reference docs link — to be added once published.)*
