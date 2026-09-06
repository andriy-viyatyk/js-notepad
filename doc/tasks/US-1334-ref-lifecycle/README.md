# US-1334: Per-host ref stores, and callable automation command bodies

## Status

**Status:** Implemented  
**Priority:** High  
**Epic:** [EPIC-089 — The browser and the app window through call](../../epics/EPIC-089.md)  
**Started:** 2026-09-06

## Goal

Make accessibility refs safe to use across concurrently automated browser pages, board frames, and
the app window, and extract the existing browser_* command behavior into typed renderer operations
that future facades can call directly. Add the shared, explicit resolver that treats a plain string
as a CSS selector and { ref: string } as a ref, without adding a descriptor or a facade member in
this foundation task.

## Background

### Epic boundary and current entry points

EPIC-089 decision 2 requires one implementation of each automation behavior: facades in
US-1335/1336/1337 must call the same functions as the MCP dispatcher. The current renderer entry
point is handleBrowserCommand() in src/renderer/automation/commands.ts:520-563. It currently:

1. reads mcp.browser-tools.enabled at :524-526;
2. resolves the target with getTarget(params) at :527-528;
3. awaits the optional board readiness gate at :532;
4. dispatches the command string to fourteen private handlers at :534-552; and
5. converts thrown failures to { error: { code: -32602, message } } at :555-562.

The setting gate remains in this task. US-1339 removes it separately. The fourteen tool schemas in
src/main/mcp/tools/browser-tools.ts:8-131 are also unchanged; their aliases and argument forms are
parsed in the renderer adapter, not in the main-process tool definitions.

The three current IBrowserTarget implementations are:

- src/renderer/editors/browser/BrowserTargetModel.ts:10-92, whose cdp(tabId?) creates a session for
  the browser page and selected internal tab;
- src/renderer/editors/board/BoardTargetModel.ts:40-170, whose cdp(tabId?) creates a session for
  the board page and selected frame and whose ensureReady() mounts/waits for secondary board
  frames at :141-145; and
- src/renderer/automation/AppTargetModel.ts:36-95, whose cdp() uses the APP_WINDOW_CDP_KEY
  sentinel (src/ipc/api-types.ts:120-125) and whose navigation/tab methods deliberately throw the
  existing NAV_MSG/TAB_MSG errors.

The browser model owns a stable target instance (src/renderer/editors/browser/BrowserEditor.ts:55-57,
66-78), and the board model does the same (src/renderer/editors/board/BoardEditorModel.ts:126-145).
BrowserEditorFacade receives the browser model and currently constructs separate CdpSession objects
in its private cdp() at src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:337-342. That
method duplicates BrowserTargetModel.cdp()'s registration-key construction at
BrowserTargetModel.ts:17-21 and is part of this task's refactor: it must be deleted, and every
facade CDP use must call this.model.target.cdp(tabId) directly.

### Verified ref defect

src/renderer/automation/ref.ts:21 stores one module-global Map<number, string>, and
setFrameSessions() at :24 replaces it. src/renderer/automation/snapshot.ts:59-99 calls
setFrameSessions() after each snapshot: it clears the map at :67-68 when no iframe targets exist
and replaces it with the current snapshot map at :93-94. Frame indexes are assigned from iframe
target order at :75-90. Therefore f1-e456 means the first iframe of whichever host was snapshotted
most recently.

Main-frame refs (e123) do not use this map: resolveRef() passes no nested sessionId for
frameIndex === null at ref.ts:67-72, so they already resolve through the caller's CdpSession.
Only iframe refs need the store fix. parseRef() at ref.ts:43-58, the ref spelling emitted by
snapshot.ts:284-289, and the two existing stale-ref messages at ref.ts:74-76 and :81-84 remain
unchanged.

### Chosen ref-store identity

The store will be keyed by the CdpSession registration key, not by IBrowserTarget object identity
and not by only target.id plus whatever tab happens to be active. CdpSession already owns the exact
key used for CDP routing (CdpSession.ts:10-23): browser and board targets encode page/frame identity
as the same page-id/tab-id key shape, while the app target uses the unique APP_WINDOW_CDP_KEY
sentinel. A session key also remains correct when a facade targets an explicit non-active tab, and
it is shared by the snapshot and subsequent ref action even though each call creates a new
CdpSession object.

