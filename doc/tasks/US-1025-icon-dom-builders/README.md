# US-1025 — Icon DOM builders

**Epic:** [EPIC-058 — De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Status:** Implemented
**Depends on:** none
**Blocks:** US-1026 (`components/icons/` vanilla views)

## Goal

Give every language icon the same `createElement` capability already available on the 115
registered application icons, and give the dynamic board glyph a direct-DOM construction path.
Remove the renderer's last `react-dom/server` importer without changing the public icon exports,
language-to-icon mapping, board-icon resolution, or the visual artwork.

## Background

### The measured surface

`src/renderer/theme/language-icons.tsx` is 641 lines and contains 54 calls to
`createIcon()`/`createIconWithViewBox()`. They produce 55 exported component names because
`DrawIcon` and `DrawOrangeIcon` share one `makeDrawIcon(tint)` body:

| Surface | Current state | Target |
|---|---|---|
| `theme/icons.tsx` | 115 registered app icons; string bodies already receive `createElement` | No change |
| `theme/language-icons.tsx` → `.ts` | 54 JSX icon bodies; `createIconWithViewBox` therefore attaches no builder | 54 string bodies; every export has a DOM builder |
| `editors/board/BoardGlyph.tsx` | React component with a synchronous cache read and a React subscription | Keep the React face; add a pure element builder for the cache-hit/fallback path |
| `components/icons/file-icon-markup.tsx` | Uses `renderToStaticMarkup` for language/default, board, and component branches | Create an element and serialize its `outerHTML`; no server renderer |

The 14 production files importing `language-icons.tsx` are the existing consumers and are not
being rewritten here: browser, graph, HTML, image, Mermaid, SVG, settings, dialogs, sidebar,
link-open, and the two icon resolver/markup modules. US-1026 owns their conversion to vanilla
views.

### Why the builder is currently absent

`createIconWithViewBox` in `src/renderer/theme/icons.tsx` accepts either a string or a React node.
It assigns `IconWithViewBox.createElement` only for a string body. A JSX body remains renderable
through the React face but causes `createIconElement` to take its empty-icon fallback and emit a
development warning. The factory itself is already the correct shared implementation; this task
changes the language bodies to the representation that the factory supports.

The language file includes SVG forms that need deliberate handling, not just a tag replacement:

- SVG camel-case JSX attributes such as `fillRule`, `clipRule`, `strokeWidth`, `strokeLinecap`,
  `strokeLinejoin`, `stopColor`, `gradientUnits`, and `gradientTransform` become their SVG
  attribute spellings in the string markup.
- `KotlinIcon` contains `linearGradient` definitions with `id="a"`, `id="b"`, `id="c"` and
  `url(#...)` references. Preserve the definitions, IDs, and references exactly; do not try to
  “improve” the pre-existing duplicate-ID behavior while changing representation.
- The two draw exports use one body with a runtime tint. Keep `#4DD0E1` for `DrawIcon` and
  `color.misc.orange` (the existing `var(--color-misc-orange)` value) for `DrawOrangeIcon`.
- Fixed brand colors and `currentColor` values are part of the icon artwork. No token or theme
  change is part of this task.

### The server-renderer path

`components/icons/file-icon-markup.tsx` is used by `components/file-grid/FileGrid.tsx` to produce
HTML for av-grid cells. Its three React-server branches are:

1. a resolved static component (`LanguageIcon`, a compound-extension icon, or `DefaultIcon`);
2. a custom-board `BoardGlyph`;
3. the default `DefaultIcon`.

The system-file-icon branch is already a literal `<img>` and stays unchanged. The existing
“probe a missing board icon, then render the pending fallback” behavior remains outside this
task's scope, but the component cache key is in scope: the current `String(resolved.Icon)` key
collides for every factory-produced icon because the returned functions share the same function
source text. As a result, the first static icon rendered by a FileGrid can be reused for every later
file. US-1025 must fix that while it is replacing the three markup branches.

## Implementation plan

### 1. Convert the 54 language bodies to builder-compatible strings

Rename `src/renderer/theme/language-icons.tsx` to `src/renderer/theme/language-icons.ts` and edit
the renamed file:

- Keep all exported names, factory calls, viewBox values, default sizing, import paths, and
  `languageIconMap` consumers unchanged.
- Replace each JSX body passed to `createIcon`/`createIconWithViewBox` with a static SVG body
  string. Use the SVG attribute spellings expected by `innerHTML`, and preserve the existing
  element order, geometry, colors, opacity, IDs, gradients, and `currentColor` usage.
- Rewrite `makeDrawIcon(tint)` as a string-body factory. Interpolate only the two code-owned tint
  values; no file name, board path, or other runtime/untrusted data may enter an SVG body.
- Do not add the language exports to `src/renderer/theme/icon-registry.ts`. They remain extension /
  language mappings, not `IconName` entries. Do not change `src/renderer/theme/icons.tsx`; its
  existing string-body factory is the intended implementation.
- Keep this as a representation conversion. Do not remove IDs, normalize colors, change viewBoxes,
  or redesign any icon because the DOM path is being introduced.

The factory's existing common wrapper remains the DOM/React shape: the string is installed inside
the generated SVG group, with title/width/height/color/other SVG props handled by the factory.
After the rename, the React face also changes from JSX children to the factory's
`dangerouslySetInnerHTML` group. Verify representative conversions against both faces, including
one plain path, one multi-path group, Kotlin's gradients, the colored draw variants, and a
`currentColor` icon.

### 2. Add a direct-DOM board-glyph builder

Add a pure helper alongside the board glyph implementation, preferably
`src/renderer/editors/board/board-glyph-element.ts`, with a shape such as:

```ts
export function createBoardGlyphElement(boardRoot?: string, size = 16): Element {
    const path = getBoardIconPathSync(boardRoot);
    if (path) {
        const image = document.createElement("img");
        image.src = path;
        image.style.width = `${size}px`;
        image.style.height = `${size}px`;
        image.style.objectFit = "contain";
        return image;
    }
    return BoardIcon.createElement!({ width: size, height: size });
}
```

The exact implementation may avoid the assertion with a small checked helper, but it must keep
the return contract non-null. It must read the same synchronous board-icon cache as
`BoardGlyph.tsx`, return the custom image when a path is known, and otherwise return the existing
`BoardIcon` DOM builder at the requested size. It must not subscribe, await, or introduce a second
cache: the React `BoardGlyph` face remains responsible for `useBoardIcon()` and repainting after
`resolveBoardIcon()` completes.

Keep `BoardGlyph.tsx` as the React-facing component for the remaining React callers. If extracting
the helper causes the React face to share a small fallback utility, preserve its subscription and
its current `<img>` sizing (`width`, `height`, `objectFit: "contain"`) exactly.

### 3. Replace `react-dom/server` in the file-icon markup helper

Rename `src/renderer/components/icons/file-icon-markup.tsx` to `.ts` and update it so that:

- static resolved components call their `createElement({ width: size, height: size })` builder and
  serialize the returned element's `outerHTML`;
- the board branch calls `createBoardGlyphElement(resolved.boardRoot, size).outerHTML`;
- the default branch calls `DefaultIcon.createElement({ width: size, height: size }).outerHTML`;
- the system branch and board-icon probe remain as they are;
- component markup is cached by component identity, not by `String(resolved.Icon)`: use a
  `WeakMap<SvgIconComponent, Map<number, string>>` (or equivalent identity-keyed cache) so
  different factory-made icons cannot share one serialized result at the same size;
- the existing string-keyed cache may remain for board, system, and default branches;
- a missing builder is treated as an implementation error during this bounded migration, not as a
  silent blank cell. The acceptance scan in step 4 must prove that all static component branches
  used here have builders.

Remove the `react-dom/server` import and all JSX passed to `renderToStaticMarkup`. Do not change
`FileGrid`'s cell contract or introduce a React root per grid cell. `outerHTML` is safe here because
the markup is code-owned SVG or a locally resolved image URL; no untrusted file name or board
content is interpolated into the SVG body.

### 4. Verify builder coverage, server-renderer removal, and visual parity

Run the following source/build checks:

- `rg -n "react-dom/server|renderToStaticMarkup" src` returns no matches.
- Every one of the 54 `createIcon`/`createIconWithViewBox` calls in `language-icons.ts` now
  receives a string body, and each exported language icon exposes `createElement` at runtime.
- `icon-registry.ts` has no registry-entry change; its exclusion comment follows the
  `language-icons.tsx` → `.ts` rename and its 116-entry `IconName` contract remains unchanged.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass; inspect the built renderer
  for the absence of `react-dom/server` as EPIC-058 D3 requires.

In the running app, verify both faces and both themes where applicable:

- representative language icons render with the same viewBox, dimensions, colors and geometry in
  a React icon surface and in the `FileGrid` HTML-string surface;
- Kotlin's gradient icon keeps all three gradient fills, Draw/DrawOrange keep their distinct tints,
  and a `currentColor` icon follows the active color;
- a file with a custom board icon uses the image, a board without one uses `BoardIcon`, and the
  existing asynchronous probe/fallback path remains non-blocking;
- system file icons and the ordinary default file icon still render;
- FileGrid hover/sort/refresh does not replace the icon markup with an empty SVG or warning.

## Concerns / Open questions

### 1. String conversion changes both the React and DOM SVG shape

After conversion, the React face also uses `<g dangerouslySetInnerHTML>` instead of JSX children.
That is intentional: `createSvgElement` uses the same group wrapper, so the React and DOM faces
share the resulting shape. React normalizes JSX attribute names and constructs nodes; the string
path is parsed by `innerHTML` inside the shared factory and then serialized by `outerHTML`. The
conversion must use the SVG spelling table above and preserve the factory's group wrapper. A naive
transcription can produce a visually similar icon while dropping gradients or changing
`fillRule`. A source scan found no renderer CSS/styled selector that targets a direct SVG child
(`svg > *`, `svg path`, or equivalent), so the added group is inert for current styling. The
acceptance pass still needs both visual checks and a representative attribute/child-tree check;
typecheck cannot detect this class of defect.

### 2. Kotlin's gradient IDs are intentionally left alone

Multiple Kotlin icons can coexist with the same short IDs today because the React face already
emits them. Renaming them during this task would be an unrelated SVG behavior change, while
changing the reference spelling (`url(#a)` etc.) would break the artwork. Keep the current IDs and
references, and record any pre-existing duplicate-ID behavior rather than “fixing” it here.

### 3. `DrawOrangeIcon` depends on a CSS-variable-valued color

The string body cannot be a single immutable literal if it must retain `color.misc.orange`. Keep
the factory helper parameterized by the trusted tint and interpolate that existing value only.
Do not resolve the CSS variable to a theme-specific concrete color, because that would make the
icon stale across theme changes and diverge from the current React output.

### 4. Board icon resolution is synchronous at markup time

`fileIconMarkup` currently renders the same synchronous cache result and starts
`resolveBoardIcon()` when the board path is not known. The new builder must preserve that timing:
it cannot await inside a cell renderer or subscribe from a DOM helper. If a later board-cache
notification does not invalidate an already-cached markup string, that is existing cache behavior
and remains outside US-1025; US-1026/US-1027 can address reactive vanilla refresh when their views
own the cache subscription.

### 5. `outerHTML` is a renderer-only serialization seam

The helper runs in the Electron renderer, where `document` exists. It must not be moved to shared,
main-process, or script-API code. Keep the builder and serializer under renderer ownership and
retain the existing HTML-string boundary required by av-grid until US-1027 converts that caller.

### 6. Keep the React-facing language-icon API stable

This task intentionally leaves `LanguageIcon`, `FileTypeIcon`, `BoardGlyph`, and all current
language-icon imports React-compatible. The presence of a DOM builder is an enabling capability,
not permission to convert their callers early or to change `IconRef`, `SvgIconComponent`, or the
icon registry. US-1026 owns the component/view conversion.

### 7. The file-icon markup helper has no direct React fallback after the change

Before this task, a missing builder was masked by `renderToStaticMarkup`. After it, a missing
builder would either produce a blank icon or require reintroducing the server renderer. Treat
builder coverage as an explicit invariant: every static icon reachable from `resolveFileIcon()`
must have `createElement`. The component branch has exactly two sources: the 54 language-map
bodies converted in step 1 and `ArchiveIcon` from `filePatternIcons`, which is already
string-backed. `DefaultIcon` is covered by the default branch. No additional icon conversion or
registry entry is needed.

## Acceptance criteria

- [ ] All 54 language icon factory bodies are string-backed, and all 55 exported language-icon
      names remain available with unchanged viewBoxes and public props.
- [ ] `DrawIcon` and `DrawOrangeIcon` retain separate existing tints; `color.misc.orange` remains
      a live CSS-variable value rather than a baked theme color.
- [ ] Kotlin gradients, IDs, URL references, fixed colors, `currentColor`, dimensions, and
      representative SVG attribute mappings are preserved.
- [ ] A direct-DOM `BoardGlyph` builder preserves custom image and default `BoardIcon` behavior,
      sizing, and the existing non-blocking board-icon cache semantics.
- [ ] `file-icon-markup` produces equivalent SVG/IMG HTML through DOM builders, uses identity-based
      component caching, and no longer imports `react-dom/server` or calls `renderToStaticMarkup`.
- [ ] `rg -n "react-dom/server|renderToStaticMarkup" src` returns no matches, and the built
      renderer contains no server-renderer importer.
- [ ] `icon-registry.ts`, language mappings, FileGrid's renderer contract, and all current React
      icon consumers remain behaviorally and type-compatible.
- [ ] A FileGrid listing containing at least three different file types displays three different
      corresponding icons; the first icon rendered is not reused for later component icons.
- [ ] React and FileGrid/HTML-string surfaces are visually checked in light and dark themes,
      including plain, grouped, gradient, tinted, `currentColor`, custom-board, missing-board,
      system-icon, and default-icon cases.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.

## Files changed

### Expected modifications

| File | Change |
|---|---|
| `src/renderer/theme/language-icons.ts` (renamed from `.tsx`) | Convert 54 JSX bodies to string bodies; preserve exports and the draw tint helper |
| `src/renderer/theme/icon-registry.ts` | Update the exclusion comment only; the registry remains unchanged |
| `src/renderer/editors/board/BoardGlyph.tsx` | Keep the React face and share/expose the board-glyph DOM path if the helper is colocated |
| `src/renderer/components/icons/file-icon-markup.ts` (renamed from `.tsx`) | Replace server rendering with builder + `outerHTML` serialization and identity-based caching |
| `doc/active-work.md` | Link US-1025 to this document |
| `doc/epics/EPIC-058.md` | Link the planned task row to this document |

### New file if the pure helper is extracted

| File | Change |
|---|---|
| `src/renderer/editors/board/board-glyph-element.ts` | Pure `createBoardGlyphElement(boardRoot, size)` helper; no React hooks or subscriptions |

### Explicitly not changed

- `src/renderer/theme/icons.tsx` — the shared factory already works. `icon-registry.ts` receives
  only the rename-related comment update above; its 116-entry named-icon contract is unchanged.
- `src/renderer/components/icons/LanguageIcon.tsx`, `FileIcon.tsx`, and all language-icon callers
  — their React-facing conversion is US-1026 and later shell/component tasks.
- `src/renderer/editors/board/board-icon-cache.ts` — its cache, async probe, and notification
  semantics are reused, not redesigned.
- `src/renderer/components/file-grid/FileGrid.tsx` — it keeps the HTML-string cell boundary until
  US-1027.
- `src/renderer/editors/board/BoardsTree.tsx`, `BoardEditorModel.ts`, `ui/tabs/PageTabs.tsx`, and
  `ui/sidebar/PinnedRail.tsx` — they continue using the React `BoardGlyph` face for now.
