# QA run — EPIC-089 browser surfaces, Haiku with `call` only

**Date:** 2026-09-06
**Model / harness:** `mcp-test-agent-call` — Haiku, `call` as its only tool, no guides, no prior
knowledge of Persephone.
**Scope:** the acceptance gate for EPIC-089 (roadmap principle 3).

## The task given

> Open https://example.com in Persephone's built-in browser. Read the page and tell me its main
> heading. Then click the 'More information' link on that page and tell me where it took you.
> Finally, look at the Persephone application window itself and tell me the titles of the tabs that
> are open.

The link name was deliberately slightly wrong — example.com's link reads "Learn more" — to see
whether the agent would notice or confabulate.

## Result: pass

All three parts answered correctly in 13 calls, with **one recoverable wrong turn**. The agent
reported the heading ("Example Domain"), navigated to IANA and reported it, listed all six tab
titles, and explicitly flagged the link-name discrepancy rather than pretending the requested link
existed.

## The path it took

| # | Path | Outcome |
|---|---|---|
| 1 | `""` | root |
| 2 | `shell` | found `openExternal()` — OS browser, not the built-in one; backed out |
| 3 | `helpSearch("browser")` | **decisive** — surfaced `pages.openUrlInBrowserTab()` |
| 4 | `pages.openUrlInBrowserTab("https://example.com")` | page id |
| 5 | `pages[0].editor.waitForNavigation()` | **wrong turn** — `pages[0]` is a pinned video page |
| 6 | `pages["<id>"].editor` | recovered using the returned id |
| 7 | `…editor.snapshot()` | heading and link read |
| 8 | `…editor.evaluate(<query all anchors>)` | **avoidable** — see finding 1 |
| 9 | `…editor.click("a")` | clicked by CSS selector |
| 10 | `…editor.waitForNavigation()` | waited |
| 11-12 | `…editor`, `…editor.snapshot()` | confirmed IANA |
| 13 | `pages` | listed the six tabs |

## Findings

### 1. It had refs and did not use them — acted on

The agent snapshotted (call 7), then spent a **separate `evaluate()` call** (call 8) running DOM
JavaScript to find the link's `href`, and finally clicked with the CSS selector `"a"`. The refs it
needed were in the snapshot it had just read, and `click`'s summary already said it accepts
`{ ref: string }`.

So the capability was discoverable and was still not reached. A weak model falls back on the CSS
selector it already knows, and pays an extra call plus arbitrary page JavaScript to do it. The
`snapshot` summary was reworded to close the gap at the point of use: it now says every line carries
a `[ref=e12]` that `click`/`hover`/`type`/`select` accept directly, and that **`evaluate()` and a
hand-written selector are not needed to reach something already visible in the snapshot**. Naming the
wrong path is what the previous wording lacked — it advertised refs without saying what they replace.

This is worth re-testing at EPIC-090, since it is a wording change and only a fresh weak-model run
proves it landed.

### 2. `pages[0]` after being handed a page id — not acted on

Call 5 indexed `pages[0]` immediately after call 4 returned a page id, and got a video editor. The
error named the type and the agent recovered in one call using the id it already had.

The information was already in two places: `pages`' help states that pages are indexed by position
**or** by id and that positions move, and `openUrlInBrowserTab`'s summary spells `pages[pageId]`
literally. The agent reached neither because it went straight from `helpSearch` to the call. No
change made: the guidance exists, the error message is clear, and the recovery cost one call. The
agent's own suggested fix — a hint that `pages` takes both index forms — is already the first line of
that node's help.

### 3. It never looked for a setting to enable — the US-1339 check

Nothing in the transcript hunts for a toggle, asks the user to enable browser interaction, or hits a
"Browser interaction is disabled" error. `qa/surfaces/editors/browser.md` test W.12 passes.

### 4. It chose `pages` over the window snapshot for tab titles — correct, not a miss

Asked to "look at the Persephone application window itself", the agent answered from `pages` rather
than `window.screen.snapshot()`. That is the better answer for tab titles, and it is what the
surfaces are meant to do: the curated, structured node wins when it covers the question, and the
whole-window snapshot is the fallback for what no descriptor reaches. The app-window host was
verified separately during US-1337 (privacy refusal in both directions, and multi-window targeting).

### 5. It did not confabulate the misnamed link

Told to click "More information", it reported that example.com has only "Learn more", clicked that,
and said so. Worth recording because a silent substitution would have been the more dangerous
outcome.

## Consequence

The gate is met. The fifteen tools EPIC-089 covers — the fourteen `browser_*` tools and `open_url` —
are marked retirable in the roadmap, with the two `open_url` return-shape deviations recorded
(US-1338). Nothing is deleted; deletion stays EPIC-090's.
