# Mneme wiki — agent guide

Mneme is a personal **knowledge base** ("wiki") built on a tree of markdown documents. The
**files on disk are the source of truth**; the search index is derived and rebuildable. You
interact with it through the `wiki_*` MCP tools and `mneme://` resources.

> **This instance runs in TEXT-SEARCH mode.** `wiki_search` is full-text (FTS) only — semantic /
> vector search is not yet enabled. Everything else (read/write/edit, filters, tree, timeline,
> tags, root management) works fully.

## Addressing

Every document address is `{root}/{path-within-root}` — the same form as the resource URI
`mneme://{root}/{path}`. `root` is a registered root **name** (unique). Examples:
`work/postgres/indexing.md`, `personal/log/2026/2026-06-13.md`.

- **Path tools** (`wiki_read`/`wiki_write`/`wiki_edit`/`wiki_delete`) take the full `{root}/{path}`.
- **Scope-able tools** (`wiki_search`/`wiki_tree`/`wiki_timeline`/`wiki_tags`/`wiki_reindex`) take a
  `{root}` or `{root}/sub` prefix to scope — always provide the root (e.g. `personal` or
  `personal/contacts`); use `wiki_list_roots` if you don't know it.

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

`wiki_write` takes the **whole file** (frontmatter included as text). `wiki_edit` does exact
string replacement for surgical changes. Daily logs live at `log/YYYY/YYYY-MM-DD.md` and carry a
`log` tag — they feed `wiki_timeline`.

## Tools

**File-like** (mirror your local file tools):
- `wiki_read { path, offset?, limit? }` — content + parsed frontmatter.
- `wiki_write { path, content }` — write the whole file; indexed synchronously.
- `wiki_edit { path, old_string, new_string, replace_all? }` — exact replacement.
- `wiki_delete { path }`.
- `wiki_glob { pattern, path? }` — find by path/name (`work/**/*.md`).
- `wiki_grep { pattern, path?, -i?, -n?, context?, output_mode?, tags?, dateRange? }` — literal/regex
  content scan. `tags`/`dateRange` restrict to matching `.md` documents (frontmatter only); `-n`
  toggles line numbers in `content` output (default on).

**Search & views**:
- `wiki_search { query, mode?, subtree?, tags?, excludeTags?, dateRange?, topK? }` — ranked text
  search → `{ uri, title, tags, snippet, score }` (one per document; `score` is bm25, lower is
  better). `mode` defaults to `text`; `vector`/`hybrid` return text results with a note here.
- `wiki_tree { path? }` — flat depth-first `{ uri, name, isDir, depth }`.
- `wiki_timeline { tags?, from?, to?, subtree? }` — daily-log feed, newest first.
- `wiki_tags { subtree? }` — distinct tags + counts.

**Management**:
- `wiki_add_root { folder, name? }`, `wiki_remove_root { root }`, `wiki_list_roots {}`.
- `wiki_reindex { path? }` — synchronous reconcile; returns per-root stats.
- `wiki_status {}` — roots, index inventory, model, document counts.
- `wiki_index_delete { root, modelId, schemaVer }` — remove a stale versioned index DB.
- `wiki_model_update { model? }` — deferred in this build (no embeddings).

## Resources

Read any document or binary attachment by URI via `resources/read`:
`mneme://{root}/{path}` (text for markdown/UTF-8, base64 blob for binary). This guide is at
`mneme://guide`. A JSON snapshot of `wiki_status` is at `mneme://status`.
