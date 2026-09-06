# EPIC-088 acceptance run — boards and tools surfaces

**Date:** 2026-09-06
**Model:** Haiku, via the `mcp-test-agent-call` skill — `call` as its only tool, no guides.
**Scope:** the gate for marking `create_board`, `open_board`, `board_refresh`, `create_toolset`,
`refresh_toolset`, `search_tools` and `execute_tool` retirable.
**Result:** **PASS**, with one tool's marking deliberately withheld (see below).

## The scenario

Four questions, phrased as a user would phrase them, in order:

1. "Which boards do I have on this machine, and is any of them open right now?"
2. "Open the board called epic088-smoke", then confirm on screen that it is showing.
3. "That board isn't picking up my edits — reload it and tell me whether it came back up."
4. "What agent tools do I have, and what arguments does the azure-devops query_tasks tool take?
   Do NOT run it."

## What the agent actually did

All four completed. **No wrong turns** — every hint led directly to the next needed path, which is
the first time in this programme a surface epic's acceptance run has produced none.

| # | Paths it used | Outcome |
|---|---|---|
| 1 | `boards` | Listed every local board with its trust state and open-page count |
| 2 | `boards.openBoard(root)`, then `page` | Board opened; confirmed `editor: "board-view"`, `active: true` |
| 3 | `page.editor.reload()` | `{ refreshed: true, frameReady: true, renderState: "trusted" }` |
| 4 | `tools` → `tools.toolsets` → `tools.toolsets[0]` → `tools.toolsets[0].manifest` | Reported all nine arguments with types and descriptions |

Its own account of what decided it: the **root hint** surfaced `boards` and `tools`, and each node's
hint carried the next member. It reported no misleading descriptions.

## The one finding worth keeping

**The agent never used `tools.search()`.** Asked what tools exist and what one takes, it walked
`tools` → `toolsets` → `[0]` → `manifest` instead. Both paths answer, so this is not a defect — but
it says the *collection* is more discoverable than the *search method*, which is the reverse of how
the retiring tools are shaped (`search_tools` is the entry point there). Worth remembering at
EPIC-090 when the guide prose is rewritten: an agent reaching for tools reaches for a list first.

## Two defects fixed before the run, both found by live checking rather than by the build

**1. `call` truncated every tool's `inputSchema`.** `tools.search("select:…")` returned the whole
definition *except* the argument list, which came back as `{ kind: "object", note: "depth limit" }`.
`MAX_DEPTH` in `src/shared/ai-vision/result-shaper.ts` was 4, and a schema's
`inputSchema.properties.<arg>` sits at depth five once nested in a result list. The replacement path
was therefore strictly worse than `search_tools`, which returns it in full: an agent could read a
tool's description but could not learn how to call it. Raised to 8, with the reasoning recorded in
the file — the depth cap is a size guard over *plain data*, not the thing that stops internal state
being dumped (the descriptor and `isPlainObject` checks do that at every depth). This mattered for
the run itself: task 4 succeeded through `manifest`, which is nested just as deeply.

**2. Absent values reached the agent as `null`.** Fixed during US-1326: a key explicitly set to
`undefined` crosses the MCP/IPC boundary as `null`, so `boards.list()` first reported
`installed: null` and `name: null` — the exact falsy stand-in EPIC-088 decision 9 forbids. Absent
keys are now **omitted**. Every surface written after that carries the rule, and it is worth
treating as a standing rule for the rest of the roadmap: *do not set a key to `undefined`; leave it
out.*

## Retirement markings

Every row of the epic's retirement table was exercised live through `call` before marking — not
reasoned from routing code (principle 3, and the `open_url` correction).

**Marked retirable (6):** `create_board`, `open_board`, `board_refresh`, `search_tools`,
`refresh_toolset`, `create_toolset`.

Notable verifications: `reload()` returns the frame-ready signal and, on a board that can never
mount a frame, returns *immediately* with the `renderState` that explains why rather than blocking
five seconds and claiming success; `tools.toolsets.refresh()` reproduces the tool's exact envelope;
`tools.search("select:…")` matches `search_tools` field for field, `env` names only;
`createToolset` scaffolds and raises the user's registration dialog through the attention protocol,
returning the declined branch on Cancel with the registry count unchanged; and `windows[0].tools.…`
confirms window targeting.

**Withheld (1): `execute_tool`.** Its three rows — run by id, the success shape, the failure shape —
could not be exercised without either spending the user's credentials against a live company service
(all three registered toolsets do that, and two return PHI) or registering a scratch toolset, which
requires the user's own click on the trust dialog. Clicking that dialog as the agent would have
defeated the very property this epic spent its effort defending, so it was not clicked. The epic's
own rule applies: a tool is never marked on the strength of a table. See the epic's Needs-user-check
for the one-call reproduction.

What *was* verified on that path: `tools.execute` throws on an unknown id, naming it and listing the
valid ids, and spawns no process — and the legacy `execute_tool` still returns its structured
`ok:false` unchanged, so the two coexist for EPIC-090's comparison.
