# US-1238 — Migrate components and editors to av-grid `RenderGrid`

## Goal

Migrate the remaining `uikit/VirtualGrid` consumers outside the three UIKit primitives owned by US-1237 to av-grid, while preserving fixed-height behavior and defining the measured-row-height API that US-1235 must provide first.

This is an investigation document. It records verified requirements and an implementation plan; it does not implement the migration.

## Background

EPIC-079 establishes the overall migration from the forked `src/renderer/uikit/VirtualGrid/` engine to av-grid and records five library gaps. US-1237 already compared the option surfaces, chose the companion-layer seam, and documented the primitive migration requirements. This document builds on that work rather than repeating it; see [`EPIC-079.md`](../../epics/EPIC-079.md) and [`US-1237`](../US-1237-uikit-primitives-to-render-grid/README.md).

The implementation is intentionally blocked on US-1235. The consumer inventory below is the requirements input for that measured-height layer, especially its cell lifecycle contract.

## Consumer inventory

The renderer-wide audit used `rg` over `src/renderer` for `VirtualGrid`, `VirtualFlexGrid`,
`GridModelCapability`, `RenderCellFunc`, and imports from the UIKit barrel. The only external
consumer files are the files below plus the three UIKit primitive paths owned by US-1237. No
consumer imports a VirtualGrid symbol through `src/renderer/uikit/index.ts`; all matches are
direct imports from `uikit/VirtualGrid` or its files. The `uikit/VirtualGrid/` implementation and
`uikit/shared/async-ref.ts` are internal fork files, not additional consumers.

| Consumer | Verified classification | Current dependency and migration consequence |
|---|---|---|
| `src/renderer/editors/log-view/LogBodyView.ts` | Measured-height; genuine engine work | Constructs `VirtualFlexGridView` at `:105` and owns measured, heterogeneous log cells. Migrate to the US-1235 measured companion and av-grid `RenderGridModel`. |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | Measured-height; genuine engine work | Constructs `VirtualFlexGridView` at `:273` and measures note roots. Migrate after US-1235. |
| `src/renderer/editors/notebook/NoteItemViewModel.ts` | Measured-height; indirect | Owns note-row editing and wheel behavior; it has no engine import or grid construction. Its `getScrollContainer` comment at `:24` is the only fork vocabulary and can be made engine-neutral when the measured host API is renamed. |
| `src/renderer/components/file-search/FileSearchView.ts` | Fixed-height; genuine engine work | Constructs `VirtualGridView` at `:252`, owns the renderer and pooled cell records, and must move to `RenderGrid`. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Fixed-height; indirect through `TreeView` | Imports only `RowAlign` (`:5`) for `revealItem` (`:130`); it does not construct or hold a grid. Update only the type source after US-1237 exposes the av-grid type. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Fixed-height; indirect through its item renderer | Stores the capability callback, calls `scrollToRow(0)` at `:316`, and forwards `onGridModel` at `:352`; it does not construct a grid. Its `renderItems` child is selected by `CategoryEditor` and is a `LinksListView` or `LinksTilesView`. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Fixed-height; indirect through its item renderer | Uses `GridModelCapability` only in the `CategoryItemsRendererProps.onGridModel` contract (`:70`); no engine construction or rendering logic. |
| `src/renderer/editors/link-editor/LinksList.ts` | Fixed-height; indirect | Defines only the `onGridModel` prop type (`:23`); the engine owner is `LinksListView`. |
| `src/renderer/editors/link-editor/LinksListView.ts` | Fixed-height; genuine engine work | Constructs `VirtualGridView` at `:126`, passes fixed-list options, publishes its model, and owns pooled row subtrees/listeners. |
| `src/renderer/editors/link-editor/LinksTiles.ts` | Fixed-height; indirect | Defines only the `onGridModel` prop type (`:22`); the engine owner is `LinksTilesView`. |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Fixed-height; genuine engine work | Constructs `VirtualGridView` at `:141`, computes columns from `onResize`, and owns pooled tile subtrees/listeners. |
| `src/renderer/editors/link-editor/LinkBody.ts` | Fixed-height; indirect through `LinksListView`/`LinksTilesView` | Transfers each child view's `GridModelCapability` to `LinkEditor` at `:383-388`; it does not construct a grid. |
| `src/renderer/editors/link-editor/LinkEditor.ts` | Fixed-height; indirect | Stores the capability at `:111` and `:374`, and clears it during disposal; no engine import beyond the type. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts` | Fixed-height; indirect through `LinksListView` | Receives the child model at `:178` and calls `scrollToRow` at `:253`; no grid construction. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts` | Fixed-height; indirect through `LinksListView` | Receives the child model at `:171` and calls `scrollToRow` at `:246`; no grid construction. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Fixed-height story wiring | Imports `virtualGridStory` at `:59` and registers it at `:75`. The actual story module (`src/renderer/uikit/VirtualGrid/VirtualGrid.story.ts`) constructs both a fixed and an unregistered measured demo; the fixed registered story must be relocated or rewritten before US-1239 deletes the fork directory. |

