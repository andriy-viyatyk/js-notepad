# US-1148 — Convert `link-editor` to native views

**Epic:** [EPIC-071](../../epics/EPIC-071.md), task 7 (De-React E13)
**Status:** investigation complete; implementation not started
**Investigation date:** 2026-08-27

## Goal

Convert the remaining React implementation in `src/renderer/editors/link-editor/` to native
`VanillaView`/DOM views. The existing `LinkEditorView` is already on the `View` arm; this task
removes the React body, the React chrome factories in `index.ts`, and the less visible tooltip and
compatibility residue without adding a transitional React root.

The conversion order is mandatory: convert the `index.ts` chrome contributions first, then
`LinkBody`. This follows the import graph. `LinkEditorView` currently owns `TextChromeView` and
passes a React `linkBodyElement()` result as its `children` slot (`index.ts:489-519`); `TextChromeView`
uses `fillSlot` for that slot (`TextChromeView.ts:409-412`). If the body were converted while that
owner still supplied the old React-shaped chrome/body values, the native child would have to be
hosted through a React `fillSlot` root. Converting the owner/contributions first lets the final
body be a claimed native child whose `root` is passed as a `Node`, keeping the open-link-page root
count at 1 → 0.

## Background

### Governing documents and baseline

`CLAUDE.md`, `.claude/rules/task-docs.md`, and `src/renderer/uikit/CLAUDE.md` were read before the
investigation. EPIC-071 §E13-12 supersedes §E13-4's face table. The corrected table makes
`Breadcrumb` and `ListItem` the two faces collected by this task; `IconButton`, `Input`, and
`Button` remain live outside the cut. EPIC-071 §E13-7 concern 2 specifically calls out this
editor's hook density, tooltip file, pinned panel, and three already-vanilla secondary views.

US-1151's `link-editor` baseline was captured on an empty new untitled link file:

| Measure | Baseline |
|---|---:|
| elements | 55 |
| `[data-react-root]` | **1** |
| `data-part="react-slot"` | 1 |
| SVG / empty SVG | 2 / 0 |
| buttons / inputs | 5 / 1 |

The twelve baseline markers are `text-chrome-root`, `text-chrome-top`,
`link-editor-breadcrumb-categories`, `link-editor-add`, `link-editor-view-mode`,
`link-editor-search`, `page-editor-switch`, `link-editor-root`, `link-editor-center`,
`link-editor-empty`, `text-chrome-footer`, and `text-toggle-script`. The baseline explicitly says
that `link-editor-empty` is present because the file has no links, and neither list nor tiles body
is present. It therefore cannot verify the populated body, pinned panel, tooltip, or the list/tiles
switch.

The current one root is the React element returned by `linkBodyElement()` (`index.ts:489-495`),
passed to `TextChromeView` as `children` (`index.ts:513-519`, repeated during update at
`index.ts:533-545`). The native chrome contribution views already present in `index.ts` do not
create a React root themselves.

### Verified source inventory

The five JSX-bearing files have the epic's measured **931 lines** and **40 JSX markers** when the
terminal line slot used by the epic is included:

| File | Source lines | Epic line count | JSX markers | React hook tokens |
|---|---:|---:|---:|---|
| `src/renderer/editors/link-editor/LinkBody.tsx` | 188 | 189 | 16 | 2 memo / 5 callback / 2 state / 2 effect / 2 ref |
| `src/renderer/editors/link-editor/PinnedLinksPanel.tsx` | 283 | 284 | 11 | 0 / 9 / 3 / 0 / 2 |
| `src/renderer/editors/link-editor/LinkTooltip.tsx` | 145 | 146 | 11 | 2 / 3 / 2 / 0 / 0 |
| `src/renderer/editors/link-editor/LinkItemList.tsx` | 162 | 163 | 1 | 0 / 9 / 0 / 3 / 2 |
| `src/renderer/editors/link-editor/LinkItemTiles.tsx` | 148 | 149 | 1 | 0 / 8 / 0 / 3 / 2 |
| **Total** | **926** | **931** | **40** | **4 / 34 / 7 / 8 / 8** |

The hook column is a token count, not a call-site count. The directory-wide figures requested by
the epic are **4 `useMemo`, 36 `useCallback`, 9 `useState`, 10 `useEffect`, and 8 `useRef`**.
The extra React residue found outside those five files is:

- `pipe-image-src.ts:24,120,124` contains one executable `useState` and one executable `useEffect`.
  `usePipeImageSrc` has no caller in the renderer; native `LinksTilesView` uses the synchronous and
  asynchronous helpers at `LinksTilesView.ts:16,248-251,447-455`. Remove the dead hook export and
  React import, retaining the native cache helpers.
- `LinksList.tsx:1,53-54` and `LinksTiles.tsx:1,47-48` are `mountVanilla` compatibility shims whose
  only React dependency is a return type/import. They are type/props modules for native callers,
  not React implementations; rename or rewrite them as `.ts` modules with no React import.
- `LinksListView.ts:1,348-354` and `panels/LinkCategoryPanel.ts:1,73-79` still create a React
  `LinkTooltipContent` value. They must hand over a native tooltip node instead.

The five listed `.tsx` files and `index.ts` were read completely. The existing native
`LinksListView.ts`, `LinksTilesView.ts`, the link model/types, and all three secondary-view files
were also inspected to resolve their native ownership and import edges.

### React component → native destination

