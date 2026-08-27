# US-1157 — Browser editor native view

**Epic:** [EPIC-072](../../epics/EPIC-072.md) — De-React E14, the `Component` arm dies  
**Depends on:** [US-1154](../US-1154-e14-baseline/README.md) — live baseline  
**Status:** Implementation complete; live verification pending

## Goal

Convert the browser editor from the registry's React `Component` arm to a native `VanillaView`
`View`, while preserving browser-tab, webview, IPC, toolbar, sidebar, overlay, and popup behavior.
Remove every React-producing path from `src/renderer/editors/browser/` and remove the direct
`@floating-ui/react` dependency. The browser's page slot must have no React root at any tab count,
and every open internal tab must own exactly one connected `<webview>`.

## Background

### Baseline and measured target

US-1154 captured a live session with five browser tabs:

| Root chain | Count | Meaning |
|---|---:|---|
| `page-editor<page-slot` | 1 | The registry `Component` arm mount |
| `editor-toolbar` → `browser-toolbar-content` | 1 | Browser toolbar content root |
| `url-input<url-bar<browser-toolbar-content` | 1 | Nested `Input`/`mountVanilla` root |
| `page-slot<webview-area<browser-body` | **5** | One retained root per browser tab |

The five per-tab roots are created by `BrowserView.tsx:598-618`: the React `PageManager` face
receives a fragment from `renderPage`, and that fragment contains `BlankPageLinks` when applicable
plus `BrowserWebviewItem`. The largest root term must go to zero; merely reducing it is not enough.

Static scope is 111 JSX markers over 1,479 lines in eight non-story files. After conversion, those
eight files become `.ts` files and there must be no non-story `.tsx` file in `editors/browser/`.

### Verified PageManager seam — resolved conversion decision

The underlying lifecycle is already partly native, but the current source does not yet expose the
native arm through `PageManagerView`:

- `src/renderer/components/page-manager/PageSlot.ts:52-82` already implements
  `renderNative(root, viewConstructor)`. It attaches the stable placeholder, constructs a native
  view with `{ pageId }`, mounts it, and rolls back on failure.
- `src/renderer/components/page-manager/PageSlot.ts:85-119` disposes a native slot by removing the
  placeholder first and then disposing the native view. This is the required ordering for a
  webview: the DOM subtree is detached, then the view removes listeners, unregisters IPC, and
  deletes the model reference.
- `src/renderer/components/page-manager/PageManagerView.ts:5-15` still types `renderPage` as
  `(id: string) => ReactNode`, and `:63-73` still calls `slot.render(this.root, renderPage(id))`.
- `src/renderer/components/page-manager/PageManager.tsx` is the React face over that manager. A
  symbol search finds exactly one caller, the browser import and JSX use at
  `BrowserView.tsx:27,598`; there is no second `PageManager` caller.
- `src/renderer/components/page-manager/PageManagerView.ts` has exactly one consumer, that React
  face. `src/renderer/ui/app/PagesView.ts:1,8,11` uses the independent `AppPageManagerView`, not
  `PageManagerView`; both classes extend `VanillaView` directly.

Therefore the epic's statement that the native container is ready is true underneath, and the
conversion can expose it directly. Change `PageManagerView.ts` outright to the native render
contract, following `AppPageManagerView.ts:1,4,24` and `:146-157` plus the existing
`PageSlot.renderNative()` path. Convert the browser before deleting the face; then rerun a symbol
search for `PageManager` (excluding `PageManagerView` and `AppPageManagerView`). If it is zero,
delete `PageManager.tsx` as a consequence of its last value caller dying. If anything still
references the symbol, leave the face in place and record that reference. This is not a scope
expansion: EPIC-072 §E14-8 says a face dies when its last value caller dies, and no task deletes one
on purpose. There is no need to duplicate reconciliation or use `AppPageManagerView`.

The related directory check found that `PageSlot.ts` remains referenced by both native managers,
while `GroupContainer.ts` and `ImperativeSplitter.ts` have no source references outside their own
pair. They are pre-existing unreferenced helpers and are not deleted by this task.

Before → after seam (proposed):

```ts
// Current PageManagerView.ts
renderPage: (id: string) => ReactNode;
// reconcile()
slot.render(this.root, renderPage(id));

// Proposed native contract
renderPage: (id: string) => VanillaViewCtor<PageSlotViewProps>;
// reconcile()
slot.renderNative(this.root, renderPage(id));
```

