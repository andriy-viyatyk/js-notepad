# EPIC-034: Web Board — HTML-page board with `persephone.execute` + board scripts

## Status

**Status:** 🚧 Active (design consolidated; foundational tasks to be carved before implementation)
**Created:** 2026-06-18

> Design is **consolidated** from the 2026-06-18 discussion plus a working Tabulator proof-of-concept (`temp/tabulator-board-test.html`). This epic owns its **full foundation layer** (command runner, process lifecycle, trust gate, board editor + routing) plus the board bridge, file delivery, theme contract, and recommended-components model. Tasks are **carved as placeholders** (see **Tasks**, in build order); each gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc before its implementation begins.

## Tasks

Placeholders in **build order** (foundations first — see *Foundations & build order* for the sequencing rationale). **No details yet** — each is investigated and written up (Goal → Background → Implementation Plan → Concerns → Acceptance) before its implementation begins.

| Task | Title |
|------|-------|
| US-719 | Command runner — **shared main-process streaming spawn service** + IPC interface (stdout/stderr/exit/error stream, stdin write, kill; buffered one-shot on top). Spawn always in main (boards are sandboxed → no Node). Consumed by three front-ends: the **board preload** (US-724), the **renderer `app` API** (Persephone scripts), and *(optional)* an **MCP tool** (agent testing). **[Investigated — doc ready.](../tasks/US-719-command-runner/README.md)** |
| US-720 | Process lifecycle / tree-kill — per-board process registry; whole-**tree** kill (Windows **Job Object**; `taskkill /T` fallback); reap on board close/reload/crash. **[Investigated — doc ready.](../tasks/US-720-process-lifecycle/README.md)** |
| US-721 | Project trust gate + dialog — per-`.persephone` trust; `trustedProjects.txt` (`userData`); untrusted UX + "Trust project" confirmation (wording states the RCE implication) **[Investigated — doc ready.](../tasks/US-721-project-trust-gate/README.md)** |
| US-722 | `.persephone` folder + Board editor + folder-click routing — `persephone-folder://` scheme/parser + `FileTreeProvider` check + editor registration + `restore()`; side-panel board list + main management (create/delete) view. **[Investigated — doc ready.](../tasks/US-722-board-editor-routing/README.md)** |
| US-723 | `board://` protocol + locked-down webview + bridge injection + CSP — global privileged registration + per-board-partition `protocol.handle` (no path guard — trusted local code); webview `nodeIntegration:false`/`contextIsolation:true`/`sandbox:true`; preload `contextBridge`. **[Investigated — doc ready.](../tasks/US-723-board-protocol-webview/README.md)** |
| US-724 | `persephone` bridge (board preload) — exposes the `persephone` object to the board page via `contextBridge`: the `execute()` **handle** (a thin client that forwards to the US-719 engine over IPC) + integration tier (`openRawLink`, `notify`, open-file/save-file/open-folder dialogs — separate calls to main, not the runner). **Consumes US-719.** **[Investigated — doc ready.](../tasks/US-724-board-bridge/README.md)** |
| US-725 | Theme contract — `--p-*` CSS-variable contract (mapped from `color.ts`) + `persephone.theme`/`onThemeChange`; inject + live-update on theme switch. **[Investigated — doc ready.](../tasks/US-725-theme-contract/README.md)** |
| US-726 | Templates & scaffolding + `ui.log` + live reload — per-board folder lifecycle; bundled 4-file board template; recursive copy on create; per-board error log + on-board indicator; `index.html` watch + Refresh button. *(`config.json` + dev-shim cut from v1.)* **[Investigated — doc ready.](../tasks/US-726-config-templates-log/README.md)** |
| US-727 | Recommended-components manifest + first skin (Tabulator) — `boards-assets/` skin (version-stamped, per-block comments) + manifest; agent fetch-into-folder |
| US-728 | Demo board — self-documenting showcase **+ dogfood** (evolved from the Test board): demonstrates the full `persephone` surface (`execute`, integration tier, **theme + tokens**), proves the full loop via a live `execute()`→skinned-grid section, and embeds a **recommended-components catalog with links to the `boards-assets/` skin CSS**. Offered from the Board editor — **empty-state "Create demo board" button + "+ New board" `SplitButton` dropdown** (no project-creation dialog); ships the demo UI alongside the template. |
| US-731 | **"Create .persephone project" Explorer context menu** — a folder context-menu item that creates `.persephone` (if absent) then reveals + selects the node so the Board editor opens; if it already exists, just reveal + open. No dialog. Single-file change in `ExplorerSecondaryView.tsx` (discovery, link scheme, reveal/select chain all exist). **[Investigated — doc ready.](../tasks/US-731-create-persephone-project/README.md)** |
| US-730 | Web Boards as **`browser_*` MCP automation targets** — register the board webview's `webContents` (separate lightweight CDP registry in `cdp-service.ts`), a `BoardTargetModel` (`IBrowserTarget` subset; nav/tab tools error), generalize `getTarget()` to resolve a board page, and surface boards in `list_pages`. Promotes the "Live in-app board testing via MCP" future-direction into the epic (the automation engine is already target-agnostic). **[Investigated — doc ready.](../tasks/US-730-board-mcp-automation/README.md)** |

