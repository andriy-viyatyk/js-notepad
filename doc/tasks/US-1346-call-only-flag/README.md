# US-1346 — The `PERSEPHONE_MCP_CALL_ONLY` flag and the `waitForNavigation` documentation duty

Status: Implemented. Epic review is pending.

Epic: [EPIC-090](../../epics/EPIC-090.md)

The task is already linked under EPIC-090 in [`doc/active-work.md`](../../active-work.md). No
dashboard edit, implementation, unit test, or commit is part of this task-document pass.

## Goal

Add EPIC-090 decision 1's process-environment migration gate without restoring the deleted
`IMcpServerOptions { browserTools }` plumbing, and finish decision 9's documentation audit without
changing navigation behavior. The default manifest and all MCP resources must remain unchanged when
the flag is absent.

## Background

### Binding decisions

EPIC-090 decision 1 is authoritative: `createMcpServer()` reads
`process.env.PERSEPHONE_MCP_CALL_ONLY`; `1`, `true`, and `yes` (case-insensitive) enable a
call-only tool manifest, while unset, empty, `0`, `false`, and `no` leave it off. The default in
shipped builds is off. This is an environment variable, not a persisted setting, because it is a
temporary migration/QA gate rather than a user preference and because EPIC-089/US-1339 just removed
the misleading settings-shaped manifest switch.

EPIC-090 decision 9 is also settled: `BrowserEditorFacade.waitForNavigation()` remains a
document-load wait on the document present when it is called; `waitFor({ selector })` and
`waitFor({ text })` remain the navigation remedy, and the two-phase wait remains inside
`navigateAndWait()`/the `navigate()` command path.

### Current MCP factory and session lifecycle

[`src/main/mcp/server-factory.ts`](../../../src/main/mcp/server-factory.ts:18) currently creates a
server with this complete tool-group list at lines 23–31:

```ts
const groups = [
    callTools(ctx),
    windowTools(ctx),
    pageTools(ctx),
    boardTools(ctx),
    agentTools(ctx),
    browserTools(ctx),
    guideTools(ctx),
];
```

The same factory separately registers every `resourceFiles` entry at lines 37–50 and the combined
`persephone://guides/full` resource at lines 52–67. Those resource registrations are outside the
tool-group list and must run in both modes. The flag filters tool groups only; it must not remove,
condition, or rename focused guide resources or the full guide resource.

[`src/main/mcp-http-server.ts`](../../../src/main/mcp-http-server.ts:148) builds the server inside
`startSession()`: line 166 calls `createMcpServer()` and stores that instance with the new
transport in the session map. Therefore the environment is read for each newly constructed MCP
server, but all sessions in one Persephone process observe the same process environment. Changing
the variable requires restarting the Persephone process; an MCP client reconnect alone is not
enough if the process was not restarted. After the restart, the client must initialize a new MCP
session to receive the reduced or restored tool list.

### US-1339 compatibility constraint

