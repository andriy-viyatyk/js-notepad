# US-1153 — Mneme tree and link-editor tiles were never rendered

**Status:** Open · **Epic:** none (carried forward from EPIC-071)

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