After the browser conversion, rerun the symbol search before deleting
`src/renderer/components/page-manager/PageManager.tsx`; the expected result is zero callers and
the file is then removed as the last React face in this chain.

### Native patterns to follow

The closest completed conversions are:

- `src/renderer/editors/settings/SettingsView.ts` and
  `src/renderer/editors/settings/sections/SettingsSections.ts`: construct child views, claim with
  `child()`, append roots, mount exactly once, and use `SubtreeSwap` for conditional status.
- `src/renderer/editors/mcp-inspector/McpInspectorView.ts` and its panel views: use native
  `EditorToolbarView`, `KeyedList`, `SubtreeSwap`, explicit `releaseChild()`, and state bindings
  installed once from `onMount()`.
- `src/renderer/ui/secondary-views/SecondaryViewsView.ts`: the native controlled secondary-view
  host already disposes records before its stack and explicitly retires lazy panel views.
- `src/renderer/uikit/shared/vanilla-view.ts`: `child()` claims ownership but does not mount;
  `dispose()` does not detach roots; `releaseChild()` is the explicit dispose + detach + unregister
  operation. `bind()` and `listen()` register lifetime cleanup and must not be installed from a
  repeatedly-called sync method.
- `src/renderer/uikit/shared/subtree-swap.ts`: the correct owner for one conditional branch. It
  inserts a replacement before disposing/detaching the old branch, and owns the branch's root.
- `src/renderer/uikit/shared/keyed-list.ts`: the correct owner for tab rows. Its `remove` callback
  must dispose view-owned row resources before the helper detaches the row node.

### Floating positioning decision

`BrowserTabsPanel.tsx:2` is the only `@floating-ui/react` importer. Its single hook call at
`:187-192` positions the compact tab hover preview at `right-start` with a fixed strategy,
`offset({ mainAxis: -1 })`, and `autoUpdate`; the preview closes after 100 ms at `:210-215`.

Use the existing native `PopoverView` / `PopoverFloatingView` path, which already uses
`@floating-ui/dom` `computePosition` + `autoUpdate` and supports `contentView` for a native child.
Follow `src/renderer/uikit/Popover/PopoverView.tsx:35-124,260-318` and the native content-view
shape in `src/renderer/uikit/Menu/MenuView.ts:35-91`; this preserves the fixed placement lifecycle
without adding a ninth local positioning implementation. `attach-tooltip.ts` is not the right
semantic helper because it imposes tooltip ownership/registry behavior. `Menu/attach-menu.ts` and
`ui/dialogs/poppers/showPopupMenu.ts` confirm the existing DOM-side popup ownership conventions,
but neither models a tab preview. The preview's portalled root needs a root-level
`data-tab-extension` hook and corresponding unscoped selector in `BrowserTabsPanel.css`; the old
`.browser-tabs-root [data-tab-extension]` selector cannot style a root moved to the overlay layer.

### Webview lifecycle already present in the React implementation

`BrowserWebviewItemImpl` is the `memo()`'d component at `BrowserView.tsx:47-217`. Its three effects
are the authoritative lifetime contract:

| Current effect | Setup | Cleanup | Native landing |
|---|---|---|---|
| `:59-76`, dependencies `model/internalTabId` | Warn if a different connected webview is already registered, then set `model.webview.webviewRefs[internalTabId]` | Delete that tab ID from `webviewRefs` | `BrowserWebviewItemView.onMount()` / `onDispose()`; preserve the US-806 duplicate-connected guard verbatim in meaning |
| `:78-86`, empty dependency list | Attach `focus` listener; dispatch a document `mousedown` so app chrome focus state updates | Remove the `focus` listener | `onMount()` with `this.listen(webview, ...)`, automatically released by view disposal, or an explicit paired handle if the webview element is recreated |
| `:88-182`, dependencies `model/tabId/internalTabId` | Attach `dom-ready`, `ipc-message`, and `found-in-page`; on `dom-ready`, update current URL, mark `webviewReady`, send `BrowserChannel.register`, and apply page mute | Delete `webviewReady`, remove all three listeners, and if registered send `BrowserChannel.unregister` for `${tabId}/${internalTabId}` | `BrowserWebviewItemView.onMount()` / `onDispose()`; keep `tab.url` out of this lifecycle and keep `isActive` as an updateable field for `found-in-page` routing |

