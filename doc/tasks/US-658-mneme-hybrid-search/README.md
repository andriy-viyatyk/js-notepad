# US-658 [Phase 2] — Hybrid search (sqlite-vec KNN + RRF)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 2
**Status:** Implemented (Phase 2) — awaiting manual testing. Hermetic suite green (75 tests, 0
warnings on `cargo build --release`); the `#[ignore]` real-model hybrid test passes on DirectML
and the full index → embed → KNN → RRF path plus the C7 backfill were verified end-to-end on CPU
(`gpu="off"`) via `mneme reindex` + `mneme search`.

## Goal

Wire the US-657 embedding engine into the index and search: embed each chunk into the
`chunks_vec` (sqlite-vec) table during indexing, add a vector KNN lane with metadata
pre-filtering, and fuse it with the existing FTS5 lane via Reciprocal Rank Fusion (RRF) so
`wiki_search` finally serves real `vector` and `hybrid` modes. This is the milestone that turns
Mneme from text-only into semantic + hybrid search.

**Out of scope (later Phase-2 tasks):** the dedicated embedding worker, priority queue, WAL
reader pool, cancellable reindex job, and MCP progress notifications are **US-659**. US-658
embeds **inline** under the existing per-root index `Mutex` (slow on a large bulk reindex, fine
incrementally) and US-659 makes it responsive. The `Embedder` API itself does not change.

## Background

### What US-657 already gives us (no changes needed there)

- `src/renderer/...` — N/A; this is the Rust `mneme/` crate.
- `mneme/src/embed/mod.rs` — the `Embedder` trait + `OnnxEmbedder`:
  - `trait Embedder: Send + Sync` with `embed_query(&self, &str) -> Result<Vec<f32>>`,
    `embed_passages(&self, &[&str]) -> Result<Vec<Vec<f32>>>`, `dims() -> usize`,
    `provider() -> &str`. Vectors are **already L2-normalized**, 768-dim.
  - `OnnxEmbedder::load(cfg: &Config) -> Result<Self>` returns `MnemeError::ModelMissing` when
    the model is not provisioned (caller degrades to FTS).
- `mneme/src/index/schema.rs` — `chunks_vec` is **already created** as
  `CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[768])` (`EMBED_DIM = 768`),
  and `register_sqlite_vec()` registers the `vec0` auto-extension on every connection.
  `SCHEMA_VERSION = 1` — **no bump**: US-658 changes no table layout, only populates an
  existing table, so existing DBs are reused (see Concern C7 for the backfill).
- `mneme/src/index/mod.rs::remove_doc_rows` — **already deletes** `chunks_vec` rows by chunk
  rowid on every doc delete/replace, so the delete path is correct the moment we start inserting.

### Index layer as it stands (`mneme/src/index/mod.rs`)

- `IndexDb { conn, root_name, db_path }` — one per root, behind `Arc<Mutex<…>>` (the
  single-writer + single-flight gate).
- `upsert_document(rel, doc, content_hash, mtime, size)` — delete-then-insert in one txn:
  inserts `documents`, `doc_tags`, `chunks` (collecting each `chunk_id = tx.last_insert_rowid()`),
  and `chunks_fts`. **Leaves `chunks_vec` empty today.**
- `search_text(query, filter: &SearchFilter, limit) -> Vec<TextHit>` — FTS5 `MATCH` +
  `bm25()` rank, metadata filters as SQL predicates (subtree prefix, tags include/exclude,
  `created` range), one row per document (best chunk wins the snippet via a `seen` set), with
  an 8× headroom on the SQL `LIMIT` so the per-doc dedup can still fill `limit` docs.
  `TextHit { address, title, tags, snippet, score }` where `score` = bm25 (**lower is better**).
- `SearchFilter { subtree, tags, exclude_tags, created_from, created_to }`.

### Search tool as it stands (`mneme/src/mcp/mod.rs::search`)

