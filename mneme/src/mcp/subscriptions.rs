//! Resource-subscription registry + watcher→notification bridge (US-670).
//!
//! The server advertises `resources.subscribe`; clients call `resources/subscribe { uri }` for the
//! documents they have open. When the always-on watcher detects a file change it derives the
//! `mneme://{root}/{path}` URI and hands it to the async fan-out task, which calls
//! `peer.notify_resource_updated(uri)` for every session subscribed to that URI (and
//! `peer.notify_resource_list_changed()` on structural changes).
//!
//! Two halves connected by an unbounded channel:
//! - [`WatchNotifier`] — a cheap, `Clone`, **sync** handle the watcher thread (a non-tokio
//!   debouncer thread) uses to enqueue changes without blocking.
//! - [`SubscriptionRegistry`] — the session→peer+URIs map the async fan-out task drains into.
//!
//! Sessions are keyed by a `u64` assigned per `MnemeServer` (see `next_session_id`), because
//! `Peer` has no stable identity for matching on `unsubscribe`. Dead sessions (a send error after
//! the client went away) are evicted lazily on the next notify — rmcp exposes no session-close hook.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use rmcp::model::ResourceUpdatedNotificationParam;
use rmcp::service::Peer;
use rmcp::RoleServer;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

/// A change the watcher detected, to be fanned out to subscribed MCP sessions.
pub enum WatchEvent {
    /// A document changed — notify sessions subscribed to this `mneme://{root}/{path}` URI.
    Updated(String),
    /// The document/root set changed (add/remove/rename) — broadcast `resources/list_changed`.
    ListChanged,
}

/// Sync handle the watcher thread uses to hand changes to the async fan-out task. Sends are
/// non-blocking and best-effort: if the receiver is gone (server shutting down) the change is
/// silently dropped.
#[derive(Clone)]
pub struct WatchNotifier(UnboundedSender<WatchEvent>);

impl WatchNotifier {
    /// Create a notifier + its receiver. The server passes the notifier into the watcher and hands
    /// the receiver to the fan-out task ([`crate::mcp::ServerState::spawn_fanout`]).
    pub fn new() -> (Self, UnboundedReceiver<WatchEvent>) {
        let (tx, rx) = unbounded_channel();
        (Self(tx), rx)
    }

    /// Enqueue a `resources/updated` for the given resource URI.
    pub fn updated(&self, uri: String) {
        let _ = self.0.send(WatchEvent::Updated(uri));
    }

    /// Enqueue a `resources/list_changed` broadcast.
    pub fn list_changed(&self) {
        let _ = self.0.send(WatchEvent::ListChanged);
    }
}

/// Per-session subscription state: the peer to push notifications to + the URIs it subscribed to.
struct SessionSubs {
    peer: Peer<RoleServer>,
    uris: HashSet<String>,
}

/// Process-wide registry of resource subscriptions, keyed by session id (assigned per
/// `MnemeServer`). Shared via `Arc` so the fan-out task can notify subscribers.
#[derive(Default)]
pub struct SubscriptionRegistry {
    inner: Mutex<HashMap<u64, SessionSubs>>,
}

impl SubscriptionRegistry {
    /// Record/refresh a session's peer without adding a URI. Called from `list_resources` /
    /// `read_resource` so a list-only client (e.g. a tree view) is registered for
    /// `list_changed` broadcasts even if it never subscribes to a specific document.
    pub fn touch(&self, session: u64, peer: &Peer<RoleServer>) {
        let mut map = self.inner.lock().unwrap();
        map.entry(session)
            .and_modify(|s| s.peer = peer.clone())
            .or_insert_with(|| SessionSubs { peer: peer.clone(), uris: HashSet::new() });
    }

    /// Subscribe `session` to `uri` (refreshing its peer).
    pub fn subscribe(&self, session: u64, peer: &Peer<RoleServer>, uri: String) {
        let mut map = self.inner.lock().unwrap();
        let entry = map
            .entry(session)
            .or_insert_with(|| SessionSubs { peer: peer.clone(), uris: HashSet::new() });
        entry.peer = peer.clone();
        entry.uris.insert(uri);
    }

    /// Remove `session`'s subscription to `uri` (the session itself stays registered so it can
    /// still receive `list_changed` broadcasts).
    pub fn unsubscribe(&self, session: u64, uri: &str) {
        let mut map = self.inner.lock().unwrap();
        if let Some(s) = map.get_mut(&session) {
            s.uris.remove(uri);
        }
    }

    /// Drop a session entirely (best-effort cleanup).
    pub fn drop_session(&self, session: u64) {
        self.inner.lock().unwrap().remove(&session);
    }

    /// Notify every session subscribed to `uri`. The lock is released before awaiting any send;
    /// sessions whose send fails (client gone) are evicted.
    pub async fn notify_updated(&self, uri: &str) {
        let targets = self.targets(|s| s.uris.contains(uri));
        if targets.is_empty() {
            return;
        }
        let mut dead = Vec::new();
        for (id, peer) in targets {
            if peer
                .notify_resource_updated(ResourceUpdatedNotificationParam::new(uri))
                .await
                .is_err()
            {
                dead.push(id);
            }
        }
        self.evict(dead);
    }

    /// Broadcast `resources/list_changed` to every known session peer. Dead peers are evicted.
    pub async fn notify_list_changed(&self) {
        let targets = self.targets(|_| true);
        let mut dead = Vec::new();
        for (id, peer) in targets {
            if peer.notify_resource_list_changed().await.is_err() {
                dead.push(id);
            }
        }
        self.evict(dead);
    }

    /// Snapshot (session id, peer) for sessions matching `pred`, holding the lock only briefly.
    fn targets(&self, pred: impl Fn(&SessionSubs) -> bool) -> Vec<(u64, Peer<RoleServer>)> {
        let map = self.inner.lock().unwrap();
        map.iter()
            .filter(|(_, s)| pred(s))
            .map(|(id, s)| (*id, s.peer.clone()))
            .collect()
    }

    fn evict(&self, dead: Vec<u64>) {
        if dead.is_empty() {
            return;
        }
        let mut map = self.inner.lock().unwrap();
        for id in dead {
            map.remove(&id);
        }
    }
}
