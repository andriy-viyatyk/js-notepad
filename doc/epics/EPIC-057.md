# EPIC-057: De-React Epic C4 — AVGrid → av-grid

## Status

**Status:** Active — US-1019 implemented apart from its Rule 4 "before" measurement
**Created:** 2026-08-22

## Overview

The last of the four epics that make up the [de-React roadmap](../de-react.md)'s Epic C ("UIKit
conversion"). C1 shipped as [EPIC-054](completed.md), C2 as [EPIC-055](EPIC-055.md), C3 as
[EPIC-056](EPIC-056.md). What remains in `uikit/` after C3 is **one React component and its
model namespace**: `AVGrid`, 4,917 lines across 29 files, holding the last nine Emotion importers
in the folder and the last `uikit/` → app-layer import in the tree.

C4 is different in kind from all three of its predecessors, and the difference is the whole epic:

- **It is a replacement, not a conversion.** C3 adopted av-grid's `render/` folder by hand-porting
  it into `uikit/VirtualGrid`. C4 does not port `AVGrid` — it deletes it and uses
  [av-grid](https://github.com/andriy-viyatyk/av-grid) instead, which is a published library
  (v2.1.0, 17,013 production lines, no runtime dependencies) that already does everything
  `uikit/AVGrid` does and a good deal it does not.
- **The work is not in `uikit/`.** Deleting 29 files is the cheap half. The expensive half is the
  **twelve app-layer consumer files** that have to change, because the two grids do not merely
  differ in naming: `uikit/AVGrid` is a *fully controlled* React component and av-grid is an
  *uncontrolled imperative* one. Every consumer today owns `columns`, `rows`, `focus`, `selected`
  and the edit path as React state and hands them down; under av-grid they hand an initial value in
  and take changes back through callbacks. That is the state-ownership inversion B15 called
  "host-wiring changes", and it is the reason this epic is scoped by consumer rather than by
  component. See C4-2.
- **It is cleanly abortable, and it is the only epic in the programme that is.** Nothing else in
  `uikit/` imports `AVGrid`; nothing in C4 blocks Epic D or E. If C4 is stopped halfway, the
  consumers not yet moved keep working against the old grid, because the old grid is still there
  until the last task deletes it.

At C4's close, `uikit/` contains no Emotion outside `RenderGrid` (Epic F's ledger), no app-layer
imports at all, and no React rendering except the compatibility shims that let unconverted editors
mount vanilla views. That is the end of Epic C.

## What the investigation at epic open established

The roadmap describes C4 in a single paragraph written at the C-split (2026-08-19) and never
amended. Measuring it against the tree — and against av-grid as it actually exists today, rather
than as it existed when the roadmap was written — changed four things. Each row states the prior
assumption and what measurement showed.

| Prior assumption | What measurement showed |
|---|---|
| C4 is "~4,914 lines" (roadmap §2 denominator, never re-measured) | **4,917 production lines**, 29 files, `tsx` 2,066 / `ts` 2,851. The estimate holds to within three lines — the second time in this programme an inherited figure survived a re-measure |
| "~15 consumer files in `editors/` and `components/`" | **12 files reference AVGrid in code.** Seven more mention it only in comments and need no change beyond the prose. Of the twelve, **7 are `<AVGrid>` JSX call sites**; the other five hold types, helpers or a model handle |
| B15: "av-grid's **source is copied into the tree** rather than consumed as a dependency, so Persephone controls it outright" | **Written before av-grid was a library.** It is now published on npm at **2.1.0**, with a 218 KB ESM bundle, generated `.d.ts`, and **11,360 lines of tests** that live in its own repository. Persephone's own boards already vendor it *from npm* — `boards-assets/manifest.json` names it the default board grid and points at the CDN. Copying 17,013 lines into `src/` would fork a maintained library, import a test suite the project's standards do not want, and create a **third** copy of a render engine the tree already has two of. This is the epic's one open decision that reverses a recorded one. See C4-1 |
| B15: "`RenderGridModel`'s public API differs from the React version's", so consumers need host-wiring changes | **True, and it understates the shape of the change.** The difference is not an API rename — it is **control inversion**. `AVGridProps` has 9 controlled-state props (`columns`/`setColumns`, `rows`, `focus`/`setFocus`, `selected`/`setSelected`, `editRow`, plus the four add/delete callbacks); av-grid takes each as an *initial* option plus an `onXChange` callback and owns the state in between. See C4-2 |
| §3.5: one `uikit/` → app-layer leak left, "C4's documented exemption" | **Confirmed, and it closes by moving rather than by rewriting.** `AVGrid/model/ContextMenuModel.tsx:3` imports `showAppPopupMenu`. av-grid's `onGridContextMenu(e, items)` hands the host the built-in item list and suppresses its own menu — so the `showAppPopupMenu` call moves *out* of `uikit/` into the consumer, which is where it always belonged. See C4-5 |
| Story coverage: "`AVGrid` is C4's to write" | **Still true, and now cheap.** `uikit/AVGrid/` has no story. av-grid ships eleven browser examples and a 100k-row benchmark of its own, so C4's story is a Persephone-integration story — theming, the context menu, the cell hooks — not a grid-features story |
| Theming will need a bridge | **It needs 24 lines of CSS and no JavaScript.** av-grid reads a `--p-*` custom-property contract directly and falls back per token. Persephone already maps `--p-*` → `--color-*` for boards (`editors/board/board-theme.ts`, `P_VAR_SOURCES`, 24 pairs) — but only inside a board iframe. The renderer itself defines `--color-*` and no `--p-*`, so the same map has to be declared once at the renderer root. A theme switch then re-tints the grid with zero repaints. See C4-4 |

