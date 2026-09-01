# US-1264: Retire the `live` / `generation` / `inert` duplicates

Epic: [EPIC-080 – State, lifetime & scheduling core](../../epics/EPIC-080.md)

## Goal

Remove only the renderer lifetime guards that are provably duplicated by the landed
`VanillaView.listen()`, owner-bound `schedule.*`, `ListenerList`, or existing disposal ordering.
Keep asynchronous-completion and live-sequence guards that express state other than owner disposal.

The current source census is the authority for this task: it finds 106 exact `this.live` references,
14 of which are in the safe retirement set and 92 of which must remain. It also finds 66 exact
`this.inert` references; 31 individual reads/writes are mechanically redundant, while 35 remain
load-bearing. No generation counter is safe to remove in this task.

## Background

### The rule

Retire a custom flag only when it has no meaning beyond “this owner has been disposed” and every
callback whose guard is removed is already prevented from reaching owner code by a named mechanism:
`VanillaView.listen()`’s disposed wrapper, `schedule.*`’s owner-store cancellation/active check,
`DisposableStore`’s closed or released entry, `ListenerList`’s active registration, or a
deterministic earlier disposal cleanup; preserve the guard when the callback is a Promise
continuation, raw timer/microtask, third-party callback, direct subscription, or other path not
covered by one of those mechanisms, and preserve any generation that rejects a newer/older live
operation rather than disposal. This rule classifies a site not listed here the same way: name the
actual callback source and the exact release path, then retire only if that path proves the callback
cannot invoke owner work after disposal.

This is intentionally a site rule, not a naming rule. `live`, `isLive`, `inert`, and an unqualified
`generation` are not interchangeable by spelling alone.

### Landed ownership mechanisms verified in current source

- `src/renderer/uikit/shared/vanilla-view.ts:102-144` sets its private `disposed` flag before
  taking children or disposers and before calling `onDispose()`. Disposal order is therefore:
  `disposed = true` → children → the `DisposableStore` snapshot → `onDispose()`.
- `VanillaView.listen()` at `src/renderer/uikit/shared/vanilla-view.ts:197-218` wraps the callback
  with `if (this.disposed) return`, and registers its removal in the view's store. A browser event
  already captured when disposal starts therefore cannot invoke the user callback.
- `OwnerScheduler` at `src/renderer/core/utils/scheduling.ts:119-216` releases pending rAF and
  timeout entries from the owner store and checks each entry's `active` flag before invoking user
  work. `VanillaView.schedule` also asserts active before registration.
- `DisposableStore.closeAndTake()` at `src/renderer/core/utils/DisposableStore.ts:48-59` closes
  and snapshots the store before cleanup starts. A released entry is idempotent and removed from
  the store, so an owner cleanup can safely release a scheduler/listener entry already in the
  disposal snapshot.
- `ListenerList` at `src/renderer/core/state/listener-list.ts:37-93` snapshots registrations but
  rechecks `active`. This covers a listener released before or during a state/event dispatch, but
  it does not turn arbitrary Promise continuations, raw `Set` callbacks, or direct owner callbacks
  into guarded work.

### Reconciliation with US-1266

US-1266 converted the two File Search cell callbacks at
`src/renderer/components/file-search/FileSearchView.ts:292,327` to `this.listen()` and retained
their old `live` checks for this task. It also converted the focus rAF to `schedule.raf()` at
`:166-174`, again retaining its `live` check. Those three callback guards plus the disposal write
at `:180` are now in this task's retirement set. The other 17 listener conversions have no
`live`, `generation`, or `inert` guard in current source. US-1266's 10 helper registrations and
37 exclusions remain unchanged.

### Re-measured census

The following command was run against current TypeScript source, with identifier boundaries so
names such as `liveRows` do not count:

```text
rg -n --glob '*.ts' '\bthis\.(live|inert|isLive|generation|isDisposed|_autoInitExplorerQueued)\b' src/renderer src/ipc
```

The exact counts are:

