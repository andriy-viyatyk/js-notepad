# US-1267: De-effect `GraphDetailPanelView`

Epic: [EPIC-082 — React architecture removal at the call sites](../../epics/EPIC-082.md)

Status: Planned

## Goal

Remove the `useEffect` emulation from `src/renderer/editors/graph/GraphDetailPanelView.ts`.
Each of its ten deferred bodies must become a synchronous consequence at the write site, or use
the existing state subscription mechanism if the trigger is state-driven. No `queueMicrotask`,
re-validation guard, or replacement `afterDispatch` call should remain for these consequences.

## Background

### Verified current shape

At the current source (the EPIC-082 measurement was taken at `caacc80a`),
`GraphDetailPanelView.ts` is 645 lines and contains three groups of effect-shaped work:

| Bodies | Current source | Effect body | Current trigger and guards | Replacement answer and proof |
|---:|---|---|---|---|
| 2 | `GraphDetailModel.applySelectionDependencies:96-112` | Restore `expanded` on first selection; clear `expanded` on deselection | Called from `GraphDetailPanelView.runSelectionGate:251-255`; each body rechecks `live` and current node props | **1 — synchronous write-site consequence.** The selection snapshot is already installed by `GraphEditor.handleSelectionChanged:638-661` or `refreshSelectedNodes:663-681`; there is no await or render phase between the prop pump and model state write. |
| 1 | `GraphDetailPanelView.runNodeGate:227-240` | Seed `editId`, `editTitle`, and clear `idError` | `nodes[0].id` / `nodes[0].title`; rechecks the selected node | **1 — synchronous prop derivation.** `VanillaView.update()` has already stored the new props before `onUpdate()` (`vanilla-view.ts:90-99`, assignment at `:95`, hook call at `:97`), so the model can seed from the current single-node snapshot directly. |
| 1 | `GraphDetailPanelView.runTabGate:242-249` | Move an invalid multi-selection `links` tab back to `info` | `isMulti` / `activeTab`; rechecks both values | **1 — synchronous invariant at the prop/state write sites.** Selection count arrives synchronously from `GraphEditor.handleSelectionChanged:638-661`; the tab setter and prop pump can normalize the impossible combination immediately. |
| 1 | `GraphDetailPanelView.runExpandGate:257-265` | Open the panel for an incremented expand request | `expandRequest`; rechecks request identity and selection | **1 — synchronous request consequence.** `GraphBodyModel.incrementExpandRequest:59` is a plain state write, and the request is consumed by the next synchronous detail prop pump; no later ordering is required. |
| 1 | `GraphDetailPanelView.runCollapseGate:267-278` | Close the panel for an incremented collapse request when clean | `collapseRequest`; rechecks request identity and dirty state | **1 — synchronous request consequence.** `GraphBodyView.handleCanvasClick:543-557` first closes the toolbar and then increments the request synchronously; the detail model can apply the same clean-state check inline. |
| 1 | `GraphDetailPanelView.runExpandedCallbackGate:280-287` | Notify `onPanelExpandedChange` | `expanded` / callback identity; rechecks both | **1 — consequence at `setExpanded` and callback-prop writes.** `GraphDetailModel.setExpanded:77-90` is the owner of every panel-expanded state write; the callback is a direct parent field assignment in `GraphBodyView.detailProps:541`, not an operation requiring a later dispatch epilogue. |
| 1 | `GraphDetailPanelView.runLinksGate:289-308` | Expand hidden neighbors and set/clear graph highlighting | `expanded`, `activeTab`, selected node ID, and `linkedNodes`; rechecks all | **1 — synchronous consequence, ordered after the body swap.** `GraphEditor.expandNode:455-467`, `setHighlightSet:333-336`, and `setExternalHover:341-345` are synchronous, but `onExpandNode` can re-enter the graph update path; running this consequence after `bodySwap.set`/`activeBody.update` means the outer `syncState` has no stale body tail. The nested pass terminates because `expandNode` does not write `linkedNodes`; only `handleSelectionChanged:643-657` and `refreshSelectedNodes:675-679` do. |
| 1 | `LinksTabView.syncSeed:593-601` | Rebuild link rows, columns, original IDs, and grid data | `linkedNodes` identity; rechecks the current prop identity | **1 — synchronous model prop derivation.** `LinksTabView` has no await, measurement, or timer; its `DataGridView` can receive the rebuilt rows/columns in the same prop update. |
| 1 | `PropertiesTabView.syncSeed:632` | Rebuild property rows, original keys, multi-value metadata, and grid data | sorted node IDs plus `nodes` identity; rechecks the current prop identity | **1 — synchronous model prop derivation.** `extractMultiProperties`/`extractCustomProperties` are pure synchronous helpers at `:615-618`, and the grid reset is ordinary same-update state/DOM work. |

