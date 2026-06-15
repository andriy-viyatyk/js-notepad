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

use std::path::{Path, PathBuf};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
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

/// Validate include/ignore globs by building the same matchers [`walk_root`] uses, without
/// walking. Used by `root_config` to reject a bad pattern *before* persisting/applying it,
/// so a live filter update never leaves an unreconcilable config on disk.
pub fn validate_filters(folder: &Path, include: &[String], ignore: &[String]) -> Result<()> {
    let mut inc_builder = GitignoreBuilder::new(folder);
    for g in include {
        inc_builder.add_line(None, g)?;
    }
    inc_builder.build()?;

    let mut ob = OverrideBuilder::new(folder);
    for ig in DEFAULT_IGNORES {
        ob.add(&format!("!{ig}"))?;
    }
    for ig in ignore {
        ob.add(&format!("!{ig}"))?;
    }
    ob.build()?;
    Ok(())
}

/// Build the per-root include matcher (default `*.md`) used by [`walk_root`] / the indexer.
/// Gitignore-style, so a bare `*.md` matches at any depth.
pub fn include_matcher(root: &RootConfig) -> Result<Gitignore> {
    let includes = if root.include.is_empty() {
        vec!["*.md".to_string()]
    } else {
        root.include.clone()
    };
    let mut inc_builder = GitignoreBuilder::new(&root.folder);
    for g in &includes {
        inc_builder.add_line(None, g)?;
    }
    Ok(inc_builder.build()?)
}

/// True when `rel` (forward-slash path within the root) is part of the **index set** — i.e. the
/// indexer would chunk/embed it. Used to keep `write`/`edit` from indexing a file the
/// next reconcile (which uses [`walk_root`]) would just drop.
pub fn is_indexable(root: &RootConfig, rel: &str) -> Result<bool> {
    Ok(include_matcher(root)?
        .matched(Path::new(rel), false)
        .is_ignore())
}

pub fn walk_root(root: &RootConfig) -> Result<Vec<WalkedFile>> {
    // Include allowlist as a gitignore-style matcher (post-filter, applied after pruning).
    let include = include_matcher(root)?;

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

/// Walk EVERY file under the root — the "wiki set" the file tools present, independent of the
/// index filters. The root is browsable like a real filesystem; the **only** pruned path is
/// `.mneme/` (Mneme's own derived index — not user content, and writing into it would corrupt the
/// index). `.gitignore`, the built-in [`DEFAULT_IGNORES`], and the per-root `include`/`ignore` are
/// **indexing** concerns and do NOT apply here — see [`walk_root`] for the index set.
pub fn walk_all(root: &RootConfig) -> Result<Vec<WalkedFile>> {
    let mut builder = WalkBuilder::new(&root.folder);
    builder
        .standard_filters(false) // no .gitignore/.ignore/hidden/parents/global
        .hidden(false)
        .parents(false)
        .git_global(false)
        .git_ignore(false)
        .git_exclude(false)
        .ignore(false)
        .follow_links(false) // never escape the root via a symlinked dir
        .filter_entry(|e| e.file_name() != ".mneme"); // prune the index dir (never descend)

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
        out.push(WalkedFile {
            abs: entry.path().to_path_buf(),
            rel: rel.to_string_lossy().replace('\\', "/"),
        });
    }
    Ok(out)
}

/// Walk EVERY directory under the root — the folder skeleton the tree view shows, **including
/// empty directories** (so a freshly-created or just-emptied folder is still visible). Mirrors
/// [`walk_all`]'s "whole filesystem" rules (no index filters; only `.mneme/` pruned) but yields
/// directory entries; the root folder itself (empty `rel`) is excluded.
pub fn walk_dirs(root: &RootConfig) -> Result<Vec<WalkedFile>> {
    let mut builder = WalkBuilder::new(&root.folder);
    builder
        .standard_filters(false)
        .hidden(false)
        .parents(false)
        .git_global(false)
        .git_ignore(false)
        .git_exclude(false)
        .ignore(false)
        .follow_links(false)
        .filter_entry(|e| e.file_name() != ".mneme");

    let mut out = Vec::new();
    for result in builder.build() {
        let entry = result?;
        if !entry.file_type().map_or(false, |ft| ft.is_dir()) {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root.folder)
            .unwrap_or_else(|_| entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        if rel.is_empty() {
            continue; // the root directory itself is not a child node
        }
        out.push(WalkedFile {
            abs: entry.path().to_path_buf(),
            rel,
        });
    }
    Ok(out)
}
