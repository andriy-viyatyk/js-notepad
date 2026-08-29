# US-1201 — Sidebar: `OpenTabsListView` and the re-entrant list views

## Goal

Apply the props-pump convention to the sidebar's open-tabs and tools/editors views: keep
construction-time `ListBox`/control configuration stable, hoist update-path callbacks to stable
fields, and preserve the live behavior that those callbacks read when invoked. Confirm whether the
reported re-entrancy is harmful before changing it.

This task is investigation-first. Implementation and validation notes are recorded below.

## Background

### Verified scope and the ListBox gate

`OpenTabsListView` constructs a `ListBoxView` props object at
`src/renderer/ui/sidebar/OpenTabsListView.ts:31-45`, then constructs another object in
`updateList()` at `src/renderer/ui/sidebar/OpenTabsListView.ts:110-124`. The current source contains
9 own fields in the constructor literal and 10 in the update literal; the epic's "14-field" count
does not match the checked tree. The second object creates new
`onChange`, `onActiveChange`, `isSelected`, and `getTooltip` functions at
`src/renderer/ui/sidebar/OpenTabsListView.ts:115-121`.

The epic's gate claim is confirmed against the consumer, with one precision correction. The
`ListBoxView.onUpdate()` path calls `driver.update(props)` and then
`repaintGate.changed(this.model.repaintSignature())` at `src/renderer/uikit/ListBox/ListBoxView.ts:143-149`.
`ListBoxModel.repaintSignature()` includes `props.items`, `activeIndex`, `renderItem`,
`props.isSelected`, and `props.getTooltip` at `src/renderer/uikit/ListBox/ListBoxModel.ts:224-271`.
Therefore each new `isSelected` or `getTooltip` identity makes the gate report a changed signature
whenever `this.list.update()` is reached. This is a real gate defeat.

The source does not, however, prove that the list repaints on every application dispatch. The
sidebar view has a targeted `pagesModel.state` binding on `state.pages` at
`src/renderer/ui/sidebar/OpenTabsListView.ts:51-56`; its other `updateList()` calls are the parent
update path, window-page load completion, and the active-row callback at
`src/renderer/ui/sidebar/OpenTabsListView.ts:63-77`. The verified claim is narrower: every such
`ListBox` prop pump currently defeats the repaint gate through fresh predicate/tooltip identities;
the separate full-list rebuild caused by freshly constructed `items` remains in scope for Epic C.

The gate's comparison semantics are also relevant. `createDepsGate()` compares fixed slots using
`depsChanged` at `src/renderer/uikit/shared/deps-gate.ts:20-42`, while `compareSelection()` compares
plain-object fields recursively but arrays, `Map`, and `Set` values by identity at
`src/renderer/core/state/state.ts:18-40`. No new selector is proposed here, and no selector is
allowed to allocate a fresh array.

### Sidebar subscription census

The complete `src/renderer/ui/sidebar/` TypeScript census found **zero** bare selector-less
`TOneState`/global-state subscriptions of the form `state.subscribe(() => ...)`. The state-backed
subscriptions are already targeted:

| Site | What it subscribes to | Finding |
|---|---|---|
| `src/renderer/ui/sidebar/OpenTabsListView.ts:53` | `pagesModel.state`, selector `state.pages` | Targeted state binding; not a bare subscription. |
| `src/renderer/ui/sidebar/MenuBarView.ts:207` | `menuFolders.state`, selector `state.folders` | Targeted state binding; not a bare subscription. |
| `src/renderer/ui/sidebar/MenuBarView.ts:208-210` | `app.window.state`, selector `state.menuBarPanelId` | Targeted state binding; not a bare subscription. |

The following `subscribe` calls were also checked and are not selector-less state subscriptions:

