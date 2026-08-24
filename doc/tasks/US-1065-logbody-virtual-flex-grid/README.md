# US-1065  LogBody and its cell subtree to VirtualFlexGrid

Epic: [EPIC-062  De-React Epic E4](../../epics/EPIC-062.md)

Status: implementation in progress.

## Implementation progress

- [x] Native LogBody host, projection, pooling, and scrolling
- [x] Native wrapper, dispatcher, message, and styled-text helpers
- [x] Native dialog leaves
- [x] Native output leaves and embedded-view lifecycle
- [x] Acceptance greps and required typecheck/lint/production build

## Goal

Replace the React `RenderFlexGrid` contract in the log-view editor with
`VirtualFlexGridView`, and convert the complete virtualized cell subtree to
`VanillaView` so no cell can create or host a React root. Preserve log entry
rendering, dialog interaction, embedded output editors, height caching, and
the existing queue-driven focus/auto-scroll behavior under the E4-7 recycled
cell contract.

## Background

EPIC-062 E4-3 requires the whole cell subtree to leave React: a virtualized
cell may not contain `mountReact`, `createPortal`, or `react-dom` at any depth
([doc/epics/EPIC-062.md:90-115](../../epics/EPIC-062.md)). E4-7 requires total
writes on every admission because `previous` is keyed by coordinate and a
pooled element arrives with its prior occupant's DOM, listeners, and child
views ([doc/epics/EPIC-062.md:242-311](../../epics/EPIC-062.md)). E4-11 requires
`VirtualFlexGridView.measure()` to receive the content element, not the
positioned cell ([doc/epics/EPIC-062.md:369-421](../../epics/EPIC-062.md)).
E4-13 and E4-14 require frame-bearing cells to remain attached while pooled
and require idempotent root attachment ([doc/epics/EPIC-062.md:468-562](../../epics/EPIC-062.md)).

The current render site is `LogBody` at
`src/renderer/editors/log-view/LogBody.tsx:92-138`: it returns a new
`renderLogEntry` callback, reads the old `RenderGridModel.containerRef`, and
renders a two-column `RenderFlexGrid` with a 100% content column, 40px gutter,
18px minimum rows, cached initial heights, and `preferMinHeightForNewRows`.
The cell renderer returns `LogEntryWrapper` at
`src/renderer/editors/log-view/LogBody.tsx:92-105`; the wrapper owns the cell
ref and dispatches to `LogEntryContent` at
`src/renderer/editors/log-view/LogEntryWrapper.tsx:41-78`.

The dispatcher currently reaches 15 files under
`src/renderer/editors/log-view/items/` from
`src/renderer/editors/log-view/LogEntryContent.tsx:97-155`. The leaf views
include an existing direct Monaco construction in
`items/TextOutputView.tsx:24-69`, a direct `DataGrid` wrapper in
`items/GridOutputView.tsx:72-87`, a `MarkdownBlock` wrapper in
`items/MarkdownOutputView.tsx:23-51`, and `ColorizedCode` wrappers in
`items/McpRequestView.tsx:84-113`. Their corresponding native view classes
are available in `src/renderer/editors/shared/MonacoEditorHostView.ts:23-153`,
`src/renderer/uikit/DataGrid/DataGridView.ts:87-209`,
`src/renderer/editors/markdown/MarkdownBlockView.ts:162-208`, and
`src/renderer/editors/shared/ColorizedCodeView.ts:34-95`.

