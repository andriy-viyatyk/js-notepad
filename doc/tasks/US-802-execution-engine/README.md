# US-802: Execution engine

**Epic:** [EPIC-038 — Agent Tools Registry](../../epics/EPIC-038.md)
**Status:** Implemented (epic-deferred review — stays `[ ]` on the dashboard until EPIC-038 review)
**Depends on:** US-801 (manifest + `toolsTrust` + `registeredTools`)
**Created:** 2026-07-04

## Goal

Make a registered tool **runnable**: given a `toolId` + a JSON `args` object, resolve the tool
through `registeredTools`, load the toolset's `.env`, spawn its `command` via
`app.proc.execute` (cwd = toolset root), feed the args as JSON on stdin, enforce a timeout with
tree-kill, and reduce the child's output to a structured result via the marker/fallback
contract (C2). No MCP surface, no UI — those are US-803/805, which import the executor built
here. Also: keep **in-memory per-tool call statistics** (which tool, how many calls/failures)
for the US-805 UI, and append each run to a **self-rotating per-toolset log file**
(`tools-execution.log`, dropped + recreated when older than 1 day).

## Background

### The execution primitive we build on (verified)
- `src/renderer/api/proc.ts` — `proc.execute(command, opts)` returns an `IExecuteHandle`
  (renderer client over the IPC channels in `src/ipc/runner-channels.ts`). A handle is consumed
  **either** one-shot (`getText`/`getJson`/`getBytes`, buffered) **or** streaming
  (`on("stdout"|"stderr"|"exit"|"error")`) — mixing the two on one handle throws
  (`ensureBufferable`/`mode` guard, `proc.ts:205`). `write(data)`/`endStdin()` feed stdin;
  `kill(signal?)` terminates.
- `src/main/command-runner.ts` — `startJobTo` spawns with
  `spawn(command, { shell: opts?.shell ?? true, cwd: opts?.cwd, env: { ...process.env, ...(opts?.env ?? {}) }, windowsHide: true, detached: !win32 })`.
  Key facts the executor relies on:
  - **cwd is NOT defaulted** by the runner — the executor MUST pass `cwd: toolsetRoot`.
  - **env merges OVER `process.env`** — the executor passes only the parsed `.env` map as
    `opts.env`; the runner does the merge. A `.env` var therefore *overrides* an inherited one
    (see T-C6).
  - **whole-tree kill** — `killJob` → `treeKill` (`taskkill /PID <pid> /T /F` on Windows,
    process-group kill on POSIX). `handle.kill()` triggers this; the child's `close` then fires
    a normal `exit` with `signal` set. So a timeout kill is observable as an `exit` event.
  - **spawn failure** (bad cwd/command, ENOENT) arrives as the `error` event, never `exit`.
  - stdout/stderr are coalesced ~16 ms and delivered as binary `Uint8Array` chunks.

### Why the executor consumes the handle in STREAMING mode (not `getJson`)
`getJson(pattern)` is close to what we want (it already does last-match extraction via
`lastMatch`, `proc.ts:88`) **but** it throws when the pattern is absent — and our contract
requires a graceful *plain-text fallback* when no marker is present (C2). It also surfaces
stderr only bundled inside a thrown `RunnerError`, and gives no exit code on success. The
executor needs stdout **and** stderr **and** the exit code **and** spawn-error, together, plus
custom marker/fallback parsing. Streaming mode delivers all four signals; we collect the chunks
and decode once at the end. (Buffered mode exposes none of stderr/exit independently, so it is
insufficient.)

### The result contract (EPIC C2, finalized here)
- Args in: `JSON.stringify(args ?? {})` written to stdin, then `endStdin()`. Immune to Windows
  argv quoting; every language reads stdin.
- Result out: the tool prints a line `##PERSEPHONE_RESULT##<single-line-json>`. The **last**
  occurrence wins (reusing the exact `getJson(pattern)` last-match idea), so third-party library
  noise / progress logs on stdout are harmless.
  - Marker present + valid JSON → `result` = parsed value; the remaining stdout (marker line
    removed) is returned as `logs`.
  - Marker present + invalid JSON → `ok:false` with a precise "marker present but payload isn't
    valid JSON" error; full stdout returned as `logs` so the agent can debug.
  - **No marker → plain-text fallback:** the whole trimmed stdout is the result (`resultText`).
    Trivial tools stay trivial.
