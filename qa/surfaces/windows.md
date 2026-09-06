# Surface QA: windows

Persephone can hold several windows, open and closed. A **closed** window is not gone — it keeps
its pages in persisted state and can be reopened. That distinction is the whole surface: `windows`
is the one place in the tree where an agent reads state belonging to something that is not on
screen.

`windows` and `windows[i]`'s own members are answered by the **main process**
(`src/main/mcp/ai-vision/main-root.ts`); anything deeper is forwarded to that window's renderer. So
`windows[1].pages[0].content` crosses a process boundary mid-path, and a path with no `windows[i].`
prefix targets the main window.

What to watch: **does the agent distinguish persisted state from live state?** A closed window's
pages are a snapshot; an open window's are the live collection. An agent that reports a closed
window's page content as current has misread the surface, and the descriptor wording is what needs
work.

Test agent: `mcp-test-agent-call` (Haiku, `call` only).

Replaces: `list_windows`, `open_window` (see US-1303's parity audit).

---

## Test W.1: Count and identify the windows
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "How many Persephone windows are there, and what is in each?"
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `windows` for the count, then `windows[i]` per window, reporting status, page count and
active page
**Verify:** matches reality; a closed window is described as closed and reopenable, not as missing

## Test W.2: Read into another window
**Preparation:** two windows open, with a known file open in the second
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "What file is open in the second window?"
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `windows[1].pages` and then the page — the agent prefixes the path rather than
assuming the default window
**Watch for:** an agent that reads `pages` (the main window) and answers confidently about the
wrong window. That is the failure this surface exists to prevent

## Test W.3: A closed window's pages are a snapshot
**Preparation:** a closed window with persisted pages
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "What is in the closed window, and can you read that file's current contents?"
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** lists the persisted page summaries, and is explicit that reading live content needs
`windows[i].open()` first
**Verify:** the agent does not present persisted `title`/`filePath` as live content. Closed-window
pages carry `type` — the persisted classifier — precisely because `editor` may never have been
written for them

## Test W.4: Reopen a window
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "Reopen the closed window."
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `windows[i].open()`; the window appears with its pages restored
**Verify:** `windows[i].status` becomes `"open"` and the page count matches what was reported closed

## Test W.5: focus() refuses a closed window
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "Bring window 1 to the front." — with window 1 closed
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `windows[1].focus()` fails with a message naming `open()` as the fix, and the agent
follows it
**Verify:** the agent uses the error's instruction rather than guessing. `focus()` is deliberately
stricter than the old `open_window`, which silently reopened

## Test W.6: A window index that does not exist
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "What is in window 7?"
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** the resolver reports no such item with the path it resolved up to; the agent reads the
real count from `windows` and corrects itself
**Verify:** no invented window, and no retry loop on the same bad index

---

## Application facts (what `get_app_info` used to answer)

US-1303 redistributed those nine fields rather than rehoming them as a bag: each lives next to the
thing it describes. A test here is really a test of whether an agent can *find* them.

## Test W.7: Find an application fact without being told the path
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** each of — "What version is this?", "What browser profiles are configured?",
"Where is the bundled demo board?", "What is the recommended-components catalog URL?"
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `version` (or the root summary), `settings.browserProfiles`,
`main.runtime.demoBoardDir`, `boards.manifestUrl`
**Verify:** found by discovery — root hints, `$help`, or `helpSearch` — not guessed. An agent that
cannot find one of these means the field is in the wrong place or its summary does not say what it
is for
**Watch for:** a search for an `appInfo` node. There deliberately isn't one; if an agent looks for
it twice, that is a finding about the root hint, not about the agent

---

## Regression checks

Run these directly through `call` — no test agent — after any change to the windows node or the
main/renderer routing:

| Check | Expected |
|---|---|
| `windows` | `count`, and `open` listing the indices actually open |
| `windows[0]` | `index`, `status`, `pageCount`, `activePageId` |
| `windows[0].pages` | the live Pages collection (forwarded to the renderer) |
| a closed `windows[i].pages` | persisted summaries including `type`; no `url` for browser pages, ever |
| `windows[i].focus()` on a closed window | throws, naming `open()` |
| `settings.browserProfiles` | the configured profile names |
| `main.runtime.resourcesDir` / `.demoBoardDir` | real paths; `demoBoardDir` ends `assets/demo-board` |
| `boards.assetsBaseUrl` / `.manifestUrl` | the catalog URLs, manifest ending `manifest.json` |

**A closed window must never expose a browser page's URL.** The persisted node deliberately carries
identity only (`profileName`, `isIncognito`, `isTor`); the live path applies the
`agentMayAccessBrowserPage` privacy rule. If a URL ever appears on the closed-window path, that is a
privacy defect, not a parity improvement.

**Run 2026-09-05 (by hand through `call`, single window): partial.** `windows` reported
`count: 1, open: [0]`; `windows[0]` reported status, page count and active page id correctly, and
all four application-fact paths in W.7 resolved to correct values. W.2-W.6 need a second window and
a closed one, and have not been run — they are written, not verified.
