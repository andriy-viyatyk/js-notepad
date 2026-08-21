# US-1009: `Progress` — vanilla overlay, first story, and `Panel` eviction

**Status:** Implemented

**Priority:** High

**Epic:** [EPIC-055 — De-React Epic C2: Floating layer and composites](../../epics/EPIC-055.md)

**Created:** 2026-08-21

## Goal

Move the root-mounted `ProgressOverlay` from Emotion/React rendering to the vanilla view
infrastructure while preserving the existing `progressModel` and `app.ui` APIs. Add the missing
Storybook verification surface, and remove the `Progress` path's `Panel` dependency without
attempting to remove `Panel` from `uikit` entirely — `Autocomplete` remains a C3 consumer.

The conversion must preserve the three modes and their priority (`notification` over `progress`
over `locked`), the 300 ms delayed progress behavior owned by `progressModel`, blocking and
non-blocking pointer behavior, title-bar drag region, labels, spinner, positioning, and theme
appearance.

## Background

### Measured surface

`ProgressOverlay` has one production mount, in `src/renderer/index.tsx:14`, and no direct
production JSX callers. Its state is driven by the singleton `progressState` in
`src/renderer/uikit/Progress/progressModel.ts`. The public entry points are:

- `createProgress()` / `showProgress()` for delayed, promise-backed progress;
- `notifyProgress()` for a brief non-blocking message;
- `addScreenLock()` / `removeScreenLock()` for a blocking lock;
- the corresponding `app.ui` methods in `src/renderer/api/ui.ts`.

The model owns IDs, timers, promise cleanup, label mutation, notification dismissal, and lock
retention. This task must not create a second store, move timers into the view, or change the
public return values. The view subscribes to `progressState` and only projects its current state
into DOM.

The current `ProgressOverlay.tsx` contains three Emotion overlay regions plus one
prop-interpolated Emotion pill:

- `Root`: absolute, full-window, `z-index: 200`, `pointer-events: none`;
- `HeaderBlock`: top 32 px, right 130 px, overlay background, pointer-events enabled, and
  `-webkit-app-region: drag`;
- `ContentBlock`: the remaining full-window area, overlay background, pointer-events enabled.

The two visible pills are `Panel` compositions. The notification pill is centered at
`HEADER_HEIGHT + 20` (52 px), with dark background, `rounded="lg"`, shadow, horizontal padding
`xl` (16 px), vertical padding `md` (8 px), and centered content. The progress pill is centered at
`HEADER_HEIGHT + 40` (72 px), is pointer-interactive, uses a row layout with `gap="lg"` (8 px),
dark background, `rounded="lg"`, shadow, horizontal padding `xl`, and vertical padding `lg`
(12 px). It contains a size-18 `Spinner` and a `Text` label. The locked mode has the header and
content blockers but no pill.

### Expected DOM and mode behavior

The vanilla adapter needs a stable root even while the model is empty. The empty root must be
layout-transparent; an active root must regain the existing absolute overlay behavior:

```text
div[data-type="progress-overlay"][data-name?]                 // always owned by the view
  div[data-part="mode"]                                      // display: contents branch root
    div[data-part="pill"]                                    // notification mode
      span[data-type="text"][data-variant="default"]       // message

or

  div[data-part="mode"]                                      // display: contents branch root
    div[data-part="header"]                                  // blocking modes
    div[data-part="content"]
    div[data-part="pill"][data-clickable]                    // progress mode only
      span[data-type="spinner"]                              // progress mode only
      span[data-type="text"][data-variant="default"]
```

The extra `data-part="mode"` root is owned by `SubtreeSwap` and must be `display: contents`; it
must never become a positioned or transformed containing block. The overlay root carries the
current `data-mode` (`notification`, `progress`, or `locked`) and is `display: none` when the
model is empty. When a mode is active it is `display: block; position: absolute; inset: 0;
z-index: 200; pointer-events: none`, matching the current root. A single `SubtreeSwap` keyed by
`"notification" | "blocking"` owns the notification branch or the shared header/content branch;
the progress pill is an inner conditional of the retained blocking branch, so progress ↔ locked
does not repaint or recreate the full-window blockers. Changes to the current
notification/progress label update the retained branch and do not move the pill.

