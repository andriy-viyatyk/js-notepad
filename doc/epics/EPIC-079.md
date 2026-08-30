# EPIC-079: Retire `uikit/VirtualGrid` in favour of av-grid's `RenderGrid`

## Status

**Status:** Completed
**Created:** 2026-08-30
**Started:** 2026-08-30
**Completed:** 2026-08-30

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

## The gaps — six, not two

**The epic was raised believing there were two. Reviewing the US-1237 and US-1238 investigations
on 2026-08-30 found four more, each verified against the source.** They are recorded here in the order they
matter, and the count is the main thing this epic learned about itself: the fork's drift from
av-grid is *not* cosmetic once you look past the option surface. The option **fields** really are
field-for-field identical — that claim survived checking — but the fork carries behaviour around
cell lifecycle and scroll timing that av-grid never received.

### Gap 1 — keyed cell pool (`setReuseKey`) — **done**

Persephone's `CellPool` lets a consumer stamp a pooled element with a compatibility key, so a
heterogeneous list does not recycle a cell of one kind into a row of another. av-grid's was a
single untyped bucket, correct only because a data grid's cells are homogeneous. Both call sites
are one line: `params.setReuseKey?.(cell, kind)`.

Shipped in av-grid as phase 8 task 33 (US-1234). Notably **not** a port: the reference's backward
linear scan measured 2,177 ns per keyed acquire at pool size 2000 against 24.8 ns for a
bucket-per-kind `Map` — 88×, and linear in pool size. It went in as buckets, and a reference bug
was fixed on the way (a cell taken as untagged kept its stale key and returned to the wrong
bucket).

### Gap 2 — measured row heights (`VirtualFlexGrid`)

av-grid supports a row-height *function*, which covers computed heights but not heights **measured
from rendered DOM**. `VirtualFlexGridModel` adds a `ResizeObserver` per rendered row, a 50 ms
debounce, min/max clamping, an initial-height hint, and a stable `rowHeight` identity so the
engine's input gate keeps working.

**The epic originally called this layer "re-hostable, not rewritable" over a two-method seam. That
was too optimistic.** `GridModelCapability` — `update` and `scrollToRow` — is what the layer needs
from the *model*, and `RenderGridModel` does have both. But `VirtualFlexGridView` also consumes
`onCellAttached` and `onCellReleased` (`VirtualFlexGridView.ts:73-81,178-179`), a **cell-lifecycle
seam from the shell** that does not exist anywhere in av-grid. US-1235 has to add that seam too,
and it interacts with Gap 3 — what "released" means changes if eviction stops detaching.

### Gap 3 — the engine detaches and moves its own cells

**This is the US-1232 defect reproduced inside av-grid, on its own cells, with no host involvement
at all** — and it is the discovery that most justifies the epic. `RenderGrid.syncRegion`
(`RenderGrid.ts:353-377`) does two things the fork explicitly forbids, each guarded there by a
comment recording what it cost to learn:

| | av-grid | the fork |
|---|---|---|
| eviction | `parent.removeChild(el)`, always | `display: none`, **left in the document**; detaches only on pool overflow |
| admission | `parent.append(el)`, always | guarded by `if (el.parentElement !== parent)` |

The fork's reasons, verbatim from `VirtualGridView.ts`: detaching "can reset the ancestor scroller
and re-admission would reload the nested document"; and `append` on a node that is already a child
"is a *move* — remove plus re-insert — … moving a subtree that hosts a complex embedded widget
resets the scroll container to the top."

So in av-grid a cell containing a scroller, an iframe, or an embedded widget loses its state on
ordinary scrolling. Folded into US-1236, which now covers both faces of the same root cause: the
host detaching the grid, and the grid detaching its cells.

### Gap 4 — no after-paint scrolling

The fork distinguishes `scrollToRow` from `scrollToRowAfterPaint` and the distinction is load
bearing: `scrollTop` is clamped to the scrollable extent, and the extent is written *inside* the
next paint, so scrolling right after a row-set change silently clamps to the old extent — the list
renders correctly and is simply scrolled to the wrong place, with nothing re-issuing the request.
`setTimeout(0)` is explicitly not enough; it lands after the microtask that recomputes
`renderInfo` but before the animation frame that applies it.

