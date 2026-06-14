# US-674 — Mneme tree editing (create / rename / delete files & folders)

**Status:** Placeholder — not yet investigated. Scope to be detailed before implementation.
**Epic:** EPIC-032 (Mneme), Phase 4. Builds on [US-663](../US-663-mneme-tree-provider/README.md).

## Goal

Add write operations to the read-only Mneme tree panel from US-663: create a new document,
create a folder/category, rename, and delete — for both files and folders — directly in the
`mneme-tree` secondary view.

## Scope (high level — details TBD)

- Make `MnemeTreeProvider` writable: implement the optional `ITreeProvider` write methods
  (`addItem`, `mkdir`, `rename`, `deleteItem`, …) over the Mneme MCP tools (`wiki_write`,
  `wiki_delete`, plus any rename/move tool — **investigate what the sidecar exposes**; a rename
  may need a new server tool).
- Context-menu + inline affordances in `MnemeTreeSecondaryView` (New File / New Folder / Rename /
  Delete), gated on a `writable` flag.
- Live-refresh the tree after mutations (already wired via `resources/list_changed`).
- Confirm destructive ops (delete) per app conventions.

## Open questions (to resolve at investigation)

- Which MCP tools exist for rename/move/mkdir? Mneme may need new server tools (Phase 1-style
  Rust additions) — a folder is implicit in Mneme (derived from document paths), so "create empty
  folder" / "rename folder" semantics need definition.
- Empty-folder representation: Mneme's tree is derived from document addresses, so a folder with no
  documents may not persist. Decide the model.

## Notes

Investigate in detail when work starts; the user may provide additional requirements.
