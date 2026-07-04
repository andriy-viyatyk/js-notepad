# EPIC-038: Agent Tools Registry

## Status

**Status:** Active
**Created:** 2026-07-03
**Completed:** —

## Overview

During project work the agent repeatedly performs the same external-system chores — read a
task from Azure DevOps, query an MS SQL database, check an email inbox — and each time it
re-writes ad-hoc scripts and re-pays the same debugging tax (auth, encoding, pagination).
This epic adds an **Agent Tools Registry** to Persephone: the agent (or the user) creates a
folder containing a `tools-manifest.json` plus scripts **in any language**, registers it in
Persephone, and from then on any MCP-connected agent can discover and run those tools via
two static MCP meta-tools — `search_tools` (returns complete, ready-to-call tool
definitions, mirroring Claude Code's `ToolSearch` semantics) and `execute_tool`.

The registry is **executable memory**, complementing Mneme's knowledge memory: the debugging
cost of an integration is paid once and the working artifact persists across sessions, and
across agents (any MCP client benefits, not just Claude Code). A management UI editor lets
the user see every registered toolset, remove one, or register a folder copied from another
machine.

Deliberately **not** in scope: exposing each registered tool as a first-class dynamic MCP
tool. MCP tool schemas are declared statically per session in `mcp-http-server.ts`, many
clients handle `listChanged` poorly, and N first-class tools would bloat every
conversation's context. The meta-tool indirection (the same pattern Claude Code itself
uses for deferred tools + `ToolSearch`) is the design.

## Goals

- Let the agent **create, register, and reuse** parameterized tools written in any language,
  so recurring external-system tasks stop being re-implemented from scratch.
- Keep the MCP surface **constant-size**: two meta-tools (`search_tools`, `execute_tool`)
  plus scaffolding (`create_toolset`, `refresh_toolset`), regardless of how many tools exist.
- Reuse the proven **boards patterns**: folder + manifest identity, a user-only trust
  registry (RCE gate) with a confirmation dialog on every agent-initiated registration,
  template scaffolding, command-runner execution.
- Ship a **management UI** (standalone editor) to list, inspect, register, and remove
  toolsets — including registering a toolset folder copied from another machine.
- Make tools **self-repairing**: a failed `execute_tool` returns stderr + the tool's folder
  path so the agent fixes the tool instead of working around it; MCP instructions encode
  this loop.

## Background — existing infrastructure (verified)

### The MCP pipeline (what a new tool touches)
- `src/main/mcp-http-server.ts` — every tool is a static `server.tool(name, description,
  zodSchema, handler)` inside `createMcpServer()`; handlers forward to the renderer via
  `sendToRenderer(method, params, windowIndex?, timeoutMs?)` (30 s default — `ui_push`
  passes `0` for infinite; `execute_tool` must pass a long/infinite timeout too). Server
  `instructions:` text (lines ~185-227) is where the agent-guidance blurb goes. `read_guide`
  has a Zod enum of guide names + a `resourceFiles` array mapping to `assets/mcp-res-*.md`.
- `src/renderer/api/mcp-handler.ts` — `handleCommand(method, params)` switch; adding a tool
  = adding a `case` + handler. `createBoard` (:582) / `openBoard` (:601) are the closest
  analogs: validate params → delegate to an `app.*` model → return a small result object.
- Adding one MCP tool therefore touches: main declaration, renderer case, and (for a guide)
  the `read_guide` enum + `resourceFiles` + a new `assets/mcp-res-tools.md`.

### The command runner (execution engine to reuse)
- `src/main/command-runner.ts` — central spawn/stream/kill engine keyed by `jobId`.
  `spawn(command, { shell: opts?.shell ?? true, cwd, env: {...process.env, ...opts.env},
  windowsHide: true })` — command is a **command-line string** (any language: `python x.py`,
  `node x.js`), cwd/env are caller-supplied (cwd is NOT defaulted — the tools handler must
  pass `cwd: <toolset folder>`). stdin writable (`writeJobStdin`/`endJobStdin`); stdout/stderr
  coalesced ~16 ms; whole-tree kill (`taskkill /T /F` on Windows).
