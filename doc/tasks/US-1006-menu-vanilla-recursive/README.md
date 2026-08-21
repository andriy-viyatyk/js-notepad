# US-1006: `Menu` and `WithMenu` — vanilla attachment and recursive submenus

**Status:** Implemented

**Priority:** Critical

**Epic:** [EPIC-055 — De-React Epic C2: Floating layer and composites](../../epics/EPIC-055.md)

**Created:** 2026-08-20

## Goal

Replace `Menu`'s React implementation with a `VanillaView` while preserving its public React
props, floating placement, keyboard navigation, search header, row DOM contract, context-menu
behavior, and submenu behavior. Add the imperative `openMenu()` attachment for future vanilla
callers, keep `WithMenu`'s render-prop API working, and remove `@floating-ui/react` from `uikit/`.

This task also owns EPIC-055's final Rule 4 measurement after both `Popover` and `Menu` are vanilla.
The pinned two-root procedure records the result in `doc/epics/EPIC-055.md`; the user explicitly
waived the retroactive all-React comparison because only the new implementation needs verification.

## Background

### Current implementation

`src/renderer/uikit/Menu/Menu.tsx` currently:

- creates `MenuModel` with `useComponentModel`;
- renders a `<Popover>` with `data-type="menu"`, `scroll={false}`, `maxHeight={500}`, and
  `outsideClickIgnoreSelector='[data-type="menu"]'`;
- conditionally renders a search header containing the UIKit `Input` when more than 20 items are
  supplied;
- renders the list, rows, icons, labels, hotkeys, selected checkmarks, and submenu chevrons as
  Emotion components;
- handles row hover, delayed submenu opening, click activation, and keyboard navigation through
  `MenuModel`;
- renders another `<Menu>` recursively when `subMenuItem` and `subMenuAnchor` are present.

`MenuModel.ts` has three React-era effects that must be shed before a model driver can mount it:

1. `[props.open, props.items]` resets search/hover/submenu state while closed and initializes the
   hovered item from `selected` when opening or when the item list changes.
2. `[props.open, this.showSearch]` focuses the search input or list after opening.
3. `[state.hoveredId]` scrolls the selected/keyboard-hovered row into view.

The first effect is a model transition and belongs in a guarded `setProps` branch. The focus
effect belongs to the view after its DOM and the composed `InputView` exist. The hovered-row
scroll is a consequence of the method that changes `hoveredId`, with a queued DOM read/write so
the row has been rendered first. `createComponentModelDriver.mount()` rejects any remaining
`effect()` registration.

`src/renderer/uikit/Menu/WithMenu.tsx` is a React render-prop wrapper. The current tree has 15
production `<WithMenu>` sites and one story site; the earlier 14-site epic measurement was stale
and has been reconciled in EPIC-055. The production list is:

| Area | Files / sites |
|---|---|
| Application shell | `ui/app/MainPage.tsx:311`, `ui/tabs/PageTab.tsx:542` |
| Editors | `editors/browser/BrowserView.tsx:467,514`, `editors/draw/index.tsx:169,180`, `editors/html/index.tsx:41`, `editors/image/ImageView.tsx:23`, `editors/notebook/note-editor/NoteItemToolbar.tsx:166`, `editors/rest-client/RequestBuilder.tsx:275,432`, `editors/rest-client/ResponseViewer.tsx:274`, `editors/rest-client/RestClientShared.tsx:249`, `editors/settings/sections/BrowserProfilesSection.tsx:88` |
| UIKit | `uikit/SplitButton/SplitButton.tsx:146` |
| Story | `uikit/Menu/Menu.story.tsx:78` |

No caller migration is planned. `WithMenu` keeps its React render prop and drives the new
imperative attachment. The story remains the first visual verification surface.

There are three direct `<Menu>` tags: the `WithMenu` implementation, the recursive submenu in
`Menu.tsx`, and `ui/dialogs/poppers/showPopupMenu.tsx`. The app popup menu remains a React caller
through the unchanged public `Menu` face; `openMenu` is the boundary for future vanilla callers.

### Existing attachment and floating infrastructure