The native item must capture the initial URL once in its constructor, set `src`, `partition`,
`preload`, and `allowpopups` before mount, and update only the properties that React's comparator
allowed to change (`isActive` and blank-page background state). Do not recreate an item on ordinary
tab-array or navigation updates. `BrowserWebviewModel.navigateWebview()` must remain gated by
`webviewReady` and must continue using `loadURL()` rather than changing the initial `src`.

The parent `BrowserTabPageView` must own the item for the whole PageSlot lifetime. On a close,
`BrowserTabsModel.closeTab()`, `closeOtherTabs()`, or `closeTabsBelow()` removes the ID from state;
PageManager reconciliation disposes that ID's `PageSlot`, which detaches the placeholder and then
disposes `BrowserTabPageView`, which disposes `BrowserWebviewItemView`. That cleanup removes all
listeners, clears `webviewReady`, sends `BrowserChannel.unregister` when `dom-ready` registered it,
and deletes `webviewRefs`. When the last tab is closed, `BrowserTabsModel` replaces its ID with a
fresh blank tab in the same state update; reconciliation disposes the old slot and constructs a
new slot/item for the new ID. A normal `addTab()` similarly creates one new PageSlot and exactly one
new item while existing keyed slots remain untouched.

### All other current effects and state boundaries

`BrowserView.tsx` has four additional effects that must become explicit native lifecycle/state
operations:

| Location | Current behavior | Native plan |
|---|---|---|
| `:387-390` | `model.webview.initIpcHandler()` / cleanup | Call once in the root view's `onMount()`; dispose in `onDispose()` |
| `:392-394` | `model.urlBar.syncFromUrl(url)` | Run from the root state projection with an identity guard for the last synced URL; do not create a subscription from `sync()` |
| `:396-403` | One-shot blank-page URL-input focus after 100 ms | Schedule from `onMount()`/initial projection and clear the timer on disposal; retain the initial-load guard |
| `:406-411` | Navigate only when active tab ID or active tab URL changes; deliberately excludes whole `activeTab` identity | Keep an explicit `(activeTabId, activeTab.url)` key and call `navigateWebview()` only when that key changes |

The root's state binding should be installed once from `onMount()`. Its projection must carry all
fields currently read at `:342-383`: active URL/navigation flags, tab list and active ID, panel
widths, profile/privacy/Tor state, URL-bar state, bookmarks state, popup count, and find-bar state.
Child views receive updates from that one consequence or bind their own stable model state. No
`this.listen()` or `bind()` call may appear in a method that runs for each state update. `bind()` is
appropriate only for state that outlives the view; replaceable models require an explicit
unsubscribe before a new subscription.

## Implementation plan

### 1. Make the PageManager native arm callable (required scope decision)

Modify `src/renderer/components/page-manager/PageManagerView.ts` outright. Replace the React-node
callback with a native constructor callback using `VanillaViewCtor<PageSlotViewProps>`, remove its
React type import, and call `PageSlot.renderNative()`.
Preserve stable ID maps, append-only placeholder attachment, order stability on tab reorder,
visibility by `display`, and complete disposal on manager teardown. Do not alter `PageSlot.ts`;
its native lifecycle and rollback are already the required implementation. Preserve both load-bearing
sequences exactly: `renderNative()` attaches the placeholder, constructs, mounts, and rolls back on
failure; `PageSlot.dispose()` removes the placeholder before disposing the native view. If a browser
per-tab path appears to need another sequence, explain it in this document instead of reordering
`PageSlot`.

The browser will import `PageManagerView` directly and provide one stable constructor factory for
all tabs. The constructor must create a per-tab `BrowserTabPageView` from the captured browser
model and page ID; the PageManager itself must not create a React root. Convert the browser before
the face deletion, then rerun the exact `PageManager` symbol search. With zero callers, delete
`src/renderer/components/page-manager/PageManager.tsx`; if a caller remains, leave it and record why.

### 2. Convert the registry entry point

Rename `src/renderer/editors/browser/index.tsx` to `index.ts`. Replace the three-line React wrapper
with the native constructor:

```ts
// Before
function BrowserEditorComponent({ model }: { model: EditorModel }) {
    return <BrowserEditorView model={model as BrowserEditor} />;
}
// ... Component: BrowserEditorComponent

// After
// ... View: BrowserEditorView
```

Keep `createEditor`, the public `BrowserEditor` export, and the state/event type exports. Remove
the React `EditorModel` wrapper import. The class must have a public constructor accepting
`{ model: BrowserEditor }` so it satisfies the registry's native view constructor contract.

