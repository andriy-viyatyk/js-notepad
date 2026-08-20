# US-1001 — `Checkbox`, `Slider`, `RadioGroup`

**Status:** Implemented
**Priority:** Medium
**Epic:** [EPIC-054 — De-React Epic C1](../../epics/EPIC-054.md)
**Created:** 2026-08-20

## Goal

Convert `Checkbox`, `Slider`, and `RadioGroup` to the Epic C vanilla-view pattern behind
their existing React-facing props. Move their Emotion rules to co-located layered CSS, preserve
the controlled-value contracts and the existing DOM/accessibility behavior, and keep the React
faces as thin `mountVanilla` adapters.

This task does not introduce models or internal state. All three components are controlled:
their views project props into DOM and send user actions back through the existing callbacks.

## Background

The prerequisite contracts have landed in US-995 through US-1000:

- `VanillaView` and `mountVanilla` own lifecycle and React/DOM boundaries.
- `applyRestProps`, `clearRestListeners`, `toPublicEvent`, `bindRef`, and `fillSlot` are in
  `uikit/shared/`.
- `createIconElement` and `isIconName` provide the DOM icon path from US-997.
- Converted UIKit CSS is scoped by `[data-type="..."]` and loaded in `@layer uikit`.
- CSS token variables are installed by `theme/token-vars.ts`.

The current components are still React/Emotion implementations:

| Component | Current implementation | Production usage | Stories |
|---|---|---:|---|
| `Checkbox` | `Checkbox.tsx`, Emotion `styled.label` | 12 sites / 9 files | `Checkbox.story.ts` |
| `Slider` | `Slider.tsx`, Emotion `styled.input` | 2 sites / 2 files | `Slider.story.tsx` |
| `RadioGroup` | `RadioGroup.tsx`, Emotion `styled.div` and `styled.button` | 3 sites / 3 files | `RadioGroup.story.tsx` |

The usages are intentionally unchanged by this task. The production sites are:

- Checkbox: `editors/mcp-inspector/ToolArgForm.tsx`, `editors/grid/components/CsvOptions.tsx`,
  `ui/dialogs/LibrarySetupDialog.tsx`, `editors/log-view/items/CheckboxesDialogView.tsx`,
  `editors/storybook/PropertyEditor.tsx`, `editors/rest-client/KeyValueEditor.tsx`,
  `editors/rest-client/RequestBuilder.tsx`, `editors/settings/sections/SettingsSections.tsx`,
  and three sites in `editors/settings/sections/McpSection.tsx`.
- Slider: `editors/video/AudioControls.tsx` and `editors/graph/GraphTuningSliders.tsx`.
- RadioGroup: `editors/grid/components/CsvOptions.tsx`, `ui/dialogs/InputDialog.tsx`, and
  `editors/log-view/items/RadioboxesDialogView.tsx`.

### Existing DOM and behavior contracts

`Checkbox` renders a `label[data-type="checkbox"]` with `data-name`,
`data-checked="true|false"`, optional `data-disabled`, an icon span
`[data-part="icon"]`, and the caller's children. Its click handler prevents the label's
default action and calls `onChange(!checked)` unless disabled. The icon names are the registry
entries `checked` and `unchecked`; the DOM view must use `createIconElement` and must not fall
back to text or a React icon for those state icons.

`Slider` renders the native `input[type="range"]` directly. Its public value is a number while
the native input stores a string, so the view must assign `input.value`, `min`, `max`, and
`step` as native properties/attributes and parse the native input event back to a number. The
current React `onChange` path is the range-control input path; the vanilla listener must use the
native `input` event so dragging continues to report values continuously. `width` accepts a
number or CSS string, and numeric widths must become `${value}px`; unlike React style handling,
a CSS custom property containing `8` is not a valid `8px` width.

`Slider` also has a real app-layer selector in `editors/video/AudioPlayer.tsx`:

```css
[data-audio-overlay] [data-type="slider"] { opacity: 0.4; transition: opacity 0.2s ease; }
[data-audio-overlay]:hover [data-type="slider"],
[data-audio-overlay]:focus-within [data-type="slider"] { opacity: 1; }
```

That selector must continue to match the same root. It is unlayered app CSS and therefore
outranks the new `@layer uikit` rule, which is the intended result for this opacity/transition
override. No other external rule currently targets these three component roots or RadioGroup's
internal icon hooks.

`RadioGroup` resolves either direct `IRadio[]` or `Traited<unknown[]>` through `RADIO_KEY` and
`resolveTraited`. Each item is a direct `button[data-type="radio"]` child of the
`div[data-type="radio-group"]` root. The state icon retains `class="radio-icon"` because the
existing selectors and the US-966 class-preservation decision depend on it. A caller-provided
`IRadio.icon` remains an `IconRef`: registry names use `createIconElement`, while a React node
continues through `fillSlot` in the item-icon host.

The current RadioGroup interaction contract is:

- root role `radiogroup`, `data-orientation`, optional `data-disabled`,
  `data-roving-host`, `aria-disabled`, `aria-orientation`, `aria-label`, and
  `aria-labelledby`;
- item role `radio`, always-present `aria-checked="true|false"`, optional `aria-disabled`,
  `data-checked="true|false"`, optional `data-disabled`, native `disabled`, and roving
  `tabIndex`;
- click and Space/Enter select an enabled item;
- Arrow keys move to the next/previous enabled item and select it;
- Home/End select and focus the first/last enabled item;
- when the selected value is missing or disabled, the first item whose own `disabled` flag is
  false receives `tabIndex=0`; group-disabled is deliberately not included in this calculation;
- a disabled group disables every item through the native button contract.

`KeyedList<IRadio, string, HTMLButtonElement>` from US-987 is the appropriate structural helper
for RadioGroup. `IRadio.value` is the stable key. It preserves button nodes and focus when item
objects are replaced or reordered, while its duplicate-key validation makes invalid radio data
fail before mutating the DOM.

## Implementation plan

### 1. Convert `Checkbox` to a vanilla view

Modify `src/renderer/uikit/Checkbox/Checkbox.tsx` to retain the current public interfaces and
return `mountVanilla(CheckboxView, props)`. Do not change the story or its call sites.

Create `src/renderer/uikit/Checkbox/CheckboxView.tsx`:

- extend `VanillaView<CheckboxProps>` with a `label` root;
- build one icon host with `data-part="icon"` and install the `checked`/`unchecked`
  SVG from `createIconElement`, replacing only that SVG when `checked` changes;
- provide a view-owned children region for `children` and update it with `fillSlot`, so string
  children stay fast and React children retain the existing `ReactNode` arm. The region must be
  layout-transparent and remain after the icon host; it must not let a slot update remove the
  icon;
- register the native default-toggle listener from `onMount`. It must guard disabled state, call
  `preventDefault()`, and invoke the latest `this.props.onChange(!this.props.checked)`. The
  current React spread is last: a caller-supplied `onClick` in `...rest` replaces the toggle
  handler. Preserve that contract by having the default listener no-op whenever a caller
  `onClick` is present, while `applyRestProps` owns the caller handler; when it is absent, the
  default listener performs the toggle;
- apply residual HTML label props through `applyRestProps` and clear listeners/slot content on
  disposal. Keep the component-owned `data-type`, `data-name`, `data-checked`, and
  `data-disabled` values synchronized and remove attributes when props become inactive;
- preserve the current root and icon DOM roles. No input element or new form semantics are
  introduced by this task.

Create `src/renderer/uikit/Checkbox/Checkbox.css` in `@layer uikit`, translating the Emotion
rules without changing selector meaning. Use `--gap-sm`, `--size-icon-md`, and the existing
color variables with fallbacks. Preserve the hover, disabled opacity/cursor, icon sizing, and
disabled-hover icon color behavior.

