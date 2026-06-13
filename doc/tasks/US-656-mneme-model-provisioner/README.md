# US-656 — Mneme Model Provisioner (download + sha256 + cache)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 2 (embeddings + hybrid search)
**Status:** Implemented (Phase 2) — `cargo build --release` clean (no warnings); full suite **65 tests**
(13 + 19 + 4 + 7 + 11 + 11) pass. Live download verified end-to-end against a local HTTP server serving
the real model files: `model.onnx` (340,318,797 B) + `tokenizer.json` (17,082,734 B) fetched + sha256-verified
into `…\persephone\data\mneme\models\gte-multilingual-base-int8-v1\`; `mneme status` reports
`complete: true`; idempotent re-run skips both files. Awaiting epic-level review (Rust crate → `/review`
and `/userdoc` do not apply).

---

## Goal

Give Mneme the ability to **fetch the embedding model + tokenizer from a location we host**
(GitHub Release assets), verify each file by **sha256**, store it in a **global cache directory**,
and **resume** an interrupted download — with an **offline / local-path override** for air-gapped
or pre-provisioned setups. This is the provisioner only: it puts the right files on disk and reports
their state. It does **not** load them into an inference session — that is US-657. **FTS text search
keeps working with no model present** (D11), so provisioning is entirely independent of the index.

---

## Background

### Where this sits in the epic

Phase 2 turns the text-search wiki (Phase 1, US-652–655) into a semantic one. US-656 is the first
Phase-2 task: it lands the model bytes. US-657 then builds the `ort`/`tokenizers` inference engine on
top of the cached files; US-658 wires vector/hybrid search; US-659 adds the worker/progress model.
Nothing in US-656 touches the index, search, or watcher.

### Resolved epic decisions that constrain this task

- **D5 / model identity** — target model is `gte-multilingual-base`, precision `int8` (fp16 fallback
  decided at US-657 if int8 underperforms on DirectML). Embed dim **768**, context 8192. These are the
  defaults already baked into `index/path.rs` (`DEFAULT_MODEL_NAME` / `DEFAULT_PRECISION`).
- **"Model download source" (RESOLVED 2026-06-13)** — download from **our own hosted GitHub Release
  assets** (not live HuggingFace), on a **dedicated model release/tag** so the ~340 MB binary isn't
  re-uploaded per app build and keeps a stable URL. Pinned + **sha256-verified** via a **`models.json`
  manifest** (`name, version, url, sha256, dims, precision`); **resumable**; **offline/local-path
  override**. HuggingFace is only the upstream we convert/quantize from. **Out of scope:**
  searching/downloading arbitrary other models (future enhancement) — v1 ships only the model(s) we host.
- **`wiki_model_update` v1 (RESOLVED, epic Notes)** — "re-download / checksum-verify the **currently
  configured** model"; the `model?` param is **reserved** (parameterized switching deferred).
- **Versioned cache / no migration** — a model+precision change selects a *different* index path → a
  fresh rebuild (already implemented). The provisioner's cache layout must carry the same identity so a
  re-provision of a different model lands in a different directory.
- **Local dev model already downloaded (epic Notes, 2026-06-13)** — the int8 ONNX +
  tokenizer are in `temp/mneme-model/` (gitignored). The **int8 ONNX sha256 is known**:
  `ab2bd164ebd8ca9003dc49a981b611e849b5d326f504c8873ba76e07fa6c0082`
  (`onnx/model_int8.onnx`, 340 MB; `tokenizer.json` 17 MB; from HF `onnx-community/gte-multilingual-base`).

### Existing code surfaces (exact)

| Surface | Location | Current state |
|---------|----------|---------------|
| `ModelConfig` | `mneme/src/config.rs:50-55` | `{ name: Option<String>, path: Option<PathBuf>, precision: Option<String> }`, all `None` by default. `path` has **no default computation** — the doc-comment (line 11) says US-656's cache dir should share the `persephone-mneme` base. |
| App-data base resolution | `mneme/src/config.rs:124-129` (`default_config_path`) | uses `dirs = "5"` → `dirs::config_dir()/persephone-mneme/mneme.toml`. |
| `model_id` | `mneme/src/index/path.rs:19-23` | `"<name>-<precision>"`, defaults `gte-multilingual-base` / `int8`. |
| MCP `wiki_model_update` tool | `mneme/src/mcp/server.rs:149-152` | returns the plain-text `model_update_notice()`. |
| `model_update_notice()` | `mneme/src/mcp/mod.rs:491-495` | returns "model management arrives in US-656 …". |
| `ModelUpdateParams` | `mneme/src/mcp/params.rs:165-169` | `{ model: Option<String> }`, reserved. |
| `ServerState` | `mneme/src/mcp/mod.rs:40-46` | holds `model: ModelConfig` (cloned from cfg at `new`). |
| `wiki_status` result | `mneme/src/mcp/results.rs:114-133` (`StatusRoot` / `StatusResult`) | reports roots + index inventory; **no model block**. |
| `mneme status` CLI | `mneme/src/main.rs:121-136` | prints roots + indexable file counts; no model. |
| `MnemeError` | `mneme/src/error.rs` | 19 variants; **no HTTP / download / checksum** variant. |
| Deps already present | `mneme/Cargo.toml` | `sha2 = "0.10"`, `hex = "0.4"`, `dirs = "5"`, `serde_json = "1"`, `tokio` (multi-thread). **No HTTP client.** |

There is **zero** existing provisioner / download / manifest code (confirmed by grep).

### Architecture pattern to follow

- The whole crate keeps blocking I/O off the async runtime: every MCP tool body runs inside
  `spawn_blocking` (`mcp/mod.rs` `blocking()` helper), and the CLI runs with **no tokio runtime**.
  A **blocking HTTP download** fits both: called directly from the CLI, wrapped in `spawn_blocking`
  from `wiki_model_update`. (Async streaming via `reqwest` would add runtime coloring for no benefit —
  v1 has no live progress; that's US-659.)
- Bundled text assets use `include_str!` (e.g. `mcp/server.rs` embeds `assets/wiki-guide.md`). The
  manifest follows the same pattern.
- `stdout` is reserved (readiness line + `status`/`reindex` human reports). All download diagnostics
  go through `tracing` → stderr.

---

## Implementation plan

### Step 1 — Add the HTTP client dependency

`mneme/Cargo.toml`, under `[dependencies]` (US-656 block):

```toml
# --- US-656: model provisioner --------------------------------------------
ureq = { version = "2", features = ["tls"] }   # blocking HTTP + rustls (no system OpenSSL → minimal-install)
```

`sha2`, `hex`, `dirs`, `serde_json` are **already present** — reuse them. Under `[dev-dependencies]`
add a tiny local HTTP fixture server so tests never hit the network:

```toml
tiny_http = "0.12"   # serves a fixture blob (supports Range) for provisioner tests
```

> Final crate/version verified at implementation; if `ureq` 3.x is current, use it and adjust the TLS
> feature name. `tiny_http` may be replaced by an `axum` test server (axum is already a dep) if simpler.

### Step 2 — The bundled manifest: `mneme/assets/models.json`

Hand-authored source asset (like `wiki-guide.md`). Schema is **per-file** (a model is ≥2 files — see
Concern C2), keyed by `modelId` (`<name>-<precision>`):

```json
{
  "schema": 1,
  "models": [
    {
      "name": "gte-multilingual-base",
      "precision": "int8",
      "version": "1",
      "dims": 768,
      "files": [
        {
          "filename": "model.onnx",
          "url": "https://github.com/andriy-viyatyk/persephone/releases/download/mneme-models-v1/gte-multilingual-base-int8.onnx",
          "sha256": "ab2bd164ebd8ca9003dc49a981b611e849b5d326f504c8873ba76e07fa6c0082",
          "bytes": 340000000
        },
        {
          "filename": "tokenizer.json",
          "url": "https://github.com/andriy-viyatyk/persephone/releases/download/mneme-models-v1/gte-multilingual-base.tokenizer.json",
          "sha256": "<fill at release-upload time>",
          "bytes": 17000000
        }
      ]
    }
  ]
}
```

> URLs/sha256 are finalized when the release is uploaded — see Concern C1. The ONNX sha256 is already
> known (epic Notes).

### Step 3 — New module `mneme/src/model/`

`mneme/src/model/mod.rs` — the provisioner. Suggested API (plain functions + small structs, no async):

```rust
// Bundled manifest, parsed once.
const MANIFEST_JSON: &str = include_str!("../../assets/models.json");

