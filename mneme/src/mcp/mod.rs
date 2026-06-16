//! MCP server — the sole interface (EPIC-032 D9/D10). Exposes the MCP tool surface and
//! `mneme://` resources over **Streamable HTTP**, bound to loopback. `search` serves text /
//! vector / hybrid modes (US-657/658); `reindex` is a cancellable, progress-emitting job
//! driven through the [`JobManager`] (US-659) — query embeds run at interactive priority on the
//! shared worker, reads use each root's connection pool. Resource subscriptions (US-670) are
//! advertised and emitted: the watcher derives changed `mneme://{root}/{path}` URIs and an async
//! fan-out task pushes `resources/updated` / `resources/list_changed` to subscribed sessions (see
//! [`subscriptions`]).
//!
//! The tool *logic* lives on [`ServerState`] as plain async methods (callable directly in
//! tests, no HTTP); [`server::MnemeServer`] is the thin rmcp adapter. Every fs/SQLite call runs
//! inside `spawn_blocking`, and a `std::sync::Mutex`/`RwLock` guard is never held across `.await`
//! (acquired inside the blocking closure, dropped before it returns).

pub mod params;
pub mod results;
mod server;
pub mod subscriptions;

pub use server::{serve, MnemeServer};

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use self::subscriptions::{SubscriptionRegistry, WatchEvent, WatchNotifier};
use tokio::sync::mpsc::UnboundedReceiver;
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
    /// Reindex job manager — drives `reindex` (cancellable + progress) and exposes the
    /// per-root progress snapshot for `status`.
    jobs: Arc<JobManager>,
    /// Tracks the single background model-download job so `model_update` returns immediately
    /// and `status.model.download` can report progress.
    model_job: Arc<ModelJob>,
    /// Resource-subscription registry (US-670). Shared across all per-session handlers and the
    /// watcher fan-out task; maps a session id → its peer + subscribed URIs.
    subscriptions: Arc<SubscriptionRegistry>,
    /// Monotonic session-id source — each `MnemeServer` (one per MCP session) claims one in `new`.
    next_session: AtomicU64,
    /// Receiver end of the watcher→fan-out channel; claimed once by `spawn_fanout` at serve start.
    watch_rx: Mutex<Option<UnboundedReceiver<WatchEvent>>>,
}

/// Background model-download job state. `run_lock` serializes downloads; `in_flight` gates a second
/// `model_update` (coalesce — don't start a parallel download) and drives the `downloading`
/// phase; `errored` flips on a failed provision so `status` can show `download.phase = error`.
#[derive(Default)]
struct ModelJob {
    run_lock: Mutex<()>,
    in_flight: AtomicBool,
    errored: AtomicBool,
}

/// A resource body to hand back to MCP — text or base64 blob — kept rmcp-type-free so
/// [`ServerState`] stays decoupled from the SDK (the adapter wraps it).
pub enum ResourceBody {
    Text(String),
    Blob(String),
}

/// What `read_doc` produced — the `server.rs` adapter maps each arm to MCP tool content. Kept
/// rmcp-type-free so [`ServerState`] stays decoupled from the SDK.
pub enum ReadOutcome {
    /// UTF-8 text file: content + parsed frontmatter (the historical `read` behavior).
    Text(ReadResult),
    /// A vision-supported image: base64 bytes + MIME + a short human note. The agent *sees* it.
    Image {
        base64: String,
        mime: &'static str,
        note: String,
    },
    /// Non-displayable binary (PDF/zip/office) or an oversized image: a typed notice, no bytes.
    Binary { note: String },
}

