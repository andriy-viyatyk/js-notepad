# US-565: Draw editor migration

EPIC-028 Phase C — second and final of the two skipped-in-design Tier-5 text-bearing editors (US-564 Graph + US-565 Draw, both walkthrough-less). Promotes the legacy `DrawViewModel` (a `ContentViewModel<DrawViewState>` over `TextFileModel` with NO submodels — only three small private fields mirroring parsed Excalidraw JSON + a held `ExcalidrawImperativeAPI` ref) to a native v4 `DrawEditor` extending `EditorModel`. Retires the `useContentViewModel("draw-view")` consumer site and the `acquireViewModel("draw-view")` facade-acquire pair.

**Walkthrough status:** No walkthrough 28 exists — Draw was deferred during the EPIC-028 design pass. This document is the first place the migration design is written down. Pattern reuse is explicit (PV1 / PV4 / PV5 / PV7 from walkthrough 22; HS1 from the 2026-05-21 amendment; MK4 from US-554; GR1–GR14 from US-564).

Direct precedents (the pattern set this task draws from byte-for-byte):
- [`US-562 (Mermaid)`](../US-562-mermaid-editor-migration/README.md) — the closest structural sibling: same HS1-mirrored boolean toggle (Mermaid `lightMode` ↔ Draw `darkMode`), same single-render-trigger pattern, same shape of `<TextChrome rightToolbarContributions>` composition. The single most relevant precedent.
- [`US-564 (Graph)`](../US-564-graph-editor-migration/README.md) — the most recent sibling: GR1 notebook-preservation contract, GR3 view-attached editor instance fields (`_excalidrawApi` here mirrors the `onDoubleClickNode` pattern), GR4 HS1 UX upgrade, GR7 `skipNextContentUpdate` round-trip guard.
- [`US-554 (Markdown)`](../US-554-markdown-editor-migration/README.md) — the MK4 typed-host getter pattern.
- [`US-561 (Html)`](../US-561-html-editor-migration/README.md) — the shape-based restore discriminator (`d.host !== undefined`) auto-includes Draw descriptors without a `PagesPersistenceModel` edit.

The material differences from US-562 (Mermaid):

1. **No async render pipeline.** Mermaid renders content asynchronously (`renderMermaid(content, lightMode)` returns a Promise → `s.svgUrl`). Draw's `parseContent` is **synchronous** — `JSON.parse` + assign fields + flip `loading: false`. No debounced render timer, no error-after-await. The trigger source is still a slice-subscribe on `host.state.content`, but the work runs sync inside the callback.
2. **View → editor push back (`updateFromExcalidraw`).** Mermaid is render-only — content goes one way (host → editor). Draw is **bidirectional**: Excalidraw's `onChange` callback fires (debounced 500 ms in the view), the view calls `editor.updateFromExcalidraw(elements, appState, files)`, the editor computes a fingerprint, sets `skipNextContentUpdate = true`, and writes serialized JSON back to `host.changeContent(...)`. This loop is preserved verbatim (DR7).
3. **Held `ExcalidrawImperativeAPI` ref (DR3).** The Excalidraw component yields an imperative API on mount. Today's `DrawViewModel` stores it as `_excalidrawApi` and exposes `setExcalidrawApi` / `clearExcalidrawApi` / `excalidrawApi` getter. The view sets it on mount, the facade reads it for `addImage`, the toolbar reads it for exports. After US-565 this stays as an instance field on `DrawEditor` (mirrors GR3 — minimal change, sync access, no queue-trip cost).
4. **Library persistence + browser-URL listener stay in the view (DR15).** Today's `DrawView.tsx` owns `createLibraryAdapter()` + `useHandleLibrary` + the `browserUrlChanged` subscription for excalidraw-library install URLs. These are **view-side effects** — no editor state involvement. They stay in `DrawBody.tsx`. The library data persists to disk independently of the editor (via `settings.get("drawing.library-path")` + `fs.write`).
5. **Five toolbar buttons all on the right (DR9).** Mermaid has three right-side bits (theme toggle + open-draw + copy). Draw has five (theme toggle + copy + save dropdown + open dropdown + screen snip). All five move to `<TextChrome rightToolbarContributions>`. No in-editor overlay toolbar (Excalidraw provides its own canvas UI). No footer.
6. **`darkMode` HS1 host-slot persistence (DR4) is a NEW UX upgrade with a behavior change.** Today: `darkMode` is theme-synced via a `useEffect` on `themeId` in the view — every theme switch overrides the user's manual toggle. After US-565: `darkMode` rides `host.editorSettings["draw-view"]` (HS1); the theme-sync useEffect is REMOVED (DR15). Constructor seeds from theme on first construct; HS1 takes over thereafter. Same contract as Mermaid's `lightMode` (MR5 + HS1 amendment).

## Goal

Replace the host + content-view pair (`TextFileModel` wrapped in `LegacyEditorAdapter` + `DrawViewModel` acquired via `useContentViewModel`) with a single native `DrawEditor` that IS the page's `mainEditor` and HAS a `TextFileModel` as its `IContentHost` via `CONTENT_HOST_TRAIT`. The `DrawEditorFacade` flips from wrapping `DrawViewModel` to wrapping `DrawEditor` directly (stays async — the methods that currently dynamic-import `@excalidraw/excalidraw` keep doing so; the facade-level surface is unchanged). State slice extends `EditorStateBase` with HS1-mirrored `darkMode` + view-derived `error` + `loading`. All three Excalidraw payload fields (`_elements`, `_appState`, `_files`) plus the round-trip guard (`_skipNextContentUpdate`) plus the fingerprint (`_lastFingerprint`) plus the API ref (`_excalidrawApi`) are private instance fields on `DrawEditor` — same shape as today's VM.

## Background

### Reference shape — one new piece, five repeats

This task is the **sixth exercise of the Tier-5 template on a text-bearing editor**, after US-554 (Markdown), US-560 (Svg), US-561 (Html), US-562 (Mermaid), and US-564 (Graph). The skeleton is identical to Mermaid byte-for-byte (one bounded boolean HS1 + view-derived state stripped from descriptor + slice-subscribe content trigger + initial kickoff in `adoptHost`).

**The new piece is the bidirectional Excalidraw payload loop** — Draw is the first migrated editor where the canvas mutates state and pushes serialized JSON back to the host. The `skipNextContentUpdate` guard prevents the resulting `host.state.content` mutation from triggering an unnecessary re-parse. Same shape as Graph's `serializeToHost` (GR7) but with a richer payload (elements + appState + files instead of just node/link arrays).

Everything else mirrors Mermaid / Graph byte-for-byte:

