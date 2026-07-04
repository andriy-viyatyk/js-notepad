# US-801: Toolset package format + registry

**Epic:** [EPIC-038 — Agent Tools Registry](../../epics/EPIC-038.md)
**Status:** Implemented (epic-deferred review — stays `[ ]` on the dashboard until EPIC-038 review)
**Created:** 2026-07-04

## Goal

Build the foundation the rest of EPIC-038 stands on: the **toolset package format**
(`tools-manifest.json` + read/validate/ensure helpers), a **trust registry** (`toolsTrust`)
that records which toolset folders are registered/trusted, and a reactive **`registeredTools`
model** that enumerates registered toolsets, reads their manifests, and exposes a
collision-resolved flat list of tools. No MCP surface, no execution, no UI in this task —
those are US-802/803/805, which all import from here.

## Background

### What this mirrors (verified precedents)
- **Manifest** → `src/renderer/editors/board/board-manifest.ts`. `board-manifest.json`,
  `schemaVersion`, descriptive-only fields, `isBoardFolder()` = manifest presence,
  `readBoardManifest()` returns `null` on missing/malformed (never throws),
  `ensureBoardManifest()` writes a default only if absent. We copy this shape but **add the
  behavior-driving fields** the boards manifest deliberately omits (per tool: `command`,
  `inputSchema`, `timeoutMs`, `shell`, `env`, `requirements`).
- **Trust registry** → `src/renderer/api/board-trust.ts`. A reactive `TGlobalState` + lazy
  `load()` + `fs.prepareDataFile`/`getDataFile`/`saveDataFile`; line-delimited absolute
  paths; deliberately **NOT** exposed on `app` or any script `.d.ts` (a script must never
  self-trust). `toolsTrust` copies the class structure but uses **exact-path matching**
  instead of board-trust's inherited/outer-wins `pathCovers` (see Concern T-C2).
- **Enumeration model** → `src/renderer/api/library-service.ts`. `class LibraryService
  extends TModel<State>` singleton, `ensureInitialized()`, reactive `TGlobalState`, and
  `fs.listDirWithTypes()` folder walking. `registeredTools` reuses the **TModel-singleton
  shape** but — unlike library-service — does **NOT** watch the filesystem (T-C5). It
  re-enumerates only on a `toolsTrust` change (an in-memory state subscription, not a file
  watcher) and on an explicit `refresh()` (surfaced as an MCP tool in US-803 and a UI button
  in US-805). Rationale: tool registration/editing happens only during tool development, so a
  standing watcher per toolset is unwanted background cost.

### Verified infrastructure APIs (use as-is)
- `fs` (`src/renderer/api/fs.ts`): `exists(p)`, `readFile(p)` → `ITextFile{content}`,
  `write(p, content)`, `mkdir(p)`, `copyFile(src,dst)`, `listDirWithTypes(dir)` →
  `IDirEntry[]{name, isDirectory}`. Data-file helpers: `prepareDataFile(name, default)`,
  `getDataFile(name)` → `string|undefined`, `saveDataFile(name, content)`,
  `deleteDataFile(name)`. Data files live at **`<userData>/data/<name>`** (`fs.ts:33`
  `path.join(userData, "data")`) — so the trust file lands at
  `<userData>/data/trustedTools.txt` (board-trust's doc comment saying `…/persephone/data/`
  is stale; the real path has no `persephone` segment).
- `TGlobalState<T>` (`src/renderer/core/state/state.ts`): `.get()`, `.use(selector)`,
  `.update(draft => …)` (immer), `.subscribe(listener)` / `.subscribe(listener, selector)`
  → returns an unsubscribe fn.
- `TModel<T>` (`src/renderer/core/state/model.ts`): base class; construct with
  `super(new TGlobalState(defaultState))`; access `this.state`.
- Path utils (`src/renderer/core/utils/file-path.ts`): `fpJoin`, `fpBasename`, `fpExtname`,
  `fpNormalizeForCompare` (resolve + slashes + strip trailing + lowercase on Windows — the
  identity-comparison key).
