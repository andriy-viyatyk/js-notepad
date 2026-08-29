# US-1194 — Retire `isFirstUse` / `oldProps` from `TComponentModel`

Epic: [EPIC-075 — Post-De-React Epic A: core contracts](../../epics/EPIC-075.md)

## Goal

Remove the generic `isFirstUse` and whole-object `oldProps` fields from
`src/renderer/core/state/model.ts`. Replace the three verified reader sites with small,
model-owned snapshots of the named props they actually compare, preserving first-update timing
and the existing tree-provider and menu behavior.

This is a planning document only. No implementation or test harness is part of US-1194.

## Background

### Verified scope and renderer-wide census

The measured Epic A baseline identifies three reader files. A fresh renderer-wide search confirms
the following executable references:

| Field | Read occurrences | Files and locations | Non-read occurrences |
|---|---:|---|---|
| `isFirstUse` | **3** | `src/renderer/components/tree-provider/CategoryViewModel.ts:157`; `src/renderer/components/tree-provider/TreeProviderViewModel.ts:157,190` | Declaration at `src/renderer/core/state/model.ts:90`; driver write at `src/renderer/core/state/model.ts:254` |
| `oldProps` | **8** | `src/renderer/components/tree-provider/CategoryViewModel.ts:158,160,161,171`; `src/renderer/components/tree-provider/TreeProviderViewModel.ts:180,183,192`; `src/renderer/uikit/Menu/MenuModel.ts:88` | Declaration at `src/renderer/core/state/model.ts:89`; write at `src/renderer/core/state/model.ts:183` |

Thus there are **11 field-read occurrences in 3 reader files**. The only additional
`oldProps` matches are explanatory comments in `src/renderer/uikit/Select/SelectModel.ts:229`
and `:654`, and `src/renderer/uikit/Tree/TreeModel.ts:529`; they are not reads and need no
change. There are no other `isFirstUse` reads in `src/renderer`.

### The current props-pump ordering

`src/renderer/core/state/model.ts:setPropsInternal` currently performs these operations in this
order:

```text
oldProps = this.props
→ this.props = props
→ _evaluateEffects()
→ setProps?.(props)
```

The actual assignment is `this.props = this.mapProps ? this.mapProps(props) : props`; no reader
model overrides `mapProps`, so the semantic ordering above is exact for these readers. During
`setProps`, `oldProps` is therefore the previous props and `this.props` is the new props.

The constructor path in `createComponentModelDriver` is also load-bearing:

```ts
const controlModel = createModel(model, TComponentState, defaultState);
controlModel.setPropsInternal(props);
controlModel.isFirstUse = false;
```

The first pump invokes `setProps` while `isFirstUse` is still `true`; the driver writes `false`
only after that pump returns. Consequently, a driver-owned model sees `false` from its very first
driver-owned update. A model constructed by hand can enter `setProps` with `isFirstUse === true`.
The replacement must infer the first call from an absent local previous-value snapshot, capture
all previous values into locals, compute every comparison, immediately assign the new snapshot,
and only then run the existing branches. The first later update therefore compares against the
constructor snapshot.

The exact current regions in `src/renderer/core/state/model.ts` touched by this task are:

- `TComponentModel` declarations at `:87-96`: remove only `oldProps` and `isFirstUse`.
- `setPropsInternal` at `:182-187`: remove only the `this.oldProps = this.props` write; retain
  the props assignment, effect call, and `setProps` call in their existing order.
- `createComponentModelDriver` at `:241-264`: remove only `controlModel.isFirstUse = false`.

The `effect`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, and `onUnmount` regions
belong to US-1193 and are explicitly outside this task. `memo()` and `IMemo` belong to Epic B
and are also outside this task. No view should be changed to call a model internal as part of
US-1194.

Before:

