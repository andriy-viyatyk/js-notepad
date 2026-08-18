# US-982: One theme state and one color resolver

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-052 - De-React Epic A: Style and token foundation](../../epics/EPIC-052.md)
**Created:** 2026-08-18

## Goal

Give the renderer one framework-neutral source of truth for the active theme and one resolver
for turning a color variable reference into a concrete value. Anything that cannot rely on CSS
variable re-resolution — Monaco, canvas, Mermaid, Excalidraw, SVG data, and generated data URIs —
must receive theme changes through that state without relying on a React reconciliation accident.

The task also fixes the live scrollbar-arrow bug: switching theme must rebuild the four arrow data
URIs without restarting the application.

## Background

`src/renderer/theme/themes/index.ts` currently owns a mutable `currentThemeId` and a single
`monacoThemeCallback`. `applyTheme()` writes the theme variables to `document.documentElement`,
then calls that one callback. A second callback replaces the first, so this is not a real
subscription mechanism. `getResolvedColor()` reads the current theme table, while
`editors/graph/ForceGraphRenderer.ts` has a second resolver that reads CSS variables through
`getComputedStyle()`.

The color table itself is not in scope for redesign. `theme/color.ts` already exposes the 77
semantic colors as `var(--color-*)`, and all nine theme definitions provide those variables. The
task makes the existing theme state and resolution paths coherent; it does not rename or
regenerate the color palette.

### Measured theme-dependent surface

The current branch has eight `isCurrentThemeDark()` call sites in seven files, plus the
unsubscribed global-style renderer:

| File | Current use | Required live behavior |
|---|---|---|
| `src/renderer/editors/draw/DrawEditor.ts:71` | Constructor seeds Excalidraw `darkMode` | Theme-aware model subscription, while preserving an explicit saved editor override |
| `src/renderer/editors/mermaid/MermaidEditor.ts:66` | Constructor seeds Mermaid `lightMode` | Theme-aware model subscription, while preserving an explicit saved editor override |
| `src/renderer/editors/log-view/items/MermaidOutputView.tsx:57,77` | Mermaid render mode and dependency snapshot inside the model | Re-evaluate the model dependency thunk from `themeState.get()`; the view uses `themeState.use()` only as the legal React render trigger |
| `src/renderer/editors/markdown/MarkdownBlock.tsx:169` | Mermaid code-block render mode | Rebuild the component memo when the theme changes, without subscribing to settings as a proxy |
| `src/renderer/editors/video/AudioVisualizer.tsx:243` | Theme argument re-read inside every animation frame | Replace the getter with `themeState.get().isDark`; no subscription or animation lifecycle change is needed |
| `src/renderer/theme/icons.tsx:247` | Theme-aware `PersephoneIcon` branch | Subscribe to theme state instead of `settings.use("theme")` |
| `src/renderer/editors/board/board-theme.ts:59` | Board palette `isDark` and resolved colors | Read the theme state and the shared resolver |
| `src/renderer/theme/GlobalStyles.tsx:6` | Scrollbar arrow data URIs baked during render | Subscribe to theme state so the generated CSS is rebuilt after a switch |

`MermaidOutputView`, `MarkdownBlock`, and `PersephoneIcon` currently subscribe to the settings
object only to cause a React render when the theme setting changes. The new state becomes the owner
of that notification, but these React components still use React hooks as the repaint mechanism
until Epic B removes the React view layer. `applyTheme()` can also run during startup or
settings-file reload, and future vanilla consumers have no React settings hook.

There is one adjacent non-snapshot path that must be included in the audit. `ForceGraphRenderer`
resolves colors through `getComputedStyle()` and `GraphBody` calls `refreshColors()` after its
own renders, but the graph has no theme subscription. A theme switch therefore needs to trigger
that refresh explicitly. `BoardWebview` already has a live `settings.onChanged` subscription that
re-pushes board palettes, but it is registered once per mounted webview. US-982 should move this
to one module-level subscription owned by the board theme service, so one theme switch produces
one `api.updateBoardTheme()` fan-out for all live boards.

Theme application has three existing entry points that must remain equivalent:

- module-load startup in `themes/index.ts`, after the synchronous saved-theme read;
- `settings.ts` while loading or reloading `appSettings.json`;
- the settings UI and `cycle-app-theme.ts`, which call `applyTheme()` before persisting the id.

