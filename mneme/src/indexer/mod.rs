//! Indexer — keeps the per-root SQLite index consistent with the files on disk.
//!
//! Two complementary paths (EPIC-032 D17 / US-651 "Indexer"):
//! - **Reconcile** ([`reconcile_root`]) — the authoritative sync: walk the root, skip
//!   unchanged files via an **mtime+size fast-path**, hash only the candidates, then index
//!   new files, re-process changed ones, and drop deleted ones. Runs synchronously (CLI
//!   `reindex`) and as a deferred, non-blocking background job ~[`RECONCILE_DELAY`] after start.
//! - **Watcher** ([`crate::watcher`]) — wakes a debounced reconcile when files change outside
//!   Mneme's own write path.
//!
//! Scope (US-654): synchronous orchestration + `std::thread`. One [`IndexDb`] per root behind
//! an `Arc<Mutex<…>>` — the lock is both the single-writer gate and the single-flight gate.
//! **No** `tokio`, **no** embeddings (`chunks_vec` stays empty — US-657/658), **no** priority
//! queue / reader pool / cancellable JobManager / progress notifications (US-659 extends this
//! seam). [`index_one`] is also the primitive US-655's synchronous `wiki_write` will call.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::config::{ModelConfig, RootConfig};
use crate::embed::{Embedder, LazyEmbedder};
use crate::error::Result;
use crate::index::{content_hash, IndexDb};
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

/// Convert a `SystemTime` to epoch seconds (`documents.mtime` storage + fast-path compare).
fn system_time_to_secs(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Owns one [`IndexDb`] per root (behind a `Mutex` — single-writer + single-flight) plus the
/// always-on watchers. The seam US-659 extends with a reader pool + priority embed worker.
pub struct IndexManager {
    roots: Vec<RootConfig>,
    dbs: HashMap<String, Arc<Mutex<IndexDb>>>,
    /// Keyed by root name so a single root's watcher can be stopped on `wiki_remove_root`.
    watchers: HashMap<String, RootWatcher>,
    /// Shared, build-once embedding engine (US-658). Resolved (`get()`) at the top of each
    /// reconcile; `None` (model not provisioned) keeps `chunks_vec` empty (FTS-only).
    embedder: Arc<LazyEmbedder>,
}

impl IndexManager {
    /// Open (or create) the per-root index for every root. Does not walk yet. `embedder` is the
    /// shared lazy embedder (clone of the one `ServerState` holds, or a CLI-local one).
    pub fn open(roots: &[RootConfig], model: &ModelConfig, embedder: Arc<LazyEmbedder>) -> Result<Self> {
        let mut dbs = HashMap::with_capacity(roots.len());
        for r in roots {
            let db = IndexDb::open_or_create(&r.name, &r.folder, model)?;
            dbs.insert(r.name.clone(), Arc::new(Mutex::new(db)));
        }
        Ok(Self {
            roots: roots.to_vec(),
            dbs,
            watchers: HashMap::new(),
            embedder,
        })
    }

    /// The per-root index handle — US-655's synchronous `wiki_write` locks this and calls
    /// [`index_one`] on its just-written file.
    pub fn handle(&self, root: &str) -> Option<Arc<Mutex<IndexDb>>> {
        self.dbs.get(root).cloned()
    }

    /// Foreground reconcile of one root.
    pub fn reconcile_root(&self, root: &str) -> Result<ReconcileStats> {
        let cfg = self
            .roots
            .iter()
            .find(|r| r.name == root)
            .ok_or_else(|| crate::error::MnemeError::UnknownRoot(root.to_string()))?;
        let db = self
            .dbs
            .get(root)
            .ok_or_else(|| crate::error::MnemeError::UnknownRoot(root.to_string()))?;
        let guard = db.lock().unwrap();
        let emb = self.embedder.get();
        reconcile_root(&guard, cfg, emb.as_deref())
    }

    /// Foreground reconcile of every root (CLI `reindex`, the deferred job, tests).
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

    /// Spawn an always-on debounced watcher per root (reconciles that root on change).
    pub fn start_watchers(&mut self) -> Result<()> {
        for r in &self.roots {
            if let Some(db) = self.dbs.get(&r.name) {
                let watcher = RootWatcher::start(r.clone(), Arc::clone(db), Arc::clone(&self.embedder))?;
                self.watchers.insert(r.name.clone(), watcher);
            }
        }
        Ok(())
    }

    /// Register a new root at runtime (`wiki_add_root`): open its index, start its watcher, and
    /// track its config. The caller persists the config and reconciles. Returns the new handle.
    pub fn add_root(&mut self, cfg: RootConfig, model: &ModelConfig) -> Result<Arc<Mutex<IndexDb>>> {
        let db = Arc::new(Mutex::new(IndexDb::open_or_create(&cfg.name, &cfg.folder, model)?));
        let watcher = RootWatcher::start(cfg.clone(), Arc::clone(&db), Arc::clone(&self.embedder))?;
        self.watchers.insert(cfg.name.clone(), watcher);
        self.dbs.insert(cfg.name.clone(), Arc::clone(&db));
        self.roots.push(cfg);
        Ok(db)
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

    /// Spawn the deferred (~[`RECONCILE_DELAY`]) startup reconcile thread; returns immediately
    /// so startup is never blocked.
    pub fn spawn_deferred_reconcile(&self) {
        let work: Vec<(RootConfig, Arc<Mutex<IndexDb>>)> = self
            .roots
            .iter()
            .filter_map(|r| self.dbs.get(&r.name).map(|db| (r.clone(), Arc::clone(db))))
            .collect();
        let embedder = Arc::clone(&self.embedder);
        std::thread::spawn(move || {
            std::thread::sleep(RECONCILE_DELAY);
            // Resolve once — the first build (when a model is present) happens here, off the
            // startup path, so the corpus is embedded shortly after serve begins.
            let emb = embedder.get();
            for (cfg, db) in &work {
                let guard = db.lock().unwrap();
                if let Err(e) = reconcile_root(&guard, cfg, emb.as_deref()) {
                    tracing::warn!(root = %cfg.name, "deferred reconcile failed: {e}");
                }
            }
        });
    }

    /// Convenience for US-655's `serve`: open + start watchers + spawn the deferred reconcile.
    pub fn start(roots: &[RootConfig], model: &ModelConfig, embedder: Arc<LazyEmbedder>) -> Result<Self> {
        let mut mgr = Self::open(roots, model, embedder)?;
        mgr.start_watchers()?;
        mgr.spawn_deferred_reconcile();
        Ok(mgr)
    }

    /// Stop the watchers (drops the debouncers/threads).
    pub fn shutdown(self) {
        drop(self.watchers);
    }
}
