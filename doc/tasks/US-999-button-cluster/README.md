# US-999: Button cluster and the Rule 4 after-number

**Status:** Implemented
**Priority:** High  
**Epic:** [EPIC-054 — De-React Epic C1](../../epics/EPIC-054.md)  
**Created:** 2026-08-20

## Goal

Convert `Button`, `IconButton`, `TruncatedText`, and `SegmentedControl` to the C1 vanilla-view
shape behind their existing React-facing APIs. Remove their Emotion implementations, preserve the
existing DOM and accessibility contracts, make tooltip composition attachment-based, and record the
Rule 4 mutation count after the first real Button-plus-Tooltip conversion.

This is the only dependent C1 cluster. `SegmentedControl` composes `Button`, while `Button`,
`IconButton`, and `TruncatedText` all depend on the attachment delivered by US-998. No external
caller is migrated in this task.

## Background

### Current surface

The source was re-measured on 2026-08-20 with the TypeScript AST, excluding `*.story.tsx` and
`*.story.ts` files. The counts are opening JSX elements, not a grep count that is inflated by
comments or multiline attributes:

| Component | Production JSX tags | Files with tags | Current implementation | C1 work |
|---|---:|---:|---|---|
| `Button` | 140 | 60 | Emotion `styled.button`; optional React `<Tooltip>` wrapper | vanilla `HTMLButtonElement` view + adapter |
| `IconButton` | 172 | 80 | Emotion `styled.button`; optional React `<Tooltip>` wrapper | vanilla `HTMLButtonElement` view + adapter |
| `TruncatedText` | 6 | 3 | Emotion `styled.span`, `useState`, `useLayoutEffect`, React `<Tooltip>` | vanilla measured `HTMLSpanElement` view + adapter |
| `SegmentedControl` | 14 | 12 | Emotion `styled.div`, React `Button` children, roving-focus handlers | vanilla `HTMLDivElement` view owning vanilla `Button` children |

The four files are the remaining Emotion implementations for this cluster. `TruncatedText` is the
only one with local React state; it uses the state only to retain the current overflow result.
There are no component models or `effect()` registrations in this surface. The implementation can
therefore use view fields, explicit DOM work, `VanillaView.listen`, `KeyedList`, and
`attachTooltip`; `createComponentModelDriver` is not needed.

The current public contracts that must remain recognizable are:

- `Button` and `IconButton` render a semantic `<button>` root with `data-type`, optional
  `data-name`, state attributes, native button attributes, and caller handlers. `Button` renders
  its icon before `children`; `IconButton` keeps one `span[data-part="icon"]` around its icon.
- `TruncatedText` renders one `span[data-type="truncated-text"]` root, preserves its direct
  children, and exposes the full extracted text through a tooltip only after overflow is known.
- `SegmentedControl` renders one `div[data-type="segmented-control"]` with direct button
  children, `role="radiogroup"`, `data-roving-host`, and the selected/fallback roving-tabindex
  behavior. Arrow/Home/End prevent default and propagation, focus the next enabled segment, and
  call `onChange` with its value.
- `title` is a string on Button/IconButton and is currently implemented by wrapping the button in
  React `<Tooltip>`. The vanilla views attach US-998's tooltip directly to the existing root, so
  no wrapper element is introduced.
- `SegmentedControl` accepts either `ISegment[]` or the existing trait-backed item array. The
  trait resolution remains in the view and is not pushed into callers.

### Contracts already available

US-996 and US-998 provide the mechanisms this task consumes:

- `VanillaView`, `mountVanilla`, and `mountReact` in `uikit/shared/` provide the lifecycle and
  React boundary.
- `applyRestProps`, `bindRef`, `toPublicEvent`, `clearRestListeners`, and
  `createRestPropsState` preserve arbitrary React-facing attributes, event shapes, and refs. A
  converted view must clear removed props and write component-owned `data-*` attributes after
  residual forwarding. `bindRef(element, ref)` returns the cleanup for that exact binding; a view
  must run the old cleanup before rebinding a changed ref and register the current cleanup with
  `own()`.
