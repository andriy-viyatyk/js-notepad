# US-1262: P2 — convert `PageModel.deferEditorCleanup`, keeping the async cleanup drain

**Epic:** [EPIC-080: State, lifetime & scheduling core](../../epics/EPIC-080.md)  
**Status:** Planned / unblocked 2026-09-01  
**Scope:** Investigation and implementation plan only. This document does not authorize implementation.

## Goal

Replace only the dispatch-ordering timer inside `PageModel.deferEditorCleanup` with the landed
`afterDispatch` primitive, while preserving the asynchronous editor-disposal tracking and drain that
`PageModel.dispose()` needs. The conversion should change dispatch timing without deleting the
independent guarantee that page teardown waits for an editor that is still closing.

## Background

### Scope correction: four mechanisms, two concerns

The epic’s original De-React inventory described `deferEditorCleanup` as retired wholesale. The
current source was re-read at the epic’s referenced locations. `src/renderer/api/pages/PageModel.ts`
still contains four cooperating mechanisms:

| Current mechanism | Current source | Planned fate |
|---|---:|---|
| Zero-delay `setTimeout` that starts deferred cleanup | `:374-378` | Replace with `afterDispatch` |
| `cleanupGeneration` | `:114`, `:373`, `:390` | Delete only after the source audit below confirms it only invalidates timer work |
| `pendingCleanupTimers` | `:115`, `:374-379`, `:391-395` | Delete with the timer; it has no remaining job after conversion |
| `pendingCleanupPromises` and the `drainDeferredEditorCleanup()` await loop | `:116`, `:382-400`, awaited by `dispose()` at `:763` | **Must survive unchanged in purpose** |

The promise set and drain are not dispatch-ordering machinery. `startEditorCleanup()` creates a
tracked promise (`:382-386`) whose cleanup body calls asynchronous `editor.dispose()`. The drain
(`:389-400`) starts queued cleanups and repeatedly awaits snapshots of the live promise set. This is
what prevents `PageModel.dispose()` (`:761-780`) from completing while a detached editor is still
closing. `afterDispatch` cannot provide that guarantee and must not replace, delete, or simplify the
set or the await loop.

### Landed primitives and dispatch boundary

The landed `src/renderer/core/state/dispatch.ts:1-54` keeps a module-global dispatch depth, a FIFO
queue, and a `draining` guard. `afterDispatch(callback)` queues while a state dispatch or its
epilogue is active (`:37-40`) and calls the callback synchronously when neither is active (`:41-42`).
The drain continues to accept callbacks registered by callbacks already being drained (`:11-35`).

Only `TOneState.stateChanged` enters that scope: `src/renderer/core/state/state.ts:72-85` wraps its
`ListenerList.dispatchSync()` call in `runInDispatch()`. `set()`, `update()`, and `clear()` retain
their existing state semantics; the dispatch scope is additive. The shared listener implementation
at `src/renderer/core/state/listener-list.ts:37-63` snapshots registrations, skips retired
registrations, and isolates listener errors. These files are consumed as landed and are not planned
for changes in US-1262.

### Current source and line-number drift

The epic’s `PageModel` references have not drifted: the four mechanisms remain at `:114-116` and
`:367-400`, and page teardown remains at `:761-780`. The surrounding page-management locations did
change in US-1261 and were re-verified:

| Concern | Current source | Finding |
|---|---:|---|
| Close callback | `src/renderer/api/pages/PagesModel.ts:98-102` | Detaches/removes first, then starts `page.dispose()` and calls `checkEmptyPage()` from `finally` |
| `removePage()` | `src/renderer/api/pages/PagesModel.ts:127-163` | No longer calls `checkEmptyPage()`; its state/bookkeeping and show/focus work remain |
| `checkEmptyPage()` | `src/renderer/api/pages/PagesModel.ts:165-171` | Uses `afterDispatch` and re-reads current `pages.length` |
| Page transfer | `src/renderer/api/pages/PagesLifecycleModel.ts:626-656` | `movePageOut()` calls `checkEmptyPage()` at `:654`, after its keep-alive disposal loop at `:651-653` |

