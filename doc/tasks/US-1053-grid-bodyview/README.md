# US-1053: Convert the grid editor body to BodyView

Parent epic: [EPIC-060: De-React Epic E2 — The embeddable bodies](../../epics/EPIC-060.md)

This is a planning document only. It does not implement code, edit `doc/active-work.md` or the
epic, edit `src/renderer/editors/markdown`, or create a commit.

## Goal

Replace the React grid editor body with a vanilla `GridBodyView` that owns the existing vanilla
`DataGridView`. Keep `src/renderer/editors/grid/index.tsx` as the React `TextChrome` shell, mount the
body with `mountVanilla`, and expose `BodyView` so the existing registry normalization continues to
serve embedded notebook bodies.

## Background

EPIC-060 Decisions E2-2 and E2-3 are fixed constraints. The grid shell remains React and
`editors/base` chrome is out of scope. The registry already turns a module's `BodyView` into the
React `Body` compatibility arm at `src/renderer/editors/base/editorRegistry.ts:316-322`; the
notebook consumer at `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:72-85` does
not change. Deleting the registry `Body` arm is US-1054.

The current source line counts were verified before planning:

| File | Lines | Current role |
|---|---:|---|
| `src/renderer/editors/grid/GridBody.tsx` | 129 | React body to replace |
| `src/renderer/editors/grid/components/ColumnsOptions.tsx` | 394 | React columns popover |
| `src/renderer/editors/grid/components/CsvOptions.tsx` | 107 | React CSV popover |
| `src/renderer/editors/grid/index.tsx` | 157 | React shell and module registration |
| `src/renderer/editors/grid/GridEditor.ts` | 895 | Grid model |

The closest precedent is `src/renderer/editors/svg/SvgBodyView.ts:41-112`: it creates one stable
owned child, appends and mounts that child explicitly, subscribes to state/host changes, and drains
the typed queue after the child is mounted. `src/renderer/editors/mermaid/MermaidBodyView.ts` and
`src/renderer/editors/html/HtmlBodyView.ts` establish the same explicit `VanillaView` lifecycle.
`claimViewOwnership`/`child()` only claim ownership; they do not mount or attach a child.

### Popover ownership is resolved

Both popovers belong to the React shell, not the body:

- `src/renderer/editors/grid/index.tsx:42-80` defines `GridToolbarBits`. Its columns button calls
  `showColumnsOptions` at lines 59-64, passing the shell's `gridRefHolder` instance and the model's
  `onUpdateRows`; its CSV button calls `showCsvOptions` at lines 68-75.
- `src/renderer/editors/grid/components/ColumnsOptions.tsx:375-393` and
  `src/renderer/editors/grid/components/CsvOptions.tsx:99-107` only construct popper models and
  call `showPopper`; they do not render from the grid body.
- Both views are registered through `Views.registerView` as React `DefaultView`s. The fallback path
  in `src/renderer/ui/dialogs/poppers/PoppersView.ts:49-87,135-140` renders those registrations
  through `fillSlot`/`Views.renderView`; they are not native dialog views.

Therefore `ColumnsOptions.tsx` and `CsvOptions.tsx` deliberately stay React until the chrome epic.
Their hooks are not hooks in converted files and are not replaced by this task.

### DataGrid and the three instance holders

`src/renderer/uikit/DataGrid/index.ts:20-21` exports both `DataGrid` and `DataGridView`, while
`src/renderer/uikit/DataGrid/DataGrid.tsx:8-19` is only the React adapter. The body must import and
mount `DataGridView` directly. `DataGridView` constructs `AVGrid` in `onMount` at
`src/renderer/uikit/DataGrid/DataGridView.ts:107-135`, exposes the live instance as `grid`, and
calls `onGrid` on mount and dispose. Mounting `DataGrid` from this vanilla view would create the
React adapter's nested React root and undermine the metric this epic is reducing.

The current `GridBody.tsx:19-32` has three holders for one `DataGridInstance`:

1. the body-local `gridRef`, used for focus and typed-queue handling;
2. `GridEditor._grid`, populated by `GridEditor.setGrid` at `GridEditor.ts:209-224`, where restored
   sort/focus and row counts are applied; and
3. `index.tsx`'s `gridRefHolder`, populated through `onModel` and read by the columns toolbar at
   `index.tsx:19-22,57-64`.