| Exact current identifier | References | Interpretation in this task |
|---|---:|---|
| `this.live` | **106** | Primary census; 14 retire, 92 keep, 0 out of scope |
| `this.inert` | **66** | Separate site census; 31 individual sites retire, 35 keep |
| `this.isLive` | 26 | TComponentModel/model async lifetime checks; keep all |
| `this.generation` | 17 | Async load/arm identity or disposal-sensitive async work; keep all |
| `this.isDisposed` | 1 | Existing sanctioned base guard; keep |
| `this._autoInitExplorerQueued` | 3 | Queue coalescing, not disposal; out of scope |

The 106 `this.live` sites are classified individually below. Counts are lexical references, not
files; a single line containing two exact references would count twice.

### The 106 `this.live` sites

| File and exact current sites | Count | Classification and proof |
|---|---:|---|
| `src/renderer/components/file-search/FileSearchView.ts:168,180,292,327` | 4 | **Retire.** `:168` is the callback passed to `schedule.raf()` at `:166`; `:292` and `:327` are callbacks passed to `listen()` at `:291` and `:326`. The scheduler/store and listener wrappers suppress all three callbacks after disposal; `:180` only flips this lifetime flag. Keep the existing `record`/row checks and focus/cell bookkeeping. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts:108,109,192,196` | 4 | **Retire.** `:194` is the owner-bound rAF callback. `sync()` reaches `scheduleBodyMeasure()` only from the mounted view's own update path, and the scheduler rejects/cancels owner work after disposal; the `root.isConnected` and zero-height retry checks remain. Remove only the `live` field and its disposal write/release wrapper; the scheduler owns `bodyMeasureFrame`. |
| `src/renderer/editors/rest-client/RestClientShared.ts:151,153,272,276` | 4 | **Retire.** Same proof as Request Builder: `:274` is `schedule.raf()`, and its callback is owner-cancelled/active-guarded. Preserve `root.isConnected`, zero-height retry, `measureFrame` release bookkeeping, and layout behavior. |
| `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts:75,138` | 2 | **Retire.** Current source has no read of this field at all. `:75` and `:138` are dead writes; remove the field and both writes without changing the separately-owned settings subscription or tree cleanup. |
| `src/renderer/ui/app/AsyncEditorView.ts:43,85,92` | 3 | **Keep.** `getEditorModule()` is an uncancellable Promise. `:85`/`:92` must reject a late import/rejection after a newer `cacheKey` load (`generation`) and after owner disposal (`live`). `isDisposed` alone cannot express two live loads, and `schedule.*` does not own this Promise. |
| `src/renderer/ui/app/PageContentView.ts:34,58` | 2 | **Keep.** `:35-43` and `:62` use direct `state.subscribe` registrations, not `bind()`. The base comment at `vanilla-view.ts:124-131` documents the captured-dispatch hazard; `ListenerList` only helps after the registration is released, while a disposal-triggered dispatch can still reach the direct callback. No helper conversion is allowed here beyond guard retirement, and this site is not proven for retirement. |
| `src/renderer/editors/board/BoardWebview.ts:70,81,115,122,152,156,177,190,206,224,240,245,273,356,379` | 15 | **Keep.** Board registration, filesystem writes, IPC/message-port callbacks, raw `window` message handling, and `resolveFilePath`/`resolveVariable` Promise continuations are not covered by `listen()`/`schedule.*`. `generation` only changes on disposal, but the callbacks still need an explicit lifetime guard until those async and cross-origin paths acquire a sanctioned owner mechanism. |
| `src/renderer/editors/env-vars/EnvVarsBodyView.ts:336,338,375,445` | 4 | **Keep.** `:443-445` is an unowned `queueMicrotask()` that reads and mutates the grid after `scheduleApply()`; neither `DisposableStore` nor `schedule.*` covers it. The mount/disposal writes also clear the grid resource. |
| `src/renderer/editors/git-tree/CommitDiffPanel.ts:103,164,190` | 3 | **Keep.** `commitFiles()` and the `Promise.all()` diff load are uncancellable Promise continuations. `filesGeneration`/`diffGeneration` reject superseded commit/file results; `live` rejects owner disposal. |
| `src/renderer/editors/git-tree/CommitInfoPanel.ts:36,111` | 2 | **Keep.** `git.commitMessage()` is an uncancellable Promise and `messageGeneration` also rejects a newer selected commit. |
| `src/renderer/editors/graph/GraphBodyView.ts:415,455,584,627,639,651,655,707` | 8 | **Keep.** The sites protect an editor-owned callback, confirmation Promise continuation, direct model/editor callbacks, and an unowned projection `queueMicrotask()`. `bind()` covers only the bound state path; it does not cover the editor callback or microtask. |
| `src/renderer/editors/graph/GraphDetailPanelView.ts:173,233,246,254,261,271,284,295,587,596,629,632` | 12 | **Keep.** These guards cover driver/model callbacks, selection dependency callbacks, and the unowned seed `queueMicrotask()` at `:632`; several also require `driver.model.isLive` and prop/request identity. No owner helper covers all paths. |
| `src/renderer/editors/graph/GraphLegendPanelView.ts:472,485,615` | 3 | **Keep.** `:472` and `:615` guard unowned `queueMicrotask()` work; `:485` retires the view. The model's `schedule.delayer()` completion separately needs `GraphLegendModel.isLive` because a running Promise can settle after Delayer disposal. |
| `src/renderer/editors/graph/GraphTooltipView.ts:142,230,235` | 3 | **Keep.** Clipboard Promise completion and the raw copy-reset timeout at `:230-235` are not owner-scheduled. The `live` check prevents updates to the disposed tooltip and button. |
| `src/renderer/editors/mneme-config/MnemeConfigView.ts:97,99,102,106` | 4 | **Keep.** The view uses direct model subscriptions at `:102` and an async inventory load at `:107`; `inventoryGeneration` handles model/load replacement, while `live` handles disposal. |
| `src/renderer/editors/mneme-config/RootsPanel.ts:278,281,333` | 3 | **Keep.** `apply()` awaits `setRootConfig()` before touching controls. The raw Promise continuation is not covered by a view listener or scheduler. |
| `src/renderer/editors/mneme-root/MnemeRootEditorView.ts:276,286,319` | 3 | **Keep.** The direct model subscription at `:317-323` is precisely the `VanillaView.isDisposed` hazard and is not a `bind()` wrapper. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` and `RestClientShared.ts` | 0 | Included above; no additional sites. |
| `src/renderer/editors/rest-client/ResponseViewerView.ts:130,131,160` | 3 | **Keep.** `sync()` queues an unowned microtask at `:159-161`; removing the view can occur before it runs. `live` is the only current guard for that deferred driver call. |
| `src/renderer/editors/settings/sections/DefaultBrowserSection.ts:79,102,111,121` | 4 | **Keep.** `checkStatus()` and register/unregister flows await API Promises. The `finally` updates must not touch disposed state. |
| `src/renderer/ui/secondary-views/LazySecondaryViewView.ts:53,68,71` | 3 | **Keep.** Dynamic secondary-view import success/rejection is an uncancellable Promise; `loadGeneration` distinguishes panel replacement and `live` handles disposal. |
| `src/renderer/ui/sidebar/MenuBarView.ts:212,247,263` | 3 | **Keep.** `:247` is a raw `setTimeout`; `:263` is an unowned `queueMicrotask`; `:212` clears only the raw timer and does not cover the microtask. |
| `src/renderer/ui/sidebar/OpenTabsListView.ts:70,86` | 2 | **Keep.** `loadWindowPages()` awaits an API Promise. The duplicate-refresh timer is cleared, but that does not cancel the already-running load. |
| `src/renderer/ui/sidebar/RecentFileListView.ts:38,65,103` | 3 | **Keep.** Initial/reload API work and the async remove action can complete after disposal. `loadId` handles replacement; `live` handles owner lifetime. |
| `src/renderer/uikit/ImageViewport/ImageViewportView.ts:87,102,250,254` | 4 | **Keep.** `:100-105` is a raw source timer and `:252-254` is an unowned microtask. Clearing the timer field does not stop a callback already captured by the event loop. |
| `src/renderer/uikit/Notification/AlertsBar.ts:142,182,185` | 3 | **Keep.** `queueMeasurement()` uses an unowned microtask; both checks protect the two state/height phases after it runs. `bind()` protects the enqueueing state callback, not the microtask itself. |
| `src/renderer/uikit/Progress/Progress.story.ts:103,164` | 2 | **Keep.** Story demo waits and timers are raw; disposal resolves pending waits, but their Promise continuations still call `addLog()`. |
| **Total** | **106** | **Retire 14; keep 92; out of scope 0.** |

