# US-1211 — The app-shell rebuild tail

## Status

**Status:** Planned  
**Priority:** High  
**Epic:** [EPIC-077](../../epics/EPIC-077.md)  
**Started:** 2026-08-30

## Goal

Finish the app-shell portion of EPIC-077 statement 1 in §C-1, with the current source verified
against the stale figures in §C-4. Remove the redundant parent-update refreshes from the two list
views whose live inputs already have targeted subscriptions; retain a real comparison gate for
`ToolsEditorsPanelView`'s live `onClose` propagation; and convert the secondary-view stack's
conditional two-pass header handshake to one stack update.

This is an investigation-first task document. No implementation has been made while these findings
were collected. No tests or test harnesses are part of this task.

## Background

### Epic scope and current-tree corrections

EPIC-077 §C-1 statement 1 requires that a view not rebuild its whole child set on an ungated update,
and names `KeyedList`, `SubtreeSwap`, targeted writes, or visible signature gates as acceptable
alternatives. EPIC-077 §C-4 names this task as `SecondaryViewsView.updateStack` plus the sidebar
trio at the old lines `BuiltinEditorsListView.ts:64-68`, `TrustedBoardsListView.ts:67-68`, and
`ToolsEditorsPanelView.ts:85`.

The line references are partly stale after the preceding epics:

- `BuiltinEditorsListView.ts:64-65` and `TrustedBoardsListView.ts:67-68` still contain the
  ungated refresh arms.
- `ToolsEditorsPanelView.ts:85-90` contains no `refresh()` call. It already compares
  `props.onClose` with `previousOnClose` and only forwards a changed callback to `PinnedRailView`
  and the current body view. Its settings-driven refreshes belong to its child views.
- `EPIC-076.md:479-483` correctly records that the stack creates its header in
  `CollapsiblePanelStackView.createPanel()` and reports it only after inserting the stack-owned
  nodes. The earlier claim that this was an unnecessary holder channel is not applicable to the
  current source.

### Part 1 — `SecondaryViewsView.updateStack`: the two-pass shape still exists

The method at `src/renderer/ui/secondary-views/SecondaryViewsView.ts:134-139` makes one
`CollapsiblePanelStackView.update()` call. That fact alone is not the whole behavior. Its caller
`reconcile()` at `:104-132` immediately calls `drainHeaderUpdates()` after the first update, and
`:141-149` calls `updateStack()` a second time when a header callback marked a record dirty.

The current sequence is:

1. `reconcile()` creates a new `PanelRecord` with `headerElement: null` and a stable
   `headerRef` callback at `SecondaryViewsView.ts:171-181`.
2. `toPanelDescriptor()` at `:192-205` creates or updates the lazy child with
   `headerRef: record.headerElement` at `:215-222`, which is still `null` on first creation, and
   gives the stack the callback at `:199`.
3. The stack creates its header at
   `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:121-139`. During
   `updatePanel()` (`:142-152`), `updateHeader()` inserts the owned header nodes and invokes the
   changed callback synchronously at `:154-205`, specifically `:204`.
4. `publishHeader()` receives that actual header at `SecondaryViewsView.ts:185-190`, stores it,
   and marks the record dirty. When the first stack update returns, `drainHeaderUpdates()` clears
   the flag and calls `updateStack()` again at `:148`. The second descriptor pump therefore gives
   the lazy child the real header element.

This is the epic's “render, ref fires, render again” behavior, with the precision that the second
pass is conditional: it occurs on first panel creation or when a panel's header callback changes;
steady-state reconciles with an unchanged header callback take one pass. The source is not using a
React renderer, but it still has the same two-pass dependency handshake.

The header is a real child input, not decorative bookkeeping. `SideBarPanelHeaderView.ts:8` accepts
the element, `SideBarPanelHeaderView.ts:124-128` detaches and attaches its title/actions/icon
nodes when the element changes, and `secondary-view-registry.ts:13-17` documents that the stack
owns this host. Removing `headerRef` without replacing that ordering would render the secondary
headers incorrectly.

#### Proposed single-pass shape

