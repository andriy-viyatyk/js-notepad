# US-742: Recommended component — native `<dialog>` modal (no-dependency pattern skin)

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Planned (not yet implemented)

## Goal

Ship a recommended **modal / dialog** pattern for Web Boards built on the **native
`<dialog>` element** (no third-party library) plus a Persephone skin (`dialog.css`) against
`--p-*`. Follows the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727)
for the demo + MCP review + promotion steps, adapted for a **pattern skin** (there's no lib
to vendor).

This fills the **modal-flow** gap — the bridge gives file dialogs only; boards have no way
to show a generic modal (confirm, form, detail) that matches the app.

## Background

- The board webview is Electron's Chromium (Electron 39), which fully supports
  `<dialog>` + `dialog.showModal()` + `::backdrop`. The native element gives us, **for
  free**, what a modal library exists to provide: a top-layer modal, **focus trapping**,
  **ESC-to-close** (the `cancel` event), and `method="dialog"` forms with `returnValue`.
  So this is a **pattern + skin**, not a vendored component — the manifest entry has no
  `npm`/`vendor` JS.
- **Skinnable surface:**
  - `dialog` — the panel: bg, color, border, radius, shadow, padding, max-width, max-height.
  - `dialog::backdrop` — the dimmed overlay behind the modal.
  - A small **standard structure** the skin styles so boards get a consistent modal:
    `.dialog-header` (title + close), `.dialog-body`, `.dialog-footer` (action buttons).
- Reference: the board's own buttons/inputs already follow `--p-*`; **board-base.css**
  ([`boards-assets/`'s shared base](../../../boards-assets/)) is the precedent for "shared
  CSS driven by `--p-*`," but this stays a **separate optional skin** (`dialog.css`) — not
  every board needs modals, and board-base.css stays minimal.

## Implementation plan

**1. Demo board** — `.persephone/boards/Dialog/` (gitignored). No `lib/` (no library).
   - **`index.html` + `app.js`** exercising:
     - an **info modal** (`showModal()` + a close button + backdrop styling);
     - a **confirm dialog** using a `method="dialog"` form so the button's `value`
       becomes `dialog.returnValue` (OK / Cancel), read on the `close` event;
     - a **form modal** that collects input and **submits it to `scripts/save.js` over
       `persephone.execute()`** (dogfood the channel), showing the result;
     - **backdrop click-to-close** (a tiny JS helper — native `<dialog>` doesn't close on
       backdrop click by itself) and confirming native **ESC** works.
   - Modal content (form fields, buttons) styled with `--p-*` in the board's CSS.

**2. Skin** — `dialog.css`, stamped header (`/* persephone pattern · native <dialog> · tuned <YYYY-MM> */`),
   commented per block, all `--p-*`:
   - `dialog`: `background: var(--p-panel)` (or `--p-bg`), `color: var(--p-text)`,
     `border: 1px solid var(--p-border)`, `border-radius: var(--p-radius-lg)`,
     `box-shadow: … var(--p-shadow)`, `padding: 0` (header/body/footer manage spacing),
     sensible `max-width` / `max-height` + `overflow`.
   - `dialog::backdrop`: a dim layer from `--p-overlay` (or `color-mix(in srgb, var(--p-shadow) …)`);
     optional `backdrop-filter: blur(2px)`.
   - `.dialog-header` (`--p-panel`, bottom `--p-border`, `--p-text-strong` title, a close
     `button`), `.dialog-body` (padding, scroll), `.dialog-footer` (top `--p-border`,
     right-aligned buttons; primary = `--p-accent`/`--p-accent-text`, secondary =
     `--p-bg` + `--p-border`).
   - Optional open transition (fade/scale via `[open]` + `@starting-style`).
   - Load order: `board-base.css → dialog.css`.

**3. MCP style review** — board open; verify **dark + light**. Open each modal
   (`browser_click` or `dlg.showModal()` via `browser_evaluate`) and probe `getComputedStyle`
   of `dialog`, `.dialog-header/-footer` buttons, **and `dialog::backdrop`**; confirm colors
   trace to `--p-*` (light = discriminating). Screenshot both themes. Close modals + restore
   theme when done.

**4. Promote + manifest.** Copy to `boards-assets/dialog.css` (frozen, stamped). Add a
   `dialog` manifest entry with `npm: null` and a `vendor` note "native element — no library
   to download," `skin.type: "css"`, and the structure/`returnValue`/ESC notes. Add a README
   row (mark it the no-dependency pattern).

## Concerns / open questions

- **`dialog::backdrop` and `--p-*` inheritance (the real risk).** `::backdrop` is in the top
  layer, not a child of `<dialog>`. Current Chromium has `::backdrop` **inherit from its
  originating element**, so the `<html>`-level `--p-*` vars *should* resolve on the backdrop —
  but **VERIFY via MCP probe**. If they don't resolve, fall back to: redeclare the needed var
  on `dialog` (which `::backdrop` can then inherit), or use a literal-with-fallback. Capture
  the finding in the skin header — it's the one non-obvious bit.
- **Pattern, not a lib** — the manifest model assumes a third-party component; document the
  `npm: null` / no-vendor shape clearly so the entry doesn't look malformed.
- **Backdrop click-to-close** needs a few lines of board JS (compare click coords to the
  dialog rect); native `<dialog>` doesn't do it. Keep it in the demo's `app.js`, not the skin.
- **board-base.css vs separate file** — decided: **separate** `dialog.css` (modals are
  opt-in; keep base minimal).

## Acceptance criteria

- [ ] Demo shows info + confirm (`returnValue`) + `execute()`-backed form modals, themed in **both** dark and light, with native ESC + focus trap working.
- [ ] Theming via a **CSS skin** against `--p-*` including `dialog::backdrop`; re-tints on theme switch with no JS.
- [ ] **No third-party library** — native `<dialog>` only; board loads offline.
- [ ] At least one data path goes through `persephone.execute()` (form submit).
- [ ] Skin promoted to `boards-assets/dialog.css`; manifest + README updated.

## Files changed (planned)

| Path | Change |
|------|--------|
| `boards-assets/dialog.css` | new — native-`<dialog>` modal pattern skin |
| `boards-assets/manifest.json` | new `dialog` entry (`npm: null`, pattern) |
| `boards-assets/README.md` | components table — native dialog row |

Demo board `.persephone/boards/Dialog/` stays local (gitignored).
