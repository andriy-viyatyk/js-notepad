# US-1272: Give Category item views one owner

## Status

**Status:** Planned  
**Priority:** Medium  
**Epic:** [EPIC-082 - React architecture removal at the call sites](../../epics/EPIC-082.md)  
**Started:** -  
**Completed:** -

## Goal

Dismantle `CategoryViewProps.renderItems` and the raw `Node` bridge in `CategoryViewImpl`. Replace
them with a caller-supplied owned-view factory plus a typed projection-update handle. Make
`CategoryViewImpl` the single owner of the active `LinksListView` or `LinksTilesView`, and remove
the compensating grid repaint microtask without changing Category editor behavior.

This is an ownership/lifecycle correction, not an allocation optimization. The current
`CategoryItemsRendererProps` has 18 keys and 11 callbacks, and its callback values are
stable bound fields; the defect is that `CategoryEditor` owns the child lifecycle while
`CategoryViewImpl` decides when to create, update, and replace it.

The resulting boundary is a stable renderer over the `LinksListView`/`LinksTilesView` model/view
handle: state and prop changes update that owned handle directly, while the DOM host remains a
stable structural slot.

## Background

### Current ownership and bridge

`src/renderer/editors/category/CategoryEditor.ts:273-287` builds the `CategoryViewProps` object with
the stable `renderItems` field and `onItemsDisposed` release callback. Its
`renderItems()` method at `:358-410` creates, mounts, updates, and returns the root of either
`LinksListView` or `LinksTilesView`; `releaseActiveItems()` at `:412-416` calls `releaseChild()`.
Those views are therefore claimed by `CategoryEditor` through `this.child(...)`.

The sole `CategoryViewImpl` construction site is
`src/renderer/editors/category/CategoryEditor.ts:226-234`. `CategoryViewImpl` calls the
render-prop from `reconcileItemsArm()` at
`src/renderer/components/tree-provider/CategoryViewImpl.ts:272-329`, then inserts the returned
raw `Node` into `bridgeHost` and compares it with `this.bridge` at `:296-310`. When the child is
disposed, `disposeBridge()` at `:360-370` calls back into `CategoryEditor` before clearing the
bridge. This is split ownership: the child owner and the class deciding its replacement are
different objects.

The render-prop declaration is
`src/renderer/components/tree-provider/CategoryViewModel.ts:59-78` plus
`CategoryViewProps.renderItems` at `:103` and `onItemsDisposed` at `:105`. It is only consumed by
`CategoryViewImpl`; `TreeProviderViewImpl` has six consumers and is explicitly out of scope.

### Existing native ownership seam

`src/renderer/uikit/Popover/PopoverView.ts:24-29` defines `contentView?: (host) => IOwnedView` as
a factory supplied by the caller; PopoverView does not import any content view. At `:92-100`,
`PopoverFloatingView.onMount()` invokes the factory, claims the returned view with `this.child(...)`,
and mounts it. The returned content view owns the content below the supplied host; the Popover
branch owns its lifetime. `MenuContentView` at
`src/renderer/uikit/Menu/MenuView.ts:52-69` adopts the supplied host as its root, while other
callers append a detached child root to the host. The important convention is the explicit
`IOwnedView` ownership boundary, not DOM containment: `VanillaView.child()` claims one lifetime
owner, and `releaseChild()` disposes and detaches a retiring child.

US-1272 chooses the analogous owner-moving design (candidate **(a)** from EPIC-082), with one
important boundary correction: `CategoryViewImpl` receives an `itemsView(host, initialProps)`
factory from the caller rather than importing editor code. The factory creates the concrete item
view (and, where needed, a small typed adapter exposing `mount()`, `update(CategoryItemsViewProps)`
and `dispose()`), appends/adopts it under the supplied host, and returns the owned-view handle.
`CategoryViewImpl` registers the returned handle with `this.child(...)`, mounts it, calls its typed
`update()` directly for later projections, and releases it on retirement. Candidate **(b)** —
keeping ownership in `CategoryEditor` and passing a stable handle — would be a smaller diff, but
would leave the structural Category view dependent on an external lifecycle callback and preserve
the ownership decision at the wrong boundary.