That US-1261 reshaping is already the caller-level correction for the synchronous `afterDispatch`
path in the empty-page conversion. US-1262 must not undo it or fold page teardown into this task.
The epic records that the user verified the cold-start, restored-page, page-switching, editor
open/close, compare-transition, and close-the-last-tab flows on 2026-09-01; that verification is the
explicit unblock for this task.

### Current cleanup behavior

Before conversion, a live page takes the following path (`src/renderer/api/pages/PageModel.ts:367-380`): it captures the
current generation, schedules a zero-delay timer, stores the timer and cleanup in
`pendingCleanupTimers`, and starts the cleanup only if the page is still live and the generation is
unchanged. A disposed page bypasses the timer and calls `startEditorCleanup()` immediately
(`:368-370`).

`startEditorCleanup()` itself does not dispose synchronously: it adds the promise to
`pendingCleanupPromises` before the `Promise.resolve().then(cleanup)` body runs (`:382-386`). This
ordering is important to the teardown analysis below. The converted live-page path must preserve
this ordering: its `afterDispatch` callback must call `startEditorCleanup()` before any later page
disposal can snapshot the set.

On page disposal, `PageModel.dispose()` sets `pageDisposed`, invokes the drain, and only then drains
subscriptions and disposes the remaining editors (`:761-772`). The current drain increments the
generation, takes every pending timer out of the map, cancels each timer, starts each corresponding
cleanup, and then keeps awaiting the live promise set until it is empty (`:389-400`).

### Verified caller census

The current repository-wide search found these production call counts (definitions excluded):

| Method | Callers | Current call sites |
|---|---:|---|
| `deferEditorCleanup` | 2 | `PageModel.onEditorPanelsChanged()` at `:422`; `PageModel.setMainEditor()` at `:486` |
| `startEditorCleanup` | 3 | `deferEditorCleanup()`’s disposed-page branch at `:369`; its timer callback at `:377`; `drainDeferredEditorCleanup()` at `:395` |
| `drainDeferredEditorCleanup` | 1 | `PageModel.dispose()` at `:763` |

No other renderer source references these private helpers or the cleanup fields.

### Caller timing audit

#### `onEditorPanelsChanged()` — queued dispatch path

`src/renderer/api/pages/PageModel.ts:attach()` registers the only invocation path at `src/renderer/api/pages/PageModel.ts:277-280`: an editor-state
selector subscription invokes `onEditorPanelsChanged(editor)`. Since `TOneState.stateChanged()` is
the only dispatch boundary and wraps the listener traversal, this callback is inside a dispatch.

The method first updates page state (`:413-416`), enforces sidebar invariants (`:417`), detaches a
non-main editor with no panels (`:418-420`), and then registers the cleanup (`:422-424`). The detach
can issue more page-state updates. The method has no statements after the registration, but its
enclosing editor-state listener traversal does continue; therefore “last statement in the method” is
not sufficient justification. `afterDispatch` queues the cleanup after those nested updates and the
outer editor dispatch settle. Its FIFO position also follows any page-view epilogues queued by the
detach-driven state updates, preserving the intended detach-before-dispose order.

A repository search found no page-close call inside a state subscription. The page-close entry
points are user/action flows (`PageModel.close()` callers in the tab view, keyboard service, page
lifecycle methods, and board-update flow), not this listener. Thus the queued callback runs before a
separate close action can enter `PageModel.dispose()`, and its cleanup promise is already in
`pendingCleanupPromises` when the drain can run.

#### `setMainEditor()` — immediate `afterDispatch` path

The second invocation is at `src/renderer/api/pages/PageModel.ts:486`, after the method has:

1. run `beforeNavigateAway()` when applicable (`:441-444`);
2. attached the replacement and updated `mainEditorId` (`:445-449`);
3. detached the old main when it does not survive navigation (`:456-464`);
4. notified all surviving editors (`:466`); and
5. awaited the pages-module import for non-null replacements (`:470-480`).

The state updates above have already left their dispatch scopes when the registration is reached.
The import continuation is also outside a state dispatch. For `newEditor === null`, there is no
import await, but the preceding synchronous state dispatches have still settled. Consequently
`afterDispatch` executes its registration callback immediately here. That callback calls
`startEditorCleanup()`, which tracks the promise synchronously and starts the actual cleanup body in
a microtask. The promise is therefore visible to a later `PageModel.dispose()` drain before
`setMainEditor()` resolves.