Keying by the target instance would not distinguish a browser page's internal tabs or a board's
main/secondary frames. Keying by target.id plus current active-tab state would be wrong for an
explicit tabId and could change when the target switches tabs. The registration key is the stable
identity already used by CDP and by browserNetworkRequests() at
src/renderer/automation/commands.ts:501-506.

When a frame ref is handed to a host key with no stored map, resolution must fail before CDP is
called with an undefined nested session. This is the never-snapshotted state, and its actionable
message should name the host/ref and the fix, for example: No frame-session map is available for
ref "f1-e456" on this host. Take a snapshot on this host before using iframe refs.

The state where a map exists but has no entry for the requested frame index is distinct: the host
was snapshotted, but its last snapshot contained fewer frames (or no iframe frames). It must also
fail before CDP and must not fall back to the main session. Its message must describe the last
snapshot rather than telling the agent to repeat the same missing-map action, for example:
Ref "f3-e456" names frame 3, but the last snapshot of this host had 1 frame. The iframe may have
been removed — re-take the snapshot and use a ref from it. The implementation should format the
count with singular/plural grammar and use the map's entry count. Both new messages are distinct
from the existing stale-node messages, which remain byte-for-byte unchanged.

### Verified command bodies and aliases

The behavior that must move out of the MCP parameter adapter is distributed across the private
handlers in src/renderer/automation/commands.ts:

| Current handler | Verified behavior to preserve |
| --- | --- |
| browserNavigate() :207-245 | url validation, old-URL capture, navigation, two-phase 2-second-start/10-second-completion waits, and returned snapshot. |
| browserSnapshot() :247-249 plus local snapshot() :186-194 | overlay detection, # hint prefix, merged snapshot, and ref-store update. |
| browserClick() :251-269 | selector/ref dispatch, focus, scroll, click, and returned snapshot. |
| browserHover() :271-293 | selector/ref dispatch, mouseenter/mouseover events, and returned snapshot. |
| browserType() :295-312 plus typeText() | text validation, visible selector preference, native-setter fill, slowly, submit, and returned snapshot. |
| browserSelectOption() :314-334 | value or first values[] alias, change event, and returned snapshot. |
| browserPressKey() :336-342 plus pressKey() | focus, compound-key parsing, JS keyboard events, and returned snapshot. |
| browserEvaluate() :344-354 | expression/function alias, function auto-invocation only for function, and raw result. |
| browserGetTabs() :356-399 | list/new/close/select, index validation, 200ms/100ms waits, awaited board switchTab, and exact errors. |
| browserNavigateBack() :401-432 | the same two-phase navigation wait and returned snapshot. |
| browserWaitFor() :434-493 | selector/text/textGone/time modes, seconds-to-ms conversion, timeout default, exact timeout errors, and returned snapshot. |
| browserTakeScreenshot() :495-499 | PNG capture and { type: "image", data, mimeType: "image/png" }. |
| browserNetworkRequests() :501-507 | active-tab validation, page-id/tab-id log key, and raw log result. |
| browserClose() :509-512 | closes the active browser tab and returns "Tab closed". |

The thin MCP adapter must retain these verified translations before calling typed operations:
function to expression in browser_evaluate; values[] to one value in browser_select_option;
time/textGone in browser_wait_for; and the list|new|close|select enum in browser_tabs. It must
continue passing the loose MCP bag only at the adapter boundary. Shared operations must receive
typed values and a typed locator, never params: any.

### Verified facade overlap and ref-shape requirement

src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts currently calls low-level helpers
directly at :3-4, :119-120, :224-225, and :333-334. It also has separate implementations for
click, select, waitForSelector, waitForNavigation, and query helpers at :211-322. The refactor must
route overlapping facade automation behavior through the extracted shared operation layer. Query-only
methods (getText, getValue, getAttribute, getHtml, exists) and non-tool checkbox/clear helpers
have no browser_* command body and are not moved by this task. One existing quirk is preserved:
type() declares options.tabId but the current call at :224 does not forward it to typeText(), so
US-1334 must not turn this refactor into an unrelated tab-targeting fix.

