//! MCP server — the sole interface (EPIC-032 D9/D10). Exposes the `wiki_*` tool surface and
//! `mneme://` resources over **Streamable HTTP**, bound to loopback. `wiki_search` serves text /
//! vector / hybrid modes (US-657/658); `wiki_reindex` is a cancellable, progress-emitting job
//! driven through the [`JobManager`] (US-659) — query embeds run at interactive priority on the
//! shared worker, reads use each root's connection pool. Resource subscriptions are not yet
//! advertised (US-661/662).
//!
//! The tool *logic* lives on [`ServerState`] as plain async methods (callable directly in
//! tests, no HTTP); [`server::MnemeServer`] is the thin rmcp adapter. Every fs/SQLite call runs
//! inside `spawn_blocking`, and a `std::sync::Mutex`/`RwLock` guard is never held across `.await`
//! (acquired inside the blocking closure, dropped before it returns).

pub mod params;
pub mod results;
mod server;

pub use server::{serve, MnemeServer};

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::SystemTime;

use base64::Engine;
use tokio::sync::mpsc::UnboundedSender;
use tokio_util::sync::CancellationToken;

use crate::config::{self, Config, ModelConfig};
use crate::embed::{EmbedHandle, LazyEmbedder};
use crate::error::{MnemeError, Result};
use crate::index::SearchFilter;
use crate::indexer::{single_doc_index, IndexManager, JobManager, ReindexProgress};
use crate::markdown::parse_document;
use crate::store::address::WikiAddress;
use crate::store::grep::{GrepOptions, GrepResult, OutputMode};
use crate::store::DocumentStore;

use params::*;
use results::*;

/// Shared, process-wide server state — constructed once at `serve` start and cloned (as an
/// `Arc`) into each per-session handler. Coarse-grained locking is intentional for US-655's
/// text mode; US-659 refines responsiveness (reader pool, priority worker).
pub struct ServerState {
    store: RwLock<DocumentStore>,
    index: Mutex<IndexManager>,
    config: Mutex<Config>,
    config_path: PathBuf,
    model: ModelConfig,
    /// Submit handle for the single embedding worker (US-659) — query embeds (interactive) and
    /// the serving single-doc index path go through it, off the index lock. `embed_query`/
    /// `embed_passages` return `None` when no model is provisioned → callers degrade to FTS.
    embed: EmbedHandle,
    /// Reindex job manager — drives `wiki_reindex` (cancellable + progress) and exposes the
    /// per-root progress snapshot for `wiki_status`.
    jobs: Arc<JobManager>,
}

/// A resource body to hand back to MCP — text or base64 blob — kept rmcp-type-free so
/// [`ServerState`] stays decoupled from the SDK (the adapter wraps it).
pub enum ResourceBody {
    Text(String),
    Blob(String),
}

impl ServerState {
    /// Open the store + start the index manager (watchers + deferred startup reconcile, US-654).
    pub fn new(cfg: Config, config_path: PathBuf) -> Result<Arc<Self>> {
        let store = DocumentStore::open(&cfg)?;
        let embedder = LazyEmbedder::new(cfg.clone());
        let index = IndexManager::start(store.registry().configs(), &cfg.model, embedder)?;
        let embed = index.embed_handle();
        let jobs = index.jobs();
        let model = cfg.model.clone();
        Ok(Arc::new(Self {
            store: RwLock::new(store),
            index: Mutex::new(index),
            config: Mutex::new(cfg),
            config_path,
            model,
            embed,
            jobs,
        }))
    }

    // --- file-like tools ---------------------------------------------------------------------

