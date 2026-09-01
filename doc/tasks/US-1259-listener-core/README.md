# US-1259: P1 - one listener core, disposable emitters, both `EventChannel` unsubscribe bugs

**Epic:** [EPIC-080: State, lifetime & scheduling core](../../epics/EPIC-080.md)  
**Status:** Planned  
**Scope:** Investigation and implementation plan only. This task document does not authorize implementation.

## Goal

Extract the shared listener-registration and dispatch-lifetime mechanism already duplicated by
`TOneState` and `Emitter`, then use it for those three renderer-core surfaces. Add disposable listener
owners and fix the two verified `EventChannel` unsubscribe bugs while preserving every existing
ordering, freezing, awaiting, short-circuit, and error-reporting rule outside those bugs. The separate
IPC renderer event list is investigated and explicitly deferred because its dependency layer cannot
currently import `src/renderer/core/state`.

## Background

### Verified listener implementations

The current implementations were read directly from the following files.

`src/renderer/core/state/state.ts:42-49` defines `StateListener` as a registration object with a
callback (`notify`) and mutable `active` state. `TOneState` stores these objects in
`listeners` (`:51-54`). `stateChanged` snapshots the array, checks `active` immediately before
calling each listener, catches each synchronous throw, and schedules `setTimeout(() => { throw
error; }, 0)` (`:79-88`). `register` creates one object per registration, marks that object inactive
in its disposer, and removes that exact object from the live array (`:90-99`). This gives object
identity, skip-after-unsubscribe, idempotent disposal, and error containment.

The explanatory `stateChanged` comment at `src/renderer/core/state/state.ts:61-77` is part of the
contract. It records both reasons for `active`: a listener retired during the current dispatch must
be skipped, and one listener failure must not prevent the remaining listeners from running. The
implementation must retain those guarantees and the asynchronous escalation of the caught error.

`src/renderer/core/state/events.ts:3-31` duplicates the same shape in `EmitterRegistration`,
`Emitter.event`, and `Emitter.fire`: registrations are objects, dispatch snapshots the array,
checks `active`, catches each synchronous throw, and rethrows it asynchronously with the same
`setTimeout` form. `Subscription` (`events.ts:34-42`) is a wrapper around one `Emitter`; its
`send` currently converts `undefined` to `null` before firing (`:37-39`). That conversion is not
part of this task's behavior change and must remain.

`src/renderer/api/events/EventChannel.ts:18-87` is the third copy and the defective one:

- `handlers` is currently an array of function references (`:19`). `subscribe` pushes the function
  and its disposer uses `indexOf(handler)` (`:39-47`). Two registrations of the same function are
  therefore not independently addressable; the first disposer removes whichever matching function
  is found first, and repeated disposal is not idempotent.
- `send` freezes the supplied event with `Object.freeze`, snapshots the handlers, and calls them in
  FIFO order (`:49-62`). It ignores each handler's return value entirely; only synchronous throws
  reach its `onError` callback. A rejected promise from an async handler therefore remains an
  unhandled promise rejection. This fire-and-forget timing must remain.
- `sendAsync` snapshots the handlers once and walks that snapshot in reverse order (`:70-87`). It
  calls the newest handler first, awaits a thenable result, catches both synchronous throws and
  awaited failures through `errorHandler`, then checks `event.handled` and returns immediately when
  it is true. The active check must occur immediately before each call, after every preceding await,
  so an unsubscribed handler is skipped during the asynchronous window without changing LIFO order
  or the `handled` short-circuit.

### Fourth listener list: IPC renderer events

`src/ipc/renderer/renderer-events.ts:5-46` contains a fourth hand-rolled listener list,
`RendererEventObject<T>`. It is not an `EventChannel`: each object attaches one Electron IPC callback
in its constructor (`:9-12, :31-45`), exposes `subscribe` and `send` through `EventObject`, and
dispatches received IPC payloads synchronously.

It has two verified lifetime bugs:

- `subscribe` stores bare callback references and its disposer reassigns
  `this.subscribers = this.subscribers.filter(cb => cb !== callback)` (`:14-22`). Duplicate
  subscriptions of the same callback are therefore not independently disposable; disposing either
  one removes every matching registration.
- The IPC callback iterates `this.subscribers.forEach(...)` over the live array (`:36-44`). A
  disposer reassigns the field, leaving the array already being iterated unchanged, so a callback
  retired during that dispatch is still called.

