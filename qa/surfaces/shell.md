# Surface QA: the application shell

The always-visible chrome — header strip, tab strip, window controls, status indicators — and the
protocol that makes it legible to an agent: `ui.elements` (curated controls, each with a purpose,
a resolved selector, and live visibility) and `ui.highlight(name, message?)`.

What to watch: **does the agent answer from `elements` rather than from a DOM snapshot?**
An answer assembled by squinting at markup is a PARTIAL even when it is correct — a snapshot never
says what a control is *for*, and it cannot tell "absent because conditional" from "absent because
I picked the wrong selector".

Test agent: `mcp-test-agent-call` (Haiku, `call` only).

Selector reference: [doc/architecture/ui-element-contract.md](../../doc/architecture/ui-element-contract.md).

---

## Test S.1: Where is a control
**Request:** "Where do I change the language of the current tab?"
**Expected:** finds `ui.elements` (via `helpSearch`, root discovery, or `ui.$help`) and answers
from the `tab-language` purpose — the button sits on the tab itself, next to the title
**Verify:** the answer names the tab, not Settings and not a menu path; no invented UI
**Watch for:** the agent reaching for `settings` first. If it does, the root hint or
`helpSearch("language")` is pointing the wrong way

## Test S.2: Show the user where it is
**Request:** "Show me where to change the tab language."
**Expected:** `ui.highlight("tab-language", "<explanation>")`, returning `found: true, count: 1`
**Verify:** the overlay is actually on the active tab's language button. Then
`ui.clearHighlights()` removes it
**Watch for:** the agent falling back to raw `ui.highlightElement` with a hand-built selector.
That works, but it means `highlight` was not discoverable enough — a finding

**Run 2026-09-05 (Haiku, `call` only): PASS on the fourth attempt — three failures first, and they
are the useful part.**

Runs 1-3 all answered `page.language` with assignment syntax and never highlighted anything. The
agent went `""` → `page` and found `language [writable]` within two calls. Three fixes did *not*
work:

1. indexing element purposes in `helpSearch` — the agent never called `helpSearch`;
2. rewriting the root `ui` member summary to name the "where is…?" case;
3. adding `ui.highlight("tab-language")` to the root `$help` common paths.

What worked was putting the cross-reference on **`page.language` itself** — the node the agent
actually lands on — saying that assigning changes it, but "where is it?" means the button on the
tab, shown with `ui.highlight("tab-language")`. The next run gave both answers and drew the
highlight.

Two lessons, both worth more than the pass:

- **`page.language` was never a wrong answer.** Three of these attempts were spent trying to steer
  a model away from a correct response by shouting louder at the root. Cross-referencing beats
  redirecting.
- **Put the pointer where the agent lands, not where you wish it started.** A root hint competes
  with everything else on the root; a member summary is read at the moment of decision.

## Test S.3: A conditional control that is not currently there
**Preparation:** Make sure the tabs do **not** overflow and the window is at 100% zoom
**Request:** "Scroll the tab strip to the right for me."
**Expected:** reads `ui.elements`, sees `page-tabs-scroll-right` with `visible: false`, and
explains that the arrows only appear when the tabs overflow — rather than hunting for the button
or claiming to have clicked it
**Verify:** the agent says *why* it is absent. This is the whole point of pairing a declared
purpose with measured visibility, and the purpose strings state each condition explicitly
**Watch for:** "I clicked it" — a fabricated action on an invisible element is the failure mode
this test exists for

## Test S.4: Explain the status indicators
**Request:** "There are small indicators in the top-right. What are they?"
**Expected:** answers from the `status-indicators`, `mneme-indicator`, `mcp-indicator` and
`header-snip-button` purposes, and describes only the ones whose `visible` is true
**Verify:** matches what is actually on screen; the agent does not describe an absent indicator as
though it were present

## Test S.5: An element that does not exist
**Request:** "Highlight the Save button in the toolbar."
**Expected:** `ui.highlight("save-button", ...)` (or similar) fails with the self-correcting error
listing every valid element name; the agent then either picks the right control or says Persephone
has no toolbar Save button — saving lives on the tab menu and Ctrl+S
**Verify:** the agent uses the returned name list instead of guessing again. An agent that tries
five invented names in a row means the error text is not being read

## Test S.6: Elements are curated, not exhaustive — say so
**Request:** "List every clickable thing in the Persephone window."
**Expected:** returns the curated list and is explicit that it is the described shell controls,
not an exhaustive DOM inventory
**Verify:** no claim of completeness. `elements` is deliberately hand-written
(EPIC-084 decision 9); the exhaustive fallback is the app-window automation surface, which
EPIC-089 owns

---

## Regression checks

Run these directly through `call` — no test agent — after any shell UI change:

| Check | Expected |
|---|---|
| `ui.elements` | 20 entries, in contract order |
| every `selector` | matches the table in `ui-element-contract.md` |
| `app-header`, `page-tabs`, `window-close` | `visible: true` in any normal window |
| `page-tabs-scroll-left/right` | `visible: false` with few tabs, `true` once they overflow |
| `zoom-indicator` | `visible: false` at 100% zoom, `true` otherwise |
| `tab-language` | `visible: true` on a text page, `false` on an editor declaring `noLanguage` |
| `tab-sound` | `visible: false` unless a page is audible or muted |
| `ui.highlight` on any visible name | `found: true`; `ui.clearHighlights()` returns ≥ 1 |

A `visible` that stops tracking its control is a regression in the shell markup — most likely a
lost `data-name` — and `ui-element-contract.md` is the contract it broke.
