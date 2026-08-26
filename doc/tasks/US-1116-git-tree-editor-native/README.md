# US-1116: Convert the `git-tree` editor to the vanilla View arm

## Goal

Convert the `git-tree` editor from the React `EditorModule.Component` arm to
the framework-free `EditorModule.View` arm. Preserve the history grid, toolbar
actions, commit metadata, commit diff, file navigation, and persisted panel
layout while making the open editor contribute 0 live React roots instead of 1.

This is an unchecked task of [EPIC-068](../../epics/EPIC-068.md). Its existing
dashboard entry remains `[ ]`; do not add a duplicate entry, run `/review`,
implement the conversion, or commit.

## Background

### Current registration and mounting path

`src/renderer/editors/git-tree/index.tsx:7-10` defines the generic
`GitTreeEditorComponent`, casts `EditorModel` to `GitTreeEditorModel`, and
renders `GitTreeEditorView`. `gitTreeModule` registers that function as
`Component` at `:12-25`. The required end state is the same factory and
`newEditorModel` with `View: GitTreeEditorView`, after renaming the index to
`index.ts` and removing the JSX wrapper.

The registry's vanilla arm is defined by
`src/renderer/editors/base/editorRegistry.ts:18-43`. The real mounting path in
`src/renderer/ui/app/AsyncEditorView.ts:98-146` constructs the registered view,
appends its root to `editorHost`, and calls `mount()`; the React arm begins at
`:149-155` with `mountReactHandle`. Therefore a `View` registration removes the
editor-level root if the converted view and every child it mounts stay on
native paths.

The model is already native and remains unchanged:
`src/renderer/editors/git-tree/GitTreeEditorModel.ts:22-69,92-117` owns the
editor state plus the stable `gitTree`, `changes`, and `branches` submodels.
Its persisted fields and commands are load-bearing at
`GitTreeEditorModel.ts:192-225,255-317,383-413`; the converted view must call
those methods rather than reproduce model behavior.

### Surface and root decision

The React surface spans three files and 727 JSX lines:

- `GitTreeEditorView.tsx:40-75` reads the editor, history, branch, and layout
  state, and measures the outer root with `ResizeObserver`.
- `GitTreeEditorView.tsx:168-319` returns one outer `Panel` containing the
  `PageToolbar`, body, and conditional bottom splitter/panel.
- `CommitDiffPanel.tsx:125-289` supplies the diff tab, and
  `CommitInfoPanel.tsx:28-88` supplies the commit tab.

This is the **real Panel-root case**, not the `display: contents` case. The
old `GitTreeEditorView` returns one outer Panel at
`GitTreeEditorView.tsx:168-176`, with `direction="column"`, `flex={1}`,
`overflow="hidden"`, and `background="default"`; all other content is inside
that Panel at `:177-318`. Adopt that root with
`super(props, createPanelElement(...))`, matching the archive and board-info
conversions. A contents root would remove the old page-column flex item and
change the outer sizing/overflow contract. `createPanelElement` is the native
DOM builder at `src/renderer/uikit/Panel/panel-style.ts:349-356`; it applies
the same Panel attributes and loads `Panel.css` through `:1-4`.

**A second, independent reason the root must be a real element, recorded because
it is a constraint the other EPIC-068 tasks do not have:** this view observes its
own root with a `ResizeObserver` (`GitTreeEditorView.tsx:61-67`, replacing
`ref={rootRef}` at `:169`). An element with `display: contents` generates **no
box**, so a `ResizeObserver` on it never fires — and it fails *silently*, leaving
`containerHeight` at its initial `0` forever, which would clamp the bottom panel's
`maxH` to zero. The two rules therefore interact: **an editor view that measures
its own root cannot use a `display: contents` root.** Where the two conflict, the
measurement wins and the root must be a real box. Any later task in this epic that
introduces a `ResizeObserver`, or reads `getBoundingClientRect` on `this.root`,
must re-check its root decision against this.

The three panels should become **three separate native views**, one per old
React surface: `GitTreeEditorView`, `CommitDiffPanelView`, and
`CommitInfoPanelView`. This preserves the existing conditional mount boundary:
the parent shows exactly one bottom tab view at a time, so it can release the
old tab before claiming the new one. It also gives the diff view ownership of
its `FileListView`, `SplitterView`, Monaco host, async request guards, and
replaceable `gitTree` subscription, while the info view owns its message
request and commit metadata. Combining them would make independent state and
disposal lifetimes cross the tab boundary and would make it easier to leave a
detached Monaco or state listener alive.

### Exhaustive reactive-read inventory

The following table accounts for every hook, `state.use()` read, derived hook
dependency, and reactive service/API read in the three files. There is no
`useOptionalState()` call and no service hook of the form `api.useX()` in this
surface. The `git.commitFiles`, `git.show`, and `git.commitMessage` calls are
imperative async service calls, not subscriptions; their replacement is
described in the panel plans below.