- `fillSlot` handles a string, native `Node`, or transitional React subtree. React-to-React
  updates reuse one root; arm changes defer the old root's unmount past the current commit.
- `createIconElement`, `isIconName`, and the dual-face icon factories from US-997 provide a DOM
  icon for an `IconName`; a React-node icon remains on the transitional React arm.
- `attachTooltip` owns floating DOM, timers, overlay/tooltip registries, positioning, and cleanup.
  It uses native trigger listeners and does not require a Tooltip wrapper around the trigger.

### Styling contract

Each converted component gets a co-located stylesheet under `@layer uikit`, with selectors rooted
at its `data-type` value and existing `data-*` state attributes. The startup order is
`@layer base, uikit, app, editor;`. The CSS must preserve the current token values, variant and
size states, selector specificity, and the intentional SegmentedControl descendant relationship:
`[data-type="segmented-control"] > [data-type="button"]`.

The Button stylesheet must retain the adaptive `data-bg` custom properties, variant states,
disabled pointer behavior, block layout, and SVG sizing. IconButton must retain icon-part layout,
active/warning/chip/disabled states, and the strikethrough pseudo-element. TruncatedText must
retain its overflow, ellipsis, inline-block, and nowrap rules. SegmentedControl must retain square
inner buttons, rounded outer corners, one-pixel border overlap, selected-button stacking, and
group disabled opacity.

### Rule 4 measurement ownership

US-996 recorded the React baseline for one named interaction: the Storybook Button story with
`title="Rule 4 baseline tooltip"`, observed over both `[data-type="live-preview"]` and
`#persephone-overlay-layer` using identical options
`{ subtree: true, childList: true, attributes: true, characterData: true }`. The baseline was
**3 mutation records**, with the counter reset immediately before the hover and the show delay
allowed to elapse.

US-999 records the matching after-number after Button, IconButton, TruncatedText, and
SegmentedControl are converted. The interaction, story value, observer roots/options, reset point,
and delay must be identical. The count is a diagnostic proxy for DOM mutations, not a claim about
private DOM writes; record the observed value and any explanation for expected attachment/setup
noise in EPIC-054's Notes.

## Implementation plan

### 1. Allow semantic roots without weakening VanillaView's lifecycle contract

Modify `src/renderer/uikit/shared/vanilla-view.ts` so the protected constructor accepts an optional
already-created root element, defaulting to the current `document.createElement("div")` behavior.
Because the current root is a field initializer, change it to a bare `readonly root: HTMLElement`
and assign it in the constructor; do not leave the initializer in place where it could overwrite
the supplied semantic element. The base must still create exactly one stable root in the
constructor, must not build child DOM or install listeners there, and must continue to leave root
detachment to its adapter/structural owner. The optional root lets the four views use their
required semantic roots:

- `ButtonView` and `IconButtonView`: `document.createElement("button")`;
- `TruncatedTextView`: `document.createElement("span")`;
- `SegmentedControlView`: the default `div` root.

Keep the constructor public on every concrete view, as required by `mountVanilla`.

### 2. Convert Button

Create `src/renderer/uikit/Button/ButtonView.tsx` and `Button.css`, then change
`Button.tsx` into a thin `mountVanilla(ButtonView, props)` face. Keep `ButtonProps` and the public
exports unchanged.

`ButtonView` should:

1. Create an `HTMLButtonElement` root and, in `onMount`, apply residual props, then write
   authoritative `data-type="button"`, `data-name`, `data-variant`, `data-size`, `data-bg`,
   `data-block`, `data-disabled`, `data-visibility`, `disabled`, and `type` values. Preserve the
   current order and semantics of caller HTML attributes where the existing React face lets a
   residual prop win; do not silently drop `aria-*`, `data-*`, form attributes, or handlers.
2. Preserve the current direct-child shape: the icon is before `children`, with no generic slot
   wrapper. Use `createIconElement` for an `IconName` and the transitional React arm for a rich
   icon/children composition. The string/number/empty path should be direct DOM writes. If both
   icon and children need a React subtree, render one fragment through `fillSlot` so the resulting
   button still contains the same direct SVG/text/subtree nodes rather than an implementation
   wrapper.
