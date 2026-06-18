# EPIC-034: Web Board — HTML-page board with `persephone.execute` + board scripts

## Status

**Status:** 🚧 Active (design consolidated; foundational tasks to be carved before implementation)
**Created:** 2026-06-18

> Design is **consolidated** from the 2026-06-18 discussion plus a working Tabulator proof-of-concept (`temp/tabulator-board-test.html`). This epic owns its **full foundation layer** (command runner, process lifecycle, trust gate, board editor + routing) plus the board bridge, file delivery, theme contract, and recommended-components model. Tasks are **carved as placeholders** (see **Tasks**, in build order); each gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc before its implementation begins.

## Tasks

Placeholders in **build order** (foundations first — see *Foundations & build order* for the sequencing rationale). **No details yet** — each is investigated and written up (Goal → Background → Implementation Plan → Concerns → Acceptance) before its implementation begins.

| Task | Title |
|------|-------|
| US-719 | Command runner — main-process **streaming** spawn service + IPC handle (stdout/stderr/exit/error stream, stdin write, kill; buffered one-shot convenience on top) |
| US-720 | Process lifecycle / tree-kill — per-board process registry; whole-**tree** kill (Windows **Job Object**; `taskkill /T` fallback); reap on board close/reload/crash |
| US-721 | Project trust gate + dialog — per-`.persephone` trust; `trustedProjects.txt` (`userData`); untrusted UX + "Trust project" confirmation (wording states the RCE implication) |
| US-722 | `.persephone` folder + Board editor + folder-click routing — `persephone-folder://` scheme/parser + `FileTreeProvider` check + editor registration + `restore()`; side-panel board list + main management (create/delete) view |
| US-723 | `board://` protocol + locked-down webview + bridge injection + CSP — global privileged registration + per-board-partition `protocol.handle` (traversal guard); webview `nodeIntegration:false`/`contextIsolation:true`/`sandbox:true`; preload `contextBridge` |
| US-724 | `persephone` bridge API — `execute()` handle (proxy + stream over IPC) + integration tier (`openRawLink`, `notify`, open-file/save-file/open-folder dialogs) |
| US-725 | Theme contract — `--p-*` CSS-variable contract (mapped from `color.ts`) + `persephone.theme`/`onThemeChange`; inject + live-update on theme switch |
| US-726 | `config.json` load/watch + templates & scaffolding + `ui.log` + dev-shim — per-board folder lifecycle; bundled `web-board-template`; recursive copy on create; error logging + on-board indicator |
| US-727 | Recommended-components manifest + first skin (Tabulator) — `boards-assets/` skin (version-stamped, per-block comments) + manifest; agent fetch-into-folder |
| US-728 | Reference Web Board (dogfood) — a real end-to-end board proving the full loop (template → frontend + scripts → `execute()` → skinned grid) |

## The idea

A **new kind of board**: the **board author owns the UI as a plain HTML page** (`index.html` + its own `.css`/`.js`, vanilla or any pre-built SPA bundle) shown in a webview, plus a folder of **board scripts** in any language (`.py`, `.js`, `.sh`, `.ps1`, …). Persephone injects a small `persephone` bridge into the page; the page drives everything through it.

The point is **agent-authorability with near-zero Persephone knowledge**: an AI agent (or user) writes the frontend + scripts, and the only Persephone-specific thing it must learn is essentially one method. The agent can also help the user install whatever runtime the scripts need (node/python/…), and can test the board **part by part** (scripts standalone in a terminal; the HTML against a `persephone` dev-shim).

**Frontend/backend split (the core mental model).** A Web Board is literally a frontend/backend app: the **frontend** is the HTML page + its vanilla scripts and owns *all* UI logic **and its own state**; the **backend** is the on-disk scripts (node/python/…); the **channel** between them is `persephone.execute()`. The board calls `execute()` only to **get/update data from resources** — everything else lives in the page. Persephone owns no board state and no board UI; it is just the host that wires the channel and shows the page.

