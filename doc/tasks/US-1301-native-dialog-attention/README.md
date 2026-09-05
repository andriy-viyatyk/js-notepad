# US-1301: native dialog attention

**Epic:** [EPIC-084](../../epics/EPIC-084.md)  
**Status:** Planned  
**Depends on:** [US-1297: attention on every call result](../US-1297-call-attention/README.md) for
the pending/attention result envelope

## Implementation progress

- [x] Add the per-window native-dialog tracker and one helper supporting sync/async calls.
- [x] Wrap all five verified direct Electron dialog call sites.
- [x] Annotate forwarded call results with native-dialog attention, and convert only an active-dialog bridge timeout to pending.
- [ ] Manually verify each dialog kind, window isolation, cancellation, and timeout behavior.

## Goal

Track every native Electron dialog opened for a specific application window and report it through
the public MCP `call` result while that window has an active native modal. Native OS dialogs are
reported only: no AiVision path or agent action may answer, select, dismiss, or otherwise drive
one.

## Background

### Verified native-dialog inventory

The scoped search of `src/main/**` and `src/ipc/**` found five direct Electron dialog calls and
three indirect routes:

| Direct call site | Native call and window identity | Existing callers/routes |
|---|---|---|
| `src/ipc/main/dialog-handlers.ts:9-35` | `dialog.showOpenDialog(browserWindow, ...)` for files; async result, cancellation and folder-memory handling follow at :31-35 | Renderer `app.fs.showOpenDialog()` reaches `ipc/renderer/api.ts:90-95`, then `core-handlers.ts:60-62`; Board `openFileDialog` reaches the same helper through `main/board-bridge.ts:210`. |
| `src/ipc/main/dialog-handlers.ts:38-57` | `dialog.showSaveDialog(browserWindow, ...)` for files | Renderer endpoint path is `core-handlers.ts:63-65`; Board `saveFileDialog` uses `board-bridge.ts:211`. |
| `src/ipc/main/dialog-handlers.ts:59-83` | `dialog.showOpenDialog(mainWindow, ...)` with `openDirectory` | Renderer endpoint path is `core-handlers.ts:66-68`; Board `openFolderDialog` uses `board-bridge.ts:212`. |
| `src/main/download-service.ts:85-105` | Synchronous `dialog.showSaveDialogSync(parentWindow, { defaultPath })`; `getParentWindow()` maps the download/webview `WebContents` to its host `BrowserWindow` at :76-83 | `will-download` is the direct caller; it must remain synchronous because the save path is required before the handler returns at :107-113. |
| `src/main/browser-service.ts:237-259` | Synchronous `dialog.showMessageBoxSync(parentWindow, options)` or the unparented overload at :253-255 | `will-prevent-unload` creates the “Unsaved changes” Leave/Cancel prompt; the result controls `event.preventDefault()` at :256-258. |

No other `showOpenDialog`, `showSaveDialog`, `showMessageBox`, `showErrorBox`, synchronous
counterpart, certificate dialog, or about dialog call was found in those two trees. The similarly
named `src/main/dialog-folder-memory.ts:15-17` reference is documentation for the synchronous
download exception, not another Electron call. `src/ipc/api-types.ts:159-167` and
`src/ipc/main/core-handlers.ts:326-328` define/register the three renderer endpoints; they do not
open dialogs themselves.

### Verified async versus synchronous behavior

The renderer-side `executeOnce()` sends an IPC message and waits on a reply at
`src/ipc/renderer/api.ts:30-54`; it does not synchronously block the renderer thread. Main's
`bindEndpoint()` invokes the handler from an `ipcMain.on` callback and awaits it at
`src/ipc/main/endpoint-registry.ts:18-27`. Consequently, the three async `showOpenDialog` /
`showSaveDialog` calls yield while Electron owns the native window-modal picker: the target window
cannot receive user input, but renderer JavaScript and its MCP message handler remain schedulable.
The tracker must not race every forwarded call into `pending`, because a call sent while an async
picker is open can still return its ordinary renderer result. It should attach stable native
attention to a normal result only when the tracker still reports the dialog for that target.

