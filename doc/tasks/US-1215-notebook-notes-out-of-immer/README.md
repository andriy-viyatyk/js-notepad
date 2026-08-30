# US-1215 — R5: notebook notes out of immer

## Goal

Move the notebook's growing `NoteItem[]` collection out of Immer-managed editor state while
preserving the existing notebook JSON shape, view behavior, persistence, and reader immutability
contract. State will retain cheap scalar/ID change signals so views repaint when notes change
without an Immer pass over the whole collection.

## Background

`src/renderer/editors/notebook/NotebookEditor.ts` currently has exactly 30 `state.update` call
sites. A source sweep found exactly 21 literal `data.notes` occurrences, but that is not the
producer count: 15 of those occurrences are inside note mutation producers, 6 are direct reads,
and the two `loadData` assignments construct `data.notes` without using the literal. There are
therefore 17 note-data producer sites and 6 direct collection readers in `NotebookEditor` (with
one producer/read loop at line 741). The epic's 30/21 figures are directionally right but must not
be read as 21 producers.

The governing pattern is `doc/architecture/state-management.md:68-87`: an accumulating collection
is a plain model field, `state.update` changes only a version signal, and the view watches the
version then reads the collection from the model. The exact existing mechanisms are:

- `src/renderer/components/file-search/FileSearchModel.ts:65-68,104,126` keeps `allResults` as a
  plain model field, restores it from `savedState?.results`, and keeps only `resultsVersion` in
  reactive state.
- `src/renderer/components/file-search/FileSearchModel.ts:148-178,223-230,331-337,360-370`
  mutates or replaces `allResults`, then bumps `resultsVersion` once per batch/reset/toggle.
- `src/renderer/editors/grid/GridEditor.ts:104-124,165-227,445-459` keeps live rows out of
  state in `_rows`/the attached grid, sends rows directly to the grid in `setRows`, and keeps
  only reactive row metadata (`rowCount`, `displayedRowCount`, and error) in state. The grid view
  receives the live array through `rowsForGrid()` (`:227`) rather than through a frozen state
  array. This is the same ownership boundary, with the grid widget itself serving as the direct
  update signal instead of a row version counter.

The notebook needs the FileSearch-style explicit version because its views are not the owner of a
grid widget. The state representation is two plain model collections—`notes` and
`filteredNotes`—plus scalar `notesVersion`, `notesCount`, `filteredVersion`, and `filteredCount`
signals. `NotebookBodyView` will retain O(1) indexed row access through `getFilteredNoteAt(row)`;
neither collection will be assigned to Immer state. A `Map<string, NoteItem>` maintained alongside
the notes array makes `getNote(id)` and every ID-based producer lookup O(1) as well.

### Verified producer sites

Baseline paths below are exact current locations. `loadData` has two semantic note-array loads;
the remaining 15 sites contain the literal `s.data.notes` or iterate it.

| File:line | Current producer | Change made by the producer |
|---|---|---|
| `src/renderer/editors/notebook/NotebookEditor.ts:241-244` | `loadData` empty-content branch | Replaces the loaded notebook data with an empty `notes` array and empty per-note state. |
| `src/renderer/editors/notebook/NotebookEditor.ts:252-258` | `loadData` parsed-content branch | Replaces the loaded `notes` array with `parsed.notes` when it is an array and restores `parsed.state`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:312-314` | `addNote` | Prepends a newly constructed blank note. |
| `src/renderer/editors/notebook/NotebookEditor.ts:521-524` | `deleteNote` | Removes the matching note and deletes its `data.state[id]` slot. |
| `src/renderer/editors/notebook/NotebookEditor.ts:543-549` | `addComment` | Adds an empty comment and updates `updatedDate` only when no comment exists. |
| `src/renderer/editors/notebook/NotebookEditor.ts:554-560` | `updateNoteComment` | Replaces the comment and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:565-570` | `removeComment` | Sets the comment to `undefined`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:581-587` | `updateNoteContent` | Replaces nested `content.content` and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:592-598` | `updateNoteLanguage` | Replaces nested `content.language` and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:603-609` | `updateNoteEditor` | Replaces nested `content.editor` and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:614-620` | `updateNoteTitle` | Replaces `title` and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:625-631` | `updateNoteCategory` | Replaces `category` and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:637-643` | `addNoteTag` | Appends one tag by replacing the tags array and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:649-655` | `removeNoteTag` | Removes one tag by index and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:661-667` | `updateNoteTag` | Replaces one tag by index and updates `updatedDate`. |
| `src/renderer/editors/notebook/NotebookEditor.ts:706-708` | `createNoteFromLink` | Prepends a note created from a dragged link. |
| `src/renderer/editors/notebook/NotebookEditor.ts:740-748` | `moveCategory` | Changes every note in the moved category subtree; also updates selected-category state in the same Immer callback. |

