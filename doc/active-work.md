# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- **EPIC-028** — [Unified Editor Architecture — Editors as Standalone Models](epics/EPIC-028.md) *(Implementation in progress. Strangler fig migration with risk-first editor order; 30 tasks queued (Phase C split 2026-05-22 into one task per editor — US-547–US-559 + US-560–US-576). Each task gets a deep-investigation pass with full task document immediately before implementation. See [`EPIC-028.md`](epics/EPIC-028.md) for the implementation plan)*
  - **Phase A — Foundation**
  - [ ] [US-547: Foundation primitives](tasks/US-547-foundation-primitives/README.md) — `EditorModel`, `IContentHost`, `ComponentQueue`, `TOneState` selector subscribe, new `editorRegistry`, `PageDescriptor` v4 types, `CONTENT_HOST_TRAIT` (inert; no consumers)
  - [ ] [US-548: PageModel adapter layer](tasks/US-548-pagemodel-adapter-layer/README.md) — unified `editors[]` + `_mainEditorId`; `LegacyEditorAdapter` wraps existing editors; persistence dual-reads (v3 or v4) and writes v4; `compareGroups` moves to `PagesModel.state` (CK1/CK6/CK7)
  - [ ] [US-549: Shared chrome (PageToolbar + TextChrome)](tasks/US-549-shared-chrome/README.md) — walkthroughs 09 / 10; NavPanel button auto-renders for 6 sidebar editors; portal refs retire
  - **Phase B — Cross-cutting**
  - [ ] [US-550: MCP + scripting facades partial](tasks/US-550-mcp-and-scripting-facades/README.md) — `mcp-handler.ts` MI1–MI5; `page.asX()` gains `force?: boolean`; `PageWrapper.type` retires
  - **Phase C — Per-editor migrations (risk-first)** *(2026-05-22 — original US-554 / US-556 / US-558 bundles split into one task per editor after US-552 / US-553 demonstrated per-editor complexity. US-560+ are new placeholder numbers. US-564 / US-565 cover the design-phase-skipped Graph / Draw walkthroughs.)*
  - [ ] [US-551: Monaco / Text editor migration](tasks/US-551-monaco-editor-migration/README.md) — walkthrough 20; native `MonacoEditor` v4 class + `<MonacoBody>`; `CONTENT_HOST_TRAIT` on adapter + cross-camp switch; `TextEditorFacade` queue-backed (async)
  - [ ] [US-552: Grid editor migration](tasks/US-552-grid-editor-migration/README.md) — walkthrough 21 (3 registry ids → 1 class with `format`)
  - [ ] [US-552-B: Host-managed editor view state](tasks/US-552-B-host-managed-editor-view-state/README.md) — *(cross-cutting; investigation complete 2026-05-21, ready for implementation)* generic `getEditorState` / `setEditorState` on `IContentHost`; `editorSettings: Record<string, unknown>` on `TextFileModel.state`; retrofit Grid as first consumer. Mockups + walkthrough concerns (GR4 / GR6 / PV2 / PV6 / LV3 / LK3 / TD3 / RC3 / NB3) amended with HS1 addendum so downstream editor migrations (US-553 → US-557) land in the corrected design.
  - [ ] [US-553: LogView editor migration](tasks/US-553-log-view-migration/README.md) — *(investigation complete 2026-05-22, ready for implementation)* native v4 `LogViewEditor` over `TextFileModel` host (Tier 5 template; fifth and final text-bearing editor). Retires four `acquireViewModelSync("log-view")` callsites (3 in `mcp-handler.ts`, 1 in `ScriptContext.ts`) + three `loadViewModelFactory("log-view")` pre-loads (`ScriptRunner`, `AutoloadRunner`, `McpInspectorEditorModel.showHistory`). `forceScrollVersion` → `LogQueueEvent.scrollToBottom`. Persistence carve-out vs. walkthrough: only `showTimestamps` rides `host.editorSettings["log-view"]` (HS1); `itemsState` stays transient on `editor.state` — not persisted — because per-entry aux state scales with entry count and would write-storm `openFiles0.json` on heavy log pages. LV2 + LV3 amended 2026-05-22 to reflect. The `acquireViewModelSync` machinery itself stays alive — NoteItemEditModel still consumes it; full removal in US-557 / US-559.
  - *Preview group (walkthrough 22 / PV1–PV10) — four sibling content-views, one task each*
  - [ ] [US-554: Markdown editor migration](tasks/US-554-markdown-editor-migration/README.md) — *(investigation complete 2026-05-22, ready for implementation)* walkthrough 22 (richest of the four — search + compact-mode + scroll machinery; PV9 view container ref). `compactMode` rides `host.editorSettings["md-view"]` (HS1); search state on editor.state (transient, stripped from descriptor). `_containerRef` private field for facade DOM peek (PV9). MK1: Minimap reactivity via view-local `useState` mirror of the scroll-container callback ref. MK3 open: confirm notebook embedding doesn't break when `MarkdownViewModel` is deleted (NoteItemEditModel per-note dispatch grep needed during implementation).
  - [ ] [US-560: Svg editor migration](tasks/US-560-svg-editor-migration/README.md) — *(investigation complete 2026-05-22, ready for implementation)* walkthrough 22 (near-empty state slice — baseline Tier 5 template exercise; `SvgEditorState = EditorStateBase`, no HS1 slot needed). Six concerns SV1–SV6 resolved up front. SV1 retains `SvgView.tsx` + `SvgViewModel.ts` for notebook embedding (US-554 retrospective). SV3 toolbar bits go to `rightToolbarContributions` from day one. SV4 adopts MK4 typed-host getter pattern.
  - [ ] [US-561: Html editor migration](tasks/US-561-html-editor-migration/README.md) — *(investigation complete 2026-05-22, ready for implementation)* walkthrough 22 (third preview-group sibling; simplest of the four — identity-only state slice + zero toolbar buttons + no addEditorPage callers). Six concerns HT1–HT6 resolved up front. HT1 retains `HtmlView.tsx` + `HtmlViewModel.ts` for notebook embedding (US-554/US-560 retrospective). HT5 preserves iframe sandbox + navigation-blocker script byte-for-byte. HT3 adopts MK4 typed-host getter pattern.
  - [ ] [US-562: Mermaid editor migration](tasks/US-562-mermaid-editor-migration/README.md) — *(investigation complete 2026-05-22, ready for implementation)* walkthrough 22 (fourth and final preview-group sibling; async render pipeline — `renderDebounced` + `lightMode` toggle). Ten concerns MR1–MR10 resolved up front. MR1 retains `MermaidView.tsx` + `MermaidViewModel.ts` for notebook embedding (US-554/US-560/US-561 retrospective). MR2 mirrors SV2 imageRef bridge. PV5/PV6 land HS1-mirrored `lightMode` (default `!isCurrentThemeDark()` on first construct; persists across switches AND restarts).
  - *Skipped-in-design editors — first-principles investigation during implementation*
  - [ ] US-564: Graph editor migration — walkthrough 27 *(SKIPPED in design; investigate first-principles — structurally similar to walked Tier 5 text-bearing editors)*
  - [ ] US-565: Draw editor migration — walkthrough 28 *(SKIPPED in design; investigate first-principles — structurally similar to walked Tier 5 text-bearing editors)*
  - *Sidebar / structured editors — one task each*
  - [ ] US-555: Link editor migration — walkthrough 24 (LK1–LK10; first sidebar-owning Tier 5 editor; `beforeNavigateAway` + `onMainEditorChanged`; CategoryEditor view rewire lands here)
  - [ ] US-556: Todo editor migration — walkthrough 25 (TD1–TD10; non-sidebar-owning Tier 5 editor)
  - [ ] US-563: Rest Client editor migration — walkthrough 26 (RC1–RC10; introduces split-cache-file consolidation by scale pattern — RC7)
  - [ ] US-557: Notebook editor migration — walkthrough 29 (NB1–NB10; embedded editors with note-level switching; second consumer of `EditorConstructorArgs.initialHost` — NB7; second + final consumer of `acquireViewModelSync` machinery — retires it for good)
  - *No-host group (walkthrough 30) — twelve editors without `CONTENT_HOST_TRAIT`, one task each*
  - [ ] US-558: Browser editor migration — walkthrough 30 §1 (NH1–NH10; page-mainEditor with embedded LinkEditor for bookmarks drawer — second instance of `initialHost` injection after Notebook NB7)
  - [ ] US-566: Compare editor migration — walkthrough 30 §2 (CP1–CP5; NOT an `EditorModel` — React component composed over two grouped pages' `TextFileModel` hosts; placement resolved in walkthrough 06 / CK1–CK10)
  - [ ] US-567: Explorer editor migration — walkthrough 30 §3 (EX1–EX10; secondary-only `EditorModel` — not in `editorRegistry`; second consumer of LK8 / LK9 hooks)
  - [ ] US-568: PDF editor migration — walkthrough 30 closure (no-host; first-principles investigation)
  - [ ] US-569: Image editor migration — walkthrough 30 closure (no-host; first-principles investigation)
  - [ ] US-570: Archive editor migration — walkthrough 30 closure (no-host + sidebar panel; first-principles investigation)
  - [ ] US-571: Video editor migration — walkthrough 30 closure (no-host; first-principles investigation)
  - [ ] US-572: Settings editor migration — walkthrough 30 closure (no-host; first-principles investigation)
  - [ ] US-573: About editor migration — walkthrough 30 closure (no-host; first-principles investigation)
  - [ ] US-574: MCP Inspector editor migration — walkthrough 30 closure (no-host; first-principles investigation)
  - [ ] US-575: Storybook editor migration — walkthrough 30 closure (no-host; first-principles investigation)
  - [ ] US-576: Category editor migration — walkthrough 30 closure (no-host; first-principles investigation)
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
  - [x] US-577: Decode percent-encoded `file://` paths in `will-navigate` (Cyrillic/Unicode filenames in Markdown links)
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
