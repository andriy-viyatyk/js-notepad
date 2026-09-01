# US-1263: P3 — owner-bound scheduling

Epic: [EPIC-080 — State, lifetime & scheduling core](../../epics/EPIC-080.md)

## Goal

Give every `VanillaView` and `TModel` a protected owner-bound `schedule` surface for coalesced
animation frames, one-shot timeouts, and owner-disposed `Delayer` instances. Convert the eight
simple production rAF sites and the directly analogous model timeout, preserve all existing
`live`/`generation`/`inert` guards, and make the two `debounce(..., canRun)` users cancellable
without changing normal debounce timing or retry semantics.

## Background

### Verified project and landed-task context

The required project context was read before this plan: `doc/agents-common.md`,
`.claude/rules/task-docs.md`, and the complete [EPIC-080](../../epics/EPIC-080.md). The working
tree contains the landed US-1259, US-1260, and US-1261 changes. Existing unrelated changes were
left untouched; this document does not update `doc/active-work.md`, per the request.

US-1260 leaves the relevant ownership seam in place:

- `src/renderer/core/utils/DisposableStore.ts` accepts `Cleanup | IDisposable`, returns an
  idempotent release from `add()`, and `child()` reserves the parent's FIFO slot at creation.
- `src/renderer/uikit/shared/vanilla-view.ts` has a private `DisposableStore`, a protected
  `disposables` getter, active-checking `own()`/`listen()`, and `ownReleasable()` for early release.
- `src/renderer/core/state/model.ts` gives `TModel` the same protected `disposables` getter, but its
  `own()` has no explicit `assertActive()` call. Its store still rejects registration after the
  store is closed.

`VanillaView.listen()` at `src/renderer/uikit/shared/vanilla-view.ts:197-212` is the model for this
task: assert active before registration, wrap the callback with a disposal guard, and register the
underlying cancellation through an idempotent early-release handle. Scheduling must use that same
shape rather than introduce a second ownership convention.

### Proposed shared surface and owner semantics

The shared implementation should live in `src/renderer/core/utils/scheduling.ts`, because it is
core code and already owns `Delayer` and `afterPaint`. Add an exported owner-scheduler class (the
implementation name may be chosen during implementation) with this protected consumer surface:

```ts
this.schedule.raf(() => { /* coalesced, latest pending callback wins */ });
this.schedule.timeout(ms, () => { /* one shot */ });
this.schedule.delayer<void>(ms).trigger(() => { /* latest Delayer task */ });
```

`raf()` and `timeout()` should return an idempotent `Cleanup` release handle. The return is needed
to preserve existing explicit cancellation points while the owner store provides disposal
cancellation. A second pending `raf()` on the same owner cancels/replaces the first pending frame;
independent scheduling mechanisms must not be forced into that one coalescing slot. `raf()` should
delegate to the existing `afterPaint()` so it inherits its rAF plus approximately 100 ms background
fallback and its cancellation handle. `timeout()` should use the native one-shot timer. Neither
helper should reimplement `Delayer` or `afterPaint`.

The shared scheduler should take the owner's `DisposableStore` and an optional active assertion:

- `VanillaView.schedule` calls the existing private `assertActive()` before returning/registration,
  preserving the view's current error behavior and matching `listen()`.
- `TModel.schedule` uses the shared scheduler without a second explicit assertion, matching the
  existing model `own()` shape. Registration after `TModel` disposal still reaches the closed
  `DisposableStore` and throws its existing closed-store error.
- Every wrapper has its own active/released state in addition to owner-store registration. If a
  browser event/timer callback was already captured before disposal, its wrapper must return
  without invoking the user callback after the release handle has run.
- A created `Delayer` is immediately added to the owner store as an `IDisposable`. Its existing
  `cancel()` and `dispose()` behavior remains unchanged; owner disposal calls `dispose()` and
  rejects any pending cycle as it does today.