- stderr → always captured and returned as `stderr` (diagnostic stream, not necessarily
  failure).
- **Non-zero exit** (or a timeout kill) → `ok:false`; the reply carries `exitCode`, `signal`,
  `stderr`, and **`toolsetRoot`** — the fuel for the self-repair loop (the agent fixes the tool
  at that path instead of working around it).

### `.env` parsing — reuse Node's built-in `util.parseEnv` (verified)
No `dotenv` dependency in `package.json`, but none is needed: Persephone runs **Node 22.22.0**
(Electron 39.8.0), and Node's core **`util.parseEnv(content)`** is present and behaves like a
dotenv parser (dotenv-compatible, the same engine behind `node --env-file`). Verified live via
`execute_script`: it handles `KEY=VALUE`, `#` comments, blank lines, the `export ` prefix,
single/double quotes, and inline comments, and silently skips malformed lines (`BAD LINE`) — no
throw. So US-802 does **not** hand-roll a parser (T-C5). We use `util.parseEnv` on file content
we read ourselves; we deliberately do NOT use `process.loadEnvFile`, which would mutate the
renderer's `process.env`. (The lone `.env` reference at `resolvers.ts:233` is just a Monaco
editor mapping, not a parser.)

### No `ajv` — arg validation stays best-effort
No `ajv` dependency → arg validation is **structural best-effort** (C12), mirroring
`validateToolsManifest`.

### `fs` APIs used (as-is, verified)
`fs.exists(p)`, `fs.readFile(p)` → `{ content }`, `fs.read(p)` → `string`, `fs.append(p, text)`
(async `appendFile`, `fs.ts:300`), `fs.delete(p)`. `.env` lives at `fpJoin(toolsetRoot, ".env")`;
the run log at `fpJoin(toolsetRoot, "tools-execution.log")`.

**Rotation caveat (drove the T-C4 design):** `fs.stat` returns only `{ size, mtime, exists,
isDirectory }` — it **does not expose file creation time** (`birthtime`), and `mtime` refreshes
on every append, so an actively-written log could never "age" past a day by `mtime`. The 1-day
reset is therefore keyed off a **creation-timestamp header line written into the log itself**
(portable, survives a toolset being copied), not off filesystem metadata.

## Architecture — target design

Three new modules under the existing **`src/renderer/api/tools/`** folder (the US-801 home),
consumed by the US-803 MCP handler and the US-805 UI. None is exposed on `app`/scripts
(scripts already have raw `app.proc.execute`; the trust-gated tool runner is an internal
surface reached only through the MCP meta-tools / the UI).

## Implementation plan

### Step 1 — `src/renderer/api/tools/dotenv.ts` (new)

Thin wrapper over Node's built-in `util.parseEnv` (T-C5 — no hand-rolled parser, no dependency).

```ts
import { fs } from "../fs";
import { fpJoin } from "../../core/utils/file-path";

// Node 22 core parser (dotenv-compatible; the engine behind `node --env-file`). `util` is not
// one of the restricted modules (only `path`/`fs` are — see coding-style), so require is fine.
const { parseEnv } = require("node:util") as typeof import("node:util");

/** Read + parse `<toolsetRoot>/.env` into a flat map, using Node's `util.parseEnv`. Returns `{}`
 *  when the file is absent or unreadable (a toolset without secrets is normal — never throws). */
export async function loadDotEnv(toolsetRoot: string): Promise<Record<string, string>> {
    const p = fpJoin(toolsetRoot, ".env");
    if (!(await fs.exists(p))) return {};
    try {
        return parseEnv((await fs.readFile(p)).content) as Record<string, string>;
    } catch {
        return {};
    }
}
```

`util.parseEnv` handles `KEY=VALUE`, `#` comments, blank lines, `export ` prefixes, single/double
quotes, and inline comments, and skips malformed lines without throwing — all confirmed live in
Persephone's runtime. No custom parsing to maintain.

