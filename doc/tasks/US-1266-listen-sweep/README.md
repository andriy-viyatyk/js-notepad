# US-1266: Sweep convertible raw listeners onto `VanillaView.listen()`

Epic: [EPIC-080 – State, lifetime & scheduling core](../../epics/EPIC-080.md)

## Goal

Replace the 17 verified, directly convertible raw `addEventListener` registrations in seven
`VanillaView` files with `this.listen()`. Preserve callback behavior, event options, and—most
importantly—the existing early-release boundary for dynamic rows, tags, comments, editable modes,
tiles, and pinned rows.

## Background

US-1260 established the disposal contract and split this mechanical sweep out of its helper
ownership work. `VanillaView.listen()` in
`src/renderer/uikit/shared/vanilla-view.ts:210-225` asserts that the owner is active, installs a
disposal-guarded wrapper, and returns an idempotent release handle registered in the view's
`DisposableStore`. The conversion must store or forward that returned handle at the same release
point as the raw `removeEventListener` callback currently used. Moving a per-item release to final
view disposal is a lifecycle regression.

`listen()` is already present and has the required typed event surface. No public or protected
method signature changes are planned. Every site in this task currently uses the default event
options; the implementation must not add capture, passive, or once options.

### Re-verified census

Counting matches (rather than matching lines—the HTML injection contains two matches on one line)
finds 65 renderer `addEventListener(` occurrences, including the sanctioned implementation in
`VanillaView`; therefore there are still **64 raw occurrences** to classify. The inherited count has
no classification drift:

| Current classification | Raw occurrences | Disposition in US-1266 |
|---|---:|---|
| Direct `VanillaView.listen()` conversions below | 17 lexical sites | Convert |
| US-1260 helper-ownership work | 10 | Already handled; leave raw registrations in the helpers |
| Deliberate exclusions below | 37 | No change |
| **Total** | **64** | |

The site count is unchanged, but line numbers moved in the files touched by US-1260/US-1263:
`FileSearchView` is now `:300/:331` rather than `:301/:332`; the helper registrations are now
`ImperativeSplitter.ts:43-48` and `cell-tooltip.ts:184,186,190,192` after their store plumbing.
The other seven-file conversion locations remain at the inherited line numbers shown below.

#### The 17 direct conversion sites

