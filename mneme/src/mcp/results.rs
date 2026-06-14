//! MCP tool result types — `Serialize`d into `CallToolResult::structured` so both AI agents
//! and Persephone get machine-readable output. Field names use the camelCase the draft MCP
//! surface documents.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Frontmatter {
    pub title: String,
    pub tags: Vec<String>,
    pub created: Option<String>,
    pub verified: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReadResult {
    pub content: String,
    pub frontmatter: Frontmatter,
}

#[derive(Debug, Serialize)]
pub struct GlobResult {
    pub matches: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub uri: String,
    pub title: String,
    pub tags: Vec<String>,
    pub snippet: String,
    /// Mode-dependent ranking scalar: bm25 (lower-better) for `text`, cosine distance
    /// (lower-better) for `vector`, RRF (higher-better) for `hybrid`. **Results are returned
    /// best-first — rely on array order, not on interpreting this value across modes.**
    pub score: f64,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub results: Vec<SearchHit>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TreeEntry {
    pub uri: String,
    pub name: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub depth: usize,
}

#[derive(Debug, Serialize)]
pub struct TreeResult {
    pub entries: Vec<TreeEntry>,
}

#[derive(Debug, Serialize)]
pub struct TimelineEntry {
    pub uri: String,
    pub title: String,
    pub date: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TimelineResult {
    pub entries: Vec<TimelineEntry>,
}

#[derive(Debug, Serialize)]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct TagsResult {
    pub tags: Vec<TagCount>,
}

#[derive(Debug, Serialize)]
pub struct RootInfo {
    pub name: String,
    pub folder: String,
}

#[derive(Debug, Serialize)]
pub struct ListRootsResult {
    pub roots: Vec<RootInfo>,
}

#[derive(Debug, Serialize)]
pub struct AddRootResult {
    pub name: String,
    pub folder: String,
}

/// Effective per-root filter config after a `wiki_root_config` read or update.
#[derive(Debug, Serialize)]
pub struct RootConfigResult {
    pub name: String,
    pub folder: String,
    pub include: Vec<String>,
    pub ignore: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ReindexRoot {
    pub name: String,
    pub scanned: usize,
    pub indexed: usize,
    pub refreshed: usize,
    pub skipped: usize,
    /// Unchanged docs whose vectors were backfilled this pass (US-658).
    pub vectorized: usize,
    pub deleted: usize,
    pub errors: usize,
}

#[derive(Debug, Serialize)]
pub struct ReindexResult {
    pub roots: Vec<ReindexRoot>,
}

/// Live reindex progress for a root (US-659). `phase` is `idle`/`scanning`/`embedding`/`done`/
/// `cancelled`/`error`; `processed`/`total` count files while scanning, documents while embedding.
#[derive(Debug, Serialize)]
pub struct ReindexProgressDto {
    pub phase: String,
    pub processed: usize,
    pub total: usize,
}

impl From<crate::indexer::ReindexProgress> for ReindexProgressDto {
    fn from(p: crate::indexer::ReindexProgress) -> Self {
        Self {
            phase: p.phase.as_str().to_string(),
            processed: p.processed,
            total: p.total,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct StatusRoot {
    pub name: String,
    pub folder: String,
    #[serde(rename = "docCount")]
    pub doc_count: usize,
    pub model: String,
    pub precision: String,
    #[serde(rename = "schemaVer")]
    pub schema_ver: u32,
    #[serde(rename = "indexPath")]
    pub index_path: String,
    #[serde(rename = "indexBytes")]
    pub index_bytes: u64,
    /// Latest reindex progress for this root, if it has reconciled at least once.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reindex: Option<ReindexProgressDto>,
}

#[derive(Debug, Serialize)]
pub struct StatusResult {
    pub roots: Vec<StatusRoot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<crate::model::ModelStatus>,
}
