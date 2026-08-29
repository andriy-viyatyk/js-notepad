# US-1109 — Preserve cleared DataGrid options after invalidation

**Status:** Implemented 2026-08-29 — awaiting batched review (`/review`, `/document`, `/userdoc`)
**Epic:** none
**Decision:** Option 1 — retain invalidated keys with a module-private `Symbol` sentinel

## Goal

Make a value option that disappears from the next `DataGridView` props object observable after
`invalidatePushed()`. The shim must both re-push every value supplied by a new occupant, even when
it is identity-equal to the former occupant's value, and clear old clearable options that the new
occupant does not supply.

## Background

### The shim and the defect

`src/renderer/uikit/DataGrid/DataGridView.ts` is the only production module that calls
`AVGrid.create()` (`:108-118`). It keeps two prop tiers:

- `CALLBACK_KEYS` (`:49-77`) are handled by `syncTrampolines()` and are diffed by presence.
- `INITIAL_ONLY_KEYS` (`:79-86`) are read at creation and never pushed; these are `selected` and
  the shim-owned `onGrid`.
- Every other defined prop is a value-tier option collected by `collectValues()` (`:212-220`) and
  shallow-diffed by identity in `onUpdate()` (`:138-165`).

The relevant current path is:

```ts
const next = this.collectValues(props);
for (const key of new Set([...Object.keys(this.pushed), ...Object.keys(next)])) {
    if (this.pushed[key] !== next[key]) {
        delta[key] = next[key];
        changed = true;
    }
}
this.pushed = next;
```

The union in `onUpdate()` is deliberately meant to turn a disappearing collected key into a
`setOptions({ key: undefined })` delta (`DataGridView.ts:146-163`). However, `collectValues()`
drops `undefined` (`:215-218`), and `invalidatePushed()` currently replaces the baseline with an
empty object (`:198-205`). Therefore, after invalidation, a previous key whose next value is
`undefined` exists in neither object. No delta is created and av-grid keeps its previous option.

The live US-1108 precedent passes the empty grid search string verbatim and records this exact
interaction at `src/renderer/editors/grid/GridBodyView.ts:72-78`. Its `updateDataGrid()` calls
`invalidatePushed()` immediately before the update at `:293-297`.

### Claim verification

#### Claim 1 — Option 2 does not fix the defect: verified

Removing the `value === undefined` filter from `collectValues()` would make an explicitly present
`undefined` appear in `next`, but it would not make it differ from an absent key in the invalidated
baseline. With `this.pushed = {}`:

```ts
this.pushed[key] // undefined — the key is absent
next[key]        // undefined — the prop is explicitly present
this.pushed[key] !== next[key] // false
```

The comparison and the empty-baseline assignment are the current code at
`DataGridView.ts:148-149` and `:203-205`. Option 2 consequently still omits the key from
`setOptions()` after invalidation. It would additionally put explicit `undefined` entries into the
initial `AVGrid.create()` object, because mount spreads `collectValues()` into `create()` at
`:108-118`. That is mount-time risk without fixing this update path. Option 2 is rejected.

#### Claim 2 — Option 1 fixes the lost clear and a second latent defect: verified with scope

Replace the empty baseline with the same key set whose values are a module-private sentinel. The
sentinel is a `Symbol`, declared at module scope in `DataGridView.ts` and not exported:

```ts
const INVALIDATED_VALUE = Symbol("DataGridView invalidated value");
```

For every key previously pushed, `invalidatePushed()` will retain that key with
`INVALIDATED_VALUE`. Since the sentinel is never equal to a real prop value:

- a new owner that supplies the key always produces a delta, including equal-looking rows or
  columns, preserving the method's documented contract (`:198-201`); and
- a new owner that does not supply the key produces a delta whose value is `undefined`, so av-grid
  receives the clear instead of silently retaining the former occupant's option.

The second defect is real at the current call sites. For example, `GridBodyView.gridProps()` can
provide `highlightString` from `editorConfig` (`GridBodyView.ts:79`), then omit it on a later
repoint. With the current empty baseline the old highlight remains unmentioned; with the sentinel
the key differs to `undefined`. av-grid's public `setOptions()` explicitly routes
`searchString`, `filters`, and `sort` through their setters and assigns the remaining option delta
(`node_modules/av-grid/dist/av-grid.js:4582-4586`); its search setter accepts `undefined` as the
clear value (`:2072-2074`). The same path handles `highlightString` when its key is present.

