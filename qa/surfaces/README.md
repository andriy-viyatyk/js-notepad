# Surface QA tests

Tests organised by **the part of Persephone they exercise** — one file per screen, dialog family,
or editor — rather than by which MCP tool they use.

The older `qa/mcp-test-*.md` files are grouped by tool (`create_page`, `ui_push`, `browser_*`).
That layout was right while the tools were the product. The transparency roadmap
([doc/agent-transparency-roadmap.md](../../doc/agent-transparency-roadmap.md)) collapses those
tools into one `call` path, so the interesting axis becomes the surface: *can an agent see this
screen, understand what its controls are for, and drive it?*

Two things these files are for:

1. **Documentation QA**, as before — run the test agent, watch whether it succeeds from the
   tool description and hints alone, and fix whatever misled it. Every test here uses the
   `mcp-test-agent-call` skill (Haiku, `call` as its only tool) unless it says otherwise.
2. **UI regression** — the verification steps read real live state through `call`, so running a
   file after a UI change tells you whether the surface still reports itself correctly. A test
   whose *verify* step fails after an unrelated refactor is a regression, not a doc problem.

## Files

| File | Surface | Landed by |
|------|---------|-----------|
| [gate.md](gate.md) | EPIC-090 compact deletion gate | EPIC-090 |
| [dialogs.md](dialogs.md) | Blocking dialogs, the `dialogs` node, attention and pending results | EPIC-084 (US-1297, US-1298, US-1301) |
| [shell.md](shell.md) | The application shell: header strip, tabs, curated elements and highlight | EPIC-084 (US-1300) |
| [page.md](page.md) | Page-scoped elements, activation, tab ownership, and page identity | EPIC-086 (US-1311) |
| [editors/text.md](editors/text.md) | Monaco/text editor elements, actions, conditional controls, and host state | EPIC-086 (US-1312) |
| [editors/preview.md](editors/preview.md) | Markdown, HTML, SVG, and Mermaid preview elements, actions, and boundaries | EPIC-086 (US-1313) |
| [editors/media.md](editors/media.md) | Image and video/audio editor elements, facades, media state, and dialogs | EPIC-086 (US-1314) |
| [editors/diff.md](editors/diff.md) | File-diff revision state, controls, and compare-mode pairs | EPIC-086 (US-1315) |
| [editors/graph.md](editors/graph.md) | Graph editor chrome, canvas boundary, panels, state, and menus | EPIC-086 (US-1316) |
| [editors/data.md](editors/data.md) | Grid, notebook, REST client, env vars, archive and the Log View output channel | EPIC-087 (US-1318 to US-1322) |
| [panels.md](panels.md) | Sidebar panel nodes under `page.panels`, Folder View and Git Tree | EPIC-087 (US-1323) |
| [editors/boards.md](editors/boards.md) | The board page, Board Info, and the `boards` node's local enumeration | EPIC-088 (US-1325 to US-1327) |
| [tools.md](tools.md) | Agent Tools, the toolset editor, Tools hub, MCP Inspector and Mneme | EPIC-088 (US-1328 to US-1331) |
| [editors/browser.md](editors/browser.md) | The three automation hosts: a browser page, a board's frames, and Persephone's own window | EPIC-089 (US-1334 to US-1339) |
| [menus.md](menus.md) | Popup and context menus, the `menus` node | EPIC-084 (US-1299) |
| [windows.md](windows.md) | Multiple windows, open and closed, and the redistributed application facts | EPIC-085 (US-1303) |

`shell.md` grew with EPIC-085 too: the Menu Bar (US-1304), the page sidebar (US-1305) and the
Settings catalog (US-1306) are tests S.7 onward in that file, because they are all the same screen.

The `editors/` subfolder arrived with EPIC-086, which covered the text-and-preview family in five
files, and grew with EPIC-087's data editors, EPIC-088's boards and EPIC-089's browser. With the
browser file the surface epics are complete; what remains is EPIC-090's consolidation, which retires
the per-tool files.

## Running them

Prerequisites from [../README.md](../README.md) apply unchanged. In particular: **never close,
modify, or interact with pinned tabs**, and on the user's live instance close only pages the test
created. Only scenario-created non-pinned pages and tabs may be changed.

### Runner procedure

1. **Run one surface.** Prepare a dedicated instance, leave pinned tabs alone, choose one surface
   file (or `gate.md`), and run its scenarios from a first bare `call` with no `path`. Invoke
   the Haiku skill with the scenario request:

   ```text
   Haiku pass:
   Skill(skill: "mcp-test-agent-call", args: "<the scenario request>")

   Codex pass:
   codex mcp add persephone --url http://127.0.0.1:<mcp.port>/mcp
   ```

   The skill restricts its own tools to `call`, so the Haiku pass simulates call-only regardless of
   the server manifest and tests documentation/discovery.

2. **Run all surfaces.** For the EPIC-090 deletion gate, run the ten scenarios in `gate.md` once
   in the Haiku pass and once in the Codex pass. This is the compact all-surface capability sweep,
   not a request to run all roughly sixty historical scenarios twice. A separate UI-regression
   sweep may iterate every file in the surface index when requested, but it is not the deletion gate.

3. **Codex setup.** Codex has no Persephone MCP server configured today. Launch Persephone with
   `PERSEPHONE_MCP_CALL_ONLY=1`, then add `codex mcp add persephone --url
   http://127.0.0.1:<mcp.port>/mcp`; the default port is `7865`. This is the only end-to-end
   exercise of the genuinely reduced manifest. The environment is fixed at process start, so
   changing the flag requires restarting Persephone before the Codex pass.

4. **Results.** `PASS` means the request succeeded with the expected surface result. `PARTIAL`
   means the goal was reached after wrong turns: record it as a finding, fix the relevant overview,
   hint, summary or `$help`, and re-run that scenario. `FAIL` means the agent could not reach the
   goal: abort deletion for that surface's tools only; the other surface groups may continue, and
   the failed surface reopens.

5. **Run log.** Write one dated Markdown log under `qa/runs/` for each pass (or a clearly labelled
   combined two-pass log). It must contain model/harness, Persephone build and manifest mode,
   surface/scenario ids and user requests, confirmation that each first call had no `path`, the
   `Overview route` field with every wrong path, exact paths reached, on-screen verification,
   PASS/PARTIAL/FAIL, findings and fixes, re-run results, and the 32-tool coverage matrix. For the
   Codex log, record the MCP endpoint and evidence that only `call` was advertised. Redact secrets,
   credentials, private URLs, and user data; keep diagnostics such as path errors and tool names.

The runner still does not delete pages or accept user trust/destructive dialogs on the user's behalf.
The only unattended answer exception is the low-privilege inline Log View question defined in
[gate.md](gate.md). These procedures do not invoke a test-agent skill while authoring documentation.


### Surface-specific checks

- **Transcript review.** The output that matters is not pass/fail, it
  is *what to change* — a reworded member summary, a clearer `$help`, a hint that pointed the
  wrong way. That judgement lives in the transcript, so the agent that reads the transcript has
  to be the one that decides. (Recorded in `.claude/skills/codex-dev/SKILL.md`.)
- **A PARTIAL is a finding, not a failure.** If the agent reached the goal but only after four
  wrong paths, the discovery surface is what needs fixing. Write down the wrong paths it tried —
  they are the most useful output of the whole run.