| Site | Subscription kind | Finding |
|---|---|---|
| `src/renderer/ui/sidebar/BuiltinEditorsListView.ts:57-60` | `settings.onChanged` | Keyed settings event; it refreshes only for browser profiles or pinned editors. `settings.onChanged` is backed by the separate `_onChanged` `Subscription`, sent explicitly at `src/renderer/api/settings.ts:181-214`. |
| `src/renderer/ui/sidebar/PinnedRailView.ts:72` | `subscribeBoardIconChanges` | Deliberate board-icon-cache notification; its listener set is a `Set`, not `TOneState`, at `src/renderer/editors/board/board-icon-cache.ts:19-22,73-77`. |
| `src/renderer/ui/sidebar/PinnedRailView.ts:80-83` | `settings.onChanged` | Keyed settings event; same classification as above. |
| `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts:75-78` | `settings.onChanged` | Keyed `script-library.path` event; same classification as above. |
| `src/renderer/ui/sidebar/TrustedBoardsListView.ts:53-59` | board registries plus `settings.onChanged` | Custom registry notifications and a keyed settings event, not `TOneState.subscribe`. |
| `src/renderer/ui/sidebar/TrustedToolsListView.ts:33` | `registeredTools.subscribeToolsets` | Custom registered-tools notification, not a state subscription. |

This census produces no additional bare hot/global-state conversion for US-1201. The `bind()` calls
and event subscriptions must remain unless a later task changes their owning contracts.

### `OpenTabsListView` callback identities

`OpenTabsListView`'s callbacks do not need captured snapshots. The selection predicate can read the
current `pagesModel.activePage`, and the tooltip can read the item passed at invocation time
(`src/renderer/ui/sidebar/OpenTabsListView.ts:41-42,120-121`). The change callback calls
`pagesModel.showPage()` for the current window or `api.showWindowPage()` and the current
`this.props.onClose` for another window (`src/renderer/ui/sidebar/OpenTabsListView.ts:146-153`).

| Current identity | Proposed field | What it reads when invoked |
|---|---|---|
| Constructor `onChange` bridge at `src/renderer/ui/sidebar/OpenTabsListView.ts:35`, and fresh update-path `onChange` at `:115` | `onListChange` — one stable bound field | The current item argument; `appWindow.windowIndex`, `pagesModel`, and `this.props.onClose` through `onClick()` at `:146-153`. |
| Constructor `onActiveChange` at `src/renderer/ui/sidebar/OpenTabsListView.ts:36-40`, and fresh update-path copy at `:116-119` | `onListActiveChange` — one stable bound field | The current index argument; writes the current `this.activeIndex`, then calls `updateList()`. It captures no index or list data. |
| Constructor `isSelected` at `src/renderer/ui/sidebar/OpenTabsListView.ts:41`, and fresh update-path copy at `:120` | `isListItemSelected` — one stable bound field | The current item argument and the current `pagesModel.activePage?.id`. |
| Constructor `getTooltip` at `src/renderer/ui/sidebar/OpenTabsListView.ts:42`, and fresh update-path copy at `:121` | `getListItemTooltip` — one stable bound field | The current item argument's `page?.filePath`; no state snapshot. |

The ListBox's stable `renderCell` field is already supplied by `ListBoxView` at
`src/renderer/uikit/ListBox/ListBoxView.ts:292-353`; it is not an additional OpenTabs callback to
convert.

### `ToolsEditorsPanelView` callback identities

The open button receives a stable constructor callback at
`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:34-40`, but `onUpdate()` replaces it with a fresh
callback at `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:60-67`. The tab props builder creates a
fresh `onChange` and a fresh items array on every call at
`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:73-90`; `onUpdate()` calls that builder at
`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:68-70`, and the callback calls
`this.tabs.update(this.tabProps())` before mounting the selected body at
`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:78-84`.

| Current identity | Proposed field | What it reads when invoked |
|---|---|---|
| Constructor `openButton` `onClick` at `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:39`, then fresh replacement at `:66` | `onOpenInNewTab` — one stable bound field; retain the construction-time button props and remove the redundant update | The current `this.tab` and current `this.props.onClose`; `openInNewTab()` maps the current tab and calls `pagesModel.showToolsHubPage()` at `:106-108`. |
| Fresh `tabProps()` `onChange` at `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:78-84` | `onTabChange` — one stable bound field plus one retained tabs-props object | The current value argument; compares and writes current `this.tab`, updates the retained controlled `value`, synchronously updates `this.tabs`, and mounts the body for the current tab. |