### 3. Convert `BrowserView.tsx` to `BrowserView.ts` and build the native browser tree

Create `BrowserEditorView extends VanillaView<{ model: BrowserEditor }>` in the renamed file. Keep
the existing `browser-root` class for `BrowserView.css`, add the semantic `data-type` root marker,
and use native `createPanelElement`, `EditorToolbarView`, `InputView`, `IconButtonView`,
`ButtonView`, `SpinnerView`, `DotView`, `SplitterView`, `FindBarView`, `ListBoxView`, `PopoverView`,
and `createIconElement`/icon builders. Import borrowed UIKit styles explicitly where a direct view
constructs a component's DOM, following the UI-kit guide.

Use small private native view classes in this file where a stable child owns interaction or a
conditional subtree:

- `BrowserToolbarView`: owns the home/back/forward/reload/bookmark/Tor-info/download/more/devtools/
  close controls, the URL `InputView`, search-engine chip, URL start/end slot children, and native
  `openMenu()` handles for the search-engine and page menus. Dispose both menu handles explicitly;
  do not use `WithMenu`, whose render-prop face and nested React `Input` face are the roots called
  out by US-1154.
- `BrowserTabPageView`: owns one `BrowserWebviewItemView` plus a `SubtreeSwap` for
  `BlankPageLinksView`. Bind the tab's relevant model projection so blank-page content is created
  only when `bookmarksReady && model.tabs.bookmarks` and is released when the tab navigates away or
  bookmarks disappear.
- Root-level branch hosts use `SubtreeSwap` for popup-blocked content, Tor overlay, click overlay,
  find bar, bookmarks drawer, and URL suggestions. A false condition must call `clear()` and hence
  dispose/detach its native branch; hiding or `replaceChildren()` without disposing is not enough.

Preserve these behavior details exactly:

- `BrowserEditor`'s `webview.initIpcHandler()`/`disposeIpcHandler()` pair.
- The navigation effect's narrow active-ID/URL key and `webviewReady` gating.
- The initial URL capture and blank-page focus timer.
- The blocked-popup bar and `allowPopups`/`dismissBlockedPopups` actions.
- `webview-click-overlay` while the page menu/popup state requires it.
- `FindBarView` props and its existing keyboard behavior.
- Tor-only info button and Tor overlay conditions.
- `bookmarksReady`/`BrowserBookmarks` availability and both blank page and drawer placements.

Before → after for the per-tab root:

```tsx
// Before: one React fragment is rendered into each PageSlot.
renderPage={(tabId) => <>
    {isBlank && bookmarksReady && <BlankPageLinks bookmarks={...} />}
    <BrowserWebviewItem model={model} tab={tab} ... />
</>}

// After: PageManagerView creates and retains one native page view per ID.
renderPage={(tabId) => browserTabPageViewCtor}
// BrowserTabPageView owns BrowserWebviewItemView and a SubtreeSwap blank branch.
```

### 4. Convert `BrowserTabsPanel.tsx` to `BrowserTabsPanel.ts`

Implement `BrowserTabsPanelView` with a stable list host and `KeyedList<BrowserTabData, string>`.
Implement each row as a native `TabItemView` (or an equivalent row record) that owns its DOM
listeners and conditionally-owned mute/close `IconButtonView`s. `KeyedList.remove` must dispose
the row and its button children before detaching the row. The row update must remove attributes and
release children when `compact`, `showClose`, `audible`, or `muted` arms change.

Translate the current trait drag behavior to native `DragEvent` handlers using the existing
`core/traits` helpers. Use `DragEnterCounter` for descendant enter/leave noise; keep the existing
`stopPropagation`, `dropEffect`, payload validation, group move, and drop-target state.

For the compact hover preview, use a native `PopoverView` with `placement: "right-start"`,
`offset: [0, -1]`, fixed positioning, and a native `TabExtensionView` content view. Clear the
100-ms close timer on re-entry, dispose the popover on final leave, tab close, and panel disposal,
and ensure the content view's roots/buttons are disposed. Update/recreate the content deliberately:
`PopoverView.contentView` is not an update channel, so retain a bare content reference or recreate
the branch; never call `child()` a second time for the same view.

### 5. Convert `BookmarksDrawer.tsx` and `BlankPageLinks` to native views

