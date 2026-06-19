# US-726: Templates & scaffolding + `ui.log` + live reload

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · Foundation #8 (build order)
**Status:** Investigated — doc ready. Not started.

> **`config.json` is cut from v1** (decision 2026-06-19). With a single `boardType` (`"web-board"`) its renderer-selection role is a no-op, and its `commands` extension→template map is structurally unusable: `execute()` takes the *full command line* the page builds, so the host never gets to apply a mapping (the board author writes both the page and the scripts, so they call `execute("python scripts/load.py")` directly). A code + task-doc sweep confirmed **nothing else in the epic depends on `config.json`** (the trust gate uses `trustedProjects.txt`; protocol/theme/bridge have no dependency). It is therefore dropped from US-726, the template, and the epic folder layout. A future second board type can introduce a discriminator when it actually exists.
>
> **No `dev-shim` and no shipped `board-api.d.ts` in v1** (decision 2026-06-19). The in-app **`index.html` watch + Refresh** loop renders the board with the *real* theme and *real* `execute()` data, which supersedes a browser+mock-shim preview (the author is already running Persephone). A `.d.ts` only aids external-editor IntelliSense, which is out of v1 scope. The per-board **`CLAUDE.md`** is the single authoring reference. (Reverses epic C9's dev-shim assumption — see C-D.)

## Goal

Complete the per-board **folder lifecycle** for Web Boards:

- **Scaffold** a new board from a bundled template (a complete, working board) on create.
- Append board errors to a per-board **`ui.log`** with an on-board **indicator** that opens it (the agent-assist loop — Claude reads it to help fix the offending script).
- **Live-reload** the board when its `index.html` changes, plus a manual **Refresh** button (covers `app.js`/`css`-only edits) — the dev edit→see-changes loop, against the real theme + real data.

Depends on US-722 (board editor + create/delete), US-723 (`board://` webview), US-724 (bridge), US-725 (theme/tokens) — **all implemented**. Does **not** build the Tabulator skin/manifest (US-727) or the Demo board / create-prompt dialog (US-728).

## Background

### What the epic specifies (after the `config.json` + dev-shim cuts)

From [EPIC-034](../../epics/EPIC-034.md) → *Project & board infrastructure*:

- **Templates & scaffolding:** a bundled template (a complete folder: `CLAUDE.md`, a board-root `index.html` + `app.js`, and `scripts/`). Create = a **recursive copy** into the new (empty) `.persephone/boards/<Name>/`, **erroring if the folder already exists**. The display name lives in the **folder name** → **no name token to substitute inside files**. `library-service.ts`'s `copyDirRecursive` is a reference, but its **skip-if-exists** default is wrong here, so the copy is lightly adapted.
- **Error logging (`ui.log`) + on-board indicator:** board errors (`execute()` failures the page reports, bridge errors, board load failures) are shown as a `notify(..., "error")` **toast**, logged to the **dev-tools console**, and appended to the per-board **`ui.log`** file. A clickable on-board **indicator** opens it.

### What already exists (reuse) vs what US-726 builds

| Seam | Status | Where |
|------|--------|-------|
| Board create/delete + board list | **Exists** | `BoardEditorModel.createBoard/deleteBoard/refreshBoards`, `BoardEditorView` |
| `createBoard` template hook | **Stub** | `BoardEditorModel.ts:169` — `fs.mkdir(dir)`; comment "Population from a template … is US-726" |
| `<webview>` remount on key change | **Exists (mechanism)** | `BoardEditorView.tsx:88` keys `BoardWebview` by `selectedBoard` — add a reload dimension |
| `FileWatcher` (300 ms debounce, `stat.{mtime,size,exists}`, `dispose`) | **Exists** | `src/renderer/core/utils/file-watcher.ts` |
| Model-owned watcher lifecycle | **Precedent** | `GitTreeEditorModel` owns a `DirectoryWatcher`, disposes it in `dispose()` (`GitTreeEditorModel.ts:327,480`) |
| `copyDirRecursive` (skip-if-exists) | **Exists** | `library-service.ts:243` — adapt (drop the file-level skip) |
| Bundled-asset path resolution | **Exists** | `api.getAppRootPath()` → `fpJoin(appRoot, "assets", …)` (`library-service.ts:232`) |
| `fs.read / write / exists / stat / copyFile / mkdir / listDirWithTypes` | **Exists** | `src/renderer/api/fs.ts` |
| `fs.append` | **Missing** | add to `fs.ts` + `types/fs.d.ts` |
| Board notify → main → toast | **Exists** | preload `board:notify` → `board-bridge.ts:83` → `eBoardNotify` → `ui.notify` |
| `ui.log` file write + on-board indicator | **Missing** | main append (notify error/warning) + renderer append (load failure) + side-panel log button/dot |
| Log-open pattern (`openRawLink(logPath)`) | **Precedent** | `MnemeConfigEditorModel.openLog` (Monaco opens `.log` automatically) |
| Bundled board template folder | **Missing** | author the whole template (4 files; no `config.json`, no dev-shim, no `.d.ts`) |

### Key files (verified)

- **`src/renderer/editors/board/BoardEditorModel.ts`** — per-project model. `createBoard` (line 164) is the scaffold hook; `selectBoard` (157) is where the per-board watchers start; `dispose()` is inherited from `EditorModel` (override + `super.dispose()`).
- **`src/renderer/editors/board/BoardEditorView.tsx`** — selected-board branch (lines 84–93) renders `<BoardWebview key={selectedBoard} boardRoot=…>`.
- **`src/renderer/editors/board/BoardListSecondaryView.tsx`** — side panel (the board switcher) — host DOM, always visible while a board is shown → the home for the **Refresh + log indicator** (no `<webview>` z-index overlay risk).
- **`src/renderer/editors/board/BoardWebview.tsx`** — keyed remount = full board recreate (unregister/register `board://` partition + reload); also the natural place to catch `<webview>` `did-fail-load` for load-failure logging.
- **`src/main/board-bridge.ts`** — main-process bridge; `notify` handler (line 83) already resolves the board root via `getBoardRootForSession(event.sender.session)` → the place to append `ui.log` (main may use `fs` directly).
- **`src/renderer/editors/board/board-api.d.ts`** — the canonical `window.persephone` contract; **not** shipped into the template (C-D). The template's `CLAUDE.md` API section is written from it.

## Implementation plan

### Step 1 — `fs.append` (renderer fs primitive)

Renderer-side board **load-failure** logging (Step 5) writes `ui.log` from the renderer. In **`src/renderer/api/types/fs.d.ts`** add to `IFileSystem`:

```typescript
/** Append text to a file, creating it (and parent dirs) if needed. */
append(path: string, text: string): Promise<void>;
```

In **`src/renderer/api/fs.ts`** implement it next to `write` (reuse `_ensureDir`, then `promises.appendFile` — `nodefs` is already required at the top of the file).

### Step 2 — Bundled template folder (new) — 4 files

A complete, name-agnostic board (no token substitution) that demonstrates the **frontend ↔ `execute()` ↔ backend** loop. Bundle it as **`assets/board-template/`** (no leading dot — dodges dotfile-glob exclusion in the packager; see C-G). Files:

| File | Contents |
|------|----------|
| `CLAUDE.md` | **The single authoring reference.** Explains what a Web Board *is* — **frontend** (`index.html` + `app.js`, owns all UI + state), **backend** (`scripts/`, any language), and the **`execute()` channel** between them. Documents the full `window.persephone` surface (written from `board-api.d.ts`): the **one method** `persephone.execute(cmd, opts)` → handle, the **stdout-JSON convention** (`getJson()`), the integration tier (`openRawLink`/`notify`/dialogs), the **`--p-*` theme + `persephone.tokens`** contract, the recommended-component / skin note (forward-ref US-727), and "errors land in `ui.log` (this folder) — keep `notify(msg, 'error')` on failures so they're captured." Includes a **Persephone GitHub docs link** (placeholder until public docs exist — fill in later). |
| `index.html` | Minimal themed starter: an inline `<style>` driving everything off `var(--p-*)` (with fallbacks; CSP allows `style-src 'unsafe-inline'`), one "Run example" button, an output area. Loads `./app.js`. |
| `app.js` | **Frontend.** A tiny **`boardScript(commandLine, input?)` helper** (execute + optional stdin-JSON + `getJson`) — **no extension→command mapping**; the author passes a full command line. The example wires the button → `boardScript("node scripts/hello.js")` → renders the JSON in the output area. Reports failures via `persephone.notify(e.message, "error")` so they reach `ui.log`. |
| `scripts/hello.js` | **Backend.** `console.log(JSON.stringify({ ok: true, ts: Date.now() }))` — proves the stdout-JSON loop with `node` (most-likely-present runtime). Together with `app.js` it shows the full round-trip + the recommended `scripts/` layout (cwd = board folder, relative path). |

(A new `assets/board-template/` — does not exist yet.) Confirm `assets/` is shipped into the package (it is — `script-library/`, `pdfjs/`, `editor-types/` already are; check the `electron-builder` / forge resource config and add the new folder if the glob isn't already inclusive — C-G).

### Step 3 — Scaffold on create `src/renderer/editors/board/board-scaffold.ts` (new) + model hook

New util — resolve the template path and recursively copy (no skip-if-exists; the dest is guaranteed fresh by `createBoard`'s collision check):

```typescript
import { api } from "../../../ipc/renderer/api";
import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";

/** Recursively copy `assets/board-template/` into a fresh board dir. */
export async function scaffoldBoard(destDir: string): Promise<void> {
    const appRoot = await api.getAppRootPath();
    const templateRoot = fpJoin(appRoot, "assets", "board-template");
    await copyDirInto(templateRoot, destDir);
}

async function copyDirInto(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest);
    for (const entry of await fs.listDirWithTypes(src)) {
        const s = fpJoin(src, entry.name);
        const d = fpJoin(dest, entry.name);
        if (entry.isDirectory) await copyDirInto(s, d);
        else await fs.copyFile(s, d);           // always copy — no skip-if-exists
    }
}
```

In **`BoardEditorModel.ts`** `createBoard` (line 169), replace `await fs.mkdir(dir);` with `await scaffoldBoard(dir);` (import the util). The collision check (lines 166–168) stays — it guarantees a fresh dest, so the copy never overwrites.

> Fallback: if the template folder is missing (dev-build glitch), `scaffoldBoard` should fall back to `fs.mkdir(dest)` so Create still produces a usable (empty) board rather than throwing. Wrap the copy in try/catch → on failure, `fs.mkdir(dest)` + a one-line `ui.notify(..., "warning")`.

### Step 4 — Live reload on `index.html` change (model-owned watcher) + Refresh

Two **model-owned** watchers tied to the selected board's lifecycle (precedent: `GitTreeEditorModel`):

- **Reload** = a **`FileWatcher` on `index.html`** that bumps `reloadToken` (→ remount). `index.html` is the **only guaranteed-present, author-owned, host-never-writes-it** file (the fixed `board://` entry point). Reload **must** be driven by this single-file watch, **not** a folder watch — the folder also holds `ui.log`, which the host writes to, so a folder→reload would loop (error → log write → reload → error → …).
- **Log indicator** = a **`DirectoryWatcher` on the board folder** that re-stats `ui.log` (`refreshLogState`). It must be a *directory* watch, not a `FileWatcher` on `ui.log`: `nodefs.watch` throws on a not-yet-existent path (`file-watcher.ts:10`), so a `FileWatcher` would miss `ui.log`'s **first creation**. This watcher only re-stats — it never bumps `reloadToken`, so it can't feed the reload loop.

**`BoardEditorModel.ts`** changes:
- State: add `reloadToken: number` (default `0`) and `logHasErrors: boolean` (default `false`) to `BoardEditorState` + `getDefaultBoardEditorState`.
- Private fields: `private indexWatcher?: FileWatcher; private logDirWatcher?: DirectoryWatcher;`.
- In **`selectBoard(name)`** → `watchSelectedBoard(name)`: dispose any existing watchers, reset `reloadToken`/`logHasErrors`; if `name`, compute `boardRoot = fpJoin(persephonePath, "boards", name)` and start:
  - `indexWatcher = new FileWatcher(fpJoin(boardRoot, "index.html"), () => this.state.update(s => { s.reloadToken++; }))`.
  - `logDirWatcher = new DirectoryWatcher(boardRoot, () => void this.refreshLogState())`; call `refreshLogState()` once immediately.
  - `refreshLogState()` does `fs.stat(<boardRoot>/ui.log)` → `logHasErrors = exists && size > 0` (direct stat, not the watcher's stale `stat`).
  - On `selectBoard(undefined)`: dispose both, reset `reloadToken`/`logHasErrors`.
- Override **`dispose()`**: dispose both watchers, then `await super.dispose()`.
- Add `getSelectedBoardLogPath(): string | undefined` (for the side-panel open action).
- Add **`reloadBoard(): void`** — `this.state.update(s => { s.reloadToken++; })` — the manual Refresh action (same remount path as the watcher, just user-triggered, so it also picks up `app.js`/`css` edits).

**`BoardEditorView.tsx`** — key the webview by the reload token so an `index.html` change remounts:

```tsx
// before:  key={s.selectedBoard}
// after:
key={`${s.selectedBoard}__${s.reloadToken}`}
```

(Add `reloadToken` to the `state.use` selector at lines 34–39.)

> Editing *only* `app.js`/inline styles won't *auto*-reload (only `index.html` is watched — see C-E for why), so the side panel also gets a manual **Refresh** button (Step 5) that calls `model.reloadBoard()`.

### Step 5 — `ui.log` append (main + renderer) + Refresh & log indicator (side panel)

**Append — bridge errors (main), `src/main/board-bridge.ts`** `notify` handler (line 83). When `msg.type` is `"error"` or `"warning"`, also append a timestamped line to the board's `ui.log`:

```typescript
ipcMain.on(BoardBridgeChannel.notify, (event: IpcMainEvent, msg: BoardNotifyMsg) => {
    if (!msg?.message) return;
    ownerWindow(event)?.webContents.send(EventEndpoint.eBoardNotify, { message: msg.message, type: msg.type });
    if (msg.type === "error" || msg.type === "warning") {
        const root = getBoardRootForSession(event.sender.session);
        if (root) {
            try {
                fs.appendFileSync(path.join(root, "ui.log"),
                    `[${new Date().toISOString()}] [${msg.type}] ${msg.message}\n`);
            } catch { /* logging must never throw into the bridge */ }
        }
    }
});
```

(`fs`/`path` are node modules — main process, allowed; import at the top.) The board page reports its own errors via `notify(..., "error")` (the template's `boardScript` helper does this on `execute()` failure), so `execute()` failures land in `ui.log` through the userland helper with no bridge interception — consistent with the frontend/backend model (no host-owned error capture; see C-B).

**Append — board load failures (renderer), `BoardWebview.tsx`.** Add a `did-fail-load` listener on the `<webview>` (it already holds `webviewRef`); on failure, append `[ISO] [error] board load failed: <errorCode> <errorDescription> <validatedURL>\n` to `<boardRoot>/ui.log` via `fs.append`, and `ui.notify(..., "error")`. (`boardRoot` is already a prop.)

**Refresh + log indicator (renderer) — `BoardListSecondaryView.tsx`.** When a board is selected, show two small `IconButton`s in the panel (mirrors `MnemeConfigView.tsx:96`):

- a **Refresh** button (`RefreshIcon`, title "Reload board") → `model.reloadBoard()` — remounts the webview, picking up `app.js`/inline-style edits the `index.html` watch misses;
- a **log** button (`LogIcon`, title "Open board log") with an **error `Dot`** (`color="error"`) shown when `model.state.use(s => s.logHasErrors)`. Click → open the log via the established pattern:

```typescript
const logPath = model.getSelectedBoardLogPath();
if (logPath) await app.events.openRawLink.sendAsync(createLinkData(logPath));
```

Monaco opens `.log` automatically. The board-folder `DirectoryWatcher` (Step 4) keeps `logHasErrors` reactive — it catches `ui.log` creation, bridge-written appends, and manual/external edits, and goes quiet when the user clears/deletes the log. (Side panel = host DOM → no `<webview>` overlay/z-index pitfalls.)

Also have the **preload** `notify` `console.error` on `"error"` so it shows in the board's dev-tools console (epic requirement) — a one-line `src/preload-board.ts` change.

## Concerns / open questions

- **C-A — Two `ui.log` writers (main vs renderer). ✅ resolved.** Bridge-reported errors are appended in **main** (`board-bridge.ts`), where the board root is already resolved from the session and `fs` is freely available. Board **load failures** are appended in the **renderer** (`BoardWebview` `did-fail-load`, via the new `fs.append`, compliant with the no-`require("fs")` rule). Same `[ISO] [level] message\n` line format (a one-line format duplicated across the two bundles — acceptable; they can't share a runtime module). The renderer indicator learns of *either* write via the board-folder `DirectoryWatcher` → `fs.stat(ui.log)`.

- **C-B — What counts as a board "error" for `ui.log`. ✅ resolved (frontend/backend model).** The host does **not** intercept `execute()` exit codes to auto-log them — the page owns its own error handling and reports failures via `notify(..., "error")` (the template's `boardScript` helper does this). So `ui.log` captures `error`/`warning` notifies + renderer-detected load failures. This keeps the bridge surface minimal (no error-capture primitive) and matches EPIC-034 C6. The template's `CLAUDE.md` documents the convention so authored boards log meaningfully.

- **C-C — `config.json` cut from v1. ✅ decided (user, 2026-06-19).** See the note at the top. `commands` is unusable by `execute()` (the page sends the full command line); `boardType` is a one-value no-op; nothing else depends on it. Dropped from US-726, the template, and the epic. A future board type reintroduces a discriminator when it exists.

- **C-D — no `dev-shim` and no shipped `board-api.d.ts` (epic C9 reversed). ✅ decided (user, 2026-06-19).** The **dev-shim** existed to open `index.html` in a plain browser (mock `execute` + default `--p-*`) for offline frontend iteration. But the author runs Persephone already, and the new **`index.html` watch + Refresh** gives a faster loop against the *real* theme and *real* `execute()` data — so the shim's niche (iterate without launching the app) barely exists, and an AI author doesn't render HTML anyway. Dropping it also removes its only real cost: keeping the mock in sync with the bridge. The **`.d.ts`** likewise pays off only in an external editor (VS Code + `jsconfig.json`) — board code runs in the sandboxed webview (no editor), and Persephone's own Monaco loads only `editor-types/` extraLibs (`configure-monaco.ts:181–207`), never a sibling board `.d.ts` (it'd even show misleading script-API globals). So **neither ships**; the per-board **`CLAUDE.md`** is the single authoring reference (ideal for the agent author), written from the canonical `src/.../board-api.d.ts`. This **dissolves epic C9** (no shim → no drift). *(Future: if browser-based offline testing or VS Code autocomplete is wanted, the MCP-on-webview direction / a `.d.ts` + `jsconfig.json` are the additive options — US-728+.)*

- **C-E — `index.html`-only *auto*-reload + a manual Refresh button. ✅ resolved.** Watching `index.html` only (not the whole folder) is required to avoid the `ui.log` write→reload feedback loop, and `index.html` is the only guaranteed-present, host-never-writes-it file. To cover `app.js`/inline-style-only edits (which the watch misses), the side panel includes a manual **Refresh** button → `model.reloadBoard()` (same remount path, user-triggered). Auto + manual together give the full dev loop without the feedback-loop risk.

- **C-F — Watcher lifecycle. ✅ resolved.** The `index.html` `FileWatcher` + the board-folder `DirectoryWatcher` are model-owned and tied to `selectBoard` (start on select, dispose on deselect/reselect), re-attached on `restore()`, and disposed in the overridden `dispose()` — exactly the `GitTreeEditorModel` watcher pattern. No leak across board switches or editor close.

- **C-G — template packaging. ⚠️ verify at implementation.** Confirm the production build (`electron-builder` + forge) ships the new template folder. Recommend bundling as **`assets/board-template/`** (no leading dot) to avoid dotfile-glob exclusion; the *copied* destination still carries the `.persephone/boards/<Name>/` path. Verify the `assets/` glob is inclusive or add the folder explicitly.

## Acceptance criteria

1. **Create scaffolds from the template.** Creating a board copies the full template into `.persephone/boards/<Name>/` (CLAUDE.md, index.html, app.js, scripts/hello.js). The collision error still fires on a duplicate name. A new board renders (themed) immediately and its "Run example" button executes `scripts/hello.js` and shows the JSON. No `config.json`, no `board-api.d.ts`, no `dev-shim.js` are created.
2. **Live reload + Refresh.** Editing the board's `index.html` while it's open remounts the webview (the board reloads). The side-panel **Refresh** button remounts on demand (picks up `app.js`/inline-style edits). Switching boards / closing the editor disposes the watcher (no leak; verify via repeated open/close).
3. **`ui.log` + indicator.** A board that calls `notify(msg, "error")` appends a timestamped line to its `ui.log` (and toasts); a board that fails to load (`did-fail-load`) appends a load-failure line. The side panel shows a log button with an **error dot** while `ui.log` is non-empty; clicking it opens `ui.log` in a Monaco page. Clearing/deleting `ui.log` clears the dot (watcher-driven).
4. **`fs.append`** appends + creates the file/parents; covered by use.
5. `npm run lint` + `tsc --noEmit` clean; renderer code uses `app.fs` + `file-path` (no `require("fs")`/`require("path")`); no hardcoded colors (the template's own inline CSS uses `--p-*`, which is exempt — author-facing board content, not Persephone UI).

### How to verify

Manual: create a board via the Board editor → confirm the template files land (CLAUDE.md, index.html, app.js, scripts/hello.js — and **no** `config.json`/`.d.ts`/`dev-shim.js`) and the board renders + runs the example; edit `index.html` → confirm auto-reload; edit `app.js` then click **Refresh** → confirm reload; make the page `notify(x,"error")` → confirm `ui.log` grows and the side-panel dot lights and opens the log; rename `index.html` away → confirm the load-failure line is logged.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/api/types/fs.d.ts` | **Edit** — add `append(path, text)` to `IFileSystem`. |
| `src/renderer/api/fs.ts` | **Edit** — implement `append` (ensure-dir + `appendFile`). |
| `assets/board-template/` | **New folder** — `CLAUDE.md` (the authoring reference), `index.html` (inline themed `<style>`), `app.js` (frontend + `boardScript`), `scripts/hello.js` (backend). **No `config.json`, no `board-api.d.ts`, no `dev-shim.js`.** |
| `src/renderer/editors/board/board-scaffold.ts` | **New** — `scaffoldBoard(destDir)` (resolve template + recursive copy, no skip; mkdir fallback). |
| `src/renderer/editors/board/BoardEditorModel.ts` | **Edit** — `createBoard` → `scaffoldBoard`; add `reloadToken`/`logHasErrors` state; `index.html` `FileWatcher` + board-folder `DirectoryWatcher` (`watchSelectedBoard`/`refreshLogState`) in `selectBoard`/`restore`; `reloadBoard()`; `getSelectedBoardLogPath`; override `dispose()`. |
| `src/renderer/editors/board/BoardEditorView.tsx` | **Edit** — key `BoardWebview` by `${selectedBoard}__${reloadToken}` (+ selector). |
| `src/renderer/editors/board/BoardWebview.tsx` | **Edit** — `did-fail-load` → append load failure to `ui.log` (`fs.append`) + toast. |
| `src/renderer/editors/board/BoardListSecondaryView.tsx` | **Edit** — Refresh `IconButton` → `reloadBoard()`; log `IconButton` + error `Dot` (when `logHasErrors`) → `openRawLink(logPath)`. |
| `src/main/board-bridge.ts` | **Edit** — `notify` handler appends `error`/`warning` to `<boardRoot>/ui.log`. |
| `src/preload-board.ts` | **Edit (small)** — `notify` also `console.error` on `"error"` (dev-tools console). |
| Build config (`electron-builder` / `forge.config.ts`) | **Verify/Edit (C-G)** — ensure `assets/board-template/` ships. |

### Files needing NO changes

- `src/main/board-protocol-service.ts` — `getBoardRootForSession` already exposes the root for the main-side `ui.log` append.
- `src/renderer/editors/board/board-api.d.ts` — the canonical contract; CLAUDE.md's API section is written from it; not shipped into the template (C-D); unchanged.
- `src/ipc/board-bridge-channels.ts`, `src/renderer/api/internal/RendererEventsService.ts` — the notify toast path is reused as-is.
