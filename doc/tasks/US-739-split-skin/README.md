# US-739: Recommended component — Split.js

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

## Goal

Adopt **Split.js** as a recommended Web Board component, following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone skin tuned against the `--p-*` contract, an
autonomous MCP style review across both themes, and promotion to `boards-assets/`
with a manifest entry. This is the final EPIC-034 recommended-component placeholder.

Split.js ships **no stylesheet** — it only sets inline sizes on the panes and inserts
bare `.gutter` `<div>`s between them; the dividers' appearance is the author's job. So
the skin is a **CSS skin** (`split.css`) styling those gutters, like marked + highlight.js.

## What was built

Demo board at `.persephone/boards/Split.js/` (gitignored working artifact):

- **Vendored** Split.js **1.6.5** into `lib/split.min.js` (~6.8 KB, global `Split`,
  `Split(['#a','#b'], { sizes, minSize, gutterSize, direction })`).
- **`index.html`** — an IDE-style layout: a horizontal outer split (**sidebar | main**)
  with a **nested** vertical split (**editor / console**) inside main; flexbox layout,
  toolbar (title + theme pill + Reset layout + Reload). Loads `board-base.css → split.css`,
  then `lib/split.min.js → app.js`.
- **`app.js`** — builds the two nested splits, fills the panes from
  `persephone.execute("node scripts/panes.js")` (dogfoods the channel), and exposes a
  "Reset layout" that calls `setSizes(...)`. Since Split.js is a pure CSS skin, the theme
  handler only refreshes the theme-pill label (no JS re-render).
- **`scripts/panes.js`** — backend; returns the content for all three panes (file list,
  editor code, console log lines) as a single `@@RESULT@@`-tagged JSON document,
  diagnostics to stderr.
- **`split.css`** — the skin. Styles the gutters Split.js inserts.

### Skin → `--p-*` map

- **Gutter bar** `background` = `--p-panel`; **hover/drag** tint = `color-mix` toward
  `--p-accent` (carried through the drag via `:hover` because Split.js adds no dragging
  class).
- **Resize cursors** by direction: `.gutter-horizontal` → `col-resize`,
  `.gutter-vertical` → `row-resize`.
- **Grip** — a centered run of dots drawn with a `radial-gradient` in `--p-text-muted`
  (brightening to `--p-accent` on hover), **not** a fixed-grey PNG (Split.js's docs
  suggest a bitmap, which wouldn't follow the theme).
- **Focus** — gutters are plain non-focusable `<div>`s (no native-outline blind spot,
  unlike Tom Select's focusable control). The skin still ships a defensive
  `:focus-visible` accent ring — a no-op unless a board makes a gutter keyboard-operable.

The **layout** (flex vs float, and `.gutter { flex: 0 0 auto }` so the fixed-size gutter
doesn't shrink) belongs to the board's own CSS, not the skin — the skin is appearance-only.

## Verification

- MCP review (`browser_evaluate` probes + screenshots) in **dark (default-dark)** and
  **light (light-modern)**:
  - **Dark:** gutter `background` = `--p-panel` `rgb(49,49,49)` (the real var `#313131`,
    **not** the literal fallback `#252526`); cursors `col-resize` / `row-resize`; both
    gutters have **no `tabindex`** (confirmed non-focusable → no outline surface).
  - **Light (discriminating — fallbacks ≠ theme values):** gutter `background` =
    `--p-panel` `rgb(243,243,243)`, grip = `--p-text-muted` `rgb(110,118,129)`, hover
    accent = `--p-accent` `rgb(0,95,184)` — all tracing to the live light palette, proving
    no hardcoded color leaks.
  - Both nested splits render and drag correctly; the `execute()` path populated all
    three panes (sidebar files, editor code, colored console lines).
- User's theme restored to default-dark after review.

## Acceptance criteria

- [x] Split.js board renders horizontal + nested-vertical splits, gutters themed in **both** dark and light.
- [x] Theming via a **CSS skin** against `--p-*` (gutter fill, hover tint, grip dots, cursors); re-tints on theme switch with no JS.
- [x] Split.js is **local** to the board (no CDN); board loads offline.
- [x] At least one data path goes through `persephone.execute()` (pane content from `scripts/panes.js`).
- [x] Skin promoted to `boards-assets/split.css`; manifest + README updated.

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/split.css` | published Split.js gutter skin (frozen, stamped `@1.6.5`) |
| `boards-assets/manifest.json` | added `split` entry (CSS skin, gutter/grip/cursor + focus note) |
| `boards-assets/README.md` | components table — Split.js row |

The demo board `.persephone/boards/Split.js/` stays local (gitignored).
