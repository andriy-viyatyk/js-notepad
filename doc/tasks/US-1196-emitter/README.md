# US-1196 — One event primitive: `Emitter<T>`, one teardown shape

**Status:** Planned · **Epic:** [EPIC-075](../../epics/EPIC-075.md)

## Goal

Replace the renderer’s `SubscriptionObject` / `ISubscriptionObject` and settings-only
`IDisposable` subscription handles with one `() => void` disposer shape. Add a plain-array
`Emitter<T>` / `Event<T>` in `src/renderer/core/state/`, keep the five global event names and
their import sites, and preserve every primitive’s existing dispatch semantics.

This task is shape unification only. It does not convert hand-rolled subscriptions to owned
subscriptions; that is US-1197.

## Background

### Epic context and collision boundary

EPIC-075 A-1 statement 3 is the later ownership census and conversion; US-1196 does not attempt
to satisfy it or convert hand-rolled fields. A-1 statement 4 requires exactly one
listener-teardown shape in the renderer while retaining delivery from the five globals, every
`EventChannel`, and every `ComponentQueue`.
A-2’s R3.1 correction says the plan’s three-shape claim was wrong for the original inventory:
`TOneState.subscribe` and `ComponentQueue.subscribe` returned functions, while
`Subscription.subscribe` and `EventChannel.subscribe` returned `{ unsubscribe }`; `{ dispose }`
was said to belong only to `ComponentQueue` itself. The source check below corrects that last
part: `settings.onChanged` is an `IEvent` produced by `wrapSubscription`, and its
`subscribe()` returns `{ dispose }` today.

US-1193, US-1194, and US-1195 are working against `src/renderer/core/state/model.ts` and its
model lifecycle surface. US-1196 must not touch `TOneState`, `TModel`, `TComponentModel`,
`VanillaView`, or `memo()`.

#### Scope decision: renderer-facing IPC

A-1 statement 4 says, verbatim, “Exactly **one** listener-teardown shape exists in the renderer:
a `() => void` disposer. `SubscriptionObject` (`{ unsubscribe }`) is gone.” This task therefore
includes `src/ipc/renderer/renderer-events.ts` and the shared `EventObject` contract in
`src/ipc/api-types.ts`: they are the implementation and type surface of `rendererEvents`, a
renderer-facing `{ unsubscribe }` producer. Leaving them object-shaped would leave a second
subscription producer observable by renderer code even though its implementation lives under
`src/ipc/`. The `src/shared/execute-handle.ts` audit is explicitly no-change because its
`IExecuteHandle.on()` already returns a function; it is recorded to make the boundary deliberate,
not to expand the migration.

### Current teardown inventory

The inventory covers concrete renderer-side callback registration APIs, including delegated
watch APIs and the IPC event object used by renderer services. Type declarations that mirror a
concrete method are recorded with that method rather than counted as another implementation.
`ComponentQueue.register()` is included because it registers a request handler and returns a
teardown function; it is not an additional listener event stream.

There are **three distinct structural teardown shapes** today:

| Shape | Concrete APIs found | Count | Evidence and notes |
|---|---|---:|---|
| `() => void` | `TOneState.subscribe`; `ComponentQueue.subscribe`; `ComponentQueue.register`; `BoardTrust.subscribePaths`; `ToolsTrust.subscribePaths`; `BoardInstallRegistry.subscribeInstalled`; `RegisteredTools.subscribeToolsets`; `PublishedBoards.subscribeCatalog`; `PublishedBoards.subscribeCatalogBoardsForFile`; `subscribeBusyBoardRoots`; `subscribeBoardIconChanges`; `subscribeFileIconChanges`; `subscribeFileIconElements`; `onFaviconReady`; `tooltipRegistry.subscribe`; `overlayRegistry.subscribe`; `ClaudeSession.on`; `IExecuteHandle.on`; job-transport `subscribe` | 19 methods | These already return callable disposers. `ComponentQueue.dispose(): void` is the queue’s own lifecycle method and is not a subscription return value. |
| `{ unsubscribe }` | `Subscription.subscribe`; `EventChannel.subscribe`; IPC `RendererEventObject.subscribe`; `FileProvider.watch`; `MnemeProvider.watch`; `FileTreeProvider.watch`; `MnemeTreeProvider.watch`; `LinkTreeProvider.watch`; `ContentPipe.watch`; `MnemeConnection.onStatusChange`; `MnemeConnection.subscribe`; `MnemeConnection.onListChanged` | 12 methods | The public `ISubscriptionObject`, `SubscriptionObject`, and IPC `EventSubscription` declarations describe variants of this same structural shape. |
| `{ dispose }` | `wrapSubscription().subscribe`, exposed as `settings.onChanged.subscribe()` through `IEvent` | 1 adapter path | This is a real subscription shape, not only `ComponentQueue.dispose()`. `src/renderer/api/internal.ts:37-42` wraps the underlying `Subscription` object as `{ dispose: () => sub.unsubscribe() }`. |

Additional internal composite teardown state exists in `src/renderer/ui/tabs/PageTabsView.ts`:
`PageLayoutSubscription` stores page/editor metadata plus an `unsubscribe` method. It is not a
returned subscription API, but it must be changed to store a callable release member so the old
shape does not survive in the renderer’s listener plumbing.

