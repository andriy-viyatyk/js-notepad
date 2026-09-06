# MCP Documentation QA Testing

Quality assurance tests for persephone MCP server documentation. The goal is to ensure AI agents can use persephone MCP tools correctly based solely on tool descriptions and resource guides — without prior knowledge of the project.

## How It Works

The **Haiku pass** uses the `mcp-test-agent-call` skill to simulate a generic AI assistant that only
knows Persephone through its `call` connection. The **Codex pass** uses the genuinely reduced
Persephone manifest, with `call` as the only advertised MCP tool. Both passes test discovery from
the empty overview rather than relying on author-supplied paths.


## Test Files

| File | Area | Tests |
|------|------|-------|
| [`surfaces/README.md`](surfaces/README.md) | Per-surface `call` QA | Dialogs, popup menus, curated shell elements, attention, editors, and highlights |

## Surface QA

The active suite lives under [`qa/surfaces/`](surfaces/README.md). These tests follow the part of
Persephone an agent is trying to understand or drive, so they cover the `call` protocol's live
attention, dialog/menu actions, curated element descriptions, editors, and highlights. Use the
surface index for its common rules and the per-surface preparation, request, expected result, and
verification steps.

## Running Tests

### Prerequisites

- Persephone running with its MCP server enabled
- MCP connection established (verify with a bare `call`, with no `path`)

### Important Rules

- **NEVER close, modify, or interact with pinned tabs.** Pinned tabs belong to the user and must not be touched during testing.
- Only non-pinned tabs may be closed, created, or modified.
- Some tests require preparation pages - create them as non-pinned tabs before running the test agent.

### Runner procedure

The procedures below apply to one surface and to the EPIC-090 deletion gate. Keep the pinned-tab
rules above for every run.

1. **Run one surface.** Prepare a dedicated instance, leave pinned tabs alone, choose one surface
   file (or `gate.md`), and run its scenarios from a first bare `call` with no `path`. Invoke
   the Haiku skill with the scenario request:

   ```text
   Haiku pass:
   Skill(skill: "mcp-test-agent-call", args: "<the scenario request>")

   Codex pass:
   codex mcp add persephone --url http://127.0.0.1:<mcp.port>/mcp
   ```

   The skill restricts its own tools to `call`, which is also the whole shipped manifest; the Haiku
   pass tests documentation and discovery.

2. **Run all surfaces.** For the EPIC-090 deletion gate, run the ten scenarios in `gate.md` once
   in the Haiku pass and once in the Codex pass. This is the compact all-surface capability sweep,
   not a request to run all roughly sixty historical scenarios twice. A separate UI-regression
   sweep may iterate every file in the surface index when requested, but it is not the deletion gate.

3. **Codex setup.** Add the server with `codex mcp add persephone --url
   http://127.0.0.1:<mcp.port>/mcp`; the default port is `7865`. The manifest is `call` alone
   (US-1353 removed `execute_tool` and the `PERSEPHONE_MCP_CALL_ONLY` flag with it), so no
   launch flag or restart is needed for a call-only pass.

4. **Verify and classify results.** Verify the expected surface state through `call`, including
   the on-screen result. `PASS` means the request succeeded with the expected surface result.
   `PARTIAL` means the goal was reached after wrong turns: record it as a finding, fix the relevant
   overview, hint, summary or `$help`, and re-run that scenario. `FAIL` means the agent could not
   reach the goal: abort deletion for that surface's tools only; other surface groups may continue,
   and the failed surface reopens.

5. **Run log.** Write one dated Markdown log under `qa/runs/` for each pass, or a clearly labelled
   combined two-pass log. Include the model/harness, Persephone build and manifest mode,
   surface/scenario ids and user requests, confirmation that each first call had no `path`, the
   `Overview route` field with every wrong path, exact paths reached, on-screen verification,
   PASS/PARTIAL/FAIL, findings and fixes, re-run results, and the 32-tool coverage matrix. For the
   Codex log, record the MCP endpoint and evidence that only `call` was advertised. Redact secrets,
   credentials, private URLs, and user data; keep diagnostics such as path errors and tool names.

The runner does not delete pages or accept user trust/destructive dialogs on the user's behalf.
The only unattended answer exception is a low-privilege inline Log View question as defined in
[`surfaces/gate.md`](surfaces/gate.md). QA runs belong to Claude as recorded in
`.claude/skills/codex-dev/SKILL.md`.


### What to Check

For **structured editors** (notebook, links, graph):
- Did the agent read the dedicated resource guide BEFORE creating/updating?
- Is the JSON structure correct (all required fields present)?
- Does the editor render without crashes?

For **simple editors** (text, markdown, mermaid, grid, SVG, HTML):
- Correct editor + language pairing?
- Content is valid for the format?

### When a Test Fails

1. **Investigate why** — check the agent's tool call sequence in the stream output
2. **Ask the agent** — if it guessed instead of reading a resource, ask why
3. **Improve documentation** — update tool descriptions, resource guides, or server instructions
4. **Re-test** — restart persephone (to reload MCP server) and re-run the failing test

### Common Failure Patterns

| Pattern | Fix |
|---------|-----|
| Agent guesses JSON format instead of reading resource | Strengthen warning in tool description (STOP, MUST read) |
| Agent uses wrong editor+language pairing | Add to server instruction editor table |
| Agent doesn't know about a feature | Add to server instruction overview |
| Editor crashes on agent-provided content | Add validation and return error message with resource URI |

## Adding New Tests

When adding a new feature or editor, add a scenario to the relevant surface file. Each scenario
needs **Request**, **Expected**, and **Verify** sections; document any setup in **Preparation**.
Run it from a bare `call` to validate discovery and documentation quality.
