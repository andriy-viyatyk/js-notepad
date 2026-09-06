# US-1328 — The `tools` root node

**Status:** Implemented  
**Epic:** [EPIC-088 — Boards and tools through `call`, and the retirement of seven tools](../../epics/EPIC-088.md)  
**Started:** 2026-09-06

> This task document is intentionally linked to EPIC-088 without editing the epic table or the
> dashboard, as requested for this task. No implementation is included here; implementation waits
> for explicit user approval.

## Goal

Make the Agent Tools registry visible through the renderer-side `call` object model at the root path
`tools`. The node will expose the four existing registry capabilities—search, execution, registered
toolset inspection/refresh, and scaffolding—while preserving user-only registration, the `.env`
secret boundary, and the structured self-repair result.

## Background

### Root ownership and placement

The renderer root is `AiRoot`, whose static members are declared in `ROOT_MEMBERS` at
`src/renderer/scripting/ai-vision/root.ts:34-57` and whose live object getters are at
`src/renderer/scripting/ai-vision/root.ts:106-120`. `AppWrapper` mirrors the public `app` object and
currently stops at `boards` and `boardVars` at `src/renderer/scripting/api-wrapper/AppWrapper.ts:123-129`;
the underlying `App` has the same stopping point at `src/renderer/api/app.ts:92-98`. There is no
`app.tools` object and no `IApp.tools` member (`src/renderer/api/types/app.d.ts:60-67`).

Therefore `tools` belongs directly on `AiRoot`, as a renderer call namespace beside `boards`, not on
`AppWrapper`, `App`, or the script-facing `IApp`. This preserves the root's rule that a path has the
same spelling as the script API where an API exists, while keeping this trust-gated registry out of
the script API as required by the registry's own security contract
(`src/renderer/api/tools/tools-trust.ts:22-24`, `src/renderer/api/tools/tool-scaffold.ts:12-13`,
`src/renderer/api/tools/tool-executor.ts:14-15`). The root's help also says that it is separate from
`AppWrapper` so the script-facing object remains unchanged (`src/renderer/scripting/ai-vision/root.ts:18-24`).

`RESERVED_ROOT_NAMES` currently contains `"tools"` at `src/renderer/scripting/ai-vision/root.ts:27-32`.
The exported constant has no consumers at all: a repository search finds only its declaration at
`:32` and the explanatory comment referring to it at `:54`. The main router independently routes
only `main` locally and forwards every other non-`windows` path at
`src/main/mcp/tools/call-tools.ts:34-63`, and `MainAiRoot` advertises only `windows` and `main` at
`src/main/mcp/ai-vision/main-root.ts:157-170`. Once `AiRoot` owns the real `tools` member, remove
`"tools"` from the array and update its comment; leave `windows`, `main`, `guides`, `script`, and
`pipe` reserved. This is a safe declaration cleanup, not a router change.

`tools` is deliberately a root-only member with no `app.tools` script equivalent. Existing root-only
precedents include `dialogs`, `menus`, `page`, and `helpSearch` in `ROOT_MEMBERS` and `AiRoot`'s
getters (`src/renderer/scripting/ai-vision/root.ts:34-43`, `:98-110`). The registry follows that
precedent because its trust-gated executor and scaffold are explicitly kept off `app` and scripts
(`src/renderer/api/tools/tools-trust.ts:22-24`, `src/renderer/api/tools/tool-scaffold.ts:12-13`,
`src/renderer/api/tools/tool-executor.ts:14-15`); the root's same-spelling rule is knowingly not
extended to this protected surface.

### Descriptor pattern and live collection behavior

Namespace descriptors are registered for renderer-owned singleton objects through
`registerAiVisionFor` in `src/renderer/scripting/ai-vision/namespaces/index.ts:14-44`. The existing
`boards` descriptor is a static member list with computed properties supplied through `provide` at
`src/renderer/scripting/ai-vision/namespaces/boards.ts:4-33`; `proc` and `shell` show the same concise
namespace style at `src/renderer/scripting/ai-vision/namespaces/proc.ts:1-14` and
`src/renderer/scripting/ai-vision/namespaces/shell.ts:1-29`.

The new namespace will use a small renderer-side `ToolsNode` wrapper around `registeredTools`, with
`ToolsetsNode` and `ToolsetNode` wrappers for the collection and its live entries. These wrappers own
the AiVision descriptors where the object is newly constructed, following the existing live indexed
`DialogsNode` pattern (`src/renderer/scripting/ai-vision/dialogs/index.ts:55-97`) and the indexed
`PageCollectionWrapper` pattern (`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:72-109`).
The root will return a stable renderer-local `toolsNode`; `namespaces/index.ts` will register that
singleton with `registerAiVisionFor`, just as it registers `boards` at `:39`.

The resulting paths and public shapes are:

```ts
tools.search(query?: string, maxResults?: number): Promise<SearchToolsResult>;
tools.execute(toolId: string, args?: Record<string, unknown>): Promise<ToolRunResult>;
tools.toolsets: ToolsetsNode;
tools.toolsets.refresh(): Promise<RefreshToolsetsResult>;
tools.createToolset(name: string, dir: string): Promise<CreateToolsetResult>;
```

`tools` will have a `children()` entry for `.toolsets` with the current count. `tools.toolsets` will
have a `children()` entry for every current registered toolset (`[0]`, `[1]`, ...), including invalid
and shadowed registrations, with a summary containing its name, validity, and declared-tool count.
This makes the live collection visible in the node hint while retaining the static member list for
the methods. `IAiVisionDescriptor.children()` is explicitly required to be cheap and side-effect-free
at `src/shared/ai-vision/types.ts:57-77`, and the resolver invokes it for hints and member errors at
`src/shared/ai-vision/resolver.ts:184-218`.

The collection will support numeric indexes (`tools.toolsets[0]`) and exact case-insensitive
authoritative-name indexes (`tools.toolsets["azure-devops"]`). An absent index throws an error naming
the requested value and the currently valid names/indexes; it never returns a synthetic empty
toolset. The path grammar permits both numeric and JSON-string indexes at
`src/shared/ai-vision/path-parser.ts:4-19` and `:126-138`.

Each live toolset node will expose these read-only properties:

| Property | Shape and meaning |
|---|---|
| `name` | The registry display name: manifest name when present, otherwise the registered folder basename. |
| `root` | The absolute registered toolset root. |
| `valid` | Structural manifest-validation result. It remains `false` for an invalid manifest and is never inferred from a path. |
| `shadowed` | Whether a valid manifest lost a name collision and therefore contributes no runnable flat tools. |
| `errors` | A fresh validation/collision-error array; `[]` means no recorded errors. |
| `manifest` | A read-only projected parsed manifest when parsing succeeded; `undefined` when the manifest is absent or unreadable. |
| `tools` | A fresh declaration list projected from the parsed manifest, carrying tool name, description, `inputSchema`, requirements, timeout, and environment-variable names only. `undefined` means no parsed manifest; `[]` means a parsed manifest genuinely declares no tools. |

The wrapper will re-find an entry by normalized root for every getter, using the same path identity
utility used by the registry, so an object obtained before a refresh reports current state rather
than a stale `RegisteredToolset` record. The source registry stores all registered roots, valid and
invalid, in order at `src/renderer/api/tools/registered-tools.ts:56-60`; builds the records at
`:108-161`; and exposes `RegisteredToolset` fields at `:39-54`. No per-toolset `refresh()` is included
on an individual node; the refresh decision is resolved below.

### Registry and the four existing MCP capabilities

The registry singleton is `registeredTools` at `src/renderer/api/tools/registered-tools.ts:68-177`.
It has separate `toolsets` and collision-resolved flat `tools` getters at `:89-95`, a reactive
subscription at `:97-100`, and lazy initialization at `:81-87`. A registered tool carries its
namespaced id, toolset name/root, search metadata, and `ToolDef` at `:25-37`. A registered toolset
stores the parsed manifest, name, validity, errors, and shadowed state at `:39-54`.

The four replacement contracts are verified against the existing handlers, not just the epic survey:

1. `handleSearchTools` initializes, reads the flat registered list, supports empty listing,
   `select:` exact lookup, and term scoring at `src/renderer/api/mcp/tool-commands.ts:33-82`.
   Its scoring haystack is exactly id, tool description, tool keywords, toolset name/description,
   and toolset keywords at `:60-74`. A full definition is projected by `McpToolDefinition` and
   `toDefinition` at `:6-30`; its fields are `id`, `toolset`, `description`, optional `inputSchema`,
   `requirements`, `env`, `timeoutMs`, and `toolsetRoot`.
2. `handleExecuteTool` validates that `toolId` is present and delegates to `executeToolById` at
   `src/renderer/api/mcp/tool-commands.ts:84-89`.
3. `handleRefreshToolset` passes the optional path to the registry, then returns the complete
   refresh envelope at `src/renderer/api/mcp/tool-commands.ts:91-112`: `{ refreshed, toolsetCount,
   toolCount, toolsets }`, where each summary has `{ name, root, valid, shadowed, toolCount, errors }`.
4. `handleCreateToolset` computes the target root, scaffolds only when the manifest folder is absent,
   presents the registration dialog, distinguishes decline from registration, and refreshes only
   after trust is granted at `src/renderer/api/mcp/tool-commands.ts:114-173`.

The task must not edit either the declarations in `src/main/mcp/tools/agent-tools.ts:6-50` or the
handlers in `src/renderer/api/mcp/tool-commands.ts:33-173`. The namespace will reuse the existing
handler behavior for search, refresh, and creation where practical, unwrap handler error envelopes
into thrown call errors, and call the existing executor for `execute`. The old MCP tools remain
available until the later epic acceptance task.

### Refresh is whole-registry only

