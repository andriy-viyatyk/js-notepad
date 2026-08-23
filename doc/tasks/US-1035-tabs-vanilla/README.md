# US-1035: `ui/tabs/` vanilla views

**Status:** Planned

**Epic:** [EPIC-058: De-React Epic D — shell and shared components](../../epics/EPIC-058.md)

**Scope:** Investigation and implementation plan only. The dashboard and epic task table are
intentionally not changed by this task-document pass.

## Goal

Convert `src/renderer/ui/tabs/` from two Emotion-backed React renderers to native
`VanillaView` implementations while keeping the public React-facing `PageTabs` and `PageTab`
signatures usable by the still-React `src/renderer/ui/app/MainPage.tsx` (US-1036). Preserve the
tab strip's ordering, pinned layout, active state, language menu, tooltips, context menu, page
actions, cross-window drag, and same-window tab reorder behavior.

Remove the unit's two Emotion importers without changing `src/renderer/uikit/` or the existing
tools-editor and pinned-item data contracts.

## Background

### Epic boundary and verified unit

EPIC-058 D6 requires zero Emotion importers in this unit. D9 keeps `src/renderer/ui/app/` React
until US-1036, so `MainPage.tsx:22,210` must continue to render `PageTabs` through its existing
React-facing export. D10 does not require removing every `<Panel>` in Epic D; this unit has no
`<Panel>` call site at all. Concern 1 names `PageTab.tsx` as the highest masked-defect risk because
its pointer, drag, focus, and keyboard-adjacent paths can appear repaired by the next click.

The unit is exactly three files and 829 lines at investigation time:

| File | Lines | Current role |
|---|---:|---|
| `src/renderer/ui/tabs/PageTab.tsx` | 611 | Emotion root, `PageTabModel`, page/editor state projection, all tab interactions and tab contents |
| `src/renderer/ui/tabs/PageTabs.tsx` | 216 | Emotion strip root, overflow model, ordered tab projection, scroll controls, and new-page menu |
| `src/renderer/ui/tabs/index.ts` | 2 | Barrel exports for `PageTabs`, `PageTab`, and `minTabWidth` |

The scope is small enough for one task. No split is proposed: `PageTabsView` owns the immediate
`PageTabView` children, and both interaction surfaces can be smoke-tested together from the one
`MainPage` caller.

### External boundary and existing native infrastructure

The only source caller is `src/renderer/ui/app/MainPage.tsx:22,210`, which calls `<PageTabs />` with
no props. The implementation should retain that signature as a thin module-scope
`mountVanilla(PageTabsView, props)` face. The exported `PageTab` remains a thin
`mountVanilla(PageTabView, props)` face for the barrel contract, even though no current source
caller imports it directly.

The existing infrastructure is sufficient and has immediate consumers in this task:

- `src/renderer/uikit/shared/mount.tsx:15-18,26-38,93-107` provides the React-to-native boundary;
  the constructor must remain module scope and the host appends/removes the view root.
- `src/renderer/uikit/shared/vanilla-view.ts:29-39,49-80,128-194` provides stable roots,
  explicit lifecycle, `child`, `own`, `listen`, and state binding.
- `src/renderer/uikit/shared/keyed-list.ts` can reconcile the ordered `PageModel` records while
  retaining each `PageTabView` and its icon/menu/tooltip resources.
- `src/renderer/uikit/IconButton/IconButtonView.tsx:16-132` and
  `src/renderer/uikit/SplitButton/SplitButtonView.ts:15-182` are already native view classes.
  They retain their own `data-type` attributes and accept React-valued icon slots through
  `fillSlot`.
- `src/renderer/uikit/Tooltip/attach-tooltip.ts:79-254` and
  `src/renderer/uikit/Menu/attach-menu.ts:17-72` are framework-neutral attachment APIs. Use
  these directly from native views; do not recreate tooltip/menu positioning or timers.

No new registry, empty view collection, or unused abstraction is needed. Every proposed native
view has an immediate owner: `PageTabsView` constructs `PageTabView` records, and the two `.tsx`
faces are consumed by the current React boundary.

### `PageTab.tsx` — exhaustive current interaction and state inventory

#### Imports, constants, and root shape

`PageTab.tsx:1-28` imports `@emotion/styled`, theme colors, `pagesModel`, `appWindow`, settings,
`PageModel`, the tab/volume/group icons, `LanguageIcon`, `EditorIcon`, `TComponentModel`, the
UIKit `IconButton`, `Tooltip`, and `WithMenu`, `ContextMenuEvent`, Monaco language data, React
hooks, the existing trait DnD helpers, IPC drag API, `PageDragData`, object parsing, and
`useOptionalState`.

`PageTab.tsx:30-34` defines `minTabWidth = 80`, `ICON_SLOT = 20`, `TAB_PADDING = 4`,
`pinnedTabWidth = 44`, and `pinnedTabEncryptedWidth = 64` through the two exported calculations.
`PageTabs.tsx` imports the three exported width values, so their public values must not drift.

`PageTabRoot` is the sole Emotion declaration, at `PageTab.tsx:36-187`. The rendered root at
`:510-530` is a `div` with:

- `data-type="page-tab"` and `data-name="page-tab"` (the latter is a public UI-element address);
- presence attributes `data-active`, `data-modified`, `data-drag-over`, `data-temp`,
  `data-deleted`, `data-pinned`, `data-grouped`, and `data-has-encryption`;
- an inline `left` value only for pinned tabs when `props.pinnedLeft` is defined;
- `draggable`, click/context-menu handlers, and all six HTML5 DnD handlers.

The root styling is flex layout, 200px default width, 80px minimum width, shrinkable overflow,
no app-region drag, and user-select suppression (`:38-51`). Its descendant selectors control
title truncation and colors (`:53-70`), hidden/visible close and sound controls (`:72-103`),
modified/deleted/encrypted states (`:107-124`), empty-language geometry (`:125-137`), inactive
button cursor (`:138-140`), pinned sticky sizing and grouped-close behavior (`:142-175`), and
the pinned tooltip overlay/z-index arrangement (`:177-184`).

