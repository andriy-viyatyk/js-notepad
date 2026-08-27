# US-1149 + US-1150 — UIKit face collection and zero-caller sweep

**Epic:** [EPIC-071](../../epics/EPIC-071.md), tasks 8 and 9 (E13 De-React)
**Status:** investigation / implementation plan

## Goal

Remove the nine unneeded UIKit React faces exposed by the seven landed E13 editor conversions,
while preserving the prop types, native views, Storybook stories, and live barrel APIs. The nine
are split explicitly between six faces collected by this epic and three faces that were already
zero-caller. `Notification/AlertsBar.tsx` is a separate retained-module case: its React face is
dead, but its native view and alert model remain live.

This document is plan-only. No source file, test harness, dashboard entry, or build output is
being changed by this investigation.

## Background

### Authoritative scope and corrected instrument

EPIC-071 §E13-12 is authoritative. §E13-4's face table and its “fifteen dead faces” claim are
superseded and are not used here. The corrected value-caller instrument was re-run against the
current worktree:

```text
JSX value:       <Sym followed by whitespace, /, >, or end-of-line
React value:     (React.)?createElement(Sym, ...)
Scope:           src/renderer/**/*.ts and *.tsx, excluding src/renderer/uikit/
                 and *.story.*; count application callers only
```

The end-of-line arm is required for multiline tags such as a line containing only `<TagsInput`.
The `createElement` arm catches the tagless `link-editor/index.ts` callers. Matches were then
opened in source; comment-only text was removed from the value-caller count.

The scan covered every current `uikit/**/*.tsx` that is not `*.story.tsx` and not `*View.tsx`:
32 files, including the non-face `shared/mount.tsx` helper. The value-caller results are below;
counts are value-use occurrences, followed by the application files containing them. The large
counts are intentionally retained as an audit trail rather than collapsed to “live”.

