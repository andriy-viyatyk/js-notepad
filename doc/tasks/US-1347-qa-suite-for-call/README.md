# US-1347: Rewrite the QA suite for `call`

**Status:** Implemented

Epic: [EPIC-090](../../epics/EPIC-090.md) — Consolidation

## Goal

Rewrite the surface QA suite so every scenario tests discovery from a bare `call`, then add a
compact `qa/surfaces/gate.md` that reaches every one of EPIC-090 decision 8's 32 deleted-tool
capabilities. Document the one-surface and all-surfaces runner procedures for the Haiku and Codex
passes without running either pass in this task.

## Background

EPIC-090 decision 5 and roadmap requirement 4 make the overview returned by `call` with no `path`
the only valid starting point for surface QA. A scenario that starts at `pages[0].editor` or
another author-supplied path tests the facade, not discovery. Decision 6 requires two model
families: Haiku through `mcp-test-agent-call`, and Codex against Persephone's genuinely reduced
manifest. Decision 7 makes a PARTIAL a fix-and-rerun finding and a FAIL an abort for that surface's
tools. Decision 8 requires capability coverage per deleted tool, not merely coverage per scenario.

The checked-in repository contains 15 surface scenario files, despite the epic's historical
reference to eleven: seven files directly under `qa/surfaces/` and eight under
`qa/surfaces/editors/`. All 15 are in scope because the requirement is every scenario under the
surface suite.

The replacement paths were checked against the descriptors before writing this plan:

| Descriptor source | Paths relied on by this task |
|---|---|
| `src/renderer/scripting/ai-vision/root.ts` | bare-root overview, `helpSearch`, `script.$help`, `script.execute(code)` |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | `pages`, `pages.addEditorPage`, `pages.openUrl`, `pages.openUrlInBrowserTab`, `pages.logView`, `pages.showPage` |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | `page`, `pages["<id>"].content`, `pages["<id>"].editor` |
| `src/main/mcp/ai-vision/main-root.ts` and `main-services.ts` | `windows`, `windows[i].status`, `windows[i].pages`, `windows[i].open()`, `main.runtime.*` |
| `src/renderer/scripting/ai-vision/namespaces/boards.ts` | `boards.list()`, `boards.createBoard()`, `boards.openBoard()` |
| `src/renderer/scripting/ai-vision/namespaces/tools.ts` | `tools.search()`, `tools.toolsets.refresh()`, `tools.createToolset()` |
| `src/renderer/scripting/ai-vision/browser-automation-members.ts`, `BrowserEditorFacade.ts`, `BoardEditorFacade.ts` | `snapshot`, `click`, `hover`, `type`, `select`, `pressKey`, `evaluate`, `waitFor`, `screenshot`, `networkRequests`, tab methods, `navigate`, `back`, `closeTab` |
| `src/renderer/scripting/api-wrapper/LogViewEditorFacade.ts` | `pages.logView.$help`, `push()`, `dialogResult()` |

The six `qa/mcp-test-*.md` files remain untouched. US-1349 owns their deletion; until the gate
passes they are the fallback per-tool suite.

## Implementation Plan

### 1. Apply one bare-`call` contract to every surface scenario

Add this exact short field to every scenario after its request/start description:

```markdown
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`;
wrong paths: `none` or `<every incorrect path, in order>`.
```

`PASS` means the overview led to the correct branch without a wrong path. `PARTIAL` means the
agent eventually reached the correct branch but took one or more wrong paths; `FAIL` means it did
not reach the required branch. The field records paths, not prose such as “it got confused”. A
wrong path is the exact attempted `call` path, including its arguments when they explain the turn.
The runner fills the field from the transcript; scenario authors do not pre-judge it.

Every scenario will explicitly say that its first invocation is `call` with no `path` (the empty
overview), before the agent sees or uses any expected path. Preserve each scenario's preparation,
request, expected result, verification, and regression notes while replacing path-leading prose
with discovery expectations. Keep the existing pinned-tab and harmless/public-data boundaries.

Pattern to use when rewriting the existing browser-link scenario:

```markdown
## Test W.1: The snapshot's refs are usable from the node that produced them