The table deliberately shows the two REST files together as a zero-count cross-reference row only
to make the primary census easy to audit; their four sites each are listed in their own rows.

### Separate `inert` census

`inert` has two meanings in current source: disposal-only state and a guard needed during a branch,
grid, third-party, or disposal phase. Because `VanillaView.dispose()` sets `disposed` before any
children/disposers/`onDispose()` work, an `own(() => { this.inert = true; })` cleanup does not make
the owner newly disposed: `isDisposed` is already true when that cleanup runs. That makes a later
`onDispose()` assignment redundant, but it does not make every callback safe to remove. In
particular, a callback from `board-icon-cache.ts:73-76` is held in a plain `Set`, and a direct
model callback or third-party callback is not retroactively covered by `ListenerList`.

The safe individual changes are:

| File and exact `this.inert` sites | Retire | Keep | Proof / remaining reason |
|---|---:|---:|---|
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:136,398` | 2 | `:86,110` | `:136` is the `bind()` apply callback; `:398` is reached through the child `TreeView` listener path. Keep the flag for `subscribeFileIconElements()` at `:110`, because its board-icon leg is a plain `Set` notifier. Keep the constructor cleanup at `:86`. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts:165,225` | 2 | `:103,376,383` | `:165` repeats the constructor-registered disposal write after the store cleanup already ran; `:225` is the `bind()` apply callback. Keep `onGridModel` and the unowned repaint microtask at `:376,383`. |
| `src/renderer/uikit/Tree/TreeView.ts:551` | 1 | `:107,129,210` | `:551` is called only from the four pooled-cell callbacks installed with `this.listen()`. Keep the flag for public `refreshRows()` and the model's direct `onStateApplied` callback at `:129,210`. |
| `src/renderer/uikit/ListBox/ListBoxView.ts:117,496` | 2 | 0 | `activeRecord()` at `:496` is called only from pooled-cell callbacks installed with `this.listen()`. Remove the now-unused disposal write and flag. |
| `src/renderer/editors/category/CategoryEditor.ts:103,198` | 0 | 2 | `folderViewModeService.getViewMode()` is an uncancellable Promise; `viewModeGeneration` distinguishes category paths. |
| `src/renderer/editors/link-editor/LinkBody.ts:117` | 1 | `:99,131` | `:117` repeats the earlier store cleanup write. Keep `:131`: this is a direct `model.state.subscribe` callback, not `bind()`; `ListenerList` cannot cover a callback reached before its release entry runs during a disposal sweep. |
| `src/renderer/editors/link-editor/LinksListView.ts:390,402,410,416,424,444,460` | 7 | `:122,205` | All seven reads are inside `this.listen()` callbacks. Keep the flag for asynchronous favicon readiness at `:205` and its owner cleanup at `:122`. |
| `src/renderer/editors/link-editor/LinksTilesView.ts:360,519,559,564,570,575,596,612` | 8 | `:113,136,244,250` | All eight reads are inside `this.listen()` callbacks. Keep grid resize at `:113` and favicon/image Promise/subscription completions at `:244,250`; retain the flag. |
| `src/renderer/editors/link-editor/PinnedLinksPanelView.ts:310` | 1 | `:296,342` | `:310` repeats the earlier cleanup write. Keep the favicon completion guard at `:342` and its cleanup registration at `:296`. |
| `src/renderer/editors/video/AudioVisualizer.ts:235,392` | 2 | `:216,226,241,313,320,333,347,349,370` | The media `emptied` and `loadedmetadata` callbacks are installed with `this.listen()`. Keep observer, settings subscription, audio-resume Promise, audio graph, and both independent raw-rAF loops. |
| `src/renderer/editors/video/VPlayer.ts:68,71,74,77,80` | 5 | `:89,167,168,169,170,172` | The five native-media callbacks use `this.listen()`. Keep all five video.js player callbacks: the third-party player owns those emitters and can call them while its disposal is running. |
| **Total** | **31** | **35** | Remove only the listed individual redundant checks/writes; do not delete a mixed-use `inert` field. |

