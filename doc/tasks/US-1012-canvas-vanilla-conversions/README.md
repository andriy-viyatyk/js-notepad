# US-1012: `Minimap` and `ImageViewport` — canvas views and first stories

**Status:** Implemented

**Priority:** Medium

**Epic:** [EPIC-055 — De-React Epic C2 — Floating layer and composites](../../epics/EPIC-055.md)

**Created:** 2026-08-21

## Goal

Convert `Minimap` and `ImageViewport` from React/Emotion implementations to direct-DOM
`VanillaView` adapters while preserving their model APIs, DOM contracts, measurement behavior,
zoom/pan behavior, and existing editor integrations. Add deterministic Storybook surfaces before
the conversion so the two measurement-heavy components have a real before/after verification
baseline.

This task does not redesign the models, change the Markdown, SVG, Mermaid, or Image editor call
sites, or move `image-raster.ts`.

## Background

### Measured surface

The production surface is small and exact:

| Component | Production JSX sites | Existing story | Current implementation |
|---|---:|---|---|
| `Minimap` | 1 — `editors/markdown/MarkdownBody.tsx:249` | none | `Minimap.tsx` + `MinimapModel.ts` |
| `ImageViewport` | 3 — `editors/image/ImageView.tsx:66`, `editors/mermaid/MermaidBody.tsx:68`, `editors/svg/SvgBody.tsx:34` | none | `ImageViewport.tsx` + `image-raster.ts` |

Both components are already exported through their local indexes and `src/renderer/uikit/index.ts`.
Neither imports another UIKit component. `image-raster.ts` is already framework-free and remains
unchanged.

### Current Minimap behavior

`Minimap` renders a `div[data-type="minimap"]` with an optional `data-name`, then:

```text
div[data-type="minimap"][data-name?]
  div[data-part="content-container"]
    div[data-part="content"]
  div[data-part="indicator"][data-dragging?]
```

The root is a 120 px wide, full-height, vertically scrollable minimap. The model copies the
scroll container's `innerHTML` into the content mirror, observes child/subtree/character-data
changes, maps scroll position to the scaled mirror, and keeps the indicator synchronized. Clicking
the minimap seeks the main scroll container; pointer dragging the indicator captures the pointer and
seeks continuously. The indicator's `top` and `height` are dynamic inline values today.

The model currently registers one prop-dependent `effect()` in `init()` to defer
`setScrollContainer(this.props.scrollContainer)` through a microtask. The vanilla driver rejects
registered model effects, so this prop synchronization must become an explicit view update path.
The resize listener, `MutationObserver`, scroll listener, and pointer behavior remain model-owned.

### Current ImageViewport behavior

`ImageViewport` renders:

```text
div[data-type="image-view"][data-dragging?][tabindex="0"]
  img[src][alt][draggable="false"]
  div[data-part="zoom-indicator"]
    #text "NN%"
```

The root is a centered, flex-growing, overflow-hidden viewport. The image is deliberately allowed
to exceed the viewport and receives a dynamic transform:
`translate(xpx, ypx) scale(scale)`, with a transition unless dragging. The model owns fit-scale
calculation, image-load reset, wheel zoom, pointer/mouse panning, keyboard zoom/reset/copy
shortcuts, resize handling, and the exported `copyToClipboard()` command used by the Image,
Mermaid, and SVG toolbars.

The model registers one `effect()` keyed by `src`; it schedules a 50 ms image-complete check and
cleans up the previous timer. The React face also has a no-dependency `useEffect` that rechecks fit
scale after every state-driven render when the container has become visible. Neither behavior can
remain as a model effect under `createComponentModelDriver`: the source timer becomes a guarded,
view-owned timer, and the visibility recheck becomes the view's post-projection state-binding
reconciliation. No second state store or timer source is introduced.

`onModel` is a real public integration contract, not a React-only detail. The Image editor stores
the model for its copy command, and the Mermaid/SVG toolbar shells use it for the same purpose.
The driver must call the callback on mount and with `null` during disposal, as the current model
does.

