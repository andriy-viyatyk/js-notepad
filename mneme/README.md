# Mneme

**Mneme** is Persephone's knowledge-base / vector-memory service — a standalone, single-binary
Rust application that indexes a tree of markdown documents for full-text and (later) semantic
search, exposed over a single MCP interface. Files on disk are the source of truth; the index is
a derived, rebuildable artifact.

This crate is **self-contained and extraction-ready**: it builds and tests in isolation with no
dependency on the Persephone repo, so it can later be split into its own repository or used as an
Azure container build context.

> **Status:** Phase 1 — config + Document Store (US-652), the markdown layer (frontmatter +
> heading chunker) and the per-root SQLite index schema (US-653, FTS5 + `sqlite-vec`), the
> indexer + always-on file watcher that keep the index in sync with the files (US-654), and the
> MCP server over Streamable HTTP exposing the `wiki_*` tool surface (US-655). Phase 2 — the
> model provisioner (US-656), the **embedding engine** (US-657, ONNX Runtime + DirectML→CPU),
> and **hybrid search** (US-658): chunks are embedded into `chunks_vec`, and `wiki_search` now
> serves real `vector` (KNN) and `hybrid` (FTS + KNN fused with Reciprocal Rank Fusion) modes
> alongside `text`. FTS still works with no model present; vector/hybrid degrade to text (with a
> note) until the model is provisioned. The concurrency layer (US-659) completes Phase 2: a
> dedicated embedding worker + priority queue (interactive query/edit embeds preempt bulk
> reindex), a WAL writer + read-only connection pool per root, and a cancellable,
> progress-emitting, single-flight reindex job — so search and edit stay responsive during a bulk
> reindex.

## Build & test

```bash
cargo build --release    # → target/release/mneme.exe
cargo test               # Document Store integration tests
```

The binary is built in CI (`.github/workflows/publish.yml`) and — from US-665 — shipped beside
`persephone.exe` via electron-builder `extraFiles`. It is **not** wired into `npm start` / `npm run
dist`; build it with `cargo` directly during development.

## CLI

```bash
mneme status                # load config, list roots + indexable file counts + model status
mneme reindex [path?]       # reconcile the index with the files (sync); path "{root}" scopes
mneme watch                 # watch every root + reconcile on change (runs until Ctrl-C)
mneme serve [--port N]      # run the MCP server (Streamable HTTP, loopback /mcp) — text-search mode
mneme model-update          # download/verify the configured embedding model (US-656)
mneme model-update --force  # re-download even if already present
mneme embed "<text>"        # embed text + print provider/dims/norm (debug; US-657)
mneme embed "<text>" --query  #   …treating the text as a search query
mneme search "<query>"      # ranked search across all roots (debug; --mode text|vector|hybrid, --top-k N)
mneme --config <path>       # explicit config file (else $MNEME_CONFIG, else the OS config dir)
```

## MCP surface

`mneme serve` binds loopback (`127.0.0.1`, no auth) and serves MCP over **Streamable HTTP** at
`/mcp`. It prints a single stdout readiness line (`listening on <bind>:<port>`) once bound — the
spawner waits for it — and logs to stderr. Connect MCP Inspector or a Claude chat to
`http://127.0.0.1:<port>/mcp` to drive it.

Tools: file-like `wiki_read`/`wiki_write`/`wiki_edit`/`wiki_delete`/`wiki_glob`/`wiki_grep`
(`wiki_grep` adds `tags`/`dateRange` metadata filters over `.md` docs and a `-n` line-number
toggle); `wiki_search` (`mode` `text` | `vector` | `hybrid`, default `hybrid`; `vector`/`hybrid`
degrade to text with a note when no model is provisioned); views `wiki_tree`/`wiki_timeline`/`wiki_tags`;
management `wiki_add_root`/
`wiki_remove_root`/`wiki_list_roots`/`wiki_reindex`/`wiki_status`/`wiki_index_delete`/
`wiki_model_update` (downloads/verifies the configured model — synchronous, may take minutes on
first run). Resources: documents/attachments at `mneme://{root}/{path}` (text or base64 blob), the
agent guide at `mneme://guide`, and a JSON `wiki_status` snapshot at `mneme://status`. Resource
subscriptions are advertised (`resources.subscribe` + `listChanged`): subscribe to a document URI
and the always-on watcher emits `notifications/resources/updated { uri }` when that file changes on
disk; add/remove/rename emit `notifications/resources/list_changed`.

## Model provisioning (US-656)

FTS-based `wiki_search` works with no model on disk. Downloading the embedding model enables
vector/hybrid search (US-657/658 — not yet wired). To download and verify the default model:

```bash
mneme model-update          # download gte-multilingual-base-int8 to the default cache
mneme model-update --force  # re-download even if files are already verified
mneme status                # also shows model dir + complete: true/false
```

The provisioner:
- Downloads each file to `<dest>.part`, feeding a SHA-256 hasher as bytes arrive.
- Sends `Range: bytes=<offset>-` if a `.part` already exists (resume support).
- If the server returns 200 instead of 206 (ignores Range), discards the stale `.part` and
  restarts from byte 0.
