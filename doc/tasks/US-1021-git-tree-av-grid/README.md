# US-1021: `components/git-tree/` — the commit history grid on av-grid

**Epic:** [EPIC-057 — De-React Epic C4 (AVGrid → av-grid)](../../epics/EPIC-057.md)
**Status:** Implemented — `npm run lint`, `npm run typecheck` and `npm run build-prod` clean against
av-grid **2.2.2** (Step 8 shipped and published 2026-08-22). App verification outstanding — see
Acceptance criteria.

## Goal

Move `components/git-tree/` off `uikit/AVGrid` and onto av-grid, absorbing the control inversion
in the component itself (C4-2). Rewrite the three React cell hooks the epic predicted — the
`BranchTreeCell` swimlane graph, the L/R side-select toggles, and the subject column's ref chips —
as av-grid `render` hooks, and keep the persisted column layout (width + order) round-tripping.

## Background

### The files

| File | Lines | What it does with the grid |
|---|---:|---|
| `src/renderer/components/git-tree/GitTree.tsx` | 534 | The `<AVGrid>` call site. Owns `columns` + `focus` as React state, builds all five columns, wraps `setColumns` to report the user's layout, and renders the "Load more" footer through `extraElement` |
| `src/renderer/components/git-tree/BranchTreeCell.tsx` | 110 | The SVG swimlane `cellRenderer` |
| `src/renderer/components/git-tree/SideSelectToggle.tsx` | 115 | The L/R toggle pair, rendered by `makeSideSelectCell` inside `GitTree.tsx` |
| `src/renderer/components/git-tree/GitTreeModel.ts` | 224 | Holds the `AVGridModel` handle; `revealRef()` focuses a commit's subject cell |
| `src/renderer/components/git-tree/RefBadge.tsx` | 38 | The decoration chip. Used by the subject cell **and** by `editors/git-tree/CommitInfoPanel.tsx` |
| `src/renderer/components/git-tree/index.ts` | 32 | Barrel |
| `src/renderer/components/git-tree/GitTree.story.tsx` | 56 | A story exists — unlike US-1019's, this is a real verification harness |

`swimlane-layout.ts` (196 lines) is pure and render-agnostic; it does not change. Nor do
`GitStatusBadge.tsx`, `git-date.ts`, `git-refs-tree.ts`, `GitChangesModel.ts`,
`GitBranchesModel.ts`.

### The three call sites, none of which changes

`GitTreeProps` is preserved exactly, so all three consumers are untouched:

| Consumer | Passes |
|---|---|
| `editors/git-tree/GitTreeEditorView.tsx:157` | `selectedHash`, `onSelectCommit`, `initialColumnLayout`, `onColumnLayoutChange`, `getContextMenuItems` |
| `editors/file-diff/RevisionPicker.tsx:103` | `compact`, `leadingRows`, `selectedHash`, `onSelectCommit` |
| `editors/file-diff/GitDiffRevisionsSecondaryView.tsx:131` | `name`, `compact`, `leadingRows`, `sideSelect` |

### Today → av-grid

| Today | Under av-grid |
|---|---|
| `columns` + `setColumns` in `GitTreeState` | the grid owns the array; `getColumns()` / `setColumns()` (**D1**) |
| `focus` + `setFocus` in `GitTreeState` | deleted — the grid owns cell focus, and nothing reads it (**D1**) |
| `handleColumnsChange` wrapper, to emit only user changes | `onColumnResize` + `onColumnsReorder`, which are unreachable from a programmatic `setColumns` (**F1**) |
| `selected: Set<string>` prop for the `selectedHash` highlight | imperative `grid.setSelected()` — `selected` is initial-only in the shim (**F2**) |
| `onClick={(r) => onSelectCommit(r.hash)}` | `onCellClick(cell, e)`, gated on the column key (**D3**) |
| `cellRenderer` ×3 (graph, side-select) | `render` returning an **HTML string** (**D2**, **D3**) |
| `cellFormater` ×4 (subject, author, date, hash) | `render` ×2 (subject, hash); author and date **deleted** (**F3**) |
| `gridRef.update({ columns: [0] })` | `grid.refresh()` (**F4**) |
| `extraElement` + four hand-written positioning declarations | `extraElement` + `whiteSpaceY: 24`; the declarations are av-grid's (**F5**) |
| `getContextMenuItems` → `AVGrid/model/ContextMenuModel` → `showAppPopupMenu` | `getContextMenuItems` + `onGridContextMenu={showGridContextMenu}` (C4-5) |
| `grid.data` + `grid.models.focus.focusCell()` in `revealRef` | `getVisibleRows()` / `getColumns()` / `focusCell()` (**F6**) |
| Emotion in `GitTree.tsx`, `BranchTreeCell.tsx`, `SideSelectToggle.tsx`, `RefBadge.tsx` | one `GitTree.css` in `@layer app` (**D4**) |

### The change that makes this task small

`uikit/AVGrid`'s `cellRenderer` **replaced the whole cell element**. That is why
`BranchTreeCell` and `makeSideSelectCell` each apply `props.style` (the absolute box), forward
`props.className` (so the row-selected / row-hovered overlays still land), and paint their own
background, bottom border and right border.

av-grid's `render` hook supplies cell **content**, inside the library's own pooled
`.avg-data-cell` (`av-grid/src/view/DataCell.ts:194-206`). The cell keeps its class, its
`::before` selection tint and `::after` hover tint (`av-grid/src/styles/av-grid.css.ts:244-263`),
its borders and its `overflow: hidden`. So all of that chrome is **deleted, not ported** — and a
custom cell now highlights and tints identically to a text cell for free.

## Decisions

### D1 — the grid owns the columns; `GitTreeState` disappears entirely

Under the React grid, `columns` had to be state: resize and reorder came back up through
`setColumns(updater)` and only what came back down was rendered. Under av-grid the grid holds the
live array (`AVGrid.ts:409-411` — `getColumns()` returns `model.options.columns`, the real
reference), and nothing in the component renders off `columns` except the grid itself. A host copy
would be a second source of truth needing a re-sync on every pointermove of a resize drag.

Columns are also **safe to hold frozen**, unlike rows (US-1020 D1): av-grid never mutates a column
object or the column array in place — resize maps to `{ ...c, width }`, reorder does
`[...columns]` + splice, `updateColumnsData` filters into a new array, and
`validate.ts:380-407` copies rather than writing through. But *legal* is not a reason, and this
grid is not editable, so the row-freeze problem never arises either way.

So `GitTreeState`, `GitTreeViewModel`, `setColumns`, `setFocus` and `handleColumnsChange` are all
deleted. What survives is non-reactive:

- the initial column array, built once at mount and never re-pushed (**F7**);
- two comparison refs, `builtStructureKey` and `previousMaxColumns`, which already exist;
- the grid handle.

`GitTree` becomes a React component with **no state at all** — props in, imperative calls out,
which is both what a thin wrapper around an imperative grid should be and the shape Epic D/E will
convert to a vanilla view.

### D2 — the swimlane cell returns an HTML string, and the string's formatting is a performance contract

`DataCell.ts:194-206` is asymmetric. The string branch is guarded:

```ts
} else if (typeof rendered === "string") {
    setMode(el, "html");
    if (el.innerHTML !== rendered) el.innerHTML = rendered;
} else {
    setMode(el, "node");
    el.textContent = "";
    el.appendChild(rendered);
}
```

The element branch has **no guard at all** — it tears down and rebuilds the subtree on every
repaint that touches the cell. And `CellContext` does not hand the renderer the cell element, so a
renderer cannot memoize on its own.

