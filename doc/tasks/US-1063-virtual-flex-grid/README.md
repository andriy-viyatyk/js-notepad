# US-1063 - `VirtualFlexGridView`, a measured-height wrapper over `VirtualGridView`

Epic: [EPIC-062 - De-React Epic E4](../../epics/EPIC-062.md)
Status: investigation and implementation plan only; no implementation is in scope.

## Goal

Create the new UIKit primitive required by EPIC-062's log and notebook conversions. It ports
`RenderFlexGrid`'s measured-row-height bookkeeping onto the existing `VirtualGridView` engine;
this task does not modify either eventual editor consumer and does not modify
`src/renderer/editors/link-editor/`.

## Background

EPIC-062 E4-2 establishes that
`src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx` is a measurement wrapper, not a virtualization
engine. `FlexCell` observes a rendered row element and reports its `clientHeight`
(`RenderFlexGrid.tsx:20-87`). `RenderFlexGridModel` stores pending and committed heights, debounces
and clamps them, chooses fallback heights, and asks the grid model to update the changed row
(`RenderFlexGrid.tsx:110-203`). The target engine already accepts a per-row height function:
`ElementLength` is `number | ((v: number) => number | Percent)`
(`src/renderer/uikit/VirtualGrid/types.ts:29-30`), and `VirtualGridModel` passes its `rowHeight`
option to `calcRenderInfo` (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:456-515`).

This is therefore a port of measurement bookkeeping, not a second virtualization engine. The two
arrays, the 50 ms per-row debounce, the min/max clamp, the new-row preference, and the last-measured
fallback are visible-row stability mechanisms, not incidental state
(`src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx:107-124,145-202`).

### Verified source split

| Responsibility | Existing React owner | Vanilla owner in this task |
|---|---|---|
| Observe the current rendered cell root and read its height | `FlexCell`, including its second re-attachment effect (`RenderFlexGrid.tsx:27-73`) | `VirtualFlexGridView`, because observer attachment and DOM reads are view lifecycle work |
| Store pending/committed heights; debounce; clamp; choose fallbacks | `RenderFlexGridModel` (`RenderFlexGrid.tsx:110-203`) | A private `VirtualFlexGridModel` collaborator in `VirtualFlexGridModel.ts` |
| Supply the per-row height function to the real geometry engine | React wrapper passes `state.rowHeight` into `<RenderGrid>` (`RenderFlexGrid.tsx:206-239`) | The wrapper passes the stable measurement model function into an inner `VirtualGridView` |
| Repaint after a committed height | `gridModel?.update({ rows: [updatedRow] })` (`RenderFlexGrid.tsx:200-202`) | The inner `VirtualGridModel.update({ rows: [row] })` path, which recomputes geometry and schedules paint |

The React second effect exists only because React may reuse the component while changing the DOM
element behind its ref (`RenderFlexGrid.tsx:59-73`). With `CellPool` recycling, element identity
changes when a cell is admitted for a different row; that is the normal case, not an edge case. The
vanilla observer callback must therefore consult an element-to-current-row record at callback time,
not capture a row index in a closure created for an earlier occupant.

### Verified target-engine lifecycle and geometry

`VirtualGridView` constructs `VirtualGridModel` with the pool acquire function in its constructor
(`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:143-169`), builds child DOM and attaches the
model from `onMount()` only after its owner has attached the root
(`VirtualGridView.ts:202-224`), and forwards later options from `onUpdate()` without replacing the
root (`VirtualGridView.ts:226-242`). Its `syncRegion()` removes evicted elements, releases them to
`CellPool`, and appends newly admitted elements
(`VirtualGridView.ts:460-485`).

The wrapper will use the verified composition shape in `ListBoxView`: create an inner
`VirtualGridView`, append its root, mount it once, keep its model reference, and dispose it during
teardown (`src/renderer/uikit/ListBox/ListBoxView.ts:235-253`). This preserves the existing
`onModel` access pattern used by both future consumers
(`src/renderer/editors/log-view/LogBody.tsx:21-28`;
`src/renderer/editors/notebook/NotebookBody.tsx:56-60`).

The geometry path is verified, not inferred. `VirtualGridModel.update()` merges the requested dirty
row and schedules `updateRenderInfo()` (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:427-450`).
`updateRenderInfo()` passes the current `rowHeight` function to `calcRenderInfo()`
(`VirtualGridModel.ts:456-515`), and `calcRenderInfo()` rebuilds `rowLength` and `rowStarts` before
rendering (`src/renderer/uikit/VirtualGrid/renderInfo.ts:486-560`). A row-height change shifts all
following rows, so this is a geometry recomputation plus a row-scoped dirty-cell signal, not a
paint-only operation. This is the EPIC-056 section 6.1 requirement.