- (No `nodefs`/`fs.watch` and no `debounce` — US-801 does not watch the filesystem, T-C5.)

## Implementation plan

New feature folder: **`src/renderer/api/tools/`** (three modules). Rationale: two of the
three mirror `api/` modules (`board-trust.ts`, `library-service.ts`); grouping the epic's
core registry in one subfolder keeps it discoverable and lets the US-805 editor
(`editors/agent-tools/`) import cleanly. (See Concern T-C3.)

### Step 1 — `src/renderer/api/tools/tools-manifest.ts` (new)

Types:
```ts
/** One tool declared by a toolset. Behavior-driving — unlike BoardManifest fields. */
export interface ToolDef {
    /** Tool name, unique within its toolset. Combined into the id `<toolset>/<name>`. */
    name: string;
    /** Human/agent-facing description. Surfaced by search_tools. */
    description: string;
    /** JSON Schema for the tool's args (MCP `inputSchema` dialect). Describes params to
     *  the agent; the tool script must still validate its own inputs (EPIC C12). */
    inputSchema: object;
    /** Command-line string, spawned with cwd = the toolset folder (US-802 runs it). */
    command: string;
    /** Optional per-tool timeout (ms). US-802 applies a default (120_000) when omitted. */
    timeoutMs?: number;
    /** Optional shell override (EPIC C10). Mirrors IExecuteOptions.shell; default true. */
    shell?: string | boolean;
    /** NAMES of required env vars (values live in the toolset's .env; never in the manifest,
     *  never returned through MCP). EPIC C4. */
    env?: string[];
    /** Free-text runtime prerequisites (python 3.11+, pyodbc, az cli). Surfaced for
     *  provisioning a new machine (EPIC C9). */
    requirements?: string;
    /** Optional extra search terms for search_tools (EPIC C5). */
    keywords?: string[];
}

export interface ToolsManifest {
    schemaVersion: number;
    /** Toolset name — the AUTHORITATIVE id namespace, NOT the folder basename (folders get
     *  renamed when copied between machines). EPIC C8. */
    name: string;
    description?: string;
    author?: string;
    /** Toolset-level search terms. */
    keywords?: string[];
    tools: ToolDef[];
}
```

Constants + functions (mirror board-manifest.ts 1:1 in style):
- `export const TOOLS_MANIFEST_FILE = "tools-manifest.json";`
- `export const TOOLS_MANIFEST_SCHEMA_VERSION = 1;`
- `toolsManifestPath(root): string` → `fpJoin(root, TOOLS_MANIFEST_FILE)`.
- `defaultToolsManifest(name: string): ToolsManifest` → `{ schemaVersion, name, tools: [] }`.
- `isToolsetFolder(root): Promise<boolean>` → `fs.exists(toolsManifestPath(root))` (cheap,
  no parse — gates enumeration + registration).
- `readToolsManifest(root): Promise<ToolsManifest | null>` → exact pattern of
  `readBoardManifest`: exists-check, `JSON.parse((await fs.readFile(p)).content)`, return
  `null` on absent/unparseable/non-object, never throw; higher `schemaVersion` still
  returned (forward-compat).
- `writeToolsManifest(root, manifest): Promise<void>` → `fs.write(path, JSON.stringify(m,
  null, 2) + "\n")`.
- `ensureToolsManifest(root, name): Promise<void>` → write `defaultToolsManifest(name)` only
  if `!isToolsetFolder(root)` (US-804 scaffold uses this).
- `validateToolsManifest(m: unknown): { ok: boolean; errors: string[] }` — structural
  best-effort (EPIC C12, no ajv): collect errors for — `schemaVersion` not a number; `name`
  missing/empty/not-string; `tools` not an array; each tool missing/empty `name`,
  `description`, or `command`; `inputSchema` present but not an object; duplicate tool
  `name` within the toolset. `ok = errors.length === 0`. Used by the model (mark invalid
  toolsets) and by registration (US-805 rejects an invalid folder with these messages).

### Step 2 — `src/renderer/api/tools/tools-trust.ts` (new)

