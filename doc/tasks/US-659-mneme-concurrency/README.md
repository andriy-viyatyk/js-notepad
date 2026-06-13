# US-659 — Mneme concurrency & responsiveness (embedding worker, WAL reader pool, cancellable reindex job)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 2 (final task)
**Status:** Implemented (Phase 2 complete) — awaiting manual testing. Hermetic suite green; verified end-to-end on DirectML and CPU (real-model `#[ignore]` test + CLI). Landed as Pieces A→B→C→D per C1; `wiki_reindex` is long-call-with-progress per C2.
**Depends on:** US-657 (embedding engine, `Embedder`/`LazyEmbedder`), US-658 (vectors written to `chunks_vec`; inline embedding under the per-root lock).

## Goal

Make Mneme stay responsive during a large (re)index. Today every embedding runs **inline under the per-root index `Mutex`**, so a same-root search or edit blocks for the entire bulk reindex. US-659 introduces the three mechanisms D17 / US-651's *Concurrency & responsiveness model* call for:

1. **A dedicated embedding worker thread + priority queue** — ONNX inference moves off the request/reconcile path onto one worker that owns the model session; interactive embeds (a search query, a just-edited doc) preempt *queued* bulk reindex batches.
2. **SQLite WAL + single writer + read-only connection pool** — searches/reads run concurrently with reindex writes instead of serializing behind the writer.
3. **Reindex as a cancellable background job** — `wiki_reindex` (and the watcher / deferred startup reconcile) run through a `JobManager` with **MCP progress notifications**, **cancellation**, **bounded-queue backpressure**, and **single-flight per root**.

Net target: edits are a quick high-priority write + single-doc embed; searches are a high-priority query embed + WAL read; cross-root work is already isolated (per-root DBs); the bulk job yields the embedder between small batches.

## Background — current code (after US-658)

> All paths under `mneme/`. Line numbers are anchors at investigation time (2026-06-13), not contracts.

### Concurrency model as-is

- **One `Connection` per root**, held directly in `IndexDb` (`src/index/mod.rs:31`), **not** internally locked — `IndexDb` methods take `&self`. WAL is **already on**: `conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")` (`src/index/mod.rs:121`). No `busy_timeout`/`synchronous` pragma set.
- **The sole serializer is the per-root `Arc<Mutex<IndexDb>>`** in `IndexManager.dbs: HashMap<String, Arc<Mutex<IndexDb>>>` (`src/indexer/mod.rs:206`). Both reads and writes take this one lock, so reads serialize against the writer even though WAL would allow concurrency.
- **`sqlite-vec` is a process-global auto-extension** (`src/index/schema.rs:24`, `register_auto_extension`) — **every** new `Connection` automatically has `vec0`, including future read-only pool connections. ✅ (verified — no per-connection registration needed for KNN on pooled readers.)
- **Embedding runs inline, inside the lock.** `IndexManager::reconcile_root` (`src/indexer/mod.rs:238`) locks the DB, then the free `reconcile_root(db, cfg, embedder)` (`src/indexer/mod.rs:159`) calls `index_one` (`:65`) per file, which calls `db.embed_document_chunks(rel, e)` (`:89`). `embed_document_chunks` (`src/index/mod.rs:531`) embeds the batch **outside** its insert txn but **inside** the held per-root lock. So the lock is held for the whole walk + all ONNX inference.
- **`OnnxEmbedder` serializes inference behind `Mutex<Session>`** (`src/embed/mod.rs:57`). `LazyEmbedder` (`src/embed/mod.rs:227`) builds the model once on first `get()` and caches `Option<Arc<dyn Embedder>>` (`None` = not provisioned → FTS-only). An `Arc<LazyEmbedder>` is shared by `ServerState` and `IndexManager`.
- **MCP tool bodies run via `blocking()`** = `tokio::task::spawn_blocking` (`src/mcp/mod.rs:599`). `ServerState` (`src/mcp/mod.rs:41`) holds `store: RwLock<DocumentStore>`, `index: Mutex<IndexManager>`, `embedder: Arc<LazyEmbedder>`.
- **`wiki_reindex` is fully synchronous** (`ServerState::reindex`, `src/mcp/mod.rs:434`): loops target roots, locks each DB, runs `reconcile_root`, returns `ReindexResult { roots: Vec<ReindexRoot{scanned,indexed,refreshed,skipped,vectorized,deleted,errors}> }`. No background job, no progress, no cancellation.
- **Watcher** (`src/watcher/mod.rs`): `RootWatcher::start(root, db, embedder)` (`:42`); debounced handler → `reconcile_locked` (`:76`) locks the DB and runs `reconcile_root` (embedding inline). `.mneme/` self-trigger guard at `:90` (essential — WAL writes `*.db-wal`/`*.db-shm` inside the watched tree).
- **Deferred startup reconcile**: `IndexManager::spawn_deferred_reconcile` (`src/indexer/mod.rs:309`) spawns a `std::thread` that, after `RECONCILE_DELAY`, reconciles all roots (locks each).
- **CLI** (`src/main.rs`): `Reindex` (`:122`) runs reconcile synchronously and prints only final stats — no per-file progress; `Watch` (`:140`) starts the manager and parks; `Search` (`:206`) opens DBs and queries.