### Existing styling and layer contract

The two roots are currently Emotion styled blocks in their component files:

- `Minimap.tsx` uses `color.minimapSlider.*` for the indicator and descendant selectors for the
  mirror/content/indicator structure.
- `ImageViewport.tsx` uses `color.background.default`, `color.background.overlay`,
  `color.text.default`, `radius.md`, `spacing.lg`, `spacing.sm`, `spacing.md`, and `fontSize.sm`.

The extracted styles belong in `@layer uikit`, using the existing `--color-*`, `--space-*`,
`--radius-*`, and `--font-*` variables with fallbacks. Dynamic image transform, minimap indicator
geometry, content-container height, and drag state remain DOM properties/styles because they are
runtime measurements rather than static styling.

### Epic-wide Rule 4 prerequisite

Rule 4 is the single C2 measurement defined by EPIC-055 C2-9: one context-menu-opening click, with
US-1005 responsible for the React baseline and US-1006 for the after-number. This task does not
substitute Minimap/ImageViewport measurements for that requirement. EPIC-055 Notes currently have
neither number even though US-1005 and US-1006 are implemented, so the epic cannot close until the
missing measurement debt is resolved. The after-number can be taken on the final tree; the React
baseline is recoverable in a throwaway worktree at `cdc12530`, the commit immediately before
US-1005, as documented during the US-1006 review.

## Implementation plan

### 1. Capture the pre-conversion baseline and write both stories first

- Before editing either component, capture settled React Storybook snapshots and computed geometry
  for both components in light and dark themes. Do not add a second Rule 4 measurement: the
  epic-wide context-menu baseline/after debt is tracked separately above and remains an epic-close
  prerequisite.
- Add `src/renderer/uikit/Minimap/Minimap.story.tsx` before changing `Minimap.tsx`. Its demo must
  create a real scrollable content element, pass that element through a callback ref/state to
  `Minimap`, provide enough repeated content to produce a visible mirror and scrollbar, and expose
  repeatable scroll, minimap-click, indicator-drag, mutation, resize, and empty-container cases.
  The story must exercise the real component/model contract rather than mocking `MinimapModel`.
- Add `src/renderer/uikit/ImageViewport/ImageViewport.story.tsx` before changing
  `ImageViewport.tsx`. Use a deterministic, self-contained image source (a small encoded SVG or
  equivalent asset) so the story works offline and does not depend on a user's filesystem or
  network. The story must make initial fit, wheel zoom, pointer pan, keyboard `+`/`-`/`0`, reset
  indicator, image-load, and copy-to-clipboard paths inspectable. Keep `onModel` out of the public
  story controls; it is an integration callback, not a visual prop.
- Register both stories in `src/renderer/editors/storybook/storyRegistry.ts` with
  `section: "Media"`. Follow the existing `Progress.story.tsx` shape: declare each demo as `Story`
  with props that fit the default `Record<string, unknown>` shape. `storiesBySection()` derives
  section headings from the declarations; no registry schema change or cast is needed.
- Do not modify the production components before the stories render the current React faces. The
  before snapshot must include root attributes, child ordering, dynamic styles, and computed
  geometry in both light and dark themes.

### 2. Extract the two Emotion roots into static layered CSS

- Create `src/renderer/uikit/Minimap/Minimap.css` with `@layer uikit` rules rooted at
  `[data-type="minimap"]`. Preserve the 120 px width, full-height overflow behavior, hidden
  scrollbar, flex shrink, mirror pointer/user-selection behavior, 0.15 scale geometry, indicator
  z-index, and hover/drag colors. Keep selectors scoped to the existing `data-part` vocabulary.
- Create `src/renderer/uikit/ImageViewport/ImageViewport.css` with `@layer uikit` rules rooted at
  `[data-type="image-view"]`. Preserve flex growth/alignment, overflow, background, grab/grabbing
  cursors, image transform origin/user-selection/unbounded sizing, and the zoom-indicator geometry,
  typography, token values, and hover behavior.
