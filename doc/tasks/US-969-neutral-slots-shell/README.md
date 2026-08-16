# US-969: Neutral slots - `ui/` and `components/`

## Status

**Status:** Implemented — pending epic review
**Priority:** High
**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Depends on:** [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md), [US-966: Neutral slots - UIKit primitives and inputs](../US-966-neutral-slots-primitives/README.md), [US-967: Neutral slots - UIKit list and data components](../US-967-neutral-slots-list-data/README.md), [US-968: Neutral slots - UIKit containers and floating layer](../US-968-neutral-slots-containers-floating/README.md)
**Created:** 2026-08-16

## Goal

Apply the Epic P slot vocabulary to the application shell and Persephone-coupled components in
`src/renderer/ui/` and `src/renderer/components/`. Convert genuine icon and text data to
`IconRef`, `IconName`, `string`, or `SlotText`, while recording the deliberate React boundaries
that belong to children, arbitrary subtrees, dynamic resolvers, and editor-owned callbacks.

## Background

US-965 introduced `IconRef = IconName | ReactNode`, `SlotText = string | ReactNode`, and
`renderIcon(icon, props?)`. Strings in icon slots always resolve as registry names. US-966 through
US-968 applied those rules to UIKit primitives, list/data components, and containers. US-969 is the
last slot task in the leaf-first chain and covers the 15 files outside `editors/` that still declare
React-bearing shell data or props.

### Measured inventory

| File / surface | Current React-bearing field | Planned treatment | Evidence / boundary |
|---|---|---|---|
| `ui/app/EditorErrorBoundary.tsx` | `children` | Keep `ReactNode` | Arbitrary child subtree; D4 / Epic C boundary |
| `ui/secondary-views/LazySecondaryView.tsx` | `icon` | `IconRef` | Host forwards a resolved icon to a lazy panel |
| `ui/secondary-views/secondary-view-registry.ts` | definition/props `icon` | `IconRef` | Registry data can use names; editor fallback remains a node |
| `ui/secondary-views/SideBarPanelHeader.tsx` | `icon`, `title`, `badge`, `actions` | `IconRef`, `SlotText`, keep subtree fields | One rich title caller; badge/actions are composition |
| `ui/sidebar/FolderItem.tsx` | `icon`, `label`, `tooltip` | `IconRef`, `string`, `string` | MenuBar supplies string labels/tooltips |
| `ui/sidebar/tools-editors-registry.ts` | `CreatableItem.icon` | `IconRef` | Registry includes custom language/resolver nodes |
| `components/file-grid/FileGrid.tsx` | `getTrailing` return | Keep React callback | Status badges are arbitrary cell subtrees |
| `components/file-list/FileList.tsx` | item `icon`, `getTrailing` return | `IconRef`; keep React callback | Explicit icons may be resolver nodes; trailing is composition |
| `components/git-tree/git-refs-tree.ts` | `label`, `icon` | `SlotText`, `IconRef` | Git view decorates current label and icons with styled nodes |
| `components/icons/EditorIcon.tsx` | `EditorIconSource.getIcon` return | `IconRef` | Custom editor icons remain accepted; language resolver stays excluded |
| `components/page-manager/PageManager.tsx` | `renderPage` return | Keep React callback | Each result is a full portal subtree |
| `components/page-manager/AppPageManager.tsx` | `renderPage` return/internal portals | Keep React callback/internal React | Stable page portals are the React boundary |
| `components/tree-provider/CategoryView.tsx` | view-mode icon data | `IconName` plus `renderIcon` | All five names exist in the registry |
| `components/tree-provider/CategoryViewModel.ts` | `renderItems` return | Keep React callback | Editor supplies the complete list/grid subtree |
| `components/tree-provider/TreeProviderViewModel.ts` | `getLabel`, `renderTrailing` returns | `SlotText`; keep React callback | One rich label override; trailing actions are subtrees |

Additional measurements:

- `SideBarPanelHeader` has 14 production callers: 13 string titles and one rich title in
  `editors/explorer/SearchSecondaryView.tsx`.
- `TreeProviderViewModel.getLabel` has one production override in
  `editors/link-editor/panels/LinkCategoryPanel.tsx`; it returns styled text. Its three
  `renderTrailing` consumers return action/button subtrees.
- `CategoryViewProps.renderItems` has one production consumer, `editors/category/CategoryEditor.tsx`,
  and returns the complete editor-owned item surface.
- `PageManager.renderPage` has one browser caller; `AppPageManager.renderPage` has one app-shell
  caller. Both return page subtrees, not text or icons.
