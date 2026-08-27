# US-1156 — Convert the board editor to the native `View` arm

## Goal

Remove the board editor's seven React-producing source surfaces under
`src/renderer/editors/board/`: convert the six view surfaces to native `VanillaView`
implementations and delete the obsolete glyph face, then expose `boardModule.View`
instead of `boardModule.Component`. The conversion must preserve
the board iframe's isolation, bridge handshake, secondary-frame behavior, toolbar,
trust/error branches, content-host integrations, and explicit teardown on board
switch/reload.

The central correctness property is that changing the same
`selectedBoard__reloadToken` identity which currently drives React's `key` explicitly
disposes the old board branch—including its iframe, board registration, frame/CDP
registration, IPC listener, state subscriptions, pending port, and `MessagePort`—
before the replacement is mounted.

## Background

### Epic and scope

This task belongs to [EPIC-072](../../epics/EPIC-072.md), task US-1156, and depends on
the live baseline from US-1154. The epic measures the seven requested files at 46 JSX
markers and 865 lines. `doc/active-work.md` already contains the US-1156 entry; this
task does not add or change a dashboard entry.

The requested seven files are:

| Current file | Planned native result |
|---|---|
| `src/renderer/editors/board/index.tsx` | `index.ts`, with `boardModule.View` |
| `src/renderer/editors/board/BoardEditorView.tsx` | `BoardEditorView.ts` |
| `src/renderer/editors/board/BoardWebview.tsx` | `BoardWebview.ts` |
| `src/renderer/editors/board/BoardToolbar.tsx` | `BoardToolbar.ts` |
| `src/renderer/editors/board/BoardGlyph.tsx` | deleted after its last value caller is replaced; use the existing native glyph builder |
| `src/renderer/editors/board/BoardNotFoundView.tsx` | `BoardNotFoundView.ts` |
| `src/renderer/editors/board/UntrustedBoardView.tsx` | `UntrustedBoardView.ts` |

One supporting file also requires an integration edit: `BoardSecondaryView.ts`
currently creates a React element for `BoardWebview`; once `BoardWebview` is a native
class, that sidebar panel must own and mount a native `BoardWebview` child. This is
not a second editor conversion, but it is required for `editors/board/` to stop
creating React elements.

The face cleanup follows the epic's “a face dies when its last value caller dies” rule.
The current caller search finds exactly one remaining value caller for `BoardsTree`,
the toolbar call that this task replaces; the US-1155 sidebar caller is already gone.
The other source reference is the `BoardsTreeProps` type import used by
`BoardsTreeView`. Before
deleting the face, the implementation must move that shared props type to a native
source (the view or a dedicated types file), rerun the symbol search, and require zero
`BoardsTree` value callers. If US-1155 is not present in the implementation baseline
and `TrustedBoardsListView` still calls the face, leave `BoardsTree.tsx` in place and
record its deletion as blocked on US-1155 rather than breaking that caller.

The same verify-first cleanup applies to `src/renderer/editors/tools/ToolsTree.tsx`.
Its only value caller, `TrustedToolsListView`, is removed by US-1155 in the current
baseline; `ToolsTreeView` still imports its props type, so that type must likewise move
before the face is deleted. If the sidebar caller remains at implementation time,
leave the face and record the dependency. This is dead-face cleanup, not a conversion
of either tree view, and it does not expand the seven-file board JSX scope.

### Current four-way editor branch

`BoardEditorView.tsx:23-94` selects exactly one of these branches:

1. `!s.selectedBoard || !selectedRoot`: `BoardNotFoundView` with `path`.
2. `!boardTrusted`: `UntrustedBoardView` with `path` and async `onTrust`.
3. `s.contentHostError`: centered warning `Panel`, warning `Icon`, and three `Text`
   values, including the error message.
4. Otherwise: `Panel[name="board-host"]` containing `BoardToolbar`,
   `Panel[name="board-webview-wrap"]` containing `BoardWebview`, and, for a
   content-host model, `ScriptPanel` plus `ContentHostFooter`.

React currently discards the previous branch by not rendering it. The native parent
must own a dedicated branch slot (the existing `SubtreeSwap` pattern is appropriate)
and release the old branch whenever this selection changes. The final board branch
must use the native `ScriptPanelView` and `ContentHostFooterView` directly; their
`ScriptPanel.ts` and `ContentHostFooter.ts` exports are React `mountVanilla` faces.
`ContentHostFooterViewProps.footerContributions` already accepts `SlotContent`, which
includes a DOM `Node`; no type widening is allowed or needed.

### `BoardWebview` is an iframe host, not an Electron webview

`src/renderer/editors/board/BoardWebview.tsx:25-42` documents the load-bearing model:

- The host is an in-DOM cross-origin `<iframe src="board://<host>/index.html">`.
- Isolation comes from the `board://<host>` origin, `nodeIntegrationInSubFrames:false`,
  and the served CSP—not a `sandbox` attribute.
- `registerBoard` mints the stable host mapping.
- The privileged bridge uses a per-board `MessagePort`.
- Every iframe `load` calls `requestBoardPort`; main delivers `port1` through
  `onBoardPort`, and the host transfers it through `contentWindow.postMessage` with
  the explicit `board://<host>` target origin.
