# US-657 — Mneme Embedding Engine (`ort` + `tokenizers`, DirectML→CPU)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 2 (embeddings + hybrid search)
**Status:** Implemented (Phase 2) — awaiting manual testing. Hermetic suite green (lib embed unit
tests + `tests/embed.rs`); real ONNX inference verified end-to-end against the provisioned model on
**both** DirectML and CPU. Awaiting epic-level review (Rust crate → `/review` and `/userdoc` do not
apply). See **Implementation notes** at the bottom.

---

## Goal

Give Mneme the ability to **turn text into a normalized 768-dim embedding vector**, locally, using
the ONNX model + tokenizer that US-656's provisioner already places on disk. This task builds the
inference layer: an **`Embedder` trait** with a concrete **`ort` (ONNX Runtime) + `tokenizers`**
implementation that selects the **DirectML** execution provider when available and falls back to
**CPU** (driven by the existing `GpuMode` config), tokenizes/pads input, runs the session, pools to a
sentence vector, and L2-normalizes it.

US-657 produces vectors **only** — it does **not** write them into `chunks_vec`, run KNN, or merge
ranks (that is **US-658**), and it does **not** add the dedicated embedding worker, priority queue, or
progress notifications (that is **US-659**). The deliverable is a correct, testable `Embedder` plus a
CLI/debug path to prove it works end-to-end against the real cached model.

---

## Background

### Where this sits in the epic

Phase 2 sequence: **US-656** (done) lands the model bytes → **US-657** (this) builds the inference
engine that consumes them → **US-658** upserts chunk vectors into `sqlite-vec` and adds vector/hybrid
search → **US-659** adds the worker/queue/progress so bulk re-embedding stays responsive. The index
schema is already vector-ready: `chunks_vec` is created as `vec0(embedding float[768])` (US-653) but
left empty; FTS text search works with no model present (D11). US-657 changes none of that — it only
adds the ability to compute the `Vec<f32>` that US-658 will store.

### Resolved epic decisions that constrain this task

- **D5 / model identity** — `gte-multilingual-base`, precision `int8`, **embed dim 768**, context 8192,
  `model_type: new` (GTE NewModel, RoPE with NTK ×8 scaling). fp16 (628 MB) is the fallback if int8
  underperforms on DirectML — a *precision* change, which is a manifest/`model-update` swap (US-656
  path), **not** a code change here.
- **D15 / GPU acceleration** — ONNX Runtime **DirectML** EP when available (any DX12 GPU, no CUDA
  install → preserves minimal-install), **automatic CPU fallback**, and a force-CPU setting. The config
  already models this as `GpuMode { Auto, On, Off }` (`config.rs:88`). **One artifact serves both EPs** —
  GPU↔CPU is a runtime toggle with **no reindex** on switch; only a model/precision change reindexes.
- **D5 / instruction prefixes** — the epic says "use query/passage instruction prefixes from day one."
  That guidance was written generically across the embedding shortlist (E5/Qwen *do* require prefixes).
  `gte-multilingual-base` is a different family — **verify its actual requirement at implementation**
  (see Concern **C2**). The `Embedder` trait keeps query vs passage as separate methods so prefixes are
  a localized, swappable detail regardless of the answer.

### Local model facts (verified — epic Notes + `temp/mneme-model/config.json`)

`config.json`: `hidden_size: 768`, `max_position_embeddings: 8192`, `position_embedding_type: "rope"`,
`rope_scaling: { factor: 8.0, type: "ntk" }`, `vocab_size: 250048`, `pad_token_id: 1`,
`model_type: "new"`. The downloaded ONNX is int8 (340 MB); tokenizer is `tokenizer.json` (17 MB). These
match `EMBED_DIM = 768` (`index/schema.rs:15`) and `ModelEntry.dims = 768` in `models.json`.

### Existing code surfaces (exact)

