# US-1171 — Retire the `mountVanilla` face layer

## Goal

Delete the 18 remaining `mountVanilla` face files after moving every public type they own (or
re-export) to the native view/model/type module that owns the behavior. Repoint all type imports,
barrels, and stories so the four face stories continue through native `view:` arms and no deleted
face module path remains imported.

This task implements E15-1 closing statement 2, E15-5 item 7, and E15-6 concern C12 in
[`EPIC-073`](../../epics/EPIC-073.md). The supplied 2026-08-28 measurement is the baseline: all
18 faces have zero application renderers; four are referenced only by stories and fourteen are
type homes.

## Background

The five editor bodies are native after US-1166 through US-1170. Their native views and the native
UIKit consumers still compile against types whose module paths end in the old `.tsx` face. A face
is therefore not safe to delete merely because `mountVanilla` has no callers: its exported type
surface remains load-bearing. The relocation must happen before deletion, and the verification must
match module paths, not just component names, because a face can export or re-export multiple names.

The native owners are already present in the current tree:

| Face | Types to preserve | Native destination |
|---|---|---|
| `src/renderer/uikit/Input/Input.tsx` | `InputProps` | `src/renderer/uikit/Input/InputView.ts` |
| `src/renderer/uikit/IconButton/IconButton.tsx` | `IconButtonProps` | `src/renderer/uikit/IconButton/IconButtonView.ts` |
| `src/renderer/uikit/ListBox/ListBox.tsx` | `IListBoxItem`, `ListBoxProps`, `ListItemRenderContext`, `LIST_ITEM_KEY` re-exports | `src/renderer/uikit/ListBox/types.ts` |
| `src/renderer/uikit/Button/Button.tsx` | `ButtonProps` | `src/renderer/uikit/Button/ButtonView.ts` |
| `src/renderer/uikit/Splitter/Splitter.tsx` | `SplitterProps` | `src/renderer/uikit/Splitter/SplitterView.ts` |
| `src/renderer/uikit/Checkbox/Checkbox.tsx` | `CheckboxProps` | `src/renderer/uikit/Checkbox/CheckboxView.ts` |
| `src/renderer/uikit/DataGrid/DataGrid.tsx` | `DataGridProps` is already owned by `types.ts` | `src/renderer/uikit/DataGrid/types.ts` |
| `src/renderer/uikit/Textarea/Textarea.tsx` | `TextareaProps` | `src/renderer/uikit/Textarea/TextareaView.ts` |
| `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx` | `ISegment`, `SegmentedControlProps`; `SEGMENT_KEY` is already native | `src/renderer/uikit/SegmentedControl/SegmentedControlView.ts` |
| `src/renderer/uikit/Slider/Slider.tsx` | `SliderProps` | `src/renderer/uikit/Slider/SliderView.ts` |
| `src/renderer/uikit/Autocomplete/Autocomplete.tsx` | `AutocompleteProps` is already owned by `AutocompleteModel.ts` | `src/renderer/uikit/Autocomplete/AutocompleteModel.ts` |
| `src/renderer/uikit/Select/Select.tsx` | `SelectProps`, `ItemsSource`, `SelectItemsResult` are already owned by `SelectModel.ts` | `src/renderer/uikit/Select/SelectModel.ts` |
| `src/renderer/uikit/SelectableRow/SelectableRow.tsx` | `SelectableRowProps` | `src/renderer/uikit/SelectableRow/SelectableRowView.ts` |
| `src/renderer/uikit/Tag/Tag.tsx` | `TagProps` | `src/renderer/uikit/Tag/TagView.ts` |
| `src/renderer/uikit/Dot/Dot.tsx` | `DotProps`, `DotColor` | `src/renderer/uikit/Dot/DotView.ts` |
| `src/renderer/uikit/Spacer/Spacer.tsx` | `SpacerProps` | `src/renderer/uikit/Spacer/SpacerView.ts` |
| `src/renderer/uikit/Spinner/Spinner.tsx` | `SpinnerProps` | `src/renderer/uikit/Spinner/SpinnerView.ts` |
| `src/renderer/ui/secondary-views/SecondaryViews.tsx` | `SecondaryViewsProps` is already native | `src/renderer/ui/secondary-views/SecondaryViewsView.ts` |

