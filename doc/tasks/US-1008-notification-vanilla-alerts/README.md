# US-1008: `Notification`, `AlertItem`, and `AlertsBar` — vanilla root-mounted alerts

**Status:** Implemented

**Priority:** High

**Epic:** [EPIC-055 — De-React Epic C2: Floating layer and composites](../../epics/EPIC-055.md)

**Created:** 2026-08-21

## Goal

Move the root-mounted notification stack onto the vanilla view infrastructure while preserving
the public `Notification`, `AlertItem`, `AlertsBar`, `alertsBarModel`, and `app.ui.notify()` APIs.
The converted stack must retain severity styling, icons, close/click promise resolution,
auto-dismiss timing, three-alert capacity, alert stacking, measured heights, refs, and accessible
roles/live-region behavior. `src/renderer/index.tsx` remains unchanged.

## Background

### Current surface and ownership

The three files in scope are:

- `src/renderer/uikit/Notification/Notification.tsx` — the leaf notification. There are no
  production callers outside `AlertItem`; the Storybook story is its only independent visual
  caller.
- `src/renderer/uikit/Notification/AlertItem.tsx` — the absolutely positioned alert wrapper.
  There are no production callers outside `AlertsBar`.
- `src/renderer/uikit/Notification/AlertsBar.tsx` — the singleton `AlertsBarModel`, its global
  `TGlobalState`, and the root-mounted `AlertsBar` face. `src/renderer/index.tsx:15` mounts it
  once, while `src/renderer/api/ui.ts:53-55` calls `alertsBarModel.addAlert()` through the
  public `app.ui.notify()` API.

`AlertsBarModel` owns the durable data and promise lifecycle:

- each alert has `{ message, type, key, onClose }`;
- `addAlert()` appends the alert, removes the first non-error when the list exceeds three, logs
  errors, and resolves the returned promise when the alert closes;
- `alertTop()` stacks alerts from `height`, using 42 px for the first item and 8 px between items;
- `updateHeights()` seeds missing measurements at 40 px;
- `updateHeight()` writes a measured `scrollHeight` only when it changes.

The model is a `TModel<AlertsBarState>` over a `TGlobalState`, not a `TComponentModel`. The
vanilla view should bind directly to `alertsBarModel.state`; it must not introduce a component
model driver or move the global alert state into a second store.

### Existing DOM and behavior

Today `AlertItem` renders a `Panel` wrapper, then `Notification` renders the leaf:

```text
fragment
  div[data-type="panel"][data-direction="row"].panel-root
    style              // duplicated notification-slide-in keyframes, once per notification
    div[Emotion notification class][data-type="notification"][data-severity]
      span[data-part="icon"] > svg
      span[data-type="text"][data-variant="default"][data-size="base"][data-color="inherit"][data-pre-wrap]
      span[data-part="close"] > button[data-type="icon-button"]
```

The Panel wrapper receives `position="absolute"`, `top`, `right`, and `zIndex={1000}` as inline
styles. The notification root is a flex row with a severity-dependent background, text and
border color, a leading registry icon, optional close button, and the hand-written
`notification-slide-in` animation. `onClose` stops propagation before resolving the alert;
the body click resolves with `"clicked"` and the close action resolves without a value.

The proposed vanilla shape is intentionally explicit about the two C2-7 host boundaries:

```text
div[data-type="alerts-bar"] style="display: contents"
  div[data-type="alert-item"] style="position:absolute;top:…;right:…;z-index:1000"
    div.notification-root[data-type="notification"][data-severity]
      span[data-part="icon"] > svg
      span[data-type="text"][data-variant="default"][data-size="base"][data-color="inherit"][data-pre-wrap]
      span[data-part="close"] > button[data-type="icon-button"]
```

`alerts-bar` is a layout-transparent root because a `VanillaView` must own a stable element even
when there are no alerts. `alert-item` replaces the old `Panel` wrapper: it is a native positioned
element, not a UIKit `Panel` consumer. This is an intentional DOM-addressing change with no
visible box or layout change; the old wrapper is not addressed by CSS, automation, QA docs, or a
`data-name` today. The `Notification` root keeps its public `data-type`, severity, ARIA attributes,
parts, and message text; the private `notification-root` class prevents a residual attribute from
disabling its static style hook.

