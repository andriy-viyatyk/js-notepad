# US-595: Rename `secondaryEditor`→`secondaryView` + `PageNavigator`→`SecondaryViews` family

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 1a · **Status:** ✅ Implemented (2026-06-01) — `tsc` + `eslint` clean; pending manual smoke test.

## Goal

A purely **mechanical, codebase-wide rename** to remove the "editor" misnomer for navigator panels (a panel is a *view* over an `EditorModel`, not an editor) and rename the host component family. Two vocabularies change together:

1. `secondaryEditor` → `secondaryView` (state field, base getter/setter, registry, props, all editor models, `PageModel` reads). **Includes the persisted `IEditorState` field** (Concern 7 → reset-to-default, no read-shim).
2. The `PageNavigator` family → `SecondaryViews` (component, model, field, event, mount wrappers, folder, doc) per EPIC-029 Concern 8.

**No behavior change.** Persephone must compile and run, and every editor type must still open / edit / persist, after this task. Layout/decoupling work (controlled component, `ISecondaryViewsState` unification, `IPageHost`) is explicitly **out of scope** — that's US-596 / US-597.

## Background

### What the system does today (verified)

- **State declaration.** An editor declares its panels by setting `this.secondaryEditor = ["archive-tree"]` (a pure state mutation, `EditorModel.ts:145`). `IEditorState.secondaryEditor?: string[]` (`src/shared/types.ts:25`) is the **persisted** field; the values are **panel IDs** (registry keys), not symbol names.
- **Observation.** `PageModel.attach()` selector-subscribes to each editor's `secondaryEditor` slice (`PageModel.ts:195`) and re-derives `panelEditors` (`PageModel.ts:147`, `editors.filter(e => e.contributesPanels())`).
- **Rendering.** `PageNavigator.tsx` reads `page.panelEditors` + `page.activePanel`, renders a `CollapsiblePanelStack`, and for each panel ID looks it up in `secondaryEditorRegistry` and renders `LazySecondaryEditor` with `{ model, headerRef }`. The view portals its own header into `headerRef`.
- **Layout state.** `PageNavigatorModel` (`{open, width}`) is lazy-created via `PageModel.ensurePageNavigatorModel()`; toggling fires the `pageNavigatorToggled` event.
- **Mount.** `Pages.tsx` `NavigationWrapper`/`NavigationContent` place `<PageNavigator page={page} />` + splitter.

### Naming decisions (locked by the epic)

| Today | After US-595 |
|---|---|
| `IEditorState.secondaryEditor` (persisted) | `secondaryView` |
| `EditorModel.secondaryEditor` getter/setter | `secondaryView` |
| `secondaryEditorRegistry` / `SecondaryEditorRegistry` | `secondaryViewRegistry` / `SecondaryViewRegistry` |
| `SecondaryEditorProps` / `SecondaryEditorDefinition` | `SecondaryViewProps` / `SecondaryViewDefinition` |
| `secondary-editor-registry.ts` (file) | `secondary-view-registry.ts` |
| `LazySecondaryEditor` (component + `LazySecondaryEditor.tsx`) | `LazySecondaryView` / `LazySecondaryView.tsx` |
| `*SecondaryEditor.tsx` panel components (6 files) | `*SecondaryView.tsx` (see Concern A) |
| `PageNavigator` (component + `PageNavigator.tsx`) | `SecondaryViews` / `SecondaryViews.tsx` |
| `PageNavigatorModel` / `PageNavigatorState` / `PageNavigatorModel.ts` | `SecondaryViewsModel` / `SecondaryViewsState` / `SecondaryViewsModel.ts` |
| `pageNavigatorModel` (field on `PageModel`) | `secondaryViewsModel` |
| `ensurePageNavigatorModel()` | `ensureSecondaryViewsModel()` |
| `pageNavigatorToggled` / `PageNavigatorEvent` (event) | `secondaryViewsToggled` / `SecondaryViewsEvent` |
| `NavigationWrapper` / `NavigationContent` (`Pages.tsx`) | `SecondaryViewsWrapper` / `SecondaryViewsContent` |
| folder `src/renderer/ui/navigation/` | `src/renderer/ui/secondary-views/` |
| doc `architecture/secondary-editors.md` | `secondary-views.md` |

