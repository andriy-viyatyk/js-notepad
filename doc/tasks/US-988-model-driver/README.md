# US-988: Model driver - the non-React `useComponentModel`

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-053 - De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Add the explicit lifecycle driver that lets a vanilla view own a `TComponentModel` without
calling React hooks. The driver must preserve the model's existing constructor, prop-mapping,
state, `isFirstUse`, and disposal behavior while replacing the React adapter's lifecycle calls:
initial prop pump, mount initialization, prop updates, and one-time unmount cleanup.

This task adds the driver only. It does not convert a component, remove `useComponentModel`,
decompose `effect()` calls, modify `ComponentQueue`, or build either mount adapter.

## Background

### Existing React adapter

`src/renderer/core/state/model.ts` contains both the framework-neutral model base and the thin
React adapter:

```ts
const controlModel = useModel(model, TComponentState, defaultState);
controlModel.setPropsInternal(props);
controlModel.isFirstUse = false;

useEffect(() => {
    controlModel._initInternal();
    return () => controlModel.onUnmountInternal();
}, [controlModel]);

return controlModel;
```

`useModel()` constructs a model class with `TComponentState` and the supplied default state, or
returns the supplied model instance unchanged. `setPropsInternal()` stores `oldProps`, maps and
stores the new props, evaluates the model's registered effects, and then calls `setProps()`. The
method may return a `Promise<void>` because `setProps` may be asynchronous. `_initInternal()` calls
`init()` once and evaluates the registered effects after registration. `onUnmountInternal()` marks
the model not live, cleans all registered effect callbacks, then calls `dispose()` and
`onUnmount()`.

The driver must use these existing methods rather than reimplementing their behavior. In
particular, `setPropsInternal()` must remain the update path even though it contains
`_evaluateEffects()`. That call is required by the 56 existing React call sites and is harmless
for a convertible model after its `effect()` registrations have been decomposed to explicit
`init()`, `setProps()`, state-mutator, subscription, or `dispose()` logic.

### Measured surface and dependency boundary

The current source has 56 direct `useComponentModel(...)` call sites. The exported `useModel()`
hook has zero external callers; its only caller is `useComponentModel()` in `model.ts`. The
current scan also finds unrelated `model.useModel()` method calls on AVGrid models, which are not
this hook. The EPIC-053 baseline records 57 `useComponentModel` sites; the pinned current scan is
the authoritative count for this branch, and the one-site drift does not change this task because
none of the call sites changes in US-988. The driver is added beside the existing path so the
React surface remains usable until the PathInput pilot in US-991.

`TComponentModel` itself has no React API in its methods or fields. `model.ts` still has a
top-level React import because `useModel()` and `useComponentModel()` live in the same module.
The driver must not call hooks, import another React API, or make the model lifecycle depend on a
React commit. Splitting the shared model module into a React-free core and a React adapter is not
part of this task; that can be done later if the bundle boundary requires it.

### The vanilla lifecycle it serves

US-986 established the lifecycle contract for `VanillaView`:

1. The view constructor creates only its root and stores props.
2. `mount()` builds DOM children and installs bindings.
3. `update(props)` stores props and, after mount, updates existing DOM.
4. `dispose()` is idempotent and releases owned resources once.

US-988's driver is intended to be called from those hooks by US-989/US-991. A typical consumer
will construct the driver with the initial props, call its `mount()` operation from the view's
mount hook, pass later props to its `update()` operation from the view's update hook, and call its
`dispose()` operation from the view's dispose hook. The model's DOM refs are still assigned by the
owning view; the driver does not discover or manage DOM.

### Effect boundary

The epic's B13 decision is explicit: a vanilla driver does not evaluate a dependency-array effect
loop. `TComponentModel.effect()` and `_evaluateEffects()` remain temporarily for unconverted React
models, but zero `this.effect(` registrations is a precondition for handing a model to a vanilla
view. US-991 is responsible for decomposing `PathInputModel`'s four effects before using this
driver.

This avoids carrying React's unusual timing into vanilla code. In the React path, the first effect
evaluation happens after mount and later dependency evaluations can happen during render because
`setPropsInternal()` runs during render. In the vanilla path, the driver performs no additional
effect evaluation; explicit model methods and subscriptions own their timing.

## Implementation plan

### 1. Add the driver beside the existing model adapter

Modify `src/renderer/core/state/model.ts`. Keep `TModel`, `TComponentModel`, `createModel`,
`useModel`, and `useComponentModel` behavior unchanged for current React callers.

Add a framework-neutral driver factory next to `useComponentModel`, using the same generic shape as
the existing adapter. Introduce the private `ComponentModelConstructor` type alias shown below and
use it to spell the constructor signature shared by `createModel`, `useModel`, and the new driver;
this is a type-only deduplication, not a lifecycle refactor:

```ts
type ComponentModelConstructor<T, P, M extends TComponentModel<T, P>> = new (
    modelState: IState<T> | (new (defaultState: T) => IState<T>),
    defaultState?: T,
) => M;

export interface ComponentModelDriver<T, P, M extends TComponentModel<T, P>> {
    readonly model: M;
    update(props: P): void | Promise<void>;
    mount(): void;
    dispose(): void;
}

export function createComponentModelDriver<T, P, M extends TComponentModel<T, P>>(
    props: P,
    model: M | ComponentModelConstructor<T, P, M>,
    defaultState?: T,
): ComponentModelDriver<T, P, M>;
```