`refresh_toolset` accepts `path`, but the path is explicitly a hint in the declaration at
`src/main/mcp/tools/agent-tools.ts:30-36` and the handler passes it unchanged at
`src/renderer/api/mcp/tool-commands.ts:91-95`. The registry names the parameter `_root` and ignores
it: `RegisteredTools.refresh(_root?: string)` always obtains every trusted root from
`toolsTrust.listPaths()` at `src/renderer/api/tools/registered-tools.ts:102-115`, then rebuilds all
toolsets, collision claims, and flat tools at `:125-167`. This is intentional because a manifest name
change can change collision ownership (`:102-106`).

Consequently, `tools.toolsets.refresh()` is the only refresh action. It preserves the complete
handler result, including `root`, `shadowed`, and the outer counts. `tools.toolsets[i].refresh()` is
not advertised: a method with that name would silently refresh every registered toolset. The optional
`path` argument is dropped from the new path because there is no honest per-toolset equivalent.

### Execution result, self-repair, and validation

`ToolRunResult` is defined at `src/renderer/api/tools/tool-executor.ts:31-53`. It always includes
`toolId`, `toolsetRoot`, `ok`, `logs`, `stderr`, `exitCode`, `signal`, `timedOut`, and `durationMs`,
with optional `result`, `resultText`, `argWarnings`, and `error`. `executeTool` runs the command from
the toolset root, loads the environment only for the child process, and feeds JSON args on stdin at
`src/renderer/api/tools/tool-executor.ts:145-163` and `:247-250`. It parses the last
`##PERSEPHONE_RESULT##` marker and falls back to trimmed plain stdout at `:116-141`; process failure,
timeout, and marker parse failure are reduced to structured results at `:168-232`.

The new `tools.execute` method must return that `ToolRunResult` directly. For a real tool failure,
the observable failure must remain the same structured object—at minimum
`{ ok: false, error, exitCode, stderr, logs, toolsetRoot }`—rather than throwing a string or
converting the failure to a generic call error. The `tools` `$help` text must repeat the self-repair
rule: use `toolsetRoot` and `stderr` to fix the tool in its folder, call
`tools.toolsets.refresh()`, and run it again. It must also repeat the marker contract: the last
`##PERSEPHONE_RESULT##<json>` line wins, unmarked stdout is `logs`, no marker makes trimmed stdout
`resultText`, and stderr is diagnostics. These are the guide's stated contracts at
`assets/mcp-res-tools.md:59-84` and `:188-193`, not new behavior.

There are two distinct error classes:

- An unknown `toolId` is an invalid request and must throw before a process is spawned, with the
  requested id and the valid flat id list. The new `tools.execute` wrapper will resolve the id against
  `registeredTools.tools` itself, throw on no match, and only then delegate to the unchanged
  `executeToolById` at `src/renderer/api/tools/tool-executor.ts:276-297`. The legacy
  `handleExecuteTool` still delegates directly to that executor at
  `src/renderer/api/mcp/tool-commands.ts:84-89`, so its existing structured unknown-id result stays
  unchanged for the MCP tool being replaced.
- The current `validateArgs` is explicitly warning-only at
  `src/renderer/api/tools/tool-executor.ts:55-107`, and `executeTool` runs despite those warnings at
  `:145-149`. The new `tools.execute` path will preserve that non-blocking behavior and surface the
  existing `argWarnings` field in the unchanged `ToolRunResult`. `$help` will say that warnings are
  advisory, the schema is descriptive, and the tool script validates its own inputs. Do not turn
  these warnings into a request error or diverge from `execute_tool`.

An unknown toolset index/name is likewise an invalid request: `ToolsetsNode.index()` will throw with
the requested value and the current valid toolset names/indexes. Normal keyword search with no
matches remains a legitimate `{ total: 0, returned: 0, tools: [] }`; only exact `select:` lookup of
an unknown id/toolset is a guessed input and must throw with the valid id list. This distinguishes
empty search results from invalid execution targets.

### Trust boundary and registration dialog

`toolsTrust` is the exact-path registration/trust registry. It persists absolute toolset roots and
never reads trust from a manifest or an in-folder file at
`src/renderer/api/tools/tools-trust.ts:1-23`; `isTrusted` compares exact normalized paths at
`:48-58`, and only the caller that has already obtained consent calls `trust` at `:69-81`.
`tool-scaffold.ts:createToolset` explicitly copies the template and writes the authoritative manifest
name but does not register the folder at `src/renderer/api/tools/tool-scaffold.ts:30-70`.

`tools.createToolset(name, dir)` will therefore delegate to the existing `handleCreateToolset` flow
without bypassing it. The flow uses `showRegisterToolsetDialog` at
`src/renderer/api/mcp/tool-commands.ts:141-148`; that dialog is a real user confirmation model at
`src/renderer/ui/dialogs/RegisterToolsetDialog.ts:7-31`, and its existing AiVision adapter exposes
the visible buttons, `click`, and `cancel` at
`src/renderer/scripting/ai-vision/dialogs/register-toolset.ts:5-36`. The method must never call
`toolsTrust.trust` directly before that dialog.