### Step 2 — `src/renderer/api/tools/tool-executor.ts` (new)

The engine. Exports the marker, the result shape, best-effort arg validation, and the two
run entry points.

```ts
import { proc } from "../proc";
import { registeredTools, RegisteredTool } from "./registered-tools";
import { loadDotEnv } from "./dotenv";
import { toolStats } from "./tool-stats";
import { appendToolLog } from "./tool-log";

/** The stdout result marker (EPIC C2). A tool prints `##PERSEPHONE_RESULT##<json>` on its own
 *  line; the LAST occurrence wins. */
export const TOOL_RESULT_MARKER = "##PERSEPHONE_RESULT##";

/** Default per-tool timeout when the manifest omits `timeoutMs` (EPIC C6). */
export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

export interface ToolRunResult {
    toolId: string;
    toolsetRoot: string;
    /** true iff the process exited 0 AND a result was obtained (marker-JSON or plain-text). */
    ok: boolean;
    /** Parsed JSON from the last marker line (present only when a valid marker was found). */
    result?: unknown;
    /** Plain-text result = whole trimmed stdout (present only when NO marker was found). */
    resultText?: string;
    /** stdout with the marker line removed — returned to the agent as log context. */
    logs: string;
    /** Captured stderr (diagnostics; not necessarily a failure). */
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    /** true when the run was killed by the timeout. */
    timedOut: boolean;
    durationMs: number;
    /** Non-blocking best-effort arg-validation notes (C12); the tool still ran. */
    argWarnings?: string[];
    /** Human-readable failure summary when !ok (spawn error / non-zero exit / timeout /
     *  marker-parse failure / tool-not-found). */
    error?: string;
}

/** Resolve `toolId` in `registeredTools`, then run. `ensureInitialized()` first so a cold
 *  call still resolves. Tool not found (unregistered/shadowed) → ok:false, no process spawned,
 *  error points at create_toolset / the management UI. */
export async function executeToolById(toolId: string, args?: unknown): Promise<ToolRunResult>;

/** Core: run an already-resolved tool. Used by executeToolById and the US-805 test-run. */
export async function executeTool(tool: RegisteredTool, args?: unknown): Promise<ToolRunResult>;

/** Best-effort structural check of `args` against `inputSchema` (C12; no ajv). Non-blocking —
 *  returns human-readable warnings only; the caller runs the tool regardless. Checks: required
 *  props present; declared primitive `type` (string/number/boolean/object/array) roughly
 *  matches. Missing/loose schema → no warnings. */
export function validateArgs(inputSchema: object | undefined, args: unknown): string[];
```

`executeTool` flow (streaming consumption):
1. `argWarnings = validateArgs(tool.tool.inputSchema, args)` — **does not block** (T-C2).
2. `const env = await loadDotEnv(tool.toolsetRoot);`
3. `const handle = proc.execute(tool.tool.command, { cwd: tool.toolsetRoot, env, shell: tool.tool.shell, name: tool.id });`
4. Collect: `on("stdout", c => stdoutChunks.push(c))`, `on("stderr", c => stderrChunks.push(c))`
   (attaching switches the handle to streaming mode — the getters are intentionally unused).
5. Settle via a single Promise: `on("exit", info => resolve(...))`, `on("error", err => resolve(spawn-fail))`.
6. Timeout: `const t = setTimeout(() => { timedOut = true; handle.kill(); }, tool.tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);`
   clear it in both settle paths. (The kill triggers tree-kill → `exit` with `signal`, so the
   exit path runs; `timedOut` is already set.)
7. Feed args: `handle.write(JSON.stringify(args ?? {}))`; `handle.endStdin();` (after listeners
   are attached, before/around the await — order is safe because the runner buffers).
8. On settle, decode chunks with one `TextDecoder` each, run `parseToolOutput(stdout)`, assemble
   `ToolRunResult`, then side-effect **before returning**: `toolStats.record(tool.id, ok, durationMs)` and
   `await appendToolLog(tool.toolsetRoot, entry)` (log failures must not break the return — wrap
   in try/catch), and return the result.

`parseToolOutput(stdout: string)` (module-private):
- Build a global regex from `TOOL_RESULT_MARKER`, capture to end-of-line; take the **last**
  match (same last-match technique as `proc.ts:lastMatch`).
- Match found → `payload = group1.trim()`; `logs = stdout` with the whole marker line removed;
  `JSON.parse(payload)` → `{ result, logs }`; on parse failure → `{ parseError, logs: stdout }`.
- No match → `{ resultText: stdout.trim(), logs: "" }`.

`ok`/`error` assembly:
- spawn error → `ok:false`, `error = "Failed to start tool: <message>"`, `exitCode:null`.
- `timedOut` → `ok:false`, `error = "Tool timed out after <ms> ms and was terminated."`
- exit code non-zero → `ok:false`, `error = "Tool exited with code <code>." (+ stderr tail)`.
- exit 0 + marker parse error → `ok:false`, `error = "Result marker present but its payload was not valid JSON: <detail>"`.
- exit 0 + (marker JSON | plain-text) → `ok:true`.

### Step 3 — `src/renderer/api/tools/tool-stats.ts` (new)

**In-memory only** (NOT persisted — resets on app restart), reactive per-tool call counters for
the US-805 UI ("this tool has been run N times"). Mirrors the `TModel<State>` singleton shape
from `registered-tools.ts`.

```ts
import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";

