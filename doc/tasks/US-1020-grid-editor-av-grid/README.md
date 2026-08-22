# US-1020 — `editors/grid/` onto av-grid

**Epic:** [EPIC-057 — De-React Epic C4](../../epics/EPIC-057.md)
**Status:** Implemented — lint, typecheck and build-prod clean. Context menu tested in the app and one defect fixed (F7); the rest of the acceptance list is untested. av-grid **2.2.1** is built, tested and tagged locally but **not published** — see "The release is local" below.
**Depends on:** [US-1019](../US-1019-adopt-av-grid/README.md) (landed, `61a5caf4`)

## Goal

Move the JSON / CSV / JSONL grid editor from `uikit/AVGrid` to av-grid through `uikit/DataGrid`,
absorbing the control inversion in `GridEditor` — the model that already owns the persisted view
state — and closing this consumer's roadmap Rule 6 violation by routing the context menu through the
app-side adapter.

## Background

Seven files, 1,605 lines:

| File | Lines | What it does |
|---|---:|---|
| `GridEditor.ts` | 608 | The model. Rows, columns, filters, sort, focus, CSV settings, persistence, serialization |
| `components/ColumnsOptions.tsx` | 377 | A **second grid**, inside a popover, editing the first grid's columns |
| `utils/grid-utils.ts` | 179 | Column detection, the `#intrnl-id` row-key column |
| `GridBody.tsx` | 162 | The React wiring: grid, filter bar, queue drain, focus, scroll restore |
| `index.tsx` | 158 | Chrome: toolbar, search box, footer row count |
| `components/CsvOptions.tsx` | 107 | Delimiter / header popover — **touches no grid API, unchanged** |
| `util.ts` | 14 | Format enum — unchanged |

### What the current wiring uses, and what replaces it