1. Class extends `V4EditorModel<DrawEditorState, void, DrawQueueEvent>` with `readonly editorId = "draw-view"`, `_host: TextFileModel | null`, `_hostStateUnsub`, `_settingsUnsub` (HS1 mirror for `darkMode`), `_hostContentUnsub` (content slice-subscribe → `parseContent`).
2. Constructor seeds `darkMode = isCurrentThemeDark()` (mirrors today's `onInit` line 40); adds `CONTENT_HOST_TRAIT` with `extractContentHost` that tears down ALL subscriptions before returning the host.
3. `getRestoreData()` strips all view-derived state (PV7); `darkMode` rides HS1 host-slot.
4. `applyRestoreData()` stashes `_pendingHost`. No `darkMode` carry from descriptor (HS1 reads from host-slot in `adoptHost`).
5. `switchFrom(oldEditor)` extracts the host via trait, copies id, tags host with the new editor id, calls `adoptHost`. **Initial parse kicks off from `adoptHost`** via an explicit `this.parseContent(host.state.get().content)` call at the end (DR6 pattern — slice-subscribe doesn't fire on first attach).
6. `restore()` rebuilds the host from `_pendingHost`, calls `host.restore()`, then `adoptHost`. Same initial-parse kick.
7. `adoptHost(host)` wires the host-state forwarder, the HS1 mirror for `darkMode` (seed from slot + slice-subscribe to mirror back), the content-change retrigger AND calls `parseContent()` for the initial parse.
8. `dispose()` tears down all subscriptions before disposing the host. No timers to clear (the 500 ms debounce timer lives in the view, not the editor — see DR16).
9. Module file (`draw/index.tsx`) exports an `EditorModule` (`{ createEditor, Component }`) consumed by the v4 registry; `register-editors.ts` appends a v4 native registration. The legacy `loadModule` is preserved with eager imports for notebook embedding — see DR1.

### Today's per-editor surface

`src/renderer/editors/draw/`:

| File | Today's role | After US-565 |
|------|--------------|--------------|
| `DrawViewModel.ts` | `ContentViewModel<DrawViewState>` over `TextFileModel`. Three private fields (`_elements`, `_appState`, `_files`) mirror parsed Excalidraw JSON. One guard (`_skipNextContentUpdate`). One fingerprint cache (`_lastFingerprint`). One held API ref (`_excalidrawApi`). `onInit`: sets `darkMode = isCurrentThemeDark()` + calls `parseContent(host.state.content)`. `onContentChanged`: re-parses (skipped if `_skipNextContentUpdate`). `parseContent`: JSON.parse → assign fields → flip `loading`. `updateFromExcalidraw`: fingerprint check → assign fields → `host.changeContent(serializeAsJSON(...), true)` with `skipNextContentUpdate = true` flag. `computeFingerprint`: element id/version digest + sorted file keys. `toggleDarkMode` / `syncDarkMode`: state mutators. Five public accessors: `elements`, `appState`, `files`, `excalidrawApi`, `setExcalidrawApi/clearExcalidrawApi`. ~125 LOC. | **Retained verbatim** for notebook embedding (see DR1 below). The page-level v4 path no longer constructs it. |
| `DrawView.tsx` | React component, props `{ model: TextFileModel }`, uses `useContentViewModel<DrawViewModel>` + `useSyncExternalStore`. Subscribes to `settings.use("theme")` to call `vm.syncDarkMode()` on theme change (DR15 — REMOVED after migration). Five export helpers: `handleCopyToClipboard`, `handleScreenSnip`, `saveMenuItems` (SVG/PNG), `openMenuItems` (SVG/Image). One library hook (`useHandleLibrary` with `createLibraryAdapter()`). One link-intercept handler (`handleWrapperClick` for "Browse libraries"). One browser-URL listener (`browserUrlChanged` for excalidraw-library install URLs). Renders `<Panel>` with portal toolbar (5 buttons) + `<Excalidraw>` component. ~370 LOC. | **Retained verbatim** for notebook embedding (see DR1). The page-level v4 path uses the new `DrawBody.tsx`. |
| `drawLibrary.ts` | `initDefaultLibraryPath` (settings-backed) + `createLibraryAdapter` (LibraryPersistenceAdapter — load/save library.excalidrawlib file). Pure module. | **Unchanged.** |
| `drawExport.ts` | `exportAsSvgText` / `exportAsPngBlob` (API-based) + `exportSceneAsSvgText` / `exportSceneAsPngBlob` (scene-data-based, used by facade) + `getImageDimensions` + `capDimensions` + `buildExcalidrawJsonWithImage` (used by Image / SVG / Mermaid / Graph for "Open in Drawing"). Pure module. | **Unchanged.** |
| `index.ts` | Re-exports `DrawView` + `DrawViewProps`. | **Deleted.** Replaced by `index.tsx` (different surface — adds `drawModule` + class re-export). Notebook embedding path imports `./DrawView` directly via the legacy `loadModule`'s `Promise.all`. |
| (new) `DrawEditor.ts` | — | Native v4 `DrawEditor` class — trait, lifecycle, host adoption, HS1 mirror for `darkMode`, three private payload fields + guard + fingerprint + API ref, methods relocated verbatim from legacy `DrawViewModel`. Estimated ~180 LOC. |
| (new) `DrawBody.tsx` | — | Body view — reads `editor.state.use(...)` reactively; renders `<Excalidraw>` element with library hook + library-URL listener + link-intercept wrapper. Wires `editor.setExcalidrawApi` on mount, `editor.clearExcalidrawApi` on unmount. Hosts the 500 ms debounce timer for `handleChange`. Estimated ~150 LOC. |
| (new) `index.tsx` | — | Module shell — `EditorModule` export (`drawModule`), `DrawEditorView` (`<TextChrome>` with `rightToolbarContributions={<DrawToolbarBits .../>}` (5 buttons) + `<DrawBody>`), `DrawToolbarBits` component holding the five export-helper callbacks. Replaces today's `index.ts`. Estimated ~280 LOC. |

### State slice carve-up (what stays vs what's HS1-mirrored vs what's stripped)

Today's `defaultDrawViewState`:
```typescript
{
    loading: true,
    error: null,
    darkMode: true,
}
```

After US-565:

| Field | Type | Persistence | Reason |
|-------|------|-------------|--------|
| `loading` | `boolean` | **Transient** (stripped) | Recomputed by next parse. |
| `error` | `string \| null` | **Transient** (stripped) | Recomputed on every parse. |
| `darkMode` | `boolean` | **HS1 host-slot** (`host.editorSettings["draw-view"].darkMode`) | User preference; persists across switches AND restarts (DR4). |
| `id` | `string` | Identity descriptor | EditorStateBase. |
| `title` | `string` | Identity descriptor | EditorStateBase. |
| `modified` | `boolean` | Identity descriptor | EditorStateBase. |
| `secondaryEditor` | `string \| undefined` | Identity descriptor | EditorStateBase. |

There are no derivable getters on the legacy VM beyond `elements` / `appState` / `files` / `excalidrawApi` — these stay as field getters on `DrawEditor` (no state slice involvement; views read directly via `editor.elements`).

### Sync parse pipeline — relocated from VM to editor

Today's `DrawViewModel.parseContent` (synchronous):
```typescript
private parseContent(content: string): void {
    try {
        if (!content || content.trim() === "") {
            this._elements = [];
            this._appState = { currentItemFontFamily: FONT_FAMILY.Helvetica };
            this._files = {};
        } else {
            const data = JSON.parse(content);
            this._elements = data.elements || [];
            this._appState = data.appState || {};
            this._files = data.files || {};
        }
        this._lastFingerprint = this.computeFingerprint(this._elements, this._files);
        this.state.update((s) => { s.loading = false; s.error = null; });
    } catch (e) {
        this.state.update((s) => { s.loading = false; s.error = (e as Error).message; });
    }
}
```

After migration this lives on `DrawEditor` byte-for-byte. The trigger source changes from `onContentChanged` (called by ContentViewModelHost on host content change, skipped if `_skipNextContentUpdate`) to a slice-subscribe on `host.state.content`:

```typescript
// in adoptHost(host):
this._hostContentUnsub = host.state.subscribe(
    () => {
        if (this._skipNextContentUpdate) {
            this._skipNextContentUpdate = false;
            return;
        }
        this.parseContent(this._host?.state.get().content ?? "");
    },
    (s) => s.content,
);
```

And a kickoff call at the end of `adoptHost`:
```typescript
this.parseContent(host.state.get().content);  // initial parse against the freshly-adopted host
```

This matches today's behavior: `DrawViewModel.onInit()` calls `this.parseContent(this.host.state.get().content)` at the end after seeding `darkMode`. DR6 expands the rationale.

### Bidirectional payload loop — view → editor → host (DR7)

Today's `DrawViewModel.updateFromExcalidraw`:
```typescript
updateFromExcalidraw(elements: readonly any[], appState: Record<string, any>, files: any): void {
    this._appState = appState;
    const fingerprint = this.computeFingerprint(elements, files);
    if (fingerprint === this._lastFingerprint) return;
    this._lastFingerprint = fingerprint;
    this._elements = [...elements];
    this._files = files;
    this._skipNextContentUpdate = true;
    const json = serializeAsJSON(elements as any, appState as any, files, "local");
    this.host.changeContent(json, true);
}
```

Relocated verbatim to `DrawEditor` — `this.host` → `this._host!.changeContent(json, true)`.

**Why fingerprint?** Excalidraw's `onChange` fires on every scroll, zoom, cursor move, selection change. Most of these don't represent a content edit. The fingerprint is `${element_id}:${version}:${versionNonce};...|${sorted_file_keys}` — only changes when an element is actually mutated. Without the fingerprint, the editor would write the same content to the host on every scroll, triggering a parse loop (the skip flag prevents the parse, but `host.changeContent` still bumps `modified: true` + triggers `descriptorChanged` for IO state save).

**Why `_skipNextContentUpdate`?** Without it, `host.changeContent` fires the content slice-subscribe, which re-parses the JSON we just serialized. The flag short-circuits that one round-trip. Same shape as Graph (GR7) — preserved verbatim.

### Persistence story (PV7 + HS1)

**View-derived (stripped from `getRestoreData`):** `loading`, `error`.

**Persisted via HS1 host-slot (DR4):**
- `darkMode` — rides `host.editorSettings["draw-view"]`. Initial value defaults to `isCurrentThemeDark()` on first construct (no slot yet). User toggle sticks across:
  - Draw ↔ Monaco editor switches (host survives the switch; slot survives with it).
  - App restarts (slot rides host descriptor in `openFiles*.json`).
  - Re-open from disk (slot persists in `openFiles0.json` host descriptor for as long as the host descriptor persists).

**Editor descriptor:**
```typescript
getRestoreData(): EditorDescriptor {
    const s = this.state.get();
    // Identity-only descriptor. darkMode rides host.editorSettings["draw-view"]
    // (HS1); loading/error stripped per PV7 / MO5.
    return {
        editorId: this.editorId,
        id: s.id,
        state: {
            title: s.title,
            modified: s.modified,
            secondaryEditor: s.secondaryEditor,
        } as Record<string, unknown>,
        host: this._host?.getDescriptor(),
    };
}
```

**Restore path on app startup:**
1. `PagesPersistenceModel.restorePage()` sees `d.host !== undefined` → routes through native v4 path (fix from US-561; auto-includes Draw).
2. v4 registry's `draw-view` `createEditor()` constructs a fresh `DrawEditor` with `defaultDrawEditorState`.
3. `editor.applyRestoreData(d)` stashes `_pendingHost`.
4. `editor.restore()` rebuilds the host via `TextFileModel.fromDescriptor(_pendingHost)`, calls `host.restore()`, then `adoptHost(host)`.
5. `adoptHost` reads `host.getEditorState("draw-view")` — if the slot exists with `darkMode`, overrides the default. Wires content slice-subscribe + HS1 mirror. Calls `parseContent(host.state.content)` for the initial parse.
6. The parse runs synchronously (JSON.parse), `_elements/_appState/_files` populate, `loading` flips to `false`. View re-renders, mounts the `<Excalidraw>` component with `initialData={{ elements: editor.elements, appState: ..., files: editor.files }}`. Excalidraw's internal `excalidrawAPI` callback fires → view calls `editor.setExcalidrawApi(api)`.

This is the same flow as today (modulo the HS1 persistence — today's `darkMode` always reverts to `isCurrentThemeDark()` on every reopen).

### Consumer sites of DrawViewModel / DrawView — full grep result

| File | Line(s) | Pattern today | After US-565 |
|------|---------|---------------|--------------|
| `src/renderer/editors/draw/DrawView.tsx` | 15, 48 | imports `DrawViewModel` + `DrawViewState` + `defaultDrawViewState`; `useContentViewModel<DrawViewModel>(model, "draw-view")` | **Unchanged.** Preserved for notebook embedding (DR1). |
| `src/renderer/editors/draw/index.ts` | 1–2 | Re-exports `DrawView` + `DrawViewProps` | **Deleted.** Replaced by `index.tsx` (different surface — adds `drawModule` + class re-export). |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | 19, 32, 292–301 | `import type { DrawViewModel }` + `await model.acquireViewModel("draw-view") as DrawViewModel` + `releaseList.push(...)` | `this.v4 instanceof DrawEditor` direct check; `new DrawEditorFacade(this.v4)`; releaseList push deletes. Same pattern as `asMermaid` / `asGraph`. |
| `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts` | constructor + 6 getters/methods | Wraps `DrawViewModel`; reads `vm.elements` / `vm.appState` / `vm.files` / `vm.excalidrawApi` | Wraps `DrawEditor`; reads `editor.elements` / etc. (one-symbol rename — `vm` → `editor`). Stays async on the dynamic-imported methods. |
| `src/renderer/editors/register-editors.ts` | 536–567, 756, ~1028+ (new) | Legacy registration + `TEXT_CONTENT_VIEW_BRIDGE_IDS` includes `"draw-view"` | Keep legacy registration (DR1 — eager imports preserved); drop `"draw-view"` from bridge set; append v4 native registration (same shape as mermaid / graph). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | ~20 (import) + after line 184 (`wrapLegacyForPage` Graph branch) | No draw branch — falls through to `LegacyEditorAdapter` | Add `import { DrawEditor, defaultDrawEditorState } from "../../editors/draw";` + add `if (isTextFile && targetEditorId === "draw-view")` branch after the Graph branch. |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | 405 (`addDrawPage`) | `this.addEditorPage("draw-view", "json", title ?? "untitled.excalidraw", json)` | **Unchanged.** Editor id preserved; flows through new `wrapLegacyForPage` Draw branch. |
| `src/renderer/editors/image/ImageViewer.tsx` | ~portal toolbar | `pagesModel.addEditorPage("draw-view", "json", title, json)` for "Open in Drawing Editor" button | **Unchanged.** |
| `src/renderer/editors/svg/index.tsx` | toolbar bits | `pagesModel.addEditorPage("draw-view", "json", title, json)` | **Unchanged.** |
| `src/renderer/editors/mermaid/index.tsx` | 50 | `pagesModel.addEditorPage("draw-view", "json", title, json)` | **Unchanged.** |
| `src/renderer/editors/graph/index.tsx` | 42 | `pagesModel.addEditorPage("draw-view", "json", title, json)` | **Unchanged.** |
| `src/main/mcp-http-server.ts` | string literals | `"draw-view"` in MCP tool description | **Unchanged.** Editor id preserved. |
| `src/shared/types.ts` | 2 | `EditorView` union contains `"draw-view"` | **Unchanged.** |
| `src/renderer/api/types/common.d.ts` | | `EditorView` union contains `"draw-view"` | **Unchanged.** |
| `src/renderer/api/types/draw-editor.d.ts` | `IDrawEditor` interface | Facade interface — async addImage / exportAsSvg / exportAsPng + sync elementCount / editorIsMounted | **Unchanged.** Shape preserved. |
| `src/renderer/ui/sidebar/tools-editors-registry.ts` | (none today) | — | No sidebar button entry for Draw today. No change. |
| `src/renderer/api/settings.ts` | `drawing.library-path` | Setting for library file location | **Unchanged.** Library persistence stays in the view layer (DR15). |

The `acquireViewModel*` machinery itself does NOT die in this task — `NoteItemEditModel.ts` is still a consumer for notebook-embedded notes AND we are intentionally KEEPING the legacy `loadModule` populated for the notebook path. Full removal happens in US-557 (Notebook) and US-559 (cleanup).

### Open-file path — `wrapLegacyForPage`

`src/renderer/api/pages/PagesLifecycleModel.ts:59` (`wrapLegacyForPage`) is the bridge that converts legacy `TextFileModel` instances into v4 editors during page creation. It has eight `if` branches today (Monaco, Grid, LogView, Markdown, Svg, Html, Mermaid, Graph) that produce native v4 editors; everything else falls through to `LegacyEditorAdapter`. US-565 adds the Draw branch after the Graph branch (~line 184):

```typescript
// EPIC-028 / US-565 — Draw migrated to native v4 module. Construct
// DrawEditor over the legacy TextFileModel host. The initial parseContent()
// call kicks off inside adoptHost (mirrors today's DrawViewModel.onInit →
// parseContent behavior).
if (isTextFile && targetEditorId === "draw-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const draw = new DrawEditor(
        new TComponentState({ ...defaultDrawEditorState, id }),
    );
    draw.adoptHost(legacy as TextFileModel);
    return draw;
}
```

This makes:
- Open an `.excalidraw` file from explorer → routed via legacy registry's `acceptFile` (priority 20 for `.excalidraw`) → `wrapLegacyForPage` → `DrawEditor` via the new branch.
- `pagesModel.addDrawPage(dataUrl, title)` (scripting API) → `addEditorPage("draw-view", "json", title, json)` → same path through `wrapLegacyForPage`.
- "Open in Drawing Editor" buttons (Image / SVG / Mermaid / Graph) → `pagesModel.addEditorPage("draw-view", "json", title, json)` → same path.

The legacy registry's `draw-view` entry stays populated (legacy `Editor` slot = `DrawView`; `createViewModel` = `createDrawViewModel`) for notebook embedding compatibility (DR1). The bare-adapter mirror in the v4 bridge loop drops `"draw-view"` from the bridge set — a native v4 registration replaces it (same mechanism as US-554 / US-560 / US-561 / US-562 / US-564).

### Notebook embedding — the GR1 lesson, applied upfront

`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` (per-note content-view dispatch — lines 25–44) reads `editorRegistry.getById(editor).loadModule()` at runtime and mounts the returned `module.Editor` inside `<AsyncEditor>`. The editor name is whatever's saved on the note (`state.editor`) — `"draw-view"` is a legitimate value if a user has built a notebook with a Draw-typed note.

US-554 originally collapsed the legacy md-view `loadModule` to `return textEditorModule`, which broke startup on sessions containing notebook-embedded markdown notes. The fix preserved the legacy view + view-model files and the eager `Promise.all([import(view), import(view-model)])` block in the legacy `loadModule`. US-560 / US-561 / US-562 / US-564 applied the same lesson up front.

**US-565 applies the same lesson up front**: keep `DrawView.tsx` + `DrawViewModel.ts` alive AND keep the legacy `loadModule`'s eager imports of both files. `drawLibrary.ts` and `drawExport.ts` are pure modules — they're imported by both the new `DrawEditor`/`DrawBody`/`DrawToolbarBits` AND the preserved `DrawView` AND the existing Image / SVG / Mermaid / Graph "Open in Drawing" callers. They stay unchanged.

**Caveat — multiple Excalidraw instances:** Excalidraw historically has issues with multiple instances on a single page. In practice this is unlikely to bite (a notebook with a draw-view note is rare), but if it surfaces during testing the fix is in US-557 (Notebook migration), not here. The preserved files give us the option to debug the notebook path without re-introducing the legacy code.

### Backwards compatibility — pre-US-565 session data

Today's session data:
- `<host.id>-host.txt` — Excalidraw JSON source; cache-keyed by editor id. Survives across migration since `DrawEditor` inherits the host's id (C9). No content shape change.
- `EditorDescriptor` shape — today's draw-view pages are persisted as `editor: "draw-view"` + `type: "textFile"` (legacy adapter shape). After US-565 they save as `editorId: "draw-view"` + a host descriptor (native v4 shape). v3 restore path auto-promotes pre-US-565 sessions by calling `wrapLegacyForPage` on the restored `TextFileModel` — the new Draw branch handles the promotion.
- **`darkMode`** — today's value is set to `isCurrentThemeDark()` on every reopen (theme-synced) and overridden again on every theme change. After US-565 the slot didn't exist before; the editor falls back to `isCurrentThemeDark()` on first construct (same behavior). First user toggle persists.
- Library data (`library.excalidrawlib`) — stored separately on disk via the `drawing.library-path` setting. Unaffected by migration.

No per-editor cache files to clean up — `DrawViewModel` never wrote any beyond the host cache file.

## Implementation plan

### Step 1 — Create `src/renderer/editors/draw/DrawEditor.ts`

New file. Skeleton mirrors `src/renderer/editors/mermaid/MermaidEditor.ts` (closest structural sibling) with the Draw-specific additions (three payload fields + guard + fingerprint + API ref + bidirectional `updateFromExcalidraw`). Estimated ~180 LOC.

```typescript
import { TComponentState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/v4/editor-traits";
import type { IContentHost } from "../base/v4/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence-v4";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel } from "../../api/pages/PageModel";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry as v4Registry } from "../base/v4/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { isCurrentThemeDark } from "../../theme/themes";
import { serializeAsJSON, FONT_FAMILY } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/dist/types/excalidraw/types";

/**
 * EPIC-028 / US-565 — native v4 Drawing (Excalidraw) editor. One class with
 * TextFileModel as its `IContentHost`. Replaces the legacy `DrawViewModel`
 * + `LegacyEditorAdapter` pair. Owns the sync JSON parse pipeline, the
 * bidirectional view→editor→host payload loop (with skipNextContentUpdate
 * guard + fingerprint optimization), and the darkMode toggle (HS1 host-slot
 * — DR4). Body of methods relocated byte-for-byte from legacy DrawViewModel.
 *
 * Design rationale: doc/tasks/US-565-draw-editor-migration/README.md.
 */

export type DrawQueueEvent = { type: "focus" };
export type DrawQueueRequest = never;

/**
 * HS1 host-slot shape — `darkMode` rides `host.editorSettings["draw-view"]`
 * so it survives Draw↔Monaco switches AND app restarts (DR4). Identical
 * mechanism to Mermaid's `lightMode` (US-562 / MR5 + HS1 amendment).
 */
interface DrawViewSettings {
    darkMode?: boolean;
}

export interface DrawEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["draw-view"]. Bounded boolean.
    // Default seeded from isCurrentThemeDark() in the constructor.
    darkMode: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV7 / MO5. Recomputed on every parse.
    error: string | null;
    loading: boolean;
}

export const defaultDrawEditorState: DrawEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    darkMode: true,
    error: null,
    loading: true,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class DrawEditor extends V4EditorModel<DrawEditorState, void, DrawQueueEvent> {
    readonly editorId = "draw-view";

    // ── Payload fields (relocated from legacy DrawViewModel) ────────────
    /** Excalidraw element array — mirror of parsed JSON. */
    private _elements: any[] = [];
    /** Excalidraw app-state — mirror of parsed JSON. */
    private _appState: Record<string, any> = {};
    /** Excalidraw file map (image fileId → file payload) — mirror of parsed JSON. */
    private _files: Record<string, any> = {};
    /** DR7 — prevents feedback loop when we push serialized content back to host. */
    private _skipNextContentUpdate = false;
    /** Fingerprint of elements + files for change detection (avoids dirty on scroll/select). */
    private _lastFingerprint = "";
    /** DR3 — live Excalidraw API ref; set by DrawBody on mount, cleared on unmount. */
    private _excalidrawApi: ExcalidrawImperativeAPI | null = null;

    // ── Host adoption state ─────────────────────────────────────────────
    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    readonly typedQueue: ComponentQueue<DrawQueueEvent, DrawQueueRequest>;

    constructor(state: TComponentState<DrawEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            DrawQueueEvent,
            DrawQueueRequest
        >;

        // DR4 — seed darkMode from theme on first construct. HS1 slot read in
        // adoptHost overrides this if the user previously toggled. Mirrors
        // MermaidEditor's constructor lightMode seeding.
        this.state.update((s) => {
            s.darkMode = isCurrentThemeDark();
        });

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from DrawEditor");
                this._tearDownHostSubscriptions();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    private _tearDownHostSubscriptions(): void {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + toolbar consumption (MK4 pattern from
     *  US-554; mirrors Svg/Html/Markdown/Mermaid/Graph). */
    get host(): TextFileModel | null {
        return this._host;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return v4Registry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor. darkMode rides host.editorSettings["draw-view"]
        // (HS1). loading/error stripped per PV7 / MO5.
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<DrawEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        // darkMode is NOT carried via descriptor — read from host.editorSettings
        // in adoptHost. View-derived state re-derived by initial parse.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `DrawEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("DrawEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (C9).
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        // Tag the host with the target editor id so submodels keep their assumptions.
        host.state.update((s) => {
            s.editor = this.editorId;
        });
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel("");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Drawing editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `wrapLegacyForPage` when constructing a fresh DrawEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // HS1 — seed `darkMode` from host slot (sync, no flicker). If the
        // slot is absent, retain the theme-derived default set in constructor.
        const saved = host.getEditorState<DrawViewSettings>(this.editorId);
        if (saved?.darkMode !== undefined) {
            this.state.update((s) => {
                s.darkMode = saved.darkMode!;
            });
        }

        // HS1 — mirror `darkMode` changes back to host slot. Slice-subscribe
        // keeps the mirror from firing on loading/error mutations (the
        // dominant write source) — only the bounded boolean triggers a
        // host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (darkMode) => {
                if (!this._host) return;
                this._host.setEditorState<DrawViewSettings>(this.editorId, {
                    darkMode: darkMode as boolean,
                });
            },
            (s) => s.darkMode,
        );

        // Content changes retrigger parse. The skipNextContentUpdate guard
        // (DR7) prevents the loop from our own updateFromExcalidraw writes.
        this._hostContentUnsub = host.state.subscribe(
            () => {
                if (this._skipNextContentUpdate) {
                    this._skipNextContentUpdate = false;
                    return;
                }
                this.parseContent(this._host?.state.get().content ?? "");
            },
            (s) => s.content,
        );

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);

        // DR6 — initial parse against the freshly-adopted host (mirrors
        // today's DrawViewModel.onInit's final parseContent call).
        this.parseContent(host.state.get().content);
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Parse pipeline (relocated verbatim from DrawViewModel) ──────────

    private parseContent(content: string): void {
        try {
            if (!content || content.trim() === "") {
                this._elements = [];
                this._appState = { currentItemFontFamily: FONT_FAMILY.Helvetica };
                this._files = {};
            } else {
                const data = JSON.parse(content);
                this._elements = data.elements || [];
                this._appState = data.appState || {};
                this._files = data.files || {};
            }
            this._lastFingerprint = this.computeFingerprint(this._elements, this._files);
            this.state.update((s) => { s.loading = false; s.error = null; });
        } catch (e) {
            this.state.update((s) => { s.loading = false; s.error = (e as Error).message; });
        }
    }

    /**
     * DR7 — Called from DrawBody when Excalidraw content changes (already
     * debounced in the view). Only pushes content to host when elements or
     * files actually change, ignoring appState-only changes (scroll, zoom,
     * cursor, selection).
     */
    updateFromExcalidraw(elements: readonly any[], appState: Record<string, any>, files: any): void {
        this._appState = appState;
        const fingerprint = this.computeFingerprint(elements, files);
        if (fingerprint === this._lastFingerprint) return;
        this._lastFingerprint = fingerprint;
        this._elements = [...elements];
        this._files = files;
        this._skipNextContentUpdate = true;
        const json = serializeAsJSON(elements as any, appState as any, files, "local");
        this._host?.changeContent(json, true);
    }

    /** Fast fingerprint of elements + files to detect real content changes. */
    private computeFingerprint(elements: readonly any[], files: any): string {
        const elPart = elements.map(
            (e) => `${e.id}:${e.version ?? 0}:${e.versionNonce ?? 0}`,
        ).join(";");
        const fileKeys = files ? Object.keys(files).sort().join(",") : "";
        return `${elPart}|${fileKeys}`;
    }

    // ── State mutators (relocated verbatim from DrawViewModel) ──────────

    toggleDarkMode = (): void => {
        this.state.update((s) => { s.darkMode = !s.darkMode; });
        // The slice-subscribe on `s.darkMode` (set up in adoptHost) fires
        // automatically and writes to the HS1 host slot. No explicit call.
    };

    // ── Public accessors (relocated verbatim) ───────────────────────────

    get elements(): any[] { return this._elements; }
    get appState(): Record<string, any> { return this._appState; }
    get files(): Record<string, any> { return this._files; }
    get excalidrawApi(): ExcalidrawImperativeAPI | null { return this._excalidrawApi; }

    setExcalidrawApi(api: ExcalidrawImperativeAPI): void {
        this._excalidrawApi = api;
    }

    clearExcalidrawApi(): void {
        this._excalidrawApi = null;
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this._tearDownHostSubscriptions();
        this._excalidrawApi = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

**Note on `syncDarkMode`:** today's `DrawViewModel` exposes `syncDarkMode` as a public mutator (called by the view's `useEffect` on `themeId` change). DR15 removes the theme-sync useEffect — HS1 now owns the value. `syncDarkMode` is NOT relocated to `DrawEditor`. No caller remains after migration.

### Step 2 — Create `src/renderer/editors/draw/DrawBody.tsx`

New file. Replaces today's `DrawView.tsx` body (for v4-native pages — the legacy file stays alive for notebook embedding per DR1). Estimated ~150 LOC.

The body relocates the entire JSX render block from legacy `DrawView` MINUS the portal toolbar block (lines ~290–339 in legacy). Those move to `index.tsx`'s `<TextChrome>` contributions (Step 3).

Substitutions for the relocated body:
- `const vm = useContentViewModel<DrawViewModel>(model, "draw-view")` → `const editor = model as DrawEditor` (prop is the editor, not the host).
- `useSyncExternalStore(vm? cb : ...)` → `editor.state.use((s) => ({ loading: s.loading, error: s.error, darkMode: s.darkMode }))` — reactive read.
- All `vm.X` reads/calls → `editor.X` (one-symbol rename — every method/field exists on `DrawEditor` with the same signature).
- The `if (!vm) return null` early-return is removed (the editor is always provided as a prop).
- The `apiRef = useRef<ExcalidrawImperativeAPI | null>(null)` view-local ref is REMOVED. The editor holds the API ref directly (DR3). The Excalidraw `excalidrawAPI` callback writes to `editor.setExcalidrawApi(api)` and the body's `useEffect` cleanup calls `editor.clearExcalidrawApi()`.
- The five export-helper callbacks (`handleCopyToClipboard`, `handleScreenSnip`, `saveMenuItems`, `openMenuItems`) MOVE to `index.tsx`'s `DrawToolbarBits` component (Step 3) — they need the API ref + host filePath + ui/fs/pagesModel/api, all of which are accessible from `editor`.
- The DR15 theme-sync `useEffect` is REMOVED (`themeId = settings.use("theme")` → `vm.syncDarkMode()` chain).

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, FONT_FAMILY, THEME, useHandleLibrary } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { Panel } from "../../uikit/Panel";
import { Spinner } from "../../uikit/Spinner";
import { EditorError } from "../base/EditorError";
import { ui } from "../../api/ui";
import { pagesModel } from "../../api/pages";
import { browserUrlChanged } from "../../core/state/events";
import type { DrawEditor } from "./DrawEditor";
import { createLibraryAdapter, initDefaultLibraryPath } from "./drawLibrary";