**Preparation:** Open `https://example.com` in a non-pinned browser page. Do not provide the page
path or editor path to the agent.

**Request:** "Open https://example.com in Persephone's built-in browser, tell me its main heading,
then activate the page's Learn more link and tell me where it went."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned
overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths:
`none` or `<every incorrect path, in order>`.

**Expected:** The agent discovers `pages.openUrlInBrowserTab(...)`, waits with
`pages["<id>"].editor.waitFor({ text: "Example Domain" })`, reads the page with
`pages["<id>"].editor.snapshot()`, and activates the link with the returned snapshot ref via
`pages["<id>"].editor.click({ ref: "<ref>" })`. It does not invent a CSS selector when the
snapshot already supplies a ref.

**On-screen outcome:** The browser page first shows Example Domain and then the IANA page reached
by its Learn more link.

**Verify:** Through `call`, confirm the final page title or snapshot is IANA, and confirm the
agent used the ref form. Record every wrong discovery path even when the final result is correct.
```

Apply the pattern to these exact files:

- `qa/surfaces/dialogs.md`
- `qa/surfaces/shell.md`
- `qa/surfaces/page.md`
- `qa/surfaces/panels.md`
- `qa/surfaces/tools.md`
- `qa/surfaces/menus.md`
- `qa/surfaces/windows.md`
- `qa/surfaces/editors/text.md`
- `qa/surfaces/editors/preview.md`
- `qa/surfaces/editors/media.md`
- `qa/surfaces/editors/diff.md`
- `qa/surfaces/editors/graph.md`
- `qa/surfaces/editors/data.md`
- `qa/surfaces/editors/boards.md`
- `qa/surfaces/editors/browser.md`

The original scenario paths remain useful as expected destinations, but none may be handed to the
agent before the bare overview. Preparation may create pages or arrange a dialog; preparation is
not the agent's discovery step.

### 2. Add `qa/surfaces/gate.md`

Create a compact gate with the same scenario field format. Each scenario must contain **Request**,
**Deleted-tool coverage**, **Expected paths**, **On-screen outcome**, and **Verify through `call`**.
The proposed ten scenarios and their coverage are:

| Gate scenario | Deleted tools covered | Count |
|---|---|---:|
| G.1 application facts and window recovery | `get_app_info`, `list_windows`, `open_window` | 3 |
| G.2 create and edit a scratch text page | `list_pages`, `get_active_page`, `create_page`, `get_page_content`, `set_page_content` | 5 |
| G.3 show a report and ask a question | `ui_push` | 1 |
| G.4 create, find, open and reload a board | `create_board`, `open_board`, `board_refresh` | 3 |
| G.5 inspect the tool registry | `create_toolset`, `refresh_toolset`, `search_tools` | 3 |
| G.6 browse, follow a link, return and capture | `open_url`, `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_wait_for`, `browser_navigate_back`, `browser_take_screenshot`, `browser_network_requests` | 8 |
| G.7 complete a harmless local form | `browser_hover`, `browser_type`, `browser_select_option`, `browser_press_key`, `browser_evaluate` | 5 |
| G.8 manage browser tabs | `browser_tabs`, `browser_close` | 2 |
| G.9 execute renderer code and read its result | `execute_script` | 1 |
| G.10 answer a documentation question with no guide tool | `read_guide` | 1 |
| **Total** | **All 32 deleted tools** | **32** |

The rows below are the scenario text to place in the new gate file; the table is deliberately
one-to-one with the ledger's deleted-tool rows, except that the 15 browser capabilities are split
across three realistic browser requests.

The gate preamble must also state these rules:

- **Scratchpad and cleanup:** each run gets a unique session scratchpad directory. Every board,
  toolset scaffold, local HTML file, and other disk artifact is created beneath it. Every scenario
  that creates a page, board, toolset, browser tab, or Log View includes a **Cleanup** field and
  removes what it created before the next scenario. Cleanup is verified through `call` where a
  descriptor exists; the runner must not leave acceptance-run artifacts in the user's board list.
- **Pinned tabs:** never close, modify, activate, or otherwise interact with a pinned tab. Close
  only pages and tabs created by the scenario, and preserve the pre-run state of all other pages.
- **Dialog policy:** a Log View inline dialog is the agent's own question to the user and carries
  no privilege, so the unattended runner may answer it to complete G.3. The runner may use the
  active Log View's app-window `call` surface (`window.screen.snapshot()` followed by
  `window.screen.click({ ref })`) to press the requested answer button, then re-read
  `pages.logView.dialogResult(id)`. A trust or consent dialog — including **“Register this
  toolset?”** in G.5 or a board-trust dialog in G.4 — may never be answered with a trust/approval
  decision by the runner. G.5 may dismiss its registration prompt with **Cancel** solely as safe
  cleanup; it must never press the registration button. Native OS dialogs are reported and left for
  the user; they are never answered by the runner.
- **Live targets:** use only public, harmless pages (`https://example.com` and what it links to)
  or local scratch files. Never log in, spend the user's credentials, or contact a company or
  private service. This boundary is also why `execute_tool` is excluded from the gate: it remains
  unproven and is not being deleted.