#[derive(Deserialize)] pub struct Manifest { pub schema: u32, pub models: Vec<ModelEntry> }
#[derive(Deserialize, Clone)] pub struct ModelEntry {
    pub name: String, pub precision: String, pub version: String,
    pub dims: u32, pub files: Vec<ModelFile>,
}
#[derive(Deserialize, Clone)] pub struct ModelFile {
    pub filename: String, pub url: String, pub sha256: String, pub bytes: u64,
}

/// Parse the bundled manifest (MnemeError::Config on bad JSON).
pub fn manifest() -> Result<Manifest>;

/// The manifest entry for the configured model (name+precision, defaults applied).
pub fn target_entry(cfg: &ModelConfig) -> Result<ModelEntry>;

/// Cache base: cfg.model.path override, else dirs::config_dir()/persephone/data/mneme/models
/// (= Persephone's userData/data/mneme on every platform; see C4).
pub fn cache_base(cfg: &ModelConfig) -> PathBuf;

/// Per-model dir under the base: <base>/<name>-<precision>-v<version>/.
pub fn model_dir(cfg: &ModelConfig) -> Result<PathBuf>;

#[derive(Serialize)] pub struct FileStatus { pub filename: String, pub present: bool, pub verified: bool, pub bytes: u64 }
#[derive(Serialize)] pub struct ModelStatus {
    pub name: String, pub precision: String, pub version: String, pub dims: u32,
    pub dir: String, pub complete: bool, pub files: Vec<FileStatus>,
}