3. Attach tooltip behavior to the button root using `attachTooltip`. The attachment may remain
   inert when `title` is absent, but changing `title` must update or suppress it without changing
   the root or adding a wrapper. Register all attachment cleanup with `own()` and ensure removed
   props, icon values, children, and title values are cleared on update.
4. Use `applyRestProps` for caller attributes/listeners and `bindRef` for the public button ref.
   The ref must point to the semantic button. `bindRef` returns a cleanup: run the old cleanup
   before rebinding and register the current cleanup with `own()` so object and callback refs are
   cleared during disposal. Production measurement found zero `style` props on any of the four
   components, so do not add speculative object-style support. Production measurement found two
   `className` props, both on IconButton; update `react-compat.ts` so `className` maps to the DOM
   `class` attribute and `htmlFor` maps to `for` while preserving stale-value removal. This is a
   shared React-to-DOM compatibility fix, not an IconButton special case.
5. Keep disabled behavior exact: the native `disabled` property and `data-disabled` state remain
   separate, and CSS still prevents pointer interaction while callers retain their attributes.

No Button call site, story definition, or external `title` usage is rewritten.

### 3. Convert IconButton

Create `src/renderer/uikit/IconButton/IconButtonView.tsx` and `IconButton.css`, then make
`IconButton.tsx` a thin `mountVanilla(IconButtonView, props)` face with the same public exports.

The view creates a semantic button, applies residual props/ref, writes the existing root state
attributes, and creates exactly one direct `span[data-part="icon"]`. Fill that span with
`createIconElement(icon)` for a registry name or the transitional React slot for a React icon.
Preserve icon replacement, active/warning precedence, chip behavior, disabled behavior, and the
strikethrough pseudo-element. Tooltip attachment is owned by the same root and follows the Button
rules for title updates and cleanup.

The CSS conversion must preserve the current `& [data-part='icon']` layout and the size-specific
SVG dimensions. Do not move the part marker onto the SVG or wrap it in an additional view-owned
element.

### 4. Convert TruncatedText without turning measurement into model state

Create `src/renderer/uikit/TruncatedText/TruncatedTextView.tsx` and `TruncatedText.css`, then
replace the React implementation with `mountVanilla(TruncatedTextView, props)`.

The view owns `rootRef`-equivalent fields and an `overflow` boolean, but not a React state hook or
component model. It must:

- preserve one direct `span[data-type="truncated-text"]` root and fill its direct children using
  the accepted slot mechanism;
- extract display text with the current recursive string/number/array/element traversal;
- measure `scrollWidth > offsetWidth` after mount and after child props change, when the root is
  attached, and remeasure on `mouseenter` so a column resize self-heals on the next hover;
- avoid a per-cell `ResizeObserver`, matching the current implementation's deliberate tradeoff;
  schedule a follow-up measurement when a transitional nested React slot needs a commit before its
  dimensions are available;
- update a single `attachTooltip` instance with the extracted text when overflow is true and with
  `null` otherwise. The tooltip content must never be stale after children change. On the hover
  remeasure path, register the view's `mouseenter` listener before creating the tooltip
  attachment, recompute overflow, and call `attachment.update(...)` synchronously; US-998 must
  read `options.content` when its show timer fires, not capture it only when the timer is
  scheduled;
- forward residual DOM props/listeners and clear them on removal. `TruncatedText` intentionally
  omits `style` and `className` from its public props, so do not add those escape hatches.

Cancel any queued measurement during disposal, clear the tooltip attachment, and leave root
detachment to `mountVanilla`.

### 5. Convert SegmentedControl and own its Button children

Create `src/renderer/uikit/SegmentedControl/SegmentedControlView.tsx` and `SegmentedControl.css`,
then make `SegmentedControl.tsx` a thin `mountVanilla(SegmentedControlView, props)` face.

The view resolves `Traited<unknown[]>` with the existing `SEGMENT_KEY`, owns the root ref and
roving-focus logic, and uses a `KeyedList<ISegment, string, HTMLButtonElement>` keyed reconciliation
for the direct segment buttons:

- validate duplicate `segment.value` keys before mutating the DOM;
- create a public `ButtonView` for each new segment, claim it exactly once with `this.child`, and
  let the keyed helper reconcile the button roots without unnecessary moves;
