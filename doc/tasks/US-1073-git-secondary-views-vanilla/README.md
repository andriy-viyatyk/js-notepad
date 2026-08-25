# US-1073 — Git secondary views on the vanilla arm

## Goal

Convert the `git-changes` and `git-diff-revisions` secondary-view providers to public
`VanillaView<SecondaryViewProps>` classes and register both with `arm: "vanilla"`. Preserve the
Git panel’s changes/branches/tags controls, file-history revision selection, native DOM icons,
late header publication, and collapsed-panel lifetime semantics without converting the git-tree
editor’s main view.

## Background

### Verified registration and provider surface

`src/renderer/editors/register-editors.ts:84-94` currently registers both panels without an
`arm`, so the registry selects the React arm while retaining the existing dynamic imports:

```ts
// Before
secondaryViewRegistry.register({
    id: "git-changes",
    label: "Git",
    loadComponent: () => import("./git-tree/GitPanelSecondaryView"),
});

secondaryViewRegistry.register({
    id: "git-diff-revisions",
    label: "File History",
    loadComponent: () => import("./file-diff/GitDiffRevisionsSecondaryView"),
});

// After
secondaryViewRegistry.register({
    id: "git-changes",
    label: "Git",
    arm: "vanilla",
    loadComponent: () => import("./git-tree/GitPanelSecondaryView"),
});

secondaryViewRegistry.register({
    id: "git-diff-revisions",
    label: "File History",
    arm: "vanilla",
    loadComponent: () => import("./file-diff/GitDiffRevisionsSecondaryView"),
});
```

The current provider files measure 177 lines (`GitPanelSecondaryView.tsx`), 379 lines
(`GitChangesView.tsx`), 175 lines (`GitRefsView.tsx`), and 134 lines
(`GitDiffRevisionsSecondaryView.tsx`). The epic’s 185/142 figures are its opening measurements;
the plan follows the current source rather than those estimates.

`src/renderer/editors/explorer/SearchSecondaryView.ts` is the complete vanilla provider precedent:
it has a public constructor, extends `VanillaView<SecondaryViewProps>`, owns a native panel root,
creates/mounts child views in `onMount()`, calls `createSideBarPanelHeader` with
`props.headerRef` and `props.iconElement`, forwards every new prop through `onUpdate()`, and
disposes the children and header handle. `src/renderer/uikit/CLAUDE.md` Rule 9 additionally
requires that these new constructors create only the stable root; child DOM, listeners,
subscriptions, measurements, and timers begin in `onMount()`.

The host sets `alwaysRenderContent: true` in
`src/renderer/ui/secondary-views/SecondaryViewsView.ts:204-219`, so collapsed panels remain
mounted. `SecondaryViewsView.lazyViewProps()` passes `headerRef`, `iconElement`, and
`expanded`; `publishHeader()` can make the ref `null` first and can replace it later. The
converted providers must call `SideBarPanelHeaderHandle.update()` on every `onUpdate()` with the
latest ref. The handle in `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts:21-137`
tracks `currentHeader` and reparents its owned nodes, so the provider must never cache the header
element or manually append to it.

The current React providers do not read `expanded` at all. `GitPanelSecondaryView.tsx` always
renders Refresh/Close and Show-in-main header controls, its `SegmentedControl`, and its body
actions. `GitDiffRevisionsSecondaryView.tsx` always renders its Refresh header action. The
vanilla providers must gate header `actions` and `onShowMain` when `expanded === false`, including
when that value changes in `onUpdate()`; this is an intentional behavior correction, not parity
with the current React code. The bodies remain mounted while collapsed.

### Shared `components/git-tree/` importer audit and per-file verdict

`src/renderer/components/git-tree/` is shared. The directory contains the already-native
`GitTreeView.ts` plus these React files. The following list is the complete `src/` importer audit,
including the barrel re-exports and type-only internal imports found by grepping each basename.

