# US-1155 — Remove React roots from trusted sidebar lists

**Epic:** [EPIC-072](../../epics/EPIC-072.md) — De-React E14: the `Component` arm dies  
**Status:** Planned — investigation complete; implementation intentionally not started

## Goal

Convert `TrustedBoardsListView` and `TrustedToolsListView` from React-hosted wrappers to fully
native `VanillaView` compositions. The two list subtrees must contain zero `[data-react-root]`
elements for empty, populated, and changing row sets, while preserving their current loading,
selection, context-menu, open, pin, update, and removal behavior.

## Background

EPIC-072 identifies these two sidebar views as the largest measured React-root concentration in the
application. The current files are already constructed with `new` at
`src/renderer/editors/tools-hub/ToolsHubView.ts:109,112` and
`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:99,100`, but their implementations still use
React compatibility faces:

- `src/renderer/ui/sidebar/TrustedBoardsListView.tsx:1-18` imports React hooks, the React-facing
  `BoardsTree`, and `fillSlot`. `TrustedBoardsTreeSlot` at `:41-128` reads trust, catalog,
  installation, pin, and board-usage state through hooks and renders `BoardsTree`.
- `TrustedBoardsListView.renderSlot()` at `:155-158` passes a React element to
  `fillSlot(this.root, ...)`. `fillSlot` creates a `display: contents` span and a live React root
  for the whole tree. The `BoardsTree` face itself is only a compatibility shim:
  `src/renderer/editors/board/BoardsTree.tsx:31-33` calls `mountVanilla(BoardsTreeView, props)`.
- The boards tree's trailing callback at `TrustedBoardsListView.tsx:78-101` returns React
  `IconButton`, `Panel`, and `Tag` elements. `BoardsTreeView.treeProps()` forwards that callback at
  `src/renderer/editors/board/BoardsTreeView.ts:89-92` to `TreeView`; `TreeView.itemProps()` at
  `src/renderer/uikit/Tree/TreeView.ts:460-462` forwards it to `ListItemView`; and
  `ListItemView.setTrailing()` at `src/renderer/uikit/ListBox/ListItemView.ts:254-277` sends a
  React-valued trailing slot through `fillSlot`. That is the per-visible/recycled-row root term.
- `ListItemProps.trailingElement?: Node` already exists at
  `src/renderer/uikit/ListBox/types.ts:29-30` and `src/renderer/uikit/ListBox/ListItem.ts:44-45`.
  `ListBoxView.ts:381-382` forwards it and `ListItemView.setTrailing()` short-circuits when the
  same Node identity is supplied (`:259-262`). `TreeView` has no corresponding prop or forward yet:
  `TreeView.itemProps()` supplies only `trailing` at `:462`, and `rg trailingElement` in
  `src/renderer/uikit/Tree/` is empty.
- `src/renderer/ui/sidebar/TrustedToolsListView.tsx:1-13` has the same React-hosted wrapper shape,
  but `TrustedToolsTreeSlot` at `:16-55` does **not** provide `renderTrailing`. Its rows therefore
  do not have the boards' trailing-root mechanism; this task still removes its one whole-tree
  wrapper root. The `ToolsTree` face is likewise only a shim:
  `src/renderer/editors/tools/ToolsTree.tsx:34-36` calls `mountVanilla(ToolsTreeView, props)`.

The reusable native tree views already exist:

- `src/renderer/editors/board/BoardsTreeView.ts` constructs and owns a `TreeView<BoardTreeNode>`
  at `:61-72`, builds nodes with `buildBoardsTree`, and accepts a `renderTrailing` callback whose
  return type is `SlotContent` (`:11-12,38-40`).
- `src/renderer/editors/tools/ToolsTreeView.ts` has the corresponding native composition at
  `:59-70`, using `buildToolsTree` and an optional `renderTrailing` callback (`:14-15,41-43`).
- `src/renderer/uikit/Panel/PanelView` does not exist in this checkout. The verified native panel
  replacement is `createPanelElement()` in `src/renderer/uikit/Panel/panel-style.ts:349-356`,
  which applies the same `Panel` attributes and imports `Panel.css`. `Panel.tsx:16-20` explicitly
  describes the React `Panel` as a compatibility shim and directs new vanilla code toward native
  composition.

### What `fillSlot` does and what remains after this task

`src/renderer/uikit/shared/fill-slot.ts:83-147` owns the complete transition for one host:

1. A React-valued slot is wrapped in a Fragment. A `span[data-part="react-slot"]` with
   `display: contents` is appended, and `mountReactHandle()` owns the React root on that span.
2. A subsequent React-valued call reuses the cached root on that host. Callers must not invoke the
   previous cleanup before calling `fillSlot`.
3. A non-React `Node` causes the old React slot to be detached and disposed, then the host is
   replaced and the Node is appended. The returned cleanup is generation-checked and becomes a
   no-op if the host has since been filled again.
4. React-slot cleanup detaches the container immediately and queues root disposal, so a deferred
   React deletion cannot clear content written by a newer fill.

The replacement is therefore two-part: the list wrappers append and own `BoardsTreeView` /
`ToolsTreeView` directly, and the boards tree receives a native `trailingElement` callback. The
small `TreeView` forward needed to reach `ListItemProps.trailingElement` is part of this task. The
downstream `ListItemView` then uses its identity short-circuit for the stable Node; its `fillSlot`
Node arm is only involved when the identity actually changes. The target files themselves must no
longer import or call `fillSlot`, and no React-valued trailing slot may be produced.

### Virtualization and lifetime consequences

The builders' comments in `src/renderer/editors/board/boards-tree-build.ts:2-7` and
`src/renderer/editors/tools/tools-tree-build.ts:2-7` mean the finite input is expanded into a
complete in-memory tree. They do **not** mean every row has a permanent DOM element. The actual
rendering path is virtualized:

- `TreeView` creates a `VirtualGridView` in `enterRealArm()` at
  `src/renderer/uikit/Tree/TreeView.ts:302-308`.
- Its bound `renderCell` at `:361-429` obtains or recycles cell wrappers and creates native
  `TreeItemView` / `SectionItemView` children only for the current cell contents.
- `VirtualGridView` uses `CellPool` (`src/renderer/uikit/VirtualGrid/CellPool.ts:1-17,61-79`);
  released cells retain children, attributes, and listeners. `ListItemView` consequently keeps
  slot hosts stable per pooled row view, and `fillSlot`'s Node arm moves native nodes into those
  hosts without creating React roots.
- `TreeView` deliberately keeps every created row view in `rowViews` and disposes that set when
  the grid leaves the real arm or the tree is disposed (`TreeView.ts:71-77,313-320`). This is not
  ownership of the new per-board trailing views, so the sidebar parent must separately own and
  release those views.

The boards list should keep a map of native trailing records keyed by the board root. A record may
contain a claimed/mounted `IconButtonView`, a claimed/mounted `TagView`, and a plain panel element.
Records are created lazily when a visible board asks for trailing content, but are retained for the
sidebar view lifetime rather than treated as cell lifetime. Before each tree update, prune records
whose board roots are no longer in `boardTrust.listPaths()`; use `releaseChild()` for every claimed
native child and remove the plain panel element. On sidebar disposal, let `VanillaView.dispose()`
dispose the claimed children, then clear the record map and panel references. This explicitly covers
rows that disappear from a rebuilt tree and avoids the obsolete-child class recorded for
`ListBoxView` in EPIC-069's review (the US-1132 finding).

## Implementation plan

### 1. Rename the two native wrappers and remove their React faces

Rename, preserving the classes and import specifiers:

- `src/renderer/ui/sidebar/TrustedBoardsListView.tsx` →
  `src/renderer/ui/sidebar/TrustedBoardsListView.ts`
- `src/renderer/ui/sidebar/TrustedToolsListView.tsx` →
  `src/renderer/ui/sidebar/TrustedToolsListView.ts`

The final files must use native event types and direct imports of `VanillaView`,
`BoardsTreeView`/`ToolsTreeView`, `IconButtonView`, `TagView`, `createPanelElement`, and the
framework-neutral API methods below. Remove React, React hooks, `BoardsTree`/`ToolsTree`, and
`fillSlot` from these two files. Do not rename or change the two existing constructor call sites;
their extensionless imports continue to resolve after the rename.

The structural change is this:

```tsx
// Before: TrustedBoardsListView.tsx / TrustedToolsListView.tsx
private slotCleanup: (() => void) | undefined;

private renderSlot(): void {
    this.slotCleanup = fillSlot(
        this.root,
        React.createElement(TrustedBoardsTreeSlot, { onClose: this.props.onClose }),
    );
}
```