## The idea

A **new kind of board**: the **board author owns the UI as a plain HTML page** (`index.html` + its own `.css`/`.js`, vanilla or any pre-built SPA bundle) shown in a webview, plus a folder of **board scripts** in any language (`.py`, `.js`, `.sh`, `.ps1`, …). Persephone injects a small `persephone` bridge into the page; the page drives everything through it.

The point is **agent-authorability with near-zero Persephone knowledge**: an AI agent (or user) writes the frontend + scripts, and the only Persephone-specific thing it must learn is essentially one method. The agent can also help the user install whatever runtime the scripts need (node/python/…), and can test the board **part by part** (scripts standalone in a terminal; the page live-reloaded in-app via the `index.html` watch + Refresh).

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

- The webview loads `board:///index.html` — the entry point is fixed at the **board root** (the only structural requirement); the rest of the folder layout is the author's concern. Relative refs (`./tabular.css`, `./app.js`, `./vendor/…`, subfolders) resolve against the scheme and stream from the board folder.
- **Two-part registration (this is the linchpin of the no-id-in-URL security story):** the scheme is declared **privileged** (`standard:true, secure:true, supportFetchAPI:true`) **once at startup, before `app.ready`** (a single global `registerSchemesAsPrivileged` call) so relative URLs / `fetch` / CSP behave like http; but the **`protocol.handle('board', …)` is registered per board, on that board's own ephemeral session partition**, with the handler closed over that board's root folder. Because the handler is partition-scoped, a request needs **no board id in the URL** (clean addressing — nothing to leak or spoof). Note: cross-board/path read-isolation is **not** a security boundary — a trusted board can read anything via `execute()` anyway (see Path access below). Persephone already uses exactly this split (global privileged registration + per-session `protocol.handle`) for its `app-asset` / `safe-file` schemes in `src/main/main-setup.ts` — mirror it. Each board webview gets a dedicated `board-<uuid>` partition (the browser editor already mints per-instance partitions this way).
- **Path access — no guard (by design).** The handler resolves paths relative to the board root and serves them, with **no traversal restriction**. A board is trusted local code (it can do anything via `execute()`, Concern C4), so a webview file-read guard would protect nothing — the board's files are the author's responsibility. (The `safe-file` handler in `main-setup.ts` is *not* a reusable guard here: it only checks exists + isFile, with no boundary check.)
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
- Each board carries a per-board **`CLAUDE.md`** (self-documenting authoring guide for the agent), a board-root **`index.html`** (+ its own JS/CSS/assets, organized however the author likes), `scripts/`, and `ui.log`. Spawned scripts run with **cwd = the board folder**. *(No `config.json` in v1 — cut; see below.)*
- v1 ships a single board behavior — **`web-board`** (every board under `boards/` is one). A new board type later = a new template folder **+ a discriminator reintroduced then** (e.g. a small config file or inferred from folder contents); the host machinery is reused.

Working folder layout:

```
.persephone/
  boards/
    Azure Status/            ← folder name = board display name
      CLAUDE.md              ← per-board authoring guide for the agent
      ui.log                 ← error log (execute failures, bridge errors) — for Claude to review
      index.html             ← entry point — REQUIRED at the board root
      app.js                 ← (structure below index.html is free-form; this is one example)
      tabular.css            ← fetched, agent-owned component skin
      vendor/…               ← optional vendored libs for offline
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

### `config.json` — cut from v1

**Decision (user, 2026-06-19): no `config.json` in v1.** It would have carried `boardType` (renderer selection) and a `commands` extension→interpreter map, but both are dead weight: there is a single `boardType` (`"web-board"`), so renderer selection is a no-op; and `commands` is **structurally unusable** because `execute()` takes the *full command line* the page builds — the host never gets to apply a mapping (the board author writes both the page and its scripts, so they call `execute("python scripts/load.py")` directly, or via a userland helper). A code + task-doc sweep confirmed **nothing else in the epic depends on it** (the trust gate uses `trustedProjects.txt`; the `board://` protocol, theme contract, and bridge have no dependency). Dropped from US-726, the template, and this layout. The board's dev edit→reload loop is served instead by an **`index.html` watch + a manual Refresh button** (US-726). A future second board type can reintroduce a discriminator when it actually exists.

*(No `events` field either — see Events below.)*

### Events (`onLoad`) — cut from v1

**Decision: no host-level events in v1.** A Web Board's own load code (`DOMContentLoaded`) already runs and can call `execute()` the moment the board opens, so a host-level `onLoad` adds nothing (the trust gate is what makes auto-run safe). There is therefore **no host-level events mechanism** in v1. Revisit only if a use case appears for running a board script *outside/around* the page's own JS (listed under Future directions).

### Templates & scaffolding

