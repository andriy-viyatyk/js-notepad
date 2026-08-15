# Persephone — Refactoring & Restructuring Report

> Generated 2026-08-15. Five parallel deep-analysis passes over `src/` (pages/API core, editors,
> Electron main process, UI layers, scripting/content/automation), each checked against the
> documented standards in `doc/standards/` (model-view pattern, uikit/components split,
> editor guide, coding style). Key claims were spot-verified against the source.
>
> Overall verdict: **the codebase is in better shape than feared.** TODO/FIXME debt is near zero
> (2 markers in ~104k lines), there is exactly one shared `debounce` used consistently, the state
> primitives are clean, and explanatory comments are rich. The debt is concentrated in a handful
> of predictable places: copy-pasted lifecycle plumbing across editors, a few genuine god classes
> that grew feature-by-feature, and boundary erosion (uikit importing app code, a components ⇄
> editors cycle).

---

## Executive summary — the 10 findings that matter most

| # | Finding | Where | Size | Risk to fix |
|---|---------|-------|------|-------------|
| 1 | **Host-adoption lifecycle copy-pasted into 16 editors** (`switchFrom`, `restore`, `getRestoreData`, `applyRestoreData`, `confirmRelease`, `saveState`, trait registration — mostly byte-identical) | `editors/*/` | ~1,300 dup lines | Low (mechanical) |
| 2 | **`PagesLifecycleModel` is the clearest god object** — 11 responsibilities incl. a 15-branch editor-construction block and a 9-case dynamic-import switch that both duplicate the editor registry | `api/pages/PagesLifecycleModel.ts` | 1,422 lines | Medium |
| 3 | **Correctness defect: the `PagesModel` façade silently drops navigation options** — `navigatePageTo` declares only 4 of the 11 options the lifecycle method accepts (`PagesModel.ts:230-239`) | `api/pages/PagesModel.ts` | — | Very low |
| 4 | **`mcp-handler.ts` mixes 7 unrelated domains** behind one RPC switch; `mcp-http-server.ts` (main) has a **714-line `createMcpServer`** where ~30 of 34 tools are pure data | renderer `api/mcp-handler.ts` (970), main `mcp-http-server.ts` (1,119) | ~2,100 lines | Low (mechanical split) |
| 5 | **~370 lines duplicated between `TreeProviderViewModel` and `CategoryViewModel`** (CRUD dialogs, context menus, drop dispatch — some blocks byte-identical except `node.data.href` vs `item.href`) | `components/tree-provider/` | ~370 dup lines | Low |
| 6 | **uikit import-boundary violations** — 4 runtime edges into `api/`/`ui/` (worst: AVGrid's `ContextMenuModel` imports `ui/dialogs`); no ESLint enforcement exists, so it will keep eroding | `uikit/` | 4 runtime + ~34 story files | Low |
| 7 | **Confirmed module cycle: `components/tree-provider` ⇄ `editors/link-editor`** (via `favicon-cache`, `TreeProviderItemIcon`, `LinksList`/`LinksTiles`, `LINK` trait) | components/editors | — | Medium |
| 8 | **Main-loop blocking work** — sync moov-atom read + patch of whole MP4 index on open (`video-stream-server.ts:325-487`), cheerio full-page parse in an IPC handler (`browser-service.ts:513`), `showMessageBoxSync`, sync guide-file reads per MCP call | `src/main/` | — | Medium |
| 9 | **`ipc/main/controller.ts` is a 90-endpoint monolith** with 90 hand-written bind lines; adding one endpoint touches 5 files. Other services already use the better per-service `initXHandlers` convention — two competing conventions coexist | `ipc/main/controller.ts` (615) | — | Low |
| 10 | **`GraphEditor.ts` (1,855 lines, ~95 members) is a lift-and-shift never decomposed** — the file says so itself ("methods relocated byte-for-byte from legacy GraphViewModel"); 186-line `groupSelectedNodes` with 3 copies of the centroid loop | `editors/graph/GraphEditor.ts` | 1,855 lines | Medium |

Estimated total removable duplication from items 1, 4, 5 plus the smaller sweeps below: **~4,000–4,500 lines**, most of it mechanical.

---

## Part 1 — Cross-cutting themes (generalize into services/base classes)

### 1.1 `TextHostEditorModel` base class — the single biggest win — ✅ DONE (US-948, 2026-08-15)

**✅ Outcome:** `editors/base/TextHostEditorModel.ts` (~330 lines) extending `EditorModel`;
**14** editors migrated (not 16 — `BoardContentEditorModel` extends `BoardEditorModel`, and
`BoardInfoEditorModel` deliberately deviates: optional host, tolerant `switchFrom`, no host
editor stamp; both keep their own plumbing). −2,904/+395 lines across the editors, net ≈
−2,180 — better than the ~1,300 estimate. Hooks as recommended plus: `displayName`,
`onHostAttached` (switch/restore-only initial load — preserves `attachEditorToPage`'s
bare-adoptHost contract), `onHostExtracted`, `untitledName`; helpers `writeToHost` /
`subscribeHostContent` (the skipNextContentUpdate guard) and `mirrorHostSettings` (the
recommended `mirrorHostSetting`). A single host-subscription registry fixed two latent
leaks (FileDiff gitRepo sub on switch-away; LogView unsub nulling). Grid keeps its own
string-compare content guard (different skip semantics by design).

Sixteen editors (verified: monaco, grid, markdown, mermaid, svg, html, graph, link-editor,
notebook, rest-client, draw, env-vars, file-diff, log-view, board, board-info) independently
reimplement the same host plumbing. `switchFrom(oldEditor)` is byte-identical except the class
name in the error string; `confirmRelease()` is 16 identical one-liners; `getRestoreData()` /
`applyRestoreData()` / `getNavigatorTarget()` / `findCompatibleEditors()` are verbatim copies.

**Recommendation:** `editors/base/TextHostEditorModel.ts` extending `EditorModel`, owning
`_host`, `_pendingHost`, subscriptions, `CONTENT_HOST_TRAIT` registration, and final
implementations of the lifecycle methods. Subclasses override two hooks:

```ts
protected onHostAdopted(host: TextFileModel): void
protected onHostContentChanged(content: string): void
```

Also lift into the base:
- the `skipNextContentUpdate` write-guard (duplicated in `GraphEditor.ts:336-345`,
  `RestClientEditor.ts:276-285`, others) as `protected writeToHost(content)`
- the "seed from `host.getEditorState(editorId)` + mirror-back" pattern as
  `protected mirrorHostSetting(key, selector)`

**Impact:** ~1,300 lines removed; a lifecycle bug becomes one fix instead of sixteen.
**Do this first** — it also shrinks every god editor before their own decomposition starts.

### 1.2 Editor construction must be registry-driven (kills two parallel registries) — ✅ DONE (US-949, 2026-08-15)

`PagesLifecycleModel.attachEditorToPage` (lines 67–241) is 15 near-identical
`if (isTextFile && targetEditorId === "…")` blocks, each doing
`new XEditor(new TComponentState({...defaultXState, id})); x.adoptHost(legacy)`.
`buildEditorById` (272–348) contains a 9-case switch of dynamic imports.
**Both duplicate what `editorRegistry` already does** (`loadModule`/`createEditor`, cached),
and require 15 static editor imports in a startup-path module — directly violating the
"dynamic imports for editors" standard in CLAUDE.md.

**Recommendation:** add `adoptHost` + optional `bootstrapFromHost` to the editor module
contract; replace the whole block with
`const editor = await editorRegistry.createEditor(id); editor.adoptHost(host);`.
Note `attachEditorToPage` is synchronous today — going async ripples into ~15 call sites, so
either pre-load modules or stage the change.

Similarly, `register-editors.ts` (506 lines) is a hand-unrolled table: ~25 near-identical
`editorRegistry.register({...})` blocks differing in three strings. Table-drive it
(`const EDITORS: [id, name, importer][]` + loop, keeping Monaco's custom `accepts` as the one
explicit exception) → ~120 lines, code splitting preserved.

**✅ Outcome (US-949, commit f88590ff; 31 files, +322/−1,303).** Went further than the
recommendation — the legacy module system died entirely:

- `attachEditorToPage` stayed **sync** (it sits under the sync scripting APIs `addEditorPage` /
  `openLinks` / `page.grouped`): construction goes through a new
  `editorRegistry.createEditorSync(id, hostId)` against the module cache, warmed by
  `preloadContentHostModules()` at the end of registration. Monaco remains the one static
  import — the startup empty page and `requireGroupedText` build it before preload can be
  assumed complete. The per-editor bootstrap blocks were already duplicates of each editor's
  `onHostAttached` (§1.1), exposed via a public `bootstrapFromHost()` bridge.
- `buildEditorById`'s switch became optional `newEditorModel?(filePath)` on the registry
  `EditorModule`, implemented by the eight file-open standalone modules (bodies moved verbatim
  into the barrels). `board-info` deliberately got none (never a file-open target).
- The legacy `editors/types.ts` module system is gone: all 14 `newEditorModelFromState`
  implementations were **unreachable** (restore has been registry-driven since EPIC-031), the
  six `showX` pages use plain `editorRegistry.createEditor(id)` (the `EditorType` guard could
  never fire), the browser legacy module had zero importers. Only `FileEditorComponent` +
  `EditorViewModule` survive (AsyncEditor/RenderEditor).
- `register-editors.ts`: 507 → ~230 lines, table + loop; `match` derives from
  `EDITOR_MATCHERS[id]`, `accepts` defaults to `makeAccepts(match)`/`-1`; monaco + file-diff
  keep explicit `accepts`; row order preserved (breaks `resolveForFile` ties).
- Known accepted edge: a sync `addEditorPage("draw-view")` in the few-chunk-loads window
  between launch and preload completion throws a descriptive "module not loaded yet" error.
- Still statically importing editor classes (for `instanceof` only): scripting `PageWrapper`
  facades, `mcp-handler`, `BrowserBookmarks` (sync-constructs `LinkEditor` — documented
  exception).

### 1.3 Error-handling helpers (24+ hand-rolled copies) — ✅ DONE (US-950, 2026-08-15)

✅ **Outcome (US-950; 58 files).** The count was low: **114 occurrences in 60 files**, six
dialects. `errMessage(e, fallback?)` landed in `src/shared/utils.ts` (main + renderer + board
shim; dependency-free so the shim's IIFE can bundle it) and checks for a string `.message`
*before* `String(e)` rather than leading with `instanceof Error` — IPC/JSON-RPC errors arrive
prototype-less but carry a real message, so the naive helper would have regressed ~15 defensive
sites to `"[object Object]"`. `guard(label, fn, level?)` landed in `renderer/core/utils/guard.ts`
and was adopted at 13 sites only — strictly where the catch body was *exactly* a notify.
`mutation()` is private to `git-service.ts` (7 ops). One deliberate hold-out:
`worker-host.ts:119` lives inside the `WORKER_CODE` template literal and has no host imports.
Behavior change accepted: git strings lose the `"Error: "` prefix.



- `err instanceof Error ? err.message : String(err)` appears **24 times in 23 files**; some
  variants use the unsafe `(err as Error).message` cast.
- `RendererEventsService.ts:42-112` has nine handlers that are all
  `try { ... } catch { ui.notify(\`Failed to …\`, "error") }`.
- `git-service.ts` (main) repeats `try {...} catch (e) { return { ok:false, error:String(e) } }`
  ~15 times.

**Recommendation:** add to `core/utils/`:
```ts
export const errMessage = (e: unknown, fallback = "Unexpected error"): string => ...
export async function guard<T>(label: string, fn: () => T | Promise<T>,
    level: "error" | "warning" = "error"): Promise<T | undefined>
```
plus a `mutation()` wrapper in `git-service.ts`.

### 1.4 JSON-parse-with-fallback — ✅ DONE (US-946, 2026-08-15)

`core/utils/parse-utils.ts:30` exports `parseObject(value, onError?)` — essentially nobody uses
it. ~25 sites hand-roll `try { JSON.parse } catch { return null|{}|default }`
(`content/*-link.ts` ×4, `board-manifest.ts:157`, `NoteItemEditModel.ts:336`,
`tools-manifest.ts:95`, `mcp-handler.ts:576`, …).

**Recommendation:** add typed `tryParseJson<T>(text, fallback: T): T`, sweep the sites, and
add `parseJsonContent<T>(content): { data?: T; error?: string }` in `editors/base/` for the
6 editors that do "parse content → write error into state".

**✅ Outcome.** `tryParseJson<T>(text, fallback)` added to `core/utils/parse-utils.ts` — it also
treats absent/blank text as the fallback, subsuming the `content.trim() ? JSON.parse(content) : {}`
idiom. Swept **9 sites across 8 files**: `core/traits/dnd.ts`, `api/board-install-registry.ts`,
`editors/mneme-config/mnemeTypes.ts`, `editors/notebook/NotebookEditor.ts`,
`editors/notebook/note-editor/NoteItemEditModel.ts`,
`editors/mcp-inspector/McpInspectorEditorModel.ts`, and three JSONL parsers in
`editors/log-view/LogViewEditor.ts`. Typecheck + lint clean.

**⚠️ The "~25 sites" estimate was wrong — it over-counted.** The rule that actually holds:
*convert only where the `try`/`catch` exists solely for the parse.* Three groups were correctly
excluded and remain as-is:

- **Six sites where the `try` also wraps file I/O** (`board-manifest.ts`, `tools-manifest.ts`,
  `FolderViewModeService.ts`, `McpConnectionStore.ts`, `drawLibrary.ts`, `themes/index.ts`) —
  converting would not remove the `try`, so it buys nothing. These six are all "read a data file
  → parse → fall back", which is a **separate duplication deserving its own `readJsonDataFile`
  helper** — a better follow-up than forcing `tryParseJson` onto them.
- **Sites that need the error, not a fallback** — `LogViewEditor`'s content loader and
  `GridEditor.parseJsonl` build user-facing `Line N: <message>` errors; `BoardEnvStore` returns
  the message as an error status; `mcp-handler.ts:576` returns a specific MCP error.
- **The four base64 link schemes** — their `try` covers `atob` as well as `JSON.parse`, and
  `atob` throws on malformed input, so a bare `tryParseJson` would let that escape. They belong
  to the `createLinkScheme` factory below, which wraps both together.

**Still outstanding from this item:** the `parseJsonContent<T>` helper in `editors/base/` for the
6 editors that write a parse error into state.

Related: the four base64-JSON link-scheme modules
(`persephone-toolset-link.ts`, `persephone-board-link.ts`, `git-tree-link.ts`,
`mneme-folder-link.ts`) are 4 copies of the same encode/decode/validate shape — one
`createLinkScheme<T>(prefix, validate)` factory reduces each to ~8 lines.

### 1.5 `SidecarProcess` — tor-service and mneme-service are the same class written twice — ✅ DONE (US-947, 2026-08-15)

Both implement: in-flight start dedupe, spawn with failure message, readiness sentinel scraped
from stdout (`"Bootstrapped 100%"` vs `"listening on"`), readiness timeout, line logging,
stale-child guard on `close`, status broadcast on unexpected death, `stopAndWait` with 5s cap,
`restart`. Extract `src/main/sidecar-process.ts` taking
`{ exe, args, readinessPattern, timeoutMs, onLog, onStatus }` (~200 lines removed, and the
subtle stale-child guard gets one implementation).

**✅ Outcome:** `src/main/sidecar-process.ts` — a `SidecarProcess` class configured via
`{ name, isReady, readinessTimeoutMs, timeoutMessage?, exitTimeoutMs?, log, onReady?, onUnexpectedExit? }`
plus per-call `(exe, args, spawnOptions?)`. tor-service went 583 → 405 lines (keeps
partitions/proxy/torrc/checkIp), mneme-service 212 → 134 (keeps port/config/URL/status shape).
Restart registers its pending promise synchronously, so concurrent restarts join one attempt.
Three bounded micro-differences accepted: a restart *joiner* may resolve before the initiator
re-applies proxies (initiator still does both); Mneme's timeout log/error unified into one
string, Tor keeps its exact text via `timeoutMessage`; Mneme gained the exit-wait log,
`clearTimeout`, and the `exit`-event listener Tor already had.

### 1.6 Shared `ExecuteHandle` — three copies of one state machine — ✅ DONE (US-951, 2026-08-15)

`board-shim.ts:1001-1199` and `renderer/api/proc.ts:98-352` implement the same
`idle/buffered/streaming` state machine with identical helpers (`concat`, `lastMatch`) and
identical error text; `api/tools/tool-executor.ts` holds a third partial copy.
Extract `src/shared/execute-handle.ts` parameterized by a transport (`post`/`onMessage`).

**✅ Outcome (US-951):** two full copies, not three — `tool-executor.ts` only duplicated `concat`
(now `concatChunks` in `shared/utils.ts`). `src/shared/execute-handle.ts` owns `RunnerError`,
`lastMatch`, `ExecuteTransport` and `createExecuteHandle`; `proc.ts` 353 → 86 lines (keeps the
drift guard), `board-shim.ts` −240. Net −190 lines. Added `RunnerOutbound*`/`RunnerInbound*`
unions to `runner-channels.ts` so the transport is typed by protocol direction — otherwise the
shim needed an `as BoardToMain` cast that would hide the very mismatch the contract catches.
One behavior change: a board's `getJson()` rejection is now a `RunnerError` (`name` changes,
`message`/`exitCode`/`stderr` do not). Shim reverified as a self-contained IIFE.

### 1.7 Taxonomy filter model — LinkEditor ⇄ NotebookEditor (~350 lines)

`loadTags`, `loadCategories`, `applyFilters` (incl. the `searchExtended` incremental
optimization), `moveCategory`, and the search/tag/category setters are near-verbatim between
`LinkEditor.ts` and `NotebookEditor.ts` — diffs show only `links`/`notes` identifier renames.
Extract `editors/shared/TaxonomyFilterModel<T extends { category?; tags? }>` as a composed
sub-model parameterized by an item accessor + `getSearchableText`.

---

## Part 2 — God classes / god modules (decompose)

### 2.1 `api/pages/PagesLifecycleModel.ts` (1,422) — 11 responsibilities — ✅ DONE (US-952, 2026-08-15)

**✅ Outcome (US-952):** 1,233 (post-US-949/950 size) → 845 lines. `showBrowserPage`/`openUrlInBrowserTab`
→ `editors/browser/browser-pages.ts` (removed the static `BrowserEditor` import — the ONLY value import
of the browser chunk in startup code; prod build confirms browser code is now in lazy chunks).
`navigatePageTo` → `api/pages/PageNavigator.ts` as named steps, logic byte-identical. `openLinks`
normalization → `link-editor/link-open.ts` (NOT linkTypes.ts — its linkTraits side-effect import would
be pulled into startup by the sync API); Excalidraw JSON → `drawExport.buildExcalidrawJsonFromDataUrl`.
Six `show*Page` singletons → one `showEditorPage` helper (helper, not a separate service — the wrap()
calls were identity no-ops; McpInspector stays custom). `sendOpenRawLink` dedupes 4 dispatch copies;
`PagesQueryModel.findPageByFilePath` replaces the 5 scans; dead `withFreshEditorId` + the zero-importer
`isTextFileModel` re-export deleted. Bonus: the Phase-0 item-2 façade fix (PagesModel.navigatePageTo now
takes the shared `NavigatePageToOptions` instead of typing away 7 options). Review: no concerns.
Untested at close: navigation edge cases (US-617/637/808/901) + Tor open need a manual pass.

Beyond §1.2, the misplaced concerns worth relocating:

| Code | Belongs in |
|---|---|
| `showBrowserPage` (Tor gating/proxy sequencing, 1173–1253) + `openUrlInBrowserTab` (1332–1417) | `editors/browser/` — also removes the static `BrowserEditor` import that `mcp-handler.ts` warns must not be startup-loaded |
| 7 near-identical `show*Page` singletons (About/Settings/MnemeConfig/Storybook/ToolsHub/Video/McpInspector) | one table-driven `WellKnownPageService` |
| `openLinks` link normalization, `addDrawPage` Excalidraw JSON | `editors/link-editor/`, `editors/draw/` |
| `navigatePageTo` (191 lines, 6 sequential concerns) | a `PageNavigator` with named steps; carries documented edge cases (US-617/637/808/901) — needs a regression pass |

Small but real: `handleOpenUrl` / `handleExternalUrl` / `app.openRawLink` are three copies of
the same 2-line body; `PagesPersistenceModel.withFreshEditorId` is dead code while
`duplicatePage` inlines its logic; "find page by main-editor filePath" appears 5× across the
folder (add `PagesQueryModel.findPageByFilePath`).

### 2.2 `api/pages/PageModel.ts` (915) — page state + things that aren't — ✅ DONE (US-953, 2026-08-15)

**✅ Outcome (US-953):** `PageModel.ts` 915 → 734 lines. `switchMainEditor` →
`editors/base/editor-switch.ts` (the two duplicated dispose-and-rebuild blocks are one
`rebuildEditorOverFile()` helper; page keeps a dynamic-import delegate). Explorer
auto-provisioning (`toggleNavigator` / `autoInitExplorer` / `explorerRootForPanels`) →
`editors/explorer/page-explorer.ts`. Markdown `_navBack` → `api/pages/NavBackStack.ts`
class. The 4-copy "explicit content-host target wins" predicate is one exported
`isExplicitHostTarget()` in `editorRegistry.ts` (used by PageNavigator + lifecycle
`openFile`; the two switch copies collapsed into the shared rebuild helper). Review: no
concerns. tsc + eslint clean; production build confirms browser chunks stayed lazy.

- `switchMainEditor` (452–581, 130 lines) contains two literally duplicated 18-line
  dispose-and-rebuild blocks (512–537 vs 552–576) and 3 of the file's 4 `import("../pages")`
  child→parent circular imports (one swallows all errors silently). Extract to
  `editors/base/editor-switch.ts`.
- Explorer auto-provisioning (`_autoInitExplorer`, `toggleNavigator`) and the Markdown
  `_navBack` stack are editor concerns parked on the page.
- The "explicit content-host target wins" predicate exists in **4 copies** across
  PageModel and PagesLifecycleModel — extract one helper.

### 2.3 `api/mcp-handler.ts` (970) — split into `api/mcp/`

One file per command group (`page-commands`, `board-commands`, `tool-commands`, `ui-push`,
`request-log`), a `commandRegistry` map replacing the 16-case switch, handler file reduced to
IPC + dispatch (~80 lines). Specific defects to fix on the way:
- `handleUiPush` (487–617): the 31-line `dialogSpecs` table is **rebuilt on every loop
  iteration** — hoist to module scope.
- Browser-page state extraction duplicated verbatim in `getPages` and `getActivePage`;
  page-summary assembly duplicated ×3 (`toPageSummary(page)` helper).
- The hardcoded per-editor `hints` map duplicates knowledge the editor registry should own —
  move to an `EditorDefinition.mcpHint` field.

### 2.4 `main/mcp-http-server.ts` (1,119) — 714-line `createMcpServer` — ✅ DONE (US-954, 2026-08-15)

✅ **Outcome (US-954):** transport file 1,119 → 279 lines with no tool definitions left in it.
Everything the server offers moved to `src/main/mcp/`: tools are `IMcpToolDef` data and one
generic pass-through in `register-tools.ts` implements 30 of the 33 (strip `windowIndex`,
forward under `method ?? name`, map with `toResult ?? toToolResult`); only `list_windows`,
`open_window` and `read_guide` keep handlers. `manifest.ts` holds identity + instructions +
guides, `sdk.ts` the lazy SDK/zod loader, `renderer-bridge.ts` the IPC, `server-factory.ts` the
assembly. The `if (browserToolsEnabled) { … }` sandwich is a list filter; GET and DELETE are one
branch; guides are cached on `mtimeMs` (fresh after an asset edit, no re-read per request).
Tool-name set diffs identical to before; review found no concerns. Not yet exercised against a
running app.

~30 of 34 tools are the identical
`server.tool(name, desc, schema, args => toToolResult(sendToRenderer(method, args)))` shape.
Define tools as data in `src/main/mcp/tools/*.ts` (one module per group), one generic
registrar, instructions/resources in `manifest.ts`, and replace the
`if (browserToolsEnabled) { … } // end browserToolsEnabled` sandwich with a list filter.
Transport file shrinks to ~250 lines. Also: GET and DELETE branches of `handleHttpRequest`
are byte-identical; guide files are `readFileSync`-ed on every request (cache them).

### 2.5 `editors/graph/GraphEditor.ts` (1,855) — decompose along existing sub-model seams — ✅ DONE (US-955, 2026-08-15)

**✅ Outcome (US-955):** `GraphEditor.ts` shrank from 1,667 lines at implementation start to
814. Tooltip timing, hover state and status hints moved to `GraphTooltipModel`; interactive
group creation, membership, reparenting and cleanup moved to `GraphGroupActionsModel`; node
and link mutations, batch updates, deletion, exports and subgraph extraction moved to
`GraphMutationModel`. `GraphEditor` remains responsible for host lifecycle, parsing,
unknown-field-preserving serialization, rebuild orchestration, visibility/search and model
composition. Typecheck, lint and a live dev/HMR graph smoke test passed; review found no
concerns. Architecture documentation now records the extracted ownership boundaries.

Five sub-models already exist (`dataModel`, `groupModel`, `connectivityModel`, `searchModel`,
`visibilityModel`) — the class just never delegated to them:
- Move grouping (340 lines incl. 186-line `groupSelectedNodes` with 3 copies of the centroid
  loop) into `GraphGroupModel`; extract `centroidOf(ids)` + `reparent(ids, groupId)`.
- Move node/link CRUD + subgraph extraction into a `GraphMutationModel`.
- Move the tooltip state machine (3 timers) into a `GraphTooltipModel`.
- Delete the pure delegation methods (~50 lines) — views already reach `editor.dataModel`.
Target ~500 lines. `GraphVisibilityModel` is the exemplar the rest of the folder should copy.

Also in graph: `GraphDetailPanel.tsx` opens with **183 lines of `React.CSSProperties`
constants** and `GraphBody.tsx` with 138 — move to `.styles.ts` files; extract `LinksTab` and
the pure `extractCustomProperties`/`extractMultiProperties` helpers. `ForceGraphRenderer.renderData`
(158 lines) → `drawLinks`/`drawNodes`/`drawBadges`/`drawLabels` (the `drawShape` precedent exists).

### 2.6 `editors/settings/SettingsView.tsx` (1,536) — no model-view split at all — ✅ DONE (US-956, 2026-08-15)

**✅ Outcome (US-956):** `SettingsView.tsx` is now a 98-line page composer. Settings sections
and their stateful behavior moved into `settings/sections/`; `BrowserProfilesSectionModel`,
`McpSectionModel`, and `DefaultBrowserSectionModel` own the asynchronous operations and
external-status state. Theme, file search, and the remaining settings sections are isolated
views. Existing section order, setting keys, persistence, and behavior were preserved.
Typecheck and lint pass; review found no architecture concerns.

`SettingsEditor.ts` is 34 lines; all logic lives in the view: 14 section components each with
their own `useState`/`useEffect` async I/O. `McpSection` (224 lines, 5 useState + 4 useEffect)
and `BrowserProfilesSection` (239 lines) are textbook `TComponentModel` candidates per the
project's own standard. One outright bug-shaped hack: `DefaultBrowserSection:618` uses
`useState(() => { checkStatus(); })` as a mount hook (fires during render) — should be
`useEffect` or a model. Split into `settings/sections/*.tsx` (+3 section models).

### 2.7 ~~`editors/browser/` — good model split, three leaks~~ ✅ done (US-957)

- `BrowserWebviewModel.handleContextMenu` (289–548) is **260 lines** — the longest method in
  the editors layer. Extract `browser/webview-context-menu.ts` section builders.
- `handleBrowserEvent` (187–286): `did-navigate` and `did-navigate-in-page` cases are 85%
  identical — extract `applyNavigation(tabId, data, inPage)`.
- `BrowserEditor.ts` still owns tab management (~210 lines), Tor, bookmarks, favicon cache —
  extract `BrowserTabsModel` and `BrowserTorModel`.

### 2.8 ~~`components/tree-provider/` — two 1,000+-line ViewModels, ~370 lines shared~~ ✅ done (US-958, 2026-08-15)

`TreeProviderViewModel.tsx` (1,339 — grown since last measured) and `CategoryViewModel.tsx`
(1,005). Byte-identical-modulo-accessor pairs: `createNewFile`/`createNewFolder`/`renameItem`/
`deleteItemAction(s)`/`pasteIntoDir`, `getFileMenuItems` (47 lines each, identical except
`node.data.href` vs `item.href`), `getFolderMenuItems` (~80 lines), drop
acceptance/dispatch (CategoryViewModel's own comment says "Ported from
TreeProviderView.canTraitDrop"), and `sameHref`/`normalizeHref` defined **three times** in the
folder. Root cause is mechanical: one works on `TreeProviderNode`, the other on bare
`ITreeProviderItem`.

**Recommendation:** one `getItem(x)` adapter + `refresh()` callback, then shared modules
following the pattern the folder already established (`plural-actions.tsx`,
`tree-drop-actions.ts`): `item-crud-actions.ts`, `item-menus.tsx`, `drop-dispatch.ts`,
`href-utils.ts`. After extraction both models lose their JSX → rename to `.ts` (satisfying the
"1,000-line `.tsx` ViewModel is suspicious" smell — they're `.tsx` only because 17 JSX icon
literals sit inside menu builders).

**✅ Outcome (US-958):** extracted the shared CRUD/dialog operations, context-menu builders,
href comparison helpers, and trait-drop routing into focused tree-provider modules. Both
ViewModels now compose those modules, retain their view-specific selection/refresh/path
responsibilities, and are JSX-free `.ts` implementations (with tiny `.tsx` HMR compatibility
re-export shims for running development sessions). Explorer root protections, Category's
`Open` action, menu ordering, same-provider move guards, cross-provider file/link routing, and
the existing provider contracts are preserved. `npm run typecheck`, `npm run lint`, and
`git diff --check` pass; a fresh dev build confirmed the Explorer tree renders correctly.

### 2.9 `uikit/Tree/TreeModel.ts` (1,123) and friends — ✅ DONE (US-959, 2026-08-15)

Four fused models: selection math, a 115-line `onKeyDown`, drag-and-drop with hover-expand
timer, lazy loading. Extract `TreeDndModel` and `TreeKeyboardHandler` as composed sub-models —
**AVGrid already demonstrates this composition pattern** (`models.focus`/`models.editing`/
`models.contextMenu`); Tree just didn't use it. Also:
- `MultiListBox.tsx` (468, 12 hooks) is the only stateful uikit component without a model —
  exceeds the documented Rule 8 threshold; add `MultiListBoxModel.ts`.
- The drag-enter-counting pattern is duplicated between `TreeModel.ts:619-688` and
  `CategoryViewModel.tsx:430-516` — promote to a `uikit/shared/` primitive (textbook
  "new primitive goes to uikit" case).
- `AVGrid FocusModel.onContentKeyDown` (~180-line switch) → key→handler table.

**✅ Outcome (US-959):** `TreeModel` now coordinates the focused `TreeKeyboardHandler` and
`TreeDndModel` while retaining its public handler surface, lazy loading, and expansion/reveal
APIs. `DragEnterCounter` centralizes nested native drag-enter/leave bookkeeping for Tree and
Category. `MultiListBoxModel` owns controlled filtering, active-row, selection, and select-all
state; `MultiListBox.tsx` is its view. AVGrid focus navigation is a typed key-to-handler table.
The host-settings mirror correctly selects its unfiltered state-subscription overload, restoring
Grid editor opening. Typecheck and lint pass; Tree, Grid, and Explorer behavior were smoke-tested
in the running development build.

### 2.10 `board-shim.ts` (1,548) and `ipc/main/controller.ts` (615)

- board-shim: five `message` listeners each repeating the same 2-line trust gate — one
  `onHostMessage(tag, handler)` registrar; extract the ~420-line context-menu/clipboard widget
  and the console-mirroring block into their own files; `runRpc` and the runner-channel
  dispatch should be typed `Record<Method, handler>` maps (unhandled method becomes a compile
  error).
- controller.ts: 90 endpoints, 90 identical bind lines, ~60 pure pass-throughs. The git block
  alone is 22 methods of the identical `import("git-service"); return fn(...)` shape.
  Adopt the per-service registrar convention that `search-service`/`browser-service`/
  `tor-service`/`worker-host` **already use** (`git-handlers.ts`, `board-handlers.ts`, …);
  `init()` becomes ~8 calls.

---

## Part 3 — Boundary and standards violations

### 3.1 uikit import boundary (no lint enforcement exists → add it)

Runtime violations (ship in the bundle):

| File | Imports | Note |
|---|---|---|
| `uikit/AVGrid/model/ContextMenuModel.tsx:1` | `ui/dialogs/poppers/showPopupMenu` | **only hard uikit→ui edge**; inject a `showMenu` callback instead |
| `uikit/Tree/TreeModel.ts:12`, `uikit/ListBox/ListBoxModel.ts:6` | `api/events/events` | move `ContextMenuEvent` (or a structural interface) into `uikit/shared/` |
| `uikit/Menu/types.ts:1` | re-exports `MenuItem` **defined in `api/`** | invert: define in uikit, re-export from api |

Plus ~34 story files importing `editors/storybook/storyTypes` (move to `core/storybook/` —
fixes all at once), and `theme/icons.tsx:2-3` importing `api/settings` (every uikit component
that uses an icon transitively depends on `api/`).

**First step regardless of anything else:** ESLint `no-restricted-imports` zone for
`uikit/**` (no `api/`, `ui/`, `editors/`, `components/`), grandfathering the 4 cases with
TODO-tagged disables. Without enforcement this erodes again.

### 3.2 The tree-provider ⇄ link-editor cycle

`components/tree-provider` imports `LinksList`/`LinksTiles`/`linkTraits` from
`editors/link-editor`, while six link-editor files import `favicon-cache`/`TreeProviderItemIcon`
back from tree-provider. **Fix in one move:** relocate `favicon-cache.ts` +
`TreeProviderItemIcon.tsx` to a neutral home and `LINK` trait into `core/traits/`; invert the
`LinksList`/`LinksTiles` rendering via a render-prop or registry. Secondary edge:
`components/icons/LanguageIcon.tsx` ⇄ `editors/board/`.

Also: 12 deep imports from `editors/` bypass `components/tree-provider/index.ts` —
`plural-actions` and `favicon-cache` are de-facto public API; export them from the barrel.

### 3.3 Emotion in `editors/` (9 files) and hardcoded colors (8 sites)

Emotion (rule: uikit + ui chrome only): `browser/BookmarksDrawer.tsx`,
`browser/BrowserTabsPanel.tsx`, `browser/BrowserView.tsx`, `explorer/BoardsSecondaryView.tsx`,
`graph/GraphDetailPanel.tsx`, `markdown/MarkdownBlock.tsx`, `monaco/MonacoBody.tsx`,
`shared/BaseImageView.tsx`, `video/VPlayer.tsx`. Most are `styled(Panel)` roots — either
promote a parameterized panel variant into uikit or convert to the CSSProperties-constant
pattern the same folders already use (the mixed convention *inside* `graph/` is the strongest
argument).

Hardcoded colors: `BrowserView.tsx:272` (`#ffffff`), `BookmarksDrawer.tsx:21`,
`BrowserTabsPanel.tsx:82,141-144` (`GROUP_COLORS` raw rgba array duplicating
`theme/palette-colors`), `mermaid/render-mermaid.ts:67,88`, `video/effects/CircularEffect.ts:94`.

### 3.4 Main-loop blocking work (violates the project's own documented rule)

The rule is stated in `search-service.ts:1-12` and coding-style.md; `search-service` +
`worker-host` are the correct model. Violations, worst first:

1. **`video-stream-server.ts:325-487`** — sync read of the entire moov atom (tens of MB for
   long videos) + O(chunk-count) offset patching, on the main loop, reached from IPC. Move the
   faststart builder to a worker (the `eval:true` worker pattern already exists).
2. **`browser-service.ts:513`** — `cheerio.load()` of a full serialized page (plus iframes)
   inside the `collectDom` IPC handler. Do the stitching in-page via `executeJavaScript`, or
   ship to a worker.
3. `browser-service.ts:253-255` — `dialog.showMessageBoxSync` blocks the main loop for as long
   as the user thinks; use the async form.
4. `mcp-http-server.ts:862,884,903` — guide files `readFileSync` per request (line 903 reads
   all 13 and concatenates); cache at first read.
5. `download-service.ts:177-197` — sync manifest write on **every download state change**;
   make async + debounced.
6. Smaller: `board-bridge.ts:266,372` (`appendFileSync` in the port message path — the rest of
   the file already uses `fs.promises`), `window-states.ts:9-21` (N sync reads per
   `list_windows` MCP call), `board-download-service.ts` (sha256 of whole ZIPs on main).

### 3.5 Typing hotspots

One dominant cluster: **AVGrid + grid editor** hold 7 of the top-10 `any` files
(71 occurrences) — all flowing from untyped cell values in `avGridTypes.ts:13`. Fixing the
source type (generic `AVGrid<TRow>` or `unknown` cells) lets the other six shed their casts;
highest-leverage typing fix in the codebase. Separate easy one: `automation/commands.ts` has
`params: any` ×10 with individual eslint-disables — `Record<string, unknown>` + narrowing
(one handler already does it right). `core/utils/html-resources.ts` (14) is an outlier in an
otherwise strict `core/`.

Also worth noting from automation: `browserHover` reuses a JS snippet via
`hoverJs.replace(/this/g, "el")` — a string-rewrite that breaks on any identifier containing
"this"; and `browserNavigate`/`browserNavigateBack` carry two character-identical 30-line
embedded polling scripts (extract `awaitNavigation(target, trigger)`).

### 3.6 Content pipeline — contained drift, three fixes

- **`resolvers.ts:213-269`**: 56-line hardcoded HTTP extension table where ~45 entries are
  `{ editor: "monaco" }`, running parallel to `editorRegistry`'s extension resolution (the
  comments at :323-329 admit the awkwardness). Collapse to a "content vs browser" `Set` + the
  few non-Monaco overrides; delegate the rest to `editorRegistry.resolveId`.
- **`ILinkData`**: 31 optional fields + a hand-maintained `EPHEMERAL_FIELDS` string set + a
  third hand-maintained list in `linkDataToLink` — three lists that must be kept in sync by
  memory. Split the type (`ILinkCore & Partial<ILinkNav> & Partial<ILinkPipeline>`) so
  `cleanForStorage` strips by type membership.
- **`TextFileIOModel`**: primary+cache pipe rebuilt at 4 separate sites, each must remember
  dispose → assign → recreate-cache. Introduce a `PipePair` owner with atomic `setPrimary()`.
  Also `ContentPipe._writeBinary` re-reads the whole source archive on every save of a file
  inside a zip — make `originals` a lazy callback.

### 3.7 Assorted small items

- `PageWrapper` scripting facades: 10× identical 6-line `as*()` blocks + 3× a shorter variant —
  one generic `asEditor(spec)` + table (public methods stay for the `.d.ts` surface).
- `ScriptRunnerBase.wrapScriptWithImplicitReturn`: 4 branches rebuilding the same template;
  `:89` silently swallows expression syntax errors, producing confusing re-reported messages.
- `core/utils/utils.ts` is a grab-bag of 7 unrelated helpers (`withTimeout` next to
  `toClipboard`) — redistribute into the granular files the folder already has.
- `file-path.ts` vs `path-utils.ts`: overlapping path modules with no stated boundary — merge,
  or rename `path-utils.ts` → `link-path-resolution.ts` (what it actually is).
- `fs.ts`: encoding codec (~130 pure lines) → `core/utils/text-encoding.ts`; the archive-path
  dispatch prologue is repeated in **13 methods** (provider polymorphism candidate); dialogs +
  OS-shell methods don't belong on `IFileSystem` (note: script-facing API — needs deprecation
  shims); leftover `console.log("dataPath:", …)` at line 36.
