# US-1237 — Migrate UIKit primitives to av-grid `RenderGrid`

## Goal

Move `ListBox`, `Tree`, and the `Autocomplete` path that is backed by `ListBox` from Persephone's fixed-height `uikit/VirtualGrid` fork to the `av-grid` 2.2.4 engine. Preserve the UIKit primitives' rendering, keyboard scrolling, active-row behavior, pooled-cell lifecycle, and styling. This document records the investigation and the implementation plan; it does not make the migration.

Epic: [EPIC-079](../../epics/EPIC-079.md).

## Background

`src/renderer/uikit/VirtualGrid/` is a fork of av-grid's rendering engine. The installed package is `av-grid@2.2.4`; its public declarations are in `node_modules/av-grid/dist/index.d.ts`, and the corresponding source was inspected read-only under `C:\projects\av-grid\src\render\`.

The in-scope consumers do not use the measured-height engine. `ListBoxView` and `TreeView` use `VirtualGridView`; their models retain a `VirtualGridModel` reference for scrolling and repaint requests. `AutocompleteView` has no direct virtual-grid import: it owns a `ListBoxView`, so its grid usage is indirect. No in-scope file imports or invokes `VirtualFlexGridView`, `VirtualFlexGridModel`, or `calcRenderInfo` directly. The measured-height layer remains out of scope for US-1237 and belongs to the US-1238 work described by the epic.

The recommended seam for a `VanillaView` host is av-grid's `RenderGrid`, not bare `RenderGridModel`. `RenderGrid` owns the root, scroll container, nine-region DOM shell, `CellPool`, paint scheduling, model attachment, region synchronization, and destruction. The av-grid documentation explicitly demonstrates constructing `new RenderGrid(host, options)` as a standalone engine (`C:\projects\av-grid\docs\api.md:2035-2073`). A bare `RenderGridModel` only supplies state, geometry, and imperative model operations; using it would require UIKit to recreate the fork's shell, pool, scheduler, and eviction coordination.

The installed public barrel (`node_modules/av-grid/dist/index.d.ts:64-80`) exports `RenderGrid`, `RenderGridModel`, `defaultRowHeight`, `defaultColumnWidth`, `CellPool`, `calcRenderInfo`, `prepareRerender`, `AsyncRef`, and all exports from `render/types`. The in-scope consumers need the `RenderGrid` shell, its `model`, and public render types; none needs to call the standalone geometry helpers.