- Builds a `SearchFilter` from `SearchParams`, loops the in-scope roots, calls
  `db.search_text(query, &filter, top_k)`, extends a `hits` vec, sorts ascending by bm25,
  truncates to `top_k`.
- `mode` is read but ignored beyond a `note`: `Vector | Hybrid` emit
  `"vector/hybrid search is unavailable until embeddings (US-658)…"` and return text results.
- `ServerState` already carries `embedder: OnceLock<Arc<dyn Embedder>>` + a lazy
  `embedder()` accessor (built in US-657 as the seam for this task). **US-658 replaces that seam
  — see Concern C1 / the `LazyEmbedder` design** — because the *indexer* also needs the embedder,
  not just search.

### Indexer + watcher as they stand

- `mneme/src/indexer/mod.rs`:
  - `index_one(db, rel, abs)` — mtime+size fast-path → content-hash → `upsert`. Returns
    `IndexOutcome { Indexed | Refreshed | Skipped }`.
  - `reindex_file(db, rel, abs)` — like `index_one` but no fast-path (used by `wiki_write`/`edit`).
  - `reconcile_root(db, root)` — walk → `index_one` per file → drop deleted.
  - `IndexManager { roots, dbs: HashMap<String, Arc<Mutex<IndexDb>>>, watchers }` with
    `open`/`start`/`reconcile_root`/`reconcile_all`/`handle`/`add_root`/`remove_root`/
    `start_watchers`/`spawn_deferred_reconcile`.
- `mneme/src/watcher/mod.rs::RootWatcher::start(root, db)` — debounced `notify` watcher that
  calls `reconcile_root(&guard, root)` on change.
- `mneme/src/main.rs` — `Reindex` builds `IndexManager::open(...)`; `Watch`/`Serve` use
  `IndexManager::start(...)`; `Embed` builds an `OnnxEmbedder` directly.

### sqlite-vec mechanics (verified against the bundled `sqlite-vec` crate, vec0 v0.1.x)

- **Insert:** `INSERT INTO chunks_vec(rowid, embedding) VALUES (?1, ?2)` with `rowid = chunk_id`
  and `embedding` bound as a **BLOB of packed little-endian `f32`** (768 × 4 = 3072 bytes).
  vec0 also accepts a JSON `'[…]'` text, but the blob avoids float-formatting cost/precision.
- **KNN:** `SELECT rowid, distance FROM chunks_vec WHERE embedding MATCH ?1 AND k = ?2
  ORDER BY distance` — `MATCH` value is the query vector blob, `k` the neighbour count.
- **Pre-filtered KNN:** vec0 supports a `rowid IN (…)` constraint inside the KNN query — the
  **pre-filter candidate-id strategy** recorded as a known risk in US-651. See Concern C4 for
  the exact approach + fallback if the bundled version rejects it.
- **Distance metric:** vec0 default is L2 (euclidean). Our vectors are L2-normalized, so L2
  ordering is **monotonic with cosine** — the ranking is identical. We keep the default metric
  (no `distance_metric=` change → no schema change → `SCHEMA_VERSION` stays 1). Cosine
  similarity for display = `1 - distance²/2`.

## Implementation plan

### Step 1 — Vector blob + RRF pure helpers (`mneme/src/index/vector.rs`, NEW)

Create a small submodule for the pure, unit-testable pieces (keeps `index/mod.rs` lean):

```rust
//! Vector-lane helpers for hybrid search: f32 blob packing + Reciprocal Rank Fusion.

/// Pack a normalized embedding into the little-endian f32 BLOB sqlite-vec stores/matches.
pub fn to_blob(v: &[f32]) -> Vec<u8> {
    let mut b = Vec::with_capacity(v.len() * 4);
    for x in v { b.extend_from_slice(&x.to_le_bytes()); }
    b
}

/// RRF constant — standard 60 (Cormack et al.). Larger = flatter rank weighting.
pub const RRF_K: f64 = 60.0;

/// Fuse two rankings of the same id space into RRF scores (higher = better).
/// `text_ranked` / `vec_ranked` are doc-ids in best-first order (rank 0 = best).
/// Returns (doc_id, rrf_score) for every doc appearing in either list.
pub fn rrf_merge(text_ranked: &[i64], vec_ranked: &[i64]) -> Vec<(i64, f64)> { … }
```

