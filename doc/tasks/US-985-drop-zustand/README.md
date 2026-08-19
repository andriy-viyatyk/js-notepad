# US-985: Drop zustand from the state layer

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-053 — De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Remove Persephone's direct `zustand` dependency from the renderer state primitive without
changing the public `IState` / `TOneState` API or its synchronous notification behavior. Rebuild
the React-facing `use(selector?)` bridge on React 19's native `useSyncExternalStore`, while
retaining `immer` for `update()` and leaving all state consumers unchanged.

## Background

`src/renderer/core/state/state.ts` is the only source file that imports `zustand`. It currently
uses:

- `create<T>(() => defaultState)` for the backing store;
- `useStoreWithEqualityFn` for `use(selector?)`, with the local `compareSelection` function as
  the equality test; and
- a separate `listeners` array that powers the framework-neutral `subscribe()` API.

The current state surface is already shared by React and non-React code. `get()`, `set()`,
`update()`, `clear()`, and both `subscribe()` overloads must remain usable without a React
render. `set()` resolves functional setters through `resolveState`, updates the current value,
and notifies listeners synchronously. Selector subscriptions do not invoke their listener when
they are first registered; they compare the selected value only after a later state notification.

The existing `compareSelection` semantics are part of the observable behavior. Plain objects are
compared recursively, while arrays, `Map`, `Set`, `Date`, `RegExp`, and other values use
reference equality. The replacement must continue to use this function for both `subscribe`
selectors and React `use()` selectors.

The current `use()` call sites include both forms:

```tsx
const state = model.state.use();
const { open, activeIndex } = model.state.use((s) => ({
    open: s.open,
    activeIndex: s.activeIndex,
}));
```

The second form is common and often creates a fresh object on every selector invocation. A bare
`useSyncExternalStore` implementation that returns that object directly from `getSnapshot()`
would violate React's stable-snapshot requirement and can loop forever. The replacement therefore
needs a `useRef` cache for the selector form: recompute the selection, retain the previous object
when `compareSelection` says it is equal, and replace the cached snapshot only on a real
selection change. The no-selector form is deliberately different: it returns `this.get()`
directly, without the selector cache or `compareSelection`, so every replaced state object remains
observable even when its contents are deeply equal.

`useOptionalState` in the same file is not a replacement pattern for this work. It intentionally
uses `useState` / `useEffect` for a nullable state and subscribes without selector equality. It
stays unchanged. `ComponentQueue`, `TComponentModel`, `Views`, and the 153 non-hook
`subscribe()` consumers are outside this task.

The dependency measurement is:

| Dependency | Direct application use | Transitive use after this task |
|---|---:|---|
| `zustand` | `state.ts` only, two imports | `tunnel-rat` under `@excalidraw/excalidraw` may retain its nested copy |
| `use-sync-external-store` | direct package dependency required by `zustand/traditional` at runtime through zustand's optional peer contract | retained because `tunnel-rat`'s nested zustand 4.x has a real dependency |
| `immer` | `state.ts` only | remains direct and is required by `TOneState.update()` |

The package manifest and lockfile must remove the two direct root dependencies. This does not
mean deleting transitive packages belonging to Excalidraw's dependency tree or hand-editing those
packages out of the lockfile.

## Before → after

The current implementation creates a zustand store and exposes its hook:

```ts
private readonly store = create<T>(() => defaultState);

get = () => this.store.getState();
set = (setter: SetStateAction<T>) => {
    const newState = resolveState(setter, () => this.store.getState());
    this.store.setState(newState, true);
    this.stateChanged();
};

use: IUse<T> = (<R>(selector?: (state: T) => R) => {
    return selector
        ? useStoreWithEqualityFn(this.store, state => selector(state), compareSelection)
        : this.store(state => state);
}) as IUse<T>;
```

The replacement keeps the state in a plain field and uses a cached snapshot around the native
React subscription bridge. The exact helper shape may vary, but it must preserve these
properties:

```ts
private state: T;

get = () => this.state;
set = (setter: SetStateAction<T>) => {
    this.state = resolveState(setter, () => this.state);
    this.stateChanged();
};

// Inside the use() implementation:
const selectorRef = useRef(selector);
selectorRef.current = selector;
const snapshotRef = useRef<{ selector: Selector; state: T; value: unknown } | undefined>(undefined);
const getSnapshot = () => {
    const currentSelector = selectorRef.current!;
    const state = this.get();
    const cache = snapshotRef.current;
    // Same selector and same state object: nothing can have changed.
    if (cache && cache.selector === currentSelector && cache.state === state) {
        return cache.value;
    }
    const next = currentSelector(state);
    if (cache && compareSelection(cache.value, next)) {
        cache.selector = currentSelector;
        cache.state = state;
        return cache.value;
    }
    snapshotRef.current = { selector: currentSelector, state, value: next };
    return next;
};
return useSyncExternalStore(
    this.subscribe,
    selector ? getSnapshot : this.get,
);
```

The snippet is illustrative: the implementation must satisfy TypeScript's generic overloads and
React's hook rules. Three properties are mandatory.

**The cache is keyed on the selector as well as the state object.** An inline selector that closes
over a prop — `vm.state.use((s) => s.entries[index])` in `LogEntryWrapper.tsx:42` — must re-run
when that prop changes even though the state object is untouched, or the component renders the
previous prop's value. `useStoreWithEqualityFn` gave this for free: its cache lived inside a
`useMemo` keyed on `[getSnapshot, getServerSnapshot, selector, isEqual]`, so a changed selector
identity tore the memo down and forced a re-run.

**The state-identity short circuit is load-bearing, not an optimization.** `compareSelection`
compares arrays, `Map`, and `Set` by reference, so a selector that allocates
(`s => s.items.filter(...)`) returns an unequal value on every read. Without the
`cache.state === state` branch React sees the snapshot change after every render and re-renders
forever. Keep the branch, and keep the comment that explains why.

**The no-selector branch passes `this.get` directly** as the snapshot function, and never compares
or caches the whole state.

## Implementation plan

### 1. Replace the zustand backing store in `state.ts`

Edit `src/renderer/core/state/state.ts`:

- Remove the `create` and `useStoreWithEqualityFn` imports.
- Import React's native `useSyncExternalStore` alongside the existing React hooks. Keeping the
  direct React dependency in this adapter is intentional: this file still exposes the React
  `use()` method, and true framework neutrality arrives when Epic B's later model/view adapter
  tasks separate that bridge.
- Replace the zustand store with a private `currentState` field initialized from `defaultState`.
- Keep `defaultState` and the `IState<T>` public shape unchanged.
- Preserve `get`, `set`, `update`, and `clear` semantics. `set` must continue to resolve both a
  value and a functional `SetStateAction`, then notify the existing listener array synchronously.
- Leave `subscribe` as the single framework-neutral notification path. Preserve its initial
  silence, selector comparison behavior, and unsubscribe behavior.

### 2. Rebuild `TOneState.use()` with a stable selector snapshot

Implement both `use()` overloads with `useSyncExternalStore`:

- The no-selector overload returns `this.get()` directly, without a selector cache or
  `compareSelection`. It must re-render whenever the current state object is replaced, including
  when the new object is deeply equal to the old one.
- The selector overload stores the latest selector in a ref so an inline selector does not force
  the subscription itself to churn.
- Cache the selected snapshot per component invocation in a ref, keyed on both the selector
  identity and the current state object. Run the selector against the current state when React
  asks for a snapshot, and retain the previous cached value when `compareSelection(previous, next)`
  reports equality — including across a selector change, so an inline selector does not emit a
  fresh reference into downstream memo deps on every render.
- Short-circuit and return the cached value without running the selector only when both the
  selector identity and the state object are unchanged.
- Use an explicit `useRef<... | undefined>(undefined)` initializer, matching the existing React 19
  typing convention in `useComponentState`.
- Subscribe with the stable `this.subscribe` function. Do not add a second listener mechanism or
  route React through `useOptionalState`.