| React source | Native destination | Lifecycle/state destination |
|---|---|---|
| `LinkBody.tsx:10-188` `LinkBody` | `LinkBodyView` | Own the center root, state projection, queue focus listener, drop-zone listeners, empty/error branches, list/tiles child, splitter, and pinned panel. |
| `LinkItemList.tsx:24-162` `LinkItemList` | Direct `LinksListView` child | Move callback methods and grid synchronization to `LinkBodyView`; `LinksListView` already owns its `VirtualGridView` at `LinksListView.ts:88-171`. |
| `LinkItemTiles.tsx:24-148` `LinkItemTiles` | Direct `LinksTilesView` child | Move callback methods and grid synchronization to `LinkBodyView`; `LinksTilesView` already owns its grid and mode rebuild at `LinksTilesView.ts:71-184`. |
| `PinnedLinksPanel.tsx:31-152` `PinnedItem` | `PinnedLinkItemView` | Store drag counters/state as view fields; own row, drop indicators, listeners, and tooltip node. |
| `PinnedLinksPanel.tsx:166-283` `PinnedLinksPanel` | `PinnedLinksPanelView` | Own panel/header/list roots, keyed pinned rows, favicon subscriptions, and row disposal. |
| `LinkTooltip.tsx:24-145` `LinkTooltipContent` | `LinkTooltipView` or a self-contained native tooltip-content builder | Build a DOM `Node` accepted by `attachTooltip`; preserve tag input, copy action, image, and optional branches without a React slot. `fillSlot`'s Node arm does not dispose a view (`fill-slot.ts:125-153`), so any view instance must be explicitly owned by its caller; a self-contained DOM builder is appropriate for the tree tooltip callback. |
| `index.ts:48-81` `LinkBreadcrumbBits` | Existing `LinkBreadcrumbView` (`index.ts:184-257`) | Make the native class public for non-editor embedding; state projection and breadcrumb replacement remain native. |
| `index.ts:83-141` `LinkActionBits` | Existing `LinkActionView` (`index.ts:271-434`) | Remove React event type and old factory; retain native buttons/input, replaceable clear button, menu disposal, and state projection. |
| `index.ts:143-155` `LinkFooterBits` | Existing `LinkFooterView` (`index.ts:448-487`) | Remove React factory; retain the native text projection. |
| `index.ts:489-495` `linkBodyElement` | Direct `LinkBodyView.root` Node | Remove `EditorErrorBoundary`/React element construction for this body; claim and mount the native child before passing its root to `TextChromeView`. |

`LinkCategoryPanelView` is already native (`panels/LinkCategoryPanel.ts:25-118`) and needs only its
tooltip producer changed. `LinksListView` and `LinksTilesView` are already native implementations,
not new React components; the task removes their React type/tooltip residue rather than creating
second grid implementations.

### Hook audit: textual totals and executable sites

The executable count uses both ordinary and generic call forms (`useMemo(` / `useMemo<T>(`, and
`useCallback(` / `useCallback<T>(`). No generic call form occurs in this directory, but it was
included in the search. There are **2 executable `useMemo` sites and 30 executable `useCallback`
sites: 32 total. **Zero are dead today.** Every row below names its live consumer and native
destination; the consumer line is the old source line that proves the behavior is reachable.

