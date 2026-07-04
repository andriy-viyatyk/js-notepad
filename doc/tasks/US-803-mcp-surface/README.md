# US-803: MCP surface — `search_tools` / `execute_tool` / `refresh_toolset`

**Epic:** [EPIC-038 — Agent Tools Registry](../../epics/EPIC-038.md)
**Depends on:** US-801 (registry) ✅, US-802 (execution engine) ✅
**Coordinates with:** US-804 (`create_toolset` scaffold + registration confirmation dialog)
**Status:** Implemented (pending manual test + app restart to expose the MCP surface)

## Goal

Expose the Agent Tools Registry to any MCP client through a **constant-size** set of static
meta-tools — `search_tools` (returns complete, ready-to-call tool definitions, `ToolSearch`
semantics), `execute_tool` (run a registered tool, structured result with self-repair fuel),
and `refresh_toolset` (re-read manifests after the agent edits them). Ship the agent-facing
guide (`assets/mcp-res-tools.md` via `read_guide("tools")`) and the server-instructions blurb
in the same task, so the surface never exists undocumented. After this task the feature is
**end-to-end usable by an agent**.

## Background — verified infrastructure

### The two-file MCP pipeline (what a new tool touches)
Adding an MCP tool touches exactly two files (+ assets for a guide):

1. **`src/main/mcp-http-server.ts`** — `createMcpServer()` declares every tool as
   `server.tool(name, description, zodParamsShape, handler)`. Handlers forward to the renderer
   via `sendToRenderer(method, params, windowIndex?, timeoutMs?)`:
   - `sendToRenderer` default timeout is `REQUEST_TIMEOUT_MS = 30_000`; **passing `0` = infinite
     wait** (the `ui_push` dialog precedent, `mcp-http-server.ts:133` — `if (effectiveTimeout > 0)`
     guards the timer, so `0` installs no timer). `execute_tool` must pass `0` (EPIC C6).
   - `toToolResult(response)` (`:151`) wraps `{ result }` → `content:[{type:"text", text:
     JSON.stringify(result, null, 2)}]`, and `{ error }` → `isError:true` text `Error: <msg>`.
   - The shared `windowIndexParam` (`:232`) is `z.number().int().optional()`.
   - Server `instructions:` is a `.join("\n")` string array (`:185`); the guidance blurb (C11)
     is a new scenario paragraph here.
   - `resourceFiles` (`:245`) is the `{name, uri, file, description}` array driving both
     `read_guide` and `registerResource`. `read_guide` has a **hardcoded `z.enum([...])`** of
     guide names (`:741`) and a bulleted "Available guides" list in its own description (`:731`).
     Adding a guide = new `resourceFiles` entry + new enum member + new description bullet +
     new instructions bullet.

2. **`src/renderer/api/mcp-handler.ts`** — `handleCommand(method, params)` switch (`:97`); a new
   tool = a new `case` + a handler function. `createBoard` (`:582`) / `openBoard` (`:601`) /
   `refreshBoard` (`:617`) are the closest analogs: narrow params with `asString`/`asBoolean`,
   delegate to a model, return `{ result }` or `{ error: { code, message } }`. Browser commands
   (`:125`) show the **lazy-import** precedent for keeping heavy code off the startup path
   (`const { handleBrowserCommand } = await import("../automation/commands")`).

### The registry + engine this task wires up (US-801/US-802, both implemented)
- `src/renderer/api/tools/registered-tools.ts` — `registeredTools` singleton:
  - `await registeredTools.ensureInitialized()` — idempotent; loads trust + enumerates.
  - `registeredTools.tools` → `RegisteredTool[]` = `{ id: "<toolset>/<tool>", toolsetName,
    toolsetRoot, tool: ToolDef }` — the collision-resolved flat list (valid toolsets only).
  - `registeredTools.toolsets` → `RegisteredToolset[]` = `{ root, manifest, name, valid,
    errors, shadowed }` — every registered root incl. invalid/shadowed ones.
  - `await registeredTools.refresh(root?)` — re-reads all manifests (v1 ignores the hint,
    full refresh) and rebuilds state.