`ButtonViewProps`, `IconButtonViewProps`, and `SegmentedControlViewProps` are existing native
aliases used by native code and stories. They may remain as aliases to the relocated public types;
they must no longer import from a face. The `React.*` members inside moved interfaces stay as-is:
the C13 React type-surface cleanup belongs to Epic F.

### Audited deleted-module importers

The following is the module-path audit. These are every source importer/exporter whose import
specifier ends in the deleted face module name, including native files, barrels, and stories. The
same audit must be rerun after edits and return no result for any deleted file path. `ListBox` and
`DataGrid` entries include consumers of their re-export surface, not only `*Props` references.

| Deleted module path | Importers to repoint |
|---|---|
| `uikit/Input/Input` | `editors/env-vars/EnvVarsBodyView.ts`, `editors/graph/GraphBodyView.ts`, `GraphDetailPanelView.ts`, `GraphExpansionSettingsView.ts`, `GraphLegendPanelView.ts`, `editors/grid/index.ts`, `editors/link-editor/index.ts`, `editors/log-view/items/TextInputDialogView.ts`, `editors/mcp-inspector/ToolArgForm.ts`, `editors/notebook/index.ts`, `editors/settings/sections/BrowserProfilesSection.ts`, `McpSection.ts`, `SettingsSections.ts`, `editors/shared/FindBarView.ts`, `editors/storybook/PropertyEditor.ts`, `uikit/index.ts`, `uikit/Autocomplete/AutocompleteView.ts`, `uikit/DateInput/DateInput.ts`, `DateInputView.ts`, `uikit/Input/index.ts`, `Input.story.ts`, `uikit/Menu/MenuView.ts`, `uikit/MultiListBox/MultiListBoxView.ts`, `uikit/MultiSelect/MultiSelectView.ts`, `uikit/PathInput/PathInputView.ts`, `uikit/Select/SelectModel.ts`, `uikit/Select/SelectView.ts` |
| `uikit/IconButton/IconButton` | `editors/base/TextChromeView.ts`, `editors/env-vars/EnvVarsBodyView.ts`, `editors/explorer/BoardsSecondaryView.ts`, `ExplorerSecondaryView.ts`, `editors/graph/GraphBodyView.ts`, `GraphTooltipView.ts`, `editors/rest-client/KeyValueEditorView.ts`, `RequestBuilderView.ts`, `ResponseViewerView.ts`, `RestClientShared.ts`, `editors/text/ScriptPanelView.ts`, `uikit/index.ts`, `uikit/IconButton/index.ts`, `IconButtonView.ts`, `uikit/MultiSelect/MultiSelectView.ts`, `uikit/Notification/NotificationView.ts`, `uikit/Select/SelectView.ts`, `uikit/SplitButton/SplitButtonView.ts`, `uikit/Toolbar/Toolbar.story.ts` |
| `uikit/ListBox/ListBox` | `editors/browser/UrlSuggestionsDropdown.ts`, `editors/mneme-root/MnemeRootEditorView.ts`, `editors/text/ScriptPanel.ts`, `uikit/index.ts`, `uikit/Autocomplete/Autocomplete.story.ts`, `AutocompleteModel.ts`, `uikit/ListBox/index.ts`, `ListBox.tsx` self-surface/comments, `uikit/MultiListBox/MultiListBox.story.ts`, `MultiListBox.ts`, `MultiListBoxModel.ts`, `uikit/MultiSelect/MultiSelect.story.ts`, `MultiSelectModel.ts`, `uikit/Select/Select.tsx`, `SelectModel.ts` |
| `uikit/Button/Button` | `editors/env-vars/EnvVarsBodyView.ts`, `editors/file-diff/FileDiffBodyView.ts`, `editors/graph/GraphLegendPanelView.ts`, `GraphTuningSlidersView.ts`, `editors/rest-client/RequestBuilderView.ts`, `ResponseViewerView.ts`, `editors/settings/sections/DefaultBrowserSection.ts`, `McpSection.ts`, `uikit/index.ts`, `uikit/Button/index.ts`, `ButtonView.ts`, `uikit/SplitButton/SplitButtonView.ts`, `uikit/Toolbar/Toolbar.story.ts` |
| `uikit/Splitter/Splitter` | `editors/git-tree/GitChangesView.ts`, `editors/link-editor/LinkBody.ts`, `editors/link-editor/panels/LinkHostnamesNavigationPanel.ts`, `LinkTagsSecondaryView.ts`, `editors/rest-client/RequestBuilderView.ts`, `RestClientShared.ts`, `editors/storybook/StorybookEditorView.ts`, `editors/text/ScriptPanelView.ts`, `uikit/index.ts`, `uikit/Splitter/index.ts`, `Splitter.story.ts`, `SplitterView.ts` |
| `uikit/Checkbox/Checkbox` | `editors/log-view/items/CheckboxesDialogView.ts`, `editors/mcp-inspector/ToolArgForm.ts`, `editors/rest-client/KeyValueEditorView.ts`, `RequestBuilderView.ts`, `editors/settings/sections/McpSection.ts`, `SettingsSections.ts`, `editors/storybook/PropertyEditor.ts`, `uikit/index.ts`, `uikit/Checkbox/index.ts`, `Checkbox.story.ts`, `CheckboxView.ts` |
| `uikit/DataGrid/DataGrid` | `components/file-grid/FileGrid.ts`, `FileGridView.ts`, `components/git-tree/branch-tree-cell.ts`, `GitTreeModel.ts`, `GitTreeView.ts`, `side-select-cell.ts`, `editors/env-vars/EnvVarsBodyView.ts`, `editors/git-tree/GitChangesView.ts`, `editors/graph/GraphDetailPanelView.ts`, `editors/grid/GridBodyView.ts`, `GridEditor.ts`, `grid-utils.ts`, `editors/log-view/items/GridOutputView.ts`, `ui/dialogs/poppers/grid-context-menu.tsx`, `uikit/DataGrid/index.ts` |
| `uikit/Textarea/Textarea` | `editors/mcp-inspector/ToolArgForm.ts`, `editors/mneme-root/MnemeRootEditorView.ts`, `editors/rest-client/KeyValueEditorView.ts`, `RequestBuilderView.ts`, `RestClientShared.ts`, `editors/settings/sections/FileSearchSection.ts`, `uikit/index.ts`, `uikit/Textarea/index.ts`, `Textarea.story.ts`, `TextareaView.ts` |
| `uikit/SegmentedControl/SegmentedControl` | `editors/base/PageToolbarView.ts`, `editors/env-vars/EnvVarsBodyView.ts`, `editors/mcp-inspector/McpInspectorView.ts`, `editors/rest-client/RequestBuilderView.ts`, `ResponseViewerView.ts`, `editors/storybook/StorybookEditorView.ts`, `uikit/index.ts`, `uikit/SegmentedControl/index.ts`, `SegmentedControl.story.ts`, `SegmentedControlView.ts`, `uikit/Toolbar/Toolbar.story.ts` |
| `uikit/Slider/Slider` | `editors/graph/GraphTuningSlidersView.ts`, `editors/video/AudioControls.ts`, `uikit/index.ts`, `uikit/Slider/index.ts`, `Slider.story.ts`, `SliderView.ts` |
| `uikit/Autocomplete/Autocomplete` | `editors/rest-client/KeyValueEditorView.ts`, `uikit/index.ts`, `uikit/Autocomplete/index.ts`, `Autocomplete.tsx` self-surface, `AutocompleteView.ts` |
| `uikit/Select/Select` | `editors/graph/GraphExpansionSettingsView.ts`, `uikit/index.ts`, `uikit/Select/index.ts`, `Select.tsx` self-surface, `SelectView.ts` |
| `uikit/SelectableRow/SelectableRow` | `editors/env-vars/EnvVarsBodyView.ts`, `uikit/index.ts`, `uikit/SelectableRow/index.ts`, `SelectableRow.story.ts`, `SelectableRowView.ts` |
| `uikit/Tag/Tag` | `uikit/TagsInput/TagsInputView.ts`, `uikit/index.ts`, `uikit/Tag/index.ts`, `Tag.story.ts`, `TagView.ts` |
| `uikit/Dot/Dot` | `uikit/index.ts`, `uikit/Dot/index.ts`, `Dot.story.ts`, `DotView.ts` |
| `uikit/Spacer/Spacer` | `uikit/index.ts`, `uikit/Spacer/index.ts`, `Spacer.story.ts`, `uikit/Toolbar/Toolbar.story.ts`, `AutocompleteView.ts` stylesheet-only reference is not a module importer and is unchanged |
| `uikit/Spinner/Spinner` | `uikit/index.ts`, `uikit/Spinner/index.ts`, `Spinner.story.ts`, `SpinnerView.ts` |
| `ui/secondary-views/SecondaryViews` | `ui/secondary-views/SecondaryViews.tsx` self-surface; the native view has no external importer |

