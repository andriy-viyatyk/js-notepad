# US-1318 — The grid surface

Epic: [EPIC-087 — Agent transparency roadmap](../../epics/EPIC-087.md)

## Goal

Give the `grid-json`, `grid-csv`, and `grid-jsonl` editor facades a stable, curated
`elements` list with working `highlight`, plus model-backed state and actions for the
grid surface that is already visible to a user. The three editor IDs must continue to
share one `GridEditorFacade` descriptor and one element definition list.

**Status: Implemented 2026-09-06** (review deferred to epic close, per the epic model).

One defect was found in live verification and fixed by hand: `CsvOptionsContentView.syncState`
and `handleOtherChange` re-`update()` the three CSV controls without a `name` prop, and
`CheckboxView`/`RadioGroupView`/`InputView` each *delete* `data-name` when the prop is absent — so
the names were set on mount and then stripped, leaving three declared elements that could never
resolve. Every `update()` call site now carries its `name`.

## Background

`GridEditorFacade.ts:4-17` currently declares 12 members: identity and data access
(`id`, `name`, `rows`, `columns`, `rowCount`), cell/row/column editing, and search
actions. Its descriptor at `GridEditorFacade.ts:25-36` has no `elements` or `highlight`
provider. `PageWrapper.ts:52-70` already maps all three grid editor IDs to
`GridEditorFacade`; no second facade class or PageWrapper factory branch is needed.

`GridEditorFacade.ts:39-50` deliberately returns `editor.getRows()`, and
`GridEditor.ts:234-237` implements that getter as a new array from the AVGrid live rows.
That copy is part of the public safety contract: the facade must never hand a script a
live mutable AVGrid array. New array-valued getters in this task must also return fresh
copies, including nested filter/selection data where applicable.

The established descriptor pattern is `TextEditorFacade.ts:4-6,8-21,84-98`:
construct the definitions with `createElements`, pass a page-scoped selector and a
`beforeHighlight` callback using `activatePageAndWaitForLayout`, merge
`elements.members` into the descriptor, and expose `elements` plus `elements.provide`.
`elements.ts:64-75` and `page-elements.ts:5-8` prove that the resulting selectors are
`[data-page-id="<id>"] [data-name="<name>"]` (with the page ID JSON-quoted), while
`elements.ts:90-145` supplies `visible` and invokes the layout callback before
highlighting.

The grid model is the source of truth. `GridEditor.ts:115-136` stores columns, focus,
search, filters, one sort column, CSV delimiter/header settings, row counts, and an
optional error; it intentionally does not store rows in state. The AVGrid callbacks at
`GridEditor.ts:621-648` synchronize focus, filters, the single sort, and displayed row
count back into that state. `GridBodyView.ts:61-106` enables cell editing, row/column
addition and deletion, search, filters, sorting, and focus callbacks, but does not set
`selectColumn` or `onSelectionChange`; this surface has cell-range selection, not
row-checkbox selection.

## Implementation Plan

### 1. Curate the named controls and make every selector page-scoped

Verify and preserve the ten names found in the source. `GridBodyView.ts:38-46` emits
`grid-editor-root` from a UIKit `name` prop; `src/renderer/editors/grid/index.ts:76-98,156-187`
emits the four toolbar/search names; and `ColumnsOptions.ts:316-326,352-360,397-413`
emits the four column-popup names. These are `name:` props on UIKit components, not
literal `data-name` attributes.

The curated list is the actionable, user-visible subset below. Structural roots and
containers are intentionally not declared as agent controls.

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `grid-editor-root` | Omit | Structural root panel; `GridBodyView.ts:38-46` names the panel that contains the grid. |
| `grid-search` | Curate | Enter the active search text; `src/renderer/editors/grid/index.ts:168-177` binds the input to `model.setSearch`. |
| `grid-search-clear` | Curate | Clear the active search; `src/renderer/editors/grid/index.ts:156-165,180-187` creates it only while search text is truthy and binds `model.clearSearch`. |
| `grid-columns` | Curate | Open the Edit Columns surface; `src/renderer/editors/grid/index.ts:76-83,100-109` invokes `showColumnsOptions`. |
| `grid-csv-options` | Curate | Open CSV Options; `src/renderer/editors/grid/index.ts:65-73,86-98` creates it only for `model.format === "csv"`. |
| `csv-options` | Omit | Structural CSV popup panel; `CsvOptions.ts:97-113` contains the actual controls. |
| `columns-options` | Omit | Structural Edit Columns popup panel; `ColumnsOptions.ts:352-360` wraps the popup contents. |
| `columns-options-grid` | Omit | Structural/data-driven AVGrid container; `ColumnsOptions.ts:397-413` names the repeated columns editor grid. |
| `columns-options-apply` | Curate | Apply validated column edits; `ColumnsOptions.ts:321-326` binds the button to `applyChanges`. |
| `columns-options-cancel` | Curate | Discard popup edits and close the surface; `ColumnsOptions.ts:316-320` binds the button to `close`. |

