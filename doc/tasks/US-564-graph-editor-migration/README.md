# US-564: Graph editor migration

EPIC-028 Phase C — first of the two skipped-in-design Tier-5 text-bearing editors (US-564 Graph + US-565 Draw, both walkthrough-less). Promotes the legacy `GraphViewModel` (a `ContentViewModel<GraphViewState>` over `TextFileModel` with five owned submodels — `ForceGraphRenderer`, `GraphDataModel`, `GraphVisibilityModel`, `GraphGroupModel`, `GraphConnectivityModel`, `GraphSearchModel`) to a native v4 `GraphEditor` extending `EditorModel`. Retires the `useContentViewModel("graph-view")` consumer site and the `acquireViewModel("graph-view")` facade-acquire pair.

**Walkthrough status:** No walkthrough 27 exists — Graph was deferred during the EPIC-028 design pass. This document is the first place the migration design is written down. Pattern reuse is explicit (PV1 / PV4 / PV7 / PV10 from walkthrough 22 — preview-group; HS1 from the 2026-05-21 amendment; MK4 from US-554).

Direct precedents (the pattern set this task draws from byte-for-byte):
- [`US-554 (Markdown)`](../US-554-markdown-editor-migration/README.md) — the HS1 host-slot pattern (applied to `groupingEnabled` here, identical mechanism to Markdown's `compactMode`) and the MK4 typed-host getter.
- [`US-560 (Svg)`](../US-560-svg-editor-migration/README.md) — the canvas-ref bridge shape with portal copy / open-draw buttons (GR2 mirrors SV2 directly; the open-draw button uses the same draw-export call).
- [`US-561 (Html)`](../US-561-html-editor-migration/README.md) — the shape-based restore discriminator (`d.host !== undefined`) auto-includes Graph descriptors without a `PagesPersistenceModel` edit.
- [`US-562 (Mermaid)`](../US-562-mermaid-editor-migration/README.md) — the recent and richest sibling (MR1–MR10 concern set); the same "preserve legacy view + view-model for notebook embedding" lesson applies (GR1).

The material differences from US-562 (Mermaid):
1. **Five owned submodels (GR5)** — `renderer`, `dataModel`, `visibilityModel`, `groupModel`, `connectivityModel`, `searchModel`. Same instances the legacy `GraphViewModel` held; relocated as `readonly` fields on `GraphEditor`. Lifecycle wiring (renderer callbacks, dispose ordering) preserved byte-for-byte from `onInit` / `onDispose`.
2. **JSON serialization round-trip (GR7)** — `host.changeContent(json, true)` writes the editor's mutated `dataModel.sourceData` back to the host. The `skipNextContentUpdate` flag prevents the resulting `s.content` slice-subscribe from triggering an unnecessary reparse. Preserved verbatim.
3. **In-canvas overlay toolbar (GR9)** — the legacy view positions a Settings / Grouping / Reset / Expand-all / Search toolbar absolutely over the canvas. This stays in the body — `<TextChrome>` only owns the page-top toolbar (NavPanel + spacer + open-draw + copy-image + switch-widget) and the footer (statusHint + recordsCount).
4. **Many view-attached callbacks (GR3)** — `onDoubleClickNode`, `onHighlightSelection`, `isPopupOpen` flag, and renderer event handlers (`onBadgeExpand`, `onHoverChanged`, `onContextMenuAction`, `onAltClick`, `onSelectionChanged`, `onDoubleClick`) are all view↔editor plumbing. They stay as instance fields on `GraphEditor` (matching the legacy `GraphViewModel` API surface) so the body / sub-panels can read them directly. None of this is part of persistent state.
5. **`groupingEnabled` HS1 persistence (GR4)** — today `groupingEnabled` resets to `true` on every load (transient view state). After US-564 it rides `host.editorSettings["graph-view"]` (HS1 host-slot, identical mechanism to Markdown's `compactMode`). User override sticks across editor switches AND app restarts. This is a small UX upgrade enabled by the migration; not a behavior regression.

## Goal

Replace the host + content-view pair (`TextFileModel` wrapped in `LegacyEditorAdapter` + `GraphViewModel` acquired via `useContentViewModel`) with a single native `GraphEditor` that IS the page's `mainEditor` and HAS a `TextFileModel` as its `IContentHost` via `CONTENT_HOST_TRAIT`. The `GraphEditorFacade` flips from wrapping `GraphViewModel` to wrapping `GraphEditor` directly (stays sync — all current getters and methods preserved; submodel access unchanged). State slice extends `EditorStateBase` with `groupingEnabled` (HS1-mirrored) + view-derived fields (`error`, `loading`, `searchQuery`, `searchInfo`, `searchResults`, `tooltip`, `selectedNodes`, `linkedNodes`, `statusHint`) that ride state for reactivity and are stripped from `getRestoreData` per PV7.

## Background

### Reference shape — three precedents, one new piece

This task is the **fifth exercise of the Tier-5 template on a text-bearing editor**, after US-554 (Markdown), US-560 (Svg), US-561 (Html), and US-562 (Mermaid). The skeleton is identical to those four — the **new piece is the orchestration weight**: five owned submodels + ~1100 LOC of selection / grouping / context-menu / editing operations. None of it is architecturally novel; it's all relocated from the legacy `GraphViewModel` body byte-for-byte.

Pieces specific to Graph:

- Five `readonly` submodels on `GraphEditor`: `renderer`, `dataModel`, `visibilityModel`, `groupModel`, `connectivityModel`, `searchModel`. Constructed in the editor constructor (mirrors the legacy VM's field declarations).
- `_parseTimer`, `_tooltipTimer`, `_tooltipHideTimer` — private timers; cleared in `dispose` and via `extractContentHost`.
- `_hostContentUnsub` — slice-subscribe on `host.state.content` → `parseDebounced()` (replaces `onContentChanged`).
- `_groupingEnabledUnsub` — slice-subscribe on `editor.state.groupingEnabled` → no-op (mirror to HS1 slot is done by the existing `_settingsUnsub` HS1 mirror; the slice-subscribe here is the HS1 mirror itself, not a separate subscription).
- `_settingsUnsub` — HS1 mirror for `groupingEnabled` (slice-subscribe on the editor's slice writes to `host.setEditorState`).
- Identity-only descriptor (PV7) — all view-derived state stripped; `groupingEnabled` rides host-slot.
- View-attached fields on the editor instance (set by body in mount, cleared on unmount): `onDoubleClickNode`, `onHighlightSelection`, `isPopupOpen`.

Everything else mirrors US-554 / US-560 / US-561 / US-562 byte-for-byte:

1. Class extends `V4EditorModel<GraphEditorState, void, GraphQueueEvent>` with `readonly editorId = "graph-view"`, `_host: TextFileModel | null`, `_hostStateUnsub`, `_settingsUnsub` (HS1 mirror for `groupingEnabled`), `_hostContentUnsub` (PV5-style content-change → `parseDebounced`).
2. Constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost` that tears down ALL subscriptions + clears all timers before returning the host (the host transfers; the editor must release every host-tied resource).
3. `getRestoreData()` strips all view-derived state (PV7); `groupingEnabled` rides HS1 host-slot.
4. `applyRestoreData()` stashes `_pendingHost`. No `groupingEnabled` carry from descriptor (HS1 reads from host-slot in `adoptHost`).
5. `switchFrom(oldEditor)` extracts the host via trait, copies id, tags host with the new editor id, calls `adoptHost`. **Initial parse kicks off from `adoptHost`** via an explicit `this.parseContent()` call at the end (MR3 pattern — slice-subscribe doesn't fire on first attach).
6. `restore()` rebuilds the host from `_pendingHost`, calls `host.restore()`, then `adoptHost`. Same initial-parse kick.
7. `adoptHost(host)` wires the host-state forwarder, the HS1 mirror for `groupingEnabled` (seed from slot + slice-subscribe to mirror back), the content-change retrigger AND calls `parseContent()` for the initial parse.
8. `dispose()` clears all timers + tears down all subscriptions + disposes the renderer (only if not extracted) before disposing the host.
9. Module file (`graph/index.tsx`) exports an `EditorModule` (`{ createEditor, Component }`) consumed by the v4 registry; `register-editors.ts` appends a v4 native registration. The legacy `loadModule` is preserved with eager imports for notebook embedding — see GR1.

### Today's per-editor surface

`src/renderer/editors/graph/`:

| File | Today's role | After US-564 |
|------|--------------|--------------|
| `GraphViewModel.ts` | `ContentViewModel<GraphViewState>` over `TextFileModel`. Constructs 5 submodels (`renderer`, `visibilityModel`, `dataModel`, `groupModel`, `connectivityModel`, `searchModel`). `onInit`: wires renderer callbacks, calls `parseContent()`. `onContentChanged`: `parseDebounced()` (skips if `skipNextContentUpdate`). `onDispose`: clears 3 timers + disposes renderer. Owns ~1500 LOC of orchestration: tooltip / context-menu / selection / grouping / editing / search / serialization / parsing. | **Retained verbatim** for notebook embedding (see GR1 below). The page-level v4 path no longer constructs it. |
| `GraphView.tsx` | React component, props `{ model: TextFileModel }`, uses `useContentViewModel<GraphViewModel>` + `useSyncExternalStore`. Renders root `<div>` with canvas, in-canvas overlay toolbar (Settings + Grouping + Reset + Expand-all + Search input + Tabs panel with Physics/Expansion/Results), GraphTooltip, GraphDetailPanel, GraphLegendPanel, portal toolbar (open-in-draw + copy-image), portal footer (statusHint + recordsCount). | **Retained verbatim** for notebook embedding (see GR1). The page-level v4 path uses the new `GraphBody.tsx`. |
| `GraphTuningSliders.tsx` | Force-tuning panel; takes `vm: GraphViewModel` prop. Reads/calls `vm.updateForceParams`, `vm.resetForceParams`. | **Renamed prop** `vm` → `editor` and type → `GraphEditor`. All other code unchanged (the method signatures are identical between the legacy VM and the new editor). |
| `GraphExpansionSettings.tsx` | Expansion-options panel; takes `vm: GraphViewModel`. Reads `vm.getAllNodes`, `vm.getExpansionOptions`, `vm.updateExpansionOptions`, `vm.setRootNode`, `vm.rootNodeId`. | Same — `vm` → `editor`. |
| `GraphLegendPanel.tsx` | Legend overlay; takes `vm: GraphViewModel`. Sets `vm.onHighlightSelection`. Reads many getters. | Same — `vm` → `editor`. |
| `GraphDetailPanel.tsx` | Right-side detail / properties panel; takes flat props (no `vm` directly) but consumes results of vm methods (`updateNodeProps` etc.). | **Unchanged** — already prop-isolated from the VM. The body wires the editor's methods into its props. |
| `GraphTooltip.tsx` | Tooltip overlay; takes flat props. | **Unchanged** — already prop-isolated. |
| `GraphContextMenu.ts` | Builds menu items; pure module — no VM/editor dependency. | **Unchanged**. |
| `ForceGraphRenderer.ts` / `GraphDataModel.ts` / `GraphVisibilityModel.ts` / `GraphGroupModel.ts` / `GraphConnectivityModel.ts` / `GraphSearchModel.ts` / `GraphIcons.tsx` / `constants.ts` / `shapeGeometry.ts` / `types.ts` | Submodels and supporting utilities — pure modules. | **Unchanged**. |
| (new) `GraphEditor.ts` | — | Native v4 `GraphEditor` class — trait, lifecycle, host adoption, JSON parse/serialize round-trip, HS1 mirror for `groupingEnabled`, 5 submodels + ~1100 LOC of relocated orchestration (selection, grouping, editing, tooltip, context-menu, search). Estimated ~1500 LOC. |
| (new) `GraphBody.tsx` | — | Body view — reads `editor.state.use(...)` reactively; renders canvas + in-canvas overlay toolbar + tooltip + GraphDetailPanel + GraphLegendPanel. Wires renderer to canvas via callback ref. Mounts and clears view-attached editor callbacks (`onDoubleClickNode`, `onHighlightSelection`). Estimated ~620 LOC. |
| (new) `index.tsx` | — | Module shell — `EditorModule` export (`graphModule`), `GraphEditorView` (`<TextChrome>` with `rightToolbarContributions={<GraphToolbarBits .../>}` + `footerContributions={<GraphFooterBits .../>}` + `<GraphBody>` + view-local `canvasRef`). Replaces today's `index.ts`. Estimated ~110 LOC. |

`src/renderer/editors/graph/index.ts` (existing) — re-exports `GraphView` + `GraphViewProps`. **Deleted** because `index.tsx` supersedes it; the notebook embedding path imports `./GraphView` directly via the legacy `loadModule`'s `Promise.all`.

### State slice carve-up (what stays vs what's HS1-mirrored vs what's stripped)

Today's `defaultGraphViewState`:
```typescript
{
    error: "",
    loading: true,
    searchQuery: "",
    searchInfo: null,
    searchResults: null,
    tooltip: null,
    selectedNodes: [],
    linkedNodes: [],
    statusHint: "",
    groupingEnabled: true,
}
```

After US-564:

| Field | Type | Persistence | Reason |
|-------|------|-------------|--------|
| `error` | `string` | **Transient** (stripped) | Recomputed by next parse. |
| `loading` | `boolean` | **Transient** (stripped) | Recomputed on every parse. |
| `searchQuery` | `string` | **Transient** (stripped) | View-state; user re-types if needed. |
| `searchInfo` | `SearchInfo \| null` | **Transient** (stripped) | Derived from `searchQuery` + dataModel. |
| `searchResults` | `SearchResult[] \| null` | **Transient** (stripped) | Same. |
| `tooltip` | `TooltipInfo \| null` | **Transient** (stripped) | Mouse-driven; recomputes on hover. |
| `selectedNodes` | `GraphNode[]` | **Transient** (stripped) | View selection; recomputes from `renderer.selectedIds` on hover/click. |
| `linkedNodes` | `GraphNode[]` | **Transient** (stripped) | Same. |
| `statusHint` | `string` | **Transient** (stripped) | Hover-driven hint text. |
| `groupingEnabled` | `boolean` | **HS1 host-slot** (`host.editorSettings["graph-view"].groupingEnabled`) | User preference; persists across switches AND restarts (GR4). |
| `id` | `string` | Identity descriptor | EditorStateBase. |
| `title` | `string` | Identity descriptor | EditorStateBase. |
| `modified` | `boolean` | Identity descriptor | EditorStateBase. |
| `secondaryEditor` | `string \| undefined` | Identity descriptor | EditorStateBase. |

Three derivable values — `rootNodeId`, `hasGroups`, `recordsCount` — stay as **getters** on `GraphEditor` (mirrors today's VM getters). They read from `dataModel.sourceData` and `renderer.getNodes()` live; no state slice needed.

### Submodel ownership (GR5)

`GraphEditor` declares 6 `readonly` fields, constructed in the constructor with the same shape as the legacy VM:

```typescript
readonly renderer = new ForceGraphRenderer();
readonly visibilityModel = new GraphVisibilityModel();
readonly dataModel = new GraphDataModel();
readonly groupModel = new GraphGroupModel();
readonly connectivityModel = new GraphConnectivityModel();
readonly searchModel: GraphSearchModel; // constructed after renderer is set
```

Notes:
- `GraphSearchModel` takes `(renderer, visibilityModel)` in its constructor (matches the legacy VM order). Constructed after the others in the constructor body.
- These are **the same instances** the legacy `GraphViewModel` held; the wiring (callbacks, dispose) is also identical.
- The 6 fields are exposed publicly (no `_` prefix) — the body, sub-panels, and `GraphEditorFacade` all read from them directly. This mirrors today.

### Async JSON parse pipeline — relocated from VM to editor (mirrors PV5 / MR3)

Today's `GraphViewModel.parseDebounced` and `parseContent`:
```typescript
private parseDebounced(): void {
    clearTimeout(this._parseTimer);
    this._parseTimer = setTimeout(() => this.parseContent(), 400);
}

private parseContent(): void {
    const content = this.host.state.get().content;
    if (!content.trim()) { /* clear sourceData, set loading false */ return; }
    try {
        const json = JSON.parse(content);
        this.originalJson = json;
        this.dataModel.sourceData = { nodes: json.nodes ?? [], links: json.links ?? [], options: json.options };
        // ... physics params from options, set error/loading, rebuildAndRender, set rootNodeId, refreshSelectedNodes
    } catch (e) {
        this.state.update((s) => { s.error = e.message || "Invalid JSON"; s.loading = false; });
    }
}
```

After migration, this lives on `GraphEditor` byte-for-byte except: `this.host.state.get().content` becomes `this._host?.state.get().content ?? ""` (host can be null between switches). Same 400 ms debounce, same parse / rebuild flow.

The trigger source changes from `onContentChanged` (called by ContentViewModelHost on host content change, skipped if `skipNextContentUpdate`) to a slice-subscribe on `host.state.content`:

```typescript
// in adoptHost(host):
this._hostContentUnsub = host.state.subscribe(
    () => {
        if (this.skipNextContentUpdate) {
            this.skipNextContentUpdate = false;
            return;
        }
        this.parseDebounced();
    },
    (s) => s.content,
);
```

And a kickoff call at the end of `adoptHost`:
```typescript
this.parseContent();  // initial parse against the freshly-adopted host
```

This matches today's behavior: `GraphViewModel.onInit()` calls `this.parseContent()` at the end after wiring renderer callbacks. GR6 expands the rationale.

### Persistence story (PV7 + HS1)

**View-derived (stripped from `getRestoreData`):** all the transient fields listed in the carve-up table above.

**Persisted via HS1 host-slot (GR4):**
- `groupingEnabled` — rides `host.editorSettings["graph-view"]`. Initial value defaults to `true` on first construct (no slot yet). User toggle sticks across:
  - Graph ↔ Monaco editor switches (host survives the switch; slot survives with it).
  - App restarts (slot rides host descriptor in `openFiles*.json`).
  - Re-open from disk (slot persists in `openFiles0.json` host descriptor for as long as the host descriptor persists).

**Editor descriptor:**
```typescript
getRestoreData(): EditorDescriptor {
    const s = this.state.get();
    // Identity-only descriptor. groupingEnabled rides host.editorSettings["graph-view"]
    // (HS1); all other view-derived state stripped per PV7 / MO5.
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
1. `PagesPersistenceModel.restorePage()` sees `d.host !== undefined` → routes through native v4 path (fix from US-561; auto-includes Graph).
2. v4 registry's `graph-view` `createEditor()` constructs a fresh `GraphEditor` with `defaultGraphEditorState`.
3. `editor.applyRestoreData(d)` stashes `_pendingHost`.
4. `editor.restore()` rebuilds the host via `TextFileModel.fromDescriptor(_pendingHost)`, calls `host.restore()`, then `adoptHost(host)`.
5. `adoptHost` reads `host.getEditorState("graph-view")` — if the slot exists with `groupingEnabled`, overrides the default. Wires content slice-subscribe + HS1 mirror. Calls `parseContent()` for the initial parse.
6. The parse runs synchronously (`JSON.parse` is sync), `dataModel.sourceData` populates, `rebuildAndRender` runs, the renderer rebuilds the simulation, and `loading` flips to `false`. View re-renders with the canvas-mounted simulation.

This is the same flow as today (modulo the HS1 persistence — today's `groupingEnabled` always reverts to `true` on every reopen).

### Consumer sites of GraphViewModel / GraphView — full grep result

| File | Line(s) | Pattern today | After US-564 |
|------|---------|---------------|--------------|
| `src/renderer/editors/graph/GraphView.tsx` | 8, 233 | imports `GraphViewModel` + `defaultGraphViewState` + `GraphViewState`; `useContentViewModel<GraphViewModel>(model, "graph-view")` | **Unchanged.** Preserved for notebook embedding (GR1). |
| `src/renderer/editors/graph/GraphTuningSliders.tsx` | prop type `vm: GraphViewModel` | Reads/calls vm methods | **Prop rename** `vm: GraphViewModel` → `editor: GraphEditor`; all method calls unchanged (same method names exist on `GraphEditor`). |
| `src/renderer/editors/graph/GraphExpansionSettings.tsx` | prop type `vm: GraphViewModel` | Same | Same. |
| `src/renderer/editors/graph/GraphLegendPanel.tsx` | prop type `vm: GraphViewModel`; sets `vm.onHighlightSelection` | Same | Same. |
| `src/renderer/editors/graph/GraphSearchModel.ts` | — | Pure module | **Unchanged.** |
| `src/renderer/editors/graph/index.ts` | 1–2 | Re-exports `GraphView` + `GraphViewProps` | **Deleted.** Replaced by `index.tsx` (different surface — adds `graphModule` + class re-export). Notebook embedding path imports `./GraphView` directly via the legacy `loadModule`'s `Promise.all`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | 18, 280–289 | `import type { GraphViewModel }` + `await model.acquireViewModel("graph-view") as GraphViewModel` + `releaseList.push(...)` | `this.v4 instanceof GraphEditor` direct check; `new GraphEditorFacade(this.v4)`; releaseList push deletes. Same pattern as `asMarkdown` / `asSvg` / `asHtml` / `asMermaid`. |
| `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts` | constructor + all getters/methods | Wraps `GraphViewModel`; reads `vm.dataModel.X` / `vm.renderer.X` / `vm.groupModel.X` / `vm.connectivityModel.X` | Wraps `GraphEditor`; reads `editor.dataModel.X` / `editor.renderer.X` / etc. (one-symbol rename — `vm` → `editor`). Stays sync. |
| `src/renderer/editors/register-editors.ts` | 493–528, 749, ~999–1020 (new) | Legacy registration + `TEXT_CONTENT_VIEW_BRIDGE_IDS` includes `"graph-view"` | Keep legacy registration (GR1 — eager imports preserved); drop `"graph-view"` from bridge set; append v4 native registration (same shape as mermaid). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | ~19 (import) + after line 167 (`wrapLegacyForPage` Mermaid branch) | No graph branch — falls through to `LegacyEditorAdapter` | Add `import { GraphEditor, defaultGraphEditorState } from "../../editors/graph";` + add `if (isTextFile && targetEditorId === "graph-view")` branch after the Mermaid branch. |
| `src/main/mcp-http-server.ts` | 610 | String literal `"graph-view"` in MCP tool description | **Unchanged.** Editor id preserved. |
| `src/shared/types.ts` | 2 | `EditorView` union contains `"graph-view"` | **Unchanged.** |
| `src/renderer/api/types/common.d.ts` | 44 | `EditorView` union contains `"graph-view"` | **Unchanged.** |
| `src/renderer/api/types/graph-editor.d.ts` | `IGraphEditor` interface | Facade interface — sync data/selection/relationships/search/traversal/analysis/options getters | **Unchanged.** Shape preserved. |
| `src/renderer/ui/sidebar/tools-editors-registry.ts` | 98–103 | `pagesModel.addEditorPage("graph-view", "json", "untitled.fg.json")` for sidebar "Force Graph" button | **Unchanged.** Creates a new page that takes the v4 path via `wrapLegacyForPage`'s new Graph branch. |
| `src/renderer/editors/graph/GraphViewModel.ts` | 1347 | `pagesModel.addEditorPage("graph-view", "json", title, JSON.stringify(graphData, null, 2))` in `extractSelected` | **Migrated.** The `extractSelected` method moves with the rest of `GraphViewModel`'s body into `GraphEditor`; the call stays identical (still creates a new graph page that takes the v4 path). Legacy `GraphViewModel.extractSelected` also keeps this line (it's preserved for notebook embedding — see GR1). |

The `acquireViewModel*` machinery itself does NOT die in this task — `NoteItemEditModel.ts` is still a consumer for notebook-embedded notes AND we are intentionally KEEPING the legacy `loadModule` populated for the notebook path. Full removal happens in US-557 (Notebook) and US-559 (cleanup).

### Open-file path — `wrapLegacyForPage`

`src/renderer/api/pages/PagesLifecycleModel.ts:58` (`wrapLegacyForPage`) is the bridge that converts legacy `TextFileModel` instances into v4 editors during page creation. It has seven `if` branches today (Monaco, Grid, LogView, Markdown, Svg, Html, Mermaid) that produce native v4 editors; everything else falls through to `LegacyEditorAdapter`. US-564 adds the Graph branch after the Mermaid branch (~line 168):

```typescript
// EPIC-028 / US-564 — Graph migrated to native v4 module. Construct
// GraphEditor over the legacy TextFileModel host. The initial parseContent()
// call kicks off inside adoptHost (mirrors today's GraphViewModel.onInit →
// parseContent behavior).
if (isTextFile && targetEditorId === "graph-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const graph = new GraphEditor(
        new TComponentState({ ...defaultGraphEditorState, id }),
    );
    graph.adoptHost(legacy as TextFileModel);
    return graph;
}
```

This makes:
- Open an `.fg.json` file from explorer → routed via legacy registry's `acceptFile` (priority 20 for `.fg.json`) → `wrapLegacyForPage` → `GraphEditor` via the new branch.
- "Force Graph" sidebar button → `pagesModel.addEditorPage("graph-view", "json", "untitled.fg.json")` → same path through `wrapLegacyForPage` with `editor = "graph-view"`.
- `extractSelected` (selection-extraction action from within a graph page) → `pagesModel.addEditorPage("graph-view", "json", title, JSON.stringify(graphData, null, 2))` → same path.

The legacy registry's `graph-view` entry stays populated (legacy `Editor` slot = `GraphView`; `createViewModel` = `createGraphViewModel`) for notebook embedding compatibility (GR1). The bare-adapter mirror in the v4 bridge loop drops `"graph-view"` from the bridge set — a native v4 registration replaces it (same mechanism as US-554 / US-560 / US-561 / US-562).

### Notebook embedding — the GR1 lesson from US-554 / US-560 / US-561 / US-562

`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` (per-note content-view dispatch) reads `editorRegistry.getById(editor).loadModule()` at runtime and mounts the returned `module.Editor` inside `<AsyncEditor>`. The editor name is whatever's saved on the note (`state.editor`) — `"graph-view"` is a legitimate value if a user has built a notebook with a Graph-typed note.

US-554 originally collapsed the legacy md-view `loadModule` to `return textEditorModule`, which broke startup on sessions containing notebook-embedded markdown notes. The fix preserved the legacy view + view-model files and the eager `Promise.all([import(view), import(view-model)])` block in the legacy `loadModule`. US-560 (Svg), US-561 (Html), and US-562 (Mermaid) applied the same lesson up front.

**US-564 applies the same lesson up front**: keep `GraphView.tsx` + `GraphViewModel.ts` + the five submodel files alive AND keep the legacy `loadModule`'s eager imports of both top-level files. The submodels are imported transitively (legacy `GraphViewModel.ts` imports them) so no extra eager imports are needed. The v4 native module lives in parallel (`v4EditorRegistry.register({ id: "graph-view", ... })`) and is the path the open-file flow takes. The notebook embedding path keeps using the legacy module until US-557 migrates Notebook.

### Backwards compatibility — pre-US-564 session data

Today's session data:
- `<host.id>-host.txt` — Graph JSON source; cache-keyed by editor id. Survives across migration since `GraphEditor` inherits the host's id (C9). No content shape change.
- `EditorDescriptor` shape — today's graph-view pages are persisted as `editor: "graph-view"` + `type: "textFile"` (legacy adapter shape). After US-564 they save as `editorId: "graph-view"` + a host descriptor (native v4 shape). v3 restore path auto-promotes pre-US-564 sessions by calling `wrapLegacyForPage` on the restored `TextFileModel` — the new Graph branch handles the promotion.
- **`groupingEnabled`** — today's value is always reset to `true` on every reopen (no persistence). After US-564 the slot didn't exist before; the editor falls back to `true` on first construct (same behavior). First user toggle persists.
- Physics force-tuning params + expansion options + root node + legend descriptions — all already persist today via `dataModel.sourceData.options` serialization to host content. No change after migration.

No per-editor cache files to clean up — `GraphViewModel` never wrote any.

## Implementation plan

### Step 1 — Create `src/renderer/editors/graph/GraphEditor.ts`

New file. Skeleton mirrors `src/renderer/editors/mermaid/MermaidEditor.ts` (the most recent sibling) with the additions for the 6 owned submodels + the relocated body of legacy `GraphViewModel` (~1100 LOC of orchestration methods).

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
import { ForceGraphRenderer, ForceParams } from "./ForceGraphRenderer";
import { GraphVisibilityModel } from "./GraphVisibilityModel";
import { GraphDataModel } from "./GraphDataModel";
import { GraphGroupModel } from "./GraphGroupModel";
import { GraphConnectivityModel } from "./GraphConnectivityModel";
import { GraphSearchModel, SearchInfo, SearchResult } from "./GraphSearchModel";
import { GraphData, GraphLink, GraphNode, GraphOptions, SYS_PREFIX, linkIds, nodeLabel, getNodeLinks, openNodeLink } from "./types";
import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import { buildNodeContextMenu, buildEmptyAreaContextMenu, buildGroupNodeContextMenu, ContextMenuActions } from "./GraphContextMenu";
import type { MenuItem } from "../../uikit";
import { showInputDialog } from "../../ui/dialogs/InputDialog";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { alertsBarModel } from "../../uikit";
import { buildMarkdown } from "./GraphTooltip";
import { pagesModel } from "../../api/pages";

/**
 * EPIC-028 / US-564 — native v4 Force-Graph editor. One class with
 * TextFileModel as its `IContentHost`. Replaces the legacy `GraphViewModel`
 * + `LegacyEditorAdapter` pair. Owns the 5 graph submodels (renderer,
 * visibilityModel, dataModel, groupModel, connectivityModel, searchModel),
 * the 400 ms debounced JSON parse pipeline, and the groupingEnabled toggle
 * (HS1 host-slot — GR4). Body of methods relocated byte-for-byte from
 * legacy GraphViewModel.
 *
 * Design rationale: doc/tasks/US-564-graph-editor-migration/README.md.
 */

export type GraphQueueEvent = { type: "focus" };
export type GraphQueueRequest = never;

/**
 * HS1 host-slot shape — `groupingEnabled` rides `host.editorSettings["graph-view"]`
 * so it survives Graph↔Monaco switches AND app restarts (GR4). Identical
 * mechanism to Markdown's `compactMode` / Mermaid's `lightMode`.
 */
interface GraphViewSettings {
    groupingEnabled?: boolean;
}

export interface TooltipInfo {
    node: GraphNode;
    x: number;
    y: number;
    isRoot?: boolean;
}

export interface GraphEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["graph-view"]. Bounded boolean.
    groupingEnabled: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV7. Recomputed by parse / hover / select.
    error: string;
    loading: boolean;
    searchQuery: string;
    searchInfo: SearchInfo | null;
    searchResults: SearchResult[] | null;
    tooltip: TooltipInfo | null;
    selectedNodes: GraphNode[];
    linkedNodes: GraphNode[];
    statusHint: string;
}

export const defaultGraphEditorState: GraphEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    groupingEnabled: true,
    error: "",
    loading: true,
    searchQuery: "",
    searchInfo: null,
    searchResults: null,
    tooltip: null,
    selectedNodes: [],
    linkedNodes: [],
    statusHint: "",
};

const SIM_FIELDS = new Set(["x", "y", "vx", "vy", "fx", "fy", "index"]);

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class GraphEditor extends V4EditorModel<GraphEditorState, void, GraphQueueEvent> {
    readonly editorId = "graph-view";

    // ── Owned submodels (GR5) ───────────────────────────────────────────
    readonly renderer = new ForceGraphRenderer();
    readonly visibilityModel = new GraphVisibilityModel();
    readonly dataModel = new GraphDataModel();
    readonly groupModel = new GraphGroupModel();
    readonly connectivityModel = new GraphConnectivityModel();
    readonly searchModel: GraphSearchModel;

    // ── View-attached callbacks (GR3 — set by body on mount) ───────────
    /** Set by GraphBody to handle double-click on a node (expand detail panel). */
    onDoubleClickNode: ((nodeId: string) => void) | null = null;
    /** True while a popup menu (context menu or selection menu) is open. */
    isPopupOpen = false;
    /** Set by GraphLegendPanel to handle "Highlight" action from selection menu. */
    onHighlightSelection: (() => void) | null = null;

    // ── Host adoption state ─────────────────────────────────────────────
    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // ── Timers + parse-loop guard ───────────────────────────────────────
    private _parseTimer: ReturnType<typeof setTimeout> | undefined;
    private _tooltipTimer: ReturnType<typeof setTimeout> | undefined;
    private _tooltipHideTimer: ReturnType<typeof setTimeout> | undefined;
    private _tooltipHovered = false;

    /** Full parsed JSON — preserved for serialization (keeps `type` and any
     *  extra user properties). */
    private originalJson: Record<string, unknown> = {};
    /** GR7 — Skip flag to prevent re-parsing our own serialized changes. */
    private skipNextContentUpdate = false;
    /** First load uses updateData (full sim init); subsequent loads use
     *  updateVisibleData (position-preserving). New editor instance per
     *  switch starts with `isFirstLoad = true` — correct (renderer is fresh,
     *  needs full sim init). */
    private isFirstLoad = true;

    readonly typedQueue: ComponentQueue<GraphQueueEvent, GraphQueueRequest>;

    constructor(state: TComponentState<GraphEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            GraphQueueEvent,
            GraphQueueRequest
        >;
        this.searchModel = new GraphSearchModel(this.renderer, this.visibilityModel);

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from GraphEditor");
                this._tearDownHostSubscriptions();
                this._clearTimers();
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

    private _clearTimers(): void {
        clearTimeout(this._parseTimer);
        clearTimeout(this._tooltipTimer);
        clearTimeout(this._tooltipHideTimer);
        this._parseTimer = undefined;
        this._tooltipTimer = undefined;
        this._tooltipHideTimer = undefined;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + facade + sub-panels (MK4 pattern from
     *  US-554; mirrors Svg/Html/Markdown/Mermaid). */
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
        // Identity-only descriptor. groupingEnabled rides host.editorSettings["graph-view"]
        // (HS1). All other view-derived state stripped per PV7 / MO5.
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

    applyRestoreData(data: RestoreData<GraphEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        // groupingEnabled is NOT carried via descriptor — read from host.editorSettings
        // in adoptHost. View-derived state re-derived by initial parse.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `GraphEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("GraphEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore Graph editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `wrapLegacyForPage` when constructing a fresh GraphEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // HS1 — seed `groupingEnabled` from host slot (sync, no flicker). If
        // the slot is absent, retain the default `true`.
        const saved = host.getEditorState<GraphViewSettings>(this.editorId);
        if (saved?.groupingEnabled !== undefined) {
            this.state.update((s) => {
                s.groupingEnabled = saved.groupingEnabled!;
            });
        }

        // HS1 — mirror `groupingEnabled` changes back to host slot. Slice-
        // subscribe keeps the mirror from firing on transient field
        // mutations (the dominant write source) — only the bounded boolean
        // triggers a host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (groupingEnabled) => {
                if (!this._host) return;
                this._host.setEditorState<GraphViewSettings>(this.editorId, {
                    groupingEnabled: groupingEnabled as boolean,
                });
            },
            (s) => s.groupingEnabled,
        );

        // PV5-style — content changes retrigger parse. The skipNextContentUpdate
        // guard (GR7) prevents the loop from our own serializeToHost writes.
        this._hostContentUnsub = host.state.subscribe(
            () => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.parseDebounced();
            },
            (s) => s.content,
        );

        // Wire renderer callbacks (relocated verbatim from legacy onInit).
        this.renderer.onBadgeExpand = (nodeId, deep) => this.handleBadgeExpand(nodeId, deep);
        this.renderer.onHoverChanged = (nodeId, cx, cy) => this.handleHoverChanged(nodeId, cx, cy);
        this.renderer.onContextMenuAction = (nodeId, cx, cy) => this.handleContextMenu(nodeId, cx, cy);
        this.renderer.onAltClick = (nodeId) => this.handleAltClick(nodeId);
        this.renderer.onSelectionChanged = (selectedIds) => this.handleSelectionChanged(selectedIds);
        this.renderer.onDoubleClick = (nodeId) => this.onDoubleClickNode?.(nodeId);

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);

        // Initial parse against the freshly-adopted host (mirrors today's
        // GraphViewModel.onInit's final parseContent call). GR6.
        this.parseContent();
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this._clearTimers();
        this._tearDownHostSubscriptions();
        this.renderer.dispose();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }

    // =========================================================================
    // BELOW: ~1100 LOC relocated verbatim from legacy GraphViewModel.
    // Substitution rules applied during relocation:
    //   - `this.host` → `this._host!`        (host is non-null inside these
    //                                          methods because they fire from
    //                                          view callbacks AFTER adoptHost)
    //   - `super(host, defaultGraphViewState)` removed (constructor handles)
    //   - `addSubscription(...)` for timer cleanup removed (dispose handles)
    //   - state.update / state.get / state.subscribe calls UNCHANGED
    //   - submodel calls (this.renderer.X, this.dataModel.X, etc.) UNCHANGED
    //   - pagesModel.addEditorPage(...) calls UNCHANGED
    //
    // Sections preserved verbatim (one entry per legacy section header):
    //   - Theme support (refreshColors)
    //   - Force tuning (updateForceParams, resetForceParams)
    //   - Root node (rootNodeId getter, setRootNode, clearRootIfDeleted)
    //   - Expansion options (getExpansionOptions, updateExpansionOptions, getAllNodes)
    //   - Highlighting (setHighlightSet, setExternalHover, setLegendHighlight)
    //   - Legend (getLegendDescriptions, setLegendDescription, getNodeIdsByLegendFilter, getPresentLevelsAndShapes)
    //   - Search (setSearchQuery, revealHiddenMatches, revealAndSelectNode, selectSearchResults, recomputeSearch)
    //   - Tooltip (handleHoverChanged, clearTooltip, clearTooltipDelayed, setTooltipHovered, updateStatusHint)
    //   - Visibility (hasVisibilityFilter, resetView, resetVisibility, expandNode, handleBadgeExpand, expandNodeDeep, collapseNode, expandAll, totalNodeCount, recordsCount, isEmpty, hasGroups, groupingEnabled getter, toggleGrouping)
    //   - Context menu (contextMenuActions, handleContextMenu)
    //   - Alt+Click link toggle (handleAltClick)
    //   - Selection (handleSelectionChanged, refreshSelectedNodes)
    //   - Group operations (groupSelectedNodes, editGroupTitle, ungroupNode, deleteGroupNode, collectAllSubGroups, cleanupEmptyGroups, removeFromGroup)
    //   - Editing (updateNodeProps, renameNode, addNode, deleteNode, deleteSelectedNodes, buildSelectedMarkdown, copySelectedMarkdown, openSelectedMarkdown, openSelectedGrid, selectChildren, selectMembers, selectMembersDeep, highlightSelection, extractSelected, addLink, deleteLink, addChild, applyPropertiesUpdate, applyLinkedNodesUpdate, batchUpdateNodeProps, batchApplyPropertiesUpdate)
    //   - Rebuild pipeline (rebuildAndRender)
    //   - Serialization (serializeToHost)
    //   - Parsing (parseDebounced, parseContent)
    //
    // The `groupingEnabled` getter on the legacy VM read from state.get().groupingEnabled.
    // On GraphEditor it returns the same — no change needed (the HS1 mirror runs
    // automatically via the slice-subscribe wired in adoptHost).
    // =========================================================================

    // [paste of methods — see "Step 1a" below for the verbatim copy procedure]
}
```

### Step 1a — Relocation procedure for the ~1100 LOC of methods

The body of the legacy `GraphViewModel` (lines 122–1572) is copied wholesale into the `GraphEditor` class body. Two mechanical substitutions:

1. **`this.host.state.get()` → `this._host!.state.get()`** — find/replace within the relocated section. `this._host` is non-null inside these methods (they fire from view callbacks AFTER `adoptHost` ran).
2. **Remove the three `addSubscription(() => clearTimeout(...))` calls inside `onInit`** — superseded by `_clearTimers()` in `dispose` / `extractContentHost`. The renderer-callback wiring also relocates to `adoptHost` (per Step 1 above), not `onInit`.

No other edits. Method signatures, control flow, state mutations, submodel calls, and `pagesModel.addEditorPage` calls remain identical.

Verify after copy:
- `Grep "this\.host" src/renderer/editors/graph/GraphEditor.ts` returns zero hits (all replaced with `_host!`).
- `Grep "addSubscription" src/renderer/editors/graph/GraphEditor.ts` returns zero hits.
- `Grep "onInit\|onContentChanged\|onDispose" src/renderer/editors/graph/GraphEditor.ts` returns zero hits (lifecycle hooks no longer exist on v4 base class).
- `Grep "groupingEnabled" src/renderer/editors/graph/GraphEditor.ts` returns hits in: state slice declaration, `defaultGraphEditorState`, HS1 mirror in `adoptHost`, getter, `toggleGrouping` action.

### Step 2 — Create `src/renderer/editors/graph/GraphBody.tsx`

New file. Replaces today's `GraphView.tsx` body (for v4-native pages — the legacy file stays alive for notebook embedding per GR1). Estimated ~620 LOC.

The body relocates the entire JSX render block from legacy `GraphView` MINUS the two portal blocks (toolbar portal lines ~663–700; footer portal lines ~701–708 in legacy `GraphView.tsx`). Those move to `index.tsx`'s `<TextChrome>` contributions (Step 3).

Substitutions for the relocated body:
- `const vm = useContentViewModel<GraphViewModel>(model, "graph-view")` → `const editor = model as GraphEditor` (prop is the editor, not the host).
- `useSyncExternalStore(vm? cb : ...)` → `editor.state.use((s) => s)` — reactive read of full state (or selector slices for narrower subscriptions).
- All `vm.X` reads/calls → `editor.X` (one-symbol rename — every method/field exists on `GraphEditor` with the same signature).
- The `containerRef: useRef<HTMLDivElement>(null)` stays — view-local for `GraphDetailPanel`'s click-outside detection. No model surface.
- The `canvasElRef` ref + `canvasRef` callback stay — they're view-local. Pass the canvas element via `editor.renderer.setCanvas(el)` in the callback. The toolbar bits (in `index.tsx`) read the canvas via a callback-ref forwarded from the body (mirror of `MermaidBody.imageRefSetter`).
- The `if (!vm) return null` early-return is removed (the editor is always provided as a prop).

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton, Input, Spinner, Text, Panel } from "../../uikit";
import { highlight } from "../../uikit/shared/highlight";
import { EditorError } from "../base/EditorError";
import type { GraphEditor } from "./GraphEditor";
import type { SearchResult } from "./GraphSearchModel";
import { GraphTooltip } from "./GraphTooltip";
import { buildSelectionMenu, SelectionMenuActions, SelectionMenuInfo } from "./GraphContextMenu";
import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import { GraphDetailPanel } from "./GraphDetailPanel";
import { GraphTuningSliders } from "./GraphTuningSliders";
import { GraphExpansionSettings } from "./GraphExpansionSettings";
import { GraphLegendPanel } from "./GraphLegendPanel";
import { CloseIcon, SettingsIcon, RefreshIcon, ExpandAllIcon, GraphGroupIcon } from "../../theme/icons";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import color from "../../theme/color";

/**
 * EPIC-028 / US-564 — Graph editor body. Reads state.use(...) reactively
 * from `editor.state`. Renders canvas + in-canvas overlay toolbar +
 * GraphTooltip + GraphDetailPanel + GraphLegendPanel. The canvas element
 * is forwarded to the view shell's open-draw / copy-image toolbar buttons
 * via the `canvasRefSetter` callback prop (GR2 — view-local bridge,
 * mirrors SV2 from Svg / MR2 from Mermaid).
 */

type ToolbarPanel = "closed" | "settings" | "expansion" | "results";
const MAX_DISPLAYED_RESULTS = 100;

// [inline styles relocated from legacy GraphView.tsx — rootStyle, loadingStyle, canvasStyle, emptyHintStyle, toolbarRowStyle, searchInfoStyle, selectionInfoStyle, tabsRowStyle, tabStyleBase, tabActiveStyle, searchResultsListStyle, searchResultRowBase, searchResultTitleStyle, searchResultPropStyle, searchResultPropKeyStyle, searchStatusBarStyle, searchNoResultsStyle — all unchanged]

// [GraphSearchResults sub-component relocated from legacy GraphView.tsx — unchanged]

interface GraphBodyProps {
    model: GraphEditor;
    /** Callback receiving the canvas element. The view shell holds the ref
     *  and shares it with `<GraphToolbarBits>` (open-draw + copy-image buttons). */
    canvasRefSetter?: (canvas: HTMLCanvasElement | null) => void;
}

export function GraphBody({ model: editor, canvasRefSetter }: GraphBodyProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [toolbarPanel, setToolbarPanel] = useState<ToolbarPanel>("closed");
    const [toolbarHovered, setToolbarHovered] = useState(false);
    const [toolbarFocusWithin, setToolbarFocusWithin] = useState(false);
    const [expandRequest, setExpandRequest] = useState(0);
    const [collapseRequest, setCollapseRequest] = useState(0);
    const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
    const panelDirtyRef = useRef(false);
    const panelExpandedRef = useRef(false);
    const popupClosedAtRef = useRef(0);

    // PV8 — focus queue drain. <TextChrome>'s root-focus puts focus on the
    // outer panel; the canvas grabs focus naturally on click.
    editor.typedQueue.use(() => {
        // no-op
    });

    // GR3 — wire onDoubleClickNode for GraphDetailPanel expand integration.
    useEffect(() => {
        editor.onDoubleClickNode = () => setExpandRequest((n) => n + 1);
        return () => { editor.onDoubleClickNode = null; };
    }, [editor]);

    // Reactive read of all view-derived state (single subscription).
    const pageState = editor.state.use((s) => s);

    useEffect(() => {
        editor.refreshColors();
    });

    const { searchQuery, searchInfo, searchResults, tooltip, selectedNodes, linkedNodes, statusHint, groupingEnabled, error, loading } = pageState;

    // [all useCallback handlers relocated from legacy GraphView.tsx — onSearchChange, onSelectResult, onSearchKeyDown, onSearchClear, onSearchFocus, onRevealHidden, handleExpandAll, onPanelDirtyChange, onPanelExpandedChange, onMouseDownCapture, onSelectionClick, toggleSettings — all with vm→editor rename]

    // [shift+highlight + ctrl+f / ctrl+a useEffects relocated unchanged]

    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
        canvasElRef.current = el;
        editor.renderer.setCanvas(el);
        canvasRefSetter?.(el);  // GR2 — forward to view shell for toolbar
    }, [editor, canvasRefSetter]);

    const isExpanded = toolbarPanel !== "closed";
    const hasSearch = !!searchQuery;
    const resultCount = searchResults?.length ?? 0;
    const toolbarStyle: React.CSSProperties = {
        // [unchanged from legacy GraphView.tsx]
    };

    return (
        <div ref={containerRef} style={rootStyle} onMouseDownCapture={onMouseDownCapture}>
            {error && <EditorError>{error}</EditorError>}
            {loading ? (
                <div style={loadingStyle}>
                    <Spinner />
                </div>
            ) : (
                <>
                    <canvas
                        style={canvasStyle}
                        ref={canvasRef}
                        // [all onClick / onDoubleClick / onContextMenu / onMouseMove handlers unchanged]
                    />
                    {editor.isEmpty && (
                        <div style={emptyHintStyle}>
                            Right-click → Add Node to start building the graph
                        </div>
                    )}
                    <div
                        style={toolbarStyle}
                        // [hover/focus handlers unchanged]
                    >
                        {/* [in-canvas overlay toolbar relocated unchanged — Settings, Grouping, Reset, Expand-all, Search input + endSlot, search info, selection info, tabs panel (Physics, Expansion, Results), GraphTuningSliders, GraphExpansionSettings, GraphSearchResults] */}
                    </div>
                    {tooltip && (
                        <GraphTooltip
                            node={tooltip.node} x={tooltip.x} y={tooltip.y} isRoot={tooltip.isRoot}
                            onMouseEnter={() => editor.setTooltipHovered(true)}
                            onMouseLeave={() => editor.setTooltipHovered(false)}
                        />
                    )}
                    <GraphDetailPanel
                        nodes={selectedNodes.filter((n) => !n.isGroup)}
                        linkedNodes={linkedNodes}
                        onUpdateProps={(nodeId, props) => editor.updateNodeProps(nodeId, props)}
                        // [all other props relocated with vm→editor rename]
                        containerRef={containerRef}
                        expandRequest={expandRequest}
                        collapseRequest={collapseRequest}
                    />
                    <GraphLegendPanel editor={editor} />
                </>
            )}
        </div>
    );
}
```

### Step 3 — Create `src/renderer/editors/graph/index.tsx`

New file. Replaces today's `index.ts`. Exports `EditorModule` (`graphModule`), the `GraphEditorView` shell with `<TextChrome>` contributions (top-right toolbar buttons + footer status), and re-exports the class. Estimated ~110 LOC.

```typescript
import { useRef } from "react";
import { TComponentState } from "../../core/state/state";
import { GraphEditor, defaultGraphEditorState } from "./GraphEditor";
import { GraphBody } from "./GraphBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { CopyIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage } from "../draw/drawExport";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";
import color from "../../theme/color";

/**
 * EPIC-028 / US-564 — native Graph editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native GraphEditor instance.
 *
 * Right-toolbar bits (relocates legacy GraphView's portal toolbar buttons):
 *   - open-in-draw — converts canvas to dataURL → opens in Draw editor
 *   - copy-image — canvas.toBlob → clipboard
 *
 * Footer bits (relocates legacy GraphView's portal footer):
 *   - statusHint (italic, warning color) when hovering an alt+click target
 *   - recordsCount ("N nodes" or "N of M nodes")
 */

interface GraphToolbarBitsProps {
    model: GraphEditor;
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

function GraphToolbarBits({ model: editor, canvasRef }: GraphToolbarBitsProps) {
    const onOpenDraw = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/png");
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/png", canvas.width, canvas.height);
        const host = editor.host;
        const title = (host?.state.get().title ?? "Graph").replace(/\.fg\.json$/i, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
    };

    const onCopyImage = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (blob) {
                navigator.clipboard.write([
                    new ClipboardItem({ "image/png": blob }),
                ]);
            }
        }, "image/png");
    };

    return (
        <>
            <IconButton
                name="graph-open-in-draw"
                size="sm"
                icon={<DrawIcon />}
                title="Open in Drawing Editor"
                onClick={onOpenDraw}
            />
            <IconButton
                name="graph-copy-image"
                size="sm"
                icon={<CopyIcon />}
                title="Copy Image to Clipboard"
                onClick={onCopyImage}
            />
        </>
    );
}

function GraphFooterBits({ model: editor }: { model: GraphEditor }) {
    const { statusHint } = editor.state.use((s) => ({ statusHint: s.statusHint }));
    return (
        <>
            {statusHint && (
                <span style={{ fontStyle: "italic", color: color.warning.text, marginRight: 12 }}>
                    {statusHint}
                </span>
            )}
            <span>{editor.recordsCount}</span>
        </>
    );
}

function GraphEditorView({ model }: { model: V4EditorModel }) {
    const graph = model as GraphEditor;
    // GR2 — view-local canvasRef bridges the canvas element to the toolbar's
    // open-draw / copy-image buttons (mirrors SV2 from Svg / MR2 from Mermaid).
    // Held by the view (NOT the editor) because it's a purely view-side
    // imperative concern.
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<GraphToolbarBits model={graph} canvasRef={canvasRef} />}
            footerContributions={<GraphFooterBits model={graph} />}
        >
            <GraphBody
                model={graph}
                canvasRefSetter={(c) => { canvasRef.current = c; }}
            />
        </TextChrome>
    );
}

export const graphModule: EditorModule = {
    createEditor: () =>
        new GraphEditor(new TComponentState({ ...defaultGraphEditorState })),
    Component: GraphEditorView,
};

export { GraphEditor, defaultGraphEditorState };
export type { GraphEditorState, GraphQueueEvent, TooltipInfo } from "./GraphEditor";
```

### Step 4 — DO NOT delete `GraphView.tsx` / `GraphViewModel.ts` / submodels

Per GR1 — the legacy files stay alive for notebook embedding. Today's `index.ts` (re-exports `GraphView` / `GraphViewProps`) is replaced by `index.tsx` (new surface above). The `index.ts` file is DELETED only because `index.tsx` supersedes it.

This means:
- `GraphView.tsx` continues to exist, continues to import `GraphViewModel`, continues to use `useContentViewModel`, continues to render canvas + toolbar + tooltip + panels + portals. Page-level open-file flow won't reach it (the v4 path wraps via `wrapLegacyForPage`), but notebook per-note dispatch will via `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor`.
- `GraphViewModel.ts` continues to exist for `NoteItemEditModel.acquireViewModel("graph-view")` calls.
- All five submodels (`ForceGraphRenderer`, `GraphDataModel`, `GraphVisibilityModel`, `GraphGroupModel`, `GraphConnectivityModel`, `GraphSearchModel`) + supporting modules (`types.ts`, `constants.ts`, `shapeGeometry.ts`, `GraphIcons.tsx`, `GraphTooltip.tsx`, `GraphContextMenu.ts`) continue to exist — consumed by both the new `GraphEditor` AND the preserved `GraphViewModel`.
- `GraphTuningSliders.tsx`, `GraphExpansionSettings.tsx`, `GraphLegendPanel.tsx` — see GR9 below for the prop-rename approach.
- `GraphDetailPanel.tsx` — unchanged (already prop-isolated).

### Step 5 — Update `src/renderer/api/pages/PagesLifecycleModel.ts`

Two changes (mirrors US-562):

**Change 1** — add Graph branch in `wrapLegacyForPage` after the Mermaid branch (~line 168):

```typescript
// EPIC-028 / US-564 — Graph migrated to native v4 module. Construct
// GraphEditor over the legacy TextFileModel host. The initial parseContent()
// call kicks off inside adoptHost (mirrors today's GraphViewModel.onInit →
// parseContent behavior).
if (isTextFile && targetEditorId === "graph-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const graph = new GraphEditor(
        new TComponentState({ ...defaultGraphEditorState, id }),
    );
    graph.adoptHost(legacy as TextFileModel);
    return graph;
}
```

**Change 2** — add import after the Mermaid import on line 19:

```typescript
import { GraphEditor, defaultGraphEditorState } from "../../editors/graph";
```

### Step 6 — Update `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts`

Flip from wrapping `GraphViewModel` to wrapping `GraphEditor`. All getters/methods keep their bodies — only the constructor parameter type and the four `this.vm.X` reads (across all methods) change to `this.editor.X` (one-symbol rename).

```typescript
import type { GraphEditor } from "../../editors/graph";
import type { GraphNode } from "../../editors/graph/types";
import { linkIds } from "../../editors/graph/types";
import { matchNodeSearch } from "../../editors/graph/GraphSearchModel";

/**
 * Safe facade around GraphEditor for script access.
 * Implements the IGraphEditor interface from api/types/graph-editor.d.ts.
 *
 * Primarily designed for AI agent usage via MCP (execute_script).
 * Focuses on read/query operations — editing is done via page.content JSON.
 */
export class GraphEditorFacade {
    constructor(private readonly editor: GraphEditor) {}

    // ── Data Access ──────────────────────────────────────────────────

    get nodes(): GraphNode[] {
        return (this.editor.dataModel.sourceData?.nodes ?? []).map(n => this.editor.dataModel.cleanNode(n));
    }

    get links(): Array<{ source: string; target: string }> {
        return (this.editor.dataModel.sourceData?.links ?? []).map(l => {
            const { source, target } = linkIds(l);
            return { source, target };
        });
    }

    get nodeCount(): number {
        return this.editor.dataModel.sourceData?.nodes.length ?? 0;
    }

    get linkCount(): number {
        return this.editor.dataModel.sourceData?.links.length ?? 0;
    }

    // [all remaining methods unchanged except for vm → editor rename throughout]
    // ...
}
```

### Step 7 — Update `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Flip `asGraph(force?: boolean)` to consume `GraphEditor` directly (lines 18, 280–289).

```typescript
// at the top (~line 18):
// remove: import type { GraphViewModel } from "../../editors/graph/GraphViewModel";
import { GraphEditor } from "../../editors/graph";

// at line ~280:
async asGraph(force = false): Promise<GraphEditorFacade> {
    await this.ensureEditor("graph-view", "Graph", "asGraph", force);
    // EPIC-028 / US-564 — Graph is v4-native. After ensureEditor, the
    // page's mainEditorV4 IS a GraphEditor; the facade wraps it directly.
    // No acquireViewModel round-trip.
    const v4 = this.v4;
    if (!(v4 instanceof GraphEditor)) {
        throw new Error("asGraph(): page is not a GraphEditor after switch");
    }
    return new GraphEditorFacade(v4);
}
```

Removes `model.acquireViewModel("graph-view")` + `releaseList.push(() => model.releaseViewModel("graph-view"))` — mirrors the `asSvg` / `asHtml` / `asMarkdown` / `asMermaid` pattern.

### Step 8 — Update `src/renderer/editors/register-editors.ts`

Three changes (mirrors US-562):

**Change 1** — keep the legacy `graph-view` `loadModule` AS-IS (eager imports of `GraphView` + `GraphViewModel`). Add a comment to document why (parallel to the Mermaid comment block at lines ~365–370):

```typescript
// Force graph viewer (content-view for .fg.json files)
editorRegistry.register({
    id: "graph-view",
    name: "Graph",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.fg\.json$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        if (languageId !== "json") return -1;
        if (fileName && matchesPattern(fileName, /\.fg\.json$/i)) return 10;
        return -1;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "json") return false;
        if (!content.includes('"type"')) return false;
        return /"type"\s*:\s*"force-graph"/.test(content) && content.includes('"nodes"');
    },
    loadModule: async () => {
        // EPIC-028 / US-564 — Graph migrated to native v4 module
        // (`graphModule` in `./graph/index.tsx`). Legacy GraphView +
        // GraphViewModel are PRESERVED here because notebook per-note
        // dispatch (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`)
        // still consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createGraphViewModel }] = await Promise.all([
            import("./graph/GraphView"),
            import("./graph/GraphViewModel"),
        ]);
        return {
            Editor: module.GraphView,
            createViewModel: createGraphViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

**Change 2** — drop `"graph-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 749):

```typescript
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    // svg-view removed — US-560 ships native v4 module.
    // html-view removed — US-561 ships native v4 module.
    // mermaid-view removed — US-562 ships native v4 module.
    // graph-view removed — US-564 ships native v4 module.
    "notebook-view",
    "todo-view",
    "link-view",
    "rest-client",
    "draw-view",
]);
```

**Change 3** — append the native v4 registration override after the US-562 block (~line 1020):

```typescript
// US-564 — replace the legacy bare-adapter mirror for graph-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` to avoid
// duplicating extension/language rules.
v4EditorRegistry.register({
    id: "graph-view",
    name: "Graph",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("graph-view");
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
        const { graphModule } = await import("./graph");
        return graphModule;
    },
});
```

### Step 9 — Update sub-panel prop names (`vm` → `editor`)

Three files take `vm: GraphViewModel` as prop today. Rename to `editor: GraphEditor`:

**`src/renderer/editors/graph/GraphTuningSliders.tsx`**:
```typescript
// before
import { GraphViewModel } from "./GraphViewModel";
interface GraphTuningSlidersProps { vm: GraphViewModel; }
export function GraphTuningSliders({ vm }: GraphTuningSlidersProps) { ... }