### Requirements from the eventual consumers

`LogBody` uses two columns, a `Percent`/fixed `columnWidth` function, `fitToWidth`,
`minRowHeight={18}`, `getInitialRowHeight`, `preferMinHeightForNewRows`, and a model callback for
scroll tracking and iterative auto-scroll
(`src/renderer/editors/log-view/LogBody.tsx:21-59,92-113,126-138`). Its renderer needs row and
column, returns no cell for column 1, and must ultimately return an `HTMLElement` whose measured root
contains the log entry (`LogBody.tsx:92-103`; the current React row passes the ref to its wrapper at
`src/renderer/editors/log-view/LogEntryWrapper.tsx:34-64`).

`NotebookBody` uses one percentage-width column, `fitToWidth`, `minRowHeight={100}`,
`maxRowHeight={800}`, `getInitialRowHeight`, and a model callback. Its renderer needs the row and
current note data and must ultimately return the measured note-root `HTMLElement`
(`src/renderer/editors/notebook/NotebookBody.tsx:56-104,156-166`). Its current React renderer
passes a measurement ref through `cellRef` (`NotebookBody.tsx:69-94`); the vanilla primitive drops
that React ref channel because its returned cell element is directly tracked by the flex view.

## Implementation Plan

### 1. Compose the view and measurement model

Create:

- `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts`
- `src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts`

`VirtualFlexGridView` is a `VanillaView` that composes an inner `VirtualGridView`. It does not
extend `VirtualGridModel`, and `VirtualGridModel` remains the sole owner of geometry, dirty sets,
scroll/resize handling, pooling, and the engine's `rowHeight` input. The flex layer owns DOM
measurement and height policy in the separate `VirtualFlexGridModel`.

The outer constructor creates only the stable root and model bookkeeping state. It must not create
inner child DOM, install listeners or subscriptions, create the observer, measure layout, or start
timers. The mount hook creates the shared observer and inner grid after the owner has attached the
root; it appends the inner root and calls `mount()` once. This follows the mandatory
`VanillaView` contract (`src/renderer/uikit/CLAUDE.md:494-513`). Do not register the inner grid with
`child()`: `VanillaView.dispose()` disposes children before any `own()` resource, so a child-owned
inner grid would be torn down before the measurement cleanup. Register the wrapper's `own()`
disposers in this FIFO order: make the wrapper inert; neuter the measurement model's debouncers;
disconnect the observer and clear its records; then dispose the inner grid. The base confirms the
actual order: children first, registered disposers FIFO, then `onDispose()`
(`src/renderer/uikit/shared/vanilla-view.ts:82-120`). This guarantees the observer and delayed
height callbacks are inert before the inner grid clears its pool
(`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:244-250`).