The two `show*DialogSync` calls are different: they execute on main's event loop at the verified
sites in `download-service.ts:102-105` and `browser-service.ts:253-255`. While either is open,
main cannot run `call-tools.ts` or send/receive the renderer bridge message. The wrapper can record
state and clear it correctly, but it cannot make that already-blocked main loop report the dialog
in real time.

The wrapper must therefore live in a new main-owned helper,
`src/main/native-dialog-tracker.ts`, and every direct call must pass through it:

- One `withNativeDialog(window, kind, operation)` helper wraps all five calls, with `begin` before
  the Electron call and `end` in `finally`; it preserves a synchronous return for sync operations
  and settles asynchronous operations with the same cleanup guarantee.
- The wrapper records active dialog kinds per `BrowserWindow` (including nested/count-safe opens),
   records active state, and clears it before the operation's result is returned. An
  absent `BrowserWindow` is not associated with a target renderer and is not reported as a window
  attention state.

This gives both renderer IPC and Board RPC the same tracking path without editing their callers:
the Board bridge already resolves its host with `ownerWindow(entry.hostWebContents)` at
`src/main/board-bridge.ts:210-212`, and the renderer handlers already derive their parent from
`BrowserWindow.fromWebContents(event.sender)` at `src/ipc/main/core-handlers.ts:60-68`.

### Verified result pipeline and the native-modal gap

EPIC-084 design decision 8 requires reporting native dialogs, while decision 1 says attention is
attached to the public renderer-targeted `ICallResult`; the pending branch remains the established
contract for renderer dialogs that block their originating action. The
shared shape already exists at `src/shared/ai-vision/resolver.ts:35-48`:

~~~
export interface ICallResult {
    path: string;
    result?: unknown;
    pending?: boolean;
    attention?: { text: string };
    // existing truncation, hint, error, resolvedUpTo fields
}
~~~

`src/main/mcp/tools/call-tools.ts:165-175` already mirrors `pending` and `attention` in its local
`ICallEnvelope`. Its `toCallResult()` at :182-203 already emits a pending text block, then
attention, suppresses the value/error while pending, and returns `isError: false`; normal errors
remain errors. US-1301 should construct that same envelope in main rather than change the shared
resolver or invent a native-dialog node.

The public route is main `call-tools.ts:143-159`: renderer paths go through
`sendToRenderer("call", ...)`, while `routeCallPath()` resolves `main.*`, the `windows` root, and
some closed-window members in main at :33-67. Only a forwarded renderer route has a target window
whose native-dialog tracker can annotate a renderer result. `app.call()` and Board `persephone.call()` retain their
plain-value contracts and are not given an attention envelope.

The hard part is deciding when the renderer result can be annotated and when the bridge has no
answer. `src/main/mcp/renderer-bridge.ts:9` defines the verified
`REQUEST_TIMEOUT_MS = 30_000`; `sendToRenderer()` applies it at :50-60 and resolves a timed-out
request as `{ error: { code: -32603, message: RENDERER_REQUEST_TIMEOUT_MESSAGE } }`. The bridge does not cancel
the renderer action, and its pending request entry is removed at timeout. Main uses the normal
result path whenever a renderer response arrives while the native tracker is active.

The main `call-tools.ts` handler will use the target window index selected by the same default or
explicit routing as `sendToRenderer()` and inspect tracker state around the renderer response:

1. Send the renderer request normally. If a renderer result arrives while a native dialog remains
   active for that target, merge one stable native-attention section into its existing optional
   `attention` field and deliver the ordinary result/value/error. Do not discard the result and do
   not return pending merely because the native dialog opened before the request.
2. If the renderer response is the bridge timeout sentinel and the tracker still reports an
   active native dialog for that target, return a main-created
   `{ path, pending: true, attention }` envelope. The original renderer action is not cancelled;
   its eventual value is deliberately not delivered later, matching US-1297's pending contract.
   If the timeout arrives after the native dialog has closed, preserve the ordinary timeout error.