// after
import type { GraphEditor } from "./GraphEditor";
interface GraphTuningSlidersProps { editor: GraphEditor; }
export function GraphTuningSliders({ editor }: GraphTuningSlidersProps) { ... }
```

Within the body, find/replace `vm.` → `editor.` (all method names are identical between the legacy VM and the new editor — `updateForceParams`, `resetForceParams`, etc.).

**`src/renderer/editors/graph/GraphExpansionSettings.tsx`** — same pattern.

**`src/renderer/editors/graph/GraphLegendPanel.tsx`** — same pattern. Note: this file sets `vm.onHighlightSelection = ...` in a useEffect — becomes `editor.onHighlightSelection = ...`.

**Call-site updates**:
- The new `GraphBody.tsx` (Step 2) passes `editor={editor}` to these three sub-panels.
- The legacy `GraphView.tsx` (preserved per GR1) keeps passing `vm={vm}` to these three sub-panels. **PROBLEM:** the prop name changed.

**Resolution:** the sub-panels are imported by BOTH the new `GraphBody.tsx` AND the preserved legacy `GraphView.tsx`. After renaming the prop, the legacy `GraphView.tsx` must also be updated to pass `editor={vm}` instead of `vm={vm}`. The legacy `GraphView` still passes the `GraphViewModel` instance (which exposes the same surface as `GraphEditor` for these reads/calls), but the prop name has to match the new contract.

This is a small caveat: the sub-panels become **interface-typed** rather than VM-typed. To support both call sites cleanly without circular dependency, the prop type is the structural intersection of methods the sub-panel actually calls — i.e., a narrow interface declared next to the sub-panel itself:

```typescript
// in GraphTuningSliders.tsx
interface GraphTuningHost {
    renderer: { forceParams: ForceParams };  // or whatever shape is needed
    updateForceParams(params: Partial<ForceParams>): void;
    resetForceParams(): void;
}