The exact return distinction is preserved:

```ts
// User declined: folder exists, but nothing is runnable.
{ created: boolean, registered: false, toolsetRoot: string, message: string }

// User approved: trust was granted and the registry was refreshed.
{ created: boolean, registered: true, toolsetRoot: string, toolsetName: string,
  tools: Array<{ id: string; description: string }> }
```

Those branches are implemented at `src/renderer/api/mcp/tool-commands.ts:149-171`. An already
registered folder returns `{ created: false, registered: true, toolsetRoot, message }` at `:127-130`.
The `$help` text will name the registration dialog and say that a declined folder can be re-offered
by calling the same method again; no path or member will silently register a toolset.

### Secret boundary

The only fields that carry environment-variable names are:

- Search full definitions: `McpToolDefinition.env`, copied from `tool.tool.env` at
  `src/renderer/api/mcp/tool-commands.ts:20-30`.
- Toolset tool projections: the `ToolDef.env` field, documented as required variable **names** at
  `src/renderer/api/tools/tools-manifest.ts:33-37`.
- The manifest/guide examples use the same `env[]` names (`assets/mcp-res-tools.md:44-47` and
  `:121-135`).

`.env` values are read by `loadDotEnv` only to construct the child process environment at
`src/renderer/api/tools/dotenv.ts:22-31`, and `executeTool` passes that map to `proc.execute` without
putting it in `ToolRunResult` at `src/renderer/api/tools/tool-executor.ts:145-163`. The new namespace
must not read `.env` for a return value, expose the parsed map, add a setter, or accept an environment
secret argument. `tools.execute.args` remains the existing JSON payload delivered to the tool's
stdin; it is not an environment/credential configuration channel and the `$help` must direct
credentials to `.env` plus `env[]` names. No new member returns `.env` values, and no new member
accepts a dedicated secret value. The existing execution log may persist the caller's JSON args
locally (`src/renderer/api/tools/tool-log.ts:99-113`), so callers must not put `.env` credentials in
`args`.

### Initialization and absent values

The current registry starts with empty `toolsets` and `tools` state at
`src/renderer/api/tools/registered-tools.ts:56-66`; `ensureInitialized()` calls `toolsTrust.load()`
and then a full `refresh()` at `:81-87`. `toolsTrust.load()` prepares and reads the persisted trust
file, which is a state/file side effect at `src/renderer/api/tools/tools-trust.ts:38-46`. A descriptor
read must not trigger that work.

The implementation will initialize the registry once during renderer bootstrap after filesystem
readiness, not on the first `tools` read: `src/renderer.ts:10-20` awaits `app.initPages()` before
`api.windowReady()`, and `src/renderer/api/app.ts:198-211` waits for filesystem readiness before
initializing pages. Add `await registeredTools.ensureInitialized()` at the end of `App.initPages()`.
This makes the one existing trust-file load and full manifest enumeration an explicit startup cost;
it is complete before `call` can reach the renderer. The `tools` getter, `children()`, toolset
getters, and search read therefore use only in-memory registry state. The legacy handler's
idempotent `ensureInitialized()` guard may remain for its own cold-call safety, but it is a no-op on
the public root path after bootstrap. No getter or `children()` may call `ensureInitialized()` or
`refresh()`.

The implementation must keep an initialization guard available for defensive checks. If an internal
caller constructs the root before bootstrap completes, reads must fail closed with an explicit
"Agent Tools registry is not initialized" error rather than treating default empty arrays as a valid
empty registry. After bootstrap, the following absent-value contract applies:

| Member/value | Registry uninitialized | No registered toolset | Registered toolset with invalid manifest |
|---|---|---|---|
| `tools.search()` | Throws the initialization error; never initializes from the read. | Returns `{ total: 0, tools: [] }`. A normal no-match query returns an honest empty result. | Invalid toolsets contribute no flat `registeredTools.tools`, so search returns an honest empty result unless another valid tool matches. |
| `tools.execute(toolId, args)` | Throws the initialization error before execution. | Throws unknown-id with valid list `[]`; never returns empty success. | Throws unknown-id with the valid runnable-id list; invalid declarations are not in the flat runnable list. |
| `tools.toolsets` / its children | Throws the initialization error before exposing a snapshot. | Collection exists and its live children are `[]`. | Invalid registrations remain visible as children with `valid: false` and errors. |
| `tools.toolsets[i]` | Throws the initialization error. | Missing index/name throws with an empty valid list; no item exists. | Item exists; `root`, fallback `name`, `valid: false`, `shadowed`, and `errors` are present. Parsed manifest data is exposed only when parsing succeeded. |
| Toolset `manifest` | Not read. | There is no toolset item. | Parsed-but-structurally-invalid manifest is present as a projection; absent/unparseable manifest is `undefined`. |
| Toolset `tools` | Not read. | There is no toolset item. | Parsed `manifest.tools` is projected when it is an array; `[]` means the manifest genuinely declares no tools, while absent/unusable parsed data is `undefined`. Declarations remain non-runnable while `valid` is false. |
| `tools.toolsets.refresh()` | Refresh action throws the initialization error rather than initializing as a read. | Returns the full refresh envelope with zero counts and `toolsets: []`. | Returns the full envelope with the invalid summary, its errors, and manifest-declaration count. |
| `tools.createToolset(name, dir)` | This is a write/action path; it may use the existing action flow's initialization guard, but never trusts without consent. | It can scaffold and offer registration; decline returns `registered: false`. | It never treats an invalid existing folder as trusted; it offers the same dialog and reports the actual registration result. |