### 2. Convert `Slider` to a vanilla native range view

Modify `src/renderer/uikit/Slider/Slider.tsx` to return `mountVanilla(SliderView, props)` while
leaving `SliderProps` unchanged. Create `SliderView.tsx` with an `HTMLInputElement` root and:

- write `type="range"` and the bounds in the order `min`, `max`, `step`, then `value`, followed
  by `disabled`, using the same defaults and native semantics as the React face. Native range
  assignment clamps against the current bounds, so `value` must be last. Skip the value property
  write when `String(props.value) === input.value`; this prevents a parent re-render during a
  drag from yanking the thumb back to the controlled value unnecessarily;
- write `data-type="slider"`, `data-name`, `data-size`, `data-disabled`, and
  `data-show-progress`, removing stale state attributes on update;
- listen for native `input`, parse `event.target.value` with `parseFloat`, and call the latest
  `onChange` callback. Leave residual `onInput`/mouse/focus handlers to `applyRestProps`, so
  existing callers such as `AudioControls` still receive `onMouseDown` and `onMouseUp`;
- compute `--slider-width` from `width` (`number` becomes px, string passes through) and clear
  it when width is absent;
- compute and write the existing `--slider-track-bg` linear gradient only when `showProgress` is
  true, using the same clamped `(value - min) / (max - min)` calculation and the same theme
  color variables. Remove it when progress is disabled;
- clear residual listeners on disposal. The root remains attached/detached by `mountVanilla`.

Create `Slider.css` in `@layer uikit` for the root and both browser range pseudo-elements.
Translate numeric values to token variables or explicit pixel values exactly as today:
4px track, 12px thumb, -4px thumb offset, `radius.xs`, control-height size variants, and the
disabled opacity/pointer behavior. The stylesheet must use `--slider-width` and
`--slider-track-bg` rather than dynamic Emotion interpolation.

### 3. Convert `RadioGroup` with keyed native buttons

Modify `src/renderer/uikit/RadioGroup/RadioGroup.tsx` to preserve the exported `IRadio`,
`RADIO_KEY`, `RadioGroupProps`, and `RadioGroup` signatures while mounting `RadioGroupView`.
Create `RadioGroupView.tsx` and `RadioGroup.css`.

The view should:

1. Resolve `props.items` through `isTraited`/`resolveTraited` on every update.
2. Create a root `div` with the existing root roles/data/ARIA attributes. Store the dynamic
   gap in a custom property (for example `--radio-group-gap`) and set/remove `flex-wrap` on
   the root so the current horizontal-wrap behavior remains exact without a React style prop.
3. Construct a `KeyedList<IRadio, string, HTMLButtonElement>` for the root. Its `create`
   callback creates a direct `button` child with `type="button"`, the radio role, the fixed
   state-icon SVG carrying `class="radio-icon"`, a label text node, and native click/keydown
   listeners. Its `update` callback handles all four `IRadio` fields explicitly: `value` is the
   stable key, the visible label is `radio.label ?? radio.value`, `icon` is the optional
   `.item-icon`, and `disabled` participates in both the item and group disabled state. The
   optional `.item-icon` must be inserted between the state SVG and the label text node, and
   removed when absent; do not leave an empty host (it would create a phantom flex gap) or append
   it after the label. Keep an explicit label text-node reference and use `insertBefore` when
   the icon appears. `aria-checked` must always be written as `"true"` or `"false"`; only
   `aria-disabled` and `data-disabled` are conditional. The `remove` callback releases any
   `fillSlot` content and per-item resources.
4. Preserve the current roving-tabindex algorithm. Determine the selected enabled index, or
   the first item whose own `radio.disabled` is false; deliberately do not include the group
   `disabled` flag in this fallback calculation, matching the current implementation. Focus the
   actual button node before calling `onChange` for arrow, Home, and End navigation. Use the
   current item order, not a stale creation index, when a retained button receives a key event.