The `onClose` functions passed through `PinnedRailView` and `bodyView` at
`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:68-70` are parent-provided values, not newly
allocated callback closures in this view. They still need to be pushed if that prop changes; the
implementation should avoid pushing the unrelated open button and tabs configuration when it does
not.

### Alleged re-entrancy findings

#### `OpenTabsListView.onActiveChange`

The alleged structure is the `ListBoxModel`/`ListBoxView` props and its virtual-grid repaint state.
`ListBoxModel.onItemMouseEnter()` invokes `props.onActiveChange` synchronously from a row mouseenter
path at `src/renderer/uikit/ListBox/ListBoxModel.ts:139-144`; keyboard navigation invokes the same
callback at `src/renderer/uikit/ListBox/ListBoxModel.ts:165-175`. The current callback mutates only
`OpenTabsListView.activeIndex` and calls `updateList()` at
`src/renderer/ui/sidebar/OpenTabsListView.ts:116-119`. That method reads page data and calls
`ListBoxView.update()` at `src/renderer/ui/sidebar/OpenTabsListView.ts:79-124`; the child then may
schedule a virtual-grid repaint with `grid.model.update({ all: true })` at
`src/renderer/uikit/ListBox/ListBoxView.ts:143-152`.

This is **benign as currently implemented**. It does not mutate a `TOneState.listeners` array and
does not dispatch state from inside a state listener. The virtual grid's own `update()` coalesces a
repaint onto a promise microtask at `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:441-455`;
that is existing grid behavior, not a deferral to add here. No concrete failure—lost listener,
duplicate listener, recursive state dispatch, or stale callback—was found. Keep the synchronous
controlled update, hoist its callback identity, and add no `queueMicrotask`/`setTimeout(0)` or
re-entrancy guard.

#### `ToolsEditorsPanelView` tab change

The alleged structure is `SegmentedControlView`'s controlled props and its `KeyedList` of buttons.
The callback is invoked from a button event through `this.props.onChange` at
`src/renderer/uikit/SegmentedControl/SegmentedControlView.ts:93-100`, or from keyboard navigation
at `:115-164`. It writes `ToolsEditorsPanelView.tab`, synchronously calls `this.tabs.update(...)`,
and replaces the body view at `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:78-104`.
`SegmentedControlView.onUpdate()` applies props and synchronously updates its keyed segments at
`src/renderer/uikit/SegmentedControl/SegmentedControlView.ts:56-72`; `KeyedList.update()` completes
its retained/create/reorder/update walk synchronously at
`src/renderer/uikit/shared/keyed-list.ts:20-109`.

This is also **benign as currently implemented**. The callback is running from a DOM button event,
not from a state listener; the synchronous update changes the controlled selected button and the
body branch, and no state listener array is mutated or state dispatched. No concrete failure was
found. Retain this update after making the callback and props object stable. The change is a props
identity conversion, not a re-entrancy fix.

For contrast, the copy-on-write rule that made the pilot's `PageTabsView` subscription-map mutation
safe is in `TOneState.stateChanged()` and both unsubscribe paths at
`src/renderer/core/state/state.ts:52-54,84-92`. That rule is not being used to justify a new
deferral here: these two sidebar callbacks never enter that listener-array mutation scenario.

## Implementation Plan

