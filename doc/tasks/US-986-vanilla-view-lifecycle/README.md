# US-986: Vanilla view lifecycle and `bind()`

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-053 — De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Add the framework-free view primitive that later Epic B tasks and converted UIKit components
can share: a stable root element, `mount` / `update(props)` / `dispose` lifecycle, selector-based
state binding, DOM-listener cleanup, and explicit child-view ownership.

This task creates the lifecycle and binding foundation only. It does not convert a component,
modify the React `Views` registry, add `mountVanilla` / `mountReact`, or implement keyed-list and
subtree-swap rendering.

## Background

### Existing state and model contracts

`src/renderer/core/state/state.ts` now owns a plain synchronous `TOneState` implementation. Its
selector overload is the contract this view primitive consumes:

```ts
state.subscribe(listener, selector);
```

The selector's baseline is captured when the subscription is registered and the listener is not
called during registration. Therefore `bind` must apply the selected value once immediately and
then register the subscription; subscribing alone would leave a newly-created DOM node empty until
the first state change.

`IState<T>` remains in `core/`, while the view helper belongs under `uikit/` so the dependency
direction stays valid: UIKit may use core, but core must not depend on UIKit. There are currently
no vanilla view callers in `src/renderer`; US-989 will consume this API through `mountVanilla` and
US-991 will exercise it with the `PathInput` pilot.

### Existing React model lifecycle

`src/renderer/core/state/model.ts` provides `TComponentModel` and `useComponentModel`. The React
adapter currently owns model initialization and unmount cleanup. US-986 must not alter that model
API or try to make `TComponentModel` extend the new view class. US-988 owns the non-React model
driver.

### Existing React `Views` registry is out of scope

`src/renderer/core/state/view.tsx` is a React/Emotion dialog and popper registry with 18 callers.
EPIC-053 B3a explicitly leaves it for Epic D. US-986's base class is for the `mountVanilla`
boundary and standalone vanilla views; it must not add a second branch to `Views.registerView` or
touch `ViewRoot`.

### Reference and project decisions

`C:\projects\av-grid` has framework-free model and DOM code but deliberately does not provide a
shared view base class. EPIC-053 B10 resolves that question for Persephone: use one minimal base
class with an ownership hierarchy. A parent explicitly registers the child views it constructs;
children are never discovered by walking the DOM. A view cannot adopt an already-created child
view, but it may register an arbitrary disposer for a resource it did not create.

The view must use `document.createElement` for structure. No `innerHTML` API, template-string
markup, React import, Emotion import, or app-layer import belongs in this primitive. The existing
`data-type` / `data-part` conventions apply to views written by later component tasks, not to a
generic lifecycle class that has no component identity of its own.

## Implementation plan

### 1. Add the shared vanilla view base

Create `src/renderer/uikit/shared/vanilla-view.ts` with the framework-free exported
`VanillaView` base class. Do not add a shared barrel or a `uikit/index.ts` export yet; follow the
existing direct imports of `uikit/shared/slots` and `uikit/shared/overlayRegistry`. The later
adapter task can add a public export when there is a real consumer. The public shape is:

```ts
export abstract class VanillaView<P> {
    readonly root: HTMLElement;

    protected constructor(props: P);
    mount(): HTMLElement;
    update(props: P): void;
    dispose(): void;
}
```

The implementation should:

- create the root element in the constructor and build nothing else there;
- store the current props and make `update(props)` the single prop-change entry point;
- provide protected mount/update hooks. `mount()` is where the subclass builds its DOM children and
  installs bindings. An `update(props)` before mount stores props but does not call the subclass
  update hook; `mount()` renders from the stored props. Mount occurs at most once;
- make `dispose()` idempotent and prevent a disposed view from receiving later updates or creating
  new owned resources;
- leave removal from the parent DOM to the owner/adapter. Disposing a view releases behavior; it
  must not unexpectedly detach a root that `mountReact` or `mountVanilla` still needs to remove in
  a defined order;
- avoid adding rendering, templating, context lookup, batching, or model-driver behavior to the
  base. Each addition must be justified by a later conversion.

Use `VanillaView` consistently across this task and the later adapter tasks. The location is
`uikit/shared/vanilla-view.ts`, not `core/state/view.tsx`, so the framework-free class cannot be
confused with the existing React `Views` registry.

### 2. Add the disposal registry and ownership helpers

Keep one internal disposer registry for three resource categories:

1. state subscriptions returned by `IState.subscribe`;
2. DOM event listener removals; and
3. explicitly owned child views.

Expose only the smallest helpers needed by later views, for example:

```ts
interface IOwnedView {
    readonly root: HTMLElement;
    dispose(): void;
}

protected own(dispose: () => void): void;
protected listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
): void;
protected child<T extends IOwnedView>(view: T): T;
```

