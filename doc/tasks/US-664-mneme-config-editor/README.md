# US-664 — Mneme config & monitoring editor (+ header indicator)

**Epic:** [EPIC-032 — Mneme (vector memory)](../../epics/EPIC-032.md) · Phase 5
**Status:** Implemented — pending manual test (typecheck + lint green; review/docs deferred to epic close per the EPIC-032 deferred-review model)
**Depends on:** [US-668 — Mneme `wiki_root_config` tool](../US-668-mneme-root-config-tool/README.md) — ✅ **implemented & committed** (`0468c158`); the per-root Filters section can consume it now.

## Goal

A dedicated in-Persephone editor that drives Mneme's control-plane MCP tools — manage wiki roots (add / remove / list), trigger a reindex with **live progress**, view the index inventory and delete stale versioned index DBs, and view / update the embedding model. Plus a **header status indicator** (next to the MCP indicator) that is visible only when Mneme is enabled, opens this editor on click, and **encodes model health by colour**: green when the embedding model is loaded (full vector memory), **yellow (warning) when Mneme is running without a working model** — because then it's degraded to plain text/grep, which the agent and Persephone already have, i.e. Mneme isn't doing what it's designed for.

## Background

### What already exists (built in earlier phases)

- **Mneme sidecar** (US-660): the main process spawns/stops `mneme.exe`; the renderer learns the live URL via `api.getMnemeStatus()` → `MnemeStatus { running, url, error? }` (`src/ipc/renderer/api.ts`) and the push event `rendererEvents.eMnemeStatusChanged` (`src/ipc/renderer/renderer-events.ts`). Settings keys `mneme.enabled` / `mneme.port` (`src/renderer/api/settings.ts`); the MCP URL is `http://localhost:<port>/mcp`.
- **Mneme MCP server** (US-655…US-659): full control-plane tool surface over Streamable HTTP on loopback (no auth).
- **MCP client** (`src/renderer/editors/mcp-inspector/McpConnectionManager.ts`): `connect({ name, transport: "http", url })` → `getClient(): Client | null`. The underlying `@modelcontextprotocol/sdk@1.27.1` `Client` supports tool calls and **progress callbacks** — `client.callTool(params, undefined, { onprogress })` — independently of resource subscriptions. **US-664 does NOT depend on US-661** (subscriptions are a different primitive, used by US-662/663).
- **MCP Inspector editor** is the structural template: a no-host `EditorModel` opened as a page, owning a `McpConnectionManager`.

### Mneme control-plane tool contracts (verified against `mneme/src/mcp/`)

| Tool | Input | Result |
|------|-------|--------|
| `wiki_list_roots` | — | `{ roots: [{ name, folder }] }` (thin — name + folder only) |
| `wiki_add_root` | `{ folder (req, must exist), name? }` | `{ name, folder }` · **blocking reconcile** of the new root · no include/ignore param (defaults `include=["*.md"]`, `ignore=[]`) |
| `wiki_remove_root` | `{ root }` (name) | text `"ok"` · leaves on-disk `.mneme/` index in place |
| `wiki_reindex` | `{ path? }` (`{root}` / `{root}/sub`; omit = all) | `{ roots: [{ name, scanned, indexed, refreshed, skipped, vectorized, deleted, errors }] }` |
| `wiki_status` | — | see below — the primary monitoring source |
| `wiki_index_delete` | `{ root, modelId ("model-precision"), schemaVer (u32) }` | text `"ok"` · refuses if it identifies the **active** index |
| `wiki_model_update` | `{ model? }` (must match configured name or omit) | `ModelStatus` (see below) · **synchronous, no progress notifications, may take minutes** |

`wiki_status` result:
```
{
  roots: [{
    name, folder, docCount, model, precision, schemaVer,
    indexPath,                 // abs path to active index-v{N}.db
    indexBytes,                // 0 if not built yet
    reindex?: { phase, processed, total }   // phase: idle|scanning|embedding|done|cancelled|error; absent until first reconcile
  }],
  model?: {                    // absent if model status() errors
    name, precision, version, dir, complete,
    files: [{ filename, present, verified, bytes }]
  }
}
```

