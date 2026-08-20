# US-1002 — `Input` and `Textarea`

**Status:** Implemented
**Priority:** Medium
**Epic:** [EPIC-054 — De-React Epic C1](../../epics/EPIC-054.md)
**Created:** 2026-08-20

## Goal

Convert `Input` and `Textarea` to the Epic C vanilla-view pattern behind their existing
React-facing contracts. Move their Emotion rules to co-located layered CSS, preserve the
controlled value/event behavior and DOM shape, and make `Input`'s named slots work through
`fillSlot` without losing ref forwarding or flex layout.

This task does not change production call sites, stories, public barrel exports, or package
dependencies. It is independent of the other C1 conversion tasks: neither component has an
icon prop or a dependency on `Panel`, `Text`, or `IconButton` in its production implementation.

## Background

US-995 through US-1001 provide the contracts this conversion consumes:

- `VanillaView` and `mountVanilla` own the lifecycle and React/DOM boundary.
- `applyRestProps`, `clearRestListeners`, `toPublicEvent`, and `bindRef` live in
  `uikit/shared/react-compat.ts`.
- `fillSlot` owns string/DOM/temporary-React transitions and reuses a React root when both
  successive values are React content.
- Converted UIKit CSS is scoped from `[data-type="..."]` and loaded in `@layer uikit`.
- Runtime scalar values use component-owned custom properties; numbers entering CSS become px.

The current implementation is still React/Emotion:

| Component | Current implementation | Production usage | Story |
|---|---|---:|---|
| `Input` | Emotion wrapper + Emotion field + Emotion slot | 58 sites / 42 files | `Input.story.tsx` |
| `Textarea` | Emotion `styled.div` contenteditable surface | 19 sites / 14 files | `Textarea.story.tsx` |

These are JSX-tag counts from the pinned scan `rg -n --glob '*.tsx' '<Input\\b|<Textarea\\b'
src/renderer`, excluding `*.story.tsx` for production totals. The older EPIC-054 summary figure
(`Input` 86) was measured differently or is stale; it must not be used as a completion target
without re-measuring the current tree with the same command.

`Input` has two `startSlot` occurrences and twelve `endSlot` occurrences in production. The
slot hosts are real flex items, so an absent slot must not leave an empty host behind. The field
ref is forwarded to the inner `input`, not the wrapper; eleven production callers depend on that
behavior (`Autocomplete`, `DateInput`, `FileList`, `TreeProviderView`, `CategoryView`,
`BrowserView`, `FileSearch`, `Menu`, `MultiSelect`, `PathInput`, and `Select`).

`Textarea` has no named slots, no `TextareaRef`, no public `ref` prop, and no production ref
caller. Its current root is a `div[contenteditable]`; its `value` is synchronized through
`innerText`, and its paste and keydown callbacks run before the internal single-line logic.

### Existing DOM and styling contracts

`Input` currently renders this shape:

```text
div[data-type="input"][data-name?][data-size][data-variant][data-tone]
├─ div[data-part="start-slot"]?        (only when startSlot is not null/undefined/false)
│  └─ slot content
├─ input                                (the forwarded ref target)
└─ div[data-part="end-slot"]?          (same presence rule)
   └─ slot content
```

The wrapper owns the background, border, focus-within state, disabled/read-only/invalid state,
variant, and width constraints. The field owns size, tone, padding, native `disabled` and
`readOnly`, the caller's residual HTML attributes, and the native input path. The field remains
the direct descendant of the wrapper because existing selectors rely on
`[data-type="input"] input`.

Two external Emotion rules intentionally target that contract:

- `components/file-search/FileSearch.tsx:59` sizes `[data-type="input"]` in its query row.
- `uikit/AVGrid/CellInput.tsx:38-50` and `AVGrid/CellSelect.tsx:49-58` style the Input wrapper
  and its direct `input` descendant for cell editing.

Those selectors must continue to match the same nodes. They are unlayered caller styles and
therefore outrank the new `@layer uikit` rules, which preserves the existing app/AVGrid override
behavior. There are no renderer selectors targeting `[data-type="textarea"]`.

