# US-1324 — Data-surface acceptance run, QA files, and the retirable `ui_push`

Epic: [EPIC-087 — The data editors through `call`, and the retirement of `ui_push`](../../epics/EPIC-087.md)

**Status: Completed 2026-09-06.**

## Goal

Close EPIC-087: write the per-surface QA files, run the epic's acceptance gate on Haiku with `call`
as its only tool, act on what the run shows, and mark `ui_push` retirable only if every capability
has a verified path.

## What was produced

- [qa/surfaces/editors/data.md](../../../qa/surfaces/editors/data.md) — twelve scenarios covering
  grid, notebook, REST client, env vars, archive and the Log View channel.
- [qa/surfaces/panels.md](../../../qa/surfaces/panels.md) — six scenarios covering the panel nodes,
  Folder View and Git Tree.
- [qa/runs/2026-09-06-epic-087-data-surfaces.md](../../../qa/runs/2026-09-06-epic-087-data-surfaces.md)
  — the run log, which is the real deliverable.
- `qa/surfaces/README.md` gained both files.

## The run, and the three fixes it forced

Full detail is in the run log. In short: three runs.

**Run 1** answered the REST and notebook questions from the descriptors alone and *failed* the one
that mattered — "show the user a table and ask them a question" — concluding the task was impossible
without `ui_push`. Two defects behind it:

1. **`call` could not assign JSON text at all.** MCP clients parse `value` as JSON, so the error
   message's advice to pass a string "JSON.stringify structured data first" cannot be followed — the
   client re-parses whatever is sent. Any agent filling a JSON page was in a dead end. `resolver.ts`
   now serializes an incoming object or array when the target property currently holds a string.
2. **The output channel described itself in implementation terms.** Reworded to lead with purpose,
   and — the change that actually worked — pointed at from the **root** node, because an agent asked
   to show the user something reads the root member list before it reads `pages`.

**Run 2** confirmed fix 1. **Run 3** found the channel immediately and named the root hint as the
reason, then exposed the third defect:

3. **`push` silently accepted a guessed entry type.** The agent sent `"markdown"` and `"dialog"`
   instead of `"output.markdown"` and `"input.confirm"`; all three were accepted, rendered as blank
   entries, and returned ids — so the agent reported success and the user saw nothing. Validation
   only ever ran for types beginning `input.`. `pages.logView.push` now rejects an unknown type and
   names the sixteen valid ones. `ui_push` keeps its lenient behaviour unchanged; the new path being
   stricter than the tool it replaces is deliberate.

A fourth fix came from verification rather than the agent: the git panel's `summarize()` dumped
~170 branches and tags on every read, now capped to counts plus a 15-item sample.

## `ui_push` marked retirable

Every row of the epic's retirement table was exercised live, including
`windows[1].pages.logView.push(...)` against a real second window — the row EPIC-086's `open_url`
lesson says must not be reasoned from routing code. `ui_push` itself still works, unchanged, on the
same page. Nothing was deleted; deletion is EPIC-090's.

## Not fixed, recorded instead

Both are in the epic document's **Needs user check** section: the REST/env-vars page-level secret
boundary, and a pre-existing `pages.openFile()` ghost-page bug on directory paths (confirmed
pre-existing by stashing the epic's whole diff and reproducing on a clean tree).