- `src/renderer/api/proc.ts` — `app.proc.execute(command, {cwd, env, shell, name})` returns
  `IExecuteHandle` with `getText()`, `getJson(pattern?)` (extracts the **last** regex-marked
  JSON from noisy stdout), `getBytes()`, streaming `on()`, `kill()`; `RunnerError` carries
  `exitCode` + `stderr`. The `execute_tool` handler is essentially
  `app.proc.execute(manifestCommand, { cwd: toolRoot, env, name: toolId })` + a buffered read.

### The boards identity + trust pattern (to mirror)
- `src/renderer/editors/board/board-manifest.ts` — `board-manifest.json`, `schemaVersion`,
  descriptive metadata only; `isBoardFolder()` = manifest presence; `readBoardManifest()`
  never throws. **Trust is never stored in the manifest** (a received folder must not
  self-trust).
- `src/renderer/api/board-trust.ts` — line-delimited absolute paths in a data file
  (`trustedBoards.txt` via `fs.prepareDataFile`/`saveDataFile`); reactive `TGlobalState`;
  **inherited trust** via `pathCovers()` + `fpNormalizeForCompare()`; `trust()` idempotent,
  outer-wins; deliberately NOT exposed on the `app` model so scripts can't self-trust.
- `src/renderer/api/boards.ts` + `board-scaffold.ts` — `create` = mkdir + copy
  `assets/<template>/` + `ensureBoardManifest` + **auto-trust** (provenance); templates ship
  via `forge.config.ts` `extraResource: ["./assets"]` (no build-script change needed for new
  assets — but note the dual build pipeline rule for any new *entry point*).

### Management UI patterns (to mirror)
- Standalone (non-file) editor: `hasContentHost: false`, `accepts: () => -1`, registered in
  `register-editors.ts`; opened via a fixed-page-id singleton method in
  `PagesLifecycleModel` (`showMnemeConfigPage` :1099, `showMcpInspectorPage` :1158).
  `MnemeConfigEditorModel` is the template for a config/management editor.
- `src/renderer/ui/sidebar/tools-editors-registry.ts` — `staticItems` is where a "Agent
  Tools" creatable entry goes (mirror `mcp-inspector` / `mneme-config` entries).
- `src/renderer/editors/explorer/BoardsSecondaryView.tsx` — the template if a sidebar list
  view is ever wanted (not in initial scope; the editor is).

### Related but distinct: the script library
`src/renderer/api/library-service.ts` scans a folder of `.ts`/`.js` scripts for the script
panel — JS/TS-only, in-process, no manifest, no parameters, no trust gate. The tools
registry is a different animal (any language, out-of-process, parameter schemas, trust-gated,
MCP-discoverable); the two stay separate. The library's folder-scan + watch pattern is
reusable for enumerating registered toolsets.

## Architecture — target design

