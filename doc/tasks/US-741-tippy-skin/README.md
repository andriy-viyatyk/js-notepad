# US-741: Recommended component — Tippy.js

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

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

## Verification

Vendored **tippy.js 6.3.7** — `lib/tippy-bundle.umd.min.js` (~25 KB, global `tippy`),
`lib/popper.min.js` (**@popperjs/core 2.11.8**, ~20 KB, global `Popper`), and the
**required** core `lib/tippy.css` (~1.4 KB). Demo board: a placement gallery (top/right/
bottom/left + a rich-HTML tooltip), an interactive click popover holding a board-owned
app-style menu, and a popover whose body is fetched over
`persephone.execute("node scripts/popover.js")`.

**Popper finding (corrected a task assumption):** despite the `-bundle` name, jsDelivr's
`tippy-bundle.umd.min.js` at 6.3.7 does **not** inline Popper — its UMD reads
`window.Popper`. The board webview is a clean sandbox (`module`/`require`/`define` all
`undefined`, confirmed via `browser_evaluate`), so the UMD takes the browser-global branch
and the factory threw with `window.Popper` missing → `window.tippy` was never defined. Fix:
vendor `@popperjs/core` (`popper.min.js`) and load it **before** the tippy bundle. The
manifest's vendor note now records all three files + the load order.

MCP review (`browser_evaluate` probes via `_tippy.show()` + screenshots) in **dark
(default-dark)** and **light (light-modern)** — the bubble was opened and `getComputedStyle`
compared to the resolved `--p-*`:

- **Dark:** box bg = `--p-panel` `rgb(49,49,49)`, border = `--p-border` `rgb(60,60,60)`,
  color = `--p-text` `rgb(204,204,204)`, radius 4px, font 12px (`--p-font-sm`), shadow =
  `--p-shadow`. Arrow (all four placements): front face = `--p-panel`, border ring =
  `--p-border` — the two-layer triangle tracks the box on every side.
- **Light (discriminating — fallbacks ≠ theme values):** box bg = `--p-panel`
  `rgb(243,243,243)`, border = `--p-border` `rgb(229,229,229)`, color = `--p-text`
  `rgb(59,59,59)`, shadow = light `--p-shadow` (0.16 α); arrow front = panel, ring = border.
  Confirms why the border matters — the 243 panel bubble on the 255 white page has no edge
  without the 229 ring.
- Interactive menu popover renders board-owned rows (text = `--p-text`, accent hover from the
  board CSS); the `execute()`-loaded card populated fully (`Deploy job #4821`,
  `win32 · node 24.13.0`) — the bridge path works. User's theme restored to default-dark.

## Acceptance criteria

- [x] Demo shows tooltips (multiple placements) + an interactive dropdown popover + an `execute()`-loaded popover, themed in **both** dark and light.
- [x] Theming via a **CSS skin** (named `persephone` theme) against `--p-*`; re-tints on theme switch with no JS.
- [x] Tippy + Popper are **local** (no CDN); core CSS vendored; loads offline.
- [x] At least one data path goes through `persephone.execute()` (popover content).
- [x] Skin promoted to `boards-assets/tippy.css`; manifest + README updated.

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/tippy.css` | new — Tippy `persephone` theme (stamped `@6.3.7`) |
| `boards-assets/manifest.json` | new `tippy` entry (3 vendor files: popper + tippy bundle + core CSS) |
| `boards-assets/README.md` | components table — Tippy.js row |

Demo board `.persephone/boards/Tippy.js/` stays local (gitignored).
