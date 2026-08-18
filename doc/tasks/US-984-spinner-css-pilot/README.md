# US-984: Pilot — convert Spinner to co-located CSS

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-052 — De-React Epic A: Style and token foundation](../../epics/EPIC-052.md)
**Created:** 2026-08-18

## Goal

Convert `uikit/Spinner` from Emotion to the co-located plain-CSS convention established by
US-983. The pilot must preserve the public API and rendered behavior while proving the three
new styling mechanisms: static `[data-type]` rules in the `uikit` cascade layer, scalar runtime
custom properties for `size` and `color`, and a stable component-prefixed keyframe name.

## Background

`src/renderer/uikit/Spinner/Spinner.tsx` is the smallest eligible dynamic Emotion component. It
currently defines one Emotion `keyframes` animation and one `styled.span` root:

- `size?: number`, default `32`, controls the root and nested SVG width and height.
- `color?: string` is an optional CSS color override; when absent, the spinner inherits
  `currentColor`.
- The root already emits `data-type="spinner"` and `data-name`, uses `role="status"`, and sets
  `aria-live="polite"` / `aria-label="Loading"`.
- The root's Emotion rule targets every descendant `svg`, sets its dimensions, and applies
  `spin` for `1.5s steps(10) infinite`.
- `ProgressIcon` is the only child rendered by Spinner. It is a registry icon whose SVG has its
  own viewBox/attributes; the component CSS must continue to override its rendered dimensions.

The component has 14 production usages across 13 files. The call-site distribution is:

| Area | Files / usages |
|---|---|
| UIKit internals | `uikit/Tree/Tree.tsx`, `uikit/Tree/TreeItem.tsx`, `uikit/ListBox/ListBox.tsx`, `uikit/Progress/ProgressOverlay.tsx`, `uikit/AVGrid/AVGrid.tsx` — 5 usages |
| Editors | `editors/browser/BrowserView.tsx`, `editors/browser/TorStatusOverlay.tsx`, `editors/draw/DrawBody.tsx`, `editors/graph/GraphBody.tsx`, `editors/mermaid/MermaidBody.tsx` (2), `editors/mneme-root/MnemeRootEditorView.tsx` — 8 usages |
| UI | `ui/app/AsyncEditor.tsx`, `ui/dialogs/TorInfoDialog.tsx` — 2 usages |

The observed sizes are the default `32` plus `12`, `14`, `16`, `18`, and `40`; only
`TorStatusOverlay` supplies a color override. The superseded AVGrid usage is checked last. The
story exposes `size` and `color` for interactive verification. No caller passes a styling escape
hatch, and `SpinnerProps` deliberately omits public `style`, `className`, and the native `color`
attribute.

US-981 provides the app token variables and US-983 provides the conversion rules. The startup
layer order is declared by `src/renderer/theme/style-layers.css` as
`@layer base, uikit, app, editor;`. This task also hardens the bootstrap by keeping that import
as the first import in `src/renderer.tsx`, before any lazy component stylesheet can establish a
layer. The task uses `@layer uikit`; it does not modify the layer declaration, token generator,
theme resolver, or any other component.

## Before → after

The current implementation passes Emotion-only props to the styled root:

```tsx
<Root
    data-type="spinner"
    data-name={name}
    role="status"
    aria-live="polite"
    aria-label="Loading"
    $size={size}
    $color={color}
    {...rest}
>
    <ProgressIcon />
</Root>
```

The converted implementation keeps the same DOM contract and writes only component-owned scalar
values to the root. The optional color variable is omitted when there is no override:

```tsx
import "./Spinner.css";

<span
    {...rest}
    data-type="spinner"
    data-name={name}
    role="status"
    aria-live="polite"
    aria-label="Loading"
    style={{
        "--spinner-size": `${size}px`,
        ...(color ? { "--spinner-color": color } : {}),
    } as React.CSSProperties}
>
    <ProgressIcon />
</span>
```

The stylesheet owns the static layout and animation:

```css
@layer uikit {
    [data-type="spinner"] {
        width: var(--spinner-size, 32px);
        height: var(--spinner-size, 32px);
        color: var(--spinner-color, currentColor);
    }

    [data-type="spinner"] svg {
        width: var(--spinner-size, 32px);
        height: var(--spinner-size, 32px);
        animation: persephone-spinner-spin 1.5s steps(10) infinite;
    }

    @keyframes persephone-spinner-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
}
```

The snippet is illustrative; the implementation must retain the complete current root rule,
including `display`, alignment, and `flex-shrink`, and must preserve the existing descendant
SVG selector rather than changing its DOM reach accidentally.

## Implementation plan

### 1. Harden the layer bootstrap before adding the first pilot stylesheet

Edit `src/renderer.tsx`:

- Move `import "./renderer/theme/style-layers.css";` to the first import in the file.
- Add a short comment that this import must remain first so `base, uikit, app, editor` is
  established before any component stylesheet can create a layer.
- Do not change the declaration itself or add another layer bootstrap.

### 2. Replace the Emotion implementation without changing Spinner's public contract

Edit `src/renderer/uikit/Spinner/Spinner.tsx`:

- Import `./Spinner.css` and remove the `@emotion/styled` and `keyframes` imports.
- Delete the local `spin` keyframes object and `Root` styled definition.
- Keep `SpinnerProps` as an `HTMLAttributes<HTMLSpanElement>` omission of `style`, `className`,
  and native `color`. Do not expose a public styling escape hatch as part of the conversion.
- Keep the `name`, `size`, and `color` props and their current defaults/semantics.
- Render the same semantic `span`, `data-type`, `data-name`, status role, live region, accessible
  label, and `ProgressIcon` child.
- Write `--spinner-size` as `${size}px` on the root. Write `--spinner-color` only when a color
  override is present, so the no-override path continues to inherit the surrounding `color`.
  Use a narrowly asserted `React.CSSProperties` object for the custom-property names; do not
  widen the public props to `CSSProperties`.
- Preserve the current rest-props behavior for supported HTML attributes. The typed public API
  omits `style` and `className`; do not claim a stronger runtime hardening than that contract
  provides. If the implementation places `{...rest}` first, keep the required `data-type`,
  accessibility attributes, and internal runtime style after it; otherwise retain the current
  ordering deliberately and document that the guarantee is type-level.

### 3. Add the co-located static stylesheet

Create `src/renderer/uikit/Spinner/Spinner.css`:

- Wrap all rules in `@layer uikit`.
- Scope every selector from `[data-type="spinner"]`.
- Translate the full Emotion root rule: `display: inline-flex`, centered alignment,
  `flex-shrink: 0`, and the variable-backed width/height.
- Keep the existing descendant `svg` relationship, set both dimensions from the same
  `--spinner-size` value, and retain `1.5s`, `steps(10)`, and `infinite` exactly.
- Use `var(--spinner-size, 32px)` and `var(--spinner-color, currentColor)` so the component
  remains valid if its script-side style is absent or an optional prop is omitted.
- Define the stable global keyframe `persephone-spinner-spin`; do not retain Emotion's generated
  name or introduce a generic `spin` name.
- Do not add hardcoded theme colors, generic global selectors, CSS modules, or a shared stylesheet.

### 4. Check callers and the story boundary

Review all 14 production usages across the 13 files listed in Background and
`src/renderer/uikit/Spinner/Spinner.story.tsx` after the conversion. No caller should need a
change: `size` remains numeric and `color` remains a string, including the browser/Tor color
override. Keep the story's existing controls and do not migrate the story's own framework boundary
as part of this pilot.

### 5. Verify behavior, cascade precedence, and both styling paths

Run `npm run typecheck`, `npm run lint`, and `git diff --check`. Then use the Storybook editor or
the running renderer to inspect Spinner at the default and representative explicit sizes (`12`,
`14`, `16`, `18`, `40`) and with/without `color`. Check the five UIKit-internal call sites,
especially Tree/ListBox/Progress placements, before checking the superseded AVGrid placement:

- root and SVG dimensions match the requested size;
- the SVG keeps rotating with the same duration, step timing, and iteration count;
- the default color inherits from the parent;
- an explicit color reaches the icon through `currentColor`;
- the semantic/accessibility attributes and `data-name` remain present;
- the surrounding layout still treats the root as an inline-flex, non-shrinking item.

Inspect a light and dark theme and at least one dense caller such as `TreeItem` or
`TorStatusOverlay`. Confirm in DevTools that the stylesheet is in the `uikit` layer, the root
custom properties are local to the Spinner element, and no Emotion Spinner class or generated
`@keyframes` rule remains.

Because unlayered Emotion declarations outrank every layered declaration regardless of
specificity, perform the pilot's explicit precedence audit:

1. Search all renderer styles for rules targeting `[data-type="spinner"]`; after conversion the
   only such rules should be the component's own `Spinner.css` rules.
2. Search `src/renderer/theme/GlobalStyles.tsx` and every editor stylesheet for global element
   selectors (`svg`, `button`, `input`, `a`) that could match Spinner or its `ProgressIcon`.
3. For each of the 13 call-site files, inspect Emotion ancestor selectors for descendant rules
   reaching into Spinner. The current audit is clean: there is no existing Spinner target or
   global SVG rule, and TreeItem's SVG rules are scoped to `.tree-icon`/`TreeItemChevron` while
   Spinner is inside `ChevronStub`.

Record that the check covers the 14 usages and that no unlayered rule can override the pilot's
layout or SVG sizing. This procedure is part of the handoff to later pilots, where the result
may not be clean.

