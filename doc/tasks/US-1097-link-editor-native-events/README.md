# US-1097 — Link-editor and sidebar native DOM events

## Goal

Retype the shared event props consumed by the link-editor list and tile views, and the selected
folder-icon callback, to native DOM events. Remove the nine measured `toPublicEvent` wraps and
casts while preserving selection, context-menu, drag, and sidebar behavior.

This task restores the green compile after US-1096. It does not add tests or harnesses, create a
commit, or modify `doc/active-work.md`.

## Background

EPIC-066 E8-11 settles the seam rule: a `mountVanilla(View, props)` face receives the native DOM
event. Retype the shared prop, delete the wrap and cast, and fix each caller's handler parameter.
No union, normalising accessor, boundary adapter, or cast asserting a native event is a React event
is permitted.

The correction under EPIC-066 E8-8 makes a prop declaration and its callers one atomic change.
US-1096 retyped the `components/tree-provider` callbacks that reach `CategoryEditor.tsx`, but
`CategoryEditor.tsx:116-140` forwards that same `itemProps` bundle directly into both `LinksList`
and `LinksTiles`. Their event props were still React-typed, so the two prop chains meet at that
forwarding component and cannot compile independently. US-1097 absorbs this compile dependency;
`CategoryEditor.tsx` remains a forwarding caller and needs no adapter or event-member change.

### Measured wraps

The nine direct wraps are the four sites in each link view and the one sidebar site:

| File | Lines | Callback contract |
|---|---:|---|
| `src/renderer/editors/link-editor/LinksListView.ts` | 405, 418, 432, 463 | `onSelect`, `onContextMenu`, `onDragStartOverride`, and item drag callbacks |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | 557, 568, 581, 611 | The corresponding tile contracts |
| `src/renderer/ui/sidebar/FolderItemView.ts` | 52 | `FolderItemProps.onSelectedIconClick` |

`LinksListProps` and `LinksTilesProps` are the declarations for all link-view contracts. Their
React-facing `.tsx` functions only pass props to the vanilla views and retain `React.ReactElement`
in their return types. `FolderItemProps` is declared in `FolderItemView.ts`; `FolderItem.tsx`
re-exports it and passes it to `mountVanilla`.

### Atomic caller census

The following callers are part of the prop boundary and must change with the declarations:

| File | Contract | Current React-specific work | Native result |
|---|---|---|---|
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | `CategoryItemsRendererProps.onSelect` and `onDragStartOverride`, plus `onItemClick` / `handleOsDragStart` | Types use `React.MouseEvent` / `React.DragEvent` | Use `MouseEvent` / `DragEvent`; only `shiftKey`, `ctrlKey`, and `preventDefault()` are read |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Forwards category selection and OS-drag handlers | Parameters mirror the React-typed model props | Use native `MouseEvent` / `DragEvent`; keep the real React island and other React handlers unchanged |
| `src/renderer/editors/link-editor/LinkItemList.tsx` | `LinksListProps.onContextMenu` | Reads `e.nativeEvent.contextMenuPromise` | Use `MouseEvent` and write `e.contextMenuPromise` |
| `src/renderer/editors/link-editor/LinkItemTiles.tsx` | `LinksTilesProps.onContextMenu` | Reads `e.nativeEvent.contextMenuPromise` | Use `MouseEvent` and write `e.contextMenuPromise` |
| `src/renderer/editors/category/CategoryEditor.tsx` | Forwards `itemProps` into both link components | Reads no event member | No source change; direct forwarding remains |
| `src/renderer/ui/sidebar/MenuBarView.ts` | `FolderItemProps.onSelectedIconClick` caller | Supplies a handler with no event parameter | No source change; its one-argument callback remains assignable |

The category model's remaining item-drag callbacks were already native in US-1096 and stay native;
this task completes the same bundle's selection and drag-start contracts. The link-tag and
hostname panels pass one-argument selection handlers, so their inferred callback types need no
change. `PinnedLinksPanel.tsx` uses a separate list-item context-menu contract and is not a caller
of `LinksListProps` or `LinksTilesProps`.

All affected handlers read only members present on native events. The context-menu handlers call
`ContextMenuEvent.fromNativeEvent`, which remains dual-armed for this task, and attach the existing
async `contextMenuPromise` protocol directly to the native `MouseEvent`.

### Parameters-derived aliases

`LinksTilesView.ts:37-39` defines `SelectEvent`, `ContextMenuEvent`, and `PublicDragEvent` from
`Parameters<NonNullable<LinksTilesProps[...]>>`. They follow the prop declarations automatically;
they must not be rewritten by hand as native types. Once direct native events replace the casts,
the aliases have no remaining use and can be removed as dead type-only scaffolding. The local
`ContextMenuEvent` name therefore does not need to coexist with the real context-menu class in this
file; no class import is required after the cast is deleted.