| # | Hook site | Computes / handles | Live consumer(s) | Native destination |
|---:|---|---|---|---|
| 1 | `LinkBody.tsx:42-45` `useMemo` | Set of pinned IDs from persisted pinned IDs | `LinkItemList` `pinnedLinkIds` at `:155`; `LinkItemTiles` `pinnedLinkIds` at `:164` | `LinkBodyView` recomputes the `Set` during its state projection and passes it to the active grid/pinned-row sync. |
| 2 | `LinkTooltip.tsx:45` `useMemo` | Sorted copy of `allTags` | `sortedTags.map` at `:119-128` | `LinkTooltipView` recomputes tags when tooltip props change, then reconciles native tag controls. |
| 3 | `index.ts:88-100` `useCallback` | Opens the view-mode popup at the button's bottom edge | React `Button` `onClick` at `:120`; `LinkActionBits` itself is called by `browser/BrowserView.tsx:243` and `browser/BookmarksDrawer.tsx:109` | `LinkActionView.openViewModeMenu` at `index.ts:411-421`, with a native `MouseEvent`. |
| 4 | `LinkBody.tsx:51-58` `useCallback` | Center drag-enter counter, payload acceptance, and active border | Center `Panel.onDragEnter` at `:119` | `LinkBodyView` root listener for `dragenter`; view field replaces `centerDragCount`. |
| 5 | `LinkBody.tsx:60-65` `useCallback` | Center drag-over acceptance and `dropEffect` | Center `Panel.onDragOver` at `:120` | `LinkBodyView` `dragover` listener. |
| 6 | `LinkBody.tsx:67-73` `useCallback` | Center drag-leave counter and border reset | Center `Panel.onDragLeave` at `:121` | `LinkBodyView` `dragleave` listener. |
| 7 | `LinkBody.tsx:75-88` `useCallback` | Extracts link trait items and imports them | Center `Panel.onDrop` at `:122` | `LinkBodyView` `drop` listener calling `model.importLinks`. |
| 8 | `LinkItemList.tsx:32-39` `useCallback` | Toggles a tag on a link | `LinksList.onToggleTag` at `:158` | `LinkBodyView`/`LinksListView` native tooltip tag handler. |
| 9 | `LinkItemList.tsx:50-52` `useCallback` | Receives the grid model capability | `LinksList.onGridModel` at `:159` | Direct `LinksListView` callback; `LinkEditor.setGridModel`/view field. |
| 10 | `LinkItemList.tsx:54-56` `useCallback` | Selects a link | `LinksList.onSelect` at `:149` | `LinkBodyView` native list callback → `LinkEditor.selectLink`. |
| 11 | `LinkItemList.tsx:58-64` `useCallback` | Opens a link and conditionally requests its favicon | `LinksList.onDoubleClick` at `:150` | `LinkBodyView` native list callback; preserve Tor guard. |
| 12 | `LinkItemList.tsx:66-68` `useCallback` | Opens the edit dialog | `LinksList.onEdit` at `:151` | `LinkBodyView` native list callback → `showLinkDialog`. |
| 13 | `LinkItemList.tsx:70-72` `useCallback` | Deletes a link, including Ctrl skip-confirm | `LinksList.onDelete` at `:152` | `LinkBodyView` native list callback. |
| 14 | `LinkItemList.tsx:74-138` `useCallback` | Builds link-specific and type-aware context-menu items | `LinksList.onContextMenu` at `:153` | `LinkBodyView` native list callback with `MouseEvent`; preserve `ContextMenuEvent` and channel dispatch. |
| 15 | `LinkItemList.tsx:140-142` `useCallback` | Returns the pin-filled additional icon | `LinksList.getAdditionalIcon` at `:154` | `LinkBodyView` native list projection; `LinksListView` repaints the icon host. |
| 16 | `LinkItemTiles.tsx:36-38` `useCallback` | Receives the tile grid capability | `LinksTiles.onGridModel` at `:145` | Direct `LinksTilesView` callback; `LinkEditor.setGridModel`/view field. |
| 17 | `LinkItemTiles.tsx:40-42` `useCallback` | Selects a tile link | `LinksTiles.onSelect` at `:137` | `LinkBodyView` native tiles callback. |
| 18 | `LinkItemTiles.tsx:44-52` `useCallback` | Opens a tile link and conditionally requests its favicon | `LinksTiles.onDoubleClick` at `:138` | `LinkBodyView` native tiles callback; preserve Tor guard. |
| 19 | `LinkItemTiles.tsx:54-56` `useCallback` | Opens the edit dialog | `LinksTiles.onEdit` at `:139` | `LinkBodyView` native tiles callback. |
| 20 | `LinkItemTiles.tsx:58-60` `useCallback` | Deletes a tile link | `LinksTiles.onDelete` at `:140` | `LinkBodyView` native tiles callback. |
| 21 | `LinkItemTiles.tsx:62-126` `useCallback` | Builds tile context-menu items | `LinksTiles.onContextMenu` at `:141` | `LinkBodyView` native tiles callback with native `MouseEvent`. |
| 22 | `LinkItemTiles.tsx:128-130` `useCallback` | Returns the pin-filled additional icon | `LinksTiles.getAdditionalIcon` at `:142` | `LinkBodyView` native tiles projection; `LinksTilesView` owns the icon host. |
| 23 | `PinnedLinksPanel.tsx:36-41` `useCallback` | Starts pinned-link drag and writes pinned-link trait data | `ListItem.onDragStart` at `:112` | `PinnedLinkItemView` `dragstart` listener and view field. |
| 24 | `PinnedLinksPanel.tsx:43-46` `useCallback` | Ends pinned-link drag and resets module drag index | `ListItem.onDragEnd` at `:113` | `PinnedLinkItemView` `dragend` listener. |
| 25 | `PinnedLinksPanel.tsx:48-55` `useCallback` | Tracks valid pinned-row drag entry | `ListItem.onDragEnter` at `:114` | `PinnedLinkItemView` `dragenter` listener and `isOver` field. |
| 26 | `PinnedLinksPanel.tsx:57-62` `useCallback` | Accepts valid pinned-row drag-over | `ListItem.onDragOver` at `:115` | `PinnedLinkItemView` `dragover` listener. |
| 27 | `PinnedLinksPanel.tsx:64-70` `useCallback` | Tracks nested drag leave and clears drop indicator | `ListItem.onDragLeave` at `:116` | `PinnedLinkItemView` `dragleave` listener and indicator sync. |
| 28 | `PinnedLinksPanel.tsx:72-83` `useCallback` | Reorders pinned links on drop | `ListItem.onDrop` at `:117` | `PinnedLinkItemView` `drop` listener → `model.reorderPinnedLink`. |
| 29 | `PinnedLinksPanel.tsx:169-175` `useCallback` | Opens a pinned link and conditionally requests its favicon | Each `PinnedItem.onOpenLink` at `:276` | `PinnedLinksPanelView.openLink`; preserve Tor guard. |
| 30 | `PinnedLinksPanel.tsx:177-235` `useCallback` | Builds pinned-link context-menu items | Each `PinnedItem.onContextMenu` at `:277` | `PinnedLinksPanelView` native `contextmenu` listener and `ContextMenuEvent`. |
| 31 | `LinkTooltip.tsx:29-35` `useCallback` | Validates, de-duplicates, and commits a new tag | `handleKeyDown` calls it at `:40`; it invokes `onToggleTag` at `:31-33` and clears the value at `:34` | `LinkTooltipView` input `keydown` handler and view field. |
| 32 | `LinkTooltip.tsx:37-42` `useCallback` | Commits a tag when Enter is pressed | `Input.onKeyDown` at `:138` | `LinkTooltipView` native `keydown` listener. |

The complete non-memo/callback hook count is also explicit:

| Hook | Textual tokens | Executable call sites | Sites / destination |
|---|---:|---:|---|
| `useState` | 9 | 5 | `LinkBody.tsx:48` center drag visual state; `PinnedLinksPanel.tsx:32-33` item drag/over state; `LinkTooltip.tsx:25` new-tag value; `pipe-image-src.ts:120` dead hook. Native fields and DOM attributes replace the first four; remove the last hook. |
| `useEffect` | 10 | 6 | `LinkBody.tsx:36` grid repaint; `LinkItemList.tsx:41,46` grid-model attach/repaint; `LinkItemTiles.tsx:27,32` grid-model attach/repaint; `pipe-image-src.ts:124` dead hook. Native view mount/update paths replace the five live editor sites. |
| `useRef` | 8 | 4 | `LinkBody.tsx:49` center drag counter; `LinkItemList.tsx:25` and `LinkItemTiles.tsx:25` grid capability; `PinnedLinksPanel.tsx:34` item drag counter. Native view fields replace all four. |
| `useSyncExternalStore` | 2 | 1 | `LinkItemList.tsx:27-30` reads `model.state.tags`; native `LinksListView` receives the current tag array through props and updates it with its parent state projection. |

