# US-669 — Mneme: async long-running ops + live progress (add-root, model download, log file)

**Epic:** [EPIC-032 — Mneme (vector memory)](../../epics/EPIC-032.md) · Phase 5
**Status:** Implemented — pending manual test
**Touches:** `mneme/` (Rust) + Persephone renderer (US-664 editor). Per project rules, the Rust crate skips `/review` & `/userdoc`; verify with `cargo build --release` + `cargo test`.

## Implementation notes (as built)

- **Phase 1 (add-root):** `reconcile_coalesced` runs synchronously on its calling thread, so swapping it in-place wouldn't unblock the MCP call. Instead added **`IndexManager::spawn_reconcile(name)`** (`mneme/src/indexer/mod.rs`) — mirrors `spawn_deferred_reconcile` (its own `std::thread::spawn` + the manager's shutdown `cancel` token), single-root, no delay. `ServerState::add_root` (`mcp/mod.rs`) now registers + persists + `index.spawn_reconcile(&cfg.name)` and returns immediately. A brand-new root has no in-flight pass, so the coalesced call genuinely starts one.
- **Phase 2 (model download):** added `ModelJob { run_lock, in_flight, errored }` on `ServerState`; `model_update` flips `in_flight` (coalesces a second call), spawns `provision` on a detached thread, returns an immediate snapshot. Progress is **derived from the filesystem** — new `model::download_progress(cfg, in_flight, errored)` sums present files + `.part` sidecars vs. manifest bytes; `ModelStatus.download: Option<ModelDownloadStatus>` (camelCase) filled by `ServerState::build_model_status` (used by both `status()` and `model_update`). No change to `download_file`'s streaming loop.
- **Phase 4 (errors):** `reconcile_coalesced` now sets `Phase::Error` on failure (was log-only); model failure sets `ModelJob.errored` → `download.phase = "error"`.
- **Phase 3 (log):** `mneme/src/main.rs` — layered subscriber (stderr + truncating file via a small `FileMakeWriter` over `Arc<Mutex<File>>`); file only for `serve`, path = `mneme.log` beside the resolved config dir. Truncated each start.
- **Phase 5 (editor):** poll loop in `MnemeConfigEditorModel` (`refreshStatus(silent)` + `syncPolling`/`startPolling`/`stopPolling`/`kickPolling`, 1500 ms, 30 s grace window after a kick to cover the initial `walk_root` before `scanning`). `RootsPanel` now renders the **background** `wiki_status.roots[].reindex` progress (not just the manual reindex), with an Error line; `ModelPanel` renders the `model.download` bar. `addRoot`/`updateModel` return immediately and `kickPolling()`. Optional header "working" affordance **deferred** (not implemented — editor is the primary surface).
- **Verified:** `cargo build --release` ✓, `cargo test` ✓ (7+16+11), `tsc --noEmit` ✓, `eslint` ✓.

## Goal

Stop long-running MCP calls from hitting the 60 s timeout by making them **async + observable via `wiki_status` polling**, and have the Persephone config editor (US-664) display the live progress:

- **`wiki_add_root`** returns immediately and indexes the new root **in the background**; editor shows **live per-root indexing progress** (`processed / total`).
- **`wiki_model_update`** returns immediately and downloads the model **in the background**; editor shows **live download progress** (`bytesDone / bytesTotal`).
- Plus: a default Mneme **log file** for troubleshooting.

## Problem

`wiki_add_root` currently runs a **blocking, synchronous reconcile inline** — the MCP call doesn't return until the whole root has been walked and embedded. For a real wiki this is fatal:

- Adding `D:\projects\EverGreen\wiki` showed progress for ~1 minute and then failed with `MCP error -32001: Request timed out` — the synchronous index outran the MCP request timeout.
- A wiki can hold **thousands of documents**; full indexing can take minutes. It **cannot** be synchronous.
- During add-root the progress callback is a no-op (`|_| {}`), so nothing is observable, and after the timeout the SSE transport gives up (`Maximum reconnection attempts (2) exceeded`) with no way to recover except the Restart Mneme button (US-664).

**Same failure class — `wiki_model_update`:** the handler (`ServerState::model_update`, `mneme/src/mcp/mod.rs` ~667) runs `blocking(move || crate::model::provision(&st.model, force)).await` — it downloads the full model to completion before returning. The model is `model.onnx` (~340 MB) + `tokenizer.json` (~16 MB) from GitHub releases; on a 5 MB/s link the ONNX file alone is ~68 s, past the 60 s MCP timeout. There is **no progress signal at all** during download (the streaming loop in `model::download_file` has no callback/channel/counter). The tool description itself admits "Synchronous — may take minutes for a first download." Result: first-time model provisioning on a slow link errors out the same way add-root does.