- update every retained/new ButtonView with variant, size, background, icon, title, disabled,
  role, `aria-checked`, `tabIndex`, and click/key handlers;
- on removal, dispose the ButtonView and let `KeyedList` detach its root. Parent disposal remains
  safe because child view disposal is idempotent;
- keep focus lookup by current ordered button index (or a key-to-view map) so Arrow/Home/End use
  the reconciled order and do not rely on stale React child indices.

The `ISegment` slot fields follow the C1 slot decision: labels and icons are represented by the
neutral slot-capable value in the vanilla path, while existing React-node callers remain valid.
The Button view must normalize a registry icon to a DOM node and keep rich slot values on the
temporary React arm; no callback-slot protocol or descriptor object is introduced. `title` remains
plain string data.

Write the root's `data-type`, `data-name`, `data-roving-host`, `data-disabled`, and `role` after
residual handling. Keep the buttons as direct children so the CSS descendant selectors and the
current `rootRef.current.children[i]` focus contract remain valid.

### 6. Move the four stylesheets to layered CSS

Remove `@emotion/styled` and the token/style imports used only by the four React implementations.
Add these files, each imported by its owning component face/view:

- `src/renderer/uikit/Button/Button.css`
- `src/renderer/uikit/IconButton/IconButton.css`
- `src/renderer/uikit/TruncatedText/TruncatedText.css`
- `src/renderer/uikit/SegmentedControl/SegmentedControl.css`

Use the existing color and token values through the CSS variables established by US-981, with the
same safe fallbacks used by `PathInput.css` and `Tooltip.css`. Preserve all state selectors and
specificity, especially the SegmentedControl button selectors. Do not introduce a caller class or
change `data-type` / `data-part` vocabulary.

### 7. Preserve public exports and verify unchanged callers

Keep each component's existing index export and the UIKit barrel exports. Export view classes only
from their implementation paths if an internal parent needs them; do not expand the public barrel
just to expose implementation details. `SegmentedControlView` may import `ButtonView` directly so
the composed child is vanilla rather than a nested React `Button` adapter.

Do not modify external production call sites, stories, Storybook property definitions, or the
remaining `@floating-ui/react` users. Verify that all four public component faces still typecheck
with the existing `IconRef`, trait, handler, ref, title, and child values.

### 8. Capture and record the Rule 4 after-number

In the running Storybook editor:

1. Select the existing Button story and set `title` exactly to `Rule 4 baseline tooltip`.
2. Observe both `[data-type="live-preview"]` and `#persephone-overlay-layer` with one
   `MutationObserver` configuration: `{ subtree: true, childList: true, attributes: true,
   characterData: true }`.
3. Reset the record count immediately before hovering the live-preview Button. Allow the same
   tooltip delay used for the US-996 baseline, then stop and record the total.
4. Compare the after-count with the recorded React baseline of 3, explain any difference, and add
   the after-number and exact procedure to the `## Notes` section of `doc/epics/EPIC-054.md`.

The measurement is not complete if it observes only the preview pane, includes setup mutations, or
uses a different story value or delay.

### 9. Verify the component cluster

Run `npm run typecheck`, `npm run lint`, and `git diff --check`. In Storybook and a production-like
renderer smoke path, exercise:

- Button: all variants, sizes, backgrounds, icons, text/JSX children, disabled/block/parent-hover
  states, arbitrary aria/data/form props, callback/object refs, handler replacement/removal, and
  title hover/focus/Escape behavior;
- IconButton: both sizes/variants, active/warning/disabled precedence, strikethrough, icon
  replacement, refs, title attachment, and the icon `data-part` hook;
- TruncatedText: fitting and overflowing content, arrays/nested text, content updates, hover
  remeasurement, copyable tooltip text, and no stale tooltip after overflow disappears;
- SegmentedControl: trait-backed items, insertion/removal/reordering, duplicate-key rejection,
  selected/fallback tab index, disabled segments/group, click and all four arrow/Home/End paths,
  focus movement, onChange values, segment title/icon/label slots, and direct-child CSS geometry.

