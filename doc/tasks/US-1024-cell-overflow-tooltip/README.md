# US-1024: The cell-overflow tooltip, restored once in `DataGridView`

**Status:** Implemented — app-level acceptance list untested
**Epic:** [EPIC-057 — De-React Epic C4: AVGrid → av-grid](../../epics/EPIC-057.md)
**Created:** 2026-08-22

## Goal

Restore "hover a clipped cell, read its full value" for every av-grid consumer in the app, wired
once into `uikit/DataGrid/DataGridView.ts` — the single seam all of them mount through. The React
grid gave this to every string cell for free by wrapping it in `<TruncatedText>`, which supplied
both an ellipsis and the tooltip; av-grid supplies **neither** (F1), so US-1020 and US-1021 have
already shipped the regression. This task lands **before US-1022** so the four remaining consumers
inherit the fix instead of each needing a retrofit.

It has two halves, and they are not independent: the ellipsis is av-grid's to fix (C4-10, third
invocation) and the tooltip is Persephone's. The library fix is what makes the app fix small, because
it puts a measurable, alignment-proof element in the cell for the tooltip to key off.

## Background

### What was lost, and where

The React grid's `DataCell` wrapped the display value in `<TruncatedText>`:

```tsx
// src/renderer/uikit/AVGrid/DataCell.tsx:99-102
if (typeof value === "string" || isHighlighted) {
    value = <TruncatedText>{value}</TruncatedText>;
}
```

`TruncatedText` (`uikit/TruncatedText/TruncatedTextView.tsx`) is a `span` with
`overflow: hidden; text-overflow: ellipsis; white-space: nowrap` plus an `attachTooltip` whose
content is the full text **only while `scrollWidth > offsetWidth`**. So the React grid's behaviour
was: ellipsis always, tooltip only when clipped, and only for cells whose display value was a
string.

That last clause is worth stating precisely, because it is the parity baseline: `columnDisplayValue`
in the React grid returned `row[column.key]` **raw** when the column had no `formatValue` /
`displayFormat` (`uikit/AVGrid/avGridUtils.ts:184-190`), so a long *number* cell got no tooltip and
a *date* got one only if a formatter had already turned it into a string. av-grid's `displayText`
stringifies everything (`av-grid/src/view/DataCell.ts`, bottom), so exact parity is no longer the
interesting target — "clipped" is the honest signal, and it is available for every shape.

### The seam

Every consumer mounts through `uikit/DataGrid/DataGridView.ts` — a `VanillaView` that owns the grid
root (`this.root`, `data-type="data-grid"`) and the `AVGrid.create()` instance, and whose
`listen()` / `own()` helpers already tie listeners to the view's lifetime
(`uikit/shared/vanilla-view.ts`). Nothing else in the app touches av-grid: the
`no-restricted-imports` rule confines the package to `uikit/DataGrid/**`.

### What av-grid puts in a cell

`av-grid/src/view/DataCell.ts` writes one of four content shapes into a pooled, absolutely
positioned `div`:

| Shape | Content | Written by |
|---|---|---|
| `text` | a bare text node | `setText(el, text)` |
| `match` | `innerHTML`: one `<span class="avg-search-text">` wrapper with `<span class="avg-search-match">` marks inside | `highlightMarkup` |
| `bool` | a `<span>` holding a tick, or `.avg-bool-box` when editable | constant markup |
| `html` / `node` | whatever a host column's `render(context)` returned | the host |

Every cell carries `data-type="data-cell"`, `data-row`, `data-col` and `data-column-key`, and
av-grid's DOM contract (`av-grid/docs/api.md`, "DOM contract") states that **class names and
`data-*` attributes are public surface while the DOM structure is not** — so the plan may resolve a
cell by those attributes and may not assume anything about nesting.

`data-row` is the **data** row index into `model.data.rows`, which is the filtered-and-sorted array
`grid.getVisibleRows()` returns (`av-grid/src/AVGrid.ts:391-393`). `data-col` is **not** an index into
`getColumns()` — see F2, which is the one place a plausible reading of the contract produces a silent
bug.

The cell is styled `display: inline-flex; align-items: center; overflow: hidden; white-space: nowrap;
text-overflow: ellipsis` with 4 px horizontal padding and `box-sizing: border-box`
(`av-grid/src/styles/av-grid.css.ts:172-187`). That `text-overflow` declaration does nothing — F1.

### `formatValue` is already the library's "what this cell shows as text" contract

This is the finding that makes the feature small, and it is not a coincidence of one consumer's
columns. `columnDisplayValue(column, row)` — `formatValue`, then `displayFormat`, then the raw
property (`av-grid/src/gridUtils.ts:287-294`) — is what the library itself uses for **filtering** a
computed column and for the **clipboard**, with the reason written down in the filter path:

```ts
// av-grid/src/gridUtils.ts:117-123
// A computed column has no row property to compare, so it is matched by what it *shows* —
// the same rule the clipboard already copies by. `formatValue` only; `render` is not
// called here, because it may return an element and it is host code inside the row loop.
```

So a `render` column that draws something which is *not* text is already expected to declare
`formatValue`, or it would filter and copy wrongly. `GitTree.tsx` complies for exactly that reason:
its swimlane graph column and its L/R picker column both carry `formatValue: () => ""`
(`components/git-tree/GitTree.tsx:213, 224`), while `subject`, `shortHash`, `authorDate` and
`authorName` all resolve to real text. `columnDisplayValue` therefore separates "cells a tooltip
should read" from "cells it must not" with no new per-column flag — using the library's own rule
rather than a Persephone convention.

### The tooltip machinery

`uikit/Tooltip/attach-tooltip.ts` — `attachTooltip(trigger: Element, options): TooltipAttachment`:

- binds `mouseenter` / `mouseleave` / `focusin` / `focusout` / `keydown` **to the trigger element**;
- shows after `delayShow` (default 800 ms), hides after `delayHide` (100 ms);
- positions with `@floating-ui/dom`'s `computePosition(trigger, root, …)` and keeps it there with
  `autoUpdate(trigger, root, position)`;
