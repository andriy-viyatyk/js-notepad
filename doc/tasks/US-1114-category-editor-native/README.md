# US-1114: Convert the category editor to the vanilla View arm

## Goal

Convert the `category` editor from `EditorModule.Component` to
`EditorModule.View`, preserving folder browsing, selection, navigation, search,
breadcrumbs, view-mode switching, drag/drop, and the editor toolbar. Opening a
category editor must contribute 0 `[data-react-root]` elements and 0
`[data-part="react-slot"]` elements, instead of the current editor root.

This is an unchecked task of [EPIC-068](../../epics/EPIC-068.md); do not run
`/review`, change the dashboard, or commit as part of this task.

## Background

### Current registration and surface

`src/renderer/editors/category/index.tsx:10-17` defines the React
`CategoryEditorComponent` wrapper and registers `Component`, while
`src/renderer/editors/category/CategoryEditor.tsx:81-231` is the complete React
surface. The editor has no external importer of `CategoryEditor`; the only
importer is the local wrapper at `index.tsx:6,11`.

The current surface has one outer `Panel` root and two content arms:

- no matching tree-provider host: `PageToolbar` plus a padded `Text` message
  (`CategoryEditor.tsx:198-205`);
- matching host: `PageToolbar` with a breadcrumb and search portal, followed by
  `CategoryView` (`CategoryEditor.tsx:209-231`).

The editor model and folder-mode service are already non-React and remain
unchanged: `CategoryEditorModel.ts:14-67` and `FolderViewModeService.ts:6-78`.

The native composition should use:

- `PageToolbarView` (`editors/base/PageToolbarView.ts:20-28,364-431`);
- `BreadcrumbView` (`uikit/Breadcrumb/BreadcrumbView.ts:12-104`);
- `createPanelElement` (`uikit/Panel/panel-style.ts:349-357`);
- `createTextElement` (`uikit/Text/text-style.ts:100-108`);
- `CategoryViewImpl` directly, not the React-facing `CategoryView` shim;
- `LinksListView` and `LinksTilesView` directly.

### Root decision

`category` must adopt a real Panel root, not use `display: contents`. The old
React surface returns one `Panel` (`CategoryEditor.tsx:209-231`, or the
message Panel at `:198-205`), so the Panel is one page-column flex item. Create
the equivalent root with `createPanelElement({ name: "category-editor-root",
direction: "column", flex: 1, overflow: "hidden", background: "default" })`
and pass it to `super(props, root)`. A `display: contents` root would remove the
old editor-level Panel and change the layout/overflow contract. This differs
from the image pilot, whose React fragment contributed multiple page-column
siblings and therefore needed a local `createContentsRoot()`.

### State reads that need explicit native synchronization

The complete `state.use` audit of `CategoryEditor.tsx` found these reads:

| Current source | Field read | Native consequence |
|---|---|---|
| `CategoryEditor.tsx:91` | `page.state.version` through `useOptionalState` | Subscribe to the page state and rescan `page.panelEditors` when editors attach/detach or panel state changes. |
| `CategoryEditor.tsx:105` | `host.selectionState.selectedHref` through `useOptionalState` | Rebind when the matching host changes and push `selectedHref` into `CategoryViewImpl`. |
| `CategoryEditor.tsx:109` | `viewModel.state.viewMode` | Keep a native `viewMode` projection, load it asynchronously from `folderViewModeService`, and update the category view when it changes. |

There is no direct `model.state.use(...)` in this file. The native view must
also bind the editor model's `filePath` (the source of
`CategoryEditorModel.categoryPath`, `CategoryEditorModel.ts:46-57`) so a
post-mount model update cannot leave the category view pointed at the old
folder. Every binding/subscription must be installed from `onMount()` and
disposed with the view; `VanillaView.bind()` is a three-argument API and throws
before mount (`uikit/shared/vanilla-view.ts:197-216`).