`undefined` is reserved for an absent/unavailable value; `[]` is used only for a genuinely empty
collection or error list. The registry's distinction between parsed manifest and validation result
comes from `readToolsManifest` at `src/renderer/api/tools/tools-manifest.ts:87-100` and
`validateToolsManifest` at `:115-172`. The distinction between invalid declarations and runnable
flat tools comes from `registered-tools.ts:114-160`.

## Implementation Plan

### 1. Make the root claim `tools` and release the reservation

Update `src/renderer/scripting/ai-vision/root.ts`:

- Remove `"tools"` from `RESERVED_ROOT_NAMES` and change the comment from “not yet built” to the
  actual list of still-reserved names (`:27-32`). The constant has no runtime consumers, so do not
  add a main-process route or modify `MainAiRoot`.
- Add a `tools` node member to `ROOT_MEMBERS` near `boards`, with `node: true`, a caution stating
  that execution runs registered scripts with user privileges, and a summary that names search,
  execution, toolset enumeration/refresh, and the user registration prompt.
- Add `get tools()` returning the singleton `toolsNode` beside `get boards()` (`:112-117`). Do not
  add `tools` to `AppWrapper`, `App`, `IApp`, or any script `.d.ts`.
- Extend `ROOT_HELP` with `tools.search`, `tools.execute`, `tools.toolsets`,
  `tools.toolsets.refresh()`, and `tools.createToolset` examples, plus the trust/secret boundary and
  self-repair rule. Keep the root's existing arguments-in-`args` convention (`:59-83`).

Before:

```ts
export const RESERVED_ROOT_NAMES: readonly string[] = ["windows", "main", "guides", "tools", "script", "pipe"];
// ROOT_MEMBERS contains boards and boardVars, but no tools member.
get boards() { return this.app.boards; }
```

After:

```ts
export const RESERVED_ROOT_NAMES: readonly string[] = ["windows", "main", "guides", "script", "pipe"];
// ROOT_MEMBERS includes the renderer-owned tools node beside boards.
get boards() { return this.app.boards; }
get tools() { return toolsNode; }
```

### 2. Register the root namespace descriptor and implement live toolset nodes

Create `src/renderer/scripting/ai-vision/namespaces/tools.ts`:

- Import the registry, executor, and the existing MCP command functions only through direct module
  paths. Keep the node on the renderer call surface, not `api/app.ts`.
- Export one `toolsNode` instance and a `describeTools` factory. Register it in
  `src/renderer/scripting/ai-vision/namespaces/index.ts` with `registerAiVisionFor`, alongside the
  existing singleton registrations (`:14-44`).
- Declare the exact `ToolsNode` members `search`, `execute`, `toolsets`, and `createToolset`; declare
  only `refresh` on `ToolsetsNode`. Do not declare an individual toolset `refresh` because the
  registry cannot scope one.
- Implement `ToolsNode.children()` with `.toolsets`; implement `ToolsetsNode.children()` with current
  numeric entries and `index()` with exact numeric/name lookup. Use fresh child summaries and never
  load files in either method.
- Make each `ToolsetNode` resolve its current registry entry by normalized `root` on every property
  access. Project only the manifest/tool fields needed by the shape above, clone arrays, and keep all
  properties read-only. Include `manifest`, `tools`, `valid`, `shadowed`, `errors`, `name`, and `root`.
- For `search`, preserve the handler's exact empty/select/ranked shape and haystack. If a `select:`
  query returns no match, throw with the valid id list instead of returning the handler's current
  `{ tools: [], note }` success. A normal unmatched keyword query remains an empty result.
- For `execute`, resolve the exact id against `registeredTools.tools`, throw with the valid flat id
  list when absent, then delegate to `executeToolById`; do not catch or stringify a returned
  `ToolRunResult`. For runtime failure the structured result passes through unchanged, including
  advisory `argWarnings`.
- For `tools.toolsets.refresh()`, delegate to the existing refresh handler and return its complete
  result. Unwrap MCP error envelopes as thrown errors for invalid request inputs.
- For `createToolset`, delegate to the existing create handler so the scaffold, dialog, decline
  branch, trust call, and post-registration refresh remain one behavior. Unwrap only a handler error;
  preserve the `{ created, registered, toolsetRoot, ... }` result.