interface GraphTuningSlidersProps {
    editor: GraphTuningHost;
}
```

Then both `GraphEditor` (new) AND `GraphViewModel` (legacy) satisfy `GraphTuningHost` structurally — no breaking change for the legacy view path.

Same pattern for `GraphExpansionSettings` and `GraphLegendPanel`. The interfaces stay minimal — only the methods/getters actually called from the sub-panel.

### Step 10 — Delete `src/renderer/editors/graph/index.ts`

After step 3 there is `index.tsx` with the new surface. Today's `index.ts` only re-exports `GraphView` + `GraphViewProps`; those names are still importable directly from `./GraphView.tsx` for the notebook embedding path (the legacy `loadModule` uses `import("./graph/GraphView")` directly — verified in step 8 change 1). Delete it cleanly.

Before deleting, confirm with grep that nothing outside the graph folder imports from `./graph/index`:

```powershell
Grep "from.*editors/graph['\"]" src\
Grep "from.*editors/graph/index['\"]" src\
```

These should return no hits outside the graph folder itself (and the new ones added by this task in `GraphEditor.ts`, `GraphBody.tsx`, `index.tsx` are all relative imports `./GraphEditor`, `./GraphBody`, etc., not `./index`).

### Step 11 — Files that need NO changes

To save investigation time during implementation, these are confirmed unaffected:

- `src/renderer/editors/graph/GraphView.tsx` — preserved verbatim for notebook embedding (GR1). After Step 9's sub-panel prop rename, this file's calls to the sub-panels change from `<GraphTuningSliders vm={vm} />` to `<GraphTuningSliders editor={vm} />` (same instance, new prop name). That's the **only** edit to this file.
- `src/renderer/editors/graph/GraphViewModel.ts` — preserved verbatim for notebook embedding (GR1).
- `src/renderer/editors/graph/ForceGraphRenderer.ts` — pure submodel. No change.
- `src/renderer/editors/graph/GraphDataModel.ts` — pure submodel. No change.
- `src/renderer/editors/graph/GraphVisibilityModel.ts` — pure submodel. No change.
- `src/renderer/editors/graph/GraphGroupModel.ts` — pure submodel. No change.
- `src/renderer/editors/graph/GraphConnectivityModel.ts` — pure submodel. No change.
- `src/renderer/editors/graph/GraphSearchModel.ts` — pure submodel. No change.
- `src/renderer/editors/graph/GraphHighlightModel.ts` — pure submodel. No change.
- `src/renderer/editors/graph/GraphContextMenu.ts` — pure module. No change.
- `src/renderer/editors/graph/GraphTooltip.tsx` — flat props, no model dep. No change.
- `src/renderer/editors/graph/GraphDetailPanel.tsx` — flat props, no model dep. No change.
- `src/renderer/editors/graph/GraphIcons.tsx` / `constants.ts` / `shapeGeometry.ts` / `types.ts` — pure modules. No change.
- `src/renderer/api/types/graph-editor.d.ts` — `IGraphEditor` interface (sync readonly getters + methods). Facade shape preserved. No change.
- `src/renderer/api/types/common.d.ts` — `EditorView` union still contains `"graph-view"`. No change.
- `src/shared/types.ts` — same union, no change.
- `src/renderer/ui/sidebar/tools-editors-registry.ts:101` — `pagesModel.addEditorPage("graph-view", ...)` from the sidebar "Force Graph" button. Editor id unchanged; flows through new `wrapLegacyForPage` Graph branch.
- `src/main/mcp-http-server.ts:610` — MCP tool description string literal. Editor id unchanged.
- `src/renderer/api/pages/PagesPersistenceModel.ts` — shape-based discriminator `d.host !== undefined` (US-561 fix) auto-includes Graph descriptors. No edit needed.
- `src/renderer/api/pages/PageModel.ts` — already supports v4-native main editors.
- `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` — dispatches via `editorRegistry.getById(editor).loadModule()` for non-monaco editors. The legacy `graph-view` `loadModule` stays populated → no change needed.
- `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` — `acquireViewModel("graph-view")` reaches the legacy `createGraphViewModel` via the preserved `loadModule`. No change.
- `src/renderer/editors/base/v4/LegacyEditorAdapter.ts` — comment listing example content-view ids. Cosmetic only; leave alone.

## Concerns / open questions

### GR1 — Notebook per-note Graph dispatch (the US-554 / US-560 / US-561 / US-562 lesson, applied upfront)

**Context:** US-554 originally collapsed `md-view`'s legacy `loadModule` to `return textEditorModule`, mirroring the US-552 / US-553 pattern. This crashed the app on session restore when any notebook contained a markdown-typed note, because `NoteItemActiveEditor.tsx` mounts `<EditorModule.Editor model={model} />` from the legacy registry's `loadModule()` result, and the lazy `require()` in `textEditorModule.get Editor()` failed at runtime (Vite/Electron CJS resolver doesn't know about `.tsx`). The fix preserved `MarkdownView.tsx` + `MarkdownViewModel.ts` and reverted the legacy `loadModule` to keep eager `Promise.all([import(view), import(view-model)])`. US-560 / US-561 / US-562 applied the same lesson up front.

**Same scenario applies to Graph.** A user can have a Graph-typed note inside a notebook (`note.content.editor = "graph-view"`). If we collapse the legacy `loadModule`, the notebook page renderer crashes on first display.

**Resolution:** apply the US-554+ retrospective up front. Keep `GraphView.tsx` + `GraphViewModel.ts` alive as parallel implementation; keep all five submodel files alive (they're imported transitively by `GraphViewModel.ts`); keep the legacy `loadModule` returning the eager Promise.all imports; register the v4 native module separately. Page-level pages take the v4 path; notebook-embedded notes take the legacy path. Both coexist until US-557 migrates Notebook (which will retire the per-note content-view dispatch).

No design decision needed — pattern locked in by US-554's fix and US-560 / US-561 / US-562's preemptive applications. Step 8 Change 1 documents this in a code comment so future maintainers don't try to collapse the loader.

**Verification during implementation:** after applying the change, manually create a notebook with a Graph note (note content: a valid `.fg.json` force-graph JSON), save and reload the app — the notebook page should display the rendered graph without errors.

### GR2 — Canvas ref bridge (mirror of SV2 from Svg / MR2 from Mermaid)

**Context:** today's `GraphView.tsx` holds `canvasElRef = useRef<HTMLCanvasElement | null>(null)`; the canvas's `ref` callback assigns both `canvasElRef.current = el` AND `vm?.renderer.setCanvas(el)`. The portal toolbar's open-draw + copy-image buttons read `canvasElRef.current.toDataURL(...)` / `canvasElRef.current.toBlob(...)`.

US-560 / SV2 (Svg) and US-562 / MR2 (Mermaid) chose **view-local imperative ref bridge** over either (i) editor-owned ref or (ii) queue.execute round-trip. The same reasoning carries: canvas's imperative `toDataURL` / `toBlob` are pure DOM concerns; no model/facade consumer; no script API exposure.

**Resolution:** mirror SV2 / MR2 directly. `index.tsx` holds `useRef<HTMLCanvasElement | null>(null)`; passes a callback prop to `GraphBody` (`canvasRefSetter`); passes the same ref to `<GraphToolbarBits>`. Identical shape to Svg / Mermaid (just a different ref type — `HTMLCanvasElement` instead of `BaseImageViewRef`).

### GR3 — View-attached callbacks on the editor instance

**Context:** today's `GraphViewModel` has three fields set by the view layer at mount time:

- `onDoubleClickNode: ((nodeId: string) => void) | null` — set by `GraphView.tsx` line 252 in a useEffect; called from `vm.onInit` line 102 via `this.renderer.onDoubleClick = (nodeId) => this.onDoubleClickNode?.(nodeId)`.
- `isPopupOpen: boolean` — set/cleared by `GraphView.tsx` lines 357, 438, 440; read by `vm.handleHoverChanged` (line 316) and `vm.handleContextMenu` (line 606–609).
- `onHighlightSelection: (() => void) | null` — set by `GraphLegendPanel.tsx`; called from `vm.highlightSelection` (line 1273).

These are **plumbing across the view layer that needs to be reachable from editor methods**. They're not part of the editor's logical state — they're not persisted, not part of the public API, and have no value outside the live view-render cycle.

Three candidates for migration:

(a) **Keep them as instance fields on `GraphEditor`** (mirrors today). Body sets/clears in useEffect; sub-panels set in useEffect.

(b) **Move them to the body's local React state + thread them through props** to the editor's methods. Editor methods would need to accept callbacks/flags as parameters.

(c) **Promote them to queue events** (`{type: "openDetailPanel"}`, `{type: "popupOpen"}`, `{type: "highlightSelection"}`). The body subscribes via `typedQueue.use` and updates local state.

**Resolution (a)** — instance fields on the editor. Reasons:
1. **Minimal change.** Sub-panel files (`GraphLegendPanel`, etc.) already write to these fields via `vm.onX = ...` — no migration required beyond `vm → editor` rename.
2. **Editor method bodies are unchanged.** `this.onDoubleClickNode?.(nodeId)` and `this.isPopupOpen = true` continue to work as-is.
3. **No queue-trip cost.** `isPopupOpen` is read synchronously inside `handleHoverChanged` (mouse-move-rate); a queue-trip would introduce a frame's delay and break tooltip suppression timing.
4. **Sibling precedent (none yet).** No earlier preview-group migration had this surface — Graph is the first Tier-5 editor with cross-component view plumbing this dense. Option (a) sets the simple precedent for US-555 (Link) and US-557 (Notebook), which also have view-attached callbacks.

Rejected (b) — would require restructuring every method body that uses these fields (extractSelected, handleContextMenu, etc.). Rejected (c) — queue indirection introduces async delays the tooltip suppression code can't tolerate.

**Edge case — `isPopupOpen` left `true` if showAppPopupMenu throws.** Today's code does `await showAppPopupMenu(...); setTimeout(() => { this.isPopupOpen = false; }, 0)` — same shape preserved on the editor. The `setTimeout(..., 0)` is a deliberate one-tick delay to swallow the click-through event that closes the popup. No change.

### GR4 — `groupingEnabled` HS1 host-slot persistence (NEW UX upgrade)

**Context:** today's `defaultGraphViewState.groupingEnabled = true`. Every reopen resets to true. The user's toggle is lost across:
- Graph ↔ Monaco editor switches (host survives but old VM is destroyed, fresh VM starts at default).
- App restarts (state isn't persisted).

**Without HS1:** the GraphEditor is destroyed on switch-out; on switch-back a fresh GraphEditor is constructed with `groupingEnabled = true` (default). The user's toggle is lost.

**With HS1 (this task):** `adoptHost` writes `host.setEditorState("graph-view", { groupingEnabled: false })` on every toggle (via the `_settingsUnsub` mirror). On switch-back, the new GraphEditor's `adoptHost` reads `host.getEditorState("graph-view")` and applies `groupingEnabled: false` from the slot. User toggle preserved.

**Resolution:** HS1 mirror set up in `adoptHost` per step 1. No design ambiguity — this is the canonical HS1 pattern, already proven for Markdown's `compactMode` (US-554) and Mermaid's `lightMode` (US-562).

**Trade-off considered:** does the user actually want this preference to persist? Two perspectives:
- **For**: it's a deliberate user choice; not persisting it forces the user to re-toggle every time. Analogous to other persistent view prefs.
- **Against**: `groupingEnabled = false` is rarely the desired default for a graph with groups (groups carry organizational intent); auto-persisting could leave the user confused on reopen.

The HS1 approach is **opt-in by toggle** — the value only persists once the user explicitly toggles it off. First-open behavior is unchanged (default `true`). On balance, persistence is the right call; a confused user can re-toggle to enable.

**Edge case — switch to Monaco and back twice in rapid succession:** the slot write is sync (`setEditorState` updates host.state in-place); the slot read is sync (`getEditorState` reads from host.state); no race.

**Edge case — pre-US-564 sessions reopening:** sessions saved before US-564 do NOT have the slot. The fallback to default `true` matches today's behavior. No regression.

### GR5 — Heavy submodel ownership (relocation only)

**Context:** today's `GraphViewModel` owns six submodels:
- `renderer: ForceGraphRenderer` — owns the D3 force simulation + canvas2d rendering.
- `dataModel: GraphDataModel` — owns the parsed JSON + node/link mutation methods + legend descriptions.
- `visibilityModel: GraphVisibilityModel` — owns the expand/collapse BFS visibility state.
- `groupModel: GraphGroupModel` — owns the group membership tree.
- `connectivityModel: GraphConnectivityModel` — owns the adjacency lookups (real + processed).
- `searchModel: GraphSearchModel` — owns the search algorithm + match-set computation.

All six are constructed in the legacy VM's field declarations (no constructor body work beyond `searchModel` which depends on `renderer` + `visibilityModel`). All six are accessed from BOTH the VM's methods AND the view's render block AND `GraphEditorFacade`'s getters.

**Migration concern:** does moving these to `GraphEditor` break anything?

**Resolution:** no. The submodels are completely host-agnostic — they have no `IContentHost` dependency, no `state` subscription, no lifecycle hooks beyond `renderer.dispose()`. They're pure logic. Moving the ownership from `GraphViewModel` to `GraphEditor` is a pure file-relocation operation:

```typescript
// before (legacy GraphViewModel)
export class GraphViewModel extends ContentViewModel<GraphViewState> {
    readonly renderer = new ForceGraphRenderer();
    readonly visibilityModel = new GraphVisibilityModel();
    readonly dataModel = new GraphDataModel();
    readonly groupModel = new GraphGroupModel();
    readonly connectivityModel = new GraphConnectivityModel();
    readonly searchModel: GraphSearchModel;
    constructor(host: IContentHost) {
        super(host, defaultGraphViewState);
        this.searchModel = new GraphSearchModel(this.renderer, this.visibilityModel);
    }
    // ...
}