Add an optional `childrenFactory` to `CollapsiblePanelProps` in
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts:5-15`, with the signature
`(header: HTMLDivElement, isOpen: boolean) => SlotContent`. This is justified at the shared
component boundary: the stack, not `SecondaryViewsView`, creates and owns the header, so only the
stack can supply the real header before the child is created. The factory is an explicit native
composition seam, not a React descriptor registry: it returns `SlotContent`, and the stack remains
responsible for `fillSlot()` and child-region ownership. That conforms to
`src/renderer/uikit/CLAUDE.md` Rules 6, 7, and 9 (native composition, explicit prop surfaces, and
view-owned slot filling).

The prop comment must define the conflict rule: **when both `childrenFactory` and `children` are
supplied, `childrenFactory` wins and `children` is ignored**. This keeps the existing required
`children` field source-compatible while making the new path unambiguous; `children: null` is the
deliberate value in factory-backed descriptors. `updateContent()` must use exactly that precedence.

In
`CollapsiblePanelStackView.updateContent()` at `:213-230`, evaluate that factory after
`updateHeader()` has created and populated the header, then fill the content slot with the returned
node. Treat a factory as a custom-header panel when deciding whether to add the default chevron at
`:165`.

`SecondaryViewsView` should then:

- remove `headerDirty`, `headerRef`, `publishHeader()`, and `drainHeaderUpdates()`;
- keep the stack-owned header element in `PanelRecord` only as the current prop for the lazy child;
- pass a stable record factory as `childrenFactory` instead of passing the ref callback;
- have that factory receive the actual header, set `record.headerElement`, create/update the lazy
  view with `lazyViewProps()`, and return `lazyView.root`;
- retain `alwaysRenderContent: true`, so the factory runs for collapsed panels as it does today; and
- leave `SideBarPanelHeaderDom`, `SecondaryViewProps.headerRef`, and the existing `headerRef` API
  available for non-factory stack callers.

Before:

```ts
this.updateStack(activeKey, rendered);
this.drainHeaderUpdates(activeKey, rendered);
```

```ts
headerRef: record.headerRef,
alwaysRenderContent: true,
children: null,
```

After shape:

```ts
this.updateStack(activeKey, rendered);
```

```ts
alwaysRenderContent: true,
children: null,
childrenFactory: record.childrenFactory,
```

The stack must call `childrenFactory(record.header, isOpen)` from its existing synchronous
`updateContent()` path. This makes the header available before `LazySecondaryViewView` is first
constructed or updated, so one `updateStack()` call preserves the current header DOM contract.

The current ordinary `children` callers are the three panel descriptors in
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.story.ts:79-108` (Tags, Categories,
and Hostnames); they continue using direct `SlotContent` and do not pass a factory. The current
secondary descriptor is the one in
`src/renderer/ui/secondary-views/SecondaryViewsView.ts:196-205`; it changes to the factory path.
The call-site census found no other `CollapsiblePanelProps` value producer that needs migration.

### Part 2 — independent sidebar subscription and cost audit

The conclusion is view-specific, not a blanket deletion. `settings.onChanged` is a keyed event:
`settings.set()` sends the changed key at `src/renderer/api/settings.ts:208-216`, and watcher reloads
compare old and new values and send each structurally changed key at `:237-283`. Thus the key
checks below cover both in-process edits and file-backed changes.

#### Why the two list-view deletions do not drop new props

The safety argument has two independent halves and both must remain documented. First, deleting an
`onUpdate()` override does not disable `VanillaView.update()`: at
`src/renderer/uikit/shared/vanilla-view.ts:88-97`, `update(props)` assigns `this.props = props` at
`:93` before it conditionally calls the subclass hook at `:94-95`. Second, the only prop that could
look lost here is `onClose`, and both views read it from the current props at event time:
`BuiltinEditorsListView.ts:122` and `TrustedBoardsListView.ts:106`. Neither handler closes over a
constructor-time callback. Removing the overrides therefore removes only their redundant
`refresh()` calls; parent prop updates still arrive and later row events still use the new callback.

#### `BuiltinEditorsListView`

