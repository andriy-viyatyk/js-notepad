# US-559: Strangler-fig retirement (EPIC-028 Phase D — cleanup)

**Status:** Investigated 2026-05-27. **PAUSED — blocked on [US-581](../US-581-native-v4-registry/README.md)** (native v4 registry). C559-1's registry fork is resolved by sequencing: US-581 makes the v4 registry self-sufficient first, so US-559 deletes `registry.ts` outright — no fork, no half-alive legacy registry. Resume US-559 only after US-581 lands.

**Walkthrough / concerns input:** EPIC-028 [`EPIC-028.md`](../../epics/EPIC-028.md) Phase D; concern C2 (breaking-change persistence cut-over).

---

## Goal

Retire the strangler-fig scaffolding now that all 24 editors are v4-native. Delete `LegacyEditorAdapter`, the legacy content-view subsystem (`ContentViewModel` / `ContentViewModelHost` / `useContentViewModel` + the 11 preserved legacy `*View.tsx` / `*ViewModel.ts` pairs), the legacy text-editor view stack (`TextEditorView` / `ActiveEditor` / `TextEditor`), the dual-read (v3) persistence path, and the registry mirror loop. Cut persistence over to v4-only with detect-and-skip of pre-v4 session data, and bump the major version (3.0.10 → 4.0.0) for the breaking change.

After this task, every page editor is a v4 `EditorModel`, there is one editor registry, and no `acquireViewModel` / `ContentViewModel` code remains.

---

## Reality vs. epic plan (findings from investigation)

The dashboard one-liner ("delete `LegacyEditorAdapter`; drop dual-read; delete remaining legacy types; delete the 12 preserved view+VM pairs; bump major version") is accurate but **understates two things** that the investigation surfaced:

1. **The legacy `registry.ts` cannot be deleted outright.** It has live, non-scaffolding consumers — the public `app.editors` script API and the notebook note toolbar's editor-switch control both call `editorRegistry.getSwitchOptions` / `resolve`, and `TextFileModel.detectContentEditor` calls `editorRegistry.detectContentEditor`. The v4 `editorRegistry` has **no** `getSwitchOptions` / `resolve` / `detectContentEditor` equivalent. See **C559-1**.

2. **The legacy `EditorModel` base (`editors/base/EditorModel.ts`) now has exactly one subclass: `TextFileModel`** (the content host). It is not "legacy editor" code anymore — it's the host's base class. It must be kept (or re-homed), not deleted. See **C559-2**.

Everything else in the dashboard scope is straightforwardly deletable once two callers are migrated off the legacy path:
- `PageWrapper.asNotebook` — the **last** `acquireViewModel` consumer (`acquireViewModel("notebook-view")`).
- `BrowserWebviewModel`'s "View Source / View Actual DOM / Open SVG in Editor" menu actions — the **last** sites that construct a page editor as `new LegacyEditorAdapter(newTextFileModel(...))` (5 call sites across the context menu + toolbar menu).

---

## Background

### Current strangler topology

```
PageModel.editors[]  ── holds v4 EditorModel instances
   │
   ├─ v4-native editor (Monaco, Grid, …, all 24)           ← the steady state
   └─ LegacyEditorAdapter(legacy EditorModel)              ← scaffolding to delete
        └─ wraps TextFileModel (text) OR a no-host legacy model

RenderEditor(model)
   ├─ model instanceof LegacyEditorAdapter → LegacyAdapterEditor   ← delete branch
   │      ├─ standalone category  → AsyncEditor(legacy page module)
   │      └─ else (text)          → TextEditorView(TextFileModel)  ← legacy text stack
   └─ else → V4NativeEditor(model) → AsyncEditor(v4 module.Component) ← keep
```