The ownership boundary moves while the import boundary does not: `CategoryViewImpl` owns the
returned handle, but `CategoryEditor` keeps its static `LinksListView`/`LinksTilesView` imports and
supplies the factory. `components/tree-provider` remains free of static `editors/` imports, so
archive (main and secondary), Explorer, Link editor, Mneme root, and Category consumers do not
pull the Category editor's transitive view code into their chunks. Candidate (a) costs a typed
adapter/projection contract and keeps Category's factory coupled to the Link item-view shape; it
does not cost code-splitting or invert the components/editors dependency.

### State, props, and the current memo chain

`CategoryViewImpl.onMount()` binds a state projection at
`src/renderer/components/tree-provider/CategoryViewImpl.ts:138-156`. `TOneState.subscribe()` in
`src/renderer/core/state/state.ts:99-114` compares selected values before invoking the listener;
`compareSelection` at `src/renderer/core/state/state.ts:30-42` identity-compares arrays and sets,
while plain objects are recursively compared. The selector currently includes eight keys, not only
the item projection: `filteredItems`, `selectedHrefs`, `dropTargetHref`, `searchText`, `loading`,
`error`, `items`, and `dropOverView`.

The item-view reconciliation must therefore retain an exact state-side comparison. The replacement
`createDepsGate()` from `src/renderer/uikit/shared/deps-gate.ts` compares these item terms:
`filteredItems` (visible rows), `selectedHrefs` (multi-selection IDs), `dropTargetHref` (folder-row
drop highlight), and `searchText` (row highlight/filter context). It also compares the prop/factory
terms `selectedHref` (primary selection), `multiSelect` (single versus set selection), `provider`
(edit/delete and drag/drop capability), and `itemsView` (factory identity), plus normalized
`viewMode` for list/tile type and dimensions. The other four state-selector terms are deliberately
excluded from this gate: `loading` and `error` control the message arm, `items` feeds the footer's
total count and the model's filtered projection, and `dropOverView` controls the root whitespace
drop outline. They may still invoke `applyState()`, but they must not update the child or trigger a
full grid repaint unless one of the exact item terms also changed.

The complete term ownership is:

| Term | Owner/consumer |
|---|---|
| `filteredItems` | Item rows/tiles and their row count. |
| `selectedHrefs` | Multi-selection set passed to the item view; also the footer selected count. |
| `dropTargetHref` | Folder-row/tile drop highlight. |
| `searchText` | Item-view search highlighting/filter context and empty-result text. |
| `selectedHref` | Primary single-selection highlight. |
| `multiSelect` | Chooses primary selection versus `selectedIds` behavior. |
| `provider` | Optional edit/delete callbacks and drag/drop capability values. |
| `itemsView` | The caller factory that creates the current typed item-view handle. |
| normalized `viewMode` | List versus tile arm, tile dimensions, and mode-specific grid behavior. |
| `loading` | Loading message arm and content-arm eligibility; shell only. |
| `error` | Error message arm; shell only. |
| `items` | Footer total count and the model's filtered-items source; shell/model state, not direct child input. |
| `dropOverView` | Root whitespace-drop outline; shell only. |

The gate is stamped before any child construction or update; this matters if a synchronous
child/grid consequence re-enters the view. After the initial `applyState()` pump in `onMount`,
prime the gate with the current dependency array (`itemProjectionGate.prime(currentDeps)`) so the
first ordinary update does not repaint solely because `depsChanged(undefined, next)` is true.

### Grid repaint and re-entrancy trace

`flushPendingGridRepaintSoon()` at `CategoryViewImpl.ts:378-386` exists because the parent invokes a
renderer that returns an opaque `Node`; it cannot know whether a child was reused or rebuilt, so it
sets `pendingGridRepaint` and schedules `gridModel.update({ all: true })` in a microtask. Once the
parent owns and directly updates the child, the repaint can happen immediately after that child
update. The direct update must be after the child-update/creation branch and after the projection
gate has stored the new dependencies.

The child APIs confirm why the explicit repaint remains necessary:

- `LinksListView.onUpdate()` at `src/renderer/editors/link-editor/LinksListView.ts:158-169`
  updates the grid's option set and marks its current rows, but the parent still needs the full
  repaint for the complete selection/drop/search/provider projection.
- `LinksTilesView.onUpdate()` at `src/renderer/editors/link-editor/LinksTilesView.ts:179-191`
  rebuilds async row metadata for link/view-mode changes and marks rows for link changes; it does
  not mark all rows for selection or drop-target changes.