### The 14-item `createElement` audit in `index.ts`

Source verification found **14 textual `createElement` occurrences** in `index.ts`: the import at
line 1 plus 13 call expressions. Of those expressions, **11 are React `createElement` calls** and
two are ordinary DOM `document.createElement` calls. Thus the requested “14 React calls” is not the
current file's executable count; it is a stale/contaminated token figure. The table enumerates all
14 occurrences so the discrepancy cannot hide a caller:

| # | Source | What it builds | Slot/consumer | Native replacement |
|---:|---|---|---|---|
| 1 | `index.ts:1` | `createElement` import (not a call) | Enables the old React chrome/body factories | Remove with all React imports. |
| 2 | `index.ts:58-65` | React `Breadcrumb` for Tags | `LinkBreadcrumbBits` toolbar contribution | Existing `LinkBreadcrumbView.breadcrumbProps()` tags arm, `index.ts:232-240`. |
| 3 | `index.ts:68-73` | React `Breadcrumb` for Hostnames | `LinkBreadcrumbBits` toolbar contribution | Existing `LinkBreadcrumbView.breadcrumbProps()` hostnames arm, `index.ts:242-248`. |
| 4 | `index.ts:75-80` | React `Breadcrumb` for Collections | `link-editor-breadcrumb-categories` toolbar contribution | Existing `LinkBreadcrumbView.breadcrumbProps()` categories arm, `index.ts:250-255`. This is the corrected §E13-12 `Breadcrumb` caller. |
| 5 | `index.ts:102-103` | React `Fragment` | Right-toolbar contribution containing Add, View Mode, and Search | Existing `LinkActionView` contents root, `index.ts:281-297`. |
| 6 | `index.ts:105-113` | React `Button` Add Link | Right-toolbar contribution; `link-editor-add` | `ButtonView` `addButton` in `LinkActionView`, `index.ts:288,356-365`. `Button` remains live outside this cut. |
| 7 | `index.ts:114-122` | React `Button` View Mode | Right-toolbar contribution; `link-editor-view-mode` | `ButtonView` `viewModeButton`, `index.ts:289,368-377`. `Button` remains live outside this cut. |
| 8 | `index.ts:123-139` | React `Input` Search, optionally with clear end slot | Right-toolbar contribution; `link-editor-search` | `InputView` `searchInput` and native `IconButtonView` clear child, `index.ts:291,346-389`. `Input` remains live outside this cut. |
| 9 | `index.ts:131-137` | React `IconButton` Clear Search | Nested `Input.endSlot` when search text is non-empty | Existing `LinkActionView.clearButton`/`syncClearButton`, `index.ts:276,346-353,392-399`. `IconButton` remains live outside this cut. |
| 10 | `index.ts:148-154` | React text `span` with the link count | Footer contribution | Existing `LinkFooterView.sync`, `index.ts:482-486`. |
| 11 | `index.ts:158-160` | DOM `span` with `display: contents` | `LinkBreadcrumbView` root | Keep as the native contents root helper; it is not React. |
| 12 | `index.ts:453` | DOM `span` | `LinkFooterView` root | Keep as the native footer root; it is not React. |
| 13 | `index.ts:490-492` | React `EditorErrorBoundary` | `TextChromeView.children` body slot at `index.ts:518,544` | Remove for this body; `LinkBodyView` owns the native error branch. `EditorErrorBoundary` remains for other React bodies. |
| 14 | `index.ts:493` | React `LinkBody` | `TextChromeView.children` body slot at `index.ts:518,544` | Direct claimed/mounted `LinkBodyView.root` Node. |

`index.ts` must end with zero React imports, JSX, and React `createElement` calls. The native
`document.createElement` calls are expected and remain ordinary DOM construction.

### `LinkTooltip` and the expired EPIC-064 claim

`LinkTooltip.tsx` does **not** define or wrap the UIKit `Tooltip` face. It defines only the live
`LinkTooltipContent` React body (`LinkTooltip.tsx:24-145`). The only apparent `<Tooltip>` mention is
prose in its comment at `LinkTooltip.tsx:21`; EPIC-071 §E13-5 and §E13-12 correctly classify that
as a non-caller. The UIKit `Tooltip` React face has no live renderer caller in the current source
outside its own implementation/story surface, while the native path is `attachTooltip`.

`LinkTooltipContent` itself is live in three places:

- `LinksListView.ts:29,348-354` creates it for the native list row's `attachTooltip` at `:257` and
  updates that attachment at `:342-345`.
- `panels/LinkCategoryPanel.ts:10,73-79` creates it for the tree provider's `getTooltip` callback.
- `PinnedLinksPanel.tsx:9,109` passes it through `ListItem.tooltip`.

All three callers can use a native node: `attachTooltip` accepts `SlotContent` (`attach-tooltip.ts:10,
15-16`), and `ListItemView` already attaches tooltips natively (`ListItemView.ts:94-101`). The
category tree's `getTooltip` is also `SlotText` (`TreeProviderViewModel.ts:82-86`) and reaches the
native `TreeItemView` tooltip path (`TreeProviderViewImpl.ts:310`, `TreeView.ts:458`). Replace the
React content with `LinkTooltipView`/native content and ensure the caller owns any mounted child;
do not pass a mounted-but-unowned view root through the Node arm of `fillSlot`.