```ts
// After: each .ts wrapper, shape to implement
private tree: BoardsTreeView | undefined; // ToolsTreeView in the tools wrapper

protected onMount(): void {
    this.alive = true;
    const tree = this.child(new BoardsTreeView(this.treeProps()));
    this.tree = tree;
    this.root.append(tree.root); // attach before mount; TreeView's grid measures its host
    tree.mount();
    // Install framework-neutral subscriptions, then start the existing async load(s).
    this.refresh();
}

protected onUpdate(): void {
    this.refresh();
}
```

Use the corresponding `ToolsTreeView` in the tools wrapper. The stable outer root remains
`data-type="trusted-boards-list"` / `data-type="trusted-tools-list"` with `display: contents`;
the child tree keeps its own `data-type` and existing `data-name`.

### 2. Rebuild the boards wrapper around native state and `BoardsTreeView`

Replace the hook-only `TrustedBoardsTreeSlot` behavior with explicit native fields and methods in
`TrustedBoardsListView.ts`:

1. Keep `this.alive` false until `onMount()` and false again in
   `onDispose()`. Construct only roots/model-independent view state in the constructor; install no
   subscriptions, async work, or DOM listeners there.
2. Create one `BoardsTreeView` child, append its root before `mount()`, and update it with the exact
   existing `BoardsTreeProps` names: `name`, `boards`, `onOpenBoard`, `trailingVisible`,
   `getBoardContextMenu`, and `emptyMessage` (declared at
   `src/renderer/editors/board/BoardsTree.tsx:19-35`). Add the new native-only
   `BoardsTreeViewProps.trailingElement` field beside its redeclared compatibility
   `renderTrailing` at `src/renderer/editors/board/BoardsTreeView.ts:11-12`; do not pass the
   internal `getTrailingVisibility` name to the view. `defaultExpandAll: true` and `rowHeight: 28`
   are **not** caller props: `BoardsTreeView.treeProps()` supplies them internally at `:85-86`.
   The native empty prop is `createTextElement("No trusted boards yet", { size: "sm", color: "light" })`.
3. Preserve the three initial loads from `TrustedBoardsTreeSlot`:
   `boardTrust.load()`, `publishedBoards.load()`, and `boardInstallRegistry.load()`. Subscribe
   before/around those loads with `boardTrust.subscribePaths`, `publishedBoards.subscribeCatalog`,
   and `boardInstallRegistry.subscribeInstalled`, each calling the same guarded `refresh()`.
   Start the loads from `onMount()` and refresh after their promises settle; a late promise must not
   update a disposed view.
4. Replace `usePinnedRefs()` with the verified native precedent's `getPinnedStrings()` source
   (`BuiltinEditorsListView.ts:57,72`) and subscribe to `settings.onChanged`, filtering for the
   `pinned-editors` key. The boards list must take the **complement** of the builtin-editor filter:
   use `stored.startsWith("board:")`, not `!stored.startsWith("board:")`, then decode those board
   entries with `decodePin()` to derive the same raw roots. Pin persistence remains the exact
   `board:<root>` encoding and case behavior.
5. Derive the update map with exactly `listBoardUpdates(): BoardUpdate[]` from
   `src/renderer/api/board-updates.ts:59-69`. It is the synchronous, non-reactive counterpart to
   `useBoardUpdates(): Map<string, BoardUpdate>` at `:75-88` and reuses `getBoardUpdate()` for each
   installed entry. Build the lookup map with `fpNormalizeForCompare(update.root)` so it matches the
   hook's `map.set(fpNormalizeForCompare(inst.root), ...)` keying. Refresh the tree on both catalog
   and install-registry subscriptions.
6. Keep the existing callback behavior: `openBoard` sends
   `app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root),
   { explorerRoot: fpDirname(root) }))` and then calls the current `onClose`; remove awaits the
   board with `boardTrust.untrust`, removes its pin, and notifies
   `"Removed from trusted boards"`; the context menu contains update (when present), copy path,
   and grouped remove entries.

### 3. Add the narrow `trailingElement` forward, then replace board row React slots with explicitly owned native views

The existing `renderTrailing` path must remain available for other Tree callers because it accepts
React-compatible `SlotContent`. Add only the native path needed here:

- Add `trailingElement?: (item: T, level: number) => Node | undefined` to `TreeProps` in
  `src/renderer/uikit/Tree/types.ts`.