**`wiki_reindex` progress (live):** the client supplies a `progressToken` in the request `_meta`; the server calls `notify_progress({ progress, total, message })` where `message = "{root}: {phase}"`. With the SDK that surfaces as the `onprogress` callback passed to `callTool`. Cancellation: the SDK sends `notifications/cancelled` when the call's `AbortSignal` fires; Mneme breaks the reconcile loop and returns partial stats (phase `cancelled`).

**Model health (drives the warning).** `wiki_status.model` is the health source: `model` absent (Mneme couldn't resolve a manifest entry) or `model.complete === false` (files missing / not sha256-verified) ⇒ **no working embedding model** ⇒ vector/hybrid search degrades to FTS. The verified derivation `modelReady = !!status.model && status.model.complete === true` is the signal for the yellow warning. (Mneme's embedder gates on exactly this `complete` flag before loading, per `embed/mod.rs` — files present + verified.) Limitation + a stronger runtime signal: see Concern 8.

**Index inventory / stale DBs:** there is **no** MCP tool that enumerates versioned DBs — `wiki_status.indexPath` reports only the *active* DB per root. Stale DBs (`{folder}/.mneme/{model}-{precision}/index-v{N}.db` for older `N`, plus prior model/precision dirs) must be discovered by walking `{folder}/.mneme/` with `app.fs`; delete each via `wiki_index_delete`.

### Header MCP indicator (the pattern to mirror)

`src/renderer/ui/app/MainPage.tsx` — the `.mcp-indicator` span (≈ lines 121–149 styles, 209–223 render) is absolutely positioned bottom-right, gated on `state.mcpRunning` (from `app.window.use()`), and calls `showMcpRequestLog()` on click. `AutoloadReloadButton` (same file) shows the idiom for a small self-contained header component that owns its own subscription.

## Implementation plan

### Part A — the editor (`src/renderer/editors/mneme-config/`)

New folder, mirroring `mcp-inspector/`. No Rust changes (see Concern 1 for include/ignore).

1. **State** — `MnemeConfigEditorState extends EditorStateBase` with `type: "mnemeConfigPage"`, `title: "Mneme"`, a `tab: "roots" | "index" | "model"`, plus runtime fields (connection status, last `wiki_status` snapshot, per-root reindex progress, busy flags). Default factory `getDefaultMnemeConfigEditorState()`.
2. **`MnemeConfigEditorModel.ts`** — `extends EditorModel<MnemeConfigEditorState>`; `editorId = "mneme-config"`, `noLanguage = true`, `skipSave = true`, `getIcon()` returns the Mneme icon (Part D). Owns `connection = new McpConnectionManager()`.
   - `init()`/`restore()`: read `api.getMnemeStatus()`; if running, `connection.connect({ name: "Mneme", transport: "http", url })`; on connect → `refreshStatus()`. Subscribe to `rendererEvents.eMnemeStatusChanged` to reconnect / drop on start/stop and to update the not-running state.
   - `refreshStatus()` → `client.callTool({ name: "wiki_status" })`, parse the JSON content, store snapshot in state.
   - `addRoot(folder, name?)` → confirm via dialog, `callTool wiki_add_root` (wrap in `showProgress` — blocking reconcile), then `refreshStatus`. Toast success/error.
   - `removeRoot(name)` → `showConfirmationDialog` → `callTool wiki_remove_root` → `refreshStatus`.
   - `reindex(path?)` → `callTool({ name: "wiki_reindex", arguments: { path } }, undefined, { onprogress })`; the `onprogress` handler writes `{ processed, total, message }` into per-root progress state (parse root from `"{root}: {phase}"`). Provide a Cancel that aborts the call (AbortController → SDK `notifications/cancelled`). On finish → `refreshStatus`, toast summary.
   - `listStaleIndexes(root)` → walk `{folder}/.mneme/` via `app.fs`, return `{ modelId, schemaVer, bytes, path, active }[]`; `deleteIndex(root, modelId, schemaVer)` → `showConfirmationDialog` → `callTool wiki_index_delete` → refresh.
   - `updateModel()` → `showProgress(callTool wiki_model_update, "Updating model — this may take several minutes…")` (indeterminate; Concern 2), then `refreshStatus`, toast.
   - `getRootConfig(root)` / `setRootConfig(root, include, ignore)` → `callTool wiki_root_config` (**US-668**); GET on Filters expand, SET on save (wrap SET in `showProgress` — server reindexes), then `refreshStatus`, toast.
   - `dispose()` → `connection.dispose()` then `super.dispose()`.

   **Verified API details (from pre-impl review — get these exact):**
   - `McpConnectionManager` API: `connect(config: McpConnectionConfig)` where config is `{ name, transport: "http", url, … }`; `getClient(): Client | null`; `dispose()`. The returned `Client` is the raw `@modelcontextprotocol/sdk@1.27.1` client. The current call site uses `client.callTool(callParams)` (2-arg not used); the **progress** form `client.callTool(params, undefined, { onprogress })` is the SDK's documented signature (`callTool(params, resultSchema?, options?)`) — it's supported by the SDK but **not yet exercised in this codebase**, so smoke-test it once when wiring `reindex`.
   - `showConfirmationDialog` is **not** exported from the UIKit barrel — import it from `src/renderer/ui/dialogs/ConfirmationDialog.tsx` (dynamic import, e.g. `(await import("../../ui/dialogs/ConfirmationDialog")).showConfirmationDialog`). `showProgress`/`createProgress` **are** in the UIKit barrel.
   - `wiki_status` JSON: `roots[].model` is a **plain string** (model name); the **top-level** `model` is the `ModelStatus` object `{ name, precision, version, dir, complete, files:[{filename,present,verified,bytes}] }` (all fields serialize as-is, no camelCase rename — `docCount`/`schemaVer`/`indexPath`/`indexBytes` on roots are explicitly renamed to camelCase). `modelReady = !!status.model && status.model.complete === true`.