Forward later props through the inner view's `update()`. Keep the wrapper's renderer function
stable so `VirtualGridModel.inputChanged()` does not mistake a new callback identity for a full cell
rebuild (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:339-390`).

### 2. Define the exact public surface

The public surface maps the current `RenderFlexGridProps` one-to-one where the target has an
equivalent, and replaces only React-specific cell and host details:

```ts
export type VirtualFlexCellParams = RenderCellParams;
export type VirtualFlexCellFunc = (p: VirtualFlexCellParams) => HTMLElement | undefined;

export interface VirtualFlexGridProps
    extends Omit<VirtualGridProps, "renderCell" | "onView"> {
    onModel?: (model: VirtualGridModel | null) => void;
    minRowHeight?: number;
    maxRowHeight?: number;
    renderCell: VirtualFlexCellFunc;
    getInitialRowHeight?: (row: number) => number | undefined;
    preferMinHeightForNewRows?: boolean;
}
```

The target's `RenderedCell` contract is `HTMLElement | undefined`
(`src/renderer/uikit/VirtualGrid/types.ts:14-15`), so `undefined` preserves the current log
renderer's empty column (`LogBody.tsx:93-95`); no React `ReactNode` or `null` is accepted. The
renderer receives the target engine's `row`, `col`, `style`, `key`, `renderInfo`, `previous`, and
`recycle` fields (`src/renderer/uikit/VirtualGrid/types.ts:149-172`). `key` is retained because
US-1062's cell-parts pattern needs it when re-pointing keyed owned content; `previous` must be
preferred to `recycle` for an already-rendered coordinate
(`src/renderer/uikit/VirtualGrid/types.ts:156-169`).

The inherited prop mapping is:

| `RenderGridProps` field | `VirtualFlexGridProps` decision |
|---|---|
| `onModel` | Keep, typed to `VirtualGridModel | null`; invoke after the inner grid mounts and with `null` on disposal |
| `name`, `rowCount`, `columnCount`, `rowHeight`, `columnWidth` | Keep; these are already in `VirtualGridProps`/`VirtualGridOptions` (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:85-108`) |
| `stickyTop`, `stickyLeft`, `stickyRight`, `stickyBottom`, `overscanColumn`, `overscanRow`, `fitToWidth` | Keep unchanged |
| `onInnerSizeChange`, `onAdjustRenderRange`, `onResize`, `whiteSpaceY`, `whiteSpaceX` | Keep unchanged; these are target engine options (`VirtualGridModel.ts:100-107`) |
| `className`, `growToHeight`, `growToWidth` | Keep through the target view surface; target styles are applied by `VirtualGridView` (`VirtualGridView.ts:226-242,491-542`) |
| `renderCell` | Replace with `VirtualFlexCellFunc`; it returns `HTMLElement | undefined` and not `ReactNode` |
| `onRender` | Drop: the target has a scheduled paint loop, not a React render callback; neither eventual consumer uses it |
| `contentProps`, `renderAreaProps`, `blockStyles` | Drop: the target view owns fixed `data-part` regions and geometry styles; neither consumer supplies region prop bags |
| `qaData` | Drop: it has no target-engine meaning and neither consumer passes it |
| `extraElement`, `extraElementTop` | Drop: they are React nodes; a future native overlay uses `VirtualGridView.addOverlay()` (`VirtualGridView.ts:164-186`) |
| `RenderFlexCellParams.maxRowHeight` and `setRowHeight` | Drop from the renderer parameters: they are internal React-to-model channels, and the wrapper owns both |
| `RenderFlexCellParams.ref` | Drop: the returned `HTMLElement` is the measured cell root, so no React ref is needed |

`VirtualGridProps` also supplies the target-only definite `height` and native `onView` surface
(`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:32-57`). The flex primitive keeps `height` for
the same layout requirement but deliberately exposes only `onModel`, preserving the inherited
consumer contract while the wrapper remains the owner of the inner view. Export
`VirtualFlexGridView` and `VirtualFlexGridProps` from `VirtualGrid/index.ts` and the top-level
`src/renderer/uikit/index.ts`; keep `VirtualFlexGridModel` an implementation collaborator.

