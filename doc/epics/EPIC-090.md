# EPIC-090: Consolidation — the call-only flag, the two-model gate, and the deletion of thirty-two tools

## Status

**Status:** Active
**Created:** 2026-09-06
**Started:** 2026-09-06
**Completed:** —
**Roadmap:** [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), epic 7 of 7 — the last one

## Overview

Six epics built paths. This one removes the tools those paths replaced, and it is the only epic in
the programme whose main deliverable is *subtraction*. That changes what "done" means: every other
epic could be judged by what it added and whether the addition worked. This one can only be judged
by what still works after the removal, which is why the roadmap put a gate in front of it rather
than a checklist.

Persephone's MCP manifest holds **34 tools** today. Thirty of them are already marked *retirable* by
epics 085 through 089 — meaning every field and every action they expose has a verified `call` path,
exercised live, and a Haiku agent with `call` alone reached it. Two more, `execute_script` and
`read_guide`, are this epic's to replace. That leaves `call`, which stays, and `execute_tool`, whose
replacement `tools.execute` is implemented and correct on everything testable but was deliberately
**not** marked, because marking it would have required an agent to answer its own trust dialog
(EPIC-088, Needs user check 2).

So the arithmetic of this epic is fixed before it starts:

| | Tools |
|---|---|
| In the manifest today | **34** |
| Deleted by this epic, if the gate passes | **32** |
| Remaining, default manifest | **2** — `call`, `execute_tool` |
| Remaining, with the call-only flag on | **1** — `call` |

`execute_tool` survives not because it is useful but because **principle 3 applies to it exactly as
it applied to `open_url`**: retire nothing until its replacement path passes the same test. Its
replacement did not, through no fault of the replacement, and buying the marking with a click the
agent should not take would make the whole programme's evidence standard decorative. It stays, it is
hidden by the flag, and it is the first line of this epic's Needs-user-check list.

### What is actually being tested

The gate is not "does `call` work" — six epics answered that. The gate is **whether an agent that
has never seen any of the deleted tools can still do the things those tools did**, starting from
nothing. That is a discovery test, and it has one entry point: `call` with no path. Which is why
US-1343 comes first and why the roadmap's `call("")` overview section is a requirement of this epic
rather than a nice-to-have — the overview *is* the replacement for thirty-two tool descriptions and
twelve guides, and if it does not point the agent at the right branch, nothing downstream matters.

### What is not being tested, and is therefore not being deleted

The MCP **resources** (`persephone://guides/*`) stay. Only the `read_guide` *tool* goes. A resource
costs an agent nothing until it reads one, and the client decides when to read; a tool costs a slot
in every manifest of every session. That distinction is the whole of the `read_guide` row in the
roadmap's table, and it is worth stating plainly because "delete the guide tool" reads like "delete
the guides" and is not.

## Decisions

### 1. The flag is an environment variable, not a setting — `PERSEPHONE_MCP_CALL_ONLY`

`createMcpServer()` (`src/main/mcp/server-factory.ts`) reads `process.env.PERSEPHONE_MCP_CALL_ONLY`
and, when it is set to a truthy value (`1`, `true`, `yes`, case-insensitive), registers `callTools`
only. Unset — the default in every shipped build — the manifest is unchanged.

The alternative was a `mcp.call-only` setting, and it was rejected on the strength of what this
programme did **one day ago**. EPIC-089's US-1339 deleted `mcp.browser-tools.enabled` and its
plumbing across eight files — the settings key, its default and help, the IPC pair, the
`createMcpServer` option, the startup read and live mirror in `app.ts`, the Settings-editor row, its
change filter and toggle, and the AiVision settings-catalog entry — because a switch that trims the
manifest reads to a user as a privacy control and is not one. Adding a second switch of exactly that
shape, in the epic that follows, would be incoherent. The reasons compound:

- **This is a migration gate, not a preference.** Its purpose is to let this epic's QA run happen
  and to give the user a rollback lever if the deletion proves wrong. A Settings row advertises a
  permanent choice; an environment variable reads as what it is.
- **It defaults off by construction.** There is no default to get wrong, no key to persist, and no
  stale key left in a hand-edited settings file — the exact residue US-1339 had to write a paragraph
  about.