- `src/renderer/api/tools/tool-executor.ts` — `executeToolById(toolId, args?)` →
  `Promise<ToolRunResult>`. `ToolRunResult` = `{ toolId, toolsetRoot, ok, result?, resultText?,
  logs, stderr, exitCode, signal, timedOut, durationMs, argWarnings?, error? }`. Never throws;
  unknown tool → `ok:false` with a "register its toolset first" error and no process spawned.
  It calls `ensureInitialized()` itself. **Not exposed on `app`** — reached only from the MCP
  handler (this task) and the US-805 UI.
- `src/renderer/api/tools/tools-manifest.ts` — `ToolDef` fields the definition payload draws
  from: `name`, `description`, `inputSchema?`, `command`, `timeoutMs?`, `shell?`, `env?`
  (names only), `requirements?`, `keywords?`. Toolset-level `ToolsManifest.keywords?`.
- `src/renderer/api/tools/tools-trust.ts` — `toolsTrust`; **not touched by this task** — the
  three US-803 tools never register (search/execute/refresh only see already-registered
  toolsets), so the C3 trust gate is untouched. (Registration lands in US-804/US-805.)

## Scope decision — `create_toolset` moves to US-804

The epic table lists `create_toolset` under US-803, but it is the **only** meta-tool that
mutates trust, and it depends on two things this task does not build:
`app.tools.createToolset` (the scaffold API) **and** the registration confirmation dialog (C3)
— both explicitly assigned to **US-804**. The epic's own order rationale flags this: *"`create_toolset`
(US-803) consumes the scaffold, so if built strictly in order the MCP tool lands with US-804's
template — coordinate the two."*

**Decision (see T-C1):** US-803 ships the three read/execute meta-tools that sit entirely on
existing infrastructure (`search_tools`, `execute_tool`, `refresh_toolset`) plus the guide and
instructions. `create_toolset` (MCP declaration **and** renderer handler) lands in US-804
alongside its scaffold API + confirmation dialog, so it arrives complete and trust-gated in one
piece. The guide written here documents toolset creation in a scaffold-agnostic way so it stays
correct before and after US-804.

## Implementation plan

### Step 1 — Renderer handlers (`src/renderer/api/mcp-handler.ts`)

Add three `case`s to the `handleCommand` switch (after `board_refresh`, before `ui_push`):

```ts
case "search_tools":
    return await searchTools(params);
case "execute_tool":
    return await executeToolCmd(params);
case "refresh_toolset":
    return await refreshToolset(params);
```

Add a new "Agent Tools registry" section with the three handlers. Use **lazy imports** for the
tools modules (matches the browser-command precedent; keeps `tool-executor` + `proc` off the
startup path):

