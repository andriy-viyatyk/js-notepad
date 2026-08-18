# US-971: Imperative handles → model methods / `ComponentQueue`

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out

## Goal

Remove command-shaped React refs from the renderer. UIKit and shell callers should command a
component through its existing model (or through `ComponentQueue` for a DOM-only command), while
ordinary DOM refs are handled separately by [US-977](../US-977-react19-ref-props/README.md). The
task also removes the two grid repaint counters handed off by US-970 by publishing the
displayed-row count on `GridEditor`.

## Background

EPIC-051 opened with 9 `useImperativeHandle` files and 33 `forwardRef` files in `src/renderer`
(the scan includes `theme/icons.tsx`; `*.story.tsx` is not part of the production count):

```text
useImperativeHandle: 9 files
forwardRef:          33 files
```

The two measurements are related but are not the same problem. Six of the nine handle files
already have a component model whose methods are the real implementation; the React handle is
only an adapter. The remaining handles expose DOM-dependent commands from a view. The 24
ordinary DOM-forwarding files are split into US-977 so this task can keep the nine command surfaces,
their consumers, and the grid handoff reviewable.

The codebase already has the intended command boundary. `TComponentModel` owns state and stable
methods, and `ComponentQueue` has both a plain `subscribe()` path and a request/reply
`execute()` / `register()` path. The queue is deliberately usable before a view mounts, which
matters for editor navigation and restore-time commands. Its React `use()` hook is not removed in
this task; the framework-free subscribe path is the part US-971 consumes.

### Current imperative surface

| Component | Current handle | Existing owner / required destination |
|---|---|---|
| `uikit/AVGrid/AVGrid.tsx` | Exposes the whole `AVGridModel` through `useImperativeHandle` | `AVGridModel` already owns `update()`, `focusGrid()`, `dataChanged()`, child models, and the `RenderGridModel` link. Publish the model through a neutral model-registration callback, not a React ref. |
| `uikit/Tree/Tree.tsx` | `scrollToItem`, `revealItem`, expand/collapse methods, `getExpandedMap`, `focus` | `TreeModel` already owns all methods. Replace `TreeRef` handoff with the model itself. |
| `uikit/ListBox/ListBox.tsx` | `scrollToIndex` | `ListBoxModel.scrollToIndex()` already delegates to its `RenderGridModel`. Replace `ListBoxRef` with the model itself. |
| `uikit/RenderGrid/RenderGrid.tsx` | Exposes the whole `RenderGridModel` | `RenderGridModel` already owns scrolling, `update()`, resize, and render state. Add the same neutral model-registration convention; propagate it through `RenderFlexGrid`. |
| `uikit/Textarea/Textarea.tsx` | `focus`, `clear`, `getText` | Delete the dead `clear()` API and its `onChange("")` behavior. Replace the two synchronous `getText()` callers with value flow through `onBlur`/`onChange`; use `autoFocus` for the single dialog focus case. No Textarea model or per-instance queue is created. |
| `uikit/ImageViewport/ImageViewport.tsx` | `copyToClipboard` | Expose the existing `ImageViewportModel` through model registration. Keep image measurement and element access view-owned; route the clipboard command through the model/queue boundary so a caller does not retain `ImageViewportRef`. |
| `components/file-list/FileList.tsx` | `showSearch`, `hideSearch` | Move both operations onto the existing `FileListModel`. Showing search updates model state and queues input focus; hiding updates model state and queues root focus where needed. `RecentFileList` and `MenuBar` should hold the model, not a `FileListRef`. |
| `editors/link-editor/LinksList.tsx` | Forwards its inner `RenderGridModel` | The component already has `onGridModel`; use that callback as the model handoff and remove the wrapper ref. Keep the existing callback contract for `LinksTiles` and the link-item wrappers. |
| `editors/markdown/MarkdownBlock.tsx` | `container`, `totalMatches`, `scrollToMatch`, `scrollToAnchor` | Delete unused `container` and `totalMatches` handle members; match count already belongs to `MarkdownEditor.state`. Route only `scrollToMatch` and `scrollToAnchor` through the disposing `EditorModel.typedQueue`; keep the root DOM node and highlight query in the view. `MarkdownBody` becomes a queue consumer rather than a `MarkdownBlockHandle` consumer. |

