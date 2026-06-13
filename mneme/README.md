# Mneme

**Mneme** is Persephone's knowledge-base / vector-memory service — a standalone, single-binary
Rust application that indexes a tree of markdown documents for full-text and (later) semantic
search, exposed over a single MCP interface. Files on disk are the source of truth; the index is
a derived, rebuildable artifact.

This crate is **self-contained and extraction-ready**: it builds and tests in isolation with no
dependency on the Persephone repo, so it can later be split into its own repository or used as an
Azure container build context.

> **Status:** Phase 1 — config + Document Store (US-652), plus the markdown layer (frontmatter +
> heading chunker) and the per-root SQLite index schema (US-653, FTS5 + `sqlite-vec`). No MCP
> server (US-655) or embeddings (US-657) yet — `chunks_vec` is created but empty until then.

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
mneme status            # load config, list roots + indexable file counts
mneme serve [--port N]  # run the MCP HTTP server  [stub until US-655]
mneme --config <path>   # explicit config file (else $MNEME_CONFIG, else the OS config dir)
```

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
├─ main.rs        CLI (clap): serve [stub] / status
├─ config.rs      Config + figment load (file + env + flags)
├─ error.rs       MnemeError
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
└─ index/         per-root SQLite index (bundled SQLite + FTS5 + sqlite-vec)
   ├─ mod.rs      IndexDb — open_or_create / meta / upsert / delete / doc_state / search_fts
   ├─ schema.rs   DDL + SCHEMA_VERSION + sqlite-vec auto-extension registration
   └─ path.rs     versioned path + modelId + .mneme/.gitignore
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

See [`mneme.example.toml`](mneme.example.toml) for the documented config.
