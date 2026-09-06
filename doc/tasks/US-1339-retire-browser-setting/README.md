# US-1339 — Delete `mcp.browser-tools.enabled`, its mirror, Settings row, and guide instructions

Status: Planned. Investigation complete; implementation has not started.

Epic: [EPIC-089](../../epics/EPIC-089.md)

No dashboard edit, implementation, unit test, test harness, QA-file change, or commit is part of
this task-document pass. The dashboard is maintained by the user.

## Goal

Remove the misleading `mcp.browser-tools.enabled` setting and every runtime/UI/documentation path
that treats it as the browser automation boundary. Keep the fourteen `browser_*` tools and
`open_url` themselves intact for EPIC-090, and leave the independent browser privacy guard intact.

## Background

### Binding decision and scope

EPIC-089 decision 7 is binding. The setting currently has two effects: the renderer rejects every
`browser_*` command while the value is false, and the main process omits the browser tool group
from `tools/list` for newly created MCP sessions. It does not gate `call` or `execute_script`.

The source audit confirms that the fourteen browser tools are the group in
[`src/main/mcp/tools/browser-tools.ts`](../../../src/main/mcp/tools/browser-tools.ts:8), while
`open_url` is a separate page tool and is outside this task. No browser tool implementation and no
`open_url` implementation needs to change.

The user-facing consequence must be explicit in the implementation handoff: until EPIC-090 removes
the tools, all fourteen `browser_*` tools appear in every *new* agent manifest when the MCP server
is running. Today they appear only for users who opted in. This increases manifest/context cost; it
does not grant a new privacy privilege because target resolution still enforces
`agent-access.ts`.

### Complete source inventory

The decision’s named sites were verified against the current tree. The current line numbers differ
from some epic notes because the automation handlers were moved into shared operations, but the
methods and behaviors are present:

| Area | Verified current source and behavior |
|---|---|
| Settings declaration | [`src/renderer/api/settings.ts`](../../../src/renderer/api/settings.ts:23) contains the `AppSettingsKey` union entry, the `settingsComments` help text, and the `defaultAppSettingsState` value `false`. |
| Renderer runtime gate | [`handleBrowserCommand`](../../../src/renderer/automation/commands.ts:181) reads the setting before `getTarget()`, so the false value rejects every `browser_*` command, including a direct HTTP command that never depended on `tools/list`. Removing this branch makes the fourteen dispatch cases unconditional. The import of `settings` then becomes unused and must be removed. |
| Main tool-list gate | [`createMcpServer`](../../../src/main/mcp/server-factory.ts:23) accepts `browserTools` and conditionally spreads `browserTools(ctx)`. The group must be registered unconditionally. |
| Startup/live mirror | [`App.initEvents`](../../../src/renderer/api/app.ts:273) reads the setting at startup and [`onChanged`](../../../src/renderer/api/app.ts:320) forwards changes to `api.setBrowserToolsEnabled`. Both branches must go. |
| Settings UI | [`McpSectionView`](../../../src/renderer/editors/settings/sections/McpSection.ts:93) constructs a dedicated browser checkbox row, tracks it, filters its setting changes, reads its prop, and updates it. [`McpSectionModel`](../../../src/renderer/editors/settings/sections/McpSectionModel.ts:7) owns the prop and toggle handler. All of those browser-specific pieces must go. |
| Settings catalog | [`src/renderer/scripting/ai-vision/namespaces/settings.ts`](../../../src/renderer/scripting/ai-vision/namespaces/settings.ts:80) advertises the key as a discoverable settings row; remove only that catalog entry. |
| IPC bridge | `Endpoint.setBrowserToolsEnabled`, its `MainApi` signature, renderer proxy, main controller/import, and endpoint binding are all present in [`src/ipc/api-types.ts`](../../../src/ipc/api-types.ts:68), [`src/ipc/renderer/api.ts`](../../../src/ipc/renderer/api.ts:237), and [`src/ipc/main/core-handlers.ts`](../../../src/ipc/main/core-handlers.ts:214). They are the complete mirror plumbing and must be removed together. |
| Guides and docs | The named `assets/mcp-res-browser.md`, `assets/mcp-res-ui.md`, `docs/api/settings.md`, and `docs/mcp-setup.md` occurrences were verified. The audit also found current instructions in `build/README.txt`, `assets/demo-board/index.html`, `docs/boards.md`, `docs/getting-started.md`, and stale developer statements in `doc/architecture/overview.md`, `doc/architecture/browser-editor.md`, and `doc/architecture/state-management.md`; the implementation plan covers each below. |