The state update must happen after the document variables and `colorScheme` are written. This
ensures subscribers that immediately resolve a color see the new theme rather than the previous
one.

### Before → after shapes

The intended refactor is structural, not a new theme transport:

```ts
// Current single-slot callback
let monacoThemeCallback: MonacoThemeCallback | null = null;
onMonacoThemeChange(applyMonacoTheme);

// After
const unsubscribe = themeState.subscribe((state) => {
    const theme = getThemeById(state.id);
    if (theme) applyMonacoTheme(theme);
});
```

```ts
// Current two resolution paths
getResolvedColor("--color-text-light");
resolveVar(color.graph.nodeDefault);

// After
resolveColor("--color-text-light");
resolveColor(color.graph.nodeDefault); // accepts var(--color-graph-node-default)
```

```tsx
// Current GlobalStyles render is not subscribed to the baked URI input
export function GlobalStyles() {
    return <Global styles={buildGlobalStyles()} />;
}

// After
export function GlobalStyles() {
    themeState.use((s) => s.id);
    return <Global styles={buildGlobalStyles()} />;
}
```

```tsx
// Current React theme consumers use settings as a repaint signal
settings.use("theme");
const isDark = isCurrentThemeDark();

// After
const isDark = themeState.use((s) => s.isDark);
```

`MermaidOutputModel` is the exception to the hook-shaped example above because its two theme
reads are inside `TComponentModel.init()`, not the React view. Its exact split is:

```ts
// Model dependency thunk and effect body
() => [this.props.entry.text, themeState.get().isDark];
const lightMode = !themeState.get().isDark;

// React view: legal hook, used only to cause model-prop evaluation
themeState.use((s) => s.isDark);
```

## Implementation plan

### 1. Add the renderer theme state

Create `src/renderer/theme/theme-state.ts` with a `TOneState` containing at least:

```ts
interface ThemeState {
    id: string;
    isDark: boolean;
}
```

The module may import only the state primitive and must not directly import React, settings,
Emotion, or the theme table. `TOneState` currently imports React transitively because its `use()`
method is implemented in `core/state/state.ts`; that is an existing primitive limitation, not a
reason to hand-roll a second store. The `get()`, `set()`, and `subscribe()` paths used by this
module remain framework-neutral at runtime. True React-free state primitives are an Epic B concern.
Initialize it to the existing default-dark identity so the module is usable before `applyTheme()`
performs the startup read.

Refactor `src/renderer/theme/themes/index.ts` so:

- `themeState` is updated by `applyTheme()` after all root CSS variables, `colorScheme`, and the
  native theme have been updated;
- `currentThemeId` is no longer a second mutable source of truth;
- `getCurrentThemeId()` and any retained read API derive from `themeState.get()`;
- `isCurrentThemeDark()` and the single-slot `monacoThemeCallback` are removed after all callers
  are migrated;
- the token installer and synchronous startup application added by US-981 remain in the same
  order and are not moved behind React rendering.

Do not make `themeState.subscribe()` invoke listeners immediately. Consumers that need an initial
value must read `themeState.get()` or use `themeState.use(...)`, then subscribe for later changes.
This matches `TOneState`'s existing contract and keeps startup ordering explicit.

### 2. Collapse color resolution to one helper

Replace `getResolvedColor()` in the theme layer with one exported helper, preferably
`resolveColor(value: string)`, accepting either a bare CSS variable name such as
`--color-text-light` or a reference such as `var(--color-text-light)`.

Normalize the two input forms to the theme-table key and resolve through the active theme. Keep
the existing concrete theme values as the source for canvas, board, SVG, and data-URI consumers;
CSS consumers continue to use `var(--color-*)` directly. Preserve a defined fallback for an
unknown input rather than silently producing a malformed board palette, and document that all
current call sites use known variables. The decided fallback is the concrete CSS color
`transparent`; never return the unresolved `var(...)` string to a canvas or data-URI consumer.

The table-to-computed-style consolidation is a verified precondition, not an assumption: all nine
theme definitions currently provide all 77 `--color-*` keys, including all 14 `--color-graph-*`
keys consumed by `ForceGraphRenderer`. If a future theme omits a required key, the resolver must
fail through its documented concrete fallback rather than returning a raw `var(...)` expression.

Update these consumers:

- `src/renderer/theme/GlobalStyles.tsx` uses `resolveColor(color.text.light)` for the scrollbar
  arrow data URIs;
- `src/renderer/editors/board/board-theme.ts` uses the helper for `P_VAR_SOURCES` and reads
  `themeState.get().id` / `.isDark` for the palette metadata;
- `src/renderer/editors/graph/ForceGraphRenderer.ts` deletes local `resolveVar()` and uses the
  shared helper for every canvas color. Update `refreshColors()` at the same time: compare all 13
  fields in `ResolvedColors`, or remove the partial equality guard, so a real theme change cannot
  be skipped because only `nodeDefault` and `labelBg` happen to match.

After this step there must be no second `resolveVar()` implementation and no direct
`getComputedStyle(document.documentElement)` color path in the graph renderer.

### 3. Replace the Monaco callback with a real subscription

Update `src/renderer/api/setup/configure-monaco.ts`:

- register a `themeState.subscribe(...)` listener after `monacoInstance` is available;
- resolve the state id with `getThemeById()` and call `defineMonacoTheme` / `setTheme` for every
  later state change;
- apply the current state once immediately after registration because `subscribe()` is not an
  initial notification;
- retain the existing async initialization and the second current-theme application that covers
  a settings change during Monaco loading, but express it through the state getter rather than
  the deleted callback API.

The listener is created once by `initMonaco()` and must not be registered repeatedly if the init
guard is hit.

### 4. Make React consumers subscribe to theme state

Replace settings-based theme reads with narrow `themeState.use(selector)` reads in:

- `GlobalStyles.tsx` — select the theme id or dark flag solely to rebuild `buildGlobalStyles()`;
- `theme/icons.tsx` — replace `settings.use("theme")` in `PersephoneIcon` and select `isDark`;
- `editors/markdown/MarkdownBlock.tsx` — select `isDark`, derive `mermaidLightMode`, and retain
  the existing `hasMermaid` memo gate;
- `editors/log-view/items/MermaidOutputView.tsx` — keep the hook in the view and keep the model
  framework-neutral: the model effect body reads `!themeState.get().isDark`, its dependency thunk
  uses `[this.props.entry.text, themeState.get().isDark]`, and the view calls
  `themeState.use((s) => s.isDark)` only to trigger the render that re-evaluates that thunk. Keep
  the existing async render cancellation and queue-microtask timing.
- `editors/video/AudioVisualizer.tsx` — make the one-line swap from
  `isCurrentThemeDark()` to `themeState.get().isDark` inside the existing requestAnimationFrame
  callback. It already re-reads the theme every frame; do not add a subscription, restart the RAF,
  or change the animation lifecycle.

These components must stop using `settings.use("theme")` as a rendering signal. `ThemeSection`
may continue using `settings.use("theme")` for the settings editor's selected card; that is a
settings UI concern, not a theme-consumer notification path.

### 5. Migrate model, graph, and board consumers

Update the non-component consumers with lifecycle-aware subscriptions:

- `DrawEditor.ts` and `MermaidEditor.ts` should read the theme state for their initial defaults
  and register a disposable theme subscription through the existing host-subscription registry.
  Do not update a different model during a render-phase model effect. Preserve the existing
  host-slot persistence: follow the theme only while the corresponding host slot value is
  `undefined`; `adoptHost()` already applies a saved slot over the constructor seed, and the first
  user toggle causes the existing mirror to write the slot, after which theme notifications must
  not overwrite it. Do not add a parallel `hasOverride` field.
- `GraphBody.tsx` should subscribe to a narrow theme-state field so the existing
  `editor.refreshColors()` path runs after a theme switch. The refresh must happen after
  `applyTheme()` has written the new CSS values, and it must not recreate the D3 simulation.
- `src/renderer/editors/board/board-theme.ts` should own an idempotent module-level
  `themeState.subscribe()` that calls `api.updateBoardTheme(computeBoardThemePalette())` once per
  theme switch for all live boards. `BoardWebview.tsx` should ensure that service is started when
  the first board mounts, then remove its per-webview theme listener. Its first registration still
  comes from `computeBoardThemePalette()`, so the shared subscription is for later switches only.
  The update intentionally moves earlier: theme state fires inside `applyTheme()` before the
  settings id is persisted by the settings UI or `cycle-app-theme.ts`.