av-grid has **no pending-scroll register at all** — its only related state is `scrollLost`. Both
`ListBox` and `Tree` choose between the two paths deliberately, so this blocks US-1237. Tracked as
US-1240.

### Gap 5 — `setOptions` does not apply shell layout

`RenderGrid.setOptions` (`RenderGrid.ts:230-237`) assigns the options, delegates to
`model.setOptions`, and updates `className`. It never reapplies `height`, `growToHeight`,
`growToWidth`, or overflow. `ListBox` and `Autocomplete` call `setLayout` as their layout changes,
so those fields have to become live. Duplicating av-grid's private DOM style logic inside UIKit is
not an acceptable substitute. Tracked as US-1241.

### Gap 6 — `RerenderInfo` has no `fromRow`

The fork's `RerenderInfo` carries `fromRow?: number` (`types.ts:67-75`), meaning *geometry is
invalid from this row onward*. The measured layer is its only consumer and cannot work without it
(`VirtualFlexGridModel.ts:102`): when a measured row's height changes, every following row's start
offset moves and the total inner height may change, while the rendered DOM of those rows has not.
Repainting the changed row is not the same operation and leaves the list mis-positioned.

av-grid's public `RerenderInfo` has no such field. Confirmed during US-1238's investigation; it is
not a blocker for US-1237, which passes no `fromRow`, so it belongs to US-1235.

## US-1233 — the development loop, decided

**Decision: `npm link`, with no change to `package.json`. Resolved 2026-08-30, before any code.**

The question looked like the expensive part of the epic and turned out not to be, because two
things are true that the epic assumed had to be checked:

**Packaging is not affected at all.** `electron-builder.yml`'s `files:` list is exactly
`package.json` and `.vite/**/*` — `node_modules` is never packaged. Vite bundles av-grid into
`.vite` at build time, so whatever av-grid resolves to during the build is what ships, and a
symlinked dependency ships identically to a registry one. There is no asar/packaging interaction
to check.

**CI is only affected if the manifest changes.** `.github/workflows/publish.yml` runs `npm install`
then `npm run dist:publish` on a clean runner. A `file:../av-grid` override in `package.json` would
resolve to a path that does not exist there and break the release build. `npm link` writes nothing
to the manifest — it is a symlink in the local `node_modules` — so CI keeps installing `av-grid`
`2.2.4` from the registry and is untouched by the whole epic until the final bump.

That asymmetry decides it. `file:` is rejected not because it works worse locally but because it
is the one option that can reach CI.

The loop is therefore:

1. Work in `C:\projects\av-grid`, verified by **its own test boards** — not through Persephone.
   This is the part that keeps the round trip cheap: US-1234, US-1235 and US-1236 are all engine
   work, and av-grid's `RenderGridTest` board drives `RenderGrid` directly with no grid on top.
   Persephone is not in that loop at all.
2. `npm link` only for the migration tasks (US-1237, US-1238), where Persephone genuinely needs
   the new surface. `npm run build` in av-grid after each change; Vite may need
   `optimizeDeps.exclude: ["av-grid"]` for a linked ESM dep — **verify, do not assume.**
3. One real version bump at the end: `npm version minor` → `git push --follow-tags` → Actions
   publishes (trusted publishing over OIDC, no token). Then `npm unlink`, pin Persephone to the
   new version, and re-verify against the published artifact before US-1239 deletes anything.

**Publishing is authorised** (user, 2026-08-30): once *all* av-grid work is done — US-1234, US-1236,
US-1240, US-1241 and US-1235 — cut the release rather than waiting to be asked again. It is one
release at the end, not one per task: `npm publish` is permanent and a version number can never be
reused, so each premature bump burns a number on an artifact nobody wanted. The changes are
additive plus a defect fix, so **minor**: 2.2.4 -> 2.3.0.

