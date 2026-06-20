# Persephone Board Assets — recommended components & skins

This folder publishes the components Persephone **recommends** for Web Boards, plus a
**Persephone skin** for each — a CSS file that restyles the component to match the app's
theme. It is the home of the recommended-components **manifest** (`manifest.json`).

These files are **not bundled in the Persephone installer**. A board author (or an AI
agent building a board) fetches only what a given board needs and copies it into the
board folder. This keeps the installer lean and lets the skin library grow independently
of app releases.

## What Persephone guarantees — and what it doesn't

- **Guaranteed:** the **palette**, via the `--p-*` CSS-variable theme contract injected
  into every board (`--p-bg`, `--p-panel`, `--p-text`, `--p-accent`, … + metric tokens).
  See a board's `CLAUDE.md` for the full list.
- **Not guaranteed:** **component styling.** A skin here is a best-effort, version-stamped
  starting point — it may not cover every case and may drift on a newer component version.
  You own the local copy and may patch it.

## How to use a skin (board author / agent)

1. **Vendor the component locally.** The board CSP forbids remote network, so download the
   component's JS/CSS into the board folder (e.g. `lib/`) and reference them with relative
   paths — never a CDN `<script>`/`<link>`. The `vendor` URLs in `manifest.json` are where
   to fetch from.
2. **Copy the skin** into the board folder as a frozen local copy. A skin is one of two
   shapes (the manifest's `skin.type` / `loadOrder` says which):
   - a **CSS skin** (e.g. `tabulator.css`) for components that style themselves with CSS, or
   - a **JS adapter** (e.g. `chart-theme.js`) for **canvas / JS-colored** components (Chart.js,
     and later Mermaid) that have no stylesheet to override.
3. **Link it in `index.html`** in the documented order:
   - A **CSS skin** must come **after** the component's own CSS so it can override it. For Tabulator:
     ```html
     <link rel="stylesheet" href="./board-base.css" />
     <link rel="stylesheet" href="./lib/tabulator.min.css" />
     <link rel="stylesheet" href="./tabulator.css" />
     ```
   - A **JS adapter** loads after the library and before your `app.js`. For Chart.js:
     ```html
     <script src="./lib/chart.umd.js"></script>
     <script src="./chart-theme.js"></script>
     <script src="./app.js"></script>
     ```
4. **Handle the CSS-vs-JS split.** A CSS skin styles component *chrome* via `--p-*`. Colors a
   component sets from JS — Tabulator's inline `progress`-bar fill / `traffic-light`, or
   *everything* a canvas library like Chart.js draws — can't be reached from CSS. Drive those
   from the live palette in your board JS: at init read `persephone.theme`, and on a theme
   switch use the palette passed to `persephone.onThemeChange` (or `persephone.getTheme()`) —
   **not** a cached `persephone.theme`, which is a load-time snapshot and goes stale after a
   switch. Each component's `cssVsJs` note in the manifest says exactly what falls on the JS side.

## Version drift

Each skin header is stamped with the component version it was tuned for, e.g.
`/* persephone skin · tabulator-tables@6.5.1 · tuned 2026-06 */`. If you vendor a newer
component version, expect possible drift: test the board, and patch your local skin copy
where class names or defaults changed. Fixes are welcome back here as a PR so the
published skin stays current.

## Components

See [`manifest.json`](manifest.json) for the machine-readable list. Currently:

| Component | Use | Tested version | Skin |
|-----------|-----|----------------|------|
| [Tabulator](https://tabulator.info/) | Data grid (sort/filter, range-select + clipboard, virtualized, edit, group, tree) | 6.5.1 | [`tabulator.css`](tabulator.css) (CSS) |
| [Chart.js](https://www.chartjs.org/) | Charts & plots (line, bar, doughnut/pie, radar, scatter, mixed) | 4.4.6 | [`chart-theme.js`](chart-theme.js) (JS adapter) |
| [Flatpickr](https://flatpickr.js.org/) | Date / time picker (single, date+time, time-only, range, inline, week numbers, min/max + disabled dates) | 4.6.13 | [`flatpickr.css`](flatpickr.css) (CSS) |
| [Tom Select](https://tom-select.js.org/) | Rich select / tags / autocomplete (searchable single + multi, removable chips, create, option groups, remote options) | 2.4.3 | [`tom-select.css`](tom-select.css) (CSS) |
| [marked](https://marked.js.org/) + [highlight.js](https://highlightjs.org/) | Markdown render + code highlighting (GFM tables/task lists; fenced-code syntax theme) | marked 15.0.12 + highlight.js 11.11.1 | [`markdown.css`](markdown.css) (CSS) |