The attention text is intentionally non-actionable. For file/folder dialogs use the required
message “Attention: a native file dialog is open; only the user can answer it — it cannot be
answered by an agent.”; for the verified message-box call use the same sentence with “message box”
in place of “file dialog”. In a multi-window session, include the target window index in the
sentence; in a single-window session, the shorter required wording is sufficient. The text is a
stable, idempotent snapshot for the active kind/window, so repeated ordinary call results may carry
the same attention until the user clears the OS dialog. It contains no title, button path,
callback, or secret. No timer, retry, or grace period is added: the 250 ms grace in renderer
`attention.ts` is for renderer dialogs that can open and close within one action, not an OS modal
that the user must answer.

The synchronous case is a known limitation: main's event loop is blocked while
`showSaveDialogSync` or `showMessageBoxSync` is open, so no `call` can execute, be answered, or be
annotated during that interval. The wrapper still provides correct state cleanup and a foundation
for future non-blocking dialog kinds; it does not make these two synchronous dialogs reportable in
real time.

### Window ownership and lifecycle

The tracker key is the actual `BrowserWindow`, not a global boolean: `openWindows.windows` assigns
stable indices in `src/main/open-windows.ts:11-31`, and `sendToRenderer()` selects either the
explicit index or the first open window at `renderer-bridge.ts:28-32`. A small tracker lookup by
that same selection must be used by `call-tools.ts`, so default-window calls and explicit
`windowIndex` calls cannot report another window's dialog. A `windows[i]` prefix is stripped before
forwarding by `routeCallPath()` and restored in `call-tools.ts:146-155`; native attention has no
renderer path to prefix, but the result's original `path` must remain the agent's spelling.

Closing/cancelling a native dialog always executes the wrapper's `finally`, including Electron
rejections and synchronous cancellation. Window destruction must also discard its tracker entry;
using a `WeakMap<BrowserWindow, ...>` avoids retaining closed windows. Tracking is observation
only and must not change the existing return values, folder-memory updates, unload prevention,
download cancellation, or Board bridge.

## Implementation Plan

1. Add `src/main/native-dialog-tracker.ts`. Define the tracked kinds needed by the verified
   inventory (`file`, `folder`, `messageBox`), a per-`BrowserWindow` active-count/list state, and
   a read API for the active native attention associated with a target window. Keep the attention
   formatter JSON-safe and return only the prescribed user-facing
   “only the user can answer it” text. Ensure `end` runs once in `finally`, supports sync and async
   operations, and has no effect for an undefined parent window.
2. Change `src/ipc/main/dialog-handlers.ts:15`, :43, and :64 so all three `dialog.show*Dialog`
   calls are inside `withNativeDialog(...)`, preserving their existing options, cancellation
   branches, remembered-directory writes, and return types. Do not put tracking in
   `core-handlers.ts`; both renderer endpoints and Board RPC already converge here.
3. Change `src/main/download-service.ts:102-105` to use the same helper with its verified
   `parentWindow` and preserve the required synchronous `will-download` behavior. Change
   `src/main/browser-service.ts:253-255` to use the same helper around both the parented
   and unparented `showMessageBoxSync` overloads; preserve the existing Leave/Cancel result logic.
4. Add the main-side integration in `src/main/mcp/tools/call-tools.ts` using the target
   `BrowserWindow` selected by the same explicit/default rule as `sendToRenderer()`. After a normal
   renderer response, merge the active native attention into `ICallResult.attention` without
   changing its value/error/pending status. Reuse the existing attention text if already present
   and avoid duplicate sections.
