# US-1260: P7 — unify the disposal contract; sweep raw listeners

Epic: [EPIC-080 — State, lifetime & scheduling core](../../epics/EPIC-080.md)

## Goal

Make `DisposableStore` the one renderer disposal mechanism for cleanup functions and disposable
objects, while preserving its existing FIFO/error-containment/closed-store behavior. Give views and
models a safe ownership seam for helper resources, and prepare a separately reviewable follow-up
for the raw DOM-listener sweep without changing teardown timing or ordering.

## Background

### Verified US-1259 foundation

US-1259 is present in the working tree. The four relevant files were read before planning:

- `src/renderer/core/state/listener-list.ts` owns registration identity, `active`, snapshot
  traversal, idempotent release, sync/async dispatch, and `dispose()`.
- `src/renderer/core/state/state.ts` uses `ListenerList<() => void>` for `TOneState`; selector
  evaluation and `set`/`update`/`clear` signatures remain local to the state primitive.
- `src/renderer/core/state/events.ts` uses the same core for `Emitter` and `Subscription`; both
  now expose `dispose()` and retain callable subscription disposers.
- `src/renderer/api/events/EventChannel.ts` uses the same core for FIFO `send`, reverse-order
  awaited `sendAsync`, duplicate-safe subscriptions, and `dispose()`.

US-1260 must not modify `src/ipc/renderer/renderer-events.ts`. Its separate
`RendererEventObject` listener list is explicitly deferred by EPIC-080 Notes and is not included in
the listener count below.

### The two disposal implementations

`src/renderer/core/utils/DisposableStore.ts` currently has the required behavior: `add()` creates a
per-item idempotent release handle, rejects registration after `closed`, `closeAndTake()` closes and
snapshots the list, and `dispose()` attempts every cleanup in insertion order before rethrowing the
first failure. Its current input type is `Cleanup = () => void`.

`src/renderer/api/internal.ts:14-30` defines `DisposableCollection` separately. It stores
`IDisposable` objects, loops without error containment, has no per-item release or disposed state,
and accepts registrations after disposal. A repository-wide source search found zero imports or
instantiations of `DisposableCollection`; its only code occurrence is its own declaration and
example. `src/renderer/api/internal.ts` does have one real consumer through `wrapSubscription`:
`src/renderer/api/settings.ts:9,189`. Therefore the recommendation is to delete the unused
`DisposableCollection` class and keep `internal.ts` for `wrapSubscription`.

The public-ish `IDisposable` declaration is at `src/renderer/api/types/common.d.ts:7-9`, with a
matching copy in `assets/editor-types/common.d.ts`. It is a script-facing, Monaco-compatible
structural contract, but no renderer application code uses that declared type except the unused
`DisposableCollection`. The core should not import `api/types/common.d.ts` because that would make
`core/utils` depend upward on the API layer. Define the renderer-internal structural
`IDisposable { dispose(): void }` beside `DisposableStore`, leave both public declaration files
unchanged, and make the store accept `Cleanup | IDisposable`.

Before:

```ts
type Cleanup = () => void;

add(cleanup: Cleanup): Cleanup;
```

After (planned internal contract):

```ts
export interface IDisposable {
    dispose(): void;
}

export type Cleanup = () => void;
type Disposable = Cleanup | IDisposable;

add(disposable: Disposable): Cleanup;
```

The object form must be normalized to `() => disposable.dispose()` and receive the same release
handle, closed-store rejection, complete disposal sweep, and first-error behavior as a function
cleanup. `IDisposable` is structural, so Monaco resources and native helper objects remain
interchangeable without changing their public declarations.

### Current owner semantics

`src/renderer/uikit/shared/vanilla-view.ts` owns a private `DisposableStore` named `disposers`.
`own()` asserts the view is active and stores a cleanup; `ownSubscription()` delegates to the
private `ownReleasable()` and returns an idempotent early-release handle; `listen()` asserts active,
wraps the callback with a disposed guard, adds the target listener, and registers the matching
removal through `ownReleasable()`. `VanillaView.dispose()` disposes children first, then the store
in FIFO order, then `onDispose()` while containing every cleanup error.