| Face/file symbol | Current value callers outside `uikit/` |
|---|---|
| `Autocomplete` | 1 — `editors/rest-client/KeyValueEditor.tsx:111` |
| `Breadcrumb` | **0** |
| `Button` | 21 — `editors/board/UntrustedBoardView.tsx:28`; `editors/browser/BrowserView.tsx:550`, `TorStatusOverlay.tsx:80`, `UrlSuggestionsDropdown.tsx:61`; `editors/env-vars/EnvVarsBody.tsx:34`; `editors/file-diff/FileDiffBody.tsx:64`, `RevisionPicker.tsx:81`; `editors/graph/GraphDetailPanel.tsx:786,789,1061,1064`, `GraphLegendPanel.tsx:406`, `GraphTuningSliders.tsx:84`; `editors/rest-client/RequestBuilder.tsx:276,298,432,502,607`, `ResponseViewer.tsx:296,360,362` |
| `Checkbox` | 2 — `editors/rest-client/KeyValueEditor.tsx:102`, `RequestBuilder.tsx:602` |
| `DataGrid` | 3 — `editors/env-vars/EnvVarsBody.tsx:266`; `editors/graph/GraphDetailPanel.tsx:765,1036`. `ui/dialogs/poppers/grid-context-menu.tsx:86` is a documentation comment, not a caller. |
| `DateInput` | **0** |
| `Divider` | **0** |
| `Dot` | 2 — `editors/board/BoardToolbar.tsx:153`; `editors/browser/BrowserView.tsx:283` |
| `Icon` | 14 — `editors/board/BoardEditorView.tsx:68`, `BoardGlyph.tsx:22`, `BoardNotFoundView.tsx:14`, `UntrustedBoardView.tsx:21`; `editors/browser/BrowserTabsPanel.tsx:122`, `BrowserView.tsx:281,289`, `TorStatusOverlay.tsx:75`; `editors/graph/GraphDetailPanel.tsx:553` (two tags), `1122`, `1142`, `1209`, `1225` |
| `IconButton` | 41 — `editors/board/BoardToolbar.tsx:96,126,133,144`; `editors/browser/BrowserTabsPanel.tsx:130,139,326,349,357`, `BrowserView.tsx:314,321,424,432,440,448,484,493,504,515,522,558`, `DownloadButton.tsx:44`, `TorStatusOverlay.tsx:55`; `editors/env-vars/EnvVarsBody.tsx:93,346`; `editors/graph/GraphBody.tsx:556,564,573,581,601`, `GraphTooltip.tsx:270,276`; `editors/rest-client/KeyValueEditor.tsx:148`, `RequestBuilder.tsx:347,641,677`, `ResponseViewer.tsx:287,319`, `RestClientShared.tsx:238,249`; `ui/sidebar/TrustedBoardsListView.tsx:32` |
| `Input` | 9 — `editors/browser/BrowserView.tsx:458`; `editors/env-vars/EnvVarsBody.tsx:107,334`; `editors/graph/GraphBody.tsx:589`, `GraphDetailPanel.tsx:1177,1189`, `GraphExpansionSettings.tsx:140,152`, `GraphLegendPanel.tsx:570` |
| `ListBox` | 1 — `editors/browser/UrlSuggestionsDropdown.tsx:66` |
| `ListItem` | **0** |
| `WithMenu` | 6 — `editors/browser/BrowserView.tsx:455,502`; `editors/rest-client/RequestBuilder.tsx:274,430`, `ResponseViewer.tsx:294`, `RestClientShared.tsx:236` |
| `AlertsBar` | **0** face callers; `AlertsBarView` and `alertsBarModel` are live as recorded below |
| `Panel` | 130 — callers in `editors/base/EditorError.tsx`; `editors/board/{BoardEditorView,BoardNotFoundView,BoardToolbar,BoardWebview,UntrustedBoardView}.tsx`; `editors/browser/{BookmarksDrawer,BrowserTabsPanel,BrowserView,DownloadButton,TorStatusOverlay,UrlSuggestionsDropdown}.tsx`; `editors/draw/DrawBody.tsx`; `editors/env-vars/EnvVarsBody.tsx`; `editors/file-diff/{FileDiffBody,RevisionPicker}.tsx`; `editors/graph/{GraphDetailPanel,GraphExpansionSettings,GraphLegendPanel,GraphTuningSliders}.tsx`; `editors/rest-client/{KeyValueEditor,RequestBuilder,ResponseViewer,RestClientBody,RestClientShared}.tsx`; `ui/sidebar/TrustedBoardsListView.tsx` |
| `ProgressBar` | **0** |
| `SegmentedControl` | 5 — `editors/env-vars/EnvVarsBody.tsx:327`; `editors/rest-client/RequestBuilder.tsx:338,422`, `ResponseViewer.tsx:277,312` |
| `Select` | 1 — `editors/graph/GraphExpansionSettings.tsx:129` |
| `SelectableRow` | 1 — `editors/env-vars/EnvVarsBody.tsx:83` |
| `shared/mount.tsx` helper | 0 symbol value callers in this instrument; not a React face and not in the deletion set |
| `Slider` | 1 — `editors/graph/GraphTuningSliders.tsx:71` |
| `Spacer` | 5 — `editors/browser/UrlSuggestionsDropdown.tsx:59`; `editors/rest-client/RequestBuilder.tsx:337`, `ResponseViewer.tsx:284`, `RestClientShared.tsx:235,298` |
| `Spinner` | 4 — `editors/browser/BrowserView.tsx:281`, `TorStatusOverlay.tsx:74`; `editors/draw/DrawBody.tsx:126`; `editors/graph/GraphBody.tsx:514` |
| `Splitter` | 4 — `editors/browser/BookmarksDrawer.tsx:80`, `BrowserView.tsx:583`; `editors/rest-client/RequestBuilder.tsx:392`, `RestClientShared.tsx:268`. `GitTreeEditorModel.ts:200,222` are prose comments. |
| `Tag` | 1 — `ui/sidebar/TrustedBoardsListView.tsx:86` |
| `TagsInput` | **0** |
| `Text` | 43 — `editors/base/EditorError.tsx:18`; `editors/board/BoardEditorView.tsx:69,70`, `BoardNotFoundView.tsx:15,16,20`, `UntrustedBoardView.tsx:22,23,27`; `editors/browser/BrowserView.tsx:544`, `TorStatusOverlay.tsx:77`, `UrlSuggestionsDropdown.tsx:58`; `editors/env-vars/EnvVarsBody.tsx:33,53,54,55,91,288,360,399`; `editors/file-diff/FileDiffBody.tsx:60`; `editors/graph/GraphBody.tsx:664,668`; `editors/rest-client/RequestBuilder.tsx:283,336,421,485,506,649`, `ResponseViewer.tsx:240,250,349,386,388`, `RestClientBody.tsx:50`, `RestClientShared.tsx:222,297,301,306,307`; plus `editors/file-diff/index.ts:23,31` via `createElement(Text, ...)` |
| `Textarea` | 7 — `editors/rest-client/KeyValueEditor.tsx:121,134`, `RequestBuilder.tsx:287,625,660`, `RestClientShared.tsx:211,223` |
| `Tooltip` | **0** |
| `Tree` | **0** value callers; only comment mentions remain, listed below |
| `TruncatedText` | **0** |