That matters because of what actually triggers a re-render. `render` does **not** run for every
visible cell on every paint: `renderInfo.ts:357-390` calls it only when a coordinate has no
previous element, or when the dirty set names the cell, its row or its column. A hover move dirties
exactly two rows (`GridInteractions.ts:788-800`); a selection change dirties the affected cells;
only `refresh()` is all-cells. The graph's content is a pure function of its row, so on a hover
move or a selection change the string is *identical* — and the guard turns that repaint into 24
string comparisons and zero DOM work. The element form would tear down and rebuild 24 SVG subtrees
instead.

The guard hits only if the string round-trips through the HTML parser and serializer byte for byte.
Verified against the same fragment-parse/serialize algorithms Chromium implements:

| Markup | Round-trip |
|---|---|
| `<path d="…" fill="none" stroke="#f00" stroke-width="1.5"></path>` | **identical** |
| `<path … />` (self-closed) | **differs** — the serializer emits `></path>` |
| `viewbox="…"` (lowercase) | **differs** — the parser adjusts it to `viewBox` |

So the renderer must use explicit closing tags (never `/>`), double-quoted values, correct SVG
attribute casing (`viewBox`), dashed property names (`stroke-width`, not React's `strokeWidth`), a
stable attribute order, and no character that gets escaped on the way out. Everything interpolated
is a number from `swimlane-layout.ts` or a palette hex, so nothing escapes. **This looks like
formatting style and is actually the performance contract — say so in a comment.**

Step 8 removes the dependence on serializer fidelity upstream.

### D3 — the L/R toggles are a string plus delegation, never an element with listeners

Same guard asymmetry, with a sharper consequence: `SideSelectToggle` renders real `<button>`s, so
under the element branch a repaint that dirties the row detaches the button and throws keyboard
focus to `<body>`. Move the mouse one row and the focused toggle is gone.

This is also the library's own answer to its own version of the problem. `DataCell.ts:52-55` emits
its boolean checkbox as `<span class="avg-bool-box" data-type="bool-toggle">` and the comment says
why: *"`data-type` is what `GridInteractions` resolves the click by; the element carries no
listener of its own, because it is pooled."* The file header states it as a rule — **"No
listeners. The root delegates."** — and `GridInteractions.ts:1-14` explains that per-cell
listeners in a pooled grid are *"not merely slower, [they are] unsound: an element that was a
header cell on one frame is a data cell on the next"*.

So the cell emits `<span class="git-side-toggle" data-side="left" …>` and the click is resolved in
`onCellClick`. Three things fall out:

- **Non-focusable `<span role="button">`, not `<button>`.** `GridInteractions.focusRoot`
  (lines 179-189) deliberately declines to take focus when a press lands inside
  `input, textarea, select, button, a, [contenteditable]`, so a real button would steal focus from
  the grid root and kill arrow-key navigation until the user clicked a cell again. The React
  version has that wart; this is an improvement, not a regression.
- **Half the row-click suppression is already free.** The column stays `isStatusColumn: true`, and
  `onCellPointerDown` returns early for a status column (`GridInteractions.ts:279-282`): no focus
  move, no range drag, no `preventDefault`. Only the host's own commit-selection needs gating.
- **`stopPropagation` is useless here and must not be written.** The listener that calls
  `onCellClick` *is* the root's delegated click handler, and `onCellClick` is its **last**
  statement (`GridInteractions.ts:653`) — there is no av-grid work left to cancel. Suppression is a
  `return` in our own callback.

Keep the markup independent of hover and focus state, so the `innerHTML !== rendered` guard keeps
hitting.

### D4 — the cell styling moves to one `GitTree.css` in `@layer app`

These cells are now strings, so Emotion cannot style them. A CSS file is the established form for
a converted view; the new thing is the layer. `@layer app` (the order is
`base, uikit, app, editor` — `theme/style-layers.css:6`) outranks av-grid's `@layer uikit`
regardless of specificity, which is exactly what a rule aimed at `.avg-data-cell` needs. The
selectors key off the `data-column-key` attribute `DataCell.ts:170` already writes for free.

Four rules are load-bearing rather than cosmetic:

- **`padding: 0` on the graph cell.** `.avg-data-cell` has `padding: 0 var(--avg-cell-padding-x)`,
  defaulting to 4px, which would shift every lane 4px right and misalign the graph from `laneX()`.
  (It is not a clipping problem — `overflow` clips at the padding box.)
- **`align-items: flex-start` on the graph cell.** The cell is `border-box` with a 1px bottom
  border, so a 24px row has a 23px content box; a 24px SVG centred in 23px puts `cy=12` at
  y≈11.5 and blurs the node ring. The old `CellRoot` was a block container, so the SVG sat at the
  top and the last pixel went under the border — `flex-start` reproduces that exactly.
- **`flex: 0 0 auto` on the SVG.** `.avg-data-cell` is `inline-flex`, so the SVG is a flex item;
  without this it shrinks to fit a narrowed column and the `viewBox` rescales the graph. This is
  the same hazard the React code pinned `flexShrink: 0` for, now against a different outer box.
  Clipping needs nothing added — `.avg-data-cell` is already `overflow: hidden`.
- **The chips must not shrink and the subject must.** `flex-shrink: 0` on `.git-ref-badge`,
  `overflow: hidden; text-overflow: ellipsis; min-width: 0` on the subject text.

**Do not position a rendered element absolutely.** See **F8** — the epic says otherwise and the
epic is wrong.

### D5 — `RefBadge`'s chip styling becomes a shared class

The subject cell needs a DOM chip; `CommitInfoPanel.tsx:78` still needs the React one. Rather than
two definitions of the same chip, the styling moves to `.git-ref-badge` in `GitTree.css` and the
React `RefBadge` renders `<span className="git-ref-badge" style={{ color }}>`. One definition, and
one fewer Emotion importer.

The per-kind colour stays an inline `style`, as it is today: `REF_COLOR` values are palette hex
from `TAG_COLORS`, not CSS custom properties, so a stylesheet cannot reference them without
hardcoding a colour. The same reasoning applies to the HEAD short-hash colour, which is why the
hash column keeps a `render` rather than becoming a `cellClass`.

### D6 — `SideSelectToggle.tsx` is deleted

Its only consumer is `makeSideSelectCell`. Nothing outside `components/git-tree/` imports it (the
barrel exports it; no file uses it), and its DOM form is D3's string. Deleting it is this task's
work, not US-1023's.

## Findings

Numbered for the epic note. F1-F7 came out of planning; F8 corrects a decision.

### F1 — `onColumnResize` / `onColumnsReorder` fire only for user actions, so the emit guard disappears

Traced end to end:

- A user resize sends the internal event on **every pointermove** (`GridInteractions.ts:228-240`).
  `ColumnsModel.onColumnResize` (`:104-119`) drops sub-minimum widths, calls `updateColumns` —
  which is `setColumns`, which fires `onColumnsChange` at `:65` — and *then* calls
  `options.onColumnResize` at `:118`. So the order is **`onColumnsChange` first, `onColumnResize`
  second**, and at both moments `getColumns()` already returns the updated array.
- A reorder is the same shape, once per drop (`:121-155`, host callback at `:154`).
- A programmatic `grid.setColumns()` fires **`onColumnsChange` only**. `onColumnResize` and
  `onColumnsReorder` are reachable exclusively from the two internal events, and
  `GridInteractions` is their only sender (`:236`, `:845`).

So wiring `onColumnLayoutChange` to those two callbacks satisfies "programmatic rebuilds must not
emit" **structurally**, with no suppression flag. `handleColumnsChange` and its comment exist only
because the React grid conflated the two paths, and both go.

Consequence to handle: because resize fires per pointermove, a naive wiring writes the editor's
persisted descriptor state dozens of times per drag. The emission is trailing-debounced (150 ms);
reorder emits immediately.

### F2 — `selected` is initial-only in the shim, so `selectedHash` must become an imperative call

`DataGridView.ts` lists `selected` in `INITIAL_ONLY_KEYS`: av-grid takes it as an initial value and
owns the selection afterwards, so re-pushing it would fight the user's clicks. Passing
`selectedHash` as a prop would therefore highlight the *first* selected commit and then silently
stop updating. It becomes `grid.setSelected(...)` in an effect.

The highlight itself works exactly as before: `SelectedModel.rowClass` appends `avg-row-selected`
(`SelectedModel.ts:91-98`) and `av-grid.css.ts:252-255` paints it with `--avg-selection-bg`. No
`selectColumn` is needed — the checkbox column is a separate option this grid does not set.

### F3 — two of the four `cellFormater`s are deletions, not ports

`authorFormatter` and `dateFormatter` exist only to wrap a plain string in `<TruncatedText>` for
ellipsis. av-grid's default cell already shows `row[key]` and already ellipsizes, and the date
column already has the `formatValue` that feeds display, copy, search and filter alike. So both
hooks are deleted and the columns become plain declarations.

### F4 — `refresh()` is the right call for the L/R repaint, and a scoped repaint is not a gap

The React grid had `update({ columns: [0] })`. av-grid's public façade exposes only `refresh()`,
and C4-10 forbids reaching into `grid.model`.

Measured against the compact side-select layout (4 columns, ~24 rows): `refresh()` runs
`renderDataCell` ~100 times where a scoped repaint would run it 24. No cells enter or leave, so
`RenderGrid.syncRegion` does zero insertions or removals — same element identities in and out — and
the two guards (`if (el.className !== className)`, `if (el.innerHTML !== rendered)`) make the
unchanged columns nearly free. One coalesced microtask, one rAF paint, well under a millisecond.
An open editor is safe too (`DataCell.ts:173-186` only re-parents `if (editor.parentElement !== el)`).

Frequency: `selectionKey` changes when the user picks a diff side — a click, at human rates.

So this is ~4× the minimum work on a sub-millisecond click-driven path. Not a gap. The threshold
for upstreaming would be a *continuous* driver — a ticking indicator, a progress column,
hover-driven content — or a viewport large enough to jank; and the right shape would then be a
scope argument on the existing method (`refresh({ columns })`), not an exposure of `model`.

### F5 — the footer's four positioning declarations are av-grid's, and it needs `whiteSpaceY`

`LoadMoreRow` hand-writes `position: absolute; left: 0; right: 0; bottom: 0` with a comment
explaining that it copies the add-row button's trick. `av-grid.css.ts:504-509` gives `.avg-extra`
exactly those four declarations, so they are deleted (this is what US-1019's review predicted).

The footer is `GIT_TREE_ROW_HEIGHT` (24px) tall against a default trailing slack of 20px, so it
would overlap the last row. It gets `whiteSpaceY: 24`. Today that overlap is hidden by the opaque
background rather than avoided.

`extraElement` is also the one place a **real listener is correct**: av-grid documents that it
*"parents it and nothing else — it is never inspected, cleared, restyled beyond the `avg-extra`
class, or destroyed"* (`options.d.ts:212-241`). It is an overlay, not a pooled cell.

### F6 — `revealRef`'s column index basis changes, and happens to coincide

`grid.getColumns()` returns the *declared* array (`options.columns`, hidden columns included),
while `focusCell(rowIndex, colIndex)` indexes the **displayed** columns (`data.columns` — hidden
ones filtered out, the checkbox column prepended when enabled: `FocusModel.ts:278`,
`ColumnsModel.ts:89-102`). For this grid the two coincide: no column is ever `hidden` and
`selectColumn` is never set. `revealRef` is also only reachable from the whole-repo editor, which
has neither the side-select column nor a compact layout. Worth a comment, because the coincidence
is not a guarantee.

Row indices are the displayed ones, so `getVisibleRows()` is the right source.

### F7 — both odd columns pass validation, and validation will not catch a typo here anyway

`validateColumns` computes `computed = Boolean(col.render || col.formatValue || col.isStatusColumn)`
(`validate.ts:345`) and only runs the unknown-key check when `!computed`. The `graph` column has a
`render` *and* a `formatValue`; `--side-select--` has all three. Both pass unconditionally.

Two related facts:

- The check is skipped entirely when the row sample is empty (`hasSample`, `validate.ts:316`), and
  this grid routinely mounts with zero commits. So a key typo in `buildColumns` will not be caught
  by the library — unlike in `editors/grid`, where US-1020 leaned on exactly that throw.
- `setColumns` validates against the rows the grid holds *at that moment*, and `setOptions` applies
  columns before rows (`AVGrid.ts:844-845`). Irrelevant here — `GitCommitRow`'s shape is constant —
  but the safe habit for a structural rebuild is `setColumns` then `setRows`, never the reverse.

Also: `GitTree.tsx` sets `resizible: true` on four columns. av-grid spells it `resizable`
(`types.ts:8` documents the rename), and `HeaderCell.ts:98` treats `undefined` as resizable — so
the typo is silent dead weight rather than a bug. Same class of thing US-1020 fixed in
`grid-utils.ts`.

### F8 — C4-6's absolute-positioning requirement is wrong for `render`, and the story teaches it

The epic's C4-6 states, and its Verification section repeats as one of two generalising checks:

> **the stylesheet must position the returned element absolutely** — the engine writes `top` and
> `left` and nothing writes `position`. A cell that lays out in flow looks right at the top of the
> list and leaves an empty band below it.

That is true of the **React** grid, where `cellRenderer` *replaced* the cell and therefore received
the absolute box. It is false for av-grid's `render`: `applyCellStyle` writes `top`/`left` on the
pooled `.avg-data-cell` (`DataCell.ts:251`), and the rendered node is that cell's **child**. It
needs no positioning.

Positioning it is actively harmful: it would move the content out of flow into the positioned paint
step, *after* `.avg-data-cell::before` (`av-grid.css.ts:244-263`), so the graph would paint **over**
the hover and selection tints while the rest of the row painted under them — and the node's
background-coloured ring would stop working. Keeping the SVG in flow is what makes the translucent
overlays tint the graph and the ring together, exactly like a text cell.

`uikit/DataGrid/DataGrid.story.tsx:65-80` documents the false rule in a doc-comment and sets
`el.style.position = "absolute"` in `renderRatioBar` on the strength of it. Since the claim would
mislead US-1022 and US-1023 both, this task fixes the story and amends the epic.

## Implementation plan

### Step 1 — `src/renderer/components/git-tree/GitTree.css` (new)

```css
@layer app {
    /* The graph cell. `padding: 0` because the lane arithmetic in `laneX()` measures from the
       cell's own left edge, and av-grid's 4px cell padding would shift every lane. `flex-start`
       because a 24px row has a 23px content box (1px bottom border, border-box), and centring a
       24px SVG in it lands the node's centre on a half-pixel. */
    .avg-grid .avg-data-cell[data-column-key="graph"] {
        padding: 0;
        align-items: flex-start;
    }

    /* `.avg-data-cell` is inline-flex, so the SVG is a flex item: without this it shrinks to fit a
       narrowed column and the viewBox rescales the graph. Pinned, it overflows at constant size
       and the cell's own `overflow: hidden` slides the clip edge instead (EPIC-030 Concern 9).
       Deliberately NOT positioned — see US-1021 F8. */
    .avg-grid .avg-data-cell[data-column-key="graph"] > svg {
        display: block;
        flex: 0 0 auto;
    }

    /* The ring that separates the node from the row behind it. `--avg-cell-bg` and NOT
       `--color-grid-data-bg`: av-grid paints its cells from its own token, which resolves
       `--avg-cell-bg -> --avg-bg -> var(--p-bg) -> --color-bg-default`. The two are the same hex
       in all ten themes today, so stroking the wrong one is invisible — until someone re-tints
       grid rows. A class rather than an attribute because `var()` is not valid in an SVG
       presentation attribute. */
    .avg-grid .avg-data-cell[data-column-key="graph"] .git-graph-node {
        stroke: var(--avg-cell-bg);
    }

    /* Decoration chips + the subject text they share a cell with. The chips keep their size and
       the subject absorbs the shrink — the same division of labour the React cell got from
       `flexShrink: 0` plus `<TruncatedText>`. */
    .git-ref-badge {
        display: inline-block;
        flex-shrink: 0;
        margin-right: var(--spacing-sm, 4px);
        padding: 0 var(--spacing-sm, 4px);
        border: 1px solid var(--color-border-default);
        border-radius: var(--radius-xs, 2px);
        font-size: var(--font-xs, 11px);
        font-weight: 600;
    }

    .avg-grid .avg-data-cell .git-subject-text {
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }

    /* Synthetic endpoint rows (Unstaged/Staged) read as special rows, not commits (US-618). */
    .avg-grid .avg-data-cell .git-special-subject {
        font-style: italic;
        color: var(--color-text-light);
    }

    /* The L/R side-select toggles. Spans rather than buttons, and no listeners: av-grid's cells
       are pooled and the root delegates (US-1021 D3). */
    .avg-grid .avg-data-cell[data-column-key="--side-select--"] {
        justify-content: center;
    }

    .git-side-select {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-xs, 2px);
    }

    .git-side-toggle,
    .git-side-spacer {
        width: 20px;
        height: 18px;
        flex-shrink: 0;
    }

    .git-side-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border-default);
        border-radius: var(--radius-xs, 2px);
        color: var(--color-text-light);
        font-size: var(--font-xs, 11px);
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        user-select: none;
    }

    .git-side-toggle:hover:not([data-active]) {
        color: var(--color-text-default);
    }

    .git-side-toggle[data-active] {
        background: var(--color-bg-selection);
        color: var(--color-text-selection);
        border-color: var(--color-bg-selection);
    }

    /* The "Load more" footer. av-grid's `.avg-extra` already supplies
       `position: absolute; left: 0; right: 0; bottom: 0` (US-1021 F5), so only the band's own
       look belongs here. */
    .git-tree-load-more {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-md, 8px);
        height: 24px;
        background: var(--color-bg-default);
        font-size: var(--font-sm, 12px);
        user-select: none;
    }

    .git-tree-load-more-link {
        cursor: pointer;
        color: var(--color-text-default);
    }

    .git-tree-load-more-link:hover {
        text-decoration: underline;
    }

    .git-tree-load-more-link[data-disabled] {
        opacity: 0.6;
        cursor: default;
        text-decoration: none;
    }

    .git-tree-load-more-sep {
        color: var(--color-text-light);
    }
}
```

Check each `var(--spacing-*)` / `var(--font-*)` / `var(--radius-*)` name against an existing uikit
CSS file before writing it (`uikit/Button/Button.css` is the reference for the fallback form); use
the literal fallbacks the tokens carry so the rule holds if a name is absent.

### Step 2 — `BranchTreeCell.tsx` → `branch-tree-cell.ts`

Rename (it is no longer a React component; the folder's non-component modules are
`swimlane-layout.ts`, `git-refs-tree.ts`, `git-date.ts`). Keep `GIT_TREE_ROW_HEIGHT`, `LANE_WIDTH`,
`LANE_PAD`, `graphWidth`, `laneX`, `edgePath` and the geometry constants exactly as they are. Drop
`React`, `styled`, `clsx`, `CellRoot` and the `color` import.

```ts
/**
 * Build the swimlane renderer for a fixed lane count.
 *
 * Returns an HTML **string**, and the formatting is a performance contract rather than a style
 * choice (US-1021 D2). av-grid's string path is guarded — `if (el.innerHTML !== rendered)` — but
 * the comparison reads `innerHTML` back, which re-serializes the parsed subtree. It matches only
 * if what we wrote is what the serializer emits: explicit closing tags (never `/>`),
 * double-quoted values, `viewBox` cased exactly so, dashed property names, stable attribute
 * order. Get any of that wrong and the graph column re-parses on every hover move for nothing.
 * The element path has no guard at all, which is why this is a string.
 */
export function makeBranchTreeCell(maxColumns: number): CellRenderer<GitCommitRow> {
    const width = graphWidth(maxColumns);
    const head =
        `<svg width="${width}" height="${GIT_TREE_ROW_HEIGHT}" ` +
        `viewBox="0 0 ${width} ${GIT_TREE_ROW_HEIGHT}">`;

    return (cell) => {
        const row = cell.row;
        if (!row) return "";
        const { node, edges } = row;
        let out = head;
        for (const e of edges) {
            const x1 = e.fromColumn === -1 ? laneX(node.column) : laneX(e.fromColumn);
            const y1 = e.fromColumn === -1 ? MID : TOP;
            const x2 = e.toColumn === -1 ? laneX(node.column) : laneX(e.toColumn);
            const y2 = e.toColumn === -1 ? MID : BOTTOM;
            out +=
                `<path d="${edgePath(x1, y1, x2, y2)}" fill="none" ` +
                `stroke="${e.color}" stroke-width="1.5"></path>`;
        }
        out +=
            `<circle class="git-graph-node" cx="${laneX(node.column)}" cy="${MID}" ` +
            `r="${NODE_R}" fill="${node.color}" stroke-width="1"></circle>`;
        return `${out}</svg>`;
    };
}
```

Notes:

- The ring's `stroke` is **not** in the markup — `var()` is invalid in an SVG presentation
  attribute (a presentation attribute is parsed against the property's grammar at attribute-parse
  time, with no custom-property substitution), so it comes from the `.git-graph-node` rule in
  Step 1. If it ever has to be inline, the form is `style="stroke:var(--avg-cell-bg)"`, never
  `stroke="var(…)"`.
- `e.color` / `node.color` stay plain presentation attributes: they are literal palette hex from
  `swimlane-layout.ts`. They land inside an `innerHTML` assignment, so they must stay
  palette-sourced — a value containing a quote would both break the round-trip and be an injection
  surface.
- The `<svg>` open tag is hoisted out of the per-row closure since it depends only on `maxColumns`.

### Step 3 — `src/renderer/components/git-tree/side-select-cell.ts` (new); delete `SideSelectToggle.tsx`

```ts
export const SIDE_SELECT_KEY = "--side-select--";

export function makeSideSelectCell(
    ref: RefObject<GitTreeSideSelect | undefined>,
): CellRenderer<GitCommitRow> { … }

/** Resolve a click inside the L/R cell. Returns true when a toggle handled it. */
export function handleSideSelectClick(
    target: EventTarget | null,
    row: GitCommitRow,
    sideSelect: GitTreeSideSelect | undefined,
): boolean { … }
```

The renderer emits, with a stable attribute order and no hover/focus state in the markup (so the
`innerHTML` guard keeps hitting):

```
<span class="git-side-select"><span class="git-side-toggle" data-side="left" role="button"
title="Compare on the left (from)" data-active="true">L</span><span class="git-side-toggle"
data-side="right" role="button" title="Compare on the right (to)">R</span></span>
```

`data-active` is present or absent, never `="false"` — matching today's
`data-active={leftActive || undefined}`. When `showLeft(row)` is false the L toggle is replaced by
`<span class="git-side-spacer"></span>`, keeping the R glyph column-aligned with the commit rows
(US-618). `title` gives the two toggles a native tooltip; they are 20px glyphs, so this is the one
place a native `title` is right.

`handleSideSelectClick` does `(target as Element | null)?.closest?.("[data-side]")` and dispatches
on the attribute. Note the soft-failure property: if the span were ever replaced before the click
resolved, the browser retargets to the surviving `.avg-data-cell`, so the *row-click suppression*
still holds and only the L-vs-R decision is lost — it can never fire the wrong side.

### Step 4 — `GitTree.tsx`

Delete: `styled`, `clsx`, the `AVGrid`/`AVGridModel` imports, `GitTreeState`,
`GitTreeViewModelProps`, `GitTreeViewModel`, `LoadMoreRow`/`LoadMoreLink`/`LoadMoreSep`, `rowOf`,
`SpecialSubject`, `HeadHash`, `SideSelectCellRoot`, `makeSideSelectCell`, `subjectFormatter`,
`authorFormatter`, `dateFormatter`, `hashFormatter`, `handleColumnsChange`, and the `selected`
`useMemo`.

Keep unchanged: `GitTreeSideSelect`, `GitColumnLayout`, `GitTreeProps` (identical — no consumer
changes), `rows`/`maxColumns` `useMemo`s, `sideSelectRef`, `structureKey`, `applyLayout`,
`refitGraphColumn`.

**Columns.**

```ts
const renderSubject = (cell: CellContext<GitCommitRow>): string => {
    const r = cell.row;
    if (r.recordType !== "commit") {
        return `<span class="git-special-subject">${cell.highlight(r.subject)}</span>`;
    }
    let out = "";
    for (const ref of r.refs) {
        out +=
            `<span class="git-ref-badge" style="color:${REF_COLOR[ref.kind]}">` +
            `${cell.highlight(ref.name)}</span>`;
    }
    return `${out}<span class="git-subject-text">${cell.highlight(r.subject)}</span>`;
};

// The HEAD commit's short hash reads green so the active commit stays marked even when HEAD is
// detached and carries no branch label (US-636). A `render` rather than a `cellClass` because
// `REF_COLOR.head` is palette hex, not a CSS custom property, so a stylesheet cannot name it
// without hardcoding a colour.
const renderHash = (cell: CellContext<GitCommitRow>): string => {
    const r = cell.row;
    const text = `<span class="git-subject-text">${cell.highlight(r.shortHash)}</span>`;
    const isHead = r.recordType === "commit" && r.refs.some((ref) => ref.kind === "head");
    return isHead ? `<span style="color:${REF_COLOR.head}">${text}</span>` : text;
};

function buildColumns(
    maxColumns: number,
    compact: boolean,
    sideSelectCell?: CellRenderer<GitCommitRow>,
): Column<GitCommitRow>[] {
    const subject: Column<GitCommitRow> = {
        key: "subject", name: "Comment", width: compact ? 240 : 360,
        resizable: true, render: renderSubject,
    };
    const hash: Column<GitCommitRow> = {
        key: "shortHash", name: "Commit", width: 80, resizable: true, render: renderHash,
    };
    const date: Column<GitCommitRow> = {
        key: "authorDate", name: "Date", width: compact ? 94 : 160, resizable: true,
        formatValue: (_c, r) => dateText(r.authorDate),
    };
    if (compact) {
        const cols: Column<GitCommitRow>[] = [date, subject, hash];
        if (sideSelectCell) {
            cols.unshift({
                key: SIDE_SELECT_KEY, name: "", width: 56,
                isStatusColumn: true, render: sideSelectCell, formatValue: () => "",
            });
        }
        return cols;
    }
    const graph: Column<GitCommitRow> = {
        key: "graph", name: "", width: graphWidth(maxColumns), resizable: true,
        render: makeBranchTreeCell(maxColumns), formatValue: () => "",
    };
    return [
        graph, subject,
        { key: "authorName", name: "Author", width: 140, resizable: true },
        date, hash,
    ];
}
```

`resizible` → `resizable` throughout (F7). `authorName` loses its hook entirely (F3).
`refitGraphColumn` swaps `render` where it swapped `cellRenderer`.

**`applyLayout` gains a status-column guard.** av-grid lets a normal column be *dropped* ahead of
a status column even though status headers cannot be dragged
(`HeaderCell.ts:101` sets `draggable = !column.isStatusColumn`, but `onDragOver`/`onDrop` do not
exclude them as targets), which would make `lastIsStatusIndex` compute a `stickyLeft` spanning a
non-status column. A persisted layout would faithfully restore that. So after ordering, hoist any
`isStatusColumn` columns back to the front, preserving their relative order.

**The component.**

```tsx
export function GitTree(props: GitTreeProps) {
    const { name, model, selectedHash, onSelectCommit, compact = false, sideSelect,
            leadingRows, initialColumnLayout, onColumnLayoutChange, getContextMenuItems } = props;

    const { commits, loadingMore, hasMore } = model.state.use((s) => ({ … }));
    const rows = useMemo(…);                       // unchanged
    const maxColumns = useMemo(…);                 // unchanged
    const sideSelectRef = useRef(sideSelect);
    sideSelectRef.current = sideSelect;
    const hasSideSelect = !!sideSelect;
    const sideSelectCell = useMemo(
        () => (hasSideSelect ? makeSideSelectCell(sideSelectRef) : undefined),
        [hasSideSelect],
    );

    const gridRef = useRef<DataGridInstance<GitCommitRow>>(undefined);

    // The grid owns the columns from here on (US-1021 D1), so this array is built ONCE and its
    // identity never changes — `DataGridView` diffs value props by identity, so a new `columns`
    // identity would push `setOptions({ columns })` and clobber the user's widths. Structural
    // rebuilds and the graph re-fit go through `grid.setColumns()` instead.
    const initialColumns = useRef<Column<GitCommitRow>[]>(undefined);
    if (!initialColumns.current) {
        initialColumns.current = applyLayout(
            buildColumns(maxColumns, compact, sideSelectCell), initialColumnLayout,
        );
    }

    const structureKey = `${compact}|${hasSideSelect}`;
    const builtStructureKey = useRef(structureKey);
    const previousMaxColumns = useRef(maxColumns);
    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const structureChanged = builtStructureKey.current !== structureKey;
        const maxColumnsChanged = previousMaxColumns.current !== maxColumns;
        builtStructureKey.current = structureKey;
        previousMaxColumns.current = maxColumns;
        if (structureChanged) {
            grid.setColumns(buildColumns(maxColumns, compact, sideSelectCell));
        } else if (maxColumnsChanged && !compact) {
            grid.setColumns(refitGraphColumn(grid.getColumns(), maxColumns));
        }
    }, [structureKey, maxColumns, compact, sideSelectCell]);
```

The `queueMicrotask` hop and its staleness re-check both go: there is no `setState` to loop back
through render, so the call is synchronous (F1/D1).

```tsx
    // `selected` is initial-only in the shim, so the highlight is imperative (US-1021 F2).
    useEffect(() => {
        gridRef.current?.setSelected(selectedHash ? [selectedHash] : []);
    }, [selectedHash]);

    // Repaint the L/R glyphs when the diff's from/to moves. `refresh()` rather than a scoped
    // repaint — ~100 cells, no DOM insertions, once per click (US-1021 F4).
    useEffect(() => {
        if (hasSideSelect) gridRef.current?.refresh();
    }, [hasSideSelect, sideSelect?.selectionKey]);
```

Column-layout reporting, debounced for resize only (F1) — with the timer cleared on unmount:

```tsx
    const emitLayout = useCallback(() => {
        const grid = gridRef.current;
        if (!grid || !onColumnLayoutChange) return;
        onColumnLayoutChange(
            grid.getColumns().map((c) => ({
                key: String(c.key),
                width: c.width ?? defaultColumnWidth,
            })),
        );
    }, [onColumnLayoutChange]);
```

`onColumnResize` schedules `emitLayout` on a 150 ms trailing timer; `onColumnsReorder` calls it
directly. Both read `getColumns()`, which is already updated when either fires (F1).

Row click and toggle click, in one callback (D3):

```tsx
    const onCellClick = useCallback(
        (cell: CellContext<GitCommitRow>, e: MouseEvent) => {
            if (String(cell.column.key) === SIDE_SELECT_KEY) {
                handleSideSelectClick(e.target, cell.row, sideSelectRef.current);
                return;   // never selects the commit — and NOT stopPropagation, see D3
            }
            onSelectCommit?.(cell.row.hash);
        },
        [onSelectCommit],
    );
```

The footer, built once and mutated in place (F5):

```tsx
    const footer = useMemo(
        () => createLoadMoreFooter({
            onLoadMore: () => void model.loadMore(),
            onLoadAll: () => void model.loadAll(),
        }),
        [model],
    );
    useEffect(() => footer.setLoading(loadingMore), [footer, loadingMore]);
    useEffect(() => () => footer.dispose(), [footer]);
```

And the render:

```tsx
    return (
        <DataGrid<GitCommitRow>
            name={name}
            onGrid={onGrid}
            columns={initialColumns.current}
            rows={rows}
            getRowKey={getRowKey}
            rowHeight={GIT_TREE_ROW_HEIGHT}
            disableSorting
            disableFiltering
            extraElement={hasMore ? footer.element : null}
            whiteSpaceY={hasMore ? GIT_TREE_ROW_HEIGHT : undefined}
            onCellClick={onCellClick}
            onColumnResize={scheduleEmitLayout}
            onColumnsReorder={emitLayout}
            getContextMenuItems={gridMenuItems}
            onGridContextMenu={showGridContextMenu}
        />
    );
```

`onGrid` sets `gridRef.current`, calls `model.setGrid(grid ?? undefined)`, and on mount applies the
initial selection (`setSelected`) so a `selectedHash` present at mount is not lost — the effect
above runs after `onGrid`, but on a later `model` identity change only `onGrid` fires.

`gridMenuItems` is `undefined` when the prop is absent, so av-grid's own menu is not
suppressed for the popovers; when present it is

```ts
(e: GridContextMenuEvent<GitCommitRow>) =>
    e.target === "cell" ? getContextMenuItems?.(e.selection?.rows ?? []) ?? [] : []
```

which reproduces the React `ContextMenuModel`'s `isDataCell` gate. `showGridContextMenu` is passed
unconditionally — the React grid showed Copy / Copy as… on every data cell in every `GitTree`
instance (`AVGrid/model/ContextMenuModel.tsx`), so this matches, and it is where Rule 6 closes for
this consumer (C4-5).

### Step 5 — `src/renderer/components/git-tree/load-more-footer.ts` (new)

```ts
export interface LoadMoreFooter {
    readonly element: HTMLElement;
    setLoading(loading: boolean): void;
    dispose(): void;
}

export function createLoadMoreFooter(handlers: {
    onLoadMore(): void;
    onLoadAll(): void;
}): LoadMoreFooter;
```

A `<div class="git-tree-load-more" data-type="git-tree-load-more">` holding either a disabled
`Loading…` span or the `Load more · Load all` pair. **Real listeners are correct here** — this is
an `extraElement`, which av-grid parents and otherwise never touches (F5) — but keep them on the
root and delegate by `data-action`, so `setLoading` can swap the children freely. `dispose()`
removes the listener.

### Step 6 — `GitTreeModel.ts`

`AVGridModel<GitCommitRow>` → `DataGridInstance<GitCommitRow>` (from `../../uikit/DataGrid`), and
`revealRef` onto the public façade:

```ts
    revealRef(refName: string, kind: GitRefNodeKind): void {
        const grid = this.grid;
        if (!grid) return;
        // Displayed rows, declared columns. `focusCell` indexes the *displayed* columns
        // (`data.columns`) while `getColumns()` returns the declared array — for this grid the
        // two coincide (no column is ever hidden, `selectColumn` is never set, and `revealRef`
        // is reachable only from the whole-repo editor, which has no side-select column).
        const rows = grid.getVisibleRows();
        const columns = grid.getColumns();
        if (!rows.length || !columns.length) return;
        let colIndex = columns.findIndex((c) => String(c.key) === "subject");
        if (colIndex < 0) colIndex = 0;
        const matchIdx = rows.findIndex(
            (r) => r.recordType === "commit" && r.refs.some((ref) => refMatches(ref, refName, kind)),
        );
        grid.focusCell(matchIdx >= 0 ? matchIdx : rows.length - 1, colIndex, true);
    }
```

`setGrid`'s signature changes type only. The doc comments naming "AVGrid" are reworded.

### Step 7 — `RefBadge.tsx`, `index.ts`, the story, and the stale story comment

- `RefBadge.tsx`: `Chip` (Emotion) → `<span className="git-ref-badge" style={{ color }}>`. `REF_COLOR`
  unchanged. Drop the `@emotion/styled`, `tokens` and `color` imports (D5). `CommitInfoPanel.tsx`
  needs no change, but its chips now depend on `GitTree.css` being loaded — import the CSS from
  `RefBadge.tsx` as well as from `GitTree.tsx`, since Vite dedupes and either entry may come first.
- `index.ts`: drop `SideSelectToggle` / `SideSelectToggleProps`; re-point `GIT_TREE_ROW_HEIGHT`,
  `LANE_WIDTH`, `graphWidth`, `makeBranchTreeCell` at `./branch-tree-cell`; add `SIDE_SELECT_KEY`.
- `GitTree.story.tsx`: add a `sideSelect` boolean prop wiring a local from/to pair, so the L/R
  column, the status-column pinning and the `refresh()` path are all exercisable — the Revisions
  panel is otherwise the only way to reach them.
- `uikit/DataGrid/DataGrid.story.tsx:65-80`: delete `el.style.position = "absolute"` and replace
  the doc-comment with the correct rule (F8). Check the story renders right afterwards — it has
  never been run.

### Step 8 — upstream: make av-grid's html-mode skip exact (av-grid 2.2.2)

D2's design leans on HTML serializer fidelity, which nothing in Persephone can test. av-grid
already solved this for the search-highlight path: `DataCell.ts:59` keeps a `marked` WeakMap of the
last markup assigned per element, with a comment saying it chose the map *precisely* because the
`innerHTML` getter re-serializes. The `"html"` mode should use the same mechanism.

Change in `C:\projects\av-grid\src\view\DataCell.ts`: extend the `marked` map (or add a sibling) to
the `column.render` string branch, clearing the entry in `setMode` when the mode changes, so the
comparison is against what was last assigned rather than against a re-serialization. Add tests
alongside the existing highlight ones, `npm run build`, full suite, `npm version patch`,
`git push --follow-tags`, then bump the exact pin in Persephone's `package.json` and record it
here — the C4-10 sequence US-1020 already ran.

This is an **optimisation, not a gap**: without it the graph column re-parses ~250 bytes × 24 cells
on repaints where nothing changed, which is sub-millisecond. It is worth doing because it removes
the only load-bearing dependency in this design on a detail we cannot verify from here, it deletes
D2's formatting discipline from the list of things a future editor can silently break, and it
benefits every `render`-string consumer including boards. **If it slips, US-1021 is still correct
and complete** — reorder it after Step 7 and land it separately.

### Step 9 — docs

- `doc/epics/EPIC-057.md`: amend **C4-6** (F8 — the absolute-positioning requirement does not apply
  to `render`, and following it is actively harmful), strike the matching item from the epic's
  Verification list, mark US-1021 **Implemented**, and append a note covering F1-F8.
- `doc/active-work.md`: update the US-1021 entry.
- File the cell-overflow tooltip as a new task (see Concern 1).

## Concerns / Open questions

1. **The truncation tooltip is gone app-wide, and it needs its own task.** The React `DataCell`
   wrapped every string cell in `<TruncatedText>` (`AVGrid/DataCell.tsx:101`) — ellipsis plus
   Persephone's tooltip with the full value on hover, measured on `mouseenter`. av-grid ellipsizes
   and sets no `title` and shows no tooltip (verified: `DataCell.ts` writes only `data-type`,
   `data-row`, `data-col`, `data-column-key`; `title` appears in the library only on header cells,
   `HeaderCell.ts:118`). So **US-1020 has already shipped this regression** in the JSON/CSV grid
   editor, unnoticed, and US-1021 ships it for the git tree.

   The resolution is a single delegated helper on the host side — one `pointerover` listener that
   measures the *one* hovered cell (`scrollWidth > clientWidth + 1`) and shows Persephone's own
   tooltip with `cell.textContent` — wired once in `uikit/DataGrid/DataGridView.ts`, the seam every
   consumer passes through. This is not a workaround under C4-10: nothing is missing from the
   library (it supplies the ellipsis, the delegated-hover architecture, the *publicly documented*
   cell attributes — `av-grid/docs/api.md:1688-1707`, `docs/invariants.md:72` — and the complete
   display string is always in the text node, clipped purely in CSS). What must be added is
   Persephone's tooltip component, its 800 ms delay, its theme and its coordination with
   `overlayRegistry`/`tooltipRegistry`, none of which can exist in a framework-free published grid.
   That is `grid-context-menu.tsx` verbatim, and cleaner — `attachTooltip` is in `uikit/`, so there
   is no `ui/` reach-in.

   Upstreaming `title` was considered and rejected on its merits, not on cost: the cheap
   unconditional form is shipped precedent one file over, but on data cells it would pop an OS
   tooltip on nearly every cell the pointer crosses, would fire during a range-drag and under an
   open popover with nothing able to suppress it, and looks nothing like Persephone's tooltip. A
   `cellTitle?: boolean` is still worth offering upstream for consumers with no tooltip system of
   their own. And pooling makes the direction one-way: a host that *wrote* `title` onto cells from
   outside the paint would leak it to each element's next occupant, so anything host-side must be
   read-only — which a hover measurement is.

   One prerequisite: `TooltipAttachment` exposes only `update` and `dispose`; the internal `show()`
   (`attach-tooltip.ts:129`) is driven by a `mouseenter` listener bound at attach time, which has
   already fired by the time a `pointerover` helper attaches. Exposing `show()` is a two-line
   change — do not fabricate a synthetic `mouseenter`.

   **Filed as its own task, and it must land before US-1022** so `GridOutputView` and the rest
   inherit it instead of each needing a retrofit. It does not block US-1021.

2. **Two epic-level statements are wrong, and one of them is written into a story that teaches it.**
   F8. Amending C4-6 is Step 9; fixing `DataGrid.story.tsx` is Step 7. Worth flagging separately
   because the wrong version is the *intuitive* one — it was true of the grid being replaced — so it
   will be re-derived by anyone who does not read this.

3. **`onColumnResize` firing per pointermove is new information about an old shape.** The React path
   had the same per-move emission, so the debounce in Step 4 is an improvement rather than a fix for
   something this task breaks. It is called out because the emission lands in the editor's persisted
   descriptor state, and "persist on every pointermove of every drag" is worth not carrying forward.

4. **The graph column's `render` closes over `maxColumns`, so the re-fit must swap the function and
   not only the width.** `refitGraphColumn` already does both; the failure mode if it is ever
   reduced to a width change is a graph drawn at the old lane count inside a differently-sized
   cell, which looks like a clipping bug rather than a stale-closure bug.

5. **Nothing outside the folder addresses this DOM.** No `data-name` selector, no automation
   selector, no qa doc references `git-graph-cell`, `side-select-toggle` or
   `git-tree-load-more` (grepped across `src/`, `qa/`, `doc/`, `docs/`). The class names above are
   therefore free to change; the `data-type` attributes are kept anyway, per the UI-element
   contract.

## Acceptance criteria

Verified through the app and the story, not by inspection.

**The story** (`GitTree` in the storybook, both `compact` off and on, plus the new `sideSelect`
prop):

- [ ] The swimlane draws correctly for the synthetic DAG — the 2-parent merge, the octopus merge,
      the parallel lanes, the root commit.
- [ ] Narrowing the graph column **clips** the graph; it does not rescale it. Widening reveals more.
- [ ] The node ring reads as a clean circle at a **scroll offset**, not only at row 1 (F8's
      failure mode is a band of nothing below the first row; D4's is a half-pixel blur).
- [ ] Row hover and the selected-row tint cover the graph cell and the ref chips exactly as they
      cover a text cell — no cell paints over the overlay (F8).
- [ ] `sideSelect` on: L/R toggles render, the active side is accented, the column is pinned left
      and cannot be resized or dragged, and clicking a toggle does **not** also select the commit.
- [ ] Clicking a toggle repaints the other rows' toggles (the previous active side clears).

**The Git Tree editor** on a real repository:

- [ ] History loads; the graph, Comment, Author, Date and Commit columns all read correctly, and
      the HEAD commit's short hash is green.
- [ ] Resize and reorder columns, navigate away and back, then restart the app — widths and order
      survive both (the `onColumnResize`/`onColumnsReorder` → descriptor round-trip).
- [ ] A structural change still resets the layout deliberately, and **loading more commits does
      not** — the graph column re-fits to the new lane count while every other width and the user's
      column order stay put.
- [ ] "Load more" and "Load all" work; the footer sits in its own reserved band and does not
      overlap the last row (F5's `whiteSpaceY`).
- [ ] Right-click a commit: the app's own menu appears (not av-grid's `.avg-menu`), with the
      Switch-to-branch / Create-branch items above Copy / Copy as…, correct icons, and it is not
      immediately replaced by a bare Copy/Inspect menu (US-1020 F2's failure).
- [ ] Range-select across rows and ctrl+C — the graph and the L/R column copy as empty, the text
      columns copy their displayed text, the date copies formatted.
- [ ] Click a branch or tag in the "Branches & Tags" panel: `revealRef` focuses and scrolls to that
      commit's Comment cell; an unloaded tip focuses the last row instead.
- [ ] Switch theme with the grid open — the graph ring, the chips and the toggles all re-tint.

**The File Diff views:**

- [ ] The commit-picker popover (compact, no graph) renders inside the `Popover`, picks a commit,
      and closes.
- [ ] The Revisions panel: Unstaged/Staged synthetic rows read italic and muted, the Unstaged row
      shows R only with the L slot held open, and picking L/R updates the diff.

**Mechanical:**

- [x] `npm run lint`, `npm run typecheck`, `npm run build-prod` clean.
- [x] `grep -rn "resizible\|cellFormater\|cellRenderer" src/renderer/components/git-tree/` finds
      only two prose mentions in comments explaining the rename.
- [x] No file in `components/git-tree/` imports `uikit/AVGrid`. Emotion is gone from every file
      this task touched — `GitStatusBadge.tsx` keeps its own, correctly: it is a badge with no grid
      contact and no part of this consumer's cell path.

## Files changed

| File | Change |
|---|---|
| `src/renderer/components/git-tree/GitTree.css` | **new** — every cell, toggle, chip and footer rule, in `@layer app` |
| `src/renderer/components/git-tree/GitTree.tsx` | rewritten: no state, `<DataGrid>`, string renderers, imperative effects |
| `src/renderer/components/git-tree/BranchTreeCell.tsx` | **renamed** to `branch-tree-cell.ts`; SVG string renderer |
| `src/renderer/components/git-tree/side-select-cell.ts` | **new** — the L/R renderer + click resolver |
| `src/renderer/components/git-tree/SideSelectToggle.tsx` | **deleted** (D6) |
| `src/renderer/components/git-tree/load-more-footer.ts` | **new** — the `extraElement` footer |
| `src/renderer/components/git-tree/GitTreeModel.ts` | `DataGridInstance` handle; `revealRef` on the public façade |
| `src/renderer/components/git-tree/RefBadge.tsx` | Emotion chip → shared `.git-ref-badge` class |
| `src/renderer/components/git-tree/index.ts` | export updates |
| `src/renderer/components/git-tree/GitTree.story.tsx` | add the `sideSelect` prop |
| `src/renderer/uikit/DataGrid/DataGrid.story.tsx` | remove the false `position: absolute` rule and its doc-comment (F8) |
| `C:\projects\av-grid\src\view\DataCell.ts` | Step 8 — exact html-mode skip; released as 2.2.2 |
| `package.json` | av-grid pin → 2.2.2 (Step 8 only) |
| `doc/epics/EPIC-057.md` | amend C4-6; note F1-F8; US-1021 → Implemented |
| `doc/active-work.md` | entry update |

## Files that need NO changes

Checked, so the implementation does not re-investigate them:

- `swimlane-layout.ts` — pure, render-agnostic; its `GitCommitRow` shape is unchanged.
- `GitStatusBadge.tsx`, `git-date.ts`, `git-refs-tree.ts`, `GitChangesModel.ts`,
  `GitBranchesModel.ts` — no grid contact.
- `editors/git-tree/GitTreeEditorView.tsx`, `GitTreeEditorModel.ts`, `GitRefsView.tsx`,
  `CommitInfoPanel.tsx` — `GitTreeProps`, `GitColumnLayout`, `revealRef`'s signature and
  `REF_COLOR` are all preserved.
- `editors/file-diff/RevisionPicker.tsx`, `GitDiffRevisionsSecondaryView.tsx` — same.
- `uikit/DataGrid/DataGridView.ts`, `types.ts`, `DataGrid.tsx`, `DataGrid.css` — the shim needs
  nothing for this consumer. (The tooltip helper in Concern 1 will touch `DataGridView.ts`, in its
  own task.)
- `uikit/AVGrid/**` — deleted by US-1023, untouched here.
- `theme/p-vars.ts`, `theme/style-layers.css` — the `--p-*` bridge and the layer order already
  carry this.
- `doc/architecture/styling-inventory.md` — a frozen snapshot, never updated in place.

## What implementation changed about the plan

Little, which is what the four agent investigations were for. Six things are worth recording.

**The plan's CSS token names were wrong, and would have failed silently.** It wrote
`var(--spacing-sm, 4px)`; the app's prefix is `--space-*` (`theme/token-vars.ts` maps the `spacing`
scale with `mapScale("--space", spacing)`). Every one of those declarations would have fallen back
to its literal and looked right, which is exactly why the plan said to check each name against an
existing uikit stylesheet first. Corrected to `--space-*`; `--font-xs` and `--font-sm` are both
12px, not 11.

**The layering is verified, not assumed.** In the production bundle the git-tree rules land in their
own chunk (`GitTreeModel-*.css`, 1,972 bytes) and a brace-matching pass over it finds **15 `git-`
selector occurrences, all 15 inside `@layer app`, none outside**. Same method US-1019 used on
av-grid's own sheet.

**`GitStatusBadge.tsx` keeps its Emotion, and the acceptance criterion was wrong to demand
otherwise.** It is a badge with no grid contact and no part of this consumer's cell path. Emotion is
gone from every file this task touched (`GitTree.tsx`, the deleted `BranchTreeCell.tsx` and
`SideSelectToggle.tsx`, and `RefBadge.tsx`), which is the claim that was meant.

**One small deliberate behaviour change.** Clicking the *empty* part of the L/R cell — inside the
column but not on a toggle — no longer selects the commit. Under the React grid the click bubbled
out of `SideSelectCellRoot` and the row-click handler fired; only the toggles called
`stopPropagation`. The new `onCellClick` returns as soon as the column key matches. This agrees with
how av-grid treats a status column everywhere else (`onCellPointerDown` ignores the press outright),
so the column is now chrome consistently rather than chrome-with-a-hit-target.

**Step 8 shipped as av-grid 2.2.2, and it was measured rather than argued.** The `WeakMap` the
search-highlight path already used now covers a `render` column's markup too, so the skip compares
against the last string *assigned* instead of against a re-serialization of the DOM. Two of the five
new tests fail against the old code, which is the point of writing them.

The measured effect, on a 12-row viewport with one self-closing-SVG `render` column: **childList
node mutations on a full repaint 36 → 0** (three per cell — old subtree out, new subtree in), with
attribute mutations unchanged at 112 either way. Recorded in av-grid's
`tasks/benchmark-results.md`. Two caveats stated there and repeated here because they matter:

- **The board timing gate was not re-run.** It needs a browser, and this change removes DOM writes
  and adds no per-cell allocation, so the deterministic counter above is the number the change is
  about. Flagged rather than skipped quietly.
- Under happy-dom, the *old* comparison failed to skip even `<b>10</b>` — so in that DOM the guard
  never worked at all. Chromium round-trips that case, so Persephone was getting the skip for plain
  markup; the point stands that it was contingent on the serializer.

**And one thing the agents' reasoning got exactly right, worth keeping.** The whole design rests on
the string form, and the string form rested on serializer fidelity — a dependency that no test in
this repository could have protected and that a future edit ("tidy that to a self-closing tag")
would have broken invisibly. After 2.2.2 the formatting rules in `branch-tree-cell.ts` are correct
but no longer load-bearing. That is the difference between a comment that has to be obeyed and a
comment that explains something.

## Verification status

Done: `lint`, `typecheck`, `build-prod`, the CSS-layer check, av-grid's 816 tests, and the
before/after mutation measurement.

Not done: **everything that needs the running app** — the story panels (swimlane, clipping at a
scroll offset, the tint check that replaces F8's struck criterion, the L/R toggles), the Git Tree
editor's column-layout round-trip through a restart, the context menu, `revealRef`, the theme
switch, and both File Diff views. The acceptance list above is the script.
