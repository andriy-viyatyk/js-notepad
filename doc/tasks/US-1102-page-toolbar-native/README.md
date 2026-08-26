# US-1102 — Native page toolbar and reactive switch widget

## Goal

Convert `src/renderer/editors/base/PageToolbar.tsx` (169 lines) to a native
`PageToolbarView`, leaving `PageToolbar.tsx` as a thin `mountVanilla` face for
its React callers. Compose the existing `EditorToolbarView` directly with DOM
children, preserve the toolbar ordering and addressing contract, and move
`SwitchWidget` and `NavPanelButton` to real native subscriptions.

This is US-1102 of [EPIC-067](../../epics/EPIC-067.md), and is deliberately a
separate task because `SwitchWidget` combines five reactive inputs and three
custom React hooks. The task starts after US-1099's `EditorToolbarView` and
US-1101's `TextFileModel.pipeState` channel are available. It does not convert
any PageToolbar caller.

## Background

### Current implementation and composition contract

`src/renderer/editors/base/PageToolbar.tsx:15-42` declares the public face
contract and currently renders one `EditorToolbar` in this exact order:

```tsx
<EditorToolbar name={name} borderTop={borderTop} borderBottom={borderBottom}>
    <NavPanelButton model={model} />
    {children}
    {!noSpacer && <Spacer />}
    {rightContributions}
    <SwitchWidget model={model} />
</EditorToolbar>
```

The comments on `children` and `rightContributions` are the ordering contract:
editor children come first, the automatic spacer comes next unless
`noSpacer`, right contributions follow the spacer, and the switch widget is
last. The native view must retain that order in the DOM and in the flex layout.
`noSpacer` is not a cosmetic option: `VideoView.tsx:52` uses it so the URL
editor fills the row.

The current `EditorToolbarView` in
`src/renderer/editors/base/EditorToolbarView.ts` accepts `children?:
SlotContent`. `EditorToolbarView` must be instantiated as a child view, not
through `mountVanilla` or a React element. Give it one display-contents DOM
container containing the native button/spacer/switch roots and the two
compatibility slot hosts. That DOM container takes `fillSlot`'s Node arm, so
`EditorToolbarView` itself creates no React root. The two React-facing props
still need their own `fillSlot` hosts in `PageToolbarView`, because they must
remain separated by the optional spacer.

The native composition should therefore be structurally equivalent to:

```text
EditorToolbarView.root (data-type="panel", caller/default data-name)
└── span[data-part="page-toolbar-content"] (display: contents; Node slot)
    ├── page-nav-panel IconButtonView (conditional)
    ├── span[data-part="page-toolbar-children"] (display: contents; React slot)
    ├── SpacerView (conditional on !noSpacer)
    ├── span[data-part="page-toolbar-right"] (display: contents; React slot)
    └── page-editor-switch SegmentedControlView (conditional)
```

The `children` and `rightContributions` hosts are owned by
`PageToolbarView`; update them by calling `fillSlot` again without invoking
the previous cleanup first. Dispose the active slot resources exactly once
with the view. The outer DOM container is the only value passed to
`EditorToolbarView.children`, and is consequently a non-React `Node`.

The intended face reduction is:

```tsx
// Before: PageToolbar.tsx owns the JSX, hooks, and both widgets.
export function PageToolbar({ name, model, children, rightContributions,
    noSpacer, borderTop, borderBottom }: PageToolbarProps) {
    return <EditorToolbar /* ordered JSX children */ />;
}
```

```tsx
// After: PageToolbar.tsx remains the React compatibility boundary only.
export function PageToolbar(props: PageToolbarProps): React.ReactElement {
    return mountVanilla(PageToolbarView, props);
}

export function SwitchWidget(props: { model: EditorModel }): React.ReactElement {
    return mountVanilla(SwitchWidgetView, props);
}
```

`PageToolbarProps.children` and `rightContributions` remain
`React.ReactNode` on the face. The native view's corresponding props use
`SlotContent`; the public React types must not be widened or removed while the
seven callers remain React.

### Verified PageToolbar callers and the separate SwitchWidget importer

A renderer-wide JSX search found exactly these seven direct PageToolbar render
sites:

| Caller | Current site | Toolbar name |
|---|---:|---|
| `src/renderer/editors/base/TextChrome.tsx` | 86 | `text-chrome-top` |
| `src/renderer/editors/archive/ArchiveEditorView.tsx` | 58 | `archive-toolbar` |
| `src/renderer/editors/board-info/BoardInfoEditorView.tsx` | 75 | `Board properties` or `Install editor` depending on `isProperties` |
| `src/renderer/editors/category/CategoryEditor.tsx` | 178 | `category-toolbar` |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | 177 | `git-tree-toolbar` |
| `src/renderer/editors/image/ImageView.tsx` | 20 | `image-toolbar` |
| `src/renderer/editors/video/VideoView.tsx` | 52 | `video-toolbar` |

All seven remain React in this task. `src/renderer/editors/base/index.ts:40`
only re-exports the face; it is not another render site.

`SwitchWidget` has one additional importer that is not a PageToolbar caller:
`src/renderer/editors/board/BoardToolbar.tsx:17,160`. It remains unchanged and
continues to receive a React `SwitchWidget` face. The face mounts
`SwitchWidgetView` with `mountVanilla`, so this compatibility use does not
create a second React root; it remains inside BoardToolbar's existing React
tree. The native PageToolbarView composes `SwitchWidgetView` directly and must
not use that face.

### Reactive inputs of SwitchWidget

`SwitchWidget` currently reads these five inputs at
`PageToolbar.tsx:67-114`. Their native forms are verified as follows.

| Current React input | Source and native form | Verdict |
|---|---|---|
| `model.state.use(selector)` | `EditorModel.state` is public `IState`; bind the same projection of `language`, `filePath`, `editor`, and `title` with `VanillaView.bind(model.state, selector, syncSegments)`. | Has a non-React form |
| `useOptionalState(model.contentHost?.state, selector, defaults)` | `IContentHost.state` is public `IState`. Bind `model.contentHost?.state` directly when present, and rebind when the host identity changes. Native lifecycle has no hook-count constraint. | Has a non-React form |
| `customEditorRegistry.useBoardsForFile(fileName)` | `CustomEditorRegistry` extends `TModel`, so its public `state` is an `IState`; `getBoardsForFile(fileName)` is the synchronous projection. Subscribe with `customEditorRegistry.state.subscribe(() => syncSegments())` and read `getBoardsForFile` during the sync. | Has a non-React form |
| `publishedBoards.useCatalogBoardsForFile(fileName)` | `PublishedBoards.state` is private. The existing non-React `catalogBoardsForFile(fileName)` getter does not notify, so extract one private `selectCatalogBoardsForFile(state, fileName)` projection and have both the hook and a new `subscribeCatalogBoardsForFile(fileName, listener)` beside it call that projection. Use the getter for the synchronous read and rebind when `fileName` changes. | Needs one added |
| `boardInstallRegistry.useInstalled()` | `BoardInstallRegistry.state` is private. The existing non-React `listInstalled()` getter does not notify, so extract one private `selectInstalledEntries(state)` projection and have both the hook and a new `subscribeInstalled(listener)` beside it call that projection. Use `listInstalled()` for the synchronous read. | Needs one added |

The two additions are service APIs, not polling or React islands. They must
return the raw `IState.subscribe` unsubscribe function and fire only for the
service projection that the hook exposes. Each service must extract its
projection once: `useCatalogBoardsForFile` and
`subscribeCatalogBoardsForFile` both call the same
`selectCatalogBoardsForFile(...)`, which owns the compatibility and
`matchesCatalogMasks` filtering; `useInstalled` and `subscribeInstalled` both
call the same `selectInstalledEntries(...)`, which owns the `entries`
selection. No filtering, mask, or entries-selection logic may be duplicated
between a hook and its subscription counterpart. `customEditorRegistry` needs
no service change because its inherited public `state` and existing
`getBoardsForFile` already provide both halves.

The native sync must preserve the runtime-neutral merge exactly:

1. Read `model.findCompatibleEditors()`.
2. Derive `filePath` as `hostState.filePath ?? model.filePath`, use
   `isPlainLocalPath`, and derive `fileName` as `filePath ?? hostState.title ??
   editorState.title`.
3. Read trusted matches with
   `customEditorRegistry.getBoardsForFile(fileName ?? "")`, then retain all
   matches for a local path and only `editorKind === "content-host"` otherwise.
4. Read catalog matches with `publishedBoards.catalogBoardsForFile(...)`,
   apply the same non-local gate, and remove a catalog match only when its
   installed entry has the same normalized root as a trusted match. A
   downloaded-but-unregistered entry remains offered.