The vanilla replacement keeps one live instance in the `DataGridView` child and a class-owned
field for the body's imperative operations. A stable class-field `onGrid` trampoline forwards the
same instance to `GridEditor.setGrid` and the current `props.onModel`; it replaces the React
`useCallback`/`useRef` pairing. The shell may continue passing its inline `onModel` callback because
the trampoline reads current props and `DataGridView`'s own `onGrid` is an initial-only lifecycle
callback. On disposal it forwards `null` to release all three holders.

`GridEditor` already owns host-content parsing at `GridEditor.ts:300-347,403-419` and pushes fresh
rows directly into the live grid at `GridEditor.ts:478-487`. The view therefore subscribes only to
the state values the old body passed as options (`columns`, `search`, and `error`); it does not add a
second content parser or a rows subscription.

### Layout and hidden-state evidence

The React body currently creates a `Panel` named `grid-editor-root` with `direction="column"`,
`flex={1}`, `position="relative"`, and `height="fit-content"` when
`editorConfig.maxEditorHeight` is defined, otherwise height `200` (`GridBody.tsx:77-84`). It passes
`growToHeight="${maxEditorHeight}px"` to the grid only in the embedded case (`GridBody.tsx:114-118`).
The vanilla root must preserve those values and update them through
`applyPanelAttributes`/`resolvePanelAttributes` when incoming props change.

`src/renderer/uikit/Panel/Panel.css:1-10` gives panel roots `display: flex`, and its existing
same-layer counter-rule at lines 83-86 makes `.panel-root[hidden]` actually disappear. The plan
uses nested Panel-style branches for the error/content switch, so no new hidden CSS is needed and
the `data-grid` root itself need not be hidden directly.

The grid context menu remains `showGridContextMenu` from
`src/renderer/ui/dialogs/poppers/grid-context-menu.tsx:93-113`; its `GridContextMenuEvent` shape is
already the `DataGridView` callback type and its application-menu handoff is independent of React.
The sidebar focus helper remains `isFocusInSidebar` at
`src/renderer/core/utils/focus-utils.ts:17-25`; only the React effect that called it moves to the
vanilla mount/update lifecycle.

### Explicit error-branch decision

The implementation deliberately changes the current parse-error lifecycle. Today
`src/renderer/editors/grid/GridBody.tsx:74-75` returns `null` for a missing host and returns a new
React `EditorError` instead of the Panel/DataGrid subtree when `state.error` is set; that unmounts
av-grid and sends `null` through `DataGridView.onGrid`.

The vanilla body will keep its one `DataGridView` mounted and hide it behind a nested Panel while
showing the equivalent error Panel. This is an intentional, better-behaved difference: it preserves
av-grid's scroll position, column widths, and owned row array across a transient parse error, and
avoids a mount/dispose cycle for every edit that temporarily makes the document malformed.

The source proves that this does not leave stale rows when the error clears:

- `GridEditor.parseContent` writes the parse error or clears it at `GridEditor.ts:514-545`.
- For non-empty content, `reparseRows` always follows `parseContent` with `setRows(...)`: parsed
  arrays/objects use `GridEditor.ts:459-465`, and primitives/null use `:466-468`. An error result
  therefore still replaces the live rows with an empty set; a later successful parse replaces them
  with fresh rows.
- Empty content goes through `initEmptyPage` at `GridEditor.ts:446-448`, which calls `setRows` and
  clears `state.error` at `:489-512`. Unlocking encrypted content also re-enters `reparseRows`
  through the encrypted-state subscription at `GridEditor.ts:316-327`; its success path reaches the
  same `setRows` calls.
- `setRows` stores the new rows and calls `this._grid?.setRows(rows)` at `GridEditor.ts:478-487`.
  The body has already populated `_grid` through the mounted child's `onGrid` callback, and the
  error branch never calls that callback with `null`. Thus `_grid` remains populated while the grid
  is merely hidden, and the successful reparse refreshes the hidden instance before it is shown.

The view must preserve this distinction in code: `state.error` toggles only the nested content/error
Panels; only actual view disposal, or a host extraction as described below, invokes the null handoff.

## Implementation Plan

### 1. Create `src/renderer/editors/grid/GridBodyView.ts` and remove `GridBody.tsx`

Replace the React function in `src/renderer/editors/grid/GridBody.tsx` with a public vanilla view:

```ts
export interface GridBodyViewProps {
    model: GridEditor;
    onModel?: (model: DataGridInstance<any> | null) => void;
    editorConfig?: EditorConfig;
}

export class GridBodyView extends VanillaView<GridBodyViewProps> { ... }
```

Build the semantic `grid-editor-root` with `createPanelElement` and the same panel attributes as the
 React body. Keep a nested content Panel containing one `DataGridView` child and an
 `editor-error` Panel containing a warning/pre-wrapped text element equivalent to
 `src/renderer/editors/base/EditorError.tsx:9-21`. Toggle the two Panel branches from the subscribed
error projection; do not replace the owned DataGridView when an error appears or clears. This is the
explicit error-branch decision above: it keeps one grid instance, preserves av-grid state across
transient parse errors, and lets the existing Panel `[hidden]` counter-rule handle visibility.

#### Host-presence gate

Unlike a React function, this view cannot return `null`. The normal mount path has a host: restore
assigns or creates one and adopts it on both success and catch paths at
`src/renderer/editors/base/TextHostEditorModel.ts:205-224`; switching adopts the extracted host
before `onHostAttached` at `:180-203`; open-file attachment calls `adoptHost` before
`bootstrapFromHost` at `src/renderer/api/pages/PagesLifecycleModel.ts:71-83`; and the notebook
publishes the embedded editor only after `adoptHost`/`restore` at
`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:76-85`. Therefore a null host at
the first body mount is unreachable in the verified lifecycle.

Still, `extractContentHost` can set `_host` to `null` while a view is transiently mounted during a
switch-away (`TextHostEditorModel.ts:70-81`). The view must handle that state explicitly to preserve
the old `return null` result: set `this.root.hidden = true`, hide both nested branches, stop the
queue/state work that can act on the detached model, and call the null handoff once so
`GridEditor._grid` and the shell's `gridRefHolder` do not retain an orphaned grid. Keep the
`DataGridView` object owned and mounted but inaccessible; if the same view receives a later update
with a host again, unhide the root, republish its existing `dataGridView.grid`, apply the current
state projection, and subscribe to the queue after confirming the child is mounted. This host-null
release is distinct from a parse error: an error never clears `_grid`.

Construct `DataGridView` directly with the old `DataGrid` options:

- `name: grid-editor-${model.editorId}`, the current columns, rows from
  `model.rowsForGrid()`, `getRowKey`, row noun, search/highlight values, filters, filter bar,
  editing/add/delete capabilities, and all existing model callbacks;
- `onGrid` set to the stable class trampoline described above; and
- `onGridContextMenu: showGridContextMenu` and the conditional `growToHeight` value.

The model callbacks are class fields on `GridEditor` (`onEdit`, `onAddRows`,
`onDeleteRows`, `onDeleteColumns`, `onColumnsChange`, `onFocusChange`, `onFiltersChange`,
`onSortChange`, `onVisibleRowsChange`, `onGetOptions`, `newRow`, and `newColumn`), so the body can
forward them without recreating a React callback tree. If wrappers are needed for model swaps, make
them stable class fields that read `this.model` rather than passing newly-created callbacks on each
state update.

Use the following lifecycle order in `onMount`:

1. Check `model.contentHost` before exposing the body. In the normal non-null case, append the
   already-owned DataGridView root during construction and call `this.dataGridView.mount()` exactly
   once. Its `onGrid` callback must run before anything drains focus events, and it is where
   `GridEditor.setGrid` receives the instance. If the defensive null-host case occurs, keep
   `root.hidden = true` and delay the child/queue binding until a later update sees a host.
2. Apply the initial state projection and subscribe to `model.state` with a selector for
   `columns`, `search`, and `error`. The selector replaces `state.use`; the subscription must update
   the existing `DataGridView` through its `update()` method, update the error text/visibility, and
   never recreate the child. While `contentHost` is null, the projection must not unhide any branch.
3. Subscribe with `model.typedQueue.subscribe(...)` and own the returned unsubscribe. The handler
   uses the class-held live instance for `focus` and `focusCell`. `ComponentQueue.subscribe` drains
   synchronously (`src/renderer/core/state/ComponentQueue.ts:33-45`), so this subscription must come
   after the child mount.
