# US-1107: Close the TextChrome contract

## Goal

Convert the final three TextChrome callers (graph, link-editor, and draw) from
EditorModule.Component to EditorModule.View, while keeping their React bodies as
bounded React islands. Then prove that no caller remains, delete
editors/base/TextChrome.tsx and its four ReactNode members, and leave the
surviving chrome faces, React bodies, and compatibility bridges intact.

This is the closing task in [EPIC-067](../../epics/EPIC-067.md). It must not
convert GraphBody.tsx, LinkBody.tsx, DrawBody.tsx, or any nested React component.

## Background

### Caller-count precondition

EPIC-067's source sweep found 14 real TextChrome caller files, one per editor,
not the dashboard's historical figure of 24. A raw <TextChrome search is not a
caller count: in the original sweep it also matched the definition and the
comment at src/renderer/editors/graph/GraphBody.tsx:302.

The intended precondition for this task is that US-1104 through US-1106 have
already removed the other 11 callers. The three callers owned here are:

| Editor | Current file | Lines | Current slots |
|---|---|---:|---|
| Graph | src/renderer/editors/graph/index.tsx | 116 | rightToolbarContributions and footerContributions, plus GraphBody children (:99-105) |
| Link editor | src/renderer/editors/link-editor/index.tsx | 204 | toolbarContributions, rightToolbarContributions, and footerContributions, plus LinkBody children (:186-193) |
| Draw | src/renderer/editors/draw/index.tsx | 224 | rightToolbarContributions, plus DrawBody children (:208-213) |

The current source scan finds exactly **three** real JSX callers: graph,
link-editor, and draw. The preceding-task callers are now on their
TextChromeView/View paths, so this is the verified final three-caller
precondition. The close gate is unambiguous: after this task, a
source-and-repository search for a caller/import of TextChrome must return
zero. Historical documents, comments, and TextChromeView references are not
live callers.

### Native slot seam and React error containment

src/renderer/editors/base/TextChromeView.ts:18-24 already accepts SlotContent
for children, toolbarContributions, rightToolbarContributions, and
footerContributions. The type is defined at
src/renderer/uikit/shared/fill-slot.ts:5 as string | Node | React.ReactNode.
TextChromeView.ts:409-429 owns the slot hosts and sends their values through
fillSlot; an element-shaped value creates one data-part="react-slot" React
root, while a DOM node stays native.

The footer seam is verified rather than assumed:
TextChromeView.ts:380-383 passes footerContributions to ContentHostFooterView,
whose ContentHostFooterViewProps.footerContributions is also SlotContent at
:17-20 and reaches fillSlot at :130-132. Native Graph and Link footer
contributions must therefore be DOM nodes, not React elements.

The View arm of src/renderer/ui/app/AsyncEditorView.ts:98-135 catches
construction and synchronous mount failures. It cannot catch a descendant React
render after mountReactHandle returns. Each remaining React body must therefore
be created as an EditorErrorBoundary element around the body element.

The four existing epic-wide masked defects remain useful regression checks:
the selection channel for Run All in TextChromeView.ts:34-35,
ContentHostFooterView's former ProviderIcon repaint, PageToolbarView's former
unbound NavPanelButton reads, and ScriptPanelView's library-state channel.
This task must not reintroduce any of them.

### Verified helper inventory

| Editor/helper | Verified render-time reads | Native target |
|---|---|---|
| graph/index.tsx:15-60 GraphToolbarBits | No render-time model read. Host title, canvas pixels, and clipboard are read only in click handlers. | Native view with two IconButtonViews; retain the stable canvas handoff from the owner to GraphBody. Use the DOM icon builder for DrawIcon. |
| graph/index.tsx:62-78 GraphFooterBits | statusHint is selected through editor.state.use; recordsCount is a getter over dataModel and renderer, not a state field. | Native footer span. Give recordsCount a real model invalidation channel; do not describe the statusHint subscription as a direct count subscription. |
| link-editor/index.tsx:50-89 LinkBreadcrumbBits | expandedPanel, selectedCategory, selectedTag, and selectedHostname are selected together. | Native BreadcrumbView, updating its label/value in place. |
| link-editor/index.tsx:95-159 LinkActionBits | searchText and getViewMode(s) are selected together; view mode is deliberately derived inside the selector. | Native ButtonView/InputView/IconButtonView; keep the input stable and use openMenu or the existing popup action without a React render-prop. |
| link-editor/index.tsx:165-178 LinkFooterBits | filteredLinks.length and data.links.length are selected together. | Native stable span in the footer contribution slot. |
| draw/index.tsx:24-204 DrawToolbarBits | darkMode is selected. File name, Excalidraw API, and export data are read only in actions. | Native IconButtonViews and openMenu; preserve both menus, all five button names, and action-time reads. |