- Both child views report their grid model through `onGridModel` during mount and report `null`
  during disposal. These callbacks only update the parent's `gridModel` field; they do not write
  Category state or call `CategoryViewImpl.update()`.

The resulting synchronous path for US-1271's drag writes is:
`CategoryViewModel.setDragState()` → `TOneState.stateChanged()` → the Category state binding →
`applyState()` → the already-stamped item gate → active child `update()` → direct grid
`update({ all: true })`. `RenderGridModel.update()` is an imperative grid operation and neither
child's `onGridModel` callback writes Category state, so this path does not re-enter
`applyState()`/`syncState()` through the Category model. The direct repaint is nevertheless kept
after the child update and after the gate stamp; it must not be moved before those operations.
The DOM drag handler therefore stays cheap in the important sense: a folder-row
`dropTargetHref` change performs the existing projection comparison, stable child update, and
required synchronous repaint; a whitespace `dropOverView` change stops at the shell update and
does not enter that child/repaint path. Neither path schedules a follow-up microtask or invokes a
Node-returning renderer.

### Lifecycle and empty/content arms

`CategoryViewImpl.applyState()` at `:223-251` removes item content for loading/error and empty
states. The new `disposeItems()` must release the owned child with `releaseChild()` while mounted,
and also remove the child root defensively from the host during parent disposal: `VanillaView`
disposes registered children before `onDispose()`, so a later `releaseChild()` can see an already
snapshotted ownership list. The child reference must be cleared exactly once. The existing
`itemsChainMounted`/`tileScope` structure remains responsible only for placing the item host in
list or tile layout; it no longer represents a raw returned child Node.

## Implementation Plan

1. Reconfirm the scoped inventory before editing. `CategoryViewImpl` has exactly one consumer,
   `CategoryEditor.ts:229`; `CategoryViewModel`'s render-prop types have exactly one implementation
   consumer; and `TreeProviderViewImpl` is not part of this task. Do not change the shared
   `TreeProviderViewImpl` props contract or any UIKit file.

2. Replace the render-prop-only contract in
   `src/renderer/components/tree-provider/CategoryViewModel.ts` and its public type export in
   `src/renderer/components/tree-provider/index.ts` with a typed owned-view factory contract.

   Before:

   ```ts
   export interface CategoryItemsRendererProps {
       // 18 item projection fields, including onGridModel and drag callbacks
   }

   export interface CategoryViewProps {
       // category/editor callbacks...
       renderItems: (props: CategoryItemsRendererProps) => Node;
       onItemsDisposed?: () => void;
   }
   ```

   After:

   ```ts
   export interface CategoryItemsViewProps {
       // The typed 18-field projection payload formerly named CategoryItemsRendererProps.
   }

   export interface CategoryItemsViewHandle extends IOwnedView {
       mount(): HTMLElement;
       update(props: CategoryItemsViewProps): void;
   }

   export type CategoryItemsViewFactory = (
       host: HTMLElement,
       initialProps: CategoryItemsViewProps,
   ) => CategoryItemsViewHandle;

   export interface CategoryViewProps {
       // provider/category/selection/view-mode/editor callbacks and toolbar target...
       itemsView: CategoryItemsViewFactory;
   }
   ```

   Rename the projection payload to `CategoryItemsViewProps` rather than retaining the
   render-prop name. Preserve these exact 18 fields as the explicit typed update path:
   `items`, `viewMode`, `selectedId`, `selectedIds`, `searchText`, `onSelect`, `onDoubleClick`,
   `onEdit`, `onDelete`, `onContextMenu`, `onGridModel`, `onItemDragEnter`, `onItemDragOver`,
   `onItemDragLeave`, `onItemDrop`, `dropTargetId`, `dragSourceId`, and `onDragStartOverride`.
   This is not a `Node`-returning renderer contract. Add `CategoryItemsViewHandle` and
   `CategoryItemsViewFactory` to the public component type export. Keep the `GridModelCapability`
   import because `onGridModel` remains part of that typed projection channel. Keep
   `CategoryViewModel.setProps()` and `setDragState()` exactly as settled by US-1271; this task
   does not change their synchronous behavior.