| File:line | Current read | Field/dependency read | Native replacement |
|---|---|---|---|
| `GitTreeEditorView.tsx:41` | `useComponentModel({ model }, GitTreeEditorViewModel, ...)` | Local `selectedHash` state model | Replace the React-only control model with a native `selectedHash` field. The `GitTreeView` click handler updates it and the parent pushes it to the existing bottom view. |
| `GitTreeEditorView.tsx:42` | `viewModel.state.use()` | `selectedHash` | Same field projection and imperative child updates; do not leave this value implicit. |
| `GitTreeEditorView.tsx:43-47` | `model.gitTree.state.use(selector)` | `loading`, `gitOk`, `commits.length > 0` (`hasCommits`) | One three-argument `this.bind(this.model.gitTree.state, selectGitTreeSurface, applyGitTreeSurface)` installed in `onMount()`. It updates the body arm, refresh button, and bottom-panel presence. |
| `GitTreeEditorView.tsx:48-53` | `model.branches.state.use(selector)` | `aheadBehind`, `pushing`, `fetching`, `pulling` | One `bind()` on the stable `branches.state` that updates the existing toolbar nodes, including text, titles, disabled state, and pull menu items. |
| `GitTreeEditorView.tsx:59` | `useRef<HTMLDivElement>(null)` | Outer root DOM reference for measurement | The adopted `this.root` is the measured `HTMLDivElement`; no React ref is needed. |
| `GitTreeEditorView.tsx:60` | `useState(0)` | `containerH` | A native `containerHeight` field updated by the `ResizeObserver` callback. `maxH` and `panelH` are derived in the imperative layout projection. |
| `GitTreeEditorView.tsx:61-67` | `useEffect(...ResizeObserver...)` | Outer-root content height | Create/observe `this.root` in `onMount()`, call the layout synchronizer from the callback, and register `ro.disconnect()` with `this.own()`. No observer belongs in the constructor. |
| `GitTreeEditorView.tsx:68-72` | `model.state.use(selector)` | `bottomPanelHeight`, `bottomPanelTab`, `commitDiffListWidth` | One `bind()` on the stable editor state. Apply current values immediately and update the existing splitter/panel/tab view without reconstructing unrelated children. |
| `GitTreeEditorView.tsx:73-75` | Render-time derivation | `containerH`, `bottomPanelHeight`, `bottomPanelTab` → `maxH`, `panelH`, `tab` | Recompute inside `syncLayout()`; preserve `Infinity` when height is not measured, the 80% cap, default height 240, and default tab `commit`. |
| `GitTreeEditorView.tsx:89-129` | `useCallback(commitContextMenu, [model])` | Current selected grid rows and current editor model commands | A stable native `getContextMenuItems(rows)` method/closure that reads `this.model` at event time and returns the same branch/remote/commit/create-branch `MenuItem[]`. |
| `GitTreeEditorView.tsx:160` | `model.state.get()` inside render | Initial `columnLayout` passed to `GitTree` | Read the current value when constructing the native `GitTreeView`; include it in the editor-state projection so a later body replacement uses the latest persisted layout. `GitTreeView` applies this as mount-time layout, matching its `initialColumnLayout` contract at `GitTreeView.ts:217-240`. |
| `GitTreeEditorView.tsx:198-203` | `model.repoName` and `model.state.get()` | Derived repository name and current `repoRoot` tooltip | Update the existing native Tag root from the editor-state binding; derive the name through the existing `repoName` getter and set the title from the current state. |
| `GitTreeEditorView.tsx:300-313` | `model.state.get()` passed to conditional children | Current `repoRoot`, `commitDiffListWidth`, and `selectedHash` | Pass a fresh prop object to the already-mounted `CommitInfoPanelView`/`CommitDiffPanelView`; release and create only when the selected tab changes. |
| `CommitDiffPanel.tsx:64-86` | First `CommitDiffPanelModel.effect()` | `repoRoot`, `selectedHash`, and selected commit in `gitTree.state.commits`; `git.commitFiles()` result | Remove the effect registration from the vanilla-driven model. A view-owned `loadFiles()` runs on the same dependency projection, uses a generation/live guard, and updates `changes` plus the first selected file in one model-state write. |
| `CommitDiffPanel.tsx:88-121` | Second `CommitDiffPanelModel.effect()` | `repoRoot`, `selectedHash`, selected commit hash, `state.changes`, and `state.selectedFile`; `git.show()` results | Replace with an explicit `loadDiff()` call from the commit/source, file-list selection, and file-load completion paths. Clear the diff through the same guarded path when no valid commit/file exists; discard stale promises. |
| `CommitDiffPanel.tsx:133` | `useComponentModel(props, CommitDiffPanelModel, ...)` | Panel-local `changes`, `selectedFile`, and `diff` state | Use a `createComponentModelDriver` with the same setters but no `effect()` registrations, or an equivalent view-owned state model. The native view must bind its state and explicitly start async loads; the driver rejects registered effects at `model.ts:313-316`. |
| `CommitDiffPanel.tsx:134` | `model.state.use()` | `changes`, `selectedFile`, `diff.before`, `diff.after` | A compound three-argument `bind()` from `onMount()` to `applyState()`, which updates the existing file list, selected file, Monaco values, language, and scroll position in that order. |
| `CommitDiffPanel.tsx:135-136` | `gitTree.state.use()` and `commit` derivation | Entire `commits` array and selected commit | A replaceable `gitTree.state` subscription selecting `commits`; its immediate current-value apply and every change call `onCommitsChanged()`. The current commit is derived from `this.props.selectedHash`. |
| `CommitDiffPanel.tsx:137` | `useRef<MonacoDiffEditorHostView | null>` | Mounted Monaco host handle | A `MonacoDiffEditorHostView | undefined` field. Claim/release the native host with the diff view and clear the field when released. |
| `CommitDiffPanel.tsx:138-142` | `useMemo(language, [selectedFile])` | Selected-file extension → language id | A pure `languageFor(filePath)` helper used by `syncState()` and `MonacoDiffEditorHostView.setLanguage()`; no memo is needed for this small derivation. |
| `CommitDiffPanel.tsx:144-147` | `useEffect()` | `diff.before`, `diff.after`, `selectedFile` | In the bound-state apply path call `setDiffValues()` on the existing host after ensuring the selected-file host exists. |
| `CommitDiffPanel.tsx:149-153` | `useEffect()` | `language`, `selectedFile` | In the same native state/selection projection call `setLanguage(languageFor(selectedFile))`. |
| `CommitDiffPanel.tsx:160-164` | `useEffect()` | `diff` object identity and `selectedFile` | After diff values are applied, reset original and modified Monaco scroll positions to zero, preserving the old effect order. |
| `CommitDiffPanel.tsx:167-170` | `useMemo(items, [changes])` | `changes` array → `{ filePath, title }[]` | Recompute the file-list item array when the bound model state changes; pass it to the existing `FileListView`. |
| `CommitDiffPanel.tsx:171-174` | `useMemo(changeMap, [changes])` | `changes` array → path map | Rebuild a native `Map` in `syncState()` or cache it on the view keyed by the changes array. |
| `CommitDiffPanel.tsx:176-180` | `useCallback(getTrailing, [changeMap])` | Change status for each file | A stable native callback returning a freshly built DOM status badge. Do not return the React `GitStatusBadge` face. |
| `CommitDiffPanel.tsx:183` | `useCallback(onClick, [model])` | Selected file path | A stable native file-list callback that writes the panel model's selected file and then requests its diff. |
| `CommitDiffPanel.tsx:189-208` | `useCallback(openInNewTab, [commit, repoRoot])` | Current commit, repo root, parent hash, and change path | A native method that reads current props/event data and sends the same `file-diff` link with `diffFrom`/`diffTo` through `app.events.openRawLink`. |
| `CommitDiffPanel.tsx:212-226` | `useCallback(getContextMenu, [changeMap, commit, openInNewTab, model])` | Current change map/commit and selected-file mutation | A stable native callback that selects the right-clicked file and returns the same one-item `MenuItem[]`; the context-menu path remains the native DataGrid popup path. |
| `CommitInfoPanel.tsx:37-38` | `gitTree.state.use()` and `commit` derivation | Entire `commits` array and selected commit | A replaceable `gitTree.state` subscription selecting `commits`, with immediate apply and current selected-commit derivation. |
| `CommitInfoPanel.tsx:40` | `useState("")` | Transient fetched `message` | A native `message` field (or a tiny state model field) updated only by the guarded commit-message request. |
| `CommitInfoPanel.tsx:41-53` | `useEffect(..., [repoRoot, commit?.hash])` | `repoRoot` and stable commit hash; `git.commitMessage()` result | `loadMessage()` with a request generation/live guard. Avoid refetching when a refresh rebuilds the commit object with the same hash, as the old dependency array did. |
| `CommitInfoPanel.tsx:64-84` | Render-time commit/message reads | Author, date, hash, refs, and `message || subject` | Rebuild/update the view-owned metadata nodes from the current commit projection; use native text elements and local DOM ref badges. |