Its error policy is also a third renderer-facing policy: each callback is wrapped in `try`/`catch`
and failures go directly to `console.error("Event callback error:", e)` (`:37-42`). There is no
`dispose()` on `RendererEventObject`, `RendererEvents`, or the default `rendererEvents` singleton.

The current source contains 22 `new RendererEventObject` fields in `RendererEvents` (`:48-136`),
not 24. `EventApi` has the corresponding 22 typed fields in `src/ipc/api-types.ts:295-330`;
`EventEndpoint.eBoardPort` is intentionally not one of them because its transferred port is handled
outside this typed event system (`api-types.ts:279-283`). Twelve renderer files import the singleton,
with 29 renderer subscription sites found by source search. These consumers are not changed in
US-1259 because the list sits under `src/ipc` and its current interface is separate from the three
renderer-core listener surfaces.

`src/ipc/renderer/renderer-events.ts` is renderer-process-only: it imports `src/shared/types` and
`src/ipc` types and calls `window.electron.ipcRenderer`; it does not import `src/renderer`. The source
tree has zero `src/ipc` imports into `src/renderer`, while `src/renderer` imports this IPC adapter.
Importing `src/renderer/core/state/listener-list.ts` from `src/ipc/renderer` would create the first
reverse-layer edge. Keep the core at `src/renderer/core/state/listener-list.ts` for the three
renderer surfaces and defer `RendererEventObject` to a future IPC event-infrastructure task that
first decides whether the listener core should move to a dependency-free shared location or whether
this one IPC renderer module may legitimately depend on renderer core. Record both IPC bugs and this
destination explicitly rather than treating the fourth list as part of P1's implementation.

The shared core must therefore make the registration object itself the disposer key, mark that exact
object inactive before removing it, check that flag at invocation time even when dispatch is walking
a snapshot, make the disposer idempotent, and isolate listener failures. `dispose()` must also mark
all snapshot-visible registrations inactive before clearing the live array; clearing only the array
would still allow an in-flight snapshot to invoke disposed listeners.

### Content-delivery and public API constraints

`src/renderer/api/app.ts:219-233` registers the process-lifetime content handlers in this order:
`registerOpenHandler`, `registerResolvers`, `registerRawLinkParsers`, and
`registerTreeContextMenuHandlers`. The registrations are intentionally LIFO. The verified
bootstrap subscriptions are:

| Channel | Current registrations | Source |
|---|---:|---|
| `openRawLink` | 11 parsers | `src/renderer/content/parsers.ts:42-190` |
| `openLink` | 4 resolvers | `src/renderer/content/resolvers.ts:109-340` |
| `openContent` | 1 Layer-3 opener | `src/renderer/content/open-handler.ts:15-69` |
| `linkContextMenu` | 3 built-in handlers | `src/renderer/content/tree-context-menus.ts:14-116` |

The Layer-3 opener in `open-handler.ts` is an `openContent.sendAsync` subscriber. It reconstructs a
file path, passes the pipe to page navigation/opening, sets `data.handled = true` only after the
operation succeeds, and disposes the pipe on the two failure paths (`:16-69`). The implementation
must not alter the LIFO pipeline or its sequential awaits. `src/renderer/scripting/api-wrapper/AppWrapper.ts:7-26`
tracks the disposer returned by `EventChannel.subscribe` in a script release list; that wrapper must
continue receiving the same callable disposer.

There are six concrete `EventChannel` instances in `src/renderer/api/events/AppEvents.ts:7-25`:
`itemContextMenu`, `onBookmark`, `openRawLink`, `openLink`, `openContent`, and `linkContextMenu`.
The script-facing `IEventChannel` in `src/renderer/api/types/events.d.ts:98-105` deliberately
exposes only `subscribe`, `send`, and `sendAsync`; `AppWrapper` exposes the same surface. The new
implementation-only `dispose(): void` capability must not be added to that script-facing interface.

No existing public signature needs to be changed. The additive methods are `dispose(): void` on
the concrete `Emitter`, `Subscription`, and `EventChannel` classes. Consumer count for the affected
classes is recorded here so an implementation does not silently change a contract:

- `Emitter` has no direct construction or dispatch consumer outside `Subscription` in
  `src/renderer/core/state/events.ts`; its three internal uses are the wrapper's construction,
  `event`, and `fire` calls.
