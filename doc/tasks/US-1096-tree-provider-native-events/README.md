# US-1096 — Tree-provider native DOM events

## Goal

Retype the tree-provider event props and handlers in the native shell to DOM event types, remove
the five measured `toPublicEvent` call sites and their casts, and preserve the native
`contextMenuPromise` / `contextMenuEvent` expandos. The task is implemented as a single green,
typechecked change.

This task does not add tests, modify `doc/active-work.md`, or create a commit.

## Background

EPIC-066 E8-11 settles the seam: a `mountVanilla(View, props)` face receives the native DOM event.
Retype the shared prop, delete the wrap and cast, and update the caller's handler parameter. Do not
use a union, normalising accessor, boundary adapter, or a cast asserting a native event is a React
event.

The E8-8 correction makes the prop and its callers one atomic change. The two view implementations
already have `.ts` extensions; their React imports are not evidence that their event values are
React events. `CategoryViewImpl` uses `mountReactHandle` at lines 309–314 for the genuine
`renderItems` React island. That bridge remains untouched under Rule 1.

### Measured direct scope

The five direct wraps supplied for this task are:

| File and line | Current cast | Native callback fed |
|---|---|---|
| `src/renderer/components/tree-provider/CategoryViewImpl.ts:211` | `as unknown as React.MouseEvent<HTMLDivElement>` | `CategoryViewModel.onBackgroundContextMenu` |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts:217` | `as unknown as React.KeyboardEvent<HTMLDivElement>` | `CategoryViewModel.onKeyDown` |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts:235` | `as unknown as React.DragEvent` | `CategoryViewModel.onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop` through `publicDragEvent` |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:101` | `as unknown as React.MouseEvent<HTMLDivElement>` | `TreeProviderViewModel.onBackgroundContextMenu` |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:406` | `as unknown as React.KeyboardEvent<HTMLDivElement>` | `TreeProviderViewModel.onTreeKeyDown` |

`CategoryViewImpl.publicDragEvent()` is only a facade helper; delete it and pass each native
`DragEvent` directly. Do not touch the `mountReactHandle` / `renderItems` bridge.

## Caller census and event-member verification

The following census separates vanilla listeners/models from the JSX forwarding site and records
every event member read in the affected chains. `nativeEvent` is the expected React-only read being
removed; no handler reads `persist`, `isPropagationStopped`, or `isDefaultPrevented`.

