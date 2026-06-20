# US-736: Recommended component — Tom Select

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

## Goal

Adopt **Tom Select** as a recommended Web Board component, following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone skin tuned against the `--p-*` contract, an
autonomous MCP style review across both themes, and promotion to `boards-assets/`
with a manifest entry.

Tom Select styles itself entirely with CSS (its control and dropdown are DOM, not
canvas), so — like Tabulator and Flatpickr, unlike Chart.js — its skin is a **CSS
skin** (`tom-select.css`) written against `--p-*`, with **no JS-colored surface**.

## What was built

Demo board at `.persephone/boards/Tom Select/` (gitignored working artifact):

- **Vendored** Tom Select **2.4.3** into `lib/tom-select.complete.min.js` (all plugins)
  + `lib/tom-select.css` (the default theme — the one the skin overrides).
- **`index.html`** — a field grid exercising single select, multi-select with removable
  chips, free-tag create, and a **grouped** picker (optgroups + in-dropdown search);
  toolbar + statusbar chrome styled with `--p-*`.
- **`app.js`** — builds the TomSelect instances and loads the grouped picker's options
  through `persephone.execute("node scripts/options.js")` (dogfoods the channel). Tom
  Select is a pure CSS skin, so the theme switch re-tints with no JS; `onThemeChange`
  only updates a theme-id label.
- **`scripts/options.js`** — backend; returns a grouped option list (`optgroups` +
  `options`, optional `query` filter from stdin), single `@@RESULT@@`-tagged JSON
  document, diagnostics to stderr.
- **`tom-select.css`** — the skin: restyles the control box (mirrors the board's inputs —
  `--p-bg` + `--p-border`, accent focus ring), input + placeholder, tag chips (neutral
  tint, accent on `.active`) with the remove button, the dropdown panel + shadow, optgroup
  headers, options (the keyboard/hover `.active` row = solid accent, like the app's menus),
  the matched-substring `.highlight`, the spinner, and the `dropdown_input` /
  `dropdown_header` plugins — all from `--p-*`. Tom Select's hardcoded accents
  (`#f5fafd`/`#495c68` active option, `rgba(125,168,208,0.2)` match highlight) → `--p-accent`.

## Verification

- MCP review (`browser_evaluate` probes + screenshots) in **dark (default-dark)** and
  **light (light-modern)**:
  - Every probed surface traces to its `--p-*` token, **not** a skin fallback or Tom
    Select's default: control bg = `--p-bg`, control border = `--p-border`, dropdown bg =
    `--p-panel`, optgroup header = `--p-text-muted`, active option = `--p-accent` /
    `--p-accent-text`, tag chip text = `--p-text`, match highlight = accent tint
    (and accent-text tint on an active row).
  - Exercised open states: grouped dropdown with optgroups, in-dropdown search box,
    keyboard-active row, match highlight, removable chips, free-tag create.
  - Live theme switch confirmed: the board re-tinted with **no reload** and `onThemeChange`
    fired (theme-id label updated), since the skin is pure CSS.
- `execute()` data path works end-to-end (grouped picker options from `scripts/options.js`).

## Acceptance criteria

- [x] Tom Select board renders natively-themed in **both** dark and light (no off-palette colors).
- [x] Theming via a **CSS skin** against `--p-*` (literal fallbacks; `color-mix` tints for both themes).
- [x] Tom Select is **local** to the board (no CDN); board loads offline.
- [x] At least one data path goes through `persephone.execute()` (grouped picker options).
- [x] Skin promoted to `boards-assets/tom-select.css`; manifest + README updated.

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/tom-select.css` | published Tom Select CSS skin (frozen, stamped `@2.4.3`) |
| `boards-assets/manifest.json` | added `tom-select` entry (vendor, CSS skin, cssVsJs note) |
| `boards-assets/README.md` | components table — Tom Select row |

The demo board `.persephone/boards/Tom Select/` stays local (gitignored).
