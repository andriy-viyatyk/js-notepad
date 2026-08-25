# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- *(no epic)*
  - [ ] US-1085: `createPanelElement`/`applyPanelAttributes` silently dropped the `overflow` shorthand and the shrink component of `flex` — `applyPanelAttributes` cleared each property *inside* the setting loop, and `STYLE_PROPERTIES` mixes shorthands with their own longhands, so the `overflow-x`/`overflow-y` removals erased the `overflow` written two iterations earlier, and `flex-shrink`'s removal stripped it from `flex`. Effect: **all 84 `overflow:` panel call sites had no overflow at all** (80 `hidden`, 4 `auto` — and `.scroll-container` supplies none in CSS either), and `flex: "0 0 auto"` behaved as shrink 1. Fixed by clearing in a separate pass first. Reported by the user as the Git panel's Unstaged list not filling its pane, the Staged splitter refusing to drag up, and the list not growing when dragged down — all three were this one cause, since without overflow containment the whole flex chain sized from content upward instead of from the pane down. Broad blast radius: watch for content that previously escaped a panel and now clips.
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
  deliberately **last** in Epic E (EPIC-059 E1-8). **E4 was [EPIC-062](epics/completed.md), now complete** — `uikit/RenderGrid/` is deleted and `uikit/VirtualGrid/` is the only virtualization engine. It
  corrects the "line count from here on" note: a shared contract does exist, it is just owned by
  `uikit/` rather than `editors/` — `RenderGrid`'s cell contract returns a `ReactNode`, pinning all
  12 of its importers to React. E4 deleted `uikit/RenderGrid/` outright, collected two removal-ledger
  entries plus an unplanned third (`RenderGrid.tsx` was the fourth Emotion importer), and took the
  notebook Monaco-churn measurement E3 withdrew and handed forward (E3-6), whose cause was
  `renderInfo.ts:314` keying virtualized cells by row index. **Line count is the axis from E5
  onward** — no shared contract remains to scope by. **E5 is
  [EPIC-063](epics/completed.md), complete 2026-08-25, and it corrected that claim for the second
  consecutive epic**: the surviving contract is
  `ReactSecondaryViewDefinition` in `ui/secondary-views/secondary-view-registry.ts`, which pins 13 of
  the 14 registered sidebar panels to React through the registry rather than through their own
  content. E4-1's generalisation is what catches it — *"no contract left" is a claim about the whole
  import graph, not about one folder* — and the standing check is now that **the axis of the next
  epic is not predicted from the folder the current one touched**. E5 also detonates a latent defect
  the vanilla arm has carried since E1 (a `console.warn` for a React icon fallback the DOM header
  cannot render), which is why its first task is the icon arm rather than a conversion. Deliberately
  out of scope: `SecondaryViews.tsx`, the host's own React face, whose only consumer is the browser
  editor (Rule 1) — that face survives, as does `BoardWebview`'s island inside the board panel.
  **Closing property met:** the registry is single-armed, `LazySecondaryView.tsx`,
  `SideBarPanelHeader.tsx` and `EditorIcon.tsx` are deleted, neither contract file imports React, and
  the sidebar measures **0 React roots** (from 6). E5 also fixed the programme's Rule 4 *instrument*:
  `mountReactHandle` now marks its host `data-react-root`, because a root created outside `fillSlot`
  was previously invisible to the count. **E6 is complete as [EPIC-064](epics/EPIC-064.md)**, 2026-08-25 — the search
  E5-1 requires was run, and candidate 1 is the contract: `uikit/shared/slots.ts`'s
  `IconRef = IconName | ReactNode` and its `renderIcon()`, which returns a `ReactNode`. Measured live,
  **44 of the app's 72 React roots (61%) exist only to render an SVG that already has a DOM builder** —
  every icon in the app has one. E6 is therefore a call-site migration (205 sites) behind a type
  narrowing, not a component conversion. It also **corrects E5-8's own consequence**: deleting the
  member does *not* remove `createRoot` from `uikit/`, because `fillSlot` is fed separately by
  `Button` children and `Input` slots from React callers — *deleting a contract removes the callers it
  pins, not every caller of the machinery underneath it*. Second finding, a reporting correction:
  **130 of the renderer's 262 non-story `.tsx` files contain no JSX at all** (28 never mention React),
  so the `.tsx` counts every epic has reported overstate the remaining React. **E7's candidate is
  already measured** (E6-8): `core/state/view.tsx`'s dialog/popper view registry — 14 vanilla arms to
  4 React, whose conversion deletes the file and collects a residual Emotion importer. Still
  unscheduled: `graph` (3,259), the browser editor (1,692), and the 24 `<TextChrome>` call sites,
  which stay last. **Closing property met:** `IconRef` is `IconName | Node`, `renderIcon` is deleted, and icon React
  roots measure **0** (from 44) on every page set tried. It corrected its own closing property at
  close (E6-11): `SlotText` does *not* narrow, because the link-editor tooltip genuinely needs React —
  the same over-reach E6-1 was written to catch, this time in this epic's own document. Its most
  transferable finding: **when a contract changes from a value to a resource, every cache of that
  value becomes a bug** — the single-use DOM-node hazard hit four times through four mechanisms, and
  no automated gate could see any of them. Next free epic number: **EPIC-065**.

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
