# US-699: Generic command runner

**Epic:** [EPIC-033 — Configurable Dashboards](../../epics/EPIC-033.md)
**Status:** Planned (investigated — ready for implementation)
**Created:** 2026-06-17

## Goal

Add a generic, reusable **main-process command runner**: run a **command-line string through a shell** (npm `package.json`-`scripts` style — `"python scripts/refresh.py"`, or a chained `"node a.mjs && electron-builder …"`), capture `stdout` / `stderr` / `exitCode`, and return the result to the renderer over IPC. Provide a thin renderer-side API wrapper plus an opt-in **error-toast helper** that surfaces failures via `ui.notify(..., "error")`. The runner is **not dashboard-specific** — it is a standalone primitive that later tasks (US-706 action execution, US-708 `onLoad`) build on.

Scope for this task is **request/response only**: caller awaits one `RunCommandResult` per spawn. Live stdout streaming is explicitly out of scope (see Concerns → Streaming).

## Background

Investigation 2026-06-17. Persephone has no generic command runner today — every child-process spawn is ad-hoc (`mneme-service.ts`, `snip-service.ts`, `tor-service.ts`). The IPC layer has two registration patterns; this task uses **Pattern A** (the typed `Endpoint` enum + `Controller` + `bindEndpoint`), which the entire git stack uses.

### Spawn blueprint — `src/main/mneme-service.ts`

The canonical spawn shape (mneme-service.ts:80-158): `spawn(exe, args, { windowsHide: true })` inside a `try/catch` (spawn can throw synchronously, e.g. bad exe path), then `proc.stdout.on("data", …)`, `proc.stderr.on("data", …)`, `proc.on("error", …)` (spawn failure → ENOENT etc.), `proc.on("close", (code) => …)`. Mneme is a long-lived sidecar with a readiness gate; **our runner is the simpler "run to completion, collect output" variant** — closer to `snip-service.ts`, which accumulates `chunks: Buffer[]` and concatenates on `close`.

Key carry-overs:
- Wrap `spawn()` in `try/catch` and also handle the async `error` event — both can fire for a missing executable.
- `{ windowsHide: true }` so spawned console apps don't flash a window.
- Pass `cwd` and a merged `env` through the spawn options.
- Track running children so app-quit can kill them (mneme/tor pattern; download-service uses a `Map`).

### IPC wiring — the git stack (Pattern A)

| Layer | File | What to add |
|-------|------|-------------|
| Shared DTOs | `src/ipc/git-ipc.ts` | new `src/ipc/command-ipc.ts` with `RunCommandOptions` / `RunCommandResult` |
| Channel + signature | `src/ipc/api-types.ts` (`Endpoint` enum + `Api` type) | `Endpoint.runCommand` + `Api[Endpoint.runCommand]` |
| Main handler | `src/ipc/main/controller.ts` (`gitProbe` method + `init()` `bindEndpoint`) | `runCommand` method + `bindEndpoint(Endpoint.runCommand, …)` |
| Renderer invoke | `src/ipc/renderer/api.ts` (`executeOnce`, `ApiCalls`) | `runCommand` method on `ApiCalls` |
| Renderer facade | `src/renderer/api/git.ts` | new `src/renderer/api/command.ts` (`command.run` + toast helper) |

Exact shapes observed:

```ts
// src/ipc/api-types.ts — enum member + Api entry (mirrors gitProbe)
gitProbe = "gitProbe",
[Endpoint.gitProbe]: () => Promise<GitProbeResult>;

// src/ipc/main/controller.ts — handler method (lazy import of the service)
gitProbe = async (_event: IpcMainEvent) => {
    const { probeGit } = await import("../../main/git-service");
    return probeGit();
};
// …and in init():
bindEndpoint(Endpoint.gitProbe, controllerInstance.gitProbe);

// src/renderer/api/git.ts — facade calls api.<endpoint>(...), never throws
probe(): Promise<GitProbeResult> { return api.gitProbe(); }
```

`bindEndpoint` uses `ipcMain.on` + `event.reply(\`${command}_${commandId}\`, result)` (correlated request/response — **not** `ipcMain.handle`). The renderer side `executeOnce<T>(command, ...args)` is the matching primitive. All of this is handled by adding to the `Api` type — no change to `executeOnce`/`bindEndpoint` themselves.

### Error toast — `src/renderer/api/ui.ts`