5. Preserve keyboard event ordering: prevent default and stop propagation for handled arrows,
   Home, End, Space, and Enter; ignore disabled items; call the latest callback from
   `this.props`. A click on an enabled item calls `onChange(item.value)` once.
6. Update the state icon from `radio-checked` to `radio-unchecked` without replacing the button.
   For `IRadio.icon`, keep the existing `.item-icon` wrapper and use `createIconElement` for a
   registry name or `fillSlot` for a React node. An unknown runtime string follows the existing
   icon warning/empty-SVG policy rather than becoming visible text.

The CSS must preserve the existing selectors and specificity around `.radio-icon`, `.item-icon`,
`data-checked`, and `data-disabled`. Keep `class="radio-icon"` on the state SVG and retain the
direct `.item-icon > svg` sizing rule. Scope every `.item-icon` rule under
`[data-type="radio"]`; `.item-icon` is also emitted by the sidebar, so a bare shared selector
would change unrelated sidebar layout. Use `--space-*`, `--gap-*`, `--font-*`, and `--size-*`
variables with the existing color fallbacks. Keep checked/hover/focus/disabled ordering
unchanged.

### 4. Keep exports, stories, and callers stable

Do not export the view classes through `uikit/index.ts` or component `index.ts` files; the React
face remains the public export. The existing story files remain the verification harness:
`Checkbox.story.ts` (not `.tsx`), `Slider.story.tsx`, and `RadioGroup.story.tsx`. No story prop
API or production JSX call site should change.

### 5. Verify behavior and CSS precedence

Run the standard checks:

```text
npm run typecheck
npm run lint
git diff --check
```

In Storybook, exercise every control for all three stories, including disabled states, RadioGroup
orientation/wrap/gap/count/disabled-item combinations, Slider size/width/progress/value, and
Checkbox label/checked/disabled. Capture the `data-*` output for the roots and radio items and
compare it with the current contract.

Also verify the real callers, not only stories:

- open the grid CSV options and confirm Checkbox and RadioGroup selection updates remain live;
- open an input/radiobox dialog and verify mouse, keyboard, disabled, and focus behavior;
- inspect the audio player overlay while hovering/focusing it: Slider opacity must remain 0.4
  until the parent is hovered/focused, then 1, and drag updates must remain continuous;
- exercise graph tuning sliders and settings/MCP checkboxes;
- verify `radio-icon` hover, focus-visible, checked, disabled, and disabled-hover colors;
- use light and dark themes, because all three styles consume theme variables.

No unit-test harness is introduced.

## Concerns / Open questions

1. **Checkbox children need an owned slot region.** The current root has the icon span followed
   directly by `{children}`. `fillSlot` needs a host so replacing children cannot clear the icon;
   the children region must use `display: contents`, matching the existing fill-slot wrapper,
   so it contributes no phantom flex item or gap when empty. This is an internal structural
   wrapper, not a new public prop or component, and must not change the visual inline-flex gap.
   The `[data-part="icon"]` host must remain a real laid-out box: its width, height, and
   `flex-shrink` are load-bearing, so do not apply `display: contents` to the icon host. Verify
   both string children and a React-node child even though all measured production callers
   currently use text.

2. **Range `input` versus React `onChange`.** React normalizes range changes through its input
   path. The vanilla view must subscribe to `input`, not only native `change`, or dragging a
   Slider will stop updating continuously. Residual `onInput` handlers still go through
   `applyRestProps`; the controlled `onChange` prop remains the single numeric callback.

3. **CSS layer precedence is observable at the audio overlay.** Static component CSS is in
   `@layer uikit`, while `AudioPlayer` injects unlayered CSS that targets the Slider root.
   Unlayered declarations win over layered declarations even at lower specificity. This is safe
   for the current overlay because it owns only opacity and transition, but implementation must
   verify that no converted Slider declaration is expected to override those values.

