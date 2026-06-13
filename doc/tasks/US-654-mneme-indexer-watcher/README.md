# US-654: [Phase 1] Indexer + watcher + reconcile

**Epic:** [EPIC-032 — Mneme (Wiki / Vector Memory service)](../../epics/EPIC-032.md)
**Phase:** 1 — Mneme core service (text-search, MCP-testable)
**Status:** Implemented (Phase 1) — `cargo build --release` + full suite (13 + 19 + 7 = 39 tests) pass; awaiting epic-level review.
**Created:** 2026-06-13

## Goal

Add the layer that keeps the per-root SQLite index **consistent with the files on disk** — the orchestration that sits between US-652's Document Store / walk and US-653's `parse_document` + `IndexDb`. Two complementary paths (EPIC-032 D17, US-651 "Indexer"):

1. **Reconcile** — walk each root, use an **mtime + size fast-path** to skip unchanged files, compute a **content hash** only for candidates, then bring the index current: index **new** files, re-process **changed** ones, drop **deleted** ones. Runs as a **deferred background job** ~5 s after start (non-blocking) so the index self-heals after downtime, and synchronously on demand (CLI `reindex`).
2. **Watcher** — an **always-on** `notify` recursive watcher per root, **debounced**, that wakes a reconcile when files change outside Mneme's own write path (the user in another app, a local CLI agent editing files, `git pull`, sync).

At the end of this task: pointing Mneme at a folder of markdown and running `mneme reindex` populates the FTS index from the files; editing/adding/deleting a `.md` while the watcher runs updates the index within the debounce window; and a second reconcile is a cheap no-op (fast-path + content-hash dedup). All synchronous Rust + `std::thread` + `notify` — **no** `tokio`, **no** MCP server (US-655), **no** embeddings into `chunks_vec` (US-657/658), **no** priority queue / reader pool / cancellable JobManager / progress notifications (US-659).

## Background

### What this task realizes (from EPIC-032 / US-651)

