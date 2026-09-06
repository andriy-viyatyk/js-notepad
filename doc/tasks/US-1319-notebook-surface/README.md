# US-1319 - The notebook surface

Epic: [EPIC-087 - The data editors through `call`, and the retirement of `ui_push`](../../epics/EPIC-087.md)

## Goal

Give the `notebook-view` editor facade a page-scoped, curated `elements` list with working
`highlight`, plus model-backed state and actions for the notebook surface that is already visible
to the user. Preserve the existing facade identity metadata and dashboard/epic links; this document
is a plan only and does not implement the facade, UI changes, typings, or generated assets.

## Background

`src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts:5-19` currently declares the notebook
data members and note mutation methods, but no `elements` member or `highlight` provider.
`NotebookEditorFacade.ts:27-39` is the descriptor to extend. Its existing `kind`, `summary`, and
`summarize()` values are established API metadata and must remain exactly as they are.

`src/renderer/scripting/api-wrapper/PageWrapper.ts:52-70` already maps `notebook-view` to
`NotebookEditorFacade` at lines 57-58. No `PageWrapper` factory or facade-union change is needed.
The source inventory also corrects the epic pointer's count: the supplied list contains 24 unique
names, not 23, and all 24 are present in the notebook source. The names are emitted by UIKit or
panel helpers from `name:` props/debug names; they are not literal `data-name=` attributes in the
notebook files.

The page-element contract is the existing pattern in
`src/renderer/scripting/api-wrapper/TextEditorFacade.ts:84-98`: import `createElements` from
`../ai-vision/elements`, create it with `pageScopeSelector(pageId)` and
`beforeHighlight: () => activatePageAndWaitForLayout(pageId)`, merge `elements.members` into the
descriptor, and expose `elements` plus `provide`. `elements.ts:64-75,90-145` resolves the default
`[data-name="..."]` selector, measures live `visible`, and invokes the callback before highlighting;
`page-elements.ts:5-8,36-40` proves the page identity and activation behavior.

`src/renderer/editors/notebook/NotebookEditor.ts:30-50,53-73` is the authoritative state shape.
It stores `expandedPanel`, `selectedCategory`, `selectedTag`, parsed notebook data, optional parse
`error`, category/tag projections, `notesCount`, `filteredCount`, `expandedNoteId`, and transient
`searchText`. The actual notes are held privately in `NotebookEditor.notes` and the filtered
projection in `filteredNotes` (`NotebookEditor.ts:143-154`); `getNotes()` returns a new array
(`NotebookEditor.ts:343-353`) and `getFilteredNoteAt()` is the model-owned indexed projection.
`loadData()` seeds empty notebooks with real empty arrays/counts and resets the filtered projection
(`NotebookEditor.ts:277-300`), while parsed data updates the same fields at
`NotebookEditor.ts:303-328`.

The notebook view reads those fields directly. The page toolbar binds its breadcrumb to category/tag
selection (`src/renderer/editors/notebook/index.ts:27-39,82-100`), binds search and its conditional
clear button (`index.ts:104-159,173-192`), and binds Add Note to `NotebookEditor.addNote`
(`index.ts:161-170`). `NotebookBodyView.ts:65-76` projects the state used by the list and expanded
overlay; `NotebookBodyView.ts:244-262` shows the error, empty, and filtered-empty branches, and
`NotebookBodyView.ts:330-359` creates the expanded note overlay only when a valid expanded note and
the host overlay target exist.

`NotebookEditor.ts:343-400,432-449,478-508,609-615,634-779` provides the model-owned note,
category, tag, search, filter, expansion, comment, language, editor, and tag-edit methods. The
facade must forward to these methods rather than querying DOM or private view objects. The view
callback wiring is proven by `NotebookBodyView.ts:309-327,339-346`,
`NoteItemViewModel.ts:87-166`, and `ExpandedNoteView.ts:264-365`.

