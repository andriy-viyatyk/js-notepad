# US-1256 — Adopt av-grid 2.6.1

**Status:** Done · **Priority:** High · **Epic:** none

## Progress

- [x] Dependency metadata updated and postinstall patches verified
- [x] DataGrid facade exports and callback classification updated
- [x] Grid Editor single-sort declaration adapted
- [x] Requested typecheck, lint, and production build gates pass
- [x] Manual grid smoke checks completed or recorded as unavailable

Manual Electron/grid smoke checks are unavailable in this non-interactive agent environment.

## Goal

Upgrade Persephone's pinned `av-grid` dependency from `2.3.0` to `2.6.1`, update the
DataGrid facade and selected consumer types to reflect the new declaration where useful, and
verify that every grid-backed view remains correct. The upgrade must deliver av-grid 2.6.1's
retained-cell loan-ledger fix, which prevents cells from superseded recomputes remaining visible
indefinitely.

## Background

### Persephone's boundary and current consumers

`package.json:57` pins `"av-grid": "2.3.0"`; `package-lock.json` records the same version and
its npm tarball. The dependency is imported directly in exactly four facade files:

- `src/renderer/uikit/DataGrid/index.ts`
- `src/renderer/uikit/DataGrid/types.ts`
- `src/renderer/uikit/DataGrid/cell-tooltip.ts`
- `src/renderer/uikit/DataGrid/DataGridView.ts`

The rest of the renderer reaches the library through `src/renderer/uikit/DataGrid`. The facade
re-exports `AVGrid`'s types, `RenderGrid`, measured-row types/classes, helpers and
`AVGridError as DataGridError`. `DataGridProps` extends `Omit<AVGridOptions, "injectStyles" |
"persistFilters">`; `DataGridView.collectValues()` forwards value options and
`syncTrampolines()` binds callback options once, forwarding current props through stable
trampolines. `pushDelta()` already sends rows before columns when both change because av-grid
validates columns against the rows it currently owns.

The facade's comment currently says focus has no option, but v2.4.0 added `AVGridOptions.focus`.
Persephone's Grid Editor already restores focus through `grid.setFocus()` and persists its own
`CellFocus`; the upgrade should correct that stale facade documentation without switching the
editor to controlled focus props.

The `keepCellsAttached: true` path is active in all eight verified locations:

| File | Grid path |
|---|---|
| `src/renderer/uikit/Tree/TreeView.ts:316` | direct `RenderGrid`, stateful tree item/section subtrees |
| `src/renderer/uikit/ListBox/ListBoxView.ts:320` | direct `RenderGrid`, stateful list item/section subtrees |
| `src/renderer/components/file-search/FileSearchView.ts:262` | direct `RenderGrid`, file-search rows |
| `src/renderer/editors/link-editor/LinksListView.ts:147` | direct `RenderGrid`, retained link rows |
| `src/renderer/editors/link-editor/LinksTilesView.ts:167` | direct `RenderGrid`, retained tile rows |
| `src/renderer/editors/log-view/LogBodyView.ts:231` | `MeasuredRowGrid`, measured log-entry rows |
| `src/renderer/editors/notebook/NotebookBodyView.ts:298` | `MeasuredRowGrid`, measured note rows |
| `src/renderer/editors/storybook/renderGridStory.ts:102` | direct `RenderGrid`, retained-cell story case |

`TreeView` and `ListBoxView` use the shared render contract directly: their stable renderers at
`renderCell()` resolve `p.previous ?? p.recycle?.()`, call `applyCellStyle()`, and retain native
child views in pooled wrappers. `src/renderer/uikit/shared/cell-style.ts` consumes `CellStyle`.
The source diff confirms that `src/render/types.ts` is byte-for-byte unchanged from v2.3.0 to
v2.6.1, so `RenderCellParams`, `CellStyle` and `RenderCellFunc` need no signature adaptation.

The measured path is also unchanged across the release span:
`src/measured/MeasuredRowGrid.ts` and `src/measured/MeasuredRowHeights.ts` have no diff. The
facade's `MeasuredRowGrid`, `MeasuredRowHeights`, `DEFAULT_MIN_ROW_HEIGHT` and related exports
therefore keep their existing contracts. The 2.6.1 `RenderGrid` lifecycle change is still
relevant to them: a superseded recompute can now trigger a second release, and
`MeasuredRowGrid.onCellReleased()` is already idempotent because it deletes its observer
mappings rather than assuming a detach.