Example: an Azure status board — a button runs `scripts/load_azure.py`, which uses the user's already-logged-in `az` CLI to fetch data and prints JSON back to the page, which renders it in a (skinned) Tabulator grid. A recommended, skinned grid component (Tabulator) inside a Web Board delivers a native-spreadsheet feel — range-select / copy-paste / sort / filter / virtualized — with no host-side rendering code.

## Minimal API

The kernel is a **single universal primitive**: `persephone.execute(commandLine, { cwd?, env? })` → a **process handle**. It is Turing-complete for "do anything on the machine" (filesystem, network, any tool), so it's the smallest surface that's also maximally powerful. Everything else reduces to it:

- One-shot consumers (buffer to completion): `await handle.getText()` / `getJson()` / `getBytes()`.
- Streaming consumers: `handle.on("stdout"|"stderr"|"exit"|"error", cb)`.
- Input + lifecycle: `handle.write(...)`, `handle.endStdin()`, `handle.kill()`.

`getJson()` rejects on non-zero exit / parse failure (with `exitCode` + captured `stderr` on the error). `stderr` is kept **distinct** from `error` (programs write progress to stderr) and from a non-zero `exit` code. Buffered vs streaming is one-or-the-other per handle (so an infinite stream doesn't blow up memory). Default `cwd` = the board folder (so a script's relative reads, and running it standalone from that folder, behave identically).