4. Apply the initial autofocus only when `disableAutoFocus` is false and
   `!isFocusInSidebar()`. On later `update()` calls, repeat the focus transition only when the
   incoming disable flag changes to enabled, matching the React effect dependency.

Register the state, queue, and any host/model disposers with `own()`. If a model instance is ever
swapped in `onUpdate`, release the old state/queue subscriptions, release the old model's grid
handle, retarget the stable wrappers, set the current live grid on the new model, then subscribe to
the new queue only after the DataGridView remains mounted. The ordinary editor lifecycle keeps one
model, but this makes the vanilla view's incoming-props contract safe.

`onUpdate(props)` must:

- re-check `props.model.contentHost` before showing the root. On a transition to null, perform the
  host-null release above; on a transition back, republish the existing grid (or mount it if it was
  deferred), then establish state/queue bindings in the same child-before-queue order;
- reapply `grid-editor-root` attributes from the new `editorConfig`, including the exact
  `maxEditorHeight` mode;
- update the current model/options projection and `DataGridView` in place;
- refresh `onModel` through the stable trampoline; and
- preserve the current grid object, selection, scroll state, and av-grid-owned rows.

`onDispose()` must unsubscribe state and queue listeners, call the model's `setGrid(null)`, and let
`VanillaView` dispose the child. `DataGridView` itself owns av-grid destruction and calls its
`onGrid(null)` callback; do not destroy the av-grid instance twice. The null handoff is not called
when only `state.error` changes.

Before:

```tsx
const gridRef = useRef<DataGridInstance<any> | null>(null);
const onGrid = useCallback((grid) => {
    gridRef.current = grid;
    model.setGrid(grid);
    onModel?.(grid);
}, [model, onModel]);
const state = model.state.use((s) => ({
    columns: s.columns,
    search: s.search,
    error: s.error,
}));
model.typedQueue.use((ev) => { /* use gridRef.current */ });
useEffect(() => { /* autofocus */ }, [editorConfig.disableAutoFocus]);
return <DataGrid {...options} onGrid={onGrid} />;
```

After:

```ts
protected onMount(): void {
    this.dataGridView.mount();
    this.subscribeToModelState();
    this.queueSubscription = this.model.typedQueue.subscribe(this.handleQueue);
    this.focusIfAllowed();
}
```

The after snippet is intentionally abbreviated: the implementation must also own both
subscriptions, update the existing child, and mount the parent root through `mountVanilla`.

### 2. Keep the shell and repoint module registration in `src/renderer/editors/grid/index.tsx`

Keep `GridEditorView`, `GridToolbarBits`, `GridSearchInput`, `GridFooterBits`, `TextChrome`, the
toolbar popover calls, and the shell's `useRef<DataGridInstance | null>` unchanged in purpose. The
shell ref remains the bridge used by the columns toolbar and the body continues forwarding the same
live instance through `onModel`.

Replace the body integration with the vanilla precedent shape:

```tsx
import { GridBodyView } from "./GridBodyView";
import { mountVanilla } from "../../uikit/shared/mount";

<TextChrome ...>
    {mountVanilla(GridBodyView, {
        model: editor,
        onModel: (grid) => { gridRefHolder.current = grid; },
    })}
</TextChrome>
```

Remove the React `GridBody` import and the `GridEmbeddedBody` component. In `makeModule`, replace
`Body: GridEmbeddedBody` with `BodyView: GridBodyView` for all three grid modules. Keep the existing
popover imports/exports and all toolbar/footer JSX; neither popover is part of this body conversion.

### Hook replacement map

| Existing hook/use | Location | Vanilla replacement | Cleanup |
|---|---|---|---|
| `useRef` for `gridRef` | `GridBody.tsx:19` | Stable `DataGridView` child plus a class-held live `DataGridInstance` field set by `onGrid`. | `setGrid(null)` and child disposal. |
| `useCallback` for `onGrid` | `GridBody.tsx:25-32` | Stable class-field trampoline reading current view props and model. | No callback cleanup; callback is used by child lifecycle. |
| `model.state.use` | `GridBody.tsx:37-41` | `model.state.subscribe(listener, selector)` with an initial projection application and in-place `DataGridView.update()`. | Own/unsubscribe; replace if the model changes. |
| `model.typedQueue.use` | `GridBody.tsx:44-55` | `model.typedQueue.subscribe(handler)` after `DataGridView.mount()`. | Own returned unsubscribe; replace on model change. |
| `useEffect` autofocus | `GridBody.tsx:60-64` | `onMount` plus a guarded transition in `onUpdate`, using `isFocusInSidebar()`. | None beyond view disposal; no timer/listener is created. |
| `useMemo`, `useState`, `useEffect`, `useRef`, `useCallback` in `ColumnsOptions.tsx`/`CsvOptions.tsx` | Popover files | No replacement in this task; both remain React shell-owned popovers. | Existing React/poppers lifecycle remains unchanged. |