The four story paths needing special care are `uikit/Toolbar/Toolbar.story.ts` (it currently builds
React elements for `Button`, `IconButton`, `SegmentedControl`, and `Spacer`) and the individual
stories `Button.story.ts`, `IconButton.story.ts`, `SegmentedControl.story.ts`, and `Spacer.story.ts`.
The individual stories already use native `view:` arms in this checkout; their remaining type
imports must move to native destinations. `Toolbar.story.ts` must compose `ButtonView`,
`IconButtonView`, `SegmentedControlView`, and `SpacerView` directly while retaining the Toolbar
story and its controls.

## Implementation Plan

### 1. Relocate type definitions in importer-risk order

- Move the complete `InputProps`, `IconButtonProps`, `ButtonProps`, `SplitterProps`, `CheckboxProps`,
  `TextareaProps`, `SliderProps`, `SelectableRowProps`, `TagProps`, `DotProps`, `SpacerProps`, and
  `SpinnerProps` declarations, including their comments and `React.*` members, into the listed
  native `*View.ts` files. Add only the type imports those declarations already require.
- Move both `ISegment` and `SegmentedControlProps` into `SegmentedControlView.ts`; retain the
  existing `SEGMENT_KEY` value there and keep the `SegmentedControlViewProps` alias usable.
