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
    /// Glob matched against the full `{root}/{path}` address (e.g. `personal/contacts/*.md`).
    pub pattern: String,
    /// Extra `{root}` or `{root}/sub` narrowing; the `pattern` already carries the root, so this
    /// is rarely needed (e.g. `personal`).
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
    /// The `{root}` or `{root}/sub` to scan (e.g. `personal` or `personal/contacts`).
    pub path: Option<String>,
    /// Case-insensitive match.
    #[serde(default, rename = "-i")]
    pub ignore_case: bool,
    /// Show line numbers in Content mode (default true). `-n: false` suppresses them.
    #[serde(rename = "-n")]
    pub line_numbers: Option<bool>,
    /// Lines of context before/after each match (Content mode).
    #[serde(default)]
    pub context: usize,
    #[serde(default)]
    pub output_mode: GrepOutputMode,
    /// Document must carry every one of these tags (`.md` frontmatter only).
    #[serde(default)]
    pub tags: Vec<String>,
    /// Restrict to documents whose `created` date is in range (`.md` frontmatter only).
    #[serde(rename = "dateRange")]
    pub date_range: Option<DateRange>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    Text,
    Vector,
    #[default]
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
    /// `text` (FTS only), `vector` (semantic KNN), or `hybrid` (FTS + KNN fused with RRF).
    /// Default `hybrid`. `vector`/`hybrid` degrade to text (with a `note`) when no embedding
    /// model is provisioned.
    #[serde(default)]
    pub mode: SearchMode,
    /// Scope to a `{root}` or `{root}/sub` (e.g. `personal` or `personal/contacts`).
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
    /// The `{root}` or `{root}/sub` to list (e.g. `personal` or `personal/contacts`).
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
    /// Scope to a `{root}` or `{root}/sub` (e.g. `personal`).
    pub subtree: Option<String>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct TagsParams {
    /// Scope to a `{root}` or `{root}/sub` (e.g. `personal`).
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
    /// The `{root}` or `{root}/sub` to reconcile (e.g. `personal`).
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
    /// Reserved — model switching is deferred (US-657+). Supplying a different model name
    /// than the configured one returns an error; omit or match the configured name.
    pub model: Option<String>,
}
