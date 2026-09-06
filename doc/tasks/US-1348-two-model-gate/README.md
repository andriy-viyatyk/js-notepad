# US-1348 — The gate: the Haiku pass and the Codex pass

**Status:** Implemented
**Epic:** [EPIC-090 — Consolidation](../../epics/EPIC-090.md)

## Goal

Run `qa/surfaces/gate.md` twice — Haiku via the `mcp-test-agent-call` skill, and Codex as a second
model family against the real reduced manifest — and decide, against EPIC-090 decision 7, whether
US-1349's deletion is authorised.

This task is Claude's own; QA runs are never delegated
(`.claude/skills/codex-dev/SKILL.md`, "QA test runs are yours").

## Result

**Deletion authorised for all 32 tools.** No scenario failed; two PARTIALs, both acted on. The full
transcript-level record, every wrong turn, and all seven findings are in the run log:

[qa/runs/2026-09-06-epic-090-deletion-gate.md](../../../qa/runs/2026-09-06-epic-090-deletion-gate.md)

`execute_tool` was outside the gate by design and is not deleted (EPIC-090 Needs user check 1).

## Fixes made from the run

Committed with this task:

- `page.editor.url` / `.title` read the active tab instead of stale page state.
- `pressKey`'s summary states that it performs no default browser action.
- The Log View help names `contentType: "csv"`.
- `call`'s description states that a zero-argument method still needs `args: []`.

Committed separately because its blast radius is far wider than this epic:

- **US-1352** — every `process.env` read in the main process compiled to `{}`, because the
  hand-rolled main Vite config was never marked as a Node build. This is what stopped the flag from
  working, and it had also been stripping the environment from every spawned child process.

## Acceptance criteria

- [x] Both passes completed over the ten gate scenarios.
- [x] The reduced manifest verified end to end (1 tool with the flag on, 34 with it off, 13 guide
      resources listed in both).
- [x] Every one of the 32 deleted-tool capabilities reached from a bare `call`.
- [x] Findings acted on or recorded with the reason they were not.
- [x] Run log written to `qa/runs/`, free of PII and of the user's toolset content.
- [x] Scratch artifacts cleaned up; the flag left off.
