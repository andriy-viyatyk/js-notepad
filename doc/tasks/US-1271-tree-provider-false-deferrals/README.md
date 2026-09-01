# US-1271: Remove stale React deferrals in tree-provider

## Status

**Status:** In Progress  
**Priority:** Medium  
**Epic:** [EPIC-082 - React architecture removal at the call sites](../../epics/EPIC-082.md)  
**Started:** 2026-09-01  
**Completed:** -

## Goal

Remove the three `tree-provider` deferrals whose comments cite React render restrictions that do
not exist in Persephone's native view runtime, and reword the fourth comment without changing its
correct constructor ownership code. Preserve only ordering or lifetime behavior that the current
source proves to be real.

## Background

Persephone's renderer uses explicit `VanillaView` lifecycle calls. The relevant path is synchronous:
`VanillaView.update()` stores props and calls `onUpdate()` at
`src/renderer/uikit/shared/vanilla-view.ts:90-99`; the view calls
`driver.update()` at `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:130-132` or
`src/renderer/components/tree-provider/CategoryViewImpl.ts:159-162`; and
`createComponentModelDriver()` pumps `setProps()` synchronously both at construction
(`src/renderer/core/state/model.ts:168-171`) and on `driver.update()`
(`src/renderer/core/state/model.ts:178-180`). There is no React render or layout-effect phase on
these paths.

The state runtime is also synchronous. `TOneState.stateChanged()` wraps listener notification in
`runInDispatch()` (`src/renderer/core/state/state.ts:72-78`), and nested state updates are part of
the same dispatch scope. `afterDispatch()` in
`src/renderer/core/state/dispatch.ts:37-43` waits for the outermost dispatch only when one is
active, but invokes the callback immediately when no dispatch is active. It is therefore an
ordering boundary, not a replacement spelling for every microtask.

The counter-example is the existing comment in
`src/renderer/components/tree-provider/TreeProviderViewImpl.ts:371-373` and `:383-386`: it names
the actual repaint-signature migration bug and mentions the React original explicitly as history.
That is the standard for a comment that survives this task. The comments at the four sites below
must either describe a verified Persephone consequence or disappear with the deferral.

### Verified sites and decisions

The scoped source inventory at commit `caacc80a` contains exactly these four requested sites:

| Site | Current code | Decision | Liveness decision |
|---|---|---|---|
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts:205-214` | `adoptSelection()` wraps a guarded `state.update()` in `queueMicrotask()` | Remove the microtask and write selection synchronously at the model write site | Remove only the `isLive` guard at `:210`, because it guards the removed callback |
| `src/renderer/components/tree-provider/CategoryViewModel.ts:187-201` | `setProps()` wraps watch subscription, selection reset/seed, and `loadItems()` start in `Promise.resolve().then()` | Remove the promise wrapper and apply those prop-derived consequences synchronously | Remove only the `isLive` guard at `:189`; retain `subscribeWatch()`'s guard at `:232` and all async loading behavior |
| `src/renderer/components/tree-provider/CategoryViewModel.ts:499-507` | `setDragState()` wraps every drag-state `state.update()` in `queueMicrotask()` | Remove the microtask so drag feedback publishes immediately | Remove only the `isLive` guard at `:504`, because it guards the removed callback |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts:101-104` | Constructor-time `own()` calls are preceded by a comment mentioning a layout effect | Wording-only correction; keep both `own()` calls unchanged | No guard or lifecycle code changes |

### Caller trace and dispatch decision

`setProps()` can in fact be reached from inside an active state dispatch, but the source does not
show a dependency that requires waiting for the dispatch epilogue:

- `TreeProviderViewImpl.onUpdate()` calls `driver.update()` synchronously. The selected-href prop
  is pumped from the selector bindings in `src/renderer/editors/archive/ArchiveSecondaryView.ts:62-66`
  and `src/renderer/editors/explorer/ExplorerSecondaryView.ts:80-87`, from the composite editor
  binding in `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts:50-65`, and from the
  model-state binding in `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts:95-110` and
  `:165-187`. Those callbacks run synchronously as the respective state dispatch notifies them.
  `ArchiveEditorView.ts:76-92` updates the tree only from its explicit view update and does not
  supply a selected-href state binding.
- `CategoryViewImpl.onUpdate()` calls `driver.update()` synchronously. The sole consumer,
  `src/renderer/editors/category/CategoryEditor.ts`, can reach it from the model-state binding at
  `:122-126`, the page-state subscription at `:146-149`, and the host selection subscription at
  `:303-306`; each calls `syncSurface()`/`applySelectedHref()` and then
  `categoryView.update()` at `:226-234` or `:310-314` while its source state dispatch is active.