### `isLive`, `generation`, and queue flags that stay

The exact `this.isLive` references are all retained. `TComponentModel.isLive` is set false by
`onUnmountInternal()` in `src/renderer/core/state/model.ts:97-124`, but models do not expose a
protected `isDisposed` equivalent. The reads guard uncancellable async work in:

| Files / sites | Why it stays |
|---|---|
| `TreeProviderViewModel.ts:210`, `CategoryViewModel.ts:189,232,504`, `TreeModel.ts:588,600,815,834,863` | Async tree/provider loading checks at awaited boundaries. |
| `SelectModel.ts:594,598`, `FileDiffBodyModel.ts:62`, `CodeBlock.ts:128,131,135` | Async item/text resolution; each also has a load/render identity where relevant. |
| `GraphLegendPanelView.ts:77` | A `Delayer` can have a running completion after owner disposal; `schedule.delayer()` cancels pending work but cannot undo a Promise callback already running. |
| `BrowserProfilesSectionModel.ts:85,90`, `McpSectionModel.ts:74,76,79,86,88,91,137` | IPC/API Promise continuations, renderer-event subscriptions, and raw timers. |
| `core/state/model.ts:119` | The model's own unmount lifetime transition; it is the source of the inherited contract. |

The exact `this.generation` census is 17: `AsyncEditorView.ts:43,51,76,85,92` retains its module
load generation, `NoteItemActiveEditorView.ts:117,124,125,153,167` retains its embedded-arm
generation, and `BoardWebview.ts:82,241,245,349,356,371,379` remains tied to uncancellable board
registration/IPC work. The Board counter changes only at disposal, but its Promise and cross-origin
callbacks are not owner-scheduled; it is not safe to delete it under the rule above while also
removing the only explicit lifetime guard.

