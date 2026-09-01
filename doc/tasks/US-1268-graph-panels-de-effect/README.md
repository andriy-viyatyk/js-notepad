# US-1268: De-effect the graph panels

Epic: [EPIC-082 — React architecture removal at the call sites](../../epics/EPIC-082.md)

Status: Planned

## Goal

Finish de-effecting the graph editor's remaining call sites in
`src/renderer/editors/graph/GraphBodyView.ts` and
`src/renderer/editors/graph/GraphLegendPanelView.ts`. Replace the two former microtask bodies
with synchronous, ordered consequences or selector-scoped state bindings, while preserving the
timer-backed legend-description persistence and the graph editor's visible behavior.

## Background

### Verified current shape

The EPIC-082 measurement at commit `caacc80a` is confirmed against the current source:

| File | `createDepsGate()` instances | Deferred bodies | `this.live` | `isLive` | Lines |
|---|---:|---:|---:|---:|---:|
| `src/renderer/editors/graph/GraphBodyView.ts` | 1 | 1 | 8 | 1 | 735 |
| `src/renderer/editors/graph/GraphLegendPanelView.ts` | 1 | 2 | 3 | 3 | 699 |

The task's work bodies and replacement answers are:

| Current source | Body | Replacement answer and verified reason |
|---|---|---|
| `GraphBodyView.ts:701-730` | `applyProjection:705-716` opens/closes the Results toolbar and resets the selected result index when `searchResults` or `searchQuery` changes. | **1 — synchronous consequence at the projection write site.** `this.bind(this.editor.state, selectEditorProjection, this.applyProjection)` invokes the projection callback synchronously; the search body has no `await`, timer, measurement, or third-party callback. It must run after the branch/content update, using the current editor state at that point. |
| `GraphLegendPanelView.ts:470-475` | Initial `getLegendDescriptions()` result is copied into model state from a queued microtask. | **1 — synchronous initialization consequence.** `GraphEditor.getLegendDescriptions:356-359` and `GraphDataModel.getLegendDescriptions:211-214` are synchronous, and `ComponentModelDriver.mount:182-186` invokes model `init()` synchronously. Seed the model before installing view bindings. |
| `GraphLegendPanelView.ts:606-628` | `scheduleHighlight()` gates and queues `applyLegendHighlight()` for changes to legend state or the value-comparable selected-node key. | **2 — selector-scoped synchronous state binding.** The triggers are `TOneState` state changes: legend model state and the existing joined `selectedKey`. Keep the key value-comparable; a raw `selectedNodes` array would fire after `refreshSelectedNodes` reallocates equivalent snapshots. No separate dependency gate or deferred revalidation is needed. |

The `GraphLegendModel.scheduleDescription:68-79` path is not one of the two microtask bodies. It is
deliberately timer-backed debouncing of persistence. It already creates its `Delayer` with
`this.schedule.delayer<void>(300)` at `:73`; `OwnerScheduler.delayer:221-231` registers that
delayer with the model's disposable store. Its `this.isLive` check at `:77` protects the timer
callback and must remain. `GraphLegendModel.dispose:81-83` may clear the lookup map, while the
owner scheduler still performs the actual delayer disposal during model unmount.

### State and lifecycle evidence

- `VanillaView.bind()` applies its selector immediately and then subscribes with
  `state.subscribe(guardedApply, selector)` (`src/renderer/uikit/shared/vanilla-view.ts:276-295`).
  The guarded binding itself handles a disposed view; a removed microtask must not be replaced by
  an unrelated lifetime guard.
- `TOneState.subscribe()` evaluates selectors on every dispatch and only invokes the listener when
  `compareSelection()` detects a changed value (`src/renderer/core/state/state.ts:99-115`). Its
  `compareSelection:30-42` treats arrays by identity but recursively compares plain objects and
  compares strings by value. The existing `{ selectedKey, searchQuery }` selector is therefore
  correct: the fresh wrapper is structurally equal when its values are unchanged, and the joined
  key remains equal when a node edit refreshes equivalent selected-node snapshots.
- `TOneState.set/update()` publishes synchronously through `runInDispatch()`
  (`src/renderer/core/state/state.ts:72-93`), and nested updates are supported by the dispatch
  depth/drain logic (`src/renderer/core/state/dispatch.ts:37-53`).