- Import each stylesheet from its direct vanilla view module, not only from the React adapter. A
  direct `MinimapView` or `ImageViewportView` import must bring its own CSS into the runtime module
  graph. The React face may retain a compatibility import if needed, but it must not be the only
  owner of the component's styles.
- Search the converted Emotion blocks and surrounding renderer styles for `>`, `:empty`,
  `:nth-child`, adjacent/general sibling selectors, or external rules targeting either data type.
  The current blocks use descendant/attribute selectors rather than direct-child layout contracts,
  but the check must be recorded before the new `VanillaHost` and view root add DOM elements.
- Compare computed values in both themes, not only the stylesheet text. The new CSS is layered and
  therefore has lower precedence than unlayered rules; any external rule that reaches the viewport,
  its image, or the minimap indicator must be identified and verified before the conversion is
  accepted.

### 3. Make the models framework-neutral and driver-compatible

- Remove the React-only event type import from `MinimapModel.ts` and accept native `PointerEvent`
  and `MouseEvent` values. Preserve `preventDefault`, pointer capture/release, `currentTarget`,
  indicator exclusion, and all scroll math exactly. The view owns listener registration; the model
  continues to own behavior and state.
- Remove the prop-dependent `effect()` from `MinimapModel.init()`. `init()` should retain only the
  window resize subscription; `MinimapView.onMount()` calls `setScrollContainer()` after all three
  mirror/root references exist, and `onUpdate()` calls it when the `scrollContainer` prop changes.
  Disconnection of the old observer and scroll listener remains in `setScrollContainer()` and
  disposal.
- Remove React-only event/style types from `ImageViewport.tsx`'s model section. Use native
  `MouseEvent` and `KeyboardEvent` handlers, and let the view project the model's numeric state
  directly to `image.style` rather than retaining a `React.CSSProperties` return type. Preserve the
  exported `ImageViewportModel` methods and the `copyToClipboard()` command used by all three
  editor integrations.
- Remove the `src`-dependent `effect()` from `ImageViewportModel.init()`. The view owns a single
  50 ms timer, cancels it on a new `src` and on disposal, and checks both `isLive` and the captured
  source before calling `handleImageLoad()`. This preserves the old cleanup and prevents a stale
  image completion from updating a replaced or disposed view.
- Keep the model's resize listener, wheel listener, fit-scale math, image-load state updates,
  `onModel` mount/dispose callbacks, and `dispose()` cleanup. The driver must mount only after the
  view has created the image and assigned the model's container/image references, because React's
  old ref callbacks were complete before its `useEffect` lifecycle ran.

### 4. Implement `MinimapView` and its thin adapter

- Add a public-constructor `src/renderer/uikit/Minimap/MinimapView.ts` extending
  `VanillaView<MinimapProps>`. Construct the model driver in the constructor and immediately
  register `this.own(() => this.driver.dispose())`; do not construct child DOM, listeners, or
  measurements there.
- In `onMount`, build the exact root/content-container/content/indicator structure, assign the
  model's three DOM references, apply root attributes and residual props, call `driver.mount()`
  only after all three references are assigned, then bind to the model state. The binding writes
  `data-dragging`, indicator `top`/`height`, and content-container height without introducing a
  second state copy. Numeric indicator and content-container values must be written with explicit
  `px` units because React's numeric style conversion is no longer present.
- Register native click, mouseenter, pointerdown, pointermove, and pointerup listeners with the
  view's lifecycle helpers. They call the model's native-event methods; all listeners must be
  removed on disposal. Route residual HTML attributes through `applyRestProps`, preserving the
  current `style`/`className` omission and recording that the sole production caller supplies no
  conflicting `onClick`/`onMouseEnter` handlers.
