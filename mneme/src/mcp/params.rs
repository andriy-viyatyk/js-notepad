//! MCP tool request types — `Deserialize` for JSON-RPC input + `JsonSchema` so rmcp can
//! publish each tool's `inputSchema`. `schemars` is used through rmcp's re-export
//! (`rmcp::schemars`) to avoid a version-skew dependency.

use rmcp::schemars;
use serde::Deserialize;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ReadParams {
    /// `{root}/{path}` address of the document.
    pub path: String,
    /// 1-based first line to return.
    pub offset: Option<usize>,
    /// Maximum number of lines to return.
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WriteParams {
    /// `{root}/{path}` address to write.
    pub path: String,
    /// The WHOLE file content (frontmatter is YAML text at the top, exactly like a real file).
    pub content: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct EditParams {
    pub path: String,
    pub old_string: String,
    pub new_string: String,
    #[serde(default)]
    pub replace_all: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteParams {
    pub path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GlobParams {
    /// Glob matched against the full `{root}/{path}` address (e.g. `work/**/*.md`).
    pub pattern: String,
    /// Optional `{root}` or `{root}/sub` scope.
    pub path: Option<String>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum GrepOutputMode {
    #[default]
    FilesWithMatches,
    Content,
    Count,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GrepParams {
    /// Literal/regex pattern (streaming scan over indexed files — not FTS).
    pub pattern: String,
    pub path: Option<String>,
    /// Case-insensitive match.
    #[serde(default, rename = "-i")]
    pub ignore_case: bool,
    /// Lines of context before/after each match (Content mode).
    #[serde(default)]
    pub context: usize,
    #[serde(default)]
    pub output_mode: GrepOutputMode,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    #[default]
    Text,
    Vector,
    Hybrid,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct DateRange {
    /// Inclusive lower bound (ISO `YYYY-MM-DD`) against `created`.
    pub from: Option<String>,
    /// Inclusive upper bound (ISO `YYYY-MM-DD`).
    pub to: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchParams {
    pub query: String,
    /// `text` (default in this build), `vector`, or `hybrid`. Vector/hybrid degrade to text
    /// until embeddings land (US-658) and the result carries a `note`.
    #[serde(default)]
    pub mode: SearchMode,
    /// Optional `{root}` or `{root}/sub` scope (omit = all roots, merged).
    pub subtree: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, rename = "excludeTags")]
    pub exclude_tags: Vec<String>,
    #[serde(rename = "dateRange")]
    pub date_range: Option<DateRange>,
    /// Max results (default 10).
    #[serde(rename = "topK")]
    pub top_k: Option<usize>,
    /// Reserved — only `.md` is indexed today (multi-type is backlog); ignored.
    pub ext: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct TreeParams {
    /// Optional `{root}` or `{root}/sub` scope (omit = all roots).
    pub path: Option<String>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct TimelineParams {
    /// Additional tags the daily-log entry must also carry.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Inclusive date lower bound (ISO `YYYY-MM-DD`, parsed from the filename).
    pub from: Option<String>,
    pub to: Option<String>,
    pub subtree: Option<String>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct TagsParams {
    pub subtree: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AddRootParams {
    /// Absolute OS path of the folder to register (must exist).
    pub folder: String,
    /// Root id used in `mneme://{name}/…` URIs (default: the folder basename).
    pub name: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct RemoveRootParams {
    /// Registered root name.
    pub root: String,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct ReindexParams {
    /// `{root}` or `{root}/sub` to scope (omit = all roots).
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct IndexDeleteParams {
    /// Registered root name.
    pub root: String,
    /// `<model>-<precision>` index identity (e.g. `gte-multilingual-base-int8`).
    #[serde(rename = "modelId")]
    pub model_id: String,
    /// Schema version of the index DB to delete.
    #[serde(rename = "schemaVer")]
    pub schema_ver: u32,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct ModelUpdateParams {
    /// Reserved — model management arrives in US-656.
    pub model: Option<String>,
}