This is ten `queueMicrotask` bodies: two in the selection model, six in the top-level panel, and
one in each grid tab. The file has nine `DepsGate` instances (seven top-level gates and one seed
gate per grid tab); the tenth `DepsGate` count in the epic's measured reference includes the shared
`DepsGate` type import. The important work count is the ten deferred bodies above.

The current guards are load-bearing only because the work is deferred: `GraphDetailPanelView.live`
is written false during disposal at `:173`; `LinksTabView.live` and `PropertiesTabView.live` are
written false during their disposal paths at `:587` and `:629`; and the bodies read
`driver.model.isLive` as well as prop identity. There is no `await`, Promise continuation, timer,
animation frame, or other asynchronous boundary in these ten paths. `TComponentModel.setProps` is
typed to allow a Promise (`src/renderer/core/state/model.ts:102`), so the guard-removal conclusion
depends on the new `setProps` implementations staying synchronous. If a future edit makes one of
these paths async, its removed `live`/`isLive` guards must be restored (and any guard protecting an
await, Promise continuation, timer, scheduler callback, or third-party callback must remain).

### Relevant write paths and ordering evidence

- `VanillaView.update()` stores new props before calling `onUpdate()`
  (`src/renderer/uikit/shared/vanilla-view.ts:90-99`, assignment at `:95`, hook call at `:97`). `GraphDetailPanelView.onUpdate:181-184`
  then calls `driver.update(props)` and `syncState(...)`; there is no render or commit phase between
  those operations.
- `createComponentModelDriver.update()` assigns the model props and synchronously invokes its
  `setProps` hook when present (`src/renderer/core/state/model.ts:105-108`, reached from
  `ComponentModelDriver.update:178-180`). This is the appropriate
  write-site boundary for prop-derived state and tab/grid data.
- `TOneState.set()` publishes synchronously through `runInDispatch` at
  `src/renderer/core/state/state.ts:72-93`; `runInDispatch` tracks nested depth and drains only at
  depth zero at `src/renderer/core/state/dispatch.ts:37-53`. This proves re-entrant dispatch is
  supported, but it is not by itself a safe stale-snapshot argument; the links consequence has its
  separate after-body-swap ordering and `linkedNodes` termination invariant below.
- `GraphBodyModel.incrementExpandRequest` and `incrementCollapseRequest` are ordinary synchronous
  state writes (`src/renderer/editors/graph/GraphBodyView.ts:54-61`). The collapse caller writes the
  toolbar state and then increments the request synchronously at
  `GraphBodyView.handleCanvasClick:543-557`.
- Selection and linked-node snapshots are written in the same editor-state update by
  `GraphEditor.handleSelectionChanged:638-661`; refresh after a graph mutation is likewise a
  synchronous `state.update` at `GraphEditor.refreshSelectedNodes:663-681`.
- `GraphEditor.expandNode:455-467` performs visibility, renderer, record-count, search, and tooltip
  work synchronously. Its `refreshRecordsCount()` and `recomputeSearch()` writes re-enter the graph
  view before the original `syncState` returns. Therefore the links consequence must run after the
  outer `bodySwap.set`/`activeBody.update`, not before it as `runLinksGate:289-308` currently does.
  This ordering is sufficient here: the nested pass sees the same `linksTabActive`, node ID, and
  `linkedNodes` identity because `expandNode` calls neither `handleSelectionChanged` nor
  `refreshSelectedNodes`. If that changes, the current termination proof no longer holds and the
  new ordering must be revisited.