- `src/renderer/uikit/shared/vanilla-view.ts` supplies explicit mount/update/dispose lifecycle,
  child ownership, FIFO cleanup, and guarded `bind()` subscriptions.
- `src/renderer/uikit/shared/subtree-swap.ts` owns one detached-root branch, inserts a replacement
  before disposing the previous branch, and detaches roots it owns. It requires `PropertyKey` keys
  and a detached factory result.
- `src/renderer/uikit/shared/mount.tsx` supplies `mountVanilla`, `mountReactHandle`, and the
  stable React host boundary. A direct `Menu` React call therefore remains a normal React API
  while its implementation is vanilla.
- `src/renderer/uikit/Popover/PopoverView.tsx` is the converted floating primitive. It uses
  `@floating-ui/dom`, the overlay layer, a logical display-contents root, and a nested React root
  for its public `children` prop. Its internal-only `contentView` mode will let `MenuView` own
  native floating content without adding a wrapper or widening `PopoverProps`.
- `src/renderer/uikit/Input/InputView.tsx` is the converted input primitive. `MenuView` must
  compose it as a child view for the search header rather than mounting a React `<Input>` subtree.
- `src/renderer/uikit/shared/fill-slot.ts` can carry the transitional `MenuItem.icon?: any`
  React-node arm without inventing an icon descriptor or a second icon naming protocol.
- `@floating-ui/dom@^1.8.0` is already the installed positioning dependency. `WithMenu` is the
  only remaining `@floating-ui/react` importer under `uikit/`; its type-only `Placement` import
  moves to `@floating-ui/dom`.

### Menu item and context-menu contract

`src/renderer/core/events/context-menu.ts` owns the neutral `MenuItem` shape. It carries string
labels, optional callbacks, disabled/invisible/group/minor/selected flags, hotkeys, stable ids,
recursive `items`, and an intentionally transitional `icon?: any` field. Production menu items
are overwhelmingly React icon elements, including prop-driven language/board icons. This task
must preserve that field and use the existing React-node bridge for it; it must not introduce a
new serializable icon descriptor.

`showAppPopupMenu()` is already an imperative app-layer menu launcher, but currently renders the
React `Menu` through the `Poppers` registry and restores focus after it closes. It stays on that
public React path in this task. The new `openMenu()` attachment has the same caller-owned lifetime
shape needed by future vanilla views and does not change `overlayRegistry` registration or the
app popup's existing behavior.

### DOM contract to preserve

The public menu is the floating root produced by the Popover layer and appended under
`#persephone-overlay-layer`. Its observable shape is:

```text
div[data-type="menu"][data-name?]
  position: fixed; z-index: 1000; placement from Floating UI
  border/background/radius/shadow from the Popover shell
  div[data-part="search"]?                         // search wrapper
    div[data-type="input"] > input                // converted InputView
  div.scroll-container[data-part="list"]
    div[data-type="menu-row"][data-id][data-hovered?][data-disabled?]
      span[data-part="icon"]?                     // present for every row when any item has an icon
      span[data-part="label"]
      span[data-part="hotkey"]?
      span[data-part="selected-check"]?
      span[data-part="submenu-chevron"]?
```

The exact current `data-type` values (`menu`, `menu-row`, and the converted `input`), `data-part`
values, `data-id` values, selected checkmark and submenu chevron placement, `scroll-container`
class, fixed-position behavior, and `data-name` must remain. The menu root is also the
`outsideClickIgnoreSelector` target for all parent menus: a click in any submenu must match
`[data-type="menu"]` and must not close the parent before the child handles it.

`data-type="menu"` intentionally overrides the Popover root's addressing marker. The stable
Popover shell hook is the `popover-shell` class, which `PopoverFloatingView` adds internally and
which `PopoverProps` cannot override because `className` is omitted. The static CSS remains owned
by `Popover.css`; Menu CSS must not copy the shell.

## Implementation plan

### 1. Capture the final Rule 4 number before closing the epic

Use the exact procedure pinned by EPIC-055 C2-9 and US-1005:

1. Open the Storybook `Menu` story with the default `small` variant and let it settle.
2. Observe both `[data-type="live-preview"]` and `#persephone-overlay-layer` with identical
   options:

   ```js
   { subtree: true, childList: true, attributes: true, characterData: true }
   ```

3. Reset one raw `MutationRecord` counter immediately before clicking `Open menu`. Count records
   from both observers, not mutated nodes, and stop after the menu has mounted and settled.
4. Record the sum, the story values, the observer options, and the reset point in
   `doc/epics/EPIC-055.md` under `## Notes`.

The retroactive all-React comparison at `cdc12530` is intentionally out of scope by user decision.
Take the final number on the branch after both Popover and Menu are converted and record the exact
procedure in EPIC-055 Notes.

### 2. Shed all three `MenuModel` effects while the React face still exists

Make the model driver-safe without changing its public `MenuProps`:

- Replace the open/items effect with `setProps`. Use `oldProps` identity guards so closed-state
  reset runs only on the true-to-false transition, and selected-item initialization runs on an
  open transition or an actual `items` identity change. Preserve the current behavior when no
  selected item exists; do not invent a new fallback selection.
- Move focus to `MenuView`'s open/show-search transition. Queue the focus after the DOM commit,
  exactly as the current model effect does, and focus `InputView`'s native field when search is
  shown or the list root otherwise.
- Remove the hovered-id effect from the model. In `MenuView`'s state binding, write the keyed row's
  `data-hovered` state first, then queue `scrollIntoView({ block: "nearest" })` for the current
  `[data-type="menu-row"][data-id]`. The view must check that the row still exists when the queued
  callback runs; no row-ref map is needed.
- Change internal handler event types to native `MouseEvent` / `KeyboardEvent` where the vanilla
  view calls them. The React-facing `Menu` is replaced by the vanilla adapter, so no React event
  implementation remains in the menu model.
- Preserve filtering, invisible-item handling, start-group transfer, `idOf` fallback, delayed
  submenu opening (`400ms`), click-to-open behavior, selected initialization, page movement based
  on `ROW_HEIGHT`, `MAX_HEIGHT`, Enter activation, Escape close, and cleanup of the submenu timer.
- Keep `MenuModel.dispose()` clearing `subTimerId`; the driver reaches it through
  `onUnmountInternal()` during `dispose()`, which prevents a delayed submenu callback from updating
  a disposed model.
- Run the React-facing Menu story after this refactor and before replacing the view. The model must
  have zero registered effects before `createComponentModelDriver.mount()` is introduced.

### 3. Add `MenuView` and its layered CSS without changing public exports

Create `src/renderer/uikit/Menu/MenuView.tsx`, `src/renderer/uikit/Menu/Menu.css`, and make
`Menu.tsx` a thin public face:

```tsx
export function Menu({ ref, ...props }: MenuProps & { ref?: React.Ref<HTMLDivElement> }) {
    return mountVanilla(MenuView, { ...props, ref });
}
```

`MenuView` should:

- declare a public constructor, use `createComponentModelDriver<MenuState, MenuViewProps, MenuModel>`,
  and keep its logical root layout-neutral (`display: contents`); the owner, adapter, or
  `openMenu()` removes that logical root after `dispose()`.
- compose the converted `InputView` with `this.child(new InputView(...))`. The input is created in
  the constructor, registered immediately, and mounted only when `showSearch` is true. Its native
  input element remains the target of the search ref and its `onChange`/`onKeyDown` callbacks.
- retain the converted `PopoverView` boundary for positioning and portal ownership, using its
  internal-only `contentView` mode rather than a wrapper host. Extend `PopoverViewProps` (not
  `PopoverProps`) with `contentView?: (host: HTMLElement) => IOwnedView`; assert in the floating
  branch constructor that exactly one of `contentView` or public `children` is supplied. In
  `contentView` mode, `PopoverFloatingView` skips `mountReactHandle`, calls the factory with the
  floating root, claims the returned view with `this.child(...)`, mounts it after the root is
  attached, and lets that view own the direct search/list children. This keeps
  `[data-type="menu"]` directly above `[data-part="search"]`/`[data-part="list"]` and adds no
  public callback-slot or descriptor protocol.