- Put the full self-repair, marker, no-secret-value, initialization, and “no per-toolset refresh”
  guidance in the descriptor `$help`. `children()` must remain a current in-memory snapshot.

Before:

```ts
// src/renderer/scripting/ai-vision/namespaces/index.ts
registerAiVisionFor(boards, describeBoards);
registerAiVisionFor(boardVarsAdmin, describeBoardVars);
// No Agent Tools descriptor exists.
```

After:

```ts
import { toolsNode, describeTools } from "./tools";
// ...
registerAiVisionFor(toolsNode, describeTools);
```

### 3. Hydrate the registry before any public read

Update `src/renderer/api/app.ts` at `App.initPages()` (`:198-212`) after `await pages.init()` and
after `fs.wait()` has completed:

```ts
await pages.init();
const { registeredTools } = await import("./tools/registered-tools");
await registeredTools.ensureInitialized();
```

Add a read-only initialization-state seam in
`src/renderer/api/tools/registered-tools.ts` for the new namespace's defensive guard, without
exposing it in AiVision. Preserve `ensureInitialized()`'s existing loading behavior and the
registration-change subscription at `:72-87`; the root must check the seam, never call the loader
from a getter or `children()`.

Before:

```ts
await pages.init();
}
```

After:

```ts
await pages.init();
const { registeredTools } = await import("./tools/registered-tools");
await registeredTools.ensureInitialized();
}
```

The startup placement is deliberate: `fs.wait()` is awaited at `src/renderer/api/app.ts:202-206`,
whereas `toolsTrust.load()` prepares its data file at `src/renderer/api/tools/tools-trust.ts:38-45`.
No MCP call can arrive after `windowReady` until this bootstrap promise has completed
(`src/renderer.ts:16-20`).

### 4. Reject unknown ids in the new wrapper and preserve advisory arg warnings

Update `src/renderer/scripting/ai-vision/namespaces/tools.ts` only for these request-boundary
behaviors; leave `src/renderer/api/tools/tool-executor.ts` unchanged:

- Resolve `toolId` against `registeredTools.tools` in `ToolsNode.execute` itself. If there is no exact
  match, throw an error containing the requested id and every valid flat id, or `(none)`. Do not call
  `executeToolById` in that branch. This gives the new path a correction-friendly error while leaving
  the compatibility MCP handler's `ok:false` result untouched.
- For a match, delegate to the unchanged `executeToolById` and return its `ToolRunResult` directly.
  This preserves process failures, including `argWarnings`, stats, logs, and the self-repair fields.
- Do not reject `validateArgs` warnings. The executor remains the single implementation of the
  non-blocking validator and still runs the tool after collecting warnings
  (`src/renderer/api/tools/tool-executor.ts:55-59`, `:145-149`). The new `$help` must explicitly
  describe `argWarnings` as advisory, `inputSchema` as descriptive, and the tool script as the
  authoritative input validator.
- Keep the unknown-toolset-index/name throw in `ToolsetsNode.index()`; it is a new collection-boundary
  check and does not alter any legacy MCP handler.

Before:

```ts
async execute(toolId: string, args?: unknown): Promise<ToolRunResult> {
    return executeToolById(toolId, args);
}
```

After:

```ts
async execute(toolId: string, args?: unknown): Promise<ToolRunResult> {
    const tool = registeredTools.tools.find((candidate) => candidate.id === toolId);
    if (!tool) {
        const validIds = registeredTools.tools.map((candidate) => candidate.id);
        throw new Error(`Unknown toolId "${toolId}". Valid tool ids: ${validIds.join(", ") || "(none)"}.`);
    }
    return executeToolById(tool.id, args);
}
```

### 5. Keep all trust, dialog, and secret behavior on existing paths

Do not change `src/main/mcp/tools/agent-tools.ts`, `src/renderer/api/mcp/tool-commands.ts`,
`src/renderer/api/tools/tools-trust.ts`, `src/renderer/api/tools/tool-scaffold.ts`,
`src/renderer/ui/dialogs/RegisterToolsetDialog.ts`, or
`src/renderer/scripting/ai-vision/dialogs/register-toolset.ts`.

Verify during implementation that:

- `createToolset` reaches the existing `showRegisterToolsetDialog` and does not call `trust` before
  the returned approval (`src/renderer/api/mcp/tool-commands.ts:141-161`).
- Decline returns `registered: false` and a re-offer message (`:149-157`); approval returns
  `registered: true` only after trust and refresh (`:160-171`).
- Search and toolset projections expose `env` names only; no projection calls `loadDotEnv`; execute
  uses `.env` only for the child process (`src/renderer/api/tools/dotenv.ts:22-31`,
  `src/renderer/api/tools/tool-executor.ts:145-163`).
- No new member adds a password, secret, `.env` map, environment-value setter, or trust/registration
  bypass.

### 6. Verify manually through `call` only

