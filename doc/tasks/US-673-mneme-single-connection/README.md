# US-673 — Mneme MCP client: single shared connection (fix `wiki_status` timeouts / yellow indicator)

**Status:** Implemented — `tsc --noEmit` + `eslint` clean; awaiting manual smoke test.
**Spans:** Renderer (`src/renderer/`) only.
**Epic:** EPIC-032 (Mneme), Phase 4 — bug in the MCP client wiring (US-661 / US-662 / US-671 area).

## Symptom (reported)

Mneme works after launch, then "time to time" the header indicator goes **yellow**, the config
editor shows **"Connecting…"**, and toasts pop up: `Mneme status failed: MCP error -32001: Request
timed out`. The user did **not** stop or restart anything — the trigger was: open a document via the
`mneme://` protocol (worked fine), then idle ~5–10 min, then the timeouts appear. A restart or
toggling the feature clears it for a while.

## Investigation (what was verified, 2026-06-14)

**The Mneme server is healthy — the bug is entirely client-side.**

- `mneme.exe` is running and listening on `127.0.0.1:7700`.
- Connecting to it from an **external process** (PowerShell) and calling `wiki_status` returns in
  **~810 ms** with complete data (embedding model provisioned & verified; both roots fully indexed,
  reindex `done`). No errors / panics / slowness in `mneme.log`.
- rmcp `StreamableHttpServerConfig::default()` (v1.7) has `sse_keep_alive: Some(15s)` and
  `stateful_mode: true` — the server pings SSE and keeps sessions; it is **not** dropping idle
  sessions.
- The mneme log + the dev terminal log show the failure signature: `CancelledNotification …
  request_id: 1 … "MCP error -32001: Request timed out"` repeating roughly every ~60–85 s, plus a
  storm of `create new session` (far more than clean `serve finished`). The ~85 s cadence is the
  30 s prober: connect → tool call hangs → 60 s MCP default timeout → drop → retry.
- The `SSL handshake failed … net_error -100` lines in the terminal log are **unrelated** (Mneme is
  plaintext HTTP on loopback; those are some other Electron TLS connection).

### Root cause

There are **three** independent `McpConnectionManager` instances, each opening its own MCP **session**
(and, when subscribed, its own long-lived **SSE GET stream**) to the same loopback sidecar:

| Owner | File | Lifecycle | Notes |
|-------|------|-----------|-------|
| Health prober | `src/renderer/api/mneme-status.ts` | 30 s `wiki_status` poll | own manager, **no** auto-reconnect |
| Persistent content conn | `src/renderer/api/mneme-connection.ts` | always-on while enabled | auto-reconnect + **resource-subscription SSE stream** (opened when a `mneme://` doc is opened) |
| Config editor | `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` (`connection`, line 78) | while the editor tab is open | auto-reconnect + **1.5 s `wiki_status` poll** during background jobs |

Before opening a `mneme://` doc, the persistent connection has **no** subscription, so no standalone
SSE GET stream — pressure is low. Opening the doc calls `mnemeConnection.subscribe(uri)` →
`subscribeResource` → opens a **long-lived SSE GET stream** that holds a socket for its entire life.
Combined with the config editor's connection and the reconnect churn (the SDK transport's own
10-retry SSE reconnection **stacked on** the app-level `scheduleReconnect()`), the renderer process's
HTTP connection pool to `127.0.0.1:7700` is starved. New requests (the prober's `wiki_status` POST)
then queue with no free socket and **hang until the 60 s timeout** — which is exactly the observed
symptom. An external process is unaffected because it has its own socket pool (hence the 810 ms probe).

## Fix — consolidate to a single shared connection

Make `mnemeConnection` the **sole** MCP client to the sidecar; the prober and the config editor reuse
it via `getClient()`. This collapses 3 sessions (and up to 3 SSE streams + 3 reconnect loops) to **one**,
removing the pool-starvation root cause. Add a short per-call timeout on the lightweight health/status
calls so any residual stall self-heals in seconds instead of latching for a minute.

### 1. `src/renderer/api/mneme-connection.ts` — expose status + make it the shared owner

- Add status fan-out (multi-subscriber): `private statusWatchers = new Set<(s: McpConnectionStatus, e?: string) => void>()`.
- Getters delegating to the manager: `get status(): McpConnectionStatus` (→ `manager?.status ?? "disconnected"`), `get error()`, `get serverInfo()`.
- `onStatusChange(cb): ISubscriptionObject` — add/remove from the set.
- In `ensureManager()`, set `manager.onStatusChange = (s, e) => { for (const cb of [...this.statusWatchers]) cb(s, e); }`.
- Add `async reconnect(): Promise<void>` — force a fresh connect (clear `connectedUrl`, `await manager?.disconnect()`, then `sync()`), for the config editor's manual reconnect / restart buttons.

### 2. `src/renderer/api/mneme-status.ts` — reuse the shared client

- Delete the `connection` field and `dropConnection()`.
- `init()`: also subscribe to `mnemeConnection.onStatusChange` and `probe()` on `"connected"` so the
  indicator turns green promptly (instead of waiting up to 30 s).
- `probe()`: use `mnemeConnection.getClient()`. If null → `modelReady = false`, return (do **not**
  open a connection — `mnemeConnection` owns the lifecycle). Pass `{ timeout: 10_000 }` as the
  `callTool` options so a stalled probe fails fast. On error → `modelReady = false` (no drop needed).
- `sync()`'s "disabled / down" branch: just clear the poll timer + `modelReady` (drop the
  `dropConnection()` call).

