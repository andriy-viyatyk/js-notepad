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
    /// FTS5 `bm25()` — lower is better; results are returned best-first.
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

#[derive(Debug, Serialize)]
pub struct ReindexRoot {
    pub name: String,
    pub scanned: usize,
    pub indexed: usize,
    pub refreshed: usize,
    pub skipped: usize,
    pub deleted: usize,
    pub errors: usize,
}

#[derive(Debug, Serialize)]
pub struct ReindexResult {
    pub roots: Vec<ReindexRoot>,
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
}

#[derive(Debug, Serialize)]
pub struct StatusResult {
    pub roots: Vec<StatusRoot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<crate::model::ModelStatus>,
}
