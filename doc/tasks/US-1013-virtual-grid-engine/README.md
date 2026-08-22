# US-1013: The vanilla virtualization engine — `VirtualGrid`

**Epic:** [EPIC-056 — De-React C3](../../epics/EPIC-056.md)
**Status:** Implemented 2026-08-21
**Created:** 2026-08-21

## Goal

Land a framework-free 2D virtualization engine in `src/renderer/uikit/VirtualGrid/`, absorbed from
`C:\projects\av-grid\src\render\`, and give it the story the React `RenderGrid` has never had. The
React engine at `uikit/RenderGrid/` is left running unchanged for its 12 app-layer consumers
(EPIC-056 C3-1); nothing outside the new folder changes behaviour.

This task blocks US-1014 … US-1018: it fixes the seam (`RenderCellFunc` returns an `HTMLElement`),
the imperative surface the three data views will call, the name, and the no-reactive-store shape.

## Background

### The two implementations, measured

A normalized diff (line endings, quote style and whitespace neutralised) of the four shared files:

| File | Persephone (React) | av-grid (vanilla) | Verdict |
|---|---:|---:|---|
| `rerender-check.ts` | 348 | 380 | **Identical logic.** Only additions: doc comments, and a new `columnsFitted` parameter (defaults to `input.fitToWidth`, so behaviour is unchanged for existing callers) |
| `renderInfo.ts` | 704 | 796 | **Near-identical.** Four real changes, all wanted — see below |
| `types.ts` | 142 | 208 | `ReactNode` → `RenderedCell = HTMLElement \| undefined`; `CSSProperties` → six-field `CellStyle`; `Ref<T>`/`RefType<T>` dropped; adds `RecycleFunc`, `RenderCellParams.previous`, `RenderCellParams.recycle` |
| `AsyncRef.ts` | 46 | 46 | **Already in sync** — Persephone carries the same constructor-body fix. Only `export default` vs `export class` |

`renderInfo.ts`'s four functional changes, all adopted:

1. **`hasPercentLength` + `columnsFitted`.** A percentage column width fits the viewport on its own,
   so the trailing `whiteSpace` slack must not be added. Without it a single `width: "35%"` column
   produced a spurious horizontal scrollbar exactly `whiteSpace` wide. Relevant here: `ListBox` and
   `Tree` both pass `columnWidth: () => "100%"`.
2. **`recycle` and `previous` forwarded to `renderCell`.** The pooling contract (below).
3. **`RenderInfoProto` (`calcExpandWidth` / `calcExpandHeight`) dropped.** Verified unused: the only
   two matches for `calcExpand` in `src/` are its own declaration lines
   (`uikit/RenderGrid/renderInfo.ts:178,182`). Removing it also removes an
   `Object.setPrototypeOf` on a hot object.
4. **`RanderedRange` typo fixed** to `RenderedRange`, and `calcScrollOffsetY`'s last-row branch
   tidied (no behaviour change).

The two files that genuinely diverge are `RenderGridModel.ts` (547 → 607: React lifecycle replaced
by `setOptions`/`attach`/`disposed`, plus three real fixes) and the DOM shell, which is a rewrite:
`RenderGrid.tsx` (295 lines of JSX) → `RenderGrid.ts` (558 lines) with absolute-positioned cells,
`CellPool` reuse and one paint per `requestAnimationFrame`.

### Three fixes the donor model carries that the React one does not

- **`onFrameResize` recomputes.** React's version only calls `rerender()`
  (`uikit/RenderGrid/RenderGridModel.ts:234`) and relies on React re-running `setProps` to notice
  the geometry changed. A vanilla engine has no such re-entry, so the donor calls
  `inputChanged()` and `updateRenderInfo({ all: true })` when the size moved.
- **`safeDirection`.** The initial render info has an all-zero `visibleOffset`, so a *directional*
  update at offset (0,0) matches it and returns having rendered nothing — a blank grid. The donor
  suppresses `direction` while `renderInfo.current === renderInfoInitialState`.
- **`scrollLost` / `scrollNeedsRestore`.** React's `RenderGrid.tsx:69-75` restores scroll whenever
  the container's `scrollTop` merely *differs* from the model's offset. Because a scroll event is
  delivered a frame after the scroll it reports, that routinely fights the user: the write undoes
  the scroll and fires another event, so the list scrolls every other frame. The donor only restores
  after the grid was actually hidden (`display: none` zeroes `scrollTop`), which is the one case the
  container is wrong rather than merely newer. **The React engine keeps its bug** — it is not in
  this task's scope, and it is scheduled for deletion.

### What the C3 hosts actually use

`ListBox.tsx:203` and `Tree.tsx:318` pass an identical, minimal prop set: `onModel`, `columnCount={1}`,
`rowCount`, `columnWidth`, `rowHeight`, `renderCell`, `overscanRow={2}`, `fitToWidth`, `growToHeight`,
`whiteSpaceY`. They then command the model imperatively — `update({ all: true })`,
`scrollToRow(i, align)`, `visibleRowCount`, `size`. `MultiListBox` renders `ListBox` and never
touches the engine.

Counted across `src/renderer/` excluding `uikit/RenderGrid/`: `blockStyles` **0** consumers,
`contentProps` 2 (both `AVGrid`), `renderAreaProps` 0, `onRender` 0, `qaData` 0,
`onInnerSizeChange` 0, `onAdjustRenderRange` 0, `extraElement`/`extraElementTop` only `AVGrid` and
`components/git-tree/GitTree.tsx:530`, `onResize` 2 (`link-editor`), `growToWidth` 1
(`log-view/items/GridOutputView.tsx:120`).

### DOM contract facts found in the tree

- **`.scroll-container` is a live global class**, not decoration: `theme/GlobalStyles.tsx:121,126`
  hides the scrollbar and fades the thumb in on hover. The donor shell does not set it. `VirtualGrid`
  must, or every converted list gets a permanently visible native scrollbar.
- **`#avg-container` has one external consumer**: `editors/notebook/NoteItemViewModel.ts:247,280`
  (`element.closest("#avg-container")`). It reaches it through `RenderFlexGrid`, which renders the
  React `RenderGrid` and stays React (C3-3), so that consumer is untouched. `VirtualGrid` uses no
  `id` at all — the React engine sets `id="avg-root"` on *every* instance, which is a duplicate-id
  bug the new engine does not inherit.
