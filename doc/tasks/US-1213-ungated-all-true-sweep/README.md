# US-1213 - Re-derive and fix the ungated `{ all: true }` sites

## Goal

Enforce the existing VirtualGrid dirty-cell contract at every current caller, converting bounded
updates to `{ rows: [...] }` and documenting every whole-cell invalidation that legitimately remains
`{ all: true }`. Also gate the unrelated full `CategoryListView.groupItems()` pass on the inputs it
actually consumes.

This is a planning document only. No implementation, tests, test harnesses, dashboard entry, or
commit belongs in this phase.

The payoff is viewport-to-changed-row work, not O(collection)-to-O(1): the virtualizer already bounds
`{ all: true }` rendering to the currently rendered window. The additional machinery is justified on
the repeated log-entry-update and arriving-search-batch paths, where a small changed set otherwise
repaints roughly the whole visible window on every tick. It also enforces the existing contract above.

## Background

EPIC-077 statement 2 requires that a full repaint not be used when the changed cells are bounded
([`EPIC-077.md:36-40`](../../epics/EPIC-077.md#c-1--the-closing-property)). Correction 4 requires
this task to derive its own current site list, because the plan and earlier citations have drifted
([`EPIC-077.md:111-119`](../../epics/EPIC-077.md#c-2--measured-baseline-2026-08-30-branch-upcoming-v4023)).
Correction 9 is important context: this is enforcement of a contract already written in the
library, not a new performance preference ([`EPIC-077.md:158-162`](../../epics/EPIC-077.md#c-2--measured-baseline-2026-08-30-branch-upcoming-v4023)).

The contract is explicit. `src/renderer/uikit/VirtualGrid/types.ts:64` says:

> A change reports *only the cells whose rendered output actually changed*. Growing a range
> selection by one cell must produce `{ cells: [thatCell, theCellThatLostIt] }`, never
> `{ rows: [...] }` and never `{ all: true }`. Every performance claim this project makes
> rests on that discipline being kept everywhere a `RerenderInfo` is constructed.

The relevant type declaration is immediately below that comment: `RerenderInfo` offers
`all?: boolean`, `rows?: Array<number>`, and the more precise `cells?: Array<RenderCell>` at
[`types.ts:64-75`](../../../src/renderer/uikit/VirtualGrid/types.ts#L64-L75).

`VirtualGridModel.ts:34` repeats the consequence: comparing scroll offset would call
`updateRenderInfo({ all: true })` and rebuild every visible cell. Its `inputChanged()` comment at
[`VirtualGridModel.ts:354-362`](../../../src/renderer/uikit/VirtualGrid/VirtualGridModel.ts#L354-L362)
states that the offset is deliberately excluded because the directional scroll path renders only
newly exposed cells; comparing it would rebuild every visible cell 60 times per second. These are
the reasons this task treats each caller as guilty until it can name its exemption.

The implementation must preserve the epic's distinction: a mechanical `{ all: true }` to `{ rows }`
replacement can render the wrong set of cells and leave stale DOM. That defect is silent: it
typechecks, lints, and builds cleanly. The row set must be derived from the actual changed data at
each conversion site.

### Fresh census

The exact census command used against the current tree was:

```text
rg -n -U -g '*.ts' '(?:updateRenderInfo|update)\s*\(\s*\{\s*all\s*:\s*true\s*\}\s*\)|groupItems\s*\(' src/renderer
```

It returned the following actual matches. The two `VirtualGridModel.ts` comment matches at lines 34
and 358 were manually excluded as prose; the remaining VirtualGrid matches are classified below as
the primitive's own behavior. No other `update({ all: true })`, `updateRenderInfo({ all: true })`, or
`groupItems(` match was found under `src/renderer`.

| Current source location | Match | Classification |
|---|---|---|
| [`components/file-search/FileSearchView.ts:73`](../../../src/renderer/components/file-search/FileSearchView.ts#L73) | File-icon subscription repaint | Exempt, with a reason |
| [`components/file-search/FileSearchView.ts:143`](../../../src/renderer/components/file-search/FileSearchView.ts#L143) | `resultsVersion` repaint | Convert |
| [`components/tree-provider/CategoryViewImpl.ts:385`](../../../src/renderer/components/tree-provider/CategoryViewImpl.ts#L385) | queued bridge repaint | Exempt, with a reason |
| [`editors/link-editor/LinksTilesView.ts:129`](../../../src/renderer/editors/link-editor/LinksTilesView.ts#L129) | width/column resize repaint | Exempt, with a reason |
| [`editors/link-editor/LinksTilesView.ts:182`](../../../src/renderer/editors/link-editor/LinksTilesView.ts#L182) | unconditional props-update repaint | Convert |
| [`editors/log-view/LogBodyView.ts:132`](../../../src/renderer/editors/log-view/LogBodyView.ts#L132) | timestamp-format repaint | Exempt, with a reason |
| [`editors/log-view/LogBodyView.ts:153`](../../../src/renderer/editors/log-view/LogBodyView.ts#L153) | bounded entry/row-set repaint, with an explicit full-parse/clear sentinel branch | Convert |
| [`editors/notebook/NotebookBodyView.ts:232`](../../../src/renderer/editors/notebook/NotebookBodyView.ts#L232) | projection repaint | Exempt, with a reason |
| [`uikit/ListBox/ListBoxView.ts:213`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L213) | signature-gated content repaint | Convert |
| [`uikit/Tree/TreeView.ts:127`](../../../src/renderer/uikit/Tree/TreeView.ts#L127) | external icon repaint | Exempt, with a reason |
| [`uikit/Tree/TreeView.ts:166`](../../../src/renderer/uikit/Tree/TreeView.ts#L166) | signature-gated content repaint | Convert |
| [`uikit/Tree/TreeView.ts:204`](../../../src/renderer/uikit/Tree/TreeView.ts#L204) | state-apply repaint | Convert |
| [`uikit/VirtualGrid/VirtualGridModel.ts:179`](../../../src/renderer/uikit/VirtualGrid/VirtualGridModel.ts#L179) | option-input change | Not this task |
| [`uikit/VirtualGrid/VirtualGridModel.ts:295`](../../../src/renderer/uikit/VirtualGrid/VirtualGridModel.ts#L295) | measured-size/input change | Not this task |
| [`uikit/VirtualGrid/VirtualGridView.ts:284`](../../../src/renderer/uikit/VirtualGrid/VirtualGridView.ts#L284) | whitespace-only engine geometry change | Not this task |
| [`uikit/VirtualGrid/VirtualGridView.ts:552`](../../../src/renderer/uikit/VirtualGrid/VirtualGridView.ts#L552) | post-paint scrollbar settlement | Not this task |
| [`uikit/CategoryList/CategoryListView.ts:96`](../../../src/renderer/uikit/CategoryList/CategoryListView.ts#L96) | ungated `groupItems(props.items, separator)` | Convert |

Classification counts for this census are **convert: 7, exempt: 6, not this task: 4**. The
`CategoryListView` item is included in the counts as the requested separate primitive pass, so the
total is 17 findings rather than 16 VirtualGrid calls.

## Classification findings

### Convert

#### `FileSearchView.ts:143` - derive the changed filtered suffix

The `resultsVersion` subscription first replaces `this.filtered` with
`this.model.getFilteredResults()` and then repaints. `FileSearchModel` keeps the flat result array
outside state and bumps `resultsVersion` for three materially different operations:

- a new search or clear replaces/removes the result set from index zero;
- an IPC batch appends file and line rows at the old filtered length; and
- `toggleFileExpanded(filePath)` mutates one file row and removes or restores its following line
  rows, shifting the visible suffix.

The view cannot safely infer the file-row expansion change by comparing object identities, because
`toggleFileExpanded()` mutates the existing file row in place. Publish a plain numeric
`firstChangedRow` field in `FileSearchModel` alongside `resultsVersion`, and select both fields in
the same view projection. The producer must publish zero for reset/full replacement, the old filtered
length for an append, and the file row's filtered index for a toggle. This is persistent state, not a
destructive side channel: the view reads the companion field whenever it observes the version change.
In the view, the exact row expression is:

```ts
const previousRowCount = this.filtered.length;
// `firstChangedRow` comes from the same projection as the observed `resultsVersion`.
const rows = Array.from(
    { length: Math.max(0, this.filtered.length - firstChangedRow) },
    (_, offset) => firstChangedRow + offset,
);
if (import.meta.env.DEV && previousRowCount === this.filtered.length && rows.length === 0) {
    console.warn("FileSearch resultsVersion changed without a published changed row");
}
this.grid?.model.update({ rows });
```

If `firstChangedRow` is wrong or the suffix is truncated, the file header, a newly appended line,
or every shifted row after an expand/collapse can remain stale. The model must also make the empty
result transition update the grid row count; therefore the update is not guarded by `rows.length`.
The DEV-only warning covers the especially dangerous unchanged-count/empty-set case: it identifies a
producer that bumped `resultsVersion` without publishing the row that changed.

The separate `FileSearchView.ts:73` icon callback is not part of this conversion; it is classified
below as a global icon-cache exemption.

#### `ListBoxView.ts:213` - split bounded selection/active changes from all-row inputs

`repaintRows()` is gated by `ListBoxModel.repaintSignature()` at
[`ListBoxView.ts:200-214`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L200-L214). The
signature is not uniformly global: `activeIndex` changes affect the old and new active rows, and a
value-based selection change affects the old and new selected rows. Those bounded cases must not be
sent as `{ all: true }`. The signature also includes true all-row inputs (`liveItems`, search text,
renderer identity, tooltip/selection predicate identity, variant, selection style, and checkbox
mode), which may retain `{ all: true }` behind a visibly named global branch.

Replace the boolean-only consequence with a source-derived change result. The bounded row expression
for the active/value-only case is:

```ts
const rows = [...new Set([
    this.lastActiveIndex,
    this.model.activeIndex,
    this.lastSelectedIndex,
    this.model.selectedRowIndex(),
].filter((row): row is number => row !== undefined && row >= 0))];
```

The model/view gate must identify when only those row-local slots moved. For an item collection,
search/render callback, tooltip/selection predicate, variant, selection style, checkbox, or other
all-row signature slot, retain `{ all: true }` with a comment that names that slot. If the selection
signal represents an arbitrary external set and cannot provide changed indices, it belongs to that
documented all-row branch rather than a guessed row list.

If either old/new active or selected index is omitted, its visual state can remain stuck on the old
row. If a global signature slot is incorrectly treated as row-local, rows outside the guessed set
will retain old labels, highlights, tooltips, or custom content. Conversely, if every signature
change still takes the all-row branch, this conversion has not enforced the contract.

Before:

```ts
const contentChanged = this.repaintGate.changed(this.model.repaintSignature());
if (contentChanged) this.grid?.model.update({ all: true });
```

After:

```ts
const repaint = this.model.deriveRepaintChange(this.repaintGate.changed(this.model.repaintSignature()));
if (repaint) this.grid?.model.update(repaint);
```

The exact API name is illustrative; the implementation must preserve the fixed-length signature and
make the bounded-versus-global decision from the actual changed signature slots. Do not use a plain
`contentChanged ? { rows: allRows } : undefined` replacement.

#### `TreeView.ts:166` - split row-local props from all-row props

The `onUpdate()` path uses `TreeModel.repaintSignature()` through `repaintGate.changed()` at
[`TreeView.ts:161-170`](../../../src/renderer/uikit/Tree/TreeView.ts#L161-L170). As with ListBox,
this signature mixes row-local inputs (`activeIndex`, normalized selected key) with all-row inputs
such as the visible row projection, search text, custom renderer, indentation, tooltip callback,
selection predicate identity, element ID, and DnD callback inputs.

Change the gate consequence to return the union of the old/new active and selected row indices when
those are the only changed slots:

```ts
const rows = [...new Set([
    this.lastActiveIndex,
    props.activeIndex,
    this.lastSelectedIndex,
    this.model.selectedRowIndex(),
].filter((row): row is number => row !== undefined && row >= 0))];
```

For a row-projection change, use the same model-owned visible-row diff described for `TreeView.ts:204`;
for search/custom-renderer/indent/tooltip/selection/DnD-input changes, retain a separately commented
`{ all: true }` branch. Do not use the current row count as a substitute for a changed-row set when
only active or selected state moved. If the old active/selected row is omitted, its stale highlight
or selection can remain in a pooled wrapper; if an all-row input is misclassified as row-local, cells
outside the guessed set will retain stale content.

Before:

```ts
const contentChanged = this.repaintGate.changed(this.model.repaintSignature());
if (contentChanged) {
    this.grid?.model.update({ all: true });
}
```

After:

```ts
const repaint = this.model.deriveRepaintChange(this.repaintGate.changed(this.model.repaintSignature()));
if (repaint) this.grid?.model.update(repaint);
```

The callback still needs the state-apply path's separate payload at :204; do not conflate a props
signature change with the state funnel.

#### `LinksTilesView.ts:182` - repaint only after link data changes

`onUpdate()` computes `linksChanged` from `props.links !== this.subscribedLinks` and
`viewModeChanged` from `props.viewMode !== this.previousViewMode` at
[`LinksTilesView.ts:176-183`](../../../src/renderer/editors/link-editor/LinksTilesView.ts#L176-L183).
The tile renderer maps a grid coordinate to `this.props.links[params.row * columnCount + params.col]`
at [`LinksTilesView.ts:97-109`](../../../src/renderer/editors/link-editor/LinksTilesView.ts#L97-L109).

When `linksChanged`, every current tile row may have a new link, so the row expression is the
bounded current row set:

```ts
Array.from({ length: this.rowCount() }, (_, row) => row)
```

Use it only for `linksChanged`. A `viewModeChanged` update already flows through
`this.grid.update(this.gridOptions())`; the changed row height/column-count inputs are handled by
the VirtualGrid option-change path, and the explicit all-row call must not be retained merely for a
view-mode transition. If the row count or list identity is calculated incorrectly, a tile beyond
the supplied set can continue displaying the previous link or stale action/selection state.

Before:

```ts
this.grid.update(this.gridOptions());
this.grid.model.update({ all: true });
```

After:

```ts
this.grid.update(this.gridOptions());
if (linksChanged) {
    this.grid.model.update({
        rows: Array.from({ length: this.rowCount() }, (_, row) => row),
    });
}
```

Do not alter the existing `LinksTilesView.ts:129` resize site as a conversion; its exemption is
documented below.

#### `LogBodyView.ts:153` - publish and apply the entry change description

The current `LogBodyView` state projection is already the post-US-1214 shape: it uses
`entriesVersion` and `entryCount`, and renders entries through `LogViewEditor.getEntryAt()` at
[`LogBodyView.ts:31-32,49-65`](../../../src/renderer/editors/log-view/LogBodyView.ts#L31-L65). The
current `applyRowsAndAutoScroll()` still calls `{ all: true }` at :153. US-1214 explicitly leaves
this conversion to US-1213; its `dirtyIndices` is currently a serialization set, not a complete
render invalidation journal ([`US-1214 README:149-156`](../US-1214-log-view-entries-out-of-immer/README.md#change-notification-and-repaint-interaction)).

Add a plain model-side render-change field in `LogViewEditorState`, alongside `entriesVersion` and
separate from `dirtyIndices`. This field is published as part of the same state projection that the
view observes; it is not read destructively and must not be an Immer array containing a full parse's
indices. Use a small point-update array, an append range whose `to` is exclusive, or an explicit
everything sentinel:

```ts
type LogRenderChange =
    | number[]
    | { from: number; to: number }
    | "all";
```

Every entry producer must publish the affected description before publishing `entriesVersion`:

- full parse/replacement: `"all"`, never an array containing every new entry index;
- incremental append: `{ from: oldEntryCount, to: newEntryCount }`;
- upsert, dialog resolution, text update, and `updateEntryAt`: a small array containing the exact
  found/updated index or indices; and
- clear: `"all"`, because the current projection is being removed and `entryCount` changes.

`LogBodyView.applyRowsAndAutoScroll()` must read `renderChange` from the same projection as
`entriesVersion` and derive the exact bounded set for point/range changes. The full-parse/clear
sentinel is the one legitimate whole-projection branch and must retain a nearby comment stating that
the published state says the complete entry projection was replaced or cleared:

```ts
const change = projection.renderChange;
const rows = Array.isArray(change)
    ? change
    : change === "all"
        ? undefined
        : Array.from(
              { length: change.to - change.from },
              (_, offset) => change.from + offset,
          );
if (
    import.meta.env.DEV &&
    previousEntryCount === count &&
    (Array.isArray(change) ? change.length === 0 : change !== "all" && change.from === change.to)
) {
    console.warn("Log entriesVersion changed without a published changed entry");
}
if (change === "all") {
    // The model published a full parse or clear; every current entry projection was replaced.
    this.grid.gridModel?.update({ all: true });
} else {
    this.grid.gridModel?.update({ rows: rows ?? [] });
}
```

If an entry producer fails to record its index, that entry's visible cell can remain stale even
though `entriesVersion` changes. If an append publishes too short a range, new entries can be absent;
if an update publishes the wrong index, a different log row will be repainted while the changed row
stays stale. The DEV-only assertion catches the unchanged-count/empty-description version of that
producer bug. Preserve the existing auto-scroll behavior and the separate timestamp exemption.

Before:

```ts
private applyRowsAndAutoScroll(count: number): void {
    this.clearScrollTimers();
    this.grid.gridModel?.update({ all: true });
    // auto-scroll and previousEntryCount bookkeeping
}
```

After:

```ts
private applyRowsAndAutoScroll(count: number): void {
    this.clearScrollTimers();
    const change = projection.renderChange;
    const rows = deriveRows(change);
    if (change === "all") {
        // The model published a full parse or clear; every current entry projection was replaced.
        this.grid.gridModel?.update({ all: true });
    } else {
        this.grid.gridModel?.update({ rows });
    }
    // auto-scroll and previousEntryCount bookkeeping
}
```

#### `TreeView.ts:204` - carry the state change's actual row set through the funnel

`TreeModel` deliberately funnels state writes through `mutate()` and calls the host callback
`onStateApplied` after the write ([`TreeModel.ts:88-115`](../../../src/renderer/uikit/Tree/TreeModel.ts#L88-L115)).
The current `TreeView.refresh()` must also update root `aria-activedescendant`, so removing the
callback is not an option. Its final grid repaint at :204 is nevertheless too broad:

- expansion/collapse changes one row and, when visible indices shift, the suffix beginning at the
  first changed row;
- lazy-load completion changes the affected visible projection; and
- drag state changes only the rows whose dragging/drop/loading flags changed.

Change the model callback payload to carry a `rows: number[]` dirty set. The model should compare the
old and newly derived `TreeRow` projections in the existing `mutate()` funnel, taking the first
changed visible index through the end of the shifted suffix for expansion/collapse, and explicitly
collecting the rows whose transient state flags changed for `mutateState()`/DnD writes. This must be
done before the callback runs; the view cannot recover the old row projection after the model has
replaced it.

The exact view-side expression is then the payload produced by the model:

```ts
private refresh = (change: { rows: number[] }): void => {
    if (this.inert) return;
    // existing arm and aria-activedescendant work
    this.grid?.model.update({ rows: change.rows });
};
```

If the diff starts too late, rows shifted by a collapse can display the wrong item. If transient
drag rows are omitted, drop feedback can stick to a recycled cell. If the model reports the old
indices instead of current indices, the same silent stale-cell defect occurs after a row insertion
or removal. Keep the existing root-attribute work and the `repaintGate.prime()` call; this change is
only the state-to-grid dirty-set consequence.

The separate `TreeView.ts:127` icon-cache callback and the props-gated :166 call are retained as
documented exemptions below.

#### `CategoryListView.ts:96` - gate the full grouping pass

`buildRows()` unconditionally calls `groupItems(props.items, separator)` at
[`CategoryListView.ts:94-96`](../../../src/renderer/uikit/CategoryList/CategoryListView.ts#L94-L96),
although `groupItems()` only reads the item array and separator at
[`CategoryListView.ts:148-189`](../../../src/renderer/uikit/CategoryList/CategoryListView.ts#L148-L189).
Value, selection, root label, and count changes do not change the grouping maps. Cache the grouped
result by `props.items` identity and the normalized separator, and recompute it only when either
input changes. Keep the existing `KeyedList` row update for the derived `RowData[]`.

Before:

```ts
const separator = props.separator ?? ":";
const { groups, children } = this.groupItems(props.items, separator);
```

After:

```ts
const separator = props.separator ?? ":";
const grouped = this.groupedItems;
const { groups, children } =
    grouped?.items === props.items && grouped.separator === separator
        ? grouped
        : this.cacheGroupedItems(props.items, separator);
```

The cache must not assume that callers mutate an items array in place. If the project intends to
support stable-identity in-place mutation here, add an explicit version/change signal instead of
silently returning stale groups. A wrong cache key would omit a newly introduced group, child, or
separator interpretation; a cache that is not used for value-only updates would leave the original
O(items) pass in place.

### Exempt, with a reason

Every survivor below must retain a nearby comment in the implementation. The comment must state the
actual invalidation reason, not merely say "full repaint" or "needed for correctness".

| Site | Evidence and required comment reason |
|---|---|
| `FileSearchView.ts:73` | `subscribeFileIconElements()` invalidates the shared file-icon projection. The callback clears/rebuilds icons used by any visible file result, and the view has no per-path dirty set. Keep `{ all: true }` with a comment naming the global icon-cache invalidation. |
| `CategoryViewImpl.ts:385` | `flushPendingGridRepaintSoon()` runs after the opaque `renderItems()` bridge has created or updated the complete child projection. `CategoryViewImpl` receives only `GridModelCapability`, not the child renderer's item-to-row mapping; a selection/search/provider/view-mode projection can replace or reshape the entire bridged grid. Keep `{ all: true }` with a comment naming the opaque full-projection bridge and why row indices cannot be derived here. |
| `LinksTilesView.ts:129` | `onGridResize()` changes measured width and/or `columnCountValue`. Width changes cell geometry, and a column-count threshold changes the link-to-row mapping; every current tile row can need a new style or link admission. Keep `{ all: true }` with a comment naming width/column geometry invalidation. |
| `LogBodyView.ts:132` | `showTimestamps` is a global format toggle read by every `LogEntryWrapperView` through `entryProps()`. Keep `{ all: true }` with a comment naming the all-entry timestamp format change. |
| `NotebookBodyView.ts:232` | The current US-1215 projection gate compares categories, tags, search text, notes version, and filtered version. Those values are passed into every note cell and/or change the complete filtered row projection. Keep `{ all: true }` with a comment naming the global note-cell projection invalidation. Do not replace this with a guessed single row. |
| `TreeView.ts:127` | `refreshRows()` is called by the shared file-icon cache subscriber in `TreeProviderViewImpl` and by board/tool icon projections. The cache invalidation is global to the tree's external icon projection, and the Tree view has no per-icon dirty-row index. Keep `{ all: true }` with a comment naming the external icon-cache invalidation. |

The comments at the two resize/format sites must remain adjacent to the calls so a future sweep can
verify the exemption without reconstructing the call graph. The converted sites must have no
*unguarded* `{ all: true }` left at their call sites; the LogBody full-parse/clear sentinel is the
explicit, commented full-projection branch described above.

### Not this task

The four VirtualGrid-internal matches are deliberately excluded from caller cleanup:

- `VirtualGridModel.ts:179` is the model's own response to a changed engine input signature in
  `setOptions()`; row count, column count, row/column dimensions, renderer identity, sticky regions,
  and related inputs can change the geometry/content contract for every visible cell.
- `VirtualGridModel.ts:295` is the model's own response to measured size/scrollbar input changes in
  `onFrameResize()`; it must recompute the geometry and visible cell styles after the viewport
  measurement changes.
- `VirtualGridView.ts:284` is the view's internal whitespace/engine geometry escape hatch. It is
  reached only for a whitespace-only layout input that the model's input signature intentionally
  excludes, and its purpose is a geometry pass rather than a caller data repaint.
- `VirtualGridView.ts:552` is the post-paint scrollbar-settlement recompute. The scrollbar exists
  only after the paint, so changing the measured thickness requires recomputing every affected cell
  geometry; a row dirty set would not update the computed widths.

Do not alter `VirtualGrid/types.ts`, `VirtualGrid/VirtualGridModel.ts`, `VirtualGrid/VirtualGridView.ts`,
`VirtualGrid/renderInfo.ts`, or `VirtualGrid/rerender-check.ts` in this task. Their existing comments,
dirty-set preparation, and internal escape hatches are the contract being enforced by callers.

## Implementation Plan

1. **Reconfirm the baseline immediately before editing.** Run the exact census command above and
    verify that current line numbers still match the classification table. Run a second focused search
    for `state.entries`, `dirtyIndices`, `resultsVersion`, `onStateApplied`, and `groupItems` while
    implementing the changes, so the recent US-1214 and US-1215 source changes are not overwritten.
    This task must be implemented after US-1214 and US-1215 have landed; the LogBodyView and
    NotebookBodyView citations in this document describe their current post-task shapes. In
    particular, `dirtyIndices` is a JSONL-serialization set and must not be repurposed as the render
    journal.

2. **Convert file-search results in `src/renderer/components/file-search/FileSearchModel.ts` and
   `FileSearchView.ts`.** Add the plain `firstChangedRow` state field alongside `resultsVersion`,
   publish zero/old-length/file-row indices at the reset, append, and expand-collapse mutation sites,
   and read it from the same version projection to pass the resulting suffix as `{ rows }`. Do not
   introduce a destructive `consume...()` channel. Always update the grid for row-count transitions;
   under `import.meta.env.DEV`, warn when the version changes with unchanged row count and an empty
   derived set. Preserve `applyArm()`, grid creation/disposal, row object rendering, and file-icon
   subscription behavior. Add the global-icon comment at :73.

3. **Convert link-tile props updates in `src/renderer/editors/link-editor/LinksTilesView.ts`.**
   Replace only the unconditional :182 call with the `linksChanged` row expression. Preserve
   `grid.update(gridOptions())`, view-mode scrolling, async favicon/image row maps, and the
   resize-time all-row geometry call at :129. Add the width/column reason beside :129.

4. **Convert the ListBox signature gate in `src/renderer/uikit/ListBox/ListBoxModel.ts` and
   `ListBoxView.ts`.** Add the model's narrow `selectedRowIndex()` helper and the repaint-change
   result that distinguishes old/new active and selected rows from all-row signature slots. Keep the
   fixed-length `repaintSignature()` and `DepsGate`; use `{ rows }` for the bounded union and a
   nearby-reasoned `{ all: true }` only for the explicitly identified all-row slots. Maintain
   `lastActiveIndex`/the new selected-row tracking before the gate consumes the signature.

5. **Convert log entry repainting in `src/renderer/editors/log-view/LogViewEditor.ts` and
   `LogBodyView.ts`.** Add a state-published render-change field alongside `entriesVersion`, separate
   from `dirtyIndices`: a small index array for point updates, an exclusive `{ from, to }` append range,
   and an `"all"` sentinel for full parse/clear. Make every current entry producer publish the exact
   description before its version update; the view must read it from the same projection, never consume
   a mutable journal. Under `import.meta.env.DEV`, warn when the version changes with unchanged row
   count and an empty array/zero-length range. Preserve `entryCount`, auto-scroll, dirty
   serialization, and the timestamp branch. Add the timestamp-format comment beside :132.

6. **Convert Tree state and props repainting in `src/renderer/uikit/Tree/TreeModel.ts` and
   `TreeView.ts`.**
   Extend the existing `onStateApplied` funnel with a source-derived dirty-row payload, diff visible
   row projections for expansion/lazy-load changes, collect transient DnD rows, and pass that payload
   as `{ rows }` at the current :204 path. Split the props signature gate at :166 into row-local
   active/selection rows and explicitly commented all-row branches for all-row signature inputs. Keep
   the root attribute update and gate priming. Add the external-icon comment at :127.

7. **Gate grouping in `src/renderer/uikit/CategoryList/CategoryListView.ts`.** Cache the output of
   `groupItems()` by the actual `items` array identity and normalized separator, invalidate the cache
   on those inputs, and leave `KeyedList.update()` responsible for row-level DOM updates. Verify
   that count/value/selection changes still update existing rows without regrouping.

8. **Annotate the remaining caller exemptions.** Add source-backed comments at
   `FileSearchView.ts:73`, `CategoryViewImpl.ts:385`, `LinksTilesView.ts:129`,
   `LogBodyView.ts:132`, `NotebookBodyView.ts:232`, and `TreeView.ts:127`. Any all-row branch
   retained while splitting the ListBox/Tree signature gates must have the same source-backed
   comment. A surviving `{ all: true }` without a nearby reason comment fails this task.

9. **Verify the final census and behavior.** Re-run the exact census command, inspect every result,
   and confirm that only the four deliberate VirtualGrid-internal calls remain unannotated by caller
   logic. Run `npm run lint` and the project's normal build if implementation is requested later;
   this project has no unit-test suite, so do not add tests or a test harness. Exercise each converted
   path using the running-app scenarios below and inspect for stale cells after both append/update and
   row insertion/removal cases.

## Concerns

The primary risk is the one named by EPIC-077 §C-5:

> **"Ungated rebuild" is not the same as "wasteful rebuild".** Correction 4 is the warning: four of
> five cited `{ all: true }` sites are gated, and three of those gates guard changes that genuinely do
> invalidate every cell. A conversion that mechanically replaces `{ all: true }` with `{ rows: [...] }`
> without checking what changed will produce stale cells - a silent visual defect that typechecks,
> lints, and builds. **The burden at each site is to name which rows changed. If that cannot be named,
> the site is exempt and says why.**

Specific correctness constraints:

- Do not use the current array length as a substitute for a changed-row derivation when rows can be
  removed or shifted. File-search expand/collapse and Tree expansion both move suffix indices.
- Do not reuse LogViewEditor's `dirtyIndices` as the render journal. It currently exists for delayed
  JSONL serialization and does not cover every producer that changes a rendered entry. Publish the
  render-change description next to the version instead.
- Do not introduce a destructive `consume...()` side channel in `FileSearchModel` or `LogViewEditor`.
  A second subscriber, a missed read, or a producer that forgets to record would otherwise turn an
  empty read into a skipped repaint with no type, lint, or build signal. Keep the state projection
  narrow: `firstChangedRow` for file search, and a small point array/range/`"all"` sentinel for logs.
  Never put a full-parse index array into Immer state.
- When a file-search or log version changes, add a DEV-only `import.meta.env.DEV` warning if the row
  count is unchanged and the published change description is empty. This is the safety net for the
  producer-forgot-to-record failure mode, not a replacement for deriving the correct row set.
- Do not treat a full current row range as an optimisation if the source only changed one row. A
  full range is correct only where the source evidence says the full current projection changed.
- Do not remove the VirtualGrid engine's internal `{ all: true }` calls or alter `fromRow`/dirty-set
  preparation. Those are primitive behavior and geometry contracts, not caller laziness.
- The `CategoryViewImpl` exemption is intentionally an API-boundary decision. If implementation
  discovers a concrete child API that exposes changed item-to-row indices, replace the exemption with
  that bounded update and revise the classification; do not invent indices in the generic bridge.
- The `CategoryListView` cache depends on the caller contract for `items` identity. If a caller is
  found to mutate an array in place, the cache needs a real version signal before it can be enabled;
  silently caching by identity would create stale category groups.
- The expected performance change is from repainting the rendered viewport to repainting the changed
  rows; it is not an O(collection)-to-O(1) transformation. The extra state machinery is most valuable
  because log entry updates and search result batches repeat frequently, even when only a few rows
  change per event.

### Running-app exercises

After implementation, exercise each converted finding concretely:

1. **File search (`FileSearchView.ts:143`).** Start the app, open an Explorer page, open its Search
   secondary view, search a folder with multiple matching files, and let multiple result batches
   arrive. Collapse and re-expand a file row while results are present, then start a different query
   and clear it. Confirm appended lines, the toggled file header, shifted suffix, and empty transition
   all show current text/icons without stale rows.
2. **Link tiles (`LinksTilesView.ts:182`).** Open a link collection/folder in a tile mode with enough
   links to fill several rows. Select/edit a link so the `links` array is replaced, switch among tile
   modes, and resize the center pane across a column-count threshold. Confirm every changed tile shows
   the current title/image/actions, while resize still changes geometry and selection/scroll behavior.
3. **Log view (`LogBodyView.ts:153`).** Open a script editor and run a script using the documented
   `ui` API, for example `for (let i = 0; i < 100; i++) ui.log("entry " + i);`, then run an interactive
   `await ui.dialog.checkboxes(["one", "two", "three"])` and change a checkbox before accepting it.
   Confirm new rows append, the dialog row updates when its entry is mutated, scrolling/auto-scroll
   remains correct, and toggling the Log View timestamp setting still reformats every entry.
4. **Tree state (`TreeView.ts:204`).** Open a nested Explorer, Boards, or Tools tree. Expand and
   collapse a parent near the top and near the bottom, exercise lazy loading where available, and
   drag across a valid and invalid drop target. Confirm rows after an insertion/removal display the
   correct item, `aria-activedescendant` follows the active item, and drag/drop/loading feedback does
   not stick to a recycled row.
5. **Category grouping (`CategoryListView.ts:96`).** Open the CategoryList Storybook entry, expand a
   grouped value such as `release`, change the separator control, toggle counts, and change the
   selected value. Confirm separator changes rebuild groups/children, while value/count-only updates
   update the keyed rows and do not leave stale names, icons, or counts.

## Acceptance Criteria

- The final source census reproduces the verified current list and records no missed
  `update({ all: true })`, `updateRenderInfo({ all: true })`, or `groupItems()` site.
- The seven Convert findings use source-derived row sets: the FileSearch changed suffix, all current
  link rows only when the links collection changes, the LogView model's exact changed entry rows,
  ListBox's old/new active and selected rows for row-local changes, TreeModel's visible row diff/
  transient-state rows, Tree's row-local props rows, and CategoryList's items/separator cache gate.
- File search publishes `firstChangedRow` alongside `resultsVersion`; LogView publishes a small
  point-update array, an exclusive append range, or an `"all"` full-parse/clear sentinel alongside
  `entriesVersion`. Neither conversion uses a destructive `consume...()` journal, and no full-parse
  index array is placed in Immer state.
- The file-search and log version handlers warn under `import.meta.env.DEV` when row count is
  unchanged but the published change description is empty.
- The implementation leaves `{ all: true }` only where the source-backed exemption table or an
  explicitly identified full-projection sentinel branch permits it, and every exempt caller/branch
  has a nearby comment stating the actual reason.
- The four VirtualGrid-internal sites remain unchanged and are recorded as Not this task.
- Implementation starts only after US-1214 and US-1215 have landed; the post-US-1214 LogView
  state/version and serialization behavior, including the non-render `dirtyIndices` set, and the
  post-US-1215 Notebook projection behavior remain intact.
- The running-app exercises find no stale cell after append, replacement, expansion/collapse,
  selection/format changes, resize, or row removal; root accessibility state and scrolling remain
  correct.
- `npm run lint` and the normal project build pass after implementation. No unit tests or test
  harnesses are added, and no dashboard entry is added for this epic-linked task.

### Files needing NO changes

The following files were inspected or are adjacent contract/primitive files and need no changes for
this task:

| File | Why it stays unchanged |
|---|---|
| `src/renderer/uikit/VirtualGrid/types.ts` | Existing dirty-set contract is the rule being enforced. |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | Its full recomputes are primitive option/measurement behavior. |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | Its whitespace and scrollbar recomputes are internal geometry behavior. |
| `src/renderer/uikit/VirtualGrid/renderInfo.ts` | Existing prepared dirty-map and cell-admission logic is correct. |
| `src/renderer/uikit/VirtualGrid/rerender-check.ts` | Existing row/cell/fromRow filtering is the consumer contract. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Supplies projection state; the opaque bridge decision is local to `CategoryViewImpl`. |
| `src/renderer/editors/link-editor/LinksListView.ts` | Its current link updates already use explicit `{ rows: [...] }` at :171 and :210. |
| `src/renderer/editors/notebook/NotebookEditor.ts` | US-1215's current notes/version producer work is outside this repaint sweep. |

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/components/file-search/FileSearchModel.ts` | Publish `firstChangedRow` alongside `resultsVersion` for reset, append, and expand/collapse. |
| `src/renderer/components/file-search/FileSearchView.ts` | Read the state-published changed suffix, add its DEV-only empty-set warning, and comment the global icon exemption. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Comment the opaque full-projection bridge exemption at the current call. |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Convert props-update repaint to current rows on `linksChanged`; comment resize geometry exemption. |
| `src/renderer/editors/log-view/LogViewEditor.ts` | Publish a point-array/range/`"all"` render-change description alongside `entriesVersion`, separate from serialization `dirtyIndices`. |
| `src/renderer/editors/log-view/LogBodyView.ts` | Read the state-published entry change, add its DEV-only empty-set warning, and comment the global timestamp exemption. |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | Comment the all-note projection exemption at the current call. |
| `src/renderer/uikit/CategoryList/CategoryListView.ts` | Cache `groupItems()` by items identity and normalized separator. |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Comment the signature-gated all-row content exemption. |
| `src/renderer/uikit/Tree/TreeModel.ts` | Produce visible changed-row payloads from state/projection changes. |
| `src/renderer/uikit/ListBox/ListBoxModel.ts` | Classify repaint-signature slots and expose the bounded row-local change result. |
| `src/renderer/uikit/Tree/TreeView.ts` | Consume TreeModel rows at the state repaint; split row-local props changes from commented all-row branches. |
