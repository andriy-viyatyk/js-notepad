# EPIC-090 deletion gate

This is the compact capability gate for the reduced `call` manifest. It contains exactly ten
scenarios and covers all 32 deleted-tool capabilities from EPIC-090 decision 8. Each scenario
starts from discovery: the runner's first operation is `call` with no `path`, and the agent must
use the empty overview before choosing a branch.

## Gate rules

- **Scratchpad and cleanup:** Give each run a unique session scratchpad directory. Create every
  board, toolset scaffold, local HTML file, and other disk artifact beneath it. Every scenario that
  creates a page, board, toolset, browser tab, or Log View has a **Cleanup** field and removes what
  it created before the next scenario. Verify cleanup through `call` where a descriptor exists; do
  not leave acceptance-run artifacts in the user's board list.
- **Pinned tabs:** Never close, modify, activate, or otherwise interact with a pinned tab. Close
  only pages and tabs created by the scenario, and preserve the pre-run state of all other pages.
- **Dialog policy:** A Log View inline dialog is the agent's own question to the user and carries
  no privilege, so the unattended runner may answer it for G.3 with the active Log View app-window
  surface: `window.screen.snapshot()` followed by `window.screen.click({ ref })`, then a reread of
  `pages.logView.dialogResult(id)`. Never answer a trust or consent dialog, including the
  **Register this toolset?** prompt in G.5 or a board-trust dialog in G.4. G.5 may dismiss its
  registration prompt with **Cancel** as safe cleanup, never with the registration button. Native
  OS dialogs are reported and left for the user.
- **Live targets:** Use only public, harmless pages (`https://example.com` and what it links to)
  or local scratch files. Never log in, spend credentials, or contact a company or private
  service. `execute_tool` is excluded because it remains kept pending its unproven replacement;
  it is hidden by the call-only flag but is not one of the 32 deleted tools.

## Coverage ledger

| Scenario | Deleted-tool capabilities | Count |
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

The six per-tool fallback files remain until US-1349 and are fallback evidence if a gate surface
fails: `qa/mcp-test-create-page.md`, `qa/mcp-test-ui-push.md`,
`qa/mcp-test-execute-script.md`, `qa/mcp-test-page-operations.md`, `qa/mcp-test-browser.md`, and
`qa/mcp-test-ui-guidance.md`. Do not expand this gate for `execute_tool`.

## Gate scenarios

## Gate G.1: Application facts and window recovery

**Request:** "Tell me the Persephone version, browser profiles, bundled Demo-board directory and
catalog URL. Then find the closed test window, reopen it, and tell me which page is active."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `get_app_info`, `list_windows`, `open_window` (3).

**Expected paths:** Bare overview → `version`, `settings.browserProfiles`,
`settings.defaultBrowserProfile`, `main.runtime.resourcesDir`, `main.runtime.demoBoardDir`,
`boards.assetsBaseUrl`, `boards.manifestUrl`, `windows`, `windows[i].status`, `windows[i].pages`,
`windows[i].open()`, and `windows[i].activePageId`/`pageCount`.

**On-screen outcome:** The selected closed window is open and focused with its persisted pages.

**Verify through `call`:** Read `windows[i].status === "open"`, its `pageCount` and
`activePageId`, and the returned page summaries. Fact values must come from their owning nodes,
not an invented `appInfo` path.

**Cleanup:** Restore the test window to its pre-run open/closed state. If this scenario opened it,
close that test window after verifying its page summaries; do not close other windows or pinned tabs.

## Gate G.2: Create and edit a scratch text page

**Request:** "Create a scratch JavaScript page containing `const answer = 6 * 7;`, change it to
`const answer = 7 * 7;`, and tell me what page is active and what its final text is."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `list_pages`, `get_active_page`, `create_page`, `get_page_content`,
`set_page_content` (5).

**Expected paths:** Bare overview → `pages` → `pages.addEditorPage("monaco", "javascript", ...)`
→ `pages["<id>"].content` read and assigned with `value` → `page` and
`pages["<id>"].editor`.

**On-screen outcome:** A non-pinned Monaco JavaScript page is active and visibly contains the
final source.

