# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-054** — [De-React Epic C1 — Foundation and primitives](epics/EPIC-054.md)
  - [ ] [US-995: Rule 6 — close the `uikit/` → app-layer imports and lint the boundary](tasks/US-995-uikit-boundary-lint/README.md)
  - [ ] [US-996: The vanilla UIKit contracts — CSS, slots, React-compat helpers, Rule 4 baseline](tasks/US-996-vanilla-uikit-contracts/README.md)
  - [ ] [US-997: DOM icon path — rewrite the 116 icon bodies as markup; dual-face factories](tasks/US-997-dom-icon-path/README.md)
  - [ ] [US-998: `Tooltip` — attachment-based, on `@floating-ui/dom`](tasks/US-998-tooltip-attachment/README.md)
  - [ ] [US-999: `Button`, `IconButton`, `TruncatedText`, `SegmentedControl` + Rule 4 after-number](tasks/US-999-button-cluster/README.md)
  - [ ] US-1000: `Text` and the stateless leaves — `Label`, `Tag`, `SelectableRow`, `Divider`, `Dot`, `Spacer`, `Spinner`, `ProgressBar`
  - [ ] US-1001: `Checkbox`, `Slider`, `RadioGroup`
  - [ ] US-1002: `Input` and `Textarea`
  - [ ] US-1003: `Panel` — Emotion to CSS, no vanilla face
- *(no epic)*
  - *(no active tasks)*

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Epics are created from it one at a time. Epic C is split four ways: **C1 is
  active as EPIC-054**; C2 (floating layer and composites), C3 (virtualized data views) and C4
  (AVGrid → av-grid) get their docs when each is next up.

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
