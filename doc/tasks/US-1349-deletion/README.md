# US-1349: Delete the retired MCP tools and rewrite the manifest

**Status:** Implemented  
**Epic:** [EPIC-090 — Consolidation](../../epics/EPIC-090.md)  
**Gate:** [EPIC-090 deletion gate](../../../qa/runs/2026-09-06-epic-090-deletion-gate.md) — passed; deletion is authorised  
**Scope:** planning only; this document does not implement the deletion.

## Goal

Remove exactly the 32 retired MCP tools, their obsolete routing code, the standalone app-window
highlight recipe, and the superseded per-tool QA files. Leave the live call surface, the still-
unproven execute_tool, every guide resource, and the renderer automation/facade replacements
intact, then make the manifest instructions describe the call-only world accurately and briefly.

## Background

### Authoritative decision and verified counts

EPIC-090 decision 4 says that only the read_guide tool is removed: the twelve focused resources,
persephone://guides/full, resourceFiles, readGuideFile, and its mtime cache remain. Decision 8
and the deletion gate authorise all rows below. execute_tool is deliberately outside the gate and
is kept because its replacement has not passed the required human-run real-tool check.

The source count was checked before planning from the name entries in the seven main tool files:

| Source file | Source-defined tools | Delete | Keep | Exact deleted names |
|---|---:|---:|---:|---|
| src/main/mcp/tools/page-tools.ts | 9 | 9 | 0 | execute_script, list_pages, get_active_page, get_app_info, get_page_content, set_page_content, open_url, create_page, ui_push |
| src/main/mcp/tools/window-tools.ts | 2 | 2 | 0 | list_windows, open_window |
| src/main/mcp/tools/board-tools.ts | 3 | 3 | 0 | create_board, open_board, board_refresh |
| src/main/mcp/tools/browser-tools.ts | 14 | 14 | 0 | all 14: browser_navigate, browser_snapshot, browser_click, browser_hover, browser_type, browser_select_option, browser_press_key, browser_evaluate, browser_tabs, browser_navigate_back, browser_wait_for, browser_take_screenshot, browser_network_requests, browser_close |
| src/main/mcp/tools/guide-tools.ts | 1 | 1 | 0 | read_guide |
| src/main/mcp/tools/agent-tools.ts | 4 | 3 | 1 | delete create_toolset, refresh_toolset, search_tools; keep execute_tool |
| src/main/mcp/tools/call-tools.ts | 1 | 0 | 1 | keep call |
| **Total** | **34** | **32** | **2** | kept: call, execute_tool |

