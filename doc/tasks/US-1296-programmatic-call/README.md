# US-1296: Programmatic call surfaces for scripts and Boards

**Epic:** [EPIC-083](../../epics/EPIC-083.md) · **Status:** Investigation complete — not implemented · **Created:** 2026-09-05

## Goal

Expose the existing AiVision resolver as two programmatic APIs over the same descriptor tree:

- app.call(path, options?) for scripts, rooted in the script's own AppWrapper.
- persephone.call(path, options?) for Boards, reached through the existing Board MessagePort
  boundary and rooted at the page hosting that Board.

Both surfaces accept JSON-compatible arguments and values, pass HintMode "never", apply the resolver's
existing descriptor restrictions, and return a plain bounded value. This task is an investigation
and implementation plan only; it does not change source behavior or add tests.

## Background

### The shared resolver is already the implementation to reuse

[src/shared/ai-vision/resolver.ts](../../../src/shared/ai-vision/resolver.ts) exports
resolveCall(root, request, seenKinds). It parses the path, walks IAiVisible descriptors, checks
each descriptor's restricted() hook before descending, invokes the final member when args is
present, assigns when value is present, awaits values, and calls shapeResult() before returning an
ICallResult. Resolver failures are represented by the error field in that result (and include
resolvedUpTo where available); the resolver does not throw ordinary path, permission, invocation,
or assignment failures to its caller.

[src/shared/ai-vision/types.ts](../../../src/shared/ai-vision/types.ts) defines the root and
descriptor contracts. A descriptor may expose members, children, index, summarize, and restricted;
the resolver is intentionally root-agnostic. ICallRequest contains path, optional args, value,
hints, and maxLength. ICallResult contains the path and shaped result metadata, with optional hint,
error, resolvedUpTo, truncated, and totalLength.

[src/shared/ai-vision/result-shaper.ts](../../../src/shared/ai-vision/result-shaper.ts) is the
shared JSON-safe result boundary. It truncates strings, bounds arrays, limits recursive depth,
detects cycles, converts Date and Error, and summarizes visible objects or class instances instead
of exposing their internals. Its summarize() contract requires descriptor summaries to be
JSON-compatible. No second object-model implementation should be introduced for either API.

[src/shared/ai-vision/hint.ts](../../../src/shared/ai-vision/hint.ts) builds the optional
navigation/help text. The programmatic APIs deliberately pass hints: "never" and omit hint from
their public return values. This differs from the MCP call tool, which keeps its current hint
behavior and { result }/error envelope.

### The script surface has the right root and lifecycle already

[src/renderer/scripting/ai-vision/root.ts](../../../src/renderer/scripting/ai-vision/root.ts) defines
AiRoot, currently constructed with an AppWrapper. Its pages and page getters delegate to that
wrapper, so the root is supplied by its caller rather than being a global tree. The current page
getter is this.app.pages.activePage; that is appropriate for the existing MCP context, but a normal
script must retain the ScriptContext.page that the script was run against.

[src/renderer/scripting/ai-vision/call.ts](../../../src/renderer/scripting/ai-vision/call.ts)
currently creates new ScriptContext(undefined, []), resolves new AiRoot(context.app), and disposes
the context in finally. That helper is the MCP-only convenience path and must retain its current
behavior. app.call should instead use the already-live AppWrapper and release list belonging to the
current ScriptContext; it must not create and dispose a nested context.

[src/renderer/scripting/ScriptContext.ts](../../../src/renderer/scripting/ScriptContext.ts) creates
the AppWrapper, optional PageWrapper, output flags, and release list, and disposes all of them
together. ScriptRunner supplies the page to ScriptContext in its executeWithContext path, while
ScriptRunnerBase injects app and page into the script scope. The script API therefore needs an
explicit way for AppWrapper.call/AiRoot to use that context page when it exists, while preserving
the active-page fallback for contexts without a page (including MCP).

