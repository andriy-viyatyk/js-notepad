# MCP Test: Browser Automation

Tests for the `browser_*` tools and the `browser` guide — targeting, snapshots, refs,
waiting, evaluation. These tests exercise the documentation added for explicit `pageId`
targeting, so the key thing to watch is **whether the agent captures and reuses `pageId`**.

---

## Test 5.1: Open URL and read the page (pageId round-trip)
**Preparation:** Make a board or non-browser page active (so an untargeted snapshot would miss)
**Request:** "Open example.com in the built-in browser and tell me the main heading of the page"
**Expected:** open_url called; agent takes `pageId` from the result and passes it to browser_snapshot (or reads the snapshot returned by open-side tools); reports "Example Domain"
**Verify:** Correct heading reported; agent did not snapshot a different page

## Test 5.2: Click a link by ref
**Preparation:** example.com open (from 5.1)
**Request:** "On the example.com page, click the 'More information' link and tell me where it leads"
**Expected:** browser_snapshot to find the link's ref, browser_click with that ref (click returns the new page's snapshot), reports iana.org content
**Verify:** Agent lands on iana.org and reports it; no unnecessary extra snapshot after the click

## Test 5.3: Evaluate JavaScript in the page
**Request:** "Using the browser page, run JavaScript to get the document title and the number of links on the page"
**Expected:** browser_evaluate with a function/expression; returns title + link count
**Verify:** Values are plausible for the open page

## Test 5.4: Wait for dynamic content
**Request:** "Navigate the browser to https://httpbin.org/delay/3 and wait until the response body appears, then summarize it"
**Expected:** browser_navigate, then browser_wait_for (text or selector mode) rather than immediately reporting a blank page
**Verify:** Agent reports the JSON body, not an empty/loading page

## Test 5.5: Snapshot vs screenshot honesty
**Request:** "Take a screenshot of the current browser page and describe what is visually there"
**Expected:** browser_take_screenshot (not just a snapshot); description matches pixels
**Verify:** Description matches what the page actually shows

## Test 5.6: Drive the app window
**Request:** "Look at the persephone application window itself and tell me which tabs are open"
**Expected:** browser_snapshot with pageId: "app"; reads tab titles from the app chrome
**Verify:** Reported tabs match list_pages titles

## Test 5.7: Stale ref recovery
**Preparation:** example.com open
**Request:** "Click the 'More information' link, go back, then click it again"
**Expected:** After browser_navigate_back the old ref may be stale — the agent re-snapshots (or uses the snapshot returned by navigate_back) and clicks a fresh ref instead of failing on the stale one
**Verify:** Second click succeeds; if a stale-ref error occurred, agent recovered per the error's instruction ("Re-take the snapshot")
