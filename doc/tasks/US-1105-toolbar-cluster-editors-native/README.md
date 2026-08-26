# US-1105: Native views for notebook, Mermaid, and Grid

## Goal

Convert notebook, mermaid, and all three Grid registrations from
EditorModule.Component to EditorModule.View, renaming each index.tsx to
index.ts. Each editor already has a framework-free body; the completed views
must compose those bodies and all toolbar/footer contributions without a React
root, taking notebook-view, mermaid-view, grid-json, grid-csv, and grid-jsonl
from the measured two roots to zero.

This is the seventh task in [EPIC-067](../../epics/EPIC-067.md), after
US-1103's native TextChromeView and US-1104's four-editor conversion. The
registration pattern, the View arm, preservation of non-view re-exports, the
data-name contract, and the zero-root requirement are exactly those specified
in [US-1104](../US-1104-vanilla-body-editors-native/README.md). This document is
only the delta for these three editors.

## Background

### Verified current shape and helper inventory

The three source indexes are the largest toolbar-contribution clusters in this
set of fourteen callers: grid/index.tsx is 154 lines, mermaid/index.tsx is
143 lines, and notebook/index.tsx is 124 lines. Their helpers and render-time
reads are:

| File/helper | Verified reads and actions | Native target |
|---|---|---|
| notebook/index.tsx:94-106 NotebookEditorView | Casts the generic model; supplies all three contribution slots and children; no state read of its own | Native owner/composer; owns NotebookBodyView, the contribution views/hosts, and TextChromeView |
| notebook/index.tsx:16-41 NotebookBreadcrumb | Subscribes to expandedPanel, selectedCategory, and selectedTag; selects Tags versus Categories and calls setSelectedTag/setSelectedCategory | Dedicated native NotebookBreadcrumbView owning one BreadcrumbView; update its props in place |
| notebook/index.tsx:43-78 NotebookToolbarBits | Subscribes to searchText; owns Add Note, the controlled search input, and conditional search-clear button | Dedicated native toolbar view owning stable ButtonView, InputView, and optional IconButtonView |
| notebook/index.tsx:80-92 NotebookFooterBits | Subscribes to filteredNotes.length and data.notes.length; formats the count text | No separate helper view needed: the editor owner can own one stable span and a narrow count bind/update method |
| mermaid/index.tsx:115-133 MermaidEditorView | Owns the React ref holding an ImageViewportModel or null and passes its setter into MermaidBodyView; the ref is read only by the copy action | Native owner field imageModel; stable setter callback; pass the body root directly |
| mermaid/index.tsx:27-113 MermaidToolbarBits | Subscribes to svgUrl and lightMode; reads host content/title only in click handlers; invokes Draw conversion, save, and copy actions | Dedicated native toolbar view owning five stable IconButtonViews and native action methods |
| grid/index.tsx:17-40 GridEditorView | Owns the React useRef<DataGridInstance> and forwards it from GridBodyView.onModel | Native owner field gridModel; stable onModel callback; direct GridBodyView root |
| grid/index.tsx:42-82 GridToolbarBits | Reads immutable editor.format to decide whether CSV options exist; reads the grid handle only on click; opens the existing popovers | Dedicated native toolbar view with stable columns button and conditional CSV ButtonView |
| grid/index.tsx:84-107 GridSearchInput | Subscribes to state.search; controlled search input and conditional clear button | Dedicated native search view with one stable InputView; never recreate it for a keystroke |
| grid/index.tsx:109-125 GridFooterBits | Subscribes to rowCount, filters.length, and displayedRowCount; calls getVisibleRowsLabel(editor) | No separate helper view needed: the editor owner can own one stable footer span and update it from the same narrow bind |

The simple footer helpers may be methods on their editor owner because their
only output is one text span. The stateful or multi-control helpers become
native child views so their owned UIKit roots remain stable and independently
updatable.

### Native body and embedded-editor contract

The body implementations are already native and must be mounted directly:

| Editor | Current body use | Module BodyView arm that must remain |
|---|---|---|
| Notebook | NotebookBody from notebook/NotebookBody.tsx, a JSX-free mountVanilla face around NotebookBodyView | No BodyView arm exists on notebookModule, and none is to be added. Notebook itself is not an embedded language editor. |
| Grid | GridBodyView from grid/GridBodyView.ts | BodyView: GridBodyView, unchanged |
| Mermaid | MermaidBodyView from mermaid/MermaidBodyView.ts | BodyView: MermaidBodyView, unchanged |

NoteItemActiveEditorView.ts:144-165 loads a module, requires module.BodyView,
creates the embedded editor, and mounts that chrome-free body. The registry
comment at editorRegistry.ts:28-33 explicitly identifies Grid, Markdown, SVG,
HTML, and Mermaid as the complete language-gated embeddable set. Therefore this
task must not change the embedded dispatcher or the BodyView values for Grid
and Mermaid; the adjacent Markdown/HTML/SVG values are likewise outside this
task and must remain untouched.

notebook/NotebookBody.tsx is not re-exported by the notebook index and a
repository search found no consumer other than the current index. Once the
native owner constructs NotebookBodyView directly, this dead React-facing
adapter can be deleted. This also removes the last notebook tsx file that the
epic's close condition calls out; it is not a public BodyView contract.

### Public index exports

The index files are public barrels. Preserve these exports exactly while
moving the view implementation:

| Index | Non-view exports to preserve | BodyView/public module note |
|---|---|---|
| notebook/index.tsx | NotebookEditor, defaultNotebookEditorState; types NotebookEditorState, NotebookQueueEvent, NoteContent, NoteItem, NoteItemState, NotebookData, NotebookEditorProps, NotebookSource | notebookModule has no BodyView; do not turn the page body into an embeddable body |
| mermaid/index.tsx | MermaidEditor, defaultMermaidEditorState; types MermaidEditorState, MermaidQueueEvent | Keep BodyView: MermaidBodyView; MermaidBodyView is a module property, not a new barrel export |
| grid/index.tsx | gridJsonModule, gridCsvModule, gridJsonlModule; GridEditor, defaultGridEditorState; types GridEditorState, GridQueueEvent, GridFormat, GridEditorId, GridData, GridColumn; getRowKey, registerRow, registerRows, getGridDataWithColumns, nextColumnKeys, showColumnsOptions, showCsvOptions | Keep BodyView: GridBodyView in the factory result for all three module IDs |

The public src/renderer/editors/index.ts:12-16 barrel re-exports Grid and
Markdown; no barrel change is required. No implementation should remove or
rename any export in the table.

### Footer contribution seam — verified

The native footer chain is already SlotContent end to end:

    // src/renderer/editors/base/TextChromeView.ts:16-20
    export interface TextChromeViewProps {
        // ...
        footerContributions?: SlotContent;
    }

    // src/renderer/editors/base/ContentHostFooterView.ts:17-20
    export interface ContentHostFooterViewProps {
        host: TextFileModel;
        footerContributions?: SlotContent;
    }

TextChromeView.buildBranch passes the value directly at TextChromeView.ts:380-383,
and ContentHostFooterView.updateContributions passes it to fillSlot at
ContentHostFooterView.ts:130-133. The React faces deliberately remain narrower:
TextChrome.tsx:7-20 and ContentHostFooter.ts:6-10 expose ReactNode. Thus the
result is yes for the native chain, with the React-facing compatibility types
unchanged as required by §E9-6a. Notebook and Grid can pass a DOM span into the
footer and must do so; neither should pass a React element or invoke a face.

Notebook is the strongest seam check because its native owner will exercise all
four TextChromeView inputs at once:

1. toolbarContributions: breadcrumb, after the text-host buttons and before the
   toolbar spacer.
2. rightToolbarContributions: Add Note plus search, after the right-side
   text-host controls and before the switch widget.
3. footerContributions: note count, after the footer spacer and before the
   divider, provider badge, and encoding label.
4. children: the NotebookBodyView root in the chrome body slot.

Use stable display: contents hosts for the multi-node toolbar and right toolbar
groups. The footer contribution is one stable span. This preserves the ordering
implemented by TextChromeView.ts:351-417 and ContentHostFooterView.ts:61-108
while ensuring every slot receives a DOM Node.

