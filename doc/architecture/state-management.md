# State Management

## Overview

persephone uses a custom reactive state system built on `TOneState` + Immer:
- Immutable updates via Immer's `produce()`
- Synchronous subscriptions, with structural comparison for plain objects and reference comparison for other values
- Type-safe state access via `TOneState<T>`

All state primitives live in `/src/renderer/core/state/`.

## When to Use What

| Primitive | Use case | Location |
|-----------|----------|----------|
| `TOneState<T>` | Simple reactive value (standalone or inside a model) | Anywhere |
| `TGlobalState<T>` | Application-wide state (cleared on logout) | `api/` modules |
| `TComponentState<T>` | Component-scoped state | `TComponentModel` instances |
| `TModel<T>` | Stateful business logic (non-React) | Models, services |
| `TComponentModel<T, P>` | Component model with props, state, handlers, and synchronously maintained derived fields; driven by an explicit lifecycle adapter | `VanillaView` classes |
| `TDialogModel<T, R>` | Dialog/modal with async result | Dialogs |
| `EditorModel<T, R>` | Editor instance (every editor subclasses this) | Editors |

## Core Primitives

### TOneState\<T\>

Foundation of all state. Stores the current value and dispatches synchronous listeners around Immer updates.

```typescript
const count = new TOneState(0);
count.get();              // 0
count.set(5);             // direct set
count.update(s => s + 1); // Immer update (for objects/arrays)
count.subscribe(() => {}); // Full-state listener
count.subscribe((isLarge) => {}, (value) => value > 3); // Selective subscription
count.clear();            // Reset to default
```

`TOneState` is also the bridge for values shared by native consumers. The active renderer theme is
held in `theme/theme-state.ts`; views use `get()` and selector-aware `subscribe()`. A theme
mutation updates the CSS variables first and publishes the state last, so subscribers observe
the already-applied theme.

### TGlobalState\<T\>

Extends `TOneState` — identical API, but auto-clears on logout. Used for application-wide state in Object Model implementations.

```typescript
const globalState = new TGlobalState<AppState>(defaultState);
globalState.update(s => { s.pages.push(newPage); });
```

### TComponentState\<T\>

Extends `TOneState` — identical API. Used for component-scoped state owned by a model and view.

```typescript
const state = new TComponentState<MyState>({ name: '', items: [] });
state.update(s => {
    s.name = 'Hello';
    s.items.push('item');
});
```

**Design Note:** Both `TGlobalState` and `TComponentState` extend `TOneState` with the same API. The distinction is organizational — `TGlobalState` clears on logout, while `TComponentState` is scoped to a component model's lifetime via `createComponentModelDriver`.

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

When a versioned update changes only part of a rendered collection, publish its invalidation scope
next to the version in the same state write. A consumer can use an index list, a contiguous range,
or `"all"` for a full replacement; it should pass the smallest valid scope to the virtualized
grid. The scope is state, not a destructive model-side `consume` operation, so multiple readers
observe the same update. `LogViewEditor` uses `renderChange` with all three forms, while
`FileSearchModel` publishes its first changed row. Both views retain a development-only warning
when the version advances with an unchanged row count but no rows are marked, catching a producer
that forgot to describe its change.

Plain model collections may use shallow copy-on-write records when several interactive producers
hold references to them. Shallow-freeze a record at the model boundary when accidental mutation
must fail loudly, replace the record on edit, and leave nested containers governed by their own
ownership rules. Rendering adapters may also shallow-copy a source record when they must add
view-derived or simulation fields; the serialized source stays untouched.

This is a scale exception, not a general licence: ordinary component state stays in `TOneState`,
where Immer's copying is what makes selective subscription and change detection work.

### Synchronous-write hazards in vanilla views

Vanilla views share mutable fields and per-row records with the synchronous store-notification
path. Treat every store write as a possible immediate refresh. A handler must capture any value it
needs before the write, or derive it from a stable model/key afterward; never read a mutable view
field or row record after a write that can notify the view. A declarative handler often captures a
per-render constant, which hides this race; a `VanillaView` field does not have that snapshot behavior.

Related values can also reach an imperative widget over different channels. Establish direct
widget data before publishing state that synchronously projects companion options. In
`GridEditor.setRows`, rows go directly to the grid while columns flow through `state.update()` into
`GridBodyView.applyProjection()` and `DataGridView.setOptions()`. Publishing columns first makes the
grid validate them against its previous rows; handing over the rows first is therefore load-bearing.

Two related lifecycle details are easy to misread:

- `VanillaView.update(props)` assigns `this.props` before calling `onUpdate(props)`. Inside that
  hook, `this.props` is already the new value, never the previous props. Keep an old-value
  comparison in the view if the transition itself matters.