The existing descriptor at BrowserEditorFacade.ts:32 says snapshot() matches the Playwright MCP
browser_snapshot format. The MCP tool's snapshot includes the overlay prefix from commands.ts:186-194,
while the current facade calls buildSnapshot() directly at :119-120 and does not include that
prefix. This is a verified existing mismatch, not a reason to change the foundation task's
overlayHint: false choice; US-1335 owns the decision and should make the facade adopt the warning
because an agent driving through call needs the modal/overlay hint at least as much as one using the
tool.

The facade input contract required by EPIC-089 decision 4 is explicit:

    click("#submit");             // plain string: always a CSS selector
    click({ ref: "e52" });        // object form: an accessibility ref

The shared helper will resolve string | { ref: string } to the typed locator consumed by shared
operations. It must not infer a ref from a string that happens to look like e52 or f1-e456. Anything
else—including a non-string ref field—throws an error that names both valid forms:
Expected a CSS selector string or an object of the form { ref: string }. Existing MCP selector/ref
fields remain separately parsed by the adapter, so this helper does not change MCP error shapes.

## Implementation Plan

### 1. Make frame-session storage registration-keyed

- src/renderer/automation/CdpSession.ts: expose the existing constructor registration key through
  a read-only accessor named registrationKey, without changing any IPC call.
- src/renderer/automation/ref.ts: replace the single Map<number, string> with a map from
  registration key to frame-index maps. Change setFrameSessions() to accept the session key and
  store the map for that host. Add one lookup used by both resolveRef() and callOnRef(). Main-frame
  refs continue to bypass the store. Frame refs require a map and a matching frame index; absent
  entries throw one of the two actionable host-local errors: a never-snapshotted host names the
  snapshot fix, while an existing host map names the last snapshot's frame count and the
  re-snapshot/ref replacement fix. Do not modify parseRef(), the ref spelling, or either stale-ref
  message.
- src/renderer/automation/snapshot.ts: pass cdp.registrationKey on both current update paths
  (new Map() for no iframe targets and sessionMap after iframe enumeration). The iframe merge, frame
  numbering, minimum-node threshold, and output remain unchanged.

Before:

    // ref.ts
    let frameSessionMap = new Map<number, string>();
    export function setFrameSessions(map: Map<number, string>): void {
        frameSessionMap = map;
    }

    // snapshot.ts
    setFrameSessions(new Map());
    setFrameSessions(sessionMap);

After:

    // CdpSession.ts
    get registrationKey(): string {
        return this.regKey;
    }

    // ref.ts
    const frameSessionMaps = new Map<string, Map<number, string>>();
    export function setFrameSessions(
        registrationKey: string,
        map: Map<number, string>,
    ): void {
        frameSessionMaps.set(registrationKey, map);
    }

    // snapshot.ts
    setFrameSessions(cdp.registrationKey, new Map());
    setFrameSessions(cdp.registrationKey, sessionMap);

The no-iframe path must set an empty map; it must not delete the registration-key entry. Deleting
the key would collapse the never-snapshotted state and the already-snapshotted-with-zero-frames
state, making the two required errors impossible. The lookup therefore distinguishes:

- no key: the host has never been snapshotted, so tell the agent to take a snapshot on that host;
  and
- existing key with no requested frame index: the host was snapshotted, so report the frame count
  from its last map and tell the agent to re-take the snapshot and use a ref from that snapshot.

The store has one entry per registration key ever snapshotted. Each key's map is replaced on every
snapshot and is never removed. This bounded growth is acceptable because keys are page-id-derived
and bounded by the number of pages in the renderer (plus the app-window sentinel), so no disposal
hook is needed. The final implementation may use a private helper or ReadonlyMap, but it must
preserve this keying, the retained empty map, and fail closed for an unknown host/frame index.

The two resolution branches must remain explicit: if frameSessionMaps has no entry for
cdp.registrationKey, throw the no-map message telling the caller to take a snapshot on this host.
If the keyed map exists but has no entry for frameIndex, count its entries, choose singular
frame/plural frames, and throw the frame-count message telling the caller to re-take the snapshot
and use a ref from it. Neither branch may pass an undefined sessionId to DOM.resolveNode or
Runtime.callFunctionOn.

### 2. Add one typed operation layer under src/renderer/automation/operations.ts