### Persisted settings: resolved behavior

This setting is not validated by a runtime schema. `AppSettingsKey` is a TypeScript union only, and
the string overload of `settings.get`/`settings.set` accepts arbitrary keys at runtime. In
[`Settings.loadSettings`](../../../src/renderer/api/settings.ts:262), `parseJSON5` returns a
`Record<string, unknown>` and the file object is currently merged as follows:

```ts
// Current
const newSettings = {
    ...defaultAppSettingsState.settings,
    ...content,
};
```

Therefore, on a valid existing settings file containing `"mcp.browser-tools.enabled": false` (or
`true`), the unknown key is accepted and copied into the live state. It does not warn, because
`parseJSON5` is called without an error callback; it does not throw; and it is not rejected by the
settings union. The key is inert after this task because no runtime consumer reads it. On a later
save, [`saveSettings`](../../../src/renderer/api/settings.ts:291) serializes the whole state, so
the unknown key remains in the file. It receives no generated comment because
`settingsComments` no longer has an entry for it; the user observes an inert JSON5 line without
the former explanatory comment above it. A malformed JSON5 file is a separate case:
`parseJSON5` catches the parse error and returns `undefined`, and `loadSettings` leaves the previous
state untouched; that behavior is not caused by this removed key.

No migration or general unknown-key sanitizer is added. The file is explicitly user-editable and
forward-compatible unknown keys must survive an older build, so silently rewriting unknown keys
would be more dangerous than leaving this one dead key in place.

### Connected MCP agents: resolved session behavior

[`startSession`](../../../src/main/mcp-http-server.ts:149) calls `createMcpServer` once and stores
that server in the per-session `sessions` map. `createMcpServer` registers its tool groups once;
there is no code that rebuilds or mutates existing servers when the mirror changes. The current
`setBrowserToolsEnabled` function only changes the process-global boolean used by a future
`startSession` call.

After the change:

- A session created before the change keeps exactly the tool registrations it received at
  initialization. If it was created while the old flag was false, it still does not list browser
  tools; if it was created while true, it still lists them.
- That session sees no immediate `tools/list` change. A reconnect/new MCP session is required to
  receive the now-unconditional group.
- Nothing in the existing session references the removed setting or new factory signature, so its
  transport/server remains valid and no exception is introduced. The renderer gate removal only
  affects a request that reaches `handleBrowserCommand`; it does not mutate the session’s SDK
  registration set.

This satisfies EPIC-089 abort criterion 4: deletion does not change what a connected agent sees
mid-session in a breaking way, so it stays in EPIC-089 rather than moving to EPIC-090.

### `call` and `execute_script` were never gated

The setting was not a complete browser privacy or capability switch:

- The MCP `call` route is [`handleCall`](../../../src/renderer/api/mcp/call-command.ts:7) →
  [`aiCall`](../../../src/renderer/scripting/ai-vision/call.ts:16) → `resolveCall(new AiRoot(...))`.
  `BrowserEditorFacade.aiVision` exposes the browser members, and its `snapshot()` calls the shared
  `snapshot()` operation while `click()` calls `clickElement()` directly
  ([`BrowserEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:154),
  [`BrowserEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:250)).
  This path never calls `handleBrowserCommand`.
- The MCP [`handleExecuteScript`](../../../src/renderer/api/mcp/page-commands.ts:99) route calls
  `scriptRunner.runWithCapture`. `ScriptRunner` creates a `ScriptContext`, whose `page` is a
  `PageWrapper` and whose `app` is an `AppWrapper`; the browser facade is therefore reachable
  through the normal script object model. This path also never calls `handleBrowserCommand`.

