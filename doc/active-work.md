# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

**Ongoing programme — post-De-React refactoring.** [`de-react-refactoring.md`](de-react-refactoring.md)
is the high-level plan for the work that follows the De-React migration: ten proposals (R1–R10)
covering the React-era shapes that survived the migration, plus vanilla-world patterns worth
adopting. It is a **living plan**, not a task document — epics are cut from it one at a time and
listed below. Suggested split: **Epic A** core contracts (R1, R3, R10.1-3) → **Epic B** the props
pump (R2, R6, R10.4-6) → **Epic C** targeted fixes (R4, R5, R7, R8), with R9 standalone. Re-measure
its figures when cutting an epic; the sweep behind them dates from 2026-08-29.

## Active

Marker convention: `[ ]` = open · `[ ] **implemented**` = code is in and gated, awaiting a
batched `/review`, `/document`, `/userdoc` pass · `[x]` = reviewed and done. Standalone tasks are
reviewed in batches by user decision (2026-08-29), the same deferred model epics use.

- **EPIC-077** — [Post-De-React Epic C: proportional work](epics/EPIC-077.md) — R4, R5, R7,
  R8's residue, and R6's deferred type half. Cut 2026-08-30 with its figures re-measured against
  commit `9ca76ea5`; **nine corrections to the plan page**, including a cited file at a
  non-existent path, a stated symptom that is fiction, two R8 bullets already delivered by Epic A,
  and a `setTimeout` census stale by more than half. Read
  [§C-2](epics/EPIC-077.md) before writing any task doc for this epic.
  - Strand 1 — proportional work (closes the epic's four statements)
    - [ ] US-1208: The `listen()`-on-update sweep, and Breadcrumb
    - [ ] US-1209: Minimap — move the DOM mirror into the view, make it incremental
    - [ ] US-1210: `CategoryViewImpl` — hoist the rebuild behind its own gate
    - [ ] US-1211: The app-shell rebuild tail — `SecondaryViewsView` and the sidebar trio
    - [ ] US-1212: The editor rebuild tail
    - [ ] US-1213: Re-derive and fix the ungated `{ all: true }` sites
    - [ ] US-1214: R5 — log-view entries out of immer
    - [ ] US-1215: R5 — notebook notes out of immer
    - [ ] US-1216: R5 — graph nodes out of immer
  - Strand 2 — shape (closes nothing; cut first if the epic needs to be smaller)
    - [ ] US-1217: The dialog shell — lift Escape once, then collapse the thin models
    - [ ] US-1218: Merge the types-only component files
    - [ ] US-1219: R7 residue — `FileList`, `ImageViewport`, `VirtualFlexGridModel`
    - [ ] US-1220: R6's type half — narrow the contracts, shrink `dom-props.ts`
  - Strand 3 — residue
    - [ ] US-1221: The timing residue


## Planned

- *(no epic)*
  - [ ] [US-1050: Add an unregister_toolset MCP tool](tasks/US-1050-unregister-toolset-tool/README.md)
    — an enhancement, not a De-React defect. Deferred by user decision (2026-08-29): the
    De-React fallout is being cleared first.
  - [ ] [US-1131: Close the remaining gaps in the VanillaView lifecycle lint rules](tasks/US-1131-vanillaview-lint-gaps/README.md)
    — tooling, not a defect: the guard itself shipped as US-1142 in EPIC-071 and this is the
    residue. Deferred by user decision (2026-08-29). It now carries **five** clause candidates,
    two with measured baselines — clause 3's 77-site sweep showing "not retained" is the wrong
    detector, and clause 5's 0-vs-95 precision measurement — so it gets cheaper to land as the
    evidence accumulates, but nothing depends on it.

Recorded epic ideas live in [`tasks/backlog.md`](tasks/backlog.md).

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
