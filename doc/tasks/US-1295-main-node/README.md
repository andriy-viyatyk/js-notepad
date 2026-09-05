# US-1295: `main` node — main-process introspection and scripting under `call`

**Epic:** [EPIC-083](../../epics/EPIC-083.md) · **Status:** Investigation complete — not implemented · **Created:** 2026-09-05

## Goal

Add a main-process branch to the `call` object-model tree. It will expose curated, small service
views at `main.*` and a deliberately privileged `main.script.execute(code)` escape hatch for
developing and testing Persephone, with the script branch visible but settings-gated.

This document is the implementation plan only. No source implementation or test harness belongs in
this task-document pass.

## Background

EPIC-083 makes the AiVision descriptor an interface shared by both processes
([`src/shared/ai-vision/types.ts`](../../../src/shared/ai-vision/types.ts):38-63). The resolver is
process-agnostic and awaits every hop, validates descriptor members, shapes results, and applies
`restricted()` before descending ([`src/shared/ai-vision/resolver.ts`](../../../src/shared/ai-vision/resolver.ts):49-157).
`$help` is handled before the restriction check, so help remains available for a gated node
([`src/shared/ai-vision/resolver.ts`](../../../src/shared/ai-vision/resolver.ts):74-84).

US-1290 already established the main-process pattern in
[`src/main/mcp/ai-vision/main-root.ts`](../../../src/main/mcp/ai-vision/main-root.ts):

- `WindowsNode` enumerates `openWindows.windows`, indexes a `WindowNode`, and uses persisted
  `windowStates` when a window is closed (lines 49-151).
- `MainAiRoot` is currently the main-side root and exposes only `windows` (lines 154-164).
- [`routeCallPath`](../../../src/main/mcp/tools/call-tools.ts):34-58 resolves the `windows` prefix
  locally and forwards the remaining path to the target renderer; the handler carries
  per-session `seenKinds` in its closure (lines 79-145).
- The renderer root already reserves `main` in `RESERVED_ROOT_NAMES`, but its root member list does
  not yet list `main` ([`src/renderer/scripting/ai-vision/root.ts`](../../../src/renderer/scripting/ai-vision/root.ts):16-43).

The epic’s architecture sketch requires `main` to be served entirely by main, next to `windows`,
and its long-term table names `main.windows`, `main.mcp.sessions`, `main.tor.status`, and
`main.script.execute(code)` (EPIC-083 lines 298-319 and 277-290). The root-level `windows` and
`main.windows` paths will point to the same `WindowsNode`; this preserves the existing path and
gives the new branch a process-oriented grouping without duplicating state or descriptors.

The shared result shaper is cycle/depth safe and summarizes visible instances rather than dumping
class internals ([`src/shared/ai-vision/result-shaper.ts`](../../../src/shared/ai-vision/result-shaper.ts):20-70).
The main tree must therefore return plain, intentionally bounded snapshots from service views.

### Service investigation

The following facts are from the current source, not inferred module names:

- MCP HTTP state is a module-level `sessions` map, containing one server/transport and
  `lastActivity` per session ([`src/main/mcp-http-server.ts`](../../../src/main/mcp-http-server.ts):33-38).
  Sessions are inserted on `onsessioninitialized` and removed by transport close (lines 167-180);
  the server has explicit idle sweeping and a 500-session backstop (lines 22-29, 152-165).
  `isMcpHttpServerRunning`, `getMcpUrl`, and `getMcpClientCount` already expose the safe aggregate
  view (lines 266-279). `createMcpServer` builds the `call` tool once per MCP session
  ([`src/main/mcp/server-factory.ts`](../../../src/main/mcp/server-factory.ts):18-39), which is why
  the existing `seenKinds` closure is session-scoped.
- Tor’s singleton is exported from [`src/main/tor-service.ts`](../../../src/main/tor-service.ts):407.
  It owns private `activePartitions`, `socksPort`, `torExePath`, and a `SidecarProcess` (lines
  52-62). `SidecarProcess.isRunning` and `pending` are the existing lifecycle signals
  ([`src/main/sidecar-process.ts`](../../../src/main/sidecar-process.ts):55-75). Tor restart is
  partition-specific and affects the shared daemon and all active partitions
  ([`tor-service.ts`](../../../src/main/tor-service.ts):166-208).
- Board protocol registration is real in-process state: `hostToRoot`, `hostToDesign`, and
  `hostRefCount` maps ([`src/main/board-protocol-service.ts`](../../../src/main/board-protocol-service.ts):27-49),
  populated and removed by `registerBoard`/`unregisterBoard` (lines 288-319). Design tokens and
  palettes are intentionally excluded from the view; they are not diagnostic identity.