The 15 literal `data.notes` producer occurrences are at lines `313, 522, 544, 555, 566, 582,
593, 604, 615, 626, 638, 650, 662, 707, 741`. The six literal direct readers are at lines
`276, 332, 377, 455, 577, 728`; line 741 is both a read and a mutation producer.

### Verified collection and note readers

These are all current readers found under the notebook editor/views and its script facade. Ranges
are grouped only where every listed line is the same reader behavior.

| File:line | Current read and impact of the move |
|---|---|
| `src/renderer/editors/notebook/NotebookEditor.ts:275-276` | `notesCount` reads collection length; it must read the plain model field or the new `notesCount` state scalar. |
| `src/renderer/editors/notebook/NotebookEditor.ts:332-347` | `loadCategories` scans every note's category and counts; it must scan the model field. |
| `src/renderer/editors/notebook/NotebookEditor.ts:377-397` | `loadTags` scans every note's tags and counts; it must scan the model field. |
| `src/renderer/editors/notebook/NotebookEditor.ts:432-455,457-486` | `applyFilters` starts from the previous filtered result for incremental search or the complete notes collection, then reads category, tags, title, comment, and content. It must use plain notes, update the plain filtered array, and publish only scalar signals. |
| `src/renderer/editors/notebook/NotebookEditor.ts:576-577` | `getNote` finds a note by ID for the facade and note edit models; it must use the O(1) notes map. |
| `src/renderer/editors/notebook/NotebookEditor.ts:728-731` | `moveCategory` counts affected notes before confirmation; it must scan the plain collection. |
| `src/renderer/editors/notebook/NotebookEditor.ts:741-745` | `moveCategory` iterates and reads each note category while changing matching notes. |
| `src/renderer/editors/notebook/NotebookEditor.ts:770-805` | `getNoteHeight`, `getNoteState`, and their setters read/write `data.state`, not the notes collection; this per-note persisted state remains in Immer state and must stay in the serialization selector. |
| `src/renderer/editors/notebook/NotebookBodyView.ts:65-73` | `selectProjection` currently copies `state.data` and `state.filteredNotes` into the body projection; `data` and note objects must disappear from this state projection. |
| `src/renderer/editors/notebook/NotebookBodyView.ts:101-107,129-148` | The virtual grid reads `projection.filteredNotes` by array index, derives note kind/height, and passes note objects to `NoteItemView`; after the move it must call the O(1) `NotebookEditor.getFilteredNoteAt(row)` accessor. |
| `src/renderer/editors/notebook/NotebookBodyView.ts:221-227` | The body uses `previous.data !== next.data` and `previous.filteredNotes !== next.filteredNotes` as cell-change gates; replace these with `notesVersion`/`filteredVersion` scalar gates. |
| `src/renderer/editors/notebook/NotebookBodyView.ts:239-246,335-336` | It reads total-note length and looks up the expanded note from `projection.data.notes`; use the scalar count and O(1) `editor.getNote`. |
| `src/renderer/editors/notebook/index.ts:201-205` | The footer reads filtered length and `state.data.notes.length`; subscribe to the new `filteredCount`/`notesCount` scalar signals. |
| `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts:7-8,53-61` | The public facade maps all notes and exposes each note's fields and tags. It must call the model accessor; preserve the detached public shape and do not leak a mutable internal tags array. |
| `src/renderer/editors/notebook/NoteItemView.ts:62,85,92,110-116,224-239,265,301-305,315-321,343,407` | The row view reads ID, title, updated date, category, tags, comment, and drag ID; handlers use the ID. It does not mutate the note. |
| `src/renderer/editors/notebook/NoteItemViewModel.ts:53-66,75,88-165` | The row model compares note IDs, copies category/tag edit values, compares old category/tag/comment values, and forwards ID-based mutations. It does not compare note object identity or mutate note objects. |
| `src/renderer/editors/notebook/ExpandedNoteView.ts:71,75-76,136,168-171,197,252-274,319,344-369` | The expanded view reads the same note fields, creates editor/comment/tag handlers, and syncs after body updates. It has no note object identity gate and does not mutate notes directly. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts:197,204-208,225,316-349` | The nested editor snapshots note content/language/editor/title, repoints by ID, and compares content fields (not object identity) during sync. |
| `src/renderer/editors/notebook/note-editor/MiniTextEditorView.ts:89-94` | Repointing receives a note and uses its ID for Monaco view-state capture/restore; no collection read or note mutation. |

`NotebookCategoriesSecondaryView.ts:90-97` and `NotebookTagsSecondaryView.ts:89-96` subscribe
only to derived `categories`/`tags`, selection, and counts. They do not read `data.notes` and need
no subscription change if those derived state fields remain. `NoteItemActiveEditorView.ts:66-74`
accepts a note only for repointing the active editor and has no collection selector.

### Persistence and state boundary (verified)

The notes are content data, not editor-descriptor state:

1. `NotebookEditor.onDataChanged` at `src/renderer/editors/notebook/NotebookEditor.ts:224-233`
   reads `state.data`, skips parse errors and duplicate `lastSerializedData`, then serializes
   exactly `JSON.stringify({ type: "note-editor", ...data }, null, 4)` and calls
   `writeToHost(content, true)`.
2. `NotebookEditor.loadData` at `:238-269` reads the host content, parses JSON, restores
   `parsed.notes` (or `[]`) and `parsed.state` (or `{}`), then rebuilds categories, tags, and
   filters. Empty content produces `{ notes: [], state: {} }`.
3. `TextHostEditorModel.writeToHost` at `src/renderer/editors/base/TextHostEditorModel.ts:268-276`
   calls `TextFileModel.changeContent`; `TextFileModel.changeContent` at
   `src/renderer/editors/text/TextEditorModel.ts:272-280` updates host content/modified state and
   marks the host modification unsaved.
4. `TextFileIOModel.doSaveModifications` at
   `src/renderer/editors/text/TextFileIOModel.ts:334-360` writes the host content to the cache
   pipe (or `appFs.saveCacheFile` fallback). Explicit file save writes the same host content via
   `TextFileIOModel.saveFile` (`:85-117`). `NotebookEditor.saveState`/`dispose` at
   `NotebookEditor.ts:811-821` flush `onDataChanged` before delegating to host save/dispose.
5. `TextHostEditorModel.getRestoreData` at `:155-166` persists only editor identity/metadata and
   the host descriptor. `PagesPersistenceModel.saveState` at
   `src/renderer/api/pages/PagesPersistenceModel.ts:49-66` stores page descriptors in
   `openFiles.txt`, and restore passes the host descriptor through `applyRestoreData` and host
   restore (`:107-118,153-161`). Notebook JSON notes therefore come from the host source/cache
   content, not from `NotebookEditorState.data` in `openFiles.txt`.

The move must keep the serialized bytes' semantic shape unchanged: `type`, `notes` as the same
array of note objects, and `state` as the same per-note state map. It must replace the
reference-only `lastSerializedData` gate with a snapshot containing `notesVersion` plus the
`data.state` identity/version, so a plain-field note mutation and a `setNoteState`/`setNoteHeight`
change both serialize, while a load does not echo unchanged content back to the host.

### Freeze and identity findings (verified)

`src/renderer/core/state/state.ts:8-42,60-73` confirms every `state.update` runs Immer `produce`
and that selector comparison treats arrays by reference. The current notes and nested content/tags
become frozen through the state result. After extraction, plain parsed/new objects would otherwise
be mutable.

- No notebook reader mutates a note object. `NoteItemView`, `ExpandedNoteView`,
  `NoteItemViewModel`, `NoteItemEditModel`, and `MiniTextEditorView` read fields or pass IDs.
- `NoteItemViewModel` and `NoteItemView` compare only `note.id`; there is no `prevNote !== nextNote`
  gate. `NoteItemEditModel.syncFromNote` compares content/language/editor values at
  `NoteItemEditModel.ts:337-359`, so replacing a note object or mutating the old object before the
  state signal both remain observable through field values.
- `NotebookBodyView` does rely on immutable identity, but only for its state projection gates:
  `previous.data !== next.data` and `previous.filteredNotes !== next.filteredNotes` at
  `:227`. These identities disappear with the state shape and must be replaced with explicit
  `notesVersion` and `filteredVersion` scalar comparisons. `CellRecord.note` is bookkeeping, not
  a gate. The row accessor must remain an array index, not an ID lookup.
- `NotebookEditor.lastSerializedData` at `:117,229-231,246,259-260` relies on data identity only
  to suppress duplicate serialization. Replace it with version/state snapshot comparison.
- `NotebookEditorFacade.mapNote` currently returns `note.tags` at `:60`; that array was frozen by
  Immer. The replacement must return a detached tags array so callers cannot mutate internal
  notebook state through the facade. The internal note itself is shallow-frozen; nested containers
  are deliberately not recursively frozen because the audit found no reader that mutates them.

The implementation should preserve the old read-only behavior at the realistic mutation boundary:
keep both model collections private, shallow-freeze each note object with `Object.freeze(note)`, and
update one note by copy-on-write replacement. Do not recursively freeze `content` or `tags`, and do
not freeze either private collection array because insertion/filter replacement must still mutate
those arrays. This gives O(1) note replacement plus the required version bump without nested freeze
walks; inherently collection-wide operations (`deleteNote`, category moves, filtering) retain their
necessary scans. `NotebookEditorFacade.mapNote` still returns a detached tags array because it
crosses into user script code.

### How views learn about changes (current and planned)

Today `NotebookEditor.adoptHost` subscribes to `{ data, error }` at `NotebookEditor.ts:203-208`
and debounces serialization. `NotebookBodyView` subscribes with `selectProjection` at
`NotebookBodyView.ts:190-193`; the projection carries `data` and `filteredNotes`, so note updates
reach it first through Immer reference changes and then through `applyFilters`. The footer binds
`selectNotebookFooter` at `index.ts:279-281`; the category and tag sidebars subscribe to their
derived slices. Row views are not editor-state subscribers: the body calls `record.view.update`
inside the virtual-cell renderer at `NotebookBodyView.ts:129-148`, and the expanded overlay is
resynced at `:333-361` after the body handles state.

Afterward, the notebook state must publish `notesVersion` for every note collection/item change,
`notesCount` for the footer's total, and `filteredVersion`/`filteredCount` after each filter
recompute. `NotebookBodyView` must select those scalars and read the plain filtered array through
the O(1) `editor.getFilteredNoteAt(row)` accessor; no selector or projection may read
`state.data.notes` or retain either `NoteItem[]` collection in state. `NotebookEditor`'s
serialization selector must select `notesVersion`, `data.state`, and `error`. Category/tag
subscriptions stay on their existing derived slices, but their producers must run after every
relevant plain-note update as they do today.

### Undo, dirty tracking, and autosave (verified)

There is no notebook collection undo/redo implementation or separate notebook dirty tracker. The
embedded Monaco editor owns text undo/redo; its change callback reaches
`NoteItemEditModel.changeContent` (`NoteItemEditModel.ts:261-268`) and then
`NotebookEditor.updateNoteContent`, so the same callback/version path remains required. Notebook
note mutations do not set `NotebookEditorState.modified` directly.

Dirty state and autosave belong to the adopted `TextFileModel`: notebook serialization calls
`writeToHost(..., true)`, which sets host `modified` and invokes `io.markModificationUnsaved`; the
host debounce writes the serialized JSON to its cache. Page save calls each editor's `saveState`,
and the notebook flushes its serialization before host save. The move must therefore preserve the
host write on every notes-version change and keep `data.state` changes in the serialization
selector. No undo/redo or global dirty-tracking file needs a notes-collection subscription.

### Investigation commands

Commands used to verify the baseline and trace the surface:

```text
rg -n "state\.update|data\.notes|notes" src/renderer/editors/notebook/NotebookEditor.ts
rg -n "notes|filteredNotes|NotebookEditorState|state\.data|props\.note|model\.props\.note|note\.content|note\.title|note\.category|note\.tags|note\.comment|note\.updatedDate|note\.id" src/renderer/editors/notebook src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts
rg -n "NotebookData|data\.notes|\.notes" src/renderer | rg "notebook|Notebook|note"
rg -n "getRestoreData|applyRestoreData|saveState|writeToHost|changeContent|markModificationUnsaved|doSaveModifications|cachePipe\.writeText|saveCacheFile" src/renderer/editors/notebook/NotebookEditor.ts src/renderer/editors/base/TextHostEditorModel.ts src/renderer/editors/text/TextEditorModel.ts src/renderer/editors/text/TextFileIOModel.ts src/renderer/api/pages/PageModel.ts src/renderer/api/pages/PagesPersistenceModel.ts
rg -n "state\.update|resultsVersion|allResults|rowsForGrid|liveRows|_rows" doc/architecture/state-management.md src/renderer/editors/grid/GridEditor.ts src/renderer/components/file-search/FileSearchModel.ts
```

PowerShell count checks used alongside the sweeps:

```text
$matches = Select-String -Path src/renderer/editors/notebook/NotebookEditor.ts -Pattern "data\.notes"; $matches.Count
$updates = Select-String -Path src/renderer/editors/notebook/NotebookEditor.ts -Pattern "state\.update"; $updates.Count
```

## Implementation Plan

- [ ] In `src/renderer/editors/notebook/NotebookEditor.ts`, remove `notes` from the Immer-owned
  `NotebookEditorState.data` shape and add two private plain collections (`notes` and
  `filteredNotes`) plus scalar `notesVersion`, `notesCount`, `filteredVersion`, and
  `filteredCount` state fields. Maintain a private `Map<string, NoteItem>` alongside `notes` for
  O(1) ID lookup. Normalize loaded/new/link-created notes through one `Object.freeze(note)`
  shallow-freeze helper; do not recursively freeze `content` or `tags`.
- [ ] Add model-only accessors for the complete collection, O(1) ID lookup, and indexed filtered
  row access (`getFilteredNoteAt(index)`). Keep both arrays and the map private; return shallow-frozen
  note values and never expose the mutable backing arrays. Replace all 17 producer sites with
  copy-on-write note replacement/insertion/removal helpers. Every successful note mutation must
  bump `notesVersion`; update `notesCount` when membership changes; preserve the existing
  category/tag/filter recomputation order and `data.state[id]` cleanup.
- [ ] Rewrite `loadData`, `applyFilters`, `loadCategories`, `loadTags`, `notesCount`,
  `moveCategory`, and the note lookup methods to use the plain collections/map. Compute the full
  filtered array outside `state.update` (retaining the current incremental-search optimization),
  assign it to plain `filteredNotes`, and publish only `filteredVersion`/`filteredCount` scalars.
  Ensure a note-field edit still causes the filtered projection to repaint even when membership and
  order are unchanged.
- [ ] Enforce this ordering rule in every collection mutation helper: (1) mutate/replace `notes`
  and maintain the ID map, (2) recompute `filteredNotes` and all affected derived collections,
  retaining incremental-search behavior inside this recompute step, then (3) issue one synchronous
  `state.update` that bumps the relevant `notesVersion`/`filteredVersion` and count scalars. No
  version notification may be published while `filteredNotes` still contains the pre-edit note.
- [ ] In `src/renderer/editors/notebook/NotebookEditor.ts`, replace `lastSerializedData` with a
  version/state snapshot. Serialize exactly `{ type: "note-editor", notes: plainNotes, state }`
  with the current formatting, skip parse-error writes, mark loaded snapshots as already written,
  and select `notesVersion`, `data.state`, and `error` for the debounced host-write subscription.
  Preserve `saveState` and `dispose` flush ordering.
- [ ] In `src/renderer/editors/notebook/NotebookBodyView.ts`, replace `data`/`filteredNotes` in
  `NotebookProjection` with version/count/filtered-count signals. Resolve each virtual row with
  the O(1) indexed `NotebookEditor.getFilteredNoteAt(row)` accessor and resolve the expanded
  overlay with `editor.getNote`. Replace the `previous.data` and `previous.filteredNotes` identity
  gates with explicit `notesVersion`/`filteredVersion` scalar gates. Ensure the body subscription
  is triggered by `notesVersion` even when filtered membership/order is unchanged.
- [ ] In `src/renderer/editors/notebook/index.ts`, update the footer projection to use the new
  scalar counts and filtered count, preserving its existing selector-gated subscription.
- [ ] In `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts`, replace the direct
  `state.data.notes` read with the model accessor. Preserve the public flattened note shape and
  return a detached copy of tags so the facade cannot mutate the model's internal note data.
- [ ] Re-sweep every notebook source after the edits for `state.data.notes`, `state.filteredNotes`,
  selectors that retain either `NoteItem[]` collection in state, linear ID lookups, and direct note
  mutation. Confirm the category/tag panels and nested note editors still receive their existing
  derived/model signals without adding redundant collection subscriptions.

Before → after shape (the exact field names may follow the existing naming conventions, but the
ownership and signals are required):

```typescript
// Before: NoteItem[] is traversed and mutated inside Immer.
interface NotebookEditorState {
    data: NotebookData;              // data.notes is the large collection
    filteredNotes: NoteItem[];       // also stores NoteItem references in state
}

