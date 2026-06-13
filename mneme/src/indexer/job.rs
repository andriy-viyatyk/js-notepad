//! Reindex job manager (US-659) — single-flight per root, progress snapshots, cancellation.
//!
//! Reconciling a root is serialized per root (two passes over the same DB would double-process).
//! Two entry points sit on that serialization:
//! - [`JobManager::reconcile_blocking`] — explicit `wiki_reindex` / CLI / `add_root`: waits for
//!   any in-flight pass, then runs a fresh one and returns its stats. The caller's
//!   `CancellationToken` (e.g. the MCP request's `ct`) cancels the pass.
//! - [`JobManager::reconcile_coalesced`] — watcher / deferred startup: if a pass is already
//!   running, flag a **rerun** and return, so a burst of filesystem events collapses to one extra
//!   pass (the mtime+size fast-path makes it cheap) instead of piling up.
//!
//! [`JobManager::progress_for`] exposes the latest per-root snapshot for `wiki_status`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, TryLockError};

use tokio_util::sync::CancellationToken;

use crate::config::RootConfig;
use crate::embed::EmbedHandle;
use crate::error::Result;
use crate::index::RootIndex;

use super::{reconcile_job, ReconcileStats};

/// Coarse reconcile phase, surfaced in `wiki_status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Scanning,
    Embedding,
    Done,
    Cancelled,
    Error,
}

impl Default for Phase {
    fn default() -> Self {
        Phase::Idle
    }
}

impl Phase {
    /// Lowercase label for the `wiki_status` DTO.
    pub fn as_str(self) -> &'static str {
        match self {
            Phase::Idle => "idle",
            Phase::Scanning => "scanning",
            Phase::Embedding => "embedding",
            Phase::Done => "done",
            Phase::Cancelled => "cancelled",
            Phase::Error => "error",
        }
    }
}

/// A reconcile progress snapshot. During `Scanning`, `processed`/`total` count files walked;
/// during `Embedding`, documents embedded.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReindexProgress {
    pub phase: Phase,
    pub processed: usize,
    pub total: usize,
}

/// Per-root job state: a run-lock serializing passes, a rerun flag for coalescing, the active
/// cancel token, and the latest progress snapshot.
struct RootJob {
    run_lock: Mutex<()>,
    rerun: AtomicBool,
    cancel: Mutex<CancellationToken>,
    progress: Mutex<ReindexProgress>,
}

impl Default for RootJob {
    fn default() -> Self {
        Self {
            run_lock: Mutex::new(()),
            rerun: AtomicBool::new(false),
            cancel: Mutex::new(CancellationToken::new()),
            progress: Mutex::new(ReindexProgress::default()),
        }
    }
}

/// Tracks reconcile jobs across roots so triggers coalesce and progress is observable.
#[derive(Default)]
pub struct JobManager {
    jobs: Mutex<HashMap<String, Arc<RootJob>>>,
}

impl JobManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    fn job(&self, root: &str) -> Arc<RootJob> {
        Arc::clone(self.jobs.lock().unwrap().entry(root.to_string()).or_default())
    }

    /// Run a fresh reconcile pass to completion and return its stats. Serialized per root: waits
    /// for any in-flight pass first. `external_cancel` cancels this pass (a child token, so it
    /// composes with the caller's token without affecting it).
    pub fn reconcile_blocking(
        &self,
        root: &Arc<RootIndex>,
        cfg: &RootConfig,
        emb: &EmbedHandle,
        external_cancel: CancellationToken,
        mut on_progress: impl FnMut(&ReindexProgress),
    ) -> Result<ReconcileStats> {
        let job = self.job(&cfg.name);
        let _run = job.run_lock.lock().unwrap_or_else(|p| p.into_inner());
        let token = external_cancel.child_token();
        *job.cancel.lock().unwrap() = token.clone();
        job.rerun.store(false, Ordering::SeqCst);
        reconcile_job(root, cfg, emb, &token, &job.progress, &mut on_progress)
    }

    /// Reconcile if no pass is running for this root; otherwise flag a rerun and return. Loops to
    /// honour a rerun requested mid-pass (coalesces a burst of watcher events). Logs on error.
    pub fn reconcile_coalesced(
        &self,
        root: &Arc<RootIndex>,
        cfg: &RootConfig,
        emb: &EmbedHandle,
        external_cancel: CancellationToken,
    ) {
        let job = self.job(&cfg.name);
        let _run = match job.run_lock.try_lock() {
            Ok(g) => g,
            Err(TryLockError::Poisoned(p)) => p.into_inner(),
            Err(TryLockError::WouldBlock) => {
                job.rerun.store(true, Ordering::SeqCst);
                return;
            }
        };
        loop {
            let token = external_cancel.child_token();
            *job.cancel.lock().unwrap() = token.clone();
            job.rerun.store(false, Ordering::SeqCst);
            let mut noop = |_: &ReindexProgress| {};
            if let Err(e) = reconcile_job(root, cfg, emb, &token, &job.progress, &mut noop) {
                tracing::warn!(root = %cfg.name, "reconcile failed: {e}");
            }
            if token.is_cancelled() || !job.rerun.load(Ordering::SeqCst) {
                break;
            }
        }
    }

    /// The latest progress snapshot for a root (`wiki_status`), or `None` if it never reconciled.
    pub fn progress_for(&self, root: &str) -> Option<ReindexProgress> {
        let jobs = self.jobs.lock().unwrap();
        jobs.get(root).map(|j| j.progress.lock().unwrap().clone())
    }
}
