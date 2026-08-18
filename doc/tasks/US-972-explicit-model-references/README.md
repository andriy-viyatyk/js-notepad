# US-972: React context -> explicit model references

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out
**Priority:** Medium
**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Started:** 2026-08-17

## Goal

Remove the five remaining `createContext` surfaces from `src/renderer`. Values that
currently travel through React context will instead travel through the owning editor or
UIKit model, or through explicit props when the value is configuration/data rather than
model state.

The task stays on React and preserves current rendering and fallback behavior. It does
not convert the `highlight()` helper's React output, subtree composition, or unrelated
local transient state.

## Background and measured surface

The current production scan finds exactly five context declarations:

| Context | Declaration | Current consumers | Replacement |
|---|---|---|---|
| Editor configuration | `editors/base/EditorConfigContext.tsx` | 6 editor bodies plus the embedded Monaco body | explicit `EditorConfig` prop on editor bodies and `NoteItemActiveEditor` |
| Log-view editor | `editors/log-view/LogViewContext.ts` | 7 log dialog/output views | `LogViewEditor` passed through `LogEntryWrapper` and `LogEntryContent` |
| AVGrid model | `uikit/AVGrid/useAVGridContext.ts` | `FilterPopover` and `OptionsFilterContent` | `AVGridModel` passed through their props |
| AVGrid filters | `uikit/AVGrid/filters/useFilters.tsx` | `FilterBar`, `HeaderCell`, `FilterPopover`, `OptionsFilterContent` | a component-owned `FiltersModel` passed to each consumer |
| Highlight text | `uikit/shared/highlight.ts` | `DataCell`, `LinkItemList`, `NoteItemView`, `ExpandedNoteView` | existing AVGrid/editor state passed directly |

There are 8 provider mount sites: 2 editor-config sites, 1 log-view site, 1 filter site,
3 highlight sites, and 1 AVGrid site that carries the AVGrid model provider. The model
provider and highlight provider are nested at that same AVGrid site. `useAVGridContext`
is internal to the AVGrid filter subtree; there are no external consumers of it. Likewise,
`FiltersProvider` and `useFilters` have one production owner (`editors/grid/GridBody`).

The existing code already establishes the intended direction: editor views receive an
`EditorModel`, AVGrid cell renderers receive an `AVGridModel`, and `LogEntryWrapper`
already receives the `LogViewEditor`. This task finishes those explicit ownership paths
instead of introducing a second ambient lookup mechanism.

## Implementation plan

### 1. Make editor configuration an explicit value

- Create a React-free `src/renderer/editors/base/EditorConfig.ts` containing the
  `EditorConfig` interface and an empty/default configuration value. Delete
  `EditorConfigContext.tsx`; remove `EditorConfigProvider` and `useEditorConfig` from
  `editors/base/index.ts`.
- Extend the `EditorModule.Body` contract in
  `src/renderer/editors/base/editorRegistry.ts` with an optional `editorConfig` prop.
  Standalone editor bodies receive the empty default; this keeps the existing module
  loading shape usable while allowing embedded views to carry their configuration.
- Update `EnvVarsBody`, `GridBody`, `MarkdownBody`, `SvgBody`, `HtmlBody`, and
  `MermaidBody` to read `editorConfig` from props. `EnvVarsBody` is a standalone body
  and has no embedded wrapper. Update the five `*EmbeddedBody` wrappers for Grid,
  Markdown, Svg, Html, and Mermaid in their matching `index.tsx` files to forward it.
- Update `NoteItemView.tsx` and `ExpandedNoteView.tsx` to construct the same two
  configuration objects currently supplied by their providers. Pass the value through
  `NoteItemActiveEditor.tsx` into `MiniTextEditor` and the asynchronously loaded
  embedded `Body`; do not put this per-embedding presentation configuration into the
  persisted editor state.
- Preserve all existing defaults and behavior: notebook note editors keep their max
  height, minimap, autofocus, compact/fill settings, and external highlight text;
  standalone editors continue to behave as if their config were `{}`.

### 2. Pass the LogViewEditor through the entry tree

- Delete `src/renderer/editors/log-view/LogViewContext.ts` and remove the provider
  wrapper from `LogBody.tsx`.
- Add `model: LogViewEditor` to `LogEntryContent` and pass the already available `vm`
  from `LogEntryWrapper`.