Therefore EPIC-064's recorded claim that `SlotText` does not narrow because “the link-editor tooltip
genuinely needs React” no longer holds on **2026-08-27**. The content needs interactive DOM and
state, not React. This is a forward-looking note with a measurement date: re-checking the current
callers and `attachTooltip` is what invalidated the earlier blocker.

### `ListItem`, secondary views, and highlight

`PinnedLinksPanel.tsx:101` is the only live value caller of the UIKit `ListItem` face in this
editor, exactly as §E13-12 records. The other list rows are already direct `ListItemView` instances
in `LinksListView.ts:225-239`. Converting the pinned row frees the `ListItem` face for US-1149,
subject to its other caller audit.

The three registered secondary views are already vanilla and remain out of scope:

| Secondary view | Evidence | Import edge into converted files |
|---|---|---|
| `LinkCategorySecondaryView` | `panels/LinkCategorySecondaryView.ts:13-65` extends `VanillaView` | Imports `LinkCategoryPanelView` at `:11`; that panel remains the native class and only loses its React tooltip factory. |
| `LinkTagsSecondaryView` | `panels/LinkTagsSecondaryView.ts:238-280` extends `VanillaView` | Its navigation panel imports `LinksListView` and `LinksListProps` at `LinkTagsSecondaryView.ts:12-13` and instantiates `LinksListView` at `:124`; retain that native API. |
| `LinkHostnamesSecondaryView` | `panels/LinkHostnamesSecondaryView.ts:12-48` extends `VanillaView` | `LinkHostnamesNavigationPanel.ts:11-12` imports `LinksListView`/`LinksListProps`; retain that native API. |

They do not import `LinkBody`, `LinkItemList`, `LinkItemTiles`, or the React tooltip directly.
Do not widen the task into their implementation; only preserve the native imports they already
use.

`src/renderer/uikit/shared/highlight.ts` is not a link-editor consumer. The React `highlight()` form
has one remaining consumer, `src/renderer/editors/graph/GraphBody.tsx:3,195-203`; the old removal
ledger's `LinkCategoryPanel` entry is stale/gone. No `highlight` or `highlightInto` import occurs
under `editors/link-editor/`, so US-1148 does not free the React highlight form.

### Persistent-child and subscription hazards

React destroyed the following branches when they became false. Native code must use explicit child
release/disposal (`SubtreeSwap` or an equivalent owned replacement), not merely hide a live child:

| Conditional branch | Source evidence | Native rule |
|---|---|---|
| Body error vs. normal body | `LinkBody.tsx:90-96` | Dispose the current list/tiles, pinned panel, splitter, and their listeners before showing the error root; reverse the transition when the error clears. |
| No links vs. filtered-empty vs. populated | `LinkBody.tsx:124-150` | Release the old body branch when entering either empty state; release the empty view when links/filter results return. |
| List vs. tiles | `LinkBody.tsx:150-166` | Destroy the outgoing `LinksListView`/`LinksTilesView`, including its grid, pooled rows, favicon/image subscriptions, and child buttons, before inserting the other mode. |
| Pinned panel present vs. absent | `LinkBody.tsx:168-185` | Release both `SplitterView` and `PinnedLinksPanelView` when `pinnedLinks.length` reaches zero; keyed pinned rows are released when their IDs disappear. |
| Center drag border active/inactive | `LinkBody.tsx:117-122` and `:48-73` | This is a pure root-attribute projection; clear `data`/border state, but no child view may survive solely as a hidden drag branch. |
| Pinned drop indicator above/below/none | `PinnedLinksPanel.tsx:85-149` | Indicators are pure DOM and may be reused/hidden after clearing styles; their parent row listener/state must be disposed with the row. |
| Search clear button present/absent | `index.ts:130-137`, native `syncClearButton` at `:346-353` | Keep the existing native behavior: claim/mount on non-empty search and `releaseChild()` on empty search. |
| Breadcrumb category/tag/hostname arm | `index.ts:57-80`, native `breadcrumbProps()` at `:231-255` | Update one native `BreadcrumbView`; do not retain separate inactive arms. |
| Tooltip href/image/tag/copy affordances | `LinkTooltip.tsx:62-142` | Clear/remove optional DOM and release any native tag/input children when the branch disappears. Tooltip content must not leave a stale interactive input in an open overlay. |
| Category-tree directory vs. link tooltip | `panels/LinkCategoryPanel.ts:73-82` | A directory uses its href text and a link gets rich tooltip content; replace the row's tooltip node on reconciliation and do not retain a detached interactive tooltip child. |
| List/tiles edit/delete action buttons | `LinksListView.ts:340-395`, `LinksTilesView.ts:419-520` | Existing native views release list buttons and remove tile buttons; preserve this on pooled-cell reassignment and disposal. |

Search text and category/tag/hostname selection are not independently mounted body children. They
change the model's filtered projection (`LinkEditor.ts:377-423,521-599`); update the active grid,
and destroy it only if the resulting branch becomes empty or the view mode changes. The sidebar
selection itself remains model-owned (`LinkEditor.ts:274-289`) so it continues while the body is
demoted.

`bind()` registers cleanup through `own()` and has no early-release API. Apply these source-identity
decisions:

| Subscription | Identity decision |
|---|---|
| Top-level `LinkEditor.state` and `LinkEditor.queue` | Fixed during a normal page view (`LinkEditor` constructs its queue at `LinkEditor.ts:144-151`), but `LinkEditorView.onUpdate` accepts a new `EditorModel` (`index.ts:533-545`). Use a replaceable subscription if the model changes; never call `bind()` repeatedly on a changing model. Queue listener cleanup belongs to view disposal. |
| `LinkItemList` tag state | Current `model.state` is fixed for the child instance, but the React component's empty-dependency effect assumed that identity (`LinkItemList.tsx:41-44`). The direct native child should receive the parent's current `tags` projection; if the child accepts model replacement, replace its subscription rather than rebinding. |
| Favicon readiness for list/tile/pinned links | The links array/hostname set changes when filtering or pinning changes. Existing grid views explicitly replace subscriptions (`LinksListView.ts:160-204`, `LinksTilesView.ts:176-234`). `PinnedLinksPanelView` must use the same replaceable pattern; do not bind a new link set through `bind()`. |
| `model.imageProxySource` | No subscription exists; `LinkEditor.imageProxy` reads the current callback at `LinkEditor.ts:125-139`. Read it on each row/tooltip projection so a Tor-session identity change is not cached. |
| `attachTooltip` registry subscriptions | Each attachment owns its overlay/registry cleanup; dispose the attachment with its row/cell. A tooltip content node is not a state source and must not be treated as a long-lived bound model. |

`ComponentQueue.subscribe()` drains events already queued at subscription time (the behavior
recorded by EPIC-071 §E13-11 for the Monaco conversion). The native body must therefore register
its focus subscription only after its container exists and its mount path is ready, and its handler
must tolerate disposal; otherwise a queued focus event can be silently consumed before
`model.containerElement` is assigned.

### Constraint audit

- No hex, `rgb()`, or `rgba()` literal occurs under `src/renderer/editors/link-editor/`. Existing
  color uses are semantic `color` imports (`PinnedLinksPanel.tsx:4`, `LinkTooltip.tsx:4`,
  `LinksTilesView.ts:5`) or UIKit token props. Preserve those tokens; do not introduce inline
  hardcoded colors in the native port.
- No `require("path")` or `require("fs")` occurs. The three `require("electron")` clipboard
  imports at `LinkItemList.tsx:10`, `LinkItemTiles.tsx:13`, and `PinnedLinksPanel.tsx:13` are not
  path/fs requires and may remain unless the implementation's import cleanup makes them unnecessary.
- `LinkEditor.ts:8,361-365` already uses `errMessage(e)` for the caught unknown value. No caught
  error in the conversion needs hand-rolled stringification. `String(item.size)` in
  `LinkCategoryPanel.ts:81` formats a numeric size and is not error stringification.

## Implementation Plan

1. **Prepare the native tooltip and supporting prop modules.** Convert `LinkTooltip.tsx` to a
   native `LinkTooltipView`/self-contained DOM producer, preserving the title, href, image proxy,
   copy JSON action, sorted tags, tag toggling, Enter handling, and all colors/layout. Update
   `LinksListView.ts:348-354`, `panels/LinkCategoryPanel.ts:73-79`, and the pinned-row path to
   supply native `Node` content through `attachTooltip`/`ListItemView`. Remove React from
   `LinksListView.ts` and `LinkCategoryPanel.ts`. Remove the unused `usePipeImageSrc` hook and
   React import from `pipe-image-src.ts`; convert `LinksList.tsx` and `LinksTiles.tsx` to
   React-free props/native modules without changing the `LinksListProps`/`LinksTilesProps` API used
   by the secondary views and `category/CategoryEditor.ts:26-29`.
2. **Convert `index.ts` chrome factories first.** Remove the React import, `LinkBreadcrumbBits`,
   `LinkActionBits`, `LinkFooterBits`, and React `linkBodyElement` factories after making the
   existing `LinkBreadcrumbView`, `LinkActionView`, and `LinkFooterView` public native entry
   points. Change `openViewModeMenu` to native `MouseEvent`; keep `ButtonView`, `InputView`,
   `IconButtonView`, menu disposal, state projections, and all chrome `data-name`s. Update the
   two external React embedding callers, `src/renderer/editors/browser/BrowserView.tsx:21-22,
   241-248` and `src/renderer/editors/browser/BookmarksDrawer.tsx:4-9,107-125`, to host the public
   native views with `mountVanilla` (or an equivalent existing native embedding seam). This is
   required to remove React imports from `editors/link-editor/`; it does not convert the browser
   editor or its own JSX.

   Before → after chrome/body boundary:

   ```ts
   // Current: src/renderer/editors/link-editor/index.ts:513-519
   const chrome = this.child(new TextChromeView({
       model: this.props.model,
       toolbarContributions: breadcrumb.root,
       rightToolbarContributions: actions.root,
       footerContributions: footer.root,
       children: linkBodyElement(model), // React createElement boundary
   }));
   ```

   ```ts
   // Target: same owner, native Node child
   const body = this.child(new LinkBodyView({ model }));
   body.mount();
   const chrome = this.child(new TextChromeView({
       model: this.props.model,
       toolbarContributions: breadcrumb.root,
       rightToolbarContributions: actions.root,
       footerContributions: footer.root,
       children: body.root,
   }));
   ```

   The exact mount/append order must obey the `VanillaView` contract: claim each child once, attach
   roots before a child can measure, mount each exactly once, and let the owner dispose children.
