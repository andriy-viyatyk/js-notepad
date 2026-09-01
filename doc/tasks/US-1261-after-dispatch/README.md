# US-1261: P2 - add `afterDispatch` (additive) and convert three ordering workarounds

## Status

**Status:** In Progress
**Priority:** High (epic decision point)
**Epic:** [EPIC-080 - State, lifetime & scheduling core](../../epics/EPIC-080.md)
**Started:** -
**Completed:** -

## Goal

Add a renderer-wide `afterDispatch(fn)` primitive that runs work after the current synchronous
`TOneState` dispatch and all nested state dispatches settle, then convert only the three verified
ordering workarounds in this task. The primitive and conversions must remain additive: existing
`set()` semantics and unrelated call sites stay unchanged so this task remains a safe abort point
for EPIC-080's highest-risk mechanism.

## Background

`TOneState.set()` assigns the new value and synchronously notifies a snapshot of subscribers through
`ListenerList.dispatchSync()` (`src/renderer/core/state/state.ts:43-112`). The listener core already
skips registrations retired during a dispatch and contains each listener error, escalating it with
`setTimeout(() => { throw error; }, 0)`. `update()` and `clear()` delegate to `set()`, so the new
boundary belongs around the one `stateChanged` dispatch path, not around every write site.

The depth must be module-global. A listener for one state can synchronously update a different state,
and both dispatches are one nested pass for ordering purposes. A method on `TOneState` would carry a
per-instance depth and could drain between those two states. The implementation therefore belongs in
the small renderer-core module `src/renderer/core/state/dispatch.ts`, exporting `afterDispatch` and
an internal dispatch-scope helper used by `stateChanged`. Keep this module out of
`src/renderer/core/state/index.ts`: the coding standards prefer direct imports to avoid cycles,
`listener-list.ts` is deliberately kept internal for the same reason, and a barrel export would
advertise an additive rollout primitive as a general state surface. The three conversion sites use
the direct `../../core/state/dispatch` import.

The current listener/event boundaries are already verified:

- `TOneState.stateChanged` is the only state-dispatch boundary (`state.ts:71-76`); `set()` calls it
  once after assigning the state (`state.ts:79-82`).
- `Emitter.fire` is synchronous and error-contained (`src/renderer/core/state/events.ts:5-19`),
  but it is an event broadcast, not a state transaction. It must not alter the state depth.
- `EventChannel.send` freezes an event and dispatches synchronously
  (`src/renderer/api/events/EventChannel.ts:49-59`); it also remains outside the depth.
- `EventChannel.sendAsync` awaits each LIFO subscriber (`EventChannel.ts:61-74`). Holding a depth
  across that await would keep a synchronous transaction open across arbitrary asynchronous work,
  so it must remain outside the depth. A state write made by a handler is still counted for its own
  synchronous `stateChanged` call.

The task's three candidates are genuine ordering workarounds in the current source:

| Candidate | Verified source and current behavior | Conversion result |
|---|---|---|
| Empty-page replacement | `src/renderer/api/pages/PagesModel.ts:164-171` schedules `lifecycle.addEmptyPage()` with `setTimeout(..., 0)` specifically to wait for page-removal dispatch observers. The original two callers are `removePage()` at `PagesModel.ts:161` and bootstrap `PagesPersistenceModel.init()` at `src/renderer/api/pages/PagesPersistenceModel.ts:273`. Inspection found that `attachPage` continues with `page.dispose()` after `removePage()` (`PagesModel.ts:96-100`), and `movePageOut` continues with keep-alive editor disposal (`PagesLifecycleModel.ts:642-653`). `addEmptyPage()` creates/restores a new text editor and appends it with another state update (`PagesLifecycleModel.ts:240-244, 226-235`). | Holds up only with a call-site relocation. Remove the call from `removePage`; call `checkEmptyPage()` after `page.dispose()` settles in the close callback and after the keep-alive disposal loop in `movePageOut`. Leave the bootstrap call at the end of `PagesPersistenceModel.init()`. Then replace the timer with `afterDispatch`, preserving the empty-pages guard and the caller-level teardown order. |
| Native editor retirement | `src/renderer/ui/app/AsyncEditorView.ts:63-74` removes the editor host immediately, then queues the captured native editor view's `dispose()` in a microtask. This is the inner editor teardown boundary reached while a page/editor state subscriber is rebuilding the page content. | Holds up. Replace the microtask with `afterDispatch`; retain `live` and `generation` for asynchronous module-load invalidation, but remove only the local disposal-generation check, which is no longer needed for a captured resource that is queued FIFO. |
| Compare-editor retirement | `src/renderer/ui/app/PageContentView.ts:195-204` removes the compare root immediately, then queues its captured `CompareEditor.dispose()` in a generation-guarded microtask. The compare/editor lifecycle is separate from the sanctioned-helper reimplementation in `PageContentView.ts:125-182` covered by US-1265. | Holds up. Replace the microtask with `afterDispatch`; remove the compare-only generation counter/check so every captured retired compare view is disposed in FIFO order, including consecutive transitions in one dispatch pass. Keep `live` and its direct-subscription guard. |