`selectedHref` needs a manual replaceable subscription, not repeated calls to
`bind()`. `bind()` applies the selected value and subscribes at
`uikit/shared/vanilla-view.ts:214-215`, then permanently registers that
subscription with `own()` at `:216`; `own()` only appends to `disposers`
(`:128-132`), and `releaseChild()` only releases child views (`:174-186`).
There is no early-release operation for an owned cleanup. The matching host can
change while this view remains mounted, so repeated `bind()` calls would retain
old host listeners and let stale hosts overwrite the current selection.

The converted view must hold and replace exactly one host-selection unsubscribe,
while registering exactly one final cleanup in `onMount()`:

```ts
private hostSelectionUnsub: (() => void) | undefined;

private rebindHostSelection(host: ITreeProviderHost | null): void {
    this.hostSelectionUnsub?.();
    this.hostSelectionUnsub = undefined;
    if (!host) {
        this.applySelectedHref(null);
        return;
    }
    this.hostSelectionUnsub = host.selectionState.subscribe(
        (href) => this.applySelectedHref(href),
        (state) => state.selectedHref,
    );
    this.applySelectedHref(host.selectionState.get().selectedHref);
}
```

The final `this.own(() => { this.hostSelectionUnsub?.();
this.hostSelectionUnsub = undefined; })` is installed once from `onMount()`.
The explicit final `get()` apply is required: it reproduces `bind()`'s
immediate-apply half as well as its subscription half.

### `searchPortal` first-call audit

React stores `searchPortal` as `null` on the first render and receives the
element through `ref={setSearchPortal}` on the later render
(`CategoryEditor.tsx:107,212`), then passes it at `:228`. The native view will
have created the portal before mounting `CategoryViewImpl`, so its first props
can contain a non-null portal. This is safe and intentionally documented:
`CategoryView.tsx:8-9` only forwards props to `mountVanilla`, while
`CategoryViewImpl.ts:382-412` treats a non-null `toolbarPortalRef` as the
current toolbar target and appends the already-mounted search controls there.
`applyState()` calls that path immediately after the model-state binding
(`CategoryViewImpl.ts:148-161,229-247`); there is no null-first special case or
consumer logic that requires it. The behavior change is earlier placement of
the same controls, and is indifferent to the consumer; retain this as an
acceptance check when the native surface is mounted.

### `renderItems` is the cross-folder boundary

`CategoryViewModel.ts:80-104` declares `CategoryViewProps.renderItems` as a
React render prop. `CategoryViewImpl.ts:328-356` calls it, wraps the result in a
React Fragment, and `CategoryViewImpl.ts:299-306` sends it through
`mountReactHandle`. This is the category editor's remaining editor-local React
root.

The caller audit is conclusive: `CategoryEditor.tsx:116-141` is the only
production caller of `renderItems`. `CategoryView.tsx:6` and
`components/tree-provider/index.ts:6` re-export `CategoryItemsRendererProps`,
`CategoryViewProps`, and `CategoryViewMode`; they expose the type change but do
not add callers. No other source file mentions `CategoryItemsRendererProps`.

The boundary must follow the E6/E8 playbook in three ordered stages:

1. Widen `CategoryViewModel.ts:103` to `React.ReactNode | Node`.
2. Migrate the sole caller at `CategoryEditor.tsx:116-141` to return a native
   `Node`, while the parent temporarily accepts both arms.
3. Narrow `CategoryViewModel.ts:103` to `Node`, remove the React arm from
   `CategoryViewImpl.ts`, and delete its `mountReactHandle`/React Fragment
   bridge at the current `:299-306` and `:328-356` sites.

The temporary dual-arm parent in stage 2 is required for a green intermediate
state. In the final state `CategoryViewImpl` directly appends the returned Node
to its existing bridge host, retains the existing projection/repaint logic,
and has no React import or nested React root.

### The returned components do have native arms

The risky claim in EPIC-068 E10-5 concern 2 is verified:

- `LinksList.tsx:9-51` defines the shared props and `:53-55` is only the React
  `mountVanilla` face. `LinksListView.ts:88-171` is the native implementation
  with a public constructor at `:122`, and its native root is built by
  `createFocusScope()` at `:74-86`.