| Item | Verified finding |
|---|---|
| `onUpdate` arm | `src/renderer/ui/sidebar/BuiltinEditorsListView.ts:64-66`: `protected onUpdate(): void { this.refresh(); }` |
| Duplicated subscriptions | `:57-60` subscribes to `settings.onChanged` and calls `refresh()` for `browser-profiles` or `pinned-editors`. |
| Inputs and proof of coverage | `refresh()` reads `settings.get("browser-profiles")` at `:69`, derives static plus profile items through `getCreatableItems()` at `:70`, and reads `getPinnedStrings()` (the `pinned-editors` value) at `:71-73`. The two subscribed keys are exactly the mutable inputs. `getCreatableItems()` only combines its argument with the module's static registry (`tools-editors-registry.ts:187-199`); it does not read another reactive source. `onClose` is read only when a row is activated at `:119-123`, not while refreshing. |
| Cost | No filesystem read. Each call derives and sorts the complete row array (`:69-76`), checks the retained pin-button map (`:78-103`), creates a fresh trait set and `traited()` list props (`:106-116`), and updates the `ListBox` at `:79`. The ListBox's `:200-214` path sees the new items projection and may request `{ all: true }` for its virtualized grid, repainting pooled/visible rows; it does not recreate every row view. Existing pin buttons are retained by ID and only added or disposed when membership changes. |
| Verdict | **Delete the arm.** Remove the `onUpdate()` method and leave the keyed settings subscription and initial `refresh()` intact. The parent-provided `onClose` remains live because `handleChange()` reads `this.props` at invocation time. |

#### `TrustedBoardsListView`

| Item | Verified finding |
|---|---|
| `onUpdate` arm | `src/renderer/ui/sidebar/TrustedBoardsListView.ts:67-69`: `protected onUpdate(): void { this.refresh(); }` |
| Duplicated subscriptions | `:53` subscribes to `boardTrust.subscribePaths(this.refresh)`, `:54` to `publishedBoards.subscribeCatalog(this.refresh)`, `:55` to `boardInstallRegistry.subscribeInstalled(this.refresh)`, and `:56-59` to `settings.onChanged` for `pinned-editors`. |
| Inputs and proof of coverage | `refresh()` prunes against `boardTrust.listPaths()` at `:88` and `:220-231`; its tree props use the same trusted roots at `:234-244`, especially `:237`. It derives pinned roots from `getPinnedStrings()` at `:89-95`, covered by the keyed settings subscription. It derives update tags through `listBoardUpdates()` at `:96-98`; that helper reads `boardInstallRegistry.listInstalled()` (`api/board-updates.ts:63-67`) and each board's published catalog/update data, covered by the installed and catalog subscriptions. The three load promises at `:61-64` also explicitly call `refreshIfAlive()`. `openBoard()` reads the live `onClose` only on activation at `:102-107`; it is not a refresh input. |
| Filesystem/async nuance | `refresh()` itself does not call the filesystem. During tree row projection, `trailingElement()` at `:145-183` checks the memory-only `getBoardUsageSync()` at `:152-154`; an uncached root starts one shared `resolveBoardUsage()` manifest read through `probeBoardUsage()` at `:214-218`, and that promise directly calls `refreshIfAlive()` when it resolves. Therefore the initial usage-probe path is covered without relying on the parent update arm. `board-usage-cache.ts:56-64` has a generic invalidation notifier, but `rg` found no current caller of `invalidateBoardUsage()` and this view does not subscribe to that generic listener set; a future manifest-invalidation producer must add an explicit view notification. It is not a current parent-update input. |
| Cost | Builds new pinned-root and update maps (`:88-98`) and updates the retained `BoardsTreeView` (`:99`). `BoardsTreeView.onUpdate()` at `src/renderer/editors/board/BoardsTreeView.ts:87-90` updates the tree and explicitly refreshes rows; `TreeView.refreshRows()` at `src/renderer/uikit/Tree/TreeView.ts:124-128` requests `{ all: true }` for the virtualized grid. `TreeView` retains the projected node array when `boards` and `baseRoot` identities are unchanged (`BoardsTreeView.ts:110-117`), so this is a full visible-row repaint, not recreation of the whole child tree. Uncached board usage can add one shared manifest read per root, but repeated refreshes use the cache/pending map. |
| Verdict | **Delete the arm.** All current mutable inputs used by `refresh()` have a direct subscription or an explicit load/probe completion callback. No parent-only input affects the refresh projection; `onClose` is consumed live by row activation. |

#### `ToolsEditorsPanelView`

