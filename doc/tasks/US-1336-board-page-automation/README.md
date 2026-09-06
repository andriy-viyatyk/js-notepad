# US-1336 — The board page host: the same automation member set on the board facade, with the readiness gate

## Status

**Status:** Implemented (pending epic review)  
**Priority:** High  
**Epic:** [EPIC-089 — The browser and the app window through `call`](../../epics/EPIC-089.md)  
**Depends on:** [US-1334 — Per-host ref stores and callable automation command bodies](../US-1334-ref-lifecycle/README.md), [US-1335 — The browser page surface](../US-1335-browser-page-surface/README.md)  
**Scope:** Board facade implementation; no tests, dashboard edit, or commit

## Goal

Expose the shared EPIC-089 automation members on `BoardEditorFacade` so a trusted board can be
snapshotted and driven through `call` using the same typed operations as browser pages. Preserve the
board's real capability boundary—secondary-view frames are tabs, navigation and agent-created tabs
are not—and put the board readiness gate in front of every operation that can attach to a frame.

## Background

### Binding decisions and current boundary

EPIC-089 decisions 2–4 are binding here:

- `src/renderer/automation/operations.ts` is the single owner of browser command behavior. The
  board facade must call those exported operations; it must not copy command bodies or create a
  board-only selector/ref implementation.
- `src/renderer/scripting/ai-vision/browser-automation-members.ts` is the one descriptor fragment
  for the common ten-member set: `snapshot`, `click`, `hover`, `type`, `select`, `pressKey`,
  `evaluate`, `waitFor`, `screenshot`, and `networkRequests`.
- A host capability it does not have is absent from its descriptor, rather than present and
  throwing. The board therefore omits navigation, while retaining its frame-backed tabs and the
  real action of switching between them.
- A plain facade string is always a CSS selector. Only `{ ref: string }` is a snapshot ref; the
  board must use `resolveElementLocator()` from `operations.ts` and never infer from ref-like text.

`doc/epics/EPIC-089.md:352-365` already links US-1336 as the planned board surface. The dashboard
entry exists at `doc/active-work.md:11-19`; it is deliberately unchanged because the user owns the
dashboard.

Explicitly out of scope are `window.screen` (US-1337), `open_url`/`pages.openUrl` (US-1338), the
`mcp.browser-tools.enabled` setting (US-1339), guides and `qa/` files (US-1340), the browser facade,
and all fourteen tool implementations. This task document records their no-change boundary below;
it does not implement or edit any of them.

### Existing board facade

`src/renderer/scripting/api-wrapper/BoardEditorFacade.ts:26-39` currently describes only board
metadata and `reload()`. Its `$help` at `:41-60` explicitly says that snapshot, click, and other
content interaction are not present and points to EPIC-089. That sentence becomes false when this
task lands and must be replaced, not appended to.

The facade already has the required trust descriptor at `:76-84` and the implementation at
`:177-181`:

```ts
restricted: () => this.restricted(),

private restricted(): string | undefined {
    return this.renderState === "untrusted"
        ? "This board's content is restricted ..."
        : undefined;
}
```

Its current `members` construction is the insertion point:

```ts
members: [...BOARD_MEMBERS, ...elements.members],
```

The existing `BOARD_ELEMENTS`, `createElements()` call, model-backed state getters, and
`reload()` contract remain. Automation is added beside those members and does not replace the
board metadata or chrome surface.

### Shared automation already implemented by US-1334/US-1335

`src/renderer/scripting/ai-vision/browser-automation-members.ts:4-15` contains exactly the shared
descriptor fragment. It already documents explicit refs, overlay output, and the screenshot call
payload. `BrowserEditorFacade` consumes it at
`src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:100-113` and routes each shared method
through `operations.ts` after `ensureTargetReady()`.

The corresponding shared operations are present in
`src/renderer/automation/operations.ts`:

| Facade member | Shared operation | Verified operation behavior |
| --- | --- | --- |
| `snapshot` | `snapshot()` at `:37-47` | Uses `target.cdp(tabId)`, optional overlay detection, and `buildSnapshot()` once. |
| `click` | `clickElement()` at `:118-136` | Focuses the target, resolves selector/ref explicitly, and invokes the same CDP body. |
| `hover` | `hoverElement()` at `:139-161` | Uses the same selector/ref dispatch and synthetic hover events. |
| `type` | `typeTextInto()` at `:164-177` | Reuses `input.ts`'s visible-match, native-setter, slow, submit, and ref-aware mechanics. |
| `select` | `selectOption()` at `:180-200` | Preserves the value/values alias result and change event. |
| `pressKey` | `pressKeyOnTarget()` at `:203-210` | Focuses the target and reuses compound-key parsing. |
| `evaluate` | `evaluateInTarget()` at `:212-219` | Returns the raw evaluated result. |
| `waitFor` | `waitFor()` at `:297-359` | Supports selector, text, text-gone, and time modes with existing timeout behavior. |
| `screenshot` | `takeScreenshot()` at `:400-413` | Returns the existing PNG payload or `undefined` when requested as unavailable-safe. |
| `networkRequests` | `networkRequests()` at `:415-419` | Uses the active/explicit target tab's registration key for the existing log. |

