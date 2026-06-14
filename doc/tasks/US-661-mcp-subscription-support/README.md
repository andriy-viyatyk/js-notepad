# US-661 — `McpConnectionManager` subscription support (renderer client wiring)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4 (Persephone content integration)
**Status:** Planned (design for review)
**Spans:** Renderer (`src/renderer/`) only
**Status:** Implemented — `tsc --noEmit` + `eslint` clean; pending manual smoke
**Depends on:** [US-670](../US-670-mneme-resource-subscription-emit/README.md) — landed (the Mneme
server now advertises `resources.subscribe` and emits `resources/updated` / `resources/list_changed`).

## Implementation notes (as built)

All in `src/renderer/editors/mcp-inspector/McpConnectionManager.ts`, composing cleanly with the
US-671 auto-reconnect:

- `loadSdk()` also loads `ResourceUpdatedNotificationSchema` / `ResourceListChangedNotificationSchema`
  from `@modelcontextprotocol/sdk/types.js` (module-level refs typed via `typeof import(...)`).
- New public surface: `subscribeResource(uri)` / `unsubscribeResource(uri)` (idempotent against a
  `subscriptions: Set<string>`; issue the SDK call when connected, else just record for replay), and
  `onResourceUpdated(uri)` / `onResourceListChanged()` callbacks (default no-ops, like
  `onStatusChange`).
- `connect()` registers both notification handlers **before** `client.connect()` (so an immediate
  notification isn't missed), and **after** a successful connect replays the subscription set —
  gated on `serverInfo.capabilities.resources`, each call wrapped in try/catch. Because US-671's
  auto-reconnect calls `connect()` again, a dropped-and-reconnected session **re-subscribes
  automatically**.
- `disconnect()` keeps the set (so reconnect replays); `dispose()` clears it and resets the two
  callbacks to no-ops.
- No UI and no other files changed — `MnemeConfigEditorModel` is untouched (the consumer is US-662).

## Goal

Add the **client half** of MCP resource subscriptions to `McpConnectionManager`:
`subscribeResource` / `unsubscribeResource` passthroughs, handlers for the
`notifications/resources/updated` and `notifications/resources/list_changed` notifications, and
**automatic re-subscription on reconnect**. This is the renderer plumbing for the epic's
conflict-handling decision (EPIC-032 Notes, 2026-06-13). The server emit lives in **US-670**; the
**consumers** are US-662 (`MnemeProvider` → reload path) and US-663 (`MnemeTreeProvider` → tree
refresh). US-661 ships **no UI**.

## Scope

**In scope (renderer)**

- `subscribeResource` / `unsubscribeResource` on `McpConnectionManager`.
- Register `setNotificationHandler` for `resources/updated` + `resources/list_changed`, surfaced as
  `onResourceUpdated(uri)` / `onResourceListChanged()` callbacks.
- A replay set so subscriptions survive reconnects; correct teardown in `disconnect`/`dispose`.

**Out of scope (explicit)**

- Mneme server-side emit (capability, `subscribe`/`unsubscribe`, watcher fan-out) → **US-670**.
- `MnemeProvider` (US-662), `MnemeTreeProvider` (US-663), self-echo suppression for Persephone's own
  `wiki_write` saves (US-662).
- Any UI affordance to subscribe — the MCP Inspector editor is **not** modified.

## Background (renderer, verified)

All work in `src/renderer/editors/mcp-inspector/McpConnectionManager.ts`:

- SDK `@modelcontextprotocol/sdk@1.27.1`, loaded at runtime via `require()` in `loadSdk()`
  (`:48-55`) to bypass Vite; types are type-only imports.
- `Client` created at `:104`, connected at `:127`. Transport `onclose`/`onerror` wired at
  `:110-125`. `disconnect()` (`:157`) nulls `client`/`transport`; `dispose()` (`:174`) calls
  `disconnect()` + clears `onStatusChange`.
- **No notification handlers registered today** — `setNotificationHandler` / `fallbackNotificationHandler`
  are never called. Per-request `onprogress` is used by `MnemeConfigEditorModel` via
  `callTool(..., { onprogress })`, routed internally by the SDK (not a persistent handler).
- State is exposed via a single `onStatusChange` callback (`:66`); consumers bridge it into their
  own `TComponentState`. The new `onResourceUpdated`/`onResourceListChanged` follow the same plain-
  callback pattern.
- SDK `Client` already offers (from its `.d.ts`): `subscribeResource({ uri }, opts?)`,
  `unsubscribeResource({ uri }, opts?)`, and `setNotificationHandler(schema, handler)`. Notification
  schemas live in `@modelcontextprotocol/sdk/types.js`: `ResourceUpdatedNotificationSchema`
  (params include `uri`), `ResourceListChangedNotificationSchema`.
- **Reconnect destroys the `Client`.** `connect()` self-`disconnect()`s first (`:79-81`) and
  `disconnect()` nulls `this.client` (`:167`) — so any prior `subscribeResource` calls are lost and
  must be replayed after the new transport connects.

## Implementation plan

All edits in `src/renderer/editors/mcp-inspector/McpConnectionManager.ts`.

**1. Load the notification schemas** in `loadSdk()` (`:48-55`) via `require`, mirroring `ClientClass`:

```ts
const types = require("@modelcontextprotocol/sdk/types.js");
ResourceUpdatedNotificationSchemaRef = types.ResourceUpdatedNotificationSchema;
ResourceListChangedNotificationSchemaRef = types.ResourceListChangedNotificationSchema;
```
(module-level `let` refs, like `ClientClass` at `:44-46`.)

**2. New public surface** on `McpConnectionManager`:

```ts
/** Fired when the server emits notifications/resources/updated for a subscribed URI. */
onResourceUpdated: (uri: string) => void = () => {};
/** Fired when the server emits notifications/resources/list_changed. */
onResourceListChanged: () => void = () => {};

private subscriptions = new Set<string>();   // replayed on (re)connect

async subscribeResource(uri: string): Promise<void> {
    this.subscriptions.add(uri);
    if (this._status === "connected") await this.client?.subscribeResource({ uri });
}
async unsubscribeResource(uri: string): Promise<void> {
    this.subscriptions.delete(uri);
    if (this._status === "connected") await this.client?.unsubscribeResource({ uri });
}
```

**3. Register handlers + replay** inside `connect()`, after `await this.client.connect(...)`
(`:127`) and before `setStatus("connected")` (`:147`):

```ts
this.client.setNotificationHandler(ResourceUpdatedNotificationSchemaRef,
    (n: { params: { uri: string } }) => this.onResourceUpdated(n.params.uri));
this.client.setNotificationHandler(ResourceListChangedNotificationSchemaRef,
    () => this.onResourceListChanged());

// Replay subscriptions across reconnects (the prior Client was destroyed on disconnect).
for (const uri of this.subscriptions) {
    try { await this.client.subscribeResource({ uri }); } catch { /* server may lack the doc now */ }
}
```

**4. Lifecycle.** `disconnect()` (`:157`) must **not** clear `this.subscriptions` (so reconnect
replays). `dispose()` (`:174`) clears it (`this.subscriptions.clear();`) and resets
`onResourceUpdated` / `onResourceListChanged` to no-ops alongside the existing `onStatusChange` reset.

**5. Capability guard (defensive).** `subscribeResource` may run against a server without the
capability. Guard on `this._serverInfo?.capabilities.resources` before issuing the call and rely on
the `try/catch` in step 3; never throw on a missing capability — log and skip. (With US-670 landed,
the happy path is unaffected.)

### Files needing NO changes

- `src/renderer/editors/mneme-config/*` — the config editor does not subscribe (US-664/669 use
  `wiki_status` polling).
- `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` — no UI subscribe affordance.
- All `mneme/` Rust code — that's US-670.

## Concerns & proposed resolutions

1. **Reconnect loses subscriptions (Client destroyed on `disconnect`).** *Resolution:*
   `McpConnectionManager` owns a `subscriptions: Set<string>` replayed inside `connect()` after the
   transport connects. `disconnect()` keeps the set; `dispose()` clears it. Consumers just call
   `subscribeResource`/`unsubscribeResource`; reconnect "just works." This is the manager's value-add
   over a raw passthrough.
2. **No standalone consumer to exercise this in US-661.** The MCP Inspector doesn't subscribe and we
   add no UI. *Resolution:* the renderer wiring is exercised for real in **US-662** (`MnemeProvider`);
   for US-661, a manual smoke is optional via a throwaway `execute_script` snippet against the live
   sidecar (subscribe a URI, edit the file on disk, observe `onResourceUpdated`). Automated coverage
   of the primitive lives in **US-670**'s Rust integration test. Accepted — this task is plumbing.
3. **Capability mismatch / SDK throwing.** If `subscribeResource` runs against a server without the
   `subscribe` capability, the SDK may reject. *Resolution:* guard on
   `serverInfo.capabilities.resources` + wrap in `try/catch`; never throw on a missing capability.
4. **`subscribeResource` called while disconnected.** *Resolution:* add to the set and skip the
   client call; it's replayed on the next `connect()`. (`unsubscribeResource` symmetrically removes
   from the set.)