Consequently, with the setting false today, `call` and `execute_script` can already use browser
facade operations such as `snapshot()` and `click()`. Removing the setting corrects a misleading
and split control; it does not loosen those paths.

### Privacy boundary is independent and remains unchanged

The security-relevant browser-tool gate after this deletion is target privacy, not the removed
setting:

- [`agentMayAccessBrowserPage`](../../../src/renderer/editors/browser/agent-access.ts:18) allows
  normal pages and agent-opened private pages, but refuses user-opened incognito/Tor pages.
- Browser/board target resolution in [`getTarget`](../../../src/renderer/automation/commands.ts:75)
  calls that predicate before returning a browser target
  ([`commands.ts`](../../../src/renderer/automation/commands.ts:156)). The planned edit removes
  only the earlier settings check; it does not alter this call or `privateBrowserRefusal`.
- The explicit `pageId: "app"` branch checks whether the active browser page is incognito/Tor
  before returning `appTarget` ([`commands.ts`](../../../src/renderer/automation/commands.ts:84)).
  This separate check remains essential because an app-window snapshot includes the active page.
- The `call` object-model path independently applies the same guard through
  [`PageWrapper.aiRestricted`](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts:229),
  which calls `agentMayAccessBrowserPage` and `privateBrowserRefusal`
  ([`PageWrapper.ts`](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts:240)).

No change is planned in `agent-access.ts`, `getTarget`’s privacy checks, `PageWrapper.aiRestricted`,
or the app-target branch. `execute_script` remains the existing trusted full-application API and
is intentionally not covered by this browser-page `call` restriction; deleting this setting does
not change that established trust model.

### Settings layout after the row is removed

The MCP section currently appends, in order: the MCP server checkbox row, the browser interaction
checkbox row, the main-process scripting checkbox/warning, the MCP port row, status, then the
Mneme section and configuration. There is no restart sentence in `McpSection.ts`; the only
browser-row-specific UI behavior is the row itself, its disabled-while-MCP-enabled update, and its
setting-change filter.

After the edit, the section is exactly:

1. MCP Server heading and description;
2. `Enable MCP server` row;
3. `Allow main-process scripts` row and its existing main-process warning;
4. `Port` row and the unchanged MCP status/configuration;
5. the unchanged Mneme section and client configuration.

The `browserToolsCheckbox` field, `browserRow`, browser prop, toggle handler, browser-specific
change-filter clause, and browser update/cleanup code all disappear. No adjacent text needs to be
reworded inside the view; stale restart/gating prose elsewhere is handled in the documentation
plan below.

## Implementation Plan

### 1. Remove the setting and leave persisted unknown keys untouched

- In [`src/renderer/api/settings.ts`](../../../src/renderer/api/settings.ts), remove
  `"mcp.browser-tools.enabled"` from `AppSettingsKey`, remove its `settingsComments` entry, and
  remove its `false` default.
- Leave `Settings.loadSettings`’s `{ ...defaultAppSettingsState.settings, ...content }` merge
  unchanged. An installation containing the old key loads normally, emits no error, and keeps the
  inert key in state; `saveSettings` writes it back without regenerating its former comment.
- Do not add a migration, warning, throw, or unknown-key sanitizer. The settings file is user
  editable and the existing merge deliberately preserves keys that may belong to a newer build.
  Keep malformed-file handling unchanged.

Before → after core merge:

```ts
// Before and after: the load/save persistence behavior is intentionally unchanged
const newSettings = { ...defaultAppSettingsState.settings, ...content };
```

### 2. Remove both runtime gates and the main-process mirror

- In [`src/renderer/automation/commands.ts`](../../../src/renderer/automation/commands.ts), remove
  the `settings` import and the first `if (!settings.get(...))` return from
  `handleBrowserCommand`. The function must begin by resolving the target, retaining
  `getTarget`, `ensureTargetReady`, all fourteen cases, and their error conversion unchanged.
