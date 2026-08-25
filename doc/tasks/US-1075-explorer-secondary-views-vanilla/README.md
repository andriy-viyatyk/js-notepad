# US-1075 — Explorer secondary views to vanilla

Part of [EPIC-063](../../epics/EPIC-063.md) (De-React Epic E5). This is the final provider
conversion before US-1076 deletes the React secondary-view contract. This document is a plan only;
it does not implement the conversion.

## Goal

Move the `explorer` and `boards` secondary-view registrations to the vanilla arm and implement both
providers as `VanillaView<SecondaryViewProps>` classes. The converted panels must preserve their
navigation, trust, search, board/tool management, drag/tree, dialog, header-action, icon, and
collapsed-panel behavior without creating React roots for their ordinary DOM surface.

## Background

### Scope and why this is the last conversion

`src/renderer/editors/register-editors.ts` currently registers both panels on the implicit React arm:

```ts
secondaryViewRegistry.register({
    id: "explorer",
    label: "Explorer",
    loadComponent: () => import("./explorer/ExplorerSecondaryView"),
});

secondaryViewRegistry.register({
    id: "boards",
    label: "Boards",
    icon: "board-color",
    loadComponent: () => import("./explorer/BoardsSecondaryView"),
});
```

The target is the same extensionless dynamic import with an explicit vanilla arm:

```ts
secondaryViewRegistry.register({
    id: "explorer",
    label: "Explorer",
    arm: "vanilla",
    loadComponent: () => import("./explorer/ExplorerSecondaryView"),
});

secondaryViewRegistry.register({
    id: "boards",
    label: "Boards",
    icon: "board-color",
    arm: "vanilla",
    loadComponent: () => import("./explorer/BoardsSecondaryView"),
});
```

This is the largest provider in E5: `ExplorerSecondaryView.tsx` is 309 lines and
`BoardsSecondaryView.tsx` is 304 lines. Explorer is the densest remaining React secondary surface:
it uses the file tree provider, four content-link encoders plus the default-app content opener,
tool trust and
registration, board links, the register-toolset dialog, tree state/selection/reveal state, and the
Explorer header actions (up, search, boards, collapse-all, plus conditional close). Boards adds board trust, registered
tools, filesystem deletion, pins, busy-board state, two board-creation flows, confirmation, two
tree views, a segmented switch, an empty-state action panel, and a split button.

EPIC-063 §E5-3 measured four of the sidebar's six baseline React roots as Explorer header glyphs.
Each JSX icon passed to a vanilla-capable `IconButton` is a separate root through `fillSlot`, so
this task must convert the icon call sites as part of the provider conversion, not merely replace
the provider body wrapper. The close-out target is zero ordinary React roots in these two panels;
the unrelated `BoardWebview` exception belongs to the board-secondary provider and is not in this
task.

US-1069 is landed: `SecondaryViewProps.iconElement` is the DOM arm, `SideBarPanelHeaderDomProps.icon`
accepts `Node | undefined`, and `ExplorerEditorModel.getIconElement()` is available. The `boards`
registration is one of only two registrations with an icon override, so its `iconElement` must be
the registry's `board-color` glyph; do not replace it with the editor fallback.

US-1070's `src/renderer/editors/explorer/SearchSecondaryView.ts` is the Explorer sibling reference:
it uses `VanillaView`, `IconButtonView`, `createPanelElement`, `createSideBarPanelHeader`, and the
DOM `props.iconElement` arm. Its lifecycle should be read as an idiom, but this task must correct
its constructor-era shape where necessary: `src/renderer/uikit/CLAUDE.md` requires a converted
view's constructor to create only its stable root/model state; child DOM, listeners, subscriptions,
and timers belong in `onMount()`.

### Complete importer audit and per-file verdicts

The following is the full `src/` importer search for every React file considered for this task. A
dynamic registration import counts as an importer. Comments and internal type references are shown
separately only where useful; they are not additional runtime consumers.