`Textarea` currently renders:

```text
div[data-type="textarea"][data-name?][data-size][data-variant]
  role="textbox" aria-multiline contenteditable="plaintext-only"|"false" spellcheck="false"
  data-disabled? data-readonly? data-single-line? data-placeholder?
```

The component-owned attributes and handlers are written after residual props in JSX, so they win
over conflicting residual values. Its current style object supplies `minHeight`, `maxHeight`,
`width`, `minWidth`, `maxWidth`, and the normalized `flex` shorthand only when present; the
vanilla view must remove those properties when a later update omits them.

### Ref contract discrepancy

The epic's earlier C1 note says that both components declare a ref, but the checked-in source
does not: only `InputProps` has `ref?: React.Ref<HTMLInputElement>`. `TextareaProps` extends
`HTMLAttributes<HTMLDivElement>` with no ref field, and there are zero `<Textarea ref={...}>`
callers. The plan below preserves the actual public API: `InputView` forwards its existing ref
to the inner input, while `TextareaView` does not add a new public ref prop. Adding a textarea
root ref would be an API expansion and requires an explicit decision before implementation.

## Implementation plan

### 1. Convert `Input` behind a vanilla view

Modify `src/renderer/uikit/Input/Input.tsx` to keep `InputProps` and return
`mountVanilla(InputView, props)`. Import `Input.css`; leave `Input.story.tsx`, `DateInput`, all
production callers, and the public exports unchanged.

Create `src/renderer/uikit/Input/InputView.tsx`:

- Extend `VanillaView<InputProps>` with a `div` root. Create the wrapper's child elements during
  `onMount`, not in the constructor: the constructor only creates the stable root and stores
  props.
- Build one direct `input` field and create/remove the optional start and end slot hosts as the
  corresponding prop changes between present and absent. Each host is a real flex item with
  `data-part="start-slot"` or `data-part="end-slot"`; do not leave an empty host that creates a
  phantom gap. Keep the order `start host → input → end host`.
- Use `fillSlot` for each present slot. Do not call a previous slot cleanup before handing a new
  value to `fillSlot`, because it owns React-root reuse. On removal, run the cleanup, remove the
  host, and clear its reference. Dispose both slot roots before the view's residual listeners.
- Forward `InputProps.ref` with `bindRef` to the inner `HTMLInputElement`. On a ref identity
  change, run the previous cleanup before binding the new ref; register the final cleanup with
  `own()`. The wrapper is never the public ref target.
- Keep the controlled value path: pull `value` out of the residual props and assign the native
  `field.value` property, then listen for the native `input` event and call the latest
  `onChange(field.value)` on every edit. React's text-input `onChange` is an input-frequency
  callback; native `change` would incorrectly defer search/filter/settings updates until blur.
  Preserve property-valued residuals (`value`, `defaultValue`, `checked`, and `autoFocus`) as
  properties rather than attributes; `applyRestProps` is attribute/listener-only and cannot carry
  their live DOM semantics. Keep `type`, `placeholder`, `aria-*`, `onInput`, `onKeyDown`, blur,
  focus, and mouse handlers in the residual path, and clear stale attributes/listeners on updates.
- Preserve the current field/root precedence. Component props continue to own wrapper state;
  the field's JSX spread is last, so residual field attributes may override colliding field
  `data-*` attributes just as they do today. The custom `onChange` API remains the internal
  native input path because it is omitted from the residual type.
- Project `name`, `size`, `variant`, `tone`, `disabled`, `readOnly`, and `invalid` onto the
  wrapper's `data-*` attributes, removing inactive/stale attributes. Project field size, tone,
  start/end presence, disabled, and read-only values on the field with the same DOM structure.
- Preserve `autoFocus` by keeping it out of `applyRestProps` and focusing the field during the
  mounted view lifecycle, rather than relying on an autofocus attribute on an already-inserted
  element. Ensure the current prop is used if the view receives an update before the browser
  focus callback runs.

Create `src/renderer/uikit/Input/Input.css` in `@layer uikit`:

- Translate `Wrapper`, `Field`, and `Slot` character-for-character into selectors rooted at
  `[data-type="input"]`, preserving focus-within, read-only, invalid, ghost, disabled, size,
  tone, padding, number-spinner, and slot styles.
- Keep the input as the direct field descendant and keep the existing `data-part` names so the
  AVGrid/FileSearch selectors above continue to match.
- Express `width`, `minWidth`, and `maxWidth` through Input-owned custom properties with CSS
  fallbacks. Number values become `${value}px`; strings pass through unchanged. Remove each
  custom property when its prop becomes absent so old sizing cannot leak into a reused root.
- Use the existing `--color-*`, `--space-*`, `--radius-*`, `--size-*`, and `--font-*` tokens with
  fallbacks; do not retain Emotion or inline style as the styling implementation.

### 2. Convert `Textarea` behind a vanilla view

Modify `src/renderer/uikit/Textarea/Textarea.tsx` to retain the current `TextareaProps` exactly,
import `Textarea.css`, and return `mountVanilla(TextareaView, props)`. Do not add a ref prop or
change the public barrel. Create `src/renderer/uikit/Textarea/TextareaView.tsx`:

- Extend `VanillaView<TextareaProps>` with a `div` root. On mount, apply the current props and
  install the native `input`, `paste`, and `keydown` listeners only when the current state is
  editable; on update, attach/detach that listener set when `disabled` or `readOnly` changes,
  mutate the same root, and never replace it. The listener set gates both the internal behavior
  and the caller's composed `onPaste`/`onKeyDown`, matching React's `editable ? handler : undefined`
  behavior.
- Keep the two-part value synchronization contract. Track the last prop value for which the
  view ran the React-equivalent synchronization; only when the incoming `value` differs from
  that previous prop value should the view compare `innerTextToString(root.innerText)` and assign
  `root.innerText`. A vanilla `update()` runs on every parent render, so an inner-text inequality
  alone would overwrite user edits and reset the caret on unrelated re-renders.
- Preserve editing semantics. For `input`, strip newlines in `singleLine` mode or normalize the
  trailing contenteditable newline, then call `onChange` with the resulting string. For paste,
  call the caller's `onPaste` first through `toPublicEvent`; if it prevents default, stop. Otherwise
  prevent the browser paste, apply the plain text (stripping newlines in single-line mode) at the
  current selection, restore the caret after the inserted node, and call `onChange` with the
  normalized root text. For keydown, call `onKeyDown` first and only suppress Enter when the
  caller did not prevent default.
- Use the native event facade from `react-compat.ts` for the two React-typed callbacks so
  `preventDefault`, `defaultPrevented`, `target`, `currentTarget`, and `nativeEvent` retain the
  existing observable contract. Residual handlers such as focus/blur still go through
  `applyRestProps`.
- Apply component-owned role, ARIA, `contentEditable`, spellcheck, `data-type`, `data-name`,
  size, variant, disabled, read-only, single-line, placeholder, and tab-index values after
  residual attributes, matching the current JSX precedence. Set the native property exactly as
  React does: `root.contentEditable = "plaintext-only"` when editable and
  `root.contentEditable = "false"` otherwise; do not replace this with `"true"` or an omitted
  attribute. Clear stale optional `data-*` and style properties when props are removed.
- Preserve `autoFocus`'s deferred focus behavior with a cancelable zero-delay task. Run it on the
  initial mount and only on the same prop transition that currently retriggers the React effect;
  cancel it during disposal.

Create `src/renderer/uikit/Textarea/Textarea.css` in `@layer uikit`:

- Translate the Emotion root selectors exactly: tokenized padding, background, text, border,
  radius, focus/active and read-only focus behavior, empty placeholder pseudo-content, disabled
  opacity/pointer-events, ghost rest/hover/focus behavior, white-space, overflow wrapping, and
  vertical scrolling.
- Map `minHeight`, `maxHeight`, `width`, `minWidth`, `maxWidth`, and normalized `flex` through
  component-owned custom properties. Append `px` to numeric dimensions, pass CSS strings through,
  map `true` to `1 1 auto`, map numeric flex to `${value} 1 auto`, and remove every property when
  the corresponding prop is absent.

