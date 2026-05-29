# US-587: Post-EPIC-028 doc / type audit

**Status:** Planned
**Type:** Audit (verification → targeted fixes)
**Triggered by:** `/userdoc` skill run during US-586 completion (2026-05-29) flagged 10 inconsistencies between the public type surface (`src/renderer/api/types/*.d.ts`, `assets/editor-types/*.d.ts`, `src/renderer/api/editors.ts`) and the user docs (`docs/api/*.md`, `docs/whats-new.md`).

## Goal

For each flagged item below, decide which side is right (code or doc) by cross-referencing the EPIC-028 implementation and the v4.0.1 `whats-new.md` declaration, then fix the wrong side. **Do NOT blindly trust the `/userdoc` skill's auto-applied changes** — they were reverted as part of US-586 because they were applied without cross-verification.

## Background

EPIC-028 introduced V4 editors with content-host trait and retired the legacy `EditorView` discriminator. The close-out commits (US-583/584/585, `4b8a2b5`) updated some docs but may have missed parts of the public API surface and/or types. `/userdoc` claims to have found stale entries on both sides.

## Punch list — each item is "VERIFY then fix one side"

The right-hand column lists the userdoc-skill's claim. **Treat as a hypothesis, not a fact.**

| # | Surface | Userdoc claim |
|---|---------|---------------|
| 1 | `src/renderer/api/types/common.d.ts` | `EditorView` union type should be removed (v4.0.1 whats-new lists this as a breaking change but the type still exists) |
| 2 | `src/renderer/api/types/page.d.ts` | `editor: EditorView` should become `editor: string` (follows from #1) |
| 3 | `src/renderer/api/types/pages.d.ts` | `addEditorPage(editor: EditorView, …)` should become `editor: string` (follows from #1) |
| 4 | `assets/editor-types/common.d.ts` | Already has `EditorView` removed (per userdoc); confirm `src/renderer/api/types/common.d.ts` is the lagging copy. |
| 5 | `src/renderer/api/types/editors.d.ts` | `IEditorInfo` missing `hasContentHost: boolean` (referenced in `docs/api/editors.md` and `docs/whats-new.md`) |
| 6 | `assets/editor-types/editors.d.ts` | Already has `hasContentHost` (per userdoc); confirm `src/renderer/api/types/editors.d.ts` is lagging. |
| 7 | `src/renderer/api/editors.ts` (`toEditorInfo`) | Should forward `hasContentHost` from internal `EditorDefinition` to public `IEditorInfo`. Validate against #5. |
| 8 | `docs/api/page.md` Properties table | Lists a `type` property that was removed from the public API on this branch. Verify removal. |
| 9 | `docs/api/page.md` `asText()` methods | `getSelectedText()`, `getCursorPosition()`, `insertText()`, `replaceSelection()` documented as sync; userdoc claims they are `Promise`-based. Read `IText` interface to confirm. |
| 10 | `docs/api/page.md` `asX()` headings | All 10 facade headings missing `force?` parameter description; the previous "check `editorMounted` first" guidance is stale. Validate against `PageWrapper.ts`. |
| 11 | `docs/scripting.md` facade lifecycle paragraph | "All facades are auto-released when the script finishes" — userdoc claims ContentViewModel/auto-release was retired in EPIC-028 and facades are now stateless. Verify against `PageWrapper.ts` / EPIC-028 close-out. |

## Method

For each item:

1. Read the **current** code (type def + implementation) and the **current** doc.
2. Cross-reference `docs/whats-new.md` v4.0.1 section + EPIC-028 epic doc (`doc/epics/completed.md` or wherever it landed) for the stated intent.
3. Decide: is the code right, or is the doc right? If they disagree, look at the implementation that the type/doc describes (e.g., `PageWrapper.ts`, `editors.ts`, `IText` interface).
4. Fix the wrong side. **Avoid double-fixing** — if a doc and a type both describe the same thing wrongly in the same direction, decide on the source of truth first.

## Acceptance criteria

- [ ] Each of items 1–11 is checked off with a one-line resolution noting which side was wrong and why.
- [ ] `assets/editor-types/*.d.ts` and `src/renderer/api/types/*.d.ts` are in sync (the two copies should never disagree — investigate the sync mechanism if drift is found again).
- [ ] `docs/api/page.md` reflects actual `IText` / `IGrid` / etc. return types and the current `force?` parameter behavior.
- [ ] `docs/scripting.md` facade lifecycle paragraph is accurate for the post-EPIC-028 stateless-facade design.
- [ ] No new code is written purely to make a doc claim "true" — only fix code if it's genuinely incorrect per EPIC-028 spec.

## Concerns / Open questions

- **Why did `/userdoc` modify code at all?** Userdoc's job is doc updates. It silently editing `src/renderer/api/*` is a skill scoping bug worth a separate report — but out of scope for this audit. Just be aware that any future `/userdoc` run may do the same.
- **Two type copies (`assets/editor-types/` vs `src/renderer/api/types/`):** Userdoc found the `assets/` copies already updated while `src/` lagged. There may be a one-way sync (e.g., a build step copies `src/` → `assets/`) that wasn't run, or someone hand-edited one but not the other. Worth understanding before fixing.

## Out of scope

- Anything not on the punch list. If a separate inconsistency is discovered during the audit, log it here for a follow-up rather than expanding mid-task.