| Prop / handler | File and line | Caller kind | Members read | Native verification |
|---|---|---|---|---|
| `CategoryViewModel.onBackgroundContextMenu` | `src/renderer/components/tree-provider/CategoryViewImpl.ts:208-212` | Vanilla DOM listener | none | It forwards the `contextmenu` listener's native `MouseEvent`. |
| `CategoryViewModel.onBackgroundContextMenu` | `src/renderer/components/tree-provider/CategoryViewModel.ts:672-681` | Vanilla model handler | `nativeEvent.contextMenuEvent` before the change; `contextMenuEvent` after it | `types/events.d.ts:3-8` augments native `MouseEvent` with `contextMenuEvent?: ContextMenuEvent<unknown>`. The subsequent `target` read is on `ContextMenuEvent`, not on the React event. |
| `CategoryViewModel.onKeyDown` | `src/renderer/components/tree-provider/CategoryViewImpl.ts:214-218` | Vanilla DOM listener | none | It forwards the native `KeyboardEvent`. |
| `CategoryViewModel.onKeyDown` | `src/renderer/components/tree-provider/CategoryViewModel.ts:355-378` | Vanilla model handler | `target`, `ctrlKey`, `altKey`, `shiftKey`, `key`, `preventDefault()` | All are members of native `KeyboardEvent`; `target` is narrowed to `HTMLElement`. |
| Category root drag handlers | `src/renderer/components/tree-provider/CategoryViewImpl.ts:220-230` | Vanilla DOM listeners | none | Each listener supplies the native `DragEvent`. |
| `CategoryViewModel.onDragEnter` | `src/renderer/components/tree-provider/CategoryViewModel.ts:490-500` | Vanilla model handler | `dataTransfer`, `preventDefault()`, `dataTransfer.dropEffect` | All are native `DragEvent` / `DataTransfer` members. |
| `CategoryViewModel.onDragOver` | `src/renderer/components/tree-provider/CategoryViewModel.ts:506-510` | Vanilla model handler | `dataTransfer`, `preventDefault()`, `dataTransfer.dropEffect` | All are native. |
| `CategoryViewModel.onDragLeave` | `src/renderer/components/tree-provider/CategoryViewModel.ts:512-526` | Vanilla model handler | none (`_e` is unused) | Native `DragEvent` is accepted but no member is read. |
| `CategoryViewModel.onDrop` | `src/renderer/components/tree-provider/CategoryViewModel.ts:539-547` | Vanilla model handler | `preventDefault()`, `stopPropagation()`, `dataTransfer` indirectly through `getTraitDragDataFromEvent(e)` | All exist on native `DragEvent`; the dual-armed helper remains unchanged. |
| `CategoryItemsRendererProps.onContextMenu` | `src/renderer/components/tree-provider/CategoryViewImpl.ts:344-363,461-463` | Vanilla-to-React-island callback | none | The callback only forwards the native event and item to `CategoryViewModel.onItemContextMenu`. |
| `CategoryItemsRendererProps.onContextMenu` | `src/renderer/editors/category/CategoryEditor.tsx:116-140`, especially `:126` | JSX caller / forwarder | none | `itemProps.onContextMenu` is copied into `commonProps`; `CategoryEditor` does not declare or read an event parameter. Its contract becomes `(event: MouseEvent, item: ITreeProviderItem)`. The `<LinksList>` / `<LinksTiles>` event facades belong to their separate US-1097 chain; this task does not move their remaining wraps. |
| `CategoryViewModel.onItemContextMenu` | `src/renderer/components/tree-provider/CategoryViewModel.ts:603-650` | Vanilla model handler | `nativeEvent.contextMenuPromise` before the change; `contextMenuPromise` after it | `MouseEvent.contextMenuPromise` is the global native expando declared in `types/events.d.ts`; the promise protocol remains intact. |
| `TreeProviderViewModel.onBackgroundContextMenu` | `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:97-103` | Vanilla DOM listener | none | It forwards the native `MouseEvent`. |
| `TreeProviderViewModel.onBackgroundContextMenu` | `src/renderer/components/tree-provider/TreeProviderViewModel.ts:843-851` | Vanilla model handler | `nativeEvent.contextMenuEvent` before the change; `contextMenuEvent` after it | The expando exists on native `MouseEvent`; the `target` read is on the stored context-menu event. |
| `TreeProviderViewModel.onTreeKeyDown` | `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:405-418` | Vanilla DOM listener / handler | `target`, `ctrlKey`, `altKey`, `shiftKey`, `key`, `preventDefault()`, `stopPropagation()` | All are native `KeyboardEvent` members. The existing search-specific checks remain unchanged. |
| `TreeProviderViewModel.onTreeKeyDown` | `src/renderer/components/tree-provider/TreeProviderViewModel.ts:742-800` | Vanilla model handler | `target`, `ctrlKey`, `altKey`, `shiftKey`, `key`, `preventDefault()`, `stopPropagation()` | All are native. |
| `TreeProviderViewModel.onItemContextMenu` | `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:399-403` | Vanilla Tree callback | none | It forwards the event and node only. Its parameter must become `MouseEvent`, not `React.MouseEvent<HTMLDivElement>`. |
| `TreeProviderViewModel.onItemContextMenu` | `src/renderer/components/tree-provider/TreeProviderViewModel.ts:806-840` | Vanilla model handler | `nativeEvent.contextMenuPromise` before the change; `contextMenuPromise` after it | The expando is native. `ContextMenuEvent.fromNativeEvent` continues to receive the event and retains its dual arm. |

There are no genuinely React-only members in the affected handlers. The `CategoryEditor` JSX site
is a forwarding caller, not a handler body, and reads no event member.

For the requested hand-off count, the three caller/forwarder files in the measured
`components/tree-provider` chain are `CategoryViewImpl.ts`, `TreeProviderViewImpl.ts`, and
`editors/category/CategoryEditor.tsx`. The UIKit Tree files listed below are event-contract and
listener plumbing, not additional measured tree-provider caller files.

US-1095 deliberately deferred `onItemContextMenu` as a separate prop chain. US-1096 owns it
because the tree-provider chain reaches the Tree row callback and its native-event boundary; the
atomic change therefore includes the Tree contract and listener plumbing below.