Every row below was checked against the installed av-grid 2.2.0 (`node_modules/av-grid/dist/`) and,
where behaviour was in question, against the source at `C:\projects\av-grid\src\` — not against the
epic's predictions.

| Today | av-grid |
|---|---|
| `columns` / `rows` props | `columns` / `rows` options (seed only — see D1) |
| `getRowKey` | `getRowKey` |
| `focus` + `setFocus` | `onFocusChange` (+ `setFocus()` on restore) |
| `searchString` | `searchString` |
| `highlightString` | `highlightString` (US-1019 upstream addition) |
| `filters` + `filtersModel` | `filters` + `onFiltersChange` |
| `<FilterBar gridModel filtersModel/>` | `filterBar: true` |
| `onGetOptions` | `onGetOptions` — identical signature |
| `editRow` | `editable: true` + `onEdit` |
| `onAddRows` / `onDeleteRows` | `canAddRows` / `canDeleteRows` + `newRow` + `onAddRows` / `onDeleteRows` |
| `onAddColumns` / `onDeleteColumns` | `canAddColumns` / `canDeleteColumns` + `newColumn` + callbacks |
| `setColumns` | `onColumnsChange` |
| `onVisibleRowsChanged` | `onVisibleRowsChange` |
| `onDataChanged` | no equivalent, and none wanted — see D1 |
| `disableSorting` | `disableSorting` |
| `entity="column"` | `rowNoun: "column"` (US-1019 upstream addition) |
| `growToHeight` (number) | `growToHeight` (**CSS string** — `` `${n}px` ``) |
| `g.focusGrid()` | `grid.focus()` |
| `g.models.focus.focusCell(r, c, true)` | `grid.focusCell(r, c, true)` |
| `g.data.rows.length` | the `onVisibleRowsChange` argument |
| `gridModel.props.columns` | `grid.getColumns()` |
| `gridModel.models.columns.updateColumns(fn)` | `grid.setColumns(fn(grid.getColumns()))` |
| `gridModel.renderModel.gridRef.current.offsetWidth` | `grid.element.offsetWidth` |
| `renderModel.restoreScroll()` | **delete it** — see F3 |

No part of this consumer needs `grid.model` or `grid.render`. C4-7's claim holds here.

## Decisions

Each of these was put to an independent agent with no prior context, and decided on the reasoning
that came back. The reasoning is recorded because none of the conclusions is obvious from the diff,
and two of them reverse the shape the epic assumed.

### D1 — av-grid owns the live row array; the editor keeps a seed and a count

The question was who owns `rows` after the migration: the editor (keep `state.rows`, veto every
av-grid write so all mutation round-trips through editor state) or av-grid (seed it once, let it
write in place, read back to serialize).

**It is not a preference. Editor-owned is broken.** `TComponentState.update` uses immer's `produce`
with default `autoFreeze`, and nothing in the tree calls `setAutoFreeze(false)`
(`core/state/state.ts:125`). Rows assigned inside `state.update` are therefore **deep-frozen** —
verified empirically, not inferred:

```
array frozen: true
row frozen: true
write THREW: Cannot assign to read only property 'a' of object '#<Object>'
```

av-grid's `editable: true` path writes `row[column.key] = value` itself. Against a frozen row in an
ESM strict-mode module, that throws. So rows in reactive state and av-grid's own write path are
mutually exclusive; there is no "seed `state.rows` and let the grid write into it" middle option.

That also reframes the cost of the controlled alternative, which is not "keep what we have" but
"keep what we have *and* re-implement every affordance av-grid already ships, behind a veto":
Tab-off-the-end add, ctrl+Delete, and `pasteText`, which routes **every cell** through `onEdit`. A
100×10 paste becomes 1,000 vetoes, 1,000 immer passes over the whole row array, and 1,000 `rows`
identity changes through `DataGridView`'s identity diff — so 1,000 `setOptions` calls and 1,000
repaints, against av-grid's one.

**So:**

- `rows` leaves `GridEditorState`. A plain `private _rows: any[]` holds the pre-mount seed, because
  parsing happens in `onHostAttached`, before the view exists.
- One accessor, `private liveRows(): any[] { return this.grid?.getRows() ?? this._rows; }`. Every
  serializer (`getJsonContent`, `getCsvContent`, `getJsonlContent`) and `onGetOptions` reads that,
  and nothing else inside them changes.
- A reactive `rowCount: number` joins the state, set wherever `_rows` is replaced or a mutation
  callback fires. The footer already mixes a reactive total with an imperatively-set
  `displayedRowCount`, so `GridFooterBits` and `getVisibleRowsLabel` keep working. `state.rows.length`
  does not survive, and should not — an array length is not view state.
- `reparseRows()` sets `_rows` and calls `grid.setRows()`, which is documented to keep the scroll
  position and reuse every on-screen cell.

**Serialization is deferred by one microtask, never synchronous inside `onEdit`.** av-grid's own
typings disagree with themselves about ordering — `editable` says the grid "writes the value into
the row object" and *then* calls `onEdit`; `onEdit` says it "fires ... *before* the value is
written" — so a synchronous `onDataChanged()` risks writing a one-edit-stale file, silently. A
microtask is correct under either ordering, and it coalesces a multi-cell paste or a range delete
into a single `changeContent`, which is also a dirty-flag and undo-granularity win. `onEdit`,
`onAddRows`, `onDeleteRows` and `onDeleteColumns` return nothing; never `false`.

The feedback path gets *quieter*, not louder: edit → grid paints the one cell → microtask serializes
→ the existing `_changedContent` guard makes the host-content subscription skip its own echo → no
reparse, no `setRows`, no second paint. Under the controlled alternative the grid paints nothing and
the echo of the rows push *is* the paint, so focus and edit-cursor state would have to survive a
full pipeline rerun on every keystroke.

### D2 — the persisted column shape becomes ours, narrow, and rebuilt on load

`GridViewSettings.columns` persists whole `Column` objects of the old uikit type. They reach disk in
two places, so this is a read-path migration and not a one-off rewrite of a single file:
`<userData>/openFiles.txt` via `EditorDescriptor.host.state` (`src/main/open-windows.ts:156`), and
**inside `.pnb` notebook files** via `NoteItemEditModel.getEditorState` / `setEditorState`.

Of the type differences, only one touches real persisted data. Every write site in the editor
(`detectColumns`, `getGridDataWithColumns`, `initEmptyPage`, `onAddColumns`,
`ColumnsOptions.updateColumns`) produces the same seven keys: `key`, `name`, `width`, `dataType`,
`resizible`, `filterType`. So `dataAlignment`, the four renderer hooks, `rowCompare`,
`displayFormat` and `isStatusColumn` are never persisted at all; `name` required→optional is a
widening; and `filterType: "options"` is still valid *and is now av-grid's default*, so persisting it
is already redundant. The one real difference is the old grid's misspelled **`resizible`** against
av-grid's `resizable`.

And that turns out to be harmless on its own: `view/HeaderCell.ts` reads
`column.resizable !== false`, so **`resizable` defaults to true**, and an old persisted column lands
on the default and stays resizable. Doing nothing would not produce the visible breakage it looks
like it would; `validateColumns` also passes unknown extra properties through untouched.

**The reason to act is a different one, and it is a crash.** `validateColumns` *throws* on a column
whose key is absent from the data (F1). Persisted columns describe the file as it was; if the file
changed between sessions, feeding them straight into `create()` hard-fails where the old grid
rendered an empty column.

**So:** persist `{ key, name?, width?, hidden?, dataType? }` — a record that is ours. Rebuild av-grid
columns at load by merging each persisted record onto the detected column for that key, and
**discard records whose key no longer exists**. The legacy read is then trivial: `resizible` is read
and ignored. This costs one small mapper plus one intersection — barely more than a rename map —
and it buys three things a rename map does not: the discard step is the persisted half of the F1
fix; the next av-grid field rename becomes one line in one function instead of a second migration
over users' disks; and it structurally forbids ever serializing a function-valued column hook, which
today would fail asymmetrically — surviving a Grid↔Monaco switch, vanishing after a restart, which
is the hardest class of bug to attribute.

### D3 — `#intrnl-id` goes; identity moves to a WeakMap beside the rows

Today `createIdColumn` spreads `"#intrnl-id": index` into every row, `getRowKey` reads it, and
`removeIdColumn` strips it on every save. Nothing explicitly hides the column: `getGridData` runs
`detectColumns` *before* `createIdColumn`, so the key never enters the column array. That implicit
ordering is the entire hiding strategy, and it has a live bug — user JSON that already contains
`#intrnl-id` gets a visible column, its values overwritten with row indices, and the field deleted
on save. Silent data loss.