### Authoritative av-grid delta

The library repository at `C:\projects\av-grid` was readable and was used as the authoritative
source; the npm-pack fallback was not needed. The release history is:

| Release | Verified change | Persephone consequence |
|---|---|---|
| 2.4.0 | Phase 9 adds the controlled `focus` option and the optional `av-grid/react` wrapper with its React adapters. | Persephone already restores focus through the imperative grid surface; no focus migration is needed. The React wrapper is irrelevant: Persephone is framework-free except for the Excalidraw island in `src/renderer/editors/draw/**`. |
| 2.5.0 | Phase 10 adds pinned columns, footer rows, the wide-grid performance gate, and accessibility semantics. It also adds the sticky-region migration protection used by pinned bands. | Existing grids do not pass `pinned` or `footerRows`; the new defaults are inert. The CSS import path remains `av-grid/av-grid.css`. |
| 2.6.0 | Phase 11 adds `Column.group` two-row headers and `multiSort`. | Existing grids do not pass `group` or `multiSort`; single-column sort remains the default runtime path. |
| 2.6.1 | `RenderGrid.acquireCell()` records pooled cells loaned during recompute and `reclaimLoaned()` re-parks loans not claimed by the painted render info. | Directly fixes the stale rows caused by `keepCellsAttached: true` and multiple recomputes in one frame. |

The supplied claim that `src/index.ts` changed only its version constant is not fully borne out by
the source diff. In addition to `version = "2.3.0" → "2.6.1"`, it adds the callback-classification
exports, `describeFilter`, `FilterChipText`, and the corresponding type exports. The facade does
not currently expose those filter-bar/React APIs because it exposes the `DataGrid` mounting seam,
not the complete `AVGrid` class.

The substantive public and behavioural delta is:

- `AVGridOptions.focus` is now a controlled focus option.
- `footerRows` and `footerRowClass` add a sticky, render-only footer band. With a footer and no
  explicit `whiteSpaceY`, the default trailing slack changes from 20 px to 0; an explicit
  `whiteSpaceY` remains honoured. Persephone passes no `footerRows` today.
- `Column.pinned` (`"left" | "right"`) and `Column.group` are new. Right-pinned columns must be
  a trailing visible run and all pinned columns must use fixed pixel widths. Grouped columns are
  stably gathered, grouped headers disable drag-reorder, and pinned columns cannot be grouped.
- `multiSort` defaults to `false`. `sort`, `getSort()` and `onSortChange` use a single
  `SortColumn` in that mode, but use a readonly array when `multiSort: true`; an array passed
  while multi-sort is off now throws `AVGridError` through `validateSort()`.
- All newly introduced options are inert when omitted: `focus`, `footerRows`, `pinned`, `group`,
  and the new callbacks are absent/undefined, while `multiSort` explicitly defaults to `false`.
  The only changed derived default found is the footer-specific `whiteSpaceY` slack described
  above, and it requires `footerRows`.
- `SortState` and `ColumnGroupContext` are new public types. `ColumnStateSnapshot` gains `pinned`
  and `AVGridStateSnapshot.sort` widens to `SortState`.
- The `RenderGrid` shell adds stable `avg-*` classes (`avg-viewport`, `avg-cells-area`, and
  sticky-band classes). The library CSS adds group-cell and multi-sort styling, flips the
  right-pinned resize grip, and positions `avg-extra`/the add-row control above a footer using
  `--avg-sticky-bottom`.
- `validateColumns()` adds checks for pinned/group shapes and right-pin ordering. Existing
  validation for rows, ordinary columns, filters and single-object sorts is otherwise unchanged.

The v2.5 wide-grid gate is a benchmark, not a runtime threshold: `tasks/plan-done-06.md` defines
300 columns, 288 hidden columns, a 12→40 visible-column `setColumns()` change, and one filter as
the test cases. There is no `wide`/column-count gate in the av-grid runtime source. Persephone's
Grid Editor can theoretically supply hundreds of data columns because its columns are derived
from JSON/CSV, while FileGrid has three columns and GitTree has three compact or five full
columns; no Persephone view activates a special wide-grid branch. The implementation should
retain this benchmark as a validation reference, not add a threshold or a local workaround.