Copy `board-trust.ts`'s class structure and reactive `TGlobalState<{paths: string[]}>`, with
these deliberate differences:
- File name: `const trustedToolsFileName = "trustedTools.txt";`
- **Exact-path matching, not inherited/outer-wins.** `isTrusted` / `useIsTrusted` compare
  `fpNormalizeForCompare(root)` for **equality** against each stored path (no `pathCovers`).
  `trust()` appends if not already present (exact), no ancestor/descendant collapsing.
  `untrust()` removes by exact normalized match (same as board-trust). Rationale in T-C2.
- Same public API names for symmetry: `load()`, `isTrusted(root)`, `useIsTrusted(root)`,
  `listPaths()`, `useTrustedPaths()`, `trust(root)` (re-`load()` first to avoid clobber, as
  board-trust does), `untrust(root)`.
- Same security posture: export a `toolsTrust` singleton; **do NOT** add it to `app` or any
  `.d.ts`. Trust changes flow only through the US-804 confirmation dialog (agent path) and
  the US-805 UI (user path).
- Header comment: adapt board-trust's, noting `execute_tool` is the RCE surface and the
  exact-match rationale.

### Step 3 — `src/renderer/api/tools/registered-tools.ts` (new)

Data shapes:
```ts
export interface RegisteredTool {
    id: string;            // `${toolsetName}/${tool.name}`
    toolsetName: string;
    toolsetRoot: string;   // absolute
    tool: ToolDef;
}
export interface RegisteredToolset {
    root: string;          // absolute (from toolsTrust, original case)
    manifest: ToolsManifest | null;   // null if missing/unparseable
    name: string;          // manifest.name || fpBasename(root) (display fallback)
    valid: boolean;        // readToolsManifest ok && validateToolsManifest ok
    errors: string[];      // validation messages / "manifest missing"
    shadowed: boolean;     // name collided with an earlier-registered toolset (this lost)
}
interface RegisteredToolsState {
    toolsets: RegisteredToolset[];   // every registered root, in registration order
    tools: RegisteredTool[];         // flat, collision-resolved (first-registered wins)
}
```

