# Browser automation through `call`

Use the `call` paths below for browser pages, trusted boards, and Persephone's own window. The
browser member and wait contract is already discoverable from `pages[i].editor.$help`; this
resource keeps the detailed host, ref, and error reference.

## The paths

### Browser page

Open or reuse a web page, or submit a search query, with:

```js
const pageId = await pages.openUrlInBrowserTab(url, options);
```

The result contains the page id. Target that page as `pages[pageId]` (or use a stable index when
appropriate); the browser surface is `pages[i].editor`:

```js
await pages[i].editor.waitFor({ selector: "main" }); // wait for content you expect
await pages[i].editor.snapshot();
await pages[i].editor.click({ ref: "e12" });
await pages[i].editor.hover({ ref: "e12" });
await pages[i].editor.type({ ref: "e12" }, "text");
await pages[i].editor.select({ ref: "e12" }, "option-value");
await pages[i].editor.pressKey("Enter");
await pages[i].editor.evaluate("document.title");
await pages[i].editor.waitFor({ text: "Done" });
await pages[i].editor.screenshot();
await pages[i].editor.networkRequests();
pages[i].editor.navigate(url);
pages[i].editor.back();
pages[i].editor.forward();
pages[i].editor.reload();
pages[i].editor.tabs;
pages[i].editor.addTab(url);
pages[i].editor.closeTab();
pages[i].editor.switchTab(tabId);
```

`click`, `hover`, `type`, and `select` take either a CSS selector string or an explicit locator
object such as `{ ref: "e12" }`. `type` clears and replaces the value; its options can request
slow typing or submission. The other methods accept their documented options, including `tabId`
for an inner browser tab. `waitFor` accepts exactly one of `selector`, `text`, `textGone`, or
`time`, with an optional `timeout`. Inspect `pages[i].editor.$help` for the live navigation-wait
contract.

`pages.openUrlInBrowserTab` returns its page id before the document is ready; wait for expected
content with `waitFor({ selector })` or `waitFor({ text })` before the first page action.

### Board page

A trusted board uses the same automation members on `pages[i].editor`:

```js
await pages[i].editor.snapshot();
await pages[i].editor.click({ ref: "e12" });
await pages[i].editor.hover({ ref: "e12" });
await pages[i].editor.type({ ref: "e12" }, "text");
await pages[i].editor.select({ ref: "e12" }, "option-value");
await pages[i].editor.pressKey("Enter");
await pages[i].editor.evaluate("document.title");
await pages[i].editor.waitFor({ selector: "#result" });
await pages[i].editor.screenshot();
await pages[i].editor.networkRequests();
pages[i].editor.reload();
pages[i].editor.tabs;
pages[i].editor.switchTab("board-secondary:<viewId>");
```

Board `tabs` lists the main frame and secondary-view frames. Pass a returned
`board-secondary:<viewId>` id to `switchTab` to address that frame; the board opens the view and
waits for it to be ready. Boards do not navigate, and they do not add or close frames. `reload()`
is the board-refresh operation. A board's snapshot can include invisible elements, so use
`screenshot()` when visual rendering matters.

### Persephone's own window

The complete app-window surface is `window.screen`:

```js
await window.screen.snapshot();
await window.screen.click({ ref: "e12" });
await window.screen.hover({ ref: "e12" });
await window.screen.type({ ref: "e12" }, "text");
await window.screen.select({ ref: "e12" }, "option-value");
await window.screen.pressKey("Escape");
await window.screen.evaluate("document.title");
await window.screen.waitFor({ selector: '[data-name="page-tabs"]' });
await window.screen.screenshot();
await window.screen.networkRequests();
```

For another window, use the same members below its window node:

```js
await windows[i].window.screen.snapshot();
await windows[i].window.screen.click({ ref: "e12" });
await windows[i].window.screen.hover({ ref: "e12" });
await windows[i].window.screen.type({ ref: "e12" }, "text");
await windows[i].window.screen.select({ ref: "e12" }, "option-value");
await windows[i].window.screen.pressKey("Escape");
await windows[i].window.screen.evaluate("document.title");
await windows[i].window.screen.waitFor({ selector: '[data-name="page-tabs"]' });
await windows[i].window.screen.screenshot();
await windows[i].window.screen.networkRequests();
```