The source scale explains why this task does not broaden into a state rewrite. Re-measured with
`rg -o` over TypeScript/TSX under `src` at investigation time:

| Pattern | Current count | Scope note |
|---|---:|---|
| `state.update\(` | 718 | `src` TS/TSX |
| `state.set\(` | 8 | `src` TS/TSX |
| `\.subscribe\(` | 208 | `src` TS/TSX; 207 under `src/renderer`, plus one shared transport subscription |
| `this.bind\(` | 163 | `src` TS/TSX |

There are 102 renderer files constructing a `TOneState`, `TGlobalState`, or `TComponentState`.
There is no existing `afterDispatch` consumer. No existing signature is being changed: the new
`afterDispatch` export has zero callers before this task, the internal dispatch-scope helper will
have one caller in `state.ts`, and `TOneState`, `Emitter`, and `EventChannel` public contracts stay
as they are.

## Implementation Plan

### 1. Add the module-global dispatch scope

Create `src/renderer/core/state/dispatch.ts`.

- Keep `dispatchDepth`, the FIFO callback queue, and a `draining` flag module-private. The queue is
  global to the renderer module instance, not attached to a state object.
- Export `afterDispatch(fn: () => void): void` with the exact contract: when `dispatchDepth > 0`,
  append `fn`; when `dispatchDepth === 0` and no drain is active, call `fn()` synchronously; when a
  drain is active, append `fn` even though the depth is zero.
- Export only the narrow internal enter/leave (or equivalent `runInDispatch`) seam needed by
  `state.ts`; do not expose the counter or queue as mutable state.
- Enter before `ListenerList.dispatchSync`, leave in `finally`, and begin one drain only when the
  global depth returns to zero. Nested state writes, including writes to different state objects,
  increment the same counter and cannot trigger an intermediate drain.
- Drain FIFO. Use an index/cursor or equivalent so queue processing remains linear. A callback added
  during a drain appends behind callbacks already queued and is processed in that same drain pass.
- Set a named maximum callback count per drain (10,000 is the planned defensive ceiling). If the
  ceiling is exceeded, clear the pending queue, reset the draining state in `finally`, and escalate a
  descriptive error with the same asynchronous throw policy. This prevents an accidental callback
  that continually registers another callback from freezing the renderer forever. The cap is an
  emergency failure path, not normal coalescing or deduplication.
- Catch each queued callback independently. On an error, retain the FIFO loop and schedule
  `setTimeout(() => { throw error; }, 0)`, matching `TOneState.stateChanged` and `Emitter.fire`.
  Therefore one failing epilogue does not prevent later callbacks from running. A callback invoked
  immediately because no dispatch/drain is active is an ordinary direct call; its exception remains
  synchronous because there is no dispatch queue to contain it.
- Do not coalesce duplicate function registrations. Each registration is an ordered request and the
  same function may intentionally represent two independent post-dispatch actions.

Before:

```ts
// No shared dispatch scope exists.
export function afterDispatch(fn: () => void): void { /* absent */ }
```

After:

```ts
let dispatchDepth = 0;
let draining = false;
const pending: Array<() => void> = [];

export function afterDispatch(fn: () => void): void {
    if (dispatchDepth > 0 || draining) pending.push(fn);
    else fn();
}

// Internal seam used only by TOneState.stateChanged.
export function runInDispatch(fn: () => void): void {
    dispatchDepth++;
    try {
        fn();
    } finally {
        dispatchDepth--;
        if (dispatchDepth === 0 && !draining) drain();
    }
}
```