All direct post-call continuations were inspected:

| Caller | Source after `await setMainEditor(...)` | Disposition |
|---|---:|---|
| Navigation reuse | `src/renderer/api/pages/PageNavigator.ts:93-97`, `:125-129` | Uses the retained incoming editor, then page show/focus/persistence; does not use the detached outgoing editor |
| Fresh navigation | `src/renderer/api/pages/PageNavigator.ts:242-268` | Applies diff/fragment/reveal work to the incoming adapter, then page show/focus/persistence; no outgoing-editor use |
| Editor switch | `src/renderer/editors/base/editor-switch.ts:50`, `:108`, `:141` | Returns immediately after the await; no following operation in the switch helper |
| Board Info replacement | `src/renderer/editors/board-info/open-board-info.ts:42` | Returns immediately after the await |
| Board uninstall/unregister | `src/renderer/editors/board-info/BoardInfoEditorModel.ts:372`, `:396` | Returns immediately after clearing the main editor |
| Compatibility promotion | `src/renderer/api/pages/PageModel.ts:526`, `:528` | `promoteSecondaryToMain()` returns after its await |

The earlier cleanup start can therefore precede the callers’ continuation without touching an object
those continuations still need: all inspected continuation work targets the incoming editor or page
collection. No caller reshape is currently required for this synchronous path. This conclusion is
based on the full call-site audit, not on the cleanup call being syntactically last in
`setMainEditor()`.

### Generation audit

`cleanupGeneration` has exactly three uses in current `src/renderer/api/pages/PageModel.ts`: initialized at `:114`, copied
by a scheduled timer callback at `:373`, compared only in that callback at `:376`, and incremented by
the disposal drain at `:390`. `pendingCleanupTimers` is written only by that timer path and read only
by the drain. There is no second live-cleanup-pass identity or other consumer. Unlike
`AsyncEditorView.generation` (`src/renderer/ui/app/AsyncEditorView.ts:31,43,51,76,85,92`), which
distinguishes concurrent asynchronous module loads, this generation exists solely to invalidate a
timer that the drain has cancelled. It is safe to delete with the timer map; no generation counter
in `AsyncEditorView` or elsewhere is part of this task.

## Implementation Plan

1. **Change only `src/renderer/api/pages/PageModel.ts`.** Add a direct import of
   `afterDispatch` from `../../core/state/dispatch`. Do not alter the landed dispatch primitive,
   listener core, page-management reshaping, IPC events, helper contracts, or editor views.

2. **Replace the timer half of `deferEditorCleanup()`.** Preserve the `pageDisposed` fast path that
   calls `startEditorCleanup(cleanup)` immediately. For a live page, register an `afterDispatch`
   callback that calls `startEditorCleanup(cleanup)`. Add a state-ordering comment at this
   registration recording the invariant and its consequence: a queued cleanup lives in
   `dispatch.ts`’s module-global FIFO, not in a `PageModel` field; this is safe because no current
   page-close path runs inside a state dispatch, so the FIFO drains before `PageModel.dispose()` can
   snapshot `pendingCleanupPromises`; if that call-graph fact changes, a queued cleanup can escape
   the teardown drain. Do not add a new timer, generation, or cancellation side channel. The actual
   asynchronous disposal remains owned by `startEditorCleanup()`.

   The callback must **not** gain a `pageDisposed` early return. The old timer callback could return
   after `pageDisposed` became true because `drainDeferredEditorCleanup()` first flushed and started
   every entry in `pendingCleanupTimers`. After conversion there is no timer map for the drain to
   flush; an early return would drop the cleanup and leak the editor. The callback must always call
   `startEditorCleanup(cleanup)`.

   Before:

   ```ts
   const generation = this.cleanupGeneration;
   const timer = setTimeout(() => {
       this.pendingCleanupTimers.delete(timer);
       if (this.pageDisposed || generation !== this.cleanupGeneration) return;
       this.startEditorCleanup(cleanup);
   }, 0);
   this.pendingCleanupTimers.set(timer, cleanup);
   ```

   After:

   ```ts
   // A queued cleanup is held in dispatch.ts, not this PageModel. No current page-close path runs
   // inside a state dispatch; if that invariant changes, the cleanup can escape this page's drain.
   afterDispatch(() => {
       this.startEditorCleanup(cleanup);
   });
   ```