A suffix-generation census found additional load-bearing counters and keeps them unchanged:

- `LazySecondaryViewView.loadGeneration` — panel identity/load replacement.
- `CommitInfoPanel.messageGeneration` and `CommitDiffPanel.filesGeneration`/`diffGeneration` —
  commit/file request replacement.
- `CategoryEditor.viewModeGeneration` and `MnemeConfigView.inventoryGeneration` — path/model
  replacement while the owner remains live.
- `LinksListView.faviconGeneration`, `LinksTilesView.faviconGeneration`/`imageGeneration`, and
  `PinnedLinksPanelView.faviconGeneration` — favicon/image completion replacement.
- `AudioVisualizer.animationGeneration` and `sizingGeneration` — two independent raw-rAF loops;
  one owner-wide coalescing slot cannot represent both, as documented by US-1263.
- `VideoEditor.navigationGeneration`, `MarkdownBodyView.lifecycleGeneration`,
  `MarkdownBlockView.lookupGeneration`/`renderGeneration`, and the other renderer request/render
  generations found by `rg 'Generation|generation' src/renderer` — live request or render identity,
  not disposal state.

`PageModel.cleanupGeneration` and the deferred cleanup fields/methods at
`src/renderer/api/pages/PageModel.ts:114-116,367-400` are **out of scope for US-1264 and owned by
US-1262**. The `_autoInitExplorerQueued` declaration/reference sites at `:637,640,644,646` are
queue coalescing, not owner disposal, and are out of scope. The existing `PageToolbarView.isDisposed`
guard at `:181` is the sanctioned pattern and is not changed.

## Implementation Plan

1. Re-run the bounded exact census before editing:

   - confirm 106 `this.live` references and the four retirement groups: File Search (4), Request
     Builder (4), Rest Detail (4), and Script Library (2);
   - confirm 66 `this.inert` references and the 31 exact sites in the inert table;
   - confirm the 17 exact `this.generation` references and that all suffix generations listed
     above still have live replacement/sequence use;
   - stop and update this plan if any site, callback, or release path has moved.