5. Export the exact timeout sentinel
   `RENDERER_REQUEST_TIMEOUT_MESSAGE` from `src/main/mcp/renderer-bridge.ts`; use that constant at
   the resolve site at :57-60 and in `call-tools.ts` rather than comparing a duplicated literal.
   In the same `call-tools.ts` handler, convert only a sentinel timeout with active native tracker
   state into `{ path, pending: true, attention }`; leave missing-window, closed-window,
   renderer-error, and post-close timeout responses unchanged. Keep `toCallResult()` and its
   leading pending/attention ordering intact.
6. Cover all native kinds in attention text without exposing dialog options or values. Native
   dialogs have no `menus`/`dialogs` resolver path and no `click`/`cancel` API in this task. Keep
   `main.*`, the `windows` root, and non-renderer programmatic call surfaces outside
   native-attention annotation as required by EPIC-084's process ownership decisions.
7. Manually verify one async open, save, and folder picker; the synchronous download save picker;
   the synchronous browser unload message box; simultaneous windows with only one modal; native
   cancellation; a normal renderer result annotated while an async dialog remains active; and a
   forced `REQUEST_TIMEOUT_MS` path that converts to pending only while the tracker remains
   active. Then run the epic's typecheck/lint/build checks after implementation; this task document
   implements nothing.

### Before → after snippets

Current direct call and timeout behavior:

~~~
// ipc/main/dialog-handlers.ts
const result = await dialog.showOpenDialog(browserWindow, options);

// main/mcp/renderer-bridge.ts:9, 57-60
const REQUEST_TIMEOUT_MS = 30_000;
resolve({ error: { code: -32603, message: "Request timeout" } });
~~~

Planned wrapper and main-owned pending result:

~~~
// main/mcp/renderer-bridge.ts
export const RENDERER_REQUEST_TIMEOUT_MESSAGE = "Request timeout";

// main/native-dialog-tracker.ts
export function withNativeDialog<T>(
    window: BrowserWindow | undefined,
    kind: NativeDialogKind,
    operation: () => T | PromiseLike<T>,
): T | PromiseLike<T> {
    const end = beginNativeDialog(window, kind);
    try {
        const result = operation();
        if (isPromiseLike(result)) {
            return result.then(
                value => { end(); return value; },
                error => { end(); throw error; },
            );
        }
        end();
        return result;
    } catch (error) {
        end();
        throw error;
    }
}

// main/mcp/tools/call-tools.ts
const response = await sendToRenderer(...);
if (isRendererResult(response) && nativeDialogTracker.isActive(targetWindow)) {
    response.result = addNativeAttention(response.result, targetWindow);
}
if (response.error?.message === RENDERER_REQUEST_TIMEOUT_MESSAGE
    && nativeDialogTracker.isActive(targetWindow)) {
    return { result: { path, pending: true, attention: nativeAttention(targetWindow) } };
}
~~~

## Concerns / Resolved Decisions

- **Normal result versus pending:** normal renderer results retain their value/error and receive
  native attention only while the per-window tracker still reports the dialog. Pending is a
  defensive conversion only for the bridge timeout sentinel plus active native state.
- **Existing pending shape:** reuse `ICallResult.pending` plus `attention`, which main already
  renders as a non-error leading result. No new shared field and no second native-dialog result
  protocol are needed.
- **Every call site:** the three async file/folder calls, download save sync call, and browser
  message-box sync call are wrapped. `core-handlers.ts` and `board-bridge.ts` remain unchanged
  because they already route through the async helper.
- **Synchronous limitation:** main cannot execute `call-tools.ts` during either synchronous native
  dialog, so those dialogs cannot be reported in real time; tracking remains for cleanup and
  future non-blocking kinds.
- **Per-window state:** key by actual `BrowserWindow` and select it using the same explicit/default
  rule as `sendToRenderer()`. A modal in window 1 must never annotate a call sent to window 0.
- **Native dialogs are never driven:** no descriptor member, click method, native button mapping,
  title scraping, or browser automation fallback is added. The user must answer the OS dialog;
  the agent re-reads application state afterward.
