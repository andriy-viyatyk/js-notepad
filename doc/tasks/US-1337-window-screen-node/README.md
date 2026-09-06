# US-1337 — `window.screen`: Persephone's own window as an automation host, and its privacy rule

**Status:** Planned  
**Epic:** [EPIC-089 — The browser and the app window through `call`](../../epics/EPIC-089.md)  
**Depends on:** [US-1334 — Per-host ref stores and callable automation command bodies](../US-1334-ref-lifecycle/README.md), [US-1335 — The browser page surface](../US-1335-browser-page-surface/README.md), and [US-1336 — The board page host](../US-1336-board-page-automation/README.md)  
**Scope:** Task documentation and the later `window.screen` implementation; no tests, QA file, guide, dashboard edit, or commit

## Goal

Expose Persephone's own renderer window through `window.screen` so `call` can use the same ten
shared automation members and operation bodies already used by browser and board hosts. Preserve
the existing app-window privacy boundary: the node must refuse while the active page is an
incognito or Tor browser, without refusing merely because an inactive private page is open.

## Background

### Binding decisions and existing target

EPIC-089 decision 1 names the node `window.screen`, not `window.ui`. The root already has a `ui`
node whose summary points agents to curated shell controls and `ui.elements`; a second `ui` one
level down would make the first navigation decision ambiguous. `window` already owns this
application window's state, sidebar, zoom, and `menuBar`, so `screen` belongs there. The existing
`window.menuBar` node is the precedent for a live child of that namespace.

`src/renderer/automation/AppTargetModel.ts` already provides the complete `IBrowserTarget`
implementation needed by the new node. It is exported as the module singleton `appTarget`, with
`id === "app"`; its `cdp()` returns a `CdpSession` keyed by `APP_WINDOW_CDP_KEY`; its input path
uses the existing CDP session; and its navigation methods throw `NAV_MSG` while its tab methods
throw `TAB_MSG`. The target fabricates one active `ITargetTab` record for adapter internals, but
the public `window.screen` descriptor must not expose navigation or tab members: the app window
has no browser navigation or browser tabs. Persephone pages are opened and switched through
`pages` and `pages.showPage(...)`.

The shared public member set is already declared once in
`src/renderer/scripting/ai-vision/browser-automation-members.ts`:

```text
snapshot, click, hover, type, select, pressKey, evaluate, waitFor, screenshot, networkRequests
```

The corresponding operation bodies are in
`src/renderer/automation/operations.ts`: `snapshot`, `clickElement`, `hoverElement`,
`typeTextInto`, `selectOption`, `pressKeyOnTarget`, `evaluateInTarget`, `waitFor`,
`takeScreenshot`, and `networkRequests`. They already accept an `IBrowserTarget`, so the screen
node must invoke these functions with `appTarget`, preserving the exact selector/ref, overlay,
input, screenshot, network-log, and wait behavior. The fourteen MCP tool implementations and
their dispatcher remain consumers of those same functions; this task must not create a second
command body.

### `window.menuBar` is a real script-API member

The source confirms that `menuBar` is not an AiVision-only synthetic child:

- `src/renderer/api/types/window.d.ts` declares `IWindow.menuBar: IMenuBar`.
- `src/renderer/api/window.ts` owns `readonly menuBar = new MenuBarModel()` and returns it from
  the live `app.window` object.
- `src/renderer/scripting/ai-vision/namespaces/window.ts` advertises `{ name: "menuBar", node: true }`.
- `src/renderer/scripting/ai-vision/namespaces/index.ts` registers the real
  `appWindow.menuBar` instance with `describeMenuBar`.
- `src/renderer/scripting/api-wrapper/AppWrapper.ts` returns the live `app.window` object, so the
  nested member is also a normal script-API path.

`window.screen` must follow that exact pattern: add a real nested object to `IWindow`/`Window`,
describe it in `src/renderer/scripting/ai-vision/namespaces/window-screen.ts`, advertise it as a
node in `namespaces/window.ts`, and register the live `appWindow.screen` instance in
`namespaces/index.ts`. The descriptor may synthesize only descriptor metadata and its dynamic
privacy gate; it must not synthesize the screen object through `provide()`.

### Existing app-window privacy rule

The current browser-tool check is in `src/renderer/automation/commands.ts:75-117`, inside
`getTarget()` before it returns `appTarget` for the explicit `pageId === "app"` branch. It reads
only `pagesModel.activePage`, narrows that page's editor to `editorId === "browser-view"`, and
then derives the mode as `Tor` when `isTor` is true, otherwise `incognito` when `isIncognito` is
true. If neither is set, it returns `appTarget`. If either is set, it refuses with a message that
names Persephone's own UI, explains that a whole-window app snapshot would expose the private
session, and tells the caller to activate another page using `list_pages` followed by
`execute_script` with `app.pages.showPage(pageId)`.

