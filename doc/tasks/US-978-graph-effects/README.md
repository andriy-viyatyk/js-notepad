# US-978: Move graph effects into existing models

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out
**Priority:** Medium
**Epic:** [EPIC-051: De-React Epic P (Preparation)](../../epics/EPIC-051.md)
**Created:** 2026-08-18

## Goal

Move the model-owned effects in the graph editor into its three existing
TComponentModel classes. Keep graph DOM work and the intentionally every-commit
refresh effect in the React view.

This task is split from US-974 because the graph family contains 19 audit
items across three large views and carries the highest render-phase risk in the
remaining model-backed effect surface.

## Background and measured surface

The current anchored scan is:

    rg -n '^\s*(?:React\.)?useEffect\s*\(' src/renderer --glob '*.tsx' --glob '!*.story.tsx'

The graph files contain 22 executable effects:

| File | Effects | Decision |
|---|---:|---|
| src/renderer/editors/graph/GraphBody.tsx | 6 | Move 2 model-owned effects; retain 1 no-deps effect and 3 DOM/view effects. |
| src/renderer/editors/graph/GraphDetailPanel.tsx | 12 | Move all 12 into GraphDetailModel, LinksTabModel, or PropertiesTabModel. |
| src/renderer/editors/graph/GraphLegendPanel.tsx | 4 | Move all 4 into GraphLegendModel. |
| **Total** | **22** | **18 moves, 1 intentional no-deps retention, 3 D8 retentions.** |

The 19 graph-family audit items cited by the US-974 split are the 18 moves plus
the GraphBody no-deps decision. The three graph files already contain inline
models; no new model file or generic effect abstraction is needed.

### Exact effect ownership

GraphBody:

- 281: editor.onDoubleClickNode registration is model-to-model wiring and moves
  to GraphBodyModel lifecycle.
- 316: editor.refreshColors() has no dependency array and runs after every
  React commit. It stays in the view because TComponentModel.effect without a
  dependency factory runs once.
- 295: searchResults/searchQuery reconcile toolbar state and moves with guarded
  model prop synchronization.
- 174: result-row scrollIntoView remains D8.
- 409 and 444: document/window keyboard listeners and focus remain D8.

GraphDetailPanel:

- 322: seed editId/editTitle/idError from the selected node.
- 331: force the info tab when a multi-selection makes links invalid.
- 337: restore/collapse expanded state across selection changes.
- 350: consume the expand request signal.
- 358: consume the collapse request signal.
- 366: emit onPanelExpandedChange.
- 378: expand/highlight linked nodes and clear external hover when inactive.
- 391: clear external highlight/hover on unmount.
- 657: rebuild the links rows and columns from linkedNodes.
- 670: publish external hover from the focused link row.
- 875: rebuild property rows and multi-value metadata from the node selection.
- 906: derive the focused-property status message.

GraphLegendPanel:

- 218: install/remove editor.onHighlightSelection.
- 227: refresh legend descriptions from the editor.
- 240: synchronize editor legend highlighting with expanded/tab/filter/selection state.
- 321: clear debounce timers on unmount.

The existing local hover/focus state in GraphBody, GraphDetailPanel, and
GraphLegendPanel remains D7 view state. It is not part of this task.

## Implementation plan

### 1. Convert GraphBodyModel without changing cadence

Modify src/renderer/editors/graph/GraphBody.tsx.

- Register onDoubleClickNode in GraphBodyModel.init() and clear only the handler
  owned by this model during disposal.
- Move the searchResults/searchQuery toolbar reconciliation into the model.
  Preserve the current behavior: non-empty search results open the results
  panel and reset selectedResultIndex; clearing search closes the results panel
  only when it is currently open.
- Use setProps identity guards or an explicitly deferred liveness-checked write.
  Do not let a model effect synchronously update component state during
  setPropsInternal() render.
- Leave refreshColors() at line 316 in the view unchanged.
- Leave result scrolling and the two document/window keyboard effects unchanged.

Before:

    useEffect(() => {
        if (searchResults?.length) {
            setToolbarPanel("results");
            setSelectedResultIndex(-1);
        } else if (!searchQuery && viewModel.state.get().toolbarPanel === "results") {
            setToolbarPanel("closed");
        }
    }, [searchResults, searchQuery, setToolbarPanel, setSelectedResultIndex, viewModel.state]);

After shape:

    setProps = (props) => {
        const changed = props.model.state.get().searchResults !== this.lastResults
            || props.model.state.get().searchQuery !== this.lastQuery;
        if (!changed) return;
        this.lastResults = props.model.state.get().searchResults;
        this.lastQuery = props.model.state.get().searchQuery;
        queueMicrotask(() => {
            if (!this.isLive) return;
            this.reconcileToolbar();
        });
    };

Use the actual editor state ownership and existing model methods when implementing;
the snippet shows the required guard/defer shape, not a request to duplicate editor
state into GraphBodyState.

### 2. Convert GraphDetailModel and its two tab models

Modify src/renderer/editors/graph/GraphDetailPanel.tsx.

GraphDetailModel:

- Move the edit-field seed, active-tab correction, selection transition,
  expand/collapse request consumption, expanded callback, linked-node
  highlight/hover callback, and unmount cleanup into GraphDetailModel methods and
  lifecycle.
- Preserve the deliberately narrowed dependency slices. Parent callback identity
  must not cause linked-node highlight to re-emit on unrelated parent renders.
- Move hadSelectionRef and wasExpandedRef to model fields if the lifecycle method
  needs them. They are interaction history, not serializable business state.
- Seed edit fields only when the selected node identity/title slice changes; never
  overwrite a user's in-flight edit on a parent object-identity-only render.
