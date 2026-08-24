# US-1064 — Convert `NotebookBody` and its note cells to `VirtualFlexGridView`

Epic: [EPIC-062 — De-React Epic E4](../../epics/EPIC-062.md)

Status: investigation and implementation plan only; no implementation is in scope.

## Goal

Replace the React `RenderFlexGrid` host in `src/renderer/editors/notebook/NotebookBody.tsx`
with the measured vanilla `VirtualFlexGridView`, and convert the complete note-cell subtree to
direct DOM/`VanillaView` ownership. The conversion must preserve variable-height measurement,
all note editing behavior, the expanded-note overlay, and E4-6's structural Rule 4 target: no
Monaco constructions beyond the peak simultaneously visible `monaco` cells, with zero
constructions when scrolling revisits already visited rows and returns to the top.

This is task 3 of 6 in EPIC-062. It does not delete `src/renderer/uikit/RenderGrid/`; US-1067
owns that closing removal.

## Background

### Verified scope and consumers

The requested files were checked on 2026-08-24; their current line counts are:

| File | Lines | Verified consumers in `src/renderer/` |
|---|---:|---|
| `src/renderer/editors/notebook/NotebookBody.tsx` | 183 | `src/renderer/editors/notebook/index.tsx` through the notebook editor module |
| `src/renderer/editors/notebook/NoteItemView.tsx` | 385 | `NotebookBody.tsx` only |
| `src/renderer/editors/notebook/ExpandedNoteView.tsx` | 438 | `NotebookBody.tsx` only |
| `src/renderer/editors/notebook/NoteItemViewModel.ts` | 299 | `NoteItemView.tsx` only |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | 101 | `NoteItemView.tsx`, `ExpandedNoteView.tsx`, and `note-editor/index.ts`; it is inside both the virtualized cell and the expanded overlay |
| `src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx` | 111 | `NoteItemActiveEditor.tsx` and `note-editor/index.ts`; it is inside the virtualized cell through the active-editor dispatcher |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbar.tsx` | 196 | `NoteItemView.tsx`, `ExpandedNoteView.tsx`, and `note-editor/index.ts`; it is inside both the virtualized cell and the expanded overlay |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | 404 | `NoteItemViewModel.ts`, `ExpandedNoteView.tsx`, and the three note-editor React files; it owns state for both the virtualized cell and expanded overlay |

The consumer search found no independent consumer of `NoteItemView` or `ExpandedNoteView`, so
E4-4 permits each to convert with `NotebookBody`. `NoteItemViewModel` is private to
`NoteItemView`. All four `note-editor` files are in scope: `NoteItemActiveEditor`,
`MiniTextEditor`, and `NoteItemToolbar` are rendered inside the virtualized row (and also the
expanded overlay), while `NoteItemEditModel` is the model owned by that row and overlay subtree.
None can remain a React-only implementation because `NotebookBody` will no longer have a React
render tree in which to create the cell subtree.

### Reviewed precedent and target primitive

US-1062 is the cell conversion precedent. `src/renderer/editors/link-editor/LinksListView.ts`
uses a stable bound `renderCell` field, `p.previous ?? p.recycle?.()`, a
`WeakMap<HTMLElement, CellParts>`, a retained `Set` of owned child views, total writes on every
admission, and disposal only for a genuine kind change or owner teardown. Its React face in
`src/renderer/editors/link-editor/LinksList.tsx` is a thin `mountVanilla` adapter. The relevant
shipped pattern is also present in `src/renderer/uikit/ListBox/ListBoxView.ts:30-45,52-56,74-75,
297-343,410-423`.

US-1063 supplied `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts` (134 lines) and
`VirtualFlexGridModel.ts` (112 lines). The wrapper composes `VirtualGridView`; it is not a second
geometry engine. It applies the grid style to the consumer's returned `HTMLElement`, observes that
same element, stores the live element-to-row association, and forwards committed height changes as
`gridModel.update({ rows: [row] })`. Its model preserves pending versus committed heights, the
50 ms per-row debounce, min/max clamping, initial-height lookup, `lastRowHeight`, and
`preferMinHeightForNewRows`.

The notebook's current props fit those mechanics:

```tsx
// Before: NotebookBody.tsx:156-166
<RenderFlexGrid
    onModel={setGridModel}
    columnCount={1}
    rowCount={notes.length}
    columnWidth={getColumnWidth}
    renderCell={renderNoteCell}
    fitToWidth
    minRowHeight={100}
    maxRowHeight={800}
    getInitialRowHeight={getInitialRowHeight}