```ts
export class TComponentModel<T, P> extends TModel<T> {
    props!: P;
    oldProps?: P;
    isFirstUse = true;
    // ...
}

setPropsInternal = (props: P) => {
    this.oldProps = this.props;
    this.props = this.mapProps ? this.mapProps(props) : props;
    this._evaluateEffects();
    return this.setProps?.(this.props);
};

controlModel.setPropsInternal(props);
controlModel.isFirstUse = false;
```

After (shape; preserve the surrounding US-1193-owned members and operations):

```ts
export class TComponentModel<T, P> extends TModel<T> {
    props!: P;
    // ...
}

setPropsInternal = (props: P) => {
    this.props = this.mapProps ? this.mapProps(props) : props;
    this._evaluateEffects();
    return this.setProps?.(this.props);
};

controlModel.setPropsInternal(props);
```

The `After` snippet removes only this task's generic snapshot and first-use writes; it does not
authorize deleting or reordering the props mapping/evaluation/callback operations owned by the
adjacent US-1193 work.

### Reader 1: `CategoryViewModel.setProps`

File: `src/renderer/components/tree-provider/CategoryViewModel.ts`.

The `CategoryViewProps` definition at `:103-135` establishes the relevant fields: required
`provider`, required `category`, optional `selectedHref`, and optional `multiSelect`.
`setProps` at `:155-189` reads these previous values:

| Current expression | Decision |
|---|---|
| `this.isFirstUse` at `:157` | Defines `first`, which makes the constructor pump initialize the model and prevents a first-pump navigation reset. |
| `this.oldProps?.provider !== this.props.provider` at `:158` | Makes `providerChanged`; a first call or provider identity change resubscribes the provider watcher. |
| `this.oldProps?.category !== this.props.category` at `:160` and `this.oldProps?.provider !== this.props.provider` at `:161` | Makes `navigated` after the first call; a category or provider identity change resets local selection and reloads items. |
| `this.oldProps?.selectedHref !== selectedHref` at `:171` | Allows a multi-select view to seed the incoming primary selection when it changed externally; the deferred callback avoids a state write during render. |

The early return at `:173` means an update with no first-use, navigation, or selection-seed work
does nothing. A replacement must still record the current `provider`, `category`, and
`selectedHref` on that invocation; otherwise the next comparison would use a stale snapshot.

Proposed local state is deliberately named and narrow:

```ts
private previousProvider: ITreeProvider | undefined;
private previousCategory: string | undefined;
private previousSelectedHref: string | undefined;
```

`previousProvider === undefined` is the first-call test because `provider` is required. This
preserves both cases: the driver's constructor pump is first, and a hand-constructed model's
first `setProps` call is first. The first driver-owned update then sees `first === false` and
compares the new values with the constructor snapshot.

Before:

```ts
setProps = () => {
    const first = this.isFirstUse;
    const providerChanged = first || this.oldProps?.provider !== this.props.provider;
    const navigated = !first && (
        this.oldProps?.category !== this.props.category
        || this.oldProps?.provider !== this.props.provider
    );
    // ...
    const seed = multiSelect
        && !!selectedHref
        && (first || navigated || this.oldProps?.selectedHref !== selectedHref);
    if (!first && !navigated && !seed) return;
    Promise.resolve().then(() => { /* existing deferred work */ });
};
```

After (shape; retain the existing deferred callback body):

```ts
setProps = () => {
    const props = this.props;
    const previousProvider = this.previousProvider;
    const previousCategory = this.previousCategory;
    const previousSelectedHref = this.previousSelectedHref;
    const { selectedHref, multiSelect } = props;
    const first = previousProvider === undefined;
    const providerChanged = first || previousProvider !== props.provider;
    const navigated = !first && (
        previousCategory !== props.category
        || previousProvider !== props.provider
    );
    // ...
    const seed = multiSelect
        && !!selectedHref
        && (first || navigated || previousSelectedHref !== selectedHref);

    this.previousProvider = props.provider;
    this.previousCategory = props.category;
    this.previousSelectedHref = selectedHref;

    if (first || navigated || seed) {
        Promise.resolve().then(() => { /* existing deferred work */ });
    }
};
```