- **`.avg-sticky*` class names have no consumer outside `RenderGrid.tsx`'s own Emotion block**, whose
  entire content is `background-color: inherit` on the eight sticky regions. That is the whole
  stylesheet to translate.
- **`data-type="render-grid"` has no external consumer.** The donor emits that same value plus nine
  `render-grid-*` region values; copied as-is they would collide with the React engine in any
  `querySelectorAll` or `@layer uikit` rule. Renamed on landing (below).

### The pooling contract, which later tasks must respect

`CellPool.release()` does **not** reset the element: it arrives at its next occupant with the same
children, classes, attributes **and event listeners**. Two consequences for US-1014/1015/1016:

- A cell renderer must overwrite everything it sets, and must use
  `p.previous ?? p.recycle?.() ?? document.createElement("div")` — preferring `previous` because
  updating in place means the paint does no DOM insertion at all and anything living on the element
  survives (focus, an open editor, a running transition).
- **Per-row listeners are wrong.** The element that is row 3 now is row 400 after a scroll. Hosts
  delegate from the container and resolve the target through `data-row` / `data-part`, exactly as
  the donor's own list view does (`C:\projects\av-grid\src\view\VirtualList.ts:191-194`).

## Decisions taken in this task

Each was put to an independent agent with no conversation context; the reasoning was reviewed
rather than adopted on sight, and where a recommendation conflicted with a settled epic decision the
epic won (see D3).

**D1 — Name: `VirtualGrid`.** Folder `src/renderer/uikit/VirtualGrid/`, classes `VirtualGridView`
and `VirtualGridModel`, root `data-type="virtual-grid"`, regions demoted to `data-part`.

Verified collision-free: `grep -ri "virtualgrid\|virtual-grid"` over `src doc docs assets` returns
nothing. The decisive property is grep separation — `VirtualGrid` shares no token with `RenderGrid`,
so for the two epics the two engines coexist, `grep RenderGrid` returns exactly the dying one.
Rejected: `RenderGridVanilla` / `RenderGrid2` (every `RenderGrid` search hits both, which is the
failure C3-4 exists to prevent, and bakes migration state into a name that outlives the migration);
`CellGrid` (reads as a *data* grid, which is what `AVGrid` is, and under-sells virtualization);
`GridViewport` (`uikit/ImageViewport/` already exists).

The `View` suffix follows the universal convention in this folder — 34 files are named
`<Component>View.ts(x)`. There is deliberately **no** `VirtualGrid.tsx` React face: the story mounts
the view through `mountVanilla` and every host in C3 is itself becoming a vanilla view, so nothing in
this task adds a React wrapper to Epic F's removal ledger.

