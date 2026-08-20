# US-997: Establish the DOM icon path and dual-face icon factories

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-054 - De-React Epic C1: Foundation and primitives](../../epics/EPIC-054.md)
**Created:** 2026-08-20

## Goal

Make the registered UIKit icon set usable by vanilla views without mounting a React root for
each icon. The existing React icon components and `renderIcon(icon, props?)` API remain compatible,
while the same icon definitions gain a DOM builder exposed as `createIconElement`.

This task changes the icon representation and factories only. It does not convert an icon
consumer, migrate `language-icons.tsx`, or change the public `IconRef`/`renderIcon` behavior.

## Background

### Current inventory

The current registry is the authoritative `IconName` source:

- `src/renderer/theme/icon-registry.ts` contains **116** entries.
- `src/renderer/theme/icons.tsx` contains the corresponding **116 icon exports** and is 1,599
  lines long.
- The two factory exports are `createIcon` and `createIconWithViewBox`.
- **115** registered icons are produced by one of those factories. `PersephoneIcon` is the one
  standalone function and reads `themeState` during React rendering.
- `src/renderer/theme/language-icons.tsx` is intentionally excluded. It contains 55
  language/resolver exports and imports the same factories with React-node bodies; its language
  id is the neutral key and it is not part of `IconName`.

The registry currently stores React components and `getIcon(name)` returns a
`SvgIconComponent`. `src/renderer/uikit/shared/slots.ts` uses that path in `renderIcon`, which is
already the runtime rule for icon slots: a string is always a registry name, and an unknown name
warns in development and renders nothing. US-997 must leave that rule and the function signature
unchanged.

### Why the body must change

The factories currently receive an already-created `ReactNode`:

```tsx
createIconWithViewBox("0 0 24 24")(
    <path fill="currentColor" d="..." />,
);
```

A `ReactNode` cannot be turned into an SVG DOM subtree without rendering it through React. The
body therefore becomes static, code-owned SVG markup, and the factory uses it for both faces:

```ts
const CloseIcon = createIcon(24)(`
    <g stroke="currentColor" stroke-width="1.5">
        <line x1="17" y1="7" x2="7" y2="17" />
    </g>
`);
```

Static markup is permitted by the de-React decision in `doc/de-react.md`: it is code-owned,
contains no runtime user data, and may be assigned to the icon's SVG body. It must not become a
general interpolated-HTML escape hatch.

### What must remain compatible

`SvgIconProps` extends `SVGProps<SVGSVGElement>`, and current callers use width, height, color,
class names, styles, titles, refs, and arbitrary `aria-*`/`data-*` props. The React face must
continue to emit the same root SVG contract (`viewBox`, default 24x24 sizing, color/style
behavior, title, and forwarded props). The DOM face must map the same prop surface to a real
`SVGSVGElement`, including `className` -> `class` and the style object -> element styles.

The language icon module makes the factory boundary more subtle: changing the factory parameter
to `string` only would break an explicitly excluded file. The factories therefore need a
transitional React-node input path for `language-icons.tsx`; only the main `icons.tsx` registry
definitions are required to have DOM builders in this task.

### Known non-literal inputs

The codemod is mechanical, but two existing patterns need an explicit treatment:

- `BoardColorIcon` uses `color.misc.*`, whose values are already CSS custom-property references
  such as `var(--color-misc-blue)`. The static body should contain those resolved variable names,
  not a JavaScript interpolation.
- `PersephoneIcon` reads `themeState` and has no factory body today. Its React face must retain
  live theme updates. Its DOM builder will read `themeState.get().isDark` when creating the element;
  a vanilla owner can rebuild it when its theme subscription fires.

## Implementation plan

### 1. Define the dual-face body/factory contract in `theme/icons.tsx`

- Introduce the internal body and DOM-builder types needed to represent a static SVG body and an
  optional DOM face without weakening `SvgIconComponent`.
- Preserve the existing exported `SvgIconProps`, `SvgIconComponent`, `createIcon`, and
  `createIconWithViewBox` names and call shape. Existing direct imports, especially the excluded
  language-icon module, must continue to typecheck.
- For a string body, have the factory produce the current React component and associate a DOM
  builder with the same definition. Do not make callers maintain a second per-icon body list.
- Attach the optional DOM builder to the function object returned by the factory (and widen
  `SvgIconComponent` with that optional property), so the registry's existing `ICONS` record stays
  the only icon-name list and the builder lookup is a property read rather than a parallel map.
- Keep the React component a normal function component. It must preserve the existing default
  `viewBox`, width/height defaults, `color` attribute, `style.color`, title rendering, refs, and
  residual SVG props.
- Render the static body in the React face through the approved static-markup seam. If a wrapper
  is needed to keep a dynamic `<title>` outside `dangerouslySetInnerHTML`, keep it internal to
  the SVG implementation and verify that no caller-visible root attributes or geometry change.
- Keep the React-node factory branch for `language-icons.tsx` as React-only metadata with no DOM
  builder. Do not rewrite that file or add its exports to `IconName`.

### 2. Codemod the 115 factory-produced registry bodies

