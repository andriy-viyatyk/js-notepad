# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-089** — [The browser and the app window through `call`, and the retirement of fifteen tools](epics/EPIC-089.md)
  - [ ] [US-1334: Per-host ref stores, and the automation command bodies made callable from a facade](tasks/US-1334-ref-lifecycle/README.md)
  - [ ] [US-1335: The browser page surface — refs, the six missing capabilities, and the chrome/content split](tasks/US-1335-browser-page-surface/README.md)
  - [ ] [US-1336: The board page host — the same member set on the board facade](tasks/US-1336-board-page-automation/README.md)
  - [ ] [US-1337: `window.screen` — Persephone's own window as an automation host](tasks/US-1337-window-screen-node/README.md)
  - [ ] [US-1338: `pages.openUrlInBrowserTab` as `open_url`'s replacement, and `pages.openUrl`](tasks/US-1338-page-open-url/README.md)
  - [ ] [US-1339: Delete the `mcp.browser-tools.enabled` setting and its guide instructions](tasks/US-1339-retire-browser-setting/README.md)
  - [ ] [US-1340: Acceptance run on Haiku; the browser surface file; fifteen tools marked retirable](tasks/US-1340-browser-acceptance/README.md)

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