- Do not call the selector during construction, outside the hook invocation, or from a state
  mutation. React owns snapshot reads; non-React callers continue to use `get` / `subscribe`.
- Keep the generic `IUse<T>` overload and inferred return types so existing selector call sites
  need no casts or edits.

### 3. Remove only the direct dependency declarations

Edit `package.json` and regenerate the lockfile with the package manager's lockfile-only or
equivalent command:

- First remove the `zustand` imports, including `zustand/traditional`, from `state.ts`; then
  remove the direct `zustand` and `use-sync-external-store` entries from `dependencies`.
- The `use-sync-external-store` declaration is coupled to the current `zustand/traditional`
  runtime import and zustand's optional peer dependency. It is not independent unused cleanup.
- Keep `immer`.
- Update the root package entry in `package-lock.json` through npm rather than manually deleting
  transitive package records. After installation, `npm ls use-sync-external-store` is expected to
  continue listing the hoisted package because `tunnel-rat`'s nested `zustand@4.5.7` depends on it
  directly. The nested `node_modules/tunnel-rat/node_modules/zustand` must remain. Only the root
  `node_modules/zustand` 5.x package should disappear.
- Do not replace either package with another selector-store dependency. Native React plus the
  local snapshot cache is the chosen design.

### 4. Verify the unchanged consumer boundary

Run source searches after the change:

- `rg -n 'from ["'']zustand|zustand/traditional|from ["'']use-sync-external-store' src` returns no
  matches.
- Existing `model.state.use()`, `state.use(selector)`, `get`, `set`, `update`, `clear`, and
  `subscribe` call sites remain unchanged.
- `ComponentQueue`'s `use()` / `useRequest()` hooks are not included in this dependency removal;
  their implementation remains as-is for the later lifecycle work.
- `useOptionalState` remains nullable and unconditional in hook count.

### 5. Verify behavior and dependency resolution

Run `npm run typecheck`, `npm run lint`, and `git diff --check`. Because the project has no unit
test harness, use the existing renderer/story smoke path to verify a stateful component with:

- a no-selector `state.use()` consumer;
- a primitive selector;
- an object selector that returns a new object each read but does not re-render when its selected
  fields are unchanged;
- a nested object, array, `Set`, or `Map` selection whose reference-equality behavior remains
  unchanged;
- a non-React `get`/`set`/`subscribe` path, confirming synchronous notification and no callback
  on initial subscription; and
- `clear()` and Immer `update()` behavior.

Confirm `npm ls zustand use-sync-external-store immer --depth=4` shows no root `zustand` 5.x
package, retains `tunnel-rat/node_modules/zustand@4.5.7`, retains the hoisted
`use-sync-external-store` required by that nested package, and retains direct `immer`.

## Concerns / Open questions

1. **Stable snapshots are the main correctness risk.** Returning a newly allocated object from
   `getSnapshot` on every read causes React to report an unstable snapshot and can produce an
   infinite render loop. The per-hook `useRef` cache and `compareSelection` check are mandatory;
   a simple `useSyncExternalStore(this.subscribe, () => selector(this.get()))` is not acceptable.

2. **Selector identity must not become subscription identity.** Many callers pass inline selector
   functions. Keep the latest selector in a ref and subscribe through the stable state method, so
   an ordinary parent render does not tear down and rebuild the state subscription.

3. **Synchronous notification is intentional.** `TOneState.set()` currently calls listeners in
   the same call stack. Do not copy av-grid's microtask batching into this task; Epic-053 decision
   B8 explicitly rejects general coalescing. If React schedules the component re-render later,
   that is React's `useSyncExternalStore` behavior, not a change to non-React state listeners.

4. **React notification order shifts and is accepted.** Today zustand's own listener set notifies
   React consumers inside `store.setState`, before `stateChanged()` walks the framework-neutral
   listener array. After this change every consumer shares the one array and React subscribers
   are notified in registration order alongside other listeners. React re-renders remain
   scheduled by React; this ordering change is intentional and is not a reason to add a second
   notification path.