Git commit [`2ef66803`](https://github.com/andriy-viyatyk/persephone/commit/2ef66803) removed
`IMcpServerOptions { browserTools }`, the conditional browser-group spread, the process-global
mirror, and the old startup/live plumbing. The current call site is already:

```ts
const mcpServer = createMcpServer();
```

The implementation must keep that no-argument call and must not resurrect the options interface or
any renderer/IPC/settings mirror. Decision 1 deliberately puts the new gate inside the factory so
one process-level environment value controls each newly created session without recreating the
settings plumbing US-1339 removed.

### User-facing documentation baseline

- [`docs/whats-new.md`](../../../docs/whats-new.md:9) has the current 5.0.0 breaking-change list.
  It already explains that `mcp.browser-tools.enabled` is gone and that a leftover old settings
  line is harmless, but it does not mention `PERSEPHONE_MCP_CALL_ONLY`. The new entry belongs under
  a new `### For agent integrations` subsection, after `### Breaking Changes` and before
  `### Bug Fixes`; it is not a breaking change because the flag is off in every shipped build and
  the default manifest remains unchanged.
- [`docs/mcp-setup.md`](../../../docs/mcp-setup.md:51) still has the current tool table and
  browser-automation setup section. It needs a short call-only section in this task's setup
  context, including the PowerShell launch example and the resource-preservation/restart facts.
- Current [`build/README.txt`](../../../build/README.txt:41) contains MCP setup instructions but no
  `mcp.browser-tools.enabled` reference and no call-only flag reference. Its unrelated
  `read_guide` instructions are outside this task.
- Current [`docs/api/settings.md`](../../../docs/api/settings.md:80) documents `mcp.enabled`,
  `mcp.port`, and `main.scripting.enabled`; it contains no `mcp.browser-tools.enabled` reference
  and therefore has no deleted setting text to replace with this flag. The flag is not a settings
  API key and must not be added to its settings table.

### `waitForNavigation` audit

The source-backed audit below distinguishes the four requested surfaces. The relevant wording is
quoted from the current files; unrelated help text is omitted where it does not discuss navigation.

The canonical source for the shared sentence is the existing
`BROWSER_EDITOR_MEMBERS.waitForNavigation` summary in
[`src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:57).
The implementer must copy this contract verbatim into the missing help/resource locations rather
than paraphrasing it:

> Wait for the document loaded RIGHT NOW to finish loading (`document.readyState === complete`). It is not a navigation detector: if the old document is still in place and already complete, it returns at once. After `pages.openUrlInBrowserTab(...)`, or for an SPA, prefer `waitFor({ selector })` or `waitFor({ text })`.

| Surface | What it says today | (a) Leads with `waitFor({ selector })` / `waitFor({ text })`? | (b) States the document-at-call-time/old-document limit? | Disposition |
|---|---|---:|---:|---|
| `BROWSER_EDITOR_MEMBERS` `waitForNavigation` summary in [`BrowserEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:57) | “Wait for the document loaded RIGHT NOW to finish loading (`document.readyState === complete`). It is not a navigation detector: if the old document is still in place and already complete, it returns at once. After `pages.openUrlInBrowserTab(...)`, or for an SPA, prefer `waitFor({ selector })` or `waitFor({ text })`.” | Yes | Yes | Already correct; retain its meaning and use it as the canonical wording. |
| `BROWSER_EDITOR_HELP` in [`BrowserEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:78) | It currently explains access through `pages[i].editor`, `elements`, `snapshot()`, refs, tabs, screenshots, transient controls, and `getValue()`/`evaluate()`. It contains no navigation guidance, no `waitFor(...)` recommendation, and no `waitForNavigation()` limitation. | No | No | Add the same canonical navigation contract once, without changing the facade behavior or creating a differently-worded competing explanation. |
| `WINDOW_SCREEN_HELP` in [`window-screen.ts`](../../../src/renderer/scripting/ai-vision/namespaces/window-screen.ts:6) | It says this is Persephone’s application window, not a browser page; “App navigation and browser tabs are absent because this target has neither; open and switch Persephone pages through `pages` and `pages.showPage(pageId)`.” Its shared members include `waitFor`, but the help does not discuss browser navigation or `waitForNavigation()`. | No; not applicable to this non-browser target | No; not applicable to this non-browser target | No edit needed. Its explicit no-browser-navigation boundary is correct. |
| [`assets/mcp-res-browser.md`](../../../assets/mcp-res-browser.md:15) | The browser examples already use `await pages[i].editor.waitFor({ selector: ... })` and `await pages[i].editor.waitFor({ text: ... })`; it says `pages.openUrlInBrowserTab` returns the page id before the document is ready and says to wait for expected content. Its navigation section currently says only that “Navigation, opener readiness, and the two-phase wait behavior are owned by the existing browser members; inspect `pages[i].editor.$help` and the `waitForNavigation` member summary before acting.” | Yes | No; it points to the member summary rather than stating the limit itself | Replace the vague pointer with the same explicit contract as the member summary. Do not change the examples or add a second differently-worded rule. |

The method implementation itself remains untouched: [`BrowserEditorFacade.waitForNavigation()`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:394)
checks `document.readyState` on the current CDP document and can resolve immediately when that
document is already complete. The two-phase implementation remains in
[`src/renderer/automation/operations.ts`](../../../src/renderer/automation/operations.ts:50), where
`navigateAndWait()` first waits for navigation to start and then waits for the new document. The
audit therefore plans help-text edits only where the requested statement is absent; it does not
unify or retime the two wait primitives.

## Implementation Plan

### 1. Add one factory-local environment parser and filter only tool groups

- In [`src/main/mcp/server-factory.ts`](../../../src/main/mcp/server-factory.ts), add one small
  module-local helper that accepts `string | undefined` and normalizes the value before checking the
  three accepted enabled spellings. Keep the accepted values in one comment beside the helper:
  `1`, `true`, and `yes`, case-insensitive; unset/empty and `0`/`false`/`no` are disabled. A
  specific name such as `isMcpCallOnlyEnabled(value)` is preferable to a generic inline expression;
  export it only if a later importer makes that necessary.
- Use the helper once with `process.env.PERSEPHONE_MCP_CALL_ONLY` when selecting the groups. Keep
  `createMcpServer()` parameterless and keep the default branch byte-for-byte equivalent in
  behavior to the current seven-group list.
- The intended shape is:

  ```ts
  // Before: every group is always selected.
  const groups = [
      callTools(ctx), windowTools(ctx), pageTools(ctx), boardTools(ctx),
      agentTools(ctx), browserTools(ctx), guideTools(ctx),
  ];
  ```

  ```ts
  // After: the environment gate changes the tool groups only.
  const groups = isMcpCallOnlyEnabled(process.env.PERSEPHONE_MCP_CALL_ONLY)
      ? [callTools(ctx)]
      : [
          callTools(ctx), windowTools(ctx), pageTools(ctx), boardTools(ctx),
          agentTools(ctx), browserTools(ctx), guideTools(ctx),
      ];
  ```

- Leave the two resource loops after the group registration exactly in place. In call-only mode,
  focused `persephone://guides/*` resources and `persephone://guides/full` must still be listed and
  readable; in default mode they must behave exactly as they do now.
- Do not change `src/main/mcp-http-server.ts`: its existing `startSession()` call remains
  `createMcpServer()` with no arguments. Verify the operational consequence in the handoff: a
  process restart with the environment set, followed by MCP client reconnect/initialization, is
  required to turn the flag on or off for a client.

### 2. Add the two required user-facing flag descriptions

- In [`docs/whats-new.md`](../../../docs/whats-new.md), add a new `### For agent integrations`
  subsection after `### Breaking Changes` and before `### Bug Fixes`. Add the flag entry there,
  matching the existing voice. It must name
  `PERSEPHONE_MCP_CALL_ONLY`, state that enabled mode registers only `call`, state that the flag is
  off by default and leaves guide resources available, list accepted enabled values and disabled
  values, and show how to set it before launch. Include the restart requirement without implying
  that reconnecting alone changes a running process.
- In [`docs/mcp-setup.md`](../../../docs/mcp-setup.md), add the same policy in the MCP setup
  context, near the client setup/tool discovery guidance. Include this PowerShell example:

  ```powershell
  $env:PERSEPHONE_MCP_CALL_ONLY = "1"
  npm start
  ```

  Explain that an installed build should be launched from a shell or shortcut carrying the same
  environment variable, that a process restart is required after changing it, and that a new MCP
  session then sees only `call` while the guide resources remain available.
- Do not rewrite the existing old-tool table or the unrelated stale `read_guide` setup prose here;
  those belong to the later EPIC-090 deletion task. Do not add the flag to `docs/api/settings.md`.

### 3. Reconcile only the missing `waitForNavigation` prose

- In `BROWSER_EDITOR_HELP`, copy the canonical three-sentence contract quoted above verbatim. The
  member summary is the source of truth; do not paraphrase it or create a second wording that can
  drift.
- In `assets/mcp-res-browser.md`, replace the current vague “inspect the member summary” sentence
  with the same canonical three-sentence contract verbatim. Preserve the existing selector/text
  examples and the `window.screen` guidance.
- Do not change `waitForNavigation()` implementation, `navigate()`, `navigateAndWait()`, browser
  timing, `WINDOW_SCREEN_HELP`, or any generated editor typings. This is documentation alignment,
  not a runtime behavior change.

### 4. Verify the boundaries without adding tests

- Verify the helper's enabled/disabled table by source review or a focused manual factory/session
  check; do not add unit tests. Confirm that unset is the shipped default and that arbitrary values
  are not accidentally treated as enabled.
- Verify default mode registers the current complete group list, call-only mode registers only
  `callTools(ctx)`, and both modes still register the focused resources and
  `persephone://guides/full`.
- Verify the factory has no options parameter and the session call remains parameterless. Document
  that existing sessions retain the manifest built at initialization and that changing the process
  environment requires a Persephone restart before reconnecting.
- Check the two user docs for the exact flag name, PowerShell command, accepted values, call-only
  behavior, resource preservation, and restart semantics.
- Re-read the four Part 2 surfaces and confirm the member summary and the two edited documentation
  surfaces use the same contract; confirm `window.screen` remains correctly classified as a
  non-browser target with no edit.

## Concerns / Open Questions

All implementation questions are resolved by EPIC-090 decisions 1 and 9.

1. **Process restart versus reconnect:** the server is constructed per MCP session, but the
   environment belongs to the Persephone process. A reconnect creates a new server only with the
   already-existing process environment; turning the flag on or off therefore requires restarting
   Persephone, then reconnecting the MCP client.
2. **Resources versus tools:** `guideTools(ctx)` is only a tool group. The `resourceFiles` loop and
   the full-guide callback are independent registrations and must survive call-only mode.
3. **Settings temptation:** decision 1 rejected a `mcp.call-only` setting because this is a
   migration gate, not a persistent preference, and EPIC-089 just removed the misleading
   `mcp.browser-tools.enabled` plumbing. Do not add a Settings row or a settings key.
4. **Part 2 scope:** the member summary is already correct; only the missing `BROWSER_EDITOR_HELP`
   and resource wording need alignment. `window.screen` correctly says it is not a browser page,
   so adding browser navigation guidance there would be misleading.
5. **Standing project constraints:** no hardcoded colors; if implementation happens to add a catch,
   use `errMessage` from `src/shared/utils.ts` for caught values; omit absent keys from `call`
   answers rather than returning `null`; never hand-edit `assets/editor-types/*.d.ts`; and add no
   unit tests for this task.

## Acceptance Criteria

- [x] `createMcpServer()` remains parameterless and reads `process.env.PERSEPHONE_MCP_CALL_ONLY`
      inside `src/main/mcp/server-factory.ts` through one module-local helper; export it only if a
      real importer is added.
- [x] The helper enables only for `1`, `true`, or `yes`, case-insensitive, and disables for unset,
      empty, `0`, `false`, and `no`; the accepted values are stated in one nearby comment.
- [x] With the flag enabled, only `callTools(ctx)` is registered as a tool group; with it disabled
      or unset, the existing complete group list is registered exactly as today.
- [x] Focused MCP resources and `persephone://guides/full` remain registered and readable in both
      modes; the flag does not filter resources.
- [x] `startSession()` still calls `createMcpServer()` with no arguments. Documentation accurately
      says a Persephone process restart is required to change the environment, followed by a new
      MCP client session to observe the new manifest.
- [x] `docs/whats-new.md` under `## Version 5.0.0 (Upcoming)` has a `### For agent integrations`
      subsection after Breaking Changes and before Bug Fixes; its entry names the flag, explains
      call-only behavior, gives setup guidance, and records defaults, accepted values, resource
      preservation, and restart semantics without presenting the flag as a breaking change.
- [x] `docs/mcp-setup.md` includes the same guidance and a PowerShell example.
- [x] The task records that current `build/README.txt` and `docs/api/settings.md` do not contain
      the deleted `mcp.browser-tools.enabled` reference and therefore receive no replacement edit.
- [x] `BROWSER_EDITOR_MEMBERS` remains the canonical correct contract; `BROWSER_EDITOR_HELP` and
      `assets/mcp-res-browser.md` state the same `waitFor({ selector })` / `waitFor({ text })`
      remedy and document the old-document limit. `WINDOW_SCREEN_HELP` remains unchanged.
- [x] `waitForNavigation()`, `navigate()`, and `navigateAndWait()` runtime behavior is unchanged;
      no second, differently-worded navigation explanation is introduced.
- [x] No renderer runtime/API, IPC, settings, Settings-editor, generated typing, color, call-result,
      or error-stringification changes are introduced; no unit tests are added.
- [x] `doc/active-work.md` and `doc/epics/EPIC-090.md` are left unchanged because the dashboard
      entry and epic linkage already exist.

## Files that need NO changes

- [`src/main/mcp-http-server.ts`](../../../src/main/mcp-http-server.ts) — keep `startSession()`'s
  existing parameterless `createMcpServer()` call; only its session/restart behavior is documented.
- `src/ipc/**` — no IPC setting or environment-variable bridge is needed.
- [`src/renderer/api/settings.ts`](../../../src/renderer/api/settings.ts) — there is no
  `mcp.call-only` settings key, default, comment, or persistence behavior.
- `src/renderer/editors/settings/**` — no Settings row, editor control, or change handler.
- `src/renderer/api/**` and other renderer runtime files — the flag is owned by the main-process
  factory; the only renderer-source documentation edit is the explicitly scoped `BROWSER_EDITOR_HELP`
  text in Part 2, with no renderer runtime change.
- [`src/renderer/scripting/ai-vision/namespaces/window-screen.ts`](../../../src/renderer/scripting/ai-vision/namespaces/window-screen.ts)
  — its app-window/non-browser boundary is already correct.
- [`src/renderer/automation/operations.ts`](../../../src/renderer/automation/operations.ts) —
  preserve the existing two-phase `navigateAndWait()` implementation.
- `assets/editor-types/*.d.ts` — generated files; never hand-edit.
- [`build/README.txt`](../../../build/README.txt) and [`docs/api/settings.md`](../../../docs/api/settings.md)
  — neither currently mentions the deleted `mcp.browser-tools.enabled` key, so neither needs a
  replacement mention of the environment flag.
- [`doc/active-work.md`](../../active-work.md) and [`doc/epics/EPIC-090.md`](../../epics/EPIC-090.md)
  — the existing dashboard and epic task link are sufficient.

## Files Changed Summary

| File | Planned change |
|---|---|
| [`src/main/mcp/server-factory.ts`](../../../src/main/mcp/server-factory.ts) | Keep one documented module-local truthiness helper; select only `callTools(ctx)` when the environment flag is enabled; leave all resource registration and the default group list behavior unchanged. |
| [`docs/whats-new.md`](../../../docs/whats-new.md) | Add the 5.0.0 Upcoming user-facing description of `PERSEPHONE_MCP_CALL_ONLY`, accepted values, setup, resource preservation, and restart semantics. |
| [`docs/mcp-setup.md`](../../../docs/mcp-setup.md) | Add call-only setup guidance and the PowerShell launch example without changing unrelated MCP tool/deletion documentation. |
| [`src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts) | Add the already-canonical navigation remedy/old-document limitation to `BROWSER_EDITOR_HELP` only; do not change `waitForNavigation()` or any runtime behavior. |
| [`assets/mcp-res-browser.md`](../../../assets/mcp-res-browser.md) | Replace the vague navigation-help pointer with the same explicit `waitForNavigation` contract; preserve existing examples and app-window guidance. |
