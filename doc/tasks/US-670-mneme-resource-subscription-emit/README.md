# US-670 — Mneme resource-subscription emit (capability + subscribe/unsubscribe + watcher fan-out)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4 (Persephone content integration)
**Status:** Planned (design for review)
**Spans:** Rust (`mneme/`) only — **predecessor of [US-661](../US-661-mcp-subscription-support/README.md)**

## Goal

Make the Mneme MCP server support the standard **resource-subscription** primitive: advertise the
`resources.subscribe` capability, implement the `subscribe` / `unsubscribe` handlers, and emit
`notifications/resources/updated { uri }` when the always-on watcher detects a file change (plus
`notifications/resources/list_changed` when a root's file set or the root list changes).

This is the **server half** of the epic's conflict-handling decision (EPIC-032 Notes, 2026-06-13:
"live refresh via MCP resource subscriptions; last-write-wins, no locking"). The **client half** —
`McpConnectionManager.subscribeResource`/`unsubscribeResource` + notification handlers + reconnect
replay — is [US-661](../US-661-mcp-subscription-support/README.md), which depends on this task. The
**consumers** are US-662 (`MnemeProvider` → reload path) and US-663 (`MnemeTreeProvider` → tree
refresh). This task ships **no renderer code and no UI**.

## Scope

**In scope (Rust, `mneme/`)**

- Advertise `resources.subscribe` + `resources.listChanged`.
- Implement `subscribe`/`unsubscribe` on `MnemeServer`.
- A process-wide, session-keyed `SubscriptionRegistry` on `ServerState`.
- Watcher → unbounded channel → async fan-out task emitting `resources/updated` (per subscribed
  URI) and `resources/list_changed`.
- A Rust integration test proving subscribe → file-edit → `resources/updated`.

**Out of scope (explicit)**

- `McpConnectionManager` client wiring → **US-661**.
- `MnemeProvider` (US-662), `MnemeTreeProvider` (US-663), self-echo suppression for Persephone's
  own `wiki_write` saves (US-662).
- Bearer/OAuth, multi-tenant, networked transport.

## Background (verified, rmcp 1.7)

The server does **not** support subscriptions today:

- **Capabilities builder** `mneme/src/mcp/server.rs:195-199` advertises only
  `.enable_tools().enable_resources()` — no `subscribe` flag. rmcp 1.7 offers
  `.enable_resources_subscribe()` (sets `resources.subscribe = true`; only available after
  `.enable_resources()`) and `.enable_resources_list_changed()`.
- **`subscribe`/`unsubscribe`** are rmcp `ServerHandler` trait methods (rmcp 1.7
  `handler/server.rs`): `async fn subscribe(&self, request: SubscribeRequestParam, context:
  RequestContext<RoleServer>) -> Result<(), McpError>` and the `unsubscribe` analogue. Both default
  to `method_not_found`; `MnemeServer` does not override them. *(Confirm the exact param type name —
  `SubscribeRequestParam` vs `…Params` — against the resolved rmcp 1.7 source at impl time; the
  field is `uri: String`.)*
- **Server-initiated push**: `ctx.peer` is a `Peer<RoleServer>` (`Clone + Send + Sync`) for the
  current session — already used by `wiki_reindex` (`server.rs:150,156` → `peer.notify_progress(...)`).
  Relevant methods: `peer.notify_resource_updated(ResourceUpdatedNotificationParam { uri })` and
  `peer.notify_resource_list_changed()`.
- **No session registry exists.** `MnemeServer` is `#[derive(Clone)]` (`server.rs:37`) and built
  fresh per session by the factory `move || Ok(MnemeServer::new(...))` (`server.rs:283`). Shared
  state lives on `Arc<ServerState>` (`mcp/mod.rs:45-61`) — so the registry must live on `ServerState`.
- **Resource handlers** `server.rs`: `list_resources` (`:206-214`, `mneme://guide` +
  `mneme://status`), `list_resource_templates` (`:216-233`, `mneme://{root}/{path}`), `read_resource`
  (`:235-267`).
