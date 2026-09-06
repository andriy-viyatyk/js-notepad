# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-090** — [Consolidation: the call-only flag, the two-model gate, and the deletion of thirty-two tools](epics/EPIC-090.md)
  - [ ] [US-1343: The `call("")` overview — optional `path` and a high-level area map](tasks/US-1343-call-overview/README.md)
  - [ ] [US-1344: `script.execute(code)` — the renderer half of gated scripting, replacing `execute_script`](tasks/US-1344-script-execute/README.md)
  - [ ] [US-1345: Retire the `read_guide` tool: resources stay, operational prose moves into `$help`](tasks/US-1345-guide-prose-to-help/README.md)
  - [ ] [US-1346: The `PERSEPHONE_MCP_CALL_ONLY` flag, and the `waitForNavigation` documentation duty](tasks/US-1346-call-only-flag/README.md)
  - [ ] [US-1347: Rewrite the QA suite for `call`: every scenario starts from a bare call](tasks/US-1347-qa-suite-for-call/README.md)
  - [ ] [US-1348: The gate — the Haiku pass and the Codex pass, logged in `qa/runs/`](tasks/US-1348-two-model-gate/README.md)
  - [ ] [US-1349: Delete the thirty-two tools, the highlight recipe, the per-tool QA files; rewrite the manifest instructions](tasks/US-1349-deletion/README.md)

## Planned

- *(no epic)*
  - [ ] [US-1050: Add an unregister_toolset MCP tool](tasks/US-1050-unregister-toolset-tool/README.md)
    — an enhancement, deferred by user decision (2026-08-29); nothing blocks it now.
  - [ ] [US-1131: Close the remaining gaps in the VanillaView lifecycle lint rules](tasks/US-1131-vanillaview-lint-gaps/README.md)
    — tooling, not a defect: the guard itself shipped as US-1142 in EPIC-071 and this is the
    residue. Deferred by user decision (2026-08-29). It carries **five** clause candidates,
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
