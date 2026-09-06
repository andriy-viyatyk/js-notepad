# Surface QA: browser — the three automation hosts

Manual scenarios for the automation surface. Run through `call` only; do not add or run automated
tests or a test harness for these surfaces. Leave pinned tabs untouched and close only pages the
scenario created. **Use only public, harmless pages** (`https://example.com`) or local scratch HTML
— never log into anything.

Landed by EPIC-089 (US-1334 to US-1339).

This file covers one surface with **three hosts**: a browser page (`pages[i].editor`), a board page
(`pages[i].editor`), and Persephone's own window (`window.screen`). They share a member set by
construction, so most scenarios below should be run against at least two of them; a discrepancy
between hosts is a regression even when each host answers plausibly on its own.

## Test W.1: The snapshot's refs are usable from the node that produced them

**Preparation:** open `https://example.com` with `pages.openUrlInBrowserTab`.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages[id].editor.snapshot()`, then click the "More information" link **by ref** —
`pages[id].editor.click({ ref: "<the link's ref>" })`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The click lands. This is the scenario the epic exists for: before it, `snapshot()`
returned refs and no member on the facade accepted one, so an agent had to reverse-engineer a CSS
selector for a node the snapshot had described by role and name.

**The failure to watch for is the agent not trying a ref at all.** If it reads the snapshot and then
invents `a[href*="iana"]`, the descriptor did not tell it that refs are passable — that is a wording
defect in `snapshot`'s summary, not an agent mistake.

## Test W.2: A plain string is a selector, always

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages[id].editor.click("e15")` where `e15` is a real ref on the page.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** It fails with `Element not found: e15` — it looked for an `<e15>` element. It must **not**
be interpreted as a ref. Then `click({ ref: 42 })` and `click(null)`: both throw a message naming
**both** valid forms.

The point is that no input is guessed. A heuristic that promoted ref-looking strings would be
convenient until the day a page has a `<e15>` custom element, and silent misinterpretation is the
failure class this roadmap exists to remove.

## Test W.3: A stale or foreign ref fails closed, and says how to recover

**Preparation:** snapshot a page, then navigate it elsewhere.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Use one of the first snapshot's refs.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The error says the ref is stale and to re-take the snapshot. It does **not** act on
whatever now occupies that position, and it does not surface as a raw
`Error invoking remote method 'browser:cdp-send'` string.

Repeat across hosts: take a ref from a **board** frame and use it on the **browser** page. The
answer must name the different-document case specifically. Refs are per host — that is what
US-1334 built — and a ref crossing hosts is the case that used to act on the wrong document.

## Test W.4: The address bar is not in the page snapshot

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages[id].editor.snapshot()` on a browser page, then `pages[id].editor.elements`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The snapshot contains the **web page** and none of Persephone's chrome. `elements`
contains the chrome — `url-input`, `toolbar-back`, `toolbar-reload`, `tabs-panel-host` and the rest
— with a purpose line each and a live `visible`. `$help` states the split.

**This is a comprehension test as much as a state test.** Ask the agent to "type a new URL into the
address bar". An agent that snapshots and reports no address bar exists has been misled; it should
reach `elements`/`highlight` for chrome, or `navigate()` for the actual intent.

## Test W.5: `visible` tells the truth about a conditional control

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages[id].editor.elements` on a **non-Tor** browser page.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** `toolbar-tor-info` is present with `visible: false`, and `popup-blocked-bar` is present
with `visible: false`. A declared-but-absent control and a control that does not exist are different
answers, and the agent needs the former.

This test earns its place: on its first live run it reported `toolbar-tor-info` as **visible** on a
non-Tor page, and the element list was right — the button really was rendered on every browser page,
because `IconButtonView` dropped the `hidden` prop on update (fixed as US-1341). Re-running this
file after an unrelated UIKit change is a functional test of that.

## Test W.6: The board host answers the same members, through its readiness gate