#### G.1 — application facts and window recovery

- **Request:** "Tell me the Persephone version, browser profiles, bundled Demo-board directory and
  catalog URL. Then find the closed test window, reopen it, and tell me which page is active."
- **Deleted-tool coverage:** `get_app_info`, `list_windows`, `open_window` (3).
- **Expected paths:** Start with bare `call`; discover `version`, `settings.browserProfiles`,
  `settings.defaultBrowserProfile`, `main.runtime.resourcesDir`, `main.runtime.demoBoardDir`,
  `boards.assetsBaseUrl`, `boards.manifestUrl`, `windows`, `windows[i].status`,
  `windows[i].pages`, `windows[i].open()`, and `windows[i].activePageId`/`pageCount`.
- **On-screen outcome:** The selected closed window is open and focused with its persisted pages.
- **Verify through `call`:** Read `windows[i].status === "open"`, its `pageCount` and
  `activePageId`, and the returned page summaries. The fact values must come from their owning
  nodes, not an invented `appInfo` path.
- **Cleanup:** Restore the test window to its pre-run open/closed state. If it was opened by this
  scenario, close that test window after its page summaries are verified; do not close the user's
  other windows or any pinned tab.

#### G.2 — create and edit a scratch text page

- **Request:** "Create a scratch JavaScript page containing `const answer = 6 * 7;`, change it to
  `const answer = 7 * 7;`, and tell me what page is active and what its final text is."
- **Deleted-tool coverage:** `list_pages`, `get_active_page`, `create_page`, `get_page_content`,
  `set_page_content` (5).
- **Expected paths:** Bare overview → `pages` → `pages.addEditorPage("monaco", "javascript", ...)`
  → `pages["<id>"].content` read and assigned with `value` → `page` and
  `pages["<id>"].editor`.
- **On-screen outcome:** A non-pinned Monaco JavaScript page is active and visibly contains the
  final source.
- **Verify through `call`:** `pages` contains the returned id, `page` names that page as active,
  `pages["<id>"].content` is the final source, and `pages["<id>"].editor.id` is `monaco`.
- **Cleanup:** Close the scratch page by its returned id and verify it is absent from `pages`; it
  must be a non-pinned page created by this scenario.

#### G.3 — show a report and ask a question in Log View

- **Request:** "Show the user a small report with a success message, Markdown explanation, CSV
  table and progress bar, then ask whether the temporary report may be cleared."
- **Deleted-tool coverage:** `ui_push` (1).
- **Expected paths:** Bare overview → `pages.logView.$help` or `helpSearch("Log View")` →
  `pages.logView.push([...])` → `pages.logView.dialogResult("<dialogId>")` while unresolved →
  `window.screen.snapshot()` and `window.screen.click({ ref: "<answer-button-ref>" })` by the
  runner → `pages.logView.dialogResult("<dialogId>")` after the answer.