The embedded note editor has a separate `NoteItemEditModel` state with content, language, and editor
(`src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts:159-169,195-213`). Its toolbar calls
`changeLanguage`, `changeEditor`, and `runScript` (`NoteItemEditModel.ts:261-305`), and the toolbar
creates the language, editor-switch, and run controls (`note-editor/NoteItemToolbarView.ts:81-177,
179-216`). There is no notebook-level execution status: `NoteEditorModel.state` only has
`hasSelection` and `contentHeight` (`NoteItemEditModel.ts:26-29,35-99`), and `runScript()` has no
running/result state. Selection is tied to a live nested editor instance, so it is not a safe
`NotebookEditor.state` getter.

`EditorModel.page` is the only general detached-host signal and is typed
`IPageHost | null` at `src/renderer/editors/base/EditorModel.ts:64-67`. The absent-value audit below
uses that signal. `strictNullChecks` is disabled, so every getter's detached and empty-notebook
behavior must be verified manually.

## Implementation Plan

### 1. Curate the 24 verified names

Use one static `NOTEBOOK_ELEMENTS` declaration in `NotebookEditorFacade.ts`. The curated definition
must contain only actionable, user-visible, app-owned controls. Every declared name keeps its
existing spelling and existing `data-type` behavior. Structural names remain omitted.

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `notebook-body` | Omit | Structural page body root created by `NotebookBodyView.ts:181-186`; it contains the list and messages rather than being a control. |
| `notebook-breadcrumb` | Curate | Select the current category or tag filter; `index.ts:82-100` binds its one rendered breadcrumb to `setSelectedCategory` or `setSelectedTag` depending on the active panel. |
| `notebook-flex-grid` | Omit | Structural measured/virtualized row grid; `NotebookBodyView.ts:287-299` supplies rendering and sizing callbacks, not a user action. |
| `notebook-notes-list` | Omit | Structural list host for note rows; `NotebookBodyView.ts:85-97` creates the containing panel. |
| `notebook-search` | Curate | Enter the notebook's current search text; `index.ts:173-180` binds the input to `NotebookEditor.setSearchText`. |
| `notebook-search-clear` | Curate | Clear the current search; `index.ts:148-156,185-192` mounts it only while search text is non-empty and binds `clearSearch`. |
| `notebook-add-note` | Curate | Add a note using the current filter context; `index.ts:161-170` binds the button to `NotebookEditor.addNote`. |
| `notebook-category-label` | Omit | Data-driven label/count content inside a tree item; `category-tree.ts:15-39` creates it, while selection belongs to the enclosing TreeView. |
| `notebook-categories-tree` | Omit | Structural/data-driven TreeView list; `panels/NotebookCategoriesSecondaryView.ts:105-119` supplies its items and selection callback. The panel node owns this control. |
| `notebook-categories-secondary-view` | Omit from the editor facade | Sidebar secondary-view root created at `panels/NotebookCategoriesSecondaryView.ts:22-30`; it belongs to `page.panels`, not the editor's main surface. |
| `notebook-tags-list` | Omit | Structural/data-driven CategoryList; `panels/NotebookTagsSecondaryView.ts:99-107` supplies items and selection. The panel node owns this control. |
| `notebook-tags-secondary-view` | Omit from the editor facade | Sidebar secondary-view root created at `panels/NotebookTagsSecondaryView.ts:20-28`; it belongs to `page.panels`, not the editor's main surface. |
| `notebook-expanded-collapse` | Curate | Collapse the currently expanded note; `ExpandedNoteView.ts:83-89,178-180` binds the one expanded overlay button to `onCollapse`. It is conditional. |
| `notebook-expanded-comment` | Omit | Structural expanded-note comment panel; `ExpandedNoteView.ts:149-152` hosts the comment control but is not itself actionable. |
| `notebook-expanded-content` | Omit | Structural expanded-note content host; `ExpandedNoteView.ts:145-148` contains the active nested editor. |
| `notebook-expanded-toolbar` | Omit | Structural expanded-note metadata toolbar; `ExpandedNoteView.ts:115-118` lays out category, tags, date, title, and collapse controls. |
| `notebook-expanded-editor-toolbar` | Omit | Structural host for the nested note-editor toolbar; `ExpandedNoteView.ts:140-144` only contains `NoteItemToolbarView`. |
| `note-delete` | Curate as repeated | Delete the note row that owns this button. `NoteItemView.ts:87-93` creates it once per `NoteItemView`; it is not a singleton. `visible: true` means at least one mounted note row exposes it; targeted deletion uses `deleteNote(id)`. |
| `note-expand` | Curate as repeated | Expand the note row that owns this button. `NoteItemView.ts:80-86` binds the note ID in each row; `visible` means at least one mounted row exposes it, never that a selector identifies a particular note. Use `expandNote(id)` for targeting. |
| `note-language` | Curate as repeated | Open the language chooser for the owning note; `NoteItemToolbarView.ts:179-189` creates one language button per note editor toolbar. `visible` means at least one mounted note toolbar has it. Targeted changes use `updateNoteLanguage(id, language)`. |
| `note-language-menu` | Omit | A transient menu root is named in `NoteItemToolbarView.ts:192-216`, but it is portaled to `document.body` by `openMenu()` and has no page identity. Declaring it with the required page-scoped selector would be false for notebook pages. Language changes remain available through the model-backed action. |
| `note-editor-switch` | Curate as repeated/conditional | Select the embedded editor for the owning note; `NoteItemToolbarView.ts:150-177` creates it only when switch options exist. It can occur once per note, so `visible` means at least one matching toolbar has options. Targeted changes use `updateNoteEditor(id, editor)`. |
| `note-run-script` | Curate as repeated/conditional | Run the owning script note or its selection; `NoteItemToolbarView.ts:101-132` creates it only for script languages and once per eligible note toolbar. `visible` means at least one eligible toolbar is mounted. No facade action is added for it; see the execution decision below. |
| `note-run-all-script` | Curate as repeated/conditional | Run all content for the owning script note when that note has a selection; `NoteItemToolbarView.ts:134-147` creates it per eligible selected note. `visible` means at least one such toolbar is mounted. No facade action is added for it; see the execution decision below. |