`ensureTargetReady()` at `operations.ts:361-363` is the shared precondition. It awaits the
target's optional `ensureReady()` and is currently a no-op for `BrowserTargetModel`, which has no
such method. US-1336 will widen this existing helper to accept an optional target tab id and will
call it from every board operation method before the operation is invoked. `IBrowserTarget.ensureReady`
will likewise accept an optional tab id; `BoardTargetModel.ensureReady(tabId?)` will use that id or
the active id, while browser/app targets preserve their current behavior. The facade must not call
`pagesModel.showPage()`; activation belongs to the MCP target resolver, not to facade operations.

The MCP dispatcher in `src/renderer/automation/commands.ts` already calls these same operation
functions and awaits `target.ensureReady?.()` with no argument. US-1336 leaves that call unchanged:
the omitted argument continues to ready the target's active tab exactly as it does today. The
fourteen tool schemas, dispatcher, and tool implementations remain alone. The move audit is
therefore straightforward: each board member names the shared operation it invokes, and no second
command body may appear in `BoardEditorFacade.ts`.

### Exactly what the board target supports

`src/renderer/editors/board/BoardTargetModel.ts` is the authoritative adapter:

| Capability | Source evidence | Board facade result |
| --- | --- | --- |
| CDP access | `cdp(tabId?)` at `:47-50` returns a session for the active or explicit board frame. | Supports all ten shared operation bodies. |
| Focus and input | `focusWebview()` / `insertText()` at `:53-63` focus the cross-origin iframe or evaluate insertion in its CDP session. | Supports `click`, `hover`, `type`, and `pressKey` through shared operations. |
| Page evaluation and DOM actions | `cdp()` is the common seam; `operations.ts` only needs `IBrowserTarget`. | Supports `snapshot`, `evaluate`, `select`, `waitFor`, `screenshot`, and `networkRequests`. |
| Navigation | `navigate`, `back`, and `forward` all throw `NAV_MSG` at `:66-74`. | Omit `navigate`, `back`, and `forward`; they are absent, not present-and-throwing. |
| Reload | `reload()` at `:75-78` remounts board frames and re-registers CDP. | Leave the existing board facade `reload()` untouched; it is the verified `board_refresh` replacement and must not be shadowed by a new shared/parity member. |
| Frame tabs | `tabs` at `:81-105` returns the main frame plus declared secondary views. | Keep `tabs` and `activeTab` as board frame metadata. |
| Agent-created tabs | `addTab()` and `closeTab()` throw `TAB_MSG` at `:108-116`; the manifest fixes the frame set. | Omit `addTab` and `closeTab`. |
| Frame selection | `switchTab()` at `:123-133` validates a main or declared secondary id and awaits mounting. | Keep `switchTab`, with a `Promise<void>` public contract and an explicit `await`. |

The browser facade's extra query helpers (`getText`, `getValue`, `getAttribute`, `getHtml`, and
`exists`), checkbox helpers (`check`, `uncheck`, `clear`), and browser-only wait aliases
(`waitForSelector`, `waitForNavigation`, and `wait`) are not in the shared ten-member fragment and
are not added to the board facade. This is a surface-scope decision, not a claim that CDP could
never perform those operations in a board frame. The only tab verbs retained are the board's real
list/read/switch actions; `addTab` and `closeTab` are absent because the target rejects them.

### Board tabs and the readiness gate

`src/renderer/editors/board/BoardEditorModel.ts:126-145` provides one stable target and the
frame state that makes board readiness different from browser readiness:

- `target` is one `BoardTargetModel` instance.
- `frames` is keyed by `"main"` and `"board-secondary:<viewId>"`.
- `loadedTabs` contains only frames that finished loading and registered for CDP.
- `activeTabId` defaults to `BOARD_CDP_TAB` (`"main"`).

`BoardTargetModel.tabs` maps the main frame and `secondaryViewDefs` into `ITargetTab` records. A
secondary tab reports `loading: true` until its frame is in `loadedTabs`. `switchTab()` sets the
active id and awaits `mountAndWait()`, while `ensureReady()` at `:141-145` expands the secondary
panel and awaits `waitForFrameLoad()` when the active frame is not attachable. The model comment at
`:136-139` is explicit that a mounted-but-unregistered frame would make `cdp-service` throw.

The board facade must therefore follow this shape for every member that can attach to a frame:

```ts
// Before: BoardEditorFacade has no content operation.
// After: every shared operation is preceded by the shared gate.
async snapshot(options?: TabOption): Promise<string> {
    await ensureTargetReady(this.editor.target, options?.tabId);
    return snapshot(this.editor.target, options?.tabId, { overlayHint: true });
}

async click(locator: IBrowserElementLocator, options?: TabOption): Promise<void> {
    await ensureTargetReady(this.editor.target, options?.tabId);
    await clickElement(this.editor.target, resolveElementLocator(locator), options?.tabId);
}
```