That check is deliberately active-page-only: it does not scan all pages. The architecture record
in `doc/architecture/browser-editor.md` under **App-Window Target** states why: inactive pages are
mounted but hidden, and Chromium excludes hidden subtrees from the accessibility tree. Therefore
an inactive incognito/Tor page does not trigger the app-window refusal, and the app snapshot
naturally contains the shell plus the active page only.

The shared browser-page privacy predicate is
`src/renderer/editors/browser/agent-access.ts:agentMayAccessBrowserPage`. It permits normal pages
and permits a private page only when `openedByAgent` is true; a private page opened by the user is
refused. `privateBrowserRefusal(state, "call")` supplies the standard remedy for a `call` path.
The existing `PageWrapper.aiVision.restricted()` uses that predicate and refusal for browser-page
paths, but it cannot protect `window.screen`: `window.screen` is a sibling host path, not a child
of a browser `pages[i]` node.

The app-window rule in `getTarget()` is intentionally stricter than that browser-page provenance
rule: it refuses the active page whenever `isIncognito` or `isTor` is set, without granting an
`openedByAgent` exception, because the whole app snapshot still contains the private page. The
new screen descriptor therefore needs its own `restricted: () => this.restricted()` (or an
equivalent dynamic closure), must evaluate the active page on every invocation, and must preserve
that same private-mode check. It must cite `agentMayAccessBrowserPage` as the shared predicate
that governs the adjacent browser-page boundary, while not weakening the app-window check by
using that predicate's `openedByAgent` exception.

The existing `privateBrowserRefusal(state, "call")` is not suitable for this node's final text.
For example, with an incognito state it produces this complete instruction:

```text
This browser page is in incognito mode and was opened by the user. Agent access is disabled for privacy protection; open a normal browser page instead (pages.showBrowserPage / open_url), or open your own private page — pages you open are yours to read.
```

That helper correctly describes browser-page provenance, but its suggestion to open an agent-owned
private page contradicts the stricter whole-window rule. The screen descriptor must therefore use a
dedicated app-window refusal instead:

```text
Persephone's own window cannot be automated while its active page is in incognito mode. Whole-window snapshots and actions would expose that private page. Activate a non-private page with pages.showPage(pageId), then retry.
```

The implementation may keep this dedicated formatter beside the screen descriptor; it must not
concatenate `privateBrowserRefusal` into the screen refusal. The final refusal must name the
app-window boundary, explain the exposure risk, and give only the safe remedy. An agent-owned
private page remains allowed by `agentMayAccessBrowserPage` on its browser-page node, but it is
still refused by this whole-window boundary. A private page that is inactive does not enter the
new refusal branch.

`src/shared/ai-vision/resolver.ts:85-87` gates every hop by calling the current descriptor's
`restricted()` before resolving the next segment. The implementation must keep the privacy lookup
inside the descriptor callback rather than capturing the active page or its mode when
`appWindow.screen` is constructed. Thus `window.screen.snapshot()`, `window.screen.click(...)`,
and every other member are checked against the page active at that call; a page switch between
calls changes the result.

There is one resolver edge case for the node itself: a call whose path ends at
`window.screen` consumes the `screen` segment while `current` is still the `window`, so the
screen descriptor's `restricted()` is not called before the resolver returns
`shapeResult(current)`. The screen descriptor's `summarize()` must therefore expose host identity
only—`{ kind: "WindowScreen" }`, with at most window-level facts already public through
`window`—and must never include active-page content, title, URL, editor id, or privacy state.
This is a deliberate constraint, not a reason to add a second parent-level gate; the terminal
walk otherwise makes a page-bearing summary an information leak.

### `ui.elements` versus the complete screen snapshot

`src/renderer/scripting/ai-vision/namespaces/ui.ts` currently exposes `HEADER_ELEMENTS` through
`createElements(...)`, adds the generated element members, and describes them as curated shell
controls with purpose lines, selectors, live visibility, and highlighting. It does not attempt to
describe the complete DOM. `window.screen` is the complementary fallback: its `snapshot()` is the
complete, purpose-free accessibility tree of the app window and active page.

The `ui` help must cross-reference the new node. The exact wording change is:

```ts
// Before
help: "Use UI methods only when the requested interaction or visible feedback is intended for the user. Use ui.elements to discover curated shell controls, their purpose, selectors, and live visibility. An individual page tab and its controls are owned by pages[i].tab. For Log View output use pages.logView; scripts also have the global ui facade.",

// After
help: "Use UI methods only when the requested interaction or visible feedback is intended for the user. Use ui.elements for curated shell controls with purpose lines, selectors, live visibility, and highlighting; prefer it when you need a named shell control or its purpose. Use window.screen.snapshot() for the complete, purpose-free accessibility tree when you need everything currently on screen, including content or controls not in the curated list. An individual page tab and its controls are owned by pages[i].tab. For Log View output use pages.logView; scripts also have the global ui facade.",
```

