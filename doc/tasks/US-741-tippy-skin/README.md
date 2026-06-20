# US-741: Recommended component — Tippy.js

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Planned (not yet implemented)

## Goal

Adopt **Tippy.js** as a recommended Web Board component for **tooltips, popovers, and
dropdown / context menus**, following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone skin against `--p-*`, an autonomous MCP style review
across both themes, and promotion to `boards-assets/` with a manifest entry.

This fills the **transient-UI** gap — the bridge gives toasts (`notify`) and file dialogs,
but boards have no tooltips, hover cards, or in-board menus.

## Background

- Tippy.js (`tippy.js`, npm, v6) is the popular tooltip/popover library. It is built on
  **Popper v2** (the precursor to Floating UI — *not* Floating UI v1); the **bundle** UMD
  (`tippy-bundle.umd.min.js`) includes Popper and exposes a global `tippy`.
- **Unlike most CSS-skin components, Tippy's core CSS is REQUIRED**, not just default
  styling: `dist/tippy.css` provides the box geometry, the arrow geometry, and the
  show/hide visibility transforms. It must be vendored and loaded; our skin layers on top.
- **Theming the Tippy way — a named theme.** Rather than overriding the base `.tippy-box`
  globally (which fights the default look), define a theme name in JS
  (`tippy(el, { theme: 'persephone' })`) and style `.tippy-box[data-theme~='persephone']`.
  Skinnable surface:
  - `.tippy-box[data-theme~='persephone']` — the bubble: bg, color, border, radius, shadow, font.
  - `.tippy-box[data-theme~='persephone'] .tippy-content` — padding.
  - `.tippy-box[data-theme~='persephone'] > .tippy-arrow::before` — the **arrow `color`
    must match the box bg** (the arrow is a rotated square colored via the box).
  - placement variants `[data-placement^='top'|'bottom'|'left'|'right']` if the arrow needs
    per-side tweaks.
- **CSS-vs-content split:** the skin themes the **box** (chrome). An *interactive* popover's
  **content is board-owned HTML** (e.g. a dropdown menu's rows) — themed with `--p-*` in the
  board's CSS (accent hover rows, like the app's menus). Document this boundary in the
  manifest note.
- Reference skin: **Tom Select** ([`boards-assets/tom-select.css`](../../../boards-assets/tom-select.css))
  for a chrome-heavy CSS skin + `color-mix` tints; **Flatpickr** for "core CSS required, skin overrides it."

## Implementation plan

**1. Demo board** — `.persephone/boards/Tippy/` (gitignored).
   - **Vendor** into `lib/`: `tippy-bundle.umd.min.js` (popper + tippy) **and**
     `tippy.css` (core — required). Pin the exact 6.3.x at vendor time. Manifest URLs:
     `https://cdn.jsdelivr.net/npm/tippy.js@<ver>/dist/tippy-bundle.umd.min.js` and
     `.../dist/tippy.css`. **Stick to the default `fade` animation** (in core CSS) to avoid
     vendoring separate `animations/*.css` files — confirm at impl.
   - **`index.html` + `app.js`** exercising:
     - plain **tooltips** on toolbar buttons (placement gallery: top / right / bottom / left);
     - an **interactive click popover** containing a small **themed dropdown menu** (the
       in-board-menu use case);
     - a popover whose **content is loaded over `persephone.execute()`** (dogfood the channel).
   - Set `theme: 'persephone'` on every instance.

**2. Skin** — `tippy.css` (our theme; *not* the vendored core, which keeps its own name) —
   stamped header, commented per block, all `--p-*`:
   - box: `background: var(--p-panel)` (or `--p-overlay` — pick the more legible in review),
     `color: var(--p-text)`, `border: 1px solid var(--p-border)`,
     `border-radius: var(--p-radius-md)`, `box-shadow: … var(--p-shadow)`,
     `font-size: var(--p-font-sm)`.
   - content padding from `--p-space-*`.
   - arrow `::before { color: var(--p-panel) }` to match the box (and a bordered-arrow path
     if a border ring is wanted).
   - Load order: `board-base.css → lib/tippy.css → tippy.css`.

**3. MCP style review** — board open; verify **dark + light**. Probe `getComputedStyle` of
   `.tippy-box[data-theme~='persephone']` and its arrow `::before` (open a tooltip first via
   `browser_click`/`browser_hover` or `_tippy.show()`); confirm colors trace to `--p-*`
   (light = discriminating). Exercise tooltip + interactive popover + the loaded-content
   popover. Screenshot both themes; close popovers + restore the user's theme when done.

**4. Promote + manifest.** Copy to `boards-assets/tippy.css` (frozen, stamped). Add a
   `tippy` manifest entry: purpose, tested version, **both** vendor URLs (bundle + core CSS),
   the "core CSS required" note, the named-theme approach (`theme: 'persephone'`), and the
   CSS-vs-content split (skin = box; board owns interactive content). Add a README row.

## Concerns / open questions

- **Popper v2, not Floating UI** — confirm the `-bundle` UMD exposes global `tippy` with
  Popper included (no separate Popper vendor needed).
- **Core CSS is mandatory** — easy to forget; the manifest note must call it out (a
  skin-only board would position/animate wrong).
- **Arrow color** must track the box bg or it reads as a stray square — verify in review.
- **Animation files** — keep to core `fade`; if a fancier animation is wanted, an extra
  `animations/*.css` must be vendored. Decide at impl (default: fade only).
- **Bundle size** ~25 KB (bundle) — acceptable.

## Acceptance criteria

- [ ] Demo shows tooltips (multiple placements) + an interactive dropdown popover + an `execute()`-loaded popover, themed in **both** dark and light.
- [ ] Theming via a **CSS skin** (named `persephone` theme) against `--p-*`; re-tints on theme switch with no JS.
- [ ] Tippy + Popper are **local** (no CDN); core CSS vendored; loads offline.
- [ ] At least one data path goes through `persephone.execute()` (popover content).
- [ ] Skin promoted to `boards-assets/tippy.css`; manifest + README updated.

## Files changed (planned)

| Path | Change |
|------|--------|
| `boards-assets/tippy.css` | new — Tippy `persephone` theme (stamped `@<ver>`) |
| `boards-assets/manifest.json` | new `tippy` entry |
| `boards-assets/README.md` | components table — Tippy.js row |

Demo board `.persephone/boards/Tippy/` stays local (gitignored).