- Secondary-view registry overrides currently use `SearchIcon` and `BoardColorIcon`; both have
  registry names (`"search"` and `"board-color"`). The fallback `EditorIcon` intentionally remains
  a resolver because it may use `language-icons.tsx` or an editor-supplied custom node.

## Implementation plan

### 1. Normalize secondary-view shell contracts

- In `ui/secondary-views/secondary-view-registry.ts`, change secondary-view `icon` fields to
  `IconRef`. Keep `loadComponent` and `ComponentType` as React loading infrastructure; converting
  that loader would require the mount-adapter contract from Epic C.
- In `LazySecondaryView.tsx`, accept and forward `IconRef` without changing lazy loading,
  cancellation, error display, or the `SecondaryViewProps` component boundary.
- In `SideBarPanelHeader.tsx`, use `IconRef` for `icon` and `SlotText` for `title`. Resolve the
  icon with `renderIcon(icon)` so named icons remain direct SVG children of the portal header.
  Preserve `badge` and `actions` as arbitrary React subtrees, title truncation, the portal target,
  and all CSS/data hooks. Convert the owned show-main chevron through
  `renderIcon("chevron-right")`.
- In `editors/register-editors.ts`, replace the two registry override elements with
  `icon: "search"` and `icon: "board-color"`. Do not convert editor-owned `EditorIcon` or
  language-icon implementations.
- Verify `SecondaryViews.tsx` still prefers a registry override and otherwise uses the `EditorIcon`
  fallback, with the resulting SVG as an unwrapped direct child of the panel header.

### 2. Normalize sidebar folder and tool data

- In `FolderItem.tsx`, type `icon` as `IconRef`, `label` as `string`, and `tooltip` as
  `string | undefined`. Render the leading icon through `renderIcon` and preserve selection,
  drag/drop, tooltip, and text truncation behavior. Resolve the selected-row arrow with
  `renderIcon("arrow-right", { className: "selected-icon" })` so its class and sizing survive.
- In `theme/icons.tsx`, add `TabsIcon` and `HistoryIcon` beside the other window icons using
  `createIcon(24)`. Use the supplied even-odd paths and `fill="currentColor"` only so the glyphs
  inherit sidebar icon and selection colors.
- In `theme/icon-registry.ts`, import and register them as `"tabs": TabsIcon` and
  `"history": HistoryIcon`; `IconName` remains derived from the registry record.
- In `MenuBar.tsx`, make `getFolderIcon` return `"tabs"`, `"history"`, and `"tools"` for Open
  Tabs, Recent Files, and Tools & Editors. Keep `script-library`, `folder-open`, and `empty` as
  existing resolver nodes for now, with optional name migration remaining a free follow-up.
- In `tools-editors-registry.ts`, type `CreatableItem.icon` as `IconRef`. Preserve all existing
  language/resolver and explicitly colored icon nodes; `language-icons.tsx` is excluded and is not
  rewritten.
- In `BuiltinEditorsList.tsx` and `PinnedRail.tsx`, render `item.icon` through `renderIcon` before
  placing it in the icon wrapper. Migrate owned pin icons to registry names where these components
  directly supply an `IconButton` icon. Preserve pinned ordering, drag behavior, and custom colors.

### 3. Normalize file-list data while retaining trailing subtrees

- In `FileList.tsx`, change `FileListItem.icon` to `IconRef` and resolve it at the trait boundary
  before passing it to UIKit `ListBox`. Leave `getTrailing` as a React callback because git status
  badges are arbitrary subtrees. Convert the owned search-clear `IconButton` to `icon="close"`.
- In `FileGrid.tsx`, leave `getTrailing` as a React callback returning a cell subtree. Its
  `FileIcon`/`FolderIcon` formatter uses prop-taking resolver components excluded from the registry.
  Preserve AVGrid formatters, sorting, selection, and status-cell behavior.
- Verify `RecentFileList`, `CommitDiffPanel`, and `GitChangesView` compile without changing their
  editor-owned trailing callbacks.

### 4. Normalize Git ref data without flattening styled presentation

- In `components/git-tree/git-refs-tree.ts`, use `SlotText` for `GitRefNode.label` and `IconRef`
  for `GitRefNode.icon`. The pure builder still emits plain strings and no icons; this type permits
  `GitRefsView` to decorate the current branch with a styled `Text` node and to retain colored,
  sized icon nodes.
- Do not force `GitRefNode.label` to `string`: the current-branch decoration is a real rich caller.
  Do not replace its colored icon nodes with bare names because their color and size props matter.

### 5. Normalize tree-provider and category model data