/>
```

The corresponding vanilla options are `rowCount`, `columnCount: 1`, the percentage
`columnWidth`, `fitToWidth`, `minRowHeight: 100`, `maxRowHeight: 800`, and a bound
`getInitialRowHeight` that reads `editor.getNoteHeight(note.id)`. The returned positioned cell is
still explicitly styled with the committed row height, but the note view must nominate its
content-driven `fit-content` root through the flex renderer's `measure(element)` callback; this is
the vanilla replacement for the React-only `cellRef` ref channel, not its removal.

There is one verified API change required before this consumer can use the primitive: current
`VirtualFlexGridProps.onModel` is declared as `(model: VirtualGridModel | null) => void` in
`VirtualFlexGridView.ts:14-21`. E4-9 requires a caller-facing grid handle to use the exported
`GridModelCapability` in `uikit/VirtualGrid/types.ts:81-85`, not the concrete model class and not
a cast. Change the flex wrapper's callback to `GridModelCapability | null`, and store the notebook
handle as that capability. `VirtualFlexGridModel` already uses the capability internally; this is
the public-surface correction needed by US-1064.

The wrapper otherwise fits the notebook after the E4-11 measurement correction. Its stable internal
renderer is already a bound field, and its `onCellReleased` hook must remove the nominated element
from the measurement maps before `CellPool.release()`. Do not replace that with a consumer-specific
row map or a closure that captures an old row.

### Current notebook host and height behavior

`NotebookBody.tsx:20-28` selects `data`, `error`, `categories`, `tags`, `searchText`,
`filteredNotes`, and `expandedNoteId` from `NotebookEditor.state`. It currently calls
`gridModelRef.current?.update({ all: true })` whenever `filteredNotes` changes
(`:65-67`), while `renderNoteCell` is a `useCallback` over the current notes/editor props
(`:69-95`). The vanilla replacement must keep the renderer identity stable and explicitly call
the capability's `update({ all: true })` (or equivalent all-current-row dirty set) after every
state update whose note row DOM may have changed. Prop replacement is not a repaint signal in
`VirtualGridModel.inputChanged()`.

`RenderFlexGrid`'s `FlexCell` currently measures a content-driven note root nominated through
`RenderFlexCellParams.ref`, not the positioned outer cell. US-1063's shipped
`VirtualFlexGridView` incorrectly applies the model's explicit row height to its returned cell and
then reads that same height back, so it cannot converge on content height. E4-11 requires the
primitive to accept `measure(element: HTMLElement): void`: the consumer calls it on the
`NoteItemView` root on every admission, while the flex view keeps the explicit positioned cell
height so `maxRowHeight: 800` still clips an over-tall note instead of letting it overlap its
neighbour. `NoteItemEditModel` already persists measured Monaco content heights through
`NotebookEditor.getNoteHeight`/`setNoteHeight`; that store and the flex observer remain separate.

### Exact note kinds and the cell kind key

The valid embedded editor arms are verified from `NoteItemActiveEditor.tsx:17-27`,
`src/renderer/editors/base/editorRegistry.ts:28-33`, `src/renderer/editors/register-editors.ts:150-157`,
and the seven non-Monaco module registrations that provide `BodyView`:

| Normalized cell kind key | Current arm | Note-cell renderer | Reuse policy when the prior occupant has another key |
|---|---|---|---|
| `"monaco"` | missing/`"monaco"` editor value; the text editor | `MonacoEditorHostView` | Reuse the cell and the host; re-point the note model, host language/options, and value. |
| `"grid-json"` | JSON grid | embedded `BodyView` | Must recreate the active embedded-editor child when changing to/from another kind. |
| `"grid-csv"` | CSV grid | embedded `BodyView` | Must recreate on kind change. |
| `"grid-jsonl"` | JSONL grid | embedded `BodyView` | Must recreate on kind change. |
| `"md-view"` | Markdown preview | embedded `BodyView` | Must recreate on kind change. |
| `"svg-view"` | SVG preview | embedded `BodyView` | Must recreate on kind change. |
| `"html-view"` | HTML preview | embedded `BodyView` | Must recreate on kind change. |
| `"mermaid-view"` | Mermaid preview | embedded `BodyView` | Must recreate on kind change. |

The exact key is the same normalization already used by `NoteItemEditModel` at
`NoteItemEditModel.ts:206-210`: `const kind = note.content.editor || "monaco"`, typed as the
supported `EditorView`. It is not the note id and not the language string. `EditorView` contains
many page-level ids (`image-view`, `log-view`, `graph-view`, and others), but the note dispatch
offers only language-gated editors and `editorRegistry` documents that only Grid, Markdown, SVG,
HTML, and Mermaid provide an embeddable `BodyView`. A persisted unsupported id currently reaches
the `!module.BodyView` error in `NoteItemActiveEditor`; the conversion must preserve that explicit
failure rather than silently inventing an unsupported cell kind.

The record kind therefore needs two levels of ownership: the outer note cell's normalized editor
kind, and the active editor view/model held by that cell record. A different note with the same
kind is a re-point, not a recreation. A different kind disposes only the old active-editor view
and embedded `EditorModel` (detaching the note host first where required), then creates the new
kind. The outer note cell, event listeners, and ordinary DOM shells remain reusable.

### Expanded versus collapsed notes

Expansion is neither a second virtual-cell kind nor a height mode. `NotebookBody.tsx:114-118`
finds `expandedNoteId` in `data.notes`, while `:170-180` portals a separate
`ExpandedNoteView` into `editor.host?.editorOverlayRef`. The original `NoteItemView` stays in the
virtualized list; the expanded view is a full-area overlay. Therefore changing `expandedNoteId`
must not dirty or replace the corresponding grid cell and must not be treated as a row-height
change.

The flex layer learns about actual row expansion-like changes only from the nominated
`NoteItemView` root's `ResizeObserver`: Monaco content-size changes, comment/category/tag DOM
changes, and any other change to that `height: fit-content` root are measured, clamped/debounced by
`VirtualFlexGridModel`, and committed through `update({ rows: [row] })`. The separate
`ExpandedNoteView` overlay is outside that observer and has no effect on the row's measured height.

### Editing and recycled ownership

Today, `RenderGrid`/`RenderFlexGrid` removes a row's React subtree when its coordinate leaves the
render window. `NoteItemViewModel.dispose()` disposes its `NoteItemEditModel`, and the current
`MiniTextEditor`/`MonacoEditorHostView` is consequently destroyed with the row. Text edits are not
lost because `NoteItemEditModel.changeContent()` immediately calls
`NotebookEditor.updateNoteContent()`; editor-specific state is stored through the notebook's
per-note state map, and measured height is persisted. Transient component state (focus/hover,
category/tag draft state, Monaco selection and undo state) is currently row-local and is lost when
React unmounts the row. `NotebookEditor.getNoteState()` is used for nested-editor settings, not
for Monaco cursor/selection/undo state.

After conversion, a cell record must not dispose its owned note view or Monaco host merely because
`VirtualGridView` detached the element into `CellPool`. The record remains reachable in the
consumer's retained-view set, as in `ListBoxView`, so a scroll-out does not construct a replacement
host. On every readmission, including a `previous` coordinate whose note has changed, the record
must total-write the new note, normalized kind, callbacks, classes, attributes, content, language,
editor choice, title/comment/category/tag values, and optional controls. The old note's persisted
content/editor-specific state remains the source of truth if it returns later; no draft may be
silently written into the new note.

The reusable Monaco host is the `MonacoEditorHostView` inside the cell's active-editor view. It is
repointed by the E3-3 uncontrolled API: before changing the current note, capture the raw
editor's view state keyed by that note id; call `NoteItemEditModel.repoint(note)` (a new explicit
operation), call `MonacoEditorHostView.update({ language, options, onChange })`, then call
`MonacoEditorHostView.setValue(note.content.content)` and restore the incoming note's saved view
state. `setValue()` compares against the live Monaco model and suppresses the external-sync echo.
`NoteEditorModel`'s selection/content-size listeners remain attached to the same raw editor and
now route through the repointed model. Do not call `monaco.editor.create`, dispose the host on
pool eviction, or treat `initialValue` as a live prop. A genuine `kind` change is the only
cell-content transition that tears down that active editor child and permits a later construction.

The view-state map must be owned by the notebook view/active-editor owner for the lifetime of the
notebook body, so scrolling an actively edited note away and back does not lose its cursor,
selection, or scroll position even if the coordinate's cell is temporarily repointed to another
note. The existing source has no per-note Monaco undo-history store; the implementation must not
claim that view-state save/restore restores undo history. `MonacoEditorHostView.setValue()`
preserves undo for its guarded external-write path, while the acceptance check must separately
confirm that a cross-note re-point cannot apply the previous note's content or callbacks to the
new note.

The conversion must preserve the current supported editing contract: content changes continue to
write through synchronously, per-note editor settings and height remain keyed by note id, and a
cell detached/re-admitted without a kind change retains its live editor/view state. Category/tag
autocomplete drafts are not persisted by the current `NoteItemViewModel`; the vanilla model must
not accidentally commit a draft to a different note while re-pointing. Its current focus/blur and
cancel behavior must be reproduced explicitly, and any state that is intentionally retained while
the pooled record remains detached must be associated with the old note before the next total
write.

### `createPortal` and its vanilla destination

The portal at `NotebookBody.tsx:170-180` hosts exactly one `ExpandedNoteView` React subtree. Its
target is `TextChrome.tsx:112-117`'s empty `.editor-overlay` element, stored on the real
`TextFileModel` by `setEditorOverlayRef` (`TextEditorModel.ts:228-232`); the CSS makes it an
absolute, full-area, z-index-5 overlay. It is not a portal for a virtualized cell and it does not
host the grid.

`NotebookBodyView` must replace the portal with direct ownership: when an expanded note and a live
overlay target exist, construct/update one `ExpandedNoteView` vanilla instance, append its
`root` to that target, and call `mount()` only after attachment. When either condition disappears,
dispose the view and remove its root. Check the target once after mount (the React ref is assigned
by `TextChrome` during its commit) and on every notebook-state update; do not append a second root
or leave an old expanded view in the overlay. The overlay remains outside the virtualized grid, so
this direct vanilla view is allowed to own the full editor subtree without becoming a per-cell
React root.

## Implementation Plan

### 1. Correct the flex primitive's public capability type

Update `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts`:

- import `GridModelCapability` from `./types`;
- change `VirtualFlexGridProps.onModel` from `VirtualGridModel | null` to
  `GridModelCapability | null`;
- keep `VirtualFlexGridModel.setGridModel()` and `VirtualFlexGridView.onGridView()` structural;
  no cast and no model-class type may cross the callback;
- leave the internal `VirtualGridView`/`VirtualGridModel` composition and measurement lifecycle
  unchanged.

`src/renderer/uikit/VirtualGrid/index.ts` already re-exports the existing
`GridModelCapability` type, so no barrel change is required. Import that existing capability from
the VirtualGrid barrel; do not add a second interface.

Before → after:

```ts
// Before: VirtualFlexGridView.ts:16
onModel?: (model: VirtualGridModel | null) => void;
```

```ts
// After: the cross-engine caller-facing contract
onModel?: (model: GridModelCapability | null) => void;
```

### 2. Fix flex measurement with a nominated content element

Update `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts` in the same primitive-boundary
work, following EPIC-062 E4-11:

- widen `VirtualFlexCellParams` from the plain `RenderCellParams` alias to an intersection that
  adds `measure(element: HTMLElement): void`; do not modify the shared `RenderCellParams` type;
- have the stable flex renderer apply the explicit cell style as it does today, then provide a
  `measure()` callback to the consumer invocation. The callback records the nominated element for
  the current row, observes it, and reads its `clientHeight` into `VirtualFlexGridModel`;
- call `measure()` on every admission, including `previous` and pooled cells. If the consumer does
  not call it, retain the cell as the fallback measured element for fixed-height consumers;
- key `rowByElement` by the nominated element and add a cell-to-nominated-element map so
  `onCellReleased(element)` unobserves and deletes the correct nominated node before forwarding
  the release callback; and
- keep the explicit positioned cell height. It is required for `maxRowHeight: 800`; removing it
  would let an over-tall note overlap the next row instead of clipping to committed geometry.

Before → after:

```ts
// Before: VirtualFlexGridView.ts:11
export type VirtualFlexCellParams = RenderCellParams;
```

```ts
// After: the flex-only measurement nomination; VirtualGrid's shared params stay unchanged
export type VirtualFlexCellParams = RenderCellParams & {
    measure: (element: HTMLElement) => void;
};
```

`NotebookBodyView.renderCell` must call `p.measure(noteView.root)` on every admission, after the
same total-write/re-point path that rebuilds the note subtree. `NoteItemView` keeps its
content-driven `height: fit-content` root; the nominated root is not the positioned cell.

### 3. Split `NotebookBody` into a vanilla view and a React face

Create `src/renderer/editors/notebook/NotebookBodyView.ts` as
`VanillaView<{ model: NotebookEditor }>` and reduce
`src/renderer/editors/notebook/NotebookBody.tsx` to the React-facing `mountVanilla` adapter,
following `LinksList.tsx:53-55`.

`NotebookBodyView` must:

1. own the root/panel DOM using `createPanelElement` from
   `src/renderer/uikit/Panel/panel-style.ts`, including `data-name="notebook-body"` and
   `data-name="notebook-notes-list"` plus the existing flex/overflow/position settings;
2. subscribe to the exact notebook state slice currently selected at `NotebookBody.tsx:20-28`,
   and to `editor.typedQueue`/focus behavior without recreating the grid or cell renderer;
3. switch between the existing error, no-notes, no-filter-match, and populated-list arms by
   updating/removing owned DOM; preserve the current messages and `EditorError`-equivalent
   visible error content without mounting React;
4. create one `VirtualFlexGridView` only for the populated arm, append its root before
   `mount()`, and dispose it when the list arm is left; use the options below;
5. hold `private readonly renderCell` and `getInitialRowHeight` as stable bound fields. `renderCell`
   must read current `this.props`/model state, call the cell-record admission path, and call
   `p.measure(noteView.root)` on every admission; it must not be recreated in `onUpdate` as a
   translation of the old `useCallback`;
6. on state updates, update the flex view's props and call the capability's explicit dirty
   channel for every changed note-row field. A full `{ all: true }` update is acceptable for this
   notebook consumer; do not rely on a closure identity change to repaint; and
7. retain `onGridModel` only as an internal capability handle. `NotebookBody` has no external grid
   model prop, so do not expose a concrete model class through the new face.

The grid options are:

```ts
// After: NotebookBodyView grid options
{
    columnCount: 1,
    rowCount: () => this.currentNotes().length,
    columnWidth: () => "100%" as Percent,
    renderCell: this.renderCell,
    fitToWidth: true,
    minRowHeight: 100,
    maxRowHeight: 800,
    getInitialRowHeight: this.getInitialRowHeight,
    onModel: (model) => { this.gridModel = model; },
}
```

The `getInitialRowHeight` field must resolve the current filtered row and call
`editor.getNoteHeight(note.id)`. It must not capture the old `notes` array. When the grid is
disposed, clear the capability and dispose all retained cell records/views after the grid has
stopped invoking the renderer.

### 4. Implement the recycled note-cell record and note view

Delete the React implementation in `src/renderer/editors/notebook/NoteItemView.tsx` and create
`src/renderer/editors/notebook/NoteItemView.ts` as the direct `NoteItemView` view used by
`NotebookBodyView`. Refactor `src/renderer/editors/notebook/NoteItemViewModel.ts` so it can be
driven by explicit vanilla lifecycle/update calls rather than `useComponentModel` effects.

The `NotebookBodyView` record must mirror the `ListBoxView` policy:

```ts
interface CellRecord {
    cell: HTMLElement;
    kind: NoteKind;
    index: number;
    note: NoteItem;
    view: NoteItemView;
}