Before:

```ts
// VanillaView and TModel each expose only their store today.
protected get disposables(): DisposableStore {
    return this.disposers;
}
```

After:

```ts
protected get schedule(): OwnerScheduler {
    return this.scheduler;
}
```

The getter stays protected. This is an internal lifecycle facility, not a public Object Model or
script API. The scheduler must not import `VanillaView` or `TModel`; both bases depend downward on
the shared core implementation.

### Why `schedule` belongs on both bases

The decision for EPIC-080 open question 2 is **both `VanillaView` and `TModel`**, with one shared
implementation. The bases already own synchronous cleanup stores and are the lifetime boundaries
that can cancel scheduled callbacks. Limiting the surface to views would make a model keep timers
alive after its component driver or editor has gone away, and would leave model-owned deferred work
with no equivalent guard.

The cited examples were verified rather than assumed:

- `src/renderer/uikit/Select/SelectModel.ts` is a `TComponentModel`, but it has no raw timer or
  rAF. Its asynchronous item loader is Promise-based and uses `_loadId` plus `isLive` guards; its
  one surviving `queueMicrotask` clears `_suppressFocusOpen`. This task does not replace either
  mechanism and does not use `afterDispatch`.
- `src/renderer/uikit/PathInput/PathInputModel.ts:95,181-199` is a `TComponentModel` with a
  150 ms `blurTimer`, explicit rescheduling cancellation, and cleanup in `dispose`. It is the
  low-risk `schedule.timeout` proof conversion in this task.
- `src/renderer/editors/board/BoardTargetModel.ts:165-173` is a plain `IBrowserTarget` wrapper,
  not a `TModel`. Its `waitForLoaded()` polling timer belongs to a remote-board readiness wait and
  has no owner-bound model lifecycle. It remains raw and out of scope. The board editor it wraps
  is an owner, but this wrapper cannot access the editor's protected scheduler.

Models are still forbidden from touching the DOM by `src/renderer/uikit/CLAUDE.md`; scheduling
non-DOM work is not prohibited. The shared implementation does not grant models DOM access.

### Existing scheduling utilities and their actual consumers

`src/renderer/core/utils/scheduling.ts` already contains:

- `Delayer<T>` with `trigger()`, `cancel()`, and permanent `dispose()`; and
- `afterPaint(run)`, which returns a cancellation function and combines rAF with a roughly 100 ms
  timeout fallback.

The current census differs from the epic's wording in one detail. `Delayer` has one production
consumer file, `src/renderer/editors/graph/GraphLegendPanelView.ts`: `GraphLegendModel` stores
per-key `Delayer<void>` objects at `:46` and constructs them at `:73`. Convert those constructions
to `this.schedule.delayer<void>(300)` so the existing per-key map is owner-disposed. The trigger
and intentional rejection catch at `:76-78` remain.

There are **zero external direct `afterPaint()` calls**. The only two `afterPaint(` expressions are
the function definition and the internal call from `focusAfterPaint()` in `scheduling.ts`.
`focusAfterPaint()` has eight call expressions across eight renderer files:
`components/file-list/FileListView.ts`, `editors/browser/BrowserView.ts`,
`ui/dialogs/LibrarySetupDialogView.ts`, `ui/dialogs/InputDialogView.ts`,
`ui/dialogs/CreateBoardVarsStorageDialogView.ts`, `ui/dialogs/CreateBoardDialogView.ts`,
`ui/dialogs/PasswordDialogView.ts`, and `uikit/Textarea/TextareaView.ts`. Existing callers are
already owner-aware through `own()` or their own release field; they are not rewritten in this task.

### Re-measured raw rAF census

The search was run over `src/renderer`, excluding `src/renderer/core/utils/scheduling.ts` and
documentation. It found **21 textual `requestAnimationFrame` references**: **18 executable
requests** and three comments. The 18 executable requests are classified individually below.