`window.screen` has no browser navigation or tab-management members. Use `pages` and page
members to open or switch Persephone pages. Its snapshot contains the shell and the active page's
content only. `ui.elements` is the curated shell inventory with purpose lines; use
`window.screen.snapshot()` for controls and editor content not covered there. The HTML preview is
inside this app window, so it is reached through `window.screen`, not a fourth automation host.

## Opening pages

Use `pages.openUrlInBrowserTab(url, options)` for a web URL or search query. Use
`pages.openUrl(url, options)` when the URL names a file: the content pipeline chooses the editor,
such as Markdown Preview for a Markdown file. Each opener has its own help describing the other;
do not use the browser opener when the file should be routed to an editor.

Capture the id returned by `openUrlInBrowserTab` and target `pages[pageId]`. Page positions can
move, and the id is returned before loading finishes. The browser editor's `mcpHint` points to
this opener and then to `pages[i].editor`.

## Snapshots and refs

`snapshot()` returns a YAML-like accessibility tree with roles, names, and state markers such as
checked, expanded/collapsed, required, disabled, and heading level. A modal or overlay may add a
hint line at the beginning. Invisible elements can still be present in the tree, so use
`screenshot()` to verify visual rendering. A line such as:

```text
- link "Learn more" [ref=e12]
```

gives a usable address: pass it straight back as `{ ref: "e12" }` to `click`, `hover`, `type`, or
`select`. This is the cheapest way to act on anything visible in the snapshot. Do not spend an
`evaluate()` call finding its href or invent a hand-written selector for it. A plain string is
always a CSS selector; it is never guessed to be a ref.

Refs identify live DOM nodes, not positions in a snapshot. Main-frame refs survive further
snapshots, scrolling, and unrelated DOM changes while the element remains in the DOM. A ref dies
when its element is removed or the document navigates; take a fresh snapshot then. A text-line
(StaticText) ref is coerced to its parent element for actions.

Iframe content is merged under its iframe line and uses refs such as `f1-e456`. Those refs are
valid only from the most recent snapshot because frame-index mappings are rebuilt on each
snapshot; re-snapshot after frames mount or unmount. Ref stores are scoped to the host that
minted them, so a browser-page ref cannot act on a board or app-window host.

Selectors reach the main frame. Use a frame ref for an element shown inside an iframe. Browser
pages have no Persephone highlight overlay; if a page element must be pointed out, an ordinary
outline set by `evaluate()` is the page's own temporary style, not an app highlight. Boards and
the app window can use the UI highlight facilities.

## Navigation, input, and privacy

Navigation, opener readiness, and the two-phase wait behavior are owned by the existing browser
members; inspect `pages[i].editor.$help` and the `waitForNavigation` member summary before acting.

For browser and board inputs, use `type` for ordinary fields; it clears the old value and
dispatches the input/change events needed by frameworks. In the app window, prefer
  assigning `value` to `pages[i].content` or using `script.execute` for editor content, especially Monaco. Use
`window.screen.type` for simple dialogs, search boxes, and settings fields.

Private browser pages opened by the user, including incognito and Tor pages, are refused by the
browser host and by `window.screen` while that page is active. A private page opened by the agent
remains available to that agent. The privacy guard is unchanged.

## Common errors

| Symptom | Meaning | Recovery |
|---|---|---|
| Page id not found | The page was closed or the id is stale | Read `pages` and target a current id |
| Page is not an automatable page | The page is text/grid/another non-host editor | Use its editor facade or `window.screen` |
| Ref is stale or cannot be resolved | The node left the DOM, or a frame ref is old/foreign | Snapshot the same host again and use a fresh ref |
| Element not found | Selector matched nothing | Check the snapshot; use a frame ref for iframe content |
| Wait timed out | The condition did not arrive | Check the condition or increase `timeout` |
| Private page refused | The active page is a user-opened incognito/Tor page | Activate a normal page; agent-opened private pages retain provenance access |
| Snapshot looks right but UI is broken | Accessibility includes invisible elements | Use `screenshot()` |
| Snapshot shows another page | A mutable active page changed between calls | Keep and use the returned page id |