Create operations.ts as the shared boundary between target adapters and callers. This location
keeps command behavior in the existing automation leaf, avoids importing editor classes into the
operation layer, and lets browser, board, and app facades use the existing IBrowserTarget contract.

The module will export typed locator and option interfaces. The locator union is:

    export interface RefLocator {
        ref: string;
    }
    export interface SelectorLocator {
        selector: string;
    }
    export type ElementLocator = RefLocator | SelectorLocator;

resolveElementLocator(value: unknown): ElementLocator accepts only a string or an object with a
string ref. Strings become { selector: value }, including strings that resemble e52 or f1-e456;
objects become { ref: value.ref }. Everything else throws the error naming both valid forms. MCP's
separate selector, ref, and element fields are parsed by a different typed adapter helper,
preserving the current selector-first precedence and MCP error responses.

The operation layer will export these typed operations:

| Operation | Typed input and behavior |
| --- | --- |
| snapshot | IBrowserTarget plus optional tab id and an explicit overlay-hint option; calls detectOverlay() and buildSnapshot() once, and returns the string. |
| navigateAndWait / navigateBackAndWait | Target plus URL where needed; preserve old-URL capture and both existing navigation wait phases, but leave response wrapping to the adapter. |
| clickElement / hoverElement | Target plus ElementLocator and optional tab id; preserve focus, visible scroll, click or mouse events, and callOnRef() StaticText coercion. |
| typeTextInto | Target plus ElementLocator, text, slowly, submit, and optional tab id; adapts the locator to the existing typed typeText() options. |
| selectOption | Target plus ElementLocator, one string value, and optional tab id; preserve direct value assignment and the change event. |
| pressKeyOnTarget | Target plus key and optional tab id; preserve focus and the existing pressKey() compound-key behavior. |
| evaluateInTarget | Target plus expression and optional tab id; returns the existing raw evaluated value. |
| waitFor | Target plus a discriminated selector/text/textGone/time mode and timeout; preserve mode precedence after MCP parsing, timeout defaults, units, polling, and error strings. |
| listTabs / openTab / closeTab / selectTab | Target plus typed tab arguments; preserve current tab index errors, 200ms/100ms post-action waits, and awaited board switchTab(). |
| takeScreenshot / networkRequests / closeActiveTab | Target plus no loose params; preserve PNG result data, active-tab network-log key, and the exact Tab closed result. |

Action operations return raw typed values (void, string, tab arrays, image data, network log, or
evaluation result). The command adapter wraps them into the existing MCP result shape and returns
its current error values for parameter problems. Snapshot-producing MCP commands call the shared
snapshot operation after the shared action; the snapshot option controls whether the overlay hint is
included. MCP calls pass the existing hint-enabled behavior. BrowserEditorFacade.snapshot() passes
the hint-disabled option until a later surface task changes its documented facade result; both paths
still use the same snapshot/ref-store mechanics.

ensureTargetReady(target) is also exported as a shared precondition. handleBrowserCommand() calls it
in the same position where it currently awaits target.ensureReady(); later facades call the same
helper before their operation. IBrowserTarget.ensureReady is optional at
src/renderer/automation/types.ts:41-43, and BrowserTargetModel.ts:10-92 declares no
ensureReady(), so this helper is verified to be a no-op for the existing browser facade target.
This preserves current unknown-command ordering while giving board facade calls the existing
readiness gate.

Activation is deliberately not part of operations.ts. getTarget() remains the MCP-only target
resolution boundary: its browser and board branches call pagesModel.showPage() at
src/renderer/automation/commands.ts:160-173 so a tool can bring its requested background page
forward. Operations.ts must never call showPage() or otherwise activate a page. The facade path
already has a model reference and deliberately does not activate the page, so
pages[3].editor.snapshot() through call does not yank page 3 to the front.

Visibility-sensitive behavior is explicitly retained at the target seam. BrowserTargetModel
focusWebview() at :23-28 looks up the selected webview and calls focus(), and insertText() at
:30-38 focuses the webview before insertion; these are the candidate operations that can depend on
the target being visible. Shared operations may call target.focusWebview() and target.insertText()
exactly as the current command bodies do, but the facade path must not respond by calling
pagesModel.showPage(). It leaves the page's visibility unchanged and lets the target/CDP operation
report any existing focus or attachment failure.