The board API contract remains unchanged: board `--p-*` values, `getTheme()`, and `onThemeChange`
continue to receive concrete values, while `BOARD_TOKEN_VARS` remains the static map from US-981.

### No changes in this task

The following remain outside US-982:

- `src/renderer/theme/color.ts` and all nine `src/renderer/theme/themes/*.ts` color tables;
- `src/renderer/theme/token-vars.ts`, `src/renderer/uikit/tokens.ts`, and the CSS-variable
  installation from US-981;
- the settings JSON schema and persistence calls in `src/renderer/api/settings.ts`,
  `src/renderer/api/cycle-app-theme.ts`, and `src/renderer/editors/settings/sections/ThemeSection.tsx`;
- the board bridge/API contract and the `--p-*` token map;
- CSS-only consumers that already repaint through `var(--color-*)` without reading a concrete
  color in code.

### 6. Verify all paths and the live switch

Use the repository's existing checks and a manual renderer smoke check. No unit-test harness is
to be added for this task.

- `rg -n 'isCurrentThemeDark\(\)' src/renderer` has no remaining consumer call sites;
- `rg -n 'onMonacoThemeChange|monacoThemeCallback' src/renderer` has no matches;
- `rg -n 'getResolvedColor|function resolveVar|resolveVar\(' src/renderer` has no matches;
- `themeState` has one owner and all subscriptions are cleaned up where the owning component or
  editor can unmount;
- `npm run typecheck` and `npm run lint` pass;
- switch through several dark and light themes without restarting and verify Monaco, the
  scrollbar arrows, Mermaid output, Markdown Mermaid blocks, the Persephone icon, Excalidraw,
  AudioVisualizer, the graph canvas, and every open board repaint with the selected theme;
- verify a board opened after a switch receives the same concrete palette as a board that stayed
  open, and no duplicate board theme update is sent;
- verify a persisted Draw/Mermaid per-editor mode is not silently overwritten by an app-theme
  switch.

## Concerns / Open questions

1. **Draw and Mermaid have explicit editor settings, not just theme snapshots.** Their constructor
   values are seeded from the app theme, but `darkMode` / `lightMode` are then user-toggleable and
   persisted in the host editor-settings slot. A naive theme subscription would overwrite a user's
   explicit choice whenever the application theme changes. **Decision for US-982:** use the
   existing mechanism, not a new persistence field — a fresh editor follows the theme while its
   host slot is `undefined`; `adoptHost()` applies a saved slot over the constructor seed, and the
   existing state mirror writes the slot on the first user toggle. Later theme notifications must
   check that slot and leave an explicit value untouched.

2. **Theme state update ordering is load-bearing.** Subscribers for GlobalStyles, boards, Monaco,
   and the graph must observe the new root variables and `colorScheme` before they run. Keep the
   `themeState.set()` at the end of `applyTheme()` and do not move the startup call behind
   `AppContent`, a React effect, or a lazy editor import.

3. **The resolver's fallback must remain concrete where required.** Board palettes and canvas
   renderers cannot use a `var(...)` expression. **Decision for US-982:** normalize both accepted
  input forms, return the active theme-table value for known variables, and return the concrete
  `transparent` fallback for an unknown variable. The closed `P_VAR_SOURCES` table and all canvas
  inputs remain known variables, so a typo cannot be silently converted into an invalid raw
  `var(...)` value; any future unknown source still needs fixing at its call site.

4. **TComponentModel effects are render-phase-capable after initialization.** If the Mermaid log
   model keeps a dependency-based effect, the theme subscription must cause a clean re-render and
   preserve its cancellation guard; it must not synchronously write another component's state from
   the model effect. Keep DOM work and commit-timed behavior in the view where necessary.

5. **The graph's existing refresh path is incidental, not a subscription.** `GraphBody` currently
   refreshes renderer colors after its own renders, so a static screenshot can look correct after
   unrelated graph activity while a theme switch leaves the canvas stale. The task must make the
   theme dependency explicit and verify an idle open graph, not only a graph being edited.

6. **Board palette fan-out is resolved at the service boundary.** The current per-webview listener
   sends one duplicate update per mounted board. US-982 deliberately replaces it with one
   idempotently-started module-level subscription in `board-theme.ts`; the existing board bridge
   remains responsible for fan-out to live frames. Because the state notification runs inside
   `applyTheme()`, this update occurs before the settings id is persisted, which is intentional.

