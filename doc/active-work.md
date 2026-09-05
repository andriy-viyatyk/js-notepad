# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-083** — [AiVision: a single self-discoverable MCP tool over the app object model](epics/EPIC-083.md)
  — one `call` tool taking a path into the live `app`/`pages`/facade tree and returning
  the value plus a hint; descriptors are an interface implemented by the existing script wrappers,
  not a second tree. Long-term direction: every MCP tool becomes a path under this one, but
  nothing is removed in this epic. Created 2026-09-05; task documents are written per task as
  each starts.
  - [ ] [US-1289: AiVision core — types, path parser, resolver, root + pages descriptors, helpSearch](tasks/US-1289-ai-vision-core/README.md) — implemented 2026-09-05, awaiting user test; leads the epic
  - [ ] US-1290: `call` MCP tool — main-side definition with the optional `windows[i]` prefix, renderer command, per-session hint dedupe, guide updates *(no task document yet)*
  - [ ] US-1291: Descriptors for `PageWrapper` and every editor facade *(no task document yet; parallel with US-1292)*
  - [ ] US-1292: Descriptors for the `app` namespaces with `caution` on destructive members *(no task document yet; parallel with US-1291)*
  - [ ] US-1293: Evaluation with `mcp-test-agent`, full tool set vs `call` alone; go/no-go for the consolidation epic *(no task document yet; closes the epic)*
  - [ ] US-1294: *(optional)* generate descriptors from `api/types/*.d.ts` JSDoc *(no task document yet)*
  - [ ] US-1296: Programmatic surface — `app.call(path, options)` in scripts and `persephone.call` on the board bridge; decide board permissions *(no task document yet; after US-1291/US-1292)*
  - [ ] US-1295: Main-process `main` node — curated service descriptors and settings-gated `main.script.execute(code)` for developing/testing Persephone *(no task document yet; after US-1290)*

- *(EPIC-081 closed 2026-09-02, completing the De-React second-pass roadmap; see
  [epics/completed.md](epics/completed.md). The only residue is package 8 in
  [tasks/backlog.md](tasks/backlog.md), drawn down opportunistically.)*

## Planned

- *(no epic)*
  - [ ] **US-1258: De-React roadmap quick wins** — *no task document yet.* The last unfinished item
    of the [De-React second-pass roadmap](de-react-refactoring-2.md) (Part 5 package 1), kept here
    so it is not lost now that the roadmap's tracking section has been retired. Six unrelated fixes
    sharing no mechanism, **three of them live defects**: `LogBodyView`'s 50/150/300 scroll shotgun
    (adopt the existing `scrollToRowAfterPaint`), the four fresh-**array** dialog selectors that
    genuinely do fire on every dispatch, and `GlobalEventService` ignoring `defaultPrevented`
    (P6 — fixing it deletes the `grid-context-menu.ts` workaround). Also: delete the
    `getVersion()`/`useSyncExternalStore` residue and `ToolbarView`'s single-trigger roving
    tabindex. Nothing gates it. (`ExpandedNoteView.setState` was dropped from the scope on
    2026-09-03 — three lines wrapping `state.update`, a naming preference with no behavioural
    difference. Same decision as in package 8.)
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