The renderer also already has callable event/stream registrations outside the named
subscribe/watch inventory: `ClaudeSession.on()` in
`src/renderer/scripting/api-wrapper/ClaudeSession.ts:127`, `IExecuteHandle.on()` in
`src/shared/execute-handle.ts:174` (and its public declarations in
`src/renderer/api/types/proc.d.ts:92-96`), and the job-transport `subscribe` callback in
`src/renderer/api/proc.ts:75-83`. These are already the target function shape and are not
subscription objects, so they require no migration.

The only `wrapSubscription` call is `src/renderer/api/settings.ts:189`:

```ts
// Current: settings.ts
this.onChanged = wrapSubscription(this._onChanged);

// Current: api/internal.ts
const sub = subscription.subscribe(handler);
return { dispose: () => sub.unsubscribe() };
```

Consequently, `settings.onChanged.subscribe()` currently exposes `{ dispose }`, and these
retained settings subscriptions call that method today:

| File | Retained settings subscription |
|---|---|
| `src/renderer/api/library-service.ts` | `LibraryService.settingsSub`, disposed in `dispose()` |
| `src/renderer/editors/settings/sections/SettingsSections.ts` | Seven section subscriptions, each released from `VanillaView.own()` |
| `src/renderer/editors/settings/sections/FileSearchSection.ts` | `subscription` released from `own()` |
| `src/renderer/editors/settings/sections/McpSection.ts` | `subscription` released from `own()` |
| `src/renderer/editors/settings/sections/BrowserProfilesSection.ts` | `subscription` released from `own()` |
| `src/renderer/ui/tabs/PageTabView.ts` | `languageSettingsSubscription` released from `own()` |
| `src/renderer/ui/tabs/PageTabsView.ts` | local `settingsSubscription` released from `own()` |
| `src/renderer/ui/sidebar/TrustedBoardsListView.ts` | local `settingsSubscription` released from `own()` |
| `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts` | local `subscription` released from `own()` |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | local `settingsSubscription` released from `own()` |
| `src/renderer/ui/sidebar/BuiltinEditorsListView.ts` | local `settingsSubscription` released from `own()` |
| `src/renderer/editors/video/VideoView.ts` | local `settingsSubscription` released from `own()` |
| `src/renderer/editors/video/AudioVisualizer.ts` | local `settingsSubscription` released from `own()` |

The settings calls in `src/renderer/api/app.ts`, `src/renderer/api/board-vars/BoardEnvStore.ts`,
`src/renderer/api/mneme-status.ts`, and `src/renderer/api/mneme-connection.ts` ignore their
return value and therefore need no call-site rewrite.

### `CustomEvent.detail` null audit

`new CustomEvent(type, { detail })` produces `event.detail === null` when `detail` is
`undefined`, because the `CustomEventInit.detail` default is `null`. A direct listener-array
call would otherwise pass `undefined`. The affected `Subscription` instances and sends are:

| Subscription | Sends with missing/undefined data | Consumers and null/undefined check |
|---|---|---|
| `windowClosing` — `src/renderer/core/state/events.ts:54`, `Subscription<void>` | `src/renderer/api/internal/GlobalEventService.ts:244`, `windowClosing.send()` with no argument | `src/renderer/editors/browser/BrowserTorModel.ts:17` subscribes with `() => this.handleWindowClosing()`; it never reads the payload or compares it with `null`/`undefined`. |
| `EditorModel.descriptorChanged` — `src/renderer/editors/base/EditorModel.ts:62`, `Subscription<void>` | `src/renderer/editors/base/EditorModel.ts:96`, `src/renderer/editors/base/TextHostEditorModel.ts:247`, `src/renderer/editors/board/BoardContentEditorModel.ts:111`, and `src/renderer/editors/board-info/BoardInfoEditorModel.ts:180`, each sends `undefined` | The only consumer is `src/renderer/api/pages/PagesModel.ts:71`; its callback is `() => this.persistence.saveStateDebounced()`, so it never reads or tests the payload. |

The complete `Subscription` send scan found no other argumentless `send()` call. The remaining
subscriptions send a payload at every producer (`PagesModel.onShow`/`onFocus`, settings
`_onChanged`, `BoardInfoEditorModel.installed`, and the payload-bearing globals), and their
consumers do not distinguish a missing payload. The safe replacement is nevertheless explicit:
the Emitter itself passes values unchanged, while the Emitter-backed `Subscription.send()`
normalizes `undefined` to `null` before firing. This preserves the `EventTarget` boundary for
future strict checks as well as for today’s audited consumers.

### `Subscription` constructor audit

All ten `new Subscription(...)` sites are zero-argument constructions:
`src/renderer/api/pages/PagesModel.ts:34-35`, `src/renderer/api/settings.ts:226`, the five
global instances in `src/renderer/core/state/events.ts:42,51,54,62,70`,
`src/renderer/editors/base/EditorModel.ts:62`, and
`src/renderer/editors/board-info/BoardInfoEditorModel.ts:125`. No code reads `.type` or
`.appEvent` from a subscription. `AppEvent` is referenced only inside
`src/renderer/core/state/events.ts`; `AppEvents` in `src/renderer/api/events/AppEvents.ts` is a
different, unrelated class. The `type` and `appEvent` constructor parameters and the `AppEvent`
class are therefore dead compatibility machinery and must be deleted, not carried onto
`Emitter`.

### Every real `.unsubscribe()` call site

The renderer has **30 real subscription `.unsubscribe()` call sites**, grouped by file:

| File | Lines | Count | Handle being released |
|---|---:|---:|---|
| `src/renderer/api/boards.ts` | 318 | 1 | `BoardInfoEditorModel.installed` subscription |
| `src/renderer/api/internal.ts` | 41 | 1 | `wrapSubscription`’s underlying `Subscription` |
| `src/renderer/api/pages/PagesModel.ts` | 74 | 1 | `EditorModel.descriptorChanged` subscription |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | 210, 222 | 2 | provider `watch()` handles |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | 249, 254 | 2 | provider `watch()` handles |
| `src/renderer/editors/about/AboutView.ts` | 85 | 1 | `rendererEvents.eUpdateAvailable` handle |
| `src/renderer/editors/base/TextChromeView.ts` | 294 | 1 | `PagesModel.onFocus` handle |
| `src/renderer/editors/board/BoardWebview.ts` | 162 | 1 | `PagesModel.onFocus` handle inside `focusUnsubscribe` |
| `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | 262, 516, 648 | 3 | published-board and install-progress IPC handles |
| `src/renderer/editors/browser/BrowserEditor.ts` | 93 | 1 | `globalKeyDown` handle |
| `src/renderer/editors/browser/BrowserTorModel.ts` | 93 | 1 | `windowClosing` handle |
| `src/renderer/editors/markdown/MarkdownBodyView.ts` | 300, 315 | 2 | `PagesModel.onFocus` handle |
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | 558, 560 | 2 | IPC status and Mneme connection handles |
| `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | 392 | 1 | Mneme connection status handle |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | 209 | 1 | `panelExpanded` handle |
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | 77, 89 | 2 | IPC MCP and Mneme status handles |
| `src/renderer/editors/text/TextFileIOModel.ts` | 58, 68, 370 | 3 | `IContentPipe.watch()` handles |
| `src/renderer/scripting/api-wrapper/AppWrapper.ts` | 17 | 1 | script-facing `EventChannel` handle in `releaseList` |
| `src/renderer/ui/tabs/PageTabsView.ts` | 94, 159, 166 | 3 | internal page-layout composite handles |

There are **33 textual matches** for `.unsubscribe()` in `src/renderer`. The remaining three
are not subscription call sites: `src/renderer/editors/browser/BrowserSecondaryViews.ts:32,40`
call that class’s own private `unsubscribe()` helper, and
`src/renderer/api/types/events.d.ts:101` is a documentation example. The helper calls must not
be mistaken for the handle shape being migrated.

### Five global events and their consumers

The five instances remain declared in `src/renderer/core/state/events.ts` and retain their
names and import sites. Their complete producer/consumer inventory is:

| Global | Producers / send method | Subscribers / use |
|---|---|---|
| `globalKeyDown` | `src/renderer/api/internal/KeyboardService.ts:15-17`, `KeyboardService.handleKeyDown()` calls `globalKeyDown.send(e)` | `src/renderer/editors/browser/BrowserEditor.ts:77`, constructor subscribes; `handleGlobalKeyDown()` is the callback |
| `browserUrlChanged` | `src/renderer/editors/browser/BrowserWebviewModel.ts:196,245`, navigation handlers call `browserUrlChanged.send({ url })` | `src/renderer/editors/draw/DrawBodyView.ts:225`, `onMount()` subscribes `handleBrowserUrl` |
| `windowClosing` | `src/renderer/api/internal/GlobalEventService.ts:243-245`, `handleBeforeUnload()` calls `windowClosing.send()` | `src/renderer/editors/browser/BrowserTorModel.ts:17`, constructor subscribes; `handleWindowClosing()` releases Tor resources |
| `secondaryViewsToggled` | `src/renderer/api/pages/PageModel.ts:519-520`, `setSecondaryViewsState()` sends when `open` changes | No renderer subscriber found. `src/renderer/ui/secondary-views/SecondaryViewsModel.ts` only documents the event; it is not a subscriber. |
| `panelExpanded` | `src/renderer/api/pages/PageModel.ts:517`, `PageModel.setSecondaryViewsState()`; `src/renderer/editors/browser/BrowserPanelHost.ts:154`, `BrowserPanelHost.setSecondaryViewsState()` | `src/renderer/editors/notebook/NotebookBodyView.ts:199-207`, `NotebookBodyView.onMount()` callback filters by page id |

The declaration file also carries the event payload types: `BrowserUrlEvent`,
`SecondaryViewsEvent`, and `PanelExpandedEvent`. No producer changes are required because
`Subscription.send()` remains the same public operation.

### Dispatch semantics that must not change

The following is the measured contract, including mutation and exception behavior. “Current
dispatch” means one call already in progress; “snapshot” means the handler list copied at the
start of that call.