- Treat `ListBox/types.ts`, `DataGrid/types.ts`, `AutocompleteModel.ts`, and `SelectModel.ts` as
  the canonical native type homes already established by the current implementation. Do not copy
  or duplicate their declarations into the views. Repoint all imports and public type exports to
  those homes.
- Move `SecondaryViewsProps` nowhere: it is already declared in `SecondaryViewsView.ts`; remove
  only the face's React wrapper and repoint its type re-export if needed.

Before → after for a moved interface:

```tsx
// Before: src/renderer/uikit/Button/Button.tsx
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { /* ... */ }
```

```ts
// After: src/renderer/uikit/Button/ButtonView.ts
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { /* same body */ }
export type ButtonViewProps = ButtonProps;
```

### 2. Repoint native consumers, barrels, and stories

Replace imports from a deleted face with the exact native owner path. Update the native view's own
type import first, then all editor/component consumers in the audited lists. Change each local
UIKit index and `src/renderer/uikit/index.ts` to export types from `*View.ts`, `types.ts`, or the
model as appropriate. Remove runtime exports whose only implementation was the deleted face; keep
native values such as `LIST_ITEM_KEY` and `SEGMENT_KEY` exported from their native modules.

Before → after for a barrel:

```ts
// Before: src/renderer/uikit/Button/index.ts
export { Button } from "./Button";
export type { ButtonProps } from "./Button";
```

```ts
// After
export type { ButtonProps } from "./ButtonView";
```

The same rule applies to `Autocomplete`, `Select`, `ListBox`, and `DataGrid`: preserve their
native view/type surfaces, but do not leave an export resolving to a deleted `.tsx` implementation.

### 3. Convert the remaining story importer to native composition