The Link body deliberately selects pinnedLinksRaw before calling
LinkEditor.getPinnedLinks() (LinkBody.tsx:11-24,41-45), so that derived
pinned links have a state channel. LinkItemList.tsx:27-30 separately uses
useSyncExternalStore for tags. The index helpers themselves have no missing
subscription.

Existing body-only reads still need to remain visible to a future body
conversion: GraphExpansionSettings.tsx:61,69-76 reads graph options/nodes
without an external graph subscription; GraphTuningSliders.tsx:43-49 seeds
local state once from renderer.forceParams; and Link's imageProxy is read by
LinkItemList.tsx, LinkItemTiles.tsx, and PinnedLinksPanel.tsx without a
subscription to browser Tor state. Those are pre-existing React-body concerns,
not reasons to convert a body here.

The Graph footer getter is different: it is in a task-owned slot helper and must
be fixed or given an explicit model channel as part of this conversion.
GraphEditor.recordsCount is GraphEditor.ts:512-516, while the state declaration
at GraphEditor.ts:46-63 has no corresponding field.

### Public exports and the contract being deleted

The current src/renderer/editors/base/index.ts exports the chrome names as:

    export { EditorToolbar } from './EditorToolbar';
    export type { EditorToolbarProps } from './EditorToolbar';
    export { PageToolbar } from './PageToolbar';
    export { TextChrome } from './TextChrome';

Only TextChrome is removed from this barrel. EditorToolbar and
EditorToolbarProps stay, and PageToolbar stays. ContentHostFooter is a
direct-module face (base/ContentHostFooter.ts), not a barrel export, and it
also stays. TextChromeProps is private to TextChrome.tsx; it is not a barrel
export, but the file deletion removes its model contract and all four ReactNode
members: children, toolbarContributions, rightToolbarContributions, and
footerContributions.

The verified surviving React faces and their direct callers outside EPIC-067
are:

| Survivor | Actual callers |
|---|---|
| PageToolbar | editors/archive/ArchiveEditorView.tsx, editors/board-info/BoardInfoEditorView.tsx, editors/category/CategoryEditor.tsx, editors/git-tree/GitTreeEditorView.tsx, editors/image/ImageView.tsx, editors/video/VideoView.tsx (6). Its sibling export SwitchWidget is also called by editors/board/BoardToolbar.tsx:160. |
| EditorToolbar | editors/browser/BrowserView.tsx, editors/mcp-inspector/McpInspectorView.tsx, editors/mneme-config/MnemeConfigView.ts (3). |
| ContentHostFooter | editors/board/BoardEditorView.tsx:92 (1). |
| EditorError | editors/draw/DrawBody.tsx:125, editors/graph/GraphBody.tsx:511, editors/link-editor/LinkBody.tsx:93, editors/rest-client/RestClientBody.tsx:28 (4). |

EditorError.tsx is therefore not part of the close. Neither are
applyRestProps, clearRestListeners, bindRef, or fillSlot. Their current caller
lists are below; the defining react-compat.ts functions are not counted as
callers. The lists below are relative to src/renderer.

applyRestProps (39 callers; 40 files including its definition):

