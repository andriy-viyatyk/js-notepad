# US-1005: `Popover` — vanilla floating root and the Rule 4 measurement

**Status:** Implemented
**Priority:** Critical
**Epic:** [EPIC-055 — De-React Epic C2: Floating layer and composites](../../epics/EPIC-055.md)
**Created:** 2026-08-20

## Goal

Replace `Popover`'s React/floating-ui implementation with a `VanillaView` floating root driven by
`@floating-ui/dom`, while preserving the existing React-facing props, portal target, DOM contract,
outside-click behavior, resizing, and direct-child content shape. Rewire the already-vanilla
`PathInputView` to own a `PopoverView` directly, and establish EPIC-055's Rule 4 measurement.

This task does not migrate `Menu`, `Select`, `MultiSelect`, `Autocomplete`, or any external caller.
Those components continue to use the unchanged `<Popover>` React-facing entry point after this
task.

## Background

### Current implementation

`src/renderer/uikit/Popover/Popover.tsx` currently:

- creates a `PopoverModel` through `useComponentModel`;
- calls `useFloating` on every render with `strategy: "fixed"`, `flip()`, the offset middleware,
  and a `size()` middleware that writes `maxHeight` and optional anchor-matched width;
- sends the floating refs and actual placement into the model during render;
- defers `refs.setPositionReference(placeRef)` to `useEffect` to avoid a render loop;
- returns `null` unless both `open` and an anchor (`elementRef` or `x`/`y` virtual position) exist;
- renders a styled `div` through `ReactDOM.createPortal(..., getOverlayLayer())`;
- forwards `ref`, the caller's `data-*`/ARIA/HTML attributes and handlers to the portalled root;
- renders children directly, followed by the optional resize handle.

`PopoverModel.ts` has two `TComponentModel.effect()` registrations:

1. `[props.open]` resets `manualSize` and the resize baseline when the popover closes.
2. `[props.open, props.outsideClickIgnoreSelector]` installs document-level `mousedown` and
   `keydown` listeners while open. The mousedown handler ignores clicks inside the floating root,
   inside `[data-type="tooltip"]`, or inside the caller-provided ignore selector. Escape calls
   `onClose`.

`createComponentModelDriver.mount()` rejects models with registered effects, so these effects must
be shed before the vanilla view can use the driver. `memo()` is not an effect and may remain for
the positioning reference and middleware.

### Measured production surface

There are 12 production `<Popover>` tags plus the Popover story. Six are UIKit-internal and six
are app/editor callers:

| Surface | Files | Important props/behavior |
|---|---|---|
| UIKit internals | `Menu/Menu.tsx`, `Select/Select.tsx`, `MultiSelect/MultiSelect.tsx`, `Autocomplete/Autocomplete.tsx`, `PathInput/PathInputView.tsx`, `AVGrid/filters/FilterPopover.tsx` | outside-click selectors, anchor matching, resize callbacks, virtual `x`/`y` positioning, React children |
| App/editor callers | `editors/board/BoardToolbar.tsx`, `editors/browser/BrowserDownloadsPopup.tsx`, `editors/browser/UrlSuggestionsDropdown.tsx`, `editors/file-diff/RevisionPicker.tsx`, `editors/grid/components/ColumnsOptions.tsx`, `editors/grid/components/CsvOptions.tsx` | six unchanged caller contracts; `onMouseDown`, `role`, `name`, fixed dimensions, and model callbacks |
| Verification | `uikit/Popover/Popover.story.tsx` | placement, offset, max height, long content, ignore selector, anchor width, resizing |

The production props use all of the meaningful branches: `elementRef`, virtual `x`/`y`,
`placement`, `offset`, `open`, `onClose`, `maxHeight`, `outsideClickIgnoreSelector`,
`matchAnchorWidth`, `resizable`, `onResize`, `scroll`, `name`, arbitrary attributes, and rich
React children. No caller passes `style` or `className`; the public type already omits them.

### Floating and adapter infrastructure already available

- `src/renderer/uikit/shared/overlayLayer.ts` creates/reuses the document-level
  `#persephone-overlay-layer` under `document.body` and intentionally has no styling.
- `src/renderer/uikit/shared/vanilla-view.ts` provides explicit lifecycle, FIFO disposal, child
  ownership, and guarded state bindings.