### The `Tree` row callback and `applyRestProps`

The `TreeProviderViewImpl.onItemContextMenu` callback is currently typed as a React event and is
passed through `TreeView.itemProps()` into `TreeItemView` as `onContextMenu`. `TreeItemView` leaves
that property in `rest` and therefore sends it through `applyRestProps`, whose listener invokes
`toPublicEvent`.

This is a real boundary, not a reason to keep the wrong prop type. The implementation must make the
row callback an owned native listener before handing residual props to `applyRestProps`:

- `src/renderer/uikit/Tree/types.ts`: redeclare `onItemContextMenu` with native `MouseEvent`.
- `src/renderer/uikit/Tree/TreeView.ts`: pass the native callback into the row view without a
  React event annotation.
- `src/renderer/uikit/Tree/TreeItem.ts`: exclude/redeclare the owned `onContextMenu` callback as
  native while preserving the pass-through face.
- `src/renderer/uikit/Tree/TreeItemView.ts`: consume `onContextMenu` before `...rest`, install and
  remove its native listener alongside the row view lifecycle, and leave all other rest props on
  `applyRestProps`.

`src/renderer/uikit/shared/react-compat.ts` remains unchanged. After this extraction no retyped
callback reaches `applyRestProps`; `applyRestProps`, `clearRestListeners`, and `bindRef` remain
E8-7 compatibility helpers.

## Protocol and accessor census

`src/renderer/types/events.d.ts:3-8` declares `contextMenuEvent` and `contextMenuPromise` directly
on native `MouseEvent`. `src/renderer/api/internal/GlobalEventService.ts:93-99` reads those same
properties directly from its native `PointerEvent`; this is the established protocol.

The four current `.nativeEvent` hops are:

| File and line | Before | After |
|---|---|---|
| `CategoryViewModel.ts:647` | `e.nativeEvent.contextMenuPromise` | `e.contextMenuPromise` |
| `CategoryViewModel.ts:673` | `e.nativeEvent.contextMenuEvent` | `e.contextMenuEvent` |
| `TreeProviderViewModel.ts:840` | `e.nativeEvent.contextMenuPromise` | `e.contextMenuPromise` |
| `TreeProviderViewModel.ts:844` | `e.nativeEvent.contextMenuEvent` | `e.contextMenuEvent` |

`ContextMenuEvent.fromNativeEvent` at `src/renderer/core/events/context-menu.ts:62` must retain
`"nativeEvent" in event ? event.nativeEvent : event`. This task does not remove its last
React-typed caller: browser, link-editor, pinned-link, and other handlers still pass React-shaped
events. US-1098 owns the single-arm collapse.

`getTraitDragDataFromEvent` at `src/renderer/core/traits/dnd.ts:88-91` has only two call sites:
`CategoryViewModel.ts:545` and `uikit/Tree/TreeDndModel.ts:118`. The latter already supplies a
native `DragEvent`; after the Category model handlers are retyped, this task removes the last
React-typed caller. Leave the union and the dual-arm accessor in place anyway; US-1098 owns its
collapse and must verify the full close measurement.

## Implementation Plan and Result

### 1. Retype CategoryView contracts and remove the three root/drag facades

- In `src/renderer/components/tree-provider/CategoryViewModel.ts`, change the event parameters of
  `CategoryItemsRendererProps.onContextMenu`, `onDragEnter`, `onDragOver`, `onDragLeave`, and
  `onItemDrop` to native `MouseEvent` / `DragEvent` types. Change `onKeyDown`, the four model drag
  handlers, `onItemContextMenu`, and `onBackgroundContextMenu` to native event types.
- In `src/renderer/components/tree-provider/CategoryViewImpl.ts`, remove the `toPublicEvent` import,
  pass the root `MouseEvent` / `KeyboardEvent` directly, delete `publicDragEvent()`, and pass each
  root `DragEvent` directly to the model. Retype `onItemContextMenu` and the four item-drag
  forwarding handlers to match the native callback contract. Preserve the genuine
  `mountReactHandle` bridge and all `React.createElement` rendering.
- In `src/renderer/components/tree-provider/CategoryViewModel.ts`, replace only the four expando
  hops listed above; do not remove the async `linkContextMenu.sendAsync` promise assignment.