| React file | Importers found in `src/` | Verdict for US-1073 |
|---|---|---|
| `src/renderer/components/git-tree/GitTree.tsx` | `src/renderer/components/git-tree/index.ts` re-exports it; `src/renderer/components/git-tree/GitTreeView.ts` imports `GitTreeProps`/`GitTreeSideSelect` as types; `src/renderer/components/git-tree/side-select-cell.ts` imports `GitTreeSideSelect` as a type; `src/renderer/components/git-tree/GitTree.story.tsx` imports `GitTree`/`GitTreeSideSelect`; `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.tsx` imports `GitTree`/`GitTreeSideSelect` through the barrel; `src/renderer/editors/file-diff/RevisionPicker.tsx` imports `GitTree`/types through the barrel; `src/renderer/editors/git-tree/GitTreeEditorView.tsx` imports `GitTree`/`GitCommitRow` through the barrel. | Keep the React-facing `GitTree` signature and adapter. Convert only the secondary provider’s use to direct `GitTreeView`; `RevisionPicker.tsx`, `GitTreeEditorView.tsx`, the story, and the native helper type imports survive. `GitTreeEditorView.tsx` is the git-tree editor’s main view and is explicitly out of scope. |
| `src/renderer/components/git-tree/GitStatusBadge.tsx` | `src/renderer/components/git-tree/index.ts` re-exports it; `src/renderer/editors/git-tree/CommitDiffPanel.tsx` imports and renders it through the barrel at its `getTrailing` projection. | Leave the React face unchanged because `CommitDiffPanel.tsx` survives as a React consumer. The converted changes view continues using the existing native `gitStatusMarkup()` path instead. |
| `src/renderer/components/git-tree/RefBadge.tsx` | `src/renderer/components/git-tree/index.ts` re-exports it; `src/renderer/editors/git-tree/CommitInfoPanel.tsx` imports and renders it through the barrel. | Leave the React face unchanged because `CommitInfoPanel.tsx` survives as a React consumer. The refs secondary view uses direct DOM icons/text rather than this badge. |

The audit therefore resolves the epic’s Concern 4 in favor of Rule 2 for all three files: their
React-facing signatures remain until the last surviving React caller is converted. None of these
React files is renamed, deleted, or rewritten in US-1073. This also obeys Rule 1 at the editor
boundary: `GitTreeEditorView.tsx`, `CommitInfoPanel.tsx`, and `CommitDiffPanel.tsx` are not
converted together with their parent/editor surfaces.

### Current React projections to preserve

`GitPanelSecondaryView.tsx` type-guards `GitTreeEditorModel`, reads persisted `gitPanelTab` and
`branchesAlphabetical`, derives a unique changed-file count from `changes.state.unstaged` plus
`staged`, and observes `model.isMain` through `model.page?.state`. Its header contains the repo
name `Tag`, a title whose count is tinted with `color.misc.blue`, Refresh, Close, and Show Git
Tree. Its body contains a `SegmentedControl`, a conditional Sort-alpha `IconButton`, and either
`GitChangesView` or `GitRefsView`.

`GitChangesView.tsx` reads `GitChangesModel` state (`unstaged`, `staged`, `gitOk`, `branch`) and
keeps transient unstaged/staged selections plus a one-time 50% split height. It renders two
vanilla-backed `FileGrid` instances, a `Splitter`, Stage/Unstage/Delete actions, Commit and Reset
dialogs, and opens the file’s Git Diff through `model.openChangeDiff(change, listKind)`. Its
`useState`/`useEffect` pair is only the `bottomHeight`/`ResizeObserver` lifecycle and will become
view fields plus an `onMount()` observer; its `TComponentModel` selection state becomes view
fields and native `FileGridView` callbacks.

`GitRefsView.tsx` reads `GitBranchesModel`, persisted expansion and sort state, and transient
hover `activeIndex`. It builds the selected branches/remotes or flat-tags subset with
`buildRefsTree()`, decorates branch/tag/remote/folder rows, reveals refs, supplies native context
menus for switching, and persists expansion through `setBranchesExpanded()`. Its `useMemo`,
`useCallback`, and `useState` become view fields and `TreeView<GitRefNode>` props; the existing
`buildRefsTree()` and `REF_COLOR` remain the source of ref ordering and palette values.