- `PagesModel.openFile` re-implements a different flow than `lifecycle.openFile` under the same
  name — rename one; `resubscribeEditor` is a documented no-op — delete.
- `theme/icons.tsx` (1,583): fine content-wise (data + a 56-line factory), but split into
  domain files behind a barrel, and investigate the `api/settings` import.
- `NotebookEditor`: `updateNoteContent/Language/Editor/Title/Category` are 5 copies of one
  10-line block → `updateNote(id, patch)`.
- Dead code: `PagesPersistenceModel.withFreshEditorId` (no call sites).
- Two CLI-argument parsers for the same open/show/diff vocabulary
  (`main-setup.ts:151-191` vs `pipe-server.ts:16-45`) → one `open-request.ts`.

**Explicitly recommended NO work:** state primitives (`TOneState` etc. — clean), scripting
facade classes (shared constructor shape only, no shared behavior), debounce (one shared impl,
used consistently), TODO triage (nothing to triage), `RenderGrid/renderInfo.ts` (pure geometry,
fine), `monaco-languages.ts` (pure data — at most move it out of `utils/`).

---

## Part 4 — Suggested roadmap

### Phase 0 — guardrails + correctness (days, near-zero risk)
1. ESLint `no-restricted-imports` for `uikit/**` (§3.1).
2. ~~Fix the `navigatePageTo` façade dropping 7 options (`PagesModel.ts:230-239`) — extract
   shared option interfaces used by both façade and lifecycle.~~ ✅ done (US-952 — façade uses
   the shared `NavigatePageToOptions` from `PageNavigator.ts`).
