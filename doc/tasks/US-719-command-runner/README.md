# US-719: Command runner — streaming main-process spawn service + IPC

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md)
**Status:** Active (investigated — ready for implementation)
**Created:** 2026-06-18

## Goal

Add a **streaming, long-lived, bidirectional command runner** in the **main process**, reachable over IPC: spawn a child process from a command-line string, **stream** its `stdout` / `stderr` / `exit` / `error` back to the caller, and let the caller **write to stdin** and **kill** the running child — all keyed by a per-spawn **`jobId`**. This is the engine behind `persephone.execute()` (the Web Board kernel) and is the **first foundation** of EPIC-034.

The runner is **board-agnostic**: it spawns and streams; it knows nothing about boards, trust, or the `board://` origin. It is consumed by three front-ends, of which **this task ships one** (the renderer `app` API) to prove the engine end-to-end:

| Consumer | Owner | Notes |
|----------|-------|-------|
| Renderer `app` API (`app.proc.execute`) | **US-719 (this task)** | Usable from Persephone scripts; the end-to-end proof. |
| Board preload bridge (`persephone.execute`) | US-724 | Sandboxed preload; **reuses this task's channels + handle types** (cannot import the renderer bundle). |
| MCP tool (`execute`) | *(optional, deferred)* | A thin `case` in `mcp-handler.ts`; not required for v1. |

**Scope boundary with US-720 (tree-kill):** this task ships per-job `child.kill()` (SIGTERM on the direct child) + a `killAll()` on app quit. **US-720** upgrades that to a whole-**process-tree** kill (Windows Job Object / `taskkill /T`) and ties reaping to board-webview close/reload/crash. The `jobId`-keyed registry built here is exactly what US-720 extends — design it so US-720 only swaps the kill implementation.

## Background

Investigation 2026-06-18. Persephone has **no generic command runner** and **no streaming spawn service** today — every spawn is a single-purpose singleton (`tor-service.ts`, `mneme-service.ts`). The sibling task **US-699** (`doc/tasks/US-699-command-runner/README.md`, EPIC-033, frozen) designed the **request/response** variant and explicitly deferred streaming: *"Live incremental stdout … would follow the Tor pattern (Pattern B) — a separate future task."* **US-719 is that task.** US-699's spawn blueprint (try/catch around `spawn`, `windowsHide: true`, `error` + `close` handlers, env merge, app-quit cleanup) carries over; what's new here is the **streaming, id-keyed, bidirectional** protocol.

### The architectural template: the async-worker system

The runner mirrors the existing **worker system** almost exactly — same shape, `ChildProcess` instead of `Worker`. Three files form the template:

**1. Shared channel enum — `src/ipc/worker-channels.ts`:**
```ts
export enum WorkerChannel {
    start = "worker:start", result = "worker:result", error = "worker:error",
    proxyCall = "worker:proxy-call", proxySet = "worker:proxy-set", proxyResult = "worker:proxy-result",
}
```
A plain enum of ad-hoc string channels — **not** in the typed `Endpoint`/`EventEndpoint` enums. Importable by main **and** renderer **and** a sandboxed preload (pure constants, no bundle deps). This is the model for `src/ipc/runner-channels.ts`.

**2. Main host — `src/main/worker-host.ts`:**
- `const activeWorkers = new Map<string, Worker>()` — **keyed by `id`** (worker-host.ts:133).
- `ipcMain.on(WorkerChannel.start, (event, { id, … }) => { … activeWorkers.set(id, worker) … })` (worker-host.ts:139).
- Streams back keyed by id: `event.sender.send(WorkerChannel.result, { id, value })` (worker-host.ts:157).
- Accepts **follow-up** messages routed to the live job: `ipcMain.on(WorkerChannel.proxyResult, (_e, { id, … }) => activeWorkers.get(id)?.postMessage(…))` (worker-host.ts:213-228). ← this is the stdin-write / kill path's model.
- `cleanup()` deletes from the map + terminates (worker-host.ts:148).

**3. Renderer client — `src/renderer/scripting/worker/WorkerRunner.ts`:**
- Generates the id: `const id = \`w_${++idCounter}_${Date.now()}\`` (WorkerRunner.ts:49).
- Subscribes per channel and **filters by id**: `ipcRenderer.on(WorkerChannel.result as unknown as never, (msg) => { if (msg.id !== id) return; … })` (WorkerRunner.ts:73-86). `ipcRenderer.on` **returns an unsubscribe fn** (collected in `cleanups`).
- Note the **`as unknown as never` cast**: `window.electron.ipcRenderer.on/sendMessage` are typed to `Endpoint | EventEndpoint` (`src/preload.ts`), so ad-hoc channels need the cast — follow this precedent.
- Sends start last: `ipcRenderer.sendMessage(WorkerChannel.start as unknown as never, { id, … })` (WorkerRunner.ts:129).