- `afterDispatch` itself is reserved for a consequence that must not run inside the triggering
  dispatch (`src/renderer/core/state/dispatch.ts:37-53`). The links body has a real ordering problem,
  but ordering it after the body swap solves the stale-snapshot hazard without deferring the whole
  consequence to a dispatch epilogue. The other nine bodies have no proven post-dispatch ordering
  requirement; converting them to `afterDispatch` would preserve the inherited deferral.

### Precedent

EPIC-056 C3-6/C3-7 deliberately removed the React-only microtasks from the UIKit models. In
particular, `src/renderer/uikit/Select/SelectModel.ts:325-359` puts close/reset and open/seed
consequences into the mutators that write `open`, and its lifecycle notes at `:650-674` explain why
the prop pump can derive synchronously, including the constructor-time first pump. The same file
keeps its unrelated focus-event microtask at `:661-663` and documents it as the one surviving
`queueMicrotask` in that file. `MultiSelectModel.closeInto:149-168` follows the same shape for its
close consequence. This task has no analogous focus, Promise, measurement, or third-party boundary,
so it should leave no scheduling call in `GraphDetailPanelView.ts`.

### De-effecting or splitting?

Recommendation: de-effect the existing file without splitting it in US-1267.

The file is long, but its classes form one private ownership chain: `GraphDetailPanelView` owns
`DetailBodyView`, which selects one of the private info, links, or properties views; the tab views
share the local row-extraction/column helpers and their callback types. Only
`GraphDetailPanelView` is exported, and `GraphBodyView.ts:354-388` constructs and owns that one
public boundary. Splitting would make private prop/model types cross file boundaries and would add
no ownership or scheduling seam. The two compressed grid methods should be expanded while moving
their derivation into their models, and the seven top-level gate methods should disappear; that is
the substantive cleanup this task needs. A later organizational split can be considered after the
runtime behavior is verified, but it is not needed to remove the React architecture and would
increase the revert surface of this independently-revertible epic task.

## Implementation Plan

- [x] Refactor `GraphDetailModel` in
  `src/renderer/editors/graph/GraphDetailPanelView.ts:73-118` to own synchronous prop/state
  consequences through its `setProps` and mutation methods:

  - Track the applied selection key, single-node ID/title, expand request, collapse request, and
    callback identity with plain model fields. Use the same values currently compared by the gates;
    do not introduce a generic dependency-array helper.
  - Move the two `applySelectionDependencies` bodies inline. Keep the existing `hadSelection` and
    `wasExpanded` semantics, but remove the `selectionKey`/`live` callback because the current props
    are already the props being processed synchronously.
  - Derive the edit fields synchronously when the single selected node's ID/title changes. Seed the
    initial model state during the initial prop pump, before the first `bind()` application, as the
    Select precedent does for state with no subscribers yet.
  - Enforce the multi-selection/`links`-tab invariant synchronously from the prop pump and from the
    tab setter. Stamp the applied values before any state write so the state binding's nested
    `syncState` cannot repeat the consequence.
  - Handle expand and collapse request changes synchronously in the prop pump, preserving the
    current order (expand request before collapse request), the nonzero-request checks, selection
    requirement, and clean-panel checks. Keep `markExpandedByRequest()` and
    `markCollapsedByRequest()` at the same state-transition sites.
  - Make `setExpanded` the write-site owner of the expanded callback: after an actual expanded
    value change, call the current callback inline. Handle a callback identity change in the
    synchronous prop pump, and invoke the initial callback from the model's mounted lifecycle path
    so construction does not call a parent callback before the view is mounted.
  - Record the sole-writer invariant beside the new setter: `rg -n '\.expanded\s*=' src/renderer/editors/graph/GraphDetailPanelView.ts`
    must continue to find only the setter's `state.expanded = expanded` assignment. Its current
    callers are `toggleExpanded:88-90`, `applySelectionDependencies:102` and `:109`,
    `runExpandGate:262`, and `runCollapseGate:274`; route all of their behavior through that writer
    before deleting the old gate methods.
  - Keep links change detection as a small plain applied-signature record for
    `linksTabActive`, selected node ID, and `linkedNodes` identity. Invoke the consequence from
    `GraphDetailPanelView.syncState` only after its `bodySwap.set`/`activeBody.update` branch has
    completed. Stamp the signature before invoking callbacks, then preserve the current behavior:
    active links invokes `onExpandNode` and highlights the selected node plus linked IDs; inactive
    links clears the highlight and external hover. This ordering prevents the nested graph update
    from applying a stale outer `state`/`nodes` snapshot. The current termination proof is that
    `expandNode` does not write `linkedNodes`; only `handleSelectionChanged:643-657` and
    `refreshSelectedNodes:675-679` do. A future change to `expandNode` that refreshes selection
    would require revisiting this proof before implementation.

