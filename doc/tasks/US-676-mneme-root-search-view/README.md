# US-676 — Mneme root main view: search with displayed results

**Status:** Placeholder — not yet investigated. Scope to be detailed before implementation.
**Epic:** EPIC-032 (Mneme), Phase 4. Builds on [US-663](../US-663-mneme-tree-provider/README.md).

## Goal

Replace the placeholder "Mneme" main view of the `mneme-root` editor (US-663) with a **search view**:
a query input plus a displayed results list, scoped to the editor's root, opening a result document
via `openRawLink("mneme://{root}/{path}")`.

## Scope (high level — details TBD)

- Build the search UI inside `MnemeRootEditorView` (replacing the placeholder), driven from
  `MnemeRootEditorModel`.
- Query the Mneme MCP `wiki_search` tool (modes: text / vector / hybrid — hybrid default; degrades
  to text until the embedding model is provisioned) scoped to the editor's `rootName` (subtree).
- Render ranked results: title, path, snippet; click → open the document; reflect the result order
  (don't sort by score). Consider tag / date filters (`wiki_grep`/`wiki_timeline`/`wiki_tags`) as
  follow-ups.
- Loading / empty / degraded-mode (text-only) states.

## Open questions (to resolve at investigation)

- Search-as-you-type vs explicit submit; debounce.
- How much of the filter surface (tags, dateRange, mode toggle) to expose now vs later.
- Relationship to the global header indicator / config editor (separate editors; this is per-root).

## Notes

Investigate in detail when work starts; the user plans to provide more requirements for the search UX.
