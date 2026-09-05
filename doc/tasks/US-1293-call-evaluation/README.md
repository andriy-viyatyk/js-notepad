# US-1293: Evaluation — `call` alone vs the full tool set

**Epic:** [EPIC-083](../../epics/EPIC-083.md) · **Status:** Complete · **Run:** 2026-09-05

## Goal

Produce the evidence the epic is gated on: can a weak model drive Persephone with `call` as its
only tool and no guide, at least as well as with the current ~25-tool surface? The answer decides
whether the consolidation epic (fold every MCP tool into a path) is worth starting.

## What was built

- `call` added to the `mcp-test-agent` skill's `allowed-tools`
  (`.claude/skills/mcp-test-agent/SKILL.md`), so the existing QA suite can exercise it.
- A new sibling skill `.claude/skills/mcp-test-agent-call/SKILL.md` whose `allowed-tools` is
  **only** `mcp__persephone__call` — no `read_guide`, no `execute_script`, no browser tools. It is
  the A/B control: the same haiku model, the same instructions to ignore every project file, one
  tool.

Both are forked haiku agents per [`qa/README.md`](../../../qa/README.md); the weaker the model, the
stronger the documentation test.

## Result

Full run log with the call sequence: [`qa/runs/2026-09-05-epic-083-call-vs-tools.md`](../../../qa/runs/2026-09-05-epic-083-call-vs-tools.md).

Four-part scenario (read active page + count; create a CSV grid page and report its row count; add
two rows; report theme and version):

| | `call` only | Full tool set |
|---|---|---|
| Tasks completed | 4 / 4 | 4 / 4 |
| Tool calls | 14 | 9 |
| Wrong answers | none | theme reported as `system` (actual: `default-dark`) |

The `call`-only agent discovered everything from `path: ""`, the returned hints, two `helpSearch`
queries and one `$help` — no guessing, no errors, no guide. The full-tool-set agent finished in
fewer calls but produced the run's only wrong answer, reading the theme from a fixed tool's payload
instead of the live setting.

## Recommendation: **go**, with conditions

Start the consolidation epic. The conditions belong in its scope, not here:

1. Retire a tool only after its replacement path passes this same test. These scenarios cover
   pages, content, grid facades and settings; `ui_push`, boards, toolsets and `browser_*` are
   untested through paths.
2. `browser_*` needs the target-resolution and ref-store design solved before it becomes
   `pages[i].asBrowser().*` — it is a design task, not descriptor writing.
3. Deprecate, do not cut over: external clients, the QA suite and every guide name the current
   tools.

## Acceptance criteria

- [x] `call` is in the `mcp-test-agent` allow-list.
- [x] A `call`-only variant of the test agent exists and is reproducible.
- [x] The scenario set ran twice on the same model, results recorded in `qa/runs/`.
- [x] A go/no-go recommendation is written with the evidence behind it.

## Files changed

| File | Change |
|---|---|
| `.claude/skills/mcp-test-agent/SKILL.md` | `call` added to `allowed-tools`. |
| `.claude/skills/mcp-test-agent-call/SKILL.md` | New `call`-only test agent. |
| `qa/runs/2026-09-05-epic-083-call-vs-tools.md` | Run log, both runs. |
| `doc/tasks/US-1293-call-evaluation/README.md` | This document. |