- Thread that model through `dispatchedView` into the seven current context consumers:
  `ButtonsDialogView`, `CheckboxesDialogView`, `ConfirmDialogView`,
  `GridOutputView`, `RadioboxesDialogView`, `SelectDialogView`, and
  `TextInputDialogView`. Replace each `useLogViewModel()` call with the prop.
- Keep the dispatcher entry narrowing and updater casts unchanged. Views that do not
  command the log editor continue to receive only their entry data.

### 3. Remove the AVGrid model context

- Delete `src/renderer/uikit/AVGrid/useAVGridContext.ts` and remove the
  `AVGridProvider` wrapper from `AVGrid.tsx`.
- Pass the live `AVGridModel` directly to `FilterPopover`, then through `FilterContent`
  and `OptionsFilterContent`. Replace `useAVGridContext()` with that prop.
- Preserve the existing model identity and filter option lookup behavior; the filter
  popover remains rendered inside the AVGrid view and still reads the same columns and
  rows from the same model.

### 4. Replace AVGrid filter context with a FiltersModel

- Extract the current filter controller behavior into a co-located
  `src/renderer/uikit/AVGrid/filters/FiltersModel.ts` (or an equivalent model file
  following the existing inline/co-located model convention). It owns the transient
  `poperData` state and exposes stable methods for showing, applying, closing, and
  updating filters. Its props hold `filters`, `setFilters`, and `onGetOptions`.
- Create one `FiltersModel` in `editors/grid/GridBody.tsx` with `useComponentModel` and
  pass it explicitly to `FilterBar`, `AVGrid`, and the AVGrid filter popover path.
  `AVGridProps`/`AVGridModel` should carry an optional filter-model reference so
  `HeaderCell` can invoke the controller without a context lookup.
- Update `FilterBar`, `HeaderCell`, `FilterPopover`, and `OptionsFilterContent` to use
  the passed model. Remove `FiltersProvider`, `useFilters`, and their barrel exports;
  no generic React render-prop or cloned-children bridge should be introduced.
- Preserve the current no-provider fallback for AVGrid instances that do not participate
  in the GridBody filter workflow. A module-level `NO_FILTERS` value should expose an
  empty filter list, no-op `setFilters`, no-op `showFilterPoper`, and an options callback
  returning `[]`. HeaderCell and FilterBar should resolve the optional model to this
  default in one place rather than duplicating null checks. Collapse the current two
  `useFilters()` reads in each of HeaderCell and FilterBar into one model/default read.
- Preserve local visual state such as a chip's open flag and FilterBar's frozen-row
  indicator. The new model owns filter workflow state, not DOM hover/open state that
  belongs to the view.
- Delete the unused filter-persistence path with the context: `configName`, the config
  key/version and date-regex helpers, `saveFiltersConfig`, `restoreFiltersConfig`, and
  `filtersConfigExists` have no callers and no active behavior to preserve. Keep
  `TOnGetFilterOptions` and its barrel exports because GridBody and the filter views use
  that type. Correct `TShowFilterPoper` to return `Promise<void>`; FilterBar awaits that
  promise to close its chip, and its existing `liveRef` guard must remain. Settle an
  active request during model disposal so the promise is not leaked after unmount.

### 5. Pass highlight text from its existing owners

- Keep `highlight()` in `uikit/shared/highlight.ts` as the rendering helper, but remove
  `HighlightedTextContext`, `HighlightedTextProvider`, and `useHighlightedText`.
- In `DataCell`, derive the same combined search/highlight string from
  `model.props.searchString` and `model.props.highlightString` that AVGrid currently
  places in the provider. This preserves highlighting for custom/default cells inside
  the grid.
- In `LinkBody`, pass `pageState.searchText` directly to `LinkItemList`; remove the
  provider and the hook from `LinkItemList`. `LinksList` already has an explicit
  `searchText` prop, so its rendering contract remains unchanged.
- Update the stale `components/file-search/FileSearch.tsx` comment that attributes the
  global `highlighted-text` class to `useHighlightedText`; the class remains, but the
  ambient hook does not.
- Add `searchText` to `NoteItemViewProps` and `ExpandedNoteView`'s props, pass
  `state.searchText` from `NotebookBody`, and replace their context reads. Keep the
  existing `NoteItemViewModel.searchText` assignment, but source it from the explicit
  prop so model helpers and rendered labels use the same value.
- Do not alter direct `highlight(text, searchText)` callers such as `TreeItem`,
  `ListItem`, `MultiListBox`, `LinksList`, or `GraphBody`.