#### `PageTabModel` actions

`PageTabModel` is declared at `PageTab.tsx:194-424`; it has no `useEffect`, timer, or registered
component-model effect. It stores two mutable render flags, `isActive` and `isGrouped`, at
`:195-196`. The native view must replace those render-only fields with values derived from the
current page and `pagesModel.state`, not with module-level mutable state.

The methods and exact behavior are:

| Evidence | Current behavior to preserve |
|---|---|
| `:198-205` | `setActiveLanuage` (existing spelling) moves a language to the front of `tab-recent-languages`, removes duplicates, and writes with `settings.set`. |
| `:207-245` | `getLanguageMenuItems` reads the current editor language and recent-language setting, creates one item per `monacoLanguages` entry with a `LanguageIcon`, sorts labels alphabetically, places `plaintext` first, then recent languages in setting order, then remaining languages, and marks the current language selected. Each item calls `editor.changeLanguage` and updates recents. |
| `:247-324` | `handleContextMenu` obtains `page`, `mainEditorInstance`, and `ContextMenuEvent.fromNativeEvent(e, "page-tab")`; builds conditional pin/unpin, close, close-other, close-right, new-window, duplicate, and editor-contributed items with the current separators/icons/callbacks; appends them to `ctxEvent.items`. |
| `:326-334` | `getDragData(drop)` returns window direction fields and `page.getDescriptor()`. A source drag targets the current window only on the drop-side path; the descriptor is the cross-window IPC payload. |
| `:336-347` | `handleDragStart` writes the existing trait payload `{ key: page.id }` with `TraitTypeId.PageTab` for every tab, then writes JSON `application/persephone-tab` data only for non-pinned tabs. |
| `:349-361` | `handleDragEnd` ignores pinned tabs; detects pointer coordinates outside the current window and sends a descriptor plus `screenX/screenY` through `api.addDragEvent`. |
| `:363-388` | `handleDrop` first gives cross-window `application/persephone-tab` data priority, accepts only a source window different from `appWindow.windowIndex`, sends the target descriptor, prevents default, and stops propagation. Otherwise it reads trait data, accepts only `TraitTypeId.PageTab`, compares the source key to the target page ID, calls `pagesModel.moveTab(sourceId, targetId)`, and prevents/stops the event. |
| `:390-400` | `closeClick` ungroups and shows the page when grouped; otherwise calls `page.close()`. |
| `:402-412` | `handleClick` Ctrl-groups the clicked page with the active page when they differ, then always calls `pagesModel.showPage(pageId)`. |
| `:414-423` | `encryptionClick` resolves `pagesModel.getTextFileHost(page.id)` and opens the existing encrypt or decrypt flow based on `encrypted`/`decrypted`. |

There is no direct keyboard handler, `onMouseDown`, `onAuxClick`, button-1/middle-click path, or
close-on-middle-click behavior in this file. Keyboard behavior belongs to the existing UIKit
button/menu primitives and the global context-menu route. The conversion must not invent a
middle-click action or silently remove the native primitive keyboard behavior.

#### React state hooks and rendered states

`PageTab.tsx:426-452` creates a stable `PageTabModel` through `useComponentModel`, reads
`page.mainEditor`, calculates active/grouped status, and subscribes to `page.state` for `pinned`
and `mainEditorId`. It then subscribes to the optional main editor state for `title`, `modified`,
`language`, `filePath`, `deleted`, `temp`, `_anyTabAudible`, and `_pageMuted`; the other selected
fields (`password`, `encrypted`, `_iconHint`, `_iconKey`) are part of the selector/default and
ensure icon/encryption-related editor updates are observed. The native replacement must rewire
the editor-state subscription when `mainEditorId` changes and dispose it when the tab record is
removed.

The only local React state/ref/memo hooks are:

- `useState(false)` at `:454` for `isOver`, rendered as `data-drag-over`;
- `useRef(0)` at `:455` for the nested-child HTML5 `dragEnterCount`;
- `useCallback` handlers at `:457-490` for drag enter/over/leave/drop;
- `useMemo` at `:492-497` for language menu rebuilding from `language` and recent-language state.

The drag counter increments on every `dragenter`, accepts only `hasTraitDragData`, sets
`dropEffect="move"`, decrements on leave with a floor of zero, and resets on drop because HTML5
DnD does not reliably emit `dragleave` for a completed drop (`:481-490`). The native record must
keep the counter per tab, not in a shared module variable.

The JSX content at `:509-609` has these states and slots:

- If pinned and `filePath` exists, a full-root `data-part="pinned-tooltip-trigger"` span is
  attached to a bottom tooltip with `delayShow={1500}` (`:532-535`).
- A no-language editor renders `data-part="empty-language"`, adds `data-with-icon` when
  `editor.getIcon` exists, and renders `<EditorIcon editor={editor} />` (`:537-540`).
- A language editor renders a `WithMenu` around a `tab-language` small `IconButton` (`:542-562`).
  Clicking an inactive tab with Ctrl first performs the normal tab click; otherwise it shows the
  page and opens the language menu only when the tab is active, anchored to the current button.
- The title is inside a tooltip with `placement="bottom"` and `delayShow={1500}`; content is the
  file path for non-pinned tabs and null for pinned/no-path tabs (`:563-580`). The title span is
  `data-part="title-label"`; its optional encryption child is `data-part="encryption-icon"` and
  calls `encryptionClick` (`:568-579`).
- When `_anyTabAudible || _pageMuted || editor.toggleMuteAll` is truthy, a `tab-sound` small
  `IconButton` is rendered with `data-part="sound-button"`, active state, mute/unmute title, and
  a click handler that stops propagation and calls `editor.toggleMuteAll?.()` (`:581-594`).
- The always-present `tab-close` small `IconButton` has `data-part="close-button"`; its icon is
  a React fragment containing either `GroupIcon` or `CloseIcon` with `data-part="close-icon"`
  plus `CircleIcon data-part="modified-icon"`; its title is Ungroup or Close Page and it calls
  `closeClick` (`:596-608`).

### `PageTabs.tsx` — strip, ordering, overflow, and menu inventory