3. Make `src/renderer/components/tree-provider/CategoryViewImpl.ts` the item-view owner without
   importing editor code.

   - Import only the typed Category item-view contract, `IOwnedView` as a type if needed, and
     `createDepsGate`/`DepsGate` in addition to the existing component/core imports. Do **not** add
     static imports from `editors/`.
   - Replace `bridge` with an `activeItems` `CategoryItemsViewHandle` reference and keep a dedicated
     host element (`itemsHost`, currently `bridgeHost`) with the same `display: contents` behavior.
     Track the active arm as `"list" | "tiles"` so a change between list and tiles retires the
     current handle; changing among tile dimensions updates the existing handle. The host is
     structurally owned by CategoryViewImpl; the returned handle is claimed with `this.child(...)`.
   - Replace `lastProjection` with an exact item-projection `DepsGate`. Feed it the four state
     terms `state.filteredItems`, `state.selectedHrefs`, `state.dropTargetHref`, and
     `state.searchText`, the four prop/factory terms `this.props.selectedHref`,
     `this.props.multiSelect`, `this.props.provider`, and `this.props.itemsView`, plus normalized
     `viewMode`. The broad state binding may still fire for `loading`, `error`, `items`, and
     `dropOverView`, but those terms must not pass this item gate and must not repaint the child.
     Keep the separate previous-mode value only for the view-mode scroll reset, and stamp the gate
     and mode value before invoking factory or child code.
   - Preserve the existing state selector's loading/error/items/drop-over-view behavior and the
     list/tile host placement. In the non-empty content arm, reconcile the active child directly:
     build the same typed projection values currently assembled in `CategoryViewImpl.renderItems()`;
     call `this.props.itemsView(this.itemsHost, projection)` once for the current list/tile arm;
     claim the returned handle with `this.child()`, verify/retain its host attachment, and mount
     it. If the arm remains active, call `activeItems.update(projection)` directly. If the view mode
     changes between list and tile arms, release the old handle before calling the factory again.
   - Preserve the current `scrollToRow(0)` behavior when switching view modes. After the child
     create/update branch, call `this.gridModel?.update({ all: true })` synchronously when an item
     projection was reconciled. The child itself remains responsible for its stable `renderCell`
     renderer, async favicon/image metadata, and row-level updates.

   Before:

   ```ts
   const rendered = this.renderItems(state);
   if (rendered !== this.bridge) {
       this.bridgeHost.replaceChildren(rendered);
       this.bridge = rendered;
   }
   this.pendingGridRepaint = true;
   this.flushPendingGridRepaintSoon();
   ```

   After:

   ```ts
   const projectionChanged = this.itemProjectionGate.changed(this.itemProjectionDeps(state));
   const previousViewMode = this.lastViewMode;
   this.lastViewMode = viewMode; // stamp before child code can re-enter
   const nextArm = viewMode === "list" ? "list" : "tiles";

   if (projectionChanged || !this.activeItems || !this.itemsChainMounted) {
       const projection = this.itemProjection(state, viewMode);
       if (this.activeItems && this.activeItemsArm !== nextArm) {
           this.disposeActiveItems();
       }
       if (!this.activeItems) {
           this.activeItems = this.child(this.props.itemsView(this.itemsHost, projection));
           this.activeItemsArm = nextArm;
           this.activeItems.mount();
       } else {
           this.activeItems.update(projection);
       }
       if (previousViewMode !== undefined && previousViewMode !== viewMode) {
           this.gridModel?.scrollToRow(0);
       }
       this.gridModel?.update({ all: true });
   }
   ```

   The implementation may split this pseudocode into helpers, but it must retain the stated
   ordering and must not reintroduce a raw `Node` comparison.

4. Delete `flushPendingGridRepaintSoon()`, `pendingGridRepaint`, and the `onItemsDisposed` bridge
   callback path from `CategoryViewImpl`. Keep `onGridModel` as the child-to-owner grid capability
   channel, including its inert guard, because the child reports the model only after mount and
   clears it during disposal. Replace `disposeBridge()` with an owned-child disposal helper that:

   - stores and clears `activeItems` before disposal;
   - calls `releaseChild(activeItems)` while the child is still registered;
   - removes `activeItems.root` from `itemsHost` defensively if parent disposal already removed the
     ownership registration; and
   - clears `gridModel` and the projection baseline without calling back into `CategoryEditor`.

   Do not remove `inert` or its guard: it is tied to real child/grid callbacks and not to the
   deleted microtask. Do not replace the deleted microtask with `schedule.raf`, `timeout`, or a
   delayer; no deferred work survives after the direct grid update.