- On completion verifies SHA-256; on mismatch deletes `.part` and returns an error.
- On success renames `.part` → final path (atomic on Windows via `MoveFileEx`/`rename`).

Cache layout:
```
<cache_base>/<name>-<precision>-v<version>/
  model.onnx
  tokenizer.json
```

Default cache base: `<os-config-dir>/persephone/data/mneme/models`. Override with
`[model] path = "..."` in `mneme.toml` (see `mneme.example.toml`).

## Embedding engine (US-657)

Once the model is provisioned, the embedding engine turns text into a normalized **768-dim**
vector via ONNX Runtime (`ort`) + HuggingFace `tokenizers`. `gte-multilingual-base` is a GTE
encoder: the sentence embedding is the **CLS** token of the last hidden state, L2-normalized, with
**no** instruction prefix (unlike the E5/Qwen families).

Execution provider is chosen from the top-level `gpu` setting:

| `gpu` | Providers (in order) |
|-------|----------------------|
| `auto` (default) | DirectML, then CPU fallback |
| `on`  | DirectML, then CPU fallback |
| `off` | CPU only |

DirectML runs on any DX12 GPU with no CUDA install; CPU is always available as the guaranteed
fallback, so session creation never hard-fails on a machine without a GPU. Switching GPU↔CPU is a
runtime toggle — it does **not** trigger a reindex (only a model/precision change does).

```bash
mneme embed "how do I cancel my subscription" --query   # → provider, dims=768, L2-norm≈1, sample
```

## Hybrid search (US-658)

During indexing, each chunk's passage embedding is written into `chunks_vec` (keyed by chunk
rowid). `wiki_search` then offers three modes:

- **text** — FTS5 `bm25()` ranking (works with no model).
- **vector** — KNN over `chunks_vec`. Metadata filters (subtree / tags / date) become a
  candidate-id pre-filter (`WHERE rowid IN (…)`) so the KNN only ranks matching chunks. Vectors
  are L2-normalized, so the default L2 metric orders identically to cosine.
- **hybrid** (default) — runs both lanes and fuses them per-document with **Reciprocal Rank
  Fusion** (`score = Σ 1/(60 + rank)`). FTS catches exact identifiers; vector catches paraphrases.

Results are one row per document (best chunk wins the snippet) and **returned best-first** — the
`score` field is a mode-dependent ranking scalar, so rely on order, not the number. When the model
is not provisioned, `vector`/`hybrid` degrade to text results with a `note`.

Embedding happens **inline** under the per-root index lock: a first-time bulk reindex is slow
(the dedicated worker + priority queue + progress notifications that make it responsive are
US-659); incremental single-document embeds are fast. If the model is provisioned *after* a root
was already indexed, the next reconcile **backfills** vectors for the existing documents (the
mtime+size fast-path still re-embeds a document that has no vectors yet) — no full rebuild.

```bash
mneme embed  "how do I cancel my subscription" --query   # → provider, dims=768, L2-norm≈1, sample
mneme search "how do I cancel my subscription"           # ranked hits (--mode text|vector|hybrid)
```

## Concurrency & responsiveness (US-659)

Embedding is CPU/GPU-bound and serialized behind one model session, so Mneme must keep search and
edit prompt while a bulk reindex runs. Three pieces cooperate:

- **One embedding worker + priority queue.** A dedicated thread (`embed/worker.rs`) owns the model
  session and drains two lanes: an unbounded **interactive** lane (a search query, a just-edited
  doc) and a bounded **bulk** lane (reindex batches → backpressure). It serves all queued
  interactive jobs before each bulk job, so an interactive embed's worst-case wait during a
  reindex is one in-flight bulk batch. Submit through the cloneable `EmbedHandle`; with no model
  provisioned every embed returns `None` and callers degrade to FTS.
- **WAL writer + read-only pool per root.** `index/pool.rs`'s `RootIndex` pairs the single writer
  (`Mutex<IndexDb>`) with a small pool of read-only connections over the same WAL DB. Searches and
  `wiki_status` read from the pool — concurrently with the writer, seeing the last committed
  snapshot (eventually consistent during a reindex). `sqlite-vec` is a process-global
  auto-extension, so KNN works on pooled readers too.
- **Cancellable, single-flight reindex job.** `indexer/job.rs`'s `JobManager` runs the two-phase
  `reconcile_job` (scan/upsert under brief per-file writer locks → embed off the lock on the
  worker → write vectors in brief locked batches). `wiki_reindex` runs a fresh pass and streams
  MCP progress notifications (when the client sends a `progressToken`); the client's
  `notifications/cancelled` (`ctx.ct`) stops it cleanly mid-pass — already-written vectors persist
  and a follow-up reconcile finishes the remainder idempotently. The watcher and the deferred
  startup reconcile trigger **coalesced** passes (a burst collapses to one extra pass); `wiki_status`
  reports each root's latest `{phase, processed, total}` snapshot.

## Crate-wide invariants

- **stdout is not for ad-hoc output.** All diagnostics go through `tracing` to **stderr**. stdout is
  reserved for the single startup readiness line the (future) MCP HTTP server prints so a parent
  process (Persephone) knows it is listening before connecting. Never `println!` outside that
  readiness handshake or the `status` command's human-facing report.