The exact private/interface naming can follow the file's existing `createModel` and `useModel`
types, but the observable contract is fixed:

- Add `get hasRegisteredEffects(): boolean` to `TComponentModel`, returning whether its private
  effect-registration list is non-empty. This is a read-only query for the driver; it is not a new
  lifecycle flag and does not expose the registrations themselves.

- Construct a class model with `TComponentState` and `defaultState`, or accept an existing model
  instance exactly as `useModel()` does. The driver owns the supplied instance for its lifetime;
  one model instance must not be driven by both React and vanilla lifecycles.
- Pump the initial props through `model.setPropsInternal(props)` during driver creation. Set
  `model.isFirstUse = false` immediately after that first pump, matching `useComponentModel()`.
  This preserves the four existing guards in `TreeProviderViewModel.ts:157,190`,
  `CategoryViewModel.ts:155`, and `RenderGridModel.ts:207`.
- `update(props)` must ignore calls after disposal and otherwise return the result of
  `model.setPropsInternal(props)`. It must not assign `model.props` directly, call `setProps`
  directly, or bypass `mapProps`, `oldProps`, or `_evaluateEffects()`.
- `mount()` must be idempotent, must do nothing after disposal, and must call
  `model._initInternal()` exactly once. Mark the driver mounted before calling it so a thrown
  `init()` cannot be retried. Immediately after `_initInternal()`, check the model's
  `hasRegisteredEffects` query and throw a descriptive error naming the model class if any
  effects were registered. The driver must not call `_evaluateEffects()` separately;
  `_initInternal()` owns the existing init/effect registration sequence.
- `dispose()` must be idempotent, must mark the driver disposed before invoking model cleanup, and
  must call `model.onUnmountInternal()` exactly once. Future `update()` and `mount()` calls are
  inert, even if cleanup throws. Propagate the error from the model cleanup and do not call model
  cleanup a second time.
- The driver must not detach a DOM node, own a `VanillaView`, create a React root, or subscribe to
  model state. Those responsibilities belong to US-986 and US-989.

The driver may return the model and lifecycle methods in a small object because the lifecycle
state (`mounted`/`disposed`) belongs to the driver, not to `TComponentModel`. Do not add these
flags to `TComponentModel` or alter `onUnmountInternal()` globally: existing React models rely on
the current class surface, and US-988 is not the task that removes the React adapter.

### 2. Reuse the existing model-construction path

Call the existing module-private `createModel(model, TComponentState, defaultState)` directly.
It already implements the constructor-versus-instance overload and the
`TComponentState`/default-state setup; do not export it or introduce a refactor solely to share
it with a hook that has no external callers.

The driver must preserve these cases:

```ts
createComponentModelDriver(props, MyModel, defaultState);
createComponentModelDriver(props, existingModel);
```

The class constructor signature remains `(modelState, defaultState?)`, and `null` remains a valid
default state when a model's state type permits it. Do not introduce a second state primitive or
copy `TOneState` state into a plain object.

### 3. Keep the React adapter behavior byte-for-byte in spirit

After adding the driver, compare `useComponentModel()` against the existing sequence. It must
still:

- create one model per hook lifetime through `useModel()`;
- pump props on every React render;
- set `isFirstUse` false after the prop pump;
- initialize after the first commit through `useEffect`;
- clean up on unmount through `onUnmountInternal()`.

Do not move `useEffect` into the driver, do not make `useComponentModel()` delegate through a
vanilla lifecycle that changes its commit timing, and do not remove `_evaluateEffects()` from
`setPropsInternal()`.

### 4. Keep exports and scope narrow

`src/renderer/core/state/index.ts` already has `export * from './model'`, so the new public driver
factory/type is automatically available through the existing core-state barrel. Do not add a
new barrel under `uikit/shared/`, do not export the driver from `uikit/index.ts`, and do not modify
`ComponentQueue.ts`.

Expected implementation files:

| File | Change |
|---|---|
| `src/renderer/core/state/model.ts` | Add the non-React model driver and share construction typing with `useModel()` |
| `src/renderer/core/state/index.ts` | No change expected; existing wildcard export covers the driver |
| `doc/active-work.md` | Link this task under EPIC-053 |
| `doc/epics/EPIC-053.md` | Link this task in the task table |

No existing component or model file should change in US-988. `PathInputModel` effect decomposition
and all view integration are US-991 work.

## Concerns / Open questions

1. **Driver API shape is deliberately the only local design choice.** The lifecycle contract is
   fixed, but the implementation can use a private driver class or a closure returning the
   `model`, `update`, `mount`, and `dispose` operations. Prefer the smallest shape that keeps
   lifecycle idempotence private and does not expose `_initInternal()` or
   `onUnmountInternal()` to future views. Do not solve this by adding lifecycle flags to the base
   model.