- `createComponentModelDriver.update()` installs props and invokes `setPropsInternal` synchronously
  (`src/renderer/core/state/model.ts:168-186`). Any new model `init`/`setProps` path in this task
  must remain synchronous; the model API permits a Promise return at `model.ts:95-108`, but this
  task must not use that capability.

### GraphBody search consequence and ordering

`GraphEditor.setSearchQuery:381-384` writes `searchQuery` and then calls
`recomputeSearch:408-423`, which synchronously writes `searchInfo` and `searchResults`. Visibility
operations also call `recomputeSearch`, including `GraphEditor.expandNode:455-467`.
`GraphBodyView.applyProjection:701-730` must therefore stamp the applied `(searchResults,
searchQuery)` pair and apply the toolbar consequence after `branchSwap.set` and the active branch
update at `:718-730`. It must unconditionally read `this.editor.state.get()` after that branch
work rather than use the stale `projection` argument: a detail-panel update can re-enter the editor
through `expandNode` while the branch is being updated. `this.projection` has already been
overwritten at `:702-703`, and `previous !== projection` at `:729` is evaluated before the new
consequence runs. The toolbar consequence depends only on the current search state and body-model
state, not on `previous`, so no earlier capture of `previous` is required.

The old gate dependency `[this.editor, searchResults, searchQuery]` can drop `this.editor`. Both
`GraphBodyView.onUpdate:645-648` and `GraphContentView.onUpdate:449-452` reject a different editor
instance, so the editor identity is invariant for this view and is redundant in the signature.

The recursion bound is that `GraphBodyModel.setToolbarPanel:55` and
`setSelectedResultIndex:61` write only the body model state; `applyBodyState:696-699` updates the
active content view and does not write `GraphEditor.state`. The branch update can itself reach the
already-implemented `GraphDetailPanelView` and its `GraphEditor.expandNode` callback, so the
current-state read is part of the ordering proof. A future body-model setter or child update that
writes editor search state would require revisiting this proof.

### GraphLegend highlight ordering and recursion bound

`syncModelState:506-536` updates or swaps the expanded legend subtree before the current
`scheduleHighlight()` call at `:535`; that ordering must remain when the consequence becomes
synchronous. `syncEditorState:538-543` updates the expanded subtree before scheduling the same
work. `GraphEditor.setLegendHighlight:347-350` delegates to
`ForceGraphRenderer.setLegendHighlight:188-192`, which changes a renderer highlight layer and
calls `renderData`; `ForceGraphRenderer.renderData:735-860` reads renderer state and draws the
canvas, without writing `GraphEditor.state` or invoking the selection callback. Thus the
synchronous legend consequence does not re-enter its own state bindings. That renderer behavior
is the recursion bound; a future change that makes `setLegendHighlight` write editor state or fire
selection callbacks would invalidate it.

### Verified selector semantics (no correctness fix)

`GraphLegendPanelView.onMount:464-468` currently binds this selector:

```ts
state => ({
    selectedKey: state.selectedNodes.map((node) => node.id).join(","),
    searchQuery: state.searchQuery,
})
```

The selector is evaluated on every editor-state dispatch and allocates a wrapper object and a joined
string, but that is not a correctness defect. `compareSelection:30-42` recursively compares the
plain object by value and compares the string by value, so the listener does not fire when the IDs
and search query are unchanged. Retain this value-comparable design. In particular, do not replace
`selectedKey` with the raw `state.selectedNodes` array: `GraphEditor.refreshSelectedNodes:663-681`
reallocates that array and fresh node snapshots after every node edit while preserving the IDs, and
an array-identity selector would re-run legend highlighting for those equivalent snapshots. No
performance measurement currently justifies changing the small map+join cost; any future concern
must be established by profiling selector CPU time and selection sizes before altering this
behavior.

### Verified detail callback allocation in GraphBody

`GraphContentView.sync:470-489` calls `this.detail.update(this.detailProps())` at `:484` on every
content pump. `detailProps:541` currently creates fresh closures for every callback. The completed
`GraphDetailPanelView` compares `onPanelExpandedChange` identity in
`GraphDetailModel.setProps:126-186` and invokes a changed callback on a mounted pump at `:185`;
therefore this parent currently reports the same expanded value on every content pump. Stable
callback fields in `GraphContentView` can preserve the same editor/model operations while stopping
that false callback-identity churn. This belongs in US-1268 because the allocation site is in
`GraphBodyView.ts`; it does not require changing `GraphDetailPanelView.ts`.