#### Convertible — 8 executable requests

Each conversion keeps the callback body, its timing point, the current explicit cancellation point,
and every existing guard. The old numeric handle field becomes a `Cleanup` release field where an
explicit release method already exists. No `live`, `generation`, or `inert` field is removed.

| File and method/site | Requests | Owner and conversion |
|---|---:|---|
| `src/renderer/uikit/TruncatedText/TruncatedTextView.ts:103-117`, `scheduleMeasure()` | 1 | `VanillaView`; replace the numeric `measureFrame` and `window.cancelAnimationFrame` with the release returned by `this.schedule.raf()`. Keep `cancelMeasure()` and its owner cleanup. |
| `src/renderer/editors/video/VideoEditor.ts:302-331`, `navigateToTrack()` | 1 | `EditorModel` → `TModel`; use a release handle for `navigationFrame`. Keep `navigationGeneration` and release the pending callback at the existing start of `dispose()` before the streaming-session await. |
| `src/renderer/editors/archive/ArchiveSecondaryView.ts:151-164`, `scheduleReveal()` | 1 | `VanillaView`; preserve `cancelReveal()` and the existing callback body. |
| `src/renderer/editors/explorer/ExplorerSecondaryView.ts:392-405`, `scheduleReveal()` | 1 | `VanillaView`; preserve `cancelReveal()` and the existing callback body. |
| `src/renderer/editors/markdown/MarkdownBodyView.ts:135-140,519-540`, anchor retry | 1 | `VanillaView`; store/release the scheduler cleanup in `anchorRetry`'s replacement field. Keep `active`, `lifecycleGeneration`, queue checks, and the ten-attempt bound. |
| `src/renderer/components/file-search/FileSearchView.ts:165-174` | 1 | `VanillaView`; replace `focusFrame` with an owner release, retain the `live` guard and the existing cleanup point. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts:190-201` | 1 | `VanillaView`; replace `bodyMeasureFrame` with an owner release, retain `live`, connection, and zero-height retry guards. |
| `src/renderer/editors/rest-client/RestClientShared.ts:270-283` (`RestDetailView`) | 1 | `VanillaView`; replace `measureFrame` with an owner release, retain `live`, connection, and zero-height retry guards. |

The coalescing contract is safe for these sites because each owner has one independent one-shot
request stream. Their existing `cancel*()` methods remain the explicit cancellation points even
though a later `schedule.raf()` also replaces a pending request.

#### Not convertible in this task — 4 executable requests

`src/renderer/editors/video/AudioVisualizer.ts:346-356,365-388` contains two independent raw-rAF
mechanisms and four requests:

- `:348,356` form a continuously self-rescheduling animation loop. It needs its current frame
  handle, `stopAnimation()`, and `animationGeneration` to stop/restart the loop.
- `:380,382` form a separate bounded, up-to-three-frame sizing retry loop. It can be pending at the
  same time as the animation loop and has its own `sizingRafId` and `sizingGeneration`.

One owner-wide coalesced `schedule.raf()` slot cannot represent both loops: a measurement request
could replace the animation's next frame, or an animation request could replace the measurement
retry. Keep all four raw requests and both generations/handles. This is a genuine raw-handle case,
not permission to retire the `inert` guard; a future scheduler with independent keyed lanes would
need its own task and review.

#### Out of scope — 6 executable requests

The following requests execute in a target page through CDP, not in a renderer `VanillaView` or
`TModel`, so binding them to the facade/automation command object's lifetime would be incorrect:

| File and sites | Requests | Reason |
|---|---:|---|
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:230-242` | 2 | The rAF calls are inside a JavaScript string evaluated in the browser page. The remote page owns the callback. |
| `src/renderer/automation/commands.ts:448-460,464-475,479-490` | 4 | The selector/text/text-gone polling callbacks are likewise injected into the remote CDP target. |

