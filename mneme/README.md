# Mneme

**Mneme** is Persephone's knowledge-base / vector-memory service — a standalone, single-binary
Rust application that indexes a tree of markdown documents for full-text and (later) semantic
search, exposed over a single MCP interface. Files on disk are the source of truth; the index is
a derived, rebuildable artifact.

This crate is **self-contained and extraction-ready**: it builds and tests in isolation with no
dependency on the Persephone repo, so it can later be split into its own repository or used as an
Azure container build context.

> **Status:** Phase 1 / US-652 — project scaffold + config + Document Store only. No SQLite index,
> MCP server, or embeddings yet (US-653 / US-655 / US-657).

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
└─ store/         Document Store
   ├─ mod.rs      read/write/edit/delete/read_bytes/list/glob/grep over roots
   ├─ roots.rs    RootRegistry — name→root, add/remove/validate (exists/unique/no-overlap)
   ├─ address.rs  {root}/{path} parsing + safe (no-traversal) resolution
   ├─ walk.rs     include-allowlist + ignore-rules walk (the `ignore` crate)
   ├─ glob.rs     wiki_glob (globset)
   ├─ grep.rs     wiki_grep streaming regex scan + output modes
   └─ edit.rs     string-replace edit
```

See [`mneme.example.toml`](mneme.example.toml) for the documented config.
