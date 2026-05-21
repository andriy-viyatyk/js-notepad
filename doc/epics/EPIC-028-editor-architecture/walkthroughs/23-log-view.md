# Log View walkthrough

> **Status:** Done 2026-05-20. Tier 5 per-editor walkthrough — Log View. Append-only renderer over JSONL. All ten concerns (LV1–LV10) RESOLVED. **Zero mockup changes** — third template-confirmation walkthrough in a row (after Grid, Preview group). Resolves `acquireViewModelSync("log-view")` retirement at four callsites (3 in `mcp-handler.ts`, 1 in `ScriptContext.ts`); finalizes SF2's machinery removal — `IContentHost.acquireViewModelSync` declaration + `TextEditorModel:74` + `NoteItemEditModel:331` implementations all delete.

Walkthrough 23 finalizes `LogViewEditor` — Log View's `EditorModel` subclass under EPIC-028. Log View is unique in the Tier 5 set so far: it is **append-only** (entries materialize from JSONL lines parsed out of host content) and **interactive** (dialog entries return Promises that resolve when the user clicks a button — the only editor with a model-side Promise-based handshake to the user). It is also the editor whose `acquireViewModelSync` retirement was explicitly flagged across the design: MI4 locks the topology shift, SF2 retires the ref-counting machinery, and this walkthrough applies the consequence per callsite.

---

## State today

`src/renderer/editors/log-view/` is a self-contained folder of 24 files:

| File group | Contents |
|------------|----------|
| Core | `LogViewModel.ts`, `LogViewEditor.tsx`, `LogViewContext.ts`, `logTypes.ts`, `logConstants.ts` |
| Render shell | `LogEntryWrapper.tsx`, `LogEntryContent.tsx`, `LogMessageView.tsx`, `StyledTextView.tsx` |
| Dialog items | `items/ButtonsDialogView.tsx`, `ConfirmDialogView.tsx`, `TextInputDialogView.tsx`, `CheckboxesDialogView.tsx`, `RadioboxesDialogView.tsx`, `SelectDialogView.tsx`, `ButtonsPanel.tsx`, `DialogContainer.tsx`, `DialogHeader.tsx` |
| Output items | `items/ProgressOutputView.tsx`, `GridOutputView.tsx`, `TextOutputView.tsx`, `MarkdownOutputView.tsx`, `MermaidOutputView.tsx`, `McpRequestView.tsx` |

### Today's ViewModel state shape

```typescript
const defaultLogViewState = {
    entries: [] as LogEntry[],
    entryCount: 0,
    error: undefined as string | undefined,
    showTimestamps: false,
    forceScrollVersion: 0,           // bumped to force scroll-to-bottom on dialog add
    itemsState: {} as Record<string, Record<string, any>>,  // per-entry aux state
};
```

### Today's private fields

| Field | Purpose |
|-------|---------|
| `pendingDialogs: Map<id, { resolve }>` | Promise resolvers for unresolved dialog entries (resolved on user click or dispose) |
| `nextId: number` | Auto-incrementing entry id counter |
| `skipNextContentUpdate: boolean` | Self-write guard — set when the VM appends/updates JSONL itself so its own `onContentChanged` doesn't re-parse |
| `lastLineCount: number` | Incremental parsing watermark (parse only newly-appended lines if existing lines unchanged) |
| `heightCache: Map<id, number>` | Cached measured row heights for virtual grid (preserves across model evictions) |
| `dirtyIndices: Set<number>` | Entries with pending JSONL re-serialization (debounced via `flushDirtyDebounced`, 300ms) |

### Today's lifecycle entry points

- `onInit()` — initial parse via `loadContent(content)` + `restoreItemsState()` (async; reads `<host.id>-log-view-items` from host stateStorage).
- `onContentChanged(content)` — incremental re-parse via `loadContentIncremental(content)` guarded by `skipNextContentUpdate`.
- `onDispose()` — cancels pending dialogs (resolves each with sentinel canceled-button entry), clears `dirtyIndices`, persists itemsState via `saveItemsState`.

### Today's content forwarder pattern

JSONL is the canonical persistence — every entry is one line. Append/upsert/update flow:
1. Mutator (`addEntry`, `updateEntryText`, `resolveDialog`, …) mutates the in-memory `entries`.
2. Mutator computes the new JSONL string and sets `skipNextContentUpdate = true`.
3. Mutator calls `host.changeContent(newContent)` — fires `onContentChanged` on the host content subscription.
4. `onContentChanged` sees the skip flag → resets it and returns without re-parsing.

External changes (user edits the JSONL in another editor, file reload, etc.) hit `onContentChanged` without the flag set → `loadContentIncremental` re-parses.

### Today's view-side machinery (`LogViewEditor.tsx`)

- `useContentViewModel<LogViewModel>(model, "log-view")` — ref-counted acquire/release (SF2 target).
- `useSyncExternalStore` over `vm.state` for reactive read.
- `gridModelRef` (RenderGridModel ref), `isAtBottom` (scroll position tracker), `prevEntryCount` (auto-scroll diff), `scrollTimers` (iterative scroll-to-bottom compensator for ResizeObserver-driven height adjustments).
- `scheduleScrollToBottom()` — fires three setTimeout-spaced scrolls (50ms, 150ms, 300ms) to settle after RenderFlexGrid row-height measurements.
- Auto-scroll triggers: entry count increases + currently at bottom → schedule scroll. `state.forceScrollVersion` bumps → schedule scroll (force, regardless of position).
- `LogViewProvider` (React Context) exposes the VM to descendant item views (`LogEntryWrapper`, dialog views, output views).
- Toolbar contributions via `createPortal(..., model.editorToolbarRefLast!)` — clear + toggle-timestamps `IconButton`s.

### Today's facade (`UiFacade.ts`)

```typescript
class UiFacade {
    constructor(private readonly vm: LogViewModel) {}
    log/info/warn/error/success/text(message) → vm.addEntry(...) → StyledLogBuilder
    clear() → vm.clear()
    dialog.{confirm, buttons, textInput, checkboxes, radioboxes, select}(...) → vm.addDialogEntry(...) → Promise<LogEntry>
    show.{progress, grid, text, markdown, mermaid}(...) → vm.addEntry(...) → wrapper class
    addConsoleEntry(type, text) → vm.addEntry(type, text)  // installed console forwarding
}
```

### Today's registration (`register-editors.ts:177-210`)

```typescript
editorRegistry.register({
    id: "log-view",
    name: "Log View",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => /\.log\.jsonl$/i.test(fileName) ? 20 : -1,
    validForLanguage: (languageId) => languageId === "jsonl",
    switchOption: (languageId, fileName) =>
        languageId === "jsonl" && fileName && /\.log\.jsonl$/i.test(fileName) ? 10 : -1,
    isEditorContent: (languageId, content) =>
        languageId === "jsonl" && /"type"\s*:\s*"log\./.test(content),
    loadModule: async () => {
        const [module, { createLogViewModel }] = await Promise.all([
            import("./log-view/LogViewEditor"),
            import("./log-view/LogViewModel"),
        ]);
        return { Editor: module.LogViewEditor, createViewModel: createLogViewModel, ... };
    },
});
```

### Today's `acquireViewModelSync("log-view")` callsites

Four callsites in two files:

| File | Line | Function | Purpose |
|------|------|----------|---------|
| `mcp-handler.ts` | 221 | `getOrCreateMcpLogViewModel` | MCP's `ui_push` handler — find/create well-known `mcp-ui-log` page, sync-acquire VM for direct `addEntry` calls |
| `mcp-handler.ts` | 256 | `logIncomingRequest` | Pushes one `output.mcp-request` entry to the live request log page (if open) |
| `mcp-handler.ts` | 267 | `showMcpRequestLog` | Opens / focuses the MCP server request log page, backfills history if empty |
| `ScriptContext.ts` | 249 | `executeUiOnPage` | Builds the script's `ui` global — creates/finds the script's log page, sync-acquires VM, wraps with UiFacade |