The three non-executable references in the 21 total are comments at
`BrowserEditorFacade.ts:225`, `VideoEditor.ts:318`, and `AudioVisualizer.ts:214`.

`src/renderer/core/utils/scheduling.ts` is not part of this census; its existing rAF/fallback
implementation is the sanctioned primitive that the owner scheduler wraps.

### Raw timeout and interval census

The corresponding repository search found **86 textual `setTimeout(`/`setInterval(` matches in
`src/renderer` outside `scheduling.ts`: 81 executable/injected calls and five documentation
references. The five documentation matches are the explanatory `setTimeout(0)` mentions in
`uikit/CLAUDE.md`, `uikit/Tree/TreeView.ts`, `uikit/Tree/TreeModel.ts` (two), and
`uikit/ListBox/ListBoxView.ts`.

This is not a blanket timeout rewrite. The 81 executable matches include remote CDP polling and
fixed waits (`automation/commands.ts`, `scripting/api-wrapper/BrowserEditorFacade.ts`), Promise
delays (`ScriptContext.ts`, `editors/draw/index.ts`, `editors/rest-client/ResponseViewerView.ts`,
and `RequestBuilderView.ts`), error rethrow deferrals (`core/state/state.ts`, `events.ts`, and
`dispatch.ts`), infrastructure/service lifetimes (`api/app.ts`, `api/tools/tool-executor.ts`,
`core/utils/utils.ts`, `core/utils/performance-janitor.ts`), story/demo timers, and the explicitly
excluded `api/pages/PageModel.ts:374` cleanup timer. Those are not interchangeable with an
owner-bound one-shot timer.

There are also many real owner candidates with manually held timers, including
`uikit/PathInput/PathInputModel.ts`, `uikit/Tree/TreeDndModel.ts`,
`uikit/ImageViewport/ImageViewportView.ts`, `uikit/Menu/MenuModel.ts`,
`uikit/Notification/AlertItemView.ts`, `editors/text/TextEditorModel.ts`,
`editors/board/BoardEditorModel.ts`, `editors/board/BoardWebview.ts`,
`editors/browser/BrowserView.ts`, `editors/browser/BrowserTabsPanel.ts`,
`editors/browser/BookmarksDrawer.ts`, `editors/base/TextChromeView.ts`,
`editors/draw/DrawBodyView.ts`, `editors/git-tree/GitChangesView.ts`,
`editors/graph/GraphEditor.ts`, `editors/graph/GraphTooltipView.ts`,
`editors/link-editor/panels/LinkHostnamesNavigationPanel.ts`,
`editors/link-editor/panels/LinkTagsSecondaryView.ts`, `editors/log-view/LogBodyView.ts`,
`editors/log-view/items/GridOutputView.ts`, `editors/markdown/CodeBlock.ts`,
`editors/markdown/MarkdownImage.ts`, `editors/mermaid/MermaidEditor.ts`,
`editors/mneme-config/MnemeConfigEditorModel.ts`,
`editors/settings/sections/BrowserProfilesSectionModel.ts`,
`editors/settings/sections/McpSectionModel.ts`, `ui/sidebar/OpenTabsListView.ts`, and
`ui/sidebar/MenuBarView.ts`. Their delays cover focus grace periods, animation/state transitions,
polling, retries, staged persistence, and third-party/editor boundaries. Apart from the direct
`PathInputModel` proof conversion above, migrate them in a separately reviewable timeout sweep.

The module-level `uikit/Progress/progressModel.ts`, plain helper/service classes such as
`editors/browser/BrowserTabsModel.ts`, `editors/browser/BrowserTorModel.ts`, and
`editors/mcp-inspector/McpConnectionManager.ts`, and the remote `BoardTargetModel` polling do not
inherit an owner and remain deferred. `src/renderer/uikit/Tooltip/attach-tooltip.ts` retains its
generic `TooltipAttachment` lifecycle rather than reaching into a caller's protected scheduler.