The final list therefore has 11 entries: five singleton/conditional page-surface controls
(`notebook-breadcrumb`, `notebook-search`, `notebook-search-clear`, `notebook-add-note`, and
`notebook-expanded-collapse`) and six explicitly repeated note controls. The other 13 names are
structural, panel-owned, or transient. No missing `data-name` is added: all controls selected for
the list already have a real source name, while unnamed title/category/tag/comment controls are
per-note controls deliberately omitted from this selector contract. No existing `data-name` or
`data-type` is renamed.

The repeated-note warning is part of `NOTEBOOK_ELEMENTS` purpose text and `$help`, not an
implementation detail. A single `[data-name="note-delete"]` selector matches every matching note
row, so it must never be described as a way to identify or activate one note. `highlight` is a
visual inventory operation and may highlight all matching repeated controls; all targeted mutations
continue to take an explicit note ID through the facade.

The two sidebar roots and their child list/tree names are intentionally cross-referenced to
`page.panels`. `NotebookEditor.adoptHost()` registers `notebook-categories` and `notebook-tags`
as secondary views (`NotebookEditor.ts:75-81,192-205`), and the registry maps them to the two
secondary-view classes (`src/renderer/editors/register-editors.ts:62-71`). Under EPIC-086 decision 8
and EPIC-087 decision 10, the panel node owns controls whose existence is explained by sidebar
panel state. US-1323 must expose those panel nodes/elements under `page.panels`; US-1319 must not
duplicate them in `page.editor`.

### 2. Add the descriptor with page scope and highlight activation

Import `ui` from `../../api/ui`, `createElements` from `../ai-vision/elements`, and
`activatePageAndWaitForLayout`/`pageScopeSelector` from `../ai-vision/page-elements`, matching
`TextEditorFacade.ts:4-6`. Define the 11 declarations above with one purpose line each.

The current descriptor is:

```ts
get aiVision(): IAiVisionDescriptor {
    return {
        kind: "NotebookEditor",
        summary: "Notebook notes management facade.",
        members: NOTEBOOK_EDITOR_MEMBERS,
        help: NOTEBOOK_EDITOR_HELP,
        summarize: () => ({
            kind: "NotebookEditor", id: this.id, name: this.name,
            notesCount: this.notesCount,
            categories: this.categories,
            tags: this.tags,
        }),
    };
}
```

Change it to the established descriptor shape while preserving the displayed metadata and
`summarize()` body exactly:

```ts
get aiVision(): IAiVisionDescriptor {
    const pageId = this.vm.page?.id;
    const elements = createElements(NOTEBOOK_ELEMENTS, ui.highlightElement.bind(ui), {
        scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
        beforeHighlight: pageId
            ? () => activatePageAndWaitForLayout(pageId)
            : undefined,
    });
    return {
        kind: "NotebookEditor",
        summary: "Notebook notes management facade.",
        members: [...NOTEBOOK_EDITOR_MEMBERS, ...elements.members],
        help: NOTEBOOK_EDITOR_HELP,
        summarize: () => ({
            kind: "NotebookEditor", id: this.id, name: this.name,
            notesCount: this.notesCount,
            categories: this.categories,
            tags: this.tags,
        }),
        elements: NOTEBOOK_ELEMENTS,
        provide: elements.provide,
    };
}
```

With an attached page, every selector resolves beneath
`[data-page-id=${JSON.stringify(pageId)}]`; inactive pages report their literal current visibility
until `highlight()` activates the page and waits for its slot layout. With no attached page, keep
the established unscoped fallback used by `TextEditorFacade`; the facade's data getters and
actions still follow the detached-host contract below.

Update `NOTEBOOK_EDITOR_HELP` to name the 11 controls, explain that repeated note controls report
whether at least one note instance is mounted, identify `notebook-search-clear` and
`notebook-expanded-collapse` as conditional, and state that `note-editor-switch`,
`note-run-script`, and `note-run-all-script` are per-note conditional controls. The help must point
to `page.panels` for the Categories and Tags secondary views, say that no execution-status property
exists, document that note actions require an explicit ID, and describe detached/empty value
semantics and copied arrays.

### 3. Expose complete, copied notebook state

Update `src/renderer/api/types/notebook-editor.d.ts` and the facade together. Keep the existing
`id` and `name`; change the existing data getters to return snapshots and add the model-backed UI
projection below. `filteredNotes` is derived by iterating `state.filteredCount` and
`NotebookEditor.getFilteredNoteAt(index)`; it is not an invented `NotebookEditor.state` array.

| Property | Source and absent-value contract |
| --- | --- |
| `notes: INote[] \| undefined` | Map `NotebookEditor.getNotes()` (`NotebookEditor.ts:343-349`) to fresh note objects. With an attached notebook, zero notes returns real `[]`; with no attached page/host, return `undefined`. |
| `filteredNotes: INote[] \| undefined` | Map the model's filtered projection through `state.filteredCount` and `getFilteredNoteAt()` (`NotebookEditor.ts:351-353,609-614`). An attached notebook with no matches returns real `[]`; detached returns `undefined`. |
| `categories: string[] \| undefined` | Copy `state.categories` (`NotebookEditor.ts:404-429`). An attached empty notebook returns `[]`; detached returns `undefined`. |
| `tags: string[] \| undefined` | Copy `state.tags` (`NotebookEditor.ts:453-484`). An attached empty notebook returns `[]`; detached returns `undefined`. |
| `notesCount: number \| undefined` | Read `state.notesCount` (`NotebookEditor.ts:343-345`). An attached empty notebook returns `0`; detached returns `undefined`. |
| `filteredCount: number \| undefined` | Read `state.filteredCount` (`NotebookEditor.ts:47,592-605,609-614`). An attached empty or non-matching notebook returns real `0`; detached returns `undefined`. |
| `searchText: string \| undefined` | Read `state.searchText` (`NotebookEditor.ts:49-50,499-508`). An attached notebook with no search returns real `""`; detached returns `undefined`. |
| `selectedCategory: string \| undefined` | Read `state.selectedCategory` (`NotebookEditor.ts:31-34,436-441`). The attached “All” selection is real `""`; detached returns `undefined`. |
| `selectedTag: string \| undefined` | Read `state.selectedTag` (`NotebookEditor.ts:31-34,486-491`). The attached “All” selection is real `""`; detached returns `undefined`. |
| `expandedPanel: "categories" \| "tags" \| undefined` | Read `state.expandedPanel` (`NotebookEditor.ts:31-34,394-400`). An attached notebook has the real default/active panel, normally `"categories"`; detached returns `undefined`. Panel expansion controls remain on `page.panels`. |
| `expandedNoteId: string \| undefined` | Read `state.expandedNoteId` (`NotebookEditor.ts:48,664-674`). Map the default empty string to absence: an attached notebook with no expanded note returns `undefined`; detached also returns `undefined`. A non-empty value identifies the note whose overlay is requested. |
| `error: string \| undefined` | Read `state.error` (`NotebookEditor.ts:38-39,303-338`). A successfully attached notebook returns `undefined`; a parse failure returns the actual message; detached returns `undefined`. |