Before → after:

```ts
// Before
this.model.onBackgroundContextMenu(
    toPublicEvent(event) as unknown as React.MouseEvent<HTMLDivElement>,
);
private publicDragEvent(event: DragEvent): React.DragEvent {
    return toPublicEvent(event) as unknown as React.DragEvent;
}
e.nativeEvent.contextMenuPromise = promise;

// After
this.model.onBackgroundContextMenu(event);
this.model.onDragEnter(null, event);
e.contextMenuPromise = promise;
```

### 2. Retype TreeProvider root, keyboard, and row callers

- In `src/renderer/components/tree-provider/TreeProviderViewModel.ts`, change
  `onTreeKeyDown`, `onItemContextMenu`, and `onBackgroundContextMenu` to native event parameters;
  replace the two `.nativeEvent` hops with direct native expando reads.
- In `src/renderer/components/tree-provider/TreeProviderViewImpl.ts`, remove the `toPublicEvent`
  import, pass the root context event directly, call `onTreeKeyDown(event)` directly, and retype
  the `onItemContextMenu` handler at lines 399–403 to `MouseEvent`.
- Preserve all key gating, context-menu item construction, selection behavior, and async promise
  handling.

Before → after:

```ts
// Before
const publicEvent = toPublicEvent(event) as unknown as React.KeyboardEvent<HTMLDivElement>;
if (this.model.onTreeKeyDown(publicEvent)) return;
e.nativeEvent.contextMenuPromise = promise;

// After
if (this.model.onTreeKeyDown(event)) return;
e.contextMenuPromise = promise;
```

### 3. Make the Tree row callback native without changing react-compat

Implement the owned `TreeItem` listener extraction described in the `applyRestProps` section.
The callback must be consumed before residual rest props are assembled, and its native listener
must be removed during disposal. Do not change `applyRestProps`, `clearRestListeners`, `bindRef`,
or the `toPublicEvent` helper. The existing `RestRequestTreeView.ts:105` callback has no event
parameter and remains valid.

### 4. Retype the category JSX forwarder

- In `src/renderer/editors/category/CategoryEditor.tsx:116-140`, keep the `commonProps` forwarding
  unchanged at runtime. Its `onContextMenu` value now has the native
  `(event: MouseEvent, item: ITreeProviderItem) => void` contract; no event parameter or member
  read is added to `CategoryEditor`.
- Do not rename any file as a consequence of this task. The two JSX-free
  `mountVanilla` faces, `src/renderer/components/tree-provider/CategoryView.tsx` and
  `TreeProviderView.tsx`, were already JSX-free before US-1096 and remain deliberately untouched.
  `CategoryViewImpl.ts` and `TreeProviderViewImpl.ts` are already `.ts`.

### 5. Verify the implementation

- Run `npm run typecheck` (`tsc --noEmit`) and require it to be green.
- Run `npm run lint` and require a clean result.
- Add no tests or harnesses, create no commit, leave `doc/active-work.md` unchanged, and leave
  `src/renderer/uikit/shared/react-compat.ts`, `src/renderer/core/events/context-menu.ts`, and
  `src/renderer/core/traits/dnd.ts` unchanged.

## Concerns

1. **The async context-menu protocol is load-bearing.** The expando writes are not dead React
   compatibility. They are awaited by `GlobalEventService.handleContextMenu`; only the
   `.nativeEvent` hop disappears.

2. **The context-menu accessor is not ready to collapse.** This task does not remove the last
   React-shaped input to `ContextMenuEvent.fromNativeEvent`; US-1098 must collapse it only after
   the browser, link-editor, pinned-link, and other callers are native.

3. **The DnD accessor has no remaining React caller after this task, but stays dual-armed.** The
   full accessor cleanup is explicitly handed to US-1098 so that its close task owns the final
   measurement and deletion decision.

4. **The Tree row callback otherwise re-enters the synthetic-event seam.** Its current
   `TreeItemView` rest-prop path calls `toPublicEvent` inside `applyRestProps`. Extracting this one
   owned callback keeps the helper unchanged while making the retyped callback genuinely native.