[src/renderer/scripting/api-wrapper/AppWrapper.ts](../../../src/renderer/scripting/api-wrapper/AppWrapper.ts)
wraps the live application, owns PageCollectionWrapper, and is covered by the compile-time
IApp/AppWrapper key guard. It currently has no call member. The declaration that drives the script
API is [src/renderer/api/types/app.d.ts](../../../src/renderer/api/types/app.d.ts), which currently
has no IApp.call. Vite's editorTypesPlugin copies every declaration from src/renderer/api/types into
assets/editor-types, and configure-monaco.ts loads those copies; adding the declaration there is
required for IntelliSense.

The proposed public signature is:

~~~
call(
  path: string,
  options?: {
    args?: unknown[];
    value?: unknown;
    maxLength?: number;
  },
): Promise<unknown>;
~~~

args and value remain mutually exclusive, as enforced by resolveCall. The public method should
normalize the request with hints: "never", await the shared result, and reject with an Error when
ICallResult.error is present. On success it resolves to ICallResult.result only: no hint or
resolver metadata is exposed. Rejecting is the recommended programmatic semantic because it
composes with normal script try/catch; the MCP tool continues to return its existing structured
error response.
### The Board boundary and current execute() route

Board code runs in an iframe without IPC or preload access. The Board host renderer requests a
port from main; [src/main/board-bridge.ts](../../../src/main/board-bridge.ts) creates a
MessageChannelMain, keeps one end in BoardPortEntry, and transfers the other to the host renderer
with hostWebContents.postMessage. BoardWebview then transfers that port into the iframe. The
main-side entry currently stores port, Board root, host, owner ID, and host WebContents; it does
not store a page ID.

The request begins in [src/renderer/editors/board/BoardWebview.ts](../../../src/renderer/editors/board/BoardWebview.ts)
handleLoad(), which calls api.requestBoardPort(this.boardId, host, model.id). The model is a
BoardEditorModel, and its inherited EditorModel.page is set by PageModel.attach; it is the page
hosting the Board. model.id is the editor/Board identity, not the hosting page identity. The
renderer IPC declaration is in [src/ipc/api-types.ts](../../../src/ipc/api-types.ts), its
implementation is in [src/ipc/renderer/api.ts](../../../src/ipc/renderer/api.ts), and
[src/ipc/main/board-handlers.ts](../../../src/ipc/main/board-handlers.ts) currently passes
event.sender, Board ID, host, and owner ID to createBoardPort.

[src/board-shim.ts](../../../src/board-shim.ts) exposes window.persephone and sends Board messages
through post(). Its existing execute() creates a runner handle and sends
{ kind: "runner", channel, msg }; existing RPC helpers send { kind: "rpc", id, method, args } and
resolve from { kind: "rpc-result", id, result }. The new call operation should be a distinct
correlated { kind: "call", id, request } envelope, alongside those existing messages, so a Board
call cannot be confused with runner execution or a filesystem/dialog RPC.

In main, handleBoardMessage() in board-bridge.ts dispatches runner, fire, and RPC messages. The new
call branch should forward to the exact BoardPortEntry.hostWebContents, carrying the Board owner ID
and request. The existing main-to-renderer MCP transport in
[src/main/mcp/renderer-bridge.ts](../../../src/main/mcp/renderer-bridge.ts) selects an open window
by window index. Add only a small helper that scans openWindows.windows for the window whose
BrowserWindow.fromWebContents(entry.hostWebContents) matches, returns that window's index, and
calls the existing sendToRenderer(method, params, windowIndex, timeoutMs). This reuses the existing
correlation, timeout, closed-window, and whenReady handling; it is not a second transport. The
renderer side should resolve the request in the host renderer and return only a shaped result/error
to main, which posts a correlated result back to the Board shim.

The renderer command registry and dispatch flow are in
[src/renderer/api/mcp/command-registry.ts](../../../src/renderer/api/mcp/command-registry.ts) and
[src/renderer/api/mcp-handler.ts](../../../src/renderer/api/mcp-handler.ts). An internal Board-call
command may use the existing renderer command transport, but it must carry the Board owner ID and
must not alter the public MCP call command or its response behavior. The renderer command can
resolve the hosting PageModel from ownerId with pagesModel.findPage(ownerId), create/use the
page-scoped script context, construct an AiRoot over that context's AppWrapper, and call the same
resolveCall used everywhere else.

#### Board hop-by-hop table