| React file | Full importer list in `src/` | Verdict | Reason / face that remains |
|---|---|---|---|
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` | `src/renderer/editors/register-editors.ts:21` (`import("./explorer/ExplorerSecondaryView")`) | **Take; rename to `.ts`** | The registration is the only runtime importer. The default export becomes the vanilla ctor. |
| `src/renderer/editors/explorer/BoardsSecondaryView.tsx` | `src/renderer/editors/register-editors.ts:42` (`import("./explorer/BoardsSecondaryView")`) | **Take; rename to `.ts`** | The registration is the only runtime importer. The default export becomes the vanilla ctor. |
| `src/renderer/editors/board/BoardsTree.tsx` | `src/renderer/editors/explorer/BoardsSecondaryView.tsx:27`; `src/renderer/editors/board/BoardToolbar.tsx:19`; `src/renderer/ui/sidebar/TrustedBoardsListView.tsx:15` | **Keep React signature; make it a shim** | `BoardToolbar` and `TrustedBoardsListView` survive as React consumers. Preserve `BoardsTreeProps` and `BoardsTree`; the function becomes `mountVanilla(BoardsTreeView, props)`, while the single implementation moves to `BoardsTreeView.ts`. |
| `src/renderer/editors/tools/ToolsTree.tsx` | `src/renderer/editors/explorer/BoardsSecondaryView.tsx:27`; `src/renderer/ui/sidebar/TrustedToolsListView.tsx:9` | **Keep React signature; make it a shim** | `TrustedToolsListView` survives as a React consumer. Preserve `ToolsTreeProps` and `ToolsTree`; the function becomes `mountVanilla(ToolsTreeView, props)`, while the single implementation moves to `ToolsTreeView.ts`. |

The tree entries were therefore not “dragged in” exclusively by the two secondary views. Rule 2
requires the React-facing signatures to stay, and Rule 1 prevents treating the surviving React
parents as converted in this task. The implementation still remains singular: each `.ts` native
view owns the tree behavior, and each `.tsx` export is only a `mountVanilla` compatibility shim.
The converted `BoardsSecondaryView` instantiates the native views directly; existing React parents
continue to call the unchanged exported names and therefore use the same implementation.

The surviving board props are not an irreducibly React boundary. `BoardsTreeProps.renderTrailing`
returns `ReactNode` today because the trusted-boards caller supplies JSX (`BoardPinAction` and its
`Panel`/`Tag` update branch), while the converted Boards panel supplies no trailing callback. The
native view passes the callback's `Node | ReactNode` result through the widened `Tree` trailing slot
and `fillSlot`; React values remain supported for the shim callers. `trailingVisible` is used only
by `TrustedBoardsListView` (not by `BoardsSecondaryView`, `BoardToolbar`, or
`TrustedToolsListView`) and must remain in `BoardsTreeProps`; the native row path must preserve its
`always` versus `hover` behavior. `ToolsTreeProps.renderTrailing` is unused by both current
consumers, but its `ReactNode` signature remains unchanged and its native slot accepts the same
`Node | ReactNode` arms.

| Caller | `BoardsTree` / `ToolsTree` slot arms actually supplied |
|---|---|
| `BoardsSecondaryView` | Boards: `renderTrailing` returns JSX for board actions; no `trailingVisible`. Tools: no `renderTrailing`; the current JSX `emptyMessage` is converted to the documented native string. |
| `BoardToolbar` | Boards: no `renderTrailing`, no `trailingVisible`, and no React-only trailing value. |
| `TrustedBoardsListView` | Boards: `renderTrailing` returns JSX (`BoardPinAction` or a JSX `Panel`/`Tag` group) and `trailingVisible` returns booleans. Its JSX empty message remains behind the shim. |
| `TrustedToolsListView` | Tools: no `renderTrailing`; its JSX empty message remains behind the shim. |

### Shared dialogs: React faces stay behind their existing call signatures

The panel conversion does not convert any dialog. The three panel-facing dialog modules already
have native dialog views behind their React-facing `show*Dialog(props)` functions, and their other
callers prove that changing those signatures here would cross a shared boundary.

| Dialog React module | All verified production callers in `src/` | Decision |
|---|---|---|
| `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx` | `src/renderer/editors/explorer/ExplorerSecondaryView.tsx:17,106`; `src/renderer/api/mcp/tool-commands.ts:143-144`; internal type import from `RegisterToolsetDialogView.ts` | Keep the React-facing `showRegisterToolsetDialog(props)` signature. The vanilla Explorer view calls this existing API; no dialog change. |
| `src/renderer/ui/dialogs/CreateBoardDialog.tsx` | `src/renderer/editors/explorer/BoardsSecondaryView.tsx:12,132,141`; internal type import from `CreateBoardDialogView.ts` | Keep the React-facing `showCreateBoardDialog(props?)` signature. The native panel invokes it unchanged; no dialog change. |
| `src/renderer/ui/dialogs/ConfirmationDialog.tsx` | `src/renderer/api/board-updates.ts:127-128`; `src/renderer/api/board-install.ts:130-131`; `src/renderer/api/ui.ts:30-31`; `src/renderer/editors/explorer/BoardsSecondaryView.tsx:13,157`; `src/renderer/editors/text/ScriptPanel.tsx:278-279`; `src/renderer/editors/graph/GraphBody.tsx:15,379`; `src/renderer/editors/graph/GraphMutationModel.ts:2,80`; `src/renderer/editors/graph/GraphGroupActionsModel.ts:1,103,165,208`; `src/renderer/editors/git-tree/GitChangesView.tsx:13,93`; `src/renderer/editors/log-view/index.tsx:6,56`; `src/renderer/editors/board-info/BoardInfoEditorModel.ts:381-382,469-472`; `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts:518-519`; internal type import from `ConfirmationDialogView.ts` | Keep the React-facing `showConfirmationDialog(props)` signature. The native panel calls it unchanged; no dialog change. |

### Existing native infrastructure and exact composition seams

- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` is the native provider view. The
  `TreeProviderView` export is only a `mountVanilla` shim. Explorer must instantiate
  `TreeProviderViewImpl` directly, retain its `TreeProviderViewModel` reference for `collapseAll()`
  and `revealItem()`, and pass DOM trailing nodes instead of JSX.
- `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` is the native header. It tracks
  `currentHeader` and reparents its title/actions/icon nodes when `headerRef` changes. The panel
  must call `header.update(...)` on every props update and never cache the first header element:
  `headerRef` is null for at least one early pass and can change later.