The CSV popup also contains three real, stable controls without names today. Add these
names in `CsvOptions.ts:76-91` without renaming any existing `data-name` or
`data-type`:

| New name | Purpose and source evidence |
| --- | --- |
| `csv-options-header` | Toggle whether the first CSV row is treated as column headers; the existing checkbox at `CsvOptions.ts:76-80` reads `state.csvWithColumns` and calls `toggleWithColumns`. |
| `csv-options-delimiter` | Choose comma, semicolon, or tab; the existing radio group at `CsvOptions.ts:81-85` reads `state.csvDelimiter` and calls `setDelimiter`. |
| `csv-options-other` | Enter a custom delimiter; the existing input at `CsvOptions.ts:86-91` feeds `setOtherProxy`, which truncates a value longer than one character at `CsvOptions.ts:32-38`. |

These names resolve to real elements: `CheckboxView.ts:9-10`,
`RadioGroupView.ts:60-61`, and `InputView.ts:30-32` each define a `name` prop that
emits `data-name` on the component root. The implementation must pass these names to
the existing controls before declaring them in `GRID_ELEMENTS`; no element may be
declared if its selector cannot resolve.

The final `GRID_ELEMENTS` list therefore has nine entries: the six curated names from
the existing ten plus the three CSV names above. It does not expose the roots,
containers, repeated column rows, or unnamed AVGrid internals. Those internals are
data-driven or structural rather than stable app-owned controls; their user-visible
capabilities are represented by facade state/actions instead.

`elements.ts:64-75` will apply the page scope to every definition. The implementation
must use `pageScopeSelector(pageId)` and pass
`activatePageAndWaitForLayout(pageId)` as `beforeHighlight`, exactly as
`TextEditorFacade.ts:84-98` does. A missing page ID must retain the established
unscoped fallback used by that facade rather than constructing an invalid selector.

The two option surfaces are rendered through the global popper layer:
`PoppersView.ts:14-24,65-83` mounts them outside the page, and
`overlayLayer.ts:5-34` confirms that the overlay is attached to `body`. Therefore the
plan must keep the selectors page-scoped by adding the current page ID to each grid
popover root:

- `CsvOptions.ts:164-181,188-195`: pass the page ID from `gridModel.page?.id` to the
  grid's `PopoverView`. When it is `null`/`undefined`, omit the `data-page-id` property
  entirely; do not emit `data-page-id="undefined"`.
- `ColumnsOptions.ts:458-477`: add an optional `pageId` argument to
  `showColumnsOptions`, pass `this.model.page?.id` from
  `src/renderer/editors/grid/index.ts:100-109`, and pass it conditionally as
  `"data-page-id"` to that popup's `PopoverView`. A null page ID omits the attribute;
  it must never become `data-page-id="undefined"`.

This is supported by `PopoverModel.ts:32-37`, whose props accept arbitrary
`data-${string}` attributes, and `PopoverView.ts:160-220`, which forwards rest
attributes to the floating root. No generic Popover change is required. Popup
controls remain `visible: false` until the user opens their owning popup.

### 2. Add the descriptor using the existing AI-vision contract

In `GridEditorFacade.ts`, import `ui`, `createElements`, and
`activatePageAndWaitForLayout`/`pageScopeSelector` as in `TextEditorFacade.ts:4-6`.
Define `GRID_ELEMENTS` with the nine curated names and their existing UI semantics,
then change the descriptor construction from:

```ts
return {
    kind: "GridEditor",
    summary: "Grid data manipulation facade.",
    members: GRID_EDITOR_MEMBERS,
    help: GRID_EDITOR_HELP,
    summarize: () => ({
        kind: "GridEditor", id: this.id, name: this.name,
        rowCount: this.rowCount,
        columns: this.columns.map(({ key, name }) => ({ key, name })),
    }),
};
```

to the established shape:

```ts
const pageId = this.editor.page?.id;
const elements = createElements(GRID_ELEMENTS, ui.highlightElement.bind(ui), {
    scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
    beforeHighlight: pageId
        ? () => activatePageAndWaitForLayout(pageId)
        : undefined,
});

return {
    kind: "GridEditor",
    summary: "Grid data manipulation facade.",
    members: [...GRID_EDITOR_MEMBERS, ...elements.members],
    help: GRID_EDITOR_HELP,
    // kind, summary, and summarize remain the existing GridEditor descriptor values.
    summarize: () => ({
        kind: "GridEditor", id: this.id, name: this.name,
        rowCount: this.rowCount,
        columns: this.columns.map(({ key, name }) => ({ key, name })),
    }),
    elements: GRID_ELEMENTS,
    provide: elements.provide,
};
```

The existing `kind: "GridEditor"`, summary, and `summarize()` implementation from
`GridEditorFacade.ts:26-38` are unchanged; only the element members/provider are added
around them.

The help text should describe all three IDs rather than the current
`"grid-json"`-only wording at `GridEditorFacade.ts:19-20`. It should explain that
CSV-only controls are declared once and report `visible: false` for JSON and JSONL,
and that popup controls require the corresponding popup to be open.

### 3. Expose only verified, read-only model state

Extend `src/renderer/api/types/grid-editor.d.ts` (the canonical type) and the facade
with these read-only properties. Keep the existing `rows`, `columns`, and `rowCount`
members and their semantics unchanged. The generated copy at
`assets/editor-types/grid-editor.d.ts` must not be edited by hand; it is produced by
`editorTypesPlugin()` in `vite.renderer.config.ts:7-65`.

| Property | Model source and absent-value contract |
| --- | --- |
| `searchText: string \| undefined` | Read `GridEditor.state.search` (`GridEditor.ts:115-123,671-681`). With an attached page, return the real text, including `""` when no search is active; with no attached host (`this.editor.page` is `null`), return `undefined`. |
| `sort: IGridSort \| undefined` | Map the single `state.sortColumn` from `GridEditor.ts:72-80,633-644` to `{ key, direction }`. With an attached page, return that value; unsorted is genuinely `undefined` because the model stores `sortColumn: undefined`, not an absent-value stand-in. With no attached host, return `undefined`. Do not promise multi-column sorting: `onSortChange` explicitly drops sort lists at `GridEditor.ts:633-644`. |
| `filters: IGridFilter[] \| undefined` | Read normalized `state.filters` (`GridEditor.ts:72-80,627-631`) and return a fresh array with copied filter records/values. With an attached page and no filters return the real `[]`; with no attached host return `undefined`. The dependency's `Filter` shape is verified at `node_modules/av-grid/dist/types.d.ts:331-347`. |
| `selection: IGridCellSelection \| undefined` | Map `state.focus?.selection` (`GridEditor.ts:72-80,621-625`) using the verified AVGrid range fields `rowKeyStart`, `rowKeyEnd`, `colKeyStart`, `colKeyEnd`, `rowStart`, `rowEnd`, `colStart`, and `colEnd` (`node_modules/av-grid/dist/types.d.ts:501-515`). With an attached page, return a copied range when one exists; with no selected range, return `undefined` because selection is genuinely absent. With no attached host, also return `undefined`. A focused cell without a range is not reported as a selection. |
| `hiddenColumns: string[] \| undefined` | Derive keys from `state.columns` entries whose `hidden` flag is true (`GridEditor.ts:57-63,72-80`), returning a new array. With an attached page and no hidden columns return the real `[]`; with no attached host return `undefined`. |
| `visibleRowCount: number \| undefined` | Read the footer-backed `state.displayedRowCount` (`GridEditor.ts:125-136,646-648`) and fall back to `state.rowCount`, matching `GridBodyView.ts:368-373`: rows currently shown after search and filters, or the total when the grid has not reported a displayed count. With an attached page return the real count, including `0`; with no attached host return `undefined`. |
| `csvDelimiter: string \| undefined` | Read `state.csvDelimiter` only for an attached `grid-csv`; `GridEditor.ts:72-80,781-791` proves the setting exists and is CSV-specific. With an attached CSV page return its delimiter, including the default comma; for JSON/JSONL or no attached host, return `undefined` because CSV options do not exist. |
| `csvWithColumns: boolean \| undefined` | Read `state.csvWithColumns` only for an attached `grid-csv`; `CsvOptions.ts:76-85,133-150` proves the UI binding. With an attached CSV page return the actual boolean, including the default `false`; for JSON/JSONL or no attached host, return `undefined` because CSV options do not exist. |