3. **Views** (`MnemeConfigView.tsx` + sub-panels `RootsPanel.tsx`, `IndexPanel.tsx`, `ModelPanel.tsx`): receive `{ model }`, subscribe via `model.state.use()`. Persistent status header (connection dot + URL + Refresh + Reindex-all + model summary) above a `SegmentedControl` (Roots / Index / Model). Not-running state shows a message + **Open Settings** button (`pagesModel.showSettingsPage()`). Built from UIKit: `Panel`, `Text`, `Button`/`IconButton`, `Dot`, `ProgressBar`, `Input`, `Select`, `Tag`. See mockup below.
   - **Per-root Filters** (RootsPanel, via **US-668**): an expandable "Filters" area per root showing `include`/`ignore` glob lists (`Tag` chips with add/remove, or an editable list). Read on load via `wiki_root_config { root }` (GET); save via `wiki_root_config { root, include, ignore }` (SET) → toast + `refreshStatus`. The SET reindexes server-side, so wrap in `showProgress`.
4. **`index.tsx`** — export `const mnemeConfigModule: EditorModule = { createEditor: () => new MnemeConfigEditorModel(new TComponentState(getDefaultMnemeConfigEditorState())), Component: MnemeConfigView }`.

### Part B — registration & open path

5. **Register** in `src/renderer/editors/register-editors.ts`:
   ```ts
   editorRegistry.register({
       id: "mneme-config",
       name: "Mneme",
       hasContentHost: false,
       accepts: () => -1,
       loadModule: async () => (await import("./mneme-config")).mnemeConfigModule,
   });
   ```
6. **No-host persistence**: add `"mneme-config"` to `NO_HOST_EDITOR_IDS` in `src/renderer/api/pages/PagesPersistenceModel.ts`.
7. **Open method** `showMnemeConfigPage()` on `PagesLifecycleModel` (mirror **`showSettingsPage`**, *not* `showMcpInspectorPage` — the latter creates a fresh page each call). Singleton is achieved by constructing `new PageModel(MNEME_CONFIG_PAGE_ID)` with a fixed id (`MNEME_CONFIG_PAGE_ID = "mneme-config-page"`); `addPage` dedups via `findPage(page.id)` and re-shows the existing page if the id already exists. Surface the method on `PagesModel` (where `showSettingsPage`/`showMcpInspectorPage` are already exposed). Optionally expose on the script API (`PageCollectionWrapper`) and the sidebar Tools registry (`tools-editors-registry.ts`). (Editor-id precedent: the MCP Inspector registers as `"mcp-view"`; mneme-config uses its own id `"mneme-config"`.)