// after (GraphEditor)
export class GraphEditor extends V4EditorModel<GraphEditorState, void, GraphQueueEvent> {
    readonly renderer = new ForceGraphRenderer();
    readonly visibilityModel = new GraphVisibilityModel();
    readonly dataModel = new GraphDataModel();
    readonly groupModel = new GraphGroupModel();
    readonly connectivityModel = new GraphConnectivityModel();
    readonly searchModel: GraphSearchModel;
    constructor(state: TComponentState<GraphEditorState>) {
        super(state);
        // ... typedQueue cast, trait wiring ...
        this.searchModel = new GraphSearchModel(this.renderer, this.visibilityModel);
        // ... rest of constructor ...
    }
    // ...
}
```

No API change. The facade reads `editor.dataModel.X` instead of `vm.dataModel.X` (one-symbol rename).

**Edge case — submodel state survival across editor switches:** today's submodel state is owned by the VM instance. On Monaco↔Graph switch, the old VM (with its 6 submodels) is destroyed; the new VM constructs fresh submodels. After US-564, same behavior: new `GraphEditor` constructs fresh submodels. The user-facing impact is identical (e.g., visibility expand/collapse state resets on switch). This is acceptable — the alternative (carry submodels through host or app state) is much more complex and not part of the migration scope.

### GR6 — Initial `parseContent` kickoff in `adoptHost` (mirror of MR3 from Mermaid)

**Context:** today's `GraphViewModel.onInit()` ends with `this.parseContent()`. This kicks off the first parse against the freshly-loaded host content.

After SF2, the natural trigger is the slice-subscribe set up in `adoptHost`:
```typescript
this._hostContentUnsub = host.state.subscribe(
    () => { /* parseDebounced */ },
    (s) => s.content,
);
```

Question: does the content-subscribe fire on the **first** subscription? Per TOneState semantics (confirmed during US-562 MR3): **no** — `subscribe(cb, selector)` only fires on subsequent `state.update` calls where the selector value changes. So relying on the subscribe alone would leave the first parse dependent on a content change that may not happen if content is already loaded.

**Resolution:** explicit `this.parseContent()` kickoff at the end of `adoptHost` (mirrors today's `onInit` final call + US-562 MR3 resolution). Step 1's `adoptHost` ends with the explicit call.

**Why sync `parseContent` instead of `parseDebounced`?** The legacy VM's `onInit` uses `parseContent` (synchronous), not `parseDebounced` (400 ms delay). This is because the body's `loading: true` default would otherwise show a spinner for 400 ms on every open — unnecessary delay since the parse itself is sync (JSON.parse + rebuildAndRender). Keep the same: explicit `parseContent()` at the end of `adoptHost`. The debounced path is only used for content-change retrigger (the 400 ms protects the parse from typing-rate updates).

### GR7 — `skipNextContentUpdate` serialization round-trip guard (preserved verbatim)

**Context:** today's `GraphViewModel.serializeToHost` calls `this.host.changeContent(JSON.stringify(json, null, 4), true)` after every edit operation. This triggers `host.state.update((s) => { s.content = ... })`, which would propagate back through the v4 `_hostContentUnsub` subscription and re-parse the just-written JSON — wasteful + introduces a parse-render flicker.

The legacy VM guards against this with a `skipNextContentUpdate` flag:
```typescript
private serializeToHost(): void {
    // ... build json ...
    this.skipNextContentUpdate = true;
    this.host.changeContent(JSON.stringify(json, null, 4), true);
}

