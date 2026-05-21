# Grid editor walkthrough

> **Status:** Done 2026-05-20. First non-Monaco exercise of the Tier 5 template — confirms the template holds. All ten concerns (GR1–GR10) RESOLVED. **Zero mockup changes** — Grid fits the walkthrough 20 template end-to-end. Three registry ids (`grid-json` / `grid-csv` / `grid-jsonl`) sharing one `GridEditor` class with a constructor-bound format discriminator.

Walkthrough 21 finalizes the `GridEditor` subclass: the EditorModel that wraps a `TextFileModel` content host and renders tabular data via AVGrid. Grid is registered under three ids today (`grid-json`, `grid-csv`, `grid-jsonl`) because it serializes the same in-memory row shape to three different on-disk formats. After EPIC-028 the variant moves from a `host.state.editor` read into an editor-side constant — every variant-aware parsing / serialization decision flips from "what did the host record as the editor?" to "what is my editorId?"

---

## State today

`src/renderer/editors/grid/` houses **six** files implementing today's Grid editor:

| File | Role |
|------|------|
| `GridViewModel.ts` | `GridViewModel extends ContentViewModel<GridViewState>` — wraps an `AVGridModel<any>` instance via `gridRef`, exposes setFocus / setSearch / clearSearch / setFilters / editRow / onAddRows / onAddColumns / onDeleteRows / onDeleteColumns / setColumns / setDelimiter / toggleWithColumns / onDataChanged / onGetOptions. `onInit` runs initial content load, CSV delimiter detection (for `grid-csv` only), restoreState (async). |
| `GridEditor.tsx` | `GridEditor({ model })` — reads `host.state.get().editor` to discriminate variant, calls `useContentViewModel<GridViewModel>(model, editorId)`, renders `<AVGrid>` inside `<FiltersProvider>` + `<FilterBar>`. Portal-renders toolbar contributions (search box + columns button + csv-options button) into `model.editorToolbarRefFirst/Last`, footer record-count into `model.editorFooterRefLast`. |
| `index.ts` | Re-exports `GridEditor`, `GridPage` (backward-compat alias), `GridViewModel`, `createGridViewModel`, `defaultGridViewState`. Plus `idColumnKey`, `getRowKey`, etc. |
| `utils/grid-utils.ts` | Pure helpers — `createIdColumn`, `removeIdColumn`, `getGridDataWithColumns`, `nextColumnKeys`, `idColumnKey`. View/model-agnostic. Unchanged. |
| `components/ColumnsOptions.tsx` | Popover for column rename / hide / reorder. Imperative `showColumnsOptions(anchor, gridRef, isCsv, onUpdateRows)` API. Unchanged. |
| `components/CsvOptions.tsx` | Popover for CSV delimiter + header-row toggle. Imperative `showCsvOptions(anchor, vm)` API. Unchanged. |

### Today's view-model state shape (`GridViewState`)

```typescript
type GridViewState = {
    columns: Column[];        // structural — persisted
    rows: any[];              // derived from host.state.content + columns; NOT persisted
    focus: CellFocus | undefined;       // persisted (row/col index pair)
    search: string;                     // persisted
    filters: TFilter[];                 // persisted
    csvDelimiter: string;               // persisted (grid-csv only)
    csvWithColumns: boolean;            // persisted (grid-csv only)
    error: string | undefined;          // view-derived; NOT persisted
};
```

Plus `gridRef.state.sortColumn` (lives on the AVGridModel, not on GridViewState) — persisted via a peek inside `saveState()`.

### Today's per-editor surface

- **Variant discriminator** — read at three call sites inside GridViewModel (`detectCsvDelimiter`, `parseContent`, `getContentToSave`) via `this.host.state.get().editor`. After S10 the host has no `editor` field; the variant must come from elsewhere.
- **Cache file** — GridViewModel.saveState writes `<host.id>-grid-page.json` via `host.stateStorage.setState(host.id, "grid-page", JSON.stringify(...))`; restoreState reads it back. The file holds the persisted GridViewState fields plus sortColumn from gridRef. Three Grid editors share the same cache file because they share the same host (a `TextFileModel`).
- **gridRef binding** — view passes `ref={vm.setGridRef}` to `<AVGrid>`; vm caches it, calls `vm.gridRef.models.focus.focusCell(r, c)` for restore-time focus and `vm.gridRef.state.update(s => s.sortColumn = …)` for sortColumn restore. Save reads `vm.gridRef.state.get().sortColumn`.
- **Portal refs** (`editorToolbarRefFirst/Last`, `editorFooterRefLast`) — relocated to React composition per C8 / walkthroughs 09–10.
- **`useContentViewModel(model, editorId)`** — ref-counted view-model acquire/release machinery — retires entirely under SF2.
- **`pagesModel.onFocus` subscription** — restores grid scroll position after page focus.

---

## State after refactor

One class **with three registrations** replaces the today-flat GridViewModel + GridEditor pair. `TextFileModel` stays the host across all three variants.

### `GridEditor` (editor) — **new class introduced by this walkthrough**