Plus the async pre-load: `ScriptRunner.ts:108` calls `await editorRegistry.loadViewModelFactory("log-view")` before each script run so the four sync-acquires above can succeed.

### Today's well-known page registrations

Two well-known pages with `editor: "log-view"`:
- `mcp-ui-log` (id) — "MCP Log.log.jsonl" title — used by `ui_push` for AI-agent-driven UI output
- `mcp-server-log` (id) — "MCP Server Log.log.jsonl" title — used for MCP request/response history

---

## State after refactor

`LogViewEditor` is the page's `mainEditor` under EPIC-028 (LV1 — direct, not a content-view atop TextFileModel). The class HAS a `TextFileModel` as its `IContentHost`, same shape as Monaco / Grid / Markdown / Mermaid. The `acquireViewModelSync` retirement (MI4 + SF2) flips four callsites from VM-acquire to direct `editor instanceof LogViewEditor` checks.

### Class sketch

```typescript
class LogViewEditor extends EditorModel<LogViewEditorState, void, LogQueueEvent> {
    readonly editorId = "log-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;

    // Append-only mechanics (today's private fields, all preserved):
    private pendingDialogs = new Map<string, { resolve: (result: LogEntry) => void }>();
    private nextId = 1;
    private skipNextContentUpdate = false;
    private lastLineCount = 0;
    private heightCache = new Map<string, number>();
    private dirtyIndices = new Set<number>();
    private readonly stateName = "log-view-items";

    constructor(state: TComponentState<LogViewEditorState>) {
        super(state);
        this.traits.set(CONTENT_HOST_TRAIT, {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from LogViewEditor");
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

    // ── Persistence (LV2) ──────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            ...super.getRestoreData(),
            state: {
                id: s.id,
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
                showTimestamps: s.showTimestamps,
                itemsState: s.itemsState,          // LV3 — fold into descriptor
                // View-derived (stripped):
                //   entries, entryCount, error  — all recomputed from host content on restore
            },
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<LogViewEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined)            cur.title = data.title;
            if (data.modified !== undefined)         cur.modified = data.modified;
            if (data.secondaryEditor !== undefined)  cur.secondaryEditor = data.secondaryEditor;
            if (data.showTimestamps !== undefined)   cur.showTimestamps = data.showTimestamps;
            if (data.itemsState !== undefined)       cur.itemsState = data.itemsState;
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
            this.loadContent(this._host.state.get().content || "");  // LV4 — initial parse
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Log View editor.", "error");
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
        // LV4 + LV6 — host content subscription drives incremental re-parse,
        // guarded by skipNextContentUpdate for self-writes.
        this._hostContentUnsub = host.state.subscribe(
            (s) => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.loadContentIncremental(s.content);
            },
            (s) => s.content,
        );
        const { filePath, title } = host.state.get() as any;
        if (title || filePath) {
            this.state.update((s) => {
                s.title = title ?? (filePath ? fpBasename(filePath) : "");
            });
        }
    }

    // ── JSONL parse/serialize (LV4) — verbatim from today's LogViewModel ──────

    private loadContent(content: string): void { /* ... same as today */ }
    private loadContentIncremental(content: string): void { /* ... same as today */ }
    private appendToContent(entry: LogEntry): void { /* ... same as today */ }
    private updateEntryInContent(entry: LogEntry): void { /* ... same as today */ }
    private flushDirtyDebounced = debounce(() => { /* ... same as today */ }, 300);

    // ── Entry mutators (LV7 — UiFacade contract preserved) ─────────────

    addEntry(type: string, fields: any): LogEntry { /* ... same as today */ }

    addDialogEntry(type: string, fields: Record<string, any>): Promise<LogEntry> {
        const entry = this.addEntry(type, fields);
        this.queue.send({ type: "scrollToBottom" });   // LV5 — replaces forceScrollVersion bump
        return new Promise<LogEntry>((resolve) => {
            this.pendingDialogs.set(entry.id, { resolve });
        });
    }

    resolveDialog(id: string, button: string): void { /* ... same as today */ }
    updateEntryText(id: string, text: any): void { /* ... same as today */ }
    updateEntryAt(index: number, updater: (draft: LogEntry) => void): void { /* ... */ }
    updateEntryById(id: string, updater: (draft: LogEntry) => void): void { /* ... */ }
    clear = (): void => { /* ... same as today */ };
    toggleTimestamps = (): void => {
        this.state.update((s) => { s.showTimestamps = !s.showTimestamps; });
    };

    // ── Per-item aux state (LV3) ───────────────────────────────────────

    getItemState(id: string): Record<string, any> {
        return this.state.get().itemsState[id] ?? {};
    }
    setItemState(id: string, patch: Record<string, any>): void {
        this.state.update((s) => {
            s.itemsState[id] = { ...s.itemsState[id], ...patch };
        });
        // No saveItemsStateDebounced — itemsState lives in descriptor (LV3);
        // the window-level 500ms debounce per P3 covers persistence.
    }

    // ── Height cache (view virtualization) ─────────────────────────────

    getEntryHeight(id: string): number | undefined { return this.heightCache.get(id); }
    setEntryHeight(id: string, h: number): void { this.heightCache.set(id, h); }

    isDialogPending(id: string): boolean { return this.pendingDialogs.has(id); }
    get entryCount(): number { return this.state.get().entryCount; }

    // ── Optional overrides ─────────────────────────────────────────────

    focus(): void { this.queue.send({ type: "focus" }); }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // LV7 — cancel pending dialogs (preserved from today's onDispose)
        for (const [id, { resolve }] of this.pendingDialogs.entries()) {
            resolve({ type: "", id, timestamp: 0 });
        }
        this.pendingDialogs.clear();
        this.dirtyIndices.clear();

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

### State slice shape (LV2)

```typescript
interface LogViewEditorState extends EditorStateBase {
    // Persisted:
    showTimestamps: boolean;                                  // user toggle, sticky
    itemsState: Record<string, Record<string, any>>;          // per-entry aux state (LV3)
    // View-derived — ride state for reactivity, stripped from getRestoreData (MO5/GR8 pattern):
    entries: LogEntry[];
    entryCount: number;
    error: string | undefined;
}
```

Notable: `forceScrollVersion` retires per LV5 — replaced by `LogQueueEvent.scrollToBottom`. View subscribes via `queue.use` and calls `scheduleScrollToBottom()`.

### Queue event union (LV8)

```typescript
type LogQueueEvent =
    | { type: "focus" }                  // MO7 — chrome's root-focus follows
    | { type: "scrollToBottom" };        // LV5 — replaces forceScrollVersion

// Queue request: never  (LV9 — all UiFacade reads are sync against editor.state)
```

---

## UI shape

```typescript
function LogViewEditorView({ model }: { model: LogViewEditor }) {
    return (
        <TextChrome
            model={model}
            toolbarContributions={<LogToolbarBits model={model} />}
        >
            <LogBody model={model} />
        </TextChrome>
    );
}

