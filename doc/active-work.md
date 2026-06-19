# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active
- **EPIC-034** — [Web Board — HTML-page board with `persephone.execute` + board scripts](epics/EPIC-034.md) *(design consolidated; placeholder tasks in build order — each investigated before implementation)*
  - [ ] [US-719: Command runner — shared main-process streaming spawn service (IPC interface; consumed by board preload, renderer `app` API, and optional MCP tool)](tasks/US-719-command-runner/README.md)
  - [ ] [US-720: Process lifecycle — whole-tree kill (`taskkill /T`) + per-owner reaping](tasks/US-720-process-lifecycle/README.md)
  - [ ] [US-721: Project trust gate + dialog (per `.persephone`; `trustedProjects.txt`; RCE-explicit confirmation)](tasks/US-721-project-trust-gate/README.md)
  - [ ] [US-722: `.persephone` folder + Board editor + folder-click routing (sidebar board list + main management)](tasks/US-722-board-editor-routing/README.md)
  - [ ] [US-723: `board://` protocol + locked-down webview + bridge injection + CSP](tasks/US-723-board-protocol-webview/README.md)
  - [ ] [US-724: `persephone` bridge (board preload) — `execute()` handle (thin client over US-719) + integration tier (`openRawLink`, `notify`, file dialogs)](tasks/US-724-board-bridge/README.md)
  - [ ] [US-725: Theme contract — `--p-*` CSS variables + `persephone.theme` (live update)](tasks/US-725-theme-contract/README.md)
  - [ ] [US-726: Templates & scaffolding + `ui.log` + live reload](tasks/US-726-config-templates-log/README.md)
  - [ ] US-727: Recommended-components manifest + first skin (Tabulator)
  - [ ] US-728: Demo board — self-documenting showcase + dogfood (full `persephone` surface, themes/tokens, recommended-components catalog + skin links; offered via a prompt dialog on project creation)

## Planned
- **EPIC-033** — [Configurable Dashboards (`.persephone` projects)](epics/EPIC-033.md) *(frozen — superseded by EPIC-034; to be deprecated or fully rewritten after EPIC-034 ships)*
  - [ ] [US-699: Generic command runner (main-process spawn + IPC + error toast)](tasks/US-699-command-runner/README.md)
  - [ ] US-700: `TDiskState` — folder-backed, schema-validated, disposable disk-synced state primitive
  - [ ] US-701: Per-page loading indicator primitive (badge + circular progress + overlay lock)
  - [ ] US-702: Project trust gate (per `.persephone`; `trustedProjects.txt`; untrusted UX)
  - [ ] US-703: PersephoneDashboard editor + `.persephone` folder-click routing (sidebar list + main management)
  - [ ] US-704: GridDashboard renderer — `AVGrid` bound to synced state
  - [ ] US-705: `config.json` — load + watch/recreate; `commands` globs; `events`
  - [ ] US-706: Action execution — external scripts; action-reference shape (`sync`/`async`, `name`); `activeRow`/`selection` flush
  - [ ] US-707: `.persy` in-app runtime — full API context + injected live `state`
  - [ ] US-708: `onLoad` event — trust-gated auto-run
  - [ ] US-709: Templates & scaffolding — bundled template + `library-service` copy with name substitution
  - [ ] US-710: Error logging — per-dashboard `ui.log` + clickable error indicator
  - [ ] US-711: Dogfood reference dashboard — Persephone's own task board
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