```typescript
type GridFormat = "json" | "csv" | "jsonl";

class GridEditor extends EditorModel<GridEditorState, void, GridQueueEvent, GridQueueRequest> {
    readonly editorId: "grid-json" | "grid-csv" | "grid-jsonl";
    readonly format: GridFormat;

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;

    constructor(state: TComponentState<GridEditorState>, editorId: GridEditor["editorId"]) {
        super(state);
        this.editorId = editorId;
        this.format = formatFromEditorId(editorId);  // "grid-json" → "json", etc.
        this.traits.set(CONTENT_HOST_TRAIT, {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from GridEditor");
                this._hostStateUnsub?.();
                this._hostContentUnsub?.();
                this._hostStateUnsub = null;
                this._hostContentUnsub = null;
                this._host = null;
                return host;
            },
        });
    }

    // ── Required base overrides ─────────────────────────────────────────

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

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            ...super.getRestoreData(),
            // Strip view-derived fields (rows, error) — re-derived on restore.
            state: {
                id: s.id,
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
                columns: s.columns,
                focus: s.focus,
                search: s.search,
                filters: s.filters,
                sortColumn: s.sortColumn,
                csvDelimiter: s.csvDelimiter,
                csvWithColumns: s.csvWithColumns,
            },
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<GridEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
            if (data.columns !== undefined) cur.columns = data.columns;
            if (data.focus !== undefined) cur.focus = data.focus;
            if (data.search !== undefined) cur.search = data.search;
            if (data.filters !== undefined) cur.filters = data.filters;
            if (data.sortColumn !== undefined) cur.sortColumn = data.sortColumn;
            if (data.csvDelimiter !== undefined) cur.csvDelimiter = data.csvDelimiter;
            if (data.csvWithColumns !== undefined) cur.csvWithColumns = data.csvWithColumns;
        });
        if (data.host) {
            this._pendingHost = data.host;
        }
    }

    // ── Three-phase lifecycle ───────────────────────────────────────────

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

            // Variant-aware bootstrap: CSV delimiter detection runs once after
            // host content loads (GR7). Skipped if the user already saved a
            // chosen delimiter via the CsvOptions popover.
            if (this.format === "csv") {
                const s = this.state.get();
                const content = this._host.state.get().content ?? "";
                if (!s.csvDelimiter || s.csvDelimiter === ",") {
                    const detected = detectCsvDelimiter(content);
                    if (detected !== s.csvDelimiter) {
                        this.state.update((x) => { x.csvDelimiter = detected; });
                    }
                }
            }
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Grid editor.", "error");
            this._host = new TextFileModel();
            this._host.setStorage(this.stateStorage);
            this.adoptHost(this._host);
        }
    }

    // ── Host adoption (shared between switchFrom + restore) ─────────────

    private adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        // descriptorChanged forwarder — page-level persistence debounce.
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send());
        // Content-change forwarder — re-parse rows when host content mutates
        // (script API write, encryption decrypt, content pipe refresh).
        this._hostContentUnsub = host.state.subscribe(
            (content) => this.reparseRows(content),
            (s) => s.content,
        );
        const { filePath, title } = host.state.get() as any;
        if (title || filePath) {
            this.state.update((s) => {
                s.title = title ?? (filePath ? fpBasename(filePath) : "");
            });
        }
    }

    // ── Data mutation API (replaces today's GridViewModel methods) ──────

    editRow(columnKey: string, rowKey: string, value: any): void { /* ... */ }
    onAddRows(count: number, insertIndex?: number): any[] { /* ... */ }
    onDeleteRows(rowKeys: string[]): void { /* ... */ }
    setColumns(columns: SetStateAction<Column[]>): void { /* ... */ }
    onAddColumns(count: number, insertBeforeKey?: string): Column[] { /* ... */ }
    onDeleteColumns(columnKeys: (keyof any | string)[]): void { /* ... */ }
    setFocus(focus?: SetStateAction<CellFocus | undefined>): void { /* ... */ }
    setSearch(search: string): void { /* ... */ }
    clearSearch(): void { /* ... */ }
    setFilters(value: SetStateAction<TFilter[]>): void { /* ... */ }
    setDelimiter(d: string): void { /* ... */ }
    toggleWithColumns(): void { /* ... */ }
    onUpdateRows(updateFunc: (rows: any[]) => any[]): void { /* ... */ }
    onGetOptions: TOnGetFilterOptions = (...) => { /* ... */ };

    // ── Serialization (variant-aware via this.format) ───────────────────

    private getContentToSave(): string {
        switch (this.format) {
            case "csv":   return this.getCsvContent();
            case "jsonl": return this.getJsonlContent();
            case "json":  return this.getJsonContent();
        }
    }

    onDataChanged(): void {
        const content = this.getContentToSave();
        this._changedContent = content;
        this._host?.changeContent(content, true);
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
        // No per-editor cache file — grid state rides EditorDescriptor.state
        // in openFiles.txt (GR4).
    }

    async dispose(): Promise<void> {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

### `GridEditorState`

```typescript
interface GridEditorState extends EditorStateBase {
    // Structural — persisted.
    columns: Column[];
    focus: CellFocus | undefined;
    search: string;
    filters: TFilter[];
    sortColumn: SortColumn | undefined;
    csvDelimiter: string;       // grid-csv only; ignored for json/jsonl
    csvWithColumns: boolean;    // grid-csv only

    // View-derived — present on state for reactive reads from <GridBody>,
    // stripped from getRestoreData per GR4.
    rows: any[];
    error: string | undefined;
}
```

What lives **on the editor**:
- Identity (`id`, `title`, `modified`, `secondaryEditor`).
- All Grid-specific UI state — columns / focus / search / filters / sortColumn / CSV options.
- Derived rows / error — view subscribes via `state.use`.
- `_changedContent: string` — re-entry guard (avoid re-parsing what we just serialized).
- `maxRowId: number` — sentinel for new-row id generation (carried verbatim from today).

What lives **on the host (`TextFileModel`)**:
- All content + file metadata (unchanged from Monaco walkthrough).
- All file I/O, encryption, script panel, actions submodels.

### Queue event + request unions

```typescript
type GridQueueEvent =
    | { type: "focus" }
    | { type: "focusCell"; row: number; col: number };

type GridQueueRequest = never;  // No view-context queries — gridRef state
                                // rides editor.state via two-way sync (GR5).
```

`GridEditor` exposes typed wrappers:

```typescript
focusEditor(): void { this.queue.send({ type: "focus" }); }
focusCell(row: number, col: number): void { this.queue.send({ type: "focusCell", row, col }); }
```

The base class's `focus(): void` no-op (MO7) is overridden to send `{type: "focus"}`. The view's queue handler calls `gridRef.focusGrid()`.

`focusCell` is the queue replacement for today's restoreState `setTimeout(() => gridRef.models.focus.focusCell(...))` — fires once on restore, queue.send buffers it until the view mounts and registers the handler.

---

## UI shape

```
<TextChrome model={gridEditor}>            ← walkthrough 10 / TC3
    <GridBody model={gridEditor} />        ← THIS walkthrough — AVGrid + FilterBar