The new fields must be read into locals and every comparison must be computed before the fields
are overwritten. Assign the new values immediately after those computations and before the
no-work check or any deferred action, so even an invocation that takes no action advances the
snapshot.

### Reader 2: `TreeProviderViewModel.setProps`

File: `src/renderer/components/tree-provider/TreeProviderViewModel.ts`.

The relevant props are defined at `:63-92`: required `provider`, optional `showLinks`, optional
`selectedHref`, and optional `initialState`. `setProps` at `:156-196` reads:

| Current expression | Decision |
|---|---|
| `this.isFirstUse` at `:157` | Runs initial expansion restoration (`initialState.expandedPaths`), initial selection restoration, `initializeTree()`, and the first watcher subscription. |
| `this.oldProps?.provider !== this.props.provider` at `:180` | On a later provider identity change, resubscribes the watcher and rebuilds the tree, preserving effective expansion through `buildTree`. |
| `this.oldProps?.showLinks !== this.props.showLinks` at `:183` | On a later display-filter change, recomputes `displayTree`; it does not rebuild the provider data. |
| `!this.isFirstUse` at `:190` and `this.props.selectedHref !== this.oldProps?.selectedHref` at `:192` | On a later non-null external selection change, schedules `adoptSelection([selectedHref])`, which updates the selected row and lets the view reveal it. A null `selectedHref` intentionally does not clear selection. |

Proposed local state is:

```ts
private previousProvider: ITreeProvider | undefined;
private previousShowLinks: boolean | undefined;
private previousSelectedHref: string | undefined;
```

Again, `previousProvider === undefined` is the first-call test because `provider` is required.
The first driver-owned update must use `first === false` and compare against the constructor
pump's snapshot. A hand-constructed model's first call still takes the initialization branch.

Before:

```ts
setProps = () => {
    if (this.isFirstUse) {
        // restore initial state, initializeTree(), subscribeWatch()
    } else if (this.oldProps?.provider !== this.props.provider) {
        this.subscribeWatch();
        this.buildTree();
    } else if (this.oldProps?.showLinks !== this.props.showLinks) {
        this.recomputeDisplayTree();
    }
    if (!this.isFirstUse
        && this.props.selectedHref
        && this.props.selectedHref !== this.oldProps?.selectedHref
    ) {
        this.adoptSelection([this.props.selectedHref]);
    }
};
```

After (shape; retain the existing initialization and selection bodies):

```ts
setProps = () => {
    const props = this.props;
    const previousProvider = this.previousProvider;
    const previousShowLinks = this.previousShowLinks;
    const previousSelectedHref = this.previousSelectedHref;
    const first = previousProvider === undefined;
    const providerChanged = !first && previousProvider !== props.provider;
    const showLinksChanged = previousShowLinks !== props.showLinks;
    const selectedHrefChanged = props.selectedHref !== previousSelectedHref;

    this.previousProvider = props.provider;
    this.previousShowLinks = props.showLinks;
    this.previousSelectedHref = props.selectedHref;

    if (first) {
        // restore initial state, initializeTree(), subscribeWatch()
    } else if (providerChanged) {
        this.subscribeWatch();
        this.buildTree();
    } else if (showLinksChanged) {
        this.recomputeDisplayTree();
    }
    if (!first
        && props.selectedHref
        && selectedHrefChanged
    ) {
        this.adoptSelection([props.selectedHref]);
    }
};
```

The snapshot assignments follow all captured comparisons but precede every branch and action.
The branches then use only the captured locals and `props`, preserving provider-change expansion
restoration, the `selectedHref` reveal path, and the deliberate first-call distinction.

### Reader 3: `MenuModel.setProps`

File: `src/renderer/uikit/Menu/MenuModel.ts`.

`MenuProps` at `:24-33` supplies the relevant `open` boolean and `items` array. `setProps` at
`:87-113` reads only those two fields from `oldProps`:

| Current expression | Decision |
|---|---|
| `previous?.open !== true` at `:90` | `opening` is true when the menu transitions from not-open/unknown to open; it clears search/submenu state and selects the incoming selected item. |
| `previous?.open === true` at `:91` | `closing` is true on an open-to-closed transition; it resets all menu state and clears the submenu timer. |
| `previous?.items !== props.items` at `:92` | `itemsChanged` uses array identity; an open menu updates its selected hover row when items change, and a closed menu resets when its initial item set changes. |
| `previous === undefined` at `:94` | Treats the first closed update as a reset even without a prior `open` value. |

There is no `isFirstUse` read in `MenuModel`; the undefined `oldProps` snapshot supplies the
first-call behavior. The replacement therefore needs only `previousOpen` and `previousItems`.

Before:

```ts
setProps = (): void => {
    const previous = this.oldProps;
    const props = this.props;
    const opening = props.open && previous?.open !== true;
    const closing = !props.open && previous?.open === true;
    const itemsChanged = previous?.items !== props.items;
    if (closing || (!props.open && (previous === undefined || itemsChanged))) {
        this.state.set({ ...defaultMenuState });
        this.clearSubTimer();
        return;
    }
    if (props.open && (opening || itemsChanged)) {
        // existing selected-item update
    }
};
```

After (shape; retain the existing state update body):

```ts
private previousOpen: boolean | undefined;
private previousItems: MenuItem[] | undefined;

setProps = (): void => {
    const props = this.props;
    const previousOpen = this.previousOpen;
    const previousItems = this.previousItems;
    const opening = props.open && previousOpen !== true;
    const closing = !props.open && previousOpen === true;
    const itemsChanged = previousItems !== props.items;
    const reset = closing || (!props.open && (previousOpen === undefined || itemsChanged));

    this.previousOpen = props.open;
    this.previousItems = props.items;

    if (reset) {
        this.state.set({ ...defaultMenuState });
        this.clearSubTimer();
    } else if (props.open && (opening || itemsChanged)) {
        // existing selected-item update
    }
};
```

The previous fields are captured and all transition comparisons are computed before the fields
are overwritten. The immediate assignments then make the reset/open branches safe without an
early-return workaround; a closed-to-open update still detects a reopened menu, while a
subsequent update compares against the immediately preceding `open` and `items` values.

## Implementation Plan

1. Update `src/renderer/components/tree-provider/CategoryViewModel.ts` in `CategoryViewModel.setProps`.
   Add the three named previous-value fields, read them into locals, derive `first` from the
   required provider snapshot, compute the four comparisons, and immediately assign the new
   values before any branch or action. Preserve the existing `subscribeWatch`, `resetSelection`,
   `setSelection`, and `loadItems` deferred behavior and do not alter unrelated selection or
   disposal code.

2. Update `src/renderer/components/tree-provider/TreeProviderViewModel.ts` in
   `TreeProviderViewModel.setProps`. Add previous `provider`, `showLinks`, and `selectedHref`
   fields; replace both `isFirstUse` reads and the three named comparisons; compute all comparison
   booleans from captured locals; and immediately assign the new snapshot before the decision
   branches. Preserve `initializeTree`, `subscribeWatch`, `buildTree`, `recomputeDisplayTree`,
   and `adoptSelection` behavior exactly.

3. Update `src/renderer/uikit/Menu/MenuModel.ts` in `MenuModel.setProps`. Add previous `open` and
   `items` fields, replace the `oldProps` read, compute all transition booleans from captured
   locals, assign the new snapshot immediately, and keep the existing reset/open branches without
   a trailing-assignment restructuring. Preserve state reset, selected-item hover, search
   clearing, submenu clearing, and timer clearing.