`TextEditorView` → `ActiveEditor` → (monaco) `TextEditor` / (other) `AsyncEditor(legacy registry module)` → legacy `*View.tsx` → `useContentViewModel` → `*ViewModel.ts`. This entire chain is reachable **only** through `LegacyEditorAdapter`-wrapped text pages, which after the two caller migrations above are produced nowhere.

### Two registries today

- **Legacy** `src/renderer/editors/registry.ts` — `EditorDefinition` with `category` / `editorType` / `acceptFile` / `validForLanguage` / `switchOption` / `createViewModel`; methods `resolve` / `resolveId` / `getSwitchOptions` / `detectContentEditor` / `loadViewModelFactory`. Populated by `register-editors.ts` (lines ~71–747).
- **v4** `src/renderer/editors/base/v4/editorRegistry.ts` — `EditorDefinition` with single `accepts(input)` predicate + `hasContentHost`; methods `resolveForFile` / `findEditorsAccepting` / `createEditor` / `getModule`. Each migrated editor `register()`s a native module that **overwrites** its mirror-loop entry.

The **mirror loop** (`register-editors.ts` ~790–876) copies every legacy def into the v4 registry. `TEXT_CONTENT_VIEW_BRIDGE_IDS` is now empty (all text editors migrated); the loop is retained only so legacy defs still appear in the v4 registry for any not-yet-overwritten id. Post-migration, every id is overwritten, so the loop is dead scaffolding.

### Remaining legacy consumers — exhaustive inventory

**`LegacyEditorAdapter` references** (`src/renderer/editors/base/v4/LegacyEditorAdapter.ts`, ~349 LOC; exports the class + `deriveEditorId`):
| File | Use | Action |
|------|-----|--------|
| `api/pages/PageModel.ts` | `unwrapAdapter` helper; `instanceof` in `mainEditor` getter + `panelEditors` | Remove unwrap; editors are always v4 |
| `api/pages/PagesLifecycleModel.ts` | `wrapLegacyForPage` fallback `new LegacyEditorAdapter(...)` | Delete `wrapLegacyForPage`; v3 restore goes away |
| `api/pages/PagesPersistenceModel.ts` | `restorePage` legacy fallback + `restoreSidebarLegacy` instantiate adapter | Delete v3 paths |
| `api/pages/PagesQueryModel.ts` | `getTextFileHost` `instanceof` unwrap | Simplify to v4 host lookup |
| `editors/register-editors.ts` | bare-adapter factory in mirror loop | Delete mirror loop |
| `editors/base/v4/PageToolbar.tsx` | `instanceof` legacy changeEditor branch | Delete branch |
| `editors/base/v4/TextChrome.tsx` | `instanceof` portal-slot guards (×2) | Delete branches |
| `editors/base/v4/index.ts` | re-export | Remove export |
| `editors/browser/BrowserWebviewModel.ts` | 5 sites construct adapter for view-source pages | **Migrate to v4 Monaco** (see Phase 1) |
| `scripting/api-wrapper/PageWrapper.ts` | imports `deriveEditorId` only | Remove import + its uses |
| `ui/app/RenderEditor.tsx` | `instanceof` → `LegacyAdapterEditor` | Delete legacy branch + component |

**`acquireViewModel*` consumers** (after the rest of EPIC-028):
- `scripting/api-wrapper/PageWrapper.ts:~205` — `asNotebook` → `acquireViewModel("notebook-view")`. **Only one left.** Migrate to v4 `NotebookEditor` (mirror `asTodo`/`asLink`).
- `editors/text/TextEditorModel.ts:~61–95` — `_vmHost` + `acquireViewModel`/`releaseViewModel`/`acquireViewModelSync`/`prepareViewModel`/`getTextViewModel`/`focusEditor`-via-vm. Delete once `asNotebook` + legacy text stack are gone.
- `editors/base/ContentViewModelHost.ts`, `editors/base/ContentViewModel.ts`, `editors/base/useContentViewModel.ts` — delete.

