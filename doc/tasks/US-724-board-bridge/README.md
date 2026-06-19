# US-724: `persephone` bridge (board preload) — `execute()` handle + integration tier

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md)
**Status:** Active (investigated — ready for implementation)
**Created:** 2026-06-19

## Goal

Replace the sentinel `window.persephone` (shipped by US-723) with the **real board bridge**: the object the board page programs against. Two tiers:

1. **`execute(commandLine, opts?)` → handle** — the kernel. A thin client that forwards to the **already-shipped US-719 command runner** over `ipcRenderer` and presents an `ExecuteHandle` (stream / buffer / write-stdin / kill) to the page. Default `cwd` = the board folder.
2. **Integration tier** — the in-app effects `execute()` cannot express: `openRawLink(href)`, `notify(msg, type)`, and native `openFileDialog` / `saveFileDialog` / `openFolderDialog`.

Out of scope (later tasks, must not be added here): `persephone.theme` / `onThemeChange` (**US-725**); the bundled dev-shim, `config.json`, `ui.log`, per-board `CLAUDE.md`, `boardScript` userland helper (**US-726**).

## Background

Investigation 2026-06-19. Everything this task consumes already exists:

### US-719 runner — shipped and ahead of its doc

- **`src/main/command-runner.ts`** — `initCommandRunner()` registers `ipcMain.on(RunnerChannel.start/stdin/endStdin/kill)`. Keys jobs by `jobId`; streams `stdout`/`stderr` (coalesced ~16 ms, binary `Uint8Array`) / `exit` / `error` back to **`event.sender`**. Already implements **tree-kill** (`taskkill /T` on Windows / process-group kill on POSIX — US-720's job, shipped early) and **per-sender reaping** (`wireSenderReaping(event.sender)` → on `destroyed`/`render-process-gone`, tree-kill all that sender's jobs). **Consequence for boards:** because the board webview *is* `event.sender`, its child processes are reaped automatically when the webview is destroyed (board switch remounts via `key={selectedBoard}`, board close, crash) — EPIC-034 C8 and US-720's board-lifecycle reaping are **already satisfied**, no extra wiring needed here.
- **`src/ipc/runner-channels.ts`** — dependency-free `RunnerChannel` enum + message types (`RunnerStartMsg`, `RunnerChunkMsg`, `RunnerExitMsg`, `RunnerErrorMsg`, `RunnerSpawnOptions`). Its header explicitly states it exists *"so a sandboxed board preload (US-724) can import it and talk to the main service over raw `ipcRenderer`."* **This is the contract this task imports.**
- **`src/renderer/api/proc.ts`** — the renderer client. Its `class ExecuteHandle implements IExecuteHandle` is the **reference implementation** the board preload mirrors. **It cannot be reused as-is** — it uses `window.electron.ipcRenderer` (the main-renderer preload's wrapper: `.sendMessage(...)`, and `.on(...)` returns an unsubscribe fn, listener gets `(msg)` with the IpcRendererEvent stripped). The board webview has **no `window.electron`** — it gets **raw** `ipcRenderer` from `import { ipcRenderer } from "electron"`, where `.send(...)`, `.on(channel, (event, ...args) => …)` (event NOT stripped), and teardown is `removeListener`. So the handle logic is re-expressed against raw `ipcRenderer`. The **types** (`IExecuteHandle`, `IExecuteOptions`, `IExitInfo`, `IExecuteError`) live in `src/renderer/api/types/proc.d.ts` today (see C-E for the shared-type recommendation).

### Sandboxed-preload constraints (the hard boundary)

The board webview is locked down (`src/renderer/editors/board/BoardWebview.tsx`): `webpreferences="contextIsolation=yes,sandbox=yes"`, `preload={BOARD_PRELOAD_URL}`. A **sandboxed** preload:
- May `import { contextBridge, ipcRenderer } from "electron"` (Electron provides the sandboxed subset: `ipcRenderer.send/sendSync/invoke/on/once/removeListener/postMessage` + `contextBridge`).
- May import only **dependency-free** modules (pure constants/types) — Vite bundles them into `preload-board.js`. `src/ipc/runner-channels.ts` qualifies; the new `src/ipc/board-bridge-channels.ts` will too. It may **not** import anything from `src/renderer` or `src/main` (renderer/main bundles, Node built-ins).
- Build wiring already exists (US-723): `src/preload-board.ts` entry in `forge.config.ts`, `vite.preload-board.config.ts`, and `window.boardPreloadUrl` from `src/preload.ts`.

### contextBridge handle marshalling (verified pattern)

`contextBridge.exposeInMainWorld` supports: exposing **functions**; functions **returning objects whose properties are functions** (proxied); **passing callbacks as arguments** (proxied, invokable from the isolated world); and cloning `Uint8Array` across worlds. So `execute()` returning a freshly-built `{ jobId, on, getText, getJson, getBytes, write, endStdin, kill }` works, and `on("stdout", cb)` delivering `Uint8Array` chunks to the page's `cb` works — the handle's mutable state (chunk buffers, listener arrays) lives in the **isolated world** (preload), the page sees only proxied methods. Coalescing in main (~16 ms) keeps the per-chunk cross-world clone count sane.

### Integration-tier seams (each verified in code)

| Method | Seam |
|--------|------|
| `openRawLink(href)` | Main → embedder window renderer push, then the existing renderer handler. `RendererEventsService.handleOpenFile` (`src/renderer/api/internal/RendererEventsService.ts:36`) already does `app.events.openRawLink.sendAsync(createLinkData(filePath))`, driven by `win.webContents.send(EventEndpoint.eOpenFile, …)` (`src/main/open-windows.ts:108`). `createLinkData(href)` accepts any href (file **or** URL — `eOpenUrl` uses the same call). **Reuse `eOpenFile`.** |
| `notify(msg, type)` | No existing renderer push carries a `{message,type}` toast. Add **`EventEndpoint.eBoardNotify`** → new `RendererEventsService` subscriber calling `ui.notify(message, type)` (`src/renderer/api/ui.ts:38`). |
| `openFileDialog` / `saveFileDialog` / `openFolderDialog` | **Reuse** `showOpenFileDialog` / `showSaveFileDialog` / `showOpenFolderDialog` (`src/ipc/main/dialog-handlers.ts`). They take a `BrowserWindow` parent; the board-bridge handler passes `BrowserWindow.fromWebContents(event.sender)` — for a `<webview>` that resolves to the **embedder window**, which is the correct parent for a modal dialog (a detached webview/child process has no window handle — the epic's rationale for these being host-only). Param types: `OpenFileDialogParams` / `SaveFileDialogParams` / `OpenFolderDialogParams` (`src/ipc/api-param-types.ts`). |
| board root (default `cwd`) | `src/main/board-protocol-service.ts` already holds `Map<partition, boardRoot>`. Add a `Map<Electron.Session, string>` populated in `registerBoardProtocol` (it already calls `session.fromPartition(partition)` — store that Session → root) + `getBoardRootForSession(session)`. On any board IPC, `event.sender.session` **is** that Session instance, so main resolves the board root with no id in the message. |

### IPC style decision

`execute()` rides the **existing `RunnerChannel`** (Pattern B, fire-and-stream). The integration tier gets its **own** dependency-free channel module + a single main-side registrar, kept separate from the runner so the runner stays board-agnostic:

- **`board:get-context`** — `ipcMain.handle` / `ipcRenderer.sendSync` (see C-B; resolved synchronously at preload init).
- **`board:open-raw-link`** — fire-and-forget `ipcRenderer.send` → `ipcMain.on`.
- **`board:notify`** — fire-and-forget `ipcRenderer.send` → `ipcMain.on`.
- **`board:open-file-dialog` / `board:save-file-dialog` / `board:open-folder-dialog`** — `ipcMain.handle` / `ipcRenderer.invoke` (need a return path); the handler delegates to the existing `dialog-handlers.ts` functions. Using a board-owned `handle`/`invoke` pair avoids the preload re-implementing the typed `Endpoint` layer's `commandId` correlation wire-format (`bindEndpoint` uses `.send`+`event.reply`, not `.handle`), and keeps all integration IPC uniform.

## Implementation plan

### 1. `src/ipc/board-bridge-channels.ts` (new — dependency-free)

Channel-name constants + payload/return types for the integration tier. **No imports from `src/main` or `src/renderer`** (mirrors `runner-channels.ts`). Also re-export, from here or `runner-channels.ts`, the small shared API surface so the dev-shim (US-726) can target one shape.

```ts
export enum BoardBridgeChannel {
    getContext     = "board:get-context",       // sendSync → { boardRoot: string }
    openRawLink    = "board:open-raw-link",      // send { href }
    notify         = "board:notify",             // send { message, type }
    openFileDialog = "board:open-file-dialog",   // invoke (params) → string[] | undefined
    saveFileDialog = "board:save-file-dialog",   // invoke (params) → string | undefined
    openFolderDialog = "board:open-folder-dialog", // invoke (params) → string[] | undefined
}

export interface BoardContext { boardRoot: string }
export type BoardNotifyType = "info" | "success" | "warning" | "error";
export interface BoardNotifyMsg { message: string; type?: BoardNotifyType }
export interface BoardOpenRawLinkMsg { href: string }
```

Dialog param types are imported as **types only** from `src/ipc/api-param-types.ts` (that module is already dependency-free / shared — confirm during impl; if it pulls renderer/main code, re-declare the minimal param shapes here instead).

### 2. `src/main/board-protocol-service.ts` (edit)

Add Session-keyed resolution next to the existing partition map:

```ts
const sessionToRoot = new Map<Electron.Session, string>();
// in registerBoardProtocol(partition, boardRoot), after `const ses = session.fromPartition(partition);`
sessionToRoot.set(ses, path.resolve(boardRoot));
// in unregisterBoardProtocol(partition): sessionToRoot.delete(session.fromPartition(partition));
export function getBoardRootForSession(ses: Electron.Session): string | undefined {
    return sessionToRoot.get(ses);
}
```

### 3. `src/main/board-bridge.ts` (new) — integration-tier IPC registrar

`export function initBoardBridge(): void` registering all `BoardBridgeChannel` handlers. For every handler resolve `const win = BrowserWindow.fromWebContents(event.sender)` and `const root = getBoardRootForSession(event.sender.session)`.

- `ipcMain.on(getContext` …) — **also** handle the sync path: `ipcMain.on(BoardBridgeChannel.getContext, (event) => { event.returnValue = { boardRoot: getBoardRootForSession(event.sender.session) ?? "" }; })` (sendSync uses `event.returnValue`).
- `ipcMain.on(openRawLink, (event, { href }) => win?.webContents.send(EventEndpoint.eOpenFile, href))`.
- `ipcMain.on(notify, (event, { message, type }) => win?.webContents.send(EventEndpoint.eBoardNotify, { message, type }))`.
- `ipcMain.handle(openFileDialog, (event, params) => showOpenFileDialog(BrowserWindow.fromWebContents(event.sender), params))`; same for save / folder (delegate to the imported `dialog-handlers.ts` functions).

Call `initBoardBridge()` in `src/main/main-setup.ts` alongside `initCommandRunner()`.

### 4. `src/ipc/api-types.ts` (edit) — add the notify push endpoint

- Add `eBoardNotify = "eBoardNotify"` to the `EventEndpoint` enum (near `eOpenFile`, line ~199).
- Add to the `EventObject` map (line ~229): `[EventEndpoint.eBoardNotify]: EventObject<{ message: string; type?: NotificationType }>;` (import `NotificationType` or inline the union). `openRawLink` reuses `eOpenFile` — no new endpoint.

### 5. `src/renderer/api/internal/RendererEventsService.ts` (edit)

In `init()` add `rendererEvents[EventEndpoint.eBoardNotify].subscribe(this.handleBoardNotify);` and:

```ts
private handleBoardNotify = ({ message, type }: { message: string; type?: NotificationType }) => {
    void ui.notify(message, type ?? "info");
};
```

(Confirm `rendererEvents` exposes the new endpoint automatically; the existing `eUpdateAvailable` access via `rendererEvents[EventEndpoint.x]` shows the indexed pattern.)

### 6. `src/preload-board.ts` (rewrite) — the real bridge

```
import { contextBridge, ipcRenderer } from "electron";
import { RunnerChannel, RunnerSpawnOptions, RunnerChunkMsg, RunnerExitMsg, RunnerErrorMsg } from "./ipc/runner-channels";
import { BoardBridgeChannel, BoardContext, BoardNotifyType } from "./ipc/board-bridge-channels";
```

- **Resolve board root synchronously at init** (before exposing the bridge — see C-B): `const { boardRoot } = ipcRenderer.sendSync(BoardBridgeChannel.getContext) as BoardContext;`
- **`createBoardHandle(command, opts)`** — re-express `proc.ts`'s `ExecuteHandle` against raw `ipcRenderer`:
  - `jobId = \`b_${++idCounter}_${Date.now()}\``.
  - Subscribe with **named listeners** `ipcRenderer.on(RunnerChannel.stdout, (_event, msg: RunnerChunkMsg) => { if (msg.jobId !== jobId) return; … })` for stdout/stderr/exit/error; teardown via `ipcRenderer.removeListener(channel, listener)` on finish.
  - Same mode state machine (idle/buffered/streaming), buffered-vs-streaming exclusivity, `getText`/`getJson`/`getBytes`/`write`/`endStdin`/`kill`, three-signal semantics, `RunnerError` on non-zero exit / parse failure — copy the proven logic from `proc.ts`.
  - **Default `cwd`**: `const finalOpts: RunnerSpawnOptions = { cwd: boardRoot, ...opts };` then `ipcRenderer.send(RunnerChannel.start, { jobId, command, opts: finalOpts })`.
- **`execute(command, opts)`** returns the handle object (plain object with the methods — contextBridge proxies them).
- **Integration methods**: `openRawLink(href) => ipcRenderer.send(BoardBridgeChannel.openRawLink, { href })`; `notify(message, type) => ipcRenderer.send(BoardBridgeChannel.notify, { message, type })`; `openFileDialog(params) => ipcRenderer.invoke(BoardBridgeChannel.openFileDialog, params)` (+ save / folder).
- `contextBridge.exposeInMainWorld("persephone", { version, execute, openRawLink, notify, openFileDialog, saveFileDialog, openFolderDialog });` (drop `version` or keep a stable string — US-725/726 extend the same object with `theme`/`onThemeChange`).

### 7. `src/renderer/api/types/board-api.d.ts` (new) — the public board-author API

Ambient `interface PersephoneBoardApi { execute(...): ExecuteHandle; openRawLink(href): void; notify(message, type?): void; openFileDialog(...): Promise<string[]|undefined>; … }` plus `declare global { interface Window { persephone: PersephoneBoardApi } }`, reusing the handle types. This is the contract the dev-shim (US-726) and skins program against. (Do **not** edit `assets/editor-types/` — generated.)

### 8. Build config — verify only

`vite.preload-board.config.ts` is `{}` (US-723). Confirm the new `src/ipc/*` imports bundle into `preload-board.js` and `electron` stays external (forge preload target). If `sendSync`/`invoke` payloads or the bundle misbehave, add `build.rollupOptions.external = ["electron"]` — but the default forge preload target should already handle it.

## Concerns / open questions

- **C-A — contextBridge handle proxying (RESOLVED — standard pattern).** Returning an object-of-functions from a bridged `execute()`, passing the page's `cb` into `on(...)`, and cloning `Uint8Array` chunks back all work across `contextIsolation` worlds. Handle state stays in the isolated world. Main-side ~16 ms coalescing bounds the cross-world clone rate. If a board ever needs very-high-throughput streaming, the `MessageChannelMain` optimization (epic C3) is the future lever — not v1.
- **C-B — `cwd` resolution race (RESOLVED — sendSync at init).** The bridged `execute()` is synchronous (returns a handle now), so the board root must be known before the first call. Resolve it **once, synchronously, at preload top-level** via `ipcRenderer.sendSync(getContext)` (main replies on `event.returnValue` from the Session→root map) before `exposeInMainWorld`. One blocking round-trip at webview init, before any page JS runs — no async queue, no race. (Alternative considered — deferring the `start` send behind an async `contextReady` promise — rejected as more complex for no benefit.)
- **C-C — `openRawLink` reuses `eOpenFile` (RESOLVED, with a note).** `eOpenFile`'s renderer handler is exactly `openRawLink(createLinkData(href))`, and `createLinkData` is href-agnostic (file or URL), so reuse is correct and DRY. **Note:** if a board later needs to pass link *options* (e.g. `browserMode`), add a dedicated `eBoardOpenRawLink` carrying a partial `ILinkData` rather than overloading `eOpenFile`. v1 is href-only.
- **C-D — dialog parenting (RESOLVED).** `BrowserWindow.fromWebContents(<webview>.webContents)` returns the embedder `BrowserWindow`, the correct modal parent. The existing handlers already guard `undefined` → resolve `undefined`. Multi-window safe (resolves per-call from `event.sender`).
- **C-E — handle type drift (DECIDED — do the shared-type move; user, 2026-06-19).** The board preload **reimplements** `ExecuteHandle` (can't import `proc.ts` — a `window.electron` renderer module). To honor epic C9 ("one shared API shape, can't silently drift"), **move the handle TS contract** (`IExecuteHandle`, `IExecuteOptions`, `IExitInfo`, `IExecuteError`) from `src/renderer/api/types/proc.d.ts` into the dependency-free `src/ipc/runner-channels.ts`, and have both `proc.ts` and the board preload import it. Mechanics: these types are currently in a `.d.ts` (ambient/script-facing); when relocating to `runner-channels.ts` they become **exported `interface`s** (real module exports) — update `proc.ts`'s import (it currently pulls them from `./types/proc`) and check `proc.d.ts`/`AppWrapper.ts` for the script-global `IProc`/handle declarations so the script-facing `app.proc` typing still resolves (the script-global `.d.ts` may re-export or re-declare from the new home). The *implementation* stays duplicated (raw vs `window.electron` `ipcRenderer`) — only the type is shared; acceptable and unavoidable.
- **C-F — error logging / `ui.log` deferred (BOUNDARY — US-726).** This task surfaces `execute()` failures only via the handle's `error` event / `getJson` reject (the page decides what to do) and `notify()`. The per-board `ui.log` file + on-board error indicator + the dev-tools console wiring are **US-726**. Don't build them here.
- **C-G — trust gate already gates the bridge (RESOLVED).** `BoardEditorView` only mounts `BoardWebview` for a trusted project (US-721/722), so the preload — and therefore `execute()` — only exists for trusted boards. The bridge needs **no** per-call trust check; the single consent point (epic C4) holds. The preload is attached **only** to the `board://` webview, never a remote origin.
- **C-H — preload bundle / `electron` import in a sandboxed preload (LOW RISK, verify at build).** `import { ipcRenderer } from "electron"` in a sandboxed preload is supported at runtime; the only risk is the Vite/forge bundle accidentally inlining or mis-externalizing `electron`. The existing `preload-board.ts` already imports `contextBridge` from `electron` and builds, so adding `ipcRenderer` + dependency-free `src/ipc/*` imports should be fine — confirm `preload-board.js` runs and `sendSync` returns before first paint.
- **C-I — `api-param-types.ts` importability (verify).** The dialog param types must be importable into the dependency-free `board-bridge-channels.ts` / preload. If `api-param-types.ts` is type-only (no runtime/renderer deps) it's safe to `import type`; if not, re-declare the minimal `{ title?, defaultPath?, filters?, multiSelections? }` shapes in `board-bridge-channels.ts`.

## Acceptance criteria

Verified by a throwaway board (e.g. `.persephone/boards/Test/index.html`) calling the bridge, with `npm start` (full restart — main + preload changed):

- **execute one-shot:** `await window.persephone.execute('node -e "console.log(1)"').getText()` → `"1\n"`.
- **execute JSON + reject:** `getJson()` parses stdout; rejects on non-zero exit with `exitCode` + captured `stderr`.
- **streaming:** `execute(longRunning).on("stdout", cb)` invokes `cb(Uint8Array)` live; `on("exit", cb)` fires once.
- **stdin + kill:** `write` / `endStdin` round-trip; `kill()` fires `exit` and the child (and its tree) is gone.
- **default cwd:** a script that prints `process.cwd()` returns the **board folder** when `opts.cwd` is omitted; an explicit `opts.cwd` overrides.
- **process reaping:** switching boards / closing the board page kills that board's running children (existing sender-reaping; verify in Task Manager / via a lingering `node` child).
- **openRawLink:** `persephone.openRawLink("<a file or https URL>")` opens it in a new Persephone page in the embedder window.
- **notify:** `persephone.notify("hi", "success")` shows a toast.
- **dialogs:** `await persephone.openFileDialog({})` opens a native open-file dialog parented to the app window and resolves the chosen path(s); save / folder likewise.
- **isolation intact:** from the board page devtools, `window.require`, `window.process`, `window.electron`, `ipcRenderer` are all `undefined`; only `window.persephone` exists.
- `npm run lint` clean; `src/ipc/board-bridge-channels.ts` imports nothing from `src/main`/`src/renderer` (preload-importable).

## Files changed (summary)

| File | Change |
|------|--------|
| `src/ipc/board-bridge-channels.ts` | **new** — `BoardBridgeChannel` enum + payload/return types (dependency-free; shared with the preload) |
| `src/main/board-bridge.ts` | **new** — `initBoardBridge()`; integration-tier IPC handlers (context, open-raw-link, notify, dialogs) |
| `src/preload-board.ts` | **rewrite** — real `persephone` bridge: `execute()` handle (raw `ipcRenderer` over `RunnerChannel`, default cwd = board root) + integration methods, via `contextBridge` |
| `src/main/board-protocol-service.ts` | add `sessionToRoot` map + `getBoardRootForSession(session)`; populate on register, clear on unregister |
| `src/main/main-setup.ts` | call `initBoardBridge()` alongside `initCommandRunner()` |
| `src/ipc/api-types.ts` | add `EventEndpoint.eBoardNotify` + its `EventObject<{message,type}>` entry |
| `src/renderer/api/internal/RendererEventsService.ts` | subscribe `eBoardNotify` → `ui.notify` |
| `src/renderer/api/types/board-api.d.ts` | **new** — public `window.persephone` API typings for board authors |
| `src/ipc/runner-channels.ts` *(C-E, decided)* | move the shared handle TS contract here from `proc.d.ts` (as exported interfaces); `proc.ts` + preload both import it |
| `src/renderer/api/types/proc.d.ts` *(C-E)* | drop the relocated handle interfaces; keep / re-point the script-global `app.proc` typing to the new home |

### Files needing NO changes

- `src/main/command-runner.ts` — the runner is consumed as-is; the board webview is `event.sender`, so streaming + reaping already target it. **Do not modify.**
- `src/renderer/api/proc.ts` — reference impl; **the C-E move touches it** only to re-point its handle-type import to `runner-channels.ts` (logic unchanged).
- `src/ipc/main/dialog-handlers.ts` — reused as-is (called from `board-bridge.ts`).
- `src/renderer/editors/board/BoardWebview.tsx` — already wires the preload + sandbox (US-723); the bridge "just appears" on `window.persephone`.
- `src/ipc/main/controller.ts` / `src/ipc/renderer/api.ts` — the integration tier uses board-owned channels + reused dialog handlers; the typed `Endpoint`/`Api` request/response layer is untouched.
- `assets/editor-types/` — generated build artifact (do not hand-edit).
