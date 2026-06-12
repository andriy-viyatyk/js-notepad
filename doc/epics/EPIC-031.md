# EPIC-031: Git Functionality Enhancements (incremental)

## Status

**Status:** Active
**Created:** 2026-06-08

## Overview

Grow Persephone's Git support from the read-only v1 (shipped under [EPIC-030](EPIC-030.md)) into **fully functional day-to-day git tooling** — viewing staged/unstaged changes, browsing and switching branches, creating and merging branches, creating tags, and the rest of the everyday git workflow.

**This epic is deliberately open-ended and incremental.** Unlike most Persephone epics, it does **not** describe the full target functionality up front, nor resolve all concerns before carving tasks. Instead it is a **rolling home** for small, user-driven enhancements: the user describes one small piece of functionality, we create a task (or a few tasks) for just that piece, implement it, and the user tests it — then the user describes the next piece, and so on. The epic accumulates these increments over time.

## How this epic works

1. **The user describes one small enhancement** to the existing git functionality.
2. **Where does it go? (decided 2026-06-10 — STRICT)**
   - **Small, well-scoped tweak** (a handful of lines, one or two files, no design open questions) → do **NOT** mint a new `US-XXX` ID or dashboard row. Append a **log entry** to the single rolling task **[US-625: Git small enhancements](../tasks/US-625-git-small-enhancements/README.md)** instead. This keeps the dashboard and the task table below from filling up with one-line tweaks.
   - **Larger piece** (multiple files, real design decisions, needs investigation) → still gets its own `US-XXX` task folder + README + dashboard row, via the normal task-creation workflow (deep investigation → task doc → dashboard entry).
3. **We implement it**, leaving Persephone compiling and runnable at each step, behind the existing **"Git integration"** setting (off by default).
4. **The user tests it.** Bugs/adjustments are folded in before the entry/task is marked done.
5. **Completion + review:**
   - **Rolling-log entries (US-625):** review is **batched**. When the user says "complete these" (or at epic close), run `/review` + `/document` + `/userdoc` over the unreviewed log entries together, then mark them ✅ in the log. US-625 stays open and keeps accumulating until the epic closes.
   - **Standalone `US-XXX` tasks:** completed normally with `/review` + `/document` + `/userdoc` run **per task** (NOT the deferred epic-level model). Verify acceptance criteria → run the three skills → mark `[x]` on the dashboard. They stay listed under this epic (do not move to `completed.md` individually); the whole block moves to [`/doc/epics/completed.md`](completed.md) when the epic closes.
6. **Repeat** — the user describes the next enhancement.

> **Completion model (decided 2026-06-09):** this epic uses **per-task** review + docs, not the deferred epic-level pass other epics use. Because increments are independent and land with their own user-test cycle, each task (or each batch of rolling-log entries) gets its own `/review` + `/document` + `/userdoc` at completion.
>
> **Single rolling task for small tweaks (decided 2026-06-10):** small one-off enhancements are logged in **[US-625](../tasks/US-625-git-small-enhancements/README.md)** as table rows, not as separate `US-XXX` IDs. Only larger, multi-file/design-bearing pieces get their own task ID. **Next agent: follow this — don't create a new task per small git tweak.**

There is **no master plan or locked scope** here. Each increment is decided when its concrete need is described. The Goals list below is a loose north star, not a commitment to a particular design or ordering.

## Goals (north star — not a locked scope)

Make working with git inside Persephone fully functional. Likely areas, to be tackled incrementally as the user requests them:

- See **staged / unstaged** changes (working-tree status).
- See the **list of branches** (local, and possibly remote).
- **Switch** between branches (checkout).
- **Create** and **merge** branches.
- **Create tags**.
- Stage / unstage / commit; and other everyday operations as they come up.

(This list will evolve. Items are added or refined as the user describes them; nothing here is promised in a specific form.)

## Acceptance Criteria (must-not-miss follow-ups)

Recorded so they are **not missed**. These are deferred enhancements that depend on other
increments landing first; implement each once its prerequisite is in place. Check off when done.

- [x] **"Commit and Push" button in the Commit dialog** — done in US-641. The dialog takes a
  `buttons` array, so `["Commit", "Commit & Push", "Cancel"]` was additive; the push button
  relabels to "& Push" when a new branch is being created, and commits-then-pushes (the commit
  is preserved if the push is rejected).
