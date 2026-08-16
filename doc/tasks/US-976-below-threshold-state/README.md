# US-976: Below-threshold local state

## Status

**Status:** Implemented — smoke-tested, pending epic review
**Priority:** Medium
**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Depends on:** [US-970: Lift local `useState` into models](../US-970-lift-state-models/README.md)
**Created:** 2026-08-16

## Goal

Move the explicitly selected below-threshold local state that represents durable data, forms,
selections, async results, or durable interaction modes into existing or co-located models. State
below the model threshold is otherwise retained by policy, so this task is a finite conversion list
rather than a sweep of every residual hook.

## Background

The pinned scan is:

```text
rg -n --glob '*.tsx' --glob '!*.story.tsx' 'useState<|useState\(' src/renderer
```

After US-970, the residual is **126 declarations across 79 files**. The four declarations retained
by US-970 are already ledgered there and are not US-976 candidates:

| File | Retained declarations | Reason |
|---|---|---|
| `editors/graph/GraphLegendPanel.tsx` | `hovered`, `focusWithin` | D7 visual state |
| `editors/graph/GraphBody.tsx` | `toolbarHovered`, `toolbarFocusWithin` | D7 visual state |

The exclusive residual bands are:

| Declarations per file | Files | Declarations | Share of task |
|---:|---:|---:|---:|
| `3` | 13 | 39 | 31% |
| `2` | 21 | 42 | 33% |
| `1` | 45 | 45 | 36% |
| **Total** | **79** | **126** | |

The 45 single-state files are retained by policy unless explicitly listed below. Most contain
hover, open, copied-flag, measurement, or lifecycle state and are not an implicit work list.

D7 allows visual hover/focus, uncontrolled open, and gesture anchors. D8 leaves DOM measurement,
DOM lifecycle, and DOM mutation in views. `useOptionalState` in
`src/renderer/core/state/state.ts`, `TruncatedText` overflow state, non-TSX cache hooks,
`SecondaryViews.setHeaderRefsVersion`, and the four US-970 declarations are explicit exclusions.
The grid visible-row repaint counters are handed to US-971.

## Implementation plan

### 1. Convert the named model-owned files

Convert these nine three-state files:

- `src/renderer/editors/about/AboutView.tsx`: `runtimeVersions`, `updateResult`, `checking`
  (async result and in-flight state).
- `src/renderer/editors/git-tree/CommitDiffPanel.tsx`: `changes`, `selectedFile`, `diff`
  (loaded data, selection, and derived content).
- `src/renderer/editors/rest-client/ResponseViewer.tsx`: `activeTab`, `languageOverride`,
  `headersView` (durable response view mode).
- `src/renderer/editors/rest-client/RequestBuilder.tsx`: `bodyHeight`, `headersView`,
  `headersJson` (persisted layout choice, view mode, and JSON draft; retain only genuine DOM
  measurement if implementation proves one exists).
- `src/renderer/ui/dialogs/PasswordDialog.tsx`: `password`, `confirm`, `error` (form and
  validation state).
- `src/renderer/ui/dialogs/LibrarySetupDialog.tsx`: `folderPath`, `copyExamples`, `linking`
  (form and async state).
- `src/renderer/editors/graph/GraphExpansionSettings.tsx`: `rootNode`, `expandDepthStr`,
  `maxVisibleStr` (props-seeded form state; guard identity because props are synced during render).
- `src/renderer/editors/git-tree/GitChangesView.tsx`: `selUnstaged`, `selStaged` (selection);
  retain `bottomHeight` as splitter/measurement state.
- `src/renderer/components/file-list/FileList.tsx`: `searchText`, `searchVisible`, `activeIndex`
  (durable search interaction protocol).

Convert these two-state candidates where the listed fields are model-owned:

- `src/renderer/components/file-grid/FileGrid.tsx`: `columns`, `focus`.
- `src/renderer/components/git-tree/GitTree.tsx`: `columns`, `focus`.
- `src/renderer/editors/category/CategoryEditor.tsx`: `viewMode`; retain `searchPortal` as a DOM
  lifecycle/portal target.
- `src/renderer/editors/git-tree/GitTreeEditorView.tsx`: `selectedHash`; retain `containerH` as
  DOM measurement.
- `src/renderer/editors/log-view/items/MermaidOutputView.tsx`: `svgUrl`, `error` (async render
  result and error).
- `src/renderer/editors/settings/sections/SettingsSections.tsx`: `probe`, `portValue` (async
  probe result and controlled settings draft).
- `src/renderer/editors/tools-hub/SearchBoardsTab.tsx`: `query`, `refreshing` (durable search
  input and async state).
- `src/renderer/ui/secondary-views/LazySecondaryView.tsx`: `Component`, `error` (async module
  loading result).
- `src/renderer/ui/sidebar/OpenTabsList.tsx`: `allWindowsPages`, `activeIndex` (async shell data
  and list interaction state).

