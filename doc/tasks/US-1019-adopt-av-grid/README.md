# US-1019: Adopt av-grid — dependency, theming, the mounting shim, and the "before" numbers

**Epic:** [EPIC-057 — De-React C4](../../epics/EPIC-057.md)
**Status:** Implemented (steps 2-7) — step 1, the "before" measurement, is outstanding and
needs a production build plus a hand-performed drag; see [measurement.md](measurement.md)
**Created:** 2026-08-22

## Goal

Make av-grid usable from Persephone without changing a single consumer. Land the pinned
dependency, the `--p-*` theme bridge, the layered stylesheet, a `VanillaView` mounting shim with a
React boundary, the context-menu adapter, an integration story, and the Rule 4 "before"
measurement taken on the React grid **while it still exists**.

Nothing that renders today changes behaviour. `uikit/AVGrid/` is not touched, no consumer is
touched, and the task is revertible by deleting one folder and a handful of small edits. The three
consumer tasks (US-1020 … US-1022) start from a working, themed, story-verified grid.

The five upstream av-grid changes the epic needs (C4-7, C4-10) are **specified but not built here**
— they were built and released in that repository as **av-grid 2.2.0** (2026-08-22; phase 7, its
`tasks/plan-done-03.md`). This task consumes that version. Splitting them out is what kept a library
release off Persephone's critical path: no consumer task blocks on one.

## Background

### The shape of the seam

`uikit/AVGrid` is a **fully controlled** React component: the caller holds `columns`, `rows`,
`focus`, `selected` and the edit path in React state, passes them down, and receives setters back
(`src/renderer/uikit/AVGrid/model/AVGridModel.ts:28-88`, 40 properties). av-grid is the opposite:
`AVGrid.create(container, options)` returns an instance that **owns** that state; options are
*initial* values and the host learns of changes through callbacks.