The exact generic event overload may be widened to `EventListener` where DOM target maps make the
API unnecessarily complex, but it must preserve the typed event at normal HTMLElement call sites.
`listen` registers the matching `removeEventListener` operation; callers must not write a second
manual cleanup for the same listener.

`child(view)` registers ownership and returns the same view for fluent construction. Add an owner
marker to every owned view and throw if `child()` receives a view that already has an owner. The
marker must be set before the child is registered so a re-entrant construction path cannot create
two owners. It must not search `root`, infer ownership from DOM containment, or accept an already-
owned view. If a view needs to release a resource it did not construct, it uses `own(dispose)`
instead. The marker is an internal ownership invariant, not a public context lookup.

On disposal, release child views depth-first, then release the view's own subscriptions and DOM
listeners, and finally run the subclass disposal hook if one is needed. Snapshot or otherwise
guard the registry so a disposer can safely unregister another disposer. The complete operation
must be idempotent, including repeated parent disposal and a child that was already disposed by
its owner.

### 3. Implement `bind(selector, apply)` on top of `IState.subscribe`

Add a protected binding helper with the framework-neutral shape:

```ts
protected bind<T, R>(
    state: IState<T>,
    selector: (state: T) => R,
    apply: (value: R) => void,
): void;
```

Its exact behavior is part of the contract:

1. read `selector(state.get())` and call `apply` immediately;
2. wrap `apply` in a callback that returns immediately when this view is disposed;
3. register that guarded callback with `state.subscribe(guardedApply, selector)`;
4. register the returned unsubscribe in this view's disposer registry;
5. never mutate DOM from the model callback itself; the callback only updates the named DOM field
   through `apply`;
6. stop delivering updates after view disposal even if the state is already in the middle of a
   notification pass. `TOneState` iterates a stale listener-array snapshot, so unsubscribe alone
   is not sufficient.

The same disposed guard must wrap handlers installed by `listen`. Removing a listener during a
notification or DOM event dispatch does not guarantee that the current dispatch will stop calling
the captured handler.

`bind` may only be called from the mount hook or later. Calling it from the constructor is invalid:
the constructor has created only the root, not the DOM fields that the immediate `apply` needs.

Do not add a no-selector overload that causes a whole-state DOM binding by accident. If a later
view genuinely needs an unselected notification, it can call `state.subscribe` through `own`,
which keeps the binding API explicit. Derived arrays/objects should be computed by model `memo()`
or stored state rather than allocated in a selector on every notification.

Include a before/after usage example in code comments or the task implementation notes:

```ts
// React view: state.use(s => ({ title: s.title }))
// Vanilla view:
this.bind(model.state, s => s.title, value => {
    this.titleElement.textContent = value;
});
```

### 4. Define lifecycle and error behavior for later adapters

Document the decisions in the new source comments and keep them compatible with US-989:

- `mount()` is the one place where a subclass builds its DOM or installs its initial bindings;
  repeated calls do not duplicate nodes, listeners, or subscriptions;
- `update(props)` updates the stored props. Before mount it does not invoke the subclass update
  hook; after mount it invokes that hook without rebuilding the root. The adapter can call it for
  every prop render without creating a new view;
- `dispose()` runs once, disposes children and owned resources, and is safe when called from a
  parent cascade;
- the root stays a stable object after dispose, but no state or event callback may update it;
- synchronous exceptions from a user-supplied `apply`, lifecycle hook, or disposer are not silently
  swallowed. Disposal always runs the complete snapshot of children and disposers, preserves the
  first error, and rethrows that error after all cleanup has been attempted;
- the base does not create or own a React root. `mountReact` will register its React-root unmount
  function as a child/disposer in US-989, preserving unmount-before-detach ordering.

### 5. Export only the intended framework-free surface

Import `src/renderer/uikit/shared/vanilla-view.ts` directly from later adapter/view tasks. There is
currently no `src/renderer/uikit/shared/index.ts`, and this task must not add one or export the
class through `src/renderer/uikit/index.ts`, `src/renderer/core/state/index`, or the React `Views`
registry. Verify that the new module has no direct or transitive import of
React, ReactDOM, Emotion, settings, `api/`, `ui/`, or `components/`.

No existing production component is converted in US-986. `PathInput`, its model, `Input`, and
`Popover` remain unchanged until US-987 through US-991 apply the structural, driver, adapter, and
pilot work in order.

## Concerns / Open questions

1. **Base class name and root construction — resolved.** Export `VanillaView<P>` from
   `uikit/shared/vanilla-view.ts`. The constructor creates the one owned root and no child DOM;
   `mountVanilla` appends that root to its host later. No shared barrel is added until a real
   consumer exists.

2. **Lifecycle hook visibility.** `mount()` and `update()` should be public adapter entry points,
   while subclass hooks should be protected or abstract so callers cannot bypass the base's
   idempotence and disposal checks. This is a small API decision worth fixing now; later converted
   views should not call `render()` or `dispose` internals directly.