### Accessor and compatibility boundaries

`src/renderer/core/traits/dnd.ts:getTraitDragDataFromEvent` currently still contains its
React/native dual arm. Its two call sites are `CategoryViewModel.onDrop` and
`uikit/Tree/TreeDndModel.ts`, and both now supply native `DragEvent` values; this task removes no
remaining React-typed caller. Leave the dual arm in place for US-1098.

`src/renderer/core/events/context-menu.ts` also remains unchanged because other React-shaped
callers still use its dual arm. `src/renderer/uikit/shared/react-compat.ts` must remain byte-for-byte
unchanged: `applyRestProps`, `clearRestListeners`, `bindRef`, and the compatibility invocation of
`toPublicEvent` are E8-7 / US-1098 boundaries. Before this task there are nine renderer wraps plus
that one compatibility invocation; after the nine are removed, one `toPublicEvent` call site
remains repo-wide, inside `applyRestProps`.

## Implementation Plan

### 1. Retype the shared link-list and tile props

- In `src/renderer/editors/link-editor/LinksList.tsx`, change `onSelect` to optional native
  `MouseEvent`, `onContextMenu` to native `MouseEvent`, `onDragStartOverride` to native
  `DragEvent`, and all four `onItemDrag*` callbacks to native `DragEvent`.
- Make the corresponding changes in `src/renderer/editors/link-editor/LinksTiles.tsx`.
- Preserve the prop order, callback argument order, return values, and the React-facing
  `mountVanilla` pass-through functions.

Before → after:

```ts
// Before
onSelect?: (link: ILink, e?: React.MouseEvent) => void;
onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
onDragStartOverride?: (link: ILink, e: React.DragEvent) => boolean;
onItemDrop?: (link: ILink, e: React.DragEvent) => void;

// After
onSelect?: (link: ILink, event?: MouseEvent) => void;
onContextMenu?: (event: MouseEvent, link: ILink) => void;
onDragStartOverride?: (link: ILink, event: DragEvent) => boolean;
onItemDrop?: (link: ILink, event: DragEvent) => void;
```

### 2. Remove the eight link-view wraps

- In `LinksListView.ts`, remove the `toPublicEvent` import and pass the listener's native
  `MouseEvent` / `DragEvent` directly at `installCellListeners()` and `forwardDrag()`.
- In `LinksTilesView.ts`, remove the import and pass each native event directly at
  `installCellListeners()` and `forwardDrag()`.
- Remove the three now-unused `Parameters<>` aliases from `LinksTilesView.ts`; do not replace them
  with handwritten native aliases. No event cast remains.
- Preserve `LinksListView.ts`'s genuine React tooltip bridge (`React.createElement`), and do not
  rename either view.

Before → after:

```ts
// Before
current.onContextMenu?.(
    toPublicEvent(event) as unknown as React.MouseEvent,
    current.link,
);

// After
current.onContextMenu?.(event, current.link);
```

The tile `ContextMenuEvent` alias shadows the core class only while it exists for the cast. Removing
the unused alias resolves that name without renaming or adding an import.

### 3. Complete the category caller chain

- In `CategoryViewModel.ts`, retype `CategoryItemsRendererProps.onSelect` and
  `onDragStartOverride`, `onItemClick`, and `handleOsDragStart` to native events. Keep
  `renderItems: (...) => React.ReactNode` and the rest of the genuine React-facing model API.
- In `CategoryViewImpl.ts`, change only the `onItemClick` and `onDragStartOverride` forwarding
  parameter types to native events. Leave `onSearchKeyDown`, `onViewModeMenu`, the
  `mountReactHandle` island, and the JSX/React element construction unchanged.
- Do not edit `CategoryEditor.tsx`; its `commonProps` object remains a direct spread into
  `<LinksList>` / `<LinksTiles>` with no adapter and no event-member read.

### 4. Update link-editor context-menu callers

- In `LinkItemList.tsx` and `LinkItemTiles.tsx`, change `handleContextMenu`'s parameter to native
  `MouseEvent` and replace `e.nativeEvent.contextMenuPromise` with `e.contextMenuPromise`.
- Keep the existing `ContextMenuEvent.fromNativeEvent` call, menu construction, target assignment,
  and async `linkContextMenu` behavior unchanged.

### 5. Retype the sidebar callback and preserve its caller

- In `FolderItemView.ts`, change `FolderItemProps.onSelectedIconClick` to native `MouseEvent`, pass
  the listener's `event` directly, and remove the now-unused React and `toPublicEvent` imports.
- `MenuBarView.ts` needs no change: its callback intentionally accepts only the folder argument.
- The file is already `.ts`; no rename is applicable. `FolderItem.tsx` remains the React-facing
  `mountVanilla` pass-through.

### 6. Verify the implementation