| Primitive | Current order and mutation behavior | Current throw behavior | Replacement requirement |
|---|---|---|---|
| `Subscription` in `src/renderer/core/state/events.ts` | `AppEvent` uses `EventTarget`, so listeners run synchronously in DOM registration order (FIFO). `CustomEvent.detail` carries the payload. If a listener removes another listener during dispatch, DOM `removeEventListener` marks that listener removed and it is skipped if not yet invoked. A newly added listener does not join the current dispatch. | A listener exception is reported as an uncaught DOM event exception; it does not escape `dispatchEvent`, and later listeners still run. `Subscription.send()` therefore does not throw the listener error to its caller. | `Emitter.fire()` must use a plain listener array with a per-registration active/removal guard and a start-of-fire snapshot: removed registrations are skipped, additions wait for the next fire, FIFO is retained, and one listener’s exception is reported without stopping later listeners or escaping `Subscription.send()`. No `CustomEvent` is allocated. `Subscription.send()` must normalize `undefined` to `null` before calling `fire()`, preserving `CustomEvent.detail` for no-data sends. |
| `EventChannel.send` | `src/renderer/api/events/EventChannel.ts:55-63` freezes the event, snapshots `handlers`, and invokes the snapshot in FIFO order. Removing a handler during the send does not remove it from that current snapshot; adding one does not add it to that snapshot. | Each handler error is caught and passed to `errorHandler`; the next handler still runs. If a custom `onError` itself throws, that error escapes and interrupts the send. | Preserve freeze, FIFO, snapshot behavior, and error-handler behavior exactly. Only the returned handle changes to a function. |
| `EventChannel.sendAsync` | `src/renderer/api/events/EventChannel.ts:71-91` snapshots `handlers`, traverses the snapshot from last to first (LIFO), awaits each result, and checks `event.handled` after each handler. Removal does not alter the current snapshot. | Handler errors go to `errorHandler`, then the next snapshot handler is considered; `handled` is checked after the error too. A throwing custom `onError` escapes. | Preserve LIFO, awaiting, snapshot, and `handled` short-circuit exactly. Late subscribers must still intercept before earlier subscribers, including the content open handler. This is the primary defect boundary. |
| `ComponentQueue.subscribe` / `send` | `src/renderer/core/state/ComponentQueue.ts:20-41` has one handler, not a listener list. `send()` delivers synchronously when present and queues events otherwise. `subscribe()` replaces the existing handler, drains queued events FIFO before returning its disposer, and an old disposer cannot clear a replacement handler. A disposer called while the one handler is running only clears the handler for subsequent sends; there is no second listener to skip. | A handler error from `send()` propagates synchronously. A handler error while `subscribe()` drains queued events propagates from `subscribe()`; there is no queue error handler. | Keep one-handler replacement, synchronous send, queue-then-drain FIFO, and propagation. Keep the existing `() => void` return. `dispose(): void` still clears queued events, handler, and pending requests. |
| `ComponentQueue.register` / `execute` | Request handlers are also singular. Pending requests drain FIFO on `register()`; `execute()` resolves immediately through the handler or queues a request. An unregister during a running request affects later requests only. | Synchronous `execute()` handler throws become rejected promises; throws while `register()` drains pending requests reject the individual requests. `dispose()` rejects pending requests with its existing error. | Keep request/reply and rejection behavior. The existing function disposer remains the common shape. |
| `TOneState.stateChanged` (related hazard, out of scope) | `src/renderer/core/state/state.ts:25-27` runs `this.listeners.forEach(...)`. Its disposer uses `this.listeners = this.listeners.filter(...)`, so an unsubscribe during dispatch replaces the field but the in-flight `forEach` keeps the old array: the removed later listener still runs in that dispatch. | Listener exceptions propagate out of `forEach` and stop later listeners. | Record this difference; do not “fix” it in US-1196. `TOneState` is explicitly out of scope. |
| IPC `RendererEventObject` | `src/ipc/renderer/renderer-events.ts:39-45` uses FIFO `forEach` over its current array. Its disposer currently filters by replacing the array, so an unsubscribe during dispatch does not affect that in-flight `forEach`; additions do not extend the current `forEach` length. | Each callback is caught and logged with `console.error`; later callbacks continue and the IPC delivery does not throw the callback error. | Change only the return shape to a function and keep this FIFO/error behavior. Do not silently make it behave like `Subscription` or `EventChannel`. |

The distinction between `Subscription` and `TOneState` is therefore material: copying the
`TOneState` filter-and-`forEach` pattern into `Emitter` would be a behavior change. The Emitter
must model the DOM removal rule explicitly while `EventChannel` must continue using its existing
snapshot rule.

For the `Subscription` row specifically, `CustomEvent.detail` is `null` whenever
`emitEvent()` receives `undefined`; that is why the replacement requirement includes the
`Subscription.send()` normalization even though the generic `Emitter.fire()` preserves its
argument unchanged.

## Implementation Plan

1. **Add the plain-array Emitter contract in `src/renderer/core/state/events.ts`.**

   Define `Event<T>` as a registration function whose return type is `() => void`, and define
   `Emitter<T>` with a listener array, an `event` registration member, and synchronous `fire()`.
   Give each registration an active guard so a disposer called during `fire()` suppresses that
   registration if it has not run yet; fire a snapshot so additions wait for the next dispatch;
  preserve duplicate registrations as independent registrations. Catch each listener exception,
   schedule an asynchronous throw (`setTimeout(() => { throw error; }, 0)`), and continue. This
   preserves `EventTarget`’s non-propagating dispatch while still surfacing the failure through
   `window.onerror` and devtools as an uncaught error; do not replace this with `console.error`
   or `EventChannel`’s `errorHandler`.

  Rewrite `Subscription<D>` in the same file to delegate `subscribe()` to the Emitter’s
   `event` and `send()` to `fire()`, normalizing `undefined` to `null` at the `send()` boundary.
   The generic Emitter must not rewrite its `fire()` argument. Remove `AppEvent`, its
   `EventTarget` / `CustomEvent` use,
   `SubsribtionCallback`, and `SubscriptionObject`; no constructor arguments or public global
   names are used outside this file. Keep the five global instances exactly named and typed.

   Before → after:

   ```ts
   // Before: src/renderer/core/state/events.ts
   export class AppEvent extends EventTarget { /* emitEvent creates CustomEvent */ }
   export interface SubscriptionObject { unsubscribe: () => void; }

   subscribe = (callback: SubsribtionCallback<D>): SubscriptionObject => {
       const callbackWrapper = (event: Event) => callback((event as CustomEvent).detail);
       this.appEvent.addEventListener(this.type, callbackWrapper);
       return { unsubscribe: () => this.appEvent.removeEventListener(this.type, callbackWrapper) };
   };

   // After: same file
   export type Event<T> = (listener: (event: T) => void) => () => void;

   export class Emitter<T> {
       readonly event: Event<T>;
       fire(event: T): void { /* guarded snapshot; async uncaught throw; continue */ }
   }

   export class Subscription<D = undefined> {
       private readonly emitter = new Emitter<D>();
       subscribe = (callback: (event: D) => void): (() => void) =>
           this.emitter.event(callback);
       send = (data: D): void => this.emitter.fire((data === undefined ? null : data) as D);
   }
   ```