3. **Remove only timer bookkeeping.** Delete `cleanupGeneration` and `pendingCleanupTimers`, and
   remove the generation increment plus timer snapshot/cancellation loop from
   `drainDeferredEditorCleanup()`. Add a matching one-line comment at the method explaining that the
   drain no longer flushes cleanups queued in `src/renderer/core/state/dispatch.ts`; it only awaits
   cleanups already admitted to `pendingCleanupPromises`. Keep that set,
   `startEditorCleanup()`’s promise registration and forgetting handlers, and the complete
   `while (this.pendingCleanupPromises.size)` / `Promise.all([...this.pendingCleanupPromises])` loop.

   The matching source comment should be equivalent to:

   ```ts
   // This drain cannot flush callbacks still queued in dispatch.ts; it awaits only admitted cleanup promises.
   ```

   The resulting drain must await every asynchronous editor disposal started by either the direct
   disposed-page path or the after-dispatch callback.

4. **Re-check both callers after the edit.** Confirm that the panel-visibility caller remains
   dispatch-queued and that the main-editor replacement caller remains safe with immediate
   registration. Preserve the existing detach-before-dispose order, incoming-editor post-call work,
   cache deletion after disposal, and `idTransferred` behavior.

5. **Verify the teardown race explicitly.** Exercise a cleanup requested from
   `onEditorPanelsChanged()` and a cleanup requested from `setMainEditor()`, then close the page.
   Confirm the cleanup promise is present before `PageModel.dispose()`’s drain snapshot and that page
   teardown does not complete before `editor.dispose()` and the associated cache deletion finish.
   If an actual path admits an after-dispatch callback after the drain has snapshotted, stop and
   redesign the local admission/tracking boundary; do not delete or weaken the promise set or await
   loop.

6. **Run the epic’s proportionate checks.** With no unit-test harness, run `npm run typecheck`,
   `npm run lint`, and `npm run build-prod`, then perform a cold `npm start` from a stopped dev
   server. Exercise page switching, editor open/close, last-tab replacement, close-the-last-tab
   teardown with an asynchronously disposing editor, content delivery, and rapid compare-mode
   transitions. Confirm that no unrelated files or dashboard entries changed.

## Concerns

### Resolved concerns

- **Synchronous execution:** The panel callback is not immediate because its only call path is inside
  a state dispatch. The main-editor callback is immediate, but the source-audited continuations only
  operate on the incoming editor/page state. No caller reshape is required.
- **Drain visibility:** The current call graph establishes that no cleanup promise is added after the
  drain snapshots. The panel callback is drained before the synchronous state dispatch returns, while
  the main-editor path either registers immediately or, after its awaited import, sees
  `pageDisposed` and takes the direct path. The only `PageModel.dispose()` caller is the close
  callback, and the source audit found no page-close call inside a state subscription. Therefore no
  local admission barrier is needed; adding one would introduce a new promise/lifetime mechanism
  outside the timer conversion.
- **Generation meaning:** `cleanupGeneration` is a timer invalidator only. It is not the kind of
  concurrent async-operation generation retained by `AsyncEditorView`.

### Recommendation

Proceed with the narrow conversion. The dispatch-ordering replacement is justified by the audited
call graph, the synchronous path has no unsafe post-call use of the outgoing editor, and the existing
promise drain remains the lifetime guarantee. Keep the task subject to EPIC-080’s abort criterion if
the first real-use attempt exposes an ordering surprise that the source audit did not predict.

### Hard boundaries

- Never delete `pendingCleanupPromises` or any part of `drainDeferredEditorCleanup()`’s await loop.
- Do not retire `live`/`inert` flags beyond US-1264, and do not remove any generation counter except
  the proven timer-only `PageModel.cleanupGeneration`.
- Do not touch `src/ipc/renderer/renderer-events.ts`, `SubtreeSwap`/`KeyedList` contracts,
  `PageContentView`’s deferred helper adoption, or unrelated timer/microtask sites.