editors/shared/ColorizedCodeView.ts; uikit/Autocomplete/AutocompleteView.ts,
Breadcrumb/BreadcrumbView.ts, Button/ButtonView.tsx,
CategoryList/CategoryListView.ts, Checkbox/CheckboxView.tsx,
CollapsiblePanelStack/CollapsiblePanelStackView.tsx,
Dialog/DialogContentView.tsx, Dialog/DialogView.tsx,
Divider/DividerView.tsx, Dot/DotView.tsx, IconButton/IconButtonView.tsx,
Input/InputView.tsx, Label/LabelView.tsx, ListBox/ListBoxView.ts,
ListBox/ListItemView.ts, ListBox/SectionItemView.ts, Minimap/MinimapView.ts,
MultiListBox/MultiListBoxView.ts, MultiSelect/MultiSelectView.ts,
Notification/NotificationView.ts, PathInput/PathInputView.tsx,
Popover/PopoverView.tsx, ProgressBar/ProgressBarView.tsx,
SegmentedControl/SegmentedControlView.tsx, Select/SelectView.ts,
SelectableRow/SelectableRowView.tsx, Slider/SliderView.tsx,
Spinner/SpinnerView.tsx, SplitButton/SplitButtonView.ts,
Splitter/SplitterView.ts, Tag/TagView.tsx, TagsInput/TagsInputView.ts,
Textarea/TextareaView.ts, Toolbar/ToolbarView.ts, Tree/SectionItemView.ts,
Tree/TreeItemView.ts, Tree/TreeView.ts, TruncatedText/TruncatedTextView.tsx.

clearRestListeners (38 callers; 39 files including its definition):

editors/shared/ColorizedCodeView.ts; uikit/Autocomplete/AutocompleteView.ts,
Breadcrumb/BreadcrumbView.ts, Button/ButtonView.tsx,
CategoryList/CategoryListView.ts, Checkbox/CheckboxView.tsx,
CollapsiblePanelStack/CollapsiblePanelStackView.tsx,
Dialog/DialogContentView.tsx, Dialog/DialogView.tsx,
Divider/DividerView.tsx, Dot/DotView.tsx, IconButton/IconButtonView.tsx,
Input/InputView.tsx, Label/LabelView.tsx, ListBox/ListBoxView.ts,
ListBox/ListItemView.ts, ListBox/SectionItemView.ts, Minimap/MinimapView.ts,
MultiListBox/MultiListBoxView.ts, MultiSelect/MultiSelectView.ts,
Notification/NotificationView.ts, PathInput/PathInputView.tsx,
Popover/PopoverView.tsx, ProgressBar/ProgressBarView.tsx,
Select/SelectView.ts, SelectableRow/SelectableRowView.tsx, Slider/SliderView.tsx,
Spinner/SpinnerView.tsx, Splitter/SplitterView.ts, Tag/TagView.tsx,
TagsInput/TagsInputView.ts, Textarea/TextareaView.ts, Toolbar/ToolbarView.ts,
Tree/SectionItemView.ts, Tree/TreeItemView.ts, Tree/TreeView.ts,
TruncatedText/TruncatedTextView.tsx.

bindRef (17 callers; 18 files including its definition):

uikit/Autocomplete/AutocompleteView.ts, Button/ButtonView.tsx,
Dialog/DialogContentView.tsx, Dialog/DialogView.tsx,
IconButton/IconButtonView.tsx, Input/InputView.tsx, ListBox/ListItemView.ts,
ListBox/SectionItemView.ts, MultiSelect/MultiSelectView.ts,
Notification/AlertItemView.tsx, Notification/NotificationView.ts,
PathInput/PathInputView.tsx, Popover/PopoverView.tsx, Select/SelectView.ts,
SelectableRow/SelectableRowView.tsx, Tree/SectionItemView.ts,
Tree/TreeItemView.ts.

fillSlot (30 callers):

editors/base/ContentHostFooterView.ts, editors/base/EditorToolbarView.ts,
editors/base/PageToolbarView.ts, editors/base/TextChromeView.ts,
ui/dialogs/poppers/grid-context-menu.tsx, ui/sidebar/PinnedRailView.ts,
ui/sidebar/TrustedBoardsListView.tsx, ui/sidebar/TrustedToolsListView.tsx,
ui/tabs/PageTabView.ts, uikit/Autocomplete/AutocompleteView.ts,
Button/ButtonView.tsx, Checkbox/CheckboxView.tsx,
CollapsiblePanelStack/CollapsiblePanelStackView.tsx,
Dialog/DialogContentView.tsx, Dialog/DialogView.tsx,
IconButton/IconButtonView.tsx, Input/InputView.tsx, Label/LabelView.tsx,
ListBox/ListBoxView.ts, ListBox/ListItemView.ts, Menu/MenuView.ts,
MultiListBox/MultiListBoxView.ts, RadioGroup/RadioGroupView.ts,
SelectableRow/SelectableRowView.tsx, Tag/TagView.tsx,
Tooltip/attach-tooltip.ts, Tree/SectionItemView.ts, Tree/TreeItemView.ts,
Tree/TreeView.ts, TruncatedText/TruncatedTextView.tsx.