**D2 — Shape: `VirtualGridView extends VanillaView<VirtualGridProps>`**, not the donor's
`new RenderGrid(host, options)`.

`shared/mount.tsx:5` types the React boundary as `new (props: P) => VanillaView<P>` and calls
`new ctor(props)` with one argument at `:32`, so the donor's two-argument constructor cannot be
hosted there at all — the story and every transitional React host would each need a bespoke adapter.
The measure ordering actually favours `VanillaView`: the donor appends itself, then measures, then
paints, all inside its constructor; `mount.tsx:34` appends `view.root` *before* calling `mount()` at
`:37`, and Rule 9 states the owner attaches `root` before `mount()` precisely for views that measure
themselves. So attach → measure → first paint move verbatim into `onMount()`.

Three donor behaviours must be dropped, not ported:

- `this.host.append(this.root)` — a `VanillaView` never touches its parent.
- `this.root.remove()` in `destroy()` — `shared/vanilla-view.ts:86-89` says the view does not detach
  its root, and `mount.tsx:66` already removes it.
- constructor-time `addEventListener` and subscription — Rule 9 forbids listeners in the
  constructor; they become `this.listen(...)` / `this.own(...)` from `onMount()`.

**Two classes, not one, and hosts hold the model.** The model is ~600 lines of DOM-free geometry;
the shell is DOM sync. `ListBoxModel.ts:42` and `TreeModel.ts:73` already type a field as the model,
not the view. The view exposes `readonly model`, so a vanilla host does
`this.grid = this.child(new VirtualGridView(props))` and then `this.grid.model.update(...)`.

**D3 — No reactive store; one `onRepaintNeeded` callback.** This is EPIC-056 C3-2, and it is where an
agent recommendation was **rejected**: the shape agent proposed porting the model onto
`TComponentState` + `createComponentModelDriver` so that `VanillaView.bind()` could be used. That
reintroduces exactly the store C3-2 removed, and it is unnecessary — the shell needs one signal
("something changed, repaint next frame"), not a subscribable state.

Verified by enumerating every trigger. The donor calls `requestRepaint()` in exactly three places
(`av-grid/src/render/RenderGridModel.ts:266`, `:480`, `:492`), and Persephone's React model in the
same three (`uikit/RenderGrid/RenderGridModel.ts:234`, `:324`, `:336`). All three are
frame-coalescable: a `ResizeObserver` callback, the post-recompute notify, and a second pass *after*
`await containerRef.async` once the scrollbar changed the usable width. `onScroll` and `setOptions`
never call it directly — they recompute and reach it through the same path. And no *host* ever
observes the engine: `ListBoxModel` and `TreeModel` only command it and read synchronous getters
(`visibleRowCount`, `size`), while push-to-host already exists as the `onResize` and
`onInnerSizeChange` option callbacks. One statically-known subscriber is a callback, not a subject.

Rejected: the model owning the `requestAnimationFrame` (puts frame timing in the DOM-free half, which
Rule 9 forbids, and a callback that paints *now* would paint from inside a `ResizeObserver` callback
— a documented layout-thrash source); merging the halves (the model is a published type held by five
files through `onModel`); a hand-rolled listener array (the rejected observable with worse
ergonomics).

**The synchronous first paint survives.** It never went through the notification: `attach()` →
`checkSize()` → `onFrameResize()` *requests* a repaint, and then `onMount()` calls `paint()`
directly. The queued frame then early-returns on the `info === this.lastInfo` identity check. The
implementation additionally cancels a pending frame inside `paint()`, so the wasted frame is not even
queued.

Guards, all load-bearing rather than defensive:

| Where | Guard | Why |
|---|---|---|
| `VirtualGridModel.requestRepaint` | `if (this.disposed) return` | `renderInfoChanged` resumes after an `await`; `ResizeObserver` can fire between `dispose()` and `disconnect()` |
| the callback field | defaults to a module-level `noop`, reset to `noop` in `dispose()` | no null checks, and it releases the model → view → DOM retention for hosts that keep a model reference past teardown |
| `requestRepaint` | invoke the callback **last** | a throwing view cannot leave model state half-updated |
| `VirtualGridView.schedulePaint` | `if (this.disposed \|\| this.paintScheduled) return` | this *is* Rule 9's "tolerate invocation after disposal": `dispose()` marks the view inert **before** disposing the model, so repaint requests emitted during model teardown land on an inert scheduler |
| by rule | the callback may only ever **schedule**, never paint | keeps re-entrancy structurally impossible: `paint()` writes `scrollTop`, whose scroll event is delivered asynchronously |

