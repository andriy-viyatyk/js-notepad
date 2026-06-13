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
> MCP server over Streamable HTTP exposing the `wiki_*` tool surface in **text-search mode**
> (US-655). No embeddings (US-657) yet — `chunks_vec` is created but empty, so `wiki_search` is
> FTS-only.

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
mneme --config <path>       # explicit config file (else $MNEME_CONFIG, else the OS config dir)
```

## MCP surface (text-search mode)

`mneme serve` binds loopback (`127.0.0.1`, no auth) and serves MCP over **Streamable HTTP** at
`/mcp`. It prints a single stdout readiness line (`listening on <bind>:<port>`) once bound — the
spawner waits for it — and logs to stderr. Connect MCP Inspector or a Claude chat to
`http://127.0.0.1:<port>/mcp` to drive it.

Tools: file-like `wiki_read`/`wiki_write`/`wiki_edit`/`wiki_delete`/`wiki_glob`/`wiki_grep`;
`wiki_search` (FTS only here — `mode` defaults to `text`; `vector`/`hybrid` degrade to text with a
note until US-658); views `wiki_tree`/`wiki_timeline`/`wiki_tags`; management `wiki_add_root`/
`wiki_remove_root`/`wiki_list_roots`/`wiki_reindex`/`wiki_status`/`wiki_index_delete`/
`wiki_model_update` (downloads/verifies the configured model — synchronous, may take minutes on
first run). Resources: documents/attachments at `mneme://{root}/{path}` (text or base64 blob) plus
the agent guide at `mneme://guide`. Resource subscriptions are not advertised yet (US-661/662).

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
├─ main.rs        CLI (clap): serve / reindex / watch / status / model-update
├─ config.rs      Config + figment load (file + env + flags) + save (root add/remove)
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
│  ├─ mod.rs      IndexDb — open_or_create / meta / upsert / delete / doc_state / search_fts
│  ├─ schema.rs   DDL + SCHEMA_VERSION + sqlite-vec auto-extension registration
│  └─ path.rs     versioned path + modelId + .mneme/.gitignore
├─ indexer/       keeps the index in sync with the files
│  └─ mod.rs      reconcile_root (mtime+size fast-path → content-hash) / index_one / reindex_file / IndexManager
├─ watcher/       always-on debounced notify watcher per root
│  └─ mod.rs      RootWatcher (reconcile-on-change; .mneme self-trigger guard)
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
**empty until embeddings land in US-657/658**), `meta` (model, precision, dims, schema version).
FTS-only text search works with no model present.

The index is kept current by the **indexer**: a reconcile (walk → mtime+size fast-path →
content-hash dedup → index new / re-process changed / drop deleted) runs synchronously
(`mneme reindex`) and as a deferred, non-blocking job shortly after start, while an always-on
debounced `notify` **watcher** wakes a reconcile whenever files change on disk outside Mneme.

See [`mneme.example.toml`](mneme.example.toml) for the documented config.
