# US-1022 — the four remaining grid consumers

**Epic:** [EPIC-057](../../epics/EPIC-057.md) — De-React, Epic C4 (`AVGrid` → `av-grid`)
**Status:** implemented
**Depends on:** US-1019 (the shim), US-1024 (the cell tooltip — satisfied)
**Blocks:** US-1023 (delete `uikit/AVGrid/`)

## Goal

Move the last four consumers of the React grid onto `av-grid` through `uikit/DataGrid`, so that
`uikit/AVGrid/` has no importers left and US-1023 can delete it.

The four:

| Consumer | File | Grids | Character |
|---|---|---|---|
| `FileGrid` | `components/file-grid/FileGrid.tsx` | 1 | Read-only list, two columns of **React** content |
| Env Vars | `editors/env-vars/EnvVarsBody.tsx` | 1 | Editable, buffered, validated before it is applied |
| Graph detail panel | `editors/graph/GraphDetailPanel.tsx` | 2 | Editable (Links, Properties), dropdown columns, per-cell classes |
| Log grid output | `editors/log-view/items/GridOutputView.tsx` | 1 | Read-only, persists column widths and focus |

## Background

### What the shim gives, and what each consumer has to absorb

`uikit/DataGrid` mounts one `av-grid` instance and forwards props (`DataGridView.ts`). It is *not*
a reconciliation layer (C4-2). The React grid was fully controlled — the host held `columns`,
`focus`, `rows` and the edit path in state and passed them down with setters. av-grid **owns** all
of that from `create()` onward, and options are initial values. Each consumer absorbs the
inversion itself, which is the bulk of this task.

Two precedents, both already landed, and between them they answer most of what comes up here:

* **`editors/grid/GridBody.tsx`** + `GridEditor.ts` (US-1020) — the editable case. av-grid owns
  the live row array; the model keeps a seed. Rows held in the app's immer state are deep-frozen
  and av-grid's in-place `row[key] = value` throws against a frozen object, which is why the
  ownership went that way rather than the other.
* **`components/git-tree/GitTree.tsx`** (US-1021) — the read-only case with persisted layout.
  Columns are built **once** into a ref and never handed to the grid again, because
  `DataGridView` diffs value props by identity and a fresh `columns` array on a later render
  replaces the live one and wipes the widths the user dragged. Later changes go through
  `grid.setColumns()`. Cells are `render` hooks returning HTML strings, styled from a stylesheet
  in `@layer app`.

### The prop map

Every rename and every semantic change in one place. The left column is the React grid
(`uikit/AVGrid/model/AVGridModel.ts`), the right is av-grid (`av-grid/src/options.ts`).

| React grid | av-grid | Note |
|---|---|---|
| `onModel` | `onGrid` | Shim's own prop; instance, not a model |
| `columns` + `setColumns` | `columns` (**initial**) + `onColumnsChange` / `onColumnResize` / `onColumnsReorder`, and `grid.setColumns()` | See US-1021's ref-once rule |
| `rows` | `rows` | av-grid owns the array afterwards |
| `focus` + `setFocus` | `onFocusChange`, and `grid.setFocus()` / `focusCell()` | No `focus` option at all |
| `selected` + `setSelected` | `selected` (**initial-only** in the shim) + `onSelectionChange`, `grid.setSelected()` | |
| `editRow(columnKey, rowKey, value)` | `onEdit(CellEditEvent)` | Fires **before** the write; `false` vetoes |
| `onAddRows(count, insertIndex) => R[]` | `onAddRows(AddRowsEvent)` + `newRow(index)` | Fires before the insert; mutate `e.rows`, or return `false` |
| `onDeleteRows(rowKeys)` | `onDeleteRows(DeleteRowsEvent)` | Fires before the delete; `false` vetoes |
| `onClick(row, col)` | `onCellClick(cell, e)` | |
| `onDoubleClick(row, col)` | `onCellDoubleClick(cell, e)` | |
| `onCellClass(row, col)` | `onCellClass(cell)` | One `CellContext` argument |
| `cellFormater: (props) => ReactNode` | `render: (cell) => string \| HTMLElement \| null` | **No React.** See D1 |
| `getContextMenuItems(selectedRows)` | `getContextMenuItems(GridContextMenuEvent)` | `e.selection?.rows`, `e.target` |
| `entity` | `rowNoun` | |
| `readonly` | *omit* `editable` | |
| `resizible` | `resizable` | The typo is fixed upstream — see F1 |
| `growToHeight={number}` | `growToHeight="400px"` | A CSS string now |
| `model.focusGrid()` | `grid.focus()` | |
| `models.focus.getGridSelection()` | `grid.getSelection()` | |
| `disableFiltering` / `disableSorting` / `fitToWidth` / `cellBorders` / `rowHeight` / `name` | same | |

### Findings

#### F1 — `resizible` is a typo the old grid honoured, and av-grid does not

Nine column declarations across `GraphDetailPanel.tsx` (7) and `EnvVarsBody.tsx` (2) say
`resizible`. av-grid spells it `resizable` and its default is `resizable !== false`, so a left-alone
`resizible: true` still resizes — the rename is invisible in both directions **except** where a
future author writes `resizible: false` and gets a resizable column. Rename all nine.

#### F2 — the old grid inferred the user's affordances from callback presence; av-grid does not

`AVGridActions.ts` / `EditingModel.ts` gate editing on `props.editRow` being present, and the
add-row button and the paste-grows-the-grid path on `props.onAddRows`. av-grid has four explicit
`can*` options plus `editable`, and the callbacks only *observe*. So every consumer that passed
`editRow` / `onAddRows` / `onDeleteRows` and got the affordance for free — Env Vars, Links,
Properties — must now say `editable`, `canAddRows`, `canDeleteRows` outright, and supply `newRow`
where a blank row needs more than `{}`.

