# Model-View Pattern

This document describes the model-view pattern used for complex React components in persephone.

## Overview

The model-view pattern separates UI rendering (View) from business logic and state management (Model):

- **View**: React component function responsible for rendering UI and binding event handlers
- **Model**: Class containing all logic, state, and event handlers

This separation provides:
- Cleaner, more testable code
- No cycled dependencies in hooks
- Possibility for alternative views (desktop/mobile) reusing the same model
- Better code organization for complex components

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

Zustand-based state that works both inside and outside React:

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

    handleKeyDown = (e: React.KeyboardEvent) => {
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
