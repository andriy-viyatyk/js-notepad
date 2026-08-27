# US-1138 — collect the dead shell faces and barrels

**Epic:** [EPIC-070](../../epics/EPIC-070.md) (De-React E12)
**Status:** Implemented; validation complete
**Scope audited:** current `src/renderer` working tree on 2026-08-27

## Goal

Remove the shell’s callerless React faces and dead barrels, while preserving every live native view,
editor-owned React island, type, model, and plain function. The audit also records the split cases
where a `.tsx` face file contains symbols still required by native views or editors.

## Background

EPIC-070’s closing property is that outside `editors/`, React elements exist only because an
unconverted editor needs them. A `mountVanilla` face can become dead silently when its last caller is
converted or deleted; no typecheck, lint, or build gate detects that. This task closes that gap for
the remaining shell and component surfaces.

The audit used the actual source files in the current tree, excluding story files and these owned
areas: `src/renderer/components/icons/`, `src/renderer/components/page-manager/`,
`src/renderer/theme/`, and `src/renderer/uikit/`. `src/renderer/index.tsx` is also explicitly out of
scope. Export declarations were read from every eligible `.tsx`; each symbol was then searched with
`rg` across `src`, excluding its defining file and story files. A barrel re-export is not treated as
a caller by itself. A symbol consumed through a live barrel is counted at the consuming module; a
dead-barrel-only edge is excluded from the effective count.

The worktree contains concurrent US-1134 and US-1136 changes. In particular, the five `ui/app`
faces and `components/icons/FileIcon.tsx` are already deleted, and US-1136 has already removed the
`FileIcon` line from `ui/sidebar/index.ts`. This task must not edit those owned files or undo those
changes. If implementation starts from a tree where the US-1136 sidebar edit has not landed, the
barrel deletion must wait for that edit rather than touching `components/icons/`.

### Verified sidebar finding

Against `HEAD`, `src/renderer/ui/sidebar/index.ts` has zero importers anywhere in `src/` and
re-exports these five entries:

```ts
export { MenuBar } from './MenuBar';
export { FolderItem, FolderItemProps } from './FolderItem';
export { FileIcon, FolderIcon } from '../../components/icons/FileIcon';
export { OpenTabsList } from './OpenTabsList';
export { RecentFileList } from './RecentFileList';
```

The current worktree has only the first, second, fourth, and fifth lines because concurrent US-1136
already removed the `FileIcon` re-export. The six callerless wrapper faces are still present:

| Face | Exported symbols | Effective external callers | Source evidence |
|---|---|---:|---|
| `src/renderer/ui/sidebar/FolderItem.tsx` | `FolderItem` 0; `FolderItemProps` 0 | 0 | `MenuBarView.ts` constructs `FolderItemView` directly; only the dead barrel points at this face |
| `src/renderer/ui/sidebar/MenuBar.tsx` | `MenuBar` 0; `MenuBarProps` 0 | 0 | `MainPageView.ts:65` constructs `MenuBarView` directly; only the dead barrel points at this face |
| `src/renderer/ui/sidebar/OpenTabsList.tsx` | `OpenTabsList` 0; `OpenTabsListProps` 0 | 0 | `MenuBarView.ts:491` constructs `OpenTabsListView` directly; only the dead barrel points at this face |
| `src/renderer/ui/sidebar/RecentFileList.tsx` | `RecentFileList` 0; `RecentFileListProps` 0 | 0 | `MenuBarView.ts:492` constructs `RecentFileListView` directly; only the dead barrel points at this face |
| `src/renderer/ui/sidebar/ScriptLibraryPanel.tsx` | `ScriptLibraryPanel` 0; `ScriptLibraryPanelProps` 0 | 0 | `MenuBarView.ts:497` constructs `ScriptLibraryPanelView` directly; only the dead barrel points at this face |
| `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` | `ToolsEditorsPanel` 0; `ToolsEditorsPanelProps` 0 | 0 | `MenuBarView.ts:496` constructs `ToolsEditorsPanelView` directly; only the dead barrel points at this face |

The four faces below each have exactly one external importer, the still-React `Component` arm of
`src/renderer/editors/tools-hub/ToolsHubView.tsx`. They stay. This is EPIC-070’s closing property
working correctly: the React face is justified by an unconverted editor, not forgotten by the
sweep.