- `src/renderer/uikit/Tree/TreeView.ts` is the native tree engine. Its current source already
  accepts `Node` for `TreeItem.label` and `TreeItem.trailing`, `TreeProps.renderTrailing`, and
  `getIconElement`; use those current types from US-1071 and do not add a cast or repeat that
  widening. `TreeProviderViewModelProps.renderTrailing` is likewise already `ReactNode | Node`.
- `src/renderer/uikit/shared/slots.ts` and `src/renderer/theme/icon-registry.ts` are the DOM icon
  path. `createIconElement(name, props)` is required for known registry icons. An unknown name
  warns in development and produces an empty SVG, so every name below must be checked against the
  registry.
- `src/renderer/uikit/CLAUDE.md` Rule 9 requires constructors to avoid child DOM/listeners/
  subscriptions and requires child ownership via `child()`, native events, `bind()` for state
  projections, and explicit disposal. `getLabel`/`getValue`/`getIcon` accessor props must not be
  added; remove any such residue at the conversion point if encountered.
- `SplitButtonView`, `ButtonView`, `TagView`, `DotView`, and `SegmentedControlView` all exist as
  native view classes. `Panel` has no separate `PanelView`, so use `createPanelElement`/
  `applyPanelAttributes`; use `createTextElement` for native text. No host-side replacement
  primitive is needed, and no new uikit primitive is planned.
- `src/renderer/theme/palette-colors.ts` owns `MEMORY_ICON_COLOR`; preserve that token when
  constructing the DOM memory glyph. Do not add hardcoded colors or inline color values.

### Verified icon coverage

The JSX glyphs in the two panel files and the two shared tree renderers were enumerated directly
from source. The table is the conversion map; it also records where a glyph is not a registry icon.

| Existing JSX glyph / use | Verified native source | Registry coverage / props |
|---|---|---|
| `SearchIcon` — Explorer header, Explorer context menu | `createIconElement("search", { width: 14, height: 14 })` for the menu; `IconButtonView({ icon: "search" })` for buttons | `search` exists in `theme/icon-registry.ts`; header buttons use the primitive's normal size. |
| `MemoryIcon color={MEMORY_ICON_COLOR}` — Explorer `.mneme` trailing action | `createIconElement("memory", { color: MEMORY_ICON_COLOR })` | `memory` exists; retain the palette token from `theme/palette-colors.ts`. |
| `BoardIcon` — Explorer board action, board-manifest action, empty-state button, split-button item, board tree fallback | `IconButtonView({ icon: "board" })`, `ButtonView({ icon: "board" })`, menu `createIconElement("board", { width: 14, height: 14 })`; board rows use `createBoardGlyphElement(root, 16)` so custom `icon.svg/png/ico` behavior survives | `board` exists. `createBoardGlyphElement` intentionally handles the custom image fallback and subscribes to board-icon changes. |
| `ToolsIcon` — Explorer tools-manifest action and tool tree rows | `IconButtonView({ icon: "tools" })`; `createIconElement("tools", { width: 16, height: 16 })` in the native tool tree | `tools` exists. |
| `GitIcon` — Explorer `.git` trailing action | `IconButtonView({ icon: "git" })` | `git` exists. |
| `FolderUpIcon` — Explorer header | `IconButtonView({ icon: "folder-up" })` | `folder-up` exists. |
| `CollapseAllIcon` — Explorer header | `IconButtonView({ icon: "collapse-all" })` | `collapse-all` exists. |
| `CloseIcon` — Explorer header and Boards header | `IconButtonView({ icon: "close" })` | `close` exists. |
| `FolderIcon` — board/tool tree folder rows | `createFolderIconElement()` from `components/icons/icon-elements.ts` | Not an icon-registry glyph: current `FolderIcon` is the legacy folder-emoji span. Preserve the existing helper rather than inventing an icon name. |
| `PlusIcon` — Boards empty-state buttons and split button | `ButtonView({ icon: "plus" })`, `SplitButtonView({ icon: "plus" })` | `plus` exists. |
| `RemoveIcon` — toolset context menu | `createIconElement("remove", { width: 14, height: 14 })` | `remove` exists. |
| `OpenLinkIcon` — board context menu | `createIconElement("open-link", { width: 14, height: 14 })` | `open-link` exists. |
| `CopyIcon` — board context menu | `createIconElement("copy", { width: 14, height: 14 })` | `copy` exists. |
| `DeleteIcon` — board context menu | `createIconElement("delete", { width: 14, height: 14 })` | `delete` exists. |
| `board-color` registration override | Host-supplied `props.iconElement`; do not use `props.icon` or editor fallback | `board-color` exists and is the explicit registry override for `boards`. |

### Current state and effect residue

The React files contain the state that cannot survive a function-component deletion:

- Explorer uses `useMemo` for provider creation, initial tree state, and provider-dependent
  callbacks; `useEffect` for reveal; `useRef` for the native provider model; and callbacks for
  navigation, context menus, and trailing actions. The vanilla class should hold the provider,
  provider view/model, action views, and current props as fields, use `bind()` for
  `rootPath`/selection/reveal projections, and move reveal to an explicit callback after the tree
  has mounted.
