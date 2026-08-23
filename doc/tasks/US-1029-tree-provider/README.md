# US-1029: Tree primitive seams for tree-provider

**Status:** Implemented
**Epic:** [EPIC-058 - De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Depends on:** [US-1026 - components/icons vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md), [US-1028 - file-search and VirtualGrid collection](../US-1028-file-search/README.md), and the existing vanilla `Tree`/`TreeItem` views
**Blocks:** [US-1037 - `TreeProviderView`](../US-1037-tree-provider-view/README.md) and [US-1038 - `CategoryView`](../US-1038-category-view/README.md)

## Goal

Add the small, additive Tree contracts required by the tree-provider conversions. This task does
not convert either `TreeProviderView` or `CategoryView`, does not change their callers, and does
not introduce a second tree implementation. It makes direct DOM icons, chevron suppression,
trailing content, and per-row context menus expressible through the existing Tree/TreeItem path.

## Background and verified inventory

`src/renderer/components/tree-provider/` has 14 tracked files and 3,560 lines, but the two
rendered views are deliberately out of scope here. The current `TreeProviderView` supplies a
custom `renderItem` because the default Tree path cannot currently express four row-level facts:

| Current `renderItem` value | Required seam |
|---|---|
| `icon` from `tpvNodeTraits` | `getIconElement(item, level)` → `iconElement?: Node`, in addition to the React `icon` arm |
| `hideChevron={ctx.level === 0}` | `getHideChevron(item, level)` → `hideChevron?: boolean` on the row projection |
| `trailing={renderTrailing?.(node.data)}` | `renderTrailing(item, level)` → `trailing?: React.ReactNode`, retained as a compatibility slot |
| `onContextMenu={(e) => model.onItemContextMenu(node, e)}` | `onItemContextMenu(item, level, event)`, bound on each row root |

The existing `getTooltip` path already carries `node.data.href`, so no new tooltip seam is needed.
The per-row context menu is not equivalent to `TreeProps.getContextMenu`: the provider model first
updates selection, creates `ContextMenuEvent.fromNativeEvent(e, "tree-provider-item")`, stamps
`ctxEvent.target`, and attaches the asynchronous `contextMenuPromise`. The background handler then
reads that stamped native event to avoid opening a folder menu twice. The row handler must remain a
real row listener and must run before the root background handler through normal bubbling.

`createTreeProviderItemIconElement(item)` already returns the direct DOM equivalent of
`TreeProviderItemIcon`. `TreeItemView` already has a slot host and identity-preserving slot update
patterns, while `TreeView.itemProps()` is the narrow projection point where the new fields can be
forwarded to pooled rows.

The provider tree currently has no favicon subscription. `TreeProviderItemIcon` reads
`getFaviconPathSync()` during a parent render, and the provider tree is not a `useFavicons()`
consumer. This task preserves that existing gap; it does not add `onFaviconReady` or a new disk
warm-up path. File/system/board icon invalidation through `subscribeFileIconElements()` remains a
separate, existing direct-element contract for the later provider view.

## Implementation plan

### 1. Freeze the additive boundary

- Re-read `src/renderer/uikit/Tree/types.ts`, `TreeView.ts`, and `TreeItemView.ts` and record the
  exact exported types before editing.
- Preserve all existing React-facing `icon`, `label`, tooltip, and event props. New fields are
  optional and must not require changes in current Tree, ListBox, or editor callers.
- Do not edit `TreeProviderView`, `CategoryView`, their models, or any production caller here.

### 2. Add the direct icon arm

- Add `iconElement?: Node` to `TreeItemProps`/`TreeItemViewProps`, plus the
  `getIconElement(item, level)` projection on `TreeProps`. Keep `icon?: IconRef` unchanged for
  existing React callers.
- Make `TreeView.itemProps()` forward the node arm to the row and let `TreeItemView` prefer it
  when present. Use the existing slot identity gate: an unchanged node remains attached, while a
  changed node is released and replaced. Do not cast `Element` to `ReactNode` and do not wrap the
  node merely to satisfy a type.
- Keep the direct node separate from `IconRef`; a future provider view will pass
  `createTreeProviderItemIconElement(...)` here without creating a React root per row.

### 3. Add chevron suppression and trailing content

- Add `getHideChevron(item, level)` and `renderTrailing(item, level)` projections to `TreeProps`,
  forwarding their results as `hideChevron` and `trailing` through `TreeView` into the existing
  `TreeItemView` behavior. The default remains the current visible-chevron behavior; the provider
  view will use the former for level-zero rows. Keep the trailing React arm because
  `ExplorerSecondaryView` supplies the live `renderTrailingAction` callback. A later vanilla owner
  may pass a `Node` through a separate slot path, but this task must not pretend arbitrary React
  content is DOM content.
- Preserve the slot host and identity behavior so an unchanged trailing node is not unmounted and
  recreated on every pooled-row update.

### 4. Add the per-row context-menu seam

- Add `onItemContextMenu(item, level, event)` to `TreeProps` and project it as the row's existing
  public `onContextMenu` prop. `applyRestProps` supplies the project's native/public event bridge;
  no model signature is weakened and `getContextMenu` is not involved.
- Bind it on the row root, before the Tree cell/root background handlers can observe the bubbling
  event. The callback must be able to preserve `preventDefault`, `stopPropagation`, the stamped
  `nativeEvent.contextMenuEvent`, and the asynchronous `contextMenuPromise` contract.
- Keep `getContextMenu` unchanged for ordinary Tree callers. It remains a synchronous menu-item
  factory and is not a substitute for provider selection and event-channel behavior.

### 5. Verify the seam in isolation

- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Use the existing Tree story (or a minimal story-only fixture) to exercise a row with and without
  a direct icon node, a level-zero hidden chevron, trailing content, and a row context-menu
  callback. Confirm ordinary React icon callers are unchanged.
- Confirm the direct node is retained across an unchanged pooled-row update and released exactly
  once when replaced or disposed.
- Re-scan all Tree consumers and confirm no caller was made to supply the new fields.
- Confirm no provider-view, menu-utility, favicon subscription, or `onFaviconReady` behavior was
  added by this seam task.

## Concerns / open questions

### 1. The direct icon type must remain additive

The helper returns `Element`, while the existing React icon contract is `IconRef`. The node arm is
the honest boundary: it avoids both a lying cast and a React root in every provider row. Do not
widen `IconRef` or make the whole Tree generic over DOM element types.

### 2. Callback precedence must be explicit

The new row handlers are component behavior, but existing residual handlers and public callbacks
must retain their current composition/order. Document whether the native row callback runs before
or after a caller callback, then test `preventDefault` and propagation with both present. Do not
let `applyRestProps` silently replace the provider context-menu path.

### 3. Pooled rows make node identity load-bearing

A pooled row survives item changes. The implementation must update the same icon/trailing node when
identity is unchanged and detach the old node before attaching a replacement. Adding listeners on
every update is not acceptable; use the existing per-row listener/record pattern where needed.

### 4. The React trailing arm is intentionally temporary

`renderTrailing` is live in production, so removing it would remove Explorer's action affordance.
Keep one compatibility slot and make its lifecycle explicit. US-1037 will verify it with the
provider caller; this task only makes the seam possible.

### 5. Context-menu order is a behavioral contract

`onItemContextMenu` and `onBackgroundContextMenu` share the same native event. A root-delegated row
handler would invert their order and can make folder background menus disappear. The row callback
must be attached at the row and tested through bubbling.

### 6. Provider-specific follow-up stays out of the seam

The provider trait icon accessor and provider action-menu icon values are converted with the
provider view in US-1037. The Category view-mode menu is converted with the Category view in
US-1038. Keeping those edits with their owning views makes this task an independently reviewable
UIKit contract change.

## Acceptance criteria

- [ ] Tree's existing public React icon behavior remains compatible.
- [ ] A resolved Tree item can carry an `iconElement?: Node` without an unsafe cast or nested
      React root, with identity-preserving replacement and disposal.
- [ ] A resolved Tree item can suppress its chevron and retain the current default behavior.
- [ ] A resolved Tree item can carry trailing React content without changing current slot shape.
- [ ] A resolved Tree item can receive a per-row context-menu callback whose event ordering and
      async context-menu fields remain observable to the provider model.
- [ ] `getContextMenu` remains unchanged and is not used to emulate provider row context menus.
- [ ] No production Tree caller requires a source change for the additive fields.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/uikit/Tree/types.ts` | Add additive Tree projections |
| `src/renderer/uikit/Tree/TreeItem.tsx` | Add the direct DOM icon arm to row props |
| `src/renderer/uikit/Tree/TreeView.ts` | Forward icon, chevron, trailing, and row context-menu seams |
| `src/renderer/uikit/Tree/TreeItemView.ts` | Apply direct icon and row-level callback behavior |
| `doc/active-work.md` | Keep the split task links current |
| `doc/epics/EPIC-058.md` | Keep the split boundary and ordering current |

`TreeProviderView.tsx`, `CategoryView.tsx`, both provider models, all callers, menu utilities, and
favicon-cache files remain outside this task.

## Related work

- [EPIC-058 - De-React Epic D](../../epics/EPIC-058.md)
- [US-1026 - Components/icons vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md)
- [US-1028 - File search and VirtualGrid collection](../US-1028-file-search/README.md)
- [US-1037 - `TreeProviderView`](../US-1037-tree-provider-view/README.md)
- [US-1038 - `CategoryView`](../US-1038-category-view/README.md)