Consecutive notifications deliberately reuse the notification branch and update its text rather
than keying it by `mode + item.id`. The old React root used `key={item.id}`, but this pill has no
entry animation and no behavior depends on a remount, so the smaller DOM churn is an accepted
conversion difference.

The mode selection is intentionally the current React order:

1. if `notifications.length > 0`, show the first notification and no blocker;
2. otherwise, if `items.length > 0`, show the first progress item, with header/content and pill;
3. otherwise, if `locks.length > 0`, show only header/content;
4. otherwise clear the branch and leave the stable root inert.

All values in this table are model values, not new view state. In particular, an all-error burst
may retain more than three model items, while the overlay still shows only the first visible item.

### Existing converted dependencies and conventions

- `VanillaView`, `SubtreeSwap`, and `mountVanilla` are the established Epic B/C2 lifecycle
  primitives. The view must own its branch and `SpinnerView` directly; it must not create a
  nested React root for either `Spinner` or the text label.
- `Spinner` is already a vanilla face. Construct a `SpinnerView` child for the progress pill and
  update it only when the progress branch is retained.
- `Text` has no separate vanilla view, but `resolveTextAttributes()` and `applyTextAttributes()`
  are exported from `uikit/Text/text-style.ts`. Use them to produce the same `data-type`,
  `data-variant`, `data-color`, and `data-size` attributes rather than hand-maintaining a subset.
- `Panel.css` is already static, but the `Progress` conversion must reproduce only the exact
  layout properties used here. Do not create a generic vanilla Panel or copy unrelated Panel
  state rules into `Progress.css`.
- `style-layers.css` establishes `@layer base, uikit, app, editor`. The new stylesheet belongs in
  `@layer uikit`, like the other converted C2 components.
- A direct vanilla view import does not pull styles from a React face: `SpinnerView` does not
  import `Spinner.css`, and `applyTextAttributes()` does not import `Text.css`. The view must
  import every stylesheet whose DOM contract it borrows (`Progress.css`, `../Spinner/Spinner.css`,
  and `../Text/Text.css`) explicitly. This also exposes a small US-1008 follow-up: add direct
  `../Text/Text.css` and `../IconButton/IconButton.css` imports to `NotificationView.tsx`, whose
  current direct-view import graph relies on unrelated React faces to load those styles.

## Implementation plan

### 1. Capture the pre-conversion exposure and structural hazards

- Confirm the one root mount in `src/renderer/index.tsx` and re-run the complete production scan
  for `ProgressOverlay`, `progressState`, and the five model API functions. Do not treat the
  Storybook story to be added in this task as an existing caller.
- Before editing, exercise the live application through the existing `app.ui` methods and record
  the current DOM/data attributes and computed geometry for notification, progress, and locked
  modes in both light and dark themes.
- Search ProgressOverlay and parent/global styles for direct-child combinators, `:empty`,
  `:nth-child`, `+`, `~`, descendant SVG rules, and any selector targeting
  `[data-type="progress-overlay"]`. The always-present vanilla root and the
  `display: contents` branch are real elements even when they generate no boxes; any changed
  selector match must be listed and verified rather than assumed away.
- Record the current `#root` relationship: `#root` is an absolute flex column and the overlay's
  active root is an absolute full-area sibling in that tree. The new root must not become a flex
  item when empty and must retain the current containing-block and z-index behavior when active.

### 2. Write the Progress Story before converting the only verification surface

- Add `src/renderer/uikit/Progress/Progress.story.tsx` with a small `ProgressDemo` control panel
  in the `Overlay` Storybook section. It should call the real `progressModel` APIs, not render a
  second `ProgressOverlay` and not mock its state.