- `src/renderer/uikit/shared/subtree-swap.ts` owns one conditional detached-root branch, inserts a
  replacement before disposing the old one, and detaches its managed root after disposal.
- `src/renderer/uikit/shared/mount.tsx` provides `mountVanilla`, `mountReactHandle`, and the
  temporary React-subtree bridge. A direct React root can render a fragment into the floating root
  without adding a wrapper, and its root must be detached before a deferred unmount if disposal is
  triggered during another React commit.
- `src/renderer/uikit/shared/react-compat.ts` provides `applyRestProps`, `bindRef`, and the
  React-compatible event facade. Residual props, including `onKeyDown`, must be applied to the
  floating root rather than the logical adapter root.
- `src/renderer/uikit/Tooltip/attach-tooltip.ts` is the existing `@floating-ui/dom` precedent:
  `computePosition`, `autoUpdate`, fixed positioning, and the shared overlay host.

### DOM contract to preserve

The actual public root is the floating element appended to `#persephone-overlay-layer`, not the
empty logical `VanillaView.root` mounted at the caller's JSX location. The floating root must retain:

```text
div.scroll-container? [data-type="popover"] [data-name?]
  data-scroll?  data-placement="..."  data-resizable?  data-resized?
  position: fixed; z-index: 1000
  children...
  div[data-type="popover-resize-handle"][data-edge="top"|"bottom"]?
```

`data-scroll` and the `scroll-container` class exist only when `scroll` is true. The resize handle
is the final direct child when `resizable` is true. `data-name`, the caller's `ref`, residual
attributes, and residual event listeners all target the floating root. The logical root is only a
layout-neutral ownership/lifecycle anchor and must not receive those public attributes.

The existing overlay registry behavior is intentionally not expanded: `Popover` does not register
with `overlayRegistry` today, and making it suppress tooltips would be an unrelated behavior
change. Preserve the `[data-type="tooltip"]` outside-click exception in `PopoverModel`.

## Implementation plan

### 1. Establish the Rule 4 measurement procedure

The historical React baseline was intentionally waived by the user at epic closure. The final
measurement uses the `Menu` story because EPIC-055 C2-9 defines the measured interaction as one click
that opens a context menu and the `Menu` story exercises the real `WithMenu` → `Menu` → `Popover`
chain:

1. Open the Storybook `Menu` story with its default `small` variant. Do not change the story values.
2. Observe both `[data-type="live-preview"]` and `#persephone-overlay-layer` with identical
   `MutationObserver` options:

   ```js
   { subtree: true, childList: true, attributes: true, characterData: true }
   ```

3. Let the story settle, then reset one shared record counter immediately before clicking
   `Open menu` in the live preview. Count raw `MutationRecord` objects, not mutated nodes.
4. Allow the menu to mount and settle, then stop the observers and record the sum of the raw
   mutation-record counts from both roots. Do not count observer setup or the pre-click render.
5. Record the exact number and procedure in `doc/epics/EPIC-055.md` under `## Notes`; US-1006 owns
   the final measurement after both `Popover` and `Menu` are vanilla.

### 2. Shed `PopoverModel`'s two effects while the model still has its React face

Make the model compatible with `createComponentModelDriver` before changing the view:

- Move the close transition into `setProps`, using `this.oldProps` as the identity guard. When
  `open` changes from true to false, clear `manualSize` and `initialSize`; do not reset them on
  every prop pump while already closed.
- Move the document mousedown/Escape behavior into the open floating view's lifecycle. The view
  installs native listeners when its floating branch mounts and removes them when that branch
  disposes. The handlers read the model's current props, so changing
  `outsideClickIgnoreSelector` while open does not require a listener re-registration effect.
- Keep the exact inside-root, tooltip, ignore-selector, and Escape checks. Do not register with
  `overlayRegistry` as part of this task.
- Delete the dead `onOpenChange`, `setFloating`, `floatingRefs`, and `ExtendedRefs` bridge from
  `PopoverModel.ts`. `actualPlacement` remains and is assigned from the `computePosition` result;
  `internalRef`/`setInternalRef` remain because outside-click and resize logic use them.
- Change model event types from React pointer events to native `PointerEvent`. The model remains
  reusable by the React face during the transition; the old React face can pass `event.nativeEvent`
  until the face is replaced.