### Existing converted dependencies

- `VanillaView` provides stable roots, guarded `bind()`, FIFO cleanup, and child ownership.
- `mountVanilla` provides the stable React host and constructor/update lifecycle.
- `KeyedList` already implements duplicate-key validation, minimal-move reconciliation, update
  callbacks after insertion, and removal/disposal ordering. `SegmentedControlView` and
  `RadioGroupView` are the direct usage patterns.
- `IconButtonView` is already vanilla. The notification view should own it as a child rather than
  mounting a React `IconButton` subtree.
- `createIconElement()` is the DOM icon path. The four severity names (`info`, `success`, `warning`,
  `error`) and `close` are registered icons with DOM builders.
- `Text` is already static-CSS React output. The notification view calls the exported
  `resolveTextAttributes({ size: "base", color: "inherit", preWrap: true })` from
  `Text/text-style.ts`, writes all returned data attributes (including
  `data-variant="default"`), and appends the message as a text node. No React slot is needed for
  the string-only message, so the native path cannot drift from `Text.tsx`'s defaults.
- `Panel.css` must remain available for other C2 tasks, but this task must leave no `Panel`
  import under `uikit/` in the notification path.

## Implementation plan

### 1. Reconfirm the pre-conversion contract and selector hazards

- Re-run the production caller scan for `Notification`, `AlertItem`, and `AlertsBar`; preserve
  the story as the independent `Notification` verification surface and use the running app for
  `AlertsBar`.
- Scan the notification Emotion rules and all parent/descendant CSS for `>`, `:empty`,
  `:nth-child`, `+`, and `~`. The new `alerts-bar` and vanilla-host elements are layout-transparent
  but remain real DOM elements, and the `Panel` wrapper is replaced by `alert-item`.
- Check for selectors outside `Notification.tsx` that target notification data attributes,
  descendant SVGs, the old `panel-root`, or the close/icon parts. Any changed match must be named
  in the task diff; do not silently broaden a selector while extracting the styles.
- Capture Storybook snapshots for all four severities, with and without the close action, and
  capture an app-level alert stack through `app.ui.notify()` before editing. Record both themes,
  multiline messages, click resolution, close resolution, auto-dismiss, three-alert stacking,
  and a fourth alert/error-capacity case.

### 2. Extract Notification styling into `Notification.css`

- Create `src/renderer/uikit/Notification/Notification.css` under `@layer uikit`.
- Move the existing `notification-slide-in` keyframes unchanged; this is the grandfathered
  hand-written animation name from the styling conventions, not a new generated name.
- Translate the root flex layout, padding, border, radius, icon sizing, close positioning,
  clickable cursor, and all four severity blocks to the private `.notification-root` class plus
  the existing `data-severity`, `data-clickable`, and `data-part` selectors.
- Preserve source order and specificity for the severity rules, especially the close-button
  color and hover color selectors. Keep the full severity prefix on all eight close-button rules
  (four severities × normal/hover): `[data-severity="…"] [data-part="close"]
  [data-type="icon-button"]`. Do not flatten them to a source-order-only selector. Use the
  established token-variable form with fallbacks; do not hardcode theme colors. Keep the
  shadow/animation geometry exact.
- Before implementation, verify that no unlayered renderer rule reaches this component's root,
  icon SVG, or close `IconButton`; after conversion, repeat that check because `@layer uikit`
  loses to unlayered CSS regardless of selector specificity.

### 3. Convert Notification to a thin face and `NotificationView`

- Keep `NotificationProps`, `NotificationSeverity`, the severity icon map, ARIA role/live maps,
  and all public exports unchanged. Replace the Emotion implementation with
  `mountVanilla(NotificationView, props)`.
- Add `src/renderer/uikit/Notification/NotificationView.tsx` with a public constructor and a
  stable `div` root. Assign the private `notification-root` class in the constructor, then build
  the icon host, fixed Text-equivalent span, and optional close region in `onMount`.
