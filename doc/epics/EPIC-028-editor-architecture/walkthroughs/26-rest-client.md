# Rest Client walkthrough

> **Status:** Done 2026-05-20. Tier 5 per-editor walkthrough — Rest Client editor (`.rest.json` files). All ten concerns (RC1–RC10) RESOLVED. **Zero mockup changes** — sixth template-confirmation walkthrough in a row (after Grid, Preview group, Log View, Link, Todo). Pre-check confirmed **non-sidebar-owning topology** — `register-editors.ts:424-458` has no `secondaryEditor` field and grep for `rest-client` / `RestClient` in `secondary-editor-registry.ts` returns zero matches; `RestClientEditor.tsx` composes the request tree (`RequestTree`) inline inside its left-panel via `<Splitter>` exactly as Todo composes `TodoListPanel`. Rest Client lands as the **eighth Tier 5 editor** in the uniform "EditorModel IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT exposed" shape, and the **third non-sidebar-owning** editor in Tier 5 (alongside Grid and Todo) — the LK7+LK8+LK9 recipe explicitly does NOT apply. **New pattern surfaced and resolved:** RC7's split-cache-file consolidation by scale — small UI/selection state folds into descriptor; large payload state (HTTP response bodies, potentially MBs) stays in a separate per-editor cache file. **Notable asymmetry confirmed:** Rest Client stays the only text-bearing Tier 5 editor without a scripting facade (RC10 — YAGNI; adding one later is mechanical).

Walkthrough 26 finalizes `RestClientEditor` — the HTTP request collection editor under EPIC-028. Rest Client is the **eighth Tier 5 editor** in the uniform shape. Its topology is the same in-editor-left-panel variant as Todo (request tree on the left, request/response detail on the right; no sidebar editors, no panel-mode multiplexing). Same JSON-self-write pattern as Log View (LV6), Link (LK5), and Todo (TD5) — **fourth instance**. Same per-editor selection-state cache file → descriptor.state pattern as Grid (GR4), Log View (LV3), Link (LK3), and Todo (TD3) — **fifth instance**. The new wrinkle this walkthrough surfaces is the **response cache** — a second per-editor cache file that holds HTTP response bodies keyed by request id, with a fundamentally different size envelope (potentially MBs per request body). This introduces **split cache-file consolidation by scale** — small UI/selection state folds into descriptor, large payload state stays in a separate cache file.

---

## State today

`src/renderer/editors/rest-client/` is a self-contained folder of 11 files:

| File group | Contents |
|------------|----------|
| Core | `RestClientViewModel.ts`, `RestClientEditor.tsx`, `restClientTypes.ts`, `httpConstants.ts` |
| Request side | `RequestBuilder.tsx`, `KeyValueEditor.tsx`, `multipartBuilder.ts`, `parseClipboardRequest.ts`, `serializeRequest.ts` |
| Response side | `ResponseViewer.tsx` |
| Integration | `open-in-rest-client.ts` (resolver entrypoint — invoked from `content/resolvers.ts:150-153` when `data.target === "rest-client"`) |

### Today's ViewModel state shape

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

Eight fields total.

### Today's `RestClientData` shape (root of `.rest.json`)

```typescript
interface RestClientData {
    type: "rest-client";
    requests: RestRequest[];   // each carries id/name/collection/method/url/headers/body/bodyType/bodyLanguage/formData/binaryFilePath/formDataEntries
}
```

No `state` field — unlike Todo's `TodoData.state[id].contentHeight` per-item map. Rest Client doesn't persist per-request UI state inside the JSON file.

### Today's private fields

| Field | Purpose |
|-------|---------|
| `lastSerializedData: RestClientData \| null` | Reference-equality marker — skips serialization when `state.data.requests` hasn't been swapped |
| `skipNextContentUpdate: boolean` | Self-write guard — set when the VM serializes its own state to JSON so `onContentChanged` doesn't re-parse what we just wrote (same shape as Log View / Link / Todo) |
| `selectionRestored: boolean` | One-shot flag — restores `<host.id>-rest-client` cache file (`selectedRequestId`) on first `loadData` |
| `responseCache: Record<string, CachedResponse>` | **In-memory** response cache keyed by request id. Holds the last response per request, restored from disk on first parse, persisted via debounced 500ms write. Binary responses skip disk persistence ("too large" comment) |
| `static cacheName = "rest-client"` | Selection-state cache file basename |
| `static responseCacheName = "rest-client-responses"` | Response cache file basename |

### Today's lifecycle entry points

- `onInit()` — subscribes `state` → debounced `onDataChangedDebounced` (300ms); reads `host.state.content`; calls `loadData(content)`.
- `onContentChanged(content)` — guards on `skipNextContentUpdate` flag; otherwise re-parses via `loadData(content)`.
- `onDispose()` — flushes pending debounced save (`this.onDataChanged()`).

Notable: `loadData` async-kicks `restoreSelectionState()` AND `restoreResponseCache()` on first call (gated by `selectionRestored` one-shot flag). Two cache-file restores happen in parallel.

### Today's JSON self-write pattern (same as LV6 / LK5 / TD5)