Rewrite the JSX bodies in `src/renderer/theme/icons.tsx` to static markup strings. Use a codemod or
parser-assisted mechanical rewrite, then inspect the generated file rather than hand-editing 115
icons.

The conversion must:

- flatten JSX fragments without adding visual wrapper geometry;
- remove JSX comments;
- map SVG property names to DOM/SVG attribute names (`strokeWidth` -> `stroke-width`,
  `strokeLinecap` -> `stroke-linecap`, `strokeLinejoin` -> `stroke-linejoin`, `fillRule` ->
  `fill-rule`, `clipRule` -> `clip-rule`, `fillOpacity` -> `fill-opacity`, and the other
  camel-case SVG names present in the file);
- preserve numeric and string values exactly, including viewBox values, opacity values, path data,
  ids, and currentColor usage;
- resolve module constants that are already CSS-variable strings to their literal `var(--*)`
  values; never interpolate runtime props or user data into the body;
- preserve empty markup for `EmptyIcon` and the explicit fixed-color artwork of the colored icons.

The output is still one source body per icon. Do not introduce a sprite, a new icon naming scheme,
an icon descriptor accepted by `fillSlot`, or a second registry union.

### 3. Build the SVG DOM face with identical root-prop semantics

Implement the DOM builder used by `createIconElement`:

- create the root with `document.createElementNS("http://www.w3.org/2000/svg", "svg")`;
- set the same viewBox and default width/height as the React face;
- set `color` and the corresponding `style.color` behavior, then apply residual SVG/ARIA/data
  props with DOM names (`className` becomes `class`);
- support string style values and the existing object-style callers without passing a React style
  object to `setAttribute`;
- add a `<title>` element when `title` is present, with text assigned as DOM text rather than
  interpolated markup;
- put the body inside one unconditional `<g>` child in the DOM face. The React face must use the
  same `<g>` wrapper, including when `title` is absent, so the two faces have the same child
  structure and title does not change the geometry tree;
- assign the static body only as code-owned SVG markup; there must be no runtime-data interpolation
  into `innerHTML`;
- do not treat `ref` or React `children` as DOM attributes. The returned element itself is the
  value that a vanilla view owns and may pass to its own ref/binding path.

The DOM and React faces should have the same observable root attributes and equivalent SVG geometry.
An internal implementation wrapper is acceptable only if it does not alter that contract or any
existing descendant selector used by the renderer.

### 4. Extend the registry without creating a second name list

Modify `src/renderer/theme/icon-registry.ts` so each existing name resolves to its React component
and, where available, its DOM builder while `IconName` remains `keyof typeof ICONS`.

- Keep `getIcon(name)` source-compatible for `renderIcon` and existing consumers.
- Read the optional builder from the component property attached by the factory; do not create a
  second 116-key definition or builder map.
- Keep the exclusions documented in the file header: `language-icons.tsx`, resolver components
  under `components/icons/*`, `SvgIcon`/its types, and both factories are not `IconName` entries.
- Preserve registry insertion order and all 116 kebab-case names.
- For a registered name with no DOM builder, use the decision recorded under Concerns before
  implementation. Unknown runtime names must remain a development warning and no rendered icon,
  matching `renderIcon`.

### 5. Add `createIconElement` beside `renderIcon`

Update `src/renderer/uikit/shared/slots.ts` with the DOM counterpart:

```ts
export function isIconName(value: string): value is IconName;
export function createIconElement(name: IconName, props?: SvgIconProps): SVGElement;
```

`isIconName` is backed by the registry and is the one narrowing point for a converted view that
has narrowed `IconRef` to `string`. `createIconElement` takes `IconName`, never a generic
`IconRef`; it must not interpret arbitrary strings as text, create a React root, or import
`fill-slot`.

For defensive JavaScript calls and any registered entry whose builder is unexpectedly absent, the
helper returns an empty SVG carrying the correct viewBox and default sizing and emits the same
development warning as `renderIcon`. It never returns `null`, so every vanilla caller can append
the result without a nullable branch. Unknown runtime strings are rejected before this typed seam
by `isIconName`; the helper remains defensive at runtime as well.

Export it from `src/renderer/uikit/index.ts` beside `renderIcon` so later vanilla component tasks
can use the same public conversion seam. Do not change `renderIcon`'s return type, warning rule,
or React-node arm.

### 6. Verify the factory and registry boundary

- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Verify that all 116 registry keys remain present and that every static factory icon has a DOM
  builder; verify the intentional special-case behavior separately.
- Exercise representative icons from the stories and current consumers: a currentColor path, a
  grouped/fragment body, a fixed-color icon, a CSS-variable-colored icon, an icon with a custom
  viewBox, an empty icon, and icons receiving width/height/class/style/title props.
- Compare the React and DOM roots for `data-*`, `aria-*`, class, dimensions, color, viewBox, title,
  and SVG child geometry. The comparison is between the two faces of the icon, not a side-by-side
  Storybook component harness.