3. **Convert `LinkBody.tsx` into `LinkBodyView`.** Replace the selector with a native state
   projection over `LinkEditor.state`, replace `queue.use` with one owned queue subscription, and
   replace the grid effect, memo, refs, callbacks, and `Panel` JSX with explicit DOM and model
   methods. Preserve `link-editor-root`, `link-editor-center`, `link-editor-empty`, the error
   surface, center drag/drop import behavior, search/filter updates, pinned width, and the list /
   tiles mode switch. Insert direct `LinksListView` or `LinksTilesView` children, and use explicit
   release/disposal for the conditional branches above.

   Before → after body branch:

   ```tsx
   // Current: LinkBody.tsx:150-166
   {viewMode === "list" ? (
       <LinkItemList links={links} model={model} ... />
   ) : (
       <LinkItemTiles links={links} model={model} ... />
   )}
   ```

   ```ts
   // Target shape: LinkBodyView owns one active native child
   if (viewMode === "list") {
       this.activeBody = this.child(new LinksListView(this.listProps(projection)));
   } else {
       this.activeBody = this.child(new LinksTilesView(this.tilesProps(projection)));
   }
   this.activeBody.mount();
   this.centerPanel.append(this.activeBody.root);
   ```

4. **Convert pinned rows and panel.** Replace `PinnedItem`/`PinnedLinksPanel` with public native
   classes. Use keyed ownership for `pinnedLinks`, native drag event types, fields for
   `isDragging`, `isOver`, and nested drag count, and direct `ListItemView` with a native tooltip
   node. Reproduce the header/list markers and `color.misc.blue` drop indicator. Replace the
   React `useFavicons` call (`PinnedLinksPanel.tsx:167`) with replaceable
   `getFaviconPath`/`onFaviconReady` subscriptions or the existing native list-view pattern, so
   pinned icons repaint without a React hook.
5. **Clean the remaining React surface and re-check callers.** Ensure every file under
   `src/renderer/editors/link-editor/` has no React import, JSX, or React `createElement`; verify
   browser embedding imports now target native view classes and that no secondary view was widened.
   Keep `EditorErrorBoundary`, `uikit/Tooltip`, `IconButton`, `Input`, and `Button` because their
   external callers remain. Do not change `highlight.ts`, whose only remaining consumer is graph.
