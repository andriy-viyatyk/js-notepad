# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-062** — [De-React Epic E4: delete the React `RenderGrid` contract](epics/EPIC-062.md)
  - [ ] [US-1062: LinksList to VirtualGridView (pilot)](tasks/US-1062-linkslist-virtualgrid/README.md)
  - [ ] US-1063: `VirtualFlexGridView` — measured-height wrapper over `VirtualGridView`
  - [ ] [US-1068: remove the React roots from `PathInputView`](tasks/US-1068-pathinput-no-react-root/README.md)
  - [ ] [US-1064: `NotebookBody` and its cell subtree to `VirtualFlexGrid` (carries Rule 4)](tasks/US-1064-notebook-virtual-flex-grid/README.md)
  - [ ] [US-1065: `LogBody` and its cell subtree to `VirtualFlexGrid`](tasks/US-1065-logbody-virtual-flex-grid/README.md)
  - [ ] [US-1066: `LinksTiles` to `VirtualGridView`](tasks/US-1066-linkstiles-virtual-grid/README.md)
  - [ ] [US-1067: delete `uikit/RenderGrid/` — the closing property](tasks/US-1067-delete-rendergrid/README.md)
- *(no epic)*
  - [ ] US-1055: `mermaid/MermaidBodyView.ts` builds its child DOM in the constructor, against `uikit/CLAUDE.md:496-502` ("the constructor … must not create child DOM"; `mount()` is where child DOM is built). Found by EPIC-060's close review, which fixed the same violation in the five views it owned; this one is from EPIC-059 and was left out of scope. Move child creation and attachment into `onMount()`, keeping exactly-once child mounts and FIFO cleanup ordering. Low risk, but it is the file every later editor conversion copies — see [`doc/tasks/epic60-review.md`](tasks/epic60-review.md).
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
  a converted pilot — and **E2 is complete as [EPIC-060](epics/EPIC-060.md)**: the five
  `EditorModule.Body` providers are vanilla and that React contract is deleted from the registry.
  `react-markdown` now has no importer. **E3 is complete as [EPIC-061](epics/EPIC-061.md)** — it took
  the other shared contract, `@monaco-editor/react`, across 13 mount points behind two `VanillaView`
  hosts, and closed by uninstalling the package. **Both editor-wide contracts are now gone**, so E4
  onward are scoped by line count, which is what EPIC-060's E2-1 said to fall back to when no contract
  exists. What remains: the editors, of which the large ones are `graph` (3,259), `link-editor` (2,847)
  and `notebook` (2,001) — two of them also carrying removal-ledger entries (`RenderGrid`,
  `RenderFlexGrid`, `highlight`'s React form), so they are conversion *plus* collection work — and the
  14 `<TextChrome>` call sites, which convert for free once the last shell is vanilla and are therefore
  deliberately **last** in Epic E (EPIC-059 E1-8). **E4 is scheduled as [EPIC-062](epics/EPIC-062.md)** and it
  corrects the "line count from here on" note: a shared contract does exist, it is just owned by
  `uikit/` rather than `editors/` — `RenderGrid`'s cell contract returns a `ReactNode`, pinning all
  12 of its importers to React. E4 deletes `uikit/RenderGrid/` outright, collecting two removal-ledger
  entries, and takes the notebook Monaco-churn measurement E3 withdrew and handed forward (E3-6), whose
  cause is `renderInfo.ts:314` keying virtualized cells by row index. Line count becomes the axis from
  **E5** onward. Next free epic number: **EPIC-063**.

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
