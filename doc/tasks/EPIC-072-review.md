# EPIC-072 review

## Concerns (must fix)

### High — browser tab-panel width is no longer applied

- `src/renderer/editors/browser/BrowserView.ts:416`
- `src/renderer/editors/browser/BrowserView.ts:423`

`tabsHost` is created with a fixed `width: 34`, and the state sync only updates the
`SplitterView`'s ARIA value. The old React panel used `tabsPanelWidth` as the actual
panel width. Restored widths and drag-resize therefore leave the tab list at 34px;
the splitter can move while the panel does not. Keep a reference to the host and
apply `state.tabsPanelWidth` to its width during sync (and initialize the splitter
from the same state value).

### High — browser loading indicator is permanently active

- `src/renderer/editors/browser/BrowserView.ts:415-418`
- `src/renderer/editors/browser/BrowserView.ts:422-429`

The conversion creates one `data-browser-loading-bar` element in `buildTree()` and
never stores or updates it from `state.loading`. The old React branch rendered a
2px spacer when loading was false, so the new CSS animation runs continuously after
the browser mounts, including while idle. Retain the element and toggle its presence
(or render the inactive spacer) from the loading slice during `sync()`.

### Medium — broken tab favicons leave the fallback icon hidden

- `src/renderer/editors/browser/BrowserView.ts:57`

`renderFavicon()` marks the globe fallback `data-hidden` whenever a favicon URL is
present, then removes only the failed `<img>` on its `error` event. Unlike the React
implementation, it has no load/error path that unhides the fallback, so network or
redirect failures produce a blank favicon area. Unhide the fallback before removing
the failed image (and ensure it is reset on subsequent renders).

### High — `TreeProps.trailingElement` is dropped before the row renderer

- `src/renderer/uikit/Tree/TreeView.ts:463`
- `src/renderer/uikit/Tree/TreeItemView.ts:155-191`

`TreeView` now computes and passes `trailingElement`, but `TreeItemView.applyProps()`
does not destructure or consume it and `setTrailing()` only receives `trailing`.
The node consequently falls into residual props instead of being forwarded to the
row's trailing host/ListItem surface. `TrustedBoardsListView`'s pin/update controls
are created but never rendered. Add the direct-node prop through `TreeItemProps` and
`TreeItemView.setTrailing`, preserving the identity short-circuit expected for the
owned DOM node.

### Medium — readiness state is deleted without ownership checking

- `src/renderer/editors/browser/BrowserView.ts:109`
- `src/renderer/editors/browser/BrowserView.ts:145-147`

Every webview instance adds its tab ID to the shared `webviewReady` set, but dispose
unconditionally deletes that ID. If a replacement webview mounts before the old one
finishes teardown, the old disposer clears the replacement's readiness flag. The
browser can then have a connected, mapped webview that automation treats as not
ready. This is the same shared-key ownership class as the fixed `webviewRefs` branch;
the set needs generation/instance ownership (or equivalent replacement-safe cleanup).

### Medium — favicon cache continuation can outlive its webview

- `src/renderer/editors/browser/BrowserView.ts:160-175`

The dynamically imported favicon-cache continuation has no liveness or instance
check. A favicon event from a webview that has been replaced/closed can resolve later
and save an old page's favicon using the current model/bookmark state. Capture the
webview generation/identity and return unless that instance is still current before
performing cache writes.

### Medium — board branch key omits the board identity

- `src/renderer/editors/board/BoardEditorView.ts:181-188`

The trusted/content branch key uses `selectedBoard` (basename) plus `reloadToken`,
not `selectedRoot`. If a model is retargeted to another board with the same basename
and unchanged reload token, the existing `BoardHostView`/`BoardWebview` is updated
through its no-op `onUpdate()` and continues serving the old board. Include the
normalized/actual board root in the branch identity (as the secondary view already
does).

### High — secondary board view retargets the model without rebinding

- `src/renderer/editors/board/BoardSecondaryView.ts:48-60`
- `src/renderer/editors/board/BoardSecondaryView.ts:72-78`

