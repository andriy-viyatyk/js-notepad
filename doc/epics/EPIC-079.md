# EPIC-079: Retire `uikit/VirtualGrid` in favour of av-grid's `RenderGrid`

## Status

**Status:** Planned
**Created:** 2026-08-30
**Completed:** —

## Overview

Persephone carries two virtualization engines. `src/renderer/uikit/VirtualGrid/` (~2,800 lines)
and av-grid's `src/render/` (~2,300 lines excluding tests) are not merely similar — they are the
same engine, forked. av-grid's `RenderGridModel` says so in its own header: *"Ported from
`RenderGrid/RenderGridModel.ts` with the React lifecycle removed."*

av-grid is already a Persephone dependency (`av-grid: 2.2.4`) and already powers the DataGrid, the
grid editor, git-tree, env-vars and the notebook's grid cells. This epic finishes the job: extend
av-grid with the two capabilities only Persephone's fork has, move the remaining consumers onto
`RenderGrid`, and delete the fork.

## Why now — the measured case

The drift between the two forks is cosmetic:

| File | Persephone | av-grid | Differing lines |
|---|---|---|---|
| `renderInfo.ts` (all the geometry) | 797 | 796 | **13** |
| `rerender-check.ts` (the dirty-set merge) | 387 | 380 | **15** |

The option surfaces are field-for-field identical — `rowCount`/`columnCount` as `number \| (() => number)`,
`rowHeight`/`columnWidth` as `ElementLength`, `renderCell`, `recycle`, all four `sticky*`,
both `overscan*`, `fitToWidth`, `whiteSpaceX/Y`, `onInnerSizeChange`, `onAdjustRenderRange`,
`onResize` — with exactly one Persephone-only addition (`setReuseKey`, see Gap 1).

The cost of the fork is not hypothetical. **US-1232 (2026-08-30) fixed a scroll-position defect that
av-grid has its own version of**: `RenderGrid.ts` carries a `scrollLost` flag whose comment reads
"Hiding the container resets its scrollTop to 0 while the model keeps the real…" — the same premise
Persephone's `VirtualGridModel.onScroll` asserted, and which was **measured false** during US-1232
(a `display: none` element *reports* `scrollTop` as 0 because it has no scroll box; Chromium
restores the real value on show, verified across a synchronous and a 900 ms hide). Every engine
defect currently has to be found and fixed twice, from two different sets of comments, at least one
of which is wrong.

## Goals

- One virtualization engine in Persephone, owned in one repo.
- Extend av-grid with the two capabilities the Persephone fork has and av-grid lacks — as
  first-class library features, not Persephone-shaped bolt-ons.
- Delete `src/renderer/uikit/VirtualGrid/` entirely.
- Carry the US-1232 correction into av-grid (its `scrollLost` handling rests on the disproved
  premise and should be re-measured, not ported).

## The two real gaps

Everything else is a rename. These are the only capabilities that do not already exist in av-grid,
and **both are used by exactly the same two consumers** — `editors/log-view/LogBodyView.ts` and
`editors/notebook/NotebookBodyView.ts`.

### Gap 1 — keyed cell pool (`setReuseKey`)

Persephone's `CellPool` (121 lines) lets a consumer stamp a pooled element with a compatibility key,
so a heterogeneous list does not recycle a cell of one kind into a row of another. av-grid's
`CellPool` (93 lines) is a single untyped bucket, correct only because a data grid's cells are
homogeneous.

Both call sites are one line: `params.setReuseKey?.(cell, kind)`.

### Gap 2 — measured row heights (`VirtualFlexGrid`)

av-grid supports a row-height *function* (`ElementLength = number | ((v: number) => number | Percent)`),
which covers computed heights but not heights **measured from rendered DOM**. `VirtualFlexGridModel`
adds a `ResizeObserver` per rendered row, a 50 ms debounce, min/max clamping, an initial-height hint,
and a stable `rowHeight` identity so the engine's input gate keeps working.

**This is the encouraging half of the epic.** `VirtualFlexGridModel` does not touch engine
internals — it talks to the engine through a two-method seam:

```ts
export interface GridModelCapability {
    update(rerender?: RerenderInfo): void;
    scrollToRow(row: number, rowAlign?: RowAlign): Promise<void>;
}
```

`RenderGridModel` already has both. So the flex layer is **re-hostable, not rewritable** — it should
move to av-grid as a companion module over `RenderGridModel`, keeping its current shape.

## The thing to decide before any code — the publish loop

**av-grid is a published npm dependency pinned at `2.2.4`, not a file link or a workspace.** Every
iteration therefore costs: change av-grid → publish → bump Persephone → verify. That round trip, not
the code, is what makes this an epic rather than an afternoon.

This needs an answer in US-1233 before the rest starts. The obvious candidate is `npm link` (or a
`file:` override) for the development loop with a single real version bump at the end, but it
interacts with `npm run dist` and CI, and that interaction must be checked rather than assumed.

## Migration surface