- In [`src/main/mcp/server-factory.ts`](../../../src/main/mcp/server-factory.ts), remove
  `IMcpServerOptions` and make `createMcpServer()` take no option. Replace the conditional browser
  group spread with `browserTools(ctx)` in the fixed group list. Keep group order and every tool
  definition unchanged.
- In [`src/main/mcp-http-server.ts`](../../../src/main/mcp-http-server.ts), remove the
  `browserToolsEnabled` variable, pass no options to `createMcpServer`, and remove the exported
  `setBrowserToolsEnabled` function. Leave session creation, transport lifecycle, and status
  broadcasting unchanged.

Before → after runtime shape:

```ts
// Before
if (!settings.get("mcp.browser-tools.enabled")) return disabledResponse;
const mcpServer = createMcpServer({ browserTools: browserToolsEnabled });

// After
const target = await getTarget(params);
const mcpServer = createMcpServer();
```

The actual after-code must retain the existing `isErrorResponse(target)` return and readiness call
between those lines; the snippet shows only the removed gate/factory option.

### 3. Remove startup/live actuation and IPC plumbing

- In [`src/renderer/api/app.ts`](../../../src/renderer/api/app.ts), delete the startup read and
  `api.setBrowserToolsEnabled(!!browserToolsEnabled)` call. Delete only the matching
  `onChanged` branch; keep `mcp.enabled`, `main.scripting.enabled`, and Mneme subscriptions.
- In [`src/ipc/api-types.ts`](../../../src/ipc/api-types.ts), remove the enum member and the
  `MainApi` endpoint signature for `setBrowserToolsEnabled`.
- In [`src/ipc/renderer/api.ts`](../../../src/ipc/renderer/api.ts), remove the renderer proxy
  method that calls `executeOnce(Endpoint.setBrowserToolsEnabled, ...)`.
- In [`src/ipc/main/core-handlers.ts`](../../../src/ipc/main/core-handlers.ts), remove the
  controller method, its dynamic import of the main setter, and its `bindEndpoint` registration.
- Re-run the repository search after the edit. There must be no runtime/source setting read/write,
  mirror, endpoint, or browser command gate left; the old key may remain only in persisted user
  files and historical documentation that this plan explicitly leaves untouched.

### 4. Remove the Settings row and catalog entry

- In [`McpSectionModel.ts`](../../../src/renderer/editors/settings/sections/McpSectionModel.ts),
  remove `browserToolsEnabled` from `McpSectionProps` and remove
  `handleBrowserToolsToggle`. Do not disturb the model’s status subscriptions or the remaining
  MCP/main-script/Mneme handlers.
- In [`McpSection.ts`](../../../src/renderer/editors/settings/sections/McpSection.ts), remove the
  browser checkbox field and construction block, disposal reset, `currentProps` field, browser
  setting from the `onChanged` filter, and browser checkbox update. The MCP server row must now be
  followed directly by the main-process scripting row.
- In [`src/renderer/scripting/ai-vision/namespaces/settings.ts`](../../../src/renderer/scripting/ai-vision/namespaces/settings.ts), remove the single catalog row for the key. Keep the MCP server, port, main-process scripting, Mneme, and Mneme port rows in their existing order.

Before → after view sequence:

```ts
// Before
this.root.append(mcpRow);
this.root.append(browserRow);
this.root.append(mainScriptsRow);

// After
this.root.append(mcpRow);
this.root.append(mainScriptsRow);
```

### 5. Remove only enablement instructions from resources and current docs

Preserve the browser guide’s targeting, snapshot, ref, privacy, error, and tool content for
US-1340; this task removes only instructions that tell a user to enable the retired setting:

- [`assets/mcp-res-browser.md`](../../../assets/mcp-res-browser.md:10): delete the enablement
  preamble and its disabled-error guidance at the error table row formerly at `:149`. Leave the
  following targeting section as the guide’s opening content.
