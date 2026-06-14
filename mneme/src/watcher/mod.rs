//! File watcher — an always-on, debounced `notify` watcher per root.
//!
//! On each debounced batch of filesystem events (after a coarse ignore filter), it locks the
//! root's [`IndexDb`] and runs [`reconcile_root`] — the authoritative sync. The watcher only
//! needs to (a) avoid self-trigger, (b) wake a reconcile, and (c) hand changed
//! `mneme://{root}/{path}` URIs to the MCP subscription fan-out (US-670, via an optional
//! [`WatchNotifier`]); it does **not** decide per-file indexability (the reconcile's `walk_root`
//! is authoritative — US-654 Concern 3).
//!
//! **Self-trigger guard (Concern 2):** the per-root index lives at `<root>/.mneme/…` and, in
//! WAL mode, SQLite continuously writes `*.db-wal`/`*.db-shm` *inside the watched tree*.
//! [`is_watch_ignored`] drops any event whose root-relative path contains a [`DEFAULT_IGNORES`]
//! component (`.mneme` first), so the index's own writes can't drive an infinite reconcile loop.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use notify_debouncer_full::notify::event::ModifyKind;
use notify_debouncer_full::notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use tokio_util::sync::CancellationToken;

use crate::config::RootConfig;
use crate::embed::EmbedHandle;
use crate::error::Result;
use crate::index::RootIndex;
use crate::indexer::JobManager;
use crate::mcp::subscriptions::WatchNotifier;
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
    /// Watch `root.folder` recursively; on each debounced batch, trigger a **coalesced** reconcile
    /// through the shared [`JobManager`] (so a burst collapses to one pass and never runs parallel
    /// to an in-flight reindex). The embed worker (re)builds `chunks_vec` off the writer lock, so
    /// a direct-disk edit is indexed without stalling concurrent searches. `cancel` lets shutdown
    /// stop in-flight reconciles.
    pub fn start(
        root: RootConfig,
        index: Arc<RootIndex>,
        embed: EmbedHandle,
        jobs: Arc<JobManager>,
        cancel: CancellationToken,
        notifier: Option<WatchNotifier>,
    ) -> Result<Self> {
        let watch_path = root.folder.clone();
        let folder = root.folder.clone();
        let handler = move |result: DebounceEventResult| {
            let trigger = || jobs.reconcile_coalesced(&index, &root, &embed, cancel.clone());
            match result {
                Ok(events) => {
                    // Walk the batch once: collect the (deduped) changed resource URIs to notify
                    // subscribers (US-670) and decide whether the document set changed structurally.
                    let mut relevant = false;
                    let mut structural = false;
                    for ev in &events {
                        for p in &ev.paths {
                            if is_watch_ignored(&folder, p) {
                                continue;
                            }
                            relevant = true;
                            if let Some(n) = &notifier {
                                if let Ok(rel) = p.strip_prefix(&folder) {
                                    let uri = format!(
                                        "mneme://{}/{}",
                                        root.name,
                                        rel.to_string_lossy().replace('\\', "/")
                                    );
                                    n.updated(uri);
                                }
                            }
                        }
                        if matches!(
                            ev.kind,
                            EventKind::Create(_)
                                | EventKind::Remove(_)
                                | EventKind::Modify(ModifyKind::Name(_))
                        ) {
                            structural = true;
                        }
                    }
                    if relevant {
                        if structural {
                            if let Some(n) = &notifier {
                                n.list_changed();
                            }
                        }
                        trigger();
                    }
                }
                Err(errors) => {
                    // A watch error (incl. buffer overflow / rescan) is recoverable — reconcile
                    // to resync rather than trusting incremental events, and keep watching. The
                    // document set may have shifted, so nudge subscribers to re-list (US-670).
                    for e in &errors {
                        tracing::warn!(root = %root.name, "watch error: {e}");
                    }
                    if let Some(n) = &notifier {
                        n.list_changed();
                    }
                    trigger();
                }
            }
        };

        let mut debouncer = new_debouncer(DEBOUNCE, None, handler)?;
        debouncer.watch(&watch_path, RecursiveMode::Recursive)?;

        Ok(Self {
            _debouncer: debouncer,
        })
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