This recommendation has prerequisites recorded in [Concerns and open questions](#concerns-and-open-questions): the published `RenderGrid` currently lacks the after-paint scroll operation and the fork's pooled-root retention behavior, and its `setOptions` does not update all shell layout styles.

## Option-surface verdict

The epic's claim is correct for the declared `VirtualGridOptions` versus av-grid's `RenderGridOptions`: the fields are identical except for the fork-only `setReuseKey`. This is an option-surface result only; several supporting callback and shell contracts also differ and are recorded below.

The fork declares `VirtualGridOptions` in `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:85-110`. av-grid declares `RenderGridOptions` in `node_modules/av-grid/dist/render/RenderGridModel.d.ts:48-71`.

| Field | Persephone `VirtualGridOptions` | av-grid `RenderGridOptions` | Verdict |
|---|---|---|---|
| `name` | `name?: string` | `name?: string` | identical |
| `rowCount` | `number \| (() => number)` | `number \| (() => number)` | identical |
| `columnCount` | `number \| (() => number)` | `number \| (() => number)` | identical |
| `rowHeight` | `ElementLength` | `ElementLength` | identical |
| `columnWidth` | `ElementLength` | `ElementLength` | identical |
| `renderCell` | `RenderCellFunc` | `RenderCellFunc` | identical at the option field level |
| `recycle` | `RecycleFunc` | `RecycleFunc` | identical at the option field level; callback signature differs, below |
| `setReuseKey` | `SetReuseKeyFunc` | absent | fork-only / absent |
| `stickyTop` | `boolean` | `boolean` | identical |
| `stickyLeft` | `boolean` | `boolean` | identical |
| `stickyRight` | `boolean` | `boolean` | identical |
| `stickyBottom` | `boolean` | `boolean` | identical |
| `overscanColumn` | `number` | `number` | identical |
| `overscanRow` | `number` | `number` | identical |
| `fitToWidth` | `boolean` | `boolean` | identical |
| `whiteSpaceX` | `number` | `number` | identical |
| `whiteSpaceY` | `number` | `number` | identical |
| `onInnerSizeChange` | `(width, height) => void` | `(width, height) => void` | identical |
| `onAdjustRenderRange` | `(info) => void` | `(info) => void` | identical |
| `onResize` | `() => void` | `() => void` | identical |

The table does not hide these non-field differences:

- The fork's `RecycleFunc` accepts an optional `reuseKey` and `RenderCellParams` has `setReuseKey`; av-grid's `RecycleFunc` is `() => HTMLElement | undefined`, and its `RenderCellParams` has no `setReuseKey` (`src/renderer/uikit/VirtualGrid/types.ts:42-83`; `node_modules/av-grid/dist/render/types.d.ts:35-74`). The in-scope renderers do not pass `setReuseKey` or use keyed acquisition.
- Fork `RerenderInfo` has `fromRow`; av-grid's public `RerenderInfo` does not (`src/renderer/uikit/VirtualGrid/types.ts:71`; `node_modules/av-grid/dist/render/types.d.ts:16-23`). None of the in-scope ListBox, Tree, or Autocomplete files passes or reads `fromRow`; only the fork's internal rerender logic and measured-height path use it (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:410-430`, `VirtualFlexGridModel.ts:102`). It is therefore not a US-1237 migration blocker, but remains relevant to the measured-layer follow-up.
- Fork `VirtualGridModelInput` includes `setReuseKey`, while av-grid's model input does not (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:70-83`; `node_modules/av-grid/dist/render/RenderGridModel.d.ts:25-46`).
- `VirtualGridView` adds `className`, `height`, `growToHeight`, and `growToWidth` to the option surface (`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:29-42`). av-grid has the corresponding shell fields in `RenderGridShellOptions` (`node_modules/av-grid/dist/render/RenderGrid.d.ts:7-22`), but they are not part of `RenderGridOptions`.

## Consumer findings

### `ListBox`

`src/renderer/uikit/ListBox/ListBoxView.ts` imports `VirtualGridView`, `applyCellStyle`, and fork render types (`:9-17`). It stores a `VirtualGridView` in `grid` and a `VirtualGridModel` reference is set on `ListBoxModel` (`ListBoxView.ts:93-108`, `ListBoxModel.ts:21-28`). `ListBoxModel` never constructs the engine; it uses that model reference for `update`, `visibleRowCount`, and scrolling (`ListBoxModel.ts:249-276`, `:342-361`). There is no `calcRenderInfo` call.

The grid options supplied by `ListBoxView.gridProps()` (`ListBoxView.ts:344-357`) are:

| Option | Value / source | av-grid acceptance |
|---|---|---|
| `rowCount` | function returning `model.resolved.resolved.length` | accepted |
| `columnCount` | `1` | accepted |
| `columnWidth` | `() => "100%"` as `Percent` | accepted |
| `renderCell` | `this.renderCell` | accepted |
| `overscanRow` | `2` | accepted |
| `fitToWidth` | `true` | accepted |

`rowHeight`, `growToHeight`, and `whiteSpaceY` arrive through `layoutProps()` (`ListBoxView.ts:360-366`): row height defaults to `24`, `growToHeight` is converted with `cssLength`, `fitToWidth` is again `true`, and `whiteSpaceY` is forwarded. The shell-only sizing values must be supplied to `RenderGrid` through its shell options or a library-supported layout operation; they cannot be treated as model options.

The current creation path appends a host, constructs `new VirtualGridView(gridProps())`, appends its root, calls `mount`, then calls `setLayout` (`ListBoxView.ts:305-314`). The migration should construct `new RenderGrid(this.gridHost, shellAndGridOptions)` because av-grid appends its own root in its constructor (`C:\projects\av-grid\src\render\RenderGrid.ts:100-208`), set the model reference to `grid.model`, and call `destroy` on the av-grid instance during arm teardown.

`renderCell` reuses `p.previous ?? p.recycle?.()`, tracks the wrapper in a `WeakMap`, applies geometry, and swaps the row view only when the record kind changes (`ListBoxView.ts:373-434`). A wrapper's click, hover, and context-menu listeners are installed once and consult the current record. `rowViews` retains every mounted row view so pooled wrappers can be reused without losing the view; the set is disposed wholesale when the grid leaves its real arm (`ListBoxView.ts:70-75`, `:486-495`). `releaseCell` is only for a kind change: it runs the old slot cleanup and disposes the old row view. It is not an eviction hook.

Imperative calls and their av-grid mapping are:

| Current call | av-grid mapping |
|---|---|
| `grid.model.update(...)` | `RenderGrid.model.update(...)`, unchanged |
| `visibleRowCount` | `RenderGrid.model.visibleRowCount`, unchanged |
| `scrollToRow(row, align)` | `RenderGrid.model.scrollToRow(row, align)`, unchanged |
| `scrollToRowAfterPaint(row)` | no av-grid equivalent in 2.2.4; a public library operation is required |

`syncActiveScroll` deliberately chooses normal `scrollToRow` when the row set is unchanged and `scrollToRowAfterPaint` when content changed and the active index changed (`ListBoxView.ts:501-517`). This distinction must not be collapsed during migration.

### `Tree`

`src/renderer/uikit/Tree/TreeView.ts` has the same fixed-height engine seam: it imports `VirtualGridView` and fork render types (`:11-18`), stores the view, and passes `grid.model` to `TreeModel`. `TreeModel` imports `VirtualGridModel` only as the type of its `gridRef`; it does not construct a grid or call `calcRenderInfo` (`TreeModel.ts:21-28`, `:201-214`). `Tree/types.ts:57` only has a comment describing the flat visible-row index consumed by the virtual grid; it has no engine dependency.

`TreeView.gridProps()` (`TreeView.ts:348-363`) passes:

| Option | Value / source | av-grid acceptance |
|---|---|---|
| `rowCount` | function returning `model.rows.length` | accepted |
| `columnCount` | `1` | accepted |
| `columnWidth` | `columnWidth` | accepted |
| `rowHeight` | `props.rowHeight ?? 22` | accepted |
| `renderCell` | `this.renderCell` | accepted |
| `overscanRow` | `2` | accepted |
| `fitToWidth` | `true` | accepted |
| `growToHeight` | `cssLength(props.growToHeight)` | accepted by `RenderGridShellOptions`, not model options |
| `whiteSpaceY` | `props.whiteSpaceY` | accepted |

The view constructs and mounts the fork in `enterRealArm` (`TreeView.ts:310-318`). The av-grid conversion is the same `RenderGrid(host, options)` construction and `destroy` teardown described for `ListBox`. The render callback reuses or creates a wrapper, applies geometry, maintains a current record, installs listeners once, and changes the `SectionItemView`/`TreeItemView` only when the row kind changes (`TreeView.ts:370-429`, `:504-546`). Its `releaseCell` runs cleanup and disposes the old view only during that kind transition (`TreeView.ts:565-574`); it is not called for pool eviction. `rowViews` provides the same retained-root/view ownership rule as `ListBox`.

`TreeModel` uses `update`, `visibleRowCount`, and `scrollToRow` for ordinary keyboard navigation and reveal operations (`TreeModel.ts:672-709`, `:807-823`). Ancestor expansion and active-row synchronization call `scrollToRowAfterPaint` after row contents change (`TreeModel.ts:867-875`; `TreeView.ts:580-595`). Those calls have the same missing av-grid equivalent and must be migrated only after the library gap is closed.

### `Autocomplete`

`src/renderer/uikit/Autocomplete/AutocompleteView.ts` imports `ListBoxView` and the fork's `VirtualGridLayout` type (`:10-18`); it does not import `VirtualGridView`, `VirtualGridModel`, `VirtualFlexGrid*`, or `calcRenderInfo`. `AutocompleteContentView` mounts a `ListBoxView`, changes its items and active index, and forwards layout (`AutocompleteView.ts:279-344`). `listProps()` supplies the filtered items, active index, callbacks, `rowHeight`, and `growToHeight = maxVisibleItems * rowHeight` (`AutocompleteView.ts:380-393`). The final engine options are therefore exactly the migrated `ListBox` options, with the autocomplete-specific row height and maximum visible-height values. Its filtered rows and active index are synchronized together, so it relies on `ListBoxView` selecting the after-paint scroll path when content changes.

The migration should replace the `VirtualGridLayout` type dependency with a layout type owned by the migrated ListBox/shared UIKit code. No Autocomplete model or rendering algorithm change is required.

## Behavior parity

The three rules documented in `src/renderer/uikit/CLAUDE.md:559-604` were checked against both engines.

| Required behavior | Fork evidence | av-grid 2.2.4 evidence | Result / plan requirement |
|---|---|---|---|
| Distinguish `scrollToRow` from `scrollToRowAfterPaint` | `VirtualGridModel.ts:637-674` queues the after-paint request until the next paint and flushes it after render; the UIKit host chooses the two paths in `ListBoxView.ts:501-517` and `TreeView.ts:580-595`. | `RenderGridModel.d.ts:102-175` and `C:\projects\av-grid\src\render\RenderGridModel.ts:560-606` expose `scrollToRow` but no `scrollToRowAfterPaint`; the source has no equivalent pending-scroll API. | **Gap.** Add or consume a public av-grid after-paint operation that preserves the queued, last-request-wins behavior and unmeasured-row fallback. Do not replace it with `setTimeout(0)`. |
| Non-detaching eviction and non-moving admission | The fork comments specify the fix for US-1232: `syncRegion` checks `el.parentElement !== parent` before admission (`VirtualGridView.ts:624-633`), and `releaseCell` hides pooled cells with `display: none` while leaving them in the document; only pool overflow detaches (`VirtualGridView.ts:645-648`). The comments explain that moving an attached subtree resets a complex widget's ancestor scroller, while detaching an iframe can reset the scroller and reload the nested document. | Av-grid `RenderGrid.syncRegion` does both forbidden operations: it calls `parent.removeChild(el)` for every eviction and `parent.append(el)` for every newly admitted cell without an already-attached check (`C:\projects\av-grid\src\render\RenderGrid.ts:353-377`). | **US-1232 failure mode reproduced inside av-grid.** This is not a separate fork-vs-library behavior choice and is independent of any host-side `fillSlot` trigger: it occurs on av-grid's own cell reconciliation. The fork already paid for this answer twice and recorded it in its comments. Treat it as the second face of the defect being reopened for av-grid in US-1236; the linked av-grid build must carry the non-detaching/non-moving fix before migration. |
| Never run slot cleanup on eviction | Fork `ListBoxView.ts:486-495` and `TreeView.ts:565-574` perform slot cleanup only when a wrapper changes kind; the fork's eviction path does not call those functions. | Av-grid `RenderGrid.ts:352-377` has no consumer eviction callback; it removes the element and returns it to the pool. Therefore it cannot invoke a slot cleanup callback. | The no-cleanup rule is structurally preserved for the current consumers, provided the library's pool retention change does not add an eviction callback. Keep cleanup tied to kind replacement and final view disposal only. |

Av-grid also contains a `scrollLost` workaround for a zero-sized/display-none container (`C:\projects\av-grid\src\render\RenderGridModel.ts:247-253`) and restores scroll in the paint path (`RenderGrid.ts:321-328`). That is related to the epic's US-1236 work, but it does not supply the missing after-paint API or the US-1232 reconciliation fix.

## AsyncRef fork

Only `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:38` imports `../shared/async-ref`; none of the in-scope ListBox, Tree, Autocomplete, or UIKit barrel files import it directly. `src/renderer/uikit/shared/async-ref.ts` and `C:\projects\av-grid\src\core\AsyncRef.ts` have character-identical implementation bodies; their differences are documentation comments. Av-grid exports `AsyncRef` publicly from `node_modules/av-grid/dist/index.d.ts:78-80` and its source index.

The migration should let the av-grid model own this dependency. Do not delete or modify Persephone's copy in US-1237: its deletion is assigned to US-1239 after all fork consumers have moved.

## Styling

`src/renderer/uikit/VirtualGrid/VirtualGrid.css` owns one rule only: at its sole rule it gives sticky regions `background-color: inherit` under the `[data-type="virtual-grid"]` root. It does not own grid geometry, row colors, or item appearance. `ListBox.css`, `Tree.css`, `ListItem.css`, and `TreeItem.css` own the visible row styling and use UIKit theme variables; the item styles explicitly expect the engine-positioned wrapper to contain an in-flow row.

The av-grid internal `src/view/cellDom.ts` applies only `display`, `position`, `left`, `top`, `width`, and `height` from inline styles. It is not a public export. `src/renderer/uikit/VirtualGrid/cell-style.ts` additionally maintains `data-row` and `data-col`, which are part of the UIKit wrapper contract. Move that small helper to a shared UIKit location and keep the data attributes. Do not import the av-grid stylesheet for these primitives: `node_modules/av-grid/dist/av-grid.css` contains generic `.avg-grid` and `.avg-list` presentation plus fallback colors, while a direct `RenderGrid` root does not use the required `.avg-grid` class and UIKit rows already have their own token-based styles. Any replacement CSS must use tokens from `src/renderer/theme/color.ts`; no hardcoded colors are needed for this migration.

## Implementation plan

1. Resolve three explicit, blocking av-grid dependencies before changing the UIKit seam. US-1237 implementation **cannot begin** until all three land in av-grid and are available through the linked build:
   - **After-paint scrolling:** av-grid 2.2.4 has no `scrollToRowAfterPaint` and no pending-scroll register at all. Its only related model state is `scrollLost` (`C:\projects\av-grid\src\render\RenderGridModel.ts:132`), which addresses hidden-container scroll loss rather than deferred row scrolling.
   - **US-1232/US-1236 reconciliation:** fix eviction so ordinary cells are not detached, and fix admission so an already-attached cell is not moved. Av-grid currently performs both operations in `RenderGrid.syncRegion` (`C:\projects\av-grid\src\render\RenderGrid.ts:353-377`). This is the internally reproduced second face of the US-1232 defect, not a new host-side behavior requirement.
   - **Live shell layout:** make `RenderGrid.setOptions` reapply `height`, `growToHeight`, `growToWidth`, and overflow when those options change. The current implementation only assigns options, calls `model.setOptions`, and sets `className` (`node_modules/av-grid/dist/render/RenderGrid.d.ts:25-50`; `C:\projects\av-grid\src\render\RenderGrid.ts:230-237`).

   Consume a published or linked av-grid artifact containing these exact capabilities; do not work around them by reaching into private DOM structure. The investigation and this task-document update must not edit `C:\projects\av-grid`.

2. Move the UIKit geometry/data-attribute helper to a shared UIKit module. Import the public `CellStyle` type from av-grid, preserve the existing four inline geometry assignments and `data-row`/`data-col` bookkeeping, and leave color ownership with UIKit item styles. Keep the old fork helper temporarily for out-of-scope consumers until US-1238/US-1239 remove the fork.

3. Migrate `ListBoxView` and `ListBoxModel` together. Replace the fixed-engine imports with `RenderGrid`, `RenderGridModel`, and the corresponding public render types from `av-grid`; replace the grid field and model reference types; and preserve the existing `renderCell` record/`WeakMap`/`rowViews` ownership and one-time listener installation. Construct `RenderGrid` with `gridHost` as its host, pass the current grid options plus shell layout values, use `grid.model` for `ListBoxModel.setGridRef`, and call `grid.destroy()` during teardown. Remove the fork-only `mount`, root append, `setReuseKey`, and `flushPendingScroll` assumptions. Keep normal `scrollToRow` for unchanged row sets and route the content-changed branch to the av-grid after-paint equivalent.

Before:

```ts
import { applyCellStyle, VirtualGridView } from "../VirtualGrid";
const grid = new VirtualGridView(gridProps());
this.gridHost.append(grid.root);
grid.mount();
grid.setLayout(layout);
```

After (using the prerequisite public shell API):

```ts
import { RenderGrid, type RenderGridModel } from "av-grid";
import { applyCellStyle } from "../shared/cell-style";
const grid = new RenderGrid(this.gridHost, { ...gridProps(), ...layout });
this.model.setGridRef(grid.model);
// update shell/model layout through av-grid's public API
grid.setOptions(/* grid options and supported shell layout */);
```

4. Apply the same seam conversion to `TreeView` and `TreeModel`. Preserve the current `SectionItemView`/`TreeItemView` kind-transition cleanup, DnD and pointer listeners, `rowViews` ownership, normal keyboard/reveal scrolling, and after-paint scrolling after ancestor expansion. Update `Tree/types.ts:57`'s engine-specific comment to refer to the RenderGrid-backed fixed-height visible-row array.

5. Update `AutocompleteView`'s layout type import to the migrated ListBox/shared layout type. Keep its filtered-item, active-index, empty-message, row-height, and maximum-height behavior unchanged; all engine calls continue through `ListBoxView`.

6. Decide the UIKit barrel transition explicitly. `src/renderer/uikit/index.ts:78-94` currently re-exports both fixed and measured fork symbols. No in-scope consumer imports these symbols through that barrel. Remove stale fixed `VirtualGridView`/`VirtualGridModel` exports once the direct consumers are migrated, but retain measured-layer exports needed by the out-of-scope US-1238 consumers until their migration; do not re-export av-grid under the old `VirtualGrid` names. The final deletion of the remaining fork barrel exports and `VirtualGrid/` files belongs to US-1239.

7. Preserve the package boundary. `av-grid` is already declared at version 2.2.4, so this task does not add a dependency or import `av-grid.css`. Do not change the av-grid repository as part of this work.

8. Verify the finished migration through source/type/build checks and focused manual flows—ListBox-backed Select/MultiSelect/Autocomplete, Explorer Tree navigation/reveal/expand, active-row changes during row-set updates, and pooled wrapper reuse. This project does not use unit tests; no unit-test work is planned.

## Concerns and open questions

- **Blocking library gap: after-paint scrolling.** av-grid 2.2.4 has no `scrollToRowAfterPaint` or equivalent. The migration cannot preserve the documented distinction until av-grid exposes one. The API must handle an unmeasured row, defer until the render/paint that establishes the new extent, and avoid the too-early `setTimeout(0)` workaround. Coordinate this with the epic's scroll work before implementation.
- **Blocking library gap: US-1232/US-1236 cell reconciliation.** Av-grid's own cells currently take the detach-on-eviction and move-on-admission paths forbidden by the fork's US-1232 comments. This must be fixed in av-grid before migration; it is not something the ListBox/Tree `fillSlot` code can safely repair.
- **Blocking library gap: dynamic shell layout.** `RenderGrid.setOptions` does not apply shell sizing/overflow changes, while ListBox and Autocomplete call `setLayout` as their layout changes. The av-grid API needs to make those fields live, or the migration needs an explicitly supported shell-layout method. Duplicating av-grid's private DOM style logic in UIKit is not a safe substitute.
- **Cross-task lifecycle finding for US-1235.** Fork-only `onCellAttached` and `onCellReleased` are declared at `VirtualGridView.ts:57` and `:63`, and invoked at `:634` and `:651`. They do not exist anywhere under `C:\projects\av-grid\src`. Their only consumer is the measured-height wrapper, `VirtualFlexGridView.ts:73-81` and `:178-179`, which uses them to observe and measure cells. Therefore the epic's claim that the measured-height layer is re-hostable over only the two-method `GridModelCapability` seam is incomplete: US-1235 also needs a cell-lifecycle seam from the shell. This is recorded for that task; US-1237 does not plan the work.
- **Keyed pooling is not used by these three consumers.** `setReuseKey` is genuinely absent from av-grid's option surface, but the fork's keyed `CellPool` is an epic-level capability. US-1234 must remain coordinated for other heterogeneous consumers before the fork is deleted.
- **Public API timing.** Removing fixed symbols from `uikit/index.ts` is a public barrel change. The measured exports must remain until US-1238 is migrated; US-1239 owns final fork deletion. Confirm the intended compatibility window before landing the barrel change.
- **Styling scope.** The fork stylesheet's sticky inheritance rule is not required by UIKit's current row styles when using av-grid's `data-type="render-grid"` shell. If inspection of the final shell shows a sticky-region regression, add only a selector using UIKit tokens or inheritance; never copy av-grid's fallback color values.

## Acceptance criteria

- `ListBox` and `Tree` use av-grid's `RenderGrid` shell and `RenderGridModel`; no in-scope file imports `VirtualGridView`, `VirtualGridModel`, `VirtualFlexGrid*`, or calls `calcRenderInfo`.
- `Autocomplete` remains a ListBox-backed consumer and uses the shared migrated layout type without a direct fork dependency.
- Every option used by ListBox and Tree is accepted by av-grid; the only declared option difference is the intentionally unused fork-only `setReuseKey`, and shell-only layout fields are handled through a public shell API.
- Normal scrolling and deferred after-paint scrolling remain distinct, including Tree ancestor expansion and ListBox/Autocomplete filtered-row changes.
- Pooled wrapper roots retain their required ownership and bounded lifetime; kind changes clean up slots, eviction does not, and final disposal still disposes the tracked row views.
- The shared cell-style helper preserves geometry plus `data-row`/`data-col`; no av-grid stylesheet is imported and no hardcoded colors are introduced.
- The UIKit barrel does not leave stale fixed-engine aliases after the agreed transition, while measured-layer exports remain coordinated with US-1238/US-1239.
- No dashboard entry, unit-test plan, or change under `C:\projects\av-grid` is added.

## Files changed summary

| File | Planned change |
|---|---|
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Use av-grid `RenderGrid`, public render types, shared cell styling, and the supported shell/after-paint APIs. |
| `src/renderer/uikit/ListBox/ListBoxModel.ts` | Type the grid reference as av-grid `RenderGridModel`; retain existing update and scroll calls. |
| `src/renderer/uikit/Tree/TreeView.ts` | Use av-grid `RenderGrid`, public render types, shared cell styling, and the supported shell/after-paint APIs. |
| `src/renderer/uikit/Tree/TreeModel.ts` | Type the grid reference as av-grid `RenderGridModel`; retain existing update and scroll calls. |
| `src/renderer/uikit/Tree/types.ts` | Update the visible-row engine comment. |
| `src/renderer/uikit/Autocomplete/AutocompleteView.ts` | Replace the fork layout type import with the migrated shared/ListBox layout type. |
| `src/renderer/uikit/index.ts` | Remove fixed fork barrel aliases after the measured-layer compatibility decision; retain measured exports until their follow-up migration. |
| `src/renderer/uikit/shared/cell-style.ts` | New shared UIKit geometry and row/column data-attribute helper. |

The following are deliberately not changed by US-1237: `src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts`, `VirtualFlexGridView.ts`, and other measured consumers (US-1238); the remaining fork implementation, `VirtualGrid.css`, `CellPool.ts`, and `shared/async-ref.ts` (US-1239); UIKit item CSS and `theme/color.ts`; `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`; `doc/active-work.md`; `package.json`; and every file under `C:\projects\av-grid`.