- Smoke-test the existing React consumers (`Button`, `IconButton`, `Checkbox`, `RadioGroup`,
  `Tag`, and the Storybook icon usages) to confirm that the React path is unchanged. Check the
  About/MainPage Persephone usages separately as well.
- Confirm `language-icons.tsx` is unchanged and its React-only factory calls still compile.
- Do not add a unit-test framework or migrate any component consumer in this task.

## Concerns / Open questions

1. **`PersephoneIcon` is the one explicit custom builder.** It is one of the 116 registry entries,
   but it is not factory-produced and its light/dark colors are selected by a React hook. Give it
   a DOM builder that reads `themeState.get().isDark` at creation time and preserves the current
   artwork. A vanilla owner must rebuild it when its theme subscription fires; the builder itself
   must not pretend that a one-time theme read is live.

2. **The missing-builder fallback is defensive, not the normal registry path.** All 116 entries
   must have builders, but `createIconElement` still returns an empty correctly-sized SVG with a
   development warning if a builder is missing or an untyped JavaScript caller supplies an unknown
   name. This keeps vanilla append sites total and makes a registry regression visible without
   changing the established `renderIcon` null behavior.

3. **The shared `<g>` wrapper is intentional.** React cannot render children and
   `dangerouslySetInnerHTML` on the same element, so both faces use one unconditional group around
   the static body. Current renderer selectors stop at the SVG root and do not reach icon internals;
   verify that remains true while implementing. The file has no defs, masks, gradients, `use`, or
   xlink references that would make repeated body injection unsafe. The four inert Sketch ids may
   be dropped during the codemod.

4. **Factory compatibility with language icons is load-bearing.** `language-icons.tsx` is excluded
   from the task but imports `createIcon`/`createIconWithViewBox` with JSX bodies. A string-only
   factory would make the excluded module fail typecheck; a factory implementation that assumes
   every body has a DOM builder would create a hidden React dependency in the DOM path. Keep the
   legacy React-node branch explicit and test it by compiling the full tree.

5. **SVG prop forwarding is broader than the icon body conversion.** Existing callers use
   `className`, `style`, `color`, width/height, title, refs, and arbitrary SVG props. The DOM face
   must define its conversion rules once; do not hand-map only the props used by the five C1
   `renderIcon` consumers and leave later C2/C3 callers to invent incompatible mappings.

6. **Fixed colors versus currentColor are intentional.** Several artwork icons are brand-colored
   and must retain their literal/CSS-variable fills. Only icons that already use `currentColor`
   should inherit the caller's color. Do not normalize all bodies to currentColor as part of the
   DOM migration.

7. **The body codemod can change geometry without a type error.** Attribute spelling, fragment
   flattening, self-closing tags, entity handling, and whitespace in path data are all visual
   risks. Inspect representative light/dark and 14px/24px/32px renders, and compare the generated
   DOM children with the React face before accepting the mechanical rewrite.

8. **The React face remains transitional.** This task does not remove the 116 named React exports,
   change direct icon imports, migrate `IconRef` callers, or make `language-icons.tsx` neutral.
   Later component tasks use `createIconElement` for name-valued icon props; the ReactNode arm of
   `IconRef` continues through `fillSlot` until the roadmap's later slot cleanup.

## Acceptance criteria

- [x] All 116 existing registry names remain present, with `IconName` still derived from the one
      `ICONS` record and no second manual name union.
- [x] The 115 factory-produced main icon bodies are static, code-owned SVG markup; JSX SVG
      attribute names are serialized correctly and all existing geometry, fixed colors, CSS
      variable colors, currentColor behavior, viewBoxes, and empty-icon behavior are preserved.
- [x] Both faces put each static body under the same unconditional single `<g>` wrapper, so title
      presence does not change the icon's child structure and React/DOM geometry comparisons are
      structurally meaningful.
- [x] `createIcon` and `createIconWithViewBox` produce the existing React face and a DOM builder
      from one body, while the React-node compatibility branch keeps `language-icons.tsx`
      unchanged and React-only.
- [x] `SvgIconProps` and direct icon component callers remain source-compatible; width, height,
      color, style, className, title, ref, `aria-*`, and `data-*` behavior is preserved on the
      React face and defined equivalently on the DOM face.
- [x] All 116 registry entries, including `PersephoneIcon`, have a DOM builder; Persephone reads
      the current theme at creation time and does not ship a stale fixed snapshot.
- [x] `isIconName` narrows runtime strings against the registry and `createIconElement(name, props?)`
      is typed with `IconName`, returns an SVG DOM element
      without mounting React, and is exported from the UIKit entry point; `renderIcon`'s signature,
      warning behavior, and React-node arm are unchanged.
- [x] The registry exposes both faces through the factory-attached builder property without a
      duplicate icon-name list; missing/unknown DOM builders warn and return an empty correctly-sized
      SVG, while unknown `renderIcon` names retain their existing development warning and null
      result.
- [x] Existing React icon consumers and the Storybook icon stories render unchanged; representative
      React/DOM face comparisons pass for root attributes, title, and SVG child geometry.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass. No unit-test harness,
      language-icon migration, component conversion, or unrelated consumer rewrite is introduced.