`PageTabs.tsx:1-22` imports Emotion, `pagesModel`, arrow/plus icons, `IconButton` and `SplitButton`,
`TComponentModel`, React `useMemo`, settings, app events, `getCreatableItems`, `usePinnedRefs`,
board-link helpers, `BoardGlyph`, `fpBasename`, PageTab width constants/component, and
`isTextFileModel`.

`PageTabsRoot` is the only Emotion declaration in this file (`:24-47`). It makes the root flex,
aligns it to the end, adds 2px column gaps, 6px top padding, hidden overflow, and 4px left
margin. Its `.tabs-wrapper` child is a horizontal flex scroller with hidden vertical overflow,
smooth scrolling, hidden scrollbars, and 2px gaps (`:33-44`).

`TabsModel` (`:49-130`) has `showScrollButtons: false`, a `scrollingDiv`, and a
`ResizeObserver`. Its component-model effect at `:59-64` calls `checkScrollButtons()` and
`scrollToActive()` when `pagesModel.state.get().pages.length` changes. Disposal removes the wheel
listener and disconnects the observer (`:66-70`). `setScrollingDiv` installs a non-passive wheel
listener and observes the element (`:72-82`). The wheel handler converts vertical `deltaY` into
horizontal `scrollLeft` only while overflowing and prevents the browser default (`:84-91`).
`checkScrollButtons` compares `scrollWidth` and `clientWidth` and updates local state (`:93-100`).
The two controls scroll by `minTabWidth` with smooth behavior (`:102-116`). `scrollToActive`
queries `[data-type="page-tab"][data-active]` and calls `scrollIntoView({ behavior: "smooth",
block: "nearest", inline: "center" })` (`:118-129`).

The React face reads the component state and the whole `pagesModel.state` (`:132-135`). It reads
`settings.use("browser-profiles")` and `usePinnedRefs()` (`:137-138`). `addPageMenuItems` at
`:140-164` rebuilds whenever either changes:

1. It calls `getCreatableItems(browserProfiles)`.
2. For each pinned editor ref it finds the matching item and keeps its label, icon, and `create`
   action.
3. For each pinned board ref it uses `fpBasename(root)`, a React `BoardGlyph`, and sends
   `openRawLink(createLinkData(encodePersephoneBoardLink(root)))`.
4. It appends a separated `Show All…` item that calls `pagesModel.showToolsHubPage()`.

The rendered strip at `:166-214` conditionally adds left/right `IconButton`s, mounts the
`.tabs-wrapper` with a ref, maps `state.pages` in its supplied order, and gives every tab
`key={page.id}`. For each pinned page it computes `pinnedLeft` by walking earlier pages in the
same `state.pages` array, adding `pinnedTabWidth` or `pinnedTabEncryptedWidth` plus the 2px gap
for each earlier pinned page (`:181-194`). The strip ends with a `page-tabs-add` medium
`SplitButton`, plus icon, `pagesModel.addEmptyPage()`, menu title, and the generated menu items
(`:205-213`).

The two React-facing registry paths are not React-free. `src/renderer/ui/sidebar/tools-editors-registry.ts:1`
imports React and its `staticItems`/profile projection create React icon elements at `:43-201`.
`src/renderer/ui/sidebar/pinned-items.ts:1` imports `useMemo`; its current hook is at `:70-74`
(the file is currently 74 lines, despite older line references) and decodes the persisted
`pinned-editors` array. Native code must read the existing data/action functions and subscribe to
the existing settings change channel; it must not modify either module or create a second pin
registry.

### Drag-and-drop contract: ID-based, not index-based

The architecture contract in `doc/architecture/trait-system.md:136-179` says
`setTraitDragData` writes JSON `{ typeId, data }` under `application/persephone-trait` and sets
`effectAllowed="move"`; `hasTraitDragData` checks `dataTransfer.types` during enter/over; and
`getTraitDragData` parses the payload at drop. The component-level reorder pattern at
`:271-293` uses a stable item ID, and `PageTab.tsx:338-339,378-383` follows that pattern with
`TraitTypeId.PageTab` and `{ key: page.id }`.

Therefore tab reorder is **ID-based at the drag/view contract**, not index-based: the source
captures a page ID and the drop target captures its page ID, then calls
`pagesModel.moveTab(sourceId, targetId)`. `src/renderer/api/pages/PagesLayoutModel.ts:6-10`
resolves those IDs to indices internally and `:13-27` performs the array splice, rejects
cross-pinned-boundary moves, fixes grouping, persists, and sends focus. The native conversion must
capture both IDs before the synchronous `moveTab` call and never read a mutable tab record after
that call. There is no live reorder in `dragover`; `dragover` only accepts the trait and sets the
drop effect. The cross-window path is a separate descriptor-based IPC contract and is not a
second reorder identifier.

### Emotion, CSS feasibility, and runtime geometry

The unit has exactly two Emotion declarations:

| Declaration | Evidence | Static CSS result |
|---|---|---|
| `PageTabRoot` | `src/renderer/ui/tabs/PageTab.tsx:1,36-187` | Fully expressible in `PageTab.css` under `@layer app`, using theme custom properties and the existing data/part selectors. It has no callback or interpolation reading a runtime prop. |
| `PageTabsRoot` | `src/renderer/ui/tabs/PageTabs.tsx:1,24-47` | Fully expressible in `PageTabs.css` under `@layer app`, scoped to `[data-type="page-tabs"]` and `.tabs-wrapper`. It has no runtime-prop interpolation. |

The likely runtime geometry is real, but it is not an Emotion interpolation: `PageTab.tsx:521`
sets `style={{ left: pinnedLeft }}` from the parent calculation. The stylesheet must keep pinned
width/min-width state selectors static and the native view must retain the numeric `left` inline
style for each pinned tab. `pinnedTabWidth` and `pinnedTabEncryptedWidth` are module constants,
not runtime styled-prop values. The conversion must not force `pinnedLeft` into a stylesheet or
replace it with a stale class.