| Item | Verified finding |
|---|---|
| Epic citation/current arm | `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:85-90` has no `refresh()`: it returns when `props.onClose === previousOnClose` at `:86`, otherwise stores the new callback and updates `PinnedRailView` and `bodyView` at `:87-89`. `rg -n "refresh\\("` returns no match in this file. |
| Duplicated subscription | None in this wrapper. `BuiltinEditorsListView` and `PinnedRailView` subscribe to `browser-profiles`/`pinned-editors` at their own `onMount()` paths; `TrustedBoardsListView` subscribes to `pinned-editors` and its board registries. Tools does not own or duplicate those refreshes. |
| Update-path input not covered by settings | `onClose` is a parent-provided callback, not a settings key. The wrapper must forward a changed identity to its pinned rail and currently selected body, so deleting its comparison would break live callback propagation. The existing comparison is the required gate. |
| Cost | On a real `onClose` identity change, `PinnedRailView.update()` reaches its own `onUpdate()` and refreshes the pinned projection (`PinnedRailView.ts:88-111`); `bodyView.update()` reaches either Builtin or Trusted's current child update path. With equal identity, both calls are skipped. There is no Tools-owned filesystem read. |
| Verdict | **Gate, not delete.** Keep the comparison at `:86`. Make the gate effective by stabilizing the callback supplied by `MainPageView`: its constructor uses a closure at `src/renderer/ui/app/MainPageView.ts:65`, and `updateIndicators()` allocates another at `:173`. Hoist one `toggleMenuBar` field and use it at both sites. |

Before:

```ts
this.menuBar = this.child(new MenuBarView({ open: false, onClose: () => app.window.toggleMenuBar() }));
```

```ts
this.menuBar.update({ open: state.menuBarOpen, onClose: () => app.window.toggleMenuBar() });
```

After shape:

```ts
private readonly toggleMenuBar = (): void => app.window.toggleMenuBar();
```

```ts
this.menuBar = this.child(new MenuBarView({ open: false, onClose: this.toggleMenuBar }));
```

```ts
this.menuBar.update({ open: state.menuBarOpen, onClose: this.toggleMenuBar });
```

### What causes the parent updates, and how often

The three views are not independently driven by every sidebar event. The relevant parent chain is
`MainPageView` → `MenuBarView` → the retained right view → `ToolsEditorsPanelView` → its selected
body view:

- `MainPageView` binds the entire `app.window.state` at `MainPageView.ts:85`. Its
  `updateIndicators()` at `:168-177` updates `menuBar` for every changed window-state object.
- `MenuBarView.onUpdate()` at `MenuBarView.ts:220-224` always calls `updateRightView()`. If the
  selected right-view key is unchanged, `updateRightView()` calls `rightView.update()` at
  `:472-476`; the Tools case is created at `:496-503` and receives `{ onClose }` at `:527-534`.
- The full window-state binding is broader than the menu contents. `app/window.ts:54-70` updates
  MCP status; `:75-81` updates maximize/zoom; `:121-139` updates menu open/close and consumes a
  pending panel ID. `TOneState` notifies listeners at `core/state/state.ts:52-84`, while the
  whole-state selector changes with each produced state object.
- Consequently, while Tools & Editors is the selected right view, each actual app-window state
  update causes a fresh `onClose` function from the current MainPage code and defeats the Tools
  comparison. That can happen at startup/status initialization, menu open/close (including the
  second update when a requested panel ID is consumed), maximize/restore, zoom, and MCP events.
  It is not caused by every Tools tab click: tab changes use the local `onTabChange` at
  `ToolsEditorsPanelView.ts:28-35`. Settings changes and board registry changes go through the
  targeted child subscriptions listed above. Stabilizing MainPage's callback reduces the parent
  chain to genuine `onClose` changes.

### Shared-helper dead-code check

No shared helper becomes dead when either list-view arm is deleted, because the remaining
subscriptions, initial loads, row callbacks, and refresh methods still use them.

- `getPinnedStrings()` remains used by Builtin, Trusted, `PinnedRailView`, `PageTabsView`, and the
  pinned-items API (`src/renderer/ui/sidebar/pinned-items.ts:35-66`).
- `getCreatableItems()` remains used by Builtin, `PinnedRailView`, `PageTabsView`, and tools-hub
  consumers (`src/renderer/ui/sidebar/tools-editors-registry.ts:190-199` and the `rg` census).
- `listBoardUpdates()` remains used by Trusted, `BoardToolbar`, `SearchBoardsTab`, and the boards
  API. `getBoardUsageSync()`/`resolveBoardUsage()` are currently used by Trusted's remaining row
  projection and probe completion; they are not removed by deleting `onUpdate()`.
- Builtin's `createRowTraits()` is private and remains called by `listProps()`; Trusted's
  `refreshIfAlive()` remains used by all three loads and usage probes.

### Grep command log

These are the `rg` commands used during the source census; line numbers in this document are from
the checked working tree after those searches.