- **On-screen outcome:** Log View contains the four report entries and an inline question; the
  unattended runner answers that low-privilege inline question through the visible app window.
- **Verify through `call`:** `push()` returns `entryIds` and `dialogIds` immediately, unresolved
  `dialogResult()` reports `status: "unresolved"`, attention identifies the unanswered entry,
  the runner's app-window click activates the requested inline answer, and the post-answer read
  reports `status: "resolved"`. This permitted answer is deliberately different from approving a
  trust or registration dialog.
- **Cleanup:** Call `pages.logView.clear()` to remove the temporary Log View entries, then close
  the Log View page if this scenario created it; leave any pre-existing Log View page and its
  entries unchanged.

#### G.4 — create, find, open and reload a board

- **Request:** "Create a disposable trusted board in the scratch directory, find it in the local
  board list, open it, and reload it so the board page is ready."
- **Deleted-tool coverage:** `create_board`, `open_board`, `board_refresh` (3).
- **Expected paths:** Bare overview → `boards.createBoard(name, dir)` → `boards.list()` →
  `boards.openBoard(root)` → `pages["<id>"].editor.id` and `pages["<id>"].editor.reload()`.
- **On-screen outcome:** The scratch board is open in a board page and its main frame is ready.
- **Verify through `call`:** The list contains the created root, the opened page reports the board
  facade, and reload returns `refreshed: true`, `frameReady: true`, and `renderState: "trusted"`.
- **Cleanup:** Close the board page created by this scenario, call `boards.unregisterBoard(root)` so
  the root leaves the live board list, and remove the board directory under the session scratchpad.
  Verify the root is absent from `boards.list()`; never unregister or remove a pre-existing board.

#### G.5 — inspect the tool registry without granting execution

- **Request:** "Create a disposable toolset in the scratch directory, do not register it, refresh
  the registry, and tell me what safe tool definitions are available without running one."
- **Deleted-tool coverage:** `create_toolset`, `refresh_toolset`, `search_tools` (3).
- **Expected paths:** Bare overview → `tools.createToolset(name, dir)` → pending attention →
  `dialogs[0].click("Cancel")` (never the registration button) → `tools.toolsets.refresh()` →
  `tools.search()` and, after inspecting the returned ids, an optional
  `tools.search("select:<known-id>")`.
- **On-screen outcome:** The registration prompt is cancelled; no new toolset is registered; the
  existing registry remains visible through the Tools surface.
- **Verify through `call`:** Refresh reports the registry envelope, search returns definitions with
  argument schemas and environment-variable names only, and no tool is executed or registered.
- **Cleanup:** Dismiss the registration prompt with **Cancel** if it is still open, verify the
  scratch toolset is not registered, and remove its scaffold directory under the session
  scratchpad. Do not click **Register toolset**.

#### G.6 — browse, follow a link, return, and capture the page

- **Request:** "Open https://example.com in the built-in browser, tell me its heading, follow its
  Learn more link, return to the original page, then navigate there directly once more and provide
  a screenshot and recent network metadata."
- **Deleted-tool coverage:** `open_url`, `browser_navigate`, `browser_snapshot`, `browser_click`,
  `browser_wait_for`, `browser_navigate_back`, `browser_take_screenshot`,
  `browser_network_requests` (8).
- **Expected paths:** Bare overview → `pages.openUrlInBrowserTab(url)` →
  `pages["<id>"].editor.waitFor({ text })` → `snapshot()` → `click({ ref })` → `waitFor({ text })`
  → `back()` → `navigate("https://example.com")` → `waitFor({ text })` → `screenshot()` and
  `networkRequests()`.
- **On-screen outcome:** The final browser document is Example Domain; the earlier link visit is
  IANA; the screenshot is an image result, not base64 text.
