//! `{root}/{path}` address parsing + safe resolution to an OS path.
//!
//! Every document address is `{root}/{path-within-root}`, matching the resource URI
//! `mneme://{root}/{path}`. Parsing rejects traversal (`..`/`.`) and absolute forms;
//! resolution additionally canonicalizes existing targets to defend against symlink escape.

use std::path::{Path, PathBuf};

use crate::error::{MnemeError, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiAddress {
    pub root: String,
    /// In-root relative path, forward-slash separated (may be empty = the root itself).
    pub rest: String,
}

impl WikiAddress {
    pub fn parse(s: &str) -> Result<Self> {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return Err(MnemeError::InvalidAddress(s.to_string(), "empty"));
        }
        let norm = trimmed.replace('\\', "/");
        let (root, rest) = match norm.split_once('/') {
            Some((r, rest)) => (r.to_string(), rest.to_string()),
            None => (norm.clone(), String::new()),
        };
        if root.is_empty() {
            return Err(MnemeError::InvalidAddress(s.to_string(), "empty root"));
        }
        for seg in rest.split('/') {
            if seg == "." || seg == ".." {
                return Err(MnemeError::InvalidAddress(
                    s.to_string(),
                    "path traversal not allowed",
                ));
            }
        }
        // `.mneme/` is Mneme's own derived index — not addressable wiki content. Reject it as the
        // first path segment so no file tool can read/write/delete into the index dir.
        if rest.split('/').next() == Some(".mneme") {
            return Err(MnemeError::InvalidAddress(
                s.to_string(),
                ".mneme is reserved for the index",
            ));
        }
        Ok(Self { root, rest })
    }

    /// Resolve to an OS path under `root_folder`, asserting the result stays inside it.
    pub fn resolve(&self, root_folder: &Path) -> Result<PathBuf> {
        let mut p = root_folder.to_path_buf();
        for seg in self.rest.split('/').filter(|s| !s.is_empty()) {
            p.push(seg);
        }
        // Defense-in-depth beyond the `..` reject: a symlink could still point outside.
        if p.exists() {
            let canon = p.canonicalize()?;
            let root_canon = root_folder.canonicalize()?;
            if !canon.starts_with(&root_canon) {
                return Err(MnemeError::PathEscape);
            }
        }
        Ok(p)
    }
}
