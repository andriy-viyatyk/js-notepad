# US-1003: Panel — Emotion to CSS, no vanilla face

**Status:** Implemented
**Priority:** Medium
**Epic:** [EPIC-054 — De-React Epic C1: Foundation and primitives](../../epics/EPIC-054.md)
**Created:** 2026-08-20

## Goal

Move `Panel`'s static styling from Emotion to a co-located `Panel.css` stylesheet in
`@layer uikit`, while keeping the existing React component, public props, DOM shape,
data attributes, inline scalar-style behavior, and `.scroll-container` contract unchanged.

`Panel` deliberately does not gain a `VanillaView`, `createPanel`, or other vanilla API. It is
app-facing layout sugar with hundreds of existing callers; future vanilla views write their own
semantic container styles as decided by EPIC-054 C1-1.

## Background

### Scope and measured surface

EPIC-054 measured `Panel` as a React-only legacy shim. A fresh scan of the current tree on
2026-08-20 gives:

| Surface | Count |
|---|---:|
| Production `<Panel>` tags | 705 |
| Production caller files | 147 |
| `editors/` tags / files | 630 / 119 |
| `ui/` tags / files | 63 / 20 |
| `components/` tags / files | 6 / 3 |
| `uikit/` tags / files | 6 / 5 |
| Story-only tags | 73 |
| Declared `PanelProps` fields | 52, including the inherited HTML attributes |

The epic-open baseline was 716 production tags. The difference is a measurement-time drift, not a
new migration scope; use the pinned scan below for the implementation-time count rather than
mixing the two snapshots:

```powershell
rg -n --glob '*.tsx' --glob '!*.story.tsx' '<Panel\b' src/renderer
rg -l --glob '*.tsx' --glob '!*.story.tsx' '<Panel\b' src/renderer | Measure-Object
```

`Panel` has no state, effects, models, or event behavior of its own. Its work in this task is
therefore a styling extraction, not a React-to-DOM lifecycle conversion.

### Current implementation

`src/renderer/uikit/Panel/Panel.tsx` currently:

- renders one Emotion `styled.div` root with `data-type="panel"`, optional `data-name`, and the
  existing state attributes;
- computes token-backed padding, gap, flex, dimensions, overflow, positioning, and border-radius
  into an inline style object;
- uses `compactStyle` to omit `undefined` values because React clears a style property when it is
  present with an undefined value, which would otherwise damage the `flex` and `overflow`
  shorthand/longhand combinations;
- applies `.scroll-container` when `overflow`, `overflowX`, or `overflowY` is `auto` or `scroll`,
  unless `scrollbar="hidden"`;
- spreads residual HTML attributes before the computed `style`, so the computed style remains the
  final style prop in the current contract;
- renders children directly, with no wrapper or slot host.

The Emotion block contains only static layout/state rules: flex display, direction, background,
borders, border colors, shadow, accent stripe, disabled/dimmed/clickable states, empty hiding,
and parent-hover reveal. The per-instance scalar values remain inline because they are arbitrary
numbers or CSS lengths (`width`, `height`, `flex`, `inset`, offsets, and so on), not finite state.
This split follows the established C1 CSS contract: finite state is represented by `data-*`, while
runtime scalar values use the consuming element's inline style/custom-property path.

### Existing contracts that must survive

- `PanelProps` continues to omit public `style` and `className`; no caller migration or API cleanup
  is part of this task.
- `data-type`, `data-name`, `data-direction`, background, border, disabled, dimmed, clickable,
  empty, reveal, accent, and scrollbar attributes remain exactly as currently emitted.
- `children` remains a direct child of the root. No `PanelView`, `fillSlot`, React adapter, or
  additional DOM element is introduced.
- `compactStyle` remains unchanged and stays in `Panel.tsx`.
- `.scroll-container` is a real global class used by `theme/GlobalStyles.tsx:121-126`, not an
  Emotion implementation detail.

## Implementation plan

### 1. Preserve the React face and isolate the static rules

Modify `src/renderer/uikit/Panel/Panel.tsx` without changing `PanelProps` or the rendered JSX
shape.