</TextChrome>
```

### `GridBody` view (replaces today's `GridEditor.tsx` + `GridViewModel.onInit`)

```typescript
function GridBody({ model }: { model: GridEditor }) {
    const gridRef = useRef<AVGridModel<any> | null>(null);
    const editorConfig = useEditorConfig();
    const host = model.contentHost as TextFileModel | null;

    const state = model.state.use((s) => ({
        columns: s.columns,
        rows: s.rows,
        focus: s.focus,
        search: s.search,
        filters: s.filters,
        error: s.error,
    }));

    // ── Drain fire-and-forget events ────────────────────────────────────
    model.queue.use((ev) => {
        const g = gridRef.current;
        if (!g) return;
        switch (ev.type) {
            case "focus":
                g.focusGrid();
                break;
            case "focusCell":
                g.models.focus.focusCell(ev.row, ev.col, true);
                break;
        }
    });

    // ── Auto-focus on mount (unless disabled by editor config) ──────────
    useEffect(() => {
        if (!editorConfig.disableAutoFocus) gridRef.current?.focusGrid();
    }, []);

    // ── Page-focus → restore scroll (GR3 — was pagesModel.onFocus sub) ──
    useEffect(() => {
        const sub = pagesModel.onFocus.subscribe((page) => {
            if (page === host) {
                Promise.resolve().then(() => gridRef.current?.renderModel?.restoreScroll());
            }
        });
        return () => sub.unsubscribe();
    }, [host]);

    // ── Two-way sortColumn sync (GR5) ───────────────────────────────────
    const setGridRef = useCallback((ref: AVGridModel<any> | null) => {
        gridRef.current = ref;
        if (!ref) return;
        // 1. Editor → gridRef: write saved sortColumn to gridRef on mount.
        const saved = model.state.get().sortColumn;
        if (saved) ref.state.update((s) => { s.sortColumn = saved; });
        // 2. gridRef → editor: forward sortColumn changes to editor state.
        ref.state.subscribe((sortColumn) => {
            model.state.update((s) => { s.sortColumn = sortColumn; });
        }, (s) => s.sortColumn);
    }, [model]);

    if (!host) return null;
    if (state.error) return <EditorError>{state.error}</EditorError>;

    return (
        <Panel name="grid-editor-root" direction="column" flex={1} position="relative"
               height={editorConfig.maxEditorHeight !== undefined ? "fit-content" : 200}>
            <FiltersProvider filters={state.filters} setFilters={model.setFilters}
                             onGetOptions={model.onGetOptions}>
                <FilterBar gridModel={gridRef.current} />
                <AVGrid
                    ref={setGridRef}
                    columns={state.columns}
                    rows={state.rows}
                    getRowKey={getRowKey}
                    focus={state.focus}
                    setFocus={model.setFocus}
                    searchString={state.search}
                    highlightString={editorConfig.highlightText}
                    filters={state.filters}
                    editRow={model.editRow}
                    onAddRows={model.onAddRows}
                    setColumns={model.setColumns}
                    onAddColumns={model.onAddColumns}
                    onDeleteRows={model.onDeleteRows}
                    onDeleteColumns={model.onDeleteColumns}
                    onDataChanged={model.onDataChanged}
                    growToHeight={editorConfig.maxEditorHeight}
                />
            </FiltersProvider>
        </Panel>
    );
}
```

### Wrap-up: full editor view

```typescript
// src/renderer/editors/grid/index.ts
export const gridJsonModule: EditorModule = {
    createEditor: () => new GridEditor(new TComponentState({ ...defaultGridEditorState }), "grid-json"),
    Component: GridEditorView,
};
export const gridCsvModule: EditorModule  = { createEditor: () => new GridEditor(..., "grid-csv"),  Component: GridEditorView };
export const gridJsonlModule: EditorModule = { createEditor: () => new GridEditor(..., "grid-jsonl"), Component: GridEditorView };

function GridEditorView({ model }: { model: GridEditor }) {
    // Toolbar contributions live here so the view can inline them as
    // <PageToolbar> children (walkthroughs 09 + 10 retired the portal refs).
    return (
        <TextChrome model={model}
                    toolbarContributions={<GridToolbarBits model={model} />}
                    footerContributions={<GridFooter model={model} />}>
            <GridBody model={model} />
        </TextChrome>
    );
}
```

`GridToolbarBits` renders the Search input + Columns button + (for csv) CsvOptions button — same JSX as today, just inline children instead of portals.

`GridFooter` renders the `<span className="records-count">{model.recordsCount}</span>` — same shape, inline.

### `accepts()` (registry)

```typescript
// grid-json:
accepts({ host, fileName, language, mode }: AcceptanceInput): number {
    if (host) {
        const content = host.state.get().content;
        if (content && looksLikeJsonArray(content)) return 70;  // content peek
        return -1;
    }
    if (fileName) {
        if (/\.(grid\.)?json$/i.test(fileName) && !isSpecializedJson(fileName)) return 70;
        return -1;
    }
    return -1;
}

// grid-csv:
accepts({ host, fileName, language, mode }): number {
    if (host) {
        const content = host.state.get().content;
        if (content && looksLikeCsv(content)) return 70;
        return -1;
    }
    if (fileName && /\.csv$/i.test(fileName)) return 80;
    return -1;
}