The snippet is the boundary shape, not permission to omit the FIFO drain's per-callback error
containment or its hard cap. Leave `src/renderer/core/state/index.ts` unchanged; import the
internal primitive directly from `./dispatch` or `../../core/state/dispatch`. Do not add it to
script-facing declarations: it is an internal renderer scheduling primitive.

### 2. Wrap only `TOneState.stateChanged`

Update `src/renderer/core/state/state.ts`:

- Import `runInDispatch` from `./dispatch`.
- Wrap the existing `this.listeners.dispatchSync(...)` call, preserving the current listener
  snapshot, active-registration check, asynchronous error escalation, and listener order exactly.
- Leave `IState`, `set`, `update`, `clear`, selector comparison, `TGlobalState`, and
  `TComponentState` unchanged. In particular, do not batch writes, add an equality gate, or move
  notifications to an asynchronous turn.

Before:

```ts
private readonly stateChanged = () => {
    this.listeners.dispatchSync(
        (listener) => { listener(); },
        (error) => { setTimeout(() => { throw error; }, 0); },
    );
};
```

After:

```ts
private readonly stateChanged = () => {
    runInDispatch(() => {
        this.listeners.dispatchSync(
            (listener) => { listener(); },
            (error) => { setTimeout(() => { throw error; }, 0); },
        );
    });
};
```

`stateChanged` is private and has no consumers to migrate. `runInDispatch` must be called exactly
once here; `Emitter.fire`, `EventChannel.send`, and `EventChannel.sendAsync` are deliberately not
wrapped.

### 3. Convert `PagesModel.checkEmptyPage` without inverting caller teardown

Update `src/renderer/api/pages/PagesModel.ts`:

- Import `afterDispatch` from `../../core/state/dispatch`.
- Remove `this.checkEmptyPage()` from the end of `removePage()`.
- In `attachPage`'s close callback, preserve `detachPage()` and `removePage()` first, then await
  `page.dispose()` before calling `this.checkEmptyPage()` in a `finally` path. `PageModel.close()`
  remains a synchronous callback trigger; the callback's existing disposal promise is simply
  allowed to settle before replacement scheduling.
- In `PagesLifecycleModel.movePageOut`, call `this.model.checkEmptyPage()` after the existing
  keep-alive editor-disposal loop. Do not change that loop into page replacement work or fold
  asynchronous editor disposal into `afterDispatch`; this call is a no-op in the non-close branch,
  which starts with more than one page, but keeps the original caller order explicit.
- Leave the `PagesPersistenceModel.init()` call at its existing end-of-method position.
- Replace only the `setTimeout(..., 0)` in `checkEmptyPage` with `afterDispatch`.
- Keep the callback's live read of `this.state.get().pages.length` and its call to
  `this.lifecycle.addEmptyPage()` unchanged.
- Do not change `removePage`'s state write, `layout.fixGrouping()`, persistence call, `onShow` or
  `onFocus` sends. The check moves out because the old zero-delay timer ran after the caller's
  remaining work, while `afterDispatch` is inline when no dispatch is active.

Before:

```ts
checkEmptyPage = () => {
    // Wait for page-removal dispatch and its observers to settle before creating a replacement.
    setTimeout(() => {
        if (this.state.get().pages.length === 0) {
            this.lifecycle.addEmptyPage();
        }
    }, 0);
};
```

After:

```ts
checkEmptyPage = () => {
    afterDispatch(() => {
        if (this.state.get().pages.length === 0) {
            this.lifecycle.addEmptyPage();
        }
    });
};
```

This preserves the ordering guarantee without claiming that `removePage()`'s final statement is the
whole close operation. `PagesModel.attachPage` currently runs `detachPage(page); removePage(page);
page.dispose()`; `PageModel.dispose()` marks the page disposed, drains its deferred cleanup,
disposes subscriptions, detaches editors, awaits each editor disposal, and clears editor ownership
(`PageModel.ts:761-775`). Replacement is therefore scheduled from the close callback only after that
promise settles, while `PageModel.deferEditorCleanup`, `pendingCleanupPromises`, and its await loop
remain untouched. `movePageOut` invokes keep-alive editor disposal after `removePage`; its
post-removal check is placed after that loop. Bootstrap has no following work after its existing
check. In every case the callback still rechecks current page membership, so an intervening open
suppresses replacement by state rather than by a timer-generation side channel.

