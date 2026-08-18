# US-983: Emotion-to-CSS conventions

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-052 — De-React Epic A: Style and token foundation](../../epics/EPIC-052.md)
**Created:** 2026-08-18

## Goal

Write the project rules for replacing a UIKit or one-of-a-kind app-chrome Emotion stylesheet with
plain, co-located CSS. The rules must make component scope, theme/token references, runtime values,
keyframes, selector specificity, and stylesheet loading explicit before US-984 converts the Spinner
pilot or later epics convert the remaining eligible surface.

This task changes developer documentation and adds only the global cascade-layer bootstrap needed
to make the convention deterministic. It does not convert a component, add a component stylesheet,
change a package dependency, or reopen the CSS custom-property decision settled in EPIC-052 A6.

## Background

EPIC-051's styling inventories were relocated to
[`doc/architecture/styling-inventory.md`](../../architecture/styling-inventory.md) by US-980. The
frozen baseline contains 79 renderer files importing Emotion: 65 static/non-prop files, 5 dynamic
files, and 9 superseded AVGrid files. One dynamic file is story-only, leaving 69 eligible
production files after the AVGrid exclusion. The same inventory records three Emotion keyframe
definitions and a separate baseline of 133 literal `style={{...}}` sites across 51 non-story files.

The inventory is deliberately not a conversion work list for this task:

- The nine UIKit AVGrid files are superseded by the dependency-free `av-grid` replacement and are
  excluded from the Epic A conversion estimate.
- The five dynamic Emotion files are classified by runtime input, not merely by visual variation.
  Scalar inputs use component-scoped CSS custom properties; discrete state uses `data-*`
  attributes. This is EPIC-052 A6 and is already decided.
- `Dialog`, `ProgressBar`, and `Spinner` use Emotion `keyframes`, which must become stable global
  `@keyframes` names in plain CSS.
- `Notification` embeds a raw `notification-slide-in` keyframe string in a rendered `<style>`
  element. It is already one of the eligible static files, but the raw style-element form is a
  legacy exception that a future Notification conversion must remove.
- The 133 inline-style sites are a separate inventory. Runtime geometry, third-party/native-host
  integration, and measured DOM values remain owned by their views unless a later task explicitly
  proves that a CSS custom property is the right seam.

US-981 emits the numeric UIKit scales as app-local variables on `:root`:
`--space-*`, `--gap-*`, `--radius-*`, `--size-*`, and `--font-*`. US-982 provides the live theme
variables (`--color-*`) and `resolveColor()` for consumers that need concrete values in JavaScript.
CSS should consume the variables directly; canvas, Monaco, data-URI, and other non-CSS consumers
use `resolveColor()` or `themeState` rather than reading computed style themselves.

The current editor convention is the precedent for co-location and loading only:
`BrowserView.css`, `BrowserTabsPanel.css`, `GraphDetailPanel.css`, and `MarkdownBlock.css` live beside
their owning component and are imported from the component module. Those files use class-root
selectors and contain pre-existing literal values, so they are not the model for UIKit root scoping
or token usage. UIKit currently says that all styles use Emotion and has no co-located component CSS
convention. This task replaces that part of the guide for components that have been converted, while
leaving existing unconverted components untouched until their migration task.

## Before → after convention

The current Spinner shape is representative of the dynamic case that US-984 will implement later.
US-983 documents the target shape but does not make this source change.

Before, Emotion owns both static rules and prop interpolation:

```tsx
const Root = styled.span<{ $size: number; $color?: string }>(
    ({ $size, $color }) => ({
        width: $size,
        height: $size,
        color: $color,
        "& svg": { width: $size, height: $size, animation: `${spin} 1.5s steps(10) infinite` },
    }),
);

return <Root data-type="spinner" $size={size} $color={color}>...</Root>;
```

After conversion, the component imports a co-located stylesheet, keeps its public props, and writes
only its scalar runtime inputs to the owning DOM element:

```tsx
import "./Spinner.css";

return (
    <span
        data-type="spinner"
        style={
            {
                "--spinner-size": `${size}px`,
                ...(color ? { "--spinner-color": color } : {}),
            } as React.CSSProperties
        }
    >
        ...
    </span>
);
```