Add one separate, optional engine capability to `VirtualGridProps`:
`onCellReleased?: (element: HTMLElement) => void`. This is a general notification that the element
has left the DOM and entered the pool, not a flex-specific "unobserve" command. Existing consumers
need no change; future cell owners such as US-1062 can use the same release boundary for their own
retained-element bookkeeping.

The adapter applies the geometry returned by the engine to the returned cell with the existing
`applyCellStyle()` helper (`src/renderer/uikit/VirtualGrid/cell-style.ts`). This preserves the old
`FlexCell` outer wrapper's style responsibility while allowing the converted consumer's returned
element itself to be the measured root.

Before and after:

```tsx
// Before: React adds a wrapper, assigns its style/ref, and returns a React subtree.
return <div ref={ref} style={p.style}>{p.renderCell({ ...p, ref })}</div>;
```

```ts
// After: the vanilla adapter owns geometry and measures the returned root.
const cell = this.props.renderCell(p);
if (!cell) return undefined;
applyCellStyle(cell, p.style);
this.measurement.track(cell, p.row);
return cell;
```

### 3. Port every load-bearing height field

Implement the following in `VirtualFlexGridModel`, deliberately matching the donor:

- `pendingHeights`: the latest clamped observer value for each row, written immediately by
  `setRowHeight`. It absorbs repeated `ResizeObserver` values while geometry stays on the committed
  value (`RenderFlexGrid.tsx:145-159`).
- `rowHeights`: committed row values, changed only by `commitRowHeight` after debounce. It is the
  first lookup in the row-height function (`RenderFlexGrid.tsx:162-171,182-198`).
- `ROW_HEIGHT_DEBOUNCE_MS = 50` plus `memorize((row) => debounce(...))`: one independent
  debouncer per row, so one row's resize burst neither commits intermediate values nor cancels a
  different row's timer (`RenderFlexGrid.tsx:107-124`). Use the existing `debounce` third
  `canRun` argument to make callbacks inert after disposal
  (`src/shared/utils.ts:34-54`).
- `clampHeight`: cap at `maxRowHeight` when truthy, then floor at `minRowHeight || 24`
  (`RenderFlexGrid.tsx:173-180`). Preserve the minimum default of 24.
- `lastRowHeight`: set to each committed height and use it when a row has no committed or initial
  height and the new-row preference is false (`RenderFlexGrid.tsx:162-170,185-198`).
- `getInitialRowHeight`: consult after committed height and before fallback; clamp the returned
  initial value through `clampHeight` (`RenderFlexGrid.tsx:185-193`).
- `preferMinHeightForNewRows`: when true, use `minRowHeight || defaultFlexRowHeight` instead of
  `lastRowHeight`. Its source comment explicitly names log views and its purpose is preventing a
  newly admitted variable-content row from inheriting a visibly wrong prior row height
  (`RenderFlexGrid.tsx:94-98,194-197`).
- `defaultFlexRowHeight`: preserve the donor's rule that a numeric incoming `rowHeight` is the
  default, otherwise use engine `defaultRowHeight` (24)
  (`RenderFlexGrid.tsx:138-143`).

Do not commit every observer value directly. The two arrays exist precisely so intermediate values
do not cause visible row-height jumps; removing either array or the 50 ms debounce reintroduces the
Concern 5 defect recorded in EPIC-062 (`EPIC-062.md:300-305`).

### 4. Make measurement recycling-safe

Create one shared `ResizeObserver` in `VirtualFlexGridView`. The observer callback iterates its
entries, obtains `entry.target`, looks up the current row in the measurement layer's
`WeakMap<HTMLElement, number>`, reads `target.clientHeight`, and calls
`measurement.setRowHeight(currentRow, height)`. There is no observer closure containing a row index.

