//! File watcher — an always-on, debounced `notify` watcher per root.
//!
//! On each debounced batch of filesystem events (after a coarse ignore filter), it locks the
//! root's [`IndexDb`] and runs [`reconcile_root`] — the authoritative sync. The watcher only
//! needs to (a) avoid self-trigger and (b) wake a reconcile; it does **not** decide
//! per-file indexability (the reconcile's `walk_root` is authoritative — US-654 Concern 3).
//!
//! **Self-trigger guard (Concern 2):** the per-root index lives at `<root>/.mneme/…` and, in
//! WAL mode, SQLite continuously writes `*.db-wal`/`*.db-shm` *inside the watched tree*.
//! [`is_watch_ignored`] drops any event whose root-relative path contains a [`DEFAULT_IGNORES`]
//! component (`.mneme` first), so the index's own writes can't drive an infinite reconcile loop.

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify_debouncer_full::notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult};

use crate::config::RootConfig;
use crate::embed::LazyEmbedder;
use crate::error::Result;
use crate::index::IndexDb;
use crate::indexer::reconcile_root;
use crate::store::DEFAULT_IGNORES;

/// Debounce window — coalesces a burst (e.g. a `git pull`) into a single reconcile (US-651).
const DEBOUNCE: Duration = Duration::from_millis(500);

/// An always-on recursive watcher over one root. Dropping it stops watching.
pub struct RootWatcher {
    // The debouncer owns the underlying watcher + its worker thread; held only to keep it alive.
    _debouncer: notify_debouncer_full::Debouncer<
        notify_debouncer_full::notify::RecommendedWatcher,
        notify_debouncer_full::RecommendedCache,
    >,
}

impl RootWatcher {
    /// Watch `root.folder` recursively; on each debounced batch, reconcile the root. The shared
    /// `embedder` is resolved per reconcile so direct-disk edits also (re)build `chunks_vec`.
    pub fn start(root: RootConfig, db: Arc<Mutex<IndexDb>>, embedder: Arc<LazyEmbedder>) -> Result<Self> {
        let watch_path = root.folder.clone();
        let folder = root.folder.clone();
        let handler = move |result: DebounceEventResult| match result {
            Ok(events) => {
                let relevant = events.iter().any(|ev| {
                    ev.paths
                        .iter()
                        .any(|p| !is_watch_ignored(&folder, p))
                });
                if relevant {
                    reconcile_locked(&db, &root, &embedder);
                }
            }
            Err(errors) => {
                // A watch error (incl. buffer overflow / rescan) is recoverable — reconcile
                // to resync rather than trusting incremental events, and keep watching.
                for e in &errors {
                    tracing::warn!(root = %root.name, "watch error: {e}");
                }
                reconcile_locked(&db, &root, &embedder);
            }
        };

        let mut debouncer = new_debouncer(DEBOUNCE, None, handler)?;
        debouncer.watch(&watch_path, RecursiveMode::Recursive)?;

        Ok(Self {
            _debouncer: debouncer,
        })
    }
}

/// Lock the root's index and run a reconcile, logging (never panicking) on failure.
fn reconcile_locked(db: &Arc<Mutex<IndexDb>>, root: &RootConfig, embedder: &LazyEmbedder) {
    let guard = match db.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(), // a prior panic shouldn't wedge the watcher
    };
    let emb = embedder.get();
    if let Err(e) = reconcile_root(&guard, root, emb.as_deref()) {
        tracing::warn!(root = %root.name, "watcher reconcile failed: {e}");
    }
}

/// Coarse filter: is `path` inside an ignored directory of `root_folder`? Drops the index's
/// own `.mneme/` writes (and `.git`/`node_modules`/build dirs) so they never wake a reconcile.
/// Paths outside the root are treated as ignored.
pub fn is_watch_ignored(root_folder: &Path, path: &Path) -> bool {
    let rel = match path.strip_prefix(root_folder) {
        Ok(r) => r,
        Err(_) => return true,
    };
    rel.components().any(|c| {
        let name = c.as_os_str().to_string_lossy();
        DEFAULT_IGNORES.contains(&name.as_ref())
    })
}
