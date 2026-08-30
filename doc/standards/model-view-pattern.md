# Model-View Pattern

This document describes the model-view pattern used for complex components in Persephone. Renderer
components use framework-free `VanillaView` classes; the only React code is the bounded Excalidraw
vendor island under `editors/draw/`.

## Overview

The model-view pattern separates UI rendering (View) from business logic and state management (Model):

- **View**: a `VanillaView` class responsible for rendering UI and binding native event handlers
- **Model**: Class containing all logic, state, and event handlers

This separation provides:
- Cleaner, more testable code
- No cyclic dependencies in lifecycle code
- Possibility for alternative views reusing the same model
- Better code organization for complex components

## Editor chrome shapes

Editor views have three intentional shapes:

- **Chrome-free**: a standalone root with no shared shell, or a `BodyView` intended for
  embedding. This is the only shape suitable for notebook note dispatch.
- **`PageToolbarView`**: a non-text editor's page root plus the standard toolbar. Use it when the
  editor needs toolbar actions but not text-host controls, script panel, footer, or overlay.
- **`TextChromeView`**: the native host-aware shell for text editors. It owns the toolbar, focus/key
  handling, script panel, content-host footer, and editor overlay; the editor-specific body sits in
  its `SlotContent` children slot.

Export a native main view as `EditorModule.View`, or an embeddable native body as `BodyView`;
`AsyncEditorView` mounts a main `View` directly. `TextChromeView` and `PageToolbarView` compose
native child views and DOM slots. The Excalidraw body is the sole exception: it owns one explicit
React vendor island under `editors/draw/`.

The native main-view shape is used by the text-bearing editor set, including `svg`, `html`,
`markdown`, `grid`, `mermaid`, `log-view`, and `notebook`; the graph, rest-client, env-vars, and
file-diff bodies follow the same `VanillaView` shape. The draw editor also uses a native body, with
one bounded `ExcalidrawIsland.tsx` inside it because the vendor package requires React. A vendor
island is a deliberate implementation boundary, not a second page shell. The five embeddable
bodies (`svg`, `html`, `markdown`, `grid`, and `mermaid`) also expose `BodyView`, so notebook note
dispatch can mount them without page chrome.

## When to Use

### Use Model-View Pattern When:
- A view has substantial state, event handling, or lifecycle work
- A view is long or difficult to test as one unit
- Several views need the same state transitions or domain operations

### Don't Use When:
- The view has only a small amount of local DOM state
- Component is small and easy to understand
- Simple presentational components

## Core Classes

### TComponentState (state.ts)

State shared by models and native views:

```typescript
import { TComponentState } from "../../core/state/state";

// Create state
const state = new TComponentState(defaultState);

// Read state (outside React)
const value = state.get();

// Update state (outside React)
state.set(newValue);
state.update((draft) => { draft.field = value; });

// Subscribe to changes in a native view or model owner
const release = state.subscribe((next) => {
    renderField(next.field);
});
```

### TComponentModel (model.ts)

Base class for component models:

```typescript
import { TComponentModel } from "../../core/state/model";

class MyViewModel extends TComponentModel<MyState, MyProps> {
    // Access props
    this.props.someValue;

    // Access/update state
    this.state.get();
    this.state.update((s) => { s.field = value; });
}
```

### Native component-model driver

Creates and manages the model instance from a `VanillaView`:

```typescript
class MyView extends VanillaView<MyProps> {
    private readonly driver = createComponentModelDriver(
        this.props, MyViewModel, defaultState,
    );

    protected onMount(): void {
        this.driver.mount();
        this.bind(this.driver.model.state, (state) => state.field, (field) => {
            this.root.textContent = String(field);
        });
    }

    protected onUpdate(props: MyProps): void {
        this.driver.update(props);
    }

    protected onDispose(): void {
        this.driver.dispose();
    }
}
```

## Implementation Pattern

### Step 1: Define State

```typescript
const defaultMyViewState = {
    isOpen: false,
    selectedIndex: 0,
    items: [] as string[],
};

type MyViewState = typeof defaultMyViewState;
```

### Step 2: Create Model Class