Follow the existing `src/renderer/ui/sidebar/PinnedRail.css` and
`src/renderer/ui/secondary-views/SideBarPanelHeader.css` convention: import the owning stylesheet
from the direct native view, wrap it in `@layer app`, use `var(--color-...)` theme variables, and
preserve data attributes and data parts. The app stylesheet should retain the direct-child SVG/IMG
sizing, hover visibility, pinned z-index, and selector order from the Emotion block.

### Panel and attribute-keyed CSS inventory

There are zero `<Panel>` call sites in `src/renderer/ui/tabs/`; `rg` finds no Panel import or tag
in either `.tsx` file. Consequently there is no tab-owned Panel attribute contract and no
attribute-keyed Panel CSS that a native replacement must reproduce. The `Panel` at
`src/renderer/ui/app/MainPage.tsx:211` belongs to US-1036 and is outside this unit.

The tabs do sit on UIKit controls, but each control owns a different primitive root:

- `IconButton`/`IconButtonView` owns `data-type="icon-button"` and its `data-size`, active,
  warning, disabled, and icon slot attributes.
- `SplitButton`/`SplitButtonView` owns `data-type="split-button"`, its primary/caret child
  views, and the menu attachment.
- `MenuView` owns `data-type="menu"` and its keyboard/focus behavior.
- `attachTooltip` owns the overlay tooltip root and delayed show/hide timers.

The tab root's `data-type="page-tab"` is app-owned, not a UIKit primitive override. The native
implementation must pass `data-part="close-button"`, `data-part="sound-button"`, and similar
hooks as additive rest attributes to the child control while never overwriting a child's own
`data-type`. This is the same attribute-keyed CSS rule established by US-1034; no tab conversion
needs a UIKit exception.

The tab itself is genuinely bespoke rather than an existing ListBox/ListItem or other reusable
primitive: it combines page-model actions, grouped/pinned visual states, HTML5 cross-window and
same-window DnD, nested drag-enter counting, editor icon resolution, encryption/audio actions,
context-menu composition, and sticky pinned positioning. Reuse the existing control primitives
for the embedded buttons/menu/tooltips, but keep the tab root and its record/view logic in this
unit.

### Icon, portal, and forbidden-usage findings

The current page-tab icon path does **not** use the DOM helper. `PageTab.tsx:17,537-540,548`
renders `<EditorIcon>` as a React element both for no-language editors and the language button.
`src/renderer/components/icons/EditorIcon.tsx:22-36` explicitly documents that this is the same
source of truth used by sidebar panel headers.

The native path should call the existing `createEditorIconElement` at
`src/renderer/components/icons/icon-elements.ts:121-147`:

- language/file icons return a real DOM element through `createFileTypeIconElement`;
- string-valued `getIcon()` results use `createIconElement` when the icon name is registered;
- a React-valued `getIcon()` result returns `{ kind: "react", value }` and must pass through
  `fillSlot`, never be inspected or dropped.

Use `subscribeFileIconElements` from `icon-elements.ts:149-158` for system-icon, trusted-board,
and board-icon-cache changes and dispose the subscription with the tab view. The editor's
`iconKey` cache-buster must be included in the editor-state projection so no-language icons are
re-resolved when an editor changes its icon.

The language menu currently contains React `LanguageIcon` values in its `MenuItem`s. The native
menu should preserve those items and route any remaining React-valued icons through the existing
`MenuView`/`fillSlot` path, or use the existing file-icon DOM builder where the value is safely
DOM-backed. The composite close icon is also deliberately a React-valued fragment because it
contains two independently styled parts; it must remain a slot, with `data-part="close-icon"`
and `data-part="modified-icon"` preserved.

There is no `createPortal`, `react-dom/server`, or `@floating-ui/react` usage in
`src/renderer/ui/tabs/`. The only floating dependency reached by the current tooltips/menus is
framework-neutral `@floating-ui/dom` through UIKit. The new native views must use those existing
attachments and introduce none of the forbidden imports.

## Implementation Plan

### 1. Preserve the React faces and extract the app stylesheet

- Change `src/renderer/ui/tabs/PageTab.tsx` to export the existing `PageTabProps` shape and
  width constants, remove `PageTabRoot`, `PageTabModel`, JSX, Emotion, and React state ownership,
  and return `mountVanilla(PageTabView, props)` from the public `PageTab` function. Keep the
  `PageTab` export and its `{ model, pinnedLeft? }` signature.
- Change `src/renderer/ui/tabs/PageTabs.tsx` to remove `PageTabsRoot`, `TabsModel`, JSX, Emotion,
  and React hooks, import `PageTabsView`, and return `mountVanilla(PageTabsView, props)` from the
  unchanged `PageTabs(props: object)` face.
- Add `src/renderer/ui/tabs/PageTab.css` and `src/renderer/ui/tabs/PageTabs.css`. Move every
  selector from the corresponding Emotion object into `@layer app`; scope the tab rules from
  `[data-type="page-tab"]` and strip/root rules from `[data-type="page-tabs"]`. Preserve all
  theme colors through CSS variables, all data attributes/data parts, selector specificity, hover
  visibility, direct SVG/IMG sizing, pinned sticky geometry, scrollbar hiding, and
  `-webkit-app-region: no-drag`. The last property is load-bearing: `MainPage.tsx:43` marks the
  titlebar as `-webkit-app-region: drag`, while the tab root at `PageTab.tsx:46` carves itself out
  so a tab drag reaches HTML5 DnD instead of moving the window. Emit the exact hyphenated
  declaration; do not mechanically write the invalid `webkit-app-region` spelling. The plain-CSS
  precedents are `src/renderer/uikit/Popover/Popover.css:11`,
  `src/renderer/uikit/Tooltip/Tooltip.css:13`, and
  `src/renderer/uikit/Progress/Progress.css:33`.