**Legacy content-view `*View.tsx` + `*ViewModel.ts` pairs to delete** (v4 `*Editor.ts` + `*Body.tsx` already shipped for each):
| Folder | Legacy files to delete |
|--------|------------------------|
| `markdown/` | `MarkdownView.tsx`, `MarkdownViewModel.ts` |
| `svg/` | `SvgView.tsx`, `SvgViewModel.ts` |
| `html/` | `HtmlView.tsx`, `HtmlViewModel.ts` |
| `mermaid/` | `MermaidView.tsx`, `MermaidViewModel.ts` |
| `graph/` | `GraphView.tsx`, `GraphViewModel.ts` (+ verify the 6 owned submodels are duplicated into `GraphEditor`, not shared) |
| `draw/` | `DrawView.tsx`, `DrawViewModel.ts` |
| `link-editor/` | `LinkView.tsx`, `LinkViewModel.ts` |
| `todo/` | `TodoView.tsx`, `TodoViewModel.ts` |
| `rest-client/` | `RestClientView.tsx`, `RestClientViewModel.ts` (keep `RestClientShared.tsx`) |
| `notebook/` | `NotebookView.tsx`, `NotebookViewModel.ts` |

> ⚠️ Each of these was explicitly **preserved** by its migration task "for notebook per-note embedding." US-579 made per-note dispatch fully v4-native (`NoteItemActiveEditor` → `v4EditorRegistry.getModule` → `module.Body`), so the preservation rationale is **void**. Before deleting each pair, grep its folder's `index.tsx` and `register-editors.ts` `loadModule` to confirm nothing imports the legacy `*View`/`*ViewModel` (the v4 module should reference only `*Editor`/`*Body`). See **C559-3**.

> `grid/` and `log-view/` never had legacy View/VM pairs (US-552 / US-553 shipped v4-only) — nothing to delete there.

**Legacy text-editor view stack to delete** (`editors/text/`): `TextEditorView.tsx`, `ActiveEditor.tsx`, `TextEditor.tsx` (+ its `TextViewModel`). Confirm `TextFileModel.focusEditor` / pending-reveal-line / pending-highlight plumbing is re-expressed against the v4 `MonacoEditor` (US-551 should already own this; verify no dangling `getTextViewModel()` callers remain).

**Dual-read persistence** (`api/pages/PagesPersistenceModel.ts`):
- `restoreState` branches `data.schemaVersion === 4 ? restoreV4 : restoreV3`. Drop the else; replace with detect-and-skip (if not v4, return without restoring — the C2 contract).
- Delete `restoreV3` and `restoreSidebarLegacy` (and the `restoreLegacyEditor` helper if only they use it).
- `restorePage` keeps the v4 branches: `if (d.host)` (host editors), Explorer special-case, `V4_NO_HOST_EDITOR_IDS` no-host branch. **Delete the trailing legacy fallback** (`newEditorModelFromState` → `applyRestoreData` → `new LegacyEditorAdapter`).

**`category` field readers** (`EditorDefinition.category` in `editors/types.ts`):
- `api/mcp-handler.ts:~156` (block standalone creation via `create_page`)
- `api/pages/PagesLifecycleModel.ts:~475` (block standalone via `addEditorPage`)
- `ui/app/RenderEditor.tsx:~61,~73` (inside `LegacyAdapterEditor` — deleted with the branch)
- `api/editors.ts` (public `app.editors` API surfaces `category` in `IEditorInfo`)

`category` is referenced by the **public script API** and two guard checks; it is **not** pure scaffolding. See **C559-1** for whether it stays.

**Dead-already (comments only — verify, no code action):** `compareModeChanged`, `PagesModel.rerender`, `fixCompareMode` were removed in US-548 (CK6/CK7); only doc-comments mention them. The grid-internal `rerender()` methods (`uikit/AVGrid`, `uikit/RenderGrid`) are unrelated and stay.