| Hop | File and function | Data and process boundary |
|---|---|---|
| Board JavaScript | src/board-shim.ts: window.persephone method, post(), onPortMessage() | Board iframe turns the call into { kind: "call", id, request }; the returned shaped value or error resolves/rejects the Board Promise. |
| Shim → main | src/main/board-bridge.ts: handleBoardMessage() and BoardPortEntry | MessagePortMain receives the JSON envelope. The entry supplies exact host WebContents and retains the stable Board ownerId; no active-page lookup is allowed. |
| Main → host renderer | src/main/board-bridge.ts: owner-index lookup, then src/main/mcp/renderer-bridge.ts: existing sendToRenderer() | Main maps entry.hostWebContents to its open-window index and calls the existing correlated transport with { ownerId, request }. It does not add a second transport or select the active window. |
| Renderer resolver | New internal Board-call command next to src/renderer/api/mcp/command-registry.ts, then src/renderer/api/pages/PagesModel.ts: findPage(), src/renderer/scripting/ai-vision/call.ts/AiRoot, and src/shared/ai-vision/resolver.ts: resolveCall() | Host renderer resolves against the PageModel found from the BoardEditorModel ownerId. The root restricted() hook enforces Board trust and all existing descriptor guards. Hints are never. |
| Renderer → main → Board | Internal command returns shaped result/error; board-bridge.ts posts correlated result; board-shim.ts:onPortMessage() consumes it | Only the plain shaped result or serialized error crosses the port. Board API resolves to the plain value or rejects an Error. |

### The hosting page is recoverable from the existing ownerId

BoardWebview.handleLoad() already passes model.id as ownerId to
api.requestBoardPort(this.boardId, host, model.id). BoardPortEntry.ownerId stores that same
BoardEditorModel ID, and board-bridge.ts documents it as stable across mounts/reloads of the same
Board tab. No new page identity needs to be added to the port handshake.

The reliable renderer lookup is PagesModel.findPage(ownerId), which delegates to
PagesQueryModel.findPage() in src/renderer/api/pages/PagesQueryModel.ts. That query searches the
live PagesModel state for either p.id === ownerId or an editor whose id equals ownerId. It therefore
maps the BoardEditorModel ID to its hosting PageModel even when the Board is not that page's main
editor. The internal renderer command should import the existing pagesModel from src/renderer/api/pages.ts,
call pagesModel.findPage(ownerId), and use the returned PageModel directly.

PageModel.mainEditorInstance is only the page's selected main editor, and PageModel.mainEditor
unwraps that editor to its content host. Neither is the general owner lookup: either can miss the
Board when it is a secondary editor, and mainEditor can return a host rather than the Board model.
The verified lookup is PagesModel.findPage(ownerId), followed by the returned PageModel's existing
editor/context fields.

The call implementation should use the host page's existing editor/context rather than opening or
activating a page. PageWrapper.grouped resolves the grouped page using the wrapped page's model ID,
and PageCollectionWrapper otherwise derives activePage from the live page model. This is why the
Board root needs an explicit page override rather than merely constructing AiRoot and accepting its
current active-page getter.

## Implementation Plan

### 1. Add the script API over the live context

1. Add IApp.call and its JSDoc to
   [src/renderer/api/types/app.d.ts](../../../src/renderer/api/types/app.d.ts), documenting args,
   value, maxLength, HintMode "never", plain-value success, and rejected errors. Preserve the
   mutually exclusive args/value rule.
2. Add the matching method to AppWrapper and satisfy its existing IApp key guard. The method should
   build an ICallRequest with hints: "never", call resolveCall through the shared AiRoot, and convert
   an error result into Error rejection.
3. Thread the current ScriptContext.page into the root without creating another context. Extend the
   root construction/API only as needed so AiRoot can use the supplied PageWrapper for page and
   pages semantics while retaining its active-page fallback for the MCP helper.
4. Keep src/renderer/scripting/ai-vision/call.ts context creation/disposal and public MCP command
   behavior unchanged apart from any internal reusable helper needed by the script method.

Implementation must be written against the root.ts that is on disk at that time. US-1292 and
US-1295 also modify src/renderer/scripting/ai-vision/root.ts, so this page-override change must be
rebased onto their landed root members and constructor shape rather than applying this document's
current snapshot literally.