There are no omitted `useOptionalState`, `useX()` API-hook, or other React
subscription reads in these files. Every state-backed value that the old
render depended on is represented above, including the `state.get()` values
that rode on a React rerender caused by a neighboring selector.

### Subscription source-object audit

The following sources require different handling:

| Source | Can its object change while the view lives? | Required handling |
|---|---|---|
| `GitTreeEditorModel.state`, `model.gitTree.state`, `model.branches.state` | No for one validated editor-model instance. `GitTreeEditorModel` creates the three submodels as readonly fields at `GitTreeEditorModel.ts:99-107`. | Bind once from `onMount()` with the three-argument `bind()` API at `vanilla-view.ts:197-216`; never call `bind()` from `onUpdate()`. If an incoming generic `EditorModel` is a different instance, reject it with the same identity guard used by `GitTreeView.ts:274-277` rather than stacking subscriptions. |
| `CommitDiffPanelProps.gitTree` | Yes by the public prop contract, even though the current parent passes `model.gitTree`. | Hold `gitTreeStateUnsubscribe` and `boundGitTree` fields. Unsubscribe before replacing the source, subscribe to the new source, and immediately apply `newSource.state.get().commits`. Register one final cleanup with `this.own()` in `onMount()`; do not re-call `bind()`. |
| `CommitInfoPanelProps.gitTree` | Yes by the public prop contract. | Use the same replaceable unsubscribe/source field and immediate current-value apply. |
| `git` API object | No subscription is taken; it is only called imperatively at `api/git.ts:100-105` and by the existing panel calls. | No `useX()` replacement is needed. Guard all async results against stale selection/disposal. |
| Outer root `ResizeObserver` target | No; it is the adopted root for the life of the editor view. | Create in `onMount()`, disconnect through `own()`, and update the existing layout children. |

The replaceable subscription must preserve both halves of `bind()` explicitly:

```ts
private gitTreeStateUnsubscribe: (() => void) | undefined;
private boundGitTree: GitTreeModel | undefined;

private rebindGitTree(source: GitTreeModel): void {
    if (source === this.boundGitTree) return;
    this.gitTreeStateUnsubscribe?.();
    this.gitTreeStateUnsubscribe = undefined;
    this.boundGitTree = source;
    this.gitTreeStateUnsubscribe = source.state.subscribe(
        () => this.onCommitsChanged(source.state.get().commits),
        (state) => state.commits,
    );
    this.onCommitsChanged(source.state.get().commits);
}
```

The final cleanup is registered once:

```ts
this.own(() => {
    this.gitTreeStateUnsubscribe?.();
    this.gitTreeStateUnsubscribe = undefined;
    this.boundGitTree = undefined;
});
```

This is mandatory because `VanillaView.own()` has no early-release API at
`vanilla-view.ts:129-132`; repeatedly calling `bind()` would leave old
`gitTree` objects able to push stale commits into a live panel.

### Native replacement audit

All interaction-heavy UIKit uses have a verified native arm:

| React face/use | Verified native replacement | Source evidence |
|---|---|---|
| `PageToolbar` | `PageToolbarView` | `PageToolbarView.ts:364-431`; import it directly from `../base/PageToolbarView`. |
| `Panel` | No `PanelView` class; use `createPanelElement` and `applyPanelAttributes` | `Panel.tsx:15-112` is React-only; native builders are `panel-style.ts:145-356`. |
| `Text` | No `TextView` class; use `createTextElement`/`applyTextAttributes` | `Text.tsx:18-32` is React-only; native builder is `text-style.ts:100-108`. |
| `IconButton` | `IconButtonView` | `IconButtonView.tsx:16-52`; it owns its icon, tooltip, click listener, and native DOM root. |
| `Divider` | `DividerView` | `DividerView.tsx:6-25`. |
| `Tag` | `TagView` | `TagView.tsx:9-147`; use its string `label`/`title` props and claim it. |
| `SplitButton` | `SplitButtonView` | `SplitButtonView.ts:16-172`; its caret uses `openMenu` at `:132-142`. |
| `Splitter` | `SplitterView` | `SplitterView.ts:11-128`; native pointer drag and value projection are already implemented. |
| `SegmentedControl` | `SegmentedControlView` | `SegmentedControlView.tsx:10-136`; it owns keyed native Button children and roving focus. |
| `Menu` | No editor-level `<Menu>` use; only `MenuItem` types and menu items are created | `GitTreeEditorView.tsx:12,89-129`; the native grid callback at `GitTreeView.ts:168-169` delegates to `showGridContextMenu`. `MenuView` itself is native at `MenuView.ts:306-354`, and `openMenu` is `attach-menu.ts:19-75`. |
| `WithMenu` | Not used by any of the three files | The only render-prop face is `WithMenu.tsx:22-68`. No editor-level replacement is needed. If a future implementation introduces it, use `openMenu` rather than carrying the render prop. |
| `GitTree` | `GitTreeView` directly | `GitTreeView.ts:164-385`; use it instead of the React `GitTree` shim. Its DataGrid/context-menu path is native. |
| `FileList` | `FileListView` directly | `FileListView.ts:15-191`; use it instead of the React `FileList` shim. |
| `MonacoDiffEditorHost` | `MonacoDiffEditorHostView` directly | `MonacoDiffEditorHostView.ts:23-188`; the React `MonacoDiffEditorHost` shim is only `MonacoDiffEditorHost.ts:7-9` and remains for `FileDiffBody.tsx`. |
| `GitStatusBadge` | No native arm | `GitStatusBadge.tsx:4-6` is JSX-only. Build a local `<span class="git-status-badge" data-type="git-status-badge">` using `gitStatusMeta()` and pass it as the `getTrailing` Node result. |
| `RefBadge` | No native arm | `RefBadge.tsx:14-19` is JSX-only. Build a local `.git-ref-badge` span using `REF_COLOR` and the existing `GitTree.css`; do not pass the React face to a slot. |

`FileListView` accepts a `getTrailing` callback typed as React content, but its
native row projection passes that value to `ListBox` at
`FileListView.ts:119-136,139-155`. Return a DOM Node, not a React element or
markup string. `fillSlot` treats a Node as the native arm at
`fill-slot.ts:43-49,125-140`, so this status badge does not create a root.
The native Git Tree view imports `GitTree.css` at `GitTreeView.ts:32`; keep
that stylesheet available for the local badges.

### Toolbar slot and children

The old toolbar has two distinct contributions:

- `GitTreeEditorView.tsx:177-190` supplies one refresh `IconButton` through
  `rightContributions`.
- `GitTreeEditorView.tsx:191-254` supplies one left-group Panel containing
  text, the repo Tag, ahead/behind text, SplitButton, push IconButton, and
  Divider through `children`.

`PageToolbarView` creates persistent contents hosts and refills them on every
update at `PageToolbarView.ts:383-427`. The native view must therefore pass
actual persistent Nodes: pass the refresh button's root directly as
`rightContributions`, and pass one persistent left-group Panel element as
`children`. Never pass a `DocumentFragment`; `fill-slot.ts:137` appends a Node
and `PageToolbarView.onUpdate()` refills unconditionally, which would empty a
fragment on the first refill. The native page toolbar itself is a child view
claimed once with `this.child()`.

### Importer/export audit

The export and import graph was checked across `src/`:

| Export/module edge | Verified importer or use | Load-bearing result |
|---|---|---|
| `gitTreeModule` | `src/renderer/editors/register-editors.ts:176` dynamically imports `./git-tree` and reads `.gitTreeModule`. | Preserve the module export and extensionless dynamic import. |
| `GitTreeEditorView` | Only `src/renderer/editors/git-tree/index.tsx:3,9` imports it. | Rename the file to `.ts`, export the native class, and make the index's `View` point to it. |
| `CommitDiffPanel` | Only `GitTreeEditorView.tsx:16,307` imports it. | Rename to `.ts`, expose `CommitDiffPanelView`, and import it directly from the native parent. |
| `CommitInfoPanel` | Only `GitTreeEditorView.tsx:15,300` imports it. | Rename to `.ts`, expose `CommitInfoPanelView`, and import it directly from the native parent. |
| `GitTree` React face and `GitTreeProps` | `GitTree.story.tsx:3,67`, `editors/file-diff/RevisionPicker.tsx:7,103`, plus the old editor parent. | Keep `components/git-tree/GitTree.tsx` and its public React shim; only this editor switches to `GitTreeView`. |
| `FileList` React face and types | `components/file-list/index.ts:1`, the old diff panel, and other type/story consumers. | Keep `FileList.tsx` and the barrel; only this editor switches to `FileListView`. |
| `MonacoDiffEditorHost` React face | `editors/file-diff/FileDiffBody.tsx:10,73`. | Keep the shim; the converted diff panel imports `MonacoDiffEditorHostView`. |
| `GitStatusBadge` / `RefBadge` | Only the old two panels use the barrel exports; the component barrel re-exports them at `components/git-tree/index.ts:13-14`. | Keep both files/barrel exports unchanged and replace only this editor's use with local Nodes. |
| `GitTreeEditorModel`, `getDefaultGitTreeEditorState`, `GitTreeEditorState` | The index, `GitRefsView.ts:11-25`, `GitPanelSecondaryView.ts:6,29,215-216`, `GitChangesView.ts:19,35`, and the model itself. | Preserve all model exports and the model file unchanged. |

No importer requires the old React component values from the three editor
files. The remaining React shims are load-bearing for stories, File Diff, and
other compatibility callers, so this task must not delete or convert them.