- There are 10 runtime `Subscription` instances: the five module-level broadcasts listed below,
  `PagesModel.onShow` and `PagesModel.onFocus` (`src/renderer/api/pages/PagesModel.ts:33-35`),
  `Settings._onChanged` (`src/renderer/api/settings.ts:226`),
  `EditorModel.descriptorChanged` (`src/renderer/editors/base/EditorModel.ts:58-62`), and
  `BoardInfoEditorModel.installed` (`src/renderer/editors/board-info/BoardInfoEditorModel.ts:123-125`).
  Their existing callable unsubscribers remain valid; no consumer needs to switch to an object
  disposer in this task.
- The six `AppEvents` channels are the concrete `EventChannel` consumers. The 19 built-in
  bootstrap registrations counted above must retain their existing disposer return type even though
  the handlers move behind the shared core. Script subscriptions are dynamically proxied and are
  released by `ScriptContext` through `releaseList`; no script call site changes.

### Module-level `Subscription` lifetime decision

The epic describes six module-level singleton broadcasts, but the current
`src/renderer/core/state/events.ts` contains exactly five declarations (`:44-73`):
`globalKeyDown`, `browserUrlChanged`, `windowClosing`, `secondaryViewsToggled`, and `panelExpanded`.
No sixth declaration is hidden elsewhere: `rg "new Subscription"` finds these five module exports
plus the five instance fields listed above.

The current subscribers are also verified:

| Singleton | Current subscriber(s) | Lifetime finding |
|---|---|---|
| `globalKeyDown` | `BrowserEditor` (`src/renderer/editors/browser/BrowserEditor.ts:78-79`) | View-owned disposer is registered with `own`. |
| `browserUrlChanged` | `DrawBodyView` (`src/renderer/editors/draw/DrawBodyView.ts:225`) | View-owned disposer is registered with `own`. |
| `windowClosing` | `BrowserTorModel` (`src/renderer/editors/browser/BrowserTorModel.ts:20-25`) | `DisposableStore` removes it when the model is disposed; the broadcast is sent by `GlobalEventService` at window close (`src/renderer/api/internal/GlobalEventService.ts:245-247`). |
| `secondaryViewsToggled` | No subscriber found; it is sent by `PageModel` (`src/renderer/api/pages/PageModel.ts:562-565`). | No disposal call site exists or is needed. |
| `panelExpanded` | `NotebookBodyView` (`src/renderer/editors/notebook/NotebookBodyView.ts:202`) | View-owned disposer is registered with `ownSubscription`. |

These singleton objects are process/window-lifetime broadcasts, while their observed subscribers are
already owner-bound. Add `dispose()` to the `Subscription` type, but do not add disposal call sites
for these module exports in US-1259. Disposing them from an owner would clear unrelated subscribers;
disposing them at `beforeunload` adds no useful lifetime and could interfere with the shutdown
broadcast. The new capability closes the leak for a future module-owned broadcast or an explicit
owner that owns the whole subscription, but this task does not invent a global shutdown owner.

### `TGlobalState` and `TComponentState` decision

`src/renderer/core/state/state.ts:138-140` confirms that both classes are empty subclasses of
`TOneState`. A source search found no `instanceof`, subclass, or method-based distinction between
them. Their use is organizational and type-level: `TGlobalState` is used by application/catalog
state modules, while `TComponentState` is used by editor/component construction; the generic model
driver in `src/renderer/core/state/model.ts:153-181` also uses `TComponentState` as its default
state constructor. The existing architecture note at `doc/architecture/state-management.md:66`
describes the same organizational distinction.

Keep both classes and add code comments stating explicitly that they are intent markers only and
share all behavior with `TOneState`. Do not merge them, add marker-specific behavior, or change
their constructor/type signatures. The marker decision is resolved in this task and does not need a
follow-up question.

## Implementation Plan

### 1. Add the internal listener-list core

Create `src/renderer/core/state/listener-list.ts`. Keep it internal to the state implementation;
do not export it from `src/renderer/core/state/index.ts` as a new application-facing primitive.
Use a generic registration object equivalent to:

```ts
interface ListenerRegistration<TListener> {
    readonly listener: TListener;
    active: boolean;
}
```

The core should provide the lifecycle and dispatch mechanics needed by all three consumers:

- `add(listener)` appends one registration object and returns a disposer tied to that object.
- The disposer checks `registration.active`, sets it false once, and removes by object identity;
  calling it again, or calling a disposer after `dispose()`, is a no-op.