**D4 — `AsyncRef` moves to `uikit/shared/async-ref.ts`.** It is already byte-equivalent on both
sides and has exactly one importer (`uikit/RenderGrid/RenderGridModel.ts:2`); nothing re-exports it.
Moving it to the documented home for cross-component helpers removes a duplicate instead of creating
one, and leaves nothing to clean up when `uikit/RenderGrid/` is deleted. The cost is one import line
in the frozen folder — an internal edit with no export, behaviour or consumer change. Rejected:
copying it into `VirtualGrid/` (a second copy of a file we would then have to keep in sync), and
importing it *from* `RenderGrid/` (a dependency from the live engine into the folder scheduled for
deletion).

**D5 — The surface that is deliberately not ported.** `blockStyles`, `contentProps`,
`renderAreaProps`, `onRender` and `qaData` are React-shaped escape hatches with zero consumers
outside `AVGrid` (which stays React until C4, and which C4 replaces wholesale). A vanilla host styles
the engine through `className` plus its own `@layer uikit` rules. `extraElement` /
`extraElementTop` are replaced by `addOverlay(el, "content" | "header")`, which is safe against the
paint because region reconciliation only ever removes elements it appended itself.

**D6 — `stats` stays.** `VirtualGridStats` (paints, cells appended/removed, paint ms) plus
`CellPool` hit/miss counters are how EPIC-056's premise gets measured — the settled-scroll allocation
count and the engine half of the Rule 4 number. Cost is five integer increments and two
`performance.now()` calls per paint, never per cell.

**D7 — `onView`, not `onModel`.** No C3 host needs a callback at all (they own the view), but the
story needs the imperative handle and Epics D/E will host the engine from React. One callback that
hands back the *view* is strictly more capable than one that hands back the model, since
`view.model` is public — and it is what exposes `stats` to the story. Called with the view from
`onMount()` and with `null` from `onDispose()`; prop-identity changes on `update()` are ignored.

## Implementation plan

### Step 1 — `uikit/shared/async-ref.ts`

- Move `src/renderer/uikit/RenderGrid/AsyncRef.ts` → `src/renderer/uikit/shared/async-ref.ts`,
  changing `export default class AsyncRef<T>` to `export class AsyncRef<T>`. Keep the whole doc
  comment, including the "do not move `async` back to a field initializer" paragraph, and drop the
  now-wrong "Kept in sync with av-grid's `core/AsyncRef.ts`" line in favour of naming both consumers.
- Delete the old file and change `uikit/RenderGrid/RenderGridModel.ts:2`:
  `import AsyncRef from './AsyncRef';` → `import { AsyncRef } from '../shared/async-ref';`
- Nothing else in `uikit/RenderGrid/` changes.

### Step 2 — `uikit/VirtualGrid/types.ts`

Copy `C:\projects\av-grid\src\render\types.ts` verbatim. It has no imports, so nothing to rewire.
Keep every donor name (`RenderCellFunc`, `RenderCellParams`, `RenderedCell`, `CellStyle`,
`RerenderInfo`, …) — `renderInfo.ts` and `rerender-check.ts` are ported nearly line-for-line against
them, and renaming inside the folder would fork the two files for no gain. Divergence is handled at
the barrel instead (step 8).

### Step 3 — `uikit/VirtualGrid/rerender-check.ts` and `renderInfo.ts`

Copy both verbatim from the donor. `renderInfo.ts` imports only `./rerender-check` and `./types`;
`rerender-check.ts` imports only `./types`. Nothing to rewire, and no Persephone utility is
substituted — in particular the local `range` helper stays local (its `to < from` → empty-array
behaviour is relied on by every sticky-band caller, and `core/utils`' `range` normalises reversed
bounds).

### Step 4 — `uikit/VirtualGrid/CellPool.ts`

Copy verbatim. No imports.

### Step 5 — `uikit/VirtualGrid/VirtualGridModel.ts`

Port `C:\projects\av-grid\src\render\RenderGridModel.ts` with the store removed:

- `export class VirtualGridModel` — **no base class**. Delete `extends Model`, the
  `RenderGridState`/`defaultRenderGridState`/`renderDt` triple, and the `super()` call.
