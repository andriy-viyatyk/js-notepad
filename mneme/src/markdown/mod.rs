//! Markdown layer — frontmatter parsing + heading-based chunking.
//!
//! `parse_document` turns a file's raw text + filesystem times into a [`ParsedDoc`]: the
//! effective metadata (with read-time fallbacks materialized) and the body split into
//! size-capped, heading-delimited chunks. The index layer ([`crate::index`]) persists it.

pub mod chunker;
pub mod frontmatter;

use std::time::SystemTime;

pub use chunker::{Chunk, MAX_CHUNK_CHARS};
pub use frontmatter::EffectiveMeta;

#[derive(Debug, Clone)]
pub struct ParsedDoc {
    pub meta: EffectiveMeta,
    pub chunks: Vec<Chunk>,
}

/// Parse a markdown document. `filename` is the file stem (used for the `title` fallback);
/// `birthtime`/`mtime` feed the `created` fallback chain (birthtime → mtime).
pub fn parse_document(
    filename: &str,
    content: &str,
    birthtime: Option<SystemTime>,
    mtime: SystemTime,
) -> ParsedDoc {
    let (yaml, body) = frontmatter::split_frontmatter(content);
    let first_h1 = chunker::first_h1(body);
    let meta = frontmatter::resolve_meta(yaml, first_h1.as_deref(), filename, birthtime, mtime);
    let chunks = chunker::chunk_markdown(body);
    ParsedDoc { meta, chunks }
}