- **Watcher** `mneme/src/watcher/mod.rs`: `RootWatcher::start(root, index, embed, jobs, cancel)`
  (`:46-52`); the debounced callback (`:55-75`) receives `DebounceEventResult` whose events carry
  absolute `ev.paths`, filters via `is_watch_ignored(&folder, p)` (`:89`), then calls
  `jobs.reconcile_coalesced(...)`. The callback runs on the **debouncer's own thread** (not a tokio
  context), so async notifications need a bridge (channel — see plan). **Call sites** in
  `mneme/src/indexer/mod.rs`: `start_watchers` (`:474`), `add_root` (`:494`), `update_root_filters`
  (`:535`); watchers owned in `IndexManager.watchers` (`:385`); `IndexManager::start` at `:607`.
- **`serve`** `server.rs:273-300` builds the tokio runtime, calls `ServerState::new` (`:279`), then
  serves — the natural place to spawn the fan-out task (inside the runtime).

## Implementation plan

**1. Subscription registry — new file `mneme/src/mcp/subscriptions.rs`.**

Process-wide, session-keyed, shared via `Arc` (so the fan-out task can hold a clone):

```rust
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use rmcp::model::ResourceUpdatedNotificationParam;
use rmcp::service::Peer;
use rmcp::RoleServer;

#[derive(Default)]
pub struct SubscriptionRegistry {
    inner: Mutex<HashMap<u64, SessionSubs>>, // session id -> its peer + subscribed URIs
}

struct SessionSubs {
    peer: Peer<RoleServer>,
    uris: HashSet<String>,
}

impl SubscriptionRegistry {
    /// Record/refresh a session's peer (called on subscribe + list_resources + read_resource so
    /// list_changed broadcasts reach any session that ever touched resources, not only subscribers).
    pub fn touch(&self, session: u64, peer: &Peer<RoleServer>) { /* upsert peer, keep uris */ }

    pub fn subscribe(&self, session: u64, peer: &Peer<RoleServer>, uri: String) { /* touch + insert uri */ }
    pub fn unsubscribe(&self, session: u64, uri: &str) { /* remove uri (keep session for broadcast) */ }
    pub fn drop_session(&self, session: u64) { /* best-effort cleanup */ }

    /// Notify every session subscribed to `uri`. Clone the target peers under the lock, release the
    /// lock, await the sends, then re-lock to evict sessions whose send failed (dead-peer GC).
    pub async fn notify_updated(&self, uri: &str) { /* see note */ }

    /// Broadcast resources/list_changed to all known session peers (evict on send failure).
    pub async fn notify_list_changed(&self) { /* same lock/clone/await/evict pattern */ }
}
```

> **`std::sync::Mutex` across `await`:** never hold the guard over `.await`. Pattern: lock → collect
> `Vec<(u64, Peer)>` of targets → drop guard → `for (id, peer) in targets { if peer.
> notify_resource_updated(...).await.is_err() { failed.push(id) } }` → re-lock → remove `failed`.

Also define the watcher bridge here (or in `watcher/mod.rs`):

```rust
#[derive(Clone)]
pub struct WatchNotifier(tokio::sync::mpsc::UnboundedSender<WatchEvent>);
pub enum WatchEvent { Updated(String /*uri*/), ListChanged }
```

**2. Per-session id + registry on `ServerState`** (`mneme/src/mcp/mod.rs`):

- Add `mod subscriptions;` and fields: `subscriptions: Arc<SubscriptionRegistry>`,
  `next_session: std::sync::atomic::AtomicU64`, plus the watch channel (`watch_tx: WatchNotifier`,
  `watch_rx: Mutex<Option<UnboundedReceiver<WatchEvent>>>`). Init in `ServerState::new` (`:82-99`) —
  **create the channel before `IndexManager::start`** so the `WatchNotifier` can be threaded in;
  stash the receiver for the fan-out task to claim.
- Add `pub fn next_session_id(&self) -> u64 { self.next_session.fetch_add(1, Ordering::Relaxed) }`,
  `pub fn subscriptions(&self) -> Arc<SubscriptionRegistry>`, and `pub fn spawn_fanout(self: &Arc<Self>)`:
  ```rust
  pub fn spawn_fanout(self: &Arc<Self>) {
      let Some(mut rx) = self.watch_rx.lock().unwrap().take() else { return; };
      let me = Arc::clone(self);
      tokio::spawn(async move {
          while let Some(ev) = rx.recv().await {
              match ev {
                  WatchEvent::Updated(uri) => me.subscriptions.notify_updated(&uri).await,
                  WatchEvent::ListChanged  => me.subscriptions.notify_list_changed().await,
              }
          }
      });
  }
  ```

**3. Thread `WatchNotifier` into the watcher.**