## Implementation Plan

### 1. Rename the three surfaces and create the real Panel-rooted parent

Rename `src/renderer/editors/git-tree/GitTreeEditorView.tsx` to
`GitTreeEditorView.ts` and replace the function with a public
`GitTreeEditorView extends VanillaView<{ model: EditorModel }>`.

- Validate the generic model with an `instanceof GitTreeEditorModel` helper and
  reject a different model identity in `onUpdate()`; the editor's submodel
  sources are stable only for one model instance.
- In the constructor create only the stable root with
  `createPanelElement({ name: "git-tree-editor-root", direction: "column",
  flex: 1, overflow: "hidden", background: "default" })` and call
  `super(props, root)`. Do not create child views, DOM listeners,
  subscriptions, async work, or measurements in the constructor.
- In `onMount()` construct and claim the persistent toolbar, refresh button,
  left toolbar group children, and the initial dynamic body/bottom children
  with `this.child(...)`. Children are mounted exactly once after their roots
  are placed. `VanillaView.update()` cannot call `onUpdate()` before mount, so
  no pre-mount guards are needed.
- Use `createPanelElement` for all Panel-shaped structural elements and
  `createTextElement` for Text-shaped elements. Apply their exact old props,
  including names, direction, flex, height, overflow, padding, background,
  border, and the 240px/80% bottom-panel rules.
- Keep the direct child order: toolbar, body, bottom splitter, bottom panel.
  The body and bottom arms may be replaced dynamically, but release claimed
  views before removing their roots. Do not use a custom `onDispose()` merely
  to dispose children; `this.child(...)` ownership and base disposal handle
  that lifetime.

The parent should retain stable native nodes for toolbar content. The dynamic
ahead/behind group is a parent-owned Panel element whose text children are
added/removed by the toolbar projection. The refresh, pull, and push controls
are claimed `IconButtonView`/`SplitButtonView` children. Pass the refresh root
directly to `PageToolbarView.rightContributions` and the persistent left-group
root to `children` on every toolbar update.

### 2. Replace the parent hooks with explicit native projections

Install all bindings from `onMount()` using the required three-argument shape:

```ts
this.bind(
    this.model.state,
    (state) => ({
        repoRoot: state.repoRoot,
        columnLayout: state.columnLayout,
        bottomPanelHeight: state.bottomPanelHeight,
        bottomPanelTab: state.bottomPanelTab,
        commitDiffListWidth: state.commitDiffListWidth,
    }),
    (state) => this.syncEditorState(state),
);
this.bind(
    this.model.gitTree.state,
    (state) => ({ loading: state.loading, gitOk: state.gitOk, hasCommits: state.commits.length > 0 }),
    (state) => this.syncGitTreeSurface(state),
);
this.bind(
    this.model.branches.state,
    (state) => ({ aheadBehind: state.aheadBehind, pushing: state.pushing, fetching: state.fetching, pulling: state.pulling }),
    (state) => this.syncToolbarState(state),
);
```

The selectors may be named private functions, but each read must route through
one projection. The callbacks must update existing nodes/views rather than
reconstructing the entire editor. The initial apply is required because
`bind()` applies once before subscribing at `vanilla-view.ts:214-216`.

Replace the resize effect with a native `ResizeObserver` on `this.root`, store
the height in a field, and call `syncLayout()` from the observer. Derive
`maxH`, `panelH`, and the default tab in that method. Update the existing
`SplitterView` and bottom Panel height/max attributes; do not recreate them on
ordinary height changes.

The native `GitTreeView` child must receive the exact old data and callbacks:
`model.gitTree`, `selectedHash`, the stable selection callback,
`initialColumnLayout`, `model.setColumnLayout`, and the native context-menu
callback. When a commit is selected, update the selected-hash field and push
the current hash to whichever bottom view exists. When the editor state or
submodel state changes, update the refresh button, toolbar, body arm, bottom
tab, and child props through the relevant projection.

### 3. Convert `CommitInfoPanel` into an independently owned native view

Rename `src/renderer/editors/git-tree/CommitInfoPanel.tsx` to
`CommitInfoPanel.ts` and export `CommitInfoPanelView` (preserving a compatible
props shape if useful to local callers).

- Create a stable root with the old loaded Panel attributes, then switch its
  attributes and children to the old no-commit message arm when no matching
  commit exists. Rebuilding only this view-owned raw DOM is safe; no claimed
  child view lives inside it.
- In `onMount()` call `rebindGitTree(this.props.gitTree)`, register the one
  final replaceable-subscription cleanup, and apply the current commit
  immediately. On `onUpdate()`, rebind only if the `gitTree` object changed,
  then project the current repo root/selected hash.
- Preserve the old fields exactly: Author, Date, Commit hash, optional Refs,
  and the commit message fallback (`message || commit.subject`). Use
  `createTextElement` and `dateText` for text. Build each ref badge as a native
  span with class `git-ref-badge`, `refData.name`, and the existing
  `REF_COLOR[refData.kind]`; do not use the React-only `RefBadge`.
- `loadMessage()` must be keyed by `repoRoot` plus `commit.hash`, use a
  generation/live guard, clear on no commit, and avoid refetching a same-hash
  commit merely because the `commits` array was rebuilt. Dispose must prevent a
  late `git.commitMessage()` result from touching the view.

### 4. Convert `CommitDiffPanel` and move its effects to explicit lifecycle code

Rename `src/renderer/editors/git-tree/CommitDiffPanel.tsx` to
`CommitDiffPanel.ts` and export `CommitDiffPanelView`.

- Keep the panel-local `CommitDiffPanelState` if useful, but remove its
  `init()` effect registrations. If it remains a `TComponentModel`, drive it
  with `createComponentModelDriver` and no `effect()` calls, dispose that
  driver through `this.own()`, and use a compound `bind()` on the model state.
  The driver must be mounted from `onMount()` only.
