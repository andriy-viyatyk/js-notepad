# US-559: Strangler-fig retirement (EPIC-028 Phase D — cleanup)

**Status:** Investigated 2026-05-27. **PAUSED — awaiting [US-581](../US-581-native-v4-registry/README.md) user verification.** US-581 (native v4 registry) was implemented and committed 2026-05-28 (commit `670a893`); the v4 registry is now self-sufficient and the legacy `registry.ts` has zero v4-side consumers — only US-559-doomed scaffolding (`ContentViewModelHost`, `RenderEditor` legacy branch, `PagesLifecycleModel` legacy factories, `LegacyEditorAdapter`, `ActiveEditor`) still imports it. Resume US-559 once US-581 passes manual testing; no other prerequisites remain.

**Walkthrough / concerns input:** EPIC-028 [`EPIC-028.md`](../../epics/EPIC-028.md) Phase D; concern C2 (breaking-change persistence cut-over).

---

## Goal

Retire the strangler-fig scaffolding now that all 24 editors are v4-native. Delete `LegacyEditorAdapter`, the legacy content-view subsystem (`ContentViewModel` / `ContentViewModelHost` / `useContentViewModel` + the 11 preserved legacy `*View.tsx` / `*ViewModel.ts` pairs), the legacy text-editor view stack (`TextEditorView` / `ActiveEditor` / `TextEditor`), the dual-read (v3) persistence path, and the registry mirror loop. Cut persistence over to v4-only with detect-and-skip of pre-v4 session data, and bump the major version (3.0.10 → 4.0.0) for the breaking change.

After this task, every page editor is a v4 `EditorModel`, there is one editor registry, and no `acquireViewModel` / `ContentViewModel` code remains.

---

## Reality vs. epic plan (findings from investigation)

The dashboard one-liner ("delete `LegacyEditorAdapter`; drop dual-read; delete remaining legacy types; delete the 12 preserved view+VM pairs; bump major version") is accurate but **understates two things** that the investigation surfaced:

1. **The legacy `registry.ts` is now deletable outright** (post-US-581). At investigation time it had live, non-scaffolding consumers — the public `app.editors` script API, the notebook note toolbar, `TextFileModel.detectContentEditor`, `content/resolvers`, the MCP `create_page` guard, `PageToolbar`, `PageWrapper`. **US-581 internalized all matching/detection logic into the v4 registry** (added `resolve` / `resolveId` / `getSwitchOptions` / `getPreviewEditor` / `validateForLanguage` / `detectContentEditor`) and rewired every live consumer to v4. The only remaining importers of the legacy registry are US-559-doomed scaffolding files. See **C559-1**.

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

- **Legacy** `src/renderer/editors/registry.ts` — `EditorDefinition` with `category` / `editorType` / `acceptFile` / `validForLanguage` / `switchOption` / `createViewModel`; methods `resolve` / `resolveId` / `getSwitchOptions` / `detectContentEditor` / `loadViewModelFactory`. Populated by `register-editors.ts` (lines ~71–747). **Post-US-581: zero live consumers; only US-559-doomed scaffolding imports it.**
- **v4** `src/renderer/editors/base/v4/editorRegistry.ts` — `EditorDefinition` with `accepts(input)` predicate, optional `match: EditorMatcher` (US-581) holding granular `acceptFile`/`switchOption`/`validForLanguage`/`detectsContent` rules, and `hasContentHost` flag; methods `resolveForFile` / `findEditorsAccepting` / `createEditor` / `getModule` / `resolve` / `resolveId` / `getSwitchOptions` / `getPreviewEditor` / `validateForLanguage` / `detectContentEditor` (the last six added by US-581). Each migrated editor `register()`s a native module that **overwrites** its mirror-loop entry.

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

