//! Mneme — knowledge-base / vector-memory service.
//!
//! US-652 (Phase 1) scaffold: configuration + the Document Store (the filesystem
//! abstraction over wiki roots). No SQLite index, no MCP server, no embeddings yet —
//! those arrive in US-653 / US-655 / US-657.
//!
//! Crate-wide invariant: **stdout is never used for ad-hoc output.** All diagnostics
//! go through `tracing` to stderr; stdout is reserved for the single startup readiness
//! line emitted by the (future) MCP HTTP server. See the crate README.

pub mod config;
pub mod error;
pub mod store;
