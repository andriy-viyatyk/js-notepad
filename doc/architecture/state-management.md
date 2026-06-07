# State Management

## Overview

persephone uses a custom reactive state system built on Zustand + Immer:
- Immutable updates via Immer's `produce()`
- React hooks for subscriptions with shallow comparison
- Type-safe state access via `TOneState<T>`

All state primitives live in `/src/renderer/core/state/`.

## When to Use What

| Primitive | Use case | Location |
|-----------|----------|----------|
| `TOneState<T>` | Simple reactive value (standalone or inside a model) | Anywhere |
| `TGlobalState<T>` | Application-wide state (cleared on logout) | `api/` modules |
| `TComponentState<T>` | Component-scoped state (with `useComponentModel`) | React components |
| `TModel<T>` | Stateful business logic (non-React) | Models, services |
| `TComponentModel<T, P>` | React component model with props, effects, memos | React components |
| `TDialogModel<T, R>` | Dialog/modal with async result | Dialogs |
| `EditorModel<T, R>` | Editor instance (every editor subclasses this) | Editors |

## Core Primitives

### TOneState\<T\>

Foundation of all state. Wraps Zustand store with Immer updates.

```typescript
const count = new TOneState(0);
count.get();              // 0
count.set(5);             // direct set
count.update(s => s + 1); // Immer update (for objects/arrays)
count.use();              // React hook — re-renders on change
count.use(s => s > 3);    // Selective subscription with shallow compare
count.subscribe(() => {}); // Non-React listener
count.clear();            // Reset to default
```

### TGlobalState\<T\>

Extends `TOneState` — identical API, but auto-clears on logout. Used for application-wide state in Object Model implementations.

```typescript
const globalState = new TGlobalState<AppState>(defaultState);
globalState.update(s => { s.pages.push(newPage); });
```

### TComponentState\<T\>

Extends `TOneState` — identical API. Used with `useComponentModel` for component-scoped state that persists across re-renders.

```typescript
const state = new TComponentState<MyState>({ name: '', items: [] });
state.update(s => {
    s.name = 'Hello';
    s.items.push('item');
});
```

**Design Note:** Both `TGlobalState` and `TComponentState` extend `TOneState` with the same API. The distinction is organizational — `TGlobalState` clears on logout, `TComponentState` is scoped to a React component's lifetime via `useComponentModel`.

### useOptionalState Hook

`useOptionalState(state, selector, defaultValue)` — subscribes to a `TOneState` that may be null. Always calls `useState` + `useEffect` (stable hook count), returns `defaultValue` when state is null. Use this instead of `state?.use()` which is a conditional hook and violates React Rules of Hooks.

```typescript
// Bad — conditional hook, crashes when editor type changes:
const compareMode = editor?.state.use((s) => s.compareMode);

// Good — unconditional hook, safe for optional state:
const compareMode = useOptionalState(editor?.state, (s) => s.compareMode, false);
```

This is especially important for components like `PageContent` and `PageTab` where `page.mainEditor` can change type or become null during navigation.

## Model Classes

### TModel\<T\>

Base class for stateful business logic. Holds a `state` property.

```typescript
class MyModel extends TModel<MyState> {
    doSomething() {
        this.state.update(s => { s.value = 'changed'; });
    }
}
```

### TComponentModel\<T, P\>

React component model with props tracking, effects, and memos. Used with the `useComponentModel` hook.

```typescript
class MyComponentModel extends TComponentModel<State, Props> {
    init() {
        // Called once after first render
        this.effect(() => {
            console.log("value changed:", this.props.value);
        }, () => [this.props.value]);
    }

    dispose() {
        // Called on unmount
    }
}

// In component:
const model = useComponentModel(props, MyComponentModel, defaultState);
```

**Lifecycle:**
1. Mount: creates model, stores in React ref
2. Each render: `setPropsInternal(props)` — updates props, evaluates effects
3. After first render: `init()` called via `useEffect` — registers effects
4. Unmount: `dispose()` called, all effects cleaned up

**Primitives:**
- `this.effect(callback, depsFactory?)` — side effect with dependency tracking (like `useEffect`)
- `this.memo(computeFn, depsFactory)` — cached computation (like `useMemo`)

See [Model-View Pattern](/doc/standards/model-view-pattern.md) for full documentation.

### TDialogModel\<T, R\>