const LIBRARY_RETURN_URL = "https://jsnotepad.excalidraw-library/";

// Set Excalidraw asset path to local fonts (must be set before component mounts)
if (!(window as any).__EXCALIDRAW_ASSET_PATH_SET) {
    (window as any).EXCALIDRAW_ASSET_PATH = "app-asset://excalidraw/";
    (window as any).__EXCALIDRAW_ASSET_PATH_SET = true;
}

/**
 * EPIC-028 / US-565 — Draw editor body. Reads `editor.state.use(...)`
 * reactively. Renders the `<Excalidraw>` component + library hook +
 * library-URL listener. The Excalidraw `excalidrawAPI` callback writes the
 * imperative handle directly to `editor.setExcalidrawApi(api)`; toolbar bits
 * in `index.tsx` read it via `editor.excalidrawApi` for export operations.
 */
interface DrawBodyProps {
    model: DrawEditor;
}

export function DrawBody({ model: editor }: DrawBodyProps) {
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    const { loading, error, darkMode } = editor.state.use((s) => ({
        loading: s.loading,
        error: s.error,
        darkMode: s.darkMode,
    }));

    const excalidrawTheme = darkMode ? THEME.DARK : THEME.LIGHT;

    // Cleanup on unmount — clear debounce timer + release editor's API ref.
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            editor.clearExcalidrawApi();
        };
    }, [editor]);

    // ── Library persistence (DR15 — view-local effect) ─────────────────
    const libraryAdapter = useMemo(() => createLibraryAdapter(), []);
    useEffect(() => { initDefaultLibraryPath(); }, []);
    useHandleLibrary({ excalidrawAPI, adapter: libraryAdapter });

    // Intercept "Browse libraries" <a> click → open in internal browser.
    const handleWrapperClick = useCallback((e: React.MouseEvent) => {
        const anchor = (e.target as HTMLElement).closest("a.library-menu-browse-button");
        if (anchor) {
            e.preventDefault();
            const href = anchor.getAttribute("href");
            if (href) pagesModel.openUrlInBrowserTab(href);
        }
    }, []);

    // Listen for browser URL changes → handle Excalidraw library install URLs.
    useEffect(() => {
        const sub = browserUrlChanged.subscribe((event) => {
            const api = editor.excalidrawApi;
            if (!event || event.handled || !api) return;
            const { url } = event;
            if (!url.startsWith(LIBRARY_RETURN_URL)) return;
            const hashIndex = url.indexOf("#");
            if (hashIndex === -1) return;
            const params = new URLSearchParams(url.slice(hashIndex + 1));
            const libraryUrl = params.get("addLibrary");
            if (!libraryUrl) return;
            event.handled = true;
            const hostId = editor.host?.state.get().id;
            if (hostId) pagesModel.showPage(hostId);
            const decoded = decodeURIComponent(libraryUrl);
            fetch(decoded)
                .then((res) => res.blob())
                .then((blob) => {
                    api.updateLibrary({
                        libraryItems: blob as any,
                        merge: true,
                        prompt: true,
                        openLibraryMenu: true,
                    });
                })
                .catch((err) => {
                    ui.notify(`Failed to install library: ${(err as Error).message}`, "error");
                });
        });
        return () => sub.unsubscribe();
    }, [editor]);

    // Debounced Excalidraw onChange → editor.updateFromExcalidraw.
    const handleChange = useCallback(
        (elements: readonly any[], appState: any, files: any) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                editor.updateFromExcalidraw(elements, appState, files);
            }, 500);
        },
        [editor],
    );

    if (error) return <EditorError>{error}</EditorError>;
    if (loading) return <Spinner />;

    return (
        <Panel name="draw-root" direction="column" flex={1} overflow="hidden" position="relative">
            <div
                style={{ flex: "1 1 auto", width: "100%", height: "100%" }}
                onContextMenu={(e) => e.stopPropagation()}
                onClick={handleWrapperClick}
            >
                <Excalidraw
                    excalidrawAPI={(excApi) => {
                        editor.setExcalidrawApi(excApi);
                        setExcalidrawAPI(excApi);
                    }}
                    libraryReturnUrl={LIBRARY_RETURN_URL}
                    initialData={{
                        elements: editor.elements,
                        appState: {
                            ...editor.appState,
                            currentItemFontFamily: editor.appState.currentItemFontFamily ?? FONT_FAMILY.Helvetica,
                        },
                        files: editor.files,
                    }}
                    theme={excalidrawTheme}
                    onChange={handleChange}
                    UIOptions={{
                        canvasActions: {
                            loadScene: false,
                            saveToActiveFile: false,
                            export: false,
                            toggleTheme: false,
                        },
                    }}
                />
            </div>
        </Panel>
    );
}
```

### Step 3 — Create `src/renderer/editors/draw/index.tsx`

New file. Replaces today's `index.ts`. Exports `EditorModule` (`drawModule`), the `DrawEditorView` shell with `<TextChrome>` contributions (5 top-right toolbar buttons), and re-exports the class. Estimated ~280 LOC.

The five export-helper callbacks relocate from legacy `DrawView.tsx` lines ~165–276 into `DrawToolbarBits`. They read everything from the editor instance:

```typescript
import { useCallback, useMemo } from "react";
import { TComponentState } from "../../core/state/state";
import { DrawEditor, defaultDrawEditorState } from "./DrawEditor";
import { DrawBody } from "./DrawBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit/IconButton";
import { WithMenu, type MenuItem } from "../../uikit/Menu";
import { SunIcon, MoonIcon, CopyIcon, DownloadIcon, NewWindowIcon, SnipIcon } from "../../theme/icons";
import { exportAsSvgText, exportAsPngBlob, getImageDimensions, IMAGE_OFFSET_X, IMAGE_OFFSET_Y } from "./drawExport";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { ui } from "../../api/ui";
import { fs } from "../../api/fs";
import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { fpBasename } from "../../core/utils/file-path";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-565 — native Drawing editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native DrawEditor instance.
 *
 * Right-toolbar bits (relocates legacy DrawView's portal toolbar buttons):
 *   - theme toggle — sun/moon icon, calls editor.toggleDarkMode
 *   - copy-image — canvas.toBlob → clipboard
 *   - save dropdown — Save as SVG / Save as PNG (file picker)
 *   - open dropdown — Open as SVG (new tab) / Open as Image (new tab)
 *   - screen-snip — captures screen region → adds as image element
 *
 * The Excalidraw component itself lives in DrawBody. Excalidraw provides its
 * own canvas UI (toolbar, sidebar, library menu) — no in-editor overlay
 * toolbar is needed.
 */

interface DrawToolbarBitsProps {
    model: DrawEditor;
}

function DrawToolbarBits({ model: editor }: DrawToolbarBitsProps) {
    const { darkMode } = editor.state.use((s) => ({ darkMode: s.darkMode }));

    const getDefaultName = useCallback((ext: string): string => {
        const filePath = editor.host?.state.get().filePath;
        if (filePath) {
            const base = fpBasename(filePath).replace(/\.excalidraw$/i, "");
            return `${base}.${ext}`;
        }
        return `drawing.${ext}`;
    }, [editor]);

    const hasElements = useCallback((): boolean => {
        const a = editor.excalidrawApi;
        if (!a) return false;
        if (a.getSceneElements().length === 0) {
            ui.notify("Nothing to export — the drawing is empty", "warning");
            return false;
        }
        return true;
    }, [editor]);

    const handleCopyToClipboard = useCallback(async () => {
        const a = editor.excalidrawApi;
        if (!a || !hasElements()) return;
        const blob = await exportAsPngBlob(a);
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 300));
    }, [editor, hasElements]);

    const handleScreenSnip = useCallback(async () => {
        const a = editor.excalidrawApi;
        if (!a) return;
        const dataUrl = await api.startScreenSnip();
        if (!dataUrl) return;
        const dims = await getImageDimensions(dataUrl);
        const fileId = crypto.randomUUID();
        a.addFiles([{
            id: fileId as any,
            dataURL: dataUrl as any,
            mimeType: "image/png" as any,
            created: Date.now(),
        }]);
        const maxDim = 1200;
        const longer = Math.max(dims.width, dims.height);
        const scale = longer > maxDim ? maxDim / longer : 1;
        const w = Math.round(dims.width * scale);
        const h = Math.round(dims.height * scale);
        const newElements = convertToExcalidrawElements([{
            type: "image",
            x: IMAGE_OFFSET_X,
            y: IMAGE_OFFSET_Y,
            width: w,
            height: h,
            fileId: fileId as any,
            status: "saved",
        } as any]);
        const existing = a.getSceneElements();
        a.updateScene({ elements: [...existing, ...newElements] });
    }, [editor]);

    const saveMenuItems = useMemo((): MenuItem[] => [
        {
            label: "Save as SVG",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const svgText = await exportAsSvgText(a);
                    const savePath = await fs.showSaveDialog({
                        title: "Save as SVG",
                        defaultPath: getDefaultName("svg"),
                        filters: [{ name: "SVG", extensions: ["svg"] }],
                    });
                    if (savePath) await fs.write(savePath, svgText);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
        {
            label: "Save as PNG",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const blob = await exportAsPngBlob(a);
                    const buffer = Buffer.from(await blob.arrayBuffer());
                    const savePath = await fs.showSaveDialog({
                        title: "Save as PNG",
                        defaultPath: getDefaultName("png"),
                        filters: [{ name: "PNG", extensions: ["png"] }],
                    });
                    if (savePath) await fs.saveBinaryFile(savePath, buffer);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
    ], [editor, getDefaultName, hasElements]);

    const openMenuItems = useMemo((): MenuItem[] => [
        {
            label: "Open as SVG",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const svgText = await exportAsSvgText(a);
                    pagesModel.addEditorPage("svg-view", "xml", getDefaultName("svg"), svgText);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
        {
            label: "Open as Image",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const blob = await exportAsPngBlob(a);
                    const blobUrl = URL.createObjectURL(blob);
                    pagesModel.openImageInNewTab(blobUrl);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
    ], [editor, getDefaultName, hasElements]);

    return (
        <>
            <IconButton
                name="draw-theme"
                size="sm"
                title={darkMode ? "Switch to Light Theme" : "Switch to Dark Theme"}
                icon={darkMode ? <SunIcon /> : <MoonIcon />}
                onClick={editor.toggleDarkMode}
            />
            <IconButton
                name="draw-copy-image"
                size="sm"
                title="Copy Image to Clipboard"
                icon={<CopyIcon />}
                onClick={handleCopyToClipboard}
            />
            <WithMenu items={saveMenuItems}>
                {(setOpen) => (
                    <IconButton
                        name="draw-save"
                        size="sm"
                        title="Save as file"
                        icon={<DownloadIcon />}
                        onClick={(e) => setOpen(e.currentTarget)}
                    />
                )}
            </WithMenu>
            <WithMenu items={openMenuItems}>
                {(setOpen) => (
                    <IconButton
                        name="draw-open-new-tab"
                        size="sm"
                        title="Open in new tab"
                        icon={<NewWindowIcon />}
                        onClick={(e) => setOpen(e.currentTarget)}
                    />
                )}
            </WithMenu>
            <IconButton
                name="draw-snip"
                size="sm"
                title="Screen Snip"
                icon={<SnipIcon />}
                onClick={handleScreenSnip}
            />
        </>
    );
}

function DrawEditorView({ model }: { model: V4EditorModel }) {
    const draw = model as DrawEditor;
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<DrawToolbarBits model={draw} />}
        >
            <DrawBody model={draw} />
        </TextChrome>
    );
}

export const drawModule: EditorModule = {
    createEditor: () =>
        new DrawEditor(new TComponentState({ ...defaultDrawEditorState })),
    Component: DrawEditorView,
};

export { DrawEditor, defaultDrawEditorState };
export type { DrawEditorState, DrawQueueEvent } from "./DrawEditor";
```

### Step 4 — DO NOT delete `DrawView.tsx` / `DrawViewModel.ts` / pure modules

Per DR1 — the legacy files stay alive for notebook embedding. Today's `index.ts` (re-exports `DrawView` / `DrawViewProps`) is replaced by `index.tsx` (new surface above). The `index.ts` file is DELETED only because `index.tsx` supersedes it.

This means:
- `DrawView.tsx` continues to exist, continues to import `DrawViewModel`, continues to use `useContentViewModel`, continues to render canvas + portal toolbar. Page-level open-file flow won't reach it (the v4 path wraps via `wrapLegacyForPage`), but notebook per-note dispatch will via `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor`.
- `DrawViewModel.ts` continues to exist for `NoteItemEditModel.acquireViewModel("draw-view")` calls (if any notebook ever uses a draw-typed note).
- `drawLibrary.ts` and `drawExport.ts` are pure modules — consumed by both the new `DrawEditor`/`DrawBody`/`DrawToolbarBits` AND the preserved `DrawView` AND the external Image/SVG/Mermaid/Graph "Open in Drawing" callers. They stay unchanged.

### Step 5 — Update `src/renderer/api/pages/PagesLifecycleModel.ts`

Two changes (mirrors US-564):

**Change 1** — add Draw branch in `wrapLegacyForPage` after the Graph branch (~line 184):

```typescript
// EPIC-028 / US-565 — Draw migrated to native v4 module. Construct
// DrawEditor over the legacy TextFileModel host. The initial parseContent()
// call kicks off inside adoptHost (mirrors today's DrawViewModel.onInit →
// parseContent behavior).
if (isTextFile && targetEditorId === "draw-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const draw = new DrawEditor(
        new TComponentState({ ...defaultDrawEditorState, id }),
    );
    draw.adoptHost(legacy as TextFileModel);
    return draw;
}
```

**Change 2** — add import after the Graph import on line 20:

```typescript
import { DrawEditor, defaultDrawEditorState } from "../../editors/draw";
```

### Step 6 — Update `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts`

Flip from wrapping `DrawViewModel` to wrapping `DrawEditor`. All 6 getters/methods keep their bodies — only the constructor parameter type and the `this.vm.X` reads change to `this.editor.X` (one-symbol rename). The dynamic imports of `@excalidraw/excalidraw` and `drawExport` stay async.

```typescript
import type { DrawEditor } from "../../editors/draw";