- `IndexManager` gets a `watch_notifier: WatchNotifier` field, set in `IndexManager::start`
  (`indexer/mod.rs:607`) from the value `ServerState::new` passes in. **Add the new arg to
  `RootWatcher::start`'s signature** (`watcher/mod.rs:46`) and pass `self.watch_notifier.clone()` at
  all three call sites (`:477`, `:494`, `:535`).
- In the watcher callback (`watcher/mod.rs:55-75`): for each non-ignored path, compute
  `uri = format!("mneme://{}/{}", root.name, rel.to_string_lossy().replace('\\', "/"))` (where
  `rel = p.strip_prefix(&folder)`) and `notifier.send(WatchEvent::Updated(uri))`. If any event kind
  is a create/remove/rename (`ev.kind`), also send one `WatchEvent::ListChanged` for the batch.
  **Keep the existing `trigger()` reconcile call unchanged.** *(If precise `ev.kind` classification
  is awkward, fall back to: always `Updated` for touched paths + a single `ListChanged` when the
  touched set changes membership — see Concern 4.)*

**4. Advertise the capability** (`server.rs:195-199`):

```rust
ServerCapabilities::builder()
    .enable_tools()
    .enable_resources()
    .enable_resources_subscribe()      // NEW — resources/updated
    .enable_resources_list_changed()   // NEW — resources/list_changed
    .build(),
```

**5. Per-session id on `MnemeServer`** (`server.rs:37-50`):

```rust
#[derive(Clone)]
pub struct MnemeServer { state: Arc<ServerState>, tool_router: ToolRouter<MnemeServer>, session: u64 }
// in new(): session: state.next_session_id(),
```

**6. Implement `subscribe`/`unsubscribe`** on `impl ServerHandler for MnemeServer` (alongside the
resource handlers):

```rust
async fn subscribe(&self, request: SubscribeRequestParam, ctx: RequestContext<RoleServer>)
    -> std::result::Result<(), McpError> {
    self.state.subscriptions().subscribe(self.session, &ctx.peer, request.uri);
    Ok(())
}
async fn unsubscribe(&self, request: UnsubscribeRequestParam, _ctx: RequestContext<RoleServer>)
    -> std::result::Result<(), McpError> {
    self.state.subscriptions().unsubscribe(self.session, &request.uri);
    Ok(())
}
```

Add `self.state.subscriptions().touch(self.session, &ctx.peer);` at the top of `list_resources` and
`read_resource` (name their `ctx`) so a list-only client (US-663) is registered for `list_changed`.

**7. Spawn the fan-out task** in `serve` right after `let state = ServerState::new(...)?;`
(`server.rs:279`): `state.spawn_fanout();` (inside the runtime, so `tokio::spawn` has a context).

**8. `list_changed` on root add/remove (optional).** After `wiki_add_root` / `wiki_remove_root`
succeed, also push `WatchEvent::ListChanged`. Lower priority (file create/remove events already
cover most tree changes); include if trivial.

**9. Integration test** (`mneme/tests/`): start `ServerState`, `spawn_fanout`, subscribe a peer to a
doc URI, modify that file on disk, assert `resources/updated { uri }` arrives within debounce + a
small margin; assert an unsubscribed URI yields nothing; assert a create/delete yields
`resources/list_changed`. *(Drive via the in-process `ServerState`/registry where possible — the MCP
tool logic is testable without an HTTP transport, per `mcp/mod.rs` design.)*

**10. Docs.** Update `mneme/README.md` (`:65-68` "MCP surface") and the stale "not yet subscribable —
US-661/662" comments (`server.rs:25`, `mcp/mod.rs:6`) to state subscriptions are now supported.
Update `mneme/assets/wiki-guide.md` only if it documents the resource surface.

### Files needing NO changes

- `mneme/src/indexer/job.rs`, `mneme/src/index/*`, embedding/model code — fan-out is additive.
- The `wiki_write`/`wiki_edit` tools — the watcher catches their disk writes; no separate hook.
- Any renderer code — that's US-661.

## Concerns & proposed resolutions

1. **No rmcp session-close hook / dead-peer cleanup.** Closed sessions linger in the registry until
   the next notify fails. *Resolution:* **lazy eviction** — every `notify_*` removes sessions whose
   send returned `Err` (channel-closed canary). For loopback with effectively one client this is
   bounded and self-healing; add a best-effort `drop_session` if a future rmcp hook appears.