There is one additional command-shaped API that the baseline hook scan does not report:
`components/tree-provider/TreeProviderView.tsx` manually accepts a `ref` prop and builds a
`TreeProviderViewRef` in an effect. Its methods are a shell adapter around
`TreeProviderViewModel` and the child `TreeModel`. It must be migrated in the same task, or the
epic goal would still be false despite `useImperativeHandle` reaching zero.

### The grid repaint handoff

US-970 and US-976 explicitly defer two counters to this task:

- `editors/grid/GridBody.tsx:78` — a local `useState` bump used only to make the footer re-read
  `gridRef.data.rows.length` after `AVGrid` reports a displayed-row change;
- `editors/grid/index.tsx:23` — a second local bump for the same footer observation.

The displayed row count is data, not a repaint revision. `GridEditor` should own an observable
`visibleRowCount`/`displayedRowCount` field, `GridBody` should update it from the AVGrid model's
row-change notification, and `GridFooterBits` should subscribe to that field. The toolbar may
still use the grid model for `showColumnsOptions`; that is a real model dependency, not a footer
repaint signal.

## Implementation plan

### 1. Establish the model handoff and command rules

- Add a neutral `onModel(model | null)` registration callback to the model-backed primitives
  that currently expose a command handle: `AVGrid`, `Tree`, `ListBox`, `RenderGrid`, and
  `ImageViewport`. Call it with `null` on unmount so owners cannot retain a dead model.
- Propagate the callback through `RenderFlexGrid`. Keep the existing, already-neutral
  `onGridModel` callback on `LinksList` / `LinksTiles` where it is part of their wrapper API;
  do not create a second ref-shaped alias for it.
- Treat the registered object as a model reference, not as a view handle. Callers may invoke
  model methods, subscribe to model state, or pass the model to another model, but may not expose
  `React.Ref<...>` command interfaces.
- Keep ordinary DOM forwarding separate. A component that only forwards an `HTMLInputElement`,
  `HTMLButtonElement`, `HTMLDivElement`, or `SVGSVGElement` ref keeps that public capability and
  changes only its wrapper to React 19's `ref`-as-prop form.
- Use `ComponentQueue` for commands whose implementation must touch a view-owned DOM node. Do not
  add a generic callback protocol or put DOM elements into a model merely to preserve a handle.
- Follow the existing `onGridModel(model | null)` convention already used by
  `editors/link-editor/LinksList.tsx` and `LinksTiles.tsx`; `onModel` generalizes that existing
  neutral registration shape rather than introducing a ref replacement.
- A component queue has one handler and replaces its previous handler. Multi-instance components
  must reuse an owner/editor queue or receive an owner-created queue; this task must not create
  undisposed per-instance queues whose pending `execute()` promises can outlive the view.

### 2. Convert AVGrid, Tree, ListBox, and RenderGrid handles

Modify the primitive and model files below:

- `src/renderer/uikit/AVGrid/AVGrid.tsx`
- `src/renderer/uikit/AVGrid/model/AVGridModel.ts`
- `src/renderer/uikit/Tree/Tree.tsx`
- `src/renderer/uikit/Tree/TreeModel.ts`
- `src/renderer/uikit/Tree/types.ts`
- `src/renderer/uikit/ListBox/ListBox.tsx`
- `src/renderer/uikit/ListBox/ListBoxModel.ts`
- `src/renderer/uikit/ListBox/types.ts`
- `src/renderer/uikit/RenderGrid/RenderGrid.tsx`
- `src/renderer/uikit/RenderGrid/RenderGridModel.ts`
- `src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx`
- `src/renderer/uikit/RenderGrid/index.ts`