/**
 * Safe facade around DrawEditor for script access.
 * Implements the IDrawEditor interface from api/types/draw-editor.d.ts.
 *
 * All heavy imports (Excalidraw, drawExport) are dynamic to keep the
 * scripting bundle small — Excalidraw is only loaded when actually needed.
 */
export class DrawEditorFacade {
    constructor(private readonly editor: DrawEditor) {}

    get elementCount(): number {
        return this.editor.elements.length;
    }

    get editorIsMounted(): boolean {
        return this.editor.excalidrawApi !== null;
    }

    async addImage(
        dataUrl: string,
        options?: { x?: number; y?: number; maxDimension?: number },
    ): Promise<void> {
        const api = this.editor.excalidrawApi;
        if (!api) {
            throw new Error(
                "addImage() requires the drawing editor to be mounted. " +
                "Use app.pages.addDrawPage(dataUrl) to create a new page with an image instead.",
            );
        }
        const [{ convertToExcalidrawElements }, { getImageDimensions, capDimensions }] =
            await Promise.all([
                import("@excalidraw/excalidraw"),
                import("../../editors/draw/drawExport"),
            ]);
        const dims = await getImageDimensions(dataUrl);
        const fileId = crypto.randomUUID();
        const { width, height } = capDimensions(dims.width, dims.height, options?.maxDimension);
        api.addFiles([{
            id: fileId as any,
            dataURL: dataUrl as any,
            mimeType: "image/png" as any,
            created: Date.now(),
        }]);
        const newElements = convertToExcalidrawElements([{
            type: "image",
            x: options?.x ?? 250,
            y: options?.y ?? 120,
            width,
            height,
            fileId: fileId as any,
            status: "saved",
        } as any]);
        const existing = api.getSceneElements();
        api.updateScene({ elements: [...existing, ...newElements] });
    }