`GitDiffRevisionsSecondaryView.tsx` reads `FileDiffEditor.state.from`, `to`, and `hasStaged`, plus
`model.fileTree.state.gitOk`. It prepends synthetic Unstaged/Staged rows, computes the L/R
`GitTreeSideSelect` projection, updates `setFrom`/`setTo`, and renders a Refresh header action and
the existing compact `GitTree`. Its `useMemo` values become fields recomputed before
`GitTreeView.update()`; `GitTreeView` already owns the native grid and side-select cell.

### Icon and color audit

Every explicit glyph used by the two providers is covered by
`src/renderer/theme/icon-registry.ts` and can be passed to `createIconElement()` or an
`IconButtonView` as an `IconName`:

| Existing JSX glyph | Verified registry name | Native use |
|---|---|---|
| `RefreshIcon` | `refresh` | Git header, File History header |
| `CloseIcon` | `close` | Git header |
| `SortAlphaIcon` | `sort-alpha` | Git refs toolbar |
| `FilterArrowDownIcon` | `filter-arrow-down` | Stage action and context menu |
| `FilterArrowUpIcon` | `filter-arrow-up` | Unstage action and context menu |
| `DeleteIcon` | `delete` | Reset context menu |
| `TagIcon` | `tag` | Tag rows and switch-tag menu |
| `GitIcon` | `git` | Branch rows and switch-branch menu |
| `GlobeIcon` | `globe` | Remote rows and switch-remote menu |
| `FolderOpenIcon` | `folder-open` | Ref folder rows |
| Header’s `ChevronRightIcon` | `chevron-right` | Shared native header helper |
| Tree chevrons | `chevron-right`, `chevron-down` | Existing `TreeItemView` |

The editor fallback icons are already DOM-capable in the current source: `GitTreeEditorModel`’s
`getIconElement()` returns `GitIcon.createElement({ width: 16, height: 16 })`, and
`FileDiffEditor`’s returns the equivalent `CompareIcon` element. The native providers must forward
`props.iconElement`; they must not use `props.icon` or reintroduce `EditorIcon`.

`GitPanelSecondaryView.tsx` currently imports `src/renderer/theme/color.ts` for
`color.misc.blue`. The native projection must retain that token for the changed-file count; it
must not introduce a literal color. The existing `REF_COLOR` and `gitStatusMarkup()` paths remain
theme/palette-backed native projections.

The current native header helper accepts only a string title and no badge, while the React Git
header supplies both a rich count title and a repo `Tag`. The helper therefore needs a small DOM
slot extension in this task: accept a `Node` title arm and `badge?: Node`, retain its current
string title behavior, and update/reparent both through the same handle. The native Git provider
will build the count title with `createTextElement()` and `color.misc.blue`, and the repo badge
with `TagView`; no React slot or portal is needed.

`src/renderer/uikit/Tree/types.ts` currently declares `ITreeItem.label` and
`TreeProps.renderTrailing` as React-facing slots, although `TreeItemView` already routes label and
trailing content through `fillSlot()`. US-1071 is the parallel task widening those declarations
to admit `Node`. This task must reuse that widened source at implementation time and must not
repeat the widening or hide it with an `as unknown as` cast. The refs projection should use plain
string labels for ordinary nodes and a direct DOM `createTextElement()` only for the current-branch
green label, once the US-1071 type is available.

US-1073 owns the shared `SideBarPanelHeaderView.ts` extension described above. US-1074 must
consume this helper unchanged for its optional Mneme root-name `TagView` badge; it must not add a
second `badge?: Node` implementation. The badge contract is generic: the caller creates, updates,
and disposes its badge view, while the header only parents the supplied node by identity. A caller
may therefore supply no badge, replace it when its value changes, or remove it when the value
disappears without the header knowing whether the node came from Git, Mneme, or another panel.

## Implementation Plan

US-1073 is the first task in the epic to land the shared header extension. Its implementation and
acceptance checks must leave `SideBarPanelHeaderView.ts` ready for US-1074 to consume unchanged;
US-1074 owns no follow-up edit to that helper.