Two things the release needs that the day-to-day work does not. `npm version` **requires a clean
tree**, so the av-grid work must be committed first — av-grid is a separate repo and Persephone's
never-commit-unless-asked rule does not reach it. And the workflow is read from the *tagged
commit*, so the tag is what publishes, not the branch.

**Do not delete `uikit/VirtualGrid/` while linked.** The last verification before US-1239 has to
run against the real published package, or the epic closes on an artifact nobody has installed.

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
| US-1233 | Decide and set up the av-grid development loop | **Done** (2026-08-30) |
| US-1234 | Add a keyed cell pool to av-grid (`setReuseKey`) — Gap 1 | **Done** (2026-08-30) |
| US-1236 | Stop av-grid losing scroll position — host re-append *and* its own cell churn — Gap 3 | **Done** (2026-08-30) |
| US-1240 | Add after-paint scrolling to av-grid — Gap 4 | **Done** (2026-08-30) |
| US-1241 | Make `RenderGrid.setOptions` apply shell layout live — Gap 5 | **Done** (2026-08-30) |
| US-1235 | Move the measured-row-height layer into av-grid, incl. the cell-lifecycle seam — Gaps 2 & 6 | **Done** (2026-08-30) |
| US-1237 | Migrate the UIKit primitives (`ListBox`, `Tree`, `Autocomplete`) to `RenderGrid` | **Done** (2026-08-30) |
| US-1238 | Migrate the remaining components and editors | **Done** (2026-08-30) |
| US-1239 | Delete `uikit/VirtualGrid/` and `uikit/shared/async-ref.ts`, update the docs | **Done** (2026-08-30) |

**Sequence.** All av-grid work first — US-1236, US-1240 and US-1241 are hard blockers for US-1237,
and US-1235 is a hard blocker for US-1238. US-1237 before US-1238 because the primitives are the
risky part and the editors mostly consume them. US-1239 last, and **only after** the final version
is published and installed: deleting the fork while linked would close the epic on an artifact
nobody has installed.

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

**`scrollLost` does not catch this — but not for the reason stated here originally.** This epic
first claimed the flag "never arms", because it is set in `onFrameResize` only when the grid
measures 0x0 and a re-append changes no size. **That reasoning was wrong, and US-1236's
measurement corrected it:** a detach *does* zero the measured size, so the flag arms exactly as
designed. It is then **cleared one frame too early** — spent by the forced repaint on a write to a
container that is still detached. Armed correctly, spent uselessly. The distinction matters,
because "never arms" would have been fixed by widening the arming condition, and that fix would
have done nothing.

US-1236 also found a case this epic did not have: a **same-task reparent** resets the scroller
identically but never reports a 0x0 size at all, so no sampling observer of any kind can see it.
That one needs a `MutationObserver` on the ancestors' child lists, or an explicit `revalidate()`.

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
   the container's scrollTop while the model keeps the real offset" — is **wrong**. (Re-measured
   under US-1236 and confirmed false a second time: 20000 handed straight back on show, both
   synchronously and after 900 ms. The flag survived, its rationale did not — it is detachment,
   not hiding, that loses the position.) Measured during
   US-1232: a hidden element merely *reports* `scrollTop` as 0 because it has no scroll box, and
   Chromium hands the real value back on show (verified across both a synchronous hide and a 900 ms
   one). So the hide/show restore that `scrollLost` licenses is redundant in the case it was written
   for, while the case that actually loses the position goes undetected. Re-measure before deciding
   whether the flag narrows, widens, or disappears.

Persephone is already protected on this path by the `fillSlot` fix, so this is not urgent for
Persephone — but it is a live defect for any other av-grid host, and it is the clearest single
argument for the epic: the same bug had to be found twice, and the second copy was found only
because someone went looking.

## Resolved questions

All three were answered by measurement on 2026-08-30, before implementation started.