### Editor-specific deltas

#### Notebook

The current React output and names are:

| Existing helper/output | Required native behavior |
|---|---|
| notebook-breadcrumb | Keep one BreadcrumbView root. Changing expandedPanel changes the root/value labels in place; do not release and recreate the breadcrumb for every category/tag change. |
| notebook-add-note | Keep a primary, small ButtonView, string child Add Note, and editor.addNote action. |
| notebook-search | Keep a small, 200px InputView, controlled by searchText, with placeholder Search.... |
| notebook-search-clear | Create only when searchText is non-empty; use the existing close IconButtonView and editor.clearSearch; release only this child when empty. Pass its root as the input endSlot, not as React content. |
| footer span | Keep the unnamed plain span and exact N notes / N of M notes text. It belongs before the encoding label through the native footer seam. |

NotebookBodyView must be a child of the native editor owner, mounted before
its root is handed to TextChromeView.children. Do not use NotebookBody.tsx from
the native path. Preserve the body root name notebook-body and the body and
embedded-note behavior below it.

#### Mermaid

The current toolbar has five buttons: mermaid-theme, mermaid-open-draw,
mermaid-convert-excalidraw, mermaid-save, and mermaid-copy. Preserve their
titles, disabled rules, icons, actions, and order. DrawIcon and DrawOrangeIcon
already have the DOM builder used by createIconComponentElement; pass the
resulting SVGElement as the native IconButtonView.icon, not a React element.

The current comment at mermaid/index.tsx:117-118 says the ref exists to avoid
exposing a React component ref. The native version is the intended form:

    // Before: React-only holder and body adapter
    const imageModel = useRef<ImageViewportModel | null>(null);
    <MermaidBodyView imageModelSetter={(model) => { imageModel.current = model; }} />

    // After: owned native field and stable callback
    private imageModel: ImageViewportModel | null = null;
    private readonly setImageModel = (model: ImageViewportModel | null): void => {
        this.imageModel = model;
    };

The toolbar's copy action must read the owner field at click time. Keep the
setter identity stable and pass it to MermaidBodyView.imageModelSetter on the
direct body child. ImageViewportModel.init() calls onModel(this) and dispose()
calls onModel(null) (ImageViewport.tsx:254-267), while MermaidBodyView forwards
that callback through each viewport branch. A body remount must therefore clear
the old field and repopulate it with the new viewport before Copy is expected
to work; do not retain a stale viewport model.

The svgUrl/lightMode subscription must update existing button props in place.
Host content/title reads in onOpenDraw and onConvertToExcalidraw are action-time
reads, not render-time reactive state.

#### Grid

The three makeModule results share the same native owner shape but retain their
distinct IDs and formats. Preserve BodyView: GridBodyView for every module and
keep the existing popover functions and utility re-exports.

TextChrome.tsx:13-16 specifically identifies Grid's search input as the reason
rightToolbarContributions exists. The current value is a real Input with
data-name=grid-search, width 200, a conditional grid-search-clear close button,
and editor.setSearch/editor.clearSearch. The native translation must own one
InputView for the entire editor lifetime. Call InputView.update when search
changes; do not release/recreate the input or its field on each state
notification. InputView compares and writes the value only when it differs and
updates its end slot separately, so typing must preserve both the input's focus
and its selection/caret while the grid filters. This is the explicit guard
against the classic create/remove-cycle focus loss.

The left toolbar must remain ordered as columns first and the conditional CSV
options button second. The columns action reads the current DataGridInstance
field only when clicked; GridBodyView already calls the supplied callback with
the live grid and with null on release (GridBodyView.ts:113-121 and 287-322).
The footer label must update from rowCount, filters.length, and
displayedRowCount without replacing its span.

### Reactive audit and masked defects

No §6.1 masked defect was found in these three indexes. The claim is based on
the following source audit, not on the absence of a React hook after conversion:

| Editor | Every render-time state/value read in the helper cluster | Channel/result |
|---|---|---|
| Notebook | expandedPanel, selectedCategory, selectedTag, searchText, filteredNotes.length, data.notes.length | All are selected through editor.state.use in the three helpers; no unchanneled state read remains |
| Mermaid | svgUrl, lightMode | Both are selected through model.state.use; host content/title are read only inside click handlers; imageModel.current is read only inside Copy |
| Grid | search, rowCount, filters.length, displayedRowCount | Search and footer values are selected through editor.state.use; gridRefHolder.current is action-time only |
| Grid format branch | editor.format | No subscription, but format is a readonly field assigned from the immutable editor ID in the constructor, not reactive state; this is not a masked defect |

The native plan must preserve these narrow channels and must not add a whole
state repaint merely because a helper is now a class. The converted footer
methods should bind the exact fields listed above.

### data-name and ordering contract

The target-specific public names are:

| Editor | Names and presence |
|---|---|
| Notebook | notebook-breadcrumb always; notebook-add-note always; notebook-search always; notebook-search-clear only while search is non-empty |
| Mermaid | mermaid-theme, mermaid-open-draw, mermaid-convert-excalidraw, mermaid-save, mermaid-copy, all always while the toolbar is mounted |
| Grid | grid-columns always; grid-csv-options only for CSV; grid-search always; grid-search-clear only while search is non-empty |

Keep shared native chrome names from US-1103 unchanged, including
text-chrome-root, text-chrome-top, text-chrome-footer, and text-toggle-script.
Keep body names notebook-body, mermaid-root, grid-editor-root, and the nested
Grid names generated by GridBodyView. Do not add a public data-name to an owner
or display-contents host.

## Implementation Plan

- [ ] Rename notebook/index.tsx to index.ts, mermaid/index.tsx to index.ts, and
  grid/index.tsx to index.ts. Preserve all exports in the public-export table
  and change every module factory from Component to View.
- [ ] In each renamed index, replace the React TextChrome wrapper with a
  VanillaView owner whose root is the TextChromeView root. Own and mount every
  body/helper child before passing its stable DOM root to the native chrome
  slots. Use display-contents hosts for sibling groups and pass no React element
  to children, toolbarContributions, rightToolbarContributions, or
  footerContributions.
- [ ] Add the direct native UIKit imports (BreadcrumbView, ButtonView,
  IconButtonView, InputView) and import uikit/Button/Button.css from the changed
  editor indexes because ButtonView.tsx does not own that stylesheet itself.
  Keep the existing BreadcrumbView, InputView, and IconButtonView stylesheet
  ownership intact. Use SlotContent-compatible DOM nodes for Button
  children/end slots.
- [ ] Implement the Notebook owner and native helper views. Bind the three
  breadcrumb fields, update one BreadcrumbView in place, keep the exact
  toolbar/right/footer ordering, preserve the conditional clear button, and
  bind the footer count without replacing its span. Mount NotebookBodyView
  directly as children.
- [ ] Delete notebook/NotebookBody.tsx after the direct body import is in place.
  The source audit found no consumer or barrel export; do not replace it with
  another React adapter. Do not add BodyView to notebookModule.
- [ ] Implement the Mermaid owner and toolbar view. Replace useRef with an owned
  ImageViewportModel | null field plus a stable setter, pass that setter into
  the direct MermaidBodyView, and make Copy read the current field at click
  time. Preserve the five names, DOM-built Draw icons, disabled behavior,
  conversions, notifications, save action, and state-driven title/icon updates.
- [ ] Implement the Grid owner and three native helper responsibilities. Move
  the DataGrid handle to an owner field with a stable onModel callback; keep the
  columns/CSV toolbar order and popover actions; keep one focused InputView for
  grid-search; and update the footer label from its three subscribed fields
  without destroying the footer node. Register the same owner for grid-json,
  grid-csv, and grid-jsonl, preserving each factory ID and BodyView:
  GridBodyView.
- [ ] Check every target-specific data-name, conditional presence case, slot
  order, body root, public export, and embedded BodyView value against the
  tables above. Confirm the native footer contribution is a DOM Node for
  Notebook and Grid and that no call reaches TextChrome, ContentHostFooter,
  mountVanilla, mountReact, mountReactHandle, JSX, or React hooks from the
  three converted indexes.