| File and current site | Raw count | Current ownership and release boundary |
|---|---:|---|
| `src/renderer/components/file-search/FileSearchView.ts:300,331` | 2 | `renderCell()` creates or receives each pooled cell and records it in `cellRecords`; `renderFileCell()` creates each chevron. The existing `ownSubscription()` releases both listeners with the view, so keep the pooled-cell one-registration-per-element behavior and owner-disposal timing. Both callbacks retain their `!this.live` guards. |
| `src/renderer/uikit/Textarea/TextareaView.ts:216-218` | 3 | `syncEditableListeners()` installs the handlers only while the internally-created `this.root` is editable. Store the three returned handles in `editableListenerReleases`; `detachEditableListeners()` must continue releasing them when disabled/read-only mode begins, not only when the view dies. |
| `src/renderer/editors/board-info/BoardInfoEditorView.ts:352` | 1 | `BoardInfoBodyView.renderProperties()` creates the repository text node. Store the returned handle in `transientCleanups`; `sync()` already clears that list before replacing the rendered branch. |
| `src/renderer/editors/notebook/ExpandedNoteView.ts:126,293,321,325,338` | 5 | `:126` is the mount-time category listener. The three tag registrations at `:321/:325/:338` are rebuilt by `syncTags()` and released through `releaseTagListeners`; `:293` is the comment placeholder and is released through `releaseCommentListener`. |
| `src/renderer/editors/notebook/NoteItemView.ts:344,361,387,391` | 4 | The comment placeholder at `:344` is released through `releaseCommentListener`; the add-tag and per-tag delete/edit listeners at `:361/:387/:391` are rebuilt and released through `releaseTagListeners`. |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts:173` | 1 | `DiscoveredImagesView.createTile()` creates the tile and stores its listener in `tileResources`; `removeTile()` is the keyed-list removal boundary and must release the handle before deleting the resource record. |
| `src/renderer/ui/sidebar/PinnedRailView.ts:144` | 1 lexical site / 7 runtime registrations | `createRow()` creates the row and the local helper registers click, drag-start, drag-end, drag-enter, drag-over, drag-leave, and drop. Keep the seven returned handles in the row record. `KeyedList` calls `removeRow()` before detaching a removed row (`keyed-list.ts:66-68`), and `removeRow()` must release all seven before icon cleanup and button disposal. |

This is **14 of 17 lexical sites with an early dynamic release boundary**: the three Textarea
handlers, the Board Info repository handler, four Expanded Note tag/comment handlers, all four Note
Item handlers, the image-tile handler, and the seven-runtime-listener Pinned Rail expression. The
Pinned Rail expression expands to seven runtime registrations per row, and the notebook tag
expressions expand once per rendered tag; their total runtime count therefore depends on the data.
The two File Search listeners are registered dynamically during pooled-cell rendering but currently
release with the view, while only Expanded Note's category listener is installed at mount and
released with the view.

All seven conversion files create their relevant target nodes or own the supplied pooled cell
subtree. In particular, `TextareaView`'s constructor always passes
`document.createElement("div")` to `VanillaView`; its three listeners are not attached to an
external host, `window`, or `document`. No site in the 17-site set is excluded by the ownership
check.

#### US-1260 helper registrations retained as raw DOM calls

These 10 occurrences are present in current source but are not direct calls from a
`VanillaView`. US-1260 already supplied the helper-owned `DisposableStore` plumbing and preserved
the helpers' explicit lifecycle boundaries; US-1266 must not convert them again.

| File and current sites | Count | Verified disposition |
|---|---:|---|
| `src/renderer/components/page-manager/ImperativeSplitter.ts:43-48` | 6 | `GroupContainer` supplies a local store at construction; `GroupContainer.dispose()` still invokes splitter disposal at the existing explicit point. The store registration preserves observer-first, then listener cleanup order. |
| `src/renderer/uikit/DataGrid/cell-tooltip.ts:184,186,190,192` | 4 | `DataGridView` creates a child store before its grid-destroy cleanup; `CellTooltip` registers listener removal and tooltip disposal into that store while retaining explicit `CellTooltip.dispose()`. Tooltip cleanup still precedes grid destruction. |

#### The 37 deliberate exclusions

The following current raw occurrences were re-read and remain outside `VanillaView.listen()`:

| File and current site(s) | Count | Reason to leave unchanged |
|---|---:|---|
| `src/renderer/api/internal/KeyboardService.ts:14` | 1 | Process-wide `document` shortcut installed by `App.initEvents()`, not a view resource. |
| `src/renderer/api/internal/GlobalEventService.ts:81-92` | 9 | Process-wide document/window context-menu, drag/drop, wheel, paste, rejection, and unload policy; capture/bubble and passive options are service behavior. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts:68` | 1 | `SideBarPanelHeaderDom` is a plain DOM helper with an explicit idempotent `dispose()` at `:131-144`; its caller owns that handle. |
| `src/renderer/uikit/Popover/PopoverModel.ts:237-239` | 3 | Model-owned pointer-capture drag-session listeners. `onLost` removes them and `cancelResize()` handles an unfinished gesture; this is the documented model DOM-session exemption. |
| `src/renderer/uikit/Tooltip/attach-tooltip.ts:199-200,230-234` | 7 | Generic tooltip helper: two listeners belong to the ephemeral floating root and five to the trigger; its public `TooltipAttachment.dispose()` at `:285-296` is the lifecycle boundary. |
| `src/renderer/uikit/shared/tooltipRegistry.ts:63-65` | 3 | Module singleton's capture listeners are installed once for renderer lifetime. |
| `src/renderer/uikit/shared/dom-props.ts:175` | 1 | Generic residual-prop reconciler; `RestPropsState.listeners` owns matching replacement/removal bookkeeping. |
| `src/renderer/components/git-tree/load-more-footer.ts:44` | 1 | Plain factory returns a `LoadMoreFooter` with explicit `dispose()` at `:60-64`; no `VanillaView` is available in the factory. |
| `src/renderer/editors/browser/BrowserView.ts:187` | 1 | `listenNative()` supports arbitrary custom `<webview>` event names and already pairs each registration with `own()` removal at `:186-189`; widening `listen()` for this guest surface is a separate API change. |
| `src/renderer/editors/board/BoardWebview.ts:147` | 1 | `window` message bridge listener with explicit `ownSubscription()` cleanup at `:147-148`; it is not an owned-element listener. |
| `src/renderer/editors/html/HtmlBodyView.ts:12,136` | 3 | Two listeners are literal code injected into the sandboxed preview document; the third is the host `window` message bridge with explicit cleanup at `:136-137`. |
| `src/renderer/editors/link-editor/LinkTooltipView.ts:58,114,136` | 3 | Plain DOM tooltip content is owned by `attachTooltip`; its short-lived overlay nodes, not a `VanillaView`, own these handlers. |
| `src/renderer/editors/monaco/MonacoBodyView.ts:317` | 1 | Monaco editor DOM setup; `setupWheelZoom()` returns a host cleanup at `:308-318` and `MonacoBodyView` stores it in `hostCleanups`. |
| `src/renderer/editors/notebook/NoteItemViewModel.ts:193` | 1 | Model-owned wheel gesture with explicit `setupWheelHandler()`/`teardownWheelHandler()` pairing at `:177-200`; the model has no `VanillaView.listen()` surface. |
| `src/renderer/ui/sidebar/FolderItemView.ts:48` | 1 | `selectedArrow()` is a plain record helper that creates the button node before `FolderItemView` can claim it; the node is replaced/detached with its list item. |
| **Total deliberate exclusions** | **37** | |