### rmcp 1.7 facts (verified against the vendored crate)

- A `#[tool]` handler may take injected params `meta: Meta` and `peer: Peer<RoleServer>` **or** a single `ctx: RequestContext<RoleServer>`. `RequestContext` (`rmcp-1.7.0/src/service.rs:654`) exposes:
  - `ct: CancellationToken` — a `tokio_util::sync::CancellationToken` that fires when the client sends `notifications/cancelled` **or** the request times out. ✅ This is our reindex cancel signal.
  - `meta: Meta` — `meta.get_progress_token() -> Option<ProgressToken>` (only present if the client opted into progress).
  - `peer: Peer<RoleServer>` — `peer.notify_progress(ProgressNotificationParam { progress_token, progress: f64, total: Option<f64>, message: Option<String> }).await`.
- Canonical pattern in `rmcp-1.7.0/tests/test_progress_subscriber.rs`. Progress is **opt-in per request**: no client `progressToken` → no notifications (the tool still runs and returns its result). The server cannot invent a token — so the design's `progressToken = "reindex:{root}"` is reinterpreted below (C6).

## Architecture of the change

Three interlocking pieces. They can land as **three internal commits** (recommended — see C1), but ship as one task US-659.

```
                 interactive lane (unbounded)  ─┐
search query embed ───────────────────────────►│   ┌───────────────────────┐
edit single-doc embed ─────────────────────────►│   │  EmbedWorker (1 thread)│
                                                 ├──►│  owns Arc<dyn Embedder>│──► Vec<f32>
reconcile bulk batches ─► bulk lane (bounded N) ─┘   │  drains interactive    │   replies (sync
        (backpressure)                               │  first, then 1 bulk    │   oneshot)
                                                     └───────────────────────┘
RootIndex per root:  writer: Mutex<WriterDb>  +  readers: ReadPool (N read-only conns, WAL)
JobManager per root: CancellationToken + progress snapshot + single-flight/coalesce
```

## Implementation plan

### Piece A — Embedding worker + priority queue  (`src/embed/worker.rs`, new)

Everything that embeds today runs inside `spawn_blocking` (sync), so the worker uses **sync channels** end-to-end — no tokio plumbing.

1. **Add deps** (`Cargo.toml`): `crossbeam-channel = "0.5"` (priority `select!` + bounded backpressure) and `tokio-util = { version = "0.7", features = ["rt"] }` (for `CancellationToken`, already pulled transitively by rmcp — make it direct).
2. **Job + handle types** in `src/embed/worker.rs`:
   ```rust
   enum Priority { Interactive, Bulk }
   struct EmbedJob { texts: Vec<String>, kind: EmbedKind, reply: crossbeam_channel::Sender<Result<Vec<Vec<f32>>>> }
   #[derive(Clone)]
   pub struct EmbedHandle { interactive: Sender<EmbedJob>, bulk: Sender<EmbedJob>, state: Arc<AtomicU8> /* Unknown|Present|Absent */ }
   pub struct EmbedWorker { join: JoinHandle<()> }
   ```