- Provide repeatable, self-terminating controls for: a short `notifyProgress`, a promise lasting
  past the 300 ms threshold through `showProgress`, an updatable `createProgress` sequence, and a
  timed `addScreenLock`/release. Include an overlap action or clear instructions so notification
  precedence over progress and lock can be exercised. No control may require a second click to
  finish: the blocking content layer intentionally covers the Storybook buttons while active.
- Keep story-owned timers/lock handles cleaned up when the demo unmounts. A timed lock must not
  leave Storybook unusable if the user changes stories while it is active. The story may use
  React state for its own action log; that state is not ProgressOverlay state.
- Register the story in `src/renderer/editors/storybook/storyRegistry.ts`. Because the real
  `ProgressOverlay` is already mounted by `AppContent`, the story component is a control surface
  for that singleton rather than a second overlay instance.

### 3. Extract the overlay styles into `Progress.css`

- Create `src/renderer/uikit/Progress/Progress.css`, wrapped in `@layer uikit`.
- Translate the existing root, header, content, and pill styles to stable
  `[data-type="progress-overlay"]` / `data-part` selectors. Use `data-mode` only for finite
  mode state and keep the root's `data-name` for inspection, never styling.
- Make the empty root `display: none`. When `data-mode` is present, set
  `display: block; position: absolute; inset: 0; z-index: 200; pointer-events: none`; this is
  required because `display: contents` cannot simultaneously generate the positioned box needed
  by the active overlay. Keep `display: contents` only on the `data-part="mode"` ownership
  anchor.
- Keep `[data-part="mode"]` layout-transparent. The header and content parts remain absolute,
  pointer-enabled blockers with the exact 32 px header, 130 px system-button exclusion, overlay
  background, and `-webkit-app-region: drag` behavior. Keep `HEADER_HEIGHT = 32` and
  `SYSTEM_BUTTONS_WIDTH = 130` as named constants/comments beside the CSS literals so their
  Windows title-bar meaning is not lost.
- Keep the pill geometry exact: `position: absolute`, `top` supplied by the view, `left: 50%`,
  `transform: translateX(-50%)`; only the progress pill gets `pointer-events: auto`.
- Reproduce only the two Panel compositions used by the overlay: flex alignment/direction, gap,
  dark background, large radius, shadow, the two padding variants, and
  `display: flex; box-sizing: border-box` on both pills. Read colors and metrics through `var(--*)`
  tokens with the same fallbacks as the converted UIKit styles; do not copy Panel's unrelated
  border/disabled/reveal rules.
- Keep spinner and text selectors scoped to the progress overlay/pill. The text span must be
  created with `resolveTextAttributes({ size: "base" })` and therefore retain
  `data-variant="default"`, `data-color` omission/default behavior, and `data-size="base"`.

### 4. Convert `ProgressOverlay` to a vanilla view over the existing global state

- Add `src/renderer/uikit/Progress/ProgressOverlayView.ts` with a public constructor and a stable
  `div` root. Set `data-type="progress-overlay"` and `data-name`; import `Progress.css`,
  `../Spinner/Spinner.css`, and `../Text/Text.css` explicitly from the view module. Because
  `ProgressOverlayProps` contains only `name`, the root's `data-type` is a safe style hook: there
  is no residual HTML-attribute spread that can override it, and no private class hook is needed.
- In `onMount`, bind once to a selector returning `{ mode, label }`, where `mode` is derived in
  notification → progress → locked → empty order and `label` is the first visible label (or
  `undefined` for locked/empty). `compareSelection` structurally compares this plain object, while
  Immer creates a new first item when its label changes, so one synchronous projection drives both
  the root attributes and the branch update without a transient two-mode window.
- Use one `SubtreeSwap<"notification" | "blocking">`, cleared for empty state. The blocking
  branch owns the header and content blockers for both progress and locked modes; it adds/removes
  only the progress pill as the projected label changes. Each branch must be constructed detached,
  inserted by the helper, then mounted; disposal must remove the branch's `SpinnerView` child and
  its DOM listeners before the helper detaches the layout-transparent branch root.