### Part C — shared status model + header indicator

The header indicator must show model health even when the editor is **not** open, so it can't read the editor's state. Model health only comes from `wiki_status` over MCP. So introduce a small always-available shared status model that owns the MCP probe; both the indicator and the editor read it.

8. **Shared status model** — `src/renderer/api/mneme-status.ts` (or `src/renderer/editors/mneme-config/mnemeStatusModel.ts`), a singleton over a state primitive exposing reactive `{ enabled, running, modelReady }`:
   - `enabled` from `settings.get("mneme.enabled")` (and `settings.get("mneme.port")` for the URL — access is via `settings.get(key)`, **not** a `settings.value.*` path); `running` + `url` from `api.getMnemeStatus()` (returns `MnemeStatus { running, url, error? }`, `src/ipc/api-types.ts`) and the `rendererEvents.eMnemeStatusChanged` subscription (payload is `MnemeStatus`, `src/ipc/renderer/renderer-events.ts`).
   - While `enabled && running`: keep a lightweight `McpConnectionManager` to the URL, call `wiki_status`, set `modelReady = !!status.model && status.model.complete`. Refresh on: connect / `eMnemeStatusChanged` (start), a modest poll (~30 s) while running, and an explicit `refresh()`.
   - `refresh()` is **called by the editor** after model-affecting actions (`updateModel`, `reindex`) so the indicator updates promptly. (The editor keeps its own connection for interactive work — Concern 5; it just nudges this model to re-probe.)
   - Initialized once at app startup (in `app.ts`, alongside the existing mneme auto-start / event wiring).
9. **`MnemeIndicator`** component in `MainPage.tsx` (same file, like `AutoloadReloadButton`), reading `mnemeStatusModel`:
   - Render nothing when `!enabled` (visibility gated on the **setting**, not on running).
   - Dot colour via the `Dot` **`color`** prop (not `variant`; accepts `"success" | "warning" | "error" | "info" | "neutral" | "active"`): **green/`success`** when `running && modelReady`; **yellow/`warning`** when `running && !modelReady`; **grey/`neutral`** when `enabled && !running`.
   - `title` reflects the state — e.g. running+ready: *"Mneme active — vector memory ready"*; running+no-model: *"Mneme is running without an embedding model — semantic search unavailable (text/grep fallback only). Click to fix in Mneme settings."*; not running: *"Mneme is enabled but not running."*
   - `onClick` → `pagesModel.showMnemeConfigPage()`.
10. Place it **next to** the MCP indicator. The current `.mcp-indicator` is `position:absolute; bottom:1; right:4`. Wrap both in a flex row container (`.status-indicators`, absolute bottom-right, `gap`) so Mneme sits to the left of MCP without overlap; move the existing MCP span inside it. Styles mirror `.mcp-indicator`.

The editor's **status header** mirrors the same health: when `running && !modelReady` it shows a warning row (warning `Dot` + *"No embedding model — semantic search is disabled; results fall back to text. Update the model below."*) with the **Model** tab's `Update model` action as the fix. The Model tab shows the full per-file status from `wiki_status.model`.

### Part D — icon

11. Add a `MemoryIcon` (a memory-chip glyph, `0 0 48 48` viewBox, `currentColor`) to `src/renderer/theme/icons.tsx`, used by the tab via `getIcon()` and the sidebar Tools entry. The header indicator uses a coloured CSS dot, not this icon.

### Part E — dashboard / docs

12. Link this doc in `doc/active-work.md` (under EPIC-032) and in the epic's Linked Tasks table (status → keep `Planned` until implemented). Review/docs deferred per the epic model.

## Proposed editor mockup (for review)