- In `onUpdate`, pump model props through the driver, update the `name` and `scrollContainer`
  projections, and keep the old observer/scroll attachment behavior when Markdown's callback ref
  changes between `null` and an element. Feed the driver only `{ scrollContainer }`, not the full
  public prop object; residual attributes belong to the view and must not churn model `oldProps`
  comparisons. The old model effect's microtask is intentionally removed: vanilla `onUpdate()`
  already runs after the DOM callback ref exists, so deferring again is redundant.

- Preserve the current residual-handler semantics: root `onClick` and `onMouseEnter` are model-owned
  before `...rest`, so a residual handler would replace them today; the sole production caller
  supplies neither. Route all other residual HTML attributes through `applyRestProps`.
- Replace `Minimap.tsx` with the public `mountVanilla(MinimapView, props)` adapter while keeping
  `MinimapProps`, local/index exports, and the root `data-type="minimap"` contract unchanged.

### 5. Implement `ImageViewportView` and its thin adapter

- Add a public-constructor `src/renderer/uikit/ImageViewport/ImageViewportView.ts` extending
  `VanillaView<ImageViewportProps>`. Construct the model driver in the constructor and register its
  disposal immediately with `own()`; keep the root detached until the adapter appends it and calls
  `mount()`.
- In `onMount`, create the root, image, and zoom-indicator nodes in the existing order; set the
  model's container/image references; write `data-type="image-view"`, `tabindex="0"`, `src`, `alt`,
  and `draggable="false"`; call `driver.mount()` only after both references are assigned; then
  register native mouse, `mouseleave`, double-click, keyboard, image-load, and non-passive wheel
  behavior through the view/model lifecycle. The
  model's `init()` still owns the wheel and window-resize subscriptions; do not register duplicate
  wheel or resize listeners in the view.
- Bind to the model state and project `data-dragging`, `image.style.transform`,
  `image.style.transition`, and the zoom percentage text. Keep those runtime values as direct DOM
  writes; they are dynamic measurements/state, not static CSS.
- The zoom indicator must retain `title="Reset Zoom"` and its click listener must call
  `resetView()`; the native title tooltip is part of the current DOM behavior.
- `ImageViewportProps` has no residual HTML attributes, no `name`, and no caller-reachable
  `data-type`/class styling hook. It therefore needs no `applyRestProps` path or private class hook.
- On prop updates, pump only `{ src, onModel }` through the driver, update `alt`, and assign the image
  `src` only when it changes. Re-run the guarded source-complete timer only for an actual source
  transition. Reproduce the old no-dependency visibility reconciliation after the DOM projection:
  when the viewport is visible and the model is still at fit scale, recalculate and reset only when
  the fit scale changed materially. Guard deferred work with `isLive` and clear it on disposal.
- Preserve `ImageViewportModel` identity and the `onModel` callback timing so ImageEditor,
  Mermaid, and SVG toolbars continue to call `copyToClipboard()` through the same model reference.
- Replace `ImageViewport.tsx` with the public `mountVanilla(ImageViewportView, props)` adapter and
  retain the existing `ImageViewportProps`, `ImageViewportModel`, local/index exports, and
  `image-raster.ts` behavior.

### 6. Verify both measurement-heavy components in real consumers

- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Re-run both stories in light and dark themes and compare the pre-conversion React snapshots with
  the vanilla snapshots. Check the semantic root/part attributes, child order, image source/alt,
  indicator text, dynamic styles, and computed dimensions.
- Exercise `Minimap` in its story and in Markdown: mirror updates after DOM mutations, main-pane
  scroll updates the indicator, minimap click seeks, indicator drag captures and releases the
  pointer, resize recalculates, mouseenter initializes an empty indicator, and replacing the
  scroll-container element disconnects the old observer/listener.
- Exercise `ImageViewport` in its story and in Image/SVG/Mermaid editors: image load fits without
  scaling above 100%, wheel zoom keeps the cursor point stable, drag pans, `+`/`-`/`0` and Ctrl+C
  work, the reset indicator works, source changes cancel stale timers, hidden containers do not
  produce invalid fit values, and all three `onModel` consumers receive mount/null disposal calls.