### 4. Convert `AsyncEditorView`'s inner native disposal boundary

Update `src/renderer/ui/app/AsyncEditorView.ts`:

- Import `afterDispatch` from `../../core/state/dispatch`.
- In `onDispose`, keep the capture of `vanillaView`, clearing of `vanillaView`/constructor fields,
  and immediate `editorHost.remove()` exactly where they are.
- Replace the queued microtask with `afterDispatch(() => void guard(...))` for that captured view.
- Remove only the `const generation = this.generation` local and the disposal callback's generation
  comparison. Keep the class `generation` and `live` fields and both checks in `load()`: they protect
  asynchronous module completion and are not dispatch-ordering workarounds.
- This removal is behavior-preserving for two verified reasons: `VanillaView.dispose()` is
  idempotent (`src/renderer/uikit/shared/vanilla-view.ts:108-110`), and the `own()` disposer at
  `AsyncEditorView.ts:42` increments `generation` during VanillaView's disposers phase, before
  `onDispose()` runs. Therefore the capture at `AsyncEditorView.ts:69` is already post-increment and
  the old comparison at `:71` always passes; it is not preventing a second disposal today.
- Keep `disposeActiveResource()` synchronous. It is an editor replacement path, not the
  post-dispatch retirement boundary being converted here.

Before:

```ts
const generation = this.generation;
queueMicrotask(() => {
    if (this.generation !== generation) return;
    void guard("Failed to dispose editor", () => vanillaView.dispose());
});
```

After:

```ts
afterDispatch(() => {
    void guard("Failed to dispose editor", () => vanillaView.dispose());
});
```

The host is still detached before disposal. In the state-driven path, disposal moves from an
unspecified microtask to the deterministic epilogue after all state observers. Outside a state
dispatch, the required `afterDispatch` contract is immediate execution; `onDispose` has no further
view work after this callback registration, and the host has already been removed.

### 5. Convert `PageContentView`'s compare retirement boundary

Update `src/renderer/ui/app/PageContentView.ts`:

- Import `afterDispatch` from `../../core/state/dispatch`.
- In `clearCompare`, retain capture/clear of `compareView`, immediate `view.root.remove()`, and the
  guarded disposal error policy.
- Replace the generation increment and queued microtask with one `afterDispatch` callback that
  disposes the captured `view`.
- Delete `PageContentView`'s private `generation` field and its increment in `onMount`'s cleanup;
  it is used only by this compare microtask. Keep `live` and its `sync()` guard because the direct
  page subscription can be present in a listener snapshot when the view is disposed.
- Do not alter `syncContent`, `syncSecondary`, the `RenderEditorView` path, or the code in
  `PageContentView.ts:125-182` that US-1265 will evaluate for `KeyedList`/`SubtreeSwap` helper
  reimplementation.

Before:

```ts
const generation = ++this.generation;
view.root.remove();
queueMicrotask(() => {
    if (this.generation === generation) void guard("Failed to dispose compare editor", () => view.dispose());
});
```

After:

```ts
view.root.remove();
afterDispatch(() => {
    void guard("Failed to dispose compare editor", () => view.dispose());
});
```

FIFO now owns each captured retired view. Removing the compare-only generation check avoids silently
dropping the first captured disposal when two compare transitions occur before the old microtask
would have run; it does not affect the `live` guard or any editor-load generation.

### 6. Preserve the epic's hard exclusions and additive rollout

- Do not edit `src/renderer/api/pages/PageModel.ts` for US-1262. In particular, leave
  `pendingCleanupPromises` (`PageModel.ts:116`) and `drainDeferredEditorCleanup()`'s await loop
  (`PageModel.ts:389-400`) intact, along with the `deferEditorCleanup` timer and generation. That
  mechanism waits for asynchronous editor disposal at page teardown, which `afterDispatch` cannot
  guarantee.
- Do not batch state writes, add an `update()` equality gate, or introduce a dependency graph or
  observable layer.