`src/renderer/core/state/model.ts` gives `TModel` a private `DisposableStore`; its protected
`own(cleanup)` has no view assertion, and `dispose()` drains the store. `TComponentModel` calls its
own disposal path and then the base path in `onUnmountInternal()`, so the store's idempotency is
already important.

The planned seam is a protected `disposables` getter on both `VanillaView` and `TModel`, plus an
explicit `DisposableStore.child()` helper. `child()` creates a child store and reserves one parent
FIFO slot for `() => child.dispose()` immediately, so later registrations made by a helper cannot
move that helper across later owner registrations. Helpers receive the child store, keep their own
`disposed` guard, and check it before every `child.add(...)`; a late attach after owner disposal
therefore returns through the helper's guard instead of throwing from a closed store. Existing
`own()`, `ownReleasable()`, and `ownSubscription()` signatures and semantics remain unchanged.
The owner must keep the existing registration point/order. In particular, do not move
`AppPageManagerView`'s explicit `GroupContainer.dispose()` work into the parent store, because
`VanillaView` store cleanup runs before `onDispose()` and that would change the existing group/style
teardown order.

### The named helpers

The epic's names resolve to these actual files:

| Helper | Verified implementation | Finding |
|---|---|---|
| `CellTooltip` | `src/renderer/uikit/DataGrid/cell-tooltip.ts:164-272`; created only by `DataGridView` at `src/renderer/uikit/DataGrid/DataGridView.ts:114` | Has a `disposed` flag, four root listeners at `:181-186`, and matching manual removal at `:192-195`, followed by `TooltipAttachment.dispose()`. It does have the helper-owned symmetric-list problem. `DataGridView` deliberately registers tooltip cleanup before grid destruction, so that order must remain. |
| `ImperativeSplitter` | `src/renderer/components/page-manager/ImperativeSplitter.ts:11-113`; created by `GroupContainer` at `src/renderer/components/page-manager/GroupContainer.ts:32-37` | Registers six element listeners and one `ResizeObserver` in its constructor and manually removes/disconnects them in `dispose():54-59`. `GroupContainer.dispose():64-77` calls it before removing the splitter element. It has the helper-owned symmetric-list problem; its existing explicit teardown point is load-bearing. |
| `KeyedList` | `src/renderer/uikit/shared/keyed-list.ts:18-181` | Does not call `addEventListener` or maintain a listener list. It already has an idempotent `disposed` flag, clears records before cleanup, attempts every removal/detach, and rethrows the first failure. It does not have the problem described by the epic, so it should not be changed merely to force the named helper into the migration. |

`KeyedList` consumers already use the owner pattern, for example `PinnedRailView:71` registers
`list.dispose()` with `own()`, and `BrowserTabsPanel:134` disposes its list in `onDispose()`. The
actual hand-rolled per-row listener list is in `src/renderer/ui/sidebar/PinnedRailView.ts:142-155`,
not in `KeyedList`; it is one raw `row.addEventListener` expression that registers seven runtime
listeners and is a direct `this.listen()` conversion candidate for US-1266.

### Raw listener re-measurement and classification

The current command-level measurement is 65 occurrences of `addEventListener(` under
`src/renderer`, including the sanctioned implementation at
`src/renderer/uikit/shared/vanilla-view.ts:211`. Therefore there are **64 raw occurrences**, exactly
the epic's stated baseline. There are zero matches under `src/renderer/editors/draw/**`; the React
island contributes no current raw sites to classify. The 64 raw occurrences are classified below.

#### Convertible to `VanillaView.listen()` — 17 raw occurrences

These are listener registrations on elements owned by a `VanillaView`; each conversion must retain
the current callback, options, dynamic release point, and any existing `live`/state guard.

