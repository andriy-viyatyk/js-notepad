# US-1193 — Delete the hooks-emulation surface from `TComponentModel`

## Goal

Remove the unused React-shaped effect, prop-mapping, and unmount-hook surface from
`src/renderer/core/state/model.ts` while preserving the existing vanilla model lifecycle and all
observable behaviour. Keep `memo()`/`IMemo` and `depsChanged` intact, with `memo()` explicitly
marked for removal in Epic B.

This document is planning-only. No implementation, tests, test harnesses, or dashboard changes
are part of US-1193.

## Background

### Preconditions verified after US-1192

The current worktree contains the landed US-1192 settings conversion and other pre-existing user
changes. The following checks were run against the current tree before planning this deletion:

| Check | Result |
|---|---|
| `this.effect(` / `this.effect<` registrations under `src/renderer` | **0** |
| `setPropsInternal`, `_initInternal`, or `onUnmountInternal` call sites outside `src/renderer/core/state/` | **0 code call sites**; the only outside matches are the stale comments recorded below in `SelectModel.ts` and `TreeModel.ts` |
| Post-US-1192 settings changes | Present in the worktree; US-1192's README and EPIC-075 Notes record its manual and type/lint/build verification |

The first two conditions required by the epic are therefore true. US-1193 can remove the base
surface without converting remaining effect registrations or view-owned internal lifecycle calls.

### Current `TComponentModel` contract and removal boundary

`src/renderer/core/state/model.ts` currently contains:

- `EffectRegistration` at lines 16-22 and the `_effects` registry at lines 98-99.
- `mapProps` and `onUnmount` optional members at lines 93-94.
- `hasRegisteredEffects` at lines 101-104, read once by `createComponentModelDriver.mount()` at
  lines 269-273.
- `effect()` at lines 106-125, `memo()` at lines 127-148, and `_evaluateEffects()` at lines
  150-180.
- `setPropsInternal()` at lines 182-187, `_initInternal()` at lines 189-195, and
  `onUnmountInternal()` at lines 197-207.

The task touches only the effect/map-prop/on-unmount regions of this file:

1. Delete `EffectRegistration`, `_effects`, `hasRegisteredEffects`, `effect()`, and
   `_evaluateEffects()`.
2. Delete `mapProps` and assign incoming props directly in `setPropsInternal()`.
3. Keep `oldProps` and `isFirstUse` byte-for-byte in purpose and placement; they belong to
   US-1194 and must not be redesigned here.
4. Keep `setPropsInternal()`'s `setProps?.(this.props)` call.
5. Make `_initInternal()` retain its `_initCalled` guard and reduce to calling `init()` once.
6. Make `onUnmountInternal()` retain `isLive = false` and `dispose?.()`, while removing effect
   cleanup and the `onUnmount?.()` dispatch. The three concrete `onUnmount` implementations are
   moved to `dispose()` as described below.
7. Remove only the `hasRegisteredEffects` throw branch from `createComponentModelDriver.mount()`.
   The driver still calls `_initInternal()` once and still calls `onUnmountInternal()` on dispose.

The `isFirstUse` / `oldProps` regions are deliberately excluded. US-1194 owns their three readers
and will run against the same file.

US-1193 lands before US-1195. The exact `onUnmountInternal()` shape after US-1193 is:

```ts
onUnmountInternal = () => {
    this.isLive = false;
    this.dispose?.();
};
```

US-1195 then rebases its inherited `DisposableStore` drain onto this shape. US-1195 makes
`dispose()` non-optional, so the optional call changes to `this.dispose()` there, not in US-1193;
US-1193 must not implement any part of that store-drain change.

### Evidence: `mapProps`

The renderer-wide exact-identifier search found only the base declaration and its current use in
`src/renderer/core/state/model.ts:93,184`; it found **0 model implementers**. There is no model
whose props are transformed before `setProps()` receives them. Removing the hook therefore changes
no model's observed props: `setPropsInternal()` will assign the incoming `props` object directly,
then call `setProps?.(this.props)` as it does today after mapping.

This is a safe deletion for every model because there are no implementers to preserve.

### Evidence: `onUnmount` and disposal ordering

There are **3 renderer-wide model implementers** of `onUnmount`:

| Implementer | Current behaviour | Preservation plan |
|---|---|---|
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts:152-154` | Calls `props.onModel?.(null)`. Its existing `dispose()` at `:257-260` unsubscribes `watchSubscription`. `onUnmountInternal()` currently calls `dispose()` before `onUnmount()`. | Add the `onModel?.(null)` callback at the end of `dispose()`, after `watchSubscription` teardown, preserving the current ordering. This merged body is a disposal hook and does not call `super`; after US-1195, `onUnmountInternal()` drains the inherited store independently, so the subclass does not need to delegate. |
| `src/renderer/editors/graph/GraphDetailPanelView.ts:114-117` (`GraphDetailModel`) | Calls `onHighlightSet?.(null)` and `onExternalHover?.("")`. The model has no separate `dispose()` today. | Rename the callback to `dispose()`; there is no existing model cleanup to reorder, and the same two callbacks run during driver disposal. This merged body does not call `super`; US-1195's independent store drain covers inherited cleanup even when a subclass override omits it. |
| `src/renderer/uikit/ListBox/ListBoxModel.ts:289-291` | Calls `props.onModel?.(null)`. The model has no separate `dispose()` today. | Rename the callback to `dispose()`; the same host notification runs when the driver disposes the model. This merged body does not call `super`; US-1195 drains the inherited store independently from `onUnmountInternal()`. |

No other renderer model implements `onUnmount`. The current `onUnmountInternal()` order is
`isLive = false` → effect cleanup → `dispose()` → `onUnmount()`. After this task it becomes the
exact three-line shape above: `isLive = false` → `dispose()`, with the three callback bodies
incorporated into `dispose()` so their effective cleanup ordering remains unchanged. US-1195 then
adds its independent inherited-store drain around that `dispose()` call and removes `?.` when its
required base method lands.

### Evidence: `hasRegisteredEffects` and `_evaluateEffects`

`hasRegisteredEffects` has **1 reader**, exclusively
`src/renderer/core/state/model.ts:269` in the `createComponentModelDriver.mount()` throw branch.
The getter declaration itself is not a reader. US-1192 verified zero effect registrations, so the
branch has no remaining runtime purpose and can be deleted with the getter.

`_evaluateEffects` has exactly two callers, both in the same class:

| Caller | Current call | Behaviour after removal |
|---|---|---|
| `TComponentModel.setPropsInternal()` | `src/renderer/core/state/model.ts:185` | Assign `oldProps`, assign the incoming props directly, then invoke `setProps?.(this.props)` once. No effect evaluation occurs. |
| `TComponentModel._initInternal()` | `src/renderer/core/state/model.ts:194` | Keep the `_initCalled` guard, set it before initialization, and call `init?.()` once. No second effect pass occurs; this method reduces to “call `init()` once”. |

US-1192 moved all eight settings effect behaviours into explicit model `init()` / `setProps()` or
view update paths. No remaining caller relies on the deleted evaluator.

### Evidence: `depsChanged`

`depsChanged` must remain exported from `src/renderer/core/state/model.ts:8-14`. Its only
renderer importer is `src/renderer/uikit/shared/deps-gate.ts:1`, and that gate calls it at
`deps-gate.ts:37`. The gate intentionally preserves the old slot-by-slot `Object.is` comparison:
`undefined` or a length mismatch reports changed, and each slot is compared by identity/value.
Deleting the old evaluator must not delete, rename, or alter this comparator.

After the effect runtime is removed, `depsChanged` remains the shared primitive that makes a
vanilla `DepsGate` behaviour-identical to the former dependency comparison by construction.

### `memo()` / `IMemo` are explicitly retained

`IMemo` at `src/renderer/core/state/model.ts:24-26` and `TComponentModel.memo()` at `:135-148`
remain untouched except for an annotation naming **Epic B** as their removal point. The current
20 `this.memo(...)` call sites are in these eight UIKit models:

- `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`
- `src/renderer/uikit/ListBox/ListBoxModel.ts`
- `src/renderer/uikit/Menu/MenuModel.ts`
- `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts`
- `src/renderer/uikit/MultiSelect/MultiSelectModel.ts`
- `src/renderer/uikit/Popover/PopoverModel.ts`
- `src/renderer/uikit/Select/SelectModel.ts`
- `src/renderer/uikit/Tree/TreeModel.ts`

Their memo implementation and call sites are not part of US-1193. The annotation should explain
that memo survives Epic A and is removed in Epic B with the props pump, as required by EPIC-075
A-3.

### Stale comment census

The requested searches across `src/renderer` found these references in comments or documentation:

| Path and lines found now | Required treatment |
|---|---|
| `src/renderer/core/state/model.ts:5,189,250-251` | Remove the effect wording from the `depsChanged` comment; rewrite the `_initInternal` and driver comments without `useComponentModel` / React terminology. The effect API comments disappear with `effect()`. |
| `src/renderer/uikit/shared/deps-gate.ts:7-9` | Describe the gate as direct vanilla prop-change detection; remove the claim that the driver refuses registered effects. |
| `src/renderer/uikit/Select/SelectModel.ts:144-145,643-657` | Describe first-prop-pump and explicit lifecycle semantics without `effect()`, `setPropsInternal`, or React render-phase language. |
| `src/renderer/uikit/Tree/TreeModel.ts:528-531,808-813` | Describe synchronous model mutation and the host repaint funnel without the deleted effect/render-phase machinery. |
| `src/renderer/uikit/ListBox/ListBoxModel.ts:229-231,277-283` | Keep the repaint-signature explanation, but remove historical `effect()` and driver-refusal wording. Rename the callback at `:289` to `dispose()`. |
| `src/renderer/uikit/Tree/TreeDndModel.ts:143-147` | Keep the drag repaint rationale, but explain it in terms of the model mutation funnel and native event path. |
| `src/renderer/editors/file-diff/FileDiffBodyModel.ts:71-73` | Keep the state-subscription rationale and replace the obsolete render-driven-effect contrast. |
| `src/renderer/editors/browser/BrowserWebviewModel.ts:147,166,171` | Replace `useEffect` lifecycle descriptions with the current native view lifecycle terms. |
| `src/renderer/components/git-tree/GitTreeModel.ts:8-9` | Replace `useComponentModel` with the owner-controlled lifecycle description already expressed by the next clause. |
| `src/renderer/automation/commands.ts:184-185` | Describe the asynchronous webview navigation gap without claiming a React state update/effect. |
| `src/renderer/uikit/Tree/TreeView.ts:103` and `src/renderer/uikit/ListBox/ListBoxView.ts:97` | Keep the load-bearing registration-order rationale exactly: child/grid views are disposed before the driver. Replace only the stale `onUnmount` wording with “driver disposal reports `onModel(null)` to the host”; do not delete these comments. |
| `src/renderer/uikit/CLAUDE.md:341,428-429,450-457` | Update the UIKit model contract and prop-gating guidance to remove the deleted `effect()` API and driver refusal, while retaining the `DepsGate` / `depsChanged` rules. |

The `BoardEditorModel.ts:132` phrase “mount effect” is a generic frame-mount description and does
not refer to `TComponentModel.effect()` or a React `useEffect`; it needs no change for this task.

## Implementation Plan

1. **Delete the hooks-emulation members in `src/renderer/core/state/model.ts`.**

   - Remove `EffectRegistration`, `TComponentModel._effects`, `hasRegisteredEffects`, `effect()`,
     and `_evaluateEffects()`.
   - Remove `mapProps` and change only the assignment in `setPropsInternal()` to use the incoming
     object directly. Preserve `oldProps`, `isFirstUse`, `isLive`, the `setProps` call, and the
     method's return value; do not refactor adjacent US-1194 state.
   - Keep `_initCalled` and make `_initInternal()` call `init?.()` once, with no evaluator call.
   - Remove the effect-cleanup loop and `onUnmount?.()` call from `onUnmountInternal()`, leaving
     `isLive = false` followed by `dispose?.()`.
   - Remove the `hasRegisteredEffects` check and throw from
     `createComponentModelDriver.mount()`. Keep driver construction's initial prop pump,
     `mount()`'s `_initInternal()` call, update forwarding, and disposal forwarding unchanged.

   Before → after for `setPropsInternal()`:

   ```ts
   // Before
   this.oldProps = this.props;
   this.props = this.mapProps ? this.mapProps(props) : props;
   this._evaluateEffects();
   return this.setProps?.(this.props);

   // After
   this.oldProps = this.props;
   this.props = props;
   return this.setProps?.(this.props);
   ```

   Before → after for initialization and disposal:

   ```ts
   // Before
   this.init?.();
   this._evaluateEffects();

   // After
   this.init?.();
   ```

   ```ts
   // Before
   for (const effect of this._effects) {
       effect.cleanup?.();
       effect.cleanup = undefined;
   }
   this._effects = [];
   this.dispose?.();
   this.onUnmount?.();

   // After
   this.dispose?.();
   ```

2. **Preserve all three `onUnmount` behaviours through `dispose()`.**

   - In `src/renderer/components/tree-provider/TreeProviderViewModel.ts`, fold
     `props.onModel?.(null)` into the end of the existing `dispose()` after the watch subscription
     is released. Add a code comment at the merge site stating that `props.onModel?.(null)` must
     remain the last statement: `TreeView.ts:103` and `ListBoxView.ts:97` document child disposal
     before this host notification. Do not touch the `isFirstUse` / `oldProps` logic; it is US-1194
     scope. This override must not call `super.dispose()`; US-1195's `onUnmountInternal()` store
     drain is independent of subclass disposal overrides.
   - In `src/renderer/editors/graph/GraphDetailPanelView.ts`, rename `GraphDetailModel.onUnmount`
     to `dispose` without changing either callback or its values. It must not call `super.dispose()`;
     the later US-1195 lifecycle drains the inherited store independently.
   - In `src/renderer/uikit/ListBox/ListBoxModel.ts`, rename `onUnmount` to `dispose` without
     changing the `onModel(null)` callback. It must not call `super.dispose()`; the later US-1195
     lifecycle drains the inherited store independently.
   - Update the corresponding driver-disposal comments in `TreeView.ts` and `ListBoxView.ts`.
     The driver remains registered after children so children are disposed before the model's
     host callback, preserving the documented FIFO ordering.

   Before → after for the tree-provider model:

   ```ts
   // Before
   onUnmount = () => {
       this.props.onModel?.(null);
   };

   dispose = () => {
       this.watchSubscription?.unsubscribe();
       this.watchSubscription = undefined;
   };

   // After
   dispose = () => {
       this.watchSubscription?.unsubscribe();
       this.watchSubscription = undefined;
       // Keep props.onModel?.(null) as the last statement: child views dispose before the host notification.
       this.props.onModel?.(null);
   };
   ```

3. **Retain and annotate the surviving comparison/memo utilities.**

   - Leave `depsChanged()` exported and behaviourally identical, with
     `src/renderer/uikit/shared/deps-gate.ts` remaining its only renderer importer.
   - Add a documentation annotation to `IMemo` and/or `TComponentModel.memo()` stating that
     memo survives Epic A and is removed in **Epic B** with the props pump. Do not change the memo
     implementation, its return type, or any of the 20 call sites.

   Before → after annotation shape:

   ```ts
   // Before
   export interface IMemo<V> {
       readonly value: V;
   }

   // After — documentation only
   /**
    * Cached model computation retained for Epic A; Epic B removes it with the props pump.
    */
   export interface IMemo<V> {
       readonly value: V;
   }
   ```

4. **Sweep stale renderer comments and UIKit guidance.**

   Update the exact files and locations in the stale-comment census. Preserve each comment's
   useful behavioural rationale, but remove references to `useComponentModel`, React render phase,
   `useEffect`, `TComponentModel.effect()`, and the driver refusing effects. In particular, the
   cited `model.ts:189,250`, `SelectModel.ts:654`, and `TreeModel.ts:529` comments must no longer
   describe machinery removed by this task. Keep comments that refer to unrelated generic mount
   effects, such as `BoardEditorModel.ts:132`, unchanged.

5. **Verify the deletion boundary without adding tests.**

   - Confirm there are no renderer-wide `this.effect(` registrations and no exact identifiers
     `EffectRegistration`, `_evaluateEffects`, `hasRegisteredEffects`, or `mapProps` remaining.
   - Confirm no concrete model or comment uses the removed `onUnmount` hook; the internal method
     `onUnmountInternal()` remains the driver boundary for this task.
   - Confirm `depsChanged` is still exported and imported by `uikit/shared/deps-gate.ts`, and the
     20 memo call sites remain unchanged.
   - Confirm no code outside `src/renderer/core/state/` calls
     `setPropsInternal`, `_initInternal`, or `onUnmountInternal`.
   - Review the diff specifically to ensure `isFirstUse` and `oldProps` are untouched and that
     no settings, event, driver, or test-harness files were changed.
   - Run the repository's normal available static checks during implementation, but add no unit
     tests or test harnesses. Manual runtime verification belongs to the already-verified US-1192
     settings work and is not expanded by this mechanical contract deletion.

## Concerns

- **Disposal callback ordering:** `onUnmountInternal()` currently runs `dispose()` before
  `onUnmount()`. Folding the three callbacks into `dispose()` must preserve teardown-before-host
  notification, especially for `TreeProviderViewModel`, which has an existing subscription to
  release first.
- **US-1195 sequencing:** US-1193 lands first with the exact three-line `onUnmountInternal()`
  shape shown above. US-1195 rebases its independent inherited-store drain onto that shape and
  removes `dispose?.()`'s optional chaining only when its required base `dispose()` exists. Do not
  add `DisposableStore`, `super.dispose()`, or any other US-1195 change here.
- **`setPropsInternal()` ordering:** The direct props assignment must remain after `oldProps` is
  captured and before `setProps()` runs. `isFirstUse` and `oldProps` are deliberately not touched;
  US-1194 owns their replacement and any related ordering changes.
- **Initialization ordering:** `createComponentModelDriver()` still pumps initial props before
  `mount()`. Removing `_evaluateEffects()` must not move or duplicate `setProps()` or `init()`;
  `_initInternal()` remains guarded and calls `init()` once.
- **Comparator dependency:** `depsChanged` is no longer used by the removed effect evaluator, but
  it remains a live dependency of `DepsGate`. Removing it or changing its `Object.is` / length
  semantics would change vanilla view repaint gates.
- **Memo scope:** `memo()` and `IMemo` are intentionally retained. Only their Epic B annotation
  may be added; conversion or call-site edits belong to the later props-pump work.
- **Existing worktree changes:** US-1192 and other user changes are already present. Implementation
  must be limited to the files and regions listed here and must not overwrite or dashboard-edit
  those changes.

There are no unresolved open questions for implementation.

## Acceptance Criteria

- [ ] `src/renderer/core/state/model.ts` contains no `EffectRegistration`, `_effects`,
      `effect()`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, or `onUnmount` member.
- [ ] `TComponentModel.setPropsInternal()` captures `oldProps`, assigns incoming props directly,
      and calls `setProps?.(this.props)` exactly once; `isFirstUse` and `oldProps` remain otherwise
      unchanged for US-1194.
- [ ] `TComponentModel._initInternal()` retains its once-only guard and reduces to one `init()`
      call; `onUnmountInternal()` retains `isLive = false` and `dispose?.()` without effect cleanup.
- [ ] US-1193 lands before US-1195 with `onUnmountInternal()` exactly as
      `isLive = false;` followed by `this.dispose?.();`; US-1195 alone rebases its independent
      store drain and removes the optional chaining after making `dispose()` required.
- [ ] `createComponentModelDriver.mount()` has no `hasRegisteredEffects` throw branch and keeps
      its existing initial pump, mount, update, and disposal boundaries.
- [ ] The three identified `onUnmount` implementers preserve their callbacks through `dispose()`:
      Tree Provider unsubscribes before the last-statement `onModel(null)` notification, while
      Graph Detail and ListBox retain their existing host notifications without `super.dispose()`;
      US-1195's independent store drain covers all three overrides.
- [ ] `depsChanged` remains exported and unchanged, and
      `src/renderer/uikit/shared/deps-gate.ts` remains its importer and consumer.
- [ ] `IMemo`, `TComponentModel.memo()`, and all 20 memo call sites are behaviourally untouched;
      an annotation names Epic B as the removal point.
- [ ] The stale comments/docs listed in the census are rewritten without references to the
      removed hooks surface, React render-phase machinery, `useComponentModel`, or `useEffect`.
- [ ] Renderer-wide verification reports zero `this.effect(` registrations, zero exact removed
      identifiers, zero concrete `onUnmount` hook implementations, and no internal lifecycle
      call sites outside `src/renderer/core/state/`.
- [ ] No unit tests or test harnesses are added, `doc/active-work.md` is unchanged, and the final
      diff does not touch the US-1194 `isFirstUse` / `oldProps` regions.

## Files Changed

| Path | Planned change |
|---|---|
| `src/renderer/core/state/model.ts` | Delete the effect registry/API, `mapProps`, `hasRegisteredEffects`, and base `onUnmount` dispatch; simplify internal lifecycle methods and the driver throw branch; retain `depsChanged`, `memo()`, `IMemo`, `isFirstUse`, and `oldProps`, adding only the Epic B memo annotation. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Move the `onModel(null)` unmount notification to the end of `dispose()` after watch teardown. |
| `src/renderer/editors/graph/GraphDetailPanelView.ts` | Rename `GraphDetailModel.onUnmount` to `dispose` without changing the host callbacks. |
| `src/renderer/uikit/ListBox/ListBoxModel.ts` | Rename the model's `onUnmount` callback to `dispose` and remove stale effect-lifecycle wording. |
| `src/renderer/uikit/Tree/TreeView.ts` | Update the stale driver-disposal ordering comment. |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Update the stale driver-disposal ordering comment. |
| `src/renderer/uikit/shared/deps-gate.ts` | Documentation-only cleanup of the removed effect/driver-refusal references; retain the import and comparator use. |
| `src/renderer/uikit/Select/SelectModel.ts` | Documentation-only cleanup of first-pump and lifecycle comments. |
| `src/renderer/uikit/Tree/TreeModel.ts` | Documentation-only cleanup of synchronous mutation and lifecycle comments. |
| `src/renderer/uikit/Tree/TreeDndModel.ts` | Documentation-only cleanup of the drag repaint rationale. |
| `src/renderer/editors/file-diff/FileDiffBodyModel.ts` | Documentation-only cleanup of the obsolete render-driven-effect contrast. |
| `src/renderer/editors/browser/BrowserWebviewModel.ts` | Documentation-only replacement of stale `useEffect` lifecycle references. |
| `src/renderer/components/git-tree/GitTreeModel.ts` | Documentation-only replacement of the stale `useComponentModel` reference. |
| `src/renderer/automation/commands.ts` | Documentation-only replacement of stale React navigation/effect wording. |
| `src/renderer/uikit/CLAUDE.md` | Update the UIKit model contract and prop-gating guidance for the post-effect-runtime contract. |

Files that need **NO changes**:

- `doc/active-work.md` — the user will handle the dashboard.
- `doc/epics/EPIC-075.md` — the epic already defines US-1193 and its A-1/A-3 scope; no epic edit is needed.
- `doc/tasks/US-1192-settings-detox/README.md` — US-1192 is a completed prerequisite and its record is evidence, not a target.
- `doc/tasks/US-1195-disposable-store/README.md` — US-1195 is the dependent store-drain task; US-1193 records its sequencing but does not modify or implement it.
- `src/renderer/editors/settings/` and its section models — US-1192 removed the remaining effect registrations and internal lifecycle callers; US-1193 only consumes that verified state.
- Memo implementations/call sites in `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`, `src/renderer/uikit/Menu/MenuModel.ts`, `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts`, `src/renderer/uikit/MultiSelect/MultiSelectModel.ts`, `src/renderer/uikit/Popover/PopoverModel.ts`, and `src/renderer/uikit/Tree/TreeModel.ts` — these regions need no changes; memo is retained and only its base annotation changes in `model.ts`.
- `src/renderer/api/settings.ts`, `src/renderer/api/internal.ts`, `src/renderer/core/state/events.ts`, and `src/ipc/renderer/renderer-events.ts` — settings/event primitives are not part of this contract deletion.
- Test directories and test harness configuration — this project does not use unit tests for this work, and none may be introduced.