3. **`EmbedWorker::start(lazy: Arc<LazyEmbedder>) -> (EmbedWorker, EmbedHandle)`** — spawns one OS thread. `interactive` = unbounded; `bulk` = `bounded(BULK_QUEUE = 8)` (backpressure). The thread resolves `lazy.get()` **on first job** (keeps the model off the `serve` startup path, preserving US-657/658's deferred-load), records `Present`/`Absent` in `state`, then loops:
   ```rust
   loop {
       // interactive preempts queued bulk
       let mut served = false;
       while let Ok(job) = interactive.try_recv() { run(&emb, job); served = true; }
       if served { continue; }
       crossbeam_channel::select! {
           recv(interactive_rx) -> j => run(&emb, j?),  // run() = embed + send reply
           recv(bulk_rx)        -> j => run(&emb, j?),
       }
   }
   ```
   This guarantees the interactive-latency floor is **one in-flight bulk batch** (matches US-651). `run` calls `emb.embed_passages`/`embed_query`; if `emb` is `None`, replies with `Ok(vec![])` tagged absent (callers degrade).
4. **`EmbedHandle` API** (called from sync `spawn_blocking` contexts):
   - `embed_query(&self, text: &str) -> Result<Option<Vec<f32>>>` — submit on **interactive**, block on reply; `None` = no model (search falls back to text).
   - `embed_passages(&self, texts: &[&str], pri: Priority) -> Result<Option<Vec<Vec<f32>>>>` — `Bulk` for reconcile, `Interactive` for a single just-edited doc; `None` = no model (skip embedding).
   - `available(&self) -> Option<bool>` — `state` snapshot (`None` while Unknown) for cheap pre-checks.
5. **Replace the `Option<&dyn Embedder>` seam** introduced in US-658 with `&EmbedHandle` threaded through `indexer` + `watcher` (the handle internally encodes presence, so no more `Option` plumbing). `embed_document_chunks` (`src/index/mod.rs:531`) changes from taking `&dyn Embedder` to taking `&EmbedHandle` (or, after Piece B, is split into "collect chunk texts" + "write vectors" so the worker submit happens in the reconcile loop — see Piece C step 4).

### Piece B — WAL writer + read-only reader pool  (`src/index/mod.rs`, `src/index/pool.rs` new)

Goal: reads stop taking the writer lock. Split each root's DB into one writer + a small pool of read-only connections on the same file.

1. **Set `busy_timeout` + `synchronous=NORMAL`** on every connection (writer and readers) right after open (`src/index/mod.rs:121` and the new pool): `PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;` (NORMAL is the WAL-recommended durability/perf point; busy_timeout absorbs the rare checkpoint contention).
2. **`ReadPool`** (`src/index/pool.rs`): `bounded(READ_POOL = 4)` crossbeam channel pre-filled with `Connection::open_with_flags(db_path, SQLITE_OPEN_READ_ONLY | SQLITE_OPEN_NO_MUTEX)` connections (vec0 auto-extension applies automatically). `with<R>(&self, f: impl FnOnce(&Connection) -> R) -> R` checks one out (`recv`), runs `f`, returns it (RAII guard `Drop` → `send` back). All read connections see WAL-committed snapshots.
3. **Make read methods connection-generic.** The read-only methods on `IndexDb` — `meta`, `doc_count`, `doc_state`, `all_doc_paths`, `doc_has_vectors`, `search_text`/`search_fts`, `search_vector`, `search_hybrid`, and the private `text_lane`/`vector_lane`/helpers — become **free functions taking `conn: &Connection`** (or methods on a thin `Reader<'_>(&Connection)`), so both the writer connection and pooled readers can run them. Mutating methods (`upsert_document`, `delete_document`, `update_doc_stat`, and the new vector-write from Piece C) stay on the writer.
4. **Introduce `RootIndex`** (replaces the bare `Arc<Mutex<IndexDb>>`):
   ```rust
   pub struct RootIndex { writer: Mutex<IndexDb>, readers: ReadPool, db_path: PathBuf, root_name: String }
   impl RootIndex {
       pub fn open_or_create(name,&folder,&model) -> Result<Self>   // opens writer + fills pool
       pub fn read<R>(&self, f: impl FnOnce(&Connection)->R) -> R    // pooled read
       pub fn writer(&self) -> MutexGuard<'_, IndexDb>               // serialized write
       pub fn db_path(&self) -> &Path
   }
   ```
   `IndexManager.dbs` becomes `HashMap<String, Arc<RootIndex>>`; `handle()` returns `Arc<RootIndex>`.
5. **Update read call sites** to `root.read(|c| search_*(c, ...))` and write call sites to `root.writer()`:
   - `src/mcp/mod.rs`: `search` (`:186` — reads), `status` (`:465` — `meta`/`doc_count`/`db_path` reads), `reindex` (writer), `index_file`/`add_root` (writer).
   - `src/main.rs`: `Search` (`:206` — reads), `Reindex`/`Watch` (writer via reconcile).

### Piece C — JobManager: cancellable, progress-emitting, single-flight reindex  (`src/indexer/job.rs` new + reconcile rewrite)

1. **`ReindexProgress`** (`src/index/mod.rs` or a shared `types`): `{ processed: usize, total: usize, phase: Phase /* Scanning|Embedding|Done|Cancelled|Error */ }`, shared as `Arc<Mutex<ReindexProgress>>`.
2. **`JobManager`** (`src/indexer/job.rs`): `jobs: Mutex<HashMap<String /*root*/, JobSlot>>` where `JobSlot { cancel: CancellationToken, progress: Arc<Mutex<ReindexProgress>>, rerun: bool }`.
   - `reconcile(root: Arc<RootIndex>, cfg, &EmbedHandle, external_cancel: CancellationToken, on_progress: impl FnMut(&ReindexProgress)) -> Result<ReconcileStats>`:
     - **Single-flight/coalesce:** if a slot for `root.name` exists (running), set `rerun = true` and return early (the in-flight job will re-reconcile once on finish — coalesces a burst of watcher events). Else insert a slot.
     - Link `external_cancel` (from `ctx.ct` or the watcher/shutdown token) to the slot's `cancel` via a child token.
     - Run the reconcile loop (step 4). On completion, if `rerun` was set, loop once more. Remove the slot.
   - `progress_for(root) -> Option<ReindexProgress>` for `wiki_status`.
3. **Reconcile loop rewrite** (`src/indexer/mod.rs` — `reconcile_root` becomes job-driven; embedding moves off the writer lock):
   - **Phase 1 — Scan/parse/upsert (writer, brief locks).** Walk via `walk_root`. For each file: mtime+size fast-path against `doc_state` (a **pooled read**, no writer lock); changed/new → parse + `writer().upsert_document(...)`. Collect a work-list of `(rel_path, Vec<(chunk_id, text)>)` for chunks needing vectors (new docs + US-658 backfill where `doc_has_vectors` is false). Drop deleted docs (writer). Bump `progress.processed` per file scanned; emit progress. **Check `cancel` between files.**
   - **Phase 2 — Embed + write vectors (worker + batched writer commits).** Stream the work-list in batches of `EMBED_BATCH = 32`: `embed_handle.embed_passages(&texts, Priority::Bulk)?` (blocks on the worker; **backpressure** comes from the bounded bulk lane). For each returned batch, take `writer()` briefly and insert the `chunks_vec` rows in **one small txn** (this is the only place the writer lock is held during embedding — tens of ms). Commit every batch so progress is durable + readers see vectors incrementally (WAL). **Check `cancel` between batches** → stop cleanly, set `phase = Cancelled`, return partial `ReconcileStats` (already-committed vectors persist; the next reconcile backfills the rest — idempotent via `doc_has_vectors`).
   - Result: the writer lock is now held only for short upserts and short per-batch vector inserts; **ONNX inference happens on the worker, off the lock**, so same-root reads (pooled) and edits (brief writer) interleave.
4. **Split `embed_document_chunks`** (`src/index/mod.rs:531`): into `chunk_texts_for(conn, rel) -> Vec<(i64,String)>` (read) + `write_chunk_vectors(writer, &[(chunk_id, Vec<f32>)])` (write). The reconcile loop owns the embed call (so it can batch across documents and respect priority/cancel). The single-doc edit path (`index_file`, `reindex_file`) uses `Priority::Interactive` for its one small batch.
5. **`wiki_reindex` → progress-emitting long call** (`src/mcp/server.rs:134` + `ServerState::reindex` `src/mcp/mod.rs:434`):
   - Change the tool signature to `async fn wiki_reindex(&self, Parameters(p): Parameters<ReindexParams>, ctx: RequestContext<RoleServer>)`.
   - Pass `ctx.ct` (cancel) + `ctx.meta.get_progress_token()` + `ctx.peer` into `ServerState::reindex`. Run the reconcile on `spawn_blocking`; bridge progress to the async peer via a `std::sync::mpsc` (or `crossbeam`) drained by a `tokio::select!` that also watches `ctx.ct`. On each progress tick, if a token is present, `peer.notify_progress(ProgressNotificationParam { progress_token, progress: processed as f64, total: Some(total as f64), message: Some(format!("{root}: {phase}")) })`. Return the final `ReindexResult` (unchanged shape) when done — so non-progress clients (and the existing tests) are unaffected.
6. **Route watcher + deferred reconcile through the JobManager** so they get single-flight/coalesce + observable progress: `RootWatcher` and `spawn_deferred_reconcile` call `JobManager::reconcile` with the **server/watcher cancel token** and no progress token (progress observable only via `wiki_status`). `ServerState` owns the `Arc<JobManager>` and the server-shutdown `CancellationToken`.
7. **`wiki_status` reports reindex progress** (`src/mcp/mod.rs:465`, `src/mcp/results.rs`): add `reindex: Option<ReindexProgressDto>` to `StatusRoot` (`{ processed, total, phase }`), populated from `JobManager::progress_for(root)`.

### Piece D — CLI + fixups

1. **`mneme reindex`** (`src/main.rs:122`): construct an `EmbedWorker` + `JobManager`, run the reconcile with an `on_progress` that prints a `\r`-updating `processed/total` line to **stderr** (stdout stays reserved — crate invariant). Final stats unchanged.
2. **`mneme search`/`embed`/`watch`** (`src/main.rs`): build an `EmbedWorker` and pass its `EmbedHandle` where `Option<&dyn Embedder>` / `LazyEmbedder::get()` was used.
3. **Fix the stale server instructions string** (`src/mcp/server.rs:26` `INSTRUCTIONS`): it still says *"This instance runs in TEXT-SEARCH mode — … semantic/vector search is not yet enabled."* — wrong since US-658. Update to describe hybrid/vector availability (degrades to text when no model). *(Carried here because it's the same surface; strictly a US-658 doc-string miss.)*

### Tests

- `src/embed/worker.rs` unit tests (no model needed): interactive job preempts queued bulk (enqueue several bulk, then one interactive, assert interactive reply arrives before the remaining bulk run — use a fake `Embedder` that sleeps); bounded bulk lane blocks the producer when full (backpressure); `available()` reports `Absent` when `LazyEmbedder` resolves `None`.
- `src/index/pool.rs` unit test: a pooled read runs concurrently with a held `writer()` lock (spawn a writer-lock holder, assert a `read()` returns without waiting); KNN works on a pooled read connection (vec0 present).
- `tests/concurrency.rs` (new, hermetic, no model): start a `JobManager` reconcile on a temp root with no model; assert single-flight coalescing (two concurrent `reconcile` calls → one runs, one coalesces); assert a `CancellationToken` cancel mid-scan yields `phase = Cancelled` and partial stats.
- `tests/concurrency.rs` `#[ignore] real_*` (real model): a bulk reindex of N docs stays cancellable and a concurrent `search_text` returns promptly while it runs; cancel leaves a consistent partial index that a follow-up reconcile completes (idempotent backfill).
- Existing suites: update `tests/indexer.rs`, `tests/index_search.rs`, `tests/mcp.rs`, `tests/hybrid_search.rs` for the `Arc<RootIndex>` handle + `&EmbedHandle` signatures (mechanical). Keep them hermetic (temp `model.path`).
- `cargo build --release` (0 warnings) + `cargo test` green; DirectML + CPU spot-check of the `#[ignore]` real test.

## Concerns / open questions (with proposed resolutions)

**C1 — Scope: this is the heaviest Phase-2 task; phase it internally. (Recommended)**
Three independent subsystems (worker, reader pool, job/progress) each touch many call sites. Proposed: implement and commit in the order **A (worker) → B (reader pool) → C (job/progress) → D (CLI/fixups)**, each independently testable and green before the next. A is self-contained (new module + reseat the US-658 `Option<&dyn Embedder>` seam). B is the riskiest refactor (every read/write call site). C depends on A+B. This keeps each diff reviewable and lets manual testing be scoped. *Recommendation: yes, phase it; keep US-659 as one dashboard entry, land as ~4 commits.* **Needs your ok.**

**C2 — `wiki_reindex`: long-call-with-progress vs fire-and-forget job. (Recommended: long-call-with-progress)**
MCP's progress model (and rmcp's) is a request that **stays open and emits progress, then returns its result**; cancellation arrives as `notifications/cancelled` on that request → `ctx.ct`. This keeps `ReindexResult`'s shape and contract intact (existing tests/clients unaffected), gives real cancellation for free, and still satisfies "background job" because the heavy work runs on `spawn_blocking` and the watcher/deferred reconciles run independently through the same `JobManager`. The alternative (return a job id immediately, poll via `wiki_status`, separate `wiki_reindex_cancel` tool) adds surface and a polling protocol for no near-term gain. *Recommendation: long-call-with-progress; `wiki_status` still exposes progress for the non-request-bound (watcher/startup) jobs.* **Needs your ok.**

**C3 — Read-only pool size + write-during-search.** A pooled reader sees the last WAL-committed snapshot; an in-progress reindex batch isn't visible until its small txn commits (every 32 chunks) — i.e. **eventually consistent**, exactly as US-651 describes ("returns whatever is indexed so far"). *Proposed:* `READ_POOL = 4`, `BULK_QUEUE = 8`, `EMBED_BATCH = 32` as named constants (tunable; personal-scale). No correctness issue — search during reindex returns committed-so-far results.

**C4 — Bulk-queue backpressure can stall the writer's scan phase.** If the worker is slow (CPU EP) and the bounded bulk lane fills, the reconcile producer blocks on `bulk.send` — fine (that's the intended backpressure, bounds memory), but it must **not** hold the writer lock while blocked. *Proposed:* Phase 1 (scan/upsert) and Phase 2 (embed/write) are separate passes; the producer holds the writer lock only for each brief upsert/insert and **releases it before blocking on `bulk.send`**. Verified-by-design in the loop structure above (embed submit happens outside any `writer()` guard).