This remeasurement agrees with §E13-12's identity split: the six collected faces are now free,
the three already-dead faces remain free, and no retained face has unexpectedly lost its required
value caller. It also confirms §E13-12's retained exceptions: `Select` remains held by
`GraphExpansionSettings.tsx:129`, `Tag` by `TrustedBoardsListView.tsx:86`, and the other faces
listed there still have current application callers.

### Current zero-caller sets

#### Collected by this epic — six

`Divider`, `Breadcrumb`, `ListItem`, `TagsInput`, `DateInput`, and `ProgressBar` have no current
application value callers after the conversions. Their last React callers are source-verified in
the pre-conversion files:

| Face | Removed caller evidence |
|---|---|
| `Divider` | `editors/mcp-inspector/McpInspectorView.tsx:128,215`; `editors/mneme-config/RootsPanel.tsx:293`; `editors/settings/SettingsView.tsx:54,56,58,67,71,73,75,77,79,81,83,85,87` (the earlier `about/AboutView.tsx:164,185,194` uses were also removed by its landed conversion) |
| `Breadcrumb` | `editors/link-editor/index.ts:58,68,75` used `createElement(Breadcrumb, ...)` in each breadcrumb branch |
| `ListItem` | `editors/link-editor/PinnedLinksPanel.tsx:101` |
| `TagsInput` | `editors/mneme-root/MnemeRootEditorView.tsx:140,152` |
| `DateInput` | `editors/mneme-root/MnemeRootEditorView.tsx:167,178` |
| `ProgressBar` | `editors/mneme-config/ModelPanel.tsx:55` and `RootsPanel.tsx:185` |

These old caller paths are now either deleted or converted in the current worktree; the current
scanner finds no replacement value call. The line references identify the caller removed, rather
than treating a zero grep result as proof by itself.

#### Already dead before this epic — three

`Tree`, `TruncatedText`, and `Tooltip` are confirmed at zero application value callers. The only
remaining `Tree` scanner hits are prose comments at
`editors/git-tree/GitTreeEditorModel.ts:228` and `editors/rest-client/panels/RestRequestTreeView.ts:42`.
The historical `editors/link-editor/LinkTooltip.tsx:21` hit for `Tooltip` was also prose, and that
file is now gone in the landed link-editor conversion. `TruncatedText` has no remaining mention
outside its own UIKit files. Each mention was opened and classified; none is a JSX value or a
`createElement` argument.

#### Retained deliberately — one module

The `AlertsBar` function has zero face callers, but `Notification/AlertsBar.tsx` cannot be deleted:
`src/renderer/index.tsx:3` imports `AlertsBarView` directly and constructs it at `:29-33`, while
`src/renderer/api/ui.ts:13` and the graph mutation models import the live `alertsBarModel`. The
module should lose only the React `AlertsBar` function and become `AlertsBar.ts`; the native view,
model, and model barrel export remain.

### Type relocation and dependency audit

The face source is also the props type module in most cases. Counts below include direct type
importers in application code, UIKit views, and stories; barrel re-exports are listed separately.
The declaration itself is not counted. `TreeProps` is already canonical in `Tree/types.ts`.

