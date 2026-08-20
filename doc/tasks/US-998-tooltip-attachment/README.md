# US-998: Make Tooltip attachment-based with `@floating-ui/dom`

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-054 - De-React Epic C1: Foundation and primitives](../../epics/EPIC-054.md)
**Created:** 2026-08-20

## Goal

Replace Tooltip's React-owned floating lifecycle with a reusable `attachTooltip(trigger,
options)` DOM helper built on `@floating-ui/dom`. Preserve the existing `<Tooltip>` React
signature and behavior while making the attachment seam ready for US-999's vanilla Button,
IconButton, and TruncatedText views.

This task does not convert those consumers or change their public props. It also removes the
unused `react-tooltip` package and makes `@floating-ui/dom` an explicit direct dependency.

## Background

### Current implementation

`src/renderer/uikit/Tooltip/Tooltip.tsx` currently:

- accepts `children: React.ReactElement` and uses `cloneElement` to add a merged ref and the
  mouse/focus/keyboard handlers;
- keeps `open`, the singleton id, timers, and trigger ref in local React state/refs;
- uses `@floating-ui/react` with `strategy: "fixed"`, `offset`, `flip`, `shift({ padding: 4 })`,
  and `autoUpdate`;
- portals an Emotion-styled `[data-type="tooltip"]` root to `getOverlayLayer()`;
- coordinates singleton visibility through `tooltipRegistry` and suppresses tooltips through
  `overlayRegistry` and the document-level drag listeners in that registry.

The current floating root has these observable values:

```tsx
<Root
    data-type="tooltip"
    data-name={name}
    data-placement={actualPlacement}
    role="tooltip"
    style={{ ...floatingStyles, zIndex: 1100 }}
>
    {content}
</Root>
```

The DOM helper must retain the fixed positioning, z-index, placement attributes, selectable
content, hover-persistence behavior, and the overlay-layer location. Positioning is asynchronous:
`computePosition()` may resolve after the tooltip has closed or the attachment has been disposed,
so every position result needs an owner/generation guard.

### Current inventory

The current-tree production scan (`rg -n '<Tooltip\b' src/renderer --glob '*.tsx'`, excluding the
Tooltip implementation and stories, then removing comment matches) finds **11 direct JSX
attachments in 10 files**:

| Consumer | Direct uses | Notes |
|---|---:|---|
| `uikit/Button/Button.tsx` | 1 | Internal self-wrapping path; unchanged in this task |
| `uikit/IconButton/IconButton.tsx` | 1 | Internal self-wrapping path; unchanged in this task |
| `uikit/TruncatedText/TruncatedText.tsx` | 1 | Overflow-controlled content; unchanged in this task |
| `uikit/Tree/TreeItem.tsx` | 1 | `SlotText` content; unchanged in this task |
| `uikit/ListBox/ListItem.tsx` | 1 | Custom show delay; unchanged in this task |
| `ui/sidebar/FolderItem.tsx` | 1 | Indirect sidebar row surface; unchanged in this task |
| `ui/secondary-views/SideBarPanelHeader.tsx` | 1 | Nested button-like trigger; unchanged in this task |
| `ui/tabs/PageTab.tsx` | 2 | Pinned marker and title label; one content-disabled path |
| `editors/browser/BrowserDownloadsPopup.tsx` | 1 | Trigger subtree is a `Panel`, not a primitive root |
| `editors/link-editor/panels/LinkCategoryPanel.tsx` | 1 | Rich React tooltip content |

`Tooltip.story.tsx` is the Storybook-only caller. Tree/ListBox/sidebar `tooltip` props and
`getTooltip` accessors are indirect APIs implemented by their existing row components; they are
not changed here. The epic's earlier aggregate `Tooltip` reference count is not used as the
implementation boundary; this table is the reproducible direct-JSX inventory for the current
checkout.

### Existing framework-neutral pieces

`src/renderer/uikit/shared/overlayLayer.ts` already creates the stable, unstyled
`#persephone-overlay-layer` host. `overlayRegistry.ts` already provides synchronous overlay
suppression, and `tooltipRegistry.ts` already provides singleton ownership, innermost-tooltip
precedence, and document-level drag suppression. These modules must remain unchanged and be called
directly by the new attachment; no React subscription wrapper or second registry is needed.

`fillSlot` from US-996 is the content seam:

- strings use `textContent`;
- a DOM `Node` is adopted;
- other React-node values use the temporary React root and its generation-safe disposer.

That transitional React arm is required for the one rich production content caller and for the
existing Tooltip story. It is not a new callback, descriptor, or icon protocol.

### Dependency state

`@floating-ui/dom` is already present transitively through `@floating-ui/react` and `react-tooltip`,
but is not declared directly in `package.json`. It resolves to **1.8.0** today through
`@floating-ui/react@0.27.20`; declare the direct dependency as `^1.8.0` rather than installing a
new latest version. `react-tooltip` has **zero source importers** and is only a package dependency
today. `@floating-ui/react` has six import sites today, including Tooltip; five import sites
remain after this task, across four components (`Popover` and `PopoverModel`, `WithMenu`,
`BrowserTabsPanel`, and `showPopupMenu`). It must remain installed.

### Deliberate C1 shape exception

C1 normally gives every converted component a `VanillaView` and `mountVanilla` face. Tooltip is the
intentional exception: it does not own the trigger root. Its vanilla face is `attachTooltip`, which
registers behavior on an existing `Element` and owns only the generated floating root. Creating a
fake `TooltipView` root would add an extra DOM node and make the helper unusable by a vanilla Button
that already owns its root.

The React face remains a thin React adapter: it clones the child only to merge its ref, then calls
`attachTooltip` after commit. Native listeners installed by the attachment provide tooltip behavior;
the child's existing React handlers remain on the child and are not replaced or double-chained by
the wrapper.

## Implementation plan

### 1. Add the attachment contract

Create `src/renderer/uikit/Tooltip/attach-tooltip.ts`:

```ts
export interface TooltipOptions {
    content: SlotContent;
    placement?: Placement;       // @floating-ui/dom, default "top"
    offset?: [number, number];   // [cross-axis, main-axis], default [0, 8]
    delayShow?: number;          // default 800
    delayHide?: number;          // default 100
    disabled?: boolean;
    name?: string;
}

export function attachTooltip(trigger: Element, options: TooltipOptions): {
    update(options: TooltipOptions): void;
    dispose(): void;
};
```

The attachment owns one instance id, its show/hide timers, native listeners, registry
subscriptions, the floating root, the `fillSlot` content disposer, and the `autoUpdate` cleanup.
`dispose()` is idempotent and removes all of those resources. It does not detach the caller-owned
trigger.

Use native `mouseenter`, `mouseleave`, `focusin`, `focusout`, and `keydown` listeners. `focusin`
and `focusout` are the bubbling equivalents of React's `onFocus` and `onBlur`; plain native
`focus`/`blur` would miss focus moving into a descendant of a composed trigger. Keep native
`mouseenter`/`mouseleave`: React simulates its `onMouseEnter`/`onMouseLeave` pair, while native
`mouseenter`/`mouseleave` already provide the required non-bubbling boundary behavior. Preserve
the current behavior:

- show is scheduled on enter/focus after `delayShow` unless disabled, content is nullish/false,
  an overlay suppresses the trigger, or a native drag is active. Check suppression both when the
  timer is scheduled and again when it fires: an overlay may open during the 800ms/1500ms delay;
- hide is scheduled after `delayHide` on leave/focusout;
- Escape closes an open tooltip and clears timers;
- entering the floating root clears its hide timer, and leaving it schedules the same hide delay,
  so rich content remains selectable while hovered;
- a newly opened tooltip claims `tooltipRegistry.open(id, trigger, close)` and loses immediately
  when a more-specific active tooltip already owns the slot;
- an overlay or drag notification closes an open tooltip and cancels pending timers.

The wrapper must guard every timer callback and every asynchronous positioning callback after
`dispose()`. A disposed attachment must never append a root, set styles, call `fillSlot`, or
reclaim a registry slot.

### 2. Build and position the floating root

When the tooltip opens:

1. Create a `div`, append it to `getOverlayLayer()`, and set `data-type="tooltip"`, optional
   `data-name`, `role="tooltip"`, and the requested `data-placement`.
2. Create one content region inside it, and call `fillSlot(contentRegion, options.content)`. Keep
   the generated root's event listeners outside that region so React content cannot replace the
   hover handlers.
3. Set the fixed-position/z-index contract (`position: fixed`, z-index `1100`) and call
   `computePosition(trigger, floating, { strategy: "fixed", placement, middleware })` with the
   same middleware semantics as today:
   `offset({ mainAxis: offset[1], crossAxis: offset[0] })`, `flip()`, and `shift({ padding: 4 })`.