1. **Stabilize `OpenTabsListView` configuration and callbacks** in
   `src/renderer/ui/sidebar/OpenTabsListView.ts`.

   - Add once-created fields corresponding to the four rows in the callback table. They must read
     `this.props`, `pagesModel`, `appWindow`, and their invocation arguments at call time.
   - Because the current constructor creates the child before `super()` only to borrow
     `list.root` (`:29-48`), construct the initial child with static configuration, let the class
     fields initialize after `super()`, and install the retained complete props object before the
     child is mounted. `VanillaView.update()` intentionally stores pre-mount props without invoking
    `onUpdate()` (`src/renderer/uikit/shared/vanilla-view.ts:82-96`), so this preserves the stable
     root without a holder callback surviving into the update path.
   - Retain one `ListBoxProps<OpenTabsListItem>` object containing the static fields (`name`,
     `rowHeight`, `emptyMessage`, `variant`) and stable callback fields. In `updateList()`, assign
     only the live `items` and `activeIndex` values and push that retained object only when one of
     those references/values has changed.
   - Do not add a structural item-array equality algorithm, selector array, or full-DOM/list rebuild
     fix. `updateList()` currently creates current-window items with `map()` and the aggregate list
     at `:82-99`; that rebuild behavior is the explicitly deferred Epic C concern. Record any
     accidental improvement separately if the final implementation makes one trivially.

   Before:

   ```ts
   this.list.update({
       name: "sidebar-open-tabs",
       items,
       rowHeight: 22,
       activeIndex: this.activeIndex,
       onChange: (item) => this.onClick(item),
       onActiveChange: (index) => {
           this.activeIndex = index;
           this.updateList();
       },
       isSelected: (item) => item.page?.id === pagesModel.activePage?.id,
       getTooltip: (item) => item.page?.filePath,
       emptyMessage: "no tabs",
       variant: "browse",
   });
   ```

   (Current source: `src/renderer/ui/sidebar/OpenTabsListView.ts:110-124`.)

   After shape:

   ```ts
   private readonly onListChange = (item: OpenTabsListItem): void => this.onClick(item);
   private readonly onListActiveChange = (index: number): void => {
       this.activeIndex = index;
       this.updateList();
   };
   private readonly isListItemSelected = (item: OpenTabsListItem): boolean =>
       item.page?.id === pagesModel.activePage?.id;
   private readonly getListItemTooltip = (item: OpenTabsListItem): string | undefined =>
       item.page?.filePath;

   private readonly listProps: ListBoxProps<OpenTabsListItem> = {
       name: "sidebar-open-tabs",
       items: [],
       rowHeight: 22,
       activeIndex: null,
       onChange: this.onListChange,
       onActiveChange: this.onListActiveChange,
       isSelected: this.isListItemSelected,
       getTooltip: this.getListItemTooltip,
       emptyMessage: "no tabs",
       variant: "browse",
   };
   ```

   The exact field type/constructor ordering may be adapted to TypeScript initialization rules, but
   the invariant is fixed: the props consumed after the pre-mount pump have one callback identity
   for the lifetime of the view.

   **Why the retained wrapper still updates the child.** The retained `ListBoxProps` object is a
   wrapper, not the gate's comparison value. `VanillaView.update()` has no identity short-circuit:
   it assigns `this.props = props` and calls `onUpdate(props)` whenever the view is mounted
   (`src/renderer/uikit/shared/vanilla-view.ts:82-96`). A same-identity push therefore still reaches
   `ListBoxView.onUpdate()` (`src/renderer/uikit/ListBox/ListBoxView.ts:143-149`).

   The repaint gate snapshots the signature slots, not the wrapper: `createDepsGate().changed()`
   stores `previous = [...next]` at `src/renderer/uikit/shared/deps-gate.ts:35-39`. It consequently
   retains the previous `items` array reference and callback identities from
   `ListBoxModel.repaintSignature()` (`src/renderer/uikit/ListBox/ListBoxModel.ts:259-271`).
   Mutating the retained wrapper cannot blind that comparison: assigning a new live `items` array
   moves its signature slot, while the stable `isSelected` and `getTooltip` fields no longer move
   merely because the wrapper was pushed. The current ListBox path reads the updated wrapper during
   the synchronous `onUpdate()` call and does not retain a captured props copy for later wrapper
   identity comparison (`src/renderer/uikit/ListBox/ListBoxView.ts:143-149`).

   The implementation must preserve that ownership rule: do not hand the mutable retained props
   object to a consumer that stores it and later compares it with a captured copy. Such a consumer
   could observe two references to the same mutated object and miss a change. Nothing in the traced
   ListBox path does this, but the constraint is part of the retained-object pattern.

