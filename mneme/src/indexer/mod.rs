//! Indexer — keeps the per-root SQLite index consistent with the files on disk.
//!
//! Two reconcile paths share the per-file decision logic ([`index_one`]):
//! - **Synchronous** ([`reconcile_root`], `&IndexDb` + optional inline embedder) — the simple
//!   authoritative sync used by tests and one-shot CLI: walk the root, skip unchanged files via an
//!   **mtime+size fast-path**, hash only the candidates, index new/changed files (embedding inline
//!   when a model is given), drop deleted ones.
//! - **Serving** ([`reconcile_job`], `&RootIndex` + an [`EmbedHandle`], US-659) — two-phase so a
//!   bulk reindex stays responsive: phase 1 upserts document rows under brief per-file writer
//!   locks; phase 2 embeds off the writer lock on the shared worker (bulk priority, backpressure)
//!   and writes vectors in brief locked batches. Cancellable + progress-reporting, driven by the
//!   [`JobManager`] (single-flight per root). The [`crate::watcher`] and the deferred startup
//!   reconcile both go through it. [`single_doc_index`] is the serving `wiki_write`/`wiki_edit`
//!   primitive (interactive-priority embed).

pub mod job;

pub use job::{JobManager, Phase, ReindexProgress};

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio_util::sync::CancellationToken;

use crate::config::{ModelConfig, RootConfig};
use crate::embed::{EmbedHandle, EmbedWorker, Embedder, LazyEmbedder, Priority};
use crate::error::Result;
use crate::index::{content_hash, IndexDb, RootIndex};
use crate::markdown::parse_document;
use crate::store::walk_root;
use crate::watcher::RootWatcher;

/// Deferred startup reconcile delay — Mneme serves immediately, the index self-heals shortly
/// after (US-651). A const for now; config exposure is deferred to US-659/US-664.
pub const RECONCILE_DELAY: Duration = Duration::from_secs(5);

/// What happened to one file during [`index_one`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexOutcome {
    /// New file, or content changed → `upsert_document` (+ embed when a model is configured).
    Indexed,
    /// Content hash unchanged, `mtime`/`size` moved → `update_doc_stat` only.
    Refreshed,
    /// `mtime`+`size` matched the stored row → no read, no hash.
    Skipped,
    /// Content unchanged, but the document's `chunks_vec` rows were (re)built — the embedding
    /// model became available after the document was first indexed (US-658 backfill).
    VectorBackfilled,
}

/// Per-root reconcile tally.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReconcileStats {
    pub scanned: usize,
    pub indexed: usize,
    pub refreshed: usize,
    pub skipped: usize,
    /// Unchanged documents whose vectors were backfilled this pass (US-658).
    pub vectorized: usize,
    pub deleted: usize,
    pub errors: usize,
}

/// Reconcile one file against the index. `rel` is the forward-slash path within the root;
/// `abs` is the absolute path on disk. When `embedder` is `Some`, newly-indexed documents are
/// embedded into `chunks_vec`, and unchanged documents missing vectors are backfilled (US-658);
/// `None` keeps `chunks_vec` empty (FTS-only — the model is not provisioned).
pub fn index_one(db: &IndexDb, rel: &str, abs: &Path, embedder: Option<&dyn Embedder>) -> Result<IndexOutcome> {
    let md = std::fs::metadata(abs)?;
    let size = md.len() as i64;
    let mtime_st = md.modified()?;
    let mtime = system_time_to_secs(mtime_st);

    if let Some(state) = db.doc_state(rel)? {
        if state.mtime == mtime && state.size == size {
            // fast-path: no read, no hash. Still backfill vectors if the model arrived since.
            return maybe_backfill(db, rel, embedder, IndexOutcome::Skipped);
        }
        let bytes = std::fs::read(abs)?;
        let hash = content_hash(&bytes);
        if hash == state.content_hash {
            db.update_doc_stat(rel, mtime, size)?; // touched but content unchanged
            return maybe_backfill(db, rel, embedder, IndexOutcome::Refreshed);
        }
        upsert(db, rel, &bytes, &hash, &md, mtime, size)?;
    } else {
        let bytes = std::fs::read(abs)?;
        let hash = content_hash(&bytes);
        upsert(db, rel, &bytes, &hash, &md, mtime, size)?;
    }
    if let Some(e) = embedder {
        db.embed_document_chunks(rel, e)?;
    }
    Ok(IndexOutcome::Indexed)
}