The separate `src/ipc/renderer/renderer-events.ts` listener list is not part of the 64 renderer
occurrences and remains explicitly out of scope, as do CDP/remote-page sites and the raw rAF handles
in `AudioVisualizer`.

## Implementation Plan

1. Re-run the scoped inventory before editing and confirm the 64 raw / 17 direct / 10 helper / 37
   excluded totals. If any target, callback, or release field has moved, update this document and
   stop to resolve the census rather than applying a blanket rewrite.

2. Convert `src/renderer/components/file-search/FileSearchView.ts` in `renderCell()` and
   `renderFileCell()`.

   Before:

   ```ts
   cell.addEventListener("click", onCellClick);
   this.ownSubscription(() => cell.removeEventListener("click", onCellClick));
   ```

   After:

   ```ts
   this.listen(cell, "click", onCellClick);
   ```

   Make the same substitution for `chevron`/`onChevronClick`. Keep `cellRecords`, the one-time
   `record` test, `record.row = row`, pooled-cell reuse, and both `live` guards unchanged. The
   returned handles remain owner-disposed through `listen()` just as the current
   `ownSubscription()` removals are; do not add a row-level release that would change pooling.

3. Convert `src/renderer/uikit/Textarea/TextareaView.ts:syncEditableListeners()`.

   Before:

   ```ts
   this.root.addEventListener("input", this.handleInput);
   this.root.addEventListener("paste", this.handlePaste);
   this.root.addEventListener("keydown", this.handleKeyDown);
   this.editableListenerReleases = [
       this.ownSubscription(() => this.root.removeEventListener("input", this.handleInput)),
       this.ownSubscription(() => this.root.removeEventListener("paste", this.handlePaste)),
       this.ownSubscription(() => this.root.removeEventListener("keydown", this.handleKeyDown)),
   ];
   ```

   After:

   ```ts
   this.editableListenerReleases = [
       this.listen(this.root, "input", this.handleInput),
       this.listen(this.root, "paste", this.handlePaste),
       this.listen(this.root, "keydown", this.handleKeyDown),
   ];
   ```

   Preserve the `editable` gate, the `editableListenersAttached` state, and the existing
   `detachEditableListeners()` call from both mode changes and disposal. The root is view-owned.

4. Convert the dynamic Board Info, notebook, and image-tile sites while preserving their existing
   bookkeeping:

   - In `src/renderer/editors/board-info/BoardInfoEditorView.ts:renderProperties()`, replace the
     repository `addEventListener` plus `removeEventListener` cleanup with
     `this.transientCleanups.push(this.listen(repository, "click", openRepository))`. Keep
     `clearTransientCleanups()` before `root.replaceChildren()`; do not register this as a
     final-only listener.
   - In `src/renderer/editors/notebook/ExpandedNoteView.ts:onMount()`, replace only the category
     pair at `:126-127` with `this.listen(this.categoryHost, "click", this.startCategoryEdit)`.
     In `syncTags()`, keep `listeners` and `releaseTagListeners`, but push the handles returned by
     `this.listen` from `createTag()` and `createAddTag()` instead of raw remove callbacks. In
     `syncComment()`, assign `this.releaseCommentListener = this.listen(add, "click", onAdd)`.
   - In `src/renderer/editors/notebook/NoteItemView.ts`, keep the aggregate
     `releaseTagListeners`/`releaseCommentListener` boundaries. Push `this.listen` handles for
     `createTagAddButton()` and `createTagElement()`, and assign the comment handle directly to
     `releaseCommentListener`.
   - In `src/renderer/editors/link-editor/EditLinkDialogView.ts`, change the private
     `TileResources.listener` field to a release handle (prefer the name `release`), set it from
     `this.listen(tile, "click", listener)`, and invoke `resources.release()` in `removeTile()`.
     The field has one declaration, one assignment, and one removal consumer; the map is otherwise
     read by the tile callback and `updateTile()`. Keep `tileResources` until `removeTile()` and
     preserve `KeyedList`'s remove-before-detach order.

   Representative dynamic conversion:

   ```ts
   // Before
   add.addEventListener("click", onAdd);
   this.releaseCommentListener = this.ownSubscription(() => add.removeEventListener("click", onAdd));

   // After
   this.releaseCommentListener = this.listen(add, "click", onAdd);
   ```

