# US-1030: `GitTree` vanilla view

**Status:** Implemented
**Epic:** [EPIC-058 - De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Depends on:** [US-1027 - `DataGrid` file-list/file-grid consumers](../US-1027-file-list-grid/README.md), the native [`DataGridView`](../../../../src/renderer/uikit/DataGrid/DataGridView.ts), and the existing Git Tree av-grid migration
**Parallel with:** the later page-manager task (US-1031) and the Epic E editor conversions

## Goal

Convert the reusable `components/git-tree/GitTree` surface from a hook-driven React implementation
to a native `VanillaView` behind its existing public React face. Preserve the editor-owned
`GitTreeModel`, av-grid column/layout behavior, commit selection, context menus, pagination footer,
compact file-history variants, and side-select column without changing the three existing production
mount sites.

Remove the last Emotion dependency from `components/git-tree` at the same time. `GitStatusBadge`
remains a small React compatibility wrapper because `CommitDiffPanel` is still a React editor, but
its styling moves to the already co-located static stylesheet. `RefBadge` and the Storybook story
also remain React-facing compatibility surfaces for their current React callers; they are not new
vanilla roots and must not cause the native Git Tree to create nested React roots.

## Background and verified inventory

The folder currently contains 16 tracked files and 2,112 lines: 12 `.ts` files / 1,463 lines and
four `.tsx` files / 649 lines. The four JSX files are:

| File | Lines | Current role | Planned treatment |
|---|---:|---|---|
| `GitTree.tsx` | 514 | public component plus all grid projection/lifecycle logic | thin `mountVanilla` face |
| `GitTree.story.tsx` | 89 | Storybook harness with React state and two Panels | remains the React story; its `GitTree` child exercises the public face |
| `GitStatusBadge.tsx` | 15 | status chip used by `CommitDiffPanel` | remain a React wrapper, remove Emotion and use static CSS |
| `RefBadge.tsx` | 31 | ref chip used by `CommitInfoPanel` | remain a React wrapper; it already uses static CSS and inline palette color |

`GitTree.tsx` is the only large runtime React remnant. It currently imports React hooks, reads the
editor-owned `GitTreeModel.state`, derives `GitCommitRow[]`, builds columns, owns a `DataGrid`,
registers the live grid with the model, updates selection and side toggles imperatively, manages the
load-more footer, and forwards the grid context menu to `showGridContextMenu`.

There are three production JSX mount sites (three source locations), plus the Storybook mount:

| Caller | Variant | Model ownership and behavior |
|---|---|---|
| `editors/git-tree/GitTreeEditorView.tsx` | whole-repository graph | owns `GitTreeEditorModel.gitTree`, selected hash, persisted column layout, and commit context-menu items |
| `editors/file-diff/RevisionPicker.tsx` | compact file history | renders the same component for the `from`/`to` picker path, with synthetic Unstaged/Staged rows and lazy `ensureLoaded()` |
| `editors/file-diff/GitDiffRevisionsSecondaryView.tsx` | compact history with side select | uses the editor-owned file tree, synthetic rows, and the L/R side-select column |
| `components/git-tree/GitTree.story.tsx` | whole and compact story variants (harness only) | seeds a model with a synthetic DAG and exercises optional side selection |

The remaining imports are data/helper usage rather than `GitTree` mounts: `GitTreeEditorModel`
owns the main and file-scoped models, `CommitInfoPanel` uses `RefBadge`/`dateText`, and
`CommitDiffPanel` uses `GitStatusBadge`. No caller styles the GitTree root directly. The only
`GitTree.css` child combinators are inside av-grid cells (`[data-column-key="graph"] > svg`); they
do not depend on the component's outer wrapper.

`GitTreeModel` is already framework-free and is deliberately externally owned. The Git Tree editor
keeps one model for its lifetime, while File Diff owns separate models for its pickers/history
paths. It exposes `state`, `loadMore`, `loadAll`, `setGrid`, and `revealRef`; it must not be
constructed by a component-model driver or disposed by the view. The view only clears the live
grid handle when its own grid disappears.

`DataGridView` is the native av-grid mounting shim. It owns one `AVGrid` instance, imports the
layered `DataGrid.css`, forwards callback props through stable trampolines, and shallow-diffs value
options. It reports the live instance through `onGrid` and reports `null` during disposal. The
GitTree view should reuse this contract rather than reimplementing av-grid mounting or a second
controlled compatibility layer.

`GitTree.css` is already an app-layer stylesheet for the string-rendered graph, ref chips,
side-select cells, and load-more footer. The native view must import it directly; the thin React
face cannot be relied on to deliver CSS once the view is constructed from a non-React caller.

## Implementation plan

### 1. Freeze the measurement and DOM boundary before editing

- Take the Epic D Rule 4 measurement before changing `GitTree.tsx`. Use the settled Git Tree story
  or whole-repository Git Tree editor and one repeatable interaction that opens its commit context
  menu on a populated row. Record both MutationObserver roots, options, raw record counts, and the
  settled state in `EPIC-058.md`; the after-number must use the same action and observer procedure
  after conversion. Do not invent a baseline after the React implementation has been removed.
- Reconfirm the three production mount sites and the Storybook mount, all of which continue to
  import the public `GitTree`
  symbol from the existing barrel. Do not require caller changes or move `GitTreeModel` ownership.
- Before choosing the native root shape, inspect the parent Panels and all Git Tree styles for
  `>`, `:empty`, `:nth-child`, `+`, and `~`. The current React component returns the DataGrid root
  directly. The preferred native shape is to make the `DataGridView.root` the `GitTreeView.root`
  and mount that view in place, so the conversion does not add a real wrapper around av-grid.
  `mountVanilla` still contributes its framework host, but that host is `display: contents` and the
  actual grid root remains the same element that callers previously received.

### 2. Split the public face from the native implementation

- Reduce `GitTree.tsx` to the public `GitTreeProps`, `GitTreeSideSelect`, and `GitColumnLayout`
  declarations plus a thin `mountVanilla` call. Keep the existing export names and generic
  inference used by all callers.
- Add a distinct-basename native module, preferably `GitTreeView.ts`, rather than
  `GitTreeImpl.tsx` beside `GitTree.tsx`. There is no `.ts`/`.tsx` collision with that name, and
  `index.ts` can continue exporting the public `GitTree` face from `./GitTree`.
- Give the native view a public constructor as required by `mountVanilla`. Construct one
  `DataGridView<GitCommitRow>` in the constructor and use its root as the view root; this preserves
  the existing DataGrid DOM contract and avoids a second layout wrapper. Do not assign a new
  `data-type` on the shared root: it must remain `data-type="data-grid"`, because `DataGrid.css`
  keys the grid's definite flex/relative layout from that marker. `data-name` continues to flow
  through the `name` option. The view owns the DataGridView lifecycle and must dispose it before
  releasing its own listeners/timers.
- Import `GitTree.css` from the native module and leave the Storybook story as a React component.
  The story must continue to use `GitTree` through its public face, not import the native class.

### 3. Project model state into one persistent DataGrid

- Bind the editor-owned `model.state` after mount. The selected projection needs only `commits`,
  `loadingMore`, and `hasMore`; `loading` and `gitOk` are handled by the owning editor and are not
  GitTree rendering inputs. Apply the initial state immediately and guard every later application
  against disposal through `VanillaView.bind`.
- Derive rows exactly as today: `toCommitRows(commits, LANE_COLORS)` followed by the memoized
  `leadingRows` when present. Pass `getRowKey: row => row.hash`, `GIT_TREE_ROW_HEIGHT`, sorting and
  filtering disabled, and the same `name` value to `DataGridView`.
- Preserve the rows identity gate from `useMemo([commits, leadingRows])`: cache the projection by
  the pair of source identities and do not hand `DataGridView.update()` a fresh rows array on an
  unrelated parent update. Derive `maxColumns` from that same cached rows array so graph refits
  cannot be triggered by a spurious projection rebuild. The three production callers already
  memoize their `leadingRows` arrays where they provide them.
- Build the initial columns once from the first available row lane count, compactness, and
  side-select presence, then apply `initialColumnLayout` once. Do not rebuild columns on ordinary
  state updates: av-grid owns user-dragged widths and order.
- Keep the existing structural key (`compact` plus whether the side-select column exists). If it
  changes, rebuild columns intentionally. If only `maxColumnCount(rows)` changes in a non-compact
  view, call `refitGraphColumn(grid.getColumns(), maxColumns)` so only the graph width and renderer
  change; preserve every other live width and order.
- Keep `sideSelect` behind a live ref. Build its cell renderer only when the optional column's
  presence changes, call `grid.refresh()` when `selectionKey` changes, and continue to use delegated
  `handleSideSelectClick` because av-grid cells are pooled. Never attach a per-cell listener.
- Treat `selectedHash` as an imperative selection update. Seed it when `onGrid` receives the live
  grid, then call `setSelected` only when the incoming hash changes. Do not pass a changing
  `selected` option back through `DataGridView`; av-grid owns selection after creation.
- On native-view prop updates, update the existing `DataGridView` with the current rows, footer,
  callbacks, and options. Do not reconstruct the model, DataGridView, columns, or footer for a
  normal React parent render. The model identity is fixed for the view lifetime because
  `VanillaView.bind()` has no rebind operation; store the bound model and throw a descriptive
  error if `props.model` changes instead of silently listening to the old model. `DataGridView`'s
  callback trampolines must read current `this.props` so inline caller callbacks do not cause
  listener churn.

### 4. Preserve grid interactions and pagination

- Keep `onCellClick`: a side-select column click is delegated to `handleSideSelectClick` and does
  not invoke commit selection; all other cells call the latest `onSelectCommit(row.hash)`.
- Keep the two context-menu options separate: always wire the stable module-level
  `showGridContextMenu`; only the optional `getContextMenuItems` projection is absent when the
  public prop is absent, and only it gates the cell-item factory. Forward the native av-grid event
  without introducing a React event facade.
- Create one footer with the existing `createLoadMoreFooter` factory for the view lifetime, pass its
  element as `extraElement` only when `hasMore`, and pass
  `whiteSpaceY={hasMore ? GIT_TREE_ROW_HEIGHT : undefined}` so trailing slack is removed after the
  final page loads. Update
  `setLoading(loadingMore)` and dispose its delegated listener before the grid is destroyed. The
  grid is the owner that parents the footer; the GitTree view must not append or remove it
  independently.
- Preserve the resize/reorder persistence contract. `onColumnResize` schedules the same 150ms
  trailing emission, `onColumnsReorder` emits immediately, and neither callback fires for the
  view's own programmatic structural rebuilds. Clear the timer during disposal.
- Keep `GitTreeModel.setGrid(grid)` / `setGrid(undefined)` aligned with DataGridView's mount and
  disposal callbacks so `revealRef()` still focuses the Subject column or the last visible row and
  becomes a no-op when the tree is not the main editor.

### 5. Remove the folder's Emotion importer without widening the React boundary

- Replace `GitStatusBadge.tsx`'s `styled.span` with the same plain span/data contract and a
  `git-status-badge` static rule in `GitTree.css`. Preserve the status title, letter, inline
  palette color, font metrics, padding, and `data-type="git-status-badge"`; do not move the
  status-meta string renderer's ownership out of its existing FileGrid stylesheet in this task.
- Have `GitStatusBadge.tsx` import `GitTree.css` directly as well. Its React editor caller can
  render the badge without a GitTree instance being mounted, so the native GitTree import graph
  cannot be the only delivery path for the shared status rule.
- Keep `RefBadge.tsx` as a React wrapper because `CommitInfoPanel` remains a React editor. It
  already uses the static `.git-ref-badge` rule and inline palette color, so no native root or new
  Emotion dependency is needed. Move the shared `REF_COLOR` lookup into a neutral `.ts` helper and
  have both `RefBadge.tsx` and the native view import it; the native view must not import a
  React-bearing module merely to read a color table. Future editor conversion can replace the
  wrapper with a direct element helper without changing the chip contract.
- Do not convert `GitTree.story.tsx`: Storybook stories are intentionally React-facing, and its
  purpose is to exercise the public adapter and the synthetic DAG/side-select behavior.

### 6. Verify the full reusable surface

- Run typecheck, lint, production build, and `git diff --check`. Re-scan `components/git-tree` for
  `@emotion` and confirm the folder has no runtime React hook imports outside the retained story,
  `GitStatusBadge`/`RefBadge` compatibility wrappers, and public `GitTree` face.
- Use the existing GitTree story in whole, compact, and compact+side-select modes. Verify merge,
  octopus, branch-out, ref chips, HEAD color, graph clipping, dates, author/subject/hash
  truncation, row selection, keyboard navigation, context menu, load-more/loading state, column
  resize/reorder, and graph refit after new rows.
- Smoke the whole-repository editor: initial loading, refresh without losing column layout, branch
  or tag reveal through `GitTreeModel.revealRef`, commit context-menu actions, and bottom-panel
  selection/diff updates.
- Smoke both File Diff paths: lazy picker loading, Unstaged/Staged leading rows, selected-row
  synchronization, compact layout, and the persistent revisions panel's L/R toggles. Verify the
  side-select column remains sticky-left and does not steal grid focus.
- Confirm unmount/remount clears the model's live grid, footer and resize timer without disposing
  the externally owned model or leaving a late callback writing to a destroyed DataGrid.
- Record the matching Rule 4 after-number in `EPIC-058.md`; no side-by-side React comparison is
  needed because the public React face now mounts the native view.

## Concerns / open questions

### 1. Root identity versus `mountVanilla`'s host

`mountVanilla` necessarily adds a `display: contents` host around the view root. Adding another
real GitTree wrapper would change the parent/child shape and could alter flex measurement for the
DataGrid. The plan chooses `DataGridView.root` as the native view root because it preserves the
existing DOM identity without an extra real wrapper. `VanillaView.dispose()` leaves that shared
root attached, so the child grid can be disposed safely and the adapter remains responsible for
detachment. The shared root must retain `data-type="data-grid"`; never overwrite it with a
component marker. `DataGrid.css` therefore continues to provide the grid's definite flex/relative
layout. Verify the actual parent geometry in the story and both compact consumers.

### 2. The model is shared and externally owned

`GitTreeModel` survives popover close/open and can be owned by a Git Tree editor or File Diff.
Disposing the view must clear only `setGrid(undefined)` and unsubscribe the view's state listener;
it must never call `model.dispose()`. Conversely, a late model write is already guarded by the
model, while a late state listener must be guarded by the view before touching grid/footer DOM. The
model identity is fixed for the view lifetime; `onUpdate` must reject a different model because
`VanillaView.bind()` cannot be rebound.

### 3. Initial columns may be built before a lazy picker has rows

`RevisionPicker` can mount an empty grid before `ensureLoaded()` resolves. Build the initial
compact columns from the empty row set and allow later state application to update rows. Whole-repo
graph views must refit when the first commit page changes the lane count; otherwise the initial
empty state would leave a graph column with the wrong width/renderer.

### 4. Callback identity and av-grid option ownership

The old React implementation used refs and memoized callbacks to avoid replacing av-grid columns
or resetting user layout. The native view must preserve that distinction: callbacks can be stable
methods that read current props, while rows/footer/white-space are value options updated only when
their identity or value changes. Do not pass a newly built column array through `DataGridView.update`
on every state notification.

### 5. Pooled cells make the delegated side-select path load-bearing

Side-select cells are strings rendered into pooled av-grid cells. Their spans must remain listener-
free, with `data-side`/`data-active` rewritten by the existing renderer and clicks resolved at the
grid boundary. A per-cell DOM listener would be lost or duplicated when the grid recycles a cell.

### 6. Footer ownership and teardown order

The footer is parented by av-grid as `extraElement`, unlike a normal child view. `createLoadMoreFooter`
owns its click listener, while av-grid owns placement. Dispose the footer listener before destroying
the grid, but never call `remove()` or `replaceChildren()` on the footer from the view.

### 7. The public React compatibility leaves are intentional

Converting only `GitTree.tsx` does not mean every `.tsx` file in the folder can become `.ts`: the
story and the two chip wrappers are still consumed by React code. `GitStatusBadge` must lose
Emotion to satisfy the folder boundary, but `RefBadge` remains a React render function until the
Git Tree editor's commit panels are converted. The acceptance criterion should count these as
documented compatibility leaves, not as accidental native-view gaps.

### 8. Static CSS is delivered through the native import graph

The native implementation must import `GitTree.css` directly. `RefBadge.tsx` currently imports the
same sheet, but that import can disappear from a future React-only caller and must not be the
stylesheet delivery mechanism for the av-grid graph, ref chips, side-select cells, footer, or the
new status badge rule.

### 9. Context-menu event and selection timing

The native callback receives av-grid's `GridContextMenuEvent`, not a React event. Preserve the
existing target gate and selection snapshot, then call `showGridContextMenu` with the library event.
The selected hash callback and grid's own selection handling must remain in the same click pass so
the editor's bottom panels see the clicked commit without a React effect round-trip.

## Acceptance criteria

- [ ] `GitTree.tsx` is a thin public mount face with unchanged exports, props, and three production
      mount sites; the native implementation has a distinct basename and a public constructor.
- [ ] The native view reuses one `DataGridView` root without an extra real wrapper, preserves
      `data-type="data-grid"`, `data-name`, parent flex measurement, and DataGrid CSS delivery.
- [ ] `GitTreeModel` remains externally owned; `setGrid` is registered/cleared correctly and model
      disposal is never performed by the view.
- [ ] Rows, initial layout, graph refit, compact columns, side-select refresh/delegation, selected
      hash, context menus, load-more footer, and 150ms layout persistence match current behavior.
- [ ] Three production mount paths and the Storybook whole/compact/side-select variants work in
      both themes, including empty/lazy-loading and refreshed states.
- [ ] `GitStatusBadge` no longer imports Emotion and keeps its status/title/color/metrics contract;
      `RefBadge` and the story remain documented React compatibility leaves.
- [ ] No per-cell listeners, per-row React roots, or new controlled av-grid reconciliation layer
      are introduced; unmount leaves no grid/footer/timer/state-listener residue.
- [ ] The Rule 4 before/after records use the same populated Git Tree context-menu interaction and
      are recorded in `EPIC-058.md`, or remain explicitly pending for live MCP verification.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/components/git-tree/GitTree.tsx` | Thin public React face; retain public prop/type exports |
| `src/renderer/components/git-tree/GitTreeView.ts` | New native view, DataGrid projection, lifecycle, columns, footer, and interaction wiring |
| `src/renderer/components/git-tree/GitStatusBadge.tsx` | Remove Emotion wrapper; retain React compatibility component with static class/data attributes |
| `src/renderer/components/git-tree/GitTree.css` | Add static status-badge rule; retain graph/chip/side/footer rules |
| `src/renderer/components/git-tree/git-ref-color.ts` | New neutral `REF_COLOR` lookup shared by the native view and `RefBadge.tsx` |
| `src/renderer/components/git-tree/RefBadge.tsx` | Import `REF_COLOR` from the neutral helper; keep the React compatibility wrapper |
| `src/renderer/components/git-tree/index.ts` | Export the public face unchanged; only add a native export if a caller genuinely needs it |
| `doc/architecture/key-files.md` | Add `GitTreeView.ts` if the native owner meets the index's subsystem-entry threshold |
| `doc/active-work.md` | Link this task under EPIC-058 |
| `doc/epics/EPIC-058.md` | Link the task, record Rule 4 measurements, and update status at implementation/review time |

`GitTreeModel.ts`, `GitChangesModel.ts`, `GitBranchesModel.ts`, all layout/cell/footer helpers,
`RefBadge.tsx`, `GitTree.story.tsx`, `GitTreeEditorView.tsx`, `RevisionPicker.tsx`, and
`GitDiffRevisionsSecondaryView.tsx` should not change for the conversion unless verification finds
a concrete public-contract issue. The story and editor callers remain outside the implementation
boundary.

## Related work

- [EPIC-058 - De-React Epic D](../../epics/EPIC-058.md)
- [US-1027 - `DataGrid` file-list/file-grid consumers](../US-1027-file-list-grid/README.md)
- [US-1021 - Git Tree av-grid migration](../US-1021-git-tree-av-grid/README.md)
