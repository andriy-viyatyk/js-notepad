# US-981: Emit `uikit/tokens.ts` as CSS custom properties

**Status:** Implemented
**Priority:** Medium
**Epic:** [EPIC-052 - De-React Epic A: Style and token foundation](../../epics/EPIC-052.md)
**Created:** 2026-08-18

## Goal

Expose the numeric UIKit design-token scales as app-local CSS custom properties on `:root`,
without changing the existing TypeScript exports or the 41 current importers. A vanilla view
must be able to consume spacing, gap, radius, size, and font values through CSS without importing
React or the UIKit token module.

The task also removes `radius.full` from the TypeScript scale, as decided by EPIC-052 A7. The
three components that use it make circles on square elements, so they will use the local CSS value
`50%` instead of retaining a shared token for that shape.

## Background

`src/renderer/uikit/tokens.ts` currently exports five `as const` numeric scales:

| Scale | Entries | CSS prefix | Example values |
|---|---:|---|---|
| `spacing` | 7 | `--space-*` | `--space-md: 8px` |
| `gap` | 6 | `--gap-*` | `--gap-lg: 8px` |
| `radius` | 5 after this task | `--radius-*` | `--radius-md: 4px` |
| `height` | 6 | `--size-*` | `--size-control-md: 26px` |
| `fontSize` | 7 | `--font-*` | `--font-base: 14px` |

There are 32 entries today. After deleting `radius.full`, the app emits 31 variables, all mapped
uniformly from a number to a pixel string. The TypeScript values remain numbers, so existing
Emotion declarations, JavaScript arithmetic, and the 41 importers keep compiling unchanged.

The app prefix is deliberately different from the board prefix. `src/renderer/editors/board/`
has a public `--p-*` contract used by board authors; it must continue to expose `--p-space-*`,
`--p-gap-*`, `--p-radius-*`, `--p-size-*`, and `--p-font-*`. The generic `mapScale()` helper
currently lives in `board-theme.ts`; EPIC-052 A2 requires moving that helper to the theme layer so
the app and board maps cannot drift while their names remain separate.

The theme module is loaded during renderer startup and applies the saved theme before the first
React content renders. Token values are theme-independent constants, so they should be installed
once during that startup sequence and must not be re-emitted on theme changes. The implementation
should not put token installation behind a React component or a theme subscription.

## Current consumers and `radius.full`

The only `radius.full` call sites are:

| File | Current use | Required replacement |
|---|---|---|
| `src/renderer/uikit/Dot/Dot.tsx:89` | Dot root is square at runtime (`width` and `height` both use the diameter) | `borderRadius: "50%"` |
| `src/renderer/uikit/Slider/Slider.tsx:68` | WebKit slider thumb is `12 x 12` | `borderRadius: "50%"` |
| `src/renderer/uikit/Slider/Slider.tsx:84` | Firefox slider thumb is `12 x 12` | `borderRadius: "50%"` |

The board-facing `--p-radius-full` name is a public compatibility surface, separate from the app
`radius` export. It is used by the bundled demo in `assets/demo-board/style.css:150` and
`assets/demo-board/app.js:247`, and by the checked-in user boards:
`.persephone/boards/Demo/style.css:161`, `.persephone/boards/Demo/app.js:247`,
`.persephone/boards/Persephone/index.html:93`, `.persephone/boards/Tabulator/index.html:92`,
and `.persephone/boards/Tasks/index.html:103`. `assets/mcp-res-boards.md:363` also documents
the metric families with a wildcard that includes the name. Do not silently remove or change this
public board variable while deleting the internal app token.

## Implementation plan

### 1. Remove the app-only full-radius token

Update `src/renderer/uikit/tokens.ts`:

- delete `radius.full` and update the scale comment/count to describe a numeric-only scale;
- leave every other key and numeric value byte-for-byte unchanged;
- keep the existing `spacing`, `gap`, `height`, and `fontSize` exports and their names unchanged.

Update `src/renderer/uikit/Dot/Dot.tsx` and `src/renderer/uikit/Slider/Slider.tsx` to use the
literal CSS value `50%` at the three call sites above. Do not replace it with a new `circle` token,
another shared alias, or a numeric radius.

### 2. Hoist the scale mapper into the theme layer