**Legacy types in `src/shared/types.ts`:**
- `LegacyPageDescriptor`, `LegacyWindowState` — delete (only `restoreV3` reads them).
- `IEditorState` — still the shape of `TextFileEditorModelState extends IEditorState` and the host descriptor round-trip. **Audit before touching** — likely stays (host state), but its `editor?: EditorView` and `detectedContentEditor?` fields may be prunable depending on C559-1/C559-4.
- `EditorView` union — referenced by ~48 files incl. `TextFileEditorModelState`, the legacy registry, `app.editors` types. **Stays** unless C559-1 removes the legacy registry entirely (then re-evaluate).
- Legacy `IContentHostState` (`editors/base/IContentHost.ts`) with `editor?` field — delete the file if no consumer remains after the content-view subsystem goes (v4 has its own `editors/base/v4/IContentHost.ts`).

---

## Implementation plan

> Ordering is dependency-driven: migrate the two remaining legacy *producers* first (so nothing creates legacy editors), then delete the now-unreachable consumer code, then persistence, then the registry decision, then version bump. Each phase should leave the app building and runnable.

### Phase 0 — Prerequisite + remaining decisions
**Blocked on [US-581](../US-581-native-v4-registry/README.md)** — do not start US-559 until the v4 registry is self-sufficient (resolves C559-1 + C559-4). Remaining decisions to confirm in review: **C559-2** (TextFileModel base), **C559-7** (version target), **C559-6** (first-launch UX). The plan assumes the **recommended** resolutions below.

### Phase 1 — Migrate the last legacy producers
1. **`asNotebook` → v4** (`scripting/api-wrapper/PageWrapper.ts`): replace the `acquireViewModel("notebook-view")` body with the `asTodo`/`asLink` pattern — `await this.ensureEditor("notebook-view", …)`, then assert `this.v4 instanceof NotebookEditor` and wrap it in `NotebookEditorFacade`. Update `NotebookEditorFacade` if it currently takes a `NotebookViewModel` (it must accept the v4 `NotebookEditor`). Remove the `releaseList.push` line.
2. **`BrowserWebviewModel` view-source sites** (`editors/browser/BrowserWebviewModel.ts`, 5 sites — context-menu View Source / View Actual DOM / Open SVG in Editor, + toolbar-menu View Source / View Actual DOM): replace `pagesModel.addPage(new LegacyEditorAdapter(newTextFileModel(...), …))` with the v4 equivalent — create a `MonacoEditor` and adopt a fresh `TextFileModel` host (mirror how a normal text page is created in `PagesLifecycleModel`/`PagesPersistenceModel` v4 path), or call an existing `pagesModel` helper that opens in-memory text content as a v4 page. Extract a small shared helper `openTextContentPage({ title, language, content })` to avoid repeating the construct-adopt-restore dance 5×.

### Phase 2 — Delete `LegacyEditorAdapter` + the legacy view stack
3. Delete `editors/base/v4/LegacyEditorAdapter.ts`; remove the re-export from `editors/base/v4/index.ts`.
4. `ui/app/RenderEditor.tsx`: delete the `instanceof LegacyEditorAdapter` branch + `LegacyAdapterEditor` + `getPageEditorModule`; `RenderEditor` becomes just `<V4NativeEditor model={model} />`.
5. `api/pages/PageModel.ts`: delete `unwrapAdapter`; `mainEditor` getter + `panelEditors` return the v4 editors directly.
6. `api/pages/PagesQueryModel.ts`: `getTextFileHost` returns the v4 main editor's `contentHost` (drop the adapter unwrap).
7. `editors/base/v4/PageToolbar.tsx` + `TextChrome.tsx`: delete the `instanceof LegacyEditorAdapter` branches and the now-dead portal-slot machinery (verify no v4 editor relies on `editorToolbarRefFirst/Last` — those were the legacy `NoteItemToolbar`/`TextToolbar` slots).
8. `api/pages/PagesLifecycleModel.ts`: delete `wrapLegacyForPage`; remove `deriveEditorId` import in `PageWrapper.ts`.
9. Delete the legacy text stack: `editors/text/TextEditorView.tsx`, `editors/text/ActiveEditor.tsx`, `editors/text/TextEditor.tsx`. Update `editors/text/index.ts` exports.