`rrf_merge`: `score(d) = Σ_lane 1/(RRF_K + rank_lane(d))`, summed over the lanes the doc appears
in. Build a `HashMap<i64, f64>`, return entries sorted by score descending (ties broken by
doc_id for determinism). Unit tests: a doc top-ranked in both lanes beats one ranked in only one;
fusion is symmetric; missing-from-a-lane contributes nothing.

### Step 2 — `IndexDb` vector write path (`mneme/src/index/mod.rs`)

Add `pub mod vector;` and `use crate::embed::Embedder;`. Add three methods:

```rust
/// True if every chunk of `rel_path` already has a chunks_vec row (US-658 backfill check, C7).
pub fn doc_has_vectors(&self, rel_path: &str) -> Result<bool>
```
Implementation: `doc_id_for(rel)`; compare `count(chunks)` vs
`count(chunks_vec WHERE rowid IN (chunk ids))`. No chunks → treat as "has vectors" (nothing to
embed). Returns false if any chunk lacks a vector.

```rust
/// (Re)build chunks_vec rows for one document: read its chunks, embed the texts as passages,
/// replace any existing vec rows. Idempotent. Embedding happens outside the txn; the
/// delete+insert is one txn.
pub fn embed_document_chunks(&self, rel_path: &str, embedder: &dyn Embedder) -> Result<usize>
```
Implementation:
1. `doc_id_for(rel)`; `SELECT id, text FROM chunks WHERE doc_id=? ORDER BY ordinal`.
2. If no chunks → `Ok(0)`.
3. `let vecs = embedder.embed_passages(&texts_as_str_refs)?;` (one batch per document).
4. Guard `vecs[0].len() == EMBED_DIM` else `MnemeError::Embed`.
5. One txn: `DELETE FROM chunks_vec WHERE rowid IN (chunk_ids)`, then for each
   `(chunk_id, vec)`: `INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)` with
   `vector::to_blob(&vec)`. Commit. Return count.

Keep `upsert_document` **embedding-free** — the indexer calls `embed_document_chunks` right after
it (separate, idempotent txn). Rationale in Concern C2.

### Step 3 — `IndexDb` vector + hybrid read path (`mneme/src/index/mod.rs`)

Add a `VecHit` (or reuse `TextHit`) and two methods. Both apply the **same `SearchFilter`** as
`search_text` (pre-filter → candidate chunk-ids → constrained KNN).

```rust
/// Vector KNN lane. Pre-filters candidate chunk-ids by the metadata filter, runs a constrained
/// KNN, collapses to one row per document (nearest chunk wins), best-first by distance.
pub fn search_vector(&self, query_vec: &[f32], filter: &SearchFilter, limit: usize)
    -> Result<Vec<TextHit>>
```
Implementation:
1. Build the candidate-id SQL from `filter` (reuse the exact predicate-building block from
   `search_text` — extract it into a private `fn filter_sql(filter, &mut sql, &mut params, alias)`
   so both lanes share it): `SELECT c.id FROM chunks c JOIN documents d ON d.id=c.doc_id [preds]`.
   If the filter is empty, skip the candidate step (full KNN).
2. KNN: `SELECT v.rowid, v.distance, c.doc_id, c.heading, c.text, d.path, d.title
   FROM chunks_vec v JOIN chunks c ON c.id=v.rowid JOIN documents d ON d.id=c.doc_id
   WHERE v.embedding MATCH ?1 AND k = ?2 [AND v.rowid IN (candidate_ids)] ORDER BY distance`.
   `k = (limit*8).max(limit)` (same dedup headroom as text). MATCH = `to_blob(query_vec)`.