- In `src/renderer/uikit/Tree/TreeView.ts`, forward that callback as
  `trailingElement: this.props.trailingElement?.(row.source, row.level)` in `itemProps()` beside
  the existing `trailing` field at `:460-462`, and destructure `_trailingElement` in `restProps()`
  at `:607-609` so it is not leaked onto the Tree root. Do not replace or remove the existing
  React-compatible `trailing` field.
- Add `trailingElement?: (root: string) => Node | undefined` to `BoardsTreeViewProps`, add a
  node-level adapter beside `getTrailingVisibility`, and forward it from
  `BoardsTreeView.treeProps()` as TreeView's `trailingElement` callback. Keep `renderTrailing`
  unchanged for existing consumers; the trusted boards list supplies only `trailingElement`.

This is the narrow exception to the earlier no-change list for `TreeView`: it reuses the already
declared `ListItemProps.trailingElement` identity arm rather than inventing a new row mechanism.
The trusted boards `trailingElement(root)` callback must return `Node | undefined`, never a React
element. Maintain a
`Map<string, BoardTrailingRecord>` keyed by the board root. A record owns the currently needed
native children through the list view:

```ts
interface BoardTrailingRecord {
    panel?: HTMLDivElement;
    tag?: TagView;
    pinButton?: IconButtonView;
}
```

Implement the following exact behavior, copied from the verified React branches:

- `getBoardUsageSync(root)` is the synchronous equivalent of the hook's current result. If it is
  not resolved, return no pin button for this render and start exactly one
  `resolveBoardUsage(root)` probe per root. When the probe resolves, call guarded `refresh()` so a
  standalone board gains its pin button (or remains without one for a viewer-only board).
- When a pin is shown, create/claim it with `this.child(new IconButtonView(...))`, mount it once,
  and return its root when there is no update. Preserve `size: "sm"`, `icon: "pin-filled"` when
  pinned otherwise `"pin"`, and the `Unpin` / `Pin to menu` title. Its native `MouseEvent` handler
  must stop propagation and add/remove `{ kind: "board", root }` through the existing pin helpers.
  Update the view's props rather than reconstructing it on every tree refresh.
- When the normalized update map contains the board's entry, create/claim/mount one `TagView` with
  `label: "Update"`, `size: "sm"`, `title: \`Update to v${update.latestVersion}\``, and an
  `onClick` that calls `void runBoardUpdate(update)`. On later refreshes call `tag.update()` with
  the new version/handler props.
- For an update, create a native `createPanelElement({ name: "board-trailing", direction: "row",
  align: "center", gap: "xs" })`, append `tag.root` and, when available, `pinButton.root`, and
  return the panel. If the update disappears, release the tag child, remove the old panel, and
  return the pin root (or `undefined`) so the React conditional shape is preserved.
- If a board disappears from the current trusted path list, release every claimed child in its
  record with `this.releaseChild()`, remove its plain panel element, delete its usage-probe state,
  and delete the map entry **before** calling `tree.update()`. Never dispose a child directly while
  it is registered with the parent.
- On final disposal, set the alive guard first and clear detached panel/probe/map references. The
  parent `VanillaView` ownership list then disposes the tree and all still-claimed Tag/IconButton
  children exactly once; no row-view or cell-pool eviction may dispose these sidebar-lifetime
  children.

The native slot result is intentionally passed through the new `TreeView.trailingElement` →
`ListItemView.trailingElement` path. When the same stable Node is returned for a row, the
`ListItemView.setTrailing()` identity check at `:259-262` returns before `fillSlot`; the pin/tag DOM
stays connected, so a focused pin button keeps focus and its hover/active state survives ordinary
tree refreshes and scroll repaint. If the trailing arm genuinely changes (for example, an update
appears and requires the panel shape, or a usage probe changes pin availability), the Node identity
changes and the existing `fillSlot` transition is allowed to replace the old shape. That is a real
conditional DOM change, not refresh churn. No arm enters `mountReactHandle`, so it cannot create a
`data-react-root`.

### 4. Rebuild the tools wrapper around native state and `ToolsTreeView`

In `TrustedToolsListView.ts`:

1. Create, claim, append, and mount one `ToolsTreeView` child. Its `treeProps()` maps
   `registeredTools.toolsets` to `{ root: toolset.root, name: toolset.name }`, preserving
   `name: "sidebar-trusted-tools-list"`, `onOpenToolset`, `getContextMenu`, and the native
   `createTextElement("No registered tools yet", { size: "sm", color: "light" })` node.
