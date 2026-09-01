# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Current Refactoring Roadmap

**[doc/de-react-refactoring-2.md](de-react-refactoring-2.md)** — the De-React second-pass survey is
the active roadmap for renderer refactoring. Its **Part 6** holds the delivery plan: one standalone
task (US-1258, quick wins), three epics (EPIC-080 state/lifetime/scheduling core, EPIC-081 DOM & IO
mechanisms, EPIC-082 React-pattern removal at the call sites), one backlog package, and P8's lint
clauses folded into US-1131.

Epics are created **one at a time**, each written when work is about to start on it — so a number in
Part 6 with no document yet is reserved intent, not existing work. **EPIC-080 and EPIC-082 are both
complete** (2026-09-01 — see [epics/completed.md](epics/completed.md)). **EPIC-081 is still intent**
and has no document yet; it is the free-floating parallel track and now the only epic left in the
programme. Part 5's package 8 stays in [`tasks/backlog.md`](tasks/backlog.md), drawn down
opportunistically rather than as an epic.

The roadmap's Part 1 sections now carry **DELIVERED** banners where EPIC-082 closed them, including
notes on which of its original counts and claims turned out stale — read those before acting on any
remaining item there.

Two items were deferred out of EPIC-080 and belong to a later epic rather than to the roadmap's
original packages — the fourth listener list in `src/ipc/renderer/renderer-events.ts`, and
`PageContentView`'s helper adoption. EPIC-080's document records both with the reasoning.

Remove this section from the dashboard when the programme is done.

## Active

- *(nothing active — EPIC-082 closed 2026-09-01; the roadmap's remaining work is EPIC-081 (intent only) and package 8 in the backlog)*

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