Handlers that a model hands to a view as callbacks must be arrow properties, not prototype
methods. A view commonly stores and invokes such a callback as a bare reference; a prototype
method then loses its model receiver when it reads `this`. This is a recurring De-React conversion
hazard: React's inline callback (`onNext={() => model.playNext()}`) preserves the receiver, while
the equivalent native callback prop (`onNext: model.playNext`) does not. Keep value-producing
getters as getters; this rule applies to methods used as callbacks.

```typescript
interface MyViewProps {
    data: SomeData;
    onSelect?: (item: string) => void;
}

class MyViewModel extends TComponentModel<MyViewState, MyViewProps> {
    // Refs as properties
    containerRef: HTMLDivElement | null = null;

    // Ref setter methods
    setContainerRef = (ref: HTMLDivElement | null) => {
        this.containerRef = ref;
    };

    // Computed properties (getters)
    get selectedItem(): string | undefined {
        const { items, selectedIndex } = this.state.get();
        return items[selectedIndex];
    }

    // Event handlers (arrow functions for correct 'this' binding)
    handleClick = (index: number) => {
        this.state.update((s) => {
            s.selectedIndex = index;
        });
        this.props.onSelect?.(this.state.get().items[index]);
    };

    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            this.state.update((s) => { s.isOpen = !s.isOpen; });
        }
    };

    // Lifecycle methods
    init = () => {
        window.addEventListener("resize", this.handleResize);
    };

    dispose = () => {
        window.removeEventListener("resize", this.handleResize);
    };

    private handleResize = () => {
        // Handle resize
    };
}
```

### Step 3: Create the native view

```typescript
class MyView extends VanillaView<MyViewProps> {
    private readonly driver: ComponentModelDriver<MyViewState, MyViewProps, MyViewModel>;

    public constructor(props: MyViewProps) {
        super(props);
        this.driver = createComponentModelDriver(props, MyViewModel, defaultMyViewState);
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.driver.mount();
        this.bind(
            this.driver.model.state,
            (state) => ({ isOpen: state.isOpen, selectedIndex: state.selectedIndex }),
            ({ isOpen, selectedIndex }) => {
                this.root.dataset.state = isOpen ? "open" : "closed";
                this.root.replaceChildren(isOpen ? document.createTextNode(String(selectedIndex)) : document.createTextNode(""));
            },
        );
        this.listen("click", () => this.driver.model.handleClick(0));
        this.listen("keydown", this.driver.model.handleKeyDown);
    }

    protected onUpdate(props: MyViewProps): void {
        this.driver.update(props);
    }
}
```

The driver owns the model lifecycle explicitly: call `mount()` from `onMount()`, forward later
props with `update()`, and register `dispose()` with the view owner.

## Model and native view driver

`TComponentModel` owns props, state, handlers, and computed behavior. A `VanillaView` uses
`createComponentModelDriver` to pump props, mount the model, and dispose it. Driver-backed models
have an explicit `props` → `setProps` → `init` → `dispose` lifecycle. Put subscriptions and
asynchronous work in `init()` or model methods with clear cleanup; put DOM measurements and layout
reads in explicit view lifecycle hooks.

The model remains independent of the DOM. The view owns a stable DOM root and uses native events;
the model receives domain values and callbacks rather than framework-specific event objects.

## Vanilla lifecycle

`VanillaView<P>` is the framework-free lifecycle base at
[`src/renderer/uikit/shared/vanilla-view.ts`](../../src/renderer/uikit/shared/vanilla-view.ts).
Every concrete `VanillaView` declares a public constructor because the base constructor is
protected:

```typescript
class ExampleView extends VanillaView<ExampleProps> {
    public constructor(props: ExampleProps) {
        super(props);
    }
}
```

The constructor creates the stable root and may construct the model driver, view-owned state, and
child views whose ownership it claims. Whatever the constructor touches it must have created;
anything created by `onMount()` is touched only by `onMount()` and later. Constructors do not
install listeners, subscriptions, timers, or measurements, and constructor-created resources
register `own()` cleanup immediately. `mount()` builds child DOM and installs bindings; the owner
attaches the root before calling it when layout measurement matters. An `update(props)` before
mount stores props without calling `onUpdate`; `onMount()` renders from the stored props. Later
updates modify existing DOM without replacing the root.

`claimViewOwnership()` and `child()` only establish ownership; they do not mount the child. An owner
that claims a view directly must mount it exactly once before handing its root to a keyed list, slot,
or other structural inserter, and must arrange disposal itself when it is not using `child()`.