- [x] Simplify `GraphDetailPanelView` in
  `src/renderer/editors/graph/GraphDetailPanelView.ts:144-308`:

  - Remove the `DepsGate` import and the seven top-level gate fields.
  - Remove `GraphDetailPanelView.live` and its disposal write only because all top-level deferred
    bodies are gone. Keep the driver's normal disposal and `bodySwap` ownership unchanged.
  - Keep `syncState` responsible for header DOM and body selection/update. It should no longer call
    `runNodeGate`, `runTabGate`, `runSelectionGate`, `runExpandGate`, `runCollapseGate`,
    `runExpandedCallbackGate`, or `runLinksGate`; delete those seven methods rather than replacing
    them with seven synchronous pseudo-effects.
  - Run the links consequence only after the `bodySwap.set`/`activeBody.update` branch has completed.
    Use the plain applied signature described above and stamp it before calling
    `onExpandNode`/highlight callbacks. Do not use `afterDispatch` for this site: the body swap is
    the required ordering boundary, and the current `expandNode`/`linkedNodes` writer separation
    proves the nested pass will not re-fire the consequence.
  - Preserve the `SubtreeSwap` mount/error handling and `DetailBodyView` update flow. Do not alter
    `GraphBodyView.ts` or `GraphLegendPanelView.ts`; those are US-1268.

- [x] Move link-grid seeding to the model write site in
  `src/renderer/editors/graph/GraphDetailPanelView.ts:544-610`:

  - Give `LinksTabModel` a synchronous prop-pump method that detects `linkedNodes` identity,
    rebuilds `seedRows`, `columns`, and `originalIds`, and updates an already-mounted grid with
    `setRows`/`setColumns` before clearing dirty state and notifying `onDirtyChange(false)`.
  - Seed the initial arrays before `LinksTabView` constructs its `DataGridView`, matching the
    current `gridProps()` dependency on `driver.model.columns` and `seedRows`.
  - Remove `LinksTabView.seedGate`, `LinksTabView.live`, the disposal flag write, and
    `syncSeed()`. `onMount()` should mount the driver/bind/grid in the same ownership order, while
    `onUpdate()` only pumps props; no `afterDispatch` or scheduler is needed.

- [x] Move property-grid seeding to the model write site in
  `src/renderer/editors/graph/GraphDetailPanelView.ts:612-640`:

  - Give `PropertiesTabModel` a synchronous prop-pump method using the current fixed dependency
    meaning: sorted node IDs plus the `nodes` array identity. Reproduce the existing reset of the
    row counter, `originalKeys`, and `multiInfo`, then derive multi/single rows and update the
    mounted grid, dirty state, status message, and dirty callback in that order.
  - Expand the current one-line method into readable helpers or model methods while preserving
    `extractMultiProperties`, `extractCustomProperties`, row keys, `_isChanged`, and the current
    `DataGridView` props.
  - Remove `PropertiesTabView.seedGate`, `PropertiesTabView.live`, its disposal flag write, and
    `syncSeed()`. Keep `syncState`, grid editing, invalid-key checks, cancel, and apply behavior
    unchanged except where they now call the shared synchronous seed operation.