`ui.notify(message: string, type?: "info" | "success" | "warning" | "error"): Promise<string | undefined>`. Returns `"clicked"` if the user clicks the toast. Caps at 3 toasts. The **caller** toasts in its `catch` (`ui.notify(e.message, "error")`) — the runner does not toast.

### IPC error propagation (verified)

`bindEndpoint` (controller.ts:382-392) wraps the handler in `try/catch` and, on throw, replies `new Error(e?.toString?.() ?? "Unknown error")`; `executeOnce` (api.ts:42-43) does `if (arg instanceof Error) reject(arg)`. So a main-side throw becomes a renderer-side promise rejection — but **only the message string crosses** (structured fields are lost). This is why command *failures* are returned as a `RunCommandResult` and the **renderer facade** does the throwing (see Error model in Concerns).

### App-quit cleanup — `src/main/main-setup.ts`

`app.on("will-quit", () => { torService.shutdown(); … shutdownMneme(); })` (≈ lines 127-133). Each service that owns child processes adds its `stop*()` here. The runner adds a `killAllCommands()`.

## Implementation plan

1. **`src/ipc/command-ipc.ts`** (new) — shared DTOs:
   ```ts
   export interface RunCommandOptions {
       command: string;                 // FULL command line — run through a shell (npm-scripts style);
                                        // supports `&&`, pipes, inline args, multiple commands
       cwd?: string;                    // working directory
       env?: Record<string, string>;    // extra vars, merged OVER process.env
       shell?: boolean | string;        // default true (cmd.exe on Windows); or a shell path/name ("bash", "pwsh")
       input?: string;                  // optional stdin payload
       timeoutMs?: number;              // optional kill-after timeout
       maxOutputBytes?: number;         // per-stream tail cap; default MAX_OUTPUT_BYTES (16 MB)
   }
   export interface RunCommandResult {
       stdout: string;                  // most-recent (tail) output if truncated — see truncated
       stderr: string;
       exitCode: number | null;         // null when killed by signal/timeout
       error?: string;                  // spawn-level failure (ENOENT, …)
       timedOut?: boolean;
       truncated?: boolean;             // true if stdout and/or stderr exceeded the cap and was tail-trimmed
   }
   ```

