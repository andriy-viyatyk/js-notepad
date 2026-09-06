# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-086** — [The text-and-preview editor family through `call`](epics/EPIC-086.md)
  — epic 3 of the [agent transparency roadmap](agent-transparency-roadmap.md)
  - [x] [US-1310: The page node redesign](tasks/US-1310-page-node-redesign/README.md) — `page.editor`, `editorSwitches`, removal of `as*()` (breaking; version 5.0.0)
  - [ ] [US-1311: Page-scoped element selectors](tasks/US-1311-page-scoped-elements/README.md) — `data-page-id`, activate-then-highlight, `page.tab`
  - [ ] [US-1312: The Monaco/text surface](tasks/US-1312-monaco-text-surface/README.md) — toolbar, script panel, encryption, native find/replace
  - [ ] [US-1313: The preview family](tasks/US-1313-preview-family/README.md) — markdown, HTML, SVG, mermaid; the iframe boundary
  - [ ] [US-1314: Media](tasks/US-1314-media-surfaces/README.md) — the image surface, and a new video facade
  - [ ] [US-1315: Diff](tasks/US-1315-diff-and-compare/README.md) — the file-diff facade, and compare mode on `pages`
  - [ ] [US-1316: The graph surface](tasks/US-1316-graph-surface/README.md) — toolbar, detail and legend panels, expansion settings
  - [ ] [US-1317: Acceptance run and retirable tools](tasks/US-1317-editor-surface-acceptance/README.md) — Haiku gate, `qa/surfaces/editors/*.md`, three tools marked retirable

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