5. **Same-reference sets must follow the existing observable behavior.** The current wrapper
   invokes `stateChanged()` after every `set`, even if the resolved value is the same reference.
   Preserve that call. Selector consumers may still avoid a render because their cached selection
   compares equal, while unfiltered `subscribe()` listeners continue to receive the notification.

6. **The listener array remains deliberately unchanged.** It is O(n) to unsubscribe and will now
   contain React subscribers as well, but keep the existing array-replacement implementation.
   A `Set` would skip entries deleted during iteration, while the current array idiom iterates its
   stale snapshot; that difference is observable when a listener unsubscribes during notification.
   Do not optimize this structure in US-985.

7. **Transitive packages are not owned by this task.** Removing direct manifest entries does not
   remove the nested `zustand` used by `@excalidraw/excalidraw`'s `tunnel-rat`. Do not force a
   global package removal or alter Excalidraw's dependency tree just to make a repository-wide
   `rg zustand` result empty.

8. **React remains a direct import by design.** The task removes the state store dependency, not
   the React adapter. `IState.set` currently exposes `React.Dispatch<SetStateAction<T>>`, and
   `use()` is necessarily a hook. The later vanilla view/model tasks own the framework boundary;
   this task must not introduce a second state primitive or weaken the public types to hide React.

9. **No server snapshot is required.** Persephone renders in Electron and does not use SSR. The
   native two-argument `useSyncExternalStore(subscribe, getSnapshot)` form is sufficient; adding a
   fabricated server snapshot would create another contract without a consumer.

## Acceptance criteria

- [ ] `src/renderer/core/state/state.ts` has no `zustand` imports and uses a plain current-state
      field with the existing listener array.
- [ ] `TOneState.use()` supports both overloads through native `useSyncExternalStore`; only the
      selector overload uses the per-hook cached snapshot and `compareSelection`, while the
      no-selector overload returns the current state object directly.
- [ ] The selector cache is keyed on the selector identity as well as the state object: a
      selector closing over a prop re-runs when that prop changes while the state is unchanged,
      and the cached value is returned without running the selector only when both are unchanged.
- [ ] Selectors returning fresh plain objects do not trigger unstable-snapshot loops and do not
      re-render when the selected fields compare equal.
- [ ] `get`, `set`, `update`, `clear`, and both `subscribe` overloads preserve their current
      behavior, including synchronous notification and silent initial subscription.
- [ ] `useOptionalState`, `ComponentQueue`, `TComponentModel`, and all existing state consumers
      remain source-compatible without call-site edits.
- [ ] `package.json` no longer declares direct `zustand` or `use-sync-external-store`
      dependencies; `immer` remains declared.
- [ ] `package-lock.json` has the matching root dependency change; root zustand 5.x is absent,
      while the nested Excalidraw-owned zustand 4.x and its `use-sync-external-store` dependency
      remain and are explained.
- [ ] Source search finds no direct `zustand` or `use-sync-external-store` imports under `src`.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [ ] Renderer/story smoke verification covers selector equality, no-selector state, non-React
      subscriptions, `clear()`, and Immer updates; no unit-test harness is introduced.

## Files changed

| File | Change |
|---|---|
| `src/renderer/core/state/state.ts` | Replace zustand storage/hooks with a plain state field and cached `useSyncExternalStore` bridge |
| `package.json` | Remove direct `zustand` and `use-sync-external-store` dependencies |
| `package-lock.json` | Regenerate the root dependency metadata without removing transitive Excalidraw packages |
| `doc/epics/EPIC-053.md` | Link US-985 to this task document if the epic task table is made navigable |
| `doc/active-work.md` | Link the planned US-985 task under EPIC-053 |
| `doc/tasks/US-985-drop-zustand/README.md` | This plan and investigation record |

No consumer component, `ComponentQueue`, model lifecycle, view registry, or replacement state
dependency should change in this task.

## Related

- [EPIC-053 — De-React Epic B](../../epics/EPIC-053.md)
- [State management architecture](../../architecture/state-management.md)
- US-986 — Vanilla view lifecycle and `bind()` *(planned; task document not yet created)*
