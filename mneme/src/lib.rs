//! Mneme — knowledge-base / vector-memory service.
//!
//! Phase 1 so far: configuration + the Document Store (US-652), the markdown layer
//! (frontmatter + heading chunker) + the per-root SQLite index schema (US-653, FTS5 +
//! `sqlite-vec`), the indexer + always-on file watcher that keep the index consistent with the
//! files on disk (US-654 — reconcile with mtime+size fast-path + content-hash dedup), the MCP
//! server over Streamable HTTP exposing the MCP tool surface in text-search mode (US-655),
//! the model provisioner (US-656) that downloads/verifies the configured embedding-model
//! files into a local cache with HTTP range-resume and sha256 verification, and the embedding
//! engine (US-657) that turns text into normalized vectors via ONNX Runtime (CPU),
//! hybrid search (US-658) that embeds chunks into `chunks_vec` and serves `search`'s
//! vector/hybrid modes (FTS + KNN fused with RRF), and the concurrency layer (US-659) — a
//! dedicated embedding worker + priority queue, a WAL writer + read-only connection pool per
//! root, and a cancellable, progress-emitting, single-flight reindex job manager — that keeps
//! Mneme responsive (search + edit) during a bulk reindex.
//!
//! Crate-wide invariant: **stdout is never used for ad-hoc output.** All diagnostics
//! go through `tracing` to stderr; stdout is reserved for the single startup readiness
//! line emitted by the MCP HTTP server (`listening on <bind>:<port>`). See the crate README.

pub mod config;
pub mod embed;
pub mod error;
pub mod index;
pub mod indexer;
pub mod markdown;
pub mod mcp;
pub mod model;
pub mod store;
pub mod watcher;