```css
[data-type="spinner"] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--spinner-size, 32px);
    height: var(--spinner-size, 32px);
    flex-shrink: 0;
    color: var(--spinner-color, currentColor);
}

[data-type="spinner"] > svg {
    width: var(--spinner-size, 32px);
    height: var(--spinner-size, 32px);
    animation: persephone-spinner-spin 1.5s steps(10) infinite;
}

@keyframes persephone-spinner-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
```

The exact CSS formatting is not normative; the scope, fallback, custom-property, state, and
keyframe rules are.

## Implementation plan

### 1. Update the project-wide styling standard

Edit `doc/standards/coding-style.md` in the `Styling with Emotion` section:

- Keep Emotion permitted for existing UIKit and one-of-a-kind `ui/` chrome until each surface has
  an explicit conversion task, but state that a converted component has one styling system: plain
  CSS, not a mixture of Emotion and static CSS for the same DOM subtree.
- Define the co-located file convention: `Component/Component.tsx` imports
  `Component/Component.css`; the stylesheet is plain global CSS processed by Vite. Use the existing
  editor-local CSS files as the co-location/loading precedent only — their class-root selectors and
  pre-existing literal values are not the new scoping/token model. Do not add CSS modules, a runtime
  class-name generator, or a second global style registry for this migration.
- Require every component stylesheet selector to begin at the component's required
  `[data-type="component-name"]` root. Use direct-child selectors where the old Emotion selector
  depended on DOM shape. Codify the established `data-part="..."` vocabulary for stable internal
  regions; do not rename existing part names, use Emotion's generated class names, or use generic
  global selectors.
- Preserve the existing public API boundary: a converted UIKit component still omits public
  `style` and `className` props. Its implementation may set a custom property on its own root DOM
  element. An owning parent may still target a descendant's `[data-type]` or `[data-part]` from its
  own stylesheet, as existing `AudioPlayer`, `FileSearch`, `GlobalStyles`, `CollapsiblePanelStack`,
  and AVGrid patterns do; this is governed by the owner-stylesheet and cascade rules, not a public
  styling escape hatch.
- State that editor-owned generated-content and third-party/native-host CSS remains in a scoped
  editor stylesheet under a semantic editor root, as it is today; this task does not move the 133
  inline-style baseline into UIKit CSS.

### 2. Document theme colors and design-token references

In the same section, add the CSS forms that follow from US-981 and US-982:

- Use `var(--color-...)` for theme colors in CSS. The names must correspond to `theme/color.ts` and
  the nine theme definitions; do not copy a color literal from a theme file into a stylesheet.
- Use `var(--space-*)`, `var(--gap-*)`, `var(--radius-*)`, `var(--size-*)`, and `var(--font-*)` for
  app design tokens. CSS arithmetic uses `calc(var(--space-md) * 2)`; JavaScript arithmetic keeps
  using the numeric exports from `uikit/tokens.ts`.
- Do not make CSS read `themeState`, import `color.ts`, or call `resolveColor()`. Those are
  JavaScript APIs for canvas, Monaco, webview, data-URI, and similar consumers.
- Require a usable fallback for every component-owned runtime custom property. A missing script or
  an omitted optional prop must still produce a valid layout and paint. The fallback belongs in the
  `var()` use site, for example `var(--spinner-size, 32px)` or
  `var(--color-bg-default, transparent)`. Do not duplicate the complete token table in every
  component; US-981 installs the app token stylesheet at startup.
- Keep custom properties scoped to the component root or the exact element that consumes them.
  Never write component runtime values to `:root`, `document.documentElement`, or a shared ancestor.

### 3. Define dynamic-prop translation rules

Add a UIKit subsection covering the two A6 forms, with examples from the inventory:

- Scalar runtime geometry or appearance is a component-prefixed custom property written on the
  consuming DOM element. Names follow `--<component-kebab-name>-<property-kebab-name>`, such as
  `--spinner-size`, `--progress-pill-top`, or `--tree-indent-size`. The CSS declaration consumes
  it with a fallback. Only the value changes; the stylesheet remains static.
- Boolean or finite discrete state is represented by a `data-*` attribute on the element whose
  appearance changes, with the inactive boolean omitted (`undefined`). Use selectors such as
  `[data-clickable]`, `[data-first]`, or `[data-selected]`; do not mint a class per state.