| File and verified site | Count | Conversion detail |
|---|---:|---|
| `src/renderer/components/file-search/FileSearchView.ts:301,332` | 2 | Cell and chevron listeners; replace the paired `ownSubscription(() => removeEventListener())` calls with returned `this.listen()` handles. Keep pooled-cell bookkeeping and `live` checks unchanged. |
| `src/renderer/uikit/Textarea/TextareaView.ts:216-218` | 3 | Editable-mode listeners; retain `editableListenerReleases` and early detach by storing the `this.listen()` release handles. |
| `src/renderer/editors/board-info/BoardInfoEditorView.ts:352` | 1 | Dynamic repository link; put the returned release in the existing transient-cleanup list, preserving re-render cleanup. |
| `src/renderer/editors/notebook/ExpandedNoteView.ts:126,293,321,325,338` | 5 | Static category and dynamic tag/comment listeners; preserve `releaseTagListeners` and `releaseCommentListener`, changing only registration/removal plumbing. |
| `src/renderer/editors/notebook/NoteItemView.ts:344,361,387,391` | 4 | Dynamic comment/tag listeners; preserve the existing release arrays and callback identities. |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts:173` | 1 | Tile listener; preserve `tileResources` and `KeyedList` removal order, storing the returned release handle instead of a raw listener object. |
| `src/renderer/ui/sidebar/PinnedRailView.ts:144` | 1 lexical site / 7 runtime registrations | Replace the local symmetric `listeners` helper with `this.listen(row, ...)`; retain each per-row release handle so `removeRow()` still releases a row before disposing its icon/button. |

#### Not convertible to `VanillaView.listen()` — 47 raw occurrences

These sites are intentionally not blanket-rewritten. Where a helper already has a correct explicit
disposal contract, the implementation plan leaves its public lifecycle intact and only changes it
if the owner-store work requires it.

| File and verified site | Count | Why it is not a `listen()` conversion |
|---|---:|---|
| `src/renderer/api/internal/KeyboardService.ts:14` | 1 | Process-wide service listener on `document`; owned by `App.initEvents()` for renderer lifetime, not a view. |
| `src/renderer/api/internal/GlobalEventService.ts:81-92` | 9 | Process-wide document/window listeners; their capture/bubble options and global lifetime are service policy. |
| `src/renderer/components/page-manager/ImperativeSplitter.ts:39-44` | 6 | Helper object, not a `VanillaView`; migrate its symmetric cleanup to a `DisposableStore` supplied by its owner while keeping `GroupContainer.dispose()` at the same point. |
| `src/renderer/uikit/DataGrid/cell-tooltip.ts:181-186` | 4 | Helper object with its own tooltip lifecycle; use the owner-store seam/release handles, but do not make a helper call a protected view method. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts:68` | 1 | `SideBarPanelHeaderDom` is a plain DOM helper with an explicit idempotent `dispose()`; callers already dispose that handle through their owning view lifecycle. |
| `src/renderer/uikit/Popover/PopoverModel.ts:237-239` | 3 | Model-owned pointer-capture drag session; the source explicitly exempts this DOM touch from UIKit Rule 9 and tears it down on `lostpointercapture`/`pointerup` or `cancelResize()`. |
| `src/renderer/uikit/Tooltip/attach-tooltip.ts:199-200,230-234` | 7 | Generic tooltip attachment owns trigger and ephemeral floating-root listeners independently of any one view; its public `TooltipAttachment.dispose()` is the lifecycle boundary. |
| `src/renderer/uikit/shared/tooltipRegistry.ts:63-65` | 3 | Lazy module singleton's process-lifetime capture listeners; no individual owner should dispose them. |
| `src/renderer/uikit/shared/dom-props.ts:175` | 1 | Generic residual-prop reconciler; it must preserve its `RestPropsState` map and matching replacement/removal operations. |
| `src/renderer/components/git-tree/load-more-footer.ts:44` | 1 | Plain footer factory returns an object with its own explicit `dispose()`; no `VanillaView` owner is available inside the factory. |
| `src/renderer/editors/browser/BrowserView.ts:187` | 1 | Custom `<webview>` event names are arbitrary strings and the registration lives in `listenNative`; its existing `own()` removal is already view-owned, but widening the typed `listen()` contract for this one guest event would be a separate API change. |
| `src/renderer/editors/board/BoardWebview.ts:147` | 1 | `window` message listener is global to the view's board bridge and already has a guarded `ownSubscription` cleanup; it is not an owned element listener. |
| `src/renderer/editors/html/HtmlBodyView.ts:136` | 1 | `window` message listener for the sandbox iframe; preserve the current source/content-window filter and explicit cleanup. |
| `src/renderer/editors/html/HtmlBodyView.ts:12` | 2 | These are literal listeners in `injectedScript`, executing in the sandboxed preview document; they are not renderer-host registrations. |
| `src/renderer/editors/link-editor/LinkTooltipView.ts:58,114,136` | 3 | Plain DOM tooltip content intentionally owned by `attachTooltip`; its nodes disappear with the overlay and are not `VanillaView` instances. |
| `src/renderer/editors/monaco/MonacoBodyView.ts:317` | 1 | Standalone `setupWheelZoom()` attaches to Monaco's editor DOM and returns a host-cleanup function; keep its helper contract rather than moving Monaco feature setup into unrelated view lifecycle code. |
| `src/renderer/editors/notebook/NoteItemViewModel.ts:193` | 1 | Model-owned wheel listener; the model has no `VanillaView.listen()` access and its `setupWheelHandler`/`teardownWheelHandler` pair is explicit. |
| `src/renderer/ui/sidebar/FolderItemView.ts:48` | 1 | Pure `selectedArrow()` record helper creates a trailing DOM node before `FolderItemView` can register view ownership; the node is replaced/detached with the list-item record. |

