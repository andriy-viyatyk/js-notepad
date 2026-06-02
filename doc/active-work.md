# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active
- **EPIC-029** — [Standalone PageNavigator → `SecondaryViews`, a reusable panel host](epics/EPIC-029.md) *(design done; tasks are placeholders, investigated per-task before implementation)*
  - [ ] [US-595: Rename `secondaryEditor`→`secondaryView` + `PageNavigator`→`SecondaryViews` family](tasks/US-595-rename-secondary-view/README.md) *(Phase 1a)*
  - [ ] [US-596: `ISecondaryViewsState` + controlled `SecondaryViews` component](tasks/US-596-controlled-secondary-views/README.md) *(Phase 1a)*
  - [ ] [US-597: `IPageHost` typing for `editor.page` (+ derived `isMain`)](tasks/US-597-ipagehost-typing/README.md) *(Phase 1a)*
  - [ ] [US-598: Explorer — adopt + verify under new infra](tasks/US-598-explorer-adopt/README.md) *(Phase 1b)*
  - [ ] [US-599: Archive — adopt + verify under new infra](tasks/US-599-archive-adopt/README.md) *(Phase 1b)*
  - [ ] [US-600: Links — finalize `IPageHost` membership + `isMain`](tasks/US-600-links-finalize-ipagehost/README.md) *(Phase 1b)*
  - [ ] US-601: Browser adopts `SecondaryViews` in its empty page *(Phase 2)*
  - [ ] US-602: Notebook → `SecondaryViews` *(Phase 3)*
  - [ ] US-603: Todo → `SecondaryViews` *(Phase 3)*
  - [ ] US-604: Rest Client → `SecondaryViews` *(Phase 3)*
  - [ ] US-605: MCP Inspector — evaluate (migrate with view change, or skip) *(Phase 3)*
  - [ ] US-606: Storybook — evaluate (migrate with view change, or skip) *(Phase 3)*
  - [ ] US-607: Epic close-out — review + docs, move to completed.md *(Phase 4)*

## Planned
- **EPIC-027** — [Script-Driven UI and Custom Editors](epics/EPIC-027.md) *(carved out of EPIC-025 Phase 6; blocked on EPIC-025 close)*
  - [ ] US-436: Script UI API — expose new component library to scripting engine
  - [ ] US-435: Storybook — script tab for building and testing UI via scripts
  - [ ] US-544: Script-registered custom editor framework — registration, lifecycle, persistence *(placeholder — task spec TBD when epic starts)*
- **EPIC-022** — [LinkEditor Embedded Scripts](epics/EPIC-022.md)
  - [ ] US-396: Data model — `LinkScriptItem` type and `scripts` field in `LinkEditorData`
  - [ ] US-397: ScriptRunner — `runWithScope()` for custom context variable injection
  - [ ] US-398: LinkEditorScriptProvider — virtual IProvider backed by LinkViewModel
  - [ ] US-399: Resolver — handle `link-editor-script://` URL scheme
  - [ ] US-400: Scripts panel UI — collapsible panel with tree view in LinkEditor
  - [ ] US-401: Add/Edit Script dialog
  - [ ] US-402: Script execution engine — event matching and execution in LinkViewModel
  - [ ] US-403: Script types and facade for script API
- **EPIC-014** — [Claude AI Chat Panel](epics/EPIC-014.md)
  - [ ] US-385: Right panel slot in Pages.tsx layout
  - [ ] US-386: ClaudeChatModel + SDK integration (query, streaming, abort)
  - [ ] US-387: Chat UI — message list, input, markdown rendering
  - [ ] US-388: MCP auto-registration + page context injection
  - [ ] US-389: Conversation persistence + session resume
  - [ ] US-390: Settings: API key, model, system prompt
  - [ ] US-391: PowerShell shortcut (Ctrl+\`) — open shell at cwd
- **EPIC-011** — [Chrome Extension Support for Built-in Browser](epics/EPIC-011.md)
- *(no epic)*
  - [ ] [US-454: DrawIO Viewer — read-only viewer for `.drawio` files](tasks/US-454-drawio-viewer/README.md)


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

- **New epic:** Add to Planned with link to its doc in `/doc/epics/`
- **New task (with epic):** Add as sub-item under the epic
- **New task (standalone):** Add under `*(no epic)*`

### Task ID Format

`US-XXX` — sequential number. `EPIC-XXX` — sequential number.