| Face props | Type importers (count and exact files) | Disposition |
|---|---|---|
| `BreadcrumbProps` | 4 — `editors/notebook/index.ts:6`; `editors/link-editor/index.ts:2`; `uikit/Breadcrumb/BreadcrumbView.ts:9`; `uikit/Breadcrumb/Breadcrumb.story.ts:5` | Rename `Breadcrumb.tsx` to type-only `Breadcrumb.ts`; remove `Breadcrumb` and the React/mount imports, retain the interface |
| `DateInputProps` | 2 — `uikit/DateInput/DateInputView.ts:4`; `uikit/DateInput/DateInput.story.ts:5` | Rename `DateInput.tsx` to type-only `DateInput.ts`; retain the `InputProps` extension and React ref type |
| `DividerProps` | 2 — `uikit/Divider/DividerView.tsx:3`; `uikit/Divider/Divider.story.ts:3` | Rename `Divider.tsx` to type-only `Divider.ts`; remove the face shim |
| `ListItemProps` | 1 — `uikit/ListBox/ListItemView.ts:15` | Rename `ListItem.tsx` to type-only `ListItem.ts`; `ListBox` remains the live list face and `ListItemView` remains the native row |
| `TagsInputProps` | 2 — `uikit/TagsInput/TagsInputView.ts:9`; `uikit/TagsInput/TagsInput.story.ts:5` | Rename `TagsInput.tsx` to type-only `TagsInput`; remove the shim |
| `ProgressBarProps` | 2 — `uikit/ProgressBar/ProgressBarView.tsx:3`; `uikit/ProgressBar/ProgressBar.story.ts:1` | Rename `ProgressBar.tsx` to type-only `ProgressBar.ts`; remove the shim |
| `TreeProps` | 7 canonical importers — `uikit/Tree/TreeView.ts:24`, `TreeModel.ts:6`, `Tree/Tree.story.ts:6`; `components/tree-provider/TreeProviderViewImpl.ts:18`; `editors/rest-client/panels/RestRequestTreeView.ts:9`; `editors/git-tree/GitRefsView.ts:7`; `editors/notebook/panels/NotebookCategoriesSecondaryView.ts:11` | Delete `Tree.tsx` outright; all props/types already live in `Tree/types.ts` |
| `TruncatedTextProps` | 1 — `uikit/TruncatedText/TruncatedTextView.tsx:6` | Rename `TruncatedText.tsx` to type-only `TruncatedText.ts`; remove the shim |
| `TooltipProps` | 0 | Delete `Tooltip.tsx` outright; `TooltipOptions` and `TooltipAttachment` already belong to live `attach-tooltip.ts` |

The five stories that still import face props are type-only imports (`Breadcrumb.story.ts`,
`DateInput.story.ts`, `Divider.story.ts`, `ProgressBar.story.ts`, and `TagsInput.story.ts`). They
do not render a deleted React face. The `ListBox`, `Tree`, and `TruncatedText` stories use native
views or canonical/view types; the `Tooltip` story uses `attachTooltip`; no story imports the
`Tooltip` or `AlertsBar` face. Keeping the type-only modules preserves the Storybook editor's
existing import paths.

`AlertsBar` has no public props type importer. Its retained module has a private
`AlertsBarViewProps = Record<string, never>` used only by `AlertsBarView` in
`Notification/AlertsBar.tsx:110-119`; remove the face function and `mountVanilla`, then rename the
implementation file to `.ts`.

### Barrels and native view extensions

Both barrel levels were checked. The implementation must update these exact exports so no value
or type re-export points at a deleted file:

