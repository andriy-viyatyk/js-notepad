# US-685: Mneme — decouple the wiki file set from the index set (full filesystem navigability)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4
**Status:** Design for review
**Depends on:** nothing (foundational). **Enables:** [US-686](../US-686-mneme-binary-tools/README.md) (binary tools), and complements [US-687](../US-687-mneme-relative-links/README.md) (UI links).

> Supersedes the retired triage entry `US-682-mneme-glob-nonmarkdown-files` (the US-682 id
> collided with a completed HTML-viewer task). This is the formal, decided version of that work.

## Goal

Make Mneme's **file tools** present a root exactly like a real filesystem: `wiki_glob`,
`wiki_tree`, `wiki_grep`, `wiki_list`, `wiki_read`, `wiki_write`, `wiki_edit`, `wiki_delete` operate
over **every file under the root folder** — the only exclusion is `.mneme/` (Mneme's own derived
index). The `include`/`ignore` config becomes **indexing-only**: it governs what gets chunked,
embedded, and surfaced by `wiki_search`/FTS — and nothing else.

This is the architectural intent from the start: a markdown doc can reference sibling binary
attachments (images, mermaid `.mmd`, PDFs) that live in the same root, and both agents and the
Persephone UI must be able to enumerate, read, and write them through Mneme rather than falling
back to raw OS tools.

## Background

### The current coupling (the bug)

A single walk — `walk_root` in [`mneme/src/store/walk.rs`](../../../mneme/src/store/walk.rs) —
applies **ignore + an include allowlist** and is consumed by **both** the store and the indexer:

- `RootConfig.include` defaults to `["*.md"]` ([`config.rs:37-47`](../../../mneme/src/config.rs), `default_include()`).
- `walk_root` post-filters the walk to files matching `include` ([`walk.rs:54-108`](../../../mneme/src/store/walk.rs)).
- `DocumentStore::collect` calls `walk_root` ([`store/mod.rs:162-174`](../../../mneme/src/store/mod.rs)) — so `list`/`glob`/`grep`/`tree` see only `.md`.
- The indexer also calls `walk_root` ([`indexer/mod.rs:167`](../../../mneme/src/indexer/mod.rs) `reconcile_root`, [`:233`](../../../mneme/src/indexer/mod.rs) `reconcile_job`).

Result: non-`.md` files are invisible to the file tools, even though they sit in the root. A
consumer agent (the EverGreen project) hit exactly this — `wiki_glob` on a folder of `.html`
mockups returned only the one `README.md`, and it had to abandon Mneme for OS tools.

### What already works (no change needed here)

- **`wiki_read` on non-md text** — `DocumentStore::read` ([`store/mod.rs:59`](../../../mneme/src/store/mod.rs)) resolves + `read_lossy`, **no extension filter**. It just was never *listed*.
- **`WikiAddress::resolve`** ([`store/address.rs:44`](../../../mneme/src/store/address.rs)) enforces no-traversal/no-symlink-escape but does **not** consult `include` — so read/write/edit/delete already work on any resolvable path.
- **Binary attachments** — `read_resource_body` ([`mcp/mod.rs:805`](../../../mneme/src/mcp/mod.rs)) already serves any resolvable file as a base64 blob (`is_text_addr` decides text vs blob via `read_bytes`). That's the path the Persephone Image viewer uses (US-687).
- `.mneme` is already in `DEFAULT_IGNORES` ([`walk.rs:31`](../../../mneme/src/store/walk.rs)) for the *index* walk.

### The one footgun the user confirmed

"Everything under the root" must exclude **`.mneme/`** — it's Mneme's own SQLite index
(`<root>/.mneme/<modelId>/index-v<n>.db` + WAL/SHM), not user content. Listing it is noise, and
letting a tool `wiki_write`/`wiki_delete` into it would corrupt the live index. `.mneme/` is the
**only** exclusion; `.git`, `node_modules`, dotfiles, and git-ignored files are all visible (user's
explicit decision — see Concerns).

## Implementation plan

All paths under `mneme/`. **Rust task** — per project rules, `/review` & `/userdoc` do **not**
apply; verify with `cargo build --release` + `cargo test`. The crate's `README.md` and the
`wiki-guide.md` asset are its primary docs.