- Remove the `@emotion/styled` root and the `color` import once their only use is moved to CSS.
- Keep the token imports and all token resolver functions used by the inline scalar style.
- Keep `compactStyle` byte-for-byte in behavior and preserve its explanation about React's
  undefined-style clearing.
- Keep the existing destructuring, padding precedence (`side > axis > all`), `scrollable` test,
  `scrollbar="hidden"` behavior, residual attribute forwarding, `style={inlineStyle}`, and direct
  `{children}` rendering.
- Add `import "./Panel.css"` from `Panel.tsx` alongside the other converted UIKit components.
- Add a short doc comment near `Panel` stating that it is a legacy, app-facing React layout shim;
  new vanilla views should use their own semantic container and stylesheet rather than introducing
  a vanilla Panel abstraction.
- Add a stable internal root class for the stylesheet. `PanelProps` omits `className`, so this is
  the one root marker that callers cannot override through the residual `...rest` path. Keep the
  existing `.scroll-container` class separate and preserve its conditional behavior.

The intended before/after root remains structurally equivalent:

```tsx
<div
    data-type="panel"
    data-name={name}
    data-direction={direction}
    data-bg={background || undefined}
    data-border={border || undefined}
    data-disabled={disabled || undefined}
    className={`${PANEL_ROOT_CLASS}${scrollable && !hideScrollbar ? " scroll-container" : ""}`}
    {...rest}
    style={inlineStyle}
>
    {children}
</div>
```

The actual implementation must retain every existing data attribute, including the less common
border-side, border-color, dimmed, hide, reveal, accent, and scrollbar attributes; the snippet is
only a shape reminder, not a shortened replacement.

### 2. Create `Panel.css` in the established layered form

Create `src/renderer/uikit/Panel/Panel.css` with one `@layer uikit` block. Translate the Emotion
selectors directly, keeping selector specificity and rule order where equal-specificity rules
compete.

Use the established app variables rather than importing runtime `color` values into TypeScript:

| Existing value | CSS variable |
|---|---|
| `color.background.default/light/dark/overlay` | `--color-bg-default/light/dark/overlay` |
| `color.border.light/default/active` | `--color-border-light/default/active` |
| `color.shadow.default` | `--color-shadow-default` |
| `color.misc.blue/yellow/red/green` | `--color-misc-blue/yellow/red/green` |
| spacing/gap/radius token values used by dynamic props | remain in the inline style path for this task |

The stylesheet must cover:

1. the flex and `box-sizing` base;
2. direction selectors for `column`, `row-reverse`, and `column-reverse`;
3. four background states;
4. all border-side presence selectors and the `subtle`/`default`/`active` border-color
   overrides, including side-specific overrides. Preserve the existing rule order and specificity:
   for example, `borderLeft + accent="info"` is blue when no stronger border-color selector is
   present, but `borderLeft + borderColor="default" + accent="info"` is re-colored by the
   two-attribute border-color rule. This is the current behavior even though the accent prop's
   prose suggests the stripe always wins;
5. shadow and all four accent stripes;
6. disabled (`opacity` plus `pointer-events`), dimmed, and clickable/hover states;
7. `[data-hide-when-empty]:empty`;
8. the parent-hover reveal selectors, including both `:hover` and `:focus-within` restoration.

Do not move arbitrary runtime values into a large generated selector matrix. `flex`, padding,
gap, alignment, dimensions, overflow, whitespace, word-break, position, inset, z-index, offsets,
and rounded values continue to be written by `inlineStyle`, with the same number-to-pixel behavior
React currently provides.

### 3. Root the stylesheet in a caller-proof marker

There are eight production `<Panel>` call sites that pass a custom `data-type` through the residual
props, including `board-info-editor`, `toolset-editor`, `tools-hub`, `search-boards-tab`,
`script-library-panel`, `tree-provider-error`, `tree-provider-empty`, and `tpv-search`.
Because the current spread occurs after the explicit `data-type="panel"`, those roots do not carry
`data-type="panel"` today. A stylesheet containing only `[data-type="panel"]` would therefore
remove all Panel styling at those sites.