    async exportAsSvg(): Promise<string> {
        const { exportSceneAsSvgText } = await import("../../editors/draw/drawExport");
        return exportSceneAsSvgText({
            elements: this.editor.elements,
            appState: this.editor.appState,
            files: this.editor.files,
        });
    }

    async exportAsPng(options?: { scale?: number }): Promise<string> {
        const { exportSceneAsPngBlob } = await import("../../editors/draw/drawExport");
        const blob = await exportSceneAsPngBlob(
            {
                elements: this.editor.elements,
                appState: this.editor.appState,
                files: this.editor.files,
            },
            options?.scale,
        );
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to convert PNG to data URL"));
            reader.readAsDataURL(blob);
        });
    }
}
```

### Step 7 — Update `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Flip `asDraw(force?: boolean)` to consume `DrawEditor` directly (lines 19, 292–301).

```typescript
// at the top (~line 19): remove the DrawViewModel type-import; add value-import:
import { DrawEditor } from "../../editors/draw";

// at line ~292:
async asDraw(force = false): Promise<DrawEditorFacade> {
    await this.ensureEditor("draw-view", "Draw", "asDraw", force);
    // EPIC-028 / US-565 — Draw is v4-native. After ensureEditor, the
    // page's mainEditorV4 IS a DrawEditor; the facade wraps it directly.
    // No acquireViewModel round-trip.
    const v4 = this.v4;
    if (!(v4 instanceof DrawEditor)) {
        throw new Error("asDraw(): page is not a DrawEditor after switch");
    }
    return new DrawEditorFacade(v4);
}
```

Removes `model.acquireViewModel("draw-view")` + `releaseList.push(() => model.releaseViewModel("draw-view"))` — mirrors the `asSvg` / `asHtml` / `asMarkdown` / `asMermaid` / `asGraph` pattern.

### Step 8 — Update `src/renderer/editors/register-editors.ts`

Three changes (mirrors US-564):

**Change 1** — keep the legacy `draw-view` `loadModule` AS-IS (eager imports of `DrawView` + `DrawViewModel`). Add a comment to document why (parallel to the graph-view comment block):