3. Hoist `dialogSpecs` out of the `handleUiPush` loop; fix
   `useState(() => { checkStatus(); })` in SettingsView; async-ify `board-bridge` appendFileSync
   and debounce `download-service.persist()`.
4. ~~`errMessage`/`guard` helpers + sweeps (§1.3).~~ ✅ done (US-950) — with `tryParseJson`
   (§1.4, US-946), Phase 0 item 4 is complete.

### Phase 1 — the big duplication removals (mechanical, low risk)
5. ~~**`TextHostEditorModel` base class** (§1.1) — ~1,300 lines, 16 editors.~~ ✅ done
   (US-948; 14 editors, board editors excluded by design, net ≈ −2,180 lines).
6. ~~tree-provider shared modules (§2.8) — ~370 lines, kills the double-maintenance of file CRUD.~~ ✅ done (US-958).
7. ~~Table-drive `register-editors.ts`~~ ✅ done (US-949) — ~~and the MCP tool catalog (§2.4)~~
   ✅ done (US-954).
8. Split renderer `mcp-handler.ts` into `api/mcp/` (§2.3).
9. `TaxonomyFilterModel` for Link/Notebook (§1.7); ~~`SidecarProcess` (§1.5)~~ ✅ done
   (US-947); ~~shared `ExecuteHandle` (§1.6)~~ ✅ done (US-951); `createLinkScheme` factory.