The table totals 47 non-convertible raw occurrences and 17 direct conversions. The two actual
helper-store migrations (`CellTooltip` and `ImperativeSplitter`) account for 10 of those 47 raw
occurrences but are not `listen()` calls; the other 37 are intentionally unchanged. No raw site is in
`src/ipc/renderer/renderer-events.ts`.

The accepted sequencing decision is recorded here: US-1260 ends after the unified store and the two
helper ownership fixes; the 17 direct `listen()` conversions are sequenced after it in US-1266.

## Implementation Plan

### US-1260: contract and ownership work

1. Update `src/renderer/core/utils/DisposableStore.ts`.

   - Define the renderer-internal structural `IDisposable` and the function/object union without
     importing the script-facing API declaration.
   - Add `child(): DisposableStore`; it creates a child store and registers exactly one
     `() => child.dispose()` cleanup in the parent at the call site. The parent slot is reserved
     before the caller hands the child to a helper. A child disposed early remains safe when the
     parent later reaches its idempotent child cleanup.
   - Normalize a function to itself and an object to `() => object.dispose()` inside `add()`.
   - Keep the existing `closed` gate and exact error behavior: `closeAndTake()` happens before
     cleanup, every item is attempted in FIFO order, and only the first failure is rethrown.
   - Return an idempotent `Cleanup` release handle for both input forms. Releasing an object early
     must call its `dispose()` once and remove only that release entry from the store.

   Before:

   ```ts
   add(cleanup: Cleanup): Cleanup {
       if (this.closed) throw new Error("Cannot register a cleanup on a disposed DisposableStore.");
       // release function cleanup
   }
   ```

   After:

   ```ts
   add(disposable: Cleanup | IDisposable): Cleanup {
       if (this.closed) throw new Error("Cannot register a cleanup on a disposed DisposableStore.");
       const cleanup = typeof disposable === "function"
           ? disposable
           : () => disposable.dispose();
       // existing idempotent release wrapper around cleanup
   }
   ```

2. Update `src/renderer/api/internal.ts`.

   - Remove `DisposableCollection` and its now-unused `IDisposable` import.
   - Keep `wrapSubscription<T>()` and its `IEvent<T>` return shape unchanged; keep
     `src/renderer/api/settings.ts:9,189` working without any API signature change.
   - Do not add a replacement class under `api/`; `DisposableStore` is the renderer-internal
     implementation and has no script-facing export.

3. Update ownership plumbing in `src/renderer/uikit/shared/vanilla-view.ts` and
   `src/renderer/core/state/model.ts`.

   - Add the protected `disposables` getter to expose the owner store to a helper that needs
     per-resource registration, without exposing it publicly. The owner uses
     `this.disposables.child()` at the same point where the helper's teardown must occur.
   - Keep `own()` cleanup-only, including `VanillaView.assertActive()` and its existing no-return
     semantics; keep the model's existing no-assertion behavior. `IDisposable` enters through the
     store contract, not by changing the owner helper method signatures.
   - Leave `ownReleasable()` and `ownSubscription()` as the early-release/disposer naming used by
     current callers. Do not rename `disposers`, change child-first/FIFO ordering, or add a new
     disposal phase.