- `LinksTiles.tsx:10-45` defines the shared props and `:47-49` is only the
  React `mountVanilla` face. `LinksTilesView.ts:71-184` is the native
  implementation with a public constructor at `:132-154`; its root is
  `display: contents` at `:132-135`, matching its grid's direct-child layout.

Therefore `renderItems` can return `LinksListView.root` or
`LinksTilesView.root` without converting either component. The native caller
must construct and update these views with explicit props, not reproduce the
old JSX spreads. The exact old common-prop set is
`CategoryEditor.tsx:117-135`; list additionally receives `searchText` at
`:137`, and tiles additionally receives `viewMode` at `:139`.

The native list still uses `LinkTooltipContent` as a React value
(`LinksListView.ts:348-355`), which `attachTooltip` sends through `fillSlot`
when a tooltip opens (`uikit/Tooltip/attach-tooltip.ts:189-200`). That is an
existing, interaction-time tooltip island in a native child; it does not create
a root when the category editor opens. Removing that tooltip island is outside
US-1114. Thus 0 roots is achievable within this task's stated gate (initial
editor open), but a stronger claim of 0 roots during every tooltip interaction
would require separate tooltip-content work and must not be made here.

### Export/import audit

- `categoryModule` is imported only by the editor registry at
  `src/renderer/editors/register-editors.ts:175`.
- `CategoryEditor` is imported only by the current local wrapper at
  `src/renderer/editors/category/index.tsx:6-11`; no external code imports the
  React surface.
- The model/value/type exports from `category/index.tsx:30-34` have no external
  production importers. The dynamic `newEditorModel` path imports
  `CategoryEditorModel` locally at `:19-26` and must remain unchanged.
- `CategoryView` itself has no production caller besides the current
  `CategoryEditor.tsx`; other code uses `TreeProviderViewImpl` directly. Keep
  `CategoryView.tsx` as the React-facing `mountVanilla` shim for compatibility,
  but the converted editor must import `CategoryViewImpl` directly.
- `LinksList`/`LinksTiles` React faces remain used by
  `LinkItemList.tsx:7,145` and `LinkItemTiles.tsx:7,133`; their public faces and
  props must not be renamed or removed. The category editor alone uses their
  native view classes.

## Implementation Plan

### 1. Widen the `renderItems` contract first

Change only the return type at
`src/renderer/components/tree-provider/CategoryViewModel.ts:103`:

```ts
// Before
renderItems: (props: CategoryItemsRendererProps) => React.ReactNode;

// After, temporary boundary
renderItems: (props: CategoryItemsRendererProps) => React.ReactNode | Node;
```

Keep `CategoryItemsRendererProps` itself unchanged. The re-exports through
`CategoryView.tsx:6` and `components/tree-provider/index.ts:6` will expose the
wider public type automatically; do not add a second type alias or a second
caller.

### 2. Convert the category surface to `CategoryEditorView`

Rename `src/renderer/editors/category/CategoryEditor.tsx` to
`CategoryEditor.ts` and replace the React function/hooks with a public
`CategoryEditorView extends VanillaView<{ model: EditorModel }>`.

- Validate the incoming model with an `instanceof CategoryEditorModel` helper,
  as the image pilot does at `editors/image/ImageView.ts:20-23`.
- Construct the Panel root described above in the constructor. Do not create
  child DOM, subscriptions, async work, or measurements there.
- In `onMount()`, construct and claim the stable `PageToolbarView` and mount it
  once. Create/update `BreadcrumbView` only when a provider exists; pass its
  root as `children`. Create the search portal with `createPanelElement` using
  the old `category-search-portal` name, row direction, centered alignment,
  and `xs` gap; pass its root as `rightContributions`.
- Construct and claim `CategoryViewImpl` only for a matching provider. Append
  the toolbar, message Panel, or category view in the same visual order as the
  React surface. Use `releaseChild()` when a dynamic breadcrumb, category view,
  or active links view is replaced; do not leave detached native views running.