```text
rg -n -C 12 "US-1211|SecondaryViewsView|BuiltinEditorsListView|TrustedBoardsListView|ToolsEditorsPanelView|two-pass|verification by use" doc/epics/EPIC-077.md
rg -n -C 5 "headerRef|creates the header|owned nodes" doc/epics/EPIC-076.md
rg -n -C 4 "CollapsiblePanelProps|new CollapsiblePanelStackView|panels:\s*\[|panels:" src/renderer -g '*.ts'
rg -n -C 3 "getPinnedStrings|getCreatableItems|listBoardUpdates|getBoardUsageSync|resolveBoardUsage|invalidateBoardUsage" src/renderer -g '*.ts'
rg -n -C 3 "subscribePaths|subscribeCatalog|subscribeInstalled|onChanged\.subscribe|protected onUpdate|private readonly refresh|private refresh" src/renderer/ui/sidebar/BuiltinEditorsListView.ts src/renderer/ui/sidebar/TrustedBoardsListView.ts src/renderer/ui/sidebar/ToolsEditorsPanelView.ts src/renderer/ui/sidebar/PinnedRailView.ts
rg -n -C 3 "bind\(app\.window\.state|updateIndicators|rightView\.update|new ToolsEditorsPanelView|rightViewProps|toggleMenuBar|openMenuBar|consumeMenuBarPanelId" src/renderer/ui/app/MainPageView.ts src/renderer/ui/sidebar/MenuBarView.ts src/renderer/api/window.ts
rg -n -C 3 "headerRef|childrenFactory|new CollapsiblePanelStackView|CollapsiblePanelProps" src/renderer/ui/secondary-views src/renderer/uikit/CollapsiblePanelStack -g '*.ts'
rg -n "refresh\(" src/renderer/ui/sidebar/ToolsEditorsPanelView.ts
```

## Implementation Plan

1. **Land the low-risk sidebar cleanup independently.**

   - Remove `BuiltinEditorsListView.onUpdate()` at `:64-66`; keep its keyed settings subscription,
     initial refresh, retained pin-button map, and live `onClose` handling.
   - Remove `TrustedBoardsListView.onUpdate()` at `:67-69`; keep all four targeted subscriptions,
     the three load completions, usage-probe completion, and live `onClose` handling.
   - Do not add a settings subscription to `ToolsEditorsPanelView`. Its child views own the
     settings/registry subscriptions. Keep its `onClose` comparison and child forwarding.

   These deletions are small and reversible. The implementer must preserve the two-part safety
   argument recorded above: `VanillaView.update()` stores new props before the hook, and each row
   event reads the current `this.props.onClose` rather than a captured value.

2. **Make the existing Tools gate effective, independently of the shared stack work.**

   - Add one stable `toggleMenuBar` field in `src/renderer/ui/app/MainPageView.ts`.
   - Use it for the constructor-time `MenuBarView` props and the `updateIndicators()` props.
   - Do not change the synchronous Tools tab transition or the child refresh contracts.

   This is also small and reversible. If the stack handshake must be deferred, the two list-arm
   deletions and this callback stabilization can still land and be manually verified as a complete
   low-risk slice.

3. **Manually verify the low-risk slice in the running app.** Record the list-view and Tools
   observations before starting the shared uikit change.

   **Shared-stack implementation comes last.** Only after steps 1-3, and in an isolated change,
   perform the higher-risk handshake conversion:

   - Extend `CollapsiblePanelProps` with the documented `childrenFactory` contract. The prop
     comment must state that when both `childrenFactory` and `children` are supplied, the factory
     wins and `children` is ignored.
   - In `CollapsiblePanelStackView.updateContent()`, call the factory after `updateHeader()` and
     before `fillSlot()`, and suppress the default chevron for factory-backed custom headers.
   - In `SecondaryViewsView`, replace the ref/dirty/drain channel with a per-record factory that
     receives the stack-created header, updates `headerElement`, and creates or updates the lazy
     child with that element. Keep `alwaysRenderContent` and the existing asynchronous loader.
   - Verify the story's ordinary `children` callers still use the old slot path; do not alter the
     story unless the type/API change reveals a genuine compatibility issue.
   - Preserve the current US-1208 release-handle lifecycle in
     `CollapsiblePanelStackView.ts`: the header listener is released through `headerRelease` at
     `:236`, and the buttons-host listener through `buttonsRelease` at `:192` and `:238`. The
     handshake change must not install duplicate listeners or skip either release on remove/re-add.