5. Simplify `src/renderer/editors/category/CategoryEditor.ts` to pass the Category view's
   high-level editor callbacks, toolbar target, and a caller-owned factory while keeping its static
   editor imports. Rename the old `renderItems` method to a factory such as
   `createItemsView(host, initialProps): CategoryItemsViewHandle`. It must construct the concrete
   `LinksListView` or `LinksTilesView` using the existing imports and map the shared
   `CategoryItemsViewProps` to the concrete `LinksListProps`/`LinksTilesProps` on every typed
   `handle.update()`. The returned handle delegates `root`, `mount()`, `update()`, and `dispose()`
   to that one concrete view; it must not register the concrete view with `CategoryEditor.child()`.
   The factory appends the detached concrete root to the supplied host, following the Popover
   `contentView(host)` seam. `CategoryViewImpl` then claims the returned handle, so the ownership
   boundary moves even though the import boundary stays in CategoryEditor.

    Remove the `CategoryItemsRendererProps` import, `ActiveItemsView` alias, `activeItems` field,
    `releaseActiveItems()` method, and the `renderItems`/`onItemsDisposed` properties from
    `categoryViewProps()`; add the stable `itemsView: this.createItemsView` factory property.

   Before:

    ```ts
    renderItems: this.renderItems,
    toolbarPortalRef: this.searchPortal,
    onItemsDisposed: this.releaseActiveItems,
    ```

   After:

    ```ts
    itemsView: this.createItemsView,
    toolbarPortalRef: this.searchPortal,
    ```

   The factory/adapter shape is:

    ```ts
    private readonly createItemsView: CategoryItemsViewFactory = (host, initialProps) => {
        return initialProps.viewMode === "list"
            ? this.listHandle(host, new LinksListView(this.listProps(initialProps)))
            : this.tilesHandle(host, new LinksTilesView(this.tilesProps(initialProps)));
    };

    private listHandle(host: HTMLElement, concrete: LinksListView): CategoryItemsViewHandle {
        host.append(concrete.root);
        return {
            root: concrete.root,
            mount: () => concrete.mount(),
            update: (nextProps) => concrete.update(this.listProps(nextProps)),
            dispose: () => concrete.dispose(),
        };
    }
    ```

    `tilesHandle()` has the same typed shape with `LinksTilesView` and `tilesProps(nextProps)`;
    separate helpers keep list props from ever reaching a tile view or vice versa. A list/tile arm
    change retires the handle before the factory is called again. `listProps()`/`tilesProps()` must
    preserve the already-stable callback fields, including a stable `getItemId` for the concrete
    Link props. The adapter is the only lifetime handle returned to
    `CategoryViewImpl`; the concrete view is not separately claimed by `CategoryEditor`.

   Leave `ensureCategorySurface()`, the single `CategoryViewImpl` child relationship, host
   selection subscriptions, view-mode persistence, and all high-level selection/navigation
   handlers unchanged except for the removed renderer plumbing. The factory still constructs
   `new LinksListView`/`new LinksTilesView`, but `CategoryEditor` must no longer claim those
   concrete views with `this.child()` or release them directly; the returned adapter is the sole
   child lifetime that `CategoryViewImpl` owns.

6. Review the final diff for ownership and scope invariants. There must be no live
   `CategoryItemsRendererProps`, `renderItems`, `onItemsDisposed`, `bridge` raw-Node comparison,
   `pendingGridRepaint`, or `flushPendingGridRepaintSoon` references in the Category source path.
   `CategoryViewImpl.ts` must contain no static `editors/` import. The Category item handle must be
   claimed by exactly one `VanillaView` owner at a time. Do not touch
   `src/renderer/components/tree-provider/TreeProviderViewImpl.ts`, `src/renderer/uikit/`, or the
   three backlog memo chains named in EPIC-082.