2. Retire File Search's redundant lifetime flag in
   `src/renderer/components/file-search/FileSearchView.ts`.

   Before:

   ```ts
   this.focusFrame = this.schedule.raf(() => {
       this.focusFrame = undefined;
       if (this.live) this.queryField?.focus();
   });
   // cell and chevron callbacks also test !this.live
   protected onDispose(): void { this.live = false; }
   ```

   After:

   ```ts
   this.focusFrame = this.schedule.raf(() => {
       this.focusFrame = undefined;
       this.queryField?.focus();
   });
   // this.listen() remains the only callback boundary for cell and chevron handlers
   protected onDispose(): void {}
   ```

   Remove the private `live` field and the four exact references at `:168,180,292,327`. Do not
   alter `cellRecords`, pooled-cell reuse, `focusFrame` release, `record.row` checks, or the
   `listen()` registrations.

3. Retire the two owner-scheduled measurement flags.

   In `src/renderer/editors/rest-client/RequestBuilderView.ts`, remove `live` and the lifetime
   write from `onMount()`/its first cleanup. Keep `bodyMeasureFrame?.()` if it is still the
   explicit early-release handle, but let `schedule.raf()` be the owner-disposal mechanism. Remove
   only `:192` and the `:196` `live` conjunct; preserve `root.isConnected`, the zero-height retry,
   and the `bodyMeasureFrame = undefined` lifecycle.

   In `src/renderer/editors/rest-client/RestClientShared.ts`, make the identical narrow change for
   `measureFrame` at `:272`/`:276`. `scheduleMeasurement()` still owns one independent rAF stream;
   its retry remains conditioned on connection and measurable height.

   Representative before/after:

   ```ts
   // Before
   if (!this.live) return;
   this.bodyMeasureFrame?.();
   this.bodyMeasureFrame = this.schedule.raf(() => {
       this.bodyMeasureFrame = undefined;
       if (!this.live || !this.root.isConnected || this.bodyPanel.offsetHeight <= 0) {
           this.scheduleBodyMeasure();
       }
   });

   // After
   this.bodyMeasureFrame?.();
   this.bodyMeasureFrame = this.schedule.raf(() => {
       this.bodyMeasureFrame = undefined;
       if (!this.root.isConnected || this.bodyPanel.offsetHeight <= 0) {
           this.scheduleBodyMeasure();
       }
   });
   ```

   The callback cannot run after store disposal because `OwnerScheduler.raf()` releases its
   `PendingRaf` entry and checks `pending.active` before calling the callback. Do not convert any
   other REST timeout, Promise, or microtask in these files.

4. Delete Script Library's dead `live` state in
   `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts`: remove the private field, the `own()`
   write at `:75`, and the `onDispose()` write at `:138`. Verify with a bounded identifier search
   that no read is introduced or missed. Leave the settings subscription, `removeTree()`, and
   child disposal untouched.

5. Remove only the 31 listed `inert` checks/writes:

   - remove the `this.inert` conjunct from the bound `applyState`/`apply` paths and the child
     `TreeView`/`listen()` callback paths named in the inert table;
   - remove `ListBoxView`'s entire `inert` field and cleanup write because `activeRecord()` has no
     remaining unwrapped caller;
   - remove only the redundant later writes in `CategoryViewImpl.onDispose()`,
     `LinkBodyView.onDispose()`, and `PinnedLinksPanelView.onDispose()`; retain their earlier
     cleanup writes because their fields still guard uncovered callbacks;
   - in `AudioVisualizer`, remove only the checks inside the two media callbacks installed with
     `this.listen()`; retain all observer, settings, Promise, and raw-rAF checks;
   - in `VPlayer`, remove only checks from the five native callbacks installed with
     `this.listen()`; retain checks in all five `video.js` callbacks and retain the field.

   Representative listener conversion (the listener registration itself is unchanged):

   ```ts
   // Before
   this.listen(row, "click", (event) => {
       const current = this.cells.get(record.cell);
       if (!current || this.inert) return;
       current.onSelect?.(current.link, event);
   });

   // After
   this.listen(row, "click", (event) => {
       const current = this.cells.get(record.cell);
       if (!current) return;
       current.onSelect?.(current.link, event);
   });
   ```

   The `listen()` wrapper is the proof for this change, not DOM detachment. Do not change
   `SubtreeSwap`, `KeyedList`, grid contracts, favicon subscriptions, or the plain board-icon
   notifier.

