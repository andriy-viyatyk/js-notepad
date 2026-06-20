# US-727: Recommended-components manifest + first skin (Tabulator)

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Active (implementation in progress)

## Goal

Ship Persephone's first **recommended-component skin** — a Tabulator grid styled
entirely against the `--p-*` theme contract so a Web Board grid looks native to
Persephone in **both** light and dark themes — plus the **manifest** that publishes
the recommended-components list. Prove it on a real board (`.persephone/boards/Tabulator/`).

## Background

- **POC:** `temp/tabulator-board-test.html` — a dark-skinned Tabulator (toolbar, row
  generator, 1000 rows, range-select, clipboard, sorting, header filters, row context
  menu). It works but **hardcodes dark hex** (`#2d2d2d`, `#094771`, …) and links the CDN.
  The skin must (a) map every hardcoded color to a `--p-*` token and (b) vendor Tabulator
  locally (CSP forbids remote — see board `CLAUDE.md`).
- **Theme contract source of truth:** `src/renderer/editors/board/board-theme.ts`
  (`P_VAR_SOURCES`) — 20 color tokens + metric tokens. The skin uses only these names
  (with literal fallbacks).
- **Shared base:** `assets/board-base.css` (page bg, monospace, themed scrollbars) is
  already copied into the board; the skin builds on top.
- **Skins are NOT bundled** (epic C7): they live in a repo folder `boards-assets/` and an
  agent copies the needed one into the board folder as a frozen, version-stamped local copy.

## Implementation plan

1. **Vendor Tabulator** into `.persephone/boards/Tabulator/lib/` (`tabulator.min.js` +
   `tabulator.min.css`), pinned to a v6 release; record the exact version for the stamp.
2. **Build the board page** — adapt the POC into `index.html` + `app.js`: real grid,
   toolbar, generator, range-select/clipboard/sort/filter/context-menu, all chrome styled
   with `--p-*`. Drive at least one data action through `persephone.execute()` (dogfood the
   channel) while keeping a client generator for big-row stress.
3. **Author the skin** — `tabulator.css` in the board folder, written **only** against
   `--p-*` (literal fallbacks), version-stamped header
   (`/* persephone skin · tabulator-tables@X.Y · tuned 2026-06 */`), heavily commented per
   block (what it targets + why). Cover the full themeable-selector checklist. Document the
   **CSS-vs-JS split** (skin handles chrome; progress-bar / formatter colors set from
   `persephone.theme` in JS).
4. **Visual review loop** — open the board in Persephone, use the `browser_*` MCP tools to
   snapshot/screenshot, compare against the app's own look, hunt color/contrast
   discrepancies, patch the skin. Repeat per theme (dark + light).
5. **Promote** the proven skin to `boards-assets/tabulator.css` and write the
   **recommended-components manifest** (per component: purpose, tested version, skin link,
   CSS-vs-JS notes). Settle the manifest home + in-app discovery shape.

## Concerns / open questions

- **C-1 — Manifest home/format.** Where the recommended-components manifest lives
  (`boards-assets/manifest.json`? a `read_guide`-style MCP resource?) and how a board author
  discovers it. *To settle during step 5.*
- **C-2 — Light-theme contrast.** The POC's selection-blue (`#094771`) + white text is
  dark-only. `--p-selection-bg`/`--p-selection-text` must hold contrast in light theme too —
  verify in the review loop.
- **C-3 — JS-set colors.** Tabulator's `progress` formatter color array and any legend
  colors can't be set from CSS; they come from `persephone.theme.vars` in `app.js`. Keep the
  skin/JS boundary documented.

## Acceptance criteria

- Tabulator board renders natively-themed in **both** dark and light (no off-palette colors).
- Skin uses **only** `--p-*` tokens (+ literal fallbacks); version-stamped; per-block comments.
- Tabulator + skin are **local** to the board (no CDN); board loads offline.
- At least one data path goes through `persephone.execute()`.
- Skin promoted to `boards-assets/tabulator.css`; recommended-components manifest published.

## Progress

- [x] Tabulator **6.5.1** vendored into the test board's `lib/`.
- [x] Board page built (`index.html` + `app.js` + `scripts/gen.js`) — themed chrome,
      `execute()`-driven data load, range-select/clipboard/sort/filter/context-menu.
- [x] Skin `tabulator.css` authored against `--p-*` (color-mix tints for theme-adaptive
      hover/selection), version-stamped, per-block comments, JS-vs-CSS split documented.
- [x] Verified live via MCP: dark + light themes, grid chrome, rows/cells, range + active
      selection, footer, status pills, progress bars, and body-level context menu — all
      trace to `--p-*` values (no off-theme greys). `execute()` channel works end-to-end.
- [x] Promoted to `boards-assets/` — `tabulator.css` (frozen, stamped) + `manifest.json`
      (recommended-components list, vendor URLs, CSS-vs-JS note) + `README.md` (usage,
      load order, version-drift workflow).
- [ ] Exhaustive MCP interaction sweep (list-filter dropdown, multi-cell range, grouping,
      calc rows, empty placeholder) — running; fold in any findings.

## Files changed

| Path | Change |
|------|--------|
| `.persephone/boards/Tabulator/lib/tabulator.min.{js,css}` | vendored Tabulator 6.5.1 (test board) |
| `.persephone/boards/Tabulator/index.html` | themed board page (chrome via `--p-*`) |
| `.persephone/boards/Tabulator/app.js` | frontend — grid config + `execute()` load + theme-driven formatter colors |
| `.persephone/boards/Tabulator/scripts/gen.js` | backend — generates rows, `@@RESULT@@`-tagged JSON |
| `.persephone/boards/Tabulator/tabulator.css` | the skin (working copy) |
| `boards-assets/tabulator.css` | published skin (frozen, stamped) |
| `boards-assets/manifest.json` | recommended-components manifest |
| `boards-assets/README.md` | recommended-components / skin usage guide |