5. **CategoryEditor is a JSX forwarder into a genuine React island.** It reads no event member and
   must not gain an adapter. The `LinksList` / `LinksTiles` contracts and their remaining direct
   wrappers are the US-1097 link-editor chain; `CategoryViewImpl`'s `mountReactHandle` bridge at
   lines 309–314 remains out of scope.

6. **The JSX-free wrapper population is separate cleanup.** `CategoryView.tsx` and
   `TreeProviderView.tsx` are JSX-free `mountVanilla` faces, but that was true before this task.
   A deliberate future JSX-free-`.tsx` sweep may rename them; US-1096 leaves them alone. No file
   becomes rename-eligible because of the event changes here.

7. **No handler reads a React-only member.** The census found no `persist`,
   `isPropagationStopped`, or `isDefaultPrevented` use, so no compatibility decision is required.

## Acceptance Criteria

- [x] The five supplied `toPublicEvent` call sites and all five associated native-to-React casts are
      removed.
- [x] Category root context, keyboard, drag, item-context, and item-drag callbacks use native
      `MouseEvent`, `KeyboardEvent`, and `DragEvent` types with no unions, adapters, normalising
      accessors, or native-to-React assertions.
- [x] `TreeProviderViewImpl.onItemContextMenu` and its model callback use native `MouseEvent`; the
      owned Tree row listener no longer sends that callback through `applyRestProps`.
- [x] The four expando reads are direct `e.contextMenuPromise` / `e.contextMenuEvent` reads, and
      the asynchronous `linkContextMenu` protocol remains behaviorally unchanged.
- [x] No affected handler reads `persist`, `isPropagationStopped`, or `isDefaultPrevented`.
- [x] `ContextMenuEvent.fromNativeEvent` remains dual-armed; its collapse is explicitly deferred to
      US-1098.
- [x] `getTraitDragDataFromEvent` has no React-typed caller after this task; its native-only
      collapse was completed in the epic close, while the context-menu accessor remains dual-armed.
- [x] `CategoryEditor.tsx:126` remains a forwarding JSX caller and reads no event member.
- [x] No file rename is caused by this task. `CategoryView.tsx` and `TreeProviderView.tsx` remain
      untouched as pre-existing JSX-free `mountVanilla` faces; `CategoryViewImpl.ts` and
      `TreeProviderViewImpl.ts` are already `.ts`. `CategoryEditor.tsx` remains `.tsx` because it
      has JSX, and the `renderItems` React island remains untouched.
- [x] No retyped callback reaches `applyRestProps`; `react-compat.ts` is unchanged.
- [x] `npm run typecheck` is green and `npm run lint` is clean.
- [x] No tests or harnesses are added, no commit is created, and `doc/active-work.md` is unchanged.

## Files Changed Summary

| File | Status | Change |
|---|---|---|
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Modify | Delete three facade paths; pass native root and drag events; retype item forwarders; preserve the React island. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Modify | Retype category event props/handlers; read native context-menu expandos directly. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Modify | Delete root context/keyboard facades; retype the row callback. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Modify | Retype keyboard/context handlers; read native expandos directly. |
| `src/renderer/editors/category/CategoryEditor.tsx` | Modify | Preserve JSX forwarding with the native category callback contract; no event read is added. |
| `src/renderer/uikit/Tree/types.ts` | Modify | Declare the owned row context callback with native `MouseEvent`. |
| `src/renderer/uikit/Tree/TreeView.ts` | Modify | Forward the native row callback without a React event annotation. |
| `src/renderer/uikit/Tree/TreeItem.ts` | Modify | Declare/exclude the owned native `onContextMenu` prop. |
| `src/renderer/uikit/Tree/TreeItemView.ts` | Modify | Install the owned native row listener before residual rest props. |
| `src/renderer/uikit/shared/react-compat.ts` | No change | E8-7 non-goal; rest helpers remain unchanged. |
| `src/renderer/core/events/context-menu.ts` | No change | Dual arm remains until US-1098. |
| `src/renderer/core/traits/dnd.ts` | Follow-up close | The last React caller was removed here; the accessor was collapsed to native in the epic close. |
| `src/renderer/components/tree-provider/CategoryView.tsx` | No change | Pre-existing JSX-free `mountVanilla` face; future JSX-free sweep only. |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | No change | Pre-existing JSX-free `mountVanilla` face; future JSX-free sweep only. |
| `doc/active-work.md` | No change | Explicit task constraint. |