- **The cost is one file.** Ten lines in `server-factory.ts` against eight files of renderer, IPC and
  Settings plumbing.

The cost of the choice is honest and small: flipping the flag needs Persephone restarted with the
variable set, since the environment is fixed at process start. This epic needs exactly two restarts
(on for the QA runs, off afterwards), and the standing instruction for autonomous work already
allows restarting Persephone freely.

**How the user turns it on** — recorded here, in `docs/whats-new.md` under 5.0.0, and in
`docs/mcp-setup.md`:

```powershell
$env:PERSEPHONE_MCP_CALL_ONLY = "1"; npm start        # dev
# or set it in the shell / shortcut that launches the installed build
```

### 2. The flag survives the epic, because `execute_tool` does

After the deletion the default manifest is `call` + `execute_tool`, and the flag hides the second
one. That is not a leftover: it is the mechanism by which a user who does not want the unproven tool
in their manifest can drop to the end state the roadmap describes, while a user who wants
`execute_tool` keeps it. When `execute_tool`'s row is finally marked — one human `call` away, see
Needs user check 1 — the flag becomes vestigial and can be deleted in the same change that deletes
the tool. It is not deleted speculatively now.

### 3. `execute_script` becomes `script.execute(code)` at the renderer root

`script` is already a reserved root name (`ai-vision/root.ts`, `RESERVED_ROOT_NAMES`), held since
EPIC-083 for precisely this. The node mirrors `main.script` — which already exists, already has its
settings gate (`main-script-gate.ts`), and already establishes the shape — but for the *renderer*
context, where `app`, `page` and the editor facades live. `main.script.execute` and
`script.execute` are then the two halves of one idea, spelled the same way, and the asymmetry that
made `execute_script` a tool while main-process scripting was a path disappears.

Two things this must not do. It must not become a second, unsandboxed path around the boundaries the
tree enforces — it is the same execution context `execute_script` already had, no more. And it must
not silently succeed on a script that threw; `execute_script`'s result shape (value, logs, errors) is
the behaviour the QA re-run will be checking against, and any deviation is recorded rather than
glossed, in the manner of EPIC-089's two `open_url` return-shape deviations.

### 4. `read_guide` goes; the resources stay; the prose lands in `$help`

The tool is deleted. `persephone://guides/*` and `persephone://guides/full` remain registered
resources. Whatever prose in the guides is *operational* — how to drive a surface, what a member
returns, which dialog a screen raises — belongs in the `$help` of the node that owns it, and this
epic moves what is missing rather than duplicating what is already there. The standing rule from
EPIC-084 onward applies: **move handlers, do not reimplement them, and remove the original.** A
sentence that now lives in a node's `$help` is deleted from the guide, not left in both places to
drift.

The standalone highlight instructions in `assets/mcp-res-ui.md` — the "call `app.ui.highlightElement`
via `execute_script`" recipe — are deleted outright. They were marked retirable by EPIC-085 and their
replacement (`<node>.highlight(name, message)`) has been exercised on every surface since.

### 5. The QA suite is rewritten for `call`, and every scenario starts from a bare `call`

The eleven surface files under `qa/surfaces/` already assume `call`. What they do not do is start
from nothing: several open with a path the scenario author already knew. The roadmap's fourth
`call("")` requirement makes that a defect — a scenario that hands the agent its first path is not
testing the discovery surface, which is the only thing left to test.

So every scenario in every surface file begins with `call` and no path, and each records **whether
the overview led the agent to the right branch without a wrong turn**. That per-scenario field is
the epic's real measurement; the pass/fail is secondary.

The six per-tool files (`qa/mcp-test-*.md`) are deleted in the same task as the tools, not before —
they are the fallback if the gate fails.

### 6. Two model families, and what each one proves

| Pass | Model | Reaches Persephone via | Proves |
|---|---|---|---|
| 1 | Haiku, `mcp-test-agent-call` skill | `allowed-tools: mcp__persephone__call` | A weak model can discover and drive every surface from the overview alone |
| 2 | Codex (`gpt-5.6-luna`, high) | its own MCP client, against the **real** call-only manifest | A different model family, and the manifest genuinely built with one tool |