export interface ToolStat {
    toolId: string;
    calls: number;
    failures: number;
    lastCalledAt: number;    // Date.now() of the last run
    lastDurationMs: number;
}

class ToolStats extends TModel<{ byId: Record<string, ToolStat> }> {
    constructor() { super(new TGlobalState({ byId: {} })); }
    /** Bump the counter for a tool after a run (success or failure). */
    record(toolId: string, ok: boolean, durationMs: number): void;
    get all(): ToolStat[];              // sorted by calls desc (convenience for the UI)
    useAll(): ToolStat[];               // reactive
    get(toolId: string): ToolStat | undefined;
    clear(): void;
}
export const toolStats = new ToolStats();
```

No logs or output are held in memory — only counts + timestamps. Cheap and unbounded-safe
(one small record per distinct tool id).

### Step 4 — `src/renderer/api/tools/tool-log.ts` (new)

Append each run to a **per-toolset** `tools-execution.log`, with a **1-day self-reset**. The
detailed I/O (args, stdout logs, stderr) goes to this file — not memory — so it stays out of the
UI's reactive state and can be opened in Persephone for debugging.

```ts
import { fs } from "../fs";
import { fpJoin } from "../../core/utils/file-path";

const LOG_FILE = "tools-execution.log";
const HEADER_PREFIX = "##LOG_CREATED##";          // first line: `##LOG_CREATED##<epoch-ms>`
const MAX_AGE_MS = 24 * 60 * 60 * 1000;           // 1 day (T-C4)

export interface ToolLogEntry {
    toolId: string;
    startedAt: number;
    durationMs: number;
    ok: boolean;
    exitCode: number | null;
    timedOut: boolean;
    args: unknown;         // recorded compactly (JSON.stringify, capped)
    logs: string;          // stdout minus the marker line (capped)
    stderr: string;        // capped
    error?: string;
}

/** Append one run to `<toolsetRoot>/tools-execution.log`, rotating (delete + recreate with a
 *  fresh header) when the existing log's creation header is older than 1 day. Never throws —
 *  logging is best-effort and must not fail a tool run. */
export async function appendToolLog(toolsetRoot: string, entry: ToolLogEntry): Promise<void>;
```

Rotation mechanics (why a header line, not `fs.stat`): see the Background caveat — `fs.stat`
gives no creation time and `mtime` can't age on an appended file.
- Keep an in-memory `Map<normalizedRoot, createdAtMs>` cache so the header is read from disk at
  most **once per toolset per session** (avoids re-reading a growing file on every run).
- On append:
  1. Resolve `createdAt`: from cache; else if the file exists, `fs.read` it and parse the first
     line's `##LOG_CREATED##<ms>` (a whole-file read only on the cache miss — acceptable for a
     dev log); else it's absent.
  2. If absent, or the header is unparseable, or `Date.now() - createdAt > MAX_AGE_MS` →
     **rotate**: `fs.delete` (if present), write a fresh `##LOG_CREATED##<now>\n` header, cache
     `now`.
  3. `fs.append` a formatted, human-readable block for `entry` (timestamp, toolId, ok/exit/
     duration/timedOut, capped args, then `--- stdout ---`/`--- stderr ---` sections; capped to
     keep any single run bounded).