### Verified current option shapes

The current callers were inspected at the facade and grid-editor choke points:

- `src/renderer/editors/grid/GridBodyView.ts:gridProps()` passes ordinary rows/columns,
  `getRowKey`, filters, search, edit/add/delete callbacks, `onSortChange`, and no `sort` or
  `multiSort`; `GridEditor.onGrid()` restores a single `SortColumn` through `grid.setSort()`.
- `src/renderer/editors/grid/GridEditor.ts` persists `sortColumn: SortColumn | undefined` in
  `GridViewSettings` and `GridEditorState`; no persisted array shape exists. Its own sort callback
  therefore must remain single-column and must not turn on multi-sort as part of this upgrade.
- `src/renderer/components/file-grid/FileGridView.ts` has one percentage-width unpinned title
  column and two fixed unpinned columns. `src/renderer/components/git-tree/GitTreeView.ts` has
  no pinned/grouped columns and uses `extraElement` plus explicit `whiteSpaceY` for Load More.
- `src/renderer/editors/log-view/LogBodyView.ts` uses `minRowHeight: 18`,
  `getInitialRowHeight`, `preferMinHeightForNewRows`, and `MeasuredRowGrid`; notebook uses
  `minRowHeight: 100`, `maxRowHeight: 800`, and `getInitialRowHeight`. These options are not
  changed by the upgrade.
- No current Persephone column uses `pinned`, `group`, or a percentage width while pinned, and
  no current option passes `footerRows` or a multi-sort array. Consequently none of the new
  `AVGridError` validation branches can throw for the current callers.

The facade's value tier needs no new audit or allow-list entries. `DataGridView.collectValues()`
is a denylist: every option not in `CALLBACK_KEY_SET` or `INITIAL_ONLY_KEYS` is forwarded, so the
new value options (`focus`, `footerRows`, `multiSort`, and `pinned`/`group` fields inside
`columns`) already reach av-grid unchanged. `focus` is identity-diffed as a value, which is safe:
av-grid no-ops a focus value equal in value to its current focus.

### CSS and colour audit

`src/renderer/uikit/DataGrid/DataGrid.css` imports `av-grid/av-grid.css` as `layer(uikit)` and
`DataGridView.onMount()` forces `injectStyles: false`; the package export path is unchanged. The
2.6.1 CSS additions use existing `--avg-*` tokens and the new `--avg-sticky-bottom` layout token.
No Persephone CSS selector depends on the newly added `avg-*` shell classes, and no CSS change is
required at the facade boundary. The library stylesheet retains its own third-party fallback
colour literals, but the new rules introduce no Persephone-authored hardcoded colour. Keep the
import/layer arrangement and do not copy library CSS into `DataGrid.css`.

## Implementation Plan

1. Update the dependency metadata in `package.json` and `package-lock.json`:

   ```diff
   -"av-grid": "2.3.0"
   +"av-grid": "2.6.1"
   ```

   Regenerate only the lock entry with the repository's npm tooling, confirming that the resolved
   tarball is `av-grid-2.6.1.tgz` and that no unrelated dependency changes enter the diff.

2. Complete the public type surface in the DataGrid facade.

   - In `src/renderer/uikit/DataGrid/types.ts`, re-export `SortState`, `ColumnGroupContext` and
     `CallbackOptionKey` alongside the existing av-grid types, and re-export the value constants
     `CALLBACK_OPTION_KEYS` and `PAINT_PATH_CALLBACK_KEYS`. `DataGridProps` already reaches the
     group-option types structurally through `AVGridOptions`; the named re-exports keep the facade
     a complete av-grid boundary for consumers that need those types or adapter metadata, even
     though no current Persephone code names `ColumnGroupContext`.
   - Correct the stale focus comment in the same file: focus remains available through the
     imperative `DataGridInstance`, but `AVGridOptions.focus` is now also a controlled option.
     Do not add `focus` to Grid Editor's props; its existing imperative restore path is valid.
   - Mirror these type and value exports in `src/renderer/uikit/DataGrid/index.ts`, so consumers
     continue importing all av-grid-facing types and callback metadata from the facade rather
     than naming the package directly. `PAINT_PATH_CALLBACK_KEYS` is available for a future
     optimization that avoids installing paint-path trampolines when none are supplied; that
     optimization is not part of US-1256.
   - Do not expose `av-grid/react`, `describeFilter`, or the library's filter-bar implementation
     through this mounting seam; no Persephone code consumes those APIs.

   Before → after for the sort type visible at the facade:

   ```ts
   // before: src/renderer/uikit/DataGrid/index.ts
   SortColumn,

   // after
   SortColumn,
   SortState,
   CallbackOptionKey,
   ```

   The value exports should likewise be visible from the facade:

   ```ts
   export { CALLBACK_OPTION_KEYS, PAINT_PATH_CALLBACK_KEYS } from "av-grid";
   ```

