# US-1297: attention on every call result

**Epic:** [EPIC-084](../../epics/EPIC-084.md)  
**Status:** Implementation complete; verification pending  
**Depends on:** [US-1298: dialogs root node](../US-1298-dialogs-node/README.md) only for replacing the
documented dialog fallback with resolved dialog paths. Correctness of pending results and attention
does not depend on US-1298.  
**Implementation order:** First of the coupled US-1297/US-1298 pair

Implement US-1297 first: add pending results, attention collection, and main rendering using the
fallback text below. Then implement US-1298. After both are in place, replace the fallback text with
the resolved `dialogs[i]` paths supplied by the adapters.

## Implementation progress

- [x] Add the shared pending and attention result fields.
- [x] Collect newly opened blocking dialogs with the 250 ms pending grace period.
- [x] Report visible popup labels without invoking menu callbacks.
- [x] Render pending/attention before existing result, truncation, and hint blocks.
- [x] Implement resolved `dialogs[i]` action paths after US-1298, with the documented fallback retained for unavailable adapters.
- [ ] Manually verify the modified-page, error, hint, explicit-window, and prefixed-window scenarios.

## Goal

Make a renderer-targeted MCP call result explain blocking dialogs and open popup menus in the
target window, including the path an agent can use to resolve the surface. Preserve the current
result value/error and hint behavior, but render attention as a leading MCP text block. Before
US-1298 lands, dialog attention must use the documented fallback text rather than emitting a path
that does not resolve.

## Background

### Verified AiVision and result pipeline

The shared contract currently defines ICallResult at
[src/shared/ai-vision/resolver.ts](../../../src/shared/ai-vision/resolver.ts):35-44 with path,
shaped result, truncation metadata, optional hint, error, and resolvedUpTo; it has no attention
field yet. resolveCall parses and walks the path, awaits every hop, and returns success/error
records in the same file at :48-167. errorAt at :184-203 is the common resolver-error return for
most failed hops. errMessage is already used for caught invocation errors at :132 and must also be
used by any new attention collector when it catches an unknown error.

The resolver checks a descriptor's optional restricted() hook before each hop at
resolver.ts:81-83, and validates named members against the descriptor at :98; the collector must
not bypass either rule. HintMode is declared at resolver.ts:23 and only gates nodeHint() at
:175-181; hint formatting itself is in hint.ts:42-70. The descriptor branch that prevents
result-shaping from dumping a described object is result-shaper.ts:39-46, while help-search.ts
:31-62 follows only node:true properties and live children.

The renderer call path is:

~~~
main call-tools.ts handler
  -> sendToRenderer("call", ...)
  -> renderer command-registry.ts / call-command.ts
  -> aiCall() / resolveAiCall()
  -> resolveCall(new AiRoot(...))
~~~

Evidence:

- [src/main/mcp/tools/call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):120-153 routes,
  forwards, restores windows[i]. paths, records seen hint kinds, and calls toCallResult().
- [src/renderer/api/mcp/command-registry.ts](../../../src/renderer/api/mcp/command-registry.ts):1-7
  imports handleCall and :29-31 registers call and board_call.
- [src/renderer/api/mcp/call-command.ts](../../../src/renderer/api/mcp/call-command.ts):10-20
  normalizes the MCP request, passes seenKinds, and returns the renderer ICallResult.
- [src/renderer/scripting/ai-vision/call.ts](../../../src/renderer/scripting/ai-vision/call.ts):14-30
  creates the MCP ScriptContext and resolves through AiRoot; :18-20 disposes it in finally.
- [src/renderer/scripting/ai-vision/root.ts](../../../src/renderer/scripting/ai-vision/root.ts):1
  uses the lazy import "./namespaces" pattern. Root members are :28-65 and its
  descriptor/children are :105-126; dialogs is not present yet.

The main renderer currently assembles the value/error first and the hint last:
[src/main/mcp/tools/call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):159-190. Errors emit
the first text block at :180-183, success emits the value at :184-188, and the hint is appended
at :189. This is the insertion point for a leading attention block. ICallEnvelope is declared at
:159-167 and must carry the same optional field.