Rename `BookmarksDrawer.tsx` to `BookmarksDrawer.ts` and implement `BookmarksDrawerView` with the
same absolute overlay geometry, focus behavior, Escape close, width calculation, transform, and
10-ms opening timer. The timer must be cleared during disposal. Construct and own
`LinkBreadcrumbView`, `LinkActionView`, `LinkBodyView`, and `LinkFooterView` directly; do not retain
the four `mountVanilla()` calls. Mount `BrowserSecondaryViewsView` directly between the body and
link content. Dispose the complete drawer branch when it closes.

Move `BlankPageLinks` into `BrowserView.ts` or `BookmarksDrawer.ts` as a native view. Construct its
three link-editor views and native secondary-view host directly, and let `BrowserTabPageView`'s
`SubtreeSwap` dispose it on navigation away from `about:blank`.

### 6. Convert `TorStatusOverlay.tsx` to native

Rename to `TorStatusOverlay.ts`. Implement `TorStatusOverlayView` with native panel/button/icon
views and `ColorizedCodeView` (not the React `ColorizedCode` face). Replace the `torLog` scrolling
effect with a `scrollTop = scrollHeight` write after initial mount and whenever the log projection
changes. Create/release the close button, reconnect button, spinner/icon, and colorized-log child
according to the current status/log arms. The parent branch must clear/dispose the overlay when
Tor is disabled or the overlay is hidden.

### 7. Convert `UrlSuggestionsDropdown.tsx` to native

Rename to `UrlSuggestionsDropdown.ts`. Use a native `PopoverView` and an adopting native content
view (`super(props, host)`) so the header and `ListBoxView` remain direct children of the floating
root. Use `ListBoxView`'s `onModel` to retain its model for `scrollToIndex()` and explicitly clear
the reference on disposal. Create/release the Clear button with `child()`/`releaseChild()` as the
search-mode arm changes. Push typed list props to the existing list view on updates, and scroll to
the new hovered index after the update. Prevent default on the popover's native `mousedown` as the
React version did. The parent must dispose the whole suggestions branch when the effective open
condition (`open && anchorEl && items.length > 0`) becomes false.

### 8. Convert `DownloadButton.tsx` to native

Rename to `DownloadButton.ts`. Implement `DownloadButtonView` with a native `Panel` equivalent,
owned `IconButtonView`, and a native SVG progress ring. Bind `downloads.state` once from `onMount()`
and update `active` plus both circle dash attributes from the projection. Pass the native button
element to `showDownloadsPopup()` and dispose the binding/button with the view. Preserve the
existing popup toggle behavior and theme colors.

### 9. Convert `BrowserSecondaryViews.tsx` to native and check C8

Rename to `BrowserSecondaryViews.ts`. Implement a small `BrowserSecondaryViewsView` that owns one
`SecondaryViewsView`, passes `host.panelEditors`, `nav.state.get()`, and `host.setSecondaryViewsState`,
and updates it from stable subscriptions to `nav.state` and `host.state`'s `version`. Install each
subscription once in `onMount()` and release it on disposal. Do not bind from the repeated update
path.

The current wrapper accepts only a `BrowserPanelHost`, not a replaceable secondary model. It calls
`host.ensureSecondaryViewsModel()`, whose model is created once and retained by the host; it does
not have the US-1152 shape of accepting one model and binding as if it were fixed. Do not change
the five pre-existing US-1152 defects. The new native view must nevertheless retarget its child
props explicitly if the host or navigation model ever changes, and must not introduce a sixth
fixed-model binding.

### 10. Remove the floating React dependency

Remove `@floating-ui/react` from `package.json` and refresh `package-lock.json` with the repository's
normal package-manager operation. Keep `@floating-ui/dom`; it is used by native `PopoverView`,
`attach-tooltip.ts`, and other existing consumers. Keep any `@floating-ui/react-dom` lock entry that
remains required transitively by `@radix-ui/react-popper`; uninstalling the direct package must not
be turned into an unrelated dependency-tree cleanup.

### 11. Cold-start and static verification

Because the browser is dynamically imported and the conversion changes `.tsx` to `.ts`, start every
verification from a cold dev server. If Vite reports a stale dynamic-module specifier, touch the
importer as required by the project guidance; do not treat a renderer reload as sufficient.

Static checks must establish:

- `rg --files src/renderer/editors/browser` finds no non-story `.tsx`.
- The eight converted files contain no JSX and no calls to React faces, `mountVanilla`, or
  `WithMenu`; the browser path imports no `@floating-ui/react`.