7. Verify with the available lint/typecheck/build commands, but treat those as structural checks
   only. Verify the Category editor in the running app with real interactions and record the
   result in the task/epic progress:

   - list mode with initial load, refresh, selection, item edit, item delete, and scroll position
     preserved across ordinary updates;
   - each grid/tile mode with initial load, selection, search filtering, edit/delete, scrolling,
     and image/favicon repaint behavior;
   - switching list ↔ grid/tile modes repeatedly, including while scrolled, with the intended
     reset-to-row-zero behavior on mode changes and no duplicate child or grid callbacks;
   - single selection and multi-selection, including Ctrl/Shift selection, primary selection
     changes from the tree, and selection surviving/clearing correctly through search filtering;
   - search filtering, clearing search, empty results, and returning from an empty result to the
     populated list/grid;
   - real drag-hover onto folder rows and onto whitespace/file-parent areas, enter/leave clearing,
     drop, and immediate highlight/clear behavior in the Category editor;
   - drop completion followed by refresh, then item edit/delete and provider-watch refresh, with
     no stale child callbacks after category/provider disposal.

   Specifically exercise the synchronous US-1271 drag path: the folder-row and whitespace hover
   highlight must appear and clear without relying on a microtask, and no stale grid update may
   occur after switching category or disposing the view. A green build is not evidence of these
   behaviors.

## Concerns

### Direct grid update and synchronous re-entry

The direct `gridModel.update({ all: true })` is intentionally synchronous. Source inspection shows
that `RenderGridModel.update()` does not write Category state, and the child `onGridModel` callback
only changes the parent's grid reference, so it cannot re-enter the Category state binding through
the traced path. The projection gate and `lastViewMode` must still be stamped before child
construction/update, so any future synchronous callback sees the new snapshot and does not repeat
the same reconciliation. If runtime inspection reveals a re-entry, preserve the stamp-before-call
ordering and document the exact callback edge before changing scheduling.

### First pump and `DepsGate`

The initial state binding applies immediately during `CategoryViewImpl.onMount()`, and that first
application creates/mounts the item child. Call `itemProjectionGate.prime(currentDeps)` after the
initial bind has performed that pump. Without this `prime(currentDeps)`, the next ordinary
`CategoryEditor.categoryView.update()`
would report a false prop change because `depsChanged(undefined, next)` is true. If a child is
disposed for an empty/error arm, `!activeItems` remains an independent creation condition; it must
not be replaced by a gate result.

### Ownership teardown order

`VanillaView.dispose()` snapshots and clears its registered children before disposing them. This
means `CategoryViewImpl.onDispose()` cannot rely only on `releaseChild()` to detach a child that
was already in the disposal snapshot. The owned-child helper must be idempotent and remove the
root defensively, while normal mounted arm transitions must use `releaseChild()` so the child is
disposed once and detached once. Child disposal may invoke `onGridModel(null)`; retain the owner's
inert/lifecycle checks and clear the model reference after the child is retired.

### Child APIs and coupling cost

The chosen design keeps the two concrete Link item-view imports in `CategoryEditor`, where they
already exist, and gives `CategoryViewImpl` only the typed factory/handle contract. A future
different Category item presentation would implement that factory without adding an editor import
to `components/tree-provider`. That is the accepted cost of replacing the opaque raw-Node extension
point: the component contract carries a typed projection adapter, while the one concrete Category
consumer retains the presentation coupling. `LinksListView` and `LinksTilesView` keep their public
props and stable grid renderers; their other Link editor consumers are unaffected. The adapter's
`dispose()` is the single lifetime path to the concrete view, and `CategoryViewImpl` is the single
owner that claims and releases that returned handle.

### Synchronous drag hot path

US-1271 made `CategoryViewModel.setDragState()` synchronous. Every accepted Category
`dragenter`/`dragleave` now traverses the state projection and can update the active child inside
the browser event. The replacement must therefore avoid the opaque raw-`Node` bridge, must not
rebuild an unchanged child, and must use stable callback fields (`getItemId` included). Manual
verification must cover folder rows and whitespace, not only ordinary click selection.

### Scope boundary

Do not change `TreeProviderViewImpl` or its six-consumer props contract. Do not modify the bodies
or synchronous semantics of `CategoryViewModel.setProps()` or `setDragState()`; update only
references required by the contract change. Do not touch `src/renderer/uikit/`; `PopoverView` is a
read-only architectural reference for this task, not an edit target. Do not pull in US-1273's
toolbar host-passing work or its `SubtreeSwap` arm conversion.

## Acceptance Criteria

- [ ] `CategoryViewProps` replaces `renderItems`/`onItemsDisposed` with a typed
  `itemsView(host, initialProps)` factory; `CategoryItemsViewProps`,
  `CategoryItemsViewHandle`, and `CategoryItemsViewFactory` are exported from the Category
  component surface, with no `CategoryItemsRendererProps` name remaining.
- [ ] `CategoryViewImpl` invokes the caller-supplied factory, claims, mounts, updates, and releases
  the returned active item handle; `CategoryEditor` constructs the concrete views but does not
  register them with `CategoryEditor.child()` or release them directly.