/// Inspect the cache without downloading: for each manifest file, present? + sha256 matches?
pub fn status(cfg: &ModelConfig) -> Result<ModelStatus>;

/// Download any missing/invalid file, verify sha256, return the final status. Idempotent:
/// a fully-present, verified model is a no-op. `force` re-downloads even if present (verify-refresh).
pub fn provision(cfg: &ModelConfig, force: bool) -> Result<ModelStatus>;
```

Internal `download_file(url, dest, expected_sha256, expected_bytes)`:
1. Resolve `<dest>.part`. If it exists, its length = resume offset; send `Range: bytes=<offset>-`.
2. `ureq::get(url)`; if a Range was requested, accept **206** (append) — on **200** (server ignored
   Range), truncate `.part` and start over.
3. Stream the response `Read` in chunks to the `.part` file, feeding each chunk into a `Sha2-256`
   hasher **as it is written** (single pass over the bytes; on resume, pre-seed the hasher by reading
   the existing `.part` once).
4. On EOF: finalize the digest → `hex`. If it ≠ `expected_sha256` → delete `.part`, return
   `MnemeError::Checksum`. Else **atomic rename** `.part` → `dest` (`std::fs::rename`).
5. `create_dir_all(model_dir)` first; per-file work so a partial model can finish later.

`provision` loops the entry's files, calling `download_file` for each not-already-verified (or all, if
`force`), then returns `status`.

### Step 4 — Error variants

`mneme/src/error.rs`, add after `Internal`:

```rust
#[error("download error: {0}")]
Download(String),
#[error("checksum mismatch for {file}: expected {expected}, got {got}")]
Checksum { file: String, expected: String, got: String },
```

Map `ureq::Error` / `io::Error` from the download path to `Download`. (`io::Error` already has a
`#[from]`; wrap network-specific failures explicitly so the message is clear.)

### Step 5 — Register the module

`mneme/src/lib.rs`: add `pub mod model;` (alphabetical, after `markdown`). Update the status
doc-comment to mention US-656 (model provisioner; FTS still works without the model).

### Step 6 — CLI subcommand

`mneme/src/main.rs`, add to `Command`:

```rust
/// Download + verify the configured embedding model into the cache (FTS works without it).
ModelUpdate {
    /// Re-download and re-verify even if already present.
    #[arg(long)] force: bool,
},
```

Handler: call `persephone_mneme::model::provision(&cfg.model, force)?`, then `println!` a human report
(model id, dir, per-file present/verified/bytes, "complete"/"incomplete"). Also extend
`Command::Status` to print a model line (`model::status(&cfg.model)` — present? dir? complete?).

> `model-update` (clap kebab-cases `ModelUpdate`) mirrors the MCP `wiki_model_update` name.

### Step 7 — Wire MCP `wiki_model_update`

- `mneme/src/mcp/mod.rs`: replace `model_update_notice()` with an async
  `model_update(self: &Arc<Self>, force: bool) -> Result<ModelStatus>` that runs
  `crate::model::provision(&st.model, force)` inside `blocking()`. (If the `model?` param is supplied
  and names a *different* model than configured → return `MnemeError::Config("switching models is
  deferred; configure model in mneme.toml and re-run")` — switching is out of scope per the epic.)
- `mneme/src/mcp/server.rs`: `wiki_model_update` now `structured(self.state.model_update(false).await?)`.
  Update the `#[tool(description=…)]` to "Download/verify the configured embedding model into the cache."
- `mneme/src/mcp/params.rs`: keep `ModelUpdateParams { model: Option<String> }`; refresh the doc-comment
  ("reserved — model switching deferred").
- `mneme/src/mcp/results.rs`: reuse `model::ModelStatus` directly (it derives `Serialize`) — no new
  result struct needed. (`structured()` takes any `Serialize`.)

### Step 8 — `wiki_status` model block (lightweight)

Extend `StatusResult` (`results.rs`) with `model: Option<ModelStatusBrief>` where brief =
`{ name, precision, present (complete), dir }`, populated by `model::status` in the `status()` method
(`mcp/mod.rs`). Keeps the monitoring UI (US-664) and agents informed whether embeddings are available.

> Minor; if it bloats the change, defer to US-657. Recommended to include — it's a few lines and
> `wiki_status` is documented to report "model".

### Step 9 — `mneme.example.toml` + README

- `mneme/mneme.example.toml`: document `model.path` as the **cache-base override** (default
  `<persephone-userData>/data/mneme/models`, i.e. `AppData\Roaming\persephone\data\mneme\models` on
  Windows), and that the model downloads on first `model-update` / `wiki_model_update`.
- `mneme/README.md`: add a "Model provisioning" subsection (CLI `mneme model-update`, MCP
  `wiki_model_update`, cache layout, offline override); update the status banner + module-layout block
  (add `model/`); note `models.json` is a hand-authored asset.

### Step 10 — Tests

`mneme/tests/model.rs` (hermetic — no network):
- Spin a local `tiny_http` (or axum) server serving a small fixture blob with a **known sha256**;
  point a test-built `ModelFile.url` at it. Cover:
  - **fresh download** → file present, sha256 verified, `.part` gone, atomic rename happened.
  - **sha256 mismatch** → `MnemeError::Checksum`, no final file, `.part` removed.
  - **resume**: pre-write a partial `.part`, serve the remainder via Range (206) → completes + verifies.
  - **server ignores Range** (200): partial `.part` is discarded, full re-download succeeds.
  - **already-present** → `provision` is a no-op (no second request); `force=true` re-downloads.
  - **offline/local-path override**: `cfg.model.path` pointing at a dir already holding verified files
    → `status.complete == true`, `provision` no-op.
- `manifest()` parses the bundled `models.json`; `target_entry`/`model_dir`/`cache_base` resolve the
  defaults correctly.
- Unit-test the manifest is internally consistent (every entry has ≥1 file; modelId unique).

Run `cargo build --release` (clean, no warnings) + `cargo test` (all green) per the Rust-skip rule
(`/review` and `/userdoc` do not apply to the crate).

---

## Concerns / open questions (with proposed resolutions)