### NOT renamed (deliberately)

- **Panel string IDs** — `"archive-tree"`, `"explorer"`, `"search"`, link panel IDs (`registry.register({ id: ... })` in `register-editors.ts`, the `activePanel = "explorer"` default, persisted `secondaryView` array values). These are runtime/persisted identifiers; renaming them would break the benign reset-to-default and require its own migration. Leave untouched.
- **`panelExpanded` / `PanelExpandedEvent`** — panel-centric, not "secondary editor"; the symbol stays. Only update its doc comment ("secondary editor panel" → "secondary view panel").
- **`SecondaryViewsState` `activePanel` unification + `I`-prefix** — that's US-596. US-595 keeps the interface at `{open, width}` and names it `SecondaryViewsState` (no `I` prefix, matching today's `PageNavigatorState`).

## Implementation Plan

> Order: do all in-place symbol renames first (Steps 1–6), then the file/folder moves with `git mv` + import fixups (Step 7), then docs (Step 8). Run `npm run lint` + `tsc` at the end. Intermediate compile breakage during the rename is expected; only the final state must compile.

### Step 1 — Persisted field + base model (`secondaryEditor` → `secondaryView`)

- `src/shared/types.ts:25` — `secondaryEditor?: string[]` → `secondaryView?: string[]`. Update the JSDoc ("Active secondary **view** panel IDs…").
- `src/renderer/editors/base/EditorModel.ts` — rename the getter/setter (`:141`, `:145`), the `beforeNavigateAway` body (`:123` `this.secondaryEditor = undefined` → `this.secondaryView = undefined`), `contributesPanels()` read (`:151`), and surrounding comments (`:117`, `:121`, `:139`, `:149`).

### Step 2 — All editor models that read/write the field

Mechanical `secondaryEditor` → `secondaryView` in each. The common pattern is three sites per editor — default state, `getDescriptor` map, `applyRestoreData` read (e.g. `MonacoEditor.ts:40,191,201`) — plus an occasional comment:

`ArchiveEditor.ts` (6), `ExplorerEditorModel.ts` (8), `LinkEditor.ts` (10), `register-editors.ts` (state refs), `TodoEditor.ts`, `TextEditorModel.ts`, `SvgEditor.ts`, `RestClientEditor.ts` + `restClientTypes.ts`, `NotebookEditor.ts`, `MonacoEditor.ts`, `MermaidEditor.ts`, `MarkdownEditor.ts`, `LogViewEditor.ts`, `HtmlEditor.ts`, `GridEditor.ts`, `GraphEditor.ts`, `DrawEditor.ts`, `CategoryEditor.tsx`, `BrowserEditor.ts`.

### Step 3 — `PageModel` field reads + the navigator-model surface

`src/renderer/api/pages/PageModel.ts`:
- `secondaryEditor` slice reads → `secondaryView` (`:147`, `:195`, `:221`, `:405`, `:415`) + comments (`:24`, `:183`, `:281`, `:381`).
- `pageNavigatorModel` field (`:76`) → `secondaryViewsModel`; `ensurePageNavigatorModel()` (`:431`) → `ensureSecondaryViewsModel()`; all internal uses (`:176`, `:432`–`:478`, `:516`–`:562`); import of `PageNavigatorModel` (`:5`) → `SecondaryViewsModel` (path updated in Step 7).
- `pageNavigatorToggled` import/usage (`:8`, `:472`) → `secondaryViewsToggled`.
- `PagesLifecycleModel.ts` (1) + `PagesPersistenceModel.ts` (1) — same field/method references.

### Step 4 — Callers of `ensurePageNavigatorModel`

- `src/renderer/editors/text/ScriptPanel.tsx:326` and `TextFileActionsModel.ts:41` → `ensureSecondaryViewsModel()`. (Confirmed these are `PageModel` calls, not the scripting `page` global.)

### Step 5 — Registry, lazy loader, navigator component, model, event