- Implement a small native branch view that owns the header/content/pill DOM. For the progress
  branch, construct one `SpinnerView` child and update the label/text node in place. For the
  notification branch, update only the text node. Do not use `mountReact`, `fillSlot`, or a React
  fragment for these string/icon-only contents.
- Write the numeric pill `top` explicitly as CSS length (`52px` for notification and `72px` for
  progress) or through the existing CSS-length convention; do not leave the old Emotion
  interpolated `topPx` behavior implicit. Keep the `data-clickable` marker only on the progress
  pill and preserve its pointer behavior.
- Clear `data-mode` and the branch when state becomes empty. Do not return `null` from the adapter;
  the stable root remains present but must be visually and interactively inert.
- Keep `ProgressOverlayProps` and the public `Progress` exports unchanged. `progressModel.ts`,
  `src/renderer/api/ui.ts`, and `src/renderer/index.tsx` should not be redesigned or duplicated.

### 5. Evict `Panel` from this path and preserve the public surface

- Remove the `Panel` import and rendered Panel nodes from `ProgressOverlay.tsx`; the native branch
  owns the exact layout previously supplied by those two Panel instances.
- Keep `Spinner`'s public face and `Text`'s shared style resolver available to their other
  consumers. The Progress view may import `SpinnerView` directly and the text-style helpers
  directly; it must not route through React merely to reuse a converted primitive.
- Keep `src/renderer/uikit/Progress/index.ts`, `src/renderer/uikit/index.ts`, the `progressModel`
  API, `ProgressOverlayProps`, and the `app.ui` script-facing declarations unchanged unless an
  import path requires a mechanical export-preserving edit.
- Update the EPIC-055 tracking link to this task document. After this task's conversion, the
  remaining UIKit `Panel` consumers are `Autocomplete` (moved to C3) and `Toolbar` (owned by its
  later C2 task). Do not claim that this task removes `Panel` from `uikit` or that it evicts the
  `Toolbar` import early.

### 6. Verify the real root-mounted behavior

- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Open the new Progress story and exercise every action in both themes. Confirm it drives the
  application-root overlay rather than a second local instance.
- In the running app, verify: a fast promise never shows; a slow promise shows after 300 ms and
  disappears on resolve/reject; `createProgress` label changes update the retained pill; a
  notification takes precedence over progress and lock; a progress item takes precedence over a
  lock; releasing the lock clears the blocking mode; and repeated mode transitions do not leave
  stale branches, spinner nodes, listeners, or timers.
- Verify the header's drag region and the content blocker, that the notification remains
  interactive, and that the progress pill is the only interactive pill. Check the exact 32/130/52/72
  geometry and three root modes in browser snapshots.
- Compare before/after snapshots for `data-type`, `data-name`, `data-mode`, `data-part`, text,
  spinner, and ordering. Confirm the empty host has no box and does not change `#root` layout.
- Search the final `uikit/` production tree: `ProgressOverlay` has no `Panel` import, while the
  expected C3 `Autocomplete` import remains. Confirm no package dependency or root mount changed.

## Concerns / Open questions

1. **The only real verification surface is global.** There is no existing `Progress` story and no
   direct production JSX caller beyond the single root mount. A story that renders another overlay
   would test the wrong lifecycle, so the story must drive the singleton model and the app-level
   smoke pass is mandatory. Every story action must be self-terminating: the blocking content layer
   covers the story controls while active, so no action may depend on a second click to release it.
   Timed release and unmount cleanup are required to keep that failure recoverable.

2. **The adapter makes a root exist in the empty state.** React currently renders no
   `progress-overlay` element when all three arrays are empty. The planned root is a real DOM
   element, but `display: none` and the absence of `data-mode` make it boxless and pointer-inert.
   Verify parents for `:empty`, sibling, and stacking selectors before implementation; do not
   assume `display: none` makes the node disappear from DOM queries.