| Face | Folder barrel | `uikit/index.ts` | Native sibling check |
|---|---|---|---|
| `Breadcrumb` | Remove `export { Breadcrumb }`; keep `export type { BreadcrumbProps }` from `./Breadcrumb` | Remove value export at `:23`; keep type export at `:24` | `BreadcrumbView.ts` already has no JSX; unchanged |
| `DateInput` | Remove value export; keep props type | Remove value export at `:36`; keep type at `:37` | `DateInputView.ts` already is native TypeScript |
| `Divider` | Remove value export; keep props type | Remove value export at `:41`; keep type at `:42` | `DividerView.tsx` has no JSX and can be renamed to `DividerView.ts` |
| `ListItem` | Remove `export { ListItem }`; keep `ListItemProps` type | Remove `export { ListItem } from "./ListBox"` at `:90`; keep the type export at `:91` | `ListItemView.ts` is already native; its `React.Ref` is type-only and does not require `.tsx` |
| `TagsInput` | Remove value export; keep props type | Remove value export at `:62`; keep type at `:63` | `TagsInputView.ts` already is native TypeScript |
| `ProgressBar` | Remove value export; keep props type | Remove value export at `:53`; keep type at `:54` | `ProgressBarView.tsx` has no JSX and can be renamed to `ProgressBarView.ts` |
| `Tree` | Replace exports sourced from `./Tree` with `TREE_ITEM_KEY` and types from `./types`; retain `TreeItem` exports | Remove `Tree` value at `:96`; retain key/types from `./Tree/types` and `TreeItem` | `TreeView.ts` already is native TypeScript |
| `TruncatedText` | Remove value export; keep props type | Remove value export at `:125`; keep type at `:126` | `TruncatedTextView.tsx` has no JSX and can be renamed to `.ts`; it must retain runtime `React.isValidElement` because `fillSlot` accepts React-valued content |
| `Tooltip` | Remove `Tooltip` and `TooltipProps`; retain `attachTooltip`, `TooltipOptions`, and `TooltipAttachment` from `attach-tooltip.ts` | Remove `Tooltip` and `TooltipProps` at `:69,71`; retain `attachTooltip` and attachment types | No sibling face view; `attach-tooltip.ts` is the live native implementation |
| `AlertsBar` | Remove `AlertsBar`; retain `alertsBarModel` | Remove `AlertsBar` from `export { AlertsBar, alertsBarModel }` at `:75`; retain `alertsBarModel` | Rename the retained `AlertsBar.tsx` module to `AlertsBar.ts` after removing its React shim |

### Non-uikit `mountVanilla` audit

The complete current `src/renderer/ui/`, `src/renderer/components/`, `src/renderer/theme/`, and
`src/renderer/editors/*/` search found no additional UIKit face hidden by a module-path scan. The
remaining non-uikit `mountVanilla` wrappers have live callers: `PageManager` from
`editors/browser/BrowserView.tsx:598`, `GitTree` from `editors/file-diff/RevisionPicker.tsx:103`,
`SecondaryViews` from `editors/browser/BrowserSecondaryViews.tsx:18`, `ToolsTree` from
`ui/sidebar/TrustedToolsListView.tsx:47`, `ScriptPanel` and `ContentHostFooter` from
`editors/board/BoardEditorView.tsx:91-92`, `EditorToolbar` from
`editors/browser/BrowserView.tsx:422`, `MonacoDiffEditorHost` from
`editors/file-diff/FileDiffBody.tsx:73`, `ColorizedCode` from
`editors/browser/TorStatusOverlay.tsx:97`, `FindBar` from
`editors/browser/BrowserView.tsx:628`, `MonacoEditorHost` from the rest-client request/response
views, and `BoardsTree` from `editors/board/BoardToolbar.tsx:176` and
`ui/sidebar/TrustedBoardsListView.tsx:118`.

Three additional wrappers are currently zero-caller and should be recorded for a later non-uikit
sweep, not changed by this uikit-only task: `editors/board-info/BoardScreenshot.tsx` (its live
`BoardScreenshotView` is constructed directly by `BoardInfoEditorView.ts:224,329` and
`tools-hub/SearchBoardsTab.ts:243`), `editors/notebook/NotebookBody.tsx` (the live
`NotebookBodyView` is constructed by `notebook/index.ts:237`), and `editors/log-view/LogBody.ts`
(the live `LogBodyView` is constructed by `log-view/index.ts:149`). The four wrappers already
removed by the landed tools-hub/sidebar conversion are `ui/sidebar/BuiltinEditorsList.tsx`,
`PinnedRail.tsx`, `TrustedBoardsList.tsx`, and `TrustedToolsList.tsx`; their only face use was the
old `tools-hub/ToolsHubView.tsx` JSX, while `ToolsEditorsPanelView.ts` already constructs the
native siblings directly. No file in `src/renderer/theme/` uses `mountVanilla`.