The screen help must make the inverse choice explicit: use `ui.elements` for a named, curated
shell control and its purpose; use `window.screen.snapshot()` for complete current accessibility
content or an uncurated control. The screen descriptor must not add an `elements` property of its
own. Shell controls already belong to `ui.elements` (the EPIC-084/085 surface), and each page's
own curated controls belong to that page/editor node. Adding a second shell list under
`window.screen` would duplicate ownership and make agents choose between two lists for the same
control.

### HTML preview and other in-window iframes

`src/renderer/editors/html/HtmlBodyView.ts` creates a sandboxed `srcdoc` iframe (`sandbox="allow-scripts"`)
inside the renderer document. `html-view` is not a fourth `IBrowserTarget` implementation. The
app target's `snapshot()` calls `buildSnapshot()` in `src/renderer/automation/snapshot.ts`, which
discovers iframe targets, attaches to each, formats each accessibility tree with frame-scoped
refs, and merges the result below the iframe placeholder. This means an active HTML preview is
reachable through `window.screen.snapshot()` and its returned `f<n>-e<m>` refs; no fourth HTML
target is needed.

The source-level threshold is exact: `MIN_IFRAME_NODES = 3`, and `buildSnapshot()` skips an iframe
when its AX result is missing or has fewer than three nodes. It also skips a formatted tree that
is empty. A nearly-empty preview iframe can therefore be absent from the merged snapshot even
though the preview is mounted; an agent must not conclude from that absence alone that the HTML
preview is blank. The screen `$help` must state this threshold and consequence.

`src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` already says that its `elements` are
host-chrome only and that those selectors do not cross into the iframe. Its final forward pointer
currently says that EPIC-089 will attach a browser automation surface. Replace that one sentence
with a direct path to the finished host, preserving the source-content distinction:

```ts
// Before
Use the browser automation surface that EPIC-089 will attach to this same page node for DOM inside the preview document. The html property is the source content, not the iframe DOM.

// After
Use window.screen.snapshot() for DOM inside the preview iframe; it merges the preview accessibility tree when Chromium reports at least three AX nodes, while the html property remains the source content rather than the iframe DOM.
```

This is the only HTML facade change in this task. Its existing `elements` remain host-chrome
controls (`text-compare-left`, `text-show-resources`, `html-copy`, and `html-more`).

### Verified boundaries carried forward from US-1335 and US-1336

Do not re-derive the input-value behavior from the snapshot formatter. US-1335's live run typed
both a password sentinel and ordinary plain text, then recorded that `snapshot()` returned no
input field value at all: neither the password value nor the plain-text value appeared. Existing
`evaluate()` and value-reading members can still expose page data; this task adds no new secret
boundary.

Do not re-derive hidden-frame behavior as an HTML-specific rule. US-1336's live run found that a
loaded-but-hidden board frame returned an empty accessibility tree because Chromium omits hidden
subtrees. `doc/architecture/browser-editor.md` records the same mechanism for the app target: the
app snapshot naturally contains only the active page's content. These are the reasons the screen
help must explain both active-page visibility and the three-node iframe threshold rather than
calling an absent subtree an error or a blank preview.

### Attention fallback

`src/renderer/scripting/ai-vision/attention.ts:14` currently advertises the retired tool path when
a blocking dialog is not yet represented by `dialogs`:

```ts
// Before
"A blocking dialog is open, but the dialogs node is not available yet; use browser_snapshot/browser_click on pageId \"app\" to inspect and answer it."
```

It must point at the new tree path and no longer name a tool:

```ts
// After
"A blocking dialog is open, but the dialogs node is not available yet; use window.screen.snapshot() and window.screen.click(...) to inspect and answer it."
```

The fallback is intentionally about the app-window host; the normal dialog attention path remains
`dialogs[i].click(...)`/`dialogs[i].cancel()`.

### Per-host refs and the app-window store

US-1334 changed `src/renderer/automation/ref.ts` from one module-global iframe map to
`frameSessionMaps`, keyed by `CdpSession.registrationKey`. `snapshot.ts` calls
`setFrameSessions(cdp.registrationKey, sessionMap)` after each snapshot. Browser and board hosts
use their own registration keys; `AppTargetModel.cdp()` always constructs a session with the
`APP_WINDOW_CDP_KEY` sentinel from `src/ipc/api-types.ts` (`"__app-window__"`). Consequently,
app-window refs live in the sentinel's own store entry and a browser-page or board snapshot cannot
clobber them.

This matters especially here: a Persephone window contains real iframes, including HTML previews
and board frames. The app snapshot can therefore return frame refs such as `f<n>-e<m>`, and those
refs must resolve through the app-window registration key. The screen methods must pass the same
`appTarget` and optional target tab argument to the shared operations so a ref minted by
`window.screen.snapshot()` is resolved by `window.screen.click({ ref: "..." })` against the same
host-local store. A plain string remains a CSS selector; only `{ ref: string }` is a ref.