The implementation must preserve those caller-visible values and still style those roots. Use the
stable internal class as the preferred resolution:

- Add a constant class such as `panel-root` alongside the existing `scroll-container` computation,
  and root every `Panel.css` selector at that class. This styles all Panel roots, including the
  eight custom-`data-type` roots, without depending on a caller-controlled `data-*` attribute.
- Keep a source comment explaining why this C1-1 legacy shim uses a class instead of the normal
  `[data-type="panel"]` convention: `data-type` and every other `data-*` attribute can currently
  be overridden by residual props, while `className` is intentionally omitted from `PanelProps`.
- Do not use `data-direction` as the stylesheet root. Although it is currently Panel-exclusive, a
  caller can override it through the same residual-prop mechanism and erase the whole stylesheet.

Do not silently move `data-type` after `{...rest}`: that would change the eight existing custom
`data-type` values and violate the no-call-site-change contract. Do not add a list of eight app
selectors to `Panel.css`; those are caller identifiers, not the Panel styling contract.

### 4. Verify CSS loading, precedence, and global contracts

- Import `Panel.css` from `Panel.tsx`, matching the loading pattern of `Text`, `Spinner`, `Input`,
  and the other converted components.
- Keep `.scroll-container` on the same roots under the same overflow/scrollbar condition. Verify
  that `GlobalStyles.tsx:121-126` still controls its hover scrollbar appearance, and that
  `ui/app/Pages.tsx:55` still applies its direct-child `.scroll-container` rule.
- Verify `[data-scrollbar="hidden"]` separately. Its rules live in
  `theme/GlobalStyles.tsx:132-139`, not in the Panel Emotion block or `Panel.css`, and must remain
  unchanged and effective.
- Confirm the new `@layer uikit` rules do not get accidentally overridden by unlayered app/editor
  rules at representative Panel surfaces. The current search finds no direct external
  `[data-type="panel"]` styling; `CollapsiblePanelStack` intentionally targets a Panel descendant
  for pointer-events and must remain behaviorally unchanged. Explicitly exercise the
  `[data-reveal-on-hover] [data-visibility="parent-hover"]` descendant rule: it reaches into child
  components (including `Dot`) and is the Panel selector most exposed to unlayered descendant CSS.
- Verify theme variables in light and dark themes, especially backgrounds, border colors, shadow,
  and accent stripes, including the `borderLeft + borderColor + accent` combination above.

### 5. Update the task and epic records

- Link this README from `doc/active-work.md` under EPIC-054.
- Link US-1003 from the EPIC-054 linked-task table and record that the implementation is CSS-only,
  with no vanilla Panel API.
- Do not add a new key-files entry: no new subsystem owner or reusable runtime module is created.

## Concerns / Open questions

1. **Root selector and custom `data-type` values are the main correctness decision.** The existing
   `Panel` spread intentionally allows eight callers to replace `data-type="panel"`, and it also
   allows a caller to replace `data-direction`. Both data-attribute options are therefore fragile.
   Use the stable internal `panel-root` class: `className` is omitted from `PanelProps`, so the
   marker cannot be replaced through residual props. This is a deliberate, documented exception to
   the usual `[data-type]` root convention for the legacy React-only Panel shim.

2. **The eight custom `data-type` roots are a pre-existing UI-contract bug.** They are not addressable
   as `data-type="panel"`, and six also omit `name`, so browser snapshots and UI inspection helpers
   cannot identify them as Panels. US-1003 must preserve those values and route around the problem;
   it must not silently repair the call sites under C1-2. The follow-up is recorded in
   `doc/tasks/backlog.md`.

3. **Layered CSS loses to unlayered CSS regardless of specificity.** `Panel` is used in 119 editor
   files and 20 UI files, where surrounding Emotion or editor-local rules may use generic descendant
   selectors. No direct external Panel selector was found, but the risk is broad enough that the
   smoke pass must cover dense editor layouts, sidebar panels, dialogs, board surfaces, and the
   Storybook shell in both themes. The parent-hover reveal rule is the named high-risk descendant
   case. A visual regression in a single panel can affect many screens.