These lists include native faces and remaining React/UIKit bodies that still feed
the bridge. Deleting TextChrome.tsx does not make any of these functions
collectable.

### AsyncEditorView and the registry normalisation shim

EditorModule remains dual-armed in
src/renderer/editors/base/editorRegistry.ts:36-45. The registry's loadModule()
normalises a View into a React Component at :308-316 by wrapping it in
mountVanilla. AsyncEditorView.ts:102-135 correctly prefers module.View, but
that does not make the shim dead: RenderEditorView.ts:50-57 still constructs
the EditorViewModule with Editor: module.Component at :56.

After the fourteen EPIC-067 editors move to View, 16 editors outside this epic
still use the real React arm. The normalisation shim is therefore alive for
the current adapter contract as well: RenderEditorView still reads it, and the
Editor property remains the fallback for modules without View. US-1107 must not
remove the union arm, the normalisation block, or the RenderEditorView read.

### Removal-ledger wording after close

Do not edit doc/de-react.md. After implementation, its editors/base chrome row
should say, precisely in substance:

> TextChrome is collected in EPIC-067: its 14 callers convert to View,
> TextChrome.tsx is deleted, and TextChromeProps' four ReactNode members
> disappear. PageToolbar is not collected: its direct callers are archive,
> board-info, category, git-tree, image, and video. EditorToolbar is not
> collected: its callers are browser, mcp-inspector, and mneme-config.
> ContentHostFooter is not collected: its caller is board. Those faces remain
> until their own editor conversions; EditorError.tsx and the
> applyRestProps/clearRestListeners/bindRef/fillSlot bridge remain for their
> verified consumers.

The ledger is updated, not marked closed for the whole editors/base chrome.

### Final Rule 4 measurement

Use data-react-root inside one open editor at a time, not
data-part="react-slot" alone:

    document.querySelectorAll('[data-name="page-editor"] [data-react-root]').length
    document.querySelectorAll('[data-name="page-editor"] [data-part="react-slot"][data-react-root]').length

The seven React-bodied editors keep a React root because the body relocates into
a TextChromeView slot. Expected final totals are:

| Editor/module id | Body kind | Final roots | Final slot roots |
|---|---|---:|---:|
| markdown / md-view | native | 0 | 0 |
| html / html-view | native | 0 | 0 |
| svg / svg-view | native | 0 | 0 |
| log-view | native | 0 | 0 |
| notebook / notebook-view | native | 0 | 0 |
| mermaid / mermaid-view | native | 0 | 0 |
| grid / grid-json, grid-csv, grid-jsonl | native | 0 | 0 |
| env-vars / env-vars-view | React | 1 | 1 |
| rest-client | React | 1 | 1 |
| monaco | React | 1 | 1 |
| file-diff | React body plus React revision toolbar | 2 | 2 |
| graph / graph-view | React | 1 | 1 |
| link-editor / link-view | React | 1 | 1 |
| draw / draw-view | React | 1 | 1 |

The logical editor count is 14; the Grid row covers its three registered module
IDs. The seven React-bodied entries therefore read 1, 1, 1, 2, 1, 1, 1, not
zero. The seven native-bodied entries read zero. The epic's intermediate 4-5
root peak from E9-4 must be absent at close, but it must be reported if a
mid-epic measurement is repeated.

## Implementation Plan

- [ ] Confirm the preceding-task precondition with a repository-wide search for
  live TextChrome imports/usages. Count callers by imports/JSX, not by the
  definition, comments, historical documents, or the old dashboard number.
  Before US-1107 begins, the only three real callers must be Graph, Link, and
  Draw; after this task the count must be zero.
