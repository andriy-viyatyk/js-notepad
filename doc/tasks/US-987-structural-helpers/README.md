# US-987: Keyed-list and subtree-swap helpers

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-053 — De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Add the two small DOM-structure primitives that a selector binding cannot provide: a keyed list
that creates, updates, removes, and reorders child nodes while preserving identity for unchanged
keys, and a conditional subtree swap that replaces one owned subtree with another without leaving
the old subtree mounted.

These helpers are framework-free view machinery for `uikit/shared/`. This task does not convert
`PathInput`, add an adapter, introduce virtualization, or change the React `Views` registry. The
keyed list is exercised by the later PathInput pilot (US-991); the subtree helper is prepared for
the conditional views that follow the pilot.

## Background

### Why `bind()` is not enough

US-986's `VanillaView.bind(state, selector, apply)` updates one named DOM field. It cannot express
the structural work performed by a React `.map()` or conditional branch:

```tsx
{suggestions.map((s, i) => (
    <SuggestionRow key={s.path} ...>{s.label}</SuggestionRow>
))}
```

The vanilla replacement must key by `s.path`, not by the array index. When the suggestion array
changes, an unchanged path keeps its existing row node and listeners; a new path gets one node;
and a removed path is detached and released. DOM order must still follow the current array order.

### Existing PathInput case

`src/renderer/uikit/PathInput/PathInput.tsx:136-152` is the only in-epic structural consumer
identified so far. The current React view keys rows by `s.path`, carries `role="option"` and
`data-active`, and wires `onMouseDown`, `onClick`, and `onMouseEnter`. The model keeps a row
reference for the active-row `scrollIntoView({ block: "nearest" })` path. US-991 will replace this
map with `KeyedList`, preserving those attributes, handlers, and per-key element references.

`PathInputModel.suggestions` is a memo over the input value, available paths, separator, and
maximum depth. The helper must not recompute that data, own model state, or schedule updates; it
receives the already-derived array from the view and only reconciles DOM structure.

### Existing references and boundaries

The av-grid `CellPool` is a reference for the identity-preserving idea, not an implementation
target. Its recycling and virtualization policy belongs to av-grid and is explicitly excluded by
EPIC-053 B9/B14. US-987 is the ordinary non-virtualized case: create, update in place, remove,
and order by key.

`src/renderer/uikit/shared/vanilla-view.ts` is the lifecycle owner from US-986. The helpers should
be registered with a view's `own()` disposer. They must not import React, ReactDOM, Emotion,
settings, app-layer modules, or the React `Views` registry, and they must not be exported through a
barrel before a real consumer needs one.

## Implementation plan

### 1. Add the keyed-list helper

Create `src/renderer/uikit/shared/keyed-list.ts` with a direct-importable `KeyedList` class and
its option types. Use a small generic surface equivalent to:

```ts
export interface KeyedListOptions<T, K extends PropertyKey, E extends Node = HTMLElement> {
    keyOf(item: T): K;
    create(item: T, index: number): E;
    update(element: E, item: T, index: number): void;
    remove?(element: E, item: T): void;
}

export class KeyedList<T, K extends PropertyKey, E extends Node = HTMLElement> {
    constructor(parent: Node, options: KeyedListOptions<T, K, E>);
    update(items: readonly T[]): void;
    get(key: K): E | undefined;
    clear(): void;
    dispose(): void;
}
```

Implement the reconciliation contract as follows:

- Keep the current records in a `Map<K, { element, item }>`; use the caller's stable key, never
  the array index, as identity.
- Reject duplicate keys before mutating the current list. A duplicate is a caller error and must
  throw a descriptive error rather than silently reuse one node twice.
- Run each update in this fixed phase order: validate all keys; call `remove(element, oldItem)`
  for keys absent from the new array and detach those nodes; call `create(item, index)` for missing
  keys; reconcile the surviving/new nodes into the requested order; then call
  `update(element, item, index)` for every new and retained record. This order means update
  callbacks see the final DOM order and no callback runs for a duplicate-key input.
- The order pass must be a minimal-move cursor walk, not an unconditional `insertBefore` loop. Walk
  incoming records from left to right while holding the expected next child. If that child is
  already the element for the expected key, advance the cursor without moving it; otherwise call
  `insertBefore(element, cursor)` (or append when the cursor is null), then advance past the
  element. Re-inserting an already-positioned node can blur focus, cancel transitions, and drop IME
  composition, so the helper must not do it.
- Do not use `innerHTML`, `replaceChildren`, or a full-container clear: the helper must preserve
  reused node identity and must not remove unrelated DOM owned by the caller. The constructor
  should therefore receive a dedicated container for the managed range.
- Run every removal callback and detach every removed node even if one callback throws; preserve and
  rethrow the first removal error after the cleanup pass. Removal must also occur when the helper is
  disposed with nodes still attached.