5. Convert `src/renderer/ui/sidebar/PinnedRailView.ts:createRow()` without collapsing its
   per-row lifecycle into the view store.

   Replace the local helper's raw registration and remove-callback accumulation:

   ```ts
   // Before
   const listeners: Array<() => void> = [];
   const listen = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void): void => {
       row.addEventListener(type, listener as EventListener);
       listeners.push(() => row.removeEventListener(type, listener as EventListener));
   };
   // seven listen(...) calls
   record.listenersCleanup = () => listeners.forEach((remove) => remove());
   ```

   ```ts
   // After
   const releases: Array<() => void> = [];
   const listen = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void): void => {
       releases.push(this.listen(row, type, listener));
   };
   // keep the same seven listen(...) calls
   record.listenersCleanup = () => releases.forEach((release) => release());
   ```

   Keep the existing anonymous callback closures and event order. `this.listen()` registers each
   release in the view store, while `record.listenersCleanup` invokes those idempotent handles at
   `removeRow()` before `iconCleanup()` and `button.dispose()`. When the view disposes, the first
   `list.dispose()` cleanup reaches `removeRow()` and removes the per-row handles from the store;
   the later store snapshot entries are then harmlessly absent. Do not replace this with one
   final view-disposal cleanup.

6. Do not change any site in the 10 helper registrations or 37-exclusion table. Do not touch
   `src/ipc/renderer/renderer-events.ts`, `src/renderer/api/pages/PageModel.ts`'s
   `deferEditorCleanup()`/`pendingCleanupPromises`/`drainDeferredEditorCleanup()` machinery,
   `src/renderer/editors/video/AudioVisualizer.ts` raw rAF handles,
   `src/renderer/automation/CdpSession.ts` or its remote-page target adapters, or the
   listener/scheduling core. Do not change dispatch timing or any `live`, `generation`, or
   `inert` flag.

7. Count remains private and local: no `VanillaView.listen()` signature, helper public API, model
   API, or event options change is required. The only proposed bookkeeping rename is the private
   `TileResources.listener` field described above; verify its two field consumers before editing.

## Concerns

### Release timing is the acceptance-critical behavior

`editableListenerReleases`, `releaseTagListeners`, `releaseCommentListener`, `transientCleanups`,
`tileResources`, pooled-cell bookkeeping, and `RowRecord.listenersCleanup` are not incidental
arrays. They are the current early-release contracts. Every returned `listen()` handle must be
stored behind the same boundary. In particular, removing `record.listenersCleanup` from
`PinnedRailView.removeRow()` would retain listeners on removed rows until the entire rail dies.

### Disposal guards versus existing `live`

`listen()` guards its callback when the view is disposed. `FileSearchView`'s `onCellClick` and
`onChevronClick` still have explicit `!this.live` guards and must retain them in US-1266. Their
post-conversion redundancy is a candidate for US-1264; this task must not retire `live` or alter
the flag's lifecycle. No other one of the 17 raw callbacks has a `live`, `generation`, or `inert`
guard in the current source.

### Pinned Rail is not a `KeyedList` listener list

`KeyedList` itself has no raw listener registration and already handles remove-before-detach and
idempotent disposal. The seven listeners belong to the local `createRow()` helper in
`PinnedRailView`; each row's release must remain attached to the `RowRecord` and run from
`removeRow()`. The `this.listen()` owner registration is only the backing store for those handles,
not a replacement for the per-row release boundary.

### Verification limits

