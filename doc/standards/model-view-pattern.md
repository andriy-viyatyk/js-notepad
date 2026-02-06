# Model-View Pattern

This document describes the model-view pattern used for complex React components in js-notepad.

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
    // Create model
    const viewModel = useComponentModel(props, MyViewModel, defaultMyViewState);

    // Subscribe to state (only fields needed for rendering)
    const { isOpen, selectedIndex } = viewModel.state.use((s) => ({
        isOpen: s.isOpen,
        selectedIndex: s.selectedIndex,
    }));

    // Lifecycle via useEffect
    useEffect(() => {
        viewModel.init();
        return () => viewModel.dispose();
    }, []);

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

### Keep useEffect for Lifecycle

```typescript
// useEffect stays in component, calls model methods
useEffect(() => {
    viewModel.init();
    return () => viewModel.dispose();
}, []);
```

### Keep useMemo When Needed

Complex computations can stay as `useMemo` in the component, or become getters/methods in the model.

## Examples in Codebase

| Component | Model | Description |
|-----------|-------|-------------|
| `GridEditor` | `GridPageModel` | Complex data grid with filters, sorting |
| `MarkdownView` | `MarkdownViewModel` | Markdown preview with scroll state |
| `ImageViewer` | `ImageViewModel` | Image viewer with zoom/pan |

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
4. **Don't forget init/dispose** - Always clean up event listeners