### 3. Move the ref-aware mechanics and preserve existing behavior

Move the mechanics from the private handlers into operations.ts, keeping each behavior in one place:

- move the local snapshot() implementation, including overlay detection and its exact
  "# " plus overlay-text plus newline prefix construction;
- move selector/ref DOM dispatch from click, hover, and select into typed locator branches;
- keep typeText() and pressKey() in input.ts as the low-level implementations, and make operation
  wrappers translate ElementLocator and tab id to their typed parameters;
- move the two navigation wait phases as shared functions, including the catches that tolerate a
  destroyed old page context;
- move wait modes without changing their exact timeout text or existing text escaping;
- move tab action delays and board switchTab() awaiting into one shared tab operation path; and
- move the network-log IPC call into the operation layer while deriving the same active-tab key.

Before:

    async function browserClick(target: IBrowserTarget, params: any): Promise<McpResponse> {
        target.focusWebview();
        const selector = refOrSelector(params);
        if (selector) {
            // selector-specific evaluate body
        } else if (params?.ref) {
            await callOnRef(target.cdp(), params.ref, "function() { ... }");
        } else {
            return { error: { code: -32602, message: "Missing 'selector' or 'ref' parameter" } };
        }
        return { result: await snapshot(target) };
    }

After:

    const locator = parseMcpLocator(params);
    await clickElement(target, locator);
    return { result: await snapshot(target, undefined, { overlayHint: true }) };

The exact implementation may return the post-action snapshot from one shared command operation
instead of using the shown two calls, but selector/ref mechanics and snapshot implementation must
still have one owner. The adapter must not retain a second selector/ref branch.

### 4. Keep handleBrowserCommand() a typed MCP adapter

Refactor src/renderer/automation/commands.ts so it retains target resolution, the setting gate,
the existing error conversion, and a switch over all fourteen command names, but removes command
mechanics from the dispatch path. Each case validates/reads the MCP bag and aliases into typed
arguments, then calls the corresponding operations.ts function.

The adapter must preserve these exact translations and precedence:

- click, hover, type, and select-option: selector wins over ref, and element is the existing
  selector fallback; missing locator errors remain Missing 'selector' or 'ref' parameter.
- type: text == null remains the missing-text check, and slowly/submit pass through unchanged.
- select-option: value ?? (Array.isArray(values) ? values[0] : values) remains the value rule and
  its missing message remains unchanged.
- evaluate: expression ?? function remains source selection; auto-invocation remains limited to a
  truthy function parameter whose text starts with the current function forms.
- tabs: action remains list by default and accepts only list, new, close, and select; index
  validation and unknown-action wording remain unchanged.
- wait-for: time wins, then selector, text, and textGone; time remains seconds, while the other
  modes use the 30,000ms default unless timeout is provided.

Before:

    const dispatch = (): Promise<McpResponse> | McpResponse => {
        switch (command) {
            case "browser_navigate": return browserNavigate(target, params);
            case "browser_snapshot": return browserSnapshot(target);
            case "browser_click": return browserClick(target, params);
            // ... fourteen private handlers receive params or return MCP responses
        }
    };

After:

    await ensureTargetReady(target);
    switch (command) {
        case "browser_navigate": {
            const url = parseNavigateParams(params);
            await navigateAndWait(target, url);
            return { result: await snapshot(target, undefined, { overlayHint: true }) };
        }
        case "browser_click": {
            const locator = parseMcpLocator(params);
            await clickElement(target, locator);
            return { result: await snapshot(target, undefined, { overlayHint: true }) };
        }
        // ... each case parses MCP values and calls one typed operation
    }

The final adapter may retain a small dispatch closure and typed parser helpers, but it must not
pass params into operations.ts or leave a second implementation of any operation in commands.ts.
The setting check at :524-526, target resolution, readiness await, and try/catch error conversion
remain in handleBrowserCommand().

Page activation remains in getTarget() and nowhere in operations.ts. The MCP adapter may therefore
activate a resolved background page before calling an operation, while facade calls use the model
target directly and deliberately do not activate or show the page.

### 5. Repoint existing BrowserEditorFacade helper calls without adding surface members