- Build the resizable handle natively in `contentView` mode after the content view mounts, using
  `ResizeHandleIcon.createElement()`, and append it last. Keep the existing React fragment path
  unchanged for ordinary Popover callers. The two modes must never both write to the floating
  root.
- Do not create a React root for each row, and do not use `mountReact` for the converted `InputView`
  or menu list.
- create the search wrapper, list root, and row nodes with native DOM. Keep the current layout:
  `SearchWrap` padding/flex-shrink, `ListRoot` min/max width, padding, column flex layout,
  overflow and `scroll-container`, and six row/slot style regions.
- use `KeyedList<PreparedItem, string, HTMLDivElement>` or an equivalent keyed DOM update so item
  identity and row event listeners survive search/hover updates. Validate row keys before mutation
  and preserve `idOf`'s current fallback. Update every retained/new row with the current index and
  fields; remove icon-slot cleanup and row listeners before a row is detached.
- render each row in this exact order: optional icon host, label, optional hotkey, optional selected
  check, optional submenu chevron. Use `fillSlot` for `MenuItem.icon` and keep the icon host only
  when the current menu has any icon, matching the existing all-rows layout behavior. The check and
  chevron use `createIconElement`/the existing DOM icon path for the registry icons.
- write `data-hovered`, `data-disabled`, `data-start-group`, and `data-minor` as present/absent
  attributes on each row. Keep the hover selector's propagation to hotkey, submenu-chevron, and
  selected-check, and the disabled row's nested SVG color and non-interactive visual state.
- install native row `mouseenter`, `mouseleave`, and `click` listeners. Route keyboard handling
  through the list root when search is absent and through `InputView`'s `onKeyDown` when search is
  present, preserving the existing `showSearch ? undefined : model.onKeyDown` root behavior.
- bind model state once to update search, hover attributes, row order/content, focus/scroll
  consequences, and submenu ownership. Do not maintain a second state representation for the
  same hovered or submenu fact.

Translate `ListRoot`, `SearchWrap`, `RowRoot`, `IconSlot`, `Label`, `Hotkey`, `SubMenuChevron`, and
`SelectedCheck` to `Menu.css` under `@layer uikit`. Use the existing token/color custom properties
with fallbacks, preserve selector specificity and declaration order, and do not replace the
`[data-type="menu-row"]` / `data-part` vocabulary with generated classes.

The menu root receives the existing `popover-shell` class from `PopoverFloatingView`, so
`Popover.css` remains the single shell owner. `Menu.css` contains only Menu's six Emotion blocks.
Verify border, radius, shadow, background, flex column layout, clipping, and fixed z-index.

### 4. Own recursive submenus with `SubtreeSwap`

Replace the recursive `<Menu>` branch with a native `MenuView` child:

- create a `SubtreeSwap<string>` whose parent is the MenuView's logical root or a dedicated
  layout-neutral ownership container;
- key the branch with the prepared submenu row id (`item.id` or the same index/label fallback
  used by `idOf`), not with an object key. If the key is unchanged while its item data changes,
  call `update()` on the existing child rather than relying on `SubtreeSwap` to detect object
  mutation;
- when a submenu becomes active, construct a detached `MenuView` with its child items,
  `open: true`, `elementRef` equal to the row anchor, `placement: "right-start"`, `offset: [0, 2]`,
  and an `onClose` callback to the parent model. Let `SubtreeSwap.set()` attach the logical root,
  then call `mount()` after attachment;
- when hover moves to another submenu, insert the replacement before disposing the previous branch.
  The child-before-parent disposal order must remove the old submenu's document listeners, timer,
  input, icon bridges, and floating branch before the old logical root is detached;
- when a submenu closes or the parent menu disposes, call `clear()`/`dispose()` and do not leave a
  child listener or floating root alive.

The parent menu's outside-click ignore selector must remain exactly `[data-type="menu"]`. Both
parent and child listeners are installed on `document` in bubble order, so the parent's listener
runs first and relies entirely on `target.closest('[data-type="menu"]')` matching the child root.
This is why the marker must remain an attribute even though the shell styling uses `popover-shell`.
Do not register menus with `overlayRegistry`; the existing app popup menu's registration remains a
separate app-layer behavior.