### C1 — The model isn't hosted yet *(no public release needed for build/test — RESOLVED)*
The "download from our hosted GitHub Release" path can't run against a real GitHub URL until the assets
exist, and a *hidden* (draft) release gives no unauthenticated download URL anyway — a usable no-auth
URL requires a *published* (visible) release, which conflicts with keeping the model off the product's
releases page until launch.
**Resolution (agreed):** **Don't host anything to build or verify US-656.** We have the files locally
(`temp/mneme-model/`) and the int8 ONNX sha256.
- **Live dev test:** spin up a **simple local HTTP server** serving `temp/mneme-model/` and point the
  manifest `url`s at `http://127.0.0.1:<port>/…` **temporarily** — this exercises the real download +
  resume + sha256 path against the real 340 MB bytes. (`model.path` offline override is the other route:
  drop the files straight into the cache dir.)
- **Automated tests** stay offline (a local fixture server in `tests/model.rs`) — never the network.
- **Live test against the real hosted URL is deferred to after the first release (US-665).** When we
  host then, prefer a **separate repo** (e.g. `…/mneme-models`) or an **own Hugging Face model repo** so
  the assets don't clutter Persephone's releases — and only then fill the real `url`s + `tokenizer.json`
  sha256 into `models.json` (the int8 ONNX sha256 is already known). Until then `models.json` carries the
  intended GitHub-Release URLs as the production default, overridden to localhost for the dev test.

### C2 — Manifest schema is per-*file*, not the single `{url, sha256}` the epic sketched
A model is ≥2 files (ONNX + `tokenizer.json`, maybe `config.json`); a single `url`/`sha256` can't
describe it.
**Proposed resolution:** Refine the manifest to a **`files: [{ filename, url, sha256, bytes }]`** array
per model entry (Step 2). This is a faithful elaboration of the epic's intent (still our-hosted, still
sha256-pinned per asset), not a design change. Note the refinement in the epic if desired, but it needs
no re-decision.

### C3 — Which files does US-656 fetch? (`config.json` / tokenizer configs?)
US-657 inference needs the ONNX + `tokenizer.json`; `config.json` carries metadata (dims, etc.) we
already hardcode (`EMBED_DIM = 768`).
**Proposed resolution:** v1 fetches exactly **`model.onnx` + `tokenizer.json`** (the two US-657 needs).
Add `config.json` to the manifest only if US-657 turns out to need it — the per-file array makes that a
one-line manifest edit, no code change.

### C4 — Cache base location *(DECIDED: under Persephone's data folder)*
**Decision (user):** Co-locate Mneme's data under **Persephone's own data folder**, in a `mneme`
subfolder (not a sibling `persephone-mneme` dir). Cache base =
**`dirs::config_dir()/persephone/data/mneme/models`** — `dirs::config_dir()/persephone` is exactly
Persephone's Electron `userData` on every platform (`AppData\Roaming\persephone` on Windows,
`~/.config/persephone` on Linux), and `…/persephone/data` is its data subfolder (already holds
`data/cache`). Files land at `…/persephone/data/mneme/models/<name>-<precision>-v<version>/`.
`cfg.model.path` overrides the base entirely (offline / pre-provisioned setups — see C5).
**Accepted tradeoff:** on Windows this is **Roaming**, and the model is ~340 MB — on a domain with
roaming profiles that could bloat sync. We follow Persephone's existing convention (its data, incl.
`data/cache`, already lives in Roaming); `model.path` → a Local path is the escape hatch if it ever
matters.
**Note (out of US-656 scope):** the *standalone* config-path default is still
`config_dir()/persephone-mneme/mneme.toml` (US-652). As a Persephone sidecar the config path is passed
explicitly via `--config` (US-660), so Persephone can point it at `…/persephone/data/mneme/mneme.toml`
for full consistency — reconciling the standalone default is left to US-652/US-660.

### C5 — `model.path` semantics: cache base vs direct file path
The epic says "offline/local-path override" without pinning what `path` points at.
**Proposed resolution:** `model.path` = **cache-base directory override**. The provisioner resolves
`<path>/<name>-<precision>-v<version>/` under it and treats already-present, sha256-verified files as
complete (no download). This makes one field serve both "where downloads go" and "use my pre-provisioned
copy" — point `path` at a dir that already contains the verified files and provisioning is a no-op.