No unit tests or test harness are part of this task. After implementation, use the existing `call`
MCP surface and the existing dialog attention/adapter flow (`src/renderer/api/mcp-handler.ts:12-31`,
`src/renderer/scripting/ai-vision/dialogs/register-toolset.ts:31-36`) to exercise the acceptance
scenarios below. Do not retire any legacy MCP tool in this task; that remains US-1332.

## Concerns

### Resolved: no per-toolset refresh

The `path` input cannot scope refresh because `registeredTools.refresh(_root)` ignores it and rebuilds
all roots (`src/renderer/api/tools/registered-tools.ts:102-167`). The honest replacement is
`tools.toolsets.refresh()` only. The implementation must not add an item-level method whose name
promises narrower behavior.

### Resolved: root placement does not expand the script API

There is no `app.tools` slot in `AppWrapper`, `App`, or `IApp` (`src/renderer/scripting/api-wrapper/AppWrapper.ts:123-129`,
`src/renderer/api/app.ts:92-98`, `src/renderer/api/types/app.d.ts:60-67`). The new node is a direct
`AiRoot` property, so no script interface, AppWrapper compile-time guard, or generated editor type
copy needs a tools member.

### Resolved: invalid manifests remain inspectable but never runnable

`readToolsManifest` returns a parsed object or `null` for absent/unparseable content
(`src/renderer/api/tools/tools-manifest.ts:87-100`), while validation separately returns errors
(`:121-172`). The registry keeps invalid records in `toolsets` but adds flat tools only for
validation-successful, non-shadowed manifests (`src/renderer/api/tools/registered-tools.ts:114-160`).
The node will expose that state and declaration list without presenting invalid tools as runnable.

### Resolved: structured execution failure versus request errors

A non-zero process, timeout, spawn error, or invalid marker is already represented by a structured
`ToolRunResult` (`src/renderer/api/tools/tool-executor.ts:179-232`). Unknown ids are request errors
and will throw with correction data before execution; schema-invalid args remain non-blocking and
surface as advisory warnings. This preserves both the self-repair contract and the EPIC-087 lesson
that guessed input cannot silently succeed.

### Startup cost

Hydrating the registry after filesystem readiness adds one persisted trust-file read and one full
manifest enumeration before the window is announced ready. That cost is explicit and bounded by the
existing registry design, which deliberately does not watch files and refreshes only on registration
or explicit refresh (`src/renderer/api/tools/registered-tools.ts:7-12`). It prevents a descriptor read
from creating `trustedTools.txt`, loading trust, or mutating the registry.

### Local execution logs

The executor records args, stdout logs, stderr, and errors to the per-toolset log
(`src/renderer/api/tools/tool-executor.ts:257-271`; `src/renderer/api/tools/tool-log.ts:99-126`). The
new surface cannot make arbitrary tool output safe, so its help must tell agents to keep credentials
in `.env`, not `tools.execute` args, and the acceptance check must confirm the registry projection
never returns `.env` values.

## Acceptance Criteria

- [ ] `call` at the renderer root lists `tools` as a node; `tools` is removed from
      `RESERVED_ROOT_NAMES`, while main routing still treats only `main` and `windows` specially
      (`src/renderer/scripting/ai-vision/root.ts:27-57`, `src/main/mcp/tools/call-tools.ts:34-63`).
- [ ] `tools` is a direct `AiRoot` namespace. `AppWrapper`, `App`, `IApp`, and generated editor
      `.d.ts` surfaces do not gain `tools` (`src/renderer/scripting/api-wrapper/AppWrapper.ts:64-188`,
      `src/renderer/api/app.ts:23-191`, `src/renderer/api/types/app.d.ts:20-72`).
- [ ] `$help` and the node hint advertise exactly `search`, `execute`, `toolsets`, and
      `createToolset` on `tools`, and only `refresh` on `tools.toolsets`; no per-toolset refresh is
      advertised. `tools.children()`/`tools.toolsets.children()` show the live collection.
- [ ] `tools.search()` matches the existing empty listing, `select:<toolset>/<tool>` definition,
      and ranked term-search behavior from `handleSearchTools` (`src/renderer/api/mcp/tool-commands.ts:33-82`).
      Full definitions contain exactly the verified metadata fields, and `env` contains names only.
- [ ] A normal unmatched keyword search returns a genuine empty result; an unknown exact selection
      throws with the valid flat tool ids rather than returning `{ tools: [] }` as a false success.
- [ ] `tools.execute(toolId, args)` delivers JSON args to the selected registered process and
      returns the existing success shape, including `result` or `resultText`, `logs`, and
      `durationMs` (`src/renderer/api/tools/tool-executor.ts:226-232`, `:247-250`).
- [ ] A process/tool failure returns the same structured self-repair fields
      `{ ok:false, error, exitCode, stderr, logs, toolsetRoot }`; it is not string-thrown or flattened.
      `$help` documents the last-marker and fix-refresh-rerun contract
      (`assets/mcp-res-tools.md:59-84`, `:188-193`).