- [x] Add comments beside the new model transitions documenting the reason in Persephone terms:
  there is no render/commit phase, prop pumping is synchronous, and the consequence belongs at the
  state/prop write site. Do not describe these changes as layout effects or React effect timing.

- [ ] Verify the resulting implementation with static checks and runtime graph-editor checks:

  - Confirm `GraphDetailPanelView.ts` has no `queueMicrotask`, `DepsGate`, `createDepsGate`, or
    custom `this.live`/`driver.model.isLive` references left for this task, and has no new
    `afterDispatch` conversion.
  - Run the repository lint/type/build checks appropriate to the implementation.
  - In the running graph editor, verify: initial single selection and deselection; switching from
    links to a multi-selection; expand-all/double-click requests; clean and dirty collapse; expanded
    callback updates; links-tab auto-expansion and highlight clearing; linked-node grid refresh and
    cancel/apply; property-grid single and multi selection seeding, mixed-value status, cancel/apply;
    node rename/title updates; rapid selection changes; and disposal while a synchronous update is
    in progress. The graph strand's acceptance evidence is runtime behavior, not a green build.

### Before → after snippets

The following shapes are the intended transformations; exact helper names may be chosen during
implementation, but each preserves the listed write-site ownership.

Current top-level effect:

```ts
if (!this.expandGate.changed([request]) || !request || nodes.length === 0) return;
queueMicrotask(() => {
    if (!this.live || !this.driver.model.isLive
        || this.props.expandRequest !== request || this.props.nodes.length === 0) return;
    this.driver.model.setExpanded(true);
    this.driver.model.markExpandedByRequest();
});
```

Target prop-pump consequence:

```ts
if (request !== this.appliedExpandRequest) {
    this.appliedExpandRequest = request;
    if (request && this.props.nodes.length > 0) {
        this.setExpandedFromRequest();
    }
}
```

Current state-derived selection effect:

```ts
if (restore !== undefined) queueMicrotask(() => {
    if (!live() || this.props.nodes.map((node) => node.id).sort().join(",") !== selectionKey) return;
    this.setExpanded(restore);
});
```

Target synchronous model write:

```ts
if (restore !== undefined) this.setExpanded(restore);
```

Current link-grid seed:

```ts
if (!this.seedGate.changed([linkedNodes])) return;
queueMicrotask(() => {
    if (!this.live || !this.driver.model.isLive || this.props.linkedNodes !== linkedNodes) return;
    // reset rows, columns, originalIds, grid, and dirty state
});
```

Target model prop pump:

```ts
setProps = (): void => {
    const linkedNodes = this.props.linkedNodes;
    if (linkedNodes === this.appliedLinkedNodes) return;
    this.appliedLinkedNodes = linkedNodes;
    this.seedFrom(linkedNodes); // updates model fields and an existing grid synchronously
};
```

Current expanded callback effect:

```ts
queueMicrotask(() => {
    if (!this.live || !this.driver.model.isLive
        || this.driver.model.state.get().expanded !== expanded
        || this.props.onPanelExpandedChange !== callback) return;
    callback?.(expanded);
});
```

Target write-site callback:

```ts
setExpanded = (expanded: boolean): void => {
    if (this.state.get().expanded === expanded) return;
    this.state.update((state) => { state.expanded = expanded; });
    this.props.onPanelExpandedChange?.(expanded);
};
```

## Concerns

- Synchronous state writes cause nested `syncState` calls because `TOneState` notifies
  synchronously. The implementation must update comparison stamps before invoking a setter or parent
  callback, and setters should no-op for unchanged values where the old dependency gate did not
  fire. The re-entrant dispatcher makes the nested pass possible; it does not make a stale outer
  snapshot safe.