- Board archive downloads track only in-flight `AbortController`s in `inFlight`
  ([`src/main/board-download-service.ts`](../../../src/main/board-download-service.ts):18-28).
  `downloadBoardArchive` streams to a bounded, app-data scratch folder, verifies SHA-256, and
  removes failed files (lines 35-97); `cancelBoardDownload` aborts by `installId` (lines 99-102).
- Published-board state already has a service object with `getPublishedBoards(force)` and
  `getBoardVersions(id)` ([`src/main/published-boards-service.ts`](../../../src/main/published-boards-service.ts):208-262).
  Catalog results contain `schemaVersion`, board metadata, archive URL/size/hash, `fetchedAt`,
  `fromCache`, and an optional `error` ([`src/ipc/api-param-types.ts`](../../../src/ipc/api-param-types.ts):94-148).
  A fresh catalog fetch writes the last-check time/cache and broadcasts an update
  ([`published-boards-service.ts`](../../../src/main/published-boards-service.ts):223-244). The
  renderer already exposes this same service as `boards.searchPublished`,
  `boards.getPublishedVersions`, and `boards.checkPublishedUpdates`
  ([`src/renderer/api/types/boards.d.ts`](../../../src/renderer/api/types/boards.d.ts):171-180, 239),
  so no `main.boards.published` duplicate is planned.
- The download singleton already returns copied, sorted `DownloadEntry` snapshots
  ([`src/main/download-service.ts`](../../../src/main/download-service.ts):14-39); the exact fields
  are `id`, `filename`, `url`, `savePath`, `totalBytes`, `receivedBytes`, `status`, `startTime`,
  and optional `error` ([`src/ipc/api-param-types.ts`](../../../src/ipc/api-param-types.ts):70-80).
  Cancellation, opening, revealing, and clearing are renderer-owned actions already declared in
  [`src/renderer/api/types/downloads.d.ts`](../../../src/renderer/api/types/downloads.d.ts):7-18;
  `main.downloads` therefore remains read-only.
- Network logging stores at most 200 entries per browser registration key and skips request bodies
  above 100 KB ([`src/main/network-logger.ts`](../../../src/main/network-logger.ts):12-22, 81-100).
  A log entry includes URL/request metadata, optional headers/body, response status, cache state, or
  error ([`src/ipc/browser-ipc.ts`](../../../src/ipc/browser-ipc.ts):94-108). The current IPC handler
  returns the full log to browser automation ([`src/renderer/automation/commands.ts`](../../../src/renderer/automation/commands.ts):501-506),
  but the new main view will return only bounded metadata and omit headers/bodies.
- Version service already exposes app version and `{ electron, node, chrome }`
  ([`src/main/version-service.ts`](../../../src/main/version-service.ts):101-117). Its update check
  reads/writes the 24-hour `electronStore` timestamp and may broadcast an update (lines 56-98), but
  `shell.version.checkForUpdates` already exposes that operation in the renderer tree
  ([`src/renderer/api/types/shell.d.ts`](../../../src/renderer/api/types/shell.d.ts):20-23). The
  main view merges the version scalars into `main.runtime` and does not add `main.version`.
- Runtime paths are already sourced from Electron: `app.getPath(...)` is used by the main IPC
  handler ([`src/ipc/main/core-handlers.ts`](../../../src/ipc/main/core-handlers.ts):74-76), while
  app/data/resource roots are derived in [`src/main/utils.ts`](../../../src/main/utils.ts):16-45.
  The runtime view will add `app.getAppPath()`, `app.isPackaged`, `process.uptime()`, and
  `process.memoryUsage()` as bounded scalar/object values; it will not expose Electron objects.

### Settings-gate investigation and decision

Application settings are renderer-owned. [`src/renderer/api/settings.ts`](../../../src/renderer/api/settings.ts):23-52
defines the key union; the defaults are in lines 125-157; `set()` emits `onChanged` and schedules
the JSON5 file save (lines 203-217); initial load and file watching are lines 229-285. The file is
`appSettings.json` (line 58), and comments are regenerated on save (lines 288-320).

There is no generic renderer-settings IPC channel. Existing settings reach main in two verified
ways:

- MCP settings are read by the renderer and pushed through typed IPC calls on startup and on change
  ([`src/renderer/api/app.ts`](../../../src/renderer/api/app.ts):267-289, 311-329), implemented by
  existing `Endpoint` methods in [`src/ipc/api-types.ts`](../../../src/ipc/api-types.ts):62-67 and
  [`src/ipc/main/core-handlers.ts`](../../../src/ipc/main/core-handlers.ts):201-228.