- [ ] An unknown `toolId` in `tools.execute` or unknown toolset index/name throws a descriptive error
      containing the valid ids/names before execution. The legacy `execute_tool` unknown-id result
      remains unchanged. A non-empty `validateArgs` result remains non-blocking and is surfaced as
      advisory `argWarnings`, with no schema-based divergence from `execute_tool`.
- [ ] `tools.toolsets` exposes current registered valid, invalid, and shadowed records with root,
      manifest state, errors, and declaration tools. Invalid records show `valid:false`; shadowed
      tools are not executable (`src/renderer/api/tools/registered-tools.ts:125-160`).
- [ ] `tools.toolsets.refresh()` performs and reports a whole-registry refresh with the exact outer
      counts and per-toolset `{ name, root, valid, shadowed, toolCount, errors }` summary
      (`src/renderer/api/mcp/tool-commands.ts:91-112`). A supplied path is not accepted as a claim
      of scoping, and no `tools.toolsets[i].refresh()` exists.
- [ ] `tools.createToolset(name, dir)` scaffolds through `createToolset`, offers the existing
      registration confirmation, never self-registers, and distinguishes `{ registered:false }`
      decline from `{ registered:true }` approval (`src/renderer/api/mcp/tool-commands.ts:127-171`).
- [ ] No path trusts/registers a toolset and no new member returns or accepts a dedicated secret
      value. Search/toolset `env` fields contain names only; `.env` values are used only in the child
      environment and never appear in MCP results (`src/renderer/api/tools/dotenv.ts:22-31`,
      `src/renderer/api/tools/tools-manifest.ts:33-37`).
- [ ] Registry initialization occurs before `windowReady`; `tools` getters, search reads, and both
      `children()` implementations do not initialize or refresh. Uninitialized state fails closed;
      initialized-but-empty state returns `[]` only for genuine empty collections, and absent values
      are `undefined` as audited above (`src/renderer.ts:10-20`, `src/renderer/api/app.ts:198-211`).
- [ ] Manual `call` verification covers: root discovery; empty/search/select forms; valid and invalid
      toolset states; tool execution success, marker fallback, and structured failure; unknown id and
      schema-invalid args with advisory warnings; whole refresh; create-and-decline; create-and-approve through the existing
      dialog adapter; re-offer after decline; env-name-only output; and absence of `.env` values.
- [ ] `src/main/mcp/tools/agent-tools.ts` and `src/renderer/api/mcp/tool-commands.ts` remain
      unchanged; no dashboard, epic document, tests, harness, dashboard retirement, or commit is
      part of US-1328.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/scripting/ai-vision/root.ts` | Add the direct `tools` root node, update root help, and remove the now-claimed reservation. |
| `src/renderer/scripting/ai-vision/namespaces/tools.ts` | New `ToolsNode`, `ToolsetsNode`, and `ToolsetNode` descriptors and the five public paths. |
| `src/renderer/scripting/ai-vision/namespaces/index.ts` | Register the renderer-local tools namespace singleton. |
| `src/renderer/api/app.ts` | Hydrate the registry after filesystem readiness and before `windowReady`. |
| `src/renderer/api/tools/registered-tools.ts` | Add the internal read-only initialization-state seam needed for fail-closed reads. |
| `src/renderer/api/tools/tool-executor.ts` | **No change.** Preserve the legacy unknown-id structured result, non-blocking `validateArgs`, and `ToolRunResult` process-failure contract. |
| `src/main/mcp/tools/agent-tools.ts` | **No change.** Existing MCP declarations remain until the retirement task. |
| `src/renderer/api/mcp/tool-commands.ts` | **No change.** Existing handlers remain the compatibility path and source of replacement behavior. |
| `src/renderer/api/tools/tools-trust.ts` | **No change.** Trust remains exact-path and user-mediated. |
| `src/renderer/api/tools/tool-scaffold.ts` | **No change.** Scaffolding remains trust-free. |
| `src/renderer/ui/dialogs/RegisterToolsetDialog.ts` | **No change.** Reuse the existing registration prompt. |
| `src/renderer/scripting/ai-vision/dialogs/register-toolset.ts` | **No change.** Reuse the existing AiVision dialog adapter. |
| `src/renderer/api/tools/tools-manifest.ts`, `dotenv.ts`, `tool-stats.ts`, `tool-log.ts` | **No change.** Reuse existing manifest, secret injection, statistics, and logging contracts. |
| `src/main/mcp/tools/call-tools.ts`, `src/main/mcp/ai-vision/main-root.ts` | **No change.** Main routing does not own renderer `tools`. |
| `src/renderer/api/types/app.d.ts`, `src/renderer/scripting/api-wrapper/AppWrapper.ts`, `assets/editor-types/*.d.ts` | **No change.** The node is intentionally not an `app`/script member. |
| `doc/active-work.md`, `doc/epics/EPIC-088.md` | **No change.** Dashboard and epic edits are explicitly out of scope for this request. |
| `tests/`, test harness files | **No change.** No unit tests or harness are requested. |