2. **Unify channel and public type contracts without touching channel semantics.**

   In `src/renderer/api/events/EventChannel.ts`, change `subscribe(handler)` to return the
   disposer directly. Keep `handlers`, the `send()` freeze and FIFO snapshot, and
   `sendAsync()`’s reverse snapshot traversal, await, `handled` check, and error handling
   byte-for-byte in meaning. In `src/renderer/api/types/events.d.ts`, delete
   `ISubscriptionObject`, change `IEventChannel.subscribe()` to return `() => void`, correct its
   `send()` documentation to FIFO (the current declaration incorrectly says LIFO), and update
   the example from `sub.unsubscribe()` to `dispose()`/`release()` invocation. Remove the stale
   re-export from `src/renderer/api/events/index.ts`.

   Before → after:

   ```ts
   // Before: EventChannel.subscribe
   subscribe = (handler: EventHandler<TEvent>): ISubscriptionObject => {
       this.handlers.push(handler);
       return { unsubscribe: () => { /* splice handler */ } };
   };

   // After
   subscribe = (handler: EventHandler<TEvent>): (() => void) => {
       this.handlers.push(handler);
       return () => { /* same identity-based splice */ };
   };
   ```

3. **Convert every `{ unsubscribe }` provider and service contract.**

   Change `IProvider.watch()` in `src/renderer/api/types/io.provider.d.ts` and
   `IContentPipe.watch()` in `src/renderer/api/types/io.pipe.d.ts` to return `() => void`.
   Update the exact implementations in `src/renderer/content/ContentPipe.ts`,
   `src/renderer/content/providers/FileProvider.ts`,
   `src/renderer/content/providers/MnemeProvider.ts`,
   `src/renderer/content/tree-providers/FileTreeProvider.ts`,
   `src/renderer/content/tree-providers/MnemeTreeProvider.ts`, and
   `src/renderer/editors/link-editor/LinkTreeProvider.ts`; preserve watcher debounce, refcount,
   no-op failure, and state-selector behavior.

   Change `MnemeConnection.onStatusChange()`, `MnemeConnection.subscribe()`, and
   `MnemeConnection.onListChanged()` in `src/renderer/api/mneme-connection.ts` to return
   functions, preserving Set membership, URI refcounting, reconnect replay, and callback order.
   Change the corresponding retained fields and cleanup in
   `src/renderer/components/tree-provider/CategoryViewModel.ts`,
   `src/renderer/components/tree-provider/TreeProviderViewModel.ts`,
   `src/renderer/editors/text/TextFileIOModel.ts`,
   `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts`, and
   `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts`.

   Before → after at a watcher call site:

   ```ts
   // Before
   private watchSubscription?: { unsubscribe: () => void };
   this.watchSubscription?.unsubscribe();
   this.watchSubscription = provider.watch(() => this.buildTree());

   // After
   private watchSubscription?: () => void;
   this.watchSubscription?.();
   this.watchSubscription = provider.watch(() => this.buildTree());
   ```

4. **Convert the IPC renderer event object and its retained handles.**

   In `src/ipc/api-types.ts`, make `EventObject.subscribe()` return `() => void` and remove or
   replace the object-shaped `EventSubscription` alias. In `src/ipc/renderer/renderer-events.ts`,
   return the existing filter-based removal function directly while preserving FIFO `forEach`
   and callback error logging. Update `src/renderer/api/downloads.ts`’s subscription collection
   type and all retained IPC handles in `src/renderer/editors/about/AboutView.ts`,
   `src/renderer/editors/board/BoardWebview.ts`,
   `src/renderer/editors/board-info/BoardInfoEditorModel.ts`,
   `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts`, and
   `src/renderer/editors/settings/sections/McpSectionModel.ts`.

   Before → after:

   ```ts
   // Before: src/ipc/renderer/renderer-events.ts
   return {
       unsubscribe: () => {
           this.subscribers = this.subscribers.filter((cb) => cb !== callback);
       },
   };

   // After
   return () => {
       this.subscribers = this.subscribers.filter((cb) => cb !== callback);
   };
   ```