**Verify through `call`:** `pages` contains the returned id, `page` names that page as active,
`pages["<id>"].content` is the final source, and `pages["<id>"].editor.id` is `monaco`.

**Cleanup:** Close the scratch page by its returned id and verify it is absent from `pages`; it
must be a non-pinned page created by this scenario.

## Gate G.3: Show a report and ask a question in Log View

**Request:** "Show the user a small report with a success message, Markdown explanation, CSV table
and progress bar, then ask whether the temporary report may be cleared."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `ui_push` (1).

**Expected paths:** Bare overview → `pages.logView.$help` or `helpSearch("Log View")` →
`pages.logView.push([...])` → `pages.logView.dialogResult("<dialogId>")` while unresolved →
runner use of `window.screen.snapshot()` and `window.screen.click({ ref: "<answer-button-ref>" })`
→ `pages.logView.dialogResult("<dialogId>")` after the answer.

**On-screen outcome:** Log View contains the four report entries and an inline question; the
unattended runner answers that low-privilege inline question through the visible app window.

**Verify through `call`:** `push()` returns `entryIds` and `dialogIds` immediately, unresolved
`dialogResult()` reports `status: "unresolved"`, attention identifies the unanswered entry, the
app-window click activates the requested answer, and the post-answer read reports
`status: "resolved"`.

**Cleanup:** Call `pages.logView.clear()` to remove temporary entries, then close the Log View page
if this scenario created it; leave any pre-existing Log View page and entries unchanged.

## Gate G.4: Create, find, open and reload a board

**Request:** "Create a disposable trusted board in the scratch directory, find it in the local
board list, open it, and reload it so the board page is ready."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `create_board`, `open_board`, `board_refresh` (3).

**Expected paths:** Bare overview → `boards.createBoard(name, dir)` → `boards.list()` →
`boards.openBoard(root)` → `pages["<id>"].editor.id` and `pages["<id>"].editor.reload()`.

**On-screen outcome:** The scratch board is open in a board page and its main frame is ready.

**Verify through `call`:** The list contains the created root, the opened page reports the board
facade, and reload returns `refreshed: true`, `frameReady: true`, and `renderState: "trusted"`.

**Cleanup:** Close the board page created by this scenario, call `boards.unregisterBoard(root)` so
the root leaves the live board list, and remove the board directory under the session scratchpad.
Verify the root is absent from `boards.list()`; never unregister or remove a pre-existing board.

## Gate G.5: Inspect the tool registry without granting execution

**Request:** "Create a disposable toolset in the scratch directory, do not register it, refresh the
registry, and tell me what safe tool definitions are available without running one."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `create_toolset`, `refresh_toolset`, `search_tools` (3).

**Expected paths:** Bare overview → `tools.createToolset(name, dir)` → pending attention →
`dialogs[0].click("Cancel")` (never the registration button) → `tools.toolsets.refresh()` →
`tools.search()` and, after inspecting returned ids, optional `tools.search("select:<known-id>")`.

**On-screen outcome:** The registration prompt is cancelled; no new toolset is registered; the
existing registry remains visible through the Tools surface.

**Verify through `call`:** Refresh reports the registry envelope, search returns definitions with
argument schemas and environment-variable names only, and no tool is executed or registered.

**Cleanup:** Dismiss the registration prompt with **Cancel** if still open, verify the scratch
toolset is not registered, and remove its scaffold directory under the session scratchpad. Do not
click **Register toolset**.

## Gate G.6: Browse, follow a link, return, and capture the page

**Request:** "Open https://example.com in the built-in browser, tell me its heading, follow its
Learn more link, return to the original page, then navigate there directly once more and provide a
screenshot and recent network metadata."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `open_url`, `browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_wait_for`, `browser_navigate_back`, `browser_take_screenshot`,
`browser_network_requests` (8).

**Expected paths:** Bare overview → `pages.openUrlInBrowserTab(url)` →
`pages["<id>"].editor.waitFor({ text })` → `snapshot()` → `click({ ref })` → `waitFor({ text })`
→ `back()` → `navigate("https://example.com")` → `waitFor({ text })` → `screenshot()` and
`networkRequests()`.