- The Emotion property sweep found no other vendor-prefixed or otherwise non-mechanical CSS
  property. `WebkitAppRegion` is the only risky camelCase property; `borderTopLeftRadius`,
  `borderTopRightRadius`, `borderBottom`, `minHeight`, `userSelect`, `fontSize`, `flexShrink`,
  `textOverflow`, `whiteSpace`, `fontStyle`, `backgroundColor`, `borderColor`, `paddingBottom`,
  `marginRight`, `pointerEvents`, `zIndex`, `minWidth`, `alignItems`, `alignSelf`, `columnGap`,
  `paddingTop`, `marginLeft`, `overflowX`, `overflowY`, `scrollBehavior`, and `scrollbarWidth`
  all have mechanical lowercase-hyphenated CSS forms. The existing `::-webkit-scrollbar`
  selector is already plain CSS.
- Keep `src/renderer/ui/tabs/index.ts` unchanged unless type re-export syntax is needed to retain
  the current public exports; no caller-facing import path may change.

Before → after for the two public faces:

```tsx
// Before: PageTab.tsx:426-427 and the 509-609 JSX renderer
export function PageTab(props: PageTabProps) {
    const tabModel = useComponentModel(props, PageTabModel, null);
    // ...React state, JSX, and Emotion root...
}

// After: PageTab.tsx
export function PageTab(props: PageTabProps): React.ReactElement {
    return mountVanilla(PageTabView, props);
}
```

```tsx
// Before: PageTabs.tsx:132-216
export function PageTabs(props: object) {
    const model = useComponentModel(props, TabsModel, defaultTabsState);
    // ...React subscriptions and PageTabsRoot JSX...
}

// After: PageTabs.tsx
export function PageTabs(props: object): React.ReactElement {
    return mountVanilla(PageTabsView, props);
}
```

Before → after for the styling boundary:

```tsx
// Before: runtime-generated Emotion class
const PageTabRoot = styled.div({
    display: "flex",
    // ...selectors keyed by data-* and data-part...
}, { label: "PageTabRoot" });

// After: PageTab.css
@layer app {
    [data-type="page-tab"] {
        display: flex;
        /* ...the same selectors and theme custom properties... */
    }
}
```

The `pinnedLeft` value remains an inline style owned by `PageTabView`; it is not moved into
`PageTab.css`.

### 2. Build `PageTabsView` as the immediate native strip owner

Add `src/renderer/ui/tabs/PageTabsView.ts` with a public constructor and a stable root carrying
`data-type="page-tabs"`, `data-name="page-tabs"`, and `className="page-tabs"`. Import its CSS
directly. Create a `tabs-wrapper` scroll element with `data-name="page-tabs-wrapper"` and retain
the exact flex/overflow structure.

The view should:

- subscribe to the necessary `pagesModel.state` projection and reconcile `state.pages` in the
  supplied order with stable `page.id` keys; compute each pinned `left` from the current array
  exactly as `PageTabs.tsx:181-194` does, including encrypted text-host width and the 2px gap;
- own each retained `PageTabView` as a child and update it in place when the page record or
  `pinnedLeft` changes; dispose removed tab views before their roots detach;
- install the existing non-passive wheel listener, translate vertical delta to horizontal scroll
  only when overflow exists, and remove it on disposal;
- install a `ResizeObserver` on the wrapper, recalculate overflow, and show/hide the left and
  right `IconButtonView`s while preserving names, `sm` size, arrow icons, and `scrollBy` amounts
  of `-minTabWidth`/`+minTabWidth` with `{ behavior: "smooth" }`;
- call `scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })` on the
  active `[data-type="page-tab"][data-active]` element after mount and after relevant page/active
  reconciliation. Including active identity in that trigger is an intentional behavior change
  from the current `pages.length`-only effect, not a like-for-like conversion; record that change
  in the EPIC-058 implementation note when the implementation lands.
- own the `page-tabs-add` `SplitButtonView` and update its `items` whenever `browser-profiles`
  or `pinned-editors` changes. Subscribe through `settings.onChanged` filtered to those keys,
  because `settings.use` and `usePinnedRefs` are React-only conveniences. Read
  `getCreatableItems(settings.get("browser-profiles"))` and
  `getPinnedStrings()`/`decodePin()` or an equivalent existing non-hook projection without
  changing `pinned-items.ts`.
- preserve editor menu item labels/icons/actions and board labels/actions. React-valued registry
  icons remain `MenuItem` slot content and must flow through `fillSlot`; a board icon may use the
  existing `createBoardGlyphElement` plus `subscribeBoardIconChanges` if that keeps the same
  cache-update behavior.

Do not use a bare `div` in place of `IconButtonView` or `SplitButtonView`; their native primitive
CSS and keyboard/tooltips/menu behavior are already the correct UIKit seam.

### 3. Build `PageTabView` as the immediate native tab owner

Add `src/renderer/ui/tabs/PageTabView.ts` with a public constructor, a stable
`data-type="page-tab"`/`data-name="page-tab"` root, and the same child DOM shape as
`PageTab.tsx:532-608`. Import `PageTab.css` directly. Use per-instance records/fields for the
drag-enter counter, active/grouped flags, current editor subscription, tooltip attachments, menu
handle, icon cleanups, and child button views.

Project and bind state without React hooks:

- bind the page state for `pinned` and `mainEditorId`; bind the pages collection for active-page
  and grouped-page identity, using the stable page ID and current `ordered`/group maps;
- when `mainEditorId` or the current `page.mainEditor` changes, dispose the old editor-state
  subscription and bind the exact title/modified/language/filePath/deleted/temp/audio/mute,
  encryption, and `iconKey` projection used by the React version;
- derive `hasEncryption` from the current text-host `encrypted || decrypted` values and update the
  data attribute, title, encryption child, and encryption tooltip state in place;
- re-resolve `createEditorIconElement` whenever the editor projection or icon-cache subscription
  changes, retaining a DOM element for `kind: "element"` and calling `fillSlot` for `kind: "react"`.
  Do not call the old `EditorIcon` as a React component for the ordinary language/file arm.

Retain all root attributes and static visual states: active, modified, drag-over, temp, deleted,
pinned, grouped, and has-encryption. For pinned tabs, preserve `left`, sticky positioning, width
and encrypted-width states, title suppression, tooltip trigger overlay, and z-index ordering.

### 4. Recreate the tab's controls and interactions through existing native seams

Inside `PageTabView`:

- Create the pinned tooltip trigger only when pinned and a file path exists; attach
  `attachTooltip(trigger, { content: filePath, placement: "bottom", delayShow: 1500 })` and
  dispose it when the path/pinned state changes or the view is disposed.
- Create the language button with `IconButtonView` and attach `openMenu` on its click, preserving
  the Ctrl-on-inactive-tab branch, `pagesModel.showPage`, active-only menu opening,
  `bottom-start` placement, `[-4,4]` offset, and focus restoration on menu close. Rebuild language
  items with the same plaintext/recent/inactive order and selected flag. Preserve React/DOM icon
  slots through the existing menu implementation.
- Attach the title tooltip to the title span with `content: !pinned && filePath ? filePath : null`,
  bottom placement, and 1500ms show delay. Update rather than recreate the attachment when only
  its content changes.
- Create the encryption span with its existing text/title and call the same
  `pagesModel.getTextFileHost` encrypt/decrypt methods on click.
- Create the conditional sound `IconButtonView`, preserving `data-part="sound-button"`, active
  state, mute/unmute title, event propagation stop, and `toggleMuteAll?.()` call. Use the existing
  volume icon values and let the primitive own focus/keyboard handling.
- Create the close `IconButtonView`, preserve `data-part="close-button"`, grouped title, and the
  composite close/group plus modified-dot icon slot. Call `ungroup` + `showPage` for grouped tabs
  and `page.close()` otherwise.
- Listen for root click and contextmenu. The click handler must preserve Ctrl grouping followed by
  `showPage`; contextmenu must call `ContextMenuEvent.fromNativeEvent(event, "page-tab")` and
  append the exact conditional/editor-contributed items from `PageTab.tsx:247-324`.

Before → after for the tab's bespoke root/primitive boundary:

```tsx
// Before: PageTab.tsx:510-530
<PageTabRoot data-type="page-tab" data-name="page-tab"
    data-active={active || undefined} onClick={tabModel.handleClick}>
    <IconButton name="tab-close" data-part="close-button" ... />
</PageTabRoot>

// After: PageTabView.ts
this.root.dataset.type = "page-tab";
this.root.dataset.name = "page-tab";
this.root.append(this.closeButton.root);
this.listen(this.root, "click", this.onClick);
// IconButtonView keeps data-type="icon-button"; data-part is additive.
```

### 5. Recreate the complete DnD contract without index drift

Use `VanillaView.listen` for `dragstart`, `dragend`, `drop`, `dragenter`, `dragover`, and
`dragleave`, with `draggable="true"` on each page-tab root. Preserve:

- `setTraitDragData(dataTransfer, TraitTypeId.PageTab, { key: page.id })` for all tabs;
- `application/persephone-tab` JSON and `PageDescriptor` only for non-pinned cross-window
  movement;
- `dropEffect="move"`, `preventDefault`, `stopPropagation`, cross-window priority, and the
  outside-window `screenX/screenY` payload;
- a per-tab drag-enter counter with reset-on-drop and `data-drag-over` presence;
- ID-based same-window reorder: capture `sourceId` from the parsed payload and `targetId` from the
  current page **before** calling `pagesModel.moveTab(sourceId, targetId)`. Never read a mutable
  per-element record after that synchronous store write. Do not introduce a drag index or live
  `dragover` reorder.

### 6. Verify the migration and the retained React-facing contract

After implementation, verify the DOM and running app for empty, ordinary, modified, deleted,
encrypted, pinned, pinned-encrypted, grouped, active, inactive, audio, no-language, and custom
editor-icon tabs. Exercise language changes, recent-language ordering, language-menu keyboard
navigation, title/pinned tooltips and their delays, encryption toggling, sound toggling, close and
ungroup, every context-menu branch, Ctrl grouping, ordinary page activation, wheel/arrow overflow,
new-page primary/caret actions, same-window reorder within both pin groups, rejected cross-group
reorder, and cross-window drag-out.

Run `npm run lint`, the repository typecheck/build command used by the sibling tasks, and
`git diff --check`. Confirm `rg '@emotion/(styled|react)' src/renderer/ui/tabs` returns no files
and the forbidden-usage scan remains empty for `createPortal`, `react-dom/server`, and
`@floating-ui/react` in the unit. Inspect the DOM to confirm the tab root and every child UIKit
primitive retain their own data types and that there is no extra React root for the ordinary tab
wrapper/content path beyond deliberate React-valued icon/menu slots.

## Concerns

### 1. Highest-risk interaction surface: DnD and synchronous mutation

The existing React handler captures `page.id` in a render closure, while a native `PageTabView`
will hold mutable per-element data. `pagesModel.moveTab` synchronously updates `pagesModel.state`
(`PagesLayoutModel.ts:19-27`), so a notification can reconcile the page records during the drop
handler. The implementation must capture `sourceId` and `targetId` before the call and must not
read the record's page/index afterward. Because the contract is ID-based and not index-based, no
mutable index should exist in the tab view. This is a release-blocking human drag test, not a
typecheck/lint concern.

### 2. Active scroll's current dependency is narrower than its name

`TabsModel.init` currently reruns on `pages.length` only (`PageTabs.tsx:59-64`), although
`scrollToActive` selects the active tab (`:118-129`). Same-length activation changes `ordered`
and can therefore bypass that effect. The implementation decision is to retain the exact
`scrollIntoView` behaviour's *purpose* while including active identity in the native sync trigger, so a
newly active off-screen tab is scrolled into view and no subscription is missed during the React
to native conversion. This is an **intentional behavior change**, not a like-for-like conversion:
the faithful `pages.length`-only behavior is worse and belongs to the masked-defect class this
epic is removing. The implementation must record the repair in the EPIC-058 implementation note,
so any later scrolling report distinguishes this deliberate repair from a conversion regression.

### 2a. The active-scroll change needed two corrections found in live testing

Making active identity a sync trigger (concern 2) exposed two defects that the original's
`pages.length`-only trigger had kept latent. Both were fixed during implementation; recorded because
the reasoning generalises.