1. **Move both registrations to the vanilla arm.** Modify only the two definitions in
   `src/renderer/editors/register-editors.ts`. Keep the ids, labels, and extensionless dynamic
   imports unchanged; add `arm: "vanilla"` exactly as shown in the verified snippet above. Do not
   alter `secondary-view-registry.ts`, `SecondaryViewsView.ts`, `LazySecondaryViewView.ts`, or the
   DOM icon resolution already landed by US-1069.

2. **Extend the native header helper for the Git header’s existing DOM content.** Update
   `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` only as needed to mirror the
   already-supported React header fields:

   ```ts
   // Before
   export interface SideBarPanelHeaderDomProps {
       headerRef: HTMLDivElement | null;
       icon?: Node;
       title: string;
       titleAttribute?: string;
       actions?: Node;
   }

   // After
   export interface SideBarPanelHeaderDomProps {
       headerRef: HTMLDivElement | null;
       icon?: Node;
       badge?: Node;
       title: string | Node;
       titleAttribute?: string;
       actions?: Node;
   }
   ```

   Keep the current stable title-group, action-group, show-main button, late-ref reparenting, and
   disposal behavior. In `SideBarPanelHeaderDom.update()`, retain the existing string path through
   `createTextElement()` and add a direct-node path for the Git count title; attach/detach the
   optional badge before the title inside the shrinkable title group. Apply `titleAttribute` to the
   current title element when it is an `Element`. The helper owns only direct DOM nodes and must not
   call `fillSlot()` or create a React root for this new path. Existing string-title callers,
   including `SearchSecondaryView`, must remain unchanged.

3. **Convert the Git provider and its private body projections to native views.** Rename
   `src/renderer/editors/git-tree/GitPanelSecondaryView.tsx` to `.ts`,
   `GitChangesView.tsx` to `.ts`, and `GitRefsView.tsx` to `.ts`. The two body files have no
   surviving callers outside the Git secondary provider, so they become owned native body views;
   the shared `components/git-tree` React faces listed in the importer table do not.

   In `GitPanelSecondaryView.ts`, export a default public `GitPanelSecondaryView extends
   VanillaView<SecondaryViewProps>`. Its constructor creates only the stable outer panel root. In
   `onMount()` create and mount the `TagView`, Refresh/Close/Sort `IconButtonView`s,
   `SegmentedControlView`, `SpacerView`, body toolbar, and a `SubtreeSwap` for the active
   `GitChangesView`/`GitRefsView`. Use `SubtreeSwap` so switching segments preserves the React
   conditional behavior (one active body, safe disposal/detachment of the old body) without a
   React boundary. Mount each returned child exactly once after creating it; do not claim a
   `SubtreeSwap` branch with `this.child()` as well.

   Bind `GitTreeEditorModel.state` to the selected tab, alphabetical flag, and unique changed-file
   count inputs; bind `model.page?.state` to `model.isMain` as the current React code does through
   `useOptionalState()`. Update the segmented control, sort-button presence, active body, and
   header on each state change. Keep the existing callbacks to `setGitPanelTab`,
   `setBranchesAlphabetical`, `refresh`, `requestClose`, and `showGitTree()`.

   Build the header’s repo badge as a mounted `TagView` with `label: model.repoName`, outlined/sm
   props, truncation, and `title: model.state.get().repoRoot`; build the title DOM with
   `createTextElement("Git", { color: "inherit", size: "md", truncate: true })` plus a count
   `createTextElement("(${fileCount})", { color: color.misc.blue, size: "md" })` when the count is
   nonzero. Pass the badge and title node to `createSideBarPanelHeader()` and always update the
   handle with `props.headerRef` and `props.iconElement`. The title and badge should be rebuilt or
   updated only when their source values change, but the handle must receive the current nodes and
   ref on every header update.

   Gate the header action container and `onShowMain` callback with
   `props.expanded === false ? undefined : ...`; do this from `updateHeader()` called by both
   `onMount()` and `onUpdate()`. This is the intentional expanded-input behavior change identified
   in Background. Keep body controls mounted behind the stack’s existing `alwaysRenderContent`
