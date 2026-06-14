# US-671 — MCP connection auto-reconnect (Mneme editor drops to "Disconnected" after ~5 min)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · related robustness fix (shared MCP client infra)
**Type:** Bug
**Status:** Implemented — pending manual test
**Spans:** Renderer (`src/renderer/`) only

## Implementation notes (as built)

Both layers landed as designed, opt-in:

- `McpConnectionConfig` gained `autoReconnect?: boolean` (default false). `McpConnectionManager`
  remembers the last config and, on an **unexpected** drop (`onclose` while connected, `onerror`, or
  a failed (re)connect in the `connect()` catch), schedules a retry with capped backoff
  (`1s → 2s → 5s → 10s → 15s`, then steady at 15s). Retries continue until success or an intentional
  `disconnect()`/`dispose()`, both of which `cancelReconnect()` + clear `_autoReconnect` (re-armed by
  the next `connect()`). The reconnect attempt bypasses the `connect()` top-guard cleanly because the
  status after a drop is `error`/`disconnected`, so no spurious disconnect cycle runs.
- The HTTP transport now passes `reconnectionOptions` with `maxRetries: 10` (SDK default is 2), so
  the SDK's own SSE re-establishment absorbs most transient drops before the app layer steps in.
- `MnemeConfigEditorModel` connects with `autoReconnect: true`. Stopping the sidecar still routes
  through `applySidecarStatus` → `dispose()`, which cancels the retry loop (no storm).

`tsc --noEmit` and `eslint` are clean on both changed files.

## Goal

Make a Persephone MCP connection **recover automatically** from a transport-level session drop
while the server is still alive, instead of latching to "Disconnected" after the SDK's 2 reconnection
attempts are exhausted. Fixes the observed Mneme config editor symptom: it shows **"Disconnected"**
with *"Maximum reconnection attempts (2) exceeded"* even though the Mneme header indicator is green
and the sidecar process is healthy.

## Symptom (reproduced in dev)

- Mneme config editor intermittently shows **Disconnected** + error *"Maximum reconnection attempts
  (2) exceeded."*
- The header Mneme indicator stays **green** at the same time.
- Clicking **Restart Mneme** recovers it, but after some minutes it disconnects again with the same
  error. There is no self-recovery.

## Diagnosis (from `mneme.log`)

Log file: `<userData>/data/mneme/mneme.log` (dev:
`C:\Users\<user>\AppData\Roaming\persephone\data\mneme\mneme.log`). Truncated each start (US-669).

The Mneme **process is healthy** — no errors in it:

```
10:37:17  config loaded … roots=2
10:37:17  mneme MCP server listening on 127.0.0.1:7700/mcp
10:37:18  create new session ×3   (client: persephone-mcp-inspector)
10:37:22  reconcile complete root=TestWiki      … errors: 0
10:37:22  reconcile complete root=EvergreenWiki … errors: 0
10:38:10  create new session
10:42:18  input stream terminated → serve finished quit_reason=Closed
10:42:22  input stream terminated → serve finished quit_reason=Closed
10:43:11  input stream terminated → serve finished quit_reason=Closed
10:45:51  create new session
```

Two findings:

1. **Sessions die ~5 minutes after creation.** Created 10:37:18 → closed 10:42:18 (exactly 5:00);
   10:38:10 → ~10:43:11. `quit_reason=Closed` + `input stream terminated` = **the client side
   dropped the SSE stream** (not the server). The SDK then reconnects (new session at 10:45:51); when
   its 2 retries happen to fail, it raises *"Maximum reconnection attempts (2) exceeded."*

2. **The server is not the timeout source.** rmcp's `StreamableHttpServerConfig` default already
   sends SSE keep-alive pings every **15 s** (`sse_keep_alive: Some(15s)`,
   `rmcp-1.7.0/.../streamable_http_server/tower.rs:107-112`). So the ~5-min teardown originates on the
   Electron/Chromium fetch side holding the long-lived SSE GET — not from Mneme.

### Why it never recovers (the actual app bug)

In `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts`:

- `onStatusChange` (`:95-111`): on `"error"`/`"disconnected"` it only records the error, stops
  polling, and clears state — it **never reconnects**.
- `applySidecarStatus` (`:135-156`) is the only path that calls `connection.connect(...)`, and it
  only runs from the `eMnemeStatusChanged` IPC subscription (`:114`) or `initConnection`. A
  session-level drop does **not** change the sidecar process, so `eMnemeStatusChanged` never fires →
  no reconnect.

In `src/renderer/editors/mcp-inspector/McpConnectionManager.ts`:

- `connect()` builds `new StreamableHTTPClientTransportClass(new URL(config.url))` with **no
  options** (`:91-93`) — so the SDK's reconnection uses its default `maxRetries: 2`.
- `transport.onclose` → `setStatus("disconnected")` if it was connected (`:111-117`);
  `transport.onerror` → `setStatus("error")` (`:118-125`). **Neither attempts a reconnect.**

The header stays green because `src/main/mneme-service.ts` tracks only child-process liveness
(`running`), independent of MCP session health (correct, but misleading next to the editor).

## Proposed fix

Two complementary layers (implement at least layer A; B is a cheap reinforcement):

### A. App-level auto-reconnect in `McpConnectionManager` (primary)