### `debounce` hazard and consumer re-measurement

`src/shared/utils.ts:34-54` currently returns only a callable. Every invocation installs a delayed
`run`; if `canRun()` is false, `run` installs another timer forever. The current source census is
**19 call sites**, not counting the declaration or the renderer re-export at
`src/renderer/core/utils/debounce.ts`. There are **two** current `canRun` users:

1. `src/renderer/api/pages/PagesPersistenceModel.ts:71` retries while `restored` is false.
2. `src/renderer/editors/text/TextFileIOModel.ts:364-368` retries while an asynchronous cache save
   is in progress.

The other 17 call sites are ordinary debounce users in `OpenWindow`, `FileSearchModel`,
`FileTreeProvider`, `FileWatcher` (two), `menu-folders`, `settings`, `library-service`,
`EnvVarsEditor`, `McpConnectionStore`, `LinkEditor`, `BrowserBookmarks`, `ScriptPanel`,
`LogViewEditor`, `RestClientEditor` (two), and `NotebookEditor`.

The chosen fix is a **callable cancel handle plus owner binding**, not a bounded retry count. A
bounded count can drop the Pages save if restore takes longer than the bound, or drop a cache save
if the in-flight write lasts longer than the bound. Dropping on the first false result has the same
loss problem. Retaining retry-until-allowed preserves the intentional behavior documented at the
Pages call site; exposing cancellation closes the lifetime gap.

Before:

```ts
export function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    delay: number,
    canRun?: () => boolean,
): (...args: Parameters<T>) => void {
    // no cancellation is exposed
}
```

After:

```ts
export type Debounced<T extends (...args: unknown[]) => void> =
    ((...args: Parameters<T>) => void) & { cancel(): void };

export function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    delay: number,
    canRun?: () => boolean,
): Debounced<T> {
    // normal calls still debounce at `delay`; canRun=false still retries;
    // cancel() clears the pending retry and is idempotent.
}
```

The implementation must clear `timeoutId` when a timer starts, use `timeoutId !== null` rather
than truthiness, and make `cancel()` clear and null the current timer. Existing callers remain
callable; the intersection only adds a method. All 19 consumers must be typechecked after the
return-type change.

Bind the two retrying instances to their actual owners:

- In `src/renderer/editors/text/TextFileIOModel.ts`, register
  `this.saveModifications.cancel` in the existing private `DisposableStore` so `dispose()` stops a
  retry before pipes are disposed. Preserve `isSavingModifications` and the async save behavior.
- In `src/renderer/api/pages/PagesModel.ts`, after constructing `this.persistence`, register
  `this.persistence.saveStateDebounced.cancel` with the PagesModel's existing owner store. Do not
  add a separate PagesPersistence lifecycle or alter the `restored = true` `finally`; that flag is
  still the normal successful release of the gate.

The main-process consumer, `src/main/open-window.ts:278`, uses ordinary debounce without
`canRun`. It must continue to compile and behave the same. No main-process code uses the optional
gate, but the shared signature change must be checked across the main and renderer consumers.

## Implementation Plan

### 1. Add the shared scheduler

1. Update `src/renderer/core/utils/scheduling.ts`.

   - Import `DisposableStore` and add the owner-scheduler implementation beside `Delayer` and
     `afterPaint`.
   - Implement `raf(run)` with `afterPaint(run)`, owner-store registration, an idempotent release,
     a disposal guard, and one pending coalesced slot. Its method JSDoc must state that the slot is
     owner-wide, a second pending request replaces the first, and independent concurrent loops must
     keep raw handles; name `src/renderer/editors/video/AudioVisualizer.ts:346-388` as the concrete
     case, because its animation and sizing loops must not clobber each other. Releasing a completed
     callback must remove only its own store entry; releasing an old handle after a later rAF request
     must not cancel the later request.
   - Implement `timeout(delay, run)` with a disposal-guarded `setTimeout`, an idempotent release,
     and owner-store registration. Run callbacks must release their store entry before invoking the
     user callback so completed timers do not accumulate.
   - Implement `delayer<T>(delay): Delayer<T>` by constructing the existing `Delayer<T>` and adding
     it as an `IDisposable` to the owner store. Do not alter `Delayer`'s promise, cancel, or error
     semantics.
   - Keep `afterPaint`, `focusAfterPaint`, and the existing `Delayer` implementation behaviorally
     unchanged except for their reuse by the new owner wrapper.