### Multi-window routing

The main-process `call` route in `src/main/mcp/tools/call-tools.ts` forwards a deep path such as
`windows[1].window.screen.snapshot()` to window 1's renderer as `window.screen.snapshot()`. The
renderer owns one `appWindow`/screen object per window. In `src/main/mcp/renderer-bridge.ts`, the
selected `windowIndex` determines which renderer `webContents.send(...)` receives the call.

The CDP layer then preserves that selection: `src/main/cdp-service.ts` short-circuits
`APP_WINDOW_CDP_KEY` in `cdpAttach`, `cdpDetach`, and `cdpSend`; for `cdpSend`, it uses
`event.sender` as the webContents and runs the command on that window's top-level session. It does
not look up a global window or use the main window's contents. Therefore
`windows[1].window.screen.snapshot()` must snapshot window 1, not the main window.

## Implementation Plan

### 1. Add the real `IWindow.screen` object and its shared operation wrapper

1. Add `IWindowScreen` to `src/renderer/api/types/window.d.ts`. Import the canonical browser
   locator, screenshot, and network-request types from `browser-editor.d.ts`; define the same
   optional `{ tabId?: string }` option shapes needed by the shared descriptor. Declare only the
   ten shared methods: `snapshot`, `click`, `hover`, `type`, `select`, `pressKey`, `evaluate`,
   `waitFor`, `screenshot`, and `networkRequests`. Do not add `navigate`, `back`, `forward`,
   `reload`, `tabs`, `activeTab`, `addTab`, `closeTab`, or `switchTab` to this public surface.
2. Add `readonly screen: IWindowScreen` to `IWindow`, beside the existing real `menuBar` member.
   Document that it is Persephone's own window and that page opening/switching is done through
   `pages`/`pages.showPage`, not browser navigation/tab methods.
3. Add `src/renderer/api/window-screen.ts` with the live screen object implementation. It must
   delegate every method to `src/renderer/automation/operations.ts` with the existing singleton
   `appTarget`, using `resolveElementLocator` for locator arguments and `ensureTargetReady` before
   CDP-capable operations where the facade pattern does so. Preserve `slowly`, `submit`, wait-mode
   validation, the unavailable-safe screenshot option, and the optional `tabId` forwarding. The
   model must not call `cdp.send`, `buildSnapshot`, `callOnRef`, or the low-level input bodies
   directly.

Before:

```ts
// src/renderer/api/window.ts
export class Window implements IWindow {
    readonly menuBar = new MenuBarModel();
    // existing window state/actions
}
```

After:

```ts
// src/renderer/api/window.ts
export class Window implements IWindow {
    readonly menuBar = new MenuBarModel();
    readonly screen = new WindowScreen();
    // existing window state/actions
}
```

The screen object is real Object Model state in the same sense as `menuBar`; its automation
behavior is a thin adapter over the existing target and operation layers, not a new target.

### 2. Describe and register `window.screen`

1. Add `src/renderer/scripting/ai-vision/namespaces/window-screen.ts` with the
   `WINDOW_SCREEN_MEMBERS` descriptor fragment. It must spread the exact
   `BROWSER_AUTOMATION_MEMBERS` constant from `browser-automation-members.ts`; do not copy the ten
   member definitions into a second array.
2. Return an `IAiVisionDescriptor` with a screen-specific summary and help. The help must state:
   - this is Persephone's own window, not a browser page;
   - the ten shared operations act on the complete current app-window accessibility tree;
   - snapshot refs are passed as `{ ref: "..." }`, while plain strings are CSS selectors;
   - app navigation and browser tabs are absent because the target has none;
   - open and switch Persephone pages through `pages` and `pages.showPage(...)`;
   - `ui.elements` is the curated shell-control list with purpose lines, and should be preferred
     for a named shell control or its purpose;
   - `window.screen.snapshot()` is the complete, purpose-free fallback and includes the active
     page's content; inactive hidden pages do not appear;
   - HTML-preview/board iframe trees are merged when present, but an iframe with fewer than three
     AX nodes is omitted by `MIN_IFRAME_NODES`, so omission can mean a nearly-empty iframe rather
     than a blank preview;
   - the app window has no `elements` of its own;
   - `summarize()` returns host identity only (`kind: "WindowScreen"`); because a terminal
     `window.screen` walk ends before the screen descriptor's `restricted()` runs, it must never
     expose active-page content, title, URL, editor id, or privacy state;
   - screenshot may be `undefined` when its CDP session is unavailable, and absent values are not
     represented by `undefined` keys in a `call` answer.