- Reproduce `findTreeProviderHost` and its exact provider/source URL match
  (`CategoryEditor.tsx:34-55`). Preserve the `LinkEditor`, `ExplorerEditor`,
  and `ArchiveEditor` `instanceof` checks.
- Preserve the handlers at `CategoryEditor.tsx:143-175`: shared selection
  writes, navigation via `app.events.openRawLink.sendAsync`, category-link
  encoding, `pageId`, and `hostId` source metadata.
- Replace the React `CategoryEditorViewModel`/hook path with a small native
  view-mode projection. Start at `"list"`, load
  `folderViewModeService.getViewMode(categoryPath)` from `onMount()` with an
  inert/generation guard, and persist changes through
  `setViewMode(categoryPath, mode)` after updating the category view.
- Bind/subscription coverage must include the three fields in the table above,
  plus `CategoryEditorModel.state.filePath` for `categoryPath`. When the page
  version changes, rescan the host and call the manual
  `rebindHostSelection(host)` pattern above; when the host selection changes,
  update the existing `CategoryViewImpl` instead of reconstructing the editor
  surface. Do not call `bind()` again for this source-object change. Install
  the one `hostSelectionUnsub` cleanup in `onMount()` and explicitly apply the
  current `selectedHref` after every replacement. This is required by the
  `VanillaView.bind()` implementation: it immediately applies and subscribes
  at `uikit/shared/vanilla-view.ts:214-215`, then stores the unsubscribe at
  `:216`; `own()` has no early-release path (`:128-132`) and
  `releaseChild()` only releases views (`:174-186`).
- Preserve the recorded `searchPortal` timing change: the native portal is
  non-null on `CategoryViewImpl`'s first call, and `CategoryViewImpl.ts:382-412`
  is indifferent to null-first versus non-null-first input. Verify that the
  controls are placed in the portal on the initial native update and continue
  to move/remove correctly across loading, error, and content arms.
- Do not add a custom `onDispose()` merely to dispose children. `this.child(...)`
  owns normal child lifetime; use `releaseChild()` only for dynamic replacement.

The surface shape should become:

```tsx
// Before: CategoryEditor.tsx:177-231
return (
    <Panel name="category-editor-root" direction="column" flex={1}
        overflow="hidden" background="default">
        {renderToolbar(<Panel name="category-search-portal" ... />)}
        <CategoryView ... renderItems={renderItems} />
    </Panel>
);
```

```ts
// After: CategoryEditor.ts
export class CategoryEditorView extends VanillaView<{ model: EditorModel }> {
    public constructor(props: { model: EditorModel }) {
        super(props, createPanelElement({
            name: "category-editor-root",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            background: "default",
        }));
    }

    protected onMount(): void {
        // Claim/mount PageToolbarView and the current CategoryViewImpl here;
        // state bindings and the native renderItems callback update them in place.
    }
}
```

Retain a compatibility value export only if the rewritten file's existing
export is useful to a source consumer; the audit found none. The canonical
editor export should be `CategoryEditorView`.

### 3. Migrate the sole `renderItems` caller to native Nodes

In the renamed `CategoryEditor.ts:116-141` region, replace the React
`useCallback` and both JSX spread sites with one stable native callback. Build
the exact `LinksListProps`/`LinksTilesProps` object explicitly from
`CategoryItemsRendererProps`, including:

```ts
const commonProps = {
    links: itemProps.items,
    selectedId: itemProps.selectedId,
    selectedIds: itemProps.selectedIds,
    getId: (item: ITreeProviderItem) => item.href,
    onSelect: itemProps.onSelect,
    onDoubleClick: itemProps.onDoubleClick,
    onEdit: itemProps.onEdit,
    onDelete: itemProps.onDelete,
    onContextMenu: itemProps.onContextMenu,
    onGridModel: itemProps.onGridModel,
    onItemDragEnter: itemProps.onItemDragEnter,
    onItemDragOver: itemProps.onItemDragOver,
    onItemDragLeave: itemProps.onItemDragLeave,
    onItemDrop: itemProps.onItemDrop,
    dropTargetId: itemProps.dropTargetId,
    dragSourceId: itemProps.dragSourceId,
    onDragStartOverride: itemProps.onDragStartOverride,
};
```

