# US-1228 — Answer the `ListBoxView` `rowViews` retention question

**Epic:** [EPIC-078](../../epics/EPIC-078.md) — Post-De-React close-out  
**Status:** Investigation complete; code is correct as written  
**Scope:** Answer the retention question from source. No implementation is part of this document.

## Goal

Determine whether a `ListBoxView` row view leaves `rowViews` when its recycled wrapper leaves the
active render set or pool, and whether `rowViews` therefore grows with scroll distance. The answer
is a lifecycle fact, not a defect assumption.

## Background

`ListBoxView` documents `rowViews` as “Every row view ever created, so disposal can reach the ones
the pool still holds” (`src/renderer/uikit/ListBox/ListBoxView.ts:67-71`). Its teardown disposes
the grid first and then every retained row view (`:99-112`); leaving the real arm does the same
(`:294-303`). `releaseCell()` is intentionally called for a kind change only and deletes the
view from `rowViews` only in that case (`:465-474`).

The question is whether the cell engine has another callback that removes a view when a wrapper is
evicted. Reading the pool and grid lifetime establishes that it does not.

## Investigation and answer

### Wrapper admission and row-view ownership

When the virtual grid asks for a new or dirty cell, `renderInfo._renderCell()` passes the previous
coordinate cell when available and otherwise forwards the pool's `recycle()` function
(`src/renderer/uikit/VirtualGrid/renderInfo.ts:352-415`). `ListBoxView.renderCell()` first uses
`p.previous` or `p.recycle?.()` (`src/renderer/uikit/ListBox/ListBoxView.ts:352-367`). A newly
created wrapper receives one listener installation and a `CellRecord` in a `WeakMap`; the listener
reads the record's current index rather than being reinstalled for each occupant
(`:357-369,441-463`).

For an item or section kind, the view is mounted and added to `rowViews` once
(`src/renderer/uikit/ListBox/ListBoxView.ts:378-397`). A recycled wrapper therefore keeps its
`CellRecord.view`, its slot contents, and its one-time listeners while it is pooled; the next
admission updates the existing view instead of creating a new one (`:394-397`).

### Eviction path

The `CellPool` contract is explicit: `release()` does not reset the element, and the old children,
classes, attributes, and listeners remain (`src/renderer/uikit/VirtualGrid/CellPool.ts:14-20`).
`release()` stores the element in its `elements` array and `retained` set; `acquire()` removes it
from both and returns the same element (`:64-78,90-103`). There is no callback to
`ListBoxView.releaseCell()`.

`VirtualGridView.syncRegion()` detects cells that left the desired render set and invokes its own
private `releaseCell()` (`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:603-619`). That method
hides the element, removes row/column markers, invokes the optional grid-level callback, and
offers the element to `CellPool` (`:641-658`). `ListBoxView` does not pass `onCellReleased` in
`gridProps()` (`src/renderer/uikit/ListBox/ListBoxView.ts:322-337`), and the grid's release path
never reaches the ListBox `CellRecord` cleanup.

