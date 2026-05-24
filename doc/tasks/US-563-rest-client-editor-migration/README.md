# US-563: Rest Client editor migration (EPIC-028 Phase C)

> **Status:** Investigation complete 2026-05-24, ready for implementation.
> **Walkthrough:** [`doc/epics/EPIC-028-editor-architecture/walkthroughs/26-rest-client.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/26-rest-client.md) (RC1–RC10 RESOLVED in design 2026-05-20; HS1 amendment to RC3 landed 2026-05-21).
> **Risk profile:** Similar to US-556 (Todo). **Ninth Tier-5 text-bearing editor**; **fourth non-sidebar-owning** (after Grid, Log View, Todo). No secondary-editor registrations, no `beforeNavigateAway` / `onMainEditorChanged` overrides, no TreeProvider, no scripting facade (per RC10 — only text-bearing Tier-5 without one), no duck-typed model decoration. Retrospective scope (RC11–RC18 mirroring TD11–TD17 + a new RC18 for response-cache restore timing) carries over for legacy-view preservation + v4 wiring.

## Goal

Migrate the Rest Client editor (`.rest.json` files) from the legacy `RestClientViewModel` + `LegacyEditorAdapter` pair to a native v4 `RestClientEditor` class with `TextFileModel` as its `IContentHost`. **Ninth Tier-5 editor** in the uniform "EditorModel IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT" shape (after Monaco / Grid / Log View / Markdown / Svg / Html / Mermaid / Graph / Draw / Link / Todo). Retires the selection-state cache file (folds 2 fields into HS1 host slot — sixth instance of GR4 → LV3 → LK3 → DR4/MR5 → TD3 → RC3). **Preserves** the response cache as a separate per-editor cache file (RC7 — first instance of the new "split cache-file consolidation by scale" pattern). Preserves the legacy `RestClientViewModel` + today's React view for future notebook-embed parity with the rest of the preserved-sibling editors (US-557).

## Background

### Today's surface

`src/renderer/editors/rest-client/` — 11 files:

| Group | Files |
|-------|-------|
| Core | `RestClientViewModel.ts` (~780 LOC), `RestClientEditor.tsx` (~707 LOC, React view + RequestTree + SplitDetailPanel), `restClientTypes.ts`, `httpConstants.ts` |
| Request side | `RequestBuilder.tsx` (~654 LOC), `KeyValueEditor.tsx` (~160 LOC), `multipartBuilder.ts`, `parseClipboardRequest.ts`, `serializeRequest.ts` |
| Response side | `ResponseViewer.tsx` (~357 LOC) |
| Integration | `open-in-rest-client.ts` (resolver entrypoint — `content/resolvers.ts:150-153` when `data.target === "rest-client"`) |

### Today's `RestClientViewModel` state (8 fields)

```typescript
const defaultRestClientEditorState = {
    data: { type: "rest-client", requests: [] } as RestClientData,
    error: undefined as string | undefined,
    selectedRequestId: "" as string,
    leftPanelWidth: 250,
    // Execution state
    executing: false,
    response: null as RestResponse | null,
    responseTime: 0,
    headersJsonInvalid: false,
};
```

Plus **6 private fields** (`lastSerializedData`, `skipNextContentUpdate`, `selectionRestored`, `responseCache`) and **two static** `cacheName = "rest-client"` + `responseCacheName = "rest-client-responses"`.

### Today's `RestClientData` shape (root of `.rest.json`)

```typescript
interface RestClientData {
    type: "rest-client";
    requests: RestRequest[];   // id/name/collection/method/url/headers/body/bodyType/bodyLanguage/formData/binaryFilePath/formDataEntries
}
```

**No `state` field** — unlike Todo's `TodoData.state[id].contentHeight` per-item map. Rest Client doesn't persist per-request UI state inside the JSON file.

### JSON self-write pattern today

```
state mutation (addRequest, updateRequest, header/formData CRUD, sendRequest result, …)
  → onDataChangedDebounced (300ms)
    → onDataChanged:
        if (error) return;
        if (data.requests ref-unchanged) return;          // ref-equality short-circuit
        // Strip empty trailing rows from headers / formData / formDataEntries
        // (UI auto-adds empty last rows; persistence drops them).
        const content = JSON.stringify(cleanData, null, 4);
        if (content !== currentContent) {
            skipNextContentUpdate = true;
            host.changeContent(content, true);
        }
host content subscription fires onContentChanged(content):
  if (skipNextContentUpdate) { skipNextContentUpdate = false; return; }
  loadData(content);                                       // external change re-parse
```

Same shape as LogView (LV6), Link (LK5), Todo (TD5). **Fifth instance** under EPIC-028 (RC5).

**Subtle invariant:** the "only update host if content actually changed" extra gate (`if (content !== currentContent)`) prevents false-dirty on initial load. Unchanged by US-563.

### Today's TWO cache files

This is the **distinguishing feature** of Rest Client compared to Grid / Log View / Link / Todo, which each have ONE per-editor cache file:

| Cache file | Content | Size envelope | Cadence |
|------------|---------|---------------|---------|
| `<host.id>:rest-client` | `{ selectedRequestId }` (small JSON object) | ~40-100 bytes | Debounced 300ms via `saveSelectionState` |
| `<host.id>:rest-client-responses` | `{ [requestId]: { response, responseTime } }` map of all cached responses | **Bytes to megabytes** per request; binary responses excluded | Debounced 500ms via `saveResponseCache`; binary skips disk write |

The size envelope difference is **3+ orders of magnitude** — selection state never grows; response cache routinely runs into 10s of KB for typical JSON APIs and can exceed 1 MB for HTML responses. The `if (!isBinary)` gate in `sendRequest` keeps gigabyte image/video responses out of disk persistence (they stay in-memory only).

Today's `restoreResponseCache` is async-kicked from `loadData` (gated by `selectionRestored` one-shot flag); both cache restores happen in parallel on first load.

### Today's `RestClientEditor.tsx` (React view, 707 LOC)

Today's view consumes the VM via:

```typescript
const vm = useContentViewModel<RestClientViewModel>(model, "rest-client");
const state: RestClientEditorState = useSyncExternalStore(
    vm ? (cb) => vm.state.subscribe(cb) : noopUnsubscribe,
    vm ? () => vm.state.get() : getDefaultState,
);
```

**No portal blocks** — Rest Client predates the portal toolbar pattern. The per-request toolbar lives inline in `SplitDetailPanel` (collection / name Textareas + copy-as menu + delete button). The body composes:
- Left panel: `RequestTree` (inline; not a secondary editor) with `<Splitter>`-controlled width.
- Right panel: `SplitDetailPanel` with `<RequestBuilder>` (top) + horizontal splitter + response header bar (`status/time/size`) + `<ResponseViewer>` (bottom).
- Bottom-pane height self-pinned via `useLayoutEffect` reading `responsePaneRef.current.offsetHeight` — same "pin actually-rendered pixel size after first layout" pattern as `RequestBuilder.bodyHeight`. Double-click on either pane header toggles between 30/70 expanded.

### Today's `RequestTree` (inline left panel — NOT a secondary editor)

Renders inside `RestClientEditor.tsx`'s render tree. Contains:
- Root row: "Requests" label + "+" Add button.
- Collection group rows (label = collection name or `(empty)`); per-collection context menu (`Add Request` / `Open in New Editor` / `Delete Collection`).
- Per-request rows (`METHOD` badge + name); per-request context menu (`Duplicate` / `Open in New Editor` / `Delete`).
- Drag emit: `TraitTypeId.RestRequest` payload via `setTraitDragData`.
- Drop accept: `TraitTypeId.RestRequest` (reorder within tree) + `LINK` trait (cross-editor link drop → creates new requests from dropped links).

Pure view layer — every action delegates to VM methods. **No model-side reference to "panel" anywhere; not registered in `secondary-editor-registry.ts`.**

### Today's `RequestBuilder.tsx` (top of right pane)

- Method dropdown (HTTP_METHODS); URL Textarea (Enter → send; paste of `fetch(`/`curl ` → `vm.pasteRequest`); Send button.
- Split area: headers (top) / body (bottom) — internal `<Splitter>`.
- Headers section: Table | JSON `SegmentedControl`; `KeyValueEditor` rows (key Autocomplete + value Textarea + Checkbox + delete IconButton); JSON view uses Monaco; copy-as-JSON IconButton.
- Body section: bodyType `SegmentedControl` (none / form-data / form-urlencoded / raw / binary); language picker (raw only); body content varies per type:
  - `none`: italic text "This request has no body."
  - `binary`: file picker (`app.fs.showOpenDialog`).
  - `form-data`: `FormDataEditor` (multipart) with text/file toggle per row.
  - `form-urlencoded`: `KeyValueEditor` over `request.formData`.
  - `raw`: Monaco with the language from `request.bodyLanguage`.

Takes `vm: RestClientViewModel` + `request: RestRequest` + `state: RestClientEditorState` as props.

### Today's `ResponseViewer.tsx` (bottom of right pane)

Takes `response: RestResponse | null` + `responseTime: number` + `executing: boolean` — **no VM coupling**. Tab control (Body | Headers); language auto-detect from `content-type`; Monaco renderer; binary preview with Save-to-File + Open-in-Image-Viewer buttons.

### Today's `KeyValueEditor.tsx`

Generic key-value row editor. Takes `items` + `onUpdate` / `onDelete` / `onToggle` callbacks — **no VM coupling**.

### Today's registration (`register-editors.ts:427-461`)

```typescript
editorRegistry.register({
    id: "rest-client",
    name: "Rest Client",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) =>
        matchesPattern(fileName, /\.rest\.json$/i) ? 20 : -1,
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) =>
        languageId === "json" && matchesPattern(fileName, /\.rest\.json$/i) ? 10 : -1,
    isEditorContent: (languageId, content) =>
        languageId === "json" &&
        content.includes('"type"') &&
        /"type"\s*:\s*"rest-client"/.test(content) &&
        content.includes('"requests"'),
    loadModule: async () => {
        const [module, { createRestClientViewModel }] = await Promise.all([
            import("./rest-client/RestClientEditor"),
            import("./rest-client/RestClientViewModel"),
        ]);
        return {
            Editor: module.RestClientEditor,
            createViewModel: createRestClientViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

Plus `"rest-client"` is currently listed in `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 775) — the mirror loop ships a bare-adapter v4 stub for it.

### `wrapLegacyForPage` callers that hit rest-client today (PagesLifecycleModel.ts)

1. **`addEditorPage("rest-client", "json", title, content)`** — `open-in-rest-client.ts:49-54` (resolver Layer-2 entry from `content/resolvers.ts:150-153` when `data.target === "rest-client"`; also from the "Open in Rest Client" context menu in `tree-context-menus.tsx`).
2. **`addEditorPage("rest-client", …)`** — `RestClientEditor.tsx:478` (RequestTree collection "Open in New Editor") and line 521 (request "Open in New Editor").
3. **`openFile(filePath)`** for any `.rest.json` file — registry resolves to `rest-client`.
4. **`openFile(filePath)` with content-peek** — any `.json` file whose content includes `"type":"rest-client"` matches `isEditorContent` predicate.
5. **Sidebar "Rest Client" button** — `tools-editors-registry.ts` similar to Todo / Link.

All currently fall through to `LegacyEditorAdapter` in `wrapLegacyForPage` (no `rest-client` branch exists). Under US-563 we add a `rest-client` branch that constructs a `RestClientEditor` over the TextFileModel host — mirror of the existing `link-view` (PagesLifecycleModel.ts:205) / `todo-view` (PagesLifecycleModel.ts:220) branches.

### Today's `acquireViewModel("rest-client")` consumers

**Only ONE callsite** — `RestClientEditor.tsx:78`'s `useContentViewModel<RestClientViewModel>(model, "rest-client")` hook. No script-API facade exists (no `asRestClient`, no `RestClientEditorFacade.ts`); no notebook-embed today; no browser-embed. Confirmed via grep across the codebase.

### HS1 — `host.editorSettings["rest-client"]` slot (US-552-B contract; RC3 amendment)

`IContentHost.getEditorState<T>(editorId)` / `setEditorState<T>(editorId, value)` already shipped (TextEditorModel.ts:306-318). The 2 persisted fields per RC3 amendment ride the host slot:

```typescript
interface RestClientViewSettings {
    leftPanelWidth?: number;
    selectedRequestId?: string;
}
```

The slot is seeded into editor state inside `adoptHost`; a slice-subscribe mirror writes back on changes. Today's `<host.id>:rest-client` selection cache file retires (orphan files linger harmlessly per P9). Today's `selectionRestored` one-shot flag retires alongside.

**The response cache stays separate** (RC7 — split-by-scale pattern) at `<host.id>:rest-client-responses` cache file. Verbatim preservation — including the `if (!isBinary)` disk-skip gate.

### Sibling reference — Todo + Link

Closest structural siblings: **Todo (US-556)** for non-sidebar-owning Tier-5 shape with HS1 single-field slot + inline left panel, and **Link (US-555)** for the JSON self-write pattern + retrospective preservation of legacy view/VM. Rest Client combines both plus the new RC7 split-cache pattern:
- From Todo: minimal lifecycle hooks (no sidebar-owning), HS1 host slot for persisted UI state, `_skipNextContentUpdate` flag, `host` typed getter (MK4 pattern), single-shape `index.tsx` module, inline left panel composed directly into body.
- From Link: structural typing for shared component props, `RestClientSource` union type, legacy view rename to `RestClientView.tsx`, preserved `RestClientViewModel.ts` + `createRestClientViewModel` factory, `wrapLegacyForPage` branch, registry mirror cleanup.
- **Unique to Rest Client:** RC7 split-cache (selection → host slot, responses → separate file), async sendRequest lifecycle with binary streaming, NO scripting facade (RC10), NO toolbar/footer contributions (per-request toolbar stays inline in SplitDetailPanel — RC17).

### Override count: 9 hooks

Hooks RestClientEditor provides (same as Todo; two-hook reduction vs. Link's 11):

| Hook | RestClientEditor | TodoEditor | LinkEditor |
|------|------------------|-----------|------------|
| `applyRestoreData` | ✅ | ✅ | ✅ |
| `switchFrom` | ✅ | ✅ | ✅ |
| `restore` | ✅ | ✅ | ✅ |
| `saveState` | ✅ | ✅ | ✅ |
| `confirmRelease` | ✅ | ✅ | ✅ |
| `getNavigatorTarget` | ✅ | ✅ | ✅ |
| `findCompatibleEditors` | ✅ | ✅ | ✅ |
| `getRestoreData` | ✅ | ✅ | ✅ |
| `focus` | ✅ | ✅ | ✅ |
| `dispose` | ✅ | ✅ | ✅ |
| `beforeNavigateAway` | ❌ (RC6 — inherit) | ❌ (TD6 — inherit) | ✅ (LK7) |
| `onMainEditorChanged` | ❌ (RC6 — inherit) | ❌ (TD6 — inherit) | ✅ (LK8) |

Documents the **pay-only-when-used** property of `beforeNavigateAway` / `onMainEditorChanged`. Fourth non-sidebar-owning text-bearing v4 editor (after Grid, Log View, Todo).

---

## Concerns resolved up front

Most concerns inherit verbatim from walkthrough 26's RC1–RC10 (all RESOLVED 2026-05-20). New investigation surfaced eight retrospective concerns (RC11–RC18) carried from US-554/US-560/US-561/US-562/US-564/US-565/US-555/US-556 lessons.

### RC1 — Class topology

`RestClientEditor` IS the page's `mainEditor`; HAS a `TextFileModel` content host with CONTENT_HOST_TRAIT exposed. **Ninth** Tier-5 editor in the uniform shape. Verbatim from walkthrough.

### RC2 — State slice partitioning

8 fields total. Under refactor:
- **2 persisted (HS1 host slot per RC3 amendment):** `leftPanelWidth`, `selectedRequestId`.
- **4 ride-state stripped:** `data`, `error`, `response`, `responseTime`. (`data` derived from `host.content` via `loadData`; `response` / `responseTime` rebuilt from in-memory `responseCache` on `selectRequest`.)
- **2 transient (not persisted):** `executing`, `headersJsonInvalid`.
- **3 private (non-state):** `skipNextContentUpdate`, `lastSerializedData`, `responseCache`. (`selectionRestored` retires per RC3 — no separate cache file to one-shot-guard against. `static cacheName` retires; `static responseCacheName` stays alive per RC7.)

Verbatim from walkthrough.

### RC3 — Selection-state cache → HS1 host slot

Today's `<host.id>:rest-client` cache file retires. The 2 fields (`leftPanelWidth`, `selectedRequestId`) ride `host.editorSettings["rest-client"]` per HS1 amendment. Survives RestClient↔Monaco switches AND app restarts. `selectionRestored` one-shot flag retires (host-slot seed in `adoptHost` replaces it). **Sixth instance** of "per-editor cache file → host slot" (Grid GR4 → LogView LV3 → Link LK3 → Draw DR4 / Mermaid MR5 → Todo TD3 → RestClient RC3). Pattern is now standardized across six text-bearing Tier-5 editors.

**Incidental fix:** `leftPanelWidth` today rides VM state but is NOT persisted (silent today-bug). Folding into host slot adds persistence — **fourth instance of this incidental fix** (after Link LK2, Todo TD2, and the previously-noted Markdown equivalent). Verbatim from walkthrough RC3 amended 2026-05-21.

### RC4 — JSON parse/serialize lifecycle hooks

Three sites:
- `restore()` — initial parse via `loadData(host.content)`.
- `adoptHost` — host content subscription with `skipNextContentUpdate` guard; state→save subscription via `addSubscription(state.subscribe(onDataChangedDebounced))`; HS1 slice-subscribe mirror; **kick-off of `restoreResponseCache()` (fire-and-forget — see RC18)**.
- `dispose()` — flush BOTH pending saves (`onDataChanged()` + `saveResponseCache()`); **incidentally fixes today's lost-response-save bug** (today's `onDispose` only flushes `onDataChanged`).

Mirrors Link LK4 / Todo TD4 lifecycle shape, extended with the response-cache flush in `dispose()` and the response-cache restore in `adoptHost`. Verbatim from walkthrough.

### RC5 — `skipNextContentUpdate` flag

Verbatim port of today's editor-private flag. **Fifth instance** of the self-write-guard pattern (LogView LV6 → Link LK5 → Graph GR7 / Draw DR7 → Todo TD5 → RestClient RC5). Verbatim from walkthrough.

### RC6 — Rest Client is NOT sidebar-owning (LK7 / LK8 N/A)

`RequestTree` stays as a child of `RestClientBody` rendered directly via `<RequestTree model={editor} … />`. No `setSidebarPanels` method, no `beforeNavigateAway` override, no `onMainEditorChanged` override, no model-side panel registration. **Override count: 9 (vs Link's 11).** Verbatim from walkthrough.

### RC7 — Response cache stays as separate per-editor cache file

`<host.id>:rest-client-responses` cache file survives independently of the descriptor:
- **Why not fold into descriptor:** size envelope is fundamentally different (bytes to megabytes per request) — folding would blow the 50KB-per-page budget at the first cached response.
- **Why not drop:** major UX feature (user clicks a request → sees the last response immediately).
- **Today's binary-exclusion gate stays:** `sendRequest` already skips disk persistence for binary responses (`if (!isBinary) saveResponseCacheDebounced()`).
- **Cross-window transfer:** the response cache file follows the host id, so it survives cross-window transfer the same way today's host content cache does. No new IPC machinery needed.

**First instance of "split cache-file consolidation by scale"** pattern. Establishes guidance for future editors with mixed payload sizes (Notebook + cell outputs, possibly Graph + simulation snapshots). Verbatim from walkthrough.

### RC8 — `ui.confirm` / `ui.notify` direct calls

Preserved verbatim. `sendRequest` calls `app.ui.notify("Fix invalid JSON in headers before sending", "warning")` directly from the model layer when `headersJsonInvalid` is set. The React view calls `app.ui.confirm(...)` for delete confirmations. `ui` is app-level by design — view-side confirms stay where they are; model-side notify stays where it is. Verbatim from walkthrough.

### RC9 — `TraitTypeId.RestRequest` drag + `LINK` trait accept

Preserved verbatim. The drag trait system (`TraitTypeId.X` via `setTraitDragData` / `getTraitDragData` / `hasTraitDragData`) is orthogonal to `EditorModel.traits` (which carries `CONTENT_HOST_TRAIT`). No refactor; `vm.moveRequest` / `vm.addRequest` / `vm.updateRequest` become `editor.X` mechanically. The cross-editor `LINK` trait accept (drag a link from PageNavigator into the RequestTree) stays the canonical example of the trait system paying its keep. Verbatim from walkthrough.

### RC10 — `accepts()` predicate + queue + NO scripting facade

Filename `.rest.json` priority 70 + content-peek priority 60 (`"type":"rest-client"` + `"requests"`); queue events `{ type: "focus" }` only; queue request `never`. **NO scripting facade added** — Rest Client stays the only text-bearing Tier 5 editor without a `XxxEditorFacade.ts` + `asX()` accessor. The Tier-5 template doesn't require a facade; adding one later is mechanical (4 file touches). Verbatim from walkthrough.

### RC11 — File naming under preserved-legacy-view contract (NEW retrospective)

**Walkthrough deviation:** Walkthrough §Migration scope §Renamed files says "Today's `RestClientEditor.tsx` renames to `RestClientBody.tsx`". This contradicts US-554/US-560/US-561/US-562/US-564/US-565/US-555/US-556's retrospective preservation pattern (`*View.tsx` + `*ViewModel.ts` kept for notebook-embed via legacy `loadModule.Editor`).

**Resolution:** Rename today's `RestClientEditor.tsx` → `RestClientView.tsx` (file rename only; exported function name `RestClientEditor` is UNCHANGED — same approach as TD11). This:
- Frees the `RestClientEditor` name for the v4 class file `RestClientEditor.ts`.
- Aligns with the preserved-sibling pattern (`GraphView.tsx`, `DrawView.tsx`, `MermaidView.tsx`, `HtmlView.tsx`, `SvgView.tsx`, `MarkdownView.tsx`, `LinkView.tsx`, `TodoView.tsx`).
- Allows the legacy `editorRegistry.register({id:"rest-client", loadModule:…})` block to keep returning `{Editor: module.RestClientEditor}` for future notebook-embed via `NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`.

The new v4 files: `RestClientEditor.ts` (class), `RestClientBody.tsx` (v4 view shell), `index.tsx` (module wrapper).

### RC12 — Preserve `RestClientViewModel.ts` (NEW retrospective)

**Walkthrough deviation:** Walkthrough §Migration scope §Deleted files says "RestClientViewModel.ts (the file)" gets deleted. This contradicts the US-555/US-556 retrospective preservation pattern.

**Resolution:** Preserve `RestClientViewModel.ts` byte-for-byte. The `createRestClientViewModel` factory and the legacy `editorRegistry.register({id:"rest-client", loadModule:async()=>({Editor: RestClientView, createViewModel: createRestClientViewModel, …})})` registration BOTH stay alive. This:
- Enables future notebook-embed in US-557 without a re-introduction migration.
- Mirrors Graph / Draw / Link / Markdown / Mermaid / Svg / Html / Todo which all preserve their legacy VM.
- Costs ~780 LOC retained; retirement deferred to US-559 alongside `LegacyEditorAdapter`.

Note: Rest Client has **zero current embed consumers** today (no browser-embed, no notebook-embed). Preservation is purely speculative ("might be embedded in notebook one day"). The cost is low; the benefit is consistency with the eight preserved-sibling editors and no re-introduction migration if a need arises.

### RC13 — Component prop dual-source typing (NEW retrospective)

Today's `RestClientEditor.tsx` (becoming `RestClientView.tsx`) passes `vm: RestClientViewModel` to:
- `RequestTree` (inline child component) — `vm.selectRequest`, `vm.addRequest`, `vm.moveRequest`, `vm.deleteRequest`, `vm.updateRequest`, `vm.deleteCollection`, `vm.state.get()`.
- `SplitDetailPanel` (inline child component) — `vm.updateRequestCollection`, `vm.renameRequest`, `vm.deleteRequest`.
- `RequestBuilder` (separate file) — receives `vm: RestClientViewModel` as a prop.

`ResponseViewer` takes only `response` / `responseTime` / `executing` — no VM coupling. `KeyValueEditor` takes callbacks (`onUpdate` / `onDelete` / `onToggle`) — no VM coupling.

**Resolution:** Change the `vm` prop typing to `RestClientSource = RestClientViewModel | RestClientEditor` (TS union). Define `RestClientSource` alias in `restClientTypes.ts`:

```typescript
import type { RestClientViewModel } from "./RestClientViewModel";
import type { RestClientEditor } from "./RestClientEditor";
export type RestClientSource = RestClientViewModel | RestClientEditor;
```

The methods called by these components — `selectRequest`, `addRequest`, `deleteRequest`, `renameRequest`, `updateRequestCollection`, `deleteCollection`, `moveRequest`, `updateRequest`, `updateBodyType`, `updateBodyLanguage`, `updateHeader`, `deleteHeader`, `toggleHeader`, `updateFormData`, `deleteFormData`, `toggleFormData`, `updateFormDataEntry`, `deleteFormDataEntry`, `toggleFormDataEntry`, `pasteRequest`, `sendRequest`, `setHeadersJsonInvalid`, `setLeftPanelWidth`, `state.use()`, `state.subscribe()`, `state.get()`, `selectedRequest` (getter) — all have identical signatures on both classes. TS union narrowing handles the dual-source case naturally without an explicit interface.

The v4 view (new `RestClientBody.tsx`) passes `RestClientEditor`. The preserved legacy view (`RestClientView.tsx`) keeps passing `RestClientViewModel`. Both compile against the union. **Rename throughout:** the prop name `vm` flips to `model` in `RestClientBody.tsx` (v4 convention) but stays as `vm` in `RestClientView.tsx` (preserved legacy code).

**Subtlety:** the prop NAME also changes in components that BOTH views consume — `RequestBuilder.tsx` is shared. Either:
- (a) Keep the prop name as `vm` (legacy name) in both views and the shared component — minimal churn.
- (b) Rename the prop to `model` everywhere — bigger diff but aligns with v4 convention.

**Decision: (a)** — keep `vm` as the prop name in shared components (`RequestBuilder.tsx`). The new v4 view `RestClientBody.tsx` uses the local variable name `editor` internally and passes it via `vm={editor}` to the shared components. This minimizes diff in `RequestBuilder.tsx` and parallels how US-556 handled `pageModel` in `TodoListPanel.tsx` (kept the existing prop name, changed only the TS type).

### RC14 — `wrapLegacyForPage` `rest-client` branch (NEW retrospective)

Mirror of `link-view` (PagesLifecycleModel.ts:205-214) and `todo-view` (lines 220-229) branches:

```typescript
// EPIC-028 / US-563 — Rest Client migrated to native v4 module. Construct
// RestClientEditor over the legacy TextFileModel host. The initial loadData()
// call kicks off inline (mirrors today's RestClientViewModel.onInit → loadData
// behavior). Async restoreResponseCache() fires-and-forgets inside adoptHost
// (RC18). Non-sidebar-owning Tier-5 editor — no panel registration here.
if (isTextFile && targetEditorId === "rest-client") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const rest = new RestClientEditor(
        new TComponentState({ ...defaultRestClientEditorState, id }),
    );
    rest.adoptHost(legacy as TextFileModel);
    const content = (legacy as TextFileModel).state.get().content ?? "";
    rest.loadData(content);
    return rest;
}
```

Plus the top-of-file import:
```typescript
import { RestClientEditor, defaultRestClientEditorState } from "../../editors/rest-client";
```

Hits the five call sites enumerated above (sidebar Rest Client button + `open-in-rest-client.ts` + RequestTree "Open in New Editor" × 2 + openFile + content-peek).

### RC15 — Registry mirror loop cleanup + native v4 register (NEW retrospective)

Remove `"rest-client"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (register-editors.ts:775) so the mirror loop no longer ships the bare-adapter stub for it. Add a native v4 register call at the bottom of register-editors.ts (mirror of US-556 todo-view block at lines 1137-1169 and US-555 link-view block at lines 1108-1135):

```typescript
// US-563 — replace the legacy bare-adapter mirror for rest-client with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
// to avoid duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "rest-client",
    name: "Rest Client",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("rest-client");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        // Content-peek fallback (RC10): for JSON files with rest-client shape.
        if (input.language === "json" && input.host) {
            const content = (input.host.state.get() as { content?: string }).content ?? "";
            if (legacy.isEditorContent?.(input.language, content)) return 60;
        }
        return -1;
    },
    loadModule: async () => {
        const { restClientModule } = await import("./rest-client");
        return restClientModule;
    },
});
```

The legacy `editorRegistry.register({ id: "rest-client", … })` at line 428 STAYS ALIVE for future notebook-embed (RC12 preservation), with its `loadModule` updated to import `./rest-client/RestClientView` (was `./rest-client/RestClientEditor`).

### RC16 — NO `page.asRestClient()` facade flip (per RC10)

Unlike US-555/US-556 which flipped `page.asLink` / `page.asTodo` from `acquireViewModel` round-trip to v4 `instanceof` check, **Rest Client has no `asRestClient` to flip**. Per RC10: no `RestClientEditorFacade.ts` exists; no `asRestClient` in `api/types/page.d.ts`; no method in `PageWrapper.ts`. **Zero file touches** in the scripting layer under US-563. Future opt-in addition is mechanical (4 file touches; see RC10 / walkthrough §Scripting).

### RC17 — NO TextChrome toolbar/footer contributions (per walkthrough §UI shape)

Unlike US-556's TD17 which mapped Todo's portal search input to `<TextChrome rightToolbarContributions>` + footer to `footerContributions`, **Rest Client has no portal toolbar/footer today** — its per-request toolbar (collection / name Textareas + copy-as menu + delete button) lives inline in `SplitDetailPanel` and stays there under US-563. The `RestClientView` (legacy) and `RestClientBody` (v4) both compose `SplitDetailPanel` directly into the right-pane body.

The new v4 view module composes:
```typescript
function RestClientEditorView({ model }: { model: V4EditorModel }) {
    const restClient = model as RestClientEditor;
    return (
        <TextChrome model={model}>
            <RestClientBody model={restClient} />
        </TextChrome>
    );
}
```

No `rightToolbarContributions`, no `toolbarContributions`, no `footerContributions`. The simplest `index.tsx` of all the Tier-5 editors so far (~50 LOC).

### RC18 — Response cache restore timing under dual-path adoption (NEW retrospective)

The walkthrough §State after refactor §Class sketch puts `await this.restoreResponseCache()` inside `restore()`. This works for the descriptor-replay path. **But `wrapLegacyForPage` bypasses `restore()` — it calls `adoptHost(legacy)` + `loadData(content)` directly.** Under the walkthrough's design, response-cache restoration would never run for legacy-host adoption (the predominant path under EPIC-028 until full v4 cut-over).

**Resolution:** Move `restoreResponseCache()` invocation **into `adoptHost`** (no `await` — fire-and-forget; mirrors today's `loadData` → `restoreResponseCache` call site behavior).

```typescript
adoptHost(host: TextFileModel): void {
    this._host = host;
    this._tearDownHostSubscriptions();

    // ... host state subscription, content subscription, HS1 seed/mirror, save sub ...

    // RC18 — fire-and-forget async restore of the response cache. The cache
    // file may not exist on first load (no-op); when it does, the async read
    // resolves and restoreResponseForSelected fires a state.update that hydrates
    // the response panel. Same fire-and-forget shape as today's
    // RestClientViewModel.loadData → restoreResponseCache call site.
    void this.restoreResponseCache();

    // ... title / id propagation, page binding ...
}
```

The `restore()` override does NOT need to call it again — `restore()`'s `adoptHost(host)` call handles it.

**Race consideration:** there's a brief window between `loadData` completing and `restoreResponseCache` resolving where the response panel shows empty. Today's code has the same race (today fires `restoreResponseCache` from `loadData` itself, not awaited). Unchanged by US-563.

**Test coverage:** acceptance criterion #9 verifies that closing + reopening a `.rest.json` file restores the last response per request — exercises the `adoptHost` → `restoreResponseCache` path under both descriptor-replay and legacy-host adoption.

---

## Implementation plan

### Phase 1 — Rename today's view file (RC11)

1. Rename `src/renderer/editors/rest-client/RestClientEditor.tsx` → `src/renderer/editors/rest-client/RestClientView.tsx` (via `git mv` to preserve history). Exported function name `RestClientEditor` UNCHANGED.
2. Update legacy registry `loadModule` in `src/renderer/editors/register-editors.ts:448-461`:
   ```typescript
   loadModule: async () => {
       // EPIC-028 / US-563 — Rest Client migrated to native v4 module
       // (`restClientModule` in `./rest-client/index.tsx`). Legacy
       // RestClientView + RestClientViewModel are PRESERVED here for future
       // notebook per-note dispatch parity with the other preserved editors
       // (US-554 / US-555 / US-556 / US-560 / US-561 / US-562 / US-564 / US-565
       // retrospective pattern). Page-level pages take the v4 path via
       // `wrapLegacyForPage` in `PagesLifecycleModel.ts`.
       const [module, { createRestClientViewModel }] = await Promise.all([
           import("./rest-client/RestClientView"),
           import("./rest-client/RestClientViewModel"),
       ]);
       return {
           Editor: module.RestClientEditor,
           createViewModel: createRestClientViewModel,
           newEditorModel: textEditorModule.newEditorModel,
           newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
           newEditorModelFromState: textEditorModule.newEditorModelFromState,
       };
   },
   ```
3. Verify: no other consumer imports `./rest-client/RestClientEditor`. Grep confirms only `register-editors.ts:450` references it.

### Phase 2 — Add `RestClientSource` union type alias (RC13)

Edit `src/renderer/editors/rest-client/restClientTypes.ts`:

Add at the bottom (with type-only imports to avoid circular):

```typescript
import type { RestClientViewModel } from "./RestClientViewModel";
import type { RestClientEditor } from "./RestClientEditor";

/** Dual-source typing for shared components — legacy VM AND v4 editor share
 *  identical setter/getter signatures. Components don't care which they receive. */
export type RestClientSource = RestClientViewModel | RestClientEditor;
```

### Phase 3 — Update `RequestBuilder.tsx` prop typing (RC13)

Edit `src/renderer/editors/rest-client/RequestBuilder.tsx`:

Change line 19 import + line 46 prop type:

```typescript
// Before:
import { RestClientViewModel, RestClientEditorState } from "./RestClientViewModel";
// ...
interface RequestBuilderProps {
    vm: RestClientViewModel;
    request: RestRequest;
    state: RestClientEditorState;
}

// After:
import type { RestClientViewModel, RestClientEditorState } from "./RestClientViewModel";
import type { RestClientSource } from "./restClientTypes";
// ...
interface RequestBuilderProps {
    vm: RestClientSource;
    request: RestRequest;
    state: RestClientEditorState;
}
```

Same treatment for `BodyContent` and `FormDataEditor` inner-component prop types (lines 434, 542): `vm: RestClientViewModel` → `vm: RestClientSource`.

Method calls inside `RequestBuilder` (`vm.updateRequest(...)`, `vm.setHeadersJsonInvalid(...)`, `vm.sendRequest()`, `vm.pasteRequest(...)`, `vm.updateBodyType(...)`, `vm.updateBodyLanguage(...)`, `vm.updateHeader(...)`, `vm.deleteHeader(...)`, `vm.toggleHeader(...)`, `vm.updateFormData(...)`, `vm.deleteFormData(...)`, `vm.toggleFormData(...)`, `vm.updateFormDataEntry(...)`, `vm.deleteFormDataEntry(...)`, `vm.toggleFormDataEntry(...)`) — all compile identically against both classes; no body changes needed.

**No changes to `KeyValueEditor.tsx`** (no VM coupling — callbacks only).
**No changes to `ResponseViewer.tsx`** (no VM coupling — `response` / `responseTime` / `executing` only).
**No changes to** `multipartBuilder.ts`, `parseClipboardRequest.ts`, `serializeRequest.ts`, `httpConstants.ts`, `restClientTypes.ts` body (only the new `RestClientSource` alias at the bottom from Phase 2), `open-in-rest-client.ts` (resolver-only — no editor-class coupling).

### Phase 4 — Create v4 `RestClientEditor.ts` (RC1 / RC2 / RC4 / RC5 / RC7 / RC18)

Create `src/renderer/editors/rest-client/RestClientEditor.ts` (~600 LOC). Mirror of `TodoEditor.ts` structure + RC7 split-cache machinery + RC18 fire-and-forget restore. Key pieces:

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
import { debounce } from "../../../shared/utils";
import {
    BodyType,
    CachedResponse,
    FormDataEntry,
    RawLanguage,
    RestClientData,
    RestHeader,
    RestRequest,
    RestResponse,
    createDefaultRequest,
} from "./restClientTypes";

/**
 * EPIC-028 / US-563 — native v4 Rest Client editor. One class with
 * TextFileModel as its `IContentHost`. Replaces the legacy
 * `RestClientViewModel` + `LegacyEditorAdapter` pair. Ninth Tier-5 editor in
 * the uniform shape; fourth non-sidebar-owning text-bearing editor (after
 * Grid, Log View, Todo) — no `beforeNavigateAway` / `onMainEditorChanged`
 * overrides (RC6); RequestTree renders inline inside the editor body, not as
 * a registered secondary editor.
 *
 * Two cache files (RC7 — split by scale):
 *  - selection state (leftPanelWidth + selectedRequestId) → HS1 host slot
 *    `host.editorSettings["rest-client"]` (RC3 — sixth instance of GR4 →
 *    LV3 → LK3 → DR4 / MR5 → TD3 → RC3).
 *  - response cache (bytes-to-megabytes per request) → separate per-editor
 *    cache file `<host.id>:rest-client-responses`. Binary responses excluded
 *    from disk persistence via `if (!isBinary)` gate (verbatim from today).
 *
 * NO scripting facade (RC10 — only text-bearing Tier-5 without one).
 * NO TextChrome toolbar/footer contributions (RC17 — per-request toolbar
 * inline in SplitDetailPanel).
 *
 * Design rationale: doc/tasks/US-563-rest-client-editor-migration/README.md.
 */

export type RestClientQueueEvent = { type: "focus" };
export type RestClientQueueRequest = never;

/** HS1 host-slot shape (RC3) — the 2 per-window UI fields ride
 *  `host.editorSettings["rest-client"]`. Survives Rest Client ↔ Monaco
 *  switches AND app restarts. Replaces today's `<host.id>:rest-client`
 *  cache file. */
interface RestClientViewSettings {
    leftPanelWidth?: number;
    selectedRequestId?: string;
}

export interface RestClientEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["rest-client"] (RC3):
    leftPanelWidth: number;
    selectedRequestId: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData (RC2). Recomputed from host content via loadData /
    // rebuilt from responseCache on selectRequest.
    data: RestClientData;
    error: string | undefined;
    response: RestResponse | null;
    responseTime: number;
    // Transient UI state — not persisted (RC2):
    executing: boolean;
    headersJsonInvalid: boolean;
}

export const defaultRestClientEditorState: RestClientEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    leftPanelWidth: 250,
    selectedRequestId: "",
    data: { type: "rest-client", requests: [] },
    error: undefined,
    response: null,
    responseTime: 0,
    executing: false,
    headersJsonInvalid: false,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class RestClientEditor extends V4EditorModel<RestClientEditorState, void, RestClientQueueEvent> {
    readonly editorId = "rest-client";

    private static readonly responseCacheName = "rest-client-responses";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _saveSubUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // RC5 — self-write guard. RC4 — ref-equality marker for serialization skip.
    private skipNextContentUpdate = false;
    private lastSerializedData: RestClientData | null = null;

    // RC7 — in-memory response cache keyed by request ID. Restored from
    // `<host.id>:rest-client-responses` on adoptHost (RC18 fire-and-forget);
    // persisted via debounced 500ms write. Binary responses skip disk write
    // (verbatim from today's RestClientViewModel.sendRequest gate).
    private responseCache: Record<string, CachedResponse> = {};

    // Save debounces — today's 300ms / 500ms cadences preserved:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);
    private saveResponseCacheDebounced = debounce(() => this.saveResponseCache(), 500);

    readonly typedQueue: ComponentQueue<RestClientQueueEvent, RestClientQueueRequest>;

    constructor(state: TComponentState<RestClientEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            RestClientQueueEvent,
            RestClientQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from RestClientEditor");
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
        this._saveSubUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
        this._saveSubUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get host(): TextFileModel | null {
        return this._host;
    }

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
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

    // ── Persistence (RC2 + RC3) ─────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor. The 2 HS1 fields ride the host slot.
        // View-derived (data / response / responseTime / error) and transient
        // (executing / headersJsonInvalid) stripped per MO5 / GR8 / LK2 / TD2.
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

    applyRestoreData(data: RestoreData<RestClientEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `RestClientEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("RestClientEditor.switchFrom: extracted host is not a TextFileModel");
        }
        this.state.update((s) => { s.id = oldEditor.id; });
        host.state.update((s) => { s.editor = this.editorId; });
        this.adoptHost(host);
        this.loadData(host.state.get().content ?? "");
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
            this.loadData(this._host.state.get().content ?? "");
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Rest Client editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `wrapLegacyForPage` when constructing a fresh RestClientEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // RC4 + RC5 — re-parse on external content changes; skipNext guard
        // prevents the loop from our own serialize-back writes.
        this._hostContentUnsub = host.state.subscribe(
            (content) => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.loadData(content as string);
            },
            (s) => s.content,
        );

        // HS1 — seed the 2 selection fields from host slot (sync, no flicker).
        const saved = host.getEditorState<RestClientViewSettings>(this.editorId);
        if (saved) {
            this.state.update((s) => {
                if (saved.leftPanelWidth !== undefined) s.leftPanelWidth = saved.leftPanelWidth;
                if (saved.selectedRequestId !== undefined) s.selectedRequestId = saved.selectedRequestId;
            });
        }

        // HS1 — mirror back. Slice-subscribe over a composite key so the
        // mirror fires on selection-slot changes but NOT on data / response /
        // executing / headersJsonInvalid mutations.
        this._settingsUnsub = this.state.subscribe(
            () => {
                if (!this._host) return;
                const s = this.state.get();
                this._host.setEditorState<RestClientViewSettings>(this.editorId, {
                    leftPanelWidth: s.leftPanelWidth,
                    selectedRequestId: s.selectedRequestId,
                });
            },
            (s) => `${s.leftPanelWidth}|${s.selectedRequestId}`,
        );

        // RC4 — state subscription → debounced serialize-back. Replaces
        // today's RestClientViewModel.onInit subscription.
        this._saveSubUnsub = this.state.subscribe(() => this.onDataChangedDebounced());

        // RC18 — fire-and-forget async restore of the response cache. Hits both
        // the descriptor-replay path (restore() → adoptHost) AND the legacy-
        // host adoption path (wrapLegacyForPage → adoptHost). Same shape as
        // today's loadData → restoreResponseCache call site.
        void this.restoreResponseCache();

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled.rest.json");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ────────────────────────────────────────────────────────────────────
    // BELOW: methods relocated from legacy RestClientViewModel.
    // Substitutions: `this.host` → `this._host`; cache-file selection-state
    // mechanics (`restoreSelectionState`, `saveSelectionState`,
    // `saveSelectionStateDebounced`, `selectionRestored`, `static cacheName`)
    // are dropped — replaced by the HS1 slice-subscribe mirror above.
    // ────────────────────────────────────────────────────────────────────

    // ── Serialization: state → file content (RC4 + RC5) ─────────────────

    private onDataChanged = (): void => {
        const { data, error } = this.state.get();
        if (error) return;
        if (!this._host) return;
        if (data.requests !== this.lastSerializedData?.requests) {
            this.lastSerializedData = data;
            // Strip empty trailing header/formData rows before serializing
            const cleanData: RestClientData = {
                ...data,
                requests: data.requests.map((r) => ({
                    ...r,
                    headers: r.headers.filter((h) => h.key || h.value),
                    formData: r.formData.filter((f) => f.key || f.value),
                    formDataEntries: r.formDataEntries.filter((f) => f.key || f.value),
                })),
            };
            const content = JSON.stringify(cleanData, null, 4);
            const currentContent = this._host.state.get().content || "";
            if (content !== currentContent) {
                this.skipNextContentUpdate = true;
                this._host.changeContent(content, true);
            }
        }
    };

    // ── Response cache (RC7 — verbatim from today, with adoptHost-driven
    //     restore via RC18) ────────────────────────────────────────────────

    private restoreResponseCache = async (): Promise<void> => {
        if (!this._host) return;
        const cached = await this._host.stateStorage.getState(
            this._host.id, RestClientEditor.responseCacheName,
        );
        if (!cached) return;
        try {
            this.responseCache = JSON.parse(cached);
            this.restoreResponseForSelected();
        } catch {
            this.responseCache = {};
        }
    };

    private saveResponseCache = (): void => {
        if (!this._host) return;
        const data = JSON.stringify(this.responseCache);
        this._host.stateStorage.setState(
            this._host.id, RestClientEditor.responseCacheName, data,
        );
    };

    private restoreResponseForSelected = (): void => {
        const { selectedRequestId } = this.state.get();
        const cached = this.responseCache[selectedRequestId];
        if (cached) {
            this.state.update((s) => {
                s.response = cached.response;
                s.responseTime = cached.responseTime;
            });
        }
    };

    // ── Data loading (RC4 — verbatim from today's loadData, minus the
    //     restoreSelectionState + restoreResponseCache + selectionRestored
    //     one-shot dance) ─────────────────────────────────────────────────

    loadData = (content: string): void => {
        // VERBATIM RELOCATE FROM RestClientViewModel.loadData (lines 219-277).
        // Drops the `if (!this.selectionRestored) { … }` block — HS1 handles
        // selection seeding in adoptHost; RC18 handles response-cache restore.
        // Drops the `restoreResponseForSelected` call from this path — it's
        // covered by `restoreResponseCache`'s tail when it resolves.
        // ...
    };

    // ── Request CRUD (relocated VERBATIM from RestClientViewModel) ──────

    get selectedRequest(): RestRequest | undefined {
        const { data, selectedRequestId } = this.state.get();
        return data.requests.find((r) => r.id === selectedRequestId);
    }

    selectRequest = (id: string): void => { /* VERBATIM minus saveSelectionStateDebounced */ };
    addRequest = (name?: string, collection?: string): RestRequest => { /* VERBATIM */ };
    deleteRequest = (id: string): void => { /* VERBATIM minus saveSelectionStateDebounced */ };
    renameRequest = (id: string, name: string): void => { /* VERBATIM */ };
    updateRequestCollection = (id: string, collection: string): void => { /* VERBATIM */ };
    deleteCollection = (collectionName: string): void => { /* VERBATIM minus saveSelectionStateDebounced */ };
    moveRequest = (fromId: string, toId: string, newCollection?: string): void => { /* VERBATIM */ };
    updateRequest = (id: string, changes: Partial<RestRequest>): void => { /* VERBATIM */ };

    // ── Body type & language (VERBATIM) ─────────────────────────────────

    updateBodyType = (requestId: string, bodyType: BodyType): void => { /* VERBATIM */ };
    updateBodyLanguage = (requestId: string, bodyLanguage: RawLanguage): void => { /* VERBATIM */ };
    private autoSetContentType = (requestId: string, contentType: string): void => { /* VERBATIM */ };

    // ── Header CRUD (VERBATIM) ──────────────────────────────────────────

    private ensureEmptyLastHeader = (requestId: string): void => { /* VERBATIM */ };
    deleteHeader = (requestId: string, index: number): void => { /* VERBATIM */ };
    toggleHeader = (requestId: string, index: number): void => { /* VERBATIM */ };
    updateHeader = (requestId: string, index: number, changes: Partial<RestHeader>): void => { /* VERBATIM */ };

    // ── Form Data CRUD (VERBATIM) ───────────────────────────────────────

    private ensureEmptyLastFormData = (requestId: string): void => { /* VERBATIM */ };
    deleteFormData = (requestId: string, index: number): void => { /* VERBATIM */ };
    toggleFormData = (requestId: string, index: number): void => { /* VERBATIM */ };
    updateFormData = (requestId: string, index: number, changes: Partial<RestHeader>): void => { /* VERBATIM */ };

    // ── Form Data Entries CRUD (multipart/form-data) — VERBATIM ─────────

    ensureEmptyLastFormDataEntry = (requestId: string): void => { /* VERBATIM */ };
    deleteFormDataEntry = (requestId: string, index: number): void => { /* VERBATIM */ };
    toggleFormDataEntry = (requestId: string, index: number): void => { /* VERBATIM */ };
    updateFormDataEntry = (requestId: string, index: number, changes: Partial<FormDataEntry>): void => { /* VERBATIM */ };

    // ── Paste from clipboard (VERBATIM) ─────────────────────────────────

    pasteRequest = async (clipboardText: string): Promise<boolean> => { /* VERBATIM */ };

    // ── Request execution (VERBATIM — RC7 binary-exclusion gate
    //     preserved) ──────────────────────────────────────────────────────

    setHeadersJsonInvalid = (invalid: boolean): void => { /* VERBATIM */ };
    sendRequest = async (): Promise<void> => { /* VERBATIM — uses this.responseCache + this.saveResponseCacheDebounced */ };

    // ── Layout ──────────────────────────────────────────────────────────

    setLeftPanelWidth = (width: number): void => {
        const clamped = Math.max(150, Math.min(500, width));
        this.state.update((s) => {
            s.leftPanelWidth = clamped;
        });
        // No cache write — HS1 slice-subscribe handles persistence.
    };

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        // Flush BOTH pending debounced saves before host's saveState (RC4
        // — incidentally fixes today's lost-response-save bug; today's
        // onDispose only flushes onDataChanged).
        this.onDataChanged();
        this.saveResponseCache();
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // Flush BOTH pending debounced saves (RC4).
        this.onDataChanged();
        this.saveResponseCache();

        this._tearDownHostSubscriptions();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

The `/* VERBATIM */` bodies are byte-for-byte relocated from today's `RestClientViewModel.ts` (lines noted in walkthrough). Field reads use `this._host` instead of `this.host`. The `app.ui.notify(...)` call in `sendRequest` (RC8) remains unchanged. The RC3 mechanics drop `restoreSelectionState` / `saveSelectionState` / `saveSelectionStateDebounced` / `selectionRestored` / `static cacheName` entirely. The RC7 mechanics keep `restoreResponseCache` / `saveResponseCache` / `restoreResponseForSelected` / `saveResponseCacheDebounced` / `responseCache` / `static responseCacheName` verbatim.

### Phase 5 — Create v4 `RestClientBody.tsx` (view body)

Create `src/renderer/editors/rest-client/RestClientBody.tsx` (~250 LOC). Mirror of today's `RestClientView.tsx` body, with:
- `useContentViewModel` → removed (replaced by direct prop typing `model: RestClientEditor`).
- `useSyncExternalStore` → replaced by `editor.state.use((s) => ({...}))` reactive selector.
- Local splitter-smoothness mirror (`useState(state.leftPanelWidth)` + `handleLeftPanelWidthChange`) preserved verbatim from today's view.
- Center body (left panel `RequestTree` + `<Splitter>` + right panel with `SplitDetailPanel` / empty state) preserved verbatim.
- Queue focus handler: `editor.queue.use((ev) => { if (ev.type === "focus") { /* no-op */ } });` — kept for Tier-5 symmetry.

```typescript
import React, { useMemo, useState } from "react";
import { Panel, Splitter, Text } from "../../uikit";
import { TraitSet, traited } from "../../core/traits/traits";
import { TREE_ITEM_KEY } from "../../uikit/Tree";
import { EditorError } from "../base/EditorError";
import { RestClientEditor } from "./RestClientEditor";
import type { RestRequest } from "./restClientTypes";

// RequestTree, SplitDetailPanel, requestTreeItemTraits, buildGroupedTree, getStatusColor —
// COPIED VERBATIM FROM RestClientView.tsx (lines 30-707). Only the `vm` prop type
// in their public interfaces flips to `RestClientSource` per Phase 3; bodies unchanged.
// Two pragmatic options for the move:
//   (a) Copy the helper functions/components in-place at the bottom of RestClientBody.tsx
//       (legacy view + body share the same definitions but compile separately).
//   (b) Extract RequestTree + SplitDetailPanel + helpers into a new
//       `RestClientShared.tsx` module imported by BOTH RestClientView.tsx (legacy)
//       and RestClientBody.tsx (v4).
// Decision: (b) — extract a `RestClientShared.tsx` module. Avoids ~600 LOC duplication
// and keeps the dual-source pattern (RC13) clean. See Phase 5b.

import {
    RequestTree, SplitDetailPanel, buildGroupedTree, requestTreeItemTraits,
} from "./RestClientShared";

interface RestClientBodyProps {
    model: RestClientEditor;
}

export function RestClientBody({ model: editor }: RestClientBodyProps) {
    const state = editor.state.use((s) => ({
        data: s.data,
        error: s.error,
        selectedRequestId: s.selectedRequestId,
        leftPanelWidth: s.leftPanelWidth,
        executing: s.executing,
        response: s.response,
        responseTime: s.responseTime,
        headersJsonInvalid: s.headersJsonInvalid,
    }));

    // Local mirror for splitter smoothness (today's pattern, preserved).
    const [leftPanelWidth, setLeftPanelWidth] = useState(state.leftPanelWidth);
    const handleLeftPanelWidthChange = useMemo(() => (width: number) => {
        const clamped = Math.max(150, Math.min(500, width));
        setLeftPanelWidth(clamped);
        editor.setLeftPanelWidth(clamped);
    }, [editor]);

    const rootItem = useMemo(() => ({
        id: "__root__",
        isRoot: true as const,
        items: buildGroupedTree(state.data.requests),
    }), [state.data.requests]);

    const tItems = useMemo(
        () => traited([rootItem], requestTreeItemTraits),
        [rootItem],
    );

    // Queue focus handler — kept for Tier-5 symmetry; harmless no-op.
    editor.queue.use((ev) => {
        if (ev.type === "focus") {
            // No explicit refocus today; intentional no-op.
        }
    });

    if (state.error) return <EditorError>{state.error}</EditorError>;

    const selectedRequest = editor.selectedRequest;

    return (
        <Panel name="rest-client-root" direction="row" flex={1} height={0} overflow="hidden">
            <Panel name="rest-left-panel" /* ... verbatim from RestClientView ... */
                   width={leftPanelWidth}>
                <Panel name="rest-left-tree" flex={1} overflow="auto" minHeight={0}>
                    <RequestTree vm={editor} items={tItems} selectedId={state.selectedRequestId} />
                </Panel>
            </Panel>
            <Splitter
                name="rest-left-splitter"
                orientation="vertical"
                value={leftPanelWidth}
                onChange={handleLeftPanelWidthChange}
                side="before" border="after" min={150} max={500}
            />
            <Panel name="rest-right-panel" direction="column" flex={1} width={0} overflow="hidden">
                {selectedRequest
                    ? <SplitDetailPanel vm={editor} request={selectedRequest} state={state as any} />
                    : (
                        <Panel name="rest-empty" flex={1} align="center" justify="center" padding="lg">
                            <Text color="light" italic align="center">
                                {state.data.requests.length === 0
                                    ? "No requests yet. Click + to add one."
                                    : "Select a request from the list."}
                            </Text>
                        </Panel>
                    )}
            </Panel>
        </Panel>
    );
}
```

The body code passes `editor` to both `RequestTree` and `SplitDetailPanel` — works under the `RestClientSource` union from Phase 3.

### Phase 5b — Extract `RestClientShared.tsx` (component reuse)

Per the decision in Phase 5's `RestClientBody` comment, extract shared components into `src/renderer/editors/rest-client/RestClientShared.tsx`:

1. Create `src/renderer/editors/rest-client/RestClientShared.tsx`.
2. Move from `RestClientView.tsx` (was `RestClientEditor.tsx`):
   - `RequestTreeItem` interface
   - `EMPTY_LABEL` constant
   - `requestTreeItemTraits`
   - `getRequestTreeChildren`
   - `buildGroupedTree(requests)` function
   - `SplitDetailPanel({ vm, request, state })` component (verbatim — lines 180-429)
   - `RequestTree({ vm, items, selectedId })` component (verbatim — lines 439-701)
   - `getStatusColor(status)` helper
   - `showContextMenu(e, items)` helper
3. Update component prop types to `RestClientSource` per Phase 3.
4. In `RestClientView.tsx` (legacy), replace the in-file definitions with imports from `./RestClientShared`.
5. In `RestClientBody.tsx` (v4), import from `./RestClientShared`.

This phase keeps the legacy view AND v4 view BOTH compiling without duplicating ~600 LOC of tree/detail UI. Compiles against both legacy and v4 via the `RestClientSource` union.

### Phase 6 — Create v4 `index.tsx` (module export — RC17)

Create `src/renderer/editors/rest-client/index.tsx` (~50 LOC). Simplest of all the Tier-5 modules — no toolbar/footer contributions (RC17):

```typescript
import { TComponentState } from "../../core/state/state";
import { RestClientEditor, defaultRestClientEditorState } from "./RestClientEditor";
import { RestClientBody } from "./RestClientBody";
import { TextChrome } from "../base/v4/TextChrome";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-563 — native Rest Client editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native RestClientEditor instance.
 *
 * NO toolbar/footer contributions (RC17 — per-request toolbar lives inline in
 * SplitDetailPanel; predates portal toolbar pattern).
 */

function RestClientEditorView({ model }: { model: V4EditorModel }) {
    const restClient = model as RestClientEditor;
    return (
        <TextChrome model={model}>
            <RestClientBody model={restClient} />
        </TextChrome>
    );
}

export const restClientModule: EditorModule = {
    createEditor: () =>
        new RestClientEditor(new TComponentState({ ...defaultRestClientEditorState })),
    Component: RestClientEditorView,
};

export { RestClientEditor, defaultRestClientEditorState };
export type { RestClientEditorState, RestClientQueueEvent } from "./RestClientEditor";
```

### Phase 7 — Add `rest-client` branch in `wrapLegacyForPage` (RC14)

Edit `src/renderer/api/pages/PagesLifecycleModel.ts`:

1. Add the import alongside the existing `LinkEditor` / `TodoEditor` imports near the top of the file:
   ```typescript
   import { RestClientEditor, defaultRestClientEditorState } from "../../editors/rest-client";
   ```
2. Insert the `rest-client` branch in `wrapLegacyForPage` AFTER the `todo-view` branch (currently at lines 220-229), BEFORE the `return new LegacyEditorAdapter(legacy, targetEditorId);` fallback:
   ```typescript
   // EPIC-028 / US-563 — Rest Client migrated to native v4 module. Construct
   // RestClientEditor over the legacy TextFileModel host. The initial loadData()
   // call kicks off inline (mirrors today's RestClientViewModel.onInit → loadData
   // behavior). Async restoreResponseCache() fires-and-forgets inside adoptHost
   // (RC18). Non-sidebar-owning Tier-5 editor — no panel registration here.
   if (isTextFile && targetEditorId === "rest-client") {
       const id = legacy.state.get().id || crypto.randomUUID();
       const rest = new RestClientEditor(
           new TComponentState({ ...defaultRestClientEditorState, id }),
       );
       rest.adoptHost(legacy as TextFileModel);
       const content = (legacy as TextFileModel).state.get().content ?? "";
       rest.loadData(content);
       return rest;
   }
   ```

### Phase 8 — Registry mirror loop cleanup + native v4 register (RC15)

Edit `src/renderer/editors/register-editors.ts`:

1. Remove `"rest-client"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 775). Replace with a comment block matching the pattern of the others:
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
       // link-view removed — US-555 ships native v4 module.
       // todo-view removed — US-556 ships native v4 module.
       // rest-client removed — US-563 ships native v4 module.
       "notebook-view",
   ]);
   ```
2. Add a native v4 register block at the bottom of the file (after the US-556 todo-view block at lines 1137-1169):
   ```typescript
   // US-563 — replace the legacy bare-adapter mirror for rest-client with a
   // native v4 module. `v4EditorRegistry.register` overwrites by id, so this
   // supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
   // to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
   // to avoid duplicating extension/language/content-peek rules.
   v4EditorRegistry.register({
       id: "rest-client",
       name: "Rest Client",
       hasContentHost: true,
       accepts: (input) => {
           const legacy = editorRegistry.getById("rest-client");
           if (!legacy) return -1;
           if (input.fileName) {
               const p = legacy.acceptFile?.(input.fileName) ?? -1;
               if (p >= 0) return p;
           }
           if (input.language) {
               const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
               if (p >= 0) return p;
           }
           // Content-peek fallback (RC10): for `.json` files without the
           // `.rest.json` extension but with rest-client-shaped content.
           if (input.language === "json" && input.host) {
               const content = (input.host.state.get() as { content?: string }).content ?? "";
               if (legacy.isEditorContent?.(input.language, content)) return 60;
           }
           return -1;
       },
       loadModule: async () => {
           const { restClientModule } = await import("./rest-client");
           return restClientModule;
       },
   });
   ```
3. The legacy registry block at lines 428-461 STAYS ALIVE with the updated `loadModule` from Phase 1.

### Phase 9 — Verify no facade or PageWrapper changes (RC10 / RC16)

Per RC10 and RC16: **no `src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts` exists or gets created; no `asRestClient` in `api/types/page.d.ts`; no changes to `PageWrapper.ts`.** Confirmed via final grep across `src/renderer/scripting/api-wrapper/` and `src/renderer/api/types/page.d.ts`.

### Phase 10 — Verification

1. **Type-check + lint:** `npx tsc --noEmit` + `npm run lint` — both clean.
2. **No new errors in pre-existing files** (`automation/commands.ts`, `worker/WorkerRunner.ts`) — verify those errors persist verbatim (they are pre-existing and unrelated, same as US-555 / US-556 closure).
3. **Manual test plan:** run `npm start` and exercise the 12 acceptance criteria below.

---

## Acceptance criteria

1. **Open `.rest.json` file** — Rest Client editor opens with the request tree + selected request detail; matches today's visual layout (no regressions in tree rows, METHOD badges, splitter sizing, double-click expand-toggle).
2. **Create new Rest Client page from sidebar "Rest Client" button** — creates a `untitled.rest.json` page with the v4 RestClientEditor (verify `page.mainEditorV4 instanceof RestClientEditor` in DevTools console).
3. **Send a request** — request completes via `nodeFetch`; response panel populates with status / time / size / body; binary responses render preview + Save / Open buttons; cURL paste auto-fills request.
4. **CRUD a request / collection / header / formData entry** — adds, deletes, renames, reorders work identically to today; "Open in New Editor" from collection / request context menu creates a new page with the v4 editor.
5. **Cross-editor LINK trait drop** — drag a link from PageNavigator into the request tree creates a new request from the link (RC9 verbatim).
6. **JSON self-write loop closes correctly (RC5)** — edit a request → file content updates in 300ms; editing the JSON in Monaco (via "Switch to Text Editor") → request tree updates without echo loop.
7. **HS1 selection persistence (RC3)** — close + reopen the page (or restart the app): `leftPanelWidth` and `selectedRequestId` restore correctly.
8. **HS1 selection persistence cross-switch (RC3)** — switch Rest Client ↔ Monaco ↔ Rest Client: `leftPanelWidth` and `selectedRequestId` survive the round-trip.
9. **Response cache restore (RC7 + RC18)** — send a request; close + reopen the file: last response renders for the previously selected request. Repeat with the file restored from a fresh session (descriptor-replay path) — same outcome.
10. **Lost-response-save bug fix (RC4)** — send a request and **immediately** close the page (within 500ms): on reopen, the response is still cached (today this is lost; under US-563 the `dispose()` flush of `saveResponseCache()` saves it).
11. **NO scripting facade exposure** — `app.pages.find(...).asRestClient` is `undefined` in script console; matches today behavior.
12. **NO regression in other Tier-5 editors** — open Grid, Log View, Markdown, Mermaid, Svg, Html, Graph, Draw, Link, Todo files; all switch widgets work; all v4 editors load correctly. Especially verify the Todo facade (`page.asTodo`) and Link facade (`page.asLink`) still work after the v4 mirror block extension.

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/renderer/editors/rest-client/RestClientEditor.tsx` | **Renamed** to `RestClientView.tsx` via `git mv` | RC11 — exported `RestClientEditor` function name UNCHANGED |
| `src/renderer/editors/rest-client/RestClientView.tsx` | After rename: import from `./RestClientShared` for `RequestTree` + `SplitDetailPanel` + helpers | Phase 5b extraction; otherwise verbatim |
| `src/renderer/editors/rest-client/RestClientViewModel.ts` | **Preserved verbatim** | RC12 — kept alive for future notebook-embed |
| `src/renderer/editors/rest-client/RestClientShared.tsx` | **NEW** (~600 LOC) | Extract `RequestTree` + `SplitDetailPanel` + `buildGroupedTree` + traits + helpers; prop types use `RestClientSource` union |
| `src/renderer/editors/rest-client/RestClientEditor.ts` | **NEW** (~600 LOC) | RC1 / RC2 / RC4 / RC5 / RC7 / RC18 — v4 class with TextFileModel host |
| `src/renderer/editors/rest-client/RestClientBody.tsx` | **NEW** (~150 LOC) | v4 view body; imports from `./RestClientShared` |
| `src/renderer/editors/rest-client/index.tsx` | **NEW** (~50 LOC) | `restClientModule: EditorModule` + `RestClientEditorView` wrapper (no toolbar/footer per RC17) |
| `src/renderer/editors/rest-client/restClientTypes.ts` | **Modified** | Add `RestClientSource` union type at bottom (RC13) |
| `src/renderer/editors/rest-client/RequestBuilder.tsx` | **Modified** | RC13 — `vm: RestClientViewModel` → `vm: RestClientSource` in 3 prop interfaces |
| `src/renderer/editors/rest-client/ResponseViewer.tsx` | NO CHANGE | No VM coupling |
| `src/renderer/editors/rest-client/KeyValueEditor.tsx` | NO CHANGE | No VM coupling (callbacks only) |
| `src/renderer/editors/rest-client/multipartBuilder.ts` | NO CHANGE | Pure utility |
| `src/renderer/editors/rest-client/parseClipboardRequest.ts` | NO CHANGE | Pure utility |
| `src/renderer/editors/rest-client/serializeRequest.ts` | NO CHANGE | Pure utility |
| `src/renderer/editors/rest-client/httpConstants.ts` | NO CHANGE | Pure constants |
| `src/renderer/editors/rest-client/open-in-rest-client.ts` | NO CHANGE | Resolver-only; no editor-class coupling |
| `src/renderer/editors/register-editors.ts` | **Modified** | Phase 1 — legacy `loadModule` imports `./rest-client/RestClientView`; Phase 8 — remove `rest-client` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` + add native v4 `v4EditorRegistry.register({ id: "rest-client", … })` block |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | **Modified** | RC14 — add `rest-client` branch in `wrapLegacyForPage` + top-of-file import of `RestClientEditor` / `defaultRestClientEditorState` |
| `src/renderer/content/resolvers.ts` | NO CHANGE | Resolver-only; entry point unchanged |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | NO CHANGE | RC16 — no `asRestClient` |
| `src/renderer/api/types/page.d.ts` | NO CHANGE | RC10 / RC16 — no `asRestClient` declaration |
| `doc/active-work.md` | **Modified** | Move US-563 entry to investigation-complete status with link to this doc |

**Total file delta:** 6 new (RestClientEditor.ts, RestClientBody.tsx, RestClientShared.tsx, index.tsx, README.md, plus Phase 5b extraction); 1 rename (RestClientEditor.tsx → RestClientView.tsx); 4 modified pre-existing files (restClientTypes.ts, RequestBuilder.tsx, register-editors.ts, PagesLifecycleModel.ts); 1 preserved pre-existing (RestClientViewModel.ts); 1 dashboard update.

**Estimated diff:** roughly +1700 / −0 LOC (most lines moved into RestClientShared.tsx are net-zero — they leave RestClientView.tsx and arrive in RestClientShared.tsx; the +1700 covers RestClientEditor.ts + RestClientBody.tsx + index.tsx + the new shared file's import wiring).

---

## Open questions

None. All RC1–RC18 resolved up front. Implementation is ready to begin.
