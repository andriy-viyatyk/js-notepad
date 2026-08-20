# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-055** — [De-React Epic C2 — Floating layer and composites](epics/EPIC-055.md)
  - [x] [US-1005: `Popover` — vanilla floating root on `@floating-ui/dom`, and the Rule 4 React baseline](tasks/US-1005-popover-vanilla-floating-root/README.md)
  - [ ] [US-1006: `Menu` and `WithMenu` — `openMenu` attachment, recursive submenus, and the Rule 4 after-number](tasks/US-1006-menu-vanilla-recursive/README.md)
  - [ ] US-1007: `Dialog` and `DialogContent` — focus trap and backdrop
  - [ ] US-1008: `Notification` — `Notification`, `AlertItem`, `AlertsBar`
  - [ ] US-1009: `Progress` — `ProgressOverlay`, its first story, and `Panel`'s eviction
  - [ ] US-1010: `Toolbar`, `Splitter`, `Breadcrumb`, `CollapsiblePanelStack`
  - [ ] US-1011: `SplitButton`, `TagsInput`, `DateInput`, `CategoryList`
  - [ ] US-1012: `Minimap` and `ImageViewport` — canvas views and their first stories
- *(no epic)*
  - *(no active tasks)*

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Epics are created from it one at a time. Epic C is split four ways: **C1 is
  complete as EPIC-054**, **C2 is active as [EPIC-055](epics/EPIC-055.md)**; C3 (virtualized data
  views and dropdowns) and C4 (AVGrid → av-grid) get their docs when each is next up.

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
