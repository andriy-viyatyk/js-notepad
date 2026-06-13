//! Single include-allowlist + ignore-rules walk over a root (the `ignore` crate).
//!
//! A file is a document iff it matches include AND not ignore (D18). The two filters are
//! applied in the correct precedence — **ignore wins**:
//! - **Ignore** prunes during the walk: the root's native `.gitignore`/`.ignore`, plus the
//!   built-in defaults and per-root `ignore` patterns added as `!`-globs in an Override.
//! - **Include** is a *post-filter* on the surviving files, matched gitignore-style (so
//!   `*.md` matches at any depth). It is deliberately NOT an Override whitelist: in the
//!   `ignore` crate a whitelist override out-ranks `.gitignore`, which would wrongly
//!   resurrect a git-ignored `*.md`.
//!
//! Every `list`/`glob`/`grep` consumes this one walk, so the indexable set is defined here.

use std::path::PathBuf;

use ignore::gitignore::GitignoreBuilder;
use ignore::overrides::OverrideBuilder;
use ignore::WalkBuilder;

use crate::config::RootConfig;
use crate::error::Result;

pub struct WalkedFile {
    pub abs: PathBuf,
    /// Path relative to the root, forward-slash separated.
    pub rel: String,
}

/// Directory names pruned from every walk. Reused by the watcher's coarse event filter
/// (US-654) so the index's own `.mneme/` WAL/SHM writes never retrigger a reconcile.
pub const DEFAULT_IGNORES: &[&str] = &[".git", ".mneme", "node_modules", "target", "dist", "build"];

pub fn walk_root(root: &RootConfig) -> Result<Vec<WalkedFile>> {
    let includes = if root.include.is_empty() {
        vec!["*.md".to_string()]
    } else {
        root.include.clone()
    };
    // Include allowlist as a gitignore-style matcher (post-filter, applied after pruning).
    let mut inc_builder = GitignoreBuilder::new(&root.folder);
    for g in &includes {
        inc_builder.add_line(None, g)?;
    }
    let include = inc_builder.build()?;

    // Ignore rules added as `!`-globs (Override "ignore"). These prune the walk; the
    // native .gitignore/.ignore are honored by WalkBuilder directly.
    let mut ob = OverrideBuilder::new(&root.folder);
    for ig in DEFAULT_IGNORES {
        ob.add(&format!("!{ig}"))?;
    }
    for ig in &root.ignore {
        ob.add(&format!("!{ig}"))?;
    }
    let overrides = ob.build()?;

    let mut builder = WalkBuilder::new(&root.folder);
    builder
        .overrides(overrides)
        .hidden(false) // dotfiles handled explicitly via ignore globs, not auto-hidden
        .parents(false) // self-contained: never consult parent-dir gitignores
        .git_global(false)
        .git_ignore(true)
        .git_exclude(true)
        .require_git(false) // honor .gitignore even outside a git repo
        .ignore(true);

    let mut out = Vec::new();
    for result in builder.build() {
        let entry = result?;
        if !entry.file_type().map_or(false, |ft| ft.is_file()) {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root.folder)
            .unwrap_or_else(|_| entry.path());
        // Include allowlist post-filter: keep only files matching an include glob.
        if include.matched(rel, false).is_ignore() {
            out.push(WalkedFile {
                abs: entry.path().to_path_buf(),
                rel: rel.to_string_lossy().replace('\\', "/"),
            });
        }
    }
    Ok(out)
}