- Do not add tests or a test harness; this repository’s verification is typecheck, lint, build, and
  manual cold-start use.
- If the first conversion attempt exposes an unresolved real-use ordering surprise, invoke
  EPIC-080’s abort criterion and leave this conversion unapplied rather than broadening the task.

## Acceptance Criteria

- [ ] `PageModel.deferEditorCleanup()` uses `afterDispatch` for the live-page dispatch boundary and
  retains the direct `pageDisposed` path.
- [ ] `cleanupGeneration` and `pendingCleanupTimers` are removed only as timer bookkeeping; no other
  generation, `live`, or `inert` mechanism is retired.
- [ ] `pendingCleanupPromises` remains, and `startEditorCleanup()` still tracks asynchronous cleanup
  before its body runs.
- [ ] `drainDeferredEditorCleanup()` still waits in full until the tracked promise set is empty;
  `PageModel.dispose()` still awaits that drain before disposing the remaining editors.
- [ ] The two `deferEditorCleanup` callers have been checked against the synchronous
  `afterDispatch` contract, including all source-audited post-call continuations; no unsafe reorder
  is introduced and no caller reshape is needed unless verification proves otherwise.
- [ ] Page teardown cannot finish while an editor cleanup admitted by either caller is still pending;
  the verified call graph contains no path that adds a promise after the drain snapshot.
- [ ] `src/renderer/api/pages/PagesModel.ts` and `src/renderer/api/pages/PagesLifecycleModel.ts`
  retain US-1261’s caller reshaping and are not changed by this task.
- [ ] No changes are made to IPC renderer events, `SubtreeSwap`/`KeyedList` contracts,
  `PageContentView` helper adoption, test harnesses, or dashboard entries.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and the specified cold-start manual
  flows are recorded after implementation; unresolved real-use ordering surprises trigger the
  epic’s abort criterion.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/api/pages/PageModel.ts` | Replace the live-page zero-delay timer with `afterDispatch`; delete only timer-generation/map bookkeeping; preserve tracked asynchronous cleanup and the full teardown drain. |

Files that need **no changes** in US-1262:

- `src/renderer/core/state/dispatch.ts` — US-1261’s dispatch-depth, FIFO, immediate-execution, and
  drain behavior is complete and is consumed as-is.
- `src/renderer/core/state/listener-list.ts` — US-1259’s snapshot and active-registration behavior
  is complete and must remain unchanged.
- `src/renderer/core/state/state.ts` — only `TOneState.stateChanged` participates in dispatch depth;
  no new wrapping belongs here.
- `src/renderer/api/pages/PagesModel.ts` — US-1261’s close-callback teardown ordering,
  `removePage()` split, and `checkEmptyPage()` conversion are complete and must remain unchanged.
- `src/renderer/api/pages/PagesLifecycleModel.ts` — the post-keep-alive `movePageOut()` check is
  complete and must remain unchanged.
- `src/renderer/api/pages/PagesPersistenceModel.ts` — its bootstrap `checkEmptyPage()` caller is
  already correct and needs no cleanup conversion.
- `src/renderer/api/pages/PageNavigator.ts`, `src/renderer/editors/base/editor-switch.ts`,
  `src/renderer/editors/board-info/open-board-info.ts`, and
  `src/renderer/editors/board-info/BoardInfoEditorModel.ts` — their audited post-
  `setMainEditor()` continuations need no reshaping or edits.
- `src/renderer/ui/app/AsyncEditorView.ts` — its generation protects asynchronous module loads and
  is unrelated to PageModel’s timer-only generation.
- `src/renderer/ui/app/PageContentView.ts` — compare retirement is already converted; deferred
  helper adoption is explicitly outside this task.
- `src/ipc/renderer/renderer-events.ts` — the separate IPC listener list is explicitly deferred by
  EPIC-080.
- `src/renderer/uikit/shared/subtree-swap.ts` and `src/renderer/uikit/shared/keyed-list.ts` — their
  contracts are out of scope.
- `doc/active-work.md` and `doc/epics/EPIC-080.md` — the user explicitly forbids dashboard and epic
  entry changes.
