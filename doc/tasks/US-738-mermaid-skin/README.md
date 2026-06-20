# US-738: Recommended component — Mermaid

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

## Goal

Adopt **Mermaid** as a recommended Web Board component, following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone skin tuned against the `--p-*` contract, an
autonomous MCP style review across both themes, and promotion to `boards-assets/`
with a manifest entry.

Mermaid renders diagrams to **SVG colored from JS** (it ships no stylesheet), so —
like Chart.js, unlike the CSS-skin components — its skin is a **JS theme-adapter**
(`mermaid-theme.js`) that builds Mermaid's `themeVariables` from the `--p-*` palette.

## What was built

Demo board at `.persephone/boards/Mermaid/` (gitignored working artifact):

- **Vendored** Mermaid **11.15.0** into `lib/mermaid.min.js` (~3.2 MB, global `mermaid`,
  async v11 API: `mermaid.initialize(config)` once, then `await mermaid.render(id, text)`).
- **`index.html`** — toolbar (title + theme pill + Reload) over a responsive grid of
  diagram cards; loads `lib/mermaid.min.js → mermaid-theme.js → app.js`.
- **`app.js`** — loads the diagram sources over `persephone.execute("node scripts/diagrams.js")`
  (dogfoods the channel), renders each to SVG, and **re-renders all on a theme switch**
  (the key difference from a CSS skin — see below). Keeps the specs for re-render; uses a
  monotonic counter so every `mermaid.render` call gets a unique id.
- **`scripts/diagrams.js`** — backend; returns six diagram specs (flowchart, sequence,
  class, state, pie, gantt — covering every major `themeVariables` group) as a single
  `@@RESULT@@`-tagged JSON document, diagnostics to stderr.
- **`mermaid-theme.js`** — the adapter. Exposes `window.PersephoneMermaidTheme`
  (`config(theme)`, `themeVariables(theme)`, `palette(theme)`, `mix`, `alpha`). `config()`
  uses Mermaid's customizable `theme: "base"` with a full `themeVariables` map built from
  `--p-*` (see below).

### Why it must re-render (not just re-initialize)

Mermaid is **not a live-update library**. It bakes colors into the SVG at render time;
`initialize()` only affects *future* renders. So this differs from both prior skin shapes:
a **CSS skin** re-tints with no JS, and **Chart.js** picks up new `Chart.defaults` on the
next `update()` of a live chart — but Mermaid's already-rendered SVGs are frozen. The
board's `onThemeChange` therefore calls `mermaid.initialize(config(theme))` **and**
re-runs `mermaid.render(...)` for every diagram. This is recorded in the manifest note so
future Mermaid boards get it right.

### themeVariables → `--p-*` map

Node fill/border/text (`primaryColor`/`mainBkg`=`--p-panel`, `nodeBorder`=`--p-border`,
`primaryTextColor`=`--p-text`), edges (`lineColor`=`--p-text-muted`), clusters
(panel/bg mix), edge labels (`--p-bg`), the full sequence set (actors=`--p-panel`,
notes=`--p-warning` tint + border, activation bars=`--p-accent`), state labels, pie
slices (`pie1..12` from the palette: accent, success, warning, error, link, text-muted),
and the gantt set (task/active=`--p-accent`/done=muted bars, sections, grid,
today line=`--p-error`).

## Verification

- MCP review (`browser_evaluate` probes + screenshots) in **dark (default-dark)** and
  **light (light-modern)**:
  - Probe in **light** (where the adapter fallbacks ≠ the theme values) confirmed the
    rendered SVG traces to `--p-*`: flowchart node fill = `--p-panel` `rgb(243,243,243)`,
    node border = `--p-border` `rgb(229,229,229)`, edge stroke = `--p-text-muted`
    `rgb(110,118,129)`, pie slices = `--p-accent` `rgb(0,95,184)` + `--p-success`
    `rgb(26,127,55)`, sequence note = `--p-warning` tint + `--p-warning` border
    `rgb(154,103,0)` — derived tints (cluster, note) are on-theme `mix()`es of `--p-*`.
  - All six diagram types render correctly in both themes; the gantt's grey-derived bars
    (initially off-palette) were fixed by adding the gantt `themeVariables` group.
  - **Live theme switch confirmed the re-render path:** switching the app theme re-rendered
    every diagram with the new palette **with no reload** (driven by `onThemeChange`).
- `execute()` data path works end-to-end (diagram sources from `scripts/diagrams.js`).

## Acceptance criteria

- [x] Mermaid board renders all diagram types natively-themed in **both** dark and light.
- [x] Theming via a **JS theme-adapter** against `--p-*`, re-applied + re-rendered on theme switch.
- [x] Mermaid is **local** to the board (no CDN); board loads offline.
- [x] At least one data path goes through `persephone.execute()` (diagram sources).
- [x] Adapter promoted to `boards-assets/mermaid-theme.js`; manifest + README updated.

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/mermaid-theme.js` | published Mermaid JS theme-adapter (frozen, stamped `@11.15.0`) |
| `boards-assets/manifest.json` | added `mermaid` entry (JS adapter, re-render-on-switch note) |
| `boards-assets/README.md` | components table — Mermaid row |

The demo board `.persephone/boards/Mermaid/` stays local (gitignored).