- Boards uses `useEffect` for board-trust load and registered-tools initialization, `useState` for
  the local boards/tools tab, `useMemo` for root filtering, `useBusyBoardRoots()` for reactive busy
  dots, and callbacks for all operations. The vanilla class should hold `tab`, derive filtered
  arrays from the current model values, subscribe through framework-neutral model methods, and
  update the active native body/header in `onUpdate`.

The `expanded` input is behaviorally meaningful. In `BoardsSecondaryView`, it gates only the
switch bar containing `SegmentedControl` and `SplitButton`; the header close action and the
selected body remain rendered while collapsed. Preserve that exact gate in the vanilla view and
update it whenever `expanded` changes. `ExplorerSecondaryView` currently does not read `expanded`;
the conversion must intentionally keep Explorer actions/body mounted and active while collapsed,
rather than silently introducing a new gate.

### Files that need NO changes

These files were inspected and have no conversion work in this task:

- `src/renderer/editors/explorer/ExplorerEditorModel.ts` — US-1069 already supplies
  `getIconElement`; its model methods (`openSearch`, `openBoards`, `navigateUp`, `makeRoot`,
  `setSelectedHref`, `setTreeState`, `closeSearch`, `closeBoards`) remain the native view API.
- `src/renderer/editors/explorer/SearchSecondaryView.ts` — the landed vanilla sibling is a
  reference only and is not part of US-1075.
- `src/renderer/components/tree-provider/TreeProviderView.tsx` and
  `src/renderer/components/tree-provider/TreeProviderViewModel.ts` — the native implementation
  and current DOM slot types already exist; the Explorer parent uses `TreeProviderViewImpl`
  directly.
- `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` and
  `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` — use the existing React/native
  faces respectively; the latter already re-parents late/changing `headerRef`.
- `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx`, `CreateBoardDialog.tsx`, and
  `ConfirmationDialog.tsx` plus their `*View.ts` files — shared dialog call signatures remain
  unchanged.
- `src/renderer/editors/board/boards-tree-build.ts` and
  `src/renderer/editors/tools/tools-tree-build.ts` — pure, framework-free data builders; both
  native tree faces reuse them.
- `src/renderer/editors/board/BoardToolbar.tsx`, `src/renderer/ui/sidebar/TrustedBoardsListView.tsx`,
  and `src/renderer/ui/sidebar/TrustedToolsListView.tsx` — surviving React tree consumers; their
  calls and props stay unchanged.
- `src/renderer/editors/board/board-glyph-element.ts` and
  `src/renderer/editors/board/board-icon-cache.ts` — existing DOM board-glyph builder and
  subscription are reused; no board-icon behavior change.
- `src/renderer/editors/board/BoardGlyph.tsx` and `src/renderer/components/icons/FileIcon.tsx` —
  the surviving React tree face keeps its existing board/folder glyph components; the native face
  uses the already-existing DOM helpers instead.
- `src/renderer/content/tree-providers/FileTreeProvider.ts`, `src/renderer/api/board-trust.ts`,
  `src/renderer/api/tools/tools-trust.ts`, `src/renderer/api/fs.ts`, and
  `src/renderer/ui/sidebar/pinned-items.ts` — existing providers, trust, filesystem, and pin
  contracts are called from the native view but are not converted.
- `src/renderer/theme/icon-registry.ts`, `src/renderer/theme/icons.tsx`,
  `src/renderer/theme/palette-colors.ts`, `src/renderer/uikit/shared/slots.ts`, and existing
  uikit `*View` implementations — registry coverage and native primitive arms are already
  present.
- `src/renderer/content/persephone-board-link.ts`, `src/renderer/content/persephone-toolset-link.ts`,
  `src/renderer/content/tree-providers/tree-provider-link.ts`, `src/renderer/content/git-tree-link.ts`,
  `src/renderer/content/mneme-folder-link.ts`, `src/renderer/content/open-with-default-app.ts`,
  and the Explorer APIs/dialogs — callers change runtime form only; their contracts do not.
- `doc/active-work.md` — explicitly not updated per the task instruction; EPIC-063 already lists
  US-1075.

## Implementation Plan

The stages below follow the requested landing order and keep `main` releasable after each one.
Stage 1 is independently shippable: it converts only the `explorer` registration/provider and
leaves `boards` on its current React arm. Stage 2 is independently shippable: it converts the
`boards` panel shell and behavior, but temporarily mounts the two surviving React tree faces behind
explicit, named compatibility islands. Stage 3 is independently shippable: it adds the shared
trees' native faces and replaces those two temporary islands, delivering the zero-root end state.
The temporary Stage-2 roots are an explicit intermediate landing boundary, not an accepted final
architecture and not the later board-iframe exception. No stage requires the later contract deletion.

### Stage 1 — Explorer panel

1. Rename `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` to
   `src/renderer/editors/explorer/ExplorerSecondaryView.ts` and replace the function component with
   a public `ExplorerSecondaryView extends VanillaView<SecondaryViewProps>`. The constructor creates
   only a stable `createPanelElement({ name: "explorer-secondary-view", direction: "column", flex: true,
   minHeight: 0, overflow: "hidden" })` root and stores initial props; it does not construct the
   provider view, action buttons, header, listeners, or subscriptions.