```typescript
// Drawing editor (content-view for .excalidraw files — Excalidraw canvas)
editorRegistry.register({
    id: "draw-view",
    name: "Drawing",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.excalidraw$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        if (languageId !== "json") return -1;
        if (fileName && matchesPattern(fileName, /\.excalidraw$/i)) return 10;
        return -1;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "json") return false;
        return /^\s*\{\s*"type"\s*:\s*"excalidraw"/.test(content);
    },
    loadModule: async () => {
        // EPIC-028 / US-565 — Draw migrated to native v4 module
        // (`drawModule` in `./draw/index.tsx`). Legacy DrawView +
        // DrawViewModel are PRESERVED here because notebook per-note
        // dispatch (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`)
        // still consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createDrawViewModel }] = await Promise.all([
            import("./draw/DrawView"),
            import("./draw/DrawViewModel"),
        ]);
        return {
            Editor: module.DrawView,
            createViewModel: createDrawViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

**Change 2** — drop `"draw-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 756):

```typescript
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    // svg-view removed — US-560 ships native v4 module.
    // html-view removed — US-561 ships native v4 module.
    // mermaid-view removed — US-562 ships native v4 module.
    // graph-view removed — US-564 ships native v4 module.
    // draw-view removed — US-565 ships native v4 module.
    "notebook-view",
    "todo-view",
    "link-view",
    "rest-client",
]);
```

**Change 3** — append the native v4 registration override after the US-564 block (~line 1050):

```typescript
// US-565 — replace the legacy bare-adapter mirror for draw-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` to avoid
// duplicating extension/language rules.
v4EditorRegistry.register({
    id: "draw-view",
    name: "Drawing",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("draw-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { drawModule } = await import("./draw");
        return drawModule;
    },
});
```

### Step 9 — Delete `src/renderer/editors/draw/index.ts`

After step 3 there is `index.tsx` with the new surface. Today's `index.ts` only re-exports `DrawView` + `DrawViewProps`; those names are still importable directly from `./DrawView.tsx` for the notebook embedding path (the legacy `loadModule` uses `import("./draw/DrawView")` directly — verified in step 8 change 1). Delete it cleanly.

Before deleting, confirm with grep that nothing outside the draw folder imports from `./draw/index`:

```powershell
Grep "from.*editors/draw['\"]" src\
Grep "from.*editors/draw/index['\"]" src\
```

These should return hits only in the four expected sites:
- `PagesLifecycleModel.ts` — `from "../../editors/draw"` → after Step 5 resolves to `index.tsx` exports.
- `PageWrapper.ts` — same.
- `DrawEditorFacade.ts` — same.
- Existing `from "../../editors/draw/DrawView"` / `from "../draw/drawExport"` direct-file imports — unaffected.

### Step 10 — Files that need NO changes

To save investigation time during implementation, these are confirmed unaffected:

- `src/renderer/editors/draw/DrawView.tsx` — preserved verbatim for notebook embedding (DR1). No edits to this file.
- `src/renderer/editors/draw/DrawViewModel.ts` — preserved verbatim for notebook embedding (DR1). No edits.
- `src/renderer/editors/draw/drawLibrary.ts` — pure module; consumed by both `DrawBody` (new) and `DrawView` (preserved). No change.
- `src/renderer/editors/draw/drawExport.ts` — pure module; consumed by `DrawToolbarBits` (new) AND `DrawView` (preserved) AND external Image/SVG/Mermaid/Graph callers via `buildExcalidrawJsonWithImage`. No change.
- `src/renderer/api/types/draw-editor.d.ts` — `IDrawEditor` interface (async addImage / exportAsSvg / exportAsPng + sync elementCount / editorIsMounted). Facade shape preserved. No change.
- `src/renderer/api/types/common.d.ts` — `EditorView` union still contains `"draw-view"`. No change.
- `src/shared/types.ts` — same union. No change.
- `src/renderer/editors/image/ImageViewer.tsx` — `addEditorPage("draw-view", ...)` from "Open in Drawing Editor" button. Editor id unchanged.
- `src/renderer/editors/svg/index.tsx` — `addEditorPage("draw-view", ...)`. Unchanged.
- `src/renderer/editors/mermaid/index.tsx:50` — `addEditorPage("draw-view", ...)`. Unchanged.
- `src/renderer/editors/graph/index.tsx:42` — `addEditorPage("draw-view", ...)`. Unchanged.
- `src/main/mcp-http-server.ts` — MCP tool description string literals. Editor id unchanged.
- `src/renderer/api/pages/PagesPersistenceModel.ts` — shape-based discriminator `d.host !== undefined` (US-561 fix) auto-includes Draw descriptors. No edit needed.
- `src/renderer/api/pages/PageModel.ts` — already supports v4-native main editors.
- `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` — dispatches via `editorRegistry.getById(editor).loadModule()` for non-monaco editors. The legacy `draw-view` `loadModule` stays populated → no change needed.
- `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` — `acquireViewModel("draw-view")` reaches the legacy `createDrawViewModel` via the preserved `loadModule`. No change.
- `src/renderer/editors/base/v4/LegacyEditorAdapter.ts` — comment listing example content-view ids. Cosmetic only; leave alone.
- `src/renderer/api/settings.ts` — `drawing.library-path` setting. Unaffected.

## Concerns / open questions

### DR1 — Notebook per-note Draw dispatch (the GR1 lesson, applied upfront)

**Context:** identical to the GR1 lesson from US-564. `NoteItemActiveEditor.tsx` (lines 25–44) mounts `<AsyncEditor>` for any non-monaco editor by calling `editorRegistry.getById(editor).loadModule()`. If a user has a Draw-typed note in a notebook, collapsing the legacy `loadModule` to `return textEditorModule` would crash startup on session restore.

**Resolution:** apply the US-554+ retrospective up front. Keep `DrawView.tsx` + `DrawViewModel.ts` alive as parallel implementation; keep the legacy `loadModule` returning the eager `Promise.all` imports; register the v4 native module separately. Page-level pages take the v4 path; notebook-embedded notes take the legacy path. Both coexist until US-557 migrates Notebook.

**Caveat — Excalidraw multiple-instance issues:** historically Excalidraw can be brittle when multiple instances mount on a single page. If notebook embedding of draw-view ever surfaces issues, the fix is in US-557 (Notebook), not here. Preserving the legacy files keeps the option open without re-introducing legacy code.

No design decision needed — pattern locked in by US-554's fix and US-560 / US-561 / US-562 / US-564's preemptive applications. Step 8 Change 1 documents this in a code comment so future maintainers don't try to collapse the loader.

**Verification during implementation:** if you have a real notebook with a draw-view note, reload the app and confirm the note renders without console errors. Otherwise this concern is preventive — no active test, just the file preservation.

### DR2 — No canvas-ref bridge needed (contrast with GR2)

**Context:** Graph (GR2) and Mermaid (MR2) hold a view-local `canvasRef` / `imageRef` so the page-level toolbar buttons can read `canvas.toDataURL` / `imageRef.copyToClipboard()`. Draw doesn't need this pattern because the toolbar bits already need the **Excalidraw imperative API** (`editor.excalidrawApi`) — that's the single source of truth for canvas access. The API exposes `getSceneElements` / `getFiles` / `getAppState` / `updateScene` / `addFiles` directly; toolbar bits read it from `editor.excalidrawApi`.

**Resolution:** no view-local bridge. The toolbar bits in `index.tsx` access `editor.excalidrawApi` via the typed getter. The body's Excalidraw `excalidrawAPI` callback writes to `editor.setExcalidrawApi(api)` on mount; `useEffect` cleanup calls `editor.clearExcalidrawApi()` on unmount.

### DR3 — `_excalidrawApi` instance field on the editor (mirror of GR3)

**Context:** today's `DrawViewModel` holds `_excalidrawApi: ExcalidrawImperativeAPI | null` as a private field with public `setExcalidrawApi` / `clearExcalidrawApi` / `excalidrawApi` getter. The view writes on mount, the facade reads for `addImage`, the toolbar reads for export operations.

Three candidates for migration:

(a) **Keep it as instance field on `DrawEditor`** (mirrors today). Body sets/clears in useEffect; facade reads via getter.

(b) **Move it to body-local state + thread it through props** to editor methods. Editor methods (like `updateFromExcalidraw`) would not need it; only toolbar/facade do.

(c) **Promote it to queue events** (`{type: "registerApi", api}` etc.).

**Resolution (a)** — instance field. Reasons:
1. **Minimal change.** Same pattern as today's VM; only one-symbol rename in `DrawEditorFacade` (`vm` → `editor`).
2. **Toolbar bits live in `index.tsx`** (the view shell, NOT the body). They need access to the API independently of body lifecycle. Reading from `editor.excalidrawApi` is straightforward; threading through React props would require a context provider.
3. **Facade access pattern.** `DrawEditorFacade.addImage` reads `editor.excalidrawApi` to mount-check. With (b), the facade would need to query the body — adding async indirection without benefit.
4. **Sibling precedent.** Graph (GR3) made the same call for view-attached editor instance fields (`onDoubleClickNode`, `isPopupOpen`, `onHighlightSelection`). Consistent shape.

Rejected (b) — would split single-source-of-truth across view + editor. Rejected (c) — queue indirection introduces unnecessary async hops for what's a pure DOM-ref pattern.

**Edge case — body unmounts while toolbar is still on screen:** impossible in normal flow because both live inside `<TextChrome>` and unmount together. Even if the body were to remount (e.g., React DevTools force-refresh), the `useEffect` cleanup calls `clearExcalidrawApi`, then the new mount calls `setExcalidrawApi`. Brief window of `null` is handled by the `if (!api) return` guards in all toolbar callbacks.

### DR4 — `darkMode` HS1 host-slot persistence (NEW UX upgrade)

**Context:** today's `defaultDrawViewState.darkMode = true`. `DrawViewModel.onInit` sets `s.darkMode = isCurrentThemeDark()`. The view's `useEffect` on `settings.use("theme")` calls `vm.syncDarkMode()` on every theme change, resetting `darkMode` to `isCurrentThemeDark()` — overriding the user's manual toggle.

This is a UX inconsistency in today's behavior: the user toggles via the Sun/Moon icon, but the next theme change resets their choice. Not ideal.

**Without HS1:** the new DrawEditor would inherit the same behavior unchanged.

**With HS1 (this task):** `adoptHost` writes `host.setEditorState("draw-view", { darkMode: <value> })` on every toggle (via the `_settingsUnsub` mirror). On switch-back or restart, the new DrawEditor's `adoptHost` reads `host.getEditorState("draw-view")` and applies the saved value. User toggle preserved.

**Resolution:** HS1 mirror set up in `adoptHost` per step 1. No design ambiguity — this is the canonical HS1 pattern, already proven for Markdown's `compactMode` (US-554), Mermaid's `lightMode` (US-562), and Graph's `groupingEnabled` (US-564).

**Edge case — pre-US-565 sessions reopening:** sessions saved before US-565 do NOT have the slot. The fallback to `isCurrentThemeDark()` matches today's behavior on first construct. No regression. The first user toggle persists.

**Edge case — switch to Monaco and back twice in rapid succession:** the slot write is sync (`setEditorState` updates host.state in-place); the slot read is sync (`getEditorState` reads from host.state); no race.

### DR5 — No submodels (contrast with GR5)

**Context:** Graph (GR5) owns six submodels (~1100 LOC of orchestration). Draw owns NONE — `DrawViewModel` is ~125 LOC with no submodels, no event-handler wiring, no derived state beyond the three payload fields.

**Resolution:** no submodel relocation step. Step 1's `DrawEditor` constructor declares only the host-tied fields (subscriptions, timers, _host) — no `readonly` submodel fields.

### DR6 — Initial `parseContent` kickoff in `adoptHost` (mirror of GR6 / MR3)

**Context:** today's `DrawViewModel.onInit()` ends with `this.parseContent(this.host.state.get().content)`. This kicks off the first parse against the freshly-loaded host content.

Per TOneState semantics (confirmed during US-562 MR3 and US-564 GR6): `subscribe(cb, selector)` only fires on subsequent `state.update` calls where the selector value changes. So the content slice-subscribe alone would leave the first parse dependent on a content change that may never happen.

**Resolution:** explicit `this.parseContent(host.state.get().content)` kickoff at the end of `adoptHost`. Step 1's `adoptHost` ends with this call.

**Why sync `parseContent` instead of any debounce?** Draw's parse is `JSON.parse` only — completes in microseconds. No debounce needed. Today's VM uses sync parseContent throughout; preserved.

### DR7 — `_skipNextContentUpdate` serialization round-trip guard (preserved verbatim)

**Context:** today's `DrawViewModel.updateFromExcalidraw` calls `this.host.changeContent(JSON.stringify(json, null, 4), true)` after every edit. This triggers `host.state.update((s) => { s.content = ... })`, which would propagate back through the v4 `_hostContentUnsub` subscription and re-parse the just-written JSON — wasteful + introduces a parse flicker.

The legacy VM guards against this with a `_skipNextContentUpdate` flag (line 33). Same shape as Graph's `skipNextContentUpdate` (GR7).

**Resolution:** preserved verbatim. The flag becomes a private field on `DrawEditor`; the guard moves into the `_hostContentUnsub` callback. Step 1 confirms.

**Edge case — external content change while skipNextContentUpdate is true:** if the user (or another script) modifies content via an unrelated path (e.g., via the script API `page.content = ...`) AT THE SAME TIME the editor is serializing, the external change would be silently dropped. This is a pre-existing risk in the legacy code — not introduced by the migration. Out of scope to fix here.

### DR8 — No `isFirstLoad` flag — Excalidraw uses `initialData` prop only

**Context:** Graph (GR8) has an `isFirstLoad` flag controlling whether the renderer does a full-sim initialization or position-preserving update. Draw has no such flag — Excalidraw's `initialData` prop is only consumed once (on first mount); subsequent updates flow through `updateScene` calls on the imperative API (which is what `addImage` etc. in the toolbar do).

**Migration concern:** on Monaco↔Draw switch, a new `DrawEditor` is constructed → `parseContent` populates `_elements/_appState/_files` → `loading` flips to false → body mounts `<Excalidraw>` with `initialData={{ elements: editor.elements, ... }}` → Excalidraw initializes from this data. Correct.

**Resolution:** no flag needed. Step 1 confirms the constructor + adoptHost flow.

### DR9 — Body composition: Excalidraw stays in body; 5 portal toolbar buttons move to `<TextChrome>` (mirror of GR9)

**Context:** legacy `DrawView.tsx` has ONE toolbar region (no in-canvas overlay — Excalidraw provides its own canvas UI):
1. **Page-top portal toolbar** (lines ~291–339) — rendered via `createPortal(... , model.editorToolbarRefLast)`. Houses 5 buttons: theme toggle / copy-image / save dropdown / open dropdown / screen-snip. This is a **page-level chrome concern** — same row as the page tab's switch widget.

NO footer.

**Migration:**
- The Excalidraw component itself + the library hook + the library URL listener stay inside `DrawBody.tsx` (Step 2).
- The 5 portal toolbar buttons (with their export-helper callbacks) move to `<TextChrome rightToolbarContributions={<DrawToolbarBits/>}>` in `index.tsx` (Step 3). The portal disappears.

`TextChrome`'s `rightToolbarContributions` slot (per the file's docstring at lines 41–47 + 119–134) renders AFTER the auto-spacer in `<PageToolbar>` and BEFORE the switch widget. Already proven by US-562 (Mermaid uses it for 3 toolbar bits) and US-564 (Graph uses it for 2 buttons).

**Resolution:** confirmed. Step 2 + Step 3 split the composition along these lines. The legacy `DrawView.tsx` portal block (for the preserved file) stays as-is — the v4 page-level path doesn't reach it.

**Edge case — no `footerContributions` needed.** Today's Draw has no footer extension (the page-bottom row in legacy mode shows only encoding/script-toggle from `TextChrome`'s defaults). Don't pass `footerContributions` to `<TextChrome>`.

### DR10 — Persistence: identity-only descriptor (PV7), all view state stripped

See the "Persistence story" section in Background. Identity-only descriptor; `darkMode` rides HS1 host-slot; `loading` + `error` are recomputed on next parse. Mirrors US-562 / US-564 directly. No design ambiguity.

### DR11 — Facade flip — one-symbol rename + async methods unchanged

**Context:** today's `DrawEditorFacade` reads `this.vm.elements`, `this.vm.appState`, `this.vm.files`, `this.vm.excalidrawApi`. The facade has 2 sync getters (`elementCount`, `editorIsMounted`) + 3 async methods (`addImage`, `exportAsSvg`, `exportAsPng`). The async methods dynamic-import `@excalidraw/excalidraw` and `drawExport` — these dynamic imports stay async post-migration.

**Migration:** flip the constructor parameter type from `DrawViewModel` to `DrawEditor`. Find/replace `this.vm` → `this.editor`. No call signatures change (the underlying fields are identical).

**Resolution:** mechanical rename. Step 6 confirms.

### DR12 — `PageWrapper.asDraw` — instanceof check + drop `acquireViewModel`

**Context:** today's `PageWrapper.asDraw` (lines 292–301):
```typescript
async asDraw(force = false): Promise<DrawEditorFacade> {
    await this.ensureEditor("draw-view", "Draw", "asDraw", force);
    const model = this.model;
    if (!isTextFileModel(model)) {
        throw new Error("asDraw(): page lost its text host during switch");
    }
    const vm = await model.acquireViewModel("draw-view") as DrawViewModel;
    this.releaseList.push(() => model.releaseViewModel("draw-view"));
    return new DrawEditorFacade(vm);
}
```

**Migration:** mirror `asGraph` (US-564 / Step 7) — instanceof check on `DrawEditor`; drop the `acquireViewModel` + releaseList push.

**Resolution:** see Step 7 above. Same shape as the other migrated `asX` methods.

### DR13 — `addEditorPage("draw-view", ...)` callers — all unchanged

**Context:** five external sites call `pagesModel.addEditorPage("draw-view", "json", title, content)`:
1. `src/renderer/api/pages/PagesLifecycleModel.ts:405` — `addDrawPage(dataUrl, title)` method, called by the scripting API.
2. `src/renderer/editors/image/ImageViewer.tsx` — "Open in Drawing Editor" toolbar button.
3. `src/renderer/editors/svg/index.tsx` — "Open in Drawing Editor" toolbar bit.
4. `src/renderer/editors/mermaid/index.tsx:50` — "Open in Drawing Editor" toolbar bit (the US-562 version).
5. `src/renderer/editors/graph/index.tsx:42` — "Open in Drawing Editor" toolbar bit (the US-564 version).

After migration:
- All five sites are unchanged. Each creates a new page that takes the v4 path via `wrapLegacyForPage`'s new Draw branch (Step 5).

**Resolution:** no changes to call sites. The editor id `"draw-view"` is preserved across the migration.

**Verification during implementation:**
- `app.pages.addDrawPage(dataUrl)` from a script → new DrawEditor page opens with the image element pre-loaded.
- Open an image → click "Open in Drawing Editor" toolbar button → new DrawEditor page opens with the image embedded.
- Open an SVG → click "Open in Drawing Editor" → new DrawEditor page opens with SVG-as-image embedded.
- Open a Mermaid diagram → click "Open in Drawing Editor" → new DrawEditor page opens with rendered Mermaid-as-image embedded.
- Open a Graph → click "Open in Drawing Editor" → new DrawEditor page opens with canvas snapshot embedded.

### DR14 — Queue event union — `focus` only (same as siblings)

**Context:** PV8 from walkthrough 22 mandates all migrated editors get `{ type: "focus" }` queue events for `<TextChrome>`'s TC8 200 ms root-focus subscription.

For Draw: the Excalidraw component manages its own focus internally (canvas grabs focus on click). No explicit focus handling in DrawBody beyond `<TextChrome>`'s wrapper.

**Resolution:** mirror the siblings. `type DrawQueueEvent = { type: "focus" }`; `type DrawQueueRequest = never`. No body-side `editor.typedQueue.use(...)` is strictly needed (no consumer), but follow the sibling pattern for consistency if a future need arises — actually omit it. Mermaid omits this no-op as well; only Graph adds it because it has explicit double-click handling.

Step 1 confirms: `typedQueue` is constructed but no body subscription is needed.

### DR15 — Removed `syncDarkMode` theme-sync useEffect (behavior change)

**Context:** today's `DrawView.tsx` (lines 60–63):
```typescript
const themeId = settings.use("theme");
useEffect(() => {
    vm?.syncDarkMode();
}, [themeId, vm]);
```

This calls `vm.syncDarkMode()` whenever the app's theme changes, which sets `s.darkMode = isCurrentThemeDark()` — overriding any user-toggled `darkMode`.

**Migration:** with DR4 (HS1 persistence) the user's choice is the source of truth. The theme-sync useEffect is REMOVED from `DrawBody.tsx`. The constructor's one-time seeding from `isCurrentThemeDark()` happens only on first construct (no HS1 slot yet); after that, HS1 owns the value.

**Trade-off considered:** does the user want darkMode to follow app theme automatically? Two perspectives:
- **For removing (this task's choice):** user toggles via the Sun/Moon icon; that toggle should stick. Today's behavior of reverting on theme change is a UX inconsistency.
- **Against removing:** users who never touch the toggle might prefer the canvas to follow the app theme automatically. But the first-construct seeding handles this case for new files.

**Resolution:** remove the theme-sync useEffect. The constructor's first-construct seed (`isCurrentThemeDark()`) covers the "follow app theme" intent for new files. Once the user toggles, HS1 owns the value forever.

**Net behavior change:** users who currently rely on theme-change auto-sync will notice that toggling the app theme no longer flips the canvas theme. The Sun/Moon button still works (one click). Documented in whats-new for the next release.

**Note:** `DrawViewModel.syncDarkMode` IS NOT relocated to `DrawEditor` (no caller remains after migration). The legacy `DrawView` keeps the useEffect (it still references `vm.syncDarkMode`) — preserved verbatim per DR1.

### DR16 — Debounce timer ownership (view-local, not editor)

**Context:** today's `DrawView.tsx` line 49 declares `const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)`. The 500 ms debounce in `handleChange` debounces Excalidraw's high-frequency `onChange` events before calling `vm.updateFromExcalidraw`.

**Migration:** the debounce timer stays **view-local** in `DrawBody`. The editor's `updateFromExcalidraw` is a synchronous mutator — it doesn't manage its own debounce. The view owns the debounce because (a) the debounce is tied to the view's render lifecycle (cleanup on unmount), and (b) the editor has no other consumer of `updateFromExcalidraw` (it's purely body → editor).

**Edge case — body unmount mid-debounce:** `useEffect` cleanup clears `debounceRef.current` if set. The pending `updateFromExcalidraw` call is dropped — fine, because on remount Excalidraw's `initialData` reflects the editor's last-known state and the next `onChange` (after the user's next action) re-fires the debounce.

**Resolution:** Step 2 wires the debounce in `DrawBody`. `DrawEditor.dispose` does NOT clear any timer (none owned).

## Acceptance criteria

1. **App still opens Draw files end-to-end:**
   - Open an `.excalidraw` file from file explorer → renders in the new `DrawEditor` (verify via DevTools: page's `mainEditorV4` is `DrawEditor`, not `LegacyEditorAdapter`).
   - Edit raw JSON in Monaco → switch to Drawing via the switch widget → canvas reflects updated content (host transfer via `CONTENT_HOST_TRAIT`; parse runs sync inside `adoptHost`).
   - Restart app → file reopens via the v4 native path. After restore, the canvas re-renders with the same elements.

2. **Excalidraw canvas works as today:**
   - Add shapes / text / arrows / images → all work; Excalidraw's own UI (toolbar, sidebar, library menu, undo/redo) functional.
   - Changes serialize back to host content within 500 ms; `modified` flag flips to true; cache file (`<host.id>-host.txt`) writes within a few seconds.
   - Refresh between Monaco and Drawing → JSON-shape edits in Monaco propagate to canvas; canvas edits propagate to JSON.

3. **`darkMode` HS1 persistence (DR4):**
   - Open an `.excalidraw` file → toggle Sun/Moon icon → canvas theme flips → switch to Monaco → switch back to Drawing: canvas theme preserved (HS1 host-slot survives switch).
   - Toggle theme → restart app → file reopens: canvas theme preserved (HS1 slot rides host descriptor).
   - Fresh `.excalidraw` file (no prior slot) opens with `darkMode = isCurrentThemeDark()` (matches today's first-open behavior).
   - **DR15 behavior change:** change the app theme (Settings → Theme) → canvas theme does NOT auto-flip if the user has previously toggled. (For never-touched-toggle files, the first-construct seed already applied the theme; subsequent theme changes don't re-sync.)

4. **Toolbar renders correctly (DR9):**
   - Top toolbar (page-level): NavPanel button (when file is on disk), Spacer, **5 buttons in right contributions**: theme toggle (Sun/Moon) / copy-image / save dropdown (SVG/PNG) / open dropdown (SVG/Image) / screen-snip / switch widget.
   - Toolbar buttons NOT disabled even when canvas is empty — the helpers `ui.notify("Nothing to export — the drawing is empty", "warning")` handle the empty case.
   - Switch widget lists `Monaco` + `Drawing` for a draw-view host.
   - No footer contributions; encoding label + script-toggle from `TextChrome` defaults still present.

5. **Five export operations work:**
   - **Copy Image** — clicks → copies PNG of canvas to clipboard. Paste into another app verifies.
   - **Save as SVG** — opens file picker; default filename `<filename>.svg`; writes valid SVG file.
   - **Save as PNG** — opens file picker; default filename `<filename>.png`; writes valid PNG file (2x scale by default).
   - **Open as SVG** — opens new SVG editor page with rendered SVG content.
   - **Open as Image** — opens new Image viewer page with PNG blob URL.
   - **Screen Snip** — captures screen region → adds as image element in canvas, positioned at IMAGE_OFFSET_X/Y, capped to 1200px longer side.

6. **Library persistence works (DR15 — view-local):**
   - Click "Library" in Excalidraw sidebar → library opens; existing items load from `library.excalidrawlib`.
   - Add an item to library → file writes within debounce; reload app → item persists.
   - Click "Browse libraries" link → opens Excalidraw libraries site in internal browser tab.
   - Click "Install" on a library page → URL change captured by listener; library merges into editor; library menu opens to confirm.

7. **Scripting facade `page.asDraw()` works:**
   - From a Draw page: `const d = await page.asDraw(); console.log(d.elementCount, d.editorIsMounted)` returns valid counts.
   - From a non-Draw page: `await page.asDraw(true)` switches the page if compatible (force flag — SF1).
   - `page.asDraw(false)` (default) throws on non-Draw page.
   - `await d.addImage(dataUrl)` adds image to canvas.
   - `await d.exportAsSvg()` / `await d.exportAsPng()` return strings.
   - `app.pages.addDrawPage(dataUrl)` creates new Draw page with embedded image — flows through `wrapLegacyForPage`'s new Draw branch.

8. **Persistence round-trip:**
   - Open an `.excalidraw` file → restart app → file reopens at the same v4-native editor.
   - Pre-US-565 session data (legacy `editor: "draw-view"` + `type: "textFile"` descriptor) still loads via `wrapLegacyForPage` (v3 restore path).
   - Pre-US-565 sessions DO NOT have a `darkMode` slot — opening a pre-US-565-saved Draw page falls back to `isCurrentThemeDark()`. User's next toggle persists.

9. **Notebook embedding still works (DR1 verification — preventive):**
   - If a notebook with a Draw-typed note exists, reload the app → the Draw note renders without console errors. Canvas is interactive (insofar as it ever was — multi-instance Excalidraw caveats remain).
   - This is the critical preventive test against the US-554 retrospective regression.

10. **All five `addEditorPage("draw-view", ...)` callers work (DR13):**
    - `app.pages.addDrawPage(dataUrl)` from a script → new Draw page with image.
    - Open image → "Open in Drawing Editor" button → new Draw page with image embedded.
    - Open SVG → "Open in Drawing Editor" → new Draw page with SVG-as-image.
    - Open Mermaid → "Open in Drawing Editor" → new Draw page with rendered Mermaid embedded.
    - Open Graph → "Open in Drawing Editor" → new Draw page with canvas snapshot.

11. **No regression in canvas / interaction quality:**
    - Fingerprint optimization (DR7) prevents dirty-flagging on pure-scroll/select/zoom events.
    - 500 ms debounce on `handleChange` smooths high-frequency edit operations.
    - `skipNextContentUpdate` (DR7) prevents parse-flicker on every edit.
    - Excalidraw's own UI is unaffected (no double-mounting, no theme conflicts).

12. **Cleanup verified:**
    - `Grep "acquireViewModel.*draw-view"` returns hits only in `NoteItemEditModel.ts` and `note-editor` flow (legacy path) — not in `PageWrapper.ts`.
    - `Grep "useContentViewModel.*draw-view"` returns hits only in `DrawView.tsx` (legacy file preserved per DR1).
    - `src/renderer/editors/draw/index.ts` is deleted; `src/renderer/editors/draw/index.tsx` exists with the new surface.
    - `DrawView.tsx` + `DrawViewModel.ts` + `drawLibrary.ts` + `drawExport.ts` exist unchanged.
    - TypeScript + ESLint pass with zero new errors in touched files.

## Files changed summary

### New files

| File | Purpose |
|------|---------|
| `src/renderer/editors/draw/DrawEditor.ts` | Native v4 `DrawEditor` class — state with HS1-mirrored `darkMode` + view-derived `loading`/`error`; trait wiring; three-phase lifecycle; host adoption with content + HS1 subscriptions; three payload fields + guard + fingerprint + API ref; `parseContent` + `updateFromExcalidraw` + `toggleDarkMode` relocated from VM. Estimated ~180 LOC. |
| `src/renderer/editors/draw/DrawBody.tsx` | Body view — reads `editor.state.use(...)` reactively; renders `<Excalidraw>` element with library hook + library-URL listener + link-intercept wrapper; wires API ref via `editor.setExcalidrawApi`; hosts 500 ms debounce for `handleChange`. Estimated ~150 LOC. |
| `src/renderer/editors/draw/index.tsx` | Module shell — `DrawEditorView` (`<TextChrome>` with `rightToolbarContributions={<DrawToolbarBits/>}` + `<DrawBody>`), `DrawToolbarBits` (5 export buttons + 4 export-helper callbacks), `drawModule` export, class re-export. Replaces today's `index.ts`. Estimated ~280 LOC. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `if (isTextFile && targetEditorId === "draw-view")` branch in `wrapLegacyForPage` after the Graph branch; add import of `DrawEditor` + `defaultDrawEditorState`. |
| `src/renderer/editors/register-editors.ts` | Keep legacy `draw-view` `loadModule` (eager imports preserved for notebook); drop `"draw-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; append v4 native registration; add comment documenting DR1 rationale. |
| `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts` | Wrap `DrawEditor` instead of `DrawViewModel`; getters/methods read `editor.X` instead of `vm.X` (one-symbol rename). Async dynamic imports unchanged. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | `asDraw` flips to `instanceof DrawEditor`; drop `acquireViewModel("draw-view")` + `releaseList` push; remove the `DrawViewModel` type-import; add `DrawEditor` value-import. |