`GridBodyView.gridProps()` has a second conditional value-tier prop:
`growToHeight: maxEditorHeight !== undefined ? \`${maxEditorHeight}px\` : undefined`
(`GridBodyView.ts:100-103`). An embedded-to-non-embedded repoint therefore makes the sentinel
produce a late `setOptions({ growToHeight: undefined })` delta. That delta is inert, and this is
safe: `AVGrid.setOptions()` forwards only `className`, `rowHeight`, `fitToWidth`, `overscanRow`,
`overscanColumn`, and `whiteSpaceY` to `this.render.setOptions(...)`; `growToHeight` and
`growToWidth` are absent from that forwarding list (`node_modules/av-grid/dist/av-grid.js:4584-4586`).

The `this.options` read at av-grid `:2779` and `:2791` is the render layer's own options object:
class `vn` stores the constructor options in `this.options` (`:2674-2699`), and `AVGrid` creates
that render object with `growToHeight` and `growToWidth` at `:4401-4421`. The late public update
only assigns the new values to the model options in `:4585-4586`; it does not update the render
options object. Consequently, dropping `maxEditorHeight` does not resize the grid through this
change. `growToHeight` needs no exemption, but the document must not promise that this task fixes
its independent late-update limitation.

This task is about the shim's lost key delta. It does not claim to repair unrelated upstream
late-update behavior: av-grid's `setOptions()` guards `columns` and `rows` with a truthy check
(`node_modules/av-grid/dist/av-grid.js:4582-4584`). The two invalidating consumers provide `rows`
and `columns` in their grid props (`GridBodyView.ts:66-70`; `GridOutputView.ts:85-90`), so no
structural clear is emitted in this task's blast radius.

The sentinel cannot collide with a real prop value: a module-private `Symbol()` has unique identity,
and the symbol is not available to consumers. `collectValues()` remains an exclusion-based filter;
there is no need to admit `undefined` values into mount-time `create()` options.

### Consumer inventory

There are **8 production `DataGridView` instances in 7 production files**, not five:

| Consumer | Shim instantiation | Calls `invalidatePushed()` | Relevant source |
|---|---:|---:|---|
| Grid editor body | `GridBodyView` | Yes | `src/renderer/editors/grid/GridBodyView.ts:181`, invalidation at `:294-297` |
| Log grid output | `GridOutputView` | Yes | `src/renderer/editors/log-view/items/GridOutputView.ts:50`, invalidation at `:62-70` |
| File grid | `FileGridView` | No | `src/renderer/components/file-grid/FileGridView.ts:29` |
| Git history tree | `GitTreeView` | No | `src/renderer/components/git-tree/GitTreeView.ts:258` |
| Environment variables | `VariablesGridView` | No | `src/renderer/editors/env-vars/EnvVarsBodyView.ts:306-320,352` |
| Graph links tab | `LinksTabView` | No | `src/renderer/editors/graph/GraphDetailPanelView.ts:568-583` |
| Graph properties tab | `PropertiesTabView` | No | `src/renderer/editors/graph/GraphDetailPanelView.ts:625-628` |
| Columns options popover | `ColumnsOptionsContentView` | No | `src/renderer/editors/grid/components/ColumnsOptions.ts:338-370` |

The `DataGridInstance` fields in these views are handles to the instance created by the shim; they
are not additional grid consumers. The direct-handle-only modules are
`src/renderer/components/git-tree/GitTreeModel.ts:70,188`,
`src/renderer/editors/grid/GridEditor.ts:181,216`, and
`src/renderer/editors/grid/index.ts:31,207,280-282`. They do not create or update an
`AVGrid` instance and are outside this change.

`src/renderer/uikit/DataGrid/DataGrid.story.ts` also exercises the shim in its demo branches
(`:58,83,105,110,113`), but it is not an application consumer and needs no source change.

### Invalidation blast radius

The only production call sites are:

1. `src/renderer/editors/grid/GridBodyView.ts:294-297`, before every `gridProps()` update. This
   includes model repointing and ordinary projection updates.
2. `src/renderer/editors/log-view/items/GridOutputView.ts:62-70`, before every output update.

No other `invalidatePushed()` call exists in `src`. Both callers invoke it, but the behavioural
blast radius is **`GridBodyView` alone**: `GridOutputView.gridProps()` always returns the same
seven option keys (`:85-95`), so no option key can disappear there and the sentinel adds no
behaviour beyond the re-push it already performs. The optional `columns` parameter is typed
`Column[] | undefined`; if it were ever `undefined`, the sentinel would emit `columns: undefined`,
which av-grid's `"columns" in e && e.columns` guard skips (`node_modules/av-grid/dist/av-grid.js:4584`).
That is safe, and the current `getInitialColumns()` path returns a `Column[]` (`:79-82`).
The other six production instances continue to use the ordinary value diff.

### Is clearing an omitted option correct?