- In `TreeProviderViewModel.ts`, change `getLabel`'s return to `SlotText` and retain
  `renderTrailing`'s `ReactNode` return. The former is text-bearing with one styled caller; the
  latter is a subtree callback used for explorer/board action controls. Preserve selection,
  expansion, drag/drop, persistence, and context-menu behavior.
- In `CategoryViewModel.ts`, retain `renderItems` as a callback returning a React subtree. It is
  the editor-owned rendering seam for list/tile modes and must not become a generic slot callback.
- In `CategoryView.tsx`, replace the `ReactNode` view-mode map with `Record<CategoryViewMode,
  IconName>`, using `view-list`, `view-landscape`, `view-landscape-big`, `view-portrait`, and
  `view-portrait-big`. Pass names to `IconButton` and call `renderIcon` for menu items whose icon
  field is a rendered node. Convert the owned close button to `icon="close"`.

### 6. Preserve the explicit React boundaries

- Keep `EditorErrorBoundary.children`, both page-manager `renderPage` callbacks, file/grid
  trailing callbacks, `SideBarPanelHeader.badge`/`actions`, `CategoryView.renderItems`, and
  tree-provider trailing callbacks as React subtree boundaries.
- Keep `EditorIcon`'s `LanguageIcon` path and the `components/icons/*` resolver family out of the
  registry. `EditorIconSource.getIcon` may return a custom React node through the `IconRef` arm;
  no second language-icon naming scheme is introduced.
- Do not add `SlotContent`, `renderSlot`, a generic callback protocol, or an icon descriptor. This
  task changes contracts and consumes the US-965 registry; it does not design Epic C's adapter.

### 7. Verify the shell migration

- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Smoke-check secondary panel override/fallback icons, direct-child header sizing, rich Search
  title rendering, folder drag/drop and selected arrow, pinned/tool icons, recent-file clear,
  Git current-branch styling, category view-mode menu icons, page/webview persistence, and all
  deferred trailing/render callback surfaces.
- Re-run the `ReactNode`/`ReactElement` inventory over `ui/` and `components/`; every remaining
  occurrence must be one of the documented child, subtree callback, dynamic resolver, or React
  loader boundaries.
- Do not add unit tests; the repository has no unit-test harness and smoke checks are intended.

## Concerns / Open questions

### New sidebar folder glyphs

The former Open Tabs and Recent Files emoji values cannot be passed through `renderIcon`, because
US-965 defines every string icon as a registry lookup. Add the supplied `TabsIcon` and `HistoryIcon`
paths to `theme/icons.tsx`, register them as `"tabs"` and `"history"`, and return those names from
`MenuBar.getFolderIcon`. Verify all three named folder glyphs (`tabs`, `history`, `tools`) at 14x14
in light and dark themes. If either new glyph is too faint, thicken its path geometry rather than
changing the viewBox.

### Resolver and colored-icon arms remain intentionally React-backed

`EditorIcon`, `LanguageIcon`, `FileIcon`, `TreeProviderItemIcon`, `BoardGlyph`, and the Git ref
decorator can supply prop-taking or language-dependent nodes. `IconRef` keeps those callers valid,
while names become the portable representation for built-ins. Removing the React arm here would
duplicate a resolver or lose color/size behavior and would violate D2/D3.

### Page and subtree callbacks are not text slots

Page managers and category view return complete React subtrees, while trailing/status/action
callbacks return arbitrary controls or badges. They cannot be made neutral by wrapping their return
type in `SlotText`; that would repeat the failed generic-slot design from US-965. They remain
explicit Epic C/mount-adapter work.

### Dynamic secondary-view loading

The secondary-view registry still loads React components with `ComponentType<SecondaryViewProps>`.
That is a deliberate dynamic-loading boundary, not a public text/icon slot. Converting it requires
the same mount contract as `mountReact`/`mountVanilla` and is outside Epic P.

### Editor-owned callers are excluded from declaration conversion

D1 excludes editor files from this slot sweep. Shared contract changes may surface editor call-site
errors, which should be fixed only when they are direct compatibility updates (for example, passing
a registry name). Do not broadly convert editor prop declarations or render callbacks in US-969;
those migrate with each editor in Epic E.

One shared UIKit exception remains evidence-backed: `LinksList.tsx` supplies a styled rich folder
label directly to `ListItem`. `ListItem.label` therefore retains its React arm for that
editor-owned caller; all neutral string data paths remain narrowed.

There are no unresolved design questions blocking implementation if the recommended FolderItem
icon mapping is accepted. The remaining React arms are intentional and evidence-backed.

## Acceptance criteria