**On-screen outcome:** The final browser document is Example Domain; the earlier link visit is IANA;
the screenshot is an image result, not base64 text.

**Verify through `call`:** Confirm the final title/snapshot, image block metadata, and bounded
network request records. The transcript shows explicit navigate, back, wait, snapshot, ref click,
screenshot, and network paths.

**Cleanup:** Close the browser page created by this scenario and verify it is absent from `pages`.
Close only that page's tabs; do not touch pinned or pre-existing browser pages.

## Gate G.7: Complete a harmless local form

**Preparation:** Open a local scratch HTML form with a text input, a select, a focus/hover hint,
and a result element that reflects submission. Do not give the agent selectors or paths.

**Request:** "Fill the scratch form with the requested value, choose the requested option, hover the
submit control, submit with the keyboard, and read the resulting status."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `browser_hover`, `browser_type`, `browser_select_option`,
`browser_press_key`, `browser_evaluate` (5).

**Expected paths:** Bare overview → the browser page's `snapshot()` → `hover({ ref })`,
`type({ ref }, text)`, `select({ ref }, value)`, `pressKey("Enter")`, and `evaluate(...)` only to
read the harmless result.

**On-screen outcome:** The form shows the selected option and submitted status; no external service
is contacted.

**Verify through `call`:** Read a fresh snapshot and the result value; confirm explicit snapshot
refs were used for controls where available and no fabricated submission was reported.

**Cleanup:** Close the local scratch browser page and remove its HTML file from the session
scratchpad directory; close only tabs created by this scenario.

## Gate G.8: Manage browser tabs

**Request:** "Open a second harmless browser tab, list the browser tabs, switch to the new tab,
verify it is active, then close that browser tab and leave the original tab active."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `browser_tabs`, `browser_close` (2).

**Expected paths:** Bare overview → `pages["<id>"].editor.tabs` → `addTab(url)` → `tabs` →
`switchTab(tabId)` → `activeTab` → `closeTab(tabId)`.

**On-screen outcome:** The new tab is briefly active, then closed; the original browser tab is
active and intact.

**Verify through `call`:** `tabs` no longer contains the temporary id and `activeTab` identifies
the original tab.

**Cleanup:** Confirm the temporary tab is closed and close the browser page created for this
scenario, if any. Never close or modify the original or a pinned tab.

## Gate G.9: Execute renderer code and read its result

**Request:** "Using the renderer scripting path, run code that logs `gate` and returns 42; tell me
the returned value and captured log. Do not change a page or the filesystem."

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `execute_script` (1).

**Expected paths:** Bare overview → `script.$help` → `script.execute("console.log('gate'); 6 * 7")`.
The agent must use the renderer path, not `main.script.execute`.

**On-screen outcome:** No page or filesystem state changes; the call result contains `text: "42"`,
`isError: false`, and a captured `consoleLogs` entry.

**Verify through `call`:** Read the returned result shape and confirm the log and value; no source,
page, or process side effect is accepted as a substitute.

**Cleanup:** If a temporary page was created to make the renderer context available, close it by
id. The prescribed code should create no page, file, or process; verify that it did not.

## Gate G.10: Answer a documentation question with no guide tool

**Request:** "How can I show the user a CSV table and a progress bar without creating a page, and
how do I know when an inline question has been answered?"

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Deleted-tool coverage:** `read_guide` (1).

**Expected paths:** Bare overview → `pages` → `pages.logView.$help` (or `helpSearch("Log View")`
→ answer from the `push()` and `dialogResult()` contracts. The agent must not call `read_guide` or
claim that the guide tool is available.

**On-screen outcome:** No state changes; the answer identifies Log View as the output channel,
`output.grid`/`output.progress`, immediate `dialogIds`, and `dialogResult`'s unresolved/resolved
statuses.

**Verify through `call`:** The transcript proves the answer came from the overview, a node's
`$help`, or `helpSearch`, and the wording matches live `LogViewEditorFacade` help.

**Cleanup:** None; this scenario is read-only and must not create a page or write to disk.
