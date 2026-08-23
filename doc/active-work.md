# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-058** — [De-React Epic D — Shell and shared components](epics/EPIC-058.md) — active; task documents are
  written one at a time, in the order below
  - [ ] [US-1025: Icon DOM builders](tasks/US-1025-icon-dom-builders/README.md) — 54 language icon bodies + `BoardGlyph`; `react-dom/server` out
  - [ ] [US-1026: `components/icons/` vanilla DOM views](tasks/US-1026-components-icons-vanilla-views/README.md)
  - [ ] [US-1027: `components/file-list/` + `components/file-grid/`](tasks/US-1027-file-list-grid/README.md)
  - [ ] [US-1028: `components/file-search/` (first `RenderGrid` collection)](tasks/US-1028-file-search/README.md)
  - [ ] [US-1029: Tree primitive seams for tree-provider](tasks/US-1029-tree-provider/README.md)
  - [ ] [US-1037: `TreeProviderView`](tasks/US-1037-tree-provider-view/README.md)
  - [ ] [US-1038: `CategoryView`](tasks/US-1038-category-view/README.md)
  - [ ] [US-1030: `components/git-tree/` vanilla GitTree view](tasks/US-1030-git-tree-vanilla/README.md)
  - [ ] [US-1031: `components/page-manager/` portal hosts → `appendChild`](tasks/US-1031-page-manager-append-child/README.md)
  - [ ] [US-1032: `ui/dialogs/` host, 13 dialogs, and the popper path](tasks/US-1032-dialogs-vanilla/README.md)
  - [ ] [US-1033: `ui/secondary-views/` host and the registry contract](tasks/US-1033-secondary-views-vanilla/README.md)
  - [ ] [US-1034: `ui/sidebar/` and `MenuBar`](tasks/US-1034-sidebar-menubar/README.md)
  - [ ] [US-1035: `ui/tabs/`](tasks/US-1035-tabs-vanilla/README.md)
  - [ ] [US-1036: `ui/app/` and the root flip](tasks/US-1036-app-root-flip/README.md)

- *(no epic)*
  - [ ] US-1040: Cap menu popover height — `maxHeight` was inert because Popover's size middleware overwrote it
  - [ ] [US-1039: Tree search clear does not restore expansion after a zero-match search](tasks/US-1039-tree-search-clear-restore/README.md)

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Epics are created from it one at a time. Epic C is split four ways: **C1 is
  complete as EPIC-054**, **C2 is complete as [EPIC-055](epics/EPIC-055.md)**, **C3 is complete as
  [EPIC-056](epics/EPIC-056.md)**, and **C4 is complete as [EPIC-057](epics/EPIC-057.md)** — the last
  epic in Epic C. **Epic D is active as [EPIC-058](epics/EPIC-058.md)**.

*(other recorded epic ideas live in [`tasks/backlog.md`](tasks/backlog.md))*

---

## How This Dashboard Works

### Structure

Each section (Active / Planned) lists epics as top-level items and tasks as sub-items:

```
- **EPIC-XXX** — [Title](epics/EPIC-XXX.md)
  - [ ] US-YYY: Task title
  - [x] US-ZZZ: Completed task title
- *(no epic)*
  - [ ] US-AAA: Standalone task
```

### Starting work

1. Move an epic or task from **Planned** to **Active**
2. Mark the task `[ ]` → `[x]` when done

### Completing a standalone task (no epic)

1. Mark task `[x]` in Active section
2. Move it to [`/doc/tasks/completed.md`](tasks/completed.md)
3. Remove from this dashboard

### Completing an epic

1. All tasks under the epic should be `[x]`
2. Move the entire epic block (with tasks) to [`/doc/epics/completed.md`](epics/completed.md)
3. Remove from this dashboard

### Creating new work

- **New epic:** Add to Planned with link to its doc in `/doc/epics/` — but only when it is
  genuinely next up. An epic that is a recorded idea rather than scheduled work belongs in
  [`/doc/tasks/backlog.md`](tasks/backlog.md) under "Recorded Epics", with its doc's
  **Status** set to `Backlog`. Move it here when work is about to start.
- **New task (with epic):** Add as sub-item under the epic
- **New task (standalone):** Add under `*(no epic)*`

### Task ID Format

`US-XXX` — sequential number. `EPIC-XXX` — sequential number.