Running, **Roots** tab:
```
┌─ Mneme ──────────────────────────────────────────────────────────[x]─┐
│  ● Connected   http://localhost:7700/mcp      [↻ Refresh] [Reindex all]│
│  Model: gte-multilingual-base · int8 · ready                          │
│ ──────────────────────────────────────────────────────────────────── │
│  [ Roots ]   Index    Model                                           │
│ ──────────────────────────────────────────────────────────────────── │
│  Roots                                                  [ + Add root ] │
│ ┌────────────────────────────────────────────────────────────────────┐│
│ │ ● personal    C:\Users\…\notes               128 docs    4.2 MB     ││
│ │   index: gte-multilingual-base-int8 · v2                            ││
│ │   ▓▓▓▓▓▓▓▓░░░░░░  embedding 64/128       [Cancel]                    ││  ← only while reindexing
│ │                                          [Reindex] [Remove]         ││
│ ├────────────────────────────────────────────────────────────────────┤│
│ │ ● work        D:\work\kb                       53 docs    1.1 MB    ││
│ │   index: gte-multilingual-base-int8 · v2 [Reindex] [Remove]         ││
│ └────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────┘
```

Not running:
```
│  ○ Not running                                                        │
│  Mneme is disabled or not started.                  [ Open Settings ] │
```

**Index** tab (stale-DB cleanup — stale rows from an `app.fs` walk):
```
│  Index inventory                                                      │
│  personal — C:\Users\…\notes\.mneme                                   │
│    ● gte-multilingual-base-int8 / v2      4.2 MB   (active)           │
│      gte-multilingual-base-int8 / v1      3.9 MB           [ Delete ] │
│  work — D:\work\kb\.mneme                                             │
│    ● gte-multilingual-base-int8 / v2      1.1 MB   (active)           │
```

**Model** tab:
```
│  Embedding model                                       [ Update model ]│
│  gte-multilingual-base · int8 · v1                       ● ready       │
│  Cache: C:\Users\…\data\mneme\models\gte-multilingual-base-int8-v1     │
│ ┌────────────────────────────────────────────────────────────────────┐│
│ │ model.onnx          present ✓   verified ✓     324.0 MB             ││
│ │ tokenizer.json      present ✓   verified ✓      17.0 MB             ││
│ └────────────────────────────────────────────────────────────────────┘│
```

Editor status header — **model-warning** variant (running but no working model):
```
│  ● Connected   http://localhost:7700/mcp      [↻ Refresh] [Reindex all]│
│  ⚠ No embedding model — semantic search disabled; results fall back to │
│    text. Update the model in the Model tab.                            │
```

**Model** tab — **not-ready** variant:
```
│  Embedding model                                       [ Update model ]│
│  gte-multilingual-base · int8 · v1                    ⚠ not loaded     │
│  Cache: C:\Users\…\data\mneme\models\gte-multilingual-base-int8-v1     │
│ ┌────────────────────────────────────────────────────────────────────┐│
│ │ model.onnx          present ✓   verified ✗       (0 B)              ││
│ │ tokenizer.json      missing                                         ││
│ └────────────────────────────────────────────────────────────────────┘│
```

Header indicator (bottom-right of the title bar, Mneme left of MCP; shown only when enabled). Dot colour encodes health:
```
                                       … [ _ ] [ ▭ ] [ x ]
                                              ● Mneme   ● MCP     ● = green:  running + model ready
                                              ⚠ Mneme   ● MCP     ⚠ = yellow: running, no model (warning)
                                              ○ Mneme   ● MCP     ○ = grey:   enabled, not running
                                          (hidden)      ● MCP     hidden:     disabled in settings
```

## Concerns / open questions (with proposed resolutions)

