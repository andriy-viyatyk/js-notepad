# US-1214 — R5: log-view entries out of immer

## Goal

Move `LogViewEditor`'s accumulating `entries[]` collection out of Immer-managed state. Keep a
version counter in state so views still receive synchronous invalidation, while updating one entry
mutates only that entry and does not produce over the whole collection.

This is a planning document only. No implementation, tests, test harnesses, dashboard entry, or
commit belongs in this phase.

## Background

EPIC-077 statement 3 requires that a large accumulating collection not sit inside Immer state
([`EPIC-077.md:41-44`](../../epics/EPIC-077.md#c-1--the-closing-property)). Its
R5 breakdown names this task as the log-view pilot and explicitly says that `dirtyIndices` plus
`flushDirtyDebounced` already handle repaint/serialization coordination; this task removes the
Immer pass without redesigning that repaint path ([`EPIC-077.md:146-153`](../../epics/EPIC-077.md#c-2--measured-baseline-2026-08-30-branch-upcoming-v4023), [`EPIC-077.md:224-229`](../../epics/EPIC-077.md#c-4--task-breakdown)). The relevant risk is that Immer currently freezes the entries and downstream readers may have come to rely on that ([`EPIC-077.md:280-283`](../../epics/EPIC-077.md#c-5--risks)).

`TOneState.update()` calls Immer `produce()` at [`state.ts:52-68`](../../../src/renderer/core/state/state.ts#L52-L68). The current `updateEntryAt` therefore runs the caller's single-entry updater inside a producer over the state object and its `entries` array ([`LogViewEditor.ts:390-396`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L390-L396)). The current state shape places `entries` and `entryCount` in `LogViewEditorState` ([`LogViewEditor.ts:25-49`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L25-L49)). `TextHostEditorModel.getRestoreData()` already emits only title/modified/secondaryView, so neither the current collection nor the future version counter is persisted ([`TextHostEditorModel.ts:151-166`](../../../src/renderer/editors/base/TextHostEditorModel.ts#L151-L166)).

### Reference pattern verified in the source

The architecture rule says that an unbounded collection belongs in a plain model field and that
state carries only a change signal ([`state-management.md:68-86`](../../architecture/state-management.md#large-accumulating-collections-dont-belong-in-state)). Both requested reference implementations were read and verified:

- [`GridEditor.ts:122-132`](../../../src/renderer/editors/grid/GridEditor.ts#L122-L132) excludes `rows` from state because Immer can deep-freeze rows, keeps the live rows in private `_rows` at [`GridEditor.ts:176-178`](../../../src/renderer/editors/grid/GridEditor.ts#L176-L178), exposes the live array to the view through `rowsForGrid()` at [`GridEditor.ts:239-246`](../../../src/renderer/editors/grid/GridEditor.ts#L239-L246), and writes rows directly to the grid before the synchronous state update at [`GridEditor.ts:477-495`](../../../src/renderer/editors/grid/GridEditor.ts#L477-L495). Its bounded `rowCount` is the state notification used by the view; row mutation/add/delete paths update the plain collection and then `rowCount` ([`GridEditor.ts:682-712`](../../../src/renderer/editors/grid/GridEditor.ts#L682-L712)). `GridBodyView` reads the rows through `model.rowsForGrid()` while its state projection selects only state-owned options ([`GridBodyView.ts:56-64`](../../../src/renderer/editors/grid/GridBodyView.ts#L56-L64), [`GridBodyView.ts:245-252`](../../../src/renderer/editors/grid/GridBodyView.ts#L245-L252)).
- [`FileSearchModel.ts:62-76`](../../../src/renderer/components/file-search/FileSearchModel.ts#L62-L76) explicitly keeps result rows out of state, stores them in private `allResults` at [`FileSearchModel.ts:100-104`](../../../src/renderer/components/file-search/FileSearchModel.ts#L100-L104), appends to that field and bumps `resultsVersion` once per batch at [`FileSearchModel.ts:143-179`](../../../src/renderer/components/file-search/FileSearchModel.ts#L143-L179), and exposes a model method that filters the plain collection at [`FileSearchModel.ts:341-350`](../../../src/renderer/components/file-search/FileSearchModel.ts#L341-L350). The view subscribes to `state.resultsVersion`, then calls `getFilteredResults()` and reads the current state for other view arms ([`FileSearchView.ts:140-143`](../../../src/renderer/components/file-search/FileSearchView.ts#L140-L143)).

The log-view implementation should use the FileSearch-style explicit version signal, with the
Grid-style O(1) model accessor for a row. The collection must not be copied merely to restore the
old state-array identity signal.

### Verified current collection inventory

The following commands were used during the investigation; their results were checked against the
source before being recorded here:

```text
rg --files src/renderer/editors/log-view
rg -n "entries|entryCount|dirtyIndices|flushDirtyDebounced|state\.get\(\)|state\.update|state\.subscribe" src/renderer/editors/log-view/LogViewEditor.ts
rg -n "entries|entryCount|projection|state\.get|state\.subscribe|applyRowsAndAutoScroll|renderCell|entryProps" src/renderer/editors/log-view/LogBodyView.ts
rg -n "state\.entries|entries\s*=|entries\[|entries\.find|entries\.length|entries\.push|entries\.splice|entries\.filter|entries\.map" src/renderer/editors/log-view src/renderer/api/mcp src/renderer/scripting/api-wrapper --glob "*.ts" --glob "*.tsx"
rg -n "props\.entry|this\.props\.entry|const entry = props\.entry|entry\." src/renderer/editors/log-view
rg -n "Object\.freeze|freeze\(|autoFreeze|setAutoFreeze|produce" src/renderer/core/state src/renderer/editors/log-view src/renderer/editors/grid src/renderer/components/file-search --glob "*.ts"
```

#### `LogViewEditor.ts` collection reads, writes, and derived values

The state field declaration/default are at [`LogViewEditor.ts:35,47-48`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L35-L48). The operational inventory is:

| Location | Operation | Current role and planned replacement |
|---|---|---|
| [`LogViewEditor.ts:113-124`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L113-L124) | Build local `entries` with `push()` while parsing | Keep the temporary parse array; assign it to the plain model collection before publishing state. |
| [`LogViewEditor.ts:138-143`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L138-L143) | Read local parsed entries to restore `nextId` | Keep; this is not a state collection read. |
| [`LogViewEditor.ts:147-151`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L147-L151) | Write `s.entries`; derive `s.entryCount` | Replace with `this.entries = entries`, then one state update for `entryCount`, `entriesVersion`, and `error`. |
| [`LogViewEditor.ts:166-178`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L166-L178) | Read current state entries for length and first-entry identity | Read the plain field; preserve the line-count/first-ID incremental-parse heuristic. |
| [`LogViewEditor.ts:185-212`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L185-L212) | Build/read local `newEntries` and update `nextId` | Keep the temporary parse work. |
| [`LogViewEditor.ts:214-218`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L214-L218) | Append by allocating `[...]` inside Immer and derive count | Replace with `for (const entry of newEntries) this.entries.push(entry)`; do not spread a large batch into `push`, then update `entryCount`, `entriesVersion`, and optional error. |
| [`LogViewEditor.ts:265-290`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L265-L290) | `flushDirtyDebounced` reads `state.entries` and indexes dirty entries | Read `this.entries[idx]`; retain the dirty-index loop, JSONL comparison, clear, and debounced host write exactly as-is otherwise. |
| [`LogViewEditor.ts:313-322`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L313-L322) | Upsert finds, replaces, and rereads an entry through state | Find/replace in `this.entries`; publish `entriesVersion`; preserve `this.heightCache.delete(id)`; reread the plain entry for `updateEntryInContent`. |
| [`LogViewEditor.ts:328-338`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L328-L338) | Append a newly constructed entry through state | Push to `this.entries`, publish `entryCount` and `entriesVersion`, then keep `appendToContent`. |
| [`LogViewEditor.ts:351-369`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L351-L369) | Resolve by finding an entry in `s.entries`, then reread it | Set `this.entries` entry directly, publish `entriesVersion`, then keep content serialization and pending-promise resolution. |
| [`LogViewEditor.ts:375-387`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L375-L387) | Find/read and replace an entry's text through state | Find in `this.entries`, update the plain entry, publish `entriesVersion`, then serialize immediately as today. |
| [`LogViewEditor.ts:390-397`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L390-L397) | `updateEntryAt` invokes updater on `s.entries[index]`; marks dirty and schedules flush | Invoke updater on `this.entries[index]`, bump `entriesVersion` in the notification state, and retain lines 395–396's dirty bookkeeping. |
| [`LogViewEditor.ts:399-405`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L399-L405) | `updateEntryById` finds an index through state | Find in `this.entries`, then delegate unchanged to `updateEntryAt`. |
| [`LogViewEditor.ts:407-425`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L407-L425) | Clear replaces state entries with `[]` and count `0` | Choose `this.entries = []`, publish count/version/error, and keep host clearing and pending-dialog cancellation. Preserve the existing fact that `clear()` does not clear `dirtyIndices`; a later flush skips stale indices through the existing `if (!entry) continue` guard at `LogViewEditor.ts:274-275`. |
| [`LogViewEditor.ts:439-440`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L439-L440) | Public `entryCount` getter reads state | Keep the getter backed by the bounded state count; no external caller reads the collection. |

`pendingDialogs.entries()` at [`LogViewEditor.ts:410`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L410) and [`LogViewEditor.ts:474`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L474) are `Map` iteration, not log-entry collection access. `itemsState` at [`LogViewEditor.ts:455-466`](../../../src/renderer/editors/log-view/LogViewEditor.ts#L455-L466) is per-item auxiliary state and remains in state; it is outside this collection move.

#### View collection reads and derived entry flow

`LogBodyView` is the only current view that reads `state.entries` directly. Its projection selects
the collection at [`LogBodyView.ts:15-32`](../../../src/renderer/editors/log-view/LogBodyView.ts#L15-L32); row-height lookup indexes it at [`LogBodyView.ts:49-52`](../../../src/renderer/editors/log-view/LogBodyView.ts#L49-L52); cell rendering indexes it and derives `kind` at [`LogBodyView.ts:57-65`](../../../src/renderer/editors/log-view/LogBodyView.ts#L57-L65); the entry is stored in each cell record and passed to the wrapper at [`LogBodyView.ts:70-87`](../../../src/renderer/editors/log-view/LogBodyView.ts#L70-L87); and the wrapper props are built at [`LogBodyView.ts:187`](../../../src/renderer/editors/log-view/LogBodyView.ts#L187). The projection is initialized/subscribed at [`LogBodyView.ts:94-108`](../../../src/renderer/editors/log-view/LogBodyView.ts#L94-L108) and reread on a parent update at [`LogBodyView.ts:112-114`](../../../src/renderer/editors/log-view/LogBodyView.ts#L112-L114).

The remaining direct collection-dependent gate is [`LogBodyView.ts:128-132`](../../../src/renderer/editors/log-view/LogBodyView.ts#L128-L132): `previous.entries !== next.entries` currently detects both append/replace and in-place entry changes because Immer creates a new array. It must become `previous.entriesVersion !== next.entriesVersion`; the selector must not read `state.entries` after the move. `entryCount` continues to drive the row count, empty message, and auto-scroll at [`LogBodyView.ts:151-190`](../../../src/renderer/editors/log-view/LogBodyView.ts#L151-L190).

The individual entry then flows through these verified readers:

- `LogEntryWrapperView` forwards the entry to `LogEntryContentView` at [`LogEntryWrapper.ts:36-40`](../../../src/renderer/editors/log-view/LogEntryWrapper.ts#L36-L40), [`LogEntryWrapper.ts:60-74`](../../../src/renderer/editors/log-view/LogEntryWrapper.ts#L60-L74), derives the accent from `entry.type` at [`LogEntryWrapper.ts:78-86`](../../../src/renderer/editors/log-view/LogEntryWrapper.ts#L78-L86), and formats `entry.timestamp` at [`LogEntryWrapper.ts:88-91`](../../../src/renderer/editors/log-view/LogEntryWrapper.ts#L88-L91).
- `LogEntryContentView` classifies `entry.type` and passes the typed entry to each item view in [`LogEntryContent.ts:41-72`](../../../src/renderer/editors/log-view/LogEntryContent.ts#L41-L72). Its fallback readers use title/message/button/type at [`LogEntryContent.ts:84-115`](../../../src/renderer/editors/log-view/LogEntryContent.ts#L84-L115), and its update/reuse gate compares only `childKind` to `entry.type` at [`LogEntryContent.ts:130-167`](../../../src/renderer/editors/log-view/LogEntryContent.ts#L130-L167). `LogMessageView` reads `text` and `type` at [`LogMessageView.ts:34-45`](../../../src/renderer/editors/log-view/LogMessageView.ts#L34-L45); the type guards read only `type`/`button` at [`logTypes.ts:183-196`](../../../src/renderer/editors/log-view/logTypes.ts#L183-L196).
- Dialog/output item readers are: `src/renderer/editors/log-view/items/ButtonsDialogView.ts:18-36`; `src/renderer/editors/log-view/items/CheckboxesDialogView.ts:28-59,74`; `src/renderer/editors/log-view/items/ConfirmDialogView.ts:27,37-42`; `src/renderer/editors/log-view/items/SelectDialogView.ts:26-51`; `src/renderer/editors/log-view/items/RadioboxesDialogView.ts:27-51`; and `src/renderer/editors/log-view/items/TextInputDialogView.ts:30-73`. They read titles, buttons, resolution state, items, layout, selected/checked/text values, and IDs for callbacks. Their entry writes are only through the supplied `updateEntry` callback: checkbox item `checked` at `src/renderer/editors/log-view/items/CheckboxesDialogView.ts:74`, selected value at `src/renderer/editors/log-view/items/SelectDialogView.ts:51`, radio `checked` at `src/renderer/editors/log-view/items/RadioboxesDialogView.ts:50`, and text-input `text` at `src/renderer/editors/log-view/items/TextInputDialogView.ts:60`; these must continue to call the model updater.
- Output readers are: `src/renderer/editors/log-view/items/GridOutputView.ts:47-114` (ID, title, data, columns, and item-state key); `src/renderer/editors/log-view/items/TextOutputView.ts:115-136` (title, text, language, and display flags); `src/renderer/editors/log-view/items/MarkdownOutputView.ts:21-38` (title/text); `src/renderer/editors/log-view/items/MermaidOutputView.ts:43-122` (title/text); `src/renderer/editors/log-view/items/ProgressOutputView.ts:41-49` (label/value/max/completed); and `src/renderer/editors/log-view/items/McpRequestView.ts:91-101` (method, params, result, error, duration). These are prop readers only; no direct collection access occurs in them.

There are no other `LogViewEditor.state.entries` consumers in the renderer. The external API files
call the preserved method surface (`addEntry`, `addDialogEntry`, and `updateEntryById`) but do not
read the internal state collection: `api/mcp/ui-push.ts:45-116`,
`src/renderer/api/mcp/request-log.ts:28-47`, `src/renderer/scripting/api-wrapper/UiFacade.ts:42-151`, and the typed output
facades at `src/renderer/scripting/api-wrapper/Grid.ts:17-30`, `src/renderer/scripting/api-wrapper/Text.ts:19-35`, `src/renderer/scripting/api-wrapper/Progress.ts:16-29`,
`src/renderer/scripting/api-wrapper/Markdown.ts:15-27`, and `src/renderer/scripting/api-wrapper/Mermaid.ts:15-27`. The typed facades write entry fields only through
`updateEntryById` callbacks at `src/renderer/scripting/api-wrapper/Grid.ts:26-32`, `src/renderer/scripting/api-wrapper/Text.ts:31-39`, `src/renderer/scripting/api-wrapper/Progress.ts:25-31`,
`src/renderer/scripting/api-wrapper/Markdown.ts:23-27`, and `src/renderer/scripting/api-wrapper/Mermaid.ts:23-27`.

### Freeze-semantics audit

The current state path hands Immer-produced objects to `LogBodyView`, which passes the same entry
objects to child props. The source audit found:

- No `Object.freeze`, `Object.isFrozen`, `freeze`, or explicit immutable/frozen-entry assumption in
  `src/renderer/editors/log-view`.
- No copy-on-read of the collection or entry object. The only object rest copy is the unknown-entry
  display projection at [`LogEntryContent.ts:107-115`](../../../src/renderer/editors/log-view/LogEntryContent.ts#L107-L115). Select/radio items are mapped into UI option arrays, while grid columns are normalized; these are display projections, not defensive entry copies.
- One identity-dependent reader: `LogBodyView.ts:131` compares the previous and next **array**
  identities. This is not a consumer requirement for immutable entry identity; it is the current
  notification gate created by Immer. Replace it with the numeric `entriesVersion` comparison.
- The cell record's `entry` field is not an identity gate: `record.entry` is assigned at
  [`LogBodyView.ts:80`](../../../src/renderer/editors/log-view/LogBodyView.ts#L80) and the audit found
  no comparison or other read of that field. In-place entry mutation therefore cannot be rejected
  by cell-record identity; the existing `kind`/recycled-cell checks are the actual reuse gates.
- `GridOutputView.ts:63` compares entry IDs, not entry object identity. `MermaidOutputView.ts:71`
  compares the text value and theme flag, not entry identity. `LogEntryContent.ts:135` compares
  entry type, and `LogBodyView.ts:62-64` compares the recycled cell's kind; keep all of these
  comparisons because they express component/cell reuse, not frozen-object semantics.
- `VanillaView.update()` stores the new props and calls `onUpdate()` whenever mounted at
  [`vanilla-view.ts:84-96`](../../../src/renderer/uikit/shared/vanilla-view.ts#L84-L96); it does not
  gate on prop identity. Therefore a mutated plain entry object can be passed again after the
  version notification and all current item views will still receive `onUpdate()`.
- The callback-based mutations are intentional and remain safe after the move: checkbox state is
  changed through `updateEntry` at `CheckboxesDialogView.ts:74`, selection through it at
  `SelectDialogView.ts:51`, and other script/view mutations enter through the model methods listed
  above. No reader mutates `props.entry` directly. `GridOutputView` passes `entry.data` to the
  read-only `DataGridView` through `getGridDataWithColumns` (`grid-utils.ts:127-148` and
  `GridOutputView.ts:80-86`); it has no cell-edit callback, so no new freeze-dependent write was
  found there.

The semantic change is nevertheless real: callers receiving the `LogEntry` returned by
`addEntry`/`addDialogEntry` and all view props will no longer receive frozen objects. The returned
entry is a live reference into the model collection; callers must treat it as read-only and change
it only through `updateEntryById` or `updateEntryAt`, because direct mutation bypasses
`entriesVersion` and can leave the view silently stale.

The external caller audit found no direct mutation of a returned entry. `api/mcp/ui-push.ts` only
passes `addDialogEntry`/`addEntry` results into its promise list or ignores them at
[`ui-push.ts:61-116`](../../../src/renderer/api/mcp/ui-push.ts#L61-L116), then creates a new result
object with `{ ...result }` at `ui-push.ts:122-125`. `api/mcp/request-log.ts` ignores the return
value at [`request-log.ts:32-45`](../../../src/renderer/api/mcp/request-log.ts#L32-L45). `UiFacade`
uses returned entries only for their IDs at [`UiFacade.ts:42-45`](../../../src/renderer/scripting/api-wrapper/UiFacade.ts#L42-L45) and [`UiFacade.ts:124-151`](../../../src/renderer/scripting/api-wrapper/UiFacade.ts#L124-L151). The typed facades retain their own field values and write through `updateEntryById` callbacks at `Grid.ts:26-32`, `Text.ts:31-39`, `Progress.ts:25-31`, `Markdown.ts:23-27`, and `Mermaid.ts:23-27`; none writes to the returned entry object.

The task must preserve the version notification and updater discipline; it must not add ad-hoc
freezing, which would reintroduce the collection-copy/identity problem or hide ownership.

### Change notification and repaint interaction

Today `LogBodyView` subscribes with `state.subscribe(this.handleState, selectProjection)` at
[`LogBodyView.ts:105`](../../../src/renderer/editors/log-view/LogBodyView.ts#L105), and `selectProjection`
reads `state.entries` at [`LogBodyView.ts:31-32`](../../../src/renderer/editors/log-view/LogBodyView.ts#L31-L32). The after-state projection must contain `entriesVersion`, `entryCount`, `error`, and `showTimestamps`, with no `entries` field. The subscription remains on that projection, so an in-place update must increment `entriesVersion` or the selector's numeric result will not change and the view will silently fail to repaint.

On a version change, `handleState` must continue to call `applyProjection()` and
`applyRowsAndAutoScroll()`. The latter already calls `grid.gridModel?.update({ all: true })` at
[`LogBodyView.ts:151-157`](../../../src/renderer/editors/log-view/LogBodyView.ts#L151-L157), which is the existing repaint path that causes virtualized cells to invoke `renderCell` and update their wrapper props. The version move must not redesign this path, alter cell recycling, or add a second repaint mechanism. The `showTimestamps`-only `{ all: true }` update at [`LogBodyView.ts:132`](../../../src/renderer/editors/log-view/LogBodyView.ts#L132) remains separate and unchanged.

This whole-grid repaint on a single entry update is pre-existing: Immer already produced a new
array identity for every `updateEntryAt`, which tripped the same `applyRowsAndAutoScroll` gate.
The version counter preserves that invalidation; it does not introduce the repaint cost. Any
conversion of this `{ all: true }` path belongs to US-1213 and is explicitly out of scope here.

## Implementation Plan

1. **Change the state/model ownership in `src/renderer/editors/log-view/LogViewEditor.ts`.** Remove
   `entries` from `LogViewEditorState` and its default value. Add an `entriesVersion` number to
   state, initialized to `0`, and add a private plain `entries: LogEntry[]` field. Add a narrow
   `getEntryAt(index)` accessor for the view rather than exposing the mutable array. Keep
   `entryCount` in state because it drives the virtual row count and empty state and is
   already bounded.
2. **Move every producer and reader listed above in the same file.** Full parse assigns the parsed
   array to the plain field before one state update. Incremental parse appends only `newEntries` to
   the plain field with `for (const entry of newEntries) this.entries.push(entry)`; do not use
   `push(...newEntries)`, which can throw a `RangeError` for a large parse batch. Upsert, dialog
   resolution, text update, `updateEntryAt`, ID lookup, and clear all operate on the plain field.
   Every operation that changes an entry or collection increments `entriesVersion`; append/replace/
   clear also maintain `entryCount`. Do not read `state.entries` from any producer. Preserve
   `nextId`, `lastLineCount`, host echo ordering, immediate text serialization, returned-entry
   read-only/live-reference behavior, and `this.heightCache.delete(id)` on the upsert path.
3. **Preserve the dirty serialization path.** `updateEntryAt` must mutate only the selected plain
   entry, then add its index to `dirtyIndices` and call the existing `flushDirtyDebounced` exactly
   as today. `flushDirtyDebounced` must index the plain collection and retain its 300 ms debounce,
   dirty-set clearing, JSONL line matching, changed-line check, and host write. Do not replace it
   with a full-content rewrite or alter repaint scheduling.
4. **Change the subscription projection in `src/renderer/editors/log-view/LogBodyView.ts`.** Replace
   `LogProjection.entries` with `entriesVersion`. Make `selectProjection` select only
   `entriesVersion`, `entryCount`, `error`, and `showTimestamps`. Change row-height and cell
   rendering to call `editor.getEntryAt(row)` / `getEntryAt(params.row)`. Replace the collection
   portion of line 131 with the exact gate
   `previous.entriesVersion !== next.entriesVersion || previous.entryCount !== next.entryCount`.
   Keep the
   existing `entryProps`, `CellRecord`, `kind` reuse gate, `applyProjection`, `applyRowsAndAutoScroll`,
   scroll-to-bottom behavior, and timestamp repaint branch.
5. **Audit the no-change readers after the model/view edit.** `LogEntryWrapper`,
   `LogEntryContent`, `LogMessageView`, all typed item views, `logTypes.ts`, and `index.ts` should
   continue receiving an entry snapshot through props. Verify that their current type/ID/value
   comparisons and callback-based mutations still work with a mutable plain object; do not add
   defensive copies or freeze calls unless a concrete source-backed mutation is discovered.
6. **Verify the state boundary and external API surface.** Re-run the collection grep commands
   above and confirm there is no `state.entries` read/write under log-view, no selector still
   returning `state.entries`, and no external consumer depended on that private state field. Check
   that `getRestoreData()` remains unchanged and that public logging/dialog/output facades retain
   their existing methods and return values.

### Before → after shape

Illustrative planning snippets; these are not implementation in this phase:

```ts
// Before: the array and entry are Immer draft values.
entries: LogEntry[];

this.state.update((s) => {
    updater(s.entries[index]);
});
this.dirtyIndices.add(index);
this.flushDirtyDebounced();
```

```ts
// After: the collection is plain; state publishes only the cheap signal.
private entries: LogEntry[] = [];
// state: entriesVersion: number; entryCount: number;

const entry = this.entries[index];
updater(entry);
this.state.update((s) => { s.entriesVersion += 1; });
this.dirtyIndices.add(index);
this.flushDirtyDebounced();
```

```ts
// Before: selector carries the Immer array identity.
return { entries: state.entries, entryCount: state.entryCount, error: state.error, showTimestamps: state.showTimestamps };

// After: selector carries only bounded state and the explicit invalidation signal.
return { entriesVersion: state.entriesVersion, entryCount: state.entryCount, error: state.error, showTimestamps: state.showTimestamps };
```

## Concerns

- **Freeze semantics:** Plain entries become mutable to callers and child props. The audit found no
  freeze-dependent reader, but this is a behavior change and must be explicitly checked during
  manual exercise. The replacement for the one identity gate is `entriesVersion`, not a copied
  array or a new entry-object identity requirement.
- **Silent subscription failure:** Leaving `state.entries` in `selectProjection`, or failing to
  bump `entriesVersion` for `updateEntryAt`, resolution, text edits, upserts, appends, parse
  replacement, or clear, will leave the view stale. The final grep and acceptance checks must cover
  both the selector and every producer.
- **Synchronous notification ordering:** `TOneState` dispatches listeners synchronously. The plain
  field must be changed before the state update so `LogBodyView.renderCell` sees the new entry when
  the version notification repaints. Do not update the counter first.
- **Dirty-index races:** An entry update may be followed by host content notification. Preserve the
  current immediate/debounced serialization ordering and read the same plain entry collection from
  both paths. Do not broaden the task into a host synchronization redesign.
- **Mutable nested values:** `LogEntry` is an open flat type and some entries contain arrays or
  object data. The source audit found only reads/projections in views and updater callbacks for
  interactive changes. If implementation reveals a direct mutation of a nested prop by a child,
  resolve that concrete ownership issue before proceeding; do not silently add copies to every
  reader.

## Acceptance Criteria

- [ ] `LogViewEditorState` contains `entriesVersion` and `entryCount`, but not `entries`; the plain
  model field owns the collection and `getEntryAt()` is the view read boundary.
- [ ] Every collection read/write in the verified inventory is moved, and every entry-changing path
  increments `entriesVersion` before synchronous state listeners run.
- [ ] `updateEntryAt` performs O(1) collection work for the selected entry and retains
  `dirtyIndices` plus `flushDirtyDebounced` without a repaint-path redesign.
- [ ] `LogBodyView` selects `entriesVersion` rather than `state.entries`, reads entries through the
  model accessor, and uses version comparison in place of array identity comparison.
- [ ] No log-view reader relies on frozen identity, `Object.freeze`, copy-on-read, or entry-object
  `prev !== next` semantics. The array-identity gate is replaced by the version counter; ID, type,
  cell-kind, and value comparisons remain documented and intact.
- [ ] Parse, append, upsert, dialog resolution, text updates, clear, JSONL persistence, incremental
  parsing, empty/error display, virtualized cell reuse, timestamp toggling, and public logging/dialog
  APIs preserve their current behavior.
- [ ] The final source grep confirms no `state.entries` selector/read/write remains in the log-view
  editor or views, and confirms the listed external API consumers do not access the removed field.
- [ ] No unit tests, test harnesses, dashboard entry, unrelated editor refactor, or repaint-path
  redesign is added.

## Files that need no changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/core/state/state.ts` | Its synchronous Immer behavior is the measured cause and remains the shared state contract. |
| `src/renderer/editors/base/TextHostEditorModel.ts` | It already omits view-derived state from restore data; the log collection is recomputed from host content as before. |
| `src/renderer/editors/log-view/LogEntryWrapper.ts` | Receives the same individual-entry prop and updater contract; no frozen-identity assumption was found. |
| `src/renderer/editors/log-view/LogEntryContent.ts` | Type dispatch and child-kind reuse compare type, not entry identity; fallback rendering only reads fields. |
| `src/renderer/editors/log-view/LogMessageView.ts` | Reads text/type and has no collection or freeze-sensitive logic. |
| `src/renderer/editors/log-view/items/*.ts` | The verified item views read entry-derived props and use the supplied updater; none reads the removed state field or compares entry object identity. |
| `src/renderer/editors/log-view/logTypes.ts` | Entry types and type guards do not own collection storage. |
| `src/renderer/editors/log-view/index.ts` | Toolbar subscribes only to `showTimestamps`; the editor view/model boundary is unchanged. |
| `src/renderer/editors/log-view/StyledTextView.ts` and `logConstants.ts` | Utility/rendering constants receive already-projected values and do not access the collection. |
| `src/renderer/api/mcp/ui-push.ts`, `src/renderer/api/mcp/request-log.ts` | Preserve public model method calls; no internal `entries` state access. |
| `src/renderer/scripting/api-wrapper/*.ts` | Facades use stable logging/output/dialog methods and IDs; no state collection access. |
| `src/renderer/editors/grid/GridEditor.ts`, `src/renderer/components/file-search/FileSearchModel.ts` | These are verified reference implementations, not change targets for this task. |
| `doc/architecture/state-management.md`, `doc/epics/EPIC-077.md` | The architecture and epic already document the pattern and task; no documentation/dashboard update is requested here. |

## Files Changed summary

| File / area | Planned change |
|---|---|
| `src/renderer/editors/log-view/LogViewEditor.ts` | Move `entries` to a plain model field, add `entriesVersion`, update all verified producers/readers, and preserve dirty JSONL flushing and public APIs. |
| `src/renderer/editors/log-view/LogBodyView.ts` | Subscribe to the version counter, read entries through the model accessor, and replace the array-identity gate while preserving repaint and virtualization behavior. |
| `doc/tasks/US-1214-log-view-entries-out-of-immer/README.md` | Record the verified risk surface, freeze audit, reference mechanisms, plan, concerns, acceptance criteria, no-change files, and commands used. |
