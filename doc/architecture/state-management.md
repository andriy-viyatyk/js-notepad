# State Management

## Overview

js-notepad uses a custom Zustand-like state management system with:
- Immutable updates via Immer
- React hooks for subscriptions
- Type-safe state access

## Core Primitives

Located in `/core/state/`:

### TOneState

Simple single-value state container.

```typescript
const count = new TOneState(0);
count.set(5);
count.get(); // 5
count.use(); // React hook - subscribes to changes
```

### TComponentState

Component-level state with Immer updates. Extends TOneState.

```typescript
interface MyState {
  name: string;
  items: string[];
}

const state = new TComponentState<MyState>({
  name: '',
  items: [],
});

// Immer update
state.update((s) => {
  s.name = 'Hello';
  s.items.push('item');
});

// Selective subscription
const { name } = state.use((s) => ({ name: s.name }));
```

TComponentState is typically used with `useComponentModel` hook (see TComponentModel below) - the hook creates a TComponentModel instance with TComponentState when the component mounts and keeps it in a React ref throughout the component lifecycle.

### TGlobalState

Global application state. Extends TOneState with the same API as TComponentState.

```typescript
const globalState = new TGlobalState<AppState>(defaultState);

// Same Immer update API as TComponentState
globalState.update((s) => {
  s.pages.push(newPage);
});
```

**Design Note:** Both TGlobalState and TComponentState extend TOneState and have identical APIs. The distinction is logical/organizational:

- **TGlobalState** - For application-wide state (stores in `/store/`)
- **TComponentState** - For component-level state (used with `useComponentModel`)

This separation allows different lifecycle management if needed (e.g., clearing global state on logout in multi-user applications). In js-notepad, this separation provides a clean organizational boundary between app stores and component models.

## Model Classes

### TModel

Base class for stateful business logic.

```typescript
class MyModel extends TModel<MyState> {
  doSomething() {
    this.state.update((s) => {
      s.value = 'changed';
    });
  }
}
```

### TComponentModel

For component-specific models with props. Used with the `useComponentModel` hook from `model.ts`.

```typescript
class MyComponentModel extends TComponentModel<State, Props> {
  init() {
    // Called once on mount
  }

  onPropsChange(prevProps: Props, props: Props) {
    // Called when props change
  }
}

// In component:
const model = useComponentModel(props, MyComponentModel, defaultState);
```

**How useComponentModel works:**
1. On mount: creates model instance, stores it in React ref, calls `init()`
2. On props change: calls `onPropsChange()` with previous and new props
3. Throughout lifecycle: model instance persists in ref (not recreated on re-render)
4. Model contains TComponentState for managing component state

### TDialogModel

For dialog/modal patterns.

```typescript
class MyDialog extends TDialogModel<State, Result> {
  async show(): Promise<Result> {
    // Returns when dialog closes
  }
}
```

## Application Stores

Located in `/store/`:

### pages-store.ts

```typescript
// Page collection management
pagesModel.openFile(filePath);
pagesModel.closePage(pageId);
pagesModel.showPage(pageId);
pagesModel.getGroupedPage(pageId);
```

### files-store.ts

```typescript
// File I/O operations
filesModel.getFile(filePath, encoding);
filesModel.saveFile(filePath, content, encoding);
filesModel.saveCacheFile(id, content);
filesModel.getCacheFile(id);
```

### app-settings.ts

```typescript
// User preferences
appSettings.get('theme');
appSettings.set('theme', 'dark');
appSettings.use('theme'); // React hook
```

## State in Components

### Using Store State

```typescript
function MyComponent() {
  // Subscribe to specific values
  const { pageCount } = pagesModel.state.use((s) => ({
    pageCount: s.pages.length,
  }));

  return <div>{pageCount} pages</div>;
}
```

### Using Model State

```typescript
function EditorView({ model }: { model: TextFileModel }) {
  // Subscribe to model state
  const { content, modified } = model.state.use((s) => ({
    content: s.content,
    modified: s.modified,
  }));

  return <Editor value={content} />;
}
```

## Best Practices

### 1. Minimize Subscriptions

```typescript
// GOOD - subscribe to what you need
const { title } = state.use((s) => ({ title: s.title }));

// BAD - subscribe to everything
const state = model.state.use();
```

### 2. Colocate Related State

Keep related state in the same store/model rather than splitting across many small stores.

### 3. Use Immer Updates

```typescript
// GOOD - Immer mutation syntax
state.update((s) => {
  s.items.push(newItem);
});

// BAD - manual immutable update
state.set({
  ...state.get(),
  items: [...state.get().items, newItem],
});
```

### 4. Keep Stores Focused

Each store has a clear responsibility:
- `pages-store` - page collection
- `files-store` - file operations
- `app-settings` - preferences

Don't mix concerns in a single store.