#### F3 — `isStatusColumn` means much more in av-grid, and the Links ID column is the casualty

Recorded by the epic and confirmed here in detail. In the React grid the flag did three cosmetic
things: pin left (`ColumnsModel.ts:93`), no header drag (`HeaderCell.tsx:258`), skipped by
`firstEditable` (`ColumnsModel.ts:23`). Resize was gated purely on `resizible`, so
`resizible: true, isStatusColumn: true` was coherent there.

In av-grid the same flag also makes the column **uneditable** (`EditingModel.ts:123`, regardless of
`readonly`), **unfocusable** (`GridInteractions.ts:282` returns before the focus move — the click
is still delivered, which is how the git tree's L/R column works), **skipped by the new-row focus
fallback** (`FocusModel.ts:331`), **excluded from copy** (`CopyPasteModel.ts:101`) and
**non-resizable** (`view/HeaderCell.ts:98`).

`GraphDetailPanel.tsx:706` has `isStatusColumn: true` on the Links tab's `id` column — the one
column that *is* the payload of that tab: `onAddRows` creates rows with `id: ""` and `handleApply`
sends those ids on. Four of those behaviours are load-bearing failures there. See D2.

The inverse trap is in `FileGrid`: `icon` and `status` *look* like status columns — 28 px and 24 px
of pure chrome — but both are deliberately sortable (`rowCompare` on one, `dataType: "string"` on
the other), and the flag would kill the sort. Neither gets it.

#### F4 — av-grid re-anchors a focus whose row disappeared, and the React grid did not

`FocusModel.validateFocus()` runs on every rows/columns change: it follows the focused **key**
through a sort or filter, and when the key has gone entirely it falls back to the old **index**,
clamped into range. The React grid held focus host-side and simply kept a dangling `rowKey`.

This is visible in `FileGrid` inside the Git Changes view: stage a file and the list shrinks, so
the focus lands on the *next* file and `onFocusChange` reports it as the new selection, where
before the selection went empty. That matches what Git Extensions does and is the better
behaviour, but it is a change and it is what the Stage/Unstage buttons read.

#### F5 — `--avg-font-size` sits on the grid root, so `FileGrid`'s `compact` font cannot be inherited in

`FileGrid`'s Emotion root sets `font-size: 12px` under `[data-compact="true"]` and relies on the
cells inheriting it. av-grid declares `font-size: var(--avg-font-size)` on the grid root itself
(`av-grid.css.ts`, the `[data-type="render-grid"].avg-grid` block), so an ancestor's `font-size`
never reaches a cell.

The clean fix needs no layer trickery and no `!important`: that block resolves
`--avg-font-size: var(--p-font-base, 13px)`, and `--p-font-base` is the app's own bridge variable
(`theme/p-vars.ts` → `var(--font-base)`), *inherited* at the grid root. Setting `--p-font-base` on
`FileGrid`'s wrapper therefore changes the grid's font. See D6.

#### F6 — `GraphDetailPanel.css` styles the **old** grid's class name, and is unlayered

```css
.graph-detail-panel .data-cell.cell-error { … }
.graph-detail-panel .data-cell.cell-mixed { … }
```

`.data-cell` is the React grid's class; av-grid's is `.avg-data-cell`. Both rules are dead the
moment the grid moves, and the two classes they carry are the Properties tab's whole error /
mixed-value signalling. The file is also one of only four stylesheets in `src/renderer` with no
`@layer` at all. See D7.

#### F7 — nothing else imports these grids

After the four files move, `uikit/AVGrid/` is imported only by `uikit/index.ts` (the barrel
re-export) and by itself, which is exactly the state US-1023 expects to delete from. `RenderGrid`
keeps its other 12 app-layer consumers and is not in this task's scope.

## Decisions

### D1 — React cell content: serialize each distinct icon **once**, and change `getTrailing`'s contract

`FileGrid` has the only genuinely hard problem in this task. Two of its three columns return
React, and one of them — `FileIcon` → `FileTypeIcon` (`components/icons/LanguageIcon.tsx`) — is
React for real reasons: an async IPC fetch for the Windows shell icon, a live subscription to the
board registry, and a `BoardGlyph` branch with an async icon probe of its own.

Four routes were weighed. Two are wrong and one is a silent behaviour loss:

* **A React root per cell — wrong, not merely costly.** `av-grid/src/view/DataCell.ts`: the
  *string* branch compares against a `written` WeakMap and skips an unchanged write, but the
  **element** branch has no guard at all — `el.textContent = ""; el.appendChild(rendered)` on
  every paint that touches the cell. A hover move dirties two rows. Worse, `CellContext` never
  hands the renderer its cell element, so a renderer *cannot* key a cache on the pooled element,
  and `CellPool.release()` does not reset one — a cache keyed that way paints the previous
  occupant's icon. Keying on `rowKey` instead means unbounded roots with no teardown signal.
* **`renderToStaticMarkup` per cell per paint** — loses nothing but costs a React render per
  visible cell per paint, for output that is identical between paints.
* **Drop the async and board branches** — loses real behaviour. Every extension with no entry in
  `languageIconMap` and no pattern match (`.exe`, `.pdf`, `.png`, `.docx`, `.dll`) currently gets
  the Windows shell icon, and a newly trusted board currently re-glyphs the files it claims.

**The route taken:** the *rules* in `FileTypeIcon` are React only incidentally — every input they
read is already reachable synchronously (`getLanguageByExtension`, `getFilePatternIcon`,
`customEditorRegistry.getBoardsForFile`, `resolveEditorIdForFile`, `getBoardIconPathSync`,
`systemIconModel`'s cache). So:

1. Extract a pure `resolveFileIcon(fileName, language?)` returning a discriminated union —
   `{kind:"component",Icon} | {kind:"board",boardRoot} | {kind:"system",url} | {kind:"default"}` —
   and have **both** `FileTypeIcon` and the new vanilla path consume it. A real extraction, not a
   copy: the priority ordering (a winning board beats the language icon) is load-bearing and easy
   to re-derive wrongly.
2. `fileIconMarkup(fileName, size)` returns an HTML **string**, memoized in a
   `Map<iconIdentity|boardRoot|systemUrl + size, string>`. The one React call left is
   `renderToStaticMarkup`, run **once per distinct icon** — about fifty, ever — not once per cell.
3. Because the string is then stable for a given file, av-grid's `written` map skips the write on
   every later repaint. A hover move over a 3,000-row grid mutates **zero** nodes in that column,
   which is cheaper than the React grid was.

Reactivity stays in React, because `FileGrid` is still a React component and Epic D/E converts it
later: `useBoardIcon(undefined)` already subscribes to the board-icon cache without naming a board,
`customEditorRegistry.state.use(…)` covers trust and mask changes, and one effect walks `items`,
warms the unresolved extensions and board roots, and calls `grid.refresh()` when a cache fills.
When this component goes vanilla those hooks become plain subscriptions and nothing else moves.

**Why not the library's existing DOM builder.** `createIconElement` (`uikit/shared/slots.ts`)
looks like the answer and is not: `createIconWithViewBox` attaches `createElement` **only when the
icon body is a string**, and every icon in `theme/language-icons.tsx` has a **JSX** body. That path
would take the `if (!Icon.createElement)` branch and render blank icons with a dev-only warning.
Converting fifty JSX bodies to string bodies is a much wider, transcription-error-prone change for
no gain over serializing once.

**The trailing column takes av-grid's own renderer type.** `getTrailing?: (item) => ReactNode`
becomes `getTrailing?: CellRenderer<FileGridItem>`, re-exported from `uikit/DataGrid` — not a
bespoke `=> string`. The shim's whole convention is that its props are the library's option names,
and the caller then has `cell.highlight()`, the sanctioned escaper for untrusted text in a `render`
string, and the column hands the prop straight through with no adapter. One caller, one call site.

`GitStatusBadge` **stays** — `editors/git-tree/CommitDiffPanel.tsx:165` renders it through the
still-React `FileList`. Its `STATUS_META` + `paletteHex` lookup is extracted into a shared vanilla
helper that both the React badge and the new string renderer call; the letter/colour table is not
forked.

**And the title column loses its renderer entirely.** `<TruncatedText>` is exactly what av-grid's
default text cell now gives for free — `.avg-cell-text` carries the ellipsis *and* the shim's
hover-to-read tooltip (US-1024). A `render` hook there would opt the column **out** of both unless
it re-emitted the class by hand.

### D2 — the Links tab's ID column drops `isStatusColumn`, with no substitute

Per F3. Keep the resize intent, spelled av-grid's way: `resizable: true`. Nothing replaces the
flag.

What is lost is the left pin, and av-grid offers no way to pin without the flag. That is the right
trade: pinning a column the user cannot type into is worthless, and the ID column is what this tab
exists to edit. Two side effects, both fine:

* The ID header becomes draggable. Self-healing — `makeColumns` rebuilds from scratch on every
  `linkedNodes` change and in `handleCancel`, and no layout is persisted here, so a reorder lasts
  until the next node selection. (`GitTree`'s status-hoisting guard in `applyLayout` exists only
  because GitTree *persists* its layout. Nothing like it is needed here.)
* New-row focus **improves**: with the flag gone `firstEditable` is index 0, so `focusNewRows`
  lands on ID — the field that has to be filled — instead of on Title. The current behaviour is a
  wart caused by the very flag being removed, not a baseline to preserve.

`disableSorting` and `disableFiltering` stay on both graph grids, or dropping the flag newly
exposes a sort arrow and a funnel on that column.

### D3 — `FileGrid`'s compact font goes through `--p-font-base`, not `font-size`

Per F5. The wrapper sets `--p-font-base: 12px` under `[data-compact="true"]` instead of
`font-size`, which the grid root's own `--avg-font-size: var(--p-font-base, 13px)` then picks up by
inheritance. No layer override, no `!important`, and no reach into av-grid's variables — the app's
own bridge variable is the documented seam.

The icon also gets an explicit size. `FileIcon` passes `width`/`height` through as `undefined`, so
`SvgIcon` defaults to **24×24** — a 24 px icon in a 28 px column and a 20 px compact row today.
The new renderer emits 16, which is a deliberate correction rather than a port.

### D4 — `GraphDetailPanel.css` is renamed to av-grid's class and wrapped in `@layer editor`

Per F6. `.data-cell` → `.avg-data-cell`, which also satisfies av-grid's documented rule that a
cell class must out-specify `.avg-data-cell`. The file is wrapped in `@layer editor` — the layer
this component's folder belongs to, above `app` and `uikit`, so the two rules beat the library's
cell colour without a specificity contest. This is the same move US-1021 made for `GitTree.css` in
`@layer app`, and it takes one of the four remaining unlayered stylesheets off that list.

### D5 — Env Vars: av-grid owns the rows, and the validate-and-apply is **deferred**, not projected

Option (a) from the three weighed, with one refinement that matters. Every mutation callback
(`onEdit`, `onAddRows`, `onDeleteRows`) does exactly one thing — schedule an apply — and returns
`void`, never `false`. The scheduled apply then reads `grid.getRows()`, which by then *is* the
post-change array, and validates that.

**Why deferral rather than projecting the change inside the callback.** All three callbacks fire
strictly *before* the mutation lands (verified: `EditingModel.ts:298` calls `onEdit`, and the write
at `:307` happens after — av-grid's own `editable` doc-comment has the order backwards, see C4).
A synchronous validation would therefore need three hand-written projections that replicate
av-grid's insertion and deletion semantics, and a duplicate-name check needs the whole set, not one
cell. A `queueMicrotask` behind a single "already queued" flag needs one code path, is correct under
either callback ordering, and **coalesces**: a range `Delete` and a paste each fire `onEdit` once
per cell, so a twenty-cell paste becomes one validation and one `setProfileData` instead of twenty.

**The invalid path falls out for free.** Nothing is vetoed, so av-grid performs the write and keeps
the user's text, caret, focus and open editor exactly where they were. Nothing is pushed to
`EnvVarsEditor`, so `state.data` is untouched and the file is byte-identical — which is the
behaviour today, arrived at with less machinery. The warning stays the only reactive output. The
record replacement stays atomic: never a "valid subset", and never per row, because a per-row apply
would delete the old key and insert a new one on every keystroke of a rename.

**A veto-on-invalid variant was considered and rejected.** It reads like the careful choice and
breaks the editor: the user could never blank a name and could never swap two names, because the
intermediate state is exactly the one being refused, and the typed text would vanish rather than
stay visible.

**`rows` must leave the component state entirely — this is the sharpest trap in the task.**
`TOneState.update` is `produce(...)` with immer's default `autoFreeze` and nothing calls
`setAutoFreeze(false)`, so immer deep-freezes everything reachable from the produced state,
including untouched branches. `setWarning` goes through `update`. So if `rows` stayed in
`VariablesGridState`, **the first warning would freeze the live row array and every row object, and
the next keystroke would throw** `Cannot assign to read only property` from av-grid's in-place
write. Today's code survives only because `setRows` happens to use `state.set` (no `produce`) — an
accident that disappears the moment av-grid holds the same objects. `VariablesGridState` reduces to
`{ warning: string | undefined }`; the model keeps a plain, non-reactive `seedRows` field and a
`rowsForGrid()` that returns `grid?.getRows() ?? seedRows`, which is `GridBody`'s shape.

**The re-seed keeps its `appliedData` guard**, which is now load-bearing rather than an
optimisation: a spurious re-seed would `setRows` fresh objects out from under an in-progress edit.
It still works because `setProfileData` assigns our own `record` object into the immer draft and
immer preserves an assigned reference, so `props.data === appliedData` on the echo. The
`queueMicrotask` inside that effect **goes** — it existed because the effect body called `setState`,
and the seed is now an imperative `grid.setRows()`. Seed rows must be fresh unfrozen object
literals with the values copied out, never the frozen record's own objects, and never reused across
seeds.

**`_rowKey` is deleted**, along with `rowCounter` / `nextRowKey`, and **no** `getRowKey` is passed —
absent, so the shim installs no trampoline and av-grid's inference stays live. `VarRow` has none of
the properties `inferRowKeyProperty` probes, so it falls to the per-object `WeakMap`, which is
stable across sort and filter and lost only on `setRows` — precisely a full re-seed, where fresh
identities are what is wanted. **Not** `getRowKey: r => r.name`: empty and duplicate names are
legal transient states here by design, and colliding keys misdirect focus and make `deleteRows`
remove every match.

### D6 — the log grid keeps its column widths, seeded once, persisted from one callback

`itemsState` is **in-session only** — deliberately excluded from the host slot and from
`getRestoreData` (`LogViewEditor.ts:18-33`, `:455`), because per-entry aux state would write-storm
`openFiles0.json`. So nothing here survives a restart, and it never did.

What it does buy is remounts, which are frequent: `LogBody` renders entries through a virtualized
grid, so scrolling a long log past a grid entry and back unmounts and remounts this view, as does
the auto-scroll on a new log line. Keeping widths across *that* is worth the code.

* Columns are built **once** into a ref (`if (!ref.current)`), seeded by
  `mergeColumnsWithSaved(detected, saved)` where `saved` is read **non-reactively** through
  `vm.getItemState(entry.id)`, and never handed to the grid again. Without this the migration
  regresses: `entry.data` gets a new identity whenever `loadContent` rebuilds the entries (any
  edit to an earlier line, or a switch), `baseGridData` recomputes, and a fresh `columns` array
  reaches `setOptions` → `ColumnsModel.setColumns`, which replaces the array wholesale and drops
  every width the user dragged.
* Persisted from a single **`onColumnsChange`**, not GitTree's `onColumnResize` +
  `onColumnsReorder` pair. GitTree needs that pair because it calls `grid.setColumns()` itself and
  must not persist its own rebuilds; this view never calls `setColumns` — the entry's data is
  immutable once written — so every `onColumnsChange` here *is* a user resize or reorder, and it
  hands over the whole array, which is what gets serialized. No `onGrid`, no `gridRef`.
* Array order carries the reorder, since `mergeColumnsWithSaved` already restores order from the
  saved array's index. No separate order field.
* **Throttled at 150 ms**, trailing, like GitTree — `onColumnResize` fires per pointermove and each
  write is an immer pass over a map that scales with the entry count. One deliberate difference:
  the unmount cleanup **flushes** the pending layout instead of merely clearing the timer. GitTree
  can drop it (its unmount is a page close); here the dominant unmount is "dragged a width, then
  scrolled the entry off screen", which is exactly the case a bare clear would lose.
* **The `itemsState` subscription goes.** With widths read once and focus gone, the
  `vm.state.use(s => s.itemsState[entry.id] ?? {})` line is deleted, which removes the controlled
  round-trip entirely — no re-render per persisted write, and no path by which a saved array can
  flow back into a `columns` prop.

`mergeColumnsWithSaved` survives as the local equivalent of GitTree's `applyLayout`; detection
happens on every mount, which is precisely why a merge is still needed. It moves from a `useMemo`
to the one-shot seed, and `SavedColumn.key` narrows to `string` (av-grid's `validateColumns`
rejects a non-string key outright), which lets the `String(...)` coercions and the truthiness guard
go. No status-column hoist — this grid has none.

### D7 — the log grid stops persisting the focused cell

Dropped, not ported. Four reasons, in order of weight:

1. av-grid has **no `focus` option at all**, so keeping it is not "pass the same prop" — it means
   adding `onGrid`, a `gridRef` and a `grid.setFocus(saved)` on mount for this alone. Dropping it
   leaves the component prop-only with no imperative handle whatsoever.
2. The write rate is worse than columns': `onFocusChange` fires once per cell traversed during a
   drag, so a range drag across thirty rows is thirty immer passes over the whole item-state map,
   for a value nothing reads except a possible remount.
3. What it would restore is a highlight with no keyboard owner. `FocusModel.setFocus` moves no DOM
   focus and does not scroll, so the restore paints a focus rectangle and a selection range in a
   grid the user is not typing into, on a page whose DOM focus is the log container. That reads as
   stale decoration rather than as continuity.
4. The window is tiny and the grid is read-only with filtering off, so nothing rides on it: the
   only unmount trigger is the entry leaving the viewport, which cannot happen while the user is
   clicking in it. The loss is a cell outline across a scroll the user initiated themselves.

If this is ever wanted back, the mechanism is `GridEditor`'s verbatim — store on `onFocusChange`,
restore in `onGrid` with `grid.setFocus(focus)`; keys alone suffice, and a frozen focus object is
safe because `FocusModel` replaces `_focus` rather than mutating it.

### D8 — a script-supplied column that is not in the data must not reach av-grid bare

New hazard, not present before, and it is a **crash** rather than a cosmetic change.
`getGridDataWithColumns` builds a column for every key the script asked for without checking the
data (`grid-utils.ts:151-177`), and av-grid's `validateColumns` **throws**
`AVGridError("Unknown column …")` for a non-computed column whose key appears in no sampled row
(`validate.ts:345-357`). That throw happens inside `create()`, i.e. inside `DataGridView.onMount`,
during the React commit of a log row. Before the migration the same input rendered a harmless
empty column.

`mergeColumnsWithSaved`'s existing filter does not help — it protects the *saved* keys, not the
script's.

The fix goes in `getGridDataWithColumns`, one place for every caller, and only on the branch that
is already the problem: a requested column with **no matching detected column** gets

```ts
formatValue: (_c, row) => { const v = (row as any)[column.key]; return v == null ? "" : String(v); }
```

which is av-grid's own default projection written out. That marks the column computed, so the
validator passes, and it preserves the old behaviour exactly — the column the script asked for is
still there, and it is still empty. Columns that *do* match keep no `formatValue`, so nothing
changes for them (a `formatValue` outranks `displayFormat` for search, filters and copy, which is
why it is not applied blanket).

### D9 — `FileGrid`'s selection comes from `onFocusChange` + `grid.getSelection()`

The React version derived the selection in a `useEffect` on the `focus` state, reading
`models.focus.getGridSelection()`. Now it is `onFocusChange` → `grid.getSelection()?.rows ?? []`,
which is the same data one layer shorter.

Two behaviour notes, both consequences of F4 and both to be tested in the app rather than reasoned
about further: the mount-time `[]` report disappears (av-grid fires `onFocusChange` on change, not
on mount), and staging a file now leaves the *next* file selected instead of clearing the selection,
because av-grid re-anchors a focus whose row has gone. The Stage/Unstage buttons read that
selection.

## Implementation plan

No av-grid release is required. This task invokes nothing like C4-10 — every gap it meets is
answered by the library as shipped (2.2.3). The one upstream change proposed is a docs correction
(step 11), which needs no version bump.

### Step 1 — extract the icon resolution rules (`components/icons/LanguageIcon.tsx`)

Add a pure, hook-free resolver above `FileTypeIcon` and make `FileTypeIcon` consume it, so there is
exactly one copy of the priority order:

```ts
export type ResolvedFileIcon =
    | { kind: "component"; Icon: SvgIconComponent }
    | { kind: "board"; boardRoot: string }
    | { kind: "system"; url: string }
    | { kind: "default" };

export function resolveFileIcon(fileName: string, language?: string): ResolvedFileIcon;
```

Body order must match today's steps exactly: the pattern icon (`getFilePatternIcon`) or the
language icon (`getLanguageById` / `getLanguageByExtension` → `languageIconMap`) is resolved first,
but a **winning board beats both** — `customEditorRegistry.getBoardsForFile(fileName)` non-empty,
then `parseBoardEditorId(resolveEditorIdForFile(fileName) ?? "")`; then the static icon; then the
system cache; then `"default"`.

Also export the two small non-React surfaces the vanilla path needs, because `systemIconModel` is
module-private today:

```ts
export function prepareFileIcon(fileName: string): void;             // wraps systemIconModel.prepareIcon
export function useSystemFileIcons(): ReadonlyMap<string, string>;   // systemIconModel.state.use(s => s.iconCache)
```

`FileTypeIcon` keeps its current behaviour and its hooks; only its resolution body is replaced by a
`resolveFileIcon` call.

### Step 2 — `components/icons/file-icon-markup.ts` (new)

```ts
export function fileIconMarkup(fileName: string, size = 16): string;
```

Resolve with `resolveFileIcon`, then produce a string, memoized in a module `Map` keyed on the
resolved identity **plus the size** (a 16 px grid and a 24 px tab must not share an entry):

| kind | markup | cache key |
|---|---|---|
| `component` | `renderToStaticMarkup(<Icon width={size} height={size} />)` | the component identity + size |
| `board` | `renderToStaticMarkup(<BoardGlyph …/>)`, and call `resolveBoardIcon(root)` when `getBoardIconPathSync(root)` is null | `boardRoot` + size |
| `system` | `<img src="URL" style="width:Npx;height:Npx">` — the `data:` URL is interpolated raw, not escaped | url + size |
| `default` | `renderToStaticMarkup(<DefaultIcon …/>)` | `"default"` + size |

`renderToStaticMarkup` runs **once per distinct icon** — about fifty, ever. The returned string is
then stable for a given file, so av-grid's `written` map skips the write on every later repaint.
The folder icon becomes `<span class="file-grid-folder">📁</span>` rather than the Emotion
`FolderIconRoot`, which Emotion cannot reach inside a `render` string.

### Step 3 — share the git status table (`components/git-tree/`)

Move `STATUS_META` and `paletteHex` out of `GitStatusBadge.tsx` into
`components/git-tree/git-status-meta.ts`, exporting `gitStatusMeta(status)` and a
`gitStatusMarkup(status): string` emitting what the badge renders — a span carrying the letter, the
palette hex as an inline `color`, and the raw code as its `title`.

`GitStatusBadge.tsx` keeps its React component (still used by `CommitDiffPanel.tsx:165` through the
React `FileList`) and imports the shared table. The letter/colour table is **not** forked. The
badge's Emotion styling moves to a class rule so both forms look identical.

### Step 4 — `components/file-grid/FileGrid.tsx`

* Imports: `DataGrid`, `type CellContext`, `type CellRenderer`, `type DataGridInstance` from
  `../../uikit/DataGrid`. Drop `AVGrid`, `AVGridModel`, `TruncatedText`, `TCellFormater`,
  `TCellRendererProps`, `CellFocus`.
* `FileGridProps.getTrailing` becomes `CellRenderer<FileGridItem>` (D1).
* `FileGridModel`, `FileGridState`, `setColumns`, `setFocus` and `useComponentModel` all go —
  av-grid owns columns and focus, and nothing else was in that state.
* Columns built **once** into a ref. `label` (the path column's header) is pushed imperatively when
  it changes: handing a fresh `columns` array back would reset widths, so update the one column —
  `const cols = grid.getColumns(); cols[i] = { ...cols[i], name: label }; grid.setColumns(cols)`.
  It is a constant at both call sites today, so guard on change.
* Column shapes:
  * `icon` — `width: 28`, `render: (c) => c.row.isFolder ? FOLDER_MARKUP : fileIconMarkup(c.row.filePath, 16)`, keeping `rowCompare` (sort by extension) and `formatValue: () => ""`.
  * `title` — `width: "10%"`, `dataType: "string"`, and **no renderer at all** (D1).
  * `status` — `width: 24`, `dataType: "string"`, `render` delegating to the `getTrailing` ref, `formatValue: (_c, r) => r.status ?? ""`.
* Props: `onCellClick` / `onCellDoubleClick` in place of `onClick` / `onDoubleClick`;
  `getContextMenuItems` gated on `e.target === "cell"` like GitTree's, reading
  `e.selection?.rows ?? []`; `onGridContextMenu={showGridContextMenu}`, which closes Rule 6 for
  this consumer; `onFocusChange` reporting `grid.getSelection()?.rows ?? []` (D9);
  `disableFiltering`, `fitToWidth`, `cellBorders={false}` and `rowHeight` unchanged.
* New `FileGrid.css` in `@layer app` for `.file-grid-folder`, the status badge class and the icon
  column's sizing, selected through `[data-column-key="icon"]`. The Emotion `Root` stays, but its
  `fontSize` becomes `--p-font-base` (D3).
* The reactivity effects (D1): `useBoardIcon(undefined)` to subscribe to the board-icon cache
  without naming a board, `customEditorRegistry.state.use(…)` for trust and mask changes,
  `useSystemFileIcons()` for the shell-icon cache, plus one effect that walks `items`, calls
  `prepareFileIcon` for the unresolved extensions, and calls `grid.refresh()` when any of the three
  changes identity.

### Step 5 — `editors/git-tree/GitChangesView.tsx`

One call site. `getTrailing` returns markup instead of JSX:

```ts
const getTrailing = useCallback(
    (cell: CellContext<FileGridItem>) => {
        const change = changeMap.get(cell.row.filePath);
        return change ? gitStatusMarkup(change.status) : "";
    },
    [changeMap],
);
```

### Step 6 — `editors/env-vars/EnvVarsBody.tsx`

Per D5. `VariablesGridState` reduces to `{ warning: string | undefined }`; `rows`, `columns` and
`focus` leave it, along with `setRows` / `setColumns` / `setFocus`, the `SetStateAction` casts,
`_rowKey`, `rowCounter` and `nextRowKey`. The model gains `seedRows` (a plain field, never reactive
state), a `grid` handle set from `onGrid`, `rowsForGrid()` returning `grid?.getRows() ?? seedRows`,
and a microtask-coalesced `scheduleApply()` guarded on `this.isLive` and
`grid && !grid.isDestroyed()`.

`VAR_COLUMNS` stays module-level so its identity never churns through `setOptions`. Grid props:
`rows={gridModel.rowsForGrid()}`, `columns={VAR_COLUMNS}`, **no** `getRowKey`, `editable`,
`canAddRows`, `canDeleteRows`, `newRow={() => ({ name: "", value: "" })}`, `rowNoun="variable"`,
`onEdit` / `onAddRows` / `onDeleteRows` each calling `scheduleApply()`, `disableFiltering`,
`disableSorting`, `rowHeight={28}`, `fitToWidth`. The mount autofocus calls `grid.focus()`. The
re-seed effect keeps its `appliedData` guard and loses its `queueMicrotask`. Update
`EnvVarsEditor.setProfileData`'s doc comment, which still describes the local buffer.

### Step 7 — `editors/graph/GraphDetailPanel.tsx` and `.css`

Both grids. Per D2 and D4, plus the mechanical work:

* Imports move to `../../uikit/DataGrid` (`DataGrid`, `detectColumnWidth`, `type Column`,
  `type CellContext`, `type DataGridInstance`); `CellFocus` and the `setFocus` casts go.
* `columns` and `focus` leave both tab states. `rows` **also** leaves both: the immer freeze D5
  documents applies here too — `setDirty` and `setStatusMessage` both go through `state.update`, so
  rows sharing that state object would be frozen and the next edit would throw. Each tab keeps a
  seed field plus `rowsForGrid()`, exactly as Env Vars does.
* Nine `resizible` → `resizable` (F1); `isStatusColumn` deleted from the `id` column (D2).
* `editable`, `canAddRows`, `canDeleteRows` and a `newRow` on both grids (F2) — Links'
  `newRow: () => ({ id: "" })`, Properties' `() => ({ key: "", value: "", _isChanged: true })`.
* `editRow` → `onEdit`. Its coercion of `level` and `shape` moves into each column's `validate`,
  which is where av-grid coerces; the `options` arrays already drive the dropdowns.
* `onCellClass={(c) => …}` taking one `CellContext`.
* The two focus-driven effects (`onExternalHover`, the multi-value `statusMessage`) read the focus
  from `onFocusChange` rather than from state, so their `queueMicrotask` staleness re-checks go.
* `GraphDetailPanel.css`: wrapped in `@layer editor`, `.data-cell` → `.avg-data-cell`.

### Step 8 — `editors/grid/utils/grid-utils.ts`

The D8 guard: in `getGridDataWithColumns`, when `existing` is undefined, attach the explicit
`formatValue` that reproduces av-grid's own default projection. Three lines, and the only change to
a file the grid editor shares.

### Step 9 — `editors/log-view/items/GridOutputView.tsx`

Per D6, D7 and D8. Imports move to `../../../uikit/DataGrid`; the `Column` cast and its comment go;
the `itemsState` subscription, `focus`, `setFocus` and `setColumns` go; columns are seeded once into
a ref from `vm.getItemState(entry.id).columns`; `onColumnsChange` persists through a 150 ms trailing
timer that the unmount cleanup **flushes**; `readonly` is dropped, since av-grid is non-editable
unless `editable`; `growToHeight` becomes the string form of `DIALOG_CONTENT_MAX_HEIGHT` — a bare
number silently produces no max-height; `getRowKey` is **kept**, because its presence suppresses
av-grid's id-shaped inference, which on arbitrary user JSON would collapse duplicate `id` values
into one row identity.

### Step 10 — verify

`npm run lint`, `npx tsc --noEmit`, `npm run build-prod`. Then the layer check US-1021 and US-1024
both used: every `avg-` selector in the built CSS is inside a layer, `GraphDetailPanel`'s two rules
are in `@layer editor`, and a grep for `uikit/AVGrid` across `src/` returns only `uikit/index.ts`
and `uikit/AVGrid/` itself.

### Step 11 — upstream docs correction (av-grid, no release)

`options.ts`'s `editable` doc-comment says the grid "writes the value into the row object … and
then calls `onEdit`". The order is the reverse (`EditingModel.ts:298`, then the write at `:307`),
which is what makes a `false` return able to veto — and it is exactly the fact a host needs in order
to choose between projecting a change and deferring. Docs-only, so no version bump; commit it in
the av-grid repo alongside this work.

## Concerns

1. **The icon rules gain a second consumer.** All of D1's safety rests on `resolveFileIcon` being a
   real extraction that `FileTypeIcon` actually calls. If a later change edits `FileTypeIcon`'s body
   instead, the grid's icons drift from the tab's silently. A reviewer should check that
   `FileTypeIcon` holds no resolution logic of its own after step 1.
2. **`react-dom/server` stays in the renderer bundle, and this becomes its only importer.** It is
   there today for `uikit/AVGrid/utils.tsx`, which US-1023 deletes — so after US-1023 the new icon
   module is the sole reason it is bundled. Acceptable now, since the module is already paid for,
   but it is a genuine obstacle to de-Reacting `components/icons/` later, and whoever does that work
   should expect to convert the fifty JSX icon bodies to string bodies at the same time.
3. **F4's selection change needs the app.** Staging a file now leaves the next file selected rather
   than clearing the selection, and the Stage/Unstage buttons read that selection. It is the better
   behaviour and it matches Git Extensions, but it is a change to a git-mutating control and it
   cannot be verified from a story.
4. **The Env Vars external-change re-seed still discards uncommitted invalid text.** A genuine
   change from outside the grid — a Monaco switch, an undo, a `git checkout` — legitimately re-seeds
   and throws away text the user had typed but not yet made valid. Identical to today's behaviour;
   worth a comment at the effect rather than a fix.
5. **Step 8 touches a file the grid editor shares.** The guard fires only on the branch where a
   requested column matched no detected one, which the grid editor's own path does not take — but
   any existing coverage of `getGridDataWithColumns` should be re-read.
6. **`GraphDetailPanel` is 1,314 lines and two grids, and it is where the freeze trap can hide.**
   Unlike Env Vars there are two `state.update` callers per tab (`setDirty`, `setStatusMessage`), so
   a partial migration that leaves `rows` in state throws on the first edit *after* the first dirty
   flag rather than on the first edit at all. Move `rows` out of both states in the same pass.

## Acceptance criteria

### Code

* No file outside `uikit/DataGrid/` imports `av-grid`; no file outside `uikit/` imports
  `uikit/AVGrid`. `uikit/index.ts` is the only remaining referrer, and it is US-1023's to remove.
* `npm run lint`, `npx tsc --noEmit` and `npm run build-prod` are clean.
* No `resizible` remains in `src/`.
* No `isStatusColumn` sits on an editable column anywhere in `src/`.
* Every `avg-` selector in the built CSS is inside a cascade layer; `GraphDetailPanel.css`'s two
  cell rules are in `@layer editor` and select `.avg-data-cell`.
* `rows` appears in no `TComponentState` that an av-grid instance also holds.

### App — `FileGrid` (Git Changes view, both lists)

* File icons match the tab icons for the same files, including an extension with no static icon
  (`.pdf`, `.exe`, `.png` — the Windows shell icon) and a file claimed by a trusted board.
* Icons appear without a visible second pass on first open of a repo with unseen extensions.
* The status letter and colour are identical to before, and its tooltip still shows the raw git code.
* A long repo-relative path ellipsizes and shows the full path on hover (US-1024's tooltip), in both
  compact and normal density.
* Compact rows are 20 px with the smaller font.
* Single click opens the diff; double click stages or unstages; right-click offers Stage/Unstage and
  Reset for the whole selection, drawn with the application's own menu.
* Range-select several files and stage them: the buttons act on exactly the selected set, and the
  selection afterwards is the neighbouring file (F4).
* Sorting by the icon column still orders by extension.

### App — Env Vars

* Type a value and the file is written. Blank a name: the warning appears, the typed text **stays**,
  and the file is untouched. Fix it and the warning clears and the file is written.
* Swap two variable names one after the other — the intermediate duplicate warns, the final state
  applies.
* Paste a block of cells: one write, not one per cell.
* Add a row with ctrl+Insert and with the add-row button; delete rows with ctrl+Delete. The menu
  says "variable", not "row".
* Switch namespace and profile with an invalid buffer pending: the grid re-seeds from the file.
* The grid takes keyboard focus on open, unless it was opened from a sidebar panel.

### App — Graph detail panel

* Links tab: click an ID cell and type — it edits, and the graph highlights the hovered node. Add a
  row and focus lands on **ID**. Level and Shape open their dropdowns and reject values outside
  their lists. Apply and Cancel both behave.
* Properties tab: a reserved key shows in the error colour, a mixed multi-selection value in the
  warning colour (the two `@layer editor` rules), and the status line under the grid still reports
  "All nodes have the same value" and "Values: …".
* Copying a link row includes its ID.

### App — log grid output

* A script's grid output renders, scrolls and copies.
* Drag a column width, scroll the entry out of view and back: the width is still there.
* A script naming a column absent from its data renders an empty column and **does not crash the
  page** (D8).
* "Open in Grid editor" still works, and the grid is not editable.

## Files changed

| File | Change |
|---|---|
| `components/icons/LanguageIcon.tsx` | Extract `resolveFileIcon`; export `prepareFileIcon`, `useSystemFileIcons` |
| `components/icons/file-icon-markup.tsx` | **New** — memoized `fileIconMarkup` |
| `components/git-tree/git-status-meta.ts` | **New** — shared status table + `gitStatusMarkup` |
| `components/git-tree/GitStatusBadge.tsx` | Consume the shared table |
| `components/file-grid/FileGrid.tsx` | Migrated; state removed; `getTrailing` contract changed |
| `components/file-grid/FileGrid.css` | **New** — `@layer app` cell rules |
| `editors/git-tree/GitChangesView.tsx` | `getTrailing` returns markup |
| `editors/env-vars/EnvVarsBody.tsx` | Migrated per D5 |
| `editors/env-vars/EnvVarsEditor.ts` | `setProfileData` doc comment |
| `editors/graph/GraphDetailPanel.tsx` | Both grids migrated; D2; `resizable` |
| `editors/graph/GraphDetailPanel.css` | `@layer editor`; `.avg-data-cell` |
| `editors/grid/utils/grid-utils.ts` | D8 guard |
| `editors/log-view/items/GridOutputView.tsx` | Migrated per D6 / D7 |
| `doc/epics/EPIC-057.md`, `doc/active-work.md` | Status and note |
| `av-grid/src/options.ts` | Docs-only ordering correction (step 11) |

## Files that need no changes

* **`uikit/DataGrid/`** — the shim is complete for this task. No new props, and no new re-export
  beyond `CellRenderer`, which it already exports.
* **`uikit/AVGrid/`** — untouched; US-1023 deletes it whole.
* **`uikit/index.ts`** — its `AVGrid` re-exports stay until US-1023, so the barrel still compiles.
* **`ui/dialogs/poppers/grid-context-menu.tsx`** — used as-is by `FileGrid`.
* **`components/file-list/FileList.tsx`** — the other `getTrailing` consumer; still React, not on
  this grid, unaffected.
* **`editors/git-tree/CommitDiffPanel.tsx`** — keeps the React `GitStatusBadge` through `FileList`.
* **`components/git-tree/GitTree.tsx`**, **`editors/grid/GridBody.tsx`** — already migrated; read
  them as the precedents and change nothing.
* **`theme/language-icons.tsx`** — the fifty JSX icon bodies stay JSX. See concern 2.