- `import { AsyncRef } from "../shared/async-ref";`
- Constructor: `constructor(options: VirtualGridOptions, onRepaintNeeded: () => void = noop)`.
  Keep the `this.inputChanged()` baseline call — it stops the first `setOptions` reporting a false
  change.
- `requestRepaint = (): void => { if (this._disposed) return; this.onRepaintNeeded(); }`
- `dispose()`: set `_disposed`, `resizeObserver?.disconnect()`, clear it, and
  `this.onRepaintNeeded = noop`.
- Rename `RenderGridOptions` → `VirtualGridOptions`, `RenderGridModelInput` →
  `VirtualGridModelInput`, `RenderGridElements` → `VirtualGridElements`.
- Keep verbatim, comments included: `inputChanged()`'s "the offset is deliberately NOT compared"
  block, `safeDirection`, the shrink-to-less-than-a-viewport snap-to-top recursion,
  `scrollLost`/`scrollNeedsRestore`/`restoreScroll` with its "never call this to reconcile a
  mismatch" warning, `mergeRerenders`' no-deduplication note, and the `update()` microtask
  coalescing with its `force` bypass.
- Keep `attach()`'s `typeof ResizeObserver !== "undefined"` guard.

### Step 6 — `uikit/VirtualGrid/VirtualGridView.ts`

Port `C:\projects\av-grid\src\render\RenderGrid.ts` into `VanillaView`:

```ts
export interface VirtualGridProps extends VirtualGridOptions {
    className?: string;
    height?: string;
    growToHeight?: string;
    growToWidth?: string;
    onView?: (view: VirtualGridView | null) => void;
}

export class VirtualGridView extends VanillaView<VirtualGridProps> {
    readonly model: VirtualGridModel;
    readonly pool = new CellPool();
    // container, area, regions, attached, rafId, paintScheduled, lastInfo, stats …

    public constructor(props: VirtualGridProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "virtual-grid";
        this.model = new VirtualGridModel(props, this.schedulePaint);
        this.own(() => this.model.dispose());
    }

    protected onMount(): void { /* build regions, styles, listen, attach, paint */ }
    protected onUpdate(props: VirtualGridProps): void { /* re-apply root styles, setOptions */ }
    protected onDispose(): void { /* cancel frame, clear pool + attached sets, onView(null) */ }
}
```

Details that differ from the donor:

- `data-type="virtual-grid"` on the root only. The nine regions carry `data-part`: `scroll`, `area`,
  `sticky-top`, `sticky-bottom`, `sticky-left`, `sticky-right`, `sticky-top-left`,
  `sticky-top-right`, `sticky-bottom-left`, `sticky-bottom-right`. `data-name` from `props.name`.
  No `id` anywhere.
- The scroll container gets `classList.add("scroll-container")` for the global hover-scrollbar rule.
- Keep the donor's `setStyle` write-only-if-different helper and the `overflow-anchor: none` on both
  the container and the area, with its comment — Chromium's scroll anchoring silently undoes part of
  the user's scroll in a virtualized list, which was found in a 100,000-option filter popover.
- `onMount()` order is load-bearing: build DOM → `applyStaticStyles()` → `listen(container,
  "scroll", model.onScroll, { passive: true })` → `model.attach({ grid: this.root, container:
  this.container })` → `this.paint()` → `props.onView?.(this)`.
- `onUpdate(props)` calls `this.model.setOptions(props)` with the full object. `setOptions` merges
  and then `inputChanged()` compares **field by field**, so a full replacement is not itself a change
  signal — but `renderCell` is compared by reference, so a host that recreates it per update rebuilds
  every visible cell. Document that as the host contract; `rowCount`/`columnCount` are safe even as
  fresh arrows because `inputChanged` resolves them through the getters to numbers first.
  `onUpdate` must also re-apply `className`, `height`, `growToHeight`, `growToWidth` and the
  `fitToWidth`-derived `overflow-x` through `setStyle` — the donor only re-applied `className`,
  because with a partial `setOptions` the others could not change.
- `schedulePaint` is a bound field (it is handed to the model in the constructor).
- `paint()` cancels any pending frame before doing its work, so the request queued by `attach()` is
  not spent on a no-op frame.

### Step 7 — `uikit/VirtualGrid/VirtualGrid.css`

```css
@layer uikit {
    [data-type="virtual-grid"] [data-part^="sticky-"] {
        background-color: inherit;
    }
}
```