### Closing measurement

Current counts, measured from the worktree while stories are excluded, are:

| Measurement | Before this task | Projected after this task |
|---|---:|---:|
| `src/renderer/**/*.tsx`, excluding `*.story.tsx` | **98** | **85** |
| `src/renderer/uikit/**/*.tsx`, excluding `*.story.tsx` | **52** | **39** |

The projected UIKit reduction is 13 files: seven face modules become `.ts` (`Breadcrumb`,
`DateInput`, `Divider`, `ListItem`, `ProgressBar`, `TagsInput`, `TruncatedText`), `Tree.tsx` and
`Tooltip.tsx` are deleted, `AlertsBar.tsx` becomes `AlertsBar.ts`, and the three view siblings
`DividerView.tsx`, `ProgressBarView.tsx`, and `TruncatedTextView.tsx` become `.ts`. The counts are
measurement targets for implementation; this investigation has not made those source changes.

## Implementation Plan

1. **Apply the six collected-face relocations.** In
   `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx`, `DateInput/DateInput.tsx`,
   `Divider/Divider.tsx`, `ListBox/ListItem.tsx`, `ProgressBar/ProgressBar.tsx`, and
   `TagsInput/TagsInput.tsx`, rename each file to `.ts`, preserve its exported props interface,
   and remove only the React import, `mountVanilla` import, view import, and face function. Keep
   all existing type fields, including `React.Ref`, `InputProps`, `SlotContent`, and drag/slot
   types as type-only dependencies. Rename the three JSX-free siblings identified above.
2. **Sweep the three already-dead faces.** Delete `src/renderer/uikit/Tree/Tree.tsx` because
   `Tree/types.ts` is already canonical and has all seven type importers. Delete
   `src/renderer/uikit/Tooltip/Tooltip.tsx` because it has no type importers and
   `Tooltip/attach-tooltip.ts` owns the live API. Do not delete `TreeView`, `TreeModel`,
   `TreeItem`, `attachTooltip`, or the Storybook story files.
3. **Retain the AlertsBar module while removing its face.** In
   `src/renderer/uikit/Notification/AlertsBar.tsx`, remove the `React` and `mountVanilla`
   imports and the `AlertsBar` function at `:198-200`, then rename the file to
   `Notification/AlertsBar.ts`. Leave `alertsBarModel`, `AlertsBarView`, `AlertItemView`, and
   the model's state/lifecycle logic unchanged. This preserves the direct renderer import and
   the script/graph alert model.
4. **Repair both barrel levels.** Update each affected folder `index.ts` and
   `src/renderer/uikit/index.ts` exactly as the barrel table specifies. For `Tree`, source the
   key and public types from `Tree/types.ts`; for `Tooltip`, source attachment types and the
   function from `Tooltip/attach-tooltip.ts`; for `Notification`, retain only `alertsBarModel`
   from the retained module. Search all `export ... from` statements afterward so no deleted
   face has a dangling re-export.
5. **Preserve Storybook imports.** Keep the five story type imports pointed at their now `.ts`
   type-only modules; extensionless imports continue to resolve. Keep all story registrations in
   `src/renderer/editors/storybook/storyRegistry.ts` and ensure each story constructs its native
   `*View` or attachment. No story should import a deleted face value.
6. **Keep the non-uikit findings out of this implementation.** Do not modify the three deferred
   non-uikit wrappers or any of the already-converted sidebar views. They are recorded so a later
   task can remove dead wrappers deliberately, with their native view callers preserved.
7. **Run the closing checks after implementation.** Run `npm run typecheck`, `npm run lint`, and
   `npm run build-prod` and require all three to be clean. Open the Storybook editor through its
   normal route and verify it still lists and renders the affected stories. Re-run the corrected
   symbol scanner, inspect every zero-result mention, and verify that no barrel at either folder
   or `uikit/index.ts` level re-exports a deleted face. Do not add unit tests or a test harness.

### Before → after snippets