/// Backfill `chunks_vec` for an unchanged document when an embedder is configured but the
/// document has no vectors yet (the model arrived after it was first indexed). Returns
/// [`IndexOutcome::VectorBackfilled`] when it embeds, else the passed-through `base` outcome.
fn maybe_backfill(
    db: &IndexDb,
    rel: &str,
    embedder: Option<&dyn Embedder>,
    base: IndexOutcome,
) -> Result<IndexOutcome> {
    if let Some(e) = embedder {
        if !db.doc_has_vectors(rel)? {
            db.embed_document_chunks(rel, e)?;
            return Ok(IndexOutcome::VectorBackfilled);
        }
    }
    Ok(base)
}

/// Like [`index_one`] but **without** the mtime+size fast-path — always reads + content-hashes.
/// US-655's synchronous `wiki_write`/`wiki_edit` use this: the caller just changed the content,
/// so the stat-based skip is unsafe (a same-length edit within the filesystem's mtime resolution
/// would otherwise be wrongly skipped). Content-hash dedup still avoids a redundant upsert when
/// the bytes are identical.
pub fn reindex_file(db: &IndexDb, rel: &str, abs: &Path, embedder: Option<&dyn Embedder>) -> Result<IndexOutcome> {
    let md = std::fs::metadata(abs)?;
    let size = md.len() as i64;
    let mtime = system_time_to_secs(md.modified()?);
    let bytes = std::fs::read(abs)?;
    let hash = content_hash(&bytes);
    if let Some(state) = db.doc_state(rel)? {
        if hash == state.content_hash {
            db.update_doc_stat(rel, mtime, size)?;
            return maybe_backfill(db, rel, embedder, IndexOutcome::Refreshed);
        }
    }
    upsert(db, rel, &bytes, &hash, &md, mtime, size)?;
    if let Some(e) = embedder {
        db.embed_document_chunks(rel, e)?;
    }
    Ok(IndexOutcome::Indexed)
}

fn upsert(
    db: &IndexDb,
    rel: &str,
    bytes: &[u8],
    hash: &str,
    md: &std::fs::Metadata,
    mtime: i64,
    size: i64,
) -> Result<()> {
    // `title` fallback expects the file stem (no extension); the chunker / frontmatter
    // resolver derive the rest from the body.
    let stem = Path::new(rel)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| rel.to_string());
    let content = String::from_utf8_lossy(bytes);
    let birthtime = md.created().ok();
    let parsed = parse_document(&stem, &content, birthtime, md.modified()?);
    db.upsert_document(rel, &parsed, hash, mtime, size)
}

/// Walk the root and bring its index current: index new/changed files, refresh touched ones,
/// drop deleted ones. Per-file errors are logged + counted, never fatal.
pub fn reconcile_root(db: &IndexDb, root: &RootConfig, embedder: Option<&dyn Embedder>) -> Result<ReconcileStats> {
    let mut stats = ReconcileStats::default();
    let walked = walk_root(root)?; // authoritative include/ignore set
    let mut present: HashSet<String> = HashSet::with_capacity(walked.len());

    for wf in &walked {
        stats.scanned += 1;
        present.insert(wf.rel.clone());
        match index_one(db, &wf.rel, &wf.abs, embedder) {
            Ok(IndexOutcome::Indexed) => stats.indexed += 1,
            Ok(IndexOutcome::Refreshed) => stats.refreshed += 1,
            Ok(IndexOutcome::Skipped) => stats.skipped += 1,
            Ok(IndexOutcome::VectorBackfilled) => stats.vectorized += 1,
            Err(e) => {
                stats.errors += 1;
                tracing::warn!(file = %wf.rel, "index failed: {e}");
            }
        }
    }

    for rel in db.all_doc_paths()? {
        if !present.contains(&rel) {
            match db.delete_document(&rel) {
                Ok(()) => stats.deleted += 1,
                Err(e) => {
                    stats.errors += 1;
                    tracing::warn!(file = %rel, "delete failed: {e}");
                }
            }
        }
    }

    tracing::info!(root = %root.name, ?stats, "reconcile complete");
    Ok(stats)
}