- Expose `get(key)` so a later view can keep a per-key row reference for commands such as
  `scrollIntoView`; the helper itself does not know about focus or scrolling.
- `update` after `dispose` is a no-op, and `clear`/`dispose` are idempotent. User callback errors
  propagate; duplicate-key validation happens before reconciliation so an invalid input cannot
  partially reorder the current DOM.
- `clear()` invokes the removal callback for every current key, detaches every managed node, and
  leaves the helper usable for a later `update()`. `dispose()` performs the same clear operation and
  then makes the helper permanently inert.

The helper owns only the managed nodes and optional removal callbacks. A `VanillaView` registers
`list.dispose` through `own()`; it does not make the list a second state or model layer.

### 2. Add the conditional subtree-swap helper

Create `src/renderer/uikit/shared/subtree-swap.ts` with a small stateful `SubtreeSwap` helper. Its
public shape should be equivalent to:

```ts
import type { IOwnedView } from "./vanilla-view";

export class SubtreeSwap<K extends PropertyKey> {
    constructor(parent: Node);
    set(key: K | null, create: (key: K) => IOwnedView): void;
    clear(): void;
    dispose(): void;
}
```

`IOwnedView` is the existing contract from `vanilla-view.ts`; do not introduce a second
`SubtreeHandle` interface or a second root type.

Define the swap behavior precisely:

- The parent is a dedicated container. `create` returns a detached `IOwnedView.root`; the helper
  inserts the new root before disposing/detaching the old one, so a synchronous swap has no empty
  interval and the old root's cleanup runs while its DOM is still available.
- `set` with the same key keeps the active subtree and does not call the factory. Updating an
  existing branch is the active view's responsibility; `set(null)` clears it.
- When the key changes, create the new handle first. If creation throws, the old branch remains
  active. If old disposal throws, detach it and retain the new branch, then rethrow the first
  cleanup error after the transition is complete.
- `clear` disposes and detaches the active view. `dispose` performs that operation once and then
  ignores later `set`/`clear` calls. `VanillaView.dispose()` deliberately does not detach its own
  root because its adapter owns that operation; these helpers do detach the nodes they manage
  because those nodes are the helpers' own resources.
- The caller registers the swap's `dispose` with its parent view's `own()` exactly once. The helper
  claims each view through the shared `claimViewOwnership` invariant before it takes the handle;
  it must not invent context lookup or adoption of arbitrary existing views.

This helper is deliberately a conditional branch primitive, not a general DOM renderer. It does
not diff descendants, accept React nodes, discover children from the DOM, or provide keyed-list
semantics internally.

### 3. Share the ownership invariant and keep the module boundary narrow

Export `claimViewOwnership(view: IOwnedView): void` from
`src/renderer/uikit/shared/vanilla-view.ts` and have `VanillaView.child()` call it. The helper
throws when the view was already claimed. `SubtreeSwap` calls the same function before attaching a
new active view, so ownership is enforced across modules rather than relying on a source comment.
The claim is one-way for the lifetime of a view; disposing a view does not make it adoptable by a
second owner.

Add source comments documenting the deliberate root-ownership asymmetry: `VanillaView.dispose()`
releases behavior but does not detach `view.root` because its adapter owns that ordering, while
`KeyedList` and `SubtreeSwap` detach the nodes they manage because those nodes are their own
resources.

Keep both helpers framework-free. Do not add
`src/renderer/uikit/shared/index.ts`, change `src/renderer/uikit/index.ts`, modify
`core/state/view.tsx`, or touch `ComponentQueue`. Later tasks may add a direct export when the
first consumer establishes a public path.

Do not modify `PathInput` in this task. US-991 owns the integration and will use the keyed helper
while retaining the existing React-facing `PathInput` props and React `Input`/`Popover` children.
No production component should be converted merely to prove the helper compiles.

### 4. Verify structural behavior at the helper boundary

There is no unit-test harness in this project and this task must not add one. Verification should
be a focused smoke check in the later adapter/pilot work, with these cases recorded as the contract
for implementation review:

- first keyed-list update creates one node per unique key in input order;
- a reordered update moves existing nodes rather than replacing them;
- an unchanged key receives `update` and keeps the exact same `Node` object;
- an added key creates one node, a removed key invokes its removal callback and detaches its node,
  and duplicate keys throw without changing the previous list;
- a subtree swap inserts the new root, disposes and removes the old root, preserves the old branch
  when factory creation fails, and rethrows cleanup errors only after detaching the old branch;
- repeated `clear`/`dispose` calls do not double-dispose handles, and updates after disposal do
  not touch the DOM;
- PathInput's later pilot confirms row references remain valid after suggestion reordering and
  active-row scrolling still targets the keyed row.

## Concerns / Open questions