Consumers of `uikit/VirtualGrid` today (excluding the engine's own folder):

| Area | Files |
|---|---|
| UIKit primitives | `ListBox/ListBoxView.ts`, `ListBox/ListBoxModel.ts`, `Tree/TreeView.ts`, `Tree/TreeModel.ts`, `Tree/types.ts`, `Autocomplete/AutocompleteView.ts`, `index.ts` |
| Components | `components/file-search/FileSearchView.ts`, `components/tree-provider/{TreeProviderViewModel,CategoryViewImpl,CategoryViewModel}.ts` |
| Editors — fixed height | `editors/link-editor/{LinksList,LinksListView,LinksTiles,LinksTilesView,LinkBody,LinkEditor}.ts`, `editors/link-editor/panels/{LinkHostnamesNavigationPanel,LinkTagsSecondaryView}.ts` |
| Editors — measured height | `editors/log-view/LogBodyView.ts`, `editors/notebook/{NotebookBodyView,NoteItemViewModel}.ts` |
| Other | `editors/storybook/storyRegistry.ts`, `uikit/shared/async-ref.ts` |

`ListBox` and `Tree` are the load-bearing ones: `Tree` is the Explorer file tree, and `ListBox`
backs `Select`, `MultiSelect` and `Autocomplete`. They are also the two with the most documented
behaviour in [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) — the
`scrollToRow` vs `scrollToRowAfterPaint` rule, the pooled-element root retention rule, and the
"never run a slot cleanup on eviction" rule all live on this engine and must survive the move.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-1233 | Decide and set up the av-grid development loop (link vs publish, CI and `dist` impact) | Planned |
| US-1234 | Add a keyed cell pool to av-grid (`setReuseKey`) | Planned |
| US-1235 | Move the measured-row-height layer (`VirtualFlexGrid`) into av-grid over `RenderGridModel` | Planned |
| US-1236 | Fix the confirmed US-1232 defect in av-grid, and re-measure `scrollLost` | Planned |
| US-1237 | Migrate the UIKit primitives (`ListBox`, `Tree`, `Autocomplete`) to `RenderGrid` | Planned |
| US-1238 | Migrate the remaining components and editors | Planned |
| US-1239 | Delete `uikit/VirtualGrid/` and update the docs that point at it | Planned |

Sequence matters: US-1233 first (nothing else is pleasant without it), then US-1234/1235/1236 in
av-grid, then the Persephone side. US-1237 before US-1238 because the primitives are the risky part
and the editors mostly consume them.

## av-grid has the US-1232 defect too — confirmed by measurement

**This was verified against a live av-grid instance on 2026-08-30, not assumed.** A 3,000-row
`grid-json` page was scrolled to `scrollTop: 20000` (72,044px of content), and its host subtree was
then detached and re-appended — exactly what Persephone's `fillSlot` was doing before US-1232, and
exactly what any host framework does when it re-renders a slot:

| | before | after re-append |
|---|---|---|
| `scrollTop` | 20000 | **0** |
| viewport left unpainted | 16px | **882px of 882px — the entire viewport** |
| scroll event fired | — | **no** |

It does not self-heal; the grid sat fully blank until scrolled. The symptom is worse than
Persephone's was, because the blank band is the size of the lost offset.

**`scrollLost` cannot catch this**, and that is the important part. It is armed in `onFrameResize`
only when the grid measures 0x0 (`if (!newSize.width && !newSize.height && …)`). A re-append changes
no size at all, so the flag never sets, the restore never runs, and the model goes on painting rows
at an offset the container no longer has.

So US-1236 covers two related but distinct things:

1. **The real defect.** av-grid needs its own answer to a host silently resetting the container's
   scroll. Persephone's fix was to stop the re-append at source (`fillSlot`), which is not available
   to a library that cannot control its host — so the fix here has to be detection or reconciliation
   inside the engine. Note the constraint already documented on `restoreScroll`: a naive
   "DOM disagrees with model, write the model back" reconciliation is explicitly *wrong* and
   produces a list that scrolls half the time, because a scroll event lags the scroll it reports by
   a frame. Whatever is built has to distinguish the two cases, which is precisely what `scrollLost`
   was trying to do and does not do widely enough.

2. **The false premise underneath it.** `scrollLost`'s justifying comment — "`display: none` zeroes
   the container's scrollTop while the model keeps the real offset" — is **wrong**. Measured during
   US-1232: a hidden element merely *reports* `scrollTop` as 0 because it has no scroll box, and
   Chromium hands the real value back on show (verified across both a synchronous hide and a 900 ms
   one). So the hide/show restore that `scrollLost` licenses is redundant in the case it was written
   for, while the case that actually loses the position goes undetected. Re-measure before deciding
   whether the flag narrows, widens, or disappears.

Persephone is already protected on this path by the `fillSlot` fix, so this is not urgent for
Persephone — but it is a live defect for any other av-grid host, and it is the clearest single
argument for the epic: the same bug had to be found twice, and the second copy was found only
because someone went looking.

## Open questions for review

1. **Is `uikit/VirtualGrid` the *only* fork?** `uikit/shared/async-ref.ts` appears in the consumer
   list and av-grid has its own `core/AsyncRef`. Worth checking whether more of `uikit/shared/`
   is duplicated before deciding what "delete the fork" covers.
2. **Does `Percent` mean the same thing in both `ElementLength` types?** They read identically, but
   the epic assumes it and a silent divergence there would surface as subtly wrong geometry rather
   than a type error.
3. **Should av-grid keep the two new features generic or Persephone-shaped?** The keyed pool is
   generic and clearly belongs; the measured-height layer is closer to a Persephone need. It is the
   user's repo either way, but it deserves a deliberate answer rather than drifting into a
   Persephone-only corner of a public package.

## Notes

### 2026-08-30
- Epic raised after the user noticed the duplication while reviewing the US-1232 fix.
- Feasibility answered before the epic was written: yes, and the two engines are the same code —
  13 differing lines in the geometry core, 15 in the dirty-set merge.
- The `display: none` premise correction from US-1232 applies to av-grid too and is tracked as
  US-1236 rather than left as a footnote.
- Then, at the user's request, av-grid was actually tested for the US-1232 defect rather than
  assumed to have it. It has it, and worse — a re-append blanked the entire 882px viewport with no
  scroll event, and `scrollLost` cannot see it. Written up above.