- Replace `@floating-ui/react` types and middleware imports in `PopoverModel.ts` with the matching
  `@floating-ui/dom` types/functions. Remove the React-only `ExtendedRefs`/`setFloating` bridge and
  the deferred position-reference responsibility. Keep `placeRef`, the offset mapping, `flip`, and
  the `size` middleware behavior.
- Add explicit cancellation for an in-progress resize gesture. Removing the floating branch must
  remove its pointer listeners and release pointer capture; do not leave model closures attached to
  a detached root.
- Run the React Popover story after this refactor and confirm all current props still behave before
  beginning the vanilla view conversion. The model must have zero `effect()` registrations before
  `createComponentModelDriver.mount()` is introduced.

### 3. Add the vanilla Popover view and layered stylesheet

Create `src/renderer/uikit/Popover/PopoverView.tsx` and
`src/renderer/uikit/Popover/Popover.css`; change `Popover.tsx` to keep the public props/types and
return `mountVanilla(PopoverView, props)`.

`PopoverView` should:

- Use a public constructor and a `createComponentModelDriver` for `PopoverModel`. Its stable
  logical root is an empty `div` with `display: contents`; it is not the public popover root and
  receives no caller attributes.
- Own a `SubtreeSwap(getOverlayLayer())`. When `open && placeRef` becomes true, create a
  `PopoverFloatingView`, let `SubtreeSwap.set("open", ...)` append its detached root, then call
  `mount()` only after insertion. When the condition becomes false, clear the swap so disposal
  precedes root detachment. If mount fails, clear the branch and rethrow the original error.
- Update the existing branch in place when the key remains open. Prop changes must update
  attributes, children, position options, callbacks, max-height, anchor width, and resize state
  without rebuilding the root. A changed anchor or virtual position must restart the positioning
  subscription against the new reference.
- Use `computePosition(reference, floating, { strategy: "fixed", placement, middleware })` and
  `autoUpdate(reference, floating, update)` from `@floating-ui/dom`. Write `left`, `top`, and the
  resolved `data-placement` from the result. Keep the existing offset convention:
  `[skidding, distance]` maps to Floating UI's `crossAxis` and `mainAxis`.
- Own the cleanup returned by `autoUpdate`. When the `placeRef` identity changes, clean up the
  old subscription and establish the new one. A virtual reference is recomputed when `x`/`y`
  change, so an x/y-tracking caller may resubscribe on every move; that is acceptable when the
  cleanup is exact. Guard asynchronous position results with a generation token.
- Preserve the existing `size()` middleware result: `max-height` is at least the current
  `Math.max(100, availableHeight - 20)` calculation, and `matchAnchorWidth` writes the reference
  width only while there is no manual resize. Explicit `maxHeight` and manual width/height must
  override the same values they override today. Preserve the current max-height last-writer-wins
  order: write prop/manual sizing first, then let the `size()` middleware overwrite it during
  `computePosition`. This preserves the existing viewport-cap wart for `maxHeight={240}` callers;
  taking `min(prop, viewport)` is a separate decision.
- Apply residual props/listeners to the floating root with `applyRestProps`; do not destructure
  `onKeyDown` out of the public props, so it remains in `rest` and is installed on that root.
  Bind and clear the public ref against the same root. Write component-owned `data-*` and
  positioning properties before residual props, preserving the current rest-wins behavior for
  arbitrary residual `data-*` attributes. Toggle the `scroll-container` class with `classList`,
  not by assigning `className`.
- Render the resize handle as a React element carrying `data-type="popover-resize-handle"`, the
  correct `data-edge`, the existing SVG icon, and
  `onPointerDown={(event) => model.onHandlePointerDown(event.nativeEvent)}`. Keep pointer-down
  prevention, pointer capture, top/bottom delta direction, minimum-size behavior, live `onResize`,
  and the existing hover/focus geometry in CSS.
- Keep rich `children` direct under the floating root. Because all existing Popover callers supply
  React subtrees, use one reusable `mountReactHandle` on the floating root rendering a fragment of
  `children` and the resize handle. Do not use `fillSlot`: the fragment preserves the current
  direct-child shape. React owns the floating root's child list, so the vanilla view must never
  append a DOM child to that root; the resize handle stays inside the fragment. Reuse the nested
  root for prop updates. During branch disposal, remove the floating root from the overlay layer
  first, then queue the React handle's `dispose()` in a microtask, following `fillSlot`'s safe
  nested-root pattern.