Extend `INote` so the snapshot reports what the note rows and embedded toolbar display, while keeping
the existing flattened `content` string:

The current public note shape is:

```ts
export interface INote {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly category: string;
    readonly tags: readonly string[];
}
```

Change it to:

```ts
export interface INote {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly language: string;
    readonly editor: string;
    readonly category: string;
    readonly tags: readonly string[];
    readonly comment?: string;
    readonly createdDate: string;
    readonly updatedDate: string;
}
```

`mapNote()` in `NotebookEditorFacade.ts:88-97` must copy `tags` and return a new object with these
fields from `NoteItem` (`notebookTypes.ts:22-33`). `notes` and `filteredNotes` must each create fresh
arrays. `categories` and `tags` must use spread copies. Do not expose `NotebookEditor.notes`,
`filteredNotes`, `state.categories`, `state.tags`, or `data.state` directly, and do not return a
live `NoteItem` or its nested tags array. The public values are snapshots, matching the copy
contract already used by `GridEditorFacade.rows`.

Do not add `running`, `executionResult`, `selectedText`, `hasSelection`, or `contentHeight` to the
notebook facade. No such notebook-level execution state exists; nested selection is only maintained
by `NoteEditorModel` while a particular view is mounted. The script toolbar remains discoverable
and highlightable, but exposing an action would require reaching into a view-owned nested model or
silently substituting a different execution target. That violates EPIC-087 abort criterion 1 and
the unmounted-view rule, so the action is deliberately omitted and recorded in `$help`.

### 4. Add only model-backed actions and mark writes

Keep the current actions, adding cautions to every action that writes notebook content. Forward all
new actions directly to methods that the existing UI calls; no action may query a `NoteItemView`,
`ExpandedNoteView`, `NoteItemViewModel`, or live Monaco instance.