- A port is neutered when its frame navigates, so the every-load handshake is required
  for soft reloads and in-board navigation.

The same comment states that React currently keys the component by
`selectedBoard__reloadToken`, causing unmount → unregister/dispose → remount. The
parent supplies that exact key at `BoardEditorView.tsx:86-90`:

```tsx
<BoardWebview
    key={`${s.selectedBoard}__${s.reloadToken}`}
    model={model}
    boardRoot={selectedRoot}
/>
```

The native replacement must preserve that identity as an explicit parent-side
dispose-and-recreate path. A native `update()` of the existing `BoardWebview` is not
an equivalent to React's keyed remount.

The current JSX does not create an iframe before `host` resolves: `host` starts as
`null`, and the render returns only the board background Panel until the
`registerBoard` promise stores the host; the iframe is gated by `{host && ...}`.
Creating the iframe from the native mount path only after registration returns its
host therefore matches today's DOM timing. There is no intervening iframe layout,
measurement, or `ResizeObserver` window to preserve, and the native view must retain
the same gated timing rather than creating a placeholder iframe early.

### Verified `BoardWebview` lifecycle inventory

The prompt describes eight `useEffect` blocks, but the checked source at the current
revision contains six in `BoardWebview.tsx`, at lines 94, 171, 238, 360, 371, and
394. The seventh board-scope effect is `BoardToolbar.tsx:47`; there is no eighth
`useEffect` in the seven requested files. The implementation must account for all six
actual `BoardWebview` blocks as follows; this discrepancy stays recorded rather than
inventing a missing effect.