### 2. Expose the scheduler on both owner bases

2. Update `src/renderer/uikit/shared/vanilla-view.ts`.

   - Instantiate the shared scheduler from the existing `disposers` store.
   - Add a protected `schedule` getter that calls the existing private `assertActive()` and returns
     the scheduler. Keep `disposables`, `own()`, `ownReleasable()`, and `listen()` unchanged.
   - Preserve child-first disposal and the existing store FIFO position. Scheduler registrations
     must use the same store; do not add a new disposal phase.

3. Update `src/renderer/core/state/model.ts`.

   - Instantiate the same scheduler from the model's existing `DisposableStore`.
   - Add the protected `schedule` getter without introducing a new model-only assertion. The closed
     store remains the post-disposal registration guard, matching the current `own()` distinction.
   - Keep `TComponentModel.onUnmountInternal()` and its `dispose()` idempotency unchanged.

### 3. Convert the owner-bound rAF sites

4. Update these eight files, one callback at a time, preserving existing guards and cancellation:

   - `src/renderer/uikit/TruncatedText/TruncatedTextView.ts` — `measureFrame` → release handle;
     `scheduleMeasure()` still calls `cancelMeasure()` before replacement.
   - `src/renderer/editors/video/VideoEditor.ts` — `navigationFrame` → release handle; keep
     `navigationGeneration` and call its release at the current beginning of async `dispose()`.
   - `src/renderer/editors/archive/ArchiveSecondaryView.ts` and
     `src/renderer/editors/explorer/ExplorerSecondaryView.ts` — preserve each `cancelReveal()`.
   - `src/renderer/editors/markdown/MarkdownBodyView.ts` — preserve `cancelAnchorRetry()`,
     `active`, `lifecycleGeneration`, queue checks, and the ten-attempt cap.
   - `src/renderer/components/file-search/FileSearchView.ts` — preserve `live` and its existing
     owner cleanup.
   - `src/renderer/editors/rest-client/RequestBuilderView.ts` and
     `src/renderer/editors/rest-client/RestClientShared.ts` — preserve `live`, `root.isConnected`,
     zero-height retry, and layout callbacks.

   In every converted callback, leave the old `live`/generation/inert guard in place. Removing
   those flags is US-1264 and is not part of this task.

### 4. Exercise timeout and Delayer ownership with direct analogues

5. Update `src/renderer/uikit/PathInput/PathInputModel.ts`.

   - Replace `setTimeout`/`clearTimeout` around `blurTimer` with the release returned by
     `this.schedule.timeout(150, ...)`. The scheduling mechanism adds no DOM access; the model's
     existing DOM references and focus check remain unchanged.
   - Keep the explicit cancellation at the start of `onInputBlur()`, the callback's
     `selectionMade`/`escapeCancelled` behavior, DOM focus check, state update, and `dispose()`
     cleanup. No new model DOM access is added.

6. Update `src/renderer/editors/graph/GraphLegendPanelView.ts`.

   - Replace `new Delayer<void>(300)` with `this.schedule.delayer<void>(300)`.
   - Keep the per-`tab:key` map, `trigger()` call, `isLive` guard, and intentional `.catch()`.
   - Do not manually dispose each map entry; owner disposal is the new responsibility being added.

### 5. Make gated debounce cancellable and bind its two retries

