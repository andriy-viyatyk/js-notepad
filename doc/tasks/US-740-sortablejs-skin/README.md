# US-740: Recommended component — SortableJS

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

## Goal

Adopt **SortableJS** as a recommended Web Board component for **drag-to-reorder** lists
and **kanban** boards (cross-list drag), following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone skin against `--p-*`, an autonomous MCP style review
across both themes, and promotion to `boards-assets/` with a manifest entry.

This fills the **interactivity** gap — no current recommended component covers
drag/reorder.

## Background

- SortableJS (`sortablejs`, npm) is a popular, **dependency-free** reorderable-list
  library. UMD bundle exposes a global `Sortable`; `new Sortable(el, options)`.
- **It adopts the board's own DOM** — it doesn't render chrome of its own; it only
  *adds state classes* to elements during a drag. So, like **Split.js** (the chrome-light
  precedent — see [`boards-assets/split.css`](../../../boards-assets/split.css)), the skin
  surface is small: a handful of drag-state classes, not a whole widget. The board owns
  the look of the list items themselves (via `--p-*` in its CSS); the skin themes only the
  transient drag states.
- **Skinnable surface — default state classes** (configurable via the `ghostClass` /
  `chosenClass` / `dragClass` options; the skin targets the defaults):
  - `.sortable-ghost` — the drop **placeholder** (where the item will land).
  - `.sortable-chosen` — the **picked** item (mousedown / touchstart).
  - `.sortable-drag` — the element **following the cursor** during the drag.
  - `.sortable-fallback` — the cloned drag image in `forceFallback` / touch mode.
- Reference skins: **Split.js** (chrome-light CSS skin shape) and **Tom Select**
  ([`boards-assets/tom-select.css`](../../../boards-assets/tom-select.css)) for `--p-*`
  conventions + `color-mix` tints.

## Implementation plan

**1. Demo board** — `.persephone/boards/SortableJS/` (gitignored; the user creates the
folder, then we scaffold + build).
   - **Vendor** the UMD bundle into `lib/Sortable.min.js` (pin the exact 1.15.x at vendor
     time; record it for the skin stamp). Source URL for the manifest:
     `https://cdn.jsdelivr.net/npm/sortablejs@<ver>/Sortable.min.js`. No CSS ships.
   - **`index.html` + `app.js`** exercising the main features:
     - A **kanban**: three columns (To do / Doing / Done) with **cross-list drag** via a
       shared `group`.
     - A simple **sortable list** with **drag handles** (`handle` option).
     - Load initial cards from `scripts/board.js` over `persephone.execute()` (dogfood the
       channel); optionally **persist the new order back** through a second `execute()`
       call on `onEnd` (a nice-to-have demonstrating a write path).
   - Board chrome (columns, cards, handles) styled with `--p-*` in the board's own CSS.

**2. Skin** — `split`-shaped `sortablejs.css` written entirely against `--p-*`
   (literal fallbacks; version-stamped header; commented per block):
   - `.sortable-ghost` → drop-slot affordance: dashed `1px var(--p-accent)` outline +
     `color-mix(in srgb, var(--p-accent) 12%, transparent)` fill (reads in both themes).
   - `.sortable-chosen` → `var(--p-accent)` ring (box-shadow `0 0 0 1px`) on `var(--p-panel)`.
   - `.sortable-drag` → elevated: `var(--p-panel)` bg, `1px var(--p-border)`,
     `box-shadow … var(--p-shadow)`.
   - handle (`.handle` or `[data-handle]`, board-defined): `cursor: grab`, color
     `var(--p-text-muted)` → `var(--p-text)` on hover.
   - Load order: `board-base.css → sortablejs.css` (no component CSS — SortableJS ships none).

**3. MCP style review** — board open in Persephone; verify in **dark (default-dark)** and
   **light (light-modern)**. Probe the state classes during/after a drag (apply the class
   manually via `browser_evaluate` if a live drag is hard to script) and confirm computed
   colors trace to `--p-*` (light is the discriminating theme — fallbacks differ there).
   Screenshot both. Restore the user's theme when done.

**4. Promote + manifest.** Copy to `boards-assets/sortablejs.css` (frozen, stamped). Add a
   `sortablejs` manifest entry: purpose, tested version, vendor URL (JS only; note "no
   stylesheet — skin themes the drag-state classes"), and the CSS-vs-board-DOM note (skin =
   transient state classes; the board owns item appearance + layout). Add a README row.

## Concerns / open questions

- **Small skin surface** — three state classes. This is an accepted shape (Split.js
  precedent); document it plainly so it doesn't read as "incomplete."
- **Default class names** — the skin targets `.sortable-ghost` / `-chosen` / `-drag`. If a
  board overrides `ghostClass`/`chosenClass`/`dragClass`, it must re-point the selectors;
  note this in the skin header.
- **Persist-order write path** is optional polish, not required for acceptance — keep it if
  it stays simple.

## Verification

Vendored **SortableJS 1.15.7** (`lib/Sortable.min.js`, ~45 KB, global `Sortable`).
Demo board: a 3-column kanban with cross-list drag (shared `group`) + a handle-only
priority list; cards loaded over `persephone.execute("node scripts/board.js")`. Lists use
`forceFallback: true` so the floating clone is a themeable (and probeable) DOM element.

MCP review (`browser_evaluate` probes + screenshots) in **dark (default-dark)** and
**light (light-modern)** — the drag-state classes were applied to a card programmatically
and `getComputedStyle` compared to the resolved `--p-*`:

- **Dark:** `.sortable-ghost` bg = `color-mix(--p-accent 16%, --p-bg)` (≠ the card's base
  `--p-bg` → confirms the skin wins the specificity tie), outline = `--p-accent`;
  `.sortable-chosen` ring = `--p-accent`; `.sortable-drag` bg = `--p-panel`, border =
  `--p-accent`, shadow = `--p-shadow`, cursor `grabbing`; `.drag-handle` = `--p-text-muted`.
- **Light (discriminating — fallbacks ≠ theme values):** ghost = `color-mix(accent 16%,
  white)`, ghost outline + drag border = light `--p-accent` `rgb(0,95,184)`, drag bg = light
  `--p-panel` `rgb(243,243,243)`, handle = light `--p-text-muted` — all trace to the live palette.
- `execute()` data path populated all four lists; both kanban + handle-list initialize
  without error. User's theme restored to default-dark after review.

## Acceptance criteria

- [x] Kanban + handle-list demo: drag-reorder and cross-list drag work, drag states themed in **both** dark and light.
- [x] Theming via a **CSS skin** against `--p-*` (ghost / chosen / drag); re-tints on theme switch with no JS.
- [x] SortableJS is **local** to the board (no CDN); loads offline.
- [x] At least one data path goes through `persephone.execute()` (initial cards from a script).
- [x] Skin promoted to `boards-assets/sortablejs.css`; manifest + README updated.

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/sortablejs.css` | new — drag-state skin (stamped `@1.15.7`) |
| `boards-assets/manifest.json` | new `sortablejs` entry |
| `boards-assets/README.md` | components table — SortableJS row |

Demo board `.persephone/boards/SortableJS/` stays local (gitignored).