- Bind `manualSize` to the branch's inline width/height writes and clear stale width/height and
  max-height values when the corresponding props/state disappear. Keep inline styles limited to
  runtime positioning, sizing, and the existing z-index; all static visual rules move to CSS.

Translate the two Emotion blocks character-for-character into `Popover.css` under `@layer uikit`:

- `[data-type="popover"]` keeps flex column layout, background/border/radius/shadow, overflow,
  `-webkit-app-region`, and `[data-scroll] { overflow: auto; }`;
- `[data-type="popover-resize-handle"]` keeps its absolute geometry, cursor, opacity, touch and
  selection behavior, `data-edge="top"` transform/position, hover opacity, and direct SVG size;
- colors and token values use the existing `--color-*` / `--radius-*` / `--size-*` variables with
  fallbacks. Do not add a global overlay-layer rule or a new class styling hook.

### 4. Rewire `PathInputView` to own Popover directly

Update only the internal `PathInput` implementation; do not change `PathInputProps` or any caller:

- Construct a `PopoverView` with the existing path-input popover props and claim it with
  `this.child(...)`. After the parent mounts, append the Popover view's display-contents logical
  root to `this.root`, then call its `mount()`. Keep it visible in the ownership tree even though
  the public floating branch lives in the shared overlay layer; `this.child(...)` disposes it
  before the constructor-created driver, in the required child-before-disposer order. Call
  `update()` whenever the input ref, open state, suggestions, or props change.
- Remove the `<Popover>` from `PathInputBridge`. The bridge continues to render the converted
  `Input`; the PopoverView owns the React content bridge for the suggestion-host element, or an
  equivalent direct DOM host, so the existing suggestion rows remain owned by `KeyedList`.
- Preserve `open && suggestions.length > 0`, `elementRef={model.inputRef}`, the 240px max height,
  match-anchor width, offset, ignore selector, listbox role, name, and `onClose` behavior.
- When `setInputRef` changes the anchor, immediately update the PopoverView so an already-open
  suggestion branch repositions. When the state binding changes `open` or `activeIndex`, update
  the branch and keep the existing active-row styling/scroll behavior.
- Dispose the Popover child before the constructor-created model driver and before any parent-owned
  React bridge cleanup. No second Popover React root may remain in the PathInput implementation.

### 5. Preserve exports and verify the whole floating surface

- Keep `Popover/index.ts`, `uikit/index.ts`, `PopoverProps`, and `PopoverPosition` exports
  unchanged. `PopoverView` and branch implementation classes remain internal direct-path modules;
  do not add them to the public barrel.
- Confirm `@floating-ui/react` is gone from `Popover.tsx` and `PopoverModel.ts`; leave the
  type-only `WithMenu` importer for US-1006 and the two app-layer importers untouched.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Before converting, inspect the parents of all 12 production call sites for `:empty`, `:nth-child`,
  `+`, and `~` selectors. In particular check `Panel.css:67` (`.panel-root[data-hide-when-empty]:empty`)
  and `EditorToolbar.tsx:30`; confirm no toolbar whose only child is a logical Popover host becomes
  visible. The new display-contents logical host has no box, but it is still a DOM node.
- In Storybook, capture the converted implementation snapshot of the Popover story. Exercise every
  story prop: all placements, offsets, max-height,
  long content, ignored sibling clicks, anchor-width matching, resizing from bottom and top,
  outside click, Escape, and both light/dark themes.
- In the running app, exercise at least one caller from each external family: board switcher,
  browser downloads or URL suggestions, file-diff picker, and grid columns/CSV options. Also
  exercise the UIKit paths through `Menu`, `Select`, `MultiSelect`, `Autocomplete`, `FilterPopover`,
  and the PathInput suggestion list. Check that click-outside and Escape close only the expected
  popover, submenu ignore selectors remain intact for the future Menu conversion, and tooltip
  clicks remain ignored by the Popover outside-click guard.
- The final Rule 4 observer measurement belongs to US-1006; this task establishes the pinned
  procedure only.

## Concerns / Open questions

1. **The historical Rule 4 baseline is intentionally waived.** C2 retains the exact two-root
   procedure and final vanilla measurement, but the user decided that comparing against the prior
   React implementation is out of scope.