For a board frame explicitly selected with `switchTab`, the implementation must preserve the
shared operation's target/tab routing and invoke the gate before attaching. Every shared operation
that accepts `tabId` passes the same id to `ensureTargetReady(this.editor.target, tabId)`, so a
closed, not-yet-loaded secondary is mounted before `target.cdp(tabId)` is created. The default
active-frame path remains unchanged because an omitted id still resolves to
`this.model.activeTabId`. `switchTab` itself must await `this.editor.target.switchTab(tabId)`—`IBrowserTarget`
declares `void | Promise<void>` at `src/renderer/automation/types.ts:43`, and the board
implementation is async. Returning before that promise resolves recreates the secondary-frame
race even when every later method calls `ensureTargetReady()`.

The pure `tabs` and `activeTab` reads do not attach to CDP and therefore do not need to await a
readiness gate. The tab-switch action and all ten target operations do. This distinction must be
documented in the implementation rather than hiding a delayed side effect inside a property
getter.

### Cross-origin board iframe and ref lifecycle

The file name `BoardWebview.ts` does not mean the board is an Electron webview. Its header comment
at `src/renderer/editors/board/BoardWebview.ts:34-39` calls it a locked-down host for one
cross-origin board iframe, and `createIframe()` at `:132-149` creates an ordinary
`<iframe src="board://...">`. EPIC-088 records the same finding at `doc/epics/EPIC-088.md:73-75`
and `:201-208`: content is in a cross-origin iframe, and the previous board facade intentionally
stopped at the host.

The board frame registration path is verified end to end:

```ts
// BoardWebview.ts:237-245
api.registerBoardFrame(model.id, host, this.boardId, this.tabId)

// ipc/main/board-handlers.ts:57-61
registerBoardFrame(`${boardId}/${tab}`, event.sender, boardHost, frameNonce)

// BoardTargetModel.ts:47-50
new CdpSession(`${this.model.id}/${tabId ?? this.model.activeTabId}`)
```

`BoardWebview.handleLoad()` calls `model.markFrameLoaded(tabId)` only after registration
resolves. The key used by CDP and the key used by the renderer ref store are consequently the
same:

- Main board frame: `${model.id}/main` (`BOARD_CDP_TAB` is `"main"`).
- Secondary view: `${model.id}/${tabId}`, where `tabId` is
  `board-secondary:<viewId>`.

`buildSnapshot()` at `src/renderer/automation/snapshot.ts:59-99` formats main-frame refs as
`e<backendDOMNodeId>` and iframe refs as `f<frameIndex>-e<backendDOMNodeId>`. It writes the iframe
session map under `cdp.registrationKey` for both the empty-iframe path (`:66-68`) and the merged
iframe path (`:71-94`). US-1334's `src/renderer/automation/ref.ts:21-32,52-97` stores one latest
map per registration key; `resolveRef()` and `callOnRef()` look up the map from the caller's
`CdpSession.registrationKey` and fail closed if that host has no map or frame index.

Therefore two board frames cannot cross-resolve each other's iframe refs:

1. A main-frame snapshot stores its map under `${model.id}/main`.
2. A secondary-view snapshot stores its map under `${model.id}/board-secondary:<viewId>`.
3. A later action builds the session from the selected/explicit tab and looks up only that key.
4. A ref handed from the other frame finds no matching frame-session entry and throws the
   host-local snapshot/stale-frame error; it never falls back to another board frame or the main
   session.

Main-frame refs are likewise resolved through the caller's `CdpSession`; they do not use the
iframe map. The board implementation must pass locators directly to these existing operations and
must not keep a second ref store, parse refs itself, or change `parseRef()`/stale-ref wording.

### Trust, privacy, and not-found behavior

The board's trust boundary is the facade's own `restricted()` method, not the browser-page privacy
guard. `src/shared/ai-vision/resolver.ts:73-88` calls the current descriptor's `restricted()` before
each member hop. For `pages[i].editor.snapshot()` or any other board automation member, the
resolver reaches the `BoardEditorFacade` descriptor and checks `restricted()` before invoking the
member. An untrusted board therefore cannot be snapshotted, evaluated, clicked, typed into,
selected, keyed, waited on, screenshotted, network-inspected, listed, or switched through this
facade. `$help` remains available so the agent can learn about the Trust-this-Board dialog.

`PageWrapper.aiRestricted()` at `src/renderer/scripting/api-wrapper/PageWrapper.ts:234-243` is
specifically the private-browser-page guard. It does not cover boards, so no browser privacy guard
should be copied into the board facade. The board facade's existing `restricted()` is the same gate
for the newly added content members and the existing board members.

`renderState === "not-found"` is different: `BoardEditorFacade.restricted()` returns `undefined`
for it because an unresolved/empty board is not a privacy boundary. The new members must not turn
that state into a fake trust refusal or a silently successful empty snapshot. Model-only metadata
may report its existing absent values; a target operation that has no registered frame reports the
existing CDP/target failure, except for the established `screenshot()` unavailable-safe result.

### Absent values, privacy, ref, and move audits

EPIC-089 decision 10 applies even though TypeScript `strictNullChecks` is off:

- `tabs` is a valid collection from `BoardTargetModel.tabs`; it is not replaced with `undefined`.
- `activeTab` follows `BoardTargetModel.activeTab` and is typed as possibly absent; if it is absent,
  the facade returns `undefined` and does not construct an object with assigned undefined fields.
  The current target normally supplies the synthetic main tab, including for an unresolved model,
  so the normal result is a real tab record rather than a fabricated empty-string sentinel.
- `screenshot()` returns `undefined` when its session is unavailable, as the shared operation
  already supports; no `{ screenshot: undefined }` wrapper is created.
- `networkRequests()` preserves the shared array result, including a valid empty array. It does not
  turn an unavailable target into `null`, `false`, `0`, or `""`.
- `snapshot()`, `evaluate()`, and action methods return their existing string/raw/void results or
  throw the target's actual error when no frame can attach. They do not manufacture an empty answer.
- `BoardEditorFacade.aiVision.summarize()` keeps its existing conditional spreads. Any new summary
  or tab object must omit unavailable keys rather than assigning `undefined`, because the call
  boundary can otherwise serialize them as `null`.

The privacy audit is the resolver check above for every descriptor path; there is no alternate
board automation entry point in this task. The ref audit is the registration-key mapping above for
every member that takes a target; plain strings stay selectors and `{ ref: string }` is the only
ref form. The move audit names the ten `operations.ts` functions in the table and requires that
the MCP dispatcher continue calling those same functions. No operation body may be reimplemented
in `BoardEditorFacade.ts`.

US-1335's live verification is the source for the input-value statement. Its task document records
that after typing both a password sentinel and ordinary plain text, `snapshot()` returned **no input
field values at all**—neither password nor plain text (`doc/tasks/US-1335-browser-page-surface/README.md:475-502`).
US-1336 must cite that verified result and must not re-derive or weaken it from
`snapshot.ts`'s formatter source. `evaluate()` and `getValue()` remain existing surfaces that can
read values; US-1336 does not add a new secret-taking member.

## Implementation Plan

### 1. Extend the public board facade type without duplicating browser command types

Update `src/renderer/api/types/board-editor.d.ts` to import the already-canonical browser locator,
tab, screenshot, and network-request shapes from `browser-editor.d.ts`. Add the ten shared methods,
`tabs`, `activeTab`, and an async `switchTab(tabId)` to `IBoardEditor`. Keep the existing board
metadata, `reload()`, and optional/undefined contracts unchanged. Do not hand-edit
`assets/editor-types/board-editor.d.ts`; it is generated from the canonical declaration.

Before:

```ts
export interface IBoardEditor {
    // board metadata, reload(), and no iframe automation
}
```

After:

```ts
export interface IBoardEditor {
    // existing board metadata and reload()
    readonly tabs: IBrowserTab[];
    readonly activeTab: IBrowserTab | undefined;
    snapshot(options?: { tabId?: string }): Promise<string>;
    click(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;
    // hover/type/select/pressKey/evaluate/waitFor/screenshot/networkRequests
    switchTab(tabId: string): Promise<void>;
}
```

Use the exact shapes already used by `IBrowserEditor`; do not create a board-specific locator
union or duplicate `IBrowserScreenshot`/`IBrowserNetworkRequest` interfaces.

### 2. Hang the one shared descriptor fragment on the board facade

Update `src/renderer/scripting/api-wrapper/BoardEditorFacade.ts` to import
`BROWSER_AUTOMATION_MEMBERS`, the typed operations, `resolveElementLocator`, and the canonical
browser API types. Add board-specific descriptor entries only for `tabs`, `activeTab`, and
`switchTab`, because those are the board's secondary-frame controls. Do not spread the browser
facade's `BROWSER_EDITOR_MEMBERS`: that would advertise navigation, agent-created tabs, and
browser-only convenience helpers that are not this surface.

Before:

```ts
members: [...BOARD_MEMBERS, ...elements.members],
help: BOARD_HELP,
```

After:

```ts
members: [
    ...BROWSER_AUTOMATION_MEMBERS,
    ...BOARD_AUTOMATION_TAB_MEMBERS,
    ...BOARD_MEMBERS,
    ...elements.members,
],
help: BOARD_HELP,
```

`BROWSER_AUTOMATION_MEMBERS` needs no host-omission parameter: every one of its ten members is
supported by `BoardTargetModel`. The board-specific omissions are outside that fragment and are
handled by not declaring them. If a later implementation proves a shared member needs an option
variant, parameterize the existing fragment; never fork its ten entries in `BoardEditorFacade.ts`.

### 3. Implement the ten members through shared operations and the board target

Each CDP-capable method must call
`await ensureTargetReady(this.editor.target, options?.tabId)` before invoking the corresponding
function from `operations.ts`, passing the same optional target tab id to the operation. The
methods are:

- `snapshot` → `ensureTargetReady(this.editor.target, options?.tabId)` then
  `snapshot(this.editor.target, options?.tabId, { overlayHint: true })`.
- `click`/`hover`/`select` → `resolveElementLocator(locator)` followed by the matching operation.
- `type` → `resolveElementLocator(locator)` followed by `typeTextInto`, preserving `slowly` and
  `submit` and the existing shared input implementation.