Create `src/renderer/theme/token-vars.ts` as the single generator for app and board metric maps.
Move the existing `camelToKebab()` and `mapScale()` logic from
`src/renderer/editors/board/board-theme.ts` into this module. The mapper should:

- convert camel-case keys such as `controlMd` to `control-md`;
- accept `Record<string, number>` scales and format every value as `${value}px` unconditionally;
- have no string-value branch; a future non-pixel token must require a new design decision and a
  deliberate signature change;
- preserve deterministic object/key order so generated CSS and board payloads are stable;
- export the generated app map from the five scales using the app prefixes;
- export `mapScale()` for the board adapter rather than duplicating the conversion logic.

The module may import the leaf constants from `uikit/tokens.ts`; it must not import React, Emotion,
the board editor, or application state. The token constants remain the source of truth, and the
theme module is only responsible for exposing them to CSS.

### 3. Install the app variables once at renderer startup

In `src/renderer/theme/token-vars.ts`, add a small idempotent installer that writes the generated
app map as one deterministic `:root` stylesheet. The preferred form is a marked
`<style>` element in `document.head` (for example, `data-persephone="token-vars"`) whose text is
generated from the app map. This keeps the values available to vanilla views, avoids a React or
Emotion dependency, and avoids hand-maintaining a second `.css` copy of the token table.

Call the installer from `src/renderer/theme/themes/index.ts` during its existing module-load
startup, alongside the initial `applyTheme(readStartupThemeId())`. The installer must be safe if
startup code is evaluated more than once: it should update or reuse the marked element rather than
append duplicate style tags. It must not run on every `applyTheme()` call, because these values do
not depend on the selected theme.

The resulting stylesheet must contain exactly these app namespaces and no board namespace:

```css
:root {
    --space-xs: 2px;
    --gap-md: 6px;
    --radius-md: 4px;
    --size-control-md: 26px;
    --font-base: 14px;
}
```

The snippet is illustrative; the implementation emits all 31 entries from the source scales.
Add a source comment that these names are app-global on `:root` and inherit into embedded surfaces;
future third-party CSS should be checked for collisions before introducing another global token
family.

### 4. Reuse the mapper in the board adapter

Update `src/renderer/editors/board/board-theme.ts` to import `mapScale()` from the new theme module
and remove its local `camelToKebab()` / `mapScale()` definitions. `BOARD_TOKEN_VARS` must continue
to produce the existing `--p-*` names and values, and `BoardWebview.tsx` must continue passing
that map through `registerBoard()` unchanged.

Preserve the public board contract deliberately. Keep `--p-radius-full: "50%"` as an explicit
compatibility alias in `BOARD_TOKEN_VARS` while excluding it from the app map and
`uikit/tokens.ts`; this preserves old boards without reintroducing `radius.full` as an app token.
Place the alias immediately after `...mapScale("--p-radius", radius)` and before the size map:

```ts
export const BOARD_TOKEN_VARS: Record<string, string> = {
    ...mapScale("--p-space", spacing),
    ...mapScale("--p-gap", gap),
    ...mapScale("--p-radius", radius),
    // Frozen board contract (EPIC-034); the app token was removed by EPIC-052 A7.
    "--p-radius-full": "50%",
    ...mapScale("--p-size", height),
    ...mapScale("--p-font", fontSize),
};
```

The position is significant: object insertion order is serialized into the board payload, so this
keeps the board map's 32 keys, order, and values byte-identical to the current output. Do not
change the alias value to `999px`, `10px`, or another visually preferred pill radius; existing
boards may depend on the current `50%` behavior, and a value change is a separate board-contract
decision.

### 5. Verify source, CSS, and board boundaries

Use the source and runtime checks below. No token consumer should be migrated from numeric
TypeScript values to CSS in this task; that belongs to later styling/view work.

- `rg -n 'radius\.full' src/` returns no matches;
- `rg -n '\-\-radius-full' src/` returns no matches (the app map must not emit it);
- `rg -n 'p-radius-full' src/` returns exactly one match, the board compatibility alias;
- the generated app map contains exactly 31 keys, with no `--p-*` names and no `--radius-full`;
- before the board refactor, capture `JSON.stringify(BOARD_TOKEN_VARS)`; after it, compare the
  serialized values and require an identical string (32 keys, same order, same values);