- returns exactly `{ update(options), dispose() }` — **there is no imperative `show()` / `hide()`**;
- re-checks suppression when the delay fires, and closes on either registry's change:
  `overlayRegistry.isSuppressed(trigger)` (a popover/menu/dialog is open and the trigger is not
  inside it) and `tooltipRegistry.isDragging()` (**HTML5 drags only** — `dragstart` / `dragend` /
  `drop`).

The last two lines are where the grid's own interactions fall outside what the machinery knows: a
range-selection drag and a column-resize drag are pointer-driven and are not HTML5 drags, and
av-grid's filter popover is the library's DOM, so `overlayRegistry` has never heard of it.

### Why per-cell attachment is not the obvious answer it looks like

av-grid deliberately does not use enter/leave for its own hover tracking:

```
// av-grid/src/view/GridInteractions.ts:729-738 (abridged)
// `pointermove` rather than `mouseover` because pooled elements do not reliably fire enter/leave
// pairs — and rather than `mousemove`, which looks equivalent and is not: `onCellPointerDown`
// calls `preventDefault()` … which suppresses the compatibility mouse events for the rest of that
// pointer's stream.
```

Both halves of that comment apply to the tooltip: cells are recycled, so `mouseenter` is not
dependable, and after a pointerdown the compat mouse events stop arriving at all.


## Findings

Nine findings from planning. Four came from independent agents; F1 was cross-checked by a second,
independent agent because it contradicts the epic and drives an upstream release.

### F1 — av-grid does not ellipsize. It never has. Every clipped cell is a hard mid-glyph cut

The epic and this task's first draft both asserted "the library supplies the ellipsis". It does not.
`text-overflow: ellipsis` applies to **block containers** (CSS Overflow 3), and a bare text node
inside a flex container becomes an *anonymous flex item* — a generated block box that inherits
neither `overflow` nor `text-overflow` (both non-inherited, initial `visible` / `clip`). The
`overflow: hidden` that does the clipping sits one level up on the flex container, which has no line
boxes of its own to truncate. The ellipsis has nowhere to be painted.

Verified twice, independently, in real Chromium (headless, with screenshots, at device scale 1 /
1.25 / 1.5 / 3 / 4), against a faithful copy of the cell rule:

| Case | `…` painted? |
|---|---|
| `inline-flex`, bare text node (**shape 1, today**) | **No** — hard clip mid-glyph |
| `display: flex`, bare text node | **No** |
| `inline-flex`, single plain inline `<span>` (**shape 2, today**) | **No** |
| `inline-flex` + inner span with its own `overflow: hidden; text-overflow: ellipsis; min-width: 0` | **Yes** |
| `display: block`, bare text | **Yes** |
| `inline-flex; justify-content: flex-end`, bare text (**every numeric column, today**) | **No, and the overflow goes _left_** |
| `::first-line { text-overflow }` on the container | **No** |

Three consequences:

1. The anonymous flex item is **unreachable from CSS**. No declaration on the container makes
   `text-overflow` apply to bare text in a flex box. A wrapper element is the only fix.
2. **A second, worse bug falls out of the right-aligned case.** Overflow in a `nowrap` flex line moves
   to the *start* side when the line is not start-aligned, so an over-long value in an
   `.avg-align-right` column loses its **leading** characters. `DataCell.alignClass` right-aligns
   every number by default (`av-grid/src/view/DataCell.ts:92-99`), so a long number today silently
   drops its most significant digits with no ellipsis and no other cue: `123456789` renders as
   `456789`, which reads as a valid number and is not one.
3. Because nothing is ellipsized, **"did an ellipsis appear" can never be the tooltip's signal**, and
   the app cannot claim the ellipsis half of `<TruncatedText>`'s behaviour survived the migration. It
   did not.

C4-10's third invocation, and the clearest of the three: the library declares an intent its own
stylesheet does not achieve, and no host-side CSS can reach the box that needs the declaration.

### F2 — `data-col` indexes the *visible* columns; `getColumns()` returns all of them

`ColumnsModel` sets `this.model.data.columns = all.filter((c) => !c.hidden)`
(`av-grid/src/model/ColumnsModel.ts:100`), and `data-col` is written from the index into *that* array
(`DataCell.ts:184`), while `grid.getColumns()` returns `options.columns` — the full list
(`AVGrid.ts:409-411`). So `getColumns()[Number(cell.dataset.col)]` is correct only while no column is
hidden, and off by one per hidden column otherwise: every column after the hidden one would tooltip
its neighbour's value. Invisible in any test where nothing is hidden.

**Resolve the column by `data-column-key`, never by `data-col`.** The key is the column's identity
everywhere else in the API. The row side has no such trap: `data-row` matches `getVisibleRows()`
exactly, and `getRows()` is the wrong array the moment a sort or filter is on.

The asymmetry is undocumented — `av-grid/docs/api.md`'s DOM contract explains `data-row` carefully and
says nothing about `data-col`. One sentence goes upstream with the release (Step 4).

### F3 — `columnDisplayValue` is not what the cell shows

The cell's own `displayText` (`DataCell.ts:275-287`) wraps `columnDisplayValue` in three more rules:
`""` for nullish, a `Date` branch through `formatDisplayValue`, and `String(value)` for everything
else. Skip them and a `Date` column tooltips `Tue Aug 19 2025 14:03:11 GMT+0200 (…)` next to a cell
reading `19/08/2025, 14:03` — a tooltip that disagrees with the cell it points at, which is worse than
none. Both helpers are public and already re-exported by `uikit/DataGrid/index.ts`, so mirroring
`displayText` is six lines and not a fork.

### F4 — `CellFocus.isDragging` is public, looks like the right suppression gate, and latches

`grid.getFocus()?.isDragging` is documented and set on a primary-button press (`FocusModel.ts:659`),
but it is cleared **only** by `onSelectEnd` (`:667-671`), reachable only from `endSelect`, which
early-returns unless `selecting` was armed. `cell.onMouseDown` is sent at `GridInteractions.ts:292` —
*before* the `e.button !== 0` guard — and two paths then return before `this.selecting = true` at
`:328`:

- the boolean-checkbox toggle (`:315-321`), and
- a press on a cell that already has an open editor (`:326`).

Either leaves `isDragging === true` with no path to clear it, and `updateFocus` then *preserves* the
stale flag on every later focus move (`isDragging: Boolean(startDrag || previous?.isDragging)`,
`FocusModel.ts:529`). Ticking one checkbox would suppress every tooltip in the grid until the user
happened to complete an ordinary press-and-release. `onSelectEnd` also deliberately does not notify,
so there is no event to subscribe to — only polling.