- Do not convert unrelated `queueMicrotask`/`setTimeout(..., 0)` sites. In particular, do not touch
  `PageModel` internals, `src/renderer/core/state/events.ts`, `src/renderer/api/events/EventChannel.ts`,
  or the US-1265 helper code in `PageContentView`. The only `PagesModel` changes are the relocated
  `checkEmptyPage` calls and its timer body; the only lifecycle change is the corresponding
  `movePageOut` call-site relocation.
- Land and manually exercise the primitive plus the first conversion before expanding its use. If
  real use exposes an ordering surprise that is not resolved by this first conversion attempt, stop
  at US-1261: leave the primitive unused or revert it, and close EPIC-080 on the independent P1/P7/P3
  work. Do not proceed to US-1262 or any broader P2 conversion under that condition.

## Concerns

### Resolved dispatch design questions

1. **Where it lives:** `src/renderer/core/state/dispatch.ts`, module-global depth and queue, kept
   out of `src/renderer/core/state/index.ts` and imported directly by its consumers. This is
   required for nested writes across different `TOneState` instances; a state method would settle
   too early. The direct import also follows the project's anti-cycle guidance and US-1259's
   precedent for keeping the listener core internal.
2. **Re-entrancy during drain:** a queued callback that calls `state.set()` enters the same global
   dispatch scope. Any callbacks registered by that nested dispatch append to the active FIFO and
   run after the current callback returns, in the same drain. `draining` prevents the nested scope
   from starting a second drain. The 10,000-callback ceiling prevents a self-registering callback
   from looping forever; on breach, pending work is discarded, the state is reset safely, and an
   asynchronous error is escalated.
3. **Errors:** each queued callback is isolated. A thrown callback schedules
   `setTimeout(() => { throw error; }, 0)` and the drain continues, matching the existing state and
   emitter policy. The immediate no-dispatch path remains a direct call and therefore propagates
   synchronously.
4. **Queue ordering/duplicates:** registrations are FIFO and duplicate function references do not
   coalesce. The queue represents actions, not listener identity.
5. **Registration during drain:** because `draining` is true even when depth is zero, a call from a
   drain callback appends to the same queue. It never runs inline and cannot reverse the queue order.
6. **Event surfaces:** only `TOneState.stateChanged` participates. `Emitter.fire` and
   `EventChannel.send` are broadcasts, not state transactions; `sendAsync` crosses awaits and cannot
   hold a synchronous depth. State writes initiated inside any of them still enter the shared scope
   through `stateChanged`.

### Behavior risks to review before implementation

- `afterDispatch` changes only opted-in call sites, but its global queue changes the exact point at
  which their side effects land. The first implementation must not silently wrap every update or
  subscription.
- A drain callback may synchronously create another page/editor or dispose a native view. The queue
  must remain in the `draining` state until all callbacks appended by those nested writes have run.
- A failure in one `afterDispatch` callback must be visible asynchronously without preventing the
  remaining cleanup/replacement callbacks. Inspect the scheduled throw policy and the queue reset
  path after an abort-cap failure.
- The compare conversion must dispose every captured retired `CompareEditor`, not skip one because a
  later compare transition changed a generation. The old root-removal-before-dispose order remains
  mandatory.
- The `AsyncEditorView` conversion must not alter stale dynamic-module handling. Switching editor
  type before `getEditorModule()` resolves must still prevent the old module from mounting, while an
  already-mounted native view is detached before its deferred disposal.
- The empty-page conversion must not move replacement creation ahead of caller teardown. The close
  callback must await `PageModel.dispose()` before checking, and `movePageOut` must check only after
  its keep-alive disposal loop. It must not create duplicate replacement pages: it must re-read
  current `pages` at callback time, so an intervening open suppresses `addEmptyPage()`.

### Verification plan: failure modes and observable probes

There is no unit-test or renderer test harness, so verification is typecheck/lint/build plus manual
real use. Run `npm run typecheck`, `npm run lint`, and `npm run build-prod` after the primitive and
again after each conversion. Then use a cold `npm start` from a stopped development server; an HMR
reload is not sufficient for this global scheduling change. Because this is the epic's abort-criterion
task, the first manual probe is the last-page close flow below, before broad mechanics checks.