- `pressKey` → `pressKeyOnTarget`.
- `evaluate` → `evaluateInTarget`.
- `waitFor` → the existing discriminated `WaitMode` construction and `waitFor` operation; keep
  exactly-one-mode validation and timeout units.
- `screenshot` → `takeScreenshot` with the established unavailable-safe option.
- `networkRequests` → `networkRequests` with the selected/active board tab.

The board facade must not call `buildSnapshot`, `callOnRef`, `cdp.send`, `document.querySelector`,
or the low-level input bodies directly for these members. Those are already owned by the shared
operations/ref/input layers.

### 4. Implement board frame tabs with an awaited switch

Add `tabs` and `activeTab` reads backed by `this.editor.target.tabs` and
`this.editor.target.activeTab`. Add `switchTab(tabId: string): Promise<void>` that delegates to
the target's existing switch action and awaits it:

```ts
async switchTab(tabId: string): Promise<void> {
    await this.editor.target.switchTab(tabId);
    await ensureTargetReady(this.editor.target, tabId);
}
```

The second await is idempotent for the selected loaded secondary and makes the facade's readiness
postcondition explicit. The first await is mandatory: `IBrowserTarget.switchTab` is
`void | Promise<void>`, while `BoardTargetModel.switchTab` calls `await mountAndWait(tabId)` for a
secondary view. Do not cast it to `void`, call it without awaiting, or reimplement panel mounting
in the facade.

Preserve the target's `Unknown board view '<id>'` error. `addTab` and `closeTab` do not receive
descriptor entries or facade methods. Existing board `reload()` remains the model's
`reloadAndWait()` operation and is not replaced with `target.reload()`.

### 5. Make the readiness contract explicit for every attach path

Audit every new board method for the ordering:

```text
resolver checks BoardEditorFacade.restricted()
  → facade awaits ensureTargetReady(target, tabId)
  → facade invokes shared operation
  → operation creates target.cdp(tabId)
```

For `switchTab`, the order is the target's awaited frame mount followed by the shared readiness
check. For `tabs` and `activeTab`, document that they are model-only reads and do not attach to CDP.
For methods with an explicit `tabId`, pass that same id to the widened shared precondition so it
covers the frame that the operation will attach to. The existing typed input option will also be
forwarded through `operations.ts`/`input.ts`; it must never become a board-only command body.

This is the implementation's race audit: a board secondary frame must be mounted and registered
before `snapshot`, ref resolution, CDP evaluation, input, screenshot, or network-log access begins.

The shared seam change is deliberately small and typed:

```ts
// Before: operations.ts / types.ts
export async function ensureTargetReady(target: IBrowserTarget): Promise<void> {
    await target.ensureReady?.();
}

// After: same shared precondition, with the frame identity carried through
export async function ensureTargetReady(target: IBrowserTarget, tabId?: string): Promise<void> {
    await target.ensureReady?.(tabId);
}

// BoardTargetModel keeps the active-tab default while supporting explicit frame options.
async ensureReady(tabId = this.model.activeTabId): Promise<void> {
    if (tabId === BOARD_CDP_TAB || this.model.loadedTabs.has(tabId)) return;
    await this.mountAndWait(tabId);
}
```

`typeTextInto()` and `input.ts` receive the same optional `tabId` so focus, `cdp()`,
`insertText()`, and slow typing all use the frame that passed the readiness gate. The existing
browser facade does not forward its currently unforwarded option and is not changed by this task;
the browser tool path keeps its active-tab default. Board methods forward their explicit frame id.

### 6. Correct `$help` and preserve the trust explanation

Replace the false final paragraph in `BOARD_HELP`. The new help must say, in one coherent surface
description:

- board content is in a cross-origin iframe, and the shared automation members now reach it;
- use `snapshot()` for content and pass its refs as `{ ref: "..." }`; plain strings are selectors;
- the board page's own chrome—toolbar controls, the trust prompt, and secondary-view controls—is
  what `elements` names and `highlight` points at; it is not board iframe content;
- everything rendered inside the board's cross-origin iframe is reachable only through `snapshot()`
  and its returned refs, and never appears in `elements`; a board control absent from a snapshot
  belongs in `elements`, while iframe content absent from `elements` belongs in `snapshot()`;
- board `tabs` are the main frame and declared `board-secondary:<viewId>` frames;
- call `switchTab(tabId)` before driving a secondary view and wait for it to complete;
- navigation and creating/closing tabs are not supported and are absent from the member list;
- untrusted content remains restricted by the existing Trust-this-Board gate;
- trusted and not-found render states differ as already described; not-found is not a privacy grant;
- screenshot returns the existing metadata-plus-image call result when available;
- the observed US-1335 snapshot boundary is that no password or plain-text input values appear in
  snapshots, without claiming this was re-proven in US-1336.

Do not retain the current statement that board content is out of reach or that these operations
belong to a future EPIC-089 task.

### 7. Verify all four per-surface audits by source and live `call` behavior

Before implementation is considered complete, review the changed facade against these records:

1. **Absent values:** no undefined-valued keys; valid empty arrays stay arrays; unavailable
   screenshot is `undefined`; not-found operations do not become empty success.
2. **Privacy:** every path is reached through the facade descriptor's `restricted()` check at
   `resolver.ts:85-87`; no PageWrapper/browser privacy workaround or direct alternate path is
   introduced.
3. **Refs:** snapshot and target action use the same registration key for each board tab; plain
   strings are selectors; `{ ref: string }` is explicit; refs cannot resolve across board frames.
4. **Moves:** the board calls the named `operations.ts` functions already used by the MCP
   dispatcher; no command body is copied into the facade.

The manual live path must use `call` on a trusted board with at least one secondary view: take a
main snapshot, switch to a secondary and await completion, snapshot and act there by an explicit
ref, then use a ref minted in the main frame against the secondary (and vice versa). Each
cross-frame action must produce the host-local fail-closed ref message and must not act on the other
frame. If no board with a secondary view is available on the machine, record that plainly as
**not verified**; do not mark ref isolation verified by source inspection alone. Repeat the content
path on an untrusted board and confirm the facade restriction is returned before any CDP work. A
not-found board should show the non-restricted empty/model state and target failure behavior rather
than a trust refusal. Do not add a unit test, test harness, QA file, guide, or tool implementation
for these checks; US-1340 owns the acceptance QA file.

## Live verification (2026-09-06)

The cross-frame `call` check is **not verified**. No usable Persephone/Electron call transport or
running board was available in this environment. An attempt to start the app with `npm start`
failed before the Vite renderer server started with `Error: spawn EPERM`. Consequently, the trusted
main/secondary ref round trip, cross-frame fail-closed actions, untrusted restriction, and not-found
target behavior could not be exercised live. Source inspection was not counted as verification.

## Concerns

1. **Readiness can be lost by a missing await.** `BoardTargetModel.switchTab()` is the only target
   implementation whose `switchTab()` is asynchronous. The plan requires an awaited delegation and
   a post-switch readiness check, and every CDP-capable member awaits the shared precondition.

2. **Explicit tab options must not bypass mounting.** The shared descriptor exposes optional
   `tabId` options. The implementation widens the existing readiness seam in place so it covers the
   same explicit tab before `target.cdp(tabId)` is created; it must not create a board-only helper or
   silently rely on `loadedTabs` by inspection.

3. **Cross-origin does not mean webview.** `BoardWebview` uses an ordinary cross-origin iframe and
   the host renderer cannot reach its DOM by same-origin JavaScript. All board DOM work must stay
   on the CDP target seam; `focusWebview()` focuses the iframe element and `insertText()` uses the
   board frame's CDP session.

4. **Refs are frame-local and snapshot-local.** A ref from `${model.id}/main` must not be resolved
   with `${model.id}/board-secondary:<viewId>`, and a ref from one board page must not be resolved by
   another. US-1334's registration-key map already provides this fail-closed behavior; this task
   must pass the right `CdpSession` and must not introduce a second map.

5. **Trust is not the same as resolution.** Untrusted boards are blocked by the facade's
   `restricted()` gate. Not-found boards are not restricted, but their missing frame must not be
   represented as a fabricated successful snapshot or action. Existing target/ CDP errors remain
   the diagnostic for attach-required methods.

6. **The browser facade is not part of this task.** `BrowserEditorFacade.ts` is the verified US-1335
   consumer and remains unchanged. Board work consumes its shared fragment and operations; it does
   not add browser members, aliases, or browser-specific fixes.

7. **The existing board reload must not be shadowed.** `BoardEditorFacade.reload()` remains
   untouched as the verified `board_refresh` replacement, including its frame-ready wait. The
   shared automation fragment has no reload member, and no broad parity expansion may add one to
   this facade.

8. **Input values must not be re-audited from formatter source.** The exact US-1335 live result is
   the citation: snapshots contained neither password nor ordinary text input values. `evaluate()`
   and existing value reads remain capable of exposing page data, so trust gating still covers all
   new members.

9. **No silent absent-value coercion.** `undefined` properties would cross `call` as `null` in the
   failure case described by EPIC-089 decision 10. Conditional object construction and the target's
   existing tab records are required.

## Acceptance Criteria

- [x] `BoardEditorFacade.aiVision.members` spreads the exact
      `BROWSER_AUTOMATION_MEMBERS` fragment; no copied ten-member descriptor exists.
- [x] `snapshot`, `click`, `hover`, `type`, `select`, `pressKey`, `evaluate`, `waitFor`,
      `screenshot`, and `networkRequests` call the corresponding exported operation from
      `src/renderer/automation/operations.ts`, with no command body duplicated in the facade.
- [x] Every CDP-capable board facade method awaits `ensureTargetReady(target, tabId)` before calling
      its shared operation; the exact same `tabId` reaches the operation's `cdp(tabId)`, so explicit
      targeting cannot attach a not-yet-loaded secondary frame. The MCP path still calls
      `target.ensureReady?.()` with no argument and therefore retains active-tab behavior.
- [x] `switchTab(tabId)` returns `Promise<void>`, awaits `BoardTargetModel.switchTab()`, and leaves
      the selected secondary attachable before the call resolves. No unawaited `void` cast exists.