This project has no unit-test harness, so no tests or test harnesses are planned. Verify the final
inventory, typecheck, lint, and production build using the project commands, then perform the
epic's manual cold-start flow over page switching, editor open/close, and content-delivery opening.
The direct sweep itself should be checked by exercising editable/read-only Textarea transitions,
notebook tag/comment replacement, Board Info rerenders, image-tile removal, pooled File Search
cells, and pinned-row removal/reordering.

## Acceptance Criteria

- [ ] Current-source inventory confirms 64 raw renderer occurrences: 17 direct conversions, 10
  US-1260 helper registrations, and 37 deliberate exclusions; any drift is recorded before edits.
- [ ] Exactly the 17 direct lexical sites across the seven listed files use `VanillaView.listen()`;
  no excluded or helper site is blanket-rewritten.
- [ ] `TextareaView`'s three listeners remain on its internally-created `this.root`, retain their
  default event options and handler identities, and release on editable-mode detachment as well
  as final disposal.
- [ ] File Search retains one listener per pooled cell/chevron record, owner-disposes those
  handles, and keeps both `live` guards.
- [ ] Board Info, Expanded Note, Note Item, and discovered-image listeners retain their existing
  transient, tag/comment, and keyed-tile release boundaries.
- [ ] `PinnedRailView` still creates seven runtime listeners per row and releases all seven from
  `removeRow()` before icon cleanup and button disposal; removed rows do not wait for rail disposal.
- [ ] All converted registrations preserve callback identity, event type, and default options; no
  capture/passive/once behavior changes.
- [ ] No `live`, `generation`, or `inert` flag is retired; File Search's two redundant-after-
  disposal guards are merely recorded as US-1264 candidates.
- [ ] No changes are made to the 37 exclusions, the 10 helper registrations, IPC renderer events,
  deferred editor cleanup, AudioVisualizer rAF handles, or CDP/remote-page listener sites.
- [ ] No unit tests or test harnesses are added; verification uses inventory, typecheck, lint,
  production build, and the specified manual cold-start/smoke flows.
- [ ] `doc/active-work.md` and `doc/epics/EPIC-080.md` remain unchanged; the existing dashboard
  entry is not edited.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/components/file-search/FileSearchView.ts` | Replace the cell and chevron raw registrations with `this.listen()` while preserving pooled-cell bookkeeping and owner release. | Direct conversion |
| `src/renderer/uikit/Textarea/TextareaView.ts` | Store three `this.listen()` handles in `editableListenerReleases`. | Direct conversion |
| `src/renderer/editors/board-info/BoardInfoEditorView.ts` | Store the repository listener handle in `transientCleanups`. | Direct conversion |
| `src/renderer/editors/notebook/ExpandedNoteView.ts` | Convert category, tag, and comment registrations while retaining their separate release boundaries. | Direct conversion |
| `src/renderer/editors/notebook/NoteItemView.ts` | Convert tag and comment registrations while retaining aggregate release handles. | Direct conversion |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts` | Store the tile `listen()` release handle in `tileResources` and invoke it from keyed removal. | Direct conversion |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | Back the local seven-listener-per-row helper with `this.listen()` handles released by `removeRow()`. | Direct conversion |

Files that need **no changes** in US-1266:

- `src/renderer/uikit/shared/vanilla-view.ts`, `src/renderer/core/utils/DisposableStore.ts`, and
  `src/renderer/core/state/listener-list.ts` — the ownership/listener core is already landed.
- `src/renderer/components/page-manager/ImperativeSplitter.ts` and
  `src/renderer/uikit/DataGrid/cell-tooltip.ts` — their 10 raw registrations belong to the
  completed US-1260 helper-store work, not this direct sweep.
- All 37 exclusion files listed in the census table — process services, global targets, model
  gesture state, generic DOM/tooltip helpers, Monaco, sandbox content, and explicit factory
  lifecycles remain unchanged.
- `src/ipc/renderer/renderer-events.ts`, `src/ipc/api-types.ts`, the deferred-cleanup members and
  methods in `src/renderer/api/pages/PageModel.ts`, `src/renderer/editors/video/AudioVisualizer.ts`,
  and `src/renderer/automation/CdpSession.ts` plus its remote-page target adapters — explicitly
  outside this task.
- `doc/active-work.md` and `doc/epics/EPIC-080.md` — the existing EPIC-080/US-1266 dashboard and
  task-table entries are not edited.
