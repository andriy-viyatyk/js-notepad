//! Document Store — the filesystem abstraction over one or more wiki roots.
//!
//! Source of truth for everything downstream. Reads/writes markdown, applies
//! string-replace edits, matches by name pattern (`glob`) and by literal/regex content
//! (`grep` — a streaming scan, distinct from the future semantic Search Engine), resolves
//! `{root}/{path}` addresses safely (no traversal outside a root), and serves binary
//! attachment bytes. A single include-allowlist + ignore-rules walk (see [`walk`]) defines
//! the indexable file set that `list`/`glob`/`grep` operate over.

pub mod address;
pub mod grep;
pub mod roots;

mod edit;
mod glob;
mod walk;

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
                    if grep::has_match(&read_lossy(&abs)?, &re) {
                        out.push(addr);
                    }
                }
                Ok(GrepResult::Files(out))
            }
            OutputMode::Count => {
                let mut out = Vec::new();
                for (addr, abs) in files {
                    let c = grep::count_matches(&read_lossy(&abs)?, &re);
                    if c > 0 {
                        out.push((addr, c));
                    }
                }
                Ok(GrepResult::Counts(out))
            }
            OutputMode::Content => {
                let mut out = Vec::new();
                for (addr, abs) in files {
                    let lines = grep::scan_content(&read_lossy(&abs)?, &re, opts.context);
                    if !lines.is_empty() {
                        out.push((addr, lines));
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
            for wf in walk::walk_root(root)? {
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