1. **include/ignore config — RESOLVED (split into US-668).** Mneme exposes no MCP read or write for per-root `include`/`ignore` today (they live only in `mneme.toml`, read at startup/add). **Decision:** add the missing surface in the predecessor Rust task **US-668** (`wiki_root_config { root, include?, ignore? }` — GET when both omitted, SET + live re-apply + reconcile otherwise), implemented and verified first. This editor then adds a per-root **Filters** section that calls `wiki_root_config` to read on load and save edits (see RootsPanel step 3). No Rust changes live in US-664 itself.
2. **`wiki_model_update` is synchronous with no progress** and can run for minutes (first download). Proposed: a blocking `showProgress(...)` overlay with an indeterminate bar and explanatory text ("Updating model — this may take several minutes…"); the call resolves with the final `ModelStatus`. Acceptable because real first-download wiring is US-665; here it's mostly verify/re-download. (A future Mneme change could add progress notifications.)
3. **Stale-DB enumeration via `app.fs`**, not MCP. Proposed: walk `{folder}/.mneme/` (folder from `wiki_status`), list `*/index-v*.db`, mark the one equal to `indexPath` as active, derive `modelId` from the subdir name and `schemaVer` from the filename, delete via `wiki_index_delete`. Low risk (local FS, well-defined layout). With one model and schema v2, stale DBs are currently rare — acceptable if this sub-feature is the last to land.
4. **`wiki_add_root` blocks on reconcile** (large folder = slow). Proposed: run inside `showProgress` so the UI shows a wait state; success/error via toast.
5. **Second MCP client to Mneme.** The editor opens its own `McpConnectionManager` connection (besides any future `MnemeProvider`). Fine — Mneme is 1-to-many over loopback HTTP by design. Reconnect on `eMnemeStatusChanged`; tolerate not-running.
6. **Editor layout: tabs vs single scroll.** Proposed `SegmentedControl` tabs (Roots / Index / Model) + persistent status header. Alternative: one scrollable column with section headers. Tabs chosen to keep each concern focused; easy to switch if you prefer scroll.
7. **Header indicator visibility, colour & placement.** Per your spec: visible iff `mneme.enabled` (hidden when disabled). Dot colour is **tri-state**: green = running + model ready, **yellow/warning = running without a working model** (degraded to text/grep — Mneme not doing its job), grey = enabled but not running. Placed in a flex container alongside the existing MCP indicator (left of MCP). Click → open this editor.
8. **Model-health signal: `complete` vs actual runtime load.** `modelReady` derives from `wiki_status.model.complete` (files present + sha256-verified) — which is exactly what Mneme's embedder gates on before loading, so it's the right primary signal and catches the dominant cases (no model provisioned, missing/corrupt files). **Edge it doesn't catch:** files complete on disk but the ORT/DirectML session fails to build at runtime → `complete` is still true. Two mitigations, in order of preference:
   - **(now, opportunistic)** `wiki_search` already returns a `note` when a vector/hybrid query degraded to text because the model was unavailable — a true *runtime* signal. The shared status model can treat a degrade-note seen during normal use as `modelReady = false` even when `complete` is true.
   - **(optional follow-up)** a tiny Mneme change to surface the embedder's real availability (`emb.available()`) as a `model.loaded` field in `wiki_status` for a precise runtime signal. Carve as a small `US-66x` like US-668 only if the edge case proves to matter; not required for v1. **Recommendation:** ship with `complete` as the signal now; revisit only if a "complete but won't load" case is observed.

## Acceptance criteria

- [ ] A "Mneme" editor opens as a singleton page (sidebar Tools entry and/or header indicator).
- [ ] When Mneme is running, the editor connects over loopback HTTP and shows status (connection dot, URL, model summary) from `wiki_status`.
- [ ] When Mneme is not running, the editor shows a clear not-running state with an Open Settings action.
- [ ] Add root (folder + optional name) / remove root / list roots all work and refresh the view; errors surface as toasts.
- [ ] Reindex (per-root and all) shows a **live progress bar** driven by MCP progress notifications, with Cancel; final summary toast.
- [ ] Index inventory lists active + stale versioned DBs per root; deleting a stale DB works and refuses the active one.
- [ ] Model section shows model identity, cache dir, completeness, and per-file present/verified/size; Update model works (with a wait overlay).
- [ ] Header indicator is visible only when `mneme.enabled`, opens the editor on click, sits next to the MCP indicator without overlap, and its dot is **tri-state**: green (running + model ready), **yellow/warning (running + no working model)**, grey (enabled + not running).
- [ ] The yellow/warning state appears when `wiki_status.model` is absent or `complete === false`, and clears (turns green) after a successful `Update model`; the editor's status header shows the matching warning + a fix action.
- [ ] Per-root Filters section reads `include`/`ignore` and saves edits via `wiki_root_config` (US-668); a save re-applies filters and the view reflects the new doc count.