### 3. Repair the shared event facade used by residual handlers

Update `src/renderer/uikit/shared/react-compat.ts` as part of this task. `toPublicEvent` currently
uses `Object.create(nativeEvent)`, which makes WebIDL accessors such as `KeyboardEvent.key`,
`defaultPrevented`, and `ClipboardEvent.clipboardData` brand-check against the facade and throw
`Illegal invocation`. Replace that lookup with a proxy/getter path that preserves the nine
explicit facade overrides but resolves every other property through the native event as its
receiver (for example, `Reflect.get(nativeEvent, property, nativeEvent)`; bind native methods to
the native event when needed). Do not copy accessor values once: live native getters must remain
live. This fixes all existing converted residual handlers as well as the Input/Textarea handlers.

Add a focused verification probe or manual check for `key`, `type`, `shiftKey`,
`defaultPrevented`, `clipboardData`, and a pointer coordinate through `toPublicEvent`; each must
be readable without throwing and `preventDefault`/`defaultPrevented` must remain connected to the
native event. No new test harness is introduced.

### 4. Preserve integration and verification boundaries

- Keep `Input/index.ts`, `Textarea/index.ts`, `uikit/index.ts`, story registry imports, and all
  production JSX unchanged. `DateInput` must continue to receive the same inner input ref and
  native date attributes through `Input`.
- Do not modify `fillSlot` or `mount.tsx`; they are established infrastructure owned by earlier
  tasks. `react-compat.ts` is the intentional exception: the `toPublicEvent` WebIDL fix above is
  required before this task can safely route keyboard and paste callbacks through it.
- Verify the external `[data-type="input"]` selectors in FileSearch and AVGrid after conversion,
  especially the direct `input` descendant and cell-fit overrides. Verify there is still no
  external textarea selector to preserve.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- In Storybook, exercise every Input and Textarea story control in light and dark themes,
  including slot appearance/removal, ref-driven focus, auto-focus, disabled/read-only, ghost,
  invalid, tone, all width/height/flex dimensions, single-line paste/Enter behavior, and
  multiline caret/value synchronization. Then smoke-check representative real callers: a grid
  search field, a Select/Autocomplete field, a browser URL field with both slots, a dialog
  textarea, and a rest-client or settings textarea.
- Capture the converted stories' `browser_snapshot` `data-*` output and compare it with the
  existing contract; confirm no stale attributes, listeners, slot hosts, or custom properties
  remain after toggling controls.

## Concerns / Open questions

1. **Textarea ref is an epic-document mismatch.** `Input` has a field ref and eleven callers;
   `Textarea` has neither a ref prop nor callers. The recommended implementation preserves the
   checked-in API and adds no new ref. If C1 requires a textarea root ref despite that evidence,
   decide that API expansion before implementation and specify whether it targets the contenteditable
   root (the only sensible target).

2. **`Input` slots are structural, not layout-transparent.** Their wrapper spans carry padding,
   `flex-shrink`, and alignment, unlike the `display: contents` children hosts in Checkbox/Tag.
   Removing and inserting the actual host is required to preserve the current flex gap and width;
   an always-present empty host will visibly shift the field.

3. **Temporary React roots can cross a parent commit.** `fillSlot` already defers React-root
   disposal and reuses a root for React-to-React updates. InputView must use that contract exactly:
   update the slot through `fillSlot`, never pre-dispose it, and do not replace the wrapper or slot
   host while React is committing.

4. **CSS layer precedence is observable in the grid and file-search integrations.** The new
   component rules are layered while the existing AVGrid and FileSearch ancestor rules are
   unlayered. That is intentionally safe because the caller rules win, but the smoke pass must
   confirm cell-height, borderless editing, field padding, and query-row flex sizing in both
   themes.

5. **Contenteditable event facades are more delicate than ordinary residual listeners.** Paste
   and keydown are intentionally composed callbacks, not pass-through `on*` props. The view must
   call the caller first, observe native `defaultPrevented`, and only then perform its internal
   mutation. A native event listener that performs internal work first would change URL-bar and
   single-line editor behavior without producing a type error.