1. **Toolset package.** A folder = one *toolset*: a `tools-manifest.json` + scripts + an
   optional `.env` (secrets) + optional `README.md`. One manifest declares **one or more
   tools** (an ADO toolset will naturally hold `ado_get_task`, `ado_list_my_tasks`, … sharing
   auth code). Manifest per tool: `name`, `description`, `inputSchema` (JSON Schema, same
   dialect as MCP `inputSchema`), `command` (command-line string, run with cwd = toolset
   folder), optional `timeoutMs`, optional `env` (names of required env vars, values in
   `.env`), optional `requirements` (free-text runtime prerequisites, e.g. "python 3.11+,
   pyodbc"). Toolset-level: `schemaVersion`, `name`, `description`, `author?`. **No trust
   field, no absolute paths** — the folder must stay copyable between machines.
2. **Registry + trust.** `toolsTrust` — a `board-trust.ts`-style registry persisting
   registered toolset **folder** roots to `trustedTools.txt` (registration ≡ trust: the
   registry of known toolsets and the trust registry are the same list, like boards), with
   **exact-path matching** (one folder = one toolset, one fixed-name `tools-manifest.json`;
   no inherited/parent trust — US-801 T-C1/T-C2). A reactive `registeredTools` model
   enumerates roots → reads manifests → exposes the flat tool list (id =
   `<toolset-name>/<tool-name>`). **No filesystem watcher** (US-801 T-C5): it re-enumerates on
   a trust-list change and on an explicit `refresh()` — surfaced as the `refresh_toolset` MCP
   tool + the US-805 UI Refresh button (mirrors EPIC-037's manual `board_refresh`).
3. **Execution.** `execute_tool(toolId, args)` → resolve tool → validate `args` against
   `inputSchema` (best-effort) → `app.proc.execute(command, { cwd: toolsetRoot, env:
   {...dotEnv, TOOL_ARGS_JSON?}, name: toolId })`, **args passed as JSON on stdin** (avoids
   Windows argv-quoting entirely; scripts read stdin). Result contract (C2): the tool prints
   a sentinel-marked line `##PERSEPHONE_RESULT##<json>` — **last occurrence wins** (the
   existing `getJson(pattern)` last-match extraction), so third-party-library noise on
   stdout is harmless and unmarked stdout is returned to the agent as log output; if no
   marker is present, the whole trimmed stdout is the result as plain text; stderr = logs;
   non-zero exit = error. On failure the MCP reply includes exit code, stderr,
   and the toolset folder path — fuel for the self-repair loop.
4. **MCP surface.** Two static meta-tools, mirroring Claude Code's `ToolSearch` semantics
   (search returns complete, ready-to-call definitions — no separate info tool):
   `search_tools(query?, maxResults?)` → **full definitions** for the best matches (id,
   description, `inputSchema`, requirements, required env var names — never values); query
   forms: `select:<toolset>/<tool>` for exact lookup, keywords otherwise, empty query = a
   cheap names+descriptions listing of everything; `execute_tool(toolId, args)` →
   result/error. Plus `refresh_toolset(path?)` — re-reads an already-registered toolset's
   manifest after the agent edits it (full refresh when `path` omitted); never registers, so
   the trust gate holds (US-801 T-C5). Plus `create_toolset(name, dir)` (scaffold
   from `assets/tool-template/`, ensure manifest — the `create_board` analog) so the agent
   can bootstrap a toolset. Every agent-initiated registration (`create_toolset` and any
   registration of a pre-existing folder) is gated by a **user confirmation dialog**
   ("Allow / Deny", C3); the Allow click is the trust action. A new
   `read_guide("tools")` guide (`assets/mcp-res-tools.md`) documents the manifest format,
   stdin/stdout contract, `.env` secrets, and the self-repair rule; the server
   `instructions:` gain a short scenario blurb ("before writing ad-hoc scripts for
   external-system tasks, check `search_tools`; after a repeatable ad-hoc success, offer to
   register a tool").
5. **Management UI.** A standalone **"Agent Tools" editor** (`hasContentHost: false`,
   singleton page): lists registered toolsets and their tools, shows each tool's
   description/schema/requirements, and offers: register an existing folder (folder picker →
   manifest validation → trust), remove (untrust; optionally delete folder with confirm),
   open toolset folder in Explorer, and a per-tool test-run affordance with visible
   stdout/stderr. Creatable-item entry in the Tools & Editors panel.

## Linked Tasks (in implementation order)

| # | Task | Title | Depends on | Status |
|---|------|-------|-----------|--------|
| 1 | US-801 | [Toolset package format + registry — `tools-manifest.json` module (read/validate/ensure, `isToolsetFolder`), `toolsTrust` registry (`trustedTools.txt`, exact-match, reactive), `registeredTools` model (enumerate, watch, flat tool list, id collision policy)](../tasks/US-801-toolset-package-and-registry/README.md) | — | Planned |
| 2 | US-802 | [Execution engine — resolve tool → `app.proc.execute` with cwd = toolset root, stdin-JSON args, `.env` loading + env injection, timeout + kill, output contract (stdout / marked JSON / stderr / exit code), in-memory per-tool stats + self-rotating per-toolset `tools-execution.log`](../tasks/US-802-execution-engine/README.md) | US-801 | Planned |
| 3 | US-803 | MCP surface — `search_tools` (full-definition results, `ToolSearch`-style) / `execute_tool` / `refresh_toolset` / `create_toolset` (main Zod decls + renderer handlers), long `sendToRenderer` timeout for execute, `assets/mcp-res-tools.md` + `read_guide` enum + resource registration, server instructions blurb | US-802 | Planned |
| 4 | US-804 | Scaffolding + authoring template — `assets/tool-template/` (manifest + example stdin-JSON script + `.env.example` + authoring `CLAUDE.md`), `app.tools.createToolset` scaffold API + registration confirmation dialog (C3; used by both MCP and the UI) | US-801 (parallel with US-803) | Planned |
| 5 | US-805 | Management UI — "Agent Tools" standalone editor (list/inspect toolsets & tools, register existing folder, remove/untrust, open folder, test-run with output), `showAgentToolsPage()` singleton, creatable item in `tools-editors-registry.ts` | US-801/802 | Planned |

### Order rationale
- US-801 is the foundation everything imports (manifest + trust + enumeration).
- US-802 makes tools runnable in-process (testable via `execute_script` before any MCP
  wiring exists).
- US-803 is the agent-facing milestone — after it, the feature is end-to-end usable by an
  agent; ships the guide + instructions in the same task so the surface never exists
  undocumented.
- US-804 can run parallel to US-803 (both sit on US-801); `create_toolset` (US-803) consumes
  the scaffold, so if built strictly in order the MCP tool lands with US-804's template —
  coordinate the two.
- US-805 last: pure UI over models built earlier; the user-facing management requirement.

## Concerns / Open questions (all reviewed — resolved)

| # | Concern | Notes |
|---|---------|-------|
| C1 | **Toolset vs single tool per folder** *(resolved — toolset)* | **Decision:** folder = toolset, manifest declares 1..N tools (ADO tools share auth code; fewer trust entries; matches how the user will copy folders between machines). Consequence: tool ids are namespaced `<toolset>/<tool>`; collision policy across toolsets is C8. |
| C2 | **Parameter passing + output contract** *(resolved)* | **Decision:** args as **JSON on stdin** (immune to Windows cmd quoting; works in every language). Output: **sentinel-marked result line** — the tool prints `##PERSEPHONE_RESULT##<json>`; the parser takes the **last** occurrence (existing `getJson(pattern)` mechanism), so library noise/progress logs on stdout are harmless and are returned to the agent as log output. **Fallback:** no marker → whole trimmed stdout is the result as plain text (trivial tools stay trivial). stderr = logs. Rejected: argv (quoting fragility), temp-result-file via env var (more moving parts), clean-stdout requirement (unrealistic with third-party libs). Template + guide ship a one-line `print_result` helper per runtime (python/node/pwsh) — exact sentinel string finalized in US-802. |
| C3 | **Trust model & agent-initiated registration** *(resolved — confirmation dialog)* | Registration ≡ trust (one list, like boards). **Decision: every agent-initiated registration shows a user confirmation dialog** ("The agent is trying to register tools at `<path>` — Allow / Deny"), including `create_toolset` — deliberately diverging from `create_board`'s provenance auto-trust, because a board is a visible artifact while a registered tool later executes headlessly, so registration is the user's one natural checkpoint on capability growth. Dialog shows toolset name + full path + (for a pre-existing manifest) the declared tools with descriptions; Deny returns a clear error to the agent. Mechanism: `TrustBoardDialog.tsx` is the precedent; the MCP call blocks on the dialog (infinite `sendToRenderer` timeout, the `ui_push` pattern — folds into C6). UI-initiated registration (user picks the folder) needs no extra dialog. `execute_tool`/`search_tools` never see unregistered folders. Keep `toolsTrust` off the `app`/script surface like `boardTrust`, so trust changes only flow through the sanctioned paths. |
| C4 | **Secrets** *(resolved — `.env` in the toolset folder)* | **Decision:** per-toolset `.env` in the **toolset folder root**, next to `tools-manifest.json`. The execute engine parses it and injects values into the child process env; scripts read plain env vars. Secrets never appear in the manifest, MCP traffic, or script code — `search_tools` definitions include required env var **names** only. Template ships `.env.example` (names, no values) + a `.gitignore` containing `.env`. Missing required var: warn in the management UI **and** fail at execute-time with a clear message. Rejected alternative: central `<userData>/data/tool-secrets/` storage (secrets could never leave with a folder copy, but breaks self-contained folders; copying your own `.env` between your own machines is usually desirable — see C9). |
| C5 | **`search_tools` semantics** *(resolved — substring; amended: absorbs `get_tool_info`)* | **Decision:** case-insensitive substring over id + description (+ optional manifest `keywords`). Registry scale is dozens, not thousands — semantic/Mneme search is out of scope (revisit if the registry grows). **Amended after review:** `search_tools` mirrors Claude Code's `ToolSearch` — matches return **complete definitions** (id, description, `inputSchema`, requirements, required env var names) capped by `maxResults` (default 5), and `select:<toolset>/<tool>` performs exact lookup; `get_tool_info` is dropped as redundant. Empty query returns a cheap names+descriptions listing of everything (agents will use it as list_tools). |
| C6 | **Long-running tools & the MCP timeout** *(resolved)* | **Decision:** `sendToRenderer` defaults to 30 s — `execute_tool` passes an infinite timeout (the `ui_push` precedent; also needed for the C3 confirmation dialog) and the real limit is enforced from the manifest `timeoutMs` (default 120 s) via the runner + tree-kill. Streaming/progress is out of scope — tools are request/response; long jobs belong to boards. |
| C7 | **Registry location & multi-window** *(resolved — accepted)* | Renderer-side like `board-trust.ts` (the MCP handler lives in the renderer; `app.proc` is there too). Same multi-window semantics as boards trust (lazy `load()`, last-writer-wins on the data file). |
| C8 | **Tool id namespacing & collisions** *(resolved)* | **Decision:** id = `<toolset-name>/<tool-name>`; duplicate toolset names across registered roots resolved deterministically (first-registered wins + UI warning), never silently. Manifest `name` is authoritative for the toolset, not the folder basename (folders get renamed when copied). |
| C9 | **Portability (copy from another machine)** *(resolved — accepted)* | The explicit user requirement. Manifest self-contained: relative paths only, no machine paths; `requirements` field surfaces runtime prerequisites (python version, pip packages, az cli) via `search_tools` definitions and the UI so the agent/user can provision the new machine. Secrets travel only if the user copies `.env` along with the folder (fine between the user's own machines); delete `.env` when sharing a toolset with others (C4). |
| C10 | **Windows shell semantics** *(resolved)* | Runner default `shell: true` = `cmd.exe` on Windows. **Decision:** expose an optional per-tool `shell` field in the manifest (e.g. `pwsh`), mirroring `IExecuteOptions.shell`. |
| C11 | **Agent guidance is part of the feature** *(resolved — accepted)* | The meta-tool design's known weakness: the agent must *think* to call `search_tools` (first-class tools are always in-context). Mitigation lives in the server `instructions:` + `mcp-res-tools.md`: check registry before ad-hoc external-system scripts; register after repeatable success; on tool failure, fix the tool (path + stderr provided) rather than working around it. Treat this text as a deliverable with review, not an afterthought. |
| C12 | **inputSchema validation depth** *(resolved)* | Full JSON Schema validation needs a library (ajv). **Decision:** structural best-effort (required-props + primitive type checks) in-house; the schema's main job is *describing* parameters to the agent, and the tool script must validate its own inputs anyway. Revisit ajv only if mis-calls become a real problem. |

## Notes

### 2026-07-03
- Epic created from the user's idea: an MCP tools registry so the agent stops re-writing
  (and re-debugging) the same ad-hoc integration scripts (ADO, MS SQL, email, az cli).
- Key early decisions: three static meta-tools instead of dynamic first-class MCP tools
  (context cost, static-schema constraint in `mcp-http-server.ts`, flaky client support for
  `listChanged`); reuse boards patterns (manifest identity, provenance/user-only trust,
  scaffold + auto-trust) and the command runner (string command + cwd + env + tree-kill);
  management UI as a standalone singleton editor.
- Infrastructure investigation (MCP pipeline, command runner, board trust/manifest/scaffold,
  standalone-editor + creatable-item patterns, settings/data-file persistence, script
  library overlap) is recorded in Background; findings verified against source.
- Concerns C1–C12 are open and to be reviewed one by one before implementation.
- **C1 reviewed → resolved: toolset.** User confirmed a single folder holds multiple tools
  (one `tools-manifest.json` declaring 1..N tools). Tool ids namespaced `<toolset>/<tool>`.
- **C2 reviewed → resolved: stdin-JSON args + sentinel-marked stdout result.** User raised
  the noisy-stdout problem (third-party libraries printing to stdout); decision is a
  `##PERSEPHONE_RESULT##<json>` marker line (last occurrence wins — reuses the
  `getJson(pattern)` last-match extraction), with unmarked stdout returned as log output and
  a no-marker fallback where the whole trimmed stdout is the plain-text result.
- **C3 reviewed → resolved: confirmation dialog on agent-initiated registration.** User
  requested an Allow/Deny dialog ("The agent is trying to register tools at `<path>`…").
  Applies to **both** `create_toolset` and registering a pre-existing folder — a deliberate
  divergence from `create_board`'s auto-trust, because tools later run headlessly, making
  registration the user's one visibility checkpoint. `TrustBoardDialog.tsx` is the UI
  precedent; the MCP call blocks on the dialog via the infinite-timeout `ui_push` pattern.
- **C4 reviewed → resolved: `.env` lives in the toolset folder root** (next to
  `tools-manifest.json`); values injected into the child env at execute time; template ships
  `.env.example` + `.gitignore`. Central `<userData>` secret storage rejected (breaks
  self-contained folders). C9 wording fixed: secrets travel only if the user copies `.env`
  themselves; delete it when sharing a toolset with others.
- **C5 reviewed → resolved: substring search.** Case-insensitive substring over id +
  description + optional `keywords`; empty query lists all tools; semantic search out of
  scope at this registry scale.
- **C6 reviewed → resolved as proposed.** `execute_tool` uses an infinite `sendToRenderer`
  timeout; the effective limit is the manifest `timeoutMs` (default 120 s) enforced via the
  runner's tree-kill. Streaming/progress out of scope.
- **C7–C12 reviewed → all accepted as proposed.** C7 renderer-side registry (boards-trust
  semantics); C8 `<toolset>/<tool>` ids, first-registered wins + UI warning on collision;
  C9 portability via self-contained manifests + `requirements`; C10 optional per-tool
  `shell` manifest field; C11 agent-guidance text is a reviewable deliverable; C12
  best-effort structural schema validation (no ajv).
- **Concerns review complete — all C1–C12 dispositioned.** The epic is design-complete and
  ready for implementation (US-801 first; per-task documents to be written as each task
  starts).
- **US-801 investigated + design-confirmed (task doc written).** Decisions during review:
  registry stores the toolset **folder** path with **exact-path matching** (one folder = one
  toolset, one fixed-name `tools-manifest.json`; no board-style inherited/parent trust —
  T-C1/T-C2); modules live under `src/renderer/api/tools/` (T-C3). **No filesystem watchers**
  (T-C5, user): the `registeredTools` model re-enumerates on `toolsTrust` changes + an
  explicit `refresh()`, surfaced as a new **`refresh_toolset(path?)` MCP tool** (US-803) and
  the US-805 UI Refresh button — mirroring EPIC-037's removal of board auto-reload in favor
  of manual `board_refresh`. `refresh_toolset` only re-reads already-registered toolsets
  (never registers), so the C3 trust gate is preserved.
- **MCP surface simplified: `get_tool_info` merged into `search_tools`** (user question →
  decision). Rationale: Claude Code's own `ToolSearch` has no separate info tool — a search
  returns complete, ready-to-use definitions in one round-trip. `search_tools` now returns
  full definitions for matches (capped by `maxResults`, default 5), supports
  `select:<toolset>/<tool>` exact lookup and keyword search, and an empty query returns a
  cheap names+descriptions listing. What MCP *cannot* replicate from `ToolSearch` is native
  callability of fetched tools — `execute_tool` indirection is structural. C5 amended;
  surface is now two meta-tools + `create_toolset`.
