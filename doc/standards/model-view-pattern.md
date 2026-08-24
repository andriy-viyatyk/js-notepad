# Model-View Pattern

This document describes the model-view pattern used for complex components in Persephone. React
remains the current view runtime for most components, while converted components may use the same
model from a framework-free `VanillaView`.

## Overview

The model-view pattern separates UI rendering (View) from business logic and state management (Model):

- **View**: a React component function or a `VanillaView` class responsible for rendering UI and
  binding event handlers
- **Model**: Class containing all logic, state, and event handlers

This separation provides:
- Cleaner, more testable code
- No cycled dependencies in hooks
- Possibility for alternative views (desktop/mobile) reusing the same model
- Better code organization for complex components

## Editor chrome shapes

Editor views have three intentional shapes:

- **Chrome-free**: a standalone root with no shared shell, or a `BodyView` intended for
  embedding. This is the only shape suitable for notebook note dispatch.
- **`PageToolbar`**: a non-text editor's page root plus the standard toolbar. Use it when the
  editor needs toolbar actions but not text-host controls, script panel, footer, or overlay.
- **`TextChrome`**: the host-aware shell for text editors. It owns the toolbar, focus/key handling,
  script panel, content-host footer, and editor overlay; the editor-specific body sits inside it.

The shell may remain React while its body or toolbar is a `VanillaView`. Export a native main view
as `EditorModule.View`, or an embeddable native body as `BodyView`; `AsyncEditorView` mounts a main
`View` directly, and React shells host a `BodyView` with `mountVanilla`.

This is the standard shape for the five embeddable editor bodies that currently use native views:
`svg`, `html`, `markdown`, `grid`, and `mermaid`. Their `index.tsx` files deliberately remain React
`TextChrome` shells, while the chrome-free body owns one stable vanilla root and creates no React
root of its own. Notebook note dispatch mounts `BodyView` directly, so the same body works in the
embedded path without page chrome.

## When to Use

### Use Model-View Pattern When:
- More than 4-5 `useState()` hooks in a component
- More than 3 `useCallback()` hooks
- Component function is very long and hard to understand
- Hooks have many complex dependencies

### Don't Use When:
- 1-2 simple `useState()` hooks
- 1-2 `useCallback()` hooks
- Component is small and easy to understand
- Simple presentational components

## Core Classes

### TComponentState (state.ts)

State that works both inside and outside React:

```typescript
import { TComponentState } from "../../core/state/state";

// Create state
const state = new TComponentState(defaultState);

// Read state (outside React)
const value = state.get();

// Update state (outside React)
state.set(newValue);
state.update((draft) => { draft.field = value; });

// Subscribe to changes in React
const { field } = state.use((s) => ({ field: s.field }));
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

### useComponentModel Hook

Creates and manages the model instance:

```typescript
function MyComponent(props: MyProps) {
    const viewModel = useComponentModel(props, MyViewModel, defaultState);
    const { field } = viewModel.state.use((s) => ({ field: s.field }));

    return <div onClick={viewModel.handleClick}>{field}</div>;
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

### Step 3: Create View Component

```typescript
function MyComponent(props: MyViewProps) {
    // Create model — init() and dispose() are called automatically
    const viewModel = useComponentModel(props, MyViewModel, defaultMyViewState);

    // Subscribe to state (only fields needed for rendering)
    const { isOpen, selectedIndex } = viewModel.state.use((s) => ({
        isOpen: s.isOpen,
        selectedIndex: s.selectedIndex,
    }));

    // Render - no logic, just bind handlers and render
    return (
        <div
            ref={viewModel.setContainerRef}
            onClick={() => viewModel.handleClick(0)}
            onKeyDown={viewModel.handleKeyDown}
        >
            {isOpen && <Dropdown selectedIndex={selectedIndex} />}
        </div>
    );
}
```

**Note:** `useComponentModel` automatically calls `init()` after the first render and `dispose()` on unmount. No `useEffect` boilerplate is needed in the View.

## Runtime-neutral model, two view adapters

`TComponentModel` owns props, state, handlers, and computed behavior. A React View uses
`useComponentModel`; a vanilla View uses `createComponentModelDriver`. Both adapters pump props
before initialization and dispose the model owner, but only the React adapter evaluates registered
model effects. A vanilla-driven model must have zero `TComponentModel.effect()` registrations; the
driver rejects such a model at mount because those effects depend on React's render timing.

The model remains independent of the DOM. A React View renders JSX and uses React event handlers;
a vanilla View owns a stable DOM root and uses native events. Adapters belong at the boundary, not
inside model methods or ordinary component props.

## Vanilla lifecycle

`VanillaView<P>` is the framework-free lifecycle base at
[`src/renderer/uikit/shared/vanilla-view.ts`](../../src/renderer/uikit/shared/vanilla-view.ts).
Every class passed to `mountVanilla` declares a public constructor because the base constructor is
protected:

```typescript
class ExampleView extends VanillaView<ExampleProps> {
    public constructor(props: ExampleProps) {
        super(props);
    }
}
```

The constructor creates the stable root and may construct the model driver and view-owned state,
but it does not create child DOM, listeners, subscriptions, timers, or measurements. Constructor-
created resources register `own()` cleanup immediately. `mount()` builds children and installs
bindings; the owner attaches the root before calling it when layout measurement matters. An
`update(props)` before mount stores props without calling `onUpdate`; `onMount()` renders from the
stored props. Later updates modify existing DOM without replacing the root.

`claimViewOwnership()` and `child()` only establish ownership; they do not mount the child. An owner
that claims a view directly must mount it exactly once before handing its root to a keyed list, slot,
or other structural inserter, and must arrange disposal itself when it is not using `child()`.

Disposal is idempotent and depth-first: owned children are disposed first, then registered
resources in FIFO registration order, then `onDispose()`. Every cleanup is attempted and the first
error is rethrown after the full cleanup snapshot. The base makes the view inert but does not
detach its root; the adapter or structural helper that attached the root owns detachment.

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
initial application is immediate and the callback is guarded after disposal. Do not use `bind` as
a replacement for all DOM work: structure, input/event feedback, root attributes, focus, and
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

DOM structure should use `document.createElement`, explicit properties, and `append`. Static,
code-owned `innerHTML` is acceptable when clearer, but runtime data must never be interpolated
into markup. `replaceChildren` is allowed for a region the view owns outright, never for a
[`KeyedList`](../../src/renderer/uikit/shared/keyed-list.ts)-managed container. For conditional
owned roots, use [`SubtreeSwap`](../../src/renderer/uikit/shared/subtree-swap.ts); both helpers
are direct imports from `uikit/shared/`, not public `uikit/index.ts` exports.

## Virtualized DOM views

Large collection views use [`VirtualGrid`](../../src/renderer/uikit/VirtualGrid/) rather than a
React render loop. `VirtualGridModel` owns the measured render window, sticky-region geometry,
scroll/resize handling, dirty-cell information, and the pooled elements that have scrolled out of
view. `VirtualGridView` owns the DOM shell and schedules paints from the model's repaint callback.

The cell contract is deliberately framework-free: `renderCell` returns an `HTMLElement` or
`undefined`, and the engine applies the computed pixel geometry to that element. A cell renderer
should update an existing `previous` element when possible, use `recycle()` only for a detached
pooled element, and overwrite every property it owns because pooled elements retain their previous
contents, attributes, classes, and listeners. The engine's `RerenderInfo` is a dirty set: report the
smallest changed scope (`cells`, `rows`, `columns`, or `all`) so a state change does not repaint
unrelated visible cells.

`ListBoxView` and `TreeView` compose this engine for virtualized rows. Their model state and view
props must expose every value that changes cell output through a stable repaint signature or an
explicit state-to-view callback. Do not rely on an incidental parent render to recreate a row
renderer: in a vanilla view there is no render pass to hide a missing dependency. Geometry that
depends on a scrollbar or a newly attached container is recomputed from the view's measured DOM,
and scroll-to-row requests that arrive before a usable paint remain pending until the paint path
can satisfy them.

## Effects and the vanilla driver

Model effects are a React compatibility mechanism. `useComponentModel` can evaluate a dependency-
based effect during a later render after the first mount, so effects must not synchronously write
to another React-backed model or perform work that must be commit-timed. Keep DOM measurement and
layout reads in the View's commit-timed React effect or vanilla mount/update hook. Async model work
must be cancellable and must not publish after disposal.

For a vanilla view, use `createComponentModelDriver` from
[`src/renderer/core/state/model.ts`](../../src/renderer/core/state/model.ts), pump updates through
`driver.update(props)`, call `driver.mount()` from the view's mount hook, and register
`driver.dispose()` with `own()` when the driver is constructed. The driver performs the initial
prop pump and rejects registered effects. It also disposes an explicitly-owned model even when the
view is disposed before mount; this differs from an uncommitted React render, which never runs its
unmount effect.

## Choosing a boundary adapter

Use [`mountVanilla`](../../src/renderer/uikit/shared/mount.tsx) when a React tree needs to host a
converted vanilla component. Its host component is module-level and stable, attaches the view root
before `mount()`, skips the redundant first update, and replaces the instance only when the
constructor identity changes. Use [`mountReact`](../../src/renderer/uikit/shared/mount.tsx) only
when a vanilla view temporarily owns a React subtree for which no vanilla equivalent exists. The
vanilla view owns that host element; the returned disposer owns the React root. Neither adapter
should be used for ordinary DOM nodes, whole-application mounting, or to avoid converting a parent
or child that is already in scope.

The concrete end-to-end reference is
[`PathInputView`](../../src/renderer/uikit/PathInput/PathInputView.tsx), which combines the
driver, `bind`, `KeyedList`, native events, static CSS, and a deliberately local `mountReact`
bridge.

### Hosting an imperative widget

An imperative third-party widget belongs in a `VanillaView`, with a thin React face only when a
React tree still needs to host it. The view owns widget creation, subscriptions, model ownership,
and disposal; the face calls `mountVanilla` and must not recreate that lifecycle in hooks. A mount
callback should return the view instance when consumers need imperative operations, because
`mountVanilla` otherwise exposes only the mounted DOM root. The view can expose the raw widget
through a deliberately named escape hatch such as `getEditor()` without making consumers depend on
the widget for lifecycle or synchronization policy.

For uncontrolled widgets, distinguish mount-only initial props from later commands. A prop named
`initialValue` is not a controlled value: subsequent external writes go through a view method, which
owns equality checks, callback suppression, and any undo-preserving write sequence. Ownership-aware
views must distinguish owned and borrowed models, release displaced owned models only after the
widget no longer references them, never dispose borrowed models, and defer disposal when the widget
releases references asynchronously. Widget geometry belongs to scoped static CSS on the view root,
not to a generic adapter prop.

For a React-valued slot inside a vanilla view, use `fillSlot` from
[`uikit/shared/fill-slot.ts`](../../src/renderer/uikit/shared/fill-slot.ts). It owns the supplied
host, reuses the nested React root when the slot remains React-backed, and defers disposal when a
React root must be released during another React commit. Do not mutate a fill-slot host directly;
the host's direct-child shape is part of the component contract. Use `mountReactHandle` directly
only when the view owns a deliberate multi-node React bridge or needs to retain a render handle.

## Before and after: the same model, two view runtimes

```typescript
// React view
function PathInput(props: PathInputProps) {
    const model = useComponentModel(props, PathInputModel, defaultPathInputState);
    const { open } = model.state.use((state) => ({ open: state.open }));
    return <input data-type="path-input" data-state={open ? "open" : "closed"} />;
}

// Vanilla view
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

The two views share the model and state contract; they do not share a React callback-slot API.

## Effect and Memo Primitives

`TComponentModel` provides `effect()` and `memo()` — model-level equivalents of React's `useEffect` and `useMemo`. These allow ALL logic to live in the Model, making Views pure render functions.

### effect(callback, depsFactory?)

Register a side effect with dependency tracking. Call in `init()` to set up effects that react to prop/state changes.

```typescript
class MyViewModel extends TComponentModel<MyState, MyProps> {
    init() {
        // Effect with deps — re-runs when filePath changes
        // Cleanup runs automatically before re-run and on unmount
        this.effect(
            () => {
                const watcher = new FileWatcher(this.props.filePath, this.onChange);
                return () => watcher.dispose(); // cleanup function
            },
            () => [this.props.filePath] // deps factory
        );

        // Effect with no deps — runs once (like useEffect(fn, []))
        this.effect(() => {
            window.addEventListener("resize", this.onResize);
            return () => window.removeEventListener("resize", this.onResize);
        });
    }
}
```

**How it works:**
- Effects are registered in `init()` (called once after first render)
- `setPropsInternal()` evaluates all effect deps on each render cycle
- If deps changed: run cleanup of previous execution, then run callback
- `onUnmountInternal()` runs all remaining cleanups
- No deps = runs once on init, cleanup on unmount

### memo(computeFn, depsFactory)

Create a cached computation with dependency tracking. Recomputes only when dependencies change.

```typescript
class MyViewModel extends TComponentModel<MyState, MyProps> {
    // Cached computation — recalculates only when items change
    filteredItems = this.memo(
        () => this.props.items.filter(i => i.active),
        () => [this.props.items]
    );

    // In View: model.filteredItems.value
}
```

**How it works:**
- Returns an object with `.value` getter
- On `.value` access, checks if deps changed since last computation
- If changed: recompute, cache, return new value
- If same: return cached value

### Lifecycle Summary

| Primitive | React Equivalent | Where to Define | When Evaluated |
|-----------|-----------------|-----------------|----------------|
| `this.effect(cb)` | `useEffect(cb, [])` | `init()` | Once on init, cleanup on unmount |
| `this.effect(cb, deps)` | `useEffect(cb, deps)` | `init()` | Each render cycle when deps change |
| `this.memo(fn, deps)` | `useMemo(fn, deps)` | Class body or `init()` | On `.value` access when deps change |
| `init()` | `useEffect(() => init(), [])` | Class | Once, after first render |
| `dispose()` | `useEffect(() => () => dispose(), [])` | Class | Once, on unmount |

### Render-phase effect constraint

`useComponentModel` calls `setPropsInternal(props)` while rendering. After `init()` has
registered an effect, a dependency-based `this.effect()` may therefore run during a later render
when its dependencies change; the first evaluation still occurs after mount. Treat model effects
as render-phase-capable code:

- Do not synchronously update another React-backed model or component from a dependency-based
  effect. Such a write can produce a render-phase update warning or a render loop.
- Keep prop-to-state seeding behind an identity guard in `setProps()`, because `setPropsInternal()`
  runs on every parent render.
- Keep DOM measurement, layout reads, and other work that must be commit-timed in the View's
  `useEffect`. Model effects are appropriate for subscriptions, timers, and asynchronous results
  when their cleanup and cancellation are explicit.
- Do not enable Strict Mode without auditing these effects for double invocation; model effects
  are not a substitute for React's commit-timed effect contract.

When a model state has many fields, subscribe to the stored fields the View actually renders with
`state.use(selector)`. Return stored values from selectors; put derived arrays or objects in a
model `memo()` rather than allocating them inside the selector, or structural/reference comparison
will cause unnecessary renders.

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

### Move useEffect to Model Effects

```typescript
// Before — useEffect in View
useEffect(() => {
    viewModel.init();
    return () => viewModel.dispose();
}, []);

useEffect(() => {
    viewModel.updateFitScale();
}, [src]);

// After — auto init/dispose + this.effect() in Model
class MyViewModel extends TComponentModel<State, Props> {
    init() {
        this.effect(
            () => { this.updateFitScale(); },
            () => [this.state.get().src]
        );
    }
    dispose() { /* cleanup */ }
}
// View: no useEffect needed at all
```

### Move useMemo to Model Memo

```typescript
// Before — useMemo in View
const displaySize = useMemo(() => calcSize(zoom, src), [zoom, src]);

// After — this.memo() in Model
class MyViewModel extends TComponentModel<State, Props> {
    displaySize = this.memo(
        () => calcSize(this.state.get().zoom, this.state.get().src),
        () => [this.state.get().zoom, this.state.get().src]
    );
}
// View: model.displaySize.value
```

## Examples in Codebase

| Component | Model | Description |
|-----------|-------|-------------|
| `GridEditor` | `GridPageModel` | Complex data grid with filters, sorting |
| `MarkdownView` | `MarkdownViewModel` | Markdown preview with scroll state |
| `ImageViewer` | `ImageViewModel` | Image viewer with zoom/pan |
| Settings sections | `BrowserProfilesSectionModel`, `McpSectionModel`, `DefaultBrowserSectionModel` | Async settings operations and external status subscriptions |

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
4. **Don't use useEffect/useMemo in View for logic** - Use `this.effect()` and `this.memo()` in the Model instead
5. **Don't register effects outside init()** - Effects should be registered in `init()`, not in `setProps()` or event handlers (would create duplicates on each call)
6. **Don't use model effects for commit-timed DOM work** - Keep layout reads and measurement in the View's `useEffect`
7. **Don't synchronously write across model boundaries from an effect** - Use an event/command boundary or defer the bridge until after commit