| Facade action | Existing model/UI path | Caution |
| --- | --- | --- |
| `addNote(): INote` | Existing `NotebookEditor.addNote()` (`NotebookEditor.ts:355-391`); the toolbar calls the same method at `index.ts:163-169`. | `adds notebook data` |
| `deleteNote(id: string): void` | Preserve the existing facade behavior: call `NotebookEditor.deleteNote(id, true)` (`NotebookEditor.ts:634-662`) so the facade does not leave a confirmation dialog pending. | Existing `deletes notebook data` |
| `updateNoteTitle(id, title): void` | Forward to `NotebookEditor.updateNoteTitle()` (`NotebookEditor.ts:734-741`); row and expanded title inputs use this path. | `changes notebook data` |
| `updateNoteContent(id, content): void` | Forward to `NotebookEditor.updateNoteContent()` (`NotebookEditor.ts:701-714`); `NoteItemEditModel.changeContent()` calls it at `NoteItemEditModel.ts:261-268`. | `changes notebook data` |
| `updateNoteCategory(id, category): void` | Forward to `NotebookEditor.updateNoteCategory()` (`NotebookEditor.ts:743-750`); row editing uses `NoteItemViewModel.ts:112-116`. | `changes notebook data` |
| `addNoteTag(id, tag): void` | Forward to `NotebookEditor.addNoteTag()` (`NotebookEditor.ts:752-759`); row/expanded tag entry uses the same model callback. | `changes notebook data` |
| `removeNoteTag(id, tagIndex): void` | Preserve existing forwarding to `NotebookEditor.removeNoteTag()` (`NotebookEditor.ts:761-769`). | `changes notebook data` |
| `updateNoteTag(id, tagIndex, tag): void` | Add direct forwarding to `NotebookEditor.updateNoteTag()` (`NotebookEditor.ts:771-779`), which is the model method used by tag-edit blur in `NoteItemViewModel.ts:131-142` and `ExpandedNoteView.ts:353-360`. | `changes notebook data` |
| `addComment(id): void` | Add direct forwarding to `NotebookEditor.addComment()` (`NotebookEditor.ts:676-684`), used by the row and expanded “Add comment” handlers at `NoteItemView.ts:336-345` and `ExpandedNoteView.ts:286-293`. | `changes notebook data` |
| `updateNoteComment(id, comment): void` | Add direct forwarding to `NotebookEditor.updateNoteComment()` (`NotebookEditor.ts:686-693`), used by both comment textareas. | `changes notebook data` |
| `removeComment(id): void` | Add direct forwarding to `NotebookEditor.removeComment()` (`NotebookEditor.ts:695-699`), used on empty-comment blur. | `changes notebook data` |
| `updateNoteLanguage(id, language): void` | Add direct forwarding to `NotebookEditor.updateNoteLanguage()` (`NotebookEditor.ts:716-723`); `NoteItemEditModel.changeLanguage()` calls it at `NoteItemEditModel.ts:279-287`. | `changes notebook data` |
| `updateNoteEditor(id, editor): void` | Add direct forwarding to `NotebookEditor.updateNoteEditor()` (`NotebookEditor.ts:725-732`); `NoteItemEditModel.changeEditor()` calls it at `NoteItemEditModel.ts:270-277`. | `changes notebook data` |
| `setSearchText(text): void` | Add direct forwarding to `NotebookEditor.setSearchText()` (`NotebookEditor.ts:499-504`), the named search input's callback. | None; changes the visible filter only. |
| `clearSearch(): void` | Add direct forwarding to `NotebookEditor.clearSearch()` (`NotebookEditor.ts:506-508`), the named clear button's callback. | None; changes the visible filter only. |
| `setSelectedCategory(category): void` | Add direct forwarding to `NotebookEditor.setSelectedCategory()` (`NotebookEditor.ts:432-441`), used by the breadcrumb and category tree. | None; changes the visible filter only. |
| `setSelectedTag(tag): void` | Add direct forwarding to `NotebookEditor.setSelectedTag()` (`NotebookEditor.ts:486-491`), used by the breadcrumb and tags panel. | None; changes the visible filter only. |
| `expandNote(id): void` | Add direct forwarding to `NotebookEditor.expandNote()` (`NotebookEditor.ts:664-668`), the row button's callback. | None; changes the visible UI only. |
| `collapseNote(): void` | Add direct forwarding to `NotebookEditor.collapseNote()` (`NotebookEditor.ts:670-674`), the expanded overlay button's callback. | None; changes the visible UI only. |

Do not expose `setExpandedPanel()` from the notebook facade. `NotebookBodyView.ts:202-209` receives
the sidebar's `panelExpanded` event and then calls that method; the user-facing panel switch is
`page.panels.expand("notebook-categories")` or `page.panels.expand("notebook-tags")`, owned by the
sidebar node. A direct facade call would change the notebook filter state without expanding the
corresponding sidebar panel.

Do not expose `runNoteScript()`, `runNoteScriptAll()`, `getSelectedText()`, or focus actions. The
visible run buttons call `NoteItemEditModel.runScript()` at `NoteItemToolbarView.ts:115-140`; the
selected-content branch reads `NoteEditorModel.editorRef` at `NoteItemEditModel.ts:293-304`. Those
models are created and disposed by virtualized `NoteItemView`/`ExpandedNoteView` instances, and the
notebook facade has no stable map of them. The existing notebook model has no equivalent method.
Adding a facade action would either reach into view logic, run the wrong note, or queue against an
unmounted view. The safe surface is the explicit content/language/editor mutation API and the
page-level `runScript()` behavior where appropriate; script-note execution remains intentionally
out of this task.

All facade actions should use a small attached-host guard before mutating notebook state, with a
diagnostic such as `Notebook editor action unavailable: no page host attached.` This prevents a
detached editor instance from accepting writes while retaining the real state values described in
the getter audit.

Update `src/renderer/api/types/notebook-editor.d.ts` so `INotebookEditor` exactly matches the
facade's getter/action names and types. The generated
`assets/editor-types/notebook-editor.d.ts` is refreshed only by `editorTypesPlugin()` in
`vite.renderer.config.ts:7-65`; never hand-edit the generated copy.