protected onContentChanged(): void {
    if (this.skipNextContentUpdate) {
        this.skipNextContentUpdate = false;
        return;
    }
    this.parseDebounced();
}
```

**Migration:** preserved verbatim. The flag becomes a private field on `GraphEditor`; the guard moves into the `_hostContentUnsub` callback:

```typescript
this._hostContentUnsub = host.state.subscribe(
    () => {
        if (this.skipNextContentUpdate) {
            this.skipNextContentUpdate = false;
            return;
        }
        this.parseDebounced();
    },
    (s) => s.content,
);
```

**Resolution:** no design change. Step 1 confirms the inline guard.

**Edge case — external content change while skipNextContentUpdate is true.** If the user (or another script) modifies content via an unrelated path (e.g., via the script API `page.content = ...`) AT THE SAME TIME the editor is serializing, the external change would be silently dropped. This is a pre-existing risk in the legacy code — not introduced by the migration. Out of scope to fix here.

### GR8 — `isFirstLoad` flag per-instance — confirms correct default

**Context:** the `isFirstLoad: boolean` flag controls whether `renderer.updateData` (full sim init, computes BFS) or `renderer.updateVisibleData` (incremental, position-preserving) is called by `rebuildAndRender`. Today's VM initializes it to `true`; flips to `false` after the first `rebuildAndRender` runs.

**Migration concern:** on Monaco↔Graph switch, a new `GraphEditor` is constructed. Its `isFirstLoad` initializes to `true`. The renderer is also fresh (newly constructed). `parseContent` runs (per GR6) → `rebuildAndRender` runs → renderer.updateData runs → simulation initializes. Correct.

**Resolution:** no design ambiguity. Per-instance initialization to `true` is correct for v4 (one editor instance per page-attach; renderer state ties to editor instance lifetime).

### GR9 — Body composition: in-canvas overlay toolbar stays in body; portal toolbar/footer move to `<TextChrome>` contributions

**Context:** legacy `GraphView.tsx` has TWO toolbar regions:
1. **In-canvas overlay toolbar** (lines ~500–634) — absolutely positioned over the canvas (top-left, semi-transparent, expands on hover/click). Houses Settings + Grouping + Reset + Expand-all + Search input + tabs (Physics/Expansion/Results). This is a **content-area concern** — toolbar overlays the rendered graph.
2. **Page-top portal toolbar** (lines ~663–700) — rendered via `createPortal(... , model.editorToolbarRefLast)`. Houses open-in-draw + copy-image. This is a **page-level chrome concern** — same row as the page tab's switch widget.

Plus a **portal footer** (lines ~701–708) — rendered via `createPortal(..., model.editorFooterRefLast)`. Houses statusHint + recordsCount. Page-level chrome.

**Migration:**
- **In-canvas overlay toolbar** stays inside `GraphBody.tsx` (Step 2). It's content-positioning concerned; not chrome.
- **Page-top portal toolbar** moves to `<TextChrome rightToolbarContributions={<GraphToolbarBits .../>}>` in `index.tsx` (Step 3). The portal disappears.
- **Portal footer** moves to `<TextChrome footerContributions={<GraphFooterBits .../>}>`. The portal disappears.

`TextChrome`'s `rightToolbarContributions` slot (per the file's docstring at lines 41–47 + 119–134) renders AFTER the auto-spacer in `<PageToolbar>` and BEFORE the switch widget. `footerContributions` slot (lines 49–51 + 137–149 + `FooterContributionSlot`) renders in the footer row before the encoding label. Both already proven by US-562 (Mermaid uses `rightToolbarContributions` for 3 toolbar bits).

**Resolution:** confirmed. Step 2 + Step 3 split the composition along these lines. The legacy `GraphView.tsx` portal blocks (for the preserved file) stay as-is — the v4 page-level path doesn't reach them.

**Edge case — focus management:** the in-canvas toolbar's `onMouseEnter / onFocus` handlers (toolbarHovered + toolbarFocusWithin) drive opacity from 0.5 → 1.0. These stay in `GraphBody.tsx` (view-local state). No interaction with `TextChrome`'s root-focus subscription (TC8 — 200 ms refocus on page activation). `TextChrome` focuses the outer panel; the canvas accepts focus on click (`tabIndex={0}` not currently set on the canvas, but click events bubble naturally and the renderer handles them).

### GR10 — Persistence: identity-only descriptor (PV7), all view state stripped

See the "Persistence story" section in Background. Identity-only descriptor; `groupingEnabled` rides HS1 host-slot; all other state recomputed on next parse. Mirrors US-560 / US-561 / US-562 directly. No design ambiguity.

### GR11 — Facade flip — one-symbol rename + submodels exposed same way

**Context:** today's `GraphEditorFacade` reads `this.vm.dataModel.X`, `this.vm.renderer.X`, `this.vm.groupModel.X`, `this.vm.connectivityModel.X`. The facade has 23 getters/methods, all reading submodel state. None of them call lifecycle methods on the VM (no `subscribe`, no `dispose`, no `host` access).

**Migration:** flip the constructor parameter type from `GraphViewModel` to `GraphEditor`. Find/replace `this.vm` → `this.editor`. All submodel references remain identical because `GraphEditor` exposes the same submodels with the same field names (per GR5).

**Resolution:** mechanical rename. Step 6 confirms.

### GR12 — `PageWrapper.asGraph` — instanceof check + drop `acquireViewModel`

**Context:** today's `PageWrapper.asGraph` (lines 280–289):
```typescript
async asGraph(force = false): Promise<GraphEditorFacade> {
    await this.ensureEditor("graph-view", "Graph", "asGraph", force);
    const model = this.model;
    if (!isTextFileModel(model)) {
        throw new Error("asGraph(): page lost its text host during switch");
    }
    const vm = await model.acquireViewModel("graph-view") as GraphViewModel;
    this.releaseList.push(() => model.releaseViewModel("graph-view"));
    return new GraphEditorFacade(vm);
}
```

**Migration:** mirror `asMermaid` (US-562 / Step 7) — instanceof check on `GraphEditor`; drop the `acquireViewModel` + releaseList push.

**Resolution:** see Step 7 above. Same shape as the other migrated `asX` methods.

### GR13 — `addEditorPage("graph-view", ...)` callers — both unchanged

**Context:** two external sites + one internal site call `pagesModel.addEditorPage("graph-view", "json", title, content)`:
1. `ui/sidebar/tools-editors-registry.ts:101` — "Force Graph" sidebar button (creates an empty `.fg.json` page).
2. `editors/graph/GraphViewModel.ts:1347` — `extractSelected` method (creates a new graph page with the extracted subgraph).

After migration:
- Site 1 is unchanged. The new page takes the v4 path via `wrapLegacyForPage`'s new Graph branch (Step 5).
- Site 2's body relocates into `GraphEditor.extractSelected` (per Step 1a). The call is identical. The legacy `GraphViewModel.extractSelected` also keeps this line (preserved for notebook embedding — GR1).

**Resolution:** no changes to call sites. The editor id `"graph-view"` is preserved across the migration. After step 5, all three flows produce native GraphEditor pages.

**Verification during implementation:**
- Click the "Force Graph" sidebar button → new GraphEditor page opens with the empty-state hint visible.
- Inside an existing graph, select 2+ nodes, open the selection menu, click "Extract" → new GraphEditor page opens with the extracted subgraph rendered.

### GR14 — Queue event union — `focus` only (same as siblings)

**Context:** PV8 from walkthrough 22 mandates all four preview editors get `{ type: "focus" }` queue events for `<TextChrome>`'s TC8 200 ms root-focus subscription.

For Graph: the canvas takes mouse/keyboard focus on click via the renderer's handlers (no `tabIndex` needed — the renderer's `onClick` handler grabs focus through normal DOM semantics).

**Resolution:** mirror the siblings. `type GraphQueueEvent = { type: "focus" }`; `type GraphQueueRequest = never`. The body's `editor.typedQueue.use(() => {})` is a no-op subscriber for queue lifecycle hygiene. Step 1 + Step 2 confirm.

## Acceptance criteria

1. **App still opens Graph files end-to-end:**
   - Open a `.fg.json` file from file explorer → renders in the new `GraphEditor` (verify via DevTools: page's `mainEditorV4` is `GraphEditor`, not `LegacyEditorAdapter`).
   - Edit raw JSON in Monaco → switch to Graph via the switch widget → preview reflects updated content after 400 ms debounce (host transfer via `CONTENT_HOST_TRAIT`).
   - Restart app → file reopens via the v4 native path. After restore, the graph re-renders with the same nodes/links.

2. **Force-graph simulation works as today:**
   - Open a non-trivial `.fg.json` (50+ nodes) → simulation initializes (nodes drift apart), settles. Canvas is interactive: pan / zoom / drag-node / select-node / multi-select.
   - Toggle the Settings button → Physics tab opens; sliders for charge / linkDistance / collide; Reset button; values persist via `dataModel.sourceData.options` serialization.
   - Reset View button → re-runs simulation from scratch (`isFirstLoad` re-set to true via `resetView`).

3. **`groupingEnabled` persists across editor switches AND app restarts (HS1):**
   - Open an `.fg.json` file with groups → toggle Grouping off → switch to Monaco → switch back to Graph: grouping preserved off (HS1 host-slot survives switch).
   - Toggle Grouping off → restart app → file reopens: grouping preserved off (HS1 slot rides host descriptor in `openFiles0.json`).
   - Fresh `.fg.json` file (no prior slot) opens with `groupingEnabled = true` (default).

4. **Toolbar (top + in-canvas) renders correctly:**
   - **Top toolbar (page-level):** NavPanel button (when file is on disk), Spacer, open-in-draw button, copy-image button, switch widget. Open-draw and copy buttons are NOT disabled (always operate on the latest canvas snapshot).
   - **In-canvas overlay toolbar (content-area):** Settings + Grouping (with strikethrough for off-state) + Reset + Expand-all (when visibility filter active) + Search input. Hover/focus dims to opacity 0.5 ↔ 1.0.
   - **Tabs panel** (Physics / Expansion / Results) opens below the toolbar row when Settings or Search results are active.
   - Switch widget lists `Monaco` + `Graph` for a graph host.

5. **Selection + editing + grouping works:**
   - Right-click empty area → context menu with "Add Node"; click → new node appears at click position.
   - Right-click a node → context menu with all options (Add Child / Delete / Set Root / Collapse / Edit Group Title (groups) / Ungroup (groups) / Delete Group (groups) / Select Children / Select Members / etc.).
   - Click node → selects; ctrl+click → multi-select.
   - Selection info "N selected ▾" appears next to the search input; clicking opens the selection menu (Copy Markdown / Open Markdown / Open Grid / Extract / Extract with children / Group Selected / Delete Nodes).
   - Alt+click to link/unlink two nodes (with status hint preview).
   - Shift+hover → highlight neighbors (via `setAltKeyHighlight`).
   - Ctrl+F focuses the search input; Ctrl+A selects all visible nodes.
   - Double-click node → opens GraphDetailPanel (via `onDoubleClickNode → setExpandRequest`).

6. **Search works:**
   - Type in the search input → results panel opens; matched nodes highlight on canvas.
   - Arrow Up/Down navigates results; Enter selects + reveals the focused result.
   - Escape closes the panel (first press) / clears the search (second press).
   - "[+N hidden]" reveals hidden matches; "[select all / add to selection]" adds search results to the selection.

7. **Scripting facade `page.asGraph()` works:**
   - From a Graph page: `const g = await page.asGraph(); console.log(g.nodeCount, g.linkCount)` returns valid counts.
   - From a non-Graph page: `await page.asGraph(true)` switches the page if compatible (force flag — SF1).
   - `page.asGraph(false)` (default) throws on non-Graph page.
   - Facade methods (`getNode`, `getNeighborIds`, `search`, `bfs`, `getComponents`, `select`, `clearSelection`, etc.) reflect editor state in real-time.

8. **Persistence round-trip:**
   - Open a `.fg.json` file → restart app → file reopens at the same v4-native editor.
   - Pre-US-564 session data (legacy `editor: "graph-view"` + `type: "textFile"` descriptor) still loads via `wrapLegacyForPage` (v3 restore path).
   - Pre-US-564 sessions DO NOT have a `groupingEnabled` slot — opening a pre-US-564-saved Graph page falls back to default `true`. User's next toggle persists.
   - Position changes (drag nodes around) DO NOT persist (today's behavior preserved — simulation re-runs on every reopen).

9. **Notebook embedding still works (GR1 verification):**
   - Create a notebook page with a Graph-typed note (in-app: add a note, switch its editor to `graph-view`, paste a valid `.fg.json`-shaped JSON, save the notebook).
   - Restart app → reload the notebook → the Graph note renders without console errors. Canvas is interactive.
   - This is the critical test that bit US-554 retrospectively; running it during US-564 implementation prevents the regression.

10. **`addEditorPage("graph-view", ...)` callers all work (GR13):**
    - Click "Force Graph" sidebar button → new empty GraphEditor page (with the "Right-click → Add Node" hint visible).
    - Inside a graph, select 2+ nodes → selection menu → "Extract" → new GraphEditor page with the extracted subgraph rendered.
    - Inside a graph, select 1+ nodes → selection menu → "Open Markdown" → new MarkdownEditor page with the node properties summarized.
    - Inside a graph, select 1+ nodes → selection menu → "Open Grid" → new Grid (JSON) page with the cleaned nodes as rows.

11. **No regression in rendering / interaction quality:**
    - Tooltip appears after 500 ms hover; disappears on mouse-leave with 150 ms grace.
    - Tooltip stays open if mouse moves into the tooltip itself (`setTooltipHovered`).
    - Status hint (alt+click preview text) appears in the footer when hovering an alt+click target.
    - Records count ("N nodes" or "N of M nodes") updates live in the footer.
    - Theme refresh (`refreshColors`) re-applies colors on every render.

12. **Cleanup verified:**
    - `Grep "acquireViewModel.*graph-view"` returns hits only in `NoteItemEditModel.ts` and `note-editor` flow (legacy path) — not in `PageWrapper.ts`.
    - `Grep "useContentViewModel.*graph-view"` returns hits only in `GraphView.tsx` (legacy file preserved per GR1).
    - `src/renderer/editors/graph/index.ts` is deleted; `src/renderer/editors/graph/index.tsx` exists with the new surface.
    - `GraphView.tsx` + `GraphViewModel.ts` + all 6 submodel files + 4 panel/tooltip/menu files exist unchanged (modulo the one-line prop rename in `GraphView.tsx` per Step 9).
    - TypeScript + ESLint pass with zero new errors in touched files.

## Files changed summary

### New files

| File | Purpose |
|------|---------|
| `src/renderer/editors/graph/GraphEditor.ts` | Native v4 `GraphEditor` class — state with HS1-mirrored `groupingEnabled` + view-derived fields; trait wiring; three-phase lifecycle; host adoption with content + HS1 subscriptions; six owned submodels; ~1100 LOC of relocated orchestration (selection / grouping / context-menu / editing / search / serialization / parsing). Estimated ~1500 LOC. |
| `src/renderer/editors/graph/GraphBody.tsx` | Body view — reads `editor.state.use(...)` reactively; renders canvas + in-canvas overlay toolbar + GraphTooltip + GraphDetailPanel + GraphLegendPanel; wires renderer to canvas via callback ref; sets up `onDoubleClickNode` callback in useEffect. Estimated ~620 LOC. |
| `src/renderer/editors/graph/index.tsx` | Module shell — `GraphEditorView` (`<TextChrome>` with `rightToolbarContributions={<GraphToolbarBits/>}` (2 buttons) + `footerContributions={<GraphFooterBits/>}` + `<GraphBody>` + view-local `canvasRef`), `graphModule` export, class re-export. Replaces today's `index.ts`. Estimated ~110 LOC. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `if (isTextFile && targetEditorId === "graph-view")` branch in `wrapLegacyForPage` after the Mermaid branch; add import of `GraphEditor` + `defaultGraphEditorState`. |
| `src/renderer/editors/register-editors.ts` | Keep legacy `graph-view` `loadModule` (eager imports preserved for notebook); drop `"graph-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; append v4 native registration; add comment documenting GR1 rationale. |
| `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts` | Wrap `GraphEditor` instead of `GraphViewModel`; getters/methods read `editor.X` instead of `vm.X` (one-symbol rename). |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | `asGraph` flips to `instanceof GraphEditor`; drop `acquireViewModel("graph-view")` + `releaseList` push; remove the `GraphViewModel` type-import; add `GraphEditor` value-import. |
| `src/renderer/editors/graph/GraphTuningSliders.tsx` | Rename prop `vm: GraphViewModel` → `editor: GraphTuningHost` (narrow structural interface); rename body refs `vm.X` → `editor.X`. |
| `src/renderer/editors/graph/GraphExpansionSettings.tsx` | Same prop rename + narrow interface. |
| `src/renderer/editors/graph/GraphLegendPanel.tsx` | Same prop rename + narrow interface. Update `vm.onHighlightSelection = ...` → `editor.onHighlightSelection = ...`. |
| `src/renderer/editors/graph/GraphView.tsx` | Single edit: change `<GraphTuningSliders vm={vm} />` (+ two sibling sub-panels) to `<GraphTuningSliders editor={vm} />` so the legacy view still satisfies the new sub-panel prop contract (GR1 preservation). |