- **Verify through `call`:** Confirm the final title/snapshot, image block metadata, and bounded
  network request records. The transcript must show the explicit `navigate`, `back`, wait, snapshot,
  ref click, screenshot and network paths.
- **Cleanup:** Close the browser page created by this scenario and verify it is absent from `pages`.
  Close only that page's tabs; do not touch pinned or pre-existing browser pages.

#### G.7 — complete a harmless local form

- **Preparation:** Open a local scratch HTML form with a text input, a select, a focus/hover hint,
  and a result element that reflects submission. Do not give the agent selectors or paths.
- **Request:** "Fill the scratch form with the requested value, choose the requested option, hover
  the submit control, submit with the keyboard, and read the resulting status."
- **Deleted-tool coverage:** `browser_hover`, `browser_type`, `browser_select_option`,
  `browser_press_key`, `browser_evaluate` (5).
- **Expected paths:** Bare overview → the browser page's `snapshot()` → `hover({ ref })`,
  `type({ ref }, text)`, `select({ ref }, value)`, `pressKey("Enter")`, and `evaluate(...)` only
  to read the harmless result.
- **On-screen outcome:** The form shows the selected option and submitted status; no external
  service is contacted.
- **Verify through `call`:** Read a fresh snapshot and the result value; confirm the agent used
  explicit snapshot refs for controls where available and did not report a fabricated submission.
- **Cleanup:** Close the local scratch browser page and remove its HTML file from the session
  scratchpad directory; close only tabs created by this scenario.

#### G.8 — manage browser tabs

- **Request:** "Open a second harmless browser tab, list the browser tabs, switch to the new tab,
  verify it is active, then close that browser tab and leave the original tab active."
- **Deleted-tool coverage:** `browser_tabs`, `browser_close` (2).
- **Expected paths:** Bare overview → `pages["<id>"].editor.tabs` → `addTab(url)` → `tabs` →
  `switchTab(tabId)` → `activeTab` → `closeTab(tabId)` (the `browser_close` capability).
- **On-screen outcome:** The new tab is briefly active, then closed; the original browser tab is
  active and intact.
- **Verify through `call`:** `tabs` no longer contains the temporary id and `activeTab` identifies
  the original tab.
- **Cleanup:** Confirm the temporary tab is closed and close the browser page created for this
  scenario, if any. Never close or modify the original or a pinned tab.

#### G.9 — execute renderer code and read its result

- **Request:** "Using the renderer scripting path, run code that logs `gate` and returns 42; tell
  me the returned value and captured log. Do not change a page or the filesystem."
- **Deleted-tool coverage:** `execute_script` (1).
- **Expected paths:** Bare overview → `script.$help` → `script.execute("console.log('gate'); 6 * 7")`.
  The agent must use the renderer path, not `main.script.execute`.
- **On-screen outcome:** No page or filesystem state changes; the call result contains `text: "42"`,
  `isError: false`, and a captured `consoleLogs` entry.
- **Verify through `call`:** Read the returned result shape and confirm the log and value; no
  source, page, or process side effect is accepted as a substitute.
- **Cleanup:** If the runner had to create a temporary page to make the renderer context
  available, close that page by id. The prescribed code should create no page, file, or process;
  verify that it did not.

#### G.10 — answer a documentation question with no guide tool

- **Request:** "How can I show the user a CSV table and a progress bar without creating a page,
  and how do I know when an inline question has been answered?"
- **Deleted-tool coverage:** `read_guide` (1).
- **Expected paths:** Bare overview → `pages` → `pages.logView.$help` (or
  `helpSearch("Log View")`) → answer from the `push()` and `dialogResult()` contracts. The agent
  must not call `read_guide` or claim that the guide tool is available.
- **On-screen outcome:** No state changes; the answer identifies Log View as the output channel,
  `output.grid`/`output.progress`, immediate `dialogIds`, and `dialogResult`'s unresolved/resolved
  statuses.