3. Add the dynamic privacy callback. It must inspect the current `pagesModel.activePage` only,
   identify an active browser editor, apply the same `isIncognito`/`isTor` mode check as
   `getTarget()` (the whole-window check does not use the browser-page `openedByAgent` exception),
   and return the dedicated app-window refusal when any incognito or Tor page is active. It must
   return `undefined` for a normal active page, no active page, or an active non-browser page. Do
   not cache this decision in `WindowScreen` or in the descriptor factory. Cite
   `agentMayAccessBrowserPage(state)` in the implementation comments/help as the shared predicate
   for browser-page privacy, and keep its separate provenance behavior unchanged; do not compose
   `privateBrowserRefusal(state, "call")` into the app-window message because its remedy permits
   an agent-owned private page.
4. Do not add `elements`, `provide`, or a shell selector inventory to this descriptor. The app
   shell's curated entries remain owned by `ui.elements`, and page/editor controls remain on their
   page nodes.
5. In `src/renderer/scripting/ai-vision/namespaces/window.ts`, add the real child member:

```ts
// Before
{ name: "menuBar", kind: "property", summary: "The live Menu Bar model with folders, selection, open/close actions, and curated controls.", node: true },

// After
{ name: "menuBar", kind: "property", summary: "The live Menu Bar model with folders, selection, open/close actions, and curated controls.", node: true },
{ name: "screen", kind: "property", summary: "Persephone's own window accessibility and automation host; use ui.elements for curated shell controls and screen.snapshot() for the complete current tree.", node: true },
```

6. In `src/renderer/scripting/ai-vision/namespaces/index.ts`, import `describeWindowScreen` and
   register `appWindow.screen` with `registerAiVisionFor`, immediately beside the existing
   `appWindow` and `appWindow.menuBar` registrations. This is the same instance-registration
   pattern used by `window.menuBar`; no resolver change is needed.

### 3. Repoint help and the blocking-dialog fallback

1. Change the `help` string in `src/renderer/scripting/ai-vision/namespaces/ui.ts` exactly as
   specified in the Background section so both surfaces name each other and explain when to use
   the curated versus complete view.
2. Change `DIALOG_FALLBACK_TEXT` in
   `src/renderer/scripting/ai-vision/attention.ts` from `browser_snapshot`/`browser_click` with
   `pageId: "app"` to `window.screen.snapshot()`/`window.screen.click(...)`. No tool name may
   remain in this fallback.
3. Change only the final forward-pointing sentence of `HTML_EDITOR_HELP` in
   `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` to the one-sentence
   `window.screen.snapshot()` pointer. Do not add the shared automation members to the HTML
   facade and do not change its host-chrome elements.

### 4. Complete the four audits before implementation is called done

**Privacy audit.** For every ten screen members, verify the resolver sequence is:

```text
resolve window.screen
  → resolver calls window-screen descriptor restricted() for the next hop
  → active-page check uses the getTarget() isIncognito/isTor rule
  → refusal uses the dedicated app-window message and only pages.showPage(...) as remedy
  → only then does the screen method invoke ensureTargetReady()/operations.ts
```

Exercise a normal page, a user-opened incognito/Tor active page, a private page that is inactive,
and an agent-opened private active page. Both private active cases must refuse before CDP; the
inactive private case must not refuse. Separately verify that
`agentMayAccessBrowserPage` still permits the agent-owned private browser-page path; do not apply
that exception to the whole-window host. Do not count `getTarget()`'s existing browser-tool check
as coverage for this `call` path.

**Absent-value audit.** The screen descriptor has no URL/title/tab getters. Document and verify
that `snapshot()` returns its normal string (including a legitimate empty tree if Chromium reports
no accessible nodes), `networkRequests()` returns its normal array for the app target's synthetic
active adapter tab, and `screenshot()` returns `undefined` when the shared unavailable-safe
capture cannot attach. Any result object must omit unavailable fields rather than assigning
`undefined`; an absent value must not become `null` across the `call` boundary. This follows
EPIC-089 decision 10.

**Ref audit.** Take an app-window snapshot, use a returned main-frame ref and an iframe
`f<n>-e<m>` ref through the screen methods, and verify that a ref from a browser page or board
does not resolve through the app store. Confirm the explicit locator rule: `{ ref: "e52" }` is a
ref, while `"e52"` is a CSS selector. The app target has no meaningful public tab selection, so
the screen path must not invent one to make a ref work.

**Move audit.** For each member, name and inspect its `operations.ts` call and confirm the MCP
dispatcher still calls that same exported operation. No member may contain a copied selector,
ref-resolution, wait, screenshot, network, or input body. `AppTargetModel` remains the target
adapter; this task does not alter its existing `NAV_MSG`/`TAB_MSG` behavior.

### 5. Verify HTML, active-page visibility, and multi-window behavior through `call`

The later implementation verification must use `call`, not a new test harness:

1. On a normal active page, call `window.screen.snapshot()` and verify the result includes app
   shell plus active-page content. Switch to another Persephone page through `pages.showPage(...)`
   and verify the next snapshot changes; verify an inactive page's hidden content is not included.