Yes for the shim's value tier: an option omitted by the new owner must not remain applied from the
old owner on a recycled host. This is the purpose of the union in `onUpdate()` (`:146-153`). No
value-tier prop needs an exemption in this task:

- `selected` is excluded by `INITIAL_ONLY_KEYS` because av-grid owns selection after creation
  (`DataGridView.ts:79-86`).
- Every callback is excluded by `CALLBACK_KEY_SET` (`:49-77`) and handled separately by
  `syncTrampolines()`; callback presence removal already emits `undefined` at `:231-245`.
- `onGrid` is shim-owned and excluded from av-grid values (`:79-86`).
- `highlightString` is conditional at `GridBodyView.ts:79`, but av-grid handles a present
  `undefined` through its generic option assignment and search-word refresh path, so the sentinel
  correctly removes a previous highlight.
- `growToHeight` is conditional at `GridBodyView.ts:100-103`, but its late `undefined` update is
  inert: the render layer owns the `this.options` read at av-grid `:2779` and `:2791`, while the
  public update only changes model options and forwards no `growToHeight`/`growToWidth` render
  option (`node_modules/av-grid/dist/av-grid.js:2674-2699,4401-4421,4584-4586`). It therefore
  needs no exemption and cannot resize a recycled host as a consequence of this fix.
- The affected callers provide `rows` and `columns` on every update, so the upstream truthy guards
  do not turn this task into an attempted structural reset (`GridBodyView.ts:66-70`;
  `GridOutputView.ts:85-90`).

The current `GridBodyView` comment should be shortened to retain the semantic reason for passing
`state.search` verbatim, while removing its now-obsolete explanation that invalidation makes an
empty value unrepresentable. This is a comment-only consumer change; no consumer behavior or prop
shape changes are planned.

## Implementation Plan

1. In `src/renderer/uikit/DataGrid/DataGridView.ts`, add the module-private
   `INVALIDATED_VALUE = Symbol("DataGridView invalidated value")` beside the existing key sets.
   Do not export it and do not add it to `DataGridProps`.
2. Change `DataGridView.invalidatePushed()` so it replaces every key in the current `pushed`
   object with `INVALIDATED_VALUE`, preserving keys while discarding their previous identities. An
   `Object.fromEntries(Object.keys(this.pushed).map(...))` implementation is suitable and also
   preserves arbitrary own key names safely.
3. Keep `onUpdate()`'s union comparison and `collectValues()`'s `undefined` exclusion unchanged.
   The resulting flow must be: retained sentinel → `sentinel !== next[key]` → delta entry →
   `pushDelta()` → `grid.setOptions({ key: undefined })` for an omitted old value.
4. Update the explanatory JSDoc above `invalidatePushed()` in the same file to document both
   guarantees: all next-owner values are re-pushed, and old value-tier keys absent from the next
   owner are represented as clears.
5. In `src/renderer/editors/grid/GridBodyView.ts:72-78`, retain `searchString: state.search` and
   revise only the comment so it explains that the empty string is the explicit “no search” value;
   remove the obsolete claim that `invalidatePushed()` makes an undefined clear disappear. The
   same comment should mention that `highlightString` may be absent and that
   `growToHeight` (`:100-103`) is a construction-time layout option whose late clear is inert in
   av-grid.
6. Do not alter any consumer's props, lifecycle, `DataGridInstance` handle, or invalidation call
   sites. Do not add unit tests or a test harness. After implementation, run the existing
   `npm run typecheck`, `npm run lint`, and `npm run build-prod` checks, then manually smoke the
   existing DataGrid story and the behavioural blast-radius surface: GridBody repointing from
   highlighted/embedded to ordinary mode, including search clear. Confirm log-output replacement
   still mounts and re-pushes its constant option set.

## Concerns

- The sentinel fixes the shim's representation and dispatch problem, not every limitation in
  av-grid's late `setOptions()` implementation. `growToHeight` and `growToWidth` are construction-
  time render options: their late values land only in model options because they are absent from
  the public method's `this.render.setOptions(...)` forwarding list. The render layer's own
  `this.options` is therefore unchanged, making a late `growToHeight: undefined` inert and safe.
  The upstream truthy guards for `rows`/`columns` are likewise outside this task; current
  invalidating callers provide those structural options. The primary cleared values
  (`searchString` and `highlightString`) have explicit upstream clear paths.
- `selected`, callbacks, and `onGrid` must remain outside the sentinel key set. Changing
  `INITIAL_ONLY_KEYS`, `CALLBACK_KEYS`, or `syncTrampolines()` would change selection ownership or
  callback presence semantics and is not required by this defect.
