# Surface QA tests

Tests organised by **the part of Persephone they exercise** — one file per screen, dialog family,
or editor — rather than by which MCP tool they use.

The older `qa/mcp-test-*.md` files are grouped by tool (`create_page`, `ui_push`, `browser_*`).
That layout was right while the tools were the product. The transparency roadmap
([doc/agent-transparency-roadmap.md](../../doc/agent-transparency-roadmap.md)) collapses those
tools into one `call` path, so the interesting axis becomes the surface: *can an agent see this
screen, understand what its controls are for, and drive it?*

Two things these files are for:

1. **Documentation QA**, as before — run the test agent, watch whether it succeeds from the
   tool description and hints alone, and fix whatever misled it. Every test here uses the
   `mcp-test-agent-call` skill (Haiku, `call` as its only tool) unless it says otherwise.
2. **UI regression** — the verification steps read real live state through `call`, so running a
   file after a UI change tells you whether the surface still reports itself correctly. A test
   whose *verify* step fails after an unrelated refactor is a regression, not a doc problem.

## Files

| File | Surface | Landed by |
|------|---------|-----------|
| [dialogs.md](dialogs.md) | Blocking dialogs, the `dialogs` node, attention and pending results | EPIC-084 (US-1297, US-1298, US-1301) |
| [shell.md](shell.md) | The application shell: header strip, tabs, curated elements and highlight | EPIC-084 (US-1300) |
| [menus.md](menus.md) | Popup and context menus, the `menus` node | EPIC-084 (US-1299) |

More files arrive with each surface epic (EPIC-085 onward): the sidebar, the text editor family,
the data editors, boards, the browser.

## Running them

Prerequisites and the pinned-tab rules from [../README.md](../README.md) apply unchanged —
in particular: **never close, modify, or interact with pinned tabs**, and on the user's live
instance close only pages the test created.

Two things are specific to these files:

- **Run the QA yourself; do not delegate the run.** The output that matters is not pass/fail, it
  is *what to change* — a reworded member summary, a clearer `$help`, a hint that pointed the
  wrong way. That judgement lives in the transcript, so the agent that reads the transcript has
  to be the one that decides. (Recorded in `.claude/skills/codex-dev/SKILL.md`.)
- **A PARTIAL is a finding, not a failure.** If the agent reached the goal but only after four
  wrong paths, the discovery surface is what needs fixing. Write down the wrong paths it tried —
  they are the most useful output of the whole run.