2. Open/use an HTML preview with meaningful content, verify its iframe accessibility tree appears
   in the app snapshot and that a returned frame ref can be used with an explicit `{ ref }`. Also
   verify/document the nearly-empty/fewer-than-three-node omission case if available; do not call
   an omitted iframe proof that the preview is blank.
3. Open a second application window, give the two windows different active page titles, and call
   `windows[0].window.screen.snapshot()` and `windows[1].window.screen.snapshot()` through `call`.
   Confirm that each result contains the title belonging to the requested window. This is a live
   check of main-process path forwarding, renderer selection, sentinel `event.sender` routing, and
   that window 1's screen is not the main window's screen. If a second window cannot be opened on
   the machine, record this check as **not verified** rather than treating the routing argument as
   proof.
4. Exercise the attention fallback with a blocking renderer dialog whose `dialogs` node is not
   yet available and confirm the returned instruction names `window.screen`, not a retired tool.

No unit test, test harness, QA file, guide, browser/board facade change, or tool implementation is
created here; US-1340 owns acceptance QA and tool-retirement verification.

## Concerns

1. **The privacy gate must not be inherited accidentally.** `window.screen` is reached beside
   `pages`, so `PageWrapper.restricted()` cannot protect it. A descriptor-level `restricted()` is
   mandatory, and its state lookup must remain live per resolver hop.

2. **A private page can be inactive.** The rule is specifically about the active page because
   Chromium omits hidden `PageManager` subtrees from the accessibility tree. Scanning every open
   page would be a behavior change and would incorrectly block safe app-window automation.

3. **The target's synthetic adapter tab is not a public app tab.** `AppTargetModel.tabs` exists
   because `IBrowserTarget` requires it and shared operations use the target seam. It does not
   justify exposing `tabs` or tab verbs on `window.screen`; those members are absent from the
   descriptor and `IWindowScreen`.

4. **Iframe visibility has two independent filters.** An iframe can be active and mounted but
   still be omitted if its AX tree has fewer than three nodes. Separately, an inactive page or
   hidden iframe subtree can be omitted by Chromium. Help must distinguish these cases from a
   failed CDP attachment.

5. **Generated declarations are not hand-edited.** `src/renderer/api/types/window.d.ts` is the
   source; `vite.renderer.config.ts` copies it to `assets/editor-types/window.d.ts`. The generated
   asset must be refreshed by the normal build, not patched manually.

6. **The operation layer's shared wording says web page.** That fragment must remain shared so
   the three hosts cannot drift. Screen-specific help must explain that the same accessibility
   operations are being applied to Persephone's app window and its active embedded content.

7. **No duplicate shell inventory.** `ui.elements` is the purpose-bearing curated list;
   `window.screen.snapshot()` is the complete fallback. Adding app elements to the screen node
   would violate that distinction and create ambiguous selectors.

## Acceptance Criteria

- [ ] `window.screen` is the chosen node under the existing `window` namespace; no `window.ui`
      node is added.
- [ ] `screen` is a real `IWindow`/`Window` member, following the `menuBar` pattern, and its live
      instance is registered with a dedicated AiVision descriptor.
- [ ] The descriptor spreads the exact `BROWSER_AUTOMATION_MEMBERS` fragment and the implementation
      delegates all ten methods to the named functions in `src/renderer/automation/operations.ts`.
      No command body is duplicated; the MCP dispatcher continues to use the same operation bodies.
- [ ] Navigation and tab members are absent from both the public screen contract and its AiVision
      member list. The screen help tells agents to use `pages` and `pages.showPage(...)` instead.
- [ ] `window.screen` has no `elements` inventory. Its help cross-references `ui.elements`, and
      the `ui` help cross-references `window.screen.snapshot()` with the exact curated-versus-
      complete preference wording.
- [ ] The screen restriction preserves `getTarget()`'s exact active-page `isIncognito`/`isTor`
      check and uses a dedicated app-window refusal whose only remedy is activating a non-private
      page with `pages.showPage(...)`; it quotes and does not compose the contradictory
      `privateBrowserRefusal(state, "call")` browser-page message, while citing
      `agentMayAccessBrowserPage` as the shared browser-page predicate. It names the app-window
      boundary and is evaluated against the active page at each call. Any active incognito/Tor
      page is refused before CDP, including an agent-owned private page; inactive private pages
      do not trigger the refusal.
- [ ] The resolver's per-hop `restricted()` behavior at `src/shared/ai-vision/resolver.ts:85-87`
      is cited and no resolver modification or cached construction-time privacy state is added.
- [ ] `window.screen.summarize()` exposes host identity only (`kind: "WindowScreen"`, with no
      active-page content, title, URL, editor id, or privacy state), because a terminal
      `window.screen` path returns before the screen descriptor's own `restricted()` is consulted.