    pub async fn read_doc(self: &Arc<Self>, p: ReadParams) -> Result<ReadResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let store = st.store.read().unwrap();
            let wa = WikiAddress::parse(&p.path)?;
            let abs = store.registry().resolve(&wa)?;
            let content = store.read(&p.path, p.offset, p.limit)?;
            let full = store.read(&p.path, None, None)?;
            let stem = file_stem(&wa.rest);
            let md = std::fs::metadata(&abs).ok();
            let birthtime = md.as_ref().and_then(|m| m.created().ok());
            let mtime = md
                .as_ref()
                .and_then(|m| m.modified().ok())
                .unwrap_or_else(SystemTime::now);
            let parsed = parse_document(&stem, &full, birthtime, mtime);
            Ok(ReadResult {
                content,
                frontmatter: Frontmatter {
                    title: parsed.meta.title,
                    tags: parsed.meta.tags,
                    created: parsed.meta.created,
                    verified: parsed.meta.verified,
                },
            })
        })
        .await
    }

    pub async fn write_doc(self: &Arc<Self>, p: WriteParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            let wa = WikiAddress::parse(&p.path)?;
            let abs = {
                let store = st.store.read().unwrap();
                store.write(&p.path, &p.content)?;
                store.registry().resolve(&wa)?
            };
            index_file(&st, &wa, &abs)
        })
        .await
    }

    pub async fn edit_doc(self: &Arc<Self>, p: EditParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            let wa = WikiAddress::parse(&p.path)?;
            let abs = {
                let store = st.store.read().unwrap();
                store.edit(&p.path, &p.old_string, &p.new_string, p.replace_all)?;
                store.registry().resolve(&wa)?
            };
            index_file(&st, &wa, &abs)
        })
        .await
    }

    pub async fn delete_doc(self: &Arc<Self>, p: DeleteParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            let wa = WikiAddress::parse(&p.path)?;
            {
                st.store.read().unwrap().delete(&p.path)?;
            }
            let handle = { st.index.lock().unwrap().handle(&wa.root) };
            if let Some(h) = handle {
                h.writer().delete_document(&wa.rest)?;
            }
            Ok(())
        })
        .await
    }

    pub async fn glob(self: &Arc<Self>, p: GlobParams) -> Result<GlobResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let store = st.store.read().unwrap();
            Ok(GlobResult {
                matches: store.glob(&p.pattern, p.path.as_deref())?,
            })
        })
        .await
    }

    pub async fn grep(self: &Arc<Self>, p: GrepParams) -> Result<serde_json::Value> {
        let st = Arc::clone(self);
        blocking(move || {
            let output_mode = match p.output_mode {
                GrepOutputMode::FilesWithMatches => OutputMode::FilesWithMatches,
                GrepOutputMode::Content => OutputMode::Content,
                GrepOutputMode::Count => OutputMode::Count,
            };
            let line_numbers = p.line_numbers.unwrap_or(true);
            let opts = GrepOptions {
                ignore_case: p.ignore_case,
                context: p.context,
                output_mode,
                line_numbers,
            };

            // Optional metadata pre-filter: when tags/dateRange are given, restrict the scan to
            // documents the index says match. These come from `.md` frontmatter, so non-`.md`
            // indexed files (a future `ext` capability) are excluded — same limitation as
            // `wiki_search`. Without these filters there is no index round-trip.
            let allowed = if !p.tags.is_empty() || p.date_range.is_some() {
                let (roots, subtree_prefix) = scope(&st, p.path.as_deref())?;
                let filter = SearchFilter {
                    subtree: non_empty(subtree_prefix),
                    tags: p.tags.clone(),
                    exclude_tags: Vec::new(),
                    created_from: p.date_range.as_ref().and_then(|d| d.from.clone()),
                    created_to: p.date_range.as_ref().and_then(|d| d.to.clone()),
                };
                let mut set = HashSet::new();
                for root in roots {
                    let handle = { st.index.lock().unwrap().handle(&root) };
                    if let Some(h) = handle {
                        for rel in h.read(|db| db.docs_matching(&filter))? {
                            set.insert(format!("{root}/{rel}"));
                        }
                    }
                }
                Some(set)
            } else {
                None
            };

            let result = {
                let store = st.store.read().unwrap();
                store.grep(&p.pattern, p.path.as_deref(), &opts)?
            };
            let result = match allowed {
                Some(set) => filter_grep_result(result, &set),
                None => result,
            };
            Ok(grep_to_json(result, line_numbers))
        })
        .await
    }

    // --- semantic / views --------------------------------------------------------------------

    pub async fn search(self: &Arc<Self>, p: SearchParams) -> Result<SearchResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let top_k = p.top_k.unwrap_or(10);
            let (roots, subtree_prefix) = scope(&st, p.subtree.as_deref())?;
            let filter = SearchFilter {
                subtree: non_empty(subtree_prefix),
                tags: p.tags.clone(),
                exclude_tags: p.exclude_tags.clone(),
                created_from: p.date_range.as_ref().and_then(|d| d.from.clone()),
                created_to: p.date_range.as_ref().and_then(|d| d.to.clone()),
            };

            // Embed the query for vector/hybrid at interactive priority (preempts bulk reindex
            // embeds on the worker). `None` (no model) → degrade to text.
            let query_vec = match p.mode {
                SearchMode::Text => None,
                SearchMode::Vector | SearchMode::Hybrid => st.embed.embed_query(&p.query)?,
            };

            // Effective lane: requested mode, but fall back to text when there's no embedder.
            let lane = match (&p.mode, &query_vec) {
                (SearchMode::Vector, Some(_)) => Lane::Vector,
                (SearchMode::Hybrid, Some(_)) => Lane::Hybrid,
                _ => Lane::Text,
            };

            let mut hits = Vec::new();
            for root in roots {
                let handle = { st.index.lock().unwrap().handle(&root) };
                if let Some(h) = handle {
                    // Pooled read — runs concurrently with any in-flight reindex writer.
                    match lane {
                        Lane::Text => hits.extend(h.read(|db| db.search_text(&p.query, &filter, top_k))?),
                        Lane::Vector => hits.extend(
                            h.read(|db| db.search_vector(query_vec.as_ref().unwrap(), &filter, top_k))?,
                        ),
                        Lane::Hybrid => hits.extend(h.read(|db| {
                            db.search_hybrid(&p.query, query_vec.as_ref().unwrap(), &filter, top_k)
                        })?),
                    }
                }
            }

            // Cross-root sort by the lane's scalar: text/vector lower-is-better, hybrid higher.
            match lane {
                Lane::Hybrid => hits.sort_by(|a, b| {
                    b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)
                }),
                Lane::Text | Lane::Vector => hits.sort_by(|a, b| {
                    a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal)
                }),
            }
            hits.truncate(top_k);

            let results = hits
                .into_iter()
                .map(|h| SearchHit {
                    uri: h.address,
                    title: h.title,
                    tags: h.tags,
                    snippet: h.snippet,
                    score: h.score,
                })
                .collect();
            // Only note a degrade when the user asked for vector/hybrid but no model was available.
            let note = match (&p.mode, &query_vec) {
                (SearchMode::Vector | SearchMode::Hybrid, None) => Some(
                    "embedding model not provisioned (run wiki_model_update); \
                     returned text-mode results"
                        .to_string(),
                ),
                _ => None,
            };
            Ok(SearchResult { results, note })
        })
        .await
    }

    pub async fn tree(self: &Arc<Self>, p: TreeParams) -> Result<TreeResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let addrs = { st.store.read().unwrap().list(p.path.as_deref())? };
            // BTreeMap iterates keys sorted → DFS pre-order (a dir sorts before its children).
            let mut nodes: BTreeMap<String, bool> = BTreeMap::new();
            for addr in &addrs {
                let segs: Vec<&str> = addr.split('/').collect();
                for i in 1..segs.len() {
                    nodes.entry(segs[..i].join("/")).or_insert(true);
                }
                nodes.insert(addr.clone(), false);
            }
            let entries = nodes
                .into_iter()
                .map(|(path, is_dir)| {
                    let depth = path.matches('/').count();
                    let name = path.rsplit('/').next().unwrap_or(&path).to_string();
                    TreeEntry {
                        uri: format!("mneme://{path}"),
                        name,
                        is_dir,
                        depth,
                    }
                })
                .collect();
            Ok(TreeResult { entries })
        })
        .await
    }

    pub async fn timeline(self: &Arc<Self>, p: TimelineParams) -> Result<TimelineResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let (roots, subtree_prefix) = scope(&st, p.subtree.as_deref())?;
            let sub = if subtree_prefix.is_empty() {
                None
            } else {
                Some(subtree_prefix.as_str())
            };
            let mut entries = Vec::new();
            for root in &roots {
                let handle = { st.index.lock().unwrap().handle(root) };
                if let Some(h) = handle {
                    let docs = h.read(|db| db.docs_with_tag("log", sub))?;
                    for d in docs {
                        if !p.tags.iter().all(|t| d.tags.contains(t)) {
                            continue;
                        }
                        let date = match log_date(&d.path) {
                            Some(x) => x,
                            None => continue,
                        };
                        if p.from.as_ref().is_some_and(|f| &date < f) {
                            continue;
                        }
                        if p.to.as_ref().is_some_and(|t| &date > t) {
                            continue;
                        }
                        entries.push(TimelineEntry {
                            uri: format!("mneme://{}/{}", root, d.path),
                            title: d.title,
                            date,
                            tags: d.tags,
                        });
                    }
                }
            }
            entries.sort_by(|a, b| b.date.cmp(&a.date)); // newest first
            Ok(TimelineResult { entries })
        })
        .await
    }

    pub async fn tags(self: &Arc<Self>, p: TagsParams) -> Result<TagsResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let (roots, subtree_prefix) = scope(&st, p.subtree.as_deref())?;
            let sub = if subtree_prefix.is_empty() {
                None
            } else {
                Some(subtree_prefix.as_str())
            };
            let mut counts: BTreeMap<String, usize> = BTreeMap::new();
            for root in &roots {
                let handle = { st.index.lock().unwrap().handle(root) };
                if let Some(h) = handle {
                    for (tag, c) in h.read(|db| db.tag_counts(sub))? {
                        *counts.entry(tag).or_insert(0) += c;
                    }
                }
            }
            Ok(TagsResult {
                tags: counts
                    .into_iter()
                    .map(|(tag, count)| TagCount { tag, count })
                    .collect(),
            })
        })
        .await
    }

    // --- management / control plane ----------------------------------------------------------

    pub async fn list_roots(self: &Arc<Self>) -> Result<ListRootsResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let store = st.store.read().unwrap();
            Ok(ListRootsResult {
                roots: store
                    .registry()
                    .configs()
                    .iter()
                    .map(|r| RootInfo {
                        name: r.name.clone(),
                        folder: r.folder.display().to_string(),
                    })
                    .collect(),
            })
        })
        .await
    }

    pub async fn add_root(self: &Arc<Self>, p: AddRootParams) -> Result<AddRootResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let folder = PathBuf::from(&p.folder);
            let cfg = {
                let mut store = st.store.write().unwrap();
                store.registry_mut().add(folder, p.name.clone())?.clone()
            };
            {
                st.index.lock().unwrap().add_root(cfg.clone(), &st.model)?;
            }
            persist_roots(&st)?;
            // Reconcile the freshly added root (embeds via the worker when a model is present).
            let handle = { st.index.lock().unwrap().handle(&cfg.name) };
            if let Some(h) = handle {
                st.jobs
                    .reconcile_blocking(&h, &cfg, &st.embed, CancellationToken::new(), |_| {})?;
            }
            Ok(AddRootResult {
                name: cfg.name,
                folder: cfg.folder.display().to_string(),
            })
        })
        .await
    }

    pub async fn remove_root(self: &Arc<Self>, p: RemoveRootParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            {
                st.store.write().unwrap().registry_mut().remove(&p.root)?;
            }
            {
                st.index.lock().unwrap().remove_root(&p.root)?;
            }
            persist_roots(&st)
        })
        .await
    }

    /// Reconcile one or all roots through the [`JobManager`] (cancellable + single-flight). Runs
    /// the reconcile off the async runtime; `cancel` (the MCP request's `ct`) stops it cleanly
    /// mid-pass, and each progress snapshot is streamed on `progress_tx` as `(root, snapshot)` for
    /// the adapter to forward as an MCP `notifications/progress`. Returns the per-root stats.
    pub async fn reindex(
        self: &Arc<Self>,
        p: ReindexParams,
        cancel: CancellationToken,
        progress_tx: UnboundedSender<(String, ReindexProgress)>,
    ) -> Result<ReindexResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let targets: Vec<String> = match p.path.as_deref() {
                Some(path) => vec![WikiAddress::parse(path)?.root],
                None => st.index.lock().unwrap().root_names(),
            };
            let mut roots = Vec::new();
            for name in targets {
                let cfg = { st.store.read().unwrap().registry().get(&name).cloned() }
                    .ok_or_else(|| MnemeError::UnknownRoot(name.clone()))?;
                let handle = { st.index.lock().unwrap().handle(&name) }
                    .ok_or_else(|| MnemeError::UnknownRoot(name.clone()))?;
                let tx = progress_tx.clone();
                let root_name = name.clone();
                let s = st.jobs.reconcile_blocking(&handle, &cfg, &st.embed, cancel.clone(), move |pr| {
                    let _ = tx.send((root_name.clone(), pr.clone()));
                })?;
                roots.push(ReindexRoot {
                    name,
                    scanned: s.scanned,
                    indexed: s.indexed,
                    refreshed: s.refreshed,
                    skipped: s.skipped,
                    vectorized: s.vectorized,
                    deleted: s.deleted,
                    errors: s.errors,
                });
            }
            Ok(ReindexResult { roots })
        })
        .await
    }

    pub async fn status(self: &Arc<Self>) -> Result<StatusResult> {
        let st = Arc::clone(self);
        blocking(move || {
            let cfgs = { st.store.read().unwrap().registry().configs().to_vec() };
            let mut roots = Vec::new();
            for r in cfgs {
                let handle = { st.index.lock().unwrap().handle(&r.name) };
                let reindex = st.jobs.progress_for(&r.name).map(ReindexProgressDto::from);
                let row = if let Some(h) = handle {
                    let (doc_count, meta, dp) = h.read(|db| -> Result<_> {
                        Ok((db.doc_count()?, db.meta()?, db.db_path().to_path_buf()))
                    })?;
                    let bytes = std::fs::metadata(&dp).map(|m| m.len()).unwrap_or(0);
                    StatusRoot {
                        name: r.name,
                        folder: r.folder.display().to_string(),
                        doc_count,
                        model: meta.model,
                        precision: meta.precision,
                        schema_ver: meta.schema_version,
                        index_path: dp.display().to_string(),
                        index_bytes: bytes,
                        reindex,
                    }
                } else {
                    StatusRoot {
                        name: r.name,
                        folder: r.folder.display().to_string(),
                        doc_count: 0,
                        model: String::new(),
                        precision: String::new(),
                        schema_ver: 0,
                        index_path: String::new(),
                        index_bytes: 0,
                        reindex,
                    }
                };
                roots.push(row);
            }
            let model_status = crate::model::status(&st.model).ok();
            Ok(StatusResult {
                roots,
                model: model_status,
            })
        })
        .await
    }

    pub async fn index_delete(self: &Arc<Self>, p: IndexDeleteParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            let active_id = crate::index::path::model_id(&st.model);
            if p.model_id == active_id && p.schema_ver == crate::index::schema::SCHEMA_VERSION {
                return Err(MnemeError::Internal(
                    "refusing to delete the active index DB; switch model/schema first".to_string(),
                ));
            }
            let folder = {
                st.store
                    .read()
                    .unwrap()
                    .registry()
                    .get(&p.root)
                    .map(|r| r.folder.clone())
                    .ok_or_else(|| MnemeError::UnknownRoot(p.root.clone()))?
            };
            let db_file = folder
                .join(".mneme")
                .join(&p.model_id)
                .join(format!("index-v{}.db", p.schema_ver));
            if db_file.exists() {
                std::fs::remove_file(&db_file)?;
                for ext in ["-wal", "-shm"] {
                    let sib = db_file.with_file_name(format!("index-v{}.db{ext}", p.schema_ver));
                    let _ = std::fs::remove_file(sib);
                }
            }
            Ok(())
        })
        .await
    }

    /// Download and verify the configured embedding model.
    ///
    /// If `requested_model` is Some but differs from the configured name, returns an error
    /// explaining that model switching requires a config change (deferred to US-657+).
    pub async fn model_update(
        self: &Arc<Self>,
        force: bool,
        requested_model: Option<String>,
    ) -> Result<crate::model::ModelStatus> {
        if let Some(ref req) = requested_model {
            let configured_name = self
                .model
                .name
                .as_deref()
                .unwrap_or(crate::model::DEFAULT_MODEL_NAME);
            if req != configured_name {
                return Err(MnemeError::Config(
                    "switching models is deferred; configure model in mneme.toml and re-run model-update"
                        .to_string(),
                ));
            }
        }
        let st = Arc::clone(self);
        blocking(move || crate::model::provision(&st.model, force)).await
    }

    /// Serve a `mneme://{root}/{path}` document/attachment as text or a base64 blob.
    pub async fn read_resource_body(self: &Arc<Self>, addr: String) -> Result<ResourceBody> {
        let st = Arc::clone(self);
        blocking(move || {
            let store = st.store.read().unwrap();
            if is_text_addr(&addr) {
                Ok(ResourceBody::Text(store.read(&addr, None, None)?))
            } else {
                let bytes = store.read_bytes(&addr)?;
                Ok(ResourceBody::Blob(
                    base64::engine::general_purpose::STANDARD.encode(bytes),
                ))
            }
        })
        .await
    }
}