This reconciles the epic's list as follows:

- The listed consumer paths are current and complete for code outside the three US-1237
  primitives. There is no missed direct renderer consumer.
- `src/renderer/uikit/index.ts:78-94` does re-export the fork views, models, props, and native
  aliases, but the barrel-import audit found no renderer file importing those VirtualGrid names
  through that barrel. Its exports are a cleanup/compatibility concern for US-1237/US-1239, not
  another US-1238 consumer.
- `src/renderer/uikit/shared/async-ref.ts` appears in EPIC-079's migration surface, but it is
  an internal dependency of `VirtualGridModel.ts`, not a consumer in this task; the epic already
  assigns its deletion to US-1239.
- `src/renderer/uikit/VirtualGrid/VirtualGrid.story.ts` is likewise an internal fork story
  module, reached by `storyRegistry.ts`; it is not a separate external consumer, but its fixed
  story implementation must be moved as part of the story-registry migration.
- The scan found no `VirtualFlexGridModel` consumer outside `VirtualFlexGridView`; measured
  behavior is concentrated in the two editor bodies and their note/log cell renderers.

The inventory contains five genuine engine-owning consumer files (`LogBodyView`,
`NotebookBodyView`, `FileSearchView`, `LinksListView`, and `LinksTilesView`), ten indirect
capability/type consumers, and one story-registry wiring entry whose imported story needs a
fixed-engine rewrite. The ten indirect files should not be planned as separate virtualization
engine migrations: they become av-grid-compatible when their child `Tree`, `LinksListView`, or
`LinksTilesView` seam is migrated by US-1237/US-1238.

## Measured-height layer requirements

The existing layer is deliberately composed over the fixed engine. `VirtualFlexGridModel` owns
row-height policy; `VirtualFlexGridView` owns DOM observation and adapts its inner
`VirtualGridView`. US-1235 should preserve that separation while replacing the inner engine with
av-grid's `RenderGrid`.

### Model seam

`src/renderer/uikit/VirtualGrid/types.ts:82-85` defines the model capability as exactly:

```ts
interface GridModelCapability {
    update(rerender?: RerenderInfo): void;
    scrollToRow(row: number, rowAlign?: RowAlign): Promise<void>;
}
```

`VirtualFlexGridModel.ts` uses no other model member: `setGridModel` stores the capability at
`:67-69`, and `commitRowHeight` calls only `gridModel?.update(...)` at `:98-102`.
`VirtualFlexGridView` supplies the inner model at `:149` and exposes the same two-method
capability at `:104-106`. av-grid's `RenderGridModel` already exposes both `update` and
`scrollToRow`, so this is genuinely the complete model-side seam, subject to the `fromRow`
requirement below.

### Cell lifecycle seam and release meaning

The shell callbacks are a separate seam from the model. `VirtualGridView.ts:57` declares
`onCellAttached`, and `:63` declares `onCellReleased`; `syncRegion` invokes them at `:634` and
`:651`. The declaration and implementation comments establish these contracts:

- `onCellAttached(element)` runs after a cell newly enters the active render set and after the
  shell has ensured it is attached to its region. It is also called when a retained, hidden pooled
  element is re-admitted, even if `parentElement === parent`; the fork comment at `:624-633`
  says this re-admission notification is needed because the cell may have measured zero while
  hidden.
- `onCellReleased(element)` runs after the cell leaves the active render set and immediately
  before it enters the pool. The element may remain attached to its region but hidden. It is not
  defined as “physically detached”; the only physical detach is the bounded-pool overflow path
  after the callback (`:653-657`).

`VirtualFlexGridView.ts:73-79` handles release by resolving the nominated content root (or the
cell itself), calling `ResizeObserver.unobserve`, deleting the target-to-row mapping, deleting the
cell-to-target mapping, and only then forwarding the optional consumer `onCellReleased` callback.
At `:81-96`, attach reuses the mapping, records an immediate `clientHeight`, and schedules one
`requestAnimationFrame` measurement after layout, guarded by cell identity, target identity, row
identity, and the inert flag.

US-1235 must therefore expose lifecycle events from the av-grid shell with the same active-set
semantics. “Released” must mean “no longer displayed/active and entering the pool,” not “detached
from the DOM.” This is required for the US-1236 change: av-grid's ordinary eviction is being
changed to retain cells in place, so making release synonymous with detachment would stop
measurement bookkeeping for hidden retained cells and would also make the lifecycle contract
dependent on the pool overflow limit. On re-admission, attach must still fire and remeasure.
The companion must not introduce a consumer cleanup-on-eviction callback: current consumers
dispose/rebuild retained subtrees only on kind changes or final view disposal.

### Height policy and measurement mechanics

The following behaviors are requirements, not optional implementation details:

| Behavior | Source evidence | Required result in US-1235 |
|---|---|---|
| Per-row observation | `VirtualFlexGridView.ts:27`, `:59-70`, `:145` creates one `ResizeObserver`; each nominated root is mapped to its row and observed. | Observe the nominated content root, fall back to the cell when no root is nominated, unobserve on release/replacement, and ignore entries whose element/row mapping is gone. |
| Initial synchronous + after-layout measurement | `VirtualFlexGridView.ts:53-57` measures during render; `:87-95` measures immediately on attach and once in the next animation frame. | Capture the current box as soon as the cell is admitted and once after layout; guard delayed work against disposal and cell reuse. |
| 50 ms debounce | `VirtualFlexGridModel.ts:6` sets `ROW_HEIGHT_DEBOUNCE_MS = 50`; `:45-55` creates one memoized debouncer per row. | Coalesce ResizeObserver churn per row for 50 ms before committing geometry. Disposal may allow the final no-op callback but must not reschedule indefinitely (`:46-48`). |
| Clamp | `setRowHeight` at `:71-78` clamps before queuing; `clampHeight` at `:105-109` applies `maxRowHeight` then a minimum of `minRowHeight || 24`. | Apply the same min/max order and defaults to both observed heights and initial hints; ignore zero heights. |
| Initial-height hint | `rowHeight` at `:30-38` returns a committed height, otherwise `getInitialRowHeight(row)` through the same clamp. | Accept a row-index hint for already-known log/note heights so first geometry is close before DOM measurement. |
| New-row fallback | `:40-43` uses `minRowHeight || defaultFlexRowHeight` when `preferMinHeightForNewRows`; otherwise uses the last measured height or the numeric `rowHeight`/engine default (`:88-93`). | Preserve the explicit opt-in minimum fallback and the last-height fallback exactly. |
| Stable row-height identity | `VirtualFlexGridModel.ts:29-30` binds `rowHeight` once; the comment explains that `VirtualGridModel` compares function identity in its input gate. | Expose one stable function for the lifetime of the companion. Updating props must mutate policy, not replace the function passed to `RenderGridModel`, or every update becomes a full geometry input change. |
| Geometry invalidation | `commitRowHeight` writes the committed height and calls `update({ fromRow: row })` at `:98-102`. | Invalidate geometry from the changed row onward, not merely repaint the changed row. This needs the public av-grid gap below. |

### Newly confirmed av-grid gap: `RerenderInfo.fromRow`

Persephone's `RerenderInfo` adds `fromRow?: number` at
`src/renderer/uikit/VirtualGrid/types.ts:67-75` and documents it as geometry invalidation. The
measured layer relies on it at `VirtualFlexGridModel.ts:102`: changing row *r* changes every
following row's start offset and can change the total inner height, while the rendered DOM content
of those rows has not changed.

av-grid's public `C:\projects\av-grid\src\render\types.ts:72-80` has `all`, `rows`, `columns`,
`cells`, and `force`, but no `fromRow`; the shipped public declarations expose the same shape.
Without this field, passing the current call does not type-check. Replacing it with
`update({ rows: [row] })` is not equivalent: that repaints one row's cells but leaves the geometry
for all rows after it and the inner extent based on stale row starts. Replacing it with
`update({ all: true })` would invalidate more content than necessary and still fails to state the
geometry-specific contract the layer needs.

This is a newly confirmed sub-gap of US-1235/EPIC-079 Gap 2 and must be added explicitly to the
US-1235 av-grid deliverable. It is not one of the four option/lifecycle gaps US-1237 had to solve;
US-1237 did not need geometry invalidation because its rows are fixed height. It is the one gap
found here that is not separately named in the epic's five-gap list.

### Consumer-specific measured requirements

#### `LogBodyView`

`LogBodyView.ts:5-6` imports the measured view and `Percent`; the complete `gridProps()` object at
`:223-224` passes these options:

| Option | Value |
|---|---|
| `name` | `"log-flex-grid"` |
| `rowCount` | `() => this.projection.entryCount` |
| `columnCount` | `2` |
| `columnWidth` | `column === 0 ? "100%" : 40` (`RIGHT_GUTTER`) |
| `renderCell` | the stable bound `this.renderCell` |
| `fitToWidth` | `true` |
| `minRowHeight` | `18` |
| `getInitialRowHeight` | looks up the entry and calls `editor.getEntryHeight(entry.id)` |
| `preferMinHeightForNewRows` | `true` |

The renderer at `:66-101` handles the two-column shape by returning `undefined` for column 1,
prefers a same-kind `params.previous`, then calls `params.recycle?.(kind)` and finally creates a
`div`. It calls `params.setReuseKey?.(cell, kind)` at `:72`, creates or updates a
`LogEntryWrapperView`, nominates that view root with `params.measure(...)`, and measures the cell
on render failure. Its record is keyed by cell in a `WeakMap` and also held in `cellRecords` so
all retained row views can be disposed at `:119-129` and failed records can be discarded at
`:218-221`.