- `CategoryViewModel.setDragState()` is called by DOM drag handlers at
  `src/renderer/components/tree-provider/CategoryViewModel.ts:509-519`, `:531-543`, and
  `:545-550`. These handlers are not state-dispatch callbacks. The existing `CategoryViewImpl`
  state binding at `:143-156` observes the resulting state update synchronously.

The chosen answer for sites 1-3 is therefore the documented synchronous consequence at the write
site. Nested state dispatch is explicitly supported by `runInDispatch()`, and no caller reads the
child state or relies on another source-state subscriber completing before these child updates.
The selector-scoped `bind()` answer does not apply: the existing bindings are the upstream
notifications that synchronously pump new props into these child views, while the writes in scope
are consequences of those props or of a DOM drag event, not unobserved derived state.
`afterDispatch()` is rejected for all three sites: it would preserve an unnecessary dispatch-boundary
delay for sites 1-2 and is a no-op scheduling distinction for the DOM-event path at site 3 when no
dispatch is active. No conversion to `afterDispatch()` is planned.

The driver's initial prop pump occurs before `mount()`. For sites 1-2, the synchronous update is
still valid: the state is retained by the model and `VanillaView.bind()` applies the current state
immediately when the view mounts. `CategoryViewModel.loadItems()` begins its loading-state write
before its provider `await` and continues to publish results through its existing async path; this
task does not change that path.

## Implementation Plan

1. Re-read the four target ranges and confirm the scoped inventory before editing. The implementation
   must remove exactly the three deferral callbacks and their three immediately-contained
   `isLive` guards, plus change only the wording at `CategoryViewImpl.ts:102`. Do not introduce an
   `afterDispatch` import unless a new, source-backed ordering dependency is discovered; if one is
   found, stop and update this document before changing code.

2. Update `src/renderer/components/tree-provider/TreeProviderViewModel.ts:adoptSelection`.

   Before:

   ```ts
   /** Deferred selection write - setProps runs during render, so a synchronous
    *  state.update here would trip React's update-while-rendering warning.
    *  External navigation always collapses the selection to the navigated item. */
   private adoptSelection = (hrefs: string[]) => {
       queueMicrotask(() => {
           if (!this.isLive) return;
           if (sameHrefs(this.state.get().selectedValues, hrefs)) return;
           this.state.update((s) => { s.selectedValues = hrefs; });
       });
   };
   ```

   After:

   ```ts
   /** External navigation always collapses the selection to the navigated item. */
   private adoptSelection = (hrefs: string[]) => {
       if (sameHrefs(this.state.get().selectedValues, hrefs)) return;
       this.state.update((s) => { s.selectedValues = hrefs; });
   };
   ```

   Keep the equality check and the selection payload unchanged. The initial restore path at
   `:178-184` and external-navigation path at `:194-202` must both continue to use
   `adoptSelection()`; do not alter the six consumer props contract or `TreeProviderViewImpl`.

3. Update `src/renderer/components/tree-provider/CategoryViewModel.ts:setProps`.

   Before:

   ```ts
   // Deferred - setProps runs during render, where a state write is not allowed.
   Promise.resolve().then(() => {
       if (!this.isLive) return;
       if (providerChanged) this.subscribeWatch();
       if (navigated) this.resetSelection();
       if (seed
           && selectedHref
           && !this.state.get().selectedHrefs.some((h) => sameHref(h, selectedHref))
       ) {
           this.anchorHref = selectedHref;
           this.setSelection([selectedHref]);
       }
       if (first || navigated) void this.loadItems();
   });
   ```

   After:

   ```ts
   // Prop pumping is explicit and synchronous; apply prop-derived model changes at this boundary.
   if (providerChanged) this.subscribeWatch();
   if (navigated) this.resetSelection();
   if (seed
       && selectedHref
       && !this.state.get().selectedHrefs.some((h) => sameHref(h, selectedHref))
   ) {
       this.anchorHref = selectedHref;
       this.setSelection([selectedHref]);
   }
   if (first || navigated) void this.loadItems();
   ```

   Preserve the existing `first`, `providerChanged`, `navigated`, `seed`, and
   `previous*` identity logic. Preserve the `subscribeWatch()` callback guard at `:230-233`,
   because a debounced provider watch can arrive after disposal. Do not add a new guard around
   `await this.props.provider.list(...)` or change `loadItems()`'s existing state writes and error
   handling.

4. Update `src/renderer/components/tree-provider/CategoryViewModel.ts:setDragState`.

   Before:

   ```ts
   private setDragState = (
       update: (s: CategoryViewState) => void,
   ) => {
       // Deferred: a state write straight out of a drag handler can land mid-render.
       queueMicrotask(() => {
           if (!this.isLive) return;
           this.state.update(update);
       });
   };
   ```

   After:

   ```ts
   private setDragState = (
       update: (s: CategoryViewState) => void,
   ) => {
       // Drag handlers run outside state dispatch; publish hover state immediately.
       this.state.update(update);
   };
   ```

   Keep the helper as the single route for drag-state writes. It is called by `onDragEnter`,
   `onDragLeave`, and `clearDragState` (used by `onDrop`), so the change intentionally makes every
   accepted drag hover and clear operation immediate. Do not change `DragEnterCounter`, the
   acceptance checks, `preventDefault()`/`stopPropagation()`, or drop action timing.