// After: only bounded state/scalars are Immer-managed; both note arrays are plain.
interface NotebookEditorState {
    data: { state: NotebookData["state"] };
    notesVersion: number;
    notesCount: number;
    filteredVersion: number;
    filteredCount: number;
}

private notes: NoteItem[] = [];
private filteredNotes: NoteItem[] = [];
private notesById = new Map<string, NoteItem>();
```

```typescript
// Before: one note edit invokes Immer over data.notes.
this.state.update((s) => {
    const note = s.data.notes.find((n) => n.id === id);
    if (note) note.title = title;
});

// After: replace one shallow-frozen note, recompute the plain filtered array,
// then publish the signals synchronously.
const note = this.notesById.get(id);
if (note) {
    const index = this.notes.indexOf(note);
    this.notes[index] = freezeNote({ ...note, title, updatedDate: now });
    this.notesById.set(id, this.notes[index]);
    this.recomputeFilteredNotes();
    this.state.update((s) => {
        s.notesVersion += 1;
        s.filteredVersion += 1;
    });
}
```

## Concerns

- **Persisted shape is the highest-risk boundary.** The current disk-facing notebook content is the
  host's JSON text, not `NotebookEditor.getRestoreData`. Any serializer that omits `notes`, changes
  `state`, changes the `type` field, or serializes a stale version silently loses notebook data.
  The implementation must compare a before/after parsed JSON sample and exercise reopen/restore;
  if the exact byte formatting or host write timing cannot be preserved, stop and resolve that
  before implementation.
- **Freeze semantics must remain intentional.** Removing Immer removes automatic deep freezing.
  Shallow-freeze each note object with `Object.freeze(note)` and use copy-on-write for edits, but do
  not recursively freeze `content` or `tags`: the audit found no reader that mutates those nested
  containers, and recursive walks would add work to every load/edit. Keep the detached facade tags
  copy because it crosses into user script code. This intentionally differs from US-1214's live
  log-entry references: notebook notes have seventeen interactive producers and an editing UI,
  while log entries are append-mostly with a single updater path.
- **Identity and synchronous subscriptions.** The collection ordering invariant is explicit:
  (1) mutate/replace `notes` and maintain `notesById`; (2) recompute plain `filteredNotes` and all
  affected derived collections, including the existing incremental-search optimization; (3) only
  then publish one synchronous state update for the version/count scalars. `TOneState` notifies
  synchronously, so a version published before filtered recomputation would render a stale row with
  no second notification to correct it. `NotebookBodyView` must use `getFilteredNoteAt(row)` as an
  array-index access, never turn a row render into an ID-to-note scan.
- **Derived state ordering.** Existing methods issue a note mutation state update and then call
  category/tag/filter rebuilds, which can produce an intermediate synchronous body update. The new
  ordering rule deliberately moves the single collection-change notification after plain
  `filteredNotes` and derived collections are current; preserve that rule while proving that the
  virtual grid, expanded overlay, and sidebar do not observe stale intermediate data.
- **Nested editor state is separate.** `data.state` contains note heights and embedded editor
  settings. It stays in Immer state and must continue to trigger serialization, even though it is
  not part of the notes collection or `notesVersion`.
- **No implementation/test scope expansion.** This task changes source and this task document only.
  The project does not use unit tests; do not add tests or test harnesses. Do not add a dashboard
  entry because EPIC-077 already tracks US-1215.

## Acceptance Criteria

- [ ] `NotebookEditor.ts` has no `state.data.notes` access and no `NoteItem[]` collection stored in
  Immer state; the plain model collection is private and every note mutation publishes
  `notesVersion`.
- [ ] The verified baseline is reflected in the implementation: 30 original `state.update` sites,
  21 original literal `data.notes` occurrences, 17 semantic note producers, and 6 direct
  collection readers are all accounted for; no producer or reader is silently left on the old
  state path.
- [ ] Notebook JSON written through `onDataChanged` retains the exact persisted shape and note/state
  values. Load, debounced edit, explicit save, shutdown flush, cache restore, and source restore
  preserve notes and per-note state.
- [ ] Notebook note objects are shallow-frozen at the model boundary, while `content` and `tags` are
  not recursively frozen; the facade returns a detached tags copy. The audited notebook readers do
  not mutate note objects or nested containers, and note replacement preserves note IDs and
  nested-editor synchronization.
- [ ] `NotebookBodyView`, `NotebookEditorView`'s footer, and all note/expanded views learn about
  note changes through explicit scalar version/count signals; no selector reads `state.data.notes`,
  and a field edit with unchanged filter membership updates the correct row/editor.
- [ ] `NotebookBodyView` reads each visible filtered row through an array-index accessor such as
  `getFilteredNoteAt(row)`, not by scanning the full notes collection or resolving an ID per row.
- [ ] `getNote(id)` and all ID-based producer lookups use the maintained `Map<string, NoteItem>` and
  are O(1); filtered recomputation is outside `state.update`, so no large note or filtered array is
  copied by Immer.
- [ ] Category/tag derived views still update after category/tag/note membership changes; note
  height and embedded editor state still serialize through `data.state`.
- [ ] Undo/redo behavior for embedded Monaco content remains intact, host modified/dirty state and
  autosave still follow `writeToHost`/`TextFileIOModel`, and notebook save/dispose still flushes.
- [ ] The final source sweep and the commands used for it are recorded in this document. No tests,
  test harnesses, or dashboard entries are added.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/editors/notebook/NotebookEditor.ts` | Plain notes and filtered-notes collections, version/count signals, O(1) ID map, copy-on-write/shallow-freeze helpers, readers, persistence, and subscription changes. |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | Consume note/filter signals and resolve visible notes through indexed model access; replace old state identity gates. |