1. **The keyed list needs a managed DOM region — resolved in favor of a dedicated container.**
   A helper that clears or reorders every child of an arbitrary parent would destroy sibling nodes
   such as an input, portal host, or sentinel. Requiring the caller to pass a container whose direct
   children belong to the list keeps ownership explicit and makes `insertBefore` deterministic.
   US-991 can create that host inside the React Popover boundary without making the list aware of
   Popover.

2. **Key type and duplicate behavior — resolved.** Keys are `PropertyKey` values and are stored in
   a `Map`, so string and numeric identifiers are not coerced. Duplicate keys are invalid input and
   throw before any DOM or callback mutation. The helper does not accept object keys; callers must
   extract a stable primitive identifier such as `s.path`.

3. **Who owns a subtree created by `SubtreeSwap` — explicit resource ownership.** The swap helper
   owns its active `IOwnedView` and is itself registered with the parent view's `own()` registry.
   It calls the same `claimViewOwnership()` used by `VanillaView.child()`, so passing that view to
   a second owner throws instead of silently creating double disposal. The claim is intentionally
   not released during disposal; a view has one owner for its lifetime.

4. **Swap timing and disposal failures — resolved.** The new branch is created and inserted before
   the old branch is disposed and removed, matching the adapter requirement that a React root be
   unmounted before its host is detached. A cleanup exception is not allowed to leave the old node
   mounted or skip the transition; cleanup completes, the new branch stays active, and the first
   error is rethrown.

5. **No direct consumer for the conditional helper yet — accepted sequencing risk.** The keyed
   helper has the concrete PathInput consumer; `SubtreeSwap` is needed by later conditional view
   conversions but no current production component should be converted just to exercise it. Its
   API is intentionally limited and its first real behavior check belongs in US-991 or the first
   conditional Epic C task. If that consumer needs a different ownership or transition contract,
   change this helper explicitly rather than adding a parallel ad hoc swap mechanism.

6. **Virtualization and batching remain out of scope.** The helper does not recycle rows outside
   the active keyed set, measure viewport ranges, coalesce state notifications, or schedule a
   microtask. The renderer's existing synchronous `IState` notification contract remains intact;
   av-grid's copied render engine owns virtualization where it is required.

## Acceptance criteria

- [ ] `src/renderer/uikit/shared/keyed-list.ts` exports a framework-free keyed-list helper that
      creates, updates, removes, and reorders nodes by stable `PropertyKey` without replacing an
      unchanged node.
- [ ] Duplicate keys are rejected before the existing DOM is mutated; the update phase order is
      validate -> remove/detach -> create -> minimal-move cursor reconciliation -> update; `get(key)`
      exposes the current node for per-key refs, and unrelated children outside the managed
      container survive.
- [ ] New and existing records receive `update(element, item, index)`; removed records receive the
      optional removal callback exactly once and are detached; `clear()` leaves the helper usable,
      while `dispose()` makes it permanently inert.
- [ ] `src/renderer/uikit/shared/subtree-swap.ts` imports `IOwnedView` and exports a
      framework-free conditional swap helper constrained to `K extends PropertyKey`, with explicit
      `set`, `clear`, and idempotent `dispose` behavior; no `SubtreeHandle` type is introduced.
- [ ] `claimViewOwnership()` is shared by `VanillaView.child()` and `SubtreeSwap`, so a view cannot
      be silently owned by both paths.
- [ ] A swap creates/inserts the new detached root before disposing/detaching the old root; factory
      failure preserves the old branch, and cleanup failure is rethrown only after cleanup.
- [ ] Both helpers are inert after disposal, do not use `innerHTML`/`replaceChildren`, and do not
      discover or adopt arbitrary DOM/view descendants.
- [ ] The helpers have no direct imports of React, ReactDOM, Emotion, settings, `api/`, `ui/`, or
      `components/`; no shared barrel, `uikit/index.ts` export, React `Views` change, model driver,
      adapter, or component conversion is added.
- [ ] The implementation does not introduce virtualization, batching, a context lookup, or a
      second state primitive.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass. No unit-test harness is
      added; the structural smoke cases are available for US-991's PathInput verification.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Export the shared ownership-claim helper used by both ownership paths |
| `src/renderer/uikit/shared/keyed-list.ts` | New keyed DOM reconciliation helper and types |
| `src/renderer/uikit/shared/subtree-swap.ts` | New conditional subtree lifecycle helper and types |
| `doc/epics/EPIC-053.md` | Link US-987 to this task document |
| `doc/active-work.md` | Link the planned US-987 task under EPIC-053 |
| `doc/tasks/US-987-structural-helpers/README.md` | This investigation and implementation plan |

## Related

- [EPIC-053 — De-React Epic B](../../epics/EPIC-053.md)
- [US-986 — Vanilla view lifecycle and `bind()`](../US-986-vanilla-view-lifecycle/README.md)
- US-988 — Model driver — the non-React `useComponentModel` *(planned)*
- US-989 — `mountVanilla` / `mountReact` *(planned)*
- US-991 — Pilot — one component converted end to end *(planned)*