1. User mutates state (`addRequest`, `updateRequest`, `deleteRequest`, `moveRequest`, header/formData CRUD, `pasteRequest`, …) → `state.update(…)` fires subscribers.
2. Debounced `onDataChangedDebounced` (300ms) calls `onDataChanged`:
   - Reads `state.data` + `state.error`; if `error` is set, returns (preserves user's raw content during parse failure).
   - Compares `data.requests` against `lastSerializedData?.requests` by reference — short-circuits when only response/executing state changed.
   - Strips empty trailing rows from `headers` / `formData` / `formDataEntries` (UI auto-adds empty last rows; persistence drops them).
   - Sets `skipNextContentUpdate = true`.
   - Serializes JSON: `{ type: "rest-client", requests }`.
   - Calls `host.changeContent(content, true)` — `true` = "set modified flag".
3. Host content subscription fires `onContentChanged(content)`:
   - Sees `skipNextContentUpdate === true` → resets to false, returns without re-parsing.

External changes (user edits the JSON in another editor, file reload, etc.) hit `onContentChanged` without the flag set → `loadData` re-parses.

### Today's TWO cache files

This is the new wrinkle compared to Grid / Log View / Link / Todo, which each have ONE per-editor cache file:

| Cache file | Content | Size | Cadence |
|------------|---------|------|---------|
| `<host.id>:rest-client` | `{ selectedRequestId }` (small JSON object) | ~40 bytes typical | Debounced 300ms via `saveSelectionState` |
| `<host.id>:rest-client-responses` | `{ [requestId]: { response, responseTime } }` map of all cached responses | **Highly variable** — bytes for small responses, megabytes for large ones; binary responses excluded | Debounced 500ms via `saveResponseCache`; binary responses skip disk write entirely |

The size envelope difference between the two is **3+ orders of magnitude** — selection state never grows; response cache routinely runs into 10s of KB for typical JSON APIs and can exceed 1 MB for HTML responses. The `if (!isBinary)` gate in `sendRequest` keeps gigabyte image/video responses out of disk persistence (they stay in-memory only).

### Today's view-side machinery (`RestClientEditor.tsx`)

- `useContentViewModel<RestClientViewModel>(model, "rest-client")` — ref-counted acquire/release (SF2 target).
- `useSyncExternalStore` over `vm.state` for reactive read.
- Three-pane layout via `<Splitter>`: left RequestTree, right RequestBuilder + ResponseViewer split horizontally by inner `<Splitter>`.
- `leftPanelWidth` mirrored in local `useState` for splitter smoothness; `handleLeftPanelWidthChange` writes both `setLeftPanelWidth(clamped)` + `vm.setLeftPanelWidth(clamped)` per drag tick.
- Bottom (response) pane height self-pinned via `useLayoutEffect` reading `responsePaneRef.current.offsetHeight` — same "pin actually-rendered pixel size after first layout" pattern as `RequestBuilder.bodyHeight`. Double-click on either pane header toggles between 30/70 expanded.
- `RequestTree` builds a grouped tree (collections → requests) via `buildGroupedTree`; each item carries its `RestRequest` plus `__col__<name>` root nodes for collections.
- Tree uses `TraitTypeId.RestRequest` for drag-payload encoding (reorder requests within tree).
- Tree ACCEPTS `LINK` trait drops — drag a link from PageNavigator into the tree → creates a new request from that link's href (multiple links → multiple requests).
- Context menus per item type: collection (`Add Request` / `Open in New Editor` / `Delete Collection`) vs. request (`Duplicate` / `Open in New Editor` / `Delete`).
- `SplitDetailPanel` composes the request side (header bar with collection/name Textareas, copy-as menu with cURL bash/cmd/fetch/fetch-node serializers, delete button) over `<RequestBuilder>`, splitter, response header bar (status/time/size), and `<ResponseViewer>`.
- No portal-based toolbar/footer contributions today — Rest Client predates the portal toolbar pattern; its toolbar is inline in `SplitDetailPanel`.

### Today's RequestBuilder + ResponseViewer (in-editor right pane)

Both render inside `RestClientEditor.tsx` — NOT registered secondary editors. `RequestBuilder` shows method-dropdown + URL field + Send/Cancel button + tab pages for headers / params / body / auth / scripts; `ResponseViewer` shows the response body (text/JSON/binary preview) plus response headers tab.

The "send" button delegates to `vm.sendRequest()` which calls `nodeFetch` async, streams binary file bodies via `fs.createReadStream` (one of the few documented direct-`fs` exceptions; see `coding-style.md` for the list), runs multipart builder for `form-data` body types via dynamic import, base64-encodes binary responses for storage, updates `responseCache` (in-memory) and debounce-saves to disk (unless binary).

### Today's drag-and-drop integration

Two trait systems collaborate at the RequestTree (mirrors Link's earlier setup; cleaner than Todo because Todo only emits-drag, doesn't receive cross-editor):

1. **`TraitTypeId.RestRequest`** (emits + accepts within tree) — encoded via `setTraitDragData(e.dataTransfer, TraitTypeId.RestRequest, { id: item.id })`; drop handler calls `vm.moveRequest(fromId, toId, newCollection)`.
2. **`LINK` trait** (accepts cross-editor) — `canTraitDrop` resolves traits via `resolveTraits(payload.typeId)` and checks for `LINK`; on drop, calls `linkTrait.getItems(payload.data)` and iterates `vm.addRequest(link.title || link.href, collection)` + `vm.updateRequest(req.id, { url: link.href })`.

### Today's registration (`register-editors.ts:424-458`)

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

No secondary editor registrations — Rest Client is not in `secondary-editor-registry.ts`.

### Today's NO scripting facade

Grep across `src/renderer/scripting/api-wrapper/` returns zero matches for `RestClient*Facade` or `asRestClient`. The `page.asX()` family in `api/types/page.d.ts` enumerates 12 entries (Grid, Todo, Markdown, Mermaid, Svg, Html, Link, LogView, Notebook, Draw, Graph, Text) but no `asRestClient`. **Rest Client is the only text-bearing Tier 5 editor without a scripting facade.** SF1's "11 ViewModel-backed facades get the `force?: boolean` parameter" list (from walkthrough 12) confirms this gap pre-refactor.

### Today's resolver integration (Layer-2)

`content/resolvers.ts:150-153` checks `data.target === "rest-client"` and routes to `openInRestClient(data.url, data)` (`editors/rest-client/open-in-rest-client.ts`), which creates a new page via `pagesModel.addEditorPage("rest-client", "json", title, JSON.stringify(restClientData, null, 4))` — entirely outside the EditorModel lifecycle. `tree-context-menus.tsx:43` exposes the "Open in Rest Client" menu entry that injects `{ target: "rest-client" }` into the link data.

This stays unchanged under EPIC-028 — it's a sibling page-creation flow that doesn't touch host adoption or content-view lifecycle.

---

## State after refactor

`RestClientEditor` is the page's `mainEditor` under EPIC-028 (RC1 — direct, not a content-view atop TextFileModel). The class HAS a `TextFileModel` as its `IContentHost`, same shape as Monaco / Grid / Markdown / Mermaid / LogView / Link / Todo (eighth Tier 5 editor in this uniform shape; third non-sidebar-owning after Grid and Todo). Selection-state cache file retires (RC3 — fifth instance of cache-file → descriptor.state). **Response cache file stays separate** (RC7 — first instance of "split cache by scale" pattern). No sidebar-owning topology; no `beforeNavigateAway` / `onMainEditorChanged` overrides.

### Class sketch

```typescript
class RestClientEditor extends EditorModel<RestClientEditorState, void, RestClientQueueEvent> {
    readonly editorId = "rest-client";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;

    // Self-write guard (RC5 — fourth instance after LV6, LK5, TD5):
    private skipNextContentUpdate = false;
    // Reference-equality marker for serialization skip:
    private lastSerializedData: RestClientData | null = null;

    // Response cache — STAYS PRIVATE (not on state; RC7 — separate cache file):
    private responseCache: Record<string, CachedResponse> = {};
    private static readonly responseCacheName = "rest-client-responses";

    // Save debounce — today's pattern:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);
    // Response cache save debounce — today's pattern:
    private saveResponseCacheDebounced = debounce(() => this.saveResponseCache(), 500);

    constructor(state: TComponentState<RestClientEditorState>) {
        super(state);
        this.traits.set(CONTENT_HOST_TRAIT, {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from RestClientEditor");
                this._hostStateUnsub?.();
                this._hostContentUnsub?.();
                this._hostStateUnsub = this._hostContentUnsub = null;
                this._host = null;
                return host;
            },
        });
    }

    // ── Required base overrides ────────────────────────────────────────

    get contentHost(): IContentHost | null { return this._host; }

    findCompatibleEditors(): string[] {
        return this._host ? editorRegistry.findEditorsAccepting(this._host) : [];
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        if (!this.page?.canOpenNavigator(this._host.pipe, filePath) && !filePath) return null;
        return { pipe: this._host.pipe, filePath };
    }

    // ── Persistence (RC2 + RC3 — only the small slice folds into descriptor) ──

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            ...super.getRestoreData(),
            state: {
                id: s.id,
                title: s.title,
                modified: s.modified,
                // Per-editor persisted UI slice (RC3 — fifth instance):
                leftPanelWidth: s.leftPanelWidth,
                selectedRequestId: s.selectedRequestId,
                // Stripped (transient / ride-state):
                //   data (derived from host.content)
                //   error
                //   executing (never restore mid-flight)
                //   response, responseTime (rebuilt from responseCache on selectRequest)
                //   headersJsonInvalid (transient UI validation)
            },
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<RestClientEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined)             cur.title = data.title;
            if (data.modified !== undefined)          cur.modified = data.modified;
            if (data.leftPanelWidth !== undefined)    cur.leftPanelWidth = data.leftPanelWidth;
            if (data.selectedRequestId !== undefined) cur.selectedRequestId = data.selectedRequestId;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) throw new Error(`Cannot switchFrom ${oldEditor.editorId}: no CONTENT_HOST_TRAIT`);
        const host = trait.extractContentHost();
        if (!(host instanceof TextFileModel)) {
            throw new Error(`Cannot switchFrom: host is not a TextFileModel`);
        }
        this.state.update((s) => { s.id = oldEditor.id; });
        host.setStorage(this.stateStorage);
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        // State subscription → debounced JSON write (today's onInit pattern, model-side now):
        this.addSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));

        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : new TextFileModel();
                this._host.setStorage(this.stateStorage);
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
            this.loadData(this._host.state.get().content || "");        // RC4 — initial parse
            await this.restoreResponseCache();                            // RC7 — async restore of large cache; harmless to await sequentially
            // (selection state arrived via applyRestoreData; no async cache file to restore)
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Rest Client editor.", "error");
            this._host = new TextFileModel();
            this._host.setStorage(this.stateStorage);
            this.adoptHost(this._host);
        }
    }

    private adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send());
        // RC4 + RC5 — host content subscription drives re-parse, guarded by self-write flag.
        this._hostContentUnsub = host.state.subscribe(
            (s) => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.loadData(s.content);
            },
            (s) => s.content,
        );
    }

    // ── JSON parse/serialize (RC4 / RC5 — verbatim from today's RestClientViewModel) ──

    private loadData(content: string): void { /* ... same as today's RestClientViewModel.loadData,
        WITHOUT the selectionRestored / restoreSelectionState / restoreResponseCache kickoff
        (selectionRestored retires per RC3; restoreResponseCache moves to restore()) */ }
    private onDataChanged = () => { /* ... same as today; sets skipNextContentUpdate before host.changeContent */ };

    // ── Response cache (RC7 — separate cache file, in-memory shape preserved) ──

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

    private restoreResponseForSelected = (): void => { /* ... same as today */ };

    // ── State mutators (today's setters preserved; signatures unchanged) ──

    selectRequest = (id: string): void => { /* … same as today */ };
    addRequest = (name?: string, collection?: string): RestRequest => { /* … */ };
    deleteRequest = (id: string): void => { /* … */ };
    renameRequest = (id: string, name: string): void => { /* … */ };
    updateRequestCollection = (id: string, collection: string): void => { /* … */ };
    deleteCollection = (collectionName: string): void => { /* … */ };
    moveRequest = (fromId: string, toId: string, newCollection?: string): void => { /* … */ };
    updateRequest = (id: string, changes: Partial<RestRequest>): void => { /* … */ };
    updateBodyType = (id: string, bodyType: BodyType): void => { /* … */ };
    updateBodyLanguage = (id: string, bodyLanguage: RawLanguage): void => { /* … */ };
    // … all header / formData / formDataEntry CRUD preserved verbatim
    // … pasteRequest, sendRequest, setHeadersJsonInvalid preserved verbatim
    // … setLeftPanelWidth preserved verbatim
    // … `selectedRequest` getter preserved verbatim

    // ── Optional overrides ─────────────────────────────────────────────

    focus(): void { this.queue.send({ type: "focus" }); }

    async saveState(): Promise<void> {
        // Flush pending debounced saves before host's saveState
        this.onDataChanged();
        this.saveResponseCache();
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // Flush pending debounced saves (today's onDispose pattern, extended for response cache)
        this.onDataChanged();
        this.saveResponseCache();

        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._hostStateUnsub = this._hostContentUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

### State slice shape (RC2)

```typescript
interface RestClientEditorState extends EditorStateBase {
    // Persisted (RC3 — folded into EditorDescriptor.state, replacing today's selection-state cache file):
    leftPanelWidth: number;
    selectedRequestId: string;
    // View-derived — ride state for reactivity, stripped from getRestoreData (MO5 / GR8 / LV2 / LK2 / TD2 pattern):
    data: RestClientData;            // ← derived from host.content (recomputed via loadData)
    error: string | undefined;
    response: RestResponse | null;   // ← rebuilt from responseCache on selectRequest
    responseTime: number;            // ← rebuilt from responseCache on selectRequest
    // Transient UI state — not persisted (intentionally so — see RC2 rationale):
    executing: boolean;              // never restore mid-flight execution state
    headersJsonInvalid: boolean;     // transient UI JSON-parse validation flag
}
```

Eight fields total: **2 persisted / 4 ride-state stripped / 2 transient**.

The persisted slice is intentionally small (one `number`, one `string`) — ~50 bytes typical, ~120 bytes worst case for a UUID-shaped `selectedRequestId`. Well under M9's 50KB per-page budget.

### Queue event union (RC10)

```typescript
type RestClientQueueEvent = { type: "focus" };       // MO7 — chrome's root-focus follows

// Queue request: never  (no scripting facade today per RC10; if a future facade
//   needs view-context queries, the queue can be extended later — same lazy
//   approach as Grid GR10 / Log View LV9 / Link LK10 / Todo TD10)
```

---

## UI shape

```typescript
function RestClientEditorView({ model }: { model: RestClientEditor }) {
    return (
        <TextChrome
            model={model}
            toolbarContributions={null /* Rest Client predates portal toolbar; per-request toolbar lives inline in SplitDetailPanel */}
            footerContributions={null /* no footer contributions today */}
        >
            <RestClientBody model={model} />
        </TextChrome>
    );
}

function RestClientBody({ model }: { model: RestClientEditor }) {
    const state = model.state.use((s) => ({
        data: s.data, error: s.error,
        selectedRequestId: s.selectedRequestId,
        leftPanelWidth: s.leftPanelWidth,
        executing: s.executing, response: s.response,
        responseTime: s.responseTime, headersJsonInvalid: s.headersJsonInvalid,
    }));

    // Local mirror for splitter smoothness (today's pattern, preserved):
    const [leftPanelWidth, setLeftPanelWidth] = useState(state.leftPanelWidth);
    const handleLeftPanelWidthChange = useMemo(() => (width: number) => {
        const clamped = Math.max(150, Math.min(500, width));
        setLeftPanelWidth(clamped);
        model.setLeftPanelWidth(clamped);
    }, [model]);

    // Focus event handler (mirrors MO7 / GR10 / LV8 / LK11 / TD11):
    model.queue.use((ev) => {
        if (ev.type === "focus") {
            // Today's RestClientEditor has no explicit refocus; harmless no-op for now.
        }
    });

    if (state.error) return <EditorError>{state.error}</EditorError>;

    const selectedRequest = model.selectedRequest;
    const rootItem = useMemo<RequestTreeItem>(() => ({
        id: "__root__", isRoot: true,
        items: buildGroupedTree(state.data.requests),
    }), [state.data.requests]);
    const tItems = useMemo(() => traited([rootItem], requestTreeItemTraits), [rootItem]);

    return (
        <Panel name="rest-client-root" direction="row" flex={1} height={0} overflow="hidden">
            <Panel name="rest-left-panel" direction="column" overflow="hidden" background="default"
                   width={leftPanelWidth} minWidth={150} maxWidth="80%" shrink={false}>
                <Panel name="rest-left-tree" flex={1} overflow="auto" minHeight={0}>
                    <RequestTree model={model} items={tItems} selectedId={state.selectedRequestId} />
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
                    ? <SplitDetailPanel model={model} request={selectedRequest} state={state} />
                    : <EmptyState text={state.data.requests.length === 0
                        ? "No requests yet. Click + to add one."
                        : "Select a request from the list."} />}
            </Panel>
        </Panel>
    );
}
```

`RequestTree`, `SplitDetailPanel`, `RequestBuilder`, `ResponseViewer`, `KeyValueEditor`, `buildGroupedTree`, `requestTreeItemTraits` carry over verbatim — only the prop type `vm: RestClientViewModel` flips to `model: RestClientEditor`.

### `accepts()` (registry) — RC10

```typescript
accepts({ host, fileName, language }): number {
    if (fileName && /\.rest\.json$/i.test(fileName)) return 70;     // strong filename match
    if (language === "json" && host) {
        const content = host.state.get().content;
        if (content.includes('"type"') && /"type"\s*:\s*"rest-client"/.test(content) && content.includes('"requests"')) {
            return 60;                                                // content-peek fallback
        }
    }
    return -1;
}
```

Replaces today's `acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent` quartet with the single `accepts` predicate. Same priority calibration as Grid / Log View / Link / Todo (filename: 70, content-peek: 60).

---

## Switch in / out

- **Switch in via `switchFrom(oldEditor)`** — trait closure extracts host; id copied; storage rebound; `adoptHost` subscribes content + descriptorChanged forwarders; `restore()` follow-up calls `loadData(host.state.get().content)` to populate the request collection against the inherited content. Same shape as Grid GR7 / Log View LV4 / Link LK4 / Todo TD4.
- **Switch out** — trait closure unsubscribes forwarders, returns host. Editor disposes; queue drains; host transfers intact. The in-memory `responseCache` is editor-private, dies with the editor (next time the editor opens, `restoreResponseCache` rebuilds it from disk).
- **Switch widget visibility** — `findCompatibleEditors()` returns `["rest-client", "monaco"]` for a `.rest.json` file (content matches rest-client + json is Monaco-compatible). Per PT10 the widget shows when length ≥ 2 AND current id is in the list — true for both directions.

---

## Lifecycle hooks

| Hook | RestClientEditor |
|------|------------------|
| `applyRestoreData` | ✅ — leftPanelWidth, selectedRequestId |
| `switchFrom` | ✅ same shape as Grid / preview group / LogView / Link / Todo |
| `restore` | ✅ — host load + initial JSON parse + async response-cache restore |
| `saveState` | ✅ — flush onDataChanged + flush saveResponseCache + delegate `host.io.saveState()` |
| `beforeNavigateAway` | ❌ inherit (no sidebar-owning topology — RC6) |
| `onMainEditorChanged` | ❌ inherit (no sidebar-owning topology — RC6) |
| `confirmRelease` | ✅ — delegate host |
| `isFreshEmpty` | ❌ inherit (false) |
| `getNavigatorTarget` | ✅ — host's `{pipe, filePath}` |
| `hasTextSelection?` | ❌ inherit (undefined) |
| `findCompatibleEditors` | ✅ — `findEditorsAccepting(host)` |
| `getRestoreData` | ✅ — strip derived (data/error/response/responseTime/executing/headersJsonInvalid) |
| `getIcon` / `noLanguage` | ❌ inherit |
| `focus` | ✅ — send `{ type: "focus" }` |
| `dispose` | ✅ — flush both saves + unsub + host dispose |

**Override count: 9** (same as Todo; two-hook reduction vs. Link's 11 — exactly `beforeNavigateAway` + `onMainEditorChanged`). Same pay-only-when-used signal: a non-sidebar-owning editor doesn't even mention these hooks.

---

## Persistence

### `getRestoreData()` output

```typescript
{
    editorId: "rest-client",
    id: "<uuid>",
    state: {
        title, modified,
        leftPanelWidth, selectedRequestId,
    },
    host: {
        kind: "textFile",
        state: { id, content: "", language: "json", filePath, modified, encoding, encrypted, temp },
        pipe: { provider, transformers, encoding },
    },
}
```

The descriptor stays small — same shape as Todo's descriptor. The **response cache stays in `<host.id>:rest-client-responses`** as a separate per-editor cache file (RC7); the descriptor does NOT carry it.

### Persisted slice size envelope (RC3)

Realistic distribution:
- Typical: `leftPanelWidth=250, selectedRequestId="b2ac4f60-..."` (UUID) — ~80 bytes JSON-serialized.
- Worst plausible: `leftPanelWidth=500, selectedRequestId="<UUID>"` — ~100 bytes.

**Three orders of magnitude under M9's 50KB per-page budget.** Folding into descriptor matches Grid GR4 + Log View LV3 + Link LK3 + Todo TD3 — **fifth instance** of the cache-file → descriptor.state consolidation pattern.

### Response cache file — stays separate (RC7)

`<host.id>:rest-client-responses` survives independently of the descriptor:
- **Why not fold:** size envelope is fundamentally different (bytes to megabytes per request) — folding into descriptor would blow M9's 50KB budget at the first cached response with a few-KB JSON body, never mind a large HTML page.
- **Why not drop:** the response cache is a major UX feature (user clicks a request → sees the last response immediately, no re-send). Dropping it regresses today's behavior.
- **Today's binary-exclusion gate stays:** `sendRequest` already skips disk persistence for binary responses (`if (!isBinary) saveResponseCacheDebounced()`); without the gate a single PDF response could hit hundreds of MB on disk.
- **Cross-window transfer:** the response cache file follows the host id (it's keyed by `<host.id>` not `<editor.id>`), so it survives cross-window transfer the same way today's host content cache does. No new IPC machinery needed.

### Migration from today's format

Per C2: no migration shim.
- Today's session data with `editor: "rest-client"` and `type: "textFile"` hits walkthrough 04 / P2's detect-and-skip path on first boot post-upgrade.
- Today's `<old-host.id>:rest-client` (selection cache) gets collected by per-editor `fs.deleteCacheFiles(editor.id)` on future dispose, or lingers harmlessly per P9's no-sweep decision.
- Today's `<old-host.id>:rest-client-responses` (response cache) — **the cache-name lives forward** under the new editor instance, since the host id propagates via M5/P6's `instanceId` pathway. So response caches from before the refactor survive transparently as long as the host id is preserved.

---

## Scripting

### NO scripting facade today (RC10)

Rest Client is the **only text-bearing Tier 5 editor without a `XxxEditorFacade.ts`**. Today:
- `api/types/page.d.ts` does not declare `asRestClient()`.
- `src/renderer/scripting/api-wrapper/` contains no `RestClientEditorFacade.ts` file.
- `PageWrapper.ts`'s SF1 list (11 ViewModel-backed facades) does not include Rest Client.

Under EPIC-028 this stays unchanged per RC10's recommendation — adding a facade is mechanical and can be done lazily when a real consumer lands. The Tier 5 template doesn't require a facade; the editor class is fully usable from script via `app.pages.find(...).editor instanceof RestClientEditor` for type-narrowing (though no script today does this).

If a future need arises:
- Add `src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts` with method delegates over the editor (`addRequest(name, collection)`, `selectRequest(id)`, `updateUrl(id, url)`, etc.).
- Add `asRestClient(force?: boolean): Promise<IRestClientEditor>` to `api/types/page.d.ts`.
- Add `asRestClient` method to `PageWrapper.ts` (same shape as `asTodo`/`asGrid`/...).

Total: ~4 file touches; no editor-class change. Deferring this until a use case lands is consistent with YAGNI.

---

## Concerns

### RC1 — Class topology: direct `RestClientEditor` (with TextFileModel host) or content-view on top of TextFileModel?

Today: `TextFileModel` IS the page's `mainEditor`; `RestClientViewModel` is a `ContentViewModel<RestClientEditorState>` acquired via `useContentViewModel("rest-client")` on the host.

Under EPIC-028 the ViewModel machinery retires (SF2 fully completed by walkthrough 23 / LV9). Three readings (same as TD1):

(a) **`RestClientEditor` IS the page's mainEditor; HAS a `TextFileModel` content host.** Same shape as Monaco / Grid / Markdown / Mermaid / LogView / Link / Todo. CONTENT_HOST_TRAIT exposed. Switch-to-Monaco works (view raw `.rest.json` text). File / pipe / save-restore machinery delegated to host.

(b) **`RestClientEditor` IS the page's mainEditor; owns the file directly (no IContentHost).** No CONTENT_HOST_TRAIT. File path, content, pipe owned directly by RestClientEditor. Switch-to-Monaco impossible.

(c) **Hybrid — internal-only host without trait exposure.** No CONTENT_HOST_TRAIT; switch-to-Monaco impossible; raw-edit via "Open as text" menu only.

**RESOLVED 2026-05-20** — Option (a) confirmed. Same reasoning as LV1 / LK1 / TD1 — uniformity with Tier 5; switch-to-Monaco meaningful for `.rest.json` (users may need to hand-edit a corrupted entry or paste a curl-exported JSON wholesale into Monaco view); host machinery reuse. **Eighth Tier 5 editor** in the uniform shape — uniformity continues to be the right call. Rejected (b) — duplicates host machinery; breaks switch-to-Monaco. Rejected (c) — adds opaque branch for no benefit; CONTENT_HOST_TRAIT is the natural exposure point. No mockup change required.

### RC2 — State slice partitioning: which fields persist, which ride state for reactivity, which become private?

Today's `RestClientEditorState` has 8 fields; the model has 5 private fields plus two static `cacheName`/`responseCacheName`. Under EPIC-028 each lands in one of three layers:

(a) **Three layers as documented in the class sketch:**
- **Persist via `getRestoreData`**: `leftPanelWidth`, `selectedRequestId` (2 fields — today's selection-state cache file content `[selectedRequestId]` plus `leftPanelWidth` which today rides state without per-window persistence — folding into descriptor adds it as a side bonus, same incidental fix as Link LK2 / Todo TD2).
- **Ride state for reactivity, strip from descriptor** (MO5 / GR8 / LV2 / LK2 / TD2 pattern): `data`, `error`, `response`, `responseTime` (4 fields — `data` derived from `host.content` via `loadData`; `response` / `responseTime` rebuilt from in-memory `responseCache` on `selectRequest`).
- **Transient UI state, not persisted**: `executing`, `headersJsonInvalid` (2 fields — `executing` is mid-flight state we'd never want to restore; `headersJsonInvalid` is transient UI validation).
- **Stay private (non-state)**: `_skipNextContentUpdate`, `_lastSerializedData`, `_responseCache` (3 fields — bookkeeping + in-memory cache). `selectionRestored` retires per RC3.

(b) **Persist `executing` too** for some restored-mid-flight signal. Doesn't make sense — there's no actual request in flight after restart; persisting `true` would just mislead the UI.

(c) **Persist nothing at all** — drop selection-state cache entirely; force fresh "no selection, default width" on every page open. Same form as PV6's (c) option.

**RESOLVED 2026-05-20** — Option (a) confirmed. The two persisted fields match today's selection-state cache exactly (`selectedRequestId` 1:1 mapping to what's in `<host.id>:rest-client` today); plus `leftPanelWidth` which today is forgotten on restart (silent today-bug — **third instance of this incidental fix** after Link LK2 / Todo TD2). Rejected (b) — `executing` is mid-flight state; no value in restoring. Rejected (c) — regresses today's good behavior (users notice when their last selected request is forgotten, especially since the response cache is keyed by request id and would appear empty against a different selection). No mockup change required.

### RC3 — Selection-state cache retirement: fold into descriptor or keep separate cache file?

Today: `<host.id>:rest-client` cache file via `host.stateStorage.setState(host.id, "rest-client", JSON.stringify({selectedRequestId}))`. Debounced 300ms. Read once on first `loadData` via `selectionRestored` one-shot guard.

Under EPIC-028 with EditorDescriptor.state riding the per-window descriptor save:

(a) **Fold into `EditorDescriptor.state` per RC2 (a).** Mirrors Grid GR4 + Log View LV3 + Link LK3 + Todo TD3 decisions. Eliminates the dedicated selection-state cache file. Single source of truth for selection: editor state → descriptor. Window-level 500ms debounce per P3 replaces today's 300ms.

(b) **Keep separate cache file `<editor.id>-rest-client.json`** for selection. Preserves today's pattern. Editor-private; lower descriptor footprint (~80 bytes saved per page).

(c) **Hybrid: persist `selectedRequestId` via descriptor; keep `leftPanelWidth` in cache file**. Splits per field; over-engineered.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons identical to GR4 / LV3 / LK3 / TD3:
1. **Mirrors Grid GR4 + Log View LV3 + Link LK3 + Todo TD3** — **fifth instance** of the pattern; consistency across Tier 5 editors with per-window UI state.
2. **Unifies persistence** — one less per-editor cache file to track; one less restore-time async-await path (today's `restoreSelectionState` + `selectionRestored` one-shot guard both retire; `static cacheName = "rest-client"` retires too).
3. **IPC drag transfer naturally atomic** — descriptor carries selection; no separate-cache-file race during cross-window drag.

Rejected (b) — duplicates the today-pattern that GR4 + LV3 + LK3 + TD3 eliminated for the same reasons. Rejected (c) — premature splitting. **Fifth instance of "per-editor cache file → descriptor.state" pattern (Grid GR4 → Log View LV3 → Link LK3 → Todo TD3 → Rest Client RC3).** Pattern is now standardized across **five of seven** persisted-Tier-5 editors. No mockup change required.

**Amended 2026-05-21 by HS1.** Folds into `host.editorSettings["rest-client"]`, not `EditorDescriptor.state`. `leftPanelWidth` + `selectedRequestId` ride the host slot — survive RestClient↔Monaco switches (user toggles to raw JSON to fix syntax, switches back; selected request stays put) AND app restarts. RC7's `<host.id>:rest-client-responses` bulk-response cache file stays untouched — MB-scale payload, separate cache by design. Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### RC4 — JSON parse/serialize lifecycle hooks under EPIC-028

Today's `RestClientViewModel` lifecycle:
- `onInit` — state subscription → debounced save; initial `loadData(host.content)` (which kicks off async `restoreSelectionState` + `restoreResponseCache`)
- `onContentChanged(content)` — guards on `skipNextContentUpdate`; else `loadData(content)`
- `onDispose` — flushes pending save via `this.onDataChanged()` (but does NOT flush response cache — slight today-bug; pending response saves can be lost on close)

Under EPIC-028 / SF2:

(a) **Three-site split (mirrors LV4 / LK4 / TD4):**
- `restore()` — sets up state subscription → `onDataChangedDebounced`; calls `loadData(host.content)` initial parse; `selectionRestored` flag retires per RC3 (selection state arrives via `applyRestoreData` from descriptor, not from a separate cache file); awaits `restoreResponseCache()` (the surviving large cache).
- `adoptHost` content subscription — calls `loadData(content)` with `skipNextContentUpdate` guard.
- `dispose()` — flushes BOTH pending saves (`onDataChanged` + `saveResponseCache`); unsubs forwarders; nulls refs; host dispose. **Incidentally fixes today's lost-response-save bug** (today's `onDispose` only flushes `onDataChanged`).

(b) **Single editor-level `loadData` for both initial and incremental** — drop the redundant subscription-during-restore pattern. Slightly fewer lines; equivalent observable behavior.

(c) **Defer parse until first read** — lazy parse on first view subscribe. Adds complexity.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three sites as described. Mechanical fall-out from SF2 + RC3 + RC7. Mirrors Log View LV4 / Link LK4 / Todo TD4's three-site shape — **fourth Tier 5 editor** in this lifecycle pattern. The state→save subscription happens once in `restore()` (not in `adoptHost`, which fires on switch-in too — we don't want to re-subscribe). The `dispose()` flush of `saveResponseCache` fixes a subtle today-bug where pending response-cache writes within the 500ms debounce window get dropped when the user closes the page. Rejected (b) — couples concerns. Rejected (c) — adds complexity. No mockup change required.

### RC5 — `skipNextContentUpdate` flag under host subscription (mirrors LV6 / LK5 / TD5)

Today's mechanism: identical to Log View LV6, Link LK5, and Todo TD5 — editor's mutators set `skipNextContentUpdate = true`, then call `host.changeContent(newContent, true)`. Host's content subscription fires; the editor reads + resets the flag and skips re-parsing.

Under EPIC-028, three candidates (same as LV6 / LK5 / TD5):

(a) **Keep `skipNextContentUpdate` flag** — verbatim port.
(b) **Pass `bySelf` parameter to `host.changeContent(content, bySelf)`** — leaks editor concern into host API.
(c) **TOneState change-reason tracking on host** — over-engineered for four consumers (LogView + Link + Todo + RestClient).

**RESOLVED 2026-05-20** — Option (a) confirmed. Same reasoning as LV6 / LK5 / TD5 — flag is editor-private; race is editor-internal; today's pattern works. **Fourth instance of the self-write-guard pattern** in EPIC-028 (LV6 → LK5 → TD5 → RC5). The pattern is now **rock-solid standardized**: every append-or-mutate-then-serialize editor that writes back to its host via `host.changeContent` carries this flag. With four instances the test for adding host-side machinery (b/c) is "does the host-side machinery ever pay back?" — answer is no, because the editor-private flag is two lines of code and works perfectly. Rejected (b) host-side `bySelf` parameter. Rejected (c) change-reason tracking. No mockup change required.

### RC6 — Sidebar / panel topology: confirm Rest Client is NOT sidebar-owning

Walkthrough 25's closure noted "before drafting [walkthrough 26], pre-check whether Rest Client registers its collection panel as a secondary editor (would make it a second sidebar-owner and validate the LK6+LK7+LK8+LK9 recipe across editors) or renders it inline (would make it the eighth Tier 5 editor in Todo's non-sidebar-owning shape)." A first-principles reading of `register-editors.ts:424-458` and `secondary-editor-registry.ts` answers definitively:

- `register-editors.ts:424-458` register `rest-client` as `category: "content-view"` with no `secondaryEditor` field anywhere.
- `secondary-editor-registry.ts` (grep across) returns zero matches for `rest-client` / `RestClient`.
- `RequestTree` lives inside `RestClientEditor.tsx`'s render tree — directly composed into the left panel via `<RequestTree vm={vm} … />` inside an inline `<Panel>` sized by `<Splitter>`, never registered as a sidebar panel.

So under EPIC-028:

(a) **RestClientEditor stays a single-surface editor — no sidebar registration.** `RequestTree` becomes a child component of `RestClientBody` exactly as today. No `setSidebarPanels` method, no `beforeNavigateAway` override, no `onMainEditorChanged` override. `model.secondaryEditor` stays empty / unset. **The LK7 / LK8 / LK9 recipe explicitly does NOT apply.**

(b) **Promote `RequestTree` to a sidebar editor** — register it as `secondaryEditorRegistry.register({ id: "rest-collection", … })`. Requires the LK7 + LK8 + LK9 recipe.

(c) **Conditional sidebar registration based on user preference** — let users opt in. Adds a settings flag.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **Matches today's behavior exactly.** Today RequestTree renders inline always; no user-facing UI hints at a sidebar promotion. Changing this is a UX decision that doesn't belong inside an architectural refactor.
2. **Third non-sidebar-owning Tier 5 editor (after Grid and Todo).** Confirms the non-sidebar-owning topology is the modal shape — sidebar-owning (Link, walkthrough 24) remains the outlier. The two-hook delta (`beforeNavigateAway` + `onMainEditorChanged`) is the entire architectural difference; pay-only-when-used continues to hold.
3. **LK recipe stays at one example.** Walkthrough 24's LK6+LK7+LK8+LK9 recipe (the `beforeNavigateAway` + `onMainEditorChanged` + TreeProvider integration pattern) keeps one canonical example until a true second sidebar-owner lands. The next opportunity is walkthrough 30 (no-host group — Archive + Explorer + LinkEditor's secondary panels). Until then the recipe stays calibrated by Link alone.

Rejected (b) — extends scope without UX justification. Rejected (c) — premature scaffolding. **Calibration confirmed:** walkthrough 25's pre-check pointer was correct (the prediction it was correcting from walkthrough 24 was the wrong one, not the walkthrough 25 prediction itself). Rest Client lands as predicted in the non-sidebar-owning shape. No mockup change required.

### RC7 — Response cache: keep as separate per-editor cache file vs. fold into descriptor (new pattern surface)

Today: a SECOND per-editor cache file `<host.id>:rest-client-responses` stores `{ [requestId]: { response, responseTime } }` — keyed by request id, value contains full HTTP response object (status, statusText, headers, body, isBinary?, contentType?). Binary responses are base64-encoded in `body`. Saved via debounced 500ms `saveResponseCache`. Binary responses are **excluded from disk persistence** via `if (!isBinary)` gate in `sendRequest` ("Don't persist binary responses to stateStorage (too large)").

This is the **first per-editor cache file in Tier 5 that DOESN'T fit the GR4/LV3/LK3/TD3/RC3 fold-into-descriptor pattern** — because the size envelope is fundamentally different.

Three options:

(a) **Keep `<host.id>:rest-client-responses` as a separate per-editor cache file.** Selection state folds into descriptor (RC3); response state stays in a dedicated cache file. **First instance of split cache-file consolidation by scale.** The pattern that emerges: *small UI/selection state ≤ 1KB → descriptor; large payload state → per-editor cache file.*

(b) **Fold into descriptor**, alongside selection state. Bytes-to-megabytes payloads ride the WindowState save path on every edit; would blow M9's 50KB-per-page budget at the first JSON-API response.

(c) **Drop the response cache entirely** — fresh "no cached response" on every page open; user re-sends to see the result.

**RESOLVED 2026-05-20** — Option (a) confirmed. Four reasons:
1. **Size envelope makes (b) impossible.** A single 30KB JSON response (a typical GitHub API page) plus the descriptor's existing host snapshot would already blow the 50KB-per-page budget. Larger HTML responses or paginated lists would make WindowState saves multi-MB. Cross-window drag would carry the same payload as IPC.
2. **(c) regresses real UX value.** The response cache is a major Rest Client feature — flip between requests in the same collection and see the last result without re-sending. Dropping it on restart silently breaks the persistent-collection workflow.
3. **Cross-window survival comes for free.** The cache file is keyed by `<host.id>`, so it follows the host across cross-window drag via the same mechanism as the host content cache. No new IPC machinery; no descriptor-blob expansion.
4. **Today's binary-exclusion gate stays load-bearing.** The model continues to skip disk persistence for binary responses (`if (!isBinary)`); without it a single PDF response could hit hundreds of MB on disk. This is editor-internal policy; the cache-file approach lets the editor own this policy without forcing it into the framework.

Rejected (b) — descriptor budget violation. Rejected (c) — UX regression. **Establishes the split-cache pattern** as guidance for future editors with mixed payload sizes (Notebook + cell outputs, possibly Graph + simulation snapshots). The pattern: *write your selection state to the descriptor; write your bulk payload state to a per-editor cache file keyed by host id.* No mockup change required.

### RC8 — Confirmation dialogs / notifications from model methods (`ui.confirm` / `ui.notify`)

Today's `sendRequest` calls `app.ui.notify("Fix invalid JSON in headers before sending", "warning")` directly from the model layer when `headersJsonInvalid` is set. Today's `RestClientEditor.tsx` calls `app.ui.confirm(...)` from view-side for delete confirmations (`Delete request?`, `Delete all requests in "<col>"?`). This is similar to Todo's TD8 but flipped — Rest Client puts confirms in the view, notifies in the model.

Under EPIC-028 the question is "does this pattern survive the host/editor split?":

(a) **Preserved verbatim.** `ui.confirm` / `ui.notify` are app-level singletons accessible from anywhere; both the EditorModel layer and view layer can call them directly. The host/editor split doesn't touch this surface. View-side confirms stay where they are; model-side notify stays where it is.

(b) **Move all dialogs to the view** — model's `sendRequest` becomes "no notify," and the view's send-button onClick wraps the call with the validation check + `ui.notify`. Splits send-validation across two layers.

(c) **Pipe confirmations through a model→view ComponentQueue event** so the view owns all dialog rendering. Adds an async round-trip; view code grows.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons (same shape as TD8):
1. **`ui` is app-level by design.** The `app.ui` namespace is accessible from anywhere; today's split (view does confirms, model does notify-on-validation) is a pragmatic split that works.
2. **No leak.** `ui.confirm` / `ui.notify` don't pull view-layer concepts into the model — they're opaque "ask the user" primitives. The model decides WHEN to ask; the framework decides HOW to ask.
3. **Send-validation is a model concern.** `headersJsonInvalid` is a model state flag (set by the view's JSON editor, read by `sendRequest`); pushing the validation-notify decision to the view splits the read of a model flag across layers without benefit.

Rejected (b) — splits send-validation across layers. Rejected (c) — ComponentQueue is mailbox-style; confirmation dialogs are RPC-style with the framework as consumer (different shape). No mockup change required.

### RC9 — Drag-and-drop: `TraitTypeId.RestRequest` (emit) + `LINK` trait (accept)

Today: RequestTree uses **two trait systems** at once:
- `TraitTypeId.RestRequest` — encodes drag payload for moving requests within the tree via `setTraitDragData(e.dataTransfer, TraitTypeId.RestRequest, { id: item.id })`; drop handler calls `vm.moveRequest(fromId, toId, newCollection)`.
- `LINK` trait — accepts cross-editor drag-and-drop: drag a link from PageNavigator's link list into the tree → creates new request from that link's href via `vm.addRequest(link.title || link.href, collection)` + `vm.updateRequest(req.id, { url: link.href })`.

Under EPIC-028 the question is "does the trait system carry verbatim?":

(a) **Preserved verbatim.** Both `TraitTypeId.RestRequest` (in `TraitRegistry.ts:13`) and `LINK` trait (consumer side via `resolveTraits(payload.typeId)?.get(LINK)`) stay in the drag-and-drop trait system; the drag data format is independent of the EditorModel topology; `vm.moveRequest` / `vm.addRequest` / `vm.updateRequest` become method-equivalent to `editor.X` post-refactor.

(b) **Promote to a trait on the EditorModel itself** (e.g., `REORDERABLE_LIST_TRAIT`, `LINK_RECEIVER_TRAIT`) so other editors can opt in. Adds infrastructure for two consumers.

(c) **Inline drag handling in `RestClientBody`** — drop the `setTraitDragData` abstraction. Loses cross-editor drop targeting.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons (same shape as TD9):
1. **`TraitTypeId` is the trait SYSTEM's job, not EditorModel traits.** Drag traits describe DATA shapes that can be dragged; EditorModel traits describe CAPABILITY shapes editors expose. The two trait systems are deliberately separate, as documented by TD9.
2. **Cross-editor drop targeting is the trait system's reason for existing.** Rest Client accepting LINK drops is the **canonical example** of the trait system paying its keep — a Todo-only inline alternative wouldn't let PageNavigator's Link panel drag into Rest Client. The abstraction earns its complexity here.
3. **Two consumers each.** `TraitTypeId.RestRequest` has one consumer (Rest Client). `LINK` trait has multiple consumers (Link editor, PageNavigator items, anything else that holds an `ILink`). Both are stable; refactoring adds nothing.

Rejected (b) — different trait system; conflating them adds confusion. Rejected (c) — loses the trait system's flagship value (cross-editor drop). No mockup change required.

### RC10 — Registry surface + queue + scripting facade decision

Today's registry has four predicates: `acceptFile` (filename), `validForLanguage` (language), `switchOption` (language + filename), `isEditorContent` (language + content match). Under EPIC-028 the registry mockup collapses all to a single `accepts({host, fileName, language, mode}): number`.

Today's scripting surface: **NONE.** No `asRestClient()` exists; no `RestClientEditorFacade.ts` file; SF1's list of 11 ViewModel-backed facades excludes Rest Client.

(a) **`accepts()` filename-strong + content-peek fallback** (priorities 70 / 60) — mirrors LV10 / LK10 / TD10:
```typescript
accepts({host, fileName, language}): number {
    if (fileName && /\.rest\.json$/i.test(fileName)) return 70;
    if (language === "json" && host) {
        const content = host.state.get().content;
        if (content.includes('"type"') && /"type"\s*:\s*"rest-client"/.test(content) && content.includes('"requests"'))
            return 60;
    }
    return -1;
}
```
Queue events: `{ type: "focus" }` only; queue request: `never`. **Defer scripting facade** — add `RestClientEditorFacade.ts` + `asRestClient()` only when a real consumer lands; today there are zero. Marks Rest Client as the **only text-bearing Tier 5 editor without a scripting facade**.

(b) **Add a minimal scripting facade today** with `addRequest`, `selectRequest`, `updateUrl`, `getResponse` methods. Adds 1 file (`RestClientEditorFacade.ts`) + 1 declaration update (`api/types/page.d.ts`) + 1 `PageWrapper` method. Anticipates future need.

(c) **Add a full scripting facade** with all CRUD methods + sendRequest + response-cache access. Largest surface area.

**RESOLVED 2026-05-20** — Option (a) confirmed. Four reasons:
1. **YAGNI on the facade.** Zero current consumers in the codebase; the facade pattern is mechanical to add later (4 file touches: new `RestClientEditorFacade.ts`, declaration in `api/types/page.d.ts`, method in `PageWrapper.ts`, walkthrough 12 / SF1 list extends to 12 facades). Deferring keeps the per-walkthrough surface minimal.
2. **`accepts` calibration matches LV10 / GR10 / LK10 / TD10** — filename 70 + content-peek 60 across **eight** Tier 5 editors maintains a coherent priority space. JSON files generated by scripts that happen to contain `"type":"rest-client"` get the switch-widget option to view as Rest Client.
3. **Minimal queue matches today's UI affordances** — no script API today wants to scroll-to-request; no per-request highlight; no progress-style UI. `{type:"focus"}` is the unique event.
4. **Documents an asymmetry deliberately.** Rest Client is the only Tier 5 editor without a facade; this is a notable but intentional gap — the Tier 5 template doesn't require a facade, only that adding one is mechanical. Future readers see: "the template is uniform, but facades are opt-in per editor based on real consumer demand."

Rejected (b) — speculative API surface; adds maintenance with no consumer. Rejected (c) — even worse for speculation. **Eighth Tier 5 editor confirmed in `accepts()` calibration alignment.** No mockup change required.

---

## Mockup adjustments

**Zero mockup changes proposed.** All ten concerns resolve at the real-code layer.

The walkthrough 20 / 21 / 22 / 23 / 24 / 25 template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) carries RestClientEditor end-to-end. Tier 5 template stability holds across the **eighth Tier 5 editor** — third non-sidebar-owning editor (after Grid and Todo) — and now also covers the **split-cache pattern** (RC7) without needing any base-class machinery: the response cache stays editor-private (`private responseCache: Record<…>` + `restoreResponseCache()` / `saveResponseCache()` methods) using the existing `host.stateStorage` API. No new framework primitive is needed because cache-file access is already a generic per-editor capability.

---

## Migration scope

Real-code only (carried to implementation):

- **New files** (two):
  - `src/renderer/editors/rest-client/RestClientEditor.ts` — `RestClientEditor` class + `RestClientEditorState` + `RestClientQueueEvent`.
  - `src/renderer/editors/rest-client/RestClientEditorView.tsx` — view shell: `<TextChrome>` + `<RestClientBody>` (no toolbar/footer contributions today).

- **Renamed / refactored files**:
  - `RestClientViewModel.ts` deletes — state shape + setters + private fields + JSON parse/serialize + request / header / formData / formDataEntry CRUD + `sendRequest` + `pasteRequest` + `responseCache` machinery all absorb into `RestClientEditor.ts`. `createRestClientViewModel` factory removed.
  - Today's `RestClientEditor.tsx` renames to `RestClientBody.tsx` — drops `useContentViewModel`, drops `useSyncExternalStore` (replaced by `model.state.use()`); `vm` prop renames to `model` throughout.
  - `RequestBuilder.tsx`, `ResponseViewer.tsx`, `KeyValueEditor.tsx` — `vm: RestClientViewModel` prop renames to `model: RestClientEditor`; method calls preserved verbatim (`vm.updateRequest(...)` → `model.updateRequest(...)`).

- **Deleted files**:
  - `RestClientViewModel.ts` (the file).

- **Edited files**:
  - `src/renderer/editors/register-editors.ts` — rest-client registration swaps from VM-based to EditorModel-based: `() => new RestClientEditor(state)`. Drops `acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent` quartet in favor of single `accepts()` per RC10.
  - `src/renderer/editors/registry.ts` — `RestClientEditor.accepts` predicate landed per RC10 sketch.
  - `src/renderer/editors/rest-client/open-in-rest-client.ts` — verbatim (resolver-only; no editor-class coupling).
  - `src/renderer/editors/rest-client/multipartBuilder.ts`, `parseClipboardRequest.ts`, `serializeRequest.ts`, `httpConstants.ts`, `restClientTypes.ts` — all verbatim (no editor-class coupling).
  - `src/renderer/content/resolvers.ts:150-153` — verbatim (the resolver dispatch to `openInRestClient` is unchanged).

- **Files NOT created**:
  - `src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts` — deferred per RC10. The eleventh facade in SF1's list stays absent.
  - `src/renderer/api/types/rest-client-editor.d.ts` — deferred per RC10. No `asRestClient(force?)` added to `page.d.ts`.

- **Persistence migration**: zero per C2 + P2. Today's `<host.id>-rest-client.txt` (selection cache) files get collected by per-editor `fs.deleteCacheFiles(editor.id)` on future dispose, or linger harmlessly per P9's no-sweep decision. Today's `<host.id>-rest-client-responses.txt` (response cache) files **survive forward verbatim** — the cache name stays the same, the host id propagates via M5/P6's `instanceId` pathway, response caches restored on first open survive transparently.

- **Touch on shared components**: none. `Splitter`, `Panel`, `Textarea`, `IconButton`, `WithMenu`, `Tree`, `TreeItem`, `IContentHost`, `TextFileModel`, trait DnD utilities, `nodeFetch`, multipart builder, clipboard parser, serializers all carry over verbatim.

---

## Closure

All ten concerns RESOLVED 2026-05-20. **Zero mockup changes.**

Final outcomes by concern:

| # | Resolution | Mockup change |
|---|------------|---------------|
| RC1 | (a) — `RestClientEditor` IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT (eighth Tier 5 editor in uniform shape) | none |
| RC2 | (a) — 2 persisted (`leftPanelWidth` + `selectedRequestId`) / 4 ride-state stripped (`data`/`error`/`response`/`responseTime`) / 2 transient (`executing` + `headersJsonInvalid`) / 3 private | none |
| RC3 | (a) — fold selection-state cache into `EditorDescriptor.state` (fifth instance: Grid GR4 → Log View LV3 → Link LK3 → Todo TD3 → Rest Client RC3) | none |
| RC4 | (a) — three-site lifecycle split: `restore()` initial parse + state subscription + `restoreResponseCache` + `adoptHost` content subscription + `dispose()` flush of BOTH `onDataChanged` + `saveResponseCache` (incidentally fixes today's lost-response-save bug) | none |
| RC5 | (a) — keep `skipNextContentUpdate` editor-private flag (fourth instance: LV6 → LK5 → TD5 → RC5; pattern rock-solid standardized) | none |
| RC6 | (a) — Rest Client is NOT sidebar-owning; RequestTree stays inline inside RestClientBody; LK7/LK8/LK9 recipe explicitly does NOT apply; third non-sidebar-owning Tier 5 editor (after Grid and Todo) | none |
| RC7 | (a) — keep response cache as separate per-editor cache file `<host.id>:rest-client-responses`; **first instance of "split cache-file consolidation by scale"** pattern; establishes guidance for future editors with mixed payload sizes | none |
| RC8 | (a) — `ui.confirm`/`ui.notify` split (view does confirms; model does notify-on-validation) preserved verbatim (same shape as TD8) | none |
| RC9 | (a) — `TraitTypeId.RestRequest` drag (emit within-tree) + `LINK` trait (accept cross-editor link drops) both preserved verbatim; LINK accept is the **canonical example** of the trait system paying its keep | none |
| RC10 | (a) — filename `.rest.json` priority 70 + content-peek priority 60; queue events `{ focus }` only; request `never`; **NO scripting facade** — Rest Client stays the only text-bearing Tier 5 editor without a facade (deferred per YAGNI) | none |

**Tier 5 template confirmed on the eighth Tier 5 editor — third non-sidebar-owning (after Grid and Todo).** Walkthroughs 20 / 21 / 22 / 23 / 24 / 25 set the template on Monaco (complex) → Grid (medium) → Preview group (light) → LogView (append-only) → Link (sidebar-owning) → Todo (non-sidebar-owning with inline left panel); this walkthrough confirms it carries cleanly on a **non-sidebar-owning content-view editor with inline left panel + async HTTP execution lifecycle + dual-cache storage**, while also introducing the split-cache pattern as natural editor-internal policy (no framework changes needed).

**Cross-walkthrough cleanups landed by this walkthrough:**

- **RC3** — **fifth instance** of "per-editor cache file → descriptor.state" consolidation (Grid GR4 → Log View LV3 → Link LK3 → Todo TD3 → Rest Client RC3). Pattern is now standardized across **five of seven** persisted-Tier-5 editors; the next text-bearing editors (Notebook embedded editors, Graph if it adopts a host, Draw if it adopts a host) should default to this pattern without re-litigation.
- **RC5** — **fourth instance** of "self-write guard" pattern (Log View LV6 → Link LK5 → Todo TD5 → Rest Client RC5). Pattern is now rock-solid standardized across all mutate-then-serialize editors. The host-side `bySelf` parameter (option b) and TOneState change-reason tracking (option c) are now both retired as future-rejected paths.
- **RC7** — **first instance** of "split cache-file consolidation by scale" pattern. Documents guidance for future editors with mixed payload sizes: *write your selection state to the descriptor; write your bulk payload state to a per-editor cache file keyed by host id.* Likely future consumers: Notebook (per-cell outputs), Graph (simulation snapshots if cached).
- **RC2 / RC3** — `leftPanelWidth` silent today-bug incidentally fixed by descriptor consolidation (**third instance** of this incidental fix after Link LK2 / Todo TD2). The pattern: any field that lives on VM-state-but-never-persisted gets a free persistence upgrade when descriptor folding runs.
- **RC4** — `saveResponseCache` flush incidentally added to dispose path; fixes a subtle today-bug where pending response-cache writes within the 500ms debounce window were dropped on page close.

**Implementation notes carried forward:**

- The Tier 5 class repetition count grows to **eight editors** with the same ~80-LOC skeleton (Monaco / Grid / Markdown / Mermaid / LogView / Link / Todo / RestClient all carry an identical CONTENT_HOST_TRAIT closure + adoptHost + switchFrom + restore + dispose shape). PV1's "re-evaluate after walkthroughs 23–29" recommendation continues to apply — yet one more data point in the "common surface might be extractable" direction; the actual call still belongs after all text-bearing editors land.
- RestClientEditor's class name finalizes as `RestClientEditor` (matching Tier 5 naming: MonacoEditor, GridEditor, MarkdownEditor, LogViewEditor, LinkEditor, TodoEditor). Today's `RestClientEditor.tsx` React component file renames to `RestClientBody.tsx` per the Tier 5 template.
- Today's `selectionRestored` one-shot flag retires entirely — **third instance of this retirement** (after Link LK3 and Todo TD3); confirms the pattern is fully general — any "one-shot async cache restore" guard retires when its cache file folds into descriptor.
- Override count: 9 hooks (same as Todo; vs. Link's 11). Confirms the two-hook delta (`beforeNavigateAway` + `onMainEditorChanged`) is the entire architectural difference between sidebar-owning and non-sidebar-owning Tier 5 editors. The 8/8 hook stability across Grid / Todo / RestClient documents pay-only-when-used as a **structural** property, not an implementation detail.
- **Scripting facade asymmetry documented.** Rest Client stays the only text-bearing Tier 5 editor without a `XxxEditorFacade.ts` + `asX()` accessor. This is intentional (YAGNI; zero current consumers); the Tier 5 template doesn't require a facade, only that adding one is mechanical (4 file touches). Future readers see: "the editor template is uniform, but facades are opt-in per editor based on real consumer demand."
- **Async HTTP execution lifecycle (sendRequest)** carries verbatim under EPIC-028 — `nodeFetch`, binary file streaming via `fs.createReadStream`, multipart builder dynamic-import, base64 binary response encoding, `responseCache` in-memory write + debounced disk persistence with binary-exclusion gate. The host-split doesn't touch this surface; `sendRequest` becomes an `editor.sendRequest()` method on `RestClientEditor` (was `vm.sendRequest()`). Setting demonstrates that significant editor-internal async lifecycles fit cleanly inside the Tier 5 template without framework support beyond the existing CONTENT_HOST_TRAIT shape.

**Walkthrough 27 (Graph) is next** — own-state editor with force-graph simulation, multiple sub-models, and no `IContentHost` (Graph reads its own `.graph.json` directly today, not via TextFileModel). Pre-check needed to determine whether Graph follows the no-host topology (would land in walkthrough 30's no-host group) or has retrofitted a TextFileModel host since EPIC-012's content-pipe rollout. If host-backed, Graph would become the **ninth Tier 5 editor** in the uniform shape and a possible second consumer of RC7's split-cache pattern (simulation snapshots could ride the bulk-payload cache file).
