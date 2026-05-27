# US-581: Native v4 editor registry — internalize matching + retire legacy-registry dependency

**Status:** Implemented 2026-05-28 — **awaiting user testing**. tsc + lint clean (zero new errors vs. baseline). Investigation surfaced two additional live consumers not in the original plan — the v4 `PageToolbar` switch-label lookup and `PageWrapper.compatibleEditorIds` scripting helper — both rewired to v4. After this change, the legacy `registry.ts` is imported ONLY by US-559-doomed scaffolding (`ContentViewModelHost`, `ActiveEditor`, `LegacyEditorAdapter`, `RenderEditor` legacy branch, `PagesLifecycleModel` legacy factory methods).

**Epic:** EPIC-028 (Unified Editor Architecture), Phase D. **Prerequisite for US-559** — carved out of US-559's concern C559-1 so the strangler-fig retirement becomes a pure deletion task with no half-alive legacy registry. **Implement US-581 first; US-559 is paused until it lands.**

---

## Goal

Make the v4 `editorRegistry` (`src/renderer/editors/base/v4/editorRegistry.ts`) **self-sufficient and feature-complete** so the legacy `registry.ts` has zero live consumers. Today every v4 `accepts()` predicate delegates back to the legacy registry, and several user-facing surfaces (`app.editors` script API, the open-file resolver, the notebook note-switch toolbar, content auto-detection) read `registry.ts` directly. This task internalizes the matching/detection rules into native v4 predicates, adds the registry methods those surfaces need, and rewires every live consumer to v4.