### 1. Add `walk_all` to `store/walk.rs`

A plain recursive walk over the root, with **all** ignore machinery disabled, pruning only
`.mneme/`. Add after `walk_root`:

```rust
/// Walk EVERY file under the root — the "wiki set" the file tools present, independent of the
/// index filters. The root is browsable like a real filesystem; the **only** pruned path is
/// `.mneme/` (Mneme's own derived index — not user content, and writing into it would corrupt
/// the index). `.gitignore`, the built-in `DEFAULT_IGNORES`, and the per-root `include`/`ignore`
/// are **indexing** concerns and do NOT apply here — see [`walk_root`] for the index set.
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
        .filter_entry(|e| e.file_name() != ".mneme"); // prune the index dir (and never descend)
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
```

(`ignore::WalkBuilder::filter_entry` prunes the matched directory, so the walk never descends into
`.mneme/` — both the dir and its contents are absent.)

### 2. Add `is_indexable` to `store/walk.rs` (for the write path, step 5)

Extract the include-allowlist matcher so the write path can ask "should this file be indexed?"
without re-walking. Add:

```rust
use ignore::gitignore::Gitignore;

/// Build the per-root include matcher (default `*.md`) used by [`walk_root`] / the indexer.
pub fn include_matcher(root: &RootConfig) -> Result<Gitignore> {
    let includes = if root.include.is_empty() {
        vec!["*.md".to_string()]
    } else {
        root.include.clone()
    };
    let mut b = GitignoreBuilder::new(&root.folder);
    for g in &includes {
        b.add_line(None, g)?;
    }
    Ok(b.build()?)
}

/// True when `rel` (forward-slash path within the root) is part of the **index set** — i.e. the
/// indexer would chunk/embed it. Used to keep `wiki_write`/`wiki_edit` from indexing a file the
/// next reconcile would just drop.
pub fn is_indexable(root: &RootConfig, rel: &str) -> Result<bool> {
    Ok(include_matcher(root)?
        .matched(std::path::Path::new(rel), false)
        .is_ignore())
}
```

Refactor `walk_root` to call `include_matcher(root)?` instead of inlining the builder (keeps one
source of truth for the include semantics). Behaviour of `walk_root` is otherwise **unchanged**.

### 3. Point the store at `walk_all`

In [`store/mod.rs`](../../../mneme/src/store/mod.rs):

- **Re-export** (line 19): `pub use walk::{walk_all, walk_root, is_indexable, WalkedFile, DEFAULT_IGNORES};`
- **`collect`** (line ~166): change `for wf in walk::walk_root(root)?` → `for wf in walk::walk_all(root)?`.
- **Module doc** (lines 6-8): update the "indexable file set that `list`/`glob`/`grep` operate over" sentence — the file tools now present the **whole root** (everything except `.mneme/`); the index set is a separate, narrower walk.

### 4. Reject `.mneme/` addresses (defense-in-depth)

`walk_all` already hides `.mneme/` from listings, but a tool could still *address*
`{root}/.mneme/...` directly. Block it at the parser so read/write/edit/delete/resource all refuse
it in one place. In [`store/address.rs`](../../../mneme/src/store/address.rs) `WikiAddress::parse`,
after the `..`/`.` traversal check (line ~39):

```rust
// `.mneme/` is Mneme's own derived index — not addressable wiki content.
if rest.split('/').next() == Some(".mneme") {
    return Err(MnemeError::InvalidAddress(
        s.to_string(),
        ".mneme is reserved for the index",
    ));
}
```

(Index management — `wiki_index_delete` — operates on `.mneme/` via direct `std::fs`
([`mcp/mod.rs:730`](../../../mneme/src/mcp/mod.rs)), **not** through `WikiAddress`, so it is
unaffected. The `mneme://guide` / `mneme://status` synthetic resources are special-cased before
the address strip in `read_resource` and are likewise unaffected.)

### 5. Keep the write path from indexing non-indexable files