4. **Manually verify in the running app.** No build-only result satisfies EPIC-077 §C-5.

   - Start the normal app and open the visible `Tools & Editors` menu folder (the static label is
     defined at `src/renderer/ui/sidebar/MenuBarView.ts:49-56`). Confirm the roots identified by
     `data-name="tools-builtin-list"`, `data-name="sidebar-trusted-boards-list"`,
     `data-type="tools-editors-panel"`, `data-name="tools-editors-tabs"`, and
     `data-name="tools-editors-open-in-tab"` where applicable.
   - **Builtin:** in Settings → Browser Profiles, add or edit a profile and confirm the matching
     row appears without closing/reopening Tools & Editors. Pin and unpin a built-in row and confirm
     the row moves between the list and the pinned rail; activate it and confirm the current
     `onClose` closes the menu.
   - **Trusted Boards:** trust a board with a readable `board-manifest.json`, confirm it appears in
     the Boards tab, wait for its pin affordance after the manifest probe, pin/unpin it, and use the
     row context menu's Remove action. Confirm the tree updates without reopening the panel and that
     an update tag appears when a known installed/catalog update is available.
   - **Tools wrapper:** switch Built-in Editors → Boards → Tools → Built-in Editors and confirm the
     selected segment and body change synchronously. Use Open in new tab after each relevant tab;
     toggle the sidebar, maximize/restore, or change zoom while Tools is selected, and confirm the
     live close callback and selected body remain correct.
   - Keep Tools selected while triggering an unrelated window-state update (for example maximize /
     restore), then repeat a row activation. This is the concrete check that the stable MainPage
     callback lets `ToolsEditorsPanelView` skip equal-prop child pumps.
   - **Secondary views:** open an editor that exposes secondary panels, show a panel for the first
     time, switch/expand/collapse it, change the splitter width, and switch to another panel. Confirm
     the header title/actions/icon are present on first appearance and remain attached after each
     transition. Remove a panel and re-add it, then confirm its header and header buttons still
     respond; this specifically exercises the listener release/reinstall path changed by US-1208
     as well as the former ref-fired second pass.

## Concerns

- The single-pass change is an API change in the shared stack. Preserve the old `headerRef` path
  for any non-secondary caller; the factory is an additive path, not a global removal of header
  callbacks.
- The current shared stack has the US-1208 release-handle shape: `createPanel()` stores the header
  listener release in `headerRelease` (`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:121-139`),
  the buttons host stores `buttonsRelease` at `:182-188`, and removal releases the header and
  buttons listeners at `:235-240`. The factory rework must leave these handles intact and must be
  checked specifically across panel removal and re-addition.
- `childrenFactory` must be evaluated after `updateHeader()` and only when content is rendered.
  `SecondaryViewsView` currently sets `alwaysRenderContent: true`; changing that ordering or flag
  would reintroduce a null header or defer lazy-view creation.
- The uikit verdict is **conforms with an explicit additive prop**: Rules 6, 7, and 9 permit native
  composition, explicit prop-surface extension, and `fillSlot()` into a view-owned region. The
  contract must document factory-wins precedence when both content inputs are present, so the
  shared component has no ambiguous update behavior.
- `fillSlot()` replaces the content host's children on each update by design. This task removes the
  extra stack update caused by header publication; it does not claim to redesign the stack's
  retained-content slot behavior.
- `TrustedBoardsListView` has a future-facing cache invalidation gap: its current usage path is
  refreshed by each probe's promise, while `invalidateBoardUsage()` has no current caller. If a
  manifest watcher starts calling that invalidator, it must notify this view explicitly rather than
  relying on a deleted parent update arm.
- Stabilizing `MainPageView`'s callback changes allocation frequency, not the `onClose` behavior.
  A genuinely changed callback must still reach `ToolsEditorsPanelView`, `PinnedRailView`, and the
  active body view.
- No tests or test harnesses are to be added. Verification is manual use in the running app, as
  required by EPIC-077.

## Acceptance Criteria

- [ ] `SecondaryViewsView.reconcile()` makes one `updateStack()` call per reconciliation; the
  stack-created header is available to the lazy secondary child during that same update.
- [ ] Secondary headers, actions, icons, collapse/expand behavior, lazy loading, and disposal remain
  correct; the old `headerRef` API remains compatible for non-factory panels.