Disposal is idempotent and depth-first: owned children are disposed first, then registered
resources in FIFO registration order, then `onDispose()`. Every cleanup is attempted and the first
error is rethrown after the full cleanup snapshot. If `onMount()` throws, the base rolls back the
registered children/resources, marks the view inert, skips `onDispose()` for the half-built view,
and rethrows the original mount error; a failed instance cannot be retried. The base makes the
view inert but does not detach its root; the adapter or structural helper that attached the root
owns detachment.

### Vanilla update and event hazards

`VanillaView.update(props)` stores the new props before it calls `onUpdate(props)`. Therefore
`this.props` is already the new value inside `onUpdate`; it is never the previous props. If a view
needs to compare old and new values, keep the old snapshot explicitly and update it after the
comparison.

Store writes are synchronous notifications. A handler that writes to a model may cause the view
to refresh its fields and per-row records before the handler returns. Capture values needed after
the write before performing it, and do not read a mutable `this.*` field or row record after a
write unless the refreshed value is explicitly what the handler wants. React closures commonly
capture per-render constants, so a direct translation that reads a mutable view field can create a
race that typecheck, lint, and production builds will not detect.

Never replace a UIKit primitive's generated `data-type` with an app-specific value. Primitive CSS
is keyed by that attribute, so overriding it detaches every attribute-keyed rule for the primitive,
including selection, drag, hover, and slot styling. Add a class or a separate data attribute for
application-specific state.

## Binding and direct DOM work

Use `bind(state, selector, apply)` for a state-to-DOM projection that must remain synchronized. The
initial application is immediate and the callback is guarded after disposal. It returns an
idempotent release handle; a binding to a fixed source may rely on the view's final cleanup, while
a replaceable source must retain the handle and call it before binding the replacement. Release
the old source first, then subscribe to the new one so the new source's current value is applied
immediately. A callback should capture its source identity and ignore an already-dispatched
notification from a source that has since been released. Repeatedly calling `bind()` for a changing
source without releasing the prior handle stacks subscriptions.

Selectors must read only the reactive state argument. Do not reach through the model to a lazy
getter or a directly-assigned field: those values are not dependencies observed by the state
subscription. If a derived value is needed, derive it from the state snapshot (or use a helper that
accepts that snapshot) so every reactive input participates in comparison. A selector must not
allocate a fresh array; derive mapped arrays in the apply callback instead. Do not use `bind` as a
replacement for all DOM work: structure, input/event feedback, root attributes, focus, and
layout-sensitive reads remain explicit view code. View fields hold DOM references; models receive
view-owned refs through explicit commands or setters and never query the document.

```typescript
protected onMount(): void {
    this.title = document.createElement("span");
    this.root.append(this.title);
    this.driver.mount();
    this.bind(this.driver.model.state, (state) => state.title, (title) => {
        this.title.textContent = title;
    });
}
```

For an event or state subscription that is owned by a view, use `ownSubscription()` so the single
function-disposer contract is visible at the ownership boundary:

```typescript
this.ownSubscription(model.state.subscribe(this.handleStateChange));
```

Keep the returned release handle when the source can be replaced. Release the old subscription
before registering the replacement; this prevents both stale callbacks and unbounded disposer
growth during rebinding.

DOM structure should use `document.createElement`, explicit properties, and `append`. Static,
code-owned `innerHTML` is acceptable when clearer, but runtime data must never be interpolated
into markup. `replaceChildren` is allowed for a region the view owns outright, never for a
[`KeyedList`](../../src/renderer/uikit/shared/keyed-list.ts)-managed container. For conditional
owned roots, use [`SubtreeSwap`](../../src/renderer/uikit/shared/subtree-swap.ts); both helpers
are direct imports from `uikit/shared/`, not public `uikit/index.ts` exports.

## The props-pump convention

The native view boundary has a deliberate split: props configure a child when it is constructed;
live data reaches the child through a shared model that the child subscribes to, or through a
targeted setter method. `update(props)` is therefore an exceptional configuration operation, not a
render pass for pushing current data through every descendant.