The only general absence guard is an attached page: `EditorModel.ts:67` types
`page` as `IPageHost | null`. Do not use a row-count or other data-content test.
`GridEditor.ts:113-140` seeds real search, filter, sort, and column state even
for a zero-row grid, so an attached empty grid must report its real `""`, `[]`, and
`0` values. `undefined` is reserved for a genuinely absent optional state (such as an
unsorted `sortColumn` or no `selection`) or for no attached host; never use `false`,
`0`, `""`, or `null` as a stand-in for absence.

Define the public value shapes in `grid-editor.d.ts` without exposing AVGrid instances:

```ts
export interface IGridSort {
    readonly key: string;
    readonly direction: "asc" | "desc";
}

export interface IGridFilter {
    readonly columnKey: string;
    readonly value?: unknown;
    readonly columnName?: string;
    readonly type?: string;
    readonly displayFormat?: string;
}

export interface IGridCellSelection {
    readonly rowKeyStart: string;
    readonly rowKeyEnd: string;
    readonly columnKeyStart: string;
    readonly columnKeyEnd: string;
    readonly rowStart: number;
    readonly rowEnd: number;
    readonly columnStart: number;
    readonly columnEnd: number;
}
```

The implementation must clone arrays and object values before returning them. In
particular, do not return `state.filters`, `state.focus.selection`, or the result of
any AVGrid getter directly. If a nested filter `value` is an array or object, clone it
to the same depth needed to prevent the caller from mutating model state.

Do not add row selection state. `GridBodyView.ts:61-106` has no `selectColumn` or
`onSelectionChange`, despite AVGrid supporting those options in
`node_modules/av-grid/dist/options.d.ts:38-79`; the only supported selection is the
cell range stored in `CellFocus.selection`.

### 4. Add only model-backed actions

Keep the current data actions and add only the two CSV option setters below. The
existing UI path is the authority: `CsvOptionsModel.setDelimiter` at
`CsvOptions.ts:28-30` forwards directly to `gridModel.setDelimiter`, so the facade's
`setCsvDelimiter` must forward to that same `GridEditor.setDelimiter` method and must
not claim to reparse content or do anything the UI does not do.

| Facade action | Model/UI behavior | Write caution |
| --- | --- | --- |
| `setCsvDelimiter(delimiter)` | For `grid-csv`, forward directly to `GridEditor.setDelimiter` (`GridEditor.ts:781-785`), exactly as `CsvOptionsModel.setDelimiter` does. Reject or report the action as unavailable for JSON/JSONL. | Changes CSV serialization/output; mark `caution`. |
| `setCsvWithColumns(enabled)` | For `grid-csv`, read `state.csvWithColumns` and call the existing `toggleWithColumns` only when its value differs. `GridEditor.ts:787-791` proves the model exposes only a toggle, so repeated calls with the same value must not invert the option. Reject or report the action as unavailable for JSON/JSONL. | Changes CSV serialization/output; mark `caution`. |

Existing `editCell`, `addRows`, `deleteRows`, `addColumns`, and `deleteColumns` remain
available. While updating the descriptor, add `caution` to every existing content-
mutating member, including `editCell`, `addRows`, and `addColumns`; the current
descriptor already marks the two delete actions at `GridEditorFacade.ts:75-83`.
`setSearch`/`clearSearch` remain the search actions used by the named controls.