3. Derive the facade's callback classification in
   `src/renderer/uikit/DataGrid/DataGridView.ts`.

   Import `CALLBACK_OPTION_KEYS` from `av-grid`, define a local
   `PRESENCE_SENSITIVE_KEYS` tuple containing `getRowKey`, `newRow`, `newColumn`, `onGetOptions`
   and `onGridContextMenu`, then build `CALLBACK_KEYS` by spreading the library tuple and that
   local tuple while retaining `satisfies readonly (keyof DataGridProps)[]`. The library's
   compile-time gate now owns the pure-callback list, so Persephone must not append individual
   names such as `footerRowClass`, `columnGroupRender` or `columnGroupClass` by hand. A hand-held
   copy would silently leave the next release's callback in the value tier, where a fresh closure
   identity triggers `setOptions()` on every update — precisely the failure the trampoline design
   prevents.

   Persephone deliberately trampolines the five presence-sensitive keys too, even though av-grid
   advises passing them with stable identity: the local `syncTrampolines()` logic preserves their
   presence/absence and therefore preserves the library behaviour. That deliberate divergence
   must survive the derived-list rewrite.

   ```ts
   // before
   const CALLBACK_KEYS = [
       "getContextMenuItems",
       // ...the remaining hand-maintained callback names
   ] as const satisfies readonly (keyof DataGridProps)[];

   // after
   const PRESENCE_SENSITIVE_KEYS = [
       "getRowKey",
       "newRow",
       "newColumn",
       "onGetOptions",
       "onGridContextMenu",
   ] as const satisfies readonly (keyof DataGridProps)[];
   const CALLBACK_KEYS = [
       ...CALLBACK_OPTION_KEYS,
       ...PRESENCE_SENSITIVE_KEYS,
   ] as const satisfies readonly (keyof DataGridProps)[];
   ```

4. Adapt the single-sort consumer without adopting multi-sort.

   In `src/renderer/editors/grid/GridEditor.ts`, import `SortState` from
   `../../uikit/DataGrid` and deliberately widen `onSortChange` to accept the library's
   declaration. This is optional under Persephone's `tsconfig.json`: with no `strictFunctionTypes`,
   the current narrower handler remains assignable to the `DataGridProps` callback. The widening
   is a robustness choice that matches the library's declared arity while retaining Persephone's
   single-sort persistence contract.

   ```ts
   // before
   onSortChange = (sort: SortColumn | undefined): void => {
       this.state.update((s) => { s.sortColumn = sort; });
   };

   // after; place this module-local helper beside the other GridEditor helpers
   const isSortList = (sort: SortState): sort is readonly SortColumn[] => Array.isArray(sort);

   onSortChange = (sort: SortState | undefined): void => {
       if (sort && isSortList(sort)) return;
       this.state.update((s) => { s.sortColumn = sort; });
   };
   ```

   The array guard is defensive: `GridBodyView.gridProps()` does not pass `multiSort`, so
   av-grid reports a single object or `undefined`. Keep `GridViewSettings.sortColumn`,
   `GridEditorState.sortColumn`, restore logic, `grid.setSort(sortColumn)`, and the existing
   single-column UI/persistence unchanged. The predicate is required because
   `Array.isArray`'s `any[]` predicate does not narrow a `readonly SortColumn[]`; without the
   explicit predicate, the assignment to `sortColumn` fails typecheck. This changes no prop shape
   or callback wiring in `GridBodyView.ts` and changes no on-disk state contract.