Update src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts only where an existing facade
method overlaps a moved automation operation. Delete its private cdp() method at :337-342 entirely;
it is a duplicate of BrowserTargetModel.cdp() and would keep a second registration-key constructor
alive. Route every remaining facade CDP use directly through this.model.target.cdp(tabId):
evaluate :111, snapshot :120, all query/click/select/wait calls at :174-309, and pressKey :334.
Use this.model.target and the target's cdp(tabId) through the shared layer so a snapshot made by the
facade stores refs under the same registration key that a later facade action uses.

Replace the direct buildSnapshot, pressKey, and typeText calls at the verified call sites with
operation-layer equivalents or the shared low-level functions they wrap. Route existing
selector-only click, select, waitForSelector, and waitForNavigation methods through a selector
locator so their current signatures and behavior remain valid. Keep navigate, back, forward,
reload, tab getters/actions, query-only methods, and checkbox/clear methods unchanged unless the
shared operation has exactly the same synchronous/public contract; public facade signature and
descriptor changes belong to US-1335/1336/1337. Preserve the current type() omission of tabId when
adapting its call; a later facade task may fix that contract explicitly.

This keeps existing facade selector signatures honest: a selector string is passed to
resolveElementLocator() as a selector, never inspected for ref-like spelling. The later surface
task can widen facade methods to accept string | { ref: string } and add new members while
continuing to use the same operation functions.

Before:

    import { pressKey, typeText } from "../../automation/input";
    import { buildSnapshot } from "../../automation/snapshot";

    async snapshot(options?: TabOption): Promise<string> {
        return buildSnapshot(this.cdp(options?.tabId));
    }

    async type(selector: string, text: string, options?: ...): Promise<void> {
        await typeText(this.model.target, { selector, text, ... });
    }

After:

    import {
        ensureTargetReady,
        pressKeyOnTarget,
        snapshot,
        typeTextInto,
    } from "../../automation/operations";

    async snapshot(options?: TabOption): Promise<string> {
        await ensureTargetReady(this.model.target);
        return snapshot(this.model.target, options?.tabId, { overlayHint: false });
    }

    async type(selector: string, text: string, options?: ...): Promise<void> {
        await ensureTargetReady(this.model.target);
        // US-1335 owns forwarding options.tabId; preserve current active-tab behavior here.
        await typeTextInto(
            this.model.target,
            { selector },
            text,
            { slowly: options?.slowly, submit: options?.submit },
        );
    }

The snippets show the ownership change; the implementation must retain existing public
selector-only signatures and all current query/clear behavior. The private cdp() method shown in
the Before context is deleted; no replacement helper may reconstruct its registration key.

### 6. Verify the move and lifecycle contract without tests

- Re-read every operation call site and confirm the MCP dispatcher and future facade entry points
  call the same exported function, with no duplicate two-phase waits, overlay handling, input
  strategy, StaticText coercion, or tab-action delay.
- Verify browser default/explicit tab keys, board main/secondary frame keys, and the app sentinel
  all produce separate ref maps. Snapshot host A, snapshot host B, then act on host A; the action
  must use host A's stored iframe session.
- Verify a frame ref on a never-snapshotted host throws the no-map snapshot message; verify a frame
  index absent from an existing keyed map throws the last-snapshot frame-count message; and verify
  neither case falls through to the main session.
- Verify operations.ts never calls pagesModel.showPage() and BrowserEditorFacade has no private cdp()
  helper or duplicate registration-key construction. Confirm facade CDP calls use
  this.model.target.cdp(tabId) directly and that facade calls do not activate background pages.
- Verify MCP aliases and all existing return/error shapes from source review. Do not add unit tests
  or a test harness; this project does not use them.
- Leave doc/active-work.md and the epic dashboard entry unchanged; the user will add the dashboard
  entry. Do not commit.

## Concerns

- **Session identity must include the selected tab/frame.** A target object is stable across tabs,
  while the active tab can change between calls. The CDP registration key is the only identity that
  is already exact for browser tabs, board frames, and the app sentinel.
- **Missing host state must fail closed.** A frame ref must never be sent with an undefined nested
  session, because CDP would otherwise attempt the caller's main frame and could perform a wrong
  action. The new error is intentionally distinct from the unchanged stale-node messages and tells
  the caller to snapshot that host.