- `tor.exe-path` is not read by main from settings. The renderer reads it and passes the current
  value, along with the SOCKS port, to `TorChannel.start`
  ([`src/renderer/editors/browser/BrowserTorModel.ts`](../../../src/renderer/editors/browser/BrowserTorModel.ts):62-66).

`electronStore` is a main-side persisted store ([`src/main/e-store.ts`](../../../src/main/e-store.ts):10-26)
used by main-owned state such as window memory and update/catalog caches. Writing the new toggle
there from the Settings UI would create a second settings authority and would not match the
renderer’s watched `appSettings.json`.

Decision: register `main.scripting.enabled` in the renderer settings and push its value to a
main-process in-memory mirror using a new typed `setMainScriptsEnabled` endpoint. The renderer sends
the value immediately after `settings.wait()` and again from the existing `settings.onChanged`
subscription. Main’s initial fallback is `!app.isPackaged`, matching the requested default-on
development / default-off packaged behavior; the renderer’s missing-key default is
`import.meta.env.DEV`. The mirror is not persisted, so `appSettings.json` remains the single source
of truth. A packaged process starts safely disabled until the renderer supplies the persisted value.

The main-side mirror is initialized to `!app.isPackaged`. A packaged build therefore stays disabled
until the renderer pushes the persisted `main.scripting.enabled` value, so a `main.script` call made
during early packaged startup is refused rather than accidentally allowed. If the renderer never
pushes—because there is no renderer window or startup has not reached the push—the mirror keeps that
fallback (`false` in packaged builds, `true` in development). In the normal configuration, closing
the last window hides it by default and the existing renderer remains alive while MCP and other
background services continue ([`src/main/open-windows.ts`](../../../src/main/open-windows.ts):88-121).
If the user disables close-to-tray, the app quits when the last window closes, so there is no live
MCP process to query; that case cannot be made useful without changing unrelated lifetime behavior.

The gate is only on `main.script`, not on read-only service views. The views reveal bounded runtime
diagnostics already available through existing MCP/UI behavior and do not grant main-process code
execution. `main.script` remains listed and its `$help` remains available. When disabled,
`MainScriptNode.summarize()` reports `enabled: false` plus the exact refusal note, while every
descendant such as `main.script.execute` returns the refusal text through the existing per-hop
restriction check.

## Implementation Plan

### 1. Extend the main tree and routing

- Add a `MainNode` in a new
  [`src/main/mcp/ai-vision/main-services.ts`](../../../src/main/mcp/ai-vision/main-services.ts),
  or keep the equivalent small class next to `MainAiRoot`, implementing `IAiVisible`. Its
  descriptor members are the service nodes below. `MainAiRoot` owns one `WindowsNode` and passes
  that same instance to `MainNode`, so both `windows` and `main.windows` resolve to the existing
  live node.
- Change [`src/main/mcp/ai-vision/main-root.ts`](../../../src/main/mcp/ai-vision/main-root.ts):154-164
  to expose `main` beside `windows`. The root member list must describe both paths, and `MainNode`
  must list `windows`, `mcp`, `tor`, `boards`, `downloads`, `networkLog`, `runtime`, and `script`
  with concise summaries.
- Update `routeCallPath` in [`src/main/mcp/tools/call-tools.ts`](../../../src/main/mcp/tools/call-tools.ts):34-58:
  route a first `main` segment locally, including `main.$help`, `main.windows...`, and all service
  descendants. Keep the existing `windows` behavior and explicit `windowIndex` behavior unchanged.
  Before forwarding any indexed-window remainder, reject `windows[i].main` with a direct message such
  as: `"main" is process-wide and is only valid at the root; call path "main" (not "windows[i].main").`
  This must apply before the renderer bridge, so it remains correct even when the target window is
  closed or unavailable.
- Add `main` to the renderer root’s `ROOT_MEMBERS` in
  [`src/renderer/scripting/ai-vision/root.ts`](../../../src/renderer/scripting/ai-vision/root.ts):23-43.
  It is a routing/documentation entry only; the renderer `AiRoot` must not gain a `main` getter.

Before → after shape in `main-root.ts`:

```typescript
// Before: current US-1290 shape
readonly windows = new WindowsNode();
members: [{ name: "windows", kind: "property", summary: "All windows; windows[i] addresses one." }]

// After: same WindowsNode, plus the process-wide branch
readonly windows = new WindowsNode();
readonly main = new MainNode(this.windows);
members: [
    { name: "windows", kind: "property", summary: "All windows; windows[i] addresses one." },
    { name: "main", kind: "property", summary: "Main-process diagnostics and gated scripting." },
]
```

