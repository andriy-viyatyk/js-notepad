# EPIC-031: Git Functionality Enhancements (incremental)

## Status

**Status:** Active
**Created:** 2026-06-08

## Overview

Grow Persephone's Git support from the read-only v1 (shipped under [EPIC-030](EPIC-030.md)) into **fully functional day-to-day git tooling** — viewing staged/unstaged changes, browsing and switching branches, creating and merging branches, creating tags, and the rest of the everyday git workflow.

**This epic is deliberately open-ended and incremental.** Unlike most Persephone epics, it does **not** describe the full target functionality up front, nor resolve all concerns before carving tasks. Instead it is a **rolling home** for small, user-driven enhancements: the user describes one small piece of functionality, we create a task (or a few tasks) for just that piece, implement it, and the user tests it — then the user describes the next piece, and so on. The epic accumulates these increments over time.

## How this epic works

1. **The user describes one small enhancement** to the existing git functionality.
2. **We create a task — or a few tasks if the piece is larger** — following the normal task-creation workflow (deep investigation → task doc → dashboard entry). For small, well-scoped pieces a lightweight task entry on the dashboard may be enough; larger pieces get a full task folder + README.
3. **We implement it**, leaving Persephone compiling and runnable at each step, behind the existing **"Git integration"** setting (off by default).
4. **The user tests it.** Bugs/adjustments are folded into the same task before it's marked done.
5. **Each task is completed normally — with `/review`, `/document`, and `/userdoc` run per task** (NOT the deferred epic-level review model). When the user says "complete this task": verify acceptance criteria → run `/review` → `/document` → `/userdoc` → mark the task `[x]` on the dashboard. Tasks stay listed under this epic (they do not move to `completed.md` individually); the whole block moves to [`/doc/epics/completed.md`](completed.md) when the epic itself closes.
6. **Repeat** — the user describes the next enhancement.

> **Completion model (decided 2026-06-09):** this epic uses **per-task** review + docs, not the deferred epic-level pass other epics use. Because increments are independent and land one at a time with their own user-test cycle, each gets its own `/review` + `/document` + `/userdoc` at completion.

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

## Notes

### 2026-06-08 — epic created (incremental model)
- Created as a rolling, incremental home for git enhancements beyond the read-only v1 (EPIC-030). Deliberately **no** up-front full-functionality design or locked scope — the user describes one small enhancement at a time; we create task(s) for just that piece, implement, the user tests, repeat.
- North-star goals recorded (status, branches, checkout, create/merge branches, tags, …) as a loose direction, not a commitment.
- Documented the v1 infrastructure to build on (`git-service.ts`, `git-ipc.ts`, renderer `git.ts`, host detection, Git Tree component/editor, File Diff editor) and the carried-over conventions (git-only-in-main, off-by-default setting, graceful degradation). Flagged that this epic introduces the first **mutating** git operations.
- Added to the dashboard under **Active**. Awaiting the user's first enhancement description.