private readonly cells = new WeakMap<HTMLElement, CellRecord>();
private readonly cellRecords = new Set<CellRecord>();
private readonly ownedNoteViews = new Set<NoteItemView>();
```

The bound renderer must use `p.previous ?? p.recycle?.() ?? document.createElement("div")`,
recognize/create the record, rewrite `index`, `note`, `kind`, and every current prop on every
admission, apply the incoming geometry through the flex wrapper, and return the same cell. It
must not infer note identity from `p.key`; `VirtualGrid` keys are coordinates of the form
`` `${row}_${col}` ``. A listener installed once on a cell must look up the current record from
the `WeakMap`, just as `ListBoxView.activeRecord()` does.

When `record.kind === kind`, call `record.view.update(currentProps)` and let its active-editor
child re-point in place. When the normalized kind differs, dispose only the old active-editor
view/editor child, replace the note view's editor arm, and continue using the same outer cell
record where possible. Dispose the `NoteItemView` and all retained owned views only during owner
teardown. Never dispose a Monaco host on `CellPool.release()`.

The vanilla note view must reproduce all current `NoteItemView.tsx` behavior without JSX or
`mountReact`: focus/blur containment, hover/deactivation area, note drag trait data and opacity,
category/tag editing and cancellation, title input, expand/delete actions, comment add/edit/remove,
search highlighting via `highlightInto`, wheel forwarding to `#avg-container`, and the exact
`Panel`/padding/toolbar/content geometry. Use direct vanilla UIKit views (`InputView`,
`TextareaView`, `IconButtonView`, `SegmentedControlView`, `openMenu`, `createPanelElement`, and
DOM icon builders) where they already exist. Rename `cellRef` in `NoteItemViewProps` to the
vanilla measurement nomination: the cell renderer calls `p.measure(noteView.root)` on every
admission. The flex view measures that `height: fit-content` root, while the positioned cell keeps
the explicit committed height.