6. Leave every retained live/inert/generation guard in place and add no replacement custom
   lifetime flag. In particular, do not “clean up” the direct subscriptions in `PageContentView`,
   `MnemeRootEditorView`, or `MnemeConfigView`; do not convert raw microtasks/timers or
   third-party callbacks as part of this task.

7. Verify the final census and implementation with the repository's normal typecheck/lint/build
   validation. There is no unit-test harness. Exercise the focused paths manually where possible:
   File Search focus and pooled cells, REST measurement while closing, ListBox/Tree pooled-cell
   events, link list/tile interactions, native/video.js player teardown, and disposal during
   favicon/audio work. Also run EPIC-080's cold-start flow over page switching, editor open/close,
   and content delivery.

## Concerns

### The retained 92 live references are not failed conversions

They are intentionally retained because each protects an async boundary that the landed helpers do
not own. The exact table records the result: dynamic imports, API/IPC/filesystem Promises, direct state
subscriptions, raw timers, and unowned microtasks remain. Replacing these with `isDisposed` or
deleting them without first adding a matching owner mechanism would recreate the use-after-dispose
hazard this task is meant to avoid.

### Disposal-phase ordering is easy to misread

`isDisposed` is true before children, store entries, and `onDispose()` run. That proves later
duplicate assignments such as `CategoryViewImpl:165` are unnecessary. It does not prove that a
plain `Set` notifier, direct callback, or third-party emitter is safe to invoke without a guard;
the callback may run before its own release entry is reached. The plan therefore removes only
listener-wrapper checks and redundant writes, not mixed-use disposal flags wholesale.

### Scheduler coalescing is not a universal replacement

`OwnerScheduler.raf()` has one owner-wide pending slot. `AudioVisualizer` has independent animation
and sizing loops, so its raw handles and `animationGeneration`/`sizingGeneration` remain required.
`VideoEditor.navigationGeneration` similarly rejects a newer navigation even though its one rAF
handle is now owner-bound. No scheduler API change belongs here.

### No task split for the bounded retirement set

The implementable scope is 45 exact sites: 14 `live` and 31 `inert`, across the files listed below.
The 92 retained `live` sites and 35 retained `inert` sites are not one unfinished blanket sweep;
they represent distinct uncancellable async, third-party, direct-subscription, and sequencing
contracts. A future owner-cancellation/async-lifetime task may revisit them, but expanding this
task to force a split would make the safety rule less mechanical. No split is recommended for the
45-site subset; the retained family is explicitly deferred, not silently included.

### Explicit exclusions

Do not touch:

- `src/renderer/api/pages/PageModel.ts`'s `deferEditorCleanup`, `pendingCleanupPromises`,
  `drainDeferredEditorCleanup`, or `cleanupGeneration`; US-1262 owns that machinery.
- `src/ipc/renderer/renderer-events.ts`.
- `SubtreeSwap` or `KeyedList` contracts or their call sites.
- `PageContentView` beyond a proven guard retirement (none is proven here).
- `src/renderer/editors/video/AudioVisualizer.ts` raw rAF handles/generations, except the two
  `this.listen()`-wrapped media guard reads explicitly listed for removal.
- Any unit test or test harness, because this project does not use one.
- `doc/active-work.md` or any dashboard/epic entry.

## Acceptance Criteria

- [ ] The pre-edit and post-edit exact census is recorded and confirms 106 current `this.live`
  references, with exactly 14 retired, 92 retained, and no out-of-scope live site silently omitted.
- [ ] File Search's focus, cell, and chevron callbacks rely on `schedule.raf()`/`listen()` guards;
  pooled-cell identity and release behavior are unchanged.