### 3. `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` — reuse the shared client

- Remove `readonly connection = new McpConnectionManager()`; import `mnemeConnection`. Keep
  `McpConnectionStatus` as a **type-only** import (still used in state).
- Constructor: replace `this.connection.onStatusChange = …` with a `mnemeConnection.onStatusChange(…)`
  subscription (store it for dispose). Seed `connectionStatus` from `mnemeConnection.status`; if
  already `"connected"`, call `refreshStatus()` (the editor may open after the shared conn connected,
  so it won't get a fresh `"connected"` callback).
- `applySidecarStatus()`: only update `running`/`url` display state — **remove** the own-connection
  `connect()`/`dispose()`. The shared connection is driven by the same sidecar IPC event.
- Replace every `this.connection.getClient()` → `mnemeConnection.getClient()` (lines 141, 189, 237,
  269, 291, 304, 368, 382, 406, 478).
- `refreshStatus()`: pass `{ timeout: 10_000 }` to the `wiki_status` call.
- `reconnect()` / `restartMneme()`: after refreshing sidecar display, `await mnemeConnection.reconnect()`.
- `dispose()`: unsubscribe the status sub; **do not** dispose `mnemeConnection` (other consumers use it).

Leave the long-running mutating calls (`wiki_reindex`, `wiki_model_update`, `wiki_add_root`, …) on
their existing options (no short timeout — they're meant to run long / poll).

### Out of scope (note only)

`McpConnectionManager` internals (the stacked SDK + app reconnect loops, prior-transport teardown on
the auto-reconnect path) are **not** changed here, to avoid destabilizing the shared MCP-inspector
editor that also uses it. With a single Mneme connection the churn pressure is largely removed; if
session churn persists after this fix, harden `connect()` to explicitly tear down a lingering
client/transport on the reconnect path as a follow-up.

## Concerns & resolutions

1. **Config editor opening before/after the shared conn connects.** Resolved by seeding from
   `mnemeConnection.status` and calling `refreshStatus()` when already connected.
2. **Indicator latency to green.** Resolved by having the prober probe on the shared conn's
   `"connected"` event (not only on its 30 s tick).
3. **`mneme.enabled` gating.** The shared conn connects only when `enabled && running`; reaching the
   config editor implies the feature is enabled (sidecar auto-launch is gated on `mneme.enabled`), so
   the editor's tool calls have a client. Disabling mid-session disconnects the shared conn → editor
   shows `"disconnected"`, which is correct.
4. **Per-call timeout breaking long ops.** Only the lightweight `wiki_status` health/status calls get
   the 10 s timeout; mutating/long-running calls keep their existing (default/progress) options.

## Acceptance criteria

- [ ] Only **one** MCP session to the Mneme sidecar exists at steady state with a `mneme://` doc open
      **and** the config editor open (verify via `mneme.log`: no ongoing `create new session` storm).
- [ ] Opening a `mneme://` doc and idling 10+ min does **not** produce `Request timed out` toasts; the
      header indicator stays green and the config editor stays "Connected".
- [ ] If the connection does drop, the indicator/editor recover automatically within seconds (not a
      60 s stall), and `wiki_status` health calls fail fast (10 s) rather than hanging.
- [ ] Config editor actions (add/remove root, reindex, model update, filters) still work through the
      shared client.
- [x] `tsc --noEmit` and `eslint` are clean.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/mneme-connection.ts` | expose `status`/`error`/`serverInfo` + multi-subscriber `onStatusChange` + `reconnect()`; wire `manager.onStatusChange` fan-out |
| `src/renderer/api/mneme-status.ts` | reuse `mnemeConnection.getClient()`; remove own manager; probe on `"connected"`; 10 s timeout on `wiki_status` |
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | reuse `mnemeConnection`; subscribe to shared status; remove own manager/connect/dispose; 10 s timeout on `wiki_status`; delegate reconnect/restart |