For dialog/modal patterns with async result.

```typescript
class MyDialog extends TDialogModel<State, Result> {
    // close(result) resolves the result promise
    // canClose(result) — optional guard before closing
}
```

## EditorModel Pattern

Located in `/src/renderer/editors/base/`. Every editor (Monaco, Grid, Markdown, Notebook, Todo, Link, Log View, SVG, HTML, Mermaid, Graph, Draw, RestClient, Browser, PDF, Image, Video, etc.) subclasses `EditorModel<TState>`.

### EditorModel\<TState\>

Base class for editor instances. Owns the editor's own state, lifecycle, and (optionally) `IContentHost` composition for text-bearing editors.

```typescript
class GridEditor extends EditorModel<GridState> {
    protected onRestore(): void {
        // Parse initial content from this.contentHost
        this.parseContent(this.contentHost?.state.get().content ?? "");
    }
}
```

**Lifecycle (three-phase):**
1. `applyRestoreData(data)` — apply persisted descriptor fields to the state
2. `switchFrom(oldEditor)` — optional content-host transfer when switching editor types on the same page
3. `restore()` — perform any async setup (content fetch, sub-model init)
4. `dispose()` — cleanup (subscriptions, sub-models, cache files)

**Text-bearing editors** additionally implement `IContentHost` (or compose one) and expose `CONTENT_HOST_TRAIT` so the page-level switch helper can transfer host ownership between editor types without re-reading the file.

### IContentHost

Minimal interface for "something that owns editable text content". Two concrete implementations ship today:

- `TextFileModel` — file-backed (owns file I/O, encryption, pipe, cache)
- `NoteItemEditModel` — notebook-note-backed (no file I/O; state lives in the notebook's JSON)

Editors compose one via `this.contentHost` and read content through it. Switching editor types is a host-ownership transfer — the new editor inherits the existing host (and its content + I/O + encryption state) untouched.

### Host-centric git detection

`TextFileModel` carries an optional `gitRepo: { root: string; branch: string } | null | undefined` in its state (`undefined` = not yet checked, `null` = checked and not a repo). When the setting `git.enabled` is on, detection runs **once** as `filePath` resolves — `git rev-parse --show-toplevel` through the renderer git API (`api/git.ts`, directory-keyed cache) over the main-process `git-service.ts`. Because the host is transferred on every editor switch (not re-created), detection never re-runs as the user switches Monaco → Preview → Diff. Editors read this fact off the shared host rather than detecting per-editor — see the host-state-driven switch offer for `file-diff` in [editors.md](editors.md#editor-switching). The whole subsystem is inert when `git.enabled` is off (the default): no `rev-parse`, no git spawns.

### Content Pipe State (IPipeDescriptor)

Content pipes are serializable for persistence across app restarts. `IPipeDescriptor` stores the provider type/config and transformer chain:

```typescript
interface IPipeDescriptor {
    provider: IProviderDescriptor;   // { type, config }
    transformers: ITransformerDescriptor[];  // [{ type, config }]
    encoding?: string;  // detected encoding (persisted for write-back)
}
```

**Dual pipe pattern:** `TextFileIOModel` maintains two pipes — `primaryPipe` (source file/URL) and `cachePipe` (auto-save). Both share the same transformer chain. The primary pipe's descriptor is stored in `IEditorState.pipe` for restore. The cache pipe is reconstructed on restore from the primary descriptor + `CacheFileProvider`.

**Non-persistent transformers:** `DecryptTransformer` is marked `persistent: false` — it is excluded from serialized descriptors. After restart, encrypted files show as encrypted (user must re-enter password).

**Pipe registry:** `src/renderer/content/registry.ts` maps type strings to factory functions for deserialization (`createPipeFromDescriptor()`).

## Disposable Pattern

Located in `/src/renderer/api/types/common.d.ts` and `/src/renderer/api/internal.ts`.

### IDisposable

Universal cleanup contract. Matches Monaco's own `IDisposable`.

```typescript
interface IDisposable {
    dispose(): void;
}
```

### IEvent\<T\>

Subscribable event. Returns `IDisposable` for uniform cleanup.

```typescript
interface IEvent<T> {
    subscribe(handler: (data: T) => void): IDisposable;
}
```

### DisposableCollection

Groups multiple disposables for bulk cleanup. Used by Object Model implementations.

```typescript
const disposables = new DisposableCollection();
disposables.add(event.subscribe(handler));
disposables.add(anotherEvent.subscribe(otherHandler));
// Later: disposables.dispose();
```

### wrapSubscription

Adapts the older `Subscription<T>` (from `core/state/events.ts`) to the `IEvent<T>` interface.

```typescript
import { wrapSubscription } from "../api/internal";
const onChanged: IEvent<string> = wrapSubscription(mySubscription);
```

### Subscription\<T\>

Event system in `core/state/events.ts`. Built on `EventTarget`. Used internally.

```typescript
const event = new Subscription<string>();
event.send("hello");                    // emit
const sub = event.subscribe(data => {}); // listen
sub.unsubscribe();                       // cleanup
```

### EventChannel\<T\>

Scriptable event channel in `api/events/EventChannel.ts`. Supports both fire-and-forget and async pipeline patterns. Designed for events that user scripts can subscribe to.

```typescript
const channel = new EventChannel<ContextMenuEvent<IFileTarget>>({ name: "fileExplorer.itemContextMenu" });

// Fire-and-forget (sync, event frozen — subscribers observe only, FIFO order)
channel.send(event);

// Async pipeline (LIFO order — newest subscriber runs first, short-circuits on handled)
const ok = await channel.sendAsync(event);

// Subscribe (sync or async handlers)
const sub = channel.subscribe((event) => { event.items.push({ label: "Custom", onClick: () => {} }); });
```

Unlike `Subscription<T>`, `EventChannel` uses a handler array (not `EventTarget`) and supports async pipelines with sequential execution. `send()` uses FIFO order (all handlers always run). `sendAsync()` uses LIFO order (newest subscriber runs first) and short-circuits when `event.handled` is set — this allows scripts registered after bootstrap to intercept events before app handlers.

## Object Model State Pattern

The Object Model (`/src/renderer/api/`) uses these primitives internally. Each API module owns its state and exposes it through typed interfaces.

```typescript
// api/settings.ts — uses TGlobalState internally
class Settings implements ISettings {
    private _state = new TGlobalState<SettingsState>(defaults);

    get theme(): string { return this._state.get().theme; }
    set(key, value) { this._state.update(s => { s[key] = value; }); }
}

// api/pages/ — PagesModel extends TModel
class PagesModel extends TModel<PagesState> {
    // Submodels (PagesQueryModel, PagesNavigationModel, etc.)
    // access this.state for page collection state
}
```

**Key point:** Consumers (React components, scripts) access state through Object Model interfaces (`app.settings`, `app.pages`), not through raw state primitives.

## Using State in Components

### Via Object Model

```typescript
function MyComponent() {
    const theme = app.settings.use("theme");  // subscribe via Object Model
    return <div>Theme: {theme}</div>;
}
```

### Via Model State (direct)

```typescript
function MyEditorView({ model }: { model: TextFileModel }) {
    const { content, modified } = model.state.use(s => ({
        content: s.content,
        modified: s.modified,
    }));
    return <Editor value={content} />;
}
```

### Via useComponentModel

```typescript
function MyWidget(props: WidgetProps) {
    const model = useComponentModel(props, WidgetModel, defaultState);
    const { count } = model.state.use(s => ({ count: s.count }));
    return <div onClick={() => model.increment()}>{count}</div>;
}
```

## Best Practices

### 1. Minimize Subscriptions

```typescript
// GOOD — subscribe to what you need
const { title } = state.use(s => ({ title: s.title }));

// BAD — subscribe to everything (re-renders on any change)
const state = model.state.use();
```

### 2. Use Immer Updates

```typescript
// GOOD — Immer mutation syntax
state.update(s => { s.items.push(newItem); });

// BAD — manual immutable update
state.set({ ...state.get(), items: [...state.get().items, newItem] });
```

### 3. Prefer Object Model Over Raw State

Access state through `app.*` interfaces when available. Only use raw `state.use()` inside the component/editor that owns the state.

### 4. EditorModel for New Editors

When creating a new editor, subclass `EditorModel<T>` and register the EditorModule in `register-editors.ts`. For text-bearing editors that should be switchable from other text views, also implement `IContentHost` (or compose one) and expose `CONTENT_HOST_TRAIT`. See [editor-guide.md](../standards/editor-guide.md) for the full recipe.