- [ ] `childrenFactory` conforms to the uikit Rules 6, 7, and 9 rationale recorded above, and its
  prop comment explicitly says that it wins over `children` when both are supplied. The story's
  Tags, Categories, and Hostnames descriptors remain on the ordinary `children` path.
- [ ] The shared-stack removal/re-addition path preserves the US-1208 `headerRelease` and
  `buttonsRelease` handles without duplicate listeners.
- [ ] `BuiltinEditorsListView.ts:64-66` has no parent-update refresh arm. Its
  `browser-profiles` and `pinned-editors` subscription remains the complete refresh path for its
  mutable inputs.
- [ ] `TrustedBoardsListView.ts:67-69` has no parent-update refresh arm. Its trust-path, published
  catalog, installed-registry, pinned-settings, load-completion, and usage-probe paths remain live.
- [ ] `ToolsEditorsPanelView.ts:85-90` retains a comparison gate for `onClose`; it does not gain a
  settings subscription or an ungated refresh.
- [ ] `MainPageView` supplies one stable menu-close callback at construction and update time, so
  equal `onClose` props reach the Tools gate as equal identities.
- [ ] No shared helper used by these views becomes dead code; the helper census and no-change list
  remain accurate.
- [ ] Manual running-app verification above is performed and observations are recorded here. Build
  success alone is not acceptance.
- [ ] No dashboard entry is added; EPIC-077 already lists US-1211.

## Files Changed Summary

| File | Planned status | Purpose |
|---|---|---|
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts` | Change | Add the additive `childrenFactory` panel contract. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` | Change | Invoke the factory after header creation and preserve custom-header chevron behavior. |
| `src/renderer/ui/secondary-views/SecondaryViewsView.ts` | Change | Remove the dirty/ref second pass and use the one-pass factory. |
| `src/renderer/ui/sidebar/BuiltinEditorsListView.ts` | Change | Delete the redundant ungated `onUpdate()` refresh arm. |
| `src/renderer/ui/sidebar/TrustedBoardsListView.ts` | Change | Delete the redundant ungated `onUpdate()` refresh arm. |
| `src/renderer/ui/app/MainPageView.ts` | Change | Stabilize the callback identity feeding the Tools gate. |
| `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts` | No change expected | Existing `onClose` comparison is the required gate; current source has no refresh arm. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` | No change | Continues to consume the stack-owned header element. |
| `src/renderer/ui/secondary-views/secondary-view-registry.ts` | No change | `SecondaryViewProps.headerRef` remains compatible. |
| `src/renderer/ui/secondary-views/LazySecondaryViewView.ts` | No change | Existing lazy loading and update path remain. |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | No change | Own keyed settings subscription and intentional layout update remain. |
| `src/renderer/ui/sidebar/MenuBarView.ts` | No change | Existing right-view routing remains; it will receive the stabilized callback. |
| `src/renderer/ui/sidebar/pinned-items.ts` | No change | `pinned-editors` read/write helper remains a live input. |
| `src/renderer/ui/sidebar/tools-editors-registry.ts` | No change | Static/profile editor derivation remains shared. |
| `src/renderer/api/settings.ts` | No change | Existing keyed change emission proves subscription coverage. |
| `src/renderer/api/board-trust.ts` | No change | Existing trusted-path subscription remains. |
| `src/renderer/api/published-boards.ts` | No change | Existing catalog subscription remains. |
| `src/renderer/api/board-install-registry.ts` | No change | Existing installed-registry subscription remains. |
| `src/renderer/api/board-updates.ts` | No change | Existing update derivation remains shared. |
| `src/renderer/editors/board/board-usage-cache.ts` | No change | Existing cached probe path remains; no current invalidator caller. |
| `src/renderer/editors/board/BoardsTreeView.ts` | No change | Retained tree and explicit visible-row repaint behavior are measured, not changed here. |
| `src/renderer/uikit/Tree/TreeView.ts` | No change | Virtualized tree behavior is retained. |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | No change | Virtualized list cost is measured, not changed here. |
| `src/renderer/uikit/shared/vanilla-view.ts` | No change | Existing mounted/pre-mount update semantics are retained. |
| `src/renderer/core/state/state.ts` | No change | Existing notification and selector semantics are retained. |
| `doc/active-work.md` | No change | EPIC-077/US-1211 is already listed; user explicitly forbids a dashboard entry. |

The task document itself is the only documentation file added for this task.