That is the entire translation of `RenderGrid.tsx`'s Emotion block (eight `.avg-sticky*` rules, all
`backgroundColor: inherit`). Per C3-8's selector-depth guard: the selector uses a descendant
combinator and a `data-part` prefix match, so it does not depend on document order, sibling position
or host depth — which matters because the engine writes `left/top/width/height` on every cell and the
regions are positioned, not flowed. Everything else the shell needs is geometry and stays in
`element.style`, written by `applyLayout`/`applyStaticStyles`.

### Step 8 — `uikit/VirtualGrid/index.ts` and the `uikit/index.ts` barrel

Folder barrel re-exports the classes, `VirtualGridProps`, `VirtualGridOptions`, `VirtualGridStats`
and the geometry types under their own names.

`uikit/index.ts` must **alias** on the way out: it already exports `RenderCellParams`,
`RenderCellFunc`, `Percent` and `RowAlign` from `./RenderGrid`, and re-exporting the same names from
`VirtualGrid` is a duplicate-export error. Verified safe to alias: every consumer of those types
imports them from the folder (`uikit/RenderGrid`), not from the barrel — nine files, all folder
imports.

```ts
// Vanilla virtualization engine — what new code uses.
export { VirtualGridView, VirtualGridModel } from "./VirtualGrid";
export type { VirtualGridProps, VirtualGridOptions } from "./VirtualGrid";
export type {
    RenderCellFunc as VirtualCellFunc,
    RenderCellParams as VirtualCellParams,
    RenderedCell,
} from "./VirtualGrid";
```

The existing `RenderGrid` export block keeps its exports **exactly** as they are, and gains one
comment line marking it React-only and pending removal. No consumer import changes.

### Step 9 — `uikit/VirtualGrid/VirtualGrid.story.tsx`

The engine's first story, registered in `editors/storybook/storyRegistry.ts` under section
`"Lists"` (the section that already holds `ListBox`, `Tree`, `MultiListBox`).

A `VirtualGridDemo` React component wraps `mountVanilla(VirtualGridView, props)` in
`<Panel width={640} height={320}>` — the live preview centres its content and gives it no definite
height, and the engine measures its own root, so the fixed-size wrapper is required (the
`ListBox.story.tsx:145` pattern).

Story props, chosen to drive what a story otherwise hides:

| Prop | Type | Default | Exercises |
|---|---|---|---|
| `rowCount` | number | 10000 | virtualization at all — a count no non-virtual list survives |
| `columnCount` | number | 6 | the second axis, which `ListBox`/`Tree` never use |
| `rowHeight` | number | 24 | uniform-length fast path |
| `variableRowHeight` | boolean | false | the per-element array path (`rowHeight` as a function) |
| `fitToWidth` | boolean | false | `columnsFitted`, and `overflow-x: hidden` |
| `percentWidth` | boolean | false | `hasPercentLength` — the spurious-scrollbar fix |
| `stickyTop` / `stickyBottom` | number | 1 / 0 | the horizontal bands |
| `stickyLeft` / `stickyRight` | number | 1 / 0 | the vertical bands and, with the above, all four corners |
| `overscanRow` | number | 2 | direction-only overscan |
| `showStats` | boolean | true | the settled-scroll measurement |

The cell renderer follows the pooling contract exactly and overwrites everything it sets:

```ts
const renderCell: RenderCellFunc = (p) => {
    const el = p.previous ?? p.recycle?.() ?? document.createElement("div");
    el.dataset.part = "cell";
    el.dataset.row = String(p.row);
    el.dataset.col = String(p.col);
    el.textContent = `R${p.row} · C${p.col}`;
    Object.assign(el.style, { /* the six CellStyle fields, as px */ });
    return el;
};
```

`showStats` renders a readout above the grid — paints, cells appended/removed, pool hits/misses,
last paint ms — polled on a 500 ms interval from the view captured through `onView`. That is what
makes "a settled scroll allocates nothing" observable: scroll, stop, watch `misses` stop rising
while `hits` keeps pace with `appended`.

### Step 10 — `uikit/CLAUDE.md`

Two additions, both mandated by the epic:

1. **C3-4's one line**, in the folder-structure or naming section: new code uses `VirtualGrid`;
   `RenderGrid` and `RenderFlexGrid` are React-only, still exported for their remaining app-layer
   consumers, and pending removal on Epic F's ledger.
2. **C3-2's named exemption**, as a bounded rule rather than something the code merely does: the
   virtualization engine keeps plain fields and paints on `requestAnimationFrame`; it is the only
   component in `uikit/` exempt from the state primitives, because its only consumer is a paint loop
   that already carries a dirty set. Any deviation is justified per call site, and a host that wants
   to *observe* the engine gets a registered callback, not a store.