**Resolve the active tab by id, never by querying `[data-active]`.** Each `PageTabView` writes its own
`data-active` from its own binding on the page model, so when the strip's `updateTabs` runs, the DOM
can still carry the **outgoing** tab's attribute. Querying it scrolled the strip to the *previously*
active tab — clicking a tab on the far right scrolled the bar left, and vice versa. The strip's
`KeyedList` is keyed by `page.id`, so `this.tabs.get(activeId)` resolves the element with no ordering
dependency at all. This is the same family as concern 4a: a read that races a sibling's update.

**`scrollIntoView` cannot express this scroll at all.** `inline: "center"` re-centres the strip on
**every** activation once active identity is a trigger, including clicks on an already-visible tab.
But `inline: "nearest"` is also wrong: the pinned tabs are `position: sticky`, so the leftmost
`pinnedInset` pixels of the scrollport are permanently covered by them, and `"nearest"` aligns the
target's left edge to the *scrollport's* left edge — parking the tab **behind** the pinned block. It
is scrolled in but still invisible, and the user has to nudge the strip further left. `"center"`
happened to clear the pinned block, which is why this stayed latent until the options changed.

The scroll is therefore computed directly, and getting it right took two further corrections that
are worth stating because both are measurement traps:

- **Not `offsetLeft`.** Neither the strip nor `.tabs-wrapper` is positioned, so `offsetParent`
  resolves to `.app-header` and `offsetLeft` includes everything to the left of the tab strip in the
  header. Use client rects relative to the wrapper's own box instead.
- **Not the width constants.** `pinnedTabWidth`/`pinnedTabEncryptedWidth` describe the layout
  `width`, not the rendered outer width — each tab adds 1px borders and 2px horizontal padding — so
  summing them under-reported the sticky inset and left the target tab clipped behind the pinned
  block. `pinnedInset()` reads the **last pinned tab's right edge** relative to the wrapper, which is
  exact and needs no knowledge of the column gap.

It returns early when the tab is already fully visible, or when the tab is itself pinned (a sticky
tab is never scrolled out of view), and clamps the target to the scrollable range.

Verified by measurement in the running app with 23 tabs overflowing a 1235px port: activating the
last tab lands it at `1149→1235` (flush right); activating the first unpinned tab lands its left edge
at `142`, exactly the measured pinned inset; and activating an already-visible tab leaves
`scrollLeft` unchanged at `14`.

Note this also changes the add/remove-tab case from centring to minimal scrolling; that is deliberate
and strictly less surprising.

### 3. React-valued registry, menu, and editor icons must remain visible

`tools-editors-registry.ts` creates React elements, `BoardGlyph` is currently React-backed, and
some editor `getIcon()` implementations return React nodes. `IconRef` is
`IconName | ReactNode` (`src/renderer/uikit/shared/slots.ts:6`), so treating every icon as a
string/DOM node silently drops colored or custom icons. Use DOM builders when the existing
`createEditorIconElement`/board builder returns one and `fillSlot` for React-valued arms. Never
inspect React element internals. Reuse each slot host across updates so `fillSlot` can retain its
React root; do not pre-run the prior cleanup.

### 4. Settings hooks are not available to a native view

`usePinnedRefs` and `settings.use` are React conveniences. The native view must read current
values through `settings.get`, subscribe to `settings.onChanged`, and filter
`browser-profiles`/`pinned-editors` changes. Preserve the `pinned-editors` bare-editor and
`board:<absoluteRoot>` encoding from `pinned-items.ts:11-15,23-37`; do not alter persistence or
add a registry. The add-menu action callbacks remain the existing registry callbacks.

### 5. Attribute-keyed primitive CSS must not be detached

US-1034 demonstrated that overriding a UIKit primitive's `data-type` detaches all of its
attribute-keyed CSS. The native tab root may own `data-type="page-tab"`, but the embedded
`IconButtonView`, `SplitButtonView`, and `MenuView` roots must keep their own primitive data types.
The tab-specific `data-part` hooks are additive. No UIKit change is planned or justified by this
unit; if an apparent seam arises, record it as a finding rather than adding future infrastructure.

### 6. Runtime layout is only partly static

Both Emotion objects are static and can move to `@layer app`. `pinnedLeft` is runtime geometry
written by the parent and must remain inline. Pinned width states are discrete data-attribute CSS;
do not replace them with a stale class or calculate them from a mutable record after a reorder.
The stylesheet must preserve the existing direct-child and z-index selectors because pinned tabs
use a full-root tooltip trigger behind positioned content.

### 7. Tooltip/menu timer and disposal ordering

The tab source itself has no `setTimeout`, but its two tooltips use 1500ms show delays and UIKit
owns hide timers, overlay subscriptions, and floating positioning. The language menu owns a
`MenuHandle` and focus restoration. Dispose attachments and menu handles before removing their
trigger/anchor roots; update existing handles rather than recreating them on every state change.

### 8. No Panel conversion or UIKit exception is hidden in this plan

There are no tab `<Panel>` sites to convert. Existing UIKit controls are already native and are
immediate consumers, so no UIKit source change is needed. `MainPage.tsx`, the page model, trait
helpers, icon builders, tools registry, and pinned-item contract remain outside the implementation
diff.

## Acceptance Criteria

- [ ] `PageTabs` remains renderable from `src/renderer/ui/app/MainPage.tsx:210` with its existing
      no-props React-facing signature and delegates to a module-scope `mountVanilla(PageTabsView,
      props)` face.
- [ ] `PageTab` remains exported with `{ model: PageModel; pinnedLeft?: number }` semantics and
      delegates to a module-scope `mountVanilla(PageTabView, props)` face.
- [ ] `src/renderer/ui/tabs/` contains no `@emotion/styled` or `@emotion/react` importer; the
      former `PageTabRoot` and `PageTabsRoot` rules are present in `@layer app` stylesheets with
      theme variables and preserved selectors, including the exact
      `-webkit-app-region: no-drag` declaration.
- [ ] Human DnD verification confirms that dragging a tab reorders the tab and does not move the
      application window; the tab root retains `-webkit-app-region: no-drag` while
      `MainPage.tsx:43` retains the surrounding drag region.