- [ ] Rename src/renderer/editors/graph/index.tsx to index.ts. Replace the
  React Component registration with View and preserve the five public exports
  (GraphEditor, defaultGraphEditorState, and the three exported types). Keep
  GraphBody's React implementation and its canvasRefSetter prop unchanged.
- [ ] Give Graph's native owner a stable HTMLCanvasElement | null field and
  callback. Create the boundary-wrapped GraphBody element with createElement,
  then pass it to TextChromeView.children. Implement the two toolbar buttons as
  native IconButtonViews, preserving graph-open-in-draw, graph-copy-image,
  titles, order, and action-time canvas reads. Use the DOM icon builder for
  DrawIcon, not a React icon element.
- [ ] Implement Graph's footer contribution as a native span, preserving the
  italic warning text, warning color, margin, and count text. Add or expose a
  narrow GraphEditor channel for recordsCount and bind the span to it;
  state.use(statusHint) alone is not a direct subscription to the getter at
  GraphEditor.ts:512-516. Do not change GraphBody's React state model.
- [ ] Rename src/renderer/editors/link-editor/index.tsx to index.ts, change
  linkModule.Component to linkModule.View, and preserve all five current public
  exports (LinkEditor, defaultLinkEditorState, LinkEditorState, LinkQueueEvent,
  and ExpandedPanel). Own a boundary-wrapped LinkBody React element in the
  children slot.
- [ ] Convert Link's three helper groups to native slot content. Use one
  BreadcrumbView for the category/tag/hostname branch; native ButtonView,
  InputView, and IconButtonView for Add Link, view mode, search, and conditional
  clear; and a stable footer span for the link count. Bind exactly the fields
  currently selected by each helper. Keep view-mode derivation inside the state
  projection, preserve the existing popup menu items and order, and do not
  recreate the search input when its clear button appears or disappears.
- [ ] Rename src/renderer/editors/draw/index.tsx to index.ts, change
  drawModule.Component to drawModule.View, and preserve all current public
  exports. Keep DrawBody in a boundary-wrapped React children slot. Replace
  WithMenu render-prop faces with native IconButtonViews plus
  openMenu/MenuHandle, preserving the four menu groups, their guards, titles,
  and focus/cleanup behavior. Bind darkMode to the existing theme button; read
  the Excalidraw API and file path only at action time.
- [ ] Use the same owner lifecycle in all three indexes: construct child views,
  register them with child(), append roots in the existing chrome order, mount
  them once, update them in place, and dispose subscriptions, menus, timers,
  and body refs. Do not call fillSlot from an index; TextChromeView owns those
  hosts. Every React-shaped slot that remains (the three bodies, plus any
  deliberately retained React toolbar slot such as the existing File Diff
  revision picker from US-1106) must be wrapped in EditorErrorBoundary.
- [ ] After the three callers are native, prove the caller count is zero and
  only then delete src/renderer/editors/base/TextChrome.tsx. Remove only
  export { TextChrome } from './TextChrome'; from
  src/renderer/editors/base/index.ts. Do not delete TextChromeView.ts,
  PageToolbar, EditorToolbar, ContentHostFooter, EditorError.tsx, or any
  bridge function.
- [ ] Record the exact post-close removal-ledger wording from this document for
  the owner of doc/de-react.md; do not edit doc/de-react.md,
  doc/epics/EPIC-067.md, or doc/active-work.md in this task.
- [ ] Verify the registry decision: editorRegistry.ts:308-316 and
  RenderEditorView.ts:56 still have live consumers, so leave the Component arm
  and View-to-Component normalisation shim unchanged.
- [ ] Run npm run typecheck, npm run lint, and npm run build-prod. Add no tests
  or harnesses. After each .tsx to .ts rename, cold-reload if Vite retains a
  stale dynamic-import specifier. Manually measure every logical editor/module
  ID with the queries above and record the exact table values; verify that no
  target's slot root remains and that the 4-5 intermediate peak is not reported
  as the final state.

### Before -> after registration shape

    // Before: the outer React root owns TextChrome, the body, and toolbar JSX.
    export const graphModule: EditorModule = {
        createEditor: () => new GraphEditor(/* default state */),
        Component: GraphEditorView,
    };

    // After: a native owner owns TextChromeView; GraphBody remains a bounded island.
    export const graphModule: EditorModule = {
        createEditor: () => new GraphEditor(/* default state */),
        View: GraphEditorView,
    };