6. **Manual verification only.** Reproduce the empty baseline and then use a scratch populated
   link file with invented links at
   `C:\projects\persephone\.codex\scratch\US-1148-populated.link.json` (create it only during
   verification; it is not a user file and is not part of this investigation's writes). Include
   multiple categories/tags/hostnames, at least one image, and pinned IDs. Exercise list mode,
   each tiles mode, search empty/non-empty results, category selection, pin/reorder/unpin, row and
   tile tooltips, tag entry, copy JSON, drag/drop, edit/delete, and mode switching. Measure visible
   structure and roots; do not read or open any user `.link.json`/`.note.json` file.

No unit tests or test harnesses are proposed. Do not run `npm run build-prod`.

## Concerns

- The epic/user figure of 14 React `createElement` calls in `index.ts` is not reproducible from the
  current file: source contains 14 textual occurrences including the import, 13 call expressions,
  11 React calls, and 2 DOM calls. The individual audit above is the source-backed instrument to
  carry into implementation.
- The `LinkTooltipContent` body is live even though the UIKit `Tooltip` face is not. The native
  `Node` arm solves the rendering boundary, but `fillSlot` does not dispose arbitrary Node content;
  the implementation must not create a mounted child view that no caller owns.
- `LinkBodyView` must destroy inactive list/tiles and pinned branches. Retaining an inactive grid or
  pinned row would retain pooled listeners, favicon work, tooltip attachments, and drag state that
  React previously removed.
- A `useMemo` result or callback that is defined but never wired can silently produce an empty but
  valid `Map`/`Set`. The 32-row table is an acceptance artifact, not optional review prose; every
  ported row needs a named live consumer.
- The browser's blank-page and bookmarks-drawer React trees currently call the three React chrome
  exports and `LinkBody` (`BrowserView.tsx:241-248`; `BookmarksDrawer.tsx:107-125`). Those callers
  must embed the public native equivalents for the link-editor directory to reach zero React
  imports. The browser editor itself remains out of scope.
- The baseline is intentionally empty. It proves the empty branch and twelve markers but says
  nothing about list/tiles rows, pinned rows, tooltip content, or populated SVG/image behavior.

## Acceptance Criteria

- Every file under `src/renderer/editors/link-editor/` contains zero React imports, JSX, and
  React `createElement` calls. `index.ts` has zero React imports; its only remaining
  `createElement` calls, if any, are ordinary `document.createElement` DOM construction.
- `LinkEditorView` stays on `EditorModule.View`; an open link page's React roots go **1 → 0** and
  no intermediate implementation stage adds a `fillSlot` React root for chrome or body.
- The twelve baseline `data-name` markers remain present on the corresponding empty/populated
  surfaces: `text-chrome-root`, `text-chrome-top`, `link-editor-breadcrumb-categories`,
  `link-editor-add`, `link-editor-view-mode`, `link-editor-search`, `page-editor-switch`,
  `link-editor-root`, `link-editor-center`, `link-editor-empty`, `text-chrome-footer`, and
  `text-toggle-script`.
- `emptySvgs` remains **0**. The scratch populated-file verification covers list mode and tiles
  mode (including switching among the four tile dimensions), with visible row/tile content and
  no blank icon regressions.
- The populated-file pass exercises category selection, search filtering, pinned-panel creation /
  destruction, list↔tiles switching, row/tile selection/open/edit/delete/context menus, drag/drop,
  favicon/image paths, tooltip display, tag entry/toggling, and teardown. The empty baseline is not
  accepted as the only body verification.
- All **2 executable `useMemo` and 30 executable `useCallback` sites** from the verified audit are
  represented by live native consumers; **0 executable memo/callback sites are dead today**. The
  textual totals remain visible as 4/36/9/10/8, and generic hook call syntax is included in the
  measurement.
- The native tooltip replaces `LinkTooltipContent` at all three live callers, while the UIKit
  `Tooltip` React face remains available only where its external callers require it. The dated
  2026-08-27 re-measurement records that EPIC-064's “genuinely needs React” `SlotText` claim no
  longer holds.
- `Breadcrumb` and `ListItem` have no value callers left in this editor and are available for the
  face-collection task; `IconButton`, `Input`, and `Button` are not deleted because §E13-12's
  external callers remain.
- The three secondary views remain native and in scope only as import-edge consumers. No changes
  widen the task into their own implementations. `highlight.ts` remains because
  `graph/GraphBody.tsx` is its only remaining consumer.
- No hardcoded colors, `require("path")`, `require("fs")`, or hand-rolled caught-error
  stringification is introduced. Existing `errMessage` usage remains the error contract.
- Verification uses only invented scratch data and does not open, read, or reference
  any user `.link.json`/`.note.json` file or any protected user-data path.
- No unit tests, test harnesses, dashboard entry, protected-file edits, or `npm run build-prod` are
  added/run. Protected no-change areas include `eslint.config.mjs`,
  `src/renderer/uikit/shared/vanilla-view.ts`, `src/renderer/components/page-manager/PageSlot.ts`,
  `src/renderer/editors/monaco/`, `about/`, `tools-hub/`, `mneme-config/`, `mneme-root/`,
  `settings/`, `mcp-inspector/`, and `src/renderer/ui/sidebar/`.

## No changes

This investigation writes only this task document. It does not change the dashboard, baseline,
source, tests, or harnesses. The implementation must not modify `eslint.config.mjs`,
`src/renderer/uikit/shared/vanilla-view.ts`, `src/renderer/components/page-manager/PageSlot.ts`,
anything under `src/renderer/editors/monaco/`, `about/`, `tools-hub/`, `mneme-config/`,
`mneme-root/`, `settings/`, `mcp-inspector/`, or `src/renderer/ui/sidebar/`. It must not run
`npm run build-prod`.

## Files Changed

| File | Status / purpose |
|---|---|
| `doc/tasks/US-1148-link-editor/README.md` | **Written by this investigation; sole file changed.** Records the verified scope, hook consumer table, createElement audit, lifecycle hazards, plan, and acceptance criteria. |

### Planned implementation surface (not changed by this investigation)

| File | Planned role |
|---|---|
| `src/renderer/editors/link-editor/index.ts` | Remove React chrome factories and wire a direct native body Node; expose native chrome views. |
| `src/renderer/editors/link-editor/LinkBody.tsx` → `LinkBodyView.ts` | `LinkBodyView` owner and conditional branch lifecycle. |
| `src/renderer/editors/link-editor/PinnedLinksPanel.tsx` → `PinnedLinksPanelView.ts` | `PinnedLinksPanelView` and `PinnedLinkItemView`. |
| `src/renderer/editors/link-editor/LinkTooltip.tsx` → `LinkTooltipView.ts` | Native tooltip content/view. |
| `src/renderer/editors/link-editor/LinkItemList.tsx` | Delete after its callback behavior is moved into `LinkBodyView`; it has no callers outside `LinkBody.tsx`. |
| `src/renderer/editors/link-editor/LinkItemTiles.tsx` | Delete after its callback behavior is moved into `LinkBodyView`; it has no callers outside `LinkBody.tsx`. |
| `src/renderer/editors/link-editor/LinksListView.ts` | Replace React tooltip construction with native tooltip content; remove React import/type. |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Preserve existing native grid and image behavior; no React implementation added. |
| `src/renderer/editors/link-editor/LinksList.tsx` → native/type file | Remove type-only React/mount shim residue. |
| `src/renderer/editors/link-editor/LinksTiles.tsx` → native/type file | Remove type-only React/mount shim residue. |
| `src/renderer/editors/link-editor/pipe-image-src.ts` | Remove dead `usePipeImageSrc` hook/import; retain native cache functions. |
| `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts` | Replace React tooltip factory with native Node content. |
| `src/renderer/editors/browser/BrowserView.tsx` | Embed public native link chrome/body views in the existing browser React surface. |
| `src/renderer/editors/browser/BookmarksDrawer.tsx` | Embed public native link chrome/body/footer views in the existing bookmarks React surface. |

### Explicitly unchanged implementation dependencies

`src/renderer/editors/link-editor/LinkEditor.ts`, `linkTypes.ts`, `LinksListView`'s and
`LinksTilesView`'s native grid ownership, the three secondary-view implementations,
`src/renderer/uikit/shared/highlight.ts`, `EditorErrorBoundary`, and the external UIKit faces
`Tooltip`, `IconButton`, `Input`, and `Button` are not converted or deleted by this investigation;
they are retained unless the implementation finds a source-backed API adjustment strictly needed
for the native link-editor boundary.

The following exact files need no implementation changes for this task:

| File | Reason |
|---|---|
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Already a native `VanillaView` with its own grid, image, and lifecycle ownership; it has no React tooltip construction. |
| `src/renderer/editors/link-editor/LinkEditor.ts` | Model state, filtering, view-mode persistence, queue, and CRUD APIs already serve native callers. |
| `src/renderer/editors/link-editor/linkTypes.ts` | Framework-free data and prop types; retained as the shared API module. |
| `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.ts` | Already vanilla; only its existing native `LinkCategoryPanelView` import remains. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts` | Already vanilla; its existing `LinksListView` import remains. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesSecondaryView.ts` | Already vanilla; its existing native navigation import remains. |
| `src/renderer/editors/link-editor/panels/LinkTagsPanel.ts` | Already vanilla and independent of the React files being removed. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts` | Already vanilla and consumes the existing native list view. |
| `src/renderer/uikit/shared/highlight.ts` | `link-editor` is not a consumer; only `graph/GraphBody.tsx` still uses the React form. |