## Concerns / Open questions

1. **Inline style is internal, not a public API.** The migration needs `element.style` to carry
   `--spinner-size` and the optional `--spinner-color`, while `SpinnerProps` must continue to
   reject caller-provided `style` and `className`. The implementation should keep that boundary
   explicit in the type and use a local typed custom-property object only at the raw `span`.

2. **The color prop accepts arbitrary CSS strings.** This is existing API behavior and the pilot
   must not introduce a color-token validation layer. The custom property should receive the
   caller's value unchanged; CSS resolves it through `color`, with `currentColor` as the omitted
   value fallback. Invalid caller input remains the caller's existing CSS responsibility.

   `color: var(--spinner-color, currentColor)` is intentionally equivalent to the old omitted
   path: Emotion dropped `color: undefined`, so the root inherited; the CSS declaration resolves
   to `currentColor`, which computes to that same inherited value. The only separate concern is
   cascade precedence, covered by the explicit audit in step 5.

3. **Selector specificity and SVG reach are behavior-sensitive.** The old Emotion selector targets
   a styled-root class plus descendant `svg`. The static root attribute plus descendant `svg` has
   the same specificity shape, and the stylesheet is in the startup-declared `uikit` layer. Do
   not simplify it to an unrelated global `svg`, or change it to a direct-child selector without
   verifying that the component's DOM contract intentionally requires that restriction.

4. **Fallbacks duplicate the component default by design.** `32px` appears in both the TypeScript
   default and the CSS fallback. That duplication is required for a valid pre-script/omitted-style
   render and is limited to the component-owned runtime value; it is not a second copy of the
   app token table.

5. **Existing consumers may rely on Emotion injection only indirectly.** Spinner is rendered by
   UIKit, editor, UI, and superseded AVGrid code, but no consumer targets its generated class or
   passes a style override. The conversion should therefore be self-contained. Still check the
   dense tree/grid placements visually because a CSS-layer or SVG-sizing issue will not appear in
   typecheck or lint.

6. **The first layered stylesheet changes the bootstrap's failure mode.** The layer order is
   determined by first appearance, so `style-layers.css` must be the first import in the renderer
   entry. This is a deliberate one-line infrastructure hardening included in the pilot, not a
   change to the layer declaration itself.

7. **The pilot does not validate every future CSS migration.** Spinner does not exercise boolean
   `data-*` state, cross-component descendant ownership, or measured inline geometry. Those remain
   governed by US-983 and must be proven by their owning conversion tasks; expanding Spinner's API
   to cover them would make this pilot less representative, not more complete.

## Acceptance criteria

- [ ] `Spinner.tsx` no longer imports Emotion, and `Spinner.css` is imported from the component.
- [ ] `style-layers.css` is the first import in `src/renderer.tsx`, with a comment preserving
      that ordering; the declared layer order remains `base, uikit, app, editor`.
- [ ] Spinner keeps the existing public props and DOM/accessibility contract; `style` and
      `className` remain excluded from `SpinnerProps`.
- [ ] `Spinner.css` uses `@layer uikit` and scopes all rules from `[data-type="spinner"]`.
- [ ] Root layout and descendant SVG sizing match the current Emotion behavior, with both driven
      by `--spinner-size` and a `32px` fallback.
- [ ] `color` is inherited when omitted and uses `--spinner-color` when supplied, without
      changing the public color API or adding hardcoded theme values.
- [ ] The animation remains `1.5s steps(10) infinite` and uses the stable global name
      `persephone-spinner-spin`; no Emotion-generated keyframe remains.
- [ ] All 14 production usages across 13 files and the Spinner story compile without caller
      changes.
- [ ] The cascade audit finds no unrelated `[data-type="spinner"]` rule, no matching global
      internal-element rule, and no Emotion ancestor selector that reaches into Spinner; the
      layered-vs-unlayered precedence check is recorded.
- [ ] Visual verification covers default/explicit sizes, color override, light/dark themes, a
      dense UIKit placement, and the preserved accessibility attributes.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; no test harness or unrelated
      source/build configuration change is introduced.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Spinner/Spinner.tsx` | Replace the Emotion root with a raw span and scoped runtime custom properties |
| `src/renderer/uikit/Spinner/Spinner.css` | Add layered static Spinner rules and stable keyframes |
| `src/renderer.tsx` | Load the existing layer-order stylesheet first in the renderer entry |
| `doc/epics/EPIC-052.md` | Link US-984 in the epic task table |
| `doc/active-work.md` | Link the planned US-984 task under EPIC-052 |
| `doc/tasks/US-984-spinner-css-pilot/README.md` | This implementation plan |

No caller, story, package dependency, Vite configuration, theme infrastructure, or layer
declaration should change in this task. The renderer import order is the one intentional bootstrap
hardening included in the pilot.