`write_doc`/`edit_doc` ([`mcp/mod.rs:189-215`](../../../mneme/src/mcp/mod.rs)) call `index_file`
**unconditionally** today. After this change a `wiki_write` of `foo.html` would index it, and the
next reconcile (which uses `walk_root` → `.md` only) would immediately delete that index row —
churn + a transient inconsistency. Guard it:

```rust
// in write_doc / edit_doc, replacing the bare `index_file(&st, &wa, &abs)`:
let indexable = {
    let store = st.store.read().unwrap();
    store
        .registry()
        .get(&wa.root)
        .map(|r| crate::store::is_indexable(r, &wa.rest))
        .transpose()?
        .unwrap_or(false)
};
if indexable {
    index_file(&st, &wa, &abs)?;
}
Ok(())
```

`delete_doc` already calls `delete_document` — keep it (it is a harmless no-op when the row is
absent, which is now the common case for non-md files; confirm `IndexDb::delete_document` tolerates
a missing rel — it does, it's a `DELETE ... WHERE path = ?`).

### 6. grep: skip binary files

`grep` now sees every file, including binaries. Match ripgrep behaviour and skip files that look
binary (a NUL byte in the head) so a root with PNGs doesn't emit garbage matches or scan large
blobs. In [`store/mod.rs`](../../../mneme/src/store/mod.rs), add a helper and use it in all three
grep arms (replace each `read_lossy(&abs)?` read with a skip-aware read):

```rust
/// Read a file as text, returning `None` if it looks binary (a NUL byte in the first 8 KiB —
/// the same cheap heuristic ripgrep uses). Keeps `grep` from scanning images/PDFs.
fn read_text_or_skip(p: &Path) -> Result<Option<String>> {
    let bytes = std::fs::read(p)?;
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}
```

Each grep arm becomes `if let Some(text) = read_text_or_skip(&abs)? { ... }` (skip the file
otherwise). `list`/`glob`/`tree` still list binaries — only `grep` skips them for *content* scans.

### 7. Tool descriptions, instructions, and the guide

Make the surface honest about the new semantics:

- **`wiki_glob`** ([`server.rs:96`](../../../mneme/src/mcp/server.rs)): "Find **files** by path/name glob against the full `{root}/{path}` — lists **everything** in the root (markdown and non-markdown alike), like a filesystem; only `.mneme/` is hidden."
- **`wiki_grep`** ([`server.rs:101`](../../../mneme/src/mcp/server.rs)): "…over the root's **text files** (binary files are skipped); not FTS." (drop "indexed files")
- **`wiki_tree`** ([`server.rs:111`](../../../mneme/src/mcp/server.rs)) / **`wiki_read`** ([`server.rs:73`](../../../mneme/src/mcp/server.rs)): note they cover any file / any text file, not just `.md`.
- **`wiki_root_config`** ([`server.rs:142`](../../../mneme/src/mcp/server.rs)): clarify `include`/`ignore` are **indexing filters only** — they decide what `wiki_search`/FTS index, **not** what the file tools list or read. Keep the existing default-`["*.md"]` note.
- **`GlobParams`/`GrepParams`** doc comments in [`params.rs`](../../../mneme/src/mcp/params.rs): "indexed files" → "files in the root".
- **`INSTRUCTIONS`** ([`server.rs:29`](../../../mneme/src/mcp/server.rs)) + the **MCP server instruction string** + [`mneme/assets/wiki-guide.md`](../../../mneme/assets/wiki-guide.md): add one sentence — *"The file tools (read/write/edit/glob/grep/tree) see the entire root like a filesystem (only `.mneme/` is hidden); `include`/`ignore` configure indexing/search only, not file visibility."*
- **`mneme/README.md`**: update the MCP-surface paragraph (currently "indexes a tree of markdown documents") to note the file tools span the whole root while indexing stays markdown-by-default.

### 8. Tests

- **`walk.rs` inline `#[cfg(test)]`**: `walk_all` over a temp root containing `a.md`, `b.html`, `sub/c.png`, `.gitignore` (ignoring `b.html`), `node_modules/d.md`, and a `.mneme/x.db` → returns `a.md`, `b.html`, `sub/c.png`, `.gitignore`, `node_modules/d.md` but **not** `.mneme/x.db`. `walk_root` over the same root (default include) → only `a.md` + `node_modules/d.md` (its current behaviour) — assert the two sets differ.
- **`tests/document_store.rs`**: `glob("root/**/*")` / `list` returns the non-md files; `read` of `b.html` returns its text.
- **`tests/document_store.rs`**: `WikiAddress::parse("root/.mneme/index.db")` is an error; `glob` never yields a `.mneme/` path.
- **`tests/indexer.rs`**: after `reconcile_root` on the mixed root, `doc_count()` counts only the `.md` files (index set unchanged).
- **`tests/mcp.rs`** (or document_store): `write_doc` of a `foo.html` does **not** create an index row (not indexable); `write_doc` of a `foo.md` does.

## Concerns / decisions

1. **`.git` / `node_modules` are now listed.** Per the user's explicit decision, `.mneme/` is the
   **only** exclusion — the file tools mirror the real filesystem, so git-ignored files, `.git/`,
   and `node_modules/` are all visible. **Tradeoff:** a root placed inside a project directory will
   list large trees through `wiki_glob`/`wiki_tree`. The **indexer is unaffected** — it still uses
   `walk_root` (ignore + include), so search/embeddings never slurp those. If listing noise becomes
   a problem, a *separate* listing-ignore (distinct from the indexing `ignore`) can be added later —
   **out of scope here** by decision.
2. **Symlinks:** `walk_all` sets `follow_links(false)`, and `WikiAddress::resolve` still
   canonicalizes + asserts containment, so neither listing nor reading can escape the root.
3. **`include` semantics change.** `include` no longer hides files from the tools — only from the
   index. Mneme is pre-release (US-665 is the first release), so this is a clean change; no
   migration. `wiki_root_config` (US-668) keeps the same field, re-documented as indexing-only.
4. **No new index churn:** step 5 ensures `wiki_write` of a non-indexable file doesn't create a row
   the next reconcile deletes.

## Acceptance criteria

- [ ] `wiki_glob` / `wiki_list` / `wiki_tree` over a mixed-type root return **all** files (md + non-md), excluding only `.mneme/`.
- [ ] `wiki_read` returns text for a non-markdown text file (`.html`/`.csv`/`.json`).
- [ ] The semantic index is unchanged: `reconcile_root` on the mixed root indexes only the `.md` files; `wiki_search`/`doc_count` behaviour matches today.
- [ ] `{root}/.mneme/...` is not listed and is rejected when addressed directly.
- [ ] `wiki_grep` skips binary files (no garbage matches from a `.png`).
- [ ] `wiki_write` of a non-`.md` text file succeeds and is listable, but creates no index row.
- [ ] `cargo build --release` and `cargo test` pass.

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/src/store/walk.rs` | Add `walk_all`, `include_matcher`, `is_indexable`; refactor `walk_root` to reuse `include_matcher`; inline tests |
| `mneme/src/store/mod.rs` | `collect` → `walk_all`; re-exports; `read_text_or_skip` + grep binary-skip; module doc |
| `mneme/src/store/address.rs` | Reject `.mneme/` as the first path segment in `WikiAddress::parse` |
| `mneme/src/mcp/mod.rs` | `write_doc`/`edit_doc` guard `index_file` on `is_indexable` |
| `mneme/src/mcp/server.rs` | Tool descriptions (glob/grep/tree/read/root_config), `INSTRUCTIONS` |
| `mneme/src/mcp/params.rs` | `GlobParams`/`GrepParams` doc comments |
| `mneme/assets/wiki-guide.md` | File-tools-see-the-whole-root note |
| `mneme/README.md` | MCP-surface paragraph |
| `mneme/tests/{document_store,indexer,mcp}.rs` | New tests |

### Files that need NO changes

- `mneme/src/indexer/mod.rs` — keeps `walk_root` (index set); add a one-line clarifying comment only.
- `mneme/src/store/glob.rs`, `grep.rs`, `edit.rs`, `roots.rs` — unchanged.
- `read_resource_body` / `read_bytes` — binary resources already work (US-687 relies on this as-is).