Exercise these flows and record the expected behavior:

1. **Last-page close and caller teardown (first probe):** close a normal last page, including one
   with an editor whose disposal awaits work. Verify that the old page is detached and its
   `PageModel.dispose()` sequence has settled - including the existing deferred-editor-cleanup
   drain and editor disposal - before `addEmptyPage()` creates exactly one replacement. Also probe
   the multi-page `movePageOut` path with a busy keep-alive Board: the disposal loop must run before
   its moved check, and the non-empty guard must prevent a replacement. If replacement creation is
   observed before this caller-level teardown, stop under EPIC-080's abort criterion; do not expand
   the conversion.
2. **Dispatch mechanics, using the smallest available manual/source probe:** verify that a callback
   registered inside one state listener does not run until the outer and nested dispatches finish;
   a callback registered from a different state listener joins the same FIFO; a callback registered
   during drain runs after the current callback; duplicate registrations run twice; and a throwing
   callback does not suppress later callbacks while its error is escalated asynchronously. Confirm
   that `afterDispatch(fn)` outside dispatch is immediate. Remove any temporary instrumentation.
3. **Page switching and editor replacement:** switch repeatedly among Monaco and a dynamically loaded
   editor, including switching while an editor module is loading. Correct behavior is one active
   `data-name="page-editor"` branch, no blank page, no stale old editor mount, no duplicate editor
   roots, and no uncaught disposal error. The old host is detached before disposal, and the replacement
   remains usable after the dispatch epilogue.
4. **Editor open/close and replacement race:** close a normal page, close the last page, and
   immediately open another page around the same action. Correct behavior is the selected page set
   stays consistent, exactly one empty replacement appears only when the collection remains empty,
   and no replacement races an intervening open. Confirm that page switching and page teardown do
   not remove the `PageModel.deferEditorCleanup` asynchronous disposal drain.
5. **Compare mode:** enter compare mode, exit it, switch the active page, and perform rapid compare
   transitions. Correct behavior is the compare root disappears immediately, every retired
   `CompareEditor` eventually disposes, the next compare view mounts once, and Monaco diff content
   remains editable and does not accumulate stale roots/models.
6. **Content-delivery open path:** open a local file and a URL through the normal
   `openRawLink` -> `openLink` -> `openContent` pipeline, including an editor transition if available.
   Correct behavior is the newest-first async event pipeline still completes, the target page/editor
   is created once with the expected content, and no `afterDispatch` callback fires merely because
   an `EventChannel.sendAsync` await is in flight. This specifically checks the boundary decision
   not to count event-channel awaits as state depth.
7. **Cold-start restore:** start with restored pages, then switch and close them before opening new
   content. Correct behavior is the restored visual page/editor surfaces are present, page state is
   not duplicated, and the empty-page bootstrap path does not add a second page.

The epic abort criterion applies to these manual checks: if an ordering surprise appears in real use
and the first conversion attempt does not resolve it, stop this task and leave `afterDispatch` unused
or revert it. P1, P7, and P3 do not depend on this module and remain independently closable.

## Acceptance Criteria

- [x] `src/renderer/core/state/dispatch.ts` exists with a module-global depth counter, FIFO queue,
  drain guard, explicit immediate-outside-dispatch behavior, and the documented callback ceiling.
- [x] `afterDispatch(fn)` queues behind the current dispatch and all nested dispatches, appends
  re-entrant registrations to the active drain, preserves duplicate registrations, and runs FIFO.
- [x] A throwing queued callback is contained, remaining queued callbacks still run, and the error is
  escalated with `setTimeout(() => { throw error; }, 0)`; cap breaches also terminate the drain and
  escalate asynchronously.
- [x] Only `TOneState.stateChanged` enters/leaves the shared depth. `set()`, `update()`, `clear()`,
  `Emitter.fire`, `EventChannel.send`, and `EventChannel.sendAsync` retain their existing contracts.
- [x] `afterDispatch` is exported only from `src/renderer/core/state/dispatch.ts`; the
  `src/renderer/core/state/index.ts` barrel is unchanged. No script-facing declaration changes and
  no existing callable signature changes are introduced.