4. Update only the three specified regions of `src/renderer/core/state/model.ts`: delete the two
   base fields, delete the `oldProps` write in `setPropsInternal`, and delete the constructor-pump
   write in `createComponentModelDriver`. Do not modify `effect`, `_evaluateEffects`,
   `hasRegisteredEffects`, `mapProps`, `onUnmount`, `memo`, `IMemo`, or any other props-pump logic.
   If US-1193 lands first and changes surrounding lines, reapply these removals against its
   result without touching its regions.

5. Perform the renderer-wide static sweep after implementation:

   - `rg -n 'isFirstUse' src/renderer` returns no matches.
   - `rg -n 'oldProps' src/renderer` returns no executable matches; any retained comments must not
     claim a live field.
   - `TComponentModel` no longer declares either field.
   - No `memo()`/`IMemo` code or any US-1193 hook/effect region was changed.

6. Run the project's normal lint/build verification appropriate to the implementation branch.
   Do not add unit tests or a test harness; the required behavior checks are manual running-app
   checks below.

## Concerns

### Resolved: assignment timing and early returns

The local snapshot is a previous-value record, not a cache of the current values for use before
comparison. The safe sequence is: read each previous field into a local; compute every comparison
from those locals and the new `props`; immediately assign the new values to the fields; then run
the existing branches and actions. Assigning before capture/comparison makes every comparison
self-equal and is especially silent in `TreeProviderViewModel`: provider replacement would skip
`buildTree`, `showLinks` changes would skip `recomputeDisplayTree`, and external `selectedHref`
changes would skip `adoptSelection`.

Assigning only at the end is also wrong because `oldProps` was written on every pump, while two
readers can return before the end. In `CategoryViewModel`, for example, take this real sequence:

1. `multiSelect` is false and `selectedHref` changes from A to B. `seed` is false, so the current
   early return at `:173` is taken.
2. With an end-only snapshot, `previousSelectedHref` remains A.
3. `multiSelect` later becomes true while `selectedHref` remains B. `oldProps.selectedHref` would
   already be B and would correctly suppress seeding; the stale local A would incorrectly make
   `seed` fire.

Therefore the fields must be assigned immediately after all comparisons are computed and before
any early return or action. `MenuModel` should use the same sequence and needs no branch
restructuring solely to reach a trailing assignment.

### Resolved: first-use semantics without a base flag

All three relevant models have a required `provider` only in the two tree models; that required
object is the safe first-call sentinel there. `MenuModel` has no first-use flag and can use an
undefined `previousOpen`/`previousItems` snapshot. This preserves the driver's constructor pump
and the first later update, while also giving hand-constructed models an initial call with the
same first-use behavior.

### Resolved: concurrent US-1193 edits in `model.ts`

US-1194 removes only `oldProps`/`isFirstUse` declarations and their two associated writes. It does
not touch the effect runtime, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, or
`onUnmount`; it does not touch `memo()`/`IMemo`. The implementation must avoid broad formatting or
refactoring in `src/renderer/core/state/model.ts` so US-1193 can land without a semantic merge.

### Manual verification limitations and concrete checks

There are no automated tests in this project. Verify the three presence behaviors in a running
development build as follows:

1. **Provider change restores expansion.** Open a `.link.json` collection with nested categories
   so the Collections tree is visible. Expand a nested category with the chevron. Open a second
   `.link.json` collection with a matching nested category while the sidebar's Collections panel
   remains mounted. Observe that the matching category remains expanded and its children are
   present after the provider-backed tree is rebuilt. This is the visible expansion-preservation
   contract for the provider-change branch; do not substitute the File Explorer **Make Root** flow,
   which intentionally clears `ExplorerEditor.treeState` before creating the new root.

2. **`selectedHref` is revealed.** Keep the File Explorer sidebar open with a nested folder
   collapsed or with the target file below the current scroll position. Open a file under that
   Explorer root from the main editor (for example, use **File → Open** or select another file
   tab). Observe that the Explorer expands/reveals the selected file and highlights its row. The
   observable result is the `TreeProviderViewModel.setProps` external-selection path that calls
   `adoptSelection` and then the view's `revealItem` flow.

