# US-1218 — Merge the types-only component files

## Goal

Move the 17 component props shells identified below into their owning `*View.ts`
files, preserving all type names, public exports, and import behavior. This is EPIC-077 strand-2
shape work: it closes none of the epic's four statements; its only automated signal is
`typecheck` + `lint` + `build-prod`, and “the files are smaller” is the outcome rather than a
behavioral property.

## Background

EPIC-077 §C-3 says strand 2 (US-1217 through US-1220) closes nothing and should be cut first if
the epic must shrink. EPIC-077 §C-2 correction 6 says the plan's “17 types-only files” is not a
sweep instruction: the current `uikit/` tree has 29 declaration-free `.ts` files, and only about
17 are in the intended class. The correction explicitly names four large shared modules that must
not be folded into a view:

- `src/renderer/uikit/Tree/types.ts` — 393 lines
- `src/renderer/uikit/VirtualGrid/types.ts` — 224 lines
- `src/renderer/uikit/ListBox/types.ts` — 186 lines
- `src/renderer/uikit/DataGrid/types.ts` — 82 lines

EPIC-077 §C-4 names US-1218 as the individually-scoped merge task. This task is sequenced **after
US-1217**: that task lifts the shared Escape handling and edits the same application dialog views
that this task would otherwise rewrite. In particular, `DialogProps` will gain `onEscape` from
US-1217; implementation must re-read `src/renderer/uikit/Dialog/Dialog.ts` after US-1217 lands and
move the then-current declaration, rather than trusting this document's current field list.

EPIC-077 §C-5 warns that strand 2 has no failure signal: a wrong file merge normally produces only a compile error or no
signal at all. A public export-path change would be an API change, so this document records every
direct importer and checks both local and root `index.ts` barrels.

The dashboard is intentionally unchanged: EPIC-077 already lists this task, and the request for
this investigation explicitly says not to add another dashboard entry.

### UIKit authoring-rule verdict

`src/renderer/uikit/CLAUDE.md` permits and supports this task. Its “Folder structure” section
shows the owning view as the component file; Rule 8's “Naming and file layout” section co-locates
component files in the component folder; and the “Component file template” places the exported
props interface immediately above the `VanillaView` class in the `*View.ts`. No UIKit rule
requires a separate props file. Rule 9's props-pump convention also treats props as the view's
construction-time contract. Therefore the verdict is **proceed with the merge scope below**.

### Census

The census was re-derived from the current working tree on 2026-08-30. This command operationalizes
EPIC-077's “declaration-free” count: it scans `.ts` files below `uikit/`, omits barrel files,
stories, the design-token constants module, and the image raster runtime helper, then retains files
with no class/function declaration. Trait-key constants remain in the result because their files
are type/vocabulary modules and are explicitly classified rather than silently discarded.

```powershell
$files = rg --files src/renderer/uikit -g '*.ts' | Sort-Object
$rows = @()
foreach ($file in $files) {
    if ($file -match '\\index\.ts$' -or
        $file -match '\.story\.ts$' -or
        $file -match '\\tokens\.ts$' -or
        $file -match '\\image-raster\.ts$') { continue }
    $source = Get-Content -Raw $file
    if ($source -notmatch '(?m)^\s*(export\s+)?(abstract\s+)?(class|function)\b') {
        $rows += [pscustomobject]@{ File = $file; Lines = (Get-Content $file).Count }
    }
}
$rows | Format-Table -AutoSize
"COUNT=$($rows.Count)"
```

The command returned **COUNT=29**. The complete result, classified exactly once, is below.

### Complete classification: 29 declaration-free files

#### Merge — 17 files

Each is a converted component's props shell whose declarations belong in the listed `*View.ts`.