### Pattern B (main → renderer push) — the simpler precedent

`src/main/tor-service.ts` shows the one-way streaming half: `win.webContents.send(TorChannel.log, line)` (tor-service.ts:230) fan-out to all windows, with the spawn lifecycle (`child.stdout.on("data")` / `stderr` / `on("error")` / `on("close")`, tor-service.ts:116-153) and the lazy `try/catch` around `spawn` (tor-service.ts:94-101). The runner reuses this spawn shape but sends **keyed by `jobId`** to the **originating `event.sender`** (not broadcast).

### Binary over IPC (verified)

`Uint8Array` crosses the IPC boundary via **structured clone** (not JSON) — `Endpoint.capturePageRegion` returns `Promise<Uint8Array>` (`api-types.ts:189`, `controller.ts:365`, `api.ts:342`). `Buffer` is a `Uint8Array` subclass and crosses the same way. So stdout/stderr chunks are sent as **`Uint8Array`** (efficient binary), confirming the epic's C3 decision (*"structured clone, not JSON — send chunks as `Uint8Array`"*).

### Renderer `app` object model — `src/renderer/api/app.ts`

Namespaces are private backing fields wired lazily in `initServices()` via dynamic `import()` in a `Promise.all` (app.ts:124-151), each exposed by a readonly getter (e.g. `get fs(): IFileSystem { return this._fs; }`, app.ts:57). A new `app.proc` namespace follows the same pattern: add `_proc`, `get proc()`, and `import("./proc")` in the `Promise.all`.

### Preload reachability (the US-724 constraint, decided here)

- Main renderer preload `src/preload.ts` exposes `window.electron.ipcRenderer` (typed to `Endpoint | EventEndpoint`).
- Webview preload `src/preload-webview.ts` uses **raw** `require("electron").ipcRenderer` directly (no wrapper, no typed channels).
- **Consequence:** US-724's sandboxed board preload **cannot** import `src/ipc/renderer/api.ts` (renderer-bundle module). It must talk raw `ipcRenderer` on the **same string channels** defined in `src/ipc/runner-channels.ts`. Therefore the channel enum **and the handle's TypeScript types** must live in a dependency-free `src/ipc/` module both preload and renderer can import. This task creates that module so US-724 just imports it.

### App-quit cleanup — `src/main/main-setup.ts`

Services that own children add their stop to the `app.on("will-quit", …)` block (`torService.shutdown()`, `shutdownMneme()`, ≈ lines 127-133). Worker host / tor handlers are initialized in main-setup's init (`initWorkerHost()`, `initTorHandlers()`). The runner adds `initCommandRunner()` there and `killAllCommands()` to `will-quit`.

## The handle API (the public contract)

`app.proc.execute(commandLine, { cwd?, env?, shell? })` → an `ExecuteHandle`:

```ts
// src/ipc/runner-channels.ts — shared, dependency-free (importable by main, renderer, preload)
export enum RunnerChannel {
    start   = "runner:start",    // renderer/preload → main: { jobId, command, opts }
    stdin   = "runner:stdin",    // → main: { jobId, data: string | Uint8Array }
    endStdin= "runner:end-stdin",// → main: { jobId }
    kill    = "runner:kill",     // → main: { jobId, signal? }
    stdout  = "runner:stdout",   // main → caller: { jobId, chunk: Uint8Array }
    stderr  = "runner:stderr",   // main → caller: { jobId, chunk: Uint8Array }
    exit    = "runner:exit",     // main → caller: { jobId, code: number|null, signal: string|null }
    error   = "runner:error",    // main → caller: { jobId, message: string }  (spawn-level failure)
}

export interface ExecuteOptions { cwd?: string; env?: Record<string, string>; shell?: boolean | string; }
export interface ExitInfo { code: number | null; signal: string | null; }

export interface ExecuteHandle {
    readonly jobId: string;
    // Streaming consumers (attach synchronously after execute()):
    on(event: "stdout" | "stderr", cb: (chunk: Uint8Array) => void): () => void; // returns unsubscribe
    on(event: "exit",  cb: (info: ExitInfo) => void): () => void;
    on(event: "error", cb: (err: { message: string }) => void): () => void;
    // One-shot consumers (buffer stdout to completion). Mutually exclusive with on("stdout"/"stderr") — see contract.
    getText(): Promise<string>;
    getJson<T = unknown>(): Promise<T>;
    getBytes(): Promise<Uint8Array>;
    // Input + lifecycle:
    write(data: string | Uint8Array): void;
    endStdin(): void;
    kill(signal?: string): void;
}
```