**C5 — Single-flight coalescing vs a needed re-run.** A watcher event arriving mid-reindex must not be lost. *Proposed:* the `rerun` flag on the `JobSlot` — any reconcile request for a root with a running job sets `rerun = true`; the running job, on finish, re-reconciles once if `rerun`. This coalesces a burst into exactly one extra pass (the mtime+size fast-path makes the extra pass cheap). A `wiki_reindex` issued during a watcher reconcile thus *joins* the in-flight work and returns when the (possibly re-run) job settles.

**C6 — `progressToken` ownership: design said `"reindex:{root}"`, but MCP tokens are client-supplied.** The server can't mint a token; it echoes the client's (`ctx.meta.get_progress_token()`), present only if the client opted in. *Proposed resolution:* (a) MCP progress uses the **client token** when present; the **root + phase go in the `message` field** (`"work: Embedding"`) so a single token still disambiguates which root. (b) The internal, always-on progress channel keyed by root is `wiki_status.reindex` / a future `mneme://status` resource — that's where the `"reindex:{root}"` keying actually lives. Updates US-651's progress-payload note accordingly (record as an amendment, per the cross-cutting-amendment rule).

**C7 — Cancellation granularity & partial-index safety.** `ctx.ct` cancels between files (Phase 1) and between batches (Phase 2), never mid-batch (one in-flight ONNX batch completes — the same floor as interactive latency). *Proposed:* on cancel, commit nothing further, set `phase = Cancelled`, return the partial `ReconcileStats`. Safety holds because vector writes are idempotent and gated by `doc_has_vectors` (US-658 backfill): a follow-up reconcile finishes exactly the un-embedded remainder — no rebuild, no double-write. Document-row upserts already committed are correct on their own (FTS works without vectors).

