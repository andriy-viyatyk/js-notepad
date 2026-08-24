# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-059** — [De-React Epic E1 — Editor foundations](epics/EPIC-059.md)
  - [ ] US-1042: Vanilla editor registration seam + convert the `toolset` editor
  - [ ] US-1043: Vanilla Monaco host + convert the `compare` editor
  - [ ] US-1044: `editors/shared` widgets to vanilla
  - [ ] US-1045: Convert the `image` editor inside its React `<PageToolbar>` shell
  - [ ] US-1046: Convert the `mermaid` editor body inside its React `TextChrome` shell
  - [ ] US-1047: Secondary-view vanilla arm + convert one editor-owned panel
  - [ ] US-1048: `hast → DOM` markdown renderer; `MarkdownBlock` to vanilla
- *(no epic)*
  - [x] US-1049: Closing a grouped page threw an immer `MapSet` error and orphaned the page — `PagesModel.removePage` read the `compareGroups` Set off the immer draft, which this repo cannot do because it deliberately never calls `enableMapSet()` (US-970). Found while verifying US-1043; fixed by reading the pre-update snapshot. Marked `[x]` as implemented, but its `/review` + docs pass rides along with EPIC-059's close rather than running the standalone flow for a one-line fix in the same code area.
  - [ ] US-1041: `SearchChannel.cancel` should carry a search id — the main process cancels per window (`event.sender.id`), so a disposed FileSearch view cannot cancel its own worker without risking another view's search
  - [ ] [US-1039: Tree search clear does not restore expansion after a zero-match search](tasks/US-1039-tree-search-clear-restore/README.md)

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Epics are created from it one at a time. Epic C is split four ways: **C1 is
  complete as EPIC-054**, **C2 is complete as [EPIC-055](epics/EPIC-055.md)**, **C3 is complete as
  [EPIC-056](epics/EPIC-056.md)**, and **C4 is complete as [EPIC-057](epics/EPIC-057.md)** — the last
  epic in Epic C. **Epic D is complete as [EPIC-058](epics/EPIC-058.md)** — the shell is vanilla and
  the application root is flipped. **Epic E is split: E1 is active as
  [EPIC-059](epics/EPIC-059.md)** (editor foundations — the seams every editor conversion needs);
  the editor conversions themselves land in later epics, scoped when each opens. Next free epic
  number: **EPIC-060**.

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