## Implementation Plan

- [x] Refactor the search consequence in `src/renderer/editors/graph/GraphBodyView.ts:600-735`:

  - Remove the `createDepsGate`/`DepsGate` import and `searchGate` field. Keep the outer
    `GraphBodyView.live` lifecycle field because its theme binding is a synchronous subscription
    guard, and keep `GraphContentView.live` because `handleExpandAll:581-587` has an awaited
    confirmation dialog. Do not remove the `live` guard at `GraphContentView:584`.
  - Add a plain applied signature for the `searchResults` array identity and `searchQuery` value,
    initially `undefined`, so the first immediate projection pump retains the old gate behavior
    (`depsChanged(undefined, next)` is true). The old gate's `this.editor` dependency is redundant
    because both `GraphBodyView.onUpdate:645-648` and `GraphContentView.onUpdate:449-452` reject a
    different editor instance; compare only `[searchResults, searchQuery]`. Stamp the signature
    before either body-model setter.
  - At the end of `applyProjection`, after `branchSwap.set` and the created/updated branch has
    finished (`:718-730`), **always** read the current `this.editor.state.get()` and apply the old
    conditions: non-empty results select the Results toolbar and reset the selected result index to
    `-1`; an empty query closes the Results toolbar if it is still active. Do not use the
    `projection` callback argument for this consequence: it may be stale after nested
    detail/renderer work.
  - Keep this synchronous and do not use `afterDispatch`: the branch update is the real ordering
    boundary, while the current-state read handles the already-proven synchronous re-entry through
    `GraphDetailPanelView` → `GraphEditor.expandNode` → `recomputeSearch`. The body-model setters
    do not write editor state, which bounds the new nested pass.
  - Remove only the `this.live` and `this.driver.model.isLive` checks that protected the deleted
    search microtask. No timer/await/third-party callback guard is removed.

- [x] Stabilize `GraphContentView.detailProps()` callbacks in
  `src/renderer/editors/graph/GraphBodyView.ts:334-542` without changing
  `GraphDetailPanelView.ts`:

  - Declare and initialise stable fields for the callbacks currently allocated at `:541`:
    mutation updates/batches, rename, link/property apply operations, dirty and expanded state
    reporting, graph highlight/external-hover updates, and node expansion. Initialise them after
    `this.editor = props.editor` and before constructing `this.detail` so their closures capture
    the same fixed editor instance.
  - Make `detailProps()` return those stable fields while continuing to allocate the props record
    and preserving `containerRef`, `expandRequest`, `collapseRequest`, and the existing callback
    argument/return contracts. The parent already rejects a different editor at `onUpdate:449-452`,
    so this does not widen callback behavior to another editor.
  - Verify that `GraphDetailModel.setProps:132-185` now sees a stable callback identity across
    ordinary content pumps; `onPanelExpandedChange` must still run on actual transitions and the
    mounted initial lifecycle path.

