# US-1344 — `script.execute(code)` at the renderer root

**Status:** Implemented  
**Epic:** [EPIC-090 — Consolidation](../../epics/EPIC-090.md)  
**Roadmap:** [`execute_script` → `script.execute(code)`](../../agent-transparency-roadmap.md#tool--path-map-starting-point-verified-per-epic)

## Goal

Expose the renderer's existing MCP scripting behavior as `call` path `script.execute(code)`, with
the same renderer execution context and `{ text, language, isError, consoleLogs }` result shape as
`execute_script`. The replacement must be discoverable, explicitly cautioned, and ready for the
verified retirement of `execute_script` in US-1349.

This document is an implementation plan only. No source implementation, guide rewrite, or dashboard
change belongs in this pass.

## Background

### Authoritative epic and roadmap decisions

EPIC-090 decision 3 requires a renderer-root `script` node because `script` has been reserved in
[`RESERVED_ROOT_NAMES`](../../../src/renderer/scripting/ai-vision/root.ts:30-33) since EPIC-083.
The node mirrors `main.script`, but it must run in the renderer context where `app`, `page`, and
the editor facades exist. The epic explicitly requires the old `execute_script` result behavior to
remain visible and requires any deviation to be recorded, following EPIC-089's `open_url` precedent
([EPIC-090](../../epics/EPIC-090.md):106-118).

The deletion ledger authorizes US-1349 to remove `execute_script` only after a bare-`call` scenario
runs code and reads its result. Its replacement row is `script.execute(code)` ([EPIC-090](../../epics/EPIC-090.md):186-205).
The roadmap maps the tool to the same path and identifies it as the renderer analogue of
`main.script.execute` ([agent-transparency-roadmap.md](../../agent-transparency-roadmap.md):107-121).
The dashboard and EPIC-090 already contain the US-1344 entry; this task does not add or edit either.

### Current `execute_script` path and behavior

The MCP definition in [`page-tools.ts`](../../../src/main/mcp/tools/page-tools.ts:7-19) has no
per-tool `timeoutMs`, so the generic registrar forwards it through
[`sendToRenderer`](../../../src/main/mcp/renderer-bridge.ts:29-70) with its default 30,000 ms
timeout. The schema accepts `script`, optional `pageId`, optional `language` (`javascript` or
`typescript`), and `windowIndex` (the latter is stripped by the registrar before forwarding).

`windowIndex` is replaced by the object-model path prefix, not dropped: the equivalent call is
`windows[i].script.execute(code, pageId?, language?)`. This is verified against
[`routeCallPath`](../../../src/main/mcp/tools/call-tools.ts:42-63): a first segment other than
`main` or `windows` is forwarded, and for `windows[i].<member>` the remainder is forwarded to that
window unless the member is in `WINDOW_MEMBER_NAMES`. The current list is
`index`, `status`, `pageCount`, `activePageId`, `pages`, `open`, and `focus`; `script` is not in it.
Therefore `windows[1].script.execute(...)` forwards `script.execute(...)` with `windowIndex: 1` to
window 1's renderer root.

The renderer handler is [`handleExecuteScript`](../../../src/renderer/api/mcp/page-commands.ts:99-111):

```ts
// Current: src/renderer/api/mcp/page-commands.ts:99-111
const pageId = asString(params?.pageId);
const language = asString(params?.language);
const page = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;
const editor = page?.mainEditor as any;
const result = await scriptRunner.runWithCapture(script, editor ?? undefined, language);
return { result: { text: result.text, language: result.language,
    isError: result.isError, consoleLogs: result.consoleLogs } };
```

Therefore the existing execution function to reuse is
`scriptRunner.runWithCapture(script, editor, language)` in
[`src/renderer/scripting/ScriptRunner.ts`](../../../src/renderer/scripting/ScriptRunner.ts:31-43).
`execute_script` reaches that function after selecting the requested page or the active page; the
new node must reach that same function, not `ScriptRunnerBase.execute`, `new Function`, a worker,
or a second result formatter. `runWithCapture` creates a fresh `ScriptContext`, executes through
the shared runner, converts the result with `convertToText`, captures console entries, and disposes
the context ([ScriptRunner.ts](../../../src/renderer/scripting/ScriptRunner.ts:31-43,97-121)).

The execution context is established by [`ScriptContext`](../../../src/renderer/scripting/ScriptContext.ts:54-121):
`app`, `page`, `io`, `ai`, `styledText`, `preventOutput`, a context-bound `require`, and a captured
`console` are available. [`ScriptRunnerBase`](../../../src/renderer/scripting/ScriptRunnerBase.ts:1-100)
transpiles TypeScript when `language` is `typescript`, injects those names through its prefix,
supports expression/statement implicit returns and awaits promise-like results. Node.js access is
the existing native/context-bound `require`; this task does not sandbox or broaden it.

The current result contract is [`McpScriptResult`](../../../src/renderer/scripting/ScriptRunner.ts:7-12):

```ts
interface McpScriptResult {
    text: string;
    language: string;
    consoleLogs: ConsoleLogEntry[];
    isError: boolean;
}
```

`runWithCapture` marks a caught execution error with `isError: true`, and `convertToText` includes
the error message and stack in `text` ([script-utils.ts](../../../src/renderer/scripting/script-utils.ts:4-13)).
Console entries have `level`, stringified `args`, and `timestamp`; they are captured both by the
initial MCP console and by the forwarding installed when `ui` is first accessed
([ScriptContext.ts](../../../src/renderer/scripting/ScriptContext.ts:80-89,235-271)).

### Renderer root and the sibling shape

[`AiRoot`](../../../src/renderer/scripting/ai-vision/root.ts:101-151) already owns the renderer
root descriptor. `ROOT_MEMBERS` is the static resolver allow-list, `ROOT_HELP` is root-level prose,
and `AiRoot` exposes the live values. `script` is currently absent from `ROOT_MEMBERS` but already
reserved, so adding it does not conflict with an existing root property.

The sibling implementation is [`MainScriptNode`](../../../src/main/mcp/ai-vision/main-services.ts:79-93,240-254):

```ts
// Existing sibling: src/main/mcp/ai-vision/main-services.ts:79-93,240-254
const SCRIPT_MEMBERS = [
    { name: "execute", kind: "method", signature: "execute(code)",
      summary: "Evaluate code in the main process and return a shaped result plus captured console logs.",
      caution: `${CAUTION_SCRIPT} ${CAUTION_SCRIPT_TIMEOUT}` },
];

execute(code: string) { return executeMainScript(String(code ?? "")); }

get aiVision() {
    return {
        kind: "MainScript",
        summary: "Settings-gated main-process script execution.",
        members: SCRIPT_MEMBERS,
        help: SCRIPT_HELP,
        restricted: () => isMainScriptsEnabled() ? undefined : MAIN_SCRIPT_DISABLED_MESSAGE,
        summarize: () => isMainScriptsEnabled()
            ? { kind: "MainScript", enabled: true }
            : { kind: "MainScript", enabled: false, note: MAIN_SCRIPT_DISABLED_MESSAGE },
    };
}
```

The shared descriptor contract already supports the required `members`, `help`, and per-member
`caution` fields ([types.ts](../../../src/shared/ai-vision/types.ts:16-75)); no shared type change is
needed. The renderer node should be recognisably parallel, but must not copy the main-process gate
or main-process evaluator.

### Gate investigation

`main.script` is restricted by `isMainScriptsEnabled()` and
`MAIN_SCRIPT_DISABLED_MESSAGE` ([main-services.ts](../../../src/main/mcp/ai-vision/main-services.ts:240-253);
[main-script-gate.ts](../../../src/main/mcp/ai-vision/main-script-gate.ts:1-10)). That gate is specifically
for main-process execution and is actuated from the renderer's `main.scripting.enabled` setting.

The renderer `execute_script` path has no corresponding gate: `page-tools.ts` declares no setting
condition, `handleExecuteScript` performs no setting check, and `scriptRunner.runWithCapture` runs
without consulting `main.scripting.enabled`. `script-library.path` only controls library resolution
in `ScriptRunnerBase.prepare`; it is not an execution permission. Consequently `script.execute`
must have no `restricted()` implementation and must not import `main-script-gate.ts`. Adding a gate
would make the replacement strictly worse than the tool and would fail the US-1349 retirement
standard.

### What `call` does to the result

The renderer command [`handleCall`](../../../src/renderer/api/mcp/call-command.ts:8-18) creates a
fresh MCP `ScriptContext`, builds `AiRoot`, and resolves the path through the shared resolver. The
resolver awaits the method, then applies `shapeResult` to its return value
([resolver.ts](../../../src/shared/ai-vision/resolver.ts:53-70,145-174)). A successful
`script.execute` therefore returns the same four fields as a plain object; the call layer does not
need a new envelope or image mapping.

The main-side [`toCallResult`](../../../src/main/mcp/tools/call-tools.ts:231-264) renders the value
as the first text block (JSON for this object), then appends a hint text block when a hint exists.
There is no image-producing script result path. `text`, `language`, `isError`, and every captured
`consoleLogs` entry remain in the JSON value block; console output is not silently moved to the
hint or discarded. The script node's own `$help` is requested separately as `script.$help`.

There is one verified call-protocol deviation to record. `execute_script`'s `toToolResult` serializes
the complete renderer result, while `call` applies the resolver's default `maxLength` of 20,000 to
nested strings during `shapeResult` ([result-shaper.ts](../../../src/shared/ai-vision/result-shaper.ts:20-79)).
A very long `text` or console argument can therefore be shortened to the shaper's
`… [N chars total]` form when `maxLength` is omitted. The caller can raise `maxLength` on `call`, but
this is not byte-for-byte identical to the old tool's unbounded mapping and must be included in the
retirement evidence.

The other call-layer difference is intentional and must be recorded: a newly opened blocking
renderer dialog can be returned as `pending` with an attention instruction by
[`resolveWithAttention`](../../../src/renderer/scripting/ai-vision/attention.ts:11-99), whereas
`execute_script` had no attention race and would wait for the bridge timeout. This changes how the
agent sees a dialog wait, not the script's execution result once it completes.

### Async and timeout semantics

Both paths use the same renderer bridge default: `sendToRenderer` starts a 30-second timer when no
timeout is supplied ([renderer-bridge.ts](../../../src/main/mcp/renderer-bridge.ts:9-10,52-69)).
`execute_script` has no custom timeout, and `call` also forwards without one in
[`call-tools.ts`](../../../src/main/mcp/tools/call-tools.ts:149-162). A script that resolves before
30 seconds returns its result; a script that runs longer causes the main-side request to resolve as
`Error: Request timeout` while the renderer's JavaScript continues, because the bridge abandons the
response rather than cancelling the promise. This matches the existing tool's behavior.

The `pending`/attention mechanism covers only a newly opened blocking dialog: the watcher waits
250 ms, returns `{ pending: true, attention }`, and leaves the original action alive
([attention.ts](../../../src/renderer/scripting/ai-vision/attention.ts:11-99)). It does not cover an
arbitrary CPU-bound or I/O-bound long-running script without a dialog. Such a script still reaches
30 seconds and returns the bridge timeout; no new polling, cancellation, or timeout is planned.

### Scripting-guide coordination

US-1345 owns the retirement/rewrite of [`assets/mcp-res-scripting.md`](../../../assets/mcp-res-scripting.md);
this task must not edit it. The new `script.$help` should absorb the execution contract that an
agent needs after that guide is gone:

- the no-sandbox renderer/Node.js/user-privilege warning, 30-second timeout, non-cancellation,
  dialog waiting, last-expression result rule, and `consoleLogs` capture from **Execution model &
  security**;
- the four available script globals — `app`, `page`, `io`, and `ai` — plus the fact that
  `page` is the selected/active-page script global and `app` exposes the application services;
- the `language: "typescript"` behavior and lack of type checking from **TypeScript Support**;
- context-bound `require()` and full Node.js access from **Node.js Access**; and
- the error/side-effect/verification rules from **Errors & verification**, including that errors
  return `isError: true` and side effects before a throw or timeout remain performed.

The large `app.pages`, `app.fs`, settings, editor-facade, and examples sections should not be
copied wholesale into one root help string. Their operational API is already represented by the
renderer root, namespace, page, and editor descriptors and their `$help` values; the new script help
should route an agent to those paths and explain that scripts use the same names. US-1345 can then
remove the guide's duplicated tool-specific routing prose without removing API facts that belong to
the existing descriptors.

## Implementation Plan

### 1. Add the renderer script node and root entry

Update [`src/renderer/scripting/ai-vision/root.ts`](../../../src/renderer/scripting/ai-vision/root.ts):

```ts
// Before: root member list has no script entry.
{ name: "main", kind: "property", summary: "Main-process diagnostics and settings-gated scripting; process-wide, never windows[i].main." },

// After: add beside the reserved process-level entries.
{ name: "script", kind: "property", node: true,
  summary: "Execute JavaScript or TypeScript in the renderer with the user's privileges." },
```

Add a `ScriptNode` implementing `IAiVisible`, instantiate it once on `AiRoot`, and expose it via
`get script()`. Its descriptor should use `kind: "Script"`, a summary explaining that this is the
renderer execution context where `app`, `page`, and editor facades live,
`SCRIPT_MEMBERS`, the long-form `SCRIPT_HELP`, and a `caution` on `execute` stating that arbitrary
code runs with the user's privileges and can read/write files, spawn processes, access the network,
and affect the app. Do not add `restricted`, `enabled`, or a setting status.

The method should preserve the current tool's inputs while making the roadmap's one-argument form
the normal form: `execute(code, pageId?, language?)`. With omitted `pageId`, select
`pagesModel.activePage`; with a truthy `pageId`, use `pagesModel.findPage(pageId)`; pass that page's
runner-shaped editor (or `undefined`) and the optional language to `scriptRunner.runWithCapture`.
Resolve that editor through the shared helper required in step 2 below. Preserve
the old empty/non-string script validation message (`Missing or invalid 'script' parameter`) so the
invalid-input call result remains the same text as the tool's `toToolResult` response. Do not accept
secrets, environment maps, credentials, or any new input channel.

The core call must be visibly this reuse:

```ts
// After: conceptual implementation in the renderer ScriptNode.
const editor = resolveRendererScriptEditor(pageId);
return scriptRunner.runWithCapture(code, editor, language);
```

There must be no second compiler, context creator, console collector, timeout wrapper, or result
mapper. The document's required reuse claim is then structural: both `handleExecuteScript` and
`ScriptNode.execute` resolve their target through `resolveRendererScriptEditor` and reach
`scriptRunner.runWithCapture`.

### 2. Keep the old command as the compatibility path until US-1349

Do not delete `execute_script` in this task. Leave the existing `page-tools.ts` definition,
`handleExecuteScript` in `page-commands.ts`, and its `commandRegistry` entry intact so both paths
can be compared and live-tested. US-1349 owns removal after the ledger gate passes.

Create `src/renderer/scripting/renderer-script-target.ts` with a small shared
`resolveRendererScriptEditor(pageId?: string)` helper. It must perform the current truthy
`pageId ? pagesModel.findPage(pageId) : pagesModel.activePage` selection and return the
runner-shaped editor or `undefined`. Move the existing targeted
`eslint-disable-next-line @typescript-eslint/no-explicit-any` and its legacy-`EditorModel` comment
from `page-commands.ts:106-108` into this helper, so the cast and disable-comment exist once.
Have both `handleExecuteScript` and `ScriptNode.execute` call this helper and then the same
`scriptRunner.runWithCapture`; do not make the new node call an MCP command over IPC or duplicate
the full handler envelope. The source of truth for actual execution remains
`scriptRunner.runWithCapture`.

The adapter extraction should have this direct before-to-after shape:

```ts
// Before: src/renderer/api/mcp/page-commands.ts
const page = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const editor = page?.mainEditor as any;
const result = await scriptRunner.runWithCapture(script, editor ?? undefined, language);

// After: page-commands.ts and the new root node
const editor = resolveRendererScriptEditor(pageId);
const result = await scriptRunner.runWithCapture(script, editor, language);

// New: src/renderer/scripting/renderer-script-target.ts
export function resolveRendererScriptEditor(pageId?: string) {
    const page = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;
    // one existing legacy-EditorModel cast/comment, shared by both callers
    return page?.mainEditor as any ?? undefined;
}
```

### 3. Add renderer-root `$help`

Add `SCRIPT_HELP` beside the root descriptor constants and attach it to the script descriptor. It
must explicitly name `app`, `page`, `io`, and `ai`, explain active-page/page-id selection, the
optional JavaScript/TypeScript language, result fields, console capture, full Node.js privileges,
errors, side effects, 30-second timeout, dialog/pending behavior, and the `maxLength` remedy:
long result text or a console argument can be cut at `maxLength`, and raising `call`'s `maxLength`
returns the rest. Point agents to
`app`, `page`, and their descendants for the detailed API surface; do not promise a gate that does
not exist.

The member summary and this help must not copy the old `execute_script` wording that tells the
agent to use `read_guide("scripting")`. That guide tool is removed by US-1349. Point instead at
`script.$help`, the `app` and `page` paths, and `helpSearch` for further discovery.

Keep `ROOT_HELP`'s root-wide object-model routing coherent: it may mention `script.execute(code)`
as the renderer scripting path and `main.script.execute(code)` as the separate settings-gated
main-process path, but the detailed execution contract belongs under `script.$help`.

### 4. Verify the call protocol and retirement evidence

After implementation, run the repository typecheck/lint checks and exercise both entry points with
the same scripts:

1. `script.$help` names `app`, `page`, `io`, and `ai`, explains privileges and timeout, and has no
   settings restriction; `script` is present in the root member hint and has a caution.
2. `call` with `path: "script.execute"` and `args: ["1 + 1"]` returns the same four result keys and
   values as `execute_script` for the equivalent active-page call.
3. Verify `windows[1].script.execute(...)` routes to window 1's renderer: `routeCallPath` forwards
   `script` because it is absent from `WINDOW_MEMBER_NAMES`, and the returned result comes from that
   window's active/selected page. Include this window-prefix case in the US-1349 ledger evidence,
   so `windowIndex` is explicitly retired by the path prefix rather than silently lost.
4. Verify active-page and explicit `pageId` selection, JavaScript and TypeScript language handling,
   `console.log/warn/error/info`, a returned object/array, and a thrown/syntax error with stack text.
5. Verify `call` renders the result JSON in its value text block, preserves logs, and does not emit
   an image block. Verify a long result documents the `maxLength` deviation and can be recovered by
   raising `maxLength`.
6. Verify a script that waits on a renderer dialog returns `pending` plus attention through `call`,
   while a long-running script without a dialog reaches the 30-second `Request timeout` and keeps
   running in the renderer, matching the old bridge semantics.
7. Verify omitted optional fields are omitted rather than replaced with `null`; no secret-bearing
   input is added; and no new hand-rolled error conversion appears.

The final QA artifact required by EPIC-090/US-1349 is a bare-`call` scenario that discovers
`script.execute`, runs code, reads the result, and covers `windows[i].script.execute(...)` so the
old `windowIndex` parameter has verified path coverage. This task supplies the path and help; it
does not perform the deletion or gate run.

## Concerns

### Resolved

- **No settings gate:** renderer scripting is already ungated. `main.scripting.enabled` applies only
  to main-process execution; adding it here would break parity with `execute_script`.
- **No new execution machinery:** the implementation calls `scriptRunner.runWithCapture`, the same
  function reached by `handleExecuteScript`, so context creation, transpilation, globals, console
  capture, cleanup, and result conversion stay centralized.
- **No secret input:** the method accepts code plus the old page/language selectors only. It does not
  accept credentials, secrets, or an environment object.
- **Undefined/null discipline:** `strictNullChecks` is off in `tsconfig.json`, so review must enforce
  omission manually. Optional `pageId`/`language` are not placed into a result envelope when absent;
  `McpScriptResult`'s four required fields are always present. Do not add `{ key: undefined }` or
  use `null` for an absent optional value.
- **Call result handling:** the generic resolver and `toCallResult` already provide the correct
  JSON-text value block and optional hint block. No change to shared descriptor types, result
  shaping, image handling, or call routing is required.
- **Existing non-`Error` normalization is deliberate:** `ScriptRunner.ts:112-117` converts a
  caught non-`Error` value to an `Error` before `runWithCapture` checks `result instanceof Error`.
  This preserves `isError: true` for strings, plain objects, and rejected non-`Error` promises.
  It is shared with UI-mode execution and must remain unchanged; `errMessage` returns a string and
  would make those throws look like successful values. `ScriptNode` contains no catch and returns
  `runWithCapture`'s result unchanged.

### Explicit deviations to carry into QA and US-1349

1. `call` applies the resolver's 20,000-character default to nested result strings; the old tool's
   `toToolResult` did not. `maxLength` is the recovery path, but this is a real long-result deviation.
2. `call` can return `pending`/attention for a newly opened blocking dialog; `execute_script` waited
   for the bridge timeout instead. This is a call UX/protocol difference, not a change to the script
   runner or its result once complete.

## Acceptance Criteria

- [ ] `script` is discoverable at the renderer AiVision root and `script.execute` has a descriptor
  signature, summary, and arbitrary-code `caution`.
- [ ] `script.execute` has long-form `$help` naming `app`, `page`, `io`, and `ai`, and covering the
  renderer context, privileges, language, results, errors, side effects, console logs, timeout, and
  dialog waiting; it tells agents that long result text or console arguments may be cut at
  `maxLength` and that raising `call`'s `maxLength` returns the rest; it does not reference
  `read_guide`; `assets/mcp-res-scripting.md` is unchanged.
- [ ] The method reaches `scriptRunner.runWithCapture`, with the same active/explicit page selection,
  language behavior, context globals, console capture, cleanup, and four-field result shape as
  `execute_script`.
- [ ] `windowIndex` is fully replaced by `windows[i].script.execute(...)`; `routeCallPath` forwards
  `script` because it is not in `WINDOW_MEMBER_NAMES`, and the window-prefix case is covered by the
  US-1349 retirement evidence.
- [ ] The renderer path has no `main.scripting.enabled` restriction or new settings gate.
- [ ] `call` preserves `{ text, language, isError, consoleLogs }` and renders it as its value text
  block; any long-result and dialog-attention deviations above are documented and tested.
- [ ] No secrets are accepted as input, absent optional values are omitted, `ScriptNode` has no catch,
  and the existing `Error` normalization in `ScriptRunner` remains unchanged.
- [ ] Typecheck/lint and live parity checks pass, including a bare-`call` discovery scenario suitable
  for the EPIC-090 deletion ledger.
- [ ] `execute_script` remains present until US-1349; no tool deletion or dashboard edit is included.

## Files that need no changes

- [`src/shared/ai-vision/types.ts`](../../../src/shared/ai-vision/types.ts) — `IAiMember` already
  supports `caution`, and `IAiVisionDescriptor` already supports `members`, `help`, and
  `restricted`; no new descriptor field is needed.
- [`src/main/mcp/ai-vision/main-script.ts`](../../../src/main/mcp/ai-vision/main-script.ts) and
  [`main-script-gate.ts`](../../../src/main/mcp/ai-vision/main-script-gate.ts) — these remain the
  main-process sibling and gate; renderer scripting must not reuse their evaluator or restriction.
- [`src/main/mcp/tools/call-tools.ts`](../../../src/main/mcp/tools/call-tools.ts) — generic routing,
  `sendToRenderer`, `toCallResult`, image handling, and attention conversion already serve the new
  path.
- [`src/renderer/scripting/ScriptRunner.ts`](../../../src/renderer/scripting/ScriptRunner.ts) and
  [`src/shared/utils.ts`](../../../src/shared/utils.ts) — preserve the existing caught-value
  normalization to `Error`; do not substitute `errMessage`, which returns a string and would break
  `isError` detection.
- [`src/renderer/api/mcp/call-command.ts`](../../../src/renderer/api/mcp/call-command.ts) and
  [`src/renderer/scripting/ai-vision/call.ts`](../../../src/renderer/scripting/ai-vision/call.ts) —
  generic renderer call dispatch and context lifecycle need no path-specific branch.
- [`src/renderer/scripting/ai-vision/attention.ts`](../../../src/renderer/scripting/ai-vision/attention.ts) —
  the existing dialog watcher supplies the documented `pending` behavior.
- [`assets/mcp-res-scripting.md`](../../../assets/mcp-res-scripting.md) — US-1345 owns its prose
  retirement; this task only coordinates the content that must be represented by `$help`.
- `doc/active-work.md` and `doc/epics/EPIC-090.md` — the US-1344 dashboard/epic links already exist
  and the request explicitly excludes dashboard work.

## Files Changed summary

| File | Planned change |
|---|---|
| [`src/renderer/scripting/ai-vision/root.ts`](../../../src/renderer/scripting/ai-vision/root.ts) | Add the renderer `script` node with `kind: "Script"`, descriptor member/caution, `$help`, and `AiRoot` wiring; preserve the reserved name. |
| [`src/renderer/scripting/renderer-script-target.ts`](../../../src/renderer/scripting/renderer-script-target.ts) | Add the single shared page-selection/runner-editor adapter, including the one existing legacy-editor cast and disable comment. |
| [`src/renderer/api/mcp/page-commands.ts`](../../../src/renderer/api/mcp/page-commands.ts) | Make `handleExecuteScript` use the shared target adapter while preserving its current validation and result mapping. |
| [`src/renderer/scripting/ScriptRunner.ts`](../../../src/renderer/scripting/ScriptRunner.ts) | No change; preserve non-`Error` normalization so `runWithCapture` continues to report `isError: true`. |
| `doc/tasks/US-1344-script-execute/README.md` | This investigation and implementation plan. |