## The surface, measured

All figures measured 2026-08-22 against the tree at `upcoming-v4.0.23` (`bc1cb760`, C3 closed), and
against `C:\projects\av-grid` at 2.1.0. Stories are excluded from production counts.

### What C4 deletes

| | |
|---|---:|
| `uikit/AVGrid/` production lines | **4,917** |
| Files | **29** (`.tsx` 12, `.ts` 17) |
| `@emotion` importers | **9** — every remaining one in `uikit/` outside `RenderGrid` |
| `uikit/` → app-layer imports (Rule 6) | **1**, the last in the tree |
| Components in `uikit/` without a story | **1** after C4 (`RenderGrid`, Epic F's) |

Largest files: `model/AVGridModel.ts`, `filters/FiltersModel.ts`, `model/EditingModel.ts`,
`DataCell.tsx`, `HeaderCell.tsx`. The `model/` namespace is 13 files.

### What replaces it

| | |
|---|---:|
| av-grid production lines (its repo) | 17,013 |
| av-grid test lines (its repo, not imported) | 11,360 |
| `dist/av-grid.js` (ESM) | 218 KB |
| `dist/av-grid.umd.cjs` | 186 KB |
| `dist/av-grid.css` | 35 KB |
| Runtime dependencies | **0** |

### The consumers

Twelve files reference AVGrid in code. Seven more (`swimlane-layout.ts`, `EnvVarsEditor.ts`,
`RevisionPicker.tsx`, `GitChangesView.tsx`, `GitTreeEditorView.tsx`, and inside `uikit/`,
`Select/SelectView.ts` and `shared/highlight.ts`) mention it only in comments.

| File | What it uses | Weight |
|---|---|---|
| `editors/grid/GridBody.tsx` | `<AVGrid>`, `FiltersModel`, `FilterBar`, `AVGridModel`, `TSortColumn`, `focusGrid()`, `models.focus.focusCell()` | **Heaviest.** The JSON/CSV grid editor |
| `editors/grid/GridEditor.ts` | `CellFocus`, `TSortColumn`, `defaultCompare`, `filterRows`, `rowsToCsvText` | Owns the persisted view state |
| `editors/grid/components/ColumnsOptions.tsx` | `<AVGrid>`, `AVGridModel`, `CellFocus`, `Column`, `TDataType` | A grid inside a popover |
| `editors/grid/index.tsx` | `AVGridModel` (type) | Handle plumbing |
| `editors/grid/utils/grid-utils.ts` | `detectColumnWidth`, `Column` | Helper |
| `components/git-tree/GitTree.tsx` | `<AVGrid>`, `cellRenderer` ×2, `cellFormater` ×4, `isStatusColumn`, `setColumns` persistence | **Second heaviest.** The one real cell-renderer rewrite |
| `components/git-tree/BranchTreeCell.tsx` | `TCellRenderer`, `TCellRendererProps` | The swimlane graph cell — a React component |
| `components/git-tree/GitTreeModel.ts` | `AVGridModel` (type), `setGrid()` handle | Handle plumbing |
| `components/file-grid/FileGrid.tsx` | `<AVGrid>`, `cellFormater` ×3, `rowCompare`, `models.focus.getGridSelection()` | Medium |
| `editors/env-vars/EnvVarsBody.tsx` | `<AVGrid>`, `editRow`, add/delete rows, `focusGrid()` | Medium |
| `editors/graph/GraphDetailPanel.tsx` | `<AVGrid>`, `editRow`, add/delete rows, `entity`, `detectColumnWidth` | Medium |
| `editors/log-view/items/GridOutputView.tsx` | `<AVGrid>`, `Column`, `CellFocus` | Light |

### Which props are actually passed

Measured across the seven JSX call sites. This is what the seam has to cover — not the 40-property
`AVGridProps` surface.

| Prop | Sites | av-grid equivalent |
|---|---:|---|
| `focus` / `setFocus` | 7 / 8 | `focus` option is absent; `getFocus()`/`setFocus()`/`onFocusChange` |
| `setColumns` | 7 | `columns` + `onColumnsChange` / `onColumnResize` / `onColumnsReorder` |
| `editRow` | 5 | `onEdit` (vetoable, fires **before** the write) |
| `onAddRows` / `onDeleteRows` | 5 / 5 | same names, vetoable, event-object payloads |
| `selected` | 5 | `selected` (initial, by key) + `onSelectionChange` |
| `entity` | 4 | **no equivalent** — host-side menu wording. C4-7 |
| `filtersModel` | 2 | `filterBar: true`, or `AVGrid.createFilterBar()` |
| `getContextMenuItems` | 2 | same name, event-object payload |
| `growToHeight` / `growToWidth` | 2 / 1 | same names |
| `onAddColumns` / `onDeleteColumns` | 1 / 1 | same names, vetoable |
| `cellBorders`, `onCellClass`, `searchString`, `onMouseDown`, `onDataChanged`, `onVisibleRowsChanged` | 1 each | all present except `onMouseDown` (use `onCellClick`) and `onDataChanged` (use `onVisibleRowsChange`) |
| `highlightString` | 1 | **no equivalent** — av-grid highlights the *search* string, which also filters. C4-7 |
| `extraElement` | 1 | **no equivalent.** C4-7 |
| `loading`, `readonly`, `scrollToFocus`, `fitToWidth` | 0 | `readonly` ↔ `editable`; the rest unused |

### The React cell hooks

`Column` has four renderer hooks whose types are React (`TCellRenderer = ComponentType<…>`,
`TCellFormater = (props) => ReactNode`). av-grid's single `render` hook returns an **HTML string or
a DOM element**. This is the same class of break as C3-1's `RenderCellFunc`, and it is much smaller
than that one was:

| Hook | Production sites | Where |
|---|---:|---|
| `cellFormater` | 6 | `FileGrid.tsx` ×3, `GitTree.tsx` ×3 |
| `cellRenderer` | 3 | `GitTree.tsx` ×3 (two of them `BranchTreeCell`) |
| `haderRenderer` | **0** | — |
| `editFormater` | **0** | — |

Nine sites in two files, and only one of them is a real rewrite: `BranchTreeCell`, the swimlane
commit-graph cell. Search highlighting inside a custom cell is covered — av-grid passes
`cell.highlight(text)`, which escapes and marks in one call.

### External DOM addressing

One site: `editors/graph/GraphDetailPanel.css` styles `.data-cell.cell-error` / `.cell-mixed`,
classes fed by `onCellClass`. Under av-grid the built-in class is `.avg-data-cell`, and the
stylesheet is injected, so those two rules need the class in the selector to out-specify it. No
`data-name` addressing, no automation selectors, no qa docs depend on AVGrid's DOM.

## Decisions

### C4-1 — av-grid arrives as an npm dependency, not as vendored source

*Settled (2026-08-22, user decision).* **This reverses EPIC-053 B15** ("source is copied into the
tree rather than consumed as a dependency, so Persephone controls it outright"), which was recorded
before av-grid was a library.

B15 was written when av-grid was a private sibling project. It is now a published, versioned,
MIT-licensed library with generated types and its own test suite, and **Persephone already consumes
it that way**: `boards-assets/manifest.json` names it *the default grid for a board*, describes it
as "a first-party library that moves with Persephone", and points boards at
`cdn.jsdelivr.net/npm/av-grid`. Vendoring would mean:

- forking 17,013 lines that are actively maintained elsewhere, with divergence starting on day one;
- either importing 11,360 lines of tests — which the project's standards do not want — or dropping
  the safety net that makes the library trustworthy in the first place;
- a **third** copy of the same render engine in one tree, beside `uikit/RenderGrid` (React, Epic F's
  ledger) and `uikit/VirtualGrid` (C3's hand-port of av-grid's `render/`);
- two answers to "where does a grid fix go", one for boards and one for the app.

The counter-argument B15 was making is still real — a parity gap in a dependency is a release cycle
away rather than an edit away. That is answered by ownership, not by vendoring: **the user owns both
repositories**, so a gap becomes an av-grid change and a version bump. C4-7 batches the known gaps
into one upstream release, scheduled before the consumer tasks start, precisely so that no consumer
task blocks on it.

Version handling: pin an exact version in `package.json` (not a range) and record it in the epic's
close notes, so a grid regression is bisectable against a single number.

**And the decision stays reversible, which is the reason it is safe to make** *(user, 2026-08-22)*.
Depending on the library may make some adoption awkward, and if it ever does, copying av-grid's
source into the tree is still available — B15's answer, taken later and with the awkwardness
actually measured rather than predicted. Nothing in C4 forecloses it: the mounting shim (C4-2) is
the only file that names the package, so a future vendoring changes one import path and adds a
folder. Keeping that exit open is worth one rule while the dependency is in force: **no consumer
imports from `av-grid` directly** — the types and the instance both come through
`uikit/AVGrid`.

### C4-2 — the epic is scoped by consumer, because the change is control inversion

`uikit/AVGrid` is a controlled React component: the caller holds `columns`, `rows`, `focus`,
`selected` and the whole edit path in state, passes them down, and receives setters back.
`AVGrid.create(host, options)` is the opposite: options are *initial* values, the grid owns the
state after that, and the host learns about changes through callbacks. Nine of the props the call
sites pass are on that boundary.

Two consequences fix the shape of the epic:

1. **A "compatibility shim" that emulates controlled props over av-grid is not on the table.** It
   would be a reconciliation layer — diffing `focus`, `selected` and `columns` on every render and
   pushing the delta down — which is the exact machinery this programme exists to remove, added at
   the very end of it. Rule 2 ("a swap must not break call sites") therefore cannot be honoured
   here, the same way C3-1 could not honour it for `RenderCellFunc`. C4 is the programme's second
   and last documented Rule 2 exception.
2. **What *is* on the table is a mounting shim.** The consumers are React files that belong to
   Epics D and E; rewriting them as vanilla views is not C4's job. So `uikit/AVGrid` is replaced by
   a thin React component — same name, `mountVanilla`-shaped, the pattern C1 established — that
   creates and destroys the av-grid instance, forwards option changes through `setOptions`, and
   exposes the instance via `onModel`. Its props are av-grid's *option* names, not today's
   controlled ones. Each consumer then absorbs the inversion in its own model, which is where its
   persisted view state already lives.

That is why the linked tasks below are one per consumer group rather than one per component.

### C4-3 — the grid's persisted view state stays in `IEditorState`, and does not move to localStorage

av-grid offers `persistFilters: { name }`, which writes to `localStorage`. Persephone persists a
grid editor's columns, sort, filters and focus in `IEditorState` so they survive a restart *per
page and per file*, which a single named localStorage key cannot express. So C4 does **not** use
`persistFilters`. It uses the initial-option-plus-callback pair for each: `filters` +
`onFiltersChange`, `sort` + `onSortChange`, `columns` + `onColumnsChange`, `focus` set imperatively
+ `onFocusChange`. The editor model keeps owning the persisted copy; the grid keeps owning the live
one. This is the one place the inversion is *less* work than the current code, which round-trips
every one of those through React state on the keystroke path.

### C4-4 — theming is 24 lines of CSS declared once, and no JavaScript

av-grid reads a `--p-*` contract and needs no theming code: every `--avg-*` token falls back to its
`--p-*` counterpart, and setting a custom property re-tints with **zero** repaints, so a theme
switch costs nothing and needs no subscription. Persephone already owns the exact map — the 24
`--p-*` → `--color-*` pairs in `editors/board/board-theme.ts` (`P_VAR_SOURCES`) — but declares it
only inside a board iframe. C4 declares the same pairs once at the renderer root as
`--p-x: var(--color-y)`, generated from that same constant so the two cannot drift.

**And `injectStyles: false`.** av-grid injects its stylesheet on first `create()`, which lands it
*after* the page's own styles and out-orders them. C3-8's contract puts uikit CSS in
`@layer uikit`; a runtime-injected unlayered sheet would beat the whole layer. So the CSS is
imported through Vite (`import "av-grid/av-grid.css"`) inside a `@layer` wrapper, and injection is
turned off. `boards-assets/manifest.json` already documents this same gotcha for boards, which is
where it was first hit.

### C4-5 — the last Rule 6 leak closes by moving the call, not by deleting it

`AVGrid/model/ContextMenuModel.tsx:3` imports `showAppPopupMenu` from `ui/dialogs/poppers/` — the
last `uikit/` → app-layer import in the tree, carried as a documented exemption since C1.

av-grid draws its own menu (`.avg-menu`), which would be a second menu implementation in the app
and would not match the app's chrome. Its `onGridContextMenu(e, items)` option exists for exactly
this: it hands the host the built-in item list *and* suppresses both av-grid's menu and the
browser's. So the host passes one function that calls `showAppPopupMenu` with av-grid's items plus
the consumer's own. The leak closes because the call site moves into the app layer — where a
call to an app-layer popup belongs — rather than because anything is rewritten. Roadmap Rule 6 goes
to **zero violations** at this task, for the first time in the project.

The uikit `MenuItem` type stays the currency at that boundary; mapping av-grid's item shape to it
(or the reverse) is a small adapter, written once.

### C4-6 — the nine React cell hooks become `render` / `formatValue`, and `BranchTreeCell` is the only rewrite

`cellFormater` (6 sites) produces short display text — a filename with an icon, a shortened hash, a
formatted date — and maps onto av-grid's `render` returning a string, with `cell.highlight()` for
the search-mark. `cellRenderer` (3 sites) is heavier: two of them are `BranchTreeCell`, the commit
swimlane, which draws the branch graph and is a genuine React component with its own layout module
(`swimlane-layout.ts`, which is pure and unaffected).

`BranchTreeCell` is therefore the epic's one real component rewrite, and it lands in the git-tree
task with the consumer that needs it. Note av-grid's DOM-contract requirement for element-returning
renderers: **the stylesheet must position the returned element absolutely** — the engine writes
`top` and `left` and nothing writes `position`. A cell that lays out in flow looks right at the top
of the list and leaves an empty band below it, which is a failure that a screenshot of row 1 does
not catch.

### C4-7 — four parity gaps, batched into one upstream av-grid release before the consumer tasks

Measured against the call sites, the whole gap list is four items:

| Gap | Sites | Resolution |
|---|---:|---|
| `extraElement` — a node after the last row | 1 | **Upstream.** A general slot; av-grid already owns the equivalent space for its add-row button |
| `highlightString` — highlight without filtering | 1 | **Upstream.** av-grid's `searchString` both filters and highlights; a highlight-only input is a small, clearly-specified addition |
| `entity` — a noun for menu wording ("Add link") | 4 | **Host-side.** It only ever reaches the context menu, which C4-5 already moves to the host |
| `focusGrid()` | 2 | **Already there**, as `grid.focus()` |

Everything else the call sites use has a direct equivalent, including the three places that reach
past the façade into `models.focus` — `focusCell`, `getGridSelection` and the grid-focus call are
all on av-grid's public instance (`focusCell`, `getSelection`, `focus`), so no consumer needs to
touch `grid.model`.

The two upstream items are the reason US-1019 comes first and lands a *pinned* version: they ship
in one av-grid release, verified in av-grid's own harness, before any consumer task starts. No
consumer task waits on a library change.

### C4-8 — the Rule 4 measurement must be taken before anything is deleted

Rule 4 wants one measured number per epic, and for C4 the number is a comparison — which means the
"before" side has to be read off the **React** grid while it still exists, on the same data, in the
same app. It cannot be recovered afterwards. av-grid publishes its own figures (flat-cost scroll at
row 99,000; two cells repainted per pointer move while dragging a range across 100,000 rows), so
the honest comparison is a Persephone-side measurement of the same three interactions on the same
rows: first paint, a scroll frame, and one pointer step of a range drag. Taken in US-1019, on a
grid editor with a large generated file, before a line of `uikit/AVGrid/` is touched.

### C4-9 — what `uikit/` looks like when C4 closes

| | At C4 open | At C4 close |
|---|---:|---:|
| `@emotion` importers in `uikit/` | 10 | **1** (`RenderGrid/RenderGrid.tsx`, Epic F's ledger) |
| `uikit/` → app-layer imports (Rule 6) | 1 | **0** |
| React components in `uikit/` that render JSX of their own | `AVGrid` + `RenderGrid` | **`RenderGrid` only** |
| `uikit/` components without a story | 2 | **1** (`RenderGrid`) |
| `uikit/` production lines | — | **−4,917** |
| The React form of `shared/highlight.ts` (C3-7) | alive for `AVGrid/DataCell` | **collectable** |

Two of Epic F's removal-ledger entries become collectable at this point: the React `highlight.ts`
form, and `RenderGrid`'s `AVGrid` importers. Neither is C4's to collect — the ledger says Epic F —
but C4 should record that they came due.

### C4-10 — when av-grid is not enough, the answer is to enhance av-grid

*Settled (2026-08-22, user decision).* Every problem C4 hits with av-grid — a missing option, a
behaviour that does not fit, a hook that cannot express what a consumer needs — is resolved
**upstream in the library**, not worked around in Persephone. There is no host-side shim tier: no
prop patched in the mounting shim to fake an option av-grid lacks, no consumer reaching past the
façade into `grid.model` to reach something the instance does not expose, no CSS override
compensating for markup the library should have produced.

This is what makes C4-1's dependency safe in practice, and it is a stronger statement than C4-7's
gap list. C4-7 names the four gaps *known at epic open*; C4-10 fixes what happens to the ones
discovered during implementation, which is where the temptation actually appears — a workaround is
always the cheaper move in the hour it is written, and it is the move that turns a shared library
into two diverging ones. Persephone and av-grid have the same owner, so "enhance the library" costs
a change and a version bump, and every consumer of av-grid gets the fix, boards included.

Practical consequence for the consumer tasks: a task that discovers a gap **stops, lands the av-grid
change, bumps the pin, and continues** — it does not route around it and leave a note. The pinned
version in `package.json` is the record of which gaps were closed when, which is the other reason
C4-1 pins an exact version rather than a range.

## Goals

1. Replace `uikit/AVGrid/` with av-grid, deleting 4,917 lines, the last nine Emotion importers and
   the last Rule 6 violation in the tree.
2. Move all twelve consumer files onto the imperative grid, each absorbing the control inversion in
   the model that already owns its persisted view state.
3. Establish av-grid as a pinned dependency of the app, themed by the existing `--p-*` map and
   layered under the C3-8 CSS contract.
4. Rewrite the one React cell renderer that has no string form (`BranchTreeCell`).
5. Take the Rule 4 before/after comparison on the React grid *first*.
6. Resolve every gap found along the way in av-grid itself (C4-10), leaving no host-side workaround
   tier behind.
7. Close Epic C.

## Linked Tasks

Five tasks, one per consumer group plus a bracketing pair. Each gets its document when it is next
up, per this programme's convention.

| Task | Description | Status |
|---|---|---|
| [US-1019](../tasks/US-1019-adopt-av-grid/README.md) | Adopt av-grid — the pinned dependency, the `--p-*` bridge, layered CSS, the mounting shim, the story, and the Rule 4 "before" numbers taken on the React grid | **Implemented** — steps 2-7 landed; the "before" measurement is outstanding |
| US-1020 | `editors/grid/` — the JSON/CSV grid editor. Five files, the persisted view state, the filter bar, and the context menu that closes Rule 6 | Planned |
| US-1021 | `components/git-tree/` — three files plus `BranchTreeCell`, the swimlane graph rewritten as a DOM renderer | Planned |
| US-1022 | The four remaining consumers — `FileGrid`, `EnvVarsBody`, `GraphDetailPanel`, `GridOutputView` | Planned |
| US-1023 | Delete `uikit/AVGrid/` — 29 files, 9 Emotion importers, the barrel, and the epic's closing numbers | Planned |

### Ordering

US-1019 first and US-1023 last; the three consumer tasks in between are **independent of each other
and can be reordered freely**, because the old grid stays in the tree until US-1023 and each
consumer moves on its own. That is what makes C4 abortable at any point: stopping after US-1020
leaves a tree where the grid editor uses av-grid, the other consumers use `uikit/AVGrid`, and both
work.

US-1019 carries the two upstream av-grid additions (C4-7) so that no consumer task blocks on a
library release.

### Verification

Per-consumer, through the app rather than through stories — these are editors and panels with real
data, and the story harness covers the grid itself only in US-1019. For each consumer: its own
editor opened on a real file, then the interactions that consumer actually offers (edit, add/delete
rows, resize and reorder columns, sort, filter, range-select and copy, the context menu), then a
**close and reopen** to prove the persisted view state round-tripped through the new callbacks.

Two checks that generalise across the tasks, because both are silent failures:

- **The absolute-positioning requirement** for element-returning cell renderers (C4-6). Verify at a
  scroll offset, not at the top of the list.
- **A theme switch** with a grid, a filter popover, a filter bar and the cell dropdown all open —
  the four elements that define the `--avg-*` block on themselves (C4-4), so each is a separate
  chance for an unthemed surface.

## Concerns / Open questions

1. ~~**C4-1 reverses a recorded decision and needs the user's word.**~~ **Settled 2026-08-22:** the
   npm dependency, with vendoring kept as an available fallback rather than a foreclosed one. See
   C4-1.
2. **C4 puts a Persephone release on an av-grid release.** Two upstream additions (C4-7) and a
   pinned version mean the app's grid now moves at the library's cadence. It is the same arrangement
   boards already have, and the user owns both repositories, so the risk is scheduling rather than
   capability — but it is new for the app, and worth naming before it is discovered.
3. **`ColumnsOptions.tsx` is a grid inside a popover**, and av-grid's own filter popovers mount on
   `document.body`. Nesting an av-grid instance inside a uikit `Popover` whose content view is
   itself portalled should be verified early — US-1019's story is the cheap place to do it, rather
   than discovering it inside US-1020.
4. **`boards-assets/manifest.json` describes av-grid as "a port of Persephone's own internal grid
   (VAGrid)".** After C4 that sentence is backwards: the app's grid *is* av-grid. The manifest entry
   and the board-authoring guides want a wording pass at epic close — a `/userdoc` item, small, but
   it is the one place the relationship is stated to an audience outside this repository.
5. ~~**The three `models.*` reach-throughs are covered by the façade today**, but they are the kind
   of thing that grows.~~ **Settled 2026-08-22, and generalised past the concern as stated:** the
   answer to anything av-grid does not expose or does not do is an **upstream addition**, never a
   workaround — reach-through, shim-patched prop, or compensating CSS alike. Promoted to
   [C4-10](#c4-10--when-av-grid-is-not-enough-the-answer-is-to-enhance-av-grid).
6. ~~**The nine `EPIC-054`–`EPIC-056` task folders are still on disk.**~~ **Settled 2026-08-22:**
   **epic and task documents are kept for the whole De-React programme** and cleaned up in one sweep
   when De-React is done — not at each epic's close. So the nine folders staying on disk is correct,
   and C4's own task folders stay too. Recorded in the roadmap, since it spans every epic in the
   programme rather than this one. The standing delete-on-close preference applies to work outside
   De-React.

## Notes

### 2026-08-22 — epic drafted

Scope measured against the tree at `bc1cb760` and against av-grid 2.1.0. Four inherited assumptions
changed (the consumer count, the vendoring decision, the shape of the "host-wiring change", and the
theming cost); the line estimate held at 4,917 against ~4,914. Decisions C4-1 through C4-9 drafted,
one of them (C4-1) blocking on the user because it reverses EPIC-053 B15. No implementation started.

### 2026-08-22 — C4-1 settled: av-grid is a dependency

*User decision.* **av-grid is imported as an npm package**, reversing EPIC-053 B15. The reasoning
the user gave is the one that matters more than the arguments for it: the difficulty a separate
library can create in adoption is real, but **the owner of av-grid is the owner of Persephone**, so a
gap is a library change rather than a blocked epic — and **copying the source in remains available**
if the dependency ever gets in the way.

That second half is now a recorded property of the epic, not an aside. C4-1 carries the one rule that
keeps it true: **no consumer imports from `av-grid`** — the mounting shim in `uikit/AVGrid` is the
single file that names the package, so a later vendoring is one import path and a folder, not a
twelve-file sweep. It also means the eventual choice can be made against measured awkwardness
instead of predicted awkwardness, which is the same discipline the rest of this programme has used
on every inherited assumption.

No other decision changes. US-1019 is unblocked and is the next task.

### 2026-08-22 — the remaining concerns settled

Concerns 2, 3 and 4 accepted as written. Two produced changes:

**Concern 5 generalised into C4-10.** The concern was scoped to three `models.*` reach-throughs; the
user's answer is the wider rule — *if we discover some problem with av-grid usage in Persephone, the
decision should be "enhance the av-grid library" and not "find some workaround"*. That is now a
decision rather than a caution, because it governs the gaps found *during* implementation, which is
where a workaround is cheapest to write and most expensive to keep. A consumer task that finds a gap
stops, lands the library change, bumps the pin, and continues.

**Concern 6 settled the other way, and at programme scope.** Epic and task documents are kept for the
length of the De-React programme and swept once at the end, so the nine `US-1010`–`US-1018` folders
are correctly still on disk and C4's will be too. Recorded in [the roadmap](../de-react.md) rather
than only here, since every remaining epic is affected.

### 2026-08-22 — US-1019 planned: four things the epic did not know

The task document is [US-1019](../tasks/US-1019-adopt-av-grid/README.md), with the Rule 4 procedure
split into its own [measurement.md](../tasks/US-1019-adopt-av-grid/measurement.md). Planning it
turned up four corrections to decisions above. None changes the epic's shape; two narrow a decision
and two widen a task.

**C4-1's "one file" becomes "one folder", and the shim is not called `AVGrid`.** The shim lands in a
new `uikit/DataGrid/`, permanently named, and is deliberately **not** exported from `uikit/index.ts`.
Three reasons, in order of weight. `AVGrid` is the library's own exported class, so a Persephone
component of the same name means one identifier resolves to two different things depending on the
import path — a wrapper named after the thing it wraps is ambiguous forever, not just during the
migration. `uikit/index.ts:143-174` already re-exports `Column` and `CellFocus` from `./AVGrid`, and
av-grid exports both names too; the repo has run this experiment once already, and the result is
`uikit/index.ts:118-124`, where the **survivor** (`VirtualGrid`) was aliased to `VirtualCellFunc`
because the **corpse** (`RenderGrid`) held the good name. Skipping the barrel avoids the collision
entirely and matches what every `RenderGrid` consumer already does. And "one file names the package"
was never achievable — the view and the type re-exports both need it — whereas "only
`uikit/DataGrid/**` may import `av-grid`" is checkable by ESLint, which makes the weaker-sounding
claim the stronger guarantee. C4-1's wording should be amended at epic close.

**C4-7's gap list is five items, not two; one of them overrides C4-7 itself; and the library work
now lives in av-grid's own repository.** The two it
predicted (`extraElement`, `highlightString`) are confirmed at one call site each. Two more appear
only when the context menu is read against Persephone's icon contract: uikit's `MenuItem` and
av-grid's are **field-for-field identical**, so C4-5's anticipated shape adapter does not exist — but
Persephone renders `icon` as an icon *component* whose `createElement()` is called and which
**throws** when absent, while av-grid's built-in items carry SVG source *strings*. So av-grid's
built-in items need stable `id`s for a host to re-icon them, which is upstream addition 3. And once
ids exist, the `entity` prop is the fourth: C4-7 filed it as host-side, which is right about where it
lands and wrong about the cost — under `onGridContextMenu` the host receives labels av-grid has
already composed *and pluralised*, so "host-side" means re-deriving `Insert 3 rows` in Persephone. A
`rowNoun` option lets the library compose it. **C4-10 governs C4-7 here**, which is the first time
the "enhance the library" rule has actually decided something rather than described a preference.
The fifth is `whiteSpaceY`, an engine option that has always existed
(`av-grid/src/render/RenderGridModel.ts:90`) and was never exposed: it is how a footer taller than
the 20 px trailing slack reserves its own room, instead of `extraElement` silently changing the
grid's geometry.

All five are additive, so they shipped as one release: **av-grid 2.2.0, published 2026-08-22**. They
were specified, built and released **in av-grid's own repository** — phase 7, recorded in
`C:\projects\av-grid\tasks\plan-done-03.md` — rather than inside US-1019. *(User decision,
2026-08-22: the library work is done and published from its own repo, then Persephone reviews
US-1019 against the released version.)* That kept a library release off Persephone's critical path,
which is what C4-7 wanted in the first place, and put US-1019's scope back to what the epic
intended.

**Reviewing US-1019 against the released version found nothing wrong with it and three things it
could now say precisely** — which is the argument for the review step rather than for assuming the
plan was followed. `extraElement` turned out to be positioned by av-grid's own stylesheet with
exactly the four declarations `GitTree.tsx:171-176` writes by hand, so **US-1021 deletes them**; the
git-tree footer is 24 px against a 20 px default slack, so **US-1021 must pass `whiteSpaceY`** rather
than relying on the opaque background that hides the overlap today; and `addRowLabel`'s default
became `` `add ${rowNoun}` ``, so **`rowNoun` alone reproduces `entity` in full**, button included.
One pre-existing behaviour is now written down where the consumer will meet it: overlapping highlight
words resolve longest-match-wins, and `editors/grid/GridBody.tsx` is the single site that passes a
search string and a highlight string at once.

One design note worth keeping, because it is a small lesson about this whole arrangement: the first
draft had `extraElement` share a flex strip with the add-row button, which meant de-positioning
`.avg-add-row` — a published selector, in a release whose entire point is that it is additive.
Reading the actual consumer killed that design. `GitTree.tsx:171-183` is a **full-width footer band**
on an opaque background, not a chip beside a button, and it already carries a comment explaining that
it copies the add-row button's absolute-positioning trick because a normal-flow element collapses
behind the absolutely-positioned cells. The shipped design touches `.avg-add-row` not at all. Upstream
is the right place for a fix, and the consumer is still the specification.

**C4-8's three interactions are not peers.** The required number is the *drag at row 99,000*, and it
is a **count** — DOM mutations per cell-boundary crossing — not a time. That is where the two
implementations genuinely diverge, because the React grid's `updateFocus` recomputes a selection
rectangle spanning every row from the anchor while av-grid marks two cells; and a `MutationObserver`
counts it exactly where a millisecond cannot. The scroll-frame comparison is the weak one and must
not be reported as a frame time: it costs ~1 ms against a 16.7 ms budget in *either* implementation,
and the deterministic counters are expected to come back nearly identical, because
`uikit/VirtualGrid/renderInfo.ts` is a near-verbatim port of the React engine's. Only React
reconciliation CPU differs, so it goes in as a ratio with an error bar.

**The `@layer` question is settled empirically rather than by reading.**
`@import url("av-grid/av-grid.css") layer(uikit);` as the first statement of a first-party stylesheet
does produce a real `@layer uikit { … }` wrapper, in both the dev server and the production bundle,
on this exact Vite install — verified by building a throwaway entry in this tree against a package
with an `exports` CSS subpath. The alternatives (`?raw` plus a runtime `CSSLayerBlockRule`, or a
build-time copy-and-wrap) each cost CSS HMR, `url()` rewriting and a flash of unstyled content, and
none is needed. Worth recording because C4-4 asserted the requirement without naming a mechanism,
and the mechanism was the part that could have failed.

### 2026-08-22 — US-1019 implemented: five things the plan had wrong, and one number

Steps 2-7 landed; `npm run lint`, `npm run typecheck` and `npm run build-prod` are clean. The
detail is in the task's own "What implementation changed about the plan"; three items belong in the
epic because they outlive the task.

1. **Option *presence* is semantics in av-grid, not just a value.** The plan's two-prop-tier design
   said callbacks are bound once at `create()` and never re-pushed. That is right about identity
   and wrong about presence: an `onGridContextMenu` that merely *exists* replaces the built-in
   menu, a `getRowKey` that exists suppresses key inference, and a `newRow` that exists overrides
   the default blank row. The shim therefore installs a trampoline only for props the host actually
   passes, and pushes only when presence flips. **Every consumer task inherits this**: passing an
   always-defined handler — the natural thing a React model does — silently turns off a library
   default. It is the first place C4-2's "the inversion is absorbed by the consumer" has a concrete
   edge.
2. **The failure mode for an unadapted context menu is silent, not loud.** C4-5's premise was that
   uikit's menu *throws* on av-grid's SVG-string icons. It does not — an item's icon goes through
   `fillSlot`, which writes a string as `textContent`, so the built-in items render their own
   `<svg …>` markup as visible text. The adapter is no less necessary; the point is that forgetting
   it produces a cosmetic defect a screenshot review can miss, not a crash.
3. **The CSS cost is ~18 KB, not 35 KB**, and the layering is confirmed rather than predicted: in
   the production bundle, 470 `avg-` selector occurrences, **all** inside the `@layer uikit` block
   and **none** outside it. The `@import … layer()` mechanism is now proved on this repo's real
   dependency, not on a throwaway probe. The dev-server side is still un-eyeballed.

**The Rule 4 "before" numbers were not taken**, because they need the production installer and a
hand-performed drag. This is the one place the task ran out of order, and the consequence is
recorded where US-1023 will look for it: **the BEFORE build is commit `44739cb0`**, buildable in a
worktree, and `measurement.md` now says so and says why the current tree must not be used instead.
Nothing is lost; the reading is deferred, not forfeited.