```ts
// ── Agent Tools registry (EPIC-038 / US-803) ───────────────────────

/** Full, ready-to-call definition surfaced by search_tools. Mirrors an MCP tool
 *  descriptor; NEVER includes .env values or the raw command (see T-C4). */
interface McpToolDefinition {
    id: string;               // "<toolset>/<tool>" — pass to execute_tool
    toolset: string;
    description: string;
    inputSchema?: object;     // JSON Schema for args (may be absent)
    requirements?: string;    // runtime prerequisites (C9)
    env?: string[];           // NAMES of required env vars (values live in .env)
    timeoutMs?: number;
    toolsetRoot: string;      // local folder — where to edit the tool (self-repair)
}

function toDefinition(t: RegisteredTool): McpToolDefinition {
    return {
        id: t.id,
        toolset: t.toolsetName,
        description: t.tool.description,
        inputSchema: t.tool.inputSchema,
        requirements: t.tool.requirements,
        env: t.tool.env,
        timeoutMs: t.tool.timeoutMs,
        toolsetRoot: t.toolsetRoot,
    };
}

async function searchTools(params: McpParams): Promise<McpResponse> {
    const { registeredTools } = await import("./tools/registered-tools");
    await registeredTools.ensureInitialized();
    const all = registeredTools.tools;

    const query = (asString(params?.query) ?? "").trim();
    const maxResults = typeof params?.maxResults === "number" && params.maxResults > 0
        ? Math.floor(params.maxResults) : 5;

    // Empty query → cheap names+descriptions listing of everything (agents use it as list_tools).
    if (!query) {
        return {
            result: {
                total: all.length,
                tools: all.map((t) => ({ id: t.id, description: t.tool.description })),
            },
        };
    }

    // Exact lookup: "select:<toolset>/<tool>" (ToolSearch parity).
    const SELECT = "select:";
    if (query.toLowerCase().startsWith(SELECT)) {
        const wantedRaw = query.slice(SELECT.length).trim();
        const wanted = wantedRaw.toLowerCase();
        const matches = all.filter((t) => t.id.toLowerCase() === wanted);
        return {
            result: {
                total: matches.length,
                tools: matches.map(toDefinition),
                ...(matches.length === 0
                    ? { note: `No tool with id "${wantedRaw}". Call search_tools with an empty query to list all.` }
                    : {}),
            },
        };
    }

    // Keyword: case-insensitive substring over id + description + tool/toolset keywords.
    const needle = query.toLowerCase();
    const scored = all.filter((t) => {
        const hay = [
            t.id,
            t.tool.description,
            ...(t.tool.keywords ?? []),
        ].join(" ").toLowerCase();
        return hay.includes(needle);
    });
    return {
        result: {
            total: scored.length,
            returned: Math.min(scored.length, maxResults),
            tools: scored.slice(0, maxResults).map(toDefinition),
        },
    };
}

async function executeToolCmd(params: McpParams): Promise<McpResponse> {
    const toolId = asString(params?.toolId);
    if (!toolId) {
        return { error: { code: -32602, message: "Missing or invalid 'toolId' parameter" } };
    }
    // args is an arbitrary JSON object (validated best-effort by the executor, C12).
    const args = params?.args;

    const { executeToolById } = await import("./tools/tool-executor");
    const runResult = await executeToolById(toolId, args);

    // ALWAYS return as `result` (even on tool failure) so the agent gets structured
    // stderr + exitCode + toolsetRoot for the self-repair loop (T-C2). Only protocol
    // errors (missing toolId, above) use the JSON-RPC `error` channel.
    return { result: runResult };
}

async function refreshToolset(params: McpParams): Promise<McpResponse> {
    const path = asString(params?.path);
    const { registeredTools } = await import("./tools/registered-tools");
    await registeredTools.ensureInitialized();
    await registeredTools.refresh(path);

    // Post-refresh summary so the agent immediately sees manifest errors after editing.
    const toolsets = registeredTools.toolsets.map((ts) => ({
        name: ts.name,
        root: ts.root,
        valid: ts.valid,
        shadowed: ts.shadowed,
        toolCount: ts.manifest?.tools?.length ?? 0,
        errors: ts.errors,
    }));
    return {
        result: {
            refreshed: true,
            toolsetCount: toolsets.length,
            toolCount: registeredTools.tools.length,
            toolsets,
        },
    };
}
```

Add the `RegisteredTool` type import at the top:
```ts
import type { RegisteredTool } from "./tools/registered-tools";
```
(Type-only import is erased at runtime — it does not pull the module onto the startup path,
so the lazy `await import(...)` inside the handlers is still what actually loads the code.)

**Note:** `params?.maxResults` — `McpParams` values are `unknown`; narrow inline as shown
(`typeof … === "number"`). Do NOT use `asString` for it.

### Step 2 — Main-process tool declarations (`src/main/mcp-http-server.ts`)

Add a new "Agent Tools registry" block after the board tools (`board_refresh`, ~`:511`),
before the `if (browserToolsEnabled)` block:

```ts
// ── Agent Tools registry (EPIC-038 / US-803) ─────────────────────
server.tool(
    "search_tools",
    "Discover reusable Agent Tools registered in Persephone — parameterized scripts (any language) for recurring external-system chores (Azure DevOps, SQL, email, CLIs). Returns COMPLETE, ready-to-call definitions (id, description, inputSchema, requirements, required env var NAMES, local folder path) — like ToolSearch, no separate info call. Query forms: omit `query` (or pass empty) for a cheap id+description listing of everything; `select:<toolset>/<tool>` for an exact-id lookup; otherwise a case-insensitive keyword match over id/description/keywords (capped by maxResults). Run a result with execute_tool. IMPORTANT: read read_guide(\"tools\") first.",
    {
        query: z.string().optional().describe("Empty/omitted = list all (id+description). 'select:<toolset>/<tool>' = exact lookup. Otherwise keyword substring over id/description/keywords."),
        maxResults: z.number().int().optional().describe("Max keyword matches to return (default 5). Ignored for empty-query listing and select: lookup."),
        windowIndex: windowIndexParam,
    },
    async ({ query, maxResults, windowIndex }) =>
        toToolResult(await sendToRenderer("search_tools", { query, maxResults }, windowIndex)),
);
server.tool(
    "execute_tool",
    "Run a registered Agent Tool by id (from search_tools). Pass `args` as a JSON object matching the tool's inputSchema; Persephone delivers it on the tool's stdin. Returns a structured result: on success { ok:true, result | resultText, logs, durationMs, ... }; on failure { ok:false, error, stderr, exitCode, toolsetRoot, ... }. IMPORTANT self-repair rule: if a tool fails, it returns its folder path (toolsetRoot) and stderr — FIX the tool at that path (then refresh_toolset) rather than working around it. IMPORTANT: read read_guide(\"tools\") first.",
    {
        toolId: z.string().describe("Tool id '<toolset>/<tool>' (from search_tools)."),
        args: z.record(z.string(), z.unknown()).optional().describe("Tool arguments as a JSON object (matches the tool's inputSchema). Omit for a no-parameter tool."),
        windowIndex: windowIndexParam,
    },
    async ({ toolId, args, windowIndex }) =>
        // timeout 0 = infinite: the real limit is the manifest timeoutMs, enforced
        // renderer-side by the executor's own timeout + tree-kill (EPIC C6).
        toToolResult(await sendToRenderer("execute_tool", { toolId, args }, windowIndex, 0)),
);
server.tool(
    "refresh_toolset",
    "Re-read registered toolset manifests after you EDIT a tool's tools-manifest.json or scripts (the registry does not watch the filesystem). Never registers a new toolset — that stays a user action. Omit `path` for a full refresh. Returns a per-toolset summary (name, valid, errors, toolCount) so you can confirm your manifest edit parsed. Use after fixing a tool that execute_tool reported as failing.",
    {
        path: z.string().optional().describe("Toolset folder path to refresh (hint only; a full refresh runs regardless). Omit to refresh all."),
        windowIndex: windowIndexParam,
    },
    async ({ path, windowIndex }) =>
        toToolResult(await sendToRenderer("refresh_toolset", { path }, windowIndex)),
);
```

### Step 3 — Guide asset (`assets/mcp-res-tools.md`)

New agent-facing guide (see the boards guide for tone/length). Sections:
1. **What the registry is** — executable memory; parameterized scripts in any language;
   pay the integration debugging cost once, reuse across sessions and agents.
2. **The workflow** — before writing ad-hoc scripts for external-system work, `search_tools`;
   run with `execute_tool`; on failure, fix the tool at `toolsetRoot` (then `refresh_toolset`);
   after a repeatable ad-hoc success, offer to register it as a tool.
3. **`search_tools` query forms** — empty = list; `select:<toolset>/<tool>` = exact; keyword.
   Result payload fields (id, description, inputSchema, requirements, env names, toolsetRoot).
4. **`execute_tool`** — args JSON object on stdin; the result contract:
   - print the result on its own line as `##PERSEPHONE_RESULT##<json>` — **last occurrence
     wins**, so third-party stdout noise is harmless;
   - unmarked stdout = logs (returned as `logs`); no marker at all → whole trimmed stdout is
     the plain-text result (`resultText`);
   - stderr = logs; non-zero exit = failure with `exitCode` + `stderr` + `toolsetRoot`.
   - one-line `print_result` helpers per runtime (python / node / pwsh).