After US-581, the only remaining references to `registry.ts` are the strangler-fig scaffolding that US-559 already deletes (`ContentViewModelHost`, `ActiveEditor`, `LegacyEditorAdapter`, `RenderEditor`'s legacy branch, the mirror loop). US-559 can then delete `registry.ts` + the legacy `EditorDefinition` + the `register-editors.ts` legacy `register()` calls outright — no registry fork, no partial state.

---

## Background

### The coupling (why `registry.ts` isn't removable today)

The v4 registry exposes a single `accepts(input: { fileName?, language?, host?, mode? }): number` predicate per editor, plus `resolveForFile`, `findEditorsAccepting(host)`, `createEditor`, `getModule`. But **every native v4 registration delegates matching back to the legacy registry**. From `register-editors.ts`:

```ts
// makeGridAccepts / log-view / md-view / svg-view / … all do this:
accepts: (input) => {
    const legacy = editorRegistry.getById("md-view");      // ← legacy registry
    if (!legacy) return -1;
    if (input.fileName) { const p = legacy.acceptFile?.(input.fileName) ?? -1; if (p >= 0) return p; }
    if (input.language) { const p = legacy.switchOption?.(input.language, input.fileName) ?? -1; if (p >= 0) return p; }
    return -1;
}
```

The actual extension/language/content rules live in the legacy `editorRegistry.register({ id, acceptFile, switchOption, validForLanguage, isEditorContent, … })` calls in `register-editors.ts` (lines ~71–747). The v4 predicate is a thin shim over them.

### Legacy registry surface (`src/renderer/editors/registry.ts`)

| Method | Semantics |
|--------|-----------|
| `resolve(filePath)` / `resolveId(filePath)` | Best editor by `acceptFile(fileName)` priority (highest wins). |
| `getSwitchOptions(language, fileName?)` | Editors offered in the switch UI: each editor's `switchOption(language, fileName)` ≥ 0; sorted **ascending** (monaco = 0 first); returns `{ options, getOptionLabel }`; `options` empty if ≤ 1. |
| `getPreviewEditor(language, filePath)` | Best **non-monaco** editor whose `switchOption ≥ 0` **and** `acceptFile ≥ 0`; highest priority wins. Used for nav-panel auto-preview. |
| `detectContentEditor(language, content)` | First editor whose `isEditorContent(language, content)` is true (fast regex, no JSON parse). For structured JSON (notebook/todo/link/graph/draw) recognised by an embedded `"type"`. |
| `validateForLanguage(editor, language)` | Returns `editor` if `validForLanguage(language) !== false`, else falls back to `"monaco"`. |
| `validateForHost(editorId, host)` | Throws if `validForLanguage(host.language)` is false. **Content-view-only** — dies with US-559. |
| `getViewModelFactory` / `loadViewModelFactory` / `cacheModule` / `getCachedModule` | Content-view-model machinery. **All die with US-559** — do not port. |
| `getAll()` / `getById(id)` | Definition lookup; consumed for `name` + `category`. |

### `category` is removed (redundant with `hasContentHost`) — C581-4

Legacy `EditorDefinition.category` is `"content-view"` for the 13 text-bearing editors and `"standalone"` for the no-host ones — exactly the v4 `hasContentHost` flag (`content-view ≡ hasContentHost: true`). The only readers are two "block standalone creation" guards (`mcp-handler`, `addEditorPage` → become `!hasContentHost`), one dead reader inside `LegacyAdapterEditor` (US-559 deletes it), and the public `app.editors` `IEditorInfo.category` field. **Decision: drop `category` entirely** — internal guards switch to `!hasContentHost`, and `category` is removed from the public `app.editors` API (consistent with EPIC-028's "no script-API back-compat" stance for the 4.0 breaking release; it exposed an internal concept of no actionable value to scripts). US-581 removes it from the public API + guards; US-559 removes the legacy `EditorDefinition.category` field + the ~24 `register()` `category:` lines with the rest of the legacy registry.

### Live consumers to rewire (the work)

| File | Calls | Notes |
|------|-------|-------|
| `api/editors.ts` (`app.editors` **public script API**) | `getAll` / `getById` / `resolve` / `resolveId` / `getSwitchOptions` | Must keep `IEditorInfo` (`id`/`name`/`category`) + `ISwitchOptions` shapes byte-identical — documented in `assets/editor-types/editors.d.ts`. |
| `api/mcp-handler.ts:150,152,156` | `getById` / `getAll` / `.category === "standalone"` | "can't create standalone editor via `create_page`" guard → re-express as `!hasContentHost` (or `accepts({}) < 0`). |
| `content/resolvers.ts:73` | `resolveId(path)` | Layer-2 open-pipeline editor resolution — **live, hot path**. |
| `editors/notebook/note-editor/NoteItemToolbar.tsx:45` | `getSwitchOptions(language, undefined)` | Per-note editor SegmentedControl. Ordering matters (monaco-first). |
| `api/pages/PageModel.ts:433` | `getById(newEditorId)` | `switchMainEditor` validation. |
| `api/pages/PagesLifecycleModel.ts` | `resolve(323)`, `getById(328,362,394,469,647)`, `getAll(356,472)`, `validateForLanguage(484,509,560)`, `getPreviewEditor(811)`, `loadViewModelFactory(503)` | Mixed: most are live open/menu paths; `loadViewModelFactory` + the `addEditorPage` content-view branch **die with US-559** — audit (see C581-5). |
| `editors/text/TextEditorModel.ts` | `detectContentEditor(138)`, `validateForLanguage(220)`, `resolveId(392)` | Host content-detection + language validation + file resolution. |
| `editors/base/EditorModel.ts:165` | `validateForLanguage` | The host base class (TextFileModel's base) — stays after US-559 (C559-2). Must point at v4. |

### Consumers NOT to touch (US-559 deletes them; they keep using `registry.ts` until then)
`editors/base/ContentViewModelHost.ts`, `editors/text/ActiveEditor.tsx`, `editors/base/v4/LegacyEditorAdapter.ts:233`, `ui/app/RenderEditor.tsx` (legacy branch), and the `register-editors.ts` mirror loop + legacy `register()` calls. Leaving these on the legacy registry is intentional — they are deleted wholesale in US-559, at which point `registry.ts` becomes fully unreferenced.

---

## Implementation plan

### Phase 1 — Extend the v4 registry surface
In `editors/base/v4/editorRegistry.ts`, add (names indicative — match existing style):
1. `resolve(fileName, language?, mode?): EditorDefinition | undefined` and have `resolveForFile` return its `.id` (or add `resolveId`). Reuse the existing `resolveForFile` scoring (highest `accepts` wins).
2. `getSwitchOptions(language, fileName?): { options: string[]; getOptionLabel(id): string }` — iterate `definitions` with `hasContentHost`, evaluate `accepts({ language, fileName })`, keep ≥ 0, **sort monaco-first then by descending priority** (preserve today's monaco-at-front UX — see C581-2), label via `def.name` (monaco labels as `language.toUpperCase()`), return `options: []` when ≤ 1.
3. `getPreviewEditor(language, fileName): string | undefined` — best non-monaco content-host editor with `accepts({ language, fileName, mode: "view" }) ≥ 0`.
4. `validateForLanguage(editorId, language): string` — `accepts({ language }) ≥ 0 ? editorId : "monaco"` (monaco always valid).
5. `detectContentEditor(host): string | undefined` — **no separate field/method per editor** (C581-3 resolved). Fold each structured editor's content-marker check into its `accepts()` under the `input.host` branch (peek `input.host.state.get().content`); this method just returns the best content-host editor that claims the host's content. Because content-peek only fires when a `host` is present, file-open resolution (`resolveForFile`, fileName-only, no host) is unaffected.
6. An `IEditorInfo`-friendly view: `getInfo(def) → { id, name }` (no `category` — C581-4).

### Phase 2 — Internalize matching into native v4 predicates
For each of the 13 content-host editors (monaco, grid-json/csv/jsonl, log-view, md-view, svg-view, html-view, mermaid-view, graph-view, draw-view, link-view, todo-view, rest-client, notebook-view), replace the `editorRegistry.getById(id)?.acceptFile/switchOption/isEditorContent` delegation with the rule logic inlined into the v4 `accepts()`. Lift the bodies verbatim from the legacy `register()` calls in `register-editors.ts` (lines ~71–747): `acceptFile` → the `input.fileName` branch, `switchOption` → the `input.language` branch, and **`isEditorContent` → the `input.host` content-peek branch** (a structured editor returns a high priority when `input.host.state.get().content` matches its `"type"` marker, so it wins detection + the switch widget). Recommended: put each editor's matchers in its own folder (e.g. `editors/markdown/accepts.ts`) or a shared `editors/base/v4/matchers.ts`, so `register-editors.ts` stays readable. No-host editors keep `accepts: () => -1` (standalone; opened explicitly).

> After Phase 2 the legacy `acceptFile`/`switchOption`/`validForLanguage`/`isEditorContent` functions are still **present** (the legacy scaffolding still reads them) but no longer feed v4. US-559 deletes them with the legacy `register()` calls.

### Phase 3 — Rewire live consumers to v4
Point each consumer in the "Live consumers to rewire" table at the v4 registry / new methods. `app.editors` (`api/editors.ts`) sources data from v4 and **drops `category`** from `IEditorInfo` (C581-4); update `api/types/editors.d.ts` (+ regenerated `assets/editor-types/editors.d.ts`) to remove `EditorCategory` + `IEditorInfo.category`. MCP standalone guard (`mcp-handler.ts:156`) + `addEditorPage` guard (`PagesLifecycleModel.ts:475`) → `!hasContentHost`. `EditorModel.ts:165` (host base) and `TextEditorModel.ts` point at v4 `validateForLanguage`/`detectContentEditor`/`resolveId`.

### Phase 4 — Verify zero live references
`grep` `editors/registry` imports: the only remaining importers must be the US-559-doomed set (`ContentViewModelHost`, `ActiveEditor`, `LegacyEditorAdapter`, `RenderEditor`, `register-editors.ts` mirror loop). No live/feature code imports `registry.ts`. Build + lint clean.

---

## Concerns / open questions

**C581-1 — Where do the matchers live?** Inlining ~13 editors' rules into `register-editors.ts` bloats it. **Recommended:** a per-editor `accepts.ts` (or a `matchers.ts` keyed by id) so each editor owns its file/language/content rules next to its module. Confirm placement preference.

**C581-2 — Switch-option ordering.** Legacy `getSwitchOptions` sorts **ascending** by `switchOption` priority so monaco (0) is first; v4 `accepts` uses **higher-wins**. The note toolbar's SegmentedControl must keep monaco-first, then preview/grid. The v4 `getSwitchOptions` needs its own ordering rule (pin monaco first, then by descending `accepts`) — don't reuse `resolveForFile`'s raw ordering. Verify the rendered order matches today for json (Monaco | Grid) and markdown (Monaco | Preview).

**C581-3 — Content detection mechanism. ✅ RESOLVED (per user): fold into `accepts()` content-peek; no separate field/method.** `accepts(input)` already carries the `host`, and the host carries the content — so each structured editor's content-marker check (the old `isEditorContent` regex) moves into the `input.host` branch of its `accepts()`. The registry's `detectContentEditor(host)` becomes a thin "best content-host editor that claims this host" lookup over `accepts({ host })`.
- **Safety:** content-peek fires **only when `input.host` is present**, i.e. for the switch widget + detection on an already-open file. Initial file-open resolution (`resolveForFile` / `content/resolvers`) passes `{ fileName, language }` with **no host**, so it can't be perturbed by content markers — extension/language rules alone decide the opening editor. This keeps "which editor opens the file" and "which editor we suggest/allow switching to" cleanly separate, exactly as `isEditorContent` was separate from `acceptFile` today.
- **Preserve behavior:** the `detectedContentEditor` state field + "open as X?" suggestion stays — `TextEditorModel` calls `detectContentEditor(this)` (it *is* a host) instead of `detectContentEditor(language, content)`. The marker match returns a high priority so the suggested editor wins, but detection must still only *suggest*, not auto-switch.
- **Content-load timing (raised in review).** The host's content may not be loaded at editor-creation time, so two rules keep `accepts()` content-peek safe:
  1. **`accepts()` content-peek must be pure + robust** — read `input.host?.state.get().content ?? ""`; empty / not-yet-loaded content matches no marker and returns `-1`. It must never throw and never assume content is present. So even an early call degrades safely (no detection yet), and re-runs once content arrives.
  2. **Detection is caller-gated behind content load — already guaranteed.** `TextFileModel.restore()` calls `detectContentEditor(this)` **after** `await this.io.restore()` (the pipe read that loads file content), then sets `state.restored = true`; content changes re-trigger it via the debounced `scheduleDetection()`. The switch widget (`findEditorsAccepting`) only runs on user action against an open page. **No path feeds a host into `accepts()` for a decision before its content is loaded.** As belt-and-suspenders, `detectContentEditor(host)` may early-return `undefined` when `!host.state.get().restored`.
  3. **File-open resolution never uses a host.** `resolveForFile` / `content/resolvers` pass `{ fileName, language }` only — the opening editor is chosen by extension/language, never by content, so the not-yet-loaded-content window can't affect which editor opens a file.

**C581-4 — `category` removed (per review).** ✅ Confirmed redundant with `hasContentHost` (content-view ≡ hasContentHost). The two internal guards become `!hasContentHost`; the dead reader in `LegacyAdapterEditor` dies with US-559; the legacy `EditorDefinition.category` field + ~24 `register()` lines are removed with the legacy registry in US-559. **`category` is dropped from the public `app.editors` API** (`IEditorInfo.category` + `EditorCategory` deleted from `api/types/editors.d.ts` and the regenerated `assets/editor-types/editors.d.ts`) — a deliberate breaking change for 4.0, consistent with the epic's "no script-API back-compat." `ISwitchOptions` is unaffected. (If script back-compat is ever wanted, `category` can be re-derived in one line — but the decision is to remove.)

**C581-5 — `addEditorPage` / `loadViewModelFactory` path.** `PagesLifecycleModel.ts:503` (`loadViewModelFactory`) + the `validateForLanguage(484,509)` around it are in the legacy content-view open branch. If `addEditorPage` still runs the legacy path, those lines **die in US-559**, not here — US-581 should rewire only the `validateForLanguage` calls that survive (and leave `loadViewModelFactory` alone). Audit `addEditorPage` during implementation to classify each call; don't accidentally port content-view-only machinery.

**C581-6 — `validateForHost` is NOT ported.** It's content-view-only (called solely by `ContentViewModelHost`, which US-559 deletes). Do not add it to v4.

**C581-7 — Behavior parity is the acceptance bar.** This is a refactor with zero intended behavior change. The risk is subtle priority/ordering drift in file resolution and switch options. Test matrix in acceptance criteria must cover the formats with non-trivial rules (`.json` grid vs. text, `.md` preview, `.svg`/`.html`/`.mmd` preview, `.log`/`.jsonl` log-view content-peek, notebook/todo/link JSON content detection).

---

## Acceptance criteria

- [ ] v4 `editorRegistry` exposes `resolve`/`resolveId`, `getSwitchOptions`, `getPreviewEditor`, `validateForLanguage`, `detectContentEditor`, and `category`-bearing info — with no calls back into `registry.ts`.
- [ ] All 13 content-host editors' v4 `accepts()` (and content detection) are self-contained; no `editorRegistry.getById(...)` delegation remains in `register-editors.ts` native registrations.
- [ ] Every live consumer (`app.editors`, `mcp-handler`, `content/resolvers`, `NoteItemToolbar`, `PageModel`, live `PagesLifecycleModel` calls, `TextEditorModel`, `EditorModel` base) reads the v4 registry.
- [ ] `grep "editors/registry"` shows importers limited to the US-559-doomed scaffolding only (`ContentViewModelHost`, `ActiveEditor`, `LegacyEditorAdapter`, `RenderEditor`, `register-editors.ts` mirror loop).
- [ ] `app.editors` script API works off the v4 registry; `IEditorInfo` is `{ id, name }` (`category` removed); `ISwitchOptions` results (lists + order) match today's.
- [ ] Behavior parity verified: open `.json` (Grid), `.md` (Preview), `.svg`/`.html`/`.mmd` (Preview), `.log` + log-shaped `.jsonl` (Log View); notebook/todo/link JSON content auto-detection; switch dropdown order (Monaco first); nav-panel auto-preview.
- [ ] `npm run lint` + `tsc` clean (no new errors vs. baseline); app builds and runs.

---

## Files Changed (anticipated)

| File | Change |
|------|--------|
| `editors/base/v4/editorRegistry.ts` | Add `resolve`/`resolveId`/`getSwitchOptions`/`getPreviewEditor`/`validateForLanguage`/`detectContentEditor(host)` + info/`category` mapping (no new `EditorDefinition` field — C581-3) |
| `editors/register-editors.ts` | Replace ~13 delegating `accepts()` with self-contained logic (rules lifted from legacy `register()` calls); fold `isEditorContent` marker checks into the `input.host` content-peek branch of `accepts()` |
| `editors/<editor>/accepts.ts` (new, optional) | Per-editor matcher rules (C581-1) |
| `api/editors.ts` | Source `app.editors` from v4; drop `category` from `IEditorInfo` (C581-4) |
| `api/types/editors.d.ts` (+ regenerated `assets/editor-types/editors.d.ts`) | Remove `EditorCategory` + `IEditorInfo.category` |
| `api/mcp-handler.ts` | Standalone guard → `!hasContentHost`; `getAll`/`getById` → v4 |
| `content/resolvers.ts` | `resolveId` → v4 |
| `editors/notebook/note-editor/NoteItemToolbar.tsx` | `getSwitchOptions` → v4 |
| `api/pages/PageModel.ts` | `getById` → v4 |
| `api/pages/PagesLifecycleModel.ts` | `addEditorPage` getById/getAll/guard(`!hasContentHost`)/`validateForLanguage` + `requireWellKnownPage`/`openLinks` `validateForLanguage` + nav `getPreviewEditor` → v4 (legacy factory `newEditorModel`/`newEditorModelFromState`/`loadViewModelFactory` left for US-559 — C581-5) |
| `editors/text/TextEditorModel.ts` | `detectContentEditor(this)`/`validateForLanguage`/`resolveId` → v4 |
| `editors/base/EditorModel.ts` | `validateForLanguage` → v4 |
| `editors/base/v4/PageToolbar.tsx` | switch-widget label `getById(id)?.name` → v4 (discovered live consumer) |
| `scripting/api-wrapper/PageWrapper.ts` | `compatibleEditorIds` fallback `getSwitchOptions` → v4 (discovered live consumer) |

### Files NOT changed (US-559 deletes them; they stay on legacy `registry.ts`)
`editors/registry.ts` itself, the legacy `register()` calls + `acceptFile`/`switchOption`/`isEditorContent`/`validForLanguage`/`category` fields, `ContentViewModelHost.ts`, `ActiveEditor.tsx`, `LegacyEditorAdapter.ts`, `RenderEditor.tsx` legacy branch, the `register-editors.ts` mirror loop.