[`PageContentView`](../../src/renderer/ui/app/PageContentView.ts) is the worked reference. It takes
only `{ pageId }` as construction-time configuration, finds the page, and subscribes to
`pagesModel` itself. A parent may retain a slot or other structural identity while the child owns
the live subscription for the data it renders. If a child cannot subscribe to a model, expose the
smallest targeted setter needed for that live value rather than rebuilding a props object and
calling `update()` for every state dispatch.

This convention does not eliminate channels for values that do not exist at construction time. A
DataGrid instance created during a mounted grid branch still uses its deferred `onModel` channel,
and secondary-view headers created by a panel stack still use `headerRef`; both are lifecycle
notifications rather than ordinary child props. Likewise, editor roots that capture a stable
model may reject an unexpected model-identity replacement at their boundary. These cases are
separate from the `VanillaView.update()` equality decision.

The native attribute contract remains intentionally broad. `NativeHTMLAttributes` and its component
`Omit` surfaces are compatibility types; narrowing them is a per-component API decision, not a
consequence of adopting construction-time residual props. Residual attributes and listeners are
applied during the initial mount pass, with targeted setters for the small set of verified live
fields.

### Stable callbacks are fields

Every `onX` handler that crosses a props or update boundary is a bound method stored as a field and
created once. Do not allocate an arrow handler inside a props builder or an update path. The
existing pattern is [`TreeProviderViewImpl.ts:327-399`](../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L327-L399),
where selection, active-state, expansion, drag, and context-menu handlers are stable fields and
can be passed into child props repeatedly.