**`category` field readers — resolved by US-581.** The four original consumers (`api/mcp-handler.ts:~156`, `api/pages/PagesLifecycleModel.ts:~475`, `api/editors.ts`, `ui/app/RenderEditor.tsx:~61,~73`) were all rewired in US-581 — the v4 registry's `hasContentHost` flag replaced the two standalone guards, `IEditorInfo` no longer surfaces `category`, and the `RenderEditor` reader sits inside the `LegacyAdapterEditor` branch deleted in Phase 2. The legacy `EditorDefinition.category` field still exists on legacy registry defs (set by ~71-747 in `register-editors.ts`) but has zero live readers. US-559 deletes both the field and its setters when the legacy registry goes.

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
**[US-581](../US-581-native-v4-registry/README.md) implemented 2026-05-28** (commit `670a893`); awaiting manual verification — user signed off on proceeding 2026-05-28. All design decisions resolved: C559-1 (delete registry outright), C559-2 (Option B — fold base into `TextFileModel`), C559-4 (moved to US-581), C559-6 (silent v3 discard), C559-7 (version → `4.0.1`; new branch `upcoming-v4.0.1` created 2026-05-28), C559-8 (epic stays open; docs deferred to follow-on task). C559-3, C559-5, C559-9 are audit items handled in their respective phases.

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