### Deleted files

| File | Reason |
|------|--------|
| `src/renderer/editors/draw/index.ts` | Replaced by `index.tsx` (different re-export surface; new `drawModule` + class exports). Notebook embedding path imports `./DrawView` directly via the legacy `loadModule`'s `Promise.all`. |

### Preserved files (intentional — DR1)

| File | Rationale |
|------|-----------|
| `src/renderer/editors/draw/DrawView.tsx` | Consumed by `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor` for Draw-typed notebook notes. Removed by US-557 once Notebook migrates. |
| `src/renderer/editors/draw/DrawViewModel.ts` | Consumed by `NoteItemEditModel.acquireViewModel("draw-view")` for Draw-typed notebook notes. Removed by US-557. |
| `src/renderer/editors/draw/drawLibrary.ts` | Pure module; consumed by both `DrawBody` (new) and `DrawView` (preserved). |
| `src/renderer/editors/draw/drawExport.ts` | Pure module; consumed by `DrawToolbarBits` (new) AND `DrawView` (preserved) AND external Image/SVG/Mermaid/Graph callers via `buildExcalidrawJsonWithImage`. |

### Unchanged files

| File | Notes |
|------|-------|
| `src/renderer/api/types/draw-editor.d.ts` | Facade interface — shape preserved (async addImage / exportAsSvg / exportAsPng + sync elementCount / editorIsMounted). |
| `src/renderer/api/types/common.d.ts` | `EditorView` union — `"draw-view"` retained. |
| `src/renderer/api/pages/PageModel.ts` | Already supports v4-native main editors. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Shape-based discriminator `d.host !== undefined` (US-561 fix) auto-includes Draw descriptors. |
| `src/shared/types.ts` | `EditorView` union — `"draw-view"` retained. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | Per-note dispatch reaches legacy `module.Editor` via the preserved `loadModule`. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | `acquireViewModel("draw-view")` reaches legacy `createDrawViewModel` via the preserved `loadModule`. |
| `src/renderer/api/pages/PagesLifecycleModel.ts:405` | `addDrawPage` — editor id unchanged; flows through new `wrapLegacyForPage` Draw branch. |
| `src/renderer/editors/image/ImageViewer.tsx` | `addEditorPage("draw-view", ...)` — editor id unchanged. |
| `src/renderer/editors/svg/index.tsx` | Same. |
| `src/renderer/editors/mermaid/index.tsx:50` | Same. |
| `src/renderer/editors/graph/index.tsx:42` | Same. |
| `src/main/mcp-http-server.ts` | String literals `"draw-view"` in MCP tool description — editor id unchanged. |
| `src/renderer/api/settings.ts` | `drawing.library-path` setting — unaffected. |
| `src/renderer/editors/base/v4/LegacyEditorAdapter.ts` | Comment listing example content-view ids — cosmetic only. |