- [ ] Request Builder and Rest Detail retain their explicit measurement retry/early-release
  behavior while `schedule.raf()` is the disposal guard; their four `live` references each are
  removed.
- [ ] Script Library's dead flag has no remaining declaration, write, or read; its real cleanup
  paths are unchanged.
- [ ] Exactly the 31 inert sites in the table are retired. Mixed-use `inert` fields remain where
  favicon, grid, observer, Promise, raw-rAF, direct-subscription, plain-Set, or third-party paths
  still require them.
- [ ] All 26 `this.isLive` references, all 17 exact `this.generation` references, and all listed
  suffix generations remain; their async/sequence reasons are documented.
- [ ] `PageModel` deferred cleanup, IPC renderer events, SubtreeSwap/KeyedList contracts,
  PageContent helper adoption, and dashboard entries are unchanged.
- [ ] No unit tests or test harnesses are added. Run lint, typecheck/build validation, the final
  inventory, and the EPIC-080 cold-start/manual lifecycle flow.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/components/file-search/FileSearchView.ts` | Remove the redundant `live` writes/guards from owner-scheduled/listener-wrapped callbacks. | 4 live sites |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | Remove `live` from the owner-bound body measurement loop. | 4 live sites |
| `src/renderer/editors/rest-client/RestClientShared.ts` | Remove `live` from the owner-bound response measurement loop. | 4 live sites |
| `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts` | Delete the unused `live` field and two writes. | 2 live sites |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Remove only `inert` checks covered by `bind()`/child listener wrappers. | 2 inert sites |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Remove one bound callback check and one redundant later disposal write. | 2 inert sites |
| `src/renderer/uikit/Tree/TreeView.ts` | Remove the pooled-cell `activeRecord()` check covered by `listen()`. | 1 inert site |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Remove the now-unneeded `inert` field, cleanup, and pooled-cell check. | 2 inert sites |
| `src/renderer/editors/link-editor/LinkBody.ts` | Remove the redundant second disposal write; retain the direct-subscription guard. | 1 inert site |
| `src/renderer/editors/link-editor/LinksListView.ts` | Remove `inert` checks from seven `listen()` callbacks. | 7 inert sites |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Remove `inert` checks from eight `listen()` callbacks. | 8 inert sites |
| `src/renderer/editors/link-editor/PinnedLinksPanelView.ts` | Remove the redundant later disposal write. | 1 inert site |
| `src/renderer/editors/video/AudioVisualizer.ts` | Remove checks from the two `listen()`-wrapped native media callbacks only. | 2 inert sites |
| `src/renderer/editors/video/VPlayer.ts` | Remove checks from five native `listen()` callbacks; retain video.js guards. | 5 inert sites |

Files that need **no changes** in US-1264:

- All files in the 92-site `this.live` keep table, including `AsyncEditorView.ts`,
  `PageContentView.ts`, `BoardWebview.ts`, the graph/git-tree/mneme views, sidebar async views,
  `ImageViewportView.ts`, `AlertsBar.ts`, and `Progress.story.ts`.
- `src/renderer/core/utils/DisposableStore.ts`, `src/renderer/core/utils/scheduling.ts`,
  `src/renderer/core/state/listener-list.ts`, and
  `src/renderer/uikit/shared/vanilla-view.ts`; their landed contracts are evidence, not changes.
- All retained generation/isLive sources listed above, including `VideoEditor.ts`,
  `AudioVisualizer.ts` raw rAF machinery, `CodeBlock.ts`, `MarkdownBodyView.ts`, and link/favicon
  generation users.
- `src/renderer/api/pages/PageModel.ts`, `src/ipc/renderer/renderer-events.ts`,
  `src/renderer/uikit/shared/subtree-swap.ts`, and the `KeyedList` implementation/call sites.
- `src/renderer/ui/app/PageContentView.ts` helper/adoption code, `src/renderer/api/pages` deferred
  cleanup machinery, `src/renderer/automation` remote-page adapters, and all US-1266 listener
  exclusions/helper registrations.
- `doc/active-work.md` and `doc/epics/EPIC-080.md`; the existing dashboard/task-table entries are
  not edited.