## Concerns

1. **Storyless-component count moves the wrong way, and that is honest.** EPIC-056 C3-9 targets
   "`uikit/` components without a story: 2 → 1". With coexistence the story lands on `VirtualGrid`
   while the React `RenderGrid` still has none, so the count at C3's close is 2 of 45
   (`RenderGrid`, `AVGrid`) rather than 1 of 44. This is a consequence of C3-1, not a regression:
   both storyless components are on the removal ledger. The epic's table is corrected rather than
   quietly met.
2. **`data-part^="sticky-"` is the only CSS in the component**, so if a later task adds a
   `data-part` beginning with `sticky-` that is *not* a region, it inherits the background rule.
   Cheap to avoid, worth stating.
3. **The engine is the first `uikit/` component with no `TComponentModel`**, so a reader cannot
   navigate it by knowing the state primitives. Mitigated by the `uikit/CLAUDE.md` exemption
   (step 10) and by a file header on `VirtualGridModel.ts` stating the same reason.
4. **`stats` is production code carrying a measurement affordance.** Two `performance.now()` calls
   per paint, never per cell. If it ever shows up in a profile it can be compiled out, but taking it
   out now would remove the only way to verify the epic's premise.
5. **Nothing verifies the engine against real data until US-1014.** The story exercises geometry with
   a synthetic renderer; the first honest test is `ListBox` on top of it. Expect small fixes to land
   in US-1014 against `VirtualGrid` rather than in `ListBox`, and record them here.

## Acceptance criteria

- `npx tsc --noEmit` clean, `npm run lint` clean, `git diff --check` clean.
- `src/renderer/uikit/VirtualGrid/` contains `types.ts`, `rerender-check.ts`, `renderInfo.ts`,
  `CellPool.ts`, `VirtualGridModel.ts`, `VirtualGridView.ts`, `VirtualGrid.css`,
  `VirtualGrid.story.tsx`, `index.ts`, and imports nothing from `uikit/RenderGrid/`
  (`grep -r "RenderGrid" src/renderer/uikit/VirtualGrid/` returns only prose in comments).
- `VirtualGridModel.ts` contains no `TComponentModel`, no `TOneState`, no `TComponentState`, and no
  `effect(` — verified by grep, not by inspection.
- `uikit/RenderGrid/` is unchanged except for `RenderGridModel.ts`'s single `AsyncRef` import line;
  `uikit/index.ts`'s `RenderGrid` export list is byte-identical apart from an added comment.
- The story appears in the Storybook editor under "Lists", renders 10,000 rows, and every prop
  control changes what is on screen: sticky bands appear on all four sides with correct corners,
  `fitToWidth` removes the horizontal scrollbar, `percentWidth` does not produce a 20px phantom
  scrollbar, and `variableRowHeight` gives alternating row heights that scroll correctly.
- With `showStats` on: after scrolling and stopping, `pool.misses` stops rising while `appended`
  continues to be served by `hits` — the settled-scroll allocation claim, recorded in EPIC-056's
  Notes.
- Scrolling to the very top from a scrolled position renders rows (the `safeDirection` trap), and
  hiding then reshowing the preview keeps the scroll position (the `scrollLost` path).

## Verification results

`npx tsc --noEmit` clean, `npm run lint` clean, `git diff --check` clean. `uikit/RenderGrid/`
changed by exactly one line (the `AsyncRef` import). `grep` confirms `VirtualGridModel.ts` contains
no `TComponentModel`, `TOneState`, `TComponentState` or `effect(`.

Verified at runtime in the running app by mounting the engine into an offscreen container, so the
user's open tabs were never touched.

**Engine probe** — 50,000 rows × 4 columns in a 400×300 viewport, `stickyTop: 1`, `stickyLeft: 1`:

| Phase | Cells on screen | `createElement` | Pool hits | Pool misses | Paint |
|---|---:|---:|---:|---:|---:|
| First paint | 52 | 52 | 0 | 52 | 0.1 ms |
| Warm-up (10 scroll steps) | 60 | 112 total | 448 | 112 | 0.4 ms |
| **Settled (20 scroll frames)** | 60 | **0** | **1000** | **0** | 0.1 ms |

That last row is the epic's premise, measured: 1,000 cells were admitted across 20 frames and every
single one was served from the pool. Also confirmed: `data-type="virtual-grid"`, `data-name`
forwarded, `.scroll-container` present on the scroller, sticky top/left bands populated
(4 and 12 cells), `visibleRowCount` 12, inner height 1,200,020 px, scrolling back to the very top
still renders rows (the `safeDirection` trap), and `dispose()` leaves the model disposed.