### 2. Add the curated service descriptors

Implement descriptors in main-side AiVision code, not by reflecting over service objects. Each
getter/method below must return a plain bounded value and use `summarize()` where an object could
otherwise expose internals.

| Path | What it reports | Source file:line | Mutating? | Caution text |
|---|---|---|---|---|
| `main.windows` | The existing `WindowsNode`: count, open/closed children, window summaries and persisted page summaries; same instance as root `windows`. | [`main-root.ts`](../../../src/main/mcp/ai-vision/main-root.ts):121-151; [`open-windows.ts`](../../../src/main/open-windows.ts):19-25 | No | None. Existing `windows[i].open()` / `focus()` keep their current caution-free operational semantics. |
| `main.mcp` | `running`, loopback `url`, and `clientCount`. | [`mcp-http-server.ts`](../../../src/main/mcp-http-server.ts):266-279 | No | None. |
| `main.mcp.sessions` | Bounded snapshots in map order: `{ ordinal, idPrefix, lastActivity, idleMs }` for each session, where `idPrefix` is the first eight characters of the bearer-like session ID. Do not return full IDs, `McpServer`, or transport objects. | [`mcp-http-server.ts`](../../../src/main/mcp-http-server.ts):33-38, 167-180 | No | None. Keep only the first eight characters; never expose a full session ID. |
| `main.tor.status` | `running`, `pending`, `activePartitionCount`, the opaque active partition identifiers needed by `restart`, `socksPort`, and `torExeConfigured`; never the executable path. | [`tor-service.ts`](../../../src/main/tor-service.ts):52-62, 166-177; [`sidecar-process.ts`](../../../src/main/sidecar-process.ts):62-75 | No | None. |
| `main.tor.restart(partition)` | Existing Tor restart result `{ success, error? }`; `partition` must be one of the opaque identifiers listed by `main.tor.status`. | [`tor-service.ts`](../../../src/main/tor-service.ts):177-208 | Yes | `CAUTION: restarts the shared Tor daemon and disrupts every active Tor browser partition; bootstrap can take up to 90 seconds.` |
| `main.boards.protocol` | `registeredCount` and bounded registrations `{ host, root, refCount }`; omit theme palettes/tokens and protocol internals. | [`board-protocol-service.ts`](../../../src/main/board-protocol-service.ts):27-49, 288-319 | No | None. Do not expose `registerBoard`/`unregisterBoard` as call members; unregistering a live board breaks its frame. |
| `main.boards.downloads` | `activeCount` and active `installId`s; optionally `cancel(installId)` for an in-flight archive. | [`board-download-service.ts`](../../../src/main/board-download-service.ts):18-28, 35-102 | `cancel` yes | `CAUTION: aborts the board archive download and removes its partial ZIP.` |
| `main.downloads` | Read-only `getDownloads()` returning the existing `DownloadEntry` fields only; bounded by the service’s existing persisted five completed entries plus live entries. Its help says to use renderer `downloads.*` to change a download. | [`download-service.ts`](../../../src/main/download-service.ts):35-39, 172-204; [`api-param-types.ts`](../../../src/ipc/api-param-types.ts):70-80; [`downloads.d.ts`](../../../src/renderer/api/types/downloads.d.ts):7-18 | No | None. The renderer `downloads` namespace owns `cancelDownload`, `openDownload`, `showInFolder`, and `clearCompleted`. |
| `main.networkLog` | Registered log keys and aggregate counts; `get(key, limit = 20)` returns only the last bounded metadata fields `id`, `url`, `method`, `resourceType`, `referrer`, `timestamp`, `statusCode`, `statusLine`, `fromCache`, and `error`. Omit request/response headers and bodies. | [`network-logger.ts`](../../../src/main/network-logger.ts):12-22, 81-135; [`browser-ipc.ts`](../../../src/ipc/browser-ipc.ts):94-108 | No | `CAUTION: URLs may contain query data from the visited site.` |
| `main.networkLog.clear(key)` | Clears one in-memory page log. | [`network-logger.ts`](../../../src/main/network-logger.ts):138-142 | Yes | `CAUTION: irreversibly clears the selected in-memory network log.` |
| `main.runtime` | `appVersion`, Electron/Chrome/Node versions, `app.isPackaged`, `app.getAppPath()`, selected `app.getPath()` values (`userData`, `appData`, `exe`, `temp`, `documents`, `downloads`), `uptimeSeconds`, and `memoryUsage` scalars. Update checks remain at renderer `shell.version`. | [`version-service.ts`](../../../src/main/version-service.ts):101-110; [`core-handlers.ts`](../../../src/ipc/main/core-handlers.ts):74-76; [`utils.ts`](../../../src/main/utils.ts):17-45; [`shell.d.ts`](../../../src/renderer/api/types/shell.d.ts):20-23 | No | None. Return numbers and strings only; never return the Electron `app` object here. |
| `main.script` | A listed `MainScriptNode` with `$help`, `execute(code)`, `summarize()` reporting `{ kind: "MainScript", enabled: false, note: <exact refusal> }` when off and `{ kind: "MainScript", enabled: true }` when on, plus instance `restricted()` based on the gate. | New main AiVision node; gate shape follows [`types.ts`](../../../src/shared/ai-vision/types.ts):49-54 | Gate only | `CAUTION: main-process code has a larger blast radius; it can freeze or terminate the whole app.` |
| `main.script.execute(code)` | Evaluates in main, returns the shaped last value plus `isError`, `timedOut` when applicable, and renderer-compatible `consoleLogs`. | New [`main-script.ts`](../../../src/main/mcp/ai-vision/main-script.ts), using [`result-shaper.ts`](../../../src/shared/ai-vision/result-shaper.ts):20-24 | Yes (arbitrary code) | `CAUTION: a synchronous infinite loop blocks the main event loop and cannot be interrupted by the timeout; it freezes every window until the code returns or the process is killed.` |