**Three distinct failure signals** (epic-mandated): `error` = spawn-level failure (ENOENT / bad exe — the `proc.on("error")` event); `stderr` = the program's stderr stream (progress, not necessarily failure); non-zero `exit.code` = the program ran and failed. Kept separate.

**Buffered-vs-streaming contract (one-or-the-other per handle):** a handle is consumed **either** via a one-shot getter **or** via `on("stdout"/"stderr")` streaming, never both — so an infinite stream can't silently fill memory. Concretely: the handle accumulates stdout/stderr from creation; attaching the first `on("stdout")`/`on("stderr")` listener **switches the handle to streaming** (stops accumulating, forwards live). Calling `getText`/`getBytes`/`getJson` after a stdout/stderr listener was attached **rejects** (`"handle is in streaming mode"`), and vice-versa. `on("exit")`/`on("error")` are always allowed (they don't carry payload streams).

**Getter resolve/reject semantics:** `getBytes()`/`getText()` resolve with the buffered stdout on `exit` (any code) and **reject** only on a spawn `error`. `getJson()` additionally **rejects on non-zero exit or JSON-parse failure**, with `exitCode` and the captured `stderr` attached to the error (epic-mandated). *(Settle-point: whether `getText` should also reject on non-zero exit — default chosen: no, so a caller can read partial output; `getJson` is the strict one.)*

## Implementation plan

1. **`src/ipc/runner-channels.ts`** (new) — the `RunnerChannel` enum + `ExecuteOptions` / `ExitInfo` / `ExecuteHandle` types above. **No imports from `src/main` or `src/renderer`** (must be importable by the sandboxed preload). Mirror `src/ipc/worker-channels.ts`.

2. **`src/main/command-runner.ts`** (new) — the streaming service:
   - `const activeJobs = new Map<string, ChildProcessWithoutNullStreams>()` — keyed by `jobId` (mirror `activeWorkers`).
   - `initCommandRunner()`:
     - `ipcMain.on(RunnerChannel.start, (event, { jobId, command, opts }) => {...})`:
       - `try { proc = spawn(command, { shell: opts.shell ?? true, cwd: opts.cwd, env: { ...process.env, ...opts.env }, windowsHide: true }) } catch (err) { event.sender.send(RunnerChannel.error, { jobId, message: err.message }); return; }` (sync-throw guard, US-699 carry-over).
       - `activeJobs.set(jobId, proc)`.
       - `proc.stdout.on("data", chunk => sendCoalesced(event.sender, RunnerChannel.stdout, jobId, chunk))`; same for `stderr`. Send `chunk` as a `Uint8Array` (it already is a `Buffer`). **Coalesce** bursts (see Concerns) to cut IPC message count.
       - `proc.on("error", err => { event.sender.send(RunnerChannel.error, { jobId, message: err.message }); cleanup(jobId); })` (async ENOENT).
       - `proc.on("close", (code, signal) => { flushCoalesced(jobId); event.sender.send(RunnerChannel.exit, { jobId, code, signal }); cleanup(jobId); })`.
     - `ipcMain.on(RunnerChannel.stdin, (_e, { jobId, data }) => activeJobs.get(jobId)?.stdin.write(data))`.
     - `ipcMain.on(RunnerChannel.endStdin, (_e, { jobId }) => activeJobs.get(jobId)?.stdin.end())`.
     - `ipcMain.on(RunnerChannel.kill, (_e, { jobId, signal }) => activeJobs.get(jobId)?.kill(signal))`. *(US-720 replaces this body with tree-kill.)*
   - `cleanup(jobId)`: `activeJobs.delete(jobId)` + flush any coalescing buffer for that job.
   - `export function killAllCommands() { for (const p of activeJobs.values()) try { p.kill(); } catch {} activeJobs.clear(); }`.
   - Guard every `event.sender.send` in a `try/catch` — the sender may be destroyed if the window/webview closed (tor/worker precedent).