Use existing owners before introducing a model. For a new model, keep it inline in the `.tsx` when
it is under roughly 60 lines and used by one component in that file; use a separate `*Model.ts`
when it is larger or shared. Preserve AVGrid `columns`/`focus` setter-shaped contracts with
adapters; `CellFocus` is plain serializable data, while column definitions must not be mutated in
place after model state becomes frozen.

### 2. Retain named D7/D8 and handle-mirror state

Retain these complete files without individual conversion entries:

- `editors/notebook/NoteItemView.tsx`: focus, hover, and drag gesture state.
- `editors/browser/BrowserTabsPanel.tsx`: drag gesture state.
- `editors/link-editor/LinksTiles.tsx`: drag state, image-load failure, and measured grid size.

Retain these two-state candidates for the named reason:

- `GraphTooltip.tsx`: position measurement and copied feedback.
- `LinksList.tsx`: drag feedback and grid-width measurement.
- `PinnedLinksPanel.tsx`: drag feedback.
- `AudioVisualizer.tsx`: media-element metadata mirror and page-visibility lifecycle.
- `FolderItem.tsx`, `PinnedRail.tsx`, `HeaderCell.tsx`: drag feedback.
- `Tooltip.tsx`: uncontrolled tooltip lifecycle and stable registry id.
- `FilterBar.tsx`: popover lifecycle plus AVGrid rows-frozen repaint mirror; any shared grid
  observable belongs with US-971.

The `GraphBody.tsx` and `GraphLegendPanel.tsx` two-state entries are the four D7 declarations
already ledgered by US-970, not this task's work. `AudioControls.tsx` is retained as a
media-element imperative-state mirror (`currentTime`, `duration`, `muted`); the durable value
lives on the `<audio>` handle.

### 3. Apply ownership rules during conversion

For every named candidate:

- put drafts, data, selections, async results, and durable interaction state in the owning model;
- keep measured geometry, DOM refs, third-party handles, hover/focus, uncontrolled open, and gesture
  lifecycle local under D7/D8;
- use identity guards for prop-to-state seeding because `useComponentModel.setPropsInternal` runs
  during render;
- use field selectors and `model.memo()` for derived values. Selectors return stored values rather
  than fresh derived arrays;
- use plain arrays/records or immutable replacement for model state. Do not mutate `Set` drafts
  without an approved `enableMapSet()` decision.

### 4. Coordinate cross-task boundaries

- The two grid repaint counters belong with US-971's AVGrid visible-row observable/imperative-handle
  work; do not replace them with generic revision state here.
- Context/state ownership discovered in this sweep belongs to US-972, and effect relocation belongs
  to US-974. Keep this task focused on state ownership and model methods.
- Do not convert editor React props, subtree slots, portals, or add a generic callback protocol.

### 5. Verify the bounded handoff

- Run the pinned scan and reconcile it to 126 declarations / 79 files. Confirm the four US-970 D7
  declarations are excluded from this task.
- Confirm every named conversion entry is converted or has a specific recorded exception. Files
  below the model threshold and not on the list are retained by policy.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Smoke-check representative list/grid/sidebar/dialog/editor interactions and async cleanup.
- Do not add unit tests; the project has no unit-test harness.

## Concerns / Open questions

### Retention is the default below the threshold

The named conversion list is the burden of proof. A short presentational component with one local
hook is not opened merely to produce a ledger entry; D7/D8 and the policy above explain retention.

### Cross-task overlap needs explicit ownership

US-971 owns imperative handles and the grid visible-row binding; US-972 owns context; US-974 owns
general effect relocation. If a state move exposes one of those boundaries, record the handoff and
avoid duplicating infrastructure.

### Model placement

Follow the inline-vs-separate convention in step 1 so small one-component models do not create
unnecessary files while shared or larger models remain independently reusable.

### State containers must remain Immer-safe

Use plain arrays/records or immutable replacement for model state. Verify column/row helpers do not
mutate auto-frozen values in place, especially for the FileGrid and GitTree AVGrid adapters.

## Acceptance criteria

- [x] The pinned scan reconciles to 126 declarations / 79 files; the four D7 declarations retained
      by US-970 in `GraphLegendPanel.tsx` and `GraphBody.tsx` are excluded as US-970 ledger entries.
- [x] Every file on the named conversion list is converted or has a recorded reason it was not;
      files below the model threshold and not on that list are retained by policy and need no
      individual ledger entry.
- [x] Model-owned below-threshold state is moved into existing/co-located models without changing
      public behavior or controlled component contracts.
- [x] D7/D8 state is retained by policy; no DOM refs or third-party handles are put into
      serializable business state.
- [x] Grid counters, context, and effect work are handed to US-971/972/974 rather than duplicated.
- [x] Field-level selectors, model memos, prop identity guards, and Immer-safe updates are used.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; smoke checks show no
      regression and no tests are added.

## Related

- [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
- [US-970: Lift local `useState` into models](../US-970-lift-state-models/README.md)
- [US-971: Imperative handles -> model methods / `ComponentQueue`](../../epics/EPIC-051.md)
- [De-React roadmap](../../de-react.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