Capture snapshots of each component root and compare `data-*`, role, aria, child order, and
accessibility output with the pre-conversion contract. Do not add a unit-test harness.

## Concerns / Open questions

1. **Semantic roots require a small base-class extension.** `VanillaView` currently always creates
   a `div`, but Button/IconButton require `button` and TruncatedText requires `span`. The optional
   root constructor parameter is the smallest compatible change. It must not become a general
   factory hook that allows constructors to build arbitrary child DOM or bypass `mount()`.

2. **Direct-child slots are the main implementation risk.** A generic `<span>` slot host would be
   easy but would change Button and TruncatedText DOM shape and could affect CSS, accessibility,
   and callers querying direct children. Use direct DOM fast paths and one temporary React fragment
   for rich compositions. If a React arm cannot preserve the direct shape for a concrete caller,
   record that caller rather than silently adding a wrapper.

3. **`className` and `style` have different answers.** Production measurement found zero `style`
   occurrences across all four components, so no object-style support is needed for this task and
   the application rule continues to forbid new UIKit `style` escape hatches. It found two
   `className` occurrences, both IconButton: `uikit/AVGrid/filters/FilterBar.tsx:264` and
   `uikit/AVGrid/HeaderCell.tsx:280`. `applyRestProps` currently creates a bogus
   `className="…"` attribute, so the shared helper must map `className` to `class` and `htmlFor` to
   `for`; the latter has no current UIKit caller but closes the general React-to-DOM rename gap.
   The caller-owned rules are unlayered and therefore continue to beat layered IconButton CSS,
   preserving the current AVGrid behavior.

4. **`SegmentedControl` owns nested views and keyed updates.** The parent must claim each
   `ButtonView` exactly once, while `KeyedList` owns order and node detachment. Removal must dispose
   the child before its root is detached, and parent disposal must not double-run observable
   cleanup. Duplicate values must fail before any mutation, as required by the structural-helper
   contract.

5. **Neutral segment slots meet a React-facing type boundary.** Existing `ISegment.label` and
   `icon` values are React nodes, while C1's vanilla slot contract also permits native nodes. The
   view can support both, but the React-facing type and the Button child composition must not
   accidentally expose a DOM-only value to a React implementation. Keep `SlotContent` as the
   documented neutral form, normalize icon names through `createIconElement`, and keep rich React
   values on the temporary `mountReact` arm until later epics remove that arm.

6. **Overflow measurement is timing-sensitive.** `scrollWidth` and `offsetWidth` are meaningful
   only after the root is attached and children have been installed. The mount adapter appends the
   root before `mount()`, so initial measurement is valid; a nested React slot may require a
   microtask or animation-frame follow-up. Do not introduce one `ResizeObserver` per virtualized
   cell. Keep the existing hover remeasure behavior and document any additional scheduling needed
   for rich children.

7. **Tooltip attachment changes no wrapper DOM, but changes listener ownership.** Button and
   IconButton no longer render a React `<Tooltip>` wrapper when `title` is present. The native
   attachment owns the trigger listeners and floating root; caller handlers remain forwarded once,
   with the US-998 native-before-React ordering and `focusin`/`focusout` behavior. Verify disabled
   buttons and title removal do not leave a tooltip or listeners alive.

8. **Layered CSS can lose to unlayered rules.** The measured result for this cluster is known: the
   two production `className` callers are IconButtons in `uikit/AVGrid/filters/FilterBar.tsx:264`
   and `uikit/AVGrid/HeaderCell.tsx:280`; their caller-owned Emotion rules target
   `.clear-filters-button` and `.column-filter-button`/`.columnFiltered`, respectively. Those
   rules are unlayered and therefore continue to beat the new layered `IconButton.css`, which
   preserves the existing AVGrid behavior. SegmentedControl's parent relationship is intentional
   and must remain inside its `@layer uikit` stylesheet.

9. **The Rule 4 number is a measurement, not a target.** The after-count may differ from 3 because
   US-998's attachment and the vanilla view have different setup timing. The task must report the
   exact observed count and procedure in EPIC-054 Notes; it must not manufacture a lower number or
   compare a different interaction.

