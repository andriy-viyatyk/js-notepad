# US-1335 — The browser page surface: refs, the six missing capabilities, and the chrome/content split

Status: Implemented; live password snapshot verification is blocked in this environment. No tests,
dashboard update, or commit is included in this task.

Epic: [EPIC-089](../../epics/EPIC-089.md)

## Goal

Bring `BrowserEditorFacade` to parity with the fourteen `browser_*` automation tools while preserving existing selector-only callers and the existing `IBrowserEditor` surface where compatibility requires it. The facade will expose explicit snapshot refs, all six missing browser capabilities, the overlay warning, a curated and highlightable browser-chrome element surface, and help that explains the chrome/content boundary.

The implementation must consume the shared operation layer from US-1334. It must not recreate browser command bodies in `BrowserEditorFacade`, in a second facade helper, or in the fourteen tool implementations.

## Background

### Binding context

US-1334 extracted the browser command operations into [`src/renderer/automation/operations.ts`](../../../src/renderer/automation/operations.ts) and added [`resolveElementLocator`](../../../src/renderer/automation/operations.ts), which has the binding locator contract:

```ts
resolveElementLocator("button.submit") // { selector: "button.submit" }
resolveElementLocator({ ref: "e52" })    // { ref: "e52" }
resolveElementLocator("e52")            // { selector: "e52" }
```

The last line is intentional: a plain string is always a CSS selector. Only an object with a string `ref` property is a ref. Any other value throws `Expected a CSS selector string or an object of the form { ref: string }.` This prevents spelling-based guessing and must be retained in every facade path.

The operation layer currently exports `snapshot`, `clickElement`, `hoverElement`, `typeTextInto`, `selectOption`, `waitFor`, `takeScreenshot`, `networkRequests`, `closeActiveTab`, and the other browser operations. It already owns overlay detection, ref resolution, frame-local ref lookup, screenshot capture, network-log retrieval, and active-tab closing. The facade consumes those functions; the browser tools continue to use them through [`src/renderer/automation/commands.ts`](../../../src/renderer/automation/commands.ts).

### Current facade and type gap