| Shell to remove | Target `*View.ts` | Declaration kept/moved |
|---|---|---|
| `src/renderer/uikit/Breadcrumb/Breadcrumb.ts` | `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts` | `BreadcrumbProps` |
| `src/renderer/uikit/CategoryList/CategoryList.ts` | `src/renderer/uikit/CategoryList/CategoryListView.ts` | `CategoryListProps` |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts` | `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` | `CollapsiblePanelProps`, `CollapsiblePanelStackProps` |
| `src/renderer/uikit/DateInput/DateInput.ts` | `src/renderer/uikit/DateInput/DateInputView.ts` | `DateInputProps` |
| `src/renderer/uikit/Dialog/Dialog.ts` | `src/renderer/uikit/Dialog/DialogView.ts` | `DialogPosition`, `DialogProps` |
| `src/renderer/uikit/Dialog/DialogContent.ts` | `src/renderer/uikit/Dialog/DialogContentView.ts` | `DialogContentProps` |
| `src/renderer/uikit/Divider/Divider.ts` | `src/renderer/uikit/Divider/DividerView.ts` | `DividerProps` |
| `src/renderer/uikit/Label/Label.ts` | `src/renderer/uikit/Label/LabelView.ts` | `LabelProps` |
| `src/renderer/uikit/Minimap/Minimap.ts` | `src/renderer/uikit/Minimap/MinimapView.ts` | `MinimapProps` |
| `src/renderer/uikit/MultiListBox/MultiListBox.ts` | `src/renderer/uikit/MultiListBox/MultiListBoxView.ts` | `MultiListBoxProps<T>` |
| `src/renderer/uikit/Notification/Notification.ts` | `src/renderer/uikit/Notification/NotificationView.ts` | `NotificationSeverity`, `NotificationProps` |
| `src/renderer/uikit/Progress/ProgressOverlay.ts` | `src/renderer/uikit/Progress/ProgressOverlayView.ts` | `ProgressOverlayProps` |
| `src/renderer/uikit/ProgressBar/ProgressBar.ts` | `src/renderer/uikit/ProgressBar/ProgressBarView.ts` | `Variant`, `ProgressBarProps` |
| `src/renderer/uikit/SplitButton/SplitButton.ts` | `src/renderer/uikit/SplitButton/SplitButtonView.ts` | `SplitButtonProps` |
| `src/renderer/uikit/TagsInput/TagsInput.ts` | `src/renderer/uikit/TagsInput/TagsInputView.ts` | `TagsInputProps` |
| `src/renderer/uikit/Toolbar/Toolbar.ts` | `src/renderer/uikit/Toolbar/ToolbarView.ts` | `ToolbarProps` |
| `src/renderer/uikit/TruncatedText/TruncatedText.ts` | `src/renderer/uikit/TruncatedText/TruncatedTextView.ts` | `TruncatedTextProps` |

`CollapsiblePanelStack.ts` contains two related props interfaces, and `Dialog.ts`,
`Notification.ts`, and `ProgressBar.ts` contain small component-local type aliases in addition
to the props interface. Those aliases move with the props contract; they are not shared modules.

#### Keep, shared — 6 files; no changes

The consumer count below is the number of distinct current source files with a direct import of the
file, including the component's own barrel/story/root barrel where those are direct importers.
The counts make the sharing visible; the named consumers are representative source consumers.

| File | Lines | Direct consumer count | Representative consumers | Reason to keep |
|---|---:|---:|---|---|
| `src/renderer/uikit/Tree/types.ts` | 393 | 12 | `src/renderer/uikit/Tree/TreeModel.ts`; `src/renderer/uikit/Tree/TreeView.ts`; `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Shared tree item shape, row types, and trait key used across the tree implementation and consumers. Explicit EPIC-077 correction-6 exclusion. |
| `src/renderer/uikit/VirtualGrid/types.ts` | 224 | 13 | `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts`; `src/renderer/uikit/VirtualGrid/VirtualGridView.ts`; `src/renderer/editors/link-editor/LinksTilesView.ts` | Shared geometry, cell, render-info, and dirty-set vocabulary used by both grid engines and consumers. Explicit exclusion. |
| `src/renderer/uikit/ListBox/types.ts` | 186 | 34 | `src/renderer/uikit/ListBox/ListBoxModel.ts`; `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`; `src/renderer/components/file-list/FileListView.ts` | Shared list item/source/drag vocabulary used by ListBox, Autocomplete, MultiListBox, Select, and application consumers. Explicit exclusion. |
| `src/renderer/uikit/DataGrid/types.ts` | 82 | 6 | `src/renderer/uikit/DataGrid/DataGridView.ts`; `src/renderer/editors/grid/components/ColumnsOptions.ts`; `src/renderer/editors/log-view/items/GridOutputView.ts` | av-grid boundary and DataGrid contract re-exported across the grid implementation and editor consumers. Explicit exclusion. |
| `src/renderer/uikit/RadioGroup/RadioGroup.ts` | 27 | 5 | `src/renderer/uikit/RadioGroup/RadioGroupView.ts`; `src/renderer/editors/grid/components/CsvOptions.ts`; `src/renderer/editors/log-view/items/RadioboxesDialogView.ts` | Contains the shared `IRadio` vocabulary and exported `RADIO_KEY` trait registration as well as props; it is not a props-only shell. |
| `src/renderer/uikit/Menu/types.ts` | 1 | 19 | `src/renderer/uikit/Menu/MenuModel.ts`; `src/renderer/ui/tabs/PageTabView.ts`; `src/renderer/editors/html/index.ts` | One-line re-export of the shared `MenuItem` vocabulary used across menus and application surfaces. |

