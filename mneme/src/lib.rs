//! Mneme — knowledge-base / vector-memory service.
//!
//! Phase 1 so far: configuration + the Document Store (US-652), and the markdown layer
//! (frontmatter + heading chunker) + the per-root SQLite index schema (US-653, FTS5 +
//! `sqlite-vec`). No MCP server (US-655) or embeddings (US-657) yet — `chunks_vec` is
//! created but empty until then.
//!
//! Crate-wide invariant: **stdout is never used for ad-hoc output.** All diagnostics
//! go through `tracing` to stderr; stdout is reserved for the single startup readiness
//! line emitted by the (future) MCP HTTP server. See the crate README.

pub mod config;
pub mod error;
pub mod index;
pub mod markdown;
pub mod store;
