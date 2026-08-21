# Styling inventory

> **Frozen snapshot — 2026-08-18.** This document records the Epic P baseline and is never
> updated in place. Re-run the pinned commands below to obtain the current source-tree picture
> after later epics change the styling surface.

This is the durable source for the two styling inventories produced during EPIC-051. It exists so
the measurements, classifications, and handoffs survive cleanup of the historical US-975 and
US-979 task folders. It is an inventory, not a conversion plan: it does not prescribe source,
dependency, or styling changes.

## Reverification commands

Run from the repository root:

```powershell
$emotion = @(rg -l '@emotion/(styled|react)' src/renderer --glob '*.{ts,tsx}' | Sort-Object)
"Emotion files: $($emotion.Count)"
$emotion

$inline = @(rg -n 'style\s*=\s*\{\{' src/renderer --glob '*.tsx' --glob '!*.story.tsx')
"Inline-style sites: $($inline.Count)"
$inline
```

The Emotion command includes story files because EPIC-051 measured the complete renderer import
surface. The inline-style command excludes stories because its baseline is the production JSX
surface. The commands are intentionally self-counting; the lists below are the frozen result,
not a live report.

## Emotion inventory

Emotion means a file matching `@emotion/styled` or `@emotion/react`. The 2026-08-18 result was
79 files, partitioned into 65 eligible static/non-prop files, 5 dynamic files, and 9 superseded
AVGrid files. One of the dynamic files is the story-only `Tree.story.tsx`, so production contains
78 files and the eligible production conversion estimate is 69 files.

| Area | Files | Eligible static/non-prop | Dynamic Emotion | Superseded | Notes |
|---|---:|---:|---:|---:|---|
| `uikit/` | 56 | 42 | 5 | 9 | `42 + 5 + 9 = 56`; includes one story |
| `ui/` | 10 | 10 | 0 | 0 | Shell styles use static objects/selectors |
| `components/` | 11 | 11 | 0 | 0 | Coupled components use static objects/selectors |
| `core/` | 1 | 1 | 0 | 0 | `core/state/view.tsx` root wrapper |
| `theme/` | 1 | 1 | 0 | 0 | `GlobalStyles.tsx` is global stylesheet infrastructure |
| **Total** | **79** | **65** | **5** | **9** | **78 production; 69 eligible after AVGrid exclusion** |

### Eligible static/non-prop files — 65

These files have no Emotion style callback that reads component props. Their eventual conversion
is expected to extract CSS while preserving selectors, token references, animation rules, and
inline values already present in the rendering code.

**`uikit/` — 42 production files**

