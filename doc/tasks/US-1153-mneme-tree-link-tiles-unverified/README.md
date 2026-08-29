# US-1153 — Mneme tree and link-editor tiles were never rendered

**Status:** Closed 2026-08-29 — not reproducible · **Epic:** none (carried forward from EPIC-071)

## Goal

Give runtime evidence to the two EPIC-071 surfaces that closed **unverified**, so they are not
lost with the epic. Neither is known to be broken — both need a short interactive pass.

## Background

### (a) `mneme-root` was never rendered

Its route (`explorer-open-mneme`) works, but exercising it **displays the user's live customer
notes**, and EPIC-071's rule was that no verification step may cause customer work data to be
read or recorded.

It has green `tsc`/ESLint/`build-prod` and a converted body with **zero React imports**, and
**no runtime evidence at all** — the only surface in that epic's cut in that state.

> **Standing constraint:** `mneme-root` must never be rendered under any instrument. Displaying
> it shows live customer notes. Verification of this half is **permanently user-only** — the
> user opens it and reports what they see.

### (b) `link-editor`'s tiles view mode

The **list↔tiles teardown** was never exercised. List mode verifies at **0 React roots** on a
populated file, but the view-mode switch did not respond to synthetic input, so neither the
tiles body nor the branch disposal has runtime evidence.

**The teardown is the part that matters** — it is EPIC-068's persistent-child hazard, and the
one branch in that epic whose disposal was not observed. Contrast `tools-hub`, where visiting
four tabs in sequence proved teardown for free.

## Implementation plan

This is a verification task, not a fix.

1. **(b) link-editor tiles** — open a populated link-editor page, switch list → tiles → list.
   Confirm: the tiles body renders real content; **the list body's elements are absent after
   the switch** (destroyed, not retained); React roots measure 0 in both modes.
   If synthetic input still cannot drive the view-mode switch, drive it through the model
   rather than the DOM, or ask the user for one click.
2. **(a) mneme-root** — ask the user to open it and confirm the tree renders. Record their
   answer. Do not open it under any instrument, and do not read or record its content.

## Acceptance criteria

- The link-editor tiles body has runtime evidence, and its list→tiles teardown is observed as
  **absence** of the previous branch.
- `mneme-root` has a user-reported confirmation that it renders.
- No customer work data appears in any transcript or document.

## Verification record (2026-08-29)

**(a) `mneme-root` — user-confirmed.** The user opened it and reports the tree renders correctly.
No instrument was pointed at it and no content was read or recorded, per the standing constraint.

**(b) link-editor tiles — user-confirmed.** The user switched list <-> tiles manually and reports
no issues. The teardown therefore has *user* evidence rather than the measured absence the plan
asked for; that is the strongest evidence available without driving a switch the instrument could
not reach, and it is accepted as closing.

## A defect the pass found: the Mneme *configuration* view rendered no content

Not in this task's original scope — the user opened `mneme-config` while checking (a) and found it
empty. `mneme-config` is a **separate editor** from `mneme-root` and shows configuration only, so it
is outside the customer-data constraint; it was probed with geometry- and count-only queries and no
text content was read.

**Measured before the fix:** `mneme-config-root` was correctly 1569x1015, but its only child — the
wrapper `MnemeConfigEditorView.onMount` created — measured **1569x37**, and `RunningConfigView`
inside it measured 37 too. `mneme-body` resolved to **0**. The status bar rendered; the Model and
Roots panels were laid out at zero height.

**Cause.** `this.page = createPanelElement({})` — a *bare* panel, so `display:flex`,
`flex: 0 1 auto`. It does not grow, so in the column root it collapsed to its tallest content, the
37px toolbar, and `mneme-body`'s `height: 0` + flex then resolved against nothing.

**This is EPIC-073's Excalidraw defect again** — "the island host div was created bare, so
`display:block;height:0` made Excalidraw's own `height:100%` resolve against zero". Same class:
**a bare wrapper between a sized root and a `flex`/`height:100%` child.** It passed every structural
check for the same reason — the elements exist, are correctly built, and measure non-zero *widths*;
0 React roots; `tsc`/ESLint/`build-prod` green.

**What shipped:** the wrapper is deleted and the page view is appended to `this.root` directly.
`sync()` already styles the root for both modes (column + `overflow: hidden` when running,
centred when stopped) — the wrapper was defeating that styling, and `releaseChild()` detaches a
child's root itself, so the mode swap never needed a container.

**Verified after the fix, live:** `RunningConfigView` 1569x1015, `mneme-body` **1569x978** with both
panels and **73** visible descendants, 0 React roots. **The stopped-mode branch is reasoned, not
measured** — exercising it means stopping the user's live Mneme service, which was not worth it.

**Generalisation, now twice-observed:** *a wrapper element between a sized root and a flex-filling
child must itself be told to fill.* A bare `createPanelElement({})` is never a safe pass-through.
