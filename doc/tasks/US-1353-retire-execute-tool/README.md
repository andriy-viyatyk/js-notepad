# US-1353: Retire `execute_tool` — the manifest is `call` alone

**Status:** Completed
**Epic:** none (follow-up to [EPIC-090](../../epics/EPIC-090.md), Needs user check 1)
**Roadmap:** [agent-transparency-roadmap.md](../../agent-transparency-roadmap.md)

## Goal

Delete `execute_tool`, the last tool EPIC-090 kept alongside `call`, now that its replacement path
`tools.execute(toolId, args)` has the evidence the roadmap's principle 3 requires. With it goes the
`PERSEPHONE_MCP_CALL_ONLY` flag, which existed only to hide it.

## Background

EPIC-090 deleted 32 of Persephone's 34 MCP tools and kept two. `call` is the endpoint. `execute_tool`
stayed for one reason only: its replacement had never been exercised against a tool that actually
runs. Every registered toolset on the development machine calls a live service with the user's
credentials, and registering a scratch toolset needs a click on the "Register this toolset?" dialog
that an agent must not take on the user's behalf. Marking the row on the strength of an
agent-answered trust prompt would have made the whole programme's evidence standard decorative, so
the row stayed unmarked and the tool stayed in the manifest, hidden behind
`PERSEPHONE_MCP_CALL_ONLY`.

EPIC-090 decision 2 stated the exit condition in advance: *"When `execute_tool`'s row is finally
marked … the flag becomes vestigial and can be deleted in the same change that deletes the tool."*

### The evidence (2026-09-07)

The user ran `tools.execute` through `call` against **a registered toolset in a user project**, with
human authorization, and all three capability rows were verified:

| Row | Result |
|---|---|
| Run by id | `tools.execute` with args `["<toolset>/<tool>", { … }]` returned `ok: true` with real result rows |
| Parameter overrides | Overrides passed in the same args object were honored by the tool |
| Failure shape | A clean, correctly shaped failure came back when the tool script itself refused a statement — the tool's own read-only guard, a false positive **inside the tool script**, not a Persephone defect |

`tools.search` and the `tools` overview were exercised in the same session. Nothing about the
toolset, the service, the database, the hosts, or any identity is recorded — the evidence is the
shape of the three answers, and that is all the marking needs.

## Decisions

### The flag is deleted, not kept as a no-op

`PERSEPHONE_MCP_CALL_ONLY` had exactly one effect: dropping `execute_tool` from the manifest. With
`execute_tool` gone the default manifest *is* the flag-on manifest, so keeping the variable would
leave a documented switch that provably does nothing — the residue EPIC-090 decision 1 argued
against when it rejected a settings-shaped flag. Removal cost is one live source file
(`server-factory.ts`: the `isMcpCallOnlyEnabled` helper and the environment read) plus documentation
that had to change anyway for the manifest count. EPIC-090 decision 2 pre-authorized exactly this.

The removal is recorded in `docs/whats-new.md` under 5.0.0 for the benefit of anyone who set the
variable during the migration: a leftover `PERSEPHONE_MCP_CALL_ONLY` in a shell or shortcut is
harmless and can be deleted.

### `handleExecuteTool` goes; the other three tool handlers stay

`tools.execute` does **not** route through `handleExecuteTool` — the AiVision `tools` node calls
`executeToolById` from `api/tools/tool-executor.ts` directly
(`src/renderer/scripting/ai-vision/namespaces/tools.ts:209`). The handler's only caller was the
`execute_tool` registry entry, so it is dead and removed. `handleSearchTools`,
`handleRefreshToolset` and `handleCreateToolset` in the same file are live — the `tools` node imports
them — and are untouched, exactly as US-1349 established.

## Implementation

Following the US-1349 deletion pattern: tool definition, renderer adapter, agent-visible prose,
then the docs.

- [x] Delete `src/main/mcp/tools/agent-tools.ts` (its only tool was `execute_tool`).
- [x] `src/main/mcp/server-factory.ts`: drop the `agentTools` import, the `isMcpCallOnlyEnabled`
      helper and the `process.env.PERSEPHONE_MCP_CALL_ONLY` read; register `callTools(ctx)` alone.
      Both resource loops untouched — all 13 resources still register.
- [x] `src/main/mcp/manifest.ts`: the Agent Tools line of `SERVER_INSTRUCTIONS` now reads
      "find registered tools with `tools.search()` and run one with `tools.execute(id, args)`".
- [x] `src/main/mcp/types.ts`: the `IMcpToolDef` comment no longer uses `execute_tool` as its
      example of a pass-through definition.