3. **`src/renderer/api/proc.ts`** (new) — the renderer client + `ExecuteHandle` implementation:
   - `const { ipcRenderer } = window.electron;`
   - `execute(command, opts): ExecuteHandle`: `const jobId = \`p_${++idCounter}_${Date.now()}\``; subscribe to `stdout`/`stderr`/`exit`/`error` via `ipcRenderer.on(RunnerChannel.x as unknown as never, msg => { if (msg.jobId !== jobId) return; … })` (cast + id-filter, WorkerRunner precedent); collect unsubscribers; `ipcRenderer.sendMessage(RunnerChannel.start as unknown as never, { jobId, command, opts })`.
   - Internal state: `mode: "idle" | "buffered" | "streaming"`, `stdoutChunks: Uint8Array[]`, `stderrChunks: Uint8Array[]`, resolved `ExitInfo`. Switch to `"streaming"` on first `on("stdout"/"stderr")`; reject getters if `streaming`, and vice-versa (the contract above).
   - `getText/getBytes/getJson` return a promise settled on the `exit`/`error` events (concat buffered chunks → `TextDecoder` for text; `JSON.parse` for json with the non-zero-exit/parse reject + `exitCode`/`stderr` on the error).
   - `write(data) → sendMessage(stdin, { jobId, data })`; `endStdin() → sendMessage(endStdin, { jobId })`; `kill(signal) → sendMessage(kill, { jobId, signal })`.
   - On `exit`/`error`, run all unsubscribers (teardown, WorkerRunner precedent).
   - Export `const proc = { execute };`.

4. **`src/renderer/api/app.ts`** — add `_proc`, `get proc()`, and `import("./proc")` in the `initServices()` `Promise.all` (app.ts:124-151). *(Exact namespace name `app.proc` vs `app.execute` is a minor task-time choice — `proc` keeps the object-namespace convention of `app.fs`/`app.git`.)*

5. **`src/main/main-setup.ts`** — call `initCommandRunner()` next to `initWorkerHost()`/`initTorHandlers()` in init; add `killAllCommands()` to the `app.on("will-quit", …)` block.

6. **Script API types** — add `proc` to the script-facing `app` typings (`src/renderer/api/types/*.d.ts`) so `app.proc.execute(...)` is typed in scripts. *(Do NOT edit `assets/editor-types/` — generated artifact.)*

7. *(Optional, deferred)* **MCP tool** — a `case "execute":` branch in `mcp-handler.ts`'s `handleCommand` switch that buffers via `proc.execute(...).getText()`. Not required for this task; note it for the agent-testing future direction.

## Concerns / open questions

- **Streaming-vs-buffered contract (RESOLVED — design above).** One-or-the-other per handle; first `on("stdout"/"stderr")` flips to streaming; getters reject afterward (and vice-versa). Prevents unbounded buffering of an infinite stream. *Settle-point:* whether `getText` rejects on non-zero exit — defaulted to **no** (`getJson` is the strict one); revisit if the `boardScript` userland helper wants strictness.
- **Backpressure / coalescing (RESOLVED — approach, per epic C3).** A chatty child can flood IPC. **Coalesce** stdout/stderr per job: buffer `Buffer`s arriving synchronously and flush on a `setImmediate`/short timer (or on newline), concatenating into one `Uint8Array` per flush — cuts message count. Chunks are **binary `Uint8Array`** (structured clone), never JSON. A dedicated **`MessageChannelMain`** port is the high-throughput optimization — **deferred** (not v1). Flush any pending buffer on `close` before sending `exit`.
- **`jobId` listener strategy (RESOLVED — follow WorkerRunner).** Each handle registers its own per-channel `ipcRenderer.on` and filters `if (msg.jobId !== jobId) return`, tearing down on exit (WorkerRunner precedent). With many concurrent boards each handle adds 4 listeners; if that ever bites, a single renderer-side **dispatcher** (one listener per channel routing via `Map<jobId, handle>`) is a drop-in optimization — note, don't build yet.
- **Channel typing cast (RESOLVED).** Runner channels are ad-hoc strings (not in `Endpoint`/`EventEndpoint`), so the renderer uses `RunnerChannel.x as unknown as never` with `window.electron.ipcRenderer` — exactly the worker system's existing approach. No change to the typed IPC layer.
- **Per-job kill vs tree-kill (BOUNDARY — US-720).** This task ships `child.kill(signal)` (direct child only) + `killAllCommands()` on quit. A shell-spawned command (`shell: true`) means the child is the shell; its grandchildren survive a plain `.kill()`. **US-720** replaces the kill body with a Windows **Job Object** (`taskkill /T` fallback) tree-kill and adds per-board-instance reaping on webview close/reload/crash. Keep the `activeJobs` registry the single source of truth so US-720 only swaps the kill implementation (optionally widening the value to `{ proc, boardId }`).
- **`cwd` default (note).** The **engine** takes `cwd` from `opts` and does not default it (it has no board). Per-consumer defaults: the board preload (US-724) defaults `cwd` to the board folder (epic: *"Default `cwd` = the board folder"*); the renderer `app.proc` API leaves it to the OS default (the Electron process cwd) when omitted. Document this in the `app.proc` types.
- **`env` merge (RESOLVED — US-699 carry-over).** `opts.env` is merged **over** `process.env` (augments, not replaces).
- **`shell: true` is RCE (ACCEPTED — epic C4).** The runner does **no** sanitization — it's a generic primitive. For boards, the **project trust gate (US-721)** is the single consent point; for the renderer `app.proc` API, callers are already-trusted Persephone scripts (same privilege as all scripting). `shell` defaults to `true` (full command-line through the OS shell, npm-`scripts` style), overridable to a shell name/path or `false`.
- **Binary stdin (note).** `write()` accepts `string | Uint8Array`; both cross IPC via structured clone and are written to `child.stdin` as-is.
- **Three consumers / one engine (RESOLVED — design).** Engine (main) + channels/types (`src/ipc/runner-channels.ts`) are shared. This task builds the **renderer** client (`app.proc`); **US-724** builds the **preload** client against the same channels+types (it cannot reuse `proc.ts`, a renderer-bundle module — the *types* are the shared contract, per epic C9 "one shared API shape"). The MCP tool is an optional thin `case`. All three reach the single main owner over IPC, so US-720's registry/tree-kill stays centralized.

