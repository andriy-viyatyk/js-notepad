# Browser Automation — the `browser_*` tools in depth

The `browser_*` tools follow the Playwright MCP convention: snapshot the page, act on elements
by `ref`, get a fresh snapshot back. They drive three kinds of target:

1. **Browser pages** (`browser-view`) — real web pages in the built-in browser.
2. **Board pages** (`board-view`) — your sandboxed mini web-apps (see `read_guide("boards")`).
3. **The app window** — Persephone's own UI, via the explicit `pageId: "app"` sentinel.

All `browser_*` tools are gated by a setting: if browser interaction is disabled you get
`Browser interaction is disabled. Enable it in Settings → MCP Server → 'Enable browser
interaction'.` — ask the user to enable it; there is no way around it.

## Page targeting resolution

Every `browser_*` tool resolves its target page with this exact precedence:

| # | Input | Resolves to |
|---|-------|-------------|
| 0 | `pageId: "app"` | Persephone's own main window. **Explicit only** — no fallback ever lands here. |
| 1 | `pageId` | Exactly that page. Error if not found, or if it is not a browser/board page. |
| 2 | `profileName` (no pageId) | Browser pages only: the active page if it has that profile, else the first page with it. `""` = default profile. Never matches incognito/Tor. Error if none. |
| 3 | neither | The **active** page if it is a browser **or board** page; else the **first browser page**; else the **first board page**; else an error. |

After resolution the page is **activated** (shown) — the webview must be visible for
focus/input to work. Incognito and Tor pages are refused after resolution, for privacy.

Two consequences worth internalizing:

- **A board can win the untargeted fallback.** If the active page is a board, `browser_snapshot`
  with no `pageId` snapshots the board — not your web page. This is by design (rule 3).
- **The active page is shared, mutable state.** The user — or a second agent connected to the
  same Persephone — can switch tabs between your calls. Always pass `pageId` when you care
  which page you hit; `open_url`, `open_board`, and `list_pages` all give you one.

Profiles (isolated cookie/login sessions) are described in `read_guide("pages")` — discover
them with `get_app_info` → `browserProfiles`.

## Snapshots

`browser_snapshot` returns the page's **accessibility tree** as indented YAML-like lines:

```
- button "Submit" [ref=e123]
- textbox "Search..." [ref=e88]: "current value"
- checkbox "Enable" [checked] [ref=e201]
- heading "Results" [level=2] [ref=e300]
```

- Roles come from the accessibility tree; non-semantic wrappers (`generic`, `none`) are
  skipped, so the tree is much flatter than the DOM.
- State markers: `[checked]`, `[expanded]`/`[collapsed]`, `[required]`, `[disabled]`,
  `[level=N]`. Inputs show their current value after a colon.
- **Iframes are merged in**: same-process iframe content appears indented under its
  `- Iframe` line, with frame-scoped refs (`f1-e456`).
- If a modal/overlay likely blocks interaction, the snapshot is prefixed with a hint line:
  `# Modal dialog detected: …` or `# Overlay detected: …` — handle it first.
- **Invisible elements are included.** The accessibility tree contains zero-height or
  display-overridden elements, so a snapshot can look right while the render is broken. To
  verify *visuals*, use `browser_take_screenshot`.

## Refs and their lifecycle

A ref identifies an element: `e123` in the main frame, `f1-e456` in iframe #1. The number is
the element's Chrome DevTools backend node id — it names the **live DOM node**, not a position
in the last snapshot. That gives refs simple lifetime rules:

- A **main-frame ref stays valid as long as its element stays in the DOM** — across further
  snapshots, scrolling, and unrelated DOM changes. You do NOT need to re-snapshot just because
  you took another action.
- A ref **dies** when its element is removed or the page navigates (the document is destroyed).
  Using it then returns: `Ref "eN" is stale — the element is no longer in the DOM. Re-take the
  snapshot.` — do exactly that.
- **Iframe refs (`fN-e…`) are weaker**: the frame-index → session mapping is rebuilt on each
  snapshot, so only use iframe refs from the **most recent** snapshot, and re-snapshot if
  iframes may have mounted/unmounted (frame indexes can shift).
- A ref on a text line (StaticText) is automatically coerced to its parent element for
  actions, so clicking "the text of a row" clicks the row.