- **Source:** a bundled template `assets/board-template/` (no leading dot — dodges dotfile-glob exclusion in the packager) — a complete **4-file** board: `CLAUDE.md` (the single authoring reference), a board-root `index.html` (inline themed `<style>`) + `app.js` (frontend + `boardScript`), and `scripts/hello.js` (backend). No `config.json`, no shipped `board-api.d.ts`, no dev-shim (see US-726 C-C/C-D — a `.d.ts`/shim only aid external-editor IntelliSense / browser-preview, out of v1 scope; `CLAUDE.md` documents the API and the in-app Refresh loop replaces the shim).
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
| 1 | **Command runner** (shared main-process service + IPC interface) | A **streaming, long-lived spawn** service in main, reached over IPC — backs `execute()`. Boards are sandboxed (no Node) so the spawn lives in main; the board's **preload** consumes the IPC interface and presents the handle to the page. Same service is exposed to the **renderer `app` API** (Persephone scripts) and an optional **MCP tool** — all over IPC to the single owner, so the process registry / tree-kill (US-720) stays centralized. (Buffered one-shot is a thin convenience on top.) |
| 2 | **Process lifecycle / tree-kill** | Persephone owns every spawn; **reaps all of a board's processes** on webview close/reload/crash; kills the whole **process tree** (Windows **Job Object**; `taskkill /T` fallback); children tracked **per board instance**. |
| 3 | **Project trust gate + dialog** | Mandatory; nothing runs until trusted. |
| 4 | **`.persephone` folder + Board editor + folder-click routing** | Editor hosts the board **webview**; side-panel board list + main management view. |
| 5 | **`board://` protocol + bridge injection + CSP** | In-process file serving; bridge bound to the board origin. |
| 6 | **`persephone` bridge API** (`execute` handle + integration tier) | The preload surface + handle proxy/stream over IPC. |
| 7 | **Theme contract** (`--p-*` + `persephone.theme`) | Guaranteed palette; live update on theme switch. |
| 8 | **Templates/scaffolding + `ui.log` + live reload** | The per-board folder lifecycle: scaffold from a bundled 4-file template, per-board error log + on-board indicator, `index.html` watch + Refresh button. *(No `config.json`, no dev-shim — cut from v1.)* |
| 9 | **Recommended-components manifest + first skin (Tabulator)** | Skin in `boards-assets/`; agent fetch-into-folder. |

## Concerns / open risks (reviewed)

