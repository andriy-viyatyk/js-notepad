# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-053** — [De-React Epic B: The reactive foundation and the boundary](epics/EPIC-053.md)
  - [ ] [US-985: Drop zustand from the state layer](tasks/US-985-drop-zustand/README.md)
  - [ ] [US-986: Vanilla view lifecycle and `bind()`](tasks/US-986-vanilla-view-lifecycle/README.md)
  - [ ] [US-987: Keyed-list and subtree-swap helpers](tasks/US-987-structural-helpers/README.md)
  - [ ] [US-988: Model driver — the non-React `useComponentModel`](tasks/US-988-model-driver/README.md)
  - [ ] [US-989: `mountVanilla` / `mountReact`](tasks/US-989-boundary-adapters/README.md)
  - [ ] US-990: Storybook vanilla render path
  - [ ] US-991: Pilot — one component converted end to end
  - [ ] US-992: Authoring rules for vanilla views
- *(no epic)*
  - *(no active tasks)*

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Not scheduled; epics are created from it one at a time.

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
