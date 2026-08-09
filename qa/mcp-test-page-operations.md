# MCP Test: Page Operations

Tests for reading, listing, and updating pages via MCP.

---

## Test 4.1: List pages
**Request:** "What pages are currently open in the notepad?"
**Expected:** list_pages called, returns page list with titles and metadata
**Verify:** Matches actual open tabs

## Test 4.2: Get active page
**Request:** "What is the content of the currently active page?"
**Expected:** get_active_page called, returns content and metadata
**Verify:** Content matches what's visible in notepad

## Test 4.3: Read specific page by ID
**Preparation:** Have multiple pages open
**Request:** "Read the content of the page titled '[specific title]'"
**Expected:** list_pages to find ID, then get_page_content with that ID
**Verify:** Correct page content returned

## Test 4.4: Update page content
**Preparation:** Create a page with "Hello World"
**Request:** "Change the content of the current page to 'Updated by MCP agent'"
**Expected:** set_page_content called with new content
**Verify:** Page content actually changed in notepad

## Test 4.5: Multi-window discovery
**Preparation:** Have two windows open
**Request:** "How many windows are open? List pages in each window"
**Expected:** list_windows called, shows both windows with their pages
**Verify:** Both windows reported correctly

## Test 4.6: Open URL in browser
**Request:** "Open github.com in the notepad's built-in browser"
**Expected:** open_url called with "https://github.com"
**Verify:** Browser page opens with GitHub

## Test 4.7: Open URL in incognito
**Request:** "Open example.com in incognito mode in the browser"
**Expected:** open_url with url and incognito: true
**Verify:** Incognito browser page opens

## Test 4.8: App info
**Request:** "What version of persephone is running?"
**Expected:** get_app_info called, version returned
**Verify:** Version matches actual app version

## Test 4.9: Create and then read back
**Request:** "Create a page with the text 'test content 123', then read it back to confirm"
**Expected:** create_page, then get_page_content with returned ID
**Verify:** Content matches what was written

## Test 4.10: Update structured content
**Preparation:** Create a grid-json page with some data
**Request:** "Read the grid page content and add a new row"
**Expected:** Agent reads content, parses JSON, adds row, calls set_page_content — OR uses execute_script with grid facade
**Verify:** New row appears in grid

## Test 4.11: open_url returns pageId — explicit targeting
**Preparation:** Have a board page open AND ACTIVE (so the untargeted browser fallback would hit the board)
**Request:** "Open example.com in the built-in browser and tell me the page's heading text"
**Expected:** open_url called; agent captures `pageId` from the result and passes it to browser_snapshot — does NOT rely on an untargeted snapshot
**Verify:** Agent reports "Example Domain" (the heading of example.com), not board content

## Test 4.12: Overview guide as entry point
**Request:** "You've never used persephone before. Figure out what it can do and summarize it in 5 bullet points"
**Expected:** Agent calls read_guide("overview") (listed first in read_guide's description) rather than trial-and-erroring tools
**Verify:** Summary mentions pages/editors, browser, boards, tools, ui_push — the overview's mental model

## Test 4.13: Graph format single source of truth
**Request:** "Create a force-graph page showing 3 services behind a load balancer, grouped into a 'backend' group node"
**Expected:** Agent reads read_guide("graph") — the pages guide no longer carries the full format; `isGroup` and group-membership links exist only in the graph guide
**Verify:** Content uses `isGroup: true` + links from the group to members; editor renders without errors

## Test 4.14: Broken structured content is verifiable
**Request:** "Create a notebook page with one note, then verify it actually renders correctly"
**Expected:** Agent creates the page, then verifies rendering (browser_snapshot with pageId "app", per the guides' Errors & verification sections) — not just get_page_content echo
**Verify:** Agent's verification method can actually distinguish a rendered notebook from an 'Editor crashed' page