### Three entry points and their existing contracts

The public MCP call is the result surface in scope: it retains the complete ICallResult and is
rendered by main. It can target an explicit windowIndex, or a windows[i]. prefix; forwarding and
prefix restoration are implemented at call-tools.ts:138-149. Attention must be collected in the
renderer belonging to that target window. A prefixed path must have its quoted attention paths
prefixed back to the agent's original windows[i].dialogs[...] spelling.

US-1296 also created two renderer resolver entry points, but they intentionally discard the
ICallResult envelope:

- Script app.call() in
  [src/renderer/scripting/api-wrapper/AppWrapper.ts](../../../src/renderer/scripting/api-wrapper/AppWrapper.ts):142-155
  calls resolveCall() with hints: "never", throws new Error(result.error), and returns only
  result.result. Its public contract at
  [src/renderer/api/types/app.d.ts](../../../src/renderer/api/types/app.d.ts):74-84 and
  :190-198 promises a plain bounded value and rejected errors.
- Board persephone.call() in [src/board-shim.ts](../../../src/board-shim.ts):268-295 sends the
  JSON request, while
  [src/renderer/api/mcp/board-call-command.ts](../../../src/renderer/api/mcp/board-call-command.ts):25-58
  resolves it with hints: "never" at :26-30 and currently returns only result.result at :52-53.
  Main transports that plain result at
  [src/main/board-bridge.ts](../../../src/main/board-bridge.ts):251-272; the shim resolves it as
  a plain value at :318-330.

Therefore this task keeps attention in the MCP call envelope. `app.call()` and `persephone.call()`
stay plain-value by decision: script callers can await a dialog like any other awaited action, and
they have no ICallResult envelope in which to render attention. Changing either API to return
`{ value, attention }` would violate the additive/plain-value contract recorded by US-1296.

### Blocking dialog and popup state verified in the renderer

[src/renderer/ui/dialogs/DialogsView.ts](../../../src/renderer/ui/dialogs/DialogsView.ts):10 defines
dialogsState as TGlobalState<IDialogViewData[]>. showDialog() assigns an ID, installs model.onClose,
appends the data to that state, and removes the same entry on close at :132-142. The live order is
therefore the array order and is the source of dialogs[i]. The IDialogViewData shape is
[dialog-view-registry.ts](../../../src/renderer/ui/dialogs/dialog-view-registry.ts):16-25
(viewId, model, optional internalId); the native view registry at :32-41 is keyed by viewId.

[src/renderer/ui/dialogs/poppers/showPopupMenu.ts](../../../src/renderer/ui/dialogs/poppers/showPopupMenu.ts):16-26
defines app popup state (x, y, items, skipInspect) and its model. showAppPopupMenu() copies caller
items, adds optional Paste/Copy/Inspect, and publishes the model through showPopper() at :213-242.
The shared popper state is read-only exposed by
[PoppersView.ts](../../../src/renderer/ui/dialogs/poppers/PoppersView.ts):121-141 as
visiblePoppers(). MenuItem is defined at
[src/renderer/core/events/context-menu.ts](../../../src/renderer/core/events/context-menu.ts):3-25
with label, disabled, invisible, selected, and recursive items fields. The app popup currently
closes through model.close() at showPopupMenu.ts:177-184.

The popup menu node itself is not part of this task. US-1297 reports its currently visible labels;
US-1299 will provide menus, items, click(label), and close().