`onMount()` binds to the initial `boardModel.state`, but `onUpdate()` explicitly
accepts a different `SecondaryViewProps.model`, replaces `this.boardModel`, and
continues rendering from the new model without replacing that subscription.
Consequently, state changes on the new board do not refresh the secondary frame,
while changes from the old board still invoke `renderState()` against the new
model. This needs an explicit unsubscribe/rebind handle when `boardModel` changes.

### Medium — new unsafe casts/assertions obscure lifecycle contracts

- `src/renderer/editors/board/BoardEditorView.ts:84,191,228,232-239,246`
- `src/renderer/editors/board/index.ts:22`
- `src/renderer/editors/board/BoardToolbar.ts:182`
- `src/renderer/editors/browser/BrowserView.ts:43,278,307,392,406`
- `src/renderer/editors/browser/UrlSuggestionsDropdown.ts:47`

The converted paths add 7 `as unknown as`, 5 `as never`, 7 defensive definite-
assignment `!` uses, and 1 ESLint suppression (counting the converted source at its
working-tree locations). In particular, `BoardEditorView`'s `BranchView` type is
manufactured with repeated `as unknown as`/`as never` casts, while its inputs are
already narrowed by the branch key; the browser event seams and URL suggestion
popover also use `as never`. Replace these with typed unions/handlers or runtime
guards where practical. The `!` uses violate the review standard because strict null
checks are disabled and the operator contributes no runtime safety.

### Medium — downloads button loses the popup's outside-click marker

- `src/renderer/editors/browser/DownloadButton.ts:24`
- `src/renderer/editors/browser/BrowserDownloadsPopup.ts:37,274`

The React button rendered both `name="downloads-button"` and the separate
`data-downloads-button` attribute. The native conversion supplies only the
`name`, while the popup still passes `[data-downloads-button]` as its
`outsideClickIgnoreSelector`. A pointer down on the toolbar button is therefore
treated as an outside click while the downloads popup is open, so the popup can
close/reopen instead of following its intended toggle behavior. Preserve the
marker on the converted root (or update the selector contract).

### Medium — compact tab hover previews cannot be entered

- `src/renderer/editors/browser/BrowserTabsPanel.ts:67-74`
- `src/renderer/editors/browser/BrowserTabsPanel.ts:87-91`

The React floating preview canceled the tab close timer on preview
`mouseenter` and rescheduled it on `mouseleave`. `TabExtensionView` has no
corresponding pointer handlers, while `showPreview()` still schedules disposal
after 100 ms from the tab item's `mouseleave`. Moving from a compact tab to its
preview therefore disposes it before the user can click its mute or close
controls. Forward enter/leave callbacks to the native preview content and use
them to cancel/reschedule the timer.

### Low — compact-mode new-tab button is no longer centered

- `src/renderer/editors/browser/BrowserTabsPanel.ts:81-82`

The old add-tab row used `justify="center"` in compact mode and `"start"`
otherwise. The native row is always created with `justify: "start"`, so the
new-tab button shifts to the left whenever the tab panel is compact.


### Medium — Tor status dot loses its positioned wrapper

- `src/renderer/editors/browser/BrowserView.ts:329-331`
- `src/renderer/editors/browser/BrowserView.css:12`

The React URL-start slot wrapped the status `Dot` in a
`data-tor-status-dot` span, and the stylesheet positions that wrapper at the
bottom-right of the Tor icon. The native toolbar appends the `DotView` directly
to `torIndicator`; it never emits the marker, so the CSS rule cannot match and
the status dot is laid out inline beside the icon instead of over it.

### High — stale webview can overwrite and unregister the replacement's IPC entry

- `src/renderer/editors/browser/BrowserView.ts:106-120`
- `src/renderer/editors/browser/BrowserView.ts:145-150`
- `src/main/browser-service.ts:164-170,420-437`