| Face | Face importer | Live view behind it |
|---|---|---|
| `src/renderer/ui/sidebar/BuiltinEditorsList.tsx` | `ToolsHubView.tsx:3` | `BuiltinEditorsListView.ts` |
| `src/renderer/ui/sidebar/PinnedRail.tsx` | `ToolsHubView.tsx:2` | `PinnedRailView.ts` |
| `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | `ToolsHubView.tsx:4` | `TrustedBoardsListView.tsx` |
| `src/renderer/ui/sidebar/TrustedToolsList.tsx` | `ToolsHubView.tsx:5` | `TrustedToolsListView.tsx` |

`TrustedBoardsListView.tsx` and `TrustedToolsListView.tsx` are themselves live native-owning views.
`ToolsEditorsPanelView.ts` constructs both directly, and the retained wrappers also import them; the
view files are not dead faces.

## Investigation findings and verdicts

The following table is the complete set of 27 current non-story `.tsx` files in the requested
directories after the owned exclusions. Counts are importer-file counts, not occurrence counts.
Paths in parentheses are the actual consuming files found by the searches. A symbol listed with
zero effective callers is not necessarily removable when another symbol in the same file is live;
those files receive `split` or `keep` accordingly.

| File | Exported symbols and effective importer counts | Logic classification | Verdict |
|---|---|---|---|
| `src/renderer/components/file-grid/FileGrid.tsx` | `FileGrid` 0; `FileGridItem` 2 (`FileGridView.ts`, `editors/git-tree/GitChangesView.ts`); `FileGridProps` 2 (same) | React face plus live type declarations | **split** |
| `src/renderer/components/file-list/FileList.tsx` | `FileList` 0; `FileListItem` 3 (`FileListView.ts`, `ui/sidebar/RecentFileListView.ts`, `editors/git-tree/CommitDiffPanel.ts`); `FileListProps` 3 (same); `defaultFileListState` 1 (`FileListView.ts`); `FileListModel` 3 (`FileListView.ts`, `ui/sidebar/MenuBarView.ts`, `ui/sidebar/RecentFileListView.ts`) | React face plus live state/model/type logic | **split** |
| `src/renderer/components/file-search/FileSearch.tsx` | `FileSearch` 0; `FileSearchProps` 1 (`FileSearchView.ts`); `FileSearchState` 1 (`editors/explorer/ExplorerEditorModel.ts`, through live `file-search/index.ts`) | React face plus live props/state type surface | **split** |
| `src/renderer/components/git-tree/GitStatusBadge.tsx` | `GitStatusBadge` 0 | Real JSX badge logic, but no production caller; only `git-tree/index.ts` re-exports it | **delete** |
| `src/renderer/components/git-tree/GitTree.tsx` | `GitTree` 1 (`editors/file-diff/RevisionPicker.tsx`); `GitTreeProps` 2 (`GitTreeView.ts`, `editors/file-diff/GitDiffRevisionsSecondaryView.ts`); `GitTreeSideSelect` 2 (same); `GitColumnLayout` 2 (`GitTreeView.ts`, `editors/git-tree/GitTreeEditorModel.ts`, through live barrel) | Live React face required by the file-diff editor, plus native-view types | **keep — editor React caller** |
| `src/renderer/components/git-tree/RefBadge.tsx` | `RefBadge` 0 | Real JSX badge logic, but no production caller; only `git-tree/index.ts` re-exports it | **delete** |
| `src/renderer/components/tree-provider/CategoryView.tsx` | `CategoryView` 0; `CategoryViewProps` 1 (`editors/category/CategoryEditor.ts`, through live barrel); `CategoryViewMode` 2 (`CategoryEditor.ts`, `FolderViewModeService.ts`, through live barrel); `CategoryItemsRendererProps` 1 (`CategoryEditor.ts`, through live barrel) | React face; all surviving types are already defined by live `CategoryViewModel.ts` / `CategoryViewImpl.ts` | **split** |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | `TreeProviderView` 0; `TreeProviderViewProps` 0; `TreeProviderViewSavedState` 2 (`editors/explorer/ExplorerEditorModel.ts`, `editors/mneme-root/MnemeRootEditorModel.ts`, through live barrel) | React face; saved-state type is live and already defined by `TreeProviderViewModel.ts` | **split** |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | `EditorErrorBoundary` 9 (`AsyncEditorView.ts`, and the eight editor modules `draw`, `env-vars`, `file-diff`, `graph`, `link-editor`, `monaco`, `rest-client`, `storybook`) | Real React error boundary | **keep — required by `AsyncEditorView` and editor Component arms** |
| `src/renderer/ui/dialogs/Dialogs.tsx` | `Dialogs` 0; `showDialog` 14 (13 dialog modules plus `editors/link-editor/EditLinkDialog.ts`); `closeDialog` 0; `dialogsState` 0 | Dead React face over live functions defined in `DialogsView.ts` | **split** |
| `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` | `showGridContextMenu` 3 (`FileGridView.ts`, `GitTreeView.ts`, `editors/grid/GridBodyView.ts`) | Non-face application adapter with recursive menu/icon logic | **keep — live native grid path** |
| `src/renderer/ui/dialogs/poppers/Poppers.tsx` | `Poppers` 0; `showPopper` 4 (`editors/browser/BrowserDownloadsPopup.ts`, `editors/grid/components/CsvOptions.ts`, `ColumnsOptions.ts`, `poppers/showPopupMenu.ts`); `closePopper` 2 (`BrowserDownloadsPopup.ts`, `showPopupMenu.ts`); `visiblePoppers` 2 (`BrowserDownloadsPopup.ts`, `ColumnsOptions.ts`); `IPopperViewData` 0 | Dead React face over live functions in `PoppersView.ts` and a live type in `types.ts` | **split** |
| `src/renderer/ui/secondary-views/SecondaryViews.tsx` | `SecondaryViews` 1 (`editors/browser/BrowserSecondaryViews.tsx`); `SecondaryViewsProps` 0 | React face required by the browser editor’s React surface; native `SecondaryViewsView` is also live elsewhere | **keep — editor React caller** |
| `src/renderer/ui/sidebar/BuiltinEditorsList.tsx` | `BuiltinEditorsList` 1 (`editors/tools-hub/ToolsHubView.tsx`); `BuiltinEditorsListProps` 0 | `mountVanilla` face over live view | **keep — editor React caller** |
| `src/renderer/ui/sidebar/FolderItem.tsx` | `FolderItem` 0; `FolderItemProps` 0 | `mountVanilla` face over live native view | **delete** |
| `src/renderer/ui/sidebar/MenuBar.tsx` | `MenuBar` 0; `MenuBarProps` 0 | `mountVanilla` face over live native view | **delete** |
| `src/renderer/ui/sidebar/OpenTabsList.tsx` | `OpenTabsList` 0; `OpenTabsListProps` 0 | `mountVanilla` face over live native view | **delete** |
| `src/renderer/ui/sidebar/PinnedRail.tsx` | `PinnedRail` 1 (`editors/tools-hub/ToolsHubView.tsx`); `PinnedRailProps` 0 | `mountVanilla` face over live view | **keep — editor React caller** |
| `src/renderer/ui/sidebar/RecentFileList.tsx` | `RecentFileList` 0; `RecentFileListProps` 0 | `mountVanilla` face over live native view | **delete** |
| `src/renderer/ui/sidebar/ScriptLibraryPanel.tsx` | `ScriptLibraryPanel` 0; `ScriptLibraryPanelProps` 0 | `mountVanilla` face over live native view | **delete** |
| `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` | `ToolsEditorsPanel` 0; `ToolsEditorsPanelProps` 0 | `mountVanilla` face over live native view | **delete** |
| `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | `TrustedBoardsList` 1 (`editors/tools-hub/ToolsHubView.tsx`); `TrustedBoardsListProps` 0 | `mountVanilla` face over live React subtree/view | **keep — editor React caller** |
| `src/renderer/ui/sidebar/TrustedBoardsListView.tsx` | `TrustedBoardsListProps` 1 (`TrustedBoardsList.tsx`); `TrustedBoardsListView` 2 (`TrustedBoardsList.tsx`, `ToolsEditorsPanelView.ts`) | Real React slot owner and `VanillaView` with board-trust logic | **keep — live view** |
| `src/renderer/ui/sidebar/TrustedToolsList.tsx` | `TrustedToolsList` 1 (`editors/tools-hub/ToolsHubView.tsx`); `TrustedToolsListProps` 0 | `mountVanilla` face over live React subtree/view | **keep — editor React caller** |
| `src/renderer/ui/sidebar/TrustedToolsListView.tsx` | `TrustedToolsListProps` 1 (`TrustedToolsList.tsx`); `TrustedToolsListView` 2 (`TrustedToolsList.tsx`, `ToolsEditorsPanelView.ts`) | Real React slot owner and `VanillaView` with tool-trust logic | **keep — live view** |
| `src/renderer/ui/tabs/PageTab.tsx` | `PageTab` 0; `PageTabProps` 1 (`PageTabView.ts`); `minTabWidth` 1 (`PageTabsView.ts`); `pinnedTabWidth` 1 (`PageTabsView.ts`); `pinnedTabEncryptedWidth` 1 (`PageTabsView.ts`) | Dead React face plus live tab type/constants | **split** |
| `src/renderer/ui/tabs/PageTabs.tsx` | `PageTabs` 0 | `mountVanilla` face over live `PageTabsView` | **delete** |