4. **Dynamic Slider values must be cleared, not only set.** On update, remove
   `--slider-width` when `width` becomes undefined and remove `--slider-track-bg` when
   `showProgress` becomes false. Otherwise the vanilla view will retain the previous width or
   gradient, violating the Rule 9 stale-DOM contract.

5. **RadioGroup keyed reconciliation changes the failure mode for duplicate values.** React's
   current `key={radio.value}` reports a duplicate-key warning and continues; `KeyedList` throws
   before DOM mutation. `value` is documented as the stable identifier and is already the React
   key, so the stricter failure is intentional and should be recorded and verified rather than
   hidden with an index key.

6. **Radio item icon identity and React subtrees.** A registry icon can be rebuilt directly as
   an SVG; a React-node icon must remain in the `.item-icon` host and use the existing React bridge.
   Do not replace the whole radio button when only its icon or checked state changes: focus and
   active state belong to the retained button node.

7. **Trait resolution must stay framework-neutral.** `RADIO_KEY`, `isTraited`, and
   `resolveTraited` are core trait utilities and can be used directly by the view. Do not move
   the trait key, add React hooks to the view, or introduce a model for this controlled list.

8. **No public ref contract exists today.** The current `CheckboxProps`/`SliderProps` interfaces
   do not declare a ref field and `RadioGroupProps` has no ref prop or production ref caller.
    Do not widen the public API opportunistically; if typecheck reveals an existing ref caller,
    handle that specific contract and document it in the implementation diff.

9. **Checkbox residual props include `style`, `className`, and `onClick`.** No production caller
   uses any of the three, but they remain accepted by `CheckboxProps`. `className` must continue
   through `applyRestProps`'s `className` → `class` mapping. The default toggle must not be
   installed in a way that makes it win over a supplied `onClick`; the view must preserve the
   current React behavior described in the Checkbox plan.

## Acceptance criteria

- [ ] `Checkbox`, `Slider`, and `RadioGroup` export the same public props and remain available
      through the same React-facing barrels; no production caller or story prop definition changes.
- [ ] Each component has a `VanillaView` implementation and a co-located `@layer uikit` stylesheet;
      the component files no longer import Emotion or use React hooks for component behavior.
- [ ] Checkbox preserves `label[data-type="checkbox"]`, its `data-name`, `data-checked`,
      `data-disabled`, icon part and child order; checked/unchecked icons, disabled click guard,
      `preventDefault`, callback value, the caller-`onClick` override, residual props, and child
      slots work. The icon host remains a laid-out box and only the children host uses
      `display: contents`.
- [ ] Slider remains a native `input[type="range"]` with equivalent value/min/max/step/disabled
      behavior; bounds are written min → max → step → value, redundant value writes are skipped,
      numeric width is px, string width is unchanged, progress gradient and all stale custom
      properties update/clear correctly, and native input changes call `onChange(number)`.
- [ ] RadioGroup preserves root/item roles, `data-*` and ARIA attributes, item order, trait
      resolution, keyed node identity, all four `IRadio` fields (`value`, `label ?? value`,
      `icon`, `disabled`), RadioGroup icon names, `class="radio-icon"`, always-present
      `aria-checked="true|false"`, and `.item-icon` behavior for both registry and React-node
      icons. `.item-icon` is inserted between the state icon and label and is scoped under the
      radio item root.
- [ ] RadioGroup preserves roving tabindex, click selection, Arrow/Home/End/Space/Enter behavior,
      focus movement, disabled-item skipping, group disabling, and fallback focus selection.
- [ ] AudioPlayer's unlayered `[data-audio-overlay] [data-type="slider"]` opacity/transition
      behavior remains intact, and no external selector loses its target.
- [ ] Storybook checks cover all three stories and both themes; representative grid/dialog/settings/
      graph/audio callers are smoke-tested and root `data-*` output is inspected.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; no unit-test harness is added.