For list mode, create/update a claimed `LinksListView` with
`{ ...commonProps, searchText: itemProps.searchText }` and return its `root`.
For tile modes, create/update a claimed `LinksTilesView` with
`{ ...commonProps, viewMode: itemProps.viewMode }` and return its `root`.
Do not use a React face, `mountVanilla`, or `mountReact` for either arm.

Because a bare `Node` has no disposer, the editor view must retain the active
native child view and dispose/release it when the category view drops its
content arm or changes list/tile mode. Add a narrowly-scoped optional lifecycle
callback to `CategoryViewProps` (for example `onItemsDisposed?: () => void`),
call it from `CategoryViewImpl.disposeBridge()` before clearing the current
Node, and pass the editor's release callback. This keeps `CategoryViewImpl`
from guessing ownership while ensuring `LinksListView` subscriptions, grids,
tooltips, and pooled child views do not survive a detached root.

At this intermediate stage, update
`src/renderer/components/tree-provider/CategoryViewImpl.ts:278-366` to accept
both results:

```ts
// Temporary stage-2 shape
const rendered = this.props.renderItems(...);
if (rendered instanceof Node) {
    this.bridgeHost.replaceChildren(rendered);
    this.bridge = rendered;
} else {
    this.bridge = mountReactHandle(
        this.bridgeHost,
        React.createElement(React.Fragment, null, rendered),
    );
}
```

Keep the existing projection comparisons, tile focus-scope placement, pending
grid repaint, and scroll-to-row behavior. The direct native branch must update
the existing view and replace the host's child only when the returned Node
changes; it must not create a new list/grid on every state notification.

### 4. Narrow `renderItems` and remove the nested React bridge

After the sole caller returns only native Nodes, change
`CategoryViewModel.ts:103` again:

```ts
// Final
renderItems: (props: CategoryItemsRendererProps) => Node;
```

Then finish `CategoryViewImpl.ts`:

- remove the `React` import at `:1`, `mountReactHandle` and
  `MountedReactRoot` at `:9`, and the React-specific bridge field;
- remove the Fragment wrapper and the React branch from `renderItems` at the
  current `:328-356`;
- make the current bridge host a direct native Node host, with `disposeBridge`
  clearing the host and invoking the ownership callback;
- update the stale comment at `:72` that says LinksList/LinksTiles are a React
  island;
- retain `CategoryView.tsx`'s React `mountVanilla` face because it is a public
  compatibility shim, not a root in the converted editor.

The final boundary is:

```ts
// Final CategoryViewImpl shape
private renderItems(state: CategoryViewState): Node {
    return this.props.renderItems({
        // same projection and handlers as today
    });
}

// In reconcileContent: direct Node insertion, no createRoot/mountReactHandle.
this.bridgeHost.replaceChildren(this.renderItems(state));
```

### 5. Move the module registration to `index.ts`

Rename `src/renderer/editors/category/index.tsx` to `index.ts`.

- Remove `CategoryEditorComponent`, its JSX, and the React-only import of
  `CategoryEditor`.
- Import `CategoryEditorView` from `./CategoryEditor` and register
  `View: CategoryEditorView` at the current `:17` location; remove `Component`.
- Preserve `createEditor`, the `TComponentState` default initialization, the
  dynamic `newEditorModel` implementation at `:18-27`, and all existing model
  value/type exports at `:30-34`.
- Keep the extensionless dynamic editor import in
  `register-editors.ts:175`; touch that importer only if the Vite stale
  `.tsx` specifier cache requires the established rename invalidation.

### 6. Verify the native path and the scope boundary

Run source checks and the real category-editor path. No unit tests or test
harnesses are to be added. Verify the editor registry, DOM layout, native
selection/navigation/search/toolbar behavior, list and every tile mode,
folder-mode persistence, empty/loading/error arms, drag/drop, and disposal.

## Concerns / Open questions

### Resolved: 0 roots is achievable within the stated scope