5. **Change the settings adapter and every `{ dispose }` settings consumer.**

   In `src/renderer/api/types/common.d.ts`, change `IEvent.subscribe()` to return `() => void`
   and update its example. In `src/renderer/api/internal.ts`, make `wrapSubscription()` return
   the underlying `Subscription` disposer directly; remove its `ISubscriptionObject`-specific
   comment and `.unsubscribe()` call. `src/renderer/api/settings.ts` keeps the same
   `wrapSubscription(this._onChanged)` construction and the same settings event behavior, but
   `settings.onChanged.subscribe()` now exposes a function.

   Update the retained settings cleanup in
   `src/renderer/api/library-service.ts`,
   `src/renderer/editors/settings/sections/SettingsSections.ts`,
   `src/renderer/editors/settings/sections/FileSearchSection.ts`,
   `src/renderer/editors/settings/sections/McpSection.ts`,
   `src/renderer/editors/settings/sections/BrowserProfilesSection.ts`,
   `src/renderer/ui/tabs/PageTabView.ts`,
   `src/renderer/ui/tabs/PageTabsView.ts`,
   `src/renderer/ui/sidebar/TrustedBoardsListView.ts`,
   `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts`,
   `src/renderer/ui/sidebar/PinnedRailView.ts`,
   `src/renderer/ui/sidebar/BuiltinEditorsListView.ts`,
   `src/renderer/editors/video/VideoView.ts`, and
   `src/renderer/editors/video/AudioVisualizer.ts`.

   Before → after:

   ```ts
   // Before
   const subscription = settings.onChanged.subscribe(handler);
   this.own(() => subscription.dispose());

   // After
   const release = settings.onChanged.subscribe(handler);
   this.own(release);
   ```

6. **Rewrite all 30 real `.unsubscribe()` call sites as disposer calls.**

   Apply the per-file inventory above, including fields typed as `SubscriptionObject`,
   `ISubscriptionObject`, or inline `{ unsubscribe: () => void }`. Preserve existing release
   timing and rebind order. In `src/renderer/ui/tabs/PageTabsView.ts`, change the internal
   `PageLayoutSubscription.unsubscribe` member and its three callers to a non-subscription
   release member (for example `release`) that remains a composite of the page and editor
   disposers.

   `src/renderer/editors/browser/BrowserSecondaryViews.ts` is not part of this rewrite: its
   `private unsubscribe()` is a class lifecycle helper that already invokes function disposers,
   not a subscription object method.

7. **Run static and manual verification without adding tests or a harness.**

   Static checks after implementation:

   - `rg "SubscriptionObject|ISubscriptionObject|EventSubscription" src/renderer src/ipc` has
     no stale object-shaped subscription declarations or imports.
   - The 30 actual call sites above contain no handle `.unsubscribe()` invocation, and the one
     direct disposer extraction in `src/renderer/editors/draw/DrawBodyView.ts:225` no longer
     accesses an `.unsubscribe` member; the only
     remaining `this.unsubscribe()` text is the explicitly out-of-scope
     `BrowserSecondaryViews` helper, if it remains named that way.
   - `rg "return \{\s*dispose|\.dispose\(\)"` is reviewed so settings subscription cleanup
     is callable while ordinary resource/model `.dispose()` methods remain unchanged.
   - `npm run typecheck` and `npm run lint` pass. Do not add unit tests or a test harness.

   Human running-app verification of the critical `EventChannel.sendAsync()` contract:

   1. Open a temporary JavaScript script in the existing script runner and run it with F5 while
      the app is running. Use the public `app.events.openRawLink` channel, which is the real
      content-pipeline channel and is wrapped by `AppWrapper`.
   2. Register an older handler first and a newer handler second. The newer handler records
      `"late"` and sets `event.handled = true`; the older handler records `"early"`.
   3. Await `sendAsync(io.createLinkData("https://example.invalid/"))`, display the recorded
      order with `app.ui.notify()`, then call both returned function disposers.

   ```js
   const order = [];
   const releaseEarly = app.events.openRawLink.subscribe(() => order.push("early"));
   const releaseLate = app.events.openRawLink.subscribe((event) => {
       order.push("late");
       event.handled = true;
   });
   await app.events.openRawLink.sendAsync(io.createLinkData("https://example.invalid/"));
   await app.ui.notify(order.join(" → "));
   releaseLate();
   releaseEarly();
   ```

   The notification must be exactly `late`. `late → early` means dispatch order or the
   `handled` short-circuit regressed. The invalid URL is intentional: the late handler handles
   the event before the built-in parser/open handler can act. While performing this pass, open
   and close a Browser, Drawing, Notebook, watched text file, and settings page to confirm the
   five globals, queue subscriptions, watcher releases, and settings refreshes still work.

## Concerns

- **`EventChannel.sendAsync()` order is a hard contract.** `src/renderer/api/app.ts` registers
  the open handler first, then resolvers and parsers; later script subscribers must run first.
  The reverse snapshot loop must not be replaced by a normal Emitter FIFO loop or a forward
  loop. The running-app script above is the required human check.

- **Emitter removal must not copy `TOneState` blindly.** `TOneState` keeps an in-flight stale
  array after unsubscribe; DOM `EventTarget` does not. Use per-registration activity state with
  a snapshot so `Subscription` preserves the current DOM behavior while `TOneState` remains
  untouched.