- [x] `tabs`, `activeTab`, and `switchTab` describe the main frame and declared secondary frames;
      `addTab` and `closeTab` are absent because `BoardTargetModel` rejects agent-created tabs.
- [x] `navigate`, `back`, and `forward` are absent because `BoardTargetModel` throws
      `NAV_MSG`; no present-and-throw member is advertised. Browser-only query/checkbox/wait alias
      helpers remain outside the shared board surface.
- [x] Existing `BoardEditorFacade.reload()` is untouched and remains the board model's
      reload-and-wait `board_refresh` replacement; it is not shadowed or replaced by a copied
      automation reload body.
- [x] The board public declaration imports the canonical browser locator/tab/screenshot/network
      types, adds the shared methods and async switch, and does not hand-edit generated editor
      declarations.
- [x] `$help` no longer says board content is unreachable or points forward to EPIC-089 for these
      operations; it explicitly assigns board chrome (toolbar, trust prompt, secondary-view
      controls) to `elements`/`highlight` and iframe content to `snapshot()`/refs, then explains
      tabs, omitted capabilities, screenshot output, trust, and not-found behavior.
- [x] `restricted()` is still the facade descriptor gate. A call to every new member on an
      untrusted board is refused by `resolver.ts:85-87` before CDP attachment; not-found is not
      described as a trust refusal.
- [x] A board main-frame snapshot stores refs under `${model.id}/main`; each secondary snapshot
      stores refs under `${model.id}/${tabId}`. Cross-frame refs fail closed and never fall through
      to another board frame or the main session.
- [x] Plain strings remain CSS selectors; only `{ ref: string }` resolves a snapshot ref, and the
      shared malformed-locator error is preserved.
- [x] Absent values are represented by `undefined` only where the public contract allows it, and
      absent object keys are omitted from call answers. Empty request/tab arrays remain valid arrays;
      unavailable screenshots return `undefined` without an undefined-valued wrapper key.
- [x] The task cites US-1335's live finding that snapshots contain no password or plain-text input
      values and does not claim a new derivation or a new secret boundary.
- [ ] Manual `call` verification covers a trusted main frame, an awaited secondary switch, a ref
      action, and fail-closed cross-frame ref isolation; if no suitable board exists, the document
      records that isolation is **not verified** rather than inferring it. The same run covers
      untrusted refusal and not-found target behavior. No unit tests, test harnesses, QA/guides,
      tool implementations, browser facade changes, dashboard edit, or commit are created by this
      task.

## Files Changed Summary

| File | Planned change | Reason |
| --- | --- | --- |
| `doc/tasks/US-1336-board-page-automation/README.md` | This verified investigation, implementation contract, audits, acceptance criteria, and file inventory. | Task documentation |
| `src/renderer/scripting/api-wrapper/BoardEditorFacade.ts` | Import the shared descriptor and operations; add board automation methods, frame-tab members, readiness ordering, and corrected `$help`. | Board page automation surface |
| `src/renderer/api/types/board-editor.d.ts` | Add the shared automation method/tab contracts using canonical browser types; make `switchTab` async. | Public board facade API and generated IntelliSense source |
| `src/renderer/automation/operations.ts` | Widen `ensureTargetReady` for an optional tab id and forward the tab id through `typeTextInto`; preserve all shared operation bodies. | Keep board and MCP callers on one operation layer |
| `src/renderer/automation/types.ts` | Add an optional tab id to `IBrowserTarget.ensureReady`; preserve the `void | Promise<void>` switch contract. | Type-level readiness contract |
| `src/renderer/editors/board/BoardTargetModel.ts` | Make `ensureReady(tabId?)` cover an explicit not-yet-loaded secondary while preserving existing `switchTab()` mounting and errors. | Board frame readiness |
| `src/renderer/automation/input.ts` | Forward an optional tab id through the existing type/focus/insertion mechanics; add no new input body. | Preserve one input implementation across targets |

## Files that need NO changes