5. **Manifest format** — `tools-manifest.json` shape (`schemaVersion`, `name`, `tools[]` with
   `name`/`description`/`command`/`inputSchema?`/`timeoutMs?`/`shell?`/`env?`/`requirements?`/
   `keywords?`). Reference `src/renderer/api/tools/tools-manifest.ts` field docs.
6. **Secrets (`.env`)** — names in the manifest `env[]`, values in a `.env` at the toolset root;
   never travel through MCP; `.gitignore` `.env` when sharing.
7. **Portability + `requirements`** — self-contained folders, relative paths only; the
   `requirements` field surfaces runtime prerequisites for provisioning a copied toolset.
8. **Creating a toolset** — scaffold-agnostic: "use `create_toolset` (or the Agent Tools UI) to
   create a toolset folder, then edit its manifest + scripts and `refresh_toolset`." (Stays
   correct before and after US-804 ships `create_toolset`.)
9. **Self-repair rule** — restated explicitly: a failing tool is a bug to fix, given the path
   and stderr, not an obstacle to route around.

### Step 4 — Register the guide (`src/main/mcp-http-server.ts`)

- Add to `resourceFiles`:
```ts
{
    name: "tools-guide",
    uri: "notepad://guides/tools",
    file: "mcp-res-tools.md",
    description: "Agent Tools registry guide — discover/run reusable parameterized tools (any language) via search_tools/execute_tool, the stdin-JSON + ##PERSEPHONE_RESULT## contract, .env secrets, and the self-repair loop. Read BEFORE using search_tools/execute_tool.",
},
```
- Add `"tools"` to the `read_guide` `z.enum([...])` (`:741`).
- Add a bullet to the `read_guide` description's "Available guides" list (`:731`):
  `"- tools — reusable Agent Tools registry: search_tools/execute_tool, stdin-JSON + result-marker contract, .env secrets, self-repair. For search_tools/execute_tool tools."`

### Step 5 — Server instructions blurb (`src/main/mcp-http-server.ts`, C11)

Add a scenario paragraph to the `instructions:` array (after the boards block, before Browser
automation):
```ts
"**Reuse tools for recurring external-system tasks (Agent Tools registry):**",
"Before writing ad-hoc scripts for recurring external-system work (Azure DevOps, SQL, email, CLIs), call `search_tools` to check for a ready-made tool, then run it with `execute_tool`. If a tool fails it returns its folder path + stderr — FIX the tool rather than working around it. After a repeatable ad-hoc success, offer to register it as a reusable tool. IMPORTANT: read read_guide(\"tools\") first.",
"",
```
Mirror this scenario into the CLAUDE.md-loaded MCP-server-instructions section if the project
keeps a copy in sync (the same text lives in the `## MCP Server Instructions` block delivered
to clients — driven by this array, so no second edit needed).

### Step 6 — Verify (dev renderer, no build)
Per the established EPIC-038 verification method, drive the live app with `execute_script` +
dynamic `import("/src/renderer/api/mcp-handler.ts")` is NOT possible (handlers are module-local),
so instead:
1. Register a scratch toolset by adding its path to `trustedTools.txt` via `execute_script`
   (`import("/src/renderer/api/tools/tools-trust.ts")` → `toolsTrust.trust(root)`), with a
   minimal `tools-manifest.json` + an echo tool.
2. Exercise the handlers through the MCP round-trip: call the real MCP tools
   (`search_tools`, `execute_tool`, `refresh_toolset`) against the running server and assert the
   returned payloads (empty-query listing, `select:` lookup, keyword match cap, successful run
   with marker JSON, plain-text fallback, non-zero-exit self-repair payload with `toolsetRoot`,
   unknown-tool message, `refresh_toolset` summary reflecting a manifest edit).