Most interaction tools also accept a CSS `selector` instead of a `ref` — useful when you know
the markup (e.g. your own board): `browser_click({ pageId, selector: "#save-btn" })`.

## Every action returns a fresh snapshot

`browser_click`, `browser_type`, `browser_hover`, `browser_select_option`,
`browser_press_key`, `browser_navigate`, `browser_navigate_back`, and `browser_wait_for` all
return the post-action snapshot as their result. **Do not call `browser_snapshot` right after
an action** — you already have the updated tree.

## Navigation and waiting

- `browser_navigate` waits internally: up to 2 s for navigation to start, then up to 10 s for
  `document.readyState === "complete"`. It never throws on slow pages — it returns the
  snapshot of whatever state was reached, so check the snapshot content.
- `browser_wait_for` covers dynamic content, with four modes (first match wins):
  - `{ time: 2.5 }` — sleep N **seconds** (Playwright-style), then snapshot.
  - `{ selector: ".results" }` — until the CSS selector matches.
  - `{ text: "Done" }` — until the text appears anywhere on the page.
  - `{ textGone: "Loading…" }` — until the text disappears.
  - `timeout` (ms, default 30000) applies to the selector/text/textGone modes; on expiry you
    get an error like `Timeout waiting for selector: …` — the page is likely still loading or
    the condition is wrong.

## Evaluate

`browser_evaluate` runs JavaScript in the page and returns the value:

- `{ function: "() => document.title" }` — Playwright style; function expressions are
  auto-invoked.
- `{ expression: "document.title" }` — evaluated as-is (an arrow function here returns the
  function, not its result — auto-invoke applies only to the `function` parameter).
- Exceptions in the page surface as tool errors with the page-side message.

## Tabs, screenshots, network

- `browser_tabs { action: "list" | "new" | "close" | "select", index?, url? }` operates on the
  **inner tabs** of the resolved browser page. `select` activates by index from `list`. On a
  **board** page, "tabs" are the board's frames (main + secondary views) — see
  `read_guide("boards")`; `new`/`close` throw there, and boards never navigate.
- `browser_take_screenshot` returns a PNG of the current viewport (no full-page or per-element
  options). On a selected board secondary view, the screenshot is clipped to that panel.
- `browser_network_requests` returns the request log of the resolved page's **active tab**.

## Driving Persephone's own UI (`pageId: "app"`)

Snapshot/click/type/press_key/screenshot/evaluate work on the app window; navigation and tabs
don't. The snapshot shows app chrome + the **active** page only. Details and examples:
`read_guide("pages")` → "Automating Persephone's Own UI". Two habits: prefer
`set_page_content`/`execute_script` over typing into Monaco, and use it to *verify* editor
state (an editor that failed to render shows its error text right in the app snapshot).

## Errors & verification

| Symptom | Meaning | Fix |
|---|---|---|
| `Browser interaction is disabled…` | The MCP browser-tools setting is off | Ask the user to enable it in Settings → MCP Server |
| `Page not found: <id>` | Stale pageId (page closed) | `list_pages`, re-resolve |
| `Page <id> is not an automatable page…` | pageId points at a text/grid/etc. page | Automate only browser/board pages; for editors use `execute_script` / `set_page_content` |
| `No browser page with profile '…'` | No page of that profile is open | `open_url` with that `profileName` first |
| `No automatable page open…` | No browser or board page at all | `open_url` or `open_board` first |
| `Ref "eN" is stale…` / `Could not resolve ref…` | Element left the DOM (or iframe ref after a newer snapshot) | Re-take the snapshot, use fresh refs |
| `Element not found: <selector>` | CSS selector matched nothing | Check the snapshot; the element may be in an iframe (selectors only reach the main frame — use frame refs) |
| `Timeout waiting for …` | `browser_wait_for` condition never became true within `timeout` | Increase `timeout`, or verify the condition against a snapshot |
| Active page is in incognito/Tor mode | Privacy block — these pages are never automatable | Use a normal page (`open_url`) |
| Snapshot looks right but UI is broken | Accessibility tree includes invisible elements | `browser_take_screenshot` to verify visually |
| Snapshot shows a different page than expected | Untargeted call + active page changed (user or concurrent agent) | Always pass `pageId` |