- Remember the last `connect()` config. On an **unexpected** drop (`onclose` while connected, or
  `onerror`) that is **not** an intentional `disconnect()`/`dispose()` (guard with the existing
  `_disconnecting` flag), schedule a reconnect with **capped exponential backoff** (e.g. 1s → 2s →
  5s → 10s, cap ~15s; keep retrying while the caller wants it).
- Gate auto-reconnect behind an **opt-in flag** on `McpConnectionConfig` (e.g. `autoReconnect?:
  boolean`) so the MCP **Inspector** editor keeps its current manual behavior and only the **Mneme**
  config editor opts in. (Decision — see Concern 3.)
- Cancel any pending reconnect timer on `disconnect()`/`dispose()` and on a successful reconnect.
- Optionally expose a `"reconnecting"` status (or reuse `"connecting"`) so the editor can show
  "Reconnecting…" instead of a hard "Disconnected".

### B. Raise the SDK transport's reconnection budget (reinforcement)

- Pass `reconnectionOptions` to `StreamableHTTPClientTransport` (`:91`) bumping `maxRetries` well
  above the default 2 (e.g. 10) and tuning the delay fields, so the SSE stream re-establishes itself
  transparently before the app layer needs to act. *(Verify the exact option/field names against
  `@modelcontextprotocol/sdk@1.27.1` — `StreamableHTTPClientTransportOptions.reconnectionOptions`:
  `maxRetries`, `initialReconnectionDelay`, `maxReconnectionDelay`, `reconnectionDelayGrowFactor`.)*

### Editor side (`MnemeConfigEditorModel`)

- Pass `autoReconnect: true` in the `connect(...)` call at `:143-147`.
- With layer A handling reconnection, `onStatusChange` needs no reconnect logic of its own; just make
  sure it doesn't permanently clear in a way that fights the auto-reconnect (clearing `status` on a
  transient drop is fine — it repopulates on reconnect via `refreshStatus`).

## Concerns & proposed resolutions

1. **Reconnect storm if the server is genuinely down.** *Resolution:* capped backoff + only
   auto-reconnect on *unexpected* drops; stop on intentional `disconnect`/`dispose`. When the sidecar
   is actually stopped, `eMnemeStatusChanged` already drives `dispose()` (`applySidecarStatus` else
   branch, `:149-155`), which cancels the reconnect loop — so a stopped sidecar won't be hammered.
2. **Root cause of the ~5-min SSE teardown is still unknown.** *Resolution:* auto-reconnect makes it
   non-fatal regardless of cause; investigating the Electron/Chromium connection lifetime is a
   *nice-to-have*, not a blocker. Note any finding but don't gate the fix on it.
3. **Shared manager — MCP Inspector vs Mneme editor.** Auto-reconnecting unconditionally would change
   the Inspector's behavior. *Resolution:* opt-in `autoReconnect` flag on `McpConnectionConfig`
   (default `false`); only the Mneme config editor sets it. *(Alternative: always auto-reconnect on
   unexpected drops — simpler but changes Inspector UX. Recommend opt-in.)*
4. **Duplicate sessions in dev (3 sessions at startup).** Likely React StrictMode double-mount and/or
   the MCP Inspector also being open. *Resolution:* out of scope here — note as an observation; it
   doesn't affect the reconnect fix. Revisit only if it proves to cause real session churn.
5. **Possible US-661/662 impact.** A flapping connection would also undermine `MnemeProvider`'s
   subscription-based live refresh. *Resolution:* landing this first gives those tasks a stable
   transport; not a hard dependency but sequencing it before/with US-661 is sensible.

## Acceptance criteria

- [x] When the Mneme MCP session drops while the sidecar is running, the config editor **reconnects
      automatically** (no manual Restart) and returns to "Connected" with status repopulated. *(code-complete)*
- [x] The editor no longer latches on *"Maximum reconnection attempts (2) exceeded"* for a transient
      drop; at most it briefly shows "Connecting…". *(code-complete)*
- [x] Auto-reconnect uses capped backoff and **stops** on intentional disconnect, dispose, and when
      the sidecar is reported stopped (no reconnect storm). *(code-complete)*
- [x] MCP **Inspector** editor behavior is unchanged (auto-reconnect is opt-in via `autoReconnect`).
- [x] `tsc --noEmit` and `eslint` clean.
- [ ] **Manual verification (yours):** leave the Mneme config editor open >5 min idle; it stays
      connected (or silently reconnects) rather than dropping to Disconnected.

> **Renderer task** — in scope for `/review`. `/userdoc` only if user-visible behavior warrants a
> note (the "Reconnecting…" state is minor). Tracked under EPIC-032 as a robustness fix; per the
> epic's deferred-review model it stays `[ ]` until reviewed.

## Files changed (anticipated)

| File | Change |
|------|--------|
| `src/renderer/editors/mcp-inspector/McpConnectionManager.ts` | `autoReconnect` flag on `McpConnectionConfig`; remember last config; backoff reconnect loop on unexpected `onclose`/`onerror`; cancel on `disconnect`/`dispose`; pass `reconnectionOptions` to the transport |
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | pass `autoReconnect: true` in `connect(...)`; ensure `onStatusChange` doesn't fight auto-reconnect |
