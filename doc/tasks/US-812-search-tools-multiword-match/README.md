# US-812: `search_tools` discoverability — tokenize multi-word queries + index toolset-level keywords

**Status:** Planned
**Type:** Bug / UX improvement (Agent Tools registry)
**Created:** 2026-07-08 (second finding folded in same day)

## Problem

Two independent gaps in `search_tools` make registered tools undiscoverable by natural queries.
Both undercut the whole discovery flow — an agent that searches gets zero results and may wrongly
conclude no tool exists.

1. **Multi-word queries are not tokenized** — a phrase whose every word appears in the tool's
   metadata still returns 0 matches.
2. **Toolset-level `keywords` are not in the search corpus** — only per-tool `keywords` (plus
   id/description) match; the manifest's top-level `keywords` array is ignored.

### Observed (2026-07-08) — finding 1: multi-word

A registered tool `warehouse-databricks/query` with:
- toolset name `warehouse-databricks`
- description containing "…read-only **SQL**… data **warehouse** (Azure **Databricks**)… **customer**…"
- keywords `["warehouse","databricks","sql","unity catalog","customer search",…]`

Search results:
| Query | Result |
|---|---|
| `"warehouse databricks sql customer"` | **0 matches** ❌ |
| `"databricks"` (single word) | 1 match ✅ |
| `select:warehouse-databricks/query` (exact id) | 1 match ✅ |

So single-keyword and exact-id lookups work; a multi-word phrase returns nothing — even though
all four words individually appear in the tool's id/description/keywords.

### Observed (2026-07-08) — finding 2: toolset-level keywords ignored

A registered toolset `azure-devops` with **toolset-level** `keywords: ["azure devops", "ado",
"work item", …]` and two tools whose **per-tool** `keywords` initially did not include `ado`:

| Query | Matches | Term location |
|---|---|---|
| `"ado"` | **0** ❌ | toolset-level `keywords` only |
| `"backlog"` | 1 ✅ | per-tool `keywords` |
| `"devops"` | 2 ✅ | toolset name (id substring) |

Workaround applied: duplicated the important terms into each tool's per-tool `keywords`. That
works but defeats the purpose of the manifest's toolset-level `keywords` field — either index it
or remove it from the manifest schema/docs.

## Likely cause

**Finding 1:** the keyword matcher appears to treat the whole query as a **single contiguous
substring** (or requires the full phrase to appear verbatim) rather than **tokenizing** the query
into terms and matching per term. `"warehouse databricks sql customer"` is not a substring of any
field, so it fails, while `"databricks"` is.

Relevant behavior is documented in the tools guide (`read_guide("tools")`):
> "anything else → case-insensitive substring match over id + description + keywords, capped by `maxResults`."

The single-substring semantics is the root of the miss.

**Finding 2:** the searchable text per tool is built from the tool's own fields only (id,
description, per-tool `keywords`); the manifest's **toolset-level** `description`/`keywords` are
not folded in. (`"devops"` matched only because the toolset name is part of the tool id.)

## Proposed change

Make `search_tools` **tokenize** the free-text query on whitespace and rank tools by how many
terms match across the **full searchable corpus** (OR semantics, ranked by match count /
coverage), instead of requiring one contiguous substring. Suggested:

- **Corpus per tool** = tool `id` + tool `description` + per-tool `keywords` **+ the parent
  toolset's `name`, `description`, and `keywords`** (fixes finding 2).
- Split query into terms; each term is a case-insensitive substring test against the corpus.
- Score = number of distinct terms matched (optionally weight id/keywords over description).
- Return tools with ≥1 term match, sorted by score desc, capped by `maxResults`.
- Keep `select:<toolset>/<tool>` (exact) and empty-query (list-all) behavior unchanged.

Optional niceties: light fuzzy/prefix matching; ignore very short stop-tokens.

## Acceptance criteria

- [ ] `search_tools "warehouse databricks sql customer"` returns `warehouse-databricks/query`
      (and any other relevant tools), ranked by term-match count.
- [ ] A term present **only in the toolset-level `keywords`** (e.g. `"ado"` before the
      workaround) matches all tools of that toolset.
- [ ] Single-keyword and `select:` exact-id lookups still work as today.
- [ ] Empty/omitted query still lists all tools.
- [ ] Update the tools guide (`read_guide("tools")`) wording from "substring match" to
      "tokenized term match over tool + toolset metadata".

## Provenance

Finding 1 surfaced while building a Databricks SQL query tool for an external data-warehouse
project. Finding 2 surfaced the same day while building the `azure-devops` toolset
(get_task/query_tasks) and verifying its discoverability. Both reported per the standing
"report Persephone limitations" request; task created and finding 2 folded in with user
approval 2026-07-08.