- **Readiness ordering is observable on boards.** handleBrowserCommand() currently waits before
  dispatch. The shared ensureTargetReady() must preserve that ordering for MCP and be called by later
  facade paths before the shared operation; it must not be hidden in a way that changes
  unknown-command or error behavior. IBrowserTarget.ensureReady is optional, and
  BrowserTargetModel.ts:10-92 has no implementation, so the existing browser facade's helper call
  is verified to do nothing.
- **MCP activation is not facade activation.** getTarget() owns pagesModel.showPage() for browser
  and board tool targets; operations.ts must never activate a page. Facade calls intentionally
  leave background pages in place. BrowserTargetModel.focusWebview() and insertText() are the
  visibility-sensitive target methods, so shared operations retain those calls while the facade
  path reports their existing focus/attachment result instead of activating the page.
- **Snapshot semantics differ between facade and tool.** The tool's snapshot operation adds the
  overlay hint, while BrowserEditorFacade.snapshot() currently calls buildSnapshot() directly. The
  shared facade-facing snapshot function therefore takes an explicit overlay option so the command
  retains its current hint and the existing facade does not gain an undocumented prefix. This is
  already a slight mismatch with BrowserEditorFacade.ts:32's claim that the facade format matches
  browser_snapshot; US-1335 owns the decision and should switch the facade to overlayHint: true so
  call users receive the same modal warning.
- **Existing facade signatures are selector-only today.** This task establishes the resolver and
  allows selector locators internally; public object-ref overloads and new capability members
  belong to later surface tasks. Editing descriptors or generated API declarations exceeds US-1334.
- **The frame map is latest-snapshot state per key.** A ref from an older snapshot on the same host
  can still be stale, and existing stale handling remains the authority. This task scopes hosts; it
  does not change ref spelling, parsing, or stale-ref wording.
- **The frame-store key must not be deleted for an empty snapshot.** Retaining an empty map is what
  distinguishes never snapshotted from last snapshot with zero iframe frames. The one-entry-per-key
  store is bounded by page-derived registration keys, so no disposal hook is needed.
- **The active-tab omission is deliberate.** BrowserEditorFacade.type() currently declares a
  tabId option but does not pass it to typeText(); the required US-1335 comment at that call site
  prevents a later reader from fixing it accidentally inside this refactor.
- **No setting change belongs here.** mcp.browser-tools.enabled remains in handleBrowserCommand()
  exactly until US-1339.

## Acceptance Criteria

- [ ] Iframe frame-session maps are keyed by the exact CdpSession registration key, with browser
      page/tab, board page/frame, and app-window sentinel isolation verified from target code.
- [ ] Main-frame refs still resolve through the caller's CdpSession; parseRef(), ref spelling, and
      both existing stale-ref messages are unchanged.
- [ ] A frame ref on a host with no stored map throws the host-local "take a snapshot on this host"
      message; a frame ref absent from an existing map reports that host's last frame count and
      tells the caller to re-take the snapshot and use a ref from it. Neither case resolves against
      another host or the main frame, and both remain distinct from the unchanged stale-node errors.
- [ ] The no-iframe snapshot path sets an empty map instead of deleting the registration-key entry;
      the one-entry-per-key store is replaced per snapshot, never removed, and is justified as
      bounded by page-derived keys with no disposal hook.
- [ ] src/renderer/automation/operations.ts exports typed target operations for all fourteen command
      behaviors and the explicit string | { ref: string } locator resolver.
- [ ] Shared operations take IBrowserTarget and typed arguments, never the loose MCP parameter bag;
      the MCP adapter alone parses function, values[], time, textGone, and the tabs action enum.
- [ ] handleBrowserCommand() retains the settings gate, target resolution, board readiness gate,
      dispatch coverage, existing result/error shapes, overlay hint, two-phase navigation waits,
      StaticText ref coercion, and all existing alias behavior while becoming a thin adapter.
- [ ] Browser, board, and app callers can use the same operation functions without a second copy of
      command behavior; existing BrowserEditorFacade low-level calls are repointed where required,
      without adding descriptor members or public API declarations in this task.
- [ ] BrowserEditorFacade.ts:337-342 private cdp() is deleted, every remaining facade CDP call uses
      this.model.target.cdp(tabId), and no operation reconstructs the registration key.