4. On a successful, current result, write `left`, `top`, and the resolved `data-placement` to the
   floating root. Use a generation token so a result from an old root cannot mutate a replacement.
5. Start `autoUpdate(trigger, floating, reposition)` only while the root is open, and dispose it
   before removing the root on hide.

The root's static visual rules move from Emotion to
`src/renderer/uikit/Tooltip/Tooltip.css` under `@layer uikit`, using the existing app token
variables and fallbacks:

- background `var(--color-bg-default, ...)`, text `var(--color-text-default, ...)`, border
  `var(--color-border-default, ...)`, radius `var(--radius-md, 4px)`, font
  `var(--font-sm, 12px)`, and padding `var(--space-md, 8px)`;
- preserve the complete shadow declaration `0 2px 8px var(--color-shadow-default, ...)`, not
  just the shadow color token;
- `max-width: 360px`, `pointer-events: auto`, `user-select: text`, and
  `-webkit-app-region: no-drag`;
- fixed positioning and z-index are part of the attachment/root contract, not a caller style prop.

There is no existing renderer CSS rule targeting `[data-type="tooltip"]` or a global `svg`,
`button`, `input`, or `a` rule that reaches the floating root. The selector is functional as well
as diagnostic: `src/renderer/uikit/Popover/PopoverModel.ts:256` uses
`target?.closest('[data-type="tooltip"]')` to keep clicks inside a tooltip from being treated as
outside clicks. Keep `data-type="tooltip"` on the outer floating root and never put it on the
inner content region. Record that precondition and repeat the converted-component cascade check:
the root must not carry a stacking-context trigger beyond the deliberate fixed positioning/z-index
behavior, and the `@layer uikit` stylesheet must not lose an existing selector tie to an unlayered
rule.

### 3. Implement option updates and cleanup

`update(nextOptions)` must update the stored options without recreating the attachment or changing
the trigger. It must:

- update `data-name`, placement, content, delays, disabled state, and offsets;
- close immediately if the new content is null, undefined, false, or disabled while open;
- reuse the current floating root for an open content update. Call `fillSlot(contentRegion, next)`
  directly and retain its returned disposer: `fillSlot` reuses an existing React root for a
  React-to-React update and handles arm changes itself. Do not call the previous disposer before
  this update, or every rich-content change would destroy and recreate the nested root;
- reposition an open tooltip when placement or offset changes;
- apply new delay values to future timer scheduling and clear a pending timer if the new state
  suppresses the tooltip.

Use one attachment generation for the open root and one content disposer. On close, unregister the
tooltip id, dispose `autoUpdate`, clear timers, dispose the content slot, and remove the floating
root. The trigger stays untouched. On re-open, create a fresh root rather than retaining detached
DOM.

### 4. Rewire the React Tooltip face

Modify `src/renderer/uikit/Tooltip/Tooltip.tsx`:

- remove `@floating-ui/react`, `ReactDOM`, `styled`, local open state, timers, registry
  `useSyncExternalStore` calls, and the portal JSX;
- import `Placement` as a type from `@floating-ui/dom`, `SlotContent` from the shared slot module,
  and `attachTooltip` from the local attachment module;
- change `TooltipProps.content` from `React.ReactNode` to `SlotContent`, while keeping the
  `children: React.ReactElement<Record<string, unknown>>` contract and all option defaults;
- keep the React 19-safe child-ref access and merge the child's existing ref with the ref callback
  used to identify the trigger. The merged ref must continue to support object and callback refs;
- install `attachTooltip` in an effect after the trigger node is committed, update the existing
  attachment when options/content change, and dispose it on cleanup;
- clone the child with only the merged ref. Existing child `onMouseEnter`, `onMouseLeave`,
  `onFocus`, `onBlur`, and `onKeyDown` handlers must remain intact and must not be invoked twice;
  the native attachment listener intentionally runs before the child's delegated React handler.
  In particular, Escape closes the tooltip even if a child keydown handler stops propagation; this
  is the deliberate ordering difference from the old React wrapper, not a duplicate handler;
- return the cloned trigger whether or not a tooltip is currently open. The floating root is now
  owned by the attachment and is not part of the React return tree.