Do not add `setSort`, `clearSort`, or `clearFilters`. `GridBodyView.ts:87-98` passes
the UI callbacks `onSortChange` and `onFiltersChange`, and `GridEditor.ts:627-644`
only receives those callbacks to mirror AVGrid changes into state; there is no
`GridEditor` method that the UI calls to drive a sort/filter mutation from the facade.
Calling those callbacks from the facade would update state without changing the live
grid, while dereferencing the private AVGrid would violate the model boundary. Reading
sort and filters remains safe and is covered by the getters above.

Do not add focus/selection actions or a `GridBodyView.ts` queue change. The existing
queue at `GridBodyView.ts:141-153` only handles view focus requests, and extending it
would leave an unresolved design for actions issued while the body is unmounted. The
read-only `selection` getter is sufficient transparency; a demonstrated scenario can
reopen focus/selection actions if a safe model-owned path is later established.

Do not add clipboard actions. `getSelectionText`, `copySelection`, `pasteText`, and
`cut` require a live AVGrid (`node_modules/av-grid/dist/AVGrid.d.ts:388-433`), add a
system-clipboard side effect, and are unnecessary alongside the existing `rows`,
`editCell`, `addRows`, and `deleteRows` facade surface.

Update `grid-editor.d.ts` so its `IGridEditor` members exactly match the facade,
including argument/return types, read-only state properties, selection/filter shapes,
and the two CSV setters. Run the normal editor type generation after
implementation so `assets/editor-types/grid-editor.d.ts` is refreshed by
`editorTypesPlugin()`; never hand-edit that generated file.

### 5. Help, conditional visibility, and descriptor completeness

Update `GridEditorFacade.ts` help to document:

- all three grid IDs sharing the same surface;
- the nine curated names and one-line purposes;
- `grid-csv-options` and the three `csv-options-*` names being CSV-only and
  `visible: false` for JSON/JSONL;
- `grid-search-clear` and popup buttons being conditionally present/visible;
- cell-range selection rather than row selection;
- absent getter values being `undefined`, with zero-row attached grids reporting their
  real `""`, `[]`, and `0` state values, and array getters being copies; and
- `caution` on document/CSV-output writes.

The descriptor must contain the static `elements` definitions and dynamically scoped
`provide`/`highlight` members. `PageWrapper.ts:52-70` needs no mapping change because
all three IDs already select this facade.

## Concerns

- **Portal scope:** The option popovers are outside the page DOM. Passing the page ID to
  the two grid popover roots is mandatory; otherwise a correctly scoped selector would
  fail to find their controls.
- **Conditional elements:** Keep one shared list for all formats. CSV-only controls
  must remain declared once and report `visible: false` on JSON/JSONL, per EPIC-087
  decision 1.
- **Absent values:** `strictNullChecks` is disabled, so the compiler cannot enforce
  this contract. Review every new getter manually for the no-attached-host path and
  genuinely optional state such as no selection or no sort. An attached zero-row grid
  still has real state, so report its `""`, `[]`, and `0` values. `undefined` is the only
  absent value; never use `false`, `0`, `""`, or `null` as a substitute.
- **Mutable data:** Clone every new array/object result. Preserve the existing copied
  `rows` contract documented in `GridEditorFacade.ts:39-50`.
- **Selection semantics:** Do not expose AVGrid row selection or `selectedRows`; this
  grid does not enable it. Cell-range selection is represented by focus state only.
- **Single sort:** The model intentionally stores one `SortColumn` and discards sort
  arrays. The public API must not claim multi-column sort support.
- **Sort/filter writes:** `setSort`, `clearSort`, and `clearFilters` are deliberately
  deferred. `GridBodyView.ts:87-98` supplies callbacks, while
  `GridEditor.ts:627-644` only mirrors callback results into state; no UI-called
  `GridEditor` mutation method exists for a facade to forward safely. Calling the
  callbacks would desynchronize state and the live grid.
- **Column schema writes:** `updateColumn` is deliberately deferred. The existing
  projection/validation logic belongs to the `ColumnsOptions.ts` view at
  `components/ColumnsOptions.ts:104-116,229-287`, and EPIC-087 abort criterion 1
  forbids making the facade depend on view logic. Existing `addColumns` and
  `deleteColumns` remain; rename/retype/hide needs a separate model-owned design and
  risk review.
- **Focus/selection actions:** Focus and selection remain read-only through the getter.
  The current view queue at `GridBodyView.ts:141-153` is not extended because a
  facade action could otherwise queue forever while the body is unmounted. A
  demonstrated scenario can reopen this if a safe model-owned path is established.