- A value that is inherently a DOM measurement, a third-party handle property, a webview/native
  integration value, or a one-off placement that has no static CSS consumer may remain an inline
  style. It must be named in the owning task's ledger; it is not silently converted just because
  the file is being migrated.
- Do not use a custom property as a hidden public styling API. The component owns the property name,
  sets it internally, and removes/omits it when the optional value is absent.

The guide should include a compact mapping table for the measured dynamic files:

| Source input | Static-CSS form |
|---|---|
| `ProgressOverlay.topPx` | `--progress-pill-top` on the pill element |
| `ProgressOverlay.clickable` | `data-clickable` |
| `Spinner.size`, `Spinner.color` | `--spinner-size`, `--spinner-color` |
| `Tree` indent/chevron sizes | component-prefixed size variables |
| `Tree` first-indent state | `data-first` |

The superseded AVGrid dynamic file remains excluded from conversion planning. US-984 is the first
implementation check for this rule because Spinner exercises two scalar inputs and a keyframe.

### 4. Define keyframe naming and placement

Add a keyframe subsection to both the project-wide and UIKit guidance:

- Replace each Emotion `keyframes` declaration with a plain `@keyframes` block in the owning
  component stylesheet.
- Names are globally unique and stable: `persephone-<component-kebab-name>-<animation-kebab-name>`.
  The four animation entries therefore become:

  | Source | Required stable name |
  |---|---|
  | `Dialog` `pulse` | `persephone-dialog-pulse` |
  | `ProgressBar` `indeterminateSlide` | `persephone-progress-bar-indeterminate-slide` |
  | `Spinner` `spin` | `persephone-spinner-spin` |
  | `Notification` `notification-slide-in` | `persephone-notification-slide-in` |

- Keep the keyframe declaration in the same stylesheet as its consumer. A component must not render
  a `<style>` element to inject a keyframe string. Do not use generic global names such as `spin`,
  `pulse`, or `loading`, and do not rely on Emotion-generated names.
- Preserve the animation duration, timing function, iteration count, fill behavior, and selector
  that applies the animation. A name change is not permission to alter motion behavior.
- Existing names are grandfathered until their owning stylesheet is converted:
  `notification-slide-in` in `Notification.tsx` and `browser-loading-pulse` in
  `editors/browser/BrowserView.css`. They are documented exceptions, not names permitted for new
  stylesheets. Renaming either is outside US-983's component-conversion scope.

### 5. Define selector, specificity, and insertion-order preservation

Document the conversion procedure that prevents a visual regression hidden from typecheck:

- Translate each Emotion root/nested rule to a corresponding static selector before simplifying
  anything. Preserve descendant/direct-child relationships, pseudo-classes, `data-*` conditions,
  `:not(...)`, `:has(...)`, and selector order.
- Add `src/renderer/theme/style-layers.css` with the one startup layer-order declaration
  `@layer base, uikit, app, editor;`, and import it from `src/renderer.tsx` before the React root is
  mounted. Every new static stylesheet must place its rules in the appropriate layer: `uikit` for
  UIKit, `app` for shell/coupled app chrome, and `editor` for newly converted editor-local CSS.
  `base` is reserved for global reset/token infrastructure. The order is declared once, before any
  lazy chunk can load, so it does not depend on Vite CSS chunk timing or dev/prod insertion order.
- Keep the cascade in the same conceptual order within a layer: base layout/paint, variants and
  sizes, hover/focus states, selected/active/disabled states, and the most-specific interaction
  overrides last. Do not flatten a selector merely because its current appearance looks equivalent
  in one state.
- Existing Emotion rules and the two grandfathered keyframe styles remain unlayered legacy CSS until
  their owning migration. A conversion must not leave an equal-specificity cross-component tie
  split between a new layer and an unlayered legacy rule; migrate the related owner/descendant rules
  together or preserve the relationship with an explicitly justified selector.
- Put a cross-component descendant rule in the stylesheet of the component that owns the parent
  relationship. A child stylesheet must not style an unrelated global `.label`, `.button`, or
  `.content` selector. Shared selection fragments such as `uikit/shared/selection-style.ts` are
  migrated with all of their owners in one explicitly scoped task; they are not copied into each
  component independently.