5. Leave the eight `keepCellsAttached` call sites and all measured-row renderers unchanged. The
   av-grid 2.6.1 implementation supplies the fix inside `RenderGrid`; Persephone must not add a
   second pool, manually remove retained cells, or move cleanup into `onCellReleased`. Preserve
   the existing `p.previous ?? p.recycle?.()` order and measured-row lifecycle bookkeeping.

6. Verify the CSS seam after the dependency is installed. Confirm that the imported 2.6.1 sheet
   remains in `@layer uikit`, that `DataGrid.css`'s opaque sticky-band rule still wins where
   intended, and that GitTree's `extraElement`/`whiteSpaceY` still occupies the existing trailing
   strip. Only add a Persephone CSS change if the built output proves a required selector or token
   moved; any new colour must come from the theme token system.

7. Run the project gates and manual behavioural checks in the acceptance criteria. Do not add
   unit tests: this project does not use them for this surface.

### Files that need no changes

The following files were investigated and need no planned edits for this upgrade:

- `src/renderer/uikit/shared/cell-style.ts` — `CellStyle` is unchanged.
- `src/renderer/uikit/Tree/TreeView.ts` and `src/renderer/uikit/ListBox/ListBoxView.ts` — their
  `RenderCellFunc`/`RenderCellParams` usage and `keepCellsAttached` settings remain valid.
- `src/renderer/components/file-search/FileSearchView.ts` — retained-cell fix is in the library.
- `src/renderer/editors/link-editor/LinksListView.ts` and `LinksTilesView.ts` — same.
- `src/renderer/editors/log-view/LogBodyView.ts` and `src/renderer/editors/notebook/NotebookBodyView.ts`
  — measured-row API and options are unchanged.
- `src/renderer/editors/storybook/renderGridStory.ts` — retained-cell story needs no API change.
- `src/renderer/uikit/DataGrid/DataGrid.css` — import/export path and layer strategy remain valid.
- `src/renderer/uikit/DataGrid/cell-tooltip.ts` — its av-grid type usage is unaffected.
- `src/renderer/editors/grid/GridBodyView.ts` — its prop shape and callback wiring already
  typecheck under Persephone's compiler options and need no change.
- Any `patch-package` file — the repository has no av-grid patch to rebase.

## Concerns

**New sort declaration versus existing persistence — resolved.** `SortState` is intentionally
wider in the library declaration, but Persephone remains in the default single-sort mode. The
current narrower handler already typechecks because `tsconfig.json` does not enable
`strictFunctionTypes`; widening it is deliberate robustness, and the explicit readonly-array
predicate prevents an accidental array from entering the persisted `sortColumn` slot. No
multi-column migration is part of US-1256.

**New validation — resolved by current-shape audit.** The only new throws are for malformed
`footerRows`, pinned/group column declarations, invalid pinned ordering/widths, or a sort array
without `multiSort`. Current Persephone callers pass none of those shapes. The existing
`DataGridError` alias remains the error boundary.

**Footer slack — resolved by absence.** 2.6.1's footer-specific default (`whiteSpaceY` becomes
zero only when a footer band exists) cannot affect GitTree because it uses `extraElement`, not
`footerRows`; GitTree explicitly supplies `whiteSpaceY` when its footer is present.

**CSS cascade — resolved by source diff.** The 2.6.1 CSS changes are additive group/pinned rules
plus the footer offset variable. They do not replace the selectors used by Persephone's
`DataGrid.css` or `GitTree.css`; the imported stylesheet must remain layered and library fallback
colours must not be duplicated in Persephone.

**Measured rows and duplicate releases — resolved by implementation inspection.** The measured
files did not change, and `MeasuredRowGrid.onCellReleased()` removes mappings idempotently. The
acceptance pass must still exercise log/notebook scroll and row-height changes because they are
the consumers most sensitive to lifecycle ordering.

**Wide-grid gate — resolved by runtime/source inspection.** It is a 300-column benchmark, not a
runtime branch. Grid Editor's data-driven columns can exercise the same virtualization shape, but
US-1256 will not add a threshold, change overscan, or adopt a wide-grid feature.

## Acceptance Criteria