- [x] Refactor `src/renderer/editors/graph/GraphLegendPanelView.ts:45-699`:

  - Add a synchronous `GraphLegendModel.init()` that copies the current
    `this.props.editor.getLegendDescriptions()` into `{ levels: { ... }, shapes: { ... } }` through
    the model state before view bindings are installed. `driver.mount()` invokes `init()`
    synchronously, so remove the `queueMicrotask` at `:471-474` and its `GraphLegendPanelView.live`
    field/disposal write. The copied model state must be present for the immediate
    `syncModelState` binding.
  - Retain the selector at `:465-468` as the correct value-comparable trigger. Do not replace its
    joined `selectedKey` with a raw `state.selectedNodes` selector: `refreshSelectedNodes:663-681`
    reallocates equivalent snapshots with the same IDs after node edits, and array identity would
    cause unnecessary highlight work. The existing selector's fresh plain object is recursively
    value-compared by `compareSelection:30-42`; only the map+join CPU cost is incurred on each
    selector evaluation. Use the current editor state when building `expandedProps` and keep the
    joined-key trigger semantics unchanged.
  - Keep the expanded subtree update before the synchronous legend highlight consequence. Replace
    `highlightGate`/`scheduleHighlight()` with an applied signature containing the value-comparable
    joined selected-node key, `expanded`, `activeTab`, `selectionFilter`, `checkedLevels`, and
    `checkedShapes`. Compare the signature in the existing state-binding path, stamp it before
    calling `applyLegendHighlight`, and call it synchronously after `expandedView.update()` or a
    subtree mount. This preserves first-bind behavior with an initially undefined signature and
    avoids repeated canvas renders for description-only state changes without loosening the
    `refreshSelectedNodes` behavior.
  - Keep `GraphLegendModel.scheduleDescription:68-79` as a 300 ms owner-bound Delayer using
    `this.schedule.delayer<void>(300)`. Do not replace it with a raw timer or a microtask, and keep
    `this.isLive` inside its timer callback. The timer survives the synchronous de-effecting because
    it is intentional persistence debouncing and is cancelled by owner disposal.
  - Do not use `afterDispatch`: `setLegendHighlight` is synchronous renderer work with no required
    post-dispatch ordering, and the renderer's state-write absence is the recorded recursion bound.

- [x] Add Persephone-native comments beside the new transitions. State that prop pumping and model
  initialization are synchronous, that no render/commit phase exists, and why the consequence is
  ordered after the branch/subtree update. Do not describe these paths as layout effects or React
  effect timing.

- [ ] Verify statically and in the running graph editor before implementation is considered done:

  - Confirm the two target files contain no `createDepsGate`, `DepsGate`, or `queueMicrotask` for
    these former bodies; GraphBody's awaited confirmation guard, GraphContent lifecycle guard, and
    GraphLegend's timer `isLive` guard remain for their exact asynchronous boundaries. Confirm no
    `afterDispatch` replacement was added.
  - Run the repository lint/type/build checks appropriate to the implementation, but treat them as
    supplementary; a green build is not runtime evidence.
  - Open the read-only fixture `docs/examples/greek-gods.fg.json` (63 nodes, 87 links) and verify
    the legend panel: collapsed/expanded visibility; Selection, Level, and Shape tab switching;
    checked/unchecked level and shape visibility toggles; root/group rows where present; grouping
    on/off refreshes the available legend rows; selection-menu Highlight opens the Selection tab,
    selects the selected filter, and follows single, multi, and cleared selection; search mode and
    clearing search preserve the correct legend branch. Use a throwaway fixture for description
    edits or any other operation that writes graph JSON; never modify the documentation example.
  - In the same read-only fixture, verify the body: canvas click with the detail panel closed goes to
    the renderer; clicking the canvas while a clean detail/toolbar panel is open closes it and
    collapses the detail panel; dirty detail state blocks collapse; Physics, Expansion, and Results
    toolbar panels open/switch/close; search results open Results and reset its cursor; double-click
    expand requests and toolbar Expand All behave; node badge/collapse paths still update visible
    records and search state; and detail expand/collapse requests still reach the unchanged detail
    panel contract. Use a throwaway fixture for edits required to exercise dirty/apply behavior.
  - Exercise rapid search/selection/grouping changes and dispose/switch the graph editor while a
    synchronous update is in progress. Confirm no stale toolbar, legend highlight, unhandled
    Delayer rejection, or post-disposal callback appears.

### Before → after snippets

GraphBody's current deferred search consequence at `applyProjection:705-716`:

```ts
if (this.searchGate.changed([this.editor, searchResults, searchQuery])) {
    queueMicrotask(() => {
        if (!this.live || !this.driver.model.isLive) return;
        const current = this.editor.state.get();
        if (current.searchResults !== searchResults || current.searchQuery !== searchQuery) return;
        if (searchResults && searchResults.length > 0) {
            this.driver.model.setToolbarPanel("results");
            this.driver.model.setSelectedResultIndex(-1);
        } else if (!searchQuery && this.driver.model.state.get().toolbarPanel === "results") {
            this.driver.model.setToolbarPanel("closed");
        }
    });
}
```

Target ordered, current-state consequence after the branch update:

```ts
const current = this.editor.state.get();
const signature = { searchResults: current.searchResults, searchQuery: current.searchQuery };
if (this.appliedSearch?.searchResults !== signature.searchResults
    || this.appliedSearch?.searchQuery !== signature.searchQuery) {
    this.appliedSearch = signature;
    if (current.searchResults && current.searchResults.length > 0) {
        this.driver.model.setToolbarPanel("results");
        this.driver.model.setSelectedResultIndex(-1);
    } else if (!current.searchQuery && this.driver.model.state.get().toolbarPanel === "results") {
        this.driver.model.setToolbarPanel("closed");
    }
}
```

GraphLegend's current allocating selector and deferred highlight:

```ts
this.bind(this.editor.state, (state) => ({
    selectedKey: state.selectedNodes.map((node) => node.id).join(","),
    searchQuery: state.searchQuery,
}), this.syncEditorState);
// scheduleHighlight() gates deps and queues applyLegendHighlight(...)
```

Target retained value-comparable selector and synchronous consequence:

```ts
this.bind(this.editor.state, (state) => ({
    selectedKey: state.selectedNodes.map((node) => node.id).join(","),
    searchQuery: state.searchQuery,
}), this.syncEditorState);
// syncModelState updates the expanded subtree, then stamps the joined-key signature
// and calls applyLegendHighlight(...) synchronously.
```

GraphLegend's current initial seed:

```ts
const legend = this.editor.getLegendDescriptions();
queueMicrotask(() => {
    if (!this.live || !this.model.isLive || this.editor !== this.props.editor) return;
    this.model.setDescriptions({ levels: { ...legend.levels }, shapes: { ...legend.shapes } });
});
```

Target synchronous model initialization:

```ts
init(): void {
    const legend = this.props.editor.getLegendDescriptions();
    this.setDescriptions({ levels: { ...legend.levels }, shapes: { ...legend.shapes } });
}
```

## Concerns

- Synchronous consequences run inside the dispatch that caused the state change. The GraphBody
  search consequence is intentionally placed after branch creation/update and reads the current
  editor state because detail-panel updates can synchronously re-enter through
  `GraphEditor.expandNode:456-467` and `recomputeSearch:408-423`. Its applied signature must be
  written before `setToolbarPanel`/`setSelectedResultIndex`; otherwise a nested body update could
  repeat the consequence. The body-model setters do not write editor state, which is the recursion
  bound recorded above.
- The legend highlight consequence must stamp its signature before `applyLegendHighlight`. Its
  renderer path currently cannot re-enter the legend state bindings because
  `ForceGraphRenderer.setLegendHighlight:188-192` only updates a renderer layer and draws. If that
  path later writes editor state, the ordering and termination proof must be revisited.
- `GraphLegendModel.scheduleDescription` is intentionally asynchronous. `OwnerScheduler` owns the
  `Delayer` and cancels it on model disposal, but the callback's `isLive` guard remains necessary
  for the timer boundary. Clearing the map must not be mistaken for replacing the owner cleanup.
- `GraphDetailPanelView.ts` is already implemented under US-1267 and must not be modified. Stable
  callback identities are supplied by `GraphBodyView.ts` only; if the completed detail-panel
  contract changes, stop and record the dependency before widening this task.
- New `setProps`/`init` work must stay synchronous. `TComponentModel.setProps` permits a Promise,
  but guard removal in this task relies on no Promise continuation, timer, animation frame,
  measurement, or third-party callback being introduced into either former microtask path.
- The graph example is user-facing documentation. Runtime checks that edit descriptions, nodes, or
  links require a throwaway copy; `docs/examples/greek-gods.fg.json` remains read-only.

No open questions remain. The search consequence uses answer 1 at the ordered projection write
site; legend initialization uses answer 1 at model initialization; legend highlighting uses answer
2 through direct state selectors; `afterDispatch` is not planned. The only asynchronous path kept
is the owner-bound description Delayer, including its `isLive` guard.

## Acceptance Criteria

- [ ] `src/renderer/editors/graph/GraphBodyView.ts` has no `createDepsGate`, `DepsGate`, or
  `queueMicrotask` for search-panel synchronization. The search consequence runs synchronously
  after the branch/content update, reads current editor state, stamps before model writes, and
  preserves initial-pump, open-Results, selected-index reset, and close-Results conditions.
