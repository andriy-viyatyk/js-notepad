# US-1177 — native global styles; uninstall Emotion and `react-markdown`

**Epic:** [EPIC-074 — De-React Epic F: React confined](../../epics/EPIC-074.md) (task F-d)
**Status:** Ready to implement
**Created:** 2026-08-28

## Goal

Replace `GlobalStyles`'s Emotion `<Global>` React component with a native module that owns one
`<style>` element, then uninstall `@emotion/react`, `@emotion/styled` and `react-markdown`. This
removes **the only React root that is live in every session**.

## Background — why this is smaller than it looks, and where the one real subtlety is

`src/renderer/theme/GlobalStyles.tsx` (160 lines) is a single tagged template literal of **entirely
top-level CSS selectors** — `body`, `input/textarea/select/button`, seven `::-webkit-scrollbar*`
rules, `::selection`, `.highlighted-text`, `.scroll-container`, `[data-scrollbar="hidden"]`,
`.editor-overlay`, `.footer-portal-target`, and one `:has()` rule. **There is no `&` nesting and no
parent-selector dependency**, so Emotion's `css` tag is doing nothing here that a plain `<style>`
element does not do. The CSS text transfers verbatim.

**The one subtlety — why the stylesheet must be rebuilt on theme change at all.** Every
`color.*` token is a **CSS variable reference**, not a value:

```ts
// src/renderer/theme/color.ts:3,19
background: { default: "var(--color-bg-default)", … }
text:       { default: "var(--color-text-default)", … }
```

So theme switching for all of those happens through the CSS custom properties automatically, and the
rule text never needs to change. The exception is `arrowColor`:

```ts
// GlobalStyles.tsx:7-9
const arrowColor = encodeURIComponent(resolveColor("--color-text-light"));
```

`resolveColor` (`theme/themes/index.ts:79-86`) looks the variable up in the active theme table and
returns a **literal** color. It feeds four `::-webkit-scrollbar-button` background `data:` URIs, and
the file's own comment says why a variable will not do there: *"data URIs require resolved colors,
not CSS variables"*. **That, and only that, is what `themeState.use((s) => s.id)` at `:157` exists
for.** Preserve the rebuild-on-theme-change behaviour or the scrollbar arrows keep the previous
theme's colour.

**Build coupling: none.** There is no Emotion babel plugin, no `jsxImportSource`, and no Emotion
reference in `vite.config.*`, `tsconfig*.json` or `scripts/*.mjs`. `GlobalStyles.tsx` is the only
file in `src/` importing `@emotion/*`, and **`@emotion/styled` is imported nowhere at all** — it is
already dead. `react-markdown` likewise has **zero importers in `src/`**; it was converted away in
the editor migration (roadmap §3.6) and deliberately left installed until this epic.

**The subscription API to use.** `themeState` is a `TOneState<ThemeState>`
(`theme/theme-state.ts:12`) whose doc comment states it is kept independent of the theme table
*"so non-React consumers can subscribe to the same synchronous notification path as React views"*.
`IState.subscribe` (`core/state/state.ts:18`, implementation `:135-157`) has a selector overload
that compares structurally and fires only on real change:

```ts
subscribe(listener: () => void): () => void;
subscribe<R>(listener: (value: R) => void, selector: (state: T) => R): () => void;
```

Use the selector form with `(s) => s.id`, matching what the React version selected on.

## Implementation plan

### Step 1 — create `src/renderer/theme/global-styles.ts`

A native module, no React. Name it `global-styles.ts` (kebab-case, matching `theme-state.ts` and
`p-vars.ts` in the same folder).

- Keep `buildGlobalStyles()` essentially as-is, but return a **plain string** rather than an Emotion
  `css` object: drop the `css` tag and keep the template literal. All `${…}` interpolations stay.
- Add `installGlobalStyles(): () => void` which:
  1. creates one `<style>` element, sets `data-name="global-styles"` on it (per
     [ui-element-contract.md](../../architecture/ui-element-contract.md)), appends it to
     `document.head`;
  2. writes `style.textContent = buildGlobalStyles()`;
  3. subscribes `themeState.subscribe(() => { style.textContent = buildGlobalStyles(); }, (s) => s.id)`;
  4. returns a disposer that unsubscribes and removes the element.
- `document.head`, not the container: these are global rules and the old Emotion root injected into
  `<head>` too. Do not put the `<style>` inside the app container — a container-scoped `<style>` still
  applies globally but is removed on any container teardown, which is a behaviour change.

### Step 2 — rewire `src/renderer/index.tsx` and rename it to `index.ts`

Current (`index.tsx:11-15`):

```ts
export function mount(container: HTMLElement): () => void {
    const globalStylesHost = document.createElement("div");
    globalStylesHost.style.display = "contents";
    container.append(globalStylesHost);
    const globalStylesHandle = mountReactHandle(globalStylesHost, React.createElement(GlobalStyles));
```

After:

```ts
export function mount(container: HTMLElement): () => void {
    const disposeGlobalStyles = installGlobalStyles();
```

- Drop the `react` import (`:1`), the `mountReactHandle` import (`:2`) and the `GlobalStyles` import
  (`:8`); add the `installGlobalStyles` import.
- In the returned disposer (`:38-51`), replace the final two statements
  `globalStylesHost.remove(); globalStylesHandle.dispose();` with `disposeGlobalStyles();`.
  **Keep the disposer's existing reverse order** — global styles were installed first and disposed
  last, so `disposeGlobalStyles()` stays at the end.