The same arm change applies to linkModule and drawModule; their body
implementations and public exports do not move or disappear.

## Concerns

1. The close must not begin from an unverified caller count. The verified
   source scan is three real callers (graph, link-editor, and draw); the old
   24 figure is not evidence of anything. Repeat the full-repository search
   before deleting the contract, then prove zero after the delete.
2. React roots relocate for seven editors. The body root is expected to remain
   for env-vars, rest-client, monaco, file-diff, graph, link-editor, and draw.
   File Diff retains its second toolbar contribution root for RevisionPicker;
   the other six have one body root after their toolbar helpers are native.
   Claiming zero for all fourteen is incorrect.
3. Graph's recordsCount is a real unchanneled render read. It is not enough to
   retain the old statusHint selector or to force whole-state repainting
   without naming the channel. The implementation must expose a model update
   channel for the count and bind the native footer to it. The unrelated
   unbound reads in unchanged Graph and Link body descendants are recorded
   above and must not be silently claimed fixed.
4. Footer contributions must be DOM nodes. US-1103 widened the native seam to
   SlotContent, but the React faces intentionally remain ReactNode. A native
   footer span must go through TextChromeView and ContentHostFooterView;
   casting a DOM node to ReactNode, or calling a React face, would recreate the
   contract this task is deleting.
5. Toolbar helper conversion must preserve focus and ordering. Link's
   controlled search input must be updated in place. Graph's buttons must remain
   on the right and its footer count must remain before the encoding label.
   Draw's menu handles must close and dispose with the owner, and its native menu
   must retain the existing action-time file/API reads.
6. Error-boundary scope is split. AsyncEditorView catches native
   construction/mount failures; EditorErrorBoundary catches descendant React
   render/lifecycle failures. It does not catch event handlers or async
   callbacks. Each remaining React slot must be boundary-wrapped, while native
   helpers do not need a React boundary.
7. The normalisation shim is alive, not dead. AsyncEditorView preferring View
   does not remove RenderEditorView's module.Component read. The 16
   outside-epic React modules and the adapter contract keep both the arm and shim
   in scope for a later epic.
8. Closing the ledger row is deliberately narrower than deleting the chrome
   concept. Only TextChrome and its four private ReactNode props are collected
   here. The three surviving faces, EditorError.tsx, and all four bridge
   functions have verified consumers and must remain.

There are no unresolved implementation choices after the source audit. The
caller precondition, native helper ownership, boundary placement, footer typing,
Graph count channel, registry decision, ledger wording, and final root
measurements are resolved above.

## Acceptance Criteria

- [ ] The precondition is recorded: after US-1104 through US-1106, the only
  three real TextChrome callers are graph, link-editor, and draw; a final
  repository-wide caller/import search after this task returns zero.
- [ ] graph/index.ts, link-editor/index.ts, and draw/index.ts replace Component
  with View, contain no JSX, preserve their public exports, and mount the
  existing bodies without converting them.
- [ ] Graph, Link, and Draw toolbar/footer helper output preserves all current
  names, order, conditionals, actions, icon/menu behavior, and state-driven
  values. Native footer contributions are DOM nodes and the Graph count has a
  real model channel.
- [ ] Every remaining React slot is passed through EditorErrorBoundary.
  GraphBody.tsx, LinkBody.tsx, DrawBody.tsx, and all nested React body files
  remain React implementations.
- [ ] Only TextChrome.tsx and its TextChrome barrel export are removed from the
  shared chrome contract. PageToolbar, EditorToolbar, ContentHostFooter,
  EditorError.tsx, TextChromeView, and
  applyRestProps/clearRestListeners/bindRef/fillSlot remain.
- [ ] The removal-ledger owner has the exact post-close wording recorded in
  this document: TextChrome collected; PageToolbar 6, EditorToolbar 3,
  ContentHostFooter 1 not collected. The roadmap and epic documents are not
  edited by this task.