- [`assets/mcp-res-ui.md`](../../../assets/mcp-res-ui.md:214): delete the settings-table row for
  `mcp.browser-tools.enabled` and the adjacent “Do not enable” paragraph at `:223`. Keep the
  general settings-file instructions, `mcp.enabled`, port, Git, Mneme, theme, and privacy guidance.
- [`docs/api/settings.md`](../../../docs/api/settings.md:68): remove the retired key from the MCP
  settings category list; at `:87`, remove its setting table row only.
- [`docs/mcp-setup.md`](../../../docs/mcp-setup.md:104): replace the “disabled by default/enable
  browser interaction” note with this one accurate boundary sentence: **“Browser automation is
  available whenever the MCP server is running; the independent privacy guard below refuses
  user-opened incognito and Tor pages.”** At `:150`, remove the claim that app-window automation is
  gated by the retired setting; at `:251`, remove the retired settings-table row. This is the one
  current user-facing statement of the boundary after the settings rows disappear. Leave the
  fourteen tool descriptions, detailed privacy guard, app-window behavior, and remaining settings
  intact. US-1340 may rewrite the agent-facing browser guide, but must coordinate with this
  sentence rather than create a contradictory second policy statement.
- [`build/README.txt`](../../../build/README.txt:55): remove the optional legacy-key instruction.
  Keep the `mcp.enabled` setup, MCP client configuration, and the general reconnect-after-client
  configuration instruction.
- [`assets/demo-board/index.html`](../../../assets/demo-board/index.html:352): remove the checkbox
  bullet that says browser interaction is required, and rewrite the following reconnect sentence
  so it is not conditional on enabling browser interaction. Keep the board-debugging workflow and
  the MCP-server checkbox/port instructions.
- [`docs/boards.md`](../../../docs/boards.md:697): remove the parenthetical requirement to enable
  browser interaction in MCP settings from the board-testing step.
- [`docs/getting-started.md`](../../../docs/getting-started.md:106): remove “browser tools” from
  the examples of settings that start/stop a service when the settings file changes; MCP server
  and Mneme remain valid examples.

The resulting current guidance must say that browser tools are available when the MCP server is
available and must retain the separate privacy statement. The exact user-facing sentence lives in
`docs/mcp-setup.md`; do not duplicate it in `docs/api/settings.md` or add a second policy sentence
to this task’s enablement-only edits. Do not rewrite the rest of the browser guide or board guide
in this task; US-1340 owns the broader guide/QA pass and should preserve/coordinate the same
boundary when it rewrites `assets/mcp-res-browser.md`.

### 6. Correct stale developer architecture statements

- In [`doc/architecture/overview.md`](../../architecture/overview.md:209), remove the claim that
  app-window automation is behind `mcp.browser-tools.enabled`; retain the explicit-only app target,
  no-registration, and calling-window target facts.
- In [`doc/architecture/browser-editor.md`](../../architecture/browser-editor.md:831), replace the
  “Browser tools toggle” paragraph with the unconditional new-session behavior and the unchanged
  `agent-access.ts` privacy boundary. At `:859`, remove the claim that the app target sits behind
  the retired setting; retain the statement that `execute_script` is a separate trusted API.
- In [`doc/architecture/state-management.md`](../../architecture/state-management.md:473), remove
  the retired key from the list of settings actuated by `settings.onChanged`; MCP, Mneme, and
  script-library behavior remain documented.

### 7. Verify boundaries and non-goals without adding tests

- Verify by source search that `browser-tools.ts`, `open_url`, `agent-access.ts`, automation
  operation bodies, and all fourteen `browser_*` registrations/dispatch cases were not changed.
- Verify the old persisted key loads without warning or throw, remains inert in state, and is
  re-serialized on save without its former generated comment; unrelated unknown settings remain
  preserved. No migration or sanitizer is added.
- Verify that a pre-existing MCP session retains its original tool registration set and that a new
  session receives all fourteen browser tools without a boolean option.
- Verify that `handleBrowserCommand` no longer has the setting gate but still resolves targets and
  applies both browser-page and app-window privacy checks.