**Preparation:** a trusted board with at least one secondary view (the repo's Demo board has two).

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages[id].editor.tabs`, then `snapshot({ tabId: "board-secondary:<viewId>" })` **without**
switching to it first.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The tabs list names the main frame and each secondary view. The snapshot returns that
view's real content — expanding its panel if it was collapsed. It must **not** return an empty
string: a loaded-but-hidden frame answers CDP with an empty accessibility tree, and reporting that
as success is a silent empty (fixed in US-1336).

Also verify navigation is **absent** from the board facade's member list rather than present and
throwing, and that `reload()` is still there — it is the `board_refresh` replacement from EPIC-088
and must not have been shadowed by the shared automation set.

## Test W.7: Persephone's own window, and the curated/complete pair

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `window.screen.snapshot()`, then `ui.elements`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The snapshot carries the shell — Menu, the tab strip, Minimize/Maximize/Close — plus the
**active** page's content and no other page's. `ui.elements` carries the curated shell controls with
purpose lines. Each one's `$help` names the other and says when to prefer it.

Then ask the agent where a control it has never been told about lives — a dialog button, an editor
toolbar with no `elements` list. It should reach `window.screen.snapshot()` as the fallback. That is
the whole reason the app-window host is not optional.

Verify too that `navigate` and tab members are **absent** from `window.screen`, and that its `$help`
points at `pages` / `pages.showPage` for opening and switching Persephone pages instead.

## Test W.8: The app window refuses while a private page is active

**Preparation:** a Tor or incognito browser page that **the user** opened, made active.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `window.screen.snapshot()`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Refused, naming the boundary and telling the agent to activate a non-private page. Then
activate a normal page and call again: it works. The check is live per call — no reload is involved.

Then read `window.screen` on its own. It must return host identity only. **A page title in that
summary is a defect**, not a nicety: the resolver's walk ends before a node's own `restricted()`
runs when the node itself is the last segment, so anything in the summary sits outside the gate.

An **inactive** private page must not trigger the refusal — it is `display: none`, so it is not in
the snapshot.

## Test W.9: Screenshots come back as pictures

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages[id].editor.screenshot()`, and `window.screen.screenshot()`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The answer is metadata plus a real image block the agent can **see** — not base64 inside
JSON. A truncated base64 string means the `call` result mapper regressed, and `browser_take_screenshot`
would then be strictly better than its replacement.

## Test W.10: `openUrl` versus `openUrlInBrowserTab`

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages.openUrl("file:///<path>/README.md")`, then `pages.openUrlInBrowserTab` with the same
URL.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The first lands in `md-view` — the content pipeline chose the editor. The second lands in
a browser tab. Each member's `$help` names the other in one line, because this is the only choice an
agent can get wrong here.

Then `pages.openUrlInBrowserTab("   ")`: throws. And a **search query** rather than a URL: accepted,
and searched — the browser takes search text by design and the tool it replaces forwarded anything
through, so a stricter replacement would be a regression.

## Test W.11: The page id comes back before the page is loaded

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages.openUrlInBrowserTab(url)`, then immediately `type(...)` into a field on that page.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The member's help warned you: it says the returned page is not necessarily loaded and to
`waitForNavigation()` or `waitFor({ selector })` first. Without the wait, the action can land on a
document that is about to be replaced and **report success** while the field ends up empty — observed
live. With the wait, it holds.

This scenario is about the help text, not the code. If an agent hits the race, the sentence that was
supposed to prevent it is not doing its job.

## Test W.12: No enablement step remains

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Ask the agent to drive the built-in browser, from a cold session, with `call` only.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** It never looks for a setting to turn on. `mcp.browser-tools.enabled` is gone (US-1339),
and no guide, hint or `$help` mentions enabling browser interaction. An agent that asks the user to
enable something is reading stale documentation.

Verify separately that the privacy guard is unaffected: the user's own private pages are still
refused, and an agent-opened private page is still readable by that agent. The setting was never
what protected those.

## Test W.13: A password is never in a snapshot

**Preparation:** a local scratch HTML file with a password input and an ordinary text input.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `type` into both, then `snapshot()`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Neither field's **value** appears. The snapshot carries role, accessible name and ref
only — verified live for both field kinds. `evaluate()` and `getValue()` can still read them, which
is the existing-surface case (EPIC-087 decision 7): the rule is that no member *accepts* a secret and
none invents new exposure, not that page content becomes unreadable.