- A co-located CSS import is the component's loading boundary. Do not depend on an unrelated lazy
  chunk importing a rule needed by another component. If a rule is genuinely shared, place it in a
  `uikit/shared/*.css` file and import it from every owning entry point, or keep the shared
  infrastructure in its current form until a coordinated migration.
- After conversion, compare the rendered DOM and computed styles for default, hover, focus,
  selected, disabled, loading, and variant states. Check direct-child SVG sizing and equal-specificity
  rules explicitly; `npm run typecheck` cannot detect a cascade or insertion-order regression.

### 6. Update the UIKit authoring guide and its templates

Edit `src/renderer/uikit/CLAUDE.md`:

- Replace the current “No separate `.css` or `.scss` files — all styles use Emotion” statement with
  the new co-located CSS rule and the legacy boundary for components not yet converted.
- Keep Rule 1's data-attribute state contract, and codify the existing `data-part` convention for
  internal structural hooks used by static CSS. Established part names already used in the codebase
  are the vocabulary; this task must not rename them. Clarify that a class may not be used as a
  substitute for `data-*` state, and generated Emotion classes are not a migration target.
- Add a static-CSS component template alongside (or clearly marked as the legacy form of) the
  current Emotion template. It must show the stylesheet import, `[data-type]` root, `data-part`
  children, token/color variables, a component-scoped runtime variable with a fallback, and a
  stable keyframe name.
- Update the Emotion convention bullets so they remain accurate for existing components but do not
  instruct new converted components to create additional `styled.*` blocks.
- Preserve the existing rules for controlled components, accessibility, public `style`/
  `className` omission, `RenderGrid`'s explicit composition API, and editor-local CSS boundaries.

### 7. Verify the conventions, layer bootstrap, and handoff to US-984

Perform documentation and source-boundary checks after the edits:

- Confirm the documents name all four animation entries, both grandfathered legacy names, all five
  dynamic inventory entries and their runtime inputs, the nine-file AVGrid exclusion, and the
  133-site inline-style boundary.
- Confirm references point to the durable styling inventory, US-981 token variables, US-982 theme
  state/resolver, and the US-984 Spinner pilot.
- Confirm the only source changes are the startup layer declaration in
  `src/renderer/theme/style-layers.css` and its import from `src/renderer.tsx`; no component
  stylesheet or component implementation changes are made. No package dependency or build-config
  change is needed.
- Run `git diff --check`. No unit-test harness is introduced; visual verification belongs to US-984
  and each later component conversion.

## Concerns / Open questions

1. **Plain CSS is global rather than CSS-module scoped.** Vite supports the existing plain stylesheet
   import pattern, but CSS rules are globally visible. The proposed `[data-type]` root plus
   `data-part` selectors are the containment contract. A generic descendant selector or a stylesheet
   imported only incidentally by another component would reintroduce the collision and loading risks
   this task is meant to prevent. Recommendation: make the root/data-part scope mandatory and reject
   a CSS-module or runtime-class dependency for this migration.

2. **Fallback values can drift from source defaults.** Runtime custom-property fallbacks such as
   Spinner's `32px` duplicate a component default by design. Token variables are different: US-981's
   startup stylesheet is the single token source, so every component must not duplicate all token
   values. The standards should distinguish component-owned runtime fallbacks from guaranteed app
   token/theme infrastructure and require a fallback only where omission would make the declaration
   invalid or unusable.

3. **Internal `style` is still needed for scalar custom properties.** The public UIKit API must keep
   rejecting caller-provided `style` and `className`, while a converted implementation needs a
   narrowly typed `style` object on its own raw root element to set `--component-*`. The guide must
   state this distinction clearly so the migration does not either open a public escape hatch or
   forbid the A6 mechanism.

4. **Cross-component styling has no single existing CSS entrypoint.** Most UIKit styles are currently
   registered by Emotion at module evaluation, while future components may be loaded through lazy
   editor chunks. The owner-stylesheet rule and the explicit `uikit/shared/*.css` option avoid relying
   on import order accidentally. If a later migration discovers a truly global shared stylesheet is
   needed, that should be a separate infrastructure decision rather than an undocumented exception.