The reason is recorded in the header of
[`DataGridView.ts:10-32`](../../src/renderer/uikit/DataGrid/DataGridView.ts#L10-L32):
`VanillaView.update()` has no equality gate, so a parent can re-push fresh props on each update;
replacing a stable callback with a new function identity turns that pump into needless downstream
work even when handler behavior has not changed. A stable field can still read the view's current
props or model state when it is invoked, so identity and behavior are separate concerns.

An inline arrow in a construction-time descriptor is legitimate when that descriptor is built once
and retained, such as a menu item or toolbar button. It does not create identity churn on an update
path and costs nothing in that case. This exception is about the lifetime of the descriptor, not a
permission to put arrows back into a props builder that runs during updates. It is about descriptor
lifetime, not update-time prop construction.

### Selector authoring

Check the implementation of
[`TOneState.subscribe()`](../../src/renderer/core/state/state.ts#L74-L95) before judging a selector.
The overload with `subscribe(listener, selector)` evaluates the selector at subscription time and
after each dispatch, then delivers only when `compareSelection(last, next)` reports a change.
`compareSelection` recursively compares plain-object fields, but compares arrays, `Map`, `Set`,
`Date`, and `RegExp` values by identity
([`state.ts:18-40`](../../src/renderer/core/state/state.ts#L18-L40)).

Consequently, a selector must never return a freshly allocated array:

```ts
// Wrong: a new array is unequal by identity on every dispatch.
(state) => state.pages.map((page) => page.id)
```

That selector fires its listener on every dispatch, including dispatches unrelated to pages. It is
strictly worse than the whole-state selector it appears to improve on, and the regression is silent:
typechecking, linting, and the build do not detect it. Return a direct state reference, a primitive,
or a plain object containing only those values. A fresh plain object is safe when its fields are
direct references or primitives because plain objects are compared recursively. Derive mapped
values in the apply callback, as `PagesView.managerProps()` now does
([`PagesView.ts:21-50`](../../src/renderer/ui/app/PagesView.ts#L21-L50)).

A whole-state selector `(state) => state` on a small model-owned state is correct when the view
renders most of that state. Narrowing it is churn, not an improvement. The target is a whole-state
selector on hot, global, frequently-dispatched state. In particular, the
pilot found that the former `PagesView.ts:18` whole-state selector was already reference-gated on
all five `OpenFilesState` fields — `pages`, `ordered`, `leftRight`, `rightLeft`, and
`compareGroups`. The conversion made those dependencies explicit, but had no runtime selector
effect. Do not call a wide selector a defect until these comparison semantics and the actual state
shape have been checked.

The overload without a selector is different: `state.subscribe(() => ...)` registers the listener
directly and fires it on every dispatch
([`state.ts:74-95`](../../src/renderer/core/state/state.ts#L74-L95)). That was the real defect
found by the pilot in `PageTabsView`'s former page and editor layout subscriptions, not the wide
selector in `PagesView`. The converted layout path now projects the page fields and effective
editor flags it reads
([`PageTabsView.ts:156-179`](../../src/renderer/ui/tabs/PageTabsView.ts#L156-L179)).

Projection is not permission to substitute a convenient stored field for a derived value without
proof. The pilot's `PageTabsView` projection (`PageTabsView.ts:172-178`) uses the stored
`state.encrypted` flag while the effective
`TextFileEncryptionModel.encrypted` value is derived from content
([`TextFileEncryptionModel.ts:10-15`](../../src/renderer/editors/text/TextFileEncryptionModel.ts#L10-L15)).
That substitution is safe only while a write path maintains the invariant. Here,
`TextEditorModel.changeContent()` writes `state.encrypted` from the new content at line 276
([`TextEditorModel.ts:272-278`](../../src/renderer/editors/text/TextEditorModel.ts#L272-L278)).
Any projection that relies on such an invariant must cite the maintaining write path at the
projection site; otherwise it can silently stop updating or report the wrong derived value.

### Dynamic children: two structural patterns

[`KeyedList`](../../src/renderer/uikit/shared/keyed-list.ts) and
[`SubtreeSwap`](../../src/renderer/uikit/shared/subtree-swap.ts) are the only sanctioned answers
for dynamic children. Use `KeyedList` for a collection: it validates keys, removes and detaches
missing records, creates new records, preserves retained nodes while reconciling order, and then
updates each record. Use `SubtreeSwap` for one conditional branch: the same key is a no-op, and a
changed key is created detached, inserted before the old root, then the old branch is disposed and
detached. Both helpers own the structural operation and its lifetime.

The idempotency guard in
[`NotebookBodyView.ts:262-284`](../../src/renderer/editors/notebook/NotebookBodyView.ts#L262-L284)
is the worked reference: when the grid root is already the notes list's only child, it returns
instead of calling `replaceChildren` again. Full-DOM clear-and-rebuild in an update path is the
anti-pattern. `replaceChildren` remains appropriate for a region the view owns outright, but not
as a substitute for keyed collection reconciliation or conditional subtree swapping.

### The `update()` contract and the rejected gate

In prose, `update(props)` carries configuration, not live data. `VanillaView.update()` stores the
new props and calls `onUpdate()` only after mount
([`vanilla-view.ts:84-97`](../../src/renderer/uikit/shared/vanilla-view.ts#L84-L97)); it has no
shallow-equality gate. A child that needs live data must bind to the relevant model state or expose
a targeted setter, while a props update should be reserved for construction-style configuration.

Narrowing this distinction in the type system is deliberately deferred. Roughly 400 call sites
(405 `.update({ ... })` sites in the current renderer) still pass data through `update()`, so a
type-level split cannot be made without first migrating those callers. This document is therefore
the current house convention, not an enforced type contract.

The transitional option in
[`doc/de-react-refactoring.md` R2 step 4](../de-react-refactoring.md#r2-kill-the-props-pump--children-subscribe-parents-stop-re-pushing)
is rejected: a shallow-equality gate inside `VanillaView.update()` would be “a crutch, not the
fix.” It would mask exactly the call sites that need to be found and could make verification pass
for the wrong reason. Keep the pump visible until each live-data path is
owned by the appropriate child subscription or targeted setter.

## Virtualized DOM views

Large collection views use [`VirtualGrid`](../../src/renderer/uikit/VirtualGrid/) rather than a
React render loop. `VirtualGridModel` owns the measured render window, sticky-region geometry,
scroll/resize handling, dirty-cell information, and the pooled elements that have scrolled out of
view. `VirtualGridView` owns the DOM shell and schedules paints from the model's repaint callback.

`VirtualFlexGridView` composes a `VirtualGridView` with a measured-height collaborator. The cell
renderer may nominate a content element through its `measure` callback; a shared `ResizeObserver`
feeds committed heights back into the grid's row geometry. The wrapper owns observation and
measurement policy, while `VirtualGridModel` remains the sole owner of render-window and geometry
calculation. Both views expose the actual scroll element and a small `GridModelCapability` rather
than leaking their concrete model implementation.

The cell contract is deliberately framework-free: `renderCell` returns an `HTMLElement` or
`undefined`, and the engine applies the computed pixel geometry to that element. A cell renderer
should update an existing `previous` element when possible, use `recycle()` only for a detached
pooled element, and overwrite every property it owns because pooled elements retain their previous
contents, attributes, classes, and listeners. The engine's `RerenderInfo` is a dirty set: report the
smallest changed scope (`cells`, `rows`, `columns`, or `all`) so a state change does not repaint
unrelated visible cells.

Use a consumer-owned reuse key when different cell kinds own incompatible subtrees. Reuse is then
restricted to compatible pooled cells; a renderer still performs a total update for both
`previous` and `recycle()` paths. Virtualized cells must own their DOM subtrees directly: do not
create a React root per admitted cell, and do not dispose a child view merely because its cell was
evicted. Dispose pooled child views with the owning grid view, or explicitly discard a poisoned
record when an update throws.

`ListBoxView` and `TreeView` compose this engine for virtualized rows. Their model state and view
props must expose every value that changes cell output through a stable repaint signature or an
explicit state-to-view callback. Do not rely on an incidental parent render to recreate a row
renderer: in a vanilla view there is no render pass to hide a missing dependency. Geometry that
depends on a scrollbar or a newly attached container is recomputed from the view's measured DOM,
and scroll-to-row requests that arrive before a usable paint remain pending until the paint path
can satisfy them.

### Direct-DOM conversion checklist

React supplies several behaviours implicitly; direct DOM and `VanillaView` do not. Before calling a
conversion complete, inspect the original JSX and exercise each interaction path against this list:

- **Own the scroller.** Pass or expose the actual scrolling element; never locate it through an
  implementation id or a deleted component's markup.
- **Preserve bubbling focus semantics.** Use `focusin`/`focusout` when the React code depended on
  delegated `onFocus`/`onBlur`, and handle platform focus transitions that emit no DOM focus event
  (for example, interaction with an embedded frame) through the existing interaction signal.
- **Preserve layout-only components.** A component that contributes no DOM still affects layout in
  JSX. Use root adoption or `display: contents` where a wrapper would break a flex chain, and set
  `min-height: 0` on nested flex panels that must shrink. A view that measures its own root must
  retain a real box instead; `display: contents` has no box for `ResizeObserver` or geometry reads.
- **Repeat fill layout on `display: contents` branches.** A `display: contents` wrapper cannot be
  a flex item, so every mutually exclusive child branch that must fill the host must carry its own
  `flex: 1` and `min-height: 0`. Do not put the declaration only on the wrapper or on one branch;
  the missing branch is the one that will collapse when it renders.
- **Make teardown order explicit.** Capture state from an owner while child views are still ready;
  do not reach through a child during `onDispose`. Clear ownership/bookkeeping before teardown that
  may throw, and contain or report child failures so one cell cannot abort the enclosing paint.
- **Test behaviour, not just structure.** Typechecking and geometry checks cannot prove focus,
  wheel routing, embedded-frame activation, editing round trips, drag/drop, dialog actions, or
  state restoration. Exercise the real path after the direct-DOM conversion, including cold mount,
  recycling, and teardown.

## Explicit model lifecycle and updates

For a vanilla view, use `createComponentModelDriver` from
[`src/renderer/core/state/model.ts`](../../src/renderer/core/state/model.ts), pump updates through
`driver.update(props)`, call `driver.mount()` from the view's mount hook, and register
`driver.dispose()` with `own()` when the driver is constructed. The driver performs its initial
prop pump during construction, before `mount()` calls `init()`. If `setProps()` only handles
post-mount changes, guard it with an `initialized` flag and set that flag from `init()` after the
initial state has been established. `dispose()` remains safe when the view is disposed before
mount and drains model-owned resources.

## Choosing a boundary

Native components compose `VanillaView` instances directly. The concrete end-to-end reference is
[`PathInputView`](../../src/renderer/uikit/PathInput/PathInputView.ts), which combines the driver,
`bind`, `KeyedList`, native events, and static CSS. The only React boundary is the Excalidraw
vendor adapter at [`editors/draw/react-island.ts`](../../src/renderer/editors/draw/react-island.ts);
do not add a general-purpose renderer adapter for ordinary DOM nodes or converted components.

### Hosting an imperative widget

An imperative third-party widget belongs in a `VanillaView`. The view owns widget creation,
subscriptions, model ownership, and disposal. It can expose the raw widget through a deliberately
named escape hatch such as `getEditor()` without making consumers depend on the widget for lifecycle
or synchronization policy.

For uncontrolled widgets, distinguish mount-only initial props from later commands. A prop named
`initialValue` is not a controlled value: subsequent external writes go through a view method, which
owns equality checks, callback suppression, and any undo-preserving write sequence. Ownership-aware
views must distinguish owned and borrowed models, release displaced owned models only after the
widget no longer references them, never dispose borrowed models, and defer disposal when the widget
releases references asynchronously. Widget geometry belongs to scoped static CSS on the view root,
not to a generic adapter prop.

For a native slot inside a vanilla view, use `fillSlot` from
[`uikit/shared/fill-slot.ts`](../../src/renderer/uikit/shared/fill-slot.ts). It owns the supplied
host and replaces text or DOM-node content with generation-safe cleanup. Do not mutate a fill-slot
host directly; the host's direct-child shape is part of the component contract. The draw editor's
`react-island.ts` is the only place that may create a React root.

Never pass a `DocumentFragment` as a slot value: slot filling appends the supplied node, which
consumes a fragment on the first fill and leaves later refills empty. Use a persistent element or a
mounted view root for content that may be projected more than once.

The React root created by draw's `mountReactHandle` marks its host with
`data-react-root`; disposal removes the marker. A root created directly by that helper is not
inside the `[data-part="children-slot"]` host used by `fillSlot`, so DOM measurements of React
islands must query both `[data-part="children-slot"]` and `[data-react-root]`.

When checking a converted panel, assert visibility separately from content: `textContent`
includes text in a `display: none` subtree. Use `offsetParent` for ordinary-flow elements; for
fixed-position overlays such as popovers, dialogs, menus, and tooltips, use
`getBoundingClientRect()` together with computed visibility because `offsetParent` is `null` by
design. During development, renaming an imported converted module from `.tsx` to `.ts` can leave
Vite resolving the old specifier; a renderer reload does not clear that stale dynamic-import
resolution. Touch the importer to invalidate it before debugging the conversion itself.

## Before and after: the same model, two view runtimes

```typescript
class PathInputView extends VanillaView<PathInputViewProps> {
    public constructor(props: PathInputViewProps) {
        super(props);
        this.driver = createComponentModelDriver(
            props, PathInputModel, defaultPathInputState,
        );
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.driver.mount();
        this.bind(this.driver.model.state, (state) => state.open, (open) => {
            this.root.dataset.state = open ? "open" : "closed";
        });
    }

    protected onUpdate(props: PathInputViewProps): void {
        this.driver.update(props);
    }
}
```

The view shares the model and state contract directly; its slot and event APIs are native.

## Derived values and prop updates

`TComponentModel` does not provide a lazy memo primitive. Values derived from props or state are
plain model fields, maintained at the write site so their invalidation is explicit and consumers
observe current values during synchronous notifications.

### Synchronous derive-on-write

When a setter changes an input, recompute every affected derived field in dependency order before
publishing the state change or notifying a view. Guard prop-derived work by input identity when
needed, and skip expensive derivations on unrelated writes when the dependency classification makes
that safe.

```typescript
class MyViewModel extends TComponentModel<MyState, MyProps> {
    // Derived field — maintained when the input changes
    filteredItems: Item[] = [];

    setProps = (props: MyProps): void => {
        if (props.items === this.props.items) return;
        this.filteredItems = props.items.filter((item) => item.active);
    };

    // In View: model.filteredItems
}
```

The field is current before the next state/view consequence runs. If a derivation is genuinely
expensive and cannot be eagerly maintained, introduce an explicitly invalidated cache alongside
the write path that invalidates it; do not hide invalidation behind a dependency array.

### Lifecycle Summary

| Primitive | Where to Define | When Evaluated |
|-----------|-----------------|-----------------|----------------|
| Derived field | Model class | When an input setter or `setProps()` changes its dependencies |
| `init()` | Class | On explicit driver mount |
| `setProps(props)` | Class | After each driver prop pump, including the initial pump |
| `dispose()` | Class | On explicit driver/view disposal; owned cleanup is drained |

### Native update constraint

The native driver pumps props explicitly through `driver.update(props)`. Keep prop-to-state seeding
behind an identity guard in `setProps()` when the initial constructor pump must not trigger it; a
fixed-length `DepsGate` is appropriate when several inputs control the same update. Put DOM
measurement and layout reads in the View's mount/update hooks, and make asynchronous model work
cancellable so it cannot publish after disposal.

When a model state has many fields, subscribe to only the stored fields the View actually renders
with `VanillaView.bind(state, selector, render)`. Return direct references, primitives, or plain
objects of those values from selectors; never allocate an array in a selector. Derive mapped arrays
in the apply callback or maintain them as model fields at the write site, depending on ownership,
so structural/reference comparison does not turn a selector into an always-fire path. See [The props-pump
convention](#the-props-pump-convention).

---

## Migration Guide

When refactoring an existing component to model-view:

### Move useState to Model State

```typescript
// Before
const [isOpen, setIsOpen] = useState(false);
const [count, setCount] = useState(0);

// After - in defaultState
const defaultState = {
    isOpen: false,
    count: 0,
};
```

### Move useCallback to Model Methods

```typescript
// Before
const handleClick = useCallback(() => {
    setCount(c => c + 1);
}, []);

// After - in model class
handleClick = () => {
    this.state.update((s) => { s.count += 1; });
};
```

### Move useRef to Model Properties

```typescript
// Before
const containerRef = useRef<HTMLDivElement>(null);

// After - in model class
containerRef: HTMLDivElement | null = null;

setContainerRef = (ref: HTMLDivElement | null) => {
    this.containerRef = ref;
};
```

### Move useEffect to explicit lifecycle

```typescript
// Before — useEffect in View
useEffect(() => {
    viewModel.init();
    return () => viewModel.dispose();
}, []);

useEffect(() => {
    viewModel.updateFitScale();
}, [src]);

// After — explicit model lifecycle and prop handling
class MyViewModel extends TComponentModel<State, Props> {
    private initialized = false;
    private previousSrc: string | undefined;

    init() {
        this.previousSrc = this.props.src;
        this.initialized = true;
        this.updateFitScale();
    }

    setProps = (props: Props) => {
        const previousSrc = this.previousSrc;
        this.previousSrc = props.src;
        if (!this.initialized || previousSrc === props.src) return;
        this.updateFitScale();
    }

    dispose() { /* release model-owned resources */ }
}
// View: driver.mount(), driver.update(props), and driver.dispose()
```

### Move derived calculations to model fields

```typescript
// Before — useMemo in View
const displaySize = useMemo(() => calcSize(zoom, src), [zoom, src]);

// After — a plain field maintained when its inputs change
class MyViewModel extends TComponentModel<State, Props> {
    displaySize!: Size;

    setProps = (props: Props): void => {
        this.displaySize = calcSize(props.zoom, props.src);
    };
}
// View: model.displaySize
```

## Examples in Codebase

| Component | Model | Description |
|-----------|-------|-------------|
| `GridEditor` | `GridPageModel` | Complex data grid with filters, sorting |
| `MarkdownView` | `MarkdownViewModel` | Markdown preview with scroll state |
| `ImageViewer` | `ImageViewModel` | Image viewer with zoom/pan |
| Settings sections | `BrowserProfilesSectionModel`, `McpSectionModel`, and models in `SettingsSections.ts` | Async settings operations and external status subscriptions |

## Benefits

1. **No useCallback everywhere** - Model methods are stable (class instance doesn't change)
2. **No cycled dependencies** - State updates don't recreate handlers
3. **Easy testing** - Test model class without rendering
4. **Alternative views** - Same model, different UI (desktop/mobile)
5. **Cleaner code** - Logic separated from rendering
6. **Better organization** - State, handlers, computed values grouped in model

## Anti-patterns to Avoid

1. **Don't put rendering logic in model** - Model computes values, view renders them
2. **Don't call hooks in model** - Hooks only in component function
3. **Don't access DOM directly in model** - Use refs and methods
4. **Don't use React hooks in native views** - Use explicit `VanillaView` lifecycle methods and model methods
5. **Don't treat `setProps()` as a pre-init hook** - The driver performs an initial prop pump before `init()`; guard post-mount work when necessary
6. **Don't use a selector for plain model fields** - Subscribe to reactive state and use explicit prop/update handling for plain fields
7. **Don't leave asynchronous model work uncancellable** - Release subscriptions and reject or cancel deferred work during `dispose()`