The two passes are not redundant, and the difference is worth naming because it decides how the flag
is used. The Haiku skill restricts its own tool list, so it simulates call-only regardless of what
the manifest holds — it tests the *documentation*, not the manifest. Codex has no MCP servers
configured today; this epic adds one (`codex mcp add persephone --url http://127.0.0.1:<port>/mcp`)
and runs the pass against Persephone launched with the flag **on**, which is the only place in the
whole programme where the reduced manifest is exercised end to end. If Codex's MCP client cannot
reach it after two attempts, the pass is recorded as missing under Needs user check and **nothing is
deleted** — per the roadmap's fail branch and the standing instruction.

Both runs are Claude's own, never delegated (`codex-dev` skill, "QA test runs are yours"). The Codex
pass is delegated only in the sense that Codex is the *subject*; reading the transcript and deciding
what to change stays here.

### 7. Abort criteria — stated before the run, so the result cannot be argued with afterwards

The deletion task (US-1349) does not start unless **all** of these hold:

1. Both passes completed, on the surfaces the deleted tools cover.
2. No scenario **failed** — the agent could not do the thing at all.
3. Every deleted tool's capability was reached by at least one agent in at least one pass, from a
   bare `call`.

A **PARTIAL** — reached the goal after wrong turns — is not an abort. It is a finding, it is fixed
(a hint, a summary, a `$help` line, the overview's wording), and the affected scenario is re-run. A
**FAIL** on any surface aborts the deletion for **that surface's tools only**; the rest may still be
deleted, and the failing surface's epic reopens. This is a refinement of the roadmap's all-or-nothing
"fail → nothing is deleted", and it is deliberate: the roadmap's phrasing was written before the
tools were split across six independently-verified surfaces, and punishing `create_page` for a
browser regression would discard evidence that was honestly earned.

### 8. Deletion ledger — every row states the evidence that authorises it

Nothing is deleted on the strength of the table below alone. Each row needs its epic marking (already
held) **plus** a bare-`call` scenario in the re-run that reached the same capability.

| Deleted | Count | Replacement path | Marked by | Re-run evidence required |
|---|---|---|---|---|
| `get_app_info`, `list_windows`, `open_window` | 3 | `version`, `windows`, `windows[i].open()`, the redistributed fields | 085 | `qa/surfaces/windows.md`, `shell.md` |
| `list_pages`, `get_active_page` | 2 | `pages`, `page` | 085 | `qa/surfaces/page.md` |
| `create_page` | 1 | `pages.addEditorPage/addEmptyPage/addDrawPage/openLinks/openFile` | 086 | `qa/surfaces/editors/*.md` |
| `get_page_content`, `set_page_content` | 2 | `pages[i].content`, read and assigned | 086 | `qa/surfaces/page.md`, `editors/text.md` |
| `ui_push` | 1 | `pages.logView.push(entries)` + `dialogResult(id)` | 087 | `qa/surfaces/editors/data.md` |
| `create_board`, `open_board`, `board_refresh` | 3 | `boards.createBoard/openBoard/list()`, `pages[i].editor.reload()` | 088 | `qa/surfaces/editors/boards.md` |
| `create_toolset`, `refresh_toolset`, `search_tools` | 3 | `tools.createToolset`, `tools.toolsets.refresh()`, `tools.search()` | 088 | `qa/surfaces/tools.md` |
| `browser_*` (14) and `open_url` | 15 | `pages[i].editor.*`, `window.screen.*`, `pages.openUrlInBrowserTab` | 089 | `qa/surfaces/editors/browser.md` |
| `execute_script` | 1 | `script.execute(code)` | **this epic, US-1344** | a scenario that runs code and reads its result |
| `read_guide` | 1 | resources stay; prose in `$help` | **this epic, US-1345** | a scenario that finds an answer without any guide tool |
| **Total** | **32** | | | |

| Kept | Why |
|---|---|
| `call` | the endpoint |
| `execute_tool` | replacement unproven — needs one human tool run (Needs user check 1). Hidden by the flag, not deleted |

Also deleted: the standalone highlight instructions in `assets/mcp-res-ui.md` (decision 4), and the
six `qa/mcp-test-*.md` per-tool files (decision 5).

### 9. `waitForNavigation()` stays a document-load wait — EPIC-089's open question, decided

EPIC-089 left this for here, and here is the decision: **no runtime change.**
`BrowserEditorFacade.waitForNavigation()` continues to wait on the document loaded at call time, and
`waitFor({ selector })` / `waitFor({ text })` remain the recommended navigation remedy, as
EPIC-089's documentation change already made them.

Unifying it with `navigateAndWait`'s two-phase wait was the alternative, and the argument for it —
one implementation, matching what the retired `browser_navigate` did — is real but weaker than it
looks, for three reasons found by checking the code rather than the plan:

- **The two-phase wait belongs to a navigation *command*, not to a wait *primitive*.**
  `navigateAndWait` knows a navigation was just issued, so watching for the URL to change or
  `readyState` to leave `"complete"` is a correct precondition. `waitForNavigation()` has no such
  knowledge; it is called speculatively, often when nothing is navigating. Giving it the same
  precondition means every non-navigating call pays the first phase's timeout — up to two seconds —
  for nothing.
- **It would change what existing user scripts observe.** `waitForNavigation` is a public scripting
  API member, not an agent-only path. A silent timing change to a shipped member, in a release whose
  breaking changes are already enumerated, is a cost with no demonstrated beneficiary.
- **The tool whose behaviour it would be matching is being deleted in this epic.** Aligning with
  `browser_navigate` in the change that removes `browser_navigate` inverts the direction of the
  argument: after US-1349 there is no second implementation to be consistent with, and the pairing
  the roadmap actually wants — a two-phase navigate and a plain document wait — is what already
  exists, since `pages[i].editor.navigate()` routes through `navigateAndWait`.

What is left is a documentation duty, and US-1346 discharges it: the member's own `$help` states its
limit in one sentence, and no path recommends it as the way to wait out a navigation. If a scenario
in the re-run trips over it anyway, that is evidence for reopening, and the run log will say so.

### 10. Version stays 5.0.0; the branch keeps its name

`package.json` is at 5.0.0 and this epic's removals are already inside that major. The
agent-visible deletions are recorded in `docs/whats-new.md` under `## Version 5.0.0 (Upcoming)` as
breaking changes, with the flag and how to set it. The branch stays `upcoming-v4.0.24` — renaming it
is the user's to do — and no version bump happens here.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-1343](../tasks/US-1343-call-overview/README.md) | The `call("")` overview — optional `path` and a high-level area map | Planned |
| [US-1344](../tasks/US-1344-script-execute/README.md) | `script.execute(code)` — the renderer half of gated scripting, replacing `execute_script` | Planned |
| [US-1345](../tasks/US-1345-guide-prose-to-help/README.md) | Retire the `read_guide` tool: resources stay, operational prose moves into `$help` | Planned |
| [US-1346](../tasks/US-1346-call-only-flag/README.md) | The `PERSEPHONE_MCP_CALL_ONLY` flag, and the `waitForNavigation` documentation duty | Planned |
| [US-1347](../tasks/US-1347-qa-suite-for-call/README.md) | Rewrite the QA suite for `call`: every scenario starts from a bare call | Planned |
| [US-1348](../tasks/US-1348-two-model-gate/README.md) | The gate: the Haiku pass and the Codex pass, logged in `qa/runs/` | Planned |
| [US-1349](../tasks/US-1349-deletion/README.md) | Delete the thirty-two tools, the highlight recipe, the per-tool QA files; rewrite the manifest instructions | Planned |

Order matters more here than in any previous epic, and it is not negotiable at four points:
US-1343 precedes everything because the gate's entry point is the overview; US-1344 and US-1345
precede the gate because a tool cannot be proven replaced by a path that does not exist yet;
US-1346's flag precedes US-1348 because the Codex pass runs against the real reduced manifest; and
US-1349 runs only if US-1348's abort criteria (decision 7) are met. US-1344 and US-1345 are
independent of each other.

US-1348 is **Claude's own work, not delegated** — see decision 6.

## Needs user check

Collected from the whole roadmap so there is one morning list rather than six. Items 1 and 2 are
carried forward from earlier epics at the user's explicit request; items 3 onward are this epic's.

1. **`execute_tool` is still unmarked, and one `call` from you finishes it.** (EPIC-088 Needs user
   check 2, restated because this is the epic that would have deleted it.) `tools.execute(toolId,
   args)` is implemented and correct on every path that could be tested — it refuses an unknown id
   with the valid list and spawns nothing. What could not be tested is a tool actually running,
   because all three registered toolsets on this machine call live company services with your
   credentials (two return PHI), and registering a scratch toolset needs a click on the "Register
   this toolset?" dialog that an agent must not take on your behalf.
   **Assumption taken:** `execute_tool` is **not deleted**. It stays in the default manifest and is
   hidden by `PERSEPHONE_MCP_CALL_ONLY` (decision 2).
   **To finish it:** run any tool you are comfortable running —
   `call path: "tools.execute" args: ["<toolset>/<tool>", { … }]` — and check the result carries
   `ok`, `logs`, `durationMs`, and on failure `error`, `exitCode`, `stderr`, `toolsetRoot`. If it
   matches `execute_tool`, mark the row retirable in the roadmap and delete the tool; the flag can go
   with it.

2. **`waitForNavigation()` — decided, not deferred.** (EPIC-089 Needs user check 1.) It stays a
   document-load wait; the two-phase wait stays inside `navigate()`. The full reasoning is decision 9
   above, and it rests on three code-level facts rather than a preference. **Assumption taken:**
   documentation, not timing — unchanged from EPIC-089, now with the alternative examined and
   declined rather than deferred. If you want the unified two-phase wait despite the latency and the
   behaviour change to shipped scripts, decision 9 is the paragraph to overturn.

3. **`app.boardVars.get()` still returns stored secret values to an agent.** (EPIC-088 Needs user
   check 1, unresolved and not this epic's to resolve.) The store explicitly holds connection
   strings, API keys and passwords, and `get(namespace, name, env)` returns one through the ordinary
   `call` tree; `list()` correctly returns names only. **Assumption taken:** out of scope — it
   predates the programme, and narrowing it is a privilege decision, not a descriptor one. It is the
   same question as EPIC-087's REST page-level boundary: where does the boundary live when the value
   is already reachable by another path? Worth deciding once, for both.

4. **`strictNullChecks` is off, so the programme's "returns `undefined` when absent" invariant rests
   on review discipline.** (EPIC-086 Needs user check 6.) Every facade added by six epics declares
   return types the compiler does not enforce. **Assumption taken:** not this epic's to fix. Recorded
   once more because the programme is now finished and the exposure is now permanent rather than
   accumulating.

5. **Anything the two QA passes could not exercise.** Filled in by US-1348 with the specific rows, if
   any. A capability nobody reached from a bare `call` does not get its tool deleted (decision 7),
   and lands here instead.

## Notes

### 2026-09-06 — epic created

Scope verified against the source before the tasks were written. Four facts changed the plan from
what the roadmap's one-line entry implied:

- **There are 34 tools, not the ~30 the roadmap's prose implies**, and 30 of them are already marked.
  Counted from the seven files under `src/main/mcp/tools/`. The epic's real content is therefore two
  replacements (`execute_script`, `read_guide`), one flag, one gate, and one large deletion — not a
  broad build.
- **`path` is `z.string()` in the manifest** (`call-tools.ts`), so it is required, while the handler
  already reads `typeof params.path === "string" ? params.path : ""`. The roadmap's diagnosis was
  exact: the fix is the schema, and the handler needs no change.
- **`script` is already reserved at the root** (`ai-vision/root.ts`, `RESERVED_ROOT_NAMES`), which
  makes decision 3 a claim on a name held for it rather than a new root.
- **Codex has no MCP servers configured** (`~/.codex/config.toml` holds none), so the roadmap's
  "Codex as a second model family" is not free. `codex mcp add --url` supports streamable HTTP, so
  the pass is feasible; decision 6 makes adding the server part of US-1348 and names the fallback if
  it cannot connect.

The flag decision (decision 1) is the one most worth revisiting if it looks wrong later: it chose an
environment variable over a setting explicitly because EPIC-089 had just spent a task deleting a
settings-shaped flag of the same kind, and consistency with that judgement was worth more than the
convenience of flipping it from the Settings editor.