### Deleted files

| File | Reason |
|------|--------|
| `src/renderer/editors/graph/index.ts` | Replaced by `index.tsx` (different re-export surface; new `graphModule` + class exports). Notebook embedding path imports `./GraphView` directly via the legacy `loadModule`'s `Promise.all`. |

### Preserved files (intentional — GR1)

| File | Rationale |
|------|-----------|
| `src/renderer/editors/graph/GraphView.tsx` | Consumed by `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor` for Graph-typed notebook notes. Removed by US-557 once Notebook migrates. |
| `src/renderer/editors/graph/GraphViewModel.ts` | Consumed by `NoteItemEditModel.acquireViewModel("graph-view")` for Graph-typed notebook notes. Removed by US-557. |
| `src/renderer/editors/graph/ForceGraphRenderer.ts` | Shared between the new `GraphEditor` AND the preserved `GraphViewModel`. Submodel — never goes away. |
| `src/renderer/editors/graph/GraphDataModel.ts` | Same. |
| `src/renderer/editors/graph/GraphVisibilityModel.ts` | Same. |
| `src/renderer/editors/graph/GraphGroupModel.ts` | Same. |
| `src/renderer/editors/graph/GraphConnectivityModel.ts` | Same. |
| `src/renderer/editors/graph/GraphSearchModel.ts` | Same. |
| `src/renderer/editors/graph/GraphHighlightModel.ts` | Same. |
| `src/renderer/editors/graph/GraphContextMenu.ts` | Pure module; consumed by both paths. |
| `src/renderer/editors/graph/GraphTooltip.tsx` | Flat-prop component; consumed by both paths. |
| `src/renderer/editors/graph/GraphDetailPanel.tsx` | Flat-prop component; consumed by both paths. |
| `src/renderer/editors/graph/GraphIcons.tsx` / `constants.ts` / `shapeGeometry.ts` / `types.ts` | Pure modules / icon components. |

### Unchanged files

| File | Notes |
|------|-------|
| `src/renderer/api/types/graph-editor.d.ts` | Facade interface — shape preserved (sync data/selection/relationships/search/traversal/analysis/options getters). |
| `src/renderer/api/types/common.d.ts` | `EditorView` union — `"graph-view"` retained. |
| `src/renderer/api/pages/PageModel.ts` | Already supports v4-native main editors. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Shape-based discriminator `d.host !== undefined` (US-561 fix) auto-includes Graph descriptors. |
| `src/shared/types.ts` | `EditorView` union — `"graph-view"` retained. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | Per-note dispatch reaches legacy `module.Editor` via the preserved `loadModule`. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | `acquireViewModel("graph-view")` reaches legacy `createGraphViewModel` via the preserved `loadModule`. |
| `src/renderer/ui/sidebar/tools-editors-registry.ts` | `pagesModel.addEditorPage("graph-view", ...)` — editor id unchanged. |
| `src/main/mcp-http-server.ts` | String literal `"graph-view"` in MCP tool description — editor id unchanged. |
| `src/renderer/editors/base/v4/LegacyEditorAdapter.ts` | Comment listing example content-view ids — cosmetic only. |
