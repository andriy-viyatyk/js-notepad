# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-028** — [Unified Editor Architecture — Editors as Standalone Models](epics/EPIC-028.md) *(Implementation phase planned 2026-05-20 — strangler fig migration with risk-first editor order; 13 tasks queued. Each task gets a deep-investigation pass with full task document immediately before implementation. See [`EPIC-028.md`](epics/EPIC-028.md) for the implementation plan)*
  - **Phase A — Foundation**
  - [ ] [US-547: Foundation primitives](tasks/US-547-foundation-primitives/README.md) — `EditorModel`, `IContentHost`, `ComponentQueue`, `TOneState` selector subscribe, new `editorRegistry`, `PageDescriptor` v4 types, `CONTENT_HOST_TRAIT` (inert; no consumers)
  - [ ] [US-548: PageModel adapter layer](tasks/US-548-pagemodel-adapter-layer/README.md) — unified `editors[]` + `_mainEditorId`; `LegacyEditorAdapter` wraps existing editors; persistence dual-reads (v3 or v4) and writes v4; `compareGroups` moves to `PagesModel.state` (CK1/CK6/CK7)
  - [ ] [US-549: Shared chrome (PageToolbar + TextChrome)](tasks/US-549-shared-chrome/README.md) — walkthroughs 09 / 10; NavPanel button auto-renders for 6 sidebar editors; portal refs retire
  - **Phase B — Cross-cutting**
  - [ ] [US-550: MCP + scripting facades partial](tasks/US-550-mcp-and-scripting-facades/README.md) — `mcp-handler.ts` MI1–MI5; `page.asX()` gains `force?: boolean`; `PageWrapper.type` retires
  - **Phase C — Per-editor migrations (risk-first)**
  - [ ] [US-551: Monaco / Text editor migration](tasks/US-551-monaco-editor-migration/README.md) — walkthrough 20; native `MonacoEditor` v4 class + `<MonacoBody>`; `CONTENT_HOST_TRAIT` on adapter + cross-camp switch; `TextEditorFacade` queue-backed (async)
  - [ ] [US-552: Grid editor migration](tasks/US-552-grid-editor-migration/README.md) — walkthrough 21 (3 registry ids → 1 class with `format`)
  - [ ] [US-552-B: Host-managed editor view state](tasks/US-552-B-host-managed-editor-view-state/README.md) — *(cross-cutting; investigation complete 2026-05-21, ready for implementation)* generic `getEditorState` / `setEditorState` on `IContentHost`; `editorSettings: Record<string, unknown>` on `TextFileModel.state`; retrofit Grid as first consumer. Mockups + walkthrough concerns (GR4 / GR6 / PV2 / PV6 / LV3 / LK3 / TD3 / RC3 / NB3) amended with HS1 addendum so downstream editor migrations (US-553 → US-557) land in the corrected design.
  - [ ] US-553: LogView editor — walkthrough 23 (final `acquireViewModelSync` retirement)
  - [ ] US-554: Preview group — Markdown / SVG / HTML / Mermaid — walkthrough 22
  - [ ] US-555: Link editor — walkthrough 24 (first sidebar-owning; `beforeNavigateAway` + `onMainEditorChanged`)
  - [ ] US-556: Todo + RestClient editors — walkthroughs 25, 26
  - [ ] US-557: Notebook editor — walkthrough 29 (embedded editors with note-level switching)
  - [ ] US-558: No-host group — Browser + Compare + Explorer + 9 misc no-host editors — walkthrough 30
  - **Phase D — Cleanup**
  - [ ] US-559: Strangler-fig retirement — delete `LegacyEditorAdapter`; drop dual-read persistence (v4-only — detect-and-skip old session data); delete remaining legacy types; bump major version
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
  - [ ] US-347: CategoryView / CategoryEditor Breadcrumb
  - [ ] US-453: Storybook property editor — fix scroll when prop list exceeds panel height
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