The view mounts the measured grid at `:105-112`, obtains its scroller through `grid.scrollElement`
(`:61`), and makes these imperative model calls:

- `grid.gridModel?.update({ all: true })` when the global timestamp projection changes (`:143`)
  and on a full log parse/clear (`:184`);
- `grid.gridModel?.update({ rows: rows ?? [] })` for a published partial log change (`:186`);
- `grid.gridModel?.scrollToRow(count - 1, "bottom")` immediately and from the 50/150/300 ms
  auto-scroll timers (`:198-199`), with timer cleanup at `:202`.

It passes no `onCellAttached` or `onCellReleased` prop. Lifecycle measurement is wholly delegated
to the measured companion: `measure` supplies the nominated content root, while the consumer's
own record set keeps view ownership through pool release and final disposal. US-1235 must not
require LogBodyView to receive a physical-detach event.

#### `NotebookBodyView`

`NotebookBodyView.ts:6-9` imports the measured view and `Percent`. Its `gridProps()` at `:299-310`
passes:

| Option | Value |
|---|---|
| `name` | `"notebook-flex-grid"` |
| `rowCount` | the stable `rowCount` function returning `filteredCount` |
| `columnCount` | `1` |
| `columnWidth` | `"100%"` as `Percent` |
| `renderCell` | the stable bound `this.renderCell` |
| `fitToWidth` | `true` |
| `minRowHeight` | `100` |
| `maxRowHeight` | `800` |
| `getInitialRowHeight` | looks up the filtered note and calls `editor.getNoteHeight(note.id)` |

There is no `preferMinHeightForNewRows`, explicit `height`, `onResize`, or lifecycle callback in
the consumer options. The renderer at `:102-158` prefers same-kind `previous`, then keyed
`recycle`, calls `params.setReuseKey?.(cell, kind)` at `:121`, creates/updates `NoteItemView`,
and nominates `record.view.root` via `params.measure` (`:146`). The error path marks and disposes
the failed record and measures the cell fallback (`:148-156`). `cellRecords` and
`ownedNoteViews` preserve disposal ownership; `leaveGrid()` at `:289-297` releases the grid child
and disposes all retained note views.

The grid is created and mounted in `enterGrid()` at `:263-275`, updated with
`grid.update(this.gridProps())` when it already exists (`:267`), and exposed to note rows through
`getScrollContainer` (`:314-315`). Projection changes call only
`this.grid?.gridModel?.update({ all: true })` at `:235`; NotebookBodyView itself makes no
`scrollToRow` call. It passes no cell lifecycle callback, so the same companion-owned attach,
release, observer, and delayed-measurement contract applies as for logs.

The av-grid API reference confirms the keyed pool covers both call sites. Its engine section
requires the renderer order `p.previous ?? p.recycle?.() ?? document.createElement("div")`
(`C:\projects\av-grid\docs\api.md:2050-2061`), and the reuse-key section shows the exact
`p.setReuseKey?.(cell, kind)` call (`:2085-2105`). The current source forwards `setReuseKey` from
`RenderGrid` into `RenderGridModel` (`C:\projects\av-grid\src\render\RenderGrid.ts:192-196`),
and `RenderCellParams` exposes keyed `recycle` plus `setReuseKey`
(`C:\projects\av-grid\src\render\types.ts:151-187`). Thus US-1238 does not need an av-grid
keyed-pool extension; it must preserve the existing `previous` same-kind guard and key stamping.

## Fixed-height consumer findings

US-1237's option-surface comparison and recommended seam apply directly here: use av-grid's
`RenderGrid(host, options)` shell, retain `RenderGrid.model` for imperative model operations, and
use public render types. The fixed consumers below do not need the measured companion, lifecycle
callbacks, or `fromRow`; those requirements belong only to the two measured editor bodies.

### `FileSearchView`

`FileSearchView.ts:252-259` constructs a one-column fixed grid with exactly these options:
`rowCount: () => this.filtered.length`, `columnCount: 1`, `rowHeight: 22`,
`columnWidth: () => "100%" as \`${number}%\``, `renderCell: this.renderCell`, and
`fitToWidth: true`. The renderer at `:284-320` uses `params.previous ?? params.recycle?.() ??
document.createElement("div")`, applies `applyCellStyle`, and maintains a `CellRecord` by cell.
It supports two row kinds (`file` and `line`) by replacing the inner children when `record.kind`
changes; it does not use keyed recycle or `setReuseKey`. The click listener is installed once per
cell and reads the current record.

The view calls `this.grid?.model.update({ all: true })` when shared file icons invalidate
(`:75-79`) and `update({ rows })` for a results projection change (`:149-166`). It creates the
grid in `enterGrid()` and currently appends/mounts it (`:251-268`), then disposes and removes it
in `leaveGrid()` (`:270-281`). The av-grid conversion must construct `new RenderGrid(this.gridHost,
options)`, rely on constructor mounting, call `destroy()` in the existing failure/leave paths, and
preserve the idempotent arm transitions. No cell lifecycle callback is consumed.