impl ServerState {
    /// Open the store + start the index manager (watchers + deferred startup reconcile, US-654).
    pub fn new(cfg: Config, config_path: PathBuf) -> Result<Arc<Self>> {
        let store = DocumentStore::open(&cfg)?;
        let embedder = LazyEmbedder::new(cfg.clone());
        // Wire the watcher's resource-change fan-out (US-670): the watcher sends changed URIs on
        // this channel; `spawn_fanout` drains it into the subscription registry at serve start.
        let (notifier, watch_rx) = WatchNotifier::new();
        let index =
            IndexManager::start(store.registry().configs(), &cfg.model, embedder, Some(notifier))?;
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
            model_job: Arc::new(ModelJob::default()),
            subscriptions: Arc::new(SubscriptionRegistry::default()),
            next_session: AtomicU64::new(0),
            watch_rx: Mutex::new(Some(watch_rx)),
        }))
    }

    /// Claim a unique session id for a new `MnemeServer` (one per MCP session).
    pub fn next_session_id(&self) -> u64 {
        self.next_session.fetch_add(1, Ordering::Relaxed)
    }

    /// The shared resource-subscription registry (US-670).
    pub fn subscriptions(&self) -> Arc<SubscriptionRegistry> {
        Arc::clone(&self.subscriptions)
    }

    /// Spawn the watcher→subscriber fan-out task (US-670). Idempotent: the receiver is taken once;
    /// subsequent calls are no-ops. Must run inside the tokio runtime (called from `serve`).
    pub fn spawn_fanout(self: &Arc<Self>) {
        let Some(mut rx) = self.watch_rx.lock().unwrap().take() else {
            return;
        };
        let subs = Arc::clone(&self.subscriptions);
        tokio::spawn(async move {
            while let Some(ev) = rx.recv().await {
                match ev {
                    WatchEvent::Updated(uri) => subs.notify_updated(&uri).await,
                    WatchEvent::ListChanged => subs.notify_list_changed().await,
                }
            }
        });
    }

    /// Build the full model status (`status()` + live download progress derived from the
    /// background job state). Used by `status` and `model_update`.
    fn build_model_status(&self) -> Option<crate::model::ModelStatus> {
        let mut ms = crate::model::status(&self.model).ok()?;
        let in_flight = self.model_job.in_flight.load(Ordering::SeqCst);
        let errored = self.model_job.errored.load(Ordering::SeqCst);
        ms.download = crate::model::download_progress(&self.model, in_flight, errored).ok();
        Some(ms)
    }

    // --- file-like tools ---------------------------------------------------------------------

    pub async fn read_doc(self: &Arc<Self>, p: ReadParams) -> Result<ReadOutcome> {
        let st = Arc::clone(self);
        blocking(move || {
            let store = st.store.read().unwrap();
            let wa = WikiAddress::parse(&p.path)?;
            let abs = store.registry().resolve(&wa)?;
            let bytes = std::fs::read(&abs)?;

            // Text path (incl. .svg/.mmd/.html/.json) — the historical behavior, unchanged.
            if !looks_binary(&bytes) {
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
                return Ok(ReadOutcome::Text(ReadResult {
                    content,
                    frontmatter: Frontmatter {
                        title: parsed.meta.title,
                        tags: parsed.meta.tags,
                        created: parsed.meta.created,
                        verified: parsed.meta.verified,
                    },
                }));
            }

            // Binary: a vision-supported image within the cap → image block; else a typed notice.
            let kb = bytes.len().div_ceil(1024);
            match image_mime(&wa.rest) {
                Some(mime) if bytes.len() <= MAX_INLINE_IMAGE_BYTES => Ok(ReadOutcome::Image {
                    base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
                    mime,
                    note: format!("{} ({mime}, {kb} KB)", wa.rest),
                }),
                Some(mime) => Ok(ReadOutcome::Binary {
                    note: format!(
                        "<image too large to inline: {} {kb} KB ({mime}); read it via the UI>",
                        wa.rest
                    ),
                }),
                None => Ok(ReadOutcome::Binary {
                    note: format!("<binary file: {} {kb} KB — not displayable as text>", wa.rest),
                }),
            }
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
            index_if_indexable(&st, &wa, &abs)
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
            index_if_indexable(&st, &wa, &abs)
        })
        .await
    }

    /// Delete a file **or** a folder (recursive). For a file: drop the one index row (today's
    /// behavior). For a folder: `remove_dir_all` + a scoped reconcile, which drops every index row
    /// whose file is now gone (no per-prefix index surgery — the reconcile self-heals; Decision 3).
    pub async fn delete_doc(self: &Arc<Self>, p: DeleteParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            let wa = WikiAddress::parse(&p.path)?;
            let was_dir = {
                let store = st.store.read().unwrap();
                let is_dir = store.registry().resolve(&wa)?.is_dir();
                store.delete_path(&p.path)?;
                is_dir
            };
            if was_dir {
                reconcile_root_now(&st, &wa.root)?;
            } else {
                let handle = { st.index.lock().unwrap().handle(&wa.root) };
                if let Some(h) = handle {
                    h.writer().delete_document(&wa.rest)?;
                }
            }
            Ok(())
        })
        .await
    }

    /// Create an empty folder (`mkdir`). Folders are not indexed, so there's no index follow-up;
    /// the directory-aware `tree` surfaces it immediately.
    pub async fn mkdir(self: &Arc<Self>, p: MkdirParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            st.store.read().unwrap().mkdir(&p.path)?;
            Ok(())
        })
        .await
    }

    /// Move/rename a file or folder within a root (`rename`; also covers DnD move + extension
    /// change). File: targeted index update (drop old row, index the new path if indexable — an
    /// extension change to a non-indexed type just drops it). Folder (or cross-root): scoped
    /// reconcile of the affected root(s) so the index follows the filesystem (Decision 3/5/6/8).
    pub async fn rename(self: &Arc<Self>, p: RenameParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            let from = WikiAddress::parse(&p.from)?;
            let to = WikiAddress::parse(&p.to)?;
            let to_abs = {
                let store = st.store.read().unwrap();
                store.rename(&p.from, &p.to)?;
                store.registry().resolve(&to)?
            };
            let same_root = from.root == to.root;
            if to_abs.is_dir() || !same_root {
                reconcile_root_now(&st, &from.root)?;
                if !same_root {
                    reconcile_root_now(&st, &to.root)?;
                }
            } else {
                let handle = { st.index.lock().unwrap().handle(&from.root) };
                if let Some(h) = handle {
                    h.writer().delete_document(&from.rest)?;
                }
                index_if_indexable(&st, &to, &to_abs)?;
            }
            Ok(())
        })
        .await
    }

    /// Write a binary file from base64 bytes (`upload`). Stored + listable, never indexed
    /// (binary is not part of the index set). `.mneme/` and traversal are rejected inside
    /// `write_bytes` → `resolve` → `WikiAddress::parse`.
    pub async fn upload(self: &Arc<Self>, p: UploadParams) -> Result<()> {
        let st = Arc::clone(self);
        blocking(move || {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(p.content_base64.as_bytes())
                .map_err(|e| MnemeError::Internal(format!("invalid base64: {e}")))?;
            st.store.read().unwrap().write_bytes(&p.path, &bytes)?;
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
            // `search`. Without these filters there is no index round-trip.
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
            let top_k = p.top_k.unwrap_or(5);
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
                    "embedding model not provisioned (run model_update); \
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
            let (addrs, dirs) = {
                let store = st.store.read().unwrap();
                (store.list(p.path.as_deref())?, store.list_dirs(p.path.as_deref())?)
            };
            // Cap on the absolute depth (slash count) to emit. `depth` is relative to the requested
            // `path`, so add the path's own depth as the base; `None` = unbounded (full subtree).
            // NOTE: we still list the whole subtree and filter here — fine for the local store; a
            // future remote/Azure backend should push this limit into `store.list` to enumerate
            // shallowly instead.
            let max_depth = p.depth.map(|d| {
                let base = p.path.as_deref().map_or(0, |s| s.matches('/').count());
                base + d
            });
            // BTreeMap iterates keys sorted → DFS pre-order (a dir sorts before its children).
            let mut nodes: BTreeMap<String, bool> = BTreeMap::new();
            // Real directories first (incl. empty ones the file paths can't reveal), then files;
            // a file's intermediate path segments only fill gaps a real dir didn't already cover.
            for dir in &dirs {
                nodes.insert(dir.clone(), true);
            }
            for addr in &addrs {
                let segs: Vec<&str> = addr.split('/').collect();
                for i in 1..segs.len() {
                    nodes.entry(segs[..i].join("/")).or_insert(true);
                }
                nodes.insert(addr.clone(), false);
            }
            let entries = nodes
                .into_iter()
                .filter_map(|(path, is_dir)| {
                    let depth = path.matches('/').count();
                    if max_depth.is_some_and(|max| depth > max) {
                        return None;
                    }
                    let name = path.rsplit('/').next().unwrap_or(&path).to_string();
                    Some(TreeEntry {
                        uri: format!("mneme://{path}"),
                        name,
                        is_dir,
                        depth,
                    })
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
                let mut index = st.index.lock().unwrap();
                index.add_root(cfg.clone(), &st.model)?;
                // Index the freshly added root in the **background** and return immediately — a
                // real wiki holds thousands of docs and a synchronous reconcile would outrun the
                // MCP request timeout. Progress is observable via `status.roots[].reindex`.
                index.spawn_reconcile(&cfg.name);
            }
            persist_roots(&st)?;
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
            // Capture the folder before unregistering — registry.remove() drops the config entry.
            let folder = {
                let store = st.store.read().unwrap();
                store
                    .registry()
                    .configs()
                    .iter()
                    .find(|c| c.name == p.root)
                    .map(|c| c.folder.clone())
            };
            {
                st.store.write().unwrap().registry_mut().remove(&p.root)?;
            }
            {
                // Cancels any in-flight reconcile + drops the RootIndex Arc → closes the SQLite DB,
                // so the on-disk index folder can be deleted below.
                st.index.lock().unwrap().remove_root(&p.root)?;
            }
            persist_roots(&st)?;
            // Delete the now-orphaned on-disk index. Best-effort: the index is derived (rebuilt when
            // the folder is re-added), so a failure that outlasts the retry (e.g. a stubborn file
            // lock) is logged to the Mneme log and skipped — the root is unregistered regardless.
            if let Some(folder) = folder {
                let mneme = folder.join(".mneme");
                if mneme.exists() {
                    if let Err(e) = remove_dir_all_retry(&mneme) {
                        tracing::warn!(
                            root = %p.root,
                            dir = %mneme.display(),
                            "removed root but failed to delete index folder: {e}"
                        );
                    }
                }
            }
            Ok(())
        })
        .await
    }

    /// Read or update a root's `include`/`ignore` filters. With both `include` and `ignore`
    /// omitted this is a pure read; otherwise the given list(s) replace the filter(s) (an omitted
    /// one is kept), the globs are validated, the change is applied to the registry + index +
    /// watcher, persisted to `mneme.toml`, and the root reconciled (newly-matching files indexed,
    /// no-longer-matching dropped) — all without a restart.
    pub async fn root_config(self: &Arc<Self>, p: RootConfigParams) -> Result<RootConfigResult> {
        let st = Arc::clone(self);
        blocking(move || {
            // GET — no mutation, no persist, no reconcile.
            if p.include.is_none() && p.ignore.is_none() {
                let store = st.store.read().unwrap();
                let r = store
                    .registry()
                    .get(&p.root)
                    .ok_or_else(|| MnemeError::UnknownRoot(p.root.clone()))?;
                return Ok(RootConfigResult {
                    name: r.name.clone(),
                    folder: r.folder.display().to_string(),
                    include: r.include.clone(),
                    ignore: r.ignore.clone(),
                });
            }

            // SET — resolve effective lists (an omitted field keeps the current value).
            let (new_include, new_ignore, folder) = {
                let store = st.store.read().unwrap();
                let r = store
                    .registry()
                    .get(&p.root)
                    .ok_or_else(|| MnemeError::UnknownRoot(p.root.clone()))?;
                let inc = p.include.clone().unwrap_or_else(|| r.include.clone());
                let ign = p.ignore.clone().unwrap_or_else(|| r.ignore.clone());
                (inc, ign, r.folder.clone())
            };
            // Validate before mutating anything — never persist an unreconcilable config.
            crate::store::walk::validate_filters(&folder, &new_include, &new_ignore)?;

            // Apply to the registry copy, then to the index manager (updates its live config +
            // restarts the watcher) which returns the handle to reconcile.
            let cfg = {
                let mut store = st.store.write().unwrap();
                store
                    .registry_mut()
                    .update_filters(&p.root, new_include.clone(), new_ignore.clone())?
            };
            {
                let mut index = st.index.lock().unwrap();
                index.update_root_filters(&p.root, new_include, new_ignore)?;
                // Re-walk with the new filters in the **background** and return immediately —
                // newly-matching files are indexed and no-longer-matching ones dropped. A large
                // root would outrun the MCP request timeout (and lock the UI) under a synchronous
                // reconcile; progress is observable via `status.roots[].reindex`. Mirrors `add_root`.
                index.spawn_reconcile(&p.root);
            }
            persist_roots(&st)?;

            Ok(RootConfigResult {
                name: cfg.name,
                folder: cfg.folder.display().to_string(),
                include: cfg.include,
                ignore: cfg.ignore,
            })
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
            let model_status = st.build_model_status();
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
        // Already downloading → don't start a parallel download; just report current status.
        if self.model_job.in_flight.swap(true, Ordering::SeqCst) {
            let st = Arc::clone(self);
            return blocking(move || {
                st.build_model_status()
                    .ok_or_else(|| MnemeError::Internal("model status unavailable".to_string()))
            })
            .await;
        }

        // Dispatch the download on a background thread and return immediately — a fresh model is
        // ~340 MB and a synchronous download would outrun the MCP request timeout. Progress is
        // observable via `status.model.download`.
        self.model_job.errored.store(false, Ordering::SeqCst);
        {
            let st = Arc::clone(self);
            let job = Arc::clone(&self.model_job);
            std::thread::spawn(move || {
                let _run = job.run_lock.lock().unwrap_or_else(|p| p.into_inner());
                if let Err(e) = crate::model::provision(&st.model, force) {
                    tracing::warn!("model provision failed: {e}");
                    job.errored.store(true, Ordering::SeqCst);
                }
                job.in_flight.store(false, Ordering::SeqCst);
            });
        }

        // Immediate snapshot (final files still absent → `download.phase = downloading`).
        let st = Arc::clone(self);
        blocking(move || {
            st.build_model_status()
                .ok_or_else(|| MnemeError::Internal("model status unavailable".to_string()))
        })
        .await
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

/// Index the just-written file only when it is part of the **index set** (matches the root's
/// include allowlist). Non-indexable files (binary, non-md text) are stored + listable but never
/// indexed, so the next reconcile — which walks the index set — won't drop a row this write
/// created.
fn index_if_indexable(st: &Arc<ServerState>, wa: &WikiAddress, abs: &Path) -> Result<()> {
    let indexable = {
        let store = st.store.read().unwrap();
        match store.registry().get(&wa.root) {
            Some(r) => crate::store::is_indexable(r, &wa.rest)?,
            None => return Err(MnemeError::UnknownRoot(wa.root.clone())),
        }
    };
    if indexable {
        index_file(st, wa, abs)?;
    }
    Ok(())
}

/// Scoped synchronous reconcile of one root — run after a folder-level mutation (recursive delete,
/// folder/cross-root rename) so the index follows the filesystem. The reconcile drops rows for
/// files no longer present and indexes any new ones, so no per-prefix index surgery is needed. A
/// missing root/handle is a no-op (nothing to reconcile).
fn reconcile_root_now(st: &Arc<ServerState>, root: &str) -> Result<()> {
    let cfg = { st.store.read().unwrap().registry().get(root).cloned() };
    let handle = { st.index.lock().unwrap().handle(root) };
    if let (Some(cfg), Some(handle)) = (cfg, handle) {
        st.jobs
            .reconcile_blocking(&handle, &cfg, &st.embed, CancellationToken::new(), |_| {})?;
    }
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

/// Recursively delete a directory, retrying briefly on a transient lock. On Windows a SQLite handle
/// that was just closed (or a reconcile thread dropping its `Arc` a moment after `remove_root`
/// drained it) can keep the index DB locked for an instant (`os error 32`); a few short retries
/// clear that window. Returns the last error if the lock outlasts the retries.
fn remove_dir_all_retry(dir: &std::path::Path) -> std::io::Result<()> {
    let mut attempt = 0;
    loop {
        match std::fs::remove_dir_all(dir) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) if attempt < 10 && e.raw_os_error() == Some(32) => {
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(e) => return Err(e),
        }
    }
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

/// Max image bytes inlined as a vision block in a tool result (Claude vision is ~5 MB/image).
/// Larger images return a notice instead — they remain readable through the UI's `resources/read`.
const MAX_INLINE_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// Vision-supported image MIME for a path's extension, or `None`. `image/*` only — these are the
/// types a Claude Code MCP client renders as a vision block from a tool result. SVG is omitted on
/// purpose: it is UTF-8 text (handled by the text path) and not a vision MIME.
fn image_mime(rel: &str) -> Option<&'static str> {
    match rel.rsplit('.').next().map(str::to_ascii_lowercase).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

/// True when bytes are not valid UTF-8 or contain a NUL — treat as binary. SVG/mermaid/HTML/JSON
/// are valid UTF-8 and therefore stay on the `read` text path. Mirrors the store's
/// `read_text_or_skip` heuristic (NUL byte) but is also strict about invalid UTF-8.
fn looks_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0) || std::str::from_utf8(bytes).is_err()
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