### C6 — Blocking `ureq` vs async `reqwest`
**Proposed resolution:** **`ureq`** (blocking, rustls-bundled — no system OpenSSL, preserving
minimal-install; lighter dep tree). It matches the crate's pattern: direct call from the runtime-less
CLI, `spawn_blocking` from MCP. v1 has **no live progress** (US-659 owns progress notifications), so
async streaming buys nothing. Range-based resume is a plain header + status-code check.

### C7 — Sync `wiki_model_update` blocks the MCP session during a ~340 MB download
US-655's `wiki_reindex` is likewise synchronous; the cancellable-job + progress model is US-659.
**Proposed resolution:** Accept a **synchronous** `wiki_model_update` for v1 (download runs in
`spawn_blocking`, so the tokio reactor isn't starved — other sessions/tools still respond; only the
calling tool invocation waits). US-659 later promotes it to a tracked job with progress notifications.
Document the v1 behavior in the tool description + guide.

### C8 — Concurrent provision calls racing on the same `.part`
Two `wiki_model_update`s (or CLI + MCP) could write the same `.part`.
**Proposed resolution:** Low risk for v1 (single local user). Guard cheaply with a per-model **lock
file** (`<model_dir>/.provision.lock` created `create_new`; second caller returns
`MnemeError::Download("a provision is already in progress")`). Acceptable to defer the lock to US-659's
JobManager if it complicates Step 3 — note it as a known v1 limitation if so.

### C9 — Should `wiki_search` announce "model not present" differently once US-656 lands?
Today text-mode `wiki_search` returns a note that vector/hybrid degrade to text (US-655).
**Proposed resolution:** **No change in US-656** — search still has no embeddings until US-657/658.
The note stays. US-656 only makes the bytes available; `wiki_status`'s new model block (Step 8) is the
single place that now reflects model presence.

### C10 — `models.json` as an asset vs a build-artifact under `assets/`
The repo rule is "`assets/` are build artifacts, never hand-edit" — but that's the **Persephone** root
`assets/`. `mneme/assets/` is **hand-authored crate source** (precedent: `wiki-guide.md`).
**Proposed resolution:** `mneme/assets/models.json` is **hand-authored source** for this crate, like
`wiki-guide.md` — outside the Persephone build-artifact rule. No tooling generates it.

---

## Acceptance criteria

- [x] `mneme/Cargo.toml` gains `ureq` (+ a dev-only fixture-server dep); `cargo build --release` is
      clean with no warnings.
- [x] `mneme/src/model/mod.rs` exists with `manifest` / `target_entry` / `cache_base` / `model_dir` /
      `status` / `provision`; registered via `pub mod model;` in `lib.rs`.
- [x] `mneme/assets/models.json` exists, parses, and lists the `gte-multilingual-base-int8` entry with
      per-file `{ filename, url, sha256, bytes }`.
- [x] `MnemeError` has `Download` + `Checksum` variants; download/network failures map to `Download`,
      a digest mismatch to `Checksum` (and deletes the `.part`, leaving no final file).
- [x] `mneme model-update [--force]` downloads + sha256-verifies the configured model into
      `<persephone-userData>/data/mneme/models/<modelId>-v<ver>/` (`AppData\Roaming\persephone\data\mneme\models\…`
      on Windows) and prints a per-file report; `mneme status` shows model presence.
- [x] MCP `wiki_model_update` provisions the configured model and returns a structured `ModelStatus`;
      a different `model?` value returns the "switching deferred" error. `wiki_status` includes a model
      block.
- [x] Resume works: an interrupted download continues from the `.part` via `Range` (206) and verifies;
      a Range-ignoring server (200) cleanly restarts. *(covered by the `test_resume_206` /
      `test_server_ignores_range_200` unit tests — Python's `http.server` returns 200 for Range, so the
      live test exercised only the 200 path.)*
- [x] Offline override: `model.path` pointing at a dir with verified files → `status.complete == true`,
      `provision` is a no-op.