## Key finding — most of this is already built

US-659 already built the background-job + per-root progress machinery. We are **not** adding a new schema, status table, or progress struct. The design reuses what exists:

- **`JobManager`** (`mneme/src/indexer/job.rs`) owns a per-root `Mutex<ReindexProgress>` and two entry points:
  - `reconcile_blocking(root, cfg, emb, cancel, on_progress)` — waits for the in-flight pass, runs a fresh one, **returns stats** (blocks the caller). Used today by `wiki_reindex`, `add_root`, and `wiki_root_config` SET.
  - `reconcile_coalesced(root, cfg, emb, cancel)` — **fire-and-return**; if a pass is already running it sets a `rerun` flag and returns immediately. **Already used by the filesystem watcher.**
- **`ReindexProgress { phase, processed, total }`** (`Phase` = `Idle/Scanning/Embedding/Done/Cancelled/Error`) is updated by `reconcile_job` after **every file** in phase 1 (Scanning → sets `total`) and **every embed** in phase 2 (Embedding → bumps `processed`). This is exactly the requested `{ allFiles, processed }`, per root, in memory.
- **`wiki_status.roots[].reindex { phase, processed, total }`** is populated from `JobManager::progress_for(root)` for **every** reconcile path (watcher, startup, add-root, `wiki_reindex`) — not just user-triggered reindex.
- The **US-664 editor** already renders `reindexProgress` from `wiki_status` as a per-root progress bar.

**Design decision:** indexing status stays **derived + in-memory**. We do *not* add a persistent `status` column (`new`/`dirty`/`indexed`) — staleness is already computed on the fly in `index_one` by comparing live `mtime+size`/`content_hash` against the `documents` row, and the cheap mtime+size fast-path makes a full-root walk inexpensive. A separate per-file polling worker is **out of scope** — `JobManager` + coalesced reconcile already *is* that separate process.

## Design (five phases)

The work splits into five independently-shippable phases. **Phases 1–2** (Rust) are the timeout fixes and unblock everything. **Phase 5** (Persephone editor) is the separate UI phase to display the new reindex **and** download progress — it depends on Phases 1–2 being live so there are real background jobs to display.

| Phase | Side | Deliverable |
|-------|------|-------------|
| 1 | Rust (`mneme/`) | Async add-root — `reconcile_blocking` → `reconcile_coalesced`, returns immediately |
| 2 | Rust (`mneme/`) | Async model download — `wiki_model_update` returns immediately; progress on `wiki_status.model` |
| 3 | Rust (`mneme/`) | Default Mneme log file (`mneme.log`, truncated each start) |
| 4 | Rust (`mneme/`) | (only if needed) surface background-job errors as `reindex.phase = Error` / model `download.phase = Error` |
| 5 | Persephone (renderer) | Update the Mneme config editor to display live per-root reindex **and** model-download progress |

### Phase 1 — Async add-root (the timeout fix)

Make `wiki_add_root` enqueue a background reconcile and return immediately, instead of blocking on the full index.

