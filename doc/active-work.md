# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

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
  deliberately **last** in Epic E (EPIC-059 E1-8). One measurement is banked for E4+: the notebook
  rebuilds a Monaco editor whenever a note row scrolls out of view, which EPIC-061 established is a
  `RenderFlexGrid` cost rather than a wrapper one (E3-6, withdrawn) and belongs to whichever epic takes
  that ledger entry. Next free epic number: **EPIC-062**.

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