- Run `npm run typecheck` (`tsc --noEmit`) and require green.
- Run `npm run lint` and require clean output.
- Run `npm run build-prod` and require a successful production build.
- Confirm `react-compat.ts`, `core/events/context-menu.ts`, and `core/traits/dnd.ts` are unchanged.
- Add no tests or test harnesses, create no commit, and leave `doc/active-work.md` unchanged.

## Concerns

1. **The task boundary is the shared prop chain, not only the link-editor folder.** The category
   model/view and the two link-item context-menu handlers are included because they supply the
   retyped props. `CategoryEditor.tsx` is explicitly a no-change forwarder; adding a cast or
   adapter there would violate E8-11.

2. **The measured casts include contracts not currently visible in the two typecheck errors.**
   The current errors are the context-menu mismatch at `CategoryEditor.tsx:137` and `:139`; the
   selection and drag-start wraps are still independently React-typed and must be removed in the
   same atomic prop-chain change.

3. **The `Parameters<>` aliases are derived, not a second type system.** They are not hand-edited
   to native event names. They become unused after the casts disappear and are removed; the
   `ContextMenuEvent` shadowing issue consequently does not persist.

4. **The event expando protocol is load-bearing.** The link-item context-menu promise is awaited by
   the native global event service. Only the React `.nativeEvent` hop is removed; the promise write
   and menu construction remain.

5. **No file rename is caused by this task.** `LinksListView.ts` still uses React for its tooltip
   value bridge; `LinksTilesView.ts` and `FolderItemView.ts` are already `.ts`; and the `.tsx`
   pass-through faces retain their React return types. No JSX-free rename is needed.

6. **The dual arms remain deliberately.** Do not change `ContextMenuEvent.fromNativeEvent` or
   `getTraitDragDataFromEvent`, even though affected callers now provide native events.

## Acceptance Criteria

- [x] The nine measured `toPublicEvent` wraps and their native-to-React casts are removed.
- [x] `LinksListProps` and `LinksTilesProps` declare native `MouseEvent` / `DragEvent` callbacks
      for selection, context menu, drag-start override, and item drag events.
- [x] `FolderItemProps.onSelectedIconClick` is a native `MouseEvent` callback and receives the
      native listener event directly.
- [x] Category selection and drag-start callers are retyped atomically; their existing native
      member reads and behavior remain unchanged.
- [x] Link-item context-menu callers read/write `contextMenuPromise` directly on native events.
- [x] `CategoryEditor.tsx` remains an unadapted direct forwarder and needs no event-member change.
- [x] The three `Parameters<>` aliases are not hand-retyped; they are removed only because their
      casts are gone, and no `ContextMenuEvent` name collision remains.
- [x] `react-compat.ts` is byte-for-byte unchanged; the context-menu accessor remains dual-armed.
- [x] `getTraitDragDataFromEvent` has no React-typed caller after the preceding tree-provider work;
      its native-only collapse was completed in the epic close.
- [x] No file is renamed, no tests/harnesses are added, no commit is created, and
      `doc/active-work.md` is unchanged.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` are green.

## Files Changed Summary

| File | Status | Change |
|---|---|---|
| `src/renderer/editors/link-editor/LinksList.tsx` | Modify | Declare native selection, context-menu, drag-start, and item-drag callbacks. |
| `src/renderer/editors/link-editor/LinksTiles.tsx` | Modify | Declare the corresponding native tile callbacks. |
| `src/renderer/editors/link-editor/LinksListView.ts` | Modify | Remove four wraps/casts and pass native events directly. |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Modify | Remove four wraps/casts and obsolete derived aliases. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Modify | Complete native selection and drag-start caller types. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Modify | Forward native selection and drag-start event types. |
| `src/renderer/editors/link-editor/LinkItemList.tsx` | Modify | Retype context-menu handler and write native promise expando. |
| `src/renderer/editors/link-editor/LinkItemTiles.tsx` | Modify | Retype context-menu handler and write native promise expando. |
| `src/renderer/ui/sidebar/FolderItemView.ts` | Modify | Retype selected-icon callback and remove one wrap/cast. |
| `src/renderer/editors/category/CategoryEditor.tsx` | No change | Directly forwards the shared bundle; no event member is read. |
| `src/renderer/ui/sidebar/MenuBarView.ts` | No change | Its callback consumes only the folder argument. |
| `src/renderer/uikit/shared/react-compat.ts` | No change | E8-7 and US-1098 boundary; byte-for-byte preserved. |
| `src/renderer/core/events/context-menu.ts` | No change | Dual-armed accessor remains until US-1098. |
| `src/renderer/core/traits/dnd.ts` | Follow-up close | The last React caller was removed here; the accessor was collapsed in the epic close. |
| `src/renderer/ui/sidebar/FolderItem.tsx` | No change | React-facing `mountVanilla` pass-through remains. |
| `doc/active-work.md` | No change | Explicit task constraint. |