### 5. Add `openMenu()` and drive it from `WithMenu`

Create `src/renderer/uikit/Menu/attach-menu.ts` with the public attachment seam described by
EPIC-055:

```ts
export interface MenuAttachOptions {
    items: MenuItem[];
    placement?: Placement;
    offset?: [number, number];
    name?: string;
    onClose?: () => void;
}

export interface MenuHandle {
    update(options: MenuAttachOptions): void;
    dispose(): void;
}

export function openMenu(anchor: Element, options: MenuAttachOptions): MenuHandle;
```

The attachment creates a `MenuView` with `open: true` and the supplied anchor, owns its logical
root and disposal, and calls the supplied `onClose` after Escape, outside click, or leaf activation.
`update()` must update the same view and anchor rather than recreate it; `dispose()` must be
idempotent, clear all submenu/floating resources, and detach the root owned by the attachment.
`openMenu` must not become a global singleton or silently close unrelated `WithMenu` instances.

Update `WithMenu.tsx` as follows:

- move `Placement` to a type-only import from `@floating-ui/dom`;
- keep its public props, render-prop child, `useState` anchor and focus-restore behavior unchanged;
- create one attachment when the anchor becomes non-null, update it when items/placement/offset/name
  change, and dispose it when the anchor is cleared or the wrapper unmounts;
- keep the current `previousFocusRef` behavior: the caller's trigger is remembered when opening,
  and the element is focused after the attachment closes. Do not move focus restoration into the
  vanilla attachment, because imperative callers may choose a different policy;
- ensure an inline `items` array or changing callback identities updates the existing attachment
  without disposing/reopening the menu on every parent render.

Because the current `prepared` and `hasAnyIcon` memos are keyed on `items` identity, the 15
production callers' inline arrays can recompute on every parent render. That is existing behavior,
not a reason to add a global cache: the keyed row update must nevertheless retain row elements
when a fresh items array has equal keys/content, and only update their attributes/slots in place.

Export `openMenu`, `MenuHandle`, and `MenuAttachOptions` from the direct Menu entry point and the
existing Menu barrel as appropriate, while keeping `MenuView` internal and preserving all existing
React-facing `Menu`, `WithMenu`, `MenuProps`, `WithMenuProps`, and `MenuItem` exports.

### 6. Preserve the app popup path and verify the complete menu surface

Do not migrate `showAppPopupMenu` or its `Poppers`/`overlayRegistry` bridge in this task. Confirm
that its existing React `<Menu>` still opens at a virtual `x/y` anchor, adds Paste/Copy/Inspect,
restores focus, and unregisters the popup root exactly as before.

Verify in the Menu story and the running app:

- small menu: icons, disabled item, groups, minor item, selected check and leaf activation;
- submenu variant: hover delay, click-to-open, sibling replacement, parent retention while moving
  into the child, child leaf closes the chain once, and Escape/outside click closes the expected
  level;
- large-search variant: search Input filtering, focus on open, keyboard arrows/PageUp/PageDown,
  Enter, Escape, and active-row scrolling;
- every placement/offset story option and both light/dark themes;
- representative app menus in the shell, browser, draw, image, REST client, notebook, settings,
  tabs, SplitButton, and at least one context menu through `showAppPopupMenu`;
- native and React trigger handlers still fire once, menu rows retain `data-*`/`data-part` output,
  and no stale menu root, submenu listener, timer, or `@floating-ui/react` import remains under
  `uikit/`.
- verify that Escape closes only the active submenu/menu level once. The Popover floating branch's
  document Escape handler calls the attachment's `onClose`, while the menu list/input key handler
  handles Escape when it receives the event; preserve the current invariant that search and root
  handlers are mutually exclusive and do not close two submenu levels from one key event.
- the two app-layer `@floating-ui/react` importers (`ui/dialogs/poppers/showPopupMenu.tsx` and
  `editors/browser/BrowserTabsPanel.tsx`) remain expected survivors; this task only removes the
  UIKit `WithMenu` importer.