- Dispatch takes a snapshot of registration objects and checks `active` immediately before each
  invocation. It must support insertion order and reverse insertion order so callers can preserve
  state/emitter FIFO and `EventChannel.sendAsync` LIFO.
- Provide separate synchronous and asynchronous dispatch paths (or an equivalent API) so the caller
  can preserve the current error/timing policy. The synchronous path must call the listener and
  ignore its return value entirely: it must not await it, attach a rejection handler, or route a
  rejected promise to `onError`; only a synchronous throw reaches the supplied error callback. The
  asynchronous path must await the existing thenable result before moving on and must re-check the
  next registration's `active` flag after that await.
- Each invocation is isolated by a supplied error callback. This lets `TOneState` and `Emitter`
  retain asynchronous host escalation while `EventChannel` retains its configured `onError` callback.
  Do not turn `EventChannel.send` into an async-rejection catcher as a side effect of extraction.
- `dispose()` marks every current registration inactive before emptying the list. It is idempotent.
  Do not add a closed gate that changes post-dispose registration behavior; the requested operation
  is clearing the current listeners, and the zero-behavior-change constraint does not justify a new
  permanent state. `hasListeners`/size must reflect the cleared list.

The planned concrete shape is a generic class with no event-specific constraint:

```ts
class ListenerList<TListener> {
    add(listener: TListener): () => void;
    dispatchSync(
        invoke: (listener: TListener) => void,
        onError: (error: unknown) => void,
    ): void;
    dispatchAsync(
        invoke: (listener: TListener) => void | Promise<void>,
        onError: (error: unknown) => void,
        options?: { reverse?: boolean; afterInvocation?: () => boolean },
    ): Promise<void>;
    readonly size: number;
    dispose(): void;
}
```

`dispatchAsync`'s optional `afterInvocation` callback is a generic stop hook, not an
`EventChannel` rule: it runs after the invocation (and its error callback, when applicable), and a
true result stops traversal. `EventChannel.sendAsync` will use it only to check its own
`event.handled`. The core's default traversal is FIFO; `reverse: true` gives the existing LIFO
snapshot. The exact public/export visibility can remain narrower than this illustrative shape.

The core API should not own `event.handled`, event freezing, or error-handler policy. Those are
surface-specific semantics and must remain in `EventChannel`.

### 2. Move `TOneState` onto the core without changing state semantics

Update `src/renderer/core/state/state.ts`:

- Replace the private `StateListener[]`, `register`, and manual snapshot/filter lifecycle with one
  listener-list instance typed for `() => void`.
- Keep selector subscriptions exactly as they are: selector evaluation remains at registration and
  dispatch time, `compareSelection` remains unchanged, and the wrapper is still the registered
  listener passed to the core.
- Make `stateChanged` use the core's synchronous dispatch in insertion order. Its error callback
  must remain `setTimeout(() => { throw error; }, 0)`, so one throwing listener still allows all
  remaining listeners to run and the error still reaches the host asynchronously.
- Preserve the existing `set`, `update`, `clear`, and `IState.subscribe` signatures. Do not add
  `dispose()` to `TOneState`; that is outside P1 and would introduce a new state-lifetime contract.
- Retain the explanatory `stateChanged` comment from `:61-77`, updating only its reference to the
  extracted core if a path mention becomes stale. The runtime guarantee described there must remain
  exact.

Before:

```ts
for (const listener of [...this.listeners]) {
    if (!listener.active) continue;
    try {
        listener.notify();
    } catch (error) {
        setTimeout(() => { throw error; }, 0);
    }
}
```

After:

```ts
this.listeners.dispatchSync(
    (listener) => { listener(); },
    (error) => { setTimeout(() => { throw error; }, 0); },
);
```

### 3. Move `Emitter` and `Subscription` onto the core and add disposal

Update `src/renderer/core/state/events.ts`:

- Keep `Event<T>` as a function returning `() => void`; US-1259 does not merge the callable
  unsubscribe contract into the later `IDisposable` work in US-1260.
- Make `Emitter.event` add to the shared core and preserve FIFO `fire` dispatch, active checks,
  per-listener error containment, and asynchronous rethrow.
- Add `Emitter.dispose(): void`, delegating to the listener list. It must clear all current
  registrations and make an in-flight snapshot skip them.
- Keep `Subscription` as the emitter wrapper, add `Subscription.dispose(): void`, and preserve the
  `undefined`-to-`null` conversion in `send`.