### 5. Depend on US-1068 for the `PathInput` boundary

`PathInputView` is not converted in US-1064. Its `mountReact` bridge at
`src/renderer/uikit/PathInput/PathInputView.tsx:216-230` is a real E4-3 violation when nested in a
cell, but `PathInput` has four independent consumers outside the notebook, so E4-4's private-host
test does not apply. US-1068, sequenced immediately before this task, owns the shared UIKit
conversion and must leave `PathInputProps`, `PathInputModel`, keyboard navigation, 150 ms blur
grace, `KeyedList` row identity, `PathInput.css`, and the React `PathInput.tsx` face unchanged.

### 6. Make `NoteItemEditModel` re-pointable and convert Monaco directly

Update `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts`:

- make the note identity used by `changeContent`, `changeLanguage`, `changeEditor`, height
  persistence, descriptor, and per-note state access mutable through one explicit
  `repoint(note: NoteItem)` operation;
- total-write the public edit state (`id`, title, content, language, editor, and the fixed host
  flags) when a record is admitted for a new note; do not leave the previous note's id/title or
  editor selection in the reused model;
- keep `NoteEditorModel` attached to the reused raw Monaco editor for the same `NoteKind`, so its
  selection/content-size listeners route to the current edit model; and
- preserve synchronous notebook writes and all existing per-note editor state/height methods.