- [x] **Create-a-branch from the Commit dialog** — done in US-638. The Commit dialog's branch
  field is editable + required; editing it creates + checks out a new branch (`git switch -c`)
  and commits onto it. Branches can also be created from the commit-graph row context menu
  ("Create branch here…").

## Background — existing git infrastructure to build on

v1 (EPIC-030, completed 2026-06-07) already established the foundation every increment in this epic extends. Reuse these rather than re-inventing:

| Layer | File | Role |
|-------|------|------|
| Main service | `src/main/git-service.ts` | `simple-git` (CLI wrapper) in the main process; registers `ipcMain` handlers. **New git operations are added here.** |
| IPC contract | `src/ipc/git-ipc.ts` | Channel names + request/response/stream types shared by main & renderer. |
| Renderer API | `src/renderer/api/git.ts` | Thin renderer-side wrapper the editors/host call; owns the directory-keyed detection cache. |
| Host detection | `TextFileModel.state.gitRepo` | Host-centric git membership (`rev-parse --show-toplevel`, dir-cached); drives the File Diff switch. |
| Git Tree component | `src/renderer/components/git-tree/GitTree.tsx` (+ `GitTreeModel.ts`, `BranchTreeCell.tsx`, `swimlane-layout.ts`) | Reusable `AVGrid` + SVG branch/commit graph. |
| Git Tree editor | `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | Full-tab editor; mounts the Git Tree component. Opened from the `.git` Explorer node. |
| File Diff editor | `src/renderer/editors/file-diff/FileDiffEditor.ts` | Monaco-diff editor surfaced via the editor switch widget. |
| Enablement | "Git integration" setting (`settings.ts` + Settings page) | **Off by default.** Gates ALL git behavior. Every new increment stays behind it and degrades gracefully when git is unavailable. |

**Conventions carried over from v1:**
- Git access is **always** via `git-service.ts` (simple-git) in main, over typed IPC — never spawn git from the renderer.
- Everything stays behind the off-by-default "Git integration" setting; runtime git failures degrade gracefully (no thrown errors at the user).
- v1 was strictly read-only. **This epic introduces mutating operations** — each write operation is its own increment, designed when requested (confirmation UX, refresh-after-mutation, and conflict handling decided per increment).

## Linked Tasks

Tasks are added here **incrementally** as the user describes each enhancement. No tasks are pre-carved.

| ID | Title | Status |
|----|-------|--------|
| [US-616](../tasks/US-616-git-changes-panel/README.md) | Git Tree "Changes" secondary view — status backend + two-part display (unstaged/staged), click opens Git Diff | ✅ Done (2026-06-09) |
| [US-617](../tasks/US-617-git-changes-close-lifecycle/README.md) | "Changes" panel — manual "x" close (unmount editor / empty page when main) + per-page navigation-singleton | ✅ Done (2026-06-09) |
| [US-618](../tasks/US-618-git-diff-revisions-panel/README.md) | Git Diff "File History" secondary view + filtered-list datetime column (popovers + panel) + L/R side-select toggles | ✅ Done (2026-06-09) |
| [US-619](../tasks/US-619-multi-panel-secondary-views/README.md) | Allow multiple secondary-view panels of the same type — composite panel keys (sidebar renders all; dedup stays at model level); multiple repos' "Changes" panels; repo name in header | ✅ Done (2026-06-09) |
| US-620 | "Changes" panel — "Show Git Tree" header button (git icon) promotes the surviving Git Tree editor back to the page's main view via the existing `git-tree://` navigation-singleton path | ✅ Done (2026-06-10) |
| US-621 | Git Tree editor toolbar — show the repository name (folder basename via `repoName`, full path on hover) in the toolbar's left `children` slot | ✅ Done (2026-06-10) |
| US-622 | Git Tree grid — generate columns once on first mount; preserve user-dragged widths + column reorder across refresh/load-more; re-fit only the graph (first) column when the branch-lane count (`maxColumns`) shifts. Editor view keeps `<GitTree>` mounted during Refresh (placeholder only on initial load) so column state survives the reload remount | ✅ Done (2026-06-10) |
| US-623 | Git Tree grid — persist column layout (width + order) in the **owner** model: `columnLayout` on `GitTreeEditorState` (round-trips via `getRestoreData` like `repoRoot`). `<GitTree>` gains `initialColumnLayout` (applied once at mount) + `onColumnLayoutChange` (emitted on user resize/reorder only, not programmatic rebuilds). Survives navigation-away/back and app restart | ✅ Done (2026-06-10) |
| [US-624](../tasks/US-624-git-tree-autorefresh/README.md) | Git Tree auto-refresh — recursive `fs.watch` on `repoRoot` (Option A, mirrors Explorer) calling `refresh()` debounced 500ms; `git status` via `GIT_OPTIONAL_LOCKS=0` to break the index-rewrite refresh loop. Always-on under `git.enabled`; `DirectoryWatcher` util in `file-watcher.ts`; lifecycle in `GitTreeEditorModel` | ✅ Done (2026-06-10) |
| [US-625](../tasks/US-625-git-small-enhancements/README.md) | **Rolling log of small git tweaks** — single task; each small enhancement is a row in its log table (no separate `US-XXX` per tweak, per the rule above). Entries so far: from/to popover inline endpoints + left-edge toolbar move; hide Run Script on non-script editors; Changes-panel unique file count | 🔨 Rolling (open) |
| [US-629](../tasks/US-629-git-tree-commit-panel/README.md) | Git Tree editor — resizable bottom panel (Git-Extensions-style) with "Commit"/"Diff" tab strip + persisted height/active-tab; **"Commit" tab** shows the selected commit's author/email, date, full hash, ref badges, and full message (no parent/child — visible in the graph) | ✅ Done (2026-06-10) |
| [US-630](../tasks/US-630-git-tree-commit-diff-tab/README.md) | Git Tree editor — **"Diff" tab**: changed-file list (`commitFiles` backend) + per-file inline Monaco diff (parent→commit via `git.show`); persisted file-list width. Depends on US-629 | ✅ Done (2026-06-10) |
| [US-631](../tasks/US-631-git-stage-unstage/README.md) | "Changes" panel — **stage / unstage / reset** (first mutating ops): arrow buttons + double-click + context menu move files between Unstaged/Staged (`git add` / `git reset`); **Reset** discards changes (`git checkout` / `git clean`) with confirmation; new AVGrid-based **`FileGrid`** (range select + sorting + range-copy) replaces `FileList` in the panel | ✅ Done (2026-06-10) |
| [US-632](../tasks/US-632-git-commit/README.md) | "Changes" panel — **Commit** staged files: "Commit" button under the Staged grid opens a **Commit dialog** (multi-line message + current branch + editable author Name/Email prepopulated from git config, applied as a per-commit override — no config write) that runs `git commit` of the staged index (`GitMutationResult` reused; `gitCommit`/`gitIdentity` IPC; `GitStatusResult.branch`). Push + branch-create postponed to dedicated tasks | ✅ Done (2026-06-11) |
| [US-641](../tasks/US-641-git-push/README.md) | **Git Push** — push the current branch to its remote (set-upstream `-u` on first push of a new branch) + "Commit and Push" from the Commit dialog; carries the **shared foundation** Pull reuses: `fetch` (all remotes), current-branch **ahead/behind** badge, the **`GIT_TERMINAL_PROMPT=0`** fail-fast auth strategy (OS/SSH creds only — no credential dialog), and busy+toast progress. Never force-pushes; rejected push → "fetch/pull first" message. Toolbar regrouped: left cluster (`Repo:` + name badge + ↑/↓ + Fetch + Push + divider), Refresh on the right; new `UploadIcon` | ✅ Done (2026-06-12) |
| [US-642](../tasks/US-642-git-pull/README.md) | **Git Pull** — Git Extensions-style **split-button** (Pull-merge primary + "Fetch all" dropdown) that replaces the standalone Fetch button; new UIKit **`SplitButton`** primitive (composes `IconButton` + `WithMenu`); conflict-state reporting in the Changes panel; reuses the US-641 foundation. **Depends on US-641** | ✅ Done (2026-06-12) |

## Notes

### 2026-06-08 — epic created (incremental model)
- Created as a rolling, incremental home for git enhancements beyond the read-only v1 (EPIC-030). Deliberately **no** up-front full-functionality design or locked scope — the user describes one small enhancement at a time; we create task(s) for just that piece, implement, the user tests, repeat.
- North-star goals recorded (status, branches, checkout, create/merge branches, tags, …) as a loose direction, not a commitment.
- Documented the v1 infrastructure to build on (`git-service.ts`, `git-ipc.ts`, renderer `git.ts`, host detection, Git Tree component/editor, File Diff editor) and the carried-over conventions (git-only-in-main, off-by-default setting, graceful degradation). Flagged that this epic introduces the first **mutating** git operations.
- Added to the dashboard under **Active**. Awaiting the user's first enhancement description.