### `LinksListView` and `LinksTilesView`

`LinksListView.ts:143-152` passes fixed options `rowCount: this.rowCount`, `columnCount: 1`,
`rowHeight: 24`, `columnWidth: () => "100%" as Percent`, `renderCell`, `fitToWidth: true`, and
`onView`. Its stable renderer (`:107-121`) prefers `previous`, then unkeyed `recycle`, and creates
one `ListItemView`/action subtree per pooled cell. `admitCell` at `:281-312` performs a total
record/style write and updates selection, drag, tooltip, and action state. It has no measured row
root and no lifecycle callback; `ownedViews` and `cellRecords` are disposed only when the view is
disposed (`:126-139`). The model callback is a parent notification, not an engine requirement.

`LinksTilesView.ts:160-171` passes `rowCount`, `columnCount`, `rowHeight` from
`TILE_DIMENSIONS[viewMode].cellHeight`, `columnWidth: () => "100%" as Percent`, `renderCell`,
`fitToWidth: true`, `onResize`, and `onView`. Its renderer at `:97-108` maps row/column to a link,
uses unkeyed `previous`/`recycle`, and admits either a populated tile or an empty trailing cell.
`onGridResize` at `:116-133` recalculates the column count and calls `model.update({ all: true })`
when width or column mapping changes. It calls `model.update` for changed link rows at `:187-190`
and favicon/image invalidations at `:247-253`, and calls `model.scrollToRow(0)` when links or view
mode changes (`:191`). The cell subtree is fixed-height despite image loading and has no measured
height or lifecycle callback.

Both views currently create `VirtualGridView`, append its root, and call `mount`; the migration
must use `RenderGrid`'s host constructor and `destroy()`. Because `RenderGrid` has no `onView`
option, preserve the existing `onGridModel` callback semantics by publishing `grid.model` after
construction and publishing `null` during teardown. Preserve all retained child-view ownership
and listener behavior. These homogeneous fixed rows do not need `setReuseKey`; the av-grid keyed
pool is nevertheless available and is confirmed only as a compatibility capability, not a reason
to change these renderers.

### Indirect fixed-height consumers

The following files should move only their type imports to the av-grid-owned model/type surface
selected by US-1237; their runtime behavior should remain unchanged:

- `TreeProviderViewModel.ts` exposes `revealItem(value, align?: RowAlign)` at `:130` and never
  constructs a grid. Its runtime implementation delegates to the `TreeView` path in
  `TreeProviderViewImpl.ts:168-171`.
- `CategoryViewModel.ts` carries `onGridModel` in `CategoryItemsRendererProps` at `:59-70`.
  `CategoryViewImpl.ts` stores the callback, calls `scrollToRow(0)` only on view-mode changes
  (`:316`), and forwards the callback at `:352`/`:375-378`. `CategoryEditor.ts:358-385` selects
  `LinksListView` or `LinksTilesView` and forwards the same callback, so the category shell has no
  engine migration of its own.
- `LinksList.ts`, `LinksTiles.ts`, `LinkBody.ts`, and `LinkEditor.ts` only define, transfer, or
  store the two-method grid capability. `LinkBody.ts:383-388` receives the child model;
  `LinkEditor.ts:111` and `:374` stores it and clears it at disposal. They do not construct an
  engine.
- `LinkHostnamesNavigationPanel.ts` and `LinkTagsSecondaryView.ts` receive a model from
  `LinksListView` and call `scrollToRow(row, "nearest")` at `:253` and `:246`, respectively.

These are the cheap majority. They must not grow new grid wrappers or duplicate av-grid shell
logic. After `TreeView` is migrated by US-1237 and the two link views are migrated here, each
file should either import the av-grid `RenderGridModel` type directly or consume a shared
two-method type whose `update` parameter is the av-grid public `RerenderInfo`.

### Story registry

`storyRegistry.ts:59` imports `virtualGridStory` from `VirtualGrid.story.ts` and registers it at
`:75`. The registered story is the fixed demo (`VirtualGridDemoView`); the same module also defines
`virtualFlexGridStory`, but no renderer file references that export. Before US-1239 removes
`src/renderer/uikit/VirtualGrid/`, move the fixed story implementation to a non-fork story module
or replace it with a `RenderGrid` story and update this one registry import. Preserve the existing
story id, controls, stats display, and styling. Do not make the unregistered measured demo a new
US-1238 consumer unless the project intentionally decides to register it; if it is retained, it
must use the US-1235 companion and its measured API.

## Implementation plan