On every renderer admission, including a dirty-coordinate update and a pooled-element admission,
rewrite the record's current row before calling `observe` or performing the immediate measurement.
When `CellPool` returns a released element, it still has its previous children, attributes, classes,
and event listeners (`src/renderer/uikit/VirtualGrid/CellPool.ts:8-20,47-83`); the record is the
only reliable current-row indirection. Re-observing the same element for row M overwrites row N in
the measurement map, so a later callback reports M. Add the general optional
`VirtualGridProps.onCellReleased(element)` notification and invoke it at the one release site in
`VirtualGridView.syncRegion()` after `parent.removeChild(el)` and before `pool.release(el)`
(`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:469-474`). The flex view's callback uses that
notification to unobserve and delete its own map entry; the engine contract remains simply that the
element left the DOM and entered the pool.

A detached pooled element normally reports `clientHeight === 0`, and the donor's
`setRowHeight()` already returns for height zero (`src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx:145-147`).
That guard is a backstop, not the mechanism: relying on it would leave every pooled element
permanently observed, bounded only by `CellPool`'s default 2,000-element cap
(`src/renderer/uikit/VirtualGrid/CellPool.ts:47-59`), and would make correctness depend on a guard
written for a different purpose. The release notification is the actual lifecycle boundary.

The renderer must use the target precedence `p.previous ?? p.recycle?.() ?? document.createElement("div")`.
The target geometry calls the renderer only for a missing coordinate or a cell/row/column/all dirty
entry (`src/renderer/uikit/VirtualGrid/renderInfo.ts:357-414`), so unchanged visible cells keep the
same record and observer target. The new wrapper must follow US-1062's content-side `CellParts` /
re-pointing pattern rather than inventing a second content record model
(`doc/tasks/US-1062-linkslist-virtualgrid/README.md`; closest implemented pattern:
`src/renderer/uikit/ListBox/ListBoxView.ts:297-423`). The measurement map remains its own minimal
`WeakMap<HTMLElement, number>`: the flex primitive is a reusable UIKit engine layer and must not
depend on any consumer's `CellParts` shape. It still needs US-1062's settled admission/re-pointing
invariant, but does not read a row index out of the consumer record.

### 5. Use the verified geometry-aware repaint channel

On a committed change, `VirtualFlexGridModel.commitRowHeight(row)` writes the committed value,
updates the stable row-height function, and calls:

```ts
this.gridModel?.update({ rows: [row] });
```

This is the same semantic channel as the donor
(`src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx:162-171,200-202`). In the target it is not
paint-only: `VirtualGridModel.update()` merges the dirty row and queues `updateRenderInfo()`
(`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:427-450`); `updateRenderInfo()` passes the new
function into `calcRenderInfo()` (`VirtualGridModel.ts:456-515`); and `calcRenderInfo()` rebuilds
per-row lengths and starts before the view paints (`src/renderer/uikit/VirtualGrid/renderInfo.ts:486-560`).
The row dirty set also causes only that row's changed cells to be re-rendered through
`_renderCell`'s row membership check (`renderInfo.ts:382-414`), while all following row offsets are
corrected by the geometry recomputation.

### 6. Add exports and a measured-height story

Update `src/renderer/uikit/VirtualGrid/index.ts` with the new view and prop exports, and update
`src/renderer/uikit/index.ts` in the existing vanilla virtualization section. Do not add a dashboard
entry; `doc/active-work.md:13` already contains the unchecked EPIC-062 US-1063 entry.

Extend `src/renderer/uikit/VirtualGrid/VirtualGrid.story.tsx` following its existing
`mountVanilla`/`Panel` story model (`VirtualGrid.story.tsx:1-180`). The story must visibly exercise:

- variable content lengths that produce distinct measured row heights;
- a row whose content grows after mount, causing a later observer measurement and a debounced
  geometry update;
- a scroll down and back to the top, with enough rows to force `CellPool` recycling and verify that
  a recycled element's measurement is attributed to its new row;
- the model's scroll/row-height result in the visible UI, not only a console log.