**1. Is `uikit/VirtualGrid` the only fork? — No.** `uikit/shared/async-ref.ts` and av-grid's
`src/core/AsyncRef.ts` are the same class, character-for-character in the implementation; only the
doc comments differ, and av-grid's says outright that it was ported from the Persephone original.
av-grid **already exports `AsyncRef` publicly** from `src/index.ts`, so this fork needs no library
work — it is a deletion, folded into US-1239. The rest of `uikit/shared/` (`fill-slot`, `slots`,
`vanilla-view`, `dom-props`, the overlay and tooltip registries, …) is Persephone view
infrastructure with no av-grid counterpart and stays.

**2. Does `Percent` mean the same thing? — Yes, identically.** Both declare
`Percent` as a template-literal type of a number followed by `%`, and `ElementLength` as
`number | ((v: number) => number | Percent)`.
No divergence at the type level. The *semantics* live in `renderInfo.ts`'s `fromPercent` /
`doFitToLength`, which is inside the 13-line drift already measured — so it is covered by the
diff review US-1237 needs anyway, not a separate risk.

**3. Generic or Persephone-shaped? — Generic, both of them.**

The keyed pool was never in question. The measured-height layer is the real decision, and it goes
in generic, for three reasons. Measured row heights are a *general* virtualization need — chat
transcripts, log views, comment threads, anything whose row height is only known once rendered —
not a Persephone quirk; the layer already talks to the engine through the two-method
`GridModelCapability` seam and touches no engine internals, so "generic" costs nothing to build;
and a Persephone-shaped corner of a public package is precisely the shape that drifts into being
the next fork, which is the thing this epic exists to delete.

It lands as a **companion module composed over `RenderGridModel`**, not as options on
`RenderGridModel` itself. That keeps invariant 1 intact — nothing new enters the scroll path — and
keeps the 100k benchmark gate measuring the same code it measures today.

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

### 2026-08-30 (implementation opened)
- US-1233 decided without code: `npm link`, no manifest change. Packaging turned out to be a
  non-issue (`node_modules` is never packaged) and CI the only real constraint.
- All three open questions answered by measurement. `async-ref.ts` is a second fork and folds into
  US-1239; `Percent` is identical; both new features go in generic.
- US-1234 shipped in av-grid — buckets, not the reference's linear scan, on an 88× measurement.
- **The gap count went from two to five** after reviewing US-1237's investigation. Gap 3 is the
  find that matters: av-grid reproduces the US-1232 scroll-reset *internally*, on its own cells,
  independently of any host. The fork had already solved it twice and written down why; av-grid
  never received either fix. This is now the clearest single argument for the epic — the same
  defect has been found three times in two repos, and each time only because someone went looking.

### 2026-08-30 (US-1238 investigation reviewed)
- The consumer inventory was re-derived from scratch and matches the epic's migration surface
  exactly: **5 files own an engine** (`LogBodyView`, `NotebookBodyView`, `FileSearchView`,
  `LinksListView`, `LinksTilesView`), **10 are indirect** — they hold a `GridModelCapability` or a
  type and never construct a grid — and one is story wiring. The ten become av-grid-compatible for
  free when their child seam moves, so US-1238 is five migrations, not sixteen.
- Two of the engine owners are **fixed-height** (`LinksListView`, `LinksTilesView`) plus
  `FileSearchView`, so US-1238 is not purely the measured-height task the epic implied.
- Gap 6 (`fromRow`) found and assigned to US-1235.
- **A US-1239 sequencing catch:** the registered storybook story lives *inside* the fork directory
  (`uikit/VirtualGrid/VirtualGrid.story.ts`, reached from `storyRegistry.ts:59,75`). It has to be
  relocated or rewritten before the directory can be deleted, or the storybook breaks.
- The measured layer's contract with US-1236 was settled in writing before either was built:
  **"released" means "left the active set and entered the pool", not "detached from the DOM"** —
  because US-1236 is changing ordinary eviction to retain cells in place, and tying release to
  detachment would both stop measurement bookkeeping for hidden retained cells and make the
  lifecycle contract depend on the pool's overflow limit.

### 2026-08-30 (US-1236 done)
- Both faces fixed and measured in Chromium. Host detach/re-append: `scrollTop` 20000 restored with
  0–1 px unpainted, against a fully blank 456-of-468 px viewport and no scroll event before.
