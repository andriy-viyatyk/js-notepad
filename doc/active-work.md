# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- *(no epic)*
  - [ ] **US-1286: Host menus did not close when clicking inside a browser page** — user-reported
    (2026-09-03): with a browser page open, the page-tab context menu, the downloads menu and the
    toolbar's three-dot menu stayed open when clicking in the page. `PopoverView`'s outside-click
    listener is on the host `document`, and a press inside the `<webview>` guest fires no event
    there — and the guest covers nearly the whole page, so there was barely anywhere left to click
    to dismiss. The guest preload now reports every press (`guest-pointerdown`, capture phase, no
    `defaultPrevented` deferral — a press in the guest is unambiguously outside every host overlay),
    and `BrowserView`'s `ipc-message` handler replays it through a new shared
    `dismissOverlays()` in `uikit/shared/overlayLayer.ts`.
    **Not the De-React regression it looked like:** v4.0.22's popover listened on `document`
    `mousedown`, which a guest press does not produce either, so the browser case was equally
    broken in the last release. The genuine regression is adjacent — the HTML viewer's sandboxed
    iframe has pinged the host since US-729 and its handler dispatched `mousedown`, which stopped
    dismissing anything when `PopoverView` moved to `pointerdown`. Both now share one helper.
    **Known gap:** the preload is main-frame only, so a press inside a cross-origin iframe within
    the page still does not dismiss — the same boundary as US-1284.

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