- [x] The 15 US-969 files use `IconRef`, `IconName`, `string`, or `SlotText` wherever the field is
      genuinely icon/text data; planned React boundaries are documented and unchanged.
- [x] `TabsIcon` and `HistoryIcon` exist in `theme/icons.tsx`, use `createIcon(24)`, and contain
      only the supplied `currentColor` path fills.
- [x] `"tabs"` and `"history"` are registered in `theme/icon-registry.ts`; `IconName` picks them
      up without a manual union edit.
- [x] Secondary-view registry and lazy/header icon props use `IconRef`; Search and Board overrides
      use `"search"` and `"board-color"`; the `EditorIcon` fallback still renders.
- [x] `SideBarPanelHeader.title` supports the one rich Search title, while icon SVGs remain direct
      header children and the show-main chevron keeps its sizing/color behavior.
- [x] `FolderItem.label` and `tooltip` are strings; `MenuBar.getFolderIcon` returns `"tabs"`,
      `"history"`, and `"tools"` for the former emoji entries without development warnings.
- [x] `CreatableItem.icon` and `FileListItem.icon` use `IconRef`; named values render as SVGs and
      language/custom resolver nodes remain unchanged. File-list trailing/status callbacks remain.
- [x] Git ref labels and icons retain current-branch styling, color, size, tree wrappers, and
      tooltip behavior.
- [x] Category view-mode icons use the five registry names and menu/button rendering remains
      visually unchanged; the category editor render callback remains a subtree callback.
- [x] Page managers, error boundary, file/grid trailing callbacks, and other documented subtree/
      loader boundaries remain behaviorally unchanged; no generic slot callback or icon descriptor.
- [x] Remaining `ReactNode`/`ReactElement` inventory entries in `ui/` and `components/` are limited
      to the explicit exceptions listed here.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [x] Manual smoke checks cover secondary views, sidebar folders/tools, file lists, Git refs,
      category view mode, page persistence, and deferred subtree surfaces. The three sidebar
      folder glyphs are crisp at 14x14 in both light and dark themes and match neighboring icon
      weight.
- [x] No unit-test harness or tests are added.

## Files to create or modify

Primary US-969 files:

- `src/renderer/ui/app/EditorErrorBoundary.tsx` (boundary verification only)
- `src/renderer/ui/secondary-views/LazySecondaryView.tsx`
- `src/renderer/ui/secondary-views/secondary-view-registry.ts`
- `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx`
- `src/renderer/ui/sidebar/FolderItem.tsx`
- `src/renderer/ui/sidebar/tools-editors-registry.ts`
- `src/renderer/theme/icons.tsx` (`TabsIcon`, `HistoryIcon`)
- `src/renderer/theme/icon-registry.ts` (registry entries)
- `src/renderer/components/file-grid/FileGrid.tsx` (boundary verification only)
- `src/renderer/components/file-list/FileList.tsx`
- `src/renderer/components/git-tree/git-refs-tree.ts`
- `src/renderer/components/icons/EditorIcon.tsx`
- `src/renderer/components/page-manager/PageManager.tsx` (boundary verification only)
- `src/renderer/components/page-manager/AppPageManager.tsx` (boundary verification only)
- `src/renderer/components/tree-provider/CategoryView.tsx`
- `src/renderer/components/tree-provider/CategoryViewModel.ts` (boundary verification only)
- `src/renderer/components/tree-provider/TreeProviderViewModel.ts`

Likely direct consumers / compatibility updates:

- `src/renderer/ui/secondary-views/SecondaryViews.tsx`
- `src/renderer/ui/sidebar/MenuBar.tsx`
- `src/renderer/ui/sidebar/BuiltinEditorsList.tsx`
- `src/renderer/ui/sidebar/PinnedRail.tsx`
- `src/renderer/editors/register-editors.ts`

Verification-only editor callers include `CategoryEditor.tsx`, `GitRefsView.tsx`,
`SearchSecondaryView.tsx`, `LinkCategoryPanel.tsx`, `LinksList.tsx`, `RecentFileList.tsx`,
`CommitDiffPanel.tsx`, and `GitChangesView.tsx`. Their editor-owned subtree declarations remain
out of scope under D1.

## Related

- [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
- [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md)
- [US-966: Neutral slots - UIKit primitives and inputs](../US-966-neutral-slots-primitives/README.md)
- [US-967: Neutral slots - UIKit list and data components](../US-967-neutral-slots-list-data/README.md)
- [US-968: Neutral slots - UIKit containers and floating layer](../US-968-neutral-slots-containers-floating/README.md)
- [De-React roadmap](../../de-react.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [Component creation guide](../../standards/component-guide.md)