`class RegisteredTools extends TModel<RegisteredToolsState>` singleton `registeredTools`
(TModel-singleton shape from `LibraryService`, **without** any filesystem watcher):
- First add a `subscribePaths(listener)` method to `tools-trust.ts` that wraps
  `this.state.subscribe(listener, s => s.paths)` (so the model reacts to registration
  changes without reaching into `toolsTrust`'s private state).
- `constructor()` → `super(new TGlobalState(defaultState))`; `toolsTrust.subscribePaths(() =>
  void this.refresh())`. This is an **in-memory reactive subscription**, not a file watcher —
  it fires when the trust list changes (a toolset is registered/unregistered).
- `ensureInitialized()` — idempotent; `await toolsTrust.load()` then `await refresh()`.
- Getters: `get toolsets()`, `get tools()`; reactive hooks `useToolsets()`, `useTools()` via
  `this.state.use(...)`.
- `refresh(root?: string): Promise<void>` (the core, also the target of the US-803 MCP
  `refresh_toolset` tool + the US-805 UI button): read `toolsTrust.listPaths()`; for each
  root → `readToolsManifest` + `validateToolsManifest` → build `RegisteredToolset`. Then
  build the flat `tools[]`: iterate toolsets **in registration order**, first occurrence of a
  `toolsetName` wins; a later toolset with the same `name` is marked `shadowed:true` and its
  tools are excluded from `tools[]` (but it still appears in `toolsets[]` with an error —
  EPIC C8). Update state. **`refresh()` always rebuilds the full list** (re-reading all
  manifests is cheap at registry scale, and a single re-read can change a toolset's `name`
  and therefore the collision outcome, so the flat list must be rebuilt from all toolsets).
  The optional `root` arg is a hint only — v1 ignores it and does a full refresh; a targeted
  single-manifest optimization can come later if needed.
- `dispose()` — dispose the `toolsTrust` subscription. (No watchers to close.)

**Re-registration boundary (for US-803's `refresh_toolset`):** `refresh()` only re-reads
folders that are **already registered** in `toolsTrust`. It never adds a folder to the trust
list — registering a new toolset stays behind `create_toolset` + the trust dialog (agent) or
the US-805 UI (user), so refresh can never bypass the trust gate. The US-803 tool, given a
path that isn't registered, returns a clear error pointing at `create_toolset` / UI
registration.

### Files that need NO changes
- `board-manifest.ts`, `board-trust.ts`, `library-service.ts` — **read-only precedents**,
  copied-from, not edited.
- `fs.ts`, `file-path.ts`, `state.ts`, `model.ts` — consumed as-is; no new helpers needed.
- No MCP files (`mcp-http-server.ts`, `mcp-handler.ts`), no `app.ts`, no editor registry, no
  settings — US-801 adds none of these surfaces (that's US-802/803/805).

## Concerns / Open questions (task-level — please review)

| # | Concern | Proposed decision |
|---|---------|-------------------|
| T-C1 | **One registered path = one toolset, or board-style "trust a parent, discover many toolsets under it"?** *(resolved — one toolset per folder)* | **Decision: one registered folder = one toolset**, exactly one `tools-manifest.json` per folder (fixed filename, no arbitrary/multiple manifest names). Registration validates the folder *is* a toolset (valid manifest). Parent-folder multi-toolset discovery is deferred. |
| T-C2 | **`toolsTrust` matching: exact vs board-trust's inherited/outer-wins `pathCovers`.** *(resolved — exact)* | **Decision: exact-path matching** (no `pathCovers`). With leaf registration, inheritance would be wrong: registering `d:\tools` then `d:\tools\ado` would *drop* `ado` (covered by the parent), and if `d:\tools` isn't itself a toolset, `ado` vanishes from enumeration. The registry stores the **toolset folder path** (not the manifest file path — informationally equivalent under the fixed filename, and the folder is the simpler key). |
| T-C3 | **Module location** — `src/renderer/api/tools/` (new subfolder) vs directly in `api/` (like `board-trust.ts`) vs under the future `editors/agent-tools/`. | **Recommend `src/renderer/api/tools/`** for all three core modules; the US-805 editor folder imports from it. |
| T-C4 | **No external test surface in US-801.** `toolsTrust` is intentionally off `app`/scripts, so this task can't be exercised via `execute_script`/MCP. | Verify with a **temporary dev harness** (a throwaway module that imports the three files, creates a temp toolset folder, calls `toolsTrust.trust()`, and asserts `registeredTools` enumerates/collides/live-updates correctly), reverted after. Full end-to-end verification lands with US-803 (MCP) / US-805 (UI). Acceptance below is written against the harness. |
| T-C5 | **Filesystem watchers** — one `nodefs.watch` per registered root for live manifest edits? | **Decision (user): no filesystem watchers.** Tool registration/editing only happens during tool development, so standing per-toolset watchers are unwanted background cost. The model re-enumerates on `toolsTrust` changes (in-memory subscription) and on an explicit `refresh()`, surfaced as the US-803 MCP tool **`refresh_toolset(path?)`** and the US-805 UI Refresh button. Mirrors EPIC-037's board-auto-reload removal + manual `board_refresh`. |

## Acceptance criteria

1. `tools-manifest.ts`: `readToolsManifest` returns a parsed manifest for a valid file,
   `null` for missing/malformed (never throws); `isToolsetFolder` reflects manifest
   presence; `ensureToolsManifest` writes a default only when absent;
   `validateToolsManifest` returns precise `errors[]` for each malformed case
   (bad/absent `name`, non-array `tools`, a tool missing `command`/`description`/`name`,
   non-object `inputSchema`, duplicate tool name) and `ok:true` for a well-formed manifest.
2. `tools-trust.ts`: `trust`/`untrust`/`isTrusted`/`listPaths` round-trip through
   `<userData>/data/trustedTools.txt`; matching is exact (registering `d:\a\tools` does not
   make `d:\a\tools-2` or `d:\a\tools\ado` trusted); `trust` is idempotent; the module is
   **not** reachable from `app` or any `.d.ts`.
3. `registered-tools.ts`: after `ensureInitialized()`, `toolsets[]` lists every registered
   root (valid + invalid, invalid carrying `errors`); `tools[]` is the collision-resolved
   flat list with ids `<toolsetName>/<toolName>`; two toolsets sharing a `name` →
   first-registered wins, the loser is `shadowed` with an error and contributes no tools;
   `trust()`/`untrust()` re-enumerate automatically (via the `subscribePaths` subscription);
   calling `refresh()` after an on-disk manifest edit re-reads it and updates the reactive
   state. **No filesystem watcher is created** (T-C5) — verify none is registered.
4. `npm run lint` clean; no new colors/`require("path")`/`require("fs")`; no `!` non-null
   assertions.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/tools/tools-manifest.ts` | **New** — `ToolDef`/`ToolsManifest` types + `isToolsetFolder`/`read`/`write`/`ensure`/`validate` |
| `src/renderer/api/tools/tools-trust.ts` | **New** — `toolsTrust` registry (`trustedTools.txt`, exact-match, reactive, off-`app`) + `subscribePaths` |
| `src/renderer/api/tools/registered-tools.ts` | **New** — `registeredTools` model (enumerate, validate, collision-resolve; re-enumerate on `toolsTrust` change + explicit `refresh()`; **no filesystem watcher**) |

## Notes

### 2026-07-04
- Task investigated against source; precedents (`board-manifest.ts`, `board-trust.ts`,
  `library-service.ts`) and infra APIs (`fs` data-file helpers, `TGlobalState`, `TModel`,
  `file-path`) verified with exact signatures/line numbers.
- Two design refinements surfaced vs the epic's "near-verbatim mirror of board-trust":
  **exact-path matching** (T-C2) and **leaf registration** (T-C1), both driven by toolsets
  being registered as leaves rather than scanned under a trusted parent. Flagged for review
  before implementation.
- **T-C1/T-C2 reviewed → resolved (user).** One toolset per folder, exactly one fixed-name
  `tools-manifest.json` (no other/multiple manifest filenames); exact-path matching; the
  registry stores the toolset **folder** path (option (a), not the manifest file path).
  T-C3 (module location `api/tools/`) and T-C4 (dev-harness verification) stand as proposed.
- **T-C5 reviewed → resolved (user): no filesystem watchers.** Re-enumerate on `toolsTrust`
  changes + explicit `refresh()`; add MCP `refresh_toolset(path?)` in US-803 and a Refresh
  button in US-805 (mirrors EPIC-037's manual `board_refresh`). `refresh()` only re-reads
  already-registered toolsets — never registers, so the trust gate holds.
- Design confirmed — ready to implement.

### 2026-07-04 — implemented
- Created the three modules as planned: `src/renderer/api/tools/tools-manifest.ts`,
  `tools-trust.ts`, `registered-tools.ts`. `npm run lint` + `tsc --noEmit` both clean.
- One refinement vs the doc: `ToolDef.inputSchema` is **optional** (`inputSchema?: object`) —
  a no-parameter tool needn't declare a schema; `validateToolsManifest` only checks it when
  present. Everything else matches the plan.
- **Verified end-to-end against the live dev app** via `execute_script` (dynamic-importing
  the real modules, exercising the real `toolsTrust`/`registeredTools` singletons):
  `isToolsetFolder` (true for a toolset folder, false for a bare parent); **exact-match trust**
  (a child of a registered folder and the parent itself are NOT trusted; a sibling is its own
  entry); **collision shadowing** (two toolsets named `ado-tools` → first wins, second
  `shadowed:true` with the expected error, contributes no tools); **invalid manifest** (missing
  `name` + non-array `tools`) surfaced with both precise errors and `valid:false`; the flat
  `tools[]` carried only the winner's ids (`ado-tools/get_task`, `ado-tools/list_tasks`);
  **`refresh()` picked up an on-disk manifest edit** (3rd tool appeared after re-read); the real
  `trustedTools.txt` registry was restored to its initial state afterward. No filesystem watcher
  is created (T-C5). Temp fixtures cleaned up.