behavior, and do not treat collapsed state as a reason to dispose the body.

User-visible change: after this task, a collapsed Git panel’s strip no longer exposes its
commit/stage/unstage controls or the Show Git Tree action; those controls return when the panel is
expanded. The body remains mounted for state continuity, and no listed action is useful without
the visible body, so none is retained on the collapsed strip.

   The non-obvious provider projection is:

   ```tsx
   // Before
   <SideBarPanelHeader
       headerRef={headerRef}
       icon={icon}
       badge={<Tag label={model.repoName} />}
       title={fileCount ? <Text>Git <Text color={color.misc.blue}>({fileCount})</Text></Text> : "Git"}
       actions={actions}
       onShowMain={...}
   />

   // After
   this.header = createSideBarPanelHeader({
       headerRef: props.headerRef,
       icon: props.iconElement,
       badge: this.repoBadge.root,
       title: this.createTitleElement(fileCount),
       actions: props.expanded === false ? undefined : this.headerActions.root,
       showMainTitle: "Show Git Tree",
       showMainActive: this.model.isMain,
       onShowMain: props.expanded === false ? undefined : this.showMain,
   });
   ```

   `GitChangesView.ts` must become a public `VanillaView` body with a stable root. Remove its
   `TComponentModel`, `useState`, `useEffect`, `useMemo`, `useCallback`, `ReactNode`, JSX, and
   `useComponentModel` imports. Keep `expandPaths()`, dialog calls, file-click/double-click
   behavior, status markup, rename expansion, and commit identity/branch handling. Replace the
   React `FileGrid` shims with direct `FileGridView` children created and mounted in `onMount()`;
   use `FileGridProps` only as a type if needed. Maintain two panels (`unstaged`, `staged`), a
   `SplitterView`, and native `ButtonView`/`IconButtonView`/`SpacerView` toolbar controls. Store
   `selUnstaged`, `selStaged`, and `bottomHeight` as view fields, update action disabled states
   from those fields, and use the existing `gitStatusMarkup()` callback for the status column.

   Move the one-time split measurement to an `onMount()` `ResizeObserver` with the existing 200ms
   debounce and cleanup. State-bind `model.changes.state` to `unstaged`, `staged`, `gitOk`, and
   `branch`; update the existing FileGrid views and the Commit/Stage/Unstage actions without
   replacing the body root. Use `createIconElement()` nodes for `MenuItem.icon` values so context
   menus remain native; the verified names are `filter-arrow-down`, `filter-arrow-up`, and
   `delete`.

   The body conversion must keep the current native-backed grid projection, not route the
   converted panel through `mountReact`:

   ```tsx
   // Before
   <FileGrid
       items={items}
       onSelectionChange={handleSelectionChange}
       getTrailing={getTrailing}
       getContextMenuItems={getContextMenuItems}
       compact
   />

   // After
   const grid = new FileGridView({
       name: `git-changes-${label.toLowerCase()}`,
       label,
       items,
       onSelectionChange: (selected) => this.setSelection(listKind, selected),
       getTrailing,
       getContextMenuItems,
       compact: true,
   });
   this.gridViews.push(this.child(grid));
   this.root.append(grid.root);
   grid.mount();
   ```

   `GitRefsView.ts` must become a public `VanillaView` body whose native child is
   `TreeView<GitRefNode>`, created/mounted in `onMount()` and updated in place. Remove its React
   hooks and JSX. Preserve the `show` prop, git-unavailable fallback, refs-state projection,
   active-row field, tooltip/ref click behavior, persisted expansion map, historical/alphabetical
   order, and context-menu labels/disabled state. Use `getIconElement()` to create colorized DOM
   icons from `createIconElement()` for `tag`, `git`, `globe`, and `folder-open`; use
   `REF_COLOR.tag`, `.branch`, `.remote`, and `.head` rather than hardcoded colors. For the
   checked-out branch, supply a direct `createTextElement()` label with `REF_COLOR.head`; ordinary
   labels remain strings. This is the only required `Tree` label Node arm, and it must use US-1071’s
   widened declaration rather than a cast.

   Rebuild the fresh refs subset only when `refs`, `branchesAlphabetical`, `currentBranch`, or
   `show` changes; update `TreeView` with `defaultExpandedValues`, `activeIndex`, and the current
   callbacks. Bind both `model.branches.state` and `model.state` so external refs, git availability,
   persisted expansion, and sort changes repaint without a React parent render.