// grid-jsonl:
accepts({ host, fileName, language, mode }): number {
    if (host) {
        const content = host.state.get().content;
        if (content && looksLikeJsonl(content)) return 70;
        return -1;
    }
    if (fileName && /\.(jsonl|ndjson)$/i.test(fileName)) return 80;
    return -1;
}
```

Specific extensions outrank Monaco's universal-text floor (50 per walkthrough 20's `accepts()` sketch). Content peeks let the switch widget surface Grid as an option even when the file is a `.txt` with JSON-array content.

---

## Switch in / out

### Switch in via `switchFrom(oldEditor)`

Identical to Monaco's walkthrough 20 pattern. Three notes specific to Grid:

1. **Format discriminator survives the swap because it's class-baked.** No discriminator read from host state; the format comes from `this.format` which was set at construction time (one of three registry factories).
2. **CSV delimiter detection runs only on `restore()`, not `switchFrom`.** When a user switches Monaco JSON → Grid CSV (rare; manual `accepts()` choice), the `switchFrom` path completes synchronously without delimiter detection. The detection logic moves into the variant-aware `restore()` bootstrap path. switchFrom-into-csv from a non-csv source still triggers a re-detection because switchFrom is followed by `restore()` which has the CSV bootstrap check.
3. **`rows` re-derive automatically.** `adoptHost` subscribes `_hostContentUnsub` to host's content slice; the first emission triggers `reparseRows(content)` which fills `state.rows`. No explicit "load initial content" call inside switchFrom.

### Switch OUT

When the user switches Grid → Markdown (or any other text-bearing editor), the new editor calls `oldGridEditor.traits.get(CONTENT_HOST_TRAIT).extractContentHost()`. The trait closure in GridEditor's constructor:

1. Asserts `_host !== null`.
2. Unsubscribes `_hostStateUnsub` (descriptorChanged forwarder) and `_hostContentUnsub` (reparse trigger).
3. Nulls out `_host`.
4. Returns the host to the new editor.

Then `PageModel.setMainEditor` calls `oldGridEditor.dispose()`. Inside dispose:
- Both unsubs already null (no-op).
- `_host` is null — `host.dispose()` skipped.
- `queue.dispose()` drains pending events (queue.execute is `never` for Grid — no pending requests to reject).

### `dispose()` — Grid dies, host comes with it

When the user closes the tab without switching, `PageModel.dispose` iterates editors:
- `GridEditor.dispose()` runs. `_host !== null` → `await this._host.dispose()` cleans up host's IO watch / script debounce / pipe.
- Page then calls `fs.deleteCacheFiles(gridEditor.id)` per C9 — wipes `<id>-host.txt`, `<id>-script-panel.json`. **No `<id>-grid-page.json` to wipe** (folded into descriptor per GR4).

---

## Lifecycle hooks

| Hook | Override? | Behavior |
|------|-----------|----------|
| `applyRestoreData(data)` | ✅ | Apply persisted GridEditorState fields; stash `data.host` on `_pendingHost`. No `revealLine` / `highlightText` carry (Grid doesn't use those). |
| `switchFrom(old)` | ✅ | Extract host via `CONTENT_HOST_TRAIT`; copy id; rebind storage; adoptHost. |
| `restore()` | ✅ | Build host or adopt; subscribe to host content for row reparsing; variant-aware bootstrap (CSV delimiter detection). |
| `saveState()` | ✅ | Delegate to `host.io.saveState()`. No per-editor cache file write (GR4). |
| `beforeNavigateAway(newModel)` | ❌ inherit | Base clears `secondaryEditor`. No Grid-specific panel contributions. |
| `onMainEditorChanged(newMain)` | ❌ inherit | No-op. |
| `confirmRelease(closing)` | ✅ | Delegate to `host.actions.confirmRelease(closing)`. Same as Monaco. |
| `isFreshEmpty()` | ❌ inherit | Default false. Grid never qualifies for the `closeFirstPageIfEmpty` heuristic (Monaco-only — L1). |
| `getNavigatorTarget()` | ✅ | PT5 / B3 — host's `{ pipe, filePath }`. Same shape as Monaco. |
| `hasTextSelection()` | ❌ inherit | Returns undefined. Run-all-script auto-hides (PT7). Grid cell-selection isn't "text selection" for script purposes. |
| `findCompatibleEditors()` | ✅ | `editorRegistry.findEditorsAccepting(this._host)`. |
| `getRestoreData()` | ✅ | Strip view-derived `rows` / `error`; include all structural state slices. |
| `getIcon` / `noLanguage` | ❌ inherit | No custom icon; language picker stays visible. |
| `focus()` | ✅ | `this.queue.send({ type: "focus" })` — view handler calls `gridRef.focusGrid()`. |
| `dispose()` | ✅ | Unsubscribe both host forwarders; dispose host iff still owned; super drains queue. |

---

## Persistence

### `getRestoreData()` output shape

```typescript
{
    editorId: "grid-csv",          // (or "grid-json" / "grid-jsonl")
    id: "<uuid>",
    state: {
        title, modified, secondaryEditor,
        columns,                   // Column[] — structural; ~5-30 entries
        focus,                     // { selection: { rowEnd, colEnd } } | undefined
        search,                    // string
        filters,                   // TFilter[]
        sortColumn,                // SortColumn | undefined
        csvDelimiter,              // string (grid-csv only)
        csvWithColumns,            // boolean (grid-csv only)
        // rows, error — stripped (view-derived)
    },
    host: {                        // TextFileModel.getDescriptor()
        kind: "textFile",
        state: { id, content: "", language, filePath, modified, encoding, encrypted, temp },
        pipe: { provider, transformers, encoding },
    },
}
```

**Content stays in the cache file** (`<editor.id>-host.txt`) per M9. Grid editor state rides the openFiles.txt blob — the per-editor `<id>-grid-page.json` cache file is **eliminated** (GR4).

Payload size: columns + filters + focus + search + sort + csv options — typically <2KB per Grid. Within M9's metadata-only budget.

### `applyRestoreData(data)` consumption

Two paths converge:

1. **Open-file flow**: caller passes `{ host: { kind: "textFile", state: { filePath }, pipe } }`. `restore()` builds the host, reads content from pipe. Grid bootstrap picks a CSV delimiter from the loaded content (if format=csv); columns / focus / etc. start empty.

2. **Session-restore**: caller passes the full persisted state + saved host descriptor. `restore()` builds the host via `TextFileModel.fromDescriptor(desc)`, reads cache file. Columns / focus / etc. restore verbatim from the saved blob. CSV delimiter bootstrap is a no-op (already-saved value matches detection).

### Migration from today's format

Per C2: no migration shim. Walkthrough 04 / P2 detects-and-starts-empty for old schemas. Within walkthrough 21's scope: no code translates today's `<id>-grid-page.json` cache file into the new descriptor shape — the file is orphaned on first boot post-upgrade and eventually cleaned up by per-editor `fs.deleteCacheFiles(id)` calls.

---

## Scripting

### `GridEditorFacade` collapse

Per SF1 + SF6 — today's `GridEditorFacade` wraps a `GridViewModel`. After EPIC-028 it wraps a `GridEditor` directly. No queue request methods needed (Grid's `GridQueueRequest = never`); all script-facing methods read editor state synchronously or call mutators that go through `model.state.update(...)`.

```typescript
class GridEditorFacade {
    constructor(private readonly editor: GridEditor) {}

    get columns():       Column[]              { return this.editor.state.get().columns; }
    get rows():          any[]                 { return this.editor.state.get().rows; }
    get sortColumn():    SortColumn | undefined { return this.editor.state.get().sortColumn; }