- [ ] `DIALOG_FALLBACK_TEXT` points to `window.screen.snapshot()`/`window.screen.click(...)` and
      does not advertise `browser_snapshot`, `browser_click`, or `pageId: "app"`.
- [ ] HTML preview help points to `window.screen.snapshot()`; screen help states that merged
      iframe content is reachable there and that `MIN_IFRAME_NODES = 3` can omit a nearly-empty
      iframe without proving the preview blank.
- [ ] The app-window ref store is verified as the `APP_WINDOW_CDP_KEY` registration entry; app
      `f<n>-e<m>` refs resolve through that entry and cannot be clobbered by browser or board
      snapshots. Plain strings remain selectors and `{ ref: string }` is explicit.
- [ ] A live multi-window check opens a second application window, snapshots both through
      `windows[i].window.screen.snapshot()`, and identifies each result with a window-specific
      active-page title or other visible marker, proving `sendToRenderer` selects the requested
      renderer and `cdp-service.ts` maps the sentinel to that call's `event.sender`. If a second
      window cannot be opened, the result is recorded as **not verified**, not inferred from the
      routing code.
- [ ] The absent-value audit confirms unavailable screenshots return `undefined`, valid arrays and
      strings remain valid values, and absent object fields are omitted rather than assigned
      `undefined`.
- [ ] The implementation cites, without re-deriving, US-1335's live finding that `snapshot()`
      returned no value for either password or ordinary input fields. It also cites US-1336's
      hidden-frame finding and `doc/architecture/browser-editor.md`'s active-page explanation.
- [ ] No unit tests, test harnesses, QA/guides, browser/board facades, the fourteen tool
      implementations, dashboard edit, or commit are created by this task.

## Files Changed Summary

| File | Planned action | Reason |
| --- | --- | --- |
| `src/renderer/api/types/window.d.ts` | **Change** | Add the real `IWindowScreen` contract and `IWindow.screen`; omit navigation and tab capabilities. |
| `src/renderer/api/window.ts` | **Change** | Own the real `screen` object beside the existing `menuBar` model. |
| `src/renderer/api/window-screen.ts` | **Add** | Thin live screen object that delegates the ten methods to `appTarget` and shared `operations.ts` functions. |
| `src/renderer/scripting/ai-vision/namespaces/window-screen.ts` | **Add** | Screen descriptor, shared member spread, dynamic privacy gate, app/iframe/ref/help documentation. |
| `src/renderer/scripting/ai-vision/namespaces/window.ts` | **Change** | Advertise `window.screen` as a live nested node. |
| `src/renderer/scripting/ai-vision/namespaces/index.ts` | **Change** | Register `appWindow.screen` with the screen descriptor, following `appWindow.menuBar`. |
| `src/renderer/scripting/ai-vision/namespaces/ui.ts` | **Change** | Cross-reference `window.screen.snapshot()` and define curated-versus-complete preference. |
| `src/renderer/scripting/ai-vision/attention.ts` | **Change** | Point the blocking-dialog fallback at `window.screen`, not retired tools. |
| `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` | **Change** | Add the one-sentence forward pointer to `window.screen.snapshot()` and the three-node iframe threshold. |

## Files that need NO changes