```tsx
// Before: src/renderer/uikit/Divider/Divider.tsx
export function Divider(props: DividerProps): React.ReactElement {
    return mountVanilla(DividerView, props);
}
```

```ts
// After: src/renderer/uikit/Divider/Divider.ts
export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
    name?: string;
    orientation?: "horizontal" | "vertical";
}
```

```tsx
// Before: src/renderer/uikit/Tree/index.ts
export { Tree, TREE_ITEM_KEY } from "./Tree";
export type { ITreeItem, TreeProps, TreeRow, TreeItemRenderContext } from "./Tree";
```

```ts
// After: src/renderer/uikit/Tree/index.ts
export { TREE_ITEM_KEY } from "./types";
export type { ITreeItem, TreeProps, TreeRow, TreeItemRenderContext } from "./types";
```

```tsx
// Before: src/renderer/uikit/Notification/AlertsBar.tsx:198-200
export function AlertsBar(): React.ReactElement {
    return mountVanilla(AlertsBarView, {});
}
```

```ts
// After: src/renderer/uikit/Notification/AlertsBar.ts
// AlertsBarView and alertsBarModel remain exported; the React face is absent.
```

## Concerns

- **Type relocation is the compatibility boundary.** Deleting a face file without moving its
  props breaks the native view or a story even when the value scan is perfect. The listed importer
  counts must be rechecked after each rename.
- **`AlertsBar` is not an outright deletion.** Removing its React function is safe only while the
  direct `AlertsBarView` import in `src/renderer/index.tsx` and the `alertsBarModel` imports remain.
- **`Tooltip` has a live replacement API.** Remove only the compatibility face; `attachTooltip.ts`,
  `Tooltip.story.ts`, `ListItemView`, `TreeItemView`, and other direct attachment callers must stay.
- **`TruncatedTextView` still has a React-valued content arm.** Renaming it to `.ts` is a syntax
  change, not a React removal: retain the runtime `React.isValidElement` check and `fillSlot` seam.
- **Comments are not callers.** The three comment-only mentions are explicitly named above and
  must not block the sweep or be converted into artificial imports.
- **The worktree is intentionally dirty.** The seven editor conversions and related documentation
  are already present as user changes. The implementation must preserve them and must not use a
  destructive worktree reset.
- **No tests are in scope.** This task must not add unit tests or test harnesses. The required
  acceptance checks are the project's typecheck, lint, production build, and live Storybook route.

## Acceptance Criteria

- The corrected symbol scanner reports zero application value callers for exactly
  `Divider`, `Breadcrumb`, `ListItem`, `TagsInput`, `DateInput`, `ProgressBar`, `Tree`,
  `TruncatedText`, and `Tooltip`; every remaining mention is either absent or source-inspected
  prose, with no deletion justified by grep alone.
- The six collected faces retain their props as type-only `.ts` modules, `Tree.tsx` and
  `Tooltip.tsx` are deleted outright, and the retained `AlertsBar` module is `.ts` with its React
  face removed while `AlertsBarView` and `alertsBarModel` remain live.
- `DividerView`, `ProgressBarView`, and `TruncatedTextView` are `.ts` files with no JSX syntax;
  `TruncatedTextView` retains its deliberate runtime React content inspection.
- Both each component folder barrel and `src/renderer/uikit/index.ts` have no dangling
  re-export. `Tree` types/key come from `Tree/types.ts`; Tooltip attachment APIs come from
  `attach-tooltip.ts`; `alertsBarModel` remains exported; no deleted face value is exported.
- The Storybook editor still lists and renders the Breadcrumb, DateInput, Divider, ProgressBar,
  TagsInput, Tree, TruncatedText, and Tooltip stories. Story type imports resolve, and no story
  imports a deleted face value.
- The non-uikit audit is recorded: the four sidebar wrappers are already removed, the three
  additional zero-caller wrappers are explicitly deferred, and every remaining non-uikit
  `mountVanilla` face has a named live caller.