2. In `onMount()`, validate/cast the model to `ExplorerEditor`, create the current
   `FileTreeProvider` only when `rootPath` is nonempty, claim and mount
   `TreeProviderViewImpl`, and retain its model callback. Forward the existing props exactly:
   `provider`, `multiSelect`, selected href, `initialState`, `onStateChange`, item click/double-click,
   context menu, and native `renderTrailing`. Use `TreeProviderViewImpl` directly, never the
   `TreeProviderView` React shim.
3. Replace the `useEffect` reveal path with a `bind()` on `model.revealVersion`. When the version is
   positive and the current selection exists, call the retained provider model's `revealItem()`
   after the same safe render timing used by the native tree; do not read a stale ref or create a
   second provider model. Bind selection changes to the provider view's `selectedHref` input, and
   bind/root-update `rootPath` so a root change disposes the old `FileTreeProvider` and native
   provider view, creates the new one, and preserves the existing `model.treeState`/state callback
   semantics.
4. Build the five header action buttons as owned `IconButtonView`s and pass a native action node to
   `createSideBarPanelHeader`: Folder Up → `folder-up`, Search → `search`, Boards → `board`,
   Collapse All → `collapse-all`, Close → `close`. Preserve `canNavigateUp`, `provider.navigable`,
   `page.sidebarMandatory`, `stopPropagation()`, and the existing model methods. Rebuild/update the
   action-node projection when root/provider/mandatory state changes; do not pass JSX through
   `fillSlot`.
5. Convert every Explorer row trailing action to a native `IconButtonView` node. Cache/dispose
   per-item action views because `TreeProviderViewImpl`/`TreeView` may recycle row hosts; return
   `undefined` for rows without an action. Use the icon map in the coverage table, including
   `memory` with `MEMORY_ICON_COLOR`, and pass `createIconElement("search", { width: 14, height: 14 })`
   into the native context menu. Preserve board link metadata (`pageId`, `sourceId`, `explorerRoot`),
   `.git`/`.mneme` parent calculation, tool trust/register flow, and default-app double-click.
6. Create/update the native header in `onMount()` and call `header.update({ headerRef: props.headerRef,
   icon: props.iconElement, title: "Explorer", actions: ... })` on every `onUpdate()`. Dispose the
   provider view, cached trailing/action views, header, and subscriptions in ownership order. The
   current `FileTreeProvider` remains model-owned (as `ExplorerEditorModel.dispose()` already
   defines); dispose and null it only when replacing it for a root-path change, not merely because
   this panel view is being retired. Never use `props.icon` or cache `headerRef`.
7. Add `arm: "vanilla"` to the `explorer` registration in
   `src/renderer/editors/register-editors.ts`. Touching this importer after the rename is part of
   the dev-loop verification so Vite does not retain a stale `.tsx` dynamic-module resolution.

### Stage 2 — Boards panel

8. Rename `src/renderer/editors/explorer/BoardsSecondaryView.tsx` to
   `src/renderer/editors/explorer/BoardsSecondaryView.ts` and implement a public
   `BoardsSecondaryView extends VanillaView<SecondaryViewProps>`. Keep the constructor root-only.
   Store `tab` as a view field initialized to `"boards"`; do not recreate it on every prop update.
9. Replace the two `useEffect`s with mount-time asynchronous calls to `boardTrust.load()` and
   `registeredTools.ensureInitialized()`, plus framework-neutral subscriptions. `boardTrust` already
   exposes `subscribePaths`; add a narrow `registeredTools.subscribeToolsets(listener)` in
   `src/renderer/api/tools/registered-tools.ts` over its existing reactive toolset state. Add a
   narrow `subscribeBusyBoardRoots(listener)` in `src/renderer/editors/board/busy-boards.ts` over
   its existing `busyBoardsState`; keep `useBusyBoardRoots()` unchanged for React callers. Dispose
   all three subscriptions from the native view.
10. Replace `useMemo` filtering with view methods that read the current `boardTrust.listPaths()` and
    `registeredTools.toolsets`, normalize with `fpNormalizeForCompare`, and preserve the inclusive
    root/subtree filter. Update the active native body when root path, trust paths, toolsets, busy
    roots, or tab changes; do not assume a React render will perform this projection.
11. Preserve the exact `expanded` behavior: construct the header close button and selected body
    regardless of `expanded`; attach the switch bar only when `expanded !== false`. The switch bar
    owns `SegmentedControlView` with string labels and, on the boards tab, `SplitButtonView` with
    `plus`, `New board`, and a native menu item using `createIconElement("board", { width: 14,
    height: 14 })`. When collapsed, remove only the switch-bar node; when expanded again, reattach
    the already-owned controls and update their props.
12. Convert create/delete/open actions without changing API calls: retain the two
    `showCreateBoardDialog` payloads, current-page vs. new-tab link metadata, `fs.exists`/`fs.removeDir`
    behavior, `errMessage` notification, `boardTrust.untrust`, and `removePin`. Build board context
    menu entries with native `open-link`, `copy`, and `delete` icon nodes. Keep the busy indicator as
    an owned/cached `DotView({ color: "success", title: "Board processes are running" })` node;
    dispose indicators when their body/tree is retired.