7. Update `src/shared/utils.ts`.

   - Add the callable `Debounced<T>` intersection type (or an equivalently named local/exported
     type) and return it from `debounce()`.
   - Preserve latest-call debounce behavior and optional-argument forwarding.
   - Keep the `canRun=false` retry behavior, but expose idempotent `cancel()` that clears the
     current timer, including an indefinitely retrying gate.
   - Do not add an owner or renderer dependency to this shared main/renderer utility.

8. Update `src/renderer/editors/text/TextFileIOModel.ts` and
   `src/renderer/api/pages/PagesModel.ts` as described above. Do not change the other 17 debounce
   call sites beyond compile/type verification, and do not change `src/renderer/core/utils/debounce.ts`
   unless a type-export issue makes its existing re-export fail.

### 6. Explicitly leave excluded mechanisms alone

9. Do not modify `src/renderer/core/state/dispatch.ts` or call `afterDispatch`.
10. Do not modify `src/renderer/api/pages/PageModel.ts`'s `deferEditorCleanup`,
    `pendingCleanupPromises`, or `drainDeferredEditorCleanup`.
11. Do not modify `src/ipc/renderer/renderer-events.ts`.
12. Do not convert the AudioVisualizer loops, CDP-injected polling, service/module timers, story
    timers, Promise delays, or the remaining raw timeout/interval census in this task.
13. Do not add unit tests or a test harness; verify with the repository's typecheck/lint/build
    commands and the manual lifecycle smoke path required by EPIC-080.

## Concerns

### No task split recommended, with an explicit timer boundary

The measured scope is reviewable as one task: one shared scheduler, two base getters, eight simple
rAF conversions, one direct timeout proof, one existing `Delayer` conversion, and a shared debounce
return-type change with two owner bindings. The rAF census is 18 executable requests, of which eight
are convertible; the four AudioVisualizer requests and six remote-CDP requests have clear reasons
to remain untouched.

The timer search is **81 executable matches**, substantially broader and semantically mixed. A
blanket conversion would combine owner migration, polling policy, Promise waiting, process/service
lifetime, story code, and the explicitly excluded PageModel cleanup. Defer that remaining timer
sweep to a separately reviewable task rather than enlarging US-1263. The chosen `PathInputModel`
conversion is included only because it is the exact one-owner timeout/cancellation analogue that
demonstrates the new surface.

### Coalescing and explicit cancellation

The new rAF slot is intentionally owner-wide and coalesced. It must not be used for independent
concurrent loops; AudioVisualizer remains raw for that reason. Converted one-shot sites retain their
old `cancel*()` methods and release fields so disposal ownership does not erase an existing timing
or cancellation point.

`VideoEditor.dispose()` awaits stream-session cleanup before `super.dispose()`. Its explicit
navigation release therefore must remain before that await; relying only on the base owner's final
store would widen the old callback window.

`Delayer.trigger()` rejects when its owner-disposed Delayer is pending. The existing Graph Legend
call already catches cancellation/disposal intentionally; preserve that catch to avoid an unhandled
rejection during teardown.

### Debounce ownership and shared signature

The shared utility has 19 consumers, including one main-process consumer. The callable intersection
preserves all existing calls, but every consumer must be typechecked. Only two users can retry
indefinitely today; both receive an owner cancellation. Keep the `PagesPersistenceModel.restored`
gate and `TextFileIOModel.isSavingModifications` gate rather than silently dropping work or using a
fixed retry budget.

### Existing guards are deliberately retained

The converted callbacks may now have both scheduler release protection and their old
`live`/`generation`/`inert` protection. That duplication is intentional sequencing: US-1264 may
remove a flag only after a guarded replacement has landed and been exercised. No flag retirement is
part of US-1263.

## Acceptance Criteria

- `VanillaView` and `TModel` both expose protected `schedule.raf`, `schedule.timeout`, and
  `schedule.delayer` through one implementation in `src/renderer/core/utils/scheduling.ts`.
