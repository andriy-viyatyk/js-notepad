//! Mneme — knowledge-base / vector-memory service.
//!
//! Phase 1 so far: configuration + the Document Store (US-652), the markdown layer
//! (frontmatter + heading chunker) + the per-root SQLite index schema (US-653, FTS5 +
//! `sqlite-vec`), the indexer + always-on file watcher that keep the index consistent with the
//! files on disk (US-654 — reconcile with mtime+size fast-path + content-hash dedup), and the
//! MCP server over Streamable HTTP exposing the `wiki_*` tool surface in text-search mode
//! (US-655). No embeddings (US-657) yet — `chunks_vec` is created but empty, so `wiki_search`
//! is FTS-only.
//!
//! Crate-wide invariant: **stdout is never used for ad-hoc output.** All diagnostics
//! go through `tracing` to stderr; stdout is reserved for the single startup readiness
//! line emitted by the MCP HTTP server (`listening on <bind>:<port>`). See the crate README.

pub mod config;
pub mod error;
pub mod index;
pub mod indexer;
pub mod markdown;
pub mod mcp;
pub mod store;
pub mod watcher;