- **File:** `mneme/src/mcp/mod.rs`, `ServerState::add_root` (~lines 432–456).
- **Change:** the final step currently calls
  ```rust
  st.jobs.reconcile_blocking(&h, &cfg, &st.embed, CancellationToken::new(), |_| {})?;
  ```
  Replace it with the fire-and-return variant the watcher already uses:
  ```rust
  st.jobs.reconcile_coalesced(&h, &cfg, &st.embed, st.cancel.child_token());
  ```
  (Match the exact `reconcile_coalesced` signature in `job.rs`; use the server's root/shutdown cancellation token, not a fresh one, so shutdown can stop the job. Confirm how the watcher obtains its token and mirror it.)
- After this change `add_root` does: register in registry → `index.add_root(...)` (opens DB + starts watcher) → `persist_roots` → **enqueue background reconcile** → return `AddRootResult` immediately. The root appears in `wiki_list_roots`/`wiki_status` right away with `reindex.phase = Scanning` (or `Idle` until the job picks up), and `processed/total` fill in as the background job runs.
- **Consider** whether `wiki_reindex` should also gain a non-blocking mode. Recommendation: **leave `wiki_reindex` blocking** for now (the editor calls it with `onprogress`/`signal` and shows a live bar + cancel; it already works). Only add-root needs to be non-blocking because it's triggered by a single MCP call the user waits on. Note this in the doc but don't expand scope.

### Phase 2 — Async model download (`wiki_model_update`)

Unlike reconcile, there is **no existing background-job machinery for downloads** — `model::provision` runs strictly inline. This phase adds the minimum plumbing to dispatch the download in the background and surface progress via the **already-live** `model::status()` (which `wiki_status` calls on every request). No new MCP tool.

**Current blocking path:**
- `mneme/src/mcp/server.rs` (~183) `wiki_model_update` → `ServerState::model_update(false, p.model)` (`mneme/src/mcp/mod.rs` ~667) → `blocking(move || crate::model::provision(&st.model, force)).await` (runs the whole download to completion).
- `model::provision` → `provision_entry` (`mneme/src/model/mod.rs` ~264) loops files, calls `download_file(url, dest, sha256, bytes)` (~153) which streams into `<dest>.part` in 4096-byte chunks and **atomically renames** to `dest` on sha256 success.
- `model::status` (`mneme/src/model/mod.rs` ~318) is computed **live** on every `wiki_status`: for each manifest file it stats `dir.join(filename)` → `present`/`verified`/`bytes`, and sets `complete = all verified`.

**Change — non-blocking dispatch + coalescing:**
- Add a small `ModelJob` on `ServerState` (mirror `JobManager`'s shape): `{ run_lock: Mutex<()>, in_flight: AtomicBool }` (a progress `Mutex` is optional — see below). Put it in `model/job.rs` or inline in `mcp/mod.rs`.
- Change `model_update` to **spawn and return immediately** instead of awaiting the download:
  ```rust
  // before: blocking(move || crate::model::provision(&st.model, force)).await
  // after:
  if self.model_job.in_flight.swap(true, Ordering::SeqCst) {
      return crate::model::status(&self.model); // already downloading — just report current status
  }
  let st = Arc::clone(self);
  let job = Arc::clone(&self.model_job);
  tokio::task::spawn_blocking(move || {
      let _g = job.run_lock.lock().unwrap();
      let _ = crate::model::provision(&st.model, force); // errors surfaced via status (Phase 4)
      job.in_flight.store(false, Ordering::SeqCst);
  });
  crate::model::status(&self.model) // immediate snapshot: complete=false, in_flight=true
  ```
  (Keep the existing "switching models is deferred" guard before dispatch. Confirm `ServerState` is already `Arc`-wrapped — it is, methods take `self: &Arc<Self>`.)

**Change — surface download progress on `wiki_status.model`** (smallest viable, no change to the tight `download_file` loop):
- In `model::status`, for each file whose final path is **absent**, also stat `dir.join(format!("{filename}.part"))`. If the `.part` exists, report `bytes = part_size` and a per-file in-progress signal. `bytesTotal` comes from the manifest (`mf.bytes`, already known).
- Add a `download: Option<ModelDownloadStatus>` field to `ModelStatus` (or reuse `files[].bytes` + a top-level `downloading: bool`). Recommended shape:
  ```rust
  pub struct ModelDownloadStatus { pub phase: String, pub bytes_done: u64, pub bytes_total: u64 } // phase: idle|downloading|verifying|done|error
  ```
  Populate `bytes_done = Σ(final file bytes where present) + Σ(.part sizes)`, `bytes_total = Σ(manifest bytes)`. `phase = downloading` while `in_flight`; `verifying` when a `.part` is at full size (post-stream sha256 + rename pending); `done` when `complete`.
- This keeps progress **derived from the filesystem** — same philosophy as the reindex "derived status" decision. A precise in-memory byte counter (threading a callback through `download_file`) is a possible refinement but **not required**; the `.part` size is a good-enough signal and avoids touching the hot loop.
- `wiki_status` then exposes `model.download.{phase,bytesDone,bytesTotal}` with no extra call.

### Phase 3 — Default Mneme log file

Mneme logs to stdout/stderr, which Persephone's main process captures as `[Mneme] …` console lines. **Nobody sees these in practice:** a packaged build has no console, and in dev they're buried in the `npm start` terminal. There is no log file. When Mneme misbehaves (e.g. the disconnect during the failed add-root) there's nothing to inspect afterward.

- **Path:** a fixed file under the Persephone data dir, alongside the existing config/model cache — `<userData>/data/mneme/mneme.log`. Mneme already receives `--config <userData>/data/mneme/mneme.toml`, so it knows this directory; derive the log path from the config's parent dir, **or** add an explicit `--log <path>` flag passed by `src/main/mneme-service.ts`. Prefer deriving from the config dir (no new flag) unless there's a reason to make it explicit.
- **Truncated/rewritten on each Mneme start** — a single current-session log, not a rolling archive. Latest run only; keep it simple.
- **Implementation:** Mneme already uses `tracing`. Add a **file layer** (truncating file writer) next to the existing stdout layer so the same events go to both. Confirm the level/filter (default `info`). Find where the subscriber is initialized (look in `mneme/src/main.rs` or a `logging`/`tracing` init) and add the layer there, after the config dir is known.
- **Keep stdout logging too** — the main-process `[Mneme]` capture stays as-is.
- This is small and independent of the other phases but bundled here at request; it directly aids diagnosing issues like the synchronous-add-root disconnect.

### Phase 4 — Surface background-job errors (only if needed)

Because indexing **and** model download are now async (Phases 1–2), a failure *during* the background job can't be returned from the originating MCP call. Two checks:
- **Reindex:** confirm `reconcile_job` already writes `reindex.phase = Error` on failure (the `Phase::Error` variant exists). If it does, no-op. If the background path swallows errors, set `Phase::Error`.
- **Model download:** the spawned `provision` call's `Result` is dropped (`let _ = …`). On error, set the `ModelJob` state so `model::status` reports `download.phase = "error"` (and clear `in_flight`). Keep enough info for the editor to show "download failed".

Persisting a per-file `errored` index count is **out of scope**.

### Phase 5 — Update the Mneme config editor to display reindex + download progress

**This is the separate Persephone-side phase.** All progress lives in Mneme's memory / filesystem; Persephone only sees it when it calls `wiki_status`. The editor must keep polling while any background job runs and render it.

- **Files:** `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` (poll loop + state), `RootsPanel.tsx` (reindex render), `ModelPanel.tsx` (download render). Update `mnemeTypes.ts` for the new `model.download` shape.
- **Add a status poll loop:** poll `refreshStatus()` (→ `wiki_status`) on a timer (**every 1500 ms**, tune during testing) while **any** background job is active — i.e. any root's `reindex.phase` is `Scanning`/`Embedding`, **or** `model.download.phase` is `downloading`/`verifying`. Stop when nothing is active. Start/stop the loop:
  - kick it off after `addRoot` succeeds and after `updateModel()` is called (a download just started),
  - and after `initConnection`/`reconnect`/`refreshStatus` whenever the latest status shows an active job,
  - guard with `connectionStatus === "connected"`, and clear the timer in `getRestoreData()`/dispose so it doesn't leak across navigation or poll a dead connection.
- **Render (Roots panel):** the panel already maps `reindexProgress[rootName]` → progress bar. Verify it picks up the **background** add-root job (reads from `wiki_status`). Show `processed / total` + phase (`Scanning…` / `Embedding 20 / 100` / `Done` / `Error`). The per-root Reindex button reflects an active job the way reindex-all does via `s.reindexProgress`.
- **Render (Model panel):** while `model.download.phase` is `downloading`/`verifying`, show a progress bar `bytesDone / bytesTotal` (use the existing `formatBytes`) + phase label, and make `updateModel()` return immediately (no longer a long `showProgress` await — it kicks off the background download, then the poll loop drives the bar). The existing per-file `present/verified/bytes` list still renders; `complete` flips when done.
- **Render the Error phase** distinctly (red text / warning dot) for both reindex and download, so a failed background job is visible rather than silently stuck.
- **Header indicator (optional polish):** `src/renderer/api/mneme-status.ts` / `MainPage.tsx` — when any root is indexing **or** the model is downloading, the tri-state Mneme dot could show a subtle "working" affordance. Keep it optional; the editor is the primary surface.
- **No new IPC / no schema change.** Purely: poll `wiki_status` while active, render the (existing + new `model.download`) fields.

## Implementation checklist

**Phase 1 — async add-root (Rust)**
- [x] `add_root` in `mneme/src/mcp/mod.rs` → background reconcile via new `IndexManager::spawn_reconcile`; returns before indexing completes.
- [ ] Manual: verify `wiki_status` shows the new root immediately with progress filling in; add-root no longer times out on a large root.

**Phase 2 — async model download (Rust)**
- [x] Add `ModelJob { run_lock, in_flight, errored }` to `ServerState`; `model_update` spawns `provision` on a detached thread and returns `build_model_status()` immediately (model-switch guard kept; coalesces if already in flight).
- [x] Extend status to report download progress: `model::download_progress` stats `<file>.part`; `ModelStatus.download { phase, bytesDone, bytesTotal }`.
- [ ] Manual: verify `wiki_model_update` returns immediately and `wiki_status.model.download` advances during a real download; no 60 s timeout.

**Phase 3 — log file (Rust)**
- [x] Truncating file layer writing `<config-dir>/mneme.log`, rewritten each `serve` start, level `info`, alongside stderr.

**Phase 4 — error surfacing (Rust)**
- [x] Background reindex failure sets `reindex.phase = Error`; model-download failure sets `download.phase = error` (clears `in_flight`).
- [x] `cargo build --release` + `cargo test` green (covers Phases 1–4).

**Phase 5 — editor display (Persephone renderer)**
- [x] `wiki_status` poll-while-active loop in `MnemeConfigEditorModel` — active if any root is `scanning`/`embedding` **or** `model.download.phase` is `downloading`/`verifying`; kicked (30 s grace) on add-root + updateModel; stops when idle; connection-guarded; cleared on dispose + disconnect.
- [x] Roots panel renders per-root `processed / total` + phase (incl. `Error`) for the background job, not just self-triggered reindex.
- [x] Model panel renders `bytesDone / bytesTotal` + phase during download; `updateModel()` returns immediately and the poll loop drives the bar; `mnemeTypes.ts` has `model.download`.
- [ ] (Optional) header indicator "working" affordance — **deferred** (not implemented).
- [x] `tsc --noEmit` + `eslint` green.

## Concerns / open questions

- **Cancellation token for the background job:** `reconcile_blocking` was called with `CancellationToken::new()` (orphan token). For the background job, use the server/root shutdown token so app/Mneme shutdown can stop indexing cleanly. Confirm the exact token the watcher passes to `reconcile_coalesced` and reuse the same source.
- **Coalescing semantics:** `reconcile_coalesced` collapses a burst — if add-root fires while the watcher already triggered a pass, it sets `rerun` and returns. That's correct behavior (the rerun will catch the new root's files). Just confirm a brand-new root with no prior pass actually starts a pass (not only sets `rerun`).
- **Model-download progress signal:** the recommended approach derives `bytesDone` from the `.part` file size (no change to `download_file`'s hot loop). Verify the downloader actually streams to a single `<dest>.part` and renames on success (it does — `model/mod.rs` ~153). If a more precise/phased counter is wanted later (e.g. a real "verifying" phase during sha256), thread a `Mutex<…>`/callback through `download_file` — refinement, not required.
- **Model-download coalescing:** a second `wiki_model_update` while one is in flight must **not** start a parallel download — the `in_flight.swap(true)` guard returns the current status instead. Confirm `force=true` (re-download) interacts sanely with the guard.
- **Poll interval / lifecycle:** 1500 ms is a starting point; ensure the loop is torn down on editor dispose, navigation away, and Mneme disconnect so it doesn't poll a dead connection. Don't poll when `connectionStatus !== "connected"`.
- **Push vs poll (future):** a `notifications/progress` channel or a resource subscription (US-661) would replace polling later. Polling is the right call for this task — simple, no new protocol surface.

## Acceptance criteria

1. `wiki_add_root` on a large root (e.g. `D:\projects\EverGreen\wiki`, thousands of files) **returns within a second** and does **not** time out; the root appears immediately in `wiki_status`/`wiki_list_roots`.
2. While the background index runs, `wiki_status.roots[<new root>].reindex` reports `phase` + increasing `processed` toward `total`.
3. `wiki_model_update` **returns within a second** and does **not** time out on a fresh (uncached) model; while the download runs, `wiki_status.model.download` reports `phase` + increasing `bytesDone` toward `bytesTotal`, and `model.complete` flips to `true` when finished.
4. The US-664 editor shows **live progress** without manual Refresh — a per-root reindex bar (`processed / total` + phase) for the background add-root job, **and** a model-download bar (`bytesDone / bytesTotal`) in the Model panel — each stops/clears when its job completes.
5. On failure the editor shows the relevant `Error` phase (reindex or download) rather than hanging.
6. `<userData>/data/mneme/mneme.log` exists after a Mneme start, contains the session's `info`-level events, and is **truncated** (not appended) on the next start.
7. `cargo build --release` and `cargo test` pass.