- [ ] `package.json` pins `av-grid` exactly to `2.6.1`; `package-lock.json` resolves exactly
      `2.6.1` with no unrelated dependency churn.
- [ ] `src/renderer/uikit/DataGrid` remains the only Persephone consumption boundary; the facade
      exports `SortState`, `ColumnGroupContext`, `CallbackOptionKey`, `CALLBACK_OPTION_KEYS` and
      `PAINT_PATH_CALLBACK_KEYS` as the complete boundary metadata/types.
- [ ] `DataGridView` derives all pure callback options from av-grid's `CALLBACK_OPTION_KEYS`,
      adds exactly its five local presence-sensitive keys, and retains their existing
      presence-sensitive trampoline behaviour.
- [ ] The value tier forwards new value options without a new allow-list: `focus`, `footerRows`,
      `multiSort`, and column `pinned`/`group` values reach av-grid unchanged; equal focus values
      do not cause observable churn.
- [ ] Grid Editor typechecks with its persisted single-column `sortColumn` shape; ascending,
      descending and cleared sorting still round-trip through its existing state and restore paths.
- [ ] `npm run typecheck` completes cleanly.
- [ ] `npm run lint` completes cleanly.
- [ ] `npm run build-prod` completes cleanly and the built CSS still contains the layered av-grid
      sheet and Persephone's DataGrid overrides.
- [ ] Explorer Tree reproduction with rapid expansion/scroll/state updates produces no stale
      rows stranded below the actual content; the retained-cell loan-ledger path is exercised.
- [ ] Manual smoke coverage is clean for Tree, ListBox, File Search, Links List, Links Tiles,
      Log View, Notebook and the RenderGrid story, including scroll-to-end and returning to the
      top. Log View and Notebook additionally retain correct measured row heights while rows are
      expanded/re-rendered.
- [ ] Grid-backed editor views remain correct for JSON and CSV data: columns, filtering/search,
      single-column sorting, editing, add/delete operations, copy/paste, column resize/reorder,
      and GitTree's Load More footer continue to work.
- [ ] No unit tests or av-grid/react integration are added, and no hardcoded Persephone colours
      are introduced.

## Ranked appendix — future av-grid opportunities (not part of US-1256)

| Rank | Capability | What it would replace in Persephone today | Size |
|---:|---|---|---|
| 1 | Footer rows | Replace GitTree's `extraElement` + `whiteSpaceY` Load More strip when the control can be modelled as a render-only summary/footer row. | S |
| 2 | Pinned columns | Replace any future/manual horizontal sticky-column CSS; today Persephone has no right-pinned equivalent, while existing left status columns already use `isStatusColumn`. | S–M |
| 3 | Accessibility work | Replace/standardize bespoke grid semantics around DataGrid-backed views; Tree/ListBox still expose tree/list roles over direct `RenderGrid` and would need a separate design. | M |
| 4 | Multi-column sort | Replace Grid Editor's persisted single `sortColumn` shape and single-level sort interaction with an ordered sort list and its restore/UI plumbing. | M |
| 5 | Column groups | Replace the current single header row where a grid editor eventually needs grouped/period headers; no current Persephone view has a two-level header requirement. | M |

`av-grid/react` is deliberately absent from this appendix: Persephone's only React island is
`src/renderer/editors/draw/**`, and its Excalidraw integration is unrelated to DataGrid.

## Files Changed Summary

| File | Planned change |
|---|---|
| `package.json` | Bump exact `av-grid` dependency from 2.3.0 to 2.6.1. |
| `package-lock.json` | Regenerate the exact av-grid 2.6.1 lock entry. |
| `src/renderer/uikit/DataGrid/index.ts` | Re-export the new public types and callback metadata through the facade. |
| `src/renderer/uikit/DataGrid/types.ts` | Re-export the new public types/metadata and correct the stale focus-option comment. |
| `src/renderer/uikit/DataGrid/DataGridView.ts` | Derive pure callbacks from av-grid and retain the five local presence-sensitive keys. |
| `src/renderer/editors/grid/GridEditor.ts` | Accept the library's `SortState` declaration while preserving single-sort state. |
| `doc/active-work.md` | Link US-1256 under Active → *(no epic)*. |
| `doc/tasks/US-1256-av-grid-2.6.1/README.md` | This implementation-ready investigation and plan. |