### Phase 2 — structural (medium risk, do with manual regression testing)
10. ~~Registry-driven editor construction: retire `attachEditorToPage`'s 15-branch block and
    `buildEditorById`'s import switch (§1.2).~~ ✅ done (US-949; legacy module system removed
    entirely, `attachEditorToPage` kept sync via `createEditorSync` + startup preload).
11. Break the tree-provider ⇄ link-editor cycle (§3.2).
12. ~~Decompose `navigatePageTo` (§2.1) and `switchMainEditor` (§2.2)~~ ✅ done
    (US-952 for §2.1, US-953 for §2.2 incl. the rest of that section) — manual
    navigation/switch regression pass still outstanding (these carry
    US-617/637/808/901 edge cases).
13. Main-loop fixes: MP4 faststart → worker; collectDom off cheerio-on-main (§3.4).
14. Group `controller.ts` IPC per service (§2.10).

### Phase 3 — god-class decomposition (schedule deliberately, one at a time)
15. ~~`GraphEditor` → delegate along its existing sub-model seams (§2.5).~~ ✅ done (US-955).
16. ~~`SettingsView` → sections + models (§2.6).~~ ✅ done (US-956).
17. ~~Browser: `webview-context-menu.ts`, `BrowserTabsModel`, `BrowserTorModel` (§2.7).~~ ✅ done (US-957).
18. ~~`TreeModel` → `TreeDndModel` + `TreeKeyboardHandler`; `MultiListBoxModel` (§2.9).~~ ✅ done (US-959).
19. board-shim split; `fs.ts` provider polymorphism + codec extraction.

### Phase 4 — typing
20. AVGrid generic row typing (unlocks 7 files); `commands.ts` params;
    `html-resources.ts`.

---

## Appendix — where each finding came from

Five analysis passes: (A) `api/` + pages, (B) `editors/`, (C) `src/main/` + `ipc/` + shims,
(D) `uikit/` + `components/` + `ui/` + `theme/`, (E) `scripting/` + `content/` + `automation/`
+ `core/` + global scans. Line numbers reflect the source at analysis time and may drift; the
following claims were independently re-verified before writing this report:
- `switchFrom(oldEditor` present in 16 editor files (17 matches incl. the registry base).
- `PagesModel.navigatePageTo` façade declares only `revealLine`/`highlightText`/`fragment`/
  `forceTextEditor` (`PagesModel.ts:230-239`).
- `uikit/AVGrid/model/ContextMenuModel.tsx:1` imports `ui/dialogs/poppers/showPopupMenu`.
- `video-stream-server.ts` uses `fs.openSync`/`fs.readSync` at lines 325/337/396.