Yes—0 roots is achievable for the category editor when opened. The editor
surface can use `CategoryViewImpl`, `LinksListView`, `LinksTilesView`,
`PageToolbarView`, `BreadcrumbView`, and DOM helpers directly; all are native
arms, and the sole `renderItems` caller is confirmed. The final
`CategoryViewImpl` must contain no `mountReactHandle`.

This does not authorize claiming that the entire category interaction is
React-free: `LinksListView` intentionally builds `LinkTooltipContent` as a
React tooltip value (`LinksListView.ts:348-355`), which can create a tooltip
root only when opened. That separate island is outside US-1114.

### Resolved: root shape

Use the real outer Panel root. `category` returns one Panel, unlike `image`'s
fragment. A local contents root would alter the page-column flex item and is
not appropriate.

### Resolved: native list/tile arms exist

Both arms have public constructors and native implementations, verified at
`LinksListView.ts:88-123` and `LinksTilesView.ts:71-135`. No conversion of
`LinksList.tsx` or `LinksTiles.tsx` is needed. Their React faces must remain for
`LinkItemList.tsx` and `LinkItemTiles.tsx`.

### Risk: Node ownership across the render boundary

React values carry their own lifecycle through `mountReactHandle`; a raw DOM
Node does not. The implementation must use one owned active
`LinksListView`/`LinksTilesView`, update it in place, and provide the narrow
`CategoryViewImpl` disposal callback described in plan step 3. Returning a new
mounted native view on every `renderItems` call, or merely detaching its root,
would leak grid/list subscriptions and pooled child views even though the root
count looked correct.

### Risk: state updates that used to cause React renders

`page.state.version`, `host.selectionState.selectedHref`, and
`viewModel.state.viewMode` were the only `state.use` reads, but
`categoryPath` is also derived from mutable editor state. All four projections
must have explicit native consequences. A binding that only updates the
toolbar or only updates the category view will recreate the §6.1 masked-defect
class documented in `uikit/shared/vanilla-view.ts:197-216`.

### Risk: changing subscription source objects

`VanillaView.bind()` is appropriate only when the state object lives as long as
the view. For a subscription whose source object can change, such as
`host.selectionState`, the converted view must keep the unsubscribe in a field,
call it before replacing the source, and register one final `own()` cleanup.
Otherwise `bind()`'s permanent disposer registration
(`uikit/shared/vanilla-view.ts:197-216`) accumulates listeners across the page
version changes described at `CategoryEditor.tsx:88-91`; stale hosts can then
fight the current host and corrupt selection. This is a general EPIC-068 rule,
and the `git-tree` and `board-info` conversions may encounter the same shape.

### Resolved: `searchPortal` is safe when non-null on the first call

The React null-first sequence is an implementation detail of the ref callback,
not a contract consumed by `CategoryViewImpl`: `CategoryViewImpl.ts:382-412`
selects the portal whenever it is non-null, and `:148-161,229-247` applies that
toolbar update during the initial state projection. `CategoryView.tsx:8-9` adds
no conditional behavior. Native creation therefore moves search-control
placement earlier but does not change the consumer's result; this remains a
verification item, not a reason to preserve a synthetic null pass.

### Risk: JSX rest-prop spreads

The two spread sites at `CategoryEditor.tsx:137` and `:139` must disappear as
JSX during the conversion. The replacement must carry every field in
`commonProps` (`:117-135`) explicitly, including selection sets, grid model,
all four drag callbacks, drop target, drag source, and drag-start override.
Do not describe this as closing `applyRestProps`; EPIC-068 E10-5 concern 3
explicitly keeps that bridge in scope for later work.

### Resolved: no second `renderItems` caller

The only caller is `CategoryEditor.tsx:116`. The `CategoryView.tsx` and
tree-provider barrel re-exports are type/API exposure only. After the caller is
migrated, narrowing the contract is safe and the final parent can delete the
React bridge.

### Non-goals

- Do not convert `CategoryEditorModel.ts` or `FolderViewModeService.ts`.
- Do not convert `LinksList`/`LinksTiles` React faces, `LinkTooltipContent`, or
  the generic `fillSlot`/`react-compat` bridge.
