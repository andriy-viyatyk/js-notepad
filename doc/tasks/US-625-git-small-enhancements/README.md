# US-625: Git small enhancements (rolling log)

**Epic:** [EPIC-031](../../epics/EPIC-031.md) · **Status:** 🔨 Rolling — open-ended

## Goal

A **single, rolling home** for the stream of small, one-off git-tooling tweaks the
user requests during EPIC-031 — toolbar nudges, header labels, visibility gates,
small UX fixes, etc. Rather than minting a new `US-XXX` ID + dashboard row for each
tiny change (which bloats the dashboard and the epic's task table), every small
enhancement is appended as a **log entry** in the table below.

> **When does work go here vs. its own task?**
> - **Small, well-scoped tweak** (a handful of lines, one or two files, no design
>   open questions) → add a log entry here. No new ID, no new dashboard row.
> - **Larger piece** (multiple files, real design decisions, needs investigation)
>   → still gets its own `US-XXX` task folder + README + dashboard row, per the
>   normal workflow. This rolling task does not replace that.

## How this task works

1. User describes a small enhancement.
2. Implement it, leave the app compiling (`tsc --noEmit` clean), behind the
   existing "Git integration" setting where relevant.
3. **Append a row to the log** below — date, description, files touched, status.
   Use the next `#` (this is just a log index, NOT a `US-XXX` ID).
4. User tests it; mark the row's status accordingly.
5. **Completion is batched.** When the user says "complete these" (or completes
   the epic), run `/review` + `/document` + `/userdoc` over the unreviewed log
   entries together, then mark them ✅. The rolling task itself stays open and
   keeps accumulating entries until the epic closes.

## Enhancement log

| # | Date | Enhancement | Files | Status |
|---|------|-------------|-------|--------|
| 1 | 2026-06-10 | **Git Diff from/to popovers** — combine the **Unstaged**/**Staged** endpoints into the commit grid as inline synthetic leading rows (italic, via `syntheticCommitRow`), matching the "File History" panel (US-618). Dropped the separate endpoint buttons/divider; single-click selects, `selectedHash` highlights the active row. `to` shows Unstaged; both sides show Staged when present. No `GitTree` change. **Also** moved the from/to element to the **left edge** of the toolbar (`toolbarContributions` instead of `rightToolbarContributions`). | `editors/file-diff/RevisionPicker.tsx`, `editors/file-diff/index.tsx`, `editors/file-diff/GitDiffRevisionsSecondaryView.tsx` (comment) | ✅ Done |
| 2 | 2026-06-10 | **Hide the toolbar "Run Script" button** for editors that don't run scripts themselves. `TextChrome`'s `RunButtons` now gates on the editor model exposing its own `runScript` (only the Monaco text editor does) instead of falling back to `host.runScript` — so the Git Diff editor (shares the chrome, host can be a script-language file) no longer shows it. Matches the existing F5-handler gate (button + shortcut now in sync). | `editors/base/TextChrome.tsx` | ✅ Done |
| 3 | 2026-06-10 | **Git Tree "Changes" panel header** — append a unique changed-file count: `[<repo>] Changes (<n>)`. Unions the repo-relative paths of the unstaged + staged lists into a `Set` so a partially-staged file (present in both) is counted once, rather than a naive unstaged+staged sum. | `editors/git-tree/GitChangesSecondaryView.tsx` | ✅ Done |

## Review log

- **2026-06-10** — Entries #1–#3 completed: user-tested, batched `/review` (clean — 0 must-fix; applied 1 suggestion: memoized `RevisionPicker.pick` with `useCallback`), `/document` (secondary-views.md header-count line), `/userdoc` (editors.md + whats-new.md). All three marked ✅.

## Acceptance criteria

Per-entry — each log row is "done" when the user has tested it and it's marked ✅.
The task as a whole is never "complete" on its own; it closes with the epic.