2. **Peer identity for `unsubscribe`.** `Peer` has no stable equality. *Resolution:* key the registry
   by a **per-session `u64`** assigned in `MnemeServer::new` (from `ServerState.next_session`);
   `subscribe`/`unsubscribe` operate on `(session, uri)`. `#[derive(Clone)]` copies the id so
   rmcp-internal clones stay the same session. Deterministic, no `uuid`/RNG.
3. **`Mutex` across `await`.** *Resolution:* lock → clone targets → drop guard → await sends →
   re-lock to evict (the boxed note in step 1).
4. **`resources/updated` granularity.** `reconcile_coalesced` reports nothing per-file, but the
   **debounced watcher events already carry `ev.paths`** — derive URIs there, before delegating to
   reconcile (no reconcile-signature change). Because `MnemeProvider` re-reads the **file**
   (`resources/read`), not the index, notification timing vs reconcile completion is immaterial.
   Coarse fallback acceptable for v1 if `ev.kind` classification is fiddly.
5. **Sync watcher thread emitting async notifications.** *Resolution:* the watcher only `send`s on an
   **unbounded channel** (sync, non-blocking); a single async **fan-out task** owns the receiver +
   registry and performs all `await` notifies, centralizing eviction. *(Alternative: capture a
   `tokio::runtime::Handle` and `handle.spawn` each notify — fewer parts but scatters eviction and
   couples the watcher to the registry. Channel chosen.)*
6. **Fan-out spawned after watchers exist.** `IndexManager` (and its watchers) is created inside
   `ServerState::new`, before `spawn_fanout` runs. *Resolution:* the unbounded channel buffers in the
   meantime; the deferred startup reconcile produces no `resources/updated` for unchanged files, so
   nothing meaningful is lost.

## Acceptance criteria

- [ ] `mneme.exe` advertises `resources.subscribe` (and `resources.listChanged`) — visible in an
      MCP client's capability readout / the initialize result.
- [ ] `subscribe` / `unsubscribe` succeed (no `method_not_found`).
- [ ] **Integration test:** subscribe to a doc URI → modify the file → a `resources/updated { uri }`
      is delivered to the subscribed peer within debounce + margin; an unsubscribed URI gets nothing;
      a create/delete in the root yields `resources/list_changed`.
- [ ] Dead-peer eviction: after a subscribed session closes, a subsequent change does not panic and
      the closed session is dropped from the registry (verified by the next notify succeeding for
      remaining sessions).
- [ ] `cargo build --release` and `cargo test` pass for `mneme/`.
- [ ] `mneme/README.md` + the stale "not yet subscribable" comments updated.

> **Per project rules:** `mneme/` is Rust — **skip `/review` and `/userdoc`**; verify via
> `cargo build --release` + `cargo test`. Run `/document` only if a developer-doc pointer is
> warranted. **Epic task** — stays `[ ]` under EPIC-032 until the epic's deferred review.

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/src/mcp/subscriptions.rs` | **NEW** — `SubscriptionRegistry` (session-keyed) + `WatchNotifier`/`WatchEvent` |
| `mneme/src/mcp/mod.rs` | `mod subscriptions;`; `ServerState`: `subscriptions`, `next_session`, watch channel + receiver; `next_session_id()`, `subscriptions()`, `spawn_fanout()`; thread `WatchNotifier` into `IndexManager::start`; drop stale "not yet advertised" comment (`:6`) |
| `mneme/src/mcp/server.rs` | `.enable_resources_subscribe()`/`.enable_resources_list_changed()`; `MnemeServer.session`; `subscribe`/`unsubscribe` impls; `touch` in `list_resources`/`read_resource`; `state.spawn_fanout()` in `serve`; update `STATUS_URI` comment (`:25`) |
| `mneme/src/watcher/mod.rs` | `RootWatcher::start` takes a `WatchNotifier`; callback maps changed paths → `mneme://{root}/{rel}` and sends `Updated`/`ListChanged` |
| `mneme/src/indexer/mod.rs` | `IndexManager.watch_notifier` field; set in `start`; pass into the 3 `RootWatcher::start` call sites (`:477,:494,:535`); optional `ListChanged` after add/remove root |
| `mneme/tests/` | **NEW** integration test: subscribe → edit → assert `resources/updated` |
| `mneme/README.md` | "MCP surface": mark `mneme://{root}/{path}` + `mneme://status` subscribable |