4. **Convert the File History provider against the existing native Git tree.** Rename
   `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.tsx` to `.ts` and export a default
   public `VanillaView<SecondaryViewProps>` class. Its constructor creates only the stable outer
   panel root. In `onMount()` create/mount the Refresh `IconButtonView`, native header handle, and
   one direct `GitTreeView` from `src/renderer/components/git-tree/GitTreeView.ts`.

   Keep `GitTreeProps`, `GitTreeSideSelect`, `GitCommitRow`, and `syntheticCommitRow` as type/data
   imports from their existing modules, but do not import or render the React `GitTree` adapter.
   Bind `FileDiffEditor.state` to `from`, `to`, and `hasStaged`; bind `model.fileTree.state` to
   `gitOk`. Recompute the leading synthetic rows and side-select object, including its
   `selectionKey`, then call `GitTreeView.update()` so L/R glyphs repaint through its existing
   native `side-select-cell` delegation. Keep `shortHashOf`, the unstaged/staged left/right rules,
   and calls to `setFrom()`/`setTo()` exactly equivalent to the current callbacks.

   The key projection is:

   ```tsx
   // Before
   <GitTree
       name="git-diff-revisions-tree"
       compact
       model={model.fileTree}
       leadingRows={leadingRows}
       sideSelect={sideSelect}
   />

   // After
   this.tree = new GitTreeView({
       name: "git-diff-revisions-tree",
       compact: true,
       model: model.fileTree,
       leadingRows,
       sideSelect,
   });
   this.root.append(this.tree.root);
   this.tree.mount();
   ```

   Pass `props.iconElement` to the native header, title it `File History`, and gate only the
   Refresh header action when `props.expanded === false`. Call the header handle’s `update()` from
   both lifecycle hooks with the latest `headerRef`, icon, title, and action node. Keep the
   Git-unavailable panel as a direct native panel/text fallback and do not dispose the tree merely
   because the secondary panel collapsed.

5. **Preserve the shared React faces and the Rule 1 boundaries.** Do not change
   `src/renderer/components/git-tree/GitTree.tsx`, `GitStatusBadge.tsx`, or `RefBadge.tsx`; their
   surviving consumers are recorded in the importer table. Do not convert
   `src/renderer/editors/git-tree/GitTreeEditorView.tsx`, `CommitInfoPanel.tsx`, or
   `CommitDiffPanel.tsx` in this task. The native File History provider uses `GitTreeView` directly,
   while the main editor, RevisionPicker, commit info, commit diff, and story continue to use their
   existing React-facing signatures.