- Verify no listener, timer, `MutationObserver`, model subscription, or external model callback
  survives unmount. Verify an update after a source replacement cannot apply stale image dimensions
  or fit state.
- The final production scan must show the two React adapters as thin `mountVanilla` faces, no
  `useComponentModel` or `@emotion/styled` in either component implementation, and no changed
  production call-site props.

## Concerns / Open questions

1. **The stories must be written before the conversion.** Neither component has an existing story,
   and both depend on real layout/measurement rather than a static prop snapshot. A Minimap story
   that passes `null` forever would never exercise its observer or scroll math; an ImageViewport
   story that uses a remote image would make fit and load behavior nondeterministic. The plan uses a
   local scroll fixture and an encoded image so the baseline is repeatable.

2. **The model driver rejects effects by design.** `MinimapModel` and `ImageViewportModel` each
   register a prop-dependent `effect()`, so calling `driver.mount()` without shedding them throws.
   The plan moves those two responsibilities to explicit view update/timer paths. The
   ImageViewport no-dependency React effect is a separate view-render concern; it must be reproduced
   after the vanilla state projection, not disguised as a model effect or silently dropped. Because
   `resetView()` writes state and `TOneState.set()` notifies synchronously, queue this visibility
   reconciliation in a microtask with a pending flag and `isLive` guard, matching the deferred
   measurement pattern used by `AlertsBarView` in US-1008; do not re-enter the state binding
   synchronously.

3. **Mount order is measurement-critical.** The view must create and attach its semantic children
   and assign Minimap's three references and ImageViewport's container/image references before
   `driver.mount()`. A detached root or an uninitialized image reference makes
   `getBoundingClientRect()`, `clientHeight`, and `naturalWidth` report the wrong values. The
   `mountVanilla` adapter appends the view root before calling `mount()`, matching the layout-effect
   timing established in US-989; the driver constructor's optional DOM fields must not silently
   swallow this ordering requirement.

4. **Dynamic writes are deliberately still inline.** The conversion removes Emotion static rules,
   but it must not force runtime geometry into CSS selectors. Minimap indicator top/height,
   content-container height, and ImageViewport transform/transition are all state or measurement
   outputs. Verify that static CSS still owns the layout and colors while these direct writes retain
   valid CSS units and do not introduce a new style prop API.

5. **Native event types must preserve pointer semantics.** React's synthetic event types currently
   hide the conversion boundary in both models. Native events must retain `preventDefault()`,
   `currentTarget` pointer capture/release, the indicator hit-test, and keyboard `preventDefault()`
   behavior. ImageViewport has no pointer capture: its `onMouseLeave` → `handleMouseUp` path is
   what ends a drag when the pointer leaves the viewport. The event listeners belong to the view
   and must be registered with the same passive choice as the current wheel path (`passive: false`).

6. **`ImageViewport` has an external model-reference contract.** ImageEditor, Mermaid, and SVG
   retain a model reference for toolbar copy commands. The vanilla lifecycle calls `onModel(this)`
   only after the DOM and driver are mounted, and calls `onModel(null)` during disposal. A stale
   source timer or late image load must not call into a disposed model or leave the external
   reference pointing at a dead view.

7. **Layer demotion needs real-app checks.** The extracted rules move from unlayered Emotion to
   `@layer uikit`. The current source scan found no external rule targeting `data-type="minimap"`
   or `data-type="image-view"`, but generic ancestor/descendant rules and the image editor's
   layout still need checking in the running app. Verify both standalone Storybook layout and the
   Markdown, image, SVG, and Mermaid embedding contexts before accepting the lower cascade
   precedence.

8. **Minimap mirrors arbitrary DOM by design.** Its existing `innerHTML` copy also copies IDs,
   event-looking attributes, and potentially large subtrees into a pointer-disabled mirror. It also
   duplicates every ID in the Markdown content into the document, so duplicate-ID lookups are a
   pre-existing condition. This task preserves that established behavior and does not turn it into
   a sanitizer or a keyed DOM renderer; any such change would alter Markdown minimap rendering and
   belongs in a separate task.