### 6. Verify the context surface is gone

- Run the production scan for `createContext`, `useContext`, `.Provider`,
  `EditorConfigProvider`, `LogViewProvider`, `AVGridProvider`, `FiltersProvider`, and
  `HighlightedTextProvider` under `src/renderer`; no task-owned context declarations
  or provider/consumer APIs remain.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`. Smoke-test a normal
  grid with sorting/filter popovers, a log view with every dialog/output type, notebook
  note editors (Monaco and embedded editor modes), markdown/grid/image previews, link
  search highlighting, and AVGrid cell highlighting.
- No unit-test harness is introduced; this repository's typecheck, lint, and focused
  runtime smoke checks are the verification for this refactor.

## Concerns / Open questions

1. **Editor-body contract breadth.** Adding an optional `editorConfig` to the embedded
   body contract touches the editor registry and five module wrappers. It is preferable
   to mutating `EditorModel` because one editor model can be rendered in different
   embedding contexts, and the configuration is view-instance data rather than persisted
   editor state. Verify all five embedded modes receive `{}` when standalone.

2. **FiltersModel lifetime and popover promises.** The current context hides a promise
   resolver in `poperData`. The replacement must use the GridBody-owned model and resolve
   the active request on close/dispose. Do not create a queue per filter chip or leave a
   `showFilterPoper()` promise pending after the grid unmounts.

3. **AVGrid custom renderers and highlight scope.** The internal `HeaderCell` and filter
   components can use explicit model props, but arbitrary caller-supplied cell renderers
   already receive `TCellRendererProps.model`. The old highlight provider wrapped those
   renderers too, so removing it would be risky if an external renderer consumed
   `useHighlightedText`. The scan finds exactly four hook consumers -- DataCell,
   LinkItemList, NoteItemView, and ExpandedNoteView -- and none is caller-supplied, so
   the explicit highlight conversion is safe. Do not add a compatibility context for
   either value; the model/props are already the explicit APIs.

4. **Highlighting remains React-shaped.** `highlight()` still returns React nodes after
   this task. Removing only its ambient context is intentional: changing the helper's
   return type belongs with the later neutral rendering work, not with context ownership.

5. **Transient state boundary.** `FilterBar`'s `frozen` state, filter-chip open state, and
   popover resize state are view/DOM interaction state and remain local. They are not
   omissions from the model conversion and should not be folded into `FiltersModel`.

6. **External API compatibility.** The context exports are internal in this repository;
   the scan finds no consumers outside the five owned surfaces. Removing the provider and
   hook exports is therefore intentional. If a future external package needs filters, it
   should receive a `FiltersModel` or explicit callbacks rather than regain a React
   context.

## Acceptance criteria

- [ ] `createContext` and `useContext` are absent from `src/renderer`, and the five
      task-owned provider APIs are removed.
- [ ] Editor configuration reaches standalone and embedded editor bodies through an
      explicit prop with the same defaults and notebook overrides as today.
- [ ] All seven LogView context consumers receive the same `LogViewEditor` instance
      through props and every dialog/output action still resolves or updates the log.
- [ ] AVGrid filters use one GridBody-owned `FiltersModel`; sorting, filter chips,
      options popovers, and close behavior remain unchanged. The dead persistence path
      is deleted, and `TOnGetFilterOptions` remains exported.
- [ ] Every AVGrid instance without a `FiltersModel` behaves exactly as it does today:
      empty filters, inert filter controls, and an options callback returning `[]`.
      At least one non-GridBody AVGrid instance is smoke-tested.
- [ ] AVGrid, link-list, and notebook highlighting still use the same effective search
      text, with no provider or hook lookup.
- [ ] No new generic slot callback, cloned-children bridge, or alternate React context
      is introduced.
- [ ] `npm run typecheck`, `npm run lint`, `git diff --check`, and the focused smoke
      checks in the verification plan pass.

## Related work

- [EPIC-051: De-React Epic P](../../epics/EPIC-051.md)
- [US-970: Lift local `useState` into models](../US-970-lift-state-models/README.md)
- [US-971: Imperative handles -> model methods / `ComponentQueue`](../US-971-imperative-handles/README.md)
- [US-974: Move logic from `useEffect` into `TComponentModel.effect()`](../../epics/EPIC-051.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
- [State management](../../architecture/state-management.md)