The model supplies the render transitions that lead to this path: a visible scroll reads the
container offset and calls `updateRenderInfo()` (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:593-609`),
which computes a new render description and requests a scheduled repaint when it changes
(`:463-477,542-577`). `VirtualGridView` wires the model's repaint callback to its paint scheduler
and performs the first paint after attachment (`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:188-195,307-315`).
None of those model/view transitions has a ListBox-specific row-view disposal hook.

If the pool has capacity, the wrapper remains pooled and its row view must remain in `rowViews` so
the later ListBox teardown can dispose it. If the pool is full, `CellPool.release()` returns false
and `VirtualGridView.releaseCell()` removes the wrapper from its parent and `cellElements`
(`src/renderer/uikit/VirtualGrid/CellPool.ts:90-99`; `src/renderer/uikit/VirtualGrid/VirtualGridView.ts:652-658`).
That overflow path also has no ListBox callback, so the associated row view remains in `rowViews`
until real-arm teardown or ListBox disposal.

### Kind-change and arm-teardown exceptions

There are exactly two source-level removal paths:

1. A wrapper is reused for a different `CellKind`; `ListBoxView.releaseCell()` runs the old slot
   cleanup, deletes the old row view, disposes it, and clears `record.view`
   (`src/renderer/uikit/ListBox/ListBoxView.ts:378-393,465-474`).
2. The list leaves the real arm or is disposed; it disposes and clears the entire `rowViews` set
   (`src/renderer/uikit/ListBox/ListBoxView.ts:242-251,294-303`; `:99-112`).

There is no eviction-time deletion for either pooled or pool-discarded wrappers.

### Answer

**A wrapper leaving the active render set does not take its row view out of `rowViews`.** For normal
scrolling, it is returned to the bounded pool and later reused with the same view, so the set does
not grow once the engine reaches steady-state reuse. It contains the distinct item/section views
created during the current real-arm lifetime, not one view per scroll distance. On an exceptional
pool overflow/discard, the wrapper is gone but its row view still remains in the set until arm
teardown; this follows from the deliberate absence of an eviction callback.

This is **correct as written for the stated pooling contract**: retaining the view is necessary for
pooled wrappers, and the set is the ListBox lifetime registry that guarantees teardown reaches
views hidden in the pool. The comment at `ListBoxView.ts:69-70` already says this; it should be
strengthened to say “current real-arm lifetime” and to distinguish normal pooled reuse from the
bounded overflow discard. No source behavior change is recommended by this question.

## Implementation plan

No implementation is authorized in this investigation. If the recommendation is accepted, the
eventual change is comment-only:

1. Update the `rowViews` comment in `src/renderer/uikit/ListBox/ListBoxView.ts:69-70` to state that
   it retains every row/section view created during the current real arm, including views held by
   pooled wrappers, and that teardown disposes the set after the grid is disposed.
2. Do not add an eviction callback or call `releaseCell()` from `VirtualGridView`: normal eviction
   is reuse, and disposing the view there would force listener/view reconstruction on every recycle.
3. Do not change `CellPool.release()`'s no-reset contract (`src/renderer/uikit/VirtualGrid/CellPool.ts:14-20`)
   or `VirtualGridView.releaseCell()`'s iframe-safe hidden retention (`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:641-658`).
4. Do not add tests or a test harness. The question is settled by the source lifetime trace; a
   manual long-list scroll may be used only to observe `rowViews.size` if desired.

## Concerns

- `rowViews` is not a mirror of `CellPool.retained`. It is intentionally a strong lifetime set;
  `CellPool` uses a strong array for pooled wrappers, while `ListBoxView.cells` is a `WeakMap`
  (`src/renderer/uikit/ListBox/ListBoxView.ts:69-71`; `src/renderer/uikit/VirtualGrid/CellPool.ts:46-50`).
- Pool overflow is a real but bounded edge path: the pool cap is 2,000 by default
  (`src/renderer/uikit/VirtualGrid/CellPool.ts:52-57`). A discarded wrapper's view is still
  retained until teardown because the grid exposes no per-element disposal callback. This is not
  evidence that ordinary scrolling creates one view per row.
- The source answers the question without runtime observation. If product behavior ever suggests
  unexpected growth, the decisive observation is to record `ListBoxView`'s private `rowViews.size`
  and `VirtualGridView.stats.pool` while scrolling a list whose rendered window is much smaller
  than its total row count; no test harness is needed or proposed.

## Acceptance criteria

- [ ] The record states that ordinary pool eviction does not delete from `rowViews`.
- [ ] The record distinguishes steady-state reuse from the pool-full discard path.
- [ ] The record identifies kind change and real-arm teardown as the only source-level removal
  paths.
- [ ] The outcome is recorded as code-correct-as-written, with a comment-only clarification as the
  recommended follow-up.
- [ ] No tests or test harnesses are added.

## Files Changed summary

| File | Status for this investigation | Eventual scope |
|---|---|---|
| `doc/tasks/US-1228-listbox-rowviews-question/README.md` | Added | Question/answer record |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Not changed | Clarify `rowViews` lifetime comment only |
| `src/renderer/uikit/VirtualGrid/CellPool.ts` | Not changed | No change |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | Not changed | No change |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | Not changed | No change |
| `src/renderer/uikit/VirtualGrid/renderInfo.ts` | Not changed | No change |