- `src/renderer/uikit/Autocomplete/Autocomplete.tsx`
- `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx`
- `src/renderer/uikit/Button/Button.tsx`
- `src/renderer/uikit/CategoryList/CategoryList.tsx`
- `src/renderer/uikit/Checkbox/Checkbox.tsx`
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx`
- `src/renderer/uikit/Dialog/Dialog.tsx`
- `src/renderer/uikit/Dialog/DialogContent.tsx`
- `src/renderer/uikit/Divider/Divider.tsx`
- `src/renderer/uikit/Dot/Dot.tsx`
- `src/renderer/uikit/IconButton/IconButton.tsx`
- `src/renderer/uikit/ImageViewport/ImageViewport.tsx`
- `src/renderer/uikit/Input/Input.tsx`
- `src/renderer/uikit/Label/Label.tsx`
- `src/renderer/uikit/ListBox/ListBox.tsx`
- `src/renderer/uikit/ListBox/ListItem.tsx`
- `src/renderer/uikit/ListBox/SectionItem.tsx`
- `src/renderer/uikit/Menu/Menu.tsx`
- `src/renderer/uikit/Minimap/Minimap.tsx`
- `src/renderer/uikit/MultiListBox/MultiListBox.tsx`
- `src/renderer/uikit/MultiSelect/MultiSelect.tsx`
- `src/renderer/uikit/Notification/Notification.tsx`
- `src/renderer/uikit/Panel/Panel.tsx`
- `src/renderer/uikit/PathInput/PathInput.tsx`
- `src/renderer/uikit/Popover/Popover.tsx`
- `src/renderer/uikit/ProgressBar/ProgressBar.tsx`
- `src/renderer/uikit/RadioGroup/RadioGroup.tsx`
- `src/renderer/uikit/RenderGrid/RenderGrid.tsx`
- `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx`
- `src/renderer/uikit/Select/Select.tsx`
- `src/renderer/uikit/SelectableRow/SelectableRow.tsx`
- `src/renderer/uikit/Slider/Slider.tsx`
- `src/renderer/uikit/SplitButton/SplitButton.tsx`
- `src/renderer/uikit/Splitter/Splitter.tsx`
- `src/renderer/uikit/Tag/Tag.tsx`
- `src/renderer/uikit/TagsInput/TagsInput.tsx`
- `src/renderer/uikit/Text/Text.tsx`
- `src/renderer/uikit/Textarea/Textarea.tsx`
- `src/renderer/uikit/Tooltip/Tooltip.tsx`
- `src/renderer/uikit/Tree/Tree.tsx`
- `src/renderer/uikit/TruncatedText/TruncatedText.tsx`

**`ui/` — 10 files**

- `src/renderer/ui/app/EditorErrorBoundary.tsx`
- `src/renderer/ui/app/MainPage.tsx`
- `src/renderer/ui/app/Pages.tsx`
- `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx`
- `src/renderer/ui/sidebar/FolderItem.tsx`
- `src/renderer/ui/sidebar/MenuBar.tsx`
- `src/renderer/ui/sidebar/PinnedRail.tsx`
- `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx`
- `src/renderer/ui/tabs/PageTab.tsx`
- `src/renderer/ui/tabs/PageTabs.tsx`

**`components/` — 11 files**

- `src/renderer/components/file-grid/FileGrid.tsx`
- `src/renderer/components/file-list/FileList.tsx`
- `src/renderer/components/file-search/FileSearch.tsx`
- `src/renderer/components/git-tree/BranchTreeCell.tsx`
- `src/renderer/components/git-tree/GitStatusBadge.tsx`
- `src/renderer/components/git-tree/GitTree.tsx`
- `src/renderer/components/git-tree/RefBadge.tsx`
- `src/renderer/components/git-tree/SideSelectToggle.tsx`
- `src/renderer/components/icons/FileIcon.tsx`
- `src/renderer/components/tree-provider/CategoryView.tsx`
- `src/renderer/components/tree-provider/TreeProviderView.tsx`

**`core/` and `theme/` — 2 files**

- `src/renderer/core/state/view.tsx` — static `ViewRoot` wrapper; the `Views` registry remains
  part of Epic B's framework-boundary work.
- `src/renderer/theme/GlobalStyles.tsx` — global CSS and theme-dependent SVG scrollbar rules;
  not a component-level extraction candidate.

### Superseded AVGrid files — 9

The UIKit AVGrid implementation is scheduled for replacement by dependency-free vanilla `av-grid`.
Extracting its Emotion CSS in Epic A would create work that is immediately deleted. `AVGrid.tsx`
is especially unsafe to treat as mechanical: it is the only `styled(RenderGrid)` composition and
its roughly 170-line block reaches into RenderGrid's DOM through load-bearing descendant selectors
and specificity. These files remain part of the 79-file measurement but are excluded from the
69-file Epic A conversion estimate:

- `src/renderer/uikit/AVGrid/AVGrid.tsx`
- `src/renderer/uikit/AVGrid/CellInput.tsx`
- `src/renderer/uikit/AVGrid/CellSelect.tsx`
- `src/renderer/uikit/AVGrid/DataCell.tsx`
- `src/renderer/uikit/AVGrid/filters/FilterBar.tsx`
- `src/renderer/uikit/AVGrid/filters/FilterPopover.tsx`
- `src/renderer/uikit/AVGrid/filters/OptionsFilterContent.tsx`
- `src/renderer/uikit/AVGrid/HeaderCell.tsx`
- `src/renderer/uikit/AVGrid/SelectColumn.tsx`

### Dynamic Emotion files — 5

Four are eligible production files. The fifth is a story-only demo and is inventory-only.

| File | Runtime style inputs | Likely future seam |
|---|---|---|
| `src/renderer/uikit/Progress/ProgressOverlay.tsx` | `topPx` controls pill position; `clickable` controls pointer events | CSS custom property for position plus a class/data attribute for interactivity |
| `src/renderer/uikit/Spinner/Spinner.tsx` | `$size` controls dimensions; `$color` controls color | CSS custom properties or direct inline dimensions/color; preserve the keyframe |
| `src/renderer/uikit/Tree/SectionItem.tsx` | `Indent.size` and `Indent.first` control width/border | CSS custom property for width and a class/data attribute for first-indent behavior |
| `src/renderer/uikit/Tree/TreeItem.tsx` | `Indent.size`, `Indent.first`, `Chevron.size`, `ChevronStub.size` | CSS custom property for dimensions and a class/data attribute for first-indent behavior |
| `src/renderer/uikit/Tree/Tree.story.tsx` | `$level`, `$selected`, `$active` in the custom-row demo | Story harness only; do not let it drive production conversion scope |

The classification is narrower than “does appearance depend on props?” A style is static/non-prop
when its Emotion definition does not read runtime props; it may still respond to `data-*`
attributes, pseudo-classes, shared selectors, or inline styles. It is dynamic only when an Emotion
style callback reads a runtime value such as `topPx`, `$size`, or `Indent.size`.

### Keyframes — 3 runtime Emotion definitions

Emotion mints runtime animation names, while plain CSS needs stable names in a stylesheet. Names
must be globally unique and declarations must remain available to every consumer.

| File | Definition | Use |
|---|---|---|
| `src/renderer/uikit/Dialog/Dialog.tsx:3,27` | `pulse` | Dialog attention animation |
| `src/renderer/uikit/ProgressBar/ProgressBar.tsx:3,36` | `indeterminateSlide` | Indeterminate fill animation |
| `src/renderer/uikit/Spinner/Spinner.tsx:3,21` | `spin` | Spinner rotation; also has dynamic size/color inputs |

Four files import `@emotion/react` at runtime: `GlobalStyles.tsx` (the `css` and `Global`
runtime) and the three keyframe files. `shared/selection-style.ts` held a fifth, type-only import;
**the file no longer exists** — EPIC-056 US-1014 and US-1015 converted its `uikit` consumers and
US-1015 relocated the two surviving fragments into `ui/sidebar/FolderItem.tsx`, its last (app-layer)
consumer. The focus-aware selection contract is now four independent per-component copies; see
`uikit/CLAUDE.md`.

## Inline-style inventory

The separate literal baseline is 133 JSX `style={{...}}` sites across 51 non-story `.tsx` files.
A site means one JSX `style={{...}}` prop, not one CSS property inside that object.

| Area | Files | Sites | Scope note |
|---|---:|---:|---|
| `editors/` | 35 | 103 | Editor-owned runtime/layout styles; converts with each editor in Epic E |
| `uikit/` | 6 | 18 | Shared primitive and RenderGrid surfaces |
| `ui/` | 3 | 4 | Shell styles |
| `components/` | 6 | 7 | Coupled component and cell styles |
| `theme/` | 1 | 1 | Icon SVG sizing/style site |
| **Total** | **51** | **133** | **Non-story `.tsx` only** |

### Exact file list

**`components/` — 6 files**

- `src/renderer/components/file-search/FileSearch.tsx`
- `src/renderer/components/git-tree/BranchTreeCell.tsx`
- `src/renderer/components/git-tree/GitStatusBadge.tsx`
- `src/renderer/components/git-tree/RefBadge.tsx`
- `src/renderer/components/icons/LanguageIcon.tsx`
- `src/renderer/components/icons/TreeProviderItemIcon.tsx`

**`editors/` — 35 files**

- `src/renderer/editors/base/ContentHostFooter.tsx`
- `src/renderer/editors/board/BoardEditorView.tsx`
- `src/renderer/editors/board/BoardGlyph.tsx`
- `src/renderer/editors/board/BoardWebview.tsx`
- `src/renderer/editors/browser/BrowserDownloadsPopup.tsx`
- `src/renderer/editors/browser/BrowserTabsPanel.tsx`
- `src/renderer/editors/browser/BrowserView.tsx`
- `src/renderer/editors/browser/DownloadButton.tsx`
- `src/renderer/editors/draw/DrawBody.tsx`
- `src/renderer/editors/graph/GraphDetailPanel.tsx`
- `src/renderer/editors/graph/index.tsx`
- `src/renderer/editors/link-editor/EditLinkDialog.tsx`
- `src/renderer/editors/link-editor/LinksList.tsx`
- `src/renderer/editors/link-editor/LinksTiles.tsx`
- `src/renderer/editors/link-editor/LinkTooltip.tsx`
- `src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx`
- `src/renderer/editors/link-editor/PinnedLinksPanel.tsx`
- `src/renderer/editors/log-view/items/McpRequestView.tsx`
- `src/renderer/editors/log-view/items/MermaidOutputView.tsx`
- `src/renderer/editors/log-view/items/TextOutputView.tsx`
- `src/renderer/editors/mcp-inspector/McpInspectorView.tsx`
- `src/renderer/editors/mcp-inspector/PromptsPanel.tsx`
- `src/renderer/editors/mcp-inspector/ResourceContentView.tsx`
- `src/renderer/editors/mcp-inspector/ToolResultView.tsx`
- `src/renderer/editors/notebook/category-tree.tsx`
- `src/renderer/editors/notebook/ExpandedNoteView.tsx`
- `src/renderer/editors/notebook/note-editor/NoteItemToolbar.tsx`
- `src/renderer/editors/notebook/NoteItemView.tsx`
- `src/renderer/editors/notebook/TagsListView.tsx`
- `src/renderer/editors/rest-client/ResponseViewer.tsx`
- `src/renderer/editors/settings/SettingsView.tsx`
- `src/renderer/editors/settings/sections/BrowserProfilesSection.tsx`
- `src/renderer/editors/settings/sections/SettingsSections.tsx`
- `src/renderer/editors/settings/sections/ThemeSection.tsx`
- `src/renderer/editors/svg/SvgBody.tsx`

**`theme/` — 1 file**

- `src/renderer/theme/icons.tsx`

**`ui/` — 3 files**

- `src/renderer/ui/app/Pages.tsx`
- `src/renderer/ui/secondary-views/LazySecondaryView.tsx`
- `src/renderer/ui/sidebar/MenuBar.tsx`

**`uikit/` — 6 files**

- `src/renderer/uikit/AVGrid/utils.tsx`
- `src/renderer/uikit/Minimap/Minimap.tsx`
- `src/renderer/uikit/RadioGroup/RadioGroup.tsx`
- `src/renderer/uikit/RenderGrid/RenderGrid.tsx`
- `src/renderer/uikit/Spacer/Spacer.tsx`
- `src/renderer/uikit/Tooltip/Tooltip.tsx`

### Highest-density files

These are first review targets when Epic A classifies values as static layout, theme-token-based,
discrete state, scalar runtime geometry, third-party handle state, or measured DOM results.

| File | Sites |
|---|---:|
| `editors/notebook/NoteItemView.tsx` | 13 |
| `uikit/RenderGrid/RenderGrid.tsx` | 11 |
| `editors/notebook/ExpandedNoteView.tsx` | 9 |
| `editors/link-editor/LinksTiles.tsx` | 9 |
| `editors/notebook/TagsListView.tsx` | 8 |
| `editors/settings/sections/ThemeSection.tsx` | 7 |
| `editors/settings/sections/BrowserProfilesSection.tsx` | 6 |
| `editors/link-editor/LinksList.tsx` | 5 |
| `editors/link-editor/PinnedLinksPanel.tsx` | 4 |
| `editors/link-editor/panels/LinkCategoryPanel.tsx` | 4 |
| `editors/link-editor/LinkTooltip.tsx` | 4 |

## Ownership and boundaries

The 56 UIKit Emotion files are the shared-style surface, but the 9 AVGrid files are explicitly
superseded. The 10 UI and 11 components files are shell/coupled styles. `src/renderer/editors/`
contains zero Emotion imports; its 35 inline-style files and 103 sites remain editor-owned and
convert with their respective editor work in Epic E. `GlobalStyles.tsx` and `core/state/view.tsx`
are infrastructure and must not be silently treated as ordinary component rewrites.
(`selection-style.ts` was the third; it is gone.)

Inline styles are measured separately because the Emotion scan cannot see them. The 133 literal
sites do not include `style={p.style}`, spread/model-provided style objects such as RenderGrid's
`p.style` or `model.blockStyles`, CSS files, Emotion styles, or serialized styles. Those are
additional paths for their owning migration tasks, not hidden additions to this frozen number.

The eventual migration must preserve selector specificity and insertion order, `data-*` and
pseudo-class behavior, direct-child SVG sizing, keyframes, theme-token resolution, and computed
style precedence. Measured DOM geometry, RenderGrid placement, image dimensions, and
third-party/webview sizing remain view-owned runtime values rather than being forced into global
CSS. No roadmap dynamic-styling decision is made by this inventory.

## Handoff

EPIC-052 consumes this baseline for US-981 (token variables), US-983 (Emotion-to-CSS conventions),
and US-984 (the Spinner pilot). Later epics must re-run the commands before claiming a partition
is unchanged; they must not edit this frozen document to make a current count fit the baseline.