The counts above catch the important sibling-view case: a face may be uncalled while its props,
model, constants, or re-exported state are consumed by a native view. No file is classified as
delete merely because its component function is uncalled.

### Dead barrels

The `index.ts` sweep found eight barrels. Four have zero importers and are dead; four remain live:

| Barrel | Importer-file count | Verdict and reason |
|---|---:|---|
| `src/renderer/components/file-grid/index.ts` | 0 | **delete**; all face/type exports are reachable only from the dead barrel or direct sibling/editor type imports |
| `src/renderer/components/file-list/index.ts` | 0 | **delete**; all live consumers import `FileList.tsx` directly |
| `src/renderer/components/file-search/index.ts` | 1 (`editors/explorer/ExplorerEditorModel.ts`) | keep; its `FileSearchState` type is live |
| `src/renderer/components/git-tree/index.ts` | 3 (`editors/git-tree/GitTreeEditorModel.ts`, `GitRefsView.ts`, `editors/file-diff/FileDiffEditor.ts`) | keep; it carries live models, tree helpers, and types; remove only the two dead badge exports |
| `src/renderer/components/tree-provider/index.ts` | 3 (`editors/explorer/ExplorerEditorModel.ts`, `editors/category/FolderViewModeService.ts`, `editors/mneme-root/MnemeRootEditorModel.ts`) | keep; it carries live saved-state/mode types and `supportsMultiSelect` |
| `src/renderer/ui/dialogs/index.ts` | 2 (`components/tree-provider/CategoryViewImpl.ts`, `editors/link-editor/index.ts`) | keep; `showAppPopupMenu` and other non-React dialog exports remain live |
| `src/renderer/ui/sidebar/index.ts` | 0 | **delete**; all current exports are callerless faces, with the historical `FileIcon` line already owned by US-1136 |
| `src/renderer/ui/tabs/index.ts` | 0 | **delete**; `PageTabs` is dead and `PageTab` constants/types are consumed through direct view imports |