- The closing measurement is reproducible: current renderer non-story `.tsx` is 98 and current
  UIKit non-story `.tsx` is 52 before implementation, with projected after counts of 85 and 39.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` complete cleanly after
  implementation. No unit test or test harness is added, and no source change is made during
  this investigation.

## Files that need NO changes

- All affected `*.story.ts` files: `Breadcrumb.story.ts`, `DateInput.story.ts`,
  `Divider.story.ts`, `ProgressBar.story.ts`, `TagsInput.story.ts`, `Tree.story.ts`,
  `TruncatedText.story.ts`, and `Tooltip.story.ts`.
- `src/renderer/uikit/Tree/types.ts`, `Tree/TreeView.ts`, `Tree/TreeModel.ts`,
  `Tooltip/attach-tooltip.ts`, and `Notification/AlertItem.ts`.
- `src/renderer/index.tsx`, `src/renderer/api/ui.ts`, and all current native view callers of
  `AlertsBarView` or `alertsBarModel`.
- The three deferred non-uikit wrappers and their live native siblings:
  `src/renderer/editors/board-info/BoardScreenshot.tsx`, `notebook/NotebookBody.tsx`,
  `log-view/LogBody.ts`, and their `*View` files.
- `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts` and the four already-removed sidebar face
  paths; no restoration or replacement wrapper is needed.
- `src/renderer/theme/` and `src/renderer/uikit/shared/`.
- `doc/active-work.md`, `doc/epics/EPIC-071.md`, and every test file or test harness.

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx` → `.ts` | Retain `BreadcrumbProps`; remove the React/mount face |
| `src/renderer/uikit/DateInput/DateInput.tsx` → `.ts` | Retain `DateInputProps`; remove the React/mount face |
| `src/renderer/uikit/Divider/Divider.tsx` → `.ts` | Retain `DividerProps`; remove the React/mount face |
| `src/renderer/uikit/ListBox/ListItem.tsx` → `.ts` | Retain `ListItemProps`; remove the React/mount face |
| `src/renderer/uikit/ProgressBar/ProgressBar.tsx` → `.ts` | Retain `ProgressBarProps`; remove the React/mount face |
| `src/renderer/uikit/TagsInput/TagsInput.tsx` → `.ts` | Retain `TagsInputProps`; remove the React/mount face |
| `src/renderer/uikit/TruncatedText/TruncatedText.tsx` → `.ts` | Retain `TruncatedTextProps`; remove the React/mount face |
| `src/renderer/uikit/Tree/Tree.tsx` | Delete; types and key are already in `Tree/types.ts` |
| `src/renderer/uikit/Tooltip/Tooltip.tsx` | Delete; attachment API is in `Tooltip/attach-tooltip.ts` |
| `src/renderer/uikit/Notification/AlertsBar.tsx` → `.ts` | Remove only the dead `AlertsBar` function; retain native view/model |
| `src/renderer/uikit/Divider/DividerView.tsx` → `.ts` | Rename JSX-free native view |
| `src/renderer/uikit/ProgressBar/ProgressBarView.tsx` → `.ts` | Rename JSX-free native view |
| `src/renderer/uikit/TruncatedText/TruncatedTextView.tsx` → `.ts` | Rename JSX-free native view; retain runtime React slot inspection |
| `src/renderer/uikit/Breadcrumb/index.ts` | Remove value export; retain type export |
| `src/renderer/uikit/DateInput/index.ts` | Remove value export; retain type export |
| `src/renderer/uikit/Divider/index.ts` | Remove value export; retain type export |
| `src/renderer/uikit/ListBox/index.ts` | Remove `ListItem` value export; retain its props type |
| `src/renderer/uikit/ProgressBar/index.ts` | Remove value export; retain type export |
| `src/renderer/uikit/TagsInput/index.ts` | Remove value export; retain type export |
| `src/renderer/uikit/Tree/index.ts` | Repoint key/types to `./types`; remove `Tree` value export |
| `src/renderer/uikit/TruncatedText/index.ts` | Remove value export; retain type export |
| `src/renderer/uikit/Tooltip/index.ts` | Remove face and props exports; retain attachment API |
| `src/renderer/uikit/Notification/index.ts` | Remove `AlertsBar`; retain `alertsBarModel` |
| `src/renderer/uikit/index.ts` | Remove the nine face value exports and repair all type/API sources |

No source implementation is being written in this investigation; the only file written is this
task document.