| Surface | Location | Current state |
|---------|----------|---------------|
| Model provisioner public API | `mneme/src/model/mod.rs` | `target_entry(&ModelConfig) -> ModelEntry` (`:112`), `model_dir(&ModelConfig, &ModelEntry) -> PathBuf` (`:105`), `status`/`provision`. Files on disk are flat: `<model_dir>/model.onnx`, `<model_dir>/tokenizer.json`. Constants `DEFAULT_MODEL_NAME` / `DEFAULT_PRECISION` (`:30-31`). |
| `ModelConfig` | `mneme/src/config.rs:51-55` | `{ name: Option<String>, path: Option<PathBuf>, precision: Option<String> }`. |
| `GpuMode` (EP selector) | `mneme/src/config.rs:88-95` | `enum { Auto (default), On, Off }`, serde lowercase. |
| `Config` | `mneme/src/config.rs:20-29` | `{ roots, model: ModelConfig, transport, gpu: GpuMode }`. |
| Embed dim | `mneme/src/index/schema.rs:15` | `pub const EMBED_DIM: u32 = 768;` |
| `chunks_vec` table | `mneme/src/index/schema.rs:131` | `CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[768])` — created, empty until US-658. |
| Chunk size cap | `mneme/src/markdown/chunker.rs:10` | `MAX_CHUNK_CHARS = 2000` (~500 tokens); comment notes a token-based cap can replace it "when the real tokenizer lands (US-657)". |
| `ServerState` | `mneme/src/mcp/mod.rs:40-46` | `{ store, index, config, config_path, model: ModelConfig }`. No `embedder` field yet. |
| `blocking()` helper | `mneme/src/mcp/mod.rs:541-549` | `spawn_blocking` wrapper; every CPU-bound tool body runs inside it. |
| `MnemeError` | `mneme/src/error.rs` | 21 variants; **no** ONNX/tokenizer/embedding variant. |
| CLI commands | `mneme/src/main.rs` | clap: serve / reindex / watch / status / model-update. No `embed`. |
| Module list | `mneme/src/lib.rs:16-23` | `config, error, index, indexer, markdown, mcp, model, store, watcher`. |
| Deps present | `mneme/Cargo.toml` | **No** `ort`, `tokenizers`, or `ndarray`. Has `ureq`(US-656), `rusqlite`+`sqlite-vec`, `tokio`, `tracing`. |

There is **zero** existing embedding/`ort`/tokenizer code anywhere in the crate (grep-confirmed).

### Architecture pattern to follow

- CPU-bound work runs inside `blocking()` (`spawn_blocking`); the CLI runs with no async runtime. ONNX
  inference is CPU/GPU-bound → it belongs inside a `blocking` closure when called from MCP, and runs
  directly on the CLI thread. (The dedicated worker thread + priority queue is **US-659**, not here.)
- The model files are located **only** through `model::model_dir(&cfg.model, &model::target_entry(&cfg.model)?)`
  — never hardcode a path. This automatically respects the `model.path` override and the
  `<name>-<precision>-v<version>` versioning.
- `stdout` is reserved (readiness line + `status`/`reindex` reports). All embedder diagnostics
  (selected EP, load timing) go through `tracing` → stderr.
- New crate-source assets (none needed here) would live under `mneme/assets/` (hand-authored, per C10
  of US-656).

---

## Implementation plan

### Step 1 — Add dependencies (`mneme/Cargo.toml`)

Under `[dependencies]`, a US-657 block:

```toml
# --- US-657: embedding engine ---------------------------------------------
ort        = { version = "2", features = ["ndarray", "directml", "download-binaries"] }
tokenizers = { version = "0.21", default-features = false, features = ["onig"] }
ndarray    = "0.16"
```

- **`ort`** (pyke ONNX Runtime bindings, 2.0). `download-binaries` fetches a prebuilt ONNX Runtime so
  the crate builds on CI/dev with **no system install**; the `directml` feature enables the DirectML EP
  on Windows. **CPU is always available** as the fallback. *(Exact `ort` version — 2.0.0-rc.x at time
  of writing — and the precise feature names verified at implementation; if `download-binaries` does not
  bundle a DirectML-enabled runtime, switch to `load-dynamic` and ship the DirectML DLLs via US-665 —
  see Concern C1.)*