- **Generated typings:** `assets/editor-types/` is build output from
  `src/renderer/api/types/`; only the source declaration is an implementation edit.
- **Writes:** Cell edits and CSV output settings can change user data or its serialized
  form. Their member descriptors need explicit caution text.
- **No tests:** This project does not use unit tests or test harnesses for this task.
  Verification is source/type/build validation and later manual UI/AI-vision QA under
  the epic’s completion workflow.

## Acceptance Criteria

- [ ] `GridEditorFacade` remains the facade for `grid-json`, `grid-csv`, and
  `grid-jsonl`, with one shared nine-entry curated element list.
- [ ] Structural names (`grid-editor-root`, `csv-options`, `columns-options`, and
  `columns-options-grid`) are not declared as controls; all three missing CSV control
  names are added without renaming existing names or types.
- [ ] Every element selector is page-scoped, including controls in the two portaled
  popovers, and `highlight` activates the page and waits for slot layout.
- [ ] CSV-only entries are declared once and report `visible: false` for JSON/JSONL;
  conditional clear/popup controls accurately reflect their mounted/visible state.
- [ ] New getters expose only state present in `GridEditor.state`, including search,
  one sort, filters, cell-range selection, hidden columns, displayed row count, and CSV
  options; unavailable values are `undefined` exactly as specified.
- [ ] No getter exposes a live mutable array or AVGrid instance; `rows` continues to
  return a copy.
- [ ] The only new actions are `setCsvDelimiter` and idempotent
  `setCsvWithColumns`, both forwarded through the existing CSV model methods and marked
  with `caution`; sort/filter writes, focus/selection actions, clipboard operations,
  and column-schema mutation are deliberately deferred.
- [ ] `src/renderer/api/types/grid-editor.d.ts` matches the facade, and generated
  `assets/editor-types/` output is refreshed only by `editorTypesPlugin()`.
- [ ] No PageWrapper mapping, dashboard entry, unit test, test harness, or manual edit
  to generated assets is introduced.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1318-grid-surface/README.md` | This implementation plan and verified source inventory. |
| `src/renderer/scripting/api-wrapper/GridEditorFacade.ts` | Add the shared page-scoped element descriptor, state getters, CSV action members, help, and cautions. |
| `src/renderer/api/types/grid-editor.d.ts` | Canonical public types for elements-facing state and actions. |
| `src/renderer/editors/grid/index.ts` | Pass the current page ID when opening the column popup. |
| `src/renderer/editors/grid/components/ColumnsOptions.ts` | Add page ID to the portaled popover root and preserve existing named controls. |
| `src/renderer/editors/grid/components/CsvOptions.ts` | Name the three stable CSV controls and add page ID to the portaled popover root. |

Files intentionally needing **no changes**:

- `src/renderer/scripting/api-wrapper/PageWrapper.ts` — all three grid IDs already
  map through `FACADE_FOR_EDITOR` at `52-70`.
- `src/renderer/scripting/api-wrapper/TextEditorFacade.ts` — reference pattern only;
  do not change the established implementation.
- `src/renderer/scripting/ai-vision/elements.ts` and `page-elements.ts` — existing
  scoping/highlight infrastructure already supplies the required behavior.
- `src/renderer/uikit/Popover/PopoverModel.ts` and `PopoverView.ts` — arbitrary
  `data-page-id` attributes are already supported and forwarded.
- `src/renderer/api/types/page.d.ts` — grid IDs and `IGridEditor` are already present.
- `src/renderer/editors/grid/GridEditor.ts` — existing state and model methods are
  sufficient; no new model method is planned for this inventory task.
- `src/renderer/editors/grid/GridBodyView.ts` — focus queue is intentionally not
  extended; focus/selection actions are deferred.
- `assets/editor-types/grid-editor.d.ts` — generated; never hand-edit.
- `vite.renderer.config.ts` — existing `editorTypesPlugin()` already regenerates the
  assets from the canonical declaration.
- `doc/active-work.md` and `doc/epics/EPIC-087.md` — the dashboard and epic task link
  already exist; the dashboard entry will not be changed by this task.
- Unit tests and test harnesses — explicitly out of scope for this project/task.