- **Exception semantics differ by primitive.** `Subscription` catches each listener exception,
  schedules `setTimeout(() => { throw error; }, 0)` so it still reaches `window.onerror` and
  devtools as “Uncaught”, then continues synchronously to later listeners. It must not use
  `console.error` or `EventChannel`’s `errorHandler`. `EventChannel` calls `onError` and
  continues unless `onError` throws, `ComponentQueue` propagates, and IPC renderer callbacks log
  and continue. The shape migration must not introduce a shared catch policy.

- **Undefined/null payload compatibility is explicit.** The generic `Emitter.fire()` passes its
  argument unchanged, but `Subscription.send()` maps `undefined` to `null` before firing. The
  audit above found no current consumer that distinguishes the two; the normalization preserves
  the old DOM boundary for future consumers too.

- **Settings is a genuine third shape.** Do not leave `IEvent.subscribe()` typed as
  `IDisposable`, and do not merely change `Subscription` while retaining the adapter object;
  otherwise existing settings views will continue to require `.dispose()` and statement 4 will
  remain false.

- **Watcher semantics are not EventChannel semantics.** Provider watches and
  `MnemeConnection` use filesystem/MCP-specific debounce, refcount, Set, and snapshot rules.
  Convert only their returned handle and field cleanup; do not route them through `EventChannel`
  or change their callback order/error behavior.

- **The IPC event object is outside `src/renderer/core/state/`, but inside the renderer event
  surface.** Its shared `EventObject` contract and `rendererEvents` implementation must be
  included so the renderer does not retain a second `{ unsubscribe }` producer after the core
  migration.

- **No ownership conversion belongs here.** Existing function disposers may continue to be
  passed to `own()` where already done. Do not convert hand-rolled subscription fields or add
  `ownSubscription()`; US-1197 depends on this shape barrier.

## Acceptance Criteria

- `src/renderer/core/state/events.ts` exports a plain-array `Emitter<T>` and `Event<T>`; firing
  does not allocate `CustomEvent`, `Subscription.send()` normalizes `undefined` to `null`, and
  `Subscription.subscribe()` returns `() => void`.
- `Subscription` retains FIFO synchronous delivery, DOM-equivalent unsubscribe-during-dispatch
  behavior. Each listener exception is caught, re-thrown asynchronously so it remains visible to
  `window.onerror`/devtools as an uncaught error, and does not stop later listeners.
- `globalKeyDown`, `browserUrlChanged`, `windowClosing`, `secondaryViewsToggled`, and
  `panelExpanded` keep their names, payloads, send sites, and import sites, and their current
  producers/consumers still work.
- `EventChannel.send()` remains frozen-event FIFO with its snapshot and error behavior.
- `EventChannel.sendAsync()` remains newest-first LIFO, awaits each handler, checks
  `event.handled` after each handler, and preserves snapshot/error behavior. The running-app
  verification reports exactly `late` for the supplied script.
- `ComponentQueue.subscribe()` and `register()` still return functions; queue-then-drain,
  request/reply, replacement, pending-request rejection, and `dispose(): void` behavior are
  unchanged.
- `IEvent.subscribe()` / `settings.onChanged.subscribe()`, provider and pipe `watch()`,
  MnemeConnection registrations, IPC renderer events, and `EventChannel.subscribe()` all return
  `() => void`.
- `SubscriptionObject`, `ISubscriptionObject`, and the object-shaped IPC subscription contract
  are gone; no retained subscription cleanup calls `.unsubscribe()` or settings
  `.dispose()` on a subscription handle.
- The 30 real `.unsubscribe()` call sites are all converted to calls of their returned
  disposers, with release timing unchanged. The two `BrowserSecondaryViews` lifecycle-helper
  calls are documented as excluded rather than accidentally rewritten.
- No changes are made to `TOneState`, `TModel`, `TComponentModel`, `VanillaView`, `memo()`, or
  `doc/active-work.md`.
- No unit tests or test harnesses are added. `npm run typecheck` and `npm run lint` pass.

## Files Changed

The table is the complete planned implementation surface; files not listed here are not to be
modified for US-1196.