Before → after shape (illustrative; use repository types and naming):

~~~
interface IApp {
  // existing members...
  call(path: string, options?: IAppCallOptions): Promise<unknown>;
}

interface IAppCallOptions {
  args?: unknown[];
  value?: unknown;
  maxLength?: number;
}

// conceptual context flow
// before: new AiRoot(context.app) -> app.pages.activePage
// after:  new AiRoot(context.app, { page: context.page }) -> context page when present
~~~

### 2. Add a separate Board call envelope

1. Extend the dependency-free unions in
   [src/ipc/board-bridge-channels.ts](../../../src/ipc/board-bridge-channels.ts) with a call request
   and correlated result. Keep existing rpc and runner envelopes unchanged.
2. Add persephone.call(path, options?) to src/board-shim.ts. It should allocate a request ID,
   post the JSON request after the port is attached (using the existing queue), and resolve only
   from its matching result. Reject malformed, timeout, transport, and resolver error results as
   Error objects.
3. In board-bridge.ts, validate the Board port entry, dispatch the call, and return one correlated
   result. Use the host WebContents stored in that entry, with a bounded timeout and cleanup for
   disconnected ports.
4. Add an internal renderer command/handler that receives ownerId and the normalized request,
   resolves through the shared aiCall/resolveCall path with hints: "never", and returns only JSON-safe
   data. Do not change src/renderer/api/mcp/call-command.ts or the public MCP command response.
5. Add a small exported helper in src/main/mcp/renderer-bridge.ts that scans openWindows.windows
   for the window whose BrowserWindow.fromWebContents(hostWebContents) matches, returns its window
   index, and calls the existing sendToRenderer(method, params, windowIndex, timeoutMs). Reuse its
   existing correlation, timeout, closed-window, and whenReady handling; do not add another
   transport layer.

Before → after envelope shape:

~~~
type BoardCallMessage = {
  kind: "call";
  id: number;
  request: { path: string; args?: unknown[]; value?: unknown; maxLength?: number };
};
~~~

### 3. Resolve the hosting page from ownerId in the renderer

1. Keep the existing requestBoardPort signature and BoardPortEntry.ownerId unchanged. The Board
   handshake already carries the stable BoardEditorModel ID.
2. In the internal renderer command, call pagesModel.findPage(ownerId). Reject if it returns no
   PageModel; do not fall back to pagesModel.activePage.
3. Use that PageModel's main editor/context to construct the page-scoped root, without activating
   or switching the page as a side effect. Confirm the selected editor/context is still attached
   to the returned page before resolving.

The ownerId lookup was checked against the current source and succeeds because PagesQueryModel's
findPage() explicitly accepts page IDs or any attached editor ID. Therefore no pageId IPC plumbing
is planned. If a future Board lifecycle removes that editor from PageModel.editors before a call
can be handled, the documented fallback is to add an explicit pageId captured from model.page?.id
at BoardWebview.handleLoad(); that fallback is not required by the current ownership invariant.

The identity chain must remain explicit:

~~~
BoardEditorModel.id
  → requestBoardPort(ownerId) [existing handshake]
  → BoardPortEntry.ownerId
  → internal renderer call({ ownerId, request })
  → pagesModel.findPage(ownerId) → hosting PageModel → page-scoped AiRoot.page
~~~

### 4. Enforce the selected trust model at restricted()

Use the recommended trusted-full-tree policy. Add the Board root restriction callback at the root
descriptor passed to resolveCall; have it consult boardTrust.isTrusted(boardRoot) at resolution
time. Keep Board mounting and the existing trust lifecycle unchanged. Do not add a manifest
capability list, a shim-only permission check, or a second resolver guard.

The restriction should apply to every Board call, including a stale port after untrust. Existing
descriptor-level restrictions continue to protect individual app namespaces, exactly as they do
for MCP: in particular, PageWrapper.aiRestricted() calls agentMayAccessBrowserPage() and blocks
the user's incognito/Tor browser page, including every member below it. A trusted Board therefore
cannot read or drive a private browser page unless the page was opened by the agent. execute()
remains the existing Board API and is not behaviorally changed by this task.