| File or area | Verified reason |
| --- | --- |
| `src/renderer/automation/AppTargetModel.ts` | Already implements the complete app `IBrowserTarget`, including the `APP_WINDOW_CDP_KEY` session, input path, active synthetic adapter tab, and clear `NAV_MSG`/`TAB_MSG` errors. |
| `src/renderer/automation/operations.ts` | Already owns all ten shared operation bodies and accepts `IBrowserTarget`; the screen consumes it without a new command path. |
| `src/renderer/scripting/ai-vision/browser-automation-members.ts` | Already contains the exact shared ten-member descriptor fragment; no screen-specific copy or parameterized variant is needed. |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` | Implemented and committed by US-1335; it is the verified shared-operation consumer and is out of scope. |
| `src/renderer/scripting/api-wrapper/BoardEditorFacade.ts` | Implemented and committed by US-1336; it is the verified shared-operation consumer and is out of scope. |
| `src/renderer/automation/commands.ts` | Its `getTarget()` app branch remains the browser-tool privacy guard and continues to resolve `appTarget`; the new `call` path is gated by the screen descriptor. |
| `src/renderer/editors/browser/agent-access.ts` | The shared `agentMayAccessBrowserPage` predicate and `privateBrowserRefusal` helper already provide the required privacy rule and remedy. |
| `src/shared/ai-vision/resolver.ts` | Its existing per-hop `restricted()` gate at `:85-87` already enforces the new descriptor callback; no resolver change is needed. |
| `src/renderer/automation/snapshot.ts` | Already merges iframe accessibility trees, stores frame sessions by `CdpSession.registrationKey`, and applies `MIN_IFRAME_NODES = 3`. |
| `src/renderer/automation/ref.ts` | US-1334 already provides registration-keyed frame stores and fail-closed cross-host/frame ref errors. |
| `src/renderer/automation/CdpSession.ts` | Already exposes the exact registration key used by the app sentinel store. |
| `src/ipc/api-types.ts` | `APP_WINDOW_CDP_KEY` already exists and must remain the screen host's sentinel. |
| `src/main/cdp-service.ts` | Already short-circuits the app sentinel to `event.sender` and preserves nested-iframe sessions. |
| `src/main/mcp/tools/call-tools.ts` | Already forwards deep `windows[i].` paths to the selected renderer and restores the caller-facing path. |
| `src/main/mcp/renderer-bridge.ts` | Already selects the renderer `webContents` by `windowIndex`. |
| `src/renderer/scripting/api-wrapper/AppWrapper.ts` | Already returns the live `app.window` object, so a real `IWindow.screen` member is automatically reachable by script and AiVision. |
| `assets/editor-types/window.d.ts` | Generated from `src/renderer/api/types/window.d.ts` by `editorTypesPlugin()`; never hand-edit. |
| `doc/architecture/browser-editor.md` | Its **App-Window Target** section already documents active-page-only snapshots, hidden-subtree behavior, the sentinel, and multi-window routing; this task cites it rather than re-deriving or editing it. |
| `doc/tasks/US-1335-browser-page-surface/README.md` | Its live verification records that `snapshot()` returned no password or ordinary input value; US-1337 cites that finding and does not re-derive it. |
| `doc/tasks/US-1336-board-page-automation/README.md` | Its live verification records that hidden loaded frames returned empty accessibility trees because Chromium omits hidden subtrees; US-1337 cites that mechanism and does not re-derive it. |
| `src/renderer/editors/html/HtmlBodyView.ts` | Existing sandboxed `srcdoc` iframe behavior is verified; only its facade help needs the forward pointer. |
| Browser/board target models and fourteen tool implementations | Existing host adapters and tool bodies are reused; no new target or tool is added. |
| `doc/active-work.md` and `doc/epics/EPIC-089.md` | US-1337 is already linked as a Planned EPIC-089 task; the user owns the dashboard and requested no dashboard edit. |
| `qa/`, `docs/`, `assets/mcp-res-*.md`, and `src/main/mcp/tools/*` | QA, guides, user docs, and tool implementations are explicitly out of scope for US-1337 and belong to US-1340 or other epic tasks. |
| US-1338/US-1339/US-1340 surfaces | URL opening, the browser-tools setting, guides, and acceptance/retirement marking are separate EPIC-089 tasks. |

## Implementation verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build-prod`: passed; generated `assets/editor-types/window.d.ts` was refreshed by the build.
- Privacy refusal live check: **NOT verified**. `npm start` could not start the Vite renderer in this environment (`Error: spawn EPERM`), so no `call` endpoint was available. The active-private, inactive-private, normal-page, and agent-opened-private cases require a live run.
- Multi-window live check: **NOT verified**. The app could not start for the same `spawn EPERM` reason, so `windows[i].window.screen.snapshot()` was not exercised through `call`.


## Live verification (2026-09-06)

Run through `call` against the running dev build. Both checks the plan recorded as **not verified**
were run here and passed.

### The privacy gate, in both directions

The check was made against a real Tor page, not a simulated one: the user had a Tor browser page
open, and it became the active page during the run.

| State | `window.screen.snapshot()` |
|---|---|
| active page is a Tor browser page (`page.isTor === true`) | refused: *"Persephone's own window cannot be automated while its active page is in Tor mode. Whole-window snapshots and actions would expose that private page. Activate a non-private page with pages.showPage(pageId), then retry."* |
| a non-private page activated | returns the window's accessibility tree — Menu, the tab strip, Minimize/Maximize/Close, the snip button, the Mneme indicator |

The refusal is evaluated live per call, not captured: the same path refused and then succeeded with
no reload, only a page switch. `window.screen` read on its own returns `{ kind: "WindowScreen" }`
and nothing else, which is what M1 required — the resolver's walk ends before the node's own
`restricted()` runs when the node itself is the last segment, so the summary must carry no page
detail. It does not.

### Multi-window

`window.openNew()` opened a second window; `windows[1].window.screen.snapshot()` returned a tree
whose only tab was `untitled`, while the main window's tree carried `Browser` and `Mneme`. The
sentinel therefore resolves to the named window's own webContents, not the main window's. The second
window was closed afterwards.

### One defect found and fixed elsewhere

The refusal message tells the agent to recover with `pages.showPage(pageId)`. Testing that advice
showed `pages.showPage` **silently accepted an unknown page id** and returned `null`, leaving the
previous page active — so an agent recovering from this refusal with a mistyped or stale id would
have looped forever, believing it had switched. Fixed as **US-1342**: it now refuses and names the
open page ids. The remedy sentence in this node's refusal is only as good as that call.