## Acceptance criteria

- [x] `VanillaView` replaces its root field initializer with constructor assignment for the
      optional semantic root, without changing its explicit mount/update/dispose, ownership, FIFO
      cleanup, or root-detachment contracts.
- [x] Button, IconButton, TruncatedText, and SegmentedControl have vanilla views and thin
      `mountVanilla` React faces with unchanged public component names and caller signatures.
- [x] Button and IconButton retain semantic button roots, direct icon/content structure, refs,
      residual attributes/listeners, all state attributes, and tooltip behavior without a wrapper.
- [x] TruncatedText retains one direct span root, overflow measurement, recursive text extraction,
      hover remeasurement, tooltip suppression/update semantics, and cleanup without React state.
- [x] SegmentedControl retains direct vanilla Button children, trait resolution, keyed updates,
      duplicate-key validation, roving tabindex, focus movement, keyboard cancellation, and
      `onChange` behavior.
- [x] Rich children and segment slots use the existing transitional `fillSlot`/React arm only
      where necessary; no callback-slot protocol, descriptor API, or avoidable wrapper is added.
- [x] Four co-located `@layer uikit` stylesheets preserve all current visual states, token values,
      data-type/data-part selectors, specificity, and SegmentedControl geometry. No Emotion import
      remains in the four converted component implementations.
- [x] `style` is documented as absent from all four production surfaces and is not implemented
      speculatively; `className` maps to `class` (and `htmlFor` to `for`) in the shared
      compatibility helper, preserving the two IconButton caller-owned styles.
- [x] No external production call site, story definition, Storybook API, or unrelated UIKit
      component is migrated, and no unit-test harness is added.
- [x] The exact Rule 4 procedure is repeated over both observation roots and the resulting after
      count is recorded in EPIC-054 Notes alongside the React baseline of 3.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass, and Storybook smoke checks
      cover all four components and the named accessibility/DOM contracts.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Accept semantic root elements while preserving the lifecycle contract |
| `src/renderer/uikit/shared/react-compat.ts` | Preserve any required Button/IconButton residual `className`/`style` behavior |
| `src/renderer/uikit/Button/Button.tsx` | Thin React face and unchanged public props |
| `src/renderer/uikit/Button/ButtonView.tsx` | New vanilla button view, slots, refs, listeners, and tooltip attachment |
| `src/renderer/uikit/Button/Button.css` | Layered Button stylesheet |
| `src/renderer/uikit/IconButton/IconButton.tsx` | Thin React face and unchanged public props |
| `src/renderer/uikit/IconButton/IconButtonView.tsx` | New vanilla icon-button view and tooltip attachment |
| `src/renderer/uikit/IconButton/IconButton.css` | Layered IconButton stylesheet |
| `src/renderer/uikit/TruncatedText/TruncatedText.tsx` | Thin React face |
| `src/renderer/uikit/TruncatedText/TruncatedTextView.tsx` | New measured vanilla span view and tooltip attachment |
| `src/renderer/uikit/TruncatedText/TruncatedText.css` | Layered TruncatedText stylesheet |
| `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx` | Thin React face and public types |
| `src/renderer/uikit/SegmentedControl/SegmentedControlView.tsx` | Vanilla group, keyed Button children, and roving focus |
| `src/renderer/uikit/SegmentedControl/SegmentedControl.css` | Layered group/child stylesheet |
| `doc/epics/EPIC-054.md` | Record the Rule 4 after-number and implementation note |
| `doc/active-work.md` | Link US-999 under EPIC-054 |
| `doc/tasks/US-999-button-cluster/README.md` | This investigation and implementation plan |

Stories and external production call sites are intentionally unchanged.

## Related work

- [EPIC-054 — De-React Epic C1](../../epics/EPIC-054.md)
- [US-996 — vanilla UIKit contracts and Rule 4 baseline](../US-996-vanilla-uikit-contracts/README.md)
- [US-997 — DOM icon path](../US-997-dom-icon-path/README.md)
- [US-998 — Tooltip attachment](../US-998-tooltip-attachment/README.md)
- [US-994 — single Storybook preview](../US-994-retire-side-by-side-preview/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