**Inference is not an option here.** `inferGetRowKey` (`av-grid/src/validate.ts:238`) probes only the
*first* non-null row for `id`, `key`, `_id`, `uuid`, `rowKey`, and if it finds one uses
`String(row[candidate])` for every row. On arbitrary user JSON — which very often has an `id` — that
means duplicate ids collapse two rows into one identity, so focus, edit, select and delete address
the wrong row and `onDeleteRows` removes every match; rows missing `id` all become `"undefined"`;
and because the id cell is *editable*, a user typing into it changes the row's identity
mid-interaction. The WeakMap fallback av-grid uses when no id-shaped property exists on row 0 dies
across `reparseRows()`, which rebuilds every row object.

**So:** keep an explicit `getRowKey`, but stop storing the key inside the user's data. A
`WeakMap<object, string>` identity registry, seeded by index at parse time, replacing
`createIdColumn`; `_maxRowId` keeps minting keys for `onAddRows` and `initEmptyPage`; a lazy
`r${next++}` for any unregistered row, so a stray row is unique rather than `""`. Because the seed
is the index, a `focus.rowKey` of `"12"` persisted before a restart still resolves to row 12 — the
one property the current scheme buys that inference cannot.

`removeIdColumn` and its two call sites disappear. `getCsvContent` already projects through
`columns` and is unaffected.

**The helper stays module-level in `grid-utils.ts`**, not an editor method:
`editors/log-view/items/GridOutputView.tsx` imports both `getGridDataWithColumns` and `getRowKey`
from it and is still on `uikit/AVGrid` until US-1022. A module-level WeakMap-backed `getRowKey`
serves both, so this task stays self-contained and does not break a consumer it is not migrating.
`GridOutputView` renders arbitrary script output and would hit the duplicate-`id` case too, so it
wants the same helper rather than inference when its turn comes.

## Findings that change the work

### F1 — `validateColumns` throws on sparse rows. This needs an upstream av-grid release first.

`validateColumns` (`av-grid/src/validate.ts:267`) rejects a column whose key is not in the row data.
The presence check samples exactly one row:

```js
const sample = rows.find((r) => r !== null && r !== undefined);
// ...  !(key in sample)  ->  fail(`Unknown column "${key}". ...`)
```

`fail()` throws. But Persephone's `detectColumns` samples ~1,000 rows and **unions** their keys,
which is the correct thing to do for JSON, so the editor legitimately produces columns absent from
row 0. A file as ordinary as `[{a:1},{a:2,b:3}]` with correctly detected columns `[a, b]` is a hard
failure at `create()` — a blank editor, not a blank column. The existing exemptions (`render`,
`formatValue`, `isStatusColumn`, and `exemptKeys` from `addColumns`/`setColumns`) do not cover it,
and no host-side reconcile can: filtering detected columns down to the keys present in row 0 would
drop legitimate columns, and omitting `columns` to let av-grid infer them loses the widths and types
the detection exists to compute.

**The library contradicts itself here, which is what makes this a library bug rather than a
Persephone accommodation.** `inferColumns` builds its column set from `sampleKeys()`, a union over
the first `INFERENCE_SAMPLE = 50` non-null rows (`validate.ts:98,184`). `validateColumns` checks
against one row. So today `AVGrid.create(el, { rows })` and
`AVGrid.create(el, { rows, columns: inferColumns(rows) })` can disagree — the grid rejects a column
set it would have inferred itself.

**This is a C4-10 case, and the first to arrive in a consumer task.** US-1020 stops, lands the
av-grid change, bumps the pin, and continues — it does not route around it.