After the deletion, createMcpServer() must expose exactly 2 tools with
PERSEPHONE_MCP_CALL_ONLY unset/false (call, execute_tool) and exactly 1 tool with the flag enabled
(call). The gate already verified that all 13 resources (12 focused resources plus
persephone://guides/full) remain visible in flag-on mode.

### Current manifest instructions and required rewrite

SERVER_INSTRUCTIONS in src/main/mcp/manifest.ts:21-74 currently occupies 54 source lines and
52 string entries. Its live instructions are wrong after the deletion:

- line 27 sends a new agent to read_guide("overview");
- line 29 presents read_guide as the guide mechanism;
- line 37 says ui_push;
- lines 40, 43, and 46 say create_page;
- line 49 says execute_script;
- line 52 says open_url;
- line 55 gates scripting on read_guide("scripting") and execute_script;
- line 58 says create_board, open_board, and read_guide("boards");
- line 61 says read_guide("ui"), read_guide("ui-editors"), and app.ui.highlightElement;
- line 64 says search_tools, execute_tool, and read_guide("tools");
- lines 66-73 describe the entire browser_* tool family and old page-tool fallbacks.

This matches the line-by-line inventory in US-1345 and the gate finding that Codex tried
read_guide as a path because the instructions told it to. The rewrite should target roughly
20–25 short source lines rather than 54, with no task → tool → guide routing table. Its first
action must be the same as the live call description: call with no path. The intended shape is:

~~~ts
// Before: old tool routing consumes 54 source lines and names deleted tools.
"New to Persephone? read_guide(overview) ...",
"Use ui_push ...",
"Use create_page ...",
"Use open_url ...",
"Use execute_script ...",
"## Browser automation (browser_* tools)",
~~~

~~~ts
// After: short call-first orientation; exact wording may be tightened during implementation.
"Start with call and no path to see the overview; follow its hints and node $help.",
"Use pages.logView.push(...) for output, rich results, and questions.",
"Create pages with pages.addEditorPage(...); assign pages[i].content to update text.",
"Open a web URL with pages.openUrlInBrowserTab(...), then use pages[i].editor.*.",
"Use window.screen.* for Persephone's own window and pages[i].editor.* for browser or board pages.",
"Run renderer code with script.execute(code); use main.script.execute(code) only when enabled.",
"For editor choices use persephone://guides/pages and persephone://guides/ui-editors; for notebook, links, or graph JSON use their format resources.",
"For boards use boards.* and read persephone://guides/boards when authoring or reviewing one.",
"For Agent Tools, find registered tools with tools.search() and run one with execute_tool; tools.execute(id, args) is the same operation as a path and remains when the manifest is reduced to call alone.",
~~~

The final wording must not imply that execute_tool was deleted, must not tell an agent to call a
guide, and should use resource URIs only for documents that genuinely help: the page/editor catalog,
the notebook/links/graph JSON formats, the boards authoring guide, and any other format reference
shown by the verified call help. Scripting, browser, Log View, UI, and tools routing should come
from the live $help paths rather than a manifest routing table.

### Resources are independent of the deleted guide tool

src/main/mcp/server-factory.ts imports resourceFiles and independently registers each focused
resource and persephone://guides/full. Its callbacks call readGuideFile; the mtime cache in
src/main/mcp/manifest.ts:162-176 is used by those callbacks. The read_guide handler is the only
consumer that disappears. The resource records' descriptions and comments still contain stale
tool-oriented language and should be rewritten, but no resource registration, asset, URI, callback,
or cache may be removed.

### Main-process imports and registration

The grep for pageTools, windowTools, boardTools, browserTools, guideTools, and agentTools found
imports and calls for the retired groups only in src/main/mcp/server-factory.ts. Nothing outside
that file imports the deleted tool modules. The implementation can therefore remove the five whole
retired modules and their factory imports/groups, while editing agent-tools.ts down to one
execute_tool definition.

src/main/mcp/tools/params.ts currently carries browserPageId and browserProfile schemas used only
by browserTools; remove those dead context fields and update the remaining windowIndex description
to say windows[i].open() rather than the deleted list_windows/open_window tools.
src/main/mcp/renderer-bridge.ts:41-43 has the same stale closed-window error and should point to
windows[i].open().

### Renderer-side reachability findings

The old tool methods arrive through the generic MCP_EXECUTE/MCP_RESULT IPC pair. That pair is
still required by call and execute_tool; there are no per-tool IPC channels to remove.
board_call is an internal Board MessagePort command and remains required by src/main/board-bridge.ts.

The old command-registry entries are orphaned once their main tool definitions disappear. The
registry should retain only call, execute_tool, and internal board_call among its built-in entries,
and stop dispatching unadvertised browser_* methods. The automation implementation is not deleted:
src/renderer/automation/** and all scripting facades are explicitly retained as the replacement path.

The following grep results prove which old handlers are safe to remove. Each result includes only
the defining file and the old registry reference; there is no caller through call:

~~~text
rg -n 'handle(ExecuteScript|GetPages|GetPageContent|GetActivePage|CreatePage|SetPageContent|AppInfo|OpenUrl)' src/renderer --glob '*.ts'
  src/renderer/api/mcp/page-commands.ts  # definitions
  src/renderer/api/mcp/command-registry.ts  # old imports and map entries only

rg -n 'handle(CreateBoard|OpenBoard|BoardRefresh)' src/renderer --glob '*.ts'
  src/renderer/api/mcp/board-commands.ts  # definitions
  src/renderer/api/mcp/command-registry.ts  # old imports and map entries only

rg -n 'handleUiPush' src/renderer --glob '*.ts'
  src/renderer/api/mcp/ui-push.ts  # definition
  src/renderer/api/mcp/command-registry.ts  # old import and map entry only
~~~

Therefore the planned renderer deletions are src/renderer/api/mcp/page-commands.ts,
src/renderer/api/mcp/board-commands.ts, and src/renderer/api/mcp/ui-push.ts, followed by the
registry import/union/map cleanup. McpPageInfo, McpActivePage, and McpAppInfo in
src/renderer/api/mcp/types.ts are referenced only by page-commands.ts and can be removed while
retaining McpResponse, McpParams, and McpCommandHandler.

The shared-handler grep is the safety boundary:

~~~text
rg -n 'handleSearchTools|handleRefreshToolset|handleCreateToolset|handleExecuteTool' src/renderer --glob '*.ts'
  command-registry.ts: old MCP entries
  namespaces/tools.ts: live tools.search(), tools.toolsets.refresh(), tools.createToolset()
  tool-commands.ts: definitions
~~~

Keep handleSearchTools, handleRefreshToolset, and handleCreateToolset in
src/renderer/api/mcp/tool-commands.ts because the AiVision tools node calls them. Keep
handleExecuteTool because the execute_tool MCP tool remains. Update their user-facing fallback
strings from search_tools/create_toolset to the corresponding tools.* call paths where the message
describes the live replacement.

The result-helper grep is also conclusive:

~~~text
toToolResult       -> register-tools.ts and call-tools.ts          KEEP
toPageContentResult -> page-tools.ts only                          REMOVE
toImageResult      -> browser-tools.ts only                        REMOVE
registerTools      -> server-factory.ts                            KEEP
passThrough        -> register-tools.ts, used by execute_tool      KEEP
~~~

call does not use toPageContentResult; it shapes general image payloads in its own handler.
toPageContentResult and toImageResult become dead after the retired groups are removed, but
tool-results.ts itself survives for toToolResult.

The UI validation and Log View foundations are shared, not dead: ui-push-validation.ts is used by
LogViewEditorFacade, and log-view-access.ts is used by ScriptContext and PageCollectionWrapper.
Delete only the old handleUiPush adapter.

### Old full-manifest QA skill recommendation

.claude/skills/mcp-test-agent/SKILL.md is the non-call variant. Its allowed-tools line still
advertises the retired page, window, browser, guide, script, and UI tools, so it no longer models
the shipped manifest after this task. The active EPIC-090 gate uses mcp-test-agent-call; the old
skill is referenced only by historical planning/run material and the six per-tool files being
removed. Recommendation: retire/delete the non-call skill, or explicitly archive it as a historical
pre-consolidation harness in a follow-up decision. Do not silently rewrite or delete it in US-1349;
the requested task scope is to record this recommendation, not assume the user's choice.

## Implementation Plan

### 1. Remove the retired main-process tool groups

- [ ] Delete these five whole files because every tool in each file is retired and the import grep
      shows no consumer outside server-factory.ts: src/main/mcp/tools/page-tools.ts,
      src/main/mcp/tools/window-tools.ts, src/main/mcp/tools/board-tools.ts,
      src/main/mcp/tools/browser-tools.ts, and src/main/mcp/tools/guide-tools.ts.
- [ ] Edit src/main/mcp/tools/agent-tools.ts so its returned array contains only execute_tool.
      Its description and toolId schema must refer to call paths (tools.search,
      tools.toolsets.refresh, tools.execute) and must not mention read_guide.
- [ ] Edit src/main/mcp/server-factory.ts: remove the five imports and default groups, leaving
      [callTools(ctx), agentTools(ctx)] when the flag is off and [callTools(ctx)] when it is on.
      Keep registerTools, focused resource registration, and persephone://guides/full unchanged.
- [ ] Edit src/main/mcp/tools/params.ts and src/main/mcp/renderer-bridge.ts as described above.
- [ ] Update the stale generic-count comment in src/main/mcp/types.ts without changing the
      IMcpToolDef contract used by call and execute_tool.

Before → after for the factory:

~~~ts
// Before
const groups = isMcpCallOnlyEnabled(process.env.PERSEPHONE_MCP_CALL_ONLY)
    ? [callTools(ctx)]
    : [callTools(ctx), windowTools(ctx), pageTools(ctx), boardTools(ctx), agentTools(ctx), browserTools(ctx), guideTools(ctx)];

// After
const groups = isMcpCallOnlyEnabled(process.env.PERSEPHONE_MCP_CALL_ONLY)
    ? [callTools(ctx)]
    : [callTools(ctx), agentTools(ctx)];
~~~

### 2. Rewrite the manifest and resource metadata

- [ ] Rewrite SERVER_INSTRUCTIONS in src/main/mcp/manifest.ts to the short call-first form above.
      The first workflow sentence must say call with no path. Use the exact live paths
      pages.addEditorPage, pages.logView.push, pages.openUrlInBrowserTab, script.execute,
      tools.search, pages[i].editor.*, window.screen.*, and boards.*.
- [ ] Point only genuine reference needs at resource URIs such as
      persephone://guides/notebook, persephone://guides/links, persephone://guides/graph,
      persephone://guides/boards, and persephone://guides/ui-editors; never present a guide as a
      callable tool.
- [ ] Update the resourceFiles descriptions and comments in manifest.ts so they describe resources
      and call paths, not read_guide, ui_push, execute_script, browser_*, or task → tool → guide
      routing. Preserve all 12 records, their URIs, and the full-resource concatenation.
      readGuideFile and the mtime cache remain exactly as resource-serving code.
- [ ] Verify that absent fields in any touched call-facing answer stay omitted rather than becoming
      null; use errMessage for any caught values in changed TypeScript. Do not add colors or
      hand-edit assets/editor-types/*.d.ts.

### 3. Remove only proven-dead renderer command adapters

- [ ] Edit src/renderer/api/mcp/command-registry.ts to remove the old page, board, toolset,
      ui_push, and dynamic browser_* registrations/dispatch. Retain call, execute_tool, and
      board_call; retain the generic MCP handler and IPC transport.
- [ ] Delete src/renderer/api/mcp/page-commands.ts, board-commands.ts, and ui-push.ts only after
      re-running the handler greps above.
- [ ] Remove only the three page-result interfaces from src/renderer/api/mcp/types.ts.
- [ ] Remove toPageContentResult and toImageResult from src/main/mcp/tool-results.ts after the
      post-edit grep proves no references; keep toToolResult, registerTools, and passThrough because
      call/execute_tool still use them.
- [ ] Leave src/renderer/automation/**, handleCall, the AiVision tree, all editor facades,
      call-command.ts, board-call-command.ts, mcp-handler.ts, request-log.ts, log-view-access.ts,
      and ui-push-validation.ts intact. Update only stale comments that name deleted adapters,
      such as src/renderer/editors/browser/agent-access.ts.

### 4. Remove the standalone highlight recipe and stale resource prose

- [ ] In assets/mcp-res-ui.md, delete exactly the section beginning at
      ### In the Persephone window (current lines 229–258) and ending immediately before
      ### In a board. This removes the standalone app.ui.highlightElement recipe and its app-window
      option/result table while preserving the board and browser sections.
- [ ] Update the remaining UI-guide cross-references to prefer ui.highlight(name, message?) and
      window.screen.*; keep only any accurate raw API reference that is genuinely still needed.
      Replace stale execute_script comments with script.execute/call wording, without adding a new
      standalone recipe.
- [ ] Sweep every assets/mcp-res-*.md file. Rewrite remaining old route names in
      mcp-res-graph.md, mcp-res-notebook.md, mcp-res-pages.md, and mcp-res-boards.md to
      pages[i].content, pages.addEditorPage, pages[i].editor.*, settings.*, main.*, or the
      relevant resource URI. Preserve format/reference material. Confirm the already
      call-oriented scripting, browser, tools, overview, links, and editor-catalog resources do
      not regress.

### 5. Delete per-tool QA and remove references to the obsolete suite

- [ ] Delete exactly these six files: qa/mcp-test-create-page.md, qa/mcp-test-ui-push.md,
      qa/mcp-test-execute-script.md, qa/mcp-test-page-operations.md, qa/mcp-test-browser.md,
      and qa/mcp-test-ui-guidance.md.
- [ ] Remove their six rows from qa/README.md, revise its prose so qa/surfaces/ is the active
      call-based suite, and remove instructions that create new tool-grouped files.
- [ ] Remove the obsolete fallback-file paragraph in qa/surfaces/gate.md and the old-suite
      description in qa/surfaces/README.md. Keep the gate's deleted-capability names and coverage
      matrix as evidence of the authorised deletion.
- [ ] Do not touch anything under qa/runs/, including the deletion gate and earlier evidence.

### 6. Update user-facing documentation

- [ ] Rewrite docs/mcp-setup.md's Available Tools table to show only call and execute_tool,
      retain the accurate call-only environment-variable section, replace old-tool examples with
      call paths, remove the old browser_* table, and describe resources as URI-only documents.
      Update examples for pages, profiles/windows, scripts, Log View, and browser automation.
- [ ] Update docs/index.md's Agent Tools bullet to describe discovery through tools.search and
      execution through tools.execute/the retained execute_tool.
- [ ] Update the live Agent Tools and feature prose in docs/agent-tools.md, docs/boards.md,
      docs/browser.md, docs/editors.md, docs/scripting.md, and docs/api/ui-log.md to use call
      paths and pages.logView.push. Remove old tool tables and read_guide instructions; retain the
      detailed format/authoring material where it is still useful.
- [ ] Under ## Version 5.0.0 (Upcoming) in docs/whats-new.md, add a Breaking Changes entry naming
      the 32 removed tools, stating that call replaces them, explicitly stating that execute_tool
      remains, and stating that the guide resources remain available by URI. Leave older release-
      history entries unchanged.

### 7. Update developer architecture documentation

After the source changes, update every live architecture file found by the reference grep:

- [ ] doc/architecture/overview.md: describe the two-tool default manifest, call paths, retained
      resources, and retained execute_tool; remove the old command-group inventory.
- [ ] doc/architecture/key-files.md: remove deleted adapter/file ownership rows, update Log View
      and browser/UI ownership to call paths, and keep the automation/facade rows.
- [ ] doc/architecture/browser-editor.md: describe automation as the implementation behind
      pages[i].editor.* and window.screen.*, remove the old MCP tool/registry/target tables, and
      preserve the operation layer, privacy guard, refs, and navigation-wait decisions.
- [ ] doc/architecture/scripting.md: replace old MCP entry points with script.execute, pages.logView,
      and the call surface while preserving the scripting architecture.
- [ ] Also update stale live references in doc/architecture/pages-architecture.md,
      doc/architecture/folder-structure.md, doc/architecture/editors.md, and
      doc/architecture/ui-element-contract.md; the folder tree must no longer claim deleted command
      modules are present, while src/renderer/automation/** remains documented.
- [ ] At epic close, update doc/agent-transparency-roadmap.md: mark the EPIC-090 row ✅, update
      the execute_script and read_guide tool-to-path rows, and add the user-supplied closing note
      with the before/after manifest tool counts.

### 8. Verify the deletion and documentation sweep

- [ ] Re-run source greps for every deleted tool name and inspect each remaining hit. Allowed hits
      must be retained execute_tool, historical docs/whats-new.md entries, explicit epic/task
      deletion ledgers, or untouched historical qa/runs/ evidence; no live manifest, tool schema,
      command registration, or current guide should instruct an agent to call a deleted tool.
- [ ] Query tools/list with the flag off and on: expect {call, execute_tool} and {call} respectively.
      Query resources/list in both modes: expect all 13 guide resources.
- [ ] Confirm call with no path still returns the overview, script.execute and the listed replacement
      paths remain discoverable, and a call answer omits absent keys rather than using null.
- [ ] Run the project's normal static/build verification appropriate to the implementation, but add
      no unit tests. Re-run the handler/helper/import greps after any cleanup so a shared replacement
      is not accidentally removed.

## Concerns

- execute_tool is not negotiable: it remains in the default manifest and is hidden only by
  PERSEPHONE_MCP_CALL_ONLY. Its deletion is a later user-check decision, not part of US-1349.
- Every MCP resource remains. Deleting readGuideFile, the mtime cache, any resource registration,
  or any persephone://guides/* asset would serve stale or missing guides and is unsafe.
- tool-commands.ts is partly shared with the live AiVision tree; deleting it or any of its three
  call-backed handlers would break tools.search, tools.toolsets.refresh, or tools.createToolset.
  Only old registry entries are removed.
- ui-push-validation.ts and Log View access are shared with pages.logView.push and script ui;
  deleting them because ui_push disappears is unsafe.
- The non-call mcp-test-agent skill still models the retired full manifest. This document recommends
  retiring or archiving it, but leaves that choice for the user rather than silently changing the
  test harness.
- No listed deletion was found unsafe after the gate. The conservative boundary is to delete only
  the three renderer adapters proven by grep and leave src/renderer/automation/** and all facades
  untouched.

## Acceptance Criteria

- [ ] Exactly the 32 tools in the source-count table are absent from the default manifest; call and
      execute_tool are the only default tools, and call is the only flag-on tool.
- [ ] execute_tool remains callable in the default manifest, and the flag behavior is unchanged.
- [ ] All 12 focused guide resources and persephone://guides/full remain registered and readable;
      readGuideFile and its mtime cache remain.
- [ ] The manifest instructions start with bare call, contain no deleted tool names or guide-tool
      calls, use the verified replacement paths, mention execute_tool accurately, and are reduced to
      roughly 20–25 source lines.
- [ ] The exact five retired main tool files, three proven-dead renderer adapter files, and six
      per-tool QA files are deleted; agent-tools.ts survives with one tool.
- [ ] The standalone app-window app.ui.highlightElement recipe section is gone, while the rest of
      assets/mcp-res-ui.md and the replacement <node>.highlight(...) path remain.
- [ ] No generic MCP IPC channel, handleCall, AiVision tree, automation implementation, editor
      facade, resource callback, or shared Log View/tool handler is deleted.
- [ ] Existing completed task documents under doc/tasks/ (including US-1347 and US-1345) remain
      unchanged; this README is the only task document in scope.
- [ ] Current user and architecture docs describe call paths/resources; the 5.0.0 Breaking Changes
      entry names the removal, replacement, retained execute_tool, and retained resources.
- [ ] No unit tests are added, no generated assets/editor-types/*.d.ts file is hand-edited, no
      hardcoded colors are introduced, and caught values use errMessage where applicable.

## Files intentionally requiring no changes

- src/main/mcp/tools/call-tools.ts and src/renderer/api/mcp/call-command.ts — the live call endpoint
  and bare-overview behavior are already implemented and were exercised by the gate.
- src/renderer/automation/**, src/renderer/scripting/ai-vision/**, and the editor facades under
  src/renderer/scripting/api-wrapper/** — these are the tested replacement surfaces.
- src/renderer/api/mcp/mcp-handler.ts, board-call-command.ts, request-log.ts, log-view-access.ts,
  and ui-push-validation.ts — generic IPC, Board bridge, logging, and shared Log View validation
  remain live.
- assets/editor-types/*.d.ts — generated; never hand-edit.
- qa/runs/** — historical evidence; explicitly out of scope.
- Existing completed task documents under doc/tasks/ (including US-1347 and US-1345) — preserve
  their reviewed plans; this README is the only task document in scope.
- doc/active-work.md — the US-1349 dashboard entry already exists; do not add a duplicate.
- Historical entries below the current docs/whats-new.md 5.0.0 section and historical epic/run evidence
  — preserve their factual record while updating only current live documentation.

## Files Changed Summary

| Change | Exact paths |
|---|---|
| Task document | doc/tasks/US-1349-deletion/README.md |
| Delete outright — retired main tool factories (5) | src/main/mcp/tools/page-tools.ts; src/main/mcp/tools/window-tools.ts; src/main/mcp/tools/board-tools.ts; src/main/mcp/tools/browser-tools.ts; src/main/mcp/tools/guide-tools.ts |
| Delete outright — proven-dead renderer adapters (3) | src/renderer/api/mcp/page-commands.ts; src/renderer/api/mcp/board-commands.ts; src/renderer/api/mcp/ui-push.ts |
| Delete outright — retired per-tool QA (6) | qa/mcp-test-create-page.md; qa/mcp-test-ui-push.md; qa/mcp-test-execute-script.md; qa/mcp-test-page-operations.md; qa/mcp-test-browser.md; qa/mcp-test-ui-guidance.md |
| Edit runtime/manifest and shared cleanup | src/main/mcp/manifest.ts; src/main/mcp/server-factory.ts; src/main/mcp/tools/agent-tools.ts; src/main/mcp/tools/params.ts; src/main/mcp/renderer-bridge.ts; src/main/mcp/types.ts; src/main/mcp/tool-results.ts; src/renderer/api/mcp/command-registry.ts; src/renderer/api/mcp/tool-commands.ts; src/renderer/api/mcp/types.ts; src/renderer/editors/browser/agent-access.ts |
| Edit resource prose | assets/mcp-res-ui.md; assets/mcp-res-graph.md; assets/mcp-res-notebook.md; assets/mcp-res-pages.md; assets/mcp-res-boards.md; current stale descriptions in src/main/mcp/manifest.ts |
| Edit QA/docs and roadmap at epic close | qa/README.md; qa/surfaces/README.md; qa/surfaces/gate.md; docs/mcp-setup.md; docs/index.md; docs/agent-tools.md; docs/boards.md; docs/browser.md; docs/editors.md; docs/scripting.md; docs/api/ui-log.md; docs/whats-new.md; doc/architecture/overview.md; doc/architecture/key-files.md; doc/architecture/browser-editor.md; doc/architecture/scripting.md; doc/architecture/pages-architecture.md; doc/architecture/folder-structure.md; doc/architecture/editors.md; doc/architecture/ui-element-contract.md; doc/agent-transparency-roadmap.md |