3. **Three-way priority is behavior, not just rendering.** `notifications[0]` currently hides
   both progress and locks, and `items[0]` hides locks. A naive subscription that creates
   independent branches can briefly show two modes during synchronous state notifications or can
   reveal a lock behind a notification. Derive one `{ mode, label }` projection and update one
   `SubtreeSwap` synchronously; preserve the model's existing priority and first-item selection.
   The swap has only `notification` and `blocking` keys so progress ↔ locked retains the shared
   full-window blockers.

4. **State timing and model-owned timers must stay separate.** `progressModel`'s 300 ms delay,
   notification timeout, and promise `finally` cleanup are the source of truth. The view must not
   add a second delay or timeout, and must tolerate a promise resolving while a different mode is
   visible. Verify rejection paths as well as resolve paths without changing the model's existing
   pass-through promise behavior.

5. **Layer demotion is global enough to require an external-selector check.** The old Emotion rules
   were unlayered; `Progress.css` will be in `@layer uikit`. Search renderer CSS/Emotion for rules
   reaching `[data-type="progress-overlay"]`, its descendants, `svg`, `span`, or the overlay's
   pointer/drag behavior. If a conflict exists, record the exact selector and verify the intended
   cascade; do not move the stylesheet outside the layer as a shortcut.

6. **The Panel wrapper supplied flex and token semantics that must be reproduced deliberately.**
   The new pill is not a generic replacement Panel. Its CSS must preserve the two exact padding
   variants, row/center/gap behavior, dark background, radius, shadow, and the `top` values, while
   avoiding unrelated Panel rules. Numeric `top` values must become valid CSS lengths (`px`), and
   removal of the old Panel must not remove `display: flex` or `box-sizing: border-box` from either
   pill or alter its intrinsic sizing.

7. **The SubtreeSwap branch root changes the DOM depth.** Both the overlay root and the branch root
   are real elements even when `display: contents` removes their boxes. The task must verify that
   no current selector depends on direct child identity, and that header/content/pill geometry is
   unchanged. The branch root must never receive `position`, transform, or z-index, or it could
   change the absolute-positioning containing block.

8. **`SpinnerView` and the text span are native children, not React slots.** This avoids nested
   roots and keeps C2's first root-mounted overlay fully vanilla, but it means the implementation
   must explicitly update the retained spinner/text branch and dispose the spinner before
   detachment. Do not replace the text attributes with a hand-written subset or use a React
   `Text`/`Spinner` element as a shortcut.

9. **Panel eviction has a precise boundary.** Before this task, after the Notification conversion,
   the remaining production UIKit `Panel` consumers are `Autocomplete`, `ProgressOverlay`, and
   `Toolbar`. After this task they are `Autocomplete` and `Toolbar`: `Autocomplete` remains
   intentionally in C3, while `Toolbar` is owned by its later C2 task. The EPIC-055 surface table's
   `3 → 0` target counts the full in-scope C2 conversions, not this task alone. This task must not
   pull C3 forward or alter `Autocomplete` or `Toolbar`'s import graph.

10. **The `data-type` root is safe here.** Unlike Popover and Dialog, `ProgressOverlayProps` is
    only `{ name?: string }`; it has no residual HTML attributes or `applyRestProps` path that can
    override `data-type="progress-overlay"`. Keep the stable data-type selector rather than adding
    a private class solely to defend against a caller that cannot exist.

## Acceptance criteria

- [x] `ProgressOverlay` is a thin `mountVanilla` face over a stable native view; its public props,
      `Progress` exports, `progressModel`, `app.ui` APIs, and the single root mount remain intact.
- [x] The native view binds directly to `progressState` and preserves the exact priority
      notification → progress → locked → empty, first-item selection, label updates, and model-
      owned timer/promise semantics.