Finally run `npm run typecheck`, `npm run lint`, and `git diff --check`.

## Concerns / Open questions

1. **The historical React baseline is intentionally waived.** The user decided that C2 only needs
   verification of the new implementation; the final vanilla count remains recorded with the
   pinned two-root procedure, but no before/after comparison is required.

2. **The internal Popover content seam is deliberate and narrow.** `PopoverViewProps.contentView`
   is an internal view-only extension. `Popover.tsx` never passes it, public `PopoverProps` does
   not widen, and the floating branch asserts `contentView xor children`. In that mode the content
   view is claimed and mounted directly under the floating root and the resize handle is built
   natively after it, preserving the direct Menu DOM. Do not fall back to a display-contents child
   wrapper merely because the existing public React path is easier.

3. **Submenu outside-click ordering is the highest behavioral risk.** Parent and child menus are
   separate floating roots, and both have document dismissal listeners. The parent listener is
   installed first and must ignore any target inside `[data-type="menu"]`; the child must close its
   own chain exactly once on a leaf, while its `onClose(true)` propagates to the parent. A click on
   a submenu row, moving between sibling submenus, and Escape at each level need explicit smoke
   checks. Do not expand `overlayRegistry` as an attempted fix.

4. **Native event attachment changes delegated React ordering.** Residual `onKeyDown` and row
   handlers are now native listeners. Root listeners can run before descendant React handlers, and
   a child handler's `stopPropagation()` can no longer suppress a root listener in the same way.
   The current search path already leaves the root keydown handler undefined when the search input
   exists, so verify that path and preserve the one-handler-per-event behavior rather than adding a
   new event abstraction.

5. **The model's effects have different owners after shedding.** Focus requires the mounted Input
   and list DOM; hover scrolling belongs in the view binding after keyed rows receive their
   `data-hovered` attributes; closed-state reset is model state. Keep those responsibilities
   separated and use identity/transition guards. An unguarded `setProps` branch would reset search
   or hover on every parent render, especially through `WithMenu`'s inline item arrays.

6. **`MenuItem.icon` is still a React compatibility arm.** Language icons, board glyphs, and
   prop-driven icons cannot be represented by the registry name alone. Keep icon-slot ownership
   and cleanup exact, do not add `IconRef` or a descriptor protocol, and verify both icon-present
   and icon-absent menus so the all-rows icon column does not introduce phantom spacing.

7. **The imperative attachment's logical root has no React parent.** `openMenu` must own its
   `MenuView.root`, append it before mounting if the chosen composition requires an attached root,
   and remove it only after `dispose()`. The base view intentionally does not detach roots. This
   lifecycle must be explicit so a vanilla caller cannot leak a display-contents root or submenu
   ownership record.

8. **Escape has two existing paths but must close only one level per event.** The Popover floating
   branch's document keydown handler calls the attachment's `onClose`, while the menu list/input
   handler calls `MenuModel.onKeyDown`. Preserve the current invariant that search and root handlers
   are mutually exclusive, and verify one Escape does not close both a child and its parent.

9. **The `WithMenu` measurement must remain pinned.** The current scan is 15 production sites / 16
   including `Menu.story.tsx:78`, and EPIC-055 records that corrected scope. Re-run the same
   identifier-based scan if callers change before implementation; do not silently reuse the old
   14-site number.

## Acceptance criteria

- [x] The final Rule 4 number is measured on the final branch with the pinned two-root observers,
      one reset immediately before the Menu story click, and raw records summed across both roots;
      the procedure and result are recorded in EPIC-055 Notes. The user explicitly waived the
      retroactive React baseline.
- [x] `MenuModel` has no `effect()` registrations. Close reset, selected initialization, focus,
      hover scrolling, delayed submenu opening, filtering, keyboard navigation, and timer cleanup
      retain their existing guards and behavior.
- [x] `Menu` is a thin `mountVanilla(MenuView, ...)` face with unchanged public props and ref
      behavior; `MenuView` has a public constructor and uses the model driver.