In `src/renderer/uikit/Toolbar/Toolbar.story.ts`, remove the React and four face imports. Keep the
story's `ToolbarView` and `view:` arm, but create the demo label with `createTextElement` and own
native `ButtonView`, `IconButtonView`, `SpacerView`, and `SegmentedControlView` children from the
`ToolbarDemoView` lifecycle. Append their roots to the mounted `ToolbarView` root in the existing
visual order, update them from `onUpdate`, and dispose/release them with the parent. Pass
`children: null` to `ToolbarView`; its existing React compatibility host remains untouched.

Before → after for the story content:

```ts
// Before: Toolbar.story.ts
return React.createElement(React.Fragment, null, React.createElement(Button, null, "Action"), ...);
```

```ts
// After: Toolbar.story.ts
this.toolbarView?.root.append(this.demoLabel, this.buttonView.root, this.iconButtonView.root, ...);
// Each child is a ButtonView/IconButtonView/SpacerView/SegmentedControlView owned and updated by
// ToolbarDemoView; ToolbarView receives children: null.
```

Repoint the individual Button/IconButton stories to `ButtonViewProps`/`IconButtonViewProps` as
already native, and change `SegmentedControl.story.ts` and `Spacer.story.ts` to import their types
from `SegmentedControlView.ts` and `SpacerView.ts`. Do not delete or rename any story.

### 4. Delete only the 18 dead faces

After all imports and exports compile against native owners, delete exactly:

`src/renderer/uikit/Input/Input.tsx`, `IconButton/IconButton.tsx`, `ListBox/ListBox.tsx`,
`Button/Button.tsx`, `Splitter/Splitter.tsx`, `Checkbox/Checkbox.tsx`, `DataGrid/DataGrid.tsx`,
`Textarea/Textarea.tsx`, `SegmentedControl/SegmentedControl.tsx`, `Slider/Slider.tsx`,
`Autocomplete/Autocomplete.tsx`, `Select/Select.tsx`, `SelectableRow/SelectableRow.tsx`,
`Tag/Tag.tsx`, `Dot/Dot.tsx`, `Spacer/Spacer.tsx`, `Spinner/Spinner.tsx`, and
`src/renderer/ui/secondary-views/SecondaryViews.tsx`.

Do not delete stories, stylesheets, native views, or the existing native model/type modules.

### 5. Verify structural and build acceptance criteria

- Grep `return mountVanilla(` under `src/renderer` and confirm it returns no matches.
- Grep every deleted module path, including both slash/case forms used by the source, and confirm
  no file imports or re-exports it. When a cheap search and the source graph disagree, read the
  source as required by E15-3/C16 rather than adding a broader regex.
