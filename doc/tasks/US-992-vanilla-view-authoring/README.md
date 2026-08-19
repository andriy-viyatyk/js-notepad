# US-992: Authoring rules for vanilla views

**Status:** Implemented
**Implemented:** 2026-08-19
**Priority:** High
**Epic:** [EPIC-053 - De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Document the authoring contract for framework-free UIKit views now that the lifecycle base,
state/model driver, structural helpers, boundary adapters, and PathInput pilot exist. The guide
must make the next conversion predictable without inventing a second React-like programming model.

This task changes developer documentation only. It does not change the vanilla primitives or
convert another component.

## Background

### What exists now

Epic B has established these shared modules:

| Contract | Source | What an author uses it for |
|---|---|---|
| `VanillaView<P>` | `src/renderer/uikit/shared/vanilla-view.ts` | Stable root, explicit mount/update/dispose lifecycle, ownership, `bind`, `listen`, and cleanup registration |
| `KeyedList<T, K, E>` | `src/renderer/uikit/shared/keyed-list.ts` | Keyed DOM children that retain elements and reconcile order without unnecessary moves |
| `SubtreeSwap<K>` | `src/renderer/uikit/shared/subtree-swap.ts` | One owned conditional view root in a dedicated container |
| `createComponentModelDriver` | `src/renderer/core/state/model.ts` | Drive an existing `TComponentModel` without the React `useComponentModel` adapter |
| `mountVanilla` | `src/renderer/uikit/shared/mount.tsx` | Host a vanilla view from a React-facing component or other React tree |
| `mountReact` | `src/renderer/uikit/shared/mount.tsx` | Mount a React subtree into a DOM host owned by a vanilla view |
| `getOverlayLayer` | `src/renderer/uikit/shared/overlayLayer.ts` | Shared unstyled overlay host when a view must render outside its normal subtree |

The first complete consumer is `src/renderer/uikit/PathInput/PathInputView.tsx`. It uses a
`VanillaView` root, a model driver, `bind` for open/active state, `KeyedList` for suggestions,
`mountReact` for the existing `Input` and `Popover`, native DOM events, and a co-located static
stylesheet. The rules in this task should describe that working shape rather than a hypothetical
framework.

### The two view forms

The existing model-view documentation describes a React View function. That remains valid for
components that are not yet converted. A converted component has two explicit layers instead:

```text
TComponentModel  <-- props/state/handlers -->  React View or VanillaView
                                               |
                              mountVanilla / mountReact only at the boundary
```

The model remains the owner of component state and behavior. The view owns its DOM representation.
The React adapter and the vanilla adapter are integration points, not places to put component
logic.

### Public constructor requirement

`VanillaViewCtor<P>` is `new (props: P) => VanillaView<P>`. Every view used with `mountVanilla`
or a Storybook/production constructor slot must therefore declare a **public** constructor, even
when it only calls `super(props)`:

```ts
export class ExampleView extends VanillaView<ExampleProps> {
    public constructor(props: ExampleProps) {
        super(props);
    }
}
```

`VanillaView`'s base constructor is protected so callers cannot bypass the explicit subclass
contract. A subclass that inherits that protected constructor is not assignable to
`VanillaViewCtor`.

## Implementation plan

### 1. Extend `src/renderer/uikit/CLAUDE.md` with vanilla-view rules

Add a dedicated section after the model-view rule. Keep the existing React, styling, accessibility,
and component naming rules intact, and make the new section the authoritative authoring checklist
for any class extending `VanillaView`.

The section must cover the following rules.

#### Stable root and lifecycle order

- The constructor creates the stable `root` and may construct the model driver and view-owned state
  needed to preserve the initial prop-pump contract. It must not create child DOM, bind listeners,
  measure layout, start timers, or register state subscriptions. Any resource created in the
  constructor registers its cleanup with `own()` immediately; `onMount()` registers cleanup only
  for resources it creates there.
- `mount()` is the first point at which child DOM and bindings are created. The owner attaches
  `root` before calling `mount()` when the view may measure itself.
- `update(props)` always stores the latest props. Before mount it does not call `onUpdate`, because
  the child DOM does not exist; `onMount()` must render from the stored props. After mount,
  `onUpdate` updates existing DOM without replacing the root.
- `dispose()` is idempotent and makes the view inert. It disposes owned children first, then
  registered resources in FIFO registration order, then `onDispose()`, attempts the complete
  cleanup snapshot, and rethrows the first error after cleanup. Registration order is load-bearing:
  register a resource that must disappear first before the resource it depends on. It does not
  remove `root`; the adapter or structural helper that attached the root owns that operation.
- `bind()` is legal only from `onMount()` or later. Its initial application is immediate, then the
  state subscription is registered. The callback is guarded by the disposed flag, because
  `TOneState` may still visit a listener removed during the current notification pass.

Show the lifecycle shape with a before/after example:

```ts
// Correct vanilla shape: constructor-owned cleanup is registered immediately.
export class ExampleView extends VanillaView<ExampleProps> {
    private readonly driver;
    private title: HTMLSpanElement | undefined;

    public constructor(props: ExampleProps) {
        super(props); // root and framework-neutral model/view state only
        this.driver = createComponentModelDriver(props, ExampleModel, defaultState);
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.title = document.createElement("span");
        this.root.append(this.title);
        this.driver.mount();
        this.bind(this.driver.model.state, (state) => state.title, (title) => {
            this.title?.textContent = title;
        });
    }

    protected onUpdate(props: ExampleProps): void {
        this.driver.update(props);
    }
}
```

Do not describe `bind` as a replacement for every DOM write. Initial structure, event feedback,
root attributes, focus, measurement, and imperative operations remain direct DOM work in the
view; state-to-DOM projections that should stay synchronized belong in `bind`.

#### DOM construction and templating

- Build structure with `document.createElement`, `append`, and explicit properties/attributes.
  Static, code-owned `innerHTML` is allowed when genuinely clearer, but never interpolate runtime
  data into markup. `replaceChildren` is allowed only for a region the view owns outright; never
  use it on a container managed by `KeyedList` or another structural helper.
- Follow B7: static, code-owned markup may use `innerHTML` when that is genuinely clearer, but
  never interpolate runtime data into markup. Prefer explicit DOM construction for dynamic labels,
  paths, and editor content so the safety boundary stays obvious.
- Use semantic elements, `data-type` on the view root, `data-name` when the public prop supplies
  one, and the established `data-part` vocabulary for stable internal regions.
- Keep public styling state in `data-*` attributes and use the co-located static CSS conventions
  already documented above this section. Do not introduce `className` as a replacement for state.

#### Events, models, and refs

- View event handlers use native DOM event types (`Event`, `MouseEvent`, `KeyboardEvent`, etc.),
  not React synthetic event types. The model remains reusable by the React view, so shared model
  methods should accept the narrow data they need or a native event shape where the model is now
  intentionally DOM-facing.
- Store DOM references as view fields and clear them in disposal. Do not put DOM nodes in model
  state. A model method may receive a view-owned ref through an explicit setter or command path;
  the model does not query the document.
- Use `createComponentModelDriver` for a vanilla view. The driver performs the initial prop pump,
  calls `init()` from `mount()`, and disposes the model owner. A model driven by it must register
  no `TComponentModel.effect()` entries; the driver rejects registered effects because those
  effects depend on React's render-time evaluation. Move the behavior into explicit model methods,
  `setProps`, `onMount`, `onUpdate`, or a view-owned subscription/timer as appropriate.
- Keep prop-to-state seeding behind an identity guard in `setProps`; `setPropsInternal` runs on
  every prop pump. Do not synchronously write to another React-backed model from a model effect.

#### Ownership and structural helpers

- Register a child with `this.child(view)` exactly once. Ownership is claimed through the shared
  marker and a view already owned elsewhere throws; do not rely on DOM containment to enforce it.
- Register listeners through `this.listen` and arbitrary cleanup through `this.own`. Callbacks are
  guarded after disposal and resources are released by the base class. Constructor-created
  resources must be registered before mount-created resources; disposal is FIFO, so this order is
  part of the design, not an implementation detail.
- Use `KeyedList` only for a dedicated container whose children it owns. Its update phases are:
  validate all keys (including duplicates) before mutation, remove and detach removed nodes,
  create missing nodes, reconcile order with the cursor walk, then update every retained and new
  record. Stable nodes must not be reinserted when already at the cursor.
- Use `SubtreeSwap` for one conditional owned view root. Keys are stable `PropertyKey` values;
  the helper creates and inserts the new detached branch before disposing and detaching the old
  branch. Factory failure leaves the old branch active. Both helpers detach their managed nodes;
  that is deliberate and differs from `VanillaView.dispose()`, whose adapter owns root detachment.

#### React boundaries

- `mountVanilla` is used at a React-facing boundary: a converted component's unchanged React
  entry point, Storybook's normal preview path, or a React parent hosting a vanilla child. It
  creates the view in a module-level host component, appends the root before `mount()`, skips the
  redundant first `update`, and replaces the instance only when the constructor identity changes.
  Do not define a host component inside `mountVanilla` and do not use a changing React `key` to
  manage vanilla lifecycle.
- `mountReact` is used only when a vanilla view owns a React subtree that has no vanilla equivalent
  yet. The vanilla view owns the host element and the returned disposer owns the React root. The
  disposer is registered with the view so child React roots unmount before the vanilla view's host
  is detached.
- Do not mount the whole application through an adapter, create an adapter for ordinary DOM nodes,
  or add a React bridge where the component can be rendered directly. The bridge is temporary
  migration infrastructure and must be obvious at the boundary.

### 2. Update `doc/standards/model-view-pattern.md` for both view runtimes

Retain the existing React examples for unconverted components, but revise the document so its
terminology does not imply that every View is a React function. Add these subsections:

1. **Runtime-neutral model, two view adapters** - `TComponentModel` owns props/state/handlers;
   React uses `useComponentModel`, vanilla uses `createComponentModelDriver`.
2. **Vanilla lifecycle** - public constructor, root-only construction, attach-before-mount,
   pre-mount update behavior, explicit update, and depth-first disposal.
3. **Binding and direct DOM work** - `bind(state, selector, apply)` for synchronized projections,
   direct DOM writes for structure, input/event feedback, attributes, focus, and layout-sensitive
   work.
4. **Effects and the vanilla driver** - model effects are a React compatibility mechanism; a
   vanilla-driven model must have zero registered effects. Use explicit lifecycle methods and
   cancellable async work instead.
5. **Boundary choice** - when `mountVanilla` or `mountReact` is appropriate and why neither is a
   substitute for converting a parent or child prematurely.

Include a compact side-by-side before/after snippet for the React model adapter and the vanilla
view adapter, and link to `vanilla-view.ts`, `mount.tsx`, `model.ts`, and the PathInput pilot as
the concrete references. Correct the existing overview sentence that currently defines View as
only a React component; do not rewrite the established React model-view guidance.

### 3. Keep the rules aligned with the implemented primitives

Before finalizing the documentation:

- verify every API name and lifecycle claim against the current source files;
- mention that `VanillaView` and `KeyedList` are direct imports, not new `uikit/index.ts` exports;
- do not add an index barrel, a second view base class, a generic event bus, or a new templating
  helper as part of this documentation task;
- keep `mountReact`'s host ownership and `VanillaView`'s root-detachment asymmetry explicit;
- link the new guide from the existing documentation map only if the repository's documentation
  map is changed by the implementation. The task's required documentation homes are the two files
  above.

### 4. Verify the documentation contract

No unit-test harness or source implementation is introduced. Verify:

- `rg` finds the new vanilla section in both durable guide files;
- all links to `vanilla-view.ts`, `mount.tsx`, `keyed-list.ts`, `subtree-swap.ts`, and
  `createComponentModelDriver` resolve;
- the examples use public constructors and do not claim that `bind` replaces direct DOM work;
- `git diff --check` passes;
- `npm run typecheck` and `npm run lint` remain clean because the task changes no source code.

## Concerns / Open questions

1. **Documentation duplication.** `uikit/CLAUDE.md` is the short, mandatory authoring checklist;
   `model-view-pattern.md` is the detailed model reference. The implementation should avoid
   maintaining two independent lifecycle specifications: the UIKit guide should be concise and
   point to the standard for deeper model examples, while both must agree on the non-negotiable
   lifecycle and ownership rules.

2. **Vanilla views that still need React children.** PathInput demonstrates the accepted temporary
   shape: the vanilla parent owns the DOM and uses `mountReact` for the existing `Input` and
   `Popover`. This is not permission to pass `ReactNode` through ordinary view props or to build a
   callback-slot protocol. Subtree slots remain deferred to the Epic C boundary work; a React bridge
   should be a named, local migration seam and should be disposable when the child converts.

3. **Model effects versus DOM timing.** The React adapter can evaluate dependency-based model
   effects during later render passes, while a vanilla driver rejects registered effects. A guide
   that merely says “move effects to the model” would cause unsafe conversions. The rules must keep
   commit-timed measurement/layout work in the view and require explicit cancellation for async
   work, while keeping synchronous cross-model writes out of dependency effects.

4. **Adapter lifecycle and DOM ownership.** `VanillaView.dispose()` does not remove its root, but
   `KeyedList`, `SubtreeSwap`, and the adapters do remove what they attach. This is intentional,
   not an inconsistency: the code that performs attachment owns detachment. The distinction must
   be repeated anywhere disposal is explained or later authors will either leak roots or remove a
   parent-owned root too early.

5. **No tests for the shared primitives.** The repository has no unit-test harness. The durable
   safety net for this task is precise source guidance plus the PathInput pilot and focused manual
   checks. Do not add a test framework or pretend that documentation validation proves runtime DOM
   behavior.

6. **Future framework neutrality.** `VanillaView` itself is framework-free, but `mount.tsx` and
   `PathInputView.tsx` may import React because they are boundary modules. The guide should describe
   this by module responsibility rather than imposing a false “no React anywhere in a view folder”
   rule; Epic B's goal is to make the boundary explicit and removable, not to hide it.

## Acceptance criteria

- [ ] `src/renderer/uikit/CLAUDE.md` contains an actionable vanilla-view authoring section covering
      lifecycle, public constructors, `bind` versus direct DOM writes, native events, ownership,
      structural helpers, templating, styling attributes, and adapter boundaries.
- [ ] `doc/standards/model-view-pattern.md` describes React and vanilla views over the same model,
      including `createComponentModelDriver`, the zero-effect driver precondition, and the explicit
      vanilla lifecycle.
- [ ] Both guides state that constructors create the root and may construct model/state resources,
      mount builds children and binds,
      pre-mount update stores props, constructor-created resources register `own()` cleanup
      immediately, and disposal is depth-first, FIFO for registered resources, idempotent,
      complete-before-first-error-rethrow, and does not detach a `VanillaView` root.
- [ ] Both guides distinguish state-to-DOM `bind` projections from direct DOM structure, event,
      focus, and measurement work.
- [ ] The guidance requires `document.createElement`-style construction and rejects runtime-data
      `innerHTML`/markup interpolation while allowing static code-owned markup where appropriate.
- [ ] The guidance explains when `mountVanilla` and `mountReact` are appropriate and preserves the
      public-constructor, attach-before-mount, stable-host, and root-ownership contracts.
- [ ] The guidance uses `PathInputView` as the concrete pilot reference without introducing a new
      runtime primitive or React callback-slot protocol.
- [ ] No source implementation, public barrel, unit-test harness, or unrelated component is changed.
- [ ] `git diff --check`, `npm run typecheck`, and `npm run lint` pass.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/CLAUDE.md` | Add the mandatory vanilla-view authoring rules |
| `doc/standards/model-view-pattern.md` | Extend the model-view standard to cover vanilla views and adapters |
| `doc/architecture/key-files.md` | Add the five Epic B vanilla subsystem entry points |
| `doc/active-work.md` | Link US-992 under EPIC-053 |
| `doc/epics/EPIC-053.md` | Link US-992 in the task table and preserve its ordering note |
| `doc/tasks/US-992-vanilla-view-authoring/README.md` | This investigation and implementation plan |

## Related work

- [EPIC-053 - De-React Epic B](../../epics/EPIC-053.md)
- [US-986 - Vanilla view lifecycle and `bind()`](../US-986-vanilla-view-lifecycle/README.md)
- [US-987 - Keyed-list and subtree-swap helpers](../US-987-structural-helpers/README.md)
- [US-988 - Model driver](../US-988-model-driver/README.md)
- [US-989 - Boundary adapters](../US-989-boundary-adapters/README.md)
- [US-991 - PathInput pilot](../US-991-pathinput-pilot/README.md)