- Use `createIconElement(SEVERITY_ICON[type])` for the four severity icons. Update the icon when
  `type` changes without introducing an icon descriptor or React slot protocol.
- Use a native `IconButtonView` child for the close action. Preserve the current
  `data-part="close"` wrapper and stop propagation before calling `onClose`; use `SubtreeSwap`
  keyed on `onClose ? "close" : null`, with the same close-branch ownership shape used by
  `DialogContentView`. Adding/removing `onClose` must not leave a stale button or an empty flex
  item.
- Attach the body click listener to the notification root, call the current `onClick` through
  `toPublicEvent`, and keep the close-button stop-propagation behavior. Residual event/attribute
  props continue through `applyRestProps` and `clearRestListeners`; preserve the current
  React-facing event shape and ref behavior with `bindRef`.
- Write component-owned `data-type`, severity, clickable, role, and live-region values on every
  update. Keep the existing residual-prop precedence documented in the source, while the private
  class remains the non-overridable style hook because `className` is omitted from the public type.
- Clear stale icon, close branch, ref, and residual listeners on dispose. Do not emit the old
  component-level `<style>` element; `Notification.css` is the sole animation owner.

### 4. Convert AlertItem and evict Panel from the notification path

- Keep `AlertData` and the existing `AlertItem` prop shape/ref type. Replace `AlertItem` with a
  thin `mountVanilla(AlertItemView, props)` face and add `AlertItemView.tsx`.
- Use a native `div[data-type="alert-item"]` as the view root. Write `position: absolute`,
  `top`, `right`, and `z-index: 1000` as explicit style properties, including clearing stale
  values on update. Do not import or render `Panel`.
- Construct and own one `NotificationView` child, append its root before mounting it, and update
  it in place when the alert data changes. Keep the alert item's forwarded `ref` bound to this
  positioned root so `scrollHeight` remains the measured alert height.
- Keep `display: flex` and `box-sizing: border-box` on the alert-item root: those are the only
  layout contributions the old `Panel` wrapper made here, and this is the element whose
  `scrollHeight` drives every stacking offset.
- Implement the existing auto-close table (`info`/`warning` 5 s, `success` 2 s, `error` 0 s)
  with one guarded timer armed when the keyed view mounts and cleared on dispose. The model's
  `AlertData.onClose` function and `type` are stable for an alert key, so no timer-reset machinery
  is needed for height or position updates.
- Keep click and close callbacks distinct: body click calls `data.onClose("clicked")`, close
  calls `data.onClose()`.

### 5. Convert AlertsBar to a global-state vanilla view with KeyedList

- Keep `alertsBarModel`, `AlertsBar`'s public export, and the `src/renderer/index.tsx` call site
  unchanged. Make `AlertsBar` a thin `mountVanilla(AlertsBarView, {})` face.
- Add `AlertsBarView` in `AlertsBar.tsx` or a co-located view module. Its stable root is the
  layout-transparent `div[data-type="alerts-bar"]`; it must not render a React fragment or a
  second React root per alert.
- Bind directly to `alertsBarModel.state` with two subscriptions: `state.alerts` drives a
  `KeyedList<AlertData, number, HTMLDivElement>`, and `state.height` updates the top position of
  existing item roots. Keep the selectors narrow so a height write does not rebuild the keyed
  alert list.
- Reconcile only `state.alerts.slice(0, maxAlerts)`, matching today's rendered cap even when
  multiple error alerts remain in model state. Create each `AlertItemView` detached, mount it,
  retain it by key for `update`/`remove`, and dispose it before the keyed root is detached.
- After the synchronous keyed reconciliation, unconditionally queue one microtask behind a
  live/disposed guard. In that pass, call `updateHeights()` as today, measure every visible root's
  `scrollHeight`, call `updateHeight()` only when it differs, and reapply `alertTop()` after the
  height writes. This avoids nested synchronous TOneState dispatch while preserving settled DOM
  measurement; it is not an exceptional fallback.