**The specified fix** (designed against av-grid's own philosophy, which the file header states
plainly: *"Silence is the failure mode to avoid. A grid that renders blank because a key was
misspelled costs far more than a thrown error"*):

1. Replace `rows.find(...)` with the union from the existing `sampleKeys()` helper, so the oracle is
   the same 50-row sample `inferColumns` uses. That is the whole justification for N: it makes *a
   column set the grid would have inferred itself can never be rejected* an invariant, which it is
   not today.
2. Only when a key is missing from that union, and only before `fail()`, scan the remaining rows
   with an early exit on the first row where `key in row`. Found → accept silently. Not found →
   throw, message unchanged in shape.
3. Build the `Available columns:` list from the union rather than from row 0, or the message
   under-reports on exactly the data that motivated the change.

Cost: the happy path is 50 rows regardless of row count. The failure path is one pass over ~100k
rows, single-digit milliseconds, paid once at `create()`, on the branch that was about to blank the
editor anyway. The render path is untouched, so the library's benchmark numbers need nothing.

**Deliberately not changed:** the unknown-column checks in `sort` and `filters`
(`validate.ts:448,499`). Both validate against `columns` — a closed list fully in hand, with no
sampling oracle and therefore no false positives. Loosening them would be a real regression, since a
filter on a nonexistent column silently matches nothing.

The change is strictly widening, so it is not breaking and needs no `exemptKeys` change. Library
tests to add: a sparse pair does not throw; a key first appearing past the 50-row window does not
throw (covering the failure-path scan); a key absent from *all* rows still throws with the same
message; and `validateColumns(inferColumns(sparse), sparse)` never throws, guarding the new
invariant.

D2's "discard records whose key no longer exists" is still wanted regardless — that half is the
host's own job, not the library's.

### F2 — the US-1019 context-menu adapter shows the wrong menu. One line.

`ui/dialogs/poppers/grid-context-menu.tsx` calls `showAppPopupMenu` and returns. It never stops the
event. But `GlobalEventService.handleContextMenu` (`api/internal/GlobalEventService.ts:92`) is a
`document`-level listener that calls `preventDefault()` and `showAppPopupMenu(...)` **without
checking `defaultPrevented`** — and av-grid's own `preventDefault()`
(`view/GridInteractions.ts:722`) does not stop propagation either.

So the event bubbles to `document`, the global handler fires, and `showAppPopupMenu` runs
`closePopper(showAppPopupMenuId)` as its first statement. The grid's menu is closed by the generic
one that replaces it. The user right-clicks a cell and gets Copy / Inspect instead of the grid menu
— a silent, total loss of the feature. It was not caught because US-1019's story panels were never
visually run.

The fix is `e.event.stopPropagation()` in the adapter; `GridContextMenuEvent` carries the native
`event` for exactly this purpose. The old grid does the same thing
(`uikit/AVGrid/model/ContextMenuModel.tsx:156`), which confirms this is the convention rather than a
workaround.

### F3 — GR3's scroll-restore effect is deleted, not ported

`GridBody.tsx`'s `pagesModel.onFocus` subscription calls `renderModel.restoreScroll()` because
`display: none` zeroes a container's `scrollTop` while the model keeps the real offset.

av-grid does this itself. `RenderGridModel.onFrameResize` sets a `scrollLost` flag when the grid
measures 0×0 with a non-zero offset, and `RenderGrid.paint` ends with
`if (this.model.scrollNeedsRestore) this.model.restoreScroll()`. The flag is deliberately the *only*
thing that licenses the write, so the library distinguishes "hidden and reshown" from "the user just
scrolled and the event has not been delivered yet" — which is precisely the bug a naive port of this
effect would reintroduce.

Delete the effect and its `pagesModel.onFocus` subscription. Do not reach for
`grid.render.model.restoreScroll()`.

### F4 — right-click over an open cell editor already works, for free

The old grid special-cases this: it stops the event, sets `models.editing.disableBlur = true`, awaits
`showAppPopupMenu(x, y, [])` for the Copy/Paste/Inspect menu, then clears the flag.

av-grid returns early from its context-menu handler when an editor is open
(`GridInteractions.ts:700-710`) *without* calling `preventDefault()`, precisely so the platform can
offer Cut/Paste/spelling. In Persephone that event reaches `GlobalEventService`, which shows the app
menu with `addDefaultMenus()` — the same set the old special case asked for. So the branch is not
ported; it reproduces itself.

`disableBlur` has no equivalent and probably needs no port either — `showAppPopupMenu` restores
`document.activeElement` when the menu closes. **Verify by hand** that the edit is neither committed
nor cancelled when the menu opens over an open editor; if it is, that is a second upstream item, not
a host workaround.

## Implementation plan

**Do F1's upstream av-grid release first.** Nothing below works without it.

### 1. `grid-utils.ts` — identity registry (D3)

- [ ] Delete `idColumnKey`, `createIdColumn`, `removeIdColumn`.
- [ ] Add a module-level `WeakMap<object, string>` and `registerRows(rows, startIndex)`, assigning
      `String(startIndex + i)` per row.
- [ ] `getRowKey(row)` → WeakMap lookup, lazily assigning `r${next++}` for an unregistered row.
- [ ] `getGridData` calls `registerRows` instead of `createIdColumn`; the detect-before-inject
      ordering dance goes away.
- [ ] `detectColumns`: rename `resizible` → `resizable`, drop `filterType: "options"` (now the
      default). Import `detectColumnWidth` from `../../../uikit/DataGrid`.
- [ ] Confirm `GridOutputView.tsx` still compiles untouched — it must.

### 2. `GridEditor.ts` — the model (D1, D2, D3)

- [ ] `GridEditorState`: `rows: any[]` out, `rowCount: number` in. `columns` becomes the narrow
      `GridColumnSetting[]`, not `Column[]`.
- [ ] Add `private _rows: any[]`, `private grid?: DataGridInstance`, `private liveRows()`.
- [ ] `setGrid(grid | null)`, called from `GridBody`. On attach: apply the persisted `sort` and
      `focus`, seed `rowCount`.
- [ ] `GridViewSettings.columns` → the narrow record. The `mirrorHostSettings` read path maps the
      legacy shape (`resizible` read and dropped); the write path emits only the narrow record.
- [ ] `buildColumns(detected, persisted)` — merge persisted onto detected by key, discard persisted
      keys absent from `detected`. The single place columns are assembled.
- [ ] `reparseRows`: set `_rows`, `registerRows`, `grid?.setRows()`, update `rowCount`. Keep the
      `hasSavedColumns` / `resetColumns` semantics, expressed through `buildColumns`.
- [ ] Mutation callbacks become av-grid handlers: `onEdit`, `onAddRows`, `onDeleteRows`,
      `onAddColumns`, `onDeleteColumns`, `onColumnsChange`, `onFocusChange`, `onFiltersChange`,
      `onSortChange`, `onVisibleRowsChange`. Each updates state where state is still involved, then
      calls `scheduleSerialize()`.
- [ ] `scheduleSerialize()` — one coalescing microtask, reads `liveRows()`, keeps the
      `_changedContent` guard.
- [ ] `newRow(index)` — a blank row registered in the identity map, replacing the old `onAddRows`'s
      `[idColumnKey]` object.
- [ ] `newColumn(index)` — the `nextColumnKeys` logic, one column at a time.
- [ ] `getJsonContent` / `getJsonlContent`: drop `removeIdColumn`, read `liveRows()`.
- [ ] `initEmptyPage`: no id column; `resizable`.
- [ ] `onGetOptions`: read `liveRows()`. `filterRows` and `defaultCompare` now import from
      `uikit/DataGrid`.
- [ ] The `focus` / `focusCell` queue events stay — that shape is already right.

### 3. `GridBody.tsx` — the wiring

- [ ] `<AVGrid>` → `<DataGrid>`; drop `FiltersModel`, `FilterBar` and the `useComponentModel` call
      in favour of `filterBar: true`.
- [ ] Queue drain: `grid.focus()` / `grid.focusCell(row, col, true)`.
- [ ] Delete the GR3 `pagesModel.onFocus` effect entirely (F3).
- [ ] `onGrid={editor.setGrid}` replaces `setGridRef` and its two-way `sortColumn` subscription —
      `sort` + `onSortChange` do that job now.
- [ ] `growToHeight={editorConfig.maxEditorHeight}` → `` `${n}px` ``.
- [ ] `onGridContextMenu={showGridContextMenu}` — the app adapter. This is the line that closes
      Rule 6 for this consumer.
- [ ] `rowNoun` stays at its `"row"` default for the data grid.

### 4. `ColumnsOptions.tsx` — the grid in a popover

- [ ] `AVGridModel` → `DataGridInstance` throughout.
- [ ] `prepareEditColumns`: `gridModel.props.columns` → `grid.getColumns()`.
- [ ] `applyChanges`: `models.columns.updateColumns(fn)` → `grid.setColumns(fn(grid.getColumns()))`.
- [ ] `calcInitialSize`: `renderModel.gridRef.current.offsetWidth` → `grid.element.offsetWidth`.
- [ ] `entity="column"` → `rowNoun="column"`.
- [ ] Its inner grid is a separate instance and gets D1's treatment independently: its
      `EditColumnRow[]` rows live in `TComponentState`, so the same freeze applies. Seed once, let
      av-grid own them, read back with `getRows()` in `updateRows` / `updateColumns` / `validate`.
      `state.changed` still drives the Apply/Cancel bar, set from the callbacks.
- [ ] Keep `getRowKey = (row) => row.idx` — this grid's rows are its own, with a real key.
- [ ] Exercise the popover-inside-popover case from US-1019's `in-popover` story panel: an explicit
      host height, and av-grid's filter popover mounting on `document.body` above this one.

### 5. `index.tsx` — chrome

- [ ] `AVGridModel` → `DataGridInstance` in the ref holder.
- [ ] `GridFooterBits` reads `rowCount` instead of `rows.length`.

### 6. `ui/dialogs/poppers/grid-context-menu.tsx` — F2

- [ ] `e.event.stopPropagation()` before `showAppPopupMenu`, with the reason in a comment.

### 7. Script API

- [ ] `GridEditorFacade.rowCount` → `state.rowCount`.
- [ ] `GridEditorFacade.rows` → a **shallow copy** of `liveRows()`. Today it returns a frozen array,
      where script mutation silently no-ops; under D1 it would return the live mutable array, where
      mutation works but neither repaints nor saves. A copy keeps it honest.
- [ ] `editCell(columnKey, rowKey, value)` must **not** use
      `grid.setCellValue(rowIndex, colIndex, …)` — that takes *displayed* indices, which diverge
      from source order under sort or filter. Find the row by key in `liveRows()`, write it,
      `grid.refresh()`, `scheduleSerialize()`.
- [ ] `addRows` / `deleteRows` / `addColumns` / `deleteColumns` route to the grid instance methods,
      which deliberately do not require the `can*` options.

### 8. Verification

Per the epic: through the app, on real files, not through stories. The acceptance list below is the
script.

## Concerns / Open questions

1. **F1 gates the task.** The fix is specified but not built. Implementation cannot start before it
   is released from av-grid's own repository and the pin is bumped — which is the arrangement
   US-1019 established and the reason it is cheap.
2. **`rowCount` is a new reactive field mirroring something av-grid owns.** It is the one piece of
   D1 that duplicates state rather than delegating it. The alternative — `grid.getRows().length` on
   every footer render — is not reactive, and the footer must re-render when the count changes.
   Accepted; it is also why `displayedRowCount` already exists in exactly this shape.
3. **F4's `disableBlur` needs a by-hand check**, and it is the one item that could turn into a
   second upstream change.
4. **The `.pnb` on-disk copy** means D2's legacy read path is exercised by notebook files as well as
   `openFiles.txt`. Both go through `getEditorState`, so one mapper covers both — but a notebook
   saved by an older build is the real test case, and one should be kept.
5. **This task does not delete `uikit/AVGrid`.** Four consumers stay on it (US-1021, US-1022), so
   the tree runs both grids until US-1023 — which is what makes C4 abortable here.
   `ContextMenuModel.tsx` keeps its Rule 6 exemption until then; the roadmap count reaches zero at
   US-1023, not at this task.

## Acceptance criteria

- [ ] F1's upstream av-grid change is released, the pin in `package.json` is bumped, and the version
      is recorded in this document.
- [ ] A JSON file, a CSV file and a JSONL file each open in the grid, and each supports edit,
      add/delete rows, add/delete columns, sort, filter, search, range-select and copy.
- [ ] **A sparse JSON array** (`[{a:1},{a:2,b:3}]`) opens with both columns and does not throw.
- [ ] Save writes correct content for all three formats, with **no `#intrnl-id` in the output**.
- [ ] Close and reopen the file: columns (order, width, hidden, type), filters, sort, search and
      focus all round-trip. Then restart the app and check the same.
- [ ] A file whose columns changed on disk between sessions opens without throwing, dropping the
      columns that no longer exist.
- [ ] An `openFiles.txt` **and** a `.pnb` written by the pre-migration build both restore, with the
      legacy `resizible` field present and ignored.
- [ ] Right-click a cell: Persephone's menu with Persephone icons, exactly one menu, and no generic
      Copy/Inspect menu replacing it (F2).
- [ ] Right-click over an open cell editor: the app's default Copy/Paste menu, and the edit is not
      lost (F4).
- [ ] The columns popover opens, edits, applies and cancels; its filter popover appears above it.
- [ ] Grid in a notebook cell / embedded body: `growToHeight` still caps it.
- [ ] A theme switch with a filter popover, the filter bar and a cell dropdown all open (C4-4).
- [ ] Element-renderer positioning judged **at a scroll offset**, not at row 1 (C4-6).
- [ ] Scroll down, switch to another tab, switch back: the scroll position is kept (F3).
- [ ] Script API: `page.asGrid()` rows, rowCount, editCell, addRows, deleteRows, addColumns,
      deleteColumns and setSearch all behave — including `editCell` on a **sorted** grid.
- [ ] `npm run lint` and typecheck clean; no file outside `uikit/DataGrid/` imports `av-grid`.

## Key before → after snippets

**D1 — the row accessor and the deferred serialize** (`GridEditor.ts`):

```ts
// before — rows in reactive (frozen) state, serialized synchronously
private getJsonContent(): string {
    return JSON.stringify(removeIdColumn(this.state.get().rows), null, 4);
}
onDataChanged = (): void => {
    const content = this.getContentToSave();
    this._changedContent = content;
    this._host?.changeContent(content, true);
};

// after — av-grid owns the array; one coalescing microtask serializes it
private _rows: any[] = [];
private grid?: DataGridInstance;
private _serializeQueued = false;

private liveRows(): any[] {
    return this.grid?.getRows() ?? this._rows;
}

private getJsonContent(): string {
    return JSON.stringify(this.liveRows(), null, 4);
}

/** Coalesces a multi-cell paste or a range delete into one changeContent. */
private scheduleSerialize(): void {
    if (this._serializeQueued) return;
    this._serializeQueued = true;
    void Promise.resolve().then(() => {
        this._serializeQueued = false;
        const content = this.getContentToSave();
        this._changedContent = content;
        this._host?.changeContent(content, true);
    });
}
```

**D2 — the narrow persisted record and the rebuild** (`GridEditor.ts`):

```ts
// before — the library's Column type is the on-disk contract
interface GridViewSettings {
    columns: Column[];
    // ...
}

// after — the record is ours; `resizible` is read from legacy data and dropped
export interface GridColumnSetting {
    key: string;
    name?: string;
    width?: number | `${number}%`;
    hidden?: boolean;
    dataType?: DataType;
}

/** Merge persisted settings onto freshly detected columns, discarding keys that are gone. */
private buildColumns(detected: Column[], persisted: GridColumnSetting[]): Column[] {
    if (!persisted.length) return detected;
    const byKey = new Map(detected.map((c) => [String(c.key), c]));
    return persisted
        .filter((p) => byKey.has(p.key))
        .map((p) => ({ ...byKey.get(p.key)!, ...p }));
}
```

**D3 — identity without touching the row** (`utils/grid-utils.ts`):

```ts
// before — a synthetic property written into the user's data, stripped on every save
export const idColumnKey = "#intrnl-id";
export function getRowKey(row: any) { return row?.[idColumnKey] ?? ""; }
export function createIdColumn(data: any[]) {
    return data.map((row, index) => ({ ...row, [idColumnKey]: index.toString() }));
}

// after — identity beside the row, seeded by index so a persisted focus.rowKey still resolves
const rowKeys = new WeakMap<object, string>();
let nextRowKey = 0;

export function registerRows(rows: readonly any[], startIndex = 0): void {
    rows.forEach((row, i) => {
        if (row && typeof row === "object") rowKeys.set(row, String(startIndex + i));
    });
}

export function getRowKey(row: any): string {
    if (!row || typeof row !== "object") return "";
    let key = rowKeys.get(row);
    if (key === undefined) {
        key = `r${nextRowKey++}`;
        rowKeys.set(row, key);
    }
    return key;
}
```

**F2 — the adapter fix** (`ui/dialogs/poppers/grid-context-menu.tsx`):

```tsx
// before — the event bubbles to GlobalEventService, which replaces this menu with a generic one
export function showGridContextMenu<R>(e: GridContextMenuEvent<R>, items, extra?): void {
    const menu = [...(extra ?? []), ...adaptIcons(items)];
    if (!menu.length) return;
    void showAppPopupMenu(e.x, e.y, menu);
}

// after
export function showGridContextMenu<R>(e: GridContextMenuEvent<R>, items, extra?): void {
    const menu = [...(extra ?? []), ...adaptIcons(items)];
    if (!menu.length) return;
    // `GlobalEventService.handleContextMenu` is a document-level listener that shows a menu
    // without checking `defaultPrevented`, and `showAppPopupMenu` closes any open menu first —
    // so without this the generic Copy/Inspect menu silently replaces the grid's.
    e.event.stopPropagation();
    void showAppPopupMenu(e.x, e.y, menu);
}
```

## Files changed

| File | Change |
|---|---|
| `C:\projects\av-grid\src\validate.ts` | **Upstream, first.** F1 — `validateColumns` samples `sampleKeys()`'s 50-row union, with a full scan on the failure path only. Plus four tests in `validate.test.ts`, a release, and a version bump |
| `package.json` | Bump the exact `av-grid` pin to the F1 release |
| `src/renderer/editors/grid/GridEditor.ts` | Heaviest. D1 (rows out, `_rows` + `liveRows()` + `rowCount` + `scheduleSerialize`), D2 (`GridColumnSetting`, `buildColumns`, legacy read), av-grid callback handlers, `setGrid`, `newRow`, `newColumn` |
| `src/renderer/editors/grid/GridBody.tsx` | `<DataGrid>`, `filterBar: true`, queue drain onto `grid.focus()` / `grid.focusCell()`, `onGridContextMenu`, `growToHeight` as a CSS string, GR3 effect **deleted** (F3) |
| `src/renderer/editors/grid/components/ColumnsOptions.tsx` | `DataGridInstance`, `getColumns()` / `setColumns()` / `element.offsetWidth`, `rowNoun="column"`, D1 applied to its own inner grid |
| `src/renderer/editors/grid/utils/grid-utils.ts` | D3 — WeakMap identity registry replaces the `#intrnl-id` column; `resizible`→`resizable`; `detectColumnWidth` imported from `uikit/DataGrid` |
| `src/renderer/editors/grid/index.tsx` | `DataGridInstance` in the ref holder; footer reads `rowCount` |
| `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` | F2 — one `stopPropagation()` line and its comment |
| `src/renderer/scripting/api-wrapper/GridEditorFacade.ts` | `rowCount` from state; `rows` returns a shallow copy; `editCell` finds by key rather than by displayed index |
| `doc/tasks/US-1020-grid-editor-av-grid/README.md` | Record the released av-grid version and any divergence found during implementation |
| `doc/epics/EPIC-057.md`, `doc/active-work.md` | Status |

## Files that need NO changes

Checked, so implementation does not re-investigate them:

- `src/renderer/editors/grid/components/CsvOptions.tsx` — delimiter / header popover. Talks only to
  `GridEditor.setDelimiter` / `toggleWithColumns`, never to a grid.
- `src/renderer/editors/grid/util.ts` — the format enum.
- `src/renderer/scripting/api-wrapper/Grid.ts`, `PageWrapper.ts` — import `GridColumn` (the
  script-facing DTO in `grid-utils.ts`) and `GridEditor` as a type. `GridColumn` is deliberately
  **not** av-grid's `Column` and does not change.
- `src/renderer/editors/log-view/logTypes.ts` — same, `GridColumn` only.
- `src/renderer/editors/log-view/items/GridOutputView.tsx` — still on `uikit/AVGrid` until US-1022.
  It imports `getGridDataWithColumns` and `getRowKey` from `grid-utils.ts`, which is why D3 keeps
  that helper module-level; it must compile untouched, and that is an acceptance criterion.
- `src/renderer/uikit/AVGrid/**` — the old grid stays in the tree until US-1023, including
  `model/ContextMenuModel.tsx` and its Rule 6 exemption.
- `src/renderer/uikit/DataGrid/**` — US-1019's shim. No change is expected; if one turns out to be
  needed, that is a finding worth recording, since it would mean the shim's prop tiers were wrong.
- `src/renderer/api/internal/GlobalEventService.ts` — F2 is fixed in the adapter, not here. Adding a
  `defaultPrevented` check to the global handler would change behaviour for every other caller in
  the app and is out of scope.
- `src/renderer/theme/p-vars.ts`, `theme/themes/index.ts` — the `--p-*` bridge already ships.

## What implementation changed about the plan

Six divergences. Two are bugs the plan would have shipped, and one of those would have made the
columns popover useless.

### F5 — `isStatusColumn` means something else in av-grid, and it would have frozen the popover

`ColumnsOptions`' three columns — the visibility eye, Type, Key — all carried
`isStatusColumn: true`. Under the React grid that was a *header* flag: no resize, no drag-reorder
(`uikit/AVGrid/HeaderCell.tsx`). av-grid reads it as "not a data column" and **refuses to edit
it** (`EditingModel.ts:123`, `AVGrid.ts:957`), so the popover whose only job is editing those
three fields would have opened read-only, with no error and nothing in the console.

Dropped from all three, with `resizable: false` carrying the part of the old intent that still
matters. What is lost is that the user can drag those three headers around; it is cosmetic,
because this grid's column layout is not persisted. Not an upstream case: av-grid's meaning is the
coherent one — the checkbox column is what the flag is for — and the old call site was leaning on
a side effect.

### F6 — applying a column **rename** threw, until the order was reversed

`applyChanges` called `gridModel.setColumns(...)` and then rewrote the rows. But `setColumns`
validates the new columns against the rows the grid currently holds, exempting only keys it
already has (`AVGrid.ts:481`) — and a renamed key is not one of those. So the new key existed
nowhere in the data yet and the validation threw `Unknown column`.

Rows are rewritten first now. `setRows` deliberately does not re-validate columns, so the reverse
order is safe in both directions. This is a genuine new constraint from the migration, not a
pre-existing bug: the React grid validated nothing.

### The rows handed back on each render are read from the grid, not cached

The plan had the view passing a `_rows` seed. That is wrong: av-grid **replaces** its row array
when rows are added (`StructureModel.addRows`: `const source = [...this.model.options.rows]`), so
a cached seed goes stale the moment the user adds a row — and the shim, seeing a new identity,
would push the stale array back and silently drop the row. `rowsForGrid()` reads through to
`grid.getRows()`, so the identity the shim diffs is always the one av-grid already has and the
push is either skipped or a no-op.

### `onAddRows` and `onDeleteRows` cannot read the new row count

Both fire *before* the change — that is what lets a `false` return refuse it — so neither can
observe the result. The count is synced inside `scheduleSerialize`'s microtask instead, which runs
after. One deferred step now does both jobs.

### `state.columns` stays the full `Column[]`; the narrow record is a separate field

D2 said state would hold `GridColumnSetting[]`. It holds live columns, and `_columnSettings` holds
the persisted projection alongside — because the view has to hand av-grid real columns, and going
through the narrow form and back on every render would be a rebuild for nothing.

That put the columns into immer, so the same freeze question as D1 had to be answered for them:
av-grid never mutates a column or the column array in place — `ColumnsModel` resizes with
`{ ...c, width }` and `addColumns` copies with `[...existing]` — so frozen columns are safe. The
answer differs from D1's only because the library's own discipline differs, which is worth knowing
before US-1021 and US-1022 make the same call.

### `GridOutputView` needed one line after all

The plan listed it as needing no changes. `grid-utils` now returns av-grid columns while that view
still renders the React grid, and the two `Column` types are not assignable — av-grid's `name` is
optional and its `filterType` wider. It takes a cast with a comment, removed when US-1022 moves
the view. The runtime shapes agree; only the types disagree.

### Accepted as-is: filters are still persisted in the library's shape

D2 narrowed the *columns* on disk but `filters` still persist av-grid's `Filter[]`. Not a
regression — the old grid persisted its own `TFilter[]`, and av-grid's type is a superset that
reads the old data unchanged — and av-grid documents `getFilters()` output as safe to store and
hand back to `setFilters()`. Narrowing it too would be the same exercise for a smaller payoff, and
is not done here.

## F1's release, and the one step left

The upstream fix is **av-grid 2.2.1**, committed as `fac663c` and tagged `v2.2.1` in
`C:\projects\av-grid`:

- `validateColumns` unions keys over `sampleKeys()`'s 50-row sample instead of reading row 0, then
  scans the remaining rows **only** on the branch about to throw. A typo still throws with the
  same message shape; sparse data does not.
- `available()` builds its list from the union, so the message no longer under-reports on the data
  that motivated the change.
- The `sort` and `filters` unknown-column checks are untouched, as specified.
- Four tests added. **811 pass**, including the pre-existing `"nmae"` expectations.

**The release is local.** `npm version patch` bumped, synced the two version constants and tagged;
publishing is `git push --follow-tags`, which is what triggers the Actions workflow that publishes
to npm. That push has not been made. Meanwhile Persephone's `package.json` pins `2.2.1` and
`node_modules/av-grid` holds the packed 2.2.1 build, so the tree builds and runs — but
`package-lock.json` still records 2.2.0 and `npm ci` cannot resolve 2.2.1 until it is published.
**Sequence to finish:** push the tag from `C:\projects\av-grid`, watch the workflow, then
`npm install` here to regenerate the lock.

### F7 — the context menu would not close on a cell click, and the cause was in `Popover`

Found in testing. Right-click a cell, then left-click any cell: the menu stayed open. Clicking the
grid's whitespace, or anywhere else in the app, closed it normally.

`PopoverView` dismissed on a `document` **`mousedown`** listener. But `mousedown` is a
*compatibility* event — calling `preventDefault()` on the `pointerdown` that precedes it suppresses
it outright — and av-grid does exactly that on a left-press on any data cell
(`GridInteractions.onCellPointerDown`), to stop the browser starting a native text selection that
would follow a range drag out of the grid. So no `mousedown` was ever dispatched and the dismissal
listener never ran.

Every branch of the report follows from that: whitespace has no cell under the pointer, so av-grid
returns before the `preventDefault`; and right-click still *opened* the menu because av-grid returns
on `e.button !== 0` before it too.

**Fixed by listening for `pointerdown`** (`uikit/Popover/PopoverView.tsx`). Dismissal must not
depend on an event that a legitimate drag gesture is allowed to suppress; `pointerdown` always
fires, cannot be cancelled away, and covers touch and pen for free. There was exactly one such
listener in the tree, so this is the whole fix.

**Not an upstream case.** `preventDefault()` on pointerdown is the standard way to suppress native
selection during a drag. The defect was Persephone's dismissal contract, and it was *latent* rather
than new: the React grid handled cell presses through React's `onMouseDown` and never touched
pointerdown, so `mousedown` always arrived and the fragility never showed. Adopting a library that
does the ordinary thing is what made it reachable — worth expecting again in US-1021 and US-1022,
where any other host listener keyed on a compatibility event has the same exposure.

Left as-is: pressing exactly on a **column-resize grip** while a menu is open does not close it,
because av-grid calls `stopPropagation()` on that specific pointerdown (`GridInteractions.ts:211`).
The resize starts as intended, and covering it would mean a capture-phase listener for a case that
does not arise.