3. **A menu detects reopening.** Open the Link Editor view-mode menu from its list/tiles toolbar
   button, dismiss it with Escape or by clicking outside, and open it again. Observe that the
   current mode remains marked selected and the menu opens with a clean submenu/search state.
   The same close/open transition can be checked in the Storybook **Menu** story by clicking
   **Open menu**, dismissing it, and clicking **Open menu** again. During review, confirm the
   `MenuModel.setProps` breakpoint/log sees `open: false → true` as `opening`; the production
   popup wrapper normally disposes a closed top-level menu, so the running-app visual check and
   the setProps transition check together cover the retained behavior.

The first-update off-by-one check is important while doing these checks: change a provider,
category, selected href, `showLinks`, or menu open state once immediately after mount and confirm
the corresponding behavior happens on that first update. A snapshot assigned at the start would
make that update appear unchanged.

## Acceptance Criteria

- `TComponentModel` in `src/renderer/core/state/model.ts` declares neither `isFirstUse` nor
  `oldProps`.
- `setPropsInternal` no longer writes `oldProps`, and `createComponentModelDriver` no longer
  writes `controlModel.isFirstUse = false`; the remaining props-pump order is unchanged.
- `CategoryViewModel.setProps`, `TreeProviderViewModel.setProps`, and `MenuModel.setProps` compare
  only the named local previous values they need: each reads the old fields into locals, computes
  all comparisons, immediately assigns the new snapshot, and then runs its existing logic.
- The first constructor pump remains an initialization call, and the first driver-owned update
  compares against the constructor snapshot rather than the new props.
- A provider change still rebuilds the tree and preserves effective expansion; an external
  non-null `selectedHref` still selects and reveals its row; and a closed-to-open menu transition
  still resets/reinitializes the menu as before.
- Renderer-wide search finds zero executable `isFirstUse`/`oldProps` references outside the task
  document, with comment-only historical mentions either removed or clearly non-executable.
- `effect`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, `onUnmount`, `memo()`, and
  `IMemo` are unchanged by this task.
- The three manual running-app checks above pass, including the first-update/off-by-one check.
- No unit tests or test harnesses are added, and `doc/active-work.md` is not edited.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Replace `isFirstUse`/`oldProps` comparisons in `CategoryViewModel.setProps` with captured previous-value locals and an immediate snapshot assignment before branching. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Replace first-use and `provider`/`showLinks`/`selectedHref` comparisons in `TreeProviderViewModel.setProps` with captured previous-value locals and an immediate snapshot assignment before branching. |
| `src/renderer/uikit/Menu/MenuModel.ts` | Replace the `oldProps` snapshot in `MenuModel.setProps` with captured previous `open`/`items` values and an immediate assignment before the existing transition branches. |
| `src/renderer/core/state/model.ts` | Remove the two `TComponentModel` fields, the `setPropsInternal` `oldProps` write, and the driver’s `isFirstUse` write only. |

### Files that need NO changes

- `src/renderer/uikit/Menu/MenuView.ts` — its `MenuModel` driver/view wiring is unchanged.
- `src/renderer/uikit/Menu/attach-menu.ts` — menu ownership and disposal are unchanged.
- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` — it continues to pump props and
  reveal through the existing model API.
- `src/renderer/editors/explorer/ExplorerSecondaryView.ts` — Explorer provider, selection, and
  reveal wiring are unchanged.
- `src/renderer/editors/category/CategoryEditor.ts` — category props production is unchanged.
- `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts` — link category tree props are
  unchanged.
- `src/renderer/uikit/Select/SelectModel.ts` and `src/renderer/uikit/Tree/TreeModel.ts` — their
  `oldProps` matches are comments only, not executable field reads.
- `doc/epics/EPIC-075.md` — already records the scope and baseline; do not amend it for this task.
- `doc/active-work.md` — explicitly excluded by the user.