- [ ] The native strip preserves `state.pages` ordering, stable `page.id` identity, pinned-left
      calculation, sticky pinned widths, encrypted pinned width, overflow detection, wheel
      scrolling, arrow controls, smooth active-tab scroll, resize disposal, and the new-page
      `SplitButton`/menu behavior.
- [ ] The intentional active-scroll behavior change is verified independently: activate an
      off-screen tab without changing the tab count and confirm that it scrolls into view using
      the existing smooth/nearest/center behavior.
- [ ] Tab reorder is verified as ID-based: trait data carries `{ key: page.id }`, the drop calls
      `pagesModel.moveTab(sourceId, targetId)`, pinned boundaries remain enforced by the page
      model, and no mutable per-element index is read after the synchronous move.
- [ ] All current PageTab actions survive: activation, Ctrl grouping, close/ungroup, encryption,
      sound mute/unmute, context-menu composition, language change/menu selection, outside-window
      drag, cross-window priority, same-window reorder, nested drag counter, and drag-over reset.
- [ ] Active, modified, deleted, temporary, pinned, grouped, encrypted, audio, and drag-over
      attributes and the `data-part` hooks for title, icons, buttons, and tooltip trigger are
      unchanged in meaning and styling.
- [ ] The page-tab icon path uses `createEditorIconElement` for the shared icon source of truth,
      uses DOM elements where available, routes React-valued icon arms through `fillSlot`, and
      responds to editor `iconKey` and icon-cache changes without leaking subscriptions.
- [ ] Existing `IconButtonView`, `SplitButtonView`, `MenuView`, `attachTooltip`, and `openMenu`
      behavior is reused; their own primitive `data-type` attributes are not overridden.
- [ ] No `<Panel>` site is added or modified in `src/renderer/ui/tabs/`; no `src/renderer/uikit/`
      file is changed; no empty registry/view infrastructure is introduced.
- [ ] No `createPortal`, `react-dom/server`, or `@floating-ui/react` usage exists under
      `src/renderer/ui/tabs/`.
- [ ] The EPIC-058 implementation note records the intentional active-scroll repair and its
      separate human verification; this investigation pass does not edit the epic document.
- [ ] The running-app smoke pass covers ordinary, pinned, pinned-encrypted, grouped, modified,
      deleted, encrypted, audio, no-language/custom-icon, overflow, menu, tooltip, DnD, and
      cross-window paths; `npm run lint`, the repository typecheck/build command, and
      `git diff --check` pass.
- [ ] `doc/active-work.md` and `doc/epics/EPIC-058.md` remain untouched by this task-document
      pass, as requested by the user.

## Files that need NO changes

The following files were verified as callers, published contracts, or reusable infrastructure and
must remain unchanged in this task:

- `doc/active-work.md` and `doc/epics/EPIC-058.md` — dashboard and epic-table edits are reserved
  by the user.
- `src/renderer/ui/app/MainPage.tsx` — the existing import and `<PageTabs />` call remain valid;
  US-1036 owns the root flip.
- `src/renderer/ui/tabs/index.ts` — current barrel exports remain valid after the faces delegate;
  no import-path change is needed.
- `src/renderer/ui/sidebar/tools-editors-registry.ts` and
  `src/renderer/ui/sidebar/pinned-items.ts` — preserve React-valued icons, action callbacks,
  settings encoding, and the hook/data contract; native code consumes their existing contracts.
- `src/renderer/api/pages/PagesModel.ts`, `src/renderer/api/pages/PagesLayoutModel.ts`,
  `src/renderer/api/pages/PagesQueryModel.ts`, and `src/renderer/api/pages/PageModel.ts` — the
  page identity, order, grouping, pin, close, descriptor, and editor-state APIs are consumed as
  they exist.
- `src/renderer/core/traits/dnd.ts`, `src/renderer/core/traits/TraitRegistry.ts`, and
  `doc/architecture/trait-system.md` — the existing PageTab discriminator and HTML5 DnD contract
  are reused unchanged.
- `src/renderer/components/icons/EditorIcon.tsx`,
  `src/renderer/components/icons/icon-elements.ts`,
  `src/renderer/components/icons/LanguageIcon.tsx`,
  `src/renderer/editors/board/BoardGlyph.tsx`, and
  `src/renderer/editors/board/board-glyph-element.ts` — the existing shared icon source and DOM
  builders are consumed; no second icon implementation is needed.
- `src/renderer/uikit/shared/mount.tsx`, `src/renderer/uikit/shared/vanilla-view.ts`,
  `src/renderer/uikit/shared/keyed-list.ts`, `src/renderer/uikit/shared/fill-slot.ts`,
  `src/renderer/uikit/shared/slots.ts`, `src/renderer/uikit/IconButton/`,
  `src/renderer/uikit/SplitButton/`, `src/renderer/uikit/Menu/`, and
  `src/renderer/uikit/Tooltip/` — existing native infrastructure and primitive CSS are reused;
  no UIKit exception is authorized.

## Files Changed summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1035-tabs-vanilla/README.md` | This verified investigation and implementation plan. |
| `src/renderer/ui/tabs/PageTab.tsx` | Thin React-facing `mountVanilla(PageTabView, props)` face and preserved width/public exports; remove Emotion/React renderer. |
| `src/renderer/ui/tabs/PageTabs.tsx` | Thin React-facing `mountVanilla(PageTabsView, props)` face; remove Emotion/React strip renderer. |
| `src/renderer/ui/tabs/PageTabView.ts` | Native bespoke tab root, page/editor subscriptions, icon slots, tooltips, language menu, context menu, page actions, and ID-based DnD. |
| `src/renderer/ui/tabs/PageTabsView.ts` | Native strip root, page keyed reconciliation, pinned geometry, overflow/wheel/resize behavior, active scrolling, controls, settings-backed add menu, and disposal. |
| `src/renderer/ui/tabs/PageTab.css` | `@layer app` translation of `PageTabRoot` and all tab state/part selectors. |
| `src/renderer/ui/tabs/PageTabs.css` | `@layer app` translation of `PageTabsRoot` and `.tabs-wrapper` overflow/layout selectors. |