### Phase 3 — Delete the content-view subsystem + preserved legacy pairs
10. Delete the 10 legacy `*View.tsx` + `*ViewModel.ts` pairs (table above) — one editor at a time, building between each.
11. Delete `editors/base/ContentViewModel.ts`, `editors/base/ContentViewModelHost.ts`, `editors/base/useContentViewModel.ts`, and the legacy `editors/base/IContentHost.ts` (if unreferenced).
12. `editors/text/TextEditorModel.ts`: remove `_vmHost` + `acquireViewModel`/`releaseViewModel`/`acquireViewModelSync`/`prepareViewModel`/`getTextViewModel` and the `dispose()` `disposeAll()` call. Keep `TextFileModel` itself (the host).

### Phase 4 — Persistence cut-over (v4-only + detect-and-skip)
13. `api/pages/PagesPersistenceModel.ts`: `restoreState` → if `data.schemaVersion !== 4` return (skip); delete `restoreV3` + `restoreSidebarLegacy` (+ `restoreLegacyEditor` if now unused); delete the legacy fallback tail of `restorePage`.
14. `src/shared/types.ts`: delete `LegacyPageDescriptor` + `LegacyWindowState`. Audit `IEditorState` / `EditorView` per C559-4 before pruning.

### Phase 5 — Delete the legacy registry (US-581 already moved consumers off it)
15. Delete `editors/registry.ts`, the legacy `EditorDefinition` + `EditorCategory` (`editors/types.ts`), and the legacy `editorRegistry.register({...})` calls in `register-editors.ts` (lines ~71–747). Delete the mirror loop + `TEXT_CONTENT_VIEW_BRIDGE_IDS` + the bare-adapter factory (~790–876).
16. Confirm `category` has no remaining readers — US-581 re-expressed the `mcp-handler` / `addEditorPage` standalone guards as `!hasContentHost` and pointed `app.editors` at the v4 registry. Anything still reading `.category` means US-581 missed a consumer — fix forward.

### Phase 6 — Version bump + docs
17. `package.json`: `3.0.10` → `4.0.0` (per C559-7).
18. Refresh architecture docs (`doc/architecture/*`) to drop the two-tier / content-view language; update `CLAUDE.md` "Key Files" rows that point at deleted files. Release notes for the breaking persistence change (old session data is discarded on first 4.0.0 launch — C2).

---

## Concerns / open questions

