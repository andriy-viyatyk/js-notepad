# US-824: Upgrade `monaco-editor` (0.52.2 → 0.55.1)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Planned (placeholder — detailed plan pending)

> Placeholder. A full task doc (Goal → Background → Implementation plan → Concerns →
> Acceptance criteria) will be written following the CLAUDE.md "create a task" flow when this
> task is picked up. See [EPIC-040](../../epics/EPIC-040.md) for the upgrade inventory and rationale.

## Scope

Bump `monaco-editor` 0.52.2 → 0.55.1 (or latest at pickup) in lockstep with its ecosystem.

## Risk / notes

- **Core editor** — the highest-blast-radius library after Electron. Touches every Monaco-based
  editor (text, compare/diff, colorized code, config editors).
- Must move in lockstep with:
  - `@monaco-editor/react` (currently 4.7.0)
  - `vite-plugin-monaco-editor` (currently 1.1.0)
- **Existing patch:** `patches/monaco-editor+0.52.2.patch` (via `patch-package`). The patch is
  version-pinned by filename — it must be re-created/re-verified against the new version, or the
  `postinstall` patch step will fail.
- Verify: syntax highlighting, IntelliSense, multi-cursor, compare mode, and the Monaco setup in
  `src/renderer/api/setup/configure-monaco.ts`.