2. **Make `ToolsEditorsPanelView`'s update path stable** in
   `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts`.

   - Hoist the open-button handler to a stable field and keep the constructor-time button props;
     remove its identical fresh `onUpdate()` pump because no button configuration depends on
     `ToolsEditorsPanelProps` (`:34-40` versus `:60-67`).
   - Hoist `tabProps()`'s `onChange` to `onTabChange`, retain the three static items and other
     configuration in one props object, and change only its controlled `value` before the required
     synchronous `tabs.update()`. Do not defer or guard this update as a purported re-entrancy fix.
   - Keep updating `PinnedRailView` and the current body view when the parent `onClose` identity
     actually changes; avoid turning that necessary live callback propagation into a new callback
     allocation. The body selection remains owned by `mountBody()` at `:93-104`.

3. **Do not convert unrelated sidebar subscriptions or full-rebuild sites.**

   - No bare state subscription was found to convert. Preserve the three targeted `bind()` sites
     and the keyed/custom event subscriptions recorded in the census.
   - Do not modify `ListBoxView`, `ListBoxModel`, `SegmentedControlView`, `VirtualGridModel`, or
     `KeyedList`; they were inspected to verify the gate and re-entrancy findings, but this task's
     required change is at the sidebar callers.

4. **Run manual verification after implementation.** Use the checklist below and record observed
   behavior in the task document before considering the code portion complete. Do not add a unit
   test or test harness for this task.

## Concerns

- **Constructor ordering:** `OpenTabsListView` currently constructs `ListBoxView` before `super()` so
  it can pass `list.root` to the base view (`src/renderer/ui/sidebar/OpenTabsListView.ts:29-48`).
  Stable fields must not be accessed before `super()`. The safe plan is to construct the child with
  static/pre-mount props, then install the retained props after `super()` and before mount, relying
  on the documented pre-mount `update()` behavior (`src/renderer/uikit/shared/vanilla-view.ts:82-96`).
- **Items remain a repaint input:** `ListBoxModel.repaintSignature()` deliberately includes
  `props.items` (`src/renderer/uikit/ListBox/ListBoxModel.ts:259-271`), and `updateList()` currently
  allocates the aggregate items array (`src/renderer/ui/sidebar/OpenTabsListView.ts:82-99`). Stable
  callbacks remove the verified predicate/tooltip gate defeat; they do not claim to solve Epic C's
  full-list rebuild.
- **Controlled tab update remains synchronous:** the `ToolsEditorsPanelView` callback must update
  the selected value and body immediately (`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:78-84`).
  The source review found no harmful re-entrancy, so a microtask, timer, or recursion guard would be
  an unjustified behavioral change and is prohibited by this task.
- **Parent callback identity:** `onClose` is a live parent prop in both views. Stable child handlers
  must read `this.props.onClose` when invoked rather than capture the constructor's callback, as
  demonstrated by `OpenTabsListView.onClick()` (`src/renderer/ui/sidebar/OpenTabsListView.ts:146-153`).

## Acceptance Criteria

- [ ] `OpenTabsListView` has one stable field for each of `onChange`, `onActiveChange`, `isSelected`,
  and `getTooltip`; no update-path props literal allocates those callbacks.
- [ ] The ListBox configuration is created once and its update path changes only live `items` and
  `activeIndex`; no new selector returns an allocated array and no Epic C full-list rebuild fix is
  smuggled into this task.
- [ ] `ToolsEditorsPanelView` no longer replaces the open-button callback during `onUpdate()`, and
  its segmented-control callback/items configuration is stable while the controlled tab still
  updates immediately.
- [ ] The callback table's live-state behavior is preserved: selection sees current
  `pagesModel.activePage`, activation sees current window/page state and `onClose`, and the tools
  button sees current `this.tab` and `onClose`.
- [ ] The sidebar census remains accurate: zero bare selector-less subscriptions to hot/global
  `TOneState` state; targeted binds and non-state subscriptions are listed with file:line.
- [ ] Both alleged re-entrancies are documented as benign unless implementation reveals a concrete
  failure. No `queueMicrotask`, `setTimeout(0)`, equality gate in `VanillaView.update()`, unit test,
  or test harness is added.