function LogBody({ model }: { model: LogViewEditor }) {
    const gridModelRef = useRef<RenderGridModel | null>(null);
    const isAtBottom = useRef(true);
    const prevEntryCount = useRef(0);
    const scrollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const state = model.state.use((s) => ({
        entries: s.entries,
        entryCount: s.entryCount,
        error: s.error,
        showTimestamps: s.showTimestamps,
    }));

    // LV5 — queue-driven scroll-to-bottom (replaces forceScrollVersion useEffect)
    model.queue.use((ev) => {
        if (ev.type === "focus") {
            gridModelRef.current?.containerRef?.current?.focus();
        } else if (ev.type === "scrollToBottom") {
            scheduleScrollToBottom();
        }
    });

    // ... handleScroll / scheduleScrollToBottom / auto-scroll-on-entry-count-grow
    //     all preserved verbatim from today's LogViewEditor.tsx body.

    if (state.error) return <EditorError>{state.error}</EditorError>;
    if (state.entryCount === 0) {
        return (
            <Panel name="log-view-placeholder" flex={1} align="center" justify="center">
                <Text size="base" color="light">No log entries</Text>
            </Panel>
        );
    }

    return (
        <LogViewProvider value={model}>
            <Panel name="log-view-root" direction="column" flex={1} overflow="hidden">
                <RenderFlexGrid
                    ref={setGridModel}
                    columnCount={2}
                    rowCount={state.entryCount}
                    columnWidth={getColumnWidth}
                    renderCell={renderLogEntry}
                    fitToWidth
                    minRowHeight={18}
                    getInitialRowHeight={getInitialRowHeight}
                    preferMinHeightForNewRows
                />
            </Panel>
        </LogViewProvider>
    );
}