- `browserModule` exposes `View: BrowserEditorView`, not `Component`.
- `package.json` has no `@floating-ui/react` dependency; `@floating-ui/dom` remains.
- There are no `this.listen()`/`bind()` calls inside repeated state-sync methods.

No unit tests or test harnesses are to be added; this project does not use them for this work.

## Concerns / Open questions

### C2 — Duplicate webview leak is a release gate

Keep the warning currently at `BrowserView.tsx:62-72` in the native webview item. It is not cosmetic:
a connected abandoned `<webview>` keeps a guest renderer alive. The strongest available assertion is
exactly one connected webview per internal tab, checked after add, close, reorder, navigation, and
cold reload. A warning-free run is useful, but the DOM/map count is the acceptance assertion.

### C4 — Verification matrix and explicit concessions

Verify live without network first: blank-page rendering, creation of five `about:blank` tabs,
switching, reordering, compact tab hover preview, tab drag-and-drop, close/close-other/close-below,
last-tab replacement, URL-bar focus/keyboard handling, and the exact webview registration count.
Use `about:blank#one`/`about:blank#two` if navigation-history suggestions need non-empty entries;
these exercise the history path without relying on an external site.

Verify live when the environment permits: a normal HTTPS navigation and redirect, URL suggestions
from search/navigation history, downloads and the download popup, bookmark drawer/clear/star flows,
Tor status/reconnect/overlay, and an incognito tab. These are manual live surfaces, not harnesses.

Record each unavailable surface separately:

- **Could not reach:** network-dependent HTTPS/redirect, download, or search-history behavior when
  the environment has no usable network or fixture; Tor when the daemon/proxy cannot be started.
- **Not allowed:** do not inspect or use the forbidden Evergreen customer-data paths/files during
  verification. If bookmark verification would require those data files, use a manually-created
  scratch bookmark file instead and record the customer-data path as not allowed.
- **Measured as zero:** only the static/DOM assertions actually observed, especially zero
  `[data-react-root]` under the browser's `webview-area` page slot and exactly one connected
  `<webview>` per open tab.

The implementation must not report a conceded surface as passing. The final task record should name
the exact surface, its concession category, and whether a later live pass is still warranted.

### Implementation verification record

The implementation agent did not launch or drive the application. Therefore no live surface below
is claimed as measured as zero; all require the requested manual pass. The static checks completed
were source/build checks only.

- **Could not reach:** HTTPS navigation and redirect, URL suggestions from real search/navigation
  history, downloads/download popup, bookmark drawer/clear/star flows, Tor status/reconnect/overlay,
  and incognito partition behavior were not exercised and still warrant a later live pass.
- **Not allowed:** Evergreen customer-data files and the `EverGreen/web-wiki`, `EverGreen/wiki`,
  and `EverGreen/worklog` paths were not inspected. If bookmark verification needs persisted data,
  use a manually-created scratch bookmark file.
- **Measured as zero:** none live. Static checks did establish no browser `.tsx` files, no browser
  `@floating-ui/react` import, and a successful production build, but these do not replace DOM checks.

The remaining live matrix is: blank-page rendering; five `about:blank` tabs; switching; reordering;
compact hover preview; tab drag-and-drop; close, close-other, close-below, and last-tab replacement;
URL-bar focus/keyboard handling; exact one-webview/one-reference registration counts; normal HTTPS
navigation and redirect; history suggestions; downloads; bookmark drawer and clear/star flows; Tor
status/reconnect/overlay; incognito; blocked-popup bar; find bar; and the zero `[data-react-root]`
assertion under the browser page slot.

### C5 — Cold restart

A cold dev-server restart is required before the static and live pass. HMR can retain the old
`.tsx` dynamic import graph after a rename and can make a broken conversion appear to work.

### C8 — Secondary views

`BrowserSecondaryViews.tsx:15-16` currently re-derives from `nav.state` and `host.state.version`.
The native replacement must retain both signals, update `SecondaryViewsView` with current state and
panel editor list, and release the child view on drawer/blank-page teardown. Do not alter
`BrowserPanelHost.ts` or the five pre-existing US-1152 rebinding defects.

### Resolved PageManager decision

The adjacent `PageManagerView.ts` change is authorized by the caller chain and is not a scope
expansion. EPIC-072 §E14-8 requires a face to die when its last value caller dies, and forbids
deleting one on purpose. Convert the browser first, then rerun the exact `PageManager` symbol search;
with zero callers, delete `PageManager.tsx` as the consequence of this conversion. The independent
`AppPageManagerView` path is not involved, and no reconciliation duplicate is needed.