// --- shared helpers --------------------------------------------------------------------------

/// Which retrieval lane `search` actually runs (the requested mode after the no-model fallback).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Lane {
    Text,
    Vector,
    Hybrid,
}

/// Run a blocking (fs/SQLite) closure off the async runtime — the only place lock guards live.
async fn blocking<T, F>(f: F) -> Result<T>
where
    F: FnOnce() -> Result<T> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| MnemeError::Internal(format!("blocking task failed: {e}")))?
}

/// Lock the index briefly to clone a root's handle, then index the just-written file: a brief
/// writer-locked upsert, then embed the one document at interactive priority on the worker (off
/// the writer lock) when a model is provisioned (US-658/659).
fn index_file(st: &Arc<ServerState>, wa: &WikiAddress, abs: &Path) -> Result<()> {
    let handle = { st.index.lock().unwrap().handle(&wa.root) }
        .ok_or_else(|| MnemeError::UnknownRoot(wa.root.clone()))?;
    single_doc_index(&handle, &wa.rest, abs, &st.embed)?;
    Ok(())
}

/// Resolve a scope: `Some("{root}/sub")` → (that root, "sub"); `None` → (all roots, "").
fn scope(st: &Arc<ServerState>, subtree: Option<&str>) -> Result<(Vec<String>, String)> {
    match subtree.filter(|s| !s.is_empty()) {
        Some(s) => {
            let wa = WikiAddress::parse(s)?;
            Ok((vec![wa.root], wa.rest))
        }
        None => Ok((st.index.lock().unwrap().root_names(), String::new())),
    }
}