Remove `useImperativeHandle` and the command-handle types (`TreeRef`, `ListBoxRef`) after all
callers are migrated. Preserve all current method behavior, including Tree's queued expansion,
lazy `revealItem`, row alignment, and `getExpandedMap`. Do not turn `RenderGridModel`'s async
scroll methods into synchronous DOM operations.

Migrate the model consumers that currently store these objects behind React refs or callback
refs. The known production paths are:

- `components/tree-provider/TreeProviderView.tsx` / `TreeProviderViewModel.ts`
- `editors/archive/ArchiveEditorView.tsx`
- `editors/explorer/ExplorerSecondaryView.tsx` through the tree-provider wrapper
- `editors/browser/UrlSuggestionsDropdown.tsx` for `ListBox.scrollToIndex`
- `components/file-grid/FileGrid.tsx`
- `components/git-tree/GitTree.tsx` / `GitTreeModel.ts`
- `editors/env-vars/EnvVarsBody.tsx`
- `editors/grid/GridBody.tsx` / `editors/grid/index.tsx` /
  `editors/grid/components/ColumnsOptions.tsx`
- `components/file-search/FileSearch.tsx`
- `components/tree-provider/CategoryView.tsx`
- `editors/log-view/LogBody.tsx`
- `editors/notebook/NotebookBody.tsx`
- `editors/link-editor/LinkItemList.tsx`, `LinkItemTiles.tsx`, `LinksTiles.tsx`,
  `panels/LinkHostnamesNavigationPanel.tsx`, and `panels/LinkTagsSecondaryView.tsx`.

Where an existing owner model already exists (for example `GitTreeModel` and `GridEditor`), put
the child model there rather than leaving a view-local holder. Where a component only needs the
model to trigger a repaint or scroll, the component's existing model may keep the reference
without introducing a public command handle.

### 3. Convert DOM-dependent command handles through the queue

- Delete `TextareaRef` from `uikit/Textarea/Textarea.tsx`, `uikit/index.ts`, and
  `uikit/Textarea/index.ts`. Delete `clear()` and its dead `onChange("")` path. Replace the two
  `getText()` callers in `editors/settings/sections/FileSearchSection.tsx` with value flow from
  `onChange`/`onBlur`, and replace the one `OpenUrlDialog.tsx` focus call with `autoFocus` or an
  equivalent view-local focus path. Preserve controlled value synchronization, single-line Enter
  behavior, and paste interception. Do not create a Textarea model.
- In `uikit/ImageViewport/ImageViewport.tsx`, expose the model rather than
  `ImageViewportRef`. Keep `calculateFitScale`, image load measurement, zoom, and keyboard
  handling behavior unchanged. The external copy action must still resolve after the image has
  loaded and must keep its current clipboard error behavior.
- Extend `FileListModel` in `components/file-list/FileList.tsx` with the public search commands
  and a queue event for the input/root focus transitions. Update `ui/sidebar/RecentFileList.tsx`
  and `ui/sidebar/MenuBar.tsx` to use the model registration callback. Preserve the delayed input
  focus after showing search and Escape/focus behavior when hiding it.
- Replace `MarkdownBlockHandle` in `editors/markdown/MarkdownBlock.tsx` with the existing
  `MarkdownEditor`/`EditorModel.typedQueue`. Delete the unused `container` and `totalMatches`
  members; `totalMatches` continues through `onMatchCountChange` into editor state. Route only
  `scrollToMatch` and `scrollToAnchor` through the queue. `MarkdownBody` must keep its current
  retry loop and perform scroll-position capture in the resolved continuation: the queue invokes
  a registered handler synchronously, while the promise resolution is a microtask before the next
  DOM event task. Do not await across the existing animation-frame retries, and do not enqueue a
  new request when the block is unmounted or the prior request is still pending.
- Replace the `LinksList` `forwardRef` bridge with its existing `onGridModel` callback and clear
  that callback on unmount. `LinkItemList` and the two link secondary panels must keep their
  update/scroll behavior.

### 4. Migrate the manually-built tree-provider API

`TreeProviderView` is not represented by `useImperativeHandle`, but its `TreeProviderViewRef` is
still a React command handle. Move its public operations onto `TreeProviderViewModel` and use a
model-registration callback for the view:

- `refresh`, `getState`, `showSearch`, `hideSearch`, and `revealItem` delegate to the existing
  model methods;
- the collapse-all sequence (collapse, re-expand the provider root after the queued Tree update,
  prune selection, and emit the saved state) becomes one model operation with the same ordering;
- input focus and Tree-root focus remain view commands delivered through the queue/registered
  child models, not DOM fields on `TreeProviderViewModel`;
- `editors/archive/ArchiveEditorView.tsx` and `ui/sidebar/MenuBar.tsx` consume the model methods
  instead of `TreeProviderViewRef` / `FileListRef`.

### 5. Publish the grid displayed-row count

Modify:

- `src/renderer/editors/grid/GridEditor.ts`
- `src/renderer/editors/grid/GridBody.tsx`
- `src/renderer/editors/grid/index.tsx`
- `src/renderer/uikit/AVGrid/model/EffectsModel.ts` or the AVGrid callback boundary, as needed

Add an observable displayed-row count to `GridEditorState` with an initial value that produces the
current footer fallback. When AVGrid reports a row-data change, write the current displayed data
row count to the editor model. Make `GridFooterBits` select that field along with total rows and
filters, and make `getVisibleRowsLabel` consume the model value. Remove both `useState` repaint
counters and the `onVisibleRowsChanged` repaint callback used solely to bump them. Keep the
actual AVGrid `onVisibleRowsChanged` notification if another real consumer needs it; only the
React repaint workaround is removed.

### 6. Verify the finite surface

- Re-run the baseline scan and require `useImperativeHandle` = 0 in `src/renderer` production
  source. The separate forwardRef count is verified by US-977.
- Search for the removed command-handle names and confirm no caller still invokes a command via
  `.current` on a component ref.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Smoke-test tree reveal/expand/collapse and focus, ListBox keyboard scrolling, AVGrid sorting/
  selection/editing/focus, RenderGrid scrolling, FileList search focus, Textarea focus/read,
  image/SVG/Mermaid copy, Markdown search/anchor scrolling, link list/tile scrolling, and the grid
  footer count while filters or row data change.
- No unit-test harness or new test framework is required for this task.

## Concerns / Open questions

### Model registration is the API decision

The existing primitives create their models internally through `useComponentModel`, while callers
currently discover those models through React refs. The plan uses `onModel(model | null)` as the
smallest neutral bridge that lets the model remain internally created during Epic P. It is a
callback, not a `React.Ref`, and it has a direct vanilla equivalent. If the project instead wants
parents to construct every child model now, that is a larger ownership change and should be split
into the model-driver work in Epic B; it is not necessary to remove the command handles.

### DOM commands must not become DOM-aware business models

Focus, contenteditable reads, anchor lookup, and image clipboard conversion all require a live
DOM node. The model should issue a queue command and the view should perform the DOM operation.
`ComponentQueue.execute()` is asynchronous, so `MarkdownBody`'s anchor retry must be adapted
carefully; the success result must still be available before recording the new scroll position.
The task must not solve this by putting `HTMLElement` fields into a new public model API.

### The tree-provider wrapper is a scope trap

`TreeProviderViewRef` is easy to miss because it is manually assigned in an effect rather than
created with `useImperativeHandle`. It is in scope for the epic goal, but its root-reopen and
selection-prune sequence crosses both `TreeProviderViewModel` and `TreeModel`. Preserve that
ordering exactly and smoke-test Archive's toolbar and Explorer navigation after the conversion.

### AVGrid and RenderGrid expose broad model objects

Their current handles expose the whole model, not a narrow interface. This is useful to existing
callers (`update`, `scrollToRow`, focus models, column options), but it means a mechanical rename
could accidentally expose private implementation details to more code. Keep the current model
types and callers for this task; a narrower public command facade would be a separate API design
decision.

### Grid count naming and timing