Before:

```ts
readonly event: Event<T> = (listener) => {
    const registration = { listener, active: true };
    this.registrations.push(registration);
    return () => { /* mark inactive and remove this registration */ };
};
```

After:

```ts
readonly event: Event<T> = (listener) => this.listeners.add(listener);

dispose(): void {
    this.listeners.dispose();
}
```

### 4. Move both `EventChannel` dispatch paths onto the core and fix both bugs

Update `src/renderer/api/events/EventChannel.ts`:

- Store `EventHandler<TEvent>` registrations in the shared core rather than a function array.
  `subscribe` must return the core's object-identity disposer, making duplicate subscriptions to
  the same function independent and making each disposer idempotent.
- Implement `hasSubscribers` from the core's active registration count.
- Keep `send` as synchronous FIFO: freeze the same event object, invoke the snapshot in insertion
  order, ignore each handler's return value entirely, and send only synchronous listener throws to
  the configured `errorHandler` exactly as today. A rejected promise returned by an async handler
  must remain an unhandled promise rejection.
- Keep `sendAsync` as sequential LIFO: traverse the snapshot newest-first, skip a registration if
  it became inactive while an earlier handler was running or awaiting, invoke the active handler,
  await its thenable result, contain its failure with `errorHandler`, then perform the existing
  `event.handled` check and return `true` exactly as today. Do not add a second short-circuit or
  change the current result value.
- Add `dispose(): void` delegating to the core. It must make `hasSubscribers` false and retire
  registrations visible to an in-flight async snapshot.

Before:

```ts
private handlers: EventHandler<TEvent>[] = [];

return () => {
    const index = this.handlers.indexOf(handler);
    if (index >= 0) this.handlers.splice(index, 1);
};
```

After (subscription shape; preserve the existing send/sendAsync surface-specific callbacks):

```ts
private readonly listeners = new ListenerList<EventHandler<TEvent>>();

subscribe = (handler: EventHandler<TEvent>): (() => void) =>
    this.listeners.add(handler);

dispose(): void {
    this.listeners.dispose();
}
```

The `sendAsync` loop must be expressed through the core's active-aware snapshot traversal, not by
copying bare handler functions into a second local array. That is the exact change that closes the
mid-await unsubscribe window.

### 5. Document the state intent markers in code

Update only the declarations at `src/renderer/core/state/state.ts:138-140` with comments such as
"intent marker; behavior is inherited unchanged from `TOneState`". Keep both class names,
inheritance, generic parameter, and constructor behavior unchanged.

### 6. Leave process-lifetime singleton ownership unchanged

Do not add calls to `dispose()` for `globalKeyDown`, `browserUrlChanged`, `windowClosing`,
`secondaryViewsToggled`, or `panelExpanded`. Do not alter bootstrap registration or add a disposal
aggregate to `AppEvents`. Existing view/model subscription owners continue using their callable
disposers. This task adds the capability and fixes the core race; owner-wide disposal migration is
US-1260/P7 work.

### 7. Explicitly defer the IPC renderer listener list

Do not modify `src/ipc/renderer/renderer-events.ts` or `src/ipc/api-types.ts` in US-1259. Preserve
the current `EventObject` signature and all 22 `RendererEventObject` instances while recording the
two bugs, the direct `console.error` policy, and the absent disposal capability for the future IPC
event-infrastructure task described above. That follow-up must first settle the dependency location
or layering exception before sharing `listener-list.ts`; it must then count and migrate the 12
renderer importers and 29 subscription sites without changing IPC payload or delivery semantics.

### 8. Verify without adding tests or a test harness