- Preserve one-shot expandRequest/collapseRequest semantics and the dirty guard.
- On disposal, clear external highlight/hover exactly once and do not clear a
  newer handler installed by another live graph view.

LinksTabModel:

- Move linkedNodes row/column rebuilding and focused-row external-hover publishing.
- Move rowCounterRef/originalIdsRef to model-owned fields if required by the
  existing apply/dirty handlers.
- Keep callback narrowing: linkedNodes changes rebuild rows; focus row-key changes
  publish hover; parent callback identity alone does not rebuild rows.
- Keep grid column callbacks and dirty state in the existing model state.

PropertiesTabModel:

- Move property-row rebuilding, original-key tracking, multiInfo metadata, and
  focused-property status message.
- Preserve selectionKey as the source change signal and the current multi/single
  extraction behavior.
- Keep status messages derived from the focused row and current multiInfo map.
- Keep row/column/focus/dirty state in the existing model state and preserve all
  apply/batch-apply behavior.

All three models must use existing TComponentModel APIs. Do not add React hooks
to a model and do not create a fourth bridge model.

### 3. Convert GraphLegendModel

Modify src/renderer/editors/graph/GraphLegendPanel.tsx.

- Register editor.onHighlightSelection from GraphLegendModel lifecycle and clear
  it on disposal, preserving the existing callback actions.
- Load editor legend descriptions when the editor identity changes.
- Move editor.setLegendHighlight synchronization into the model. Preserve the
  selected-node, active-tab, selection-filter, checked-level, and checked-shape
  semantics, including clearing the highlight when the legend is collapsed.
- Move debounceTimers into GraphLegendModel and clear all timers in dispose().
- Keep hovered and focusWithin as local D7 state.
- Keep useSyncExternalStore reads of selectedKey/searchQuery as explicit editor
  subscriptions; the model may consume their source values, but no React context
  or new generic subscription bridge is allowed.

### 4. Verify the graph-specific timing and cleanup

- Confirm first mount effects still occur after mount, as they do today.
- Confirm subsequent model prop updates do not synchronously write state during the
  render pass. Use identity guards and defer only the writes that require it.
- Confirm no StrictMode assumption is introduced. The renderer currently mounts
  the root without StrictMode; these model effects must be revisited if StrictMode
  is enabled.
- Verify stale async-free callbacks and timer cleanup on unmount.
- Smoke-test node selection, multi-selection, expand/collapse requests, dirty
  link/property edits, external hover/highlight, legend filtering, graph search
  results, keyboard shortcuts, and graph colors.

## Concerns / Open questions

1. **Render-phase model effects.** setPropsInternal() evaluates registered effects
   during renders after the first. A synchronous TComponentState/Zustand update
   from that subscriber path can produce a warning or render loop. The conversion
   must use guarded setProps logic and liveness-checked microtasks where needed.

2. **No-deps cadence.** GraphBody.tsx:316 cannot be represented by
   TComponentModel.effect() without changing every-commit behavior to once-only.
   It stays in the view by decision.

3. **Callback identity and cleanup ownership.** Several graph callbacks come from
   parents without useCallback. Preserve the current narrowed dependency behavior,
   and on disposal clear only callbacks/timers still owned by the current model.

4. **Refs versus model state.** hadSelectionRef, wasExpandedRef, row counters,
   original-key sets, and multiInfo are mutable interaction/derivation fields.
   They may become model fields, but must not be placed into serializable state
   unless there is a rendering need.

5. **Selection transition ordering.** Multiple current effects respond to related
   selection/expanded/dirty inputs. Register or combine model effects so the
   ordering remains observable: selection changes reconcile expansion before
   external callbacks, and dirty state still blocks collapse.

6. **No unit-test harness.** Verification is typecheck, lint, git diff --check,
   the anchored scan, and focused graph smoke testing.

## Acceptance criteria

- [ ] GraphBodyModel owns the double-click handoff and search-results toolbar
      reconciliation with equivalent behavior and render-safe state writes.
- [ ] GraphBody.tsx:316 remains a view effect with its every-commit cadence;
      :174, :409, and :444 remain D8 view effects.
- [ ] GraphDetailPanel.tsx:322, :331, :337, :350, :358, :366, :378, :391,
      :657, :670, :875, and :906 move to the existing graph models with the
      current dependency narrowing and cleanup behavior.
- [ ] GraphLegendPanel.tsx:218, :227, :240, and :321 move to GraphLegendModel;
      hover/focus state remains local.
- [ ] No new React context, generic callback bridge, model class, or serializable
      DOM/ref state is introduced.
- [ ] Async-free graph callbacks, timer cleanup, expand/collapse requests,
      selection transitions, dirty guards, and external hover/highlight behavior
      remain correct after unmount and remount.
- [ ] npm run typecheck, npm run lint, git diff --check, and focused graph smoke
      checks pass.

## Related

- [EPIC-051: De-React Epic P](../../epics/EPIC-051.md)
- [US-974: Move model-owned effects into TComponentModel.effect()](../US-974-effects-into-model/README.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
- [State management](../../architecture/state-management.md)

## Files Changed Summary

| Change | Files |
|---|---|
| Task documentation | doc/tasks/US-978-graph-effects/README.md |
| Implementation | src/renderer/editors/graph/GraphBody.tsx, src/renderer/editors/graph/GraphDetailPanel.tsx, src/renderer/editors/graph/GraphLegendPanel.tsx |
| No new model files | Existing inline GraphBodyModel, GraphDetailModel, LinksTabModel, PropertiesTabModel, and GraphLegendModel are reused. |