6. **Verify the conversion.** Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`.
   Exercise both panels with Git available and unavailable: Git tab switching, status count and
   repo badge, stage/unstage/reset/commit, split resize, ref expansion/sorting/current-branch
   highlighting/context menus, file-history synthetic rows, L/R selection synchronization,
   refresh, show-main, panel collapse/re-expand, late `headerRef` publication, header replacement,
   navigation, and panel close. Inspect each converted panel for zero
   `[data-part="react-slot"]` nodes and verify the listed icons render as non-empty SVGs. Run a
   focused `rg` importer check afterward to prove that the three shared React faces still have the
   exact surviving importers documented above.

## Concerns

- **US-1071 ordering is a hard type dependency.** At investigation time `ITreeItem.label` and
  `TreeProps.renderTrailing` are still typed as React values, while `TreeItemView` already has the
  `fillSlot()` runtime path. Do not widen those declarations in US-1073 and do not use
  `as unknown as`; implementation must consume the parallel US-1071 widening. If US-1071 is not
  landed when coding starts, the direct current-branch label is blocked until that task lands.
- **Header helper scope.** The current native helper has no badge or rich title arm, but Git’s
  existing React header has both and the changed-file count uses `color.misc.blue`. The small
  `Node`/badge extension in `SideBarPanelHeaderView.ts` is therefore intentional shared-helper
  work owned by US-1073, not a second header implementation. The badge arm is generic and
  identity-based: callers own badge-view creation, updates, and disposal; the helper only parents
  or reparents the current node and accepts its disappearance. Existing string callers must retain
  identical DOM and late-ref behavior, and US-1074 must consume this helper without editing it.
- **Expanded is an intentional behavior change.** Neither current React provider reads
  `expanded`. The native implementation must remove header actions and Show Git Tree while
  collapsed and restore them on the next `expanded: true` update; it must keep body views mounted.
- **Native child ownership and update order.** `VanillaView` ownership does not mount or detach a
  child. Every provider-created child must be claimed once, mounted once, and disposed before its
  root is removed. `SubtreeSwap` owns its active branch itself; do not also call `this.child()` on
  that branch. `GitTreeView` rejects a changed model identity while mounted, so a model identity
  change must be treated as a retire/recreate case rather than silently updating the native grid.
- **React state residue.** `GitPanelSecondaryView`/`GitDiffRevisionsSecondaryView` use `useMemo`;
  `GitPanelSecondaryView` uses `useOptionalState`; `GitChangesView` uses `useState`, `useEffect`,
  and `useComponentModel`; `GitRefsView` uses `useMemo`, `useCallback`, and `useState`. All are
  absorbed by view fields, `bind()`, native child updates, and the `ResizeObserver` lifecycle.
  No hook should remain in the converted provider/body files.
- **Icon registry failures are visual regressions.** An unknown name causes a development warning
  and an empty SVG. Keep the verified registry-name list in Background and use
  `createIconElement(name, props)` where per-ref color/size is required. Do not pass JSX glyphs to
  `IconButtonView`, `TreeView`, or native menu items.
- **FileGrid and GitTree React faces remain by design.** `FileGrid.tsx` and `GitTree.tsx` are
  React adapters over already-native views and remain because other React callers survive. The
  converted providers must import `FileGridView`/`GitTreeView` directly so no compatibility root
  is introduced in these panels.
- **Scope boundary.** No changes are planned for `GitTreeEditorView.tsx`, the Git editor model,
  `FileDiffEditor.ts`, `GitTreeView.ts`, `FileGridView.ts`, the icon registry, the Tree widening
  owned by US-1071, the React header face, the secondary-view host/loader, `doc/active-work.md`, or
  `doc/epics/EPIC-063.md`. US-1073 is already listed by the epic; this task document must not add a
  dashboard entry.

## Acceptance Criteria

- `git-changes` and `git-diff-revisions` in
  `src/renderer/editors/register-editors.ts` retain their dynamic imports and both have
  `arm: "vanilla"`.
- `GitPanelSecondaryView.ts`, `GitChangesView.ts`, `GitRefsView.ts`, and
  `GitDiffRevisionsSecondaryView.ts` default/export public `VanillaView` classes as planned,
  contain no React hooks/JSX/`createPortal`, and create child DOM/listeners/subscriptions from
  `onMount()` rather than their constructors.
- The Git panel preserves its repo badge, `Git (N)` title and theme-token blue count, Refresh,
  Close, Show Git Tree, segment selection, sort toggle, changed-file union count, and all existing
  model callbacks. The File History panel preserves its title, Refresh, Git availability fallback,
  synthetic endpoint rows, and L/R revision selection behavior.
- Both providers route the latest `props.headerRef` and `props.iconElement` through
  `createSideBarPanelHeader()` on mount and every update. Header nodes follow a late `null` ref and
  a changed ref without caching or manual portal work.
- `expanded === false` removes the relevant header actions and Show Git Tree for both providers;
  the next update restores them, and neither body is disposed while collapsed. The current React
  omission of this gate is documented as an intentional behavior change. A collapsed Git strip
  visibly lacks Commit/Stage/Unstage and Show Git Tree, and expansion restores them.
- The Git changes body uses direct `FileGridView`, `SplitterView`, `ButtonView`,
  `IconButtonView`, and native menu/icon nodes; the refs body uses direct `TreeView<GitRefNode>`;
  File History uses direct `GitTreeView`. No `mountReact` compatibility island is introduced.
- All explicit glyphs use registry-covered names or verified DOM editor icon elements: `refresh`,
  `close`, `sort-alpha`, `filter-arrow-down`, `filter-arrow-up`, `delete`, `tag`, `git`, `globe`,
  `folder-open`, `chevron-right`, and `chevron-down`. Ref colors and the Git changed-count color
  use existing theme/palette tokens.
- `GitTree.tsx`, `GitStatusBadge.tsx`, and `RefBadge.tsx` retain their React-facing signatures;
  their surviving importer lists match the Background table. `GitTreeEditorView.tsx`,
  `CommitInfoPanel.tsx`, and `CommitDiffPanel.tsx` are unchanged.
- The US-1071 Tree slot widening is reused when available; no duplicate Tree-slot change and no
  `as unknown as` workaround is added by US-1073.
- `npm run typecheck`, `npm run lint`, `npm run build-prod`, the manual Git interaction checks,
  and the converted-panel `react-slot` inspection pass. This planning task implements no source
  behavior and creates no commit.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/register-editors.ts` | Add `arm: "vanilla"` to the `git-changes` and `git-diff-revisions` registrations. |