4. **Dynamic style extraction must not become a new static-style API.** About 43% of the epic-open
   production Panel tags used at least one scalar such as `flex`, width/height, min/max dimensions,
   offsets, or z-index. Those values are intentionally left in `inlineStyle`; moving them into
   per-value CSS classes or a new prop vocabulary would enlarge the task and change the legacy
   contract. The only CSS extraction target is the finite, data-attribute-driven Emotion block.

5. **`compactStyle` looks redundant after removing Emotion but is not.** It protects React's
   shorthand/longhand update semantics and must remain unchanged. Removing it because CSS now owns
   static rules would reintroduce stale or cleared `flex`/`overflow` behavior when props change.

6. **The Emotion-generated class disappears.** No production Panel caller passes `className` or
   `style` (both are omitted from `PanelProps`), and the meaningful existing class is the explicit
   `.scroll-container`. The task replaces the generated Emotion class with the private `panel-root`
   marker, but does not add a public styling escape hatch or alter caller class handling.

7. **Panel remains intentionally React-only.** Creating `PanelView`, `createPanel`, or a generic
   vanilla utility-prop container would contradict C1-1 and duplicate the exact abstraction the
   epic is retiring. C2 components that currently use Panel will write their own DOM and semantic
   CSS when they convert.

## Acceptance criteria

- [x] `Panel.tsx` no longer imports or uses `@emotion/styled` for its root, and `Panel.css` contains
      the complete static rule set inside `@layer uikit`.
- [x] `PanelProps`, all 52 declared fields, residual HTML attributes, `ref`, direct children, and
      the existing DOM shape remain unchanged at production call sites.
- [x] All existing data attributes are emitted with the same values and precedence, including the
      eight intentional custom `data-type` values; the private `panel-root` CSS scope styles those
      instances as well as ordinary `data-type="panel"` roots without relying on caller-controlled
      data attributes.
- [x] `compactStyle` and the dynamic inline scalar-style path retain their current behavior,
      including padding precedence, number-to-pixel conversion, shorthand/longhand handling,
      overflow, positioning, and border-radius.
- [x] `.scroll-container` is applied exactly when overflow is `auto`/`scroll` and
      `scrollbar !== "hidden"`; `GlobalStyles`' `.scroll-container` and
      `[data-scrollbar="hidden"]` rules plus `Pages.tsx`' direct-child rule remain intact.
- [x] Background, border, shadow, accent, disabled, dimmed, clickable, empty, and parent-hover
      styles match the Emotion implementation in light and dark themes, including the
      `borderLeft + borderColor + accent` ordering case and a child carrying
      `data-visibility="parent-hover"`.
- [x] No `VanillaView`, `mountVanilla`, `fillSlot`, new Panel factory, public style prop, or caller
      migration is introduced.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [ ] A smoke pass covers the Panel story controls plus representative editor, sidebar, dialog,
      board, and Storybook surfaces; both normal and custom-`data-type` Panel roots are inspected
      for computed styles and preserved data attributes.

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/uikit/Panel/Panel.tsx` | Remove Emotion root, preserve React face and inline scalar-style logic, import CSS, add legacy-shim comment |
| `src/renderer/uikit/Panel/Panel.css` | New layered static Panel stylesheet |
| `doc/epics/EPIC-054.md` | Link US-1003 in the epic task table |
| `doc/active-work.md` | Link US-1003 under EPIC-054 |
| `doc/tasks/backlog.md` | Record the pre-existing custom-`data-type` Panel addressing gap |
| `doc/tasks/US-1003-panel-css/README.md` | This investigation and implementation plan |

No production caller, story API, public barrel, or vanilla runtime module is expected to change.

## Related work

- [EPIC-054 — De-React Epic C1](../../epics/EPIC-054.md)
- [US-983 — Emotion-to-CSS conventions](../US-983-emotion-to-css-conventions/README.md)
- [US-1000 — Text and stateless leaves](../US-1000-text-stateless-leaves/README.md)
- [UIKit authoring rules](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