3. Collapse to one `TextHit` per `doc_id` (first/nearest wins), snippet = `snippet_from(heading,
   text)` (new small helper: heading prefix + truncated chunk text, ~200 chars), `score = distance`
   (**lower is better**), `tags = tags_for_doc(doc_id)`. Truncate to `limit`.

```rust
/// Hybrid lane: run text + vector, fuse per-document with RRF. Best-first by RRF score
/// (higher is better).
pub fn search_hybrid(&self, query: &str, query_vec: &[f32], filter: &SearchFilter, limit: usize)
    -> Result<Vec<TextHit>>
```
Implementation:
1. Get a generous ranked list from each lane (`search_text` and `search_vector` at
   `limit` — both already per-document). Map each lane's results to `Vec<doc_id>` (best-first),
   keeping a `HashMap<i64, TextHit>` of the richest hit per doc (prefer the text hit's snippet
   when present, else the vector hit's). Note both lanes return `address`, not `doc_id`, today —
   add `doc_id` to the internal row so fusion can key on it (return `address` still in the public
   `TextHit`; thread `doc_id` via a private struct or extend `TextHit` with a non-serialized
   `doc_id` — see Concern C3).
2. `rrf_merge(text_ids, vec_ids)` → fused (doc_id, rrf). Rebuild hits in fused order, set
   `score = rrf` (higher is better). Truncate to `limit`.

### Step 4 — `LazyEmbedder` shared cell (`mneme/src/embed/mod.rs`)

Replace `ServerState`'s `OnceLock<Arc<dyn Embedder>>` seam with a shared, lazily-built cell that
**both** the search path and the indexer hold (Concern C1). Add to `embed/mod.rs`:

```rust
use std::sync::{Arc, OnceLock};
use crate::config::Config;

/// Lazily builds (once) the process embedder and shares it across the search + index paths.
/// `None` after a build attempt means the model is not provisioned (logged once) — callers
/// degrade to FTS. Built off the startup path (first reconcile or first vector search), so a
/// missing model and text-only mode never pay the model-load cost.
pub struct LazyEmbedder {
    cell: OnceLock<Option<Arc<dyn Embedder>>>,
    config: Config,
}

impl LazyEmbedder {
    pub fn new(config: Config) -> Arc<Self> { … }
    /// Build-once accessor. Returns a clone of the cached Option.
    pub fn get(&self) -> Option<Arc<dyn Embedder>> {
        self.cell.get_or_init(|| match OnnxEmbedder::load(&self.config) {
            Ok(e) => Some(Arc::new(e) as Arc<dyn Embedder>),
            Err(MnemeError::ModelMissing(_)) => { tracing::info!("embedding model not provisioned — FTS-only"); None }
            Err(e) => { tracing::warn!("embedder build failed: {e} — FTS-only"); None }
        }).clone()
    }
}
```

### Step 5 — Thread the embedder through the indexer (`mneme/src/indexer/mod.rs`)

- `IndexOutcome`: add `VectorBackfilled` (skipped content, but vectors were (re)built) so the
  reconcile tally / logs show backfill work. (Optional but cheap; otherwise fold into `Refreshed`.)
- `index_one(db, rel, abs, embedder: Option<&dyn Embedder>)`:
  - `Indexed` branch: after `upsert`, `if let Some(e) = embedder { db.embed_document_chunks(rel, e)?; }`.
  - `Refreshed`/`Skipped` branches: `if let Some(e) = embedder { if !db.doc_has_vectors(rel)? { db.embed_document_chunks(rel, e)?; → VectorBackfilled } }`.
- `reindex_file(db, rel, abs, embedder)` — embed after `upsert` (always, since content changed).
- `reconcile_root(db, root, embedder: Option<&dyn Embedder>)` — pass `embedder` to `index_one`.
- `IndexManager`: add field `embedder: Arc<LazyEmbedder>`; constructors
  `open(roots, model, embedder)` / `start(roots, model, embedder)` take it.
  `reconcile_root`/`reconcile_all`/`spawn_deferred_reconcile` resolve **once** at the top
  (`let emb = self.embedder.get();`) and pass `emb.as_deref()`.
  `start_watchers`/`add_root` pass `Arc::clone(&self.embedder)` to the watcher.

### Step 6 — Watcher (`mneme/src/watcher/mod.rs`)

- `RootWatcher::start(root, db, embedder: Arc<LazyEmbedder>)` — capture it; in
  `reconcile_locked`, resolve `embedder.get()` and pass `.as_deref()` to `reconcile_root`.

### Step 7 — Search tool branches on mode (`mneme/src/mcp/mod.rs`)

- `ServerState`: replace `embedder: OnceLock<Arc<dyn Embedder>>` with `embedder: Arc<LazyEmbedder>`;
  drop the async `embedder()` accessor. `new()` builds `LazyEmbedder::new(cfg.clone())`, passes
  `Arc::clone` to `IndexManager::start`, stores the other clone.
- `index_file` helper (write/edit path): `reindex_file(&handle.lock(), &wa.rest, abs, st.embedder.get().as_deref())`.
- `search`: branch on `p.mode`:
  - `Text` → unchanged (`search_text`, sort ascending bm25).
  - `Vector` / `Hybrid` → resolve `let emb = st.embedder.get();`
    - `None` (no model) → fall back to `search_text` + the existing degrade `note`.
    - `Some(e)` → `let qv = e.embed_query(&p.query)?;` then per root call `search_vector` /
      `search_hybrid`; merge across roots and sort: **Vector → ascending distance**, **Hybrid →
      descending RRF**; truncate `top_k`; `note = None`.
- `SearchHit.score` doc comment: change to "mode-dependent ranking scalar (bm25 lower-better for
  text, cosine distance lower-better for vector, RRF higher-better for hybrid); **results are
  returned best-first — rely on order, not the scalar**." (Concern C5.)

