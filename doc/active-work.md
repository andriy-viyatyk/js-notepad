# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- *(no epic)* — EPIC-079 fallout, both found by the user after the epic closed
  - [ ] US-1242: The custom scrollbar style stopped applying after the av-grid migration
    — the retired fork added `scroll-container` to its own container inside `VirtualGridView`, so
    every grid inherited the hover-reveal treatment. `RenderGrid` builds its own container, so the
    class had nowhere to land. Fixed by extending the global rule in `theme/global-styles.ts` with
    a `[data-type="render-grid-scroll"]` selector rather than adding the class at seven
    construction sites, which would have reintroduced the can-be-forgotten failure the fork
    did not have. Applies to the DataGrid too, at the user's request.
  - [ ] US-1243: Log View and Notebook rendered all rows at the top with a 2-3x oversized scroll area
    — **the measured-height renderers never applied cell geometry.** The fork's
    `VirtualFlexGridView` called `applyCellStyle` itself (line 43), so `LogBodyView` and
    `NotebookBodyView` never had to; av-grid's `MeasuredRowGrid` delegates it to the renderer like
    any `RenderGrid` renderer, and av-grid's own usage example shows the call. The migration missed
    it because all five *fixed*-height consumers already did it in their own renderers. Cells fell
    into normal flow and stacked at the top while the area kept the model's computed extent.
    Fixed in both renderers; verified 0px uncovered at both ends and the extent settling at 6158px.

## Planned

- *(no epic)*
  - [ ] [US-1050: Add an unregister_toolset MCP tool](tasks/US-1050-unregister-toolset-tool/README.md)
    — an enhancement, not a De-React defect. Deferred by user decision (2026-08-29) until the De-React fallout was cleared. That
    programme closed 2026-08-30, so nothing blocks this now.
  - [ ] [US-1131: Close the remaining gaps in the VanillaView lifecycle lint rules](tasks/US-1131-vanillaview-lint-gaps/README.md)
    — tooling, not a defect: the guard itself shipped as US-1142 in EPIC-071 and this is the
    residue. Deferred by user decision (2026-08-29); the programme that blocked it closed 2026-08-30.
    It now carries **five** clause candidates,
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