function LogToolbarBits({ model }: { model: LogViewEditor }) {
    return (
        <>
            <IconButton
                name="log-clear"
                size="sm"
                icon={<ClearIcon />}
                title="Clear log"
                onClick={async () => {
                    const result = await showConfirmationDialog({ message: "Clear all log entries?" });
                    if (result === "Yes") model.clear();
                }}
            />
            <IconButton
                name="log-toggle-timestamps"
                size="sm"
                icon={<TimestampIcon active={model.state.use((s) => s.showTimestamps)} />}
                title={...}
                onClick={model.toggleTimestamps}
            />
        </>
    );
}
```

`LogViewProvider` (React Context) now exposes `LogViewEditor` (not `LogViewModel`); descendant item views (`LogEntryWrapper`, `ConfirmDialogView`, …) flip their `useContext` calls from `LogViewModel` to `LogViewEditor`. API surface preserved (`addEntry`, `addDialogEntry`, `updateEntryText`, `resolveDialog`, `getItemState`, `setItemState`, `getEntryHeight`, `setEntryHeight`, `isDialogPending`, `clear`) per LV9 / MI6.

### `accepts()` (registry) — LV10

```typescript
accepts({ host, fileName, language }): number {
    if (fileName && /\.log\.jsonl$/i.test(fileName)) return 70;  // strong filename match
    if (language === "jsonl" && host) {
        const content = host.state.get().content;
        if (/"type"\s*:\s*"log\./.test(content)) return 60;       // content-peek fallback
    }
    return -1;
}
```

Replaces today's `acceptFile` (filename) + `switchOption` (language + filename) + `isEditorContent` (language + content peek) trio with the single `accepts` predicate per registry mockup. Mode-agnostic.

---

## Switch in / out

- **Switch in via `switchFrom(oldEditor)`** — trait closure extracts host; id copied; storage rebound; `adoptHost` subscribes content + descriptorChanged forwarders; **and** `restore()` follow-up calls `loadContent(host.state.get().content)` to populate `entries` against the inherited content. Same shape as Grid's GR7 CSV-detect-on-switch.
- **Switch out** — trait closure unsubscribes forwarders, returns host. Editor disposes; pending dialogs cancel (resolve with sentinel); queue drains; host transfers intact. Dialog Promises held by script code resolve immediately with `{ type: "", id, timestamp: 0 }` — script's `await ui.dialog.confirm(...)` returns the sentinel and continues (canceled-button semantic preserved from today).
- **No special variant detection on switch-in** — Log View is single-variant (one registry id).

---

## Lifecycle hooks

| Hook | LogViewEditor |
|------|---------------|
| `applyRestoreData` | ✅ — `showTimestamps`, `itemsState` |
| `switchFrom` | ✅ same shape as Grid / preview group |
| `restore` | ✅ — host load + initial JSONL parse via `loadContent` |
| `saveState` | ✅ — delegate `host.io.saveState()` |
| `beforeNavigateAway` | ❌ inherit |
| `onMainEditorChanged` | ❌ inherit |
| `confirmRelease` | ✅ — delegate host |
| `isFreshEmpty` | ❌ inherit (false) |
| `getNavigatorTarget` | ✅ — host's `{pipe, filePath}` |
| `hasTextSelection?` | ❌ inherit (undefined) |
| `findCompatibleEditors` | ✅ — `findEditorsAccepting(host)` |
| `getRestoreData` | ✅ — strip view-derived (entries / entryCount / error) |
| `getIcon` / `noLanguage` | ❌ inherit |
| `focus` | ✅ — send `{ type: "focus" }` |
| `dispose` | ✅ — cancel pendingDialogs + unsubscribe + host dispose |

---

## Persistence

### `getRestoreData()` output

```typescript
{
    editorId: "log-view",
    id: "<uuid>",
    state: {
        title, modified, secondaryEditor,
        showTimestamps,
        itemsState: { "5": { columns: [...] }, "12": { focus: { row: 3, col: 1 } } },
    },
    host: {
        kind: "textFile",
        state: { id, content: "", language: "jsonl", filePath, modified, encoding, encrypted, temp },
        pipe: { provider, transformers, encoding },
    },
}
```

Note: `content` lives in the host descriptor's state slice as the cache-keyed reference (P4); the actual JSONL bytes stay in the per-editor cache file (`<editor.id>-host.txt`) per M9's invariant.

### `itemsState` size envelope (LV3)

Realistic distribution:
- Typical script log: 10–100 entries, most with no aux state. Total: <1KB.
- Heavy MCP request log: 200 entries (capped — see `MAX_REQUEST_LOG_ENTRIES`), all dialog-resolved. Total: a few KB.
- Worst plausible: 1000+ entries with rich per-grid column state. Total: ~50KB.

The worst case approaches but does not exceed M9's ~50KB per-page metadata budget. Folding `itemsState` into `EditorDescriptor.state` matches Grid's GR4 decision and unifies the persistence story. The dedicated `<host.id>-log-view-items.json` cache file (today's path via `host.stateStorage.setState`) retires.

### Migration from today's format

Per C2: no migration shim. Today's session data with `editor: "log-view"` and `type: "textFile"` hits walkthrough 04 / P2's detect-and-skip path on first boot post-upgrade. The two well-known log pages (`mcp-ui-log`, `mcp-server-log`) re-create empty via `requireWellKnownPage` per EW3 on next access; their `<id>-host.txt` cache files survive across the upgrade since editor id continues to be `log-view` per M5/EW3.

The orphaned `<old-host-id>-log-view-items.json` cache files left behind by today's `saveItemsState` get collected by per-editor dispose (`fs.deleteCacheFiles(editor.id)` — today's path) when the page eventually closes; for well-known pages that never close, they linger harmlessly per P9's no-sweep decision.

---

## Scripting

### `UiFacade` shape after refactor (LV9)

```typescript
class UiFacade {
    constructor(private readonly editor: LogViewEditor) {}

    // Logging — unchanged API surface (MI6 confirmation)
    log/info/warn/error/success/text(message) → editor.addEntry(...) → StyledLogBuilder
    clear() → editor.clear()
    addConsoleEntry(type, text) → editor.addEntry(type, text)

    // Dialogs — unchanged Promise<LogEntry> contract (MI7 confirmation)
    readonly dialog = {
        confirm(...) → editor.addDialogEntry("input.confirm", ...) → Promise<LogEntry>,
        // ... buttons, textInput, checkboxes, radioboxes, select
    };

    // Output — unchanged wrapper classes
    readonly show = {
        progress(...) → new Progress(entry.id, editor, fields),
        grid(...) → new Grid(entry.id, editor, fields),
        // ... text, markdown, mermaid
    };
}
```

The wrapper helpers (`StyledLogBuilder`, `Progress`, `Grid`, `Text`, `Markdown`, `Mermaid`) flip their constructor argument from `LogViewModel` to `LogViewEditor` — pure type rename; method calls (`updateEntryText`, `updateEntryById`) preserved.

### `executeUiOnPage` after refactor (LV9)

```typescript
async function executeUiOnPage(   // <-- now async per EW2's lifecycle
    page: PageWrapper | undefined,
    outputFlags: ScriptOutputFlags,
    isMcp = false,
): Promise<{ facade: UiFacade; pageId: string }> {
    let logEditor: EditorModel;
    let logPageId: string;
    let isExisting = false;

    if (isMcp) {
        const existing = pagesModel.findPage("mcp-ui-log");
        if (existing?.mainEditor) {
            logEditor = existing.mainEditor;
            logPageId = existing.id;
            isExisting = true;
        } else {
            const newPage = await pagesModel.addEditorPage("log-view", "jsonl", "MCP Log");
            logEditor = newPage.mainEditor!;
            logPageId = newPage.id;
        }
    } else if (page) {
        const pageId = page.page?.id ?? page.id;
        const grouped = pagesModel.getGroupedPage(pageId);
        if (grouped?.mainEditor instanceof LogViewEditor) {   // <-- replaces state.editor === "log-view"
            logEditor = grouped.mainEditor;
            logPageId = grouped.id;
            isExisting = true;
        } else {
            const newPage = await pagesModel.addEditorPage("log-view", "jsonl", formatLogTitle());
            logEditor = newPage.mainEditor!;
            logPageId = newPage.id;
            pagesModel.groupTabs(pageId, logPageId, false);
        }
    } else {
        const newPage = await pagesModel.addEditorPage("log-view", "jsonl", formatLogTitle());
        logEditor = newPage.mainEditor!;
        logPageId = newPage.id;
    }

    if (!(logEditor instanceof LogViewEditor)) {              // <-- replaces isTextFileModel check
        throw new Error("Log view page is not a LogViewEditor. This is an internal error.");
    }

    // <-- acquireViewModelSync + releaseList push retire entirely (SF2)

    outputFlags.groupedContentWritten = true;
    if (isExisting) logEditor.addEntry("log.info", "");
    if (isMcp) logEditor.addEntry("log.info", "Agent started script");
    else logEditor.addEntry("log.info", `Script ${page?.title ?? "untitled"} started`);

    return { facade: new UiFacade(logEditor), pageId: logPageId };
}
```

### `prepareViewModel("log-view")` retirement

`ScriptRunner.ts:108` drops the `await editorRegistry.loadViewModelFactory("log-view")` line — under EPIC-028 there is no separate "view model factory" to pre-load. Module load happens via `editorRegistry.createEditor("log-view")` inside `addEditorPage`'s lifecycle path per EW2. No async-pre-load step needed because the script can `await pagesModel.addEditorPage(...)` directly.

### MCP handler callsites after refactor (MI4 applied)

Three callsites in `mcp-handler.ts`:

```typescript
// getOrCreateMcpLogViewModel (renamed → getOrCreateMcpLogViewEditor)
async function getOrCreateMcpLogViewEditor(): Promise<LogViewEditor> {
    const page = await pagesModel.requireWellKnownPage(MCP_UI_LOG_ID);
    const editor = page.mainEditor;
    if (!(editor instanceof LogViewEditor)) {                  // <-- replaces isTextFileModel + acquire
        throw new Error("MCP log page is not a LogViewEditor");
    }
    return editor;
}

// logIncomingRequest — inline check
const logPage = pagesModel.findPage("mcp-server-log");
const logEditor = logPage?.mainEditor;
if (logEditor instanceof LogViewEditor) {                      // <-- replaces isTextFileModel + acquire
    logEditor.addEntry("output.mcp-request", requestHistory[requestHistory.length - 1]);
}

// showMcpRequestLog — same flip
const page = await pagesModel.requireWellKnownPage("mcp-server-log");
const editor = page.mainEditor;
if (!(editor instanceof LogViewEditor)) return;
if (editor.entryCount === 0 && requestHistory.length > 0) {
    for (const entry of requestHistory) editor.addEntry("output.mcp-request", entry);
}
```

MI4's "no helper" decision holds — three sites in one file, all single-class predicate, under the GK2/T2 helper-threshold (which paid off at 15 callsites across two files).

---

## Concerns

### LV1 — Class topology: direct `LogViewEditor` (with TextFileModel host) or content-view on top of TextFileModel?

Today: TextFileModel IS the page's `mainEditor`; LogViewModel is a `ContentViewModel<LogViewState>` acquired via `acquireViewModelSync` over the host.

Under EPIC-028 the `acquireViewModelSync` machinery retires (SF2). MI4 already locked: "under EPIC-028 the log-view page's `mainEditor` is the LogView editor itself, never a TextFileModel."

Three readings of MI4:

(a) **`LogViewEditor` IS the page's mainEditor; HAS a `TextFileModel` content host.** Same shape as Monaco / Grid / Markdown / Mermaid. CONTENT_HOST_TRAIT exposed. Switch-to-Monaco works (view raw JSONL). File / pipe / save-restore machinery delegated to host.

(b) **`LogViewEditor` IS the page's mainEditor; owns the file directly (no IContentHost).** No CONTENT_HOST_TRAIT. File path, content, pipe owned directly by LogViewEditor. Switch-to-Monaco impossible.

(c) **Hybrid — LogViewEditor IS the page's mainEditor but does not expose CONTENT_HOST_TRAIT, even though it holds a TextFileModel internally.** Internal-only host. Switch-to-Monaco impossible; raw-edit accessed via "Open as text" menu action only.

**RESOLVED 2026-05-20** — Option (a) confirmed. `LogViewEditor` IS the mainEditor; has TextFileModel host with CONTENT_HOST_TRAIT exposed. Three reasons:
1. **Uniformity with Tier 5** — Monaco / Grid / Markdown / Mermaid all share the "editor + TextFileModel host" pattern. Log View is the fifth instance; making it a no-host outlier (b) is a YAGNI carve-out.
2. **Switch-to-Monaco is meaningful** — `.log.jsonl` files are JSONL text; users may want to view/edit raw JSONL (e.g., to delete a corrupted entry by hand, copy-paste a request body). Today the file IS a text file underneath; (b) breaks that affordance for no benefit.
3. **Persistence / pipe / encoding / save-restore reuse** — TextFileModel's machinery (P4 pipe descriptor, M9 cache file pattern, walkthrough 04's HostDescriptor shape) all apply naturally under (a). Reimplementing them inside LogViewEditor under (b) duplicates ~200 LOC of host machinery.

Rejected (b) own-the-file-directly — duplicates host machinery; breaks switch-to-Monaco for negligible gain. Rejected (c) internal-only host — adds an opaque branch without observable user benefit; CONTENT_HOST_TRAIT is the natural exposure point for `findCompatibleEditors`. No mockup change required.

### LV2 — State slice partitioning: which fields persist, which ride state for reactivity, which become private?

Today's `LogViewState` has six fields; the editor has six private fields. Under EPIC-028 each lands in one of three layers:

(a) **Persist via `getRestoreData`**: `showTimestamps`, `itemsState` (LV3).
**Ride state for reactivity, strip from descriptor** (MO5/GR8 pattern): `entries`, `entryCount`, `error` — all recomputable from host content on restore. `forceScrollVersion` retires per LV5.
**Stay private (non-state)**: `pendingDialogs`, `nextId`, `skipNextContentUpdate`, `lastLineCount`, `heightCache`, `dirtyIndices` — bookkeeping, no observer needs.

(b) **Persist everything that's non-derived**: same as (a) plus persist `nextId` (so id sequence stays monotonic across restart). Today `nextId` is recomputed by scanning the entries on `loadContent` (max-id + 1), so persistence is redundant — but explicit persistence would save one scan pass.

(c) **Persist nothing user-facing** — drop `showTimestamps` to a global setting. Same form as PV6's option (c). Rejected for the same reasons (per-editor user preference is meaningful; over-globalization).

**RESOLVED 2026-05-20** — Option (a) confirmed. Only `showTimestamps` and `itemsState` persist. `nextId` recomputed on load (today's pattern is correct; adding persistence saves one O(n) pass once per page open — invisible). `entries / entryCount / error` are derived from host content; restoring the host re-derives them. `forceScrollVersion` retires per LV5. The six private fields (pendingDialogs / nextId / skipNextContentUpdate / lastLineCount / heightCache / dirtyIndices) stay private.

Rejected (b) persist `nextId` — redundant with recomputation; data duplication that can drift if the JSONL is edited externally between sessions (today's scan handles externally-edited content correctly). Rejected (c) global `showTimestamps` — over-globalization; per-page user preference is meaningful. No mockup change required.

**Amended 2026-05-22 by US-553 investigation** — only `showTimestamps` persists (via HS1 host slot per the amended LV3); `itemsState` is NOT persisted. `itemsState` stays on `editor.state` for in-session reactivity but does not survive switch-out OR restart. Rationale: `itemsState` scales with entry count (a heavy log page can carry thousands of entries); riding the host slot would bloat `openFiles0.json` (per-window state file, rewritten on 500ms debounce on any editor mutation) and write-storm under rapid `setItemState` (column-width ResizeObserver propagation, etc.). Today's behavior preserves itemsState via a separate `<host.id>-log-view-items.json` cache file; the regression is accepted because the dominant use case (MCP well-known logs) is one-shot session-scoped. If a future use case demands cross-restart preservation, the right shape is a dedicated cache file (not the host slot). Implementation pinned by `doc/tasks/US-553-log-view-migration/README.md`.

### LV3 — `itemsState` persistence shape: fold into descriptor or keep separate cache file?

Today: `<host.id>-log-view-items.json` written via `host.stateStorage.setState(host.id, "log-view-items", JSON.stringify(itemsState))`. Debounced 500ms. Reads on `onInit` via `restoreItemsState`.

Under EPIC-028 with EditorDescriptor.state riding the per-window descriptor save (P3 — folds per-page cache into WindowState; P6 — RestoreData<S> shape):

(a) **Fold into `EditorDescriptor.state.itemsState`**. Mirrors Grid's GR4 decision. Eliminates the dedicated cache file. Single source of truth: editor state → descriptor; host content → cache file. Window-level 500ms debounce per P3 covers persistence cadence (matches today's 500ms).

(b) **Keep separate cache file `<editor.id>-log-view-items.json`**. Preserves today's pattern. Lower IPC footprint (M9) — itemsState stays out of the cross-window drag payload. Editor-private; aligns with C9's "editor-specific state files" intent.

(c) **Hybrid: fold a size cap; spill to cache file above the cap**. Over-engineered.

**RESOLVED 2026-05-20** — Option (a) confirmed. Fold into `EditorDescriptor.state`. Three reasons:
1. **Mirrors Grid GR4** — Grid's per-editor cache file was ~3KB worst case, folded into descriptor without IPC concern. Log View's `itemsState` is comparable in typical usage (<1KB) and approaches but does not exceed ~50KB worst plausible (the 200-cap on `MAX_REQUEST_LOG_ENTRIES` bounds the MCP server log; typical script logs run 10–100 entries with mostly-empty aux state).
2. **Unifies persistence** — editor state on descriptor; host content on cache file. No third bucket of per-editor-state cache files to track.
3. **IPC drag transfer naturally atomic** — today's separate cache file means a cross-window drag has to either pre-save or risk losing itemsState; folding makes the drag payload self-contained.

Rejected (b) separate cache file — duplicates the today-pattern that GR4 eliminated for similar reasons. Rejected (c) hybrid — premature optimization; nothing observed argues for the cap. Second instance of the "per-editor cache file → descriptor.state" consolidation pattern (Grid GR4 → Log View LV3). No mockup change required.

**Amended 2026-05-21 by HS1.** `itemsState` folds into `host.editorSettings["log-view"]`, not `EditorDescriptor.state`. LogView pages (well-known mcp-ui-log) rarely switch in practice — but the canonical pattern applies for uniformity with the other Tier 5 editors. Same window-level 500ms debounce; same drag-atomicity guarantee (host descriptor is the same payload). Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

**Amended 2026-05-22 by US-553 investigation — supersedes both prior resolutions.** `itemsState` is NOT persisted: neither in `EditorDescriptor.state` (original resolution) nor in `host.editorSettings` (HS1 amendment). It stays on `editor.state` for in-session reactivity only; resets on switch-out AND restart. Rationale: `itemsState` scales linearly with log entry count — heavy log pages carry hundreds-to-thousands of entries. Riding the host slot means the blob lands in `openFiles0.json` (per-window state file rewritten on 500ms debounce on every editor mutation). Rapid `setItemState` calls (column-width ResizeObserver propagation across many entries, script-API mutation loops) would write-storm the file, and `openFiles0.json` is read eagerly at window boot to render the tab strip. The 50KB-per-page metadata budget estimate was correct in theory but ignored the write-rate angle. User explicitly flagged this during US-553 investigation. Trade-off accepted: customized column orderings on `output.grid` entries reset on restart — acceptable because the dominant LogView use is MCP one-shot sessions. If a future use case demands persistence, the right shape is a dedicated cache file (`<editor.id>-log-view-items.json` via `editor.stateStorage`) — not the host slot. Implementation pinned by `doc/tasks/US-553-log-view-migration/README.md`. See also memory `feedback-hs1-size-considerations`.

### LV4 — JSONL parse/serialize lifecycle hooks under EPIC-028

Today's `LogViewModel` lifecycle:
- `onInit` — `loadContent(host.content)` + async `restoreItemsState()`
- `onContentChanged(content)` — `loadContentIncremental(content)` with skip guard
- `onDispose` — cancel pendingDialogs + clear dirtyIndices + `saveItemsState`

Under EPIC-028 / SF2:

(a) **Hook split into three sites:**
- `restore()` — calls `loadContent` (replaces `onInit`'s initial parse); `itemsState` arrives via `applyRestoreData` per LV3 (no separate restore step).
- `adoptHost` content subscription — calls `loadContentIncremental` with `skipNextContentUpdate` guard (replaces `onContentChanged`).
- `dispose()` — cancels pendingDialogs (preserved per LV7); no separate `saveItemsState` (per LV3 the descriptor save covers it).

(b) **Use a single editor-level method for both initial and incremental** — `restore` calls `loadContent` (full parse); content subscription also calls `loadContent` (not `loadContentIncremental`). Drops the incremental fast-path.

(c) **Defer parse until first read** — lazy parse, populated when view first reads entries. Avoids the synchronous parse cost on restore.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three sites as described. Mechanical fall-out from SF2 + LV3. Preserves today's incremental parse fast-path (avoids re-parsing the entire JSONL on every appendEntry — the incremental path detects "only new tail lines" and parses just those). Rejected (b) drop incremental — performance regression for large logs (1000+ entries). Rejected (c) lazy parse — adds complexity; eager parse on restore matches today's behavior, no observed cost issue. No mockup change required.

### LV5 — `forceScrollVersion` retirement: state-counter bump or queue event?

Today: `forceScrollVersion: number` on state, bumped by `addDialogEntry` to force scroll-to-bottom regardless of current scroll position. View's useEffect on `state.forceScrollVersion` fires `scheduleScrollToBottom()`.

Under EPIC-028 the queue mechanism is the natural shape for model→view fire-and-forget commands (S4 / B1 baseline; MO4 `revealLine` / `highlightText`; GR10 `focusCell`).

(a) **Replace with `LogQueueEvent.scrollToBottom`**. View's `queue.use` handler drains and calls `scheduleScrollToBottom()`. `forceScrollVersion` state field deletes.

(b) **Keep `forceScrollVersion` on state**. Cheaper migration; no queue-handler change in view.

(c) **Direct method call** — view passes a ref-callback to editor (`editor.setScrollToBottomCallback(fn)`); editor invokes directly. Tightly couples editor to view ref.

**RESOLVED 2026-05-20** — Option (a) confirmed. Replace with `LogQueueEvent.scrollToBottom` queue event. Three reasons:
1. **Same shape as MO4 / GR10** — both replaced state-counter-bump patterns with queue events. Log View follows the same pattern for cross-editor consistency.
2. **Queue's mailbox semantics handle mount timing** — if `addDialogEntry` fires before the view mounts (e.g., script runs faster than React render), the event buffers per ComponentQueue's design (`mockups/ComponentQueue.ts`). The state-counter approach also handles this (useEffect on state-change fires post-mount), but the queue is the explicit-intent expression.
3. **Removes a "state field that exists only to bump" smell** — `forceScrollVersion` is a counter never read for its value, only for its change. Queue events express "send this command" directly.

Rejected (b) keep state counter — works but inconsistent with MO4 / GR10 pattern. Rejected (c) direct ref callback — couples editor to view-side ref lifecycle; queue avoids it. Third instance of "state counter bump → queue event" pattern (MO4 revealLine, GR10 focusCell, LV5 scrollToBottom). No mockup change required.

### LV6 — `skipNextContentUpdate` flag under host subscription

Today's mechanism: editor's mutators (`addEntry`, `updateEntryText`, …) compute the new JSONL string, set `skipNextContentUpdate = true`, then call `host.changeContent(newContent)`. The host's content subscription fires `onContentChanged(content)`; the editor reads + resets the flag and returns without re-parsing.

Under EPIC-028 the host content subscription is set up in `adoptHost` (LV4). Same race exists: editor write → host.changeContent → subscription fires → if not guarded, editor re-parses what it just wrote.

(a) **Keep `skipNextContentUpdate` flag**. Verbatim port of today's mechanism.

(b) **Pass a `bySelf: boolean` flag to `host.changeContent(content, bySelf)`**. Host content subscription receives the flag; editor's subscription handler skips when `bySelf === true`. Avoids the editor-side mutable flag.

(c) **Use a TOneState selector to subscribe only to external content changes** — selector returns `s.content` but only when `s.lastChangeReason !== "log-view-self-write"`. Requires `TextFileModel` to track change-reason per write.

**RESOLVED 2026-05-20** — Option (a) confirmed. Keep `skipNextContentUpdate` editor-private flag. Two reasons:
1. **Today's pattern works** — the flag is editor-private, the race is editor-internal (no other consumer needs to know about "self-write"). Adding a host-side parameter (b) leaks the concern into TextFileModel's API for one consumer (LogViewEditor).
2. **Host-level change-reason tracking is over-engineered** — (c) requires TextFileModel to gain a `lastChangeReason` field that no other editor needs. The flag pattern is local, contained, and matches today's semantics.

Rejected (b) host-side bySelf flag — leaks editor concern into host API. Rejected (c) change-reason tracking — over-engineered for one consumer. No mockup change required.

### LV7 — Pending dialogs cancellation on dispose

Today's `onDispose` (LogViewModel.ts:73-77) iterates `pendingDialogs` and resolves each with `{ type: "", id, timestamp: 0 }` (sentinel canceled-button entry), then clears the map. Script-side `await ui.dialog.confirm(...)` resolves with the sentinel; script continues per "canceled button = empty string" convention.

MI7 already confirmed: today's logic carries verbatim to `LogViewEditor.dispose()`. Worth re-confirming under the per-editor walkthrough because:
- `dispose()` fires on page-close AND on switch-out (LogView → Monaco). Switch-out cancels pendingDialogs the same way page-close does. Is that intended? Yes — script's dialog Promise resolves; if the user manually switched the page to Monaco while a script was awaiting a dialog, the script must continue (the dialog UI is now gone).
- Persistence: on a clean app shutdown, pendingDialogs cancellation runs as part of dispose. Restored pages on next boot show resolved-button-undefined entries in JSONL (today's behavior — dialog entries without `button` set are restored as "still pending" by `addDialogEntry`'s parser, but `pendingDialogs` map is reconstructed empty because no Promise callers exist after restart). This means a restored log page DOES NOT re-create Promise resolvers for previously-pending dialogs. Today's behavior — preserved.

(a) **Verbatim port** — `dispose()` cancels all pendingDialogs as sentinel resolves.

(b) **Distinguish page-close vs. switch-out** — switch-out preserves pendingDialogs (re-attaches if user switches back). Adds complexity; no compelling user request.

(c) **Reject Promise on dispose instead of resolving with sentinel** — changes script-side semantics (`try / catch` instead of "check entry.button"). Breaks today's API.

**RESOLVED 2026-05-20** — Option (a) confirmed. Verbatim port. MI7 already confirmed this for the MCP layer; LV7's role is to surface the page-close-vs-switch-out subtlety under per-editor scope and re-confirm — both dispose paths (page-close AND switch-out) cancel pending dialogs uniformly via the same sentinel resolve. Script's `await ui.dialog.confirm(...)` returns the sentinel `{ type: "", id, timestamp: 0 }` and continues (canceled-button semantic preserved from today).

Rejected (b) preserve across switch-out — switch-out is a deliberate user gesture; the contract "switching destroys the editor state" is uniform across Tier 5. Rejected (c) reject Promise — breaks today's script-side API (every dialog caller would need try/catch). No mockup change required.

### LV8 — Queue event union: `focus` + `scrollToBottom` only, or additional events?

Per LV5 the natural events are:
- `{ type: "focus" }` — MO7 / chrome's root-focus follows
- `{ type: "scrollToBottom" }` — replaces `forceScrollVersion`

Candidate additional events:

- `{ type: "scrollToEntry"; id: string }` — script API "scroll to a specific entry" (e.g., `await page.asLog().scrollToEntry(entry.id)`). No current consumer.
- `{ type: "showDialog"; id: string }` — bring a specific dialog into view. No current consumer.
- `{ type: "highlightEntry"; id: string }` — flash an entry for attention. No current consumer.

Queue request union (`LogQueueRequest`):
- All `UiFacade` reads (e.g., `editor.entryCount`, `editor.isDialogPending(id)`, `editor.getItemState(id)`) are sync against editor state. No async view-context query needed.

Three candidates:

(a) **Minimal: `focus` + `scrollToBottom` only; request = `never`**.

(b) **Add `scrollToEntry` proactively** for future script API.

(c) **Add `scrollToEntry` + `highlightEntry`** for both.

**RESOLVED 2026-05-20** — Option (a) confirmed. Minimal: `LogQueueEvent = { type: "focus" } | { type: "scrollToBottom" }`; queue request = `never`. The `scrollToEntry` / `highlightEntry` events have zero current consumers. Adding them now is the speculative-scaffolding pattern PV7 / PV8 rejected (YAGNI). When a real use case lands (e.g., "I want my script to scroll the log to where the error was logged"), add the event then.

Rejected (b) and (c) — premature scaffolding. No mockup change required.

### LV9 — UiFacade ownership under SF2 + `prepareViewModel("log-view")` retirement

Today's flow:
1. `ScriptRunner.ts:108`: `await editorRegistry.loadViewModelFactory("log-view")` — pre-load module so sync acquire works.
2. `ScriptContext.ts:208-269`: `executeUiOnPage` finds/creates log page (sync — today's `addEditorPage` is sync).
3. `ScriptContext.ts:249`: `editor.acquireViewModelSync("log-view") as LogViewModel` — sync VM acquire.
4. `ScriptContext.ts:253`: `releaseList.push(() => editor.releaseViewModel("log-view"))` — script-teardown cleanup.
5. UiFacade wraps the VM.

Under EPIC-028:

(a) **Direct EditorModel wrap; full machinery retires.** `loadViewModelFactory` line deletes (ScriptRunner). `acquireViewModelSync` call retires (SF2 + MI4). `releaseList.push` retires (SF2 — ref-counting gone). `executeUiOnPage` becomes async (EW2 makes `addEditorPage` async). UiFacade wraps `LogViewEditor` directly. The `prepareViewModel("log-view")` step at the IContentHost interface (`IContentHost.ts:59`) and the corresponding `acquireViewModelSync` declaration also retire as part of SF2's broader cleanup.

(b) **Keep async pre-load step** — `await editorRegistry.preloadEditorModule("log-view")` even though there's no separate VM-factory anymore. Speeds up the first `addEditorPage` call (avoids dynamic import latency on the await).

(c) **Move UiFacade construction back to ScriptRunner** — `ScriptRunner` constructs the facade after pre-creating the log page; `ScriptContext` receives it pre-built. Refactor of the construction site; same end shape.

**RESOLVED 2026-05-20** — Option (a) confirmed. Full retirement of the pre-load and ref-counting machinery. Three reasons:
1. **SF2 already pinned the design** — `acquireViewModelSync` / `releaseViewModel` / `useContentViewModel` retire across the codebase. Log View is the last consumer; LV9 applies the consequence per callsite (3 in mcp-handler + 1 in ScriptContext).
2. **`addEditorPage` async transition is mechanical** — EW2 already specifies the async shape. `executeUiOnPage` adopts it cleanly with a single `await` per `addEditorPage` call.
3. **`prepareViewModel` step is no longer meaningful** — under EPIC-028 the editor module loads via `editorRegistry.createEditor("log-view")` inside `addEditorPage`'s lifecycle; the dynamic import happens once per page creation, not once per script run. The pre-load step was a workaround for the sync-VM-acquire constraint that retires.

This walkthrough is the FINAL retirement step for `acquireViewModelSync` machinery — `IContentHost.acquireViewModelSync` declaration at `IContentHost.ts:56` + implementations on `TextEditorModel.ts:74` + `NoteItemEditModel.ts:331` all delete as part of LV9's migration. SF2's machinery fully retires across the codebase.

Rejected (b) keep async pre-load — pre-loading a module for a path that no longer needs sync construction is dead overhead. Rejected (c) move construction site — refactor for no observable benefit. No mockup change required.

### LV10 — `accepts()` predicate: filename + content-peek under registry mockup

Today three predicates: `acceptFile` (filename), `validForLanguage` + `switchOption` (language), `isEditorContent` (content match). Under EPIC-028 the registry mockup collapses all to a single `accepts({host, fileName, language, mode}): number` per S5.

Candidate shapes:

(a) **Filename-strong, content-peek fallback:**
```typescript
accepts({ host, fileName, language }): number {
    if (fileName && /\.log\.jsonl$/i.test(fileName)) return 70;
    if (language === "jsonl" && host) {
        const content = host.state.get().content;
        if (/"type"\s*:\s*"log\./.test(content)) return 60;
    }
    return -1;
}
```

(b) **Filename-only** — drop the content-peek. Files outside the `.log.jsonl` extension can't be detected as logs.

(c) **Content-peek-strong** — content match scores higher than filename. Inverted from today.

**RESOLVED 2026-05-20** — Option (a) confirmed. Filename + content-peek. Mirrors today's behavior: filename `.log.jsonl` is the strong signal (priority 70 — equivalent to today's `acceptFile: 20` against the registry's matching-tier hierarchy, but the absolute number is calibrated to the new walkthrough 22 / 21 / 20 priorities); content-peek covers the case where a `.jsonl` file (without the `.log` prefix) was generated by a script and happens to contain log entries (today's `isEditorContent` path — drives the switch widget option for such files). Mode-agnostic (no special edit vs. view mode handling).

Rejected (b) filename-only — drops today's switch-widget visibility for content-matching `.jsonl` files. Rejected (c) content-peek-strong — file-name-is-authoritative is the more intuitive default; users who name a file `.log.jsonl` intend it as a log. No mockup change required.

---

## Mockup adjustments

**Zero mockup changes proposed.** All ten concerns resolve at the real-code layer:

- LV1 (a), LV2 (a), LV3 (a), LV4 (a), LV5 (a), LV6 (a), LV7 (a), LV8 (a), LV9 (a), LV10 (a) — all editor-internal-state, lifecycle relocation, queue event addition (already covered by S4 / B1), facade rewiring (already covered by SF2 / MI4), or `accepts()` shape (already covered by S5 + the registry mockup's `accepts` contract).

The walkthrough 20 / 21 / 22 template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) carries Log View end-to-end. Tier 5 template stability holds across an editor with **unique characteristics** (append-only, Promise-based dialog handshake, JSONL self-write loop).

---

## Migration scope

Real-code only (carried to implementation):

- **New files** (two):
  - `src/renderer/editors/log-view/LogViewEditor.ts` — `LogViewEditor` class + `LogViewEditorState` + `LogQueueEvent`. (Note name collision with today's `LogViewEditor.tsx` — see "Renamed" below.)
  - `src/renderer/editors/log-view/LogViewEditorView.tsx` — view shell: `<TextChrome>` + `<LogBody>` + `<LogToolbarBits>`.

- **Renamed / refactored files**:
  - `LogViewModel.ts` deletes — state + setters + private fields + JSONL parse/serialize + entry mutators all absorb into `LogViewEditor.ts`.
  - Today's `LogViewEditor.tsx` renames to `LogBody.tsx` — absorbs today's `useContentViewModel` + `useSyncExternalStore` + auto-scroll machinery + virtual grid render. Drops the portal-based toolbar (relocated to `<LogToolbarBits>` inside `LogViewEditorView.tsx` per walkthrough 09 / 10).
  - `LogViewContext.ts` — `LogViewProvider` / `useLogViewModel` rename internal type from `LogViewModel` to `LogViewEditor`. Hook stays the same name (consumer-facing).
  - `LogEntryWrapper.tsx`, `LogMessageView.tsx`, `LogEntryContent.tsx`, `StyledTextView.tsx`, all `items/*.tsx` files — carry over verbatim with `useLogViewModel()` returning `LogViewEditor` instead of `LogViewModel`. Method calls preserved per MI6 confirmation.
  - `logTypes.ts`, `logConstants.ts` — verbatim.

- **Deleted files**:
  - `LogViewModel.ts`.
  - `editors/base/ContentViewModel.ts`, `ContentViewModelHost.ts`, `useContentViewModel.ts` already retired by walkthrough 20.

- **Edited files**:
  - `src/renderer/editors/register-editors.ts` — `log-view` registration swaps from VM-based to EditorModel-based: `() => new LogViewEditor(state)`. Drops `acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent` in favor of single `accepts()` per LV10.
  - `src/renderer/editors/registry.ts` — `LogView.accepts` predicate landed per LV10 sketch.
  - `src/renderer/scripting/api-wrapper/UiFacade.ts` — constructor accepts `LogViewEditor` (was `LogViewModel`); all method bodies preserved per MI6 (`this.vm.X` → `this.editor.X`).
  - `src/renderer/scripting/api-wrapper/StyledTextBuilder.ts`, `Progress.ts`, `Grid.ts`, `Text.ts`, `Markdown.ts`, `Mermaid.ts` — constructor type renames (`LogViewModel` → `LogViewEditor`); method calls preserved.
  - `src/renderer/scripting/ScriptContext.ts` — `executeUiOnPage` becomes async (EW2); drops `acquireViewModelSync` + `releaseList.push` per LV9; `instanceof LogViewEditor` replaces `state.editor === "log-view"` and `isTextFileModel` predicates.
  - `src/renderer/scripting/ScriptRunner.ts` — drops `await editorRegistry.loadViewModelFactory("log-view")` line per LV9.
  - `src/renderer/api/mcp-handler.ts` — three callsites flip from `editor.acquireViewModelSync("log-view") as LogViewModel` to `editor instanceof LogViewEditor` per MI4. `getOrCreateMcpLogViewModel` renames to `getOrCreateMcpLogViewEditor`.
  - `src/renderer/editors/base/IContentHost.ts` — `acquireViewModelSync` declaration removed (final retirement step under SF2; LV9 is the last consumer).
  - `src/renderer/editors/text/TextEditorModel.ts` — `acquireViewModelSync` implementation removed alongside the host-level retirement.
  - `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` — `acquireViewModelSync` implementation removed (also touched by walkthrough 29).
  - `api/types/log-view-editor.d.ts` — new declaration file for the script-API surface (`page.asLog(force?)`); identical shape to other text-bearing editor declarations.

- **Persistence migration**: zero per C2 + P2. Today's `<host.id>-log-view-items.json` cache files become orphaned on first boot post-upgrade; cleaned by per-editor `fs.deleteCacheFiles(editor.id)` on future dispose; for well-known pages that never close, they linger harmlessly per P9.

- **Touch on shared components**: none. `RenderFlexGrid` carries over; `ConfirmationDialog` carries over; `IconButton` / `Panel` / `Text` from UIKit unchanged.

---

## Closure

All ten concerns RESOLVED 2026-05-20. **Zero mockup changes.**

Final outcomes by concern:

| # | Resolution | Mockup change |
|---|------------|---------------|
| LV1 | (a) — `LogViewEditor` IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT (uniform with Monaco / Grid / Markdown / Mermaid) | none |
| LV2 | (a) — persist `showTimestamps` + `itemsState` only; `entries / entryCount / error` ride state stripped; 6 private fields stay private; `forceScrollVersion` retires per LV5 | none |
| LV3 | (a) — fold `itemsState` into `EditorDescriptor.state` (mirrors Grid GR4); dedicated cache file eliminated | none |
| LV4 | (a) — three-site split: `restore()` initial parse + `adoptHost` content subscription + `dispose()` cancel | none |
| LV5 | (a) — replace `forceScrollVersion` with `LogQueueEvent.scrollToBottom` queue event | none |
| LV6 | (a) — keep `skipNextContentUpdate` editor-private flag (today's pattern) | none |
| LV7 | (a) — verbatim port of today's pendingDialogs cancellation on dispose (page-close + switch-out cancel uniformly) | none |
| LV8 | (a) — minimal queue: `{type: "focus"} \| {type: "scrollToBottom"}`; request = `never` | none |
| LV9 | (a) — full retirement of `acquireViewModelSync` machinery + `prepareViewModel("log-view")` pre-load step; SF2 finalizes | none |
| LV10 | (a) — filename `.log.jsonl` priority 70 + content-peek `"type"\s*:\s*"log\."` priority 60 fallback; mode-agnostic | none |

**Tier 5 template confirmed on the most divergent editor yet.** Walkthroughs 20 / 21 / 22 set the template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) on complex (Monaco) → medium (Grid) → light (Preview) editors; this walkthrough confirms it carries cleanly on an **append-only Promise-based** editor — a topologically different shape from every prior Tier 5 entry. The eight-piece template slots cleanly without strain. The pattern is stable across an even broader axis than walkthrough 22 anticipated.

**Final cross-walkthrough cleanups landed by LV9:**
- `IContentHost.acquireViewModelSync` declaration removed (`IContentHost.ts:56`) — final consumer (LogView) retired.
- `TextEditorModel.acquireViewModelSync` implementation removed (`TextEditorModel.ts:74`).
- `NoteItemEditModel.acquireViewModelSync` implementation removed (`NoteItemEditModel.ts:331`) — also touched by walkthrough 29.
- `editorRegistry.loadViewModelFactory("log-view")` async pre-load line removed from `ScriptRunner.ts:108`.
- SF2's machinery fully retires across the codebase as of this walkthrough — `ContentViewModelHost` / `useContentViewModel` were already deleted by walkthrough 20; the IContentHost-side declaration + the four `acquireViewModelSync` callsites in the consumer layer disappear here.

**Implementation notes carried forward:**
- The Tier 5 class repetition count grows to five editors with the same ~80-LOC skeleton (Monaco / Grid / Markdown / Mermaid / LogView all carry an identical CONTENT_HOST_TRAIT closure + adoptHost + switchFrom + restore + dispose shape). PV1's "re-evaluate after walkthroughs 23–29" recommendation continues to apply — one more data point in the "common surface might be extractable" direction, but the actual call still belongs after all text-bearing editors land.
- LogView's class name finalizes as `LogViewEditor` (not the MI4 placeholder `LogViewEditorModel`) — matches `MonacoEditor` / `GridEditor` / `MarkdownEditor` naming. Today's `LogViewEditor.tsx` React component file renames to `LogBody.tsx` per the Tier 5 template (consistent with `MarkdownBody.tsx`, `GridBody.tsx`, `SvgBody.tsx`, `MermaidBody.tsx`).
- The JSONL self-write loop's `skipNextContentUpdate` flag is the most editor-specific mechanism in EPIC-028 so far — every other editor either reads host content as ground truth (Monaco / Grid / preview group) or doesn't write to it (read-only views). LogView's bidirectional dance (editor mutates entries → serializes to JSONL → writes to host → subscription would re-parse if not guarded) is unique to append-only editors. Worth preserving the today-pattern verbatim per LV6 — no equivalent precedent to draw on from other editors.
- `pendingDialogs` cancellation on dispose (LV7) is the only model-side Promise lifecycle in Tier 5. The today's sentinel-resolve approach (`{ type: "", id, timestamp: 0 }` returned from dispose) preserves the script-side `await ui.dialog.confirm(...)` contract uniformly across page-close, editor-switch, and app-shutdown scenarios. Future editors that want similar Promise-based interactions can adopt the same shape.

**Walkthrough 24 (Link) is next** — first sidebar-owning editor in Tier 5; introduces `beforeNavigateAway` / `onMainEditorChanged` lifecycle hook exercise (deferred from walkthrough 03); resolves today's "demote survives as secondary" bug.