/// What a phase-2 work item needs embedding for — drives the `vectorized` stat.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkKind {
    /// New/changed document (counted in `indexed` during phase 1).
    Fresh,
    /// Unchanged document missing vectors — the model arrived after first index (US-658 backfill).
    Backfill,
}

/// The serving-path reconcile (US-659): keeps Mneme responsive during a bulk (re)index.
///
/// Two phases, so embedding never blocks the writer lock or request handling:
/// 1. **Scan / upsert** — walk the root; for each file take a *brief* writer lock and index the
///    document rows (no inline embedding), so an interactive edit can slip between files. Collect
///    a work-list of documents whose `chunks_vec` must be (re)built.
/// 2. **Embed / write** — for each work item: read its chunks (pooled), submit them to the embed
///    worker at **bulk** priority (off the writer lock, with queue backpressure), then take a
///    brief writer lock to write the vectors. The writer lock is never held across an embed.
///
/// `cancel` is polled between every file and every document; on cancel it commits nothing further
/// and returns the partial stats (already-written rows persist — the next reconcile finishes the
/// remainder, idempotently). `progress` is the shared snapshot (read by `wiki_status`);
/// `on_progress` is the live sink (MCP progress / CLI line).
pub(crate) fn reconcile_job(
    root: &RootIndex,
    cfg: &RootConfig,
    emb: &EmbedHandle,
    cancel: &CancellationToken,
    progress: &Mutex<ReindexProgress>,
    on_progress: &mut dyn FnMut(&ReindexProgress),
) -> Result<ReconcileStats> {
    let mut stats = ReconcileStats::default();
    let walked = walk_root(cfg)?;
    let total = walked.len();
    set_progress(progress, on_progress, Phase::Scanning, 0, total);

    // `Some(false)` = model definitively absent → no backfill work, no phase 2. `None` (not yet
    // resolved) or `Some(true)` → attempt embedding (the worker resolves on the first job).
    let model_absent = emb.available() == Some(false);
    let mut work: Vec<(String, WorkKind)> = Vec::new();
    let mut present: HashSet<String> = HashSet::with_capacity(walked.len());

    for (i, wf) in walked.iter().enumerate() {
        if cancel.is_cancelled() {
            return Ok(finish(progress, on_progress, Phase::Cancelled, stats, total));
        }
        stats.scanned += 1;
        present.insert(wf.rel.clone());
        // Phase 1 upserts rows only (embedder = None) under a brief, per-file writer lock.
        let outcome = index_one(&root.writer(), &wf.rel, &wf.abs, None);
        match outcome {
            Ok(IndexOutcome::Indexed) => {
                stats.indexed += 1;
                work.push((wf.rel.clone(), WorkKind::Fresh));
            }
            Ok(IndexOutcome::Refreshed) | Ok(IndexOutcome::Skipped) => {
                if matches!(outcome, Ok(IndexOutcome::Refreshed)) {
                    stats.refreshed += 1;
                } else {
                    stats.skipped += 1;
                }
                if !model_absent && !root.read(|db| db.doc_has_vectors(&wf.rel))? {
                    work.push((wf.rel.clone(), WorkKind::Backfill));
                }
            }
            Ok(IndexOutcome::VectorBackfilled) => unreachable!("phase 1 passes no embedder"),
            Err(e) => {
                stats.errors += 1;
                tracing::warn!(file = %wf.rel, "index failed: {e}");
            }
        }
        set_progress(progress, on_progress, Phase::Scanning, i + 1, total);
    }

    // Drop documents whose files are gone (brief per-row writer locks). Collect first so the
    // writer guard is released before the per-row deletes (a held guard + re-lock would deadlock).
    let existing = root.writer().all_doc_paths()?;
    for rel in existing {
        if cancel.is_cancelled() {
            return Ok(finish(progress, on_progress, Phase::Cancelled, stats, total));
        }
        if !present.contains(&rel) {
            match root.writer().delete_document(&rel) {
                Ok(()) => stats.deleted += 1,
                Err(e) => {
                    stats.errors += 1;
                    tracing::warn!(file = %rel, "delete failed: {e}");
                }
            }
        }
    }

    // Phase 2 — embed off the writer lock.
    if !work.is_empty() && !model_absent {
        let to_embed = work.len();
        set_progress(progress, on_progress, Phase::Embedding, 0, to_embed);
        for (i, (rel, kind)) in work.iter().enumerate() {
            if cancel.is_cancelled() {
                return Ok(finish(progress, on_progress, Phase::Cancelled, stats, total));
            }
            let chunks = root.read(|db| db.chunk_texts_for(rel))?;
            if chunks.is_empty() {
                continue;
            }
            let refs: Vec<&str> = chunks.iter().map(|(_, t)| t.as_str()).collect();
            // Blocks on the worker (bulk lane) — NO writer lock held here (backpressure-safe).
            match emb.embed_passages(&refs, Priority::Bulk)? {
                None => break, // model unavailable after all → FTS-only; stop embedding
                Some(vecs) => {
                    let items: Vec<(i64, Vec<f32>)> =
                        chunks.iter().map(|(id, _)| *id).zip(vecs).collect();
                    root.writer().write_chunk_vectors(&items)?;
                    if *kind == WorkKind::Backfill {
                        stats.vectorized += 1;
                    }
                }
            }
            set_progress(progress, on_progress, Phase::Embedding, i + 1, to_embed);
        }
    }

    tracing::info!(root = %cfg.name, ?stats, "reconcile complete");
    Ok(finish(progress, on_progress, Phase::Done, stats, total))
}