- [ ] Page activation remains in getTarget() for MCP resolution only; operations.ts never calls
      pagesModel.showPage(), and facade calls do not activate background pages. Browser target
      focus/input calls remain at the target seam.
- [ ] The existing browser facade's ensureTargetReady() call is verified as a no-op because
      BrowserTargetModel.ts:10-92 has no ensureReady() method, and the type() call site contains a
      one-line comment naming US-1335 as the owner of its deliberately unforwarded tabId.
- [ ] The overlay option remains explicit: this task preserves the facade's current no-prefix
      result, while US-1335 owns deciding and implementing overlayHint: true to correct the
      descriptor mismatch and expose modal warnings through call.
- [ ] The locator resolver treats every plain string as a selector, accepts only { ref: string }
      for refs, rejects all other values with both valid forms named, and never guesses from ref-like
      string spelling.
- [ ] No unit tests or test harnesses are added, no MCP tool schemas are changed, the
      mcp.browser-tools.enabled setting is untouched, doc/active-work.md is untouched, and no
      commit is created.

## Files Changed

| File | Planned change | Scope |
| --- | --- | --- |
| doc/tasks/US-1334-ref-lifecycle/README.md | This verified investigation, design decisions, implementation plan, acceptance criteria, and file inventory. | Task documentation |
| src/renderer/automation/CdpSession.ts | Expose the existing CDP registration key read-only so the ref store can use exact session identity. | Implementation |
| src/renderer/automation/ref.ts | Store iframe session maps by registration key; fail closed for absent host/frame entries while preserving parsing and stale messages. | Implementation |
| src/renderer/automation/snapshot.ts | Associate each snapshot's iframe map with cdp.registrationKey; preserve output and merge behavior. | Implementation |
| src/renderer/automation/operations.ts | New typed shared automation operations, readiness helper, locator types/resolver, and reusable raw operation results. | Implementation |
| src/renderer/automation/commands.ts | Keep the gate/target resolution/error adapter; parse MCP aliases and dispatch to shared typed operations. | Implementation |
| src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts | Delete the duplicate private cdp() registration-key constructor, route all remaining CDP calls through model.target.cdp(tabId), and repoint overlapping helpers without adding members or descriptor entries. | Implementation |

Files that need **no changes** in US-1334:

- src/renderer/automation/types.ts — IBrowserTarget already supplies the target seam required by
  shared operations; no new target capability is needed.
- src/renderer/automation/input.ts — its typed typeText() and pressKey() mechanics, including
  native-setter fill, slow typing, compound keys, and StaticText ref coercion through callOnRef(),
  are reused rather than rewritten.
- src/renderer/automation/AppTargetModel.ts — its app sentinel and unsupported navigation/tab
  errors already define target behavior; new operations consume the adapter.
- src/renderer/editors/browser/BrowserTargetModel.ts and
  src/renderer/editors/board/BoardTargetModel.ts — existing registration-key construction,
  tab/frame routing, and board readiness implementation are the identity sources; no adapter
  behavior changes are required.
- src/main/mcp/tools/browser-tools.ts — all schemas, aliases documented there, tool names, and
  result conversion remain unchanged.
- src/renderer/api/mcp/command-registry.ts — it already forwards browser methods to
  handleBrowserCommand() and needs no routing change.
- src/renderer/api/types/browser-editor.d.ts and assets/editor-types/*.d.ts — no public facade
  signatures or generated declarations are added in this foundation task; later surface tasks own
  those changes.
- src/renderer/scripting/api-wrapper/PageWrapper.ts — facade registration is unchanged; no new
  facade is added here.
- src/renderer/editors/browser/BrowserEditor.ts and
  src/renderer/editors/board/BoardEditorModel.ts — stable target instances are verified callers,
  not implementation targets for this refactor.
- src/main/cdp-service.ts and src/ipc/api-types.ts — existing registration-key routing and app
  sentinel are reused; no IPC or main-process changes are required.
- doc/active-work.md, doc/epics/EPIC-089.md, src/main/mcp/tools/*, settings files, unit tests, and
  test harnesses — outside this task's implementation scope; the user will add the dashboard entry
  and US-1339 owns the setting.