### Step 8 — CLI: embed on reindex + a `search` debug command (`mneme/src/main.rs`)

- `Reindex` / `Watch`: build `let embedder = LazyEmbedder::new(cfg.clone());` and pass to
  `IndexManager::open` / `::start` so the CLI populates vectors (model present) or stays FTS-only.
- Add `Command::Search { query, #[arg(long)] mode: Option<String>, #[arg(long)] top_k: Option<usize> }`
  — opens an `IndexManager`, embeds the query, runs the chosen lane across roots, prints
  `uri / score / snippet`. Mirrors the existing `Embed` debug command; greatly eases manual
  verification without standing up the MCP server. (Optional-but-recommended.)

### Step 9 — README + example config (`mneme/README.md`, `mneme/mneme.example.toml`)

- README status banner → "Phase 2: hybrid search live (`vector`/`hybrid` modes)". Update the
  `wiki_search` line (no longer degrades). Add `mneme search` to the CLI list. Note `chunks_vec`
  is now populated; document the RRF + pre-filtered-KNN approach in the index-layout section.
- No new config keys (gpu/model already exist). Touch `mneme.example.toml` only if a comment
  references the "empty until US-658" state.

### Step 10 — Tests (`mneme/tests/`)

- `mneme/src/index/vector.rs` `#[cfg(test)]`: `rrf_merge` ordering/symmetry, `to_blob` length =
  `dims*4` + round-trip of a known vector.
- `mneme/tests/hybrid_search.rs` (NEW):
  - Hermetic (no model, embedder `None`): reindex a temp root → `chunks_vec` empty; `search_text`
    works; the `search` tool in `Vector`/`Hybrid` mode returns text results + the degrade `note`.
  - `#[ignore]` real-model test (mirror `tests/embed.rs`): provision required; index a tiny root
    of 3–4 docs, assert `chunks_vec` row count == chunk count, a `vector` query returns the
    semantically-closest doc first, and `hybrid` ranks an exact-keyword doc and a paraphrase doc
    both above an unrelated doc. Run with `cargo test --test hybrid_search -- --ignored` after
    `mneme model-update`.

## Concerns / open questions (with proposed resolutions)