- Do not create unit tests, test harnesses, QA files, or browser-tool implementations in this task.

## Concerns / Open questions

All investigation questions are resolved; no TBDs remain.

1. **Legacy settings:** resolved in favor of leaving the key alone. The current spread/serialize
   implementation accepts the old key without warning or throw, no runtime reader remains, and the
   only visible effect is an inert line without its former generated comment. A migration would be
   permanent code for a cosmetic one-time cleanup and could establish the wrong precedent of
   deleting user/newer-build keys; therefore no migration or sanitizer is added.
2. **Connected agents:** resolved by the per-session `McpServer` construction. Existing sessions do
   not receive an immediate manifest change and do not throw; reconnect is required for the new
   unconditional group. EPIC-089 abort criterion 4 is not met.
3. **Privacy:** resolved by the unchanged `agent-access.ts` predicate and its independent calls in
   browser target resolution, app-target resolution, and the `call` page restriction. Removing the
   setting cannot weaken those checks. The one user-facing replacement sentence is owned by
   `docs/mcp-setup.md`; US-1340 coordinates the agent-facing guide rewrite without duplicating or
   contradicting that boundary.
4. **Settings layout:** resolved by the exact post-removal sequence in Background. No adjacent
   `McpSection` text refers to restarting or enabling browser interaction; stale documentation
   statements are listed in step 5/6.
5. **Scope:** deleting the fourteen tools and `open_url` remains EPIC-090. Rewriting the browser
   guide’s non-enablement content and adding QA coverage remains US-1340. Dashboard changes remain
   with the user.

## Acceptance Criteria

- [ ] `AppSettingsKey`, generated settings comments, and defaults no longer define
      `mcp.browser-tools.enabled`; the unchanged load path accepts the legacy key without
      warning/throwing, keeps it inert, and a later save re-serializes it without its former
      generated comment or dropping unrelated unknown keys. No migration/sanitizer is added.
- [ ] `handleBrowserCommand` has no setting check, and all fourteen existing `browser_*` command
      cases remain operational through the same target/privacy/operation code.
- [ ] `createMcpServer()` registers `browserTools(ctx)` unconditionally for new sessions; the
      boolean factory option, global mirror, startup/live actuation, and all IPC plumbing are gone.
- [ ] A connected session created before the change keeps its pre-change manifest until reconnect,
      and remains valid; a new session lists all fourteen browser tools.
- [ ] `call` and `execute_script` continue to reach browser facade `snapshot()`/`click()` without
      the retired setting, and this is documented as a correction rather than a new capability.
- [ ] `agent-access.ts`, browser target privacy refusal, app-target private-page refusal, and
      `PageWrapper.aiRestricted` remain unchanged and independently enforce privacy.
- [ ] The Settings MCP section has no browser row/prop/handler/filter/update and retains the exact
      remaining layout; the AiVision settings catalog has no retired row.
- [ ] All current enablement instructions are removed from the eight resource/user-doc surfaces
      and the three developer architecture docs listed in the plan, while historical changelog
      entries and unrelated browser-guide content remain untouched.