- `secondary-editor-registry.ts` — `SecondaryEditorProps`→`SecondaryViewProps`, `SecondaryEditorDefinition`→`SecondaryViewDefinition`, `SecondaryEditorRegistry`→`SecondaryViewRegistry`, `secondaryEditorRegistry`→`secondaryViewRegistry`, comment `IEditorState.secondaryEditor`→`secondaryView`.
- `LazySecondaryEditor.tsx` — component + props type → `LazySecondaryView`; import updates.
- `PageNavigator.tsx` — component `PageNavigator`→`SecondaryViews`; the inline state read `(model.state.get() as { secondaryEditor?: string[] }).secondaryEditor` (`:59`) → `secondaryView`; `name="page-navigator-root"`/`"page-navigator-stack"` may stay or become `secondary-views-*` (cosmetic — update for consistency).
- `PageNavigatorModel.ts` — class `PageNavigatorModel`→`SecondaryViewsModel`, interface `PageNavigatorState`→`SecondaryViewsState`, JSDoc.
- `src/renderer/core/state/events.ts` — `PageNavigatorEvent`→`SecondaryViewsEvent`, `pageNavigatorToggled`→`secondaryViewsToggled`; update the `panelExpanded` comment wording only.

### Step 6 — The 6 secondary-view panel components + their consumers + mount

- Inside each panel component, rename `SecondaryEditorProps` import → `SecondaryViewProps`. Files: `explorer/ExplorerSecondaryEditor.tsx`, `explorer/SearchSecondaryEditor.tsx`, `archive/ArchiveSecondaryEditor.tsx`, `link-editor/panels/LinkCategorySecondaryEditor.tsx`, `link-editor/panels/LinkTagsSecondaryEditor.tsx`, `link-editor/panels/LinkHostnamesSecondaryEditor.tsx`.
- `LinkBody.tsx` / `LinkEditor.ts` — `pageNavigatorToggled` subscription → `secondaryViewsToggled` (behavior unchanged, per Concern 1 note).
- `Pages.tsx` — `PageNavigator` import → `SecondaryViews`; `NavigationWrapper`/`NavigationContent` → `SecondaryViewsWrapper`/`SecondaryViewsContent`; `ensurePageNavigatorModel()` → `ensureSecondaryViewsModel()`.

### Step 7 — File + folder moves (use `git mv` to preserve history)

- `git mv src/renderer/ui/navigation src/renderer/ui/secondary-views`
- Within it: `PageNavigator.tsx`→`SecondaryViews.tsx`, `PageNavigatorModel.ts`→`SecondaryViewsModel.ts`, `secondary-editor-registry.ts`→`secondary-view-registry.ts`, `LazySecondaryEditor.tsx`→`LazySecondaryView.tsx`.
- **Concern A (decide first):** 6 panel components `*SecondaryEditor.tsx`→`*SecondaryView.tsx` (and update the `import()` paths in `register-editors.ts:12–42`).
- Fix every import path: `ui/navigation/*` → `ui/secondary-views/*` across the importers (PageModel, Pages.tsx, register-editors, ScriptPanel, etc.). Relative depth is unchanged (`../../editors/base` etc. stay valid), only the segment `navigation`→`secondary-views` and the basenames change.

### Step 8 — Documentation (current docs only)

- Rename `doc/architecture/secondary-editors.md` → `secondary-views.md`; update its content vocabulary.
- Update references to it + the old names in: `CLAUDE.md` (Documentation Map row, Key Files "Secondary editor registry" row + path, folder mentions), `doc/architecture/folder-structure.md`, `pages-architecture.md`, `editors.md`, `standards/editor-guide.md`, `diagrams/6-page-architecture.mmd`.

## Concerns / Open Questions

### Concern A — Rename the 6 panel component files? **✅ DECIDED (2026-06-01): YES.**
Rename `*SecondaryEditor.tsx` → `*SecondaryView.tsx` (6 `git mv` + 6 `import()` path edits in `register-editors.ts`) for full vocabulary consistency. This is part of Step 7.