| Source block | Setup and current cleanup | Native destination |
|---|---|---|
| `BoardWebview.tsx:94-128` | Calls `ensureBoardThemeSubscription()`, asynchronously calls `api.registerBoard(boardRoot, palette, BOARD_TOKEN_VARS)`, writes a fresh main-frame `ui.log`, then stores the returned host. Cleanup marks the instance dead and unregisters the host; both pre-registration and post-log races unregister the newly returned host. | `onMount()` starts registration; an instance-local `live` flag, `registeredHost`, and `host` field guard the async result. `onDispose()` marks it dead and unregisters either the registered host or a late result. Host resolution explicitly creates the iframe and starts the host-dependent resources. The global theme subscription remains the existing idempotent helper. |
| `BoardWebview.tsx:171-185` | When `host` exists, subscribes with `api.onBoardPort`; matching `boardId` stores the pending port and transfers it. Cleanup marks dead, calls `off()`, clears the pending port, and calls `api.disposeBoardPort(boardId)` (which closes main's port side and performs its per-sink cleanup). The current code does not explicitly call `.close()` on an undelivered renderer-side pending port. | `onMount()` starts this subscription after host registration/iframe creation; retain replaceable `portDeliveryUnsubscribe` and `pendingPort`. `onDispose()` performs all four existing cleanup actions and explicitly closes a still-pending local port before dropping it. This is a direct handle, not `own()`/`bind()`, because it is tied to the board instance and must be released as part of explicit remount. |
| `BoardWebview.tsx:238-354` | When `host` exists, publishes the iframe to `model.setIframe(el, tabId)`, installs the window `message` listener for board interaction/errors/logs/busy/content/state/secondary-view/status/theme/file-path/variable messages, and cleanup removes the listener, calls `model.clearIframe(el, tabId)`, and calls `api.unregisterBoardFrame(model.id, tabId)`. | After host resolution, `onMount()` creates the iframe, calls `setIframe`, and installs one listener with `this.listen(window, "message", ...)`. Store the exact iframe and tab id. `onDispose()` removes the listener through its explicit unsubscribe or `this.listen` ownership, clears the matching iframe, and unregisters the frame. The async file/variable replies must retain the current-window and current-origin guards. |
| `BoardWebview.tsx:360-367` | Main frames subscribe to `pagesModel.onFocus`; matching `model.page` schedules `focusFrame()` after 200 ms. Secondary frames do not subscribe. Cleanup calls `sub.unsubscribe()`. | `onMount()` conditionally installs this one subscription for `isMain`; `onDispose()` unsubscribes it. Track the delayed timer as an instance resource so a disposed/remounted frame cannot focus a detached iframe. |
| `BoardWebview.tsx:371-390` | For a host with `model.contentHost`, subscribes to `chost.state` selecting `content`; it echo-guards against `lastBoardContentRef`, posts `host:content` with content/language, and cleanup calls the returned `unsub()`. | `onMount()` obtains the current content host and stores an explicit `contentHostUnsubscribe`; `onDispose()` calls it. If props are ever retargeted, unsubscribe the old source before subscribing to the new one; do not call `bind()` repeatedly. |
| `BoardWebview.tsx:394-410` | When `host` exists, subscribes to `model.state` selecting `sharedState`, posts `state:sync` with `model.sharedStateSeq`, and cleanup calls the returned `unsub()`. | `onMount()` stores an explicit `sharedStateUnsubscribe`; `onDispose()` calls it. The subscription must be one per native board instance and must not be recreated by a repeatedly-called render method. |

For completeness, `BoardToolbar.tsx:47-51` has one additional board-scope effect: it
starts the one-time `publishedBoards.load()` and `boardInstallRegistry.load()` calls
and has no cleanup. The native toolbar performs those calls once from `onMount()`.
This brings the checked source to seven effect blocks across the board surface, still
not the eight stated in the prompt; the missing eighth block is not present in the
repository revision investigated here.

Other current setup/cleanup that is not a `useEffect` must also survive: the JSX
`onLoad={handleLoad}` listener requests a new port, registers the frame for CDP, marks
the tab loaded only after registration resolves, seeds content/shared state, and
focuses main frames; the iframe's DOM removal is what tears down the foreign document.
The native view must attach the listener to the stable iframe and explicitly remove
the iframe during the parent branch's `releaseChild()`/branch disposal path.

### Board model and reload contract

`BoardEditorModel.ts:36-38` defines `reloadToken`, and `reloadBoard()` at
`:543-551` increments it after invalidating the board icon. `selectBoard()` at
`:531-541` changes `selectedBoard`, resets `iconKey`, and resets `reloadToken` to 0.
The model's `dispose()` at `:560-586` separately clears frame maps, resolves load
waiters, unregisters all board frames, reaps jobs, and calls the base disposal. The
editor view must not rely on model disposal for the iframe's per-view resources: the
board branch must dispose immediately when its branch identity changes.

The native branch identity should be the current main-frame equivalent of
`${selectedBoard}__${reloadToken}`. A change of that identity must release the whole
board-host view, not only call `BoardWebview.update()`. The board-host view should
claim and mount `BoardToolbarView`, `BoardWebview`, `ScriptPanelView` (when present),
and `ContentHostFooterView` (when present), and release the whole child set with the
branch.

### Trust and content-host seams

`src/renderer/api/board-trust.ts:57-88` provides the native equivalents of the React
trust hook: `isTrusted(root)` is synchronous and ancestor-aware, while
`subscribePaths(listener)` returns an explicit unsubscribe. The native board editor
should use those APIs and call its branch synchronizer when trust changes. The trust
button must preserve `showTrustBoardDialog`, the dynamic
`confirmNamespaceNotColliding` import, and `boardTrust.trust` ordering.

`ContentHostFooterView` accepts a `Node` contribution through `SlotContent`; the
native board host can provide a DOM status node that is updated from
`BoardEditorModel.state.statusText`. Keep the current status styling and behavior,
but do not widen `ContentHostFooterProps` or route through the React `FooterStatus`
function. `ScriptPanelView` accepts the existing `TextFileModel` directly.

### Secondary board panel

`board-secondary.ts:1-20` only builds/parses the `board-secondary:<viewId>` id and
does not need a logic change. `register-editors.ts:99-108` registers the prefix to
`BoardSecondaryView`.

`BoardSecondaryView.ts:118-145` is affected because it currently renders a React
`BoardWebview` through `mountReactHandle`. Replace that island with a claimed native
`BoardWebview` child: create → `child()` → append → `mount()`, and use
`releaseChild()` before replacing it with a placeholder or a new frame. Preserve the
secondary props (`entry`, declaration id as `view`, and `isMain: false`) and the
`frameIdentity` reload behavior. Include the board root in the identity so changing
to a different board cannot retain an iframe registered for the prior root.

The same file has a pre-existing US-1152-shaped defect at `:55-65`/`:72-86`: its
`bind()` is attached to the `boardModel` captured during `onMount()`, while
`onUpdate()` can replace `this.boardModel`. Do not fix that pre-existing defect in
US-1156; do not add another repeated `bind()` or `this.listen()` path while editing
the native child lifecycle. The main board view and native `BoardWebview` must use
explicit unsubscribe fields for any source that could be replaced.

### Small views and external callers

`BoardNotFoundView.tsx` and `UntrustedBoardView.tsx` are private to
`BoardEditorView.tsx` (`rg` found no other renderer callers). They can become small
public-constructor `VanillaView` classes with native Panel/Text/Icon/Button
construction and update only their dynamic path/handler fields.

`BoardGlyph.tsx` is different: `ui/sidebar/PinnedRailView.ts:13,161-164` uses it
outside `editors/board/` through `React.createElement`, and the current hook in
`board-icon-cache.ts` refreshes the glyph when an async custom icon resolves. Do not
introduce a parallel `BoardGlyphView`: `BoardsTreeView.ts:6-7,67-70` already pairs
`subscribeBoardIconChanges` with `createBoardGlyphElement()`. Update
`PinnedRailView.ts` to use that builder in the board arm and own one icon-cache
subscription that refreshes the recycled rows, fitting the existing per-row
`record.iconCleanup` slot. Leave the non-board `fillSlot` icon arm immediately below
unchanged. After the external caller is removed, delete the obsolete `BoardGlyph.tsx`
face; the existing `board-glyph-element.ts` remains the native builder.

`BoardsTree.tsx` is a zero-JSX React compatibility face over `BoardsTreeView`. The
board toolbar must use `BoardsTreeView` directly, avoiding a new React root. Once the
final caller search is zero, move `BoardsTreeProps` off the face and delete it; if a
US-1155 caller remains, preserve the face until that dependency lands. The same
conditional deletion applies to `ToolsTree.tsx` after moving `ToolsTreeProps` for
`ToolsTreeView`. `BoardsTreeView.ts` already owns icon invalidation; its only edit is
the props-type relocation required if the face is deleted. `board-info/BoardScreenshot.tsx`
is outside this folder and already has the native `BoardScreenshotView` path; it has
no US-1156 dependency and needs no change.

## Implementation Plan

### 1. Convert the registry module entry point

- Rename `src/renderer/editors/board/index.tsx` to `index.ts` and preserve its
  dynamic-import boundary (callers continue importing `./board` without an extension).
- Remove the three-line `BoardEditorComponent` React wrapper.
- Export `boardModule.View` as the public `BoardEditorView` constructor, preserving
  `createEditor()` and `newEditorModel()` behavior and all board link decoding.
- Do not edit `editorRegistry.ts`; deletion of its `Component` arm and normalizer is
  US-1158 after both board and browser conversions.

Before:

```tsx
function BoardEditorComponent({ model }: { model: EditorModel }) {
    return <BoardEditorView model={model as BoardEditorModel} />;
}

export const boardModule: EditorModule = {
    createEditor: () => new BoardEditorModel(...),
    Component: BoardEditorComponent,
    // ...
};
```

After shape:

```ts
export const boardModule: EditorModule = {
    createEditor: () => new BoardEditorModel(...),
    View: BoardEditorView,
    // ...
};
```

### 2. Convert the four-way `BoardEditorView` with explicit branch ownership

- Rename `BoardEditorView.tsx` to `.ts`, expose the registry-compatible constructor
  shape `VanillaView<{ model: EditorModel }>`, validate/cast to `BoardEditorModel`
  once in the constructor, and give it a stable root plus a `SubtreeSwap` branch host.
- Use one model-state subscription and one `boardTrust.subscribePaths` subscription
  to run a native synchronizer. The synchronizer must select exactly the four branch
  keys listed above and update an existing branch only when its identity is unchanged.
- Build each branch as a detached native view, claim it exactly once, insert it with
  `SubtreeSwap`, then mount it. If mounting fails, clear the swap while preserving the
  original error, following `PopoverView`/`McpInspectorEditorView` error-safe branch
  patterns.
- When the branch changes, including any change to
  `selectedBoard__reloadToken`, release/dispose the old branch before or as part of
  inserting the replacement. The old `BoardWebview` must therefore reach its full
  `onDispose()` before the new iframe's handshake can become active.

After shape:

```ts
const frameKey = `${state.selectedBoard}__${state.reloadToken}`;
if (this.activeBranchKey === frameKey) {
    this.activeBoardHost?.update({ model: this.model, boardRoot: selectedRoot });
} else {
    this.replaceBranch(frameKey, () => new BoardHostView({
        model: this.model,
        boardRoot: selectedRoot,
    }));
}
```

`replaceBranch` is illustrative: its required behavior is a `SubtreeSwap`-owned
create → claim → insert → mount sequence, with the previous branch disposed and
detached when the key changes. It must not leave a persistent `BoardWebview` child
whose `update()` merely changes `boardRoot` or `reloadToken`.
- Implement the content-host branch as a native child composition. Use
  `ScriptPanelView` and `ContentHostFooterView` directly; provide a native status
  `Node` to the footer slot when `statusText` is non-empty (and `null` when the
  React `FooterStatus` would return nothing), updating its text from `statusText`.
- Preserve the exact four branch messages, panel names, layout props, and trust
  callback semantics. Use `createPanelElement`, `createTextElement`, native icon
  builders, and direct native event types.

### 3. Convert `BoardWebview` and make every teardown explicit

- Rename `BoardWebview.tsx` to `.ts` and export a public-constructor
  `BoardWebview extends VanillaView<BoardWebviewProps>`.
- Keep the stable root as the board background Panel and create the iframe only from
  the native mount path after `registerBoard` has returned its host. Preserve the
  cross-origin URL, `allow` policy, no-`sandbox` decision, `?v=${boardId}` nonce,
  `view` query, and direct `board://<host>` target origin.
- Move each resource from the lifecycle table to its named native hook/field. Keep
  `registeredHost`, `boardId`, `pendingPort`, `lastBoardContent`, iframe, tab id,
  async-liveness generation, every applicable unsubscribe handle, and the delayed
  focus timer as instance-owned state.
- Attach one native `load` listener to the iframe. Its handler must retain all current
  operations and ordering: request a fresh port; register the exact frame/tab with
  CDP; call `markFrameLoaded` only after registration resolves; seed content and
  shared state; then focus only the main frame.
- Attach one native `message` listener and preserve every current message branch and
  guard: origin must equal `board://${host}`, source must be the current iframe
  window, and async file/variable replies must stop when the frame is gone.
- In `onDispose()`, mark all async work dead, clear the pending port, unsubscribe IPC,
  content-host, shared-state, and focus listeners, cancel delayed focus, dispose the
  board port, unregister the board frame, clear the model iframe only if it still
  matches, and unregister the board host. The owning branch's `releaseChild()` (or
  the secondary view's equivalent) then detaches the native view root, which removes
  the iframe and tears down the foreign document. Cleanup must be idempotent and safe
  if registration resolves after disposal.
- Do not use `bind()` for resources that might be retargeted; `bind()` has no early
  release. Do not call `this.listen()` from a method that can run repeatedly.

### 4. Convert `BoardToolbar` without React hooks or per-update leaks

- Rename `BoardToolbar.tsx` to `.ts` and create a native `BoardToolbarView` with the
  current Panel layout and child order.
- Replace `useBoardUpdates()` with synchronous `listBoardUpdates()` plus one explicit
  subscription each to `publishedBoards.subscribeCatalog()` and
  `boardInstallRegistry.subscribeInstalled()`. Keep the existing load calls in
  `onMount()` and derive `hasUpdate` from the normalized board root.
- Replace `boardTrust.useTrustedPaths()` with `boardTrust.listPaths()` plus one
  `subscribePaths()` handle. Derive the explorer-scoped board list exactly as the
  current normalized-root filter does.
- Use native `IconButtonView`, text/Panel DOM, `DotView`, `SwitchWidgetView`,
  `PopoverView`, and `BoardsTreeView`. The popover's `contentView` factory must return
  a claimed/mounted native content view and the toolbar must retain a reference to
  update it while it is open; do not use `BoardsTree`'s React face.
- Preserve explorer toggle, board path click/open, reload, log, properties, switch
  widget, update dot, and board-open event behavior. A path click handler must read a
  current `canSwitch` field rather than being reinstalled on every update.
- Store and explicitly release subscriptions and any replaceable child (dot,
  popover content, popover itself) in `onDispose()`.

### 5. Convert glyph and placeholder views; remove dead compatibility faces

- Rename `BoardNotFoundView.tsx` and `UntrustedBoardView.tsx` to `.ts` and eliminate
  all JSX/React runtime imports.
- Make the two placeholders native `VanillaView` classes with public constructors,
  native primitive construction, and explicit path updates. The trust button must
  call the unchanged async consent flow supplied by the parent.
- Delete `BoardGlyph.tsx` after replacing its only value caller. Do not add a
  `BoardGlyphView`; `createBoardGlyphElement()` already preserves fallback
  `BoardIcon` behavior and custom icon resolution. Update
  `src/renderer/ui/sidebar/PinnedRailView.ts` to use that builder in the board arm,
  keep the existing per-row `record.iconCleanup`, and own one
  `subscribeBoardIconChanges` subscription that refreshes the recycled rows. Leave
  the non-board `fillSlot` icon arm immediately below unchanged.
- After `BoardToolbar` uses `BoardsTreeView` directly, verify zero `BoardsTree` value
  callers, move `BoardsTreeProps` out of the compatibility face, and delete
  `BoardsTree.tsx`. Perform the same search/type relocation/deletion for
  `ToolsTree.tsx` once US-1155 has removed `TrustedToolsListView`'s value caller.
  If either sidebar caller remains, leave the corresponding face in place and record
  the deletion as blocked; do not break the caller to satisfy the directory claim.

### 6. Remove the board secondary React island

- Edit `src/renderer/editors/board/BoardSecondaryView.ts` only as an integration seam:
  remove its runtime React and `mountReactHandle` usage, replace `MountedReactRoot`
  with a `BoardWebview` child field, and use `child()`/`releaseChild()` for its
  lifecycle.
- Keep the sidebar header, placeholders, trust subscription, declaration lookup,
  `entry`, `view`, `isMain: false`, and model state behavior unchanged.
- Make the frame identity include the board root, view id, and reload token so a
  board switch/reload releases the old native iframe and creates a new one.
- Do not alter the pre-existing model-rebinding defect in this file; record it as
  inherited US-1152 work and verify this task adds no repeated binding/listener.

### 7. Cold-start and live verification

- Start every verification pass from a cold dev server because the board module is
  dynamically imported and Vite can retain stale `.tsx` specifiers after a rename.
- Use a newly-created scratch board in its own temporary folder, not any customer
  data. Do not read `evergreen.note.json`, `evergreen.link.json`, or anything under
  `EverGreen/web-wiki`, `EverGreen/wiki`, or `EverGreen/worklog`.
- Use the US-1154 instrumentation for the board slot and count
  `[data-react-root]`, not the broader `data-part="react-slot"` marker.

The exact live sequence is:

1. Stop the dev server, start it again, and reload the renderer. Create two blank
   scratch boards through the canonical board-creation API (`create_board`) under a
   fresh temporary container, for example `US-1156-scratch/A` and
   `US-1156-scratch/B`. This auto-trusts only those newly-created board roots; do not
   point the operation at an existing project.
2. Open board A with `open_board`, wait for its board frame to be ready, and use the
   board target's `browser_snapshot`/`browser_evaluate` to confirm the board page is
   rendered. Evaluate a bridge call such as
   `await window.persephone.getBoardBusy()` in the board frame and require a resolved
   result; this proves the per-board `MessagePort` handshake reached the frame.
3. In the same board page, switch from A to B through the board toolbar's board
   switcher (the path is carried by the existing explorer-root scope). In the
   renderer document inspect the board page slot and require exactly one current
   board iframe, with B's `board://<host>` URL and a new `?v=board_<nonce>` value.
   Confirm A's frame is no longer present and evaluate the same bridge call in B.
   The DOM assertion plus the explicit lifecycle code must show that the old branch
   was disposed rather than merely hidden.
4. With B active, record its current iframe nonce and run `board_refresh` for that
   page id. Wait for `frameReady: true`, then read the new iframe URL and require a
   different `?v=` nonce. Immediately evaluate
   `await window.persephone.getBoardBusy()` in the refreshed board frame and require
   success. This is the acceptance proof that reload disposed the old port and the
   new iframe re-requested/transferred a fresh `MessagePort`; a changed DOM nonce
   without a successful bridge call is insufficient.
5. Exercise the untrusted branch with a scratch board not created by Persephone (or
   remove only that scratch root from the trusted-board list through the existing UI),
   open it, and require the `This board is not trusted` placeholder, path text, and
   `Trust board` button. Do not use a customer's board to reach this branch.
6. While a trusted scratch board is active, inspect the renderer-side page slot that
   directly contains `[data-name="board-host"]` and require
   `querySelectorAll('[data-react-root]').length === 0`. Also inspect the board's
   document slot—not the cross-origin iframe contents—and require zero markers there;
   the board page itself is foreign content and is not a React host surface.
7. Repeat the root assertion after switching and refreshing. Record failures as
   either a visible behavioral failure, a nonzero root count, or an unmeasurable
   cross-origin probe; never substitute the whole-app root count for the board-slot
   assertion.

## Concerns / Open questions

### C1 — Explicit keyed remount and complete resource teardown

This is the acceptance-critical risk. The old React `key` caused all six actual
`BoardWebview` effects to clean up, removed the old iframe, unregistered the board and
frame, disposed the port, and then created a fresh `boardId` for the replacement. A
native parent that only updates a persistent `BoardWebview` will leave old registration,
port, frame, or subscriptions alive. The implementation must make the branch identity
change observable in code and must dispose the old branch before mounting the new one.

The source discrepancy (“eight” stated, six found) is not a lifecycle excuse: the six
blocks and the non-effect `load` listener/iframe teardown are all enumerated above.

### C3 — Live scratch-board verification

The board is cheap and safe to verify because agent-authored boards live in their own
folders. A scratch board must prove the bridge, not merely the shell DOM. The reload
acceptance criterion is a fresh iframe load followed by a fresh `requestBoardPort` /
`onBoardPort` transfer for the new frame.

### C5 — Cold start after `.tsx` → `.ts`

The board module is loaded through a literal dynamic import. Verification must stop the
dev server, restart it, and reload the renderer before judging module-load behavior.

### C8 — Secondary view and replaceable models

`board-secondary.ts` itself is a pure id helper and is unaffected. `BoardSecondaryView`
must be updated for the native child, but its existing `bind()`-against-an-old-model
defect belongs to US-1152 and must not be fixed here. The new main/iframe views must
not repeat that pattern or install subscriptions from a repeatedly-called sync method.

### Face cleanup — `BoardsTree.tsx` and `ToolsTree.tsx`

This is resolved as conditional dead-face cleanup, not scope expansion. The current
caller search has one `BoardsTree` value caller in the toolbar and no `ToolsTree` value
caller from the already-converted US-1155 sidebar; the two native-view props type
imports are additional source dependencies. The implementation must move the props
types, rerun exact symbol searches after replacing the toolbar, and delete each face
only at zero value callers.
If either US-1155 sidebar caller is still present in the implementation baseline, leave
that face and record the dependency instead. The final board-directory assertion is
valid only when `BoardsTree.tsx` and `BoardGlyph.tsx` have also been removed; the tools
face is outside that directory but is included to prevent an orphaned React face.

## Acceptance Criteria

- [ ] `boardModule` exports `View: BoardEditorView`; it no longer exports `Component`.
- [ ] The seven requested source surfaces contain no JSX or React runtime element
      production: six are native `.ts` implementations and the obsolete
      `BoardGlyph.tsx` face is deleted. `BoardSecondaryView.ts` also produces no React
      element.
- [ ] The four editor branches are mutually exclusive, preserve their current visible
      text/actions/layout, and explicitly dispose the previous branch on exit.
- [ ] A board's iframe remains a cross-origin `board://<host>` iframe with the current
      no-`sandbox` isolation contract, CSP/origin assumptions, and per-load port bridge.
- [ ] Every lifecycle item in the six-block inventory and the iframe `load` listener
      has one corresponding native setup and cleanup; no repeated `bind()` or
      `this.listen()` accumulates subscriptions.
- [ ] Switching boards disposes the old iframe/board registration/port/frame
      registration before the new board becomes active.
- [ ] Reloading a board changes the explicit `selectedBoard__reloadToken` branch
      identity, disposes the old iframe, and re-handshakes a fresh `MessagePort` on the
      new iframe load.
- [ ] The untrusted path shows the trust placeholder and the trust flow still requires
      the existing dialog and namespace-collision confirmation.
- [ ] Content-host boards still use native `ScriptPanelView` and
      `ContentHostFooterView`, and the footer status contribution remains a DOM `Node`
      with no `SlotContent` type change.
- [ ] A live scratch-board pass, started after a cold dev-server restart, verifies:
      1. a board renders;
      2. switching boards tears the old one down;
      3. reloading a board re-handshakes its `MessagePort`;
      4. the untrusted path shows the trust placeholder; and
      5. the board page slot contains zero `[data-react-root]` markers.
- [ ] No verification reads the forbidden customer-data files or directories.
- [ ] After the toolbar conversion, an exact value-caller search finds zero
      `BoardsTree` callers; its props type has moved off the face and `BoardsTree.tsx`
      is deleted, unless a still-present US-1155 caller blocks that deletion and the
      task records the dependency without breaking it.
- [ ] The equivalent `ToolsTree` search is zero after US-1155; its props type has
      moved off the face and `ToolsTree.tsx` is deleted, or the remaining sidebar
      dependency is recorded and the face is preserved.

## Files that need NO changes

| File | Reason |
|---|---|
| `src/renderer/editors/board/board-secondary.ts` | Pure `board-secondary:<viewId>` id builder/parser; the native seam consumes its existing API. |
| `src/renderer/editors/board/BoardsTreeView.ts` | Already native and owns its icon invalidation subscription; use it directly from the toolbar. Move its props type off `BoardsTree.tsx` if the face is deleted. |
| `src/renderer/editors/board/BoardsTree.tsx` | Conditional dead-face deletion after the final exact value-caller search; preserve only if a US-1155 caller remains. |
| `src/renderer/editors/tools/ToolsTreeView.ts` | Already native; move its props type off `ToolsTree.tsx` if the dead face can be deleted. |
| `src/renderer/editors/tools/ToolsTree.tsx` | Conditional dead-face deletion after the final exact value-caller search; preserve only if `TrustedToolsListView` remains a value caller. |
| `src/renderer/editors/board/board-glyph-element.ts` | Existing DOM builder used by tabs, trees, model icons, and other non-React callers; the native glyph may reuse its behavior but does not require changing it. |
| `src/renderer/editors/board/board-icon-cache.ts` | Existing cache and `subscribeBoardIconChanges` API are sufficient; only the old hook is no longer used by the converted glyph. |
| `src/renderer/editors/board/BoardEditorModel.ts` | Existing `reloadToken`, frame bookkeeping, trust/model APIs, and disposal contract already provide the needed model-side seams. |
| `src/renderer/editors/board/board-theme.ts` | `ensureBoardThemeSubscription`, palette, and token constants remain the existing BoardWebview inputs. |
| `src/renderer/editors/board/BoardContentEditorModel.ts` | Its content bridge already expects the view-owned echo guard and native model methods. |
| `src/renderer/editors/board/board-manifest.ts` | Secondary declarations and board validation are unchanged. |
| `src/renderer/editors/board/boards-tree-build.ts` | Pure board-tree data construction, unaffected by the host conversion. |
| `src/renderer/editors/board/custom-editor-registry.ts` | Board editor registration and matching are outside this view-arm conversion. |
| `src/renderer/editors/board/busy-boards.ts` | Busy retention remains owned by `BoardEditorModel` and bridge messages. |
| `src/renderer/editors/board/board-api.d.ts` | Board author API declarations are not renderer view code. |
| `src/renderer/editors/board/board-scaffold.ts` | Board creation/scaffolding is independent of the editor host. |
| `src/renderer/editors/board/board-usage-cache.ts` | Usage/cache behavior has no React view dependency. |
| `src/renderer/editors/board-info/BoardScreenshot.tsx` | Outside the requested folder; its native `BoardScreenshotView` is already consumed directly where needed. |
| `src/renderer/editors/register-editors.ts` | Its literal dynamic import and secondary prefix registration remain valid. |
| `src/renderer/editors/base/editorRegistry.ts` | `Component`-arm deletion is explicitly deferred to US-1158. |
| `src/renderer/editors/text/ScriptPanel.ts` | Keep the React face; consume `ScriptPanelView` directly. |
| `src/renderer/editors/base/ContentHostFooter.ts` | Keep the React face and type unchanged; consume `ContentHostFooterView` directly. |

## Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/board/index.tsx` → `index.ts` | Remove the React component wrapper and expose `BoardEditorView` through `View`. |
| `src/renderer/editors/board/BoardEditorView.tsx` → `BoardEditorView.ts` | Native four-way branch host with explicit branch disposal and native content-host children. |
| `src/renderer/editors/board/BoardWebview.tsx` → `BoardWebview.ts` | Native iframe/bridge host; explicit registration, port, frame, listener, subscription, and iframe cleanup. |
| `src/renderer/editors/board/BoardToolbar.tsx` → `BoardToolbar.ts` | Native toolbar, explicit catalog/trust subscriptions, native popover/tree, and child lifecycle. |
| `src/renderer/editors/board/BoardGlyph.tsx` | Delete the obsolete React face after `PinnedRailView` uses `createBoardGlyphElement()` and an explicit icon-cache subscription. |
| `src/renderer/editors/board/BoardNotFoundView.tsx` → `BoardNotFoundView.ts` | Native not-found placeholder view. |
| `src/renderer/editors/board/UntrustedBoardView.tsx` → `UntrustedBoardView.ts` | Native trust placeholder view. |
| `src/renderer/editors/board/BoardsTree.tsx` | Delete after moving `BoardsTreeProps` and confirming zero value callers; otherwise leave it while a US-1155 caller remains. |
| `src/renderer/editors/tools/ToolsTree.tsx` | Delete after moving `ToolsTreeProps` and confirming zero value callers; otherwise leave it while the US-1155 sidebar caller remains. |
| `src/renderer/editors/board/BoardsTreeView.ts` / `src/renderer/editors/tools/ToolsTreeView.ts` | Relocate the shared props types if their compatibility faces are deleted. |
| `src/renderer/editors/board/BoardSecondaryView.ts` | Replace its `mountReactHandle`/`React.createElement(BoardWebview)` island with an owned native child. |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | Replace the external React glyph call with an owned native glyph view while preserving icon refresh. |


---

## Live verification (2026-08-27, after a cold dev-server restart)

Driven over the renderer's MCP endpoint. **Structure only** — element counts, `data-name`
inventory and root counts. No board content was read or transported.

Target: the `todo` board (a standalone board under the app's own data directory), then a
switch to `sqlite-viewer`.

| Property | Result |
|---|---|
| `board-host` present and visible | yes |
| iframe present, `board:` scheme, connected | yes |
| iframe `src` carries the `?v=` nonce | yes |
| toolbar present | yes |
| **React roots inside the board subtree** (root-inclusive) | **0** |
| Empty SVGs inside the board subtree | 0 |
| App-wide React roots | **1** — `GlobalStyles` only |

**Concern C1, the epic's central risk, verified.** `model.reloadBoard()` produced:

| Assertion | Result |
|---|---|
| iframe identity changed | **yes** |
| previous iframe detached (`isConnected === false`) | **yes** |
| `src` nonce changed | **yes** |
| total iframes in the document, before → after | **2 → 2** (no leak) |

Then `model.selectBoard("…/sqlite-viewer")`: the previous iframe was detached, a new host
mounted, total iframes stayed at 2, and the board subtree still measured 0 React roots. So the
explicit dispose-and-recreate genuinely replaces React's `key`-driven remount, and branch
teardown on a board switch works.

**The instrument that matters here is the iframe total, not the root count.** A leaked iframe is
the failure this task exists to prevent, and it has no visible symptom — the board would still
look right. Holding at 2 across a reload and a board switch is the evidence.

### Not verified

- The **untrusted-board** branch and the **content-host-error** branch were not exercised; only
  the not-found→resolved and trusted paths were. Both are single-`Panel` placeholder branches
  with no async resources, so the risk is low, but they have no runtime evidence.
- The `MessagePort` handshake was verified only *indirectly*, through the new iframe identity and
  changed nonce. The port itself was not observed being delivered; doing so needs board-side
  instrumentation.


---

## Post-landing regression: the board bridge never connected (fixed 2026-08-27)

**Reported by the user**: opening `.persephone/boards/Persephone` rendered no data and no chart, with
`Board failed to load: board bridge did not connect (the board loaded but its script bridge never
initialized)`.

**Cause — a defensive line the React version did not have.** The conversion wrote the port-delivery
filter as:

```ts
api.onBoardPort((boardId, port) => {
    if (!this.live || boardId !== this.boardId) { port.close(); return; }   // WRONG
```

where the React original was:

```ts
api.onBoardPort((bId, port) => {
    if (!live || bId !== boardId) return;   // another board's port — ignore
```

`api.onBoardPort` (`ipc/renderer/api.ts:422`) is a **global** `ipcRenderer` subscription: *every*
mounted board frame's callback receives *every* board's port, and `boardId` is the only filter. So the
non-matching branch is not a stray port to clean up — it is **another live frame's port**. Closing it
destroyed that frame's bridge before it could transfer it, and the failure is silent on the closing
side: the victim's shim never posts `{ kind: "connected" }`, so main's 5-second watchdog
(`main/board-bridge.ts:139,435-445`) reports the load failure against the *victim*.

It needed two or more mounted board frames, which is why the first verification pass missed it — that
pass opened one board at a time. A previously-activated board's iframe stays in the DOM, so the second
board a user opens is already enough.

**Fix** (`BoardWebview.ts:169-181`): test ownership **before** liveness, and never touch a port that
is not ours.

```ts
if (boardId !== this.boardId) return;      // another live frame's port — not ours
if (!this.live) { port.close(); return; }  // ours, but we are gone
```

**Verified** under the failing condition: three boards opened in sequence (`todo`, `sqlite-viewer`,
`Persephone`) giving six connected iframes across three distinct `board://` hosts. The target board's
`ui.log` — rewritten on each mount, so its contents are current by construction — recorded
`board loaded` plus the board's own script output and **no** `[error] board bridge did not connect`,
checked 36 seconds after mount against a 5-second watchdog.

**The generalizable lesson, and it is the sharper form of this epic's C1.** A conversion is expected
to make implicit teardown explicit, and that pressure makes *more disposal* feel safer than less. It
is not: **when the source of an event is a shared broadcast, the non-matching branch of the filter
belongs to somebody else, so ignoring and disposing are not interchangeable.** The React original was
correct precisely because it did less. Worth checking every `if (notMine)` branch added during a
conversion for whether it disposes something it merely failed to recognise — and note that this defect
class is invisible to the instrument this epic relies on: the React root count, the iframe count and
the connected-webview count were all *correct* throughout.