- [ ] No browser tool, `open_url`, `qa/` file, unit test, or test harness is deleted or modified.
- [ ] No TBDs remain, no commit is created, and the dashboard is left for the user.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/api/settings.ts` | Remove the setting type/help/default; leave the existing unknown-key load/save behavior unchanged. |
| `src/renderer/automation/commands.ts` | Remove the renderer setting gate and unused settings import; retain target/privacy checks and dispatch. |
| `src/main/mcp/server-factory.ts` | Remove the boolean options contract; always register the browser tool group. |
| `src/main/mcp-http-server.ts` | Remove the global mirror/setter and call the unconditional factory. |
| `src/renderer/api/app.ts` | Remove startup and live mirror actuation. |
| `src/ipc/api-types.ts` | Remove the endpoint enum member and typed endpoint signature. |
| `src/ipc/renderer/api.ts` | Remove the renderer IPC proxy. |
| `src/ipc/main/core-handlers.ts` | Remove the main IPC controller and binding. |
| `src/renderer/editors/settings/sections/McpSection.ts` | Remove the browser checkbox row and all view wiring; retain remaining layout. |
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | Remove the browser prop and toggle handler. |
| `src/renderer/scripting/ai-vision/namespaces/settings.ts` | Remove the retired catalog entry. |
| `assets/mcp-res-browser.md` | Remove only enablement preamble and disabled-error guidance. |
| `assets/mcp-res-ui.md` | Remove the retired settings row and “do not enable” instruction. |
| `docs/api/settings.md` | Remove the key from the category and settings table. |
| `docs/mcp-setup.md` | Replace the obsolete gate note with one accurate privacy-boundary sentence; remove the other two retired-setting references. |
| `build/README.txt` | Remove the optional legacy-key setup instruction. |
| `assets/demo-board/index.html` | Remove the browser-enable checkbox/reconnect instructions from the demo workflow. |
| `docs/boards.md` | Remove the obsolete browser-interaction setting requirement. |
| `docs/getting-started.md` | Remove browser tools from the live-setting actuation examples. |
| `doc/architecture/overview.md` | Remove the obsolete app-window setting gate statement. |
| `doc/architecture/browser-editor.md` | Document unconditional registration and remove setting-gate claims. |
| `doc/architecture/state-management.md` | Remove the retired key from the settings-actuation list. |

## Files that need NO changes

- `src/main/mcp/tools/browser-tools.ts` and all fourteen browser tool definitions.
- `src/main/mcp/tools/page-tools.ts` and the `open_url` implementation (EPIC-090 scope).
- `src/renderer/automation/operations.ts`, `input.ts`, `snapshot.ts`, `ref.ts`, target models, and
  CDP routing; their behavior is reused and not gated by the setting after the edit.
- `src/renderer/editors/browser/agent-access.ts`; it is the independent privacy boundary and must
  remain untouched.
- `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts`, `PageWrapper.ts`,
  `src/renderer/scripting/ai-vision/call.ts`, and `src/renderer/api/mcp/page-commands.ts`; their
  existing `call`/`execute_script` paths are evidence for this task, not implementation targets.
- `src/renderer/api/types/settings.d.ts` and generated editor-type files; the removed key is not
  declared there, and no generated type copy needs hand-editing.
- `assets/mcp-res-overview.md` and the non-enablement content of the browser/UI/boards guides.
- `assets/board-template/CLAUDE.md`; its browser automation section does not instruct users to
  enable the retired setting.
- `docs/whats-new.md`; entries describing the historical introduction and previous live-setting
  behavior are changelog history and must not be rewritten as if the old release never existed.
- `doc/agent-transparency-roadmap.md`, `doc/active-work.md`, and `doc/epics/EPIC-089.md`; the epic
  already links US-1339, and roadmap/dashboard/epic completion bookkeeping is owned by the user or
  the epic closeout, not this implementation task.
- `qa/` and all existing task documents; no QA or neighboring task content is in scope.


## Live verification (2026-09-06)

`call path: "settings[\"mcp.browser-tools.enabled\"]"` now answers
*No item "mcp.browser-tools.enabled" in "settings"* — the key is gone from the live catalog, not
merely from the type union. The MCP server re-registered with the browser tool group unconditional,
which is the intended outcome and matches the Q2 finding: a session created before the change keeps
the manifest it was given and sees the group only after reconnecting.

A leftover `"mcp.browser-tools.enabled": false` line in an existing user's `appSettings.json` is
left in place deliberately. `loadSettings` spreads the file over the defaults with no schema
validation, no unknown-key warning and no throw, and `saveSettings` re-serialises whatever is in
state — so the key is read into state, read by nobody, and written back. The only observable
difference is that its comment block stops being regenerated, because `settingsComments` no longer
has an entry for it. No migration is added: a targeted one would be a permanent guard for a
one-time cosmetic issue, and a general unknown-key sanitizer would be worse than harmless in a file
the user is invited to edit by hand.
