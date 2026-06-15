//! Document Store — the filesystem abstraction over one or more wiki roots.
//!
//! Source of truth for everything downstream. Reads/writes markdown, applies
//! string-replace edits, matches by name pattern (`glob`) and by literal/regex content
//! (`grep` — a streaming scan, distinct from the future semantic Search Engine), resolves
//! `{root}/{path}` addresses safely (no traversal outside a root), and serves binary
//! attachment bytes. The file tools (`list`/`glob`/`grep`/`read`) present the **whole root** like
//! a real filesystem — every file except `.mneme/` (see [`walk::walk_all`]). The narrower
//! include-allowlist + ignore-rules walk ([`walk::walk_root`]) defines the **index set** the
//! indexer/search operate over; `include`/`ignore` are indexing-only and do not affect file
//! visibility here.

pub mod address;
pub mod grep;
pub mod roots;

mod edit;
mod glob;
pub mod walk;

// The indexer drives `walk_root` (the index set); the store's file tools drive `walk_all` (the
// whole root minus `.mneme/`). `is_indexable` lets the write path skip indexing non-index files.
pub use walk::{is_indexable, walk_all, walk_dirs, walk_root, WalkedFile, DEFAULT_IGNORES};

use std::path::{Path, PathBuf};

use crate::config::{Config, RootConfig};
use crate::error::{MnemeError, Result};

use address::WikiAddress;
use grep::{GrepOptions, GrepResult, OutputMode};
use roots::RootRegistry;

pub struct DocumentStore {
    registry: RootRegistry,
}

impl DocumentStore {
    pub fn open(config: &Config) -> Result<Self> {
        Self::from_roots(config.roots.clone())
    }

    pub fn from_roots(roots: Vec<RootConfig>) -> Result<Self> {
        Ok(Self {
            registry: RootRegistry::from_config(roots)?,
        })
    }

    pub fn registry(&self) -> &RootRegistry {
        &self.registry
    }

    pub fn registry_mut(&mut self) -> &mut RootRegistry {
        &mut self.registry
    }

    fn resolve(&self, addr: &str) -> Result<PathBuf> {
        let a = WikiAddress::parse(addr)?;
        self.registry.resolve(&a)
    }

    /// Read a document as UTF-8 (lossy). `offset` (1-based line) / `limit` mirror Read.
    pub fn read(&self, addr: &str, offset: Option<usize>, limit: Option<usize>) -> Result<String> {
        let text = read_lossy(&self.resolve(addr)?)?;
        if offset.is_none() && limit.is_none() {
            return Ok(text);
        }
        let start = offset.unwrap_or(1).saturating_sub(1);
        let lines = text.lines().skip(start);
        let picked: Vec<&str> = match limit {
            Some(n) => lines.take(n).collect(),
            None => lines.collect(),
        };
        Ok(picked.join("\n"))
    }

    /// Raw bytes — for binary attachments (served via `resources/read` in US-655).
    /// Resolves directly, so attachments outside the include-allowlist are still reachable.
    pub fn read_bytes(&self, addr: &str) -> Result<Vec<u8>> {
        Ok(std::fs::read(self.resolve(addr)?)?)
    }