- [ ] Run npm run typecheck, npm run lint, and npm run build-prod. After the
  .tsx to .ts dynamic-import rename, cold-reload if Vite retains a stale
  specifier. Manually verify Notebook's four-slot contract and ordering,
  breadcrumb/search/count updates, Mermaid body remount then Copy, Grid search
  focus/selection while typing, Grid CSV conditional controls, and all three
  root measurements. Add no tests or harness.

### Before → after registration shape

    // Before: all three target registrations still enter AsyncEditorView's React arm.
    return {
        createEditor: () => new GridEditor(/* ... */, id),
        Component: GridEditorView,
        BodyView: GridBodyView,
    };

    // After: the same module remains publicly available, but AsyncEditorView takes View.
    return {
        createEditor: () => new GridEditor(/* ... */, id),
        View: GridEditorView,
        BodyView: GridBodyView,
    };

The Notebook and Mermaid changes use the same arm change; their body values
remain respectively absent and MermaidBodyView.

## Concerns

1. **Notebook exercises every native chrome slot.** A mistake in any one of
   the four DOM-node values can silently recreate a slot React root or alter
   the order around the spacer, switch widget, footer contribution, divider,
   provider badge, or encoding label. Verify the complete Notebook DOM, not
   only its root count.
2. **Footer chain status is resolved.** The native chain is SlotContent all
   the way through TextChromeView → ContentHostFooterView → fillSlot. The
   React face types remain ReactNode by design; widening those faces is not part
   of this task.
3. **Mermaid viewport lifetime is a remount boundary.** The owner field must
   observe null from the disposed ImageViewportModel and the new model from the
   replacement body. A stale model would make Copy target a detached image; a
   missing new callback would make Copy silently stop working after a body
   remount.
4. **Grid search focus is state, not just presentation.** Releasing the
   InputView or its field when the clear button appears/disappears would lose
   focus and selection. The implementation must update the stable input and only
   create/release the end-slot clear button.
5. **Grid's format read is intentionally unbound.** It is a readonly
   constructor field derived from the module ID, so it cannot change during a
   view lifetime. It was checked explicitly and is not the §6.1 masked-defect
   class.
6. **The React error boundary does not follow.** AsyncEditorView's View arm uses
   the vanilla construction/mount error path. These three are safe because the
   owner, helpers, bodies, and slot content are native; no React descendant
   boundary is to be introduced.
7. **The dead Notebook adapter is a deletion, not a compatibility export.**
   NotebookBody.tsx has no external consumer and is not re-exported. Deleting it
   is required to leave no stale React-facing body path; the actual public
   embedded contract is module.BodyView for the five language-gated editors.

There are no unresolved design questions. The footer typing, helper ownership,
viewport handoff, Grid focus strategy, export preservation, BodyView behavior,
reactive audit, and root measurements are resolved from the current source.

## Acceptance Criteria

- [ ] notebook/index.ts, mermaid/index.ts, and grid/index.ts contain native View
  registrations, no JSX, hooks, TextChrome, mountVanilla, mountReact, or
  mountReactHandle, and no React contribution values.
- [ ] Notebook mounts NotebookBodyView directly, preserves the absence of a
  Notebook BodyView arm, and preserves every public export in its table.
- [ ] Grid registers all three IDs with View and unchanged BodyView:
  GridBodyView; Mermaid keeps BodyView: MermaidBodyView; all public non-view
  exports remain available.
- [ ] Notebook's breadcrumb, Add Note, search, conditional clear button, and
  footer count preserve exact names, values, actions, conditional presence, and
  four-slot ordering.
- [ ] Mermaid preserves all five toolbar buttons and uses a native owned
  viewport-model field whose setter clears and repopulates across body remounts;
  Copy works with the replacement viewport.
- [ ] Grid preserves columns/CSV toolbar order, all popover actions, the search
  input and clear button names, and the footer label. Typing in grid-search does
  not recreate its field or lose focus/selection.
- [ ] All native footer contribution values are DOM Nodes; the verified native
  footerContributions chain remains SlotContent end to end, while React faces
  remain ReactNode.