- Keep `updateHeights()`'s empty-list clearing behavior. Its 40 px seed is already the fallback
  used by `alertTop()` and is not independently load-bearing. Ensure the separate alerts and
  height bindings cannot rebuild the keyed list during the deferred measurement pass.
- Dispose the KeyedList and both bindings in the view's normal child-before-disposer order. The
  global model remains alive for future `app.ui.notify()` calls after the root view is remounted.

### 6. Preserve exports and verify the real exposure

- Keep `Notification/index.ts`, `uikit/index.ts`, and `api/ui.ts` public shapes unchanged. No
  package dependency, root entry, story prop definition, or caller rewrite is required.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- In Storybook, exercise the four severities, message wrapping/newlines, close visibility,
  body-click logging, animation remount, both themes, and the ref/DOM contract.
- In the running application, trigger `app.ui.notify()` with info, success, warning, and error;
  verify auto-dismiss durations, click/close promise results, alert stacking and reflow,
  error retention/capacity, and that no alert or timer survives disposal/navigation.
- Capture after-snapshots and compare `data-*`, ARIA, icon, text, order, and computed geometry
  against the pre-conversion captures. Specifically verify the intentional removal of the
  `Panel` wrapper and the inert `alerts-bar` host do not create a visible box or alter `#root`'s
  layout.

## Concerns / Open questions

1. **There is no AlertsBar story or independent production JSX caller.** The only reliable
   verification path for the stack is the running application through `app.ui.notify()`/`api.ui`.
   Storybook can verify `Notification`, but it cannot prove the global model, timer, stacking, or
   promise behavior. The app-level smoke pass is therefore mandatory, not a best-effort fallback.

2. **Evicting Panel changes the wrapper's data contract.** The current alert wrapper is a
   `data-type="panel"` root whose visual behavior comes from Panel's CSS plus inline positioning.
   Nothing in the renderer, automation, QA docs, or `data-name` inventory addresses that wrapper,
   so the proposed `data-type="alert-item"` native root is an intentional, contained addressing
   change. Preserve the position, z-index, child order, ref target, display/flex geometry, and
   scrollHeight; do not copy the entire Panel prop system or create a second generic layout
   primitive.

3. **The layout-transparent AlertsBar root is always present.** React currently returns `null`
   when there are no alerts; a vanilla adapter must still own a stable root. `display: contents`
   prevents a box, but the element can still affect `:empty`, sibling, and DOM-inspection logic.
   Before implementation, inspect the `AlertsBar` parent and global selectors for those patterns,
   then verify an empty bar is visually and interactively inert.

4. **Layer demotion can change notification precedence.** Emotion's old rules were unlayered;
   `Notification.css` will be in `@layer uikit`. Search for external rules reaching the notification
   root, descendant SVG, text span, or close button, and check the four severity states in both
   themes. Do not add global overrides or move the notification stylesheet outside the layer to
   hide a conflict.

5. **Conditional close ownership must not leak a button or a React root.** `onClose` may be added
   or removed during an update even though current callers do not toggle it. Use one owned branch,
   keep the wrapper's `data-part="close"` position, and make disposal idempotent. Do not use
   `fillSlot` for the close button: the icon button is already vanilla and a React bridge would
   add a needless root.

6. **Height measurement can notify the same global state that drives the list.** A synchronous
   measurement during the alerts binding would nest `TOneState`'s synchronous listener dispatch.
   Always defer one measurement/reflow pass with `queueMicrotask` behind a live/disposed guard.
   The height write cannot re-fire the alerts binding because the alerts array remains
   reference-equal under the selector comparison, but the deferred pass keeps notification order
   straightforward.

7. **The model can retain more than three errors.** `addAlert()` evicts a non-error when possible,
   so an all-error burst can exceed `maxAlerts`; the existing UI still renders only the first three.
   The view must key and measure the visible slice, not silently change the model's retention or
   promise semantics. Verify this explicitly with four error notifications.