- New API, all additive: `watchHost` (default `true`), `keepCellsAttached` (default `false`),
  `RenderGrid.revalidate()` / `AVGrid.revalidate()`, `CellPool.release()` now returns `boolean`,
  and a `data-avg-pooled` DOM marker.
- `keepCellsAttached` was verified against a **real iframe**, not a stand-in: a cell's nested
  scroller held 300 across eviction and the frame loaded exactly once, versus a torn-down and
  reloaded document before. It is also *cheaper* where it applies — 0.586 ms/paint against
  1.648 ms, 40 childList mutations against 160 — at a bounded cost of ~150 retained nodes.
- **This epic's stated reason why `scrollLost` failed was wrong**, and the correction is recorded
  above. It armed correctly and was spent a frame early. A fix aimed at the reason written here
  would have changed nothing.
- The defaults matter: both new options are opt-out/opt-in such that an existing host that does
  none of this behaves exactly as it did. `keepCellsAttached` is off by default because retention
  is a real memory trade, worth it only for cells that own state.

### 2026-08-30 (US-1240 + US-1241 done)
- `model.scrollToRowAfterPaint(row, align?)` with a one-slot last-wins pending-scroll register,
  shared with `scrollToRow`'s attached-but-unmeasured fallback and drained by the same flush.
  `setOptions` now reapplies shell layout by re-running the constructor's own `applyStaticStyles()`
  — reuse rather than restatement, so the two paths cannot drift. No new exports; both are methods
  on already-exported classes.
- **The fork's `setTimeout(0)` claim was confirmed by measurement, not trusted** — and a bare
  `requestAnimationFrame` fails too, which is new and not in the fork's comment: the paint is
  itself on `rAF`, so a same-turn callback queues *ahead* of it. Asking for row 2,000 after growing
  a grid 20 → 3,000 rows: direct / `setTimeout(0)` / `rAF` / `afterPaint` = 100 / 100 / 100 /
  **48000**, where 100 was the old clamped extent. The three wrong entry points still read 100
  after the fix, which is what keeps the change additive.
- **The pending-scroll vs. reconciliation conflict resolved in favour of the newer explicit
  request**, on both axes: within a paint the flush runs after `restoreScroll`; across frames the
  reconciliation stands down while the register is loaded. Restoring first was rejected for a
  specific reason — it fires a scroll event, which is the exact signal the reconciliation uses as
  its veto, so it would poison the next reconciliation *and* show a visible jump out and back.
- A board gotcha worth keeping: `open_board` on an already-open board can serve a **stale `lib/`**
  and reproduce every pre-fix number exactly. It reads as a regression and is not one —
  `board_refresh` after `npm run build:board`.

### 2026-08-30 (US-1235 done; av-grid 2.3.0 published)
- Measured row heights landed as `MeasuredRowGrid` + `MeasuredRowHeights` — an opt-in companion
  over `RenderGrid`, not options on it, so nothing new enters the scroll path. The renderer gains
  one call: `p.measure(body)` nominates the element whose natural height *is* the row's. Nominate a
  **child**, not the cell: the engine sizes the cell from its own belief, so measuring the cell
  reports that belief straight back.
- `rowHeight` identity is kept stable **structurally, not by discipline** — a readonly bound field
  over mutable props, with the wrapper always substituted in `gridOptions()`, so even a caller
  replacing `renderCell` is reached through the same function. Asserted both ways. This was the
  requirement most likely to be broken by a later well-meaning edit.
- `fromRow` added to `RerenderInfo`, merged by taking the *lower* of two, and expanded across the
  rendered window **plus the sticky bottom band — which the fork misses**.
- The retention interaction works: with `keepCellsAttached`, a hidden cell measures 0, that 0 is
  ignored rather than committed, and the same element is remeasured to its real height on
  re-admission.
- **Fixed-height 100k gate unmoved** (ratio 0.97, 60 fps, 0 pool misses). The measured path costs
  5.8x a paint *while heights settle* and nothing once they have — a settled grid is idle.