**C1 — How does the embedder reach both the indexer and search without a startup penalty or a
double build?** The US-657 seam (`ServerState.embedder: OnceLock<Arc<dyn Embedder>>`) only served
*search*; US-658 also needs it in the *indexer* (deferred reconcile, watcher, CLI). Building it
eagerly in `ServerState::new` would block `serve` readiness by the model-load time (seconds), and
having indexer + search each build their own session would load the model twice.
**Resolution (recommended):** a shared `Arc<LazyEmbedder>` (Step 4) held by both `ServerState`
and `IndexManager`, built **once** on first `get()` — which lands on the deferred-reconcile
thread (~5 s after start, off the startup path) or the first vector search, whichever comes first.
Missing model → cached `None` → FTS-only, no cost. This subsumes the old `OnceLock` seam.

**C2 — Embed inside `upsert_document`'s txn, or as a separate step?** Inside the txn would couple
the (cheap, always-run) chunk write to the (expensive, model-dependent) embedding and bloat the
single write lock hold.
**Resolution:** keep `upsert_document` embedding-free; the indexer calls the idempotent
`embed_document_chunks` immediately after. Two txns, but the embedding step is independently
retriable, reused by the C7 backfill, and trivially skipped when no embedder is configured.

**C3 — RRF needs to fuse on `doc_id`, but `TextHit` only carries the `{root}/{rel}` address.**
**Resolution:** thread `doc_id` internally. Either add a `#[doc(hidden)]`/non-serialized
`doc_id: i64` to the row the lanes build and key fusion on it, or have the private lane helpers
return `(doc_id, TextHit)`. The public `SearchHit` (mcp `results.rs`) is unchanged — `doc_id`
never leaves the index layer. RRF is computed **per root** (ranks are only defined within a lane
of one DB); cross-root results merge by the comparable RRF scalar.

**C4 — Does the bundled `sqlite-vec` accept `rowid IN (…)` inside a KNN query (the pre-filter
candidate-id strategy)?** This is the US-651-recorded known risk.
**Resolution:** implement the `WHERE embedding MATCH ?1 AND k = ?2 AND rowid IN (…)` form first
(vec0 documents it). **Verify at implementation** with the real model test. **Fallback if the
bundled version rejects it:** drop the `rowid IN` clause, over-fetch a larger `k`
(`(limit*8).max(64)`), and post-filter the KNN rows in Rust against the candidate-id `HashSet`
before the per-doc collapse. Either way the public behavior is identical; the fallback is a few
lines and needs no schema change.

**C5 — `SearchHit.score` semantics differ per mode (bm25 vs distance vs RRF), and the directions
disagree (lower vs higher is better).** A client interpreting the scalar across modes would be
misled.
**Resolution:** the contract is **"results are returned best-first"** — clients rely on array
order, not the scalar. Document `score` as a mode-dependent ranking value (per Step 7). This keeps
the existing field/shape (no MCP contract break) and matches how `wiki_search` is already
consumed. (Rejected alternative: normalize every mode to a 0–1 similarity — extra cost, and RRF
has no natural absolute scale.)

**C6 — Distance metric / normalization.** vec0 defaults to L2; we need cosine semantics.
**Resolution:** vectors are L2-normalized by the embedder, so **L2 ordering ≡ cosine ordering** —
keep the default metric (no `distance_metric=` → no schema change → `SCHEMA_VERSION` stays 1).
Display similarity, if ever needed, is `1 - distance²/2`. Verified by the real-model ranking test.

**C7 — Existing indexes have an empty `chunks_vec`, and the mtime+size fast-path will *skip*
already-indexed unchanged docs — so deploying US-658 leaves old docs vector-less until they
change.**
**Resolution:** the `Skipped`/`Refreshed` branches of `index_one` check `doc_has_vectors(rel)`
when an embedder is present and, if missing, run `embed_document_chunks` (a `VectorBackfilled`
outcome). So the first reconcile after the model is provisioned (the deferred startup reconcile,
the watcher, or `mneme reindex`) **backfills vectors for the whole corpus** without re-parsing or
re-hashing, and self-heals after a failed embed. No forced full rebuild, no `SCHEMA_VERSION` bump.