- Replace the React `useMemo`/`useCallback` values with native methods:
  `languageFor`, `itemsFor`, `changeMapFor`, `getTrailing`, file selection,
  new-tab navigation, and context-menu construction. Preserve the exact link
  metadata at `CommitDiffPanel.tsx:189-208` after the rename.
- Use `FileListView` directly, with `getTrailing` returning a new native
  status-badge Node built from `gitStatusMeta(status)` and the existing
  `.git-status-badge` CSS. Never return `GitStatusBadge`, an SVG/HTML string,
  or a React element. Keep `compact`, selected path, context-menu, and click
  behavior unchanged.
- Use `SplitterView` directly with vertical orientation, `side: "before"`,
  `border: "after"`, value `listWidth`, min 140, and the existing width
  callback. Use `MonacoDiffEditorHostView` directly with the same read-only,
  single-column options and initial values.
- Keep dynamic children owned: when a valid commit appears, claim/mount the
  file list and splitter and append them to the raw file/view Panels; when no
  commit remains, call `releaseChild()` before removing their roots. Claim and
  mount a Monaco host only when a selected file exists; release it when the
  selected file disappears. Do not merely detach a claimed view.
- Move the first old effect into `loadFiles()`, keyed by repo root, selected
  hash, and the selected commit in the current commit source. Clear changes
  and selected file when no commit exists. On a successful file load, assign
  `changes` and the first selected path in one state update and then request
  the diff for that selection.
- Move the second old effect into `loadDiff()`, keyed by current commit,
  selected file, and its change record. Read `parent[0]` and `oldPath` exactly
  as before; fetch an empty original for an initial commit. Use a generation
  guard for both `git.show()` calls and clear `{ before: "", after: "" }` when
  the selection is invalid.
- Replace the three DOM effects with one ordered `applyState()` consequence:
  update the FileList props and selected path, ensure/update the Monaco host,
  call `setDiffValues`, call `setLanguage`, and reset both Monaco scroll
  positions after new diff values. Do not refetch from the state binding after
  `setDiff`; load requests are triggered at their actual dependency write
  sites so a diff-state notification cannot recursively refetch itself.
- Rebind the `gitTree` source manually as specified in the subscription audit;
  this is required even though the current parent normally passes a stable
  submodel.

### 5. Preserve the parent conditional bottom-panel behavior

The React parent mounts `CommitInfoPanel` only for `tab === "commit"` and
`CommitDiffPanel` only for `tab === "diff"` at
`GitTreeEditorView.tsx:298-315`. The native parent must keep that boundary:

- On `gitOk && hasCommits`, claim/mount the horizontal `SplitterView`, raw
  bottom Panel, raw tabs Panel, and `SegmentedControlView` once.
- On tab changes, release the old `CommitInfoPanelView` or
  `CommitDiffPanelView`, remove its root, construct the other view with the
  current `repoRoot`, `gitTree`, `selectedHash`, and diff-list width, claim it,
  append it to the existing scroll Panel, and mount it.
- On `gitOk` becoming false or on initial loading with no commits, release the
  bottom children (including the active tab view) and remove their raw roots.
  Keep the old rule that refresh with existing commits leaves `GitTreeView`
  mounted so its column widths/order survive (`GitTreeEditorView.tsx:141-165`).
- When the body changes from placeholder to history, claim/mount one
  `GitTreeView` directly and put it inside the `direction="column"`,
  `flex={1}`, `height={0}` Panel. Release it before returning to an error or
  loading placeholder.

No `DocumentFragment` may be passed to any PageToolbar or child slot. Raw
Panel/Text elements are parent-owned structural DOM and may be replaced after
all claimed child views in that region have been released.

### 6. Register the native View arm in `index.ts`

Rename `src/renderer/editors/git-tree/index.tsx` to `index.ts`.

```tsx
// Before: index.tsx:7-14
function GitTreeEditorComponent({ model }: { model: EditorModel }) {
    return <GitTreeEditorView model={model as GitTreeEditorModel} />;
}

export const gitTreeModule: EditorModule = {
    createEditor: () => new GitTreeEditorModel(new TComponentState(...)),
    Component: GitTreeEditorComponent,
    // existing newEditorModel remains below
};
```

```ts
// After: index.ts
export const gitTreeModule: EditorModule = {
    createEditor: () =>
        new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState())),
    View: GitTreeEditorView,
    newEditorModel: async (filePath?: string) => {
        const model = new GitTreeEditorModel(
            new TComponentState(getDefaultGitTreeEditorState()),
        );
        if (filePath) {
            const link = decodeGitTreeLink(filePath);
            if (link) model.initFromRepoRoot(link.repoRoot);
        }
        return model as unknown as EditorModel;
    },
};
```

Remove the generic React wrapper and its JSX/type-only `EditorModel` use only
where no longer needed for the factory return. Preserve `createEditor`, the
existing `newEditorModel` decoding behavior, and all three model exports at
`index.tsx:28-29`. The extensionless registry import at
`register-editors.ts:176` remains unchanged. The expected Git diff for each
`.tsx` → `.ts` rewrite is delete-plus-add, as recorded by EPIC-068 E10-5.8.

### 7. Verify the conversion and scope boundary

Do not add tests or a test harness. Verify the real editor path and source:

- `gitTreeModule` has `View: GitTreeEditorView` and no `Component`.
- The three renamed files contain no JSX, React hooks, React render faces,
  `mountReact`, or `mountReactHandle`. The retained compatibility faces in
  `components/git-tree/GitTree.tsx`, `components/file-list/FileList.tsx`, and
  `editors/shared/MonacoDiffEditorHost.ts` remain for their audited callers.
- The parent root is one real Panel named `git-tree-editor-root`; it has the
  exact toolbar/body/bottom order and no local contents root.
- `GitTreeView`, `FileListView`, `MonacoDiffEditorHostView`, all listed UIKit
  views, and DOM Panel/Text helpers are used directly. No `GitStatusBadge` or
  `RefBadge` React value enters a slot.