The native `dom-ready` handler writes `currentUrls`, marks the shared
`webviewReady` set, and sends a registration without checking that
`webviewRefs.get(tabId)` still points to this webview. Its disposer likewise
sends `unregister` based only on the shared key. During the duplicate-mount
ordering already documented in this file, an old webview can therefore replace
the main-process registration for the new webview, and the old disposer can
remove the new registration (main's registry is keyed only by that string).
Gate registration and cleanup on instance ownership, or carry a registration
generation/token through the IPC contract.

### Medium — removed pinned rows retain parent-owned event listeners

- `src/renderer/ui/sidebar/PinnedRailView.ts:140-146`
- `src/renderer/ui/sidebar/PinnedRailView.ts:177-184`

`createRow()` registers seven listeners on each dynamic row with the parent
`PinnedRailView`'s `this.listen()`. `KeyedList` can remove rows repeatedly, but
`removeRow()` disposes only the button and deletes the row record; it does not
remove those listeners. Every removed row and its captured callbacks remain
retained by the parent disposer list until the whole rail is disposed. Give each
row a local cleanup/child view, or explicitly release its listener handles on
removal.

### High — stale board frame disposal can unregister a replacement

- `src/renderer/editors/board/BoardWebview.ts:101-106,246-249`
- `src/ipc/main/board-handlers.ts:57-61`
- `src/main/cdp-service.ts:48-59`

`BoardWebview.onDispose()` correctly uses `clearIframe()`'s element identity
check, but it unconditionally calls `unregisterBoardFrame(model.id, tabId)`.
The stale branch of the `registerBoardFrame().then()` continuation does the
same. The main-side CDP map is keyed only by `${boardId}/${tab}`, so if a
replacement frame registers before the old view finishes disposal, either old
path deletes the replacement's registration. Carry the frame nonce/identity
into cleanup or make unregister conditional on the currently registered frame.

## Suggestions (optional improvements)

- Exercise browser navigation/redirect/download/bookmark/Tor/suggestion/drag and
  last-tab replacement paths after the lifecycle conversion; these were not covered
  by the supplied runtime measurements and remain the most likely place for a
  teardown or stale-instance defect.

## OK

- The review covered the uncommitted EPIC-072 source changes, including the board and
  browser native conversions, page-manager native path, sidebar/tree forwarding,
  error view, package dependency removal, and converted UIKit view files. The supplied
  typecheck/lint/build and runtime measurements were not repeated.

## Fixes applied

- Finding 1: gated browser IPC registration and unregistration on the owning webview instance.
- Finding 2: gated board-frame cleanup on iframe ownership and threaded the frame nonce through CDP unregistration.
- Finding 3: only the current webview instance may clear the shared readiness flag.
- Finding 4: guarded favicon cache continuations with the originating webview identity and liveness.
- Finding 5: stored the tabs host, applied the restored width during sync, and initialized the splitter from it.
- Finding 6: kept the 2px loading spacer and toggled the loading animation from `state.loading`.
- Finding 7: reset the favicon fallback on every render and reveal it when the image fails.
- Finding 8: restored the `data-tor-status-dot` wrapper around the Tor status dot.
- Finding 9: restored `data-downloads-button` on the converted root to preserve the popup selector contract.
- Finding 10: forwarded preview mouse enter/leave to cancel and reschedule the close timer.
- Finding 11: centered the compact-mode add-tab row and updated it when width changes.
- Finding 12: included the selected board root in the main board branch identity.
- Finding 13: replaced the secondary board state's bind with an explicitly replaceable subscription.
- Finding 14: gave each pinned row a local cleanup for its seven DOM listeners.
- Deferred unsafe assertions: remaining 3 `as unknown as` (`src/renderer/editors/board/index.ts:22`, `src/renderer/editors/board/BoardEditorView.ts:84`, `src/renderer/editors/browser/BrowserView.ts:400`), 4 `as never` (`src/renderer/editors/browser/UrlSuggestionsDropdown.ts:47`, `src/renderer/editors/browser/BrowserView.ts:283,312,414`), 1 definite-assignment `!` (`src/renderer/editors/board/BoardToolbar.ts:182`), and 1 ESLint suppression (`src/renderer/editors/browser/BrowserView.ts:43`) remain deferred.