**C8 — Bulk embedding under the per-root index `Mutex` blocks searches on that root and adds a
long synchronous pass to the deferred reconcile.** A first-time index of thousands of chunks is
slow and holds the write lock.
**Resolution:** **accepted for US-658** — this is exactly what **US-659** fixes (dedicated worker
+ priority queue so interactive embeds preempt bulk batches, WAL reader pool so reads aren't
blocked, cancellable job + progress). US-658 keeps the simple inline path under the existing lock;
incremental single-doc embeds (the common case) are fast. Documented as a known limitation; not a
blocker for the milestone.

**C9 — Batch size / very large documents.** `embed_passages` runs a whole document's chunks as
one batch (`PaddingStrategy::BatchLongest` pads to the longest in the batch). A pathological doc
with many large chunks could spike memory.
**Resolution:** documents are heading-chunked at `MAX_CHUNK_CHARS` (~500 tokens), so per-doc
batches are small in practice. Embed **per document** (natural batch boundary); no extra batching
logic for v1. If a memory issue ever appears, cap the batch inside `embed_document_chunks`
(chunk the chunk-list) — a local change, no API impact. (US-659's worker may re-batch globally.)

## Acceptance criteria

- [x] `cargo build --release` is clean (no warnings); `cargo test` (hermetic) green.
- [x] Indexing a root with the model provisioned populates `chunks_vec` (rows == chunk count);
      with no model, `chunks_vec` stays empty and FTS still works.
- [x] `wiki_search { mode: "vector" }` returns the semantically-closest document first; `mode:
      "hybrid"` ranks both an exact-keyword and a paraphrase match above an unrelated doc; `mode:
      "text"` is unchanged. Metadata filters (subtree/tags/date) apply in all modes.
- [x] With no model, `vector`/`hybrid` degrade to text results **with** the explanatory `note`.
- [x] Deploying onto an existing (US-655-era) index and running one reconcile backfills vectors
      for pre-existing docs (C7) — no schema bump, no manual full rebuild. *(Verified: pass 1 no
      model → 2 indexed / 0 vectorized; pass 2 model present, unchanged → 0 indexed / 2 vectorized.)*
- [x] Doc delete/replace removes the doc's `chunks_vec` rows (already wired in `remove_doc_rows`).
- [x] Real-model path verified end-to-end on **DirectML** (`#[ignore]` test) and **CPU**
      (`gpu="off"` via the CLI). The search lanes (KNN + RRF) are EP-independent.

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/src/index/vector.rs` | **NEW** — `to_blob`, `RRF_K`, `rrf_merge` + unit tests |
| `mneme/src/index/mod.rs` | `pub mod vector;` + `doc_has_vectors`, `embed_document_chunks`, `search_vector`, `search_hybrid`; extract shared `filter_sql` + `snippet_from` helpers; internal `doc_id` on lane rows |
| `mneme/src/embed/mod.rs` | **NEW** `LazyEmbedder` shared cell (build-once, FTS-degrade) |
| `mneme/src/indexer/mod.rs` | thread `Option<&dyn Embedder>` through `index_one`/`reindex_file`/`reconcile_root`; `IndexManager` holds `Arc<LazyEmbedder>`; `VectorBackfilled` outcome; backfill in skip/refresh branches |
| `mneme/src/watcher/mod.rs` | `RootWatcher::start(root, db, Arc<LazyEmbedder>)`; resolve + pass embedder into reconcile |
| `mneme/src/mcp/mod.rs` | `ServerState.embedder: Arc<LazyEmbedder>` (replaces `OnceLock` + async accessor); `search` branches on mode (vector/hybrid lanes + RRF cross-root merge); `index_file` passes embedder; `SearchHit.score` doc note |
| `mneme/src/main.rs` | `Reindex`/`Watch` build + pass `LazyEmbedder`; add `Command::Search` debug command |
| `mneme/tests/hybrid_search.rs` | **NEW** — hermetic (no-model degrade + empty vec) + `#[ignore]` real-model ranking test |
| `mneme/README.md` | status banner, `wiki_search` no-longer-degrades, `mneme search`, index-layout RRF/KNN note |
| `doc/active-work.md`, `doc/epics/EPIC-032.md` | link US-658 to this doc; epic row → in progress |

## Files that need NO changes

- `mneme/src/index/schema.rs` — `chunks_vec` + `EMBED_DIM` + `register_sqlite_vec` already exist;
  **no `SCHEMA_VERSION` bump** (no table-layout change).
- `mneme/src/index/path.rs` — model-id/versioned-path logic unaffected.
- `mneme/src/markdown/*` — chunking is the embed unit as-is.
- `mneme/src/mcp/params.rs` — `SearchParams` (`mode`, `topK`, filters, `ext`) already complete.
- `mneme/src/mcp/results.rs` — `SearchHit`/`SearchResult` shape unchanged (only a doc comment).
- `mneme/src/mcp/server.rs` — the rmcp adapter calls `ServerState::search` unchanged.
- `mneme/src/model/*` — provisioning + status unchanged.
- `mneme/Cargo.toml` — `ort`, `tokenizers`, `sqlite-vec`, `rusqlite` already present; **no new deps**.
- `mneme/src/store/*`, `config.rs`, `error.rs` — unaffected (`MnemeError::Embed`/`ModelMissing`
  already exist).

## Implementation notes (deviations from the plan)

Implemented as planned, with these refinements:

1. **`wiki_search` default mode → `hybrid`** (`mcp/params.rs`). The plan left the default as
   US-655's `text`; the epic's MCP-surface contract specifies default `hybrid`, and now that
   hybrid degrades cleanly with no model, the default was moved to `Hybrid` to match. (The mcp
   tests set `mode` explicitly, so they were unaffected.)
2. **Empty-candidate short-circuit.** `vector_lane` returns `[]` immediately when a metadata
   filter matches zero chunk-ids — avoids an `IN ()` KNN. (Not in the plan; trivially correct.)
3. **Hermetic test isolation.** Wiring the shared embedder into `ServerState`/`IndexManager`
   meant the existing `tests/mcp.rs` + `tests/indexer.rs` would have loaded the *real* model from
   the default cache on a dev machine. Fixed by pointing those test configs' `model.path` at an
   empty temp dir → embedder resolves to `None` → FTS-only, hermetic. (Discovered during testing;
   not anticipated in the plan.)
4. **`ReconcileStats.vectorized` + `ReindexRoot.vectorized` + CLI column.** The `VectorBackfilled`
   outcome is surfaced as a `vectorized` count in the reconcile tally, the MCP `wiki_reindex`
   result, and the `mneme reindex` CLI line — so backfill progress is visible.
5. **No `rowid IN` fallback needed.** C4's fallback (over-fetch + Rust post-filter) was not
   required: `sqlite-vec` 0.1.9 accepts `WHERE embedding MATCH ? AND k = ? AND rowid IN (…)`,
   verified by the real-model test with filters.

### Verification record

- `cargo build --release`: clean, **0 warnings**. `cargo test`: **75 passed, 0 failed** (+2
  `#[ignore]` real-model tests).
- `cargo test --test hybrid_search -- --ignored` (DirectML): passes — vector lane never ranks the
  recipe first; hybrid keeps the subscription doc above the recipe.
- CPU (`gpu="off"`) via CLI on a 3-doc temp wiki: hybrid ranked `subscription.md` (RRF 0.0167) >
  `cancel.md` (0.0164) > `recipe.md` (0.0161).
- C7 backfill: pass 1 (empty model cache) → `2 indexed, 0 vectorized`; pass 2 (real model,
  content unchanged) → `0 indexed, 2 vectorized`.
