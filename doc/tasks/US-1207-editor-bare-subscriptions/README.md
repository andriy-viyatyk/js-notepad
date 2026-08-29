# US-1207 — Editor bare subscriptions: triage and convert hot listeners

## Goal

Triage every match in the epic’s 44-row `editors/` bare-subscription census,
then convert only subscriptions whose callbacks are dominated by unrelated
state or observe hot/global state. Accepted whole-state subscriptions remain
with a source-backed reason; the triage itself is a successful deliverable.

This document is the proposed split from US-1202. It records investigation only:
no implementation, tests, or test harnesses have been added.

## Background

The pilot established that a selector-less `state.subscribe(() => ...)` registers
the listener directly and fires on every dispatch
([`state.ts:74-95`](../../../src/renderer/core/state/state.ts#L74-L95)).
That is different from a whole-state selector, which can already be reference-
gated when its state shape is composed of arrays, Maps, and Sets
([`state.ts:18-40`](../../../src/renderer/core/state/state.ts#L18-L40)).

The census was re-run with:

```text
rg -n --glob '*.ts' --glob '*.tsx' '\.subscribe\(\(\) =>' src/renderer/editors
```

It returns 44 matches across 37 files, matching the EPIC-076 Notes addendum.
Four matches are visibly selector-bearing despite the simple line instrument:
`BoardSecondaryView.ts:71`, `FileDiffBodyModel.ts:75-76`, and
`BrowserSecondaryViews.ts:51`; they are included in the table so no census row
is silently dropped. Queue and event-channel subscriptions are also included,
but they are not TOneState selector problems.

Selectors must return primitives/direct references or a fresh plain object of
those values. A fresh array is unequal by identity and fires on every dispatch
([`model-view-pattern.md:384-407`](../../standards/model-view-pattern.md#the-props-pump-convention)).
The proposed conversions below therefore never use `map()` inside a selector.

## Full 44-row triage

Verdicts are intentionally one of the requested three forms. `convert` means
US-1207 should add a selector (or, for the global theme/registry cases, a small
plain-object/direct-reference projection). A `leave` row is not an unresolved
TBD: its reason is the disposition.

| # | Current subscription | Callback reads / dispatch class verified in source | Verdict |
|---:|---|---|---|
| 1 | `src/renderer/editors/base/EditorModel.ts:96` | Sends `descriptorChanged` for any own-state mutation; the base restore descriptor reads the model state at `EditorModel.ts:347-356`. This is an intentional persistence contract, not a view repaint. | **leave — with stated reason: base-model persistence must observe every state mutation** |
| 2 | `src/renderer/editors/base/TextHostEditorModel.ts:247` | Forwards any adopted host-state mutation to `descriptorChanged`; host metadata is then folded into the descriptor at `TextHostEditorModel.ts:245-258`. | **leave — with stated reason: host-to-descriptor persistence forwarding is intentionally whole-state** |
| 3 | `src/renderer/editors/base/PageToolbarView.ts:150` | `textHost.pipeState` is a dedicated one-value channel (`TextEditorModel.ts:83-101`), and `NavPanelButtonView.sync()` reads the current navigator target/pipe at `PageToolbarView.ts:175-205`. It is small and rarely dispatched. | **leave — small view-owned state** |
| 4 | `src/renderer/editors/base/PageToolbarView.ts:231` | `syncSegments()` reads compatible editors, board matches, catalog entries, and installed boards at `PageToolbarView.ts:282-302`; the registry state is `{ entries }` at `custom-editor-registry.ts:69-74` and changes on refresh at `:102-131`. | **convert — selector `state => state.entries`** |
| 5 | `src/renderer/editors/board-info/BoardInfoEditorModel.ts:182` | Adopted host changes send `descriptorChanged`; the callback intentionally reads no view field (`BoardInfoEditorModel.ts:178-187`). | **leave — with stated reason: board-info descriptor persistence forwards all host mutations** |
| 6 | `src/renderer/editors/browser/BrowserBookmarksUIModel.ts:141` | `updateIsBookmarked()` searches the bookmark editor’s link data (`BrowserBookmarksUIModel.ts:158-168`); Link editor state places that data in `state.data` (`LinkEditor.ts:38-57`). | **convert — selector `state => state.data.links` (direct array reference)** |
| 7 | `src/renderer/editors/browser/BrowserBookmarksUIModel.ts:147` | The callback reads only `urlInput` and has a manual previous-value gate (`BrowserBookmarksUIModel.ts:145-153`, with the consumer at `:164-168`). | **convert — selector `state => state.urlInput`** |
| 8 | `src/renderer/editors/env-vars/EnvVarsEditor.ts:79` | `onDataChanged()` reads only `data` and `status` (`EnvVarsEditor.ts:140-151`), while the state also contains selection fields and editor metadata (`EnvVarsEditor.ts:19-39`). | **convert — selector `{ data: state.data, status: state.status }`** |
| 9 | `src/renderer/editors/browser/BrowserBookmarks.ts:76` | The save trigger reads only host `modified` (`BrowserBookmarks.ts:72-80`); host content dispatches are the hot source. | **convert — selector `state => state.modified`** |
| 10 | `src/renderer/editors/draw/DrawEditor.ts:109` | Theme callback reads only `themeState.get().isDark` and writes the editor setting when no explicit host setting exists (`DrawEditor.ts:106-119`). | **convert — selector `state => state.isDark`** |
| 11 | `src/renderer/editors/browser/BrowserSecondaryViews.ts:49` | `nav.state` is the secondary-view model passed as a whole to `SecondaryViewsView` (`BrowserSecondaryViews.ts:42-55`). Its small state is the view’s own open/active/width contract. | **leave — small view-owned state** |
| 12 | `src/renderer/editors/browser/BrowserSecondaryViews.ts:51` | This subscription already has selector `(state) => state.version` (`BrowserSecondaryViews.ts:49-52`), so the census line is not bare. | **leave — with stated reason: already selector-gated** |
| 13 | `src/renderer/editors/browser/BrowserPanelHost.ts:130` | Any `SecondaryViewsModel` change increments the host page `version` (`BrowserPanelHost.ts:122-135`) so the host-side layout consumer sees active panel, width, and open-state changes. | **leave — with stated reason: deliberate whole-secondary-view invalidation into the host version** |
| 14 | `src/renderer/editors/file-diff/FileDiffBodyModel.ts:75` | The subscription has selector `(s) => revKey(s.from)` (`FileDiffBodyModel.ts:71-75`) and resolves only the `from` revision. | **leave — with stated reason: already selector-gated** |
| 15 | `src/renderer/editors/file-diff/FileDiffBodyModel.ts:76` | The subscription has selector `(s) => revKey(s.to)` (`FileDiffBodyModel.ts:75-80`) and resolves only the `to` revision. | **leave — with stated reason: already selector-gated** |
| 16 | `src/renderer/editors/browser/BrowserTorModel.ts:18` | `windowClosing` is an application event channel, not TOneState; it invokes Tor shutdown handling (`BrowserTorModel.ts:14-22`). | **leave — with stated reason: lifecycle event subscription, not selector-less model state** |
| 17 | `src/renderer/editors/board/BoardContentEditorModel.ts:111-113` | Adopted host state forwards to `descriptorChanged`; the model’s documented host-adoption path is at `BoardContentEditorModel.ts:107-115`. | **leave — with stated reason: board-content descriptor persistence forwarding** |
| 18 | `src/renderer/editors/html/HtmlBodyView.ts:43-45` | `typedQueue` is a `ComponentQueue`; its `subscribe()` routes queued/future events (`ComponentQueue.ts:11-37`). The callback is an intentional no-op to drain the focus queue (`HtmlBodyView.ts:43-45`). | **leave — with stated reason: deliberate focus-queue drain, not rendered state** |
| 19 | `src/renderer/editors/html/HtmlBodyView.ts:58-60` | Same deliberate queue-drain subscription after the body model changes (`HtmlBodyView.ts:54-61`). | **leave — with stated reason: deliberate focus-queue drain, not rendered state** |
| 20 | `src/renderer/editors/board/BoardSecondaryView.ts:71` | The call supplies `selector` containing four direct state references at `BoardSecondaryView.ts:61-71`; it is already gated. | **leave — with stated reason: already selector-gated** |
| 21 | `src/renderer/editors/board/board-theme.ts:43-45` | `computeBoardThemePalette()` reads both theme fields and resolves all palette variables (`board-theme.ts:27-34`); `themeState` has exactly `{ id, isDark }` (`theme-state.ts:3-16`). | **convert — selector `{ id: state.id, isDark: state.isDark }`** |
| 22 | `src/renderer/editors/grid/GridEditor.ts:335-345` | Callback reads only `csvDelimiter` and `csvWithColumns`, with a manual two-field comparison (`GridEditor.ts:330-345`). | **convert — selector `{ csvDelimiter: state.csvDelimiter, csvWithColumns: state.csvWithColumns }`** |
| 23 | `src/renderer/editors/graph/GraphBodyView.ts:635` | `typedQueue` is a `ComponentQueue`; the no-op handler intentionally drains queued focus events before the model-state binds at `GraphBodyView.ts:635-638`. | **leave — with stated reason: deliberate focus-queue drain, not selector-less model state** |
| 24 | `src/renderer/editors/svg/SvgBodyView.ts:67-69` | `typedQueue` focus events are drained by an intentional no-op (`SvgBodyView.ts:63-70`). | **leave — with stated reason: deliberate focus-queue drain, not rendered state** |
| 25 | `src/renderer/editors/svg/SvgBodyView.ts:81-83` | Same queue drain after a model replacement (`SvgBodyView.ts:77-84`). | **leave — with stated reason: deliberate focus-queue drain, not rendered state** |
| 26 | `src/renderer/editors/mneme-config/MnemeConfigView.ts:102` | `applyModelState()` consumes connection/running/status/progress/config/inventory state and drives the full control panel (`MnemeConfigView.ts:102-114`); the state is a dedicated config-page model (`MnemeConfigEditorModel.ts:27-46`). | **leave — with stated reason: the view intentionally consumes the complete small model-owned control-panel state; split projections would be a separate panel redesign** |
| 27 | `src/renderer/editors/notebook/NotebookBodyView.ts:198` | `typedQueue` is a focus-event queue and the no-op handler drains it; the rendered notebook state is separately selector-bound at `NotebookBodyView.ts:194-197`. | **leave — with stated reason: deliberate focus-queue drain, not rendered state** |
| 28 | `src/renderer/editors/notebook/NotebookEditor.ts:205` | `onDataChanged()` reads only `data` and `error` (`NotebookEditor.ts:219-231`); note content edits mutate `data.notes` (`NotebookEditor.ts:571-584`), while selection/search fields are separate (`NotebookEditor.ts:30-45`). | **convert — selector `{ data: state.data, error: state.error }`** |
| 29 | `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts:90-93` | `listProps()` reads `tags`, `selectedTag`, and `tagsSize` (`NotebookTagsSecondaryView.ts:96-104`); notebook content/state is hot because note edits update `data.notes` (`NotebookEditor.ts:577-584`). | **convert — selector `{ tags: state.tags, selectedTag: state.selectedTag, tagsSize: state.tagsSize }`** |
| 30 | `src/renderer/editors/notebook/NoteItemView.ts:106` | The subscription belongs to per-row `NoteItemViewModel.state`, whose six fields are transient row-edit state (`NoteItemViewModel.ts:29-44`), and `sync()` consumes the row state (`NoteItemView.ts:222-233`). | **leave — small view-owned state** |
| 31 | `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts:92-95` | `treeProps()` reads categories, selected category, and category sizes (`NotebookCategoriesSecondaryView.ts:98-109`); the enclosing notebook state also carries hot note data (`NotebookEditor.ts:30-45`, `:577-584`). | **convert — selector `{ categories: state.categories, selectedCategory: state.selectedCategory, categoriesSize: state.categoriesSize }`** |
| 32 | `src/renderer/editors/link-editor/LinkEditor.ts:229` | `onDataChanged()` reads only `data` and `error` (`LinkEditor.ts:324-334`), while link state also contains selection/filter fields (`LinkEditor.ts:38-58`). | **convert — selector `{ data: state.data, error: state.error }`** |
| 33 | `src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts:59` | `sync()` reads only `language` and `editor` from the edit model (`NoteItemToolbarView.ts:75-98`); that state also carries content (`NoteItemEditModel.ts:203-213`), making typing unrelated to toolbar structure. | **convert — selector `{ language: state.language, editor: state.editor }`** |
| 34 | `src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts:60` | `sync()` reads only `hasSelection` from the nested editor (`NoteItemToolbarView.ts:95-97`); the nested state is exactly `{ hasSelection, contentHeight }` (`NoteItemEditModel.ts:26-46`). | **convert — selector `state => state.hasSelection`** |
| 35 | `src/renderer/editors/markdown/MarkdownBlockView.ts:186-188` | Callback only needs the dark/light bit used by Mermaid rendering (`MarkdownBlockView.ts:310-320`); `themeState` has `id` and `isDark` (`theme-state.ts:3-16`). | **convert — selector `state => state.isDark`** |
| 36 | `src/renderer/editors/mermaid/MermaidEditor.ts:102-115` | Callback reads only `isDark` and updates `lightMode` when no host override exists (`MermaidEditor.ts:99-115`). | **convert — selector `state => state.isDark`** |
| 37 | `src/renderer/editors/mermaid/MermaidBodyView.ts:136-138` | `typedQueue` no-op drains focus events; model rendering is already projected by `selectMermaidProjection` at `MermaidBodyView.ts:132-138`. | **leave — with stated reason: deliberate focus-queue drain, not rendered state** |
| 38 | `src/renderer/editors/notebook/ExpandedNoteView.ts:161-164` | The local `ExpandedState` has six editing fields (`ExpandedNoteView.ts:28-44`), and `sync()` routes those fields to category/tag/comment branches (`ExpandedNoteView.ts:195-201`). | **leave — small view-owned state** |
| 39 | `src/renderer/editors/link-editor/LinkTreeProvider.ts:305-310` | The callback manually gates on `data.links` identity (`LinkTreeProvider.ts:293-310`); link mutations replace that array while transient filter state must not rebuild the tree (`LinkEditor.ts:44-58`). | **convert — selector `state => state.data.links`; remove the duplicate manual gate** |
| 40 | `src/renderer/editors/log-view/items/MermaidOutputView.ts:54` | `startRender()` reads only `themeState.isDark` and compares it with rendered darkness (`MermaidOutputView.ts:66-70`). | **convert — selector `state => state.isDark`** |
| 41 | `src/renderer/editors/mneme-root/MnemeRootEditorView.ts:317-320` | The callback derives exactly `RootProjection` through `projectState()` (`MnemeRootEditorView.ts:38-52`) and sync consumes that projection (`:328-354`); the projection retains direct array/object references. | **convert — selector `projectState` (fresh plain object, no fresh arrays)** |
| 42 | `src/renderer/editors/settings/sections/ThemeSection.ts:95` | `applySelection()` is passed only `themeState.get().id` (`ThemeSection.ts:91-99`). | **convert — selector `state => state.id`** |
| 43 | `src/renderer/editors/rest-client/RestClientBodyView.ts:104-106` | `typedQueue` is a focus-event queue drained by a no-op; rendered body state is separately selected by `selectBodyProjection` (`RestClientBodyView.ts:101-106`). | **leave — with stated reason: deliberate focus-queue drain, not rendered state** |
| 44 | `src/renderer/editors/rest-client/RestClientEditor.ts:155` | `onDataChanged()` reads only `data` and `error` (`RestClientEditor.ts:177-187`), while the state includes selected request, response, execution, and validation fields (`RestClientEditor.ts:30-45`). | **convert — selector `{ data: state.data, error: state.error }`** |

### Triage result

The 44 census rows resolve to **21 conversions and 23 leaves**. (An earlier draft of this sentence said 17 and 27; the table is authoritative and was always 21/23. The error was caught at implementation time, not in review.) The four
selector-bearing false positives are leaves with explicit reasons. The 17
conversions are the hot/global or dominated-field cases; the leaves are either
intentional persistence/invalidations, small local state, already-gated calls,
or non-state event queues.

## Implementation Plan

Implementation is intentionally deferred until the US-1202/US-1207 split is
approved.

1. Add the exact selectors in rows 4, 6–10, 21–22, 28–29, 31–36, 39–42, and
   44. Use direct references and plain objects only. For rows 8, 28, 32, and
   44, preserve the existing debounced serialization and only gate it on the
   data/error/status values it actually reads.
2. Remove the manual previous-value comparison in
   `BrowserBookmarksUIModel.ts:146-153` after the `urlInput` selector is
   installed. Remove `LinkTreeProvider`’s duplicate `lastLinks` comparison only
   after the selector is active; preserve its direct-array structural behavior.
3. For notebook category/tag projections, keep the `listProps()`/`treeProps()`
   apply callback and stable model methods. Do not allocate `state.tags.map(...)`
   or `state.categories.map(...)` in a selector; derived tree/list values may be
   built in the apply callback.
4. Keep all queue/event rows unchanged. `ComponentQueue.subscribe()` has no
   selector overload and these no-op handlers drain queued focus events; turning
   them into state subscriptions would change behavior rather than fix a pump.
5. Verify each conversion by dispatching unrelated state and the selected slice:
   unrelated dispatches must not call the callback, while the selected change
   must preserve the existing save, render, palette, toolbar, bookmark, and
   list behavior. Exercise serialization, theme changes, notebook category/tag
   selection, link tree edits, and Mneme search. Record manual gaps here.

### Before → after selector shape

The current env-vars persistence listener is a bare subscription at
`EnvVarsEditor.ts:78-81`, while the consumer reads only `data` and `status` at
`:142-151`:

```ts
// Before: selection changes and other editor-state dispatches schedule a save.
this.registerHostSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));
```

```ts
// After: plain-object comparison gates on the values the callback reads.
this.registerHostSubscription(
    this.state.subscribe(
        () => this.onDataChangedDebounced(),
        (state) => ({ data: state.data, status: state.status }),
    ),
);
```

The same shape applies to `LinkEditor.ts:229`, `NotebookEditor.ts:205`, and
`RestClientEditor.ts:155`, substituting `{ data, error }` as documented in the
table. For a direct-array case, `LinkTreeProvider.ts:305-310` becomes a selector
subscription on `state.data.links`; no array is allocated by that selector.

## Concerns

- The grep instrument is intentionally line-based and catches selector-bearing
  multiline calls. The table preserves all 44 rows and distinguishes those
  false positives from true bare subscriptions.
- A fresh array in any selector is prohibited because `compareSelection`
  compares arrays by identity (`state.ts:28-39`). Use direct array references.
- `EditorModel`, `TextHostEditorModel`, BoardInfo, and BoardContent persistence
  subscriptions are intentionally broad. Narrowing them would be a persistence
  contract redesign, not a safe triage conversion.
- `MnemeConfigView` uses its complete dedicated state to update a multi-panel
  control surface. Splitting it would require per-panel projections and is
  explicitly not inferred from the bare-subscription shape.
- Queue subscriptions are not state subscriptions. Preserve their drain
  semantics and do not introduce deferrals.
- Do not fix R4 full-DOM rebuilds, R5 immer collection issues, or R8 timer
  hygiene in these files. Do not add an equality gate to `VanillaView.update()`
  and do not add `queueMicrotask`/`setTimeout(0)` deferrals.
- No editor dynamic import may become static; this task changes subscriptions
  only and must not alter editor loading boundaries.

## Acceptance Criteria

- [ ] All 44 census rows remain represented with a verdict and source-backed
  reason.
- [ ] The 21 conversion rows use selectors that return primitives, direct
  references, or safe plain objects; no selector allocates an array.
- [ ] The 27 leave rows remain unchanged unless a later implementation records
  a new evidence-backed scope decision in this document.
- [ ] Unrelated dispatches do not invoke converted callbacks; selected changes
  still invoke the existing callback and preserve behavior.
- [ ] Persistence, theme, bookmark, grid, notebook, link-tree, Mneme, and
  Mermaid behavior is manually walked, with unverified paths documented.
- [ ] Queue/event subscriptions retain their lifecycle semantics.
- [ ] No changes are made to `VanillaView.update()`, no deferral is introduced,
  no tests are added, and no commit is created.

### Files that need no changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Equality gates are explicitly out of scope. |
| `src/renderer/core/state/state.ts` | Comparison and copy-on-write behavior is evidence, not a change target. |
| `src/renderer/core/state/ComponentQueue.ts` | Queue rows are deliberate event drains and must remain unchanged. |
| `src/renderer/editors/browser/BrowserTorModel.ts` | Its row is a window-closing event subscription, not model state. |
| `src/renderer/editors/file-diff/FileDiffBodyModel.ts` | Both rows are already selector-gated. |
| `src/renderer/editors/board/BoardSecondaryView.ts` | Its row is already selector-gated. |
| `src/renderer/editors/browser/BrowserSecondaryViews.ts:51` | Its host row is already selector-gated; only the nav row is triaged as small local state. |
| `src/renderer/uikit/**` | Shared component props work belongs to US-1203, not the subscription triage. |

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/editors/base/PageToolbarView.ts` | Selector-gate the custom editor registry entries subscription. |
| `src/renderer/editors/browser/BrowserBookmarksUIModel.ts` | Selector-gate bookmark links and URL input. |
| `src/renderer/editors/browser/BrowserBookmarks.ts` | Selector-gate host modified state. |
| `src/renderer/editors/draw/DrawEditor.ts` | Selector-gate theme darkness. |
| `src/renderer/editors/env-vars/EnvVarsEditor.ts` | Selector-gate data/status serialization. |
| `src/renderer/editors/board/board-theme.ts` | Selector-gate the two theme palette inputs. |
| `src/renderer/editors/grid/GridEditor.ts` | Selector-gate CSV delimiter/header settings. |
| `src/renderer/editors/notebook/NotebookEditor.ts` | Selector-gate data/error serialization. |
| `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts` | Selector-gate tags list inputs. |
| `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts` | Selector-gate category tree inputs. |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts` | Selector-gate edit language/editor and Monaco selection. |
| `src/renderer/editors/link-editor/LinkEditor.ts` | Selector-gate data/error serialization. |
| `src/renderer/editors/link-editor/LinkTreeProvider.ts` | Selector-gate direct links array and remove duplicate manual gate. |
| `src/renderer/editors/markdown/MarkdownBlockView.ts` | Selector-gate theme darkness. |
| `src/renderer/editors/mermaid/MermaidEditor.ts` | Selector-gate theme darkness. |
| `src/renderer/editors/log-view/items/MermaidOutputView.ts` | Selector-gate theme darkness. |
| `src/renderer/editors/mneme-root/MnemeRootEditorView.ts` | Selector-gate the existing direct-reference projection. |
| `src/renderer/editors/settings/sections/ThemeSection.ts` | Selector-gate theme id. |
| `src/renderer/editors/rest-client/RestClientEditor.ts` | Selector-gate data/error serialization. |
| `doc/tasks/US-1207-editor-bare-subscriptions/README.md` | Full triage and implementation contract. |
