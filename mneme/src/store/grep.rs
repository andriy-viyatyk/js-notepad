//! `wiki_grep` — a streaming regex scan over the indexable file set (≈ Grep).
//!
//! Distinct from the future semantic Search Engine (US-658). Mirrors Grep's output modes.
//! Implemented with the `regex` crate (Concern 6: the documented fallback to the ripgrep
//! `grep-*` libs — same call surface, simpler compile; adequate for author-controlled
//! markdown). `tags`/`dateRange` filters are deferred to US-653 (need frontmatter/index).

use regex::{Regex, RegexBuilder};

use crate::error::Result;

#[derive(Debug, Clone, Copy)]
pub enum OutputMode {
    FilesWithMatches,
    Content,
    Count,
}

#[derive(Debug, Clone)]
pub struct GrepOptions {
    pub ignore_case: bool,
    /// Lines of context before/after each match (Content mode).
    pub context: usize,
    pub output_mode: OutputMode,
    /// Emit line numbers in Content-mode output (default true).
    pub line_numbers: bool,
}

impl Default for GrepOptions {
    fn default() -> Self {
        Self {
            ignore_case: false,
            context: 0,
            output_mode: OutputMode::FilesWithMatches,
            line_numbers: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentLine {
    pub line_number: usize,
    pub text: String,
    pub is_match: bool,
}

#[derive(Debug, Clone)]
pub enum GrepResult {
    Files(Vec<String>),
    Counts(Vec<(String, usize)>),
    Content(Vec<(String, Vec<ContentLine>)>),
}

pub fn compile(pattern: &str, ignore_case: bool) -> Result<Regex> {
    Ok(RegexBuilder::new(pattern)
        .case_insensitive(ignore_case)
        .build()?)
}

pub fn has_match(content: &str, re: &Regex) -> bool {
    content.lines().any(|l| re.is_match(l))
}

pub fn count_matches(content: &str, re: &Regex) -> usize {
    content.lines().filter(|l| re.is_match(l)).count()
}

/// Matching lines plus `context` lines of surrounding context, merged and de-duplicated,
/// in ascending line order. Empty when there are no matches.
pub fn scan_content(content: &str, re: &Regex, context: usize) -> Vec<ContentLine> {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Vec::new();
    }
    let matches: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| re.is_match(l))
        .map(|(i, _)| i)
        .collect();
    if matches.is_empty() {
        return Vec::new();
    }
    let matched: std::collections::HashSet<usize> = matches.iter().copied().collect();
    let mut include = std::collections::BTreeSet::new();
    for &m in &matches {
        let start = m.saturating_sub(context);
        let end = (m + context).min(lines.len() - 1);
        for i in start..=end {
            include.insert(i);
        }
    }
    include
        .into_iter()
        .map(|i| ContentLine {
            line_number: i + 1,
            text: lines[i].to_string(),
            is_match: matched.contains(&i),
        })
        .collect()
}