- A UIKit primitive's own `data-type` is part of its styling contract. Do not override it with an
  app-specific value. Attribute-keyed CSS rules, including selection, drag, hover, and slot rules,
  will no longer match; use an additive class or a separate data attribute instead.

### Subscribing from a native view

Use `VanillaView.bind()` for a state value that projects into the DOM. It applies once immediately,
then subscribes with the same selector comparison used by `TOneState`:

```typescript
this.bind(model.state, (state) => state.compareMode, (compareMode) => {
    if (compareMode) toggle.dataset.active = "";
    else delete toggle.dataset.active;
});
```

Use `state.get()` for one-off reads and `state.subscribe(listener)` when a full-state notification
is needed. The subscription is synchronous and must be disposed with the owning view.

## Model Classes

### TModel\<T\>

Base class for stateful business logic. Holds a `state` property and provides protected `own()` plus
an idempotent `dispose()` for model-owned cleanup functions. Cleanup functions are released in
registration order; all are attempted and the first failure is rethrown.

```typescript
class MyModel extends TModel<MyState> {
    doSomething() {
        this.state.update(s => { s.value = 'changed'; });
    }
}
```

### TComponentModel\<T, P\>

Component model with props tracking, explicit lifecycle hooks, and synchronously maintained derived
fields.
Framework-free views use `createComponentModelDriver` from `core/state/model.ts`.

```typescript
class MyComponentModel extends TComponentModel<State, Props> {
    init() {
        // Called once by driver.mount()
        this.own(() => { /* release model-owned resources */ });
    }

    setProps = (props: Props) => {
        // Called after props are assigned, including the initial prop pump
        console.log("props changed:", props.value);
    }
}

const driver = createComponentModelDriver(props, MyComponentModel, defaultState);
driver.mount();
```

**Lifecycle:**
1. Construction: creates the model and performs the initial prop pump
2. `mount()`: calls `init()` once
3. `update(props)`: pumps new props through `setProps()`
4. `dispose()`: calls the model's cleanup hook and drains owned resources

The driver performs the initial prop pump before `mount()`, so a model that only responds to
post-mount updates should guard `setProps()` with an initialization flag. A model shared with a
vanilla view must put DOM work in the view lifecycle or in explicit model methods, and must keep
asynchronous work cancellable after disposal.

**Derived values:**
Keep values derived from props or state as plain model fields. Recompute them in `setProps()` or in
the setter that changes their inputs, before any state notification or view consequence observes
the write. This makes invalidation visible at the write site and avoids a lazy cache whose value can
become stale during a synchronous state update. `TComponentModel` has no `memo()` primitive.

See [Model-View Pattern](/doc/standards/model-view-pattern.md) for full documentation.

For dependency-gated prop work, keep a fixed-length dependency signature in the model and compare
it explicitly (the shared `depsChanged` helper and `uikit/shared/deps-gate.ts` use
`Object.is` slot comparison). Model subscriptions belong in `init()` and are released through
`own()`; DOM reads and layout work belong in the `VanillaView` mount/update hooks.

### TDialogModel\<T, R\>

For dialog/modal patterns with async result.

```typescript
class MyDialog extends TDialogModel<State, Result> {
    // close(result) resolves the result promise
    // canClose(result) — optional guard before closing
}
```

### ComponentQueue

`ComponentQueue` is the model-to-view mailbox for imperative commands that do not belong in
serializable component state. It has a fire-and-forget event channel (`send`/`subscribe`) and a
request/reply channel (`execute`/`register`). Use the queue owned by the enclosing `EditorModel`
for editor view commands so it has a clear lifecycle; `EditorModel.dispose()` disposes that queue
and rejects requests that are still pending when the editor closes.

The queue may receive commands before its view mounts, so registration drains them in FIFO order.
Keep command payloads typed at the editor boundary and use model methods/state for durable values;
the queue is for transient DOM or view operations, not a second state store.

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

Renderer-owned cleanup uses function disposers. `DisposableStore` is the common primitive for
grouping them; it lives in `/src/renderer/core/utils/DisposableStore.ts`.

```typescript
const store = new DisposableStore();
const release = store.add(event.subscribe(handler));
// Release one item early, or let the owner drain the store:
release();
store.dispose();
```

`DisposableStore.add()` returns an idempotent release handle and rejects new registrations after
the store is closed. `dispose()` snapshots and clears the store, attempts every cleanup in FIFO
order, and rethrows the first failure after the sweep.

### IDisposable

Resource object contract used by Monaco and other APIs that expose an object-based resource.
It is separate from the renderer's subscription disposer shape.

```typescript
interface IDisposable {
    dispose(): void;
}
```

### IEvent\<T\>

Subscribable event. Its `subscribe()` returns a `() => void` disposer.

```typescript
interface IEvent<T> {
    subscribe(handler: (data: T) => void): () => void;
}
```

### DisposableCollection