- **Verify through `call`:** The transcript proves the answer came from the overview, a node's
  `$help`, or `helpSearch`, and the wording matches the live `LogViewEditorFacade` help.
- **Cleanup:** None; this scenario is read-only and must not create a page or write to disk.

The gate's coverage distribution is therefore 3 + 5 + 1 + 3 + 3 + 8 + 5 + 2 + 1 + 1 = 32.
`execute_tool` is intentionally **not** in this gate: EPIC-090 decision 8 keeps it because its
replacement is withheld pending Needs-user-check 1. It is hidden by the call-only flag but is not
being deleted, so no gate row is missing.

### 3. Document the two-model runner in both QA READMEs

Update `qa/README.md` and `qa/surfaces/README.md` with matching procedures. Keep the existing
pinned-tab rules, but replace the old single-agent wording with the following operational split.

Before:

```text
Skill(skill: "mcp-test-agent", args: "<test request>")
```

After:

```text
Haiku pass:
Skill(skill: "mcp-test-agent-call", args: "<the scenario request>")

Codex pass:
codex mcp add persephone --url http://127.0.0.1:<mcp.port>/mcp
```

The prose must state:

1. **Run one surface.** Prepare a dedicated instance, leave pinned tabs alone, choose one surface
   file (or `gate.md`), and run its scenarios from a first bare `call`. Invoke the Haiku skill with
   the scenario request. The skill restricts its own tools to `call`, so this pass simulates
   call-only regardless of the server manifest and tests documentation/discovery.
2. **Run all surfaces.** For the EPIC-090 deletion gate, run the ten scenarios in `gate.md` once
   in the Haiku pass and once in the Codex pass; this is the compact all-surface capability sweep,
   not a request to run all roughly sixty historical scenarios twice. A separate UI-regression
   sweep may iterate every file in the surface index when requested, but it is not the deletion
   gate.
3. **Codex setup.** Codex has no Persephone MCP server configured today. Launch Persephone with
   `PERSEPHONE_MCP_CALL_ONLY=1`, then add
   `codex mcp add persephone --url http://127.0.0.1:<mcp.port>/mcp`; the default port is `7865`.
   This is the only end-to-end exercise of the genuinely reduced manifest. The environment is fixed
   at process start, so changing the flag requires restarting Persephone before the Codex pass.
4. **Results.** `PASS` means the request succeeded with the expected surface result. `PARTIAL`
   means the goal was reached after wrong turns: record it as a finding, fix the relevant overview,
   hint, summary or `$help`, and re-run that scenario. `FAIL` means the agent could not reach the
   goal: abort deletion for that surface's tools only; the other surface groups may continue, and
   the failed surface reopens.
5. **Run log.** Write one dated Markdown log under `qa/runs/` for each pass (or a clearly labelled
   combined two-pass log). It must contain model/harness, Persephone build and manifest mode,
   surface/scenario ids and user requests, confirmation that each first call had no `path`, the
   `Overview route` field with every wrong path, exact paths reached, on-screen verification,
   PASS/PARTIAL/FAIL, findings and fixes, re-run results, and the 32-tool coverage matrix. For the
   Codex log, record the MCP endpoint and evidence that only `call` was advertised. Redact secrets,
   credentials, private URLs, and user data; keep diagnostics such as path errors and tool names.

The runner still does not delete pages or accept user trust/destructive dialogs on the user's behalf.
QA runs belong to Claude as recorded in `.claude/skills/codex-dev/SKILL.md`; this task only writes the
material and does not invoke a test-agent skill.

### 4. Keep the deletion boundary explicit

Add a gate-file note that the six per-tool files remain until US-1349:

- `qa/mcp-test-create-page.md`
- `qa/mcp-test-ui-push.md`
- `qa/mcp-test-execute-script.md`
- `qa/mcp-test-page-operations.md`
- `qa/mcp-test-browser.md`
- `qa/mcp-test-ui-guidance.md`

They are fallback evidence if a gate surface fails. Do not add an active-work/dashboard entry; it
already exists, and do not add a dashboard entry as part of this task.