The shim does not attempt to hide that. Per [C4-2](../../epics/EPIC-057.md#c4-2--the-epic-is-scoped-by-consumer-because-the-change-is-control-inversion)
there is no reconciliation layer: this is a *mounting* shim, its props are av-grid's own option
names, and each consumer absorbs the inversion in the model that already owns its persisted view
state.

One consequence drives the shim's design. `mountVanilla`'s host calls `view.update(props)` on
**every** parent render (`src/renderer/uikit/shared/mount.tsx:74-82`), and a JSX caller builds a
new props object every time. Pushing all of it into `setOptions` on every render would hand
av-grid new `rows` / `columns` array identities constantly. So the shim has **two prop tiers**:

| Tier | Contents | How it is forwarded |
|---|---|---|
| **Callbacks** | `onEdit`, `onInvalidEdit`, `onFocusChange`, `onSelectionChange`, `onColumnsChange`, `onColumnResize`, `onColumnsReorder`, `onSortChange`, `onFiltersChange`, `onVisibleRowsChange`, `onAddRows`, `onDeleteRows`, `onAddColumns`, `onDeleteColumns`, `onCellClick`, `onCellDoubleClick`, `onCellContextMenu`, `onGridContextMenu`, `getContextMenuItems`, `onCellClass`, `rowClass`, `onGetOptions`, `getRowKey`, `newRow`, `newColumn` | Bound **once** at `create()` as stable trampolines that read `this.props` live. Never re-pushed — an inline arrow in JSX changes identity every render and would produce a `setOptions` call per render for nothing. |
| **Values** | `rows`, `columns`, `sort`, `filters`, `searchString`, `highlightString`, `highlightSearch`, `rowHeight`, `editable`, `can*`, `growToHeight`, `growToWidth`, `cellBorders`, `fitToWidth`, `className`, `name`, `extraElement`, `addRowLabel`, `rowNoun`, `disableFiltering`, `disableSorting`, `disableContextMenu`, `disableClipboard`, `selectColumn`, `overscanRow`, `overscanColumn`, `whiteSpaceY` | Shallow-diffed by identity against the last pushed set; only the changed keys reach `setOptions`. |

`selected` and `focus` are deliberately **not** continuously-pushed values: `selected` is an
initial option only, and there is **no `focus` option at all** — focus is set imperatively
(`grid.focusCell()`) and read back through `onFocusChange`. That is the inversion, and absorbing it
is the consumer's job, not the shim's.

### Where the shim lives, and why not `uikit/AVGrid/`

**`src/renderer/uikit/DataGrid/`** — a new folder, with its final name from day one, never
renamed, and **not exported from `uikit/index.ts`**.

Three things settle this:

1. **`AVGrid` is the wrong name for the wrapper, permanently.** `AVGrid` is the library's own
   exported class. A Persephone component with the same name means `import { AVGrid }` resolves to
   two different things depending on the path — the React shim or the library itself. `DataGrid` is
   unambiguous, and it stays correct after US-1023 rather than becoming correct at US-1023.
2. **The type names collide, and the barrel is where that goes wrong.** `uikit/index.ts:143-174`
   re-exports `Column`, `CellFocus`, `TSortColumn`, `TFilter` from `./AVGrid`; av-grid exports
   `Column`, `CellFocus`, `SortColumn`, `Filter`. `Column` and `CellFocus` collide exactly. The
   repo has already run this experiment: forcing `VirtualGrid` into the barrel beside `RenderGrid`
   produced `uikit/index.ts:118-124`, where the **survivor** was aliased to `VirtualCellFunc` /
   `VirtualCellParams` because the **corpse** held the good names — a name nobody chose, which will
   outlive `RenderGrid` unless someone remembers a cleanup nobody scheduled. Skipping the barrel
   avoids the whole class of problem, matches what every `RenderGrid` consumer already does
   (`from "../../uikit/RenderGrid"`), and matches the project's own "direct imports preferred over
   barrel imports" standard.
3. **Coexistence is genuinely safe.** Every `.data-cell` / `.header-cell` rule in the old grid is a
   descendant selector inside an Emotion-generated scope (`uikit/AVGrid/AVGrid.tsx:25` is
   `styled(RenderGrid)(…)`; lines 28-142 are all `"& .data-cell"` and friends). There is not one
   unscoped `.data-cell` rule in the tree. The two app-layer rules that use the name are scoped
   (`editors/graph/GraphDetailPanel.css:12-13`, `.graph-detail-panel .data-cell.cell-error`), and
   the one DOM query (`uikit/AVGrid/model/ContextMenuModel.tsx:20-22`, `closest(".data-cell")`) is
   event-scoped and cannot reach into an av-grid instance. Against `.avg-*` there is no overlap.

The alternative — rename the old component to `AVGridReact` and give the new one the name `AVGrid`
immediately — was considered and rejected. It would force this task, the one designed to be purely
additive, to rewrite ~15 existing consumer files before a line of new grid exists, and it would
keep a name that stays ambiguous against the library forever.

**The consequence for [C4-1](../../epics/EPIC-057.md#c4-1--av-grid-arrives-as-an-npm-dependency-not-as-vendored-source):**
its rule was written as "the mounting shim in `uikit/AVGrid` is the single file that names the
package". The truthful, enforceable form is **one folder**: only files under
`src/renderer/uikit/DataGrid/` may import `av-grid`. That is stricter in practice than "one file"
was in principle, because ESLint checks it rather than memory (step 6). A future vendoring still
changes one folder's imports and nothing else.

### The stylesheet has to be layered, and `@import … layer()` is the way

av-grid injects its stylesheet on first `create()`, unlayered. Unlayered CSS beats **all** layered
CSS, so an injected sheet would out-rank every rule in `@layer base, uikit, app, editor`
(`src/renderer/theme/style-layers.css:6`) — including the app-layer rules that are supposed to
override grid chrome. So `injectStyles: false`, and the CSS comes in through Vite.

The mechanism is verified, not assumed. `@import url("av-grid/av-grid.css") layer(uikit);` as the
**first statement** of a first-party stylesheet produces a real `@layer uikit { … }` wrapper around
the inlined rules, in **both** the dev server and the production bundle, on this exact Vite install
(8.1.4, postcss transformer — `vite.renderer.config.ts` sets no `css` block, and `scripts/dev.mjs`
and `scripts/build-prod.mjs` drive the same config). Vite bundles a `postcss-import` that
explicitly rebuilds the `@layer` at-rule and re-parents the inlined nodes into it, and it resolves
bare specifiers through its own resolver with full `exports` support. This was confirmed by
building a throwaway entry inside this repo against a package with an `exports` CSS subpath, and
checking the emitted CSS in dev and in prod.

Two constraints come with it:

- The `@import` must be the **first** statement in the file — above the file's own
  `@layer uikit { … }` block, never inside it (CSS forbids `@import` inside a block anyway).
- Do **not** write `~av-grid/...` or a relative `node_modules/` path. Vite 8 has no `~` handling;
  the bare specifier is correct. `av-grid`'s `exports` maps `./av-grid.css` unconditionally
  (`av-grid/package.json`), so there is no condition for Vite to miss.

Alternatives (`?raw` / `?inline` plus a runtime `CSSLayerBlockRule`, or a build-time copy-and-wrap
step) all cost the same things: no CSS HMR, no `url()` rewriting, a flash of unstyled content, and
in the build-step case two entry points to keep in sync with silent prod divergence. None is
needed here. av-grid's stylesheet contains no `url()`, no `@import` and no `@layer` of its own, so
there is nothing else to reconcile.

### The `--p-*` bridge is 26 declarations and no JavaScript

av-grid reads a `--p-*` contract directly: every `--avg-*` token falls back to a `--p-*`
counterpart, and setting a custom property re-tints with **zero** repaints — so a theme switch
costs nothing and needs no subscription. Its own stylesheet already reads `--p-text-strong`
directly, with a fallback.

Persephone owns the exact map already: the 24 `--p-*` → `--color-*` pairs in
`src/renderer/editors/board/board-theme.ts:29-53` (`P_VAR_SOURCES`). But it declares them **only
inside a board iframe** — a repo-wide grep finds no `--p-*` in the renderer's own CSS or TS at all.
`--color-*` are set on `document.documentElement` as inline style by `applyTheme()`
(`src/renderer/theme/themes/index.ts:62-67`), so a `:root { --p-bg: var(--color-bg-default) }`
declaration resolves against them correctly and follows every theme switch for free.

Two tokens av-grid reads are **not** in the map:

| Token | Where it has to come from |
|---|---|
| `--p-font-base` | `--avg-font-size` falls back to it. `installAppTokenVars()` already puts `--font-base: 14px` on `:root` (`theme/token-vars.ts:31-40,50-64`), so `--p-font-base: var(--font-base)`. 14px is what the old grid inherited from `body`. |
| `--p-font-family` | `--avg-font-family` falls back to it, and **it does not exist anywhere in the project**. Without it the grid renders in a system sans stack instead of the app's `Consolas, monospace, "Courier New"`. |

Row height needs no bridge: `defaultRowHeight` is `24`
(`uikit/RenderGrid/RenderGridModel.ts:23`) and av-grid's `rowHeight` default is `24`.

### The five upstream av-grid additions — shipped in 2.2.0

[C4-10](../../epics/EPIC-057.md#c4-10--when-av-grid-is-not-enough-the-answer-is-to-enhance-av-grid)
says a gap is closed upstream, never worked around. Measured against the call sites the list was
five items — the two C4-7 predicted, and three that only appeared once the context menu and the
add-row strip were read in detail.

**All five are published.** av-grid **2.2.0** (2026-08-22) — specified as phase 7 in that
repository's own `tasks/plan-done-03.md`, implemented and released there, with no design divergence
from the plan. This task consumes it; the prerequisite is met.

| Addition | Shipped signature | The Persephone site it exists for |
|---|---|---|
| Highlight without filtering | `highlightString?: string` | `editors/grid/GridBody.tsx:139` passes `highlightString={editorConfig.highlightText}`, from search-result navigation (`api/pages/PageNavigator.ts:32`). It must not hide rows. |
| Stable context-menu item ids | `id` on every built-in item, prefixed `avg-` | Persephone's menu renders `icon` as an icon **component** — `uikit/Menu`'s `iconElement()` calls `component.createElement()` and **throws** when it is absent (`uikit/Menu/MenuItemView.ts:41-44`) — while av-grid's built-ins carry **SVG source strings**. Labels are counted and pluralised, so an id is the only stable handle. |
| What the grid calls a row | `rowNoun?: string` (default `"row"`) | The `entity` prop, 4 sites. C4-7 filed it host-side; that was right about where it lands and wrong about the cost, because `onGridContextMenu` hands the host labels av-grid has already composed *and pluralised*. **C4-10 governed C4-7 here.** |
| The trailing slack | `whiteSpaceY?: number` (default 20) | Reserves room for a footer taller than the slack, instead of `extraElement` silently changing the grid's geometry. The engine always took it (`av-grid/src/render/RenderGridModel.ts:90`); `AVGridOptions` never exposed it. |
| A host element after the last row | `extraElement?: HTMLElement \| null` | `components/git-tree/GitTree.tsx:530` puts the "Load more · Load all" footer there. |

#### Four things the release settled that change what the consumer tasks do

These are the reason it was worth reading what shipped rather than trusting the plan.

1. **`extraElement` is positioned by av-grid, so `LoadMoreRow`'s own positioning becomes
   redundant.** The library sets `class="avg-extra"` and `data-avg-slot="content-end"` on the host's
   element and its stylesheet gives it `position: absolute; left: 0; right: 0; bottom: 0` — which is
   character-for-character what `GitTree.tsx:171-176` already writes by hand. **US-1021 deletes those
   four declarations** and keeps the rest (the opaque background, the height, the flex centring),
   because av-grid deliberately sets no colour, size or padding: only the host knows what the grid's
   background is.
2. **The 20 px slack is shorter than the footer, so US-1021 must pass `whiteSpaceY`.** `LoadMoreRow`
   is `height: GIT_TREE_ROW_HEIGHT` (24 px) and the default slack is 20, so without
   `whiteSpaceY: GIT_TREE_ROW_HEIGHT` the band overlaps the last commit row. Today's code gets away
   with it *only* because it paints an opaque background over the overlap — which the comment at
   `GitTree.tsx:169-170` says is deliberate. Reserving the room properly is strictly better and is
   now one option.
3. **`rowNoun` covers both halves of `entity`, including the add-row button.** `addRowLabel`'s
   default became `` `add ${rowNoun}` ``, so passing `rowNoun` alone reproduces the old prop exactly:
   the menu reads `Insert 3 links` and the button reads `+ add link`, which is what
   `uikit/AVGrid/AVGrid.tsx:252-259` builds by hand from `props.entity` today. No consumer needs to
   touch `addRowLabel`.
4. **Overlapping highlight words resolve longest-match-wins, and `GridBody` passes both strings.**
   av-grid's own log records it: `searchString: "a"` with `highlightString: "race"` over "Grace"
   marks `race` once, not `a` and `race`. Pre-existing behaviour of `markSearchWords`, unchanged by
   the new option — but `editors/grid/GridBody.tsx` is the one site that passes a search *and* a
   highlight, so US-1020 is where a surprise would surface. It is a marking difference only; no row
   is affected.

One further note, recorded because it is a trap the consumer happens to miss rather than one it
avoided: **`extraElement` shares the bottom strip with the add-row button** when `canAddRows` is
also set, and the full-width default sits over it. av-grid hit this in its own example page and
solved it by overriding `bottom` and reserving `whiteSpaceY`. No Persephone consumer hits it —
`GitTree` is the only `extraElement` site and it passes no `onAddRows` — but `EnvVarsBody` and
`GraphDetailPanel` both use add-rows, so it is worth knowing before someone adds a footer to one.

### The context-menu adapter is smaller than C4-5 expected, except for icons

[C4-5](../../epics/EPIC-057.md#c4-5--the-last-rule-6-leak-closes-by-moving-the-call-not-by-deleting-it)
anticipated "a small adapter" mapping av-grid's item shape to uikit's `MenuItem`. Read side by
side the two interfaces are **field-for-field identical** — `label`, `onClick`, `disabled`,
`invisible`, `startGroup`, `hotKey`, `selected`, `minor`, `id`, `items` — and Persephone's `icon` is
typed `any` (`core/events/context-menu.ts:4-20` vs `av-grid/src/types.ts:742-764`). av-grid's
`MenuItem[]` is therefore already structurally assignable, and there is **no shape mapping to
write**.

The real work is the icons, which is why the `avg-` ids were added upstream. The adapter is one
recursive pass replacing each item's SVG-string `icon` with the Persephone icon for its `id` (the
table is in step 5), then a call to `showAppPopupMenu(e.x, e.y, items)`. It lives **app-side** —
that is the whole point of C4-5, moving the `showAppPopupMenu` call out of `uikit/` — and it is
written here rather than in US-1020 so all three consumer tasks share one copy.

av-grid verified the ids do not disturb its own menu before shipping them: with 16 host items
beside the 9 built-ins, the 25-item menu still grew its search box and arrow navigation still
walked the items in order. That was the one risk in setting a field whose documented default was
index-plus-label.

### What this task does *not* do

- It does not touch `uikit/AVGrid/`, `uikit/index.ts`'s AVGrid block, or any of the twelve
  consumers. Those are US-1020 … US-1023.
- It does not wire the grid editor's own filter bar. av-grid's `filterBar` / `createFilterBar()` is
  exercised in the story; the editor's bar is US-1020.
- It does not use `persistFilters`. Per [C4-3](../../epics/EPIC-057.md#c4-3--the-grids-persisted-view-state-stays-in-ieditorstate-and-does-not-move-to-localstorage)
  persisted view state stays in `IEditorState`.

## Implementation plan

### 0. Prerequisite — av-grid 2.2.0 — **met**

Published 2026-08-22. Specified, implemented and released in av-grid's own repository (phase 7,
`C:\projects\av-grid\tasks\plan-done-03.md`), with no design divergence from the plan. Nothing in
this step remains.

Step 1 is still first, and still cannot be deferred: it is unrecoverable once the dependency is
installed.

### 1. Record the "before" numbers


**Not yet taken.** It needs the production installer (`npm run dist`) and a hand-performed mouse
drag, so it could not run with the rest of the implementation. Steps 2-7 landed first, which means
the working tree is no longer the app to measure.

That is recoverable and the procedure now says how: **the BEFORE build is commit `44739cb0`**, the
last commit before this task. Build it in a worktree
(`git worktree add ../persephone-before 44739cb0 && npm ci && npm run dist`) and follow
[measurement.md](measurement.md) end to end. Do **not** measure the current tree — `av-grid` is in
`package.json`, `installPVarBridge()` runs at startup and `@layer uikit` has gained the library's
rules, so it is a different app.

### 2. The dependency

- [x] `npm install --save-exact av-grid@2.2.0` — an **exact pin**, not a range (C4-1).
  `package.json:61` reads `"av-grid": "2.2.0"`, no caret.
- [x] `exports` maps `"./av-grid.css"` → `"./dist/av-grid.css"` unconditionally, and the stylesheet
  contains no `url()`, no `@import` and no `@layer` of its own. It reads eleven `--p-*` names — the
  nine in `P_VAR_SOURCES` plus `--p-font-base` and `--p-font-family`, which is exactly the gap the
  bridge fills and nothing more.

### 3. The `--p-*` bridge

- [x] **New file `src/renderer/theme/p-vars.ts`.** Move `P_VAR_SOURCES` here verbatim from
  `editors/board/board-theme.ts:29-53`, keeping its comment. Add:
  - `export const APP_FONT_FAMILY = 'Consolas, monospace, "Courier New"';`
  - `installPVarBridge()`: build one `<style data-persephone-p-vars>` holding
    `:root { --p-x: var(--color-y); … }` for every pair in `P_VAR_SOURCES`, plus
    `--p-font-base: var(--font-base)` and `--p-font-family: <APP_FONT_FAMILY>`. Same
    idempotent shape as `installAppTokenVars()` (`theme/token-vars.ts:50-64`): find-or-create the
    marked node, assign only when the text differs.

  The `var()` indirection is the point — the values are never resolved in JS, so a theme switch
  needs no re-push and costs no repaint.
- [x] **`src/renderer/editors/board/board-theme.ts`** — delete the local `P_VAR_SOURCES` and import
  it from `../../theme/p-vars`. `computeBoardThemePalette()` is otherwise unchanged, so the board
  contract keeps resolving to concrete hex exactly as today. One source of truth, two consumers.
- [x] **`src/renderer/theme/themes/index.ts`** — `installPVarBridge()` now sits between
  `installAppTokenVars()` and `applyTheme(readStartupThemeId())` at the bottom of the module.
- [x] **`src/renderer/theme/GlobalStyles.tsx`** — `body`'s `font-family` is now
  `var(--p-font-family)`. The `input, textarea, select, button` rule keeps its own literal
  fallback chain, because it reads `--vscode-editor-font-family` first and that is a different
  contract.

### 4. `src/renderer/uikit/DataGrid/` — the shim

Four files plus a story. **Only this folder may import `av-grid`.**

- [x] **`DataGridView.ts`** — `export class DataGridView<R = any> extends VanillaView<DataGridProps<R>>`,
  with a **public** constructor (Rule 9). Root is a plain `div` with `data-type="data-grid"`; it is
  the av-grid container, so the grid is created into `this.root` directly.
  - `onMount()`: `this.grid = AVGrid.create(this.root, { ...values, ...trampolines, injectStyles: false })`,
    then `this.own(() => this.grid.destroy())`, then prime the value diff, then
    `this.props.onGrid?.(this.grid)`.
  - `onUpdate(props)`: build the value set, diff by identity against the last pushed set, and call
    `setOptions(delta)` only when the delta is non-empty. Callback props are **not** in the diff.
  - `onDispose()`: `this.props.onGrid?.(null)`. The `destroy()` cleanup is already registered by
    `own()`; do not call it twice.
  - `mountVanilla` appends `root` before `mount()` (`shared/mount.tsx:33-35`) and its host is
    `display: contents` (`:88`), so `this.root` participates in the parent's flex layout and
    av-grid can measure a real height at `create()`. `DataGrid.css` gives the root the height
    contract; a blank grid means `grid.getState().viewport.width === 0`, which is a host-height
    problem and never a data problem.
- [x] **`DataGrid.tsx`** — `export function DataGrid<R>(props: DataGridProps<R>) { return mountVanilla(DataGridView as …, props); }`.
  Three lines, no Emotion, no JSX of its own.
- [x] **`DataGrid.css`** — first line `@import url("av-grid/av-grid.css") layer(uikit);`, then
  `@layer uikit { [data-type="data-grid"] { … } }` with the host-height contract
  (`display: flex; flex: 1 1 auto; min-height: 0;` and `position: relative`). Imported from
  `DataGridView.ts`.
- [x] **`types.ts`** — re-export av-grid's public types under Persephone-facing names, so no
  consumer names the package: `Column`, `CellFocus`, `SortColumn`, `Filter`, `MenuItem`,
  `CellContext`, `GridContextMenuEvent`, `CellEditEvent`, `AddRowsEvent`, `DeleteRowsEvent`,
  `AddColumnsEvent`, `DeleteColumnsEvent`, `CellEditorFactory`, `Percent`, and the `AVGrid`
  instance type as `DataGridInstance`. Also declare `DataGridProps<R>`: av-grid's options minus
  `injectStyles`, plus `onGrid?: (grid: DataGridInstance<R> | null) => void`.
- [x] **`index.ts`** — export `DataGrid`, `DataGridView`, the types, and the two helpers consumers
  will want (`highlightText`, `columnWidth`/`detectColumnWidth` equivalents — check av-grid's
  `Helpers` section and re-export what exists rather than reimplementing).
- [x] Nothing was added to `src/renderer/uikit/index.ts`.

### 5. The context-menu adapter (app-side, closes nothing yet)

- [x] **New file `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx`.**
  `showGridContextMenu(e: GridContextMenuEvent<any>, items: MenuItem[], extra?: MenuItem[])`:
  recursively replace each item's `icon` from the table below, then
  `void showAppPopupMenu(e.x, e.y, [...(extra ?? []), ...items])`.

  The fourteen ids av-grid 2.2.0 ships, and the Persephone icon each takes. The right-hand column
  is read off `uikit/AVGrid/model/ContextMenuModel.tsx:52-150`, so the menu looks identical before
  and after:

  | av-grid `id` | Persephone icon |
  |---|---|
  | `avg-copy`, `avg-copy-as` | `CopyIcon` |
  | `avg-copy-as-headers`, `avg-copy-as-json`, `avg-copy-as-html` | *(none — submenu children carry no icon today)* |
  | `avg-paste` | `PasteIcon` |
  | `avg-insert-rows`, `avg-add-rows` | `PlusIcon` |
  | `avg-delete-rows` | `DeleteIcon` |
  | `avg-insert-columns`, `avg-add-columns`, `avg-insert-column` | `PlusIcon` |
  | `avg-delete-columns`, `avg-delete-column` | `DeleteIcon` |

  Match on the id, never on the label — the row labels carry a count and a pluralised `rowNoun`.
  An unrecognised id (a future av-grid item, or a host item passed through `extra`) **drops the
  icon rather than throwing**: `showAppPopupMenu` substitutes `EmptyIcon` when any sibling has one
  (`showPopupMenu.tsx:118-122`), so a missing icon degrades to alignment padding. Assert the
  `startsWith("avg-")` split so a host item's own icon is never overwritten.
- [x] Noted in the file's header comment that this is the file C4-5 moves the `showAppPopupMenu`
  call *into*, and that `uikit/AVGrid/model/ContextMenuModel.tsx`'s Rule 6 exemption is deleted
  with that file in US-1023 — not here.

### 6. Lint: nothing outside `uikit/DataGrid/` names the package

- [x] In `eslint.config.mjs`, after the Rule 6 block, added:

  ```js
  // C4-1: av-grid is reached only through uikit/DataGrid, so a later decision to vendor the
  // library's source changes one folder instead of every consumer.
  {
      files: ["src/**/*.ts", "src/**/*.tsx"],
      ignores: ["src/renderer/uikit/DataGrid/**"],
      rules: {
          "no-restricted-imports": ["error", {
              paths: [{
                  name: "av-grid",
                  message: "EPIC-057 C4-1: import from uikit/DataGrid, not from av-grid directly.",
              }],
              patterns: ["av-grid/*"],
          }],
      },
  },
  ```
- [x] `npm run lint`, `npm run typecheck` and `npm run build-prod` all clean.

### 7. The story

- [x] **`src/renderer/uikit/DataGrid/DataGrid.story.tsx`**, exporting `dataGridStory`, registered in
  `src/renderer/editors/storybook/storyRegistry.ts` (import beside `virtualGridStory`, add to
  `ALL_STORIES`). Stories are exempt from the Rule 6 lint, so this one may import the app-side
  adapter from step 5 — which is what makes it an *integration* story rather than a grid-features
  story. av-grid ships its own feature examples and a 100k-row benchmark; do not duplicate them.

  Four panels, each covering a failure this epic can otherwise only discover late:

  1. **Theming.** A grid with a filter popover, the filter bar, and a cell dropdown all open at
     once, then a theme switch. Those four elements each define the whole `--avg-*` block on
     themselves (they must — a popover mounts on `document.body`), so each is a separate chance for
     an unthemed surface. Also verify the font: Consolas, not a system sans.
  2. **A grid inside a `Popover`** — epic Concern 3. `editors/grid/components/ColumnsOptions.tsx`
     nests an AVGrid inside a uikit `Popover` whose content view is itself portalled, and av-grid's
     own filter popovers mount on `document.body`. Prove the combination here, not inside US-1020.
     Watch for a zero-height host (the popover sizes to content) and for the filter popover
     stacking under the parent popover.
  3. **An element-returning `render`, verified at a scroll offset.** The engine writes `top` and
     `left` and nothing writes `position`, so a cell laid out in flow looks right at row 1 and
     leaves an empty band below. Scroll before judging — this is the C4-6 trap that a screenshot of
     the first row does not catch, and US-1021's `BranchTreeCell` depends on it.
  4. **`onGridContextMenu` through the app menu**, using step 5's adapter: right-click gives
     Persephone's own menu with Persephone icons, and neither av-grid's `.avg-menu` nor the
     browser's menu appears.

## What implementation changed about the plan

Five divergences, each with the reason. None changes the shape of the task; three of them are
things the plan asserted from reading and implementation found to be different.

1. **Callback trampolines are diffed on *presence*, not bound unconditionally.** The plan said
   callbacks are "bound once at `create()`" and never re-pushed. Binding a trampoline for *every*
   callback key breaks the grid, because to av-grid the mere existence of certain options is a
   decision: `onGridContextMenu` that exists **replaces the built-in menu** (its own header says
   so), `getRowKey` that exists suppresses key inference, and `newRow` that exists overrides the
   default blank row. A trampoline for a prop the host never passed returns `undefined` into each
   of those. So `DataGridView.syncTrampolines()` installs a trampoline only for props that are
   present, and pushes a change **only when presence flips** — identity changes are still ignored,
   which is the whole point of the tier.
2. **A string icon renders as text; it does not throw.** The plan said `uikit/Menu`'s
   `iconElement()` throws on av-grid's SVG-source-string icons. It does not reach them: the file is
   `MenuView.ts`, `iconElement` is used only for the check mark and the submenu chevron, and an
   *item's* icon goes through `fillSlot`, which writes a string as `textContent`. So an unadapted
   built-in item shows its own `<svg …>` markup as **visible text in the menu**. The conclusion is
   unchanged and slightly stronger: the failure is silent and cosmetic rather than loud, which is a
   worse failure to ship, and the `avg-` id table is the fix either way.
3. **The adapter is `.tsx`, not `.ts`.** Persephone's menu icons are React elements
   (`icon: <CopyIcon />`), so the file that substitutes them needs JSX. It is also **generic**
   (`showGridContextMenu<R>`) rather than taking `GridContextMenuEvent<any>`: `Column<R>` is
   invariant in `R` (it holds `cellClass`, `render` and `compare`), so an `unknown` parameter is not
   assignable from a concrete row type and `any` would trip `no-explicit-any` in `ui/`.
4. **`uikit/DataGrid/**` joins the existing `no-explicit-any` exemption.** av-grid's own generics
   default the row type to `any` (`AVGrid<R = any>`, `Column<R = any>`), so the shim's props,
   instance type and forwarding maps carry it through. `uikit/AVGrid/**` and `editors/grid/**` are
   already exempt for the same reason; this is the same list, one entry longer.
5. **`@layer uikit` gains ~18 KB, not 35 KB.** 35 KB is the unminified source; the emitted chunk is
   17.7 KB. Verified in the production bundle: **470 `avg-` selector occurrences, every one of them
   inside the `@layer uikit` block, zero outside it** — the whole file is one layer block. Two
   things worth knowing for later: the rules currently land in the **storybook** chunk, because the
   story is the only consumer until US-1020, and av-grid's tokens resolve through the bridge as
   intended (`--avg-font-family: var(--p-font-family, …)`).

**Still unverified:** the dev-server side of the layered `@import`. The prod bundle is confirmed
above; `npm start` was not run against this tree. It is in the acceptance criteria and expected to
be uneventful — Vite drives the same config in both modes — but it has not been eyeballed.

## The Rule 4 measurement

The full procedure — environment pinning, fixture generator, the void-the-run gate, three
measurement scripts, the trap table and the result table — is in
**[measurement.md](measurement.md)** beside this file. It lives in the task folder rather than the
epic doc because US-1023 reads it months later to take the AFTER side, which is exactly the case
[roadmap Rule 8](../../de-react.md) (keep task folders for the whole programme) exists for.

Three findings from working it out are worth having here, because two of them changed what the epic
should claim:

1. **The required number is a count, not a time, and it is the drag at row 99,000.** av-grid's claim
   is "2 cells marked per pointer move, 0 DOM mutations, identical at row 100 and row 99,000". The
   React grid's `FocusModel.updateFocus` recomputes a selection rectangle covering every row from
   the anchor, so row 99,000 is precisely where the two diverge — and a `MutationObserver` counts
   that exactly, where a millisecond could not. C4-8 named "first paint, a scroll frame, and one
   pointer step of a range drag" as three peers; they are not peers.
2. **The scroll-frame comparison is the weak one and must not be reported as a frame time.** A
   settled scroll frame costs ~1 ms against a 16.7 ms budget in *either* implementation, and the
   deterministic counters are expected to come back nearly identical — because
   `uikit/VirtualGrid/renderInfo.ts` is a near-verbatim port of `uikit/RenderGrid/renderInfo.ts`
   (its own header says so): same overscan, same reuse, same early exits. The only real difference
   is React reconciliation CPU, which is a timing. It goes in as a CPU ratio over 300 scripted steps
   with a stated error bar.
3. **No source change is needed on the BEFORE side.** The primary metrics come from a
   `MutationObserver` driven by an MCP `execute_script` call — nothing installed, nothing to revert
   on a codebase that is about to be deleted. Two optional temporary lines give the explanatory
   React-commit and cell-render counters that an observer cannot see; they are marked optional in
   the result if used.

Two traps the procedure exists to kill, both of which would have silently invalidated everything
else: the two implementations putting a **different number of rows on screen** (defended by a gate
that records the visible cell count and voids the run on a delta > 2, plus a fixture with uniform
12-character values so content-derived column widths cannot drift), and the two using **different
input mechanisms** for a range drag — HTML5 `dragenter` per cell versus `pointermove` on `window`
coalesced to one focus change per cell — which is why the unit is one *cell-boundary crossing* and
never one dispatched event.

## Concerns / open questions

All resolved; nothing here blocks implementation.

1. ~~**The gap list is five items, not C4-7's two.**~~ **Closed 2026-08-22:** all five shipped in
   av-grid 2.2.0, built and released in that repository rather than inside this task *(user
   decision)*, with no design divergence from the plan. Three of them were not in the epic's list
   because none is visible until the context menu is read against Persephone's icon contract and
   the git-tree footer against av-grid's overlay slot; three of them *remove* work from US-1020 and
   US-1021. One consequence outlives the concern: **`rowNoun` overrides a line in C4-7**, which had
   filed `entity` as host-side. C4-10 is the governing decision, and this was the first time
   "enhance the library" decided something rather than described a preference.
2. **The epic says "one file names the package"; this task delivers "one folder".** The stricter
   claim was never achievable — the type re-exports and the view both need the package. The folder
   form is what ESLint can check, which makes it the stronger guarantee in practice. C4-1 should be
   amended at epic close.
3. **`av-grid` is not installed in this tree yet**, so step 2 is the first point at which
   resolution of `av-grid/av-grid.css` through Vite is exercised against the real package. 2.2.0's
   `exports` still maps `"./av-grid.css"` unconditionally and the stylesheet still contains no
   `url()`, no `@import` and no `@layer` of its own — both re-checked against the published
   version — so this is expected to be uneventful. The check stays in the acceptance criteria
   rather than being left for a consumer task to discover.
4. ~~**The content-end strip is a structural change to a published stylesheet.**~~ **Moot:** the
   shipped design does not touch `.avg-add-row` at all. Reading the real consumer replaced the
   shared-strip design with one new class (`.avg-extra`) before anything was built, so 2.2.0 changes
   no existing selector and no existing default — which is what makes it adoptable without a
   migration note.

## Acceptance criteria

- [x] `package.json` pins av-grid exactly (`"av-grid": "2.2.0"`, no caret).
- [x] `npm run lint`, `npm run typecheck` and `npm run build-prod` are clean.
- [x] In the production bundle, `@layer base, uikit, app, editor` appears first (in
      `index-*.css`) and every av-grid rule is inside an `@layer uikit` wrapper: 470 `avg-`
      occurrences inside the block, **0 outside**. The lint rule was proved to bite, on both the
      bare specifier and the `av-grid/*` subpath form.
- [ ] The same in dev (`npm start`, then read the injected `<style>` for `DataGrid.css`). **Not yet
      done** — see the note at the end of "What implementation changed about the plan".
- [ ] The story's four panels all pass, including the two silent failures: the element-returning
      renderer checked **at a scroll offset**, and the theme switch with all four `--avg-*`-defining
      surfaces open.
- [ ] The grid renders in Consolas at 14px with 24px rows — visually indistinguishable in font and
      metrics from the old grid beside it.
- [ ] `grid.getState().viewport.width` is non-zero in every story panel, including inside the
      `Popover`.
- [ ] The "before" numbers are recorded in [measurement.md](measurement.md)'s result table **and**
      summarised in EPIC-057's notes. The gate's viewport / visible-cell / DPR row is filled in, not
      left blank — US-1023 cannot validate its own run without it.
- [x] `uikit/AVGrid/` is byte-for-byte unchanged and no consumer file is touched — confirmed by
      `git status`. The only pre-existing files edited are `package.json`, `eslint.config.mjs`,
      `storyRegistry.ts`, and the three theme files.
- [ ] Every existing grid consumer still works: open the JSON/CSV grid editor, the git-tree, the
      file grid, an `.env` file, a graph detail panel, and a script log-view grid output. This task
      changes global CSS (`@layer uikit` gains 35 KB) and adds `:root` custom properties, so "no
      consumer was edited" is not the same as "no consumer changed".

## Files Changed

### `C:\projects\av-grid` — **done, released as 2.2.0**

Phase 7, tasks 27-32; the record is `C:\projects\av-grid\tasks\plan-done-03.md`. Nineteen files,
+1,578 lines, including tests for all five additions and a new
`examples/11-host-integration.html`. This task's only remaining dependency on it is the version
number.

### `C:\projects\persephone`

| File | Change |
|---|---|
| `package.json` | + `"av-grid": "2.2.0"` (exact) |
| `src/renderer/theme/p-vars.ts` | **new** — `P_VAR_SOURCES` (moved), `APP_FONT_FAMILY`, `installPVarBridge()` |
| `src/renderer/theme/themes/index.ts` | call `installPVarBridge()` |
| `src/renderer/theme/GlobalStyles.tsx` | `body` font-family → `var(--p-font-family)` |
| `src/renderer/editors/board/board-theme.ts` | import `P_VAR_SOURCES` instead of declaring it |
| `src/renderer/uikit/DataGrid/DataGridView.ts` | **new** — the `VanillaView` wrapper |
| `src/renderer/uikit/DataGrid/DataGrid.tsx` | **new** — the `mountVanilla` boundary |
| `src/renderer/uikit/DataGrid/DataGrid.css` | **new** — layered `@import` + host-height contract |
| `src/renderer/uikit/DataGrid/types.ts` | **new** — re-exported types, `DataGridProps` |
| `src/renderer/uikit/DataGrid/index.ts` | **new** — public surface |
| `src/renderer/uikit/DataGrid/DataGrid.story.tsx` | **new** — the four integration panels |
| `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` | **new** — icon adapter + `showAppPopupMenu` (`.tsx`: the icons are React elements) |
| `src/renderer/editors/storybook/storyRegistry.ts` | register `dataGridStory` |
| `eslint.config.mjs` | forbid `av-grid` imports outside `uikit/DataGrid/`; add that folder to the existing `no-explicit-any` exemption |
| `doc/tasks/US-1019-adopt-av-grid/README.md` | the recorded "before" numbers |
| `doc/epics/EPIC-057.md` | the numbers in the notes; C4-1's "one file" → "one folder" |

### Files that need NO changes

Named so implementation does not go looking:

- **All of `src/renderer/uikit/AVGrid/`** (29 files) — deleted in US-1023, untouched here.
- **`src/renderer/uikit/index.ts`** — `DataGrid` is deliberately not in the barrel, and the AVGrid
  block stays exactly as it is until US-1023.
- **All twelve consumers** — `editors/grid/{GridBody.tsx,GridEditor.ts,index.tsx,components/ColumnsOptions.tsx,utils/grid-utils.ts}`,
  `components/git-tree/{GitTree.tsx,BranchTreeCell.tsx,GitTreeModel.ts}`,
  `components/file-grid/FileGrid.tsx`, `editors/env-vars/EnvVarsBody.tsx`,
  `editors/graph/GraphDetailPanel.tsx`, `editors/log-view/items/GridOutputView.tsx`.
- **`src/renderer/editors/graph/GraphDetailPanel.css`** — its `.data-cell.cell-error` /
  `.cell-mixed` rules need `.avg-data-cell` only when US-1022 migrates that consumer.
- **`src/renderer/uikit/{RenderGrid,VirtualGrid}/`** — neither is involved. `VirtualGrid` is C3's
  hand-port of av-grid's engine and stays the engine new vanilla code uses; `RenderGrid` keeps its
  twelve non-grid consumers until Epic F.
- **`src/renderer/theme/token-vars.ts`** — `installAppTokenVars()` is the model for the new
  installer but needs no edit; `--p-font-base` indirects through the `--font-base` it already sets.
- **`boards-assets/manifest.json`** — its "a port of Persephone's own internal grid" wording goes
  backwards at C4's close, which epic Concern 4 files as a `/userdoc` item at epic close, not here.