| File | Verified reason |
| --- | --- |
| `src/renderer/scripting/ai-vision/browser-automation-members.ts` | The existing ten-member fragment already contains every shared member the board target supports; no omission parameter is needed. |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` | US-1335 already consumes the shared fragment and operations; browser facade work is explicitly out of scope. |
| `src/renderer/automation/commands.ts` | The MCP adapter already resolves targets, awaits readiness, and dispatches the shared operations; it needs no board-specific case. |
| `src/main/mcp/tools/browser-tools.ts` | The fourteen tool schemas and implementations are out of scope and already route through the shared dispatcher. |
| `src/renderer/automation/ref.ts` | US-1334 already provides registration-keyed frame maps, host-local lookup, and fail-closed stale-frame errors. |
| `src/renderer/automation/snapshot.ts` | It already mints `e...`/`fN-e...` refs and stores iframe maps under `CdpSession.registrationKey`. |
| `src/renderer/automation/CdpSession.ts` | The read-only `registrationKey` accessor already exposes the exact CDP routing key. |
| `src/renderer/editors/board/BoardEditorModel.ts` | The stable target, `activeTabId`, `frames`, and `loadedTabs` state already exist and are consumed by the board target. |
| `src/renderer/editors/board/BoardWebview.ts` | Existing cross-origin iframe creation, per-tab frame registration, nonce, and post-registration `markFrameLoaded()` are the verified source of board frame identity. |
| `src/ipc/main/board-handlers.ts` | It already registers frames under `${boardId}/${tab}` and does not need a new automation route. |
| `src/main/cdp-service.ts` | Existing board registration and CDP routing already distinguish main and secondary frame keys. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Board facade registration and page traversal already exist; the facade's own restriction is the required board gate. |
| `src/shared/ai-vision/resolver.ts` | Its existing per-hop `restricted()` check at `:85-87` is sufficient; no resolver change is needed. |
| `src/renderer/scripting/ai-vision/elements.ts` | Existing board chrome declarations/highlight provider are retained unchanged. |
| `assets/editor-types/board-editor.d.ts` | Generated from `src/renderer/api/types/board-editor.d.ts`; never hand-edit. |
| `src/renderer/api/types/page.d.ts` | `IEditorFacade` already includes `IBoardEditor`; no union plumbing is needed. |
| `doc/epics/EPIC-089.md` | The epic already links US-1336 and supplies the binding decisions. |
| `doc/active-work.md` | The task entry already exists; the user owns the dashboard and requested no dashboard change. |
| `window.screen` / US-1337, `open_url`/`pages.openUrl` / US-1338, and `mcp.browser-tools.enabled` / US-1339 | These are separate EPIC-089 tasks and are explicitly outside the board surface. |
| `qa/`, `docs/`, `assets/mcp-res-*.md`, and `src/main/mcp/tools/*` | Guides, user documentation, QA, and tool implementations belong to the explicitly out-of-scope US-1340/other tasks. |


## Live verification (2026-09-06)

Run through `execute_script` and `call` against the running dev build, on the Demo
board under `.persephone/boards/Demo` in this repo, which declares two secondary views
(`board-secondary:shared-state`, `board-secondary:detail`).

| Check | Result |
|---|---|
| `editor.tabs` | three frames: `main`, `board-secondary:shared-state`, `board-secondary:detail`, with titles and `active` |
| `editor.snapshot()` on the main frame | 125-line ref-bearing tree |
| `editor.snapshot({ tabId: "board-secondary:detail" })` | 17-line tree beginning `- heading "Notes" [level=3] [ref=e1045]` |
| `editor.switchTab("board-secondary:detail")` then `snapshot()` | same content; `activeTab` reports the secondary |
| a main-frame ref used with `{ tabId: <secondary> }` | fails closed with an actionable message; never acts on the wrong frame |

### Two defects found and fixed during this verification

**1. `ensureReady` treated "registered for CDP" as "on screen", so `snapshot({ tabId })` returned an
empty string.** The first live run of the tab-aware gate returned `""` for
`board-secondary:detail` while `switchTab` + `snapshot()` returned the real 17 lines — a **silent
empty success**, the exact failure class this roadmap exists to remove.

The cause is not the new plumbing. `ensureReady` early-returned when `loadedTabs.has(tabId)`, and
`loadedTabs` records that a frame **registered for CDP**, not that it is displayed. Only
`mountAndWait` expands and activates the panel (`setSecondaryViewsState({ open: true })` +
`setActivePanel`), and Chromium omits hidden subtrees from the accessibility tree — so a frame that
loaded once and was then collapsed is attachable, answers CDP, and yields an **empty** tree.

This is **pre-existing**, and it contradicted `ensureReady`'s own doc comment, which promised to
handle "panel closed, or open but still loading". It was invisible before only because the MCP
dispatcher always readies *the active tab*, and the active tab was made active by `switchTab`, which
always calls `mountAndWait`. Letting an explicit non-active `tabId` through the gate exposed it.
Fixed by running `mountAndWait` for every secondary tab rather than trusting the registration flag;
it resolves immediately when the frame is already loaded, so the cost is one idempotent panel
activation. The tool path benefits identically: a `browser_*` command on a board whose panel the
user collapsed now expands it instead of returning an empty snapshot.

**2. A cross-document ref surfaced as a raw IPC string.** Using a main-frame ref against a secondary
frame produced `Error invoking remote method 'browser:cdp-send': Error: Node with given id does not
belong to the document`. `resolveRef` mapped CDP's "No node with given id" to a recovery message but
not this second spelling, which is precisely the one a cross-frame or cross-tab ref produces — the
case US-1334's per-host store exists to make safe. It now says which document the ref came from and
what to do, alongside the unchanged stale-node message.

### What could not be verified

Frame-prefixed refs (`f1-e456`) were not exercised: they require a nested iframe *inside* a board
frame, and no board on this machine has one. Board frames are addressed as automation **tabs**, so
each already resolves through its own registration key (`${pageId}/main`,
`${pageId}/board-secondary:<viewId>`) — which is the isolation this task needed and which the
cross-frame check above confirms. The nested-iframe path keeps EPIC-089's abort-criterion 3 wording.