Create a framework-free `MiniTextEditorView` from the current
`src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx` behavior. It owns the sizing wrapper
and one `MonacoEditorHostView`, uses `initialValue` only on first mount, calls host `update()` for
language/options and host `setValue()` for current content, and passes
`host.getEditor()` to `NoteEditorModel.handleEditorDidMount`. Preserve max-height versus
fill-container behavior, `setHighlightText`, compact Monaco options, content-change routing, and
host-owned disposal. Before a same-kind note re-point, save the current raw editor view state in
the notebook body's per-note map; after `update()`/`setValue()`, restore the incoming note's view
state. The view must not call `monaco.editor.create` itself or dispose Monaco directly.

Create a framework-free `NoteItemActiveEditorView` from
`NoteItemActiveEditor.tsx`. For `monaco`, keep/update one `MiniTextEditorView`. For each other
valid `NoteKind`, load the module with `editorRegistry.getModule`, require `BodyView`, create the
embedded editor, `adoptHost(noteEditModel)`, await `restore()`, instantiate the `BodyView` directly,
append/mount it after attachment, and update it on current model/config changes. On a genuine
kind switch, extract the note host before disposing the old embedded editor, then create the new
arm. Guard asynchronous module loads with a generation/alive token so a recycled cell cannot
attach an old note's editor after it has been re-pointed or disposed.

Before → after for the Monaco branch:

```tsx
// Before: MiniTextEditor.tsx:56-108
<MonacoEditorHost
    initialValue={content}
    language={language}
    onMount={(host) => editorModel.handleEditorDidMount(host.getEditor())}
    onChange={editorModel.handleEditorChange}
    options={options}
/>
```

```ts
// After: MiniTextEditorView admission/update path
this.host.update({ language, onChange: this.editorModel.handleEditorChange, options });
this.host.setValue(content);
```

The host in this snippet is the one retained by the recycled cell; it is not recreated for a
different note of the same normalized kind.

### 7. Convert the shared note toolbar without a React subtree

Convert `src/renderer/editors/notebook/note-editor/NoteItemToolbar.tsx` into a direct
`NoteItemToolbarView`; the verified production callers are both being converted, so retain no
React toolbar face. Use:

- `createPanelElement` for the toolbar shell and a caller-owned DOM title host;
- `IconButtonView` with DOM icons for the language button, run, and run-all actions;
- `openMenu`/`MenuView` for the language menu, with
  `createFileTypeIconElement` from `src/renderer/components/icons/icon-elements.ts` rather than
  `<LanguageIcon />`;
- `SegmentedControlView` for editor switching; and
- direct toolbar slots (`editorToolbarRefFirst`/`Last`) for embedded editors.

Recompute switch options from `editorRegistry.getSwitchOptions(language || "plaintext", undefined)`
on model updates, preserve recent-language ordering through `settings`, keep script-run button
visibility based on `isScriptLanguage` and `NoteEditorModel.hasSelection`, and total-write/removes
toolbar slots when the embedded editor arm changes. The title `InputView` is owned by the note
view and is moved into the toolbar's stable title host; it is not rendered as a React child.

### 8. Convert `ExpandedNoteView` and wire the overlay directly

Delete the React implementation in `src/renderer/editors/notebook/ExpandedNoteView.tsx` and create
`src/renderer/editors/notebook/ExpandedNoteView.ts` as an
`ExpandedNoteView extends VanillaView` with the same category/tag/title/editor/comment controls,
Escape-to-collapse behavior, full-container editor configuration, and `NoteItemEditModel` cleanup.
Reuse the framework-free toolbar and active-editor views from steps 5-6. Use
`highlightInto` for category/tag labels and direct UIKit views for inputs/buttons/textareas.

`NotebookBodyView.syncExpandedOverlay()` must implement the old `createPortal` semantics by
appending the expanded view root to `editor.host?.editorOverlayRef`, mounting after append, updating
the same instance when the same expanded note/state changes, and disposing/removing it when the
overlay target or expanded note disappears. A note that is expanded remains represented by its
ordinary virtual cell; there is no second cell and no row-kind mutation.

### 9. Update exports and remove obsolete React-only internal references

Update `src/renderer/editors/notebook/note-editor/index.ts` to export the new framework-free view
classes and the model without exporting dead React-only implementations. Update local imports in
`NotebookBodyView`, `NoteItemView`, and `ExpandedNoteView`. Keep the notebook editor module's
React-facing `Component` contract intact through the thin `NotebookBody.tsx` face.

Do not change `src/renderer/editors/notebook/NotebookEditor.ts`, `TextChrome.tsx`, or
`TextEditorModel.ts`: their state/method and overlay-ref contracts are the verified producer API
the new view consumes. Do not touch any other editor's `BodyView` implementation.

### 10. Manual verification, including Rule 4

No unit tests or test harnesses are to be added. Verify under `npm start` with
`C:\data\js-notepad-notes\temp\test.note.json`:

1. Open the notebook and let the initial variable-height layout settle. Confirm the flex wrapper
   reports distinct note heights, clamps at 100/800, and changes geometry after a Monaco content
   height update without visible intermediate jumps from the 50 ms debounce.
2. Exercise every normalized note kind listed above, including switching kind in the toolbar and
   switching back. Confirm grid/markdown/SVG/HTML/Mermaid bodies remain direct DOM views and no
   virtualized cell contains a React root or `data-reactroot`/React event bridge.
3. Type content, edit category/tags/title/comment, scroll the active row out and back, and verify
   content, per-note editor choice/settings, and height are associated with the original note. A
   pooled cell admitted for another note must not display the old note's title/content/category,
   callbacks, editor kind, draft, class, or selection state.
4. Expand and collapse a note. Verify the expanded root appears exactly once in the existing
   `.editor-overlay`, has full-area overlay geometry, Escape/collapse works, and the corresponding
   virtual row is not replaced or resized merely because it is expanded.
5. Count Monaco constructions using DOM tagging because MCP `execute_script` cannot reach imported
   modules and therefore cannot patch `monaco.editor.create`:

   - use `[data-name="notebook-notes-list"] .scroll-container`, the classed scroll element created
     by `VirtualGridView.ts:267`; do not look for a nonexistent `data-part="scroll"` attribute;
   - after initial paint, stamp every connected `.monaco-editor` under that scroll container with
     a unique `data-monaco-probe` value;
   - move `scrollTop` from 0 to 4800 in 400 px steps and back to 0, waiting 300 ms after each
     step; after each settle, count connected `.monaco-editor` elements lacking the stamp, count
     them as constructions, then stamp them;
   - use `isConnected` when counting so detached pooled DOM is not mistaken for a live editor;
   - record initial constructions separately. Constructions must not exceed the peak number of
     simultaneously visible `monaco`-kind notes (at most three on this fixture), and every pass
     that revisits rows already visited must report zero new constructions; in particular, the
     return-to-0 pass must report no new construction. The baseline's failing `back0:live1:new1`
     is the sharp regression signal, not a target of one total host;
   - also verify that the reused editor's content and `data-monaco-probe` remain attached to the
     admitted cell while the note changes, proving the host was re-pointed through `update()` and
     `setValue()` rather than recreated.

The probe is evidence of DOM retention, not a patch of Monaco internals. An unstamped connected
editor after a settled step is the only available construction signal under the stated MCP
limitation.

## Concerns / Open questions

1. **The current flex callback type is too concrete.** This is resolved as an implementation step,
   not a user decision: change `VirtualFlexGridProps.onModel` to `GridModelCapability | null` and
   use that type in the notebook. A cast to `VirtualGridModel` is prohibited by E4-9.