- in a dev-mode renderer DevTools console,
  `["--space-md","--gap-md","--radius-md","--size-control-md","--font-base"].map(v => [v, getComputedStyle(document.documentElement).getPropertyValue(v).trim()])`
  reports `8px`, `6px`, `4px`, `26px`, and `14px` respectively;
- run the same DevTools expression after switching themes and confirm the metric values are
  unchanged;
- board registration still receives the existing `--p-*` map, including the explicitly decided
  full-radius compatibility behavior;
- `npm run typecheck` and `npm run lint` pass;
- the UIKit smoke check covers Dot, both slider browser implementations, and a board/demo metric
  view, with no visible radius or sizing regression.

## Concerns / Open questions

1. **Board `--p-radius-full` versus app `radius.full`.** The epic's A7 decision is clear for the
   app scale, but the board contract is public and the bundled and checked-in user boards still
   use `--p-radius-full`. Dropping the variable from `BOARD_TOKEN_VARS` would be a compatibility
   change not mentioned in A7. Keep the explicit board-only alias at exactly `50%`, in its original
   insertion position, then remove the alias only in a separately announced board-contract change.
   This keeps the app's 31-token invariant while honoring the frozen `--p-*` contract. The alias's
   `50%` value is intentionally preserved even though non-square pills may use their fallbacks;
   changing that behavior is outside US-981.

2. **One-time stylesheet versus inline root properties.** Writing the map into a marked static
   stylesheet is preferred because it is visible as CSS, works for vanilla views, and is generated
   from the TypeScript source without involving React. Setting the same values through
   `document.documentElement.style.setProperty()` would also work, but would make the foundation
   look like mutable theme state and would be less clear to inspect. Do not use `GlobalStyles` for
   this: token availability should not depend on the Emotion/React global-style component.

3. **Startup ordering.** The installer must run after a DOM exists but before application content is
   painted. `themes/index.ts` already runs during renderer initialization and applies the saved
   theme synchronously; the implementation must preserve that ordering and must not defer token
   installation to `useEffect`, `AppContent`, or a lazy editor import.

4. **CSS arithmetic is deliberately deferred.** Existing JavaScript uses such as
   `spacing.md * 2` remain numeric. When a later conversion needs arithmetic in CSS, it should use
   `calc(var(--space-md) * 2)` as specified by EPIC-052, but US-981 must not broaden into a 41-file
   consumer migration.

5. **No special-value mapper remains after A7.** All app scale entries are numeric after
   `radius.full` is removed, so `mapScale(prefix, scale)` should accept `Record<string, number>` and
   format `${value}px` without a generic string-value branch. The board-only alias is explicit and
   outside the app scale; a future non-pixel token should require a new design decision and should
   fail the mapper's type contract until that decision is made.

## Acceptance criteria

- [ ] `uikit/tokens.ts` still exports the five numeric scales used by existing callers, but
      `radius.full` is removed; the app scale total is 31 entries.
- [ ] Dot and both Slider thumb implementations use local `borderRadius: "50%"` and render as
      circles at their existing sizes.
- [ ] A theme-layer mapper is the single implementation of camel-case conversion and numeric
      `Npx` formatting, with a `Record<string, number>` scale signature and no string branch;
      `board-theme.ts` imports it rather than duplicating it.
- [ ] The renderer installs one marked `:root` stylesheet containing exactly the 31 app variables:
      `--space-*`, `--gap-*`, `--radius-*`, `--size-*`, and `--font-*`.
- [ ] App token installation is startup-time, idempotent, independent of React/Emotion, and is
      not repeated on theme changes.
- [ ] `BOARD_TOKEN_VARS` serializes byte-for-byte identically before and after the refactor: 32
      keys in the same order with the same values, including the explicit in-position
      `--p-radius-full: "50%"` alias; no app `--radius-full` variable is emitted.
- [ ] All 41 existing token importers continue compiling without a consumer migration, and no
      package dependency or unrelated styling behavior changes.
- [ ] Representative computed CSS values, theme invariance, board token delivery, and Dot/Slider
      visuals are verified; `npm run typecheck` and `npm run lint` pass.