5. Append trusted editor IDs, append `BOARD_INFO_EDITOR_ID` once when catalog
   matches remain, move that ID to the end if it appeared earlier, and return
   no control when fewer than two IDs remain or the current `model.editorId`
   is absent.
6. Map the IDs to the same `ISegment[]` labels and titles, including the
   non-breaking-space `"  +  "` Board Info label.

The output changes only from a React `SegmentedControl` element to an
`ISegment[]` update on the actual native `SegmentedControlView` class in
`src/renderer/uikit/SegmentedControl/SegmentedControlView.tsx`. The merge,
deduplication, Board Info-last rule, and null conditions move unchanged.
`SegmentedControlView` owns its buttons and its root is named
`page-editor-switch`.

The `model.contentHost?.state` hazard comment at `PageToolbar.tsx:78-81`
must be deleted. Its claim that a conditional `state.use` would render fewer
hooks and crash is React-specific and has no meaning in `PageToolbarView`.
The native implementation must read the optional host state directly, with
explicit subscription ownership, and must not carry that comment into the new
file.

### NavPanelButton: the masked defect and real channels

`NavPanelButton` currently reads three values during render with no
subscription (`PageToolbar.tsx:47-53`):

1. `model.page?.sidebarMandatory` is the `PageModel.sidebarMandatory` getter.
   `PageModel` derives it from every attached editor's
   `contributesPanels()` and the editor state `type !== "fileExplorer"`.
   `PageModel.state.version` is bumped by `attach`, `detach`, and
   `onEditorPanelsChanged`; the latter is subscribed to each editor's
   `secondaryView` slice. Subscribe to `model.page?.state` and run the narrow
   nav projection when its version changes. This catches the actual panel
   membership/panel-list changes; do not subscribe to an unrelated global
   state merely to repaint.
2. `model.getNavigatorTarget()` is the base method returning `null` in
   `EditorModel.ts:293-295`, and the only overrides are the text-host method
   in `TextHostEditorModel.ts:141-146` and `VideoEditor.ts:392-394`. Among the
   six direct non-TextChrome callers, Archive, Board Info, Category, Git Tree,
   and Image inherit the constant-null base method, so their native nav button
   is absent and no target channel is needed; this is proved by the complete
   override search, not assumed from editor names. Video reads only
   `state.filePath`; `video/index.tsx:16-26` seeds it before mounting and the
   renderer contains no later write to that field, so it cannot change while
   that toolbar is mounted. Text-host editors are different: the override
   reads host presence, `host.state.filePath`, and the plain `host.pipe`.
   Subscribe to the host state for `filePath` and to US-1101's
   `TextFileModel.pipeState` for pipe replacement/clear. The click handler must
   resolve `model.getNavigatorTarget()` at click time so it cannot retain an
   obsolete pipe/path object.
3. `model.page?.canOpenNavigator(target.pipe, target.filePath)` is
   `PageModel.canOpenNavigator` at `PageModel.ts:643-648`. It returns true when
   an Explorer already exists, a secondary-views model exists, the target
   pipe's provider type is `"file"`, or `filePath` is truthy. The page-state
   channel covers Explorer/secondary-model creation and editor attach/detach;
   the target path/pipe channels cover the two target-dependent branches.

`NavPanelButtonView` must therefore create/update/dispose an
`IconButtonView` named `page-nav-panel` from those specific channels. It must
not port the current accidental re-render behaviour and must not add a
blanket repaint subscription. Its visibility rules remain exact: absent when
`sidebarMandatory` is true, when the target is `null`, or when a non-empty
target fails `canOpenNavigator`; present for an empty `{}` target and for a
non-empty target that passes the page gate. The native click calls the current
page's `toggleNavigator(target.pipe, target.filePath)`.

### Data-name and conditional DOM contract

The addressing rules in
[`doc/architecture/ui-element-contract.md`](../../architecture/ui-element-contract.md)
make these outputs part of the view's DOM contract:

| Element | Required `data-name` | Presence |
|---|---|---|
| Native `EditorToolbarView` root | caller `name`, or `editor-toolbar` when `name` is absent | The toolbar root remains the mounted PageToolbar element; changing the Board Info mode updates `Board properties` ↔ `Install editor` in place. `hideWhenEmpty` may hide its row, but the named native root is not replaced. |
| `NavPanelButtonView` root | `page-nav-panel` | Absent for mandatory sidebars, base-method `null`, a null target, or a gated non-empty target; present for the permitted empty/non-empty target cases. |
| `SwitchWidgetView` / `SegmentedControlView` root | `page-editor-switch` | Absent when the merged ID list has fewer than two entries or does not include `model.editorId`; present otherwise. |
| Caller-provided children and right contributions | Their existing names | Their conditional names disappear when the React caller supplies `null`/`undefined` or conditionally omits those elements. PageToolbar must not invent or rename those caller-owned names. |

The seven verified toolbar names are `text-chrome-top`, `archive-toolbar`,
`Board properties` / `Install editor`, `category-toolbar`,
`git-tree-toolbar`, `image-toolbar`, and `video-toolbar`; the default
`editor-toolbar` remains for any caller that omits `name`. The native panel
attributes must update in place, not recreate the root when a caller name or
conditional child changes.

### React-root prediction for this intermediate epic state

The seven React callers continue to pass `children` and/or
`rightContributions` as `ReactNode`. `PageToolbarView` therefore has one
compatibility root for each non-empty React-shaped seam. The table is the
predicted delta introduced by this conversion per PageToolbar instance; it is
not a claim that the caller itself is converted.

| React caller | `children` seam | `rightContributions` seam | Predicted PageToolbar delta |
|---|---|---|---:|
| `TextChrome` | React children array/fragment | React fragment (including conditional contents) | +2 |
| `ArchiveEditorView` | absent | React fragment with collapse/refresh buttons | +1 |
| `BoardInfoEditorView` | absent | absent | +0 |
| `CategoryEditor` | Breadcrumb when a provider exists | Search portal when a provider exists | +0 when no provider; +2 with provider |
| `GitTreeEditorView` | React Panel group | React refresh button | +2 |
| `ImageView` | absent | `mountVanilla(ImageToolbarView, ...)` React element | +1 |
| `VideoView` | React URL-input Panel | absent | +1 |

`BoardToolbar`'s separate `SwitchWidget` compatibility face adds no new root:
the `mountVanilla` host is rendered inside BoardToolbar's already-existing
React root. `EditorToolbarView` adds no additional slot root in PageToolbar,
because it receives the DOM `page-toolbar-content` node.

These are EPIC-067's expected intermediate compatibility costs under §E9-4,
not a regression to attribute to US-1102. The epic's documented chrome-pinned
peak is 4–5 roots while React callers remain, then the roots drain as US-1103
through US-1107 convert the parents/callers. Measure `[data-react-root]`, not
the broader `data-part="react-slot"` marker, and report the per-caller seam
counts without netting in later task reductions.

## Implementation Plan

- [ ] Add `src/renderer/editors/base/PageToolbarView.ts` with a public
  `PageToolbarView extends VanillaView<PageToolbarViewProps>`. Keep the root
  layout-neutral, instantiate and own `EditorToolbarView`, and build the
  `page-toolbar-content` DOM node and its two display-contents compatibility
  hosts during mount. Pass that DOM node directly as `EditorToolbarView`
  `children`; never mount `EditorToolbarView` through `fillSlot` or React.
- [ ] Implement the exact fixed order `NavPanelButtonView`, children slot,
  optional `SpacerView`, right-contribution slot, and `SwitchWidgetView` under
  the EditorToolbar node. Use `IconButtonView`, `SpacerView`, and
  `SegmentedControlView` directly, register them with `child()`, mount them
  after their roots are attached, and release conditional children without
  leaking listeners or state subscriptions. Preserve `borderTop`,
  `borderBottom`, `name`, and `noSpacer` updates through the existing
  `EditorToolbarView` props.
- [ ] Move `SwitchWidget`'s merge calculation unchanged into the native view.
  Bind the same `model.state` and optional content-host projections, subscribe
  to `customEditorRegistry.state`, add and use
  `publishedBoards.subscribeCatalogBoardsForFile`, and add and use
  `boardInstallRegistry.subscribeInstalled`. Rebind filename-dependent
  service subscriptions when the derived filename changes. Update one
  `SegmentedControlView` with the resulting `ISegment[]`, or remove its root
  when the existing null conditions apply. Keep the `onSwitch` action as
  `void model.page?.switchMainEditor(newEditorId)`.