The tooltip therefore does **not** use it (D6 infers from `e.buttons`, which self-heals). The latch is
a real library bug independent of this feature; Step 5 fixes it in the same release.

### F5 — the app's tooltip paints *over* av-grid's own popovers, not under them

All four of av-grid's floating surfaces — the filter popover, its menu, the cell dropdown and the
filter-chip editor — go through one `Popover` class that appends to `document.body` with
`class="avg-popover"` and `position: fixed; z-index: 1000`
(`av-grid/src/styles/av-grid.css.ts:560-561`). The app's tooltip is `position: fixed; z-index: 1100`
(`attach-tooltip.ts:152-153`) inside `#persephone-overlay-layer`, which is **deliberately unstyled**
and therefore creates no stacking context. Both resolve in the same root stacking context, so 1100
wins. Concrete failure: hover the header funnel long enough to show its tooltip, then click it — the
popover opens *under* the tooltip pointing at the funnel.

`overlayRegistry` has never heard of these roots, so the existing suppression cannot help. But they
carry a stable public class, so the host can register them itself — one `MutationObserver`, after
which both halves of the existing machinery (the show-time check *and* the close-an-open-tooltip
subscription) work unmodified. No library change needed.

### F6 — the app's own grid context menu is already covered. Verified, not assumed

`showGridContextMenu` → `showAppPopupMenu` → `AppPopupMenu`'s `setMenuRef`, which calls
`overlayRegistry.register(el)` on the *floated* root (`ui/dialogs/poppers/showPopupMenu.tsx:141-147`,
passed as `ref` at `:169`, forwarded through `Menu` → `MenuView` into the popover props). So the app
menu suppresses tooltips today and needs nothing. `showAppPopupMenu` is `async`, so registration lands
a microtask or two after the right-click — which the `pointerdown` close in D6 covers anyway.

### F7 — the wrong-value failure is real, and the fix is to stop using the element as the identity

`CellPool.release` explicitly does not reset an element — "it arrives at its next occupant with the
same children, classes, attributes and event listeners it had before"
(`av-grid/src/render/CellPool.ts:16-19`) — and `renderDataCell` rewrites `data-row` / `data-col` /
content on that same element (`DataCell.ts:182-185`). So: hover a clipped cell, the tooltip opens
showing row 5, turn the wheel, the element is evicted, pooled, re-acquired for row 25 and re-appended
— quite possibly right back under the stationary pointer. Nothing fired a pointer event, `autoUpdate`
keeps re-anchoring to that element, and the captured content still says row 5. The tooltip is now
visually attached to a cell and showing **a different row's text**.

The variant with no re-acquire is milder and also real: the tooltip stays anchored to a detached node,
`computePosition` reads a zero rect, and it parks at the viewport origin.

Two rules make this unrepresentable rather than merely unlikely: **hover identity is
`(data-row, data-column-key)`, never the element** (D8), and **any scroll closes the tooltip** (D7).

### F8 — one attachment on the grid root, not one per cell, and two agents got there independently

Per-cell attachment fails on four counts, not one. It needs an imperative `show()` because the
`mouseenter` has already fired or never fired at all; it allocates a registry id, five listeners and
two global subscriptions **per cell crossing**; the attachment is pinned to a pooled element that
becomes a different row (F7); and dispose-and-reattach destroys the open tooltip, which makes D9's
"keep it open while scanning a column" impossible to express. The proxy-element alternative dead-ends
immediately: to stay out of the grid's own `elementFromPoint` hit-testing it must be
`pointer-events: none`, and then it never receives `mouseenter` either — so it needs the same
imperative `show()` while additionally putting a node inside DOM the library declares non-public.

### F9 — the `DataGrid` story still teaches the rule US-1021 struck, in two places

US-1021 F8 established that av-grid's `render` content must **not** be positioned, corrected the epic,
and fixed the doc-comment on `renderRatioBar`. It missed the other two occurrences in the same file,
and one of them is *visible instruction to the person running the story*:

- `uikit/DataGrid/DataGrid.story.tsx:26-29`, the header bullet: "The engine writes `top`/`left` and
  nothing writes `position`, so a flow-laid-out cell looks right at row 1 and leaves an empty band
  below."
- `:214-217`, the on-screen `<Text>` in the element-renderer panel: "Judge the Ratio column here, not
  at row 1 — a missing `position: absolute` is invisible on the first row."

Both are fixed here as a drive-by (Step 10), because this task adds a panel to that same story and the
next consumer task would otherwise read the wrong rule off the screen.

## Decisions

### D1 — the ellipsis is fixed upstream first, as av-grid 2.2.3, using the library's own pattern

C4-10, third invocation. The fix is a persistent inner wrapper on the text shapes only:

```css
.avg-grid .avg-data-cell > .avg-cell-text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
```

`flex: 0 1 auto` is already the default and is what lets it shrink; `min-width: 0` is what lets it
shrink below its content width. This is **the same stylesheet's own established pattern** — the header
title (`av-grid.css.ts:81-85`) and the select editor's value (`:413-419`) are both exactly this shape
— so the fix is not a new idea in the file.

Rejected alternatives, each on measurement rather than taste:

- **`display: block` on the cell.** Moves things: the text baseline shifts 0.5 px and `.avg-bool-box`
  jumps 3 px up (`T=1.00` vs `T=4.00`) — the descender problem the file already documents at
  `av-grid.css.ts:323-328`. It also kills `justify-content`, so both alignment classes must be
  rewritten as `text-align`, which then does not align a host `render()` element the way flex did.
- **`display: flow-root`.** Every problem `block` has, plus `justify-content` stops working outright:
  a centred bool box measured `L=5.00` instead of `L=20.00`.
- **Reaching the anonymous flex item.** Not possible (F1).

The layout-identity contract the wrapper has to honour is the one written at `av-grid.css.ts:193-198`
— a marked cell must lay out identically to the unmarked cell beside it. Measured, wrapped vs bare,
in every alignment and at both text lengths: **zero pixels of difference on either axis**, because the
cell centres with `align-items: center` rather than on a baseline. The marked and unmarked cells
measured identical to each other too (`L=5.00 T=3.50` both).