5. Reword only the comment at `src/renderer/components/tree-provider/CategoryViewImpl.ts:101-102`.

   Before:

   ```ts
   // The model driver is constructed here, so it is always disposed even if mounting fails
   // or the adapter is disposed before its layout effect runs.
   ```

   After:

   ```ts
   // The model driver is constructed here and owned by this view, so it is disposed even if
   // mounting fails or the view is disposed before mount completes.
   ```

   Leave the two constructor-time `this.own(...)` calls at `:103-104` byte-for-byte unchanged.
   They are the correct ownership mechanism and are not part of the deferral cleanup.

6. Review the final scoped diff for forbidden collateral changes. In particular, do not touch
   `CategoryViewImpl.ts:275-283` (`lastProjection`) or `:378-386`
   (`flushPendingGridRepaintSoon`), which belong to US-1272; do not change either props contract;
   and do not alter `TreeProviderViewImpl.ts`'s honest migration comments at `:371-373` and
   `:383-386`.

7. Verify the implementation with lint/typecheck/build as available, then perform the behavior
   checks in the running app. A green build is not sufficient for the drag timing change. For site 1,
   verify external selection adoption in its shared `TreeProviderViewModel` consumers: Explorer,
   both Archive tree views, the Link editor, and Mneme root (with the sidebar/provider hosts covered
   by their existing tree smoke path). For site 3, verify only the Category editor: folder-row and
   whitespace drag-enter/leave/clear/drop feedback, plus category navigation/reset, provider watch
   setup, cold mount, and disposal while a pending initial load exists.

## Concerns

### Synchronous nested state notifications

The caller trace proves that sites 1-2 can update a child model while a parent state dispatch is
notifying subscribers. This is permitted by `runInDispatch()` and the child bindings are designed
for synchronous notifications. The implementation must capture any mutable values needed before a
state write and must not introduce a new read-after-write dependency. If manual verification finds
an ordering symptom, document the exact source-state subscriber dependency before considering
`afterDispatch()`; do not restore a generic microtask or mechanically convert the site.

### Initial prop pump before mount

Removing site 2's promise means the initial `setProps()` call subscribes to `watch`, seeds/reset
selection, and starts `loadItems()` before `CategoryViewImpl.onMount()` installs its state binding.
The model retains those state values, `bind()` applies the current projection immediately on mount,
and `provider.list()` is awaited before result publication. Cold category-editor mounting must verify
that loading, empty, and populated states still appear correctly.

### Liveness and async work

The three removed `isLive` guards existed solely because their enclosing callbacks could run after
disposal. They may be deleted with their deferrals. The `CategoryViewModel.subscribeWatch()` guard
at `:232` protects a real late provider callback and must remain. No guard currently protects the
post-`await` portions of `loadItems()`; this task neither removes nor invents that separate async
policy.

### Visible drag timing

`CategoryViewModel` is used only by `CategoryViewImpl`, whose sole consumer is
`src/renderer/editors/category/CategoryEditor.ts:229`; `TreeProviderViewModel` has no
`setDragState` or `dropTargetHref`. Therefore this timing change affects the Category editor only.
Direct publication makes `CategoryViewImpl`'s bound `applyState()` run synchronously inside the
DOM drag handler. `dropTargetHref` is the third `lastProjection` term at
`src/renderer/components/tree-provider/CategoryViewImpl.ts:278`, so `projectionChanged` is true and
`renderItems(state)` runs. That does not rebuild the list DOM: `CategoryEditor.renderItems()` at
`:358` updates the stable `activeItems.root` and returns that same node, while
`CategoryViewImpl.ts:303` replaces bridge children only when `rendered !== this.bridge`. The
expensive `gridModel.update({ all: true })` remains deferred in the untouched
`flushPendingGridRepaintSoon()` at `:378-386`. The honest delta is that a throw from this drag
consequence now propagates through the DOM drag handler instead of surfacing from a microtask.
Verify the visual highlight, clear, and drop behavior by actually dragging in the Category editor,
including folder-row and whitespace targets.

### Scope boundaries

This task does not change the `TreeProviderViewImpl` or `CategoryViewImpl` props contracts. The
former is shared by the archive main and secondary views, Explorer, Link editor, Mneme root, and
the sidebar/provider hosts; the latter has one consumer in `editors/category/CategoryEditor.ts`.
The extra shared consumers are why implementation must remain local to the model deferrals and the
constructor comment.

