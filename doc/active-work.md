# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-057** — [De-React Epic C4 — AVGrid → av-grid](epics/EPIC-057.md) — scope measured,
  decisions settled. C4-1 is decided: **av-grid is an npm dependency**, with vendoring kept as an
  available fallback.
  - [ ] [US-1019: Adopt av-grid — dependency, `--p-*` bridge, layered CSS, mounting shim, story,
    and the Rule 4 "before" numbers](tasks/US-1019-adopt-av-grid/README.md) — **implemented**
    against av-grid 2.2.0; lint/typecheck/build-prod clean. Outstanding: the Rule 4 "before"
    measurement (needs `npm run dist` from commit `44739cb0` and a hand drag) and the dev-server
    check of the layered `@import`
  - [ ] [US-1020: `editors/grid/` — the JSON/CSV grid
    editor](tasks/US-1020-grid-editor-av-grid/README.md) — **implemented**; lint/typecheck/
    build-prod clean, not yet tested in the app. F1 shipped as av-grid **2.2.1** (811 tests pass),
    tagged locally but **not published** — push the tag, then `npm install` to fix the lock
  - [ ] US-1021: `components/git-tree/` — including the `BranchTreeCell` swimlane rewrite
  - [ ] US-1022: `FileGrid`, `EnvVarsBody`, `GraphDetailPanel`, `GridOutputView`
  - [ ] US-1023: Delete `uikit/AVGrid/` and close Epic C
- *(no epic)*
  - *(no active tasks)*

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Epics are created from it one at a time. Epic C is split four ways: **C1 is
  complete as EPIC-054**, **C2 is complete as [EPIC-055](epics/EPIC-055.md)**, **C3 is complete as
  [EPIC-056](epics/EPIC-056.md)**, **C4 is scoped as [EPIC-057](epics/EPIC-057.md)** — the last
  epic in Epic C.

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