## Acceptance criteria

- [x] `McpConnectionManager.subscribeResource(uri)` / `unsubscribeResource(uri)` issue the SDK calls
      when connected and update the replay set when disconnected. *(code-complete)*
- [x] `onResourceUpdated(uri)` fires on `notifications/resources/updated`; `onResourceListChanged()`
      fires on `notifications/resources/list_changed`. *(handlers registered; verify live)*
- [x] After a disconnect + reconnect, prior subscriptions are **re-issued** automatically (replay in
      `connect()`); `dispose()` clears the set and resets the callbacks. *(code-complete)*
- [x] `tsc --noEmit` and `eslint` are clean.
- [ ] **Manual smoke (yours):** against the live Mneme sidecar (US-670), subscribing a doc URI and
      editing the file on disk triggers `onResourceUpdated` with that URI — e.g. via an
      `execute_script` snippet, since there's no UI consumer until US-662.

> **Renderer task** — in scope for `/review`; run `/document` only if a developer-doc pointer is
> warranted; `/userdoc` only if user-facing behavior changes (it does not here — no UI). **Epic
> task** — stays `[ ]` under EPIC-032 until the epic's deferred review.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/editors/mcp-inspector/McpConnectionManager.ts` | load notification schemas; `subscribeResource`/`unsubscribeResource`; `onResourceUpdated`/`onResourceListChanged`; handler registration + reconnect replay; lifecycle in `disconnect`/`dispose` |