### Concern B — Historical epic docs & completed.md: **do NOT touch.**
`EPIC-016/017/018/019/023.md`, `EPIC-028.md`, `epics/completed.md`, `tasks/completed.md` contain ~120 hits but are **historical records** describing past work under the then-current names. Editing them would falsify the record. Leave them. Only **current** architecture/standards docs (Step 8) are updated.

### Concern C — Generated graphs: **✅ DECIDED (2026-06-01): leave out of scope.**
`doc/visualization/Modules.fg.json` + `Components.fg.json` (~200 hits) are build artifacts from the dependency-graph script — never hand-edited. They stay out of this task; a stale node label is harmless and self-corrects on the next graph regeneration.

### Concern D — Persisted-key reset-to-default (already decided, verify benign).
After rename, `getDescriptor` writes the new `secondaryView` key; old persisted files (`openFiles*.json`) carry `secondaryEditor`, so on load `data.secondaryView` is `undefined` → the editor re-derives its panels. Verified benign for the editors that need panels: `ArchiveEditor` re-sets `["archive-tree"]` in `restore()` when a tree provider exists (`ArchiveEditor.ts:86–87`); Explorer always owns the explorer panel; Link re-derives. The stale `secondaryEditor` key disappears on next save. No read-shim. (EPIC-029 Concern 7.)

### Concern E — `SecondaryViewsState` interim shape.
US-595 keeps it `{open, width}` (today's `PageNavigatorState`). US-596 is what unifies it into `ISecondaryViewsState {open, width, activePanel}` and makes the component controlled. Do **not** add `activePanel` or the `I` prefix here, to keep US-595 a no-behavior-change rename.

## Acceptance Criteria

- [ ] `npm run lint` and the TypeScript build pass with zero errors.
- [ ] Repo-wide grep for `secondaryEditor`, `PageNavigator`, `pageNavigator`, `ensurePageNavigatorModel`, `pageNavigatorToggled`, `NavigationWrapper`, `NavigationContent`, `SecondaryEditorProps`, `secondaryEditorRegistry`, `LazySecondaryEditor`, `ui/navigation` returns **zero hits in `src/`** (matches allowed only in historical epic docs + generated graphs per Concerns B/C).
- [ ] App launches; opening Explorer, Archive (with a `.zip`), and a Link editor shows their sidebar panels as before.
- [ ] Toggling the sidebar, resizing it, and expanding/collapsing panels behave identically.
- [ ] Closing and reopening the app: panels for Explorer/Archive/Link re-appear (reset-to-default path), no console errors about an "Unknown secondary view".
- [ ] `git mv` used for all file/folder moves (history preserved).

## Files Changed (summary)

| Area | Files | Change |
|---|---|---|
| Persisted type | `src/shared/types.ts` | field rename |
| Base model | `editors/base/EditorModel.ts` | getter/setter/hook/comments |
| Editor models | ~19 editor `*.ts/.tsx` + `register-editors.ts` + `restClientTypes.ts` | field refs |
| Page model | `api/pages/PageModel.ts`, `PagesLifecycleModel.ts`, `PagesPersistenceModel.ts` | field + model-method renames |
| Navigator → SecondaryViews | `ui/navigation/` → `ui/secondary-views/` (4 files renamed) | component/model/registry/lazy |
| Panel components | 6 `*SecondaryEditor.tsx` (Concern A) | props type (+ optional file rename) |
| Event | `core/state/events.ts` | event + type rename |
| Mount + callers | `ui/app/Pages.tsx`, `text/ScriptPanel.tsx`, `text/TextFileActionsModel.ts`, `link-editor/LinkBody.tsx`, `link-editor/LinkEditor.ts` | imports/usages |
| Current docs | `secondary-editors.md`→`secondary-views.md`, `CLAUDE.md`, `folder-structure.md`, `pages-architecture.md`, `editors.md`, `editor-guide.md`, `6-page-architecture.mmd` | references |

**No change:** `src/renderer/api/types/*.d.ts` & `assets/editor-types/` (field not exposed to scripting); panel string IDs; `panelExpanded` symbol; historical epic docs (Concern B); generated graphs (Concern C).