These six files are the complete shared no-change list. The first four are the four correction-6
modules that must not be folded into a view; `RadioGroup.ts` and `Menu/types.ts` are additionally
shared by their current consumers.

### Keep-other boundary

The Keep-other rule is: the merge criterion is the converted **root component's**
`<Folder>/<Folder>.ts` shell left behind with that root component's props contract, not every
props-only file in a folder that contains several components. Nested row contracts, companion
component shells outside that root-file shape, payload records, and barrels therefore remain
explicit no-change files. Each row below cites this boundary or its more specific reason.

#### Keep, other — 6 files; no changes

| File | What it is, and why it is outside this merge |
|---|---|
| `src/renderer/uikit/ListBox/ListItem.ts` | [Keep-other boundary](#keep-other-boundary): nested ListBox row prop contract for `ListItemView`, not the root ListBox view contract. Its public type export remains unchanged. |
| `src/renderer/uikit/ListBox/SectionItem.ts` | [Keep-other boundary](#keep-other-boundary): nested ListBox section-row prop contract for `SectionItemView`, not the root ListBox view contract. |
| `src/renderer/uikit/Menu/Menu.ts` | [Keep-other boundary](#keep-other-boundary): one-line `MenuProps` re-export from `MenuModel`; it is a barrel, not a props declaration. |
| `src/renderer/uikit/Notification/AlertItem.ts` | [Keep-other boundary](#keep-other-boundary): `AlertData` payload record used by the alert bar/item path, not `NotificationProps` for `NotificationView`. |
| `src/renderer/uikit/Tree/SectionItem.ts` | [Keep-other boundary](#keep-other-boundary): nested tree section-row prop contract for `SectionItemView`, not the shared `Tree/types.ts` vocabulary or the root Tree view contract. |
| `src/renderer/uikit/Tree/TreeItem.ts` | [Keep-other boundary](#keep-other-boundary): nested tree row prop contract for `TreeItemView`, not the shared `Tree/types.ts` vocabulary or the root Tree view contract. |

## Implementation Plan

### 0. Wait for US-1217

- Do not begin this implementation until US-1217 is complete and its edits to the fourteen
  application dialog views have landed.
- Re-read `src/renderer/uikit/Dialog/Dialog.ts` at that point. Move the then-current `DialogProps`,
  including US-1217's `onEscape` member, into `DialogView.ts`; the current census table is not a
  substitute for that final source read.

### 1. Move only the 17 listed declarations

- For each Merge row, move the complete type declaration(s), comments, generic parameters, and
  type-only dependencies into the named `*View.ts`.
- Preserve the exported names and their structural definitions exactly. Do not narrow props,
  change defaults, rename fields, change runtime code, or alter the `Tree`, `VirtualGrid`,
  `ListBox`, or `DataGrid` shared modules.
- Keep component-local aliases beside the moved interface: `DialogPosition`, `NotificationSeverity`,
  and `ProgressBar`'s `Variant` remain available to the target view. Preserve
  `TruncatedTextViewProps`'s existing alias shape after `TruncatedTextProps` moves, because the
  current story imports that view-local alias.

Before and after for a representative target:

```ts
// Before: src/renderer/uikit/Breadcrumb/BreadcrumbView.ts
import type { BreadcrumbProps } from "./Breadcrumb";
export class BreadcrumbView extends VanillaView<BreadcrumbProps> {
```

```ts
// After: src/renderer/uikit/Breadcrumb/BreadcrumbView.ts
export interface BreadcrumbProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    // exact existing fields and comments from Breadcrumb.ts
}

export class BreadcrumbView extends VanillaView<BreadcrumbProps> {
```

The same rule applies to each target; imports needed only by the moved type become type-only
imports in the target view, and the old shell is deleted only after all importers are moved.

Every rewritten non-barrel consumer must use `import type`, even when its new specifier points at a
`*View.ts`: otherwise the consumer would load the view class and its co-located CSS for a type-only
use. The current importer census checked this risk: all **56 of 56** direct `import` occurrences
from the 17 Merge shells are already `import type`; the other **17 of 73** direct shell edges are
`export type` barrel re-exports. No current shell edge is a value import. The implementation must
retain that split after rewriting: direct consumers use `import type`, and barrels use `export type`.

### 2. Update every direct importer of each Merge shell

The following is the complete direct-importer inventory from the current source. For each listed
importer, a type import from the deleted shell changes to the target `*View.ts`; an importer that
is the target view drops its shell import and uses the local declaration; a story or barrel changes
its relative source to the target view.

- At every rewritten non-barrel call site, write and retain the `import type` form explicitly. Do
  not change a type-only import into `import { ... } from ".../*View"`; the view module imports its
  stylesheet and would add runtime view/CSS weight. The existing source check found **56/56**
  direct import occurrences already use `import type`; the 17 remaining direct edges are `export
  type` barrel re-exports and must remain type-only re-exports.

| Deleted shell | Direct importers (current) | Import becomes |
|---|---|---|
| `Breadcrumb/Breadcrumb.ts` | `src/renderer/editors/notebook/index.ts`; `src/renderer/uikit/Breadcrumb/Breadcrumb.story.ts`; `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts`; `src/renderer/uikit/Breadcrumb/index.ts` | Notebook type import → `../../uikit/Breadcrumb/BreadcrumbView`; story/barrel → `./BreadcrumbView`; target view import → local declaration |
| `CategoryList/CategoryList.ts` | `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts`; `src/renderer/editors/link-editor/panels/LinkTagsPanel.ts`; `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts`; `src/renderer/uikit/CategoryList/CategoryList.story.ts`; `src/renderer/uikit/CategoryList/CategoryListView.ts`; `src/renderer/uikit/CategoryList/index.ts` | The three editor type imports → their matching `CategoryListView`; story/barrel → `./CategoryListView`; target view import → local declaration |
| `CollapsiblePanelStack/CollapsiblePanelStack.ts` | `src/renderer/ui/secondary-views/SecondaryViewsView.ts`; `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.story.ts`; `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts`; `src/renderer/uikit/CollapsiblePanelStack/index.ts` | Secondary views type import → `../../uikit/CollapsiblePanelStack/CollapsiblePanelStackView`; story/barrel → `./CollapsiblePanelStackView`; target view import → local declarations |
| `DateInput/DateInput.ts` | `src/renderer/uikit/DateInput/DateInput.story.ts`; `src/renderer/uikit/DateInput/DateInputView.ts`; `src/renderer/uikit/DateInput/index.ts` | Story/barrel → `./DateInputView`; target view import → local declaration |
| `Dialog/Dialog.ts` | `src/renderer/editors/link-editor/EditLinkDialogView.ts`; `src/renderer/ui/dialogs/CommitDialogView.ts`; `src/renderer/ui/dialogs/ConfirmationDialogView.ts`; `src/renderer/ui/dialogs/CreateBoardDialogView.ts`; `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts`; `src/renderer/ui/dialogs/InputDialogView.ts`; `src/renderer/ui/dialogs/LibrarySetupDialogView.ts`; `src/renderer/ui/dialogs/NamespaceCollisionDialogView.ts`; `src/renderer/ui/dialogs/OpenUrlDialogView.ts`; `src/renderer/ui/dialogs/PasswordDialogView.ts`; `src/renderer/ui/dialogs/RegisterToolsetDialogView.ts`; `src/renderer/ui/dialogs/TextDialogView.ts`; `src/renderer/ui/dialogs/TorInfoDialogView.ts`; `src/renderer/ui/dialogs/TrustBoardDialogView.ts`; `src/renderer/uikit/Dialog/Dialog.story.ts`; `src/renderer/uikit/Dialog/DialogView.ts`; `src/renderer/uikit/Dialog/index.ts` | The 14 application dialog type imports → `../../uikit/Dialog/DialogView`; story/barrel → `./DialogView`; target view import → local `DialogPosition`/`DialogProps` |
| `Dialog/DialogContent.ts` | `src/renderer/uikit/Dialog/Dialog.story.ts`; `src/renderer/uikit/Dialog/DialogContentView.ts`; `src/renderer/uikit/Dialog/index.ts`; `src/renderer/uikit/index.ts` | Story/barrels/root type export → `DialogContentView`; target view import → local declaration. The 14 application dialog views already import `DialogContentView` for the value and are not shell importers. |
| `Divider/Divider.ts` | `src/renderer/uikit/Divider/Divider.story.ts`; `src/renderer/uikit/Divider/DividerView.ts`; `src/renderer/uikit/Divider/index.ts` | Story/barrel → `./DividerView`; target view import → local declaration |
| `Label/Label.ts` | `src/renderer/editors/storybook/PropertyEditor.ts`; `src/renderer/uikit/Label/Label.story.ts`; `src/renderer/uikit/Label/LabelView.ts`; `src/renderer/uikit/Label/index.ts` | PropertyEditor type import → `../../uikit/Label/LabelView`; story/barrel → `./LabelView`; target view import → local declaration |
| `Minimap/Minimap.ts` | `src/renderer/editors/markdown/MarkdownBodyView.ts`; `src/renderer/uikit/Minimap/Minimap.story.ts`; `src/renderer/uikit/Minimap/MinimapView.ts`; `src/renderer/uikit/Minimap/index.ts` | Markdown type import → `../../uikit/Minimap/MinimapView`; story/barrel → `./MinimapView`; target view import → local declaration |
| `MultiListBox/MultiListBox.ts` | `src/renderer/uikit/MultiListBox/MultiListBox.story.ts`; `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts`; `src/renderer/uikit/MultiListBox/MultiListBoxView.ts`; `src/renderer/uikit/MultiListBox/index.ts`; `src/renderer/uikit/MultiSelect/MultiSelectView.ts` | MultiSelect type import → `../MultiListBox/MultiListBoxView`; model/story/barrel → `./MultiListBoxView`; target view import → local declaration |
| `Notification/Notification.ts` | `src/renderer/uikit/Notification/Notification.story.ts`; `src/renderer/uikit/Notification/NotificationView.ts`; `src/renderer/uikit/Notification/index.ts` | Story/barrel → `./NotificationView`; target view import → local declarations |
| `Progress/ProgressOverlay.ts` | `src/renderer/uikit/Progress/ProgressOverlayView.ts` | Target view import → local declaration |
| `ProgressBar/ProgressBar.ts` | `src/renderer/uikit/ProgressBar/ProgressBar.story.ts`; `src/renderer/uikit/ProgressBar/ProgressBarView.ts`; `src/renderer/uikit/ProgressBar/index.ts` | Story/barrel → `./ProgressBarView`; target view import → local declarations |
| `SplitButton/SplitButton.ts` | `src/renderer/uikit/SplitButton/SplitButton.story.ts`; `src/renderer/uikit/SplitButton/SplitButtonView.ts`; `src/renderer/uikit/SplitButton/index.ts` | Story/barrel → `./SplitButtonView`; target view import → local declaration |
| `TagsInput/TagsInput.ts` | `src/renderer/uikit/TagsInput/TagsInput.story.ts`; `src/renderer/uikit/TagsInput/TagsInputView.ts`; `src/renderer/uikit/TagsInput/index.ts` | Story/barrel → `./TagsInputView`; target view import → local declaration |
| `Toolbar/Toolbar.ts` | `src/renderer/editors/storybook/StorybookEditorView.ts`; `src/renderer/uikit/Toolbar/Toolbar.story.ts`; `src/renderer/uikit/Toolbar/ToolbarView.ts`; `src/renderer/uikit/Toolbar/index.ts` | Storybook type import → `../../uikit/Toolbar/ToolbarView`; story/barrel → `./ToolbarView`; target view import → local declaration |
| `TruncatedText/TruncatedText.ts` | `src/renderer/uikit/TruncatedText/TruncatedTextView.ts`; `src/renderer/uikit/TruncatedText/index.ts` | Target view import → local declaration; barrel → `./TruncatedTextView` |

### 3. Preserve the public API through the barrels

The following props are re-exported by `src/renderer/uikit/index.ts` and therefore are public
surface types: `CollapsiblePanelProps`, `CollapsiblePanelStackProps`, `MinimapProps`,
`BreadcrumbProps`, `ToolbarProps`, `SplitButtonProps`, `DateInputProps`, `LabelProps`,
`DividerProps`, `ProgressBarProps`, `TagsInputProps`, `DialogProps`, `DialogPosition`,
`DialogContentProps`, `NotificationProps`, `NotificationSeverity`,
`CategoryListProps`, `MultiListBoxProps`, and `TruncatedTextProps`. `ProgressOverlayProps` is not
re-exported by the root barrel. `DialogContentProps` is public through the root and Dialog
barrels, so those re-exports must move to `DialogContentView` with the declaration.

Update each affected component folder's `index.ts` to re-export Merge types from its `*View.ts`.
Leave the public export specifiers in `src/renderer/uikit/index.ts` unchanged where they resolve
through those folder barrels; its direct `DialogContentProps` export also moves to the view while
preserving its public specifier. This preserves consumers such as
`src/renderer/editors/link-editor/index.ts`, which imports `BreadcrumbProps` through the
`Breadcrumb` folder barrel. Do not change any public specifier from `../../uikit`,
`../../uikit/<Component>`, or another existing public path; only the barrel's implementation source
changes from the deleted shell to the view.

Before and after for a barrel:

```ts
// Before
export type { BreadcrumbProps } from "./Breadcrumb";

// After
export type { BreadcrumbProps } from "./BreadcrumbView";
```

The implementation must also check `Dialog/index.ts`, `Notification/index.ts`, `Menu/index.ts`,
`ListBox/index.ts`, `Tree/index.ts`, and the root `uikit/index.ts` for accidental re-export or
specifier changes. The latter four are especially important because they expose or consume the
Keep files; they must remain no-change modules for this task.

### 4. Delete only the 17 Merge shells and verify the final graph

- Delete the 17 shell files in the Merge table after their declarations and importers have moved.
- Do not edit any of the 12 Keep files listed in the classification tables.
- Re-run the census command and the resolved-import scan. There must be no remaining import of a
  deleted shell, and every affected folder/root barrel must still export the same public names.
- Inspect the diff for source scope before running verification. This task document is the only
  file changed during the investigation phase; implementation must not absorb sibling-task edits.

## Concerns / Open Questions

There are no unresolved design questions for the documented scope. The important resolved boundary
is that “types-only” is not synonymous with “merge every file containing interfaces.” The four
large shared modules, `RadioGroup.ts`, and `Menu/types.ts` are shared; nested row contracts, the
alert payload, and the `Menu/Menu.ts` barrel are other no-change files. Broadening the merge to
those files would violate the exact class or public sharing boundary recorded above.

The primary implementation risk is import graph/API drift. Direct shell imports from application
files must become direct `import type` view-file type imports, while existing public barrel specifiers must stay
stable. A compile error from a missed deleted-shell import is discoverable; changing a public export
path is an API change and is not an acceptable cleanup.

US-1217 is a prerequisite, not parallel work. Its dialog-view edits must land first; then this task
must re-read `DialogProps` and move the version that includes `onEscape`.

## Acceptance Criteria

- [ ] The 17 Merge shells are deleted and their complete type declarations live in the exact target
      `*View.ts` files named in the Merge table.
- [ ] All direct importers in the importer inventory are updated; no source import resolves to a
      deleted shell.
- [ ] Every rewritten non-barrel consumer remains an `import type` when its type import moves to a
      `*View.ts`; barrel edges remain `export type`. No type-only consumer gains a runtime view/CSS
      dependency.
- [ ] US-1217 is complete before implementation starts, and `DialogProps` is re-read at that point
      so its `onEscape` member is moved with the current declaration.
- [ ] Every public props/type name exported before through the `uikit` root or component barrels
      remains exported under the same public import specifier, including `DialogContentProps` from
      the root and Dialog barrels.
- [ ] The six Keep, shared files and six Keep, other files are unchanged. In particular,
      `Tree/types.ts`, `VirtualGrid/types.ts`, `ListBox/types.ts`, and `DataGrid/types.ts` are
      untouched.
- [ ] The post-implementation census reproduces the 29-file baseline and the classification has
      no unclassified result.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build-prod` passes.
- [ ] The diff demonstrates the intended shape outcome—smaller source layout and consolidated
      props declarations—not a new behavioral guarantee. Strand 2 has no behavioral acceptance
      criterion by construction; `typecheck` + `lint` + `build-prod` are its complete automated
      signal, as recorded in EPIC-077 §C-5.

## Files Changed Summary

This README is being created before implementation. No source files have been changed by this
investigation. The table describes the intended implementation footprint and the explicit no-change
boundary.

| File group | Planned action |
|---|---|
| `doc/tasks/US-1218-merge-types-only-files/README.md` | Create this task document. |
| The 17 shell files in the Merge table | Delete after moving declarations. |
| The 17 target `*View.ts` files in the Merge table | Add the moved props declarations and required type-only imports. |
| The direct importer files in the importer inventory and affected component/root barrels | Change only type import/re-export source paths as listed. |
| All 12 Keep files in the two Keep tables | No changes. |