    /// Write the whole file (`content` is verbatim; frontmatter handling is US-653).
    pub fn write(&self, addr: &str, content: &str) -> Result<()> {
        let p = self.resolve(addr)?;
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&p, content)?;
        Ok(())
    }

    /// Write raw bytes (binary upload — `upload`). Creates parent dirs; `.mneme/` is already
    /// rejected by `WikiAddress::parse`.
    pub fn write_bytes(&self, addr: &str, bytes: &[u8]) -> Result<()> {
        let p = self.resolve(addr)?;
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&p, bytes)?;
        Ok(())
    }

    /// Exact string replacement (≈ Edit). Errors if `old` is absent, or — unless
    /// `replace_all` — non-unique.
    pub fn edit(&self, addr: &str, old: &str, new: &str, replace_all: bool) -> Result<()> {
        let p = self.resolve(addr)?;
        let content = read_lossy(&p)?;
        let updated = edit::apply_edit(&content, old, new, replace_all)?;
        std::fs::write(&p, updated)?;
        Ok(())
    }

    pub fn delete(&self, addr: &str) -> Result<()> {
        std::fs::remove_file(self.resolve(addr)?)?;
        Ok(())
    }

    /// Create an (empty) directory at `addr`, parents included (≈ `mkdir -p`). `.mneme/` and
    /// traversal are already rejected by `resolve` → `WikiAddress::parse`.
    pub fn mkdir(&self, addr: &str) -> Result<()> {
        std::fs::create_dir_all(self.resolve(addr)?)?;
        Ok(())
    }

    /// Move/rename a file **or** directory within the store. Refuses an existing destination (no
    /// silent overwrite) and creates the destination's parent dirs. Both addresses are
    /// traversal-checked by `resolve`.
    pub fn rename(&self, from: &str, to: &str) -> Result<()> {
        let from_p = self.resolve(from)?;
        let to_p = self.resolve(to)?;
        if to_p.exists() {
            return Err(MnemeError::Internal(format!(
                "destination already exists: {to}"
            )));
        }
        if let Some(parent) = to_p.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::rename(&from_p, &to_p)?;
        Ok(())
    }

    /// Delete a file, or a directory and all its contents (≈ `rm` / `rm -r`). `resolve` rejects
    /// `.mneme/` and traversal.
    pub fn delete_path(&self, addr: &str) -> Result<()> {
        let p = self.resolve(addr)?;
        if p.is_dir() {
            std::fs::remove_dir_all(&p)?;
        } else {
            std::fs::remove_file(&p)?;
        }
        Ok(())
    }

    /// List directories (the folder skeleton, **including empty ones**) as `{root}/{path}`
    /// addresses; `path` scopes to a `{root}` or `{root}/sub` prefix (omitted = all roots). Feeds
    /// the directory-aware `tree` so empty folders are visible.
    pub fn list_dirs(&self, path: Option<&str>) -> Result<Vec<String>> {
        let mut out = Vec::new();
        for (root, base) in self.resolve_scope(path)? {
            let prefix = format!("{base}/");
            for wf in walk::walk_dirs(root)? {
                if base.is_empty() || wf.rel == base || wf.rel.starts_with(&prefix) {
                    out.push(format!("{}/{}", root.name, wf.rel));
                }
            }
        }
        out.sort();
        Ok(out)
    }

    /// List indexable documents as `{root}/{path}` addresses; `path` scopes to a
    /// `{root}` or `{root}/sub` prefix (omitted = all roots).
    pub fn list(&self, path: Option<&str>) -> Result<Vec<String>> {
        Ok(self.collect(path)?.into_iter().map(|(a, _)| a).collect())
    }

    /// Find documents by path/name pattern (≈ Glob). The pattern is matched against the
    /// full `{root}/{path}` address; `path` pre-scopes to a root/sub-prefix.
    pub fn glob(&self, pattern: &str, path: Option<&str>) -> Result<Vec<String>> {
        let matcher = glob::compile_glob(pattern)?;
        Ok(self
            .collect(path)?
            .into_iter()
            .filter(|(a, _)| matcher.is_match(a.as_str()))
            .map(|(a, _)| a)
            .collect())
    }

    /// Literal/regex content scan over the indexable set (≈ Grep). Streaming scan, not
    /// FTS5. `tags`/`dateRange` filters are reserved for US-653 (need frontmatter/index).
    pub fn grep(&self, pattern: &str, path: Option<&str>, opts: &GrepOptions) -> Result<GrepResult> {
        let re = grep::compile(pattern, opts.ignore_case)?;
        let files = self.collect(path)?;
        match opts.output_mode {
            OutputMode::FilesWithMatches => {
                let mut out = Vec::new();
                for (addr, abs) in files {
                    if let Some(text) = read_text_or_skip(&abs)? {
                        if grep::has_match(&text, &re) {
                            out.push(addr);
                        }
                    }
                }
                Ok(GrepResult::Files(out))
            }
            OutputMode::Count => {
                let mut out = Vec::new();
                for (addr, abs) in files {
                    if let Some(text) = read_text_or_skip(&abs)? {
                        let c = grep::count_matches(&text, &re);
                        if c > 0 {
                            out.push((addr, c));
                        }
                    }
                }
                Ok(GrepResult::Counts(out))
            }
            OutputMode::Content => {
                let mut out = Vec::new();
                for (addr, abs) in files {
                    if let Some(text) = read_text_or_skip(&abs)? {
                        let lines = grep::scan_content(&text, &re, opts.context);
                        if !lines.is_empty() {
                            out.push((addr, lines));
                        }
                    }
                }
                Ok(GrepResult::Content(out))
            }
        }
    }

    /// Walk the scoped roots and return `(address, abs_path)` for every indexable file,
    /// sorted by address.
    fn collect(&self, path: Option<&str>) -> Result<Vec<(String, PathBuf)>> {
        let mut out = Vec::new();
        for (root, base) in self.resolve_scope(path)? {
            let prefix = format!("{base}/");
            for wf in walk::walk_all(root)? {
                if base.is_empty() || wf.rel == base || wf.rel.starts_with(&prefix) {
                    out.push((format!("{}/{}", root.name, wf.rel), wf.abs));
                }
            }
        }
        out.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(out)
    }

    fn resolve_scope<'a>(&'a self, path: Option<&str>) -> Result<Vec<(&'a RootConfig, String)>> {
        match path {
            None => Ok(self
                .registry
                .configs()
                .iter()
                .map(|r| (r, String::new()))
                .collect()),
            Some(p) => {
                let a = WikiAddress::parse(p)?;
                let root = self
                    .registry
                    .get(&a.root)
                    .ok_or_else(|| MnemeError::UnknownRoot(a.root.clone()))?;
                Ok(vec![(root, a.rest)])
            }
        }
    }
}

fn read_lossy(p: &Path) -> Result<String> {
    Ok(String::from_utf8_lossy(&std::fs::read(p)?).into_owned())
}

/// Read a file as text, returning `None` if it looks binary (a NUL byte in the first 8 KiB — the
/// cheap heuristic ripgrep uses). Keeps `grep` from scanning images/PDFs now that the file tools
/// list every file in the root.
fn read_text_or_skip(p: &Path) -> Result<Option<String>> {
    let bytes = std::fs::read(p)?;
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}