/// Index a single just-written/edited document on the serving path: brief writer-locked upsert
/// (always — no fast-path, the caller just changed the bytes), then embed the one document at
/// **interactive** priority (off the writer lock) and write its vectors. Used by `wiki_write` /
/// `wiki_edit`.
pub(crate) fn single_doc_index(root: &RootIndex, rel: &str, abs: &Path, emb: &EmbedHandle) -> Result<IndexOutcome> {
    let outcome = reindex_file(&root.writer(), rel, abs, None)?;
    // Embed unless the model is definitively absent (resolve-on-first-job otherwise).
    if emb.available() != Some(false) {
        let chunks = root.read(|db| db.chunk_texts_for(rel))?;
        if !chunks.is_empty() {
            let refs: Vec<&str> = chunks.iter().map(|(_, t)| t.as_str()).collect();
            if let Some(vecs) = emb.embed_passages(&refs, Priority::Interactive)? {
                let items: Vec<(i64, Vec<f32>)> = chunks.iter().map(|(id, _)| *id).zip(vecs).collect();
                root.writer().write_chunk_vectors(&items)?;
            }
        }
    }
    Ok(outcome)
}

/// Write a progress snapshot and notify the live sink.
fn set_progress(
    progress: &Mutex<ReindexProgress>,
    on_progress: &mut dyn FnMut(&ReindexProgress),
    phase: Phase,
    processed: usize,
    total: usize,
) {
    let snap = ReindexProgress { phase, processed, total };
    *progress.lock().unwrap() = snap.clone();
    on_progress(&snap);
}

/// Emit a terminal progress snapshot and return the stats unchanged (cancel/done convenience).
fn finish(
    progress: &Mutex<ReindexProgress>,
    on_progress: &mut dyn FnMut(&ReindexProgress),
    phase: Phase,
    stats: ReconcileStats,
    total: usize,
) -> ReconcileStats {
    set_progress(progress, on_progress, phase, stats.scanned, total);
    stats
}