The footer currently displays the number of rows in AVGrid's displayed data set, not the number of
viewport rows. The new state field must describe that value (`displayedRowCount` is preferred) and
must be written after filtering/data changes have updated AVGrid's data. A stale initial zero
would regress the footer before the grid mounts, so retain the current total-row fallback.

### Queue ownership and disposal

`ComponentQueue.subscribe()` and `register()` each replace the one handler held by a queue, so a
queue instance addresses exactly one view. Reuse an owner/editor queue for multi-instance content;
do not create a queue that has no owner capable of calling `dispose()`. An `execute()` issued without
a registered handler parks its promise in `_pendingRequests`, so every new command channel must
either reuse a disposing `EditorModel` queue or prove that its owner disposes it.

### Markdown timing and retry

`ComponentQueue.execute()` invokes a registered handler synchronously, while the resolved promise
continuation runs as a microtask. That is early enough for the current anchor retry, but the retry's
`requestAnimationFrame` structure and its scroll-position capture must remain intact. The capture
must happen in the resolved continuation before the focus-driven restore; never rewrite the loop to
await across frames or enqueue requests for an unmounted block.

### DOM refs and the icon factory belong to US-977

This task must not delete ordinary DOM ref capability. The 24 remaining `forwardRef` wrappers are
tracked in [US-977](../US-977-react19-ref-props/README.md). `theme/icons.tsx` is safe in that task:
`SvgIconProps` already extends `SVGProps<SVGSVGElement>`, so the SVG ref remains part of the prop
type when the wrapper changes; `SvgIconComponent` and the icon registry do not need a new command
model.

## Acceptance criteria

- [ ] `useImperativeHandle` has zero production call sites under `src/renderer`.
- [ ] The 9 command-handle components use model methods or `ComponentQueue`; no public
      `TreeRef`, `ListBoxRef`, `ImageViewportRef`, `TextareaRef`, `FileListRef`, or
      `MarkdownBlockHandle` command API remains.
- [ ] `TreeProviderViewRef` is removed or reduced to a documented non-command compatibility layer;
      production callers command `TreeProviderViewModel` / `TreeModel` directly.
- [ ] The 24 command-independent `forwardRef` wrappers are left for US-977; this task does not
      remove or alter ordinary DOM ref capability.
- [ ] AVGrid, Tree, ListBox, RenderGrid, ImageViewport, FileList, LinksList, and MarkdownBlock
      callers no longer issue commands through a React component ref.
- [ ] `TextareaRef`, `clear()`, and `getText()` are removed; the two settings blur flows receive
      the current value synchronously, and Open URL focus remains correct through `autoFocus` or a
      view-local path. Controlled `onChange`, single-line Enter, and paste behavior remain intact.
- [ ] Every queue introduced or reused by this task has a disposing owner; no component command
      can leave an unsettled `execute()` promise behind after its view unmounts.
- [ ] Markdown match highlighting and anchor scrolling retain their current retry and
      scroll-position semantics.
- [ ] The grid footer's two repaint counters are gone; displayed-row count is observable on
      `GridEditor` and updates correctly after filtering and row-data changes.
- [ ] Tree, grid, list, link, file-search, image-copy, Markdown, and sidebar smoke checks pass.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass. No unit-test harness is
      added.

## Files to create or modify

Primary files are listed in the implementation steps. The likely new files are none: small
component models should remain co-located with their current view/model file, following the
inline convention established by US-970 and US-976. A separate `*Model.ts` is justified only if a
queue model becomes shared by multiple views or exceeds the small inline-model threshold.

## Related

- [EPIC-051: De-React Epic P — Preparation](../../epics/EPIC-051.md)
- [US-970: Lift local `useState` into models](../US-970-lift-state-models/README.md)
- [US-976: Below-threshold local state](../US-976-below-threshold-state/README.md)
- [US-977: `forwardRef` → React 19 ref props](../US-977-react19-ref-props/README.md)
- [`ComponentQueue`](../../../src/renderer/core/state/ComponentQueue.ts)
- [Model-view pattern](../../standards/model-view-pattern.md)
- [De-React roadmap](../../de-react.md)