- Update the stale comment at `:29-31`. It currently says *"`GlobalStyles` is the sole startup React
  root, and D6 owns it"* — after this task there is **no** startup React root. Keep the first half
  about `AlertsBar` (still accurate), and rewrite the `GlobalStyles` sentence to say the startup path
  creates no React root at all. Note the same comment references `mountVanilla`, which task F-a
  deletes; if that task has already landed, drop the stale mention rather than leaving a dangling
  reference.
- `git mv src/renderer/index.tsx src/renderer/index.ts` — no JSX remains.

### Step 3 — delete `src/renderer/theme/GlobalStyles.tsx`

Nothing else imports it. `theme/p-vars.ts:50` *mentions* `GlobalStyles` in a comment about
`--p-font-family`; update that comment to name the new module.

### Step 4 — uninstall the three packages

```
npm uninstall @emotion/react @emotion/styled react-markdown
```

Then check for now-stale references:

- `src/renderer/uikit/CLAUDE.md:350-351, 387, 969` mention `@emotion/styled` / `@emotion/css`. Lines
  350-351 are **prohibitions** and stay meaningful, but line 387 says converted files "MAY use
  `@emotion/styled`", which becomes false, and `:969` is an example importing it. Update those two so
  the authoring rules do not point at an uninstalled package.
- `CLAUDE.md`'s Tech Stack line says *"one non-story Emotion importer (`theme/GlobalStyles.tsx`)"* —
  that becomes zero. Update it.
- Search `doc/` for `react-markdown` and `@emotion` and fix any statement that now reads as false;
  the roadmap ([`doc/de-react.md`](../../de-react.md)) tracks both in its dependency table.

## Files that need NO changes

- `src/renderer/theme/color.ts`, `theme/themes/*` — the token and theme tables are untouched.
- `src/renderer/theme/theme-state.ts` — already exposes the needed subscribe path.
- `src/renderer/theme/style-layers.css`, `theme/root.css` — separate static stylesheets, unrelated.
- `src/renderer.tsx` — its `mount(container)` call at `:26` is unchanged; the module specifier
  `"./renderer/index"` resolves the same after the `.tsx` → `.ts` rename. (Note: `renderer.tsx`
  itself is renamed by task F-c, not here.)
- `src/renderer/uikit/shared/mount.tsx` — `mountReactHandle` stays; F-h moves it.
- Every editor and uikit view — none imports `GlobalStyles`.

## Concerns

1. **This is the highest-risk task in the epic and a green build proves nothing about it.** A
   converted module that never subscribes compiles, renders correctly on first paint, and simply
   stops following theme changes. The acceptance criteria below therefore require an *observed theme
   switch*, not a successful build.
2. **`:has()` and `scrollbar-color` must survive verbatim.** Emotion's stylis pipeline could in
   principle have transformed the rule text; it does not here (no nesting, no vendor-prefixable
   properties beyond the already-prefixed `::-webkit-*`), but confirm the four scrollbar-arrow data
   URIs still contain a literal `#`-colour after conversion rather than the string `var(...)`.
   `encodeURIComponent` on a `var(--x)` string would silently produce an arrow that never renders.
3. **Do not "improve" the CSS.** No reordering, no consolidating selectors, no converting the data
   URIs to variables. This task is a hosting change; any rule-text edit makes a visual regression
   impossible to attribute.
4. **`react-markdown`'s removal is verified but check `package-lock.json` churn.** Uninstalling three
   packages will prune transitive deps (`remark`/`rehype` may be shared with the retained markdown
   stack — the roadmap says the parser stack was *kept*). If `npm uninstall` removes anything the
   markdown editor still needs, `build-prod` will fail; report it rather than reinstalling blindly.
5. **`@types/react` and `@types/react-dom` stay installed.** Do not uninstall them, and do not
   uninstall `react` or `react-dom` — Excalidraw declares them as peer dependencies and its own
   `.d.ts` imports React (EPIC-074 F-2, correction 1).

## Acceptance criteria

1. `src/renderer/theme/GlobalStyles.tsx` is deleted; `theme/global-styles.ts` exists and imports no
   React.
2. `src/renderer/index.ts` exists (no `.tsx`), imports no React, and contains no `mountReactHandle`.
3. `grep -rn "@emotion" src/ --include=*.ts --include=*.tsx` returns nothing.
4. `@emotion/react`, `@emotion/styled` and `react-markdown` are absent from `package.json`;
   `react`, `react-dom`, `@types/react`, `@types/react-dom` are **still present**.
5. `npm run typecheck`, `npm run lint`, `npm run build-prod` all pass.
6. **Presence checks — required, and the point of the task:**
   - The app starts and the window is not blank; `body` has the themed background colour.
   - `document.querySelector('style[data-name="global-styles"]')` exists and its `textContent`
     is non-empty.
   - **Switch the theme and observe the change.** The scrollbar-button arrows must recolour, which is
     the specific behaviour the subscription exists for. Read a `--p-*` custom property and one
     `--color-*` value before and after to confirm both still resolve.
   - A scrollbar renders with its custom thumb (the `::-webkit-scrollbar-thumb` rule applied).
   - `document.querySelectorAll("[data-react-root]").length` is **0** on a session with no draw page
     open — this task removes the last always-live root.

## Files changed

| File | Change |
|---|---|
| `src/renderer/theme/global-styles.ts` | **new** — native `<style>` owner + `themeState` subscription |
| `src/renderer/theme/GlobalStyles.tsx` | deleted |
| `src/renderer/index.tsx` → `index.ts` | renamed; React root replaced with `installGlobalStyles()`; stale comment updated |
| `src/renderer/theme/p-vars.ts` | comment reference updated |
| `package.json`, `package-lock.json` | three packages uninstalled |
| `src/renderer/uikit/CLAUDE.md`, `CLAUDE.md`, `doc/de-react.md` | statements about Emotion / `react-markdown` corrected |