## Implementation Plan

### 1. Re-run the symbol searches immediately before each removal

- Re-run the face and symbol searches listed in the findings table across `src`, excluding the face
  itself and story files.
- Verify the six sidebar faces and both git-tree badges still have all listed effective callers at
  zero. For the four kept sidebar faces, verify the sole caller is still the exact import in
  `src/renderer/editors/tools-hub/ToolsHubView.tsx`.
- Re-run the four dead-barrel path searches and record zero importers before removing each barrel.
- Treat a newly appearing importer as a stop condition; do not delete based on the previous table.

### 2. Split files that contain live non-React symbols

Preserve existing module paths where possible so no editor file needs changing:

- Replace `src/renderer/components/file-grid/FileGrid.tsx` with a `.ts` type module containing only
  `FileGridItem` and `FileGridProps`. Remove the `FileGrid` function, React type import, and
  `mountVanilla` import. `FileGridView.ts` and `editors/git-tree/GitChangesView.ts` keep their
  existing `./FileGrid` / `../../components/file-grid/FileGrid` imports.
- Replace `src/renderer/components/file-list/FileList.tsx` with a `.ts` core module retaining
  `FileListItem`, `FileListProps`, `defaultFileListState`, and `FileListModel`, including every
  model method (`setSearchText`, `setSearchVisible`, `setActiveIndex`, `showSearch`,
  `hideSearch`, `hideSearchAndFocus`, `setViewFocusHandlers`, and `clearViewFocusHandlers`). Remove
  only the `FileList` React function and its mount imports. Preserve the current
  `getTrailing` type exactly; US-1140 owns any later slot-type widening.