2. **Popover has two roots with different ownership.** `VanillaView.root` is a logical adapter
   anchor, while the floating `div[data-type="popover"]` is the public DOM root. Applying props or
   binding the ref to the logical root would make callers and automation silently stop seeing the
   popover. All public props, including residual onKeyDown, belong on the floating root and
   residual props intentionally retain their current rest-wins order. Keep this distinction in
   source comments and test ref, data-name, ARIA, residual handlers, and data-* output on the
   floating root.

   Native residual listeners are attached to that root before the nested React root exists. This
   reverses the current delegated React ordering: the Popover root listener runs before a child
   React handler, and child stopPropagation cannot suppress it. The only current Popover caller
   passing onKeyDown is Menu.tsx:172, where it is undefined when the search input exists; verify
   the Menu search story and retain this ordering rather than adding a new event protocol.

3. **`SubtreeSwap` attaches roots but does not call `mount()`.** The implementation must append the
   floating root first and mount it second so `computePosition`, measurements, and `autoUpdate` see
   an attached element. The factory-capture pattern in step 3 is intentional: build the branch
   detached, let SubtreeSwap.set() attach it, then mount the captured instance. If mount fails,
   clear the swap and rethrow the original error. Do not extend SubtreeSwap for this task.

4. **The content bridge is still React.** Popover children are ReactNode at every current
   production call site. A fillSlot wrapper would change direct-child DOM shape, so this task
   uses one reusable React root rendering a fragment directly into the floating root, including the
   resize handle. React therefore owns the floating root's child list; the view never appends a DOM
   child there. That is a temporary composition seam, not permission to add a callback-slot or
   descriptor protocol. Future Menu/ListBox conversions should remove the bridge for their own
   subtrees rather than spreading it to new vanilla-only callers.

5. **Unmounting a nested React root during a parent commit can warn.** Closing a Popover can be
   triggered by a vanilla update reached from a React layout effect. The branch must detach its
   floating root from the overlay layer in its own onDispose before queueing the nested React
   root's unmount, following fillSlot's existing pattern; SubtreeSwap otherwise detaches only
   after view.dispose() returns. Verify no synchronously-unmount-a-root warning appears when
   opening/closing from Storybook and PathInput.

6. **The former effects had timing and cleanup semantics.** The close reset must be guarded by the
   actual true-to-false transition, and the document listeners must exist exactly while the
    floating branch is open. Register document listeners in the floating branch's onMount and remove
    them with an own() disposer. Do not recreate them on every prop pump, and do not let a resize
    gesture leave listeners/pointer capture behind after close or disposal.

7. **Floating UI can resolve after a branch is replaced.** `computePosition` is asynchronous and
   `autoUpdate` can fire during anchor changes or close. Use a generation/token and check the current
   branch, open state, and disposal state before writing `left`, `top`, `data-placement`, or runtime
   size properties. Own the autoUpdate cleanup and replace it when placeRef identity changes; the
   virtual reference may therefore resubscribe on every x/y move.

8. **Layered CSS changes precedence.** The old Emotion rules are unlayered; `Popover.css` is in
   `@layer uikit`, so an unlayered external rule would win even at lower specificity. The source
   audit found no renderer rule directly targeting `[data-type="popover"]`, but verify global SVG,
   button, input, and descendant rules at the Popover story and at the named app callers in both
   themes. Also check the :empty rules in Panel.css:67 and Textarea.css:27, since the logical
   display-contents host is now always present. Do not add a global overlay-layer style to
   compensate.

9. **`overlayRegistry` is intentionally unchanged.** Registering Popover roots would improve
   tooltip suppression but would also change behavior beyond this conversion and violate EPIC-055
   C2-2. Preserve the current gap and leave any improvement for a separately scoped task.

10. **The model file still contains the React-facing prop type.** This task removes the direct
    `@floating-ui/react` dependency and React event usage from the model logic, but `PopoverProps`
    necessarily remains shaped by `React.HTMLAttributes` until the public API cleanup in Epic F.
    Do not invent a second framework-neutral prop interface or narrow the existing public type here.

## Acceptance criteria

- [x] The final vanilla Rule 4 measurement is recorded in EPIC-055 Notes using the Menu story,
      both `[data-type="live-preview"]` and `#persephone-overlay-layer`, the pinned options, and
      raw MutationRecord counts summed across both observers. The user explicitly waived the
      retroactive all-React comparison because only the new implementation needs verification.