2. **`PathInputView` is a separate shared-primitive task.** Its React bridge is an E4-3 violation
   inside a note cell, but its four independent consumers outside the notebook make it fail E4-4's
   private-host test. US-1068 owns that conversion immediately before US-1064; this task must not
   modify `src/renderer/uikit/PathInput/PathInputView.tsx`.

3. **The flex measurement must nominate content, not read back cell geometry.** E4-11 requires
   `VirtualFlexCellParams.measure(element)` plus nominated-element bookkeeping in
   `VirtualFlexGridView`; the explicit positioned cell height remains necessary for
   `maxRowHeight`. A notebook cell that omits `p.measure(noteView.root)` would silently fall back
   to the tautological US-1063 behavior, so admission and release verification must cover both the
   nominated element and the cell-to-nominated map.

4. **Async embedded-editor races.** `editorRegistry.getModule()` and `EditorModel.restore()` are
   asynchronous. A pooled cell may be re-pointed or disposed before either completes. The active
   editor view needs a generation guard, must detach/dispose a late-created editor, and must never
   append a late `BodyView` to a cell now owned by another note.

5. **Re-pointing a host model is not the same as changing `initialValue`.** `NoteItemEditModel`'s
   note id is currently readonly and several methods close over `noteId`; adding one explicit
   `repoint(note)` operation is required so content, height, descriptor, and editor-state writes
   cannot land on the previous note. Monaco itself is reused only through `MonacoEditorHostView`
   `update()`/`setValue()`.

6. **Transient draft state.** The current React component state for category/tag drafts is row-local
   and is already discarded by a real React unmount. The conversion must preserve the current
   cancel/blur semantics and must never apply a detached note's draft to a new occupant. Persisted
   content, editor choice, per-note editor settings, and measured height must survive by reading
   from `NotebookEditor` when the note is admitted; Monaco cursor/selection/scroll view state is
   handled by the per-note view-state map above. If product requirements later demand drafts
   survive arbitrary cell reassignment, that is a separate per-note-state design; no such storage
   exists in the inspected code.

7. **Overlay target timing.** `TextChrome` sets `editorOverlayRef` through a React ref callback and
   there is no dedicated overlay-target event. `NotebookBodyView` must perform an initial
   microtask retry after mount and repeat `syncExpandedOverlay()` on notebook-state updates; if
   `TextChrome` can assign the target after both, the implementation must add a narrowly scoped
   observer or callback at this seam rather than polling indefinitely. No user-facing behavior
   choice is unresolved, but this timing must be verified live.

8. **No tests.** Project guidance explicitly excludes unit tests and test harnesses. Verification is
   the manual story/live procedure above, recorded in EPIC-062 when the task is implemented.

No open question requiring user direction remains after source inspection. The only behavior that
cannot be inferred statically is the live overlay-ref timing and the Rule 4 measurement; both have
an explicit manual procedure and acceptance result.

## Acceptance Criteria

- [ ] `NotebookBody.tsx` is a thin `mountVanilla` face and no longer imports `RenderFlexGrid`,
  `RenderGridModel`, `RenderFlexCellParams`, `createPortal`, or React cell components.
- [ ] `NotebookBodyView` composes one `VirtualFlexGridView` only for the populated arm, preserves
  error/empty/filter-empty states, uses the existing panel layout, and owns the expanded overlay by
  append/mount/update/dispose rather than `createPortal`.
- [ ] `VirtualFlexGridProps.onModel` is typed against `GridModelCapability | null`; no concrete
  grid model class or cast crosses the caller boundary.
- [ ] The notebook renderer is a bound field. It uses coordinate-keyed `previous`/`recycle()`
  admission, a `WeakMap<HTMLElement, CellRecord>`, retained owned views, total writes, and
  recreation only on normalized note-kind change; every admission nominates the content root via
  `p.measure(noteView.root)`.
- [ ] `VirtualFlexCellParams` adds the flex-only `measure(element: HTMLElement)` callback without
  changing `RenderCellParams`; `VirtualFlexGridView` observes the nominated element, falls back
  to the cell when no nomination occurs, and unobserves the correct nominated element on release.
- [ ] The exact normalized kind key is `note.content.editor || "monaco"`, and all eight valid
  renderable kinds (`monaco`, three grid kinds, `md-view`, `svg-view`, `html-view`, `mermaid-view`)
  have explicit same-kind reuse/different-kind recreation behavior.
- [ ] No virtualized cell, at any depth, creates or hosts a React root. This includes the note
  view, active editor dispatch, Monaco host, toolbar, category/tag `PathInput`, menus, and embedded
  `BodyView` children.
- [ ] A same-kind recycled Monaco cell retains one `MonacoEditorHostView` and re-points it using
  `NoteItemEditModel.repoint()`, host `update()`, and host `setValue()`; it saves/restores
  per-note Monaco view state across a coordinate re-point; no host is disposed on pool eviction
  and no `monaco.editor.create` call is added to the consumer.
- [ ] Note content, editor choice, editor-specific per-note state, measured height, callbacks,
  classes, attributes, and optional controls are rewritten for every admission; no previous note's
  state leaks into a new occupant.
