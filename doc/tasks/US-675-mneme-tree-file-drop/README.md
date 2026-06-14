# US-675 — Mneme tree: drag-and-drop file upload from the OS

**Status:** Placeholder — not yet investigated. Scope to be detailed before implementation.
**Epic:** EPIC-032 (Mneme), Phase 4. Builds on [US-663](../US-663-mneme-tree-provider/README.md)
and [US-674](../US-674-mneme-tree-editing/README.md) (shares the write path).

## Goal

Drag a file from the OS file explorer (or another app) and drop it onto a folder in the Mneme tree
panel → the file is **uploaded into Mneme** under that folder (written via the Mneme MCP write path).

## Scope (high level — details TBD)

- Accept external (OS) file drops on tree folder nodes in `MnemeTreeSecondaryView` — distinct from
  the internal trait-based DnD used by writable providers; this is a native `dataTransfer.files`
  drop.
- Resolve the drop target folder → Mneme address `{root}/{folder}/{filename}`, read the dropped
  file's bytes, and write via the Mneme write path (`wiki_write` / binary attachment — **confirm
  binary support**).
- Handle multiple files, name collisions, and large/binary files (Mneme currently indexes `.md`;
  decide behavior for other types — store-only vs reject).
- Visual drop affordance on the hovered folder; refresh after upload.

## Open questions (to resolve at investigation)

- Does the Mneme sidecar accept binary/non-`.md` attachments via MCP write? If not, this may need a
  server addition (Rust) or be scoped to markdown/text first.
- Conflict policy (overwrite / rename / skip).

## Notes

Investigate in detail when work starts; the user may provide additional requirements.
