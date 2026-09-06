# EPIC-090 deletion gate — two-model run

**Date:** 2026-09-06
**Gate file:** [qa/surfaces/gate.md](../surfaces/gate.md)
**Epic:** [EPIC-090](../../doc/epics/EPIC-090.md) — decision 6 (two model families), decision 7 (abort criteria)
**Purpose:** authorise (or refuse) the deletion of 32 MCP tools in US-1349.

Ten scenarios cover the 32 deleted-tool capabilities. Every scenario started from `call` with **no
path**. `execute_tool` is deliberately not in the gate: its replacement is unproven and it is not
being deleted (EPIC-090 Needs user check 1).

| Pass | Model | Reached Persephone via |
|---|---|---|
| 1 | Haiku, `mcp-test-agent-call` skill | `allowed-tools: mcp__persephone__call` — simulates call-only regardless of manifest; tests the documentation |
| 2 | Codex `gpt-5.6-luna` (high) | its own MCP client against the **real** reduced manifest, `PERSEPHONE_MCP_CALL_ONLY=1` |

## The reduced manifest, verified end to end

Before pass 2, Persephone was restarted with `PERSEPHONE_MCP_CALL_ONLY=1` and the endpoint was
queried directly (raw JSON-RPC over the streamable HTTP transport, bypassing every client cache):

- `tools/list` → **`call`**, and nothing else.
- `resources/list` → all **13** guide resources still listed (`persephone://guides/*` plus `full`).

Restarted again with the flag unset: `tools/list` → **34** tools. Both directions confirmed.

**This is where the gate earned its cost.** The flag did *not* work on the first attempt, and the
reason was not the flag: `scripts/dev.mjs` and `scripts/build-prod.mjs` never marked the main-process
Vite build as a Node build, so every `process.env` in the main process was statically replaced with
`{}`. Nineteen accesses in the shipped bundle were dead, including `command-runner`'s
`env: { ...process.env }`, which meant **every child process spawned by Agent Tools and board
backends was started with the parent environment stripped, PATH included**. Fixed as US-1352.

---

## Pass 1 — Haiku (`mcp-test-agent-call`)

| # | Scenario | Result | Overview → right branch? | Wrong turns |
|---|---|---|---|---|
| G.1 | Application facts and window recovery | **PASS** | yes, immediately | none — 12 calls, no `helpSearch` needed |
| G.2 | Create and edit a scratch text page | **PASS** | yes, immediately | none |
| G.3 | Show a report and ask a question | **PASS** | yes, immediately | learned the grid `content` format from the validation error |
| G.4 | Create, find, open and reload a board | **PASS** | yes, immediately | none — 4 calls, exactly the expected paths |
| G.5 | Inspect the tool registry | **PASS** | yes, immediately | none; **cancelled the registration dialog correctly** |
| G.6 | Browse, follow a link, return and capture | **PASS** | needed one `helpSearch` | reported the link click had failed — it had not (see finding 1) |
| G.7 | Complete a harmless local form | **PARTIAL** | yes, immediately | `pressKey` Enter/Tab/Space all did nothing; clicked the select and an option before finding `select()` |
| G.8 | Manage browser tabs | **PASS** | one `helpSearch` | none |
| G.9 | Execute renderer code and read its result | **PASS** | yes, immediately | none — 5 calls total |
| G.10 | Answer a doc question with no guide tool | **PARTIAL** | yes, immediately | concluded grids do not accept CSV (see finding 3); `helpSearch("inline question")` found nothing |