6. **Native auto-focus timing differs from React's commit handling.** Input's current
   `autoFocus` is applied by React to the inner field, while Textarea uses an explicit zero-delay
   effect. The views should retain those timing contracts rather than simply setting an
   `autofocus` attribute and assuming the browser will focus an already-created element.

7. **The controlled value path must not reset user editing state unnecessarily.** Textarea has an
   explicit `innerText` equality guard plus a value-prop transition guard; Input should likewise
   avoid redundant native value writes during parent renders where the field already contains the
   requested string. This is especially important for IME/caret behavior and for the browser URL
   bar.

8. **`toPublicEvent` is shared infrastructure, not a local workaround.** The WebIDL receiver bug
   affects every converted component that forwards a residual event handler. US-1002 is simply the
   first task whose normal callers read `KeyboardEvent` and `ClipboardEvent` properties. Keep the
   fix centralized in `react-compat.ts`; do not add per-component event copying.

8. **No model is warranted.** Both components have controlled primary values and only view-local
   DOM/event work. Adding a `TComponentModel` or state hook would violate the UIKit controlled
   component rule and add no framework-neutral behavior.

## Acceptance criteria

- [ ] `Input` and `Textarea` React faces are thin `mountVanilla` adapters; their public props,
      barrels, stories, and production call sites remain compatible.
- [ ] `InputView` preserves the wrapper → optional start slot → direct input → optional end slot
      DOM shape using `div[data-part="start-slot|end-slot"]` hosts, with no empty slot host and
      the existing ref still targeting the inner input.
- [ ] Input string/DOM/React slot transitions preserve ordering, flex layout, cleanup, and React
      root reuse through `fillSlot`.
- [ ] Input controlled value, native input-frequency callback, property-valued fields, residual
      handlers/ARIA/data attributes, disabled/read-only/invalid/tone/variant/size state, and
      auto-focus behavior remain intact.
- [ ] `TextareaView` preserves the contenteditable root, value equality guard, normalized input,
      previous-value gating, caller-first paste/key handling, default-prevention semantics, exact
      `plaintext-only`/`false` contenteditable values, editable listener gating, caret restoration,
      and deferred auto-focus behavior.
- [ ] `toPublicEvent` exposes native WebIDL properties without illegal-invocation errors and
      preserves the connection between the public facade and the native event.
- [ ] `Input.css` and `Textarea.css` are layered under `@layer uikit`, preserve the Emotion
      selectors and token values, and do not introduce Emotion or component inline styles.
- [ ] Numeric width/height/flex values become valid px/normalized CSS custom-property values;
      string values pass through and removed values clear stale custom properties.
- [ ] FileSearch and AVGrid `[data-type="input"]` selectors continue to match the same wrapper
      and direct field nodes; no textarea selector is regressed.
- [ ] Storybook and representative real callers work in light and dark themes, including slot
      toggling, focus/ref paths, search/browser fields, dialogs, and single-line/multiline text
      editing.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.

## Files changed

| File or area | Change |
|---|---|
| `src/renderer/uikit/Input/Input.tsx` | Keep the public face and mount `InputView` |
| `src/renderer/uikit/Input/InputView.tsx` | New vanilla wrapper, field, slots, ref, and events |
| `src/renderer/uikit/Input/Input.css` | New layered wrapper, field, slot, and state rules |
| `src/renderer/uikit/Textarea/Textarea.tsx` | Keep the public face and mount `TextareaView` |
| `src/renderer/uikit/Textarea/TextareaView.tsx` | New contenteditable vanilla view and event composition |
| `src/renderer/uikit/Textarea/Textarea.css` | New layered contenteditable styling |
| `src/renderer/uikit/shared/react-compat.ts` | Fix native WebIDL property access through `toPublicEvent` |
| `doc/epics/EPIC-054.md` | Link US-1002 and correct its current ref-contract note |
| `doc/active-work.md` | Link US-1002 under EPIC-054 |
| `doc/tasks/US-1002-input-textarea/README.md` | This implementation plan |

No production caller, public barrel, shared helper, package dependency, or build configuration is
expected to change.
