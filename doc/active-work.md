# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-060** — [De-React Epic E2 — The embeddable bodies](epics/EPIC-060.md)
  - [ ] [US-1051: Convert the `svg` and `html` bodies to `BodyView`](epics/EPIC-060.md)
  - [ ] [US-1048: `hast → DOM` markdown renderer; `MarkdownBlock` to vanilla](tasks/US-1048-hast-dom-markdown/README.md)
  - [ ] [US-1052: Convert the `markdown` body](epics/EPIC-060.md)
  - [ ] [US-1053: Convert the `grid` body](epics/EPIC-060.md)
  - [ ] [US-1054: Delete the React `Body` arm from the editor registry](epics/EPIC-060.md)
- *(no epic)*
  - [ ] US-1050: `unregister_toolset` MCP tool — the agent can `create_toolset` (with a user confirmation prompt) but has no way to unregister/remove one; cleaning up a scratch toolset required reaching into the internal `toolsTrust.untrust` via `execute_script`. Add an MCP tool (in `src/renderer/api/mcp/tool-commands.ts` beside `refresh_toolset`) that unregisters a toolset by root path; folder deletion stays the agent's own fs call. Decide whether it needs a confirmation prompt like registration (unregistering is less dangerous than registering — probably no prompt, but flag it).
  - [ ] US-1041: `SearchChannel.cancel` should carry a search id — the main process cancels per window (`event.sender.id`), so a disposed FileSearch view cannot cancel its own worker without risking another view's search
  - [ ] [US-1039: Tree search clear does not restore expansion after a zero-match search](tasks/US-1039-tree-search-clear-restore/README.md)

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Epics are created from it one at a time. Epic C is split four ways: **C1 is
  complete as EPIC-054**, **C2 is complete as [EPIC-055](epics/EPIC-055.md)**, **C3 is complete as
  [EPIC-056](epics/EPIC-056.md)**, and **C4 is complete as [EPIC-057](epics/EPIC-057.md)** — the last
  epic in Epic C. **Epic D is complete as [EPIC-058](epics/EPIC-058.md)** — the shell is vanilla and
  the application root is flipped. **Epic E is split: E1 is complete as
  [EPIC-059](epics/EPIC-059.md)** — the four editor seams every conversion needs now exist, each with
  a converted pilot — and **E2 is active as [EPIC-060](epics/EPIC-060.md)**, the first conversion
  epic: the five editors that supply `EditorModule.Body`, closing with that React contract deleted
  from the registry. It carries the task E1 deferred,
  [US-1048: `hast → DOM` markdown renderer](tasks/US-1048-hast-dom-markdown/README.md) (EPIC-059
  E1-12), whose plan is already written. Further conversion epics (E3…) are scoped as each opens; the
  large editors — `graph`, `link-editor`, `notebook` — are deliberately not in E2. Next free epic
  number: **EPIC-061**.

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