The status/helper additions to the existing modules must be narrow snapshots only: a public helper
for Tor status, board protocol registrations, board-download activity, and network-log metadata.
The existing `downloadService` and `versionService` methods already return suitable domain
payloads; published-board and download actions remain available through their renderer namespaces.
`server-factory.ts`, `e-store.ts`, `open-windows.ts`, and the Tor IPC channel do not need a new
raw-object export.

### 3. Implement main-process script evaluation

Create `src/main/mcp/ai-vision/main-script.ts` with a small evaluator and no renderer imports.
The execution context must explicitly bind:

```typescript
const scope = {
    electron,
    openWindows,
    torService,
    downloadService,
    boardDownloadService,
    publishedBoardsService,
    boardProtocol,
    networkLogger,
};
```

`boardProtocol` and `networkLogger` are curated facades over their module exports; they are not raw
maps. The exact singleton names must remain visible in the descriptor help so a developer can use
the same names in `main.script.execute` that the evaluator actually supplies.

Use an async wrapper so expressions and `await` work, and return the last expression. The concrete
result contract is `{ result, isError, timedOut?, consoleLogs }`, where `result` is already passed
through `shapeResult` and an exception’s `result` is its text from `errMessage`. `consoleLogs` must
match [`ScriptContext.ts`](../../../src/renderer/scripting/ScriptContext.ts):13-30 exactly:
`{ level: "log" | "error" | "warn" | "info", args: string[], timestamp: number }`. Mirror the
renderer’s capture behavior at lines 80-89 and 277-310 of that file; at minimum `console.log`,
`console.error`, `console.warn`, and `console.info` must append entries with serialized arguments.

Use a fixed `MAIN_SCRIPT_TIMEOUT_MS` (10 seconds) around the evaluation. Catch all of the following
inside the main-script method: compilation/syntax errors, synchronous throws, rejected promises,
and timeout selection. Attach a rejection handler to the evaluation promise before racing it with
the timeout so a late rejection cannot enter Node’s unhandled-rejection path. A timeout result must
be text, set `timedOut: true`, and explain that an async evaluation may still be running because a
JavaScript promise cannot be cancelled by `Promise.race`.

The timeout cannot interrupt synchronous JavaScript. A `while (true) {}` prevents timers and IPC
from running, freezes all windows, and will not produce the timeout response; this limitation must
appear both in `main.script.execute`’s `caution` and in `main.script.$help`. The help must also say
that side effects performed before an exception or timeout remain performed.

Before → after evaluator behavior:

```typescript
// Before: renderer execute_script shape
return { text: textAndLang.text, language: textAndLang.language,
    isError: textAndLang.isError, consoleLogs: textAndLang.consoleLogs };

// After: main.script.execute shape
return { result: shapeResult(value).result, isError: false, consoleLogs };
// Any caught error: { result: errMessage(error), isError: true, consoleLogs }
// Timeout: { result: "Main-process script timed out after 10 seconds", isError: true,
//            timedOut: true, consoleLogs }
```

