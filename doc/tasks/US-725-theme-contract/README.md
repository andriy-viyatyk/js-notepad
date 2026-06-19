# US-725: Theme contract — `--p-*` CSS variables (color + metrics) + `persephone.theme`/`tokens`

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · Foundation #7
**Status:** Implemented — awaiting manual testing (`tsc`/`eslint` clean). Epic deferred-review: stays `[ ]` until `/review`.
**Depends on:** US-723 (`board://` + webview), US-724 (`persephone` bridge)

## Goal

Give a board the host's design context as a frozen, semantic **`--p-*` CSS-variable contract**
injected into the board page, in two parts:

1. **Color palette** (theme-dependent) — mapped from `color.ts`, so the board's CSS restyles
   **live** on a theme switch; plus a JS mirror `persephone.theme` + `persephone.onThemeChange(cb)`
   for colors a board must set from JavaScript (e.g. a grid's progress-bar color array).
2. **Metric tokens** (theme-independent) — spacing / gap / radius / size / font scales from
   `uikit/tokens.ts`, so a board can match Persephone's spacing & type rhythm; plus a JS mirror
   `persephone.tokens`. These are constants — injected **once at init**, never re-pushed on a
   theme switch.

Persephone **guarantees the palette + metrics, not the component styling** (skins are US-727).

## Background

### What already exists (US-723/724 — build on these, don't re-derive)

- **Board webview** — `src/renderer/editors/board/BoardWebview.tsx`. Host-renderer component;
  mounts a sandboxed `<webview src="board:///index.html">` on an ephemeral `board-<uuid>`
  partition. Its mount effect calls `api.registerBoardProtocol(partition, boardRoot)` and only
  renders `<webview>` **after** that resolves (`ready` gate) — so registration completes in
  main *before* the webview navigates and *before* the preload runs. **This ordering is the
  seam US-725 reuses to deliver the initial theme synchronously.**
- **Board preload** — `src/preload-board.ts`. Sandboxed + `contextIsolation`. Resolves
  `boardRoot` once at init via `ipcRenderer.sendSync(BoardBridgeChannel.getContext)`, then
  `contextBridge.exposeInMainWorld("persephone", { version, execute, openRawLink, notify, …dialogs })`.
  The header comment already reserves `theme`/`onThemeChange` for US-725.
- **Board bridge (main)** — `src/main/board-bridge.ts`. `getContext` handler returns
  `{ boardRoot } satisfies BoardContext` from `getBoardRootForSession(event.sender.session)`.
  `notify` shows how a board event reaches the host renderer (`ownerWindow(event)?.webContents.send(EventEndpoint.eBoardNotify, …)`).
- **Board bridge channels** — `src/ipc/board-bridge-channels.ts`. **Dependency-free** (so the
  sandboxed preload can import it). Home of `BoardBridgeChannel`, `BoardContext`, message types.
- **Protocol service** — `src/main/board-protocol-service.ts`. `registerBoardProtocol(partition, boardRoot)`
  stores `boardRoots` (partition→root) and `sessionToRoot` (Session→root); `BOARD_CSP` already
  sets **`style-src 'self' 'unsafe-inline'`** (inline/programmatic styles allowed — no CSP change needed).
- **Renderer→main IPC for registration** — `Endpoint.registerBoardProtocol` is wired in
  `src/ipc/api-types.ts` (enum + `Api` map), `src/ipc/renderer/api.ts` (`registerBoardProtocol = (partition, boardRoot) => executeOnce(...)`),
  and `src/ipc/main/controller.ts` (handler that dynamic-imports `board-protocol-service`). **US-725 extends this one call's signature** to carry the initial palette — no new endpoint.

### The theme system (the source of `--p-*` values)

- **`src/renderer/theme/color.ts`** — semantic tokens are static strings mapping to `--color-*`
  CSS vars (e.g. `color.background.default === "var(--color-bg-default)"`). The concrete hex
  lives on the host's `:root`, set by `applyTheme()`.
- **`src/renderer/theme/themes/index.ts`** — canonical theme module. Use these (NO `getComputedStyle` needed):
  - `getResolvedColor(cssVar: string): string` — returns the **concrete hex** for a `--color-*`
    var from the active theme's `colors` map (e.g. `getResolvedColor("--color-bg-default")` → `"#1f1f1f"`).
  - `getCurrentThemeId(): string` and `isCurrentThemeDark(): boolean`.
  - `getThemeById(id)`, `applyTheme(id)`.
- **Reactive switch** — `src/renderer/api/settings.ts`: `settings.theme` (read current id),
  `settings.onChanged.subscribe(({ key, value }) => …)` returns an unsubscribe fn. Theme switch
  → `settings.set("theme", id)` → `applyTheme(id)` updates `:root` → `onChanged` fires `key === "theme"`.

### Architecture decision (the data flow)

The **host renderer is the single source of truth** — it alone knows the current theme id, when
it changes (`settings.onChanged`), and the resolved hex (`getResolvedColor`). Both the CSS vars
and the JS mirror are derived from **one** palette object, computed in the renderer; the preload
only *applies* what it is given (it never computes colors). The **metric tokens** are static
constants, computed once from `uikit/tokens.ts`. Flow:

| Path | Mechanism |
|------|-----------|
| **Initial design context → board (synchronous)** | Host computes the color palette + reads the static metric vars and passes both into `registerBoardProtocol(partition, boardRoot, theme, tokens)`; main stores them per-session; `getContext` returns `{ boardRoot, theme, tokens }`; the preload (which already `sendSync`s `getContext` at init) receives them and **applies the color `--p-*` + metric `--p-*` to the guest `<html>` + seeds `persephone.theme`/`persephone.tokens`** — all before the page's own scripts run. Correct **by construction**: registration is already gated before navigation (the `ready` gate). |
| **Live theme switch → open board** | Host subscribes to `settings.onChanged`; on `key==="theme"` it recomputes the **color** palette and `webview.send(BoardBridgeChannel.themeChanged, palette)`; the preload's `ipcRenderer.on(themeChanged)` re-applies the color `--p-*` and fires `onThemeChange` callbacks. Metric tokens are **not** re-sent (they never change). |
| **Reload (F5 / edit-reload)** | The preload re-runs on navigation → re-does `getContext` sendSync → re-applies current theme + tokens. (A new board opened after a switch re-registers with the then-current palette.) No host action needed on reload. |

**Why the preload applies the CSS vars (not host `insertCSS`):** the preload already holds the
palette synchronously at init, so it can set `document.documentElement.style.setProperty("--p-bg", …)`
*before first paint* — earlier and more reliable than a host-side `dom-ready` + `insertCSS`, and
it keeps CSS vars + the JS mirror sourced from one object with zero `insertCSS`/`removeInsertedCSS`
key bookkeeping. (A sandboxed preload still has full DOM access; programmatic `.style.setProperty`
is not gated by `style-src`, and `'unsafe-inline'` is set regardless.)

## The `--p-*` contract (working set — provisionally frozen, see C-A)

Semantic/role-based names (per epic C5), each mapped to a `color.ts` source `--color-*` var. The
**`--p-*` names are the public API**; the source mapping can churn behind them.

| `--p-*` | Role | Source `--color-*` |
|---------|------|--------------------|
| `--p-bg`            | page / app background        | `--color-bg-default` |
| `--p-panel`         | raised surface / panel       | `--color-bg-light` |
| `--p-overlay`       | menu / popover background    | `--color-bg-overlay` |
| `--p-border`        | default border               | `--color-border-default` |
| `--p-border-light`  | subtle / inner border        | `--color-border-light` |
| `--p-text`          | primary text                 | `--color-text-default` |
| `--p-text-muted`    | secondary / dim text         | `--color-text-light` |
| `--p-text-strong`   | emphasized text              | `--color-text-strong` |
| `--p-accent`        | accent / primary action bg   | `--color-bg-selection` |
| `--p-accent-text`   | text on accent               | `--color-text-selection` |
| `--p-accent-hover`  | accent hover                 | `--color-border-active` |
| `--p-selection-bg`  | selection background         | `--color-bg-selection` |
| `--p-selection-text`| selection text               | `--color-text-selection` |
| `--p-link`          | hyperlink                    | `--color-misc-link` |
| `--p-error`         | error / danger               | `--color-error-text` |
| `--p-success`       | success                      | `--color-success-text` |
| `--p-warning`       | warning                      | `--color-warning-text` |
| `--p-scrollbar`     | scrollbar track              | `--color-bg-scrollbar` |
| `--p-scrollbar-thumb`| scrollbar thumb             | `--color-bg-scrollbar-thumb` |
| `--p-shadow`        | drop-shadow color            | `--color-shadow-default` |

`--p-accent*` is a deliberate mapping (epic C5: `color.ts` has no 1:1 `accent` token). It mirrors
the **filled primary Button** (`uikit/Button` → the `selection` pair: `#0078d4` fill / `#ffffff`
text in default-dark), **not** the `primary.*` group — `primary.*` is a *text-color* semantic
(`primary.background` is `#000`), so mapping a fill to it produced a black button whose hover text
went invisible. `--p-accent-hover` → `--color-border-active` (a same-family blue) for boards that
set a hover fill directly; the bundled template instead brightens the accent on hover (the app's
own technique), which is always readable. The set is intentionally **base-semantic, not component-specific** — a grid skin
(US-727) composes its chrome from these (header → `--p-panel`/`--p-border`, rows → `--p-bg`/`--p-text`,
selection → `--p-selection-bg`) and sets any truly component-specific colors from JS via
`persephone.theme` (the CSS-vs-JS split).

### Metric tokens (theme-independent — from `uikit/tokens.ts`)

Generated mechanically from `tokens.ts` (camelCase key → kebab, numbers → `…px`), so the board's
scales **cannot drift** from Persephone's. Names follow the scale: `xs/sm/md/lg/xl/xxl/xxxl`.

| `--p-*` family | Source (`tokens.ts`) | Example |
|----------------|----------------------|---------|
| `--p-space-{xs…xxxl}`     | `spacing`  | `--p-space-md: 8px` |
| `--p-gap-{xs…xxl}`        | `gap`      | `--p-gap-lg: 8px` |
| `--p-radius-{xs…xl,full}` | `radius`   | `--p-radius-md: 4px`, `--p-radius-full: 50%` |
| `--p-size-{icon-sm…control-lg}` | `height` | `--p-size-icon-md: 16px`, `--p-size-control-md: 26px` |
| `--p-font-{xs…xxl,base}`  | `fontSize` | `--p-font-base: 14px` |

Theme-independent → applied **once at init**, never in the live `themeChanged` push. The names are
a frozen public contract once boards ship against them, same as the colors (sign-off → C-A).

## Implementation plan

### 1. `src/ipc/board-bridge-channels.ts` — types + the live channel (dependency-free)

- Add a `themeChanged` member to `BoardBridgeChannel` (host→guest via `<webview>.send`, received
  by the preload's `ipcRenderer.on` — **not** an `ipcMain` channel):
  ```ts
  /** Host renderer → board guest (via `<webview>.send`). Live theme update; the
   *  preload re-applies `--p-*` and fires `onThemeChange`. */
  themeChanged = "board:theme-changed",
  ```
- Add the palette type and fold it into `BoardContext`:
  ```ts
  /** The host palette pushed into a board: the frozen `--p-*` contract resolved to
   *  concrete values, plus theme identity. The `vars` keys are `--p-*` names. */
  export interface BoardThemePalette {
      /** Active theme id, e.g. "default-dark". */
      id: string;
      /** True for dark themes (lets a board pick asset variants). */
      isDark: boolean;
      /** `--p-*` name → concrete CSS color value. */
      vars: Record<string, string>;
  }

  export interface BoardContext {
      boardRoot: string;
      /** Initial color palette, applied by the preload before the page runs (US-725). */
      theme: BoardThemePalette;
      /** Static metric vars (`--p-space-*`, `--p-radius-*`, …). Theme-independent —
       *  delivered once at init, never re-pushed. `--p-*` name → CSS value. */
      tokens: Record<string, string>;
  }
  ```

### 2. `src/renderer/editors/board/board-theme.ts` (NEW) — the contract + builders (renderer)

The single definition of the `--p-*` set (colors + metrics) and the only place that resolves colors.

```ts
import { getCurrentThemeId, getResolvedColor, isCurrentThemeDark } from "../../theme/themes";
import { fontSize, gap, height, radius, spacing } from "../../uikit/tokens";
import type { BoardThemePalette } from "../../../ipc/board-bridge-channels";

/** The frozen color `--p-*` contract: public var name → source `color.ts` (`--color-*`) var.
 *  Names are the public API; the source mapping may change behind them. */
const P_VAR_SOURCES: Record<string, string> = {
    "--p-bg": "--color-bg-default",
    "--p-panel": "--color-bg-light",
    "--p-overlay": "--color-bg-overlay",
    "--p-border": "--color-border-default",
    "--p-border-light": "--color-border-light",
    "--p-text": "--color-text-default",
    "--p-text-muted": "--color-text-light",
    "--p-text-strong": "--color-text-strong",
    "--p-accent": "--color-bg-selection",
    "--p-accent-text": "--color-text-selection",
    "--p-accent-hover": "--color-border-active",
    "--p-selection-bg": "--color-bg-selection",
    "--p-selection-text": "--color-text-selection",
    "--p-link": "--color-misc-link",
    "--p-error": "--color-error-text",
    "--p-success": "--color-success-text",
    "--p-warning": "--color-warning-text",
    "--p-scrollbar": "--color-bg-scrollbar",
    "--p-scrollbar-thumb": "--color-bg-scrollbar-thumb",
    "--p-shadow": "--color-shadow-default",
};

/** Resolve the current host theme into the board color palette. */
export function computeBoardThemePalette(): BoardThemePalette {
    const vars: Record<string, string> = {};
    for (const [pVar, src] of Object.entries(P_VAR_SOURCES)) {
        vars[pVar] = getResolvedColor(src);
    }
    return { id: getCurrentThemeId(), isDark: isCurrentThemeDark(), vars };
}

// --- Metric tokens (static, theme-independent) ---

function camelToKebab(s: string): string {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function mapScale(prefix: string, scale: Record<string, number | string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(scale)) {
        out[`${prefix}-${camelToKebab(k)}`] = typeof v === "number" ? `${v}px` : String(v);
    }
    return out;
}

/** The frozen metric `--p-*` contract, generated from `uikit/tokens.ts`. Static — built once. */
export const BOARD_TOKEN_VARS: Record<string, string> = {
    ...mapScale("--p-space", spacing),
    ...mapScale("--p-gap", gap),
    ...mapScale("--p-radius", radius),
    ...mapScale("--p-size", height),
    ...mapScale("--p-font", fontSize),
};
```

> `tokens.ts` is a dependency-free constants module, so importing it into the renderer helper is
> clean. The preload never imports it — it only applies the `BOARD_TOKEN_VARS` map it's handed via
> `getContext`, keeping the preload dumb and the contract defined in one place.

### 3. `src/main/board-protocol-service.ts` — store the per-session design context

- Add one map (type from `../ipc/board-bridge-channels`):
  `const sessionToDesign = new Map<Electron.Session, { theme: BoardThemePalette; tokens: Record<string, string> }>();`
- Extend `registerBoardProtocol(partition: string, boardRoot: string, theme: BoardThemePalette, tokens: Record<string, string>)`:
  after `sessionToRoot.set(ses, root);` add `sessionToDesign.set(ses, { theme, tokens });`.
- In `unregisterBoardProtocol`: add `sessionToDesign.delete(ses);`.
- Add `export function getBoardDesignForSession(ses: Electron.Session) { return sessionToDesign.get(ses); }`.

> Theme is app-global, but storing per-session is symmetric with `sessionToRoot` and avoids a
> global; each board registers with the then-current palette, so a board opened after a switch is
> correct without any cache-refresh path. (Metric tokens are identical for every board — stored
> here only so the one `getContext` lookup returns both in a single object.)

### 4. `src/ipc/api-types.ts`, `src/ipc/renderer/api.ts`, `src/ipc/main/controller.ts` — widen the registration signature

- `api-types.ts`: `[Endpoint.registerBoardProtocol]: (partition: string, boardRoot: string, theme: BoardThemePalette, tokens: Record<string, string>) => Promise<void>;`
  (import `BoardThemePalette` type-only). The enum member is unchanged.
- `ipc/renderer/api.ts`: `registerBoardProtocol = async (partition, boardRoot, theme: BoardThemePalette, tokens: Record<string, string>) => executeOnce<void>(Endpoint.registerBoardProtocol, partition, boardRoot, theme, tokens);`
- `ipc/main/controller.ts`: `registerBoardProtocol = async (_event, partition, boardRoot, theme: BoardThemePalette, tokens: Record<string, string>) => { const { registerBoardProtocol } = await import("../../main/board-protocol-service"); registerBoardProtocol(partition, boardRoot, theme, tokens); }`

### 5. `src/main/board-bridge.ts` — return theme + tokens from `getContext`

```ts
import { getBoardRootForSession, getBoardDesignForSession } from "./board-protocol-service";
// inside getContext handler:
const boardRoot = getBoardRootForSession(event.sender.session) ?? "";
const design = getBoardDesignForSession(event.sender.session);
event.returnValue = {
    boardRoot,
    theme: design?.theme ?? EMPTY_THEME,
    tokens: design?.tokens ?? {},
} satisfies BoardContext;
```
Define a tiny `EMPTY_THEME: BoardThemePalette = { id: "", isDark: true, vars: {} }` fallback for an
unknown session (mirrors the `boardRoot ?? ""` pattern). No other handler changes.

### 6. `src/preload-board.ts` — apply color + metric `--p-*`, expose `theme`/`tokens`/`onThemeChange`

- At init, `getContext` returns the full context; capture both:
  ```ts
  let currentTheme: BoardThemePalette = ctx?.theme ?? { id: "", isDark: true, vars: {} };
  const tokens: Record<string, string> = ctx?.tokens ?? {};
  ```
- Apply a `--p-*` map to the guest `<html>` (one helper for colors + metrics) and keep a callback registry:
  ```ts
  function applyVars(vars: Record<string, string>): void {
      const root = document?.documentElement;
      if (!root) return;
      for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }
  const themeCbs: Array<(t: BoardThemePalette) => void> = [];

  // Apply initial colors + metrics before the page paints. documentElement exists at
  // preload time; guard + retry on DOMContentLoaded for safety.
  const applyInitial = () => { applyVars(currentTheme.vars); applyVars(tokens); };
  if (document?.documentElement) applyInitial();
  else document?.addEventListener("DOMContentLoaded", applyInitial, { once: true });

  // Live COLOR updates pushed by the host on theme switch (metrics never change).
  ipcRenderer.on(BoardBridgeChannel.themeChanged, (_e, palette: BoardThemePalette) => {
      currentTheme = palette;
      applyVars(palette.vars);
      for (const cb of themeCbs) { try { cb(palette); } catch (err) { console.error("persephone.onThemeChange callback error:", err); } }
  });
  ```
- Extend the exposed object (note the `theme` **getter** so the documented property stays live;
  `tokens` is a static frozen object):
  ```ts
  get theme(): BoardThemePalette { return currentTheme; },
  tokens: Object.freeze({ ...tokens }),
  onThemeChange(cb: (theme: BoardThemePalette) => void): () => void {
      themeCbs.push(cb);
      try { cb(currentTheme); } catch (err) { console.error("persephone.onThemeChange callback error:", err); }
      return () => { const i = themeCbs.indexOf(cb); if (i >= 0) themeCbs.splice(i, 1); };
  },
  ```
  Import `BoardThemePalette` from `./ipc/board-bridge-channels`. `onThemeChange` fires **once
  immediately** with the current palette (so a board applies colors on registration without a
  separate read) and again on every switch. Update the header comment (drop the "arrive in US-725" note).

### 7. `src/renderer/editors/board/BoardWebview.tsx` — compute initial design + push live

- Add a `<webview>` ref (mirror the browser editor's `Electron.WebviewTag` ref typing in
  `src/renderer/editors/browser/`): `const webviewRef = useRef<Electron.WebviewTag | null>(null);`
  and `ref={webviewRef}` on the `<webview>`.
- Pass the initial palette + static tokens into registration:
  ```ts
  void api.registerBoardProtocol(partition, boardRoot, computeBoardThemePalette(), BOARD_TOKEN_VARS).then(() => {
      if (live) setReady(true);
  });
  ```
- Subscribe to theme changes and push the new colors to the guest (separate effect, runs once):
  ```ts
  useEffect(() => {
      const unsub = settings.onChanged.subscribe(({ key }) => {
          if (key !== "theme") return;
          try { webviewRef.current?.send(BoardBridgeChannel.themeChanged, computeBoardThemePalette()); }
          catch { /* webview not ready yet — initial theme already delivered via getContext */ }
      });
      return unsub;
  }, []);
  ```
  Import `settings` from `../../api/settings`, `computeBoardThemePalette` + `BOARD_TOKEN_VARS` from
  `./board-theme`, `BoardBridgeChannel` from `../../../ipc/board-bridge-channels`.

### 8. `src/renderer/editors/board/board-api.d.ts` — public typing

Add to the `--p-*` section a `PersephoneThemePalette` interface (`id`, `isDark`,
`vars: Record<string, string>`) and to `PersephoneBoardApi`:
```ts
/** Current host palette (color `--p-*` names → values), live. */
readonly theme: PersephoneThemePalette;
/** Static metric tokens (`--p-space-*`, `--p-radius-*`, …) — `--p-*` name → CSS value. */
readonly tokens: Readonly<Record<string, string>>;
/** Subscribe to theme changes; fires once immediately with the current palette. Returns an unsubscribe fn. */
onThemeChange(cb: (theme: PersephoneThemePalette) => void): () => void;
```
Keep self-contained (mirrors `BoardThemePalette`, like the existing handle-contract mirror). Add a
short doc block listing the color + metric `--p-*` names so an author sees the contract here.

## Concerns / open questions

- **C-A — `--p-*` set: RESOLVED — provisionally frozen (user, 2026-06-19).** The 20 color tokens +
  the metric set (generated from `tokens.ts`) are adopted as the working contract. **Not released
  yet**, so the list stays editable through EPIC-034 implementation — when adopting/skinning
  components (US-727) reveals a needed token, add or adjust it then. The C5 hard-freeze (no
  renames/removals) takes effect at **release**, not now.
- **C-B — expose `tokens.ts` metrics: DECIDED — in scope (user, 2026-06-19).** Folded into this
  task: a sibling, theme-independent metric `--p-*` contract generated from `tokens.ts`, delivered
  once at init alongside the colors, with a `persephone.tokens` JS mirror (see the Metric tokens
  table + plan steps 2/6/8). No live update (constants). Same C5 freeze applies (rolled into C-A).
- **C-C — `persephone.theme` as a getter.** Exposed as `get theme()` so the documented property
  reflects live updates. Modern Electron `contextBridge` proxies getters; **acceptance check:**
  confirm `window.persephone.theme` reflects a post-switch value in the board. If a getter ever
  fails to proxy, the trivial fallback is `onThemeChange` (already the reactive API) — but the
  getter is expected to work and is the chosen design.
- **C-D — first-paint flash.** `--p-*` is applied by the preload before the page's scripts, so
  there is effectively no flash for the in-process load. Board CSS should still use
  `var(--p-bg, <fallback>)` fallbacks (the US-726 template/dev-shim ships sensible defaults) so a
  board also renders standalone (dev-shim) and degrades gracefully if a var is ever absent.
- **C-E — theme-change while webview is loading.** `webview.send` before `dom-ready` may no-op;
  harmless because the board receives the current theme via `getContext` at init regardless. The
  `try/catch` around `send` covers it.
- **C-F — `getResolvedColor` vs `getComputedStyle`.** Use `getResolvedColor` (reads the active
  theme's `colors` map directly) — concrete hex, no CSS custom-property resolution ambiguity, and
  it tracks `applyTheme`'s `currentThemeId`. `settings.theme` and `getCurrentThemeId()` are kept in
  sync by `applyTheme`; if they ever diverged the palette would simply use the applied theme, which
  is what the DOM shows — the correct choice.

## Acceptance criteria

1. A board's CSS using color vars (`var(--p-bg)`, `var(--p-text)`, `var(--p-accent)`, …) and metric
   vars (`padding: var(--p-space-md)`, `border-radius: var(--p-radius-sm)`, …) renders themed and
   correctly spaced on first paint (no manual setup in the board).
2. Switching the app theme (e.g. dark → light) **restyles the open board live** — both CSS
   (color `--p-*` update) and any JS using `persephone.onThemeChange`. Metric vars are unchanged.
3. `window.persephone.theme` returns `{ id, isDark, vars }` with concrete colors and reflects the
   current theme after a switch (C-C check); `window.persephone.tokens` returns the metric map.
4. `persephone.onThemeChange(cb)` fires once immediately with the current palette and again on each
   switch; the returned function unsubscribes.
5. Reloading the board (and opening a new board after a theme switch) shows the current theme + tokens.
6. No CSP violations in the board devtools console; `npx tsc --noEmit` and `npx eslint` clean on all
   changed files.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/ipc/board-bridge-channels.ts` | + `BoardBridgeChannel.themeChanged`; + `BoardThemePalette`; `BoardContext` gains `theme` + `tokens`. |
| `src/renderer/editors/board/board-theme.ts` | **NEW** — `P_VAR_SOURCES` (color map) + `computeBoardThemePalette()` + `BOARD_TOKEN_VARS` (metrics from `tokens.ts`). |
| `src/main/board-protocol-service.ts` | + `sessionToDesign` map; `registerBoardProtocol` takes `theme` + `tokens`; + `getBoardDesignForSession`. |
| `src/ipc/api-types.ts` | `registerBoardProtocol` signature gains `theme` + `tokens`. |
| `src/ipc/renderer/api.ts` | `registerBoardProtocol` wrapper forwards `theme` + `tokens`. |
| `src/ipc/main/controller.ts` | `registerBoardProtocol` handler forwards `theme` + `tokens`. |
| `src/main/board-bridge.ts` | `getContext` returns `{ boardRoot, theme, tokens }`. |
| `src/preload-board.ts` | apply color + metric `--p-*` at init; `ipcRenderer.on(themeChanged)`; expose `theme` getter, `tokens`, `onThemeChange`. |
| `src/renderer/editors/board/BoardWebview.tsx` | webview ref; pass initial palette + `BOARD_TOKEN_VARS` to register; push palette on `settings.onChanged`. |
| `src/renderer/editors/board/board-api.d.ts` | + `PersephoneThemePalette`, `theme`, `tokens`, `onThemeChange` + color/metric `--p-*` doc block. |

### Files that need NO changes (verified)

- `src/main/board-protocol-service.ts` **CSP** — `style-src 'unsafe-inline'` already present.
- `src/renderer/theme/color.ts`, `theme/themes/*` — read-only sources; the `--p-*` mapping lives in
  `board-theme.ts`, not here.
- The command-runner / `execute()` path (`runner-channels.ts`, `command-runner.ts`, `proc.ts`) — unrelated.
- `src/main/main-setup.ts` — `initBoardBridge()` is already wired; no new init.