The full-tree recommendation never bypasses this privacy guard. The Board root must use the same
PageWrapper descriptors and resolver walk as MCP, so EPIC-083 design decision 7 remains effective.

### 5. Documentation and generated declarations

Update the following as part of implementation, after this task document is approved:

- src/renderer/api/types/app.d.ts: canonical script API and IntelliSense JSDoc.
- assets/mcp-res-scripting.md: script app.call examples and error/hint semantics.
- assets/mcp-res-boards.md: Board persephone.call, hosting-page semantics, JSON-only return values,
  and trust requirement.
- assets/board-template/CLAUDE.md and/or the Board guide source used by read_guide("boards"):
  agent-facing API guidance, including the regex verification example.
- docs/boards.md: keep the user-facing Board API inventory and trust explanation consistent if
  the implementation changes that guide's documented surface.

assets/editor-types is generated from src/renderer/api/types by the Vite plugin, so do not hand-edit
its generated copies. The project memory for Boards says they are agent-authored and do not maintain
a shipped Board typings package. Although src/renderer/editors/board/board-api.d.ts exists as an
authoring/reference shape, it is not the maintained script declaration surface; update it only if
the implementation workflow explicitly changes that policy, not merely to advertise this API.

## Concerns and resolved decisions

- **Board permission:** choose trusted Board = full AiVision tree. Existing trust gates mounting,
  and trusted Board code already has execute()/executeNode() plus file/dialog capabilities, so a
  manifest list would not be a meaningful security boundary. Enforce the decision with the
  resolver's restricted() hook on the Board root, including trust revocation races.
- **Hosting page:** BoardWebview passes the BoardEditorModel ID as ownerId, and
  PagesQueryModel.findPage(ownerId) maps any attached editor ID to its PageModel. Use that lookup
  in the host renderer; do not derive the page from activePage after a tab change. No IPC signature
  change is needed while this owner-to-page invariant holds.
- **Programmatic errors:** both APIs reject Error; they do not expose the MCP result envelope.
  This keeps script and Board calls composable while preserving MCP's existing { error } result.
- **Hints:** both new surfaces always pass HintMode "never"; maxLength still controls the shared shaping
  bound; callers get the shaped plain value, not truncation metadata.
- **Arguments and writes:** JSON-compatible args invoke the final member and value performs the
  resolver's existing assignment. Do not add a parallel invocation or mutation mechanism.
- **JSON boundary:** keep result-shaper.ts as the only shaper. Add only a defensive serialisability
  check before main posts the renderer result to the Board; if a descriptor violates its summary
  contract, return a correlated error instead of crossing a live object.
- **Transport lifetime:** port disconnect, host destruction, renderer timeout, and trust changes
  need pending-call cleanup and bounded rejection. Do not leave promises pending.
- **MCP compatibility:** src/renderer/api/mcp/call-command.ts and the public MCP call tool are
  explicitly unchanged in behavior. Reuse internal resolver mechanics, not the MCP response API.
- **File ordering:** US-1292 and US-1295 also change root.ts. Reconcile the implementation with the
  on-disk root descriptor and constructor after those changes land.
- **Scope:** US-1295's main node, US-1292's new descriptors, and new descriptors generally are
  out of scope. No unit tests or test harnesses are to be written; verification is manual/agent
  driven after implementation.

## Acceptance criteria

1. A script can call await app.call("page.grouped.content") and receive the plain shaped value; it
   can pass JSON args or value, and args plus value is rejected. The request passes HintMode
   "never", so hints and resolver metadata are not returned. Resolver and transport errors reject
   as Error.
2. The script root uses the page supplied to its ScriptContext for page and page-relative collection
   behavior, while the existing MCP helper still uses its current context behavior.
3. A Board can call await persephone.call("page.grouped.content") through a distinct correlated
   Board envelope with HintMode "never". The call reaches the renderer that hosts that Board and
   the page identity remains the page hosting the Board even after the user activates another tab.
4. No live object crosses the Board port. Successful results and error records survive a JSON
   serialization check; Board failures reject as Error with a useful message.