Do not change the shared resolver for this gate. Its existing per-hop check
([`src/shared/ai-vision/resolver.ts`](../../../src/shared/ai-vision/resolver.ts):74-84) checks the
node being traversed before consuming the next segment, while the `$help` branch runs first. Thus
landing on `main.script` returns `MainScriptNode.summarize()` and its disabled note; trying to
consume `execute` from that restricted node returns the refusal text; and
`main.script.$help` still returns help. This preserves the epic’s requirement that other restricted
nodes, such as an incognito/Tor `pages[i]`, remain summarisable while everything underneath them is
blocked.

### 4. Wire the settings gate through the existing Settings UI

- In [`src/renderer/api/settings.ts`](../../../src/renderer/api/settings.ts):23-52, add the exact
  key `main.scripting.enabled`; add a user-facing `settingsComments` entry near the MCP keys
  (lines 92-123) explaining that it enables `call` → `main.script.execute`, defaults to on only in
  development and off in packaged builds, and can freeze/crash the app. Add the default using
  `import.meta.env.DEV` in the default state (lines 125-157).
- In [`src/renderer/editors/settings/sections/McpSectionModel.ts`](../../../src/renderer/editors/settings/sections/McpSectionModel.ts):7-13,
  add `mainScriptsEnabled` to props and a `handleMainScriptsToggle` that calls
  `settings.set("main.scripting.enabled", ...)`.
- In [`src/renderer/editors/settings/sections/McpSection.ts`](../../../src/renderer/editors/settings/sections/McpSection.ts):93-208,
  add the checkbox label exactly `Allow main-process scripts`, update it from
  `settings.onChanged`, and show a short warning that the code runs in the main process and can
  freeze the app. `SettingsView.ts:80-83` already mounts `McpSection`; it needs no registration edit.
- Add `Endpoint.setMainScriptsEnabled` and its `Api` signature in
  [`src/ipc/api-types.ts`](../../../src/ipc/api-types.ts):21-112, implement the renderer call in
  [`src/ipc/renderer/api.ts`](../../../src/ipc/renderer/api.ts):229-250, and bind it in
  [`src/ipc/main/core-handlers.ts`](../../../src/ipc/main/core-handlers.ts):201-228 and its
  registration block at lines 353-358. `controller.ts` needs no change because it already calls
  `initCoreHandlers()`.
- Add `src/main/mcp/ai-vision/main-script-gate.ts`. Initialize its non-persisted mirror to
  `!app.isPackaged`, expose `isMainScriptsEnabled()` for `restricted()`, and expose
  `setMainScriptsEnabled()` for the endpoint. Use the exact refusal text:
  `Main-process scripts are disabled — enable “Allow main-process scripts” in Settings → MCP Server.`
- In [`src/renderer/api/app.ts`](../../../src/renderer/api/app.ts):267-275, push the setting after
  `settings.wait()` before deferred service startup. In the existing change subscription at
  lines 313-329, push the new key on every UI/file-watcher change. This makes UI changes and
  external `appSettings.json` edits converge on the same main mirror.

Before → after settings ownership:

```typescript
// Before: main does not load appSettings.json; renderer pushes selected settings only.
if (key === "mcp.enabled") api.setMcpEnabled(!!value, port || undefined);

// After: appSettings.json remains authoritative; main receives a non-persisted mirror.
if (key === "main.scripting.enabled") api.setMainScriptsEnabled(!!value);
```

### 5. Update tool and guide discovery text

- In [`src/main/mcp/tools/call-tools.ts`](../../../src/main/mcp/tools/call-tools.ts):87-102, add
  one example for `main` and one for `main.script.execute` that tells the agent the latter is
  settings-gated. State that `windows[i].main` is invalid because main is process-wide.
- In [`assets/mcp-res-overview.md`](../../../assets/mcp-res-overview.md):10-26 and 35-50, add
  `main` to the mental model and routing table, while keeping `call` as the no-guide discovery
  path.
- In [`assets/mcp-res-scripting.md`](../../../assets/mcp-res-scripting.md):1-21 and 377-398, add
  a “main-process scripts” subsection: exact scope names, settings toggle, 10-second timeout,
  caught-error/console-log result shape, late async behavior, and the uninterruptible synchronous
  loop warning. The existing renderer `execute_script` timeout semantics must not be claimed for
  main without the separate warning.

## Concerns / Open Questions

All design questions required by this task are resolved as follows:

1. **Duplicate windows path — resolved.** `main.windows` is a pointer to the existing
   `WindowsNode`, not a second node. Root `windows` remains backward-compatible; both paths use
   the same `openWindows` and `windowStates` data. `windows[i].main` is rejected by main routing,
   with guidance to use root `main`.