**C8 — One worker for all roots vs per-root.** One model session in memory; a single GPU serializes regardless. *Proposed:* **one** process-wide `EmbedWorker` (matches US-651 "a single worker owns the model session"). Per-root DBs already isolate the *storage* contention; the embedder is the one shared, serial resource, and the priority queue is what keeps it responsive. No per-root workers.

**C9 — `tokio_util::CancellationToken` as the job cancel type.** Using rmcp's own cancel type (`ctx.ct` is `tokio_util::sync::CancellationToken`) lets the reindex token compose directly with the MCP request token and the server-shutdown token via `child_token()`. The reconcile loop (sync, on `spawn_blocking`) polls `token.is_cancelled()` between files/batches. *Proposed:* add `tokio-util` as a direct dep (already transitive via rmcp) — no new dependency tree.

**C10 — `notify`/watcher writes vs the reader pool.** Read-only connections never write WAL, so they can't trigger the `.mneme/` self-trigger guard; only the writer does, and the guard already excludes `.mneme/`. No change to the watcher guard needed. (Noted to confirm the pool doesn't widen the watched-write surface — it doesn't.)

## Acceptance criteria

- [x] A dedicated embedding worker thread owns the model session; all query/passage embeds go through `EmbedHandle`; interactive embeds preempt queued bulk batches (unit-tested — `interactive_preempts_queued_bulk`).
- [x] Bulk embedding uses a bounded queue (backpressure); producer never holds the writer lock while blocked on the queue (verified by the two-phase loop structure — embed submit happens outside any `writer()` guard).
- [x] Each root DB has a single writer + a read-only WAL connection pool; searches/reads no longer take the writer lock; a read returns while the writer lock is held (unit-tested — `read_does_not_block_on_held_writer`); KNN works on a pooled read connection (vec0 auto-extension).
- [x] Reindex runs as a cancellable job: `wiki_reindex` emits MCP progress (when the client sends a `progressToken`) and honors `ctx.ct` cancellation; cancel mid-run leaves a consistent partial index that a follow-up reconcile completes (real-model test `real_reindex_is_cancellable_completable_and_reads_stay_responsive`).
- [x] Single-flight per root: concurrent reconcile requests coalesce (no parallel same-root reconcile); a watcher event mid-run triggers exactly one extra pass (`rerun` flag; `coalesced_reconcile_is_idempotent`).
- [x] `wiki_status` reports per-root reindex progress (`processed/total/phase`) via `ReindexProgressDto`.
- [x] Watcher + deferred startup reconcile route through the `JobManager` (coalesced).
- [x] `mneme reindex` prints live progress to stderr; stdout reserved (verified on the CPU run).
- [x] Stale `INSTRUCTIONS` text-search-mode string fixed.
- [x] `cargo build --release` clean (0 warnings); `cargo test` green (12 lib + integration suites); `#[ignore]` real-model concurrency + hybrid tests pass on DirectML and CPU.
- [x] `mneme/README.md` Phase-2 banner updated to "complete" (worker/WAL/job live) + new Concurrency section + module layout; US-651 progress-payload note amended (C6); EPIC-032 + `doc/active-work.md` updated.