/// Snapshot the registry into the config and write it back (root add/remove persistence).
fn persist_roots(st: &Arc<ServerState>) -> Result<()> {
    let configs = { st.store.read().unwrap().registry().configs().to_vec() };
    let mut config = st.config.lock().unwrap();
    config.roots = configs;
    config::save(&st.config_path, &config)
}

fn non_empty(s: String) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn file_stem(rel: &str) -> String {
    Path::new(rel)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| rel.to_string())
}

/// Extract a `YYYY-MM-DD` date from a daily-log filename (`log/2026/2026-06-13.md`).
fn log_date(rel: &str) -> Option<String> {
    let stem = Path::new(rel).file_stem()?.to_string_lossy().into_owned();
    let s = stem.get(0..10)?;
    let b = s.as_bytes();
    let ok = b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[8..10].iter().all(u8::is_ascii_digit);
    ok.then(|| s.to_string())
}

fn is_text_addr(addr: &str) -> bool {
    const TEXT: &[&str] = &[
        ".md", ".markdown", ".txt", ".json", ".csv", ".log", ".yaml", ".yml", ".toml", ".rs",
        ".ts", ".js", ".html", ".xml", ".sh", ".py",
    ];
    let lower = addr.to_ascii_lowercase();
    TEXT.iter().any(|e| lower.ends_with(e))
}

