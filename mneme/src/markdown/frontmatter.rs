//! YAML frontmatter parsing + read-time fallback resolution.
//!
//! The four frontmatter fields (`title`, `tags`, `created`, `verified`) are all optional
//! (EPIC-032). Effective values are resolved here and later materialized into the index
//! `documents` table — files are never rewritten (reindex is read-only). A malformed YAML
//! block never fails indexing: it degrades to "no frontmatter" and the computed fallbacks
//! apply.

use std::time::SystemTime;

use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;

/// Raw frontmatter as authored — every field optional, unknown keys ignored (open schema).
#[derive(Debug, Default, Deserialize)]
struct RawFrontmatter {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    verified: Option<String>,
}

/// Effective metadata after fallbacks — what gets stored in the index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EffectiveMeta {
    pub title: String,
    pub tags: Vec<String>,
    /// ISO `YYYY-MM-DD`; always set (frontmatter → birthtime → mtime).
    pub created: Option<String>,
    /// ISO `YYYY-MM-DD`; only set when present in frontmatter (a freshness date).
    pub verified: Option<String>,
}

/// Split a document into its (optional) YAML frontmatter block and the body.
///
/// A block is recognized only when the file starts with a `---` line; the block ends at the
/// next line that is exactly `---`. Anything else → `(None, whole input)`.
pub fn split_frontmatter(content: &str) -> (Option<&str>, &str) {
    // Tolerate a leading UTF-8 BOM.
    let s = content.strip_prefix('\u{feff}').unwrap_or(content);
    let after = match s.strip_prefix("---\n").or_else(|| s.strip_prefix("---\r\n")) {
        Some(rest) => rest,
        None => return (None, content),
    };
    // Find the closing fence: a line whose trimmed-of-CR content is exactly "---".
    let mut idx = 0usize;
    for line in after.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        if trimmed == "---" {
            let yaml = &after[..idx];
            let body = &after[idx + line.len()..];
            return (Some(yaml), body);
        }
        idx += line.len();
    }
    // Unterminated block — treat the whole thing as body (no frontmatter).
    (None, content)
}

/// Resolve effective metadata. `first_h1` is the first level-1 heading text in the body (if
/// any), `filename` is the file's stem (no extension), and the times feed the `created`
/// fallback chain (birthtime → mtime). Times are converted to a UTC calendar date.
pub fn resolve_meta(
    yaml: Option<&str>,
    first_h1: Option<&str>,
    filename: &str,
    birthtime: Option<SystemTime>,
    mtime: SystemTime,
) -> EffectiveMeta {
    let raw: RawFrontmatter = match yaml {
        Some(y) if !y.trim().is_empty() => serde_yaml_ng::from_str(y).unwrap_or_else(|e| {
            tracing::warn!("ignoring malformed frontmatter: {e}");
            RawFrontmatter::default()
        }),
        _ => RawFrontmatter::default(),
    };

    let title = raw
        .title
        .filter(|t| !t.trim().is_empty())
        .or_else(|| first_h1.map(|s| s.to_string()))
        .unwrap_or_else(|| filename.to_string());

    let tags = raw.tags.unwrap_or_default();

    let created = raw
        .created
        .as_deref()
        .and_then(valid_iso_date)
        .or_else(|| birthtime.and_then(system_time_to_date))
        .or_else(|| system_time_to_date(mtime));

    let verified = raw.verified.as_deref().and_then(valid_iso_date);

    EffectiveMeta {
        title,
        tags,
        created,
        verified,
    }
}

/// Accept a `YYYY-MM-DD` string, returning it normalized; reject anything else.
fn valid_iso_date(s: &str) -> Option<String> {
    let s = s.trim();
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .ok()
        .map(|d| d.format("%Y-%m-%d").to_string())
}

/// Convert a `SystemTime` to a UTC `YYYY-MM-DD` string. UTC (never local) keeps stored dates
/// deterministic across machines/timezones.
fn system_time_to_date(t: SystemTime) -> Option<String> {
    let dt: DateTime<Utc> = t.into();
    Some(dt.format("%Y-%m-%d").to_string())
}