- The existing story is a manual integration surface, not a replacement for source inspection or
  a newly written harness. No test files are to be created.

## Acceptance Criteria

- `invalidatePushed()` retains exactly the old value-tier key set with a module-private `Symbol`
  sentinel; the sentinel is not exported and cannot equal a consumer value.
- `collectValues()` still drops `undefined`, and mount-time `AVGrid.create()` options are unchanged
  for all existing consumers.
- After invalidation, an old key omitted by the next collected props produces a delta with value
  `undefined`; an old key supplied by the new owner always produces a delta, even when the new
  value is identity-equal to the old value.
- `searchString` clears correctly through the existing GridBody path, and an omitted old
  `highlightString` is dispatched as a clear rather than retained.
- An embedded-to-non-embedded GridBody repoint may dispatch
  `growToHeight: undefined`, but the late update is inert because the render layer's own options
  remain unchanged; no resize regression is introduced.
- `selected`, callback props, and `onGrid` are not added to the value-tier invalidation baseline.
- All 8 production shim consumers remain unchanged in behavior. The behavioural blast radius is
  GridBodyView alone; GridOutputView's constant key set is re-pushed as before, and the existing
  story still mounts.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- No unit tests, test harnesses, package changes, or commits are introduced.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/uikit/DataGrid/DataGridView.ts` | Add the private sentinel; retain invalidated keys in `invalidatePushed()`; update its contract comment. Leave `onUpdate()`, `collectValues()`, callback handling, and `INITIAL_ONLY_KEYS` behavior intact. |
| `src/renderer/editors/grid/GridBodyView.ts` | Comment-only clarification at `:72-78`; keep the existing verbatim `searchString` value and all runtime behavior unchanged. |

Files explicitly needing **no changes**:

- `src/renderer/editors/log-view/items/GridOutputView.ts`
- `src/renderer/components/file-grid/FileGridView.ts`
- `src/renderer/components/git-tree/GitTreeView.ts`
- `src/renderer/editors/env-vars/EnvVarsBodyView.ts`
- `src/renderer/editors/graph/GraphDetailPanelView.ts`
- `src/renderer/editors/grid/components/ColumnsOptions.ts`
- `src/renderer/components/git-tree/GitTreeModel.ts`
- `src/renderer/editors/grid/GridEditor.ts`
- `src/renderer/editors/grid/index.ts`
- `src/renderer/uikit/DataGrid/DataGrid.story.ts`
- `src/renderer/uikit/DataGrid/types.ts`
- `src/renderer/uikit/DataGrid/index.ts`
- `package.json` and `package-lock.json` — `av-grid` remains pinned at `2.2.4` (`package.json:57`).
- Any test file or test harness — none is to be added.


## Implementation record (2026-08-29)

**Shipped**, four runtime lines: `invalidatePushed()` rebuilds `pushed` with every existing key
mapped to a module-private `INVALIDATED_VALUE` symbol, plus its contract JSDoc, a docstring on the
sentinel, and two re-homed comments in `GridBodyView` (`searchString`'s semantic reason, and a note
on `growToHeight` placed beside `growToHeight` rather than three props away).

**Plan review caught two things before implementation:**

1. The document's original recommendation (option 2 — stop dropping `undefined` in
   `collectValues`) **does not fix the defect**. After `invalidatePushed()` the baseline is empty,
   so the diff is `undefined !== undefined` → false, no delta. It would only have added
   mount-time risk. Reversed.
2. The corrected document analysed `highlightString` as the conditional prop that would now be
   actively cleared, and **missed `growToHeight`** (`GridBodyView.ts:100-106`), which flips on
   exactly the embedded-to-non-embedded repoint this feature exists for — while the document had
   already named `growToHeight` as construction-time-applied and then excluded it with an argument
   about `rows`/`columns`. Verified inert independently: av-grid's `setOptions` forwards only
   `className`/`rowHeight`/`fitToWidth`/`overscan*`/`whiteSpaceY` to the render layer
   (`av-grid.js:4584`), and the render layer's own `setOptions` at `:2736` is the only writer of
   the options object that sizes the grid. Had it gone the other way this fix would have
   *introduced* a resize regression.

**Verification.** `typecheck`, `lint`, `build-prod` green. Runtime, on a scratch `grid-json` page
created and closed for the purpose: 21 cells -> search `beta` -> 9 cells -> clear -> 21 cells,
0 React roots. Every keystroke runs `invalidatePushed()`, so that round trip exercises the changed
path end to end.

**Honest limit:** the newly-fixed case is latent by definition — no current consumer maps a cleared
value to `undefined`. What is demonstrated is that existing behaviour is intact and the mechanism
now works; no user-visible bug disappears, because there was not one yet.