- **Stable repeated attention:** normal results may repeat the same native attention while the same
  kind remains active. The text includes the target window in multi-window sessions, is idempotent,
  and has no timer/retry/grace behavior. If the dialog closes before a response or timeout check,
  no stale native attention is fabricated.
- **Sync versus async:** the one helper uses `try/finally` for both forms; its sync branch does not
  introduce an `await` or defer the download handler's required save-path decision.
- **Non-renderer routes:** `main.*`, the `windows` root, closed-window main-owned state, and the
  plain-value `app.call()` / Board call APIs do not receive native attention in this task because
  they do not carry the public renderer `ICallResult` surface.

## Acceptance Criteria

1. Every direct native dialog call in the verified inventory goes through the one tracker helper;
   async, sync, cancellation, rejection, and window-absence paths clear tracking correctly.
2. Tracker state is isolated per actual application window and exposes active native dialog status
   to main `call-tools.ts`; another window's modal cannot affect the result.
3. A forwarded renderer call whose result arrives while its target has an active native dialog
   retains its ordinary value/error/pending status and receives stable `attention.text`. The
   attention says only the user can answer the native dialog and contains no driver path.
4. If `sendToRenderer()` reaches its verified 30-second `REQUEST_TIMEOUT_MS` and a native dialog
   is still active, main converts that timeout into the pending result; otherwise the ordinary
   timeout/error remains unchanged.
5. Existing file/folder return values, download save behavior, browser unload behavior, folder
   memory, Board RPC, renderer dialog/menu attention, and `toCallResult()` ordering remain intact.
6. No native dialog is reachable through `dialogs`, `menus`, `call` arguments, or a newly added
   automation action; native dialogs are reported, never driven.

## Files Changed Summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1301-native-dialog-attention/README.md` | This verified inventory, design, and implementation plan. |
| `doc/active-work.md` | Link US-1301 under EPIC-084 and keep it unchecked. |
| `doc/epics/EPIC-084.md` | Link US-1301 in the epic task table. |
| `src/main/native-dialog-tracker.ts` | New per-window sync/async tracking and active-attention lookup. |
| `src/ipc/main/dialog-handlers.ts` | Route all three async file/folder dialogs through the tracker. |
| `src/main/download-service.ts` | Track the synchronous download save dialog. |
| `src/main/browser-service.ts` | Track the synchronous unload-protection message box. |
| `src/main/mcp/tools/call-tools.ts` | Attach active native attention to normal renderer results and synthesize pending attention only for an active timeout. |
| `src/main/mcp/renderer-bridge.ts` | Export `RENDERER_REQUEST_TIMEOUT_MESSAGE` and use it at the timeout resolve site. |

Files intentionally needing NO changes for US-1301:

| File/group | Reason |
|---|---|
| `src/shared/ai-vision/resolver.ts` | `ICallResult.pending` and `attention` already exist at :35-48; the main process can construct the existing shape. |
| `src/ipc/main/core-handlers.ts`, `src/main/board-bridge.ts` | Their dialog routes already converge on `dialog-handlers.ts`; changing them would duplicate tracking. |
| `src/ipc/api-types.ts`, `src/ipc/renderer/api.ts`, `src/renderer/api/fs.ts` | Existing typed endpoint and renderer API contracts remain unchanged. |
| `src/main/dialog-folder-memory.ts` | It supplies default-path persistence and documents the sync exception; it does not open a dialog. |
| `src/renderer/scripting/ai-vision/attention.ts`, `call.ts`, `dialogs/**`, `menus/**` | Native state is main-owned; renderer attention and the renderer menus/dialogs nodes are not drivers for OS dialogs. |
| `src/main/mcp/ai-vision/**` | Main-local AiVision roots have no renderer window attention state. |
| `src/renderer/api/mcp/command-registry.ts`, `call-command.ts`, `board-call-command.ts`, `src/board-shim.ts` | Existing dispatch and plain-value programmatic-call contracts are preserved. |
| `src/main/open-windows.ts` | Existing window/index ownership is read by the tracker integration; window lifecycle ownership is not moved. |