1. **Land the measured-layer contract in US-1235 before this task.** In av-grid, add a generic
   companion API (the implementation names used by this plan are `MeasuredGridModel` and
   `MeasuredGridView`) composed over `RenderGrid`, not a second geometry engine. Its public props
   must extend the av-grid shell/render options with `minRowHeight`, `maxRowHeight`,
   `getInitialRowHeight`, `preferMinHeightForNewRows`, and a renderer callback receiving
   `measure(element)`. Its public model must provide the stable `rowHeight` function and the
   `GridModelCapability` methods below. The companion must own observer setup/teardown, delayed
   measurement cancellation, nominated-root bookkeeping, and the `RenderGrid` instance.

   Before:

   ```ts
   import { VirtualFlexGridView } from "../../uikit/VirtualGrid/VirtualFlexGridView";

   const grid = new VirtualFlexGridView({ ...props, renderCell });
   host.append(grid.root);
   grid.mount();
   ```

   After the US-1235 public API exists:

   ```ts
   import { MeasuredGridView } from "av-grid";

   const grid = new MeasuredGridView(host, { ...props, renderCell });
   // The constructor owns the RenderGrid shell and its initial paint.
   grid.gridModel?.update({ all: true });
   ```

   The concrete names may be changed only as part of US-1235, but the documented shape and
   behavior are binding for this migration. Do not copy `VirtualFlexGridModel.ts` into
   Persephone under a new name; that would leave the fork in place.

2. **Close the av-grid blockers that this plan consumes.**

   - US-1235 must add the shell-level `onCellAttached`/`onCellReleased` callbacks with active-set
     release semantics, the measured companion, and `RerenderInfo.fromRow` plus its geometry
     handling. The public `GridModelCapability` should be the two-method interface with
     `update(rerender?: RerenderInfo)` and `scrollToRow(row, align?)`.
   - US-1236 must make ordinary eviction retain cells without detaching and admission avoid moving
     an already-attached cell. This is required by the retained `LogEntryWrapperView`,
     `NoteItemView`, `ListItemView`, and tile subtrees; do not compensate in consumers.
   - US-1237 must finish first for the indirect paths. It already owns `ListBox`, `Tree`, and
     `Autocomplete`, and its sibling document records the option comparison, recommended
     `RenderGrid` seam, after-paint scrolling dependency, keyed-pool conclusion, styling helper,
     and the US-1236/US-1241 coordination. US-1240 and US-1241 therefore remain prerequisites
     for the indirect `ListBox`/`Tree` paths, even though the direct consumers here use only
     normal `scrollToRow`.

   The av-grid source currently lacks `fromRow` in `src/render/types.ts:72-80` and lacks the
   lifecycle callbacks entirely; these are hard blockers, not implementation choices to solve in
   Persephone. US-1238 must consume a linked or published artifact containing them and must not
   edit `C:\projects\av-grid`.

3. **Consume the UIKit cell-style helper from US-1237.** Use the
   `src/renderer/uikit/shared/cell-style.ts` helper that US-1237 moves/defines for this task's
   direct fixed consumers. Preserve all existing geometry assignments and `data-row`/`data-col`
   bookkeeping; do not import `av-grid.css` or add colors. The old fork helper remains only until
   the final US-1239 deletion if another consumer still needs it.

4. **Migrate `FileSearchView.ts` to `RenderGrid`.** Replace the fork imports and field type with
   av-grid `RenderGrid`, `RenderCellFunc`, and the shared cell-style helper. Construct with
   `new RenderGrid(this.gridHost, { rowCount, columnCount, rowHeight, columnWidth, renderCell,
   fitToWidth })`; remove `claimViewOwnership`, explicit root append, and `mount`, because the
   av-grid constructor owns the shell. Replace `dispose()` with `destroy()` and retain the
   failure-safe root cleanup in `leaveGrid`. Keep unkeyed recycle, the file/line kind rewrite,
   click-listener ownership, full/partial `model.update` calls, and empty-arm transitions exactly
   as verified above. No lifecycle callbacks are needed.

5. **Migrate `LinksListView.ts` and `LinksTilesView.ts` to `RenderGrid`.** Replace direct fork
   imports with av-grid public render types and the shared style helper. Construct each grid with
   its host and current options; remove explicit append/mount and use `destroy()` at teardown.
   Since `RenderGrid` has no fork `onView` callback, call the existing `onGridModel` prop with
   `grid.model` after construction and with `null` during teardown, preserving `LinkBody` and
   panel consumers. Use `setOptions` for the tile view's live `rowHeight`, `onResize`, and other
   model options when `viewMode`/links change; do not recreate the engine merely to publish a
   callback. Preserve list/tile `previous`-first reuse, total admission writes, child view
   ownership, favicon/image row invalidations, width-driven tile column recomputation, and
   normal `scrollToRow(0)`.

   Before:

   ```ts
   const grid = new VirtualGridView(this.gridOptions());
   this.root.append(this.grid.root);
   this.grid.mount();
   // later
   this.grid.update(this.gridOptions());
   this.grid.dispose();
   ```

   After:

   ```ts
   const grid = new RenderGrid(this.gridHost, this.gridOptions());
   this.props.onGridModel?.(grid.model);
   // later, when options really changed
   this.grid.setOptions(this.gridOptions());
   this.grid.destroy();
   this.props.onGridModel?.(null);
   ```

   The exact host is the existing focus/grid host for each view; do not introduce a second wrapper
   or depend on private av-grid region elements.