- [x] One `SubtreeSwap` owns the mutually exclusive branch; branch roots are detached before mount,
      layout-transparent, disposed before helper detachment, and no nested React root is created;
      its keys are only `notification` and `blocking`, so progress ↔ locked retains the blockers.
- [x] `Progress.css` is layered under `@layer uikit`, uses the existing data-part vocabulary and
      token variables, preserves the root/header/content/pill geometry, writes numeric top values
      as valid pixel lengths, and uses `display: none` for empty versus `display: block` for the
      active positioned root. The mode anchor alone uses `display: contents`.
- [x] Empty state has an always-present but boxless/pointer-inert root; active notification,
      progress, and locked states retain the current overlay z-index, pointer behavior, drag
      region, and full-window geometry.
- [x] The notification and progress pills preserve the exact Panel-derived alignment, padding,
      gap, dark background, radius, shadow, labels, and size-18 spinner; the progress pill alone
      is interactive.
- [x] The first Progress Storybook story drives the real global progress APIs and exercises
      notification, delayed progress, label updates, lock/release, precedence, cleanup, and both
      themes without mounting a duplicate overlay; every action self-terminates and cannot strand
      the blocking overlay over its own controls.
- [x] `ProgressOverlayView.ts` explicitly imports `Progress.css`, `Spinner.css`, and `Text.css`;
      the same direct-view stylesheet rule is recorded in the UIKit authoring guide, and the
      US-1008 `NotificationView` follow-up imports `Text.css` and `IconButton.css` directly.
- [x] Storybook and running-app verification cover resolve/reject, fast/slow promises, repeated
      mode transitions, empty state, pointer/drag behavior, exact data attributes, and no stale
      DOM/timers/listeners.
- [x] `ProgressOverlay` no longer imports or renders `Panel`; `Autocomplete` remains the known
      C3 consumer and `Toolbar` remains for its own C2 task, with no unrelated import graph changed.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Progress/ProgressOverlay.tsx` | Thin public `mountVanilla` face; preserve `ProgressOverlayProps` and exports |
| `src/renderer/uikit/Progress/ProgressOverlayView.ts` | New native root, one `{ mode, label }` binding, two-key `SubtreeSwap`, branch lifecycle, native text and spinner composition; explicit dependency stylesheet imports |
| `src/renderer/uikit/Progress/Progress.css` | Layered overlay, blocker, pill, token, and mode styling |
| `src/renderer/uikit/Progress/Progress.story.tsx` | First global progress control story using the real model APIs |
| `src/renderer/editors/storybook/storyRegistry.ts` | Register the Progress story in the Overlay section |
| `src/renderer/uikit/Notification/NotificationView.tsx` | Small US-1008 follow-up: direct imports for the Text and IconButton styles used by its native DOM |
| `src/renderer/uikit/CLAUDE.md` | Document the direct-view stylesheet-import rule |
| `doc/active-work.md` | Link US-1009 to this task document |
| `doc/epics/EPIC-055.md` | Link US-1009 and correct the C2 Panel-consumer target |

No change is planned for `src/renderer/uikit/Progress/progressModel.ts`, `Progress/index.ts`,
`src/renderer/uikit/index.ts`, `src/renderer/api/ui.ts`, `src/renderer/api/types/ui.d.ts`,
`src/renderer/index.tsx`, `Panel.tsx`, `Panel.css`, `Spinner`, `Text`, package dependencies, or
the C3 `Autocomplete` surface.

## Related work

- [EPIC-055 — De-React Epic C2](../../epics/EPIC-055.md)
- [US-1008 — vanilla root-mounted notifications](../US-1008-notification-vanilla-alerts/README.md)
- [US-1003 — Panel static CSS](../US-1003-panel-css/README.md)
- [US-984 — Spinner CSS pilot](../US-984-spinner-css-pilot/README.md)
- [US-987 — structural helpers](../US-987-structural-helpers/README.md)
- [US-992 — vanilla view authoring](../US-992-vanilla-view-authoring/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