Groups `IDisposable` resource objects for bulk cleanup. It is retained for object-based resources;
event subscriptions use function disposers and belong in `DisposableStore` or a view/model owner.

```typescript
const disposables = new DisposableCollection();
disposables.add(monacoResource);
disposables.add(anotherMonacoResource);
// Later: disposables.dispose();
```

### wrapSubscription

Adapts the internal `Subscription<T>` (from `core/state/events.ts`) to the public `IEvent<T>`
interface. Both expose a function disposer.

```typescript
import { wrapSubscription } from "../api/internal";
const onChanged: IEvent<string> = wrapSubscription(mySubscription);
```

### Subscription\<T\>

Compatibility event wrapper in `core/state/events.ts`, implemented on the same listener-array
primitive as `Emitter<T>`. It is used for the renderer's named global broadcasts.

```typescript
const event = new Subscription<string>();
event.send("hello");                    // emit
const release = event.subscribe(data => {}); // listen
release();                               // cleanup
```

`Emitter<T>` exposes the underlying `event` function and `fire(value)` operation. Its listener
array is snapshotted for dispatch, and each subscription returns the one renderer teardown shape:
`() => void`.

### EventChannel\<T\>

Scriptable event channel in `api/events/EventChannel.ts`. Supports both fire-and-forget and async pipeline patterns. Designed for events that user scripts can subscribe to.

```typescript
const channel = new EventChannel<ContextMenuEvent<IFileTarget>>({ name: "fileExplorer.itemContextMenu" });

// Fire-and-forget (sync, event frozen — subscribers observe only, FIFO order)
channel.send(event);

// Async pipeline (LIFO order — newest subscriber runs first, short-circuits on handled)
const ok = await channel.sendAsync(event);

// Subscribe (sync or async handlers)
const release = channel.subscribe((event) => { event.items.push({ label: "Custom", onClick: () => {} }); });
```

`EventChannel` supports async pipelines with sequential execution. `send()` uses FIFO order (all
handlers always run). `sendAsync()` uses LIFO order (newest subscriber runs first) and
short-circuits when `event.handled` is set — this allows scripts registered after bootstrap to
intercept events before app handlers. Its `subscribe()` also returns `() => void`.

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

**Key point:** Consumers (native views, the draw vendor island, and scripts) access state through
Object Model interfaces (`app.settings`, `app.pages`) when available, not through raw state primitives.

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
const release = app.settings.onChanged.subscribe(({ key, value }) => {
    if (key === "theme") updateTheme(value);
});
```

### Via Model State (direct)

```typescript
class MyEditorView extends VanillaView<{ model: TextFileModel }> {
    protected onMount(): void {
        this.bind(this.props.model.state, (state) => state.content, (content) => {
            this.root.textContent = content;
        });
    }
}
```

### Via TComponentModel

```typescript
const model = new TComponentModel(new TComponentState(defaultState));
const driver = createComponentModelDriver(props, WidgetModel, defaultState);
driver.mount();
driver.update(props);
```

## Best Practices

### 1. Minimize Subscriptions

```typescript
// Selective subscription; the listener receives the selected value.
const release = state.subscribe((title) => updateTitle(title), (value) => value.title);

// Use a full listener only when the whole state is relevant.
const releaseAll = model.state.subscribe(() => refreshAll());
```

### 2. Derive Computed Values Inside the Selector

`subscribe(listener, selector)` invokes the listener only when the selector's **result** changes
(structural compare via `compareSelection`). A helper that reads state through `this.state.get()`
outside the selector is therefore invisible to that comparison — if the state it reads is not also
part of the selector's result, the view never updates when it changes.

```typescript
// GOOD — derive inside the selector, so it participates in comparison.
const release = model.state.subscribe(
    ({ searchText, viewMode }) => render(searchText, viewMode),
    (state) => ({ searchText: state.searchText, viewMode: model.getViewMode(state) }),
);
```

Give such helpers an optional state-snapshot parameter (`getViewMode(snapshot?)`) so the selector
stays pure instead of reaching back into `this.state.get()`.

When a getter derives from state, call it through the selector and dispose the returned subscription
with the owning view.

### 3. Use Immer Updates

```typescript
// GOOD — Immer mutation syntax
state.update(s => { s.items.push(newItem); });

// BAD — manual immutable update
state.set({ ...state.get(), items: [...state.get().items, newItem] });
```

### 4. Prefer Object Model Over Raw State

Access state through `app.*` interfaces when available. Use raw `state.get()`/`subscribe()` only in
the component or editor that owns the state.

### 5. EditorModel for New Editors

When creating a new editor, subclass `EditorModel<T>` and register the EditorModule in `register-editors.ts`. For text-bearing editors that should be switchable from other text views, also implement `IContentHost` (or compose one) and expose `CONTENT_HOST_TRAIT`. See [editor-guide.md](../standards/editor-guide.md) for the full recipe.