## Acceptance Criteria

- [x] The final source inventory identifies exactly four requested sites and removes exactly three
  deferral wrappers: `TreeProviderViewModel.adoptSelection`, `CategoryViewModel.setProps`, and
  `CategoryViewModel.setDragState`.
- [x] `TreeProviderViewModel.adoptSelection()` writes synchronously, retains its `sameHrefs()`
  no-op check, and preserves both restore and external-navigation call paths.
- [x] `CategoryViewModel.setProps()` synchronously performs the existing watch subscription,
  navigation reset, seed selection, and `loadItems()` start; provider identity guards and async
  loading behavior are unchanged.
- [x] `CategoryViewModel.setDragState()` writes synchronously for every drag-state write, with no
  microtask or generic `afterDispatch()` replacement; accepted drag feedback is visibly immediate
  in the Category editor only.
- [x] Only the three `isLive` guards that directly guarded removed deferral callbacks are deleted.
  `CategoryViewModel.subscribeWatch()`'s late-callback guard remains, and no await/liveness policy
  is changed.
- [x] `CategoryViewImpl.ts:101-104` retains both constructor-time `this.own(...)` calls exactly;
  only the `layout effect` wording is replaced with the constructor/mount-failure meaning.
- [x] No changes are made to `CategoryViewImpl.ts:275-283` (`lastProjection`) or `:378-386`
  (`flushPendingGridRepaintSoon`), and neither tree-provider props contract is changed.
- [x] The honest React-history comments in `TreeProviderViewImpl.ts:371-373` and `:383-386` remain
  intact and serve as the comment style reference.
- [ ] Site 1 verification covers external selection adoption in Explorer, both Archive tree views,
  the Link editor, and Mneme root; site 3 verification covers folder-row and whitespace
  drag-enter/leave/clear/drop feedback in the Category editor only. A green build alone is not
  accepted as evidence.
- [ ] Cold mount, external selection adoption, folder navigation/reset, provider watch setup,
  pending-load disposal, and normal tree selection behavior show no regression in the affected
  running editors.
- [x] Lint, typecheck, and the applicable production build pass after implementation; failures are
  investigated separately from the required manual behavior checks.
- [x] `doc/active-work.md` links its existing US-1271 entry to this README, and the EPIC-082 task
  table links to the same document.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Remove `adoptSelection()`'s stale React comment, `queueMicrotask()`, and only its callback-local `isLive` guard; retain synchronous equality-guarded selection write. | Implementation |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Remove `setProps()`'s stale promise deferral and callback-local guard; remove `setDragState()`'s stale microtask and callback-local guard; retain watch liveness and async loading. | Implementation |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Reword the constructor ownership comment only. | Wording-only implementation |
| `doc/active-work.md` | Turn the existing US-1271 entry under EPIC-082 into a link to this README. | Dashboard link |
| `doc/epics/EPIC-082.md` | Link the existing US-1271 row in the epic task table to this README. | Epic link |
| `doc/tasks/US-1271-tree-provider-false-deferrals/README.md` | Record verified findings, decisions, implementation plan, concerns, and acceptance criteria. | This task document |

Files that need **no changes** in US-1271:

- `src/renderer/core/state/dispatch.ts`, `src/renderer/core/state/state.ts`,
  `src/renderer/core/state/model.ts`, and `src/renderer/uikit/shared/vanilla-view.ts` - these
  files establish the already-verified synchronous lifecycle and dispatch semantics; no new state
  primitive or lifecycle change is needed.
- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` - its props contract, consumer
  behavior, selection projection, and honest migration comments remain unchanged.
- `src/renderer/components/tree-provider/CategoryViewImpl.ts` outside the constructor comment -
  especially `lastProjection`, `flushPendingGridRepaintSoon`, the items bridge, and all props.
- `src/renderer/editors/archive/ArchiveEditorView.ts`,
  `src/renderer/editors/archive/ArchiveSecondaryView.ts`,
  `src/renderer/editors/explorer/ExplorerSecondaryView.ts`,
  `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts`,
  `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts`,
  `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts`, and
  `src/renderer/ui/sidebar/MenuBarView.ts` - these callers were traced for ordering and consumer
  coverage; no caller or props-contract edits are planned.
- `src/renderer/editors/category/CategoryEditor.ts` - its single `CategoryViewImpl` consumer was
  traced for synchronous update paths; no caller or props-contract edits are planned.
- `src/renderer/components/tree-provider/CategoryViewModel.ts:243-271` (`loadItems()` and watch
  callback), all drop-action helpers, and `src/renderer/components/tree-provider/CategoryViewImpl.ts`
  state projection code - these are behavior dependencies of the three local changes, not edit
  targets.