## Implementation notes (2026-06-14)

Built per the plan. Deviations / decisions worth recording:
- **Open path** uses `editorRegistry.createEditor("mneme-config")` + a fixed `PageModel(MNEME_CONFIG_PAGE_ID)` in `showMnemeConfigPage` (dedup happens in `addPage` via `findPage(page.id)`) — avoids the legacy `newEmptyEditorModel`/`default`-export indirection that `showSettingsPage` carries. `MNEME_CONFIG_PAGE_ID` is exported from `editors/mneme-config/index.tsx`.
- **`parseToolResult<T>(result: unknown)`** (in `mnemeTypes.ts`) prefers `structuredContent`, falls back to the text block. Typed `unknown` because the SDK's `callTool` return is a union of the structured-content result and the legacy `{ toolResult }` shape.
- **Reindex progress/cancel** via `client.callTool(params, undefined, { signal, onprogress })`; the `onprogress` message `"{root}: {phase}"` is parsed to key per-root progress; Cancel calls `AbortController.abort()`.
- **`getRestoreData()` override** resets transient fields (connection, status snapshot, in-flight reindex progress) so a restored page never shows phantom state — the page is in `NO_HOST_EDITOR_IDS`, so its state is persisted.
- **Sidebar Tools entry** added (`id: "mneme-config"`, label "Mneme") for discoverability when the header indicator is hidden (Mneme disabled).
- **Concern 8** shipped with `wiki_status.model.complete` as the `modelReady` signal (the documented v1 choice). The opportunistic `wiki_search` degrade-note runtime signal is **not** wired yet — revisit only if a "complete on disk but won't load at runtime" case is observed.
- **Editor `type`/`editor` discriminants** registered: `"mnemeConfigPage"` in `src/shared/types.ts` `EditorType`; `"mneme-config"` in `src/renderer/api/types/common.d.ts` `EditorView`.

Verified: `tsc --noEmit` and `eslint` clean. Manual/runtime testing pending.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | **new** — editor model + tool orchestration |
| `src/renderer/editors/mneme-config/MnemeConfigView.tsx` | **new** — root view + status header + tabs |
| `src/renderer/editors/mneme-config/RootsPanel.tsx` | **new** — roots list, add/remove, per-root reindex + progress |
| `src/renderer/editors/mneme-config/IndexPanel.tsx` | **new** — index inventory + stale-DB delete |
| `src/renderer/editors/mneme-config/ModelPanel.tsx` | **new** — model status + update |
| `src/renderer/editors/mneme-config/index.tsx` | **new** — `EditorModule` export |
| `src/renderer/editors/register-editors.ts` | register `mneme-config` |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | add `mneme-config` to `NO_HOST_EDITOR_IDS` |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `showMnemeConfigPage()` (singleton) |
| `src/renderer/api/pages/PagesModel.ts` | surface `showMnemeConfigPage` |
| `src/renderer/api/mneme-status.ts` | **new** — shared `mnemeStatusModel` singleton: `{ enabled, running, modelReady }` via MCP `wiki_status` probe; drives the indicator colour |
| `src/renderer/api/app.ts` | initialize `mnemeStatusModel` at startup (alongside existing mneme event/auto-start wiring) |
| `src/renderer/ui/app/MainPage.tsx` | `MnemeIndicator` (tri-state colour from `mnemeStatusModel`) + status-indicators container |
| `src/renderer/theme/icons.tsx` | `MemoryIcon` (memory-chip glyph) |
| `src/renderer/ui/sidebar/tools-editors-registry.ts` | (optional) Tools entry |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | (optional) script API |
| `doc/active-work.md`, `doc/epics/EPIC-032.md` | link this task |

### Files needing NO change
- `src/renderer/editors/mcp-inspector/McpConnectionManager.ts` — reused as-is (progress via `callTool` options at the call site).
- `mneme/` (Rust) — **no change in US-664**; the `wiki_root_config` tool it consumes is delivered by the predecessor **US-668**.
- `src/ipc/*` — `getMnemeStatus` / `eMnemeStatusChanged` already exist (US-660).