8. **The containing block must remain unchanged.** Alert roots are absolutely positioned, and the
   current fragment leaves their containing block to the positioned ancestor around `#root`.
   `alerts-bar` and every `VanillaHost` between it and the alert items must remain
   `display: contents` and must never receive `position`, transform, or another containing-block
   property. Verify top/right geometry with a three-alert stack, not only a single notification.

## Acceptance criteria

- [ ] `Notification`, `AlertItem`, and `AlertsBar` preserve their public exports and props, while
      their implementation faces are thin `mountVanilla` adapters; `src/renderer/index.tsx` and
      `api.ui.notify()` remain unchanged.
- [ ] `NotificationView` preserves severity icon names, message text, `data-part` order, ARIA
      role/live values, body click and close propagation semantics, ref behavior, and the optional
      close button without a nested React root.
- [ ] The native message span is produced from `resolveTextAttributes({ size: "base", color:
      "inherit", preWrap: true })`, including `data-variant="default"`; no hand-maintained Text
      attribute subset is used.
- [ ] `Notification.css` is the sole notification style owner, is wrapped in `@layer uikit`,
      preserves the four severity rules and the exact `notification-slide-in` animation, and
      uses token variables with fallbacks; all eight severity-prefixed close-button selectors keep
      their specificity.
- [ ] `AlertItemView` has no `Panel` import or rendered Panel; its native positioned root keeps
      display/flex, top/right/z-index behavior, ref measurement target, alert order, and one
      mount-to-dispose auto-close timer.
- [ ] `AlertsBarView` binds directly to `alertsBarModel.state`, uses `KeyedList` over the visible
      alert slice, retains keyed roots across state updates, synchronously reconciles then performs
      one guarded microtask measurement pass, and reflows lower alerts when a measured height
      changes.
- [ ] Empty state is inert: the stable `data-type="alerts-bar"` host generates no layout box,
      no interaction, and no stale alert/timer; three-alert capacity and all-error retention match
      the existing model behavior.
- [ ] Storybook and the running app verify all severities, both themes, multiline text, animation,
      body click, close click, promise results, auto-dismiss, stacking/reflow, and disposal.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass, with no unrelated source,
      package, root-entry, or public API changes.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Notification/Notification.tsx` | Thin public `mountVanilla` face; preserve props/exports |
| `src/renderer/uikit/Notification/NotificationView.tsx` | New native notification view, icon/text/close composition, callbacks, refs |
| `src/renderer/uikit/Notification/Notification.css` | Layered notification layout, severity styles, and stable keyframes |
| `src/renderer/uikit/Notification/AlertItem.tsx` | Thin public `mountVanilla` face; preserve `AlertData`/props |
| `src/renderer/uikit/Notification/AlertItemView.tsx` | New native positioned alert wrapper and auto-close lifecycle |
| `src/renderer/uikit/Notification/AlertsBar.tsx` | Keep model, add `AlertsBarView`/KeyedList bindings, thin face |
| `src/renderer/uikit/Notification/index.ts` | Export preservation only if view/type paths require it |
| `src/renderer/uikit/index.ts` | Export preservation only; no public API redesign |
| `doc/active-work.md` | Link US-1008 to this task document |
| `doc/epics/EPIC-055.md` | Link US-1008 task document; retain Planned status until implementation |

No change is planned for `src/renderer/index.tsx`, `src/renderer/api/ui.ts`, the Notification
story, `Panel.tsx`, `Panel.css`, `IconButton`, `Text`, `AlertData` consumers, or package
dependencies. If `NotificationView` keeps its private close wrapper in the same module, no extra
public barrel export is needed.

## Related work

- [EPIC-055 — De-React Epic C2](../../epics/EPIC-055.md)
- [US-1007 — Dialog vanilla focus trap](../US-1007-dialog-vanilla-focus-trap/README.md)
- [US-997 — DOM icon path](../US-997-dom-icon-path/README.md)
- [US-996 — Vanilla UIKit contracts](../US-996-vanilla-uikit-contracts/README.md)
- [US-987 — KeyedList and SubtreeSwap](../US-987-structural-helpers/README.md)
- [US-992 — Vanilla UIKit authoring](../US-992-vanilla-view-authoring/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