5. The Board root's resolver restricted() denies calls when the Board is untrusted. A trusted Board
   can resolve the full existing AiVision tree, subject to every existing descriptor restriction;
   specifically, the same agentMayAccessBrowserPage guard used by MCP prevents reading or driving
   the user's incognito/Tor browser page. No manifest capability list is required.
6. The public MCP call tool retains its current hint and envelope behavior, and no main node or new
   descriptor is added as part of this work.
7. The script declaration has JSDoc and is copied into Monaco's generated editor-types; Board
   guidance is updated in prose rather than treating board-api.d.ts as a maintained shipped typing
   package.

### Required worked verification case

Implementer verification should use a small trusted Board with a text area showing the current
grouped content, a regex pattern input, flags input, and Run/Write buttons:

1. On Run, execute const source = await persephone.call("page.grouped.content").
2. Build new RegExp(pattern, flags) in Board code, run it against source, and render the matched
   strings (or serializable { match, index } records) in the Board UI.
3. On Write, call
   await persephone.call("page.grouped.content", { value: JSON.stringify(matches, null, 2) }).
   The grouped editor should contain the resulting text, and the call should return the shaped value or
   reject an Error for an invalid write.
4. Switch to another page/tab while the Board remains mounted and repeat Run. The source must still
   be the grouped content of the page hosting the Board, not the newly active page.
5. Repeat with an untrusted Board or after revocation and confirm the resolver restriction rejects the
   call; confirm no object with live renderer methods appears in the port payload.

## What cannot be verified without the user

- The final UX and wording of trust/revocation prompts, if the user wants a visible explanation beyond
  the resolver error.
- Whether existing users expect trusted Boards to gain this full-tree capability immediately or want
  an opt-in migration setting despite the recommendation above.
- The preferred regex Board layout and exact match output formatting.
- End-to-end behavior against a real user's grouped-page content, tab-switch timing, and trust
  revocation interaction cannot be confirmed in this investigation-only pass.

## Files expected to change during implementation

| File | Planned change |
|---|---|
| src/renderer/api/types/app.d.ts | Add IApp.call and JSDoc. |
| src/renderer/scripting/api-wrapper/AppWrapper.ts | Add the live-context wrapper method. |
| src/renderer/scripting/ai-vision/root.ts | Accept an explicit script/Board page root and Board restriction callback as needed. |
| src/renderer/scripting/ai-vision/call.ts | Factor/reuse resolver invocation without changing MCP behavior. |
| src/board-shim.ts | Expose persephone.call and correlated result handling. |
| src/ipc/board-bridge-channels.ts | Add call request/result message types. |
| src/main/board-bridge.ts | Route call envelopes and pass the existing ownerId to the targeted lookup. |
| src/main/mcp/renderer-bridge.ts | Export a helper that maps host WebContents to window index and delegates to existing sendToRenderer(). |
| src/renderer/api/mcp/command-registry.ts and a Board-call command module | Register/handle the internal targeted renderer request. |
| assets/mcp-res-scripting.md | Document script app.call. |
| assets/mcp-res-boards.md, Board guide, and possibly docs/boards.md | Document Board call, trust, host-page, and JSON semantics. |

The following are intentionally **not** implementation targets for US-1296: src/shared/ai-vision/resolver.ts,
types.ts, result-shaper.ts, and hint.ts (reuse them); src/renderer/api/mcp/call-command.ts and
the public MCP behavior (preserve them); src/renderer/editors/board/board-manifest.ts and
src/renderer/editors/board/board-api.d.ts (no manifest capability and no maintained shipped Board
typings); src/ipc/api-types.ts, src/ipc/renderer/api.ts, src/ipc/main/board-handlers.ts, and
src/renderer/editors/board/BoardWebview.ts (existing ownerId handshake is sufficient); and all
US-1295/main-node or new-descriptor files.

## Files Changed Summary

This investigation-only pass changes documentation tracking only:

- Added this implementation plan at doc/tasks/US-1296-programmatic-call/README.md.
- Linked US-1296 from the EPIC-083 block in doc/active-work.md.
- Linked US-1296 from the EPIC-083 Linked Tasks table in doc/epics/EPIC-083.md.
- No source implementation, tests, or test harnesses were added.