6. **Migrate the measured editor bodies after US-1235.** Replace the `VirtualFlexGridView` and
   fork type imports in `LogBodyView.ts` and `NotebookBodyView.ts` with the public measured
   companion. Pass every current option and preserve the stable bound renderers, same-kind
   `previous` guards, keyed `recycle(kind)`/`setReuseKey(cell, kind)`, `measure` nominations,
   failure fallbacks, projection-driven `update` calls, and retained-view disposal. Keep Log's
   50/150/300 ms bottom-scroll timers and Notebook's enter/leave-grid arm behavior. Do not add
   consumer lifecycle callbacks: the companion must observe/release the cell roots internally.

   Change `NoteItemViewModel.ts` only to remove the stale `VirtualGridView.scrollElement` wording
   if the new public measured companion uses a generic `scrollElement` contract. Its editing,
   wheel forwarding, and `getScrollContainer` behavior require no engine change.

7. **Retype indirect fixed consumers after their owning views are migrated.** Replace fork-only
   imports in `TreeProviderViewModel.ts`, `CategoryViewModel.ts`, `CategoryViewImpl.ts`,
   `LinksList.ts`, `LinksTiles.ts`, `LinkBody.ts`, `LinkEditor.ts`,
   `LinkHostnamesNavigationPanel.ts`, and `LinkTagsSecondaryView.ts` with the av-grid public
   `GridModelCapability`/`RowAlign` surface selected in US-1235/US-1237. Keep all callbacks,
   model storage, `update({ all: true })`, and `scrollToRow` calls unchanged. Do not add a grid
   construction path to these files. `CategoryEditor.ts` and `TreeProviderViewImpl.ts` are
   already orchestration over the child views and need no change unless a type error proves their
   inferred callback type requires a mechanical annotation.

8. **Move the registered fixed story and update the registry.** Create
   `src/renderer/editors/storybook/renderGridStory.ts` from the fixed story behavior currently in
   `src/renderer/uikit/VirtualGrid/VirtualGrid.story.ts`, using `RenderGrid` and preserving id
   `virtual-grid`, controls, stats, and current themed cell styling. Update
   `src/renderer/editors/storybook/storyRegistry.ts:59` to import the new module. Leave the old
   fork story file for US-1239's final directory deletion; it is no longer reachable from the
   registry after this change.
   Treat the currently unregistered `virtualFlexGridStory` separately: retain it only if the
   project elects to register it, in which case it must consume the US-1235 measured companion;
   otherwise let its removal be part of US-1239's fork deletion rather than creating an accidental
   new story surface in this task.

9. **Verify by source/type/build checks and manual flows, not unit tests.** Confirm no in-scope
   file imports `VirtualGridView`, `VirtualGridModel`, `VirtualFlexGridView`,
   `VirtualFlexGridModel`, or fork render types; confirm the direct views use the av-grid shell;
   and manually exercise file-search rows, link list/tile pooling, notebook/log growth and
   bottom/filtered scrolling, category view mode changes, tree-backed provider reveal, and the
   two link navigation panels. Confirm retained cells are not moved/detached during ordinary
   eviction and that final disposal releases all owned subviews. Do not add unit-test work, a
   dashboard entry, a commit, or any write under `C:\projects\av-grid`.

## Concerns

### Blocking capabilities

- **US-1235: measured companion and lifecycle.** `VirtualFlexGridView.ts:73-96` depends on
  attach/release callbacks that av-grid does not expose. Release must mean leaving the active
  render set and entering the pool, including retained hidden cells; it must not mean physical
  detachment. This must be coordinated with US-1236's eviction change.
- **US-1235: `fromRow`.** `VirtualFlexGridModel.ts:98-102` cannot be ported correctly until
  av-grid's public `RerenderInfo` accepts a geometry invalidation from a row onward. A row-only
  dirty update leaves later row starts stale; an all-row content repaint is an incorrect and more
  expensive substitute.
- **US-1236: retained cell DOM.** Direct fixed and measured consumers retain interactive subtrees
  and assume the engine will not move an already-attached cell or detach it on ordinary eviction.
  The av-grid source currently does both in `RenderGrid.syncRegion`; this task must wait for the
  library fix.
- **US-1237/US-1240/US-1241: indirect primitive paths.** The component and panel files that
  receive a capability from `Tree`, `LinksListView`, or `LinksTilesView` should not be migrated
  ahead of their owners. The sibling US-1237 document is the source of truth for after-paint
  scrolling, live shell layout, and the fixed UIKit option mapping.

### Resolved decisions

- `setReuseKey` is covered for Log and Notebook. The av-grid API reference documents the exact
  optional call and keyed `recycle` contract, and current `RenderGrid` forwards the pool callback;
  no additional keyed-pool work is needed in US-1238.