- Do not convert the nine other React-arm editors, `PageToolbar`'s remaining
  callers, `EditorToolbar`, or `ContentHostFooter`.
- Do not add tests, a test harness, a dashboard entry, or a commit.

## Acceptance Criteria

- `src/renderer/editors/category/index.ts` exists, registers
  `View: CategoryEditorView`, has no `Component`, and preserves the model
  factory and all existing model exports.
- `src/renderer/editors/category/CategoryEditor.ts` exists, contains no JSX or
  React hooks, has a public `VanillaView` constructor, adopts one outer Panel
  root, and claims/mounts its native children exactly once.
- The no-provider, loading, error, empty-folder, list, and all tile-mode DOM
  arms preserve the old names, layout, toolbar, breadcrumb, search portal,
  footer, selection, navigation, drag/drop, and view-mode behavior.
- Every old state read is represented by an explicit native binding or
  subscription: page `version`, host `selectedHref`, native `viewMode`, and
  editor `filePath`/`categoryPath` synchronization.
- `renderItems` follows the ordered widen → native caller → narrow sequence:
  `CategoryViewModel.ts` ends at `Node`, `CategoryViewImpl.ts` has no React
  import/Fragment/mount handle, and `CategoryEditorView` returns an existing
  native list/tile root with explicit props.
- The category editor's active native list/tile view is released when its
  content arm is removed or its mode changes; closing the editor disposes all
  children and asynchronous work.
- The two former JSX `{...commonProps}` sites are gone, and every common prop
  is forwarded explicitly to the matching native constructor.
- The initial real editor path measures 0 `[data-react-root]` and 0
  `[data-part="react-slot"]` elements for the category editor. Any tooltip
  React root is only the documented existing interaction-time island and is
  not counted as an editor-open root claim.
- No unit tests or harnesses are added, no dashboard duplicate is created,
  EPIC-068/US-1114 remains unchecked, and no commit is created.

## Files that need NO changes

- `src/renderer/editors/category/CategoryEditorModel.ts` — already native model;
  only its `filePath` state is read by the new view.
- `src/renderer/editors/category/FolderViewModeService.ts` — already native and
  retains its persistence contract.
- `src/renderer/components/tree-provider/CategoryView.tsx` and
  `src/renderer/components/tree-provider/index.ts` — type re-exports and the
  React `mountVanilla` compatibility face remain valid after the contract
  narrows.
- `src/renderer/editors/link-editor/LinksList.tsx`, `LinksTiles.tsx`,
  `LinksListView.ts`, and `LinksTilesView.ts` — native arms already exist;
  other React callers still need their faces.
- `src/renderer/editors/base/PageToolbarView.ts` — accepts native
  `SlotContent` and already owns its toolbar children.
- `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts`,
  `src/renderer/uikit/Breadcrumb/Breadcrumb.css`,
  `src/renderer/uikit/Panel/panel-style.ts`, `Panel/Panel.css`, and
  `src/renderer/uikit/Text/text-style.ts` — existing native builders/styles
  are reused.
- `src/renderer/uikit/shared/vanilla-view.ts` and `shared/mount.tsx` — existing
  lifecycle and adapter contracts are sufficient; do not alter them.
- `src/renderer/editors/register-editors.ts` and `doc/active-work.md` — the
  extensionless registry import and existing EPIC-068 dashboard entry remain;
  no duplicate entry is needed.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/category/CategoryEditor.tsx` → `CategoryEditor.ts` | Replace the React surface with `CategoryEditorView`, native toolbar/breadcrumb/panel/category composition, explicit bindings, and the native `LinksListView`/`LinksTilesView` render callback. |
| `src/renderer/editors/category/index.tsx` → `src/renderer/editors/category/index.ts` | Register `View`, remove `Component`, and preserve model factories/exports. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Widen `renderItems` for the transition, then narrow its final return type to `Node`; add the narrow disposal callback if required by the ownership design. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Temporarily accept both render arms, then replace the React bridge with direct native Node insertion and dispose notification. |