2. **Settings authority — resolved.** `main.scripting.enabled` in renderer `appSettings.json` is
   the only persisted truth. Main’s boolean is an in-memory delivery cache with a safe environment
   fallback; no `electronStore` key is added. The Settings UI registration is in
   `src/renderer/api/settings.ts`, and the control is in the existing MCP section.
3. **Gate scope — resolved.** Only `main.script` is restricted. Read-only diagnostics remain
   available because they do not execute arbitrary main code and are bounded snapshots.
4. **Async timeout — resolved with limitation.** Race evaluation against 10 seconds and attach a
   rejection handler to every evaluation promise. On timeout, return text immediately, but explain
   that an async function may continue and can still produce side effects. A synchronous infinite
   loop blocks the event loop and defeats the timer; only process termination can recover it.
5. **Error path — resolved.** Compilation, invocation, promise rejection, and timeout are converted
   to text inside `main.script.execute`; none is thrown from the method. This is separate from the
   outer `call` handler’s routing/transport error handling.
6. **Console capture — resolved.** Return the same four-level `consoleLogs` entries used by
   renderer `execute_script`; do not rely on main’s native console output as the response channel.
7. **MCP session identity — resolved.** Return ordinal metadata plus only the first eight characters
   as `idPrefix`, not full bearer session IDs or live SDK server/transport objects.
8. **Network-log privacy/size — resolved.** Return bounded recent metadata only; omit headers and
   bodies even though the existing browser-specific command can request the raw log. URLs remain
   useful for debugging but carry a caution because query strings can contain secrets.
9. **Dangerous service members — resolved.** Keep raw registration, board installation, protocol
   mapping, process internals, renderer-owned download actions, published-board operations, and
   update checks out of descriptors. Expose only main-only board-download cancellation, Tor restart,
   and network-log clearing with explicit `caution` text. Main scripting remains the deliberate
   full-privilege escape hatch.

### Files that need no changes

These inspected files establish reusable behavior but should not be modified for US-1295:

- [`src/shared/ai-vision/types.ts`](../../../src/shared/ai-vision/types.ts),
  [`src/shared/ai-vision/resolver.ts`](../../../src/shared/ai-vision/resolver.ts), `hint.ts`,
  `path-parser.ts`, `help-search.ts`, and `result-shaper.ts` — shared contracts, per-hop
  restriction semantics, and formatting are sufficient; no shared-code change is required.
- [`src/main/mcp/server-factory.ts`](../../../src/main/mcp/server-factory.ts) — per-session server
  construction and `callTools` registration already work.
- [`src/main/mcp/renderer-bridge.ts`](../../../src/main/mcp/renderer-bridge.ts) — only renderer
  paths use its 30-second bridge timeout; main-local paths do not pass through it.
- [`src/main/open-windows.ts`](../../../src/main/open-windows.ts), `src/main/e-store.ts`,
  `src/ipc/tor-ipc.ts`, `src/ipc/main/controller.ts`, and `src/main/main-setup.ts` — existing
  ownership/lifecycle wiring is reused.
- [`src/main/download-service.ts`](../../../src/main/download-service.ts),
  [`src/main/version-service.ts`](../../../src/main/version-service.ts), and
  [`src/main/published-boards-service.ts`](../../../src/main/published-boards-service.ts) — their
  existing public methods are sufficient or remain renderer-owned; no service implementation or
  published-board adapter change is planned.
- [`src/renderer/editors/settings/SettingsView.ts`](../../../src/renderer/editors/settings/SettingsView.ts) —
  the existing `McpSectionView` registration already provides the correct Settings page location.

## Acceptance Criteria

Verify these as live MCP `call` checks after implementation, with a cold app start for any negative
result:

- `call path:"main"` resolves locally, returns the `main` descriptor, lists `windows`, `mcp`,
  `tor`, `boards`, `downloads`, `networkLog`, `runtime`, and `script`, and does not
  require any renderer window.
- `call path:"main.windows"` returns the same live window collection as `call path:"windows"`;
  a window opened/closed between calls is reflected in both paths.
- `call path:"main.mcp"` reports the current running state, loopback URL, and client count;
  `call path:"main.mcp.sessions"` reports bounded session metadata without SDK objects or full
  bearer-like IDs and includes an eight-character `idPrefix` for correlation.
- `call path:"main.tor"` resolves and its hint describes `status`; `call path:"main.tor.status"`
  reports the current Tor lifecycle snapshot without the executable path.