## Concerns

- **Historical file count:** the repository has 15 surface files, so all 15 are rewritten. This
  resolves the eleven-file wording mismatch in favor of the actual `qa/surfaces/` inventory.
- **Scenario prerequisites:** the gate needs a disposable board directory, scratch toolset
  directory, a prepared closed window, and harmless local/public browser content. These are runner
  preparations, not paths supplied to the agent, and must never touch pinned tabs or real services.
- **No guessed paths:** all paths in the ten gate scenarios are present in the checked descriptors;
  the runner must still record the actual path and treat a descriptor mismatch as a finding.
- **`execute_tool`:** omitted deliberately as a kept tool with an unproven replacement; do not
  expand the gate to exercise it.
- **`read_guide`:** the resource files remain in EPIC-090; this gate tests that operational answers
  are discoverable through the overview, `$help`, or `helpSearch`, without the deleted tool.
- **Dialog and cleanup discipline:** G.3 is the only scenario where the unattended runner may
  answer a dialog, because its inline Log View question carries no privilege. G.5's Cancel is a
  safe dismissal, never consent. Every other trust, board, registration, native OS, or destructive
  prompt remains unanswered, and every persistent artifact is removed before the next scenario.
- **No QA execution in US-1347:** no model pass, app restart, MCP registration, or run log is
  performed while authoring this task document.

## Acceptance Criteria

- [ ] Every scenario in all 15 files under `qa/surfaces/` starts from a bare `call` with no path.
- [ ] Every rewritten scenario has the exact `Overview route` field and records the complete wrong-
      path list from its run.
- [ ] At least one rewritten scenario is present in full as the pattern, including preparation,
      request, bare start, expected paths, on-screen outcome, and call verification.
- [ ] `qa/surfaces/gate.md` contains exactly ten compact scenarios and explicitly maps all 32
      deleted tools to them, including `script.execute(code)` and the no-guide `read_guide` case.
- [ ] The gate preamble defines the Log View-inline-dialog exception, forbids trust/consent/native
      dialog answers, requires a session scratchpad, preserves pinned tabs, and states the live-
      target boundary.
- [ ] Every persistent gate scenario has an explicit cleanup step, including board unregister,
      scratch-directory removal, browser/page cleanup, and Log View cleanup.
- [ ] `execute_tool` is explicitly identified as kept and absent from the gate.
- [ ] The gate states that the six `qa/mcp-test-*.md` files remain until US-1349 and are fallback
      evidence.
- [ ] `qa/README.md` and `qa/surfaces/README.md` document one-surface and all-surfaces procedures,
      the exact Haiku skill invocation, the Codex MCP setup, port 7865 default, process-start
      restart requirement, reduced-manifest scope, abort meanings, and run-log contents.
- [ ] No QA run or test-agent skill is invoked by this task, and no source implementation or
      dashboard entry is changed.

## Files Changed Summary

| File | Change |
|---|---|
| `doc/tasks/US-1347-qa-suite-for-call/README.md` | This task document |
| `qa/README.md` | Two-model one-surface/all-surfaces runner procedure and run-log contract |
| `qa/surfaces/README.md` | Surface-specific bare-call rule, gate procedure, and result semantics |
| `qa/surfaces/gate.md` | New ten-scenario, 32-tool compact gate |
| `qa/surfaces/dialogs.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/shell.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/page.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/panels.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/tools.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/menus.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/windows.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/text.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/preview.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/media.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/diff.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/graph.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/data.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/boards.md` | Add bare-call starts and `Overview route` to every scenario |
| `qa/surfaces/editors/browser.md` | Add bare-call starts and `Overview route` to every scenario |

Files explicitly requiring **no changes** in US-1347: the six `qa/mcp-test-*.md` fallback files,
all files under `src/renderer/scripting/ai-vision/` and `src/renderer/scripting/api-wrapper/`,
`doc/epics/EPIC-090.md`, `doc/agent-transparency-roadmap.md`, and `active-work.md`.