- [x] `PagesModel.checkEmptyPage` uses `afterDispatch`, retains the live empty-pages guard, and
  is called after `PageModel.dispose()` in the close callback and after the keep-alive disposal loop
  in `movePageOut`; `removePage`'s state and bookkeeping order are otherwise unchanged.
- [x] `AsyncEditorView.onDispose` removes the host before an `afterDispatch` disposal of the captured
  native view; async module-load `live`/`generation` guards and synchronous replacement disposal
  remain intact.
- [x] `PageContentView.clearCompare` removes the compare root before an `afterDispatch` disposal of
  each captured compare view; only its obsolete compare-disposal generation guard is removed, and
  US-1265 helper work is untouched.
- [x] `src/renderer/api/pages/PageModel.ts` retains `pendingCleanupPromises` and the full
  `drainDeferredEditorCleanup` await loop; US-1262 work is not folded into this task.
- [x] No batching, equality gate, dependency graph, observable layer, broad timer sweep, or unrelated
  P2 conversion is introduced.
- [ ] Verification names and exercises page switching, editor open/close, content delivery, compare
  transitions, nested dispatch/re-entrancy, callback errors, and cold-start restore using the project
  commands and manual checks above; no unit tests or test harnesses are added.
- [ ] If the first conversion attempt produces an unresolved real-use ordering surprise, the task
  stops under EPIC-080's abort criterion and leaves the primitive unused or reverted.
- [ ] `doc/active-work.md` and `doc/epics/EPIC-080.md` are unchanged.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/core/state/dispatch.ts` | New module-global dispatch depth, FIFO epilogue queue, re-entrancy guard, error escalation, and drain ceiling; export `afterDispatch`. |
| `src/renderer/core/state/state.ts` | Enter/leave the shared dispatch scope around the existing `stateChanged` listener dispatch; preserve all existing state semantics. |
| `src/renderer/api/pages/PagesModel.ts` | Replace `checkEmptyPage`'s zero-delay timer with `afterDispatch`; move the check out of `removePage` and run it after close-page disposal settles. |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Run the relocated empty-page check after the existing keep-alive editor-disposal loop in `movePageOut`. |
| `src/renderer/ui/app/AsyncEditorView.ts` | Replace the native editor disposal microtask with `afterDispatch`; retain async-load guards and host-detach order. |
| `src/renderer/ui/app/PageContentView.ts` | Replace compare disposal microtask with `afterDispatch`; remove only the compare-only generation guard and leave US-1265 helper code alone. |

Files that need **no changes** in US-1261:

- `src/renderer/core/state/listener-list.ts` - US-1259's shared listener core is complete; its
  snapshot, active-registration, and error behavior must remain unchanged.
- `src/renderer/core/state/index.ts` - The new scheduling primitive is internal and must not be
  added to the state barrel; consumers import `./dispatch` or `../../core/state/dispatch` directly.
- `src/renderer/core/state/events.ts` - `Emitter.fire`/`Subscription` remain outside the state
  depth, including the five process-lifetime module singletons.
- `src/renderer/api/events/EventChannel.ts` and `src/renderer/api/events/AppEvents.ts` - async event
  channels must not hold dispatch depth across awaits.
- `src/renderer/api/pages/PageModel.ts` - `deferEditorCleanup`, `pendingCleanupPromises`, and
  `drainDeferredEditorCleanup` belong to US-1262 and must remain unchanged.
- `src/renderer/api/pages/PagesPersistenceModel.ts` - its `checkEmptyPage()` caller remains a
  caller; no bootstrap flow rewrite is needed.
- `src/renderer/uikit/shared/vanilla-view.ts` and `src/renderer/core/state/model.ts` - US-1260's
  disposal-store/owner changes are complete; this task needs no new owner API.
- `src/renderer/ui/app/RenderEditorView.ts`, `src/renderer/components/page-manager/PageSlot.ts`,
  and `src/renderer/components/page-manager/AppPageManagerView.ts` - their ownership and
  detach-before-dispose contracts are consumed as-is.
- `src/renderer/api/types/*.d.ts` and `assets/editor-types/` - `afterDispatch` is renderer-internal,
  not script-facing.
- `doc/active-work.md` and `doc/epics/EPIC-080.md` - the user explicitly reserved dashboard and
  epic-table entries.