Shapes 3 (bool) and 4 (host markup) never get a wrapper, so `.avg-bool-box` centring and a host
`<svg>` or button row keep their current geometry byte for byte.

**Version: 2.2.3**, released from av-grid's own repository per its `docs/releasing.md` before the
Persephone half starts, so no Persephone step blocks on a library release.

### D2 — one tooltip attachment, on the grid root, with the cell as a floating-ui virtual anchor

`DataGridView` owns exactly one `attachTooltip(this.root, …)` for its whole lifetime. The grid root is
a real, stable, non-pooled element whose `mouseenter` / `mouseleave` *are* trustworthy — it is the
element av-grid itself binds `pointerleave` to. Content and **anchor** are swapped per hovered cell.

The anchor is where the cell comes back in: `@floating-ui/dom` accepts a `VirtualElement`
(`{ getBoundingClientRect(), contextElement }`) anywhere it accepts an `Element`, so the tooltip is
positioned against the cell's box while the trigger — and therefore the listeners, the
`overlayRegistry` containment test and `tooltipRegistry`'s innermost-wins resolution — stays the root.
Keeping `contextElement` at the root also means `autoUpdate`'s observed ancestor set never changes as
hover moves, so there is no observer churn per cell.

Root-as-trigger is also *better* for nesting: if a cell renderer ever carries its own tooltip, the
root-anchored grid tooltip correctly loses to it, whereas a per-cell attachment would race it.

### D3 — `attach-tooltip.ts` gains `anchor` and `show()` / `hide()`, both additive

Two agents converged on this independently, with the same split: **events and identity from the
trigger, geometry from the anchor.**

```ts
export interface TooltipOptions {
    // …existing
    /** Position against this instead of the trigger. Defaults to the trigger. */
    anchor?: ReferenceElement;
}

export interface TooltipAttachment {
    update(options: TooltipOptions): void;
    /** The existing show path — delay, fire-time suppression re-check, registry claim. */
    show(): void;
    hide(): void;
    dispose(): void;
}
```

`anchor` is read in exactly two places, `computePosition` and `autoUpdate`; `isSuppressed(trigger)`,
`tooltipRegistry.open(id, trigger, …)` and the `focusout` containment check all keep using `trigger`.
`show()` and `hide()` forward to the **existing** internal `show()` / `scheduleHide()` rather than
introducing a second path, so the 800 ms delay, the re-check at fire time and the singleton claim are
shared rather than reimplemented.

`show()` is defined as "cancel any pending hide, then run the existing show path". Today's internal
`show()` returns early when already open *without* clearing a pending hide timer, so a
`hide()`-then-`show()` inside the 100 ms `delayHide` would still close — the floating root already
works around this for its own re-entry (`root.addEventListener("mouseenter", clearTimers)`). Fixing it
at the public entry point is what makes D9's "move an open tooltip" work at all.

Both additions are optional and default to today's behaviour, so all six existing call sites
(`TruncatedTextView`, `ButtonView`, `IconButtonView`, `ListItemView`, `TreeItemView`, and the React
`Tooltip.tsx`) are unaffected — each passes `this.root` and neither new member.

**Rejected: a `delegate` mode in `attachTooltip`.** It would move clipping detection, `data-row`
reading, the pointermove-not-mousemove rule and the scroll behaviour into the generic tooltip module.
All of that is grid knowledge and belongs in `DataGridView`.

### D4 — the tooltip candidate is the cell's `.avg-cell-text` child; the text comes from the column

Two gates, both cheap, and together precise:

1. **The element.** A cell is a candidate iff it has an `.avg-cell-text` child — which, after D1, is
   exactly shapes 1 and 2. Clipped-ness is then `inner.scrollWidth > inner.clientWidth`, measured on
   a **block container**, which is immune to the `justify-content` problem that makes the same
   predicate useless on the cell itself (F1, and the note in D5). Bool cells, cells hosting an open
   editor, and host `render` content have no wrapper and are excluded structurally rather than by a
   list of exceptions.
2. **The text.** `columnDisplayValue(column, row)`, normalised exactly as `displayText` does (F3).
   Empty ⇒ no tooltip, which is the second gate and the one that catches a graphical column that
   somehow reached step 1.

**Not `textContent`.** It is tempting and nearly right — the `avg-search-text` wrapper exists
precisely so a marked cell's text stays one inline box, so the flex-whitespace hazard does not bite —
but it makes the tooltip's content depend on markup a host changes for visual reasons, and it is wrong
the moment a `render` column composes anything: `renderSubject` would yield the ref-badge names glued
to the subject (`mainfix: crash` for a commit on `main`).

**A `render` column that wants hover-to-read opts in by emitting `<span class="avg-cell-text">`.**
That is not a workaround — class names are public surface, the class is the library's own text
wrapper, and the column gets the ellipsis with it. The git-tree's two text renderers do exactly this
in Step 9, and their hand-rolled overflow CSS is deleted in favour of it.

### D5 — the row from `data-row` + `getVisibleRows()`, the column from `data-column-key`

Per F2. Written once as a private `resolveCell(el)` returning
`{ el, inner, row, columnKey, text } | undefined`.

*Note for the record:* before D1 was chosen, the correct clip predicate was a reused `Range` over the
cell's contents compared against the content-box width, because `scrollWidth > clientWidth` on the
cell is **undetectable** for centred and right-aligned cells — the overflow moves to the start side
and is not part of the scrollable overflow region (measured: left `scrollWidth=210`, right
`scrollWidth=118 == clientWidth`). Since `DataCell.alignClass` right-aligns every number, that
predicate would have silently never fired for numeric columns. D1 makes the Range unnecessary by
putting a block container in the cell — but the reasoning is recorded because the naive predicate is
what anyone would reach for first, and `TruncatedTextView:76-78` uses a version of it
(`scrollWidth > offsetWidth`, which also double-counts the borders).

### D6 — suppression: four gaps, three closed by the shim and one by a MutationObserver