4. Refactor the two helpers that actually have the named listener-list problem.

   - `src/renderer/uikit/DataGrid/DataGridView.ts`: create `const tooltipDisposables =
     this.disposables.child()` exactly where the current tooltip cleanup is registered, then pass
     that child to `CellTooltip`. The child, not the helper's registration timing, occupies the
     parent's FIFO slot before the later grid-destroy registration.
   - `src/renderer/uikit/DataGrid/cell-tooltip.ts`: accept the child `DisposableStore`; register
     the four listener removals and tooltip cleanup through that child, retaining only idempotent
     release handles needed for an explicit early `dispose()`. Check `disposed` before every
     registration so a late attach after owner disposal is a no-op through the helper guard rather
     than a `DisposableStore.add()` closed-store exception. Preserve tooltip disposal, target
     clearing, and the existing tooltip-before-grid order.
   - `src/renderer/components/page-manager/ImperativeSplitter.ts` and
     `src/renderer/components/page-manager/GroupContainer.ts`: replace the six symmetric listener
     removals and observer teardown with a child-store-backed cleanup set. Because
     `AppPageManagerView.onDispose()` explicitly disposes groups after the parent view's store
     phase, `GroupContainer` must create the child store at construction and pass it to
     `ImperativeSplitter`; do not use the parent `VanillaView` store. Check `disposed` before every
     splitter registration. Preserve `GroupContainer.dispose()`'s order: splitter cleanup,
     splitter element removal, then placeholder style restoration. The local child store is drained
     from the existing explicit `GroupContainer.dispose()` point.
   - Do not change `src/renderer/uikit/shared/keyed-list.ts`; its current disposal algorithm is
     already the correct contract. Keep existing `KeyedList` owner registrations unchanged.

### US-1266 follow-up: direct `listen()` sweep

5. Split the direct sweep into US-1266, sequenced after the contract work. In that follow-up,
   convert exactly the 17 sites in the convertible table, preserving each current early-release
   boundary and callback/options identity. The files are:

   - `src/renderer/components/file-search/FileSearchView.ts`
   - `src/renderer/uikit/Textarea/TextareaView.ts`
   - `src/renderer/editors/board-info/BoardInfoEditorView.ts`
   - `src/renderer/editors/notebook/ExpandedNoteView.ts`
   - `src/renderer/editors/notebook/NoteItemView.ts`
   - `src/renderer/editors/link-editor/EditLinkDialogView.ts`
   - `src/renderer/ui/sidebar/PinnedRailView.ts`

   The follow-up must not touch the 47 not-convertible occurrences, the zero draw occurrences, or
   the deferred IPC listener list. A final `rg` inventory should show only the sanctioned wrapper
   plus the documented not-convertible sites.

6. Do not change dispatch timing, state ordering, `afterDispatch`, `live`/`generation`/`inert`
   flags, or any process-lifetime singleton disposal. Those belong to US-1261, US-1264, or the
   existing application lifetime respectively.

7. Update `doc/architecture/state-management.md` after the implementation so it no longer claims
   that `DisposableCollection` is retained as a separate object-only store. Document the unified
   `Cleanup | IDisposable` store, the unchanged public/script-facing `IDisposable` declaration,
   and the owner/helper rule. `src/renderer/api/types/common.d.ts` and
   `assets/editor-types/common.d.ts` remain unchanged.

## Concerns

### Recommendation: split the raw sweep into US-1266

The epic currently places the contract, helper ownership, and raw-listener sweep in one task. The
current source count supports splitting the sweep for review: 17 direct `listen()` conversions are
spread across seven view files, while 10 additional raw registrations belong to two helper-store
migrations, and the remaining 37 sites span process services, global targets, model gesture state,
generic DOM utilities, tooltip content, Monaco, iframe content, and explicit helper lifecycles.
That is 64 raw occurrences with three materially different migration rules. Keeping all of it in
US-1260 would make a near-zero-behavior disposal change difficult to review and would encourage a
blanket rewrite. US-1260 should therefore end after the unified store plus the two genuine helper
ownership fixes; this split is accepted, and US-1266 is sequenced after US-1260 to carry the 17
direct conversions and its own listener census.