- **US-654 scope line (EPIC-032):** "always-on `notify` watcher, deferred startup reconcile (mtime+size fast-path → content-hash), content-hash dedup, single-flight per root."
- **Indexer (US-651 "Core services → Indexer"):** keeps the index consistent via *startup reconcile* (deferred ~5 s, non-blocking; mtime+size fast-path, hash candidates, compare to `documents`: new→index, changed→reprocess, deleted→drop) and *live change events* (incremental reprocess from the watcher). Content-hash dedup keeps both paths from redundant work; the hash is authoritative so it doesn't matter who changed the files or how.
- **File Watcher (US-651 "Cross-cutting"):** `notify`, recursive per root, debounced (~500 ms), always-on. Honors the same include/ignore rules so ignored trees (`.git`, `node_modules`, `.mneme`, …) are neither watched-as-changes nor traversed. Service-side and self-contained — Mneme doesn't depend on Persephone to notify it. Only Persephone's own `wiki_write` (US-655) bypasses it (it indexes synchronously on write).
- **Per-root isolation (D12 / US-651 concurrency #4):** one `.mneme/index.db` per root → reconciling root A never contends with reading/writing root B.
- **What's explicitly deferred:** the dedicated embedding worker + **priority queue**, the WAL **single-writer task + reader pool**, the **cancellable JobManager** with MCP **progress notifications** + **backpressure** are all **US-659**. US-654 lays the minimal single-writer seam (one `IndexDb` per root behind a `Mutex`, single-flight via the lock) that US-659 extends — it does **not** build the priority/cancellation/progress machinery.

### What US-652 + US-653 already provide (build on, don't duplicate)

| Piece | Where | US-654 uses it for |
|---|---|---|
| `walk::walk_root(&RootConfig) -> Result<Vec<WalkedFile{abs, rel}>>` (`rel` = forward-slash path within root; applies include allowlist + ignore rules incl. native `.gitignore`) | `mneme/src/store/walk.rs` | the **authoritative** indexable set per reconcile (new/changed/deleted decisions run against this) |
| `Config` / `RootConfig` (`name`, `folder`, `include`, `ignore`) + `ModelConfig` | `mneme/src/config.rs` | per-root walk + opening the per-root `IndexDb` |
| `DEFAULT_IGNORES = [".git", ".mneme", "node_modules", "target", "dist", "build"]` | `mneme/src/store/walk.rs` | reused by the watcher's coarse event filter (Concern 2) |
| `parse_document(filename, content, birthtime: Option<SystemTime>, mtime: SystemTime) -> ParsedDoc { meta, chunks }` (`filename` = stem) | `mneme/src/markdown/mod.rs` | parse a candidate file before upsert |
| `IndexDb::{open_or_create, upsert_document, delete_document, doc_state, all_doc_paths, search_fts}` | `mneme/src/index/mod.rs` | the index write/read seam the indexer drives |
| `IndexDb::doc_state(rel) -> Option<DocState{content_hash, mtime, size}>` | `mneme/src/index/mod.rs` | the mtime+size fast-path + hash dedup compare |
| `content_hash(&[u8]) -> String` (sha2→hex, free fn) | `mneme/src/index/mod.rs` | candidate content hash |
| `MnemeError` + `Result` (thiserror) | `mneme/src/error.rs` | extend with a `Notify` variant |

`IndexDb` is **per-root** (its `.mneme/` lives inside the root); `documents.path` holds the `rel` path within that root. The indexer reads file bytes directly from each `WalkedFile.abs` (it does **not** route through `DocumentStore` — it needs `(rel, abs)` pairs, which `walk_root` gives directly; `DocumentStore`'s read/glob/grep surface isn't needed here).

### Source module layout added/touched by this task

```
mneme/src/
├─ lib.rs            + pub mod indexer;  + pub mod watcher;
├─ error.rs          + Notify(#[from] notify::Error) variant
├─ main.rs           + `reindex [path?]` command (synchronous); + optional `watch` (foreground)
├─ store/mod.rs      + pub use walk::{walk_root, WalkedFile};   (expose the existing walk to indexer)
├─ index/mod.rs      + IndexDb::update_doc_stat(rel, mtime, size)  (mtime/size refresh on hash-equal)
│                     + IndexDb::doc_count() -> usize             (optional, for `status`)
├─ indexer/
│  └─ mod.rs         reconcile_root / index_one / ReconcileStats / IndexOutcome / IndexManager
└─ watcher/
   └─ mod.rs         RootWatcher (notify + debouncer, coarse ignore filter, reconcile-on-flush)
```

`tokio`, `ort`/`tokenizers`, `reqwest`, `rmcp` are still **not** added. The only new runtime deps are the file-watcher crates (Step 1). The layer stays synchronous + `std::thread`.

## Implementation plan

### Step 1 — Dependencies (`mneme/Cargo.toml`)

Add to `[dependencies]` (confirm latest minors at build time, pin in `Cargo.lock` — same posture as US-653):

```toml
notify               = "8"      # cross-platform fs watcher (ReadDirectoryChangesW on Windows)
notify-debouncer-full = "0.5"   # coalesced, debounced events; handles rename/remove/overflow; re-exports `notify`
```

Notes:
- `notify-debouncer-full` re-exports the `notify` types it builds on; `notify` is also listed directly so `error.rs` can `#[from] notify::Error` and the watcher can name `notify::EventKind` cleanly.
- **Lighter alternative** (recorded, not chosen): raw `notify` + a hand-rolled `mpsc` + timeout debounce. `notify-debouncer-full` is preferred — it correctly coalesces bursts (e.g. a `git pull` touching hundreds of files → one batch) and surfaces a rescan signal on buffer overflow (Concern 6).
- No `tokio` — the watcher runs on `notify`'s own thread; the deferred reconcile and CLI run on `std::thread` / the main thread.

### Step 2 — Expose the walk to the indexer (`mneme/src/store/mod.rs`)

`walk_root` + `WalkedFile` are `pub` items inside the private `mod walk;`. Add a re-export so the indexer can call them without reaching into a private module:

```rust
// near the existing `pub mod address; … mod walk;` lines:
pub use walk::{walk_root, WalkedFile};
```

(No behavior change to the Document Store; this only widens visibility of an existing function.)

### Step 3 — Small `IndexDb` additions (`mneme/src/index/mod.rs`)

The fast-path needs to refresh a row's `mtime`/`size` when content is unchanged but the timestamp moved (e.g. `touch`, `git checkout`) so the next reconcile's fast-path hits without re-hashing:

```rust
/// Refresh just the filesystem stat for an unchanged document (content hash matched but
/// mtime/size moved). Avoids a redundant re-parse/re-upsert on the next reconcile.
pub fn update_doc_stat(&self, rel_path: &str, mtime: i64, size: i64) -> Result<()> {
    self.conn.execute(
        "UPDATE documents SET mtime=?2, size=?3 WHERE path=?1",
        rusqlite::params![rel_path, mtime, size],
    )?;
    Ok(())
}
```

Optional (only if `status` is enhanced in Step 7):

```rust
/// Count of indexed documents (for the `status` report).
pub fn doc_count(&self) -> Result<usize> {
    Ok(self.conn.query_row("SELECT count(*) FROM documents", [], |r| r.get::<_, i64>(0))? as usize)
}
```

### Step 4 — Indexer (`mneme/src/indexer/mod.rs`)

**Outcome + stats:**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexOutcome {
    Indexed,    // new file, or content changed → upsert_document
    Refreshed,  // content hash unchanged, mtime/size moved → update_doc_stat only
    Skipped,    // mtime+size matched the stored row → no read, no hash
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReconcileStats {
    pub scanned: usize,   // files seen by the walk
    pub indexed: usize,   // new/changed upserts
    pub refreshed: usize, // stat-only refreshes
    pub skipped: usize,   // fast-path skips
    pub deleted: usize,   // dropped (gone from disk)
    pub errors: usize,    // per-file failures (logged, not fatal)
}

pub const RECONCILE_DELAY: Duration = Duration::from_secs(5); // deferred startup reconcile
```

**Single-file index** (also the primitive US-655's synchronous `wiki_write` will call):

```rust
/// Reconcile one file against the index. `rel` is the forward-slash path within the root;
/// `abs` is the absolute path on disk. Never re-embeds (chunks_vec stays empty — US-657/658).
pub fn index_one(db: &IndexDb, rel: &str, abs: &Path) -> Result<IndexOutcome> {
    let md = std::fs::metadata(abs)?;
    let size = md.len() as i64;
    let mtime = system_time_to_secs(md.modified()?);          // epoch seconds, see below

    if let Some(state) = db.doc_state(rel)? {
        if state.mtime == mtime && state.size == size {
            return Ok(IndexOutcome::Skipped);                  // fast-path: no read, no hash
        }
        let bytes = std::fs::read(abs)?;
        let hash = content_hash(&bytes);
        if hash == state.content_hash {
            db.update_doc_stat(rel, mtime, size)?;             // touched but unchanged
            return Ok(IndexOutcome::Refreshed);
        }
        upsert_from_bytes(db, rel, abs, &bytes, &hash, mtime, size, &md)?;
    } else {
        let bytes = std::fs::read(abs)?;
        let hash = content_hash(&bytes);
        upsert_from_bytes(db, rel, abs, &bytes, &hash, mtime, size, &md)?;
    }
    Ok(IndexOutcome::Indexed)
}
```

`upsert_from_bytes` builds `parse_document` inputs and calls `IndexDb::upsert_document`:
- `filename` = `Path::new(rel).file_stem()` → string (the `title` fallback expects the **stem**, no extension — verified against `frontmatter::resolve_meta`).
- `content` = `String::from_utf8_lossy(&bytes)` (mirrors `store::read_lossy`).
- `birthtime` = `md.created().ok()` (platform-tolerant — `None` on filesystems without birthtime; Concern in US-653 #7).
- `mtime` (SystemTime) = `md.modified()?` for `parse_document`; the epoch-seconds `mtime` is stored in `documents.mtime`.
- then `db.upsert_document(rel, &parsed, &hash, mtime_secs, size)`.

**Full reconcile** (the authoritative path — drives new/changed/deleted):

```rust
/// Walk the root, bring the index current. Per-file errors are logged + counted, never fatal.
pub fn reconcile_root(db: &IndexDb, root: &RootConfig) -> Result<ReconcileStats> {
    let mut stats = ReconcileStats::default();
    let walked = walk_root(root)?;                             // authoritative include/ignore set
    let mut present: HashSet<String> = HashSet::new();
    for wf in &walked {
        stats.scanned += 1;
        present.insert(wf.rel.clone());
        match index_one(db, &wf.rel, &wf.abs) {
            Ok(IndexOutcome::Indexed)   => stats.indexed += 1,
            Ok(IndexOutcome::Refreshed) => stats.refreshed += 1,
            Ok(IndexOutcome::Skipped)   => stats.skipped += 1,
            Err(e) => { stats.errors += 1; tracing::warn!(file = %wf.rel, "index failed: {e}"); }
        }
    }
    for rel in db.all_doc_paths()? {                          // dropped files: stored − present
        if !present.contains(&rel) {
            match db.delete_document(&rel) {
                Ok(()) => stats.deleted += 1,
                Err(e) => { stats.errors += 1; tracing::warn!(file = %rel, "delete failed: {e}"); }
            }
        }
    }
    tracing::info!(root = %root.name, ?stats, "reconcile complete");
    Ok(stats)
}
```

**Manager** — owns one `IndexDb` per root (behind a `Mutex` = the single-writer + single-flight gate, Concern 1) plus the watchers:

```rust
pub struct IndexManager {
    roots: Vec<RootConfig>,
    dbs: HashMap<String, Arc<Mutex<IndexDb>>>,
    watchers: Vec<RootWatcher>,
}

impl IndexManager {
    /// Open (or create) the per-root index for every root. Does NOT walk yet.
    pub fn open(roots: &[RootConfig], model: &ModelConfig) -> Result<Self>;

    /// The per-root index handle — US-655's synchronous wiki_write locks this and calls index_one.
    pub fn handle(&self, root: &str) -> Option<Arc<Mutex<IndexDb>>>;

    /// Foreground reconcile of every root (CLI `reindex`, the deferred startup job, tests).
    pub fn reconcile_all(&self) -> Vec<(String, ReconcileStats)>;

    /// Foreground reconcile of one root (scoped `reindex {root}`).
    pub fn reconcile_root(&self, root: &str) -> Result<ReconcileStats>;

    /// Spawn an always-on debounced watcher per root (reconciles that root on change).
    pub fn start_watchers(&mut self) -> Result<()>;

    /// Spawn the deferred (~RECONCILE_DELAY) startup reconcile thread; returns immediately.
    pub fn spawn_deferred_reconcile(&self);

    /// Convenience for US-655's serve: open + start_watchers + spawn_deferred_reconcile.
    pub fn start(roots: &[RootConfig], model: &ModelConfig) -> Result<Self>;

    /// Stop the watchers (drops the debouncers/threads). Called on shutdown.
    pub fn shutdown(self);
}
```

`system_time_to_secs(SystemTime) -> i64` = `t.duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)` (a small helper in this module; `documents.mtime` stores epoch seconds for the fast-path compare).

### Step 5 — Watcher (`mneme/src/watcher/mod.rs`)

```rust
pub struct RootWatcher {
    _debouncer: Debouncer<RecommendedWatcher, RecommendedCache>, // dropping it stops watching
}

impl RootWatcher {
    /// Watch `root.folder` recursively; on each debounced batch (after the coarse ignore
    /// filter), lock `db` and run `reconcile_root`. The reconcile is the authoritative sync —
    /// the watcher only needs to (a) avoid self-trigger and (b) wake a reconcile (Concern 3).
    pub fn start(root: RootConfig, db: Arc<Mutex<IndexDb>>) -> Result<Self>;
}
```

- Build with `notify_debouncer_full::new_debouncer(Duration::from_millis(500), None, handler)` (debounce ~500 ms, US-651); `watcher.watch(&root.folder, RecursiveMode::Recursive)`.
- **Coarse ignore filter** (`fn is_watch_ignored(root_folder, path) -> bool`): drop any event whose path, relative to `root.folder`, contains a `DEFAULT_IGNORES` component (`.mneme`, `.git`, `node_modules`, `target`, `dist`, `build`). **`.mneme` is mandatory** — the index DB's own WAL/SHM writes live there and would otherwise retrigger the watcher forever (Concern 2). Reuse `store::walk::DEFAULT_IGNORES` (export it as `pub const`).
- The handler coalesces a debounced batch to **at most one** `reconcile_root` call: if any non-ignored event is present in the batch (or the debouncer signals a rescan/overflow), lock the db and reconcile. Precise per-file include/`.gitignore` matching is intentionally **not** done here — `reconcile_root`'s `walk_root` is the authoritative filter (Concern 3).
- Watcher errors → log `warn` (a transient watch error must not crash the service); the deferred reconcile + the next event still bring the index current.

### Step 6 — Error variant (`mneme/src/error.rs`)

```rust
#[error("watch error: {0}")]
Notify(#[from] notify::Error),
```

### Step 7 — CLI (`mneme/src/main.rs`)

- **`reindex`** (new subcommand — primary testable surface, matches US-651's CLI sketch `serve / reindex / status`):
  ```
  Reindex { /// "{root}" or "{root}/sub" to scope; omit = all roots
            path: Option<String> }
  ```
  Runs `IndexManager::open(...)` then `reconcile_all()` (or `reconcile_root(root)` when `path` names a root) **synchronously** and prints a per-root `ReconcileStats` line to stdout's human report (this is a human-facing command, like `status` — allowed stdout). Foreground/blocking, distinct from the deferred background reconcile.
- **`watch`** (optional, recommended for manual testing): `IndexManager::start(...)` then block (e.g. `ctrl_c` via a `std::sync::mpsc` recv, or a simple parking loop) until interrupted, so a developer can edit files and watch the index update. Logs to stderr. This is a dev convenience; the watcher's production home is US-655's `serve` / US-660's sidecar.
- **`status`** (optional enhancement): for each root, also open its `IndexDb` (read-only is fine) and report `doc_count()` alongside the existing indexable-file count — surfacing index-vs-disk drift. Keep it best-effort (a missing/locked DB → show `-`).

Leave the `serve` stub unchanged — wiring `IndexManager::start()` into `serve` is US-655.

### Step 8 — Tests (`mneme/tests/indexer.rs`, fixtures generated at runtime)

Follow US-652/653's hermetic pattern (fixtures under `CARGO_TARGET_TMPDIR`, nothing committed). Two groups:

**Deterministic reconcile (synchronous, no watcher — the core logic):**
- **new files:** temp root with N `.md` files → `IndexManager::open` + `reconcile_root` → `stats.indexed == N`, every file searchable via `search_fts`, `all_doc_paths` lists all.
- **idempotent / fast-path:** a second `reconcile_root` with no changes → `indexed == 0`, `skipped == N` (mtime+size matched, nothing read/hashed).
- **changed content:** rewrite one file's body (new unique term) → reconcile → that file `Indexed`; `search_fts(old term)` misses, `search_fts(new term)` hits; no duplicate chunks.
- **touched but unchanged:** rewrite a file with **identical bytes** but a newer mtime (set via re-write) → reconcile → outcome `Refreshed` (`refreshed >= 1`, `indexed == 0`); `doc_state.mtime` advanced.
- **deleted:** remove a file from disk → reconcile → `deleted == 1`; `all_doc_paths` no longer lists it; `search_fts` misses.
- **errors non-fatal:** an unreadable/locked file (or a directory entry edge case) increments `errors` but the rest of the root still reconciles (best-effort).
- **per-file unit:** `index_one` returns `Indexed` → `Skipped` → (after touch) `Refreshed` → (after edit) `Indexed`.

**Watcher (eventual-consistency, bounded poll — not fixed sleeps, Concern 10):**
- start `IndexManager` + `start_watchers` on a temp root; **write a new `.md`** → poll the index (lock + `all_doc_paths` / `search_fts`) up to ~5 s at 50 ms intervals → asserts it appears; **edit** it → polls reflect the new term; **delete** it → polls show it gone.
- **`.mneme` self-trigger guard:** unit-test `is_watch_ignored(root, root/.mneme/...db-wal)` → `true` (and a normal `root/note.md` → `false`), proving the index's own writes can't drive an infinite reconcile loop.

### Step 9 — Docs touch-ups (within this task)

- `mneme/README.md` — add `indexer/` + `watcher/` to the module-layout block; update the Status line to mention the indexer/watcher/reconcile; note the CLI gained `reindex` (+ optional `watch`). Update the CLI section.
- `mneme/mneme.example.toml` — no schema change (the watcher is always-on; the ~5 s reconcile delay is an internal const). A one-line comment is optional.
- Epic/dashboard updates per the workflow (this doc linked; row linked) — see "Files changed".

## Concerns / open questions (with proposed resolutions)

**1. Threading model without `tokio` (single-writer + single-flight).** `IndexDb` wraps a `rusqlite::Connection` (`Send`, `!Sync`); the watcher thread, the deferred-reconcile thread, the CLI, and (later) US-655's MCP handlers all need to write to the same per-root DB.
→ **Resolution:** US-654 stays **synchronous + `std::thread`** (the US-653 posture; `notify` runs its own thread). Each root gets **one `IndexDb` behind an `Arc<Mutex<IndexDb>>`** in `IndexManager`. The `Mutex` is both the **single-writer gate** (SQLite writes serialize) and the **single-flight gate** (a reconcile holds the lock, so a concurrent watcher reconcile or `wiki_write` waits — exactly "single-flight per root"). `Arc<Mutex<IndexDb>>` is `Send + Sync` because `IndexDb` is `Send`. The **priority queue, off-runtime embedding worker, WAL reader pool, and cancellable JobManager with progress notifications are US-659**, which extends this seam (adds readers + a priority writer + cancellation on top) rather than replacing it. No `tokio` is pulled in until US-655's HTTP server needs it.

**2. Watcher self-trigger loop via the index's own writes.** The per-root index lives at `<root>/.mneme/<modelId>/index-v1.db`; in WAL mode SQLite continuously writes `*.db-wal` / `*.db-shm` **inside the watched tree**. A naïve recursive watcher would see those writes, reconcile, write again → an infinite loop.
→ **Resolution:** the watcher applies a **coarse path-component ignore filter** before scheduling any reconcile, dropping events whose root-relative path contains a `DEFAULT_IGNORES` component — **`.mneme` first** (kills the self-trigger), plus `.git` / `node_modules` / `target` / `dist` / `build` (avoids reconcile-spam on unrelated churn). This reuses `store::walk::DEFAULT_IGNORES` (promoted to a `pub const`). It is deliberately **coarse** — it doesn't need to be precise because the reconcile it wakes re-derives the authoritative set via `walk_root` (Concern 3). `.mneme` is already in the walker's ignore set, so the index is never *indexed* either; this concern is specifically about not *waking on* its writes.

**3. Incremental per-file indexing vs. debounced reconcile.** US-651 describes the live path as "incremental re-process of just the changed file." A literal per-file-from-the-event implementation must itself decide indexability (include allowlist + nested `.gitignore`) for an arbitrary event path — duplicating `walk_root`'s logic imprecisely.
→ **Resolution:** US-654 implements the watcher as a **debounced trigger for `reconcile_root`** — the one authoritative sync path (`walk_root` → mtime+size fast-path → hash dedup → upsert/delete). At personal scale a stat-only walk of a few thousand files is milliseconds, and the fast-path means only genuinely changed files are read/hashed/parsed — **functionally identical** to per-file incremental, far simpler, and immune to the filter-precision problem. A `git pull` touching hundreds of files collapses (via the debouncer) to **one** reconcile. The single-file primitive **`index_one` still exists** because US-655's `wiki_write` indexes synchronously on its own known-good path (the file it just wrote) — so the building block is there; the watcher simply prefers the authoritative reconcile. True event-driven single-file indexing (skip the walk) is recorded as a **later optimization**, not needed for v1.

**4. mtime+size fast-path semantics + the `touch`/`git checkout` case.** The fast-path must skip unchanged files cheaply, but file timestamps move without content changing (`touch`, `git checkout`, sync), and content changes without a reliable size delta.
→ **Resolution:** three-way decision per file in `index_one`: (a) `doc_state` present and `(mtime, size)` **both match** → `Skipped` (no read, no hash — the cheap common case); (b) stat differs → read + `content_hash`: hash **matches** stored → content unchanged, **refresh stored mtime/size only** via the new `update_doc_stat` (`Refreshed`) so the next reconcile fast-paths it; hash **differs** → full `upsert_document` (`Indexed`); (c) no `doc_state` (new file) → read + hash + `upsert` (`Indexed`). Storing epoch-seconds `mtime` (already in `documents.mtime` from US-653) makes (a) a pure integer compare. This is exactly US-651's "mtime+size fast-path; hash candidates; content hash is authoritative."

**5. Deleted-file detection (and renames).** A reconcile must drop documents whose files are gone, without a per-file delete event.
→ **Resolution:** `reconcile_root` builds the `present` set (`rel` of every walked file) and diffs against `IndexDb::all_doc_paths()`; `stored − present` → `delete_document` each. **Renames** surface as a delete of the old `rel` + an insert of the new `rel` on the next reconcile — correct without rename-tracking (the content hash means the new path is indexed fresh; the old path is dropped). No special rename handling in v1.

**6. `notify` version, debouncing, and overflow.** Raw `notify` emits a flood of low-level events; the event buffer can overflow on a large burst; rename/remove semantics differ per platform.
→ **Resolution:** use **`notify-debouncer-full`** (re-exports `notify`) for coalesced, debounced (~500 ms) batches that handle rename/remove and emit a **rescan signal on overflow** — on which the watcher simply schedules a full `reconcile_root` (which it does anyway). Pin `notify` (~8.x) + `notify-debouncer-full` (~0.5.x); **confirm latest minors at build time** (same verify-at-build posture as US-653's SQLite stack). The lighter raw-`notify` + hand-rolled debounce path is the recorded fallback.

**7. Reconcile robustness — one bad file must not fail the pass.** A single unreadable/locked file, a transient I/O error, or a malformed document shouldn't abort reconciling the whole root.
→ **Resolution:** `reconcile_root` runs `index_one`/`delete_document` per file, **accumulating** failures into `ReconcileStats.errors` (logged at `warn`) and continuing. `parse_document` already never fails on bad frontmatter (US-653 #8); the remaining failure modes are I/O (file vanished mid-walk, lock, permission) — all per-file recoverable. The pass returns `Ok(stats)` with a non-zero `errors` count rather than `Err`.

**8. Deferred startup reconcile must not block startup.** US-651: reconcile runs ~5 s after launch, non-blocking; Mneme serves immediately against the persisted index.
→ **Resolution:** `IndexManager::spawn_deferred_reconcile` spawns a `std::thread` that sleeps `RECONCILE_DELAY` (5 s const; config-exposed later by US-659/US-664) then calls `reconcile_all()`, returning immediately. `start()` wires open → `start_watchers` → `spawn_deferred_reconcile` and returns — so US-655's `serve` will be live instantly with the watcher already catching changes and the reconcile self-healing shortly after. The **CLI `reindex`** runs reconcile **synchronously** (foreground) — a separate, deterministic path that tests and users drive directly (tests call `reconcile_all()` with no sleep, avoiding timing dependence).

**9. Coupling to the Document Store / exposing `walk_root`.** The indexer needs `(rel, abs)` pairs per root, which only `walk::walk_root` produces, but `walk` is a private module.
→ **Resolution:** re-export the existing `pub` items — `pub use walk::{walk_root, WalkedFile};` in `store/mod.rs` (and `pub const DEFAULT_IGNORES` for the watcher filter). The indexer depends on the **walk** (the indexable-set definition) but **not** on `DocumentStore` itself (it reads bytes directly from `abs`), keeping the indexer decoupled from the read/glob/grep surface. This is a visibility-only change to a US-652 file — no behavior change.

**10. Watcher test flakiness (timing).** File-event delivery + debounce is inherently asynchronous; a fixed `sleep` makes tests either slow or flaky.
→ **Resolution:** the **deterministic core** (new/changed/deleted/fast-path/dedup, and the `is_watch_ignored` predicate) is tested **synchronously** via `reconcile_root` / `index_one` / a direct filter call — no timing. Only a **single** watcher integration test exercises the live wiring, and it **polls with a bounded timeout** (lock the db and check `all_doc_paths`/`search_fts` every ~50 ms up to ~5 s) asserting eventual consistency, rather than sleeping a fixed interval. If watcher tests prove flaky in CI, they can be gated behind a feature/ignore flag while the synchronous reconcile tests carry the correctness proof.

## Acceptance criteria

- [x] `cargo build --release` and `cargo test` pass on Windows with the new `notify` / `notify-debouncer-full` deps (CI `cargo build` step from US-652 still green); no `tokio`/MCP/embedding code added.
- [x] `reconcile_root` on a fresh index indexes every walked `.md` (`stats.indexed == file count`), each becomes FTS-searchable, and `all_doc_paths` lists them; a second reconcile is a no-op (`skipped == count`, `indexed == 0`).
- [x] Changing a file's content re-indexes only it (old term no longer matches, new term does, no duplicate chunks); touching a file with identical bytes yields `Refreshed` (stat updated, not re-parsed); deleting a file drops it (`deleted` incremented, gone from `all_doc_paths` + search).
- [x] The mtime+size fast-path skips unchanged files without reading/hashing; the content hash is the authoritative change decision when the stat differs.
- [x] An always-on debounced `notify` watcher per root wakes a reconcile on add/edit/delete; writes inside `.mneme/` (the index's own WAL/SHM) are filtered out and never cause a reconcile loop (covered by an `is_watch_ignored` test).
- [x] The deferred startup reconcile runs ~5 s after `IndexManager::start` **without blocking** the caller; `mneme reindex [path?]` runs a synchronous reconcile and reports per-root `ReconcileStats`.
- [x] A per-file error during reconcile is logged and counted (`errors`) without aborting the rest of the root.
- [x] No embeddings are computed; `chunks_vec` stays empty; all logging is stderr-only (stdout carries only the `reindex`/`status` human report).

## Implementation notes (post-hoc — deviations from the plan above)

Implemented and verified (`cargo build --release` clean + `cargo test` → **39/39** pass on Windows: 13 US-652 + 19 US-653 + 7 US-654; library + release build, no warnings). Resolved crate versions: `notify` 8.2.0, `notify-debouncer-full` 0.5.0 (pulling `notify-types` 2.1.0, `file-id` 0.2.3). Deliberate deviations:

1. **`notify-debouncer-full` 0.5 exposes the `Watcher` methods directly on `Debouncer`.** The plan sketched `debouncer.watcher().watch(...)`; in 0.5 `.watcher()` is deprecated and `watch`/`unwatch` are inherent on `Debouncer`, so the code calls `debouncer.watch(&path, RecursiveMode::Recursive)` directly. The cache type is `notify_debouncer_full::RecommendedCache`; the watcher field type is `Debouncer<RecommendedWatcher, RecommendedCache>`.

2. **`status` doc-count enhancement dropped (Step 7 "optional").** Reporting indexed counts in `status` would require `IndexDb::open_or_create`, which *creates* an empty DB as a side effect — undesirable for a read-only `status`. The `IndexDb::doc_count()` method was still added (US-655/monitoring will use it), but `status` is left unchanged. `reindex` is the testable surface; `watch` is the dev convenience.

3. **`index_one` "touched but unchanged" test sleeps ~1.1 s before rewriting identical bytes.** Filesystem mtime resolution (and same-second writes) can leave mtime unchanged, which would make the rewrite hit the fast-path `Skipped` branch instead of the intended `Refreshed`. A >1 s gap guarantees an observably newer mtime so the hash-equal `Refreshed` path is exercised deterministically. (Production code is unaffected — this is a test-timing accommodation only.)

4. **`watch` blocks via `std::thread::park()` (no `ctrlc` dep).** The foreground `watch` command parks the main thread after `IndexManager::start`; Ctrl-C terminates the process by default. No signal-handling crate was added — the production watcher home is US-655's `serve` / US-660's sidecar lifecycle, which own graceful shutdown.

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/Cargo.toml` | edit — add `notify`, `notify-debouncer-full` |
| `mneme/Cargo.lock` | edit — pinned |
| `mneme/src/lib.rs` | edit — `pub mod indexer;` + `pub mod watcher;` |
| `mneme/src/error.rs` | edit — add `Notify(#[from] notify::Error)` |
| `mneme/src/store/mod.rs` | edit — `pub use walk::{walk_root, WalkedFile};` + `pub const DEFAULT_IGNORES` (visibility only) |
| `mneme/src/index/mod.rs` | edit — add `update_doc_stat` (+ optional `doc_count`) |
| `mneme/src/indexer/mod.rs` | **new** — `reconcile_root` / `index_one` / `ReconcileStats` / `IndexOutcome` / `IndexManager` / `RECONCILE_DELAY` |
| `mneme/src/watcher/mod.rs` | **new** — `RootWatcher` (notify + debouncer, coarse ignore filter, reconcile-on-flush) + `is_watch_ignored` |
| `mneme/src/main.rs` | edit — add `reindex [path?]` (+ optional `watch`, + optional `status` doc-count) |
| `mneme/tests/indexer.rs` | **new** — reconcile (new/changed/touched/deleted/fast-path/errors) + watcher eventual-consistency + ignore-filter tests |
| `mneme/README.md` | edit — module layout (`indexer/`, `watcher/`) + status line + CLI (`reindex`) |
| `mneme/mneme.example.toml` | edit (optional) — one comment noting the always-on watcher |
| `doc/active-work.md` | edit — link the US-654 entry to this doc |
| `doc/epics/EPIC-032.md` | edit — link the US-654 row in Linked Tasks |

### Files that need NO changes (don't investigate)

- `mneme/src/store/{address,roots,grep,glob,edit}.rs` and `store/mod.rs`'s `DocumentStore` methods — stable from US-652; US-654 reuses only `walk_root` (re-exported) + reads bytes directly. No Document-Store behavior changes.
- `mneme/src/markdown/**` — `parse_document` and the frontmatter/chunker are consumed as-is from US-653; no changes.
- `mneme/src/index/{schema.rs,path.rs}` — schema/versioned-path/sqlite-vec registration are stable from US-653; US-654 only **adds** read/write helper methods in `index/mod.rs`, no schema change (no `SCHEMA_VERSION` bump).
- `mneme/build.rs`, `.github/workflows/publish.yml`, `.gitignore` — build wiring unchanged (the existing `cargo build --release` step covers the new deps; `.mneme/` and `mneme/target/` already ignored).
- Any Persephone TypeScript / `src/main/**` — no Persephone integration in this task (US-660+).
- `mneme/src/config.rs` — `RootConfig`/`ModelConfig` are sufficient as-is; the reconcile-delay stays an internal const for now (config exposure deferred to US-659/US-664).