- All wrapped so a filesystem error is swallowed (best-effort).

**Note (portability + secrets):** `tools-execution.log` lives inside the toolset folder, so it
travels with a copied toolset — harmless (it self-resets) but the US-804 template ships a
`.gitignore` that ignores it (alongside `.env`). The log may contain a tool's args and I/O; it
stays in the local, trusted toolset folder and is never returned through MCP (the MCP reply
carries only the structured `ToolRunResult`).

### Files that need NO changes
- `proc.ts`, `runner-channels.ts`, `command-runner.ts` — consumed as-is; the streaming API,
  `cwd`/`env`/`shell`/`name` options, and tree-kill already cover every need.
- `registered-tools.ts`, `tools-trust.ts`, `tools-manifest.ts` (US-801) — imported, not edited.
- No MCP files (`mcp-http-server.ts`, `mcp-handler.ts`), no `app.ts`, no `.d.ts`, no editor
  registry — US-802 adds no external surface (US-803 wires MCP; US-805 wires UI).

## Concerns / Open questions (task-level — please review)

| # | Concern | Proposed decision |
|---|---------|-------------------|
| T-C1 | **Consume the handle buffered (`getJson`) or streaming?** | **Streaming.** `getJson(pattern)` throws on a missing marker (we need a plain-text fallback), bundles stderr only inside a thrown error, and gives no exit code on success. Streaming yields stdout + stderr + exit + spawn-error together, with our own marker/fallback parse. Decided; not blocking. |
| T-C2 | **Does best-effort arg validation BLOCK the run?** *(resolved — user)* | **Non-blocking.** The in-house validator has no ajv and `inputSchema` is loose/optional; the tool script validates its own inputs anyway (C12). Blocking risks false negatives on valid calls. So `validateArgs` returns `argWarnings` surfaced in the result, and the tool runs regardless. |
| T-C3 | **Exact result marker + regex** *(resolved — user)* | **`##PERSEPHONE_RESULT##`** (from EPIC C2), global last-match, capture to end-of-line — the same last-match technique `getJson` uses. Template/guide (US-803/804) ship a one-line `print_result` helper per runtime. |
| T-C4 | **Run observability: in-memory stats + per-toolset log file** *(resolved — user)* | **In memory: statistics only** — a reactive `toolStats` model of per-tool `{ calls, failures, lastCalledAt, lastDurationMs }` (no logs held in memory, not persisted, resets on restart). **On disk: `tools-execution.log` in the toolset folder** — each run appended, **self-resetting at 1 day** via a `##LOG_CREATED##<epoch>` header line (chosen over `fs.stat` because `fs.stat` exposes no creation time and `mtime` can't age on an appended file). Rotation reads the header at most once per session (cached). Args/stdout/stderr capped per entry; the file is gitignored by the US-804 template and never returned through MCP. |
| T-C5 | **`.env` parser** *(resolved — reuse Node built-in)* | **Reuse Node's `util.parseEnv`** — verified present in Persephone's runtime (Node 22.22.0 / Electron 39.8.0) and dotenv-compatible (the `node --env-file` engine). No hand-rolled parser, no `dotenv` dependency. We parse content we read ourselves (not `process.loadEnvFile`, which would mutate `process.env`). |
| T-C6 | **env precedence — may `.env` override inherited vars (PATH, etc.)?** *(resolved — user)* | **`.env` wins.** The runner merges `opts.env` **over** `process.env`, so a `.env` key overrides an inherited one. No reserved-name filtering: the toolset folder is trusted (RCE gate passed), overriding PATH/PYTHONPATH is legitimate, and the agent can simply remove a variable from `.env` if an override is unwanted. |
| T-C7 | **Concurrent runs** | Each `executeTool` uses its own handle/jobId; the runner already isolates jobs. No serialization — concurrent `execute_tool` calls are fine. Accepted, non-blocking. |

## Acceptance criteria

1. **`dotenv.ts`**: `loadDotEnv` returns `{}` for an absent/unreadable `.env`, and otherwise the
   `util.parseEnv` result (`KEY=VALUE`, `#` comments, `export ` prefix, quoted values — quotes
   stripped, malformed lines skipped); never throws.
2. **`tool-executor.ts`**:
   - `executeToolById("<unknown>/x")` → `ok:false`, `error` mentions registration, **no process
     spawned**.
   - A tool that prints `##PERSEPHONE_RESULT##{"a":1}` → `ok:true`, `result` deep-equals `{a:1}`,
     the marker line is absent from `logs`.
   - Two marker lines → the **last** one wins.
   - A tool that prints plain text and no marker → `ok:true`, `resultText` = the trimmed stdout.
   - A tool that reads stdin and echoes it back through the marker → the JSON `args` written on
     stdin round-trip correctly (proves stdin arg passing).
   - A `.env` var declared in `tool.env` is visible to the child process (child echoes it via the
     marker).
   - Non-zero exit → `ok:false` with `exitCode` + captured `stderr` + `toolsetRoot`.
   - A tool that sleeps past a small `timeoutMs` → `timedOut:true`, `ok:false`, the process is
     tree-killed (no orphan).
   - Marker present but non-JSON payload → `ok:false` with a marker-parse error; `logs` retains
     the full stdout.
3. **`tool-stats.ts`**: every `executeTool` (pass or fail) bumps `calls` for the tool id and
   `failures` on `!ok`; `lastCalledAt`/`lastDurationMs` update; `useAll()` re-renders on record;
   `clear()` empties it. No logs/output are stored in memory.
4. **`tool-log.ts`**: every run appends a human-readable block to
   `<toolsetRoot>/tools-execution.log`; a fresh log carries a `##LOG_CREATED##<epoch>` first line;
   a run against a log whose header is >1 day old drops the file and recreates it with a new
   header (verify by back-dating the header); args/stdout/stderr are capped per entry; a
   filesystem error is swallowed and never fails the run.
5. `npm run lint` + `tsc --noEmit` clean; no new colors, no `require("path")`/`require("fs")`, no
   `!` non-null assertions. The new modules are **not** added to `app` or any `.d.ts`.

Verification approach (same as US-801, no external surface yet — T-C4/EPIC): a temporary
`execute_script` harness that dynamic-imports the executor, writes a temp toolset with tiny
Python/Node scripts exercising each row above, registers it via `toolsTrust.trust()`, asserts the
`ToolRunResult`s, then untrusts and deletes the temp fixtures.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/tools/dotenv.ts` | **New** — `loadDotEnv` (thin wrapper over Node's built-in `util.parseEnv`; no dependency) |
| `src/renderer/api/tools/tool-executor.ts` | **New** — `TOOL_RESULT_MARKER`, `ToolRunResult`, `validateArgs`, `executeTool`/`executeToolById` (streaming consume, stdin-JSON args, `.env` env, timeout + tree-kill, marker/fallback parse; records stats + appends the run log) |
| `src/renderer/api/tools/tool-stats.ts` | **New** — `toolStats` in-memory reactive per-tool call/failure counters (not persisted) |
| `src/renderer/api/tools/tool-log.ts` | **New** — `appendToolLog` per-toolset `tools-execution.log` with a 1-day header-based self-reset |

## Notes

### 2026-07-04
- Task investigated against source: `proc.ts` (streaming vs buffered guard, `lastMatch`),
  `command-runner.ts` (no cwd default → executor must pass it; env merges over `process.env`;
  tree-kill on `handle.kill()`; spawn failure = `error` event), `runner-channels.ts`
  (`IExecuteOptions` shape). Confirmed **no `dotenv`/`ajv`** dependency → both parser and arg
  validation are minimal in-house (consistent with EPIC C12).
- Design decision surfaced during investigation: consume the handle in **streaming** mode
  (T-C1) because `getJson(pattern)` throws on a missing marker and hides stderr/exit on success —
  incompatible with the plain-text fallback + self-repair contract.
- Opened for user review: T-C2 (warn-don't-block arg validation), T-C3 (marker string), T-C4
  (run observability), T-C5 (`.env` parser), T-C6 (`.env` may override PATH). T-C1/T-C7 decided,
  non-blocking.
- **T-C2 reviewed → resolved (user):** arg validation is non-blocking — `validateArgs` surfaces
  `argWarnings`; the tool always runs.
- **T-C6 reviewed → resolved (user):** `.env` wins over the inherited env; no reserved-name
  denylist (the agent removes a var from `.env` if an override is unwanted).
- **All task concerns (T-C1…T-C7) resolved — design locked, ready to implement.**

### 2026-07-04 — implemented
- Created the four modules as planned: `dotenv.ts` (wraps `util.parseEnv`), `tool-stats.ts`
  (`toolStats` in-memory counters), `tool-log.ts` (`appendToolLog`, header-based 1-day reset),
  `tool-executor.ts` (`executeTool`/`executeToolById`, `validateArgs`, `TOOL_RESULT_MARKER`).
  `npm run lint` + `tsc --noEmit` both clean.
- Refinements vs the sketch (all minor): `dotenv.ts` requires `util` with a local minimal cast
  (`{ parseEnv(content:string): Record<string,string> }`) instead of relying on `@types/node`
  exposing the experimental typing; `parseToolOutput` strips marker lines by line-filtering
  (no regex); stdout/stderr chunks are concatenated once then decoded with a single `TextDecoder`
  (correct multi-byte handling across chunk boundaries).
- **Verified end-to-end against the live dev app** via `execute_script` (dynamic-importing the
  real modules and running a temp `verify-tools` toolset of tiny Node scripts). **25/25 assertions
  passed:** stdin-JSON args round-trip; `.env` value reaches the child; marker-JSON result;
  plain-text fallback (no marker); two markers → last wins; marker lines stripped from `logs`
  while other stdout is kept; non-zero exit → `ok:false` + `exitCode` + `stderr`; `timeoutMs`
  breach → `timedOut:true` and the process tree-killed; marker present but invalid JSON →
  `ok:false` with a JSON error; unknown tool id → `ok:false`, no spawn; non-blocking arg warning
  when a required prop is missing (tool still ran ok); `toolStats` recorded 2 echo calls / 0
  failures; `tools-execution.log` carried the `##LOG_CREATED##` header, an OK entry, and a
  TIMEOUT entry. The real `trustedTools.txt` registry was restored and temp fixtures deleted
  afterward.
- **T-C3 reviewed → resolved (user):** marker string is `##PERSEPHONE_RESULT##`.
- **T-C5 reviewed → resolved (user + verified):** the user asked whether Node has a built-in
  `.env` parser to reuse. It does — `util.parseEnv`, confirmed live in Persephone's runtime
  (Node 22.22.0 / Electron 39.8.0), dotenv-compatible (`node --env-file` engine): parses
  quotes/`export`/comments and skips malformed lines without throwing. So `dotenv.ts` drops the
  hand-rolled parser and just wraps `util.parseEnv` (we read the file ourselves and parse the
  content — not `process.loadEnvFile`, which mutates `process.env`).
- **T-C4 reviewed → resolved (user):** replaced the bounded in-memory run-history with **(a)**
  in-memory **statistics only** (`toolStats`: per-tool call/failure counts + last-called; not
  persisted) and **(b)** a **per-toolset `tools-execution.log`** appended each run and
  **self-resetting after 1 day**. Investigation finding drove the reset mechanism: `fs.stat`
  exposes no creation time and `mtime` refreshes on every append, so age-since-creation is
  tracked via a `##LOG_CREATED##<epoch>` header line written into the log (read once per session,
  cached) rather than filesystem metadata. Split former Step 3 into `tool-stats.ts` +
  `tool-log.ts`. Still open: T-C2, T-C5, T-C6.
</content>
</invoke>