## Acceptance criteria

- [ ] `browserModule` exposes `View: BrowserEditorView`; it no longer exposes `Component`.
- [ ] The eight named browser source files are `.ts`, contain no JSX, and the browser folder has no
      non-story `.tsx` file.
- [ ] The browser editor creates no React element and no React root in its page content, toolbar,
      tab rows, drawer, overlay, suggestions, download control, or secondary-view paths.
- [ ] The nested `url-input<url-bar<browser-toolbar-content` root is gone because `InputView` and
      the menu triggers are native; both the outer browser `Component` root and all per-tab roots
      are gone.
- [ ] At zero, one, and five-plus internal tabs, the browser page slot itself does not match
      `[data-react-root]`, and `pageSlot.querySelectorAll("[data-react-root]")` returns zero.
- [ ] After tab creation, navigation, switching, reorder, close variants, and last-tab replacement,
      each open tab has exactly one connected `<webview>`, one `webviewRefs` entry, and no stale
      `webviewReady` entry for closed IDs.
- [ ] Closing a tab disposes its PageSlot/native tab view, removes webview listeners, unregisters
      its `${pageId}/${internalTabId}` IPC registration when registered, and deletes its map entry;
      adding a tab creates exactly one new native tab view/webview.
- [ ] Tor, blank page, bookmarks drawer, URL suggestions, download button/popup, blocked-popup bar,
      find bar, compact hover preview, tab drag-and-drop, and incognito partition behavior retain
      their existing conditions and interactions; unavailable live surfaces are explicitly recorded
      under C4 as could-not-reach or not-allowed, never silently treated as zero.
- [ ] `@floating-ui/react` is absent from `package.json`; `@floating-ui/dom` remains and native
      popover positioning uses the existing `PopoverView` contract.
- [ ] A cold dev-server verification has been completed, with no new unit test or harness files.
- [ ] No dashboard entry is added or changed by this task; the epic task entry already exists and
      remains unchecked until the epic review model permits completion.

## Files that need no changes

These files were inspected to verify contracts and must not be changed for this task's browser
behavior:

- `src/renderer/editors/browser/BrowserEditor.ts`
- `src/renderer/editors/browser/BrowserEditorModel.ts`
- `src/renderer/editors/browser/BrowserTabsModel.ts`
- `src/renderer/editors/browser/BrowserWebviewModel.ts`
- `src/renderer/editors/browser/BrowserUrlBarModel.ts`
- `src/renderer/editors/browser/BrowserBookmarksUIModel.ts`
- `src/renderer/editors/browser/BrowserBookmarks.ts`
- `src/renderer/editors/browser/BrowserPanelHost.ts`
- `src/renderer/editors/browser/BrowserDownloadsPopup.ts`
- `src/renderer/components/page-manager/PageSlot.ts`
- `src/renderer/components/page-manager/GroupContainer.ts` (pre-existing unreferenced helper; do not delete)
- `src/renderer/components/page-manager/ImperativeSplitter.ts` (pre-existing unreferenced helper; do not delete)
- `src/renderer/uikit/shared/vanilla-view.ts`
- `src/renderer/uikit/shared/subtree-swap.ts`
- `src/renderer/uikit/shared/keyed-list.ts`
- `src/renderer/ui/secondary-views/SecondaryViewsView.ts`
- `src/renderer/ui/secondary-views/LazySecondaryViewView.ts`

The no-change list excludes the required `PageManagerView.ts` seam because it is the native arm used
by the browser. `BrowserTabsPanel.css` is a required style adjustment only if the chosen
`PopoverView` portal path is used; `BrowserView.css` otherwise remains unchanged.

## Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/browser/index.tsx` → `index.ts` | Native `View` registry entry; remove React component wrapper |
| `src/renderer/editors/browser/BrowserView.tsx` → `BrowserView.ts` | Native browser root, toolbar, keyed native tab-page seam, branch teardown, and effect migrations |
| `src/renderer/editors/browser/BrowserTabsPanel.tsx` → `BrowserTabsPanel.ts` | Native keyed tab rows, drag/drop, menus, and hover preview |
| `src/renderer/editors/browser/BookmarksDrawer.tsx` → `BookmarksDrawer.ts` | Native persistent drawer branch and direct link-editor child views |
| `src/renderer/editors/browser/TorStatusOverlay.tsx` → `TorStatusOverlay.ts` | Native Tor overlay and explicit log/control teardown |
| `src/renderer/editors/browser/UrlSuggestionsDropdown.tsx` → `UrlSuggestionsDropdown.ts` | Native popover/list branch and clear-button teardown |
| `src/renderer/editors/browser/DownloadButton.tsx` → `DownloadButton.ts` | Native download control and SVG progress ring |
| `src/renderer/editors/browser/BrowserSecondaryViews.tsx` → `BrowserSecondaryViews.ts` | Native controlled secondary-view bridge |
| `src/renderer/editors/browser/BrowserTabsPanel.css` | Portal-root selector adjustment for native compact hover preview, if required |
| `src/renderer/components/page-manager/PageManagerView.ts` | Required native arm: route `renderPage` to `PageSlot.renderNative` |
| `src/renderer/components/page-manager/PageManager.tsx` | Delete after the browser conversion and zero-caller verification; consequence of its last caller dying |
| `package.json` | Remove direct `@floating-ui/react` dependency |
| `package-lock.json` | Lockfile update for the direct dependency removal; retain transitive packages still required |


---

## Live verification (2026-08-27, after a cold dev-server restart)

Network-free: `about:blank` tabs only. Structure and registration maps only — no page content read.

| Tabs | webviews in DOM | connected | `webviewRefs` | `webviewReady` | stale refs | roots in browser subtree | app roots |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 1 | 1 | 1 | 0 | **0** | 1 |
| 4 | 4 | 4 | 4 | 4 | 0 | **0** | 1 |
| 3 (closed one) | 3 | 3 | 3 | 3 | 0 | **0** | 1 |
| 2 (closed one) | 2 | 2 | 2 | 2 | 0 | **0** | 1 |
| 1 (closed one) | 1 | 1 | 1 | 1 | 0 | **0** | 1 |
| 2 (re-added) | 2 | 2 | 2 | 2 | 0 | **0** | 1 |

Toolbar, URL bar and tab list all present at every step. Root counts are root-inclusive.

**The per-open-tab React root term is gone.** US-1154's baseline measured 5 tabs → 5 per-tab roots plus
2 toolbar roots (one nested inside the other) = 7 of the app's 9. The browser subtree now measures 0 at
every tab count, and the whole application measures 1 — `GlobalStyles`.

**Concern C2 verified: no webview leak.** At every step `webviews in DOM == connected == webviewRefs ==
webviewReady`, with zero refs pointing at a disconnected element. Closing tabs one at a time and then
re-adding one proves both directions of the per-tab lifecycle, and the re-add proves registration still
works after teardown. This is the assertion that matters, because a leaked `<webview>` keeps a live
guest renderer with no visible symptom.

### One deliberate deviation from parity

`BrowserView.ts:87` now deletes its `webviewRefs` entry **only if that entry is still its own**:

```ts
this.own(() => {
    if (this.model.webview.webviewRefs.get(this.tabId) === this.webview) {
        this.model.webview.webviewRefs.delete(this.tabId);
    }
});
```

The React original deleted unconditionally, so this is not a transcription — it is a deliberate
hardening, recorded here because a conversion's contract is parity and any departure should be
attributable. The reason: the duplicate-mount warning immediately above it exists because *"the
previous view tree was abandoned without unmount — its webview keeps a guest renderer process alive.
Observed once during US-806; trigger unknown."* In that ordering an unconditional delete removes the
**live** webview from the map, so `webviewRefs.get(tabId)` reports nothing for a tab that has one and
the tab silently stops responding to navigation. Identical in the normal path; differs only in the
state the warning was added to detect. Same class as the board bridge regression (epic C1a).

`webviewReady` is left as a plain unconditional `Set.delete` — it holds no identity to compare against
and is re-added on the next `dom-ready`, so the exposure is a narrow window rather than a lost
reference. Recorded as a residual, not fixed.

### Not verified

Everything network-dependent, as conceded in C4: HTTPS navigation and redirects, URL suggestions from
search/navigation history, downloads and the download popup, bookmark drawer flows, Tor
status/reconnect/overlay, and incognito partitions. Also not exercised: tab drag-and-drop, tab hover
preview (the `@floating-ui/dom` port), close-other/close-below, and last-tab replacement. Category for
all of these: **could not reach with the available instrument** — not *not allowed*.