## Acceptance criteria

Testable from a Persephone script (`execute_script`) once `app.proc` is wired:

- **One-shot text:** `await app.proc.execute('node -e "console.log(1)"').getText()` → `"1\n"`.
- **JSON:** `await app.proc.execute('node -e "console.log(JSON.stringify({a:1}))"').getJson()` → `{ a: 1 }`.
- **`getJson` rejects** on non-zero exit (`node -e "process.exit(2)"`) with `exitCode === 2` and captured `stderr` on the error; and on unparseable stdout.
- **Streaming:** registering `on("stdout", cb)` on a child that prints several lines over time invokes `cb` with `Uint8Array` chunks **as they arrive** (before exit), and `on("exit", cb)` fires once with the code.
- **stdin round-trip:** `const h = app.proc.execute('node -e "process.stdin.pipe(process.stdout)"'); h.write("hi"); h.endStdin();` → `await h.getText()` is `"hi"`.
- **kill:** a long-running child (`node -e "setInterval(()=>{},1000)"`) — `h.kill()` fires `on("exit")` (non-null `signal`) and the child is gone.
- **Three distinct signals:** a missing exe fires `error` (not `stderr`/`exit`); a child writing to stderr and exiting 0 fires `stderr` chunks **and** `exit { code: 0 }` (no `error`).
- **Mode exclusivity:** calling `getText()` after `on("stdout")` was attached (or vice-versa) rejects with a clear message.
- **Quit cleanup:** in-flight children are killed on app quit (`killAllCommands` wired into `will-quit`).
- **Shared module:** `src/ipc/runner-channels.ts` imports nothing from `src/main` or `src/renderer` (verifiable by inspection — US-724's preload depends on this).
- `npm run lint` clean; existing IPC / worker / tor paths unaffected.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/ipc/runner-channels.ts` | **new** — `RunnerChannel` enum + `ExecuteOptions`/`ExitInfo`/`ExecuteHandle` types (dependency-free; shared with US-724 preload) |
| `src/main/command-runner.ts` | **new** — streaming spawn service, `activeJobs` registry, `initCommandRunner()`, `killAllCommands()` |
| `src/renderer/api/proc.ts` | **new** — `proc.execute()` → `ExecuteHandle` renderer client (id-filtered channel subscriptions + buffered/streaming modes) |
| `src/renderer/api/app.ts` | wire `app.proc` (private field + getter + `import("./proc")` in `initServices`) |
| `src/main/main-setup.ts` | `initCommandRunner()` in init + `killAllCommands()` in `will-quit` |
| `src/renderer/api/types/*.d.ts` | add `proc` to the script-facing `app` typings |

### Files needing NO changes

- `src/ipc/api-types.ts` / `src/ipc/main/controller.ts` / `src/ipc/renderer/api.ts` — the runner uses **ad-hoc channels** (worker/tor Pattern B), **not** the typed `Endpoint` request/response layer, so the `Endpoint`/`Api` map is untouched.
- `src/ipc/renderer/renderer-events.ts` — the typed `EventEndpoint` broadcast registry is for global fan-out events, not per-`jobId` routed streams; not used here.
- `assets/editor-types/` — generated build artifact (do not hand-edit).
- `worker-host.ts` / `WorkerRunner.ts` / `worker-channels.ts` / `tor-service.ts` — referenced as blueprints only; not modified.