- Every row in the reactive-read table has an explicit binding, native field,
  observer, or event-time consequence. The replaceable `gitTree` subscriptions
  unsubscribe, resubscribe, and immediately apply the current commits.
- History loading, Git-unavailable and initial-loading messages, refresh
  column preservation, commit selection, bottom-panel height cap, tab
  persistence, commit metadata/message loading, diff file loading, rename and
  initial-commit handling, Monaco language/value synchronization, scroll reset,
  file context menu, and open-in-new-tab links remain functional.
- Open the `git-tree` editor through the real `git-tree://` path in the user's
  live session. Its editor subtree reports 0 `[data-react-root]` and 0
  `[data-part="react-slot"]` elements. EPIC-068 E10-2 measured the user's
  session at 4 total roots, with one under `[data-name="page-editor"]` for the
  open `git-tree`; the conversion must remove that one immediately. A context
  menu or other later interaction may create its own application UI resources;
  the opening gate is the editor subtree measurement specified by the epic.
- Do not modify `GitTreeView.ts`, `FileListView.ts`, `PageToolbarView.ts`, any
  parent layout/mounting file, the model, the compatibility shims, dashboard,
  or protected UIKit implementations. Do not commit.

## Concerns / Open Questions

### Resolved: 0 roots is achievable

Yes. The editor-level React root is the only root measured under the open
`git-tree` page editor in EPIC-068 E10-2. The parent can use native Panel/Text
builders and `PageToolbarView`; the history and file lists already have native
views (`GitTreeView.ts:164-385`, `FileListView.ts:15-191`); the splitters,
buttons, tag, segmented control, menu machinery, and Monaco diff host all have
native arms verified above. The two React-only badge faces are local leaves
with no other production importers and can be replaced by DOM Nodes in scope.
No converted editor child needs `mountReactHandle`, so the target 0-root gate
is achievable.

This is an opening measurement claim. The app's popup/menu implementation and
other unrelated surfaces may have their own lifecycle resources during later
interaction; that does not reinstate a React root in the `git-tree` editor
subtree.

### Resolved: use a real Panel root

The old editor returns one outer Panel at
`GitTreeEditorView.tsx:168-176`, unlike the image fragment that contributes
multiple page-column siblings. Adopt a `createPanelElement` root so the page
column still receives one flex item with the same overflow, background, and
growth behavior. Do not add `createContentsRoot()`.

### Resolved: native arms for interaction-heavy controls

`SplitterView`, `SplitButtonView`, `SegmentedControlView`, `IconButtonView`,
`TagView`, `DividerView`, `MenuView`, and `openMenu` are all present at the
source locations in the replacement table. `SplitButtonView` already owns
its caret menu through `openMenu` (`SplitButtonView.ts:132-142`), so the editor
does not need the removed `WithMenu` render-prop path. `GitTree`'s context menu
is already passed through the native `showGridContextMenu` callback
(`GitTreeView.ts:168-169`); preserve that callback and its app popup handoff.

`Panel` and `Text` do not expose classes named `PanelView` or `TextView`, but
that is not a missing native arm: their shared DOM builders are the established
native replacements at `panel-style.ts:349-356` and `text-style.ts:100-108`.

### Resolved: React-only status/ref badges do not block 0 roots

`GitStatusBadge.tsx:4-6` and `RefBadge.tsx:14-19` have no native constructors.
They are imported only by the two current editor panels, while the barrel
exports remain public. Build equivalent native spans locally using
`gitStatusMeta`, `REF_COLOR`, the existing classes, text, title, and inline
palette color. `FileListView` receives the status span as a DOM Node, and the
info panel owns its ref spans as raw children. Passing either React face would
route through `fillSlot`'s React arm and invalidate the root claim.

### Risk: replaceable `gitTree` subscriptions

Both panel prop types contain a `gitTree` object. A repeated `bind()` would
register permanent cleanup through `own()` and leave an old source live, even
after a new prop source is installed. Keep one unsubscribe field per panel,
unsubscribe before replacement, immediately apply `source.state.get()`, and
register one final cleanup. This directly follows
`VanillaView.bind()`/`own()` at `vanilla-view.ts:197-216,129-132` and the
replaceable-host pattern established in `CategoryEditor.ts:296-308`.

### Risk: async requests can race tab/selection changes

The old effects return cleanup flags at `CommitDiffPanel.tsx:64-86,88-121`
and `CommitInfoPanel.tsx:41-53`. Native request methods need equivalent
generation/live guards. A result for an earlier commit, file, repo, or
released tab must not write state, create a Monaco host, or update detached
DOM. Release the panel child and invalidate its generation before switching
tabs.

### Risk: dynamic child ownership and conditional arms

React reconciles the Git Tree body, bottom tab view, file list, and Monaco host.
Native code must claim every child exactly once and call `releaseChild()` before
removing a claimed root. Raw Panel/Text elements may be replaced only in a
region whose native children have already been released. Do not add a custom
`onDispose()` solely to duplicate child disposal.

### Risk: toolbar slots are refilled

`PageToolbarView.onUpdate()` calls `fillSlot` again at
`PageToolbarView.ts:420-427`. The refresh root and left-group Panel root must
remain persistent Nodes. A fragment or a newly created contribution object
would be emptied/moved or would cause needless slot transitions. No React
valued toolbar content is needed in this surface.

### Risk: user-visible live-session regression

EPIC-068 E10-5 concern 6 records that `git-tree` is open in the user's live
session and pinned pages are reopened on restart. This makes regressions
immediately visible. Verify the open live page after the conversion, including
toolbar actions, history loading, bottom-tab switching, diff navigation, and
the root count before considering the task ready for implementation review.

### Non-goals and protected files

- Do not modify `src/renderer/components/git-tree/GitTreeView.ts`,
  `src/renderer/components/file-list/FileListView.ts`,
  `src/renderer/editors/base/PageToolbarView.ts`, or any parent layout/mounting
  file.
