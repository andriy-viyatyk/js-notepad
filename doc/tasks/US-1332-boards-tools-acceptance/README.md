# US-1332 — Boards and tools acceptance run

**Status:** Implemented
**Epic:** [EPIC-088 — Boards and tools through `call`, and the retirement of seven tools](../../epics/EPIC-088.md)

## Goal

Run EPIC-088's acceptance gate — a Haiku agent with `call` as its only tool and no guides — write the
two per-surface QA files, and mark retirable only those tools whose every capability row was
exercised live.

## What happened

**PASS, with one marking withheld.** Full transcript and analysis:
[qa/runs/2026-09-06-epic-088-boards-and-tools.md](../../../qa/runs/2026-09-06-epic-088-boards-and-tools.md).

The agent completed all four scenario tasks with **no wrong turns** — the first surface epic in this
programme to produce none. It discovered `boards` and `tools` from the root hint and reached
`page.editor.reload()` and a tool's full argument list without a guide.

## Two `call`-wide defects found by live checking, not by the build

1. **`MAX_DEPTH` was 4 in `src/shared/ai-vision/result-shaper.ts`**, so every tool's `inputSchema`
   came back as `{ kind: "object", note: "depth limit" }`. An agent could read a tool's description
   but not learn how to call it, making `tools.search` strictly worse than the `search_tools` it
   replaces. Raised to 8. The cap guards *plain data* size; internal state is stopped by the
   descriptor and `isPlainObject` checks at every depth, so raising it exposes nothing new.
2. **A key set to `undefined` reaches an agent as `null`** across the MCP boundary (found in
   US-1326). Absent optionals must be **omitted**, not assigned. Now a standing rule for the roadmap.

## Retirement outcome

Marked retirable: `create_board`, `open_board`, `board_refresh`, `search_tools`, `refresh_toolset`,
`create_toolset`.

**Withheld: `execute_tool`.** Its rows need a tool that can actually be run. Every registered toolset
on this machine calls a live company service with the user's credentials (two return PHI), and the
alternative — registering a scratch toolset — requires clicking the "Register this toolset?" dialog.
That click was deliberately not taken: an agent answering its own trust prompt would defeat the
property this epic exists to protect. See the epic's Needs-user-check for the one-call reproduction.

## Files Changed

| File | Change |
| --- | --- |
| `qa/surfaces/editors/boards.md` | New — seven board-surface scenarios |
| `qa/surfaces/tools.md` | New — eight scenarios for tools, toolset, hub, Inspector and Mneme |
| `qa/surfaces/README.md` | Index rows for both |
| `qa/runs/2026-09-06-epic-088-boards-and-tools.md` | New — the run log |
| `src/shared/ai-vision/result-shaper.ts` | `MAX_DEPTH` 4 → 8, with the reasoning |
| `doc/agent-transparency-roadmap.md` | Epic ✅, six rows marked retirable, `execute_tool` withheld, deviations recorded |
| `docs/whats-new.md` | 5.0.0 improvements for the boards and tools surfaces |