- [x] The search header composes `InputView` through `this.child(...)`; the internal Popover
      `contentView` mode owns direct native Menu children; no React `<Input>` subtree, wrapper host,
      or per-row React root is introduced in the Menu path.
- [x] Menu rows are native/keyed DOM with the existing `data-type`, `data-id`, `data-part`, order,
      attributes, icon arm, label/hotkey, selected-check, submenu-chevron, listener and cleanup
      behavior.
- [x] Recursive submenus use `SubtreeSwap` with stable PropertyKey row ids, mount after attachment,
      replace siblings before disposing the old branch, and dispose child resources before parent
      resources. Parent clicks inside `[data-type="menu"]` remain ignored.
- [x] `openMenu(anchor, options)` exists with a caller-owned, idempotent `MenuHandle`; updates reuse
      the existing view, disposal removes all roots/listeners/timers, and the attachment does not
      become a global singleton.
- [x] `WithMenu` preserves its render-prop and focus-restore API while driving `openMenu`; its
      existing 15 production callers and story compile unchanged, and inline item arrays do not
      reopen the menu on every render.
- [x] `WithMenu` imports `Placement` from `@floating-ui/dom`, and no `@floating-ui/react` import
      remains under `src/renderer/uikit/`; the two app-layer importers remain expected survivors.
- [x] `Menu.css` is in `@layer uikit` and preserves all Menu Emotion declarations/order/specificity;
      `Popover.css` remains the single shell owner through the non-overridable `popover-shell`
      class on the final `data-type="menu"` floating root in both themes.
- [x] No residual prop can silently disable a component-owned static style hook: the Popover shell
      remains present even though the residual `data-type="menu"` overrides the addressing marker.
- [x] The Menu story and representative application menus preserve placement, search, keyboard
      navigation, submenus, outside click, Escape, selection, focus restoration, icon rendering,
      and disabled/group/minor styling. Equal-key fresh `items` arrays retain row elements. The app
      popup menu remains behaviorally unchanged.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; no public barrel or package
      dependency is removed and no overlay-registry behavior is expanded.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Menu/Menu.tsx` | Thin public `mountVanilla` face; preserve React exports |
| `src/renderer/uikit/Menu/MenuModel.ts` | Shed three effects, preserve state/handlers, use native event types and guarded model transitions |
| `src/renderer/uikit/Menu/MenuView.tsx` | New vanilla menu lifecycle, native DOM rows, InputView composition, Popover/content bridge, and recursive submenu ownership |
| `src/renderer/uikit/Menu/Menu.css` | Layered Menu layout, row, slot, and shell selectors |
| `src/renderer/uikit/Menu/attach-menu.ts` | `openMenu`, `MenuHandle`, and caller-owned attachment lifecycle |
| `src/renderer/uikit/Menu/WithMenu.tsx` | Drive `openMenu`; preserve render-prop and focus restoration; move Placement type import |
| `src/renderer/uikit/Menu/index.ts` | Preserve existing exports and expose the imperative attachment types/function |
| `src/renderer/uikit/Popover/PopoverView.tsx` | Only if needed for the explicitly chosen internal content-host seam; no public Popover prop change |
| `doc/epics/EPIC-055.md` | Record the final Rule 4 measurement and reconcile the current `WithMenu` measurement |
| `doc/active-work.md` | Link US-1006 to this task document |

No external `WithMenu` caller, `showAppPopupMenu`, `Poppers`, `overlayRegistry`, MenuItem public
shape, story property API, or package dependency is intentionally changed.

## Related work

- [EPIC-055 — De-React Epic C2](../../epics/EPIC-055.md)
- [US-1005 — Popover vanilla floating root](../US-1005-popover-vanilla-floating-root/README.md)
- [US-998 — Tooltip attachment on `@floating-ui/dom`](../US-998-tooltip-attachment/README.md)
- [US-996 — Vanilla UIKit contracts and React compatibility](../US-996-vanilla-uikit-contracts/README.md)
- [US-987 — KeyedList and SubtreeSwap](../US-987-structural-helpers/README.md)
- [US-992 — Vanilla UIKit authoring guide](../US-992-vanilla-view-authoring/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