The `useRef` in `src/renderer/editors/grid/index.tsx:22` also remains intentionally: it is the
shell-to-toolbar bridge, not body state. The shell's React hook is therefore not converted.

## Deliberately not changed

- `src/renderer/editors/grid/components/ColumnsOptions.tsx` — opened by the shell toolbar at
  `src/renderer/editors/grid/index.tsx:59-64`; remains a React popover.
- `src/renderer/editors/grid/components/CsvOptions.tsx` — opened by the shell toolbar at
  `src/renderer/editors/grid/index.tsx:68-75`; remains a React popover.
- `src/renderer/editors/grid/GridEditor.ts` — its host parsing, state, row ownership, callbacks,
  serialization, and `setGrid` contract already support a vanilla body.
- `src/renderer/editors/base/TextChrome.tsx` and all `src/renderer/editors/base` chrome — fixed by
  E2-2.
- `src/renderer/editors/base/editorRegistry.ts` and
  `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` — fixed by E2-3; registry
  normalization remains the compatibility path.
- `src/renderer/uikit/DataGrid/DataGrid.tsx` — the React adapter is not used by the converted body;
  `DataGridView` is used directly.
- `src/renderer/uikit/DataGrid/DataGridView.ts`, `types.ts`, and `DataGrid.css` — no UIKit adapter
  change is needed. Existing `DataGrid.css` supplies the definite flex/grid geometry, and
  `Panel.css:83-86` already supplies the required hidden counter-rule for Panel branches.
- `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` — the callback contract and application
  menu handoff already work from vanilla av-grid.
- `src/renderer/core/utils/focus-utils.ts` — the helper remains the autofocus gate.
- Anything under `src/renderer/editors/markdown`, `doc/active-work.md`,
  `doc/epics/EPIC-060.md`, editor registration files, theme files, or notebook dispatch.

## Concerns

1. The shell boundary is not open for redesign: `index.tsx` stays React `TextChrome`, and the body
   must be mounted with `mountVanilla`. Do not convert `editors/base` chrome.
2. Both popovers are shell-owned by verified call sites. Converting either popover here would cross
   the body/chrome boundary and is explicitly out of scope.
3. `claimViewOwnership`/`child()` does not mount. The body must append the `DataGridView` root and
   call `mount()` exactly once; queue subscription follows that mount because subscription drains
   synchronously.
4. Use `DataGridView`, not the React `DataGrid` face. Keep one av-grid instance and update option
   values in place so the model, body, and shell all refer to the same instance.
5. The parse-error behavior change is explicit: keep the mounted grid hidden behind a Panel while
   showing the error Panel. Do not clear `_grid` for an error; preserve rows/columns/scroll state
   across the transient error, and rely on `GridEditor.setRows` to refresh the same instance when a
   reparse succeeds. The body must not parse host content a second time.
6. Preserve `maxEditorHeight`: the root is `height: "fit-content"` with the embedded value and
   `height: 200` otherwise; `growToHeight` is `${maxEditorHeight}px` only in the embedded case.
   `applyPanelAttributes` must clear stale inline height/flex properties when switching modes.
7. Avoid unguarded writes that can cause work beyond a value assignment. Let `DataGridView`'s
   identity diff govern `setOptions`; do not recreate rows/columns or the child on every state
   notification.
8. The semantic `GridBodyView.root` is the geometry subject, not `mountVanilla`'s
   `display: contents` adapter host. The root and its `[data-type="data-grid"]` descendant must be
   measurable after layout.
9. A null host is proven unreachable at first publication but is handled defensively while mounted:
   the semantic root becomes hidden and the model/shell grid handles are released until a host is
   restored.

## Acceptance Criteria