- [x] `cargo test` passes, all provisioner tests hermetic (local fixture server — **no network**).
- [x] FTS `wiki_search` / index / watcher behavior is **unchanged** (no edits to index/search/watcher).

---

## Files changed (planned)

| File | Change |
|------|--------|
| `mneme/Cargo.toml` | + `ureq` (deps), + fixture-server dev-dep |
| `mneme/assets/models.json` | **new** — hand-authored manifest (per-file sha256-pinned) |
| `mneme/src/model/mod.rs` | **new** — provisioner (manifest, cache resolution, download+resume+verify, status) |
| `mneme/src/lib.rs` | + `pub mod model;`; status doc-comment |
| `mneme/src/error.rs` | + `Download(String)`, + `Checksum { file, expected, got }` |
| `mneme/src/main.rs` | + `Command::ModelUpdate { force }` handler; model line in `Status` |
| `mneme/src/mcp/mod.rs` | `model_update_notice()` → async `model_update(force)`; model block in `status()` |
| `mneme/src/mcp/server.rs` | `wiki_model_update` calls the provisioner; description updated |
| `mneme/src/mcp/params.rs` | `ModelUpdateParams` doc-comment refreshed (model switching deferred) |
| `mneme/src/mcp/results.rs` | + model block on `StatusResult` (reuse `model::ModelStatus`) |
| `mneme/mneme.example.toml` | document `model.path` as cache-base override |
| `mneme/README.md` | "Model provisioning" subsection; status banner; module-layout `model/` |
| `mneme/tests/model.rs` | **new** — hermetic provisioner tests (local fixture server) |
| `doc/active-work.md` / `doc/epics/EPIC-032.md` | mark US-656 in progress; link this doc |

**Deferred to after first release (US-665, C1):** host the assets (separate repo / HF model repo to keep
Persephone's releases clean), then fill real `url`/`sha256` into `models.json` and run a live
`model-update`. Build + all tests + a local-HTTP-server live test need no hosting.

## Files that need NO changes

`mneme/src/index/**` (path/schema/search unchanged — FTS works without the model), `mneme/src/indexer/**`,
`mneme/src/watcher/**`, `mneme/src/store/**`, `mneme/src/markdown/**`, and all `wiki_search` /
`wiki_reindex` logic. US-656 is provisioning only; it does not read, embed, or alter any index.

---

## Implementation notes (post-hoc)

Deviations from the plan, all benign:

1. **`ureq` 3.x** (3.3.0) instead of the planned 2.x — 3.x is current; download reader is
   `response.into_body().into_reader()`, feature `rustls`. Verified working against the live server.
2. **`tiny_http` 0.12** used for the test fixture server (it honors `Range`, so `test_resume_206`
   exercises the real 206 path); 11 hermetic `tests/model.rs` tests, no network.
3. **`tokenizer.json` sha256 is a real pin**, not a placeholder — computed from the local
   `temp/mneme-model/tokenizer.json` (`3a56def2…`). The int8 ONNX sha256 (`ab2bd164…`) was already known.
4. **`provision_entry(entry, base_dir, force)`** added as a pub helper so tests inject a localhost URL
   without going through the bundled manifest; `provision(cfg, force)` is the production entry point.
5. **`model_update(force, requested_model)`** carries the `model?` MCP param through so a mismatched
   model name returns the "switching deferred" `MnemeError::Config`.
6. **`StatusResult.model`** is `Option<crate::model::ModelStatus>` (`skip_serializing_if`), populated
   via `model::status(...).ok()` — a manifest/cache read error degrades to `null`, never fails `status`.

**Live test (2026-06-13):** `models.json` URLs were temporarily pointed at a local `python -m
http.server` serving `temp/mneme-model/`; `mneme model-update` downloaded + sha256-verified both files
into `…\persephone\data\mneme\models\gte-multilingual-base-int8-v1\`, `mneme status` showed
`complete: true`, and a re-run skipped both. The manifest was then reverted to the production
GitHub-Release URLs and the crate rebuilt clean. **Note:** Python's `http.server` returns **200** for a
`Range` request (no 206), so the live run covered only the fresh-download/200 path; resume/206 is covered
by the unit tests.