9. **The adapter adds a React host element.** As with every C2 conversion, `mountVanilla` contributes
   a layout-transparent `div[data-...]` host around the semantic root. The story and real-consumer
   snapshots must verify that the host does not affect flex sizing, overflow, hidden-tab fit math,
   or the Markdown minimap's width/height relationship. The semantic child order inside each view
   must remain unchanged.

## Acceptance criteria

- [ ] Both new stories render the current React faces before conversion, with settled snapshots and
  computed geometry captured in light and dark themes.
- [ ] `Minimap.story.tsx` uses a real scroll fixture and `ImageViewport.story.tsx` uses a
  deterministic local image; both are registered in `storyRegistry.ts` and exercise the behavior
  listed in the plan.
- [ ] `Minimap` and `ImageViewport` expose the same public props, exports, model types, and
  production call-site behavior through thin `mountVanilla` adapters.
- [ ] Each view assigns all DOM references required by its model before `driver.mount()`:
  Minimap's wrapper/content-container/content-mirror and ImageViewport's container/image. Wheel
  zoom, minimap measurement, and initial synchronization work on first mount.
- [ ] Their models have no registered `TComponentModel.effect()` entries and no React-only event or
  style types; the vanilla driver mounts without throwing and owns all cleanup.
- [ ] The Minimap DOM structure, `data-type`, optional `data-name`, `data-part` names, mirror
  synchronization, indicator geometry, click seek, pointer drag, resize, and observer replacement
  behavior match the React baseline.
- [ ] The ImageViewport DOM structure, `data-type="image-view"`, `tabindex`, image attributes,
  zoom-indicator text/title/click reset behavior, image-load fit behavior, wheel/mouse/mouseleave/
  keyboard controls, source replacement, visibility reconciliation, clipboard command, and
  `onModel` lifecycle match the React baseline.
- [ ] Static rules live in `Minimap.css` and `ImageViewport.css` under `@layer uikit`, are imported
  directly by the vanilla views, and preserve both themes and all dynamic-token fallbacks.
- [ ] Runtime geometry is written only through the established direct DOM/style path: valid pixel
  values for minimap measurements and the existing transform/transition semantics for the image.
- [ ] Markdown, Image, SVG, and Mermaid consumers work without call-site changes; no model callback,
  timer, observer, wheel listener, pointer listener, or state subscription survives disposal.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/uikit/Minimap/Minimap.story.tsx` | New real scroll-container Storybook fixture |
| `src/renderer/uikit/ImageViewport/ImageViewport.story.tsx` | New deterministic image Storybook fixture |
| `src/renderer/editors/storybook/storyRegistry.ts` | Register both stories |
| `src/renderer/uikit/Minimap/Minimap.css` | New layered static stylesheet |
| `src/renderer/uikit/ImageViewport/ImageViewport.css` | New layered static stylesheet |
| `src/renderer/uikit/Minimap/MinimapView.ts` | New native DOM view and model-driver bridge |
| `src/renderer/uikit/ImageViewport/ImageViewportView.ts` | New native DOM view and model-driver bridge |
| `src/renderer/uikit/Minimap/Minimap.tsx` | Thin `mountVanilla` adapter; preserve public props |
| `src/renderer/uikit/Minimap/MinimapModel.ts` | Native event types; remove model effect; preserve behavior |
| `src/renderer/uikit/ImageViewport/ImageViewport.tsx` | Thin `mountVanilla` adapter and model effect/type cleanup |
| `doc/epics/EPIC-055.md` | Link this task document; the epic-wide Rule 4 debt remains a close prerequisite |
| `doc/active-work.md` | Link US-1012 under EPIC-055 |

`src/renderer/uikit/ImageViewport/image-raster.ts` is explicitly unchanged. No production editor
call site is expected to change.