- `src/renderer/editors/grid/GridBody.tsx` is replaced by
  `src/renderer/editors/grid/GridBodyView.ts`, exporting `GridBodyViewProps` and a public
  `GridBodyView extends VanillaView<GridBodyViewProps>`.
- The body imports and mounts `DataGridView` directly; it does not import or render the React
  `DataGrid` adapter and creates no nested React root.
- The DataGridView is appended and mounted exactly once, before the typed queue is subscribed; the
  queue drains `focus` and `focusCell` events against the mounted instance.
- `GridEditor.setGrid`, the body imperative holder, and the shell `gridRefHolder` all receive the
  same live `DataGridInstance`, and all holders receive `null` on disposal.
- The body preserves every current grid option and callback, including row/key behavior, filters,
  search/highlight, editing/add/delete operations, visible-row reporting, context menu behavior,
  and av-grid-owned row updates.
- State changes update the existing grid in place; host parsing remains solely in `GridEditor`.
- Grid parse errors show the existing warning/pre-wrapped `EditorError` visual behavior while the
  same DataGridView remains mounted and hidden; clearing the error reveals that same instance after
  `GridEditor.setRows` has supplied fresh rows, without a null handoff.
- A null host at mount or during switch-away leaves no visible semantic body root; the host-null path
  releases the model and shell grid handles, and a later host transition can republish the existing
  mounted grid in the documented lifecycle order.
- `editorConfig.maxEditorHeight` matches the old root/grow-to-height behavior in both embedded and
  full-page modes, including clearing stale styles on updates.
- `index.tsx` remains a React `TextChrome` shell, mounts `GridBodyView` via `mountVanilla`, removes
  `GridEmbeddedBody`, and registers `BodyView` for `grid-json`, `grid-csv`, and `grid-jsonl`.
- `ColumnsOptions.tsx` and `CsvOptions.tsx` remain unchanged React shell popovers.
- All converted hooks have the lifecycle replacements and cleanups listed in the hook table.
- No changes are made to the registry, notebook dispatch, grid context-menu helper, sidebar-focus
  helper, `GridEditor`, markdown sources, active-work dashboard, or EPIC-060.

### Verification

Open representative JSON, CSV, and JSONL documents in their grid editors. Verify initial rendering,
editing, add/delete rows and columns, sorting, filtering, search highlighting, focus restoration,
context-menu actions, CSV delimiter/header options, columns popover apply/cancel, serialization,
and the existing sidebar-focus autofocus rule.

Run separate DOM/runtime assertions against the semantic converted host in both layout modes, not
only its presence:

- Full-page mode (`height: 200`, flex growth, no `growToHeight`): assert the `grid-editor-root` body
  root has `offsetWidth > 0` and `offsetHeight > 0`; assert its `[data-type="data-grid"]` descendant
  has `offsetWidth > 0` and positive height; and assert at least one visible
  `[data-type="data-cell"]` has a `getBoundingClientRect()` with positive width and height.
- Embedded notebook mode (`height: "fit-content"` plus `growToHeight`): repeat all three assertions
  separately with `maxEditorHeight`, including positive root/grid width and height and a laid-out
  `[data-type="data-cell"]`. This specifically exercises the embedded path rather than inferring
  it from full-page geometry.
- In both modes, assert the cell count is non-zero for a non-empty fixture and that the sampled cell
  rectangles are positive; a present grid root without laid-out cells is a failure.
- The adapter host created by `mountVanilla` remains `display: contents` and is not used as the
  geometry assertion target.

Open a notebook containing a grid note to verify that registry normalization produces one body with
no extra body React root and that the shell toolbar still controls the shared grid instance. As the
collateral-damage check, open an untouched `HTML Preview` editor (US-1051) and verify it still
renders with positive geometry and remains interactive.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/grid/GridBodyView.ts` | New vanilla grid body: Panel root, direct `DataGridView` child, state/queue lifecycle, instance handoff, error branch, autofocus, and height handling. |
| `src/renderer/editors/grid/GridBody.tsx` | Remove the React body after the shell is repointed. |
| `src/renderer/editors/grid/index.tsx` | Keep the React shell and popovers; mount `GridBodyView` via `mountVanilla` and expose `BodyView` for all grid modules. |

No other source, documentation-dashboard, epic, markdown, registry, notebook, UIKit, context-menu,
or focus-helper files are planned to change.