/// Retain only the grep entries whose `{root}/{path}` address is in `allowed` (metadata filter).
fn filter_grep_result(result: GrepResult, allowed: &HashSet<String>) -> GrepResult {
    match result {
        GrepResult::Files(files) => {
            GrepResult::Files(files.into_iter().filter(|a| allowed.contains(a)).collect())
        }
        GrepResult::Counts(counts) => {
            GrepResult::Counts(counts.into_iter().filter(|(a, _)| allowed.contains(a)).collect())
        }
        GrepResult::Content(items) => {
            GrepResult::Content(items.into_iter().filter(|(a, _)| allowed.contains(a)).collect())
        }
    }
}

fn grep_to_json(result: GrepResult, line_numbers: bool) -> serde_json::Value {
    use serde_json::json;
    match result {
        GrepResult::Files(files) => json!({ "mode": "files_with_matches", "files": files }),
        GrepResult::Counts(counts) => json!({
            "mode": "count",
            "counts": counts
                .into_iter()
                .map(|(uri, count)| json!({ "uri": uri, "count": count }))
                .collect::<Vec<_>>(),
        }),
        GrepResult::Content(items) => json!({
            "mode": "content",
            "matches": items
                .into_iter()
                .map(|(uri, lines)| json!({
                    "uri": uri,
                    "lines": lines
                        .into_iter()
                        .map(|l| {
                            let mut obj = serde_json::Map::new();
                            if line_numbers {
                                obj.insert("lineNumber".to_string(), json!(l.line_number));
                            }
                            obj.insert("text".to_string(), json!(l.text));
                            obj.insert("isMatch".to_string(), json!(l.is_match));
                            serde_json::Value::Object(obj)
                        })
                        .collect::<Vec<_>>(),
                }))
                .collect::<Vec<_>>(),
        }),
    }
}