3. **Disposer failure policy — resolved.** Cleanup code should not hide errors, but throwing on the
   first disposer would leak later entries. Always run the complete snapshot of children and
   disposers, then rethrow the first error captured. This gives deterministic resource release and
   makes repeated disposal safe.

4. **Child disposal order.** B10 requires depth-first child disposal. The implementation should
   dispose children before the parent's own listeners/subscriptions, matching the ownership tree.
   US-989 must additionally unmount a nested React root before the host is detached; that adapter
   ordering is recorded here but not implemented in US-986.

5. **No context or adoption escape hatch.** A parent-child registry must not become a new ambient
   value lookup or a way to adopt arbitrary DOM descendants. EPIC-053 B11 deliberately rejected a
   context-shaped ancestor API after US-972 removed all React contexts. If Epic C needs a value,
   pass it explicitly through view/model props or a module singleton when it is truly ambient.

6. **Bindings and synchronous notification.** `TOneState` notifies synchronously and `bind` applies
   synchronously, so a state update can update the DOM before the caller returns. This is intentional
   and no batching/coalescing belongs here. A later virtualized consumer adopts av-grid's render
   engine instead of making this base a general scheduler.

7. **Commit timing is not recreated.** Unlike React `useEffect`, `mount` and `update` are explicit
   lifecycle calls. The base must not add an effect queue or render-phase reconciliation. DOM
   measurement and layout-sensitive work belongs in the view's explicit lifecycle hook, while
   model state and subscriptions remain framework-neutral. US-988 owns removal of React model
   effects; US-986 must not attempt that refactor.

8. **Strict Mode and React boundaries.** The current renderer does not enable React Strict Mode,
   but the base itself must be React-independent and safe to mount from either adapter. A child
   disposer registered by `mountReact` must be called exactly once even if the adapter and parent
   both reach disposal.

## Acceptance criteria

- [ ] A framework-free view base exists under `src/renderer/uikit/shared/` with stable root,
      `mount()`, `update(props)`, and idempotent `dispose()` lifecycle methods.
- [ ] The base is exported as `VanillaView` from `src/renderer/uikit/shared/vanilla-view.ts`;
      no shared barrel or `uikit/index.ts` export is added before a real consumer exists.
- [ ] The base has one disposal registry covering state unsubscribers, DOM event listeners, and
      explicitly registered child views; child views are disposed depth-first.
- [ ] Child ownership is explicit and construction-based, enforced by an owner marker that rejects
      a second parent; there is no DOM discovery, adoption API, context lookup, or automatic parent
      inference.
- [ ] `bind(state, selector, apply)` applies once immediately, then uses the selector overload of
      `IState.subscribe`, guards callbacks with the disposed flag, and automatically unregisters on
      disposal.
- [ ] A DOM listener helper registers a matching removal operation and does not require manual
      teardown by each view; its handler is also guarded after disposal.
- [ ] The pre-mount contract is explicit: the constructor creates only the root, `mount()` builds
      child DOM and installs bindings, and `update(props)` before mount stores props without calling
      the subclass update hook.
- [ ] Disposal always processes the full disposer snapshot, then rethrows the first captured error.
- [ ] Repeated `mount()` and `dispose()` calls do not duplicate resources or throw solely because
      the lifecycle method was called twice; updates after disposal are ignored or rejected by the
      documented contract without touching the DOM.
- [ ] The root remains stable and is not detached by `dispose()`; adapter-owned DOM removal remains
      available for US-989's unmount-before-detach ordering.
- [ ] The new module has no direct imports of React, ReactDOM, Emotion, settings, `api/`, `ui/`, or
      `components/`, and does not alter the existing React `Views` registry.
- [ ] No keyed-list helper, subtree-swap helper, model driver, adapter, or component conversion is
      introduced early under this task.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass. No unit-test harness is
      added; lifecycle behavior is smoke-verified by the later adapter/pilot tasks.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | New framework-free `VanillaView` base, disposer registry, child ownership, listener helper, and `bind` |
| `doc/epics/EPIC-053.md` | Link US-986 to this task document |
| `doc/active-work.md` | Link the planned US-986 task under EPIC-053 |
| `doc/tasks/US-986-vanilla-view-lifecycle/README.md` | This investigation and implementation plan |

No existing component, model, `ComponentQueue`, React `Views` registry, or adapter changes belong
in this task.

## Related

- [EPIC-053 — De-React Epic B](../../epics/EPIC-053.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
- [State management architecture](../../architecture/state-management.md)
- [US-985 — Drop zustand from the state layer](../US-985-drop-zustand/README.md)
- US-987 — Keyed-list and subtree-swap helpers *(planned)*
- US-988 — Model driver — the non-React `useComponentModel` *(planned)*
- US-989 — `mountVanilla` / `mountReact` *(planned)*
- US-991 — Pilot — one component converted end to end *(planned)*