- [ ] The item host remains structurally correct for list and tile/grid modes, and only one active
  item child is attached and owned at a time.
- [ ] The raw `Node` bridge comparison and `replaceChildren(rendered)` path are gone; item child
  updates use the concrete view handle and preserve all current selection, search, edit/delete,
  context-menu, drag, drop, and grid callbacks.
- [ ] The exact item projection is gated by the four state terms
  (`filteredItems`, `selectedHrefs`, `dropTargetHref`, `searchText`), the three live props
  (`selectedHref`, `multiSelect`, `provider`), the `itemsView` factory identity, and normalized
  `viewMode`; the gate is stamped before child code and intentionally primed after the first pump.
  `loading`, `error`, `items`, and `dropOverView` can update the shell but do not trigger item/grid
  reconciliation by themselves.
- [ ] `flushPendingGridRepaintSoon`, `pendingGridRepaint`, and the associated `queueMicrotask`
  are removed. A full grid update happens synchronously after a stamped child create/update, and
  view-mode scroll reset remains intact.
- [ ] `inert`/liveness guards are retained unless they guard only the deleted microtask; no
  owner-bound scheduler is introduced because no deferred repaint remains.
- [ ] The synchronous drag-hover path is cheap and correct: folder-row and whitespace enter/leave,
  clear, and drop feedback work immediately in the Category editor only.
- [ ] Running-app verification covers list and grid/tile modes, switching modes, single and
  multi-selection, search filtering, drag-hover/drop targets, edit/delete, provider refresh, and
  scroll position across updates. A green build alone is not accepted.
- [ ] Lint, typecheck, and the applicable production build pass after implementation.
- [ ] The existing US-1272 entries in `doc/active-work.md` and `doc/epics/EPIC-082.md` link to
  this task document.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Replace the `CategoryItemsRendererProps`/raw-Node render-prop surface with typed item projection, owned-view handle, and factory types; retain US-1271's synchronous model behavior. | Implementation |
| `src/renderer/components/tree-provider/index.ts` | Export the typed item projection, handle, and factory in place of `CategoryItemsRendererProps`. | Implementation |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Own the factory-returned item handle, replace the raw Node bridge and broad manual chain with exact item-projection `DepsGate` reconciliation, and replace the repaint microtask with synchronous grid update. | Implementation |
| `src/renderer/editors/category/CategoryEditor.ts` | Keep static Link-view imports, supply the typed factory/adapter, and remove CategoryEditor ownership/release plus raw render-prop plumbing. | Implementation |
| `doc/active-work.md` | Link the existing US-1272 dashboard entry to this README. | Dashboard link |
| `doc/epics/EPIC-082.md` | Link the existing US-1272 row in the epic task table to this README. | Epic link |
| `doc/tasks/US-1272-category-items-ownership/README.md` | Record verified ownership findings, design decision, implementation plan, concerns, and acceptance criteria. | This task document |

Files that need **no changes** in US-1272:

- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` and all six of its consumers —
  the shared tree props contract is explicitly outside this one-consumer Category task.
- `src/renderer/editors/link-editor/LinksListView.ts`, `LinksTilesView.ts`, `LinksList.ts`, and
  `LinksTiles.ts` — their existing stable renderers, child-level row updates, grid capability
  channel, and public props remain usable; `CategoryEditor` adapts them without changing their APIs.
- `src/renderer/uikit/Popover/PopoverView.ts`, `src/renderer/uikit/shared/vanilla-view.ts`,
  `src/renderer/uikit/shared/deps-gate.ts`, and `src/renderer/uikit/shared/subtree-swap.ts` —
  these are read-only lifecycle/design references or existing primitives; no UIKit change is
  authorized by this task.
- `src/renderer/core/state/state.ts` and `src/renderer/core/state/model.ts` — their synchronous
  state notification, selector comparison, and component-driver behavior are already verified and
  are not being changed.
- `src/renderer/components/tree-provider/CategoryView.css` — the existing host class and tile
  scope styles remain valid; the host's `display: contents` structure is preserved.
- `doc/tasks/US-1271-tree-provider-false-deferrals/README.md` — its findings are settled and this
  task only carries them forward; no edits are needed there.
- Unit tests and test harnesses — this project does not use them, and the requested task forbids
  adding them.
