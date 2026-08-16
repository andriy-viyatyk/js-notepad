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

### Large Accumulating Collections Don't Belong in State

`update()` runs Immer `produce`, so appending to an array inside state **copies that array on every
call**. That is invisible at UI scale and quadratic at data scale: a stream that appends to a list
of `n` items pays O(n) per message, plus the re-render each new array identity triggers.

When a collection grows without a fixed bound — streamed search results, log lines, an import
buffer — keep it as a plain field on the model and put only a change signal in state:

```typescript
// BAD - every arriving item copies the whole array
this.state.update(s => { s.results.push(...rows); });

// GOOD - O(k) append; the view watches a counter instead of the array identity
this.allResults.push(...rows);
this.state.update(s => { s.resultsVersion += 1; });
```

The view then depends on `resultsVersion` rather than the array, and reads the rows from the model
when it rebuilds. Batch the producer as well where you control it — one state write per flush
rather than per item. `components/file-search/FileSearchModel.ts` does both.

This is a scale exception, not a general licence: ordinary component state stays in `TOneState`,
where Immer's copying is what makes selective subscription and change detection work.

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

Located in `/src/renderer/editors/base/`. Every editor (Monaco, Grid, Markdown, Notebook, Link, Log View, SVG, HTML, Mermaid, Graph, Draw, RestClient, Browser, PDF, Image, Video, etc.) subclasses `EditorModel<TState>`.

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

**Dual pipe pattern:** `TextFileIOModel` maintains two pipes — `primaryPipe` (source file/URL) and `cachePipe` (auto-save) — through the `PipePair` owner. Both share the same transformer chain. The primary pipe's descriptor is stored in `IEditorState.pipe` for restore. The cache pipe is reconstructed on restore from the primary descriptor + `CacheFileProvider`, and primary replacement atomically refreshes the pair.

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

### Settings actuation and the idempotency rule

Settings live in a JSON5 file under the user-data folder, watched by a `FileWatcher`. A setting
that merely gets *read* needs nothing beyond the state update; a setting that *does* something —
`mcp.enabled`, `mcp.browser-tools.enabled`, `mneme.enabled`, `script-library.path` — is actuated
by a subscriber to `settings.onChanged`. Both write paths therefore have to emit:

- **`set()`** emits for the key it changed.
- **The watcher reload** diffs previous against new settings and emits per changed key, so an
  edit made to the file outside the app takes effect with no restart. The diff runs over the
  **union** of both key sets, because deleting a key restores its default and that is as much a
  change as an edit. Comparison is by value (JSON form for objects and arrays) — reference
  equality would report every array setting as changed on every reload.
- **The initial load must not emit.** Startup already starts the MCP server and Mneme explicitly
  after `settings.wait()`; emitting there would start each of them twice.

The consequence worth internalizing: **every renderer window has its own watcher and its own
subscribers, so a global service can be started or stopped once per open window.** Anything
`onChanged` actuates must be idempotent — `startMneme`/`startMcpHttpServer` guard on a running
instance *and* on an in-flight start promise (the flag alone leaves a window in which two callers
both reach `listen()` on the same port), and the stop functions no-op when nothing is running.
This is not a new constraint introduced by file watching; every window already actuated these at
startup. File watching only makes it easy to hit.

Most `onChanged` subscribers are legitimately per-window — the script-library service, the board
env store, the Mneme connection and status models — so the emit is not suppressed outside the
originating window. Global services are the exception that must absorb it.

**Not every setting that affects the main process needs actuating, though.** The main process
never loads the settings file, so a value it depends on has to travel over IPC — but pushing it
eagerly is only worth it when main must *act* the moment the value changes, as the MCP server and
Mneme do. When main instead needs the value at a specific decision point, the cheaper shape is to
let the renderer resolve it and send the answer along with whatever message it was already
sending. `window.close-to-tray` works this way: the renderer folds it into its `setCanQuit` reply
when a window is closing, so there is no mirrored copy in main to keep in sync, no per-window
divergence, and no startup window in which a stale default would be consulted. Prefer this
whenever the decision point is already a renderer→main message.

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

### 2. Derive Computed Values Inside the Selector

`use(selector)` re-renders only when the selector's **result** changes (structural compare via
`compareSelection`). A helper that reads state through `this.state.get()` at render time is therefore
invisible to that comparison — if the state it reads is not also part of the selector's result, the
component never re-renders when it changes, and the stale value persists until some *other* selected
field happens to change.

```typescript
// BAD — getViewMode() reads data.state.*ViewMode, which the selector never returns.
// Changing the view mode updates the state but produces an equal selection: no re-render.
const { searchText } = model.state.use(s => ({ searchText: s.searchText }));
const viewMode = model.getViewMode();

// GOOD — derived inside the selector, so it participates in the comparison
const { searchText, viewMode } = model.state.use(s => ({
    searchText: s.searchText,
    viewMode: model.getViewMode(s),
}));
```

Give such helpers an optional state-snapshot parameter (`getViewMode(snapshot?)`) so the selector
stays pure instead of reaching back into `this.state.get()`.

This failure mode is easy to miss because it looks like a working feature: the value updates as soon
as anything else triggers a render. Prefer deriving from state over caching computed values in state —
but when a getter derives from state, call it through the selector.

### 3. Use Immer Updates

```typescript
// GOOD — Immer mutation syntax
state.update(s => { s.items.push(newItem); });

// BAD — manual immutable update
state.set({ ...state.get(), items: [...state.get().items, newItem] });
```

### 4. Prefer Object Model Over Raw State

Access state through `app.*` interfaces when available. Only use raw `state.use()` inside the component/editor that owns the state.

### 5. EditorModel for New Editors

When creating a new editor, subclass `EditorModel<T>` and register the EditorModule in `register-editors.ts`. For text-bearing editors that should be switchable from other text views, also implement `IContentHost` (or compose one) and expose `CONTENT_HOST_TRAIT`. See [editor-guide.md](../standards/editor-guide.md) for the full recipe.