[`src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts) already exposes a 29-member `aiVision` descriptor and existing methods for navigation, tabs, evaluation, snapshot, selector queries, click, type, select, checkbox/clear operations, selector/navigation/time waits, and key presses. Its current gaps are verified in the source:

- `click`, `type`, and `select` call `resolveElementLocator` at runtime but their public TypeScript signatures and descriptor wording still say selector-only. `hover` is absent.
- `snapshot()` passes `{ overlayHint: false }`, although the descriptor says its format matches Playwright MCP output. The shared operation prepends `# <overlay>` when the hint is enabled, matching the tool output.
- `screenshot`, `networkRequests`, and the composite `waitFor` are absent.
- `browser_tabs` action verbs are already represented by `tabs`, `addTab`, `closeTab`, and `switchTab`; aliases would duplicate the existing surface.
- `browser_close` is already represented by `closeTab()`. The tool-side operation calls `target.closeTab()` and returns the literal `"Tab closed"`; it closes the active browser tab, not the Persephone page.
- The descriptor help does not explain that browser chrome is separate from web content, and it does not expose `elements` or `highlight`.
- [`src/renderer/api/types/browser-editor.d.ts`](../../../src/renderer/api/types/browser-editor.d.ts) has selector-only signatures and no types for the missing capabilities. [`assets/editor-types/browser-editor.d.ts`](../../../assets/editor-types/browser-editor.d.ts) is generated and must not be edited by hand.

The existing selector-only callers remain valid because `string` stays in the locator union. The new ref form is an additive `{ ref: string }` branch, not a reinterpretation of existing strings.

### Shared operation and tool verification

The fourteen browser tool schemas in [`src/main/mcp/tools/browser-tools.ts`](../../../src/main/mcp/tools/browser-tools.ts) were checked against the command adapter in [`src/renderer/automation/commands.ts`](../../../src/renderer/automation/commands.ts):

| Tool capability | Shared operation / current command behavior | Facade decision |
| --- | --- | --- |
| `browser_snapshot` | `snapshot(target, tabId, { overlayHint })`; the tool enables the overlay hint | Facade enables `overlayHint: true` and documents the prefix and ref form |
| `browser_click` | `clickElement(target, locator, options)` | Accept string CSS selectors and `{ ref: string }` |
| `browser_hover` | `hoverElement(target, locator, options)` | Add `hover` and use the same resolver/operation |
| `browser_type` | `typeTextInto(target, locator, text, options)` | Widen the existing method; preserve existing options and selector calls |
| `browser_select_option` | `selectOption(target, locator, values, options)` | Widen the existing method |
| `browser_take_screenshot` | `takeScreenshot(target)` returns `{ type: "image", data, mimeType: "image/png" }` | Add a screenshot getter; the call-wide handler detects this canonical image payload and returns metadata text plus a native MCP image block |
| `browser_network_requests` | `networkRequests(target)` reads the active tab’s network log | Add the facade member and retain the shared operation as the sole retrieval path |
| `browser_wait_for` | `waitFor(target, tabId, { selector, text, textGone, time, timeout })` | Add the four modes (`selector`, `text`, `textGone`, `time`) with the shared operation |
| `browser_tabs` list | `listTabs(target)` | Existing `tabs` member is the facade equivalent |
| `browser_tabs` new | `openTab(target, url)` | Existing `addTab` member is the facade equivalent |
| `browser_tabs` close | `closeTab(target, tabId)` | Existing `closeTab` member is the facade equivalent |
| `browser_tabs` select | `selectTab(target, tabId)` | Existing `switchTab` member is the facade equivalent |
| `browser_close` | `closeActiveTab(target)` calls `target.closeTab()` and returns `"Tab closed"` | Existing `closeTab()` remains the facade spelling; it closes the active browser tab and does not close the Persephone page |

`browser_tools`’ screenshot command converts the operation object to a native MCP image with `toImageResult`. `$call` is a custom handler in [`src/main/mcp/call-tools.ts`](../../../src/main/mcp/call-tools.ts), and [`src/main/mcp/types.ts`](../../../src/main/mcp/types.ts) already permits image content blocks. The call handler must therefore detect image payloads before the normal JSON/max-length body path and return metadata text plus a real `{ type: "image", data, mimeType }` block so the agent sees the picture rather than truncated base64.

The canonical call-detection shape is the operations-layer `{ type: "image", data, mimeType }` payload. For compatibility with the existing page-content path, the handler also accepts `{ image: { data, mimeType } }` and emits the same native image block; it does not introduce a third shape. The rule is call-wide: any resolved member that returns either accepted image payload gets the image block, not only `BrowserEditorFacade.screenshot()`.

If native image content ever proves impossible at the MCP boundary, the fallback is not base64 in JSON: write the PNG to a file and return `{ path, bytes, mimeType }`, with `$help` stating that the picture is not inline and `pages.openFile(path)` shows it to the user. The current code already supports image blocks, so this fallback is a defined contingency, not the selected behavior.

The current operation signatures use the active tab for screenshots and network logs. To retain the facade’s existing optional `tabId` convention without duplicating capture/log logic, the implementation plan extends those shared operations with an optional tab id. The MCP adapter in `commands.ts` will continue to pass no tab id (`takeScreenshot(target)` and `networkRequests(target)` remain the calls), preserving the active-tab default byte-for-byte in behavior and leaving no second capture/log path.

### Refs, frame scope, and privacy traversal

US-1334’s ref store is keyed by `CdpSession.registrationKey`, which is `${browserTargetId}/${tabId}` for browser tabs. `snapshot.ts` assigns main-document refs such as `e52` and iframe refs such as `f1-e52`; `ref.ts` resolves them against the caller’s host-local session and fails closed when the ref is unknown or belongs to another frame/tab. The facade must pass locators to the shared operation layer and must not maintain another ref map.

The privacy path was traced through [`src/renderer/scripting/ai-vision/call.ts`](../../../src/renderer/scripting/ai-vision/call.ts), [`src/shared/ai-vision/resolver.ts`](../../../src/shared/ai-vision/resolver.ts), and [`src/renderer/scripting/api-wrapper/PageWrapper.ts`](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts). The resolver invokes each descriptor’s `restricted()` before resolving or invoking the next member. At the `pages[i]` hop, `PageWrapper.aiVision.restricted` calls `agentMayAccessBrowserPage(state)` and otherwise returns `privateBrowserRefusal(state, "call")`; `pages[i].editor.snapshot()` therefore passes through the page-level gate before `BrowserEditorFacade.snapshot()` is reached. No second `restricted()` on the browser facade is needed for the `$call` path. The operations themselves intentionally have no alternate privacy policy; they execute only after this gate.

The same page-level gate applies to the new facade members and the chrome `elements`/`highlight` provider when reached through `$call`. `highlight` activates the page and waits for layout using the established editor-facade pattern, but it does not expose webview content. Direct scripting is an existing separate surface and is not widened by this task.

The snapshot formatter in [`src/renderer/automation/snapshot.ts`](../../../src/renderer/automation/snapshot.ts) emits an accessibility role, accessible name, and ref where available. The source-level guarantee is narrower than Chromium behavior: it appends a value only when the accessibility property named `value` is present and non-empty. This repository’s source does not establish what Chromium exposes for `<input type="password">`; the implementation plan includes a live check and the task document must record that snapshot line verbatim before claiming the observed password behavior.

### Browser chrome inventory

[`src/renderer/editors/browser/BrowserView.ts`](../../../src/renderer/editors/browser/BrowserView.ts) names the stable chrome controls. The curated `elements` declaration will contain these fourteen names:

| Name | Purpose / stability evidence |
| --- | --- |
| `url-input` | Address-bar input; `BrowserToolbarView.sync()` supplies `name` on every update |
| `url-navigate` | Address-bar navigation control; name supplied on every update |
| `url-bookmark-toggle` | Address-bar bookmark control; name supplied on every update |
| `toolbar-back` | Back control; name supplied on every update |
| `toolbar-forward` | Forward control; name supplied on every update |
| `toolbar-reload` | Reload/stop control; name supplied on every update |
| `toolbar-home` | Home control; name supplied on every update |
| `toolbar-bookmarks` | Bookmarks drawer control; name supplied on every update |
| `toolbar-more` | Browser page-menu control; name supplied on every update |
| `toolbar-devtools` | Developer-tools control; name supplied on every update |
| `toolbar-close` | Browser editor close control; name supplied on every update |
| `toolbar-tor-info` | Tor-only info control; name is supplied even when hidden by state |
| `tabs-panel-host` | `BrowserEditorView.buildTree()` creates it with `createPanelElement({ name: "tabs-panel-host", ... })` at `BrowserView.ts:451`; `BrowserEditorView.sync()` at `BrowserView.ts:458` changes only `tabsHost.style.width`, so no later `update()` can strip its name |
| `popup-blocked-bar` | `PopupBlockedView` creates the root with `createPanelElement({ name: "popup-blocked-bar", ... })` at `BrowserView.ts:370`; `onUpdate()` at `BrowserView.ts:375` calls only `sync()` at `:376`, which changes text, while `BrowserView.syncPopup()` at `:473-475` mounts, clears, or updates the view without updating the root props. When the bar is absent, `createElements` finds zero scoped matches and reports `visible: false`; the declaration remains present, distinct from a missing declaration/name |

The epic/user inventory cites 73 `name:` props under `editors/browser/`. A current source scan contains 69 `name:` occurrences (the inventory count is an upper-bound planning figure and does not change the decision); the additional occurrences are structural roots, splitters, repeated tab controls, and transient popup/drawer/menu controls. They are deliberately not all public elements.

Dropped names include `browser-toolbar-content`, `url-bar`, `browser-body`, `webview-area`, `tabs-webview-splitter`, browser-tab row internals, `bookmarks-*`, `downloads-*`, `url-suggestions-*`, `page-menu`, `search-engine-menu`, Tor overlay controls, and popup allow/dismiss controls. Structural roots do not represent actionable chrome; repeated row internals are ambiguous; and drawers, menus, suggestions, downloads, Tor dialogs, and popup actions are conditional/transient rather than on-screen browser chrome by default. `popup-blocked-bar` is retained as the stable notification surface, while its conditional actions are omitted for the same transient-action reason.

Every declaration will be scoped with `pageScopeSelector(pageId)`, so resolution is beneath the browser page node. The UIKit trap was checked: `IconButtonView.applyProps` deletes `data-name` when a later update omits `name`, while `BrowserToolbarView.sync()` explicitly includes every listed toolbar/input name on each update. `tabs-panel-host` and `popup-blocked-bar` retain their root names for the exact build/update reasons cited in the inventory table. When `popup-blocked-bar` is cleared from the DOM, the live element entry remains declared but has `visible: false` because its scoped selector has no matches; it is not silently renamed or removed from `$help.elements`.

`createElements`’ provider supplies `$help.elements` and `$call`’s `highlight`. The existing [`BoardEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BoardEditorFacade.ts) pattern is binding: bind `ui.highlightElement`, scope with `pageScopeSelector`, activate/wait for layout before highlighting, and set `highlightOptions: { all: true }`. The latter matters because UIKit highlights only the first matching element by default; `{ all: true }` rings every match and returns the existing highlight result with `count`/`highlighted` information.

### Chrome/content split

The browser editor’s address bar, toolbar, tabs host, and blocked-popup bar are Persephone controls and belong in `$help.elements`. The web page rendered in the browser webview—including web-page iframe content merged by `buildSnapshot`—is reachable through `snapshot()` and its returned refs. The snapshot cannot find `url-input`; the help text must state that this absence is intentional and direct an agent to `elements` for chrome.

Toolbar actions can open secondary chrome surfaces such as the page menu (`page-menu`), bookmarks drawer, search-engine menu, Tor information dialog, URL suggestions, or popup actions. These are intentionally not part of the default curated list; `$help` should describe them as transient surfaces rather than promising that their controls are always resolvable.

### Absent values and generated types

The facade currently fabricates `activeTab` with empty-string/false fallbacks and returns an empty title string from the model. The implementation must change unavailable getters to `undefined`, never `false`, `0`, `""`, or `null`. Valid empty collections such as `tabs: []` and `networkRequests: []` remain arrays. `url` remains a real `about:blank` URL when that is the current tab, but an unavailable/empty model value is exposed as `undefined`; `title` is omitted/undefined when empty.

Object answers must use conditional properties so absent keys are omitted. Assigned `undefined` is forbidden by the epic decision because it can cross the `$call` MCP boundary as `null`; construct the object without the key instead. The same rule applies to `summarize()` and `IBrowserTab`/network/screenshot objects wherever a field is unavailable.

`src/renderer/api/types/*.d.ts` is the canonical declaration source. [`vite.renderer.config.ts`](../../../vite.renderer.config.ts) confirms that `editorTypesPlugin()` copies those declarations into `assets/editor-types/`; the generated browser declaration will be regenerated by the normal build and must not be hand-edited.

## Implementation Plan

### 1. Add one shared browser-automation descriptor fragment

Create `src/renderer/scripting/ai-vision/browser-automation-members.ts` containing the descriptor entries shared by browser-like editor hosts. Declare the common members once: `snapshot`, `click`, `hover`, `type`, `select`, `pressKey`, `evaluate`, `waitFor`, `screenshot`, and `networkRequests`. Keep browser navigation, tabs, selector queries, checkbox/clear helpers, and existing wait aliases in the browser-specific descriptor.

The fragment’s summaries and signatures must name the locator contract explicitly: strings are CSS selectors; refs are objects of the form `{ ref: string }`; snapshot refs are passed back in that object form. The `waitFor` descriptor must document exactly one of `selector`, `text`, `textGone`, or `time` (with timeout where supported), and the screenshot descriptor must state that `$call` returns metadata text plus a native MCP image block.

Before:

```ts
// BrowserEditorFacade.aiVision
members: BROWSER_EDITOR_MEMBERS,
```

After:

```ts
// BrowserEditorFacade.aiVision
members: [
  ...BROWSER_AUTOMATION_MEMBERS,
  ...BROWSER_EDITOR_MEMBERS,
  ...elements.members,
],
elements: BROWSER_ELEMENTS,
provide: elements.provide,
```

The common fragment is the single descriptor source future board/window work can splice into their host facades; it does not change the fourteen tool implementations.

### 2. Complete `BrowserEditorFacade` against the shared operations

Update `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` to import the shared descriptor fragment, element helpers, and any new shared-operation types. Keep `this.model.target` as the only browser target and route every new tool-backed behavior through `src/renderer/automation/operations.ts`.

Change the existing target methods to accept `IBrowserElementLocator` while preserving selector calls:

```ts
// Before
click(selector: string, options?: TabOption): Promise<void>
type(selector: string, text: string, options?: TabOption & TypeOptions): Promise<void>
select(selector: string, values: string | string[], options?: TabOption): Promise<void>

// After
click(locator: IBrowserElementLocator, options?: TabOption): Promise<void>
type(locator: IBrowserElementLocator, text: string, options?: TabOption & TypeOptions): Promise<void>
select(locator: IBrowserElementLocator, values: string | string[], options?: TabOption): Promise<void>
hover(locator: IBrowserElementLocator, options?: TabOption): Promise<void>
```

Pass each locator directly to `resolveElementLocator`/the corresponding shared operation. Preserve the existing selector-only `check`, `uncheck`, and `clear` methods because no `browser_*` tool supports those operations and US-1334 intentionally did not move their command bodies. The five read helpers (`getText`, `getValue`, `getAttribute`, `getHtml`, and `exists`) will also accept the locator union so refs returned by this facade’s snapshot can be used for reads; their existing not-found result contracts remain unchanged. Their locator resolution/read primitives will be placed in the shared operation layer rather than copied into a second browser-command implementation.

Add these facade members:

```ts
hover(locator, options?)
screenshot(options?: TabOption): Promise<IBrowserScreenshot | undefined>
networkRequests(options?: TabOption): Promise<IBrowserNetworkRequest[]>
waitFor(options: {
  selector?: string
  text?: string
  textGone?: string
  time?: number
  timeout?: number
  tabId?: string
}): Promise<void>
```

`waitFor` forwards the options unchanged to the shared `waitFor`, preserving its selector/text/text-gone/time mode validation and timeout semantics. `screenshot` and `networkRequests` forward an optional `tabId` to the extended shared operations; with no tab id they use the active browser tab. `screenshot` returns `undefined` when its target has no attached session, as required by the absent-value decision. No second screenshot encoding, network-log lookup, wait loop, or locator resolver is permitted in the facade.

Set snapshot’s overlay option to true and make its descriptor accurate:

```ts
// Before
return snapshot(this.model.target, options?.tabId, { overlayHint: false });
// Summary: Format matches Playwright MCP's browser_snapshot output.

// After
return snapshot(this.model.target, options?.tabId, { overlayHint: true });
// Summary: Format matches Playwright MCP's browser_snapshot output. If an
// overlay is detected, the result starts with # <overlay>; refs are passed
// back as { ref: "e52" }, while plain strings remain CSS selectors.
```

The descriptor/help must not present Chromium’s password-field behavior as source-proven. After the live check in step 9, document the observed line verbatim and state the resulting secret boundary accurately.

Keep the existing `tabs`, `addTab`, `closeTab`, and `switchTab` methods and document their mapping to `browser_tabs` rather than adding aliases. `closeTab()` is the facade’s active-tab equivalent of `browser_close`; it must not call a page close/removal API. The tool operation’s exact result is `"Tab closed"`; make the facade’s close result match that literal while preserving ignored-return compatibility for existing callers.

### 3. Add the curated browser-chrome elements and highlight provider

In `BrowserEditorFacade.aiVision`, define `BROWSER_ELEMENTS` with exactly the fourteen stable declarations verified in `BrowserView.ts`:

```ts
const BROWSER_ELEMENTS: IAiElementDeclaration[] = [
  { name: "url-input", purpose: "Browser address bar input" },
  { name: "url-navigate", purpose: "Navigate to the address-bar URL" },
  { name: "url-bookmark-toggle", purpose: "Toggle a bookmark for the current URL" },
  { name: "toolbar-back", purpose: "Go back in browser history" },
  { name: "toolbar-forward", purpose: "Go forward in browser history" },
  { name: "toolbar-reload", purpose: "Reload or stop the current page" },
  { name: "toolbar-home", purpose: "Open the browser home page" },
  { name: "toolbar-bookmarks", purpose: "Open the bookmarks drawer" },
  { name: "toolbar-more", purpose: "Open the browser page menu" },
  { name: "toolbar-devtools", purpose: "Open browser developer tools" },
  { name: "toolbar-close", purpose: "Close the browser editor" },
  { name: "toolbar-tor-info", purpose: "Open Tor information (Tor mode only)" },
  { name: "tabs-panel-host", purpose: "Browser tab strip host" },
  { name: "popup-blocked-bar", purpose: "Blocked-popup notification bar" },
];
```

Use the established board-facade pattern exactly:

```ts
const pageId = this.model.page?.id;
const elements = createElements(
  BROWSER_ELEMENTS,
  ui.highlightElement.bind(ui),
  {
    scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
    beforeHighlight: pageId
      ? () => activatePageAndWaitForLayout(pageId)
      : undefined,
    highlightOptions: { all: true },
  },
);
```

Return `elements: BROWSER_ELEMENTS` and `provide: elements.provide` in the browser descriptor. This makes `$help.elements` live and scoped below the page node, and makes `$call`’s `highlight(name, message?)` follow the existing provider contract. `highlight` must activate the page before resolving and ring all matches (`all: true`), while the underlying selector behavior still returns the standard found/count/highlighted result.

### 4. Explain the chrome/content split in `$help`

Replace the current one-line browser help with explicit guidance:

```ts
// Before
help: "Access via pages[i].editor after narrowing editor.id to \"browser-view\". Browser navigation, tab management, page inspection, and interaction facade.",

// After (content requirements)
help: "Access via pages[i].editor after narrowing editor.id to \"browser-view\". Use elements for Persephone browser chrome (address bar, toolbar, tabs host, and blocked-popup bar); those controls are not in snapshot(). Use snapshot() for the web page inside the webview and pass its returned refs as { ref: \"e52\" } to supported target methods. snapshot() may begin with # <overlay> when a modal covers the page. browser_tabs maps to tabs/addTab/closeTab/switchTab, browser_close closes the active browser tab, and screenshot() returns metadata plus an inline image block through call.",
```

Mention that transient menus/drawers/dialogs are not part of the default curated list and may require the chrome control that opens them. This tells an agent why searching a web-page snapshot for `url-input` cannot work and where to look instead.

### 5. Make the shared operations tab-aware without duplicating behavior

In `src/renderer/automation/operations.ts`, extend `takeScreenshot` and `networkRequests` with an optional tab id. Resolve the explicit tab through the existing target tab model and keep the current active-tab fallback when omitted. Make the facade-facing screenshot result `undefined` when its CDP session is unavailable, while preserving the existing `{type, data, mimeType}` result when capture succeeds. Preserve `networkRequests`’ existing raw `NetworkLogEntry` shape. Keep all waiting, ref resolution, screenshot, and network work in this file; `commands.ts` remains the adapter for tool argument names and MCP result conversion.

For the five facade read helpers, move/expose their existing selector/ref read primitives from the facade into shared operation functions so each accepts the same `ElementLocator` contract. Do not change the tool command switch or add a browser tool. Existing selector strings and existing not-found values remain compatible; malformed locators use the shared error naming both accepted forms.

### 6. Preserve image payloads through the call boundary

In `src/main/mcp/tools/call-tools.ts`, extend the custom `toCallResult` handler before its ordinary `JSON.stringify`/`maxLength` body path. Detect the canonical direct operations payload `{ type: "image", data, mimeType }`, remove the large `data` field from the metadata text, and append a native `{ type: "image", data, mimeType }` content block. Also accept the existing page-content wrapper `{ image: { data, mimeType } }`, using the remaining wrapper fields as metadata; both forms normalize to the same MCP image block and no third image shape is introduced.

This is a call-wide result rule, not a browser special case: any resolved facade or page member that returns either accepted image payload receives metadata text plus an image block. It applies to local and forwarded call results and must coexist with pending/error/attention/hint text. The ordinary string truncation path must not run over image base64, so `maxLength` cannot turn a valid picture into a truncated JSON string.

The fallback is explicitly defined if the MCP image block is ever unavailable: write the PNG to a file and return `{ path, bytes, mimeType }`; `$help` must say the picture is not inline and `pages.openFile(path)` shows it to the user. Do not substitute base64-in-JSON.

The existing `src/main/mcp/types.ts` union already supports `{ type: "image", data, mimeType }`, and `toPageContentResult` is the precedent for metadata text followed by an image block; neither needs a type redesign.

### 7. Update canonical API declarations and the editor hint

In `src/renderer/api/types/browser-editor.d.ts`:

- Add the exported `IBrowserElementLocator`, `IBrowserScreenshot`, and `IBrowserNetworkRequest` shapes.
- Widen `click`, `type`, `select`, `hover`, and the five read helpers to the locator union.
- Add `screenshot`, `networkRequests`, and the four-mode `waitFor` signature.
- Make unavailable getter fields optional/undefined-capable as required by the absent-value rule, without turning valid states such as `loading: false` or `about:blank` into absent values.
- Update snapshot and help-facing comments to state the explicit `{ ref: string }` form, overlay prefix, chrome/content split, the live-verified password behavior, and screenshot metadata-plus-image behavior.

Before:

```ts
click(selector: string, options?: { tabId?: string }): Promise<void>;
select(selector: string, values: string | string[], options?: { tabId?: string }): Promise<void>;
waitForSelector(selector: string, options?: { tabId?: string; timeout?: number }): Promise<void>;
```

After:

```ts
click(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;
hover(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;
select(locator: IBrowserElementLocator, values: string | string[], options?: { tabId?: string }): Promise<void>;
waitFor(options: {
  selector?: string;
  text?: string;
  textGone?: string;
  time?: number;
  timeout?: number;
  tabId?: string;
}): Promise<void>;
screenshot(options?: { tabId?: string }): Promise<IBrowserScreenshot | undefined>;
networkRequests(options?: { tabId?: string }): Promise<IBrowserNetworkRequest[]>;
```

`src/renderer/api/types/page.d.ts` already includes `IBrowserEditor` in `IEditorFacade`; no union plumbing is needed there. Do not hand-edit `assets/editor-types/browser-editor.d.ts`; regenerate it through `editorTypesPlugin()` after the canonical declaration changes.

In `src/renderer/editors/register-editors.ts`, change only the browser editor’s `mcpHint` at line 163. Coordinate the wording with US-1338 by pointing at the canonical `pages.openUrlInBrowserTab(url, options)` path, while leaving `open_url` and `pages.openUrl` implementation work to US-1338:

```ts
// Before
mcpHint: "Use the open_url tool to open a URL in the built-in browser.",

// After
mcpHint: "Use pages.openUrlInBrowserTab(url, options) to open or reuse a URL in the built-in browser, then use pages[i].editor after narrowing editor.id to \"browser-view\".",
```

### 8. Enforce absent-value behavior in facade and page-summary answers

Replace fabricated getter fallbacks with conditional values:

```ts
// Before
return {
  id: tab?.id ?? "",
  url: tab?.url ?? "",
  title: tab?.pageTitle ?? "",
  loading: tab?.loading ?? false,
  active: true,
};

// After
if (!tab) return undefined;
return {
  id: tab.id,
  ...(tab.url ? { url: tab.url } : {}),
  ...(tab.pageTitle ? { title: tab.pageTitle } : {}),
  loading: tab.loading,
  active: true,
};
```

Apply the same conditional-spread rule to `summarize()` and any new screenshot/network result mapping. A missing key must not be created with an assigned `undefined`; it must be omitted before the `$call` JSON boundary. Preserve valid `false` loading, valid zero counts, and valid empty arrays.

The URL widening affects three existing consumers and must be handled explicitly. `IBrowserEditor.url` and the implementation getter become `string | undefined`; `BrowserEditorFacade.aiVision.summarize()` must conditionally include `url` and `activeTabId` rather than assigning possibly absent values; and `PageWrapper.aiSummary()` must conditionally include its browser URL. The structural cast in [`src/renderer/api/mcp/page-commands.ts`](../../../src/renderer/api/mcp/page-commands.ts) at `:47-54` also reads browser `state.url` for `list_pages`/`get_active_page`: change `result.url = state?.url` to a guarded assignment such as `if (agentMayAccessBrowserPage(state) && state?.url) result.url = state.url`. `McpPageInfo.url` is already optional, so this path omits an unavailable URL and cannot emit `null`; privacy-denied pages continue to omit it.

### 9. Live-verify the password snapshot line

### Verification note

Live check not run. The disposable page was created and removed, but `npm start` could not start its
Vite server in this environment (`spawn EPERM`), and the production Electron launch opened error
windows without exposing a usable call/facade transport. No password snapshot line is recorded or
claimed as verified.

Before marking the secret-boundary acceptance criterion complete, perform a live check against the actual Chromium instance rather than inferring it from `snapshot.ts`:

1. Create a disposable, uncommitted local HTML file containing one named `<input type="password">` and no other password-like control.
2. Open that file in a browser tab, type a fixed sentinel through the facade (for example, `pages[i].editor.type('input[type="password"]', 'US1335_SENTINEL')`), and call the same facade’s `snapshot()` once.
3. Record the password node’s snapshot line verbatim in the implementation/verification notes, including its role, accessible name, and ref if present, and explicitly record whether the sentinel/value appears. Delete the disposable file after the check; it is not a planned repository change.

The source-level statement remains precise even before this live check: `snapshot.ts` emits a role/name/ref and appends a non-empty AX `value` only when the AX tree supplies one. The live result, not an assertion about Chromium, is what the final help and acceptance record must cite.

### Files Changed Summary

| File | Planned change | Reason |
| --- | --- | --- |
| `src/renderer/scripting/ai-vision/browser-automation-members.ts` | Add shared descriptor members | One common browser automation descriptor source for browser-like hosts |
| `doc/tasks/US-1335-browser-page-surface/README.md` | Record the verified investigation and implementation contract | This task document |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` | Add missing members, explicit locators, overlay hint, chrome elements/highlight/help, and absent-safe answers | Browser page surface implementation |
| `src/renderer/automation/operations.ts` | Extend shared screenshot/network tab selection and expose shared locator-based reads | Keep all browser operations and locator handling in the US-1334 layer |
| `src/main/mcp/tools/call-tools.ts` | Detect image payloads call-wide and emit metadata text plus native image blocks | Preserve image visibility through the custom `call` handler |
| `src/renderer/api/types/browser-editor.d.ts` | Add/widen canonical browser facade types and documentation | Public API/type plumbing |
| `src/renderer/api/mcp/page-commands.ts` | Omit unavailable browser URLs instead of assigning an absent value | Keep list/get-active page summaries null-free |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Omit unavailable browser URLs from the page summary | Apply absent-value rule to the existing page summary |
| `src/renderer/editors/register-editors.ts` | Point browser `mcpHint` at `pages.openUrlInBrowserTab` | Correct entry path; US-1338 owns the member implementation |

### Files that need NO changes

| File | Verified reason |
| --- | --- |
| `src/renderer/automation/commands.ts` | Fourteen tool command cases already call the shared operations and already implement the required tab/close behavior; tool implementations are out of scope |
| `src/main/mcp/tools/browser-tools.ts` | Browser tool schemas and MCP image conversion already match the shared operations; tool implementations are out of scope |
| `src/main/mcp/types.ts` | `IMcpToolResult` already permits native image content blocks |
| `src/main/mcp/tool-results.ts` | Existing `toImageResult` and `toPageContentResult` provide the verified image-block precedents |
| `src/renderer/scripting/ai-vision/call.ts` | Existing resolver entry point correctly routes calls through descriptor restrictions |
| `src/shared/ai-vision/resolver.ts` | Existing per-hop restriction ordering and result shaping are sufficient; facade will omit absent keys before serialization |
| `src/renderer/editors/browser/BrowserView.ts` | All fourteen curated names already exist and survive the verified update paths |
| `src/renderer/scripting/api-wrapper/BoardEditorFacade.ts` | Used as the exact existing `createElements`/highlight pattern; no board-host work is in scope |
| `src/renderer/scripting/ai-vision/elements.ts` | Existing scoped element/highlight provider already supports `highlight(name, message?)` and `all: true` |
| `src/renderer/scripting/ai-vision/page-elements.ts` | Existing page scoping and page activation/layout wait are reused unchanged |
| `src/renderer/automation/snapshot.ts` | Existing AX formatter, iframe refs, and overlay detection are consumed unchanged; password behavior is verified live rather than inferred from this file |
| `src/renderer/automation/ref.ts` | US-1334’s host-local, registration-keyed ref store is consumed unchanged |
| `src/renderer/automation/CdpSession.ts` | Registration-key scope already exists and is the required ref boundary |
| `src/renderer/api/types/page.d.ts` | `IEditorFacade` already includes `IBrowserEditor` |
| `assets/editor-types/browser-editor.d.ts` | Generated by `editorTypesPlugin()`; never hand-edit |
| `vite.renderer.config.ts` | The generator already copies canonical editor declarations |
| `src/renderer/editors/browser/BrowserTabsModel.ts` | Existing tab verbs and last-tab behavior already satisfy the browser tab contract |

Out of scope and unchanged by this task: board host (US-1336), `window.screen` (US-1337), `open_url`/`pages.openUrl` (US-1338), `mcp.browser-tools.enabled` (US-1339), guides and QA (US-1340), the fourteen tool implementations, tests/test harnesses, and the dashboard.

## Concerns

1. **MCP image boundary.** The browser tool and the revised call-wide handler both return a native image content block. The facade’s canonical payload remains `{ type: "image", data, mimeType }`; the custom `call` handler converts it to metadata text plus an image block before the ordinary JSON/max-length path.

2. **Locator compatibility.** A string such as `"e52"` must continue to be treated as CSS, even though it resembles a ref. Only `{ ref: "e52" }` selects a snapshot ref. All malformed values must retain the shared error that names both accepted forms.

3. **Tab and ref scope.** A ref is valid only in the host-local CdpSession registration key for its browser target/tab/frame. Optional facade tab ids must be resolved by the shared operation layer so a ref cannot silently cross tabs.

4. **Chrome is not page content.** The address bar and toolbar cannot appear in the webview accessibility snapshot. `$help` must teach agents to use `elements`, while snapshot remains the sole page-content discovery surface.

5. **Conditional chrome.** `toolbar-tor-info` and `popup-blocked-bar` are valid declarations even when hidden/absent in the current state; their live `visible` result communicates availability. Transient controls are intentionally dropped from the curated default list.

6. **Re-render name loss.** UIKit deletes `data-name` when `name` is omitted from a later `update()`. The listed toolbar controls re-send their names in `BrowserToolbarView.sync()`; the tabs host and blocked-popup root retain stable names. Any implementation change must not replace those updates with name-less updates.

7. **Absent values at serialization.** Do not use empty-string/false/null sentinels for unavailable getters, and do not include object keys assigned `undefined`. Conditional spreads are required before the `$call` JSON boundary.

8. **Generated declarations.** The canonical type file is under `src/renderer/api/types/`; generated assets are build output. A build/regeneration check may verify the copy, but no generated declaration is hand-edited.

9. **Scope of read-helper widening.** The browser tools have no separate query command, and US-1334 left the existing query bodies in the facade. This task widens them only as facade reads over the same snapshot refs, moving their locator/read primitives to the shared operations layer; it does not add a tool or alter tool behavior. `check`, `uncheck`, and `clear` remain selector-only because no corresponding browser tool supports them.

10. **Privacy and sensitive content.** `snapshot`, `evaluate`, and `networkRequests` can expose page data, so they remain behind the existing `PageWrapper` gate. `snapshot.ts` guarantees only its own AX-property formatting; Chromium’s password behavior is established by the live check, not source inference. Network requests retain the existing raw operation result shape; this task adds no new logging or secret storage.

## Open Questions (resolved)

| Question | Resolution and source evidence |
| --- | --- |
| Should the facade adopt the overlay hint? | Yes. `operations.snapshot` already accepts `{ overlayHint }`, `browser_snapshot` enables it, and the descriptor currently overclaims Playwright-compatible output because it omits `# <overlay>`. Set the facade option to `true`. |
| What does `screenshot()` return through `$call`? | The facade/operations contract is the canonical `{ type: "image", data, mimeType: "image/png" }` payload. The revised call-wide handler detects it before JSON serialization and returns metadata text plus a native MCP image block; it also accepts the existing `{ image: { data, mimeType } }` page-content wrapper. |
| Do browser-tab verbs need aliases? | No. The existing `tabs`, `addTab`, `closeTab`, and `switchTab` members are the exact facade mapping recorded by EPIC-089. Add documentation, not `new`/`close`/`select` aliases. |
| Does `browser_close` close a Persephone page? | No. The verified operation calls `target.closeTab()` and returns `"Tab closed"`; the facade’s existing `closeTab()` must preserve that browser-tab meaning and return literal. No page removal API is involved. |
| Does `pages[i].editor.snapshot()` bypass privacy because the gate is not on `BrowserEditorFacade`? | No. `resolver.ts` checks each descriptor’s `restricted()` before the next hop; `PageWrapper`’s page descriptor calls `agentMayAccessBrowserPage` and `privateBrowserRefusal(state, "call")` before resolving `.editor`. No facade-local gate is added. |
| What may a password field reveal in a snapshot? | Source inspection cannot answer Chromium’s AX behavior. `snapshot.ts` prints role/name/ref and appends a non-empty AX `value` only when supplied; a live scratch-page check described in step 9 must type a sentinel, snapshot it, and record the exact password line before this task claims whether the value is absent. |
| Which browser names belong in `elements`? | Exactly the fourteen stable names listed above. The remaining source names are structural, repeated, or conditional/transient and are dropped for a useful default chrome surface. |
| Should read helpers accept refs even though there is no query tool? | Yes, as a facade convenience for refs returned by `snapshot()`. Their existing read behavior is moved/exposed through shared locator-aware operations; no tool schema or command case is added. `check`, `uncheck`, and `clear` stay selector-only because they have no ref-capable browser tool counterpart. |
| How should unavailable values cross `$call`? | Return `undefined` from getters and omit unavailable object properties entirely with conditional construction. Never use empty-string/false/zero/null sentinels or assign an `undefined` property. |
| Which URL-opening path should the editor hint advertise? | `pages.openUrlInBrowserTab(url, options)`, the canonical path owned by US-1338. US-1335 changes only the hint and does not implement or duplicate `open_url`. |
| Are generated editor declarations hand-edited? | No. Change `src/renderer/api/types/browser-editor.d.ts` and let `editorTypesPlugin()` regenerate `assets/editor-types/browser-editor.d.ts`. |

## Acceptance Criteria

- `doc/epics/EPIC-089.md` is linked from the task and every binding decision relevant to this surface is reflected in the plan.
- `BrowserEditorFacade` has one shared descriptor fragment for the common automation members and adds no duplicate browser command implementation.
- `click`, `hover`, `type`, `select`, and the five read helpers accept either a CSS selector string or `{ ref: string }`; strings are never guessed as refs, and malformed values use the shared error naming both forms.
- Existing selector-only calls and existing public behavior remain valid, including selector-only `check`, `uncheck`, and `clear`.
- `snapshot()` calls the shared operation with `overlayHint: true`; its descriptor and help accurately document `# <overlay>` and the `{ ref: "..." }` round trip.
- `hover`, `screenshot`, `networkRequests`, and composite `waitFor` are present in the facade/type/descriptor surface and use US-1334 shared operations. `waitFor` supports selector, text, text-gone, and time modes.
- Screenshot behavior is documented accurately: `$call` returns metadata text plus a native image block for `{ type: "image", data, mimeType }` when attached, `undefined` when unavailable, and uses the defined file/path fallback only if image blocks prove impossible; native MCP image conversion remains tool-side for browser tools.
- `browser_tabs` is documented as `tabs`/`addTab`/`closeTab`/`switchTab` with no aliases, and `browser_close` is documented and implemented as active browser-tab closure returning `"Tab closed"`, never Persephone-page closure.
- `$help.elements` contains exactly the fourteen curated, page-scoped chrome declarations; dropped structural, repeated, and transient names are documented with reasons.
- `$call`’s `highlight(name, message?)` follows the existing board-facade pattern, activates/waits for page layout, and uses `{ all: true }` so every match is ringed.
- `$help` explicitly explains that address-bar/toolbar controls are chrome in `elements` and webview content is in `snapshot()`.
- The privacy audit cites `PageWrapper.ts`’s `agentMayAccessBrowserPage`/`privateBrowserRefusal(state, "call")` guard and verifies that the resolver applies it before the deeper facade member. No bypass is introduced.
- A live Chromium check uses a disposable password-input page, types a sentinel through the facade, takes one snapshot, and records the password line verbatim before the final help claims the observed secret boundary; source inspection alone is not treated as proof.
- Every unavailable getter yields `undefined`; valid false/zero/empty-array states remain valid; absent object keys are omitted rather than assigned `undefined`.
- The browser editor `mcpHint` points to `pages.openUrlInBrowserTab(url, options)` and does not duplicate US-1338’s `open_url` implementation.
- `src/renderer/api/types/browser-editor.d.ts` is the only hand-maintained editor declaration changed; generated assets are regenerated, not hand-edited.
- No files outside the planned changed-file table are modified, and no tests, test harnesses, tool implementations, guides, QA files, dashboard entry, or commit are created by this task.


## Live verification (2026-09-06)

Run through `call` and `execute_script` against the running dev build, on a scratch local HTML
file (`pwtest.html`: a password input, a text input, a button) and on `https://example.com`.

### The secret boundary is stronger than the plan claimed

The plan's corrected wording said only that the formatter prints the `value` accessibility property
when present. The live answer is better than that, and is recorded here as the fact the epic's
secret audit needs. After typing `hunter2-SECRET-probe` into the password field **and**
`visible-plain-text` into the ordinary text field, the snapshot was byte-for-byte:

```
- heading "Probe" [level=1] [ref=e8]
- form [ref=e9]
  - LabelText [ref=e10]
    - StaticText "Passphrase" [ref=e17]
  - textbox "Passphrase" [ref=e3]
  - LabelText [ref=e12]
    - StaticText "Plain" [ref=e19]
  - textbox "Plain" [ref=e13]
  - button "Go" [ref=e15]
```

**`snapshot()` returns no field value at all** — not for the password field, and not for the
ordinary text field either. A typed value is never in the snapshot, so the boundary does not depend
on Chromium special-casing `type="password"`. `evaluate()` and `getValue()` can still read both,
which is the EPIC-087 decision 7 case: the existing surface already exposes them.

### Verified member behaviour

| Check | Result |
|---|---|
| `editor.snapshot()` on a browser page | ref-bearing tree, refs usable |
| `editor.click({ ref: "e15" })` | acts on the referenced element |
| `editor.click("e15")` | `Element not found: e15` — a bare string is a CSS selector, never guessed as a ref (decision 4) |
| `editor.click({ ref: 42 })` | `Expected a CSS selector string or an object of the form { ref: string }.` |
| `editor.hover({ ref })` on a changed DOM | `Ref "e15" is stale — the element is no longer in the DOM. Re-take the snapshot.` |
| `editor.waitFor({ text, timeout })` / `waitFor({ time })` | both modes resolve |
| `editor.networkRequests()` | array |
| `editor.type` / `click` on a missing selector | both throw `Element not found: <selector>` |
| `editor.screenshot()` through `call` | metadata text `{ type, mimeType }` **plus a real MCP image block** — the agent sees the picture, and `data` is stripped from the metadata |
| `editor.elements` | 14 entries, page-scoped, live `visible` |

The `call`-wide image change is the one that mattered: without it `screenshot()` would have returned
base64 inside JSON, truncated by `maxLength`, invisible to the model — and `browser_take_screenshot`
would have had to stay unmarked.

### Two findings that are not this task's code

1. **`elements` found a real UI bug on its first run.** `toolbar-tor-info` reported `visible: true`
   on a non-Tor page. It was not an `elements` defect — the button really was rendered on every
   browser page, because `IconButtonView.applyProps` dropped the `hidden` prop on `update()`. Fixed
   separately as **US-1341**. This is the UI-regression property the roadmap predicted these surfaces
   would have, arriving on day one.

2. **`openUrlInBrowserTab` returns a page id before the document has settled.** Typing into the
   scratch page immediately after the opener returned reported success and left both fields empty —
   the action landed on a document that was then replaced. Both `type()` and `click()` do throw
   `Element not found` for a genuinely missing element, so this is a load race, not a silent-accept
   defect. It is still a silent success from the agent's point of view, which is the failure class
   this roadmap exists to remove, so **US-1338** must say in `openUrlInBrowserTab`'s `$help` that the
   returned page is not necessarily loaded and that `waitForNavigation()` or `waitFor({ selector })`
   comes first, and **US-1340** must carry a QA scenario for it.