- `raf()` is latest-request-wins per owner, `timeout()` is one-shot, and both return idempotent
  early-release handles. Owner disposal cancels pending work and guards callbacks already captured
  by the event loop.
- `delayer()` returns the existing `Delayer` implementation and owner disposal calls its existing
  `dispose()`; `Delayer.cancel()` and promise rejection behavior remain unchanged.
- The eight listed convertible rAF requests use `schedule.raf()` with unchanged callback bodies,
  timing intent, explicit cancellation points, and existing guards.
- All four `AudioVisualizer.ts` rAF requests and all six CDP-injected rAF requests remain
  intentionally unchanged.
- `PathInputModel` uses `schedule.timeout()` without changing its 150 ms blur grace behavior or
  cancellation logic.
- `GraphLegendPanelView` obtains per-key delayers through `schedule.delayer()` and no longer leaves
  those pending delayers outside owner disposal.
- `debounce()` remains callable at all 19 consumers, exposes an idempotent `cancel()`, and retains
  retry-until-allowed semantics. The two gated instances are cancelled by their actual owners;
  `src/main/open-window.ts` remains compatible.
- No `live`, `generation`, or `inert` flag is removed; no `afterDispatch`, PageModel deferred
  cleanup mechanism, IPC renderer event code, unit-test harness, or dashboard entry is changed.
- Run `npm run lint`, the repository typecheck/build validation used for the implementation, and
  the EPIC-080 manual cold-start smoke path: page switching, editor open/close, and the
  content-delivery open path. Confirm disposal while rAF/timeout/Delayer work is pending does not
  invoke owner callbacks.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/core/utils/scheduling.ts` | Add shared owner scheduler around existing `Delayer`/`afterPaint`. |
| `src/renderer/uikit/shared/vanilla-view.ts` | Expose protected owner `schedule` with view active assertion. |
| `src/renderer/core/state/model.ts` | Expose protected owner `schedule` using the model store. |
| `src/renderer/uikit/TruncatedText/TruncatedTextView.ts` | Convert measurement rAF. |
| `src/renderer/editors/video/VideoEditor.ts` | Convert navigation rAF; retain generation and early disposal release. |
| `src/renderer/editors/archive/ArchiveSecondaryView.ts` | Convert reveal rAF. |
| `src/renderer/editors/explorer/ExplorerSecondaryView.ts` | Convert reveal rAF. |
| `src/renderer/editors/markdown/MarkdownBodyView.ts` | Convert bounded anchor-retry rAF. |
| `src/renderer/components/file-search/FileSearchView.ts` | Convert focus rAF. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | Convert body measurement rAF. |
| `src/renderer/editors/rest-client/RestClientShared.ts` | Convert response measurement rAF. |
| `src/renderer/uikit/PathInput/PathInputModel.ts` | Convert the owner-bound 150 ms timeout. |
| `src/renderer/editors/graph/GraphLegendPanelView.ts` | Obtain per-key delayers from the owner scheduler. |
| `src/shared/utils.ts` | Add cancellable callable debounce return type and implementation. |
| `src/renderer/editors/text/TextFileIOModel.ts` | Bind gated debounce cancellation to its existing store. |
| `src/renderer/api/pages/PagesModel.ts` | Bind Pages persistence debounce cancellation to the model store. |

Files that need **no changes**: `src/renderer/core/state/dispatch.ts`,
`src/renderer/api/pages/PageModel.ts`, `src/ipc/renderer/renderer-events.ts`,
`src/renderer/core/utils/debounce.ts` (unless its existing re-export needs a type-only adjustment),
`src/renderer/editors/video/AudioVisualizer.ts`,
`src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts`,
`src/renderer/automation/commands.ts`, all remaining raw timeout/interval files listed in the
timer census, all existing `focusAfterPaint()` callers, and `doc/active-work.md`.