| Gap | Signal |
|---|---|
| Range-selection drag | `e.buttons !== 0` on the driving `pointermove` ⇒ never arm; capture-phase `pointerdown` on the root ⇒ close now |
| Column-resize drag | the same two listeners, no extra code — capture phase is what gets in before the grip's `stopPropagation()` |
| Open cell editor | `grid.isEditing()` (public, two integer comparisons) as a show-time gate, plus `el.closest(".avg-editing")` for the hovered cell |
| av-grid's own popovers | one `MutationObserver` on `document.body`: register/unregister `.avg-popover` roots with `overlayRegistry` (F5) |

`e.buttons` rather than `CellFocus.isDragging` for the reason in F4, and it fails *safe*: a button
released outside the window reads `buttons === 0` on the next move inside, so it self-heals, and no
tooltip can arm without a move. A drag begun outside the grid that wanders in is also suppressed,
which is correct.

The MutationObserver is installed **once for the module**, not per grid instance — it is correctly
blunt, and catching another grid's popover is the right behaviour.

### D7 — any scroll closes the tooltip; it is not re-resolved

The alternative — mirror `refreshHoverFromPoint`, re-resolving from the last pointer position on a
post-paint rAF — was considered and rejected. The pointer has not moved, so the user has not asked
about the cell now under it; the next `pointermove` re-arms with correct content; and closing avoids
duplicating the library's rAF-plus-`elementFromPoint` hit test in the host. The cost is that a
trackpad micro-scroll dismisses a tooltip mid-read, which is honest: the text under the pointer moved.

### D8 — hover identity is `(data-row, data-column-key)`, never the element

The single rule that makes F7's wrong-value case unrepresentable. The view keeps one field —
`{ el, row, columnKey, text }` or none — and compares on the pair, not on element identity, because
the element is pooled and outlives its occupant. The anchor closure additionally re-validates
`el.getAttribute("data-row") === String(row)` before returning a rect, so a stale anchor yields
nothing rather than the wrong box.

### D9 — cell-to-cell keeps the tooltip open and moves it; the delay is paid once per grid entry

Re-running 800 ms per cell means scanning ten rows of clipped paths costs eight seconds of stillness,
and at any real reading pace produces zero tooltips. The delay exists to suppress tooltips during
*transit*, and once one is open the pointer is demonstrably not in transit. It is also the cheap
branch: `update()` on an open tooltip swaps content through `fillSlot` and repositions with no timer
involvement, nothing torn down and the registry slot retained.

Three branches, on every resolve:

- **target unchanged** (by D8's pair) ⇒ nothing. The common case.
- **new clipped target** ⇒ `update({ content, anchor })` then `show()`.
- **no target** ⇒ `hide()`, keeping the content. `scheduleHide`'s 100 ms grace means crossing one short
  cell between two long ones reads as a single tooltip that moves. **Not** `update({ content: null })`,
  which closes immediately and makes every short cell a visible flicker.

### D10 — the tooltip text is capped at 2,000 characters, in the shim

A JSON/CSV cell can hold 50 KB. A tooltip is a peek, not a viewer: a 50 KB string is a layout event
for floating-ui, takes seconds to scan, covers the grid, and competes with the affordances the grid
already has for the full value (open the editor, copy the cell, open it as a page). Slice at 2,000 and
append a marker naming what was dropped (`… +48,231 more characters`), paired with content CSS —
`max-width: 480px`, wrapping, `max-height: 40vh` — since 2,000 characters on one line is still a
viewport-wide ribbon.

The cap belongs in `DataGridView`: `attachTooltip` is generic and other callers legitimately pass long
rich content, and av-grid has no opinion about how much text a human wants to hover-read.

### D11 — the `isDragging` latch is fixed in the same av-grid release

F4 is a real bug in a public field, found while planning this task, and the tooltip deliberately does
not depend on it. Fixing it anyway costs two lines and a test. Leaving a known latched-state bug in a
public API after finding it is the "invisible contract" case US-1021 named — the next consumer to
reach for `isDragging` would find it plausible and broken. Separable if scope needs cutting: say so
rather than silently dropping it, and file it in `av-grid/tasks/`.

### D12 — no `onCellHover` upstream, and no `getColumn(key)`

Both were proposed by agents as genuine niceties, and both are declined for this release. av-grid does
already compute the hovered cell and does correct it on scroll and during a drag, so an
`onCellHover(cell)` option would let the host drop its own `pointermove` — but the host's listener is
three lines, D7 removes the need for the scroll re-resolve that is the expensive half, and adding a
public callback that fires per hover move is permanent API surface bought for an efficiency the app
cannot measure. `getColumn(key)` is a one-line `.find()` at the call site. Recorded so neither is
re-opened later as an oversight.

## Implementation plan

Steps 1-5 are in `C:\projects\av-grid` and ship as **2.2.3** before any Persephone step starts.
Steps 6-11 are in Persephone.

### Step 1 — av-grid: the text wrapper (`src/view/DataCell.ts`)

In the plain-text branch (currently `DataCell.ts:250-267`), write into a persistent wrapper instead of
the cell. `setMode` already returns whether it cleared the element, which is exactly the signal for
"the wrapper is gone and must be recreated":

```ts
const TEXT_CLASS = "avg-cell-text";

/** The text shapes write through a wrapper, because `text-overflow` cannot reach a flex item. */
function setCellText(el: HTMLElement, text: string, cleared: boolean): void {
    let inner = cleared ? null : (el.firstElementChild as HTMLElement | null);
    if (!inner || inner.className !== TEXT_CLASS) {
        el.textContent = "";
        inner = document.createElement("span");
        inner.className = TEXT_CLASS;
        el.appendChild(inner);
    }
    setText(inner, text);
}
```

called as `setCellText(el, text, setMode(el, "text"))` from both plain-text sites — the `render`
-returns-nullish arm at `:212-214` as well as the default branch — so `"text"` mode always means
"there is a wrapper", with no third state for the next reader to discover.

Steady-state cost is unchanged: the same single `nodeValue` compare-and-write `setText` does today,
one level deeper. A pooled element pays one `createElement` per *content-shape change*, not per frame
— roughly 250 over a grid's life, against 250 per repaint if it were done naively. `setText`'s
"remove leftover siblings" loop now runs inside the wrapper, where it is still correct.

### Step 2 — av-grid: the CSS rule (`src/styles/av-grid.css.ts`)

Add the rule from D1. Rewrite the comment at `:193-198`, which currently argues *for* having no rule
on `.avg-search-text` — it is still right that appearance must not diverge, and now wrong that layout
requires no declaration. State both: the wrapper is what makes `text-overflow` reachable at all, and
it is applied to *both* text shapes precisely so a marked and an unmarked cell still lay out
identically.

### Step 3 — av-grid: the match shape uses the same class (`src/highlight.ts`)

`OPEN_TEXT` at `:23` becomes `'<span class="avg-cell-text">'`, and the one expectation in
`src/highlight.test.ts:12` follows. Keeping two class names for one wrapper would mean two CSS rules
and a reader wondering what the difference is; there is none.

The alternative — keep the name `avg-search-text` and style that for both shapes — works identically
and touches no TS string, but names an unmarked cell's wrapper after search. Rejected on legibility.
Grep first: nothing in Persephone selects on `avg-search-text`, but say so in the release notes.

### Step 4 — av-grid: two documentation lines (`docs/api.md`)

- Add `avg-cell-text` to the DOM-contract class list: the wrapper around a text cell's content,
  present for the plain and matched shapes, absent for booleans and host `render` content — and note
  that a `render` column may emit it to get the ellipsis.
- Add the `data-col` sentence from F2: it indexes the **visible** columns, so a host mapping a cell
  back to a column should use `data-column-key`, because `getColumns()` includes hidden ones.

### Step 5 — av-grid: the `isDragging` latch (`src/view/GridInteractions.ts`), per D11

The narrow fix is to send `onSelectEnd` on the two early-return paths (`:315-321` and `:326`). The
broader one is to stop the flag being sticky in `FocusModel.updateFocus:529`. Prefer the narrow one:
the sticky read is deliberate for a real drag (a `drag` update must not clear it), so the bug is the
missing end, not the persistence. One test per path.

### Step 6 — `uikit/Tooltip/attach-tooltip.ts`: `anchor`, `show()`, `hide()`

Per D3. `import type { ReferenceElement } from "@floating-ui/dom"`. Three edits inside the closure
(`computePosition` at `:114`, `autoUpdate` at `:165`, and an anchor-identity branch in `update()` that
repositions and restarts `autoUpdate`), plus the two forwarding methods on the returned object.
Nothing else moves.

### Step 7 — `uikit/DataGrid/cell-tooltip.ts` (new): the delegated helper

One class, `CellTooltip`, constructed with the grid root and a `() => DataGridInstance | undefined`
getter, owning:

- `attachTooltip(root, { content: null })`;
- `pointermove` (**not** `mousemove` — `GridInteractions.ts:729-738`) and `pointerleave` on the root;
- capture-phase `pointerdown` on the root ⇒ `hide()`;
- `scroll` on the root ⇒ `hide()` (D7);
- `resolveCell(el)` per D5, the `.avg-cell-text` + `scrollWidth` gate per D4, the cap per D10;
- the three-branch dispatcher per D9, keyed on D8's pair;
- the anchor factory — `{ getBoundingClientRect, contextElement: root }`, re-validating `data-row`
  before returning the cell's rect;
- `dispose()`.

Plus a module-level `ensureAvgPopoverObserver()` (D6), installed on first use and never torn down.

### Step 8 — `uikit/DataGrid/DataGridView.ts` and `DataGrid.css`

Construct `CellTooltip` in `onMount` and `own()` its dispose **before** the grid-destroy disposer, so
no queued work can run against a half-destroyed grid (`VanillaView.dispose` runs disposers in
registration order). Add the tooltip content CSS from D10 to `DataGrid.css`, scoped by `data-name`.

One prop question to settle while implementing rather than in advance: whether a consumer can turn the
tooltip off. Default on, and add a prop only if a consumer needs it — `DataGridProps` is deliberately
av-grid's own option names plus `onGrid`, so a Persephone-only prop is a real cost.

### Step 9 — the git-tree's two text renderers adopt the wrapper

`components/git-tree/GitTree.tsx`: `renderSubject`'s inner span becomes
`class="git-subject-text avg-cell-text"`, and `renderHash`'s span gains the class. Then delete the
three overflow declarations from `.git-subject-text` in `GitTree.css` — they duplicate the library
rule, which is US-1021's own pattern (delete hand-painted chrome rather than port it). The graph and
L/R columns are untouched and correctly get nothing.

### Step 10 — the story: a panel, and F9's two corrections

Add an **overflow-tooltip** panel to `uikit/DataGrid/DataGrid.story.tsx`: deliberately narrow columns,
a long-value row, a right-aligned numeric column with an over-long number (F1's second bug), one
`render` column emitting `avg-cell-text` and one emitting an `<svg>`, and a 50 KB cell for the cap.
Fix the two stale absolute-positioning claims at `:26-29` and `:214-217` per F9.

### Step 11 — verification

`npm run lint`, `npm run typecheck`, `npm run build-prod` in Persephone; `npm test` and `npm run
build` in av-grid. Then the acceptance list below, which needs the running app.

## Concerns / open questions

1. **This task changes what every existing grid cell looks like.** Steps 1-3 put an element inside
   every text cell in the app and turn a hard clip into an ellipsis everywhere. That is the fix, and it
   is still the largest visual diff in C4 so far. The layout-identity claim is measured (D1) but
   measured *in a probe*, not in Persephone — so the first acceptance check is a look at a real grid,
   not a look at the tooltip.
2. **`docs/releasing.md` requires a benchmark row for any render-path change, at change time**, and
   Step 1 is squarely in the render path. US-1021 could only supply the deterministic counter because
   the timing gate needs a browser; the same limit applies here. The honest row is a per-repaint
   childList mutation count for a text column before and after, plus an explicit note that the board
   timing gate was not re-run.
3. **The `MutationObserver` on `document.body` is process-wide and never disposed** (D6). It is one
   observer watching one childList for a class match, which is cheap, but it is a permanent global
   installed by a uikit component. The alternative is an upstream popover-toggle hook, which is the
   better design and a bigger ask. Flagged rather than decided.
4. **The 800 ms delay is inherited, not chosen.** `TruncatedText` used the default and the React grid
   therefore did too, so this is parity. A grid is a denser hover target than a button, and 800 ms may
   read as sluggish when scanning; D9 mitigates it by paying the delay once per grid entry. Worth an
   opinion after using it.
5. **No user documentation covers grid cell tooltips today** — the regression was never documented, so
   nothing needs correcting. If the feature deserves a line in `/docs`, it is a `/userdoc` item at
   epic close, not here.

## Acceptance criteria

**av-grid 2.2.3**

- [ ] A narrowed text column shows a real `…` at the right edge, not a half-drawn glyph.
- [ ] A right-aligned **numeric** column with an over-long value truncates at the *right* with an
      ellipsis instead of sliding its leading digits out of the cell (F1's second bug).
- [ ] Typing a search term that matches a truncated value keeps the ellipsis, and the text in the
      marked cell sits at exactly the same x/y as the unmarked cell in the column beside it — no 1 px
      shuffle when the search box is typed into.
- [ ] A centred column with short values stays centred.
- [ ] A boolean column and a custom `render` column (the branch-graph `<svg>`) are positioned exactly
      as before.
- [ ] `npm test` green; the version constants synced by `npm version patch`; the benchmark row
      appended with its stated limits.

**Persephone**

- [ ] Hovering a clipped cell in the JSON/CSV grid editor shows the full value after the delay;
      hovering an unclipped cell shows nothing.
- [ ] A `Date` column's tooltip reads exactly what the cell reads (F3).
- [ ] A grid with a **hidden column** tooltips the right column's value (F2).
- [ ] Moving down a column of clipped values moves one tooltip without re-paying the delay, and
      crossing a short cell between two long ones does not flicker it (D9).
- [ ] No tooltip during a range-selection drag, during a column resize, or while a cell editor is open
      (D6).
- [ ] No tooltip over av-grid's filter popover or cell dropdown (F5), or over the app's own grid
      context menu (F6, expected to pass already).
- [ ] **Scroll with the pointer held still over a clipped cell**: the tooltip closes and does not
      reappear showing another row's text (F7 — the failure this design exists to make impossible).
- [ ] A 50 KB cell shows a capped, wrapped tooltip with the "+N more characters" marker (D10).
- [ ] Git tree: hovering a truncated commit subject shows the full subject; the graph column and the
      L/R picker column show nothing (D4, Step 9).
- [ ] The six existing `attachTooltip` consumers are unchanged — spot-check a `Button` title, a
      `TruncatedText` in `FileGrid`, and a `Tree` item.
- [ ] `npm run lint`, `npm run typecheck`, `npm run build-prod` clean.

## Files changed

### `C:\projects\av-grid` — released as 2.2.3

| File | Change |
|---|---|
| `src/view/DataCell.ts` | the text shapes write through a persistent `.avg-cell-text` wrapper; one `setCellText` helper |
| `src/styles/av-grid.css.ts` | the `.avg-cell-text` rule; the `:193-198` comment rewritten |
| `src/highlight.ts` | `OPEN_TEXT` uses `avg-cell-text` |
| `src/highlight.test.ts` | the matching expectation |
| `src/view/GridInteractions.ts` | the `isDragging` latch (D11) |
| `src/view/DataCell.test.ts` | wrapper present / reused / rebuilt on shape change; the nullish-`render` arm |
| `docs/api.md` | `avg-cell-text` in the DOM contract; the `data-col` sentence (F2) |
| `tasks/benchmark-results.md` | one row, with its limits stated (concern 2) |
| `package.json` + the two version constants | `npm version patch` → 2.2.3 |

### `C:\projects\persephone`

| File | Change |
|---|---|
| `src/renderer/uikit/Tooltip/attach-tooltip.ts` | `anchor` option; `show()` / `hide()` (D3) |
| `src/renderer/uikit/DataGrid/cell-tooltip.ts` | **new** — the delegated helper and the popover observer |
| `src/renderer/uikit/DataGrid/DataGridView.ts` | construct, own and dispose it |
| `src/renderer/uikit/DataGrid/DataGrid.css` | tooltip content sizing (D10) |
| `src/renderer/uikit/DataGrid/DataGrid.story.tsx` | the overflow panel; F9's two corrections |
| `src/renderer/components/git-tree/GitTree.tsx` | two renderers emit `avg-cell-text` |
| `src/renderer/components/git-tree/GitTree.css` | three duplicated declarations deleted |
| `package.json` / `package-lock.json` | the pin → `2.2.3` (exact, per C4-1) |
| `doc/epics/EPIC-057.md`, `doc/active-work.md` | status, the C4-10 note, F1's correction of the epic |

## Files that need NO changes

- `src/renderer/uikit/TruncatedText/**` — still the right component for non-grid text, still used by
  `FileGrid`'s title formatter. Its `scrollWidth > offsetWidth` predicate double-counts the borders,
  a pre-existing 1-2 px inaccuracy on a `span` that has none — harmless there, and explicitly not the
  predicate to copy.
- `src/renderer/uikit/shared/tooltipRegistry.ts`, `shared/overlayRegistry.ts` — the observer feeds the
  existing registry; neither needs a new concept.
- `src/renderer/ui/dialogs/poppers/**` — F6 verified it already registers.
- `src/renderer/editors/grid/**` — the shim covers it; no consumer edit.
- `src/renderer/components/git-tree/branch-tree-cell.ts`, `side-select-cell.ts` — correctly get no
  tooltip and need no opt-out (D4).
- `src/renderer/uikit/AVGrid/**` — deleted by US-1023.

## What implementation changed about the plan

Nine things. Two are defects the plan would have shipped.

**1. `renderHash` had to be restructured, not just annotated — and the plan's version would have
left one cell broken.** The library's rule selects a **direct child** of the cell
(`.avg-data-cell > .avg-cell-text`), and `renderHash` nested its text span inside a colour wrapper
on the HEAD commit. Adding the class where the plan said ("`renderHash`'s span gains the class")
would have made the HEAD commit's hash the one cell in the column that neither ellipsized nor
tooltipped — a single-row defect, in the row a user looks at most. The colour moved onto the text
span itself, which also deletes an element:

```ts
const style = isHead ? ` style="color:${REF_COLOR.head}"` : "";
return `<span class="avg-cell-text"${style}>${cell.highlight(row.shortHash)}</span>`;
```

**2. The tooltip's content is an element with its own `data-type`, not a string.** The plan said the
content CSS would be "scoped by `data-name`", which is not allowed: `uikit/CLAUDE.md` reserves
`data-name` as an addressing handle and states it is never a styling hook. The tooltip's floating
root is portalled into the overlay layer, so no selector scoped from `[data-type="data-grid"]` can
reach it either — and that is exactly the case the same guide gives a documented answer for ("an
element inside a portalled branch needs a root-level `data-type` hook"). So `cell-tooltip` builds a
`<div data-type="grid-cell-tooltip">` and `DataGrid.css` selects it unqualified.

**3. A hole the plan did not have: `attachTooltip` also opens on `focusin`, and the grid root takes
focus on every click.** D9 said a "no target" transition should `hide()` and keep the content, so
that crossing one short cell between two long ones reads as one tooltip moving rather than a
flicker. Kept content plus a `focusin` trigger is a way back into F7's failure: click, scroll, tab
back into the grid, and the tooltip re-opens showing a value the pointer has nothing to do with,
anchored to a cell that may since have been recycled. The fix distinguishes the two situations,
which D9 had conflated — *the gesture is still going* versus *the gesture is over*:

| Transition | Call | Why |
|---|---|---|
| onto a cell that fits, still inside the grid | `hide()` — content kept | the same gesture; the 100 ms grace is what prevents the flicker |
| pointer leaves the grid, a button goes down, the grid scrolls | `clear()` — content dropped | the gesture is over, and stale content is re-showable by `focusin` |

**4. `.git-special-subject` adopts the wrapper too.** Not in the plan, which named only `subject`
and `shortHash`. The synthetic Unstaged/Staged rows are text like any other and had no truncation
at all before.

**5. Step 3 took its preferred option, and the class is `avg-cell-text` everywhere.** Grepped first:
nothing in Persephone, av-grid's boards or the docs selects `avg-search-text` outside the library's
own test and one docs sentence, both updated.

**6. `isDragging` (Step 5) is fixed through a named helper, gated on the public getter**, rather
than sending the end event unconditionally on the two paths:

```ts
private endDragThatNeverStarted(): void {
    if (this.model.models.focus.isDragging) this.model.events.cell.onSelectEnd.send();
}
```

The guard is not decoration: the event is also reachable on a non-primary press, where no drag was
announced, and sending it then would be a lie in the event log even though `onSelectEnd` currently
early-returns on the same condition.

**7. The benchmark had to be driven over CDP.** `--virtual-time-budget` renders the first frame and
then stops advancing rAF and timers, so a page that awaits a frame never resumes — the harness sat
at "running" while the screenshot showed a fully painted 100k-row grid. `--remote-debugging-port`
plus `Runtime.evaluate({ awaitPromise: true })` runs it with real timers. Worth recording because
the next render-path change will want the same harness, and the failure looks like a hung page
rather than a missing feature.

**8. The story's date column is a raw `Date`, not `dataType: "date"`.** There is no such `DataType`
(it is `"string" | "number" | "boolean"`; `"date"` is a `DisplayFormat`). Leaving the column plain
turned out to be the better fixture anyway: it is the only shape that exercises F3's `Date` branch,
because a `displayFormat` column would have been formatted by `columnDisplayValue` already.

**9. A `.ts` file holding CSS in a template literal cannot have backticks in its comments.**
`av-grid.css.ts` is a template literal, so the first draft of the D1 comment — which quoted
`` `text-overflow` `` and `` `min-width: 0` `` the way every other comment in this project does —
terminated the string and produced nine parse errors in unrelated places. Prose without backticks.

### What was verified, and how

The two claims this task rests on were both checked against the built bundle in real Chromium
rather than in a probe, because F1 contradicted the epic and D1's layout-identity claim is what
makes the fix safe.

**The ellipsis, by screenshot, 2.2.2 against 2.2.3**, on the same page: three rows, a narrow text
column, a right-aligned numeric column, a boolean and an element-returning `render` column.

| | 2.2.2 | 2.2.3 |
|---|---|---|
| `Alan Dijkstra Wonderful Long Name` in 110 px | `Alan Dijkstra Wond` — cut mid-glyph | `Alan Dijkstra W…` |
| `123456789012` in a 70 px numeric column | **`456789012`** — leading digits gone | `1234567…` |
| the tick, the bars, right-alignment | — | unchanged |

The second row is the one worth keeping: it was not a truncation the user could see, it was a
different number.

**The cost, by mutation count, over CDP**: 100,000 rows × 3 columns, 75 visible cells, 75 wrappers,
a `MutationObserver` on the grid root counting childList nodes, attributes and characterData.
**Every counter identical between 2.2.2 and 2.2.3** — a full `refresh()` 0/321 twice over, a scroll
to row 99,000 162/0, a `refresh()` there 12/321, switching search on 75/22, a `refresh()` with
search live 12/309. The wrapper is free per frame, which is what `setMode`'s return value buys: a
pooled cell builds its span once per content-shape change.

**The clip probe reads what it should**: on the wrapper, `scrollWidth` 407 against `clientWidth`
110 → clipped. (On 2.2.2 the same cell measured 415/118 — detectable there only because that column
is left-aligned, which is the trap D5 records.)

**The tests discriminate, checked by reverting each fix.** Of the seven new `DataCell` tests, four
fail without the wrapper; both new `FocusModel` latch tests fail without the `onSelectEnd` send.
826 tests pass in total (816 before).

## Verification status

**Green:** av-grid `npx tsc --noEmit`, `npm test` (826), `npm run build`; Persephone `npm run lint`,
`npx tsc --noEmit`, `npm run build-prod`. The CSS layer check holds — 289 `avg-` selectors in the
`DataGrid` chunk, **all** inside `@layer uikit` and none outside; `avg-cell-text` and
`grid-cell-tooltip` both present; `git-subject-text` gone. `GitTree.css`'s 14 `avg-` selectors are
all inside `@layer app`, which is US-1021's design and is why they outrank the library.

**av-grid 2.2.3 is committed, tagged and published** — the release workflow ran green through the
version check, tests, build, npm publish with OIDC provenance and the GitHub release.

**Untested: everything that needs the running app** — the whole Persephone half of the acceptance
list above. The story's new `overflow-tooltip` panel is the cheapest route to most of it; the git
tree, the range-drag and resize suppression, and the filter-popover overlap need the app itself.