- **C1 — Not a concern; it's the plan. ✅ reviewed (2026-06-18).** This only states that the epic owns the foundation layer (command runner, trust gate, folder/editor routing) and builds it first — captured in **Foundations & build order**. No risk to weigh; kept only to mark it reviewed.
- **C2 — Webview security config. ✅ decided (2026-06-18).** The board webview runs **`nodeIntegration: false`** + **`contextIsolation: true`** + **`sandbox: true`**, set via **explicit `<webview>` attributes** (`nodeintegration={false}`, `contextisolation`, `sandbox`, `webpreferences`) — a `<webview>` does **not** inherit the embedder's settings, and the browser editor's `<webview>` (`BrowserView.tsx`) sets none of these, so this is a genuinely separate locked-down config (not "don't inherit"). The `persephone` bridge is exposed *only* through a dedicated **preload via `contextBridge.exposeInMainWorld`** over IPC — never raw Node, no `require`/`process` reachable from the page. Note: **`contextBridge` requires `contextIsolation: true`**, which the main renderer does *not* use — so this is **new preload code**, distinct from `preload-webview.ts` (which uses `ipcRenderer.sendToHost`, not contextBridge). The board webview's own origin + CSP are independent of the embedder (the host renderer's `webSecurity:false` does not leak in). Remaining task-time detail only: `<webview>` (precedent exists) vs `WebContentsView` (Electron's forward direction).
- **C3 — Handle proxying / stream bridging. ✅ approach decided (2026-06-18).** The **preload is the bridge**: it exposes the `persephone` API via `contextBridge` and talks to main with `ipcRenderer` — so the path is page →(in-process contextBridge)→ preload →(one cross-process IPC hop)→ main, with **no `window.postMessage` relay and no host-renderer bounce**. The page-side `handle` is a thin proxy whose `write`/`kill`/`on(...)` call into the preload; main streams child stdout/stderr back over IPC and the preload invokes the registered callbacks. The page never touches `ipcRenderer` (only the safe bridged API — keeps C2 intact). The main↔renderer hop is **inherently cross-process**, so one copy there is unavoidable — but it's **structured clone, not JSON**, so send chunks as **`Uint8Array`** (binary, efficient). For chatty output, **coalesce** chunks (line- or ~N-ms-buffered) to cut IPC message count; a dedicated **`MessageChannelMain`** port is the high-throughput optimization (not v1). Still the most intricate piece (backpressure + clean teardown) — prototype early.
- **C4 — `execute()` is full RCE. ✅ accepted as the goal (user, 2026-06-18).** Full machine access is the *point* — it's what lets a user (and their AI agent) build fully functional application-boards. A board is therefore **trusted native code** with the user's full privileges (incl. ambient cloud/CLI credentials). Guardrails that bound it (all already specified): the **per-project trust gate** is the single consent point (untrusted → nothing runs), the bridge is injected **only into the `board://` local origin** (never remote), and a strict **CSP** forbids remote scripts. No per-command check beyond the one gate. **Action item:** the trust dialog's wording must state plainly that trusting a project ≡ allowing it to run local programs with your privileges (not a soft "do you trust this folder?").
- **C5 — `--p-*` is a long-term public API. ✅ accepted (user, 2026-06-18): design the token set carefully up front.** Principles: **semantic/role-based names** (`--p-bg`, `--p-text`, `--p-accent`, …), *not* value- or component-based; **sourced from `color.ts`** semantic tokens; evolve **additively** (new tokens fine; renames/removals are breaking and avoided). The concrete token list + `color.ts` mapping is a task-time deliverable, but the set is frozen as a public contract once boards ship against it. Caveat: not every token is a 1:1 lookup — `color.ts` has no single `accent` token, so `--p-accent*` is a deliberate mapping choice (matters because the set is frozen). **Corrected during US-726 testing (2026-06-19):** `--p-accent*` mirrors the **filled primary Button** (the `selection` pair — `--color-bg-selection` fill / `--color-text-selection` text, `--color-border-active` hover), **not** the `primary.*` group. `primary.*` turned out to be a *text-color* semantic (`primary.background` = `#000`), so the original mapping rendered a black button with invisible-on-hover text.
- **C6 — State persistence. ✅ resolved (user, 2026-06-18): not Persephone's problem; no second primitive.** The Web Board is a **frontend/backend** design — the page owns *all* UI logic and its own state; Persephone owns no board state. If a board wants persistence it's the author's choice, and it's **infrequent** (load on init, save on unload / on change) — not a high-frequency case — so `execute()` (a script that reads/writes a file) is entirely sufficient; many boards won't persist to disk at all. **No `readFile`/`writeFile`/`getState`/`setState` added.**
- **C7 — Skins fetch / offline / versioning. ✅ resolved (user, 2026-06-18): a repo folder, fetched from GitHub, NOT bundled.** Skins live in a dedicated public-repo folder (e.g. **`boards-assets/`**); the agent/user (GitHub-accessible and online while authoring) fetches the needed skin and copies it into the board folder as a frozen local copy. **Not bundled into the installer** — keeps the build lean and lets the library grow. Consequence (accepted): creating a board *with a recommended skin* needs network **once**, at create time; afterward the board owns its copy → **no runtime/offline impact**. Persephone's job shrinks to **publishing the manifest + skin files in the repo**; no in-app fetch/copy machinery required.
- **C8 — Resource use. ✅ resolved (user, 2026-06-18): bounded by lifecycle.** Only **one active board per page**; switching boards **destroys** the previous one — which is also what **reaps its child processes** (ties into the per-board tree-kill, foundation #2). So at most one board's webview + processes are live per page. How many boards/pages to open is the **user's choice**, and a webview-per-board is the same model as Persephone's existing browser tabs. Optional future enhancement: a **"keep board live"** flag (background boards).
- **C9 — Dev-shim drift. ↩️ superseded (user, 2026-06-19): dev-shim cut.** Originally: keep a dev-shim as the offline-iteration aid, sharing one API shape with the real bridge to avoid drift. **Reversed during US-726 carving** — the in-app **`index.html` watch + Refresh** loop renders the board against the *real* theme + *real* `execute()` data, superseding a browser+mock-shim preview (the author already runs Persephone; an AI author doesn't render HTML). No shim ships → no drift to mitigate; the per-board `CLAUDE.md` is the single authoring reference. Richer **live in-app testing** — pointing Persephone's **browser-automation MCP** at the board's webview — remains **out of scope**, deferred to a future epic/task (see Future directions).

**Concern review complete — all of C1–C9 reviewed/resolved.**

## Points to settle during task carving

- **`board://` scheme** — model the registration on the existing `app-asset` / `safe-file` schemes in `main-setup.ts` (global privileged registration at startup + per-partition `protocol.handle`; **no path guard** — see Path access / C1). Remaining details: the MIME-by-extension table and the `board-<uuid>` partition lifecycle.
- **`execute()` handle API** — exact event taxonomy + the buffered/streaming switch + the reject contract (per Minimal API).
- **`--p-*` theme contract** — finalize the token name set and the `color.ts` → variable mapping; decide injection mechanism (preload vs `webview.insertCSS`) and the live-update path on theme switch.
- **Recommended components / skins** — keep the curated set small and **version-pinned**; treat a component major bump as a "re-review the skin" task; settle the manifest home + in-app discovery (e.g. a `read_guide`-style resource).
- **Template** — board-root `index.html` (inline themed `<style>`) + `app.js` (frontend + `boardScript`) + `scripts/hello.js` (backend) + a per-board `CLAUDE.md` (what a board is + the one method + the stdout-JSON convention + the recommended-component note + a GitHub docs link). No dev-shim / `.d.ts` / `config.json` (US-726 decisions). A fetched skin is added by US-727.
- **Folder-click routing** — the `persephone-folder://` scheme/parser + `FileTreeProvider` check + editor registration + a real `restore()` (see the Board editor implementation caveat).
- **PTY (future, not v1)** — pipe-based stdin/stdout covers virtually every board script; truly interactive CLIs (REPL, ssh) would need a PTY later.

## Future directions (out of scope)

Kept out of v1 scope; the design leaves room for them:
- ~~**Live in-app board testing via MCP**~~ — **promoted into this epic as US-730 (2026-06-20).** Adapt Persephone's existing browser-automation MCP (`browser_*`, Playwright-compatible) to target a board's webview, so an agent can snapshot/interact/debug the real board end-to-end. Investigation found the automation engine is already target-agnostic (only `getTarget()` couples to the Browser editor), so this is one task, not its own epic. *(This — not a mock dev-shim, which was cut — is the planned richer testing story.)*
- **Open a board via a `board://` URI** — a special open-URI (e.g. `board://<board folder path>`) that resolves to "open this `.persephone` project + select this board", so an agent (or a link) can *open* a board, not just drive an already-open one. Complements US-730 (which is discover + drive only — the user opens the board manually in v1). Trust gate still applies. (Own task.)
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

### 2026-06-18 — US-719 investigated + task doc written
- Wrote the full Goal → Background → Plan → Concerns → Acceptance doc (`doc/tasks/US-719-command-runner/README.md`).
- **Key finding:** the existing **async-worker system** (`worker-channels.ts` + `worker-host.ts` + `WorkerRunner.ts`) is a precise template — a shared string-channel enum, a `Map<id, …>` in main, `event.sender.send(channel, { id, … })` streaming back, and renderer-side `ipcRenderer.on(channel, msg => if (msg.id !== id) return)` routing with follow-up messages (stdin/kill) sent back keyed by id. US-719 = that exact shape with `ChildProcess` instead of `Worker`. Reuses US-699's spawn blueprint (try/catch, `windowsHide`, env-merge, will-quit reap); the **new** part is the streaming/bidirectional protocol US-699 deferred.
- Binary stdout/stderr cross IPC as `Uint8Array` (structured clone — `capturePageRegion` precedent), confirming C3.
- Defined the handle contract (buffered-xor-streaming per handle; three distinct `error`/`stderr`/non-zero-`exit` signals; `getJson` reject semantics) and the **shared dependency-free `src/ipc/runner-channels.ts`** module (channels + handle types) that US-724's sandboxed preload reuses (it can't import the renderer-bundle client).
- **Scope boundary confirmed:** US-719 ships `child.kill()` + quit-reap; **US-720** swaps in Windows Job-Object tree-kill + board-lifecycle reaping over the same `activeJobs` registry. This task ships **one** consumer (renderer `app.proc`) as the end-to-end proof; US-724 adds the preload consumer; MCP tool optional/deferred.

### 2026-06-18 — US-719 vs US-724 boundary (not duplicates)
- US-719 = the **engine** (main-process spawn + streaming + IPC interface), shared by all consumers. US-724 = the **board's `persephone` bridge** (preload/`contextBridge`) that *consumes* US-719 to present the `execute()` handle to the page, plus the non-runner integration methods (`openRawLink`, `notify`, file dialogs). Not duplicates; US-719 is not vestigial (without it the handle has nothing to call). US-724 depends on US-719.

### 2026-06-18 — US-719 clarified (transport + consumers)
- The command runner is a **shared main-process service** with an **IPC interface** — *not* a renderer-local spawn. Clarification (user review): for a board, "via the preload" and "via IPC" are the **same path** — the sandboxed board page has no Node and can't spawn, so its preload reaches the main service over IPC and presents the handle (preload = contextBridge front, IPC = transport). The service is consumed by three front-ends: the **board preload** (US-724), the **renderer `app` API** (Persephone scripts — also over IPC to the single owner, so process tree-kill stays centralized), and *(optional)* an **MCP tool** (agent testing). Reworded US-719 title and Foundation #1 accordingly.

### 2026-06-18 — task placeholders carved (US-719…US-728)
- Carved 10 placeholder tasks in build order from the Foundations table (US-719 command runner → US-720 tree-kill → US-721 trust gate → US-722 board editor/routing → US-723 `board://`+webview → US-724 bridge API → US-725 theme contract → US-726 config/templates/`ui.log` → US-727 manifest+Tabulator skin → US-728 dogfood reference board). No task docs yet — each is investigated + written up before its implementation.

### 2026-06-18 — dialogs added to the integration tier
- Added native **open-file / save-file / pick-folder** dialogs (`openFileDialog` / `saveFileDialog` / `openFolderDialog`) to the integration tier, wired preload→main. Rationale (user): native dialogs must be **parented to a window**, so a detached node/python script can't show them — they're genuinely host-only, which reinforces the integration-tier boundary; each returns a path the page feeds to `execute()`. (Working names; exact signatures incl. multi-select are a task-time detail.)

### 2026-06-19 — US-724 carved (`persephone` bridge / board preload)
- Wrote the full task doc (`doc/tasks/US-724-board-bridge/README.md`).
- **Key finding: everything US-724 consumes is already shipped.** US-719's runner (`command-runner.ts` + `runner-channels.ts` + renderer `proc.ts`) is implemented **and already includes US-720's tree-kill + per-sender reaping**. Because the board webview *is* the runner's `event.sender`, a board's child processes are **reaped automatically on webview destroy** (board switch / close / crash) — EPIC-034 C8 and US-720's board-lifecycle reaping are satisfied with no extra wiring.
- **The preload reimplements the handle.** `proc.ts`'s `ExecuteHandle` uses `window.electron.ipcRenderer` (main-renderer wrapper) and can't run in the sandboxed board webview — the preload re-expresses the same proven logic against **raw** `ipcRenderer` (`.send`, `.on(channel,(event,…))`, `removeListener`), default `cwd` = board root. Recommended (C-E): move the handle's TS *contract* into the dependency-free `runner-channels.ts` so preload + `proc.ts` share one type (no drift); implementation stays duplicated.
- **Integration tier seams identified & reused:** `openRawLink` reuses `EventEndpoint.eOpenFile` (its renderer handler is exactly `openRawLink(createLinkData(href))`); `notify` needs one new `eBoardNotify` push → `ui.notify`; dialogs reuse `dialog-handlers.ts` (parented via `BrowserWindow.fromWebContents(event.sender)` = embedder window). Board root for `cwd` resolved from `event.sender.session` via a new `Session→root` map in `board-protocol-service.ts`, fetched once by the preload via `ipcRenderer.sendSync` at init (no race — C-B).
- **Scope guard:** `theme`/`onThemeChange` = US-725; `ui.log` / per-board `CLAUDE.md` / `boardScript` = US-726 — explicitly not in US-724. *(`config.json` and the dev-shim, once listed here, were later cut from the epic — see the US-726 note below.)*

### 2026-06-19 — US-723 carved (`board://` + webview); C1/C2/C3 refined
- Wrote the full task doc (`doc/tasks/US-723-board-protocol-webview/README.md`).
- **C1 (path guard) reversed → no guard.** The `safe-file` handler has no boundary check to "reuse" anyway (exists+isFile only), and a board is trusted local code (full RCE via `execute()`, C4) — a webview file-read guard protects nothing. The `board://` handler resolves paths relative to the board root and serves them with **no traversal restriction**; cross-board/path isolation is explicitly *not* a security boundary. CSP-forbids-remote is the only network boundary.
- **C2 (CSP) — inline scripts allowed.** `script-src 'self' 'unsafe-inline'` + `style-src 'self' 'unsafe-inline'`; remote forbidden (`default-src 'none'`). Delivered as a response header from the protocol handler (not a `<meta>` tag).
- **C3 (entry point + layout) — `index.html` at the board root.** The webview loads `board:///index.html` (one fixed entry point); the rest of the folder structure is the author's concern. Updated the folder-layout diagram + template descriptions accordingly (was `frontend/index.html`).
- **Key codebase findings** (for impl): per-partition `protocol.handle` mirrors `main-setup.ts`; ephemeral `board-<uuid>` partition mirrors the browser editor's incognito UUID minting; the board preload is **new** (`contextBridge`, needs `contextIsolation:true`) + new forge/vite build entry + `window.boardPreloadUrl` (mirrors `preload-webview`); `partition → boardRoot` registry in main is the seam US-724 reuses for `execute()` cwd.

### 2026-06-19 — US-725 carved (theme contract)
- Wrote the full task doc (`doc/tasks/US-725-theme-contract/README.md`).
- **Architecture: host renderer is the single source of truth.** It alone knows the theme id, when it switches (`settings.onChanged`), and resolves concrete hex via `theme/themes/index.ts` `getResolvedColor`/`getCurrentThemeId`/`isCurrentThemeDark`. Both the CSS vars and the JS mirror derive from one palette computed in the renderer; the **preload only applies** palettes it's given.
- **Init is correct by construction:** fold the initial palette into the existing `registerBoardProtocol(partition, boardRoot, theme)` call — which the `ready` gate already runs *before* the webview navigates — main stores it per-session (`sessionToTheme`), `getContext` returns `{ boardRoot, theme }`, and the preload applies `--p-*` + seeds `persephone.theme` before first paint. **No new IPC endpoint.**
- **Preload applies the CSS vars** (`document.documentElement.style.setProperty`), not host `insertCSS` — earlier than `dom-ready`, one source object, zero CSS-key bookkeeping. Live switch: host `webview.send(themeChanged, palette)` → preload re-applies + fires `onThemeChange`. Reload is covered by the preload re-init.
- **`--p-*` set (20 color tokens + metrics from `tokens.ts`)** mapped to `color.ts` source vars; `--p-accent*` is the deliberate non-1:1 mapping (epic C5). **C-A resolved (user): provisionally frozen — editable through epic implementation, hard-freezes at release.** `persephone.theme` exposed as a live **getter** + `onThemeChange(cb)` (fires once immediately); `persephone.tokens` static.
- **C-B decided — `uikit/tokens.ts` metrics folded into US-725 (user, 2026-06-19).** A sibling, theme-independent metric `--p-*` contract (`--p-space/gap/radius/size/font-*`) generated from `tokens.ts`, delivered once at init alongside the colors, with a `persephone.tokens` JS mirror. No live update (constants). Same C5 freeze applies — the color + metric set together need sign-off (C-A) before implementation.

### 2026-06-19 — US-726 implemented + two fixes from manual testing
- **Implemented US-726** (`fs.append`; `board-scaffold.ts` + `createBoard` hook; `index.html` `FileWatcher` reload + Refresh button; board-folder `DirectoryWatcher` log indicator; main + renderer `ui.log` append; 4-file `assets/board-template/`). `tsc`/`eslint` clean.
- **Fix — `--p-accent*` mapping (US-725 contract).** Testing showed the template button rendering black-bg/blue-text with invisible-on-hover text. Root cause: `--p-accent*` mapped to the `primary.*` group, which is a *text-color* semantic (`primary.background` = `#000`). Remapped to the **filled primary Button** tokens — `--p-accent` → `--color-bg-selection`, `--p-accent-text` → `--color-text-selection`, `--p-accent-hover` → `--color-border-active`. Template button now mirrors the app's primary Button (accent fill + `brightness()` hover/active). Updated US-725 doc + C5 caveat.
- **Enhancement — `getJson(pattern?: RegExp)`.** Stdout is often mixed (a board script calls other tools that print), so a bare `JSON.parse` fails. Added an optional regex to the handle's `getJson`: it extracts the **last** match (capture group 1, else whole match) before parsing, and still rejects on non-zero exit with the captured stderr. Applied to **both** handles (shared type in `ipc/runner-channels.ts`; impls in `renderer/api/proc.ts` + `preload-board.ts`; facing types `proc.d.ts` + `board-api.d.ts`). Template `CLAUDE.md` documents the marker convention (`@@RESULT@@` + emit snippets) + the stderr-for-logs habit. Our template code stays minimal (the marker is the agent author's choice).

### 2026-06-19 — US-726 carved, then `config.json` cut + reload reworked (user)
- Wrote the full task doc (`doc/tasks/US-726-config-templates-log/README.md`). Everything it depends on (US-722 create/delete, US-723 webview, US-724 bridge, US-725 theme/tokens) is implemented; `createBoard` already has the explicit "population is US-726" scaffold hook.
- **`config.json` cut from v1 (user, 2026-06-19).** `commands` is unusable by `execute()` (the page sends the full command line); `boardType` is a one-value no-op; nothing else depends on it. Removed from the task, the template, and the epic layout/section above.
- **Reload reworked.** Instead of a `config.json` watch-to-recreate, the dev loop is an **`index.html` `FileWatcher`** (bumps a `reloadToken` that re-keys the existing `BoardWebview` remount) **plus a manual Refresh button** in the side panel (covers `app.js`/`css`-only edits). Watching `index.html` (not the whole folder) is deliberate — the folder also holds `ui.log`, so a folder watch would loop (error → log write → reload → error …).
- **Scaffolding:** bundled `assets/board-template/` (no leading dot — dodges dotfile-glob exclusion, C-G) + a small `board-scaffold.ts` recursive copy (no skip-if-exists — `createBoard`'s collision check guarantees a fresh dest); `createBoard`'s `fs.mkdir` → `scaffoldBoard` (mkdir fallback if the template is missing).
- **ui.log:** appended in **main** (`board-bridge.ts` notify handler, error/warning) where the board root is already session-resolved; renderer-detected **load failures** (`<webview>` `did-fail-load`) appended via a **new `fs.append`**. Indicator lives in the **side panel** (log `IconButton` + error `Dot`, reactive via a `ui.log` `FileWatcher`) — host DOM, dodging `<webview>` overlay/z-index pitfalls; click opens the log in Monaco (`openRawLink`).
- **error model (C-B):** host does **not** intercept `execute()` exit codes — the page reports its own failures via `notify(..., "error")` (template's `boardScript` does this), matching the frontend/backend split.
- **no dev-shim, no shipped `.d.ts` (C-D, user 2026-06-19 — reverses C9):** the template is a **4-file** set (`CLAUDE.md`, `index.html`, `app.js`, `scripts/hello.js`) — `style.css` folded into an inline themed `<style>`; the **dev-shim dropped** (the in-app `index.html` watch + Refresh renders against real theme + real data, superseding a browser+mock preview); **no `board-api.d.ts` shipped** (it only aids external-editor IntelliSense — board JS runs in the webview and Persephone's Monaco loads only `editor-types/` extraLibs). `CLAUDE.md` is the single authoring reference. Dropping the shim **dissolves C9** (no shim → no drift). `app.js`+`scripts/hello.js` are kept as the two halves (frontend + backend) of the one `execute()` round-trip demo.

### 2026-06-19 — US-728 reframed: Demo board (self-documenting showcase + dogfood)
- **Decision (user, 2026-06-19): reframe US-728** from a plain dogfood reference into THE canonical **Demo / "wiki" board**, grown from the working Test board (`.persephone/boards/Test/`). One board that both *teaches the platform* and *proves the full loop*:
  - Demonstrates the entire `persephone` surface — `execute()` (buffer / stream / stdin / kill / cwd), the integration tier (`openRawLink` / `notify` / file dialogs), and the US-725 **theme + token contract** (live color swatches, metric demos, `onThemeChange` readout).
  - Embeds a **recommended-components catalog** — per-component notes + **links to the `boards-assets/` skin CSS** (US-727) — and a live `execute()`→skinned-grid section as the dogfood proof.
  - Self-documenting so an agent or user can read it to learn board authoring with near-zero Persephone knowledge.
- **Offered via in-editor buttons, NOT a project-creation dialog (user, 2026-06-20 — supersedes the earlier prompt-dialog plan).** Project creation itself is dialog-free (see US-731). The demo board is offered from the Board editor instead: (a) the **empty boards view** shows two buttons — **"Create board"** and **"Create demo board"**; (b) the management toolbar's **"+ New board"** becomes a **`SplitButton`** (`uikit/SplitButton/`) whose dropdown offers **"Create demo board"**. Both wire to a `createDemoBoard` action that scaffolds the bundled demo template. No app-preference flag is needed (no auto-create, no "don't show again").
- **Demo template — to be built in US-728, prototyped from the working Test board** (`.persephone/boards/Test/`). The demo-board UI above ships *with* this task (it has nothing to scaffold until the template exists), which is why it was kept out of US-731.
- **Depends on:** US-725 (theme/tokens — done), US-726 (template + scaffold — done), US-727 (skins to link), US-731 (project-creation entry point — the demo UI lives in the Board editor it opens). Stays a placeholder; full Goal→Plan→Concerns doc written when its turn comes, seeded from the current Test board panels.

### 2026-06-20 — US-731 carved + demo-board offering reframed (user)
- **US-731 carved** (`doc/tasks/US-731-create-persephone-project/README.md`): the missing *create-a-project* entry point — a **"Create .persephone project"** folder context-menu item in the Explorer. Create-or-reveal `.persephone` → select → open Board editor; no dialog. One-file change (`ExplorerSecondaryView.tsx`) — discovery (US-722), the `persephone-folder://` scheme, and the `setSelectedHref`/`revealVersion`/`openRawLink` reveal chain all already exist.
- **Demo-board offering reframed (supersedes the project-creation prompt dialog).** Project creation is dialog-free. The demo board is offered from the Board editor: empty-state **"Create board" / "Create demo board"** buttons + a **`SplitButton`** on the "+ New board" toolbar. This demo UI ships *with* US-728 (it needs the demo template to scaffold), so it was deliberately kept out of US-731. Demo template to be prototyped from the working Test board.

### 2026-06-20 — US-730 carved (Web Boards as `browser_*` MCP automation targets)
- **Decision (user):** promote the "Live in-app board testing via MCP" future-direction into the epic — discussed making boards discoverable/drivable through the Playwright-like `browser_*` tools (already implemented for the built-in Browser). Investigation confirmed it's a single task.
- Wrote the full task doc (`doc/tasks/US-730-board-mcp-automation/README.md`).
- **Key finding:** the automation engine is **already target-agnostic** — `snapshot.ts`/`ref.ts`/`input.ts`/`CdpSession`/`cdp-service.ts` all operate on a generic `webContents` resolved by an **opaque regKey**. The *only* Browser coupling is `getTarget()` in `commands.ts:47-105` (`instanceof BrowserEditor` → `editor.target`). CDP works through the board's `sandbox`+`contextIsolation`+CSP lockdown (debugger-level AX tree / Runtime.evaluate bypass page CSP).
- **Design (user chose Option A — reuse `browser_*` tools, no new `board_*` tools):** a board needs only (1) its webContents registered for CDP, and (2) a `BoardTargetModel` (`IBrowserTarget`). Because the browser's `registerWebview` attaches browser-only listeners (`will-navigate`/`will-prevent-unload`/`before-input-event`/popup guard) that would misfire on a board, boards use a **separate lightweight CDP registry composed inside `cdp-service.ts`** (board map first, browser resolver fallback) — **zero change to `browser-service.ts`**. Registration rides the existing `api.*`→controller path (like `registerBoardProtocol`), not the sandboxed board bridge. `getTarget()` generalizes to resolve a board page (browser incognito/Tor guards stay browser-only); nav/tab tools throw a clean "not supported on board pages"; `list_pages` surfaces `board-view` pages with `selectedBoard`/`persephonePath` for discoverability.
- **Scope:** one task; fits the epic. Stays `[ ]` (deferred-review model — `/review` etc. at epic close).