- [ ] No §6.1 masked defect is found. Every reactive render-time state read has
  a narrow subscription; the only unbound grid.format read is documented as
  immutable and non-reactive.
- [ ] Shared chrome names, target-specific names, body names, and the complete
  embedded language-gated BodyView contract remain unchanged.
- [ ] With one target editor open, the scoped query below returns zero for each
  target module, including all three Grid IDs, and the slot-root query is also
  zero:

      document.querySelectorAll('[data-name="page-editor"] [data-react-root]').length
      // notebook-view, mermaid-view, grid-json, grid-csv, grid-jsonl -> 0
      document.querySelectorAll('[data-name="page-editor"] [data-part="react-slot"][data-react-root]').length
      // -> 0 for each

- [ ] npm run typecheck, npm run lint, and npm run build-prod pass. No unit tests
  or harnesses are added, EPIC-067.md and active-work.md are not changed, and
  no commit is created.

### Files that need NO changes

- src/renderer/editors/base/editorRegistry.ts
- src/renderer/ui/app/AsyncEditorView.ts
- src/renderer/ui/app/RenderEditorView.ts
- src/renderer/editors/base/TextChrome.tsx
- src/renderer/editors/base/TextChromeView.ts
- src/renderer/editors/base/ContentHostFooter.ts
- src/renderer/editors/base/ContentHostFooterView.ts
- src/renderer/editors/notebook/NotebookBodyView.ts
- src/renderer/editors/grid/GridBodyView.ts
- src/renderer/editors/mermaid/MermaidBodyView.ts
- src/renderer/editors/notebook/NotebookEditor.ts
- src/renderer/editors/grid/GridEditor.ts
- src/renderer/editors/mermaid/MermaidEditor.ts
- src/renderer/editors/notebook/note-editor/NoteItemActiveEditorView.ts
- src/renderer/editors/register-editors.ts
- src/renderer/editors/index.ts
- src/renderer/uikit/shared/fill-slot.ts
- src/renderer/uikit/shared/mount.tsx
- src/renderer/uikit/shared/vanilla-view.ts
- src/renderer/uikit/Button/Button.tsx
- src/renderer/uikit/Button/ButtonView.tsx
- src/renderer/uikit/Button/Button.css
- src/renderer/uikit/Breadcrumb/Breadcrumb.tsx
- src/renderer/uikit/Breadcrumb/BreadcrumbView.ts
- src/renderer/uikit/Input/Input.tsx
- src/renderer/uikit/Input/InputView.tsx
- src/renderer/uikit/IconButton/IconButton.tsx
- src/renderer/uikit/IconButton/IconButtonView.tsx
- src/renderer/uikit/ImageViewport/ImageViewport.tsx
- src/renderer/uikit/ImageViewport/ImageViewportView.ts
- src/renderer/uikit/DataGrid/DataGrid.tsx
- src/renderer/uikit/DataGrid/DataGridView.ts
- src/renderer/theme/icons.tsx
- src/renderer/theme/language-icons.ts
- src/renderer/editors/grid/components/ColumnsOptions.ts
- src/renderer/editors/grid/components/CsvOptions.ts
- doc/epics/EPIC-067.md
- doc/active-work.md

### Files Changed

| File | Change |
|---|---|
| src/renderer/editors/notebook/index.tsx → src/renderer/editors/notebook/index.ts | Native Notebook owner, breadcrumb/toolbar native views, stable search/footer slots, direct NotebookBodyView, View registration, and public exports preserved |
| src/renderer/editors/notebook/NotebookBody.tsx | Delete the unused React mountVanilla body adapter after the index switches to NotebookBodyView directly |
| src/renderer/editors/mermaid/index.tsx → src/renderer/editors/mermaid/index.ts | Native Mermaid owner/toolbar, owned viewport-model field and setter, direct body composition, View registration, and exports preserved |
| src/renderer/editors/grid/index.tsx → src/renderer/editors/grid/index.ts | Native Grid owner/toolbars/footer, stable DataGrid handle and focused search input, direct body composition, three View registrations, and exports preserved |
| doc/tasks/US-1105-toolbar-cluster-editors-native/README.md | This verified delta investigation and implementation plan |