- `call path:"main.boards.protocol"`, `call path:"main.boards.downloads"`,
  `call path:"main.downloads"`, `call path:"main.networkLog"`, and `call path:"main.runtime"`
  each return real, bounded descriptors/snapshots rather than raw class/module internals. The
  `main.downloads` help directs mutations to renderer `downloads.*`; no `main.boards.published` or
  `main.version` path exists.
- With `main.scripting.enabled` off, `call path:"main.script"` returns a summary containing
  `enabled: false` and `note` equal to `Main-process scripts are disabled — enable “Allow main-process scripts” in Settings → MCP Server.`;
  `call path:"main.script.$help"` still returns help; and
  `call path:"main.script.execute"` returns the same refusal text without evaluating code.
- After enabling the toggle through the existing Settings UI, `call path:"main.script.execute"
  args:["process.versions.electron"]` returns the Electron version as the shaped `result` and an
  empty or present `consoleLogs` array.
- `call path:"main.script.execute" args:["console.log('x'); 7"]` returns result `7` and a
  `consoleLogs` entry `{ level: "log", args: ["x"], timestamp: ... }`; a thrown error returns
  text and `isError: true` without an MCP unhandled rejection.
- An async script exceeding 10 seconds returns text with `timedOut: true`; the help/caution text
  says that the async work may continue. A synchronous infinite loop is documented as uninterruptible
  and must not be presented as safely timeout-able.
- `call path:"windows[0].main"` is refused by the main router with guidance to use root `main`;
  it is never forwarded to the renderer. `call path:"windows[0].pages[0].content"` continues to
  route normally.
- The `call` tool description, `assets/mcp-res-overview.md`, and `assets/mcp-res-scripting.md`
  all mention the new root entry and its gate; existing renderer `execute_script` behavior remains
  accurately documented.

### What cannot be verified without the user

- A Settings UI click to enable `Allow main-process scripts`, and the exact visual placement/wording
  in the running Settings page, require the user to exercise the existing UI.
- Whether the user’s packaged/dev build reports the expected default before any explicit setting is
  saved requires running both a development build and a packaged build.
- A true synchronous infinite-loop recovery cannot be safely exercised in the live app because it
  freezes the main process; verify the warning by code inspection and use only bounded scripts live.
- Real Tor bootstrap/restart, board archive download/cancel, network-log population, and update
  fetching depend on external executables, network responses, open browser pages, or catalog state;
  the descriptor wiring can be checked without forcing those side effects.

## Files Changed Summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1295-main-node/README.md` | This investigation and implementation plan. |
| `doc/active-work.md` | Link US-1295 under EPIC-083. |
| `doc/epics/EPIC-083.md` | Link US-1295 in the Linked Tasks table. |
| `src/main/mcp/ai-vision/main-root.ts` | Add `main` and shared `WindowsNode` pointer. |
| `src/main/mcp/ai-vision/main-services.ts` | Curated service-view descriptors. |
| `src/main/mcp/ai-vision/main-script.ts` | Main evaluator, timeout, error text, shaping, and console capture. |
| `src/main/mcp/ai-vision/main-script-gate.ts` | Non-persisted main-process gate mirror. |
| `src/main/mcp/tools/call-tools.ts` | Route root `main`, reject `windows[i].main`, and describe `main`. |
| `src/renderer/scripting/ai-vision/root.ts` | List reserved/routed `main` in the root hint. |
| `src/renderer/api/settings.ts` | Register `main.scripting.enabled`, default, and file comment. |
| `src/renderer/api/app.ts` | Push the setting to main at startup and on change. |
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | Add setting prop and toggle handler. |
| `src/renderer/editors/settings/sections/McpSection.ts` | Render and refresh the toggle/warning. |
| `src/ipc/api-types.ts` | Add the typed main-script setting endpoint. |
| `src/ipc/renderer/api.ts` | Add renderer endpoint call. |
| `src/ipc/main/core-handlers.ts` | Receive and store the gate mirror. |
| `src/main/mcp-http-server.ts` | Add bounded MCP-session snapshot helper. |
| `src/main/tor-service.ts` | Add bounded Tor status helper. |
| `src/main/board-protocol-service.ts` | Add bounded registration snapshot helper. |
| `src/main/board-download-service.ts` | Add bounded in-flight download snapshot helper. |
| `src/main/network-logger.ts` | Add bounded metadata snapshot helper. |
| `assets/mcp-res-overview.md` | Enumerate `main` in the overview/routing guidance. |
| `assets/mcp-res-scripting.md` | Document main-process script scope, gate, result, timeout, and cautions. |

No unit tests or test harnesses are planned; verification is through the live `call` checks above,
lint/type checking, and the user-only checks explicitly listed.