- [x] `src/renderer/api/mcp/command-registry.ts`: `McpCommandMethod` is `"call" | "board_call"`.
- [x] `src/renderer/api/mcp/tool-commands.ts`: delete the dead `handleExecuteTool`.
- [x] Comment sweep in `src/renderer/api/tools/` (`registered-tools.ts`, `tools-manifest.ts`,
      `tools-trust.ts`) — `execute_tool` → `tools.execute`.
- [x] `assets/tool-template/CLAUDE.md` and `.env.example`: agent-facing prose that still named
      `search_tools`, `refresh_toolset` and `execute_tool` (missed by US-1349) now names
      `tools.search()`, `tools.toolsets.refresh()` and `tools.execute`.
- [x] Roadmap: `execute_tool` marked **retirable** in the tool → path map, the EPIC-088 row and
      withheld-note resolved, the EPIC-090 row and closing note updated to **34 → 1**.
- [x] `doc/epics/EPIC-090.md`: Needs user check 1 resolved with the verification above; decision 2
      and the kept-tools table annotated.
- [x] `doc/epics/EPIC-088.md`: Needs user check 2 marked resolved with a pointer.
- [x] `docs/whats-new.md` 5.0.0: manifest is one tool down from 34; the flag entry rewritten as a
      removal.
- [x] `docs/mcp-setup.md`: the call-only flag section removed, Available Tools is one row.
      `docs/index.md`, `docs/agent-tools.md` updated to `tools.execute`.
- [x] `doc/architecture/overview.md`, `key-files.md`, `folder-structure.md` updated. No key-files
      row was deleted: `/src/main/mcp/tools/` still exists and still holds `call-tools.ts`.
- [x] `qa/README.md`, `qa/surfaces/README.md`: the Codex pass no longer needs a launch flag.
      `qa/surfaces/gate.md`: the `execute_tool` exclusion now records how the row was closed.

## Files not changed, deliberately

- `src/renderer/api/tools/tool-executor.ts` and the whole Agent Tools runtime — the replacement path
  uses it unchanged.
- `src/renderer/scripting/ai-vision/namespaces/tools.ts` — `tools.execute` is already correct; this
  task deletes a tool, it does not touch the path.
- `src/main/mcp/tools/params.ts` — `windowIndex` is still used by `call`.
- `qa/runs/**`, `doc/tasks/completed.md` historical rows, `doc/epics/completed.md` narrative, and
  `docs/whats-new.md` entries below 5.0.0 — historical record.
- `assets/editor-types/*.d.ts` — generated.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build-prod` all pass.
- Source grep: no `execute_tool`, `search_tools`, `refresh_toolset` or `create_toolset` remains
  anywhere under `src/` or `assets/`.

## Acceptance Criteria

- [x] `execute_tool` is absent from the manifest; `call` is the only advertised tool.
- [x] `PERSEPHONE_MCP_CALL_ONLY` is gone from the source and from user documentation.
- [x] All 12 focused guide resources and `persephone://guides/full` still register.
- [x] `tools.search`, `tools.toolsets.refresh`, `tools.createToolset` and `tools.execute` are
      unaffected.
- [x] The roadmap and EPIC-090 record the verification without naming the toolset, the service, or
      any identity.
- [x] No unit tests added, no generated typings hand-edited, no hardcoded colors.

## Files Changed Summary

| Change | Paths |
|---|---|
| Delete | `src/main/mcp/tools/agent-tools.ts` |
| Runtime | `src/main/mcp/server-factory.ts`; `src/main/mcp/manifest.ts`; `src/main/mcp/types.ts`; `src/renderer/api/mcp/command-registry.ts`; `src/renderer/api/mcp/tool-commands.ts`; `src/renderer/api/tools/registered-tools.ts`; `src/renderer/api/tools/tools-manifest.ts`; `src/renderer/api/tools/tools-trust.ts` |
| Agent-facing assets | `assets/tool-template/CLAUDE.md`; `assets/tool-template/.env.example` |
| Roadmap and epics | `doc/agent-transparency-roadmap.md`; `doc/epics/EPIC-090.md`; `doc/epics/EPIC-088.md` |
| Developer docs | `doc/architecture/overview.md`; `doc/architecture/key-files.md`; `doc/architecture/folder-structure.md` |
| User docs | `docs/whats-new.md`; `docs/mcp-setup.md`; `docs/index.md`; `docs/agent-tools.md` |
| QA | `qa/README.md`; `qa/surfaces/README.md`; `qa/surfaces/gate.md` |
| Dashboard | `doc/active-work.md`; `doc/tasks/completed.md` |