- [ ] Add `subscribeCatalogBoardsForFile(fileName, listener)` to
  `src/renderer/api/published-boards.ts` beside `useCatalogBoardsForFile`;
  extract a private `selectCatalogBoardsForFile(state, fileName)` projection
  and refactor both the hook and subscription to call it, so compatibility and
  `matchesCatalogMasks` filtering have one definition. Add
  `subscribeInstalled(listener)` to
  `src/renderer/api/board-install-registry.ts` beside `useInstalled`; extract a
  private `selectInstalledEntries(state)` projection and refactor both the hook
  and subscription to call it, so `entries` selection has one definition. Do
  not expose or poll private state, and do not change either React hook's
  public behaviour.
- [ ] Implement `NavPanelButtonView` with only the verified channels:
  `page.state` for page version/sidebar topology; the relevant editor state
  or host state `filePath` channel; and US-1101's `TextFileModel.pipeState` for
  text-host pipe replacement/clear. Use the base-method/Video source findings
  above to avoid subscriptions that cannot affect the current model. Re-read
  all three inputs in one narrow nav projection, create/remove the named
  `IconButtonView` as visibility changes, and resolve the target afresh in the
  click handler.
- [ ] Reduce `src/renderer/editors/base/PageToolbar.tsx` to the existing
  React-facing props and two thin `mountVanilla` faces: `PageToolbar` for
  `PageToolbarView` and the separately imported `SwitchWidget` face for
  `SwitchWidgetView`. Remove all React hooks, JSX implementation, React
  `SegmentedControl`/`IconButton`/`Spacer` imports, and the conditional-hook
  hazard comment. Do not alter any of the seven PageToolbar callers or
  `BoardToolbar.tsx`.
- [ ] After implementation, run `npm run typecheck`, `npm run lint`, and
  `npm run build-prod` (no unit tests or test harnesses). Manually inspect the seven caller shapes,
  no-spacer Video layout, conditional nav/switch names, Board Info name
  updates, switch option ordering/deduplication, and disposal/reopen cycles.
  Re-measure the six surviving React PageToolbar callers as required by
  EPIC-067, using `[data-react-root]` and recording the expected intermediate
  peak rather than calling it a task regression.

## Concerns

1. **US-1101 is a required channel dependency.** The current source before
   US-1101 has `TextFileModel.pipe` as a plain field. US-1101's investigated
   solution is the non-persisted `pipeState: TOneState<IContentPipe | null>`
   published by `TextFileIOModel.setPrimary()` and `dispose()`. US-1102 must
   consume that concrete channel; it must not recreate a file-path repaint or
   silently accept stale pipe data. If the predecessor lands a differently
   named channel, reconcile the API before implementation rather than adding a
   second pipe source here.
2. **Optional host identity is a lifecycle edge.** `BoardInfoEditorModel` and
   `TextHostEditorModel` can extract/adopt a host during editor switching.
   Native code must unsubscribe the old `contentHost.state`/`pipeState` and
   bind the new host, while the normal page switch disposes the old toolbar.
   The direct `model.contentHost?.state` read is safe because it is ordinary
   native code; the old hook-count comment is not to be preserved.
3. **Slot ownership and root accounting are separate.** The parent owns the
   two `fillSlot` hosts; `EditorToolbarView` owns only its DOM Node slot, and
   `SegmentedControlView` owns its button children. Do not pre-clean a slot,
   mutate around `fillSlot`, or count `data-part="react-slot"` as a React root.
4. **The BoardToolbar export is load-bearing.** Removing `SwitchWidget` or
   changing it to a native-only export would break the separate React importer.
   Keep one `SwitchWidgetView` implementation and a thin React face, with no
   changes to BoardToolbar.
5. **A switch update is not a repaint.** The native sync must be invoked by
   the five named data channels and the explicit derived filename/host
   rebinding logic. Do not subscribe to all model/page state merely because
   it is convenient; doing so would reproduce the §6.1 masked defects.
6. **No parent conversion is in scope.** TextChrome and all six direct
   non-TextChrome callers remain React. Later tasks own their root reductions;
   this task reports the bounded intermediate peak from the compatibility
   seams.

There are no unresolved design questions: the native SegmentedControl class,
the three custom-hook verdicts, the service subscription additions, the nav
channels, the caller set, and the root/name contracts are all resolved from
source.

## Acceptance Criteria

- [ ] `src/renderer/editors/base/PageToolbarView.ts` is the sole native
  PageToolbar/SwitchWidget implementation and uses public native constructors.