This repository has `typecheck`, `lint`, and `build-prod` scripts in `package.json` and no renderer
unit-test harness. After implementation, run:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build-prod`
4. A cold application start, not an HMR reload, exercising page switching, editor open/close, and
   the content-delivery open path.

During review, manually exercise the correctness triad with temporary reasoning or instrumentation
if needed: duplicate function registrations dispose independently; disposal during synchronous and
awaited dispatch skips the retired registration; repeated disposers are harmless; and a throwing
listener does not prevent later listeners. Remove any instrumentation before completion. Do not add
unit tests or test harness files.

## Concerns

### Resolved: error escalation cannot be globally normalized

The shared core must not choose one error policy for all surfaces. `TOneState.stateChanged` and
`Emitter.fire` currently catch synchronous listener failures, continue dispatch, and schedule an
uncaught throw with `setTimeout(() => { throw error; }, 0)`. That exact escalation is retained because
the state comment explicitly says the error remains unswallowed and the emitter already has the same
policy. `EventChannel` instead invokes its configured `onError` callback; its default logs through
`console.error`. `send` remains synchronous, ignores the handler return value entirely, and therefore
does not catch rejected promises returned by async handlers; those remain unhandled rejections.
`sendAsync` continues to await thenables and route failures to `onError`. The
containment guarantee applies to a throwing listener; if a caller-supplied `onError` callback itself
throws, that callback's existing propagation behavior is outside listener containment and must not be
silently changed.

### Resolved: synchronous and asynchronous EventChannel semantics are different

Both paths use the same registration core, but not the same traversal policy. `send` is frozen-event,
FIFO, fire-and-forget dispatch. `sendAsync` is mutable-event, LIFO, sequential-await pipeline
dispatch. The core owns registration identity, active state, snapshots, disposal, and invocation
error isolation; each method retains its own ordering and timing policy.

### Resolved: `EventChannel` pipeline order and `handled` behavior are untouchable

The open pipeline relies on newest-first interception, including the Layer-3 opener reached through
`openContent.sendAsync`. No registration may be reordered, no concurrent `Promise.all`-style dispatch
may be introduced, and no `event.handled` check may move before the awaited handler or be replaced by
a core-level generic short-circuit.

### Resolved: singleton disposal call sites stay out of US-1259

The current five module-level broadcasts are window-lifetime objects, and their active subscribers
already attach their callable disposers to view/model owners. `secondaryViewsToggled` currently has no
subscriber. A global `dispose()` call would clear unrelated owners and is not a valid substitute for
US-1260's owner disposal contract. The new methods remain available for an explicit whole-owner
shutdown in a later task.

### Resolved: marker subclasses remain

No runtime code distinguishes `TGlobalState` from `TComponentState`, and both inherit the same
`TOneState` behavior. Their names communicate intended scope at construction/type sites. Keep them
and document that they are intent markers rather than introducing behavior; the source search found
21 files mentioning `TGlobalState` and 93 mentioning `TComponentState`.

### Resolved: fourth IPC listener list is deferred

`src/ipc/renderer/renderer-events.ts` is a real fourth copy with duplicate-callback removal,
mid-dispatch retirement, and a distinct direct-`console.error` policy. It is left out of US-1259
because its 22-object IPC adapter currently depends only on `src/ipc` and `src/shared`, while the
proposed core is intentionally under `src/renderer/core/state`; introducing the first
`src/ipc`-to-`src/renderer` edge for one adapter would settle a broader layering decision inside this
high-trust renderer task. A future IPC event-infrastructure task owns that migration, after deciding
whether to relocate the core to a dependency-free shared module or approve the reverse edge. The
future task must preserve `EventObject` payloads and delivery semantics while fixing both IPC bugs,
adding whole-list disposal if still appropriate, and retaining its current error policy unless that
task explicitly changes it.

### Out of scope

- Adding `afterDispatch`, changing `TOneState.set()` timing, or batching state writes; those belong
  to US-1261.
- Converting callable unsubscribers to `IDisposable`, changing `DisposableCollection`, or sweeping
  DOM listeners; those belong to US-1260.
- Changing `src/ipc/renderer/renderer-events.ts` or `src/ipc/api-types.ts`; its duplicate-callback
  and mid-dispatch bugs belong to a future IPC event-infrastructure task after the dependency-layer
  decision.
- Adding a closed-state rejection rule for new subscriptions after `dispose()`.
- Adding disposal call sites to process-lifetime event singletons.
- Changing any content handler, event payload, parser/resolver order, event freezing, async await,
  `handled` short-circuit, or public script-facing event interface.
- Adding unit tests or a test harness.

## Acceptance Criteria

- [x] `src/renderer/core/state/listener-list.ts` is the sole listener-registration implementation
  used by `TOneState`, `Emitter`, and `EventChannel`; no second `{ listener, active }` array remains
  in those three renderer-core surfaces. The separate IPC list is explicitly documented as deferred
  to the future IPC event-infrastructure task.
- [x] Every registration is an object with independent identity and an active flag. A disposer is
  idempotent, removes only its own registration, and a retired registration is skipped even when it
  is present in an in-flight synchronous or asynchronous snapshot.
- [x] `dispose()` exists on `Emitter`, `Subscription`, and `EventChannel`, clears all current
  listeners, deactivates snapshot-visible registrations, is safe to call repeatedly, and makes
  `EventChannel.hasSubscribers` report false.
- [x] A later subscription after `dispose()` is allowed and behaves like a fresh registration; no
  new permanent closed-state rule is introduced.
- [x] `TOneState` preserves selector behavior, FIFO order, synchronous re-entrant dispatch, the
  exact skip-retired-listener guarantee described in its `stateChanged` comment, and asynchronous
  `setTimeout(() => { throw error; }, 0)` escalation while containing one listener failure from the
  remaining listeners.
- [x] `Emitter.fire` preserves FIFO order and its existing asynchronous error escalation. `Emitter`
  and `Subscription` keep their existing callable subscribe/dispose behavior, including
  `Subscription.send` converting `undefined` to `null`.
- [x] `EventChannel.send` still freezes the event, invokes all active handlers FIFO, ignores each
  handler's return value entirely, reports synchronous throws through the configured error handler,
  and leaves rejected promises from async handlers as unhandled promise rejections.
- [x] `EventChannel.sendAsync` still invokes active handlers sequentially in LIFO order, awaits each
  thenable before continuing, skips a handler retired during an earlier await, routes handler errors
  through the configured error handler, and performs the same `event.handled` short-circuit with the
  same `true` result.
- [x] Subscribing the same function twice and disposing the first returned disposer leaves the second
  registration active; disposing either returned disposer twice has no further effect.
- [x] The five current module-level `Subscription` singletons have no new disposal call sites, and
  the six `AppEvents` channels retain their existing bootstrap and script-proxy ownership.
- [x] `TGlobalState` and `TComponentState` remain empty intent-marker subclasses with an explicit
  code comment documenting their lack of behavioral distinction.
- [x] No script-facing `.d.ts` interface gains `dispose()`, and no existing consumer signature is
  changed.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass, followed by a cold-start
  manual smoke check of page switching, editor open/close, and content delivery.
- [x] No unit-test or test-harness files are added, and `doc/active-work.md` is unchanged.
- [x] `src/ipc/renderer/renderer-events.ts` is unchanged: its duplicate-callback and
  mid-dispatch-retirement bugs, third `console.error` policy, and 22-object lifetime remain recorded
  for the future IPC event-infrastructure task.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/core/state/listener-list.ts` | New internal registration/dispatch/disposal core. |
