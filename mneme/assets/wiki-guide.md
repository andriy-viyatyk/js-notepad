# Mneme — agent guide

Mneme is a personal **knowledge base** built on a tree of markdown documents. A root may be a
wiki, notes, worklog, or any markdown folder. The **files on disk are the source of truth**; the
search index is derived and rebuildable. You interact with it through the MCP tools and
`mneme://` resources.

> **Search modes.** `search` supports `text` (full-text / FTS), `vector` (semantic KNN), and
> `hybrid` (FTS + vector fused with Reciprocal Rank Fusion) — **`hybrid` is the default**.
> `vector`/`hybrid` need the embedding model: until it is provisioned (`model_update`) they
> automatically fall back to text results with a `note`. Everything else (read/write/edit,
> filters, tree, timeline, tags, root management) always works.

## Addressing

Every document address is `{root}/{path-within-root}` — the same form as the resource URI
`mneme://{root}/{path}`. `root` is a registered root **name** (unique). Examples:
`work/postgres/indexing.md`, `personal/log/2026/2026-06-13.md`.

The file tools (`read`/`write`/`edit`/`glob`/`grep`/`tree`) see the **entire root like a
filesystem** — every file, markdown or not (`.html`/`.png`/`.pdf`/…) — with only `.mneme/` (the
derived index) hidden. The per-root `include`/`ignore` config governs **indexing/search only**
(what `search` and FTS cover), not what the file tools list or read.

- **Path tools** (`read`/`write`/`edit`/`delete`) take the full `{root}/{path}`.
- **Scope-able tools** (`search`/`tree`/`timeline`/`tags`/`reindex`) take a `{root}` or
  `{root}/sub` prefix to scope — always provide the root (e.g. `personal` or
  `personal/contacts`); use `list_roots` if you don't know it.

## Documents & frontmatter

Documents are markdown with optional YAML frontmatter at the top (all fields optional):

```yaml
---
title:    My Document        # fallback: first H1, else filename
tags:     [work, postgres]   # default: []
created:  2026-01-15         # fallback: file birthtime
verified: 2026-06-13         # "valid / verified as of" freshness date
---
```

`write` takes the **whole file** (frontmatter included as text). `edit` does exact
string replacement for surgical changes. Daily logs live at `log/YYYY/YYYY-MM-DD.md` and carry a
`log` tag — they feed `timeline`.

## Tools

**File-like** (mirror your local file tools):
- `read { path, offset?, limit? }` — UTF-8 text → content + parsed frontmatter; **images
  (png/jpg/gif/webp) → a viewable picture** (you see it, like `Read`); other binary (pdf/zip/…) →
  a short "not displayable" notice (read those through the UI, not as text).
- `write { path, content }` — write the whole file; indexed synchronously. **Text/markdown
  only** — for binary use `upload`.
- `upload { path, contentBase64 }` — create/overwrite a **binary** file (image/PDF/diagram)
  from base64. Stored and listable (`glob`) but **not** indexed/searched.
- `edit { path, old_string, new_string, replace_all? }` — exact replacement.
- `delete { path }` — delete a file, **or a folder and everything under it** (recursive, like `rm -r`).
- `mkdir { path }` — create an empty folder (≈ `mkdir -p`). You don't need it before `write`/`upload`
  (those create parent folders); use it to make an empty folder up front.
- `rename { from, to }` — move/rename a file **or folder** within a root (atomic; also handles
  extension changes). Refuses to overwrite an existing destination.
- `glob { pattern, path? }` — find by path/name across **all** files in the root
  (`work/**/*`), markdown or not; only `.mneme/` is hidden.
- `grep { pattern, path?, -i?, -n?, context?, output_mode?, tags?, dateRange? }` — literal/regex
  content scan over the root's **text** files (binary files are skipped). `tags`/`dateRange`
  restrict to matching `.md` documents (frontmatter only); `-n` toggles line numbers in `content`
  output (default on).

**Search & views**:
- `search { query, mode?, subtree?, tags?, excludeTags?, dateRange?, topK? }` — ranked
  search → `{ uri, title, tags, snippet, score }` (one per document, **returned best-first**;
  `score` is a mode-dependent ranking scalar — rely on the order, not the number). `mode` is
  `text` | `vector` | `hybrid` and **defaults to `hybrid`**; `vector`/`hybrid` need the embedding
  model and fall back to text (with a note) until it is provisioned (`model_update`).
- `tree { path?, depth? }` — flat depth-first `{ uri, name, isDir, depth }` (`depth` = absolute slash
  count); lists real directories, **including empty ones**. The `depth` arg limits levels below `path`
  (`1` = path node + immediate children; omit = whole subtree).
- `timeline { tags?, from?, to?, subtree? }` — daily-log feed, newest first.
- `tags { subtree? }` — distinct tags + counts.

**Management**:
- `add_root { folder, name? }`, `remove_root { root }` (also deletes the root's `.mneme` index folder — rebuilt on re-add), `list_roots {}`.
- `root_config { root, include?, ignore? }` — read (omit both) or live-update a root's
  include/ignore globs; a SET re-applies filters, restarts the watcher, reindexes the root, and
  persists to the config.
- `reindex { path? }` — synchronous reconcile; returns per-root stats.
- `status {}` — roots, index inventory, model, document counts.
- `index_delete { root, modelId, schemaVer }` — remove a stale versioned index DB.
- `model_update { model? }` — deferred in this build (no embeddings).

## Resources

Read any document or binary attachment by URI via `resources/read`:
`mneme://{root}/{path}` (text for markdown/UTF-8, base64 blob for binary). This guide is at
`mneme://guide`. A JSON snapshot of `status` is at `mneme://status`.