5. **`selection-style.ts` is shared styling infrastructure.** It currently exports selector objects
   consumed by Tree, ListBox, CategoryList, and SelectableRow. Converting one consumer alone would
   either duplicate the contract or leave the focused-selection behavior split between Emotion and
   CSS. US-983 documents coordinated ownership; the actual conversion remains with the later task
   that migrates all owners.

6. **The keyframe names are global even when the component is local.** A generic `spin` or `pulse`
   name can collide with editor CSS or a future component. The `persephone-<component>-<animation>`
   prefix is intentionally verbose and stable; changing it later is a stylesheet compatibility
   change, not a cosmetic rename.

7. **A visual check is still required.** Static CSS can typecheck while changing specificity,
   animation loading, focus/hover precedence, or direct-child SVG sizing. US-983 can make those
   checks mandatory, but US-984 must demonstrate them with Spinner and later migrations must repeat
   the relevant state matrix for their component.

8. **Layered new CSS and unlayered legacy Emotion have different precedence.** Unlayered rules
   outrank layered rules, so the layer declaration cannot by itself reconcile a new child stylesheet
   with an old Emotion parent rule. The convention therefore requires related owner/descendant
   selectors to migrate together or to carry an explicit, reviewed specificity relationship. The
   legacy unlayered state is temporary and is not silently rewritten by US-983.

## Acceptance criteria

- [ ] `doc/standards/coding-style.md` documents co-located plain CSS for converted UIKit/app-chrome
      components, its Vite import boundary, public `style`/`className` restriction, and the editor
      stylesheet boundary.
- [ ] `src/renderer/uikit/CLAUDE.md` documents the converted-component CSS form while retaining a
      clear legacy boundary for unconverted Emotion components and preserving Rule 1's data-state
      contract.
- [ ] The root scope is `[data-type="component-name"]`; internal static hooks use `data-part` or
      an explicitly justified semantic hook; generated Emotion class names and generic global
      selectors are not part of the convention.
- [ ] Theme colors use `--color-*` variables, design tokens use the five US-981 namespaces, and
      JavaScript-only consumers use US-982's `themeState`/`resolveColor()` rather than CSS reads.
- [ ] Scalar runtime inputs use component-scoped custom properties with usable `var()` fallbacks;
      discrete state uses present/absent or enumerated `data-*` attributes; measurement and
      integration-only inline styles remain explicitly bounded.
- [ ] The four animation entries have stable, globally prefixed target names and the naming/placement
      rule is documented: `persephone-dialog-pulse`, `persephone-progress-bar-indeterminate-slide`,
      `persephone-spinner-spin`, and `persephone-notification-slide-in`; the existing
      `notification-slide-in` and `browser-loading-pulse` names are explicitly grandfathered.
- [ ] `@layer base, uikit, app, editor;` is declared once at startup, and converted stylesheets are
      assigned to the appropriate layer independently of lazy-chunk load order.
- [ ] The documentation preserves selector shape, specificity, state precedence, direct-child
      behavior, and stylesheet import/load boundaries, including the coordinated treatment of
      `uikit/shared/selection-style.ts`.
- [ ] The doc records the 79-file Emotion baseline, 69-file eligible production boundary, 9-file
      AVGrid exclusion, 4 animation definitions, and separate 133-site inline-style inventory, with
      links to the durable source and US-984's Spinner handoff.
- [ ] This task makes no component conversion: the only source changes are the layer bootstrap and
      its renderer entry import; no dependency or build-config change is made, and
      `git diff --check` passes.

## Files changed

| File | Change |
|---|---|
| `doc/standards/coding-style.md` | Add the project-wide static-CSS conversion rules and preserve editor/chrome boundaries |
| `src/renderer/uikit/CLAUDE.md` | Add UIKit co-located CSS, data-part, dynamic-value, and keyframe guidance |
| `src/renderer/theme/style-layers.css` | Declare the startup cascade-layer order |
| `src/renderer.tsx` | Load the layer-order declaration before the React root mounts |
| `doc/epics/EPIC-052.md` | Link US-983 in the task table |
| `doc/active-work.md` | Add the planned task under EPIC-052 |
| `doc/tasks/US-983-emotion-to-css-conventions/README.md` | This implementation plan and handoff |

No `src/renderer` component stylesheet or component implementation, package manifest, or Vite
configuration is changed by US-983. US-984 owns the first source conversion and visual proof.