## Files changed (planned)

| File | Change |
|------|--------|
| `mneme/Cargo.toml` | add `crossbeam-channel`, direct `tokio-util` (CancellationToken) |
| `mneme/src/embed/worker.rs` | **new** — `EmbedWorker`, `EmbedHandle`, priority queue, `run` loop + unit tests |
| `mneme/src/embed/mod.rs` | export `worker`; `LazyEmbedder` consumed by the worker (resolve-on-first-job) |
| `mneme/src/index/pool.rs` | **new** — `ReadPool` (read-only WAL connection pool) + unit test |
| `mneme/src/index/mod.rs` | `RootIndex` (writer + pool); read methods → connection-generic free fns; split `embed_document_chunks` into `chunk_texts_for` + `write_chunk_vectors`; busy_timeout/synchronous pragmas |
| `mneme/src/index/schema.rs` | (no change expected — `register_auto_extension` already covers pooled readers) |
| `mneme/src/indexer/job.rs` | **new** — `JobManager`, `JobSlot`, single-flight/coalesce, `ReindexProgress` |
| `mneme/src/indexer/mod.rs` | reconcile rewrite (2-phase: scan/upsert → batched embed/write, cancel checks, progress); `IndexManager.dbs: HashMap<String, Arc<RootIndex>>`; thread `&EmbedHandle`; deferred reconcile via `JobManager` |
| `mneme/src/watcher/mod.rs` | `RootWatcher::start(... , EmbedHandle, JobManager, CancellationToken)`; reconcile via `JobManager` |
| `mneme/src/mcp/mod.rs` | `ServerState` gains `embed: EmbedHandle`, `jobs: Arc<JobManager>`, shutdown `CancellationToken`; `reindex` becomes progress/cancel-aware; read call sites → `RootIndex::read`; `status` adds reindex progress |
| `mneme/src/mcp/server.rs` | `wiki_reindex` takes `ctx: RequestContext<RoleServer>`, bridges progress to `peer.notify_progress`; fix stale `INSTRUCTIONS` |
| `mneme/src/mcp/results.rs` | `StatusRoot` gains `reindex: Option<ReindexProgressDto>` |
| `mneme/src/main.rs` | `reindex`/`search`/`embed`/`watch` build an `EmbedWorker`; `reindex` prints live progress (stderr) |
| `mneme/tests/concurrency.rs` | **new** — single-flight, cancel, partial-index, (real) responsiveness-under-load |
| `mneme/tests/indexer.rs`, `tests/index_search.rs`, `tests/mcp.rs`, `tests/hybrid_search.rs` | mechanical updates for `Arc<RootIndex>` + `EmbedHandle` signatures |
| `mneme/README.md` | Phase-2 banner → complete; module layout (worker, pool, job) |
| `doc/tasks/US-651-mneme-architecture/README.md` | amend progress-payload note (C6) |
| `doc/epics/EPIC-032.md`, `doc/active-work.md` | link/move US-659 |

## Files that need NO change

- `mneme/src/model/` (provisioner), `mneme/src/store/`, `mneme/src/markdown/`, `mneme/src/config.rs` — untouched.
- `mneme/src/index/vector.rs` (RRF + blob packing) — pure helpers, unchanged.
- `mneme/src/mcp/params.rs` — no new tool params (cancellation/progress ride MCP meta, not params).
- `mneme/assets/wiki-guide.md` — tool surface unchanged (behavior, not contract, changes).
- `src/` (Persephone renderer/main) — Mneme is standalone; Persephone integration is US-660+.
