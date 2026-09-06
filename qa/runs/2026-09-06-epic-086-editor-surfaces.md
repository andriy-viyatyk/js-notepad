# Run: EPIC-086 editor surfaces — acceptance gate

**Date:** 2026-09-06
**Model:** Haiku, via the `mcp-test-agent-call` skill — `call` as its only tool, no guides, no
prior knowledge of Persephone.
**Surface files under test:** `qa/surfaces/editors/{text,preview,media,diff,graph}.md`
**Verdict:** **PASS**, with one documentation finding acted on.

## Scenario

EPIC-086's own acceptance criterion. Two markdown pages open — `alpha-notes.md` (inactive) and
`beta-notes.md` (active) — so that any unscoped selector would answer for the wrong page.

1. "What can I do on the markdown page titled alpha-notes.md?"
2. "Show me on screen where the preview on alpha-notes.md is refreshed. It must be the alpha page's
   control, not the beta page's."

## What the agent did

Nineteen calls, no guide reads. The discovery path it took:

```
""                              → root
pages                           → located alpha-notes.md among five open pages
pages.showPage                  → activated it
page  →  page.editor            → MarkdownEditor facade
page.editor.elements            → the seven curated markdown controls
helpSearch("refresh")           → nothing directly useful
helpSearch("render")            → nothing directly useful
page.tab / page.panels / ui.elements / page.editorSwitches
page.editor.highlight(...)      → rang markdown-compact-toggle
page.editorSwitches.highlight(...) → rang page-editor-switch
```

**Task 1 — pass.** It enumerated the markdown page's real capabilities from `page.editor` alone:
`navigateBack`, `revealFragment`, `toggleCompact`, `html`, the five find members, and the editor
switch. No fabricated members, and it correctly reported the current editor as `md-view`.

**Task 2 — pass on outcome.** It rang the alpha page's control, not beta's. It also reached the
honest conclusion that markdown has **no** refresh control and that the preview re-renders
automatically, rather than inventing one — the behaviour the epic's "no fabricated success" rule
exists to produce.

## Findings

**1. The markdown facade never said when the preview renders.** *(Acted on.)* The agent spent two
`helpSearch` calls — "refresh", then "render" — hunting a control that does not exist, and had to
infer the answer from the absence of one. That is a documentation gap, not a code defect: the
information was true, discoverable and nowhere written down.

Fixed in `MarkdownEditorFacade`'s `$help`, which now states that there is no manual refresh or
re-render control, that the preview re-renders automatically when page content changes, that
assigning `pages[i].content` is how you change what is rendered, and that
`markdown-compact-toggle` only affects spacing and typography of the already-rendered document.

**2. The agent activated the page manually before highlighting.** It called `pages.showPage` and
then used the active-page shorthand `page`, rather than `pages[3].editor.highlight(...)`. Not a
defect — the outcome was correct and the instinct is a safe one — but it means the agent reached
the right answer without exercising US-1311's activate-then-highlight path. That path was verified
directly instead, in this epic's US-1311 notes. **No change made**: steering an agent away from a
correct, safe habit is not worth a `$help` sentence.

## Not covered by this run

The scenario exercised the markdown surface. The text, media, diff and graph surfaces were verified
directly through `call` during each task's implementation — see the per-task notes in
[EPIC-086](../../doc/epics/EPIC-086.md) — but were not put in front of a Haiku agent. A full
five-file Haiku sweep is EPIC-090's job, where the call-only flag makes it the real gate; this run
is the epic's own acceptance check, not that sweep.