13. Build the empty board branch with `createPanelElement` and existing native `Text`/`ButtonView`
    arms. Keep the current labels, `primary` variant, spacing tokens, and two create callbacks.
    Until Stage 3 lands, mount the existing `BoardsTree`/`ToolsTree` React faces only inside
    explicit `mountReactHandle` hosts named for the temporary compatibility boundary; pass the
    unchanged React-facing props and do not hide those roots in an ad-hoc DOM imitation. Stage 2's
    verification records those two temporary roots and confirms all behavior, but does not claim
    the final E5-3 zero-root measurement.
14. Use `createSideBarPanelHeader` with `props.iconElement`, title `Boards`, and the native close
    button. `boards` must display the host-provided `board-color` override. Update the header with
    the current `headerRef` and current close node on every props update, including late/null header
    transitions. Add `arm: "vanilla"` to the `boards` registration.

### Stage 3 — Shared board/tool tree native faces

15. Create `src/renderer/editors/board/BoardsTreeView.ts` and move the tree behavior there into the
    **only** `BoardsTreeView extends VanillaView<BoardsTreeViewProps>` implementation. Reuse
    `buildBoardsTree`; drive `TreeView<BoardTreeNode>` through its default DOM row path with
    `getIconElement` (`createBoardGlyphElement` for boards and `createFolderIconElement` for folders),
    `onChange`, `getContextMenu`, `defaultExpandAll`, `rowHeight: 28`, active-index state, and the
    widened `renderTrailing` slot. The native props accept `Node | React.ReactNode` for trailing
    values and preserve `trailingVisible` for the trusted-boards shim caller; use the native
    TreeItem trailing-visibility path so `always` versus `hover` remains unchanged. If the current
    Tree default-row API still lacks that visibility callback, add the smallest library-level
    `getTrailingVisibility` hook to `Tree`/`TreeView` rather than reintroducing a React `renderItem`
    island or duplicating row rendering. Cache each row's icon node by stable
    `BoardTreeNode.value` so a normal repaint does not move/rebuild a visible icon; clear board
    entries on `subscribeBoardIconChanges()` and refresh the tree rows so custom board images and
    fallback glyphs update without React. `BoardsTree.tsx` keeps `BoardsTreeProps` and the exported
    `BoardsTree` name, but its body becomes only `mountVanilla(BoardsTreeView, props)`.
16. Create `src/renderer/editors/tools/ToolsTreeView.ts` as the **only** `ToolsTreeView` implementation
    with the same `TreeView` default-row path, `buildToolsTree`, `createFolderIconElement`, native
    `tools` icon, open callback, context-menu callback, `defaultExpandAll`, row height, active-index
    state, widened trailing slot, and string empty message. Cache folder/tool icon nodes by stable
    node value so the same visible row keeps the same Node identity across updates. Its trailing
    callback accepts the existing `ReactNode` arm as well as a DOM `Node`, even though neither
    current ToolsTree caller passes `renderTrailing`. `ToolsTree.tsx` keeps `ToolsTreeProps` and the
    exported `ToolsTree` name, but its body becomes only `mountVanilla(ToolsTreeView, props)`.
17. Replace Stage 2's named React compatibility hosts in `BoardsSecondaryView` with direct
    `new BoardsTreeView(...)` and `new ToolsTreeView(...)`, then remove the temporary
    `mountReactHandle` imports/roots from that panel. The Stage-2 React islands therefore disappear
    automatically when Stage 3 lands: the vanilla panel owns the native classes directly, while
    `BoardToolbar`, `TrustedBoardsListView`, and `TrustedToolsListView` call the unchanged React
    exports and receive the same single implementation through their shims. Do not change those
    three React parents or either tree builder in this task. Record a follow-up to remove the
    `React.createElement(TrustedBoardsTreeSlot, ...)` and
    `React.createElement(TrustedToolsTreeSlot, ...)` islands in the two existing sidebar
    `VanillaView`s; Rule 1 keeps that parent conversion out of this task.

### Non-obvious before → after projections

#### Secondary-view body and header

Before (`ExplorerSecondaryView.tsx`):

```tsx
return (
    <>
        <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Explorer" actions={actions} />
        <TreeProviderView
            onModel={(value) => { treeProviderModel.current = value; }}
            provider={provider}
            renderTrailing={renderTrailingAction}
        />
    </>
);
```

After (`ExplorerSecondaryView.ts`):

```ts
this.header.update({
    headerRef: props.headerRef,
    icon: props.iconElement,
    title: "Explorer",
    actions: this.actionFragment(),
});
this.treeProviderView?.update(this.treeProviderProps(this.model));
```

The `TreeProviderViewImpl` child is mounted and owned by the class; the header receives native
`Node`s. The implementation must update/reparent rather than cache the original `headerRef`.

#### JSX icon and trailing action

Before:

```tsx
<IconButton
    name="explorer-open-git"
    icon={<GitIcon />}
    onClick={(e) => { e.stopPropagation(); openGit(); }}
/>
```

After:

```ts
const button = this.trailingButton(item.href, {
    name: "explorer-open-git",
    title: "Open Git Tree",
    icon: "git",
    onClick: (event) => {
        event.stopPropagation();
        this.openGit(item);
    },
});
return button.root;
```

The button is an owned `IconButtonView`, so `IconButtonView` supplies the existing UIKit DOM/CSS
contract and no `fillSlot` React root is created.

#### Boards tree shared boundary

Before (`BoardsTree.tsx`):

```tsx
<TreeItem
    icon={isBoard ? <BoardGlyph boardRoot={src.root} /> : <FolderIcon />}
    label={src.label}
    trailing={isBoard ? renderTrailing?.(src.root) : undefined}
/>
```

After (`BoardsTree.tsx` is only the React compatibility shim):

```tsx
export function BoardsTree(props: BoardsTreeProps): React.ReactElement {
    return mountVanilla(BoardsTreeView, props);
}
```

The sole tree implementation in `BoardsTreeView.ts` uses the already-widened Tree slots:

```ts
return {
    items: buildBoardsTree(props.boards, props.baseRoot),
    getIconElement: (node) => node.kind === "board"
        ? createBoardGlyphElement(node.root, 16)
        : createFolderIconElement(),
    renderTrailing: (node) => node.kind === "board" && node.root
        ? props.renderTrailing?.(node.root)
        : undefined,
};
```

The same pattern applies to `ToolsTree.tsx` and `ToolsTreeView.ts`. There is no second React/native
tree implementation to keep synchronized.

## Concerns

1. **Rule 1 and shared tree ownership.** The epic's “dragged in” label is incomplete: both trees
   have surviving React parents. Their call sites remain untouched, but the `.tsx` exports become
   `mountVanilla` shims over the `.ts` native views, so there is one behavior to maintain rather
   than a native companion that can drift from React. `BoardsTreeProps.trailingVisible` remains on
   the shared signature and is preserved by the native row path; the converted Boards panel does
   not pass it. The two trusted-sidebar React islands remain a separate follow-up because converting
   those parents in this task would violate Rule 1.
2. **Late/changing `headerRef`.** The first native `onUpdate` can receive `null`, and the header
   host can be replaced by the stack. All header updates must pass the current props through
   `SideBarPanelHeaderHandle.update`; caching an element or appending directly will leave actions in
   a detached header.
3. **Collapsed panels stay mounted.** `alwaysRenderContent` means the bodies and subscriptions
   survive collapse. Boards may detach only its switch bar; Explorer intentionally adds no
   `expanded` gate because its React implementation never had one. Tests must exercise collapse,
   switch, and re-expand without reconstructing state.
4. **Provider replacement and pooled trailing nodes.** Tree rows are recycled. Native trailing
   `IconButtonView`/`DotView` nodes need stable per-item ownership and disposal; returning a newly
   created unowned view on every row render will leak listeners or cause ownership errors.
5. **Board icon invalidation.** `BoardGlyph` uses a React hook to observe custom icon probes. The
   native tree must use `createBoardGlyphElement` plus `subscribeBoardIconChanges`, otherwise a
   board that resolves `icon.svg` after first paint remains on the fallback glyph.
6. **Registered-tools and busy-board reactive bridges.** Their React hooks are not callable from a
   vanilla class. The narrow subscriber additions in `registered-tools.ts` and `busy-boards.ts`
   must notify only on the existing selected state slice and must not alter existing React hooks or
   persistence behavior.
7. **Native primitive coverage.** `SplitButton`, `Button`, `Tag`, `Dot`, and `SegmentedControl`
   were checked. The first three have native view classes (`SplitButtonView`, `ButtonView`,
   `TagView`); `Tag` is not needed by this task. No local replacement is allowed. Direct native
   composition must import any stylesheet that the React shim previously imported indirectly,
   especially `Button.css` and `SegmentedControl.css`.
8. **Empty-state slot type.** The current `TreeProps.emptyMessage` is `SlotText`, while US-1071
   widened only tree labels/trailing and tree-provider trailing. Native tree faces should pass plain
   strings for their empty messages and rely on the existing Tree message host styling; do not add
   another slot widening or an unsafe cast.
9. **Icon registry regressions.** `createIconElement` warns and emits an empty SVG for an unknown
   name. The icon table above is an implementation checklist; acceptance requires inspecting the
   final DOM for every header, row, empty-state, and context-menu glyph.
10. **Dev-server rename cache.** After each `.tsx` → `.ts` rename, touch the dynamic importer and
    reload the renderer if Vite reports a stale `.tsx` module. A root count is invalid if the panel
    failed to load, so verify visible content before reporting E5-3 measurements.

The tree visibility hook is a library-level API addition, not a second tree implementation and not
another label/trailing slot widening: it lets the native default row pass the existing
`TreeItemView.trailingVisibility` behavior through the single implementation.

## Acceptance Criteria

- `src/renderer/editors/register-editors.ts` has `arm: "vanilla"` on exactly `explorer` and
  `boards`, with extensionless dynamic imports still code-split.
- Both converted secondary files are public `VanillaView<SecondaryViewProps>` classes in `.ts`
  files, with no JSX, React hooks, `SideBarPanelHeader` React import, or constructor-created child
  DOM/listeners/subscriptions.