- [ ] `PageToolbar.tsx` contains only the unchanged React-facing prop
  contracts and thin `mountVanilla` faces for `PageToolbarView` and
  `SwitchWidgetView`; the conditional `useOptionalState` hook hazard comment
  is gone.
- [ ] `EditorToolbarView` is composed directly and receives a DOM Node, so
  its `fillSlot` call takes the non-React arm. The rendered order is
  children → optional spacer → right contributions → switch, with the nav
  button before children and `noSpacer` preserved.
- [ ] `SwitchWidget` subscribes natively to the exact five inputs: editor
  state, optional host state, custom registry state, catalog service
  subscription, and install-registry service subscription. The custom-hook
  verdicts are: `customEditorRegistry.useBoardsForFile` has a non-React form;
  `publishedBoards.useCatalogBoardsForFile` needs one added;
  `boardInstallRegistry.useInstalled` needs one added.
- [ ] Each hook/subscription counterpart shares one extracted service
  projection: catalog compatibility and `matchesCatalogMasks` filtering, and
  installed `entries` selection, are not duplicated between React and native
  paths.
- [ ] The merged segments, trusted/catalog filtering, deduplication, Board
  Info-last rule, labels/titles, null conditions, current-value selection, and
  switch action match the React implementation. The output is an
  `ISegment[]` supplied to native `SegmentedControlView`.
- [ ] `NavPanelButtonView` has real page/target channels, preserves the exact
  visibility gates, resolves its click target freshly, and has no blanket
  repaint. Base-method constant-null models and Video's pre-mount-only path
  are not given fictional subscriptions.
- [ ] `data-name` output is preserved: caller/default toolbar names,
  `page-nav-panel`, and `page-editor-switch`; named conditional elements
  disappear under the documented conditions without replacement-root churn.
- [ ] All seven PageToolbar caller files and `BoardToolbar.tsx` are unchanged.
  React-root measurements use `data-react-root` and match the per-caller
  intermediate seam predictions without claiming the later EPIC-067 drain.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass. No
  unit tests or test harnesses are added, and no commit is created.

### Files that need NO changes

- `src/renderer/editors/base/TextChrome.tsx`
- `src/renderer/editors/archive/ArchiveEditorView.tsx`
- `src/renderer/editors/board-info/BoardInfoEditorView.tsx`
- `src/renderer/editors/category/CategoryEditor.tsx`
- `src/renderer/editors/git-tree/GitTreeEditorView.tsx`
- `src/renderer/editors/image/ImageView.tsx`
- `src/renderer/editors/video/VideoView.tsx`
- `src/renderer/editors/board/BoardToolbar.tsx`
- `src/renderer/editors/base/index.ts`
- `src/renderer/editors/base/EditorToolbar.ts`
- `src/renderer/editors/base/EditorToolbarView.ts`
- `src/renderer/editors/base/EditorModel.ts`
- `src/renderer/editors/base/TextHostEditorModel.ts`
- `src/renderer/editors/text/TextEditorModel.ts` (US-1101 supplies `pipeState`)
- `src/renderer/editors/text/TextFileIOModel.ts` (US-1101 publishes `pipeState`)
- `src/renderer/api/pages/PageModel.ts`
- `src/renderer/api/pages/IPageHost.ts`
- `src/renderer/editors/video/index.tsx`
- `src/renderer/uikit/IconButton/IconButtonView.tsx`
- `src/renderer/uikit/SegmentedControl/SegmentedControlView.tsx`
- `src/renderer/uikit/Spacer/SpacerView.ts`
- `src/renderer/uikit/shared/fill-slot.ts`
- `doc/epics/EPIC-067.md`
- `doc/active-work.md`

### Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/base/PageToolbarView.ts` | Add native PageToolbar, NavPanelButton, and SwitchWidget composition, subscriptions, conditional DOM, and lifecycle ownership |
| `src/renderer/editors/base/PageToolbar.tsx` | Reduce the React implementation to `mountVanilla` faces while retaining ReactNode caller contracts and the SwitchWidget export |
| `src/renderer/api/published-boards.ts` | Add the service-owned non-React catalog-match subscription beside `useCatalogBoardsForFile` |
| `src/renderer/api/board-install-registry.ts` | Add the service-owned non-React installed-entry subscription beside `useInstalled` |
| `doc/tasks/US-1102-page-toolbar-native/README.md` | This investigation and implementation plan |