`aiCall()` currently creates a `ScriptContext`, awaits `resolveAiCall()`, and disposes the context in
its `finally` at [src/renderer/scripting/ai-vision/call.ts](../../../src/renderer/scripting/ai-vision/call.ts):14-20.
`ScriptContext.dispose()` at [src/renderer/scripting/ScriptContext.ts](../../../src/renderer/scripting/ScriptContext.ts):175-188
restores the previous `globalThis.ui` descriptor and runs/releases every function in `releaseList`.
Disposal therefore stays exactly where it is — in `aiCall()`'s `finally`, when the (pending or
normal) result is returned — and is **not** deferred to the original promise's settlement. The
`ui` getter is a stack: `ScriptContext`'s constructor saves the previous descriptor
(ScriptContext.ts:94) and `dispose()` restores it. Every MCP `call` creates and disposes its own
context, so a context kept alive past its call and disposed later would restore a descriptor from
the middle of the stack, clobbering whichever context (or autoload's getter) is current then. The
still-running action does not need the context: the wrappers it holds (`PageCollectionWrapper`,
`PageWrapper`) are plain objects that remain usable after `dispose()`, which only unsubscribes the
`releaseList` entries and restores `ui`. A never-settling promise is not a leak concern: the dialog
is eventually answered or its window closes.

### Binding decision evidence (EPIC-084 decisions 1-5 and 8)

| Decision | Verified source evidence and current gap |
|---|---|
| 1. Renderer, per-window attention on every call; optional ICallResult.attention; main leading block; errors included | Renderer state is per renderer (DialogsView.ts:10; popup model showPopupMenu.ts:16-26). The current result has no field (resolver.ts:35-44), and main currently appends hint last (call-tools.ts:174-190). resolveCall returns errors as records (resolver.ts:63-167), so the collector must decorate errors too. A pending result is required when the awaited action itself is blocked by a newly opened dialog. |
| 2. Attention is not gated by hints | MCP schema accepts auto, always, never at call-tools.ts:112-118; renderer Board calls explicitly use hints: "never" at board-call-command.ts:25-30; resolver suppresses only nodeHint when mode is never at resolver.ts:175-181, while hint formatting is separate in hint.ts:42-70. The attention pass must run independently of hint construction. |
| 3. Root dialogs, live indexed children, viewId-keyed adapters, shared title/message/buttons/click/cancel | AiRoot currently has no dialogs member (root.ts:28-65). Live state and entry identity are verified (DialogsView.ts:10, :132-147; dialog-view-registry.ts:16-25). US-1298 supplies adapters selected by each entry's viewId, so this task only consumes their eventual paths. |
| 4. Password/encryption expose buttons and cancel only; never value | PasswordDialogModel state includes secret password and confirm (PasswordDialog.ts:15-19), validates and closes with the password at :41-52, and its view renders Encrypt/Decrypt plus Cancel (PasswordDialogView.ts:83-112). The adapter must never read or serialize those fields/results. |
| 5. Menus mirror dialogs later | Existing popup state has items (showPopupMenu.ts:16-24), and item shape supports label/state/submenus (context-menu.ts:3-25), but no menus descriptor exists. US-1297 only reports labels and includes the literal fallback “menus node coming in US-1299”. |
| 8. Native OS dialogs are reported, not driven | Renderer filesystem methods can invoke native dialogs (src/renderer/api/fs.ts:457-490); main IPC handlers call Electron dialogs at src/ipc/main/dialog-handlers.ts:15-72, and main has synchronous calls at src/main/browser-service.ts:254-255 and src/main/download-service.ts:102-105. No open-native-dialog tracker is present in the inspected sources. Reporting is reserved for US-1301; this task must not pretend it can drive or already track them. |

The repository has no dedicated doc/architecture/ai-vision.md; the authoritative post-EPIC-083
architecture text is [doc/architecture/scripting.md](../../architecture/scripting.md):573-588 and
[doc/architecture/overview.md](../../architecture/overview.md):77-84. These describe the shared
resolver, lazy descriptors, renderer routing, and plain programmatic-call contracts.

### Reproduction evidence and the post-resolution problem

The documented reproduction is in
[qa/runs/2026-09-05-epic-083-call-vs-tools.md](../../../qa/runs/2026-09-05-epic-083-call-vs-tools.md),
under “Reproducing”: closing a modified page raises the Unsaved Changes dialog and blocks a
  subsequent renderer operation until it is dismissed. The exact source chain is:

- [TextFileActionsModel.ts](../../../src/renderer/editors/text/TextFileActionsModel.ts):78-96
  shows the dialog with title Unsaved Changes, message based on the title, and buttons Save,
  Don't Save, Cancel; Don't Save returns true at :92-93.
- [PagesLifecycleModel.ts](../../../src/renderer/api/pages/PagesLifecycleModel.ts):482-486
  awaits page.close().
- [PageModel.ts](../../../src/renderer/api/pages/PageModel.ts):694-709 awaits each modified
  editor's confirmRelease() before calling onClose().
- resolveCall() awaits the invoked method at
  [resolver.ts](../../../src/shared/ai-vision/resolver.ts):126-141 and only shapes the final
  result after the walk at :155-157.

Consequently, attention collection must race the original resolver promise rather than wait only for
its completion. The current failure mode is the main-to-renderer timeout at
[src/main/mcp/renderer-bridge.ts](../../../src/main/mcp/renderer-bridge.ts):51-59: `REQUEST_TIMEOUT_MS`
is 30,000 ms, after which the agent receives `Request timeout` while the renderer action is still
awaiting the dialog.

The settled pending contract is: snapshot `dialogsState.get()` before starting resolution, subscribe
to `dialogsState`, and watch for an entry not present in that snapshot. When such an entry appears,
start a short grace timer. If the original `resolveCall()` promise has not settled after the named
`PENDING_DIALOG_GRACE_MS = 250` constant (with an implementation comment explaining that it filters
dialogs that open and close immediately), return `{ path, pending: true, attention }`. This result has
no `result`, no `error`, and therefore becomes `isError: false` in main; the new optional `pending`
field is part of `ICallResult`. If the action settles normally, including when the dialog appears and
closes within the grace period, return the normal result and compute attention afterwards. Menus do
not trigger pending because a popup menu does not block an awaited action; they are included only in
attention.

The original promise is never cancelled and nothing is attached to it beyond a no-op rejection
handler (so an eventual rejection after the pending return does not surface as an unhandled
rejection). Both branches dispose the context in `aiCall()`'s existing `finally` when they return;
see the `ui`-stack reasoning above. The watcher subscription is released in that same `finally`.

## Implementation Plan

1. Add an optional shared attention shape in
   [src/shared/ai-vision/resolver.ts](../../../src/shared/ai-vision/resolver.ts), keeping all
   existing ICallResult fields and resolver error paths intact. The proposed minimal shape is
   attention?: { text: string }; keep it JSON-safe and do not put live models, callbacks, or
   secret values in it. Do not gate it on HintMode.
2. Add a renderer-only collector at
   src/renderer/scripting/ai-vision/attention.ts and call it from the renderer MCP path in
   src/renderer/scripting/ai-vision/call.ts. Snapshot `dialogsState.get()` before invoking
   `resolveCall()`, subscribe for a new entry, and race that watcher against the original promise
   using the named `const PENDING_DIALOG_GRACE_MS = 250;` with a comment that the grace filters
   transient dialogs. If the new dialog remains while the original promise is unsettled after the
   grace, return `pending: true` with attention and no result/error; otherwise return the normal
   result and collect attention after settlement. The collector reads dialogs and the app popup
   snapshot only; catch collector failures with `errMessage` and return useful fallback attention text
   rather than failing the original call. Cover successful and ICallResult.error records.
3. For each dialog entry, use its live array index. When the US-1298 descriptor is available,
   render its title/message/buttons and quote paths exactly as
   dialogs[i].click("<visible label>") plus dialogs[i].cancel(). If the descriptor is absent
   (the normal state between US-1297 and US-1298), use exactly this fallback:
   A blocking dialog is open, but the dialogs node is not available yet; use browser_snapshot/browser_click on pageId "app" to inspect and answer it.
   Do not manufacture a dialogs[i] path in that state.
4. Export this exact narrow read-only helper from
   src/renderer/ui/dialogs/poppers/showPopupMenu.ts:
   `getVisibleAppPopupMenu(): IPopperViewData | undefined`. Implement it by selecting
   `visiblePoppers().find(({ viewId }) => viewId === showAppPopupMenuId)`. `visiblePoppers()` at
   PoppersView.ts:121-141 exposes each live entry's `viewId`, so the app popup is selected by
   `showAppPopupMenuId` without touching other poppers. Report visible, non-invisible item labels
   (including nested labels in deterministic form) and do not invoke onClick. The fallback text must
   contain the exact phrase menus node coming in US-1299; proposed text:
   A popup menu is open with items: <labels>. The menus node coming in US-1299; use browser_snapshot/browser_click on pageId "app" to inspect or choose an item.
5. Update src/main/mcp/tools/call-tools.ts so ICallEnvelope carries attention and optional pending,
   and toCallResult() emits a pending result as a leading text block such as `Pending: the action is
   waiting on a dialog. Answer it, then re-read state.`, followed by the attention block. A pending
   result emits no value block; it emits no hint block unless a hint is present. For normal results,
   the required order is attention, error (and any error result), or value, truncation note, hint.
   Preserve `isError: false` for pending results and `isError: true` only for resolver errors.
6. Extend the existing windows[i]. response rewriting in callTools() so any quoted dialog
   resolution path inside attention is rewritten from renderer-relative dialogs[...] to the exact
    path the agent supplied. The window target remains the forwarded window; do not merge attention
    from another renderer. `main.*` and the `windows` root are documented exceptions: they are
    answered in main, have no renderer window state, and carry no attention.
7. Keep the three-entry-point decision explicit in code comments/docs: the public MCP call carries
   and renders attention; `app.call()` and `persephone.call()` remain plain-value APIs. Their script
   callers can await a dialog like any other awaited action, and they have no result envelope in
   which to render attention, so no metadata contract is added and board-call-command.ts is not
   changed merely to pass through discarded metadata.
8. Manually verify the specified modified-page scenario after implementation: invoke the public MCP
   call against pages.closePage, inspect the leading attention block, and resolve it through the
   US-1298 path once that task lands. Also verify an error result while a dialog/menu is open,
   hints: "never", an explicit windowIndex, and a windows[i]. path. No unit tests or hardcoded
   colors are to be added.

### Before → after snippets

Current shared result and main rendering:

~~~
// resolver.ts
export interface ICallResult {
    path: string;
    result?: unknown;
    // hint/error/resolvedUpTo...
}

// call-tools.ts
if (rest.error !== undefined) content.push(errorBlock);
else content.push(valueBlock);
if (hint) content.push(hintBlock);
~~~

Planned shape and ordering:

~~~
export interface ICallResult {
    path: string;
    result?: unknown;
    pending?: boolean;
    attention?: { text: string };
    // existing truncation, hint, error, resolvedUpTo fields remain
}

if (rest.pending) content.push({ type: "text", text: "Pending: the action is waiting on a dialog. Answer it, then re-read state." });
if (rest.attention) content.push(attentionBlock);
if (!rest.pending && rest.error !== undefined) content.push(errorBlock);
else if (!rest.pending) content.push(valueBlock);
if (hint) content.push(hintBlock);
~~~

The pending-dialog behavior above is the settled contract; the resolver still awaits
`pages.closePage()`, while `aiCall()` races that original promise with the renderer dialog watcher.

## Concerns / Resolved decisions

- **Pending timing is settled.** `resolveCall()` awaits the close action, which awaits the dialog;
  `aiCall()` therefore races that original promise against the new-dialog watcher. The named 250 ms
  grace permits dialogs that open and close immediately to return a normal result with post-settlement
  attention. A still-open dialog produces pending while its original promise continues running.
- **Main-local routing is a documented exception.** `routeCallPath()` resolves `main.*`, the
  `windows` root, and eligible closed-window paths in main (call-tools.ts:33-67). Those routes have
  no renderer window to inspect, so they carry no attention.
- **Programmatic entry points stay plain-value by decision.** Script `app.call()` and Board
  `persephone.call()` callers can await a dialog like any awaited action; they have no envelope to
  render attention. Their contracts remain unchanged and the public MCP envelope is the only result
  surface in scope.
- **US-1298 dependency and graceful degradation.** US-1297 must not import a not-yet-existing
  descriptor module or emit unresolved dialogs[i] paths. Its fallback is useful with the existing
  app-window browser tools; US-1300/US-1301 may later replace that fallback for elements/native
  dialogs.
- **Popup scope.** visiblePoppers() contains other poppers, including downloads and grid options
  (PoppersView.ts:121-141 and existing callers), not only AppPopupMenuModel. The collector must
  identify the app popup by a stable exported helper/view ID and avoid calling or serializing
  arbitrary popper models. US-1299 owns the complete menus model.
- **Native dialogs are not silently covered.** The inspected main/IPC sources show native dialog
  call sites but no tracker. Native reporting remains US-1301 and native driving remains forbidden.

## Acceptance Criteria

1. A public MCP call result for a renderer-forwarded path has optional attention independent of
   hints; when no dialog/menu is open it is absent, and when one is open it is a JSON-safe text
   block.
2. A newly opened blocking dialog that remains after the 250 ms grace returns `pending: true` with
   attention, no result/error, and `isError: false`; the original resolver promise continues until
   the dialog is answered or the window closes. A dialog that closes within the grace returns the
   normal result with attention computed afterwards.
3. Attention is the first content block on both success and resolver-error results; existing
   value/error, truncation metadata, hint, and isError behavior remain intact.
 4. With US-1298 descriptors loaded, a blocking dialog names its title/message/buttons and gives
   dialogs[i].click("<label>") plus dialogs[i].cancel() paths. Before US-1298, the exact
   “dialogs node is not available yet” fallback appears and no unresolved dialog path is quoted.
 5. An open app popup reports visible item labels and includes the exact phrase menus node coming in
   US-1299; it never invokes a menu callback. Native OS dialogs are not claimed or driven here.
 6. Explicit windowIndex, default-window calls, and windows[i]. paths report the target renderer's
   attention; prefixed resolution paths match the path spelling supplied by the agent.
 7. MCP call exposes attention; app.call() and persephone.call() remain plain shaped values by the
   settled compatibility decision.
 8. The modified-page reproduction is manually verifiable after US-1298 lands: US-1297 first returns
   pending with the fallback text, and after US-1298 the same scenario returns resolvable
   `dialogs[i]` paths.
 9. No source behavior is implemented by this document, no unit tests are added, and no existing
   tool is removed.

## Files Changed Summary

| File | Planned change |
|---|---|
| doc/tasks/US-1297-call-attention/README.md | This investigation and implementation plan. |
| doc/tasks/US-1298-dialogs-node/README.md | Coupled dialog-node contract referenced by attention paths. |
| doc/active-work.md | Link US-1297 and US-1298 under EPIC-084. |
| doc/epics/EPIC-084.md | Mark US-1297 and US-1298 In Progress. |
| src/shared/ai-vision/resolver.ts | Add the optional attention result contract, if it remains beside ICallResult. |
| src/renderer/scripting/ai-vision/call.ts | Race resolveCall() against the new-dialog watcher; retain the context until the original promise settles, then attach normal attention. |
| src/renderer/scripting/ai-vision/attention.ts | New renderer collector and fallback formatting. |
| src/renderer/ui/dialogs/poppers/showPopupMenu.ts | Expose a narrow app-popup snapshot helper for attention. |
| src/main/mcp/tools/call-tools.ts | Pass through attention, prefix forwarded paths, and render it first. |

Files intentionally needing NO changes for US-1297:

| File/group | Reason |
|---|---|
| src/renderer/ui/dialogs/dialog-view-registry.ts, Dialogs.ts, src/renderer/core/state/model.ts | US-1298 owns the dialog adapter surface; current lifecycle contracts are read-only evidence. |
| src/renderer/ui/dialogs/*Dialog.ts and *DialogView.ts | US-1298 owns per-view adapters; US-1297 consumes live state/fallback only. |
| src/renderer/api/mcp/command-registry.ts, call-command.ts, board-call-command.ts, src/board-shim.ts, src/main/board-bridge.ts | Existing dispatch/Board plain-value contracts are reused; no board/script envelope change is authorized. |
| src/main/mcp/ai-vision/* | Main roots/services do not own renderer dialog or popup state; response rendering belongs in call-tools.ts. |
| qa/runs/2026-09-05-epic-083-call-vs-tools.md | Existing reproduction evidence is not rewritten by this planning task. |
| doc/architecture/* | Existing scripting.md and overview.md are the verified references; no architecture rewrite is needed for this planning task. |