- **Published: av-grid 2.3.0**, with a signed provenance statement, via the tag and OIDC trusted
  publishing. GitHub release created. Persephone's own dependency bump follows.

### 2026-08-30 (av-grid 2.3.0 installed; US-1237 done)
- Persephone pinned to `av-grid` **2.3.0**. Typecheck and lint passed against it with **zero source
  changes**, which is the real confirmation that all six additions were additive rather than merely
  claimed to be. npm rewrote the pin to `^2.3.0` on install and it was restored to an exact pin —
  av-grid is the only exactly-pinned dependency in the manifest, which reads as deliberate.
- **The migration funnels through `uikit/DataGrid`, not `av-grid` directly.** ESLint enforces this
  (EPIC-057 C4-1: "av-grid is reached only through uikit/DataGrid, so a later decision to vendor the
  library touches one folder"). `DataGrid/index.ts` gained the `RenderGrid` re-exports and every
  migrated file imports from `../DataGrid`. **US-1238 and US-1239 must do the same** — this is the
  one constraint most likely to be missed, because the natural import is the one the linter rejects.
- The two behaviour traps were handled: `keepCellsAttached: true` is passed by both `ListBoxView`
  and `TreeView` (it defaults to `false`, and the fork always retained), and the deliberate
  `scrollToRow` vs `scrollToRowAfterPaint` split survives at all three decision sites.
- **Verified rendering, not just building.** The Explorer tree now runs on av-grid. Windowed at a
  180px viewport over 944px of content it painted 9-12 cells with **0px uncovered** at every scroll
  position including the return to the top, and re-rendered correctly on resize in both directions.
  The only uncovered pixels at maximum scroll are the 20px of trailing `whiteSpaceY`. That is the
  US-1232 defect class specifically, tested against the specific view it broke in.

### 2026-08-30 (US-1238 done)
- All five engine owners migrated; the ten indirect consumers needed type-only updates, as the
  investigation predicted. **Zero direct `av-grid` imports remain outside `uikit/DataGrid`** — the
  boundary held.
- The fixed story was moved out of the fork directory to
  `editors/storybook/renderGridStory.ts`, which was the US-1239 sequencing trap the investigation
  caught. **The fork is now functionally orphaned**: nothing imports it except dead re-exports in
  `uikit/index.ts`.
- av-grid has no *named* `GridModelCapability`; the equivalent structural type is exposed through
  the barrel instead.
- **The renderer went blank after this change, and it was HMR, not a defect.** A 28-file batch
  defeated the hot swap; a main-process nudge did not recover it and a cold restart did. Worth
  recording because the two are indistinguishable from outside, and reporting the first as a broken
  migration would have sent someone chasing nothing.
- Verified on the restarted app, not just built:
  - **Explorer tree (fixed height)** — windowed at a 180px viewport over 944px of content, 0px
    uncovered at every scroll position including the return to the top.
  - **Log View (measured height)** — a deliberately heterogeneous push settled to **four distinct
    row heights** (17px log lines, 146/149px markdown and code, 215px for an embedded grid) with the
    scroll extent reflecting the real total. 0px uncovered at the top; only trailing slack at the
    bottom. That is `MeasuredRowGrid` converging on real DOM heights in the real app.

### 2026-08-30 (US-1239 closing note)
- Deleted the orphaned `src/renderer/uikit/VirtualGrid/` directory and duplicate `uikit/shared/async-ref.ts`: **3,748 lines**. Removed the seven-line dead re-export block from `uikit/index.ts`, for **3,755 total lines removed**.
- Re-homed the sticky-region rule in `uikit/DataGrid/DataGrid.css` with `background-color: inherit`, because custom `RenderGrid` cells may be transparent and a fixed token would be wrong inside a popover or tinted panel; the stylesheet is imported through the `uikit/DataGrid` boundary.
- Relocated the Storybook export while retaining its persisted story id, `virtual-grid`, so existing selections and deep links remain valid. Kept `uikit/shared/cell-style.ts` because current RenderGrid consumers still use the shared geometry helper. Historical task records were left unchanged.