- Explorer uses `TreeProviderViewImpl` directly and preserves selection, reveal, root navigation,
  multi-select, drag/drop, context menus, double-click default-app opening, tool trust dialog flow,
  all five header actions, and `headerRef` reparenting.
- Boards preserves board/tool filtering, current-page vs. new-tab links, create/demo/delete flows,
  confirmation and notifications, pin removal, busy dots, boards/tools switching, empty-state
  buttons, and the `expanded` gate exactly as documented.
- All header/row/menu icons in the coverage table render the verified registry glyph or the verified
  native custom-folder/board-glyph helper. The memory glyph retains `MEMORY_ICON_COLOR`, and the
  boards header retains the `board-color` registry override.
- `BoardsTreeView.ts` and `ToolsTreeView.ts` are the sole tree implementations. `BoardsTree.tsx`
  and `ToolsTree.tsx` retain their current exported props/functions and are only `mountVanilla`
  shims, so all surviving React consumers compile and behave through the same implementation.
  Native rows use the existing builders, DOM icon/trailing slots, preserved `trailingVisible`
  behavior, and no `as unknown as` slot workaround.
- Stage 2's two temporary React compatibility islands disappear when Stage 3 directly instantiates
  the native tree views. The separate trusted-sidebar islands are explicitly left for a follow-up.
- `registered-tools.ts` and `busy-boards.ts` expose only the narrow native subscriptions required;
  existing React hooks and state behavior remain unchanged. All new subscriptions and native child
  views are disposed without detached listeners or roots.
- The three shared dialog modules and all other files listed under “Files that need NO changes” are
  unchanged.
- `npx tsc --noEmit`, `npm run lint`, and `git diff --check` pass.
- With the same E5-3 panel setup, the Explorer panel and Boards panel contribute zero ordinary
  React roots (`[data-part="react-slot"]`); the panel visibly renders content before the count is
  recorded. The unrelated board iframe exception is not attributed to this task.
- Runtime verification covers: late null→element and changed `headerRef`; collapsed→expanded
  Boards switch bar; Explorer collapsed behavior; root navigation; tree selection/reveal/collapse;
  board custom-icon resolution; busy-dot refresh; tool registration/unregistration; every header
  action; context-menu icons; dialog launches; and the no-board empty state.

## Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/register-editors.ts` | **Edit** — add `arm: "vanilla"` to `explorer` and `boards`. |
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` → `ExplorerSecondaryView.ts` | **Rename/rewrite** — native Explorer provider, header, actions, state bindings, and DOM icon projections. |
| `src/renderer/editors/explorer/BoardsSecondaryView.tsx` → `BoardsSecondaryView.ts` | **Rename/rewrite** — native Boards/Tools panel, state subscriptions, expanded gate, dialogs, actions, and native child faces. |
| `src/renderer/editors/board/BoardsTreeView.ts` | **New** — sole native boards-tree implementation, including the DOM row/icon/trailing behavior. |
| `src/renderer/editors/board/BoardsTree.tsx` | **Edit** — retain `BoardsTreeProps` and `BoardsTree`; reduce the exported function to a `mountVanilla(BoardsTreeView, props)` shim. |
| `src/renderer/editors/tools/ToolsTreeView.ts` | **New** — sole native tools-tree implementation, including the DOM row/icon/trailing behavior. |
| `src/renderer/editors/tools/ToolsTree.tsx` | **Edit** — retain `ToolsTreeProps` and `ToolsTree`; reduce the exported function to a `mountVanilla(ToolsTreeView, props)` shim. |
| `src/renderer/uikit/Tree/types.ts`, `src/renderer/uikit/Tree/TreeView.ts` | **Edit** — expose the minimal native trailing-visibility callback used to preserve `trailingVisible`; do not widen the already-landed label/trailing slots again. |
| `src/renderer/api/tools/registered-tools.ts` | **Edit** — add a framework-neutral toolset-state subscription for the native panel. |
| `src/renderer/editors/board/busy-boards.ts` | **Edit** — add a framework-neutral busy-root subscription while retaining `useBusyBoardRoots()`. |
| `src/renderer/editors/board/boards-tree-build.ts` | **No change** — reused by both tree faces. |
| `src/renderer/editors/tools/tools-tree-build.ts` | **No change** — reused by both tree faces. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | **No change** — native Explorer tree provider already exists. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` | **No change** — current header handle already tracks/reparents `headerRef`. |
| `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx`, `CreateBoardDialog.tsx`, `ConfirmationDialog.tsx` | **No change** — shared React-facing dialog APIs remain. |
| `src/renderer/editors/board/BoardToolbar.tsx`, `src/renderer/ui/sidebar/TrustedBoardsListView.tsx`, `src/renderer/ui/sidebar/TrustedToolsListView.tsx` | **No change** — surviving React tree consumers retain their signatures. |
| `src/renderer/theme/icon-registry.ts`, `src/renderer/theme/icons.tsx`, `src/renderer/theme/palette-colors.ts` | **No change** — existing registry entries and palette token are reused. |
| `doc/active-work.md` | **No change** — explicitly excluded by the task request. |