2. Subscribe with `registeredTools.subscribeToolsets()` and call `refresh()` from the callback.
   From `onMount()`, retain `void registeredTools.ensureInitialized()` and refresh after it
   resolves, guarded by the alive flag. This replaces `useToolsets()` and its `useMemo()` mapping.
3. Preserve `openToolset(root)` followed by `onClose`, and the one-item context menu with the
   native `createIconElement("remove", { width: 14, height: 14 })` plus the existing async
   `toolsTrust.untrust(root)` and `"Removed from tools"` notification.
4. Do not invent a tools trailing mechanism: the verified current React tools wrapper passes no
   `renderTrailing`, so `ToolsTreeView` receives none and creates no per-row child records.

### 5. Keep the surrounding compatibility boundary unchanged

Do not change these already-native reusable views or their React faces in this task, except for the
explicitly scoped `trailingElement` forwards named in step 3:

- `src/renderer/editors/tools/ToolsTreeView.ts` — its native tree contract already accepts the
  needed `SlotContent` callback; tools need no trailing-element path.
- `src/renderer/editors/board/BoardsTreeView.ts` — unchanged except for forwarding the new native
  trailing-element callback to `TreeView`.
- `src/renderer/editors/board/BoardsTree.tsx` and
  `src/renderer/editors/tools/ToolsTree.tsx` — other surviving React callers still use these
  `mountVanilla` compatibility faces.
- `src/renderer/uikit/ListBox/ListItemView.ts` and `src/renderer/uikit/shared/fill-slot.ts` —
  their identity-aware Node arm and pooled-cell behavior are the existing native path this task
  consumes.
- `src/renderer/uikit/Tree/types.ts` and `src/renderer/uikit/Tree/TreeView.ts` — the only change is
  the narrow `trailingElement` prop declaration/forward described in step 3; preserve the existing
  React-compatible `trailing` path.
- `src/renderer/uikit/IconButton/IconButtonView.ts`, `src/renderer/uikit/Tag/TagView.ts`, and
  `src/renderer/uikit/Panel/panel-style.ts` — use the existing native views/helper; do not add a
  new `PanelView` abstraction.
- `src/renderer/editors/tools-hub/ToolsHubView.ts` and
  `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts` — both constructor call sites remain
  unchanged.

Do not add tests or test harnesses, dashboard entries, or commits. EPIC-072 already carries the
US-1155 entry and its task must remain unchecked until the epic's deferred review model closes it.

## Concerns / resolved design decisions

### Native ownership across a virtualized row pool

The tree's DOM rows are pooled, so native trailing child views must not be owned by a cell or
disposed when a cell scrolls out. The resolved design is one parent-owned record per board root,
created on demand for visible rows and retained until the board leaves the trusted data set or the
sidebar is disposed. The node can be detached and later moved back into a recycled slot host; the
view remains alive and its handler remains current through `update()`.

### Stable trailing identity and focus

Returning a native Node through `TreeView.renderTrailing` would be incorrect: `TreeView.itemProps()`
currently forwards that value to `ListItemProps.trailing`, whose `fillSlot` Node arm unconditionally
calls `replaceChildren()` and `append()`. The same pin root would therefore be detached and
re-appended on every repaint. The resolved design adds the narrow `TreeProps.trailingElement` →
`ListItemProps.trailingElement` forward and supplies the stable record Node through that arm.
`ListItemView.setTrailing()` then returns on identical Node identity. A focused pin button therefore
remains connected and keeps focus, hover, and active state through an ordinary tree refresh or
virtualized scroll repaint. Only a real arm change (such as an update panel appearing/disappearing
or a usage probe changing pin availability) changes the Node identity and may replace the shape.

### Child creation timing and measurement

`VanillaView` constructors may create roots but may not install listeners/subscriptions or start
async work. The parent will claim each child with `this.child()` from mounted code, append its root,
then call `mount()`. The tree root is attached before `TreeView.mount()` because
`VirtualGridView` measures its host during mount. All subscription and loader setup stays in
`onMount()`.

### Removed rows and disposal order

`VanillaView.dispose()` does not detach roots, while `releaseChild()` does dispose, detach, and
unregister. Therefore refresh-time row removal uses `releaseChild()` for Tag/IconButton children;
full sidebar disposal relies on the parent's registered-child disposal and only clears record
bookkeeping in `onDispose()`. This resolves the same stale-child risk that EPIC-069 recorded for
`ListBoxView` without changing that pre-existing component.