- `runLinksGate` invokes `onExpandNode` before the current `syncState` has driven its body. The
  implementation must move this consequence after the body-swap/update branch. The current
  termination invariant is that `GraphEditor.expandNode:456-467` calls neither of the only
  `linkedNodes` writers (`handleSelectionChanged:643-657` and `refreshSelectedNodes:675-679`), so
  the nested pass sees unchanged links dependencies and does not re-fire. A future edit that makes
  `expandNode` refresh selection would invalidate this proof and must be handled before landing.
- The grid seed paths must preserve initial construction ordering: model fields are read by
  `gridProps()` before the grid is constructed, while later prop changes must update an existing
  grid before clearing dirty state. A model-level seed operation keeps both cases in one place.
- `linkedNodes` and `nodes` are intentionally identity-sensitive in the existing gates. Do not
  replace them with deep equality or a selector that allocates arrays; the parent projection in
  `GraphBodyView:78-89` supplies the current snapshot identities.
- No asynchronous boundary survives in these ten paths after the change, and every new `setProps`
  implementation must remain synchronous, so each removed guard is justified by removal of the exact
  microtask it guarded. If a future implementation adds async work, restore the relevant guards. Do
  not use this task as a precedent for guards around async work elsewhere; US-1264's census found
  that most renderer lifetime references remain load-bearing.
- `GraphBodyView.ts` and `GraphLegendPanelView.ts` are explicitly US-1268. If changing this file's
  public props or callback timing forces either file to change, stop and record the dependency here
  rather than widening US-1267.

No open questions remain: the file should be de-effected in place; all ten consequences should run
synchronously at their model/view write sites; and the links consequence should run after the body
swap. No `afterDispatch` call is planned unless a future source change invalidates that ordering
proof.

## Acceptance Criteria

- [ ] `src/renderer/editors/graph/GraphDetailPanelView.ts` remains the sole implementation file
  changed for the graph detail behavior; it contains no `DepsGate` or `queueMicrotask` use for the
  ten former bodies and no mechanically substituted `afterDispatch` calls.
- [ ] The two selection consequences, node seed, tab normalization, expand request, collapse
  request, expanded callback, links consequence, links-grid seed, and properties-grid seed each
  have a documented write-site owner and preserve their current guards/conditions; the links owner
  runs after the body swap for the proven re-entrancy reason.
- [ ] The removed `this.live` and `driver.model.isLive` checks are removed only with their former
  microtasks; no guard protecting an `await`, Promise continuation, timer, scheduler callback, or
  third-party callback is deleted. The new `setProps` paths remain synchronous; if one becomes
  async, its relevant guards are restored.
- [ ] The existing panel/body ownership, `SubtreeSwap` lifecycle, grid editing, dirty-state
  behavior, row identity, original-ID/key tracking, highlight behavior, and callback contracts are
  preserved.
- [ ] No file under `src/renderer/uikit/` is changed. `dispatch.ts` and `scheduling.ts` are read-only
  references for this task; no new scheduling primitive is required.
- [ ] Lint/type/build checks pass, and the running graph editor passes the runtime scenarios listed
  in the implementation plan, including rapid selection changes and disposal.
- [ ] `doc/active-work.md` links the existing EPIC-082 US-1267 entry to this document and keeps it
  `[ ]` until the epic's deferred review model is satisfied.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/editors/graph/GraphDetailPanelView.ts` | Remove the seven top-level gates and two tab seed gates; move all ten consequences into synchronous model/write-site operations; remove only the guards made redundant by removing those microtasks; expand the compressed methods. |
| `doc/active-work.md` | Link the existing EPIC-082 / US-1267 dashboard entry to this task document. |

Files explicitly needing no changes: `src/renderer/editors/graph/GraphBodyView.ts`,
`src/renderer/editors/graph/GraphLegendPanelView.ts`, `src/renderer/core/state/dispatch.ts`,
`src/renderer/core/utils/scheduling.ts`, all files under `src/renderer/uikit/`,
`src/renderer/editors/graph/GraphEditor.ts`, `src/renderer/editors/graph/GraphMutationModel.ts`,
and `doc/epics/EPIC-082.md` (the epic already links and tracks US-1267).