### 5. Help, conditional visibility, and descriptor completeness

The updated help must state these live visibility rules:

- `notebook-search-clear` is declared once and reports `visible: false` while `searchText === ""`.
- `notebook-expanded-collapse` is declared once and reports `visible: false` unless
  `NotebookBodyView.syncExpandedOverlay()` has a valid note and mounted host overlay.
- `note-editor-switch` reports false if no mounted note has editor switch options.
- `note-run-script` reports false if no mounted note uses a script language.
- `note-run-all-script` reports false if no mounted script note has a live selection.
- The six note controls that can repeat report visibility for at least one mounted note instance;
  they are not selectors for a particular note. The panel roots/list/tree are available through
  `page.panels` once the panel-node work is present.

The descriptor must expose the static `elements: NOTEBOOK_ELEMENTS` declarations and dynamic
page-scoped `provide`/`highlight` members. `PageWrapper.ts:52-70` remains unchanged because the
`notebook-view` mapping already selects this facade.

## Concerns

- **Inventory count correction:** The supplied list has 24 unique names. The implementation should
  keep the corrected 24-name audit in this document and avoid introducing a duplicate inventory
  count elsewhere.
- **Repeated per-note selectors:** `[data-name="note-delete"]`, `[data-name="note-expand"]`,
  `[data-name="note-language"]`, `[data-name="note-editor-switch"]`, and the two run selectors
  match multiple note instances. Their purpose text must say “once per note”/“at least one”; no
  targeted facade action may infer a note ID from such a selector.
- **Transient language menu:** `note-language-menu` is mounted in the body portal and lacks a page
  identity. It is omitted rather than advertising a selector that page scoping cannot resolve.
- **Sidebar ownership:** `notebook-categories-secondary-view`, `notebook-tags-secondary-view`,
  `notebook-categories-tree`, and `notebook-tags-list` are panel controls. They belong under
  `page.panels` per EPIC-086 decision 8 and EPIC-087 decision 10; US-1319 must cross-reference that
  path and never list the same controls in the notebook facade.
- **No missing names:** Unnamed title, category/tag input, tag-add, and comment controls are all
  per-note or dynamically created. They are deliberately not added to the element contract because
  a name without a safe instance selector would make the silent-success defect worse. No existing
  `data-name` or `data-type` may be changed.
- **Absent values:** With `strictNullChecks` off, manually verify every getter. Only no attached
  `EditorModel.page`/host or a genuinely optional model value may produce `undefined`. An attached
  empty notebook must report `notes: []`, `filteredNotes: []`, `categories: []`, `tags: []`, counts
  of `0`, and `searchText`/selection strings of `""`; none may be replaced by `false`, `0`, `""`,
  `null`, or `undefined` as a stand-in for absence.
- **Mutable snapshots:** Every array and note object is recreated per getter call. Tags are copied
  at the nested level; no model collection or `NoteItem` is handed to a script.
- **Execution state and actions:** The only nested selection state is in a live
  `NoteEditorModel`; notebook state has no running/result field. Script-note run actions are
  omitted because they would require view-owned selection or an unmounted nested model. If a
  future model-owned execution path is established, it needs a separate design and task.
- **Actions and detached models:** Model-owned actions are synchronous except for the existing
  underlying delete signature, and none use the notebook queue. The facade should reject writes
  when no page host is attached rather than mutate a detached state object.
- **Generated typings:** Only `src/renderer/api/types/notebook-editor.d.ts` is planned for a type
  source edit. `assets/editor-types/notebook-editor.d.ts` remains generated.
- **No tests:** Unit tests and test harnesses are explicitly out of scope. Verification is source
  review, type generation/typecheck, build/lint as appropriate, and the later epic surface QA.

## Acceptance Criteria

- [ ] `NotebookEditorFacade` remains the facade for `notebook-view`; `PageWrapper.ts` and its
  existing map are unchanged.
- [ ] The 24 source names are audited, with 11 curated entries and 13 omitted structural,
  panel-owned, or transient entries; the inventory count correction is retained.
- [ ] Curated entries preserve every existing name/type, use page-scoped selectors, and use
  `activatePageAndWaitForLayout` before `highlight`; no false missing-name declaration is added.