- [ ] The collapsed row's nominated `height: fit-content` root reaches `VirtualFlexGridModel`
  through the corrected observer/debounce/update path while the positioned cell retains explicit
  committed height for `maxRowHeight`; `expandedNoteId` only controls the separate full-area
  overlay and does not alter cell kind or row height.
- [ ] Category/tag autocomplete, focus/blur/cancel behavior, title/comment editing, drag data,
  search highlighting, toolbar language/editor switching, script actions, and Escape collapse
  remain functional through direct DOM views.
- [ ] The manual Rule 4 procedure on
  `C:\data\js-notepad-notes\temp\test.note.json` reports at most one construction per note on
  first visit, zero on revisited rows, and zero on the return-to-0 pass.

  **Amended.** This criterion originally required staying within the fixture's peak simultaneous
  `monaco`-cell count (≤3). E4-6 and E4-13 superseded that: a pooled cell is deliberately
  *retained* rather than detached, so its editor stays connected and "simultaneously live" no
  longer means "in the viewport". The ceiling is now per-note first construction, which is what
  the epic measures against the baseline of 1.
- [ ] No unit tests or harnesses are added, and the task folder remains in the tree.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/notebook/NotebookBody.tsx` | Replace the React grid/portal body with a thin `mountVanilla` face. |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | New vanilla notebook shell, state subscription, `VirtualFlexGridView` owner, stable renderer, cell records, and direct expanded-overlay lifecycle. |
| `src/renderer/editors/notebook/NoteItemView.tsx` | Delete the React-only note row implementation; its sole consumer moves to the new direct view. |
| `src/renderer/editors/notebook/NoteItemView.ts` | New direct vanilla note-row view and retained child-view ownership. |
| `src/renderer/editors/notebook/NoteItemViewModel.ts` | Make note-row state/lifecycle explicitly updateable and vanilla-driven. |
| `src/renderer/editors/notebook/ExpandedNoteView.tsx` | Delete the React-only expanded overlay; its sole consumer moves to the new direct view. |
| `src/renderer/editors/notebook/ExpandedNoteView.ts` | New direct vanilla expanded-note overlay view. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | Delete the React dispatcher so the cell cannot reach a React root through it. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditorView.ts` | New direct active-editor dispatcher with guarded asynchronous `BodyView` ownership. |
| `src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx` | Delete the React Monaco body implementation. |
| `src/renderer/editors/notebook/note-editor/MiniTextEditorView.ts` | New direct Monaco body using the shared host. |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbar.tsx` | Delete the React toolbar implementation. |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts` | New direct toolbar using native UIKit views/menu. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | Add total note re-pointing while preserving per-note writes, height/state storage, and Monaco callbacks. |
| `src/renderer/editors/notebook/note-editor/index.ts` | Update exports/imports to the direct view implementations. |
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts` | Type `onModel` against `GridModelCapability` and add E4-11's flex-only `measure(element)` nomination, nominated-element observation, cell-to-nominated release map, and cell fallback. |

### Files that need no changes

| File | Reason |
|---|---|
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts` | Its measurement policy already matches the notebook's min/max/debounce/initial-height requirements. |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | It already accepts `ElementLength`, stable renderer identity, and geometry-aware `update({ rows })`. |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | Its `onCellReleased` hook already removes flex measurement records before pooling. |
| `src/renderer/uikit/VirtualGrid/CellPool.ts` | The shipped no-reset reuse contract is the dependency, not a target for change. |
| `src/renderer/uikit/VirtualGrid/types.ts` | `GridModelCapability`, `RenderCellParams.previous/recycle`, `HTMLElement` cells, and `ElementLength` already exist. |
| `src/renderer/uikit/RenderGrid/` | The React fork remains until US-1067; this task only removes its notebook consumer. |
| `src/renderer/editors/notebook/NotebookEditor.ts` | Existing state, note mutation, height persistence, and overlay-host methods remain the source API. |
| `src/renderer/editors/base/TextChrome.tsx` | It already creates and assigns the `.editor-overlay` target consumed by the vanilla body. |
| `src/renderer/editors/text/TextEditorModel.ts` | Its `editorOverlayRef` storage is already correct; no portal contract change is needed. |
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | E3-3 already supplies uncontrolled `update()`, `setValue()`, and host-owned disposal. |
| `src/renderer/uikit/Input/InputView.tsx`, `Textarea/TextareaView.tsx`, `IconButton/IconButtonView.tsx`, `SegmentedControl/SegmentedControlView.tsx`, `Menu/attach-menu.ts` | Existing native views are the direct composition primitives for the note subtree. |
| `src/renderer/uikit/PathInput/PathInputView.tsx` | No change here; its shared React-root removal is owned by US-1068 before this task. |
| `src/renderer/uikit/shared/highlight.ts` | `highlightInto` already supplies the DOM form; the remaining React form still has consumers outside this task. |
| `src/renderer/uikit/VirtualGrid/index.ts` | It already re-exports `GridModelCapability`; only the flex view's callback annotation changes. |
| `src/renderer/editors/notebook/index.tsx` | Its editor-module boundary can continue to render the `NotebookBody` React face. |
| `doc/epics/EPIC-062.md` | Task findings and live results are recorded here only when implementation/testing closes; no epic rewrite is part of this plan. |