- Confirm every native view that previously imported a face type imports the relocated type from
  its native owner, with no replacement by `any` or a duplicate interface.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`.
- Confirm the four named stories retain `view:` declarations and that `Toolbar.story.ts` still
  renders its complete native demo. Do not add unit tests or a test harness.

## Concerns

- C12 is the primary risk: deleting a face before finding a secondary exported type breaks native
  consumers that never rendered React. The module-path audit is authoritative for deletion.
- C13 is explicitly out of scope. Leave all `React.*` type references and do not change React
  imports merely because a type moved into a `.ts` file.
- The face count in this task is the user-supplied 18-face baseline. `GitTree.tsx` and the other
  editor faces were handled by US-1168; `BoardScreenshot.tsx` and `NotebookBody.tsx` were handled
  by US-1165 and are not part of this deletion set.
- The four stories must remain present. `Toolbar.story.ts` is the runtime-import edge that needs a
  native composition port; `Panel.story.tsx` and `Text.story.tsx` are deliberate Epic F survivors
  and must remain untouched.

## Acceptance Criteria

- [x] `doc/tasks/US-1171-retire-faces/README.md` exists and records the exact relocation plan.
- [x] Exactly the 18 listed face files are deleted; no story is deleted.
- [x] Every type formerly supplied by a face remains exported from its native destination and all
      audited importers compile against that destination.
- [x] `Toolbar.story.ts` and the Button, IconButton, SegmentedControl, and Spacer stories retain
      working `view:` arms and no longer import a deleted face.
- [x] `grep -rl "return mountVanilla(" --include=*.tsx src/renderer` returns nothing.
- [x] No source file imports or re-exports a deleted module path.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- [x] `Panel.tsx`, `Text.tsx`, the residual overlay/error files, `mount.tsx`, `ExcalidrawIsland.tsx`,
      `GlobalStyles.tsx`, the React type surface, and `doc/active-work.md` are unchanged by this task.

## Files Changed Summary

| Category | Exact paths |
|---|---|
| Task record | `doc/tasks/US-1171-retire-faces/README.md` |
| Native type owners | `src/renderer/uikit/{Input,IconButton,Button,Splitter,Checkbox,Textarea,SegmentedControl,Slider,SelectableRow,Tag,Dot,Spacer,Spinner}/*View.ts`; `src/renderer/uikit/{ListBox,DataGrid}/*types.ts`; `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`; `src/renderer/uikit/Select/SelectModel.ts`; `src/renderer/ui/secondary-views/SecondaryViewsView.ts` |
| Barrel surfaces | `src/renderer/uikit/index.ts`; `src/renderer/uikit/{Input,IconButton,ListBox,Button,Splitter,Checkbox,DataGrid,Textarea,SegmentedControl,Slider,Autocomplete,Select,SelectableRow,Tag,Dot,Spacer,Spinner}/index.ts` |
| Story migration | `src/renderer/uikit/Toolbar/Toolbar.story.ts`; `Button.story.ts`; `IconButton.story.ts`; `SegmentedControl.story.ts`; `Spacer.story.ts` |
| Importer repoints | The exact editor, component, UI, and native importer paths listed in the audited deleted-module table above |
| Deleted faces | The 18 exact `.tsx` paths listed in Implementation Plan step 4 |

## Files explicitly requiring no changes

`src/renderer/uikit/Panel/Panel.tsx`, `src/renderer/uikit/Text/Text.tsx`,
`src/renderer/uikit/Popover/PopoverView.tsx`, `src/renderer/uikit/Dialog/DialogView.tsx`,
`src/renderer/uikit/Menu/WithMenu.tsx`, `src/renderer/uikit/Icon/Icon.tsx`,
`src/renderer/uikit/shared/mount.tsx`, `src/renderer/uikit/shared/fill-slot.ts`,
`src/renderer/theme/GlobalStyles.tsx`, `src/renderer/editors/draw/ExcalidrawIsland.tsx`,
`src/renderer/editors/base/EditorError.tsx`, `src/renderer/ui/app/EditorErrorBoundary.tsx`,
`doc/active-work.md`, all files under `EverGreen/web-wiki`, `EverGreen/wiki`, and
`EverGreen/worklog`, both evergreen JSON files, and all unit-test/test-harness files.

---

## Verification record (2026-08-28)

**Gates:** `npm run typecheck`, `npm run lint`, `npm run build-prod` — all pass.

**All 18 faces deleted.** `grep -rl "return mountVanilla(" --include=*.tsx src/renderer` returns
nothing. Props interfaces moved to the sibling native `*View.ts` modules (segmented types to
`SegmentedControlView.ts`; ListBox/DataGrid types and the Autocomplete/Select models kept their
native homes). The four stories that rendered a face (`Button`, `IconButton`, `SegmentedControl`,
`Spacer`) retain working `view:` arms; the Toolbar story now composes native controls.

**Measured:** JSX markers **22 → 10** across the whole renderer; non-story `.tsx` 32 → 14 files.
React importers 103 → 92.

**Live pass, after a cold dev-server restart** — the presence half of closing statement 2 is that the
props *moved* rather than vanished, so what matters is that slot-driven content still renders:

| Check | Result |
|---|---|
| React roots app-wide | **1** (`GlobalStyles`) |
| Visible page tabs / with text | 6 / **6** |
| Sidebar tree items / with text | 18 / **18** |
| Buttons / with content (text or svg) | 36 / **36** |
| Any editor crashed | no |
| Body text length | 12,286 chars |

Tab labels, tree item labels and button contents all arrive through the slot system, so their being
populated is the evidence that the type relocation and the face deletions did not break rendering.

**Not verified:** the four stories were repointed and compile, but the storybook editor was not opened,
so none of the four was rendered. That is the cheapest remaining human check for this task.