- [ ] Repeated note controls explicitly say they occur once per note and that `visible` means at
  least one mounted instance; no action silently targets the wrong note.
- [ ] Search-clear, expanded-collapse, editor-switch, and both script controls are declared only
  where their source conditions can make them visible and report `visible: false` otherwise.
- [ ] Notebook category/tag panel roots and their list/tree controls are not duplicated in the
  editor facade; help cross-references their `page.panels` ownership and US-1323.
- [ ] Read-only state reports notes, filtered notes, categories, tags, counts, search text,
  selected category/tag, expanded panel/note, and parse error only from verified model state.
- [ ] Attached empty notebooks report real empty arrays, empty strings, and zero counts; detached
  getters return `undefined` only as specified, and genuinely optional values retain `undefined`.
- [ ] Notes, filtered notes, categories, tags, and nested tag arrays are returned as fresh copies;
  no live mutable model collection is exposed.
- [ ] Existing note actions remain available; model-backed search/filter/expansion, comment, tag,
  language, and embedded-editor actions are forwarded with `caution` on every notebook-data write.
- [ ] Script execution actions, nested selection state, focus queue actions, and direct panel-state
  mutation are deliberately absent with their reasons documented in `$help`/the task plan.
- [ ] `src/renderer/api/types/notebook-editor.d.ts` exactly matches the facade. Generated
  `assets/editor-types/` output is refreshed only by `editorTypesPlugin()` after implementation.
- [ ] No dashboard, epic, unit test, test harness, generated asset hand-edit, or commit is created
  by this task.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1319-notebook-surface/README.md` | This verified implementation plan, inventory, absent-value audit, action decisions, and acceptance criteria. |
| `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts` | Add the 11-entry page-scoped element descriptor/provider, expanded help, copied state getters, complete note snapshot mapping, model-backed actions, and write cautions while preserving existing `kind`, `summary`, and `summarize()` values. |
| `src/renderer/api/types/notebook-editor.d.ts` | Canonical public notebook snapshot/state/action types matching the facade; generated editor assets are refreshed by the build only. |

Files intentionally needing **no changes**:

- `src/renderer/scripting/api-wrapper/PageWrapper.ts` - `notebook-view` already maps to
  `NotebookEditorFacade` at `52-70`; no mapping change is needed.
- `src/renderer/scripting/api-wrapper/TextEditorFacade.ts` - exact `createElements`/page-scope/
  activation reference only.
- `src/renderer/scripting/ai-vision/elements.ts` and
  `src/renderer/scripting/ai-vision/page-elements.ts` - existing visibility, selector, and
  activation infrastructure already supplies the required behavior.
- `src/renderer/editors/notebook/NotebookEditor.ts` - verified model state and methods are
  sufficient; no new notebook model state or execution method is planned.
- `src/renderer/editors/notebook/NoteItemViewModel.ts` and
  `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` - existing model callback paths
  are forwarded; no view-owned selection or execution bridge is added.
- `src/renderer/editors/notebook/index.ts`, `NotebookBodyView.ts`, `NoteItemView.ts`,
  `ExpandedNoteView.ts`, and `note-editor/*` - all curated names already exist and no existing
  `data-name`/`data-type` is renamed; repeated/unnamed controls are handled by the facade contract.
- `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts` and
  `NotebookTagsSecondaryView.ts` - existing panel names remain unchanged; their controls are
  cross-referenced to `page.panels` and are not duplicated here.
- `src/renderer/editors/notebook/category-tree.ts` - existing category label remains a structural
  label and is not curated.
- `src/renderer/editors/register-editors.ts` - notebook panel registrations already exist at
  `62-71`.
- `src/renderer/scripting/ai-vision/page-panels.ts` - panel-node ownership is an EPIC-087/US-1323
  concern; this task does not duplicate or redesign the sidebar collection.
- `assets/editor-types/notebook-editor.d.ts` - generated output; never hand-edit.
- `vite.renderer.config.ts` - existing `editorTypesPlugin()` already copies canonical declarations.
- `doc/active-work.md` and `doc/epics/EPIC-087.md` - both already contain the US-1319 link under
  EPIC-087; the dashboard and epic are not changed.
- Unit tests and test harnesses - explicitly out of scope.
