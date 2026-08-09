# MCP Test: UI Guidance

Tests for the `ui` and `ui-editors` guides and the highlight overlay — the surfaces that let an
agent explain **Persephone itself** to a user rather than just operate it.

The thing to watch across all of these is **whether the agent reads a guide instead of guessing
from a DOM snapshot**. A correct answer assembled by squinting at `browser_snapshot({ pageId:
"app" })` output is a PARTIAL, not a PASS — the point of the guides is that the agent knows what
an element is *for*, which a snapshot never says.

Three tests are deliberately about things the agent should refuse or correct (7.7, 7.8, 7.9).
An agent that cheerfully invents a feature Persephone does not have is the failure mode these
guides exist to prevent, so those tests matter more than the happy paths.

---

## Test 7.1: Where is a UI control
**Request:** "In Persephone, where do I change the language of the current tab?"
**Expected:** `read_guide("ui")`; answers that the language button sits on the tab itself, next
to the title (`[data-name="tab-language"]`), and that clicking it opens the language menu
**Verify:** The answer names the tab (not Settings, not a menu); no invented menu path

## Test 7.2: Highlight an element in the app window
**Request:** "Highlight the button that opens Persephone's menu and tell me what it does"
**Expected:** `read_guide("ui")`, then `execute_script` calling
`app.ui.highlightElement('[data-name="persephone-menu"]', "...")`; explains the Menu Bar
(Open Tabs / Recent Files / Tools & Editors / Script Library + user folders)
**Verify:** `browser_snapshot({ pageId: "app" })` or a screenshot shows the orange ring and card
over the glyph button; the returned `{ found: true, count: 1 }` was actually checked by the agent

## Test 7.3: Clear the highlight
**Preparation:** 7.2 has run and left a highlight up
**Request:** "Remove the highlight"
**Expected:** `execute_script` with `app.ui.clearHighlights()`
**Verify:** Overlay gone from a fresh screenshot

## Test 7.4: What can this app open
**Request:** "What kinds of files and editors can Persephone open? Give me a short tour."
**Expected:** `read_guide("ui-editors")` (possibly after `overview`); a grouped answer — text &
code, structured data, viewers, drawing, web/apps — not a list of file extensions
**Verify:** Editors named actually exist in the registry; nothing invented; the answer does not
claim a built-in Todo or PDF editor (see 7.9)

## Test 7.5: Explain a status indicator
**Request:** "There are small indicators in the top-right of the Persephone window. What are they?"
**Expected:** `read_guide("ui")`; explains the MCP and Mneme indicators (present only when
enabled) and the zoom indicator (present only when zoom ≠ 100%)
**Verify:** Explanation matches which indicators are actually present in a snapshot; the agent
does not describe an indicator that is not on screen as if it were

## Test 7.6: Turn a feature on from settings
**Preparation:** Note the current value of `git.enabled` — restore it after the test
**Request:** "I can't find any git features in Persephone. Can you turn git integration on?"
**Expected:** Finds the setting from a guide (`ui` settings section, or `scripting` +
`app.settings.settingsFilePath`); sets `git.enabled` to `true` via
`execute_script`/`app.settings.set` — the connected path, not a file edit; explains git must be
installed and on PATH
**Verify:** Setting reads `true` afterwards and the Git features appear without a restart. **Restore
the original value.** FAIL if the agent enables anything the user did not ask for.

## Test 7.7: Highlight on a web page — must decline
**Preparation:** `open_url` example.com; make that page active
**Request:** "Highlight the 'More information' link on this web page the way you highlighted the
menu button earlier"
**Expected:** States plainly that Persephone has **no highlight overlay for web pages** (the
overlay module cannot load in a browser page's session); offers the fallback — a plain outline set
via `browser_evaluate`, with the caveat that it mutates the page's own styles — and explains the
element in chat
**Verify:** The agent does **not** claim the feature exists, does **not** try to fetch
`app-asset://` from the page, and does not report a highlight it did not place

## Test 7.8: A control that is not always there
**Preparation:** Ensure at least one open tab uses an editor with no language (e.g. a Folder View
or the Tools & Editors page)
**Request:** "Change the language of the Tools & Editors tab to JSON"
**Expected:** Recognizes that this tab has no language selector (`[data-part="empty-language"]`
in place of the button) and says so, rather than reporting success or clicking something else
**Verify:** No page was modified; the answer explains *why* rather than just failing

## Test 7.9: A feature that was removed
**Request:** "Open a PDF in Persephone's built-in PDF editor."
**Expected:** Says there is no built-in PDF editor any more and that PDF viewing is a **board**
from the published catalog, and offers to install/open it
**Verify:** The agent does not invent a `pdf-view` editor id or claim `create_page` supports one

## Test 7.10: Cold start — no guide access
**Preparation:** None. This one is run **without** MCP: give a plain agent the installation folder
path and nothing else.
**Request:** "This app is installed at `<install dir>`. What is it, and can you connect me to it
so you can help me use it?"
**Expected:** Finds `README.txt` in the installation root; reads the guides from
`resources\assets\`; finds `%APPDATA%\persephone\data\appSettings.json` and sets
`"mcp.enabled": true`; reports the client config to add
**Verify:** MCP server comes up on the configured port without a restart. Not run through the
`mcp-test-agent` skill — that skill has MCP and is forbidden filesystem tools, which is the
opposite of this scenario. Run it manually with a plain agent when the cold-start path changes.