- Replace `src/renderer/components/file-search/FileSearch.tsx` with a `.ts` type module retaining
  `FileSearchProps` and its `FileSearchState` re-export. Remove only the `FileSearch` function and
  React/mount imports. Keep `file-search/index.ts` live, but export only the type surface it still
  provides.
- Replace `src/renderer/components/tree-provider/CategoryView.tsx` with a type-only `.ts` module,
  or move its type re-exports directly to `CategoryViewModel.ts`/the live barrel. Remove the
  `CategoryView` mount function and remove only the dead component export from
  `tree-provider/index.ts`; `CategoryViewImpl.ts` and the category editor continue to use the
  existing native model/view types.
- Replace `src/renderer/components/tree-provider/TreeProviderView.tsx` with a type-only `.ts`
  module retaining `TreeProviderViewProps` and `TreeProviderViewSavedState`. Remove the React face
  and component export, while preserving the live saved-state re-export from
  `TreeProviderViewModel.ts` through `tree-provider/index.ts`.
- Replace `src/renderer/ui/dialogs/Dialogs.tsx` with a non-React `Dialogs.ts` re-export of
  `showDialog`, `closeDialog`, and `dialogsState` from `DialogsView.ts`. Keep the path
  `./Dialogs` stable for the 14 measured `showDialog` consumers, including the editor
  `EditLinkDialog.ts`; do not touch editor files.
- Replace `src/renderer/ui/dialogs/poppers/Poppers.tsx` with a non-React `Poppers.ts` re-export of
  `showPopper`, `closePopper`, `visiblePoppers` from `PoppersView.ts` and `IPopperViewData` from
  `types.ts`. Keep the existing `./Poppers` path stable for all four function-consumer files.
- Replace `src/renderer/ui/tabs/PageTab.tsx` with a `.ts` core module retaining
  `PageTabProps`, `minTabWidth`, `pinnedTabWidth`, and `pinnedTabEncryptedWidth`. Remove only the
  React face and mount imports; `PageTabView.ts` and `PageTabsView.ts` continue using the same
  relative module path.

Before → after for a representative face/core split:

```ts
// Before: FileList.tsx
export interface FileListProps { /* live native-view contract */ }
export class FileListModel extends TComponentModel<...> { /* live model */ }
export function FileList(props: FileListProps): React.ReactElement {
    return mountVanilla(FileListView, props);
}

// After: FileList.ts
export interface FileListProps { /* unchanged */ }
export class FileListModel extends TComponentModel<...> { /* unchanged */ }
// No React face; FileListView remains the direct native entry point.
```

```ts
// Before: Dialogs.tsx
export { closeDialog, dialogsState, showDialog } from "./DialogsView";
export function Dialogs(): React.ReactElement {
    return mountVanilla(DialogsView, undefined);
}

// After: Dialogs.ts
export { closeDialog, dialogsState, showDialog } from "./DialogsView";
// DialogsView is mounted directly by src/renderer/index.tsx.
```

### 3. Remove the nine dead face files and their barrel edges

- Delete `src/renderer/components/git-tree/GitStatusBadge.tsx` and `RefBadge.tsx`; remove only their
  two export lines from `src/renderer/components/git-tree/index.ts`.
- Delete the six verified callerless sidebar faces:
  `FolderItem.tsx`, `MenuBar.tsx`, `OpenTabsList.tsx`, `RecentFileList.tsx`,
  `ScriptLibraryPanel.tsx`, and `ToolsEditorsPanel.tsx` under `src/renderer/ui/sidebar/`.
- Delete `src/renderer/ui/tabs/PageTabs.tsx` after verifying its zero callers.
- Delete the four dead barrels:
  `src/renderer/components/file-grid/index.ts`,
  `src/renderer/components/file-list/index.ts`,
  `src/renderer/ui/sidebar/index.ts`, and
  `src/renderer/ui/tabs/index.ts`.