- [ ] `GraphBodyView.ts` retains `GraphContentView.live` for the awaited confirmation path and does
  not remove any guard protecting an await, timer, scheduler callback, or third-party callback.
  Stable detail callback fields eliminate false callback-identity changes without changing the
  `GraphDetailPanelView` props contract or modifying `GraphDetailPanelView.ts`.
- [ ] `src/renderer/editors/graph/GraphLegendPanelView.ts` seeds descriptions synchronously during
  model initialization, removes only the two microtask-specific view lifetime guards, and contains
  no `createDepsGate`, `DepsGate`, or `queueMicrotask` for the former bodies.
- [ ] Legend state synchronization retains the existing selector-scoped `{ selectedKey, searchQuery
  }` projection. `compareSelection:30-42` makes its fresh plain object and joined string
  value-comparable, so it does not fire when IDs/query are unchanged. The implementation must not
  replace the joined key with raw `selectedNodes` identity because `refreshSelectedNodes:663-681`
  reallocates equivalent snapshots after node edits; selection-driven highlight behavior remains
  value-based. Any optimization of map+join is optional and requires profiling evidence first.
- [ ] Legend highlighting is synchronous, ordered after expanded subtree update, signature-stamped
  before renderer calls, and does not use `afterDispatch`. The level, shape, selection,
  selected-with-children, not-selected, empty-filter, collapsed, and multi-layer highlight behavior
  remains intact.
- [ ] `GraphLegendModel.scheduleDescription` continues to use
  `this.schedule.delayer<void>(300)`, persists the latest value after the debounce, and retains its
  `this.isLive` timer guard. No raw timer or unowned Delayer is introduced.
- [ ] No file under `src/renderer/uikit/` is changed, and
  `src/renderer/editors/graph/GraphDetailPanelView.ts` is unchanged. `GraphEditor.ts`,
  `GraphDataModel.ts`, `ForceGraphRenderer.ts`, `src/renderer/core/state/dispatch.ts`,
  `src/renderer/core/utils/scheduling.ts`, and the Greek-gods fixture remain read-only references.
- [ ] Lint/type/build checks pass, and runtime verification in the running graph editor passes the
  concrete legend scenarios (visibility/toggle state, grouping refresh, tabs, selection-menu
  highlight, selection churn, search branch) and body scenarios (canvas click/collapse, dirty
  collapse protection, Physics/Expansion/Results toolbar panels, search result reset,
  expand-all/double-click requests, and expand/collapse updates). Disposal and rapid updates show
  no stale UI, post-disposal callback, or unhandled Delayer rejection.
- [ ] Runtime verification uses `docs/examples/greek-gods.fg.json` read-only for its 63-node,
  87-link graph and a throwaway fixture for writes. The document's checklist is updated with the
  actual running-app evidence before the epic's deferred review model is satisfied.
- [ ] The existing EPIC-082 dashboard entry and the EPIC-082 task table link to this document while
  remaining `[ ]`/Planned under the epic.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/editors/graph/GraphBodyView.ts` | Remove the search `DepsGate`/microtask; apply the current-state search consequence after branch updates; retain load-bearing lifecycle guards; stabilize detail-panel callback identities. |
| `src/renderer/editors/graph/GraphLegendPanelView.ts` | Seed descriptions synchronously; replace the highlight gate/microtask with ordered selector-driven synchronous work; replace the allocating selection trigger; retain owner-bound Delayer and timer guard. |
| `doc/active-work.md` | Link the existing EPIC-082 US-1268 dashboard entry to this task document. |
| `doc/epics/EPIC-082.md` | Link the US-1268 row in the epic task table to this document. |
| `doc/tasks/US-1268-graph-panels-de-effect/README.md` | Record verified investigation, implementation plan, concerns, acceptance criteria, and file scope. |

Files explicitly needing no changes: `src/renderer/editors/graph/GraphDetailPanelView.ts`,
`src/renderer/editors/graph/GraphEditor.ts`, `src/renderer/editors/graph/GraphDataModel.ts`,
`src/renderer/editors/graph/ForceGraphRenderer.ts`, `src/renderer/core/state/dispatch.ts`,
`src/renderer/core/state/model.ts`, `src/renderer/core/state/state.ts`,
`src/renderer/core/utils/scheduling.ts`, all files under `src/renderer/uikit/`, and
`docs/examples/greek-gods.fg.json`.