### Disposal order is a hard constraint

`VanillaView.dispose()` runs children, then store resources, then `onDispose()`. Existing code also
uses explicit registration order: `DataGridView` removes tooltip listeners before destroying its
grid, and `AppPageManagerView.onDispose()` disposes `GroupContainer` before slots. Any store passed
to a helper must not move cleanup across those boundaries. A helper's cleanup can be idempotent and
error-contained without becoming earlier or later than the current owner call.

### Public signatures and `IDisposable`

Deleting `DisposableCollection` is a source/API surface change, but the verified consumer count is
zero and `api/internal.ts` is not a script-facing barrel. Record that count in the implementation
change and preserve `wrapSubscription`, `IEvent`, both `common.d.ts` declarations, and all existing
callable subscription signatures. Do not convert `IEvent.subscribe()` or `Emitter.event` from
callable disposers to objects in this task; `IDisposable` is an additional store input, not a new
event subscription return type.

### Deliberately excluded lifetime families

Do not add disposal calls for the five process-lifetime `Subscription` singletons in
`src/renderer/core/state/events.ts`, and do not change `src/renderer/api/events/AppEvents.ts`.
Do not touch `src/ipc/renderer/renderer-events.ts` or `src/ipc/api-types.ts`. Do not turn the global
`document`/`window` service listeners into view-owned listeners. Do not alter the model-owned
Popover pointer-capture session, tooltip registries, residual DOM-prop bookkeeping, Monaco setup
helper, or sandbox-injected HTML listeners merely to reduce the grep count.

### Verification constraints

There is no renderer unit-test harness and no unit-test work is planned. Implementation verification
is `npm run typecheck`, `npm run lint`, `npm run build-prod`, then a cold start exercising page
switching, editor open/close, and the content-delivery open path. The manual disposal probes should
cover object and function entries, early release, repeated release, a throwing cleanup followed by
later cleanups, and helper cleanup order; remove any temporary instrumentation afterward.

## Acceptance Criteria

- [x] `DisposableStore` is the only renderer store implementation; its `add()` accepts
  `Cleanup | IDisposable`, returns an idempotent release handle for either form, rejects additions
  after close, attempts every cleanup in FIFO order, and rethrows the first error afterward.
- [x] `DisposableCollection` has been removed after recording its verified zero consumer count;
  `wrapSubscription()` and `src/renderer/api/settings.ts` retain their existing signatures and
  behavior.
- [x] The renderer-internal `IDisposable` is structural and does not introduce a
  `core/utils` → `api/types` dependency; the public declarations in
  `src/renderer/api/types/common.d.ts` and `assets/editor-types/common.d.ts` are unchanged.
- [x] `DisposableStore.child()` creates a child store and reserves one parent FIFO slot at the
  call site; `VanillaView` and `TModel` expose the protected owner-store seam without changing
  `own()`, `ownReleasable()`, or `ownSubscription()` signatures or behavior.
- [x] Helpers check their own `disposed` guard before every child-store registration, so a late
  attach after owner disposal does not leak a closed-store exception out of the helper.
- [x] `CellTooltip` and `ImperativeSplitter` no longer hand-roll symmetric listener-removal lists;
  their owner/helper stores release every resource idempotently, and their existing explicit
  disposal points and ordering remain unchanged.
- [x] `KeyedList` remains unchanged because source inspection verified it already has correct
  idempotent, error-contained disposal and no listener-registration list.
- [x] The direct raw-listener sweep is explicitly split into US-1266: its scope is the 17 sites in
  the convertible table across seven files, with the 47 not-convertible sites documented and
  preserved.
- [x] No code changes are made to `src/ipc/renderer/renderer-events.ts`, `src/ipc/api-types.ts`,
  `src/renderer/core/state/listener-list.ts`, `src/renderer/core/state/state.ts`,
  `src/renderer/core/state/events.ts`, or `src/renderer/api/events/EventChannel.ts`.
- [x] No `afterDispatch`, dispatch-order, `live`/`generation`/`inert`, or process-lifetime singleton
  behavior changes are introduced.
