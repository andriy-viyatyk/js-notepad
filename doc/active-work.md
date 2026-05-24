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
  - [ ] [US-564: Graph editor migration](tasks/US-564-graph-editor-migration/README.md) — *(investigation complete 2026-05-22, ready for implementation)* SKIPPED in design — first-principles investigation done. Tier-5 native v4 `GraphEditor` over `TextFileModel` host. Six owned submodels (renderer, dataModel, visibilityModel, groupModel, connectivityModel, searchModel) relocated byte-for-byte from legacy `GraphViewModel`. Fourteen concerns GR1–GR14 resolved up front. GR1 preserves `GraphView.tsx` + `GraphViewModel.ts` + 6 submodels for notebook embedding (US-554/US-560/US-561/US-562 retrospective). GR2 canvas-ref bridge (mirror SV2/MR2). GR3 view-attached editor fields (`onDoubleClickNode`, `isPopupOpen`, `onHighlightSelection`) kept as instance fields. GR4 introduces HS1-mirrored `groupingEnabled` (UX upgrade — persists across switches AND restarts; default `true`). GR7 preserves `skipNextContentUpdate` serialization round-trip guard verbatim. GR9 splits chrome: in-canvas overlay toolbar stays in body, page-top toolbar + footer move to `<TextChrome rightToolbarContributions / footerContributions>`. Sub-panel prop rename (`vm` → `editor` with narrow structural interface so legacy view path keeps working). One-line edit to preserved `GraphView.tsx` to match new sub-panel prop name.
  - [ ] [US-565: Draw editor migration](tasks/US-565-draw-editor-migration/README.md) — *(investigation complete 2026-05-23, ready for implementation)* SKIPPED in design — first-principles investigation done. Tier-5 native v4 `DrawEditor` over `TextFileModel` host. Closest sibling structurally is Mermaid (US-562) — one bounded boolean HS1 + view-derived state stripped + slice-subscribe content trigger; the new piece is the bidirectional Excalidraw payload loop (`updateFromExcalidraw` + `_skipNextContentUpdate` + fingerprint). Sixteen concerns DR1–DR16 resolved up front. DR1 preserves `DrawView.tsx` + `DrawViewModel.ts` for notebook embedding (US-554/US-560/US-561/US-562/US-564 retrospective). DR3 keeps `_excalidrawApi` instance field on the editor (mirror of GR3). DR4 introduces HS1-mirrored `darkMode` (UX upgrade — persists across switches AND restarts; default `isCurrentThemeDark()`). DR7 preserves `skipNextContentUpdate` round-trip guard verbatim. DR9 collapses all five page-portal toolbar buttons into `<TextChrome rightToolbarContributions>`; no in-canvas overlay toolbar (Excalidraw provides its own UI). DR15 documents the one behavior change: the theme-sync `useEffect` is REMOVED — once a user toggles darkMode, it persists across theme changes (matches HS1 contract; aligns with Mermaid). Library persistence + browser-URL listener stay view-local (DR15). Three new files (`DrawEditor.ts` ~180 LOC, `DrawBody.tsx` ~150 LOC, `index.tsx` ~280 LOC), four modified, one deleted (`index.ts`).
  - *Sidebar / structured editors — one task each*
  - [ ] [US-555: Link editor migration](tasks/US-555-link-editor-migration/README.md) — *(investigation complete 2026-05-23, ready for implementation)* walkthrough 24 (LK1–LK10 resolved in design; LK11–LK16 retrospective added during investigation). First sidebar-owning Tier-5 editor in v4: `beforeNavigateAway` (LK7) + `onMainEditorChanged` (LK8) first text-bearing exercises. Three duck-typed `(m as any)` writes retire under LK9. LK11 — today's `LinkEditor.tsx` renames to `LinkView.tsx` (preserved for browser-embed: BlankPageLinks + BookmarksDrawer + future notebook-embed). LK12 — `LinkTreeProvider` constructor accepts new `ILinkSource` structural interface so legacy `LinkViewModel` and v4 `LinkEditor` both build providers. LK13 — `LinkSource = LinkViewModel | LinkEditor` union type for panel props. LK14 — `wrapLegacyForPage` gains `link-view` branch mirroring graph-view / draw-view. LK15 — registry mirror loop cleanup. LK16 — `page.asLink` flips to v4 `instanceof` (legacy `acquireViewModel` machinery stays alive for BrowserBookmarks). Three new files (`LinkEditor.ts` ~400 LOC, `LinkBody.tsx` ~250 LOC, `index.tsx` ~150 LOC); 19 modified; one rename (`LinkEditor.tsx` → `LinkView.tsx`).
  - [ ] [US-556: Todo editor migration](tasks/US-556-todo-editor-migration/README.md) — *(investigation complete 2026-05-23, ready for implementation)* walkthrough 25 (TD1–TD10 RESOLVED in design; TD11–TD17 retrospective added during investigation). **First non-sidebar-owning Tier-5 v4 editor since Draw** — no `beforeNavigateAway` / `onMainEditorChanged` (TD6); no secondary-editor registrations; no TreeProvider; no duck-typed reads to retire. Override count: 9 (vs Link's 11). TD3 folds 3 fields into HS1 host slot (`leftPanelWidth` / `selectedList` / `selectedTag`) — **fifth instance** of the cache-file → HS1 pattern. Retrospective TD11 renames `TodoEditor.tsx` → `TodoView.tsx` (preserved for future notebook-embed). TD12 preserves `TodoViewModel.ts` byte-for-byte. TD13 introduces `TodoSource = TodoViewModel | TodoEditor` union for `TodoListPanel` + `TodoItemView` prop typing. TD14 — `wrapLegacyForPage` `todo-view` branch mirrors link-view / draw-view. TD15 — registry mirror cleanup + native v4 register. TD16 — `page.asTodo` facade flip to v4 `instanceof`. TD17 — `rightToolbarContributions` for search input + `footerContributions` for item count. Three new files (`TodoEditor.ts` ~400 LOC, `TodoBody.tsx` ~200 LOC, `index.tsx` ~100 LOC); 7 modified; one rename (`TodoEditor.tsx` → `TodoView.tsx`).
  - [ ] [US-563: Rest Client editor migration](tasks/US-563-rest-client-editor-migration/README.md) — *(investigation complete 2026-05-24, ready for implementation)* walkthrough 26 (RC1–RC10 RESOLVED in design; RC11–RC18 retrospective added during investigation). **Ninth Tier-5 text-bearing editor**; fourth non-sidebar-owning (after Grid, Log View, Todo). RC3 folds 2 fields into HS1 host slot (`leftPanelWidth` / `selectedRequestId`) — **sixth instance** of cache-file → HS1 pattern. RC7 keeps response cache as separate `<host.id>:rest-client-responses` per-editor cache file — **first instance** of split-cache-by-scale pattern. RC10 / RC16 — **NO scripting facade** (Rest Client stays the only text-bearing Tier-5 without one). RC17 — **NO TextChrome toolbar/footer contributions** (per-request toolbar inline in SplitDetailPanel). RC18 — fire-and-forget `restoreResponseCache()` inside `adoptHost` so both descriptor-replay and `wrapLegacyForPage` paths hit it. Retrospective RC11 renames `RestClientEditor.tsx` → `RestClientView.tsx`; RC12 preserves `RestClientViewModel.ts`; RC13 `RestClientSource = RestClientViewModel | RestClientEditor` union for `RequestTree` / `SplitDetailPanel` / `RequestBuilder` props (KeyValueEditor + ResponseViewer have no VM coupling); RC14 `wrapLegacyForPage` `rest-client` branch mirrors todo-view; RC15 registry mirror cleanup + native v4 register. Phase 5b extracts `RequestTree` + `SplitDetailPanel` into `RestClientShared.tsx` so legacy view + v4 body BOTH consume them without ~600 LOC duplication. Four new files (`RestClientEditor.ts` ~600 LOC, `RestClientBody.tsx` ~150 LOC, `RestClientShared.tsx` ~600 LOC extracted, `index.tsx` ~50 LOC); 4 modified; 1 rename (`RestClientEditor.tsx` → `RestClientView.tsx`); 1 preserved (`RestClientViewModel.ts`).
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