G.3's inline dialog was answered by the runner, as the gate's dialog policy permits for a Log View
question (the agent's own question, no privilege). The full cycle was verified: `push` returned ids,
`dialogResult` reported `unresolved`, attention named the unanswered dialog and stated that *the
agent* cannot answer it, and after the answer `dialogResult` returned `resolved` with `button: "Yes"`.

## Pass 2 — Codex (`gpt-5.6-luna`, high), against the reduced manifest

Codex had no MCP server configured; one was added for this run
(`codex mcp add persephone --url http://127.0.0.1:7865/mcp`).

| # | Scenario | Result | Overview → right branch? | Wrong turns |
|---|---|---|---|---|
| C.1a | Application facts, windows, active page | **PASS** | yes, immediately | none |
| C.1b | Create, edit, verify and close a page | **PASS** | yes, immediately | none |
| C.2a | Log View report + inline question | **PASS** | yes, immediately | two payload guesses (`markdown` → `output.markdown`, `question` → `message`), both corrected by the validation errors |
| C.2b | Renderer scripting | **PASS** | yes, immediately | first attempt used a statement block and got a syntax error |
| C.2c | "How do I switch a page's editor?" — no guide tool | **PASS** | yes, immediately | none |
| C.3a | Board create / list / open / reload / clean up | **PASS** | yes, immediately | tried **`read_guide` as a path** (see finding 4); `boards.list` before `boards.list()` |
| C.3b | Toolset scaffold, cancel registration, refresh, count | **PASS** | yes, immediately | none; **cancelled the registration dialog correctly** |
| C.4a | Open example.com, heading, screenshot | **PASS** | one `helpSearch` for the opener | reading a browser page's `content` returned empty |
| C.4b | Fill and submit the local form | **PASS** | yes | none — used `click()` on submit rather than a key press |
| C.4c | Tabs: list, switch, close, close page | **PASS** | yes | `snapshot` without `args: []` returned method metadata (see finding 5) |

Codex was told not to reproduce any content of the user's registered toolsets; it complied and
reported counts only. No toolset content appears in this log.

---

## Findings and what was done about each

**1. `page.editor.url` and `.title` were stale after an in-page navigation — FIXED (US-1348).**
Both read the page-level address-bar state while their summaries promise "the active tab". G.6's
agent clicked example.com's link, read `url`, saw the old URL and told the user the click had done
nothing. It had worked — `tabs[]` had the new document all along. A silent wrong answer.

**2. `pressKey` performs no default browser action — DOCUMENTED (US-1348).** It dispatches a
synthetic `KeyboardEvent`, so it reaches a page's own handlers but inserts no text and submits no
form. G.7's agent pressed Enter, Tab and Space against a focused input, got nothing, and finally
submitted with a programmatic click it described as "keyboard-driven". **The deleted
`browser_press_key` tool does exactly the same thing** — verified by running both against the same
form — so this is a documented limitation, not a gap in the replacement. The member summary now says
so and points at `type()` and `click()`. Codex, on the same form, chose `click()` and passed.

**3. The Log View help claimed CSV grids without naming `contentType: "csv"` — FIXED (US-1348).**
G.10's agent tried CSV, was rejected, and concluded grids accept only JSON. They accept CSV with the
discriminator; the help now says so.

**4. The server instructions are actively wrong in call-only mode — US-1349 fixes this.**
`SERVER_INSTRUCTIONS` still says `read_guide("overview")`, "use `ui_push`", "use `create_page`", "use
`open_url`", "use `execute_script`" — none of which exist when the flag is on. C.3a tried
`read_guide` **as a path** because the instructions told it to. Both models still passed, which is
the encouraging part: the overview and the hints carried them past instructions that were pointing at
tools that were not there.

**5. Calling a zero-argument method needs `args: []` — FIXED in the `call` description.**
The single most repeated wrong turn, hit by both model families: `snapshot` with no `args` returned
the method's metadata rather than a snapshot, and `boards.list` returned the method rather than the
list. The description now states it, and that writing the parentheses in the path calls it too.

**6. `networkRequests()` returns an empty array for browser pages — NOT fixed, at parity.**
`browser_network_requests` returns exactly the same empty array for the same page. A pre-existing
product defect, recorded for the user; it does not make the replacement worse than the tool.

**7. `back()` does not return after a link-click navigation — NOT fixed, at parity.**
It works after an explicit `navigate()`. `browser_navigate_back` behaves identically on the same
page. Pre-existing, recorded for the user.

---

## Verdict against EPIC-090 decision 7

1. Both passes completed on the surfaces the deleted tools cover. ✅
2. No scenario **failed** — two PARTIALs, both acted on. ✅
3. Every deleted tool's capability was reached from a bare `call` by at least one agent. ✅

**Deletion is authorised for all 32 tools.**

`open_window` was the one row in doubt, and it took work to test honestly rather than to wave
through. A closed window is only retained in the window list when one of its pages is `modified` or
`pinned` (`open-windows.ts`, `windowOnClose`); every earlier attempt closed a window whose pages were
neither, so the entry was removed and there was no closed window to reopen. Once a pinned page was
put in the second window before closing it, `windows` reported `count: 2, open: [0]`, and G.1's Haiku
agent found `windows[1]`, called `windows[1].open`, and reported the reopened window's page count and
active page. Verified afterwards: `open: [0, 1]`.

`execute_tool` remains outside the gate and outside the deletion, unchanged (Needs user check 1).

## Cleanup

The gate's scratch board, toolset, form and pages were removed, and the boards it registered were
unregistered. The two EPIC-088 acceptance-run boards (`epic088-demo`, `epic088-smoke`) that had been
sitting in the user's board list for two epics were unregistered with them. The flag is **off** and
the default manifest is back to its full size.