Keep `src/renderer/uikit/Tooltip/Tooltip.story.tsx` and every external JSX call site unchanged.
The story must still exercise plain text, rich React content, all placements, offset, delays, and
disabled behavior through the unchanged public signature.

### 5. Export the seam and update dependencies

- Export `attachTooltip` and `TooltipOptions` from `src/renderer/uikit/Tooltip/index.ts`.
- Export the same public attachment seam from `src/renderer/uikit/index.ts` so later vanilla
  component views can consume it without reaching into an implementation-only path. Existing
  `Tooltip` and `TooltipProps` exports remain.
- Add `"@floating-ui/dom": "^1.8.0"` to `package.json` as a direct dependency, using the version
  already resolved by the lockfile rather than installing latest.
- Remove `react-tooltip` from `package.json` and regenerate `package-lock.json`. Do not remove
  `@floating-ui/react`; its other six importers are outside this task's boundary.
- Verify the source has no `react-tooltip` importer and that `npm ls` still shows the DOM package
  through the root dependency and the React package's transitive graph.

### 6. Verify the attachment and the unchanged callers

Run `npm run typecheck`, `npm run lint`, and `git diff --check`. Do not add a unit-test harness.

In the Tooltip Storybook story and a running app smoke path, verify:

- all twelve placement choices, default and custom offsets, show/hide delays, and disabled mode;
- hover and keyboard focus both open the tooltip, Escape closes it, and moving from the trigger to
  the tooltip keeps rich content open long enough to select/copy it;
- flip/shift behavior near each viewport edge and repositioning after scroll/resize/layout change;
- singleton behavior, innermost nested-tooltip precedence, overlay suppression, and drag
  suppression;
- string, `null`, `false`, and rich React content, including the LinkCategoryPanel content;
- `data-type`, optional `data-name`, `role`, resolved `data-placement`, fixed position, z-index,
  and the static visual styling; confirm `data-type="tooltip"` is on the outer root so
  `PopoverModel.ts:256` still recognizes clicks inside the content;
- child DOM shape and caller handlers/refs remain unchanged at all direct call sites.

Use a `MutationObserver` over both `[data-type="live-preview"]` and
`#persephone-overlay-layer` for the named Button-tooltip interaction only as a diagnostic. US-996
already owns the React baseline and US-999 owns the final after-number; US-998 must not claim a
new Rule 4 after-number.

## Concerns / Open questions

1. **Tooltip is an attachment exception, not a `VanillaView`.** The trigger belongs to the caller,
   so a view with a second root would be the wrong ownership model. The attachment must therefore
   own its generated floating root, listeners, timers, and positioning cleanup, while the caller
   owns the trigger. This is deliberate and should remain documented for US-999.

2. **`computePosition()` and `autoUpdate()` are asynchronous/lifecycle-sensitive.** A tooltip can
   close, be replaced by another singleton tooltip, or be disposed before a position promise
   resolves. Generation and disposed guards are required; no async callback may resurrect or mutate
   an old floating root.

3. **Nested React content is a temporary React root.** `fillSlot` is the accepted C1 bridge for
   rich content. The attachment must reuse the root for React-to-React updates, dispose the slot
   before removing the floating root, and never let a stale content disposer clear a newer value.
   Later editor/component epics remove the React arm from their call sites; US-998 must not invent
   a second content protocol.

4. **Registry subscriptions replace React re-render subscriptions.** `overlayRegistry` and
   `tooltipRegistry` are synchronous DOM-native registries. The attachment subscribes while alive
   and unsubscribes on disposal; it closes immediately when suppression changes. Do not modify the
   registries or add a React-specific adapter just to support Tooltip.

5. **Native listener ownership must not double-call child handlers.** The React face should clone
   only the child ref. The child's React handlers continue to be dispatched by React, while the
   attachment's native handlers independently manage tooltip state. Each caller handler still runs
   once, but the ordering intentionally changes: the native attachment listener runs at the trigger
   before React's delegated handler. Escape therefore closes the tooltip even when a child keydown
   handler calls `stopPropagation()`; this is an accepted hardening, not duplicate invocation.

6. **The fixed/layered CSS precedence is a real conversion boundary.** The current tooltip styling
   is Emotion and therefore unlayered. The new `Tooltip.css` is in `@layer uikit`, so verify that no
   unlayered global or caller descendant rule reaches the tooltip root/content and that the new
   `position: fixed`, pointer behavior, and z-index are not accidentally reset.