7. **Settings remains the persistence boundary.** `ThemeSection`, `cycle-app-theme.ts`, and the
   settings-file loader must continue to persist the selected id. US-982 changes notification and
   resolution ownership, not the JSON settings schema or the order in which settings are saved.

## Acceptance criteria

- [ ] `src/renderer/theme/theme-state.ts` owns one `TOneState<{ id, isDark }>` with no **direct**
      React, settings, Emotion, or theme-table dependency; `applyTheme()` updates it after
      applying CSS variables and native theme state. The existing TOneState React transitive
      dependency is accepted until Epic B replaces the primitive.
- [ ] `currentThemeId`, `monacoThemeCallback`, and `onMonacoThemeChange` are removed as mutable or
      single-slot notification mechanisms; Monaco uses one cleaned-up theme-state subscription and
      applies the current theme once when initialized.
- [ ] One `resolveColor(value)` helper accepts both `--color-*` and `var(--color-*)`; board,
      GlobalStyles, and ForceGraphRenderer use it, with no remaining `getResolvedColor()` or local
      `resolveVar()` implementation. Known theme keys resolve to concrete values, missing keys use
      the documented concrete `transparent` fallback, and ForceGraphRenderer compares all 13
      resolved color fields when deciding whether to repaint.
- [ ] The eight `isCurrentThemeDark()` consumer call sites are migrated to theme state or a
      documented model subscription, and the three React consumers no longer use settings as a
      proxy for theme repainting.
- [ ] GlobalStyles rebuilds all four scrollbar arrow data URIs after an in-session theme switch;
      the arrows visibly change color without a restart.
- [ ] An idle ForceGraph canvas, open boards, Monaco, Mermaid output, Markdown Mermaid blocks,
      PersephoneIcon, and Excalidraw all reflect a theme switch without a manual unrelated
      re-render. AudioVisualizer continues to reflect the theme through its existing per-frame
      read, with only the getter replaced.
- [ ] MermaidOutputModel reads theme state with `get()` in its effect/dependency code, while its
      React view uses `themeState.use()` only as the render trigger; no hook is called from the
      model class.
- [ ] Draw/Mermaid host-slot persistence and the chosen explicit-override policy are preserved;
      a manual editor mode is not silently changed unless that behavior is explicitly accepted.
- [ ] Startup theme application remains synchronous and token-variable installation from US-981
      remains independent of React and of theme-change notifications.
- [ ] `npm run typecheck` and `npm run lint` pass; no unit-test framework or unrelated styling
      migration is introduced.

## Files changed

| File | Change |
|---|---|
| `src/renderer/theme/theme-state.ts` | Add the framework-neutral active-theme `TOneState` |
| `src/renderer/theme/themes/index.ts` | Make the state authoritative, remove the callback, and export the single resolver |
| `src/renderer/theme/GlobalStyles.tsx` | Subscribe before rebuilding scrollbar-arrow data URIs |
| `src/renderer/theme/icons.tsx` | Read `PersephoneIcon` mode from theme state |
| `src/renderer/api/setup/configure-monaco.ts` | Subscribe Monaco to theme state |
| `src/renderer/editors/base/TextHostEditorModel.ts` | Allow theme-following state updates to bypass host-setting mirroring |
| `src/renderer/editors/draw/DrawEditor.ts` | Seed/follow theme with explicit host-slot override semantics |
| `src/renderer/editors/mermaid/MermaidEditor.ts` | Seed/follow theme with explicit host-slot override semantics |
| `src/renderer/editors/log-view/items/MermaidOutputView.tsx` | Use theme state for Mermaid render dependencies |
| `src/renderer/editors/markdown/MarkdownBlock.tsx` | Use theme state for Mermaid block mode |
| `src/renderer/editors/video/AudioVisualizer.tsx` | Use live theme mode in the animation path |
| `src/renderer/editors/graph/ForceGraphRenderer.ts` | Remove the local computed-style resolver |
| `src/renderer/editors/graph/GraphBody.tsx` | Make canvas color refresh depend on theme state |
| `src/renderer/editors/board/board-theme.ts` | Use the shared resolver and theme state metadata |
| `src/renderer/editors/board/BoardWebview.tsx` | Subscribe board palette updates to theme state |