| `src/renderer/editors/git-tree/GitPanelSecondaryView.tsx` → `.ts` | Replace the React provider with a native `VanillaView` that owns the header, toolbar, and active body swap. |
| `src/renderer/editors/git-tree/GitChangesView.tsx` → `.ts` | Replace the React changes projection/hooks with a native body using `FileGridView` and native controls. |
| `src/renderer/editors/git-tree/GitRefsView.tsx` → `.ts` | Replace the React refs projection/hooks with a native body using `TreeView<GitRefNode>`. |
| `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.tsx` → `.ts` | Replace the React provider with a native `VanillaView` using direct `GitTreeView`. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` | US-1073-owned shared extension for direct-DOM badge and rich-title support; callers own badge lifetime, and US-1074 consumes it unchanged. |
| `src/renderer/components/git-tree/GitTree.tsx` | No change; React face remains for `RevisionPicker`, `GitTreeEditorView`, the story, and helper types. |
| `src/renderer/components/git-tree/GitStatusBadge.tsx` | No change; React `CommitDiffPanel` remains a consumer. |
| `src/renderer/components/git-tree/RefBadge.tsx` | No change; React `CommitInfoPanel` remains a consumer. |
| `src/renderer/components/git-tree/GitTreeView.ts` | No change; direct native consumer for File History already exists. |
| `src/renderer/components/file-grid/FileGrid.tsx` and `FileGridView.ts` | No change; the provider uses the existing native `FileGridView` while the React adapter remains for other callers. |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx`, `CommitInfoPanel.tsx`, `CommitDiffPanel.tsx` | No change; Rule 1/Rule 2 surviving React boundaries. |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts`, `src/renderer/editors/file-diff/FileDiffEditor.ts` | No change; existing model state, callbacks, and DOM icon arms are reused. |
| `src/renderer/uikit/Tree/**` | No change in US-1073; consume the Node slot widening from US-1071 at implementation time. |
| `src/renderer/theme/icon-registry.ts`, `src/renderer/theme/color.ts`, `src/renderer/theme/themes/**` | No change; verified registry entries and existing theme tokens are reused. |
| `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx`, `SecondaryViewsView.ts`, `LazySecondaryViewView.ts` | No change; React header face and host/loader remain. |
| `doc/active-work.md`, `doc/epics/EPIC-063.md` | No change; the epic already lists US-1073 and the user explicitly excluded a dashboard entry. |