- [ ] No unit tests or test harnesses are added; verification uses the project commands and cold
  start described above.
- [x] `doc/active-work.md` is unchanged; the existing EPIC-080 dashboard entry is not edited.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/core/utils/DisposableStore.ts` | Accept function cleanups and structural disposable objects with the existing robust store semantics. | US-1260 |
| `src/renderer/api/internal.ts` | Remove unused `DisposableCollection`; retain `wrapSubscription`. | US-1260 |
| `src/renderer/uikit/shared/vanilla-view.ts` | Expose the protected owner store for child-store creation, preserving existing ownership method signatures and lifecycle order. | US-1260 |
| `src/renderer/core/state/model.ts` | Expose the same protected owner-store seam, preserving existing ownership method signatures. | US-1260 |
| `src/renderer/uikit/DataGrid/cell-tooltip.ts` | Use its dedicated child store for tooltip listener cleanup while preserving explicit disposal. | US-1260 |
| `src/renderer/uikit/DataGrid/DataGridView.ts` | Create/pass a child store to `CellTooltip`; keep tooltip-before-grid cleanup order. | US-1260 |
| `src/renderer/components/page-manager/ImperativeSplitter.ts` | Replace symmetric listener/observer teardown bookkeeping with a local owner store. | US-1260 |
| `src/renderer/components/page-manager/GroupContainer.ts` | Supply/own the splitter store without moving explicit group teardown. | US-1260 |
| `src/renderer/editors/board-info/BoardInfoEditorView.ts` | Convert one dynamic listener through `this.listen()`. | US-1266 |
| `src/renderer/components/file-search/FileSearchView.ts` | Convert two pooled-cell listeners through `this.listen()`. | US-1266 |
| `src/renderer/uikit/Textarea/TextareaView.ts` | Convert three editable-mode listeners through `this.listen()`. | US-1266 |
| `src/renderer/editors/notebook/ExpandedNoteView.ts` | Convert five static/dynamic listeners through `this.listen()`. | US-1266 |
| `src/renderer/editors/notebook/NoteItemView.ts` | Convert four dynamic listeners through `this.listen()`. | US-1266 |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts` | Convert the keyed image-tile listener through `this.listen()`. | US-1266 |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | Replace the local per-row raw registration helper with `this.listen()`. | US-1266 |
| `doc/architecture/state-management.md` | Document the unified store and remove the obsolete separate-collection description. | US-1260 documentation follow-up |

Files that need **no changes** in US-1260:

- `src/renderer/core/state/listener-list.ts`, `src/renderer/core/state/state.ts`,
  `src/renderer/core/state/events.ts`, and `src/renderer/api/events/EventChannel.ts` — US-1259
  listener-core work is complete and dispatch behavior is outside this task.
- `src/ipc/renderer/renderer-events.ts` and `src/ipc/api-types.ts` — deferred IPC event
  infrastructure, explicitly outside EPIC-080/US-1260.
- `src/renderer/api/types/common.d.ts` and `assets/editor-types/common.d.ts` — public/asset
  structural declarations remain unchanged.
- `src/renderer/uikit/shared/keyed-list.ts` — verified correct disposal and no listener list.
- `src/renderer/api/settings.ts` — its only `api/internal.ts` dependency is unchanged
  `wrapSubscription`.
- `src/renderer/api/events/AppEvents.ts` and the five module-level subscriptions in
  `src/renderer/core/state/events.ts` — process-lifetime ownership remains unchanged.
- All 47 not-convertible raw occurrences listed in the classification table, including
  `KeyboardService.ts`, `GlobalEventService.ts`, `PopoverModel.ts`, `attach-tooltip.ts`,
  `tooltipRegistry.ts`, `dom-props.ts`, `load-more-footer.ts`, `BrowserView.ts`, `BoardWebview.ts`,
  `HtmlBodyView.ts`, `LinkTooltipView.ts`, `MonacoBodyView.ts`, `NoteItemViewModel.ts`, and
  `FolderItemView.ts` — no blanket rewrite.
- `doc/active-work.md` and `doc/epics/EPIC-080.md` — no dashboard or epic-table edits are part of
  this investigation/document task.