- Do not delete the live native view files behind the faces. In particular, retain
  `MenuBarView.ts`, `OpenTabsListView.ts`, `RecentFileListView.ts`, `ScriptLibraryPanelView.ts`,
  `ToolsEditorsPanelView.ts`, `PageTabsView.ts`, `FileGridView.ts`, and `FileListView.ts`.
- Do not touch `src/renderer/components/icons/`, `src/renderer/components/page-manager/`,
  `src/renderer/theme/`, `src/renderer/uikit/`, any editor, or `src/renderer/index.tsx`.

### 4. Preserve the live barrels and editor-owned React boundary

- Keep `file-search/index.ts`, `git-tree/index.ts`, `tree-provider/index.ts`, and
  `ui/dialogs/index.ts` because their measured consumers use live types, models, actions, or popup
  functions. Remove or redirect only the dead React exports.
- Keep `GitTree.tsx` because `editors/file-diff/RevisionPicker.tsx` renders `<GitTree>`; do not
  replace that editor-owned React usage with a native conversion.
- Keep `SecondaryViews.tsx` because `editors/browser/BrowserSecondaryViews.tsx` renders it.
- Keep all four ToolsHub faces and both trusted `*ListView.tsx` files because the Tools Hub remains
  a `Component`-arm editor and the view files contain live trusted-board/tool behavior.
- Keep `EditorErrorBoundary.tsx` because `AsyncEditorView.ts` and multiple editor Component arms
  require it.

## Concerns / Decisions

1. **Concurrent US-1136 ownership — resolved.** No file under `src/renderer/components/icons/` or
   `src/renderer/theme/` is part of this task. The current sidebar barrel already lacks the
   `FileIcon` line. If that concurrent change is absent when implementation begins, stop before
   deleting the barrel and let US-1136 remove the owned re-export first.

2. **Deletion-only scope — resolved.** This task does not convert a view, change editor behavior, or
   widen `ReactNode` to `SlotContent`. The split operations remove only React adapters while moving
   or retaining declarations already consumed by native views. `FileListProps.getTrailing` remains
   exactly as found; US-1140 owns its contract change.

3. **Live barrel versus live symbol — resolved.** A live barrel does not make every export live.
   `GitStatusBadge` and `RefBadge` have zero component consumers even though `git-tree/index.ts`
   itself is live. Conversely, `FileSearchState` and `TreeProviderViewSavedState` remain live
   because actual editor models consume them through live barrels.

4. **Stories — resolved.** Story files are excluded from caller counts and do not justify production
   faces. No story is changed or added. The production `editors/storybook/LivePreview.ts` import of
   `EditorErrorBoundary` is not a `.story.*` file and is counted as a real source consumer.

5. **Same-path `.ts` replacements — resolved.** Replacing a face `.tsx` with a same-basename `.ts`
   core module preserves existing import specifiers and avoids touching editor consumers. Verify
   the TypeScript/Vite resolver sees the new extension and that no stale `.tsx` path remains before
   deleting the old face.

6. **The two git badges look intentionally shared but are not live.** `GitTree.css` comments name
   `RefBadge`, but the actual source search found no production import; `CommitInfoPanel.ts` uses
   `REF_COLOR` and its own native markup. The zero-symbol verification is required immediately
   before deleting either badge file.

7. **No constructor/lifecycle risk is introduced.** This task does not create a new
   `VanillaView`, alter `mountVanilla`, or change a view’s `mount`/`dispose` behavior. Existing live
   native views stay in their current files and are not refactored.

## Acceptance Criteria

- [x] The task document records the actual source audit, every eligible file’s exported symbols,
  effective importer counts, logic classification, and a per-file delete/keep/split verdict.
- [x] Immediately before implementation deletion, searches reconfirm zero effective callers for
  all nine delete files and zero importers for all four dead barrels.
- [x] The six measured callerless sidebar faces are deleted, while the four ToolsHub faces remain
  with the note that their one editor caller is intentional.
- [x] `GitStatusBadge.tsx`, `RefBadge.tsx`, and `PageTabs.tsx` are deleted only after their
  individual exports are rechecked; the live `GitTree.tsx` and `SecondaryViews.tsx` faces remain.
- [x] The eight split verdicts preserve all live types, constants, models, and plain functions with
  no editor behavior change and no React face remaining in the replacement core module.