### Standalone-board probing

`useBoardStandalone()` is React-only, but its cache already exposes
`getBoardUsageSync()` and `resolveBoardUsage()`. The native view will reproduce its initial
undefined/no-button state, deduplicate in-flight probes, and refresh when each probe resolves.
This keeps viewer-only boards unpinnable and avoids adding a new API or a React boundary.

### Marker choice

`data-part="react-slot"` is not an acceptable root assertion because `TagView` stamps it before
choosing its native/React arm. Verification must count only `[data-react-root]`, including a root
element itself if applicable. The expected count is zero in each target subtree, not merely a
stable count as rows or recycled cells change.

No implementation questions remain open for this task.

## Acceptance criteria

- [ ] `TrustedBoardsListView.tsx` and `TrustedToolsListView.tsx` are renamed to `.ts`; the old
  `.tsx` paths are absent.
- [ ] Neither target file imports React, contains JSX, imports/calls `fillSlot`, or renders the
  React-facing `BoardsTree`/`ToolsTree` component.
- [ ] Each target directly owns one native `BoardsTreeView`/`ToolsTreeView` child, attaches its
   root before mounting, updates it from framework-neutral subscriptions, and releases dynamic
   board trailing children with `releaseChild()` when their board leaves the trusted data set.
- [ ] `TreeProps.trailingElement` is added in `src/renderer/uikit/Tree/types.ts`, forwarded by
  `TreeView.itemProps()` into `ListItemProps.trailingElement`, and excluded from Tree root rest
  props. `BoardsTreeView` forwards the native board callback through this path while its existing
  React-compatible `renderTrailing` path remains intact.
- [ ] The boards trailing behavior is preserved: `Update` shows the exact latest-version title and
  update handler; standalone boards show the correctly titled pin/unpin button; viewer-only or
  unresolved boards do not show a pin; update/pin combinations retain the `board-trailing` row
  panel and event propagation behavior.
- [ ] Tools behavior is preserved: initialization, registered-toolset name mapping, open/close,
  remove context menu icon/handler, notification, and empty message all remain functional. No
  tools row trailing callback is added.
- [ ] The two constructor call sites are unchanged. The reusable tree faces, ListItem/fillSlot
  machinery, native UIKit replacements, and API modules listed in “Keep the surrounding
  compatibility boundary unchanged” are not modified; only the explicitly listed Tree and
  BoardsTreeView trailing-element forwards are added.
- [ ] After a cold renderer restart, inspect both mounted subtrees with a root-inclusive query such
  as `root.matches("[data-react-root]") ? 1 : 0` plus
  `root.querySelectorAll("[data-react-root]").length`; the result is **0** for empty boards/tools,
  populated boards/tools, and after changing the trusted/registered row sets.
- [ ] Scroll a populated boards tree far enough to recycle cells, then change pin/update state and
  remove a board. A focused pin remains focused through a refresh that returns the same trailing
  Node; no duplicate-child ownership error occurs, detached removed-board children are no longer
  retained, and the root-inclusive `[data-react-root]` count remains **0**.
- [ ] Run the project’s normal lint/build verification as appropriate for the rename. Do not add
  unit tests or a test harness.

## Files changed

| File | Expected change |
|---|---|
| `src/renderer/ui/sidebar/TrustedBoardsListView.tsx` → `src/renderer/ui/sidebar/TrustedBoardsListView.ts` | Rename; native `BoardsTreeView` composition, subscriptions, native board trailing records, and explicit child lifetime. |
| `src/renderer/ui/sidebar/TrustedToolsListView.tsx` → `src/renderer/ui/sidebar/TrustedToolsListView.ts` | Rename; native `ToolsTreeView` composition, framework-neutral subscriptions, and preserved tools behavior. |
| `src/renderer/uikit/Tree/types.ts` | Add the native `trailingElement` callback to `TreeProps`. |
| `src/renderer/uikit/Tree/TreeView.ts` | Forward `trailingElement` to each `ListItemView` prop and exclude it from root rest props, retaining `trailing`. |
| `src/renderer/editors/board/BoardsTreeView.ts` | Forward the native board trailing callback to `TreeView`; retain the existing `renderTrailing` compatibility path. |
| `doc/tasks/US-1155-sidebar-row-roots/README.md` | This investigation and implementation plan. |


---

## Verification (2026-08-27)

**Statement 3 is met structurally, and the proof is stronger than a live count.**