2. **Existing model instance ownership.** The driver should preserve the existing-model overload
   because US-991 may need to hand a preconstructed model into a vanilla view, not because an
   external caller depends on `useModel()` (there are none). The caller must transfer sole
   lifecycle ownership to the driver; the same instance cannot be passed to a React hook or a
   second driver. No runtime ownership marker is required in this task because model instances
   are not `VanillaView` children and the first consumer is controlled by US-991.

3. **Asynchronous `setProps`.** `setPropsInternal()` can return a promise, although the current
   React adapter does not await it. `update()` should return that promise unchanged so a future
   adapter can observe completion, while the driver must not serialize, cancel, or turn updates
   asynchronous. Model code remains responsible for `isLive` checks around late results.

4. **Initialization failure.** `mount()` should mark its own lifecycle state before invoking
   `_initInternal()` so a retry cannot register a second initialization after a thrown `init()`.
   `dispose()` must still be usable after a failed mount and must run `onUnmountInternal()` once.
   Preserve the thrown initialization error; do not add a recovery or retry protocol.

5. **Dispose before mount differs from React's uncommitted path.** A React render that never
   commits never runs its `useEffect` cleanup, while the explicit driver must dispose a constructed
   model even when `mount()` was never reached, or it would leak ownership and state resources.
   This means `dispose()`/`onUnmount()` may run without `init()` having run; document that source
   difference and keep it as the deliberate vanilla ownership trade-off.

6. **`postCreate` is outside this lifecycle.** `TModel` schedules `postCreate?.()` with
   `setTimeout()` from its constructor. The driver must not replace, await, cancel, or reorder that
   callback. If a future model uses `postCreate`, it remains the model author's responsibility to
   make it safe when disposal happens before the timer fires.

7. **React remains a module-level dependency for now.** A vanilla consumer importing
   `core/state/model.ts` will load the file's existing React hook imports even though the driver
   itself calls no hooks. This is accepted for US-988 because the epic's immediate requirement is
   a framework-neutral lifecycle path, not bundle splitting of the model module. Splitting the
   React adapter into a separate file is a later architectural change and must not duplicate the
   model base.

8. **Effect registrations are rejected by the driver.** `TComponentModel` exposes the narrow
   read-only `hasRegisteredEffects` query (`_effects.length > 0`) so `mount()` can fail loudly
   after `init()` instead of silently carrying React-timed effect behavior into vanilla code. The
   driver must not clear registrations or invent dependency tracking; models must first decompose
   their effects into explicit lifecycle/state/subscription logic.

9. **No batching or queue integration.** State updates and subscriptions remain synchronous under
   B8. The driver must not coalesce updates, use `ComponentQueue`, or schedule a microtask. If a
   converted view needs batching, that is a measured view-specific optimization after the pilot.

## Acceptance criteria

- [ ] A public non-hook driver exists beside `TComponentModel` in `src/renderer/core/state/model.ts`
      and supports both the model-constructor/default-state form and existing model instances.
- [ ] Driver creation performs the initial `setPropsInternal(props)` pump and sets
      `isFirstUse = false` immediately after it.
- [ ] `update(props)` routes through `setPropsInternal`, preserves its return value, and becomes
      inert after disposal; it never writes `props` or calls `setProps` directly.
- [ ] `mount()` calls `_initInternal()` once, is idempotent, and does not evaluate effects outside
      the existing model method; it rejects a model that registers effects after initialization
      through the descriptive `hasRegisteredEffects` check.
- [ ] `dispose()` calls `onUnmountInternal()` once, is idempotent, and leaves the driver inert even
      when cleanup throws, including when disposed before `mount()`; the pre-mount cleanup
      difference from an uncommitted React render is documented in the source.
- [ ] The existing `useModel()` and `useComponentModel()` behavior remains unchanged; in
      particular `_evaluateEffects()` remains inside `setPropsInternal()` and React initialization
      remains commit-timed through `useEffect`.
- [ ] The driver itself contains no hook calls, state subscriptions, DOM ownership, React root
      creation, `ComponentQueue` usage, or effect/dependency-array evaluator.
- [ ] No component call site changes in this task; `PathInput` integration is deferred to US-991.
- [ ] `npm run typecheck` and `npm run lint` pass, and `git diff --check` reports no whitespace
      errors.
- [ ] No unit-test harness or test dependency is introduced. Lifecycle behavior is exercised by
      the later US-991 pilot, which must verify the driver through the unchanged React-facing
      `PathInput` boundary.

## Related work

- [EPIC-053 - De-React Epic B](../../epics/EPIC-053.md)
- [US-985 - Drop zustand from the state layer](../US-985-drop-zustand/README.md)
- [US-986 - Vanilla view lifecycle and `bind()`](../US-986-vanilla-view-lifecycle/README.md)
- [US-987 - Keyed-list and subtree-swap helpers](../US-987-structural-helpers/README.md)
- US-989 - `mountVanilla` / `mountReact` *(planned)*
- US-990 - Storybook vanilla render path *(planned)*
- US-991 - Pilot - one component converted end to end *(planned)*
- [Model-view pattern](../../standards/model-view-pattern.md)
- [State management architecture](../../architecture/state-management.md)