| `src/renderer/core/state/state.ts` | Use the core for `TOneState`; preserve state behavior and document marker subclasses. |
| `src/renderer/core/state/events.ts` | Use the core for `Emitter`/`Subscription`; add `dispose()`. |
| `src/renderer/api/events/EventChannel.ts` | Use the core; fix object-identity and active-at-call-time unsubscribe behavior; add `dispose()`. |
| `doc/tasks/US-1259-listener-core/README.md` | This investigation and implementation plan. |

Files that need **no changes** in this task:

- `src/renderer/core/state/index.ts` - the new core remains internal and is imported directly by its three consumers.
- `src/renderer/api/events/AppEvents.ts` - existing six channel instances and construction order remain unchanged.
- `src/renderer/api/types/events.d.ts` - the script-facing interface intentionally remains without `dispose()`.
- `src/renderer/scripting/api-wrapper/AppWrapper.ts` - existing callable disposer tracking remains valid.
- `src/ipc/renderer/renderer-events.ts` and `src/ipc/api-types.ts` - the fourth IPC listener list and
  its `EventObject` contract are explicitly deferred to a future IPC event-infrastructure task.
- `src/renderer/content/parsers.ts`, `src/renderer/content/resolvers.ts`, `src/renderer/content/open-handler.ts`, and `src/renderer/content/tree-context-menus.ts` - registration and handler logic remain unchanged.
- `src/renderer/api/internal/KeyboardService.ts`, `src/renderer/api/internal/GlobalEventService.ts`, `src/renderer/editors/browser/BrowserEditor.ts`, `src/renderer/editors/browser/BrowserTorModel.ts`, `src/renderer/editors/draw/DrawBodyView.ts`, and `src/renderer/editors/notebook/NotebookBodyView.ts` - existing singleton send/subscription ownership remains unchanged.
- `doc/active-work.md` - the existing EPIC-080/US-1259 dashboard entry is intentionally untouched.