The two converted files contain zero occurrences of `React`, `fillSlot`, or JSX. What closes the
question is the type of the values that reach the row slot:

1. `trailingElement` is declared `(root: string) => Node | undefined`
   (`TrustedBoardsListView.ts:145`), and returns either `record.pinButton.root`, `record.tag.root`
   or a `createPanelElement(...)` — all DOM.
2. `emptyMessage` is a `createTextElement(...)` node (`:242`).
3. The props handed to the child views are a string `label: "Update"` and an **icon name**
   (`"pin"` / `"pin-filled"`), so `TagView`/`IconButtonView`'s own `fillSlot` calls receive a
   string or an icon name that `createIconElement` turns into DOM — never a React element.
4. `fill-slot.ts:45` computes the React arm as
   `!isReactEmpty(slot) && typeof slot !== "string" && !(slot instanceof Node)`. **A `Node` or a
   string can therefore never reach `mountReactHandle` at `:110`.**

So no value on any path into this subtree can create a React root. That is a proof of absence for
*every* row state, whereas a live root count only covers the states that happened to render — which
matters here precisely because the count was row-dependent to begin with.

Live confirmation of the app-wide figure: after a cold restart with a board open, the application
measures **1** React root (`GlobalStyles`), down from the 9 recorded in US-1154.

### Deferred

The `tools-hub` Registered-boards tab and the menu-bar Tools & Editors panel were **not** opened
live. Both entry points are inside menus — `ui/tabs/PageTabsView.ts:310` ("Show All…") and the
`MenuBarView` folder tree — and `pagesModel.showToolsHubPage()` is not exposed on the scripting
`app.pages` surface, which is the same obstacle US-1154 recorded. Category: *could not reach it with
the available instrument*, not *not allowed*. Worth one interactive pass, though the structural
argument above does not depend on it.


---

## Correction: `trailingElement` never reached the row, and the "proof" above concealed it

The close review found that `TreeProps.trailingElement` was forwarded by `TreeView.itemProps()` into
props that **`TreeItemView` never declared or consumed**, so the value fell into residual props and was
discarded. The trusted-boards pin buttons and Update tags were being constructed, claimed and mounted —
and then never inserted into the DOM.

**The cause was a review error of mine, not an implementation error.** My correction to the plan
asserted that the per-row trailing slot was `ListItemView.setTrailing()` (`uikit/ListBox/ListItemView.ts`)
and instructed the implementation to forward `trailingElement` because `ListItemView` already declared
that prop, with `ListBox.story.ts` as precedent. That evidence was real but belongs to the **ListBox**
path. `TreeView` renders **`TreeItemView`** (`TreeView.ts:402`), an independent `VanillaView` with its
own `setTrailing()` at `:334` and no `trailingElement` arm. I never checked which row class the tree
instantiates, in the same message in which I insisted every load-bearing claim be verified against the
source.

**And the structural argument in the section above passed *because* of the defect.** It proved that no
value on the path into that subtree can create a React root — true, and still true. But with the
trailing content discarded before it reached the DOM, the subtree it was proving things about was
*empty*. **A proof of absence is worthless without a matching proof of presence**, and that is exactly
the gap a live pass would have closed. I declined the live pass as "could not reach it", then let a
proof of absence stand in for it. The two are not substitutes: absence-of-React and presence-of-feature
are independent claims, and the conversion broke the second while satisfying the first.

### The fix

`trailingElement?: Node` is now declared on `TreeItemProps` (`uikit/Tree/TreeItem.ts`), destructured in
`TreeItemView.applyProps()` so it cannot fall into residual props, and consumed by
`TreeItemView.setTrailing()` through an identity-checked arm that returns early when the same node is
supplied again.

### Verified live, for presence *and* absence

Driven through the real `uikit/Tree` module (a pure view, so a direct import is safe — unlike an app
module, which would yield an empty-state copy). A `TreeView` over three items with a stable owned
`<button>` per row:

| Assertion | Result |
|---|---|
| rows rendered | 3 |
| **trailing nodes present in the DOM** | **3** |
| parent element of a trailing node | `.tree-trailing` (the row's trailing host) |
| still attached after `update()` with the same nodes | 3 of 3 |
| **focus on a trailing button survived the re-render** | **yes** |
| React roots inside the tree | 0 |

The focus assertion is the one that matters most, because preserving focus was the stated reason for
wanting an identity-checked arm at all — and it had never been tested until now.