/// Convert a `SystemTime` to epoch seconds (`documents.mtime` storage + fast-path compare).
fn system_time_to_secs(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Owns one [`RootIndex`] per root (writer + read-only pool), the always-on watchers, the single
/// embedding worker, and the reindex [`JobManager`]. Together these keep Mneme responsive during
/// a bulk reindex (US-659): embedding runs off the writer lock at bulk priority, reads use the
/// pool, and reconciles are cancellable + single-flight per root.
pub struct IndexManager {
    roots: Vec<RootConfig>,
    dbs: HashMap<String, Arc<RootIndex>>,
    /// Keyed by root name so a single root's watcher can be stopped on `wiki_remove_root`.
    watchers: HashMap<String, RootWatcher>,
    /// Submit handle for the one embedding worker (clonable; shared with the watcher + search).
    embed: EmbedHandle,
    /// Reindex job manager — single-flight per root + progress snapshots + cancellation.
    jobs: Arc<JobManager>,
    /// Root cancel token for the watcher + deferred reconciles; cancelled on shutdown.
    cancel: CancellationToken,
    /// Held so the worker thread isn't dropped while handles are live.
    _worker: EmbedWorker,
}

impl IndexManager {
    /// Open (or create) the per-root index for every root and start the embedding worker. Does
    /// not walk yet. `embedder` is the shared lazy embedder the worker resolves on its first job.
    pub fn open(roots: &[RootConfig], model: &ModelConfig, embedder: Arc<LazyEmbedder>) -> Result<Self> {
        let (worker, embed) = EmbedWorker::start(embedder);
        let mut dbs = HashMap::with_capacity(roots.len());
        for r in roots {
            let ri = RootIndex::open_or_create(&r.name, &r.folder, model)?;
            dbs.insert(r.name.clone(), Arc::new(ri));
        }
        Ok(Self {
            roots: roots.to_vec(),
            dbs,
            watchers: HashMap::new(),
            embed,
            jobs: JobManager::new(),
            cancel: CancellationToken::new(),
            _worker: worker,
        })
    }

    /// The per-root index handle (search via the pool, single-doc index via the writer, status).
    pub fn handle(&self, root: &str) -> Option<Arc<RootIndex>> {
        self.dbs.get(root).cloned()
    }

    /// A clone of the embed submit handle — the search path (query embeds) + serving single-doc
    /// index path use it directly, without locking the manager.
    pub fn embed_handle(&self) -> EmbedHandle {
        self.embed.clone()
    }

    /// A clone of the reindex job manager (drives `wiki_reindex` + exposes progress).
    pub fn jobs(&self) -> Arc<JobManager> {
        Arc::clone(&self.jobs)
    }

    /// Foreground reconcile of one root, returning stats (no live progress sink).
    pub fn reconcile_root(&self, root: &str) -> Result<ReconcileStats> {
        self.reconcile_root_cb(root, |_| {})
    }

    /// Foreground reconcile of one root with a live progress callback (CLI `reindex`).
    pub fn reconcile_root_cb(
        &self,
        root: &str,
        on_progress: impl FnMut(&ReindexProgress),
    ) -> Result<ReconcileStats> {
        let cfg = self
            .roots
            .iter()
            .find(|r| r.name == root)
            .ok_or_else(|| crate::error::MnemeError::UnknownRoot(root.to_string()))?
            .clone();
        let ri = self
            .dbs
            .get(root)
            .ok_or_else(|| crate::error::MnemeError::UnknownRoot(root.to_string()))?;
        self.jobs
            .reconcile_blocking(ri, &cfg, &self.embed, CancellationToken::new(), on_progress)
    }

    /// Foreground reconcile of every root (CLI `reindex`, tests).
    pub fn reconcile_all(&self) -> Vec<(String, ReconcileStats)> {
        let mut out = Vec::with_capacity(self.roots.len());
        for r in &self.roots {
            match self.reconcile_root(&r.name) {
                Ok(stats) => out.push((r.name.clone(), stats)),
                Err(e) => {
                    tracing::warn!(root = %r.name, "reconcile failed: {e}");
                    out.push((r.name.clone(), ReconcileStats::default()));
                }
            }
        }
        out
    }

    /// Spawn an always-on debounced watcher per root (coalesced reconcile on change).
    pub fn start_watchers(&mut self) -> Result<()> {
        for r in &self.roots {
            if let Some(ri) = self.dbs.get(&r.name) {
                let watcher = RootWatcher::start(
                    r.clone(),
                    Arc::clone(ri),
                    self.embed.clone(),
                    Arc::clone(&self.jobs),
                    self.cancel.clone(),
                )?;
                self.watchers.insert(r.name.clone(), watcher);
            }
        }
        Ok(())
    }

    /// Register a new root at runtime (`wiki_add_root`): open its index, start its watcher, and
    /// track its config. The caller persists the config and reconciles. Returns the new handle.
    pub fn add_root(&mut self, cfg: RootConfig, model: &ModelConfig) -> Result<Arc<RootIndex>> {
        let ri = Arc::new(RootIndex::open_or_create(&cfg.name, &cfg.folder, model)?);
        let watcher = RootWatcher::start(
            cfg.clone(),
            Arc::clone(&ri),
            self.embed.clone(),
            Arc::clone(&self.jobs),
            self.cancel.clone(),
        )?;
        self.watchers.insert(cfg.name.clone(), watcher);
        self.dbs.insert(cfg.name.clone(), Arc::clone(&ri));
        self.roots.push(cfg);
        Ok(ri)
    }

    /// Stop + drop a root's watcher and its index handle (`wiki_remove_root`). The on-disk
    /// `.mneme` index is left in place (rebuildable; deletion is `wiki_index_delete`'s job).
    pub fn remove_root(&mut self, name: &str) -> Result<()> {
        if !self.dbs.contains_key(name) {
            return Err(crate::error::MnemeError::UnknownRoot(name.to_string()));
        }
        self.watchers.remove(name); // dropping the debouncer stops the watch
        self.dbs.remove(name);
        self.roots.retain(|r| r.name != name);
        Ok(())
    }

    /// The current root names (`wiki_list_roots` / `wiki_reindex` all-roots / `wiki_status`).
    pub fn root_names(&self) -> Vec<String> {
        self.roots.iter().map(|r| r.name.clone()).collect()
    }

    /// Spawn the deferred (~[`RECONCILE_DELAY`]) startup reconcile thread (coalesced through the
    /// job manager); returns immediately so startup is never blocked.
    pub fn spawn_deferred_reconcile(&self) {
        let work: Vec<(RootConfig, Arc<RootIndex>)> = self
            .roots
            .iter()
            .filter_map(|r| self.dbs.get(&r.name).map(|ri| (r.clone(), Arc::clone(ri))))
            .collect();
        let embed = self.embed.clone();
        let jobs = Arc::clone(&self.jobs);
        let cancel = self.cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(RECONCILE_DELAY);
            for (cfg, ri) in &work {
                if cancel.is_cancelled() {
                    break;
                }
                jobs.reconcile_coalesced(ri, cfg, &embed, cancel.clone());
            }
        });
    }

    /// Convenience for `serve`: open + start watchers + spawn the deferred reconcile.
    pub fn start(roots: &[RootConfig], model: &ModelConfig, embedder: Arc<LazyEmbedder>) -> Result<Self> {
        let mut mgr = Self::open(roots, model, embedder)?;
        mgr.start_watchers()?;
        mgr.spawn_deferred_reconcile();
        Ok(mgr)
    }

    /// Stop the watchers + cancel any in-flight background reconciles.
    pub fn shutdown(self) {
        self.cancel.cancel();
        drop(self.watchers);
    }
}
