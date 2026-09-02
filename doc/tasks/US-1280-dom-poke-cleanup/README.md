# US-1280: UIKit DOM-poke cleanup

Epic: [EPIC-081 — DOM & IO mechanisms](../../epics/EPIC-081.md)

## Goal

Remove two UIKit layering violations without expanding the residue task: read Menu row nodes
from the `KeyedList` the view owns, and route Tree root focus from `TreeModel` through a callback
registered by `TreeView`.

## Background

Verified source at the current checkout (the epic's baseline is commit `d44ab072`):

- `src/renderer/uikit/Menu/MenuView.ts:125-138` updates its `KeyedList`, then queues a microtask
  solely to query its own list DOM for the hovered row using a constructed
  `[data-type="menu-row"][data-id="..."]` selector.
- `src/renderer/uikit/shared/keyed-list.ts:9-13,111-113` stores each record's `element`, and
  `KeyedList.get(key)` already returns that element. No `KeyedList` API addition is needed.
  Because `syncStructure()` calls `keyedList.update(prepared)` before the hovered-row logic,
  `this.keyedList?.get(hoveredId)` is available synchronously and removes the reason for the
  microtask.
- `src/renderer/uikit/Tree/TreeModel.ts:80-89` already receives view-owned resources through
  setter/ref fields such as `setGridRef`; `:741-745` nevertheless calls
  `document.getElementById(this.rootId)?.focus()` from the model and defends it with a stale
  comment. `src/renderer/uikit/CLAUDE.md` forbids model DOM queries.
- `src/renderer/uikit/Tree/TreeView.ts:319,323` shows the existing model/view handoff pattern.
  `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:480,489,498` are every caller of
  `focusRoot`; all three already call the live Tree model, so retaining that model API while
  changing its implementation to invoke a view-registered callback covers all callers.

The callback-unset case is also behavior-preserving. Before `TreeView.onMount()` registers the
callback, or after disposal clears it, `TreeModel.focusRoot()` will silently no-op. Today the
document query likewise silently no-ops when the model's root is not present in the document.
`TreeProviderViewImpl` does not call the model when its optional `treeView` is absent, and its
three existing calls are made against the mounted live Tree; once mounted, the callback points at
that TreeView's root.

Before the Menu change:

```ts
this.keyedList?.update(prepared);
// ...
queueMicrotask(() => {
    if (!this.model.isLive || !this.listRoot || !hoveredId) return;
    const row = this.listRoot.querySelector(
        `[data-type="menu-row"][data-id="${CSS.escape(hoveredId)}"]`,
    ) as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
});
```

After:

```ts
this.keyedList?.update(prepared);
// ...
if (hoveredId) this.keyedList?.get(hoveredId)?.scrollIntoView({ block: "nearest" });
```

Before the Tree focus change:

```ts
/** Focus the tree root (the keyboard-nav tab stop). The root already carries
 *  `id={rootId}`, so no extra ref plumbing is needed. */
focusRoot = () => {
    document.getElementById(this.rootId)?.focus();
};
```

After:

```ts
/** Focus the tree root through the callback installed by `TreeView`; no-op outside its view lifetime. */
focusRoot = () => {
    this.focusRootRef?.();
};
```

## Implementation Plan

1. Update `src/renderer/uikit/Menu/MenuView.ts` in `MenuContentView.syncStructure()` so the
   `KeyedList.update(prepared)` call remains first, then synchronously obtain the hovered row with
   `this.keyedList?.get(hoveredId)` and call `scrollIntoView({ block: "nearest" })`. Remove the
   hovered-row `queueMicrotask` at current line 132 and its `listRoot.querySelector`, including the
   now-unused `CSS.escape` path. Keep the separate mount-time focus microtask at current line 96,
   the `hoveredId !== this.lastHoveredId` change gate, and the existing optional missing-record
   behavior.

2. Do not alter `src/renderer/uikit/shared/keyed-list.ts`: its private record already stores
   `element`, and its public `get(key)` at `:111-113` returns that node. The synchronous read is valid because
   `KeyedList.update()` completes create/order/update before returning, and the hovered id is a
   key produced by `MenuModel.prepared`.

3. Update `src/renderer/uikit/Tree/TreeModel.ts` to add
   `focusRootRef: (() => void) | null` and `setFocusRootRef(ref)` beside `gridRef`, matching the
   existing `setGridRef` pattern. Change `focusRoot()` to invoke only that callback. Rewrite the
   comment so it no longer defends a model DOM query and states that focus is routed through
   `TreeView`.

4. Update `src/renderer/uikit/Tree/TreeView.ts` to register a stable callback that calls
   `this.root.focus()` once the view is mounted, and clear it during disposal. Follow the existing
   `setGridRef(grid.model)` / `setGridRef(null)` registration and release pattern, reserving the
   callback cleanup before the existing `driver.dispose()` cleanup so the model never retains a
   view callback after the view's DOM branch is released.

5. Leave every caller in `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` unchanged:
   `:480`, `:489`, and `:498` are the complete caller list and all invoke the retained
   `this.treeView?.model.focusRoot()` method. The optional chain handles the absent-view case;
   when a model exists without a mounted view callback, `focusRoot()` is an intentional silent
   no-op matching today's missing-`getElementById` behavior.

## Concerns

- The `KeyedList` record type is private, but its public `get(key)` at `keyed-list.ts:111-113`
  already exposes exactly the node needed. Adding a record-node accessor or changing the helper
  API would be unnecessary.
- The microtask is not a general lifecycle deferral: it exists only because the old code had to
  query for a node after the list update. `KeyedList.update()` makes the node available before
  `syncStructure()` continues, so removing the microtask preserves the scroll point while making
  the ownership boundary explicit.
- `TreeModel` must not retain a DOM element or query the document. A callback is the minimal
  existing-pattern extension; `TreeView` owns its root and nulls the callback when disposed.
- `TreeProviderViewImpl.ts` is a caller-verification file, not a planned behavior edit. Keep this
  droppable residue task limited to the two UIKit layering fixes.
- No CSS, color token, scheduler, unit test, or test harness is part of this task.

## Acceptance Criteria

- [x] `MenuView.ts` deletes the hovered-row `queueMicrotask` at `:132` and its attribute-string
  `querySelector`; it reads the node from `KeyedList.get(hoveredId)` after `update(prepared)` and
  scrolls it synchronously. The unrelated mount-time focus microtask remains.
- [x] `keyed-list.ts` is unchanged because its existing `get()` API and record element satisfy the
  requirement.
- [x] `TreeModel.focusRoot()` contains no document query and invokes only the view-provided
  callback; its stale DOM-query defense comment is replaced.
- [x] `TreeView` installs and clears `focusRootRef` using the same model/view handoff lifetime as
  `gridRef`, with callback cleanup ordered before `driver.dispose()`.
- [x] Every current caller is accounted for: the complete three-call list in
  `TreeProviderViewImpl.ts` is `:480`, `:489`, and `:498`; each focuses the mounted Tree through
  the callback, while an unset callback is a documented silent no-op matching current behavior.
- [x] No unrelated residue, CSS, color, scheduling, tests, or test harnesses are added, and
  `doc/active-work.md` is not edited.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/uikit/Menu/MenuView.ts` | Replace the self-DOM query and microtask with synchronous `KeyedList.get()` access. | Implementation |
| `src/renderer/uikit/Tree/TreeModel.ts` | Add a nullable view focus callback and route `focusRoot()` through it; fix the stale comment. | Implementation |
| `src/renderer/uikit/Tree/TreeView.ts` | Register and clear the root-focus callback using the existing ref handoff pattern. | Implementation |
| `src/renderer/uikit/shared/keyed-list.ts` | No change; `get(key)` already exposes the managed node. | No change planned |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | No change; all three callers use the retained model method and are covered by the callback. | No change planned |
| `src/renderer/uikit/CLAUDE.md` | No change; its model-DOM prohibition is the rule this task enforces. | No change |
| `doc/epics/EPIC-081.md` | No change; correction 6 and the residue scope are authoritative. | No change |
| `doc/active-work.md` | No change per the request; the existing epic dashboard remains user-maintained. | No change |

Files that need **no changes** in US-1280:

- `src/renderer/uikit/shared/keyed-list.ts` — the existing public `get()` is sufficient.
- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` — all three callers remain
  valid through the retained `TreeModel.focusRoot()` API.
- `src/renderer/uikit/Tree/Tree.css` and all other CSS/theme files — neither fix changes styling.
- Tests and test harnesses — none are added under the project rules.