7. **Content suppression semantics must stay exact.** `null`, `undefined`, and `false` suppress
   the tooltip; an empty string is not included in the current suppression condition and therefore
   remains an empty-but-open tooltip when triggered. Row components may separately reject empty
   strings, but the generic Tooltip contract should not silently change.

8. **Dependency wording must not remove live Floating UI users.** `react-tooltip` is dead and can
   be removed. `@floating-ui/react` has six import sites before this task and five afterward: the
   two Popover files, WithMenu, BrowserTabsPanel, and showPopupMenu. It remains a direct dependency
   until later epics migrate those consumers. The direct DOM dependency is pinned to `^1.8.0`.

## Acceptance criteria

- [ ] `attachTooltip(trigger, options)` and `TooltipOptions` exist, are exported, and own native
      listeners, timers, singleton/overlay subscriptions, the floating root, content slot,
      `autoUpdate`, and all cleanup through an idempotent `dispose()`.
- [ ] The attachment uses `@floating-ui/dom` with fixed strategy, offset/flip/shift behavior,
      guarded async positioning, and an auto-update cleanup active only while open.
- [ ] Tooltip preserves hover/focusin/focusout/Escape behavior, tooltip-root hover persistence, singleton
      and innermost-wins rules, overlay/drag suppression, content semantics, name/placement/role
      attributes, z-index, and overlay-layer placement.
- [ ] The React `<Tooltip>` face keeps its public props and child DOM shape, clones only to merge
      the ref, preserves existing child handlers/refs, and delegates floating behavior to one
      attachment without a React portal or `@floating-ui/react` import. The intentional native-before-
      React handler ordering is documented and Escape remains effective through child
      `stopPropagation()`.
- [ ] Tooltip styling is moved to `Tooltip.css` under `@layer uikit` with token variables and
      fallbacks; no conflicting unlayered selector or global element rule changes the floating root.
- [ ] React-to-React content updates reuse one slot root; arm changes and disposal clean the old
      content and never allow a stale disposer or async positioning callback to affect a newer root.
- [ ] `@floating-ui/dom@^1.8.0` is a direct dependency, `react-tooltip` is removed from package manifests
      and the lockfile, and `@floating-ui/react` remains for its live consumers.
- [ ] The Tooltip story and production smoke checks cover text/rich content, all placements,
      delays, focus/Escape, viewport flipping, scroll/resize repositioning, singleton behavior,
      suppression, and cleanup; `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [ ] No Button, IconButton, TruncatedText, TreeItem, ListItem, FolderItem, PageTab, or other
      external Tooltip call site is migrated in this task, and no unit-test harness is added.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Tooltip/attach-tooltip.ts` | New framework-neutral attachment, floating root, timers, and cleanup |
| `src/renderer/uikit/Tooltip/Tooltip.tsx` | React ref adapter delegating to `attachTooltip`; remove React Floating UI/portal/Emotion state |
| `src/renderer/uikit/Tooltip/Tooltip.css` | Layered static stylesheet for the floating root |
| `src/renderer/uikit/Tooltip/index.ts` | Export attachment types and helper |
| `src/renderer/uikit/index.ts` | Export attachment types and helper for later vanilla views |
| `package.json` | Add direct `@floating-ui/dom@^1.8.0`; remove `react-tooltip` |
| `package-lock.json` | Reflect the dependency change |
| `doc/epics/EPIC-054.md` | Link US-998 task document |
| `doc/active-work.md` | Link US-998 under EPIC-054 |
| `doc/tasks/US-998-tooltip-attachment/README.md` | This task plan |

`tooltipRegistry.ts`, `overlayRegistry.ts`, `overlayLayer.ts`, `Tooltip.story.tsx`, and all
external call sites are intentionally unchanged.

## Related work

- [EPIC-054 - De-React Epic C1](../../epics/EPIC-054.md)
- [US-996 - vanilla UIKit contracts and React baseline](../US-996-vanilla-uikit-contracts/README.md)
- [US-997 - DOM icon path](../US-997-dom-icon-path/README.md)
- US-999 - Button cluster and Rule 4 after-number (the next task in EPIC-054)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [Overlay layer](../../../src/renderer/uikit/shared/overlayLayer.ts)
- [Tooltip registry](../../../src/renderer/uikit/shared/tooltipRegistry.ts)