**Integration tier** — the only things `execute()` cannot express are in-app effects. A small fixed set, opt-in (a board works without them):
- `openRawLink(href)` — open something in a new Persephone page (the project's canonical open path).
- `openFileDialog(...)` / `saveFileDialog(...)` / `openFolderDialog(...)` — native **open-file / save-file / pick-folder** dialogs. These genuinely belong in the bridge (not reducible to `execute()`): a native dialog must be **parented to a window**, and a detached node/python child process has **no window handle**, so it can't show a properly-parented modal dialog — main shows them via Electron `dialog`, parented to the board's window. They **pair with `execute()`**: the dialog returns a **path**, the page hands that path to a script — Persephone picks the file/folder, the script does the work.
- `notify(msg, type)` — toast.

Clean boundary: **`execute()` = everything outside Persephone; integration methods = everything inside Persephone.**

**Userland helpers** (shipped in the template, **not** native API) sit on top: e.g. `boardScript(path, args)` = execute + stdin-JSON + collect-stdout + parse. This keeps the native preload surface at essentially one method — and it stays that way: board state is the author's concern, handled via `execute()` if persistence is wanted at all (see Concerns C6), never a second native primitive.

## Frontend delivery & multi-file layout (`board://` scheme)

Boards are **multi-file** (separate `index.html` / `.css` / `.js`) — editing a small file is far kinder to an agent's context than rewriting one inlined monolith. Files are served **in-process**, **without an HTTP server / port**, via an Electron **custom protocol handler** (`protocol.handle('board', …)`).

- The webview loads `board:///frontend/index.html`; relative refs (`./tabular.css`, `./app.js`, `./vendor/…`) resolve against the scheme and stream from the board folder.
- **Two-part registration (this is the linchpin of the no-id-in-URL security story):** the scheme is declared **privileged** (`standard:true, secure:true, supportFetchAPI:true`) **once at startup, before `app.ready`** (a single global `registerSchemesAsPrivileged` call) so relative URLs / `fetch` / CSP behave like http; but the **`protocol.handle('board', …)` is registered per board, on that board's own ephemeral session partition**, with the handler closed over that board's root folder. Because the handler is partition-scoped, a request needs **no board id in the URL** and a board can only read its own folder — no cross-board leakage. Persephone already uses exactly this split (global privileged registration + per-session `protocol.handle`) for its `app-asset` / `safe-file` schemes in `src/main/main-setup.ts` — mirror it. Each board webview gets a dedicated `board-<uuid>` partition (the browser editor already mints per-instance partitions this way).
- **Path-traversal guard** — canonicalize and verify the resolved path stays inside the board root; **reuse the validated guard in the existing `safe-file` handler** (`main-setup.ts`), which already handles Windows drive-letter cases.
- **The `board://` origin is the security boundary**: the `persephone` bridge is injected *only* into that origin (never remote URLs), and a **CSP** allows `board:` for scripts/styles and forbids remote — so "trusted = the files in this folder" is enforced at the origin level. (Cleaner than a localhost server, whose port is reachable by other local processes.)
- Serve **no-cache in dev** so edit-file → reload-webview shows changes instantly.
- Single-file boards still work; this just *enables* the multi-file default.

## Theme propagation (`--p-*` contract)

The board runs in a webview but the host owns the theme, so Persephone **pushes the palette in**. Two distinct things:

- **Theme tokens — Persephone-provided and guaranteed.** A small, stable, documented **CSS-variable contract** (`--p-bg`, `--p-panel`, `--p-border`, `--p-text`, `--p-text-muted`, `--p-accent`, `--p-accent-hover`, `--p-selection`, `--p-error`, …) mapped from `theme/color.ts`, injected into the board origin and updated on theme switch → boards **restyle live**. Plus a JS mirror — `persephone.theme` + `persephone.onThemeChange(cb)` — for colors set in JS rather than CSS (e.g. Tabulator's progress-bar `color` array). The variable-name set is the public API; Persephone's internal tokens can churn behind this thin layer.
- **Component styling — not guaranteed** (see skins below).

Line in the sand: **Persephone guarantees the palette, not the component styling.**

## Recommended components & version-stamped skins

CSS-tuning a third-party component to match the theme is the real authoring pain — proven by the proof-of-concept (it took several iterations and a read of the minified CSS to find the right class names). So Persephone **recommends** components and ships **skins**, but **does not auto-inject and does not guarantee** them:

- Persephone publishes a **list of recommended components** (Tabulator for grids first; add others only once skinned + tested) + a **manifest** with, per component: purpose, tested version, and a link to a skin CSS file in a dedicated public-repo folder (**`boards-assets/`**) — **not bundled in the installer** (keeps the build lean; lets the skins library grow, incl. future community/component-author contributions).
- Each **skin** is written entirely against the `--p-*` contract, **version-stamped** in a header (`/* persephone skin · tabulator-tables@6.3 · tuned 2026-06 */`), and **heavily commented per block** (what it targets + why) so an agent can fix it.
- The agent **downloads the skin and copies it into the board folder** (a frozen local copy referenced via `board://`, *not* a live link to GitHub raw — keeps it offline, local-origin, CSP-safe, editable). The agent owns it and may patch it.
- **No guarantee.** It may not cover all cases and may break on a newer component version. Drift workflow: agent compares the component version to the skin's tuned-for stamp → if newer, expects drift, tests, patches the local copy (optionally PRs the fix back → community-maintained skins).
- Document the **CSS-vs-JS split** per component (skin handles chrome; set formatter/progress colors from `persephone.theme` in JS).

**Proof-of-concept:** `temp/tabulator-board-test.html` — a dark-skinned Tabulator grid (toolbar + N-row generator + 1000 seed rows + range select + clipboard + sorting + header filters + a customizable row context menu over the range selection). Validated that a recommended vanilla component fits the Persephone look once skinned.

## Project & board infrastructure

The host-side machinery a board needs — owned and built by this epic.

### Persephone project & per-board folder

- A project is a folder containing a **`.persephone/`** directory; boards live under **`.persephone/boards/<Name>/`** (folder name = board display name).
- Each board carries `config.json`, a per-board **`CLAUDE.md`** (self-documenting authoring guide for the agent), `frontend/`, `scripts/`, and `ui.log`. All paths inside config are **board-folder-relative**; spawned scripts run with **cwd = the board folder**.
- A board's `boardType` selects behavior; v1 ships **`web-board`** only. (A new board type later = a new template folder; the host machinery is reused.)

Working folder layout:

```
.persephone/
  boards/
    Azure Status/            ← folder name = board display name
      config.json            ← boardType, optional commands map
      CLAUDE.md              ← per-board authoring guide for the agent
      ui.log                 ← error log (execute failures, bridge errors) — for Claude to review
      frontend/
        index.html
        app.js
        tabular.css          ← fetched, agent-owned component skin
        vendor/…             ← optional vendored libs for offline
      scripts/
        load_azure.py        ← external script (any language), run via execute()
```

### Board editor + `.persephone` folder-click routing

A dedicated **Board editor** opens when the user clicks the **`.persephone` folder** (mirroring the existing `.git` / `.mneme` folder-click editors):

- **Side panel (secondary view)** — lists the project's boards; the user switches between them here.
- **Main view** — lists the boards with **management operations** (create, delete); selecting a board renders that board's **webview** in the main view.
- **Naming / create:** display name = folder name; "Create" simply attempts to create the folder (copying the template) and shows an error if the OS rejects the name (illegal/duplicate) — no upfront sanitization. Rename = folder rename.

*Implementation caveat:* folder-click routing is ~3 touchpoints — a folder-name check in `FileTreeProvider`, a new `persephone-folder://`-style link scheme + parser, and editor registration. The descriptor-driven editors (`rest-client`, `mcp-inspector`) are the Pattern-B model to follow, but `mcp-inspector` does **not** override `restore()`; the Board editor needs a real `restore()` to read the project folder.

### Project trust gate & dialog

A board's UI is web content and `execute()` is arbitrary RCE, so Persephone adopts a **VS Code-style trust gate, per `.persephone` project** (not per board), remembered across sessions:

- **Untrusted:** boards do **not** render — each shows *"Boards are not supported in untrusted projects"* with a **"Trust project"** button that opens a **confirmation dialog**. No `execute()` / script runs.
- **Trusted:** boards render; `execute()` works; auto-run events fire.
- **Persistence:** trusted projects stored as a line-delimited list of absolute `.persephone` folder paths in **`<userData>/persephone/data/trustedProjects.txt`** (via the `fs` data-file helpers `prepareDataFile` / `saveDataFile`, which resolve under Electron `userData`, exactly as `settings.ts` does). "Trust project" **appends** after confirmation; a board is trusted iff its `.persephone` path is listed.

This is the load-bearing security control (see Concerns C4) — mandatory, because the board UI itself can call `execute()`.

### `config.json` (loaded at init + watched)

Read once at init and **watched** (a change **recreates** the board — reload/remount the webview). Contains:
- **`boardType`** — selects the renderer; `"web-board"`.
- **`commands`** *(optional)* — interpreter mapping for convenience/cross-platform: a glob on the script's extension → command template with a `{{script}}` placeholder (e.g. `{ "*.py": "python {{script}}" }`), `cwd` = board folder. Less central here — the page can pass a full command line to `execute()` directly — but useful for the `boardScript` helper and for letting the project decide interpreters. Defaults ship in the template.

*(No `events` field in v1 — see Events below.)*

### Events (`onLoad`) — cut from v1

**Decision: no host-level events in v1.** A Web Board's own load code (`DOMContentLoaded`) already runs and can call `execute()` the moment the board opens, so a host-level `onLoad` adds nothing (the trust gate is what makes auto-run safe). `config.json` therefore carries **no `events` field** in v1. Revisit only if a use case appears for running a board script *outside/around* the page's own JS (listed under Future directions).

### Templates & scaffolding

- **Source:** a bundled template `assets/.persephone/web-board-template/` — a complete folder: `config.json` (default `commands`), `CLAUDE.md`, `frontend/` (`index.html` + `app.js` + a starter skin + the `persephone` dev-shim), and `scripts/` (a simple working example).
- **Mechanism:** a **recursive copy** of the template folder into the new (empty) `.persephone/boards/<Name>/`, **erroring if the folder already exists**. The display name lives in the **folder name**, so there is **no name token to substitute inside files** — template files are name-agnostic. `library-service.ts`'s `copyDirRecursive` is a reference, but its **skip-if-exists** semantics are the wrong default here (Create wants a fresh folder + explicit collision error), so the copy is lightly adapted, not reused verbatim.
- **Create / delete** via the Board editor's main view; "Create" copies the template into `.persephone/boards/<Name>/`.

### Error logging (`ui.log`) + on-board indicator

All board errors — `execute()` non-zero exit / stderr, bridge errors, skin/load failures — are:
- shown as a `ui.notify(..., "error")` **toast**,
- logged to the **dev-tools console**, and
- appended to the per-board **`ui.log`** file.

A clickable on-board **error indicator** opens dev-tools / `ui.log`. The persistent log is the key piece for the agent-assist loop: **Claude reads it to review failures and help the user fix the offending script** — the whole point of a self-documenting, agent-authorable board.

### Explicitly out of scope (host-owned machinery not built)

Because the page owns its own rendering and state, the host does **not** provide:
- **A host-owned state mirror** — no two-way `state/`↔component sync, no host-rendered grid, no in-app script runtime. The page renders and persists its own state.
- **An icon-token system** — the page builds its own toolbar/buttons in HTML.
- **An automatic per-page loading indicator** — the page renders its own loading UI in its own JS. (Persephone still surfaces `execute()` failures via the toast + `ui.log`.)
- **An action-reference / `sync`-`async` concurrency contract** — the page calls `execute()` directly and owns its own concurrency (button disabling, spinners).

## Foundations & build order (owned by this epic)

This is *not* a thin feature — it owns the foundation layer below. Sensible build order (foundations first):

| # | Foundation | Notes |
|---|-----------|-------|
| 1 | **Command runner** (main-process spawn + IPC) | A **streaming, long-lived handle with tree-kill** — backs `execute()`. (A buffered one-shot mode is a thin convenience on top.) |
| 2 | **Process lifecycle / tree-kill** | Persephone owns every spawn; **reaps all of a board's processes** on webview close/reload/crash; kills the whole **process tree** (Windows **Job Object**; `taskkill /T` fallback); children tracked **per board instance**. |
| 3 | **Project trust gate + dialog** | Mandatory; nothing runs until trusted. |
| 4 | **`.persephone` folder + Board editor + folder-click routing** | Editor hosts the board **webview**; side-panel board list + main management view. |
| 5 | **`board://` protocol + bridge injection + CSP** | In-process file serving; bridge bound to the board origin. |
| 6 | **`persephone` bridge API** (`execute` handle + integration tier) | The preload surface + handle proxy/stream over IPC. |
| 7 | **Theme contract** (`--p-*` + `persephone.theme`) | Guaranteed palette; live update on theme switch. |
| 8 | **config.json load/watch + templates/scaffolding + `ui.log`** | The per-board folder lifecycle. |
| 9 | **Recommended-components manifest + first skin (Tabulator)** | Skin in `boards-assets/`; agent fetch-into-folder. |

## Concerns / open risks (reviewed)

- **C1 — Not a concern; it's the plan. ✅ reviewed (2026-06-18).** This only states that the epic owns the foundation layer (command runner, trust gate, folder/editor routing) and builds it first — captured in **Foundations & build order**. No risk to weigh; kept only to mark it reviewed.
- **C2 — Webview security config. ✅ decided (2026-06-18).** The board webview runs **`nodeIntegration: false`** + **`contextIsolation: true`** + **`sandbox: true`**, set via **explicit `<webview>` attributes** (`nodeintegration={false}`, `contextisolation`, `sandbox`, `webpreferences`) — a `<webview>` does **not** inherit the embedder's settings, and the browser editor's `<webview>` (`BrowserView.tsx`) sets none of these, so this is a genuinely separate locked-down config (not "don't inherit"). The `persephone` bridge is exposed *only* through a dedicated **preload via `contextBridge.exposeInMainWorld`** over IPC — never raw Node, no `require`/`process` reachable from the page. Note: **`contextBridge` requires `contextIsolation: true`**, which the main renderer does *not* use — so this is **new preload code**, distinct from `preload-webview.ts` (which uses `ipcRenderer.sendToHost`, not contextBridge). The board webview's own origin + CSP are independent of the embedder (the host renderer's `webSecurity:false` does not leak in). Remaining task-time detail only: `<webview>` (precedent exists) vs `WebContentsView` (Electron's forward direction).
- **C3 — Handle proxying / stream bridging. ✅ approach decided (2026-06-18).** The **preload is the bridge**: it exposes the `persephone` API via `contextBridge` and talks to main with `ipcRenderer` — so the path is page →(in-process contextBridge)→ preload →(one cross-process IPC hop)→ main, with **no `window.postMessage` relay and no host-renderer bounce**. The page-side `handle` is a thin proxy whose `write`/`kill`/`on(...)` call into the preload; main streams child stdout/stderr back over IPC and the preload invokes the registered callbacks. The page never touches `ipcRenderer` (only the safe bridged API — keeps C2 intact). The main↔renderer hop is **inherently cross-process**, so one copy there is unavoidable — but it's **structured clone, not JSON**, so send chunks as **`Uint8Array`** (binary, efficient). For chatty output, **coalesce** chunks (line- or ~N-ms-buffered) to cut IPC message count; a dedicated **`MessageChannelMain`** port is the high-throughput optimization (not v1). Still the most intricate piece (backpressure + clean teardown) — prototype early.
- **C4 — `execute()` is full RCE. ✅ accepted as the goal (user, 2026-06-18).** Full machine access is the *point* — it's what lets a user (and their AI agent) build fully functional application-boards. A board is therefore **trusted native code** with the user's full privileges (incl. ambient cloud/CLI credentials). Guardrails that bound it (all already specified): the **per-project trust gate** is the single consent point (untrusted → nothing runs), the bridge is injected **only into the `board://` local origin** (never remote), and a strict **CSP** forbids remote scripts. No per-command check beyond the one gate. **Action item:** the trust dialog's wording must state plainly that trusting a project ≡ allowing it to run local programs with your privileges (not a soft "do you trust this folder?").
- **C5 — `--p-*` is a long-term public API. ✅ accepted (user, 2026-06-18): design the token set carefully up front.** Principles: **semantic/role-based names** (`--p-bg`, `--p-text`, `--p-accent`, …), *not* value- or component-based; **sourced from `color.ts`** semantic tokens; evolve **additively** (new tokens fine; renames/removals are breaking and avoided). The concrete token list + `color.ts` mapping is a task-time deliverable, but the set is frozen as a public contract once boards ship against it. Caveat: not every token is a 1:1 lookup — `color.ts` has no single `accent` token (closest: `primary.background` / `primary.textHover`, `misc.link`), so `--p-accent` / `--p-accent-hover` are a deliberate mapping choice (matters because the set is frozen).
- **C6 — State persistence. ✅ resolved (user, 2026-06-18): not Persephone's problem; no second primitive.** The Web Board is a **frontend/backend** design — the page owns *all* UI logic and its own state; Persephone owns no board state. If a board wants persistence it's the author's choice, and it's **infrequent** (load on init, save on unload / on change) — not a high-frequency case — so `execute()` (a script that reads/writes a file) is entirely sufficient; many boards won't persist to disk at all. **No `readFile`/`writeFile`/`getState`/`setState` added.**
- **C7 — Skins fetch / offline / versioning. ✅ resolved (user, 2026-06-18): a repo folder, fetched from GitHub, NOT bundled.** Skins live in a dedicated public-repo folder (e.g. **`boards-assets/`**); the agent/user (GitHub-accessible and online while authoring) fetches the needed skin and copies it into the board folder as a frozen local copy. **Not bundled into the installer** — keeps the build lean and lets the library grow. Consequence (accepted): creating a board *with a recommended skin* needs network **once**, at create time; afterward the board owns its copy → **no runtime/offline impact**. Persephone's job shrinks to **publishing the manifest + skin files in the repo**; no in-app fetch/copy machinery required.
- **C8 — Resource use. ✅ resolved (user, 2026-06-18): bounded by lifecycle.** Only **one active board per page**; switching boards **destroys** the previous one — which is also what **reaps its child processes** (ties into the per-board tree-kill, foundation #2). So at most one board's webview + processes are live per page. How many boards/pages to open is the **user's choice**, and a webview-per-board is the same model as Persephone's existing browser tabs. Optional future enhancement: a **"keep board live"** flag (background boards).
- **C9 — Dev-shim drift. ✅ resolved (user, 2026-06-18).** Keep the dev-shim as the lightweight offline-iteration aid, with the cheap mitigation: define the shim and the real bridge from **one shared API shape/types**, versioned together, so they can't silently drift. Richer **live in-app testing** — pointing Persephone's existing **browser-automation MCP** (`browser_*`, Playwright-compatible) at the board's webview so the agent can snapshot/click/type/debug the real board end-to-end — is **explicitly out of scope** for this epic; deferred to a future epic/task (see Future directions).

**Concern review complete — all of C1–C9 reviewed/resolved.**

## Points to settle during task carving

- **`board://` scheme** — model the registration on the existing `app-asset` / `safe-file` schemes in `main-setup.ts` (global privileged registration at startup + per-partition `protocol.handle` + the `safe-file` traversal guard). Remaining details: the MIME-by-extension table and the `board-<uuid>` partition lifecycle.
- **`execute()` handle API** — exact event taxonomy + the buffered/streaming switch + the reject contract (per Minimal API).
- **`--p-*` theme contract** — finalize the token name set and the `color.ts` → variable mapping; decide injection mechanism (preload vs `webview.insertCSS`) and the live-update path on theme switch.
- **Recommended components / skins** — keep the curated set small and **version-pinned**; treat a component major bump as a "re-review the skin" task; settle the manifest home + in-app discovery (e.g. a `read_guide`-style resource).
- **Template** — `frontend/` (`index.html` + `app.js` + a fetched skin) + `scripts/` + a `persephone` **dev-shim** (mocked `execute` **and default `--p-*` values**, so the UI renders themed and is testable outside the app) + a per-board `CLAUDE.md` (the one method + the stdout-JSON convention + the recommended-component note).
- **Folder-click routing** — the `persephone-folder://` scheme/parser + `FileTreeProvider` check + editor registration + a real `restore()` (see the Board editor implementation caveat).
- **PTY (future, not v1)** — pipe-based stdin/stdout covers virtually every board script; truly interactive CLIs (REPL, ssh) would need a PTY later.

## Future directions (out of scope)

Kept out of v1 scope; the design leaves room for them:
- **Live in-app board testing via MCP** — adapt Persephone's existing browser-automation MCP (`browser_*`, Playwright-compatible) to target a board's webview, so an agent can snapshot/interact/debug the real board end-to-end (beyond the offline dev-shim). Persephone already has the MCP + automation pieces. (Own epic/task.)
- **"Keep board live"** — background boards that aren't destroyed on switch (see C8).
- **PTY-backed `execute()`** — for truly interactive CLIs (REPL, ssh).
- **More board types & recommended components** — a new board type = a new template folder; a new component = a new skin in `boards-assets/`.
- **Host-level events (`onLoad`, …)** — running a board script around the page's own lifecycle, if a use case appears (cut from v1).

## Related

- **Backlog** — "Custom Editor Plugins (Single-File HTML)" (`doc/tasks/backlog.md`) — the earlier webview + injected-API idea this generalizes.

## Notes

### 2026-06-18 — design consolidated
- Single `execute()` streaming-handle primitive chosen as the minimal-but-universal bridge; integration tier (`openRawLink`, file dialogs, `notify`); `boardScript`/state as userland helpers.
- **Frontend/backend split** adopted as the core model. In-process **`board://`** multi-file delivery; guaranteed **`--p-*`** theme contract; **recommended-components / version-stamped-skins** in `boards-assets/`.
- Validated with a Tabulator proof-of-concept (`temp/tabulator-board-test.html`): a skinned vanilla grid fits the Persephone look; **CSS tuning is the real authoring pain** (→ skins model).
- Defined the **host foundation layer** this epic owns (command runner + process tree-kill + trust gate + board editor/routing + `board://` + bridge + theme + templates/log) and the host-owned machinery explicitly left out of scope.

### 2026-06-18 — concern review complete (C1–C9)
- C1 reclassified as plan; C2 webview lockdown decided; C3 preload-bridge streaming approach decided; C4 full-RCE accepted (trust-dialog wording action item); C5 `--p-*` carefully-designed-up-front accepted; C6 state = author's concern (no second primitive); C7 skins fetched from `boards-assets/`, not bundled; C8 one active board per page (destroy-on-switch reaps processes); C9 keep dev-shim (shared types), MCP-driven live testing deferred.
- All concerns reviewed/resolved; document ready for an implementation-planning review.

### 2026-06-18 — fresh-context audit + fixes applied
- Ran a no-context architectural audit (verdict: *ready with minor fixes*; technical claims verified against the codebase). Applied the four flagged corrections:
  - **(B1)** `board://` = one global privileged registration at startup **+ a per-board-partition `protocol.handle`** bound to the board root (the linchpin of no-id-in-URL scoping; mirror `app-asset`/`safe-file` in `main-setup.ts`).
  - **(B2)** reworded C2 — `<webview>` security is set via **explicit attributes** (it doesn't inherit the embedder's), and `contextBridge` needs `contextIsolation:true`, so the board preload is **new code**, distinct from `preload-webview.ts`'s `sendToHost`.
  - **(B3)** template Create = recursive copy into a **fresh** folder, error on collision, **no in-file name substitution** (the name lives in the folder).
  - **(B4)** trust file is **`userData`**-rooted, not `appData`.
- Folded in non-blocking notes: reuse the `safe-file` traversal guard; `--p-accent*` is a deliberate mapping (no 1:1 `color.ts` token); **cut `onLoad`/`events` from v1** (the page's own load handler suffices) → moved to Future directions.

### 2026-06-18 — task placeholders carved (US-719…US-728)
- Carved 10 placeholder tasks in build order from the Foundations table (US-719 command runner → US-720 tree-kill → US-721 trust gate → US-722 board editor/routing → US-723 `board://`+webview → US-724 bridge API → US-725 theme contract → US-726 config/templates/`ui.log` → US-727 manifest+Tabulator skin → US-728 dogfood reference board). No task docs yet — each is investigated + written up before its implementation.

### 2026-06-18 — dialogs added to the integration tier
- Added native **open-file / save-file / pick-folder** dialogs (`openFileDialog` / `saveFileDialog` / `openFolderDialog`) to the integration tier, wired preload→main. Rationale (user): native dialogs must be **parented to a window**, so a detached node/python script can't show them — they're genuinely host-only, which reinforces the integration-tier boundary; each returns a path the page feeds to `execute()`. (Working names; exact signatures incl. multi-select are a task-time detail.)
