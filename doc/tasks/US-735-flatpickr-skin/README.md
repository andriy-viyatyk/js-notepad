# US-735: Recommended component — Flatpickr

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

## Goal

Adopt **Flatpickr** as a recommended Web Board component, following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone skin tuned against the `--p-*` contract, an
autonomous MCP style review across both themes, and promotion to `boards-assets/`
with a manifest entry.

Flatpickr styles itself entirely with CSS (its calendar is a DOM dropdown, not a
canvas), so — like Tabulator and unlike Chart.js — its skin is a **CSS skin**
(`flatpickr.css`) written against `--p-*`, with **no JS-colored surface**.

## What was built

Demo board at `.persephone/boards/Flatpickr/` (gitignored working artifact):

- **Vendored** Flatpickr **4.6.13** into `lib/flatpickr.min.js` + `lib/flatpickr.min.css`
  (the base/light theme — the one the skin overrides).
- **`index.html`** — a field grid exercising every picker mode (single date, date+time
  24h, range, time-only, month-dropdown nav) plus an **inline** calendar with week
  numbers and a two-month view; toolbar + statusbar chrome styled with `--p-*`. The
  board owns the text `<input>` styling (flatpickr does not touch it).
- **`app.js`** — builds the instances and drives the inline calendar's config
  (selectable window, default date, disabled/"blocked" dates) through
  `persephone.execute("node scripts/dates.js")` (dogfoods the channel). Flatpickr is a
  pure CSS skin, so the theme switch re-tints with no JS; `onThemeChange` only updates a
  theme-id label.
- **`scripts/dates.js`** — backend; seeded PRNG, emits a single `@@RESULT@@`-tagged JSON
  document (`minDate`/`maxDate`/`defaultDate`/`disable`/`holidays`), diagnostics to stderr.
- **`flatpickr.css`** — the skin: restyles the calendar container (incl. the pointer-arrow
  `::before`/`::after` triangles + box-shadow border ring), month nav + year/month
  spinners, weekday header, every day-cell state (hover, `today` = accent outline,
  `selected`/range endpoints = solid accent, `inRange` = accent tint via `color-mix`,
  disabled, prev/next-month, week numbers), and the time picker — all from `--p-*`.
  Flatpickr's three hardcoded accents (`#569ff7` selection, `#959ea9` today, `#f64747`
  arrow-hover) are replaced with `--p-accent`.

## Verification

- MCP review (`browser_evaluate` probes + screenshots) in **dark (default-dark)** and
  **light (light-modern)**:
  - Every probed surface traces to its `--p-*` token, **not** a skin fallback or
    flatpickr's shipped default: calendar bg = `--p-panel`, day text = `--p-text`,
    weekday/prev-month/disabled = `--p-text-muted`(+tint), selected = `--p-accent` /
    `--p-accent-text`, today border = `--p-accent`, month label = `--p-text-strong`.
  - Exercised open states: single calendar, **range** (endpoints solid accent, in-range
    accent-tint fill, gap-fill box-shadow), **date+time** (time row + separator), month
    dropdown, inline + week numbers, disabled dates.
  - Live theme switch confirmed: the board re-tinted with **no reload** and `onThemeChange`
    fired (theme-id label updated), since the skin is pure CSS.
- `execute()` data path works end-to-end (inline calendar configured from `scripts/dates.js`).

## Acceptance criteria

- [x] Flatpickr board renders natively-themed in **both** dark and light (no off-palette colors).
- [x] Theming via a **CSS skin** against `--p-*` (literal fallbacks; `color-mix` tints for both themes).
- [x] Flatpickr is **local** to the board (no CDN); board loads offline.
- [x] At least one data path goes through `persephone.execute()` (inline calendar config).
- [x] Skin promoted to `boards-assets/flatpickr.css`; manifest + README updated.

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/flatpickr.css` | published Flatpickr CSS skin (frozen, stamped `@4.6.13`) |
| `boards-assets/manifest.json` | added `flatpickr` entry (vendor, CSS skin, cssVsJs note) |
| `boards-assets/README.md` | components table — Flatpickr row |

The demo board `.persephone/boards/Flatpickr/` stays local (gitignored).