**A defect the story would not have caught.** The first probe reported `pool.hits: 0`,
`misses: 0`, `released: 272` — the pool was filling from every paint and never being drawn from,
because the view was not passing `recycle` to the model (the donor built its options as
`{ ...options, recycle: this.pool.acquire }`; that line was lost in the port). Every visible
symptom was correct — right cells, right positions, right scrolling — while the entire point of
`CellPool` was dead. Fixed in `VirtualGridView`'s constructor and `onUpdate`, and it is the reason
`stats` is worth keeping in production (D6): this failure mode is invisible without it.

**Story probe** — the registered story rendered through `mountVanilla` with its default props
(10,000 rows × 6 columns): 84 cells, sticky top 6 cells, sticky left 13, sticky bottom hidden,
stats line live, first cell `R0·C0`. Each arm checked separately:

| Arm | Result |
|---|---|
| default | area 740 px (6×120 + 20 slack), horizontal scrollbar present |
| `fitToWidth` | area 720 px (slack dropped), `overflow-x: hidden` |
| `percentWidth` | area **650 px = exactly the client width**, no horizontal scrollbar — the `hasPercentLength` fix demonstrated |
| `variableRowHeight` | row heights alternate 48 px / 24 px |
| `stickyRight` + `stickyBottom` | both regions switch to `inline-flex` / `block` and populate |

`fitToWidth` does not resize *numeric* column widths — only percentage lengths absorb spare space,
so it drops the trailing slack and hides the scrollbar. That is the engine's behaviour on both
sides, and the story now says so in a comment rather than implying the control fits the columns.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/shared/async-ref.ts` | **new** — moved from `RenderGrid/AsyncRef.ts`, named export |
| `src/renderer/uikit/RenderGrid/AsyncRef.ts` | **deleted** |
| `src/renderer/uikit/RenderGrid/RenderGridModel.ts` | one import line |
| `src/renderer/uikit/VirtualGrid/types.ts` | **new** — adopted verbatim |
| `src/renderer/uikit/VirtualGrid/rerender-check.ts` | **new** — adopted verbatim |
| `src/renderer/uikit/VirtualGrid/renderInfo.ts` | **new** — adopted verbatim |
| `src/renderer/uikit/VirtualGrid/CellPool.ts` | **new** — adopted verbatim |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | **new** — adopted, store removed |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | **new** — adopted into `VanillaView` |
| `src/renderer/uikit/VirtualGrid/VirtualGrid.css` | **new** |
| `src/renderer/uikit/VirtualGrid/VirtualGrid.story.tsx` | **new** |
| `src/renderer/uikit/VirtualGrid/index.ts` | **new** |
| `src/renderer/uikit/index.ts` | new export block + one comment on the `RenderGrid` block |
| `src/renderer/editors/storybook/storyRegistry.ts` | register `virtualGridStory` |
| `src/renderer/uikit/CLAUDE.md` | C3-4 line + C3-2 exemption |
| `doc/epics/EPIC-056.md` | US-1013 row → link; storyless count correction; notes |
| `doc/active-work.md` | task entry |

### Files that need NO changes

Listed so the implementation does not go looking:

- `uikit/RenderGrid/RenderGrid.tsx`, `RenderFlexGrid.tsx`, `renderInfo.ts`, `rerender-check.ts`,
  `types.ts`, `index.ts` — the React engine keeps its exact exports and behaviour (C3-1, C3-3),
  including the `restoreScroll`-on-mismatch bug and the duplicate `id="avg-root"`.
- `uikit/ListBox/*`, `uikit/Tree/*`, `uikit/MultiListBox/*` — US-1014/1015/1016.
- `uikit/AVGrid/*` — C4. A C3 task editing an `AVGrid/` file is a signal the seam is being violated
  (EPIC-056 Concern 8).
- The 12 app-layer importers of `RenderGrid`/`RenderGridModel` in `components/` and `editors/`.
- `editors/notebook/NoteItemViewModel.ts` — its `closest("#avg-container")` resolves through
  `RenderFlexGrid`, which is untouched.
- `theme/GlobalStyles.tsx` — `.scroll-container` is consumed, not changed.
- `uikit/shared/vanilla-view.ts`, `shared/mount.tsx` — the engine fits the existing contract; no
  base-class change is needed.