The story deliberately cannot close the real consumer stress cases: it does not exercise
`preferMinHeightForNewRows` against a live log stream, and it does not contain the notebook's
Monaco-bearing rows. Those height-policy and retained-child behaviours are owed to US-1065
(`LogBody`) and US-1064 (`NotebookBody`) respectively; the story demonstrates the primitive's
mechanics, not those consumer-specific acceptance conditions.

Keep `src/renderer/uikit/VirtualGrid/VirtualGrid.css` unchanged: it styles the existing inner
`data-type="virtual-grid"` sticky regions and does not need a second flex-specific selector
(`VirtualGrid.css:1-11`).

## Concerns / Decisions

### Concern 1 - one observer or one per row

Use one observer for all admitted cells. The donor creates one `ResizeObserver` per React row
(`RenderFlexGrid.tsx:33-55`), but vanilla cells are pooled and re-pointed continuously. One shared
observer avoids creating and destroying observers during normal scroll. Its entries are safe because
the callback reads the current row record, and the release hook removes detached elements before they
enter the pool.

### Concern 2 - the two arrays and debounce are load-bearing

`pendingHeights` prevents every intermediate observer value from changing geometry; `rowHeights` is
the stable committed geometry used by `rowHeight`. The 50 ms per-row debounce commits only the settled
value. `preferMinHeightForNewRows` avoids using `lastRowHeight` for new log rows, whose content can
differ greatly; `clampHeight` guarantees the minimum default 24 and optional maximum; `lastRowHeight`
is the fallback when a row has not been measured and has no cache/initial value
(`RenderFlexGrid.tsx:145-202` and comment at `94-98`). These fields must be ported per field, not
replaced by a single "latest measured height" variable.

### Concern 3 - cell-parts dependency

This task is hard-sequenced after US-1062, as required by EPIC-062 E4-8
(`doc/epics/EPIC-062.md:240-249`): it cannot start until US-1062's recycled-element `CellParts` /
re-pointing record shape and admission invariant are settled. The specific dependency is the
content-side rule that every admission rewrites the live element's owned state, including when the
element comes from `previous` or `recycle()`.

The measurement layer deliberately owns its own minimal `WeakMap<HTMLElement, number>` rather than
reading a row index out of the consumer's `CellParts`. The flex primitive is reusable UIKit code and
must not depend on any one consumer's record shape; it uses US-1062's invariant, not its private data
structure. The general `VirtualGridProps.onCellReleased(element)` notification is the shared engine
boundary for removing that map entry. Pooled elements retain every property the previous occupant
left behind, and renderers must overwrite everything they own
(`src/renderer/uikit/VirtualGrid/types.ts:139-169`).

### Concern 4 - no React root in a virtualized cell

The renderer return type is framework-free `HTMLElement | undefined`. The flex wrapper measures the
returned cell root directly; it does not call `mountReact` per row and does not retain React refs.
This preserves EPIC-062 E4-3's no-per-row-React-root decision and satisfies the two consumers'
eventual vanilla cell-subtree conversions.

### Concern 5 - public surface and dropped React fields

The exact retained surface is the interface in Implementation Plan section 2. The deliberate drops are
`onRender`, raw region prop bags, `blockStyles`, `qaData`, and React-node overlays because they have
no target equivalent or are not required by the two consumers. The renderer's React-only
`maxRowHeight`/`setRowHeight`/`ref` parameters are also dropped; height policy and tracking are
internal to this primitive. `onModel` remains because both consumers currently use the live grid
model for `update`, scroll, and container access
(`LogBody.tsx:21-59`; `NotebookBody.tsx:56-67`).

### Concern 6 - link-editor exclusion

No file or implementation step under `src/renderer/editors/link-editor/` is in this task. US-1062
and US-1066 own that parallel work; this document only references US-1062's already-written
cell-parts contract.

## Acceptance Criteria