- [x] `PopoverModel` has no registered effects; close reset and document dismissal behavior retain
      their current guards, selector exceptions, Escape behavior, and cleanup semantics.
- [x] The dead `onOpenChange`, `setFloating`, `floatingRefs`, and `ExtendedRefs` bridge are deleted;
      `actualPlacement` is updated from `computePosition`, and `internalRef` remains available for
      outside-click and resize behavior.
- [x] `Popover` is a thin unchanged public React face backed by `PopoverView`/`VanillaView` and
      `@floating-ui/dom`; `@floating-ui/react` is absent from the Popover implementation files.
- [x] Open popovers use `computePosition` + `autoUpdate` with fixed positioning, flip, offset,
      viewport sizing, anchor-width matching, exact cleanup/re-subscription on reference changes,
      stale-result protection, and the current virtual `x`/`y` anchor behavior. The existing
      max-height last-writer-wins order is preserved.
- [x] Closed or anchorless popovers have no floating `data-type="popover"` subtree; opening inserts
      the floating root before mount, and closing/disposal disposes it before `SubtreeSwap` detaches it.
- [x] The floating root, not the logical adapter root, receives `data-type="popover"`,
      `data-name`, `data-placement`, `data-resizable`, `data-resized`, `data-scroll`, the
      `scroll-container` class, forwarded attributes/listeners, and the caller's ref.
- [x] Children remain direct floating-root children with the resize handle last; the temporary
      React bridge reuses one root, never appends a vanilla child to the React-owned floating root,
      and does not introduce a slot wrapper or callback protocol.
- [x] Resize handle geometry, pointer capture, top/bottom deltas, minimum size, `onResize`, and
      manual-size reset on close match the current implementation, with no detached gesture
      listeners or nested-root unmount warning.
- [x] `Popover.css` is layered under `@layer uikit`, uses token/color variables with fallbacks,
      and preserves all current root/scroll/resize selectors and specificity.
- [x] `PathInputView` owns a `PopoverView` child directly; the PathInput bridge no longer renders
      `<Popover>`, and suggestion opening, filtering, keyboard navigation, active-row scrolling,
      anchor matching, and selection behavior remain unchanged. Its display-contents logical root
      is appended to the parent root after parent mount.
- [x] The always-present display-contents logical hosts at all 12 call sites do not change any
      parent `:empty`, `:nth-child`, adjacent-sibling, or general-sibling behavior; the Menu search
      story also preserves the existing residual onKeyDown ordering and behavior.
- [x] The Popover story and representative production callers work in light and dark themes;
      snapshots retain the public `data-*`, role, ARIA, ref, and child-order contract.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass. No production caller,
      story API, public export, package dependency, or unrelated overlay registry behavior changes.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Popover/Popover.tsx` | Thin public `mountVanilla` face; unchanged props and exports |
| `src/renderer/uikit/Popover/PopoverView.tsx` | New logical view, floating branch, subtree ownership, DOM bridge, positioning, refs, and cleanup |
| `src/renderer/uikit/Popover/PopoverModel.ts` | Shed effects, use DOM Floating UI types, delete the dead floating-ref/onOpenChange bridge, and preserve state/handlers and guarded close semantics |
| `src/renderer/uikit/Popover/Popover.css` | Layered static root and resize-handle styles |
| `src/renderer/uikit/Popover/index.ts` | Preserve existing public exports only if the implementation split requires an import adjustment |
| `src/renderer/uikit/PathInput/PathInputView.tsx` | Own/update/dispose `PopoverView`; remove Popover from the bridge |
| `doc/epics/EPIC-055.md` | Record the final Rule 4 measurement in Notes |
| `doc/active-work.md` | Link US-1005 to this task document |

No external production caller, story property definition, `uikit/index.ts` public export, package
dependency, `overlayRegistry`, or app-layer `@floating-ui/react` importer is in scope.

## Related work

- [EPIC-055 — De-React Epic C2](../../epics/EPIC-055.md)
- [US-998 — Tooltip attachment on `@floating-ui/dom`](../US-998-tooltip-attachment/README.md)
- [US-991 — PathInput vanilla pilot](../US-991-pathinput-pilot/README.md)
- [US-996 — Vanilla UIKit contracts and React compatibility](../US-996-vanilla-uikit-contracts/README.md)
- [US-987 — KeyedList and SubtreeSwap](../US-987-structural-helpers/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