| File | Planned change |
|---|---|
| `src/renderer/core/state/events.ts` | Add `Emitter<T>` / `Event<T>`; migrate `Subscription`; remove `AppEvent`, `CustomEvent`, and `SubscriptionObject`; preserve the five globals. |
| `src/renderer/api/events/EventChannel.ts` | Return callable disposers while preserving FIFO/LIFO snapshots, freeze, await, short-circuit, and errors. |
| `src/renderer/api/events/index.ts` | Remove the `ISubscriptionObject` re-export. |
| `src/renderer/api/types/events.d.ts` | Replace `ISubscriptionObject` and channel return type; correct FIFO documentation and examples. |
| `src/renderer/api/types/common.d.ts` | Change `IEvent.subscribe()` from `IDisposable` to `() => void`; update the example. |
| `src/renderer/api/internal.ts` | Make `wrapSubscription()` expose the underlying callable disposer. |
| `src/renderer/api/types/io.provider.d.ts` | Make provider `watch()` return `() => void`. |
| `src/renderer/api/types/io.pipe.d.ts` | Make pipe `watch()` return `() => void`. |
| `src/renderer/content/ContentPipe.ts` | Delegate `watch()` with the callable return type. |
| `src/renderer/content/providers/FileProvider.ts` | Return callable file-watch disposers. |
| `src/renderer/content/providers/MnemeProvider.ts` | Return the Mneme connection disposer directly. |
| `src/renderer/content/tree-providers/FileTreeProvider.ts` | Return callable directory-watch disposers. |
| `src/renderer/content/tree-providers/MnemeTreeProvider.ts` | Return the list-change disposer directly. |
| `src/renderer/editors/link-editor/LinkTreeProvider.ts` | Return the state-watch disposer directly. |
| `src/renderer/api/mneme-connection.ts` | Convert status, resource, and list-change registration returns to functions. |
| `src/ipc/api-types.ts` | Change `EventObject.subscribe()` and its subscription alias to the callable shape. |
| `src/ipc/renderer/renderer-events.ts` | Return the existing IPC removal closure directly; preserve FIFO and logging. |
| `src/renderer/api/downloads.ts` | Update the retained IPC subscription collection type. |
| `src/renderer/scripting/api-wrapper/AppWrapper.ts` | Return and auto-track callable channel disposers. |
| `src/renderer/api/boards.ts` | Call the returned `installed` disposer. |
| `src/renderer/api/pages/PagesModel.ts` | Store the descriptor subscription as a callable disposer. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Type and call provider-watch disposers. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Type and call provider-watch disposers. |
| `src/renderer/editors/about/AboutView.ts` | Own the callable IPC event disposer. |
| `src/renderer/editors/base/TextChromeView.ts` | Call the callable focus disposer. |
| `src/renderer/editors/board/BoardWebview.ts` | Store the callable focus disposer. |
| `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | Type and call callable IPC event disposers. |
| `src/renderer/editors/browser/BrowserEditor.ts` | Type and call the callable `globalKeyDown` disposer. |
| `src/renderer/editors/browser/BrowserTorModel.ts` | Type and call the callable `windowClosing` disposer. |
| `src/renderer/editors/draw/DrawBodyView.ts` | Pass the callable browser-URL disposer directly to `own()`. |
| `src/renderer/editors/markdown/MarkdownBodyView.ts` | Type and call the callable focus disposer. |
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | Type and call callable status/connection disposers. |
| `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | Type and call the callable status disposer. |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | Type and call the callable `panelExpanded` disposer. |
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | Store callable IPC status disposers. |
| `src/renderer/editors/text/TextFileIOModel.ts` | Type and call callable pipe-watch disposers. |
| `src/renderer/api/library-service.ts` | Store and call the callable settings disposer. |
| `src/renderer/editors/settings/sections/SettingsSections.ts` | Pass callable settings disposers to `own()`. |
| `src/renderer/editors/settings/sections/FileSearchSection.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/editors/settings/sections/McpSection.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/editors/settings/sections/BrowserProfilesSection.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/ui/tabs/PageTabView.ts` | Call the callable settings disposer; retain existing icon/state cleanup. |
| `src/renderer/ui/tabs/PageTabsView.ts` | Call callable settings/page-layout disposers and remove the internal `unsubscribe` shape. |
| `src/renderer/ui/sidebar/TrustedBoardsListView.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/ui/sidebar/BuiltinEditorsListView.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/editors/video/VideoView.ts` | Pass the callable settings disposer to `own()`. |
| `src/renderer/editors/video/AudioVisualizer.ts` | Pass the callable settings disposer to `own()`. |

Files that need **NO changes**:

- `src/renderer/core/state/state.ts` — its known unsubscribe-during-dispatch stale-array
  behavior is recorded but is out of scope.
- `src/renderer/core/state/ComponentQueue.ts` — `subscribe()` and `register()` already return
  functions; `send()`, queue draining, request/reply, and `dispose()` remain unchanged.
- `src/renderer/core/state/model.ts` — reserved for US-1193/1194/1195.
- `src/renderer/uikit/shared/vanilla-view.ts` — ownership API is not changed by this shape
  barrier.
- `src/renderer/core/state/index.ts` — its existing `export * from './events'` already exposes
the new core symbols.
- `src/renderer/api/events/AppEvents.ts` — its `AppEvents` class is unrelated to the deleted
  `core/state/events.ts` `AppEvent` and has no teardown-shape dependency.
- `src/renderer/api/settings.ts` and `src/renderer/api/types/settings.d.ts` — the settings
  construction and public property remain the same; only the adapter and shared `IEvent`
  contract change.
- `src/renderer/api/app.ts`, `src/renderer/api/board-vars/BoardEnvStore.ts`, and
  `src/renderer/api/mneme-status.ts` — their settings subscriptions ignore the returned handle.
- `src/renderer/scripting/api-wrapper/ClaudeSession.ts`, `src/shared/execute-handle.ts`,
  `src/renderer/api/types/proc.d.ts`, `src/renderer/api/proc.ts`, and
  `src/ipc/runner-channels.ts` — their event/transport registrations already return callable
  disposers and are not object-shaped subscription APIs.
- `src/renderer/api/internal/KeyboardService.ts`,
  `src/renderer/api/internal/GlobalEventService.ts`,
  `src/renderer/editors/browser/BrowserWebviewModel.ts`,
  `src/renderer/editors/browser/BrowserPanelHost.ts`, and
  `src/renderer/api/pages/PageModel.ts` — global event producers keep the same `send()` calls.
- `src/renderer/editors/browser/BrowserSecondaryViews.ts` — its private `unsubscribe()` helper
  releases already-callable state disposers and is not a subscription object call.
- `src/renderer/core/state/model.ts` consumers using `TOneState.subscribe()` or
  `ComponentQueue.subscribe()` — their existing callable shape is already the target shape;
  only the separately inventoried object/dispose consumers are changed.