3. Untrust the scratch toolset and delete the temp folder.

## Concerns / open questions

| # | Concern | Proposed resolution |
|---|---------|---------------------|
| T-C1 | **`create_toolset` scoping** — epic lists it in US-803 but it needs US-804's scaffold API + confirmation dialog. | **Move `create_toolset` (declaration + handler) to US-804**, where `app.tools.createToolset` + the C3 dialog live, so it ships complete and trust-gated. US-803 = `search_tools`/`execute_tool`/`refresh_toolset` + guide + instructions. The guide documents creation scaffold-agnostically. **Needs user confirmation.** |
| T-C2 | **Failure channel for `execute_tool`** — JSON-RPC `error` vs structured `result`. | Return the full `ToolRunResult` as **`result`** even when `ok:false`, so the agent receives `stderr` + `exitCode` + `toolsetRoot` (self-repair fuel). `toToolResult` would otherwise collapse an `error` to `"Error: <msg>"` and drop the diagnostics. Reserve JSON-RPC `error` for protocol faults (missing `toolId`). |
| T-C3 | **`execute_tool` MCP timeout** (C6). | `sendToRenderer(..., 0)` = infinite; the real limit is the manifest `timeoutMs` (default 120 s) enforced renderer-side by the executor's own timeout + tree-kill, which always settles the IPC. Matches the `ui_push` dialog precedent. |
| T-C4 | **What `search_tools` definitions expose.** | id, toolset, description, `inputSchema`, `requirements`, `env` (**names only**), `timeoutMs`, `toolsetRoot`. **Never** `.env` values. **Include `toolsetRoot`** (local path, not sensitive; the self-repair loop and manual manifest edits need it — mirrors boards' `boardRoot`). **Exclude `command`** (implementation detail; the agent reads the manifest at `toolsetRoot` if it needs internals). |
| T-C5 | **Invalid / shadowed toolsets are invisible to `search_tools`.** | Accepted. `search_tools`/`execute_tool` operate on the valid flat list only. Broken toolsets surface via `refresh_toolset`'s per-toolset summary (with `errors`) and the US-805 UI. An agent that edited a manifest and broke it calls `refresh_toolset` and sees the error there. |
| T-C6 | **Lazy vs static import of the tools modules in `mcp-handler.ts`.** | Lazy `await import(...)` inside each handler (matches the browser-command precedent), keeping `tool-executor` + `proc` + log/stats off the startup path. `RegisteredTool` imported type-only (erased). |
| T-C7 | **Guide (`mcp-res-tools.md`) vs US-804 template `CLAUDE.md` overlap.** | Intentional. The guide is the agent-facing **usage + contract** doc (discovery, execution, self-repair, manifest reference); the US-804 template `CLAUDE.md` is the in-folder **authoring** doc. The stdin/stdout contract is restated in both by design. |
| T-C8 | **Multi-window** (C7). | `registeredTools` is a per-renderer singleton loaded from the shared `trustedTools.txt`; any window resolves identically and `app.proc` spawns in main regardless. `windowIndex` is optional on all three tools for convention; default first window is fine. |
| T-C9 | **`args` Zod shape.** | `z.record(z.string(), z.unknown()).optional()` → `{type:object, additionalProperties:true}` in the emitted JSON Schema. The MCP surface constrains args to a JSON **object** (the normal case); the executor tolerates any JSON, but object-args is the documented contract. |

## Acceptance criteria

- `search_tools`, `execute_tool`, `refresh_toolset` declared in `mcp-http-server.ts` and handled
  in `mcp-handler.ts`; `create_toolset` deferred to US-804 (per T-C1, pending confirmation).
- `search_tools`: empty query → id+description listing of all tools; `select:<toolset>/<tool>`
  → single full definition (or a clear "not found" note); keyword → substring matches over
  id/description/keywords, capped by `maxResults` (default 5); definitions never leak `.env`
  values.
- `execute_tool`: runs a registered tool with JSON args on stdin; success returns
  `{ ok:true, result|resultText, logs, durationMs }`; failure returns `{ ok:false, error,
  stderr, exitCode, toolsetRoot }` as `result` (not a JSON-RPC error); infinite `sendToRenderer`
  timeout; unknown `toolId` → structured `ok:false` with a "register first" message; missing
  `toolId` → JSON-RPC `-32602`.
- `refresh_toolset`: re-enumerates and returns a per-toolset summary (name, valid, errors,
  toolCount) reflecting a just-edited manifest; never registers a new toolset.
- `read_guide("tools")` and resource `notepad://guides/tools` return `mcp-res-tools.md`; the
  guide documents the workflow, query forms, the stdin/`##PERSEPHONE_RESULT##` contract, `.env`
  secrets, `requirements`, and the self-repair rule.
- Server `instructions:` include the Agent-Tools scenario blurb (C11).
- `npm run lint` + `tsc --noEmit` clean.
- Live verification per Step 6 passes.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/mcp-handler.ts` | + `search_tools` / `execute_tool` / `refresh_toolset` cases + handlers (`searchTools`, `executeToolCmd`, `refreshToolset`, `toDefinition`, `McpToolDefinition`); type-only `RegisteredTool` import; lazy imports of `registered-tools` + `tool-executor`. |
| `src/main/mcp-http-server.ts` | + three `server.tool(...)` declarations; + `tools-guide` entry in `resourceFiles`; + `"tools"` in `read_guide` enum + description bullet; + Agent-Tools instructions blurb. |
| `assets/mcp-res-tools.md` | **New** — agent-facing registry guide. |

### Files that need NO change
- `src/renderer/api/tools/*` (US-801/US-802 — consumed as-is; no new methods needed).
- `src/renderer/api/tools/tools-trust.ts` — untouched; the three US-803 tools never register.
- `forge.config.ts` / `scripts/build-prod.mjs` — `assets/` is already shipped via
  `extraResource`; a new `assets/*.md` needs no build-pipeline change (no new entry point).
- Any `app.ts` / script `.d.ts` — the executor and trust stay off the script surface.

## Notes
- Created from the EPIC-038 order. Depends on US-801 + US-802 (both implemented + verified).
- Key scoping call: `create_toolset` deferred to US-804 (T-C1) so it ships with its scaffold +
  confirmation dialog in one trust-gated piece — user-confirmed 2026-07-04.

### 2026-07-04 — implemented
- Implemented all recommended concern resolutions (T-C1…T-C9). Three renderer handlers
  (`searchTools`, `executeToolCmd`, `refreshToolset` + `toDefinition`/`McpToolDefinition`) added
  to `mcp-handler.ts` with lazy imports (T-C6); three `server.tool(...)` declarations +
  `tools-guide` resource + `"tools"` read_guide enum/bullets + Agent-Tools instructions blurb
  added to `mcp-http-server.ts`; new `assets/mcp-res-tools.md`. `create_toolset` NOT added here
  (US-804). `tsc --noEmit` + ESLint clean.
- **Verified the renderer data path live** (scratch toolset via `execute_script`, 13/13
  assertions): 2-tool enumeration + `<toolset>/<tool>` id namespacing; the three `search_tools`
  query forms (empty→id+description listing, `select:`→one full definition, keyword→substring
  over id/description/keywords); definition shape leaks neither `command` nor `.env` values;
  `execute_tool` marker-JSON parse + unmarked-stdout-as-logs; non-zero-exit self-repair payload
  (`stderr` + `toolsetRoot`); unknown-tool structured `ok:false` with a register hint; the
  `refresh_toolset` per-toolset summary; untrust.
- **Caveat:** the MCP *surface* (main-process `server.tool` declarations + `read_guide` enum +
  instructions) only appears on the MCP endpoint after an **app restart** — the running dev
  server predates these edits (its `read_guide` enum still lacks `"tools"`). Handlers are
  module-local (not exported), so the live check exercised the exact modules they call rather
  than the round-trip; a full MCP round-trip is part of the user's manual test after restart.
</content>
</invoke>