- [x] Exactly four dead barrels are deleted: `components/file-grid/index.ts`,
  `components/file-list/index.ts`, `ui/sidebar/index.ts`, and `ui/tabs/index.ts`. The four live
  barrels remain usable for their measured consumers.
- [x] No file under `src/renderer/components/icons/`, `components/page-manager/`, `theme/`, or
  `uikit/` is changed; no editor or `src/renderer/index.tsx` is changed.
- [x] No unit tests or test harnesses are added, no dashboard entry is added or changed, and no
  commit is created.
- [x] After implementation, `tsc --noEmit`, `npm run lint`, and `npm run build-prod` pass.

## Files Changed Summary

| File or group | Planned change |
|---|---|
| `src/renderer/components/file-grid/FileGrid.tsx` | Replace with a type-only `.ts` core module; remove the dead `FileGrid` face. |
| `src/renderer/components/file-list/FileList.tsx` | Replace with a non-React `.ts` core module retaining types, default state, and `FileListModel`; remove the dead face. |
| `src/renderer/components/file-search/FileSearch.tsx` | Replace with a type-only `.ts` module; retain `FileSearchProps`/`FileSearchState`, remove the dead face. |
| `src/renderer/components/tree-provider/CategoryView.tsx` | Replace with a type-only module or move its existing type re-exports to the live model/barrel; remove the dead face export. |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | Replace with a type-only `.ts` module; retain live props/saved-state exports, remove the dead face. |
| `src/renderer/components/git-tree/GitStatusBadge.tsx`, `RefBadge.tsx` | Delete after symbol-level zero-caller checks; remove their `git-tree/index.ts` exports. |
| `src/renderer/ui/dialogs/Dialogs.tsx` | Replace with non-React `Dialogs.ts` re-exports; preserve all existing `./Dialogs` callers. |
| `src/renderer/ui/dialogs/poppers/Poppers.tsx` | Replace with non-React `Poppers.ts` re-exports; preserve all existing `./Poppers` callers. |
| `src/renderer/ui/sidebar/{FolderItem,MenuBar,OpenTabsList,RecentFileList,ScriptLibraryPanel,ToolsEditorsPanel}.tsx` | Delete six callerless `mountVanilla` faces. |
| `src/renderer/ui/sidebar/index.ts` | Delete the zero-importer barrel after confirming the concurrent US-1136 `FileIcon` removal state. |
| `src/renderer/ui/tabs/PageTab.tsx` | Replace with a `.ts` core module retaining tab props/constants; remove the dead face. |
| `src/renderer/ui/tabs/PageTabs.tsx` | Delete the zero-caller face. |
| `src/renderer/ui/tabs/index.ts` | Delete the zero-importer barrel. |
| `src/renderer/components/file-grid/index.ts`, `src/renderer/components/file-list/index.ts` | Delete the two zero-importer barrels. |
| `src/renderer/components/file-search/index.ts`, `src/renderer/components/git-tree/index.ts`, `src/renderer/components/tree-provider/index.ts`, `src/renderer/ui/dialogs/index.ts` | No deletion; retain live exports and remove only dead face exports where applicable. |
| `src/renderer/components/file-grid/FileGridView.ts`, `FileListView.ts`, `src/renderer/components/file-search/FileSearchView.ts`, `src/renderer/components/tree-provider/CategoryViewImpl.ts`, `TreeProviderViewImpl.ts` | No behavior change; retain direct native consumers. |
| `src/renderer/ui/sidebar/*View.ts`, `src/renderer/ui/tabs/PageTabView.ts`, `PageTabsView.ts`, `src/renderer/ui/secondary-views/SecondaryViews.tsx`, `src/renderer/ui/app/EditorErrorBoundary.tsx`, `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` | No change; live views, the intentional editor boundary, or real application logic. |
| `src/renderer/components/icons/`, `src/renderer/components/page-manager/`, `src/renderer/theme/`, `src/renderer/uikit/`, `src/renderer/editors/`, `src/renderer/index.tsx` | **No changes.** Explicitly owned or excluded by this task. |
| `doc/active-work.md`, `doc/epics/EPIC-070.md` | **No changes.** The user explicitly prohibits a dashboard entry; the epic remains authoritative. |