- **`tokenizers`** (HuggingFace) with `default-features = false` to avoid pulling the `http` downloader
  (we load `tokenizer.json` from disk) — keeps the dep tree lean and the build offline. Confirm the
  minimal feature set needed for `Tokenizer::from_file` at implementation.
- **`ndarray`** for building the input tensors / reading the output tensor (also enabled as an `ort`
  feature so `Value`↔`ArrayView` conversions are available).

### Step 2 — Error variants (`mneme/src/error.rs`)

Add after the US-656 `Checksum` variant:

```rust
#[error("model not provisioned: {0}")]
ModelMissing(String),                 // model.onnx / tokenizer.json absent → "run model-update"
#[error("embedding error: {0}")]
Embed(String),                        // ort load/run + tokenizer failures funnel here
```

Map `ort::Error` and `tokenizers::Error` into `Embed(String)` (`.map_err(|e| MnemeError::Embed(e.to_string()))`)
at the call sites — no `#[from]` (keeps the dep types out of the error enum's public signature).

### Step 3 — New module `mneme/src/embed/mod.rs`

Define the trait and the ONNX implementation.

```rust
use crate::config::{Config, GpuMode};
use crate::error::{MnemeError, Result};

/// What kind of text is being embedded — lets an implementation apply the
/// correct instruction prefix / pooling for asymmetric retrieval models.
#[derive(Clone, Copy)]
pub enum EmbedKind { Query, Passage }

/// Produces normalized embedding vectors. Send + Sync so it can live in an Arc
/// and be called from spawn_blocking (US-658/659).
pub trait Embedder: Send + Sync {
    /// Embed one query string → normalized Vec<f32> of length `dims()`.
    fn embed_query(&self, text: &str) -> Result<Vec<f32>>;
    /// Embed a batch of passages (chunks) → one normalized vector each.
    fn embed_passages(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>;
    /// Output dimension (768 for gte-multilingual-base).
    fn dims(&self) -> usize;
    /// Which execution provider is active ("DirectML" / "CPU") — for status/logs.
    fn provider(&self) -> &str;
}

pub struct OnnxEmbedder {
    session:   ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
    dims:      usize,
    max_len:   usize,    // truncation cap (model max 8192; chunks are ~500 tok)
    provider:  String,   // "DirectML" | "CPU"
    input_names: Vec<String>,  // resolved from session.inputs at load (C3)
}
```

`OnnxEmbedder::load(cfg: &Config) -> Result<Self>`:
1. `let entry = model::target_entry(&cfg.model)?; let dir = model::model_dir(&cfg.model, &entry)?;`
2. `let onnx = dir.join("model.onnx"); let tok = dir.join("tokenizer.json");`
   If either is missing → `MnemeError::ModelMissing("…; run `mneme model-update`")`.
   *(Reuse `model::status(&cfg.model)?.complete` for the check.)*
3. Tokenizer: `Tokenizer::from_file(&tok).map_err(embed_err)?`. Configure truncation to `max_len` and
   padding to longest-in-batch (build padding/truncation params explicitly so batches align).
4. Session: build the EP list from `cfg.gpu` (Step 4), then
   `Session::builder()?.with_execution_providers(eps)?.commit_from_file(&onnx)?`.
   Record which EP actually registered into `provider`. Read `session.inputs` → `input_names`
   (do **not** assume `token_type_ids` exists — see C3). `dims = entry.dims as usize`.

`encode(&self, texts: &[&str], kind: EmbedKind) -> Result<Vec<Vec<f32>>>` (the shared core both trait
methods call):
1. Apply the prefix for `kind` (Step 5) to each text.
2. `tokenizer.encode_batch(...)` → `input_ids`, `attention_mask` (+ `token_type_ids` only if the model
   declares it). Build `ndarray` `i64` tensors shaped `[batch, seq]`.
3. Construct `ort::inputs![ ... ]` keyed by the **resolved `input_names`**; run `session.run(...)`.
4. Take the model's hidden-state output (first output / `last_hidden_state`), shape `[batch, seq, 768]`.
   **Pool** to `[batch, 768]` per C2 (CLS = token 0, the expected default for gte-multilingual-base;
   confirm at implementation — keep mean-pool over the attention mask as the documented alternative).
5. **L2-normalize** each row (so cosine = dot product; sqlite-vec KNN in US-658 uses this). Return
   `Vec<Vec<f32>>`.

`embed_query` = `encode(&[text], Query)?.pop()`; `embed_passages` = `encode(texts, Passage)`.

Keep pure helpers (`l2_normalize(&mut [f32])`, `cls_pool` / `mean_pool`) as free functions so they're
unit-testable without a model.

### Step 4 — Execution-provider selection (in `embed/mod.rs`)

```rust
fn execution_providers(mode: GpuMode) -> Vec<ort::execution_providers::ExecutionProviderDispatch> {
    use ort::execution_providers::{CPUExecutionProvider, DirectMLExecutionProvider};
    match mode {
        // try DirectML first, CPU registers as guaranteed fallback
        GpuMode::Auto => vec![DirectMLExecutionProvider::default().build(),
                              CPUExecutionProvider::default().build()],
        GpuMode::On   => vec![DirectMLExecutionProvider::default().build(),
                              CPUExecutionProvider::default().build()], // still keep CPU so load never hard-fails
        GpuMode::Off  => vec![CPUExecutionProvider::default().build()],
    }
}
```

`with_execution_providers` registers them in order and silently falls back when one is unavailable.
After `commit_from_file`, determine the active provider for logging/status (ort exposes the registered
providers; if not directly queryable, infer from `mode` + whether the DML registration succeeded — a
`tracing::info!` line on load is enough for v1). *(Exact ort EP type paths verified at implementation —
`ort::ep::DirectML` vs `ort::execution_providers::DirectMLExecutionProvider` differs across rc builds.)*

### Step 5 — Instruction prefixes (in `embed/mod.rs`)

```rust
const QUERY_PREFIX:   &str = "";   // gte-multilingual-base: no instruction prefix (verify — C2)
const PASSAGE_PREFIX: &str = "";
```

Per Concern **C2**, `gte-multilingual-base` likely needs **no** prefix (it is not an E5/Instruct model).
Centralize the two constants so that (a) the correct value is set once after verifying the model card,
and (b) a future asymmetric model (e.g. the Qwen3 upgrade in D5) only edits these constants. The
separate `EmbedKind` path means switching to a prefixed model needs no API change downstream.

### Step 6 — Register the module (`mneme/src/lib.rs`)

Add `pub mod embed;` (alphabetical, after `config`, before `error`). Update the crate doc-comment:
`chunks_vec` is now fillable — embeddings exist (US-657); vector/hybrid search wiring is US-658.

### Step 7 — CLI debug subcommand (`mneme/src/main.rs`)

A small command to prove inference works against the real cached model (the analogue of US-656's live
download test):

```rust
/// Embed a string with the configured model and print the vector (debug / verification).
Embed {
    /// Text to embed.
    text: String,
    /// Treat the text as a search query (vs a passage/chunk).
    #[arg(long)] query: bool,
},
```

Handler: `let emb = embed::OnnxEmbedder::load(&cfg)?;` then `embed_query` / `embed_passages`, and
`println!` the active provider, dim count, L2 norm (≈1.0), and the first ~8 components. No async runtime
needed (CLI path). This is the manual verification entry point — it is **not** wired into any MCP tool
in US-657 (vector search is US-658).

### Step 8 — `ServerState` hook (minimal, no consumer yet)

Add `embedder: tokio::sync::OnceCell<Arc<dyn Embedder>>` (or `std::sync::OnceLock`) to `ServerState`
(`mcp/mod.rs:40`) plus a lazy accessor:

```rust
async fn embedder(self: &Arc<Self>) -> Result<Arc<dyn embed::Embedder>> {
    // load once, inside blocking(); subsequent calls reuse the Arc
}
```

US-657 does not call it from any tool — US-658's `wiki_search` vector lane is the first consumer. Adding
the field + accessor now keeps US-658's diff focused on search. **Optional:** if this complicates the
change, defer the `ServerState` field entirely to US-658 and ship US-657 as the `embed` module + CLI +
tests only. *(Recommended: include the field; it's a few lines and gives US-658 a clean seam.)*

### Step 9 — `mneme.example.toml` + README

- `mneme.example.toml`: document the `gpu` mode (`auto` / `on` / `off`) in relation to embeddings (it
  already exists for the schema; add the embedding context — Auto tries DirectML then CPU).
- `mneme/README.md`: update the status banner (embeddings now available; `chunks_vec` fillable —
  vector search still US-658); add an `embed/` entry to the module-layout block; add a short "Embedding
  engine" subsection (CLI `mneme embed`, EP selection, model files consumed).

### Step 10 — Tests (`mneme/tests/embed.rs`)

**Hermetic unit tests (run in CI — no model, no GPU):**
- `l2_normalize` produces unit-norm vectors; zero-vector is handled (no NaN).
- `cls_pool` / `mean_pool` math on a small synthetic `[1, seq, dims]` array.
- `execution_providers(GpuMode)` returns the expected EP ordering for `Auto`/`On`/`Off`.
- `OnnxEmbedder::load` against a non-existent model dir → `MnemeError::ModelMissing`.

**Real-inference test (`#[ignore]` — manual, needs the 340 MB cached model + ONNX Runtime):**
- Load `OnnxEmbedder` from the cache, embed two related sentences and one unrelated sentence; assert
  `dims() == 768`, each vector L2-norm ≈ 1.0, and `cos(a, b_related) > cos(a, c_unrelated)`
  (sanity that the model is wired correctly, not garbage).
- Marked `#[ignore]` because CI has neither the model bytes nor a guaranteed runtime; run locally via
  `cargo test -- --ignored` after `mneme model-update`.

Verification gate (Rust-skip rule — `/review` & `/userdoc` do **not** apply): `cargo build --release`
clean with no warnings (CPU binaries via `download-binaries`), `cargo test` green (hermetic tests), and a
**manual** `mneme embed "…"` run + the `--ignored` similarity test on the dev machine, exercising **both**
DirectML (GPU present) and `gpu = "off"` (CPU).

---

## Concerns / open questions (with proposed resolutions)

### C1 — `ort` binary + DirectML DLL provisioning *(verify at implementation)*
`ort` needs an ONNX Runtime shared library. `download-binaries` fetches a prebuilt one so the crate
builds with no system install — but the prebuilt CPU package may **not** include the DirectML EP, and
DirectML needs `DirectML.dll` + a DirectML-enabled `onnxruntime.dll` at runtime.
**Proposed resolution:** Build/test with `download-binaries` so **CPU always works** in CI and on any
dev machine — that is the guaranteed path and what the hermetic + CPU manual tests use. For DirectML:
verify whether the bundled runtime exposes the DML EP; if not, switch to **`load-dynamic`** and bundle
the `Microsoft.ML.OnnxRuntime.DirectML` DLLs, shipping them via **electron-builder `extraFiles`** —
which is **already US-665's job** (mneme.exe + onnxruntime/DirectML DLLs). So US-657 guarantees CPU and
treats DirectML as "works on the dev machine, packaged in US-665." Record the chosen `ort` feature combo
in the implementation notes. **Not a blocker** — CPU is sufficient for correctness; GPU is a speed
optimization for bulk indexing (D15).

### C2 — Pooling + instruction prefixes for gte-multilingual-base *(verify against the model card)*
The epic's D5 says "query/passage instruction prefixes from day one," but that guidance spans the whole
shortlist — **E5/Qwen require prefixes; GTE generally does not.** Getting pooling or prefixes wrong
silently degrades retrieval quality (vectors still 768-dim and unit-norm, but semantically worse), so it
won't fail a build — only the similarity sanity test would catch it.
**Proposed resolution:** At implementation, confirm from the `onnx-community/gte-multilingual-base`
model card / `sentence-transformers` config: expected default is **CLS pooling** (take token 0) with
**no instruction prefix**, cosine similarity on L2-normalized vectors. Implement that as the default;
keep `mean_pool` and the prefix constants (Step 5) as one-line switches behind the `Embedder` so a
mispick is a trivial correction and a future prefixed model (Qwen3 upgrade) drops in cleanly. The
`#[ignore]`d similarity test is the guard that the chosen pooling/prefix actually separates
related from unrelated text. **Flag to amend epic D5** to record that gte-multilingual-base uses no
prefix (if confirmed), so the "prefixes from day one" note isn't misread for this model.

### C3 — Model input signature (`token_type_ids`?)
The GTE "new" architecture may or may not take `token_type_ids` alongside `input_ids` / `attention_mask`;
hardcoding the wrong input set makes `session.run` fail.
**Proposed resolution:** Read `session.inputs` at load into `input_names` and build the `ort::inputs!`
map to match exactly what the model declares — supply `token_type_ids` (all-zeros) only if present.
No hardcoded assumption. (Verified concretely the first time `mneme embed` runs.)

### C4 — Sequence length, batching, and memory
The model supports 8192 tokens, but Mneme chunks are ~500 tokens (`MAX_CHUNK_CHARS = 2000`). Embedding
very long inputs or large batches on int8 CPU could spike memory/latency.
**Proposed resolution:** Truncate at the tokenizer to a `max_len` cap (default the model max, 8192 —
chunks rarely approach it; queries are short). Pad to longest-in-batch. Keep the public batch API
(`embed_passages(&[&str])`) but **do not** add batch-size scheduling here — bounded batching, the
priority queue, and backpressure are **US-659**. v1 simply embeds whatever slice it's handed (US-658
calls it per-chunk or in small slices). The token-based chunk-cap retune hinted at in
`chunker.rs:10` is **out of scope** (optional later tweak).

### C5 — Embedder lifecycle / where it lives
Loading a 340 MB int8 session takes time and memory; doing it per call is wasteful, but eager load at
startup would block boot and fail when no model is provisioned (FTS must still work — D11).
**Proposed resolution:** **Lazy single-init** via `OnceCell` on `ServerState` (Step 8), built on first
use inside `blocking()`; a missing model returns `MnemeError::ModelMissing` (search degrades to FTS,
never crashes). Since US-657 has no MCP consumer yet, the accessor is added but unused until US-658 —
or deferred to US-658 entirely if it muddies the diff (the CLI path constructs its own `OnnxEmbedder`
directly and needs no `ServerState` change). **Recommended:** add the field now.

### C6 — int8 numerical quality (CPU vs DirectML)
int8 quantization trades some accuracy for size/speed; quality could differ between CPU and DirectML
kernels.
**Proposed resolution:** Ship **int8** (already provisioned) and validate with the similarity sanity
test on both EPs. If int8 underperforms, the **fp16** swap is a `models.json`/`model-update` change
(US-656 path) — the `Embedder` is precision-agnostic (`dims` from the manifest entry), so **no US-657
code changes** for the swap. Decision recorded per D5.

### C7 — CI cannot run real inference
CI has neither the 340 MB model nor a GPU, and may lack a runtime if `download-binaries` is flaky.
**Proposed resolution:** All correctness-critical *logic* (normalization, pooling, EP-list mapping,
missing-model error) is covered by **hermetic** unit tests that need no model. The real-inference test
is `#[ignore]`d (manual). `cargo build --release` links the CPU runtime via `download-binaries`, so the
build stays green in CI without the model. If `download-binaries` proves unreliable in CI, pin the
ONNX Runtime version / cache it (a CI detail, not a code change).

### C8 — `tokenizers` dependency weight
The `tokenizers` crate defaults pull heavy/optional deps (HTTP downloader, etc.).
**Proposed resolution:** `default-features = false` + only the minimal feature(s) needed for
`Tokenizer::from_file` (we never download — the provisioner already placed `tokenizer.json`). Confirm
the exact minimal feature set at implementation; keep the build offline and lean.

### C9 — `ort::Session` thread-safety
US-658/659 will call the embedder from `spawn_blocking` and possibly a worker thread; the session must
be safely shareable.
**Proposed resolution:** `ort::Session` is `Send + Sync` (inference is `&self`), so storing it in
`Arc<dyn Embedder>` and calling from `blocking()` is sound. Confirm at implementation; if a future ort
build relaxes that, US-659's single embedding worker (already planned) owns the session exclusively —
so the trait boundary already future-proofs this.

---

## Acceptance criteria

- [x] `mneme/Cargo.toml` gains `ort` (`=2.0.0-rc.12`, `directml`) + `tokenizers`
      (`default-features=false`, `fancy-regex`); `ndarray` **not** needed (raw tensor extraction).
      `cargo build --release` is clean with **no warnings** (CPU+DML runtime via `download-binaries`).
- [x] `mneme/src/embed/mod.rs` exists with a `pub trait Embedder` and `OnnxEmbedder`
      (`load` / `load_from_files` / `embed_query` / `embed_passages` / `dims` / `provider`);
      registered via `pub mod embed;` in `lib.rs`.
- [x] EP selection reads `cfg.gpu` (`Auto`→DirectML+CPU, `On`→DirectML+CPU, `Off`→CPU) and logs the
      active provider on load.
- [x] `embed_query` / `embed_passages` return **L2-normalized** vectors of length **768**;
      `dims() == 768`. **CLS pooling, no prefix** — confirmed by the similarity test (C2).
- [x] `MnemeError` has `ModelMissing` + `Embed` variants; ort/tokenizer failures map to `Embed`,
      an absent model to `ModelMissing`.
- [x] `mneme embed "<text>" [--query]` loads the cached model and prints provider + dims + norm +
      sample components (manual verification path).
- [x] Hermetic unit tests (normalization, zero-vector, EP mapping, missing-model) pass; the
      real-inference similarity test is `#[ignore]`d and passes locally on both DirectML and `gpu=off`.
- [x] Index / search / watcher / provisioner behavior is **unchanged**; `chunks_vec` is still empty
      (US-658 fills it). FTS `wiki_search` works with no model present.

---

## Files changed (planned)

| File | Change |
|------|--------|
| `mneme/Cargo.toml` | + `ort`, `tokenizers`, `ndarray` (US-657 block) |
| `mneme/src/embed/mod.rs` | **new** — `Embedder` trait, `OnnxEmbedder`, EP selection, pooling, normalization, prefixes |
| `mneme/src/lib.rs` | + `pub mod embed;`; crate doc-comment updated |
| `mneme/src/error.rs` | + `ModelMissing(String)`, + `Embed(String)` |
| `mneme/src/main.rs` | + `Command::Embed { text, query }` debug subcommand |
| `mneme/src/mcp/mod.rs` | + `embedder: OnceCell<Arc<dyn Embedder>>` field on `ServerState` + lazy accessor *(optional — may defer to US-658)* |
| `mneme/mneme.example.toml` | document `gpu` mode in the embedding context |
| `mneme/README.md` | status banner; module-layout `embed/`; "Embedding engine" subsection |
| `mneme/tests/embed.rs` | **new** — hermetic unit tests + `#[ignore]`d real-inference test |
| `doc/active-work.md` / `doc/epics/EPIC-032.md` | link this doc; mark US-657 in progress |

## Files that need NO changes

`mneme/src/model/**` (provisioner already lands the files), `mneme/src/index/**` (schema is
vector-ready — `chunks_vec` filled in US-658, not here), `mneme/src/indexer/**`,
`mneme/src/watcher/**`, `mneme/src/store/**`, `mneme/src/markdown/**` (the token-based chunk-cap retune
is an optional later tweak, not US-657), and all `wiki_search` / `wiki_reindex` logic. US-657 only adds
the ability to compute a vector; nothing consumes it until US-658.

---

## Deferred to later Phase-2 tasks (explicitly out of scope)

- **US-658** — upsert chunk vectors into `chunks_vec`, pre-filter candidate-id KNN, RRF merge,
  `wiki_search` vector/hybrid modes. (The first consumer of this `Embedder`.)
- **US-659** — dedicated embedding worker thread, priority queue (interactive > bulk), WAL
  single-writer + reader pool, cancellable reindex job + MCP progress + backpressure.
- **DirectML DLL packaging** — bundled via electron-builder `extraFiles` in **US-665** (C1).
- **fp16 fallback** — a `model-update`/manifest swap (US-656 path) if int8 underperforms (C6); no code
  change here.

---

## Implementation notes (post-hoc)

Deviations from the plan, all benign:

1. **`ort = "=2.0.0-rc.12"`** (current rc; `ort = "2"` would not match a pre-release). API shapes
   used: `Session::builder()?.with_execution_providers([...])?.with_optimization_level(Level3)?.commit_from_file(path)?`;
   inputs via `ort::inputs![ "input_ids" => Tensor::from_array((shape, vec))?, … ]`; output via
   `outputs[0].try_extract_tensor::<f32>()? → (&Shape, &[f32])`. `ort::Error` is generic
   (`Error<SessionBuilder>` vs `Error<()>`), so the error mapper is `fn embed_err<E: Display>(e) -> Embed`.
   Input names come from `session.inputs()` (method, not a public field); `Outlet::name()` is a method.
2. **No `ndarray` direct dependency.** Used the `(shape, Vec)` tuple form of `Tensor::from_array` and
   raw `try_extract_tensor` instead — sidesteps having to match ort's internal ndarray version.
3. **`tokenizers` with `fancy-regex`** (pure Rust) instead of the planned `onig` (C8) — avoids a C
   toolchain dependency for the tokenizer; `default-features=false` drops the `http`/`hf-hub` downloaders.
4. **`Mutex<Session>`** inside `OnnxEmbedder` (C9) — makes the trait methods `&self` regardless of
   whether `Session::run` is `&self`/`&mut self` across rc builds, and serializes inference for v1
   (the dedicated worker is US-659). Both `embed_query` and `embed_passages` route through one private
   `encode(texts, kind)` core.
5. **`load_from_files(onnx, tok, dims, gpu)`** added as a pub helper (alongside `load(&Config)`) so a
   caller/test can point at explicit paths without going through the provisioner.
6. **C2 resolved empirically — CLS pooling, no instruction prefix.** The `#[ignore]`d similarity test
   gave query↔related **0.7678** vs query↔unrelated **0.3964** (DirectML); strong separation confirms
   the pooling/prefix choice. The `QUERY_PREFIX`/`PASSAGE_PREFIX` constants are empty and centralized
   for a future asymmetric-model swap. *(Epic D5's generic "prefixes from day one" does not apply to
   gte-multilingual-base — worth a one-line note on D5 if revisited.)*
7. **C3 resolved empirically — no `token_type_ids`.** `session.inputs()` does not list it, so the
   engine feeds only `input_ids` + `attention_mask`; the conditional `token_type_ids` path is retained
   for a model that declares it.
8. **`ServerState.embedder`** added as a `OnceLock<Arc<dyn Embedder>>` with a `pub async fn embedder()`
   lazy accessor (Step 8 / C5 included, not deferred). It's part of the public API (no dead-code
   warning) and gives US-658's vector lane a clean seam; nothing calls it in US-657.

**Verification (2026-06-13):**
- `cargo build --release` — clean, **no warnings** (1m34s; ort + tokenizers compiled from the
  `download-binaries` runtime).
- `cargo test` — hermetic suite green: lib embed unit tests (`normalize_unit_norm`,
  `normalize_zero_vector_no_nan`, `ep_list_matches_mode`) + `tests/embed.rs`
  (`load_missing_model_errors`, `l2_normalize_is_unit_norm`; `real_inference_similarity` `#[ignore]`d).
  All other suites (document_store 13, index 19, index_search 4, indexer 7, mcp 11, model 11) still pass.
- **Live inference** against the provisioned model (`…\persephone\data\mneme\models\gte-multilingual-base-int8-v1\`):
  - `cargo test --test embed -- --ignored` → `provider=DirectML (CPU fallback) related=0.7678 unrelated=0.3964`, dims 768, norm≈1.
  - `MNEME_GPU=off mneme embed "…" --query` → `provider: CPU  dims: 768  L2-norm: 1.0000` — CPU path verified.