- [ ] The task implementation creates `VirtualFlexGridView` and its supporting
  `VirtualFlexGridModel` in `src/renderer/uikit/VirtualGrid/` without changing
  `src/renderer/editors/log-view/LogBody.tsx` or
  `src/renderer/editors/notebook/NotebookBody.tsx`.
- [ ] The wrapper composes `VirtualGridView` and retains the underlying `VirtualGridModel`
  callback surface; it does not extend the geometry model with flex bookkeeping.
- [ ] The constructor creates only stable root/model state; child DOM, listeners, observation,
  measurement, and timers begin after mount and root attachment.
- [ ] `VirtualGridProps.onCellReleased?: (element: HTMLElement) => void` is optional, general,
  invoked at the single release site before `CellPool.release()`, and documented as a pool-entry
  notification rather than an unobserve command.
- [ ] The public interface maps the retained `RenderFlexGridProps` fields one-to-one, names every
  deliberate drop, and exposes an `HTMLElement | undefined` renderer with target
  `previous`/`recycle` parameters.
- [ ] One shared observer uses a live element-to-current-row mapping, updates that mapping on every
  admission/re-point, and removes it on release before pooling.
- [ ] Implementation is sequenced after US-1062's settled `CellParts` admission/re-pointing
  invariant, while measurement keeps its own minimal element-to-row `WeakMap`.
- [ ] `pendingHeights`, `rowHeights`, per-row 50 ms debounce, min/max clamp with default minimum 24,
  `getInitialRowHeight`, `preferMinHeightForNewRows`, `lastRowHeight`, and numeric/default baseline
  height semantics are preserved.
- [ ] A committed height calls `VirtualGridModel.update({ rows: [row] })` and therefore recomputes
  row lengths/starts before repainting the changed row.
- [ ] The story demonstrates variable content, post-mount growth, and a scroll round trip that
  visibly exercises pooling and height re-association; its log-stream and Monaco-row limitations are
  explicitly owed to US-1065 and US-1064.
- [ ] No file under `src/renderer/editors/link-editor/` is modified or planned.
- [ ] No unit tests or test harnesses are added; verification is through the story and manual
  acceptance, per project guidance.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts` | Create the measured-height vanilla wrapper and shared observer |
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts` | Create the pending/committed height bookkeeping collaborator |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | Add the optional general `onCellReleased(element)` notification at the single pool-release site |
| `src/renderer/uikit/VirtualGrid/index.ts` | Export the new primitive and prop type |
| `src/renderer/uikit/index.ts` | Export the new vanilla primitive and prop type |
| `src/renderer/uikit/VirtualGrid/VirtualGrid.story.tsx` | Extend the story with measured variable-height, growth, and scroll-round-trip scenarios |

### Files that need no changes

| File | Reason |
|---|---|
| `src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx` | Reference implementation only; the React fork remains unchanged until EPIC-062 closes |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | Existing model already accepts `ElementLength` and recomputes geometry through `update()` |
| `src/renderer/uikit/VirtualGrid/types.ts` | Existing renderer and row-height types already have the required `HTMLElement` and `ElementLength` shapes |
| `src/renderer/uikit/VirtualGrid/renderInfo.ts` | Existing geometry and recycling path already forwards `previous`/`recycle` and handles row dirty sets |
| `src/renderer/uikit/VirtualGrid/CellPool.ts` | Existing pool contract is the dependency being respected, not changed |
| `src/renderer/uikit/VirtualGrid/VirtualGrid.css` | Existing inner grid CSS already covers the composed engine root |
| `src/renderer/editors/log-view/LogBody.tsx` | Requirements-only eventual consumer; do not modify or plan its conversion here |
| `src/renderer/editors/notebook/NotebookBody.tsx` | Requirements-only eventual consumer; do not modify or plan its conversion here |
| `src/renderer/editors/link-editor/` | Explicitly out of scope; owned by parallel EPIC-062 tasks |
