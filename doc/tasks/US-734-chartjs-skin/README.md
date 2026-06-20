# US-734: Recommended component — Chart.js

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

## Goal

Adopt **Chart.js** as a recommended Web Board component, following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone theme integration tuned against the `--p-*`
contract, an autonomous MCP style review across both themes, and promotion to
`boards-assets/` with a manifest entry.

Chart.js renders to `<canvas>` and has **no stylesheet**, so — unlike Tabulator's CSS
skin — its "skin" is a **JS theme adapter** that pushes the `--p-*` palette into
Chart.js options (the JS-colored shape from the playbook).

## What was built

Demo board at `.persephone/boards/Chart.js/` (gitignored working artifact):

- **Vendored** Chart.js **4.4.6** UMD into `lib/chart.umd.js` (global `Chart`).
- **`index.html`** — a 2×2 dashboard (line / bar / doughnut / radar) with toolbar +
  statusbar chrome styled entirely with `--p-*`.
- **`app.js`** — builds the four charts, loads their data through
  `persephone.execute("node scripts/gen.js")` (dogfoods the channel), and re-themes on
  `persephone.onThemeChange` using the **callback's palette argument**.
- **`scripts/gen.js`** — backend data generator; seeded PRNG, emits a single
  `@@RESULT@@`-tagged JSON document, diagnostics to stderr.
- **`chart-theme.js`** — the theme adapter (`window.PersephoneChartTheme`): `applyDefaults`,
  `palette` / `paletteN`, `alpha`, `mix`. Sets `Chart.defaults.color` (ticks / legend /
  radar point-labels) and `Chart.defaults.borderColor` (grid / angle lines) globally, so
  scales follow the theme with **no per-chart scale work**; datasets are colored from the
  `--p-*` semantic palette (accent / success / warning / error / link / muted).

### Bug fixed during the build

- `applyScales()` mutated a chart's resolved `chart.options.scales` proxy → Chart.js's
  scriptable-options resolver threw `t.startsWith is not a function`. Removed it; grid /
  tick / point-label colors inherit `Chart.defaults.*` (set in `applyDefaults`), which is
  both simpler and correct.

## US-725 theme-contract fixes (found via the MCP review)

The autonomous review surfaced two real bugs in the board **theme contract** (US-725),
independent of the Chart.js skin. Both fixed in this task:

1. **`persephone.theme` was a stale snapshot after an in-session theme switch.** The
   guest runs with `contextIsolation`, so `contextBridge` copies the `theme` / `tokens`
   getters **once** at expose time — only `onThemeChange` (a proxied function) delivered a
   live palette. Fix: added live **`persephone.getTheme()` / `getTokens()`** functions,
   and documented `persephone.theme` honestly as a load-time snapshot (use `getTheme()` or
   the `onThemeChange` argument for live values).
2. **Guest reload painted the registration-time theme.** `getContext` (read on every guest
   load) returned the palette stored in `sessionToDesign` **at registration**, never
   updated on a theme switch — so a board reloaded after a switch (e.g. live-reload on
   edit) showed the old theme. Fix: a new `updateBoardTheme` IPC updates the stored palette
   for all live board sessions on every switch, so `getContext` is always current.

Touched: `src/preload-board.ts`, `src/renderer/editors/board/board-api.d.ts`,
`src/renderer/editors/board/BoardWebview.tsx`, `src/main/board-protocol-service.ts`,
`src/ipc/{api-types.ts, renderer/api.ts, main/controller.ts}`, and the authoring guide
`assets/board-template/CLAUDE.md`. *Requires an app restart to take effect (preload + main).*

## Verification

- `npm run typecheck` — clean.
- MCP review (`browser_evaluate` + screenshots) in **dark (default-dark)** and **light
  (light-modern)**: every dataset color, grid line, tick, doughnut gap, tooltip, and the
  chrome traces to its `--p-*` token; live recolor on theme switch confirmed via
  `onThemeChange`. `execute()` data load works end-to-end (1k+ data points).

## Acceptance criteria

- [x] Chart.js board renders natively-themed in **both** dark and light (no off-palette colors).
- [x] Theming via a **JS adapter** against `--p-*` (init snapshot + live `onThemeChange` arg).
- [x] Chart.js is **local** to the board (no CDN); board loads offline.
- [x] At least one data path goes through `persephone.execute()`.
- [x] Adapter promoted to `boards-assets/chart-theme.js`; manifest + README updated.
- [x] US-725 theme-contract bugs fixed (live `getTheme()`; `getContext` returns current).

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/chart-theme.js` | published Chart.js theme adapter (frozen, stamped) |
| `boards-assets/manifest.json` | added `chartjs` entry (vendor, JS-adapter skin, cssVsJs) |
| `boards-assets/README.md` | CSS-skin vs JS-adapter workflow; components table |
| `assets/board-template/CLAUDE.md` | corrected theme section (snapshot vs live; `getTheme()`) |
| `src/preload-board.ts` | added live `getTheme()` / `getTokens()`; honest `theme` docs |
| `src/renderer/editors/board/board-api.d.ts` | bridge types for `getTheme` / `getTokens` |
| `src/renderer/editors/board/BoardWebview.tsx` | push `updateBoardTheme` on theme switch |
| `src/main/board-protocol-service.ts` | `updateAllBoardThemes()` refreshes stored palette |
| `src/ipc/{api-types,renderer/api,main/controller}.ts` | `updateBoardTheme` endpoint |

The demo board `.persephone/boards/Chart.js/` stays local (gitignored).