### Phase 3b — Fold the legacy editor base into `TextFileModel` (C559-2 / Option B)
12a. `editors/text/TextEditorModel.ts`:
   - Change `class TextFileModel extends EditorModel<TextFileEditorModelState, void>` to `class TextFileModel extends TDialogModel<TextFileEditorModelState, void>` (add `TDialogModel` import from `../../core/state/model`).
   - Drop `import { getDefaultEditorModelState, EditorModel } from "../base/EditorModel"`.
   - Move `getDefaultEditorModelState` body into a local helper (or inline its fields directly into `getDefaultTextFileEditorModelState`).
   - Add the inlined fields/methods listed in C559-2 above directly on `TextFileModel`: `page`, `pipe`, `scriptData`, `skipSave`, `noLanguage`, `setPage`, `secondaryEditor` get/set with the page wiring, `beforeNavigateAway`, the `id`/`type`/`title`/`modified`/`filePath`/`language` getters, `changeLanguage`, and the default `dispose` cache-cleanup body.
   - Drop `super.*` calls in `restore`/`saveState`/`dispose`/`confirmRelease` (they're no-ops or now-local).
   - Retype `isTextFileModel(model)` parameter from legacy `EditorModel<any,any>` to v4 `EditorModel` from `../base/v4/EditorModel`.
12b. `editors/browser/BrowserEditorModel.ts:2,258`: replace `import { getDefaultEditorModelState } from "../base"` with an inline default-state literal (id from `crypto.randomUUID()`, type, title, modified, language, filePath, editor fields).
12c. **Delete** `editors/base/EditorModel.ts`.
12d. `editors/base/index.ts`: remove the `EditorModel` + `getDefaultEditorModelState` re-exports (the content-view re-exports are already removed by Phase 3).
12e. Build + lint. Verify no `import .* from .*editors/base/EditorModel` survives (grep). Verify `isTextFileModel` callers still type-check.

### Phase 4 — Persistence cut-over (v4-only + detect-and-skip)
13. `api/pages/PagesPersistenceModel.ts`: `restoreState` → if `data.schemaVersion !== 4` return (skip); delete `restoreV3` + `restoreSidebarLegacy` (+ `restoreLegacyEditor` if now unused); delete the legacy fallback tail of `restorePage`.
14. `src/shared/types.ts`: delete `LegacyPageDescriptor` + `LegacyWindowState`. Audit `IEditorState` / `EditorView` per C559-4 before pruning.

### Phase 5 — Delete the legacy registry (US-581 already moved consumers off it)
15. Delete `editors/registry.ts`, the legacy `EditorDefinition` + `EditorCategory` (`editors/types.ts`), and the legacy `editorRegistry.register({...})` calls in `register-editors.ts` (lines ~71–747). Delete the mirror loop + `TEXT_CONTENT_VIEW_BRIDGE_IDS` + the bare-adapter factory (~790–876).
16. Confirm `category` has no remaining readers — US-581 re-expressed the `mcp-handler` / `addEditorPage` standalone guards as `!hasContentHost` and pointed `app.editors` at the v4 registry. Anything still reading `.category` means US-581 missed a consumer — fix forward.

### Phase 6 — Version bump
17. `package.json`: `3.0.10` → **`4.0.1`** (per C559-7). Work happens on the **`upcoming-v4.0.1`** branch (branched 2026-05-28 from `upcoming-v3.0.10`).

> **Docs + release notes are NOT part of US-559** (per C559-8). The architecture docs refresh (`doc/architecture/*`), `CLAUDE.md` "Key Files" cleanup, and breaking-change release note are scoped to a **separate follow-on task** the user will create after additional testing + minor bug fixes. US-559 ends with a clean technical retirement; the epic stays open until the follow-on docs task closes.

---

## Concerns / open questions

**C559-1 — Fate of the legacy `registry.ts`. ✅ RESOLVED by carving out [US-581](../US-581-native-v4-registry/README.md).** `registry.ts` has live consumers beyond scaffolding (the public `app.editors` script API, `content/resolvers`, the notebook note toolbar `getSwitchOptions`, `TextFileModel.detectContentEditor`, the MCP `create_page` guard); the v4 registry today has none of these and its `accepts()` predicates delegate back to the legacy registry. Rather than leave a half-alive registry, **US-581 (prerequisite) makes the v4 registry self-sufficient** — internalizes all matching/detection rules into native v4 predicates, adds the missing registry methods, and rewires every live consumer to v4. After US-581, `registry.ts` is referenced ONLY by the scaffolding this task already deletes (`ContentViewModelHost`, `ActiveEditor`, `LegacyEditorAdapter`, `RenderEditor`'s legacy branch, the mirror loop). **US-559 then deletes `registry.ts` + the legacy `EditorDefinition` + the `register-editors.ts` legacy `register()` calls outright** — no fork. Phase 5 below collapses to "delete the legacy registry + mirror loop"; C559-4 (content detection) also moves to US-581.

**C559-2 — `TextFileModel`'s base class. ✅ RESOLVED — fold the base into `TextFileModel` (Option B).** `TextFileModel` is the only remaining subclass of `editors/base/EditorModel.ts`, so keeping the file as a one-subclass parent reads as "legacy editor base" and invites confusion. Option B inlines the ~75-LOC base directly into `TextFileModel` and deletes the file.

**What gets inlined onto `TextFileModel` (today provided by `editors/base/EditorModel.ts`):**
- Fields: `page: PageModel | null`, `pipe: IContentPipe | null`, `scriptData: Record<string, any>`, `skipSave`, `noLanguage`, `getIcon?` (audit — likely unused on `TextFileModel`; drop if so).
- Methods: `setPage`, default `onMainEditorChanged`/`onPanelExpanded` (no-ops; can be removed if no `TextFileModel`-internal override calls them).
- Getters: `id`, `type`, `title`, `modified`, `filePath`, `language` (read-through to `this.state.get()`).
- `secondaryEditor` getter/setter — the setter wires into `page.addSecondaryEditor` / `removeSecondaryEditorWithoutDispose`; preserved verbatim.
- `beforeNavigateAway` (clears `secondaryEditor`).
- `confirmRelease(_closing?)` returning `true` — `TextFileModel.confirmRelease` no longer needs `super.confirmRelease(closing)` (replace with the literal `true` short-circuit).
- `dispose` — currently calls `fs.deleteCacheFiles(this.state.get().id)` and disposes the pipe. `TextFileModel.dispose` already overrides and calls `super.dispose()`; fold the body in (cache-files cleanup + pipe disposal).
- `restore` / `saveState` base bodies are no-ops; their `super.*` calls in `TextFileModel` go away.
- `getRestoreData` / `applyRestoreData` base versions are unused at runtime — `TextFileModel` overrides both with full implementations; just drop the base versions.
- `changeLanguage` — `TextFileModel` does NOT override; the base's body (state.update with `validateForLanguage`) becomes a `TextFileModel` instance method.

**`getDefaultEditorModelState()`** is exported from the legacy base and used by exactly two callers — `TextFileModel.ts:40` and `editors/browser/BrowserEditorModel.ts:258` (via the `../base` barrel). Resolution: relocate it as a non-exported helper inside `TextEditorModel.ts` (already adjacent to `getDefaultTextFileEditorModelState` which already spreads it), and inline a literal default-state object inside `BrowserEditorModel.ts` (Browser is a v4 no-host editor; the helper buys nothing there).

**Ripple — type aliases:**
- `api/pages/PageModel.ts:3` (`import type { EditorModel as LegacyEditorModel }` + `type EditorModel = LegacyEditorModel`) — removed by Phase 2 with `unwrapAdapter`.
- `api/pages/PagesLifecycleModel.ts:4` — removed by Phase 2 (`wrapLegacyForPage`) + the legacy factory helpers it types.
- `api/pages/PagesPersistenceModel.ts:12` — removed by Phase 4 (`restoreLegacyEditor` deletion).
- `isTextFileModel` (`TextEditorModel.ts:416`) currently takes `model: EditorModel<any, any>` from the legacy base. Retype to v4 `EditorModel` from `../base/v4/EditorModel` — post-US-559 every page editor is a v4 `EditorModel`.

**Barrel pruning** — `editors/base/index.ts` currently re-exports the legacy `EditorModel`, `getDefaultEditorModelState`, `ContentViewModel`, `ContentViewModelHost`, `useContentViewModel`, `IContentHost`, `IContentHostState`. After Option B + Phase 3, drop all seven; the barrel retains only `EditorToolbar`, `LanguageIcon`, `EditorConfig*`, `EditorStateStorage*`.

**Risk:** low. `TextFileModel` already overrides almost every base method; the inline is mostly relocation. Verify post-inline that no consumer calls `model.changeLanguage` / `setPage` etc. on a "generic legacy EditorModel" (they don't — all consumers narrow to `TextFileModel` via `isTextFileModel`, the v4 base, or `LegacyEditorModel` aliases that are gone). Phase order: do Option B as **Phase 3b** (after the content-view subsystem is deleted in Phase 3 step 11, before the persistence cut-over in Phase 4) so we're not deleting the file while v3 fallback paths still type-reference it.

**C559-3 — Preserved-pair deletion safety.** Each legacy `*View`/`*ViewModel` was kept "for notebook embedding," a rationale US-579 voided. Before deleting each, confirm (a) the editor's `index.tsx` v4 module references only `*Editor`/`*Body`, (b) `register-editors.ts` `loadModule` for that id no longer returns the legacy `*View`, and (c) no stray `useContentViewModel<XxxViewModel>` import survives. Graph is the riskiest (6 owned submodels) — verify `GraphEditor` owns its own copies and doesn't import from `GraphViewModel`.

**C559-4 — `detectContentEditor` / `detectedContentEditor`. ✅ MOVED to [US-581](../US-581-native-v4-registry/README.md) (C581-3).** Content auto-detection (JSON `"type":"note-editor"` → offer notebook) is ported to the v4 registry as part of making it self-sufficient; current behavior (the `detectedContentEditor` field + suggestion) is preserved there. Nothing for US-559 to decide.

**C559-5 — `EditorView` union + `IEditorState` pruning. ✅ DECISION (revisited post-US-581): keep both.** C559-1 resolved to "delete the legacy registry outright," which was the only trigger condition for re-evaluation. The union and `IEditorState` survive that deletion because both remain live host-state and public-API contracts:
- `EditorView` (`src/shared/types.ts`) is the string-literal union of registered editor ids — still consumed by `TextFileEditorModelState.editor` + `.detectedContentEditor` (host state), `IEditorInfo.id` (public `app.editors` API in `api/types/editors.d.ts`), MonacoEditor's `acceptedId`, and ~48 misc files. Pruning yields churn for no behavioral gain.
- `IEditorState` (`src/shared/types.ts`) is the base shape that `TextFileEditorModelState` extends; the host's `getDescriptor()` round-trips it through `HostDescriptor.state`. Stays.
- `IEditorState.editor?` field — historically mutated by both legacy and v4 paths; post-US-581 only v4 paths set it (host state). Still meaningful as the persisted "last used editor" for the host. **Keep.**
- Audit note for Phase 5 (registry deletion): the legacy `registry.ts` itself imports `EditorView` from `src/shared/types.ts`; deleting the registry leaves the union with healthy non-registry consumers — no cascading delete.

**C559-6 — Persistence detect-and-skip UX. ✅ RESOLVED: silent discard.** On first 4.0.1 launch, a v3 `openFiles0.json` is silently discarded (no migration, no UI notice — matches C2's documented decision). Orphaned per-page nav-panel cache files (`<pageId>-nav-panel.txt`) and other v3 cache artifacts are left in place (harmless leftovers; their owning pages are gone, so they never get touched).

**C559-7 — Version bump target. ✅ RESOLVED: `4.0.1`.** Bump `3.0.10` → **`4.0.1`** in `package.json` during Phase 6. The release branch moves from `upcoming-v3.0.10` to **`upcoming-v4.0.1`**, branched from the current commit (created 2026-05-28). US-559 work lands on the new branch once US-581 verification completes; finalize the branch swap (push + set upstream) before starting Phase 1.

**C559-8 — Epic close. ✅ DECISION: do NOT close the epic when US-559 completes.** EPIC-028 stays Active after US-559 lands. The user will follow US-559 with: (a) additional manual testing, (b) a list of minor bug fixes, (c) a **separate follow-on task** for the developer-/user-docs update — the volume of changes across EPIC-028 is too large for a single `/review` / `/document` / `/userdoc` pass at the end. Tasks under EPIC-028 stay `[ ]` (deferred-review model preserved) until that follow-on task closes; only then does the epic move to `completed.md`. US-559 itself just delivers the strangler retirement + version bump — no review commands run as part of its completion.

**C559-9 — Stale comments.** `register-editors.ts:~299` ("via NoteItemEditModel.acquireViewModel") and `~521` ("BrowserBookmarks.acquireViewModel") are stale (both consumers retired in US-579 / US-558). US-581 did not touch these regions — they sit inside the legacy `register()` block (~71-747) that US-559 deletes wholesale. Moot when those `register()` calls are deleted en bloc; no targeted cleanup needed.

---

## Acceptance criteria

- [ ] `LegacyEditorAdapter` deleted; no `instanceof LegacyEditorAdapter` anywhere; `grep -r LegacyEditorAdapter src/` returns nothing.
- [ ] No `acquireViewModel` / `releaseViewModel` / `acquireViewModelSync` / `prepareViewModel` / `ContentViewModel` / `useContentViewModel` references remain in `src/`.
- [ ] The 10 legacy `*View.tsx` + `*ViewModel.ts` pairs + the legacy text stack (`TextEditorView`/`ActiveEditor`/`TextEditor`) are deleted.
- [ ] `PageWrapper.asNotebook` returns a facade over the v4 `NotebookEditor` (no view-model round-trip); all `as*` scripting facades verified working.
- [ ] Browser "View Source / View Actual DOM / Open SVG in Editor" open v4 Monaco text pages (no adapter).
- [ ] Persistence writes v4 only; a synthetic v3 `openFiles0.json` is detected and skipped (app starts with no pages, no crash); a v4 session round-trips across restart for every editor type.
- [ ] Registry decision (C559-1) implemented; `app.editors` script API (`resolve`/`getSwitchOptions`/`getAll`) and the notebook note-toolbar switch control still work.
- [ ] `package.json` version bumped to **`4.0.1`** (C559-7); work lands on `upcoming-v4.0.1` branch.
- [ ] `npm run lint` and `tsc` clean (no new errors vs. baseline); app builds and runs; every editor type opens, edits, switches, and persists.

> Architecture docs + `CLAUDE.md` Key-Files refresh + breaking-change release note are **deferred to a follow-on task** (C559-8) — not part of US-559's acceptance.

---

## Files Changed (anticipated)

| File | Change |
|------|--------|
| `editors/base/v4/LegacyEditorAdapter.ts` | **Delete** |
| `editors/base/v4/index.ts` | Remove adapter re-export |
| `ui/app/RenderEditor.tsx` | Delete legacy branch + `LegacyAdapterEditor` |
| `api/pages/PageModel.ts` | Delete `unwrapAdapter` + adapter unwraps |
| `api/pages/PagesQueryModel.ts` | `getTextFileHost` → v4 host |
| `api/pages/PagesLifecycleModel.ts` | Delete `wrapLegacyForPage` + legacy editor factories (`newEditorModel`, `newEditorModelFromState`, `loadViewModelFactory` call). Category/standalone guard already rewired by US-581 — no change there. |
| `api/pages/PagesPersistenceModel.ts` | Delete `restoreV3` / `restoreSidebarLegacy` / legacy `restorePage` tail; detect-and-skip |
| `editors/base/v4/PageToolbar.tsx`, `TextChrome.tsx` | Delete adapter `instanceof` branches |
| `editors/browser/BrowserWebviewModel.ts` | 5 view-source sites → v4 Monaco page helper |
| `scripting/api-wrapper/PageWrapper.ts` | `asNotebook` → v4; drop `deriveEditorId` import |
| `editors/text/TextEditorModel.ts` | Remove `_vmHost` + `acquireViewModel*` + `getTextViewModel`; **fold legacy `EditorModel` base in (C559-2 / Phase 3b)** — extend `TDialogModel` directly, absorb base fields/methods, retype `isTextFileModel` to v4 |
| `editors/text/TextEditorView.tsx`, `ActiveEditor.tsx`, `TextEditor.tsx` | **Delete** |
| `editors/base/EditorModel.ts` | **Delete** (C559-2 / Phase 3b) |
| `editors/base/index.ts` | Drop `EditorModel` + `getDefaultEditorModelState` re-exports + content-view re-exports |
| `editors/browser/BrowserEditorModel.ts` | Inline state defaults (drop `getDefaultEditorModelState` import) |
| `editors/base/ContentViewModel.ts`, `ContentViewModelHost.ts`, `useContentViewModel.ts`, `IContentHost.ts` | **Delete** (legacy versions) |
| `editors/{markdown,svg,html,mermaid,graph,draw,link-editor,todo,rest-client,notebook}/*View.tsx` + `*ViewModel.ts` | **Delete** (10 pairs) |
| `editors/register-editors.ts` | Delete mirror loop + `TEXT_CONTENT_VIEW_BRIDGE_IDS` + bare-adapter factory; stale comments |
| `editors/registry.ts` | **Delete** (US-581 made it deletable outright — zero live consumers) |
| `editors/types.ts` | Delete legacy `EditorDefinition` + `EditorCategory` (gone with `registry.ts`) |
| `api/mcp-handler.ts`, `api/editors.ts` | **Already done by US-581** — no change in US-559 (verify no regression at integration) |
| `src/shared/types.ts` | Delete `LegacyPageDescriptor` / `LegacyWindowState`. `IEditorState` + `EditorView` union: **keep** (C559-5 resolved) |
| `package.json` | Version → **`4.0.1`** (on `upcoming-v4.0.1` branch) |
| `doc/architecture/*`, `CLAUDE.md` | **Deferred to follow-on task** (C559-8) — not in US-559 |

### Files that need NO change
- All 24 v4 `*Editor.ts` / `*Body.tsx` / `index.tsx` editor modules (already native).
- `editors/notebook/note-editor/NoteItemActiveEditor.tsx`, `NoteItemEditModel.ts`, `MiniTextEditor.tsx` (US-579 made these v4-native; the host-shim duck-type stays).
- `editors/base/v4/editorRegistry.ts` (unless C559-1 chooses the "port to v4" path).
- `uikit/**` grid `rerender()` (unrelated to `PagesModel.rerender`).