2. **`src/main/command-runner.ts`** (new) — the service:
   - `export async function runCommand(opts: RunCommandOptions): Promise<RunCommandResult>`.
   - `try { proc = spawn(opts.command, { shell: opts.shell ?? true, cwd: opts.cwd, env: { ...process.env, ...opts.env }, windowsHide: true }) } catch (err) { return { stdout:"", stderr:"", exitCode:null, error: err.message } }`. With `shell` set, Node passes the whole `command` string to the shell — exactly how npm runs `package.json` `scripts` (so `"node a.mjs && electron-builder …"` works as one entry).
   - Accumulate `stdout`/`stderr` into a **tail buffer** (one per stream): push each `Buffer` into a `chunks: Buffer[]`, track `total` bytes; while `total > cap`, `shift()` the oldest chunk (subtract its length), and if a single chunk alone exceeds `cap`, slice it to its last `cap` bytes. Set a per-stream `wasTrimmed` flag when anything is dropped. On `close`: `Buffer.concat(chunks)` → decode (utf-8); if trimmed, **prepend** a marker line (e.g. `…[output truncated — showing last 16 MB]…\n`) and set `result.truncated = true`. So the **most recent** output (the freshest log lines) is what survives — the front is discarded, not the tail.
   - `const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;` module constant; `cap = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES`. Applied **independently** to stdout and stderr. The process is **not** killed on overflow (unlike Node's `exec` `maxBuffer`) — it keeps running; we just stop growing memory and keep the tail.
   - `proc.on("error", …)` → resolve with `error` set (covers async ENOENT).
   - `proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code, … }))`.
   - If `opts.input` provided: `proc.stdin.write(input); proc.stdin.end()`.
   - If `opts.timeoutMs`: `setTimeout(() => { proc.kill(); timedOut = true; }, ms)`, cleared on close.
   - Track the live child in a module-level `Set<ChildProcess>`; delete on close. Export `killAllCommands()` that iterates the set and `.kill()`s each.
   - Never throws — always resolves a `RunCommandResult` (git-service "never throw" convention).

3. **`src/ipc/api-types.ts`** — add `runCommand = "runCommand"` to `Endpoint`; add `[Endpoint.runCommand]: (opts: RunCommandOptions) => Promise<RunCommandResult>;` to `Api`; import the DTOs from `./command-ipc`.

4. **`src/ipc/main/controller.ts`** — add handler method (lazy import) + register in `init()`:
   ```ts
   runCommand = async (_event: IpcMainEvent, opts: RunCommandOptions) => {
       const { runCommand } = await import("../../main/command-runner");
       return runCommand(opts);
   };
   // init(): bindEndpoint(Endpoint.runCommand, controllerInstance.runCommand);
   ```

5. **`src/ipc/renderer/api.ts`** — add to `ApiCalls`:
   ```ts
   runCommand(opts: RunCommandOptions): Promise<RunCommandResult> {
       return executeOnce<RunCommandResult>(Endpoint.runCommand, opts);
   }
   ```
   `executeOnce` serializes args over IPC, so the `command` string + options object cross intact.

6. **`src/renderer/api/command.ts`** (new) — renderer facade + a `CommandError` that carries the structured result:
   ```ts
   export class CommandError extends Error {
       constructor(public readonly result: RunCommandResult) {
           super(result.error || result.stderr || `exited with code ${result.exitCode}`);
           this.name = "CommandError";
       }
   }

   export const command = {
       // Raw: always resolves the full result; caller inspects `.error`/`.exitCode` or ignores it.
       // (Only rejects if IPC itself is unavailable.)
       run(opts: RunCommandOptions): Promise<RunCommandResult> {
           return api.runCommand(opts);
       },
       // Throws (renderer-side) on spawn failure OR non-zero exit, carrying the full result on the
       // CommandError. Caller does try/catch + ui.notify(e.message, "error"). Returns the result on success.
       async runChecked(opts: RunCommandOptions): Promise<RunCommandResult> {
           const r = await api.runCommand(opts);
           if (r.error || (r.exitCode ?? 0) !== 0) throw new CommandError(r);
           return r;
       },
   };
   ```
   Typical caller (the US-706 action layer): `try { await command.runChecked(opts); } catch (e) { ui.notify(e.message, "error"); /* + append to ui.log (US-710) */ }`.

7. **`src/main/main-setup.ts`** — in `will-quit`, call `killAllCommands()` (lazy import or top-level import of `command-runner`).

## Concerns / open questions

- **Command string (RESOLVED — user, 2026-06-17).** The runner takes a **full command-line string** run through a shell (`spawn(command, { shell: true })`), exactly like npm `package.json` `scripts` — so one entry can chain commands (`"node scripts/build-prod.mjs && electron-builder --win --publish always"`), use pipes, and carry inline args. **No argv splitting on our side.** This simplifies US-706: the `commands` template (`"python {{script}}"`) just substitutes `{{script}}` and passes the string straight to `runCommand`. An optional `shell?: boolean | string` lets the author pick the interpreter (`true` → `cmd.exe` on Windows; or a path/name like `"bash"` / `"pwsh"`) — matching the epic's "author picks the interpreter."
  - *Security:* `shell: true` widens the shell-injection surface, but **every dashboard execution is already gated by the per-project trust gate** (US-702) and command strings are author/Claude-authored in `config.json`. This formalizes consent rather than opening a new hole — the same reasoning the epic applies to `child_process`. The runner itself does **no** sanitization (it's a generic primitive); the trust gate is the control.
- **Streaming (RESOLVED — out of scope, user 2026-06-17).** Request/response only — output is collected and returned **once**. The dashboard treats a command as a **single fire-and-forget action** and doesn't need a result, but the runner **still returns the full `RunCommandResult`** so other (non-dashboard) callers can use it or ignore it. Live incremental stdout (console-style dashboards) would follow the **Tor pattern** (`webContents.send` on a streaming channel, Pattern B) — a separate future task.
- **Error model (RESOLVED — user 2026-06-17): throw on the renderer side.** Verified the custom IPC propagates errors: `bindEndpoint` (controller.ts:387) catches a handler throw and `event.reply`s an `Error`; `executeOnce` (api.ts:42) rejects when the reply `instanceof Error`. **But** `bindEndpoint` rebuilds the error as `new Error(e.toString())` — only the **message** survives, so throwing *from main* would discard `stdout`/`stderr`/`exitCode`. Therefore: **the main service never throws on command failure** (always resolves the full result, preserving the structured fields across IPC), and the **renderer facade `runChecked` throws a `CommandError`** (carrying the result). Callers `try/catch` and `ui.notify(e.message, "error")` — exactly the requested pattern. `command.run` stays non-throwing for callers that want to inspect the raw result.
- **Large output / buffering (RESOLVED — user 2026-06-17): tail buffer.** Each stream is capped (default **16 MB**, `MAX_OUTPUT_BYTES`, overridable via `maxOutputBytes`). On overflow the **oldest** bytes are dropped and a truncation marker is prepended, so the returned `stdout` keeps the **most recent** output (freshest log lines) and `result.truncated = true`. The process keeps running (not killed). Applied independently to stdout/stderr.
- **`env` merge semantics.** Plan merges `opts.env` over `process.env`. Confirm extra vars should *augment* (not replace) the inherited environment.
- **Timeout default (RESOLVED — user 2026-06-17): no implicit timeout.** A command runs to completion (a long refresh must not be auto-killed). `timeoutMs` stays an **optional per-call** setting for other callers; dashboards omit it. **Cancellation** (e.g. a "stop" button on the board UI) is **out of scope for this epic** — but the runner's running-child tracking (the `Set<ChildProcess>` used for app-quit cleanup) leaves room: a future task would key children by a returned **jobId** and add a `cancel(jobId)` IPC to `.kill()` a specific process.
- **Concurrency.** Multiple concurrent `runCommand` calls are independent (each its own child + Set entry) — matches the `async` action default in EPIC-033. No global lock.
- **Pattern A vs B.** Chosen Pattern A (typed `Endpoint`) for the request/response call. If streaming is later added, that channel will use Pattern B — the two can coexist (tor-service does both).

## Acceptance criteria

- `command.run({ command: "node -e \"console.log('hi')\"" })` resolves `{ stdout: "hi\n", stderr: "", exitCode: 0 }`.
- A chained command line (`"node -e \"process.exit(0)\" && node -e \"console.log('two')\""`) runs both stages and resolves `stdout: "two\n"`, `exitCode: 0` — proving shell semantics (`&&`).
- A non-zero exit (`"node -e \"process.exit(2)\""`): `command.run` **resolves** `{ exitCode: 2, stderr, … }` (no throw); `command.runChecked` **throws** a `CommandError` whose `.result.exitCode === 2` and `.message` includes the stderr.
- A missing executable / failed command: `command.run` resolves with a non-zero `exitCode` (or `error` set) and never rejects; `command.runChecked` throws — caller `catch` shows exactly one `"error"` toast.
- `command.run` is safe to fire-and-forget (await-and-ignore) without an unhandled rejection.
- A script emitting > the cap (e.g. `maxOutputBytes: 1024` with a loop printing more) resolves with `truncated: true`, `stdout` ≈ the last 1 KB plus the truncation marker, and the **final** lines present (earliest dropped) — and the process still runs to completion with the correct `exitCode`.
- `cwd` and `env` are honored by the spawned process; `input` is delivered to stdin.
- In-flight children are killed on app quit (`killAllCommands` wired into `will-quit`).
- `npm run lint` clean; existing IPC calls unaffected.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/ipc/command-ipc.ts` | **new** — `RunCommandOptions` / `RunCommandResult` DTOs |
| `src/main/command-runner.ts` | **new** — `runCommand()` + `killAllCommands()` + running-child `Set` |
| `src/renderer/api/command.ts` | **new** — `command.run` (raw) / `command.runChecked` (throws) facade + `CommandError` |
| `src/ipc/api-types.ts` | add `Endpoint.runCommand` + `Api` entry + DTO import |
| `src/ipc/main/controller.ts` | add `runCommand` handler + `bindEndpoint` in `init()` |
| `src/ipc/renderer/api.ts` | add `runCommand` to `ApiCalls` |
| `src/main/main-setup.ts` | call `killAllCommands()` in `will-quit` |

### Files needing NO changes

- `src/ipc/renderer/api.ts` `executeOnce` and `src/ipc/main/controller.ts` `bindEndpoint` — the generic primitives already handle any `Endpoint`; only the typed map + one method/handler are added.
- `src/renderer/api/ui.ts` — `ui.notify` is reused as-is.
- `mneme-service.ts` / `snip-service.ts` / `tor-service.ts` — referenced as blueprints only; not modified.