- The measured layer is generic and belongs in av-grid as a companion over `RenderGrid`, not as a
  Persephone-only adapter or a second geometry engine. The model-facing API is only the two
  `GridModelCapability` methods, plus the `fromRow` field on their update payload; lifecycle is a
  shell-facing API, not a third model method.
- Fixed consumers do not need `scrollToRowAfterPaint`: none of the direct US-1238 views invokes
  it. Indirect ListBox/Tree users inherit that requirement from US-1237.
- No unit tests are planned because this repository does not use them. Verification is limited to
  source/type/build checks and the focused manual flows listed in the implementation plan.

### Files that need no changes

The following were inspected to distinguish indirect usage and should not be modified for this
task: `src/renderer/components/tree-provider/TreeProviderViewImpl.ts`,
`src/renderer/editors/category/CategoryEditor.ts`,
`src/renderer/uikit/CategoryList/CategoryListView.ts`,
`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts`,
`src/renderer/uikit/VirtualGrid/VirtualGridView.ts`,
`src/renderer/uikit/VirtualGrid/types.ts`, `src/renderer/uikit/VirtualGrid/CellPool.ts`,
`src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts`, and
`src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts` (the last four remain as reference until
US-1239 removes the fork). No file under `C:\projects\av-grid` is changed by US-1238.

## Acceptance criteria

- The task document cites EPIC-079 and US-1237, records the complete renderer-wide inventory, and
  distinguishes five genuine engine owners, ten indirect consumers, and one story-registry
  wiring entry.
- The measured-height requirements are explicit: the two model methods, the attach/release
  active-set contract, retained-cell behavior, nominated-root observation, immediate and
  animation-frame measurements, 50 ms per-row debounce, min/max clamping, initial hints, new-row
  fallback, stable `rowHeight` identity, and `fromRow` geometry invalidation.
- Log and Notebook option lists, imperative calls, `measure` usage, keyed reuse, and lifecycle
  behavior are fully accounted for, and av-grid API documentation confirms their
  `setReuseKey` call sites.
- The plan names all av-grid capabilities it depends on and assigns each absent capability to
  US-1235, US-1236, US-1237, US-1240, or US-1241; no workaround or private av-grid access is
  proposed.
- The plan contains exact repository paths, before/after migration snippets, an explicit no-change
  list, and no unit-test plan.
- Only this task document is written; `doc/active-work.md`, source files, and all files under
  `C:\projects\av-grid` remain unchanged.

## Files changed summary

| File | Planned change |
|---|---|
| `src/renderer/editors/log-view/LogBodyView.ts` | Replace the fork measured view with the US-1235 av-grid measured companion; preserve all options, calls, keyed reuse, measurement, and disposal. |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | Replace the fork measured view with the US-1235 av-grid measured companion; preserve all options, calls, keyed reuse, measurement, and disposal. |
| `src/renderer/editors/notebook/NoteItemViewModel.ts` | Only update stale engine-specific documentation if required by the new scroll-element contract. |
| `src/renderer/components/file-search/FileSearchView.ts` | Construct av-grid `RenderGrid` directly in the existing host and preserve fixed-row rendering and updates. |
| `src/renderer/editors/link-editor/LinksListView.ts` | Construct av-grid `RenderGrid`, publish its model explicitly, and preserve pooled list-row behavior. |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Construct av-grid `RenderGrid`, preserve resize-driven columns, model updates, scrolling, and pooled tile behavior. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Replace the fork `RowAlign` type import only. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Replace the fork grid-capability type in the renderer callback contract. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Replace the fork grid-capability type; preserve forwarding and normal scroll. |
| `src/renderer/editors/link-editor/LinksList.ts` | Replace the fork grid-capability prop type. |
| `src/renderer/editors/link-editor/LinksTiles.ts` | Replace the fork grid-capability prop type. |
| `src/renderer/editors/link-editor/LinkBody.ts` | Replace the fork grid-capability type used to bridge child views to the editor model. |
| `src/renderer/editors/link-editor/LinkEditor.ts` | Replace the fork grid-capability storage/setter type. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts` | Replace the fork grid-capability type; preserve selected-row scrolling. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts` | Replace the fork grid-capability type; preserve selected-row scrolling. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Point the registered fixed-grid story at its non-fork `RenderGrid` story module. |
| `src/renderer/editors/storybook/renderGridStory.ts` | New non-fork home for the registered fixed story, preserving its id and controls. |
| `doc/tasks/US-1238-components-editors-to-render-grid/README.md` | Investigation findings and implementation plan only. |

Files deliberately not changed: `src/renderer/components/tree-provider/TreeProviderViewImpl.ts`,
`src/renderer/editors/category/CategoryEditor.ts`,
`src/renderer/uikit/CategoryList/CategoryListView.ts`, the existing fork implementation files,
`src/renderer/uikit/index.ts`, `src/renderer/uikit/shared/cell-style.ts` (created/owned by
US-1237),
`doc/active-work.md`, `package.json`, tests (none planned), and every path under
`C:\projects\av-grid`.