- [ ] editorRegistry.ts:308-316, RenderEditorView.ts:56, and the dual
  EditorModule arm remain because the normalisation shim is verified alive and
  16 outside-epic React editors remain.
- [ ] Final Rule 4 measurements use data-react-root inside
  [data-name="page-editor"], with slot roots counted separately. The seven
  native-bodied editors read 0; env-vars, rest-client, monaco, graph,
  link-editor, and draw read 1; file-diff reads 2. No target is claimed as
  zero when its React body remains, and the E9-4 4-5 peak is gone at close.
- [ ] npm run typecheck, npm run lint, and npm run build-prod pass. No tests or
  harnesses are added, no implementation body is converted, and no commit is
  created.

### Files that need NO changes

- src/renderer/editors/graph/GraphBody.tsx
- src/renderer/editors/graph/GraphDetailPanel.tsx
- src/renderer/editors/graph/GraphExpansionSettings.tsx
- src/renderer/editors/graph/GraphIcons.tsx
- src/renderer/editors/graph/GraphLegendPanel.tsx
- src/renderer/editors/graph/GraphTooltip.tsx
- src/renderer/editors/graph/GraphTuningSliders.tsx
- src/renderer/editors/link-editor/LinkBody.tsx
- src/renderer/editors/link-editor/LinkItemList.tsx
- src/renderer/editors/link-editor/LinkItemTiles.tsx
- src/renderer/editors/link-editor/LinksList.tsx
- src/renderer/editors/link-editor/LinksTiles.tsx
- src/renderer/editors/link-editor/PinnedLinksPanel.tsx
- src/renderer/editors/link-editor/LinkTooltip.tsx
- src/renderer/editors/draw/DrawBody.tsx
- src/renderer/editors/base/TextChromeView.ts
- src/renderer/editors/base/PageToolbar.ts
- src/renderer/editors/base/PageToolbarView.ts
- src/renderer/editors/base/EditorToolbar.ts
- src/renderer/editors/base/EditorToolbarView.ts
- src/renderer/editors/base/ContentHostFooter.ts
- src/renderer/editors/base/ContentHostFooterView.ts
- src/renderer/editors/base/EditorError.tsx
- src/renderer/editors/base/editorRegistry.ts
- src/renderer/editors/register-editors.ts
- src/renderer/editors/types.ts
- src/renderer/ui/app/AsyncEditorView.ts
- src/renderer/ui/app/RenderEditorView.ts
- src/renderer/ui/app/EditorErrorBoundary.tsx
- src/renderer/uikit/shared/fill-slot.ts
- src/renderer/uikit/shared/mount.tsx
- src/renderer/uikit/shared/vanilla-view.ts
- src/renderer/uikit/Breadcrumb/BreadcrumbView.ts
- src/renderer/uikit/Button/ButtonView.tsx
- src/renderer/uikit/IconButton/IconButtonView.tsx
- src/renderer/uikit/Input/InputView.tsx
- src/renderer/uikit/Menu/attach-menu.ts
- doc/de-react.md
- doc/epics/EPIC-067.md
- doc/active-work.md

## Files Changed

| File | Change |
|---|---|
| src/renderer/editors/graph/index.tsx -> src/renderer/editors/graph/index.ts | Native Graph owner; native toolbar/footer helpers; boundary-wrapped GraphBody; View registration and exports preserved |
| src/renderer/editors/link-editor/index.tsx -> src/renderer/editors/link-editor/index.ts | Native Link owner; native breadcrumb/actions/footer; boundary-wrapped LinkBody; View registration and exports preserved |
| src/renderer/editors/draw/index.tsx -> src/renderer/editors/draw/index.ts | Native Draw owner and menu-backed toolbar; boundary-wrapped DrawBody; View registration and exports preserved |
| src/renderer/editors/graph/GraphEditor.ts | Add the explicit recordsCount invalidation channel required by the native footer |
| src/renderer/editors/base/TextChrome.tsx | Delete after the final caller proof; removes TextChromeProps and its four ReactNode members |
| src/renderer/editors/base/index.ts | Remove only the TextChrome barrel export; retain PageToolbar, EditorToolbar, and their public types/faces |
| doc/tasks/US-1107-close-the-chrome-contract/README.md | This verified investigation and implementation plan |