    setColumns(cols: Column[]):     void       { this.editor.setColumns(cols); }
    addRows(count: number):         any[]      { return this.editor.onAddRows(count); }
    deleteRows(keys: string[]):     void       { this.editor.onDeleteRows(keys); }
    addColumns(count: number):      Column[]   { return this.editor.onAddColumns(count); }
    deleteColumns(keys: string[]):  void       { this.editor.onDeleteColumns(keys); }
    editCell(col: string, row: string, value: any): void { this.editor.editRow(col, row, value); }
    setFilters(filters: TFilter[]): void       { this.editor.setFilters(filters); }
    focusCell(row: number, col: number): void  { this.editor.focusCell(row, col); }
}
```

All sync. Script authors don't need to add `await` calls for Grid (unlike Monaco's `getSelectedText` per SF6).

### `page.asGrid(force?: boolean)`

Per SF1 — `force=true` triggers `page.switchMainEditor(target)` where target is the first Grid registration in `findCompatibleEditors()`. Heuristic: if the host content is CSV-shaped, pick `grid-csv`; otherwise `grid-json`. Real-code TBD; the facade-level mechanism is already pinned by SF1.

---

## Concerns

### GR1 — Variant handling: one class with three registrations, three subclasses, or registry-driven discriminator?

Today: `GridEditor` (the React component) reads `host.state.get().editor` to discriminate `grid-json` / `grid-csv` / `grid-jsonl`. One class shared across all three; one cache file. After S10 the `host.state.editor` field is gone.

Three candidates:

(a) **One class with constructor-bound editorId** — `class GridEditor extends EditorModel { readonly editorId: GridIds; readonly format: GridFormat; constructor(state, editorId) { this.editorId = editorId; this.format = formatFromEditorId(editorId); } }`. Three factories register three ids; each factory calls `new GridEditor(state, "grid-csv")`. Variant lives as instance fields, not state.

(b) **Three subclasses** — `class GridJsonEditor extends GridEditorBase { readonly editorId = "grid-json"; readonly format = "json" as const; }` and two siblings. Base class holds all shared logic. Three factories trivially construct each. Variant lives in class identity.

(c) **One class with format-on-state** — `class GridEditor extends EditorModel { readonly editorId = "grid"; }` (single registration), `state.format: "json"|"csv"|"jsonl"`. Drops the three-id model entirely. Requires registry/UX changes — the switch widget surfaces one "Grid" entry that picks a sub-format separately.

**RESOLVED 2026-05-20** — Option (a) confirmed. The format discriminator is an immutable per-instance fact, set at registration time, never changes during the editor's lifetime. Class-baked `format` field reads as `this.format` everywhere — replaces today's `this.host.state.get().editor` three sites verbatim. Rejected (b) three subclasses (adds three class definitions for what amounts to one constant difference; shared-base pattern carries no real ergonomic win since there's no override-able behavior between the three variants); rejected (c) single-id-with-format-on-state (collapses three registry ids into one — breaks the switch widget UX where users see three distinct "Grid (JSON) / Grid (CSV) / Grid (JSONL)" options; changes user-facing surface; forces a script-API migration unmotivated by anything in EPIC-028). The `editorId` field on EditorModel is `abstract readonly` per `mockups/EditorModel.ts:53` — assigning in constructor is permitted by TypeScript's readonly-in-constructor rule. No mockup change required.

### GR2 — Variant discriminator readout sites: where today's `this.host.state.get().editor` reads relocate

Today: three sites in `GridViewModel.ts` read `this.host.state.get().editor`:
- `detectCsvDelimiter` (line 131) — early-return if not `grid-csv`.
- `parseContent` (line 222) — switch on `grid-csv` / `grid-jsonl` / default(`grid-json`).
- `getContentToSave` (line 350) — switch on `grid-csv` / `grid-jsonl` / default(`grid-json`).

After GR1 (a), the readouts flip from host-state reads to editor instance-field reads.

Two candidates:

(a) **Read `this.format`** — class-baked field set in constructor (`"json"` / `"csv"` / `"jsonl"`). Cleanest; semantic-only word ("json") rather than the registry-keyed "grid-json".

(b) **Read `this.editorId`** — registry id direct (`"grid-json"` / `"grid-csv"` / `"grid-jsonl"`). One less helper; verbatim use of the registry key.

**RESOLVED 2026-05-20** — Option (a) confirmed. The format word (`"json"` / `"csv"` / `"jsonl"`) is the semantic discriminator; the registry id (`"grid-json"` / `"grid-csv"` / `"grid-jsonl"`) is a registry-identity prefix. Decoupling them lets the registry-id format change without rewriting parsing/serialization sites. `formatFromEditorId(id: GridIds): GridFormat` is a tiny pure function in `src/renderer/editors/grid/util.ts`; constructor calls it once. The three switch statements read `switch (this.format)` instead of `switch (this.editorId)`. Rejected (b) `this.editorId` direct (saves a helper at the cost of locking the parsing/serialization sites to registry id prefix forever). No mockup change required.

### GR3 — GridViewModel dissolution: where do `onInit` / `pageFocused` / `restoreState` go?

Today: `GridViewModel.onInit` does:
1. Subscribe to `state.subscribe → saveStateDebounced` (persistence trigger).
2. Subscribe to `pagesModel.onFocus → pageFocused` (scroll restore).
3. Watch own state for `csvDelimiter` / `csvWithColumns` changes → reload (line 65-72).
4. Read initial content; detect CSV delimiter; loadGridData.
5. Call restoreState() async.

Plus `onContentChanged(content)` (line 84) — host content changes trigger row re-parse.

`onDispose` flushes pending save (line 91).

After ContentViewModelHost retires (SF2):

(a) **Inline in `GridEditor.restore()` + `GridBody.tsx` useEffects** — restore-time work (1 + 4 + 5) lives in the editor's async `restore`; view-time work (2 — scroll restore) lives in `GridBody` useEffect; content-change subscription (`onContentChanged`) becomes `_hostContentUnsub` inside `adoptHost`. Self-state-watch for csv option changes (3) becomes an editor-state subscription set up at construction.

(b) **A view-private controller class** — mirrors today's GridViewModel shape minus the ContentViewModel parent. Symmetry with today.

(c) **Methods on `GridEditor`** — including `pageFocused` and `restoreState`. But pageFocused reads gridRef which is view-local; can't live on the model.

**RESOLVED 2026-05-20** — Option (a) confirmed. Same shape as MO2's resolution for Monaco: each setup piece picks its natural home — model-side init for state-only work (content reparse, csv delimiter detection, debounce-save), view-side useEffect for view-local work (scroll restore, mount focus). The today-`GridViewModel.onInit` body splits across three call sites in the new code:
- **`GridEditor.restore()`**: variant-aware bootstrap (CSV delimiter detection after host content loads per GR7); reparse rows from current content.
- **`GridEditor` constructor / adoptHost**: subscribe `_hostContentUnsub` (host content → reparseRows); subscribe `_csvOptionsUnsub` (csvDelimiter / csvWithColumns slice → reparseRows). Self-state-watch (3) becomes a slice subscription via `state.subscribe(handler, selector)` from N1.
- **`GridBody.tsx` useEffect**: `pagesModel.onFocus.subscribe` for scroll restore; mount-time focus call.

`saveStateDebounced` retires entirely — the editor's `descriptorChanged.send()` fires on every state mutation (the `_hostStateUnsub` handler in adoptHost forwards host changes; editor's own state.subscribe forwards editor changes), the window-level persistence layer debounces per P3. Rejected (b) view-private controller class (re-creates the GridViewModel pattern just to be similar; no model-side observers benefit) and (c) editor-side `pageFocused` method (gridRef is view-local and can't live on the model). No mockup change required.

### GR4 — Grid state persistence: per-editor cache file or fold into descriptor?

Today: GridViewModel writes `<host.id>-grid-page.json` via `host.stateStorage.setState(host.id, "grid-page", JSON.stringify(stateToSave))`. The blob holds columns / focus / search / filters / sortColumn / csvDelimiter / csvWithColumns. 300ms debounced inside the VM.

Under EPIC-028's unified descriptor model (walkthrough 04 / P1 / P6), each editor's state slice rides `EditorDescriptor.state`. The window-level persistence (`PagesPersistenceModel.saveState`) writes openFiles.txt at 500ms cadence per P3.

Three candidates:

(a) **Fold into descriptor** — Drop the `<id>-grid-page.json` cache file. Grid state lives entirely in `EditorDescriptor.state` (the openFiles.txt blob). View-derived `rows` / `error` stripped via getRestoreData (already pattern from MO5).

(b) **Keep cache file** — `<editor.id>-grid.json` per C9's naming. EditorDescriptor.state only carries minimal identity (title/modified/secondaryEditor). Larger Grid state stays in the cache file (separate I/O cadence, doesn't bloat the window-level blob).

(c) **Hybrid** — Frequently-changing fields (focus, search) in descriptor; rarely-changing (columns) in cache file. Splits persistence machinery without obvious benefit.

**RESOLVED 2026-05-20** — Option (a) confirmed. Grid's structural state is small — columns are 5–30 entries with ~5 fields each (~3KB per column array worst case); filters are small; focus/search/sort are tiny. M9's payload budget (~50KB per page worst case) covers it with room to spare. Eliminating the cache file simplifies the dispose path (one less `<id>-grid-page.json` to wipe) and unifies the persistence story across all editors that have non-content state: editor state lives in descriptor, host content lives in cache file. Today's separate cache file existed because GridViewModel was a transient view-model with its own persistence story — under EPIC-028 the editor IS the view-model, and editor state is descriptor state by P6 construction. Rejected (b) keep cache file (separate cache file for a small state payload, contradicting walkthrough 04's unification work); rejected (c) hybrid (adds split-state complexity for no benefit). No mockup change required.

**Amended 2026-05-21 by HS1.** The "fold into `EditorDescriptor.state`" resolution above survives RESTART but NOT in-session editor SWITCHES — the editor instance dies on switch-out and the descriptor is per-instance. Discovered during US-552 implementation when the user noticed Grid columns reset on every Monaco↔Grid toggle. Replacement: Grid view-config folds into `host.editorSettings["grid-json"|"grid-csv"|"grid-jsonl"]` via the new `IContentHost.getEditorState/setEditorState` contract. Rides the host descriptor in `openFiles.txt` (same restart-survival path the descriptor.state plan promised) AND outlives the editor across switches (the host transfers via `CONTENT_HOST_TRAIT.extractContentHost`). `GridEditor.getRestoreData()` collapses to identity-only (title / modified / secondaryEditor); the view-config rides the host slot. Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### GR5 — gridRef `sortColumn` round-trip: how does AVGridModel's sort state sync with editor state?

Today: `gridRef.state.sortColumn` lives on the AVGridModel, not on `vm.state`. saveState reads it via `this.gridRef?.state.get().sortColumn`; restoreState writes it back via `this.gridRef.state.update(s => s.sortColumn = saved)`. View-internal piece, peeked from the model side.

After SF2: GridViewModel dissolves; gridRef lives in `GridBody.tsx` (useRef). GridEditor has no direct access to gridRef.

Three candidates:

(a) **Two-way sync via setGridRef** — When `setGridRef` callback fires on mount, the view (1) writes saved `sortColumn` from editor state into gridRef; (2) subscribes to gridRef's sortColumn slice and forwards changes to editor state. Symmetric.

(b) **queue.execute({type: "getSortColumn"})** — Grid's queue gains a request union with `getSortColumn`. saveState calls `await editor.queue.execute({type: "getSortColumn"})`. Mirrors Monaco's `getSelectedText` pattern.

(c) **gridRef state observable in editor** — Editor holds a `_gridRef: AVGridModel | null` field set by view's setGridRef callback. Editor reads gridRef state directly. Editor knows about view-side ref.

**RESOLVED 2026-05-20** — Option (a) confirmed. Today's saveState reads sortColumn synchronously from gridRef — under EPIC-028 the descriptor read is sync (getRestoreData returns synchronously), so the value has to live on editor state. Two-way sync via setGridRef is the minimal change: view-side useEffect on mount writes saved → gridRef, then subscribes gridRef → editor.state. Both directions handled in one ref callback, one place. Rejected (b) `queue.execute({type:"getSortColumn"})` (requires `getRestoreData` to become async — non-trivial cascade through `PagesPersistenceModel.saveState` and per-page-descriptor save sites); rejected (c) editor-side `_gridRef` field (leaks view-side refs into the editor — breaks the SF2 boundary).

The same pattern applies to `focus.selection.rowEnd/colEnd` (today's save reads from gridRef.state.focus, not vm.state.focus). After the refactor, focus is already on editor.state per today's pattern — no extra sync needed for focus. No mockup change required.

### GR6 — Search / filter state: persist across switchFrom and across restart?

Today: search / filters / focus all persist (saved to grid-page.json). On switch-out the GridViewModel disposes (entire VM dies); the new editor's VM starts fresh with restoreState reloading from cache.

After EPIC-028:

(a) **Persist all three across switchFrom and restart** — search / filters / focus ride `GridEditorState`; switchFrom doesn't carry them (host transfers; editor state is per-editor). Restart re-reads them from descriptor.

(b) **Clear search across switchFrom** — search is a transient UI ask ("find rows matching X"); switching editors loses the search context. Save filters / focus; reset search on switch.

(c) **Clear all three across switchFrom; persist only across restart** — switchFrom is a deliberate user gesture (they want a different view); all UI state resets.

**RESOLVED 2026-05-20** — Option (a) confirmed. switchFrom only carries the host between editors — each editor's own state slice is independent by construction. When user switches Monaco → Grid, the new GridEditor instance is freshly created with `defaultGridEditorState` (search: "", filters: [], focus: undefined). No special "clear across switchFrom" logic needed — the absence of carry-over IS the clear. Restart-side persistence works because `applyRestoreData` writes the saved fields into the new instance's state. This matches today's observable behavior (switching to Grid via the widget gives a fresh Grid view; restarting the app preserves the last Grid session's column widths, etc.). Zero new logic — fall-out of the per-editor-state-slice design. No mockup change required.

**Amended 2026-05-21 by HS1.** The "matches today's observable behavior" claim was incorrect — today's `<host.id>-grid-page.json` cache file IS the cross-switch survival mechanism (writes columns / filters / etc on every change, re-reads on the new GridViewModel's restoreState). The user explicitly noticed the regression during US-552 implementation ("the old grid editor I belive have remembered the column position and width between switch grid <-> monaco"). Under HS1's host-slot mechanism, view-config DOES survive switchFrom: the host outlives the editor across the swap (transfers via `CONTENT_HOST_TRAIT.extractContentHost`); the host's `editorSettings[this.editorId]` map already carries the previous Grid session's columns; the new GridEditor instance reads its slot via `host.getEditorState(this.editorId)` inside `adoptHost` and seeds editor state sync, no flicker. Restart-side survival uses the same path (host descriptor → `openFiles.txt`). Search resets each time the user closes the panel today; if implementer wants the same UX, exclude `search` from the persisted projection — but the default mirror is to persist everything. Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### GR7 — CSV delimiter detection: where does it run?

Today: `detectCsvDelimiter` runs once in `GridViewModel.onInit` (line 76), only when `host.state.get().editor === "grid-csv"`. It reads first 5 lines, picks the highest-count delimiter from `,`/`;`/`\t`/`|`. Writes `state.csvDelimiter`.

After EPIC-028:

(a) **Inside `GridEditor.restore()` after host loads** — variant-aware bootstrap path. Only the `grid-csv` instance enters this branch. If saved `csvDelimiter` is missing or is the default `,` (today's initial value), detect from content.

(b) **Inside `GridBody.tsx` mount effect** — view-side. Reads host content; updates editor state.

(c) **On first `_hostContentUnsub` emission** — generic content-change subscription handles the bootstrap case as a one-off.

**RESOLVED 2026-05-20** — Option (a) confirmed. Detection is a property of the editor + host content; not a view concern. Runs once per restore (when the editor is brand new — instantiated from scratch or from a descriptor with default csvDelimiter). Switch-in from another editor (switchFrom) also runs detection because switchFrom is followed by `restore()` per A7. The "only-if-default" gate prevents overwriting a user-chosen delimiter from the CsvOptions popover (saved via descriptor). Rejected (b) view-side detection (couples a model-state mutation to view lifecycle, double-firing on remount); rejected (c) generic content-change subscription (would re-detect on every content edit when the user types into a cell, clobbering saved choices). No mockup change required.

### GR8 — `error` field: where it lives and how the view displays parse errors

Today: `parseContent` (line 219) sets `state.error` to the parse-error message + stack on failure; `GridEditor.tsx` line 54-56 reads `gridState.error` and renders `<EditorError>{error}</EditorError>` short-circuiting the grid render.

After EPIC-028:

(a) **`state.error: string | undefined` on editor.state; stripped from getRestoreData** — view-derived, ride state for reactive read, but exclude from persistence. View subscribes via `state.use((s) => s.error)`. Identical mechanism to MO5's `hasSelection` resolution.

(b) **Throw inside `reparseRows`; caught by view's error boundary** — error becomes an exception, view-level error boundary catches and renders `<EditorError>`. Removes the field from state entirely.

(c) **Local React state inside `GridBody`** — `useState<string | undefined>` for error; useEffect catches reparseRows return values. View-side only.

**RESOLVED 2026-05-20** — Option (a) confirmed. Today's pattern is correct — the error is editor-derived (the editor knows it tried to parse content and failed); the view just reads and renders. Keeping it on editor.state means the editor's own `parseContent` logic (now a private method on GridEditor) sets the field; the view reads via `state.use`. The "stripped from getRestoreData" pattern is identical to MO5 (`hasSelection`) — view-derived fields ride state for reactivity but don't make it to disk. Rejected (b) throw with error boundary (introduces an error-boundary requirement for what's a normal parse-error case — malformed JSON in a JSON grid is expected; throwing-and-catching for control flow is the wrong shape); rejected (c) view-local React state (duplicates the model-side data into view-side state, requiring an editor → view callback for every parse attempt). No mockup change required.

### GR9 — gridRef survival across switchFrom

Today: GridViewModel disposes when the editor switches. The new editor's VM gets a fresh `gridRef = undefined`, AVGridModel re-instantiates on mount.

After EPIC-028: GridEditor stays alive across `switchFrom` only when switching INTO Grid (it's the new editor); when switching OUT, GridEditor disposes. gridRef is view-local — when GridBody unmounts (switch-out), AVGridModel disposes naturally.

Three sub-questions to verify:

(a) **AVGridModel disposes cleanly on unmount?** — AVGridModel has no `dispose` requirement today; useRef-cleared and the React tree garbage-collects. Unchanged.

(b) **Save sortColumn before unmount?** — Two-way sync (GR5) means editor state always has the latest sortColumn; no special unmount save needed.

(c) **Restore sortColumn cleanly on mount when entering Grid via switchFrom?** — `setGridRef` callback reads `model.state.get().sortColumn` (carried from session-restore or whatever the previous editor instance set) and writes to gridRef state. Same path as cold restore.

**RESOLVED 2026-05-20** — Confirmation. No code change beyond GR5's two-way sync. Switch-in: `GridEditor.restore()` completes, `GridBody` mounts, `setGridRef` fires, sortColumn flows from `editor.state` → gridRef. Switch-out: `GridBody` unmounts, useEffect cleanups run, gridRef nulls, AVGridModel garbage-collects. The two-way sync established in GR5 covers the lifecycle automatically — switch-in / switch-out / cold restore all converge on the same setGridRef-mount path. No mockup change required.

### GR10 — Queue events: do we need anything besides `focus`?

Monaco needs `revealLine` / `highlightText` / `focus` as fire-and-forget events because Monaco-side script callers (`page.asText().revealLine(N)`) need to dispatch to the view from the model side, possibly before the view is mounted.

Grid script API surface (today's GridEditorFacade): columns / rows getters (model-side reads); setColumns / addRows / deleteRows / addColumns / deleteColumns / editCell mutators (model-side writes, view reactively re-renders). No view-only commands. **Except**:

- **focus** — chrome's 200ms root-focus subscription (TC8) needs to grab grid focus. `MonacoQueueEvent.focus` resolved as MO7's reference; Grid does the same.
- **focusCell** — today's restoreState calls `gridRef.models.focus.focusCell(row, col, true)` via setTimeout. Under EPIC-028 this is the same view-side imperative call that needs to fire post-mount on restore. Queue event `{type: "focusCell", row, col}` buffered until view mounts; view's queue handler calls `gridRef.models.focus.focusCell(...)`.

Two candidates:

(a) **`{type:"focus"} | {type:"focusCell", row, col}`** — Two events. focus from chrome; focusCell from restore. Aligns with today's two-place imperative gridRef call pattern.

(b) **focus only; inline focusCell into setGridRef** — When `setGridRef` callback fires on mount (the same callback that does sortColumn sync per GR5), read saved focus from editor state and call `ref.models.focus.focusCell(...)` directly. No queue event needed.

**RESOLVED 2026-05-20** — Option (a) confirmed. Two events. Even though setGridRef CAN handle focusCell on cold mount, `focusCell(row, col)` may also need to fire post-mount (e.g., a script API call `await page.asGrid().focusCell(5, 2)` that needs to dispatch to a possibly-not-yet-mounted view). Queue events handle the buffering. Rejected (b) focus-only with focusCell inlined into setGridRef (special-case for the mount path; breaks on the post-mount script-API path). Keeping both `focus` and `focusCell` in `GridQueueEvent` matches Monaco's `revealLine`/`highlightText` pattern: model-side commands that fire-and-forget into the view.

`GridQueueRequest` stays `never`. All script-API reads go through `editor.state.get()` (sync); no async query path needed (unlike Monaco's `getSelectedText` per MO6). No mockup change required.

---

## Mockup adjustments

**Zero mockup changes proposed.** All ten concerns resolve at the real-code layer or by confirmation of existing template:

- GR1 (a), GR2 (a), GR3 (a), GR4 (a), GR5 (a), GR6 (a), GR7 (a), GR8 (a), GR9 confirmation, GR10 (a) — all editor-internal-state or per-editor view shape; nothing changes the base `EditorModel` shape, the `IContentHost` contract, the `editorRegistry` shape, or the `ComponentQueue` primitive.

The walkthrough 20 template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) carries Grid end-to-end without strain. Tier 5's mockup stability holds: Grid is the first non-Monaco exercise, and it lands zero changes.

---

## Migration scope

Real-code only (carried to implementation):

- **New files**:
  - `src/renderer/editors/grid/GridEditor.ts` — `GridEditor` class + `GridEditorState` + `GridQueueEvent` + `GridQueueRequest` (never) unions + `formatFromEditorId` helper.
  - `src/renderer/editors/grid/GridBody.tsx` — Grid view component (AVGrid + FilterBar + parse-error short-circuit). Replaces today's `GridEditor.tsx`.
  - `src/renderer/editors/grid/GridEditorView.tsx` — Composes `<TextChrome>` + `<GridBody>` + toolbar / footer contributions.

- **Renamed / refactored files**:
  - `GridEditor.tsx` deletes (today's view component) — body content split into `GridBody.tsx`, toolbar bits into `GridEditorView.tsx`.
  - `GridViewModel.ts` deletes — its state + methods absorb into `GridEditor.ts`; its onInit body splits per GR3 between `GridEditor.restore()`, `adoptHost`, and `GridBody.tsx` useEffects.
  - `index.ts` re-exports update — `GridEditor` (the EditorModel) replaces `GridEditor` (the component); `GridViewModel` / `defaultGridViewState` / `createGridViewModel` exports remove.

- **Deleted files** (besides GridViewModel):
  - None other; `utils/grid-utils.ts`, `components/ColumnsOptions.tsx`, `components/CsvOptions.tsx` carry over verbatim (with one signature touch on `showCsvOptions` — now takes `GridEditor` instead of `GridViewModel`; same shape).

- **Edited files**:
  - `src/renderer/editors/register-editors.ts` — three Grid registrations swap factory calls from VM-based to EditorModel-based (e.g., `() => new GridEditor(state, "grid-csv")`).
  - `src/renderer/editors/registry.ts` — already covered by walkthrough 04 / S5 (mode-aware `accepts` predicate); Grid's three `accepts` predicates land here per the sketches above.
  - `src/renderer/scripting/api-wrapper/GridEditorFacade.ts` — flips from wrapping `GridViewModel` to wrapping `GridEditor`. Methods stay sync (Grid has no `queue.execute` requests).
  - `components/CsvOptions.tsx` — `showCsvOptions(anchor, vm)` signature → `showCsvOptions(anchor, editor: GridEditor)`. The popover reads `csvDelimiter` / `csvWithColumns` and calls `setDelimiter` / `toggleWithColumns` — same methods, on the editor instead of the VM.
  - `components/ColumnsOptions.tsx` — `showColumnsOptions(anchor, gridRef, isCsv, onUpdateRows)` signature unchanged. Caller (now `GridToolbarBits` inside `GridEditorView`) reads `gridRef` from view state (via ref-forwarding pattern, or via a per-view `useRef` shared with `GridBody`).

- **Persistence migration**: zero — major version bump per C2 + P2. Old `<host.id>-grid-page.json` files are orphaned on first boot; cleaned by per-editor `fs.deleteCacheFiles(id)` on future dispose.

- **Scripting facade**: `GridEditorFacade` carries the SF1 `force?: boolean` parameter per the walkthrough 12 contract; otherwise mechanical translation.

---

## Closure

All ten concerns RESOLVED 2026-05-20. **Zero mockup changes.**

Final outcomes by concern:

| # | Resolution | Mockup change |
|---|------------|---------------|
| GR1 | (a) — one `GridEditor` class with constructor-bound `editorId` + `format`; three registry factories | none |
| GR2 | (a) — readouts read `this.format` (semantic word, decoupled from registry id) | none |
| GR3 | (a) — `onInit` body splits across `restore()` + `adoptHost` + `GridBody` useEffects; `saveStateDebounced` retires | none |
| GR4 | (a) — fold Grid state into `EditorDescriptor.state`; eliminate `<id>-grid-page.json` cache file | none |
| GR5 | (a) — two-way sortColumn sync via setGridRef callback | none |
| GR6 | (a) — per-editor-state-slice covers it; no carry-over across switchFrom (which IS the clear); restart-only persistence | none |
| GR7 | (a) — CSV delimiter detection inside `GridEditor.restore()` after host content loads | none |
| GR8 | (a) — `state.error` for reactive read; stripped from getRestoreData (MO5 pattern) | none |
| GR9 | confirmation — GR5's two-way sync covers the gridRef lifecycle across switchFrom | none |
| GR10 | (a) — `GridQueueEvent = focus | focusCell`; `GridQueueRequest = never` | none |

**Tier 5 template confirmed on the first non-Monaco editor.** Walkthrough 20 laid out the per-text-bearing-editor template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT); Grid lands all eight pieces without any base-mockup touch. The variant-handling pattern (one class with three registrations via constructor-bound `editorId`) becomes a reusable template for any future "same editor, different format" need.

**Implementation notes carried forward:**
- Grid's `accepts()` sketches use content peeks (`looksLikeJsonArray` / `looksLikeCsv` / `looksLikeJsonl` helpers) plus filename rules — to be finalized in real-code. The mockup `editorRegistry.ts` content-peek contract (line 62-80) already permits this.
- `showCsvOptions(anchor, vm)` → `showCsvOptions(anchor, editor: GridEditor)` signature touch is the one externally-visible change in the existing files; CsvOptions popover reads `csvDelimiter` / `csvWithColumns` and calls `setDelimiter` / `toggleWithColumns` from the editor instead of the VM.
- `<id>-grid-page.json` cache files orphaned by old installs cleaned by per-editor `fs.deleteCacheFiles(id)` on next dispose — no special migration sweep.

Walkthrough 22 (Preview group — Markdown / Svg / Html / Mermaid) is next — exercises the template on the simplest text-bearing editors. Expected to be light on concerns (no AVGrid-equivalent view state to round-trip; no format variants).