- [ ] Manual verification covers the checklist below.

### Manual verification checklist

- [ ] Open the Open Tabs sidebar and confirm it mounts with current tabs and tooltips.
- [ ] Activate a tab in the current window; confirm the correct page is shown and the sidebar closes
  when the current `onClose` prop requests it.
- [ ] Activate a tab belonging to another window; confirm `api.showWindowPage()` targets the item’s
  window and the current sidebar close behavior remains intact (`OpenTabsListView.ts:146-153`).
- [ ] Hover rows and move the active row with keyboard navigation; confirm the active highlight
  follows the current index and no recursive-event error or duplicate callback appears.
- [ ] Open, close, reorder, group, ungroup, pin, and enter/leave compare mode; confirm the open-tabs
  list follows the page collection and does not lose its selected row.
- [ ] Type in an editor while the sidebar is open; confirm there is no new selector-less global
  subscription and that tab title/metadata behavior remains correct for the existing update paths.
- [ ] Trigger a window-page refresh/load and a duplicate-page recovery scenario; confirm the existing
  50 ms duplicate retry still behaves as before (`OpenTabsListView.ts:101-107`).
- [ ] Open Tools & Editors, switch Editors → Boards → Tools → Editors, and confirm the selected
  segmented control and body change synchronously without re-entrancy errors.
- [ ] From Tools & Editors, use the open-in-new-tab button after switching tabs; confirm it opens the
  matching hub tab and closes through the current `onClose` prop.
- [ ] Change the parent `onClose` callback identity through the owning sidebar path, then exercise
  Open Tabs and Tools & Editors again; confirm handlers use the new callback rather than a captured
  constructor value.
- [ ] Inspect the final source: no fresh OpenTabs callback appears in `updateList()`, no fresh
  Tools open-button/tab callback appears in `onUpdate()`/`tabProps()`, and no prohibited deferral or
  `VanillaView.update()` equality gate was added.

## Files Changed Summary

| File | Planned status | Purpose |
|---|---|---|
| `src/renderer/ui/sidebar/OpenTabsListView.ts` | Change | Stable ListBox callback fields and retained live props configuration. |
| `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts` | Change | Stable open-button/tab callbacks and retained segmented-control configuration. |
| `doc/active-work.md` | Change | Link US-1201 to this task document while retaining `[ ]`. |
| `doc/tasks/US-1201-sidebar-props-pump/README.md` | Add | Investigation, implementation plan, findings, and verification checklist. |

Files inspected and requiring **no changes for this task**: `src/renderer/uikit/ListBox/ListBoxView.ts`,
`src/renderer/uikit/ListBox/ListBoxModel.ts`, `src/renderer/uikit/SegmentedControl/SegmentedControlView.ts`,
`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts`, `src/renderer/uikit/shared/deps-gate.ts`,
`src/renderer/uikit/shared/keyed-list.ts`, `src/renderer/uikit/shared/vanilla-view.ts`,
`src/renderer/core/state/state.ts`, and the other sidebar files listed in the subscription census.

## Implementation Notes

### 2026-08-29

- `OpenTabsListView` now constructs its child with static configuration, installs one retained
  `ListBoxProps` object before mount, and updates only its live `items` and `activeIndex` fields.
  Its four ListBox callbacks are stable fields and continue reading live state at invocation time.
- `ToolsEditorsPanelView` now retains its segmented-control props and stable open/tab callbacks.
  The open button is no longer repumped, and `onClose` is propagated to the pinned rail and body
  only when its identity changes. Tab changes remain synchronous.
- No subscriptions, list-rebuild behavior, `VanillaView.update()`, or uikit files were changed.
  No tests or test harnesses were added, and no prohibited deferral was introduced. The dashboard
  entry was already linked under EPIC-076 and remains `[ ]` as required for an unreviewed epic task.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` all passed. The production build
  emitted its existing Vite warnings but completed successfully.
- Manual UI verification was not run in this environment; the manual verification checklist above
  remains unchecked.