- **Single transport.** Mneme speaks MCP over **Streamable HTTP** only — used by both Persephone and
  AI agents, so one running instance serves many clients. Local binds `127.0.0.1` with no auth;
  networked/Azure adds bearer/OAuth.

## Module layout

```
src/
├─ main.rs        CLI (clap): serve / reindex / watch / status / model-update / embed / search
├─ config.rs      Config + figment load (file + env + flags) + save (root add/remove)
├─ embed/         Embedding engine (US-657) — ort session + tokenizer, DirectML→CPU
│  ├─ mod.rs      Embedder trait, OnnxEmbedder (load/encode/CLS-pool/L2-normalize), EP selection,
│  │              LazyEmbedder (shared build-once cell for the index + search paths)
│  └─ worker.rs   EmbedWorker thread + EmbedHandle — priority queue (interactive > bulk), US-659
├─ error.rs       MnemeError
├─ model/         Model provisioner (US-656) — download/verify embedding model files
│  └─ mod.rs      manifest, cache_base, model_dir, download_file, provision, status
├─ store/         Document Store
│  ├─ mod.rs      read/write/edit/delete/read_bytes/list/glob/grep over roots
│  ├─ roots.rs    RootRegistry — name→root, add/remove/validate (exists/unique/no-overlap)
│  ├─ address.rs  {root}/{path} parsing + safe (no-traversal) resolution
│  ├─ walk.rs     include-allowlist + ignore-rules walk (the `ignore` crate)
│  ├─ glob.rs     wiki_glob (globset)
│  ├─ grep.rs     wiki_grep streaming regex scan + output modes
│  └─ edit.rs     string-replace edit
├─ markdown/      frontmatter parse + heading chunker
│  ├─ mod.rs      parse_document → ParsedDoc { meta, chunks }
│  ├─ frontmatter.rs  split `---` block, resolve title/tags/created/verified (read-time fallbacks)
│  └─ chunker.rs  heading-based chunker + size cap (pulldown-cmark); plain-text fallback
├─ index/         per-root SQLite index (bundled SQLite + FTS5 + sqlite-vec)
│  ├─ mod.rs      IndexDb — open_or_create / open_readonly / meta / upsert / delete / doc_state;
│  │              search_text (FTS) / search_vector (KNN) / search_hybrid (RRF);
│  │              chunk_texts_for + write_chunk_vectors (embed split)
│  ├─ pool.rs     RootIndex (Mutex writer + read-only ReadPool over the WAL DB), US-659
│  ├─ schema.rs   DDL + SCHEMA_VERSION + sqlite-vec auto-extension registration
│  ├─ vector.rs   f32 BLOB packing + Reciprocal Rank Fusion (rrf_merge)
│  └─ path.rs     versioned path + modelId + .mneme/.gitignore
├─ indexer/       keeps the index in sync with the files
│  ├─ mod.rs      reconcile_root (sync, inline embed) / reconcile_job (2-phase, off-lock embed,
│  │              cancellable + progress) / index_one / single_doc_index / IndexManager
│  └─ job.rs      JobManager — single-flight per root, progress snapshots, cancellation (US-659)
├─ watcher/       always-on debounced notify watcher per root
│  └─ mod.rs      RootWatcher (coalesced reconcile-on-change via JobManager; .mneme self-trigger guard)
└─ mcp/           MCP server (sole interface) — Streamable HTTP, loopback
   ├─ mod.rs      ServerState (tool logic, spawn_blocking) + serve glue
   ├─ server.rs   MnemeServer — rmcp tool_router + ServerHandler (resources)
   ├─ params.rs   tool request types (Deserialize + JsonSchema)
   └─ results.rs  tool result types (Serialize → structured content)
```

## Index layout

The index is a **derived, rebuildable** artifact — one SQLite DB per wiki root, inside the root:

```
<wiki-root>/.mneme/
├─ .gitignore                          "*" — the index self-excludes from version control
└─ <modelId>/index-v<schemaVer>.db     e.g. gte-multilingual-base-int8/index-v1.db
```

The path encodes the `(model+precision, schema version)` identity: a model/precision or schema
change selects a *new* path → a fresh DB → full rebuild from the files, with old DBs kept (no
migration code). Tables: `documents` (effective frontmatter + content hash + mtime/size),
`chunks` (heading + text + ordinal), `chunks_fts` (FTS5), `chunks_vec` (`sqlite-vec` vec0 —
one normalized passage embedding per chunk, populated during indexing when a model is present),
`meta` (model, precision, dims, schema version). FTS-only text search works with no model present.

The index is kept current by the **indexer**: a reconcile (walk → mtime+size fast-path →
content-hash dedup → index new / re-process changed / drop deleted) runs synchronously
(`mneme reindex`) and as a deferred, non-blocking job shortly after start, while an always-on
debounced `notify` **watcher** wakes a reconcile whenever files change on disk outside Mneme.

See [`mneme.example.toml`](mneme.example.toml) for the documented config.