| `src/renderer/editors/notebook/index.ts` | Footer projection reads new count signals. |
| `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts` | Read notes through the model accessor and protect the public tags array. |
| `src/renderer/editors/notebook/notebookTypes.ts` | No change expected; `NotebookData` remains the persisted `{ notes, state }` contract. |
| `src/renderer/editors/notebook/NoteItemView.ts` | No change expected; it already consumes note props and has no object-identity gate or direct mutation. |
| `src/renderer/editors/notebook/NoteItemViewModel.ts` | No change expected; it compares IDs/field values and forwards ID-based commands. |
| `src/renderer/editors/notebook/ExpandedNoteView.ts` | No change expected; it consumes note props and has no collection selector or identity gate. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | No change expected; its note synchronization is field-based and its persisted state uses the notebook model API. |
| `src/renderer/editors/notebook/note-editor/MiniTextEditorView.ts` | No change expected; it only uses note IDs for view-state capture/repoint. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditorView.ts` | No change expected; it repoints the supplied nested editor model and does not read the collection. |
| `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts` | No change expected; subscribes to derived categories only. |
| `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts` | No change expected; subscribes to derived tags only. |
| `src/renderer/editors/base/TextHostEditorModel.ts` | No change expected; existing host write/restore contract remains the persistence boundary. |
| `src/renderer/editors/text/TextEditorModel.ts` | No change expected; host dirty/autosave signaling remains driven by `changeContent`. |
| `src/renderer/editors/text/TextFileIOModel.ts` | No change expected; it persists the unchanged host content. |
| `src/renderer/api/pages/PageModel.ts` | No change expected; page save delegates to editor save state. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | No change expected; session descriptors contain the host descriptor, not notebook JSON data. |
| `doc/architecture/state-management.md` | No change expected; the existing plain-field/version pattern is sufficient. |