**C559-1 — Fate of the legacy `registry.ts`. ✅ RESOLVED by carving out [US-581](../US-581-native-v4-registry/README.md).** `registry.ts` has live consumers beyond scaffolding (the public `app.editors` script API, `content/resolvers`, the notebook note toolbar `getSwitchOptions`, `TextFileModel.detectContentEditor`, the MCP `create_page` guard); the v4 registry today has none of these and its `accepts()` predicates delegate back to the legacy registry. Rather than leave a half-alive registry, **US-581 (prerequisite) makes the v4 registry self-sufficient** — internalizes all matching/detection rules into native v4 predicates, adds the missing registry methods, and rewires every live consumer to v4. After US-581, `registry.ts` is referenced ONLY by the scaffolding this task already deletes (`ContentViewModelHost`, `ActiveEditor`, `LegacyEditorAdapter`, `RenderEditor`'s legacy branch, the mirror loop). **US-559 then deletes `registry.ts` + the legacy `EditorDefinition` + the `register-editors.ts` legacy `register()` calls outright** — no fork. Phase 5 below collapses to "delete the legacy registry + mirror loop"; C559-4 (content detection) also moves to US-581.

**C559-2 — `TextFileModel`'s base class.** `TextFileModel` is the only remaining subclass of the legacy `editors/base/EditorModel.ts`. It must not be deleted.
- **Recommended:** keep `editors/base/EditorModel.ts` as `TextFileModel`'s base; rename it conceptually (doc comment) from "legacy editor base" to "content-host base", or leave as-is. No behavioral change.
- **Alternative:** fold the base into `TextFileModel` directly (inline the small base). Only if the base is trivial — audit `getDefaultEditorModelState` consumers first.

**C559-3 — Preserved-pair deletion safety.** Each legacy `*View`/`*ViewModel` was kept "for notebook embedding," a rationale US-579 voided. Before deleting each, confirm (a) the editor's `index.tsx` v4 module references only `*Editor`/`*Body`, (b) `register-editors.ts` `loadModule` for that id no longer returns the legacy `*View`, and (c) no stray `useContentViewModel<XxxViewModel>` import survives. Graph is the riskiest (6 owned submodels) — verify `GraphEditor` owns its own copies and doesn't import from `GraphViewModel`.

**C559-4 — `detectContentEditor` / `detectedContentEditor`. ✅ MOVED to [US-581](../US-581-native-v4-registry/README.md) (C581-3).** Content auto-detection (JSON `"type":"note-editor"` → offer notebook) is ported to the v4 registry as part of making it self-sufficient; current behavior (the `detectedContentEditor` field + suggestion) is preserved there. Nothing for US-559 to decide.

**C559-5 — `EditorView` union + `IEditorState` pruning.** Both are widely referenced (host state, registry, `app.editors` types). Recommend **leaving them** in this task — they're not scaffolding, and pruning the union risks churn across ~48 files for little gain. Revisit only if C559-1 deletes the legacy registry.

**C559-6 — Persistence detect-and-skip UX.** On first 4.0.0 launch, a v3 `openFiles0.json` is silently discarded (no migration, per C2). Confirm: silent discard is acceptable (recommended — matches C2's documented decision), vs. a one-time "previous session could not be restored" notice. Also confirm the per-page nav-panel cache files (`<pageId>-nav-panel.txt`) and other v3 cache artifacts are left to be orphaned (harmless) vs. cleaned.

**C559-7 — Version bump target.** Epic says "bump major version." Current `3.0.10`. Recommended target **`4.0.0`**. Confirm (the branch is `upcoming-v3.0.10`, so this also implies the release line/branch naming changes).

**C559-8 — Epic close.** US-559 is the last EPIC-028 task. Per the deferred-review model, completing it requires running `/review`, `/document`, `/userdoc` for all implemented-but-unreviewed tasks (the entire epic is currently `[ ]`), then moving the epic to `completed.md`. That review pass is **out of scope for US-559 implementation itself** but is the immediate follow-up — flag to the user at completion time.

**C559-9 — Stale comments.** `register-editors.ts:~299` ("via NoteItemEditModel.acquireViewModel") and `~521` ("BrowserBookmarks.acquireViewModel") are stale (both consumers retired in US-579 / US-558). Clean up while editing those regions.

---

## Acceptance criteria

- [ ] `LegacyEditorAdapter` deleted; no `instanceof LegacyEditorAdapter` anywhere; `grep -r LegacyEditorAdapter src/` returns nothing.
- [ ] No `acquireViewModel` / `releaseViewModel` / `acquireViewModelSync` / `prepareViewModel` / `ContentViewModel` / `useContentViewModel` references remain in `src/`.
- [ ] The 10 legacy `*View.tsx` + `*ViewModel.ts` pairs + the legacy text stack (`TextEditorView`/`ActiveEditor`/`TextEditor`) are deleted.
- [ ] `PageWrapper.asNotebook` returns a facade over the v4 `NotebookEditor` (no view-model round-trip); all `as*` scripting facades verified working.
- [ ] Browser "View Source / View Actual DOM / Open SVG in Editor" open v4 Monaco text pages (no adapter).
- [ ] Persistence writes v4 only; a synthetic v3 `openFiles0.json` is detected and skipped (app starts with no pages, no crash); a v4 session round-trips across restart for every editor type.
- [ ] Registry decision (C559-1) implemented; `app.editors` script API (`resolve`/`getSwitchOptions`/`getAll`) and the notebook note-toolbar switch control still work.
- [ ] `package.json` version bumped per C559-7.
- [ ] `npm run lint` and `tsc` clean (no new errors vs. baseline); app builds and runs; every editor type opens, edits, switches, and persists.
- [ ] Architecture docs + `CLAUDE.md` Key-Files refreshed; breaking-change release note written.

---

## Files Changed (anticipated)

| File | Change |
|------|--------|
| `editors/base/v4/LegacyEditorAdapter.ts` | **Delete** |
| `editors/base/v4/index.ts` | Remove adapter re-export |
| `ui/app/RenderEditor.tsx` | Delete legacy branch + `LegacyAdapterEditor` |
| `api/pages/PageModel.ts` | Delete `unwrapAdapter` + adapter unwraps |
| `api/pages/PagesQueryModel.ts` | `getTextFileHost` → v4 host |
| `api/pages/PagesLifecycleModel.ts` | Delete `wrapLegacyForPage`; audit `category` guard |
| `api/pages/PagesPersistenceModel.ts` | Delete `restoreV3` / `restoreSidebarLegacy` / legacy `restorePage` tail; detect-and-skip |
| `editors/base/v4/PageToolbar.tsx`, `TextChrome.tsx` | Delete adapter `instanceof` branches |
| `editors/browser/BrowserWebviewModel.ts` | 5 view-source sites → v4 Monaco page helper |
| `scripting/api-wrapper/PageWrapper.ts` | `asNotebook` → v4; drop `deriveEditorId` import |
| `editors/text/TextEditorModel.ts` | Remove `_vmHost` + `acquireViewModel*` + `getTextViewModel` |
| `editors/text/TextEditorView.tsx`, `ActiveEditor.tsx`, `TextEditor.tsx` | **Delete** |
| `editors/base/ContentViewModel.ts`, `ContentViewModelHost.ts`, `useContentViewModel.ts`, `IContentHost.ts` | **Delete** (legacy versions) |
| `editors/{markdown,svg,html,mermaid,graph,draw,link-editor,todo,rest-client,notebook}/*View.tsx` + `*ViewModel.ts` | **Delete** (10 pairs) |
| `editors/register-editors.ts` | Delete mirror loop + `TEXT_CONTENT_VIEW_BRIDGE_IDS` + bare-adapter factory; stale comments |
| `editors/registry.ts` | Slim (C559-1): drop content-view methods, keep metadata/resolve/switch/detect — **or delete** (alt path) |
| `editors/types.ts` | `category` handling per C559-1 |
| `api/mcp-handler.ts`, `api/editors.ts` | `category`/standalone-guard per C559-1 |
| `src/shared/types.ts` | Delete `LegacyPageDescriptor` / `LegacyWindowState`; audit `IEditorState` / `EditorView` |
| `package.json` | Version → 4.0.0 |
| `doc/architecture/*`, `CLAUDE.md` | Docs refresh + release note |

### Files that need NO change
- All 24 v4 `*Editor.ts` / `*Body.tsx` / `index.tsx` editor modules (already native).
- `editors/notebook/note-editor/NoteItemActiveEditor.tsx`, `NoteItemEditModel.ts`, `MiniTextEditor.tsx` (US-579 made these v4-native; the host-shim duck-type stays).
- `editors/base/v4/editorRegistry.ts` (unless C559-1 chooses the "port to v4" path).
- `uikit/**` grid `rerender()` (unrelated to `PagesModel.rerender`).