- Do not modify `GitTreeEditorModel.ts`, `GitTree.tsx`, `FileList.tsx`,
  `MonacoDiffEditorHost.ts`, `MonacoDiffEditorHostView.ts`,
  `GitStatusBadge.tsx`, `RefBadge.tsx`, `GitTree.css`, or the components'
  barrels; their existing arms/shims and audited importers remain required.
- Do not convert the `git-changes` or `git-refs` secondary panels, the File
  Diff editor, the Storybook harness, or any other editor in EPIC-068.
- Do not change `register-editors.ts`; its extensionless dynamic import remains
  valid after the rename. If Vite reports the documented stale `.tsx` module
  specifier during later implementation, invalidate the importer as a build
  cache repair only; it is not part of the planned source change.
- Do not add tests, a test harness, dashboard work, `/review`, `/document`,
  `/userdoc`, or a commit.

## Acceptance Criteria

- `src/renderer/editors/git-tree/index.ts` exists, registers
  `View: GitTreeEditorView`, has no `Component`, and preserves the existing
  editor factory, link decoding, and model exports.
- `GitTreeEditorView.ts`, `CommitDiffPanel.ts`, and `CommitInfoPanel.ts` are
  native TypeScript views with no JSX or React hooks. The parent adopts one
  stable real Panel root and does not create a contents root.
- The parent claims and mounts the native toolbar, history body, bottom
  splitter/tabs, and active bottom view correctly; dynamic body/tab/Monaco
  children are released before replacement and no custom child-disposal hook is
  added.
- The complete reactive-read table is implemented: editor/history/branch state
  uses, local selected hash, resize measurement, derived layout, panel state,
  async effect dependencies, memoized collections, callbacks, and commit
  metadata/message reads all have explicit native consequences.
- `CommitDiffPanelView` uses `FileListView`, `SplitterView`, and
  `MonacoDiffEditorHostView`; `CommitInfoPanelView` uses native text and ref
  spans. No `GitStatusBadge` or `RefBadge` React element is passed to a slot.
- All `gitTree` source-object changes use manual replaceable subscriptions
  with unsubscribe, resubscribe, immediate current-value apply, and one final
  cleanup. No repeated `bind()` is used for a source that can change.
- Toolbar contributions are persistent Nodes and remain intact across every
  `PageToolbarView.onUpdate()` refill; no `DocumentFragment` reaches a slot.
- History, toolbar refresh/pull/push/switch/create-branch actions, branch
  status indicators, selection/context menus, persisted column and bottom
  panel layout, commit details, diff file loading, Monaco language/value/scroll
  behavior, and new-tab navigation match the current React behavior.
- In the real user's open `git-tree` editor, the subtree measures 0
  `[data-react-root]` elements and 0 `[data-part="react-slot"]` elements. The
  EPIC-068 live-session page-editor root disappears from the count immediately.
- No tests/harnesses, dashboard duplicate, protected-file changes, completion
  workflow, or commit is introduced; EPIC-068/US-1116 remains unchecked.

## Files that need NO changes

- `src/renderer/editors/git-tree/GitTreeEditorModel.ts`,
  `GitRefsView.ts`, `GitChangesView.ts`, and `GitPanelSecondaryView.ts`.
- `src/renderer/components/git-tree/GitTreeView.ts`, `GitTree.tsx`,
  `GitStatusBadge.tsx`, `RefBadge.tsx`, `GitTree.css`, and
  `components/git-tree/index.ts`.
- `src/renderer/components/file-list/FileListView.ts`, `FileList.tsx`, and
  `components/file-list/index.ts`.
- `src/renderer/editors/shared/MonacoDiffEditorHost.ts` and
  `MonacoDiffEditorHostView.ts`.
- `src/renderer/editors/base/PageToolbarView.ts`, `PageToolbar.ts`,
  `editorRegistry.ts`, and `src/renderer/editors/register-editors.ts`.
- `src/renderer/ui/app/AsyncEditorView.ts`, `RenderEditorView.ts`,
  `PageContentView.ts`, `Pages.css`, and all other parent layout/mounting files.
- `src/renderer/uikit/Panel/panel-style.ts`, `Panel/Panel.tsx`,
  `Text/text-style.ts`, `Text/Text.tsx`, and the existing native UIKit view
  implementations (`IconButtonView`, `DividerView`, `TagView`,
  `SplitButtonView`, `SplitterView`, `SegmentedControlView`, `MenuView`).
- `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx`; the native Git Tree
  context-menu callback already delegates there.
- `doc/active-work.md` and `doc/epics/EPIC-068.md`; the unchecked US-1116
  dashboard/epic entries already exist and must not be duplicated or marked
  complete during planning.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` → `GitTreeEditorView.ts` | Replace the React surface with the real Panel-rooted native parent, explicit bindings/observer, native toolbar/body/bottom composition, and owned dynamic children. |
| `src/renderer/editors/git-tree/CommitDiffPanel.tsx` → `CommitDiffPanel.ts` | Replace hook/effect-driven diff UI with `CommitDiffPanelView`, explicit state/source synchronization, native FileList/Splitter/Monaco children, request guards, and DOM status badges. |
| `src/renderer/editors/git-tree/CommitInfoPanel.tsx` → `CommitInfoPanel.ts` | Replace the React commit-info face with `CommitInfoPanelView`, a replaceable commit subscription, guarded message loading, native text, and DOM ref badges. |
| `src/renderer/editors/git-tree/index.tsx` → `src/renderer/editors/git-tree/index.ts` | Remove `Component`/JSX and register `View: GitTreeEditorView` while preserving factories, link decoding, and model exports. |

All files listed in “Files that need NO changes” are protected scope
boundaries, not deferred implementation work. 0 React roots for the open
`git-tree` editor is achievable within these four planned file rewrites.