The validated notebook host is the implementation pattern. It sets
`minHeight: 0` on both body and list panels, keeps a stable bound
`renderCell`, uses kind-aware records and `setReuseKey`, updates records with
total writes, calls `measure(record.view.root)`, retains owned views in a
set, and performs idempotent grid-root attachment
([src/renderer/editors/notebook/NotebookBodyView.ts:81-187](../../../src/renderer/editors/notebook/NotebookBodyView.ts#L81)).
`VirtualFlexGridView` exposes the scroll element and nominated measurement
callback at
`src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts:10-103`; its inner
`VirtualGridView` documents the pooled-cell and `scrollElement` contract at
`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:14-63` and
`src/renderer/uikit/VirtualGrid/VirtualGridView.ts:204-214`.

## Verified investigation findings

### Current LogBody contract and state paths

- `LogBody` selects `entries`, `entryCount`, `error`, and `showTimestamps` from
  `model.state` at `src/renderer/editors/log-view/LogBody.tsx:13-19`.
- It stores the grid model in a React ref at
  `src/renderer/editors/log-view/LogBody.tsx:21-28`, derives bottom detection
  from `gridModelRef.current?.containerRef?.current` at
  `src/renderer/editors/log-view/LogBody.tsx:30-36`, and installs/removes a
  scroll listener at `src/renderer/editors/log-view/LogBody.tsx:38-43`.
- Queue events focus the old grid container or schedule the iterative
  bottom-scroll sequence at `src/renderer/editors/log-view/LogBody.tsx:49-69`.
  Entry-count changes invalidate all grid geometry, preserve the at-bottom
  policy, and clean up timers at `src/renderer/editors/log-view/LogBody.tsx:71-86`.
  Timestamp changes invalidate all rows at `src/renderer/editors/log-view/LogBody.tsx:88-90`.
- `LogViewEditor` sends the `focus` and `scrollToBottom` events at
  `src/renderer/editors/log-view/LogViewEditor.ts:10-14` and
  `src/renderer/editors/log-view/LogViewEditor.ts:73-75`, appends entries and
  sends the scroll event at `src/renderer/editors/log-view/LogViewEditor.ts:341-349`,
  updates entries by index at `src/renderer/editors/log-view/LogViewEditor.ts:390-397`,
  and keeps row heights by entry id at
  `src/renderer/editors/log-view/LogViewEditor.ts:443-451`.
- Empty and error states are returned before the grid at
  `src/renderer/editors/log-view/LogBody.tsx:115-124`; the non-empty state
  wraps the grid in `Panel name="log-view-root" direction="column" flex={1}
  overflow="hidden"` at `src/renderer/editors/log-view/LogBody.tsx:126-139`.

### Cell ownership and dispatch

- `LogEntryWrapper` reads the entry by coordinate and creates an index-bound
  updater at `src/renderer/editors/log-view/LogEntryWrapper.tsx:41-49`.
  Its root is a row panel with `height="fit-content"`, the timestamp is
  conditional, and `entry-content` is a flex column at
  `src/renderer/editors/log-view/LogEntryWrapper.tsx:53-78`.
- `LogEntryContent` currently has a React error boundary at
  `src/renderer/editors/log-view/LogEntryContent.tsx:20-44`. Its fallback
  displays the entry type and `error.message`; the native conversion must
  retain per-cell containment without using a React root.
- The dispatcher maps all concrete entry types at
  `src/renderer/editors/log-view/LogEntryContent.tsx:97-155`; recognized log
  messages use `LogMessageView` at `:176-179`, while dialogs and outputs add
  `Panel name="log-item-wrapper" paddingY="xs"` at `:180-184`.
- `LogMessageView` maps log levels to UIKit text color tokens and renders
  `StyledTextView` inside a word-breaking panel at
  `src/renderer/editors/log-view/LogMessageView.tsx:9-31`.
- `StyledTextView` renders either one span or a fragment of spans with the
  entry's arbitrary inline styles at
  `src/renderer/editors/log-view/StyledTextView.tsx:3-17`. The fragment is a
  React-no-DOM component and must not become an unstyled layout wrapper.

### Leaf behavior verified

- Dialog composition is `DialogContainer`  optional `DialogHeader`  native
  controls  `ButtonsPanel`. The exact container chrome is at
  `items/DialogContainer.tsx:8-27`; the header's null-for-no-title behavior is
  at `items/DialogHeader.tsx:9-21`; button parsing, required-button disabling,
  resolved-state icon, and click forwarding are at
  `items/ButtonsPanel.tsx:9-71`.
- Confirm and button dialogs resolve through `LogViewEditor.resolveDialog` at
  `items/ConfirmDialogView.tsx:20-43` and
  `items/ButtonsDialogView.tsx:17-35`. Text input updates the entry, resolves
  on button click, and resolves the last button on a valid Enter key at
  `items/TextInputDialogView.tsx:21-80`.
- Checkbox, radio, and select dialogs mutate their entry through the supplied
  updater and disable controls after resolution. Their current layout and
  max-height rules are at `items/CheckboxesDialogView.tsx:22-79`,
  `items/RadioboxesDialogView.tsx:22-79`, and
  `items/SelectDialogView.tsx:21-75`.
- Progress output destructures label/value/max/completed and conditionally
  creates the label and progress text at
  `items/ProgressOutputView.tsx:9-34`.
- Grid output derives detected columns, merges saved widths from
  `vm.getItemState`, debounces `vm.setItemState`, flushes on teardown, and
  opens a grid editor at `items/GridOutputView.tsx:13-70`; its DataGrid options
  are at `:72-87`.
- Markdown output opens a markdown editor and renders a compact markdown block
  with hover actions at `items/MarkdownOutputView.tsx:13-51`.
- MCP output has local expanded state, a click-to-toggle header with a
  stop-propagating icon button, and two scrollable colorized JSON sections at
  `items/McpRequestView.tsx:34-125`.
- Mermaid output uses `TComponentModel` for cancellable async rendering and
  theme changes at `items/MermaidOutputView.tsx:39-78`, uses an image ref for
  clipboard copy at `:80-95`, and renders loading/error/image branches and
  hover actions at `:97-156`.
- Text output creates one read-only Monaco editor, sizes its host from content,
  updates model text/language/options, disposes the editor and size listener,
  and opens a Monaco page at `items/TextOutputView.tsx:24-98`; its DOM shell is
  at `:100-130`.

The 15 `items/*` files are all imported directly by the dispatcher, verified
at `src/renderer/editors/log-view/LogEntryContent.tsx:4-15`:

| File | Current role |
|---|---|
| `items/ButtonsDialogView.tsx` | Button-only dialog at `:17-35` |
| `items/ButtonsPanel.tsx` | Shared parsed button row at `:34-71` |
| `items/CheckboxesDialogView.tsx` | Checkbox dialog at `:22-79` |
| `items/ConfirmDialogView.tsx` | Confirm dialog at `:20-43` |
| `items/DialogContainer.tsx` | Shared dialog shell at `:13-27` |
| `items/DialogHeader.tsx` | Optional title header at `:13-21` |
| `items/GridOutputView.tsx` | Persisted read-only DataGrid at `:32-89` |
| `items/MarkdownOutputView.tsx` | Markdown output and open action at `:17-53` |
| `items/McpRequestView.tsx` | Expandable MCP request/response card at `:34-125` |
| `items/MermaidOutputView.tsx` | Async Mermaid image output at `:80-158` |
| `items/ProgressOutputView.tsx` | Progress bar output at `:13-34` |
| `items/RadioboxesDialogView.tsx` | Radio dialog at `:22-79` |
| `items/SelectDialogView.tsx` | Select dialog at `:21-75` |
| `items/TextInputDialogView.tsx` | Text-input dialog at `:21-80` |
| `items/TextOutputView.tsx` | Read-only Monaco output at `:24-130` |

The direct native replacements are not hypothetical new primitives. UIKit
already exposes `ButtonView`, `IconButtonView`, `InputView`, `CheckboxView`,
`RadioGroupView`, `SelectView`, `ProgressBarView`, `DividerView`, and
`SpacerView`; their React faces delegate to those classes at
`src/renderer/uikit/Button/Button.tsx:1-23`,
`src/renderer/uikit/IconButton/IconButton.tsx:1-21`,
`src/renderer/uikit/Input/Input.tsx:1-53`,
`src/renderer/uikit/Checkbox/Checkbox.tsx:1-19`,
`src/renderer/uikit/RadioGroup/RadioGroup.tsx:1-34`,
`src/renderer/uikit/ProgressBar/ProgressBar.tsx:1-20`, and
`src/renderer/uikit/Select/SelectView.ts:58-144`. Panels and text are
framework-free builders at `src/renderer/uikit/Panel/panel-style.ts:342-349`
and `src/renderer/uikit/Text/text-style.ts:100-107`. `DataGridView` owns the
av-grid instance and has the required row-before-column update split at
`src/renderer/uikit/DataGrid/DataGridView.ts:87-209`, with the consumer-side
repoint contract specifically at `:181-195` and `:202-204`; `MarkdownBlockView` and
`ColorizedCodeView` already own their asynchronous/native work at
`src/renderer/editors/markdown/MarkdownBlockView.ts:162-208` and
`src/renderer/editors/shared/ColorizedCodeView.ts:43-95`.

### E4-15 hazard audit completed so far

- **React roots / portals:** `rg` found no `mountReact`, `createPortal`, or
  `react-dom` in `src/renderer/editors/log-view`; every current cell view is
  nevertheless React-rendered and must be replaced, including the dispatcher
  boundary and all 15 `items/*` files. The only React wrapper with no DOM in
  this subtree is `StyledTextView`'s fragment path at
  `src/renderer/editors/log-view/StyledTextView.tsx:11-17`.
- **Focus delegation:** `rg` found no `onFocus` or `onBlur` in the LogBody
  subtree. The native conversion must still use native event names for any
  controls whose UIKit view contracts expose focus behavior; there is no
  React focus site to translate in these files.
- **Stale selectors:** `rg` found no `closest(...)` or `#avg-container` in
  `src/renderer/editors/log-view`. The converted host must use
  `VirtualFlexGridView.scrollElement` for scroll listeners and queue focus;
  no cell may name grid markup. The repository now has exactly one
  `#avg-container` occurrence, at
  `src/renderer/uikit/RenderGrid/RenderGrid.tsx:102`; no log-view lookup can
  be stranded by this conversion, and the remaining legacy owner is removed
  by US-1067.
- **Flex min-height:** the current `TextChrome` flex root has
  `direction="column"`, `flex={1}`, and `height={0}` but no `minHeight` at
  `src/renderer/editors/base/TextChrome.tsx:83-93`; the current non-empty
  LogBody root also has `direction="column"`, `flex={1}`, and
  `overflow="hidden"` but no `minHeight` at
  `src/renderer/editors/log-view/LogBody.tsx:126-139`. The new LogBody body
  root and its grid/list host therefore need explicit `minHeight: 0`; the
  already-converted `VirtualFlexGridView` root itself sets `minHeight = "0"`
  at `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts:105-113`.
- **React components that add no box:** `EntryErrorBoundary` returns its
  children directly on success at
  `src/renderer/editors/log-view/LogEntryContent.tsx:27-42`, and
  `LogEntryContentInner` returns the selected view directly for log entries or
  unknown entries at `:176-184`. `StyledTextView` returns a fragment for
  styled segments at `src/renderer/editors/log-view/StyledTextView.tsx:11-17`.
  These native dispatcher/helper views must not introduce a block wrapper; a
  required `VanillaView` root uses `display: contents`, while actual panels
  (`LogEntryWrapper`, `LogMessageView`, and the dialog/output wrapper) retain
  their boxes.
- **Disposal order:** there is no current `onDispose` method in the log-view
  cell subtree; the search found only React cleanup effects. `GridOutputView`
  clears its persistence timer and flushes model state at
  `items/GridOutputView.tsx:59-65`, without touching a child view. The current
  direct Monaco teardown disposes its size subscription and editor at
  `items/TextOutputView.tsx:63-67`; the native replacement must own the host
  explicitly and must not read it from an owner's `onDispose` after child-first
  disposal. Mermaid's cancellation cleanup only flips its local cancellation
  flag at `items/MermaidOutputView.tsx:53-76`. No existing disposal callback
  touches a child view, but the conversion creates those ownership boundaries
  and must preserve this property.
- **Embedded bodies:** no literal `iframe`, `webview`, `mountReact`,
  `createPortal`, or `react-dom` occurrence was found under
  `src/renderer/editors/log-view`, but the Markdown leaf has a dynamic frame
  path. `MarkdownBlockView` enables raw HTML at
  `src/renderer/editors/markdown/MarkdownBlockView.ts:338-343` and creates a
  DOM element from each HAST tag at `:366-379`; a log markdown entry can
  therefore contain an iframe even though the log subtree has no literal
  iframe tag. E4-13 applies to `MarkdownOutputView`: the outer virtual cell
  must remain attached through pooling, and the implementation/live check must
  account for a raw-HTML frame rather than treating the Markdown leaf as
  inert text. The other verified embedded descendants are DataGrid,
  ColorizedCode, Mermaid image rendering, and Monaco.

## Implementation plan

1. **Split the LogBody host into a native view and a thin face.** Create
   `src/renderer/editors/log-view/LogBodyView.ts` and reduce
   `src/renderer/editors/log-view/LogBody.tsx` to the established
   `mountVanilla(LogBodyView, { model })` adapter shape. `index.tsx` can keep its
   existing `<LogBody model={logEditor} />` boundary at
   `src/renderer/editors/log-view/index.tsx:73-83`; the adapter host is outside
   the virtualized cells, while the cell subtree itself remains React-free.
   Give the view a stable root
   panel with `direction: "column"`, `flex: 1`, `overflow: "hidden"`, and
   `minHeight: 0`; give its list/grid host the same `minHeight: 0` rule. Own a
   `VirtualFlexGridView` during mount even when the initial projection is
   empty, thread its `scrollElement` through a stable getter,
   and attach the grid root only when it is not already the host's child.
   Preserve the empty/error panels while keeping one grid instance and its
   root attached across empty/error transitions: toggle the stable grid host
   and message host instead of disposing/recreating or re-parenting the grid.
   This is important because the log starts empty and then fills, and E4-14
   makes re-parenting an ancestor of a scroller a scroll reset. The current
   `NotebookBodyView` is verified to do the opposite--it calls `leaveGrid()`
   for error, empty, and filtered-empty projections at
   `src/renderer/editors/notebook/NotebookBodyView.ts:240-258`, and that method
   releases/disposes the grid at `:287-297`; it is therefore not a precedent
   for retaining the grid here. Preserve the state projection, queue
   subscription,
   scroll listener, timer cleanup, entry-count invalidation, timestamp
   invalidation, cached initial-height lookup, and the three delayed
   `scrollToRow(count - 1, "bottom")` calls. Use the grid's
   `GridModelCapability`/ `scrollElement`, not the removed `containerRef`.

2. **Implement a stable, kind-aware total-write cell renderer** in
   `LogBodyView.ts` using the notebook shape at
   `NotebookBodyView.ts:109-157`. Store a
   `WeakMap<HTMLElement, CellRecord>`, a retaining `Set<CellRecord>` for
   pooled cells, and a per-cell entry-render kind key (the concrete
   `entry.type`, so different dialog/output subtrees cannot inherit state).
   Prefer `previous` only when its record is absent or has the same kind;
   otherwise request `recycle(kind)`.
   Reuse the owned view for the same kind, rewrite its index/entry/update props
   on every admission, set the reuse key, and call `measure(record.view.root)`
   on every successful write. Contain a render failure to that cell, dispose and
   discard poisoned records, and use `errMessage` for fallback text. The
   renderer must be a bound field whose identity never changes.

3. **Convert the wrapper and dispatcher** in
   `src/renderer/editors/log-view/LogEntryWrapper.tsx` and
   `src/renderer/editors/log-view/LogEntryContent.tsx` to native view classes
   (prefer `.ts` filenames). Preserve the row/timestamp/content-panel DOM
   shape, coordinate-bound updater, type narrowing, dialog/output wrapper, and
   per-cell error boundary. Use `VanillaView.child()` for owned children and
   update existing children with total props rather than replacing a pooled
   cell's root casually.

4. **Convert text and message helpers** in
   `src/renderer/editors/log-view/LogMessageView.tsx` and
   `StyledTextView.tsx`. Use `createPanelElement`/`createTextElement` and
   direct text-node/span writes. Preserve arbitrary segment inline styles and
   level-to-token mapping. Do not add a wrapper for the former fragment-only
   path; if a view root is required, use `display: contents`.

5. **Convert dialog leaves** in the exact 15 files listed in the inventory
   above. Rename the nine shared/dialog files
   `src/renderer/editors/log-view/items/{ButtonsDialogView,ButtonsPanel,CheckboxesDialogView,ConfirmDialogView,DialogContainer,DialogHeader,RadioboxesDialogView,SelectDialogView,TextInputDialogView}.tsx`
   to native `.ts` sources, and convert the remaining six output files in
   steps 6 and 7 the same way. In particular, convert
   `ConfirmDialogView.tsx`, `ButtonsDialogView.tsx`, `TextInputDialogView.tsx`,
   `CheckboxesDialogView.tsx`, `RadioboxesDialogView.tsx`, and
   `SelectDialogView.tsx`, plus shared `DialogContainer.tsx`,
   `DialogHeader.tsx`, and `ButtonsPanel.tsx`.
   Replace UIKit JSX faces with direct `Panel`/`Text` element builders and
   `ButtonView`, `InputView`, `CheckboxView`, `RadioGroupView`, and
   `SelectView` children. Keep stable event handlers reading current
   `this.props`, update controlled values/disabled state on every entry write,
   preserve Enter validation and `stopPropagation` behavior, and dispose
   timers/listeners via `own()` or child ownership.

6. **Convert the simple output leaf** in
   `src/renderer/editors/log-view/items/ProgressOutputView.tsx`. Build the
   same conditional label/progress/value DOM with `ProgressBarView` and
   total prop updates. Include the existing UIKit CSS imports only through the
   direct view modules or the established native-view import pattern.

7. **Convert the embedded output leaves** in
   `src/renderer/editors/log-view/items/GridOutputView.tsx`,
   `MarkdownOutputView.tsx`, `McpRequestView.tsx`, `MermaidOutputView.tsx`, and
   `TextOutputView.tsx`:
   - Own `DataGridView`, `MarkdownBlockView`, and `ColorizedCodeView`
     directly; do not call their React mounting shims from a cell.
   - Treat `MarkdownBlockView` as frame-capable because its raw-HAST path can
     create an iframe. Do not detach or reinsert the outer pooled cell while
     it is admitted, and include a raw-HTML Markdown entry in the manual
     scroll/recycling check.
   - Port GridOutput's saved-column merge, 150ms debounce, teardown flush, and
     page-opening callback. When a same-kind record is repointed to another
     grid entry, recompute its initial saved-column baseline and call
      `DataGridView.invalidatePushed()` at
      `src/renderer/uikit/DataGrid/DataGridView.ts:202-204`, then perform exactly
      one total `DataGridView.update()` call. The internal `pushDelta()` path at
      `src/renderer/uikit/DataGrid/DataGridView.ts:181-195` handles the
      rows-before-columns ordering automatically. Never split a columns-plus-rows
      change into two consumer updates and never push an empty column set to force
      ordering; the `pushDelta()` comment records that the intermediate callback
      can re-enter the owning model and loop.
   - Port MCP's expanded flag, header click/stop-propagation, colorized JSON,
     and scrollable sections with a native click listener.
   - Port Mermaid's cancellable generation/theme subscription, SVG data URL
     image branch, clipboard copy, page opening, and hover action buttons. Use
     `errMessage` for async failures and invalidate pending work on dispose.
   - Replace direct Monaco creation with `MonacoEditorHostView` or an
     equivalent native-owned host. Check `isReady` before any teardown state
     capture, dispose the size subscription before the host, and update value,
     language, options, and height without reconstructing the editor. This is
     the E4-15 readiness/disposal rule exemplified by
     `src/renderer/editors/shared/MonacoEditorHostView.ts:128-153`.

8. **Audit layout and lifecycle after conversion.** Verify LogBody's own
   body/list panels have `minHeight: 0` where they are flex items, and use
   `display: contents` only for a view replacing a React component that
   contributed no box. Before every `append`, `replaceChildren`, or
   `insertBefore` on an update path, check whether the node is already in the
   intended position. Clear bookkeeping before a teardown that may throw;
   remember `VanillaView.dispose()` disposes children before `onDispose` and
   rethrows the first cleanup error, as specified at
   `src/renderer/uikit/shared/vanilla-view.ts:82-125`. `TextChrome` is out of
   scope: do not change shared
   `src/renderer/editors/base/TextChrome.tsx:83-93`; LogBody owns its own
   min-height fix.

## Before / after shape

Current React host:

```tsx
const renderLogEntry = useCallback((p: RenderFlexCellParams) => (
    p.col === 1 ? null : <LogEntryWrapper vm={model} index={p.row} cellRef={p.ref} />
), [model, state.showTimestamps]);

<RenderFlexGrid
    onModel={setGridModel}
    columnCount={2}
    rowCount={state.entryCount}
    renderCell={renderLogEntry}
    minRowHeight={18}
    getInitialRowHeight={getInitialRowHeight}
    preferMinHeightForNewRows
/>
```

Target native shape:

```ts
private readonly renderCell: VirtualFlexCellFunc = (p) => {
    if (p.col === 1) return undefined;
    const entry = this.projection.entries[p.row];
    const record = this.admitOrCreateRecord(p, entry);
    record.view.update(this.entryProps(entry, p.row));
    p.measure(record.view.root);
    return record.cell;
};

this.grid = this.child(new VirtualFlexGridView({
    columnCount: 2,
    rowCount: () => this.projection.entryCount,
    columnWidth: getColumnWidth,
    renderCell: this.renderCell,
    fitToWidth: true,
    minRowHeight: 18,
    getInitialRowHeight: this.getInitialRowHeight,
    preferMinHeightForNewRows: true,
    onModel: this.onGridModel,
}));
```

The snippet is intentionally schematic: the implementation must add the
kind-aware record/discard/error path and total-write props described above.

## Concerns

- **Embedded view retention:** `TextOutputView` owns Monaco and the grid,
  markdown, and Mermaid leaves may own asynchronous or nested views. The cell
  renderer must not dispose a same-kind record merely because it is recycled;
  only a kind change or poisoned subtree may discard it. E4-13 makes this
  especially important for any nested frame or editor created by an embedded
  body.
- **Disposal order:** The current React leaves have effect cleanup, but the
  native versions will have explicit child ownership. Any capture or flush
  that needs a child must happen while it is ready, not in an owner's
  `onDispose`; clear record/bookkeeping state before disposal and contain errors
  so pooled-cell accounting cannot be stranded.
- **No unresolved selector/focus contradiction:** The required grep found no
  `onFocus`, `onBlur`, `closest(...)`, or `#avg-container` in this subtree.
  Native UIKit controls still need their existing event contracts preserved,
  but there is no React delegated focus site here to translate.
- **Stable renderer versus state changes:** The old `useCallback` dependency
  on `showTimestamps` must not become a fresh native renderer. State changes
  must update the host projection and explicitly invalidate the affected rows
  or all rows, consistent with `VirtualGridModel`'s identity gate and the
  E4-7 total-write rule.
- **Error fallback semantics:** The React error boundary currently displays
  `error.message` and continues the rest of the grid. The native boundary
  should use `errMessage(error, fallback?)`, as required by project standards,
  and discard an unknown-state record before it can be handed to a different
  entry.
- **Empty/error grid lifetime:** The verified notebook implementation disposes
  its grid on these transitions, but that would recreate the log grid on its
  normal initial empty-to-filled transition. LogBody should retain one attached
  grid root and toggle visibility/message content, preserving the scroller's
  DOM position under E4-14; any implementation that cannot represent the
  hidden zero-row/error state must identify that concrete primitive limitation
  before changing this decision.

## Acceptance criteria

- `LogBody` no longer imports React or `uikit/RenderGrid`; it owns a
  `VirtualFlexGridView` and uses its `scrollElement` for scroll/focus paths.
- No file in the LogBody cell subtree imports React, `react-dom`, calls
  `mountReact`, or creates a React root. The 15 `items/*` views and the helper
  subtree are native `VanillaView` classes.
- The renderer is a stable bound field, uses kind-aware pooled records, performs
  total writes on both `previous` and `recycle()` admissions, calls
  `measure()` on the nominated content root, and retains same-kind embedded
  editors across scroll round trips.
- Body/list flex items set `minHeight: 0`; former no-DOM component wrappers do
  not add layout boxes; grid-root attachment is idempotent.
- Dialog controls, entry updates, required-button gating, Enter handling,
  timestamp display, MCP expansion, Mermaid rendering/copy, DataGrid column
  persistence, markdown/colorized output, Monaco output, empty/error states,
  queue focus, and iterative auto-scroll retain their current behavior.
- A repeatable scroll sweep over a fixture containing several text-output
  entries observes at most one Monaco construction per entry on first visit,
  zero constructions on revisited rows, and zero constructions on the
  return-to-top pass. To measure it, cold-load the fixture, stamp every
  observed `.monaco-editor` element with a unique probe attribute, sweep the
  `VirtualFlexGridView.scrollElement` in fixed increments with a settle between
  steps, and count only newly observed unstamped editors; repeat the sweep over
  the same rows and then return to offset zero. This ceiling counts retained
  pooled editors, as required by the amended E4-6 Rule 4, rather than imposing
  a simultaneous-viewport limit.
- Monaco/embedded teardown uses readiness probes, child-first ownership is
  respected, and cleanup failures cannot strand cell or overlay bookkeeping.
- A Markdown entry containing raw HTML/iframe markup remains scroll-safe while
  its pooled cell is admitted and recycled.
- Static checks pass without adding tests or test harnesses; no hardcoded
  colors, direct `require("path")`/`require("fs")`, or hand-rolled caught-error
  stringification are introduced.
- The task folder remains in the tree and the EPIC-062 dashboard entry links to
  this README.

## Files changed

| File | Planned change |
|---|---|
| `src/renderer/editors/log-view/LogBody.tsx` | Thin `mountVanilla` face for `LogBodyView` |
| `src/renderer/editors/log-view/LogBodyView.ts` | Native host, projection, grid lifecycle, scrolling, stable renderer |
| `src/renderer/editors/log-view/LogEntryWrapper.tsx`  `.ts` | Native cell wrapper and total-write props |
| `src/renderer/editors/log-view/LogEntryContent.tsx`  `.ts` | Native dispatcher and per-cell error boundary |
| `src/renderer/editors/log-view/LogMessageView.tsx`  `.ts` | Native message layout and color mapping |
| `src/renderer/editors/log-view/StyledTextView.tsx`  `.ts` | Native span/text rendering without fragment wrapper |
| `src/renderer/editors/log-view/items/*.tsx` -> `.ts` (15 files) | Native dialog and output leaf views |
| `doc/active-work.md` | Link existing US-1065 entry to this document |

### Files explicitly verified as requiring no changes

| File | Reason |
|---|---|
| `src/renderer/editors/log-view/LogViewEditor.ts` | Existing model APIs, queue events, height cache, and entry mutation behavior already provide the host contract |
| `src/renderer/editors/log-view/logTypes.ts` | Entry types and narrowing helpers are consumed unchanged |
| `src/renderer/editors/log-view/logConstants.ts` | Dialog height constant remains valid |
| `src/renderer/editors/log-view/index.tsx` | Existing `LogBody` component boundary already passes the model and needs no change |
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts` | Validated primitive already provides `measure`, `scrollElement`, and model forwarding |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | Validated pooling/attachment primitive is consumed, not changed by this task |
| `src/renderer/uikit/shared/vanilla-view.ts` | Lifecycle contract is authoritative; no framework change is needed |
| `src/renderer/editors/base/TextChrome.tsx` | Out of scope shared chrome imported by draw at `draw/index.tsx:5,205-210`, env-vars at `env-vars/index.tsx:4,11-13`, and other editors; LogBody must set `minHeight: 0` on its own panels instead |
| `doc/epics/EPIC-062.md` | Authoritative epic decisions are already present; this task document links to them |
